'use strict';

process.env.EMAIL_ENABLED = 'false';
process.env.PASSWORD_RESET_EMAIL_DELIVERY_ENABLED = 'false';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ensurePasswordResetSchema, tokenHash } = require('../services/password-reset');

const appUrl = process.env.PASSWORD_RESET_BROWSER_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiOrigin = 'http://127.0.0.1:5098';
const browserPath = process.env.PASSWORD_RESET_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9798;
const employeeId = `ZPRB${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
const employeeName = `Password Reset Browser Test ${employeeId}`;
const email = `${employeeId.toLowerCase()}@gmail.com`;
const newPassword = 'Reset-Browser-New-84!';
const knownToken = Buffer.alloc(32, 61).toString('base64url');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-password-reset-browser-'));
const pendingCommands = new Map();
const consoleErrors = [];
const failedResponses = [];
const mutations = [];
const rateKeys = ['127.0.0.1', '::ffff:127.0.0.1', '::1']
    .map(ip => `reset:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let commandId = 1;
let browser;
let socket;
let server;
let auditBaseline = 0;

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingCommands.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
        }, timeout);
        pendingCommands.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function cleanup() {
    await db.query('DELETE FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?,?)', [auditBaseline, employeeId, ...rateKeys]).catch(() => {});
    await db.query('DELETE FROM password_reset_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM admin_auditlogs WHERE AdminID=? OR TargetID=?', [employeeId, employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

async function startServer() {
    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '5098' },
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '';
    server.stdout.on('data', chunk => { output += String(chunk); });
    server.stderr.on('data', chunk => { output += String(chunk); });
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (server.exitCode !== null) throw new Error(`Node API exited: ${output}`);
        try {
            const response = await fetch(`${apiOrigin}/api/health`);
            if (response.status > 0) return;
        } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Local Node API did not start: ${output}`);
}

async function connectBrowser() {
    browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Browser page target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
            consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        }
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            if (String(request.url || '').includes('/api/password-reset/') && String(request.method || '').toUpperCase() !== 'OPTIONS') {
                mutations.push(`${request.method} ${new URL(request.url).pathname}`);
            }
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/password-reset/')) {
                failedResponses.push(`${response.status} ${response.url}`);
            }
        }
        const pending = pendingCommands.get(message.id);
        if (!pending) return;
        pendingCommands.delete(message.id);
        clearTimeout(pending.timer);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
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
    assert.ok(fs.existsSync(browserPath), `Browser not found: ${browserPath}`);
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()));
    assert.match(String(process.env.DB_NAME || ''), /(?:uat|test|local|dev)/i);
    await ensurePasswordResetSchema(db);
    const [[start]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM password_reset_audit');
    auditBaseline = Number(start.id || 0);
    await db.query(
        `INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?,0)`,
        [employeeId, employeeName, 'TEST', '', '', 'TEST', email, 'User', await bcrypt.hash('Reset-Browser-Original-42!', 4)]
    );
    await startServer();
    await connectBrowser();
    await command('Page.navigate', { url: `${appUrl}?password_reset_browser_uat=${Date.now()}` });
    await waitFor("window.__tshLoginReady===true&&document.querySelector('#forgot-password-btn')");

    const viewports = [[1440, 1000], [1024, 768], [390, 844]];
    const forgotResults = [];
    for (const [width, height] of viewports) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(200);
        forgotResults.push(await evaluate(`(() => {const b=document.querySelector('#forgot-password-btn');return {width:${width},visible:Boolean(b&&b.offsetParent),height:b?.getBoundingClientRect().height||0,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3};})()`));
    }
    for (const result of forgotResults) {
        assert.equal(result.visible, true, `${result.width}: forgot button missing`);
        assert.ok(result.height >= 43, `${result.width}: forgot touch target too small`);
        assert.equal(result.overflow, false, `${result.width}: login overflow`);
    }

    await evaluate(`(()=>{document.querySelector('#forgot-password-btn').click();return true;})()`);
    await waitFor("document.querySelector('#forgot-password-form')");
    await evaluate(`(()=>{const input=document.querySelector('#forgot-password-employee-id');input.value=${JSON.stringify(employeeId)};document.querySelector('#forgot-password-form').requestSubmit();return true;})()`);
    await waitFor("document.querySelector('#forgot-password-done')");
    assert.equal(await evaluate("document.querySelector('#modal-body').innerText.includes('ข้อความนี้เหมือนกันทุกบัญชีเพื่อความปลอดภัย')"), true, 'Generic security message missing');

    await db.query(
        `INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,'Pending','Disabled','127.0.0.1',DATE_ADD(NOW(),INTERVAL 5 MINUTE))`,
        [employeeId, email, tokenHash(knownToken)]
    );
    await command('Page.navigate', { url: `${appUrl}?password_reset_complete_uat=${Date.now()}#reset-password=${knownToken}` });
    await waitFor("document.querySelector('#password-reset-complete-form')");
    const resetResults = [];
    for (const [width, height] of viewports) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(200);
        resetResults.push(await evaluate(`(() => {const form=document.querySelector('#password-reset-complete-form');const button=document.querySelector('#password-reset-complete-submit');return {width:${width},form:Boolean(form),height:button?.getBoundingClientRect().height||0,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3};})()`));
    }
    for (const result of resetResults) {
        assert.equal(result.form, true, `${result.width}: reset form missing`);
        assert.ok(result.height >= 43, `${result.width}: reset touch target too small`);
        assert.equal(result.overflow, false, `${result.width}: reset overflow`);
    }
    await evaluate(`(()=>{document.querySelector('#password-reset-new').value=${JSON.stringify(newPassword)};document.querySelector('#password-reset-confirm').value=${JSON.stringify(newPassword)};document.querySelector('#password-reset-complete-form').requestSubmit();return true;})()`);
    await waitFor("document.querySelector('#password-reset-login')");
    const [[saved]] = await db.query('SELECT Password,MustChangePassword FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.equal(await bcrypt.compare(newPassword, saved.Password), true, 'Browser reset password was not persisted');
    assert.equal(Number(saved.MustChangePassword), 0, 'Browser reset did not clear password gate');
    assert.deepEqual(mutations, ['POST /api/password-reset/request', 'POST /api/password-reset/complete']);
    assert.deepEqual(failedResponses, [], `Password Reset API failures: ${failedResponses.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log(`Password Reset Browser UAT passed: ${viewports.map(row => row.join('x')).join(', ')}, request + reset lifecycle, zero console/API errors.`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    try { server?.kill(); } catch (_) {}
    await cleanup();
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) employees,
            (SELECT COUNT(*) FROM password_reset_requests WHERE EmployeeID=?) requests,
            (SELECT COUNT(*) FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?,?)) audits`,
        [employeeId, employeeId, auditBaseline, employeeId, ...rateKeys]
    ).catch(() => [[{ employees: -1, requests: -1, audits: -1 }]]);
    console.log(`Password Reset Browser cleanup: employees=${residue.employees}; requests=${residue.requests}; audits=${residue.audits}`);
    await db.end().catch(() => {});
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
