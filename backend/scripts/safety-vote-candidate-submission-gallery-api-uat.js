'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const privateDir = path.resolve(root, 'backend', 'private-uploads', 'safety-vote');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const children = [];
const storedFiles = new Set();
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
    '20261024_safety_vote_candidate_submission_gallery.sql'
];

async function wait(url) { for (let i = 0; i < 100; i++) { try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch {} await sleep(150); } throw new Error(`Fixture timeout: ${url}`); }
async function request(base, route, { method = 'GET', token = 'sv-admin', body } = {}) { const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }; if (body !== undefined) headers['Content-Type'] = 'application/json'; const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); const type = response.headers.get('content-type') || ''; return { status: response.status, data: type.includes('json') ? await response.json() : await response.arrayBuffer() }; }
async function upload(base, route, { token = 'sv-admin', altText = 'ภาพแนวคิดลดความเสี่ยง', caption = 'ชื่อจริง Alice ต้องไม่แสดงใน blind judging', mime = 'image/png' } = {}) { const bytes = mime === 'image/png' ? Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') : Buffer.from('not-an-image'); const form = new FormData(); form.append('altText', altText); form.append('caption', caption); form.append('file', new Blob([bytes], { type: mime }), mime === 'image/png' ? 'work.png' : 'work.txt'); const response = await fetch(base + route, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form }); return { status: response.status, data: await response.json() }; }

async function seed(name) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1),(2,'Production','Active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','a@x','x',0),('SV-USER','Juror One','Production','Line 1','User','B','Operator','u@x','x',0),('SV-USER2','Unassigned User','Production','Line 1','User','B','Operator','u2@x','x',0);INSERT INTO Admin_UserPermissions VALUES('SV-USER','SAFETY_VOTE_JURY',1);");
    for (const file of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='gallery-uat' WHERE SettingKey='module_enabled'");
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,CreatedBy,UpdatedBy) VALUES('GALLERY-UAT','Draft','SV-ADMIN','eligible_only','SV-ADMIN','SV-ADMIN')");
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','jury_scoring','confidential','Gallery UAT','certified_only','Draft','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const [stage] = await db.query("INSERT INTO SafetyVote_Stages(CampaignVersionID,StageKey,StageName,StageType,SequenceNo,AdvanceRuleJson,CreatedBy,UpdatedBy) VALUES(?,'JURY','Jury','jury',1,?,'SV-ADMIN','SV-ADMIN')", [version.insertId, JSON.stringify({ blind: true })]);
    const [question] = await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,StageID,QuestionCode,QuestionType,Title,CreatedBy,UpdatedBy) VALUES(?,?,'WORK','single_choice','Work','SV-ADMIN','SV-ADMIN')", [version.insertId, stage.insertId]);
    const [option] = await db.query("INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,CreatedBy,UpdatedBy) VALUES(?,'A','Alice Work','SV-ADMIN','SV-ADMIN')", [question.insertId]);
    const [candidate] = await db.query("INSERT INTO SafetyVote_Candidates(CampaignVersionID,StageID,OptionID,CandidateNo,DisplayName,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,?,'A01','Alice Real Name',1,'SV-ADMIN','SV-ADMIN')", [version.insertId, stage.insertId, option.insertId]);
    await db.query("INSERT INTO SafetyVote_JuryAssignments(CampaignVersionID,StageID,CandidateID,JurorEmployeeID,Status,ConflictState,AssignedBy) VALUES(?,?,?,'SV-USER','Draft','clear','SV-ADMIN')", [version.insertId, stage.insertId, candidate.insertId]);
    const [submission] = await db.query("INSERT INTO SafetyVote_Submissions(CampaignID,CampaignVersionID,SubmitterEmployeeID,SubmissionCode,Title,Description,Status) VALUES(?,?,?,'SUB-UAT-001','Submission Work','Detail','Draft')", [campaign.insertId, version.insertId, 'SV-USER']);
    const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,Status,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,REPEAT('a',64),REPEAT('b',64),1,1,0,'frozen',NOW(),'SV-ADMIN','SV-ADMIN')", [version.insertId]);
    await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,EligibilityState,InclusionSource) VALUES(?,'SV-USER','Juror One','eligible','rule')", [snapshot.insertId]);
    await db.end();
    return { campaignId: Number(campaign.insertId), candidateId: Number(candidate.insertId), optionId: Number(option.insertId), submissionId: Number(submission.insertId) };
}

