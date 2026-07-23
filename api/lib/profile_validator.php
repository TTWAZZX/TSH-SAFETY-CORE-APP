<?php
declare(strict_types=1);

const PROFILE_ALLOWED_FIELDS = ['EmployeeName', 'Department', 'Unit', 'Position'];
const PROFILE_FIELD_LIMITS = [
    'EmployeeName' => 255,
    'Department' => 100,
    'Unit' => 100,
    'Position' => 100,
];

final class ProfileValidationException extends RuntimeException
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

function profile_character_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function profile_clean_employee_name($value): string
{
    return trim(str_replace(["\r", "\n"], '', (string)($value ?? '')));
}

function profile_assert_payload(array $payload): void
{
    foreach (array_keys($payload) as $field) {
        if (!in_array($field, PROFILE_ALLOWED_FIELDS, true)) {
            throw new ProfileValidationException(
                'PROFILE_FIELD_NOT_ALLOWED',
                'One or more profile fields are not allowed.',
                403
            );
        }
    }
    if (!is_string($payload['EmployeeName'] ?? null)) {
        throw new ProfileValidationException('INVALID_EMPLOYEE_NAME', 'Employee name is invalid.', 400);
    }
    if (!is_string($payload['Department'] ?? null)) {
        throw new ProfileValidationException('INVALID_DEPARTMENT', 'Department is invalid.', 422);
    }
    if (!is_string($payload['Unit'] ?? null)) {
        throw new ProfileValidationException('INVALID_SAFETY_UNIT', 'Safety Unit is invalid.', 422);
    }
    if (!is_string($payload['Position'] ?? null)) {
        throw new ProfileValidationException('INVALID_POSITION', 'Position is invalid.', 422);
    }
}

function profile_assert_cross_path_payload(array $payload, bool $partial = false): void
{
    foreach (array_keys($payload) as $field) {
        if (!in_array($field, PROFILE_ALLOWED_FIELDS, true)) {
            throw new ProfileValidationException(
                'PROFILE_FIELD_NOT_ALLOWED',
                'One or more profile fields are not allowed.',
                403
            );
        }
    }
    foreach (PROFILE_ALLOWED_FIELDS as $field) {
        if (!$partial || array_key_exists($field, $payload)) {
            if (!is_string($payload[$field] ?? null)) {
                $code = $field === 'EmployeeName' ? 'INVALID_EMPLOYEE_NAME'
                    : ($field === 'Department' ? 'INVALID_DEPARTMENT'
                        : ($field === 'Unit' ? 'INVALID_SAFETY_UNIT' : 'INVALID_POSITION'));
                throw new ProfileValidationException(
                    $code,
                    $field . ' is invalid.',
                    $field === 'EmployeeName' ? 400 : 422
                );
            }
        }
    }
}

function profile_build_master_index(array $masterData): array
{
    try {
        $departments = $masterData['departments'] ?? null;
        $units = $masterData['units'] ?? null;
        $positions = $masterData['positions'] ?? null;
        $onboardingIndex = onboarding_build_master_index([
            'departments' => $departments,
            'units' => $units,
        ]);
        if (!is_array($positions) || count($positions) === 0) {
            throw new RuntimeException('Position master data is unavailable.');
        }

        $departmentsById = [];
        foreach ($departments as $row) {
            $id = (string)($row['id'] ?? $row['ID'] ?? '');
            $name = (string)($row['Name'] ?? $row['name'] ?? '');
            if ($id === '' || $name === '' || profile_character_length($name) > PROFILE_FIELD_LIMITS['Department']) {
                throw new RuntimeException('Department master data is invalid.');
            }
            $departmentsById[$id] = $name;
        }

        $positionsByName = [];
        foreach ($positions as $row) {
            $name = (string)($row['Name'] ?? $row['name'] ?? '');
            $key = onboarding_normalize_name($name);
            if ($key === '' || profile_character_length($name) > PROFILE_FIELD_LIMITS['Position'] || isset($positionsByName[$key])) {
                throw new RuntimeException('Position master data is invalid or ambiguous.');
            }
            $positionsByName[$key] = $name;
        }
        foreach ($units as $row) {
            $name = (string)($row['name'] ?? $row['Name'] ?? '');
            if (profile_character_length($name) > PROFILE_FIELD_LIMITS['Unit']) {
                throw new RuntimeException('Safety Unit master data is invalid.');
            }
        }
        return array_merge($onboardingIndex, [
            'departmentsById' => $departmentsById,
            'positionsByName' => $positionsByName,
        ]);
    } catch (ProfileValidationException $error) {
        throw $error;
    } catch (Throwable $error) {
        throw new ProfileValidationException(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Profile master data is unavailable.',
            503,
            $error
        );
    }
}

