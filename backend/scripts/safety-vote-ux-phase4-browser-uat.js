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

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'UAT refuses non-loopback DB_HOST');
    assert(guard.test(databaseName), 'Disposable database name is outside the guard');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0);");
    for (let index = 1; index <= 7; index++) {
        const number = String(index).padStart(2, '0');
        await db.query("INSERT INTO Employees VALUES(?,?, 'Safety','Core','User','A','Officer',?,'x',0)", [`SV-J${number}`, `Juror ${number}`, `juror${number}@local`]);
        await db.query("INSERT INTO Admin_UserPermissions(employee_id,permission,granted) VALUES(?,'SAFETY_VOTE_JURY',?)", [`SV-J${number}`, index <= 6 ? 1 : 0]);
    }
    for (const migration of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql']) {
        await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    }
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES('UX4-JURY','Open','SV-ADMIN','eligible_only',DATE_SUB(NOW(),INTERVAL 1 DAY),DATE_ADD(NOW(),INTERVAL 7 DAY),'SV-ADMIN','SV-ADMIN')");
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,Summary,OpenAt,CloseAt,ResultVisibility,Status,ScoringMethod,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','hybrid_scoring','confidential','เวทีประเมินแนวคิดความปลอดภัย','ประเมินตามเกณฑ์ที่ได้รับมอบหมาย',DATE_SUB(NOW(),INTERVAL 1 DAY),DATE_ADD(NOW(),INTERVAL 7 DAY),'certified_only','Frozen','jury','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const [stage] = await db.query("INSERT INTO SafetyVote_Stages(CampaignVersionID,StageKey,StageName,StageType,SequenceNo,AdvanceRuleJson,Status,CreatedBy,UpdatedBy) VALUES(?,'BLIND','รอบคัดเลือก','jury',1,?,'Open','SV-ADMIN','SV-ADMIN')", [version.insertId, JSON.stringify({ blind: true })]);
    const [question] = await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,StageID,QuestionCode,QuestionType,Title,CreatedBy,UpdatedBy) VALUES(?,?,'JURY','single_choice','รายการประเมิน','SV-ADMIN','SV-ADMIN')", [version.insertId, stage.insertId]);
    const [optionA] = await db.query("INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,CreatedBy,UpdatedBy) VALUES(?,'A','ตัวเลือก A','SV-ADMIN','SV-ADMIN')", [question.insertId]);
    const [optionB] = await db.query("INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,CreatedBy,UpdatedBy) VALUES(?,'B','ตัวเลือก B','SV-ADMIN','SV-ADMIN')", [question.insertId]);
    await db.query("INSERT INTO SafetyVote_Candidates(CampaignVersionID,StageID,OptionID,CandidateNo,DisplayName,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,?,'A01','Alice Real',1,'SV-ADMIN','SV-ADMIN'),(?,?,?,'B01','Bob Real',2,'SV-ADMIN','SV-ADMIN')", [version.insertId, stage.insertId, optionA.insertId, version.insertId, stage.insertId, optionB.insertId]);
    await db.query("INSERT INTO SafetyVote_JuryCriteria(CampaignVersionID,StageID,CriterionCode,Title,Description,MinScore,MaxScore,Weight,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,'SAFETY','ความปลอดภัย','พิจารณาการลดความเสี่ยง',0,10,60,1,'SV-ADMIN','SV-ADMIN'),(?,?,'PRACTICAL','ความเป็นไปได้','พิจารณาการนำไปใช้จริง',0,10,40,2,'SV-ADMIN','SV-ADMIN')", [version.insertId, stage.insertId, version.insertId, stage.insertId]);
    const assignmentIds = [];
    for (let index = 1; index <= 5; index++) {
        const number = String(index).padStart(2, '0');
        const [assignment] = await db.query("INSERT INTO SafetyVote_JuryAssignments(CampaignVersionID,StageID,JurorEmployeeID,AssignmentScope,AssignedBy) VALUES(?,?,?,'stage','SV-ADMIN')", [version.insertId, stage.insertId, `SV-J${number}`]);
        assignmentIds.push(Number(assignment.insertId));
    }
    const [candidate] = await db.query("SELECT id FROM SafetyVote_Candidates WHERE CampaignVersionID=? ORDER BY id LIMIT 1", [version.insertId]);
    const [recuse] = await db.query("INSERT INTO SafetyVote_JuryAssignments(CampaignVersionID,StageID,JurorEmployeeID,CandidateID,AssignmentScope,AssignedBy) VALUES(?,?,?,?,'candidate','SV-ADMIN')", [version.insertId, stage.insertId, 'SV-J01', candidate[0].id]);
    await db.end();

    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], {
        cwd: root,
        env: { ...process.env, DB_NAME: databaseName, SAFETY_VOTE_FIXTURE_DB: databaseName, SAFETY_VOTE_FIXTURE_PORT: '5114' },
        stdio: 'ignore', windowsHide: true
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
        try { if ((await fetch('http://127.0.0.1:5114/__ready', { headers: { Authorization: 'Bearer sv-admin' } })).ok) { ready = true; break; } } catch (_) {}
        await sleep(150);
    }
    assert(ready, 'Fixture did not start');
    const browser = spawnSync(process.execPath, [path.join(__dirname, 'safety-vote-ux-phase4-browser-probe.js'), 'http://127.0.0.1:5114', JSON.stringify({ assignmentIds, recuseId: Number(recuse.insertId) })], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 360000 });
    process.stdout.write(browser.stdout || '');
    process.stderr.write(browser.stderr || '');
    if (browser.error) console.error(browser.error.stack || browser.error);
    if (browser.signal) console.error(`Browser probe signal: ${browser.signal}`);
    assert.strictEqual(browser.status, 0, 'Browser probe failed');

    const verification = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [[ledger]] = await verification.query("SELECT (SELECT COUNT(*) FROM SafetyVote_JuryAssignments WHERE Status='Submitted') submitted,(SELECT COUNT(*) FROM SafetyVote_JuryAssignments WHERE Status='Recused') recused,(SELECT COUNT(*) FROM SafetyVote_JuryScores WHERE Status='Submitted') scores,(SELECT COUNT(*) FROM SafetyVote_Ballots)+(SELECT COUNT(*) FROM SafetyVote_Participation)+(SELECT COUNT(*) FROM SafetyVote_Certifications)+(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots) forbiddenRows");
    assert.strictEqual(Number(ledger.submitted), 5, 'Exactly five viewport assignments must be submitted');
    assert.strictEqual(Number(ledger.recused), 1, 'Exactly one conflict assignment must be recused');
    assert.strictEqual(Number(ledger.scores), 20, 'Each submitted sheet must contain two candidates by two criteria');
    assert.strictEqual(Number(ledger.forbiddenRows), 0, 'Phase 4 UX UAT must not mutate ballots, participation, certification or results');
    console.log(`Safety Vote UX Phase 4 mutation ledger: submitted=${ledger.submitted} recused=${ledger.recused} scores=${ledger.scores} forbidden=${ledger.forbiddenRows}`);
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
    else console.log('Safety Vote UX Phase 4 disposable database residue: 0');
});
