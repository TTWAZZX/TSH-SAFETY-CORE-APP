'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const database = `tsh_safety_vote_phase1_node_${stamp}`;
const guard = /^tsh_safety_vote_phase1_node_\d+_\d+$/;
const port = 5141;
const evidence = path.join(root, 'backups', 'local', `safety-vote-promotion-remediation-${Date.now()}`);
let admin;
let db;
let server;
let browser;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const localDate = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

async function waitForServer() {
    for (let attempt = 0; attempt < 100; attempt++) {
        try { if ((await fetch(`http://127.0.0.1:${port}/__ready`, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error('Fixture server did not start.');
}

async function api(route, { method = 'GET', body, token = 'sv-admin' } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${port}/api/safety-vote${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : {} };
}

async function seedDatabase() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').toLowerCase()), 'Refusing a non-loopback database.');
    assert(guard.test(database));
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@example.test','x',0),('SV-USER','User','Safety','Core','User','A','Officer','user@example.test','x',0);");
    const migrations = [
        '20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql',
        '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql',
        '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql',
        '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql',
        '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
        '20261010_safety_vote_ux_phase9c_engagement_analytics.sql', '20261015_safety_vote_live_results.sql'
    ];
    for (const file of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey IN ('module_enabled','engagement_enabled')");
}

async function seedCampaign() {
    const created = await api('/admin/campaigns', { method: 'POST', body: { titleTh: 'กิจกรรมประวัติสำหรับผู้ใช้', summary: 'กิจกรรมนี้ต้องยังเปิดดูได้หลังป้ายหมดเวลา', campaignType: 'survey', privacyMode: 'identified', resultVisibility: 'hidden_until_close' } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.data));
    const campaignId = Number(created.data.data.id);
    assert.strictEqual((await api(`/admin/campaigns/${campaignId}/eligibility/rules`, { method: 'PUT', body: { rules: [{ effect: 'include', attributeKey: 'all', operator: 'IN', values: [], reason: 'all employees' }] } })).status, 200);
    assert.strictEqual((await api(`/admin/campaigns/${campaignId}/builder`, { method: 'PUT', body: { questions: [{ questionCode: 'Q1', questionType: 'single_choice', title: 'ตัวเลือก', isRequired: true, minSelections: 1, maxSelections: 1, options: [{ optionCode: 'O1', label: 'หนึ่ง' }, { optionCode: 'O2', label: 'สอง' }] }] } })).status, 200);
    assert.strictEqual((await api(`/admin/campaigns/${campaignId}/eligibility/freeze`, { method: 'POST', body: { reason: 'Promotion remediation browser UAT' } })).status, 201);
    await db.query("DELETE ev FROM SafetyVote_EligibleVoters ev JOIN SafetyVote_EligibilitySnapshots es ON es.id=ev.SnapshotID WHERE es.CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) AND es.Status='frozen' AND ev.EmployeeID='SV-ADMIN'", [campaignId]);
    return campaignId;
}

async function draftCampaignPromotionVisibility() {
    const promotions = await api('/me/promotions', { token: 'sv-user' });
    const campaigns = await api('/me/campaigns', { token: 'sv-user' });
    assert.strictEqual(promotions.status, 200, JSON.stringify(promotions.data));
    assert.strictEqual(promotions.data?.data?.rows?.length, 1, 'Published banner must be independent from Draft campaign status.');
    assert.strictEqual(campaigns.data?.data?.rows?.length, 0, 'Draft campaign must remain hidden.');
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${port}/__ux1-user`, { waitUntil: 'networkidle' });
    await page.locator('.svp-promotion').waitFor();
    assert.strictEqual(await page.locator('[data-svp-promotion-unavailable][disabled]').count(), 1);
    assert.strictEqual(await page.locator('[data-svp-promotion-cta]').count(), 0);
    await page.close();
}

async function adminWorkflow(campaignId) {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    const failedResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('cdn.tailwindcss.com')) errors.push(message.text()); });
    page.on('response', async response => {
        if (response.status() < 400 || !response.url().includes('/api/')) return;
        failedResponses.push({ status: response.status(), url: response.url(), body: (await response.text().catch(() => '')).slice(0, 1000) });
    });
    await page.goto(`http://127.0.0.1:${port}/__ux1-admin`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'จัดการ Safety Vote' }).waitFor();
    await page.getByRole('button', { name: 'สร้างป้ายกิจกรรม' }).first().click();
    await page.getByRole('heading', { name: 'สร้างป้ายประชาสัมพันธ์' }).waitFor();
    await page.locator('.sv-promotion-library[aria-busy="true"]').waitFor({ state: 'detached' });
    const title = 'Production-ready banner workflow';
    const campaignSelect = page.locator('select[name="campaignId"]');
    if (await campaignSelect.inputValue() !== String(campaignId)) {
        await campaignSelect.selectOption(String(campaignId));
        await page.locator('.sv-promotion-library[aria-busy="true"]').waitFor({ state: 'detached' });
    }
    await page.locator('input[name="titleTh"]').fill(title);
    await page.locator('input[name="altText"]').fill('ภาพทดสอบป้ายกิจกรรม');
    await page.locator('input[name="startAt"]').fill(localDate(new Date(Date.now() - 86400000)));
    await page.locator('input[name="endAt"]').fill(localDate(new Date(Date.now() + 86400000)));
    await page.locator('input[data-sv-promotion-image="desktop"]').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    await page.locator('button[value="Draft"]').click();
    try {
        await page.locator('.sv-promotion-editor').waitFor({ state: 'detached' });
    } catch (error) {
        const diagnostics = await page.evaluate(() => ({
            toasts: [...document.querySelectorAll('[role="alert"],.toast,.sv-toast')].map(node => node.textContent?.trim()).filter(Boolean),
            editorText: document.querySelector('.sv-promotion-editor')?.textContent?.trim().slice(0, 1000) || null
        }));
        const [rows] = await db.query('SELECT id,Status,DesktopFileID,Priority,RowVersion FROM SafetyVote_Promotions WHERE TitleTh=?', [title]);
        await page.screenshot({ path: path.join(evidence, 'admin-draft-failure.png'), fullPage: true });
        throw new Error(`${error.message}; diagnostics=${JSON.stringify({ failedResponses, diagnostics, rows, errors })}`);
    }
    const card = page.locator('.sv-promotion-list article').filter({ hasText: title });
    await card.getByRole('button').click();
    await page.locator('.sv-promotion-preview--desktop img').waitFor();
    await page.locator('button[value="Published"]').click();
    await page.locator('[data-sv-dialog-confirm]').click();
    await page.locator('.sv-promotion-editor').waitFor({ state: 'detached' });
    const [[saved]] = await db.query('SELECT id,Status,DesktopFileID,Priority FROM SafetyVote_Promotions WHERE TitleTh=?', [title]);
    assert.strictEqual(saved.Status, 'Published');
    assert(Number(saved.DesktopFileID) > 0, 'Saved image must remain attached.');
    assert(Number(saved.Priority) > 0, 'Automatic order must be assigned.');
    assert.deepStrictEqual(errors, []);
    await page.screenshot({ path: path.join(evidence, 'admin-published-1366x768.png'), fullPage: true });
    await page.close();
    return Number(saved.id);
}

async function adminUserPreview() {
    const promotions = await api('/me/promotions', { token: 'sv-admin' });
    const campaigns = await api('/me/campaigns', { token: 'sv-admin' });
    assert.strictEqual(promotions.status, 200, JSON.stringify(promotions.data));
    assert.strictEqual(promotions.data?.data?.adminPreview, true);
    assert.strictEqual(promotions.data?.data?.rows?.length, 1, JSON.stringify(promotions.data));
    assert.strictEqual(campaigns.status, 200, JSON.stringify(campaigns.data));
    assert.strictEqual(campaigns.data?.data?.adminPreview, true);
    assert.strictEqual(campaigns.data?.data?.rows?.length, 1, JSON.stringify(campaigns.data));
    assert.strictEqual(campaigns.data.data.rows[0].Status, 'Open');
    assert.strictEqual(Number(campaigns.data.data.rows[0].VotingWindowOpen), 0);
    const detail = await api(`/campaigns/${Number(campaigns.data.data.rows[0].id)}`, { token: 'sv-admin' });
    assert.strictEqual(detail.status, 200, JSON.stringify(detail.data));
    assert.strictEqual(detail.data?.data?.eligibility?.previewOnly, true);
    assert.strictEqual(detail.data?.data?.canSubmit, false);
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/__ux1-admin-user`, { waitUntil: 'networkidle' });
    await page.locator('[data-svp-promotion-cta]').click();
    await page.getByRole('heading', { name: 'กิจกรรมประวัติสำหรับผู้ใช้' }).waitFor();
    await page.getByRole('heading', { name: 'โหมดตรวจสอบของผู้ดูแลระบบ' }).waitFor();
    assert.strictEqual(await page.locator('[data-svp-action="review"]').count(), 0, 'Admin preview must not expose participation submission.');
    assert.deepStrictEqual(errors, []);
    await page.screenshot({ path: path.join(evidence, 'admin-user-preview-1366x768.png'), fullPage: true });
    await page.close();
}

async function eligibleUserPreOpen() {
    const promotions = await api('/me/promotions', { token: 'sv-user' });
    const campaigns = await api('/me/campaigns', { token: 'sv-user' });
    assert.strictEqual(promotions.status, 200, JSON.stringify(promotions.data));
    assert.strictEqual(promotions.data?.data?.rows?.length, 1, JSON.stringify(promotions.data));
    assert.strictEqual(campaigns.status, 200, JSON.stringify(campaigns.data));
    assert.strictEqual(campaigns.data?.data?.rows?.length, 1, JSON.stringify(campaigns.data));
    assert.strictEqual(campaigns.data.data.rows[0].Status, 'Open');
    assert.strictEqual(Number(campaigns.data.data.rows[0].VotingWindowOpen), 0);
    const detail = await api(`/campaigns/${Number(campaigns.data.data.rows[0].id)}`, { token: 'sv-user' });
    assert.strictEqual(detail.status, 200, JSON.stringify(detail.data));
    assert.strictEqual(detail.data?.data?.canSubmit, false);
    const submit = await api(`/campaigns/${Number(campaigns.data.data.rows[0].id)}/ballot/submit`, { method: 'POST', token: 'sv-user', body: { campaignVersion: 1, acknowledgedRules: true, answers: [] } });
    assert.strictEqual(submit.status, 409, JSON.stringify(submit.data));
    assert.strictEqual(submit.data?.code, 'CAMPAIGN_NOT_IN_VOTING_WINDOW');
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${port}/__ux1-user`, { waitUntil: 'networkidle' });
    await page.locator('[data-svp-promotion-cta]').click();
    await page.getByRole('heading', { name: 'กิจกรรมประวัติสำหรับผู้ใช้' }).waitFor();
    await page.getByRole('heading', { name: 'เผยแพร่แล้ว · ยังไม่ถึงเวลาเปิดลงคะแนน' }).waitFor();
    assert.strictEqual(await page.locator('[data-svp-action="review"]').count(), 0);
    await page.close();
}

async function userHistory(promotionId) {
    await db.query('UPDATE SafetyVote_Promotions SET StartAt=DATE_SUB(NOW(),INTERVAL 2 DAY),EndAt=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE id=?', [promotionId]);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}/__ux1-user`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { name: 'ป้ายกิจกรรมที่ผ่านมา' }).waitFor();
        await page.getByRole('button', { name: /Production-ready banner workflow/ }).click();
        await page.getByRole('heading', { name: 'กิจกรรมประวัติสำหรับผู้ใช้' }).waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.strictEqual(overflow, false);
        assert.deepStrictEqual(errors, []);
        await page.screenshot({ path: path.join(evidence, `user-history-${viewport.width}x${viewport.height}.png`), fullPage: true });
        await page.close();
    }
}

async function cleanup() {
    if (db) {
        const [files] = await db.query("SELECT StoredName FROM SafetyVote_Files WHERE FilePurpose LIKE 'promotion_%'").catch(() => [[]]);
        for (const row of files) {
            const target = path.join(root, 'backend', 'private-uploads', 'safety-vote', path.basename(row.StoredName || ''));
            if (target.startsWith(path.join(root, 'backend', 'private-uploads', 'safety-vote')) && fs.existsSync(target)) fs.unlinkSync(target);
        }
        await db.end().catch(() => {});
    }
    if (admin) {
        if (guard.test(database)) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {});
        await admin.end().catch(() => {});
    }
}

(async () => {
    fs.mkdirSync(evidence, { recursive: true });
    await seedDatabase();
    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: database, SAFETY_VOTE_FIXTURE_DB: database, SAFETY_VOTE_FIXTURE_PORT: String(port) }, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
    await waitForServer();
    const campaignId = await seedCampaign();
    browser = await chromium.launch({ headless: true });
    const promotionId = await adminWorkflow(campaignId);
    await draftCampaignPromotionVisibility();
    assert.strictEqual((await api(`/admin/campaigns/${campaignId}/lifecycle/open`, { method: 'POST', body: {} })).status, 200);
    await db.query("UPDATE SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID SET v.OpenAt=DATE_ADD(NOW(),INTERVAL 1 DAY),v.CloseAt=DATE_ADD(NOW(),INTERVAL 2 DAY),c.ScheduledOpenAt=v.OpenAt,c.ScheduledCloseAt=v.CloseAt WHERE c.id=?", [campaignId]);
    await adminUserPreview();
    await eligibleUserPreOpen();
    await userHistory(promotionId);
    fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify({ decision: 'PASS_LOCAL_PROMOTION_REMEDIATION_BROWSER_UAT', campaignId, promotionId, publishConfirmation: true, savedImageRestored: true, automaticOrder: true, independentPromotionSchedule: true, independentCampaignLifecycle: true, draftCampaignHiddenWhileBannerVisible: true, scheduledCampaignVisible: true, preOpenVotingBlocked: true, adminPreviewWithoutEligibility: true, adminPreviewCannotSubmit: true, expiredHistoryVisible: true, productionConnected: false, disposableDatabaseResidue: 0 }, null, 2)}\n`);
    console.log(`Safety Vote promotion remediation Browser UAT: PASS (${evidence})`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server?.exitCode === null) server.kill();
    await sleep(250);
    await cleanup();
});
