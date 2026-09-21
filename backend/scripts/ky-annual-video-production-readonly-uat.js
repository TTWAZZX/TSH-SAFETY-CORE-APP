'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const expectDeployed = process.env.KY_ANNUAL_EXPECT_DEPLOYED === '1';
const snapshotDir = String(process.env.KY_ANNUAL_SNAPSHOT_DIR || '').trim();
const downloadVideos = process.env.KY_ANNUAL_DOWNLOAD_VIDEOS === '1';
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.KY_ANNUAL_PROD_CDP_PORT || 9853);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-ky-annual-production-'));
const consoleErrors = [];
const mutationRequests = [];
const pending = new Map();
let commandId = 1;
let chrome;
let socket;
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function jsonRequest(route, options = {}) {
    const response = await fetch(`${baseUrl}/api${route}`, options);
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch (_) { body = null; }
    return { response, body, text };
}

async function login() {
    const result = await jsonRequest('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    assert.strictEqual(result.response.status, 200, `Production login failed: ${result.text.slice(0, 200)}`);
    assert.ok(result.body?.token && result.body?.user, 'Production login returned no session');
    return result.body;
}

async function getJson(route, token, expected = 200) {
    const result = await jsonRequest(route, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    assert.strictEqual(result.response.status, expected, `GET ${route}: ${result.response.status} ${result.text.slice(0, 180)}`);
    return result.body;
}

function safeName(value) {
    return String(value || '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 180) || 'video.bin';
}

async function saveSnapshot(rows, stats, annual, token) {
    if (!snapshotDir) return null;
    fs.mkdirSync(snapshotDir, { recursive: true });
    const videoRows = rows.filter(row => String(row.VideoUrl || '').trim());
    const manifest = {
        capturedAt: new Date().toISOString(),
        productionTarget: baseUrl,
        readOnly: true,
        kyRows: rows.length,
        kyRowsWithVideo: videoRows.length,
        stats,
        annual,
        videos: [],
    };
    fs.writeFileSync(path.join(snapshotDir, 'ky-rows-before.json'), JSON.stringify(rows, null, 2));
    for (let index = 0; index < videoRows.length; index += 1) {
        const row = videoRows[index];
        const rawUrl = String(row.VideoUrl);
        const url = new URL(rawUrl, `${baseUrl}/`);
        const original = url.searchParams.get('filename') || path.posix.basename(url.pathname);
        const item = { activityId: row.id, activityDate: row.ActivityDate, department: row.Department, safetyUnit: row.SafetyUnit, url: rawUrl, originalFileName: original };
        if (downloadVideos) {
            const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            assert.strictEqual(response.status, 200, `Video backup failed ${row.id}: HTTP ${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            const fileName = `${String(index + 1).padStart(3, '0')}-${safeName(row.id)}-${safeName(original)}`;
            const relativePath = path.join('ky-videos', fileName);
            fs.mkdirSync(path.join(snapshotDir, 'ky-videos'), { recursive: true });
            fs.writeFileSync(path.join(snapshotDir, relativePath), bytes);
            item.backupPath = relativePath.replace(/\\/g, '/');
            item.bytes = bytes.length;
            item.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
            process.stdout.write(`Backed up KY video ${index + 1}/${videoRows.length}: ${bytes.length} bytes\n`);
        }
        manifest.videos.push(item);
    }
    fs.writeFileSync(path.join(snapshotDir, 'predeploy-snapshot.json'), JSON.stringify(manifest, null, 2));
    return manifest;
}

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

async function waitFor(expression, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Timed out: ${expression}`);
}

async function connectChrome() {
    chrome = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run',
        '--remote-allow-origins=*', '--window-size=1440,1000', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(row => row.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome target unavailable');
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
            if (String(request.url || '').includes('/api/ky') && !['GET', 'OPTIONS'].includes(String(request.method || '').toUpperCase())) mutationRequests.push(`${request.method} ${request.url}`);
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

async function browserReadOnly(session, expectedKpi) {
    if (!expectDeployed) return null;
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    await connectChrome();
    await command('Page.navigate', { url: `${baseUrl}/index.html?ky_annual_readonly=${Date.now()}` });
    await waitFor(`document.readyState==='complete'`);
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(session.token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(session.user))});location.hash='#ky';location.reload();return true;})()`);
    await waitFor(`document.querySelector('#ky-tab-btn-dashboard') && document.querySelector('#ky-kpi-row [data-ky-kpi-filter="all"] .text-2xl')`);
    const rendered = await evaluate(`[...document.querySelectorAll('#ky-kpi-row [data-ky-kpi-filter]')].reduce((out,el)=>{const key=el.dataset.kyKpiFilter;if(!(key in out))out[key]=Number(el.querySelector('.text-2xl')?.textContent.trim()||0);return out;},{})`);
    assert.strictEqual(rendered.all, Number(expectedKpi.total || 0), 'Production dashboard total changed');
    await evaluate(`document.querySelector('#ky-tab-btn-manage').click()`);
    await waitFor(`document.querySelector('#ky-msub-annual-video')`);
    await evaluate(`document.querySelector('#ky-msub-annual-video').click()`);
    await waitFor(`document.querySelector('[data-ky-annual-delete-selected]') && document.querySelector('#ky-manage-panel')?.textContent.includes('Annual Compliance Dashboard')`);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 390, height: 844 }]) {
        await command('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 });
        await sleep(300);
        const layout = await evaluate(`(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,annual:Boolean(document.querySelector('[data-ky-annual-delete-selected]'))}))()`);
        assert.ok(layout.annual, `Annual workspace missing at ${viewport.width}px`);
        assert.ok(layout.scroll <= layout.client + 24, `Annual workspace overflow at ${viewport.width}px`);
    }
    assert.deepStrictEqual(mutationRequests, [], `Production Browser UAT sent KY mutations: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Production Browser console errors: ${consoleErrors.join(' | ')}`);
    return { viewports: 3, mutationRequests: 0, consoleErrors: 0 };
}

(async () => {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    const session = await login();
    const year = new Date().getFullYear();
    const rowsPayload = await getJson('/ky', session.token);
    const statsPayload = await getJson(`/ky/stats?year=${year}`, session.token);
    const rows = rowsPayload?.data || [];
    const stats = statsPayload?.data || statsPayload || {};
    let annual = null;
    if (expectDeployed) annual = (await getJson(`/ky/annual-video-evidence?year=${year}`, session.token))?.data || null;
    const manifest = await saveSnapshot(rows, stats, annual, session.token);
    const browser = await browserReadOnly(session, stats.kpi || {});
    const afterRows = (await getJson('/ky', session.token))?.data || [];
    const afterStats = (await getJson(`/ky/stats?year=${year}`, session.token))?.data || {};
    assert.deepStrictEqual(afterRows.map(row => [row.id, row.VideoUrl, row.Status]), rows.map(row => [row.id, row.VideoUrl, row.Status]), 'Read-only UAT changed KY rows');
    assert.deepStrictEqual(afterStats.kpi || {}, stats.kpi || {}, 'Read-only UAT changed KY KPI');
    console.log(JSON.stringify({ success: true, readOnly: true, kyRows: rows.length, kyRowsWithVideo: rows.filter(row => String(row.VideoUrl || '').trim()).length, annualEnabled: expectDeployed, annualSummary: annual?.summary || null, browser, snapshot: manifest ? snapshotDir : null, videoBackupFiles: manifest?.videos.filter(item => item.backupPath).length || 0, businessDataChanged: false, realVideoDeleted: false }, null, 2));
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    if (chrome && !chrome.killed) chrome.kill();
    await sleep(300);
    fs.rmSync(profileDir, { recursive: true, force: true });
});
