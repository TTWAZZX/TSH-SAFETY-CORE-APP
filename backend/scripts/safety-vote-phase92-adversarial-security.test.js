'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
const basePort = 5400 + Math.floor(Math.random() * 180);
const ports = { node: basePort, php: basePort + 1 };
const evidence = path.join(root, 'backups', 'local', `safety-vote-phase92-${Date.now()}`);
const children = [];
const files = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
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

function privateDir(label) {
    return label === 'node'
        ? path.join(root, 'backend', 'private-uploads', 'safety-vote')
        : path.join(root, 'api', 'private', 'safety-vote');
}

function writeFixture(label, purpose) {
    const dir = privateDir(label);
    fs.mkdirSync(dir, { recursive: true });
    const stored = `phase92-${label}-${purpose}-${stamp}.png`;
    const disk = path.join(dir, stored);
    fs.writeFileSync(disk, png);
    files.push(disk);
    return { stored, disk, sha256: crypto.createHash('sha256').update(png).digest('hex') };
}

async function prepare(label, name) {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: name,
        multipleStatements: true
    });
    await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);INSERT INTO Master_Departments VALUES(1,'Safety','Active',NOW(),1);INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW());INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL);INSERT INTO Employees VALUES('SV-ADMIN','Admin','Safety','Core','Admin','A','Officer','admin@local','x',0),('SV-USER','Owner','Safety','Core','User','A','Officer','owner@local','x',0),('SV-USER2','Peer','Safety','Core','User','A','Officer','peer@local','x',0);INSERT INTO Admin_UserPermissions VALUES('SV-USER','SAFETY_VOTE_VIEW',1),('SV-USER2','SAFETY_VOTE_VIEW',1);");
    for (const migration of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='phase92-adversarial' WHERE SettingKey='module_enabled'");
    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,CreatedBy,UpdatedBy) VALUES(?,'Open','SV-ADMIN','eligible_only','SV-ADMIN','SV-ADMIN')", [`P92-${label.toUpperCase()}`]);
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,ContractVersion,CampaignType,PrivacyMode,TitleTh,ResultVisibility,Status,CreatedBy,UpdatedBy) VALUES(?,'2026-10-08-safety-vote-phase0-r1','submission_challenge','confidential','Phase 9.2 adversarial fixture','certified_only','Frozen','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),REPEAT('b',64),2,2,0,NOW(),'SV-ADMIN','SV-ADMIN')", [version.insertId]);
    await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,'SV-USER','Owner',1,1,'eligible','rule'),(?,'SV-USER2','Peer',1,1,'eligible','rule')", [snapshot.insertId, snapshot.insertId]);
    const [question] = await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,QuestionCode,QuestionType,Title,CreatedBy,UpdatedBy) VALUES(?,'ATTACHMENT','file_upload','Restricted answer','SV-ADMIN','SV-ADMIN')", [version.insertId]);
    const [submission] = await db.query("INSERT INTO SafetyVote_Submissions(CampaignID,CampaignVersionID,SubmitterEmployeeID,SubmissionCode,Title,Status) VALUES(?,?,'SV-USER',?,'Restricted submission','Submitted')", [campaign.insertId, version.insertId, `SUB-P92-${label}`]);
    const physical = {
        cover: writeFixture(label, 'cover'),
        submission: writeFixture(label, 'submission'),
        answer: writeFixture(label, 'answer')
    };
    const ids = {};
    for (const purpose of ['cover', 'submission', 'answer']) {
        const [row] = await db.query('INSERT INTO SafetyVote_Files(CampaignID,CampaignVersionID,SubmissionID,QuestionID,FilePurpose,StoredName,OriginalName,MimeType,FileSize,ContentSha256,UploadedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [campaign.insertId, version.insertId, purpose === 'submission' ? submission.insertId : null, purpose === 'answer' ? question.insertId : null, purpose, physical[purpose].stored, `${purpose}.png`, 'image/png', png.length, physical[purpose].sha256, purpose === 'cover' ? 'SV-ADMIN' : 'SV-USER']);
        ids[purpose] = Number(row.insertId);
    }
    const [traversal] = await db.query("INSERT INTO SafetyVote_Files(CampaignID,CampaignVersionID,FilePurpose,StoredName,OriginalName,MimeType,FileSize,ContentSha256,UploadedBy) VALUES(?,?,'cover','../phase92-outside.png','outside.png','image/png',?,?,'SV-ADMIN')", [campaign.insertId, version.insertId, png.length, physical.cover.sha256]);
    ids.traversal = Number(traversal.insertId);
    await db.end();
    return { campaignId: Number(campaign.insertId), ids, physical };
}

