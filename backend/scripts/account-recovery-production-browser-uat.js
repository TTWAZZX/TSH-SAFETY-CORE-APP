'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const browserPath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.ACCOUNT_RECOVERY_PROD_CDP_PORT || 9872);
const evidenceDir = String(process.env.ACCOUNT_RECOVERY_PROD_EVIDENCE_DIR || '').trim();
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-account-recovery-prod-'));
const pending = new Map();
const consoleErrors = [];
const failedApiResponses = [];
const mutationRequests = [];
const readOnlyPostRequests = [];
let nextId = 1;
let browser;
let socket;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function command(method, params = {}, timeout = 60000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
        }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const response = await command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
}

async function waitFor(expression, timeout = 60000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
}

async function login() {
    const response = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ employeeId: adminId, password: adminPassword }),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) {}
    assert.strictEqual(response.status, 200, `Admin login failed: ${text.slice(0, 300)}`);
    assert.ok(payload?.token && payload?.user, 'Admin session missing');
    return payload;
}

async function connectBrowser() {
    browser = spawn(browserPath, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
        '--disable-extensions', '--no-first-run', '--no-default-browser-check',
        '--remote-allow-origins=*', '--window-size=1440,1000',
        `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });

    let targets;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) { targets = await response.json(); break; }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Browser page target unavailable');
    socket = new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:', '://127.0.0.1:'));
    socket.addEventListener('message', async event => {
        let raw = event.data;
        if (raw && typeof raw.text === 'function') raw = await raw.text();
        if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
        const message = JSON.parse(String(raw));
        if (message.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
            consoleErrors.push((message.params.args || []).map(item => item.value || item.description || '').join(' '));
        }
        if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
            consoleErrors.push(message.params.entry.text || 'Browser log error');
        }
        if (message.method === 'Network.requestWillBeSent') {
            const request = message.params?.request || {};
            const method = String(request.method || '').toUpperCase();
            const requestUrl = String(request.url || '');
            if (method === 'POST' && requestUrl.includes('/api/session/verify')) {
                readOnlyPostRequests.push(`${method} ${requestUrl}`);
            } else if (requestUrl.includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                mutationRequests.push(`${method} ${requestUrl}`);
            }
        }
        if (message.method === 'Network.responseReceived') {
            const response = message.params?.response || {};
            if (Number(response.status || 0) >= 400 && String(response.url || '').includes('/api/')) {
                failedApiResponses.push(`${response.status} ${response.url}`);
            }
        }
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        clearTimeout(waiter.timer);
        message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Log.enable');
    await command('Network.enable');
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    assert.ok(fs.existsSync(browserPath), `Browser not found: ${browserPath}`);
    const session = await login();
    await connectBrowser();

    await command('Page.navigate', { url: `${baseUrl}/index.html?account_recovery_uat=${Date.now()}` });
    await waitFor("document.readyState==='complete' && document.querySelector('#forgot-password-btn')");
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate("document.querySelector('#forgot-password-btn').click()");
    await waitFor("document.querySelector('#forgot-password-form')");
    await sleep(350);
    const forgot = await evaluate(`(() => {
        const form=document.querySelector('#forgot-password-form');
        const submit=document.querySelector('#forgot-password-submit');
        return {form:Boolean(form),employeeId:Boolean(document.querySelector('#forgot-password-employee-id')),
            submitHeight:submit?.getBoundingClientRect().height||0,
            overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
    })()`);
    assert.deepStrictEqual({ form: forgot.form, employeeId: forgot.employeeId, overflow: forgot.overflow }, { form: true, employeeId: true, overflow: false });
    assert.ok(forgot.submitHeight >= 43, `Forgot Password submit touch target is too small: ${forgot.submitHeight}px`);

    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(session.token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(session.user))});
        location.href=${JSON.stringify(`${baseUrl}/index.html?account_recovery_uat=${Date.now()}#dashboard`)};
        return true;
    })()`);
    await waitFor("document.querySelector('#open-profile-btn')");
    await evaluate("document.querySelector('#open-profile-btn').click()");
    await waitFor("document.querySelector('#pf-company-email-submit')");

    const profileResults = [];
    for (const [width, height] of [[1440, 1000], [1024, 768], [390, 844]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(300);
        profileResults.push(await evaluate(`(() => {
            const drawer=document.querySelector('#profile-drawer');
            const submit=document.querySelector('#pf-company-email-submit');
            return {width:${width},companyEmail:drawer?.textContent.includes('Email')||false,
                input:Boolean(document.querySelector('#pf-company-email')),password:Boolean(document.querySelector('#pf-company-email-password')),
                submitHeight:submit?.getBoundingClientRect().height||0,
                overflow:drawer ? drawer.scrollWidth>drawer.clientWidth+2 : true};
        })()`));
    }
    for (const result of profileResults) {
        assert.equal(result.companyEmail, true, `${result.width}: Company Email section missing`);
        assert.equal(result.input, true, `${result.width}: Company Email input missing`);
        assert.equal(result.password, true, `${result.width}: re-auth input missing`);
        assert.ok(result.submitHeight >= 43, `${result.width}: Company Email action too small`);
        assert.equal(result.overflow, false, `${result.width}: Profile drawer overflows`);
    }

    await evaluate(`location.hash='#admin'; true`);
    await waitFor("location.hash==='#admin' && typeof window._adminTab==='function'");
    await evaluate("void window._adminTab('employees'); true");
    await waitFor("document.querySelector('[data-employee-mobile-list]') && document.querySelector('[data-employee-desktop-table]')");
    const employeeResults = [];
    for (const [width, height] of [[1440, 1000], [1024, 768], [400, 724], [390, 844]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
        await sleep(350);
        employeeResults.push(await evaluate(`(() => {
            const mobile=document.querySelector('[data-employee-mobile-list]');
            const desktop=document.querySelector('[data-employee-desktop-table]');
            const cards=[...document.querySelectorAll('[data-employee-card]')];
            const actionButtons=[...(${width}<768?mobile:desktop).querySelectorAll('button')];
            return {width:${width},mobileVisible:getComputedStyle(mobile).display!=='none',desktopVisible:getComputedStyle(desktop).display!=='none',
                cards:cards.length,companyEmail:mobile.textContent.includes('Company Email'),readiness:mobile.textContent.includes('Email Readiness'),
                minActionHeight:actionButtons.length?Math.min(...actionButtons.map(button=>button.getBoundingClientRect().height)):0,
                overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
        })()`));
    }
    for (const result of employeeResults) {
        const mobile = result.width < 768;
        assert.equal(result.mobileVisible, mobile, `${result.width}: mobile card visibility mismatch`);
        assert.equal(result.desktopVisible, !mobile, `${result.width}: desktop table visibility mismatch`);
        assert.ok(result.cards > 0, `${result.width}: employee cards missing`);
        assert.equal(result.companyEmail, true, `${result.width}: Company Email missing from cards`);
        assert.equal(result.readiness, true, `${result.width}: Email Readiness missing from cards`);
        if (mobile) {
            assert.ok(result.minActionHeight >= 43, `${result.width}: employee action target too small: ${result.minActionHeight}px`);
        }
        assert.equal(result.overflow, false, `${result.width}: page overflows horizontally`);
    }

    assert.deepStrictEqual(mutationRequests, [], `Production Browser UAT must remain read-only: ${mutationRequests.join(' | ')}`);
    assert.deepStrictEqual(failedApiResponses, [], `Failed API responses: ${failedApiResponses.join(' | ')}`);
    assert.deepStrictEqual(consoleErrors, [], `Browser console errors: ${consoleErrors.join(' | ')}`);

    const result = {
        success: true,
        forgotPassword: forgot,
        profile: profileResults,
        employeeMaster: employeeResults,
        mutationRequests,
        readOnlyPostRequests,
        failedApiResponses,
        consoleErrors,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
    };
    if (evidenceDir) {
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.writeFileSync(path.join(evidenceDir, 'production-browser-readonly.json'), `${JSON.stringify(result, null, 2)}\n`);
    }
    console.log(`Account Recovery Production Browser UAT passed: Profile 3 viewports, Employee Master 4 viewports, zero writes/errors.`);
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
}).finally(async () => {
    try { socket?.close(); } catch (_) {}
    try { browser?.kill(); } catch (_) {}
    await sleep(300);
    fs.rmSync(profileDir, { recursive: true, force: true });
});
