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
let browserStderr = '';

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }

    async connect() {
        this.socket.addEventListener('message', async event => {
            try {
                let raw = event.data;
                if (raw && typeof raw.text === 'function') raw = await raw.text();
                if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
                if (ArrayBuffer.isView(raw)) raw = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('utf8');
                const message = JSON.parse(String(raw));
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                clearTimeout(pending.timer);
                message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
            } catch (error) {
                console.warn(`CDP message warning: ${error.message}`);
            }
        });
        this.socket.addEventListener('close', () => {
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`CDP socket closed${browserStderr ? `: ${browserStderr.slice(-500)}` : ''}`));
            }
            this.pending.clear();
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
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-allow-origins=*',
        '--window-size=1440,1000',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    browser.stderr?.on('data', chunk => {
        browserStderr += String(chunk);
    });

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
    client = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
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
        const firstRow = document.querySelector('.msd-data-table tbody .msd-clickable-row');
        return {
            viewport: document.documentElement.clientWidth,
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            shellWidth: Math.round(shell.getBoundingClientRect().width),
            shellParentWidth: Math.round(shell.parentElement.getBoundingClientRect().width),
            shellMaxWidth: getComputedStyle(shell).maxWidth,
            resultClientWidth: results.clientWidth,
            resultScrollWidth: results.scrollWidth,
            filterColumns: getComputedStyle(filter).gridTemplateColumns.split(' ').length,
            listVisible: Boolean(table),
            cardVisible: Boolean(document.querySelector('.msd-card-grid')),
            headerColumns: table?.querySelectorAll('thead th').length || 0,
            rowRole: firstRow?.getAttribute('role') || '',
            rowTabIndex: firstRow?.getAttribute('tabindex') || '',
            resultFitsWithoutHorizontalScroll: results.scrollWidth <= results.clientWidth + 1,
        };
    })()`);
    assert.strictEqual(desktop.pageOverflow, false, 'desktop has page-level horizontal overflow');
    assert.ok(
        Math.abs(desktop.shellWidth - desktop.shellParentWidth) <= 2,
        `desktop shell must fill its parent: ${desktop.shellWidth}/${desktop.shellParentWidth}`
    );
    assert.strictEqual(desktop.shellMaxWidth, 'none');
    assert.strictEqual(desktop.listVisible, true, 'desktop must start in compact list view');
    assert.strictEqual(desktop.cardVisible, false, 'desktop must not start in card view');
    assert.ok(desktop.filterColumns >= 4, `desktop filter grid is too narrow: ${desktop.filterColumns} columns`);
    assert.strictEqual(desktop.headerColumns, 4, `desktop list must have 4 columns, got ${desktop.headerColumns}`);
    assert.strictEqual(desktop.rowRole, 'button', 'desktop row must expose button semantics');
    assert.strictEqual(desktop.rowTabIndex, '0', 'desktop row must be keyboard focusable');
    assert.strictEqual(desktop.resultFitsWithoutHorizontalScroll, true, 'desktop 4-column list should fit without horizontal scrolling');
    await evaluate(`(() => {
        const row = document.querySelector('.msd-data-table tbody .msd-clickable-row');
        row?.focus();
        row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return true;
    })()`);
    await waitFor(`Boolean(document.querySelector('#dtab-compliance'))
        && Boolean(document.querySelector('#dtab-issues'))
        && Boolean(document.querySelector('#dtab-files'))`);
    const detailManagement = await evaluate(`(() => ({
        visible: !document.querySelector('#modal-wrapper').classList.contains('hidden'),
        complianceTab: Boolean(document.querySelector('#dtab-compliance')),
        issuesTab: Boolean(document.querySelector('#dtab-issues')),
        filesTab: Boolean(document.querySelector('#dtab-files')),
        adminComplianceSave: Boolean(document.querySelector('#btn-save-compliance')),
        adminIssueAdd: Boolean(document.querySelector('#btn-add-issue')),
        adminEdit: Boolean(document.querySelector('[onclick^="window._msdEditFromDetail"]')),
        adminDelete: Boolean(document.querySelector('[onclick^="window._msdDeleteFromDetail"]')),
    }))()`);
    assert.deepStrictEqual(detailManagement, {
        visible: true,
        complianceTab: true,
        issuesTab: true,
        filesTab: true,
        adminComplianceSave: true,
        adminIssueAdd: true,
        adminEdit: true,
        adminDelete: true,
    }, 'Admin detail management controls are incomplete');
    await screenshot('desktop-detail.png');
    await evaluate(`document.querySelector('#modal-close-btn')?.click(); true`);
    await waitFor(`document.querySelector('#modal-wrapper').classList.contains('hidden')`);
    await evaluate(`document.querySelector('.msd-filter-grid').scrollIntoView({ block: 'start' }); true`);
    await sleep(300);
    await screenshot('desktop-list.png');

    const desktopList = await evaluate(`(() => {
        const results = document.querySelector('.msd-results-scroll');
        return {
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            resultClientWidth: results.clientWidth,
            resultScrollWidth: results.scrollWidth,
            headerColumns: document.querySelectorAll('.msd-data-table thead th').length,
        };
    })()`);
    assert.strictEqual(desktopList.pageOverflow, false, 'desktop list mode has page-level horizontal overflow');
    assert.strictEqual(desktopList.headerColumns, 4, 'desktop compact list column count changed');

    await evaluate(`document.querySelectorAll('.msd-view-toggle button')[1]?.click(); true`);
    await waitFor(`Boolean(document.querySelector('.msd-card-grid article'))`);
    const desktopCard = await evaluate(`(() => ({
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cards: document.querySelectorAll('.msd-card-grid article').length
    }))()`);
    assert.strictEqual(desktopCard.pageOverflow, false, 'desktop card mode has page-level horizontal overflow');
    assert.ok(desktopCard.cards > 0, 'desktop card mode is empty');

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
        detailManagement,
        desktopList,
        desktopCard,
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
