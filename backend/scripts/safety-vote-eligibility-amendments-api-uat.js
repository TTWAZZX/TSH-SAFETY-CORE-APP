'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mysql = require('mysql2/promise');
const phase2 = require('../services/safety-vote-phase2');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const children = [];
let admin;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function wait(url) {
    for (let attempt = 0; attempt < 100; attempt++) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch (_) {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function call(base, route, options = {}) {
    const headers = { Authorization: `Bearer ${options.token || 'sv-admin'}`, Accept: 'application/json', ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(options.body); }
    const response = await fetch(`${base}${route}`, { method: options.method || 'GET', headers, body });
    return { status: response.status, data: await response.json() };
}

async function seed(databaseName) {
    const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName, multipleStatements: true });
    await connection.query(`
        CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));
        CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));
        CREATE TABLE Master_Departments(id INT PRIMARY KEY,Name VARCHAR(100),Status VARCHAR(20),CreatedAt DATETIME,is_safety_core TINYINT);
        CREATE TABLE Master_SafetyUnits(id INT PRIMARY KEY,name VARCHAR(100),short_code VARCHAR(30),department_id INT,sort_order INT,created_at DATETIME);
        CREATE TABLE Master_Positions(id INT PRIMARY KEY,Name VARCHAR(100),IsSupervisorPatrol TINYINT,PatrolPassPct DECIMAL(5,2));
        CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,EmployeeName VARCHAR(255),Department VARCHAR(100),Unit VARCHAR(100),Role VARCHAR(50),Team VARCHAR(100),Position VARCHAR(100),CompanyEmail VARCHAR(150),Password VARCHAR(255),MustChangePassword TINYINT);
        INSERT INTO Master_Departments VALUES(1,'Safety','active',NOW(),1),(2,'Production','active',NOW(),0);
        INSERT INTO Master_SafetyUnits VALUES(10,'Core','CORE',1,1,NOW()),(20,'Line 1','L1',2,1,NOW());
        INSERT INTO Master_Positions VALUES(100,'Officer',0,NULL),(200,'Operator',0,NULL);
        INSERT INTO Employees VALUES
          ('SV-ADMIN','Safety Vote Admin','Safety','Core','Admin','A','Officer','admin@example.test','hash',0),
          ('SV-USER','Existing Voter','Production','Line 1','User','B','Operator','user@example.test','hash',0),
          ('SV-USER2','New Voter','Production','Line 1','User','B','Operator','user2@example.test','hash',0);
    `);
    const migrations = [
        '20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql',
        '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql',
        '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql',
        '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql',
        '20261010_safety_vote_ux_phase9a_engagement.sql', '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
        '20261010_safety_vote_ux_phase9c_engagement_analytics.sql', '20261015_safety_vote_live_results.sql',
        '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql',
        '20261020_safety_vote_eligibility_amendments.sql',
    ];
    for (const migration of migrations) await connection.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));
    await connection.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='amendment-uat' WHERE SettingKey='module_enabled'");
    const [campaign] = await connection.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,CreatedBy,UpdatedBy,OpenedAt) VALUES('SHE-991-2026','Open','SV-ADMIN','SV-ADMIN','SV-ADMIN',NOW())");
    const [version] = await connection.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,CampaignType,PrivacyMode,TitleTh,Status,EligibilityEnrollmentMode,CreatedBy,UpdatedBy) VALUES(?,1,'2026-10-08-safety-vote-phase0-r1','popular_vote','identified','Eligibility amendment UAT','Frozen','admin_approval','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
    await connection.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    await connection.query("INSERT INTO SafetyVote_EligibilityRules(CampaignVersionID,RuleGroup,RuleOrder,Effect,AttributeKey,Operator,ValuesJson,Reason,CreatedBy,UpdatedBy) VALUES(?,1,1,'include','role','IN','[\"User\"]','All users','SV-ADMIN','SV-ADMIN')", [version.insertId]);
    const baseline = [{ employeeId: 'SV-USER', departmentId: 2, safetyUnitId: 20, positionId: 200, role: 'User', team: 'B', accountReady: true }];
    const rowsHash = phase2.rowsHash(baseline);
    const [snapshot] = await connection.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,SnapshotKind) VALUES(?,1,'frozen',REPEAT('1',64),?,1,1,0,NOW(),'SV-ADMIN','Initial UAT freeze','SV-ADMIN','initial_freeze')", [version.insertId, rowsHash]);
    await connection.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,DepartmentIDSnapshot,DepartmentNameSnapshot,SafetyUnitIDSnapshot,SafetyUnitNameSnapshot,PositionIDSnapshot,PositionNameSnapshot,RoleSnapshot,TeamSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource,InclusionReason) VALUES(?,'SV-USER','Existing Voter',2,'Production',20,'Line 1',200,'Operator','User','B',1,1,'eligible','rule','Initial UAT freeze')", [snapshot.insertId]);
    await connection.query("INSERT INTO SafetyVote_Participation(CampaignID,CampaignVersionID,SnapshotID,EmployeeID,State,AttemptCount,FirstStartedAt,SubmittedAt,LastActivityAt,ReceiptCodeHash) VALUES(?,?,?,'SV-USER','submitted',1,NOW(),NOW(),NOW(),REPEAT('9',64))", [campaign.insertId, version.insertId, snapshot.insertId]);
    const [ballot] = await connection.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,1,'identified','Accepted',REPEAT('8',64),REPEAT('7',64),'eligibility-amendment-uat')", [version.insertId]);
    await connection.query("INSERT INTO SafetyVote_BallotIdentities(BallotID,EmployeeID,IdentityMode) VALUES(?,'SV-USER','identified')", [ballot.insertId]);
    await connection.end();
    return { campaignId: Number(campaign.insertId), versionId: Number(version.insertId), sourceSnapshotId: Number(snapshot.insertId) };
}

