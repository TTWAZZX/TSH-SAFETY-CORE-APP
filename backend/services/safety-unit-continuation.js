'use strict';

const {
    ONBOARDING_STATUS,
    buildOnboardingMasterIndex,
    normalizeOnboardingName,
    resolveEmployeeOnboarding,
} = require('../utils/onboarding-resolver');

class SafetyUnitContinuationError extends Error {
    constructor(code, message, httpStatus, cause = null) {
        super(message);
        this.name = 'SafetyUnitContinuationError';
        this.code = code;
        this.httpStatus = httpStatus;
        if (cause) this.cause = cause;
    }
}

async function loadSafetyUnitSelection(connection, employee, requestedUnit) {
    try {
        const [departments] = await connection.query('SELECT id,Name FROM master_departments ORDER BY id');
        const [units] = await connection.query(
            'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'
        );
        const masterIndex = buildOnboardingMasterIndex({ departments, units });
        const departmentId = masterIndex.departmentsByName.get(normalizeOnboardingName(employee.Department));
        if (!departmentId) {
            throw new SafetyUnitContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }
        const departmentUnits = masterIndex.unitsByDepartmentId.get(departmentId);
        if (!departmentUnits || departmentUnits.size === 0) {
            return { hasSafetyUnits: false, canonicalUnit: null };
        }
        const requestedKey = normalizeOnboardingName(requestedUnit);
        const selected = units.find(unit => String(unit.department_id) === String(departmentId)
            && normalizeOnboardingName(unit.name ?? unit.Name) === requestedKey);
        return {
            hasSafetyUnits: true,
            canonicalUnit: selected ? String(selected.name ?? selected.Name) : null,
        };
    } catch (error) {
        if (error instanceof SafetyUnitContinuationError) throw error;
        throw new SafetyUnitContinuationError(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            error
        );
    }
}

async function executeSafetyUnitContinuation({
    connection,
    employeeId,
    requestedUnit,
    resolveStatus = resolveEmployeeOnboarding,
}) {
    if (!connection || typeof connection.query !== 'function'
        || typeof connection.beginTransaction !== 'function') {
        throw new TypeError('Safety Unit continuation requires a transaction-capable connection.');
    }
    if (typeof requestedUnit !== 'string' || normalizeOnboardingName(requestedUnit) === '') {
        throw new SafetyUnitContinuationError(
            'SAFETY_UNIT_VALUE_REQUIRED',
            'Safety Unit is required.',
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
            throw new SafetyUnitContinuationError('EMPLOYEE_NOT_FOUND', 'Employee was not found.', 404);
        }

        let initialStatus;
        try {
            initialStatus = await resolveStatus(connection, String(employee.EmployeeID));
        } catch (error) {
            throw new SafetyUnitContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                error
            );
        }
        if (initialStatus === ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED) {
            throw new SafetyUnitContinuationError(
                ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED,
                'Password change is required before selecting a Safety Unit.',
                428
            );
        }

        const selection = await loadSafetyUnitSelection(connection, employee, requestedUnit);
        if (initialStatus === ONBOARDING_STATUS.READY) {
            if (!selection.hasSafetyUnits) {
                throw new SafetyUnitContinuationError(
                    'SAFETY_UNIT_NOT_REQUIRED',
                    'This department does not require a Safety Unit.',
                    409
                );
            }
            const sameUnit = selection.canonicalUnit !== null
                && normalizeOnboardingName(employee.Unit) === normalizeOnboardingName(selection.canonicalUnit);
            if (!sameUnit) {
                throw new SafetyUnitContinuationError(
                    'ONBOARDING_ALREADY_COMPLETED',
                    'Safety Unit onboarding has already been completed.',
                    409
                );
            }
            const [freshRows] = await connection.query(
                `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword
                 FROM employees WHERE EmployeeID=? LIMIT 1`,
                [employee.EmployeeID]
            );
            if (!freshRows?.[0]) {
                throw new SafetyUnitContinuationError(
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
                throw new SafetyUnitContinuationError(
                    'ONBOARDING_STATE_UNAVAILABLE',
                    'Unable to load the updated employee profile.',
                    503
                );
            }
            return {
                status: ONBOARDING_STATUS.READY,
                nextAction: 'ENTER_APP',
                employee: postCommitRows[0],
                idempotent: true,
            };
        }

        if (initialStatus !== ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED) {
            throw new SafetyUnitContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }
        if (!selection.hasSafetyUnits) {
            throw new SafetyUnitContinuationError(
                'SAFETY_UNIT_NOT_REQUIRED',
                'This department does not require a Safety Unit.',
                409
            );
        }
        if (selection.canonicalUnit === null) {
            throw new SafetyUnitContinuationError(
                'INVALID_SAFETY_UNIT',
                'Safety Unit is not allowed for this department.',
                422
            );
        }

        await connection.query(
            'UPDATE employees SET Unit=? WHERE EmployeeID=?',
            [selection.canonicalUnit, employee.EmployeeID]
        );

        let finalStatus;
        try {
            finalStatus = await resolveStatus(connection, String(employee.EmployeeID));
        } catch (error) {
            throw new SafetyUnitContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503,
                error
            );
        }
        if (finalStatus !== ONBOARDING_STATUS.READY) {
            throw new SafetyUnitContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to verify onboarding state.',
                503
            );
        }

        const [freshRows] = await connection.query(
            `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword
             FROM employees WHERE EmployeeID=? LIMIT 1`,
            [employee.EmployeeID]
        );
        if (!freshRows?.[0]) {
            throw new SafetyUnitContinuationError(
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
            throw new SafetyUnitContinuationError(
                'ONBOARDING_STATE_UNAVAILABLE',
                'Unable to load the updated employee profile.',
                503
            );
        }
        return {
            status: finalStatus,
            nextAction: 'ENTER_APP',
            employee: postCommitRows[0],
            idempotent: false,
        };
    } catch (error) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                if (error && !error.rollbackError) error.rollbackError = rollbackError;
            }
        }
        if (error instanceof SafetyUnitContinuationError) throw error;
        throw new SafetyUnitContinuationError(
            'ONBOARDING_STATE_UNAVAILABLE',
            'Unable to verify onboarding state.',
            503,
            error
        );
    }
}

module.exports = {
    SafetyUnitContinuationError,
    loadSafetyUnitSelection,
    executeSafetyUnitContinuation,
};
