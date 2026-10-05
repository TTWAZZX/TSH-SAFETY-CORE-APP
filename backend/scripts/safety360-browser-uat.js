'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const browserPath = process.env.SAFETY360_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const appUrl = process.env.SAFETY360_APP_URL || 'http://127.0.0.1/tsh-safety-core/index.html';
const cdpPort = Number(process.env.SAFETY360_CDP_PORT || 9871);
const employeeId = process.env.SAFETY360_UAT_EMPLOYEE_ID || '002390';
const year = Number(process.env.SAFETY360_UAT_YEAR || new Date().getFullYear());
const markerPrefix = 'UAT-S360-BROWSER-';
const marker = `${markerPrefix}${Date.now()}`;
const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-safety360-edge-'));
const pending = new Map();
const consoleErrors = [];
const failedResponses = [];
const mutationRequests = [];
let commandId = 1;
let socket;
let browser;
let server;
let fixtureId = 0;
let baselineTotal = null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assertLocalDatabase() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing browser fixture against non-local DB_HOST: ${host || '(empty)'}`);
    assert.match(String(process.env.DB_NAME || ''), /(?:uat|test|local|dev)/i, `Refusing browser fixture against DB_NAME: ${process.env.DB_NAME || '(empty)'}`);
}

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

async function waitFor(expression, timeout = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}; console=${consoleErrors.join(' | ')}`);
}

