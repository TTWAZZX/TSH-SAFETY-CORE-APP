'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });

const appUrl = process.env.BBS_PHASE10C2_APP_URL || 'http://localhost/tsh-safety-core/index.html';
const apiUrl = String(process.env.BBS_PHASE10C2_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const chromePath = process.env.BBS_PHASE10C2_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.BBS_PHASE10C2_CDP_PORT || 9842);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs10c2-browser-'));
const browserErrors = [];
let chrome;
let socket;
let db;
let commandId = 1;
const pending = new Map();
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
    const result = await command('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
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

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run',
        '--remote-allow-origins=*', '--window-size=390,844', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio:['ignore','ignore','ignore'], windowsHide:true });
    let targets;
    for (let index = 0; index < 60; index++) {
        try { const response = await fetch(`http://localhost:${port}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {}
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
        if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') browserErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        clearTimeout(item.timer);
        message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chrome CDP connection timeout')), 15000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true });
        socket.addEventListener('error', reject, { once:true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
    await command('Page.addScriptToEvaluateOnNewDocument', { source:`window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};` });
}

const pageAuditExpression = `(()=>{
    const visible=element=>element.getClientRects().length>0;
    const controls=[...document.querySelectorAll('#bbs-smart-card-page button,#bbs-smart-card-page a[href],#bbs-smart-card-page summary')].filter(visible);
    const small=controls.filter(element=>element.getBoundingClientRect().height<43.5).map(element=>element.textContent.trim().slice(0,40));
    const textFields=[...document.querySelectorAll('#bbs-smart-card-page input:not([type=checkbox]):not([type=radio]):not([type=file]),#bbs-smart-card-page select,#bbs-smart-card-page textarea')].filter(visible);
    const zoomRisk=textFields.filter(element=>parseFloat(getComputedStyle(element).fontSize)<16).map(element=>element.name||element.id||element.placeholder||element.tagName);
    const tabs=[...document.querySelectorAll('[data-bbs-tab]')];
    const panel=document.getElementById('bbs-smart-card-body');
    const tables=[...document.querySelectorAll('#bbs-smart-card-page table')];
    const badTables=tables.filter(table=>{const region=table.closest('[role=region]');return !region||region.tabIndex!==0||!region.getAttribute('aria-label')||[...table.querySelectorAll('th')].some(th=>th.getAttribute('scope')!=='col');}).length;
    return{overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,tabs:tabs.length,tabRoles:tabs.every(tab=>tab.getAttribute('role')==='tab'),selected:tabs.filter(tab=>tab.getAttribute('aria-selected')==='true').length,tabStop:tabs.filter(tab=>tab.tabIndex===0).length,panelRole:panel?.getAttribute('role'),panelLabel:panel?.getAttribute('aria-labelledby'),small,zoomRisk,badTables};
})()`;

(async () => {
    assert.ok(fs.existsSync(chromePath), 'Chrome is required');
    db = await mysql.createConnection({ host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASS, database:process.env.DB_NAME, port:Number(process.env.DB_PORT || 3306) });
    const [[admin]] = await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin'", [process.env.PROD_UAT_ADMIN_ID]);
    assert.ok(admin, 'Admin browser fixture unavailable');
    const token = jwt.sign({ id:admin.EmployeeID, name:admin.EmployeeName, role:admin.Role, department:admin.Department, unit:admin.Unit, position:admin.Position }, process.env.JWT_SECRET, { expiresIn:'30m' });
    const user = { id:admin.EmployeeID, EmployeeID:admin.EmployeeID, name:admin.EmployeeName, EmployeeName:admin.EmployeeName, role:admin.Role, Role:admin.Role, department:admin.Department, Department:admin.Department, unit:admin.Unit, Unit:admin.Unit, position:admin.Position, Position:admin.Position };
    const contextResponse = await fetch(`${apiUrl}/api/bbs/me/context`, { headers:{ Authorization:`Bearer ${token}` } });
    assert.strictEqual(contextResponse.status, 200, 'BBS context must be readable by Admin');
    await connectChrome();
    await command('Page.navigate', { url:appUrl });
    await waitFor(`document.readyState==='complete'`);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`document.querySelector('[data-bbs-shell]')`);

    const initial = await evaluate(pageAuditExpression);
    assert.ok(initial.tabs >= 6, `Expected BBS tabs, got ${initial.tabs}`);
    assert.strictEqual(initial.tabRoles, true);
    assert.strictEqual(initial.selected, 1);
    assert.strictEqual(initial.tabStop, 1);
    assert.strictEqual(initial.panelRole, 'tabpanel');
    assert.strictEqual(initial.overflow, false);
    assert.deepStrictEqual(initial.small, [], `Small mobile targets: ${initial.small.join(', ')}`);
    assert.deepStrictEqual(initial.zoomRisk, [], `iOS zoom-risk fields: ${initial.zoomRisk.join(', ')}`);
    assert.strictEqual(initial.badTables, 0);

    const firstTab = await evaluate(`document.querySelector('[data-bbs-tab][aria-selected="true"]').dataset.bbsTab`);
    await evaluate(`(()=>{const tab=document.querySelector('[data-bbs-tab][aria-selected="true"]');tab.focus();tab.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return true;})()`);
    await waitFor(`document.querySelector('[data-bbs-tab][aria-selected="true"]')?.dataset.bbsTab!==${JSON.stringify(firstTab)}`);
    assert.strictEqual(await evaluate(`document.activeElement?.getAttribute('aria-selected')`), 'true', 'Arrow navigation must retain focus on the active tab');

    const tabs = await evaluate(`[...document.querySelectorAll('[data-bbs-tab]')].map(tab=>tab.dataset.bbsTab)`);
    for (const tab of tabs) {
        await evaluate(`document.querySelector('[data-bbs-tab=${JSON.stringify(tab)}]').click()`);
        await waitFor(`document.querySelector('[data-bbs-tab=${JSON.stringify(tab)}]')?.getAttribute('aria-selected')==='true'`);
        const audit = await evaluate(pageAuditExpression);
        assert.strictEqual(audit.overflow, false, `${tab} overflow`);
        assert.strictEqual(audit.selected, 1, `${tab} selected-tab count`);
        assert.strictEqual(audit.tabStop, 1, `${tab} tab-stop count`);
        assert.strictEqual(audit.panelRole, 'tabpanel', `${tab} panel semantics`);
        assert.deepStrictEqual(audit.small, [], `${tab} small touch targets: ${audit.small.join(', ')}`);
        assert.deepStrictEqual(audit.zoomRisk, [], `${tab} iOS zoom-risk fields: ${audit.zoomRisk.join(', ')}`);
        assert.strictEqual(audit.badTables, 0, `${tab} inaccessible table regions`);
    }

    for (const viewport of [{width:320,height:568},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:844,height:390}]) {
        await command('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor:1, mobile:true });
        await sleep(250);
        const audit = await evaluate(pageAuditExpression);
        assert.strictEqual(audit.overflow, false, `${viewport.width}x${viewport.height} overflow`);
        assert.deepStrictEqual(audit.small, [], `${viewport.width}x${viewport.height} small touch targets: ${audit.small.join(', ')}`);
        assert.deepStrictEqual(audit.zoomRisk, [], `${viewport.width}x${viewport.height} iOS zoom-risk fields: ${audit.zoomRisk.join(', ')}`);
    }
    await command('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });

    if (process.env.BBS_PHASE10C3_TEST_RECOVERY === '1' && tabs.includes('analytics')) {
        await evaluate(`(()=>{window.__bbsPhase10c3Fetch=window.fetch.bind(window);window.__bbsPhase10c3Failed=false;window.fetch=async(...args)=>{const url=String(args[0]||'');if(!window.__bbsPhase10c3Failed&&url.includes('/bbs/analytics?')){window.__bbsPhase10c3Failed=true;throw new TypeError('Phase 10C-3 simulated temporary connection failure');}return window.__bbsPhase10c3Fetch(...args);};return true;})()`);
        await evaluate(`document.querySelector('[data-bbs-tab="workspace"]').click()`);
        await waitFor(`document.querySelector('[data-bbs-tab="workspace"][aria-selected="true"]')`);
        await evaluate(`document.querySelector('[data-bbs-tab="analytics"]').click()`);
        await waitFor(`document.querySelector('[data-bbs-retry="analytics"]')`);
        assert.strictEqual(await evaluate(`document.querySelector('[data-bbs-retry="analytics"]')?.closest('[role="alert"]')!==null`), true, 'Analytics failure must render an actionable alert');
        await evaluate(`document.querySelector('[data-bbs-retry="analytics"]').click()`);
        await waitFor(`!document.querySelector('[data-bbs-retry="analytics"]')`);
        assert.strictEqual(await evaluate(`Boolean(document.querySelector('[data-bbs-tab="analytics"][aria-selected="true"]'))`), true, 'Retry must keep the user in the current workspace');
        await evaluate(`(()=>{window.fetch=window.__bbsPhase10c3Fetch;delete window.__bbsPhase10c3Fetch;return true;})()`);
    }

    await evaluate(`document.querySelector('[data-bbs-tab="history"]').click()`);
    await waitFor(`document.querySelector('[data-bbs-tab="history"][aria-selected="true"]')`);
    const hasDetail = await evaluate(`Boolean(document.querySelector('[data-bbs-detail]'))`);
    if (hasDetail) {
        await evaluate(`document.querySelector('[data-bbs-detail]').focus();document.querySelector('[data-bbs-detail]').click()`);
        await waitFor(`document.querySelector('[role="dialog"][aria-modal="true"]')`);
        assert.strictEqual(await evaluate(`document.body.dataset.mobileOverlayActive`), '1');
        await evaluate(`document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
        await waitFor(`!document.querySelector('[role="dialog"]')`);
        assert.strictEqual(await evaluate(`document.body.dataset.mobileOverlayActive||'0'`), '0');
        assert.strictEqual(await evaluate(`document.activeElement?.hasAttribute('data-bbs-detail')`), true, 'Dialog must restore trigger focus');
    }

    const unexpectedBrowserErrors = process.env.BBS_PHASE10C3_TEST_RECOVERY === '1'
        ? browserErrors.filter(message => !message.includes('Phase 10C-3 simulated temporary connection failure'))
        : browserErrors;
    assert.deepStrictEqual(unexpectedBrowserErrors, [], `Browser console errors: ${unexpectedBrowserErrors.join(' | ')}`);
    console.log(`BBS Phase 10C-2 authenticated phone semantics/touch/focus/dialog UAT: PASS (${tabs.length} tabs; 5 viewports; dialog ${hasDetail?'tested':'not available'})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { chrome?.kill(); } catch (_) {}
    if (db) await db.end();
    await fs.promises.rm(profile, { recursive:true, force:true }).catch(() => {});
});
