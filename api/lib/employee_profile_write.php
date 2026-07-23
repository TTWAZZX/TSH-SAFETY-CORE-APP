<?php
declare(strict_types=1);

const CROSS_PATH_CREATE = 'create';
const CROSS_PATH_UPDATE = 'update';
const CROSS_PATH_UPSERT = 'upsert';
const CROSS_PATH_PROTECTED_FIELDS = ['Team', 'CompanyEmail', 'Role', 'Password', 'MustChangePassword'];

function crosspath_load_profile_masters(object $connection): array
{
    try {
        return [
            'departments' => $connection->query('SELECT id,Name FROM master_departments ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) ?: [],
            'units' => $connection->query(
                'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [],
            'positions' => $connection->query('SELECT id,Name FROM master_positions ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) ?: [],
        ];
    } catch (Throwable $error) {
        throw new ProfileValidationException(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Profile master data is unavailable.',
            503,
            $error
        );
    }
}

function crosspath_validate_protected_fields(array $protectedFields): void
{
    foreach (array_keys($protectedFields) as $field) {
        if (!in_array($field, CROSS_PATH_PROTECTED_FIELDS, true)) {
            throw new ProfileValidationException(
                'PROFILE_FIELD_NOT_ALLOWED',
                'One or more protected fields are not allowed.',
                403
            );
        }
    }
}

function crosspath_insert_values(
    string $employeeId,
    array $profile,
    array $protectedFields
): array {
    return array_merge([
        'EmployeeID' => $employeeId,
        'EmployeeName' => $profile['EmployeeName'],
        'Department' => $profile['Department'],
        'Unit' => $profile['Unit'],
        'Position' => $profile['Position'],
        'Team' => '',
        'CompanyEmail' => null,
        'Role' => 'User',
        'Password' => null,
        'MustChangePassword' => 0,
    ], $protectedFields);
}

function crosspath_write_employee_profile_in_transaction(
    object $connection,
    string $operation,
    string $employeeId,
    array $profilePayload,
    array $protectedFields = [],
    array $options = []
): array {
    if (!in_array($operation, [CROSS_PATH_CREATE, CROSS_PATH_UPDATE, CROSS_PATH_UPSERT], true)) {
        throw new InvalidArgumentException('Cross-path profile write operation is invalid.');
    }
    crosspath_validate_protected_fields($protectedFields);
    $employeeId = trim($employeeId);
    if ($employeeId === '') {
        throw new ProfileValidationException('INVALID_EMPLOYEE_ID', 'Employee ID is required.', 400);
    }

    $driver = method_exists($connection, 'getAttribute')
        ? strtolower((string)$connection->getAttribute(PDO::ATTR_DRIVER_NAME))
        : 'mysql';
    $lockSuffix = $driver === 'mysql' ? ' FOR UPDATE' : '';
    $statement = $connection->prepare(
        'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword '
        . 'FROM employees WHERE EmployeeID=? LIMIT 1' . $lockSuffix
    );
    $statement->execute([$employeeId]);
    $current = $statement->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($operation === CROSS_PATH_CREATE && $current) {
        throw new ProfileValidationException('EMPLOYEE_ALREADY_EXISTS', 'Employee ID already exists.', 409);
    }
    if ($operation === CROSS_PATH_UPDATE && !$current) {
        throw new ProfileValidationException('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
    }

    $willInsert = $operation === CROSS_PATH_CREATE || ($operation === CROSS_PATH_UPSERT && !$current);
    $base = $current ?: crosspath_insert_values($employeeId, [
        'EmployeeName' => '', 'Department' => '', 'Unit' => '', 'Position' => '',
    ], $protectedFields);
    $masters = crosspath_load_profile_masters($connection);
    $validation = profile_validate_cross_path_candidate(
        $base,
        $profilePayload,
        $masters,
        !$willInsert && $operation === CROSS_PATH_UPDATE
    );

    $changedProtectedFields = [];
    if ($willInsert) {
        $insert = crosspath_insert_values($employeeId, $validation['profile'], $protectedFields);
        try {
            $statement = $connection->prepare(
                'INSERT INTO employees '
                . '(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword) '
                . 'VALUES(?,?,?,?,?,?,?,?,?,?)'
            );
            $statement->execute([
                $insert['EmployeeID'], $insert['EmployeeName'], $insert['Department'], $insert['Unit'],
                $insert['Team'], $insert['Position'], $insert['CompanyEmail'], $insert['Role'],
                $insert['Password'], $insert['MustChangePassword'],
            ]);
        } catch (Throwable $error) {
            if ((string)$error->getCode() === '23000') {
                throw new ProfileValidationException(
                    'EMPLOYEE_ALREADY_EXISTS',
                    'Employee ID already exists.',
                    409,
                    $error
                );
            }
            throw $error;
        }
        $changedProtectedFields = array_keys($protectedFields);
    } else {
        foreach ($protectedFields as $field => $value) {
            if ((string)($current[$field] ?? '') !== (string)($value ?? '')) {
                $changedProtectedFields[] = $field;
            }
        }
        $fields = array_merge($validation['changedFields'], $changedProtectedFields);
        if (count($fields) > 0) {
            $assignments = implode(',', array_map(static fn(string $field): string => $field . '=?', $fields));
            $values = [];
            foreach ($fields as $field) {
                $values[] = in_array($field, PROFILE_ALLOWED_FIELDS, true)
                    ? $validation['profile'][$field]
                    : $protectedFields[$field];
            }
            $values[] = (string)$current['EmployeeID'];
            $statement = $connection->prepare('UPDATE employees SET ' . $assignments . ' WHERE EmployeeID=?');
            $statement->execute($values);
        }
    }

    $resolveStatus = $options['resolveStatus']
        ?? static fn(object $pdo, string $id): string => onboarding_resolve_employee($pdo, $id);
    try {
        $status = $resolveStatus($connection, $employeeId);
    } catch (Throwable $error) {
        throw new ProfileValidationException(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            $error
        );
    }
    $validStatuses = [
        ONBOARDING_PASSWORD_CHANGE_REQUIRED,
        ONBOARDING_SAFETY_UNIT_REQUIRED,
        ONBOARDING_READY,
    ];
    if (!in_array($status, $validStatuses, true)
        || $status !== $validation['expectedOnboardingStatus']) {
        throw new ProfileValidationException(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503
        );
    }

    $statement = $connection->prepare(
        'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,MustChangePassword '
        . 'FROM employees WHERE EmployeeID=? LIMIT 1'
    );
    $statement->execute([$employeeId]);
    $fresh = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$fresh) {
        throw new ProfileValidationException(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Employee profile is unavailable.',
            503
        );
    }
    return [
        'employee' => $fresh,
        'status' => $status,
        'nextAction' => $status === ONBOARDING_PASSWORD_CHANGE_REQUIRED ? 'CHANGE_PASSWORD'
            : ($status === ONBOARDING_SAFETY_UNIT_REQUIRED ? 'SELECT_SAFETY_UNIT' : 'ENTER_APP'),
        'inserted' => $willInsert,
        'idempotent' => !$willInsert
            && count($validation['changedFields']) === 0
            && count($changedProtectedFields) === 0,
        'changedFields' => array_merge($validation['changedFields'], $changedProtectedFields),
    ];
}

function crosspath_execute_employee_profile_write(
    object $connection,
    string $operation,
    string $employeeId,
    array $profilePayload,
    array $protectedFields = [],
    array $options = []
): array {
    $transactionStarted = false;
    try {
        $connection->beginTransaction();
        $transactionStarted = true;
        $result = crosspath_write_employee_profile_in_transaction(
            $connection,
            $operation,
            $employeeId,
            $profilePayload,
            $protectedFields,
            $options
        );
        $connection->commit();
        $transactionStarted = false;
        return $result;
    } catch (Throwable $error) {
        if ($transactionStarted && method_exists($connection, 'inTransaction') && $connection->inTransaction()) {
            try {
                $connection->rollBack();
            } catch (Throwable $rollbackError) {
                // Preserve the original failure.
            }
        }
        if ($error instanceof ProfileValidationException) throw $error;
        throw new ProfileValidationException(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Employee profile write is unavailable.',
            503,
            $error
        );
    }
}
