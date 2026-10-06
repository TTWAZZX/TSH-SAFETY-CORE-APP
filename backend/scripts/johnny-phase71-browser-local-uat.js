'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const EDGE = process.env.JOHNNY_UAT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = Number(process.env.JOHNNY_PHASE71_CDP_PORT || 9698);
const baseUrl = String(process.env.JOHNNY_UAT_URL || '').replace(/\/+$/, '');
if (!baseUrl) throw new Error('JOHNNY_UAT_URL is required; Production fallback is forbidden');
const parsedBase = new URL(baseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedBase.hostname)) {
    throw new Error('Johnny Phase 7.1 Browser UAT refuses non-loopback URLs');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (_) {}
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
    constructor(url) {
        this.id = 1;
        this.pending = new Map();
        this.events = [];
        this.ws = new WebSocket(url);
    }
    async connect() {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 15000);
            this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.ws.addEventListener('error', reject, { once: true });
        });
        this.ws.addEventListener('message', event => {
            const message = JSON.parse(event.data);
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
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try {
            if (await client.eval(`Boolean(${expression})`, 10000)) return;
        } catch (_) {}
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function setViewport(client, width, height, mobile) {
    await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2.5 : 1, mobile });
    await client.command('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await client.eval('window.dispatchEvent(new Event("resize")); true');
    await sleep(500);
}

async function screenshot(client, destination) {
    const capture = await client.command('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(destination, Buffer.from(capture.data, 'base64'));
}

async function main() {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const artifactDir = path.join(ROOT, 'backups', 'local', `johnny-phase71-browser-${stamp}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-phase71-edge-'));
    const browser = spawn(EDGE, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    const result = { success: false, baseUrl, artifactDir, desktop: {}, mobile: {}, failures: [] };
    let client;
    try {
        await getJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
        const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const page = targets.find(target => target.type === 'page');
        if (!page) throw new Error('No Edge page target');
        client = new Cdp(page.webSocketDebuggerUrl);
        await client.connect();
        await client.command('Page.enable');
        await client.command('Runtime.enable');
        await client.command('Network.enable');
        await client.command('Page.addScriptToEvaluateOnNewDocument', {
            source: `window.API_BASE=${JSON.stringify(`${baseUrl}/api`)};`,
        });
        const navigation = await client.command('Page.navigate', { url: `${baseUrl}/index.html?johnnyPhase71=${Date.now()}#johnny-ai` });
        if (navigation.errorText) throw new Error(`Browser navigation failed: ${navigation.errorText}`);
        await waitFor(client, `document.getElementById('login-form') && window.__tshLoginReady === true`, 'login form');
        await setViewport(client, 1366, 768, false);
        await client.eval(`(() => {
            document.getElementById('login-employee-id').value = 'PHASE6-ADMIN';
            document.getElementById('login-password').value = 'Phase6Only!';
            document.getElementById('login-form').requestSubmit();
            return true;
        })()`);
        await waitFor(client, `document.getElementById('app-container') && !document.getElementById('app-container').classList.contains('hidden')`, 'authenticated app');
        await client.eval(`location.hash='#johnny-ai'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
        await waitFor(client, `document.querySelector('[data-johnny-mobile-compact="20260709"]')`, 'Johnny workspace');
        result.desktop.workspace = await client.eval(`(() => ({
            route: location.hash,
            width: innerWidth,
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            inputHeight: document.getElementById('johnny-input')?.getBoundingClientRect().height || 0,
            obsoleteCopyVisible: document.body.innerText.includes('Phase 2 mobile ready'),
        }))()`);
        await screenshot(client, path.join(artifactDir, 'workspace-desktop.png'));

        await client.eval(`location.hash='#dashboard'; window.dispatchEvent(new HashChangeEvent('hashchange')); true`);
        await waitFor(client, `document.getElementById('johnny-global-launcher') && !document.getElementById('johnny-global-launcher').hidden`, 'Johnny drawer launcher');
        await client.eval(`document.getElementById('johnny-global-launcher').click(); true`);
        await waitFor(client, `document.body.classList.contains('johnny-global-open')`, 'open Johnny drawer');
        await client.eval(`(() => {
            const input=document.getElementById('johnny-global-input');
            input.value='หน้า Dashboard ใช้งานอย่างไร';
            document.getElementById('johnny-global-form').requestSubmit();
            return true;
        })()`);
        await waitFor(client, `document.querySelector('.johnny-global-feedback-button[data-feedback-rating="helpful"]')`, 'drawer answer feedback');
        await client.eval(`document.querySelector('.johnny-global-feedback-button[data-feedback-rating="helpful"]').click(); true`);
        await waitFor(client, `document.querySelector('.johnny-global-feedback-button[data-feedback-rating="helpful"]')?.getAttribute('aria-pressed') === 'true'`, 'saved helpful feedback');
        result.desktop.drawer = await client.eval(`(() => {
            const panel=document.getElementById('johnny-global-panel');
            const rect=panel.getBoundingClientRect();
            return {
                open: document.body.classList.contains('johnny-global-open'),
                role: panel.getAttribute('role'),
                ariaModal: panel.getAttribute('aria-modal'),
                withinViewport: rect.left >= 0 && rect.right <= innerWidth + 1,
                feedbackSaved: document.querySelector('.johnny-global-feedback-button[data-feedback-rating="helpful"]')?.getAttribute('aria-pressed') === 'true',
                sourceVisible: Boolean(document.querySelector('.johnny-global-source')),
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
        })()`);
        await screenshot(client, path.join(artifactDir, 'drawer-desktop.png'));

        await setViewport(client, 390, 844, true);
        result.mobile = await client.eval(`(() => {
            const panel=document.getElementById('johnny-global-panel');
            const rect=panel.getBoundingClientRect();
            const controls=Array.from(panel.querySelectorAll('button,textarea,select')).filter(el => {
                const style=getComputedStyle(el); const r=el.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            });
            const controlHeights=controls.map(el => ({
                id: el.id || '',
                className: String(el.className || ''),
                height: el.getBoundingClientRect().height,
            })).sort((a,b) => a.height-b.height);
            return {
                width: innerWidth,
                panelCoversViewport: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1,
                minControlHeight: Math.min(...controls.map(el => el.getBoundingClientRect().height)),
                smallestControls: controlHeights.slice(0, 5),
                composerVisible: Boolean(document.getElementById('johnny-global-form')?.getBoundingClientRect().height),
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
        })()`);
        await screenshot(client, path.join(artifactDir, 'drawer-mobile-390.png'));

        const security = await client.eval(`(async () => {
            const first=await fetch('/shared/johnny-answer-feedback.json');
            const second=await fetch('/shared/johnny-system-usage-knowledge.json');
            return { feedbackStatus:first.status, knowledgeStatus:second.status };
        })()`);
        result.sharedContractAccess = security;

        result.cleanup = await client.eval(`(async () => {
            const token=localStorage.getItem('tsh_token');
            const response=await fetch('/api/johnny/conversations', { method:'DELETE', headers:{ Authorization:'Bearer '+token } });
            const history=await fetch('/api/johnny/conversations', { headers:{ Authorization:'Bearer '+token } }).then(r=>r.json());
            return { deleteStatus:response.status, remaining:Array.isArray(history.data) ? history.data.length : -1 };
        })()`);

        const apiFailures = client.events
            .filter(event => event.method === 'Network.responseReceived')
            .map(event => event.params.response)
            .filter(response => response.url.includes('/api/johnny/') && Number(response.status) >= 400)
            .map(response => ({ status: response.status, url: response.url }));
        const unexpectedMutations = client.events
            .filter(event => event.method === 'Network.requestWillBeSent')
            .map(event => event.params.request)
            .filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))
            .filter(request => {
                const pathname = new URL(request.url).pathname;
                return !['/api/login', '/api/session/verify', '/api/johnny/chat', '/api/johnny/conversations'].includes(pathname)
                    && !/^\/api\/johnny\/messages\/\d+\/feedback$/.test(pathname);
            })
            .map(request => ({ method: request.method, url: request.url }));
        result.apiFailures = apiFailures;
        result.unexpectedMutations = unexpectedMutations;

        const checks = [
            ['workspace route', result.desktop.workspace.route === '#johnny-ai'],
            ['desktop workspace no overflow', !result.desktop.workspace.pageOverflow],
            ['obsolete copy absent', !result.desktop.workspace.obsoleteCopyVisible],
            ['drawer accessible dialog', result.desktop.drawer.open && result.desktop.drawer.role === 'dialog' && result.desktop.drawer.ariaModal === 'true'],
            ['drawer inside desktop viewport', result.desktop.drawer.withinViewport && !result.desktop.drawer.pageOverflow],
            ['drawer answer source visible', result.desktop.drawer.sourceVisible],
            ['feedback persisted', result.desktop.drawer.feedbackSaved],
            ['mobile drawer inside viewport', result.mobile.panelCoversViewport && !result.mobile.pageOverflow],
            ['mobile composer visible', result.mobile.composerVisible],
            ['mobile controls at least 44px', result.mobile.minControlHeight >= 44],
            ['shared feedback contract denied', security.feedbackStatus === 404],
            ['shared usage contract denied', security.knowledgeStatus === 404],
            ['no failed Johnny API response', apiFailures.length === 0],
            ['no unexpected mutation', unexpectedMutations.length === 0],
            ['browser cleanup zero conversations', result.cleanup.deleteStatus === 200 && result.cleanup.remaining === 0],
        ];
        result.failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
        result.success = result.failures.length === 0;
        if (!result.success) throw new Error(`Browser UAT failed: ${result.failures.join(', ')}`);
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        if (client) {
            try {
                result.diagnostic = await client.eval(`(() => ({
                    href: location.href,
                    title: document.title,
                    readyState: document.readyState,
                    loginForm: Boolean(document.getElementById('login-form')),
                    loginReady: window.__tshLoginReady === true,
                    bodyText: String(document.body?.innerText || '').slice(0, 300),
                }))()`);
                result.runtimeEvents = client.events
                    .filter(event => ['Runtime.exceptionThrown', 'Runtime.consoleAPICalled'].includes(event.method))
                    .slice(-20);
            } catch (_) {}
        }
        result.failures.push(error.message || String(error));
        throw error;
    } finally {
        if (client) client.close();
        if (process.platform === 'win32' && browser.pid) {
            spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        } else {
            browser.kill();
        }
        fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
        const resolvedProfile = path.resolve(profileDir);
        const tempRoot = path.resolve(os.tmpdir()) + path.sep;
        if (resolvedProfile.startsWith(tempRoot)) {
            try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }); } catch (_) {}
        }
    }
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
