'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(
    process.env.EMPLOYEE_MASTER_UAT_URL
        || process.env.PROD_UAT_URL
        || 'https://dev.tshpcl.com/safety/tsh-safety-core'
).replace(/\/+$/, '');
const isLocal = ['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname);
const apiBaseUrl = String(
    process.env.EMPLOYEE_MASTER_UAT_API_URL || (isLocal ? 'http://127.0.0.1:5000' : baseUrl)
).replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.EMPLOYEE_MASTER_UAT_CDP_PORT || 9826);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-employee-master-uat-'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const artifactDir = path.join(__dirname, '..', '..', 'backups', isLocal ? 'local' : 'production', `employee-master-browser-uat-${stamp}`);
const runtimeErrors = [];
let browser;
let client;
let browserStderr = '';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function idKey(value) {
    const raw = String(value ?? '').trim().toUpperCase();
    if (/^\d+$/.test(raw)) return [0, '', raw.replace(/^0+(?=\d)/, '') || '0', raw];
    const prefixed = raw.match(/^([A-Z]+)(\d+)$/);
    if (prefixed) return [1, prefixed[1], prefixed[2].replace(/^0+(?=\d)/, '') || '0', raw];
    return [2, raw, '', raw];
}

function compareIds(left, right) {
    const a = idKey(left);
    const b = idKey(right);
    if (a[0] !== b[0]) return a[0] - b[0];
    const prefix = a[1].localeCompare(b[1], 'en', { numeric: true, sensitivity: 'base' });
    if (prefix) return prefix;
    if (a[2].length !== b[2].length) return a[2].length - b[2].length;
    return a[2].localeCompare(b[2], 'en') || a[3].localeCompare(b[3], 'en');
}

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
                if (message.method === 'Runtime.exceptionThrown') {
                    runtimeErrors.push(message.params?.exceptionDetails?.exception?.description
                        || message.params?.exceptionDetails?.text || 'Runtime exception');
                }
                if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
                    runtimeErrors.push((message.params.args || []).map(arg => arg.value || arg.description || '').join(' '));
                }
                if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
                    const entry = message.params.entry;
                    runtimeErrors.push(`${entry.text || 'Browser log error'}${entry.url ? ` [${entry.url}]` : ''}`);
                }
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                clearTimeout(pending.timer);
                message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
            } catch (error) {
                console.warn(`CDP message warning: ${error.message}`);
            }
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

    close() { try { this.socket.close(); } catch (_) {} }
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

