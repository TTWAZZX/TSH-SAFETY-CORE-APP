'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const appUrl = process.env.KY_BROWSER_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiUrl = String(process.env.KY_BROWSER_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const chromePath = process.env.KY_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.KY_BROWSER_CDP_PORT || 9851);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-ky-annual-browser-'));
const consoleErrors = [];
const mutationRequests = [];
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let commandId = 1;
let chrome;
let socket;
let db;

function command(method, params = {}, timeout = 60000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, timeout);
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
        '--no-first-run', '--remote-allow-origins=*', '--window-size=1440,1000',
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
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            if (String(request.url || '').includes('/api/ky') && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase())) mutationRequests.push(`${request.method} ${request.url}`);
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
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};` });
}

async function apiJson(route, token) {
    const response = await fetch(`${apiUrl}/api/${route}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.strictEqual(response.status, 200, `${route} must be readable`);
    return response.json();
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
    const token = jwt.sign({ id: admin.EmployeeID, name: admin.EmployeeName, role: admin.Role, department: admin.Department, unit: admin.Unit, position: admin.Position }, process.env.JWT_SECRET, { expiresIn: '30m' });
    const user = { id: admin.EmployeeID, EmployeeID: admin.EmployeeID, name: admin.EmployeeName, EmployeeName: admin.EmployeeName, role: admin.Role, Role: admin.Role, department: admin.Department, Department: admin.Department, unit: admin.Unit, Unit: admin.Unit, position: admin.Position, Position: admin.Position };
    const year = new Date().getFullYear();
    const beforeStats = await apiJson(`ky/stats?year=${year}`, token);
    const beforeAnnual = await apiJson(`ky/annual-video-evidence?year=${year}`, token);

    await connectChrome();
    await command('Page.navigate', { url: appUrl });
    await sleep(1200);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});localStorage.removeItem('tsh_active_tab_ky');location.hash='#ky';location.reload();return true;})()`);
    await waitFor(`document.querySelector('#ky-tab-btn-dashboard') && document.querySelector('#ky-kpi-row [data-ky-kpi-filter="all"]')`);

    const renderedKpi = await evaluate(`[...document.querySelectorAll('#ky-kpi-row [data-ky-kpi-filter]')].reduce((out,el)=>{const key=el.dataset.kyKpiFilter;if(!(key in out))out[key]=el.querySelector('.text-2xl')?.textContent.trim();return out;},{})`);
    const kpi = beforeStats.data?.kpi || beforeStats.kpi || {};
    assert.strictEqual(Number(renderedKpi.all), Number(kpi.total || 0), 'Dashboard total must still match the KY stats API');
    assert.strictEqual(Number(renderedKpi.Open), Number(kpi.open || 0), 'Dashboard Open count must still match the KY stats API');
    assert.strictEqual(Number(renderedKpi.Reviewed), Number(kpi.reviewed || 0), 'Dashboard Reviewed count must still match the KY stats API');
    assert.strictEqual(Number(renderedKpi.Closed), Number(kpi.closed || 0), 'Dashboard Closed count must still match the KY stats API');

    await evaluate(`document.querySelector('#ky-tab-btn-submit').click()`);
    await waitFor(`document.querySelector('#ky-video-central-machine') && document.querySelector('#ky-video-central-reference')`);
    const centralToggle = await evaluate(`(()=>{const toggle=document.querySelector('#ky-video-central-machine'),wrap=document.querySelector('#ky-video-central-reference-wrap');const hiddenBefore=wrap.classList.contains('hidden');toggle.click();return{hiddenBefore,hiddenAfter:wrap.classList.contains('hidden'),required:document.querySelector('#ky-video-central-reference').required};})()`);
    assert.deepStrictEqual(centralToggle, { hiddenBefore: true, hiddenAfter: false, required: true }, 'central-machine mode must reveal and require its external reference');

    await evaluate(`document.querySelector('#ky-tab-btn-history').click()`);
    await waitFor(`document.querySelector('#ky-history-clear')`);
    await evaluate(`document.querySelector('#ky-tab-btn-manage').click()`);
    await waitFor(`document.querySelector('#ky-msub-annual-video')`);
    await evaluate(`document.querySelector('#ky-msub-annual-video').click()`);
    await waitFor(`document.querySelector('[data-ky-annual-delete-selected]') && document.querySelector('#ky-manage-panel')?.textContent.includes('Annual Compliance Dashboard')`);

    const annualUi = await evaluate(`(()=>({summaryCards:document.querySelector('[data-ky-annual-summary]')?.children.length||0,hasDownload:Boolean(document.querySelector('[data-ky-annual-download]'))||${JSON.stringify((beforeAnnual.data?.summary?.productionFiles || 0) === 0)},hasAudit:Boolean(document.querySelector('[data-ky-annual-audit]'))||${JSON.stringify((beforeAnnual.data?.evidence || []).length === 0)},bulk:Boolean(document.querySelector('[data-ky-annual-delete-selected]'))}))()`);
    assert.strictEqual(annualUi.summaryCards, 6, 'Annual dashboard must render six summary metrics');
    assert.ok(annualUi.hasDownload && annualUi.hasAudit && annualUi.bulk, 'Annual Admin controls must match available records');

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
        await command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 });
        await sleep(300);
        const layout = await evaluate(`(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,panel:Boolean(document.querySelector('#ky-manage-panel')),annual:Boolean(document.querySelector('[data-ky-annual-delete-selected]'))}))()`);
        assert.ok(layout.panel && layout.annual, `Annual workspace must remain mounted at ${viewport.width}px`);
        assert.ok(layout.scroll <= layout.client + 24, `Annual workspace must not create material page overflow at ${viewport.width}px`);
    }

    const afterStats = await apiJson(`ky/stats?year=${year}`, token);
    assert.deepStrictEqual(afterStats.data?.kpi || afterStats.kpi, beforeStats.data?.kpi || beforeStats.kpi, 'read-only Browser UAT must not alter KY dashboard statistics');
    assert.deepStrictEqual(mutationRequests, [], `Browser UAT sent mutations: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('KY annual video Browser UI UAT: PASS (legacy KPI parity, submit/history/manage, annual dashboard, 3 viewports, zero writes/errors)');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    if (db) await db.end();
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
