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
const dbGuard = /^tsh_safety_vote_phase1_node_\d+_\d+$/;
const port = 5171;
const base = `http://127.0.0.1:${port}`;
const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }];
const evidence = path.join(root, 'backups', 'local', `safety-vote-jury-work-items-${Date.now()}`);
const migrations = [
    '20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql',
    '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
    '20261010_safety_vote_ux_phase9c_engagement_analytics.sql', '20261015_safety_vote_live_results.sql',
    '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql',
    '20261020_safety_vote_eligibility_amendments.sql', '20261024_safety_vote_question_images.sql',
    '20261024_safety_vote_candidate_submission_gallery.sql', '20261024_safety_vote_company_wide_visibility.sql',
    '20261025_safety_vote_official_topn_next_cycle.sql', '20261025_safety_vote_result_release_policy.sql',
    '20261025_safety_vote_jury_work_items_atomic_media.sql'
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let adminDb;
let db;
let server;
let browser;
let storedName = '';

async function waitReady() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try { if ((await fetch(`${base}/__ready`, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error('Jury Work Items browser fixture did not start.');
}

async function api(route, { method = 'GET', body, token = 'sv-admin' } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}/api/safety-vote${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch (_) { data = text; }
    return { status: response.status, data };
}

async function setup() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Local database only');
    assert(dbGuard.test(dbName), 'Disposable database name is outside the guarded prefix');
    adminDb = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await adminDb.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: dbName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@example.test','x',0),('SV-USER','Company Viewer','Production','Line 1','User','A','Officer','viewer@example.test','x',0);");
    for (const file of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='phase5b-browser-uat' WHERE SettingKey IN ('module_enabled','company_wide_campaign_visibility_enabled','engagement_enabled')");
    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: dbName, SAFETY_VOTE_FIXTURE_DB: dbName, SAFETY_VOTE_FIXTURE_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    server.stdout.on('data', chunk => process.stdout.write(chunk));
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    await waitReady();

    const created = await api('/admin/campaigns', { method: 'POST', body: { titleTh: 'Jury Public Work Gallery UAT', summary: 'Company-wide read-only gallery', description: 'Public Work Gallery must not grant jury scoring rights.', campaignType: 'jury_scoring', privacyMode: 'confidential', resultVisibility: 'certified_only', workSource: 'admin_curated' } });
    assert.strictEqual(created.status, 201, JSON.stringify(created.data));
    const campaignId = Number(created.data.data.id);
    const works = await api(`/admin/campaigns/${campaignId}/works`, { method: 'PUT', body: { workSource: 'admin_curated', works: [{ workCode: 'WORK-01', title: 'Safe Factory Model', description: 'A governed Jury Work Item with a private cover.' }, { workCode: 'WORK-02', title: 'Zero Incident Poster', description: 'A second read-only work item.' }] } });
    assert.strictEqual(works.status, 200, JSON.stringify(works.data));
    const workId = Number(works.data.data.rows[0].id);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('scopeType', 'work_cover');
    form.append('scopeId', String(workId));
    form.append('altText', 'Safe Factory Model cover');
    form.append('file', new Blob([png], { type: 'image/png' }), 'safe-factory-model.png');
    const upload = await fetch(`${base}/api/safety-vote/admin/campaigns/${campaignId}/media/atomic`, { method: 'POST', headers: { Authorization: 'Bearer sv-admin', 'Idempotency-Key': `phase5b-browser-${stamp}` }, body: form });
    const uploadText = await upload.text();
    assert.strictEqual(upload.status, 201, uploadText);
    const uploadData = JSON.parse(uploadText);
    assert.strictEqual(uploadData.data.serverConfirmed, true);
    const [[file]] = await db.query('SELECT StoredName FROM SafetyVote_Files WHERE id=?', [Number(uploadData.data.fileId)]);
    storedName = String(file.StoredName || '');
    await db.query("UPDATE SafetyVote_CampaignVersions SET Status='Frozen',OpenAt=DATE_SUB(NOW(),INTERVAL 1 HOUR),CloseAt=DATE_ADD(NOW(),INTERVAL 1 DAY) WHERE id=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?)", [campaignId]);
    await db.query("UPDATE SafetyVote_Campaigns SET Status='Open',DiscoveryMode='public_listing',OpenedAt=NOW() WHERE id=?", [campaignId]);
    return campaignId;
}

async function inspect(campaignId, viewport) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const failed = [];
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('cdn.tailwindcss.com')) errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/api/safety-vote')) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}/__ux1-user`, { waitUntil: 'networkidle' });
    const card = page.locator(`[data-svp-campaign="${campaignId}"]`).first();
    await card.waitFor();
    await card.click();
    const gallery = page.locator('[data-svp-public-work-gallery]');
    await gallery.waitFor();
    assert.strictEqual(await gallery.locator('.svp-public-work-card').count(), 2);
    assert.strictEqual(await gallery.getByText('Safe Factory Model', { exact: true }).count(), 1);
    assert.strictEqual(await page.locator('[data-svp-form]').count(), 0, 'Company viewer must not receive a participation form');
    assert.strictEqual(await page.locator('[data-sv-jury-score], [data-sv-jury-submit], input[type="range"]').count(), 0, 'Company viewer must not receive a Jury score sheet');
    const image = gallery.locator('img[data-sv-auth-file]').first();
    await image.waitFor();
    await page.waitForFunction(element => element.complete && element.naturalWidth > 0, await image.elementHandle());
    await image.locator('..').click();
    await page.locator('.svp-gallery [role="dialog"]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.svp-gallery [role="dialog"]').waitFor({ state: 'detached' });
    const metrics = await page.evaluate(() => {
        const visible = element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0; };
        const small = [...document.querySelectorAll('button,a,input,select,textarea,summary')].filter(visible).map(element => { const box = element.getBoundingClientRect(); return { label: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 60), width: box.width, height: box.height }; }).filter(item => item.width < 44 || item.height < 44);
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1, small };
    });
    assert.strictEqual(metrics.overflow, false, `Horizontal overflow at ${viewport.width}`);
    assert.deepStrictEqual(metrics.small, [], `Visible target below 44 px at ${viewport.width}: ${JSON.stringify(metrics.small.slice(0, 5))}`);
    const unexpectedFailures = failed.filter(item => !item.startsWith('403 ') || !item.includes('/jury/assignments'));
    assert.deepStrictEqual(errors.filter(message => !message.includes('403 (Forbidden)')), [], `Browser errors at ${viewport.width}; responses=${JSON.stringify(failed)}`);
    assert.deepStrictEqual(unexpectedFailures, [], `Unexpected Safety Vote responses at ${viewport.width}`);
    if (viewport.width === 390 || viewport.width === 1366) await page.screenshot({ path: path.join(evidence, `user-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.close();
    return { viewport, companyCatalogue: true, readOnlyGallery: true, workItems: 2, authenticatedPrivateImage: true, viewerKeyboardClose: true, scoreSheetSuppressed: true, overflow: false, smallTargets: 0, safetyVote5xx: 0 };
}

async function main() {
    const campaignId = await setup();
    fs.mkdirSync(evidence, { recursive: true });
    browser = await chromium.launch({ headless: true });
    const results = [];
    for (const viewport of viewports) results.push(await inspect(campaignId, viewport));
    const [[counts]] = await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_Candidates WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?)) works,(SELECT COUNT(*) FROM SafetyVote_MediaMutations WHERE CampaignID=?) mediaMutations,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_JuryScores) juryScores", [campaignId, campaignId]);
    assert.deepStrictEqual([Number(counts.works), Number(counts.mediaMutations), Number(counts.ballots), Number(counts.juryScores)], [2, 1, 0, 0]);
    const result = { contract: '2026-10-25-jury-work-items-public-gallery-browser-r1', campaignId, viewports, results, companyWideReadOnlyGallery: true, participationRightsGranted: false, protectedBusinessRows: { ballots: 0, juryScores: 0 }, externalDelivery: false, productionConnected: false, deployed: false, committed: false, pushed: false, disposableDatabaseResidue: 0 };
    result.resultSha256 = crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2));
    console.log(`Safety Vote Jury Work Items Public Gallery Browser UAT: PASS (3 authenticated User viewports, ${evidence})`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server && server.exitCode === null) server.kill();
    await sleep(250);
    if (storedName) await fs.promises.unlink(path.join(root, 'backend', 'private-uploads', 'safety-vote', path.basename(storedName))).catch(() => {});
    if (db) await db.end().catch(() => {});
    if (adminDb) { if (dbGuard.test(dbName)) await adminDb.query(`DROP DATABASE IF EXISTS \`${dbName}\``).catch(() => {}); await adminDb.end().catch(() => {}); }
});
