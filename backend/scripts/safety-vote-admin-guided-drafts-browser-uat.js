'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const dbName = `tsh_safety_vote_phase1_node_${stamp}`;
const guard = /^tsh_safety_vote_phase1_node_\d+_\d+$/;
const port = 5167;
const viewports = [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }];
const evidence = path.join(root, 'backups', 'local', `safety-vote-admin-guided-drafts-${Date.now()}`);
const children = [];
let adminDb, db, browser;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitReady() {
    for (let index = 0; index < 100; index += 1) {
        try { if ((await fetch(`http://127.0.0.1:${port}/__ready`, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error('Fixture did not start');
}

async function call(route, { method = 'GET', body } = {}) {
    const headers = { Authorization: 'Bearer sv-admin', Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:${port}/api/safety-vote${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: JSON.parse(await response.text()) };
}

async function setup() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').toLowerCase()), 'Local database only');
    assert(guard.test(dbName));
    adminDb = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await adminDb.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: dbName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@example.test','x',0),('SV-USER','User','Production','Line 1','User','A','Officer','user@example.test','x',0),('SV-USER2','Juror','Production','Line 1','User','A','Officer','juror@example.test','x',0);");
    for (const file of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql', '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql']) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey IN ('module_enabled','engagement_enabled')");
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: dbName, SAFETY_VOTE_FIXTURE_DB: dbName, SAFETY_VOTE_FIXTURE_PORT: String(port) }, stdio: 'ignore', windowsHide: true }));
    await waitReady();
    const created = await call('/admin/campaigns', { method: 'POST', body: { titleTh: 'ร่างกิจกรรมความปลอดภัยประจำเดือน', summary: 'ร่างสำหรับทดสอบงานผู้ดูแล', description: 'ข้อมูลจำลองในฐานข้อมูลชั่วคราว', campaignType: 'survey', privacyMode: 'identified', resultVisibility: 'hidden_until_close' } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.data));
    const id = Number(created.data.data.id);
    assert.strictEqual((await call(`/admin/campaigns/${id}/builder`, { method: 'PUT', body: { questions: [{ questionCode: 'Q1', questionType: 'single_choice', title: 'กิจกรรมที่สนใจ', isRequired: true, minSelections: 1, maxSelections: 1, options: [{ optionCode: 'O1', label: 'Safety Talk' }, { optionCode: 'O2', label: 'Risk Hunt' }] }] } })).status, 200);
    assert.strictEqual((await call(`/admin/planning/templates/from-campaign/${id}`, { method: 'POST', body: { name: 'แม่แบบ Phase 2' } })).status, 201);
    return id;
}

async function pageMetrics(page, viewport, errors) {
    const metrics = await page.evaluate(() => {
        const visible = element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0; };
        const small = [...document.querySelectorAll('button,a,input,select,textarea,summary')].filter(visible).map(element => { const choice = element.matches('input[type="checkbox"],input[type="radio"]'), hit = choice && element.closest('label') ? element.closest('label') : element, box = hit.getBoundingClientRect(); return { text: (hit.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 70), width: box.width, height: box.height }; }).filter(item => item.width < 44 || item.height < 44);
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1, small, protectedText: /SafetyVote_(Ballots|BallotAnswers|JuryScores|Certifications)/.test(document.body.innerText) };
    });
    assert.strictEqual(metrics.overflow, false, `horizontal overflow ${viewport.width}`);
    assert.deepStrictEqual(metrics.small, [], `small targets ${viewport.width}: ${JSON.stringify(metrics.small.slice(0, 5))}`);
    assert.strictEqual(metrics.protectedText, false);
    assert.deepStrictEqual(errors, [], `console errors ${viewport.width}`);
}

