'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const browserPath = process.env.PROD_UAT_BROWSER || process.env.SAFETY360_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = Number(process.env.SAFETY360_PROD_CDP_PORT || 9872);
const employeeId = String(process.env.SAFETY360_UAT_EMPLOYEE_ID || '002390');
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-safety360-production-edge-'));
const pending = new Map();
const consoleErrors = [];
const failedResponses = [];
const mutationRequests = [];
let commandId = 1;
let socket;
let browser;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
async function waitFor(expression, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) { if (await evaluate(expression)) return; await sleep(300); }
    throw new Error(`Timed out: ${expression}; console=${consoleErrors.join(' | ')}`);
}
async function login() {
    const response = await fetch(`${base}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    assert.strictEqual(response.status, 200, `Production login failed: ${text.slice(0, 500)}`);
    const payload = JSON.parse(text);
    assert.ok(payload.token && payload.user, 'Production session missing');
    return payload;
}
async function connectBrowser() {
    assert.ok(fs.existsSync(browserPath), `Browser unavailable: ${browserPath}`);
    browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--ignore-certificate-errors', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--remote-allow-origins=*', '--window-size=1440,1000', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let i = 0; i < 80; i += 1) { try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {} await sleep(250); }
    const page = targets?.find(item => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Edge CDP target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data; if (raw && typeof raw.text === 'function') raw = await raw.text(); if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            const method = String(request.method || '').toUpperCase();
            const allowedSessionRead = method === 'POST' && /\/api\/session\/verify(?:\?|$)/.test(request.url || '');
            if (!allowedSessionRead && !['GET', 'OPTIONS'].includes(method) && request.url?.includes('/api/')) mutationRequests.push(`${method} ${request.url}`);
        }
        if (message.method === 'Network.responseReceived') { const response = message.params?.response || {}; if (Number(response.status) >= 400 && response.url?.includes('/api/')) failedResponses.push(`${response.status} ${response.url}`); }
        const current = pending.get(message.id); if (!current) return; pending.delete(message.id); clearTimeout(current.timer); message.error ? current.reject(new Error(message.error.message)) : current.resolve(message.result);
    });
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Network.setCacheDisabled', { cacheDisabled: true });
}
async function inspect(width, height, mobile) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await sleep(500);
    return evaluate(`(()=>{const label=[...document.querySelectorAll('#person-profile p')].find(node=>node.textContent.trim()==='CCCF Form A Worker');const card=label?.closest('.bg-white.p-4');return{targetText:card?.innerText||'',profile:Boolean(document.querySelector('#person-profile h2')?.textContent.includes('อรอุมา นามลี')),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,targetOverflow:card?card.scrollWidth>card.clientWidth+2:null,warning:Boolean(document.querySelector('[data-retry-profile]')),cacheResources:performance.getEntriesByType('resource').map(item=>item.name).filter(name=>name.includes('20261005-safety360-data-integrity-r1'))};})()`);
}

(async () => {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    const session = await login();
    await connectBrowser();
    const navigation = await command('Page.navigate', { url: `${base}/index.html?safety360_postdeploy=${Date.now()}` });
    await sleep(5000);
    const navigationState = await evaluate(`({href:location.href,hostname:location.hostname,ready:document.readyState,title:document.title,body:(document.body?.innerText||'').slice(0,160)})`);
    assert.strictEqual(navigationState.hostname, 'dev.tshpcl.com', `Production navigation failed: ${JSON.stringify({ navigation, navigationState })}`);
    await waitFor(`document.readyState==='complete'`, 45000);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(session.token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(session.user))});location.hash='#search';location.reload();return true;})()`);
    await waitFor(`document.querySelector('#people-search-input') && document.querySelector('#person-profile')`);
    await evaluate(`(()=>{const input=document.querySelector('#people-search-input');input.value=${JSON.stringify(employeeId)};input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await waitFor(`document.querySelector('[data-person-id=${JSON.stringify(employeeId)}]')`);
    await evaluate(`document.querySelector('[data-person-id=${JSON.stringify(employeeId)}]').click()`);
    await waitFor(`document.querySelector('#person-profile h2')?.textContent.includes('อรอุมา นามลี')`);
    await evaluate(`document.querySelector('[data-profile-tab="targets"]').click()`);
    await waitFor(`[...document.querySelectorAll('#person-profile p')].some(node=>node.textContent.trim()==='CCCF Form A Worker')`);
    const desktop = await inspect(1440, 1000, false); const mobile = await inspect(390, 844, true);
    for (const [name, result] of [['desktop', desktop], ['mobile', mobile]]) {
        assert.strictEqual(result.profile, true, `${name} profile`); assert.match(result.targetText, /100%/); assert.match(result.targetText, /235\/235/); assert.match(result.targetText, /Scope KPI/);
        assert.strictEqual(result.warning, false, `${name} data warning`); assert.strictEqual(result.overflow, false, `${name} page overflow`); assert.strictEqual(result.targetOverflow, false, `${name} target overflow`);
        assert.ok(result.cacheResources.length >= 2, `${name} cache-chain resources missing`);
    }
    assert.deepStrictEqual(mutationRequests, [], `Unexpected browser mutations: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(failedResponses, [], `Failed APIs: ${failedResponses.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Console errors: ${consoleErrors.join(' | ')}`);
    console.log('PASS Safety 360 Production Edge UAT: 002390 CCCF Worker 235/235=100%, complete data, desktop/mobile no overflow, zero business mutations/errors');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { try { socket?.close(); } catch (_) {} try { browser?.kill(); } catch (_) {} await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {}); });
