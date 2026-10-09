'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const phase2 = require('../services/safety-vote-phase2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const basePort = 5580 + Math.floor(Math.random() * 160);
const ports = { node: basePort, php: basePort + 1 };
const evidence = path.join(root, 'backups', 'local', `safety-vote-phase93-${Date.now()}`);
const children = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const migrations = [
    '20261008_safety_vote_phase1_foundation.sql',
    '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql',
    '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql',
    '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql'
];
let admin;

async function prepare(name, label) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','OPS','Officer','admin@local','x',0),('SV-USER','Eligible One','Safety','Core','User','A','Officer','one@local','x',0),('SV-USER2','Eligible Two','Safety','Core','User','A','Officer','two@local','x',0);INSERT INTO Admin_UserPermissions VALUES('SV-USER','SAFETY_VOTE_VIEW',1),('SV-USER2','SAFETY_VOTE_VIEW',1);");
    for (const migration of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='phase93-regression' WHERE SettingKey='module_enabled'");
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,CreatedBy,UpdatedBy) VALUES(?,'Draft','SV-ADMIN','eligible_only','SV-ADMIN','SV-ADMIN')", [`P93-${label.toUpperCase()}`]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','popular_vote','identified','Phase 9.3 rehearsal fixture','hidden_until_close','Draft','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const rule = { ruleGroup: 1, ruleOrder: 1, effect: 'include', attributeKey: 'role', operator: 'EQUALS', values: ['User'], reason: 'Phase 9.3 eligible role' };
    await db.query('INSERT INTO SafetyVote_EligibilityRules(CampaignVersionID,RuleGroup,RuleOrder,Effect,AttributeKey,Operator,ValuesJson,Reason,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?)', [version.insertId, rule.ruleGroup, rule.ruleOrder, rule.effect, rule.attributeKey, rule.operator, JSON.stringify(rule.values), rule.reason, 'SV-ADMIN', 'SV-ADMIN']);
    await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,QuestionCode,QuestionType,Title,IsRequired,MinSelections,MaxSelections,Status,CreatedBy,UpdatedBy) VALUES(?,'Q1','single_choice','Rehearsal question',1,1,1,'Active','SV-ADMIN','SV-ADMIN')", [version.insertId]);
    const baseline = [
        { employeeId: 'SV-USER', departmentId: 1, safetyUnitId: 10, positionId: 100, role: 'User', team: 'A', accountReady: true },
        { employeeId: 'SV-USER2', departmentId: 1, safetyUnitId: 10, positionId: 100, role: 'User', team: 'A', accountReady: true }
    ];
    const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),?,2,2,0,NOW(),'SV-ADMIN','Phase 9.3 baseline','SV-ADMIN')", [version.insertId, phase2.rowsHash(baseline)]);
    for (const row of baseline) await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,?,?,1,'Safety',10,'Core',100,'Officer',?,?,1,1,'eligible','rule')", [snapshot.insertId, row.employeeId, row.employeeId, row.role, row.team]);
    await db.end();
    return { campaignId: Number(campaign.insertId), campaignCode: `P93-${label.toUpperCase()}` };
}

async function request(base, route, token, body) {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    return { status: response.status, data, text };
}

async function fingerprint(db) {
    const [tables] = await db.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'SafetyVote\\_%' ESCAPE '\\\\' ORDER BY TABLE_NAME");
    const counts = {};
    for (const row of tables) {
        const tableName = String(row.TABLE_NAME || row.table_name || '');
        assert(/^SafetyVote_[A-Za-z0-9_]+$/i.test(tableName), `Unsafe table name in fingerprint: ${tableName}`);
        const [[count]] = await db.query(`SELECT COUNT(*) total FROM \`${tableName}\``);
        counts[tableName] = Number(count.total);
    }
    const [campaigns] = await db.query('SELECT id,Status,RowVersion,CurrentVersionID FROM SafetyVote_Campaigns ORDER BY id');
    const [snapshots] = await db.query('SELECT id,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount FROM SafetyVote_EligibilitySnapshots ORDER BY id');
    return crypto.createHash('sha256').update(JSON.stringify({ counts, campaigns, snapshots })).digest('hex');
}

