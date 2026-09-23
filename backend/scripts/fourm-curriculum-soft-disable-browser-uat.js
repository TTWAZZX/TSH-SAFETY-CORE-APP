'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const appUrl = process.env.FOURM_BROWSER_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiOrigin = 'http://127.0.0.1:5784';
const chromePath = process.env.FOURM_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = 9784;
const marker = `CODX_4M_BROWSER_${Date.now()}`;
const adminId = `F4B${String(Date.now()).slice(-11)}`;
const curriculumId = randomUUID();
const courseId = randomUUID();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-fourm-soft-disable-'));
const errors = [];
const failedResponses = [];
const mutations = [];
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let commandId = 1;
let chrome;
let socket;
let server;
let db;

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
    await db.query('DELETE FROM FourM_CurriculumLogs WHERE CurriculumID=?', [curriculumId]).catch(() => {});
    await db.query('DELETE FROM FourM_Courses WHERE CurriculumID=?', [curriculumId]).catch(() => {});
    await db.query('DELETE FROM FourM_Curriculums WHERE id=?', [curriculumId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [adminId]).catch(() => {});
}

async function startServer() {
    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '5784' },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    server.stdout.on('data', chunk => { output += String(chunk); });
    server.stderr.on('data', chunk => { output += String(chunk); });
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (server.exitCode !== null) throw new Error(`Node API exited: ${output}`);
        try { const response = await fetch(`${apiOrigin}/api/health`); if (response.status > 0) return; } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Local Node API did not start: ${output}`);
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(item => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            if (String(request.url || '').includes('/api/fourm') && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase())) mutations.push(`${request.method} ${request.url}`);
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/')) failedResponses.push(`${response.status} ${response.url}`);
        }
        const current = pending.get(message.id);
        if (!current) return;
        pending.delete(message.id);
        clearTimeout(current.timer);
        message.error ? current.reject(new Error(message.error.message)) : current.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiOrigin}/api`)};` });
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required');
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-local DB_HOST: ${host}`);
    db = await mysql.createConnection({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
        password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    await cleanup();
    const [[scope]] = await db.query('SELECT Name Department FROM Master_Departments ORDER BY id LIMIT 1');
    assert.ok(scope?.Department, 'Local Department fixture is required');
    await db.query(
        'INSERT INTO Employees(EmployeeID,EmployeeName,Department,Role,Position,Password,MustChangePassword) VALUES(?,?,?,?,?,?,0)',
        [adminId, marker, scope.Department, 'Admin', 'Manager', 'LOCAL_UAT_NOT_A_LOGIN_HASH']
    );
    await db.query(
        'INSERT INTO FourM_Curriculums(id,`Year`,Department,CurriculumCode,CurriculumTitle,IsActive,ActiveScopeKey) VALUES(?,?,?,?,?,0,NULL)',
        [curriculumId, 2026, marker, `${marker}-CODE`, `${marker} Disabled Curriculum`]
    );
    await db.query(
        'INSERT INTO FourM_Courses(id,CurriculumID,CourseCode,CourseTitle,SortOrder,IsActive) VALUES(?,?,?,?,1,0)',
        [courseId, curriculumId, `${marker}-COURSE`, `${marker} Archived Course`]
    );
    await startServer();
    await connectChrome();
    const token = jwt.sign({ id: adminId, name: marker, role: 'Admin', department: scope.Department }, process.env.JWT_SECRET, { expiresIn: '20m' });
    const user = { id: adminId, EmployeeID: adminId, name: marker, EmployeeName: marker, role: 'Admin', Role: 'Admin', department: scope.Department, Department: scope.Department };
    await command('Page.navigate', { url: `${appUrl}?fourm_soft_disable_uat=${Date.now()}` });
    await waitFor("document.readyState==='complete'");
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#fourm';location.reload();return true;})()`);
    await waitFor("document.querySelector('#fourm-tab-btn-man')");
    await evaluate("document.querySelector('#fourm-tab-btn-man').click()");
    await waitFor("document.querySelector('[data-man-subtab=\"matrix\"]')");
    await evaluate("document.querySelector('[data-man-subtab=\"matrix\"]').click()");
    await waitFor("document.querySelector('#btn-tm-toggle-inactive')");
    await evaluate("document.querySelector('#tm-filter-year').value='2026';document.querySelector('#tm-filter-year').dispatchEvent(new Event('change',{bubbles:true}))");
    await waitFor("document.querySelector('#btn-tm-toggle-inactive')");
    await evaluate("document.querySelector('#btn-tm-toggle-inactive').click()");
    await waitFor(`document.body.innerText.includes(${JSON.stringify(`${marker} Disabled Curriculum`)})`);
    await evaluate(`(()=>{const input=document.querySelector('#tm-curriculum-search');input.value=${JSON.stringify(marker)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await waitFor(`document.body.innerText.includes(${JSON.stringify(`${marker}-CODE`)})`);
    await evaluate(`(()=>{const card=[...document.querySelectorAll('.tm-curriculum-item')].find(x=>x.innerText.includes(${JSON.stringify(marker)}));card.click();return true;})()`);
    await waitFor(`document.body.innerText.includes(${JSON.stringify(`${marker} Archived Course`)})`);

    const viewports = [[1440, 1000], [1024, 768], [390, 844]];
    const results = [];
    for (const [width, height] of viewports) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(300);
        results.push(await evaluate(`(() => ({
            width:${width}, height:${height},
            disabledBadge:[...document.querySelectorAll('article')].some(x=>x.innerText.includes(${JSON.stringify(marker)})&&x.innerText.includes('Disabled')),
            archivedCourse:document.body.innerText.includes(${JSON.stringify(`${marker} Archived Course`)}),
            reactivate:[...document.querySelectorAll('.btn-tm-reactivate-curriculum')].some(x=>x.dataset.id===${JSON.stringify(curriculumId)}),
            overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3
        }))()`));
    }
    for (const row of results) {
        assert.strictEqual(row.disabledBadge, true, `${row.width}: Disabled badge missing`);
        assert.strictEqual(row.archivedCourse, true, `${row.width}: archived course missing`);
        assert.strictEqual(row.reactivate, true, `${row.width}: Reactivate action missing`);
        assert.strictEqual(row.overflow, false, `${row.width}: horizontal overflow`);
    }
    assert.deepStrictEqual(mutations, [], `Browser UAT must remain read-only: ${mutations.join(' | ')}`);
    assert.deepStrictEqual(failedResponses, [], `Failed API responses: ${failedResponses.join(' | ')}`);
    assert.deepStrictEqual(errors, [], `Browser console errors: ${errors.join(' | ')}`);
    console.log(`4M curriculum soft-disable Browser UAT: PASS (${results.map(row => `${row.width}x${row.height}`).join(', ')}, read-only, zero console errors)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    try { server?.kill(); } catch (_) {}
    await cleanup().catch(() => {});
    if (db) {
        const [[residue]] = await db.query('SELECT (SELECT COUNT(*) FROM FourM_Curriculums WHERE id=?) + (SELECT COUNT(*) FROM FourM_Courses WHERE id=?) + (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) count', [curriculumId, courseId, adminId]).catch(() => [[{ count: -1 }]]);
        console.log(`4M curriculum soft-disable Browser UAT residue: ${Number(residue.count)}`);
        await db.end().catch(() => {});
    }
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