function profile_validate_cross_path_candidate(
    array $employee,
    array $payload,
    array $masterData,
    bool $partial = false
): array
{
    profile_assert_cross_path_payload($payload, $partial);
    $requested = [];
    foreach (PROFILE_ALLOWED_FIELDS as $field) {
        $requested[$field] = $partial && !array_key_exists($field, $payload)
            ? ($employee[$field] ?? null)
            : ($payload[$field] ?? null);
    }
    $employeeName = profile_clean_employee_name($requested['EmployeeName']);
    if ($employeeName === '' || profile_character_length($employeeName) > PROFILE_FIELD_LIMITS['EmployeeName']) {
        throw new ProfileValidationException('INVALID_EMPLOYEE_NAME', 'Employee name is invalid.', 400);
    }

    $masterIndex = profile_build_master_index($masterData);
    $departmentKey = onboarding_normalize_name($requested['Department']);
    $departmentId = $masterIndex['departmentsByName'][$departmentKey] ?? null;
    if ($departmentId === null) {
        throw new ProfileValidationException('INVALID_DEPARTMENT', 'Department was not found in master data.', 422);
    }
    $department = $masterIndex['departmentsById'][(string)$departmentId] ?? null;

    $positionKey = onboarding_normalize_name($requested['Position']);
    $position = $masterIndex['positionsByName'][$positionKey] ?? null;
    if ($position === null) {
        throw new ProfileValidationException('INVALID_POSITION', 'Position was not found in master data.', 422);
    }

    $departmentUnitKeys = $masterIndex['unitsByDepartmentId'][(string)$departmentId] ?? [];
    $unit = '';
    if (count($departmentUnitKeys) > 0) {
        $unitKey = onboarding_normalize_name($requested['Unit']);
        if ($unitKey !== '') {
            $selected = null;
            foreach ($masterData['units'] as $row) {
                if ((string)($row['department_id'] ?? $row['DepartmentID'] ?? '') === (string)$departmentId
                    && onboarding_normalize_name($row['name'] ?? $row['Name'] ?? '') === $unitKey) {
                    $selected = $row;
                    break;
                }
            }
            if ($selected === null) {
                throw new ProfileValidationException(
                    'INVALID_SAFETY_UNIT',
                    'Safety Unit is not allowed for the selected department.',
                    422
                );
            }
            $unit = (string)($selected['name'] ?? $selected['Name']);
        }
    }

    $profile = [
        'EmployeeName' => $employeeName,
        'Department' => (string)$department,
        'Unit' => $unit,
        'Position' => (string)$position,
    ];
    $candidate = array_merge($employee, $profile);
    $expectedStatus = onboarding_resolve_with_index($candidate, $masterIndex);
    $changedFields = [];
    if (profile_clean_employee_name($employee['EmployeeName'] ?? '') !== $employeeName) $changedFields[] = 'EmployeeName';
    if (onboarding_normalize_name($employee['Department'] ?? '') !== onboarding_normalize_name($profile['Department'])) $changedFields[] = 'Department';
    if (onboarding_normalize_name($employee['Unit'] ?? '') !== onboarding_normalize_name($profile['Unit'])) $changedFields[] = 'Unit';
    if (onboarding_normalize_name($employee['Position'] ?? '') !== onboarding_normalize_name($profile['Position'])) $changedFields[] = 'Position';

    return [
        'valid' => true,
        'profile' => $profile,
        'expectedOnboardingStatus' => $expectedStatus,
        'nextAction' => $expectedStatus === ONBOARDING_SAFETY_UNIT_REQUIRED ? 'SELECT_SAFETY_UNIT' : 'ENTER_APP',
        'changedFields' => $changedFields,
    ];
}

function profile_validate_update(array $employee, array $payload, array $masterData): array
{
    profile_assert_payload($payload);
    $validation = profile_validate_cross_path_candidate($employee, $payload, $masterData, false);
    if (!in_array($validation['expectedOnboardingStatus'], [ONBOARDING_READY, ONBOARDING_SAFETY_UNIT_REQUIRED], true)) {
        throw new ProfileValidationException(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503
        );
    }
    return $validation;
}