async function inspect(databaseName, fixture) {
    const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    try {
        const [[counts]] = await connection.query("SELECT (SELECT COUNT(*) FROM SafetyVote_EligibilityAmendments) amendments,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentMembers) members,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentEvents) events,(SELECT COUNT(*) FROM SafetyVote_AuditLogs WHERE Action='SAFETY_VOTE_ELIGIBILITY_AMENDMENT_APPLIED') audits,(SELECT COUNT(*) FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen') frozen,(SELECT COUNT(*) FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='superseded') superseded,(SELECT COUNT(*) FROM SafetyVote_Participation WHERE CampaignVersionID=?) participation,(SELECT COUNT(*) FROM SafetyVote_Ballots WHERE CampaignVersionID=?) ballots", [fixture.versionId, fixture.versionId, fixture.versionId, fixture.versionId]);
        const [[current]] = await connection.query("SELECT id,ParentSnapshotID,SnapshotKind,EligibleCount,RowsHash FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen'", [fixture.versionId]);
        const [voters] = await connection.query('SELECT EmployeeID,InclusionSource FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID', [current.id]);
        const [events] = await connection.query('SELECT AmendmentID,EventSequence,EventHash,PreviousEventHash FROM SafetyVote_EligibilityAmendmentEvents ORDER BY AmendmentID,EventSequence');
        const [snapshots] = await connection.query('SELECT id,SnapshotNo,ParentSnapshotID,SnapshotKind,Status,EligibleCount FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? ORDER BY SnapshotNo', [fixture.versionId]);
        const [[vote]] = await connection.query("SELECT p.SnapshotID,p.State,p.AttemptCount,p.ReceiptCodeHash,b.Status ballotStatus,b.CanonicalBallotHash,bi.EmployeeID identityEmployeeId FROM SafetyVote_Participation p JOIN SafetyVote_BallotIdentities bi ON bi.EmployeeID=p.EmployeeID JOIN SafetyVote_Ballots b ON b.id=bi.BallotID AND b.CampaignVersionID=p.CampaignVersionID WHERE p.CampaignVersionID=? AND p.EmployeeID='SV-USER'", [fixture.versionId]);
        assert.deepEqual(Object.values(counts).map(Number), [2, 2, 6, 2, 1, 2, 1, 1]);
        assert.equal(snapshots.length, 3);
        assert.equal(Number(snapshots[0].id), fixture.sourceSnapshotId);
        assert.equal(snapshots[0].ParentSnapshotID, null);
        assert.equal(Number(snapshots[1].ParentSnapshotID), Number(snapshots[0].id));
        assert.equal(Number(snapshots[2].ParentSnapshotID), Number(snapshots[1].id));
        assert.equal(Number(current.ParentSnapshotID), Number(snapshots[1].id));
        assert.equal(current.SnapshotKind, 'amendment');
        assert.equal(Number(current.EligibleCount), 3);
        assert.deepEqual(voters.map(row => row.EmployeeID), ['SV-USER', 'SV-USER2', 'SV-USER3']);
        assert.equal(voters[0].InclusionSource, 'rule');
        assert.equal(voters[1].InclusionSource, 'eligibility_amendment');
        assert.equal(voters[2].InclusionSource, 'eligibility_amendment');
        for (let index = 0; index < events.length; index++) {
            if (index % 3 === 0) assert.equal(events[index].PreviousEventHash, null);
            else assert.equal(events[index].PreviousEventHash, events[index - 1].EventHash);
        }
        assert.equal(Number(vote.SnapshotID), fixture.sourceSnapshotId, 'submitted participation must retain its original snapshot evidence');
        assert.equal(vote.State, 'submitted');
        assert.equal(Number(vote.AttemptCount), 1);
        assert.equal(vote.ReceiptCodeHash, '9'.repeat(64));
        assert.equal(vote.ballotStatus, 'Accepted');
        assert.equal(vote.CanonicalBallotHash, '8'.repeat(64));
        assert.equal(vote.identityEmployeeId, 'SV-USER');
        return { rowsHash: current.RowsHash, eventHashes: events.map(row => row.EventHash) };
    } finally { await connection.end(); }
}

