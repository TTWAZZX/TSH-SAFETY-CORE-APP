'use strict';

const {
    ONBOARDING_STATUS,
    buildOnboardingMasterIndex,
    normalizeOnboardingName,
    resolveOnboardingWithIndex,
} = require('./onboarding-resolver');

const PROFILE_ALLOWED_FIELDS = Object.freeze(['EmployeeName', 'Department', 'Unit', 'Position']);
const PROFILE_FIELD_LIMITS = Object.freeze({
    EmployeeName: 255,
    Department: 100,
    Unit: 100,
    Position: 100,
});

class ProfileValidationError extends Error {
    constructor(code, message, httpStatus, cause = null) {
        super(message);
        this.name = 'ProfileValidationError';
        this.code = code;
        this.httpStatus = httpStatus;
        if (cause) this.cause = cause;
    }
}

function profileCharacterLength(value) {
    return Array.from(String(value ?? '')).length;
}

function cleanEmployeeName(value) {
    return String(value ?? '').replace(/[\r\n]/g, '').trim();
}

function assertProfilePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new ProfileValidationError('PROFILE_FIELD_NOT_ALLOWED', 'Profile payload is invalid.', 403);
    }
    const forbiddenFields = Object.keys(payload).filter(field => !PROFILE_ALLOWED_FIELDS.includes(field));
    if (forbiddenFields.length > 0) {
        throw new ProfileValidationError(
            'PROFILE_FIELD_NOT_ALLOWED',
            'One or more profile fields are not allowed.',
            403
        );
    }
    if (typeof payload.EmployeeName !== 'string') {
        throw new ProfileValidationError('INVALID_EMPLOYEE_NAME', 'Employee name is invalid.', 400);
    }
    if (typeof payload.Department !== 'string') {
        throw new ProfileValidationError('INVALID_DEPARTMENT', 'Department is invalid.', 422);
    }
    if (typeof payload.Unit !== 'string') {
        throw new ProfileValidationError('INVALID_SAFETY_UNIT', 'Safety Unit is invalid.', 422);
    }
    if (typeof payload.Position !== 'string') {
        throw new ProfileValidationError('INVALID_POSITION', 'Position is invalid.', 422);
    }
}

function assertCrossPathProfilePayload(payload, { partial = false } = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new ProfileValidationError('PROFILE_FIELD_NOT_ALLOWED', 'Profile payload is invalid.', 403);
    }
    const forbiddenFields = Object.keys(payload).filter(field => !PROFILE_ALLOWED_FIELDS.includes(field));
    if (forbiddenFields.length > 0) {
        throw new ProfileValidationError(
            'PROFILE_FIELD_NOT_ALLOWED',
            'One or more profile fields are not allowed.',
            403
        );
    }
    for (const field of PROFILE_ALLOWED_FIELDS) {
        if (!partial || Object.prototype.hasOwnProperty.call(payload, field)) {
            if (typeof payload[field] !== 'string') {
                const code = field === 'EmployeeName'
                    ? 'INVALID_EMPLOYEE_NAME'
                    : field === 'Department'
                        ? 'INVALID_DEPARTMENT'
                        : field === 'Unit'
                            ? 'INVALID_SAFETY_UNIT'
                            : 'INVALID_POSITION';
                throw new ProfileValidationError(code, `${field} is invalid.`, field === 'EmployeeName' ? 400 : 422);
            }
        }
    }
}

function buildProfileMasterIndex(masterData) {
    try {
        const onboardingIndex = buildOnboardingMasterIndex({
            departments: masterData?.departments,
            units: masterData?.units,
        });
        const positions = masterData?.positions;
        if (!Array.isArray(positions) || positions.length === 0) {
            throw new Error('Position master data is unavailable.');
        }
        const departmentsById = new Map();
        for (const row of masterData.departments) {
            const id = String(row?.id ?? row?.ID ?? '');
            const name = String(row?.Name ?? row?.name ?? '');
            if (!id || !name || profileCharacterLength(name) > PROFILE_FIELD_LIMITS.Department) {
                throw new Error('Department master data is invalid.');
            }
            departmentsById.set(id, name);
        }
        const positionsByName = new Map();
        for (const row of positions) {
            const name = String(row?.Name ?? row?.name ?? '');
            const key = normalizeOnboardingName(name);
            if (!key || profileCharacterLength(name) > PROFILE_FIELD_LIMITS.Position || positionsByName.has(key)) {
                throw new Error('Position master data is invalid or ambiguous.');
            }
            positionsByName.set(key, name);
        }
        for (const row of masterData.units) {
            const name = String(row?.name ?? row?.Name ?? '');
            if (profileCharacterLength(name) > PROFILE_FIELD_LIMITS.Unit) {
                throw new Error('Safety Unit master data is invalid.');
            }
        }
        return { ...onboardingIndex, departmentsById, positionsByName };
    } catch (error) {
        if (error instanceof ProfileValidationError) throw error;
        throw new ProfileValidationError(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Profile master data is unavailable.',
            503,
            error
        );
    }
}

