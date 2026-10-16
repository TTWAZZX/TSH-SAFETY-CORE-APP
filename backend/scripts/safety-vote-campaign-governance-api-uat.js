'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const migrations = [
    '20261008_safety_vote_phase1_foundation.sql',
    '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql',
    '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql',
    '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql',
    '20261009_safety_vote_phase10_4_media_versioning.sql',
    '20261010_safety_vote_ux_phase9a_engagement.sql',
    '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
    '20261010_safety_vote_ux_phase9c_engagement_analytics.sql',
    '20261015_safety_vote_live_results.sql',
    '20261016_safety_vote_participation_attempts.sql',
    '20261016_safety_vote_campaign_governance.sql'
];
const children = [];
let admin;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function call(base, route, { method = 'GET', token = 'sv-admin', body } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
    return { status: response.status, data };
}

async function wait(url) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function seed(name) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    try {
        await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,Department VARCHAR(100)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;INSERT INTO Employees VALUES('SV-USER','Production')");
        for (const file of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
        await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='module_enabled'");
        return db;
    } catch (error) {
        await db.end();
        throw error;
    }
}

async function makeDraft(db, code, title, withBallot = false) {
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,CreatedBy,UpdatedBy) VALUES(?,'Draft','SV-ADMIN','SV-ADMIN','SV-ADMIN')", [code]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,CampaignType,PrivacyMode,TitleTh,Status,CreatedBy,UpdatedBy) VALUES(?,1,'2026-10-08-safety-vote-phase0-r1','popular_vote','identified',?,'Draft','SV-ADMIN','SV-ADMIN')", [campaign.insertId, title]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    if (withBallot) {
        const hash = 'b'.repeat(64);
        await db.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,1,'identified','Accepted',?,?,'governance-uat')", [version.insertId, hash, hash]);
    }
    return { id: Number(campaign.insertId), versionId: Number(version.insertId), title };
}

async function lifecycle(label, base, db) {
    const disposable = await makeDraft(db, `TEST-${label.toUpperCase()}-2026`, `${label} disposable campaign`);
    const protectedCampaign = await makeDraft(db, `REAL-${label.toUpperCase()}-2026`, `${label} protected campaign`, true);
    const retained = await makeDraft(db, `ARCH-${label.toUpperCase()}-2026`, `${label} retained campaign`);
    await db.query("UPDATE SafetyVote_Campaigns SET Status='Published' WHERE id=?", [retained.id]);
    await db.query("UPDATE SafetyVote_CampaignVersions SET Status='Published' WHERE id=?", [retained.versionId]);

    const policy = await call(base, `/admin/campaigns/${disposable.id}/governance-policy`);
    assert.strictEqual(policy.status, 200, JSON.stringify(policy.data));
    assert.strictEqual(policy.data.data.capabilities.markTest, true);
    assert.strictEqual(policy.data.data.capabilities.purge, false);

    const userBefore = await call(base, '/me/campaigns', { token: 'sv-user' });
    assert.strictEqual(userBefore.status, 200, JSON.stringify(userBefore.data));

    const marked = await call(base, `/admin/campaigns/${disposable.id}/governance/mark-test`, { method: 'POST', body: { rowVersion: Number(policy.data.data.campaign.RowVersion), reason: 'Disposable governance UAT fixture' } });
    assert.strictEqual(marked.status, 200, JSON.stringify(marked.data));
    assert.strictEqual(Number(marked.data.data.campaign.IsTest), 1);
    assert.strictEqual(Number(marked.data.data.campaign.IsHidden), 1);

    const userHidden = await call(base, `/campaigns/${disposable.id}`, { token: 'sv-user' });
    assert.strictEqual(userHidden.status, 404, JSON.stringify(userHidden.data));
    const userList = await call(base, '/me/campaigns', { token: 'sv-user' });
    assert.strictEqual(userList.status, 200, JSON.stringify(userList.data));
    assert.strictEqual((userList.data.data?.rows || []).some(row => Number(row.id) === disposable.id), false);

    const voided = await call(base, `/admin/campaigns/${disposable.id}/governance/void`, { method: 'POST', body: { rowVersion: Number(marked.data.data.campaign.RowVersion), reason: 'End disposable governance UAT' } });
    assert.strictEqual(voided.status, 200, JSON.stringify(voided.data));
    assert.strictEqual(voided.data.data.campaign.Status, 'Voided');

    const wrong = await call(base, `/admin/campaigns/${disposable.id}/governance/purge`, { method: 'POST', body: { rowVersion: Number(voided.data.data.campaign.RowVersion), reason: 'Purge disposable governance UAT', confirmation: 'wrong title' } });
    assert.strictEqual(wrong.status, 400, JSON.stringify(wrong.data));
    assert.strictEqual(wrong.data.code, 'PURGE_CONFIRMATION_REQUIRED');

    const purged = await call(base, `/admin/campaigns/${disposable.id}/governance/purge`, { method: 'POST', body: { rowVersion: Number(voided.data.data.campaign.RowVersion), reason: 'Purge disposable governance UAT', confirmation: disposable.title } });
    assert.strictEqual(purged.status, 200, JSON.stringify(purged.data));
    assert.strictEqual(purged.data.data.purged, true);
    const [[campaignCount]] = await db.query('SELECT COUNT(*) total FROM SafetyVote_Campaigns WHERE id=?', [disposable.id]);
    const [[tombstoneCount]] = await db.query('SELECT COUNT(*) total FROM SafetyVote_CampaignPurgeLog WHERE CampaignIDOriginal=?', [disposable.id]);
    assert.strictEqual(Number(campaignCount.total), 0);
    assert.strictEqual(Number(tombstoneCount.total), 1);

    const protectedPolicy = await call(base, `/admin/campaigns/${protectedCampaign.id}/governance-policy`);
    assert.strictEqual(protectedPolicy.status, 200, JSON.stringify(protectedPolicy.data));
    assert.strictEqual(protectedPolicy.data.data.capabilities.markTest, false);
    assert.strictEqual(Number(protectedPolicy.data.data.usage.ballots), 1);
    const blocked = await call(base, `/admin/campaigns/${protectedCampaign.id}/governance/mark-test`, { method: 'POST', body: { rowVersion: Number(protectedPolicy.data.data.campaign.RowVersion), reason: 'Must be blocked by ballot evidence' } });
    assert.strictEqual(blocked.status, 409, JSON.stringify(blocked.data));
    assert.strictEqual(blocked.data.code, 'CAMPAIGN_GOVERNANCE_BLOCKED');

    const retainedPolicy = await call(base, `/admin/campaigns/${retained.id}/governance-policy`);
    assert.strictEqual(retainedPolicy.data.data.capabilities.archive, true);
    const archived = await call(base, `/admin/campaigns/${retained.id}/governance/archive`, { method: 'POST', body: { rowVersion: Number(retainedPolicy.data.data.campaign.RowVersion), reason: 'Retain completed campaign evidence' } });
    assert.strictEqual(archived.status, 200, JSON.stringify(archived.data));
    assert.strictEqual(archived.data.data.campaign.Status, 'Archived');
    assert.strictEqual(Number(archived.data.data.campaign.IsHidden), 1);
    const restored = await call(base, `/admin/campaigns/${retained.id}/governance/restore`, { method: 'POST', body: { rowVersion: Number(archived.data.data.campaign.RowVersion) } });
    assert.strictEqual(restored.status, 200, JSON.stringify(restored.data));
    assert.strictEqual(restored.data.data.campaign.Status, 'Published');
    assert.strictEqual(Number(restored.data.data.campaign.IsHidden), 1, 'restore must remain hidden until explicit unhide');
    const unhidden = await call(base, `/admin/campaigns/${retained.id}/governance/unhide`, { method: 'POST', body: { rowVersion: Number(restored.data.data.campaign.RowVersion) } });
    assert.strictEqual(unhidden.status, 200, JSON.stringify(unhidden.data));
    assert.strictEqual(Number(unhidden.data.data.campaign.IsHidden), 0);
    console.log(`PASS ${label} governance lifecycle (hide/test/archive/restore/void/purge + protected business data)`);
}

