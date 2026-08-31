'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const appUrl = process.env.KY_BROWSER_APP_URL || 'http://127.0.0.1:5500/index.html';
const apiUrl = String(process.env.KY_BROWSER_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const chromePath = process.env.KY_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.KY_BROWSER_CDP_PORT || 9844);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-ky-reporter-search-'));
const consoleErrors = [];
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let commandId = 1;
let chrome;
let socket;
let db;

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timeout ${method}`));
        }, timeout);
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

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', '--window-size=1280,900',
        `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(row => row.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome target unavailable');
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
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};` });
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required');
    db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT || 3306)
    });
    const [[admin]] = await db.query(
        "SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin' LIMIT 1",
        [process.env.PROD_UAT_ADMIN_ID]
    );
    assert.ok(admin, 'Admin browser fixture unavailable');
    const token = jwt.sign({
        id: admin.EmployeeID,
        name: admin.EmployeeName,
        role: admin.Role,
        department: admin.Department,
        unit: admin.Unit,
        position: admin.Position
    }, process.env.JWT_SECRET, { expiresIn: '30m' });
    const user = {
        id: admin.EmployeeID,
        EmployeeID: admin.EmployeeID,
        name: admin.EmployeeName,
        EmployeeName: admin.EmployeeName,
        role: admin.Role,
        Role: admin.Role,
        department: admin.Department,
        Department: admin.Department,
        unit: admin.Unit,
        Unit: admin.Unit,
        position: admin.Position,
        Position: admin.Position
    };

    const employeeResponse = await fetch(`${apiUrl}/api/ky/employees?q=${encodeURIComponent(admin.EmployeeID)}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(employeeResponse.status, 200, 'KY employee search API must be readable');
    const employeePayload = await employeeResponse.json();
    assert.ok(employeePayload.data.some(row => String(row.EmployeeID) === String(admin.EmployeeID)), 'Employee Master result missing');

    await connectChrome();
    await command('Page.navigate', { url: appUrl });
    await sleep(1600);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#ky';location.reload();return true;})()`);
    await waitFor(`document.querySelector('#ky-tab-btn-submit')`);
    await evaluate(`document.querySelector('#ky-tab-btn-submit').click()`);
    await waitFor(`document.querySelector('#ky-reporter-search') && document.querySelector('#ky-emp-search')`);

    await evaluate(`(()=>{const input=document.querySelector('#ky-reporter-search');input.value=${JSON.stringify(admin.EmployeeID)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await waitFor(`document.querySelector('#ky-reporter-dropdown [data-reporter-idx]')`);
    const reporterResult = await evaluate(`(()=>{const row=document.querySelector('#ky-reporter-dropdown [data-reporter-idx]');const text=row.textContent;row.click();return {text,employeeId:document.querySelector('#ky-reporter-id').value};})()`);
    assert.ok(reporterResult.text.includes(admin.EmployeeID), 'Reporter dropdown must show the matched Employee ID');
    assert.strictEqual(reporterResult.employeeId, admin.EmployeeID, 'Reporter selection must populate the hidden Employee ID');

    await evaluate(`(()=>{const input=document.querySelector('#ky-emp-search');input.value=${JSON.stringify(admin.EmployeeID)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await waitFor(`document.querySelector('#ky-emp-dropdown [data-emp-idx]')`);
    const participantText = await evaluate(`document.querySelector('#ky-emp-dropdown [data-emp-idx]').textContent`);
    assert.ok(participantText.includes(admin.EmployeeID), 'Participant dropdown must show the matched Employee ID');
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('KY reporter/participant Employee Master search browser UAT: PASS');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    if (db) await db.end();
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
