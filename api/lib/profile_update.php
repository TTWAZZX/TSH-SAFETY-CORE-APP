<?php
declare(strict_types=1);

function profile_update_execute(
    object $connection,
    string $employeeId,
    array $payload,
    array $options = []
): array {
    profile_assert_payload($payload);
    $resolveStatus = $options['resolveStatus'] ?? static fn(object $pdo, string $id): string => onboarding_resolve_employee($pdo, $id);
    $transactionStarted = false;

    try {
        $connection->beginTransaction();
        $transactionStarted = true;
        $driver = method_exists($connection, 'getAttribute')
            ? (string)$connection->getAttribute(PDO::ATTR_DRIVER_NAME)
            : 'mysql';
        $lockSuffix = strtolower($driver) === 'mysql' ? ' FOR UPDATE' : '';
        $statement = $connection->prepare(
            'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword '
            . 'FROM employees WHERE EmployeeID=? LIMIT 1' . $lockSuffix
        );
        $statement->execute([$employeeId]);
        $employee = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$employee) {
            throw new ProfileValidationException('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
        }

        try {
            $departments = $connection->query('SELECT id,Name FROM master_departments ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $units = $connection->query(
                'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'
            )->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $positions = $connection->query('SELECT id,Name FROM master_positions ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Throwable $error) {
            throw new ProfileValidationException(
                'PROFILE_VALIDATION_UNAVAILABLE',
                'Profile master data is unavailable.',
                503,
                $error
            );
        }

        $validation = profile_validate_update($employee, $payload, [
            'departments' => $departments,
            'units' => $units,
            'positions' => $positions,
        ]);
        if (count($validation['changedFields']) > 0) {
            $assignments = implode(',', array_map(static fn(string $field): string => $field . '=?', $validation['changedFields']));
            $values = array_map(
                static fn(string $field) => $validation['profile'][$field],
                $validation['changedFields']
            );
            $values[] = (string)$employee['EmployeeID'];
            $update = $connection->prepare('UPDATE employees SET ' . $assignments . ' WHERE EmployeeID=?');
            $update->execute($values);
        }

        try {
            $status = $resolveStatus($connection, (string)$employee['EmployeeID']);
        } catch (Throwable $error) {
            throw new ProfileValidationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                $error
            );
        }
        if (!in_array($status, [ONBOARDING_READY, ONBOARDING_SAFETY_UNIT_REQUIRED], true)
            || $status !== $validation['expectedOnboardingStatus']) {
            throw new ProfileValidationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }

        $profileSql = 'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword '
            . 'FROM employees WHERE EmployeeID=? LIMIT 1';
        $freshStatement = $connection->prepare($profileSql);
        $freshStatement->execute([(string)$employee['EmployeeID']]);
        $freshEmployee = $freshStatement->fetch(PDO::FETCH_ASSOC);
        if (!$freshEmployee) {
            throw new ProfileValidationException('PROFILE_VALIDATION_UNAVAILABLE', 'Updated profile is unavailable.', 503);
        }
        $connection->commit();
        $transactionStarted = false;

        $postCommitStatement = $connection->prepare($profileSql);
        $postCommitStatement->execute([(string)$employee['EmployeeID']]);
        $postCommitEmployee = $postCommitStatement->fetch(PDO::FETCH_ASSOC);
        if (!$postCommitEmployee) {
            throw new ProfileValidationException('PROFILE_VALIDATION_UNAVAILABLE', 'Updated profile is unavailable.', 503);
        }
        return [
            'status' => $status,
            'nextAction' => $status === ONBOARDING_SAFETY_UNIT_REQUIRED ? 'SELECT_SAFETY_UNIT' : 'ENTER_APP',
            'employee' => $postCommitEmployee,
            'changedFields' => $validation['changedFields'],
            'idempotent' => count($validation['changedFields']) === 0,
            'allowedFields' => PROFILE_ALLOWED_FIELDS,
        ];
    } catch (Throwable $error) {
        if ($transactionStarted) {
            try {
                $connection->rollBack();
            } catch (Throwable $rollbackError) {
                // Preserve the original error.
            }
        }
        if ($error instanceof ProfileValidationException) throw $error;
        throw new ProfileValidationException(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Profile validation is unavailable.',
            503,
            $error
        );
    }
}
