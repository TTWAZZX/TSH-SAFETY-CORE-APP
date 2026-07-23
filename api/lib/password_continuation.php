<?php
declare(strict_types=1);

final class PasswordContinuationException extends RuntimeException
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

function password_continuation_next_action(string $status): string
{
    if ($status === ONBOARDING_SAFETY_UNIT_REQUIRED) return 'SELECT_SAFETY_UNIT';
    if ($status === ONBOARDING_READY) return 'ENTER_APP';
    throw new PasswordContinuationException(
        'ONBOARDING_STATE_UNAVAILABLE',
        'Unable to verify onboarding state.',
        503
    );
}

function password_continuation_execute(
    object $connection,
    string $employeeId,
    string $currentPassword,
    string $newPassword,
    array $options = []
): array {
    if ($currentPassword === '' || $newPassword === '') {
        throw new PasswordContinuationException('PASSWORD_FIELDS_REQUIRED', 'Current and new passwords are required.', 400);
    }
    if (strlen($newPassword) < 4) {
        throw new PasswordContinuationException('PASSWORD_POLICY_VIOLATION', 'Password must be at least 4 characters.', 400);
    }

    $verifyPassword = $options['verifyPassword'] ?? static fn(string $plain, string $hash): bool => password_verify($plain, $hash);
    $hashPassword = $options['hashPassword'] ?? static fn(string $plain): string => password_hash($plain, PASSWORD_BCRYPT);
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
            throw new PasswordContinuationException('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
        }

        $storedPassword = $employee['Password'] ?? null;
        $legacyPassword = $storedPassword === null || $storedPassword === '';
        $currentValid = $legacyPassword
            ? hash_equals((string)$employee['EmployeeID'], $currentPassword)
            : (bool)$verifyPassword($currentPassword, (string)$storedPassword);
        if (!$currentValid) {
            throw new PasswordContinuationException('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 401);
        }

        $reusesCurrentPassword = $legacyPassword
            ? hash_equals((string)$employee['EmployeeID'], $newPassword)
            : (bool)$verifyPassword($newPassword, (string)$storedPassword);
        if ($reusesCurrentPassword) {
            throw new PasswordContinuationException(
                'PASSWORD_REUSE_NOT_ALLOWED',
                'New password must be different from the current password.',
                409
            );
        }

        $update = $connection->prepare('UPDATE employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=?');
        $update->execute([$hashPassword($newPassword), (string)$employee['EmployeeID']]);

        try {
            $status = $resolveStatus($connection, (string)$employee['EmployeeID']);
        } catch (Throwable $error) {
            throw new PasswordContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                $error
            );
        }
        $nextAction = password_continuation_next_action($status);

        $freshStatement = $connection->prepare(
            'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword '
            . 'FROM employees WHERE EmployeeID=? LIMIT 1'
        );
        $freshStatement->execute([(string)$employee['EmployeeID']]);
        $freshEmployee = $freshStatement->fetch(PDO::FETCH_ASSOC);
        if (!$freshEmployee) {
            throw new PasswordContinuationException(
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
            throw new PasswordContinuationException(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to load the updated employee profile.',
                503
            );
        }
        return ['status' => $status, 'nextAction' => $nextAction, 'employee' => $postCommitEmployee];
    } catch (Throwable $error) {
        if ($transactionStarted) {
            try {
                $connection->rollBack();
            } catch (Throwable $rollbackError) {
                // Preserve the original error; rollback failure is intentionally not exposed.
            }
        }
        if ($error instanceof PasswordContinuationException) throw $error;
        throw new PasswordContinuationException(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            $error
        );
    }
}
