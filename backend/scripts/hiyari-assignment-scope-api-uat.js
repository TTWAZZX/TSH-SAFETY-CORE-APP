'use strict';

if (process.env.HIYARI_SCOPE_UAT_ALLOW_DB_ACCESS !== 'YES') {
    console.error('Refusing Hiyari Assignment scope UAT: set HIYARI_SCOPE_UAT_ALLOW_DB_ACCESS=YES for read-only database access.');
    process.exit(1);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

function normalizedId(value) {
    return String(value || '').trim().toLowerCase();
}

async function getJson(base, route, token) {
    const response = await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await response.json();
    if (!response.ok) throw new Error(`${route} failed with ${response.status}: ${json.message || 'Unknown error'}`);
    return json.data;
}

async function main() {
    const year = Number(process.env.HIYARI_SCOPE_UAT_YEAR) || new Date().getFullYear();
    const [assignmentRows] = await db.query('SELECT EmployeeID FROM Hiyari_Assignments');
    const [reportRows] = await db.query(
        'SELECT id, ReporterID, RiskRank FROM HiyariReports WHERE DeletedAt IS NULL AND YEAR(ReportDate) = ?',
        [year]
    );
    const assignedIds = new Set(assignmentRows.map(row => normalizedId(row.EmployeeID)).filter(Boolean));
    const expectedAssigned = reportRows.filter(row => assignedIds.has(normalizedId(row.ReporterID)));
    const expectedOutside = reportRows.filter(row => !assignedIds.has(normalizedId(row.ReporterID)));

    const { admin } = await loadReadyTestUsers(db);
    const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '10m' });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const [all, assigned, outside, assignedStats] = await Promise.all([
            getJson(base, `/hiyari?year=${year}&assignmentScope=all`, token),
            getJson(base, `/hiyari?year=${year}&assignmentScope=assigned`, token),
            getJson(base, `/hiyari?year=${year}&assignmentScope=outside`, token),
            getJson(base, `/hiyari/stats?year=${year}&assignmentScope=assigned`, token),
        ]);

        if (all.length !== reportRows.length) throw new Error(`All scope mismatch: ${all.length}/${reportRows.length}`);
        if (assigned.length !== expectedAssigned.length) throw new Error(`Assigned scope mismatch: ${assigned.length}/${expectedAssigned.length}`);
        if (outside.length !== expectedOutside.length) throw new Error(`Outside scope mismatch: ${outside.length}/${expectedOutside.length}`);
        if (Number(assignedStats?.kpi?.total || 0) !== expectedAssigned.length) throw new Error('Assigned stats total differs from assigned list');
        if (assigned.some(row => Number(row.HasAssignment) !== 1)) throw new Error('Assigned list contains an outside-Assignment row');
        if (outside.some(row => Number(row.HasAssignment) === 1)) throw new Error('Outside list contains an assigned row');

        console.log(JSON.stringify({
            ok: true,
            readOnly: true,
            year,
            assignments: assignedIds.size,
            allReports: all.length,
            assignedReports: assigned.length,
            outsideAssignmentReports: outside.length,
            assignedRank: assigned.reduce((counts, row) => {
                const rank = row.Rank || row.RiskRank || 'Unspecified';
                counts[rank] = (counts[rank] || 0) + 1;
                return counts;
            }, {}),
        }, null, 2));
    } finally {
        await new Promise(resolve => server.close(resolve));
        await db.end();
    }
}

main().catch(error => {
    console.error(JSON.stringify({ ok: false, message: error.message }));
    process.exit(1);
});