async function lifecycle(label, base, databaseName, fixture, concurrentBase = base) {
    const route = `/admin/campaigns/${fixture.campaignId}/eligibility/amendments`;
    const beforeDiscovery = await call(base, '/me/campaigns', { token: 'sv-user2' });
    assert.equal(beforeDiscovery.status, 200, `${label} discovery before amendment`);
    assert.equal(beforeDiscovery.data.data.eligibilitySource, 'latest_frozen_snapshot');
    assert.equal(beforeDiscovery.data.data.rows.length, 0, `${label} new voter must not see campaign before amendment`);
    assert.equal((await call(base, route, { token: 'sv-user' })).status, 403, `${label} permission boundary`);
    let overview = await call(base, route);
    assert.equal(overview.status, 200, `${label} disabled overview remains readable`);
    assert.equal(overview.data.data.featureEnabled, false);
    assert.equal(overview.data.data.policy.configurable, false);
    let response = await call(base, `${route}/preview`, { method: 'POST', body: {} });
    assert.equal(response.status, 503, `${label} disabled gate`);
    const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    await connection.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='amendment-uat' WHERE SettingKey='eligibility_amendment_enabled'");
    const [[before]] = await connection.query('SELECT COUNT(*) total FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [fixture.versionId]);
    await connection.end();
    const closedPolicy = await call(base, `/admin/campaigns/${fixture.campaignId}/eligibility/enrollment-mode`, { method: 'PUT', body: { enrollmentMode: 'closed_after_open', reason: 'Guarded UAT closes post-open enrollment', confirmation: 'SET SHE-991-2026 closed_after_open' } });
    assert.equal(closedPolicy.status, 200, JSON.stringify(closedPolicy.data));
    assert.equal(closedPolicy.data.data.changed, true);
    const closedPreview = await call(base, `${route}/preview`, { method: 'POST', body: {} });
    assert.equal(closedPreview.status, 409);
    assert.equal(closedPreview.data.code, 'ELIGIBILITY_ENROLLMENT_CLOSED');
    const reopenedPolicy = await call(base, `/admin/campaigns/${fixture.campaignId}/eligibility/enrollment-mode`, { method: 'PUT', body: { enrollmentMode: 'admin_approval', reason: 'Guarded UAT reopens admin-approved enrollment', confirmation: 'SET SHE-991-2026 admin_approval' } });
    assert.equal(reopenedPolicy.status, 200, JSON.stringify(reopenedPolicy.data));
    response = await call(base, `${route}/preview`, { method: 'POST', body: {} });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const data = response.data.data;
    assert.equal(data.contractVersion, '2026-10-20-safety-vote-eligibility-amendments-r1');
    assert.equal(data.dryRun, true);
    assert.equal(data.addOnly, true);
    assert.equal(data.candidateCount, 1);
    assert.equal(data.rows[0].employeeId, 'SV-USER2');
    const verifyPreview = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [[afterPreview]] = await verifyPreview.query('SELECT COUNT(*) total FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=?', [fixture.versionId]);
    await verifyPreview.end();
    assert.equal(Number(afterPreview.total), Number(before.total), `${label} preview must not mutate`);
    const body = { reason: 'New employee joined after campaign opening', previewHash: data.previewHash, confirmation: 'APPLY SHE-991-2026' };
    const stale = await call(base, `${route}/apply`, { method: 'POST', body: { ...body, previewHash: '0'.repeat(64) }, headers: { 'Idempotency-Key': `${label}-stale-amendment-0001` } });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.code, 'ELIGIBILITY_PREVIEW_STALE');
    const applied = await call(base, `${route}/apply`, { method: 'POST', body, headers: { 'Idempotency-Key': `${label}-apply-amendment-0001` } });
    assert.equal(applied.status, 201, JSON.stringify(applied.data));
    assert.equal(applied.data.data.addedCount, 1);
    assert.equal(applied.data.data.replayed, false);
    const afterDiscovery = await call(base, '/me/campaigns', { token: 'sv-user2' });
    assert.equal(afterDiscovery.status, 200, `${label} discovery immediately after amendment`);
    assert.equal(afterDiscovery.data.data.eligibilitySource, 'latest_frozen_snapshot');
    assert.equal(afterDiscovery.data.data.rows.length, 1, `${label} new voter must see campaign immediately`);
    assert.equal(Number(afterDiscovery.data.data.rows[0].Eligible), 1);
    assert.equal(Number(afterDiscovery.data.data.rows[0].EligibilitySnapshotID), Number(applied.data.data.resultSnapshotId));
    assert.equal(Number(afterDiscovery.data.data.rows[0].EligibilitySnapshotNo), Number(applied.data.data.snapshotNo));
    const eligibility = await call(base, `/campaigns/${fixture.campaignId}/eligibility`, { token: 'sv-user2' });
    assert.equal(eligibility.status, 200, `${label} latest eligibility endpoint`);
    assert.equal(eligibility.data.data.eligibilitySource, 'latest_frozen_snapshot');
    assert.equal(eligibility.data.data.eligible, true);
    assert.equal(Number(eligibility.data.data.snapshotId), Number(applied.data.data.resultSnapshotId));
    const detail = await call(base, `/campaigns/${fixture.campaignId}`, { token: 'sv-user2' });
    assert.equal(detail.status, 200, `${label} latest snapshot campaign detail`);
    assert.equal(detail.data.data.eligibility.eligibilitySource, 'latest_frozen_snapshot');
    assert.equal(Number(detail.data.data.eligibility.snapshotId), Number(applied.data.data.resultSnapshotId));
    const replayed = await call(base, `${route}/apply`, { method: 'POST', body, headers: { 'Idempotency-Key': `${label}-apply-amendment-0001` } });
    assert.equal(replayed.status, 200, JSON.stringify(replayed.data));
    assert.equal(replayed.data.data.replayed, true);
    assert.equal(replayed.data.data.amendmentId, applied.data.data.amendmentId);

    const duplicatePreview = await call(base, `${route}/preview`, { method: 'POST', body: {} });
    assert.equal(duplicatePreview.status, 200, JSON.stringify(duplicatePreview.data));
    assert.equal(duplicatePreview.data.data.candidateCount, 0, `${label} an already-added member must not be offered again`);
    const duplicateApply = await call(base, `${route}/apply`, { method: 'POST', body, headers: { 'Idempotency-Key': `${label}-duplicate-member-0002` } });
    assert.equal(duplicateApply.status, 409, JSON.stringify(duplicateApply.data));
    assert.ok(['ELIGIBILITY_PREVIEW_STALE', 'NO_NEW_ELIGIBLE_VOTERS'].includes(duplicateApply.data.code));

    const protectedVote = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: databaseName });
    const [[voteBeforeRace]] = await protectedVote.query("SELECT p.SnapshotID,p.State,p.AttemptCount,p.ReceiptCodeHash,b.Status ballotStatus,b.CanonicalBallotHash FROM SafetyVote_Participation p JOIN SafetyVote_BallotIdentities bi ON bi.EmployeeID=p.EmployeeID JOIN SafetyVote_Ballots b ON b.id=bi.BallotID AND b.CampaignVersionID=p.CampaignVersionID WHERE p.CampaignVersionID=? AND p.EmployeeID='SV-USER'", [fixture.versionId]);
    assert.equal(Number(voteBeforeRace.SnapshotID), fixture.sourceSnapshotId);
    assert.equal(voteBeforeRace.State, 'submitted');
    assert.equal(voteBeforeRace.ballotStatus, 'Accepted');
    await protectedVote.query("INSERT INTO Employees VALUES('SV-USER3','Concurrent New Voter','Production','Line 1','User','B','Operator','user3@example.test','hash',0)");
    await protectedVote.end();

    const concurrentPreview = await call(base, `${route}/preview`, { method: 'POST', body: {} });
    assert.equal(concurrentPreview.status, 200, JSON.stringify(concurrentPreview.data));
    assert.equal(concurrentPreview.data.data.candidateCount, 1);
    assert.equal(concurrentPreview.data.data.rows[0].employeeId, 'SV-USER3');
    const concurrentBody = { reason: 'Concurrent request safety verification', previewHash: concurrentPreview.data.data.previewHash, confirmation: 'APPLY SHE-991-2026' };
    const concurrentKeys = [`${label}-concurrent-amendment-a`, `${label}-concurrent-amendment-b`];
    const concurrentBases = [base, concurrentBase];
    const concurrent = await Promise.all(concurrentKeys.map((key, index) => call(concurrentBases[index], `${route}/apply`, { method: 'POST', body: concurrentBody, headers: { 'Idempotency-Key': key } })));
    assert.deepEqual(concurrent.map(item => item.status).sort((a, b) => a - b), [201, 409], `${label} only one competing apply may commit`);
    const concurrentWinnerIndex = concurrent.findIndex(item => item.status === 201);
    const concurrentLoser = concurrent.find(item => item.status === 409);
    assert.equal(concurrent[concurrentWinnerIndex].data.data.addedCount, 1);
    assert.ok(['ELIGIBILITY_PREVIEW_STALE', 'NO_NEW_ELIGIBLE_VOTERS', 'IDEMPOTENCY_CONFLICT'].includes(concurrentLoser.data.code));
    const concurrentReplay = await call(base, `${route}/apply`, { method: 'POST', body: concurrentBody, headers: { 'Idempotency-Key': concurrentKeys[concurrentWinnerIndex] } });
    assert.equal(concurrentReplay.status, 200, JSON.stringify(concurrentReplay.data));
    assert.equal(concurrentReplay.data.data.replayed, true);

    overview = await call(base, route);
    assert.equal(overview.status, 200);
    assert.equal(overview.data.data.currentSnapshot.snapshotKind, 'amendment');
    assert.equal(overview.data.data.currentSnapshot.eligibleCount, 3);
    assert.equal(overview.data.data.amendments.length, 2);
    assert.equal(overview.data.data.amendments[0].addedCount, 1);
    const evidence = await inspect(databaseName, fixture);
    console.log(`PASS ${label} open-campaign amendment/duplicate guard/submitted-vote preservation/concurrent apply/idempotency/audit`);
    return { preview: { ...data, rows: data.rows.map(row => ({ ...row, onboardingStatus: undefined })) }, applied: applied.data.data, overview: overview.data.data, evidence };
}

