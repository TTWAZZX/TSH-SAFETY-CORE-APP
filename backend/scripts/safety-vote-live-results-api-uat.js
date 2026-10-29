'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = { node: `tsh_safety_vote_phase1_node_${stamp}`, php: `tsh_safety_vote_phase1_php_${stamp}` };
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const children = [];
let admin;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function wait(url) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try { if ((await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } })).ok) return; } catch {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function call(base, route, token = 'sv-admin') {
    const response = await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 2000) }; }
    return { status: response.status, data };
}

async function seed(name) {
    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name, multipleStatements: true });
    try {
        await db.query("CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission));CREATE TABLE Admin_UserPermissions(employee_id VARCHAR(20),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(employee_id,permission));CREATE TABLE Employees(EmployeeID VARCHAR(20) PRIMARY KEY,Department VARCHAR(100)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;INSERT INTO Employees VALUES('SV-USER','Production'),('SV-USER2','Production')");
        for (const file of ['20261008_safety_vote_phase1_foundation.sql', '20261008_safety_vote_phase2_core_mvp.sql', '20261008_safety_vote_phase3_survey_submission.sql', '20261008_safety_vote_phase4_jury_scoring.sql', '20261008_safety_vote_phase5_operations.sql', '20261008_safety_vote_phase6_secret_election.sql', '20261008_safety_vote_phase7_integrations_governance.sql', '20261009_safety_vote_phase10_4_media_versioning.sql', '20261015_safety_vote_live_results.sql', '20261016_safety_vote_participation_attempts.sql', '20261016_safety_vote_campaign_governance.sql', '20261020_safety_vote_eligibility_amendments.sql', '20261024_safety_vote_eligibility_removal_policy.sql', '20261024_safety_vote_question_images.sql', '20261024_safety_vote_company_wide_visibility.sql', '20261024_safety_vote_candidate_submission_gallery.sql', '20261025_safety_vote_company_visibility_remediation.sql', '20261025_safety_vote_official_topn_next_cycle.sql', '20261025_safety_vote_result_release_policy.sql', '20261025_safety_vote_jury_work_items_atomic_media.sql']) {
            await db.query(fs.readFileSync(path.join(root, 'backend', 'migrations', file), 'utf8'));
        }
        await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='module_enabled'");
        await db.query("UPDATE Admin_RolePermissions SET granted=1 WHERE UPPER(role)='USER' AND permission='SAFETY_VOTE_JURY'");
        const [campaign] = await db.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,OpenedAt,CreatedBy,UpdatedBy) VALUES('SHE-001-2026','Open','SV-ADMIN',NOW(),'SV-ADMIN','SV-ADMIN')");
        const [version] = await db.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,CampaignType,PrivacyMode,TitleTh,PrivacyThreshold,LiveLeaderboardEnabled,LiveLeaderboardTopN,LiveLeaderboardScoreMode,LiveLeaderboardVisibility,LiveLeaderboardRefreshSeconds,LiveLeaderboardPrivacyThreshold,Status,CreatedBy,UpdatedBy) VALUES(?,1,'2026-10-08-safety-vote-phase0-r1','popular_vote','identified','Live fixture',5,1,5,'count_percentage','after_submit',15,5,'Frozen','SV-ADMIN','SV-ADMIN')", [campaign.insertId]);
        await db.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?', [version.insertId, campaign.insertId]);
        const [question] = await db.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,QuestionCode,QuestionType,Title,MinSelections,MaxSelections,SortOrder,CreatedBy,UpdatedBy) VALUES(?,'Q1','single_choice','Choose one',1,1,1,'SV-ADMIN','SV-ADMIN')", [version.insertId]);
        const optionIds = [];
        for (let i = 1; i <= 6; i += 1) {
            const [option] = await db.query('INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,SortOrder,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?)', [question.insertId, `O${i}`, `Option ${i}`, i, 'SV-ADMIN', 'SV-ADMIN']);
            optionIds.push(Number(option.insertId));
        }
        const [snapshot] = await db.query("INSERT INTO SafetyVote_EligibilitySnapshots(CampaignVersionID,SnapshotNo,Status,RuleHash,EligibleCount,AccountReadyCount,FrozenAt,FrozenBy,CreatedBy) VALUES(?,1,'frozen',REPEAT('a',64),2,2,NOW(),'SV-ADMIN','SV-ADMIN')", [version.insertId]);
        await db.query("INSERT INTO SafetyVote_EligibleVoters(SnapshotID,EmployeeID,AccountReady,EligibilityState,InclusionSource) VALUES(?,'SV-USER',1,'eligible','rule'),(?,'SV-USER2',1,'eligible','rule')", [snapshot.insertId, snapshot.insertId]);
        await db.query("INSERT INTO SafetyVote_Participation(CampaignID,CampaignVersionID,SnapshotID,EmployeeID,State,AttemptCount,SubmittedAt) VALUES(?,?,?,'SV-USER','submitted',1,NOW())", [campaign.insertId, version.insertId, snapshot.insertId]);
        let sequence = 1;
        for (let optionIndex = 0; optionIndex < optionIds.length; optionIndex += 1) {
            const votes = 6 - optionIndex;
            for (let vote = 0; vote < votes; vote += 1) {
                const hash = String(sequence).padStart(64, '0');
                const [ballot] = await db.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,?,'identified','Accepted',?,?,'fixture')", [version.insertId, sequence, hash, hash]);
                await db.query('INSERT INTO SafetyVote_BallotAnswers(BallotID,QuestionID,OptionID) VALUES(?,?,?)', [ballot.insertId, question.insertId, optionIds[optionIndex]]);
                sequence += 1;
            }
        }
        const rejectedHash = 'f'.repeat(64);
        const [rejected] = await db.query("INSERT INTO SafetyVote_Ballots(CampaignVersionID,BallotSequence,PrivacyModeSnapshot,Status,CanonicalBallotHash,IdempotencyHash,SchemaVersion) VALUES(?,99,'identified','Rejected',?,?,'fixture')", [version.insertId, rejectedHash, rejectedHash]);
        await db.query('INSERT INTO SafetyVote_BallotAnswers(BallotID,QuestionID,OptionID) VALUES(?,?,?)', [rejected.insertId, question.insertId, optionIds[5]]);
        return { campaignId: Number(campaign.insertId), versionId: Number(version.insertId) };
    } finally { await db.end(); }
}

