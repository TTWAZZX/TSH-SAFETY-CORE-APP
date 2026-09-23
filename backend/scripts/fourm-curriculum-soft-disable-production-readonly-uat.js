'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const chromePath = process.env.FOURM_BROWSER_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-fourm-production-readonly-'));
const port = 9785;
const pending = new Map();
const errors = [];
const failedResponses = [];
const mutations = [];
let sequence = 1;
let chrome;
let socket;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(method, params = {}, timeout = 60000) {
    const id = sequence++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}

async function waitFor(expression, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function login() {
    assert.ok(process.env.PROD_UAT_ADMIN_ID && process.env.PROD_UAT_ADMIN_PASSWORD, 'Production Admin UAT credentials are required');
    const response = await fetch(`${base}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: process.env.PROD_UAT_ADMIN_ID, password: process.env.PROD_UAT_ADMIN_PASSWORD }),
    });
    const body = await response.json();
    assert.strictEqual(response.status, 200, JSON.stringify(body).slice(0, 300));
    assert.ok(body.token && body.user, 'Production login token/user missing');
    return body;
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--remote-allow-origins=*', `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json`);
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
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            if (String(request.url || '').includes('/api/fourm') && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase())) mutations.push(`${request.method} ${request.url}`);
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/')) failedResponses.push(`${response.status} ${response.url}`);
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
}

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required');
    const session = await login();
    await connectChrome();
    await command('Page.navigate', { url: `${base}/?fourm_soft_disable_production=1e938de#fourm` });
    await waitFor("document.readyState==='complete'");
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(session.token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(session.user))});location.hash='#fourm';location.reload();return true;})()`);
    await waitFor("document.querySelector('#fourm-tab-btn-man')");
    await evaluate("document.querySelector('#fourm-tab-btn-man').click()");
    await waitFor("document.querySelector('[data-man-subtab=\"matrix\"]')");
    await evaluate("document.querySelector('[data-man-subtab=\"matrix\"]').click()");
    await waitFor("document.querySelector('#btn-tm-toggle-inactive')");
    await evaluate("document.querySelector('#btn-tm-toggle-inactive').click()");
    await waitFor("document.querySelectorAll('.tm-curriculum-item').length>0 && document.body.innerText.includes('Disabled')");

    const results = [];
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(400);
        results.push(await evaluate(`(() => ({
            width:${width}, height:${height},
            cards:document.querySelectorAll('.tm-curriculum-item').length,
            disabled:[...document.querySelectorAll('.tm-curriculum-item')].filter(x=>x.innerText.includes('Disabled')).length,
            reactivate:document.querySelectorAll('.btn-tm-reactivate-curriculum').length,
            overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+3
        }))()`));
    }
    for (const row of results) {
        assert.ok(row.cards > 0, `${row.width}: curriculum cards missing`);
        assert.ok(row.disabled > 0, `${row.width}: disabled curricula missing`);
        assert.ok(row.reactivate > 0, `${row.width}: Reactivate controls missing`);
        assert.strictEqual(row.overflow, false, `${row.width}: horizontal overflow`);
    }
    assert.deepStrictEqual(mutations, [], `Production Browser UAT must remain read-only: ${mutations.join(' | ')}`);
    assert.deepStrictEqual(failedResponses, [], `Production failed API responses: ${failedResponses.join(' | ')}`);
    assert.deepStrictEqual(errors, [], `Production console errors: ${errors.join(' | ')}`);
    console.log(`4M curriculum soft-disable Production Browser UAT: PASS (${results.map(row => `${row.width}x${row.height}`).join(', ')}, disabled ${results[0].disabled}, read-only, zero console errors)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    await fs.promises.rm(profile, { recursive: true, force: true }).catch(() => {});
});