function validateEmployeeProfileCandidate(employee, payload, masterData, { partial = false } = {}) {
    assertCrossPathProfilePayload(payload, { partial });
    if (!employee || typeof employee !== 'object') {
        throw new ProfileValidationError('PROFILE_VALIDATION_UNAVAILABLE', 'Employee profile is unavailable.', 503);
    }

    const requested = {};
    for (const field of PROFILE_ALLOWED_FIELDS) {
        requested[field] = partial && !Object.prototype.hasOwnProperty.call(payload, field)
            ? employee[field]
            : payload[field];
    }

    const employeeName = cleanEmployeeName(requested.EmployeeName);
    if (!employeeName || profileCharacterLength(employeeName) > PROFILE_FIELD_LIMITS.EmployeeName) {
        throw new ProfileValidationError('INVALID_EMPLOYEE_NAME', 'Employee name is invalid.', 400);
    }

    const masterIndex = buildProfileMasterIndex(masterData);
    const departmentKey = normalizeOnboardingName(requested.Department);
    const departmentId = masterIndex.departmentsByName.get(departmentKey);
    if (!departmentId) {
        throw new ProfileValidationError('INVALID_DEPARTMENT', 'Department was not found in master data.', 422);
    }
    const department = masterIndex.departmentsById.get(String(departmentId));

    const positionKey = normalizeOnboardingName(requested.Position);
    const position = masterIndex.positionsByName.get(positionKey);
    if (!position) {
        throw new ProfileValidationError('INVALID_POSITION', 'Position was not found in master data.', 422);
    }

    const departmentUnitKeys = masterIndex.unitsByDepartmentId.get(String(departmentId));
    let unit = '';
    if (departmentUnitKeys && departmentUnitKeys.size > 0) {
        const unitKey = normalizeOnboardingName(requested.Unit);
        if (unitKey) {
            const selected = masterData.units.find(row => String(row?.department_id ?? row?.DepartmentID ?? '') === String(departmentId)
                && normalizeOnboardingName(row?.name ?? row?.Name) === unitKey);
            if (!selected) {
                throw new ProfileValidationError(
                    'INVALID_SAFETY_UNIT',
                    'Safety Unit is not allowed for the selected department.',
                    422
                );
            }
            unit = String(selected.name ?? selected.Name);
        }
    }

    const profile = { EmployeeName: employeeName, Department: department, Unit: unit, Position: position };
    const candidate = { ...employee, ...profile };
    const expectedOnboardingStatus = resolveOnboardingWithIndex(candidate, masterIndex);
    const changedFields = [];
    if (cleanEmployeeName(employee.EmployeeName) !== employeeName) changedFields.push('EmployeeName');
    if (normalizeOnboardingName(employee.Department) !== normalizeOnboardingName(department)) changedFields.push('Department');
    if (normalizeOnboardingName(employee.Unit) !== normalizeOnboardingName(unit)) changedFields.push('Unit');
    if (normalizeOnboardingName(employee.Position) !== normalizeOnboardingName(position)) changedFields.push('Position');

    return {
        valid: true,
        profile,
        expectedOnboardingStatus,
        nextAction: expectedOnboardingStatus === ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED
            ? 'SELECT_SAFETY_UNIT'
            : 'ENTER_APP',
        changedFields,
    };
}

function validateProfileUpdate(employee, payload, masterData) {
    assertProfilePayload(payload);
    const validation = validateEmployeeProfileCandidate(employee, payload, masterData);
    if (![ONBOARDING_STATUS.READY, ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED]
        .includes(validation.expectedOnboardingStatus)) {
        throw new ProfileValidationError(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503
        );
    }
    return validation;
}

module.exports = {
    PROFILE_ALLOWED_FIELDS,
    PROFILE_FIELD_LIMITS,
    ProfileValidationError,
    profileCharacterLength,
    cleanEmployeeName,
    assertProfilePayload,
    assertCrossPathProfilePayload,
    buildProfileMasterIndex,
    validateEmployeeProfileCandidate,
    validateProfileUpdate,
};
