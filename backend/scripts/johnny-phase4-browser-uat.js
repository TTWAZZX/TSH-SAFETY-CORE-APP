'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const EDGE = process.env.JOHNNY_UAT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.JOHNNY_PHASE4_UAT_CDP_PORT || 9684);
const CACHE_BUST = '20260708-johnny-phase4-observability';
const PHASE4_MARKER = 'JOHNNY_PHASE4_OBSERVABILITY';

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
    const baseUrl = (process.env.JOHNNY_UAT_URL || env.PUBLIC_UPLOAD_BASE_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
    const appUrl = `${baseUrl}/index.html?johnnyPhase4Uat=${Date.now()}#johnny-ai`;
    const employeeId = process.env.SMOKE_ADMIN_EMPLOYEE_ID || env.SMOKE_ADMIN_EMPLOYEE_ID;
    const password = process.env.SMOKE_ADMIN_PASSWORD || env.SMOKE_ADMIN_PASSWORD;
    if (!employeeId || !password) throw new Error('Missing smoke Admin credentials');

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const artifactDir = path.join(ROOT, 'backups', 'production', `johnny-phase4-browser-uat-${stamp}`);
    fs.mkdirSync(artifactDir, { recursive: true });

    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-p4-edge-'));
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
        marker: PHASE4_MARKER,
        desktop: {},
        mobile: {},
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

        await setViewport(client, 1366, 860, false);
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
        await waitFor(client, `document.querySelector('[data-johnny-phase4="${PHASE4_MARKER}"]')`, 'Johnny Phase 4 observability');
        await waitFor(client, `document.querySelector('[data-johnny-phase4-dashboard="true"]')`, 'Johnny observability dashboard');

        result.desktop = await client.eval(`(() => {
            const resources = performance.getEntriesByType('resource').map(entry => String(entry.name || ''));
            return {
                phaseMarker: document.querySelector('[data-johnny-phase4]')?.dataset?.johnnyPhase4 || '',
                dashboard: Boolean(document.querySelector('[data-johnny-phase4-dashboard="true"]')),
                daysControl: Boolean(document.getElementById('johnny-observability-days')),
                metricCards: document.querySelectorAll('#johnny-observability-dashboard .grid .rounded-xl').length,
                operationsText: document.getElementById('johnny-observability-dashboard')?.textContent.includes('Operations') || false,
                sourceText: document.getElementById('johnny-observability-dashboard')?.textContent.includes('Answer Sources') || false,
                johnnyCacheBust: resources.some(src => src.includes('/public/js/pages/johnny-ai.js') && src.includes('${CACHE_BUST}')),
                mainCacheBust: resources.some(src => src.includes('/public/js/main.js') && src.includes('${CACHE_BUST}')),
                horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
        })()`);
        await screenshot(client, path.join(artifactDir, 'johnny-phase4-observability-desktop.png'));

        await setViewport(client, 390, 844, true);
        await sleep(700);
        result.mobile = await client.eval(`(() => ({
            width: window.innerWidth,
            activePage: document.body.dataset.activePage || '',
            dashboard: Boolean(document.querySelector('[data-johnny-phase4-dashboard="true"]')),
            daysControl: Boolean(document.getElementById('johnny-observability-days')),
            metricCards: document.querySelectorAll('#johnny-observability-dashboard .grid .rounded-xl').length,
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            bottomTabHidden: getComputedStyle(document.getElementById('bottom-tab-bar')).visibility === 'hidden',
        }))()`);
        await screenshot(client, path.join(artifactDir, 'johnny-phase4-observability-mobile.png'));

        const checks = [
            ['desktop phase marker', result.desktop.phaseMarker === PHASE4_MARKER],
            ['desktop dashboard', result.desktop.dashboard],
            ['desktop days control', result.desktop.daysControl],
            ['desktop metric cards', result.desktop.metricCards >= 6],
            ['desktop operations table', result.desktop.operationsText],
            ['desktop source table', result.desktop.sourceText],
            ['desktop johnny cache bust', result.desktop.johnnyCacheBust],
            ['desktop main cache bust', result.desktop.mainCacheBust],
            ['desktop no horizontal overflow', !result.desktop.horizontalOverflow],
            ['mobile active page', result.mobile.activePage === 'johnny-ai'],
            ['mobile dashboard', result.mobile.dashboard],
            ['mobile days control', result.mobile.daysControl],
            ['mobile metric cards', result.mobile.metricCards >= 6],
            ['mobile bottom tab hidden', result.mobile.bottomTabHidden],
            ['mobile no horizontal overflow', !result.mobile.horizontalOverflow],
        ];
        result.failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
        result.ok = result.failures.length === 0;
        if (!result.ok) throw new Error(`Johnny Phase 4 browser UAT failed: ${result.failures.join(', ')}`);
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
