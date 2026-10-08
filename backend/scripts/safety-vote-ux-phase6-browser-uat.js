'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn, spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const databaseName = `tsh_safety_vote_phase1_node_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const guard = /^tsh_safety_vote_phase1_node_\d+_\d+$/;
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let admin;
let server;
let dropped = false;

async function addCampaign(db, { code, type, privacy, status = 'Closed', title }) {
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES(?,?,'SV-ADMIN','eligible_only',DATE_SUB(NOW(),INTERVAL 2 DAY),DATE_SUB(NOW(),INTERVAL 1 HOUR),'SV-ADMIN','SV-ADMIN')", [code, status]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,PrivacyThreshold,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1',?,?,?,5,'certified_only','Closed','SV-ADMIN','SV-ADMIN')", [campaign.insertId, type, privacy, title]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    return { id: Number(campaign.insertId), versionId: Number(version.insertId), code, type, privacy, status };
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'UAT refuses non-loopback DB_HOST');
    assert(guard.test(databaseName), 'Disposable database name is outside the guard');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT) DEFAULT CHARSET=utf8mb4;INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1),(2,'Production','Active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0),('SV-CERT-ONE','Certifier One','Safety','Core','User','A','Officer','cert1@local','x',0),('SV-CERT-TWO','Certifier Two','Safety','Core','User','A','Officer','cert2@local','x',0),('SV-RESULT-VIEW','Result Viewer','Safety','Core','User','A','Officer','view@local','x',0),('SV-RESULT-DENIED','Result Denied','Safety','Core','User','A','Officer','denied@local','x',0),('SV-VOTER-1','Voter One','Production','Line 1','User','B','Operator','v1@local','x',0),('SV-VOTER-2','Voter Two','Production','Line 1','User','B','Operator','v2@local','x',0);");
    await db.query("INSERT INTO Admin_RolePermissions VALUES('Admin','SAFETY_VOTE_VIEW',1),('Admin','SAFETY_VOTE_MANAGE',1),('Admin','SAFETY_VOTE_RESULT_VIEW',1),('Admin','SAFETY_VOTE_CERTIFY',1),('Admin','SAFETY_VOTE_AUDIT_VIEW',1)");
    await db.query("INSERT INTO Admin_UserPermissions VALUES('SV-CERT-ONE','SAFETY_VOTE_RESULT_VIEW',1),('SV-CERT-ONE','SAFETY_VOTE_CERTIFY',1),('SV-CERT-ONE','SAFETY_VOTE_AUDIT_VIEW',1),('SV-CERT-ONE','SAFETY_VOTE_VIEW',1),('SV-CERT-TWO','SAFETY_VOTE_RESULT_VIEW',1),('SV-CERT-TWO','SAFETY_VOTE_CERTIFY',1),('SV-CERT-TWO','SAFETY_VOTE_AUDIT_VIEW',1),('SV-CERT-TWO','SAFETY_VOTE_VIEW',1),('SV-RESULT-VIEW','SAFETY_VOTE_RESULT_VIEW',1),('SV-RESULT-VIEW','SAFETY_VOTE_VIEW',1),('SV-RESULT-VIEW','SAFETY_VOTE_CERTIFY',0),('SV-RESULT-VIEW','SAFETY_VOTE_MANAGE',0),('SV-RESULT-VIEW','SAFETY_VOTE_AUDIT_VIEW',0),('SV-RESULT-DENIED','SAFETY_VOTE_RESULT_VIEW',0)");
    for (const migration of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql']) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));

    const secret = await addCampaign(db, { code: 'UX6-SECRET', type: 'secret_election', privacy: 'secret_ballot', title: 'เลือกตั้งลับเพื่อทดสอบการรับรอง' });
    const [eligibility] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),REPEAT('b',64),2,2,0,NOW(),'SV-ADMIN','SV-ADMIN')", [secret.versionId]);
    for (const employee of ['SV-VOTER-1', 'SV-VOTER-2']) await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,AccountReady,EligibilityState,InclusionSource) VALUES(?,?,?,1,'eligible','rule')", [eligibility.insertId, employee, employee]);
    const [question] = await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,QuestionCode,QuestionType,Title,IsRequired,MinSelections,MaxSelections,SortOrder,CreatedBy,UpdatedBy) VALUES(?,'Q1','single_choice','ตำแหน่งตัวแทน',1,1,1,1,'SV-ADMIN','SV-ADMIN')", [secret.versionId]);
    const [option] = await db.query("INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,SortOrder,CreatedBy,UpdatedBy) VALUES(?,'C1','ผู้สมัครลับ',1,'SV-ADMIN','SV-ADMIN')", [question.insertId]);
    const [candidate] = await db.query("INSERT INTO SafetyVote_Candidates(CampaignVersionID,OptionID,CandidateNo,Status,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,'MASK-01','Active',1,'SV-ADMIN','SV-ADMIN')", [secret.versionId, option.insertId]);
    const [position] = await db.query("INSERT INTO SafetyVote_ElectionPositions(CampaignVersionID,QuestionID,PositionCode,Title,SeatCount,MaxSelections,AllowAbstain,TieRule,SortOrder,ConfigHash,CreatedBy) VALUES(?,?,'REP','ตัวแทน',1,1,1,'candidate_id',1,REPEAT('c',64),'SV-ADMIN')", [secret.versionId, question.insertId]);
    await db.query('INSERT INTO SafetyVote_ElectionPositionCandidates(PositionID,CandidateID,SortOrder) VALUES(?,?,1)', [position.insertId, candidate.insertId]);
    for (let index = 1; index <= 2; index++) {
        const employee = `SV-VOTER-${index}`;
        const [ballot] = await db.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,?,'secret_ballot','Accepted',SHA2(?,256),SHA2(?,256),'ux6')", [secret.versionId, index, `ballot-${index}`, `key-${index}`]);
        await db.query('INSERT INTO SafetyVote_BallotAnswers(BallotID,QuestionID,OptionID,AnswerOrder) VALUES(?,?,?,1)', [ballot.insertId, question.insertId, option.insertId]);
        await db.query("INSERT INTO SafetyVote_Participation(CampaignID,CampaignVersionID,SnapshotID,EmployeeID,State,AttemptCount,FirstStartedAt,SubmittedAt,LastActivityAt) VALUES(?,?,?,?,'submitted',1,NOW(),NOW(),NOW())", [secret.id, secret.versionId, eligibility.insertId, employee]);
    }
    const [priorSecret] = await db.query("INSERT INTO SafetyVote_ResultSnapshots(CampaignID,CampaignVersionID,SnapshotNo,CalculationContract,CalculationRunType,Status,EligibleCount,ParticipationCount,AcceptedBallotCount,QuorumState,TieState,ReconciliationState,InputHash,ResultHash,CalculatedBy,FrozenAt,FrozenBy) VALUES(?,?,1,'ux6-prior','initial','Frozen',2,2,2,'met','none','balanced',REPEAT('d',64),REPEAT('e',64),'SV-ADMIN',NOW(),'SV-ADMIN')", [secret.id, secret.versionId]);
    await db.query("INSERT INTO SafetyVote_ResultRows(ResultSnapshotID,CandidateID,MetricKey,RawCount,RankNo,ResultState,MetadataJson) VALUES(?,NULL,'secret_count',2,1,'elected',?)", [priorSecret.insertId, JSON.stringify({ positionCode: 'REP' })]);
    await db.query("INSERT INTO SafetyVote_CertifierAssignments(CampaignVersionID,EmployeeID,ControlRole,AssignedBy) VALUES(?,'SV-CERT-ONE','primary','SV-ADMIN'),(?,'SV-CERT-TWO','secondary','SV-ADMIN')", [secret.versionId, secret.versionId]);
    await db.query("INSERT INTO SafetyVote_CampaignRoles(CampaignVersionID,EmployeeID,CampaignRole,IsActive,Reason,AssignedBy) VALUES(?,'SV-CERT-ONE','certifier',1,'dual control','SV-ADMIN'),(?,'SV-CERT-TWO','certifier',1,'dual control','SV-ADMIN')", [secret.versionId, secret.versionId]);

    const standard = await addCampaign(db, { code: 'UX6-STANDARD', type: 'hybrid_scoring', privacy: 'confidential', title: 'ผลมาตรฐานเพื่อทดสอบการรับรอง' });
    const [stage] = await db.query("INSERT INTO SafetyVote_Stages(CampaignVersionID,StageKey,StageName,StageType,SequenceNo,AdvanceRuleJson,Status,CreatedBy,UpdatedBy) VALUES(?,'FINAL','รอบสุดท้าย','jury',1,'{}','Closed','SV-ADMIN','SV-ADMIN')", [standard.versionId]);
    const [standardSnapshot] = await db.query("INSERT INTO SafetyVote_ResultSnapshots(CampaignID,CampaignVersionID,StageID,SnapshotNo,CalculationContract,Status,EligibleCount,ParticipationCount,AcceptedBallotCount,QuorumState,TieState,ReconciliationState,InputHash,ResultHash,CalculatedBy) VALUES(?,?,?,1,'ux6-standard','Calculated',47,13,12,'met','none','balanced',REPEAT('f',64),REPEAT('1',64),'SV-ADMIN')", [standard.id, standard.versionId, stage.insertId]);
    await db.query("INSERT INTO SafetyVote_ResultRows(ResultSnapshotID,StageID,MetricKey,NumericValue,RankNo,ResultState) VALUES(?,?,'aggregate_score',91.5,1,'advanced')", [standardSnapshot.insertId, stage.insertId]);
    await db.query("INSERT INTO SafetyVote_CampaignRoles(CampaignVersionID,EmployeeID,CampaignRole,StageID,IsActive,Reason,AssignedBy) VALUES(?,'SV-ADMIN','certifier',?,1,'standard certification','SV-ADMIN')", [standard.versionId, stage.insertId]);

    const viewer = await addCampaign(db, { code: 'UX6-VIEWER', type: 'hybrid_scoring', privacy: 'confidential', title: 'ผลสำหรับตรวจสิทธิ์แบบบางส่วน' });
    const [viewerSnapshot] = await db.query("INSERT INTO SafetyVote_ResultSnapshots(CampaignID,CampaignVersionID,SnapshotNo,CalculationContract,Status,EligibleCount,ParticipationCount,AcceptedBallotCount,QuorumState,TieState,ReconciliationState,InputHash,ResultHash,CalculatedBy,FrozenAt,FrozenBy) VALUES(?,?,1,'ux6-viewer','Frozen',9,4,4,'met','none','balanced',REPEAT('2',64),REPEAT('3',64),'SV-ADMIN',NOW(),'SV-ADMIN')", [viewer.id, viewer.versionId]);
    await db.query("INSERT INTO SafetyVote_ResultRows(ResultSnapshotID,MetricKey,NumericValue,RankNo,ResultState) VALUES(?,'aggregate_score',77.5,1,'advanced')", [viewerSnapshot.insertId]);
    await db.end();

    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: databaseName, SAFETY_VOTE_FIXTURE_DB: databaseName, SAFETY_VOTE_FIXTURE_PORT: '5116' }, stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) { try { if ((await fetch('http://127.0.0.1:5116/__ready', { headers: { Authorization: 'Bearer sv-admin' } })).ok) { ready = true; break; } } catch (_) {} await sleep(150); }
    assert(ready, 'Fixture did not start');
    const fixture = { secret, standard, viewer, secretPriorSnapshotId: Number(priorSecret.insertId), standardSnapshotId: Number(standardSnapshot.insertId), viewerSnapshotId: Number(viewerSnapshot.insertId) };
    const browser = spawnSync(process.execPath, [path.join(__dirname, 'safety-vote-ux-phase6-browser-probe.js'), 'http://127.0.0.1:5116', JSON.stringify(fixture)], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 420000 });
    process.stdout.write(browser.stdout || ''); process.stderr.write(browser.stderr || '');
    if (browser.error) console.error(browser.error.stack || browser.error);
    assert.strictEqual(browser.status, 0, 'Browser probe failed');

    const verification = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [[ledger]] = await verification.query("SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_Participation) participations,(SELECT COUNT(*) FROM SafetyVote_BallotIdentities) identities,(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots WHERE CampaignID=?) secretSnapshots,(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots WHERE CampaignID=?) standardSnapshots,(SELECT COUNT(*) FROM SafetyVote_Certifications WHERE RevokedAt IS NULL) certifications,(SELECT COUNT(*) FROM SafetyVote_ResultActions WHERE CampaignID=? AND ActionType='recount') recounts,(SELECT Status FROM SafetyVote_Campaigns WHERE id=?) secretStatus,(SELECT Status FROM SafetyVote_ResultSnapshots WHERE id=?) standardSnapshotStatus", [secret.id, standard.id, secret.id, secret.id, standardSnapshot.insertId]);
    assert.strictEqual(Number(ledger.ballots), 2, 'Phase 6 UX must not mutate ballots');
    assert.strictEqual(Number(ledger.participations), 2, 'Phase 6 UX must not mutate participation');
    assert.strictEqual(Number(ledger.identities), 0, 'Secret identity mappings must remain zero');
    assert.strictEqual(Number(ledger.secretSnapshots), 2, 'Exactly one confirmed recount snapshot should be added');
    assert.strictEqual(Number(ledger.standardSnapshots), 1, 'Standard workflow must not recalculate implicitly');
    assert.strictEqual(Number(ledger.certifications), 3, 'One standard and two independent secret certifications expected');
    assert.strictEqual(Number(ledger.recounts), 1, 'Exactly one reasoned recount expected');
    assert.strictEqual(ledger.secretStatus, 'Published', 'Secret campaign should publish after dual certification');
    assert.strictEqual(ledger.standardSnapshotStatus, 'Published', 'Standard snapshot should freeze, certify and publish');
    console.log(`Safety Vote UX Phase 6 mutation ledger: ballots=${ledger.ballots} participations=${ledger.participations} identities=${ledger.identities} secretSnapshots=${ledger.secretSnapshots} standardSnapshots=${ledger.standardSnapshots} certifications=${ledger.certifications} recounts=${ledger.recounts}`);
    await verification.end();
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (server?.exitCode === null) server.kill();
    await sleep(300);
    if (admin) {
        if (guard.test(databaseName)) { await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]); dropped = Number(row.count) === 0; }
        await admin.end();
    }
    if (!dropped) { console.error('Disposable database residue check failed'); process.exitCode = 1; }
    else console.log('Safety Vote UX Phase 6 disposable database residue: 0');
});
