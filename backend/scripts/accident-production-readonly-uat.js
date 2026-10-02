'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const browserPath = process.env.PROD_UAT_BROWSER || process.env.ACCIDENT_ANATOMY_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = Number(process.env.ACCIDENT_PROD_CDP_PORT || 9887);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-accident-production-readonly-'));
const evidenceDir = String(process.env.ACCIDENT_PROD_EVIDENCE_DIR || '').trim();
const year = Number(process.env.ACCIDENT_PROD_YEAR || new Date().getFullYear());
const errors = [];
const failedResponses = [];
const mutations = [];
const pending = new Map();
let sequence = 1;
let browser;
let socket;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function command(method, params = {}, timeout = 60000) {
    const id = sequence++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}

async function waitFor(expression, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(`Boolean(${expression})`).catch(() => false)) return;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${expression}`);
}

async function login() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    const response = await fetch(`${base}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `Production Admin login failed: ${text.slice(0, 240)}`);
    assert.ok(body?.token && body?.user, 'Production login token/user missing');
    return body;
}

async function getJson(endpoint, token) {
    const response = await fetch(`${base}/api${endpoint}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `${endpoint}: HTTP ${response.status} ${text.slice(0, 240)}`);
    assert.strictEqual(body?.success, true, `${endpoint}: unsuccessful response`);
    return body.data;
}

async function snapshot(token, expectRelease = true) {
    const [summary, analytics, reports, positions, layout] = await Promise.all([
        getJson(`/accident/summary?year=${year}`, token),
        getJson(`/accident/analytics?year=${year}`, token),
        getJson(`/accident/reports?year=${year}`, token),
        getJson('/accident/hotspot-positions', token),
        expectRelease ? getJson('/accident/hotspot-layout', token) : getJson('/accident/hotspot-layout', token).catch(() => ({ IsDefault: true, UnavailableBeforeRelease: true })),
    ]);
    assert.ok(Array.isArray(reports) && Array.isArray(analytics?.injuryTypeStats) && Array.isArray(analytics?.bodyPartStats));
    const injuryReports = reports.filter(report => report.AccidentType !== 'Near Miss');
    const firstAid = injuryReports.filter(report => report.AccidentType === 'First Aid');
    if (expectRelease && firstAid.length) {
        const labels = new Set(analytics.injuryTypeStats.map(row => String(row.label || '')));
        firstAid.filter(report => String(report.InjuryType || '').trim()).forEach(report => {
            assert.ok(labels.has(String(report.InjuryType).trim()), `First Aid Injury Type missing from analytics: ${report.InjuryType}`);
        });
    }
    return {
        year,
        summary: summary?.kpi || {},
        reports: reports.length,
        injuryReports: injuryReports.length,
        firstAid: firstAid.length,
        injuryTypes: analytics.injuryTypeStats.length,
        bodyParts: analytics.bodyPartStats.length,
        positions: Array.isArray(positions) ? positions.length : 0,
        layoutDefault: layout?.IsDefault !== false,
        reportFingerprint: hash(reports.map(report => [report.id, report.UpdatedAt, report.BodySide, report.InjuryType, report.BodyPart])),
    };
}

async function connectBrowser() {
    assert.ok(fs.existsSync(browserPath), `Browser not found: ${browserPath}`);
    browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run',
        '--remote-allow-origins=*', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`,
        '--window-size=1440,1000', 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 80; attempt++) {
        try { const response = await fetch(`http://127.0.0.1:${cdpPort}/json`); if (response.ok) { targets = await response.json(); break; } } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Production browser page target unavailable');
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
            const method = String(request.method || '').toUpperCase();
            const url = String(request.url || '');
            const readOnlyPost = method === 'POST' && /\/api\/session\/verify(?:\?|$)/.test(url);
            if (url.includes('/api/') && !['GET', 'OPTIONS'].includes(method) && !readOnlyPost) mutations.push(`${method} ${url}`);
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/')) failedResponses.push(`${response.status} ${response.url}`);
        }
        const current = pending.get(message.id);
        if (!current) return;
        pending.delete(message.id); clearTimeout(current.timer);
        message.error ? current.reject(new Error(message.error.message)) : current.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Production browser CDP connection timed out')), 15000);
        socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Runtime.enable'); await command('Page.enable'); await command('Network.enable');
}

