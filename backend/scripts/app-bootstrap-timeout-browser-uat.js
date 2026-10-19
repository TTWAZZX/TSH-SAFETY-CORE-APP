'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');

const appUrl = 'http://127.0.0.1/tsh-safety-core/index.html';

async function main() {
    let brandingRequests = 0;
    const server = http.createServer((request, response) => {
        response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        if (request.method === 'OPTIONS') { response.statusCode = 204; response.end(); return; }
        if (request.url === '/api/public/branding') {
            brandingRequests += 1;
            if (brandingRequests === 1) return;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ success: true, data: { appName: 'TSH Safety Core' } }));
            return;
        }
        if (request.url === '/api/session/verify') {
            if (request.headers.authorization === 'Bearer timeout-token') return;
            response.statusCode = 401;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ success: false, message: 'Invalid session' }));
            return;
        }
        response.statusCode = 404;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ success: false }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const apiBase = `http://127.0.0.1:${server.address().port}/api`;
    const browser = await chromium.launch({ headless: true });
    try {
        const brandingPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const brandingRequests = [];
        brandingPage.on('request', request => brandingRequests.push(request.url()));
        await brandingPage.addInitScript(base => { window.API_BASE = base; }, apiBase);
        const brandingStarted = Date.now();
        await brandingPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
        await brandingPage.waitForFunction(() => document.documentElement.dataset.appBootstrap === 'ready', null, { timeout: 7000 });
        const branding = await brandingPage.evaluate(() => ({
            state: document.documentElement.dataset.appBootstrap,
            loginVisible: !document.getElementById('login-overlay').classList.contains('hidden'),
            bootstrapRemoved: !document.getElementById('app-bootstrap'),
            title: document.title,
            surfaceAnimationName: getComputedStyle(document.getElementById('login-overlay')).animationName,
            surfaceAnimationDuration: getComputedStyle(document.getElementById('login-overlay')).animationDuration,
            loginPosition: getComputedStyle(document.getElementById('login-overlay')).position,
            loginDisplay: getComputedStyle(document.getElementById('login-overlay')).display,
            localCssLoaded: [...document.styleSheets].some(sheet => sheet.href?.includes('/public/tailwind.production.css')),
        }));
        branding.elapsedMs = Date.now() - brandingStarted;
        assert.equal(branding.state, 'ready');
        assert.equal(branding.loginVisible, true);
        assert.equal(branding.title, 'TSH Safety Core');
        assert.equal(branding.surfaceAnimationName, 'app-surface-enter');
        assert.equal(branding.surfaceAnimationDuration, '0.18s');
        assert.equal(branding.loginPosition, 'fixed');
        assert.equal(branding.loginDisplay, 'flex');
        assert.equal(branding.localCssLoaded, true);
        assert(brandingRequests.some(url => url.includes('/public/tailwind.production.css')), 'Local Tailwind CSS was not requested');
        assert(!brandingRequests.some(url => url.includes('cdn.tailwindcss.com')), 'Tailwind CDN must not be requested');
        assert(branding.elapsedMs >= 3500 && branding.elapsedMs < 7000, `Unexpected branding timeout ${branding.elapsedMs}ms`);
        await brandingPage.close();

        const reducedMotionPage = await browser.newPage({
            viewport: { width: 390, height: 844 },
            reducedMotion: 'reduce',
        });
        await reducedMotionPage.addInitScript(base => { window.API_BASE = base; }, apiBase);
        await reducedMotionPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
        await reducedMotionPage.waitForFunction(() => document.documentElement.dataset.appBootstrap === 'ready', null, { timeout: 5000 });
        const reducedMotion = await reducedMotionPage.evaluate(() => ({
            loginVisible: !document.getElementById('login-overlay').classList.contains('hidden'),
            surfaceAnimationName: getComputedStyle(document.getElementById('login-overlay')).animationName,
        }));
        assert.deepEqual(reducedMotion, { loginVisible: true, surfaceAnimationName: 'none' });
        await reducedMotionPage.close();

        const timeoutPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
        await timeoutPage.addInitScript(({ base }) => {
            window.API_BASE = base;
            localStorage.setItem('tsh_token', 'timeout-token');
            localStorage.setItem('tsh_user', JSON.stringify({ id: 'UAT' }));
        }, { base: apiBase });
        const sessionStarted = Date.now();
        await timeoutPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
        await timeoutPage.waitForFunction(() => document.documentElement.dataset.appBootstrap === 'error', null, { timeout: 11000 });
        const sessionTimeout = await timeoutPage.evaluate(() => ({
            state: document.documentElement.dataset.appBootstrap,
            tokenPreserved: localStorage.getItem('tsh_token') === 'timeout-token',
            retryVisible: getComputedStyle(document.querySelector('.app-bootstrap__retry')).display !== 'none',
            message: document.getElementById('app-bootstrap-message')?.textContent || '',
        }));
        sessionTimeout.elapsedMs = Date.now() - sessionStarted;
        assert.equal(sessionTimeout.tokenPreserved, true);
        assert.equal(sessionTimeout.retryVisible, true);
        assert.match(sessionTimeout.message, /ตรวจสอบการเข้าสู่ระบบใช้เวลานานเกินไป/);
        assert(sessionTimeout.elapsedMs >= 7500 && sessionTimeout.elapsedMs < 11000, `Unexpected session timeout ${sessionTimeout.elapsedMs}ms`);
        await timeoutPage.close();

        const invalidPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await invalidPage.addInitScript(({ base }) => {
            window.API_BASE = base;
            localStorage.setItem('tsh_token', 'invalid-token');
            localStorage.setItem('tsh_user', JSON.stringify({ id: 'UAT' }));
        }, { base: apiBase });
        await invalidPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
        await invalidPage.waitForFunction(() => document.documentElement.dataset.appBootstrap === 'ready', null, { timeout: 5000 });
        const invalid = await invalidPage.evaluate(() => ({
            state: document.documentElement.dataset.appBootstrap,
            tokenCleared: !localStorage.getItem('tsh_token'),
            loginVisible: !document.getElementById('login-overlay').classList.contains('hidden'),
        }));
        assert.deepEqual(invalid, { state: 'ready', tokenCleared: true, loginVisible: true });
        await invalidPage.close();

        console.log(`App bootstrap timeout Browser UAT: PASS (${JSON.stringify({ branding, reducedMotion, sessionTimeout, invalid })})`);
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
