'use strict';

const {
    ONBOARDING_STATUS,
    resolveEmployeeOnboarding,
} = require('../utils/onboarding-resolver');

class PasswordContinuationError extends Error {
    constructor(code, message, httpStatus, cause = null) {
        super(message);
        this.name = 'PasswordContinuationError';
        this.code = code;
        this.httpStatus = httpStatus;
        if (cause) this.cause = cause;
    }
}

function passwordContinuationNextAction(status) {
    if (status === ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED) return 'SELECT_SAFETY_UNIT';
    if (status === ONBOARDING_STATUS.READY) return 'ENTER_APP';
    throw new PasswordContinuationError(
        'ONBOARDING_STATE_UNAVAILABLE',
        'Unable to verify onboarding state.',
        503
    );
}

async function executePasswordContinuation({
    connection,
    employeeId,
    currentPassword,
    newPassword,
    comparePassword,
    hashPassword,
    resolveStatus = resolveEmployeeOnboarding,
}) {
    if (!connection || typeof connection.query !== 'function'
        || typeof connection.beginTransaction !== 'function') {
        throw new TypeError('Password continuation requires a transaction-capable connection.');
    }
    if (typeof comparePassword !== 'function' || typeof hashPassword !== 'function') {
        throw new TypeError('Password continuation requires password comparison and hashing functions.');
    }
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string'
        || currentPassword === '' || newPassword === '') {
        throw new PasswordContinuationError(
            'PASSWORD_FIELDS_REQUIRED',
            'Current and new passwords are required.',
            400
        );
    }
    if (newPassword.length < 4) {
        throw new PasswordContinuationError(
            'PASSWORD_POLICY_VIOLATION',
            'Password must be at least 4 characters.',
            400
        );
    }

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
            throw new PasswordContinuationError('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
        }

        const legacyPassword = employee.Password === null || employee.Password === '';
        const currentValid = legacyPassword
            ? currentPassword === String(employee.EmployeeID)
            : await comparePassword(currentPassword, employee.Password);
        if (!currentValid) {
            throw new PasswordContinuationError('CURRENT_PASSWORD_INVALID', 'Current password is incorrect.', 401);
        }

        const reusesCurrentPassword = legacyPassword
            ? newPassword === String(employee.EmployeeID)
            : await comparePassword(newPassword, employee.Password);
        if (reusesCurrentPassword) {
            throw new PasswordContinuationError(
                'PASSWORD_REUSE_NOT_ALLOWED',
                'New password must be different from the current password.',
                409
            );
        }

        const passwordHash = await hashPassword(newPassword);
        await connection.query(
            'UPDATE employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=?',
            [passwordHash, employee.EmployeeID]
        );

        let status;
        try {
            status = await resolveStatus(connection, String(employee.EmployeeID));
        } catch (error) {
            throw new PasswordContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                error
            );
        }
        const nextAction = passwordContinuationNextAction(status);

        const [freshRows] = await connection.query(
            `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword
             FROM employees WHERE EmployeeID=? LIMIT 1`,
            [employee.EmployeeID]
        );
        if (!freshRows?.[0]) {
            throw new PasswordContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }

        await connection.commit();
        transactionStarted = false;
        const [postCommitRows] = await connection.query(
            `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword
             FROM employees WHERE EmployeeID=? LIMIT 1`,
            [employee.EmployeeID]
        );
        if (!postCommitRows?.[0]) {
            throw new PasswordContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to load the updated employee profile.',
                503
            );
        }
        return { status, nextAction, employee: postCommitRows[0] };
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                if (error && !error.rollbackError) error.rollbackError = rollbackError;
            }
        }
        if (error instanceof PasswordContinuationError) throw error;
        throw new PasswordContinuationError(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            error
        );
    }
}

module.exports = {
    PasswordContinuationError,
    passwordContinuationNextAction,
    executePasswordContinuation,
};