function stable(data) {
    const clone = JSON.parse(JSON.stringify(data));
    delete clone.lastCalculatedAt;
    return clone;
}

async function browserUat(base, campaignId) {
    const browserCandidates = [process.env.SAFETY_VOTE_BROWSER, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
    const executablePath = browserCandidates.find(candidate => fs.existsSync(candidate));
    const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    try {
        for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
            const page = await browser.newPage({ viewportSize: viewport });
            const errors = [];
            page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
            page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(`${base}/__live-user`, { waitUntil: 'networkidle' });
            await page.locator('[data-svp-view="submitted"]').click();
            await page.locator(`[data-svp-campaign="${campaignId}"]`).click();
            await page.waitForTimeout(1000);
            assert.strictEqual(await page.locator('[data-svp-action="live"]').count(), 1, `live tab missing: ${errors.join(' | ')} :: ${(await page.locator('body').innerText()).slice(0, 600)}`);
            await page.locator('[data-svp-action="live"]').click();
            await page.locator('[data-svp-live-panel] .sv-live-board').waitFor();
            assert.strictEqual(await page.locator('[data-svp-live-panel] .sv-live-row').count(), 5);
            assert.strictEqual(await page.locator('[data-svp-live-panel]').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, `user overflow at ${viewport.width}`);
            await page.locator('[data-svp-action="live-toggle"]').click();
            assert.match(await page.locator('[data-svp-action="live-toggle"]').textContent(), /Resume/);
            assert.deepStrictEqual(errors, [], `user console errors at ${viewport.width}`);
            await page.close();
        }
        const page = await browser.newPage({ viewportSize: { width: 430, height: 932 } });
        const errors = [];
        page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/__ux5-admin/admin?campaign=${campaignId}&type=popular_vote&live=1`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-svo-live-results] .sv-live-board').waitFor();
        assert.strictEqual(await page.locator('[data-svo-live-results] .sv-live-row').count(), 6);
        assert.strictEqual(await page.locator('.svo-shell').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'admin mobile overflow');
        await page.locator('[data-svo-action="live-refresh"]').click();
        assert.deepStrictEqual(errors, [], 'admin console errors');
        await page.close();
    } finally { await browser.close(); }
    console.log('PASS Chromium Live Results user/admin responsive UAT (390, 430, 1366)');
}

async function lifecycle(label, base, name, fixture) {
    const createResponse = await fetch(`${base}/admin/campaigns`, { method: 'POST', headers: { Authorization: 'Bearer sv-admin', Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ titleTh: `${label} live create`, campaignType: 'popular_vote', privacyMode: 'identified', resultVisibility: 'hidden_until_close', liveLeaderboardEnabled: true, liveLeaderboardTopN: 37, liveLeaderboardScoreMode: 'count_percentage', liveLeaderboardVisibility: 'always', liveLeaderboardRefreshSeconds: 20, liveLeaderboardPrivacyThreshold: 7 }) });
    const createPayload = await createResponse.json();
    assert.strictEqual(createResponse.status, 201, JSON.stringify(createPayload));
    assert.strictEqual(Number(createPayload.data.LiveLeaderboardEnabled), 1);
    assert.strictEqual(Number(createPayload.data.LiveLeaderboardTopN), 37);
    for (const invalidTopN of [0, 2.5, 101]) {
        const invalidResponse = await fetch(`${base}/admin/campaigns`, { method: 'POST', headers: { Authorization: 'Bearer sv-admin', Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ titleTh: `${label} invalid live ${invalidTopN}`, campaignType: 'popular_vote', privacyMode: 'identified', resultVisibility: 'hidden_until_close', liveLeaderboardEnabled: true, liveLeaderboardTopN: invalidTopN, liveLeaderboardScoreMode: 'count_percentage', liveLeaderboardVisibility: 'always', liveLeaderboardRefreshSeconds: 20, liveLeaderboardPrivacyThreshold: 7 }) });
        assert.strictEqual(invalidResponse.status, 400, `invalid live Top N ${invalidTopN} must fail closed`);
    }
    const adminResult = await call(base, `/admin/campaigns/${fixture.campaignId}/live-results`);
    assert.strictEqual(adminResult.status, 200, JSON.stringify(adminResult.data));
    assert.strictEqual(adminResult.data.data.totalAcceptedVotes, 21);
    assert.strictEqual(adminResult.data.data.questions[0].options.length, 6, 'admin receives full detail');
    assert.strictEqual(adminResult.data.data.questions[0].summary.length, 5, 'summary is limited to Top N');
    assert.deepStrictEqual(adminResult.data.data.questions[0].options.map(row => row.rank), [1, 2, 3, 4, 5, 6]);
    assert.strictEqual(adminResult.data.data.questions[0].options[0].percentage, 28.57);

    const userResult = await call(base, `/campaigns/${fixture.campaignId}/live-results`, 'sv-user');
    assert.strictEqual(userResult.status, 200, JSON.stringify(userResult.data));
    assert.strictEqual(userResult.data.data.questions[0].options.length, 5, 'user receives Top N only');
    const beforeSubmit = await call(base, `/campaigns/${fixture.campaignId}/live-results`, 'sv-user2');
    assert.strictEqual(beforeSubmit.status, 403);
    assert.strictEqual(beforeSubmit.data.code, 'LIVE_RESULTS_SUBMISSION_REQUIRED');

    const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS, database: name });
    try {
        await db.query('UPDATE SafetyVote_CampaignVersions SET LiveLeaderboardPrivacyThreshold=22 WHERE id=?', [fixture.versionId]);
        const threshold = await call(base, `/campaigns/${fixture.campaignId}/live-results`, 'sv-user');
        assert.strictEqual(threshold.status, 200);
        assert.strictEqual(threshold.data.data.status, 'threshold_not_met');
        assert.strictEqual(threshold.data.data.totalAcceptedVotes, null, 'exact count is suppressed below threshold');
        assert.strictEqual(threshold.data.data.questions[0].summary.length, 5, 'threshold state retains Top N placeholders');
        assert.strictEqual(threshold.data.data.questions[0].summary[0].voteCount, null, 'threshold state suppresses option count');
        assert.strictEqual(threshold.data.data.questions[0].summary[0].rank, null, 'threshold state suppresses ranking');
        await db.query('DELETE FROM SafetyVote_BallotAnswers WHERE BallotID IN (SELECT id FROM SafetyVote_Ballots WHERE CampaignVersionID=?)', [fixture.versionId]);
        await db.query('DELETE FROM SafetyVote_Ballots WHERE CampaignVersionID=?', [fixture.versionId]);
        const empty = await call(base, `/campaigns/${fixture.campaignId}/live-results`, 'sv-user');
        assert.strictEqual(empty.status, 200);
        assert.strictEqual(empty.data.data.status, 'empty');
        assert.strictEqual(empty.data.data.totalAcceptedVotes, 0);
        assert.strictEqual(empty.data.data.questions[0].summary.length, 5, 'empty state renders configured Top N placeholders');
        assert.strictEqual(empty.data.data.questions[0].summary[0].voteCount, 0, 'empty state safely exposes zero');
        assert.strictEqual(empty.data.data.questions[0].summary[0].rank, null, 'empty state does not invent ranking');
        await db.query("UPDATE SafetyVote_CampaignVersions SET LiveLeaderboardPrivacyThreshold=5,LiveLeaderboardVisibility='admin_only' WHERE id=?", [fixture.versionId]);
        assert.strictEqual((await call(base, `/campaigns/${fixture.campaignId}/live-results`, 'sv-user')).data.code, 'LIVE_RESULTS_ADMIN_ONLY');
        await db.query('UPDATE SafetyVote_CampaignVersions SET LiveLeaderboardEnabled=0 WHERE id=?', [fixture.versionId]);
        assert.strictEqual((await call(base, `/admin/campaigns/${fixture.campaignId}/live-results`)).data.code, 'LIVE_RESULTS_DISABLED');
        await db.query("UPDATE SafetyVote_CampaignVersions SET LiveLeaderboardEnabled=1,LiveLeaderboardVisibility='always' WHERE id=?", [fixture.versionId]);
        assert.strictEqual((await call(base, `/campaigns/${fixture.campaignId}/live-results`, 'sv-user2')).status, 200);
        await db.query("UPDATE SafetyVote_Campaigns SET Status='Closed' WHERE id=?", [fixture.campaignId]);
        assert.strictEqual((await call(base, `/admin/campaigns/${fixture.campaignId}/live-results`)).data.code, 'LIVE_RESULTS_CAMPAIGN_NOT_OPEN');
    } finally { await db.end(); }
    console.log(`PASS ${label} Live Results guarded API lifecycle`);
    return stable(userResult.data.data);
}

async function main() {
    assert(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').toLowerCase()), 'Refusing non-loopback DB');
    admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASS });
    const fixtures = {};
    for (const [key, name] of Object.entries(names)) {
        assert(guard.test(name));
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        fixtures[key] = await seed(name);
    }
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], { cwd: root, env: { ...process.env, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: '5131' }, stdio: 'ignore', windowsHide: true }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-S', '127.0.0.1:5132', path.join(__dirname, 'safety-vote-phase1-php-router.php')], { cwd: root, env: { ...process.env, DB_NAME: names.php }, stdio: 'ignore', windowsHide: true }));
    await Promise.all([wait('http://127.0.0.1:5131/__ready'), wait('http://127.0.0.1:5132/__ready')]);
    const detailProbe = await call('http://127.0.0.1:5131/api/safety-vote', `/campaigns/${fixtures.node.campaignId}`, 'sv-user');
    assert.strictEqual(Number(detailProbe.data?.data?.campaign?.LiveLeaderboardEnabled), 1, JSON.stringify(detailProbe.data));
    const analyticsProbe = await call('http://127.0.0.1:5131/api/safety-vote', `/admin/campaigns/${fixtures.node.campaignId}/analytics/organization`);
    assert.strictEqual(analyticsProbe.status, 200, JSON.stringify(analyticsProbe.data));
    await browserUat('http://127.0.0.1:5131', fixtures.node.campaignId);
    const node = await lifecycle('Node', 'http://127.0.0.1:5131/api/safety-vote', names.node, fixtures.node);
    const php = await lifecycle('PHP', 'http://127.0.0.1:5132/api/safety-vote', names.php, fixtures.php);
    assert.deepStrictEqual(node, php, 'Node/PHP response parity');
    console.log('Safety Vote Live Results Node/PHP API + Browser UAT: PASS (privacy, visibility, ranking, accepted-only, responsive, zero residue)');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    if (admin) {
        for (const name of Object.values(names)) if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        await admin.end().catch(() => {});
    }
});
