'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.PROD_UAT_CDP_PORT || 9812);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-prod-dashboard-uat-'));
const artifactDir = path.join(
    path.resolve(__dirname, '..', '..'),
    'backups',
    'production',
    `yokoten-dashboard-browser-uat-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let client;

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

async function loginProduction() {
    const response = await fetch(`${baseUrl}/api/login`, {
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

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    const session = await loginProduction();
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
        departmentChoices: document.querySelectorAll('input[type="checkbox"][name="departments"]').length,
        selectableDepartments: document.querySelectorAll('input[type="checkbox"][name="departments"]:not(:disabled)').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
    assert.strictEqual(yokotenState.hash, '#yokoten');
    assert.strictEqual(yokotenState.hasYokoten, true);
    assert.strictEqual(yokotenState.hasSelectAll, true);
    assert.ok(yokotenState.departmentChoices > 0, 'Yokoten department choices are empty');
    assert.strictEqual(yokotenState.horizontalOverflow, false, 'Yokoten has page-level horizontal overflow');
    await screenshot('yokoten.png');
    console.log(`PASS Yokoten bulk-response browser — ${yokotenState.selectableDepartments}/${yokotenState.departmentChoices} departments selectable`);

    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify({
        production: baseUrl,
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
        dashboard: dashboardState,
        yokoten: yokotenState,
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
        await sleep(500);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
