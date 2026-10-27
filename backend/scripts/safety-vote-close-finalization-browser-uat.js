'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

let APP_URL = String(process.env.SAFETY_VOTE_LOCAL_APP_URL || 'http://127.0.0.1:5500/index.html#/safety-vote');
const evidenceDir = path.join(__dirname, '..', '..', 'backups', 'local', `safety-vote-close-finalization-browser-${Date.now()}`);
const root = path.resolve(__dirname, '..', '..');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
let ownedApi = null;
let ownedFrontend = null;

async function reachable(url, expected = status => status === 200) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); return expected(response.status); }
    catch (_) { return false; }
}

async function ensureLocalRuntime() {
    const apiUrl = 'http://127.0.0.1:5000/api/safety-vote/me/campaigns';
    if (!await reachable(apiUrl, status => status === 401)) {
        ownedApi = spawn(process.execPath, [path.join(root, 'backend', 'server.js')], { cwd: root, env: { ...process.env, PORT: '5000' }, stdio: 'ignore', windowsHide: true });
        for (let attempt = 0; attempt < 100 && !await reachable(apiUrl, status => status === 401); attempt += 1) { if (ownedApi.exitCode !== null) break; await sleep(150); }
        assert(await reachable(apiUrl, status => status === 401), 'Local Safety Vote API did not become ready on port 5000');
    }
    const frontendProbe = APP_URL.split('#')[0];
    if (await reachable(frontendProbe)) return;
    assert(!process.env.SAFETY_VOTE_LOCAL_APP_URL, 'Configured Local frontend is unreachable');
    const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
    ownedFrontend = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const target = path.resolve(root, relative);
        if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { response.writeHead(404); response.end('Not found'); return; }
        response.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(target).pipe(response);
    });
    await new Promise((resolve, reject) => { ownedFrontend.once('error', reject); ownedFrontend.listen(5500, '127.0.0.1', resolve); });
    assert(await reachable(frontendProbe), 'Local frontend did not become ready on port 5500');
}

(async () => {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(new URL(APP_URL).hostname), 'Refusing non-loopback frontend');
    await ensureLocalRuntime();
    const { user } = await loadReadyTestUsers(db);
    const [[completedFixture = null]] = await db.query(`
        SELECT c.id
          FROM SafetyVote_Campaigns c
         WHERE c.Status IN ('Closed','Certified','Published')
           AND c.IsHidden=0 AND c.IsTest=0
         ORDER BY c.id
         LIMIT 1
    `);
    const campaignId = completedFixture ? Number(completedFixture.id) : null;
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
            if (!campaignId) {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
                assert.equal(overflow, false, `${viewport.name}: empty catalogue horizontal overflow`);
                assert.deepStrictEqual(serverErrors, [], `${viewport.name}: empty catalogue Safety Vote server errors`);
                await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}-no-completed-fixture.png`), fullPage: true });
                results.push({ viewport, completedFixture: false, overflow, serverErrors: 0 });
                await context.close();
                continue;
            }
            const card = page.locator(`.svp-campaign-card[data-svp-campaign="${campaignId}"]`).first();
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
        console.log(JSON.stringify({ decision: 'PASS_LOCAL_SAFETY_VOTE_CLOSED_CATALOGUE_BROWSER_UAT', campaignId, results, evidenceDir, productionConnected: false }, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    await db.end();
    if (ownedFrontend) await new Promise(resolve => ownedFrontend.close(resolve));
    if (ownedApi?.exitCode === null) ownedApi.kill();
});
