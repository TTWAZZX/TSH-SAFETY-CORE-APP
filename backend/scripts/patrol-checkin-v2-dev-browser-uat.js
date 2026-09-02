'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const appBase = String(process.env.PATROL_DEV_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const helperToken = String(process.env.PATROL_DEPLOY_HELPER_TOKEN || '');
const chromePath = process.env.PATROL_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const marker = `PV2D${Date.now()}`;
const cdpPort = 9970 + Math.floor(Math.random() * 20);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-patrol-v2-dev-browser-'));
const errors = [];
let fixture, chrome, cdp;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
    constructor(url) { this.id = 1; this.pending = new Map(); this.socket = new WebSocket(url); }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Chrome CDP connection timeout')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true });
            this.socket.addEventListener('error', reject, { once:true });
        });
    }
    command(method, params = {}, timeout = 60000) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { try { this.socket.close(); } catch {} }
}

async function evaluate(expression) {
    const result = await cdp.command('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(250);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function helper(action, query = {}) {
    const params = new URLSearchParams({ action, ...query });
    const response = await fetch(`${appBase}/__codex_patrol_v2_deploy.php?${params}`, {
        method: 'POST', headers: { 'X-Deploy-Token': helperToken, 'Content-Type':'application/x-www-form-urlencoded' }, body: 'x=1',
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, `${action}: HTTP ${response.status}`);
    assert.strictEqual(json.success, true, `${action}: ${JSON.stringify(json)}`);
    return json.data;
}

(async () => {
    assert.ok(helperToken.length >= 32, 'PATROL_DEPLOY_HELPER_TOKEN is required.');
    assert.ok(fs.existsSync(chromePath), 'Chrome is required.');
    fixture = await helper('fixture-create', { marker });
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run',
        '--remote-allow-origins=*', '--window-size=390,844', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio:['ignore','ignore','ignore'], windowsHide:true });
    let targets;
    for (let i = 0; i < 60; i++) {
        try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch {}
        await sleep(250);
    }
    const page = targets?.find(item => item.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target unavailable.');
    cdp = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await cdp.connect();
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
    await cdp.command('Page.navigate', { url:`${appBase}/index.html?patrol_v2_uat=${Date.now()}` });
    await waitFor("document.readyState==='complete'");
    const payload = { id:fixture.userId, EmployeeID:fixture.userId, name:`${marker} User`, EmployeeName:`${marker} User`, role:'User', Role:'User', department:'', Department:'', unit:'', Unit:'', position:'Manager', Position:'Manager' };
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(fixture.userToken)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(payload))});location.hash='#patrol';location.reload();return true;})()`);
    await waitFor("location.hash==='#patrol' && typeof window.openCheckInModal==='function'");
    await waitFor("document.querySelector('[onclick*=\"openCheckInModal\"]') || document.body.innerText.includes('เช็คอิน')");
    await evaluate('window.openCheckInModal()');
    await waitFor("document.querySelector('#checkin-form')");
    const initial = await evaluate(`(()=>({
        modes:[...document.querySelectorAll('#checkin-form input[name="CheckinMode"]')].map(x=>x.value),
        todayOptions:document.querySelectorAll('#checkin-today-select option').length,
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
        resources:performance.getEntriesByType('resource').map(x=>x.name),
    }))()`);
    assert.deepStrictEqual(initial.modes, ['scheduled','makeup','extra']);
    assert.strictEqual(initial.todayOptions, 3, 'All same-day rounds must be selectable.');
    assert.strictEqual(initial.overflow, false, 'Patrol page must not overflow at 390 px.');
    assert.ok(initial.resources.some(url => url.includes('main.js?v=20260902-patrol-checkin-v2-r1')), 'New main cache key was not loaded.');
    assert.ok(initial.resources.some(url => url.includes('api.js?v=20260902-patrol-checkin-v2-r1')), 'New API cache key was not loaded.');
    assert.ok(initial.resources.some(url => url.includes('patrol.js?v=20260902-patrol-checkin-v2-r1')), 'New Patrol cache key was not loaded.');
    await evaluate(`document.querySelector('#checkin-form input[value="makeup"]').click()`);
    await waitFor("document.querySelector('#checkin-missed-select:not(.hidden)')?.options.length>1");
    assert.strictEqual(await evaluate(`[...document.querySelectorAll('#checkin-missed-select option')].some(x=>x.value===${JSON.stringify(marker + '_PY')})`), true, 'Prior-year Makeup option is missing.');
    await evaluate(`document.querySelector('#checkin-form input[value="extra"]').click()`);
    assert.strictEqual(await evaluate("document.querySelector('#checkin-date-row').classList.contains('hidden')"), true);
    assert.deepStrictEqual(errors, [], `Browser console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ success:true, marker, viewport:'390x844', sameDayRounds:initial.todayOptions, consoleErrors:errors.length, horizontalOverflow:false }, null, 2));
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { cdp?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    if (fixture) {
        try {
            const residue = await helper('fixture-cleanup', { marker });
            const total = Object.values(residue).reduce((sum, value) => sum + Number(value || 0), 0);
            console.log(JSON.stringify({ cleanup:residue, total }, null, 2));
            if (total !== 0) process.exitCode = 1;
        } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
    }
    await fs.promises.rm(profile, { recursive:true, force:true }).catch(() => {});
});
