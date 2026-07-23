'use strict';

const {
    ONBOARDING_STATUS,
    resolveEmployeeOnboarding,
} = require('../utils/onboarding-resolver');
const {
    PROFILE_ALLOWED_FIELDS,
    ProfileValidationError,
    validateEmployeeProfileCandidate,
} = require('../utils/profile-validator');

const CROSS_PATH_OPERATION = Object.freeze({
    CREATE: 'create',
    UPDATE: 'update',
    UPSERT: 'upsert',
});
const PROTECTED_WRITE_FIELDS = Object.freeze([
    'Team',
    'CompanyEmail',
    'Role',
    'Password',
    'MustChangePassword',
]);
const ALL_ONBOARDING_STATUSES = Object.freeze(Object.values(ONBOARDING_STATUS));

async function loadEmployeeProfileMasters(queryable) {
    try {
        const [departments] = await queryable.query('SELECT id,Name FROM master_departments ORDER BY id');
        const [units] = await queryable.query(
            'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'
        );
        const [positions] = await queryable.query('SELECT id,Name FROM master_positions ORDER BY id');
        return { departments, units, positions };
    } catch (error) {
        throw new ProfileValidationError(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Profile master data is unavailable.',
            503,
            error
        );
    }
}

function validateProtectedFields(protectedFields) {
    if (!protectedFields || typeof protectedFields !== 'object' || Array.isArray(protectedFields)) {
        throw new ProfileValidationError('PROFILE_FIELD_NOT_ALLOWED', 'Protected field payload is invalid.', 403);
    }
    const forbidden = Object.keys(protectedFields).filter(field => !PROTECTED_WRITE_FIELDS.includes(field));
    if (forbidden.length > 0) {
        throw new ProfileValidationError('PROFILE_FIELD_NOT_ALLOWED', 'One or more protected fields are not allowed.', 403);
    }
}

function createInsertValues(employeeId, profile, protectedFields) {
    return {
        EmployeeID: employeeId,
        ...profile,
        Team: protectedFields.Team ?? '',
        CompanyEmail: protectedFields.CompanyEmail ?? null,
        Role: protectedFields.Role ?? 'User',
        Password: Object.prototype.hasOwnProperty.call(protectedFields, 'Password')
            ? protectedFields.Password
            : null,
        MustChangePassword: Object.prototype.hasOwnProperty.call(protectedFields, 'MustChangePassword')
            ? protectedFields.MustChangePassword
            : 0,
    };
}

function protectedChangedFields(current, protectedFields) {
    return Object.keys(protectedFields).filter(field => {
        if (!PROTECTED_WRITE_FIELDS.includes(field)) return false;
        return String(current?.[field] ?? '') !== String(protectedFields[field] ?? '');
    });
}

