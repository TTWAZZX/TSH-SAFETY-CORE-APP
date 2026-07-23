<?php
declare(strict_types=1);

final class SafetyUnitContinuationException extends RuntimeException
{
    public string $reason;
    public int $httpStatus;

    public function __construct(string $reason, string $message, int $httpStatus, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
        $this->reason = $reason;
        $this->httpStatus = $httpStatus;
    }
}

function safety_unit_load_selection(object $connection, array $employee, string $requestedUnit): array
{
    try {
        $departments = $connection->query('SELECT id,Name FROM master_departments ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $units = $connection->query(
            'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $masterIndex = onboarding_build_master_index(['departments' => $departments, 'units' => $units]);
        $departmentKey = onboarding_normalize_name($employee['Department'] ?? '');
        $departmentId = $masterIndex['departmentsByName'][$departmentKey] ?? null;
        if ($departmentId === null) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }
        $departmentUnits = $masterIndex['unitsByDepartmentId'][(string)$departmentId] ?? null;
        if (!is_array($departmentUnits) || count($departmentUnits) === 0) {
            return ['hasSafetyUnits' => false, 'canonicalUnit' => null];
        }
        $requestedKey = onboarding_normalize_name($requestedUnit);
        $canonicalUnit = null;
        foreach ($units as $unit) {
            if ((string)($unit['department_id'] ?? '') === (string)$departmentId
                && onboarding_normalize_name($unit['name'] ?? $unit['Name'] ?? '') === $requestedKey) {
                $canonicalUnit = (string)($unit['name'] ?? $unit['Name']);
                break;
            }
        }
        return ['hasSafetyUnits' => true, 'canonicalUnit' => $canonicalUnit];
    } catch (SafetyUnitContinuationException $error) {
        throw $error;
    } catch (Throwable $error) {
        throw new SafetyUnitContinuationException(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            $error
        );
    }
}

function safety_unit_continuation_execute(
    object $connection,
    string $employeeId,
    string $requestedUnit,
    array $options = []
): array {
    if (onboarding_normalize_name($requestedUnit) === '') {
        throw new SafetyUnitContinuationException('SAFETY_UNIT_VALUE_REQUIRED', 'Safety Unit is required.', 400);
    }
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
            throw new SafetyUnitContinuationException('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
        }

        try {
            $initialStatus = $resolveStatus($connection, (string)$employee['EmployeeID']);
        } catch (Throwable $error) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                $error
            );
        }
        if ($initialStatus === ONBOARDING_PASSWORD_CHANGE_REQUIRED) {
            throw new SafetyUnitContinuationException(
                ONBOARDING_PASSWORD_CHANGE_REQUIRED,
                'Password change is required before selecting a Safety Unit.',
                428
            );
        }

        $selection = safety_unit_load_selection($connection, $employee, $requestedUnit);
        if ($initialStatus === ONBOARDING_READY) {
            if (!$selection['hasSafetyUnits']) {
                throw new SafetyUnitContinuationException(
                    'SAFETY_UNIT_NOT_REQUIRED',
                    'This department does not require a Safety Unit.',
                    409
                );
            }
            $sameUnit = $selection['canonicalUnit'] !== null
                && onboarding_normalize_name($employee['Unit'] ?? '') === onboarding_normalize_name($selection['canonicalUnit']);
            if (!$sameUnit) {
                throw new SafetyUnitContinuationException(
                    'ONBOARDING_ALREADY_COMPLETED',
                    'Safety Unit onboarding has already been completed.',
                    409
                );
            }
            $freshStatement = $connection->prepare(
                'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword '
                . 'FROM employees WHERE EmployeeID=? LIMIT 1'
            );
            $freshStatement->execute([(string)$employee['EmployeeID']]);
            $freshEmployee = $freshStatement->fetch(PDO::FETCH_ASSOC);
            if (!$freshEmployee) {
                throw new SafetyUnitContinuationException(
                    'ONBOARDING_STATE_UNAVAILABLE',
                    'Unable to verify onboarding state.',
                    503
                );
            }
            $connection->commit();
            $transactionStarted = false;
            $postCommitStatement = $connection->prepare(
                'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword '
                . 'FROM employees WHERE EmployeeID=? LIMIT 1'
            );
            $postCommitStatement->execute([(string)$employee['EmployeeID']]);
            $postCommitEmployee = $postCommitStatement->fetch(PDO::FETCH_ASSOC);
            if (!$postCommitEmployee) {
                throw new SafetyUnitContinuationException(
                    'ONBOARDING_STATE_UNAVAILABLE',
                    'Unable to load the updated employee profile.',
                    503
                );
            }
            return [
                'status' => ONBOARDING_READY,
                'nextAction' => 'ENTER_APP',
                'employee' => $postCommitEmployee,
                'idempotent' => true,
            ];
        }

        if ($initialStatus !== ONBOARDING_SAFETY_UNIT_REQUIRED) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }
        if (!$selection['hasSafetyUnits']) {
            throw new SafetyUnitContinuationException(
                'SAFETY_UNIT_NOT_REQUIRED',
                'This department does not require a Safety Unit.',
                409
            );
        }
        if ($selection['canonicalUnit'] === null) {
            throw new SafetyUnitContinuationException(
                'INVALID_SAFETY_UNIT',
                'Safety Unit is not allowed for this department.',
                422
            );
        }

        $update = $connection->prepare('UPDATE employees SET Unit=? WHERE EmployeeID=?');
        $update->execute([$selection['canonicalUnit'], (string)$employee['EmployeeID']]);

        try {
            $finalStatus = $resolveStatus($connection, (string)$employee['EmployeeID']);
        } catch (Throwable $error) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                $error
            );
        }
        if ($finalStatus !== ONBOARDING_READY) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }

        $freshStatement = $connection->prepare(
            'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword '
            . 'FROM employees WHERE EmployeeID=? LIMIT 1'
        );
        $freshStatement->execute([(string)$employee['EmployeeID']]);
        $freshEmployee = $freshStatement->fetch(PDO::FETCH_ASSOC);
        if (!$freshEmployee) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }
        $connection->commit();
        $transactionStarted = false;

        $postCommitStatement = $connection->prepare(
            'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword '
            . 'FROM employees WHERE EmployeeID=? LIMIT 1'
        );
        $postCommitStatement->execute([(string)$employee['EmployeeID']]);
        $postCommitEmployee = $postCommitStatement->fetch(PDO::FETCH_ASSOC);
        if (!$postCommitEmployee) {
            throw new SafetyUnitContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to load the updated employee profile.',
                503
            );
        }
        return [
            'status' => $finalStatus,
            'nextAction' => 'ENTER_APP',
            'employee' => $postCommitEmployee,
            'idempotent' => false,
        ];
    } catch (Throwable $error) {
        if ($transactionStarted) {
            try {
                $connection->rollBack();
            } catch (Throwable $rollbackError) {
                // Preserve the original error.
            }
        }
        if ($error instanceof SafetyUnitContinuationException) throw $error;
        throw new SafetyUnitContinuationException(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            $error
        );
    }
}
