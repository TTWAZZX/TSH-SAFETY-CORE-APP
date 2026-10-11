'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const app = require('../server');
const db = require('../db');

const apiPort = Number(process.env.LOGIN_A11Y_API_PORT || 5016);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const frontendUrl = String(process.env.LOCAL_FRONTEND_URL || 'http://127.0.0.1:5500').replace(/\/+$/, '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.LOGIN_A11Y_CDP_PORT || 9816);
const root = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(root, 'backups', 'local', '.uat-browser-runtime');
fs.mkdirSync(runtimeDir, { recursive: true });
const profileDir = fs.mkdtempSync(path.join(runtimeDir, 'tsh-login-a11y-'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const artifactDir = path.join(root, 'backups', 'local', `login-accessibility-performance-${stamp}`);
fs.mkdirSync(artifactDir, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let client;
let server;
const browserErrors = [];
const failedRequests = [];

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        this.socket = new WebSocket(url);
    }
    on(method, listener) {
        const listeners = this.listeners.get(method) || [];
        listeners.push(listener);
        this.listeners.set(method, listeners);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
            if (message.method) {
                for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
        });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 15000);
            this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
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
    close() { try { this.socket.close(); } catch (_) {} }
}

async function evaluate(expression) {
    const result = await client.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try { if (await evaluate(expression)) return; } catch (_) {}
        await sleep(200);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
}

async function screenshot(name) {
    const shot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(shot.data, 'base64'));
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
        '--no-default-browser-check', '--hide-scrollbars', '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(200);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome CDP target unavailable');
    client = new Cdp(page.webSocketDebuggerUrl);
    client.on('Runtime.exceptionThrown', params => browserErrors.push(params.exceptionDetails?.text || 'Runtime exception'));
    client.on('Network.loadingFailed', params => {
        if (!params.canceled) failedRequests.push({ url: params.requestId, error: params.errorText });
    });
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Network.enable');
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.API_BASE=${JSON.stringify(`${apiBaseUrl}/api`)};
            try { localStorage.clear(); sessionStorage.clear(); } catch (_) {}
            window.__loginA11yErrors=[];
            addEventListener('error', event => window.__loginA11yErrors.push(String(event.error?.stack || event.message || 'window error')));
            addEventListener('unhandledrejection', event => window.__loginA11yErrors.push(String(event.reason?.stack || event.reason || 'unhandled rejection')));
        `,
    });
}

async function auditViewport(viewport) {
    await client.command('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 768,
    });
    await client.command('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: viewport.reducedMotion ? 'reduce' : 'no-preference' }],
    });
    await client.command('Page.navigate', { url: `${frontendUrl}/index.html?login_a11y_perf=${stamp}-${viewport.name}` });
    await waitFor(`document.readyState === 'complete' && !document.getElementById('login-overlay')?.classList.contains('hidden')`);
    await waitFor(`document.activeElement?.id === 'login-employee-id'`);
    await evaluate(`document.fonts?.ready || Promise.resolve()`);
    await sleep(150);

    const state = await evaluate(`(() => {
        const visible = node => {
            const style = getComputedStyle(node);
            return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
        };
        const accessibleName = node => {
            const explicit = node.getAttribute('aria-label') || node.getAttribute('title');
            if (explicit) return explicit.trim();
            const labelled = node.getAttribute('aria-labelledby');
            if (labelled) return labelled.split(/\\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
            if (node.id) {
                const label = document.querySelector('label[for="' + CSS.escape(node.id) + '"]');
                if (label) return label.textContent.trim();
            }
            return (node.textContent || '').trim();
        };
        const rgb = value => {
            const match = String(value).match(/[\\d.]+/g);
            return match ? match.slice(0, 3).map(Number) : [0, 0, 0];
        };
        const luminance = color => rgb(color).map(value => {
            const channel = value / 255;
            return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
        const contrast = (fg, bg) => {
            const a = luminance(fg), b = luminance(bg);
            return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        };
        const effectiveBackground = node => {
            let current = node;
            while (current) {
                const value = getComputedStyle(current).backgroundColor;
                if (value && !/rgba?\\(0, 0, 0(?:, 0)?\\)/.test(value) && value !== 'transparent') return value;
                current = current.parentElement;
            }
            return 'rgb(255, 255, 255)';
        };
        const scope = document.getElementById('login-view');
        const controls = [...scope.querySelectorAll('button,a[href],input,select,textarea')].filter(visible);
        const keyText = ['#login-heading', 'label[for="login-employee-id"]', 'label[for="login-password"]', '#first-login-hint p', '#login-support-title']
            .map(selector => document.querySelector(selector)).filter(Boolean).map(node => ({
                selector: node.id ? '#' + node.id : node.getAttribute('for') ? 'label[for="' + node.getAttribute('for') + '"]' : node.tagName,
                ratio: Number(contrast(getComputedStyle(node).color, effectiveBackground(node)).toFixed(2)),
            }));
        const navigation = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        const resources = performance.getEntriesByType('resource');
        return {
            lang: document.documentElement.lang,
            landmark: { role: document.getElementById('login-overlay')?.getAttribute('role'), label: document.getElementById('login-overlay')?.getAttribute('aria-labelledby'), hidden: document.getElementById('login-overlay')?.getAttribute('aria-hidden') },
            form: { labelledby: document.getElementById('login-form')?.getAttribute('aria-labelledby'), describedby: document.getElementById('login-form')?.getAttribute('aria-describedby') },
            labels: ['login-employee-id', 'login-password'].map(id => document.querySelector('label[for="' + id + '"]')?.textContent.trim() || ''),
            activeElement: document.activeElement?.id || '',
            unnamed: controls.filter(node => !accessibleName(node)).map(node => node.outerHTML.slice(0, 140)),
            smallTargets: controls.map(node => { const box = node.getBoundingClientRect(); return { name: accessibleName(node), width: Math.round(box.width), height: Math.round(box.height) }; }).filter(row => row.width < 44 || row.height < 44),
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
            focusOutline: getComputedStyle(document.getElementById('login-employee-id')).outlineStyle,
            errorRole: document.getElementById('login-error')?.getAttribute('role'),
            errorLive: document.getElementById('login-error')?.getAttribute('aria-live'),
            toggle: { pressed: document.getElementById('toggle-password-btn')?.getAttribute('aria-pressed'), label: document.getElementById('toggle-password-btn')?.getAttribute('aria-label') },
            reducedMotionDuration: getComputedStyle(document.querySelector('#login-overlay .animate-pulse')).animationDuration,
            keyText,
            brokenImages: [...document.images].filter(image => visible(image) && image.complete && image.naturalWidth === 0).length,
            domNodes: document.getElementsByTagName('*').length,
            performance: {
                domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
                loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
                fcpMs: Math.round(paint.find(row => row.name === 'first-contentful-paint')?.startTime || 0),
                resourceCount: resources.length,
                scriptCount: resources.filter(row => row.initiatorType === 'script').length,
                styleCount: resources.filter(row => row.initiatorType === 'link' && /\\.css(?:\\?|$)/.test(row.name)).length,
                duplicateCriticalResources: [...new Set(resources.filter(row => /\\.(?:m?js|css)(?:\\?|$)/i.test(row.name)).map(row => row.name).filter((name, index, all) => all.indexOf(name) !== index))],
                loginPanelBackgroundImage: getComputedStyle(document.getElementById('login-brand-panel')).backgroundImage,
                loginPanelHasCustomBackground: document.getElementById('login-brand-panel').classList.contains('has-custom-background'),
            },
            runtimeErrors: window.__loginA11yErrors || [],
            parserBlockingHeadScripts: [...document.head.querySelectorAll('script[src]:not([type="module"])')].filter(script => !script.defer && !script.async).map(script => script.src),
        };
    })()`);

    assert.strictEqual(state.lang, 'th');
    assert.deepStrictEqual(state.landmark, { role: 'main', label: 'login-heading', hidden: 'false' });
    assert.strictEqual(state.form.labelledby, 'login-heading');
    assert.ok(state.form.describedby.includes('first-login-hint') && state.form.describedby.includes('login-error'));
    assert.ok(state.labels.every(Boolean), 'Login inputs must have explicit labels');
    assert.strictEqual(state.activeElement, 'login-employee-id');
    assert.deepStrictEqual(state.unnamed, [], `Visible controls missing accessible names: ${JSON.stringify(state.unnamed)}`);
    assert.deepStrictEqual(state.smallTargets, [], `Visible Login controls below 44px: ${JSON.stringify(state.smallTargets)}`);
    assert.strictEqual(state.horizontalOverflow, false);
    assert.notStrictEqual(state.focusOutline, 'none');
    assert.strictEqual(state.errorRole, 'alert');
    assert.strictEqual(state.errorLive, 'assertive');
    assert.deepStrictEqual(state.toggle, { pressed: 'false', label: 'แสดงรหัสผ่าน' });
    assert.ok(state.keyText.every(row => row.ratio >= 4.5), `Text contrast below 4.5:1: ${JSON.stringify(state.keyText)}`);
    assert.strictEqual(state.brokenImages, 0);
    assert.deepStrictEqual(state.runtimeErrors, []);
    assert.deepStrictEqual(state.parserBlockingHeadScripts, []);
    assert.ok(state.domNodes < 1400, `Login DOM budget exceeded: ${state.domNodes}`);
    assert.ok(state.performance.scriptCount <= 30, `Login script budget exceeded: ${state.performance.scriptCount}`);
    assert.ok(state.performance.domContentLoadedMs < 15000, `DOMContentLoaded budget exceeded: ${state.performance.domContentLoadedMs}ms`);
    assert.ok(state.performance.loadMs < 15000, `Load budget exceeded: ${state.performance.loadMs}ms`);
    assert.ok(state.performance.fcpMs === 0 || state.performance.fcpMs < 6000, `FCP budget exceeded: ${state.performance.fcpMs}ms`);
    assert.deepStrictEqual(state.performance.duplicateCriticalResources, []);
    if (viewport.width < 768) {
        assert.strictEqual(state.performance.loginPanelHasCustomBackground, false, 'Desktop login background must remain deferred on mobile');
        assert.ok(!state.performance.loginPanelBackgroundImage.includes('url('), 'Mobile Login panel must not receive a desktop background URL');
    }
    if (viewport.reducedMotion) assert.ok(parseFloat(state.reducedMotionDuration) <= 0.01, `Reduced motion not honored: ${state.reducedMotionDuration}`);

    await evaluate(`document.getElementById('login-password').value='secret'; document.getElementById('toggle-password-btn').click()`);
    const toggleAfter = await evaluate(`({ pressed: document.getElementById('toggle-password-btn').getAttribute('aria-pressed'), label: document.getElementById('toggle-password-btn').getAttribute('aria-label'), type: document.getElementById('login-password').type })`);
    assert.deepStrictEqual(toggleAfter, { pressed: 'true', label: 'ซ่อนรหัสผ่าน', type: 'text' });

    await evaluate(`document.getElementById('login-employee-id').focus()`);
    await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const tabDestination = await evaluate(`document.activeElement?.id || ''`);
    assert.strictEqual(tabDestination, 'login-password');

    if (viewport.name === '390x844' || viewport.name === '1366x768') await screenshot(`login-${viewport.name}.png`);
    return { ...viewport, ...state, toggleAfter, tabDestination };
}

(async () => {
    server = await new Promise((resolve, reject) => {
        const instance = app.listen(apiPort, '127.0.0.1', () => resolve(instance));
        instance.on('error', reject);
    });
    await connectBrowser();
    const viewports = [
        { name: '390x844', width: 390, height: 844, reducedMotion: false },
        { name: '430x932', width: 430, height: 932, reducedMotion: true },
        { name: '768x1024', width: 768, height: 1024, reducedMotion: false },
        { name: '1366x768', width: 1366, height: 768, reducedMotion: false },
        { name: '1920x1080', width: 1920, height: 1080, reducedMotion: false },
    ];
    const results = [];
    for (const viewport of viewports) results.push(await auditViewport(viewport));
    assert.deepStrictEqual(browserErrors, []);
    assert.deepStrictEqual(failedRequests, []);
    const result = {
        executedAt: new Date().toISOString(),
        productionConnected: false,
        authenticated: false,
        mutations: false,
        externalNotificationDelivery: false,
        budgets: { domContentLoadedMs: 15000, loadMs: 15000, fcpMs: 6000, domNodes: 1400, scripts: 30, touchTargetPx: 44, contrastRatio: 4.5 },
        viewports: results,
        browserErrors,
        failedRequests,
        passed: true,
    };
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2));
    console.log('PASS Login accessibility/performance Browser UAT: five viewports, keyboard/focus/live regions/contrast/touch/reduced-motion and performance budgets');
    console.log(`ARTIFACT ${artifactDir}`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    try { client?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    if (server) await new Promise(resolve => server.close(resolve));
    await db.end().catch(() => {});
    await fs.promises.rm(profileDir, { recursive: true, force: true }).catch(() => {});
});
