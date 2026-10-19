'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const app = require('../server');
const appUrl = process.env.APP_BOOTSTRAP_UAT_URL || 'http://127.0.0.1/tsh-safety-core/index.html';
const evidenceDir = path.join(
    __dirname,
    '..',
    '..',
    'backups',
    'local',
    `app-bootstrap-network-${new Date().toISOString().replace(/[:.]/g, '')}`,
);

const profiles = {
    fast3g: { latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 },
    slow3g: { latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 },
};
const viewports = {
    mobile: { width: 390, height: 844 },
    desktop: { width: 1366, height: 768 },
};

function startServer() {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

async function login(apiBase) {
    const employeeId = process.env.PROD_UAT_USER_ID;
    const password = process.env.PROD_UAT_USER_PASSWORD;
    assert(employeeId && password, 'Local UAT user credentials are required');
    const response = await fetch(`${apiBase}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    const body = await response.json().catch(() => ({}));
    assert.equal(response.status, 200, `Local UAT login failed (${response.status})`);
    assert(body.success && body.token && body.user, 'Local UAT login response is incomplete');
    return { token: body.token, user: body.user };
}

async function runCase(browser, apiBase, session, networkName, authName, viewportName) {
    const context = await browser.newContext({
        viewport: viewports[viewportName],
        serviceWorkers: 'block',
        reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const profile = profiles[networkName];
    const label = `${networkName}-${authName}-${viewportName}`;
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const httpErrors = [];
    let cssDelivery = null;

    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText || '' }));
    page.on('response', response => {
        if (response.status() >= 400) httpErrors.push({ status: response.status(), url: response.url() });
    });
    cdp.on('Network.responseReceived', event => {
        if (event.response.url.includes('/public/tailwind.production.css')) {
            cssDelivery = {
                status: event.response.status,
                fromDiskCache: Boolean(event.response.fromDiskCache),
                fromServiceWorker: Boolean(event.response.fromServiceWorker),
            };
        }
    });
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: profile.latency,
        downloadThroughput: profile.downloadThroughput,
        uploadThroughput: profile.uploadThroughput,
        connectionType: 'cellular3g',
    });
    await page.addInitScript(({ base, auth, storedSession }) => {
        window.API_BASE = base;
        localStorage.clear();
        sessionStorage.clear();
        if (auth) {
            localStorage.setItem('tsh_token', storedSession.token);
            localStorage.setItem('tsh_user', JSON.stringify(storedSession.user));
        }
    }, { base: apiBase, auth: authName === 'authenticated', storedSession: session });

    const started = Date.now();
    try {
        await page.goto(`${appUrl}?network_uat=${encodeURIComponent(label)}`, { waitUntil: 'commit', timeout: 30000 });
        await page.locator('#app-bootstrap').waitFor({ state: 'attached', timeout: 30000 });
        const bootstrapVisibleMs = Date.now() - started;
        const firstPaint = await page.evaluate(() => ({
            state: document.documentElement.dataset.appBootstrap,
            visible: getComputedStyle(document.getElementById('app-bootstrap')).visibility === 'visible',
            message: document.getElementById('app-bootstrap-message')?.textContent?.trim() || '',
        }));
        await page.screenshot({ path: path.join(evidenceDir, `${label}-loading.png`) });

        await page.waitForFunction(
            () => ['ready', 'error'].includes(document.documentElement.dataset.appBootstrap),
            null,
            { timeout: 120000 },
        );
        const settledMs = Date.now() - started;
        const settled = await page.evaluate(authenticated => {
            const root = document.documentElement;
            const login = document.getElementById('login-overlay');
            const appContainer = document.getElementById('app-container');
            const brandPanel = document.getElementById('login-brand-panel');
            const expected = authenticated ? appContainer : login;
            const rect = expected?.getBoundingClientRect();
            return {
                state: root.dataset.appBootstrap,
                loginVisible: Boolean(login && !login.classList.contains('hidden')),
                appVisible: Boolean(appContainer && !appContainer.classList.contains('hidden')),
                expectedDisplay: expected ? getComputedStyle(expected).display : null,
                expectedPosition: expected ? getComputedStyle(expected).position : null,
                overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
                expectedWidth: rect?.width || 0,
                viewportWidth: window.innerWidth,
                localCssLoaded: [...document.styleSheets].some(sheet => sheet.href?.includes('/public/tailwind.production.css')),
                externalTailwindLoaded: [...document.scripts].some(script => script.src.includes('cdn.tailwindcss.com')),
                brandPanelDisplay: brandPanel ? getComputedStyle(brandPanel).display : null,
                brandPanelBackground: brandPanel ? getComputedStyle(brandPanel).backgroundImage : '',
                vendorAssets: [...document.querySelectorAll('[data-vendor]')].map(node => node.dataset.vendor).sort(),
            };
        }, authName === 'authenticated');
        await page.waitForTimeout(300);
        const bootstrapRemoved = await page.locator('#app-bootstrap').count() === 0;
        await page.screenshot({ path: path.join(evidenceDir, `${label}-settled.png`) });

        assert.equal(firstPaint.state, 'loading', `${label}: bootstrap should own first paint`);
        assert.equal(firstPaint.visible, true, `${label}: bootstrap was not visible`);
        assert.equal(settled.state, 'ready', `${label}: bootstrap entered error state`);
        assert.equal(settled.loginVisible, authName === 'anonymous', `${label}: incorrect login visibility`);
        assert.equal(settled.appVisible, authName === 'authenticated', `${label}: incorrect app visibility`);
        assert.notEqual(settled.expectedDisplay, 'none', `${label}: real screen is not rendered`);
        assert.equal(settled.overflow, false, `${label}: horizontal overflow detected`);
        assert(settled.expectedWidth > 0 && settled.expectedWidth <= settled.viewportWidth + 2, `${label}: invalid responsive width`);
        assert.equal(settled.localCssLoaded, true, `${label}: local CSS was not loaded`);
        assert.equal(settled.externalTailwindLoaded, false, `${label}: Tailwind CDN script is present`);
        assert.equal(settled.brandPanelDisplay === 'none', viewportName === 'mobile', `${label}: Login branding breakpoint is incorrect`);
        if (authName === 'anonymous') assert.deepEqual(settled.vendorAssets, [], `${label}: Login bootstrap loaded route-only vendors`);
        assert.equal(bootstrapRemoved, true, `${label}: bootstrap overlay was not removed after transition`);
        assert.deepEqual(cssDelivery, { status: 200, fromDiskCache: false, fromServiceWorker: false }, `${label}: CSS did not bypass caches`);
        assert.deepEqual(pageErrors, [], `${label}: page errors: ${pageErrors.join(' | ')}`);

        return {
            label,
            bootstrapVisibleMs,
            settledMs,
            state: settled.state,
            target: authName === 'authenticated' ? 'app' : 'login',
            viewport: viewports[viewportName],
            cacheDisabled: true,
            cssDelivery,
            brandPanelDisplay: settled.brandPanelDisplay,
            brandPanelBackground: settled.brandPanelBackground,
            vendorAssets: settled.vendorAssets,
            consoleErrors: consoleErrors.length,
            consoleErrorSamples: consoleErrors.slice(0, 8),
            pageErrors: pageErrors.length,
            failedRequests: failedRequests.length,
            failedRequestSamples: failedRequests.slice(0, 8),
            httpErrors: httpErrors.slice(0, 12),
        };
    } finally {
        await context.close();
    }
}

async function main() {
    fs.mkdirSync(evidenceDir, { recursive: true });
    const server = await startServer();
    const apiBase = `http://127.0.0.1:${server.address().port}/api`;
    const browser = await chromium.launch({ headless: true });
    const results = [];
    try {
        const session = await login(apiBase);
        const caseFilter = String(process.env.APP_BOOTSTRAP_UAT_FILTER || '').trim();
        for (const networkName of Object.keys(profiles)) {
            for (const authName of ['anonymous', 'authenticated']) {
                for (const viewportName of Object.keys(viewports)) {
                    const label = `${networkName}-${authName}-${viewportName}`;
                    if (caseFilter && !label.includes(caseFilter)) continue;
                    const result = await runCase(browser, apiBase, session, networkName, authName, viewportName);
                    results.push(result);
                    console.log(`PASS ${result.label} ready=${result.settledMs}ms`);
                }
            }
        }
        const report = {
            contract: '2026-10-19-app-bootstrap-network-r1',
            generatedAt: new Date().toISOString(),
            appUrl,
            credentialsRecorded: false,
            tokenRecorded: false,
            cases: results,
        };
        fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
        console.log(`App bootstrap network Browser UAT: PASS (${results.length}/${caseFilter ? results.length : 8} cases)`);
        console.log(`Evidence: ${evidenceDir}`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error);
    process.exit(1);
});
