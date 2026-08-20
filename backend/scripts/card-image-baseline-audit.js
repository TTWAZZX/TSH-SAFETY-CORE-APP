'use strict';

require('../node_modules/dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9831;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const viewportProfile = String(process.env.CARD_IMAGE_AUDIT_VIEWPORT || 'desktop').toLowerCase() === 'mobile' ? 'mobile' : 'desktop';
const viewport = viewportProfile === 'mobile'
    ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }
    : { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false };
const artifactDir = path.join(root, 'backups', 'local', `card-image-baseline-${viewportProfile}-${stamp}`);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-image-baseline-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const MODULES = [
    { hash: 'dashboard', label: 'Dashboard', attr: 'data-db-card-image', menu: 'db-card-save-menu' },
    { hash: 'patrol', label: 'Patrol', attr: 'data-patrol-card-image', menu: 'patrol-card-save-menu' },
    { hash: 'accident', label: 'Accident', attr: 'data-acc-card-image', menu: 'acc-card-save-menu' },
    { hash: 'machine-safety', label: 'Machine Safety', attr: 'data-msd-card-image', menu: 'msd-card-save-menu' },
    { hash: 'ojt', label: 'OJT / SCW', attr: 'data-ojt-card-image', menu: 'ojt-card-save-menu' },
    { hash: 'cccf', label: 'CCCF', attr: 'data-cccf-card-image', menu: 'cccf-card-save-menu' },
    { hash: 'training', label: 'Safety Training', attr: 'data-tr-card-image', menu: 'tr-card-save-menu' },
    { hash: 'hiyari', label: 'Hiyari-Hatto', attr: 'data-hiyari-card-image', menu: 'hiyari-card-save-menu' },
    { hash: 'ky', label: 'KY Activity', attr: 'data-ky-card-image', menu: 'ky-card-save-menu' },
    { hash: 'yokoten', label: 'Yokoten', attr: 'data-yok-card-image', menu: 'yok-card-save-menu' },
    { hash: 'safety-culture', label: 'Safety Culture', attr: 'data-sc-card-image', menu: 'sc-card-save-menu' },
    { hash: 'fourm', label: '4M Change Management', attr: 'data-fourm-card-image', menu: 'fourm-card-save-menu' },
];

let browser;
let client;

