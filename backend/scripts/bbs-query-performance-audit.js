'use strict';

const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const measuredRuns = Math.max(3, Math.min(20, Number(process.env.BBS_QUERY_AUDIT_RUNS || 7)));

function percentile(sorted, ratio) {
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

(async () => {
    const admin = (await loadReadyTestUsers(db)).admin;
    const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '5m' });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/bbs/eligible-employees`;

    try {
        const request = async () => {
            const started = performance.now();
            const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
            return { durationMs: performance.now() - started, rows: payload?.data?.rows || [] };
        };

        await request();
        const originalQuery = db.query.bind(db);
        const queryTrace = [];
        db.query = async (sql, values) => {
            const started = performance.now();
            const result = await originalQuery(sql, values);
            queryTrace.push({
                durationMs: performance.now() - started,
                statement: String(sql).replace(/\s+/g, ' ').trim().slice(0, 120),
            });
            return result;
        };

        const samples = [];
        let responseRows = [];
        for (let index = 0; index < measuredRuns; index += 1) {
            const result = await request();
            samples.push(result.durationMs);
            responseRows = result.rows;
        }
        db.query = originalQuery;
        const asOf = new Date(Date.now() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
        const [legacyRows] = await originalQuery(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,
                    p.id PositionID,md.id DepartmentID,su.id SafetyUnitID
               FROM Employees e
               JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
               JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
               LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department))
               LEFT JOIN Master_SafetyUnits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit))
               LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(
                    SELECT ee.id FROM BBS_Employee_Eligibility ee
                     WHERE ee.EmployeeID=e.EmployeeID AND ee.IsActive=1
                       AND ee.EffectiveFrom<=? AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?)
                     ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
              WHERE COALESCE(elig.Eligibility,'active')='active'
              ORDER BY e.Department,e.Unit,e.EmployeeName`,
            [asOf, asOf]
        );
        const comparable = rows => rows.map(row => [
            String(row.EmployeeID), row.EmployeeName, row.Department, row.Unit, row.Position, row.BBSLevel,
            Number(row.PositionID), row.DepartmentID === null ? null : Number(row.DepartmentID), row.SafetyUnitID === null ? null : Number(row.SafetyUnitID),
        ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const comparableResponse = comparable(responseRows);
        const comparableLegacy = comparable(legacyRows);
        const projectionMatchesLegacy = JSON.stringify(comparableResponse) === JSON.stringify(comparableLegacy);
        if (!projectionMatchesLegacy) {
            const mismatchIndex = Array.from({ length: Math.max(comparableResponse.length, comparableLegacy.length) }, (_, index) => index)
                .find(index => JSON.stringify(comparableResponse[index]) !== JSON.stringify(comparableLegacy[index]));
            throw new Error(`Optimized Admin eligible-employee projection differs from the legacy SQL result at row ${mismatchIndex}; optimized=${JSON.stringify(comparableResponse[mismatchIndex])}; legacy=${JSON.stringify(comparableLegacy[mismatchIndex])}`);
        }
        samples.sort((a, b) => a - b);
        queryTrace.sort((a, b) => b.durationMs - a.durationMs);
        console.log(JSON.stringify({
            endpoint: '/api/bbs/eligible-employees',
            mode: 'Admin',
            rows: responseRows.length,
            projectionMatchesLegacy,
            runs: measuredRuns,
            minMs: Number(samples[0].toFixed(1)),
            medianMs: Number(percentile(samples, 0.5).toFixed(1)),
            p95Ms: Number(percentile(samples, 0.95).toFixed(1)),
            queryCountPerRequest: Number((queryTrace.length / measuredRuns).toFixed(1)),
            slowestQueries: queryTrace.slice(0, 5).map(row => ({
                durationMs: Number(row.durationMs.toFixed(1)),
                statement: row.statement,
            })),
        }, null, 2));
    } finally {
        await new Promise(resolve => server.close(resolve));
        await db.end();
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
