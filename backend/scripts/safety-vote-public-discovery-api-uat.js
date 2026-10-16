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
async function wait(url) {
    for (let index = 0; index < 100; index += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error('fixture timeout');
}
async function call(base, route, { method = 'GET', token = 'sv-admin', body, headers: extra = {} } = {}) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...extra };
    let payload;
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(base + route, { method, headers, body: payload });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch (_) { data = raw; }
    return { status: response.status, data };
}
async function seed(name) {
    const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    await connection.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1),(2,'Production','Active',NOW(),0);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','a@x','x',0),('SV-USER','Eligible User','Production','Line 1','User','B','Operator','u@x','x',0),('SV-USER2','Discovery User','Production','Line 1','User','B','Operator','u2@x','x',0);");
    for (const file of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261015_safety_vote_live_results.sql', '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql']) {
        await connection.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
    }
    await connection.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='discovery-uat' WHERE SettingKey='module_enabled'");
    await connection.end();
}
async function createCampaign(base, discoveryMode) {
    let response = await call(base, '/admin/campaigns', { method: 'POST', body: { titleTh: `Discovery ${discoveryMode}`, campaignType: 'popular_vote', privacyMode: 'identified', resultVisibility: 'published', discoveryMode, privacyThreshold: 2 } });
    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    const id = Number(response.data.data.id);
    response = await call(base, `/admin/campaigns/${id}/eligibility/rules`, { method: 'PUT', body: { rules: [{ effect: 'include', attributeKey: 'employee_id', operator: 'IN', values: ['SV-USER'], reason: 'bounded discovery UAT' }] } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    response = await call(base, `/admin/campaigns/${id}/builder`, { method: 'PUT', body: { questions: [{ questionCode: 'Q1', questionType: 'single_choice', title: 'Choose', minSelections: 1, maxSelections: 1, options: [{ optionCode: 'A', label: 'A' }, { optionCode: 'B', label: 'B' }] }] } });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    const question = response.data.data.questions[0];
    response = await call(base, `/admin/campaigns/${id}/eligibility/freeze`, { method: 'POST', body: { reason: 'public discovery UAT' } });
    assert.strictEqual(response.status, 201, JSON.stringify(response.data));
    assert.strictEqual(Number(response.data.data.eligibleCount), 1);
    assert.strictEqual((await call(base, `/admin/campaigns/${id}/lifecycle/open`, { method: 'POST', body: {} })).status, 200);
    return { id, question };
}
async function lifecycle(label, base) {
    assert.strictEqual((await call(base, '/admin/health')).status, 200);
    const publicCampaign = await createCampaign(base, 'public_listing');
    const privateCampaign = await createCampaign(base, 'eligible_only');
    let response = await call(base, '/me/campaigns', { token: 'sv-user2' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert(response.data.data.rows.some(row => Number(row.id) === publicCampaign.id && Number(row.DiscoveryOnly) === 1 && Number(row.Eligible) === 0));
    assert(!response.data.data.rows.some(row => Number(row.id) === privateCampaign.id));
    response = await call(base, `/campaigns/${publicCampaign.id}`, { token: 'sv-user2' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.accessMode, 'public_listing_preview');
    assert.strictEqual(Boolean(response.data.data.eligibility.discoveryOnly), true);
    assert.strictEqual(response.data.data.questions.length, 0);
    assert.strictEqual(response.data.data.canSubmit, false);
    response = await call(base, `/campaigns/${privateCampaign.id}`, { token: 'sv-user2' });
    assert.strictEqual(response.status, 403, JSON.stringify(response.data));
    response = await call(base, `/campaigns/${publicCampaign.id}`, { token: 'sv-user' });
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert.strictEqual(response.data.data.questions.length, 1);
    assert.strictEqual(response.data.data.canSubmit, true);
    const answer = [{ questionId: Number(publicCampaign.question.id), optionIds: [Number(publicCampaign.question.options[0].id)] }];
    response = await call(base, `/campaigns/${publicCampaign.id}/ballot/submit`, { method: 'POST', token: 'sv-user2', headers: { 'Idempotency-Key': `discovery-${label}-ineligible-0001` }, body: { campaignVersion: 1, acknowledgedRules: true, answers: answer } });
    assert.strictEqual(response.status, 403, JSON.stringify(response.data));
    assert.strictEqual(response.data.code, 'CAMPAIGN_NOT_ELIGIBLE');
    response = await call(base, '/me/campaigns');
    assert.strictEqual(response.status, 200, JSON.stringify(response.data));
    assert(response.data.data.rows.some(row => Number(row.id) === publicCampaign.id));
    assert(response.data.data.rows.some(row => Number(row.id) === privateCampaign.id));
    console.log(`PASS ${label} public discovery list/detail/ballot permission contract`);
}
async function main() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST).toLowerCase()));
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    for (const name of Object.values(names)) { assert(guard.test(name)); await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await seed(name); }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5097' }, stdio: 'ignore', windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', '127.0.0.1:5098', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true }));
    await Promise.all([wait('http://127.0.0.1:5097/__ready'), wait('http://127.0.0.1:5098/__ready')]);
    await lifecycle('node', 'http://127.0.0.1:5097/api/safety-vote');
    await lifecycle('php', 'http://127.0.0.1:5098/api/safety-vote');
    console.log('Safety Vote guarded disposable public discovery API UAT: PASS');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(200);
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        for (const name of Object.values(names)) { const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [name]); if (Number(row.count) !== 0) process.exitCode = 1; }
        await admin.end();
    }
});
