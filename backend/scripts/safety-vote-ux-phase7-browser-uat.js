'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn, spawnSync } = require('child_process');
const p2 = require('../services/safety-vote-phase2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const databaseName = `tsh_safety_vote_phase1_node_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const guard = /^tsh_safety_vote_phase1_node_\d+_\d+$/;
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const reportDir = path.join(root, 'backend', 'private-uploads', 'safety-vote', 'reports');
let admin;
let server;
let reportFile;
let dropped = false;
let reportRemoved = false;

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'UAT refuses non-loopback DB_HOST');
    assert(guard.test(databaseName), 'Disposable database name is outside the guard');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT) DEFAULT CHARSET=utf8mb4;INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0),('SV-GOV-AUDIT','Governance Auditor','Safety','Core','User','A','Officer','audit@local','x',0),('SV-GOV-DENIED','Governance Denied','Safety','Core','User','A','Officer','denied@local','x',0),('SV-CERT-ONE','Certifier One','Safety','Core','User','A','Officer','cert1@local','x',0),('SV-CERT-TWO','Certifier Two','Safety','Core','User','A','Officer','cert2@local','x',0);");
    for (const migration of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql']) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await db.query("INSERT INTO Admin_UserPermissions VALUES('SV-GOV-AUDIT','SAFETY_VOTE_AUDIT_VIEW',1),('SV-GOV-AUDIT','SAFETY_VOTE_ADMIN',0),('SV-GOV-AUDIT','SAFETY_VOTE_MANAGE',0),('SV-GOV-AUDIT','SAFETY_VOTE_EXPORT',0),('SV-GOV-AUDIT','SAFETY_VOTE_CERTIFY',0),('SV-GOV-DENIED','SAFETY_VOTE_AUDIT_VIEW',0)");
    const code = 'UX7-GOV';
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,CreatedBy,UpdatedBy) VALUES(?,'Published','SV-ADMIN','eligible_only','SV-ADMIN','SV-ADMIN')", [code]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,PrivacyThreshold,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','secret_election','secret_ballot','หลักฐานธรรมาภิบาลทดสอบ',5,'certified_only','Frozen','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const voter = { employeeId: 'SV-ADMIN', departmentId: 1, safetyUnitId: 10, positionId: 100, role: 'Admin', team: 'A', accountReady: true };
    const [eligibility] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),?,1,1,0,NOW(),'SV-ADMIN','SV-ADMIN')", [version.insertId, p2.rowsHash([voter])]);
    await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,SafetyUnitIDSnapshot,PositionIDSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,'SV-ADMIN','Admin',1,10,100,'Admin','A',1,1,'eligible','rule')", [eligibility.insertId]);
    for (let index = 1; index <= 2; index++) await db.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,?,'secret_ballot','Accepted',SHA2(?,256),SHA2(?,256),'ux7')", [version.insertId, index, `ux7-ballot-${index}`, `ux7-key-${index}`]);
    const resultHash = crypto.createHash('sha256').update('ux7-governance-result').digest('hex');
    const [snapshot] = await db.query("INSERT INTO SafetyVote_ResultSnapshots(CampaignID,CampaignVersionID,SnapshotNo,CalculationContract,Status,EligibleCount,ParticipationCount,AcceptedBallotCount,QuorumState,TieState,ReconciliationState,InputHash,ResultHash,CalculatedBy,FrozenAt,FrozenBy) VALUES(?,?,1,'ux7-fixture','Published',1,0,2,'met','none','balanced',REPEAT('c',64),?,'SV-ADMIN',NOW(),'SV-ADMIN')", [campaign.insertId, version.insertId, resultHash]);
    for (const employee of ['SV-CERT-ONE', 'SV-CERT-TWO']) await db.query("INSERT INTO SafetyVote_Certifications(ResultSnapshotID,CertifierEmployeeID,CertificationRole,Decision,Reason,ResultHashSnapshot) VALUES(?,?,'dual_control','certified','guarded fixture',?)", [snapshot.insertId, employee, resultHash]);
    const reportContent = Buffer.from(`CERTIFIED UX7 ${resultHash}`);
    const reportSha = crypto.createHash('sha256').update(reportContent).digest('hex');
    const storedName = `ux7-governance-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    fs.mkdirSync(reportDir, { recursive: true });
    reportFile = path.join(reportDir, storedName);
    fs.writeFileSync(reportFile, reportContent);
    await db.query("INSERT INTO SafetyVote_Reports(ResultSnapshotID,ReportType,ReportID,StoredName,MimeType,FileSize,ContentSha256,ResultHashSnapshot,GeneratedBy) VALUES(?,'certified_pdf','UX7-REPORT',?,'application/pdf',?,?,?,'SV-ADMIN')", [snapshot.insertId, storedName, reportContent.length, reportSha, resultHash]);
    await db.query("INSERT INTO SafetyVote_OperationalAlerts(CampaignID,AlertKey,Severity,State,EvidenceHash,BoundedDetail) VALUES(?,'ux7-readiness','warning','Open',REPEAT('d',64),'bounded fixture warning')", [campaign.insertId]);
    await db.end();

    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: databaseName, SAFETY_VOTE_FIXTURE_DB: databaseName, SAFETY_VOTE_FIXTURE_PORT: '5117', SAFETY_VOTE_PHASE7_ADAPTER_MODE: 'fixture', SAFETY_VOTE_PHASE7_EVIDENCE_MODE: 'fixture_pass' }, stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) { try { if ((await fetch('http://127.0.0.1:5117/__ready', { headers: { Authorization: 'Bearer sv-admin' } })).ok) { ready = true; break; } } catch (_) {} await sleep(150); }
    assert(ready, 'Fixture did not start');
    const fixture = { id: Number(campaign.insertId), versionId: Number(version.insertId), code, resultHash, reportSha };
    const browser = spawnSync(process.execPath, [path.join(__dirname, 'safety-vote-ux-phase7-browser-probe.js'), 'http://127.0.0.1:5117', JSON.stringify(fixture)], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 420000 });
    process.stdout.write(browser.stdout || ''); process.stderr.write(browser.stderr || '');
    if (browser.error) console.error(browser.error.stack || browser.error);
    assert.strictEqual(browser.status, 0, 'Browser probe failed');
    const browserHoldMs = Math.min(180000, Math.max(0, Number(process.env.SAFETY_VOTE_UX7_BROWSER_HOLD_MS || 0)));
    if (browserHoldMs) { console.log(`Safety Vote UX Phase 7 fixture held for Browser inspection: ${browserHoldMs}ms`); await sleep(browserHoldMs); }

    const verification = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [[ledger]] = await verification.query("SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_BallotIdentities) identities,(SELECT COUNT(*) FROM SafetyVote_AcceptanceEvidence) acceptances,(SELECT COUNT(*) FROM SafetyVote_IntegrationHandoffs) handoffs,(SELECT COUNT(*) FROM SafetyVote_IntegrationHandoffs WHERE Status='Delivered') delivered,(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots) snapshots,(SELECT COUNT(*) FROM SafetyVote_Certifications) certifications,(SELECT COUNT(*) FROM SafetyVote_OperationalAlerts WHERE State='Open') alerts");
    assert.deepStrictEqual(Object.fromEntries(Object.entries(ledger).map(([key, value]) => [key, Number(value)])), { ballots: 2, identities: 0, acceptances: 1, handoffs: 1, delivered: 1, snapshots: 1, certifications: 2, alerts: 1 });
    console.log(`Safety Vote UX Phase 7 mutation ledger: ballots=${ledger.ballots} identities=${ledger.identities} acceptances=${ledger.acceptances} handoffs=${ledger.handoffs} delivered=${ledger.delivered} snapshots=${ledger.snapshots} certifications=${ledger.certifications} alerts=${ledger.alerts}`);
    await verification.end();
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    if (server?.exitCode === null) server.kill();
    await sleep(300);
    if (reportFile) { await fs.promises.rm(reportFile, { force: true }).catch(() => {}); reportRemoved = !fs.existsSync(reportFile); }
    if (admin) {
        if (guard.test(databaseName)) { await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``); const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]); dropped = Number(row.count) === 0; }
        await admin.end();
    }
    if (!dropped || !reportRemoved) { console.error(`Residue check failed: databaseDropped=${dropped} reportRemoved=${reportRemoved}`); process.exitCode = 1; }
    else console.log('Safety Vote UX Phase 7 disposable database/report residue: 0');
});
