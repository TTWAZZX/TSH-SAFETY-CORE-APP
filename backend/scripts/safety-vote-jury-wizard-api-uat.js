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
let admin;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const migrations = [
    '20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql',
    '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
    '20261010_safety_vote_ux_phase9c_engagement_analytics.sql', '20261015_safety_vote_live_results.sql',
    '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql',
    '20261020_safety_vote_eligibility_amendments.sql', '20261024_safety_vote_question_images.sql',
    '20261024_safety_vote_candidate_submission_gallery.sql', '20261025_safety_vote_official_topn_next_cycle.sql',
    '20261025_safety_vote_result_release_policy.sql', '20261025_safety_vote_jury_work_items_atomic_media.sql'
];

async function seed(name) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@example.test','x',0),('SV-USER','Juror One','Safety','Core','User','A','Officer','one@example.test','x',0),('SV-USER2','Juror Two','Safety','Core','User','A','Officer','two@example.test','x',0);");
    for (const file of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    await db.query("INSERT INTO Admin_UserPermissions(employee_id,permission,granted) VALUES('SV-USER','SAFETY_VOTE_JURY',0),('SV-USER2','SAFETY_VOTE_JURY',0) ON DUPLICATE KEY UPDATE granted=VALUES(granted)");
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='jury-wizard-uat' WHERE SettingKey='module_enabled'");
    await db.end();
}

