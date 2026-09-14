'use strict';

const assert = require('assert');
const db = require('../db');

function jsonValue(column, key) {
    return `NULLIF(JSON_UNQUOTE(JSON_EXTRACT(CASE WHEN JSON_VALID(${column}) THEN ${column} ELSE '{}' END, '$.${key}')), 'null')`;
}

(async () => {
    const newDepartment = jsonValue('l.NewValue', 'curriculumDepartment');
    const oldDepartment = jsonValue('l.OldValue', 'curriculumDepartment');
    const newUnit = jsonValue('l.NewValue', 'employeeUnit');
    const oldUnit = jsonValue('l.OldValue', 'employeeUnit');
    const newYear = jsonValue('l.NewValue', 'year');
    const oldYear = jsonValue('l.OldValue', 'year');
    const scopeDepartment = `COALESCE(${newDepartment},${oldDepartment},c.Department)`;
    const logUnit = `COALESCE(${newUnit},${oldUnit},e.Unit)`;
    const logYear = `COALESCE(${newYear},${oldYear},c.\`Year\`)`;
    const joins = `FROM FourM_CurriculumLogs l
        LEFT JOIN FourM_Curriculums c ON c.id=l.CurriculumID
        LEFT JOIN FourM_Courses co ON co.id=l.CourseID
        LEFT JOIN Employees e ON e.EmployeeID=l.EmployeeID`;

    const [[totalRow]] = await db.query(`SELECT COUNT(*) total ${joins}`);
    const [page] = await db.query(
        `SELECT l.id,l.Action,${scopeDepartment} Department,${logUnit} Unit,${logYear} \`Year\`
         ${joins} ORDER BY l.PerformedAt DESC,l.id DESC LIMIT ? OFFSET ?`,
        [20, 0]
    );
    assert.ok(page.length <= 20);
    assert.ok(Number(totalRow.total) >= page.length);

    const [fixture] = await db.query(
        `SELECT l.EmployeeID,l.PerformedByID,${scopeDepartment} Department,${logUnit} Unit,${logYear} \`Year\`,DATE_FORMAT(l.PerformedAt,'%Y-%m-%d') PerformedDate
         ${joins} ORDER BY l.PerformedAt DESC,l.id DESC LIMIT 1`
    );
    if (fixture[0]) {
        const row = fixture[0];
        const filters = [];
        const params = [];
        if (row.EmployeeID) { filters.push('l.EmployeeID=?'); params.push(row.EmployeeID); }
        if (row.PerformedByID) { filters.push('l.PerformedByID=?'); params.push(row.PerformedByID); }
        if (row.Department) { filters.push(`${scopeDepartment}=?`); params.push(row.Department); }
        if (row.Unit) { filters.push(`${logUnit}=?`); params.push(row.Unit); }
        if (row.Year) { filters.push(`${logYear}=?`); params.push(row.Year); }
        if (row.PerformedDate) {
            const date = String(row.PerformedDate);
            filters.push('l.PerformedAt>=? AND l.PerformedAt<DATE_ADD(?,INTERVAL 1 DAY)');
            params.push(`${date} 00:00:00`, `${date} 00:00:00`);
        }
        const [[filtered]] = await db.query(
            `SELECT COUNT(*) total ${joins}${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''}`,
            params
        );
        assert.ok(Number(filtered.total) >= 1, 'combined filters must retain their source audit row');
    }
    console.log(`4M Training Matrix read-only query smoke passed (total=${Number(totalRow.total)}, page=${page.length}).`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await db.end();
});