async function waitReady(url) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not become ready: ${url}`);
}

function normalize(data) {
    return {
        rehearsal: data.rehearsal,
        dryRun: data.dryRun,
        externalDelivery: data.externalDelivery,
        businessMutation: data.businessMutation,
        ready: data.ready,
        decision: data.decision,
        campaign: { status: data.campaign.status, campaignType: data.campaign.campaignType, privacyMode: data.campaign.privacyMode },
        eligibility: data.eligibility,
        mutationGuard: data.mutationGuard,
        checks: data.checks
    };
}

async function exercise(label, fixture) {
    const base = `http://127.0.0.1:${ports[label]}/api/safety-vote`;
    const route = `/admin/campaigns/${fixture.campaignId}/rehearsal`;
    const denied = await request(base, route, 'sv-user', { mode: 'dry_run', confirmation: `REHEARSE ${fixture.campaignCode}` });
    assert.strictEqual(denied.status, 403, `${label} rehearsal permission`);
    const wrong = await request(base, route, 'sv-admin', { mode: 'dry_run', confirmation: 'REHEARSE WRONG' });
    assert.strictEqual(wrong.status, 400, `${label} exact confirmation`);
    assert.strictEqual(wrong.data?.code, 'REHEARSAL_CONFIRMATION_REQUIRED', `${label} confirmation code`);

    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: names[label] });
    const before = await fingerprint(db);
    const pass = await request(base, route, 'sv-admin', { mode: 'dry_run', confirmation: `REHEARSE ${fixture.campaignCode}` });
    const after = await fingerprint(db);
    assert.strictEqual(pass.status, 200, `${label} rehearsal pass: ${pass.text}`);
    assert.strictEqual(before, after, `${label} rehearsal mutated Safety Vote state`);
    assert.strictEqual(pass.data?.data?.decision, 'PASS', `${label} ready decision`);
    assert.strictEqual(pass.data?.data?.mutationGuard?.businessRows, 0, `${label} initial business residue`);
    assert.deepStrictEqual(pass.data?.data?.eligibility?.diff, { addedCount: 0, removedCount: 0, changedCount: 0, unchangedCount: 2, addedEmployeeIds: [], removedEmployeeIds: [], changedEmployeeIds: [], truncated: false }, `${label} stable eligibility diff`);
    assert.strictEqual(pass.data?.data?.businessMutation, false, `${label} business mutation flag`);
    assert.strictEqual(pass.data?.data?.externalDelivery, false, `${label} external delivery flag`);
    assert.match(pass.data?.data?.rehearsalHash || '', /^[a-f0-9]{64}$/, `${label} rehearsal SHA-256`);
    assert(!/Eligible One|Eligible Two|admin@local|one@local|two@local/.test(pass.text), `${label} rehearsal leaked names or email`);

    await db.query("UPDATE Employees SET Team='B' WHERE EmployeeID='SV-USER'");
    await db.query("UPDATE Employees SET Role='Viewer' WHERE EmployeeID='SV-USER2'");
    await db.query("INSERT INTO Employees VALUES('SV-USER3','Eligible Three','Safety','Core','User','A','Officer','three@local','x',0)");
    const driftBefore = await fingerprint(db);
    const drift = await request(base, route, 'sv-admin', { mode: 'dry_run', confirmation: `REHEARSE ${fixture.campaignCode}` });
    const driftAfter = await fingerprint(db);
    assert.strictEqual(drift.status, 200, `${label} drift rehearsal`);
    assert.strictEqual(driftBefore, driftAfter, `${label} drift rehearsal mutated Safety Vote state`);
    assert.strictEqual(drift.data?.data?.decision, 'HOLD', `${label} drift decision`);
    assert.deepStrictEqual(drift.data?.data?.eligibility?.diff, { addedCount: 1, removedCount: 1, changedCount: 1, unchangedCount: 0, addedEmployeeIds: ['SV-USER3'], removedEmployeeIds: ['SV-USER2'], changedEmployeeIds: ['SV-USER'], truncated: false }, `${label} added/removed/changed diff`);
    assert(drift.data?.data?.checks.some(check => check.key === 'eligibility_drift' && check.state === 'block'), `${label} drift check`);

    await db.query("INSERT INTO SafetyVote_Notifications(CampaignID,EventType,TemplateKey,Channel,RecipientEmployeeID,ScheduledAt,SuppressionKey,CreatedBy) VALUES(?,'rehearsal_probe','none','in_app','SV-USER',NOW(),?,'SV-ADMIN')", [fixture.campaignId, `phase93-${label}-${stamp}`]);
    const residueBefore = await fingerprint(db);
    const residue = await request(base, route, 'sv-admin', { mode: 'dry_run', confirmation: `REHEARSE ${fixture.campaignCode}` });
    const residueAfter = await fingerprint(db);
    assert.strictEqual(residueBefore, residueAfter, `${label} residue rehearsal mutated Safety Vote state`);
    assert.strictEqual(residue.data?.data?.decision, 'HOLD', `${label} residue decision`);
    assert.strictEqual(residue.data?.data?.mutationGuard?.businessCounts?.notifications, 1, `${label} notification residue`);
    assert(residue.data?.data?.checks.some(check => check.key === 'business_residue' && check.state === 'block'), `${label} residue check`);
    await db.end();
    return { pass: normalize(pass.data.data), drift: normalize(drift.data.data), residue: normalize(residue.data.data) };
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Rehearsal regression refuses non-loopback DB_HOST');
    for (const name of Object.values(names)) assert(guard.test(name), `Unsafe disposable database name: ${name}`);
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const fixtures = {};
    for (const [label, name] of Object.entries(names)) {
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        fixtures[label] = await prepare(name, label);
    }
    children.push(
        spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: String(ports.node) }, stdio: 'ignore', windowsHide: true }),
        spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${ports.php}`, path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true })
    );
    await Promise.all([waitReady(`http://127.0.0.1:${ports.node}/__ready`), waitReady(`http://127.0.0.1:${ports.php}/__ready`)]);
    const outputs = { node: await exercise('node', fixtures.node), php: await exercise('php', fixtures.php) };
    assert.deepStrictEqual(outputs.php, outputs.node, 'Node/PHP rehearsal response parity');
    const result = { decision: 'PASS_LOCAL_REHEARSAL', contract: '2026-10-09-safety-vote-phase9.3-r1', runtimes: ['node', 'php'], exactConfirmation: true, eligibilityDiff: ['added', 'removed', 'changed', 'unchanged'], mutationGuard: true, businessMutation: false, externalDelivery: false, productionConnected: false };
    fs.mkdirSync(evidence, { recursive: true });
    const serialized = `${JSON.stringify(result, null, 2)}\n`, digest = crypto.createHash('sha256').update(serialized).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.json'), serialized);
    fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    console.log(`Safety Vote Phase 9.3 Node/PHP rehearsal and eligibility-diff regression: PASS (${evidence}, result SHA-256 ${digest})`);
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
            console.error(`Phase 9.3 disposable database residue: ${rows.map(row => row.SCHEMA_NAME).join(', ')}`);
            process.exitCode = 1;
        } else console.log('Safety Vote Phase 9.3 disposable database residue: 0');
    }
});
