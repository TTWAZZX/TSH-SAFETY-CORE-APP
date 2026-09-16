'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const employeeId = String(process.env.PROD_UAT_USER_ID || '').trim();
const password = String(process.env.PROD_UAT_USER_PASSWORD || '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.PATROL_PROD_UAT_CDP_PORT || 9861);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-patrol-production-smoke-'));
const consoleErrors = [];
const mutationRequests = [];
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
        body: JSON.stringify({ employeeId, password }),
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
        '--no-first-run', '--remote-allow-origins=*', '--window-size=1600,1000',
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
        if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            const method = String(request.method || '').toUpperCase();
            const isReadOnlySessionVerification = method === 'POST' && /\/api\/session\/verify(?:\?|$)/.test(String(request.url || ''));
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !isReadOnlySessionVerification) mutationRequests.push(`${method} ${request.url}`);
        }
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
    await command('Network.enable');
}

(async () => {
    assert.ok(employeeId && password, 'Production user UAT credentials are required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    const session = await login();
    await connectChrome();
    await command('Page.navigate', { url: `${baseUrl}/index.html?patrol_schedule_smoke=${Date.now()}` });
    await waitFor(`document.readyState==='complete'`);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(session.token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(session.user))});location.hash='#patrol';location.reload();return true;})()`);
    await waitFor(`Boolean(document.querySelector('[data-patrol-card-image="patrol-personal-checkin"]'))`);
    await waitFor(`typeof window.openSelfCheckinModal==='function'`);
    await sleep(1200);

    const schedulePanel = await evaluate(`(()=>{const heading=[...document.querySelectorAll('h3')].find(node=>node.textContent.includes('My Schedule'));const panel=heading?.parentElement?.nextElementSibling;return panel?{maxHeight:getComputedStyle(panel).maxHeight,overflowY:getComputedStyle(panel).overflowY,clientHeight:panel.clientHeight,scrollHeight:panel.scrollHeight,rowCount:panel.querySelectorAll('button').length}:null})()`);
    assert.ok(schedulePanel, 'My Schedule panel was not found');
    assert.strictEqual(schedulePanel.maxHeight, '315px', 'Supervisor schedule must be capped at 315px');
    assert.ok(['auto', 'scroll'].includes(schedulePanel.overflowY), 'Supervisor schedule must scroll vertically');
    assert.ok(schedulePanel.clientHeight <= 315, `Schedule panel is too tall: ${schedulePanel.clientHeight}`);

    await evaluate(`window.openSelfCheckinModal();true`);
    await waitFor(`Boolean(document.querySelector('#sc-session'))`);
    const choices = await evaluate(`(()=>{const select=document.querySelector('#sc-session');return {tag:select.tagName,groups:[...select.querySelectorAll('optgroup')].map(group=>group.label),options:[...select.options].map(option=>({value:option.value,text:option.textContent.trim(),type:option.dataset.type,date:option.dataset.date,disabled:option.disabled,selected:option.selected})),hint:select.parentElement.textContent}})()`);
    assert.strictEqual(choices.tag, 'SELECT', 'Sec. & Supervisor must receive the monthly schedule selector');
    assert.ok(choices.options.length >= 3, `Expected monthly schedule choices, got ${choices.options.length}`);
    assert.ok(choices.options.some(option => /R1(?:\D|$)/.test(option.text)), 'R1 is missing from the monthly selector');
    assert.ok(choices.options.some(option => /R2(?:\D|$)/.test(option.text)), 'R2 is missing from the monthly selector');
    assert.ok(choices.options.some(option => option.type === 'compensation'), 'Past schedule group is missing');
    assert.ok(choices.options.some(option => option.type === 'normal'), 'Today schedule group is missing');
    assert.ok(choices.options.filter(option => option.type === 'future').every(option => option.disabled), 'Future schedules must remain read-only');

    const compensation = choices.options.find(option => option.type === 'compensation');
    const changed = await evaluate(`(()=>{const select=document.querySelector('#sc-session');select.value=${JSON.stringify(choices.options.find(option => option.type === 'compensation')?.value || '')};select.dispatchEvent(new Event('change',{bubbles:true}));return {selected:select.value,type:document.querySelector('input[name="sc-type"]:checked')?.value,date:document.querySelector('#sc-date')?.value,area:document.querySelector('#sc-area-text')?.textContent.trim()}})()`);
    assert.ok(compensation?.value && changed.selected === compensation.value, 'Past R1/R2 selection did not persist');
    assert.strictEqual(changed.type, 'compensation', 'Past schedule must switch to makeup automatically');
    assert.strictEqual(changed.date, new Date().toISOString().slice(0, 10), 'Makeup actual date must be today');
    assert.ok(changed.area, 'Selected schedule area is missing');

    assert.deepStrictEqual(mutationRequests, [], `Smoke test sent mutation requests: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Browser errors: ${consoleErrors.join(' | ')}`);
    console.log(JSON.stringify({ success: true, authentication: 'production-supervisor-login', schedulePanel, selector: { groups: choices.groups, optionCount: choices.options.length, rounds: [...new Set(choices.options.map(option => (option.text.match(/R\d+/) || [])[0]).filter(Boolean))], normal: choices.options.filter(option => option.type === 'normal').length, compensation: choices.options.filter(option => option.type === 'compensation').length, future: choices.options.filter(option => option.type === 'future').length }, pastSelection: changed, consoleErrors: 0, mutationRequests: 0, businessDataChanged: false }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    if (chrome && !chrome.killed) chrome.kill();
    await sleep(300);
    fs.rmSync(profileDir, { recursive: true, force: true });
});
