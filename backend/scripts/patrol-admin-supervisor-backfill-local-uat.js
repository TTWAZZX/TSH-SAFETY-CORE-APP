const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const stamp = `${Date.now()}`.slice(-9);
const employeeId = `PAS${stamp}`;
const marker = `CODX_PATROL_ADMIN_BACKFILL_${stamp}`;
const port = 6000 + Math.floor(Math.random() * 80);
const stack = String(process.env.PATROL_UAT_STACK || 'node').toLowerCase();
const origin = `http://127.0.0.1:${port}`;
const requestUrl = route => stack === 'php'
    ? `${origin}/api/index.php?route=${route.slice(1).replace('?', '&')}`
    : `${origin}/api${route}`;
const token = jwt.sign({ id: employeeId, name: marker, role: 'Admin', team: '' }, process.env.JWT_SECRET, { expiresIn: '1h' });
let db;
let server;

async function request(method, route, body) {
    const response = await fetch(requestUrl(route), {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, json: await response.json().catch(() => ({})) };
}

async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt++) {
        try {
            const response = await fetch(requestUrl('/health'));
            if (response.status > 0) return;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Local server did not start.');
}

async function cleanup() {
    if (!db) return;
    await db.query('DELETE FROM Admin_AuditLogs WHERE AdminID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Self_Checkin WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query("DELETE FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor'", [employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
    });
    await cleanup();

    const [[pastSession]] = await db.query(
        `SELECT SessionID,DATE_FORMAT(PatrolDate,'%Y-%m-%d') ScheduledDate
           FROM Patrol_Sessions
          WHERE PatrolDate<CURDATE() AND (Status IS NULL OR Status<>'Cancelled')
          ORDER BY PatrolDate DESC,PatrolRound,TeamID
          LIMIT 1`
    );
    assert.ok(pastSession, 'Local calendar needs one past Patrol session.');
    const [[scope]] = await db.query('SELECT Department,Unit FROM Employees WHERE Department IS NOT NULL ORDER BY EmployeeID LIMIT 1');
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)',
        [employeeId, marker, scope?.Department || '', scope?.Unit || '', 'Admin', 'Operator', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );
    await db.query("INSERT INTO Patrol_Roster(EmployeeID,RosterGroup,TargetPerYear,SortOrder) VALUES(?,'supervisor',12,999)", [employeeId]);

    const repoRoot = path.join(__dirname, '..', '..');
    server = stack === 'php'
        ? spawn('C:\\xampp\\php\\php.exe', ['-S', `127.0.0.1:${port}`, '-t', repoRoot], { cwd: repoRoot, env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
        : spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    await waitForServer();

    const body = {
        EmployeeID: employeeId,
        CheckinDate: pastSession.ScheduledDate,
        ScheduledSessionID: pastSession.SessionID,
        PatrolType: 'normal',
        Notes: marker,
    };
    let response = await request('POST', '/patrol/self-checkin', body);
    assert.strictEqual(response.status, 409, JSON.stringify(response.json));
    assert.strictEqual(response.json.code, 'PATROL_SUPERVISOR_MAKEUP_REQUIRED', JSON.stringify(response.json));

    response = await request('POST', '/patrol/admin-record/supervisor', body);
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));

    const [[saved]] = await db.query(
        `SELECT DATE_FORMAT(CheckinDate,'%Y-%m-%d') CheckinDate,PatrolType,ScheduledSessionID,RecordedBy
           FROM Patrol_Self_Checkin
          WHERE EmployeeID=? AND Notes=?
          LIMIT 1`,
        [employeeId, marker]
    );
    assert.ok(saved, 'Admin backfill was not persisted.');
    assert.strictEqual(saved.CheckinDate, pastSession.ScheduledDate);
    assert.strictEqual(saved.PatrolType, 'normal');
    assert.strictEqual(String(saved.ScheduledSessionID), String(pastSession.SessionID));
    assert.strictEqual(saved.RecordedBy, employeeId);

    response = await request('POST', '/patrol/admin-record/supervisor', body);
    assert.strictEqual(response.status, 409, 'Admin backfill must still reject a duplicate scheduled round.');

    console.log(`Patrol Admin supervisor backfill ${stack.toUpperCase()} Local UAT: PASS (${pastSession.ScheduledDate})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) server.kill();
    await cleanup().catch(() => {});
    if (db) {
        const [[residue]] = await db.query(`SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Roster WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Self_Checkin WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Admin_AuditLogs WHERE AdminID=?) count`, [employeeId, employeeId, employeeId, employeeId]).catch(() => [[{ count: -1 }]]);
        console.log(`Patrol Admin supervisor backfill UAT residue: ${Number(residue.count)}`);
        await db.end().catch(() => {});
    }
});
