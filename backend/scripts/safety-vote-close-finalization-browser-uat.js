'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const APP_URL = String(process.env.SAFETY_VOTE_LOCAL_APP_URL || 'http://127.0.0.1:5500/index.html#/safety-vote');
const evidenceDir = path.join(__dirname, '..', '..', 'backups', 'local', `safety-vote-close-finalization-browser-${Date.now()}`);

(async () => {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(new URL(APP_URL).hostname), 'Refusing non-loopback frontend');
    const { user } = await loadReadyTestUsers(db);
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5m' });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.SAFETY_VOTE_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const results = [];
    try {
        fs.mkdirSync(evidenceDir, { recursive: true });
        for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1366, height: 768 }]) {
            const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
            await context.addInitScript(({ tokenValue, userValue }) => {
                localStorage.setItem('tsh_token', tokenValue);
                localStorage.setItem('tsh_user', JSON.stringify(userValue));
            }, { tokenValue: token, userValue: user });
            const page = await context.newPage();
            const serverErrors = [];
            page.on('response', response => {
                if (response.status() >= 500 && response.url().includes('/api/safety-vote/')) serverErrors.push(`${response.status()} ${response.url()}`);
            });
            await page.goto(APP_URL, { waitUntil: 'commit', timeout: 30000 });
            await page.locator('[data-sv-catalogue="company-wide-v1"]').waitFor({ timeout: 30000 });
            const card = page.locator('.svp-campaign-card[data-svp-campaign="4"]').first();
            await card.waitFor({ timeout: 30000 });
            const cardStatus = await card.getAttribute('data-svp-status');
            assert(['Closed', 'Certified', 'Published'].includes(cardStatus), `${viewport.name}: completed card status ${cardStatus}`);
            await card.click();
            await page.locator('.svp-shell--detail').waitFor({ timeout: 30000 });
            const official = page.locator('[data-svp-official-results]');
            await official.waitFor({ timeout: 30000 });
            const officialState = await official.getAttribute('data-svp-official-results');
            assert(['no-result', 'pending'].includes(officialState), `${viewport.name}: governed completed-result state ${officialState}`);
            if (officialState === 'no-result') assert.equal(await official.getAttribute('data-svp-result-source'), 'immutable-snapshot', `${viewport.name}: immutable result source`);
            assert.equal(await page.locator('.svp-shell--detail').getAttribute('data-sv-company-user-ux'), 'phase5', `${viewport.name}: company user UX release marker`);
            if (officialState === 'no-result') assert.equal(await page.locator('.svp-result-integrity code').count(), 1, `${viewport.name}: result integrity hash`);
            assert.equal(await page.locator('[data-svp-action="review"]').count(), 0, `${viewport.name}: closed participation action`);
            const targetAudit = await page.locator('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])').evaluateAll(nodes => {
                const visible = nodes.filter(node => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden'; });
                const targets = visible.map(node => ({ height: node.getBoundingClientRect().height, tag: node.tagName, id: node.id || '', className: String(node.className || ''), label: String(node.getAttribute('aria-label') || node.textContent || node.value || '').trim().slice(0, 80) })).sort((a, b) => a.height - b.height);
                return { min: targets.length ? targets[0].height : 44, undersized: targets.filter(target => target.height < 44).slice(0, 10) };
            });
            const minTarget = targetAudit.min;
            assert(minTarget >= 44, `${viewport.name}: touch target ${minTarget} ${JSON.stringify(targetAudit.undersized)}`);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
            assert.equal(overflow, false, `${viewport.name}: horizontal overflow`);
            assert.deepStrictEqual(serverErrors, [], `${viewport.name}: Safety Vote server errors`);
            await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}.png`), fullPage: true });
            await official.scrollIntoViewIfNeeded();
            await official.screenshot({ path: path.join(evidenceDir, `${viewport.name}-official-result.png`) });
            results.push({ viewport, cardStatus, officialResult: officialState, resultSource: officialState === 'no-result' ? 'immutable-snapshot' : 'governance-pending', minTarget, overflow, serverErrors: 0 });
            await context.close();
        }
        console.log(JSON.stringify({ decision: 'PASS_LOCAL_SAFETY_VOTE_CLOSED_CATALOGUE_BROWSER_UAT', results, evidenceDir, productionConnected: false }, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => db.end());
