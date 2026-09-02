'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const appUrl = process.env.BBS_PHASE1_APP_URL || 'http://127.0.0.1:5500/index.html';
const apiUrl = String(process.env.BBS_PHASE1_API_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
const chromePath = process.env.BBS_PHASE1_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.BBS_PHASE1_CDP_PORT || 9831);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs-phase1-browser-'));
const errors = [];
let chrome;
let cdp;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
    constructor(url) {
        this.id = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (message.method === 'Runtime.exceptionThrown') errors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') errors.push((message.params.args || []).map(arg => arg.value || arg.description || '').join(' '));
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Chrome CDP connection timed out.')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
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
    close() { try { this.socket.close(); } catch (_) {} }
}

async function evaluate(expression) {
    const result = await cdp.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
}

async function main() {
    assert.ok(fs.existsSync(chromePath), 'Chrome executable is required.');
    const login = await fetch(`${apiUrl}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: process.env.PROD_UAT_ADMIN_ID, password: process.env.PROD_UAT_ADMIN_PASSWORD }),
    });
    const session = await login.json();
    assert.strictEqual(login.status, 200, JSON.stringify(session));

    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions',
        '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*', '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome page target unavailable.');
    cdp = new Cdp(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    await cdp.connect();
    console.log('INFO Chrome CDP connected');
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    await cdp.command('Page.addScriptToEvaluateOnNewDocument', { source: `window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};` });
    await cdp.command('Page.navigate', { url: appUrl });
    console.log('INFO Application navigation requested');
    await sleep(5000);
    await waitFor(`document.readyState === 'complete'`);
    console.log('INFO Application shell loaded');
    await evaluate(`(() => { localStorage.setItem('tsh_token', ${JSON.stringify(session.token)}); localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(session.user))}); location.hash='#admin'; location.reload(); return true; })()`);
    await sleep(6000);
    console.log('INFO Route state', await evaluate(`JSON.stringify({href:location.href,hash:location.hash,ready:document.readyState,adminPage:Boolean(document.querySelector('#admin-page')),adminTab:typeof window._adminTab,body:(document.body?.innerText||'').slice(0,160)})`));
    await waitFor(`typeof window._adminTab === 'function' && document.querySelector('#tab-btn-bbs-foundation')`);
    console.log('INFO Admin console ready');
    await evaluate(`window._adminTab('bbs-foundation')`);
    await waitFor(`document.querySelector('#admin-content-area')?.innerText?.includes('ความพร้อมและการตั้งค่าระบบ BBS')`);
    console.log('INFO BBS Foundation rendered');
    const state = await evaluate(`(() => ({
        tabExists: Boolean(document.querySelector('#tab-btn-bbs-foundation')),
        tabActive: document.querySelector('#tab-btn-bbs-foundation')?.classList.contains('is-active'),
        positionRows: document.querySelectorAll('[id^="bbs-map-level-"]').length,
        mappingSummary: /BBS Level Mapping/i.test(document.querySelector('#admin-content-area')?.innerText || ''),
        kpiText: document.querySelector('#admin-content-area')?.innerText?.includes('ปัจจุบัน:'),
        pilotDept: document.querySelector('#bbs-pilot-dept')?.selectedOptions?.[0]?.textContent?.trim(),
        pilotUnit: document.querySelector('#bbs-pilot-unit')?.selectedOptions?.[0]?.textContent?.trim(),
        mainBbsMenuVisible: [...document.querySelectorAll('a,button')].some(el => /BBS Smart Card/i.test(el.textContent || '') && !el.closest('#admin-content-area') && !el.closest('.admin-console-tabs')),
        bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        checklistBuilder: document.querySelector('#admin-content-area')?.innerText?.includes('Checklist Builder'),
        phaseBadge: /Phase\s*\d/i.test(document.querySelector('#tab-btn-bbs-foundation')?.innerText || ''),
        phase2bExchange: typeof window._bbsExportChecklist === 'function' && typeof window._bbsOpenImportChecklist === 'function' && typeof window._bbsPreviewImportFile === 'function',
        guidedTeam: document.querySelector('#admin-content-area')?.innerText?.includes('จัดผู้ตรวจและทีม'),
        legacyAssignmentCreate: document.querySelector('#admin-content-area')?.innerText?.includes('+ เพิ่ม Assignment'),
        checklistSearch: Boolean(document.querySelector('[oninput*="checklistQuery"]')),
    }))()`);
    assert.strictEqual(state.tabExists, true);
    assert.strictEqual(state.tabActive, true);
    assert.strictEqual(state.positionRows, 23);
    assert.strictEqual(state.mappingSummary, true);
    assert.strictEqual(state.kpiText, true);
    assert.ok(state.pilotDept, 'Master Department picker must have at least one option.');
    assert.ok(state.pilotUnit, 'Safety Unit picker must have at least one option for the selected Department.');
    assert.strictEqual(state.mainBbsMenuVisible, true, 'Main BBS module must be visible after Phase 3 opens the Pilot/Admin workspace.');
    assert.strictEqual(state.bodyOverflow, false, 'BBS Foundation page-level overflow detected.');
    assert.strictEqual(state.checklistBuilder, true, 'Phase 2 Checklist Builder is missing.');
    assert.strictEqual(state.phaseBadge, false, 'Development Phase labels must not appear in the BBS Foundation tab.');
    assert.strictEqual(state.phase2bExchange, true, 'Phase 2B Excel exchange actions are not wired.');
    assert.strictEqual(state.guidedTeam, true, 'Canonical Inspector/Team guidance is missing.');
    assert.strictEqual(state.legacyAssignmentCreate, false, 'Legacy hierarchy mutation must not be exposed in System Console.');
    assert.strictEqual(state.checklistSearch, true, 'Checklist search/filter controls are missing.');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    const mobileState = await evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        guidedButtonHeight: Math.round(document.querySelector('[onclick*="team-management"]')?.getBoundingClientRect().height || 0),
        tableRegionLabelled: [...document.querySelectorAll('#admin-content-area [role="region"][tabindex="0"]')].every(el => Boolean(el.getAttribute('aria-label'))),
    }))()`);
    assert.strictEqual(mobileState.overflow, false, 'BBS Foundation caused page-level overflow at 390 px.');
    assert.ok(mobileState.guidedButtonHeight >= 44, 'Primary BBS Foundation controls must retain a 44 px touch target.');
    assert.strictEqual(mobileState.tableRegionLabelled, true, 'Scrollable BBS Foundation tables must be keyboard-focusable and labelled.');
    await cdp.command('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await evaluate(`window._bbsOpenCreateChecklist()`);
    await waitFor(`document.querySelector('#bbs-new-code') && document.querySelector('#bbs-new-name') && document.querySelector('#bbs-new-from')`);
    const createModal = await evaluate(`({code:Boolean(document.querySelector('#bbs-new-code')),name:Boolean(document.querySelector('#bbs-new-name')),date:document.querySelector('#bbs-new-from')?.value,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2})`);
    assert.strictEqual(createModal.code, true);
    assert.strictEqual(createModal.name, true);
    assert.match(createModal.date || '', /^\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(createModal.overflow, false, 'Checklist create modal caused page-level overflow.');
    await evaluate(`window.closeModal()`);
    await evaluate(`window._bbsOpenResolverPreview()`);
    await waitFor(`document.querySelector('#bbs-resolve-employee') && document.querySelector('#bbs-resolve-date') && document.querySelector('#bbs-resolve-result')`);
    assert.strictEqual(await evaluate(`document.querySelector('#bbs-resolve-result')?.innerText?.includes('Checklist')`), true, 'Resolver Preview guidance is missing.');
    await evaluate(`window.closeModal()`);
    await evaluate(`window._bbsOpenModuleWorkspace('team-management')`);
    await waitFor(`location.hash === '#bbs-smart-card' && document.querySelector('[data-bbs-tab="team-management"]')?.classList.contains('bg-white')`);
    assert.strictEqual(await evaluate(`sessionStorage.getItem('bbs_admin_workspace') === null`), true, 'BBS Admin workspace intent was not consumed.');
    assert.deepStrictEqual(errors, [], `Browser runtime errors: ${errors.join(' | ')}`);
    console.log(`BBS Phase 1-3 browser regression UAT: PASS (${state.positionRows} positions, Checklist Builder, Excel exchange, and main module visible)`);
}

main().catch(error => { console.error(error.stack || error.message || error); process.exitCode = 1; }).finally(async () => {
    cdp?.close();
    if (chrome && !chrome.killed) chrome.kill();
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
