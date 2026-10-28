'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const employeeId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const password = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const browserPath = process.env.PROD_UAT_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const evidence = path.join(root, 'backups', 'production', `safety-vote-promotion-carousel-r2-readonly-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`);

async function main() {
    assert(employeeId && password, 'Production Admin UAT credentials are required');
    const login = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
    });
    const session = await login.json().catch(() => null);
    assert.equal(login.status, 200, 'Production Admin login failed');
    assert(session?.token && session?.user, 'Production Admin session missing');

    fs.mkdirSync(evidence, { recursive: true });
    const browser = await chromium.launch({ headless: true, ...(fs.existsSync(browserPath) ? { executablePath: browserPath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const eventRequests = [], failedApiResponses = [], consoleErrors = [];
    page.on('request', request => {
        if (/\/api\/safety-vote\/engagement\/promotions\/\d+\/events(?:\?|$)/.test(request.url())) {
            eventRequests.push({ method: request.method(), url: request.url().replace(/\?.*$/, '') });
        }
    });
    page.on('response', response => {
        if (response.status() >= 400 && response.url().includes('/api/') && !response.url().includes('/api/session/verify')) {
            failedApiResponses.push({ status: response.status(), url: response.url().replace(/\?.*$/, '') });
        }
    });
    page.on('console', message => {
        if (message.type() === 'error' && !message.text().includes('cdn.tailwindcss.com')) consoleErrors.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.addInitScript(({ user, token }) => {
        localStorage.setItem('tsh_user', JSON.stringify(user));
        localStorage.setItem('tsh_token', token);
    }, { user: session.user, token: session.token });
    try {
        await page.goto(`${baseUrl}/index.html?promotion_carousel_r2=${Date.now()}#safety-vote`, { waitUntil: 'networkidle' });
        await page.locator('[data-svp-promotion-carousel]').waitFor({ timeout: 30000 });
        await page.waitForTimeout(7500);
        const state = await page.evaluate(() => ({
            cacheMarker: [...document.scripts].some(script => script.src.includes('20261028-safety-vote-promotion-carousel-r2')),
            carousel: Boolean(document.querySelector('[data-svp-promotion-carousel]')),
            counter: document.querySelector('[data-svp-promotion-counter]')?.textContent?.trim() || '1/1',
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
        }));
        assert.equal(state.cacheMarker, true, 'Production cache marker R2 missing');
        assert.equal(state.carousel, true, 'Production carousel missing');
        assert.equal(state.overflow, false, 'Production Safety Vote has horizontal overflow');
        assert.deepEqual(eventRequests, [], `Admin preview emitted promotion analytics: ${JSON.stringify(eventRequests)}`);
        assert.deepEqual(failedApiResponses, [], `Production API failures: ${JSON.stringify(failedApiResponses)}`);
        assert.deepEqual(consoleErrors, [], `Production console errors: ${JSON.stringify(consoleErrors)}`);
        await page.screenshot({ path: path.join(evidence, 'admin-safety-vote-carousel.png'), fullPage: true });
        const result = {
            contract: '2026-10-28-safety-vote-promotion-carousel-r2',
            decision: 'PASS_PRODUCTION_ADMIN_PREVIEW_NO_ANALYTICS_403',
            generatedAt: new Date().toISOString(),
            state,
            promotionEventRequests: 0,
            failedApiResponses: 0,
            consoleErrors: 0,
            businessMutation: false,
            notificationSent: false,
        };
        result.resultSha256 = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
        fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
        process.stdout.write(`${JSON.stringify({ evidence: path.relative(root, evidence).replaceAll('\\', '/'), ...result }, null, 2)}\n`);
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
