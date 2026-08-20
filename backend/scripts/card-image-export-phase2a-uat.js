'use strict';

require('../node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const browserPath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const requestedPhase = String(process.env.CARD_IMAGE_UAT_PHASE || '2a').toLowerCase();
const uatPhase = ['2b', '2c', '2d', '2e'].includes(requestedPhase) ? requestedPhase : '2a';
const cdpPort = uatPhase === '2e' ? 9838 : uatPhase === '2d' ? 9837 : uatPhase === '2c' ? 9836 : uatPhase === '2b' ? 9835 : 9834;
const serveLocalAssets = uatPhase !== '2c';
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const artifactDir = path.join(
    root,
    'backups',
    uatPhase === '2c' ? 'production' : 'local',
    `card-image-phase${uatPhase}-comparison-${stamp}`,
);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `card-image-phase${uatPhase}-`));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const LOCAL_ASSETS = new Map([
    ['/index.html', { file: path.join(root, 'index.html'), mime: 'text/html; charset=utf-8' }],
    ['/public/js/main.js', { file: path.join(root, 'public', 'js', 'main.js'), mime: 'text/javascript; charset=utf-8' }],
    ['/public/js/pages/dashboard.js', { file: path.join(root, 'public', 'js', 'pages', 'dashboard.js'), mime: 'text/javascript; charset=utf-8' }],
    ['/public/js/pages/accident.js', { file: path.join(root, 'public', 'js', 'pages', 'accident.js'), mime: 'text/javascript; charset=utf-8' }],
    ['/public/js/utils/card-image-export.js', { file: path.join(root, 'public', 'js', 'utils', 'card-image-export.js'), mime: 'text/javascript; charset=utf-8' }],
]);

const PHASE2A_PILOTS = [
    { module: 'dashboard', hash: 'dashboard', selector: '[data-db-card-image="dashboard-hero"]', menu: 'db-card-save-menu' },
    { module: 'accident', hash: 'accident', selector: '[data-acc-card-image="accident-performance-board"]', menu: 'acc-card-save-menu' },
];

const PHASE2B_PILOTS = [
    { module: 'machine-safety', hash: 'machine-safety', selector: '[data-msd-card-image="machine-safety-document-list"]', menu: 'msd-card-save-menu' },
    { module: 'yokoten', hash: 'yokoten', selector: '[data-yok-card-image^="yokoten-topic-"]', menu: 'yok-card-save-menu' },
    { module: 'fourm', hash: 'fourm', selector: '[data-fourm-card-image="4m-change-overview"]', menu: 'fourm-card-save-menu' },
    { module: 'safety-culture', hash: 'safety-culture', selector: '[data-sc-card-image="safety-culture-campaign-library"]', menu: 'sc-card-save-menu' },
];

const PHASE2D_PILOTS = [
    {
        module: 'ojt',
        hash: 'ojt',
        selector: '[data-ojt-card-image="scw-hero"]',
        menu: 'ojt-card-save-menu',
        ready: `document.querySelectorAll('#ojt-hero-stats > *').length >= 4 && !document.querySelector('#ojt-hero-stats .animate-pulse')`,
    },
];

const PHASE2E_PILOTS = [
    {
        module: 'training',
        hash: 'training',
        selector: '[data-tr-card-image="training-hero"]',
        menu: 'tr-card-save-menu',
        ready: `document.querySelectorAll('#tr-stats-strip .tr-stat-val').length >= 4 && Array.from(document.querySelectorAll('#tr-stats-strip .tr-stat-val')).every(element => String(element.textContent || '').trim() !== '\u2014')`,
    },
];

const PILOTS = uatPhase === '2c'
    ? [...PHASE2A_PILOTS, ...PHASE2B_PILOTS]
    : uatPhase === '2e' ? PHASE2E_PILOTS
        : uatPhase === '2d' ? PHASE2D_PILOTS
        : uatPhase === '2b' ? PHASE2B_PILOTS : PHASE2A_PILOTS;
if (uatPhase !== '2a') {
    [
        ['machine-safety.js', 'machine-safety.js'],
        ['yokoten.js', 'yokoten.js'],
        ['fourm.js', 'fourm.js'],
        ['safety-culture.js', 'safety-culture.js'],
    ].forEach(([urlName, fileName]) => {
        LOCAL_ASSETS.set(`/public/js/pages/${urlName}`, {
            file: path.join(root, 'public', 'js', 'pages', fileName),
            mime: 'text/javascript; charset=utf-8',
        });
    });
}
if (uatPhase === '2d' || uatPhase === '2e') {
    [
        [uatPhase === '2d' ? 'ojt.js' : 'training.js', uatPhase === '2d' ? 'ojt.js' : 'training.js'],
    ].forEach(([urlName, fileName]) => {
        LOCAL_ASSETS.set(`/public/js/pages/${urlName}`, {
            file: path.join(root, 'public', 'js', 'pages', fileName),
            mime: 'text/javascript; charset=utf-8',
        });
    });
}

