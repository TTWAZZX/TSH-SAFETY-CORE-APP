'use strict';

const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const number = value => Number(value || 0);

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
    });
    try {
        const [[scope]] = await db.query(
            `SELECT d.id DepartmentID,d.Name DepartmentName,u.id SafetyUnitID,u.name SafetyUnitName
               FROM Master_Departments d
               JOIN Master_SafetyUnits u ON u.department_id=d.id
              WHERE LOWER(TRIM(d.Name))='maintenance sec.'
                AND LOWER(TRIM(u.name))='tube cutting'
              LIMIT 1`
        );
        if (!scope) throw new Error('Approved Pilot Master scope is unavailable.');

        const [pilotEmployees] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Position,e.Role,
                    mp.id PositionID,COALESCE(m.BBSLevel,'Unmapped') BBSLevel
               FROM Employees e
               LEFT JOIN Master_Positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position))
               LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=mp.id AND m.IsActive=1
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))
                AND LOWER(TRIM(e.Unit))=LOWER(TRIM(?))
              ORDER BY FIELD(COALESCE(m.BBSLevel,'Unmapped'),'Group Leader','Operator','Department Head','Section Head','Manager','Unmapped'),e.EmployeeID`,
            [scope.DepartmentName, scope.SafetyUnitName]
        );

        const [departmentOperators] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Position,
                    COALESCE(NULLIF(TRIM(e.Unit),''),'(no unit)') SafetyUnit
               FROM Employees e
               JOIN Master_Positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position))
               JOIN BBS_Position_Level_Mappings m ON m.PositionID=mp.id AND m.IsActive=1 AND m.BBSLevel='Operator'
              WHERE LOWER(TRIM(e.Department))=LOWER(TRIM(?))
              ORDER BY SafetyUnit,e.EmployeeID`,
            [scope.DepartmentName]
        );

        const [[adminReadiness]] = await db.query(
            `SELECT COUNT(*) ActiveAdminAccounts,
                    SUM(CompanyEmail IS NOT NULL AND TRIM(CompanyEmail)<>'') AdminsWithEmail
               FROM Employees WHERE LOWER(Role)='admin'`
        );

        const findings = [];
        if (!pilotEmployees.some(row => row.BBSLevel === 'Group Leader')) findings.push('BUSINESS_OWNER_MUST_SELECT_GROUP_LEADER');
        if (!pilotEmployees.some(row => row.BBSLevel === 'Operator')) findings.push('BUSINESS_OWNER_MUST_CONFIRM_REAL_TUBE_CUTTING_OPERATORS');
        if (pilotEmployees.some(row => row.BBSLevel === 'Unmapped')) findings.push('PILOT_POSITION_MAPPING_REQUIRED');
        if (pilotEmployees.some(row => /test|ทดสอบ/i.test(String(row.EmployeeName || '')))) findings.push('PILOT_ROSTER_CONTAINS_TEST_ACCOUNT');
        if (number(adminReadiness.ActiveAdminAccounts) < 2) findings.push('TWO_ADMIN_OWNER_VERIFIER_ACCOUNTS_REQUIRED');

        console.log(JSON.stringify({
            readOnly: true,
            approvedScope: {
                departmentId: number(scope.DepartmentID),
                department: scope.DepartmentName,
                safetyUnitId: number(scope.SafetyUnitID),
                safetyUnit: scope.SafetyUnitName,
            },
            pilotEmployees: pilotEmployees.map(row => ({
                employeeId: row.EmployeeID,
                employeeName: row.EmployeeName,
                position: row.Position,
                role: row.Role,
                positionId: row.PositionID === null ? null : number(row.PositionID),
                bbsLevel: row.BBSLevel,
            })),
            operatorCandidatesInDepartment: departmentOperators.map(row => ({
                employeeId: row.EmployeeID,
                employeeName: row.EmployeeName,
                position: row.Position,
                safetyUnit: row.SafetyUnit,
            })),
            adminReadiness: {
                activeAdminAccounts: number(adminReadiness.ActiveAdminAccounts),
                adminsWithEmail: number(adminReadiness.AdminsWithEmail),
            },
            findings,
            nextDecision: findings.includes('BUSINESS_OWNER_MUST_CONFIRM_REAL_TUBE_CUTTING_OPERATORS')
                ? 'Confirm which real Employee Master records belong to Tube Cutting as Operators before creating enrollment/team/schedule records.'
                : 'Review the Phase 10E acceptance audit for remaining Checklist, card, handler, second team member and workflow evidence requirements.',
        }, null, 2));
        console.log('BBS Phase 10E Pilot Master audit: PASS (read-only)');
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
