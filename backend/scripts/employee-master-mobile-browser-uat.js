'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const db = require('../db');

const appUrl = process.env.EMPLOYEE_MASTER_MOBILE_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiOrigin = 'http://127.0.0.1:5099';
const browserPath = process.env.EMPLOYEE_MASTER_MOBILE_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9799;
const employeeId = `ZEMM${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
const employeeName = `Employee Mobile Test ${employeeId}`;
const email = `${employeeId.toLowerCase()}@gmail.com`;
const password = 'Employee-Mobile-UAT-84!';
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-employee-mobile-'));
const pendingCommands = new Map();
const consoleErrors = [];
const failedApiResponses = [];
const browserMutations = [];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let commandId = 1;
let browser;
let socket;
let server;

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

async function startServer() {
    server = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, PORT: '5099' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
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
            const method = String(request.method || '').toUpperCase();
            const requestUrl = String(request.url || '');
            if (requestUrl.includes('/api/')
                && !requestUrl.endsWith('/api/session/verify')
                && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                browserMutations.push(`${method} ${request.url}`);
            }
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/')) {
                failedApiResponses.push(`${response.status} ${response.url}`);
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

async function cleanup() {
    await db.query('DELETE FROM Admin_AuditLogs WHERE AdminID=? OR TargetID=?', [employeeId, employeeId]).catch(() => {});
    await db.query('DELETE FROM auth_login_attempts WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
}

(async () => {
    assert.ok(fs.existsSync(browserPath), `Browser not found: ${browserPath}`);
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()));
    assert.match(String(process.env.DB_NAME || ''), /(?:uat|test|local|dev)/i);
    const [[scope]] = await db.query(
        `SELECT d.Name Department,
                COALESCE((SELECT u.name FROM Master_SafetyUnits u WHERE u.department_id=d.id ORDER BY u.id LIMIT 1),'') Unit
           FROM Master_Departments d ORDER BY d.id LIMIT 1`
    );
    assert.ok(scope?.Department, 'A valid Department master scope is required');
    await db.query(
        `INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?,0)`,
        [employeeId, employeeName, scope.Department, scope.Unit, '', 'Mobile Test Admin', email, 'Admin', await bcrypt.hash(password, 4)]
    );
    await startServer();
    const loginResponse = await fetch(`${apiOrigin}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200, 'Fixture Admin login failed');
    assert.ok(login.token && login.user, 'Fixture Admin session missing');
    await connectBrowser();
    await command('Page.navigate', { url: `${appUrl}?employee_mobile_uat=${Date.now()}` });
    await waitFor("document.readyState==='complete'");
    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(login.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(login.user))});
        location.href = ${JSON.stringify(`${appUrl}#admin`)};
        return true;
    })()`);
    await waitFor("location.hash==='#admin'&&typeof window._adminTab==='function'");
    await evaluate("window._adminTab('employees'); true");
    await waitFor("document.querySelectorAll('[data-employee-card]').length>0&&document.querySelector('#emp-table-wrap table tbody')");

    const results = [];
    for (const [width, height] of [[1440, 1000], [1024, 768], [400, 724], [390, 844]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(250);
        results.push(await evaluate(`(() => {
            const mobileList = document.querySelector('[data-employee-mobile-list]');
            const desktopList = document.querySelector('[data-employee-desktop-table]');
            const cards = [...document.querySelectorAll('[data-employee-card]')];
            const firstCard = cards[0];
            const actions = firstCard ? [...firstCard.querySelectorAll('button')] : [];
            const controls = [...document.querySelectorAll('#emp-search-input,#emp-dept-filter,#emp-unit-filter,#emp-safety-unit-filter,#emp-sort-filter')];
            return {
                width: ${width},
                mobileVisible: Boolean(mobileList && getComputedStyle(mobileList).display !== 'none'),
                desktopVisible: Boolean(desktopList && getComputedStyle(desktopList).display !== 'none'),
                cards: cards.length,
                cardHasEmail: Boolean(firstCard?.textContent.includes('Company Email')),
                actionMinHeight: actions.length ? Math.min(...actions.map(button => button.getBoundingClientRect().height)) : 0,
                controlMinHeight: controls.length ? Math.min(...controls.map(control => control.getBoundingClientRect().height)) : 0,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 3,
            };
        })()`));
    }
    for (const result of results) {
        assert.equal(result.overflow, false, `${result.width}: global horizontal overflow`);
        assert.ok(result.controlMinHeight >= 43, `${result.width}: filter touch target too small`);
        if (result.width < 768) {
            assert.equal(result.mobileVisible, true, `${result.width}: mobile cards hidden`);
            assert.equal(result.desktopVisible, false, `${result.width}: desktop table visible`);
            assert.ok(result.cards > 0 && result.cardHasEmail, `${result.width}: mobile employee details missing`);
            assert.ok(result.actionMinHeight >= 43, `${result.width}: action touch target too small`);
        } else {
            assert.equal(result.mobileVisible, false, `${result.width}: mobile cards visible on desktop`);
            assert.equal(result.desktopVisible, true, `${result.width}: desktop table hidden`);
        }
    }
    const screenshotPath = String(process.env.EMPLOYEE_MASTER_MOBILE_SCREENSHOT || '').trim();
    if (screenshotPath) {
        await evaluate("document.querySelector('#emp-table-wrap')?.scrollIntoView({block:'start'}); true");
        await sleep(250);
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    }
    assert.deepEqual(browserMutations, [], `Unexpected browser mutations: ${browserMutations.join(' | ')}`);
    assert.deepEqual(failedApiResponses, [], `Employee Master API failures: ${failedApiResponses.join(' | ')}`);
    assert.deepEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log(`Employee Master Mobile Browser UAT passed: ${results.map(row => `${row.width}px`).join(', ')}, responsive cards/table, 44px controls, zero overflow/writes/errors.`);
})().catch(error => {
    console.error(error.stack || error);
    if (consoleErrors.length) console.error(`Browser console: ${consoleErrors.join(' | ')}`);
    if (failedApiResponses.length) console.error(`Failed APIs: ${failedApiResponses.join(' | ')}`);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    try { server?.kill(); } catch (_) {}
    await cleanup();
    const [[residue]] = await db.query('SELECT COUNT(*) employees FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => [[{ employees: -1 }]]);
    console.log(`Employee Master Mobile Browser cleanup: employees=${residue.employees}`);
    await db.end().catch(() => {});
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
