'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { spawn } = require('child_process');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });

const stamp = `${Date.now()}`.slice(-9);
const employeeId = `PB2${stamp}`;
const marker = `CODX_PATROL_BROWSER_${stamp}`;
const apiPort = 5800 + Math.floor(Math.random() * 100);
const cdpPort = 9900 + Math.floor(Math.random() * 80);
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const appUrl = process.env.PATROL_BROWSER_APP_URL || 'http://127.0.0.1/tsh-safety-core/index.html';
const chromePath = process.env.PATROL_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-patrol-v2-browser-'));
const errors = [];
let db, server, chrome, cdp, teamId, originalFlag;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const today = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

class Cdp {
    constructor(url) { this.id = 1; this.pending = new Map(); this.socket = new WebSocket(url); }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Chrome CDP connection timeout')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true });
            this.socket.addEventListener('error', reject, { once:true });
        });
    }
    command(method, params = {}, timeout = 60000) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { try { this.socket.close(); } catch {} }
}

async function evaluate(expression) {
    const result = await cdp.command('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}
async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}`);
}
async function cleanup() {
    if (!db) return;
    await db.query('DELETE FROM Patrol_Attendance WHERE UserID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Sessions WHERE CreatedBy=?', [marker]).catch(() => {});
    await db.query('DELETE FROM Patrol_Roster WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Patrol_Team_Members WHERE EmployeeID=?', [employeeId]).catch(() => {});
    if (teamId) await db.query('DELETE FROM Patrol_Teams WHERE id=?', [teamId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required for Patrol browser UAT');
    assert.ok(['localhost','127.0.0.1','::1'].includes(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Browser UAT refuses a non-local database');
    db = await mysql.createConnection({ host:process.env.DB_HOST, port:Number(process.env.DB_PORT || 3306), user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME });
    await cleanup();
    const [[flag]] = await db.query("SELECT value FROM App_Settings WHERE key_name='patrol_checkin_v2_enabled' LIMIT 1");
    originalFlag = String(flag?.value || '0');
    await db.query("UPDATE App_Settings SET value='1' WHERE key_name='patrol_checkin_v2_enabled'");
    const [[scope]] = await db.query("SELECT d.Name Department,COALESCE((SELECT u.name FROM Master_SafetyUnits u WHERE u.department_id=d.id ORDER BY u.id LIMIT 1),'') Unit FROM Master_Departments d ORDER BY d.id LIMIT 1");
    await db.query('INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,0)', [employeeId, marker, scope.Department, scope.Unit, 'User', 'Manager', 'LOCAL_UAT_NOT_A_LOGIN_HASH']);
    const [team] = await db.query("INSERT INTO Patrol_Teams(Name,PatrolGroup,Color) VALUES(?,'A','#7c3aed')", [marker]);
    teamId = Number(team.insertId);
    await db.query("INSERT INTO Patrol_Team_Members(TeamID,EmployeeID,PatrolType) VALUES(?,?,'management')", [teamId, employeeId]);
    await db.query("INSERT INTO Patrol_Roster(EmployeeID,RosterGroup,TargetPerYear,SortOrder) VALUES(?,'top_management',24,99)", [employeeId]);
    const actualDate = today();
    const year = Number(actualDate.slice(0, 4));
    for (const [id, date, round] of [[`${marker}_TODAY1`,actualDate,1],[`${marker}_TODAY2`,actualDate,2],[`${marker}_PAST`,`${year - 1}-12-15`,1]]) {
        await db.query("INSERT INTO Patrol_Sessions(SessionID,PatrolDate,Year,Description,TeamName,Status,CreatedBy,TeamID,PatrolRound) VALUES(?,?,?,?,'','In Progress',?,?,?)", [id, `${date} 08:00:00`, Number(date.slice(0,4)), marker, marker, teamId, round]);
    }
    server = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname, '..'), env:{ ...process.env, PORT:String(apiPort) }, stdio:['ignore','ignore','ignore'], windowsHide:true });
    for (let i = 0; i < 80; i++) { try { const response = await fetch(`${apiOrigin}/api/health`); if (response.status > 0) break; } catch {} await sleep(250); }
    chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-allow-origins=*','--window-size=390,844',`--remote-debugging-port=${cdpPort}`,`--user-data-dir=${profile}`,'about:blank'], { stdio:['ignore','ignore','ignore'], windowsHide:true });
    let targets;
    for (let i = 0; i < 60; i++) { try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch {} await sleep(250); }
    const page = targets?.find(item => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target unavailable');
    cdp = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await cdp.connect();
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
    await cdp.command('Page.addScriptToEvaluateOnNewDocument', { source:`window.API_BASE=${JSON.stringify(`${apiOrigin}/api`)};` });
    await cdp.command('Page.navigate', { url:appUrl });
    await waitFor("document.readyState==='complete'");
    const payload = { id:employeeId, EmployeeID:employeeId, name:marker, EmployeeName:marker, role:'User', Role:'User', department:scope.Department, Department:scope.Department, unit:scope.Unit, Unit:scope.Unit, position:'Manager', Position:'Manager' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn:'20m' });
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(payload))});location.hash='#patrol';location.reload();return true;})()`);
    await waitFor("location.hash==='#patrol' && typeof window.openCheckInModal==='function'");
    await waitFor(`document.body.innerText.includes(${JSON.stringify(marker)})`);
    await evaluate('window.openCheckInModal()');
    await waitFor("document.querySelector('#checkin-form')");
    const initial = await evaluate(`(()=>({modes:[...document.querySelectorAll('#checkin-form input[name="CheckinMode"]')].map(x=>x.value),todayOptions:document.querySelectorAll('#checkin-today-select option').length,submitBusy:document.querySelector('#checkin-form button[type="submit"]').getAttribute('aria-busy'),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
    assert.deepStrictEqual(initial.modes, ['scheduled','makeup','extra']);
    assert.strictEqual(initial.todayOptions, 2, 'both same-day rounds must be selectable');
    assert.strictEqual(initial.submitBusy, null);
    assert.strictEqual(initial.overflow, false);
    await evaluate(`document.querySelector('#checkin-form input[value="makeup"]').click()`);
    await waitFor("document.querySelector('#checkin-missed-select:not(.hidden)')?.options.length>1");
    const makeup = await evaluate(`(()=>({hasPriorYear:[...document.querySelectorAll('#checkin-missed-select option')].some(x=>x.value===${JSON.stringify(`${marker}_PAST`)}),todayHidden:document.querySelector('#checkin-today-row').classList.contains('hidden')}))()`);
    assert.deepStrictEqual(makeup, { hasPriorYear:true, todayHidden:true });
    await evaluate(`document.querySelector('#checkin-form input[value="extra"]').click()`);
    assert.strictEqual(await evaluate("document.querySelector('#checkin-date-row').classList.contains('hidden')"), true);
    assert.deepStrictEqual(errors, [], `Browser console errors: ${errors.join(' | ')}`);
    console.log('Patrol check-in v2 Browser UAT: PASS (mobile modal, Scheduled/Makeup/Extra, cross-year picker, two same-day rounds, no overflow/errors)');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    try { cdp?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    try { server?.kill(); } catch {}
    if (db && originalFlag !== undefined) await db.query("UPDATE App_Settings SET value=? WHERE key_name='patrol_checkin_v2_enabled'", [originalFlag]).catch(() => {});
    await cleanup().catch(() => {});
    if (db) {
        const [[remaining]] = await db.query(`SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Attendance WHERE UserID=?) +
            (SELECT COUNT(*) FROM Patrol_Team_Members WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Roster WHERE EmployeeID=?) +
            (SELECT COUNT(*) FROM Patrol_Sessions WHERE CreatedBy=?) +
            (SELECT COUNT(*) FROM Patrol_Teams WHERE Name=?) count`, [employeeId,employeeId,employeeId,employeeId,marker,marker]).catch(() => [[{ count:-1 }]]);
        console.log(`Patrol check-in v2 Browser UAT residue: ${remaining.count}`);
        await db.end();
    }
    await fs.promises.rm(profile, { recursive:true, force:true }).catch(() => {});
});
