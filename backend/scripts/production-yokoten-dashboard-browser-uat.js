'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const isLocal = ['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname);
const apiPort = Number(process.env.YOKOTEN_UAT_API_PORT || 5000);
const apiBaseUrl = isLocal ? `http://127.0.0.1:${apiPort}` : baseUrl;
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.PROD_UAT_CDP_PORT || 9812);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-prod-dashboard-uat-'));
const artifactDir = path.join(
    path.resolve(__dirname, '..', '..'),
    'backups',
    isLocal ? 'local' : 'production',
    `yokoten-dashboard-browser-uat-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let client;
let server;
let db;

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    close() {
        try { this.socket.close(); } catch (_) {}
    }
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const result = await client.command('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (result.result?.value) return result.result.value;
        await sleep(300);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
}

async function evaluate(expression) {
    const result = await client.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
}

async function screenshot(name) {
    const result = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(result.data, 'base64'));
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    let targets;
    for (let i = 0; i < 60; i += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) {
                targets = await response.json();
                break;
            }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome CDP page target was not available');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
}

async function listenLocalApi() {
    if (!isLocal) return;
    const app = require('../server');
    db = require('../db');
    server = await new Promise((resolve, reject) => {
        const instance = app.listen(apiPort, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
}

async function loginProduction() {
    const response = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `Production login failed: ${text.slice(0, 300)}`);
    assert.ok(json?.token && json?.user, 'Production login did not return a session');
    return json;
}

async function responseCount(token) {
    const response = await fetch(`${apiBaseUrl}/api/yokoten/all-responses`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `Yokoten response count failed: ${JSON.stringify(json).slice(0, 300)}`);
    return Array.isArray(json?.data) ? json.data.length : 0;
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    await listenLocalApi();
    const session = await loginProduction();
    const beforeResponseCount = await responseCount(session.token);
    await connectBrowser();

    await client.command('Page.navigate', { url: `${baseUrl}/?browserUat=${Date.now()}` });
    await waitFor(`document.readyState === 'complete'`);
    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(session.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(session.user))});
        location.href = ${JSON.stringify(`${baseUrl}/#dashboard`)};
        return true;
    })()`);
    await waitFor(`Boolean(localStorage.getItem('tsh_token')) && location.hash === '#dashboard'`);
    try {
        await waitFor(`document.body.innerText.includes('Department Coverage Overview') && document.body.innerText.toUpperCase().includes('CCCF A (MANUAL)')`);
    } catch (error) {
        const debugState = await evaluate(`(() => ({
            href: location.href,
            hash: location.hash,
            title: document.title,
            tokenPresent: Boolean(localStorage.getItem('tsh_token')),
            bodyText: document.body.innerText.slice(0, 2000),
            bodyHtml: document.body.innerHTML.slice(0, 1000)
        }))()`);
        fs.writeFileSync(path.join(artifactDir, 'dashboard-debug.json'), JSON.stringify(debugState, null, 2));
        await screenshot('dashboard-debug.png');
        throw new Error(`${error.message}; debug artifact: ${artifactDir}`);
    }
    const dashboardState = await evaluate(`(() => ({
        hash: location.hash,
        hasOverview: document.body.innerText.includes('Department Coverage Overview'),
        hasCccfManual: document.body.innerText.toUpperCase().includes('CCCF A (MANUAL)'),
        tableRows: document.querySelectorAll('#db-compliance-wrap tbody tr').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(dashboardState.hash, '#dashboard');
    assert.strictEqual(dashboardState.hasOverview, true);
    assert.strictEqual(dashboardState.hasCccfManual, true);
    assert.ok(dashboardState.tableRows > 0, 'Dashboard browser table is empty');
    assert.strictEqual(dashboardState.horizontalOverflow, false, 'Dashboard has page-level horizontal overflow');
    await screenshot('dashboard.png');
    console.log(`PASS Dashboard browser — ${dashboardState.tableRows} rows`);

    await evaluate(`location.hash = '#yokoten'; true`);
    await waitFor(`location.hash === '#yokoten' && Boolean(document.querySelector('#yok-content [data-yok-card-image]'))`);
    await evaluate(`document.querySelector('#yok-tab-btn-topics')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('.yok-view-topic-btn, .yok-open-topic-btn'))`);
    await evaluate(`document.querySelector('.yok-view-topic-btn, .yok-open-topic-btn')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('.yok-admin-respond-btn'))`);
    await evaluate(`document.querySelector('.yok-admin-respond-btn')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('[data-selection-group="departments"][data-selection-mode="all"]'))`);
    const yokotenState = await evaluate(`(() => ({
        hash: location.hash,
        hasYokoten: document.body.innerText.toUpperCase().includes('YOKOTEN'),
        hasSelectAll: Boolean(document.querySelector('[data-selection-group="departments"][data-selection-mode="all"]')),
        departmentChoices: document.querySelectorAll('.yok-admin-selection-item[data-selection-group="departments"]').length,
        selectableDepartments: document.querySelectorAll('.yok-admin-selection-item[data-selection-group="departments"]:not(:disabled)').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(yokotenState.hash, '#yokoten');
    assert.strictEqual(yokotenState.hasYokoten, true);
    assert.strictEqual(yokotenState.hasSelectAll, true);
    assert.ok(yokotenState.departmentChoices > 0, 'Yokoten department choices are empty');
    assert.strictEqual(yokotenState.horizontalOverflow, false, 'Yokoten has page-level horizontal overflow');

    const individualState = await evaluate(`(() => {
        const rows = [...document.querySelectorAll('.yok-admin-selection-item[data-selection-group="departments"]:not(:disabled)')];
        const row = rows.find(item => item.dataset.selectionValue === 'MAINTENANCE SEC.') || rows[0];
        row.click();
        const units = [...document.querySelectorAll('.yok-admin-selection-item[data-selection-group="safetyUnits"]')];
        const result = {
            department: row.dataset.selectionValue,
            selected: row.getAttribute('aria-checked') === 'true',
            unitCount: units.length,
            selectedUnits: units.filter(item => item.getAttribute('aria-checked') === 'true').length,
            unitsBelongToDepartment: units.every(item => item.dataset.department === row.dataset.selectionValue)
        };
        row.click();
        result.cleared = row.getAttribute('aria-checked') === 'false'
            && document.querySelectorAll('.yok-admin-selection-item[data-selection-group="safetyUnits"]').length === 0;
        return result;
    })()`);
    assert.strictEqual(individualState.selected, true, 'Individual Department click did not select the row');
    assert.strictEqual(individualState.unitsBelongToDepartment, true, 'Unit list was not filtered by Department');
    assert.strictEqual(individualState.cleared, true, 'Individual Department click did not clear the row');

    const selectAllState = await evaluate(`(() => {
        document.querySelector('[data-selection-group="departments"][data-selection-mode="all"]').click();
        const departments = [...document.querySelectorAll('.yok-admin-selection-item[data-selection-group="departments"]:not(:disabled)')];
        const units = [...document.querySelectorAll('.yok-admin-selection-item[data-selection-group="safetyUnits"]:not(:disabled)')];
        const firstUnit = units[0];
        let unitToggleWorks = units.length === 0;
        if (firstUnit) {
            firstUnit.click();
            const cleared = firstUnit.getAttribute('aria-checked') === 'false';
            firstUnit.click();
            unitToggleWorks = cleared && firstUnit.getAttribute('aria-checked') === 'true';
        }
        return {
            selectedDepartments: departments.filter(item => item.getAttribute('aria-checked') === 'true').length,
            selectableDepartments: departments.length,
            selectedUnits: units.filter(item => item.getAttribute('aria-checked') === 'true').length,
            selectableUnits: units.length,
            unitToggleWorks
        };
    })()`);
    assert.strictEqual(selectAllState.selectedDepartments, selectAllState.selectableDepartments, 'Select-all missed a Department');
    assert.ok(selectAllState.selectableUnits > 0, 'Select-all did not expose scoped Units');
    assert.strictEqual(selectAllState.selectedUnits, selectAllState.selectableUnits, 'Select-all did not select all scoped Units');
    assert.strictEqual(selectAllState.unitToggleWorks, true, 'Individual Safety Unit toggle did not work');

    await screenshot('yokoten.png');
    console.log(`PASS Yokoten individual selection — ${individualState.department}, ${individualState.unitCount} scoped Units`);
    console.log(`PASS Yokoten select-all — ${selectAllState.selectedDepartments} Departments, ${selectAllState.selectedUnits} Units`);

    const afterResponseCount = await responseCount(session.token);
    assert.strictEqual(afterResponseCount, beforeResponseCount, 'Read-only browser UAT changed Yokoten response data');

    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify({
        environment: isLocal ? 'local' : 'production',
        baseUrl,
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
        dashboard: dashboardState,
        yokoten: yokotenState,
        yokotenIndividualSelection: individualState,
        yokotenSelectAll: selectAllState,
        responseCountBefore: beforeResponseCount,
        responseCountAfter: afterResponseCount,
        passed: true,
    }, null, 2));
    console.log(`ARTIFACT ${artifactDir}`);
}

main()
    .catch(error => {
        console.error(`FAIL ${error.stack || error.message || error}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        client?.close();
        if (browser && !browser.killed) browser.kill();
        if (server) await new Promise(resolve => server.close(resolve));
        if (db) await db.end();
        await sleep(500);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
