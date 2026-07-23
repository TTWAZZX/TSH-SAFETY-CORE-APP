<?php
declare(strict_types=1);

const ONBOARDING_PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
const ONBOARDING_SAFETY_UNIT_REQUIRED = 'SAFETY_UNIT_REQUIRED';
const ONBOARDING_READY = 'READY';

final class OnboardingResolutionException extends RuntimeException
{
    public string $reason;

    public function __construct(string $reason, string $message, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
        $this->reason = $reason;
    }
}

function onboarding_normalize_name($value): string
{
    $normalized = str_replace(["\r", "\n"], '', (string)($value ?? ''));
    $normalized = trim($normalized);
    $normalized = (string)preg_replace('/\s+/u', '', $normalized);
    return function_exists('mb_strtolower') ? mb_strtolower($normalized, 'UTF-8') : strtolower($normalized);
}

function onboarding_must_change_password($value): bool
{
    return $value === true || $value === 1 || $value === '1';
}

function onboarding_build_master_index(array $masterData): array
{
    $departments = $masterData['departments'] ?? null;
    $units = $masterData['units'] ?? null;
    if (!is_array($departments) || count($departments) === 0 || !is_array($units)) {
        throw new OnboardingResolutionException('MASTER_DATA_INVALID', 'Onboarding master data is unavailable.');
    }

    $departmentsByName = [];
    $unitsByDepartmentId = [];
    foreach ($departments as $row) {
        $id = (string)($row['id'] ?? $row['ID'] ?? '');
        $key = onboarding_normalize_name($row['Name'] ?? $row['name'] ?? '');
        if ($id === '' || $key === '' || array_key_exists($key, $departmentsByName)) {
            throw new OnboardingResolutionException('MASTER_DATA_INVALID', 'Department master data is invalid or ambiguous.');
        }
        $departmentsByName[$key] = $id;
        $unitsByDepartmentId[$id] = [];
    }

    foreach ($units as $row) {
        $departmentId = (string)($row['department_id'] ?? $row['DepartmentID'] ?? '');
        $unitKey = onboarding_normalize_name($row['name'] ?? $row['Name'] ?? '');
        if ($departmentId === '' || $unitKey === '' || !array_key_exists($departmentId, $unitsByDepartmentId)) {
            throw new OnboardingResolutionException('MASTER_DATA_INVALID', 'Safety Unit master data is invalid or orphaned.');
        }
        if (isset($unitsByDepartmentId[$departmentId][$unitKey])) {
            throw new OnboardingResolutionException('MASTER_DATA_INVALID', 'Safety Unit master data is invalid or ambiguous.');
        }
        $unitsByDepartmentId[$departmentId][$unitKey] = true;
    }

    return [
        'departmentsByName' => $departmentsByName,
        'unitsByDepartmentId' => $unitsByDepartmentId,
    ];
}

function onboarding_resolve_with_index(array $employee, array $masterIndex): string
{
    if (!array_key_exists('Password', $employee)) {
        throw new OnboardingResolutionException('EMPLOYEE_DATA_INVALID', 'Employee password state is unavailable.');
    }
    if ($employee['Password'] === null || onboarding_must_change_password($employee['MustChangePassword'] ?? null)) {
        return ONBOARDING_PASSWORD_CHANGE_REQUIRED;
    }

    $departmentKey = onboarding_normalize_name($employee['Department'] ?? '');
    $departmentId = $masterIndex['departmentsByName'][$departmentKey] ?? null;
    if ($departmentId === null) {
        throw new OnboardingResolutionException('UNKNOWN_DEPARTMENT', 'Employee department was not found in master_departments.');
    }

    $allowedUnits = $masterIndex['unitsByDepartmentId'][(string)$departmentId] ?? null;
    if (!is_array($allowedUnits)) {
        throw new OnboardingResolutionException('MASTER_DATA_INVALID', 'Department Safety Unit index is unavailable.');
    }
    if (count($allowedUnits) === 0) {
        return ONBOARDING_READY;
    }

    $unitKey = onboarding_normalize_name($employee['Unit'] ?? '');
    if ($unitKey === '' || !isset($allowedUnits[$unitKey])) {
        return ONBOARDING_SAFETY_UNIT_REQUIRED;
    }

    return ONBOARDING_READY;
}

function onboarding_resolve_state(array $employee, array $masterData): string
{
    return onboarding_resolve_with_index($employee, onboarding_build_master_index($masterData));
}

function onboarding_resolve_employee(PDO $pdo, string $employeeId): string
{
    try {
        $employeeStatement = $pdo->prepare(
            'SELECT EmployeeID,Password,MustChangePassword,Department,Unit FROM employees WHERE EmployeeID=? LIMIT 1'
        );
        $employeeStatement->execute([$employeeId]);
        $employee = $employeeStatement->fetch(PDO::FETCH_ASSOC);
        if (!$employee) {
            throw new OnboardingResolutionException('EMPLOYEE_NOT_FOUND', 'Employee was not found.');
        }

        $departments = $pdo->query('SELECT id,Name FROM master_departments ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $units = $pdo->query('SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id')->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (OnboardingResolutionException $error) {
        throw $error;
    } catch (Throwable $error) {
        throw new OnboardingResolutionException('DATABASE_READ_FAILED', 'Unable to read onboarding state.', $error);
    }

    return onboarding_resolve_state($employee, ['departments' => $departments, 'units' => $units]);
}
