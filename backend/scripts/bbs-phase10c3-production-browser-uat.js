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
const cdpPort = Number(process.env.BBS_PROD_UAT_CDP_PORT || 9844);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs-production-uat-'));
const errors = [];
let chrome;
let socket;
let commandId = 1;
const pending = new Map();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function command(method, params = {}, timeout = 45000) {
    const id = commandId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
}

async function waitFor(expression, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function login() {
    const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch (_) { json = null; }
    assert.strictEqual(response.status, 200, `Production login failed: ${text.slice(0, 200)}`);
    assert.ok(json?.token && json?.user, 'Production login did not return a session');
    return json;
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', '--window-size=390,844',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let index = 0; index < 60; index++) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(item => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        clearTimeout(item.timer);
        message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chrome connection timeout')), 15000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
}

(async () => {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    const session = await login();
    await connectChrome();
    await command('Page.navigate', { url: `${baseUrl}/index.html?bbs_production_uat=${Date.now()}` });
    await waitFor(`document.readyState==='complete'`);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(session.token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(session.user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`Boolean(document.querySelector('[data-bbs-shell]'))`);
    const groups = await evaluate(`[...document.querySelectorAll('[data-bbs-group]')].map(group=>({key:group.dataset.bbsGroup,target:group.dataset.bbsGroupTarget}))`);
    assert.ok(groups.length >= 6, `Expected 6 BBS navigation groups, got ${groups.length}`);
    const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
    let tabCount = 0;
    for (const group of groups) {
        await evaluate(`document.querySelector('[data-bbs-group=${JSON.stringify(group.key)}]').click()`);
        await waitFor(`document.querySelector('[data-bbs-group=${JSON.stringify(group.key)}]')?.getAttribute('aria-current')==='page'`);
        const tabs = await evaluate(`[...document.querySelectorAll('[data-bbs-tab]')].map(tab=>tab.dataset.bbsTab)`);
        tabCount += tabs.length;
        for (const tab of tabs) {
            await evaluate(`document.querySelector('[data-bbs-tab=${JSON.stringify(tab)}]').click()`);
            await waitFor(`document.querySelector('[data-bbs-tab=${JSON.stringify(tab)}]')?.getAttribute('aria-selected')==='true'`);
            for (const viewport of viewports) {
                await command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: true });
                await sleep(200);
                const audit = await evaluate(`(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,selected:document.querySelectorAll('[data-bbs-tab][aria-selected="true"]').length,panel:document.getElementById('bbs-smart-card-body')?.getAttribute('role')}))()`);
                assert.strictEqual(audit.overflow, false, `${tab} ${viewport.width}x${viewport.height} overflow`);
                assert.strictEqual(audit.selected, 1, `${tab} selected tab count`);
                assert.strictEqual(audit.panel, 'tabpanel', `${tab} tabpanel semantics`);
            }
        }
    }
    assert.ok(tabCount >= 8, `Expected at least 8 BBS tabs across groups, got ${tabCount}`);
    await evaluate(`document.querySelector('[data-bbs-group="admin"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-card-workspace-navigation]'))`);
    const cards = await evaluate(`(()=>({workspaces:document.querySelectorAll('[data-card-workspace]').length,personal:Boolean(document.querySelector('[data-card-workspace="personal"]')),department:Boolean(document.querySelector('[data-card-workspace="department"]'))}))()`);
    assert.ok(cards.workspaces >= 3 && cards.personal && cards.department, 'Card Admin workspaces are incomplete');
    assert.deepStrictEqual(errors, [], `Browser errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ success: true, authentication: 'normal-production-login', groups: groups.length, tabs: tabCount, cardWorkspaces: cards.workspaces, viewports, consoleErrors: errors.length, businessDataChanged: false, temporaryRowsRemaining: 0 }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    if (chrome && !chrome.killed) chrome.kill();
    await sleep(300);
    fs.rmSync(profileDir, { recursive: true, force: true });
});
