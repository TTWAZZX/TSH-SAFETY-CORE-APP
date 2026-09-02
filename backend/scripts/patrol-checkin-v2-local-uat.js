const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const stamp = `${Date.now()}`.slice(-9);
const employeeId = `PV2${stamp}`;
const marker = `CODX_PATROL_V2_${stamp}`;
const port = 5600 + Math.floor(Math.random() * 200);
const stack = String(process.env.PATROL_UAT_STACK || 'node').toLowerCase();
const origin = `http://127.0.0.1:${port}`;
const requestUrl = route => stack === 'php'
    ? `${origin}/api/index.php?route=${route.slice(1).replace('?', '&')}`
    : `${origin}/api${route}`;
let db;
let server;
let baseTeamId;
let rotatedTeamId;
let originalFlag;

const bangkokToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
};
const shiftDays = (date, delta) => {
    const value = new Date(`${date}T12:00:00Z`);
    value.setUTCDate(value.getUTCDate() + delta);
    return value.toISOString().slice(0, 10);
};
const token = role => jwt.sign({ id:employeeId, name:marker, role, team:'' }, process.env.JWT_SECRET, { expiresIn:'1h' });
async function request(method, route, auth, body) {
    const response = await fetch(requestUrl(route), {
        method,
        headers: { Authorization:`Bearer ${auth}`, ...(body ? {'Content-Type':'application/json'} : {}) },
        ...(body ? { body:JSON.stringify(body) } : {}),
    });
    const json = await response.json().catch(() => ({}));
    return { status:response.status, json };
}
async function waitForServer() {
    for (let i = 0; i < 80; i++) {
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
    await db.query('DELETE FROM Patrol_Attendance WHERE UserID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Leave_Requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Sessions WHERE CreatedBy=?', [marker]).catch(() => {});
    await db.query('DELETE FROM Patrol_Member_Rotation WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Roster WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Team_Members WHERE EmployeeID=?', [employeeId]).catch(() => {});
    if (baseTeamId) await db.query('DELETE FROM Patrol_Teams WHERE id=?', [baseTeamId]).catch(() => {});
    if (rotatedTeamId) await db.query('DELETE FROM Patrol_Teams WHERE id=?', [rotatedTeamId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost','127.0.0.1','::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    db = await mysql.createConnection({ host:process.env.DB_HOST, port:Number(process.env.DB_PORT || 3306), user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME });
    await cleanup();
    const [[flag]] = await db.query("SELECT value FROM App_Settings WHERE key_name='patrol_checkin_v2_enabled' LIMIT 1");
    originalFlag = String(flag?.value || '0');
    await db.query("UPDATE App_Settings SET value='1' WHERE key_name='patrol_checkin_v2_enabled'");
    const [[scope]] = await db.query(`
        SELECT d.Name AS Department,
               COALESCE((SELECT u.name FROM Master_SafetyUnits u WHERE u.department_id=d.id ORDER BY u.id LIMIT 1),'') AS Unit
          FROM Master_Departments d
         ORDER BY d.id
         LIMIT 1
    `);
    assert.ok(scope?.Department, 'A local Master Department is required for the onboarding-ready UAT fixture');
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)',
        [employeeId, marker, scope.Department, scope.Unit, 'User', 'Manager', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );
    let [insert] = await db.query("INSERT INTO Patrol_Teams(Name,PatrolGroup,Color) VALUES(?,'A','#059669')", [`${marker}_BASE`]);
    baseTeamId = Number(insert.insertId);
    [insert] = await db.query("INSERT INTO Patrol_Teams(Name,PatrolGroup,Color) VALUES(?,'B','#7c3aed')", [`${marker}_ROTATED`]);
    rotatedTeamId = Number(insert.insertId);
    await db.query("INSERT INTO Patrol_Team_Members(TeamID,EmployeeID,PatrolType) VALUES(?,?,'management')", [baseTeamId, employeeId]);
    await db.query("INSERT INTO Patrol_Roster(EmployeeID,RosterGroup,TargetPerYear,SortOrder) VALUES(?,'top_management',24,99)", [employeeId]);
    const today = bangkokToday();
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const priorYearDate = `${year - 1}-12-15`;
    const priorMonthDate = new Date(Date.UTC(year, month - 2, 15)).toISOString().slice(0, 10);
    const missingDate = shiftDays(today, -1);
    const legacyDate = `${year}-01-10`;
    await db.query('INSERT INTO Patrol_Member_Rotation(EmployeeID,TeamID,Year,Month) VALUES(?,?,?,?)', [employeeId, rotatedTeamId, year, month]);
    const sessions = [
        [`${marker}_PY`, priorYearDate, baseTeamId, 1],
        [`${marker}_PM`, priorMonthDate, baseTeamId, 1],
        [`${marker}_MISS`, missingDate, rotatedTeamId, 1],
        [`${marker}_TODAY1`, today, rotatedTeamId, 1],
        [`${marker}_TODAY2`, today, rotatedTeamId, 2],
        [`${marker}_TODAY3`, today, rotatedTeamId, 3],
        [`${marker}_TODAY4`, today, rotatedTeamId, 4],
        [`${marker}_LEGACY`, legacyDate, baseTeamId, 1],
    ];
    for (const [id,date,teamId,round] of sessions) {
        await db.query("INSERT INTO Patrol_Sessions(SessionID,PatrolDate,Year,Description,TeamName,Status,CreatedBy,TeamID,PatrolRound) VALUES(?,?,?,?,'','In Progress',?,?,?)", [id, `${date} 08:00:00`, Number(date.slice(0,4)), marker, marker, teamId, round]);
    }
    await db.query("INSERT INTO Patrol_Attendance(UserID,UserName,TeamName,WeekNumber,PatrolDate,Year,PatrolType,RecordedBy,ScheduledSessionID) VALUES(?,?,?,1,?,?, 'normal',?,NULL)", [employeeId, marker, `${marker}_BASE`, `${legacyDate} 09:00:00`, year, employeeId]);

    const repoRoot = path.join(__dirname, '..', '..');
    server = stack === 'php'
        ? spawn('C:\\xampp\\php\\php.exe', ['-S', `127.0.0.1:${port}`, '-t', repoRoot], { cwd:repoRoot, env:process.env, stdio:['ignore','ignore','pipe'], windowsHide:true })
        : spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname, '..'), env:{...process.env, PORT:String(port)}, stdio:['ignore','ignore','pipe'], windowsHide:true });
    let serverError = '';
    server.stderr.on('data', chunk => { serverError += chunk.toString(); });
    await waitForServer();
    const userToken = token('User');
    const adminToken = token('Admin');

    const missed = await request('GET', `/patrol/my-missed-sessions?year=${year}&scope=all`, userToken);
    assert.strictEqual(missed.status, 200);
    assert.ok(missed.json.data.some(row => row.id === `${marker}_PY`), 'cross-year missed round must be selectable');
    assert.ok(missed.json.data.some(row => row.id === `${marker}_PM`), 'cross-month missed round must be selectable');

    const makeupKey = `${marker}:MAKEUP:001`;
    const makeup = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'makeup', PatrolType:'compensation', ScheduledSessionID:`${marker}_PY`, IdempotencyKey:makeupKey });
    assert.strictEqual(makeup.status, 200, JSON.stringify(makeup.json));
    const replay = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'makeup', PatrolType:'compensation', ScheduledSessionID:`${marker}_PY`, IdempotencyKey:makeupKey });
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.json.data.idempotentReplay, true);
    assert.strictEqual(replay.json.data.checkin.id, makeup.json.data.checkin.id);
    const crossMonthMakeup = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'makeup', PatrolType:'compensation', ScheduledSessionID:`${marker}_PM`, IdempotencyKey:`${marker}:MAKEUP:CROSSMONTH` });
    assert.strictEqual(crossMonthMakeup.status, 200, JSON.stringify(crossMonthMakeup.json));

    const noSelection = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'scheduled', PatrolType:'normal', IdempotencyKey:`${marker}:SELECT:001` });
    assert.strictEqual(noSelection.status, 409);
    assert.strictEqual(noSelection.json.code, 'PATROL_SESSION_SELECTION_REQUIRED');
    for (const [index, id] of [`${marker}_TODAY1`, `${marker}_TODAY2`].entries()) {
        const scheduled = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'scheduled', PatrolType:'normal', ScheduledSessionID:id, IdempotencyKey:`${marker}:SCHEDULED:00${index}` });
        assert.strictEqual(scheduled.status, 200, JSON.stringify(scheduled.json));
        assert.strictEqual(scheduled.json.data.checkin.teamName, `${marker}_ROTATED`);
    }
    const duplicateSession = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'scheduled', PatrolType:'normal', ScheduledSessionID:`${marker}_TODAY1`, IdempotencyKey:`${marker}:SCHEDULED:999` });
    assert.strictEqual(duplicateSession.status, 409);

    for (const suffix of ['001','002']) {
        const extra = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'extra', PatrolType:'normal', Notes:`extra-${suffix}`, IdempotencyKey:`${marker}:EXTRA:${suffix}` });
        assert.strictEqual(extra.status, 200, JSON.stringify(extra.json));
    }
    const extraReplay = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'extra', PatrolType:'normal', Notes:'extra-001', IdempotencyKey:`${marker}:EXTRA:001` });
    assert.strictEqual(extraReplay.status, 200);
    assert.strictEqual(extraReplay.json.data.idempotentReplay, true);

    const concurrentKey = `${marker}:EXTRA:CONCURRENT`;
    const concurrent = await Promise.all([
        request('POST', '/patrol/checkin', userToken, { CheckinMode:'extra', PatrolType:'normal', Notes:'concurrent retry', IdempotencyKey:concurrentKey }),
        request('POST', '/patrol/checkin', userToken, { CheckinMode:'extra', PatrolType:'normal', Notes:'concurrent retry', IdempotencyKey:concurrentKey }),
    ]);
    assert.deepStrictEqual(concurrent.map(result => result.status), [200, 200]);
    assert.strictEqual(concurrent.filter(result => result.json.data?.idempotentReplay).length, 1, 'one concurrent retry must replay the winning insert');

    const scheduledRace = await Promise.all([
        request('POST', '/patrol/checkin', userToken, { CheckinMode:'scheduled', PatrolType:'normal', ScheduledSessionID:`${marker}_TODAY4`, IdempotencyKey:`${marker}:SCHEDULED:RACE1` }),
        request('POST', '/patrol/checkin', userToken, { CheckinMode:'scheduled', PatrolType:'normal', ScheduledSessionID:`${marker}_TODAY4`, IdempotencyKey:`${marker}:SCHEDULED:RACE2` }),
    ]);
    assert.deepStrictEqual(scheduledRace.map(result => result.status).sort(), [200, 409], 'concurrent completion of one scheduled round must create exactly one attendance');

    let detail = await request('GET', `/patrol/attendance-detail?employeeId=${employeeId}&group=top_management&year=${year}`, userToken);
    assert.strictEqual(detail.status, 200, JSON.stringify(detail.json));
    assert.ok(Number(detail.json.data.actualActivity.extra) >= 3, 'intentional extra walks must count in actual activity');
    assert.ok(Number(detail.json.data.actualActivity.makeup) >= 1, 'cross-year makeup must count in actual activity on actual year');
    assert.strictEqual(detail.json.data.schedule.find(item => item.sessionId === `${marker}_TODAY3`).status, 'missed', 'same-day extra walks must not close another scheduled round');
    assert.strictEqual(detail.json.data.schedule.find(item => item.sessionId === `${marker}_MISS`).status, 'missed', 'extra walks must not close a missing scheduled round');
    assert.strictEqual(detail.json.data.schedule.find(item => item.sessionId === `${marker}_LEGACY`).status, 'completed', 'legacy same-date attendance must remain compatible');

    const missingMakeup = await request('POST', '/patrol/checkin', userToken, { CheckinMode:'makeup', PatrolType:'compensation', ScheduledSessionID:`${marker}_MISS`, IdempotencyKey:`${marker}:MAKEUP:002` });
    assert.strictEqual(missingMakeup.status, 200, JSON.stringify(missingMakeup.json));
    detail = await request('GET', `/patrol/attendance-detail?employeeId=${employeeId}&group=top_management&year=${year}`, userToken);
    assert.strictEqual(detail.json.data.schedule.find(item => item.sessionId === `${marker}_MISS`).status, 'completed');
    if (Number(priorMonthDate.slice(0, 4)) === year) {
        const priorMonthRound = detail.json.data.schedule.find(item => item.sessionId === `${marker}_PM`);
        assert.strictEqual(priorMonthRound.status, 'completed', 'cross-month makeup must complete its scheduled round');
        assert.strictEqual(priorMonthRound.records[0].actualDate, today);
    }
    const monthlyPlan = await request('GET', `/patrol/my-monthly-plan?year=${year}&month=${month}`, userToken);
    assert.strictEqual(monthlyPlan.status, 200, JSON.stringify(monthlyPlan.json));
    assert.strictEqual(Number(monthlyPlan.json.data.compliance.attended), 4, 'Extra must not increase scheduled compliance');
    assert.strictEqual(Number(monthlyPlan.json.data.compliance.required), 5);
    assert.strictEqual(Number(monthlyPlan.json.data.actualActivity.total), 9, 'Actual activity must count walks in the actual month');
    assert.strictEqual(Number(monthlyPlan.json.data.actualActivity.makeup), 3);
    assert.strictEqual(Number(monthlyPlan.json.data.actualActivity.extra), 3);

    const conflict = await request('POST', `/patrol/teams/${rotatedTeamId}/members`, adminToken, { EmployeeID:employeeId, PatrolType:'management' });
    assert.strictEqual(conflict.status, 409);
    assert.strictEqual(conflict.json.code, 'PATROL_TEAM_CONFLICT');

    await db.query("UPDATE App_Settings SET value='0' WHERE key_name='patrol_checkin_v2_enabled'");
    const legacyProbeDate = new Date(Date.UTC(year, month - 3, 10)).toISOString().slice(0, 10);
    const legacyCrossMonth = await request('POST', '/patrol/checkin', userToken, { PatrolType:'compensation', PatrolDate:legacyProbeDate, ScheduledSessionID:`${marker}_PM` });
    assert.strictEqual(legacyCrossMonth.status, 400, 'flag-off behavior must preserve the legacy same-month makeup rule');
    assert.match(legacyCrossMonth.json.message, /same month/i);
    const legacyDuplicate = await request('POST', '/patrol/checkin', userToken, { PatrolType:'normal', PatrolDate:today });
    assert.strictEqual(legacyDuplicate.status, 409, 'flag-off behavior must preserve the legacy date/type duplicate guard');
    await db.query("UPDATE App_Settings SET value='1' WHERE key_name='patrol_checkin_v2_enabled'");

    const [[count]] = await db.query('SELECT COUNT(*) count FROM Patrol_Attendance WHERE UserID=?', [employeeId]);
    assert.strictEqual(Number(count.count), 10, 'idempotent retries must not add rows');
    console.log(`Patrol check-in v2 ${stack.toUpperCase()} Local API UAT: PASS (makeup cross-month/year, multi-round, extra, idempotency, legacy, rotation, team conflict)`);
    if (serverError) console.log(`Server warnings captured: ${serverError.trim().split(/\r?\n/).length}`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) server.kill();
    if (db && originalFlag !== undefined) await db.query("UPDATE App_Settings SET value=? WHERE key_name='patrol_checkin_v2_enabled'", [originalFlag]).catch(() => {});
    await cleanup().catch(() => {});
    if (db) {
        const [[residue]] = await db.query(`SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Attendance WHERE UserID=?) +
            (SELECT COUNT(*) FROM Patrol_EmailOutbox WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Team_Members WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Member_Rotation WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Roster WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Sessions WHERE CreatedBy=?) +
            (SELECT COUNT(*) FROM Patrol_Teams WHERE Name LIKE ?) count`, [employeeId,employeeId,employeeId,employeeId,employeeId,employeeId,marker,`${marker}%`]).catch(() => [[{count:-1}]]);
        console.log(`Patrol check-in v2 UAT residue: ${Number(residue.count)}`);
        await db.end().catch(() => {});
    }
});
