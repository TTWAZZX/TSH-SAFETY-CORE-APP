'use strict';

const { ONBOARDING_STATUS, resolveEmployeeOnboarding } = require('../utils/onboarding-resolver');
const {
    PROFILE_ALLOWED_FIELDS,
    ProfileValidationError,
    assertProfilePayload,
    validateProfileUpdate,
} = require('../utils/profile-validator');

async function executeProfileUpdate({
    connection,
    employeeId,
    payload,
    resolveStatus = resolveEmployeeOnboarding,
}) {
    if (!connection || typeof connection.query !== 'function'
        || typeof connection.beginTransaction !== 'function') {
        throw new TypeError('Profile update requires a transaction-capable connection.');
    }
    assertProfilePayload(payload);

    let transactionStarted = false;
    try {
        await connection.beginTransaction();
        transactionStarted = true;
        const [rows] = await connection.query(
            `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword
             FROM employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE`,
            [employeeId]
        );
        const employee = rows?.[0];
        if (!employee) {
            throw new ProfileValidationError('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
        }

        let departments;
        let units;
        let positions;
        try {
            [departments] = await connection.query('SELECT id,Name FROM master_departments ORDER BY id');
            [units] = await connection.query(
                'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'
            );
            [positions] = await connection.query('SELECT id,Name FROM master_positions ORDER BY id');
        } catch (error) {
            throw new ProfileValidationError(
                'PROFILE_VALIDATION_UNAVAILABLE',
                'Profile master data is unavailable.',
                503,
                error
            );
        }

        const validation = validateProfileUpdate(employee, payload, { departments, units, positions });
        if (validation.changedFields.length > 0) {
            const assignments = validation.changedFields.map(field => `${field}=?`).join(',');
            const values = validation.changedFields.map(field => validation.profile[field]);
            await connection.query(
                `UPDATE employees SET ${assignments} WHERE EmployeeID=?`,
                [...values, employee.EmployeeID]
            );
        }

        let status;
        try {
            status = await resolveStatus(connection, String(employee.EmployeeID));
        } catch (error) {
            throw new ProfileValidationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                error
            );
        }
        if (![ONBOARDING_STATUS.READY, ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED].includes(status)
            || status !== validation.expectedOnboardingStatus) {
            throw new ProfileValidationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }

        const profileSelect = `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword
                               FROM employees WHERE EmployeeID=? LIMIT 1`;
        const [freshRows] = await connection.query(profileSelect, [employee.EmployeeID]);
        if (!freshRows?.[0]) {
            throw new ProfileValidationError('PROFILE_VALIDATION_UNAVAILABLE', 'Updated profile is unavailable.', 503);
        }
        await connection.commit();
        transactionStarted = false;

        const [postCommitRows] = await connection.query(profileSelect, [employee.EmployeeID]);
        if (!postCommitRows?.[0]) {
            throw new ProfileValidationError('PROFILE_VALIDATION_UNAVAILABLE', 'Updated profile is unavailable.', 503);
        }
        return {
            status,
            nextAction: status === ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED ? 'SELECT_SAFETY_UNIT' : 'ENTER_APP',
            employee: postCommitRows[0],
            changedFields: validation.changedFields,
            idempotent: validation.changedFields.length === 0,
            allowedFields: PROFILE_ALLOWED_FIELDS,
        };
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
            'Profile validation is unavailable.',
            503,
            error
        );
    }
}

module.exports = { executeProfileUpdate };