async function lifecycle(label, base, ids, name) {
    assert.strictEqual((await request(base, '/admin/health')).status, 200);
    let result = await upload(base, `/admin/campaigns/${ids.campaignId}/candidates/${ids.candidateId}/gallery`);
    assert.strictEqual(result.status, 201, `${label}: ${JSON.stringify(result.data)}`);
    const candidateItem = result.data.data;
    result = await request(base, `/admin/campaigns/${ids.campaignId}/candidates`);
    assert.strictEqual(result.status, 200, `${label}: ${JSON.stringify(result.data)}`);
    assert.strictEqual(result.data.data.rows[0].gallery.length, 1);
    result = await request(base, `/gallery/candidates/${ids.candidateId}`, { token: 'sv-user' });
    assert.strictEqual(result.status, 200, `${label}: ${JSON.stringify(result.data)}`);
    assert.strictEqual(result.data.data.blind, true);
    assert.strictEqual(result.data.data.items[0].caption, null);
    assert(!JSON.stringify(result.data.data.items).includes('Alice'));
    assert.strictEqual((await request(base, `/gallery/candidates/${ids.candidateId}`, { token: 'sv-user2' })).status, 403);
    assert.strictEqual((await request(base, `/files/${candidateItem.fileId}`, { token: 'sv-user' })).status, 200);
    assert([404, 409].includes((await upload(base, `/admin/campaigns/999999/candidates/${ids.candidateId}/gallery`)).status));

    const gateDb = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name });
    await gateDb.query("UPDATE SafetyVote_Campaigns SET Status='Open' WHERE id=?", [ids.campaignId]);
    await gateDb.end();

    result = await upload(base, `/submissions/${ids.submissionId}/gallery`, { token: 'sv-user', altText: 'ภาพผลงานผู้ส่ง', caption: 'มุมด้านหน้า' });
    assert.strictEqual(result.status, 201, `${label}: ${JSON.stringify(result.data)}`);
    const submissionItem = result.data.data;
    result = await request(base, `/gallery/submissions/${ids.submissionId}`, { token: 'sv-user' });
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.data.items[0].caption, 'มุมด้านหน้า');
    assert.strictEqual((await request(base, `/gallery/submissions/${ids.submissionId}`, { token: 'sv-user2' })).status, 403);
    result = await request(base, `/gallery/submission/${ids.submissionId}`, { method: 'PUT', token: 'sv-user', body: { items: [{ id: submissionItem.id, altText: 'ภาพแก้ไข', caption: 'คำบรรยายใหม่', isCover: true }] } });
    assert.strictEqual(result.status, 200, `${label}: ${JSON.stringify(result.data)}`);
    assert.strictEqual(result.data.data.items[0].altText, 'ภาพแก้ไข');
    assert.strictEqual((await request(base, `/gallery/items/${submissionItem.id}`, { method: 'DELETE', token: 'sv-user' })).status, 200);
    assert.strictEqual((await upload(base, `/submissions/${ids.submissionId}/gallery`, { token: 'sv-user', mime: 'text/plain' })).status, 400);

    const closedDb = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name });
    await closedDb.query("UPDATE SafetyVote_Campaigns SET Status='Closed' WHERE id=?", [ids.campaignId]);
    await closedDb.end();
    const closedDenied = await upload(base, `/submissions/${ids.submissionId}/gallery`, { token: 'sv-user' });
    assert.strictEqual(closedDenied.status, 409);
    assert.strictEqual(closedDenied.data.code, 'CAMPAIGN_NOT_IN_VOTING_WINDOW');

    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name });
    const [files] = await db.query('SELECT StoredName FROM SafetyVote_Files');
    files.forEach(file => storedFiles.add(path.basename(file.StoredName)));
    const [[proof]] = await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_GalleryItems WHERE Status='Active') activeItems,(SELECT COUNT(*) FROM SafetyVote_GalleryItems WHERE Status='Removed') removedItems,(SELECT COUNT(*) FROM SafetyVote_Files WHERE FilePurpose='candidate_gallery') candidateFiles,(SELECT COUNT(*) FROM SafetyVote_Files WHERE FilePurpose='submission_gallery') submissionFiles");
    assert.deepStrictEqual(Object.fromEntries(Object.entries(proof).map(([key, value]) => [key, Number(value)])), { activeItems: 1, removedItems: 1, candidateFiles: 1, submissionFiles: 1 });
    await db.end();
    console.log(`PASS ${label} candidate/submission gallery upload, blind access, private file, metadata, removal and MIME rejection`);
}

(async () => {
    assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST).toLowerCase()));
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const ids = {};
    for (const [stack, name] of Object.entries(names)) { assert(guard.test(name)); await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); ids[stack] = await seed(name); }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5115' }, stdio: 'ignore', windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', '127.0.0.1:5116', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true }));
    await Promise.all([wait('http://127.0.0.1:5115/__ready'), wait('http://127.0.0.1:5116/__ready')]);
    await lifecycle('node', 'http://127.0.0.1:5115/api/safety-vote', ids.node, names.node);
    await lifecycle('php', 'http://127.0.0.1:5116/api/safety-vote', ids.php, names.php);
    console.log('Safety Vote candidate/submission gallery disposable Node/PHP API UAT: PASS');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    if (admin) { for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {}); await admin.end(); }
    for (const storedName of storedFiles) { const target = path.resolve(privateDir, storedName); if (path.dirname(target) === privateDir && fs.existsSync(target)) fs.unlinkSync(target); }
});