async function wait(url) {
    for (let index = 0; index < 100; index++) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function call(base, route, { method = 'GET', body, token = 'sv-admin' } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch (_) { data = text; }
    return { status: response.status, data };
}

async function lifecycle(label, base, name) {
    let response = await call(base, '/people?q=Juror&limit=1');
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.source, 'employee_master');
    assert.strictEqual(response.data.data.rows.length, 1);
    assert.strictEqual(response.data.data.hasMore, true);
    assert(!Object.prototype.hasOwnProperty.call(response.data.data.rows[0], 'CompanyEmail'));
    assert(!Object.prototype.hasOwnProperty.call(response.data.data.rows[0], 'companyEmail'));
    response = await call(base, '/people?employeeId=SV-USER2');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.data.rows[0].employeeId, 'SV-USER2');
    assert.strictEqual((await call(base, '/people?q=J')).status, 400);
    response = await call(base, '/admin/campaigns', { method: 'POST', body: { titleTh: `Jury Wizard ${label}`, campaignType: 'jury_scoring', privacyMode: 'confidential', resultVisibility: 'certified_only', privacyThreshold: 5 } });
    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    const campaignId = Number(response.data.data.id);
    response = await call(base, `/admin/campaigns/${campaignId}/works`, { method: 'PUT', body: { workSource: 'admin_curated', works: [{ workCode:'WORK-01', title:'Work one', description:'Phase 5B governed work item' },{ workCode:'WORK-02', title:'Work two', description:'Second governed work item' }] } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.serverConfirmed, true);
    const workId = Number(response.data.data.rows[0].id);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const uploadDirectory = label === 'node' ? path.join(root, 'backend', 'private-uploads', 'safety-vote') : path.join(root, 'api', 'private', 'safety-vote');
    const filesBeforeRejectedUpload = new Set(await fs.promises.readdir(uploadDirectory).catch(() => []));
    const rejectedForm = new FormData(); rejectedForm.append('scopeType', 'work_cover'); rejectedForm.append('scopeId', '999999999'); rejectedForm.append('altText', 'Missing work'); rejectedForm.append('file', new Blob([png], { type: 'image/png' }), 'missing-work.png');
    const rejectedUpload = await fetch(`${base}/admin/campaigns/${campaignId}/media/atomic`, { method: 'POST', headers: { Authorization: 'Bearer sv-admin', 'Idempotency-Key': `missing-work-${label}` }, body: rejectedForm });
    assert.strictEqual(rejectedUpload.status, 404, await rejectedUpload.text());
    assert.deepStrictEqual(new Set(await fs.promises.readdir(uploadDirectory).catch(() => [])), filesBeforeRejectedUpload, 'Rejected atomic upload must not leave private bytes');
    const uploadWorkCover = async () => { const form = new FormData(); form.append('scopeType', 'work_cover'); form.append('scopeId', String(workId)); form.append('altText', 'Work one cover'); form.append('file', new Blob([png], { type: 'image/png' }), 'work-one.png'); const uploaded = await fetch(`${base}/admin/campaigns/${campaignId}/media/atomic`, { method: 'POST', headers: { Authorization: 'Bearer sv-admin', 'Idempotency-Key': `work-cover-${label}` }, body: form }); return { status: uploaded.status, data: await uploaded.json() }; };
    response = await uploadWorkCover();
    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.serverConfirmed, true);
    const coverFileId = Number(response.data.data.fileId);
    response = await uploadWorkCover();
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.replayed, true);
    response = await call(base, `/admin/campaigns/${campaignId}/stages`, { method: 'PUT', body: { stages: [{ stageKey: 'JURY_FINAL', stageName: 'รอบตัดสิน', stageType: 'jury', sequenceNo: 1, advanceRule: { blind: true }, resultVisibility: 'admin_only', status: 'Draft' }] } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    const stageId = Number(response.data.data.rows[0].id);
    assert(stageId > 0, 'Persisted stage ID required');
    response = await call(base, `/admin/campaigns/${campaignId}/jury/master?q=Juror`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.data.source, 'employee_master');
    assert.strictEqual(response.data.data.rows.length, 2);
    response = await call(base, `/admin/campaigns/${campaignId}/jury/criteria`, { method: 'PUT', body: { stageId, criteria: [{ criterionCode: 'CREATIVITY', title: 'ความคิดสร้างสรรค์', minScore: 1, maxScore: 5, weight: 60 }, { criterionCode: 'PRACTICAL', title: 'ใช้งานได้จริง', minScore: 1, maxScore: 5, weight: 40 }] } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    response = await call(base, `/admin/campaigns/${campaignId}/jury/assignments`, { method: 'POST', body: { stageId, jurorEmployeeId: 'SV-USER' } });
    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    const immutableId = Number(response.data.data.id);
    assert.strictEqual((await call(base, `/admin/campaigns/${campaignId}/jury/assignments`, { method: 'POST', body: { stageId, jurorEmployeeId: 'SV-USER' } })).status, 409);

    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name });
    await db.query("UPDATE SafetyVote_CampaignVersions SET OpenAt=DATE_SUB(NOW(),INTERVAL 1 HOUR),CloseAt=DATE_ADD(NOW(),INTERVAL 1 DAY) WHERE id=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?)", [campaignId]);
    response = await call(base, `/admin/campaigns/${campaignId}/readiness`);
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.workflowProfile.eligibilityRequired, false);
    assert.strictEqual(response.data.data.ready, true, JSON.stringify(response.data.data.blockers));
    assert(response.data.data.checks.some(check => check.code === 'ELIGIBILITY_NOT_REQUIRED' && check.ok === true));
    assert(!response.data.data.blockers.some(check => String(check.code).startsWith('ELIGIB')));
    await db.query("UPDATE SafetyVote_Campaigns SET Status='Open' WHERE id=?", [campaignId]);
    response = await call(base, `/campaigns/${campaignId}/works`);
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.readOnly, true);
    assert.strictEqual(response.data.data.rows.length, 2);
    const fileResponse = await fetch(`${base}/files/${coverFileId}`, { headers: { Authorization: 'Bearer sv-user' } });
    assert.strictEqual(fileResponse.status, 200, await fileResponse.text());
    response = await call(base, `/admin/campaigns/${campaignId}/jury/assignments`, { method: 'POST', body: { stageId, jurorEmployeeId: 'SV-USER2' } });
    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    const liveId = Number(response.data.data.id);
    response = await call(base, '/jury/assignments', { token: 'sv-user2' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert(response.data.data.rows.some(row => Number(row.id) === liveId), 'Live-added juror must receive the assignment without global Jury permission');
    assert.strictEqual((await call(base, `/campaigns/${campaignId}/jury/assignments`, { token: 'sv-user2' })).status, 200);
    assert.strictEqual((await call(base, `/jury/assignments/${liveId}`, { token: 'sv-user2' })).status, 200);
    assert.strictEqual((await call(base, `/jury/assignments/${liveId}`, { token: 'sv-user' })).status, 404, 'A juror must not open another juror assignment');
    assert.strictEqual((await call(base, `/jury/assignments/${immutableId}`, { token: 'sv-user' })).status, 200, 'Pre-open assignment must remain accessible after opening');
    await db.query("INSERT INTO SafetyVote_JuryScores(AssignmentID,CandidateID,CriterionID,Score,BoundedComment,Status) SELECT ?,c.id,cr.id,3,'retained draft proof','Draft' FROM SafetyVote_Candidates c JOIN SafetyVote_JuryCriteria cr ON cr.CampaignVersionID=c.CampaignVersionID WHERE c.CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) LIMIT 1", [liveId, campaignId]);
    response = await call(base, `/admin/campaigns/${campaignId}/jury/assignments`);
    assert.strictEqual(response.status, 200);
    assert(response.data.data.rows.some(row => row.JurorName === 'Juror Two' && Number(row.id) === liveId && Number(row.ScoreCount) === 1));
    const revokedWithDraft = await call(base, `/admin/campaigns/${campaignId}/jury/assignments/${liveId}`, { method: 'DELETE' });
    assert.strictEqual(revokedWithDraft.status, 200);
    assert.strictEqual(Number(revokedWithDraft.data.data.retainedDraftScores), 1);
    const revokedGlobalQueue = await call(base, '/jury/assignments', { token: 'sv-user2' });
    assert.strictEqual(revokedGlobalQueue.status, 200);
    assert(!revokedGlobalQueue.data.data.rows.some(row => Number(row.id) === liveId), 'Revoked assignment must disappear from the juror queue');
    const revokedCampaignQueue = await call(base, `/campaigns/${campaignId}/jury/assignments`, { token: 'sv-user2' });
    assert.strictEqual(revokedCampaignQueue.status, 200);
    assert(!revokedCampaignQueue.data.data.rows.some(row => Number(row.id) === liveId), 'Revoked assignment must disappear from the campaign-scoped juror queue');
    const revokedDetail = await call(base, `/jury/assignments/${liveId}`, { token: 'sv-user2' });
    assert.strictEqual(revokedDetail.status, 404, JSON.stringify(revokedDetail.data));
    assert.strictEqual(revokedDetail.data.code, 'ASSIGNMENT_NOT_FOUND');
    const revokedWrite = await call(base, `/jury/assignments/${liveId}/scores`, { method: 'PUT', token: 'sv-user2', body: { scores: [] } });
    assert.strictEqual(revokedWrite.status, 403, JSON.stringify(revokedWrite.data));
    assert.strictEqual(revokedWrite.data.code, 'PARTICIPATION_ASSIGNMENT_REQUIRED');
    response = await call(base, `/admin/campaigns/${campaignId}/jury/assignments`, { method: 'POST', body: { stageId, jurorEmployeeId: 'SV-USER2' } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.restored, true);
    assert.strictEqual(Number(response.data.data.id), liveId);
    assert.strictEqual((await call(base, `/jury/assignments/${liveId}`, { token: 'sv-user2' })).status, 200, 'Restored assignment must become readable again');
    assert.strictEqual(Number((await db.query('SELECT COUNT(*) count FROM SafetyVote_JuryScores WHERE AssignmentID=?', [liveId]))[0][0].count), 1);
    assert.strictEqual((await call(base, `/admin/campaigns/${campaignId}/jury/assignments/${liveId}`, { method: 'DELETE' })).status, 200);
    await db.query("UPDATE SafetyVote_JuryAssignments SET Status='Submitted' WHERE id=?", [immutableId]);
    assert.strictEqual((await call(base, `/admin/campaigns/${campaignId}/jury/assignments/${immutableId}`, { method: 'DELETE' })).status, 409);
    const [[proof]] = await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_JuryAssignments WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?)) assignments,(SELECT COUNT(*) FROM SafetyVote_AuditLogs WHERE CampaignID=? AND Action IN ('SAFETY_VOTE_JURY_ASSIGN','SAFETY_VOTE_JURY_REVOKE')) auditRows,(SELECT COUNT(*) FROM SafetyVote_CampaignRoles WHERE CampaignVersionID=(SELECT CurrentVersionID FROM SafetyVote_Campaigns WHERE id=?) AND CampaignRole='jury' AND IsActive=1) activeRoles,(SELECT COUNT(*) FROM SafetyVote_MediaMutations WHERE CampaignID=?) mediaMutations,(SELECT COUNT(*) FROM SafetyVote_Files WHERE CampaignID=?) mediaFiles", [campaignId, campaignId, campaignId, campaignId, campaignId]);
    assert.strictEqual(Number(proof.assignments), 2);
    assert(Number(proof.auditRows) >= 4);
    assert.strictEqual(Number(proof.activeRoles), 1);
    assert.strictEqual(Number(proof.mediaMutations), 1);
    assert.strictEqual(Number(proof.mediaFiles), 1);
    await db.end();
    console.log(`PASS ${label} adaptive readiness, live add/revoke/restore with retained Draft scores and immutable submitted assignment`);
}

