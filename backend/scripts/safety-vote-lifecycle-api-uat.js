'use strict';

const assert = require('assert');
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
const reportFiles = [];
let admin;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const bangkokSql = instant => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

async function waitReady(url) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function call(base, route, { method = 'GET', body, token = 'sv-admin', headers: extra = {} } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...extra };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
    return { status: response.status, data, headers: response.headers };
}

async function rawCall(base, route) {
    const response = await fetch(`${base}${route}`, { headers: { Authorization: 'Bearer sv-admin' } });
    return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers };
}

async function seed(name) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','active',NOW(),1),(2,'Production','active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@example.test','x',0),('SV-USER','User','Production','Line 1','User','B','Operator','user@example.test','x',0),('SV-USER2','User Two','Production','Line 1','User','B','Operator','user2@example.test','x',0);");
    for (let index = 1; index <= 5; index += 1) {
        const n = String(index).padStart(2, '0');
        await db.query('INSERT INTO Employees VALUES(?,?,?,?,?,?,?,?,?,?)', [`SV-L${n}`, `Load ${n}`, 'Production', 'Line 1', 'User', 'B', 'Operator', `load${n}@example.test`, 'x', 0]);
    }
    const migrations = ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql', '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql', '20261010_safety_vote_ux_phase9c_engagement_analytics.sql', '20261015_safety_vote_live_results.sql', '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql'];
    for (const migration of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='module_enabled'");
    await db.end();
}

