'use strict';

const { ONBOARDING_STATUS, createOnboardingResolver } = require('../utils/onboarding-resolver');

function tokenPayload(employee) {
    return {
        id: employee.EmployeeID,
        name: employee.EmployeeName,
        department: employee.Department || '',
        unit: employee.Unit || '',
        team: employee.Team || '',
        position: employee.Position || '',
        role: employee.Role || 'User',
        mustChangePassword: Boolean(employee.MustChangePassword),
    };
}

async function loadReadyTestUsers(db) {
    const ready = await loadReadyEmployees(db);
    const admin = ready.find(employee => String(employee.role || '').toLowerCase() === 'admin');
    const user = ready.find(employee => String(employee.role || '').toLowerCase() === 'user');
    if (!admin || !user) {
        throw new Error('A READY Admin and READY User are required for read-only API verification.');
    }
    return { admin, user };
}

async function loadReadyEmployees(db) {
    const [[employees], [departments], [units]] = await Promise.all([
        db.query(
            `SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword
             FROM employees ORDER BY EmployeeID`
        ),
        db.query('SELECT id,Name FROM master_departments ORDER BY id'),
        db.query('SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id'),
    ]);
    const resolver = createOnboardingResolver({ departments, units });
    const ready = employees.filter(employee => {
        try { return resolver.resolve(employee) === ONBOARDING_STATUS.READY; }
        catch (_) { return false; }
    });
    return ready.map(tokenPayload);
}

module.exports = { loadReadyEmployees, loadReadyTestUsers };
