'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { chromium } = require('playwright');
require('dotenv').config({ path:path.join(__dirname, '..', '.env'), quiet:true });
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const APP_URL = String(process.env.SAFETY_VOTE_LOCAL_APP_URL || 'http://127.0.0.1:5500/index.html');
const evidenceDir = path.join(__dirname, '..', '..', 'backups', 'local', `safety-vote-workflow-results-phase01-${Date.now()}`);

(async () => {
    assert(new Set(['localhost','127.0.0.1','::1']).has(new URL(APP_URL).hostname), 'Refusing non-loopback frontend');
    const { admin } = await loadReadyTestUsers(db);
    const token = jwt.sign(admin, process.env.JWT_SECRET, { expiresIn:'5m' });
    const browser = await chromium.launch({ headless:true, executablePath:process.env.SAFETY_VOTE_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
    const results = [];
    try {
        fs.mkdirSync(evidenceDir, { recursive:true });
        for (const viewport of [{ name:'mobile', width:390, height:844 }, { name:'desktop', width:1366, height:768 }]) {
            const context = await browser.newContext({ viewport:{ width:viewport.width, height:viewport.height } });
            await context.addInitScript(({ tokenValue, userValue }) => {
                localStorage.setItem('tsh_token', tokenValue);
                localStorage.setItem('tsh_user', JSON.stringify(userValue));
            }, { tokenValue:token, userValue:admin });
            const page = await context.newPage();
            const serverErrors = [];
            page.on('response', response => { if (response.status() >= 500 && response.url().includes('/api/safety-vote/')) serverErrors.push(`${response.status()} ${response.url()}`); });
            await page.goto(APP_URL, { waitUntil:'domcontentloaded', timeout:30000 });
            await page.evaluate(async campaign => {
                document.body.innerHTML = '<main id="phase01-admin-results"></main>';
                const module = await import(`/public/js/pages/admin-safety-vote-results.js?v=20261025-result-release-policy-r1`);
                module.renderSafetyVoteResultsWorkspace(document.getElementById('phase01-admin-results'), { campaign, onClose:()=>{} });
            }, { id:4, CampaignCode:'SHE-003-2026', TitleTh:'โครงการรณรงค์ ส่งเสริม และป้องกันการเกิดอุบัติเหตุบนท้องถนน ปีที่ 3', Status:'Published', CampaignType:'popular_vote', PrivacyMode:'identified', ResultVisibility:'live' });
            const preview = page.locator('.svr-publication.is-visible[data-svr-no-result="true"]');
            await preview.waitFor({ timeout:30000 });
            assert.strictEqual(await preview.getAttribute('data-svr-official-state'), 'published', `${viewport.name}: official state`);
            assert.match(await preview.textContent(), /เปิดเผยผลแล้ว\s*·\s*ไม่มีคะแนน/, `${viewport.name}: explicit zero-result publication`);
            assert.strictEqual(await page.locator('.svr-publication.is-hidden').count(), 0, `${viewport.name}: stale unpublished preview`);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
            assert.strictEqual(overflow, false, `${viewport.name}: horizontal overflow`);
            assert.deepStrictEqual(serverErrors, [], `${viewport.name}: Safety Vote server errors`);
            await preview.scrollIntoViewIfNeeded();
            await page.screenshot({ path:path.join(evidenceDir, `${viewport.name}.png`), fullPage:true });
            results.push({ viewport, officialState:'published', noResult:true, overflow, serverErrors:0 });
            await context.close();
        }
        console.log(JSON.stringify({ decision:'PASS_LOCAL_SAFETY_VOTE_WORKFLOW_RESULTS_PHASE01_BROWSER', results, evidenceDir, productionConnected:false }, null, 2));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(async () => db.end());
