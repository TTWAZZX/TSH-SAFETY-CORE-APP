'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const appUrl = process.env.BBS_PHASE10B1_APP_URL || 'http://127.0.0.1:5500/index.html';
const apiUrl = String(process.env.BBS_PHASE10B1_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const chromePath = process.env.BBS_PHASE10B1_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.BBS_PHASE10B1_CDP_PORT || 9841);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs10b1-browser-'));
const consoleErrors = [];
let chrome;
let socket;
let db;
let commandId = 1;
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
        await sleep(300);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', '--window-size=390,844',
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
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') consoleErrors.push((message.params.args || []).map(x => x.value || x.description || '').join(' '));
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
        host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS,
        database: process.env.DB_NAME, port: Number(process.env.DB_PORT || 3306)
    });
    const [[admin]] = await db.query(
        "SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin'",
        [process.env.PROD_UAT_ADMIN_ID]
    );
    assert.ok(admin, 'Admin browser fixture unavailable');
    const token = jwt.sign({ id:admin.EmployeeID, name:admin.EmployeeName, role:admin.Role, department:admin.Department, unit:admin.Unit, position:admin.Position }, process.env.JWT_SECRET, { expiresIn:'30m' });
    const user = { id:admin.EmployeeID, EmployeeID:admin.EmployeeID, name:admin.EmployeeName, EmployeeName:admin.EmployeeName, role:admin.Role, Role:admin.Role, department:admin.Department, Department:admin.Department, unit:admin.Unit, Unit:admin.Unit, position:admin.Position, Position:admin.Position };
    const foundationResponse = await fetch(`${apiUrl}/api/bbs/admin/foundation`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.strictEqual(foundationResponse.status, 200, 'Foundation API must be readable by Admin');
    const foundation = await foundationResponse.json();
    assert.ok(foundation.data.departments.length > 0, 'Master Department fixture must not be empty');

    await connectChrome();
    await command('Page.navigate', { url:appUrl });
    await sleep(1800);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`document.querySelector('[data-bbs-tab="cards"]')`);
    await evaluate(`document.querySelector('[data-bbs-tab="cards"]').click()`);
    await waitFor(`document.querySelector('[data-bbs-master-readiness]') && document.querySelector('[data-card-workspace="personal"]')`);
    const overview = await evaluate(`(()=>({navigation:document.querySelectorAll('[data-card-workspace-navigation] [data-card-workspace]').length,mode:document.querySelector('[data-card-guided-workflow]')?.dataset.cardGuidedWorkflow,personalForm:Boolean(document.querySelector('#bbs-template-form')),departmentForm:Boolean(document.querySelector('#bbs-dept-template-form'))}))()`);
    assert.deepStrictEqual(overview, { navigation:3, mode:'overview', personalForm:false, departmentForm:false }, 'Overview must separate both detailed workflows');
    await evaluate(`document.querySelector('[data-card-workspace="personal"]').click()`);
    await waitFor(`document.querySelector('[data-master-source="departments"]')`);
    const result = await evaluate(`(()=>{const dept=document.querySelector('[data-master-source="departments"]');return {departments:dept.options.length-1,mode:document.querySelector('[data-card-guided-workflow]')?.dataset.cardGuidedWorkflow,hasEmptyExplanation:Boolean(document.querySelector('#bbs-card-employees')?.children.length),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.strictEqual(result.departments, foundation.data.departments.length, 'Personal Card Department dropdown must match Foundation Master Department count');
    assert.strictEqual(result.mode, 'personal');
    assert.strictEqual(result.hasEmptyExplanation, true);
    assert.strictEqual(result.overflow, false, '390px BBS card Admin view must not overflow horizontally');
    await evaluate(`document.querySelector('[data-card-workspace="department"]').click()`);
    await waitFor(`document.querySelector('#bbs-dept-template-form') && document.querySelector('[data-community-handler]')`);
    const department = await evaluate(`(()=>({mode:document.querySelector('[data-card-guided-workflow]')?.dataset.cardGuidedWorkflow,personalForm:Boolean(document.querySelector('#bbs-template-form')),departmentForm:Boolean(document.querySelector('#bbs-dept-template-form')),rows:document.querySelectorAll('[data-department-config-row]').length,pickers:document.querySelectorAll('[data-admin-picker-search]').length,hiddenDepartmentId:Number(document.querySelector('#bbs-dept-template-form [name="departmentId"]')?.value||0),detailId:Number(document.querySelector('[data-department-config-detail]')?.dataset.departmentConfigDetail||0),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2}))()`);
    assert.deepStrictEqual(department, { mode:'department', personalForm:false, departmentForm:true, rows:foundation.data.departments.length, pickers:2, hiddenDepartmentId:department.detailId, detailId:department.detailId, overflow:false }, 'Department workflow must be Master-backed, isolated and mobile-safe');
    const filterResult = await evaluate(`(()=>{const input=document.querySelector('[data-department-config-search]');input.value='__no_such_department__';input.dispatchEvent(new Event('input',{bubbles:true}));const empty=!document.querySelector('[data-department-config-empty]').classList.contains('hidden');const visible=[...document.querySelectorAll('[data-department-config-row]')].filter(row=>!row.classList.contains('hidden')).length;input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));const picker=document.querySelector('[data-admin-picker-search="bbs-owner-admin"]');const first=document.querySelector('#bbs-owner-admin option[data-admin-option-search]');picker.value=String(first?.dataset.adminOptionSearch||'').split(' ')[0];picker.dispatchEvent(new Event('input',{bubbles:true}));const shown=[...document.querySelectorAll('#bbs-owner-admin option[data-admin-option-search]')].filter(option=>!option.hidden).length;return {empty,visible,shown};})()`);
    assert.strictEqual(filterResult.empty, true, 'Unknown Department search must show an empty explanation');
    assert.strictEqual(filterResult.visible, 0, 'Unknown Department search must hide all rows');
    assert.ok(filterResult.shown >= 1, 'Admin Master picker search must return a matching account');
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log(`BBS Phase 10B-1/10B-3 browser Master dropdown/guided Department search/mobile UAT: PASS (${result.departments} departments)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    if (db) await db.end();
    await fs.promises.rm(profile, { recursive:true, force:true }).catch(() => {});
});
