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

async function addCampaign(db, { code, type, privacy, title }) {
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES(?,'Open','SV-ADMIN','eligible_only',DATE_SUB(NOW(),INTERVAL 1 HOUR),DATE_ADD(NOW(),INTERVAL 7 DAY),'SV-ADMIN','SV-ADMIN')", [code]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,Summary,OpenAt,CloseAt,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1',?,?,?,'อ่านรายละเอียดและตรวจสอบก่อนส่ง',DATE_SUB(NOW(),INTERVAL 1 HOUR),DATE_ADD(NOW(),INTERVAL 7 DAY),'hidden_until_close','Frozen','SV-ADMIN','SV-ADMIN')", [campaign.insertId, type, privacy, title]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    return { id: Number(campaign.insertId), versionId: Number(version.insertId) };
}

async function addChoice(db, campaign, code, title, labels) {
    const [question] = await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,QuestionCode,QuestionType,Title,IsRequired,MinSelections,MaxSelections,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,'single_choice',?,1,1,1,1,'SV-ADMIN','SV-ADMIN')", [campaign.versionId, code, title]);
    for (let index = 0; index < labels.length; index++) {
        await db.query('INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,?,?,\'SV-ADMIN\',\'SV-ADMIN\')', [question.insertId, `O${index + 1}`, labels[index], index + 1]);
    }
}

async function addEligibility(db, campaign, employeeIds) {
    const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),REPEAT('b',64),?,?,0,NOW(),'SV-ADMIN','SV-ADMIN')", [campaign.versionId, employeeIds.length, employeeIds.length]);
    for (const employeeId of employeeIds) {
        await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,?,?,1,1,'eligible','rule')", [snapshot.insertId, employeeId, employeeId]);
    }
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'UAT refuses non-loopback DB_HOST');
    assert(guard.test(databaseName), 'Disposable database name is outside the guard');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1),(2,'Production','Active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0),('SV-USER','User','Production','Line 1','User','B','Operator','user@local','x',0),('SV-USER2','Juror','Safety','Core','User','A','Officer','juror@local','x',0);");
    for (let index = 1; index <= 6; index++) {
        const number = String(index).padStart(2, '0');
        await db.query('INSERT INTO Employees VALUES(?,?,\'Production\',\'Line 1\',\'User\',\'B\',\'Operator\',?,\'x\',0)', [`SV-L${number}`, `Load Voter ${number}`, `load${number}@local`]);
        await db.query("INSERT INTO Admin_UserPermissions(employee_id,permission,granted) VALUES(?,'SAFETY_VOTE_VIEW',?)", [`SV-L${number}`, index <= 5 ? 1 : 0]);
    }
    await db.query("INSERT INTO Admin_UserPermissions VALUES('SV-USER','SAFETY_VOTE_VIEW',1),('SV-USER2','SAFETY_VOTE_VIEW',1),('SV-USER2','SAFETY_VOTE_JURY',1)");
    for (const migration of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql']) {
        await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    }

    const voters = Array.from({ length: 5 }, (_, index) => `SV-L${String(index + 1).padStart(2, '0')}`);
    const popular = await addCampaign(db, { code: 'UX3-POPULAR', type: 'popular_vote', privacy: 'identified', title: 'โหวตแนวคิดความปลอดภัย' });
    await addChoice(db, popular, 'POPULAR', 'เลือกแนวคิดที่ชื่นชอบ', ['แนวคิด ก ลดการลื่นล้ม', 'แนวคิด ข ตรวจเครื่องจักร']);
    const secret = await addCampaign(db, { code: 'UX3-SECRET', type: 'secret_election', privacy: 'secret_ballot', title: 'เลือกตั้งตัวแทนความปลอดภัยแบบลับ' });
    await addChoice(db, secret, 'CHAIR', 'เลือกตัวแทน', ['ผู้สมัคร สมชาย', 'ผู้สมัคร สมหญิง']);
    const submission = await addCampaign(db, { code: 'UX3-SUBMISSION', type: 'submission_challenge', privacy: 'confidential', title: 'ส่งผลงานลดความเสี่ยง' });
    const nomination = await addCampaign(db, { code: 'UX3-NOMINATION', type: 'nomination', privacy: 'confidential', title: 'เสนอชื่อคนต้นแบบความปลอดภัย' });
    for (const campaign of [popular, secret, submission, nomination]) await addEligibility(db, campaign, voters);
    await db.end();

    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], {
        cwd: root,
        env: { ...process.env, DB_NAME: databaseName, SAFETY_VOTE_FIXTURE_DB: databaseName, SAFETY_VOTE_FIXTURE_PORT: '5113' },
        stdio: 'ignore', windowsHide: true
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
        try { if ((await fetch('http://127.0.0.1:5113/__ready', { headers: { Authorization: 'Bearer sv-admin' } })).ok) { ready = true; break; } } catch (_) {}
        await sleep(150);
    }
    assert(ready, 'Fixture did not start');
    const browser = spawnSync(process.execPath, [path.join(__dirname, 'safety-vote-ux-phase3-browser-probe.js'), 'http://127.0.0.1:5113'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 360000 });
    process.stdout.write(browser.stdout || '');
    process.stderr.write(browser.stderr || '');
    assert.strictEqual(browser.status, 0, 'Browser probe failed');

    const verification = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [[ledger]] = await verification.query("SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_Participation) participations,(SELECT COUNT(*) FROM SafetyVote_RequestKeys) requestKeys,(SELECT COUNT(*) FROM SafetyVote_BallotIdentities) identities,(SELECT COUNT(*) FROM SafetyVote_BallotIdentities i JOIN SafetyVote_Ballots b ON b.id=i.BallotID WHERE b.PrivacyModeSnapshot='secret_ballot') secretIdentities,(SELECT COUNT(*) FROM SafetyVote_JuryScores)+(SELECT COUNT(*) FROM SafetyVote_Certifications)+(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots) forbiddenRows");
    assert.strictEqual(Number(ledger.ballots), 6, 'Five identified and one secret ballot are expected');
    assert.strictEqual(Number(ledger.participations), 6, 'replay/conflict probes must not duplicate participation');
    assert.strictEqual(Number(ledger.requestKeys), 6, 'one request key per accepted ballot is expected');
    assert.strictEqual(Number(ledger.identities), 5, 'only identified ballots may have identity rows');
    assert.strictEqual(Number(ledger.secretIdentities), 0, 'secret ballot must not have an identity row');
    assert.strictEqual(Number(ledger.forbiddenRows), 0, 'Phase 3 UAT must not mutate jury/certification/result data');
    console.log(`Safety Vote UX Phase 3 mutation ledger: ballots=${ledger.ballots} participations=${ledger.participations} requestKeys=${ledger.requestKeys} identified=${ledger.identities} secretIdentities=${ledger.secretIdentities} forbidden=${ledger.forbiddenRows}`);
    await verification.end();
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server?.exitCode === null) server.kill();
    await sleep(300);
    if (admin) {
        if (guard.test(databaseName)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]);
            dropped = Number(row.count) === 0;
        }
        await admin.end();
    }
    if (!dropped) { console.error('Disposable database residue check failed'); process.exitCode = 1; }
    else console.log('Safety Vote UX Phase 3 disposable database residue: 0');
});