async function connectBrowser(apiUrl) {
    assert.ok(fs.existsSync(browserPath), `Microsoft Edge is required: ${browserPath}`);
    browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--disable-dev-shm-usage',
        '--disable-extensions', '--no-first-run', '--remote-allow-origins=*',
        '--window-size=1440,1000', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${browserProfile}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let i = 0; i < 80; i += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(row => row.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Edge debugging target unavailable');
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
            const isSessionRead = String(request.method || '').toUpperCase() === 'POST' && /\/api\/session\/verify(?:\?|$)/.test(request.url || '');
            if (!isSessionRead && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase()) && request.url?.includes('/api/')) {
                mutationRequests.push(`${request.method} ${request.url}`);
            }
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status) >= 400 && response.url?.includes('/api/')) failedResponses.push(`${response.status} ${response.url}`);
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
    await command('Network.setCacheDisabled', { cacheDisabled: true });
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};` });
}

async function viewportResult(width, height, mobile) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(400);
    return evaluate(`(()=>{
        const label=[...document.querySelectorAll('#person-profile p')].find(node=>node.textContent.trim()==='CCCF Form A Worker');
        const card=label?.closest('.bg-white.p-4');
        const retry=document.querySelector('[data-retry-profile]');
        return {
            width:${width},
            profileVisible:Boolean(document.querySelector('#person-profile h2')?.textContent.includes('อรอุมา นามลี')),
            targetText:card?.innerText||'',
            pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
            pageWidth:{scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth},
            overflowElements:[...document.querySelectorAll('body *')].filter(node=>{const r=node.getBoundingClientRect();return r.right>document.documentElement.clientWidth+2||r.left<-2;}).slice(0,8).map(node=>({tag:node.tagName,id:node.id,className:String(node.className||'').slice(0,160),left:Math.round(node.getBoundingClientRect().left),right:Math.round(node.getBoundingClientRect().right),width:Math.round(node.getBoundingClientRect().width)})),
            targetOverflow:card?card.scrollWidth>card.clientWidth+2:null,
            dataWarning:Boolean(retry),
        };
    })()`);
}

async function main() {
    assertLocalDatabase();
    await db.query('DELETE FROM CCCF_FormA_Worker WHERE EmployeeID=? AND JobArea LIKE ?', [employeeId, `${markerPrefix}%`]);
    const [[employee]] = await db.query(`SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role
                                           FROM Employees WHERE EmployeeID=?`, [employeeId]);
    assert.ok(employee, `Employee ${employeeId} is required`);
    const [[baseline]] = await db.query('SELECT COUNT(*) count FROM CCCF_FormA_Worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?', [employeeId, year]);
    assert.strictEqual(Number(baseline.count), 0, `${employeeId} browser baseline must contain no real ${year} Worker rows`);
    const [[totalBefore]] = await db.query('SELECT COUNT(*) count FROM CCCF_FormA_Worker');
    baselineTotal = Number(totalBefore.count);
    const { admin } = await loadReadyTestUsers(db);
    const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn: '20m' });
    const [insert] = await db.query(`INSERT INTO CCCF_FormA_Worker
        (EmployeeName,EmployeeID,Department,SafetyUnit,SubmitDate,JobArea,HazardDescription,CreatedBy)
        VALUES (?,?,?,?,?,?,?,?)`, [employee.EmployeeName, employeeId, employee.Department, employee.Unit, `${year}-06-15`, marker, marker, admin.id]);
    fixtureId = Number(insert.insertId);

    server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const apiUrl = `http://127.0.0.1:${server.address().port}`;
    await connectBrowser(apiUrl);
    await command('Page.navigate', { url: `${appUrl}?safety360_uat=${Date.now()}` });
    await sleep(1200);
    const browserUser = { ...admin, EmployeeID: admin.id, EmployeeName: admin.name, Role: admin.role, Department: admin.department, Unit: admin.unit, Position: admin.position };
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(browserUser))});location.hash='#search';location.reload();return true;})()`);
    await waitFor(`document.querySelector('#people-search-input') && document.querySelector('#person-profile')`);
    await evaluate(`(()=>{const input=document.querySelector('#people-search-input');input.value=${JSON.stringify(employeeId)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await waitFor(`document.querySelector('[data-person-id=${JSON.stringify(employeeId)}]')`);
    await evaluate(`document.querySelector('[data-person-id=${JSON.stringify(employeeId)}]').click()`);
    await waitFor(`document.querySelector('#person-profile h2')?.textContent.includes('อรอุมา นามลี')`);
    await evaluate(`document.querySelector('[data-profile-tab="targets"]').click()`);
    await waitFor(`[...document.querySelectorAll('#person-profile p')].some(node=>node.textContent.trim()==='CCCF Form A Worker')`);

    const desktop = await viewportResult(1440, 1000, false);
    const mobile = await viewportResult(390, 844, true);
    for (const result of [desktop, mobile]) {
        assert.strictEqual(result.profileVisible, true, `${result.width}px profile visibility`);
        assert.match(result.targetText, /100%/, `${result.width}px CCCF completion`);
        assert.match(result.targetText, /235\/235/, `${result.width}px authoritative Unit numerator/denominator`);
        assert.match(result.targetText, /Scope KPI/, `${result.width}px calculation scope`);
        assert.strictEqual(result.dataWarning, false, `${result.width}px healthy sources must not show partial-data warning`);
        assert.strictEqual(result.pageOverflow, false, `${result.width}px page overflow`);
        assert.strictEqual(result.targetOverflow, false, `${result.width}px target overflow`);
    }
    assert.deepStrictEqual(mutationRequests, [], `Browser must remain read-only: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(failedResponses, [], `Failed API responses: ${failedResponses.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log(`PASS Safety 360 Edge Browser UAT: ${employeeId} CCCF Worker Unit override 235/235=100% at 1440x1000 and 390x844; no overflow, mutations, failed APIs, or console errors`);
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    if (server) await new Promise(resolve => server.close(resolve));
    if (fixtureId) await db.query('DELETE FROM CCCF_FormA_Worker WHERE id=? AND JobArea=?', [fixtureId, marker]).catch(() => {});
    const [[remaining]] = await db.query('SELECT COUNT(*) count FROM CCCF_FormA_Worker WHERE EmployeeID=? AND JobArea LIKE ?', [employeeId, `${markerPrefix}%`]).catch(() => [[{ count: -1 }]]);
    console.log(`Safety 360 browser cleanup: fixtureRows=${remaining.count}`);
    if (Number(remaining.count) !== 0) process.exitCode = 1;
    if (baselineTotal !== null) {
        const [[totalAfter]] = await db.query('SELECT COUNT(*) count FROM CCCF_FormA_Worker').catch(() => [[{ count: -1 }]]);
        if (Number(totalAfter.count) !== baselineTotal) {
            console.error(`Safety 360 browser fingerprint changed: CCCF_FormA_Worker ${baselineTotal} -> ${totalAfter.count}`);
            process.exitCode = 1;
        }
    }
    await db.end().catch(() => {});
    await fs.promises.rm(browserProfile, { recursive: true, force: true }).catch(() => {});
});
