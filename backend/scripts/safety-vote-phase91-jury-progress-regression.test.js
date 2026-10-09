'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = {
    node: `tsh_safety_vote_phase1_node_${stamp}`,
    php: `tsh_safety_vote_phase1_php_${stamp}`
};
// Reuse the existing fixture-host safety prefix; these databases remain unique to this Phase 9.1 run.
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const portBase = 5200 + Math.floor(Math.random() * 200);
const ports = { node: portBase, php: portBase + 1 };
const children = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let admin;

const migrations = [
    '20261008_safety_vote_phase1_foundation.sql',
    '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql',
    '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql',
    '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql'
];

async function waitReady(url) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } });
            if (response.ok) return;
        } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not become ready: ${url}`);
}

async function api(base, route, token = 'sv-admin') {
    const response = await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch (_) {}
    return { status: response.status, body, text };
}

async function prepare(name, label) {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: name,
        multipleStatements: true
    });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0),('SV-J01','Juror One','Safety','Core','User','A','Officer','j1@local','x',0),('SV-J02','Juror Two','Safety','Core','User','A','Officer','j2@local','x',0),('SV-J03','Juror Three','Safety','Core','User','A','Officer','j3@local','x',0),('SV-J04','Juror Four','Safety','Core','User','A','Officer','j4@local','x',0);");
    for (const migration of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='phase91-regression' WHERE SettingKey='module_enabled'");
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,CreatedBy,UpdatedBy) VALUES(?,'Open','SV-ADMIN','eligible_only','SV-ADMIN','SV-ADMIN')", [`${label}-P91`]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','jury_scoring','confidential','Jury progress regression','certified_only','Frozen','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const [stage] = await db.query("INSERT INTO SafetyVote_Stages(CampaignVersionID,StageKey,StageName,StageType,SequenceNo,AdvanceRuleJson,Status,CreatedBy,UpdatedBy) VALUES(?,'JURY','Jury regression','jury',1,'{\"blind\":true}','Open','SV-ADMIN','SV-ADMIN')", [version.insertId]);
    const rows = [
        ['SV-J01', 'Draft', 'clear'],
        ['SV-J02', 'Draft', 'clear'],
        ['SV-J03', 'Submitted', 'clear'],
        ['SV-J04', 'Recused', 'recused']
    ];
    for (const [juror, status, conflict] of rows) {
        await db.query('INSERT INTO SafetyVote_JuryAssignments(CampaignVersionID,StageID,JurorEmployeeID,AssignmentScope,Status,ConflictState,AssignedBy) VALUES(?,?,?,\'stage\',?,?,\'SV-ADMIN\')', [version.insertId, stage.insertId, juror, status, conflict]);
    }
    await db.end();
    return Number(campaign.insertId);
}

function normalize(rows) {
    return (rows || []).map(row => ({ Status: row.Status, ConflictState: row.ConflictState, total: Number(row.total) }))
        .sort((left, right) => `${left.Status}:${left.ConflictState}`.localeCompare(`${right.Status}:${right.ConflictState}`));
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Regression refuses non-loopback DB_HOST');
    for (const name of Object.values(names)) assert(guard.test(name), `Unsafe disposable database name: ${name}`);

    const nodeSource = fs.readFileSync(path.join(root, 'backend', 'routes', 'safety-vote-phase4.js'), 'utf8');
    const phpSource = fs.readFileSync(path.join(root, 'api', 'handlers', 'safety_vote_phase4.php'), 'utf8');
    const qualified = 'SELECT a.Status,a.ConflictState,COUNT(*) total';
    const grouped = 'GROUP BY a.Status,a.ConflictState';
    assert(nodeSource.includes(qualified) && nodeSource.includes(grouped), 'Node jury-progress columns are not qualified');
    assert(phpSource.includes(qualified) && phpSource.includes(grouped), 'PHP jury-progress columns are not qualified');
    assert(!nodeSource.includes('SELECT Status,ConflictState,COUNT(*) total FROM SafetyVote_JuryAssignments a JOIN'), 'Node ambiguous query remains');
    assert(!phpSource.includes('SELECT Status,ConflictState,COUNT(*) total FROM SafetyVote_JuryAssignments a JOIN'), 'PHP ambiguous query remains');

    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const campaignIds = {};
    for (const [label, name] of Object.entries(names)) {
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        campaignIds[label] = await prepare(name, label.toUpperCase());
    }

    children.push(
        spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], {
            cwd: root,
            env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: String(ports.node) },
            stdio: 'ignore', windowsHide: true
        }),
        spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${ports.php}`, path.join(__dirname, 'safety-vote-phase1-php-router.php')], {
            cwd: root,
            env: { ...process.env, DB_NAME: names.php },
            stdio: 'ignore', windowsHide: true
        })
    );
    await Promise.all([
        waitReady(`http://127.0.0.1:${ports.node}/__ready`),
        waitReady(`http://127.0.0.1:${ports.php}/__ready`)
    ]);

    const expected = [
        { Status: 'Draft', ConflictState: 'clear', total: 2 },
        { Status: 'Recused', ConflictState: 'recused', total: 1 },
        { Status: 'Submitted', ConflictState: 'clear', total: 1 }
    ];
    const outputs = {};
    for (const label of ['node', 'php']) {
        const base = `http://127.0.0.1:${ports[label]}/api/safety-vote`;
        const response = await api(base, `/admin/campaigns/${campaignIds[label]}/jury/progress`);
        assert.strictEqual(response.status, 200, `${label} jury-progress failed: ${response.text}`);
        outputs[label] = normalize(response.body?.data?.rows);
        assert.deepStrictEqual(outputs[label], expected, `${label} jury-progress aggregation mismatch`);
    }
    assert.deepStrictEqual(outputs.php, outputs.node, 'Node/PHP jury-progress response mismatch');

    console.log('Safety Vote Phase 9.1 Jury Progress regression: PASS (qualified SQL, populated Node/PHP endpoint parity, exact Draft/Submitted/Recused aggregation)');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(300);
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        const [rows] = await admin.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME IN (?,?)', [names.node, names.php]).catch(() => [[]]);
        await admin.end();
        if (rows.length) {
            console.error(`Phase 9.1 disposable database residue: ${rows.map(row => row.SCHEMA_NAME).join(', ')}`);
            process.exitCode = 1;
        } else console.log('Safety Vote Phase 9.1 disposable database residue: 0');
    }
});
