'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../db');
const {
    ONBOARDING_STATUS,
    createOnboardingResolver,
    normalizeOnboardingName,
} = require('../utils/onboarding-resolver');

function duplicateNormalizedCount(rows, keySelector) {
    const counts = new Map();
    for (const row of rows) {
        const key = keySelector(row);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.values()].filter(count => count > 1).length;
}

(async () => {
    const [engineRows] = await pool.query(
        "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME)='employees' LIMIT 1"
    );
    const [employees] = await pool.query(
        'SELECT EmployeeID,EmployeeName,Department,Unit,Position,Password,MustChangePassword FROM employees'
    );
    const [departments] = await pool.query('SELECT id,Name FROM master_departments ORDER BY id');
    const [units] = await pool.query('SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id');
    const [positions] = await pool.query('SELECT id,Name FROM master_positions ORDER BY id');

    const departmentsByName = new Map(
        departments.map(row => [normalizeOnboardingName(row.Name), String(row.id)])
    );
    const unitsByDepartmentId = new Map(departments.map(row => [String(row.id), new Set()]));
    for (const unit of units) {
        unitsByDepartmentId.get(String(unit.department_id))?.add(normalizeOnboardingName(unit.name));
    }
    const positionNames = new Set(positions.map(row => normalizeOnboardingName(row.Name)));
    const resolver = createOnboardingResolver({ departments, units });
    const statuses = {
        [ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED]: 0,
        [ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED]: 0,
        [ONBOARDING_STATUS.READY]: 0,
    };
    const anomalies = {
        blankEmployeeNames: 0,
        overlongEmployeeNames: 0,
        unknownDepartments: 0,
        missingRequiredUnits: 0,
        invalidUnitsForDepartment: 0,
        unexpectedUnitsForDepartmentWithoutUnits: 0,
        blankPositions: 0,
        invalidPositions: 0,
        employeesWithHiddenWhitespace: 0,
        resolutionErrors: 0,
        duplicateNormalizedDepartments: duplicateNormalizedCount(
            departments,
            row => normalizeOnboardingName(row.Name)
        ),
        duplicateNormalizedUnitsWithinDepartment: duplicateNormalizedCount(
            units,
            row => `${row.department_id}|${normalizeOnboardingName(row.name)}`
        ),
        duplicateNormalizedPositions: duplicateNormalizedCount(
            positions,
            row => normalizeOnboardingName(row.Name)
        ),
    };

    for (const employee of employees) {
        const employeeName = String(employee.EmployeeName ?? '');
        if (!employeeName.replace(/[\r\n]/g, '').trim()) anomalies.blankEmployeeNames += 1;
        if (Array.from(employeeName.replace(/[\r\n]/g, '').trim()).length > 255) {
            anomalies.overlongEmployeeNames += 1;
        }
        const departmentId = departmentsByName.get(normalizeOnboardingName(employee.Department));
        if (!departmentId) anomalies.unknownDepartments += 1;
        const unitKey = normalizeOnboardingName(employee.Unit);
        const allowedUnits = departmentId ? unitsByDepartmentId.get(departmentId) : null;
        if (allowedUnits?.size > 0 && !unitKey) anomalies.missingRequiredUnits += 1;
        if (allowedUnits?.size > 0 && unitKey && !allowedUnits.has(unitKey)) {
            anomalies.invalidUnitsForDepartment += 1;
        }
        if (allowedUnits && allowedUnits.size === 0 && unitKey) {
            anomalies.unexpectedUnitsForDepartmentWithoutUnits += 1;
        }
        const positionKey = normalizeOnboardingName(employee.Position);
        if (!positionKey) anomalies.blankPositions += 1;
        else if (!positionNames.has(positionKey)) anomalies.invalidPositions += 1;
        if ([employee.EmployeeName, employee.Department, employee.Unit, employee.Position]
            .some(value => /[\r\n]/.test(String(value ?? ''))
                || String(value ?? '') !== String(value ?? '').trim())) {
            anomalies.employeesWithHiddenWhitespace += 1;
        }
        try {
            statuses[resolver.resolve(employee)] += 1;
        } catch {
            anomalies.resolutionErrors += 1;
        }
    }

    console.log(JSON.stringify({
        readOnly: true,
        employeesEngine: engineRows[0]?.ENGINE || null,
        employees: employees.length,
        masters: { departments: departments.length, safetyUnits: units.length, positions: positions.length },
        positionRelationship: 'GLOBAL',
        statuses,
        anomalies,
    }, null, 2));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await pool.end();
});