async function getJson(url, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Timed out: ${url}`);
}

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (!message.id) {
                this.events.push(message);
                return;
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression, timeout = 30000) {
        const response = await this.command('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
        }, timeout);
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result?.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(expression, label, timeout = 90000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await client.eval(`Boolean(${expression})`).catch(() => false)) return;
        await sleep(350);
    }
    throw new Error(`Timed out waiting for ${label}`);
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

function snapshotPngs() {
    return new Set(fs.readdirSync(artifactDir).filter(name => name.toLowerCase().endsWith('.png')));
}

async function waitForDownload(before, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const files = fs.readdirSync(artifactDir);
        const pending = files.some(name => name.endsWith('.crdownload'));
        const added = files.filter(name => name.toLowerCase().endsWith('.png') && !before.has(name));
        if (!pending && added.length) return added[0];
        await sleep(400);
    }
    throw new Error('PNG download timed out');
}

function inventoryExpression(module) {
    return `(() => {
        const attr = ${JSON.stringify(module.attr)};
        const nodes = Array.from(document.querySelectorAll('[' + attr + ']')).filter(el => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width >= 20 && r.height >= 20 && s.display !== 'none' && s.visibility !== 'hidden';
        });
        const rows = nodes.map((el, index) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const descendants = Array.from(el.querySelectorAll('*'));
            const clippedText = descendants.filter(node => {
                if (!String(node.textContent || '').trim()) return false;
                const s = getComputedStyle(node);
                const clips = ['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowX) || ['hidden', 'clip', 'auto', 'scroll'].includes(s.overflowY) || s.whiteSpace === 'nowrap';
                return clips && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1);
            }).length;
            const scrollX = el.scrollWidth > el.clientWidth + 1;
            const scrollY = el.scrollHeight > el.clientHeight + 1;
            const canvases = el.querySelectorAll('canvas').length;
            const images = Array.from(el.querySelectorAll('img'));
            const incompleteImages = images.filter(img => !img.complete || !img.naturalWidth).length;
            const stickyOrFixed = descendants.filter(node => ['sticky', 'fixed'].includes(getComputedStyle(node).position)).length;
            const animated = descendants.filter(node => {
                const s = getComputedStyle(node);
                return s.animationName !== 'none' || s.transitionDuration.split(',').some(v => parseFloat(v) > 0);
            }).length;
            const transformed = style.transform !== 'none' ? 1 : 0;
            const riskScore = clippedText * 3 + (scrollX ? 5 : 0) + (scrollY ? 5 : 0)
                + (['hidden','auto','scroll','clip'].includes(style.overflowX) ? 2 : 0)
                + (['hidden','auto','scroll','clip'].includes(style.overflowY) ? 2 : 0)
                + canvases * 4 + images.length * 2 + incompleteImages * 5 + stickyOrFixed * 2
                + (animated ? 2 : 0) + transformed * 2 + (rect.width < 500 ? 1 : 0);
            return {
                index,
                name: el.getAttribute(attr) || el.id || attr + '-' + (index + 1),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                scrollWidth: el.scrollWidth,
                scrollHeight: el.scrollHeight,
                overflowX: style.overflowX,
                overflowY: style.overflowY,
                scrollX,
                scrollY,
                clippedText,
                canvases,
                images: images.length,
                incompleteImages,
                stickyOrFixed,
                animated,
                transformed,
                riskScore,
                textSample: String(el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 180),
            };
        });
        return {
            fontReady: document.fonts?.status || 'unsupported',
            kanitLoaded: document.fonts?.check?.('16px Kanit') ?? null,
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            targets: rows,
        };
    })()`;
}

async function auditModule(module) {
    await client.eval(`(() => { window.__cardAuditErrors = []; location.hash = ${JSON.stringify(`#${module.hash}`)}; return true; })()`);
    await waitFor(`location.hash === ${JSON.stringify(`#${module.hash}`)} && document.querySelector(${JSON.stringify(`[${module.attr}]`)})`, module.label);
    await sleep(1800);
    await client.eval('document.fonts?.ready?.then?.(() => true) || true');
    const inventory = await client.eval(inventoryExpression(module));
    const sorted = [...inventory.targets].sort((a, b) => b.riskScore - a.riskScore || b.height - a.height);
    const candidate = sorted.find(row => row.width <= 2200 && row.height <= 5000) || sorted[0];
    let baselineFile = null;
    let exportError = null;
    if (candidate) {
        const before = snapshotPngs();
        try {
            const opened = await client.eval(`(() => {
                const nodes = Array.from(document.querySelectorAll(${JSON.stringify(`[${module.attr}]`)})).filter(el => {
                    const r = el.getBoundingClientRect();
                    const s = getComputedStyle(el);
                    return r.width >= 20 && r.height >= 20 && s.display !== 'none' && s.visibility !== 'hidden';
                });
                const card = nodes[${candidate.index}];
                if (!card) return { ok:false, reason:'candidate missing' };
                const rect = card.getBoundingClientRect();
                card.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:Math.max(8,Math.min(innerWidth-8,rect.left+20)), clientY:Math.max(8,Math.min(innerHeight-8,rect.top+20)) }));
                const menu = document.getElementById(${JSON.stringify(module.menu)});
                const button = menu?.querySelector('button');
                if (!button) return { ok:false, reason:'save menu unavailable' };
                button.click();
                return { ok:true };
            })()`);
            if (!opened?.ok) throw new Error(opened?.reason || 'Cannot trigger card export');
            baselineFile = await waitForDownload(before);
        } catch (error) {
            exportError = error.message;
        }
    }
    const runtimeErrors = await client.eval('window.__cardAuditErrors || []').catch(() => []);
    return {
        hash: module.hash,
        label: module.label,
        attribute: module.attr,
        ...inventory,
        visibleTargetCount: inventory.targets.length,
        selectedBaseline: candidate || null,
        baselineFile,
        exportError,
        runtimeErrors,
    };
}

function buildMarkdown(result) {
    const lines = [
        '# Card Image Export Phase 0 Baseline Audit', '',
        `- Production: ${result.production}`,
        `- Executed: ${result.executedAt}`,
        `- Modules: ${result.summary.modules}`,
        `- Visible targets: ${result.summary.visibleTargets}`,
        `- Baseline PNG files: ${result.summary.baselinePngs}`,
        `- Export failures: ${result.summary.exportFailures}`,
        `- Business data changed: No`, '',
        '| Module | Targets | High risk | Font | Baseline | Export error |',
        '|---|---:|---:|---|---|---|',
    ];
    for (const module of result.modules) {
        const highRisk = module.targets.filter(row => row.riskScore >= 8).length;
        lines.push(`| ${module.label} | ${module.visibleTargetCount} | ${highRisk} | ${module.kanitLoaded ? 'Kanit' : 'Not ready'} | ${module.baselineFile || '-'} | ${module.exportError || '-'} |`);
    }
    lines.push('', '## Highest-risk targets', '');
    for (const module of result.modules) {
        const top = [...module.targets].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
        lines.push(`### ${module.label}`, '');
        if (!top.length) lines.push('- No visible target found.');
        for (const row of top) {
            lines.push(`- ${row.name}: risk ${row.riskScore}, ${row.width}x${row.height}, clipped text ${row.clippedText}, scroll ${row.scrollX || row.scrollY ? 'yes' : 'no'}, canvas ${row.canvases}, images ${row.images}`);
        }
        lines.push('');
    }
    return `${lines.join('\n')}\n`;
}

