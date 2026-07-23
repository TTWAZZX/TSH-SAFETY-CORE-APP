'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const apiPort = Number(process.env.MACHINE_SAFETY_UAT_API_PORT || 5000);
const cdpPort = Number(process.env.MACHINE_SAFETY_UAT_CDP_PORT || 9814);
const baseUrl = String(
    process.env.MACHINE_SAFETY_UAT_URL || 'http://localhost/tsh-safety-core'
).replace(/\/+$/, '');
const isLocal = ['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname);
const apiBaseUrl = isLocal ? `http://127.0.0.1:${apiPort}` : baseUrl;
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-machine-responsive-uat-'));
const artifactDir = path.join(
    path.resolve(__dirname, '..', '..'),
    'backups',
    isLocal ? 'local' : 'production',
    `machine-safety-responsive-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
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
            this.socket.addEventListener('open', () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
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

async function evaluate(expression) {
    const response = await client.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
}

async function screenshot(name) {
    const result = await client.command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(result.data, 'base64'));
}

async function listen() {
    if (!isLocal) return;
    const app = require('../server');
    db = require('../db');
    server = await new Promise((resolve, reject) => {
        const instance = app.listen(apiPort, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,1000',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    let targets;
    for (let index = 0; index < 60; index += 1) {
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

async function login() {
    const response = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `Local login failed: ${text.slice(0, 300)}`);
    assert.ok(json?.token && json?.user, 'Local login did not return a session');
    return json;
}

async function openMachineSafety(session) {
    await client.command('Page.navigate', { url: `${baseUrl}/?machineResponsiveUat=${Date.now()}` });
    await waitFor(`document.readyState === 'complete'`);
    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(session.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(session.user))});
        location.href = ${JSON.stringify(`${baseUrl}/#machine-safety`)};
        return true;
    })()`);
    await waitFor(`location.hash === '#machine-safety' && Boolean(document.querySelector('.msd-page-shell'))`);
    await waitFor(`document.querySelectorAll('#msd-table-wrap tbody tr, .msd-card-grid article').length > 0`);
}

async function main() {
    assert.ok(adminId && adminPassword, 'Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });

    await listen();
    const session = await login();
    await connectBrowser();
    await openMachineSafety(session);

    const desktop = await evaluate(`(() => {
        const shell = document.querySelector('.msd-page-shell');
        const results = document.querySelector('.msd-results-scroll');
        const filter = document.querySelector('.msd-filter-grid');
        const table = document.querySelector('.msd-data-table');
        return {
            viewport: document.documentElement.clientWidth,
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            shellWidth: Math.round(shell.getBoundingClientRect().width),
            shellMaxWidth: getComputedStyle(shell).maxWidth,
            resultClientWidth: results.clientWidth,
            resultScrollWidth: results.scrollWidth,
            filterColumns: getComputedStyle(filter).gridTemplateColumns.split(' ').length,
            listVisible: Boolean(table),
            cardVisible: Boolean(document.querySelector('.msd-card-grid')),
        };
    })()`);
    assert.strictEqual(desktop.pageOverflow, false, 'desktop has page-level horizontal overflow');
    assert.ok(desktop.shellWidth <= 1440, `desktop shell exceeds 1440px: ${desktop.shellWidth}`);
    assert.strictEqual(desktop.shellMaxWidth, '1440px');
    assert.strictEqual(desktop.listVisible, false, 'desktop must not start in list view');
    assert.strictEqual(desktop.cardVisible, true, 'desktop must start in card view');
    assert.ok(desktop.filterColumns >= 4, `desktop filter grid is too narrow: ${desktop.filterColumns} columns`);
    await evaluate(`document.querySelector('.msd-filter-grid').scrollIntoView({ block: 'start' }); true`);
    await sleep(300);
    await screenshot('desktop.png');

    await evaluate(`document.querySelector('.msd-view-toggle button')?.click(); true`);
    await waitFor(`Boolean(document.querySelector('.msd-data-table'))`);
    const desktopList = await evaluate(`(() => {
        const results = document.querySelector('.msd-results-scroll');
        return {
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            resultClientWidth: results.clientWidth,
            resultScrollWidth: results.scrollWidth,
        };
    })()`);
    assert.strictEqual(desktopList.pageOverflow, false, 'desktop list mode has page-level horizontal overflow');
    assert.ok(
        desktopList.resultScrollWidth > desktopList.resultClientWidth,
        'desktop list mode should scroll inside its result frame'
    );

    await client.command('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await evaluate(`location.hash = '#dashboard'; true`);
    await waitFor(`location.hash === '#dashboard'`);
    await evaluate(`location.hash = '#machine-safety'; true`);
    await waitFor(`location.hash === '#machine-safety' && Boolean(document.querySelector('.msd-card-grid article'))`);

    const mobile = await evaluate(`(() => {
        const shell = document.querySelector('.msd-page-shell');
        const filter = document.querySelector('.msd-filter-grid');
        const firstCard = document.querySelector('.msd-card-grid article');
        const cardRect = firstCard.getBoundingClientRect();
        return {
            viewport: document.documentElement.clientWidth,
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            shellWidth: Math.round(shell.getBoundingClientRect().width),
            filterColumns: getComputedStyle(filter).gridTemplateColumns.split(' ').length,
            advancedFiltersHidden: [...document.querySelectorAll('.msd-filter-advanced')]
                .every(control => getComputedStyle(control).display === 'none'),
            listVisible: Boolean(document.querySelector('.msd-data-table')),
            cardVisible: Boolean(firstCard),
            cardInsideViewport: cardRect.left >= 0 && cardRect.right <= document.documentElement.clientWidth,
        };
    })()`);
    assert.strictEqual(mobile.pageOverflow, false, 'mobile has page-level horizontal overflow');
    assert.strictEqual(mobile.listVisible, false, 'mobile must not start in list view');
    assert.strictEqual(mobile.cardVisible, true, 'mobile card view is missing');
    assert.strictEqual(mobile.cardInsideViewport, true, 'mobile card extends outside the viewport');
    assert.strictEqual(mobile.filterColumns, 1, `mobile filter grid must be one column, got ${mobile.filterColumns}`);
    assert.strictEqual(mobile.advancedFiltersHidden, true, 'mobile advanced filters must start collapsed');
    await evaluate(`document.querySelector('.msd-filter-grid').scrollIntoView({ block: 'start' }); true`);
    await sleep(300);
    await screenshot('mobile.png');
    await evaluate(`document.querySelector('.msd-mobile-filter-toggle')?.click(); true`);
    await waitFor(`[...document.querySelectorAll('.msd-filter-advanced')]
        .every(control => getComputedStyle(control).display !== 'none')`);

    const result = {
        url: baseUrl,
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
        desktop,
        desktopList,
        mobile,
        passed: true,
    };
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`PASS Machine Safety browser UAT — desktop ${desktop.viewport}px, mobile ${mobile.viewport}px`);
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
        if (server) {
            server.closeAllConnections?.();
            await new Promise(resolve => server.close(resolve));
        }
        await db?.end().catch(() => {});
        await sleep(300);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
