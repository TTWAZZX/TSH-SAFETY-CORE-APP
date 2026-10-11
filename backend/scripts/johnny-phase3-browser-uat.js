'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EDGE = process.env.JOHNNY_UAT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.JOHNNY_PHASE3_UAT_CDP_PORT || 9683);
const CACHE_BUST = 'johnny-admin-workspace-r1';
const PHASE3_MARKER = 'JOHNNY_PHASE3_KB_QUALITY_ADMIN';
const WORKSPACE_MARKER = 'JOHNNY_ADMIN_WORKSPACE_V1';

function readEnv() {
    const values = {};
    fs.readFileSync(path.join(ROOT, 'backend', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
        if (match) values[match[1].trim()] = match[2].trim();
    });
    return values;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
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
        this.id = 1;
        this.pending = new Map();
        this.ws = new WebSocket(url);
    }
    async connect() {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 15000);
            this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.ws.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
        });
        this.ws.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
    }
    command(method, params = {}, timeout = 30000) {
        const id = this.id++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP command timed out: ${method}`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression, timeout = 30000) {
        const result = await this.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed');
        return result.result?.value;
    }
    close() { this.ws.close(); }
}

async function waitFor(client, expression, label, timeout = 45000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            if (await client.eval(`Boolean(${expression})`, 10000)) return;
        } catch (_) {}
        await sleep(300);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function screenshot(client, file) {
    const result = await client.command('Page.captureScreenshot', { format: 'png', fromSurface: true }, 30000);
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
}

async function setViewport(client, width, height, mobile) {
    await client.command('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: mobile ? 2.5 : 1,
        mobile,
    });
    await client.command('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await client.eval(`window.dispatchEvent(new Event('resize')); true`);
    await sleep(500);
}

async function main() {
    const env = readEnv();
    const baseUrl = (process.env.JOHNNY_UAT_URL || 'http://127.0.0.1:5500').replace(/\/+$/, '');
    const parsedBaseUrl = new URL(baseUrl);
    if (!['127.0.0.1', 'localhost'].includes(parsedBaseUrl.hostname)) throw new Error('Johnny Admin Workspace UAT is local-only');
    const appUrl = `${baseUrl}/index.html?johnnyPhase3Uat=${Date.now()}#johnny-ai`;
    const employeeId = process.env.SMOKE_ADMIN_EMPLOYEE_ID || env.SMOKE_ADMIN_EMPLOYEE_ID || env.PROD_UAT_ADMIN_ID?.replace(/^['"]|['"]$/g, '');
    const password = process.env.SMOKE_ADMIN_PASSWORD || env.SMOKE_ADMIN_PASSWORD || env.PROD_UAT_ADMIN_PASSWORD?.replace(/^['"]|['"]$/g, '');
    if (!employeeId || !password) throw new Error('Missing smoke Admin credentials');

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const artifactDir = path.join(ROOT, 'backups', 'local', `johnny-admin-workspace-browser-uat-${stamp}`);
    fs.mkdirSync(artifactDir, { recursive: true });

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-p3-edge-'));
    const browser = spawn(EDGE, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profileDir}`,
        appUrl,
    ], { stdio: 'ignore', windowsHide: true });

    const result = {
        ok: false,
        appUrl,
        artifactDir,
        cacheBust: CACHE_BUST,
        marker: PHASE3_MARKER,
        viewports: [],
        failures: [],
    };

    let client;
    try {
        await getJson(`http://127.0.0.1:${PORT}/json/version`);
        const targets = await getJson(`http://127.0.0.1:${PORT}/json/list`);
        const page = targets.find(target => target.type === 'page');
        if (!page) throw new Error('No browser page target');
        client = new Cdp(page.webSocketDebuggerUrl);
        await client.connect();
        await client.command('Page.enable');
        await client.command('Runtime.enable');

        await setViewport(client, 1366, 768, false);
        await waitFor(client, `document.getElementById('login-form') && window.__tshLoginReady === true`, 'login form');
        await client.eval(`(() => {
            document.getElementById('login-employee-id').value = ${JSON.stringify(employeeId)};
            document.getElementById('login-password').value = ${JSON.stringify(password)};
            document.getElementById('login-form').requestSubmit();
            return true;
        })()`);
        await waitFor(client, `document.getElementById('app-container') && !document.getElementById('app-container').classList.contains('hidden')`, 'app container');
        await client.eval(`location.hash = '#johnny-ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
        await waitFor(client, `document.querySelector('[data-johnny-phase2]')`, 'Johnny page');
        await client.eval(`document.querySelector('.johnny-tab-btn[data-tab="admin"]')?.click(); true`);
        await waitFor(client, `document.querySelector('[data-johnny-admin-workspace="${WORKSPACE_MARKER}"]')`, 'Johnny Admin Workspace');
        await client.eval(`(() => {
            const style = document.createElement('style');
            style.id = 'johnny-workspace-uat-style';
            style.textContent = '#toast-container{display:none!important}';
            document.head.appendChild(style);
            document.getElementById('toast-container')?.remove();
            return true;
        })()`);

        const viewports = [
            { name: 'mobile-390', width: 390, height: 844, mobile: true },
            { name: 'mobile-430', width: 430, height: 932, mobile: true },
            { name: 'tablet-768', width: 768, height: 1024, mobile: false },
            { name: 'desktop-1366', width: 1366, height: 768, mobile: false },
            { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
        ];
        for (const viewport of viewports) {
            await setViewport(client, viewport.width, viewport.height, viewport.mobile);
            await client.eval(`document.querySelector('.johnny-tab-btn[data-tab="admin"]')?.click(); true`);
            await sleep(100);
            const observation = await client.eval(`(async () => {
                const keys = ['overview','create','library','operations','appearance'];
                const controls = ['johnny-avatar-form','johnny-kb-form','johnny-knowledge-form','johnny-kb-list','johnny-observability-dashboard','johnny-operational-log-list'];
                const states = [];
                for (const key of keys) {
                    const tab = document.querySelector('[data-johnny-admin-section-tab="' + key + '"]');
                    tab?.click();
                    await new Promise(resolve => setTimeout(resolve, 60));
                    const visiblePanels = keys.filter(candidate => !document.querySelector('[data-johnny-admin-section-panel="' + candidate + '"]')?.hidden);
                    states.push({ key, selected: tab?.getAttribute('aria-selected'), visiblePanels });
                }
                document.querySelector('[data-johnny-admin-section-tab="overview"]')?.click();
                const quick = document.querySelector('[data-johnny-admin-jump="create"]');
                quick?.click();
                const quickActionTarget = document.querySelector('[data-johnny-admin-section-tab="create"]')?.getAttribute('aria-selected');
                document.querySelector('[data-johnny-admin-section-tab="overview"]')?.click();
                const resources = performance.getEntriesByType('resource').map(entry => String(entry.name || ''));
                return {
                    width: window.innerWidth,
                    marker: document.querySelector('[data-johnny-admin-workspace]')?.dataset?.johnnyAdminWorkspace || '',
                    tabCount: document.querySelectorAll('[data-johnny-admin-section-tab]').length,
                    panelCount: document.querySelectorAll('[data-johnny-admin-section-panel]').length,
                    states,
                    quickActionTarget,
                    activeAdminTab: document.querySelector('.johnny-shell')?.dataset?.johnnyTab || '',
                    adminPanelVisible: !document.getElementById('johnny-admin-panel')?.classList.contains('hidden'),
                    controlsPresent: controls.every(id => Boolean(document.getElementById(id))),
                    phase3Marker: document.querySelector('[data-johnny-phase3]')?.dataset?.johnnyPhase3 || '',
                    johnnyCacheBust: resources.some(src => src.includes('/public/js/pages/johnny-ai.js') && src.includes('${CACHE_BUST}')),
                    mainCacheBust: resources.some(src => src.includes('/public/js/main.js') && src.includes('${CACHE_BUST}')),
                    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                };
            })()`);
            result.viewports.push({ ...viewport, ...observation });
            await sleep(900);
            await client.eval(`document.getElementById('toast-container')?.remove(); true`);
            await screenshot(client, path.join(artifactDir, `johnny-admin-workspace-${viewport.name}.png`));
        }

        const checks = result.viewports.flatMap(viewport => [
            [`${viewport.name} workspace marker`, viewport.marker === WORKSPACE_MARKER],
            [`${viewport.name} bounded sections`, viewport.tabCount === 5 && viewport.panelCount === 5],
            [`${viewport.name} one visible panel`, viewport.states.every(state => state.selected === 'true' && state.visiblePanels.length === 1 && state.visiblePanels[0] === state.key)],
            [`${viewport.name} quick action`, viewport.quickActionTarget === 'true'],
            [`${viewport.name} admin panel visible`, viewport.activeAdminTab === 'admin' && viewport.adminPanelVisible],
            [`${viewport.name} existing controls`, viewport.controlsPresent],
            [`${viewport.name} phase 3 contract`, viewport.phase3Marker === PHASE3_MARKER],
            [`${viewport.name} Johnny cache bust`, viewport.johnnyCacheBust],
            [`${viewport.name} main cache bust`, viewport.mainCacheBust],
            [`${viewport.name} no horizontal overflow`, !viewport.horizontalOverflow],
        ]);
        result.failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
        result.ok = result.failures.length === 0;
        if (!result.ok) throw new Error(`Johnny Phase 3 browser UAT failed: ${result.failures.join(', ')}`);
    } finally {
        if (client) client.close();
        browser.kill();
        fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
    }

    console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