(async () => {
    const session = await login();
    const apiOnly = String(process.env.ACCIDENT_PROD_API_ONLY || '') === '1';
    const before = await snapshot(session.token, !apiOnly);
    if (apiOnly) {
        const result = { success: true, mode: 'api-only', base, cache: 'predeploy', before };
        if (evidenceDir) { fs.mkdirSync(evidenceDir, { recursive: true }); fs.writeFileSync(path.join(evidenceDir, 'production-before-readonly.json'), `${JSON.stringify(result, null, 2)}\n`); }
        console.log(`Accident Production predeploy API read-only: PASS (${before.reports} reports, ${before.firstAid} First Aid)`);
        return;
    }
    await connectBrowser();
    await command('Page.navigate', { url: `${base}/index.html?accident_release=20261002-accident-accessibility-r3#accident` });
    await waitFor(`document.readyState === 'complete'`);
    await evaluate(`(() => { localStorage.setItem('tsh_token', ${JSON.stringify(session.token)}); localStorage.setItem('tsh_user', JSON.stringify(${JSON.stringify(session.user)})); location.hash='#accident'; location.reload(); return true; })()`);
    await waitFor(`document.querySelector('#acc-tab-btn-analytics')`);
    await evaluate(`document.querySelector('#acc-tab-btn-analytics').click()`);
    await waitFor(`document.querySelector('[data-injury-intelligence]') && document.querySelector('[data-acc-anatomy]')`, 90000);
    errors.length = 0; failedResponses.length = 0; mutations.length = 0;

    const viewports = [];
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(500);
        viewports.push(await evaluate(`(() => { const panel=document.querySelector('#acc-panel-analytics'); const visible=node=>getComputedStyle(node).display!=='none'&&node.getClientRects().length>0; const name=node=>(node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||'').trim(); const controls=[...panel.querySelectorAll('[data-injury-intelligence] button,[data-acc-anatomy] button')].filter(visible); const unnamed=controls.filter(node=>!name(node)).length; const undersized=controls.map(node=>node.getBoundingClientRect()).filter(box=>box.width<24||box.height<24).length; return {width:${width},height:${height},mode:panel.querySelector('[data-injury-intelligence]')?.dataset.injuryMode||'',filters:panel.querySelectorAll('[data-analytics-select]').length,zoom:panel.querySelectorAll('[data-anatomy-zoom]').length,layoutControl:[...panel.querySelectorAll('button')].some(button=>button.textContent.trim()==='เปลี่ยนรูป'),unnamed,undersized,overflow:panel.scrollWidth>panel.clientWidth+2}; })()`));
    }
    viewports.forEach(result => {
        assert.match(result.mode, /^(focus|pareto|empty)$/);
        assert.strictEqual(result.filters, 6); assert.strictEqual(result.zoom, 4);
        assert.strictEqual(result.layoutControl, true); assert.strictEqual(result.unnamed, 0);
        assert.strictEqual(result.undersized, 0, `${result.width}: undersized controls`);
        assert.strictEqual(result.overflow, false, `${result.width}: Analytics overflow`);
    });
    const after = await snapshot(session.token);
    assert.deepStrictEqual(after, before, 'Accident data fingerprint changed during read-only UAT');
    assert.deepStrictEqual(mutations, [], `Production browser sent mutations: ${mutations.join(' | ')}`);
    assert.deepStrictEqual(failedResponses, [], `Production API failures: ${failedResponses.join(' | ')}`);
    assert.deepStrictEqual(errors, [], `Production browser errors: ${errors.join(' | ')}`);

    const result = { success: true, base, cache: '20261002-accident-accessibility-r3', before, after, viewports, mutations, failedResponses, errors };
    if (evidenceDir) { fs.mkdirSync(evidenceDir, { recursive: true }); fs.writeFileSync(path.join(evidenceDir, 'production-readonly-uat.json'), `${JSON.stringify(result, null, 2)}\n`); }
    console.log(`Accident Production read-only UAT: PASS (${before.reports} reports, ${before.firstAid} First Aid, ${viewports.map(row => `${row.width}x${row.height}`).join(', ')}, zero writes/errors)`);
})().catch(error => {
    console.error(error.stack || error); process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