const VIEWPORTS = [
    { name: 'desktop', width: 1366, height: 860, deviceScaleFactor: 1, mobile: false },
    { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
];

let browser;
let client;

class CdpClient {
    constructor(url) {
        this.sequence = 0;
        this.pending = new Map();
        this.handlers = new Map();
        this.socket = new WebSocket(url);
    }

    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (!message.id) {
                const handler = this.handlers.get(message.method);
                if (handler) Promise.resolve(handler(message.params)).catch(error => console.error(error.stack || error.message));
                return;
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Browser connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
    }

    on(method, handler) {
        this.handlers.set(method, handler);
    }

    command(method, params = {}, timeout = 30000) {
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression, timeout = 30000) {
        const response = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result?.value;
    }

    close() {
        this.socket.close();
    }
}

async function getJson(url) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Cannot reach ${url}`);
}

async function waitFor(expression, label, timeout = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await client.evaluate(`Boolean(${expression})`).catch(() => false)) return;
        await sleep(250);
    }
    const diagnostics = await client.evaluate(`(() => ({
        url: location.href,
        hash: location.hash,
        readyState: document.readyState,
        pageText: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        runtimeErrors: window.__phase2RuntimeErrors || [],
    }))()`).catch(error => ({ diagnosticError: error.message }));
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(diagnostics)}`);
}

async function login() {
    assert.ok(process.env.PROD_UAT_ADMIN_ID && process.env.PROD_UAT_ADMIN_PASSWORD, 'Production Admin UAT credentials are required');
    const response = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: process.env.PROD_UAT_ADMIN_ID, password: process.env.PROD_UAT_ADMIN_PASSWORD }),
    });
    const json = await response.json();
    assert.strictEqual(response.status, 200, JSON.stringify(json));
    assert.ok(json.token && json.user, 'Production login did not return identity');
    return json;
}

function localAssetForUrl(rawUrl) {
    const url = new URL(rawUrl);
    const appPath = new URL(`${base}/`).pathname.replace(/\/$/, '');
    let relative = url.pathname.startsWith(appPath) ? url.pathname.slice(appPath.length) : '';
    if (!relative || relative === '/') relative = '/index.html';
    return LOCAL_ASSETS.get(relative) || null;
}