async function writeEmployeeProfileWithinTransaction({
    connection,
    operation,
    employeeId,
    profilePayload,
    protectedFields = {},
    resolveStatus = resolveEmployeeOnboarding,
}) {
    if (!connection || typeof connection.query !== 'function') {
        throw new TypeError('Cross-path profile write requires a queryable connection.');
    }
    if (!Object.values(CROSS_PATH_OPERATION).includes(operation)) {
        throw new TypeError('Cross-path profile write operation is invalid.');
    }
    validateProtectedFields(protectedFields);
    const normalizedEmployeeId = String(employeeId ?? '').trim();
    if (!normalizedEmployeeId) {
        throw new ProfileValidationError('INVALID_EMPLOYEE_ID', 'Employee ID is required.', 400);
    }

    const [rows] = await connection.query(
        `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword
         FROM employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE`,
        [normalizedEmployeeId]
    );
    const current = rows?.[0] || null;
    if (operation === CROSS_PATH_OPERATION.CREATE && current) {
        throw new ProfileValidationError('EMPLOYEE_ALREADY_EXISTS', 'Employee ID already exists.', 409);
    }
    if (operation === CROSS_PATH_OPERATION.UPDATE && !current) {
        throw new ProfileValidationError('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
    }

    const willInsert = operation === CROSS_PATH_OPERATION.CREATE
        || (operation === CROSS_PATH_OPERATION.UPSERT && !current);
    const baseEmployee = current || createInsertValues(normalizedEmployeeId, {
        EmployeeName: '', Department: '', Unit: '', Position: '',
    }, protectedFields);
    const masters = await loadEmployeeProfileMasters(connection);
    const validation = validateEmployeeProfileCandidate(
        baseEmployee,
        profilePayload,
        masters,
        { partial: !willInsert && operation === CROSS_PATH_OPERATION.UPDATE }
    );

    let changedProtectedFields = [];
    if (willInsert) {
        const insert = createInsertValues(normalizedEmployeeId, validation.profile, protectedFields);
        try {
            await connection.query(
                `INSERT INTO employees
                 (EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
                 VALUES(?,?,?,?,?,?,?,?,?,?)`,
                [
                    insert.EmployeeID, insert.EmployeeName, insert.Department, insert.Unit,
                    insert.Team, insert.Position, insert.CompanyEmail, insert.Role,
                    insert.Password, insert.MustChangePassword,
                ]
            );
        } catch (error) {
            if (error?.code === 'ER_DUP_ENTRY') {
                throw new ProfileValidationError('EMPLOYEE_ALREADY_EXISTS', 'Employee ID already exists.', 409, error);
            }
            throw error;
        }
        changedProtectedFields = Object.keys(protectedFields);
    } else {
        changedProtectedFields = protectedChangedFields(current, protectedFields);
        const changedProfileFields = validation.changedFields;
        const fields = [...changedProfileFields, ...changedProtectedFields];
        if (fields.length > 0) {
            const values = fields.map(field => (
                PROFILE_ALLOWED_FIELDS.includes(field) ? validation.profile[field] : protectedFields[field]
            ));
            await connection.query(
                `UPDATE employees SET ${fields.map(field => `${field}=?`).join(',')} WHERE EmployeeID=?`,
                [...values, current.EmployeeID]
            );
        }
    }

    let status;
    try {
        status = await resolveStatus(connection, normalizedEmployeeId);
    } catch (error) {
        throw new ProfileValidationError(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            error
        );
    }
    if (!ALL_ONBOARDING_STATUSES.includes(status) || status !== validation.expectedOnboardingStatus) {
        throw new ProfileValidationError('ONBOARDING_STATE_UNAVAILABLE', 'Unable to verify onboarding state.', 503);
    }

    const [freshRows] = await connection.query(
        `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,MustChangePassword
         FROM employees WHERE EmployeeID=? LIMIT 1`,
        [normalizedEmployeeId]
    );
    if (!freshRows?.[0]) {
        throw new ProfileValidationError('PROFILE_VALIDATION_UNAVAILABLE', 'Employee profile is unavailable.', 503);
    }
    return {
        employee: freshRows[0],
        status,
        nextAction: status === ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED
            ? 'CHANGE_PASSWORD'
            : status === ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED
                ? 'SELECT_SAFETY_UNIT'
                : 'ENTER_APP',
        inserted: willInsert,
        idempotent: !willInsert && validation.changedFields.length === 0 && changedProtectedFields.length === 0,
        changedFields: [...validation.changedFields, ...changedProtectedFields],
    };
}

async function executeEmployeeProfileWrite(options) {
    const { connection } = options;
    if (!connection || typeof connection.beginTransaction !== 'function') {
        throw new TypeError('Cross-path profile write requires a transaction-capable connection.');
    }
    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const result = await writeEmployeeProfileWithinTransaction(options);
        await connection.commit();
        transactionStarted = false;
        return result;
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                if (error && !error.rollbackError) error.rollbackError = rollbackError;
            }
        }
        if (error instanceof ProfileValidationError) throw error;
        throw new ProfileValidationError(
            'PROFILE_VALIDATION_UNAVAILABLE',
            'Employee profile write is unavailable.',
            503,
            error
        );
    }
}

module.exports = {
    CROSS_PATH_OPERATION,
    PROTECTED_WRITE_FIELDS,
    loadEmployeeProfileMasters,
    validateProtectedFields,
    writeEmployeeProfileWithinTransaction,
    executeEmployeeProfileWrite,
};
