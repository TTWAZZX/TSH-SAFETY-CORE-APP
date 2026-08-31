'use strict';

const assert = require('assert');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const nodeBase = String(process.env.LOCAL_NODE_UAT_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const phpBase = String(process.env.LOCAL_PHP_UAT_URL || 'http://127.0.0.1:8099/api/index.php?route=').replace(/\/+$/, '');
const marker = `ZZBBS${Date.now().toString().slice(-8)}`;
const ids = { leaderA: `${marker}A`, leaderB: `${marker}B`, operator: `${marker}C` };
let db;
let auditBaseline = 0;

function tokenFor(row) {
    return jwt.sign({
        id: row.EmployeeID,
        name: row.EmployeeName,
        role: row.Role,
        department: row.Department,
        unit: row.Unit,
        position: row.Position,
    }, process.env.JWT_SECRET, { expiresIn: '30m' });
}

async function call(stack, route, { method = 'GET', token, body } = {}) {
    const base = stack === 'node' ? `${nodeBase}/api/bbs` : `${phpBase}bbs`;
    const separator = stack === 'php' && route.includes('?') ? '&' : '';
    const url = stack === 'php' && route.includes('?')
        ? `${base}${route.split('?')[0]}&${route.split('?')[1]}`
        : `${base}${separator}${route}`;
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { throw new Error(`${stack} ${route} returned ${response.status}: ${text.slice(0, 300)}`); }
    return { status: response.status, json };
}

async function main() {
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306),
    });
    const [[admin]] = await db.query('SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)=\'admin\' LIMIT 1', [process.env.PROD_UAT_ADMIN_ID]);
    assert.ok(admin, 'Configured local Admin employee is required.');
    const [[audit]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');
    auditBaseline = Number(audit.id || 0);
    const password = await bcrypt.hash(`${marker}!`, 4);
    const employees = [
        { EmployeeID: ids.leaderA, EmployeeName: 'BBS Phase1 Leader A', Position: 'หัวหน้ากลุ่ม' },
        { EmployeeID: ids.leaderB, EmployeeName: 'BBS Phase1 Leader B', Position: 'หัวหน้ากลุ่ม' },
        { EmployeeID: ids.operator, EmployeeName: 'BBS Phase1 Operator', Position: 'พนักงาน' },
    ];
    for (const employee of employees) {
        await db.query(
            `INSERT INTO Employees (EmployeeID,EmployeeName,Department,Unit,Role,Team,Position,CompanyEmail,Password,MustChangePassword)
             VALUES (?,?, 'MAINTENANCE SEC.','Tube Cutting','User','',?,?,?,0)`,
            [employee.EmployeeID, employee.EmployeeName, employee.Position, `${employee.EmployeeID.toLowerCase()}@thaisummit-harness.co.th`, password]
        );
        Object.assign(employee, { Department: 'MAINTENANCE SEC.', Unit: 'Tube Cutting', Role: 'User' });
    }
    const adminToken = tokenFor(admin);
    const leaderAToken = tokenFor(employees[0]);
    const leaderBToken = tokenFor(employees[1]);
    const operatorToken = tokenFor(employees[2]);

    for (const stack of ['node', 'php']) {
        const foundation = await call(stack, '/admin/foundation', { token: adminToken });
        assert.strictEqual(foundation.status, 200, `${stack} Admin foundation`);
        assert.strictEqual(foundation.json.data.summary.mappedPositions, 5, `${stack} mapping count`);
        const forbidden = await call(stack, '/admin/foundation', { token: leaderAToken });
        assert.strictEqual(forbidden.status, 403, `${stack} ordinary user Admin boundary`);
        const context = await call(stack, '/me/context?asOf=2026-08-25', { token: leaderAToken });
        assert.strictEqual(context.status, 200, `${stack} Group Leader context`);
        assert.strictEqual(context.json.data.bbsLevel, 'Group Leader');
        assert.strictEqual(context.json.data.configurationReady, true);
        assert.strictEqual(context.json.data.pilot.inPilot, true);
        assert.strictEqual(context.json.data.kpiRules[0].dueToday, true);
        const saturday = await call(stack, '/me/context?asOf=2026-08-29', { token: leaderAToken });
        assert.strictEqual(saturday.json.data.kpiRules[0].dueToday, false, `${stack} weekend exclusion`);
        const before = await call(stack, '/eligible-employees?asOf=2026-08-25', { token: leaderAToken });
        assert.deepStrictEqual(before.json.data.rows, [], `${stack} deny-by-default before assignment`);
    }

    const payload = {
        supervisorEmployeeId: ids.leaderA,
        memberEmployeeId: ids.operator,
        departmentId: 18,
        safetyUnitId: 2,
        assignmentType: 'permanent',
        effectiveFrom: '2026-08-25',
        effectiveTo: null,
        reason: marker,
    };
    const created = await call('node', '/admin/hierarchy-assignments', { method: 'POST', token: adminToken, body: payload });
    assert.strictEqual(created.status, 201, JSON.stringify(created.json));
    const assignmentId = Number(created.json.data.id);
    assert.ok(assignmentId > 0);

    for (const stack of ['node', 'php']) {
        const eligible = await call(stack, '/eligible-employees?asOf=2026-08-25', { token: leaderAToken });
        assert.strictEqual(eligible.status, 200);
        assert.deepStrictEqual(eligible.json.data.rows.map(row => row.EmployeeID), [ids.operator], `${stack} scoped eligible list`);
        const otherLeader = await call(stack, '/eligible-employees?asOf=2026-08-25', { token: leaderBToken });
        assert.deepStrictEqual(otherLeader.json.data.rows, [], `${stack} horizontal scope isolation`);
        const overlap = await call(stack, '/admin/hierarchy-assignments', { method: 'POST', token: adminToken, body: payload });
        assert.strictEqual(overlap.status, 409, `${stack} overlapping assignment guard`);
        const deniedWrite = await call(stack, '/admin/hierarchy-assignments', { method: 'POST', token: leaderAToken, body: payload });
        assert.strictEqual(deniedWrite.status, 403, `${stack} Admin write boundary`);
    }

    const updated = await call('php', `/admin/hierarchy-assignments/${assignmentId}`, { method: 'PUT', token: adminToken, body: { ...payload, assignmentType: 'temporary', effectiveTo: '2026-08-31' } });
    assert.strictEqual(updated.status, 200, JSON.stringify(updated.json));

    const eligibilityPayload = { eligibility: 'unavailable', effectiveFrom: '2026-08-25', effectiveTo: '2026-08-31', reason: marker };
    const eligibility = await call('node', `/admin/eligibility/${ids.operator}`, { method: 'PUT', token: adminToken, body: eligibilityPayload });
    assert.strictEqual(eligibility.status, 201, JSON.stringify(eligibility.json));
    const duplicateEligibility = await call('php', `/admin/eligibility/${ids.operator}`, { method: 'PUT', token: adminToken, body: eligibilityPayload });
    assert.strictEqual(duplicateEligibility.status, 409, 'PHP eligibility overlap guard');
    for (const stack of ['node', 'php']) {
        const operatorContext = await call(stack, '/me/context?asOf=2026-08-25', { token: operatorToken });
        assert.strictEqual(operatorContext.json.data.configurationReady, false);
        assert.strictEqual(operatorContext.json.data.denyReason, 'EMPLOYEE_NOT_ACTIVE');
    }

    const deactivated = await call('php', `/admin/hierarchy-assignments/${assignmentId}`, { method: 'DELETE', token: adminToken });
    assert.strictEqual(deactivated.status, 200, JSON.stringify(deactivated.json));
    console.log('BBS Phase 1 local Node/PHP authenticated UAT: PASS');
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
}).finally(async () => {
    if (!db) return;
    await db.query('DELETE FROM BBS_Employee_Eligibility WHERE EmployeeID IN (?,?,?)', Object.values(ids)).catch(() => {});
    await db.query('DELETE FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID IN (?,?,?) OR MemberEmployeeID IN (?,?,?)', [...Object.values(ids), ...Object.values(ids)]).catch(() => {});
    await db.query('DELETE FROM Admin_AuditLogs WHERE id>? AND Action LIKE \'BBS_%\'', [auditBaseline]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID IN (?,?,?)', Object.values(ids)).catch(() => {});
    const [[remainingEmployees]] = await db.query('SELECT COUNT(*) count FROM Employees WHERE EmployeeID IN (?,?,?)', Object.values(ids)).catch(() => [[{ count: -1 }]]);
    const [[remainingBbs]] = await db.query('SELECT (SELECT COUNT(*) FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID IN (?,?,?) OR MemberEmployeeID IN (?,?,?)) + (SELECT COUNT(*) FROM BBS_Employee_Eligibility WHERE EmployeeID IN (?,?,?)) count', [...Object.values(ids), ...Object.values(ids), ...Object.values(ids)]).catch(() => [[{ count: -1 }]]);
    console.log(`BBS Phase 1 UAT cleanup: employees=${remainingEmployees.count}, bbsRows=${remainingBbs.count}`);
    await db.end();
});