(async () => {
    assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST).toLowerCase()));
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    for (const name of Object.values(names)) { assert(guard.test(name)); await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await seed(name); }
    children.push(
        spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5097' }, stdio: ['ignore','pipe','pipe'], windowsHide: true }),
        spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', '127.0.0.1:5098', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: ['ignore','pipe','pipe'], windowsHide: true })
    );
    for (const child of children) { child.stdout.on('data', chunk => process.stdout.write(chunk)); child.stderr.on('data', chunk => process.stderr.write(chunk)); }
    await Promise.all([wait('http://127.0.0.1:5097/__ready'), wait('http://127.0.0.1:5098/__ready')]);
    await lifecycle('node', 'http://127.0.0.1:5097/api/safety-vote', names.node);
    await lifecycle('php', 'http://127.0.0.1:5098/api/safety-vote', names.php);
    console.log('Safety Vote Jury Wizard guarded disposable Node/PHP API UAT: PASS');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(200);
    if (admin) { for (const [runtime,name] of Object.entries(names)) if (guard.test(name)) { const [files] = await admin.query(`SELECT StoredName FROM \`${name}\`.SafetyVote_Files`).catch(() => [[]]); const directory = runtime === 'node' ? path.join(root, 'backend', 'private-uploads', 'safety-vote') : path.join(root, 'api', 'private', 'safety-vote'); for (const file of files) await fs.promises.unlink(path.join(directory, path.basename(file.StoredName))).catch(() => {}); await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {}); } await admin.end(); }
});