async function request(base, route, token) {
    const response = await fetch(`${base}${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const buffer = Buffer.from(await response.arrayBuffer());
    let body = null;
    try { body = JSON.parse(buffer.toString('utf8')); } catch (_) {}
    return { status: response.status, headers: response.headers, buffer, body };
}

function assertHeaders(response, label) {
    assert.match(response.headers.get('cache-control') || '', /private.*no-store.*max-age=0/i, `${label} cache policy`);
    assert.strictEqual(response.headers.get('pragma'), 'no-cache', `${label} pragma`);
    assert.strictEqual(response.headers.get('x-content-type-options'), 'nosniff', `${label} nosniff`);
    assert.strictEqual(response.headers.get('referrer-policy'), 'no-referrer', `${label} referrer policy`);
    assert.strictEqual(response.headers.get('cross-origin-resource-policy'), 'same-origin', `${label} resource policy`);
}

async function waitReady(url) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not become ready: ${url}`);
}

async function exercise(label, fixture) {
    const base = `http://127.0.0.1:${ports[label]}/api/safety-vote`;
    const unauthenticated = await request(base, '/admin/health');
    assert.strictEqual(unauthenticated.status, 401, `${label} unauthenticated request`);
    assertHeaders(unauthenticated, `${label} unauthenticated`);

    const forbidden = await request(base, '/admin/campaigns', 'sv-user2');
    assert.strictEqual(forbidden.status, 403, `${label} admin permission boundary`);
    assertHeaders(forbidden, `${label} forbidden`);

    const cover = await request(base, `/files/${fixture.ids.cover}`, 'sv-user2');
    assert.strictEqual(cover.status, 200, `${label} eligible campaign asset`);
    assert.deepStrictEqual(cover.buffer, png, `${label} campaign asset bytes`);
    assertHeaders(cover, `${label} campaign asset`);

    for (const purpose of ['submission', 'answer']) {
        const denied = await request(base, `/files/${fixture.ids[purpose]}`, 'sv-user2');
        const missing = await request(base, '/files/999999999', 'sv-user2');
        assert.strictEqual(denied.status, 404, `${label} cross-user ${purpose} denial`);
        assert.strictEqual(denied.body?.code, 'FILE_NOT_FOUND', `${label} cross-user ${purpose} anti-enumeration code`);
        assert.strictEqual(missing.status, denied.status, `${label} ${purpose} existence oracle status`);
        assert.strictEqual(missing.body?.code, denied.body?.code, `${label} ${purpose} existence oracle code`);
        assertHeaders(denied, `${label} denied ${purpose}`);
        const owner = await request(base, `/files/${fixture.ids[purpose]}`, 'sv-user');
        assert.strictEqual(owner.status, 200, `${label} owner ${purpose} access`);
        assert.deepStrictEqual(owner.buffer, png, `${label} owner ${purpose} bytes`);
    }

    const traversal = await request(base, `/files/${fixture.ids.traversal}`, 'sv-user2');
    assert.strictEqual(traversal.status, 404, `${label} stored-name traversal confinement`);
    const injection = await request(base, `/files/${encodeURIComponent(`${fixture.ids.cover} OR 1=1`)}`, 'sv-user2');
    assert.strictEqual(injection.status, 404, `${label} numeric identifier injection anti-enumeration`);
    assert.strictEqual(injection.body?.code, 'FILE_NOT_FOUND', `${label} numeric identifier injection code`);

    const scopedDb = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: names[label] });
    await scopedDb.query("INSERT INTO Admin_UserPermissions(employee_id,permission,granted) VALUES('SV-USER2','SAFETY_VOTE_SUBMISSION_REVIEW',1)");
    let reviewer = await request(base, `/files/${fixture.ids.submission}`, 'sv-user2');
    assert.strictEqual(reviewer.status, 200, `${label} submission reviewer access`);
    reviewer = await request(base, `/files/${fixture.ids.answer}`, 'sv-user2');
    assert.strictEqual(reviewer.status, 404, `${label} submission reviewer cannot read answer attachment`);
    await scopedDb.query("INSERT INTO Admin_UserPermissions(employee_id,permission,granted) VALUES('SV-USER2','SAFETY_VOTE_EXPORT',1)");
    const exporter = await request(base, `/files/${fixture.ids.answer}`, 'sv-user2');
    assert.strictEqual(exporter.status, 200, `${label} restricted export access`);

    fs.appendFileSync(fixture.physical.submission.disk, Buffer.from([0]));
    const tampered = await request(base, `/files/${fixture.ids.submission}`, 'sv-user');
    assert.strictEqual(tampered.status, 409, `${label} tampered file status`);
    assert.strictEqual(tampered.body?.code, 'FILE_INTEGRITY_FAILED', `${label} tampered file code`);
    fs.writeFileSync(fixture.physical.submission.disk, png);

    const [columns] = await scopedDb.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('SafetyVote_Ballots','SafetyVote_BallotAnswers')", [names[label]]);
    const forbiddenColumns = columns.map(row => String(row.COLUMN_NAME).toLowerCase()).filter(column => ['employeeid', 'participationid', 'sessionid', 'ipaddress', 'useragent'].includes(column));
    assert.deepStrictEqual(forbiddenColumns, [], `${label} ballot schema correlation fields`);
    const [[counts]] = await scopedDb.query('SELECT (SELECT COUNT(*) FROM SafetyVote_BallotIdentities) identities,(SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_Participation) participation');
    assert.deepStrictEqual({ identities: Number(counts.identities), ballots: Number(counts.ballots), participation: Number(counts.participation) }, { identities: 0, ballots: 0, participation: 0 }, `${label} adversarial read-only mutation boundary`);
    await scopedDb.end();
}