async function browserUat(db) {
    const testCampaign = await makeDraft(db, 'TEST-BROWSER-2026', 'Browser governance test campaign');
    const hiddenCampaign = await makeDraft(db, 'HIDDEN-BROWSER-2026', 'Browser hidden campaign');
    await db.query("UPDATE SafetyVote_Campaigns SET IsTest=1,IsHidden=1,TestReason='Browser governance fixture',HideReason='Test campaign is hidden from participants' WHERE id=?", [testCampaign.id]);
    await db.query("UPDATE SafetyVote_Campaigns SET IsHidden=1,HideReason='Browser governance fixture' WHERE id=?", [hiddenCampaign.id]);
    const browserCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
    const executablePath = browserCandidates.find(candidate => fs.existsSync(candidate));
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:5181/__ux1-admin', { waitUntil: 'networkidle' });
        await page.locator('[data-sv-workspace="campaigns"]').first().click();
        await page.locator('[data-sv-view="test"]').click();
        await page.locator('.sv-campaign-card').filter({ hasText: 'Browser governance test campaign' }).first().waitFor({ state: 'attached' });
        assert((await page.locator('.sv-campaign-card').filter({ hasText: 'Browser governance test campaign' }).getByText('TEST', { exact: true }).count()) > 0, 'TEST badge missing');
        await page.locator('[data-sv-view="hidden"]').click();
        await page.locator('.sv-campaign-card').filter({ hasText: 'Browser hidden campaign' }).first().waitFor({ state: 'attached' });
        assert((await page.locator('.sv-campaign-card').filter({ hasText: 'Browser hidden campaign' }).getByText('ซ่อนอยู่', { exact: true }).count()) > 0, 'hidden badge missing');
        assert.strictEqual(await page.locator('.sv-ux-shell').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'governance mobile overflow');
        assert.deepStrictEqual(errors, [], `governance browser errors: ${errors.join(' | ')}`);
        await page.close();
    } finally { await browser.close(); }
    console.log('PASS Admin governance Browser UAT (TEST/hidden tabs, badges, 390px responsive)');
}

async function main() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').toLowerCase()), 'Refusing non-loopback DB');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const dbs = {};
    for (const [label, name] of Object.entries(names)) {
        assert(guard.test(name));
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        dbs[label] = await seed(name);
    }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5181' }, stdio: 'ignore', windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-S', '127.0.0.1:5182', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true }));
    await Promise.all([wait('http://127.0.0.1:5181/__ready'), wait('http://127.0.0.1:5182/__ready')]);
    await lifecycle('Node', 'http://127.0.0.1:5181/api/safety-vote', dbs.node);
    await browserUat(dbs.node);
    await lifecycle('PHP', 'http://127.0.0.1:5182/api/safety-vote', dbs.php);
    for (const db of Object.values(dbs)) await db.end();
    console.log('Safety Vote campaign governance guarded Node/PHP API UAT: PASS (zero residue)');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        await admin.end().catch(() => {});
    }
});