async function inspect(viewport) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('cdn.tailwindcss.com')) errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/__ux1-admin`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'จัดการ Safety Vote' }).waitFor();
    await page.getByRole('button', { name: 'สร้างแคมเปญ' }).first().click();
    const chooser = page.getByRole('dialog', { name: 'เริ่มจากรูปแบบที่เหมาะกับงาน' });
    await chooser.waitFor();
    assert.strictEqual(await chooser.locator('[data-sv-built-in-template]').count(), 6);
    assert.strictEqual(await chooser.locator('[data-sv-reusable-template]').count(), 1);
    await chooser.locator('[data-sv-built-in-template="survey"]').click();
    await page.locator('[data-sv-wizard="2026-10-11-admin-guided-drafts-r1"]').waitFor();
    assert.strictEqual(await page.locator('.svw-readiness-summary [role="progressbar"]').count(), 1);
    await page.getByRole('button', { name: 'กลับศูนย์จัดการ' }).click();
    await page.getByRole('heading', { name: 'จัดการ Safety Vote' }).waitFor();
    await page.getByRole('button', { name: 'แคมเปญ', exact: true }).click();
    await page.getByRole('heading', { name: 'แคมเปญ', exact: true }).waitFor();
    await page.getByRole('tab', { name: 'ฉบับร่าง' }).click();
    if (viewport.width >= 768 && viewport.width < 1200) await page.getByRole('button', { name: 'เลือกแคมเปญ' }).click();
    await page.locator('[data-sv-edit-draft]:visible').first().waitFor();
    assert((await page.locator('.sv-readiness-meter').count()) > 0);
    await page.locator('[data-sv-draft-select]:visible').first().check();
    if (viewport.width >= 768 && viewport.width < 1200) await page.locator('[data-sv-action="close-drawer"]:visible').last().click();
    await page.locator('[data-sv-bulk-void]').click();
    await page.getByRole('dialog', { name: /ยกเลิกแคมเปญฉบับร่าง/ }).waitFor();
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    if (viewport.width >= 768 && viewport.width < 1200) await page.getByRole('button', { name: 'เลือกแคมเปญ' }).click();
    await page.locator('[data-sv-duplicate-campaign]:visible').first().click();
    await page.locator('[data-sv-wizard="2026-10-11-admin-guided-drafts-r1"]').waitFor();
    assert((await page.locator('.svw-header').innerText()).includes('สำเนา'));
    await page.getByRole('button', { name: 'กลับศูนย์จัดการ' }).click();
    if (await page.locator('[data-sv-dialog="confirm"]:visible').count()) await page.getByRole('button', { name: 'ออกจากหน้านี้' }).click();
    await page.getByRole('heading', { name: 'แคมเปญ', exact: true }).waitFor();
    await page.getByRole('button', { name: 'ป้ายประชาสัมพันธ์', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'สร้างป้ายกิจกรรม' }).click();
    await page.getByRole('heading', { name: 'สร้างป้ายประชาสัมพันธ์' }).waitFor();
    await page.getByRole('heading', { name: 'คลังภาพของแคมเปญ' }).waitFor();
    await pageMetrics(page, viewport, errors);
    if ([390, 1920].includes(viewport.width)) await page.screenshot({ path: path.join(evidence, `admin-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.close();
    return { viewport, templateChooser: true, reusableTemplate: true, draftReadiness: true, bulkConfirmation: true, configDuplicatePreview: true, promotionAssetLibrary: true, overflow: false, smallTargets: 0, consoleErrors: 0 };
}

async function main() {
    await setup();
    fs.mkdirSync(evidence, { recursive: true });
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const viewport of viewports) results.push(await inspect(viewport));
    const [[counts]] = await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotAnswers) answers,(SELECT COUNT(*) FROM SafetyVote_JuryScores) jury,(SELECT COUNT(*) FROM SafetyVote_Certifications) certifications,(SELECT COUNT(*) FROM SafetyVote_Campaigns) campaigns,(SELECT COUNT(*) FROM SafetyVote_CampaignTemplates) templates');
    assert.deepStrictEqual([Number(counts.ballots), Number(counts.answers), Number(counts.jury), Number(counts.certifications), Number(counts.campaigns), Number(counts.templates)], [0, 0, 0, 0, 1, 1]);
    const result = { contract: '2026-10-11-safety-vote-admin-guided-drafts-r1', viewports, results, authenticatedAdminCombinations: results.length, keyboardAndDialogSemantics: true, protectedBusinessRows: { ballots: 0, answers: 0, jury: 0, certifications: 0 }, fixtureRows: { campaigns: 1, templates: 1 }, externalDelivery: false, productionConnected: false, deployed: false, committed: false, pushed: false, disposableDatabaseResidue: 0 };
    result.resultSha256 = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`Safety Vote Admin guided Drafts Browser UAT: PASS (5 authenticated Admin viewports, ${evidence})`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close().catch(() => {});
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    if (db) await db.end().catch(() => {});
    if (adminDb) { if (guard.test(dbName)) await adminDb.query(`DROP DATABASE IF EXISTS \`${dbName}\``).catch(() => {}); await adminDb.end().catch(() => {}); }
});
