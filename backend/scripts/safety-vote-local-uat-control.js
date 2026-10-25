'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);
const ENABLE_ARGUMENT = '--enable-local-uat';
const LATEST_SCHEMA = '2026-10-25-jury-work-items-atomic-media-r1';
const GATES = [
    'module_enabled',
    'engagement_enabled',
    'phase7_integrations_enabled',
    'eligibility_amendment_enabled',
    'eligibility_removal_enabled',
    'company_wide_campaign_visibility_enabled',
];
const MIGRATIONS = [
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
    '20261024_safety_vote_eligibility_removal_policy.sql',
    '20261024_safety_vote_question_images.sql',
    '20261024_safety_vote_company_wide_visibility.sql',
    '20261024_safety_vote_candidate_submission_gallery.sql',
    '20261025_safety_vote_official_topn_next_cycle.sql',
    '20261025_safety_vote_result_release_policy.sql',
    '20261025_safety_vote_jury_work_items_atomic_media.sql',
];
const REQUIRED_TABLES = [
    'SafetyVote_Settings',
    'SafetyVote_Campaigns',
    'SafetyVote_CampaignVersions',
    'SafetyVote_Questions',
    'SafetyVote_Promotions',
    'SafetyVote_AdminSavedViews',
    'SafetyVote_CampaignTemplates',
    'SafetyVote_EngagementCounters',
    'SafetyVote_EligibilityAmendments',
    'SafetyVote_EligibilityAmendmentMembers',
    'SafetyVote_EligibilityAmendmentEvents',
    'SafetyVote_GalleryItems',
    'SafetyVote_ElectionPositions',
    'SafetyVote_ElectionPositionCandidates',
    'SafetyVote_CertifierAssignments',
    'SafetyVote_ResultActions',
    'SafetyVote_IntegrationSnapshots',
    'SafetyVote_IntegrationHandoffs',
    'SafetyVote_CampaignVersionLineage',
    'SafetyVote_AcceptanceEvidence',
    'SafetyVote_OperationalAlerts',
    'SafetyVote_MediaLinks',
];
const REQUIRED_VERSION_COLUMNS = [
    'ParentVersionID',
    'ChangeReason',
    'OfficialResultTopN',
    'ResultReleasePolicy',
    'MaxParticipationAttempts',
    'LiveLeaderboardEnabled',
    'LiveLeaderboardTopN',
    'LiveLeaderboardScoreMode',
    'LiveLeaderboardVisibility',
    'LiveLeaderboardRefreshSeconds',
    'LiveLeaderboardPrivacyThreshold',
    'EligibilityEnrollmentMode',
    'EligibilityEnrollmentUpdatedAt',
    'EligibilityEnrollmentUpdatedBy',
];

function numberObject(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
}

async function protectedCounts(db) {
    const [[row]] = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM SafetyVote_Campaigns) campaigns,
          (SELECT COUNT(*) FROM SafetyVote_CampaignVersions) versions,
          (SELECT COUNT(*) FROM SafetyVote_EligibilitySnapshots) eligibilitySnapshots,
          (SELECT COUNT(*) FROM SafetyVote_EligibleVoters) eligibleVoters,
          (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,
          (SELECT COUNT(*) FROM SafetyVote_AuditLogs) audits
    `);
    return numberObject(row);
}

async function inspect(db) {
    const [settings] = await db.query(
        `SELECT SettingKey,SettingValue,UpdatedBy
           FROM SafetyVote_Settings
          WHERE SettingKey IN (${[...GATES, 'contract_version', 'schema_version', 'company_wide_campaign_visibility_contract'].map(() => '?').join(',')})
          ORDER BY SettingKey`,
        [...GATES, 'contract_version', 'schema_version', 'company_wide_campaign_visibility_contract']
    );
    const [tables] = await db.query(
        `SELECT TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA=DATABASE()
            AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => '?').join(',')})`,
        REQUIRED_TABLES
    );
    const [imageColumns] = await db.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_Questions' AND COLUMN_NAME IN ('ImageFileID','ImageAltText')"
    );
    const [versionColumns] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME IN (${REQUIRED_VERSION_COLUMNS.map(() => '?').join(',')})`,
        REQUIRED_VERSION_COLUMNS
    );
    const found = new Set(tables.map(row => String(row.TABLE_NAME).toLowerCase()));
    const foundVersionColumns = new Set(versionColumns.map(row => String(row.COLUMN_NAME).toLowerCase()));
    const settingMap = Object.fromEntries(settings.map(row => [row.SettingKey, String(row.SettingValue)]));
    return {
        settings: settingMap,
        missingTables: REQUIRED_TABLES.filter(table => !found.has(table.toLowerCase())),
        missingVersionColumns: REQUIRED_VERSION_COLUMNS.filter(column => !foundVersionColumns.has(column.toLowerCase())),
        questionImagesReady: imageColumns.length === 2,
        gatesEnabled: Object.fromEntries(GATES.map(key => [key, settingMap[key] === '1'])),
        schemaReady: settingMap.schema_version === LATEST_SCHEMA,
    };
}

async function main() {
    assert(LOOPBACK.has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Refusing non-loopback database');
    assert(process.env.DB_NAME, 'DB_NAME is required');
    const enable = process.argv.includes(ENABLE_ARGUMENT);
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });
    try {
        const before = await inspect(db);
        const countsBefore = await protectedCounts(db);
        if (!enable) {
            console.log(JSON.stringify({ mode: 'READ_ONLY_LOCAL_INSPECTION', database: process.env.DB_NAME, ...before, protectedCounts: countsBefore, productionConnected: false }, null, 2));
            return;
        }

        for (const migration of MIGRATIONS) {
            const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', migration), 'utf8');
            try { await db.query(sql); }
            catch (error) { throw new Error(`Local UAT migration failed at ${migration}: ${error.message}`); }
        }
        await db.query(
            `INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
             ('module_enabled','1','local-uat-activation'),
             ('engagement_enabled','1','local-uat-activation'),
             ('phase7_integrations_enabled','1','local-uat-activation'),
             ('eligibility_amendment_enabled','1','local-uat-activation'),
             ('eligibility_removal_enabled','1','local-uat-activation'),
             ('company_wide_campaign_visibility_enabled','1','local-uat-activation')
             ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy=VALUES(UpdatedBy)`
        );

        const after = await inspect(db);
        const countsAfter = await protectedCounts(db);
        assert.deepStrictEqual(countsAfter, countsBefore, 'Protected Safety Vote business-row counts changed');
        assert.deepStrictEqual(after.missingTables, [], 'Safety Vote UAT schema is incomplete');
        assert.deepStrictEqual(after.missingVersionColumns, [], 'Safety Vote campaign-version schema is incomplete');
        assert.equal(after.questionImagesReady, true, 'Question image columns are incomplete');
        assert.equal(after.schemaReady, true, 'Safety Vote schema version is not the latest accepted Local version');
        for (const gate of GATES) assert.equal(after.gatesEnabled[gate], true, `${gate} is not enabled`);
        console.log(JSON.stringify({
            decision: 'PASS_LOCAL_SAFETY_VOTE_FULL_UAT_ENABLED',
            database: process.env.DB_NAME,
            migrationsAppliedIdempotently: MIGRATIONS,
            gates: after.gatesEnabled,
            schemaVersion: after.settings.schema_version,
            questionImagesReady: after.questionImagesReady,
            protectedCounts: countsAfter,
            protectedCountsUnchanged: true,
            externalDeliveryEnabled: false,
            productionConnected: false,
        }, null, 2));
    } finally {
        await db.end();
    }
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
