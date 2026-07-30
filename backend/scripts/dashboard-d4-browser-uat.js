'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyEligibilityVariants } = require('./personal-target-test-users');

const apiPort = Number(process.env.DASHBOARD_D5_API_PORT || 5015);
const apiBaseUrl = `http://localhost:${apiPort}`;
const frontendUrl = String(process.env.LOCAL_FRONTEND_URL || 'http://localhost/tsh-safety-core').replace(/\/+$/, '');
const chromePath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cdpPort = Number(process.env.DASHBOARD_D5_CDP_PORT || process.env.DASHBOARD_D4_CDP_PORT || 9814);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-dashboard-d5-'));
const artifactDir = path.join(
    path.resolve(__dirname, '..', '..'),
    'backups',
    'local',
    `dashboard-d5-browser-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let client;
let server;

class Cdp {
    constructor(url) {
        this.nextId = 1;
        this.pending = new Map();
        this.socket = new WebSocket(url);
    }
    async connect() {
        this.socket.addEventListener('message', async event => {
            let raw = event.data;
            if (raw && typeof raw.text === 'function') raw = await raw.text();
            if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
            const message = JSON.parse(String(raw));
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
    close() {
        try { this.socket.close(); } catch (_) {}
    }
}

async function evaluate(expression) {
    const result = await client.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
}

async function waitFor(expression, timeout = 45000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (await evaluate(expression)) return;
        await sleep(300);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
}

async function screenshot(name) {
    const result = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(artifactDir, name), Buffer.from(result.data, 'base64'));
}

async function connectBrowser() {
    browser = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--window-size=1600,1000',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ], { stdio: 'ignore', windowsHide: true });
    let targets;
    for (let index = 0; index < 60; index += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
            if (response.ok) {
                targets = await response.json();
                break;
            }
        } catch (_) {}
        await sleep(250);
    }
    const page = targets?.find(target => target.type === 'page');
    assert.ok(page?.webSocketDebuggerUrl, 'Chrome CDP target unavailable');
    client = new Cdp(page.webSocketDebuggerUrl);
    await client.connect();
    await client.command('Page.enable');
    await client.command('Runtime.enable');
    await client.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.API_BASE=${JSON.stringify(`${apiBaseUrl}/api`)};`,
    });
}

async function browserState() {
    return evaluate(`(() => ({
        cards: [...document.querySelectorAll('#db-module-cards a')].map(card => ({
            key: (card.getAttribute('href') || '').replace(/^#/, ''),
            status: card.querySelector('span.inline-flex.mt-2')?.textContent.trim() || '',
            primary: card.querySelector('p.text-3xl')?.textContent.trim() || ''
        })),
        summary: document.querySelector('#db-module-cards > div')?.innerText || '',
        policyTarget: document.body.innerText.includes('Safety Policy Acknowledgement'),
        companyBaselineOnly: document.body.innerText.includes('Company baseline only'),
        targetRows: document.querySelectorAll('#db-my-targets .divide-y > div').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }))()`);
}

const expectedLabels = {
    DATA_UNAVAILABLE: 'Data unavailable',
    CRITICAL: 'Critical',
    WATCH: 'Watch',
    ON_TRACK: 'On Track',
    N_A: 'N/A',
};

