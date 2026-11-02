'use strict';
const assert = require('assert');
const express = require('express');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
let previewBody = null;
let applyBody = null;
let notificationBody = null;
const app = express();

app.use(express.json());
app.get('/__deadline-extension', (req, res) => res.type('html').send(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/style.css"></head><body><main id="workspace"></main><script>window.API_BASE='http://${req.get('host')}/api';window.__TSH_FEATURE_FLAGS__={safetyVoteUxV1:true,safetyVoteEngagementV1:true};window.TSHSession={getToken:()=> 'fixture',getUser:()=>({role:'Admin'}),logout:()=>{}};</script><script type="module">import {renderSafetyVoteOperationsWorkspace} from '/public/js/pages/admin-safety-vote-operations.js';await renderSafetyVoteOperationsWorkspace(document.getElementById('workspace'),{campaign:{id:7,CampaignCode:'SHE-007-2026',TitleTh:'Deadline extension fixture',Status:'Open',CampaignType:'popular_vote',PrivacyMode:'identified',RowVersion:4,VersionRowVersion:7}});</script></body></html>`));
app.get('/api/safety-vote/admin/campaigns/7/operations', (_req, res) => res.json({ success: true, data: { campaign: { id: 7, status: 'Open', campaignType: 'popular_vote', scheduledOpenAt: '2026-11-01 08:00:00', scheduledCloseAt: '2026-11-03 17:00:00', campaignRowVersion: 4, versionRowVersion: 7, timeZone: 'Asia/Bangkok' }, funnel: { eligible: { visible: true, value: 20 }, started: { visible: true, value: 10 }, submitted: { visible: true, value: 8 }, accepted: { visible: true, value: 8 }, reconciliation: 'balanced' }, workflow: { metrics: {} }, eligibilityAdmissions: {}, timeline: [], notifications: [], exports: [], health: { reconciliation: 'balanced', privacySuppression: true } } }));
app.get('/api/safety-vote/admin/campaigns/7/analytics/organization', (_req, res) => res.json({ success: true, data: { rows: [] } }));
app.get('/api/safety-vote/admin/campaigns/7/jury/progress', (_req, res) => res.json({ success: true, data: { rows: [] } }));
app.get('/api/safety-vote/admin/campaigns/7/stages', (_req, res) => res.json({ success: true, data: { rows: [] } }));
app.get('/api/safety-vote/admin/campaigns/7/results/snapshots', (_req, res) => res.json({ success: true, data: { rows: [] } }));
app.post('/api/safety-vote/admin/campaigns/7/deadline-extension/preview', (req, res) => {
    previewBody = req.body;
    res.json({ success: true, data: { campaignId: 7, campaignCode: 'SHE-007-2026', status: 'Open', currentCloseAt: '2026-11-03 17:00:00', newCloseAt: '2026-11-05 17:00:00', campaignRowVersion: 4, versionRowVersion: 7, preserved: { participation: 10, ballots: 8, submissions: 2, juryAssignments: 1 }, promotions: [{ id: 31, titleTh: 'Linked promotion fixture', endAt: '2026-11-03 17:00:00', rowVersion: 3, recommended: true }] } });
});
app.post('/api/safety-vote/admin/campaigns/7/deadline-extension', (req, res) => {
    applyBody = req.body;
    res.json({ success: true, data: { newCloseAt: '2026-11-05 17:00:00', campaignRowVersion: 5, versionRowVersion: 8, extendedPromotionIds: [31], preserved: true } });
});
app.post('/api/safety-vote/admin/campaigns/7/notifications/queue', (req, res) => {
    notificationBody = req.body;
    res.status(201).json({ success: true, data: { queued: 20, suppressed: 0 } });
});
app.use(express.static(root));

(async () => {
    const server = await new Promise((resolve, reject) => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        listener.once('error', reject);
    });
    const port = server.address().port;
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/__deadline-extension`, { waitUntil: 'networkidle' });
        await page.locator('[data-svo-action="open-extension"]').click();
        await page.locator('[name="newCloseAt"]').fill('2026-11-05T17:00');
        await page.locator('[name="reason"]').fill('Extend the deadline for complete participation.');
        await page.locator('[data-svo-action="preview-extension"]').click();
        await page.locator('.svo-extension__preview').waitFor();
        assert.strictEqual(previewBody.newCloseAt, '2026-11-05T10:00:00.000Z');
        assert.strictEqual(previewBody.campaignRowVersion, 4);
        assert(await page.getByText('Linked promotion fixture').isVisible());
        assert(await page.locator('[data-svo-extension-promotion][value="31"]').isChecked());
        await page.locator('[name="queueNotification"]').check();
        await page.locator('[name="confirmation"]').fill('EXTEND SHE-007-2026');
        await page.locator('[data-svo-extension-form] button[type="submit"]').click();
        await page.locator('.svo-action-message.is-success').waitFor();
        assert.deepStrictEqual(applyBody.promotionIds, [31]);
        assert.strictEqual(applyBody.confirmation, 'EXTEND SHE-007-2026');
        assert.strictEqual(notificationBody.eventType, 'deadline_extended');
        assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.deepStrictEqual(errors, []);
        console.log('Safety Vote deadline extension Browser UAT: PASS');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
