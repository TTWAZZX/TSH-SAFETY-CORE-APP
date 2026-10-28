'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const children = [];
let admin;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitReady(url) {
    for (let index = 0; index < 100; index += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function call(base, route, { method = 'GET', body } = {}) {
    const headers = { Authorization: 'Bearer sv-admin', Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: JSON.parse(await response.text()) };
}

async function seed(name) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','active',NOW(),1),(2,'Production','active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@example.test','x',0),('SV-USER','User','Production','Line 1','User','B','Operator','user@example.test','x',0),('SV-USER2','User Two','Production','Line 1','User','B','Operator','user2@example.test','x',0);");
    const migrations = ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql', '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql', '20261010_safety_vote_ux_phase9c_engagement_analytics.sql', '20261015_safety_vote_live_results.sql', '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql', '20261020_safety_vote_eligibility_amendments.sql', '20261024_safety_vote_question_images.sql', '20261024_safety_vote_candidate_submission_gallery.sql', '20261025_safety_vote_official_topn_next_cycle.sql', '20261025_safety_vote_result_release_policy.sql', '20261025_safety_vote_jury_work_items_atomic_media.sql'];
    for (const migration of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='module_enabled'");
    await db.end();
}

async function lifecycle(label, base) {
    const permissions = await call(base, '/admin/permissions');
    assert.strictEqual(permissions.status, 200, `${label} permission discovery`);
    assert.strictEqual(permissions.data.data.capabilities.duplicateCampaign, true, `${label} duplicate capability`);

    const payload = { titleTh: `${label} Atomic Source`, summary: 'Atomic duplicate UAT', campaignType: 'popular_vote', privacyMode: 'identified', resultVisibility: 'live', discoveryMode: 'public_listing', officialResultTopN: 37, resultReleasePolicy: 'manual', maxParticipationAttempts: 3, liveLeaderboardEnabled: true, liveLeaderboardTopN: 10, liveLeaderboardScoreMode: 'count_percentage', liveLeaderboardVisibility: 'after_submit', liveLeaderboardRefreshSeconds: 20, liveLeaderboardPrivacyThreshold: 7 };
    const created = await call(base, '/admin/campaigns', { method: 'POST', body: payload });
    assert.strictEqual(created.status, 201, `${label}: ${JSON.stringify(created.data)}`);
    const sourceId = Number(created.data.data.id);
    assert.strictEqual((await call(base, `/admin/campaigns/${sourceId}/builder`, { method: 'PUT', body: { questions: [{ questionCode: 'Q1', questionType: 'single_choice', title: 'เลือกหนึ่งรายการ', isRequired: true, minSelections: 1, maxSelections: 1, options: [{ optionCode: 'A', label: 'ตัวเลือก A' }, { optionCode: 'B', label: 'ตัวเลือก B' }] }] } })).status, 200);
    assert.strictEqual((await call(base, `/admin/campaigns/${sourceId}/eligibility/rules`, { method: 'PUT', body: { rules: [{ ruleGroup: 1, ruleOrder: 1, effect: 'include', attributeKey: 'department_id', operator: 'equals', values: ['2'], reason: 'Production only' }, { ruleGroup: 1, ruleOrder: 2, effect: 'include', attributeKey: 'employee_id', operator: 'equals', values: ['SV-USER'], reason: 'Must be excluded from copy' }] } })).status, 200);
    const revision = await call(base, `/admin/campaigns/${sourceId}/versions`, { method: 'POST', body: { reason: 'Verify custom official result lifecycle' } });
    assert.strictEqual(revision.status, 201, `${label} revision: ${JSON.stringify(revision.data)}`);
    const revisionId = Number(revision.data.data.versionId);
    const revisionUpdate = await call(base, `/admin/campaigns/${sourceId}/versions/${revisionId}`, { method: 'PUT', body: { ...payload, titleTh: `${label} Offline Revision`, officialResultTopN: 41, changeReason: 'Verify custom official result update' } });
    assert.strictEqual(revisionUpdate.status, 200, `${label} revision update: ${JSON.stringify(revisionUpdate.data)}`);

    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: names[label] });
    const [[source]] = await db.query('SELECT c.CurrentVersionID,v.OfficialResultTopN,v.ResultReleasePolicy FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?', [sourceId]);
    assert.deepStrictEqual([Number(source.OfficialResultTopN), source.ResultReleasePolicy], [37, 'manual'], `${label} source official result settings`);
    const [[offlineRevision]] = await db.query('SELECT OfficialResultTopN,ResultReleasePolicy FROM SafetyVote_CampaignVersions WHERE id=?', [revisionId]);
    assert.deepStrictEqual([Number(offlineRevision.OfficialResultTopN), offlineRevision.ResultReleasePolicy], [41, 'manual'], `${label} revision official result settings`);
    const imageName = `duplicate-${label}-${stamp}.png`;
    const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const imageHash = crypto.createHash('sha256').update(imageBytes).digest('hex');
    const storageDirs = [path.join(root, 'backend', 'private-uploads', 'safety-vote'), path.join(root, 'api', 'private', 'safety-vote')];
    for (const directory of storageDirs) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, imageName), imageBytes); }
    const [file] = await db.query("INSERT INTO SafetyVote_Files(CampaignID,CampaignVersionID,FilePurpose,StoredName,OriginalName,MimeType,FileSize,ContentSha256,UploadedBy) VALUES(?,?,'option_image',?,'candidate.png','image/png',?,?, 'SV-ADMIN')", [sourceId, source.CurrentVersionID, imageName, imageBytes.length, imageHash]);
    await db.query("UPDATE SafetyVote_Options o JOIN SafetyVote_Questions q ON q.id=o.QuestionID SET o.FileID=? WHERE q.CampaignVersionID=? AND o.OptionCode='A'", [file.insertId, source.CurrentVersionID]);

    const duplicated = await call(base, `/admin/campaigns/${sourceId}/duplicate`, { method: 'POST', body: {} });
    assert.strictEqual(duplicated.status, 201, `${label}: ${JSON.stringify(duplicated.data)}`);
    const duplicateId = Number(duplicated.data.data.id);
    assert(duplicateId > sourceId);
    assert(duplicated.data.data.excluded.includes('ballots') && duplicated.data.data.excluded.includes('nonOptionFiles'));
    assert.strictEqual(Number(duplicated.data.data.copiedOptionImages), 1, `${label} copied option image count`);

    const [[copy]] = await db.query("SELECT c.Status,c.DiscoveryMode,c.ScheduledOpenAt,c.ScheduledCloseAt,v.id VersionID,v.TitleTh,v.OpenAt,v.CloseAt,v.OfficialResultTopN,v.ResultReleasePolicy,v.MaxParticipationAttempts,v.LiveLeaderboardEnabled,v.LiveLeaderboardTopN,v.LiveLeaderboardScoreMode,v.LiveLeaderboardVisibility,v.LiveLeaderboardRefreshSeconds,v.LiveLeaderboardPrivacyThreshold,(SELECT COUNT(*) FROM SafetyVote_Questions q WHERE q.CampaignVersionID=v.id) questions,(SELECT COUNT(*) FROM SafetyVote_Options o JOIN SafetyVote_Questions q ON q.id=o.QuestionID WHERE q.CampaignVersionID=v.id) options,(SELECT COUNT(*) FROM SafetyVote_EligibilityRules r WHERE r.CampaignVersionID=v.id) rules,(SELECT COUNT(*) FROM SafetyVote_EligibilityRules r WHERE r.CampaignVersionID=v.id AND LOWER(r.AttributeKey) IN ('employee','employee_id','employeeid')) employeeRules FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?", [duplicateId]);
    const [[copiedImage]] = await db.query("SELECT o.FileID,f.CampaignID,f.CampaignVersionID,f.StoredName,f.ContentSha256 FROM SafetyVote_Options o JOIN SafetyVote_Questions q ON q.id=o.QuestionID JOIN SafetyVote_Files f ON f.id=o.FileID WHERE q.CampaignVersionID=? AND o.OptionCode='A'", [copy.VersionID]);
    await db.end();
    assert.strictEqual(copy.Status, 'Draft');
    assert.strictEqual(copy.DiscoveryMode, 'public_listing');
    assert.strictEqual(copy.ScheduledOpenAt, null);
    assert.strictEqual(copy.ScheduledCloseAt, null);
    assert.strictEqual(copy.OpenAt, null);
    assert.strictEqual(copy.CloseAt, null);
    assert(String(copy.TitleTh).endsWith('(สำเนา)'));
    assert.deepStrictEqual([Number(copy.OfficialResultTopN), copy.ResultReleasePolicy, Number(copy.MaxParticipationAttempts), Number(copy.LiveLeaderboardEnabled), Number(copy.LiveLeaderboardTopN), copy.LiveLeaderboardScoreMode, copy.LiveLeaderboardVisibility, Number(copy.LiveLeaderboardRefreshSeconds), Number(copy.LiveLeaderboardPrivacyThreshold), Number(copy.questions), Number(copy.options), Number(copy.rules), Number(copy.employeeRules)], [37, 'manual', 3, 1, 10, 'count_percentage', 'after_submit', 20, 7, 1, 2, 1, 0]);
    assert.notStrictEqual(Number(copiedImage.FileID), Number(file.insertId), `${label} duplicate owns an independent file record`);
    assert.deepStrictEqual([Number(copiedImage.CampaignID), Number(copiedImage.CampaignVersionID), copiedImage.ContentSha256], [duplicateId, Number(copy.VersionID), imageHash]);
    assert.notStrictEqual(copiedImage.StoredName, imageName, `${label} duplicate owns an independent private image`);
    const copiedStorage = label === 'node' ? storageDirs[0] : storageDirs[1];
    assert.deepStrictEqual(fs.readFileSync(path.join(copiedStorage, copiedImage.StoredName)), imageBytes);
    fs.rmSync(path.join(copiedStorage, copiedImage.StoredName), { force: true });
    for (const directory of storageDirs) fs.rmSync(path.join(directory, imageName), { force: true });
    console.log(`PASS ${label} atomic duplicate`);
}

async function main() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Local database only');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    for (const name of Object.values(names)) { assert(guard.test(name)); await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await seed(name); }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5171' }, stdio: 'ignore', windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-S', '127.0.0.1:5172', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true }));
    await Promise.all([waitReady('http://127.0.0.1:5171/__ready'), waitReady('http://127.0.0.1:5172/__ready')]);
    await lifecycle('node', 'http://127.0.0.1:5171/api/safety-vote');
    await lifecycle('php', 'http://127.0.0.1:5172/api/safety-vote');
    console.log('Safety Vote atomic duplicate Node/PHP API UAT: PASS');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    for (const label of Object.keys(names)) for (const directory of [path.join(root, 'backend', 'private-uploads', 'safety-vote'), path.join(root, 'api', 'private', 'safety-vote')]) fs.rmSync(path.join(directory, `duplicate-${label}-${stamp}.png`), { force: true });
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        for (const name of Object.values(names)) { const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [name]); if (Number(row.count) !== 0) process.exitCode = 1; }
        await admin.end().catch(() => {});
    }
});
