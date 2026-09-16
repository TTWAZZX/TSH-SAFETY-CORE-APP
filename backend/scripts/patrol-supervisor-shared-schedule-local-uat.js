const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const stamp = `${Date.now()}`.slice(-9);
const employeeId = `PSS${stamp}`;
const marker = `CODX_PATROL_SHARED_${stamp}`;
const port = 5900 + Math.floor(Math.random() * 80);
const stack = String(process.env.PATROL_UAT_STACK || 'node').toLowerCase();
const origin = `http://127.0.0.1:${port}`;
const requestUrl = route => stack === 'php'
    ? `${origin}/api/index.php?route=${route.slice(1).replace('?', '&')}`
    : `${origin}/api${route}`;
let db;
let server;

const bangkokToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
};
const token = jwt.sign({ id: employeeId, name: marker, role: 'User', team: '' }, process.env.JWT_SECRET, { expiresIn: '1h' });

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
    await db.query('DELETE FROM Patrol_EmailOutbox WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Leave_Requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
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

    const today = bangkokToday();
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const [todayRows] = await db.query(
        `SELECT s.SessionID,s.PatrolDate,s.PatrolRound,a.Name AS AreaName,a.Code AS AreaCode
           FROM Patrol_Sessions s
           LEFT JOIN Patrol_Areas a ON a.id=s.AreaID
          WHERE DATE(s.PatrolDate)=? AND (s.Status IS NULL OR s.Status<>'Cancelled')
          ORDER BY s.PatrolRound,s.TeamID`,
        [today]
    );
    const byRound = new Map();
    for (const row of todayRows) {
        const round = Number(row.PatrolRound || 0);
        if (!byRound.has(round)) byRound.set(round, []);
        byRound.get(round).push(row);
    }
    const sharedCandidates = [...byRound.values()].find(rows => rows.length >= 2);
    assert.ok(sharedCandidates, `Local calendar needs at least two area sessions on ${today}`);

    const [[monthProjection]] = await db.query(
        `SELECT COUNT(*) SelectableSessions,
                COUNT(DISTINCT CONCAT(DATE_FORMAT(PatrolDate,'%Y-%m-%d'),':',PatrolRound)) CalendarOccurrences
           FROM Patrol_Sessions
          WHERE YEAR(PatrolDate)=? AND MONTH(PatrolDate)=?
            AND (Status IS NULL OR Status<>'Cancelled')`,
        [year, month]
    );
    const expectedRequirement = Math.ceil(Number(monthProjection.CalendarOccurrences || 0) / 2);

    const [[scope]] = await db.query('SELECT Department,Unit FROM Employees WHERE Department IS NOT NULL ORDER BY EmployeeID LIMIT 1');
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)',
        [employeeId, marker, scope?.Department || '', scope?.Unit || '', 'User', 'Operator', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );
    await db.query("INSERT INTO Patrol_Roster(EmployeeID,RosterGroup,TargetPerYear,SortOrder) VALUES(?,'supervisor',12,999)", [employeeId]);

    const repoRoot = path.join(__dirname, '..', '..');
    server = stack === 'php'
        ? spawn('C:\\xampp\\php\\php.exe', ['-S', `127.0.0.1:${port}`, '-t', repoRoot], { cwd: repoRoot, env: process.env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
        : spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    await waitForServer();

    let response = await request('GET', `/patrol/my-self-patrol?year=${year}&month=${month}`);
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));
    const openIds = new Set((response.json.data.openSchedule || []).map(row => String(row.ScheduledSessionID || row.id)));
    sharedCandidates.forEach(row => assert.ok(openIds.has(String(row.SessionID)), `missing shared area session ${row.SessionID}`));
    assert.strictEqual(Number(response.json.data.monthlyRequirement), expectedRequirement, 'area choices must not inflate KPI');

    const selected = sharedCandidates[0];
    const sibling = sharedCandidates[1];
    response = await request('POST', '/patrol/self-checkin', {
        CheckinDate: today,
        Location: 'CLIENT_SPOOFED_AREA',
        Notes: marker,
        ScheduledSessionID: selected.SessionID,
        PatrolType: 'normal',
    });
    assert.strictEqual(response.status, 200, JSON.stringify(response.json));
    const [[saved]] = await db.query('SELECT Location FROM Patrol_Self_Checkin WHERE EmployeeID=? ORDER BY id DESC LIMIT 1', [employeeId]);
    assert.strictEqual(saved.Location, selected.AreaName || selected.AreaCode, 'server must freeze the selected session area');

    response = await request('POST', '/patrol/self-checkin', {
        CheckinDate: today,
        ScheduledSessionID: sibling.SessionID,
        PatrolType: 'normal',
    });
    assert.strictEqual(response.status, 409, 'a second area in the same date/round must be rejected');

    response = await request('GET', `/patrol/my-self-patrol?year=${year}&month=${month}`);
    assert.strictEqual(response.status, 200);
    const updatedOpenIds = new Set((response.json.data.openSchedule || []).map(row => String(row.ScheduledSessionID || row.id)));
    sharedCandidates.forEach(row => assert.ok(!updatedOpenIds.has(String(row.SessionID)), 'completed occurrence must close every sibling area option'));

    const [[future]] = await db.query("SELECT SessionID,DATE_FORMAT(PatrolDate,'%Y-%m-%d') ScheduledDate FROM Patrol_Sessions WHERE PatrolDate>? AND (Status IS NULL OR Status<>'Cancelled') ORDER BY PatrolDate LIMIT 1", [`${today} 23:59:59`]);
    if (future) {
        response = await request('POST', '/patrol/self-checkin', { CheckinDate: future.ScheduledDate, ScheduledSessionID: future.SessionID, PatrolType: 'normal' });
        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.json.code, 'PATROL_FUTURE_SUPERVISOR_CHECKIN_NOT_ALLOWED', JSON.stringify(response.json));
    }

    const [[past]] = await db.query("SELECT SessionID,DATE_FORMAT(PatrolDate,'%Y-%m-%d') ScheduledDate FROM Patrol_Sessions WHERE PatrolDate<? AND (Status IS NULL OR Status<>'Cancelled') ORDER BY PatrolDate DESC LIMIT 1", [`${today} 00:00:00`]);
    if (past) {
        response = await request('POST', '/patrol/self-checkin', { CheckinDate: past.ScheduledDate, ScheduledSessionID: past.SessionID, PatrolType: 'normal' });
        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.json.code, 'PATROL_SUPERVISOR_MAKEUP_REQUIRED', JSON.stringify(response.json));
        response = await request('POST', '/patrol/self-checkin', { CheckinDate: today, ScheduledSessionID: past.SessionID, PatrolType: 'compensation' });
        assert.strictEqual(response.status, 200, JSON.stringify(response.json));
        assert.strictEqual(response.json.data.checkin.isMakeup, true);
        assert.strictEqual(response.json.data.checkin.actualDate, today);
        assert.strictEqual(response.json.data.checkin.scheduledDate, past.ScheduledDate);
    }

    console.log(`Patrol supervisor shared schedule ${stack.toUpperCase()} Local UAT: PASS (${sharedCandidates.length} area choices, ${monthProjection.CalendarOccurrences} KPI occurrences)`);
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
            (SELECT COUNT(*) FROM Patrol_EmailOutbox WHERE EmployeeID=?) count`, [employeeId, employeeId, employeeId, employeeId]).catch(() => [[{ count: -1 }]]);
        console.log(`Patrol supervisor shared schedule UAT residue: ${Number(residue.count)}`);
        await db.end().catch(() => {});
    }
});
