'use strict';

const ONBOARDING_STATUS = Object.freeze({
    PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
    SAFETY_UNIT_REQUIRED: 'SAFETY_UNIT_REQUIRED',
    READY: 'READY',
});

class OnboardingResolutionError extends Error {
    constructor(code, message, cause = null) {
        super(message);
        this.name = 'OnboardingResolutionError';
        this.code = code;
        if (cause) this.cause = cause;
    }
}

function normalizeOnboardingName(value) {
    return String(value ?? '')
        .replace(/[\r\n]/g, '')
        .trim()
        .replace(/\s+/gu, '')
        .toLocaleLowerCase('en-US');
}

function mustChangePassword(value) {
    return value === true || value === 1 || value === '1';
}

function buildOnboardingMasterIndex({ departments, units }) {
    if (!Array.isArray(departments) || departments.length === 0 || !Array.isArray(units)) {
        throw new OnboardingResolutionError('MASTER_DATA_INVALID', 'Onboarding master data is unavailable.');
    }

    const departmentsByName = new Map();
    const unitsByDepartmentId = new Map();

    for (const row of departments) {
        const id = String(row?.id ?? row?.ID ?? '');
        const key = normalizeOnboardingName(row?.Name ?? row?.name);
        if (!id || !key || departmentsByName.has(key)) {
            throw new OnboardingResolutionError('MASTER_DATA_INVALID', 'Department master data is invalid or ambiguous.');
        }
        departmentsByName.set(key, id);
        unitsByDepartmentId.set(id, new Set());
    }

    for (const row of units) {
        const departmentId = String(row?.department_id ?? row?.DepartmentID ?? '');
        const unitKey = normalizeOnboardingName(row?.name ?? row?.Name);
        if (!departmentId || !unitKey || !unitsByDepartmentId.has(departmentId)) {
            throw new OnboardingResolutionError('MASTER_DATA_INVALID', 'Safety Unit master data is invalid or orphaned.');
        }
        const departmentUnits = unitsByDepartmentId.get(departmentId);
        if (departmentUnits.has(unitKey)) {
            throw new OnboardingResolutionError('MASTER_DATA_INVALID', 'Safety Unit master data is invalid or ambiguous.');
        }
        departmentUnits.add(unitKey);
    }

    return { departmentsByName, unitsByDepartmentId };
}

function resolveOnboardingWithIndex(employee, masterIndex) {
    if (!employee || typeof employee !== 'object') {
        throw new OnboardingResolutionError('EMPLOYEE_DATA_INVALID', 'Employee data is unavailable.');
    }
    if (!Object.prototype.hasOwnProperty.call(employee, 'Password')) {
        throw new OnboardingResolutionError('EMPLOYEE_DATA_INVALID', 'Employee password state is unavailable.');
    }

    if (employee.Password === null || mustChangePassword(employee.MustChangePassword)) {
        return ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED;
    }

    const departmentKey = normalizeOnboardingName(employee.Department);
    const departmentId = masterIndex.departmentsByName.get(departmentKey);
    if (!departmentId) {
        throw new OnboardingResolutionError('UNKNOWN_DEPARTMENT', 'Employee department was not found in master_departments.');
    }

    const allowedUnits = masterIndex.unitsByDepartmentId.get(departmentId);
    if (!allowedUnits || allowedUnits.size === 0) {
        return ONBOARDING_STATUS.READY;
    }

    const unitKey = normalizeOnboardingName(employee.Unit);
    if (!unitKey || !allowedUnits.has(unitKey)) {
        return ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED;
    }

    return ONBOARDING_STATUS.READY;
}

function createOnboardingResolver(masterData) {
    const masterIndex = buildOnboardingMasterIndex(masterData);
    return {
        masterIndex,
        resolve(employee) {
            return resolveOnboardingWithIndex(employee, masterIndex);
        },
    };
}

function resolveOnboardingState(employee, masterData) {
    return createOnboardingResolver(masterData).resolve(employee);
}

async function resolveEmployeeOnboarding(queryable, employeeId) {
    if (!queryable || typeof queryable.query !== 'function') {
        throw new OnboardingResolutionError('DATABASE_UNAVAILABLE', 'Database query interface is unavailable.');
    }

    try {
        const [employees] = await queryable.query(
            'SELECT EmployeeID,Password,MustChangePassword,Department,Unit FROM employees WHERE EmployeeID=? LIMIT 1',
            [employeeId]
        );
        if (!employees.length) {
            throw new OnboardingResolutionError('EMPLOYEE_NOT_FOUND', 'Employee was not found.');
        }

        const [departments] = await queryable.query('SELECT id,Name FROM master_departments ORDER BY id');
        const [units] = await queryable.query('SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id');
        return resolveOnboardingState(employees[0], { departments, units });
    } catch (error) {
        if (error instanceof OnboardingResolutionError) throw error;
        throw new OnboardingResolutionError('DATABASE_READ_FAILED', 'Unable to read onboarding state.', error);
    }
}

module.exports = {
    ONBOARDING_STATUS,
    OnboardingResolutionError,
    normalizeOnboardingName,
    buildOnboardingMasterIndex,
    resolveOnboardingWithIndex,
    createOnboardingResolver,
    resolveOnboardingState,
    resolveEmployeeOnboarding,
};