async function loadDashboardVariant(name, variant) {
    if (!variant) return { name, available: false, skipped: true };
    const token = jwt.sign(variant.user, process.env.JWT_SECRET, { expiresIn: '10m' });
    const [overviewResponse, targetResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/dashboard/overview`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBaseUrl}/api/activity-targets/me`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const overviewBody = await overviewResponse.json();
    const targetBody = await targetResponse.json();
    assert.strictEqual(overviewResponse.status, 200, `${name}: Dashboard overview API`);
    assert.strictEqual(targetResponse.status, 200, `${name}: Personal Target API`);
    const overview = overviewBody.data;
    const personalTargets = targetBody.data;
    const destination = `${frontendUrl}/?d5v=${encodeURIComponent(name)}&ts=${Date.now()}#dashboard`;
    await evaluate(`(() => {
        localStorage.setItem('tsh_token', ${JSON.stringify(token)});
        localStorage.setItem('tsh_user', ${JSON.stringify(JSON.stringify(variant.user))});
        location.href = ${JSON.stringify(destination)};
        return true;
    })()`);
    await waitFor(
        `location.search.includes(${JSON.stringify(`d5v=${encodeURIComponent(name)}`)})`
        + ` && document.querySelectorAll('#db-module-cards a').length === 15`
        + ` && document.body.innerText.includes('Safety Policy Acknowledgement')`
    );

    const state = await browserState();
    assert.strictEqual(state.cards.length, 15, `${name}: Module Health cards`);
    for (const card of state.cards) {
        assert.strictEqual(
            card.status,
            expectedLabels[overview.moduleMetrics[card.key].status],
            `${name}/${card.key}: browser/API canonical status`
        );
    }
    assert.ok(
        state.summary.includes('Unavailable') && state.summary.includes('N/A'),
        `${name}: canonical summary signals`
    );
    assert.strictEqual(state.policyTarget, true, `${name}: mandatory Policy target rendered`);
    assert.strictEqual(
        state.companyBaselineOnly,
        !personalTargets.eligibility.hasAdditionalConfiguredTargets,
        `${name}: baseline-only notice`
    );
    assert.strictEqual(
        state.targetRows,
        personalTargets.targets.length,
        `${name}: rendered/API Personal Target count`
    );
    assert.strictEqual(state.horizontalOverflow, false, `${name}: horizontal overflow`);
    return {
        name,
        available: true,
        skipped: false,
        state,
        eligibility: personalTargets.eligibility,
        expectedStatuses: Object.fromEntries(
            Object.entries(overview.moduleMetrics).map(([key, metric]) => [key, metric.status])
        ),
    };
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    assert.ok(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
    fs.mkdirSync(artifactDir, { recursive: true });
    const variants = await loadReadyEligibilityVariants(db);
    assert.ok(variants.configured || variants.baselineOnly, 'A READY eligibility variant is required');
    server = await new Promise((resolve, reject) => {
        const instance = app.listen(apiPort, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
    await connectBrowser();
    await client.command('Page.navigate', { url: `${frontendUrl}/?d4=${Date.now()}` });
    await waitFor(`document.readyState === 'complete'`);

    const configuredDesktop = await loadDashboardVariant('configured-desktop', variants.configured);
    if (configuredDesktop.available) {
        await evaluate(`document.getElementById('db-module-cards').scrollIntoView({block:'start'}); true`);
        await sleep(300);
        await screenshot('desktop-module-health.png');
        await evaluate(`document.getElementById('db-my-targets').scrollIntoView({block:'center'}); true`);
        await sleep(300);
        await screenshot('desktop-personal-targets-configured.png');
    }
    const baselineDesktop = await loadDashboardVariant('baseline-only-desktop', variants.baselineOnly);
    if (baselineDesktop.available) {
        if (!configuredDesktop.available) {
            await evaluate(`document.getElementById('db-module-cards').scrollIntoView({block:'start'}); true`);
            await sleep(300);
            await screenshot('desktop-module-health.png');
        }
        await evaluate(`document.getElementById('db-my-targets').scrollIntoView({block:'center'}); true`);
        await sleep(300);
        await screenshot('desktop-personal-targets-baseline-only.png');
    }

    await client.command('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
    });
    await sleep(500);
    const mobile = await loadDashboardVariant(
        configuredDesktop.available ? 'configured-mobile' : 'baseline-only-mobile',
        configuredDesktop.available ? variants.configured : variants.baselineOnly
    );
    await evaluate(`document.getElementById('db-module-cards').scrollIntoView({block:'start'}); true`);
    await sleep(300);
    await screenshot('mobile-module-health.png');

    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify({
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        readyEligibilityAvailability: variants.counts,
        configuredDesktop,
        baselineDesktop,
        mobile,
        passed: true,
    }, null, 2));
    console.log('PASS Dashboard D5 authenticated browser UAT: 15/15 canonical statuses, both READY eligibility variants, desktop/mobile overflow');
    console.log(`ARTIFACT ${artifactDir}`);
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        client?.close();
        if (browser && !browser.killed) browser.kill();
        if (server) await new Promise(resolve => server.close(resolve));
        await db.end();
        await sleep(300);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    });