async function login() {
    const response = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `Admin login failed: ${text.slice(0, 300)}`);
    assert.ok(json?.token && json?.user, 'Admin session missing');
    return json;
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
        '--disable-extensions', '--no-first-run', '--no-default-browser-check',
        '--remote-allow-origins=*', '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    browser.stderr?.on('data', chunk => { browserStderr += String(chunk); });

    let targets;
    for (let index = 0; index < 60; index += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, `Chrome CDP unavailable: ${browserStderr.slice(-500)}`);
    client = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Log.enable');
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });

    const session = await login();
    const employeeResponse = await fetch(`${apiBaseUrl}/api/admin/employees`, {
        headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json' },
    });
    const employeeText = await employeeResponse.text();
    let employeeJson = null;
    try { employeeJson = JSON.parse(employeeText); } catch (_) {}
    assert.strictEqual(employeeResponse.status, 200, `Admin employee list failed: ${employeeText.slice(0, 300)}`);
    assert.ok(employeeJson, `Admin employee list returned non-JSON: ${employeeText.slice(0, 300)}`);
    assert.ok(Array.isArray(employeeJson?.data), 'Admin employee list shape invalid');
    const recentResponse = await fetch(`${apiBaseUrl}/api/admin/employee/recent-additions?limit=20`, {
        headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json' },
    });
    const recentText = await recentResponse.text();
    let recentJson = null;
    try { recentJson = JSON.parse(recentText); } catch (_) {}
    assert.strictEqual(recentResponse.status, 200, `Recent additions list failed: ${recentText.slice(0, 300)}`);
    assert.ok(recentJson, `Recent additions returned non-JSON: ${recentText.slice(0, 300)}`);
    console.log('INFO Admin session ready');
    await connectBrowser();
    if (isLocal) {
        await client.command('Page.addScriptToEvaluateOnNewDocument', {
            source: `window.API_BASE = ${JSON.stringify(`${apiBaseUrl}/api`)};`,
        });
    }
    console.log('INFO Chrome CDP connected');
    await client.command('Page.navigate', { url: `${baseUrl}/` });
    console.log('INFO Production shell requested');
    await waitFor(`document.readyState === 'complete'`);
    console.log('INFO Production shell loaded');
    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(session.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(session.user))});
        location.href = ${JSON.stringify(`${baseUrl}/index.html#admin`)};
        return true;
    })()`);
    await sleep(5000);
    const routeState = await evaluate(`({
        href: location.href,
        hash: location.hash,
        ready: document.readyState,
        hasAdminPage: Boolean(document.querySelector('#admin-page')),
        adminPageHidden: document.querySelector('#admin-page')?.classList.contains('hidden') ?? null,
        hasAdminTab: typeof window._adminTab === 'function',
        bodyText: document.body?.innerText?.slice(0, 200) || ''
    })`);
    console.log(`INFO Route state ${JSON.stringify(routeState)}`);
    await waitFor(`location.hash === '#admin' && typeof window._adminTab === 'function'`);
    console.log('INFO System Console loaded');
    await evaluate(`void window._adminTab('employees'); true`);
    console.log('INFO Employee tab requested');
    await waitFor(`Boolean(document.querySelector('#emp-recent-additions'))
        && !document.querySelector('#emp-recent-additions').textContent.includes('กำลังโหลด')
        && Boolean(document.querySelector('#emp-table-wrap table tbody'))`);
    await sleep(1500);

    const pageState = await evaluate(`(() => ({
        title: document.querySelector('#admin-content-area h3')?.textContent?.trim() || '',
        recentHeading: document.querySelector('#emp-recent-additions')?.textContent?.includes('พนักงานที่เพิ่มล่าสุด') || false,
        recentCards: document.querySelectorAll('#emp-recent-additions button[onclick^="window._empShowRecent"]').length,
        employeeRows: document.querySelectorAll('#emp-table-wrap table tbody tr').length,
        sortOptions: document.querySelectorAll('#emp-sort-filter option').length,
        loading: document.body.textContent.includes('กำลังโหลดพนักงานที่เพิ่มล่าสุด...'),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }))()`);
    assert.strictEqual(pageState.recentHeading, true, 'Recent additions heading is missing');
    assert.ok(pageState.recentCards > 0, 'Recent additions cards were not rendered');
    assert.ok(pageState.employeeRows > 0, 'Employee table did not render');
    assert.strictEqual(pageState.sortOptions, 6, 'Employee sort options are incomplete');
    assert.strictEqual(pageState.loading, false, 'Recent additions remained in loading state');

    const expectedIdAsc = [...employeeJson.data]
        .sort((a, b) => compareIds(a.EmployeeID, b.EmployeeID))
        .slice(0, 25)
        .map(row => String(row.EmployeeID));
    await evaluate(`(() => {
        const select = document.querySelector('#emp-sort-filter');
        select.value = 'id_asc';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    await sleep(300);
    const actualIdAsc = await evaluate(`[...document.querySelectorAll('#emp-table-wrap table tbody tr td:first-child .font-mono')].map(node => node.textContent.trim())`);
    assert.deepStrictEqual(actualIdAsc, expectedIdAsc, 'Natural EmployeeID ascending order mismatch');

    const expectedNewest = [...employeeJson.data]
        .sort((a, b) => {
            const aTime = a.CreatedAt ? Date.parse(String(a.CreatedAt).replace(' ', 'T')) : null;
            const bTime = b.CreatedAt ? Date.parse(String(b.CreatedAt).replace(' ', 'T')) : null;
            if (aTime === null && bTime === null) return compareIds(a.EmployeeID, b.EmployeeID);
            if (aTime === null) return 1;
            if (bTime === null) return -1;
            return bTime - aTime || compareIds(a.EmployeeID, b.EmployeeID);
        })
        .slice(0, 25)
        .map(row => String(row.EmployeeID));
    await evaluate(`(() => {
        const select = document.querySelector('#emp-sort-filter');
        select.value = 'created_desc';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    await sleep(300);
    const actualNewest = await evaluate(`[...document.querySelectorAll('#emp-table-wrap table tbody tr td:first-child .font-mono')].map(node => node.textContent.trim())`);
    assert.deepStrictEqual(actualNewest, expectedNewest, 'Newest employee order mismatch');

    const recentRows = Array.isArray(recentJson?.data) ? recentJson.data : [];
    const sourceToTest = recentRows.some(row => row.Source === 'import') ? 'import' : 'manual';
    const sourceLabel = sourceToTest === 'import' ? 'Import Excel' : 'เพิ่มทีละคน';
    const expectedRecentCount = Math.min(5, recentRows.filter(row => row.Source === sourceToTest).length);
    await evaluate(`(() => {
        const button = [...document.querySelectorAll('#emp-recent-additions button')]
            .find(node => node.textContent.trim() === ${JSON.stringify(sourceLabel)});
        button?.click();
        return Boolean(button);
    })()`);
    await sleep(300);
    const sourceFilterState = await evaluate(`({
        cards: document.querySelectorAll('#emp-recent-additions button[onclick^="window._empShowRecent"]').length,
        text: document.querySelector('#emp-recent-additions').textContent
    })`);
    assert.strictEqual(sourceFilterState.cards, expectedRecentCount, 'Recent source filter count mismatch');
    if (expectedRecentCount) assert.ok(sourceFilterState.text.includes(sourceLabel), 'Recent source label missing');

    const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifactDir, 'employee-master.png'), Buffer.from(screenshot.data, 'base64'));
    await sleep(500);
    const ignoredLocalErrors = runtimeErrors.filter(error => isLocal && error.includes('/safety/tsh-safety-core/uploads/'));
    const blockingRuntimeErrors = runtimeErrors.filter(error => !ignoredLocalErrors.includes(error));
    assert.deepStrictEqual(blockingRuntimeErrors, [], `Browser runtime errors: ${blockingRuntimeErrors.join(' | ')}`);

    const result = {
        url: `${baseUrl}/#admin`,
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
        pageState,
        runtimeErrors,
        ignoredLocalErrors,
        blockingRuntimeErrors,
        passed: true,
    };
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`PASS Employee Master browser UAT — natural ID sort, newest sort, source filter, ${pageState.employeeRows} table rows, 0 runtime errors`);
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
        await sleep(300);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