async function main() {
    assert.ok(fs.existsSync(browserPath), `Edge not found at ${browserPath}`);
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
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Log.enable');
    await client.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifactDir, eventsEnabled: true });
    await client.command('Emulation.setDeviceMetricsOverride', viewport);
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.__cardAuditErrors = [];
            addEventListener('error', event => window.__cardAuditErrors.push(String(event.error?.stack || event.message)));
            addEventListener('unhandledrejection', event => window.__cardAuditErrors.push(String(event.reason?.stack || event.reason)));
        `,
    });

    await client.command('Page.navigate', { url: `${base}/?card_image_phase0=${Date.now()}` });
    await waitFor("document.readyState === 'complete'", 'application bootstrap', 120000);
    await client.eval(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(identity.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(identity.user))});
        return true;
    })()`);
    await client.command('Page.navigate', { url: `${base}/index.html?card_image_phase0=${Date.now()}#dashboard` });
    await waitFor("document.readyState === 'complete' && location.hash === '#dashboard'", 'authenticated application', 120000);

    const modules = [];
    for (const module of MODULES) {
        process.stdout.write(`AUDIT ${module.label} ... `);
        try {
            const audit = await auditModule(module);
            modules.push(audit);
            console.log(`targets=${audit.visibleTargetCount} baseline=${audit.baselineFile || 'none'}${audit.exportError ? ` error=${audit.exportError}` : ''}`);
        } catch (error) {
            modules.push({ hash: module.hash, label: module.label, attribute: module.attr, targets: [], visibleTargetCount: 0, baselineFile: null, exportError: error.message, runtimeErrors: [] });
            console.log(`FAILED ${error.message}`);
        }
    }

    const result = {
        phase: 'Phase 0 - Baseline & Safety Audit',
        viewportProfile,
        production: base,
        executedAt: new Date().toISOString(),
        role: identity.user.role || identity.user.Role,
        businessDataChanged: false,
        expectedSideEffect: 'normal login/session verification and browser image downloads only',
        summary: {
            modules: modules.length,
            visibleTargets: modules.reduce((sum, module) => sum + module.visibleTargetCount, 0),
            baselinePngs: modules.filter(module => module.baselineFile).length,
            exportFailures: modules.filter(module => module.exportError).length,
            runtimeErrors: modules.reduce((sum, module) => sum + (module.runtimeErrors?.length || 0), 0),
        },
        modules,
    };
    fs.writeFileSync(path.join(artifactDir, 'baseline-audit.json'), JSON.stringify(result, null, 2));
    fs.writeFileSync(path.join(artifactDir, 'baseline-audit.md'), buildMarkdown(result));
    console.log(JSON.stringify({ passed: true, artifactDir: path.relative(root, artifactDir).replace(/\\/g, '/'), summary: result.summary }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    try { client?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    await sleep(500);
    fs.rmSync(profileDir, { recursive: true, force: true });
});
