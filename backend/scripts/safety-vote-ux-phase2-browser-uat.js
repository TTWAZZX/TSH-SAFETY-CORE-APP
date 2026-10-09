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
let uploadedFiles = [];

async function seedJudgedCampaign(db) {
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES('UX2-JURY','Open','SV-ADMIN','eligible_only','2026-10-07 08:00:00','2026-10-20 17:00:00','SV-ADMIN','SV-ADMIN')");
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,Summary,OpenAt,CloseAt,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','jury_scoring','confidential','ประกวดแนวคิดความปลอดภัย','ประเมินแนวคิดตามเกณฑ์ที่ได้รับมอบหมาย','2026-10-07 08:00:00','2026-10-20 17:00:00','hidden_until_close','Frozen','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),REPEAT('b',64),2,2,0,NOW(),'SV-ADMIN','SV-ADMIN')", [version.insertId]);
    for (const employeeId of ['SV-USER', 'SV-USER2']) {
        await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,AccountReady,EligibilityState,InclusionSource) VALUES(?,?,?,1,'eligible','rule')", [snapshot.insertId, employeeId, employeeId]);
    }
    const [stage] = await db.query("INSERT INTO SafetyVote_Stages(CampaignVersionID,StageKey,StageName,StageType,SequenceNo,AdvanceRuleJson,Status,CreatedBy,UpdatedBy) VALUES(?,'JUDGE','รอบกรรมการ','jury',1,'{\"blind\":true}','Open','SV-ADMIN','SV-ADMIN')", [version.insertId]);
    await db.query("INSERT INTO SafetyVote_JuryAssignments(CampaignVersionID,StageID,JurorEmployeeID,AssignmentScope,Status,ConflictState,AssignedBy) VALUES(?,?,'SV-USER2','stage','Draft','clear','SV-ADMIN')", [version.insertId, stage.insertId]);
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'UAT refuses non-loopback DB_HOST');
    assert(guard.test(databaseName), 'Disposable database name is outside the guard');
    admin = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS
    });
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName,
        multipleStatements: true
    });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1),(2,'Production','Active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','a@x','x',0),('SV-USER','Voter','Production','Line 1','User','B','Operator','u@x','x',0),('SV-USER2','Juror','Safety','Core','User','A','Officer','j@x','x',0);INSERT INTO Admin_UserPermissions VALUES('SV-USER','SAFETY_VOTE_VIEW',1),('SV-USER2','SAFETY_VOTE_VIEW',1),('SV-USER2','SAFETY_VOTE_JURY',1);");
    for (const migration of [
        '20261008_safety_vote_phase1_foundation.sql',
        '20261008_safety_vote_phase2_core_mvp.sql',
        '20261008_safety_vote_phase3_survey_submission.sql',
        '20261008_safety_vote_phase4_jury_scoring.sql',
        '20261008_safety_vote_phase5_operations.sql',
        '20261008_safety_vote_phase6_secret_election.sql',
        '20261008_safety_vote_phase7_integrations_governance.sql',
        '20261009_safety_vote_phase10_4_media_versioning.sql'
    ]) {
        await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    }
    await seedJudgedCampaign(db);
    await db.end();

    server = spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], {
        cwd: root,
        env: { ...process.env, DB_NAME: databaseName, SAFETY_VOTE_FIXTURE_DB: databaseName, SAFETY_VOTE_FIXTURE_PORT: '5112' },
        stdio: 'ignore',
        windowsHide: true
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
        try {
            if ((await fetch('http://127.0.0.1:5112/__ready', { headers: { Authorization: 'Bearer sv-admin' } })).ok) { ready = true; break; }
        } catch (_) {}
        await sleep(150);
    }
    assert(ready, 'Fixture did not start');

    const browser = spawnSync(process.execPath, [path.join(__dirname, 'safety-vote-ux-phase2-browser-probe.js'), 'http://127.0.0.1:5112'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 360000
    });
    process.stdout.write(browser.stdout || '');
    process.stderr.write(browser.stderr || '');
    assert.strictEqual(browser.status, 0, 'Browser probe failed');

    const verification = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: databaseName
    });
    const [[campaigns]] = await verification.query("SELECT COUNT(*) total,SUM(CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$') wizardTotal,SUM(Status='Open' AND CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$') wizardOpen,COUNT(DISTINCT CASE WHEN CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$' THEN CampaignCode END) distinctCodes FROM SafetyVote_Campaigns");
    const [[versions]] = await verification.query("SELECT COUNT(*) total,SUM(v.ParentVersionID IS NOT NULL AND v.Status='Draft') revisions FROM SafetyVote_CampaignVersions v JOIN SafetyVote_Campaigns c ON c.id=v.CampaignID WHERE c.CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$'");
    const [[content]] = await verification.query("SELECT COUNT(*) questions FROM SafetyVote_Questions q JOIN SafetyVote_CampaignVersions v ON v.id=q.CampaignVersionID JOIN SafetyVote_Campaigns c ON c.id=v.CampaignID WHERE c.CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$'");
    const [[advanced]] = await verification.query("SELECT SUM(q.QuestionType='ranking') rankings,SUM(q.QuestionType='rating') ratings,SUM(q.DisplayConditionJson IS NOT NULL) conditionalQuestions,SUM(q.QuestionType='rating' AND JSON_EXTRACT(q.ValidationJson,'$.minNumber')=1 AND JSON_EXTRACT(q.ValidationJson,'$.maxNumber')=10) validRatingRanges FROM SafetyVote_Questions q JOIN SafetyVote_CampaignVersions v ON v.id=q.CampaignVersionID JOIN SafetyVote_Campaigns c ON c.id=v.CampaignID WHERE c.CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$'");
    const [[options]] = await verification.query("SELECT COUNT(*) total,SUM(o.Description IS NOT NULL) described,SUM(o.FileID IS NOT NULL) illustrated FROM SafetyVote_Options o JOIN SafetyVote_Questions q ON q.id=o.QuestionID JOIN SafetyVote_CampaignVersions v ON v.id=q.CampaignVersionID JOIN SafetyVote_Campaigns c ON c.id=v.CampaignID WHERE c.CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$'");
    const [[media]] = await verification.query("SELECT COUNT(*) total,SUM(Provider='youtube') youtube FROM SafetyVote_MediaLinks m JOIN SafetyVote_Campaigns c ON c.id=m.CampaignID WHERE c.CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$'");
    const [files] = await verification.query("SELECT StoredName FROM SafetyVote_Files WHERE FilePurpose='option_image' AND Status='Active'");
    uploadedFiles = files.map(row => String(row.StoredName));
    const [[snapshots]] = await verification.query("SELECT COUNT(*) snapshots FROM SafetyVote_EligibilitySnapshots s JOIN SafetyVote_CampaignVersions v ON v.id=s.CampaignVersionID JOIN SafetyVote_Campaigns c ON c.id=v.CampaignID WHERE c.CampaignCode REGEXP '^SHE-[0-9]{3}-[0-9]{4}$' AND s.Status='frozen'");
    const [[forbidden]] = await verification.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots)+(SELECT COUNT(*) FROM SafetyVote_Participation)+(SELECT COUNT(*) FROM SafetyVote_JuryScores)+(SELECT COUNT(*) FROM SafetyVote_Certifications)+(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots) total');
    assert.strictEqual(Number(campaigns.wizardTotal), 5, 'Five viewport-specific wizard campaigns are required');
    assert.strictEqual(Number(campaigns.distinctCodes), 5, 'Every automatic campaign code must be unique');
    assert.strictEqual(Number(campaigns.wizardOpen), 5, 'Every wizard flow must pass server open preflight');
    assert.deepStrictEqual([Number(versions.total),Number(versions.revisions)],[10,5], 'Each live campaign must retain one offline Draft revision');
    assert.strictEqual(Number(content.questions), 20, 'Live and revision copies must each persist ranking and conditional rating questions');
    assert.deepStrictEqual([Number(advanced.rankings),Number(advanced.ratings),Number(advanced.conditionalQuestions),Number(advanced.validRatingRanges)],[10,10,10,10], 'Advanced question type/configuration persistence must be exact across revisions');
    assert.strictEqual(Number(options.total), 40, 'Live and revision copies must each persist four ordered option cards');
    assert.strictEqual(Number(options.described), 30, 'Card and bulk-import descriptions must persist across revisions');
    assert.strictEqual(Number(options.illustrated), 10, 'Private option image references must clone without duplicating files');
    assert.deepStrictEqual([Number(media.total),Number(media.youtube)],[10,10], 'Validated video metadata must persist and clone across revisions');
    assert.strictEqual(uploadedFiles.length, 5, 'Private option image inventory must be bounded');
    assert.strictEqual(Number(snapshots.snapshots), 5, 'Each wizard campaign must have one frozen eligibility snapshot');
    assert.strictEqual(Number(forbidden.total), 0, 'Wizard UAT must not create ballot/jury/certification/result data');
    console.log(`Safety Vote UX Phase 10.4 mutation ledger: campaigns=5 open=5 versions=10 revisions=5 questions=20 options=40 media=10 optionImageFiles=5 frozenSnapshots=5 forbiddenBusinessRows=${Number(forbidden.total)}`);
    await verification.end();
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server?.exitCode === null) server.kill();
    await sleep(300);
    const privateRoot = path.resolve(root, 'backend', 'private-uploads', 'safety-vote');
    for (const storedName of uploadedFiles) {
        if (path.basename(storedName) !== storedName || !/^\d+-[a-f0-9]{36}\.(?:jpg|png|webp)$/i.test(storedName)) { console.error('Unexpected private fixture filename; cleanup refused'); process.exitCode=1; continue; }
        const target = path.resolve(privateRoot, storedName);
        if (!target.startsWith(`${privateRoot}${path.sep}`)) { console.error('Private fixture path escaped cleanup root'); process.exitCode=1; continue; }
        await fs.promises.rm(target, { force: true }).catch(()=>{ process.exitCode=1; });
    }
    if (admin) {
        if (guard.test(databaseName)) {
            await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
            const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [databaseName]);
            dropped = Number(row.count) === 0;
        }
        await admin.end();
    }
    if (!dropped) {
        console.error('Disposable database residue check failed');
        process.exitCode = 1;
    } else {
        console.log('Safety Vote UX Phase 2 disposable database residue: 0');
    }
});
