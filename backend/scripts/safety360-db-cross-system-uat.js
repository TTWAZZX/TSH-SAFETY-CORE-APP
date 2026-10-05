'use strict';

const assert = require('assert');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const employeeId = process.env.SAFETY360_UAT_EMPLOYEE_ID || '002390';
const year = Number(process.env.SAFETY360_UAT_YEAR || new Date().getFullYear());
const phpBase = String(process.env.LOCAL_PHP_API_URL || 'http://localhost/tsh-safety-core/api/index.php?route=');
const markerPrefix = 'UAT-S360-DB-';
const marker = `${markerPrefix}${Date.now()}`;
let server;
let fixtureId = 0;
let baselineFingerprint = null;

function assertLocalDatabase() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing mutable UAT against non-local DB_HOST: ${host || '(empty)'}`);
    assert.match(String(process.env.DB_NAME || ''), /(?:uat|test|local|dev)/i, `Refusing mutable UAT against DB_NAME: ${process.env.DB_NAME || '(empty)'}`);
}

async function fingerprint() {
    const [countResult, targetResult] = await Promise.all([
        db.query(`SELECT
            (SELECT COUNT(*) FROM Employees) employees,
            (SELECT COUNT(*) FROM CCCF_FormA_Worker) cccfWorker,
            (SELECT COUNT(*) FROM CCCF_FormA_Worker WHERE EmployeeID=?) employeeWorker,
            (SELECT COUNT(*) FROM Employee_Activity_Target_Years) employeeTargetYears,
            (SELECT COUNT(*) FROM CCCF_Worker_Target_Snapshots) workerSnapshots`, [employeeId]),
        db.query(`SELECT EmployeeID,ActivityKey,TargetYear,YearlyTarget,PassPct,IsNA
                    FROM Employee_Activity_Target_Years
                   WHERE EmployeeID=? AND ActivityKey='cccf_worker' AND TargetYear=?
                   ORDER BY id`, [employeeId, year]),
    ]);
    return { counts: countResult[0][0], targetRows: targetResult[0] };
}

async function getJson(url, token) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await response.text();
    assert.strictEqual(response.status, 200, `${url}: ${text.slice(0, 700)}`);
    const body = JSON.parse(text);
    assert.strictEqual(body.success, true, `${url}: expected success=true`);
    return body.data;
}

function cccfTarget(profile) {
    const row = (profile.activityTargets || []).find(item => item.activityKey === 'cccf_worker');
    assert.ok(row, 'CCCF Worker must be an effective Safety 360 target');
    return {
        activityKey: row.activityKey,
        yearlyTarget: row.yearlyTarget,
        actualCount: row.actualCount,
        completionPct: row.completionPct,
        passPct: row.passPct,
        passed: row.passed,
        noData: row.noData,
        calculationScope: row.calculationScope,
        calculationMethod: row.calculationMethod,
        rawRecords: row.rawRecords,
        configuredCoverageTarget: row.configuredCoverageTarget,
    };
}

function assertParity(nodeProfile, phpProfile, expectedRawRecords) {
    assert.strictEqual(nodeProfile.employee.EmployeeID, employeeId);
    assert.strictEqual(phpProfile.employee.EmployeeID, employeeId);
    assert.strictEqual(nodeProfile.dataQuality.status, 'complete', 'Node database sources must be available');
    assert.strictEqual(phpProfile.dataQuality.status, 'complete', 'PHP database sources must be available');
    const nodeTarget = cccfTarget(nodeProfile);
    const phpTarget = cccfTarget(phpProfile);
    assert.deepStrictEqual(phpTarget, nodeTarget, 'PHP/Node CCCF Worker Safety 360 calculation parity');
    assert.strictEqual(nodeTarget.yearlyTarget, 235, 'Safety 360 must use the configured Unit coverage target');
    assert.strictEqual(nodeTarget.actualCount, 235, 'Safety 360 must use the authoritative Unit achieved override');
    assert.strictEqual(nodeTarget.completionPct, 100);
    assert.strictEqual(nodeTarget.passed, true);
    assert.strictEqual(nodeTarget.noData, false, 'A real zero is available data, not a source error');
    assert.strictEqual(nodeTarget.calculationMethod, 'cccf_worker_unit_achieved_override');
    assert.deepStrictEqual(nodeTarget.calculationScope, { type: 'department_unit', department: 'PRODUCTION 2 SEC.', unit: 'Production 2 Element' });
    assert.strictEqual(Number(nodeTarget.configuredCoverageTarget), 235);
    assert.strictEqual(Number(nodeTarget.rawRecords), expectedRawRecords, 'Raw personal records remain audit metadata and must not replace the authoritative Unit override');
}

async function main() {
    assertLocalDatabase();
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    await db.query(`DELETE FROM CCCF_FormA_Worker WHERE EmployeeID=? AND JobArea LIKE ?`, [employeeId, `${markerPrefix}%`]);
    const before = await fingerprint();
    baselineFingerprint = before;
    const [[employee]] = await db.query(`SELECT EmployeeID id,EmployeeName name,Department department,Unit unit,Team team,Position position,Role role
                                           FROM Employees WHERE EmployeeID=?`, [employeeId]);
    assert.ok(employee, `Employee ${employeeId} is required`);
    assert.strictEqual(Number(before.counts.employeeWorker), 0, `${employeeId} must be a true-zero local baseline before the isolated fixture`);
    assert.ok(before.targetRows.length, `${employeeId} requires a CCCF Worker target for ${year}`);
    assert.ok(Number(before.targetRows[0].YearlyTarget) > 1, 'Expected a people-coverage target greater than one for denominator regression');

    const { admin } = await loadReadyTestUsers(db);
    const adminToken = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '20m' });
    server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const nodeBase = `http://127.0.0.1:${server.address().port}/api`;

    const [nodeZero, phpZero] = await Promise.all([
        getJson(`${nodeBase}/person-search/profile/${employeeId}?year=${year}`, adminToken),
        getJson(`${phpBase}person-search/profile/${employeeId}&year=${year}`, adminToken),
    ]);
    assertParity(nodeZero, phpZero, 0);

    const [insert] = await db.query(`INSERT INTO CCCF_FormA_Worker
        (EmployeeName,EmployeeID,Department,SafetyUnit,SubmitDate,JobArea,HazardDescription,CreatedBy)
        VALUES (?,?,?,?,?,?,?,?)`, [employee.name, employeeId, employee.department, employee.unit, `${year}-06-15`, marker, marker, admin.id]);
    fixtureId = Number(insert.insertId);

    const [nodeComplete, phpComplete] = await Promise.all([
        getJson(`${nodeBase}/person-search/profile/${employeeId}?year=${year}`, adminToken),
        getJson(`${phpBase}person-search/profile/${employeeId}&year=${year}`, adminToken),
    ]);
    assertParity(nodeComplete, phpComplete, 1);
    assert.deepStrictEqual(
        cccfTarget(nodeComplete),
        cccfTarget(phpComplete),
        'Completed profile must remain identical across stacks'
    );

    console.log(`PASS Safety 360 DB cross-system audit: ${employeeId} Unit achieved override=235/235 (100%) before/after isolated raw record, PHP/Node parity`);
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (fixtureId) await db.query('DELETE FROM CCCF_FormA_Worker WHERE id=? AND JobArea=?', [fixtureId, marker]).catch(() => {});
    const [[remaining]] = await db.query('SELECT COUNT(*) count FROM CCCF_FormA_Worker WHERE EmployeeID=? AND JobArea LIKE ?', [employeeId, `${markerPrefix}%`]).catch(() => [[{ count: -1 }]]);
    console.log(`Safety 360 DB cleanup: fixtureRows=${remaining.count}`);
    if (Number(remaining.count) !== 0) process.exitCode = 1;
    if (baselineFingerprint) {
        const after = await fingerprint().catch(() => null);
        try { assert.deepStrictEqual(after, baselineFingerprint, 'Safety 360 DB UAT must restore guarded row counts and target configuration'); }
        catch (error) { console.error(error.message); process.exitCode = 1; }
    }
    await db.end().catch(() => {});
});
