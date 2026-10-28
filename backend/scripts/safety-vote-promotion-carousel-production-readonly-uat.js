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
const evidence = path.join(root, 'backups', 'production', `safety-vote-jury-scoring-r2-readonly-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`);

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
    const eventRequests = [], mutationRequests = [], failedApiResponses = [], consoleErrors = [];
    page.on('request', request => {
        if (/\/api\/safety-vote\/engagement\/promotions\/\d+\/events(?:\?|$)/.test(request.url())) {
            eventRequests.push({ method: request.method(), url: request.url().replace(/\?.*$/, '') });
        }
        if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && !request.url().endsWith('/api/login') && !request.url().includes('/api/session/verify')) {
            mutationRequests.push({ method: request.method(), url: request.url().replace(/\?.*$/, '') });
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
        await page.goto(`${baseUrl}/index.html?jury_scoring_r2=${Date.now()}#safety-vote`, { waitUntil: 'networkidle' });
        await page.locator('[data-svp-promotion-carousel]').waitFor({ timeout: 30000 });
        await page.waitForTimeout(7500);
        const state = await page.evaluate(() => ({
            cacheMarker: [...document.scripts].some(script => script.src.includes('20261028-safety-vote-jury-scoring-r2')),
            carousel: Boolean(document.querySelector('[data-svp-promotion-carousel]')),
            counter: document.querySelector('[data-svp-promotion-counter]')?.textContent?.trim() || '1/1',
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            activeImage: (() => {
                const slide = document.querySelector('[data-svp-promotion-slide].is-active');
                const media = slide?.querySelector('[data-svp-media-state]');
                const foreground = slide?.querySelector('.svp-promotion__foreground');
                const backdrop = slide?.querySelector('.svp-promotion__backdrop');
                const style = foreground ? getComputedStyle(foreground) : null;
                const rect = foreground?.getBoundingClientRect();
                return {
                    mediaState: media?.dataset.svpMediaState || null,
                    foregroundHasSource: Boolean(foreground?.currentSrc || foreground?.src),
                    backdropHasSource: Boolean(backdrop?.currentSrc || backdrop?.src),
                    naturalWidth: Number(foreground?.naturalWidth || 0),
                    naturalHeight: Number(foreground?.naturalHeight || 0),
                    opacity: style?.opacity || null,
                    display: style?.display || null,
                    width: Math.round(rect?.width || 0),
                    height: Math.round(rect?.height || 0),
                };
            })(),
        }));
        assert.equal(state.cacheMarker, true, 'Production Jury scoring R2 cache marker missing');
        assert.equal(state.carousel, true, 'Production carousel missing');
        assert.equal(state.overflow, false, 'Production Safety Vote has horizontal overflow');
        assert.deepEqual(eventRequests, [], `Admin preview emitted promotion analytics: ${JSON.stringify(eventRequests)}`);
        assert.deepEqual(failedApiResponses, [], `Production API failures: ${JSON.stringify(failedApiResponses)}`);
        assert.deepEqual(consoleErrors, [], `Production console errors: ${JSON.stringify(consoleErrors)}`);
        await page.screenshot({ path: path.join(evidence, 'admin-safety-vote-carousel.png'), fullPage: true });
        const juryEntry = page.locator('[data-svp-jury]').first();
        assert.equal(await juryEntry.count(), 1, 'Production deployment account has no Jury entry');
        await juryEntry.click();
        await page.locator('.svj-candidate__workspace').first().waitFor({ timeout: 30000 });
        await page.locator('.svj-candidate').first().evaluate(node => {
            node.scrollIntoView({ block: 'start' });
            window.scrollBy(0, -76);
        });
        await page.waitForTimeout(150);
        const juryState = await page.evaluate(() => {
            const workspace = document.querySelector('.svj-candidate__workspace');
            const evidencePanel = document.querySelector('.svj-candidate__evidence');
            const criteria = document.querySelector('.svj-candidate__criteria');
            criteria.scrollTop = criteria.scrollHeight;
            const image = evidencePanel?.querySelector('img');
            const imageRect = image?.getBoundingClientRect();
            const lastCriterion = [...criteria.querySelectorAll('.svj-score-row')].at(-1)?.getBoundingClientRect();
            return {
                columns: getComputedStyle(workspace).gridTemplateColumns,
                criteriaOverflow: getComputedStyle(criteria).overflowY,
                criteriaScrolls: criteria.scrollHeight > criteria.clientHeight,
                imageVisible: Boolean(imageRect && imageRect.bottom > 0 && imageRect.top < innerHeight),
                lastCriterionVisible: Boolean(lastCriterion && lastCriterion.bottom > 0 && lastCriterion.top < innerHeight),
                saveDraftButton: Boolean(document.querySelector('[data-svj-action="save"]')),
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
            };
        });
        assert(juryState.columns.split(' ').length >= 2, 'Production Jury workspace is not split on desktop');
        assert.equal(juryState.criteriaOverflow, 'auto', 'Production Jury criteria panel is not independently scrollable');
        assert.equal(juryState.criteriaScrolls, true, 'Production Jury criteria panel does not scroll');
        assert.equal(juryState.imageVisible && juryState.lastCriterionVisible, true, 'Production artwork and final criterion are not visible together');
        assert.equal(juryState.saveDraftButton, true, 'Production Jury draft action missing');
        assert.equal(juryState.overflow, false, 'Production Jury workspace has horizontal overflow');
        assert.deepEqual(mutationRequests, [], `Read-only Jury UAT emitted mutations: ${JSON.stringify(mutationRequests)}`);
        assert.deepEqual(failedApiResponses, [], `Production Jury API failures: ${JSON.stringify(failedApiResponses)}`);
        assert.deepEqual(consoleErrors, [], `Production Jury console errors: ${JSON.stringify(consoleErrors)}`);
        await page.screenshot({ path: path.join(evidence, 'admin-jury-sticky-evidence.png'), fullPage: false });
        const result = {
            contract: '2026-10-28-safety-vote-jury-scoring-r2',
            decision: 'PASS_PRODUCTION_JURY_SCORING_R2_READONLY_UAT',
            generatedAt: new Date().toISOString(),
            state,
            juryState,
            promotionEventRequests: 0,
            mutationRequests: 0,
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