async function main() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Refusing non-loopback database');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const fixtures = {};
    for (const [label, name] of Object.entries(names)) {
        assert(guard.test(name));
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        fixtures[label] = await seed(name);
    }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5191' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', '127.0.0.1:5192', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', '127.0.0.1:5193', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    await Promise.all([wait('http://127.0.0.1:5191/__ready'), wait('http://127.0.0.1:5192/__ready'), wait('http://127.0.0.1:5193/__ready')]);
    const node = await lifecycle('node', 'http://127.0.0.1:5191/api/safety-vote', names.node, fixtures.node);
    const php = await lifecycle('php', 'http://127.0.0.1:5192/api/safety-vote', names.php, fixtures.php, 'http://127.0.0.1:5193/api/safety-vote');
    assert.deepEqual(Object.keys(node.preview).sort(), Object.keys(php.preview).sort());
    assert.deepEqual(Object.keys(node.applied).sort(), Object.keys(php.applied).sort());
    assert.deepEqual(Object.keys(node.overview).sort(), Object.keys(php.overview).sort());
    assert.deepEqual(Object.keys(node.overview.policy).sort(), Object.keys(php.overview.policy).sort());
    assert.equal(node.preview.candidateSetHash, php.preview.candidateSetHash);
    assert.equal(node.preview.previewHash, php.preview.previewHash);
    assert.equal(node.applied.afterRowsHash, php.applied.afterRowsHash);
    assert.deepEqual(node.evidence.eventHashes, php.evidence.eventHashes);
    console.log('Safety Vote eligibility amendment guarded Node/PHP API UAT: PASS (parity, add-only snapshot lineage, chained audit, zero production access)');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        for (const name of Object.values(names)) {
            const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [name]).catch(() => [[{ count: -1 }]]);
            if (Number(row.count) !== 0) { console.error(`Disposable residue: ${name}`); process.exitCode = 1; }
        }
        await admin.end().catch(() => {});
    }
});
