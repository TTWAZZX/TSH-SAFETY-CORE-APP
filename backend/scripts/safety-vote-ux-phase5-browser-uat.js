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
const reportRoot = path.join(root, 'backend', 'private-uploads', 'safety-vote', 'reports');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let admin;
let server;
let dropped = false;
const generatedFiles = [];

async function campaign(db, { code, status = 'Open', type = 'hybrid_scoring', privacy = 'confidential', title, threshold = 5, openOffset = -60, closeOffset = 420 }) {
    const [row] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES(?,?, 'SV-ADMIN','eligible_only',DATE_ADD(NOW(),INTERVAL ? MINUTE),DATE_ADD(NOW(),INTERVAL ? MINUTE),'SV-ADMIN','SV-ADMIN')", [code, status, openOffset, closeOffset]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,PrivacyThreshold,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1',?,?,?,?, 'certified_only',?,'SV-ADMIN','SV-ADMIN')", [row.insertId, type, privacy, title, threshold, status === 'Draft' ? 'Draft' : 'Frozen']);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, row.insertId]);
    return { id: Number(row.insertId), versionId: Number(version.insertId) };
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'UAT refuses non-loopback DB_HOST');
    assert(guard.test(databaseName), 'Disposable database name is outside the guard');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT) DEFAULT CHARSET=utf8mb4;INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1),(2,'Production','Active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0),('SV-OPS-LIMITED','Operations Viewer','Safety','Core','User','A','Officer','ops@local','x',0),('SV-OPS-DENIED','Operations Denied','Safety','Core','User','A','Officer','denied@local','x',0);");
    for (let index = 1; index <= 10; index++) {
        const number = String(index).padStart(2, '0'), department = index <= 2 ? 'Safety' : 'Production', unit = index <= 2 ? 'Core' : 'Line 1';
        await db.query("INSERT INTO Employees VALUES(?,?,?,?,'User','B','Operator',?,'x',0)", [`SV-V${number}`, `Voter ${number}`, department, unit, `voter${number}@local`]);
    }
    await db.query("INSERT INTO Admin_UserPermissions VALUES('SV-OPS-LIMITED','SAFETY_VOTE_RESULT_VIEW',1),('SV-OPS-LIMITED','SAFETY_VOTE_MANAGE',0),('SV-OPS-LIMITED','SAFETY_VOTE_EXPORT',0),('SV-OPS-DENIED','SAFETY_VOTE_RESULT_VIEW',0)");
    for (const migration of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql']) {
        await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    }

    const main = await campaign(db, { code: 'UX5-OPS', title: 'ติดตามกิจกรรมลดความเสี่ยง', privacy: 'confidential', threshold: 5 });
    const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),REPEAT('b',64),10,10,0,NOW(),'SV-ADMIN','SV-ADMIN')", [main.versionId]);
    for (let index = 1; index <= 10; index++) {
        const number = String(index).padStart(2, '0');
        await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,?,?,1,1,'eligible','rule')", [snapshot.insertId, `SV-V${number}`, `Voter ${number}`]);
    }
    for (let index = 1; index <= 3; index++) {
        const number = String(index).padStart(2, '0');
        await db.query("INSERT INTO SafetyVote_Participation(CampaignID,CampaignVersionID,SnapshotID,EmployeeID,State,AttemptCount,FirstStartedAt,SubmittedAt,LastActivityAt) VALUES(?,?,?,?,'submitted',1,NOW(),NOW(),NOW())", [main.id, main.versionId, snapshot.insertId, `SV-V${number}`]);
        await db.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,?,'confidential','Accepted',SHA2(?,256),SHA2(?,256),'ux5')", [main.versionId, index, `ballot-${index}`, `key-${index}`]);
    }
    await db.query("INSERT INTO SafetyVote_Participation(CampaignID,CampaignVersionID,SnapshotID,EmployeeID,State,AttemptCount,FirstStartedAt,LastActivityAt) VALUES(?,?,?,'SV-V04','started',1,NOW(),NOW())", [main.id, main.versionId, snapshot.insertId]);
    const [stage] = await db.query("INSERT INTO SafetyVote_Stages(CampaignVersionID,StageKey,StageName,StageType,SequenceNo,AdvanceRuleJson,Status,CreatedBy,UpdatedBy) VALUES(?,'JURY','รอบกรรมการ','jury',1,?,'Open','SV-ADMIN','SV-ADMIN')", [main.versionId, JSON.stringify({ blind: true })]);
    for (let index = 1; index <= 6; index++) {
        const status = index <= 3 ? 'Submitted' : index === 6 ? 'Recused' : 'Draft', conflict = index === 6 ? 'recused' : 'clear';
        await db.query("INSERT INTO SafetyVote_JuryAssignments(CampaignVersionID,StageID,JurorEmployeeID,AssignmentScope,Status,ConflictState,SubmittedAt,AssignedBy) VALUES(?,?,?,'stage',?,?,IF(?='Submitted',NOW(),NULL),'SV-ADMIN')", [main.versionId, stage.insertId, `SV-V${String(index).padStart(2, '0')}`, status, conflict, status]);
    }
    const [result] = await db.query("INSERT INTO SafetyVote_ResultSnapshots(CampaignID,CampaignVersionID,StageID,SnapshotNo,CalculationContract,Status,EligibleCount,ParticipationCount,AcceptedBallotCount,QuorumState,TieState,ReconciliationState,InputHash,ResultHash,CalculatedBy,FrozenAt,FrozenBy) VALUES(?,?,?,1,'ux5-fixture','Frozen',10,3,3,'met','none','balanced',REPEAT('c',64),REPEAT('d',64),'SV-ADMIN',NOW(),'SV-ADMIN')", [main.id, main.versionId, stage.insertId]);
    await db.query("INSERT INTO SafetyVote_ResultRows(ResultSnapshotID,StageID,MetricKey,NumericValue,RankNo,ResultState) VALUES(?,?,'aggregate_score',88.5,1,'normal')", [result.insertId, stage.insertId]);
    await db.query("INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,BoundedDetail) VALUES(?,?,'SV-ADMIN','ADMIN','SAFETY_VOTE_CAMPAIGN_OPEN','SafetyVote_Campaign',?,'private fixture detail'),(?,?,'SV-ADMIN','ADMIN','SAFETY_VOTE_RESULT_FREEZE','SafetyVote_ResultSnapshot',?,'private result detail')", [main.id, main.versionId, String(main.id), main.id, main.versionId, String(result.insertId)]);
    for (const [index, status] of ['Queued', 'Sent', 'Sent', 'Failed'].entries()) {
        await db.query("INSERT INTO SafetyVote_Notifications(CampaignID,EventType,TemplateKey,Channel,RecipientEmployeeID,ScheduledAt,DispatchedAt,Status,SuppressionKey,AttemptCount,PayloadMetadataJson,CreatedBy) VALUES(?,'seed','seed','in_app',?,NOW(),IF(?='Sent',NOW(),NULL),?,SHA2(?,256),?,?,'SV-ADMIN')", [main.id, `SV-V${String(index + 1).padStart(2, '0')}`, status, status, `seed-${index}`, status === 'Queued' ? 0 : 1, JSON.stringify({ route: '#safety-vote' })]);
    }

    const secret = await campaign(db, { code: 'UX5-SECRET', title: 'เลือกตั้งลับสำหรับตรวจ Privacy', type: 'secret_election', privacy: 'secret_ballot', threshold: 5 });
    const [secretSnapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('e',64),REPEAT('f',64),6,6,0,NOW(),'SV-ADMIN','SV-ADMIN')", [secret.versionId]);
    for (let index = 1; index <= 6; index++) await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,?,?,1,1,'eligible','rule')", [secretSnapshot.insertId, `SV-V${String(index).padStart(2, '0')}`, `Voter ${index}`]);
    const due = await campaign(db, { code: 'UX5-DUE', status: 'Draft', title: 'กำหนดการที่ถึงเวลา', privacy: 'identified', openOffset: -120, closeOffset: 240 });
    await db.end();

    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], {
        cwd: root,
        env: { ...process.env, DB_NAME: databaseName, SAFETY_VOTE_FIXTURE_DB: databaseName, SAFETY_VOTE_FIXTURE_PORT: '5115' },
        stdio: 'ignore', windowsHide: true
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
        try { if ((await fetch('http://127.0.0.1:5115/__ready', { headers: { Authorization: 'Bearer sv-admin' } })).ok) { ready = true; break; } } catch (_) {}
        await sleep(150);
    }
    assert(ready, 'Fixture did not start');
    const browser = spawnSync(process.execPath, [path.join(__dirname, 'safety-vote-ux-phase5-browser-probe.js'), 'http://127.0.0.1:5115', JSON.stringify({ campaignId: main.id, secretCampaignId: secret.id })], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 360000 });
    process.stdout.write(browser.stdout || '');
    process.stderr.write(browser.stderr || '');
    if (browser.error) console.error(browser.error.stack || browser.error);
    if (browser.signal) console.error(`Browser probe signal: ${browser.signal}`);
    assert.strictEqual(browser.status, 0, 'Browser probe failed');

    const verification = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [reports] = await verification.query('SELECT StoredName FROM SafetyVote_Reports');
    for (const row of reports) {
        const file = path.join(reportRoot, path.basename(row.StoredName));
        generatedFiles.push(file);
        await fs.promises.unlink(file).catch(() => {});
        assert.strictEqual(fs.existsSync(file), false, `Generated report residue: ${file}`);
    }
    const [[ledger]] = await verification.query("SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_Participation) participations,(SELECT COUNT(*) FROM SafetyVote_BallotIdentities) identities,(SELECT COUNT(*) FROM SafetyVote_Notifications WHERE CampaignID=?) notifications,(SELECT COUNT(*) FROM SafetyVote_Reports) reports,(SELECT COUNT(*) FROM SafetyVote_ExportJobs WHERE Status='Completed') exports,(SELECT COUNT(*) FROM SafetyVote_Certifications) certifications,(SELECT Status FROM SafetyVote_Campaigns WHERE id=?) dueStatus", [main.id, due.id]);
    assert.strictEqual(Number(ledger.ballots), 3, 'Operations UX must not create or change ballots');
    assert.strictEqual(Number(ledger.participations), 4, 'Operations UX must not create participation');
    assert.strictEqual(Number(ledger.identities), 0, 'Operations UX must not create identity mappings');
    assert.strictEqual(Number(ledger.notifications), 11, 'Exactly seven nonparticipant reminders should be added to four seeded statuses');
    assert.strictEqual(Number(ledger.reports), 1, 'Exactly one aggregate report should be generated');
    assert.strictEqual(Number(ledger.exports), 1, 'Exactly one export job should complete');
    assert.strictEqual(Number(ledger.certifications), 0, 'Operations UX must not certify results');
    assert.strictEqual(ledger.dueStatus, 'Open', 'Confirmed schedule processor should open the due fixture campaign');
    console.log(`Safety Vote UX Phase 5 mutation ledger: ballots=${ledger.ballots} participations=${ledger.participations} identities=${ledger.identities} notifications=${ledger.notifications} reports=${ledger.reports} exports=${ledger.exports} certifications=${ledger.certifications} reportFiles=0`);
    await verification.end();
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server?.exitCode === null) server.kill();
    await sleep(300);
    for (const file of generatedFiles) await fs.promises.unlink(file).catch(() => {});
    if (admin) {
        if (guard.test(databaseName)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]);
            dropped = Number(row.count) === 0;
        }
        await admin.end();
    }
    if (!dropped) { console.error('Disposable database residue check failed'); process.exitCode = 1; }
    else console.log('Safety Vote UX Phase 5 disposable database and generated report residue: 0');
});
