'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const databaseName = `tsh_safety_vote_amend_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const databaseGuard = /^tsh_safety_vote_amend_\d+_\d+$/;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
const migrations = [
    '20261008_safety_vote_phase1_foundation.sql',
    '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql',
    '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql',
    '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql',
    '20261009_safety_vote_phase10_4_media_versioning.sql',
    '20261010_safety_vote_ux_phase9a_engagement.sql',
    '20261010_safety_vote_ux_phase9b_planning_content_communication.sql',
    '20261010_safety_vote_ux_phase9c_engagement_analytics.sql',
    '20261015_safety_vote_live_results.sql',
    '20261016_safety_vote_participation_attempts.sql',
    '20261016_safety_vote_campaign_governance.sql',
    '20261020_safety_vote_eligibility_amendments.sql',
    '20261020_safety_vote_eligibility_amendments.sql',
];

let admin;
let db;

async function main() {
    assert(loopbackHosts.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'loopback database required');
    assert(databaseGuard.test(databaseName), 'disposable database guard failed');
    const config = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS };
    admin = await mysql.createConnection(config);
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ ...config, database: databaseName, multipleStatements: true });
    await db.query('CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission))');
    for (const migration of migrations) await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', migration), 'utf8'));

    const [[tableCount]] = await db.query("SELECT COUNT(*) total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('SafetyVote_EligibilityAmendments','SafetyVote_EligibilityAmendmentMembers','SafetyVote_EligibilityAmendmentEvents')", [databaseName]);
    const [versionColumns] = await db.query("SELECT COLUMN_NAME,COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME LIKE 'EligibilityEnrollment%'", [databaseName]);
    const [snapshotColumns] = await db.query("SELECT COLUMN_NAME,COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='SafetyVote_EligibilitySnapshots' AND COLUMN_NAME IN ('ParentSnapshotID','SnapshotKind')", [databaseName]);
    assert.equal(Number(tableCount.total), 3);
    assert.equal(versionColumns.length, 3);
    assert.equal(String(versionColumns.find(row => row.COLUMN_NAME === 'EligibilityEnrollmentMode').COLUMN_DEFAULT).replaceAll("'", ''), 'closed_after_open');
    assert.equal(snapshotColumns.length, 2);

    const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,CreatedBy,UpdatedBy) VALUES('SHE-901-2026','Open','A1','A1','A1')");
    const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,CampaignType,PrivacyMode,TitleTh,EligibilityEnrollmentMode,CreatedBy,UpdatedBy,Status) VALUES(?,1,'2026-10-20-safety-vote-eligibility-amendments-r1','popular_vote','identified','Amendment fixture','admin_approval','A1','A1','Open')", [campaign.insertId]);
    await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
    const [source] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,SnapshotKind) VALUES(?,1,'frozen',REPEAT('1',64),REPEAT('2',64),1,1,0,NOW(),'A1','Initial fixture','A1','initial_freeze')", [version.insertId]);
    await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,EmployeeNameSnapshot,MasterPresent,AccountReady,EligibilityState,InclusionSource) VALUES(?,'E001','Existing voter',1,1,'eligible','rule_match')", [source.insertId]);
    const [amendment] = await db.query("INSERT INTO SafetyVote_EligibilityAmendments(CampaignID,CampaignVersionID,SourceSnapshotID,EnrollmentMode,RequestType,Status,Reason,CandidateCount,ApprovedCount,BeforeRowsHash,CandidateSetHash,IdempotencyKeyHash,RequestedBy) VALUES(?,?,?,'admin_approval','manual_review','Approved','New eligible employee joined',1,1,REPEAT('2',64),REPEAT('3',64),REPEAT('4',64),'A1')", [campaign.insertId, version.insertId, source.insertId]);
    await db.query("INSERT INTO SafetyVote_EligibilityAmendmentMembers(AmendmentID,EmployeeID,EmployeeNameSnapshot,MasterPresent,AccountReady,SourceType,SourceReason,MasterWarningsJson,MemberStatus,DecisionReason,DecidedBy,DecidedAt) VALUES(?,'E002','New voter',1,0,'rule_match','Matched current rules','[]','Approved','Approved by fixture','A1',NOW())", [amendment.insertId]);
    await db.query("INSERT INTO SafetyVote_EligibilityAmendmentEvents(AmendmentID,CampaignID,CampaignVersionID,EventSequence,EventType,ActorEmployeeID,ActorRole,FromStatus,ToStatus,BoundedDetail,MetadataJson,EventHash) VALUES(?,?,?,1,'REQUESTED','A1','Admin',NULL,'Pending','Fixture request','{}',REPEAT('5',64)),(?,?,?,2,'APPROVED','A1','Admin','Pending','Approved','Fixture approval','{}',REPEAT('6',64))", [amendment.insertId, campaign.insertId, version.insertId, amendment.insertId, campaign.insertId, version.insertId]);
    const [result] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,RowsHash,EligibleCount,AccountReadyCount,WarningCount,FrozenAt,FrozenBy,Reason,CreatedBy,ParentSnapshotID,SnapshotKind) VALUES(?,2,'frozen',REPEAT('1',64),REPEAT('7',64),2,1,0,NOW(),'A1','Eligibility amendment fixture','A1',?,'amendment')", [version.insertId, source.insertId]);
    await db.query("UPDATE SafetyVote_EligibilitySnapshots SET Status='superseded' WHERE id=?", [source.insertId]);
    await db.query("UPDATE SafetyVote_EligibilityAmendments SET ResultSnapshotID=?,Status='Applied',AddedCount=1,AfterRowsHash=REPEAT('7',64),AppliedBy='A1',AppliedAt=NOW() WHERE id=?", [result.insertId, amendment.insertId]);
    await db.query("INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,BoundedDetail,MetadataJson) VALUES(?,?,'A1','Admin','SAFETY_VOTE_ELIGIBILITY_AMENDMENT_APPLIED','SafetyVote_EligibilityAmendment',?,'Added 1 eligible voter','{}')", [campaign.insertId, version.insertId, String(amendment.insertId)]);

    const [[evidence]] = await db.query("SELECT a.Status,a.AddedCount,a.ResultSnapshotID,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentMembers m WHERE m.AmendmentID=a.id) members,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentEvents e WHERE e.AmendmentID=a.id) events,(SELECT COUNT(*) FROM SafetyVote_AuditLogs l WHERE l.Action='SAFETY_VOTE_ELIGIBILITY_AMENDMENT_APPLIED' AND l.TargetID=?) genericAudits FROM SafetyVote_EligibilityAmendments a WHERE a.id=?", [String(amendment.insertId), amendment.insertId]);
    assert.equal(evidence.Status, 'Applied');
    assert.equal(Number(evidence.AddedCount), 1);
    assert.equal(Number(evidence.ResultSnapshotID), Number(result.insertId));
    assert.equal(Number(evidence.members), 1);
    assert.equal(Number(evidence.events), 2);
    assert.equal(Number(evidence.genericAudits), 1);

    await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', '20261020_safety_vote_eligibility_amendments.rollback.sql'), 'utf8'));
    const [[retained]] = await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_EligibilityAmendments) amendments,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentMembers) members,(SELECT COUNT(*) FROM SafetyVote_EligibilityAmendmentEvents) events,(SELECT EligibilityEnrollmentMode FROM SafetyVote_CampaignVersions WHERE id=?) mode,(SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='eligibility_amendment_enabled') enabled", [version.insertId]);
    assert.deepEqual([Number(retained.amendments), Number(retained.members), Number(retained.events)], [1, 1, 2]);
    assert.equal(retained.mode, 'closed_after_open');
    assert.equal(retained.enabled, '0');
    console.log('Safety Vote eligibility amendments disposable migration: PASS (idempotent x2, lineage, member evidence, chained events, generic audit, data-preserving rollback)');
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (db) await db.end().catch(() => {});
    if (admin && databaseGuard.test(databaseName)) await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``).catch(() => {});
    if (admin) await admin.end().catch(() => {});
});