function pngDimensions(file) {
    const buffer = fs.readFileSync(file);
    assert.strictEqual(buffer.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

function currentPngs() {
    return new Set(fs.readdirSync(artifactDir).filter(file => file.toLowerCase().endsWith('.png')));
}

async function waitForDownload(before, timeout = 120000) {
    const started = Date.now();
    let stableCandidate = '';
    let stableSize = -1;
    while (Date.now() - started < timeout) {
        const files = fs.readdirSync(artifactDir);
        const added = files.find(file => file.toLowerCase().endsWith('.png') && !before.has(file));
        if (added) {
            const size = fs.statSync(path.join(artifactDir, added)).size;
            if (added === stableCandidate && size > 0 && size === stableSize) return added;
            stableCandidate = added;
            stableSize = size;
        }
        await sleep(300);
    }
    throw new Error('PNG download timed out');
}

async function triggerExport(pilot, mode, viewport) {
    await client.evaluate(`(() => {
        ${mode === 'shared-default' ? '' : `window.__TSH_FEATURE_FLAGS__ = { cardImageExportV2: ${mode === 'shared' ? JSON.stringify([pilot.module]) : '[]'} };`}
        window.__phase2ExportEvents = [];
        if (!window.__phase2ExportListener) {
            window.__phase2ExportListener = true;
            document.addEventListener('tsh:card-image-export-complete', event => window.__phase2ExportEvents.push(event.detail));
        }
        return true;
    })()`);
    const before = currentPngs();
    const triggered = await client.evaluate(`(() => {
        const card = document.querySelector(${JSON.stringify(pilot.selector)});
        if (!card) return { ok:false, reason:'target missing' };
        const rect = card.getBoundingClientRect();
        card.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: Math.max(8, Math.min(innerWidth - 8, rect.left + 20)),
            clientY: Math.max(8, Math.min(innerHeight - 8, rect.top + 20)),
        }));
        const button = document.getElementById(${JSON.stringify(pilot.menu)})?.querySelector('button');
        if (!button) return { ok:false, reason:'save action missing' };
        button.click();
        const stats = card.querySelector('#hiyari-hero-stats, #ojt-hero-stats, #tr-stats-strip');
        return {
            ok:true,
            liveWidth:Math.round(rect.width),
            liveHeight:Math.round(rect.height),
            sourceText:String(stats?.innerText || '').replace(/\s+/g, ' ').trim(),
        };
    })()`);
    assert.ok(triggered.ok, `${viewport.name} ${pilot.module} ${mode}: ${triggered.reason}`);
    const downloaded = await waitForDownload(before);
    const destinationName = `${viewport.name}-${pilot.module}-${mode}.png`;
    fs.renameSync(path.join(artifactDir, downloaded), path.join(artifactDir, destinationName));
    const events = await client.evaluate('window.__phase2ExportEvents || []');
    if (mode !== 'legacy') {
        const event = events.find(item => item.module === pilot.module && item.target);
        assert.ok(event, `${viewport.name} ${pilot.module}: shared completion event missing`);
        assert.strictEqual(event.engine, 'shared', `${viewport.name} ${pilot.module}: ${JSON.stringify(event)}`);
    }
    return {
        viewport: viewport.name,
        module: pilot.module,
        mode,
        file: destinationName,
        liveWidth: triggered.liveWidth,
        liveHeight: triggered.liveHeight,
        sourceText: triggered.sourceText,
        ...pngDimensions(path.join(artifactDir, destinationName)),
        events,
    };
}

async function openModule(pilot) {
    await client.evaluate(`location.hash = ${JSON.stringify(`#${pilot.hash}`)}`);
    await waitFor(`location.hash === ${JSON.stringify(`#${pilot.hash}`)} && document.querySelector(${JSON.stringify(pilot.selector)})`, pilot.module);
    if (pilot.ready) await waitFor(pilot.ready, `${pilot.module} export readiness`);
    await sleep(1800);
    await client.evaluate('document.fonts?.ready?.then?.(() => true) || true');
}

async function main() {
    assert.ok(fs.existsSync(browserPath), `Edge not found: ${browserPath}`);
    if (serveLocalAssets) {
        for (const asset of LOCAL_ASSETS.values()) assert.ok(fs.existsSync(asset.file), `Missing local asset: ${asset.file}`);
    }
    fs.mkdirSync(artifactDir, { recursive: true });
    const identity = await login();

    browser = spawn(browserPath, [
        '--headless=new',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    await getJson(`http://127.0.0.1:${cdpPort}/json/version`);
    const targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
    const page = targets.find(target => target.type === 'page');
    assert.ok(page, 'Browser page target was not found');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    if (serveLocalAssets) {
        await client.command('Fetch.enable', { patterns: Array.from(LOCAL_ASSETS.keys()).map(assetPath => ({
            urlPattern: `${base}${assetPath}*`,
        })) });
    }
    await client.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifactDir, eventsEnabled: true });
    client.on('Fetch.requestPaused', async params => {
        const asset = localAssetForUrl(params.request.url);
        if (!asset) {
            await client.command('Fetch.continueRequest', { requestId: params.requestId });
            return;
        }
        await client.command('Fetch.fulfillRequest', {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
                { name: 'Content-Type', value: asset.mime },
                { name: 'Cache-Control', value: 'no-store' },
            ],
            body: fs.readFileSync(asset.file).toString('base64'),
        });
    });
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.__phase2RuntimeErrors = [];
            addEventListener('error', event => window.__phase2RuntimeErrors.push(String(event.error?.stack || event.message)));
            addEventListener('unhandledrejection', event => window.__phase2RuntimeErrors.push(String(event.reason?.stack || event.reason)));
        `,
    });

    const results = [];
    const runtimeErrors = [];
    let authenticated = false;
    for (const viewport of VIEWPORTS) {
        await client.command('Emulation.setDeviceMetricsOverride', viewport);
        await client.command('Page.navigate', { url: `${base}/index.html?card_image_phase${uatPhase}=${viewport.name}-${Date.now()}#dashboard` });
        await waitFor("document.readyState === 'complete'", `${viewport.name} bootstrap`, 120000);
        if (!authenticated) {
            await client.evaluate(`(() => {
                localStorage.setItem('tsh_token', ${JSON.stringify(identity.token)});
                localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(identity.user))});
                location.reload();
                return true;
            })()`);
            authenticated = true;
        }
        await waitFor("document.readyState === 'complete' && location.hash === '#dashboard' && document.querySelector('[data-db-card-image=\"dashboard-hero\"]')", `${viewport.name} authenticated dashboard`, 120000);
        await sleep(1800);

        for (const pilot of PILOTS) {
            await openModule(pilot);
            if (uatPhase === '2c') {
                results.push(await triggerExport(pilot, 'shared-default', viewport));
            } else {
                results.push(await triggerExport(pilot, 'legacy', viewport));
                results.push(await triggerExport(pilot, 'shared', viewport));
            }
        }
        const viewportErrors = await client.evaluate('window.__phase2RuntimeErrors || []');
        runtimeErrors.push(...viewportErrors.map(error => ({ viewport: viewport.name, error })));
    }

    const consistentSharedLayouts = PILOTS.filter(pilot => {
        const captures = results.filter(result => result.module === pilot.module && result.mode !== 'legacy');
        return captures.length === VIEWPORTS.length
            && captures.every(result => result.width === captures[0].width && result.height === captures[0].height);
    }).length;
    const report = {
        phase: uatPhase === '2c'
            ? 'Phase 2C - Production default-enabled controlled rollout'
            : uatPhase === '2e'
                ? 'Phase 2D Batch 2 - Safety Training feature-flagged pilot'
            : uatPhase === '2b'
                ? 'Phase 2B - High-risk module feature-flagged rollout'
                : 'Phase 2A - Dashboard and Accident feature-flagged pilot',
        executedAt: new Date().toISOString(),
        productionOrigin: base,
        localAssetsServed: serveLocalAssets
            ? Array.from(LOCAL_ASSETS.values()).map(asset => path.relative(root, asset.file).replace(/\\/g, '/'))
            : [],
        businessDataChanged: false,
        expectedSideEffect: 'normal login/session verification and browser image downloads only',
        results,
        runtimeErrors,
        summary: {
            comparisons: uatPhase === '2c' ? 0 : results.length / 2,
            pngFiles: results.length,
            sharedCaptures: results.filter(result => result.mode !== 'legacy' && result.events.some(event => event.engine === 'shared')).length,
            fallbackCaptures: results.filter(result => result.events.some(event => event.engine === 'legacy-fallback')).length,
            consistentSharedLayouts,
            runtimeErrors: runtimeErrors.length,
        },
    };
    fs.writeFileSync(path.join(artifactDir, 'comparison.json'), JSON.stringify(report, null, 2));
    const markdown = [
        `# Card Image Export Phase ${uatPhase.toUpperCase()} Comparison`, '',
        `- Executed: ${report.executedAt}`,
        `- Comparisons: ${report.summary.comparisons}`,
        `- PNG files: ${report.summary.pngFiles}`,
        `- Shared captures: ${report.summary.sharedCaptures}`,
        `- Legacy fallbacks: ${report.summary.fallbackCaptures}`,
        `- Viewport-consistent shared layouts: ${report.summary.consistentSharedLayouts}/${PILOTS.length}`,
        `- Runtime errors: ${report.summary.runtimeErrors}`,
        '- Business data changed: No', '',
        '| Viewport | Module | Engine | Live | PNG | Bytes |',
        '|---|---|---|---:|---:|---:|',
        ...results.map(result => `| ${result.viewport} | ${result.module} | ${result.mode} | ${result.liveWidth}x${result.liveHeight} | ${result.width}x${result.height} | ${result.bytes} |`),
        '',
    ].join('\n');
    fs.writeFileSync(path.join(artifactDir, 'comparison.md'), markdown);

    assert.strictEqual(report.summary.comparisons, uatPhase === '2c' ? 0 : PILOTS.length * VIEWPORTS.length);
    assert.strictEqual(report.summary.pngFiles, PILOTS.length * VIEWPORTS.length * (uatPhase === '2c' ? 1 : 2));
    assert.strictEqual(report.summary.sharedCaptures, PILOTS.length * VIEWPORTS.length);
    assert.strictEqual(report.summary.fallbackCaptures, 0);
    assert.strictEqual(report.summary.consistentSharedLayouts, PILOTS.length);
    assert.strictEqual(report.summary.runtimeErrors, 0, JSON.stringify(runtimeErrors));
    console.log(JSON.stringify({ passed: true, artifactDir: path.relative(root, artifactDir).replace(/\\/g, '/'), summary: report.summary }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { client?.close(); } catch (_) {}
    if (browser) {
        const exited = new Promise(resolve => browser.once('exit', resolve));
        try { browser.kill(); } catch (_) {}
        await Promise.race([exited, sleep(3000)]);
    }
    try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
        console.warn(`Temporary browser profile cleanup deferred: ${error.message}`);
    }
});