async function lifecycle(label, base) {
    const futureOpen = bangkokSql(Date.now() + 3600_000);
    const futureClose = bangkokSql(Date.now() + 7200_000);
    const created = await call(base, '/admin/campaigns', { method: 'POST', body: {
        titleTh: `${label} Full Lifecycle`, summary: 'Guarded full lifecycle UAT', description: 'Draft through official export',
        campaignType: 'popular_vote', privacyMode: 'identified', resultVisibility: 'live', discoveryMode: 'public_listing',
        openAt: futureOpen, closeAt: futureClose, maxParticipationAttempts: 1, privacyThreshold: 5,
        liveLeaderboardEnabled: true, liveLeaderboardTopN: 5, liveLeaderboardScoreMode: 'count_percentage',
        liveLeaderboardVisibility: 'after_submit', liveLeaderboardRefreshSeconds: 15, liveLeaderboardPrivacyThreshold: 5
    } });
    assert.strictEqual(created.status, 201, `${label} create: ${JSON.stringify(created.data)}`);
    const campaignId = Number(created.data.data.id), version = Number(created.data.data.VersionNo || 1);

    const notReady = await call(base, `/admin/campaigns/${campaignId}/readiness`);
    assert.strictEqual(notReady.status, 200, `${label} pre-freeze readiness`);
    assert.strictEqual(notReady.data.data.ready, false);

    const builder = await call(base, `/admin/campaigns/${campaignId}/builder`, { method: 'PUT', body: { questions: [{ questionCode: 'Q1', questionType: 'single_choice', title: 'เลือกผลงานที่ชื่นชอบ', isRequired: true, minSelections: 1, maxSelections: 1, options: [{ optionCode: 'A', label: 'ผลงาน A' }, { optionCode: 'B', label: 'ผลงาน B' }] }] } });
    assert.strictEqual(builder.status, 200, `${label} builder: ${JSON.stringify(builder.data)}`);
    const question = builder.data.data.questions[0], optionA = Number(question.options[0].id), optionB = Number(question.options[1].id);

    const rules = await call(base, `/admin/campaigns/${campaignId}/eligibility/rules`, { method: 'PUT', body: { rules: [{ ruleGroup: 1, ruleOrder: 1, effect: 'include', attributeKey: 'department_id', operator: 'equals', values: ['2'], reason: 'Production lifecycle voters' }] } });
    assert.strictEqual(rules.status, 200, `${label} rules: ${JSON.stringify(rules.data)}`);
    const freezeEligibility = await call(base, `/admin/campaigns/${campaignId}/eligibility/freeze`, { method: 'POST', body: { reason: 'Full lifecycle readiness freeze' } });
    assert.strictEqual(freezeEligibility.status, 201, `${label} freeze: ${JSON.stringify(freezeEligibility.data)}`);
    assert.strictEqual(Number(freezeEligibility.data.data.eligibleCount), 7, `${label} frozen voter population`);

    const ready = await call(base, `/admin/campaigns/${campaignId}/readiness`);
    assert.strictEqual(ready.status, 200, `${label} readiness: ${JSON.stringify(ready.data)}`);
    assert.strictEqual(ready.data.data.ready, true, `${label} authoritative readiness`);
    assert.strictEqual(ready.data.data.blockers.length, 0);

    const scheduled = await call(base, `/admin/campaigns/${campaignId}/lifecycle/schedule`, { method: 'POST', body: {} });
    assert.strictEqual(scheduled.status, 200, `${label} schedule: ${JSON.stringify(scheduled.data)}`);
    assert.strictEqual(scheduled.data.data.status, 'Scheduled');
    const early = await call(base, `/campaigns/${campaignId}/ballot/submit`, { method: 'POST', token: 'sv-user', headers: { 'Idempotency-Key': `${label}-early-ballot-0001` }, body: { campaignVersion: version, acknowledgedRules: true, answers: [{ questionId: Number(question.id), optionIds: [optionA] }] } });
    assert.strictEqual(early.status, 409, `${label} early voting must be blocked`);

    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: names[label] });
    await db.query('UPDATE SafetyVote_Campaigns SET ScheduledOpenAt=DATE_SUB(NOW(),INTERVAL 1 MINUTE),ScheduledCloseAt=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE id=?', [campaignId]);
    await db.query('UPDATE SafetyVote_CampaignVersions SET OpenAt=DATE_SUB(NOW(),INTERVAL 1 MINUTE),CloseAt=DATE_ADD(NOW(),INTERVAL 1 HOUR) WHERE id=?', [created.data.data.CurrentVersionID]);
    await db.query("UPDATE Employees SET Team='DRIFTED' WHERE EmployeeID='SV-L05'");
    const driftedReadiness = await call(base, `/admin/campaigns/${campaignId}/readiness`);
    assert.strictEqual(driftedReadiness.status, 200, `${label} drifted readiness response`);
    assert.strictEqual(driftedReadiness.data.data.ready, false, `${label} master-data drift invalidates readiness: ${JSON.stringify(driftedReadiness.data)}`);
    const blockedDue = await call(base, '/admin/operations/process-due', { method: 'POST', body: {} });
    assert.strictEqual(blockedDue.status, 200, `${label} drifted schedule processor: ${JSON.stringify(blockedDue.data)}`);
    assert(!blockedDue.data.data.changed.some(row => Number(row.id) === campaignId), `${label} drifted frozen audience must not open`);
    const blockedCampaign = blockedDue.data.data.skipped.find(row => Number(row.id) === campaignId);
    assert(blockedCampaign?.blockers?.some(code => ['ELIGIBILITY_NOT_DRIFTED', 'ELIGIBILITY_ROWS_UNCHANGED'].includes(code)), `${label} schedule processor exposes audience drift blocker`);
    const [[stillScheduled]] = await db.query('SELECT Status FROM SafetyVote_Campaigns WHERE id=?', [campaignId]);
    assert.strictEqual(stillScheduled.Status, 'Scheduled', `${label} campaign remains scheduled while readiness drift exists`);
    await db.query("UPDATE Employees SET Team='B' WHERE EmployeeID='SV-L05'");
    const processed = await call(base, '/admin/operations/process-due', { method: 'POST', body: {} });
    assert.strictEqual(processed.status, 200, `${label} schedule processor: ${JSON.stringify(processed.data)}`);
    assert(processed.data.data.changed.some(row => Number(row.id) === campaignId && row.status === 'Open'), `${label} scheduled campaign opened`);

    const voters = ['sv-user', 'sv-user2', 'sv-load-01', 'sv-load-02', 'sv-load-03', 'sv-load-04', 'sv-load-05'];
    for (let index = 0; index < voters.length; index += 1) {
        const voted = await call(base, `/campaigns/${campaignId}/ballot/submit`, { method: 'POST', token: voters[index], headers: { 'Idempotency-Key': `${label}-lifecycle-vote-${String(index).padStart(4, '0')}` }, body: { campaignVersion: version, acknowledgedRules: true, answers: [{ questionId: Number(question.id), optionIds: [index < 4 ? optionA : optionB] }] } });
        assert.strictEqual(voted.status, 201, `${label} vote ${index + 1}: ${JSON.stringify(voted.data)}`);
        if (index === 3) {
            const masked = await call(base, `/admin/campaigns/${campaignId}/live-results`);
            assert.strictEqual(masked.status, 200);
            assert.strictEqual(masked.data.data.status, 'threshold_not_met');
            assert.strictEqual(masked.data.data.totalAcceptedVotes, null);
        }
        if (index === 4) {
            const live = await call(base, `/campaigns/${campaignId}/live-results`, { token: voters[index] });
            assert.strictEqual(live.status, 200, `${label} live result: ${JSON.stringify(live.data)}`);
            assert.strictEqual(live.data.data.status, 'available');
            assert.strictEqual(Number(live.data.data.totalAcceptedVotes), 5);
        }
    }

    const detail = await call(base, `/campaigns/${campaignId}`, { token: 'sv-user' });
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.data.data.participation.state || detail.data.data.participation.State, 'submitted');
    assert(detail.data.data.ownResponses?.length >= 1, `${label} submitted choice remains viewable by its voter`);

    const closed = await call(base, `/admin/campaigns/${campaignId}/lifecycle/close`, { method: 'POST', body: {} });
    assert.strictEqual(closed.status, 200, `${label} close: ${JSON.stringify(closed.data)}`);
    assert.strictEqual(closed.data.data.status, 'Closed');
    assert.strictEqual((await call(base, `/admin/campaigns/${campaignId}/live-results`)).status, 409, `${label} live endpoint closes with campaign`);

    const calculated = await call(base, `/admin/campaigns/${campaignId}/results/calculate`, { method: 'POST', body: {} });
    assert.strictEqual(calculated.status, 201, `${label} calculate: ${JSON.stringify(calculated.data)}`);
    const snapshotId = Number(calculated.data.data.id), resultHash = calculated.data.data.resultHash;
    assert.strictEqual(calculated.data.data.tieState, 'none');
    assert.strictEqual(Number(calculated.data.data.participationCount), 7);
    const dashboard = await call(base, `/admin/campaigns/${campaignId}/results/dashboard?snapshotId=${snapshotId}`);
    assert.strictEqual(dashboard.status, 200, `${label} dashboard: ${JSON.stringify(dashboard.data)}`);
    assert.strictEqual(dashboard.data.data.available, true);
    assert.strictEqual(dashboard.data.data.identityFieldsIncluded, false);
    assert.strictEqual(Number(dashboard.data.data.totalResultRows), 2);

    const frozen = await call(base, `/admin/campaigns/${campaignId}/results/${snapshotId}/freeze`, { method: 'POST', body: {} });
    assert.strictEqual(frozen.status, 200, `${label} result freeze`);
    const assigned = await call(base, `/admin/campaigns/${campaignId}/certifiers`, { method: 'POST', body: { employeeId: 'SV-ADMIN', reason: 'Independent UAT certification' } });
    assert.strictEqual(assigned.status, 201, `${label} certifier assignment: ${JSON.stringify(assigned.data)}`);
    const certified = await call(base, `/admin/campaigns/${campaignId}/results/${snapshotId}/certify`, { method: 'POST', body: { resultHash, reason: 'Verified against the immutable UAT snapshot' } });
    assert.strictEqual(certified.status, 201, `${label} certify: ${JSON.stringify(certified.data)}`);
    assert.strictEqual(certified.data.data.campaignStatus, 'Certified', `${label} campaign enters Certified state`);
    const published = await call(base, `/admin/campaigns/${campaignId}/results/${snapshotId}/publish`, { method: 'POST', body: {} });
    assert.strictEqual(published.status, 200, `${label} publish: ${JSON.stringify(published.data)}`);
    assert.strictEqual(published.data.data.campaignStatus, 'Published');

    for (const format of ['excel', 'pdf']) {
        const exported = await call(base, `/admin/campaigns/${campaignId}/exports/certified-report`, { method: 'POST', body: { snapshotId, format } });
        assert.strictEqual(exported.status, 201, `${label} ${format}: ${JSON.stringify(exported.data)}`);
        assert.strictEqual(exported.data.data.documentStatus, 'OFFICIAL_CERTIFIED_RESULT');
        assert.strictEqual(exported.data.data.classification, 'AUTHORIZED_AGGREGATE_ONLY');
        const file = await rawCall(base, `/admin/campaigns/${campaignId}/reports/${encodeURIComponent(exported.data.data.reportId)}/file`);
        assert.strictEqual(file.status, 200, `${label} ${format} download`);
        if (format === 'pdf') assert.strictEqual(file.buffer.subarray(0, 5).toString(), '%PDF-');
        else assert.strictEqual(file.buffer.subarray(0, 2).toString(), 'PK');
    }

    const userResults = await call(base, `/campaigns/${campaignId}/results`, { token: 'sv-user' });
    assert.strictEqual(userResults.status, 200, `${label} published user results`);
    const [[finalCampaign]] = await db.query('SELECT Status,OpenedAt,ClosedAt,CertifiedAt,PublishedAt FROM SafetyVote_Campaigns WHERE id=?', [campaignId]);
    assert.strictEqual(finalCampaign.Status, 'Published');
    for (const row of (await db.query('SELECT StoredName FROM SafetyVote_Reports rp JOIN SafetyVote_ResultSnapshots rs ON rs.id=rp.ResultSnapshotID WHERE rs.CampaignID=?', [campaignId]))[0]) reportFiles.push({ label, storedName: row.StoredName });
    await db.end();
    console.log(`PASS ${label}: Draft -> readiness -> freeze -> Scheduled/Open -> vote/live -> Close -> Certify/Publish -> Excel/PDF`);
}

async function main() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Local database only');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    for (const name of Object.values(names)) { assert(guard.test(name)); await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await seed(name); }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5191' }, stdio: 'ignore', windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-S', '127.0.0.1:5192', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true }));
    await Promise.all([waitReady('http://127.0.0.1:5191/__ready'), waitReady('http://127.0.0.1:5192/__ready')]);
    await lifecycle('node', 'http://127.0.0.1:5191/api/safety-vote');
    await lifecycle('php', 'http://127.0.0.1:5192/api/safety-vote');
    console.log('Safety Vote full lifecycle guarded Node/PHP API UAT: PASS');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(300);
    for (const report of reportFiles) {
        const directory = report.label === 'node' ? path.join(root, 'backend', 'private-uploads', 'safety-vote', 'reports') : path.join(root, 'api', 'private', 'safety-vote', 'reports');
        const target = path.resolve(directory, path.basename(report.storedName));
        if (target.startsWith(path.resolve(directory) + path.sep)) fs.rmSync(target, { force: true });
    }
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        for (const name of Object.values(names)) { const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [name]); if (Number(row.count) !== 0) process.exitCode = 1; }
        await admin.end().catch(() => {});
    }
});
