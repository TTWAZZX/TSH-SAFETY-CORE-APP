'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });

const stamp = String(Date.now()).slice(-9);
const employeeId = `PEA${stamp}`;
const marker = `CODX_PATROL_EXTRA_${stamp}`;
const stack = String(process.env.PATROL_UAT_STACK || 'node').toLowerCase();
const port = 5850 + Math.floor(Math.random() * 100);
const origin = `http://127.0.0.1:${port}`;
const routeUrl = route => stack === 'php' ? `${origin}/api/index.php?route=${route.slice(1).replace('?', '&')}` : `${origin}/api${route}`;
let db, server, baseTeamId, rotatedTeamId, originalV2 = '0', originalExtra = '0';

function bangkokToday() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}
function shiftDays(date, days) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function nextMonthDate(today, day = 15) { const d = new Date(`${today}T12:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, day)).toISOString().slice(0, 10); }
function token(role = 'User') { return jwt.sign({ id:employeeId, name:marker, role, team:'' }, process.env.JWT_SECRET, { expiresIn:'1h' }); }
async function request(method, route, auth, body) {
    const response = await fetch(routeUrl(route), { method, headers:{ Authorization:`Bearer ${auth}`, ...(body ? {'Content-Type':'application/json'} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}) });
    return { status:response.status, json:await response.json().catch(() => ({})) };
}
async function waitForServer() { for (let i=0;i<80;i++) { try { if ((await fetch(routeUrl('/health'))).status > 0) return; } catch {} await new Promise(resolve => setTimeout(resolve, 250)); } throw new Error('Local server did not start.'); }
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
    assert.ok(['localhost','127.0.0.1','::1'].includes(String(process.env.DB_HOST || '').toLowerCase()), 'Refusing non-local database.');
    db = await mysql.createConnection({ host:process.env.DB_HOST, port:Number(process.env.DB_PORT || 3306), user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME });
    await cleanup();
    await db.query('ALTER TABLE Patrol_Attendance ADD COLUMN IF NOT EXISTS CheckinMode VARCHAR(20) NULL AFTER PatrolType');
    await db.query("INSERT INTO App_Settings(key_name,value) VALUES('patrol_extra_advance_enabled','0') ON DUPLICATE KEY UPDATE value=value");
    const [[v2]] = await db.query("SELECT value FROM App_Settings WHERE key_name='patrol_checkin_v2_enabled'");
    const [[extra]] = await db.query("SELECT value FROM App_Settings WHERE key_name='patrol_extra_advance_enabled'");
    originalV2 = String(v2?.value || '0'); originalExtra = String(extra?.value || '0');
    await db.query("UPDATE App_Settings SET value='1' WHERE key_name IN ('patrol_checkin_v2_enabled','patrol_extra_advance_enabled')");
    const [[scope]] = await db.query("SELECT Name Department FROM Master_Departments ORDER BY id LIMIT 1");
    await db.query("INSERT INTO Employees(EmployeeID,EmployeeName,Department,Role,Position,Password,MustChangePassword) VALUES(?,?,?,'User','Manager','LOCAL_UAT_NOT_A_LOGIN_HASH',0)", [employeeId, marker, scope.Department]);
    let [insert] = await db.query("INSERT INTO Patrol_Teams(Name,PatrolGroup,Color) VALUES(?,'A','#059669')", [`${marker}_BASE`]); baseTeamId = Number(insert.insertId);
    [insert] = await db.query("INSERT INTO Patrol_Teams(Name,PatrolGroup,Color) VALUES(?,'B','#7c3aed')", [`${marker}_ROT`]); rotatedTeamId = Number(insert.insertId);
    await db.query("INSERT INTO Patrol_Team_Members(TeamID,EmployeeID,PatrolType) VALUES(?,?,'management')", [baseTeamId, employeeId]);
    await db.query("INSERT INTO Patrol_Roster(EmployeeID,RosterGroup,TargetPerYear,SortOrder) VALUES(?,'top_management',24,99)", [employeeId]);
    const today = bangkokToday(), nextDate = nextMonthDate(today), raceDate = nextMonthDate(today, 16), cancelledDate = nextMonthDate(today, 17), leaveDate = nextMonthDate(today, 18), completedDate = nextMonthDate(today, 19), wrongDate = nextMonthDate(today, 20);
    const nextYear = Number(nextDate.slice(0,4)), nextMonth = Number(nextDate.slice(5,7));
    await db.query('INSERT INTO Patrol_Member_Rotation(EmployeeID,TeamID,Year,Month) VALUES(?,?,?,?)', [employeeId, rotatedTeamId, nextYear, nextMonth]);
    const fixtures = [
        ['TODAY', today, baseTeamId, 1, 'Pending'], ['PAST', shiftDays(today,-1), baseTeamId, 2, 'Pending'],
        ['VALID', nextDate, rotatedTeamId, 1, 'Pending'], ['RACE', raceDate, rotatedTeamId, 2, 'Pending'],
        ['CANCEL', cancelledDate, rotatedTeamId, 3, 'Cancelled'], ['LEAVE', leaveDate, rotatedTeamId, 4, 'Pending'],
        ['DONE', completedDate, rotatedTeamId, 5, 'Pending'], ['WRONG', wrongDate, baseTeamId, 6, 'Pending'],
    ];
    for (const [suffix,date,teamId,round,status] of fixtures) await db.query('INSERT INTO Patrol_Sessions(SessionID,PatrolDate,Year,Description,TeamName,Status,CreatedBy,TeamID,PatrolRound) VALUES(?,?,?,?,?,?,?,?,?)', [`${marker}_${suffix}`,date,Number(date.slice(0,4)),marker,'',status,marker,teamId,round]);
    await db.query("INSERT INTO Patrol_Leave_Requests(EmployeeID,RosterGroup,ScheduledSessionID,ScheduledDate,LeaveType,Status,CreatedBy) VALUES(?,'top_management',?,?,'Business','Approved',?)", [employeeId,`${marker}_LEAVE`,leaveDate,employeeId]);
    await db.query("INSERT INTO Patrol_Attendance(UserID,UserName,TeamName,WeekNumber,PatrolDate,Year,PatrolType,CheckinMode,RecordedBy,ScheduledSessionID) VALUES(?,?,?,1,?,?, 'normal','scheduled',?,?)", [employeeId,marker,`${marker}_ROT`,completedDate,nextYear,employeeId,`${marker}_DONE`]);

    const repoRoot = path.join(__dirname,'..','..');
    server = stack === 'php' ? spawn('C:\\xampp\\php\\php.exe',['-S',`127.0.0.1:${port}`,'-t',repoRoot],{cwd:repoRoot,env:process.env,stdio:['ignore','ignore','pipe'],windowsHide:true}) : spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port)},stdio:['ignore','ignore','pipe'],windowsHide:true});
    await waitForServer();
    const user = token(), admin = token('Admin');
    const eligible = await request('GET','/patrol/my-extra-advance-sessions',user);
    assert.equal(eligible.status,200); const ids = eligible.json.data.map(row => String(row.id));
    assert(ids.includes(`${marker}_VALID`) && ids.includes(`${marker}_RACE`));
    for (const rejected of ['TODAY','PAST','CANCEL','LEAVE','DONE','WRONG']) assert(!ids.includes(`${marker}_${rejected}`), `${rejected} must not be eligible`);
    const missing = await request('POST','/patrol/checkin',user,{CheckinMode:'extra',PatrolType:'normal',IdempotencyKey:`${marker}:MISSING:001`});
    assert.equal(missing.status,400); assert.equal(missing.json.code,'PATROL_EXTRA_ADVANCE_SESSION_REQUIRED');
    for (const suffix of ['TODAY','PAST','CANCEL','WRONG']) {
        const result = await request('POST','/patrol/checkin',user,{CheckinMode:'extra',PatrolType:'normal',ScheduledSessionID:`${marker}_${suffix}`,IdempotencyKey:`${marker}:${suffix}:001`});
        assert.equal(result.status,400, `${suffix}: ${JSON.stringify(result.json)}`);
    }
    for (const suffix of ['LEAVE','DONE']) {
        const result = await request('POST','/patrol/checkin',user,{CheckinMode:'extra',PatrolType:'normal',ScheduledSessionID:`${marker}_${suffix}`,IdempotencyKey:`${marker}:${suffix}:001`});
        assert.equal(result.status,409, `${suffix}: ${JSON.stringify(result.json)}`);
    }
    const valid = await request('POST','/patrol/checkin',user,{CheckinMode:'extra',PatrolType:'normal',ScheduledSessionID:`${marker}_VALID`,IdempotencyKey:`${marker}:VALID:001`});
    assert.equal(valid.status,200,JSON.stringify(valid.json)); assert.equal(valid.json.data.checkin.isExtraAdvance,true); assert.equal(valid.json.data.checkin.actualDate,today); assert.equal(valid.json.data.checkin.scheduledDate,nextDate);
    const race = await Promise.all([1,2].map(n => request('POST','/patrol/checkin',user,{CheckinMode:'extra',PatrolType:'normal',ScheduledSessionID:`${marker}_RACE`,IdempotencyKey:`${marker}:RACE:00${n}`})));
    assert.deepEqual(race.map(item=>item.status).sort(),[200,409]);
    const targetPlan = await request('GET',`/patrol/my-monthly-plan?year=${nextYear}&month=${nextMonth}`,user);
    assert.equal(targetPlan.status,200); assert(targetPlan.json.data.sessions.find(row=>String(row.id)===`${marker}_VALID`)?.isCompleted); assert(targetPlan.json.data.sessions.find(row=>String(row.id)===`${marker}_VALID`)?.isExtraAdvance);
    const actualYear = Number(today.slice(0,4)), actualMonth = Number(today.slice(5,7));
    const actualPlan = await request('GET',`/patrol/my-monthly-plan?year=${actualYear}&month=${actualMonth}`,user);
    assert.equal(Number(actualPlan.json.data.actualActivity.extra),2); assert.equal(Number(actualPlan.json.data.actualActivity.total),2);
    const cancelGuard = await request('PATCH',`/patrol/sessions/${marker}_VALID/toggle-cancel`,admin);
    assert.equal(cancelGuard.status,409); assert.equal(cancelGuard.json.code,'PATROL_SESSION_HAS_ATTENDANCE');
    const disableFeature = await request('PUT','/patrol/admin/extra-advance-feature',admin,{enabled:false}); assert.equal(disableFeature.status,200); assert.equal(disableFeature.json.data.enabled,false);
    const featureState = await request('GET','/patrol/admin/extra-advance-feature',admin); assert.equal(featureState.status,200); assert.equal(featureState.json.data.enabled,false);
    const offList = await request('GET','/patrol/my-extra-advance-sessions',user); assert.equal(offList.json.data.length,0); assert.equal(offList.json.meta.enabled,false);
    const legacy = await request('POST','/patrol/checkin',user,{CheckinMode:'extra',PatrolType:'normal',IdempotencyKey:`${marker}:LEGACY:001`}); assert.equal(legacy.status,200,JSON.stringify(legacy.json)); assert.equal(legacy.json.data.checkin.scheduledSessionId,null);
    const [[modeRow]] = await db.query("SELECT CheckinMode,ScheduledSessionID,DATE_FORMAT(PatrolDate,'%Y-%m-%d') ActualDate FROM Patrol_Attendance WHERE UserID=? AND IdempotencyKey=?",[employeeId,`${marker}:VALID:001`]);
    assert.equal(modeRow.CheckinMode,'extra'); assert.equal(String(modeRow.ScheduledSessionID),`${marker}_VALID`); assert.equal(modeRow.ActualDate,today);
    console.log(`Patrol Extra advance ${stack.toUpperCase()} Local API UAT: PASS (flag lifecycle, rotation, rejection matrix, linked coverage, concurrency, legacy)`);
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => {
    if (server) { server.kill(); await new Promise(resolve=>setTimeout(resolve,250)); }
    if (db) { await db.query("UPDATE App_Settings SET value=? WHERE key_name='patrol_checkin_v2_enabled'",[originalV2]).catch(()=>{}); await db.query("UPDATE App_Settings SET value=? WHERE key_name='patrol_extra_advance_enabled'",[originalExtra]).catch(()=>{}); await cleanup(); const [[residue]]=await db.query("SELECT (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?)+(SELECT COUNT(*) FROM Patrol_Attendance WHERE UserID=?)+(SELECT COUNT(*) FROM Patrol_Sessions WHERE CreatedBy=?) count",[employeeId,employeeId,marker]); console.log(`Patrol Extra advance UAT residue: ${Number(residue.count)}`); await db.end(); }
});