(async () => {
    assert(loopback.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Adversarial test refuses non-loopback DB_HOST');
    for (const name of Object.values(names)) assert(guard.test(name), `Unsafe disposable database name: ${name}`);
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const fixtures = {};
    for (const [label, name] of Object.entries(names)) {
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        fixtures[label] = await prepare(label, name);
    }
    children.push(
        spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: String(ports.node) }, stdio: 'ignore', windowsHide: true }),
        spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${ports.php}`, path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true })
    );
    await Promise.all([waitReady(`http://127.0.0.1:${ports.node}/__ready`), waitReady(`http://127.0.0.1:${ports.php}/__ready`)]);
    await exercise('node', fixtures.node);
    await exercise('php', fixtures.php);
    const result = {
        decision: 'PASS_LOCAL_ADVERSARIAL',
        contract: '2026-10-09-safety-vote-phase9.2-r1',
        runtimes: ['node', 'php'],
        controls: ['anti_enumeration', 'cross_user_file_isolation', 'least_privilege', 'traversal_confinement', 'sha256_integrity', 'privacy_headers', 'ballot_schema_separation'],
        businessMutation: { ballots: 0, participation: 0, identityMappings: 0 },
        productionConnected: false,
        externalDelivery: false
    };
    fs.mkdirSync(evidence, { recursive: true });
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    fs.writeFileSync(path.join(evidence, 'result.json'), serialized);
    const digest = crypto.createHash('sha256').update(serialized).digest('hex');
    fs.writeFileSync(path.join(evidence, 'result.sha256'), `${digest}  result.json\n`);
    console.log(`Safety Vote Phase 9.2 independent adversarial Node/PHP tests: PASS (${evidence}, result SHA-256 ${digest})`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(300);
    for (const file of files) fs.rmSync(file, { force: true });
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        const [rows] = await admin.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME IN (?,?)', [names.node, names.php]).catch(() => [[]]);
        await admin.end();
        if (rows.length) {
            console.error(`Phase 9.2 disposable database residue: ${rows.map(row => row.SCHEMA_NAME).join(', ')}`);
            process.exitCode = 1;
        } else console.log('Safety Vote Phase 9.2 disposable database and private-file residue: 0');
    }
});
