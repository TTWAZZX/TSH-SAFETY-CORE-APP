'use strict';

const express = require('express');
const db = require('../db');
const live = require('../services/safety-vote-live-results');

const router = express.Router();
const actor = req => String(req.user?.id || req.user?.EmployeeID || '').trim();
const role = req => String(req.user?.role || req.user?.Role || '').trim().toUpperCase();
const int = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const fail = (res, status, code, message, details) => res.status(status).json({ success: false, code, message, ...(details ? { details } : {}) });

async function hasPermission(req, permission) {
    if (role(req) === 'ADMIN') return true;
    const [[override]] = await db.query('SELECT granted FROM Admin_UserPermissions WHERE employee_id=? AND permission=? LIMIT 1', [actor(req), permission]);
    if (override) return Number(override.granted) === 1;
    const [[row]] = await db.query('SELECT granted FROM Admin_RolePermissions WHERE UPPER(role)=? AND permission=? LIMIT 1', [role(req), permission]);
    return Boolean(row && Number(row.granted) === 1);
}

const permit = permission => async (req, res, next) => {
    try { return await hasPermission(req, permission) ? next() : fail(res, 403, 'PERMISSION_DENIED', 'Safety Vote permission is required.'); }
    catch (_) { return fail(res, 503, 'PERMISSION_CHECK_UNAVAILABLE', 'Unable to verify Safety Vote permission.'); }
};

async function campaign(id) {
    const [[row]] = await db.query('SELECT c.id,c.CampaignCode,c.Status,c.CurrentVersionID,c.OpenedAt,c.ClosedAt,v.CampaignType,v.PrivacyThreshold,v.LiveLeaderboardEnabled,v.LiveLeaderboardTopN,v.LiveLeaderboardScoreMode,v.LiveLeaderboardVisibility,v.LiveLeaderboardRefreshSeconds,v.LiveLeaderboardPrivacyThreshold FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=? AND c.Status<>\'Voided\' LIMIT 1', [id]);
    return row || null;
}

async function questions(versionId) {
    const [rows] = await db.query("SELECT q.id,q.QuestionCode questionCode,q.QuestionType questionType,q.Title title,q.MaxSelections maxSelections,o.id optionId,o.OptionCode optionCode,o.Label label,o.Description description,o.FileID fileId FROM SafetyVote_Questions q LEFT JOIN SafetyVote_Options o ON o.QuestionID=q.id AND o.Status='Active' WHERE q.CampaignVersionID=? AND q.Status='Active' ORDER BY q.SortOrder,q.id,o.SortOrder,o.id", [versionId]);
    const byId = new Map();
    for (const row of rows) {
        if (!byId.has(Number(row.id))) byId.set(Number(row.id), { id: Number(row.id), questionCode: row.questionCode, questionType: row.questionType, title: row.title, maxSelections: Number(row.maxSelections), options: [] });
        if (row.optionId) byId.get(Number(row.id)).options.push({ id: Number(row.optionId), optionCode: row.optionCode, label: row.label, description: row.description, fileId: Number(row.fileId) || null });
    }
    return [...byId.values()];
}

async function responseData(campaignRow, admin) {
    const qs = await questions(campaignRow.CurrentVersionID), supported = live.supportedQuestions(campaignRow.CampaignType, qs);
    if (!supported.ok) throw Object.assign(new Error('This campaign or question configuration does not support Live Leaderboard.'), { status: 409, code: supported.code });
    const [[counts]] = await db.query("SELECT COUNT(*) totalAcceptedVotes FROM SafetyVote_Ballots WHERE CampaignVersionID=? AND Status='Accepted'", [campaignRow.CurrentVersionID]);
    const totalAcceptedVotes = Number(counts.totalAcceptedVotes || 0), threshold = Math.max(live.SERVER_MINIMUM_THRESHOLD, Number(campaignRow.PrivacyThreshold || 0), Number(campaignRow.LiveLeaderboardPrivacyThreshold || 0));
    const empty = totalAcceptedVotes === 0, belowThreshold = totalAcceptedVotes < threshold;
    const status = empty ? 'empty' : belowThreshold ? 'threshold_not_met' : 'available';
    const base = { status, campaignId: Number(campaignRow.id), campaignStatus: campaignRow.Status, config: { enabled: true, topN: Number(campaignRow.LiveLeaderboardTopN || 5), scoreMode: campaignRow.LiveLeaderboardScoreMode, visibility: campaignRow.LiveLeaderboardVisibility, refreshSeconds: Number(campaignRow.LiveLeaderboardRefreshSeconds || 15), privacyThreshold: threshold }, totalAcceptedVotes: empty ? 0 : belowThreshold ? null : totalAcceptedVotes, minimumRequired: threshold, scoreDisclosure: empty ? 'zero' : belowThreshold ? 'masked' : 'aggregate', lastCalculatedAt: new Date().toISOString(), rankingPolicy: 'competition', denominatorPolicy: 'valid_option_answers_including_abstain', provisional: true };
    if (belowThreshold) return { ...base, questions: live.maskedQuestions(qs, base.config.topN, empty) };
    const [answers] = await db.query("SELECT a.QuestionID,a.OptionID FROM SafetyVote_BallotAnswers a JOIN SafetyVote_Ballots b ON b.id=a.BallotID AND b.CampaignVersionID=? AND b.Status='Accepted' JOIN SafetyVote_Questions q ON q.id=a.QuestionID AND q.CampaignVersionID=b.CampaignVersionID AND q.Status='Active' JOIN SafetyVote_Options o ON o.id=a.OptionID AND o.QuestionID=q.id AND o.Status='Active'", [campaignRow.CurrentVersionID]);
    const aggregated = live.aggregate(qs, answers, base.config.topN).map(question => admin ? question : ({ ...question, options: question.summary }));
    return { ...base, questions: aggregated };
}

async function handle(req, res, admin) {
    try {
        const id = int(req.params.id), row = id ? await campaign(id) : null;
        if (!row) return fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.');
        if (!Number(row.LiveLeaderboardEnabled)) return fail(res, 409, 'LIVE_RESULTS_DISABLED', 'Live Leaderboard is disabled for this campaign.');
        if (row.Status !== 'Open') return fail(res, 409, 'LIVE_RESULTS_CAMPAIGN_NOT_OPEN', 'Live results are available only while the campaign is open. Use the official result workflow after closing.');
        if (!admin) {
            if (row.LiveLeaderboardVisibility === 'admin_only') return fail(res, 403, 'LIVE_RESULTS_ADMIN_ONLY', 'Live results are available to administrators only.');
            const [[eligible]] = await db.query("SELECT e.id FROM SafetyVote_EligibilitySnapshots s JOIN SafetyVote_EligibleVoters e ON e.SnapshotID=s.id WHERE s.CampaignVersionID=? AND s.Status='frozen' AND e.EmployeeID=? AND e.EligibilityState='eligible' LIMIT 1", [row.CurrentVersionID, actor(req)]);
            if (!eligible) return fail(res, 403, 'CAMPAIGN_NOT_ELIGIBLE', 'You are not eligible for this campaign.');
            if (row.LiveLeaderboardVisibility === 'after_submit') {
                const [[participation]] = await db.query("SELECT id FROM SafetyVote_Participation WHERE CampaignVersionID=? AND EmployeeID=? AND State='submitted' LIMIT 1", [row.CurrentVersionID, actor(req)]);
                if (!participation) return fail(res, 403, 'LIVE_RESULTS_SUBMISSION_REQUIRED', 'Submit your ballot before viewing live results.');
            }
        }
        return res.json({ success: true, data: await responseData(row, admin) });
    } catch (error) { return fail(res, error.status || 500, error.code || 'LIVE_RESULTS_FAILED', error.status ? error.message : 'Unable to calculate live results.'); }
}

router.get('/campaigns/:id/live-results', permit('SAFETY_VOTE_VIEW'), (req, res) => handle(req, res, false));
router.get('/admin/campaigns/:id/live-results', permit('SAFETY_VOTE_RESULT_VIEW'), (req, res) => handle(req, res, true));
router.put('/admin/campaigns/:id/live-settings', permit('SAFETY_VOTE_MANAGE'), async (req, res) => {
    const id = int(req.params.id), expectedVersion = int(req.body?.versionRowVersion), enabled = req.body?.enabled;
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (!id || !expectedVersion || typeof enabled !== 'boolean' || reason.length < 10) return fail(res, 400, 'VALIDATION_FAILED', 'Campaign ID, versionRowVersion, enabled and a reason of at least 10 characters are required.');
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[row]] = await connection.query("SELECT c.id,c.CampaignCode,c.Status,c.CurrentVersionID,v.CampaignType,v.PrivacyMode,v.LiveLeaderboardEnabled,v.LiveLeaderboardTopN,v.LiveLeaderboardScoreMode,v.LiveLeaderboardVisibility,v.LiveLeaderboardRefreshSeconds,v.LiveLeaderboardPrivacyThreshold,v.RowVersion VersionRowVersion FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=? AND c.Status<>'Voided' LIMIT 1 FOR UPDATE", [id]);
        if (!row) { await connection.rollback(); return fail(res, 404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.'); }
        if (row.Status !== 'Open') { await connection.rollback(); return fail(res, 409, 'LIVE_SETTINGS_CAMPAIGN_NOT_OPEN', 'Operational Live settings can be changed only while the campaign is open.'); }
        if (row.CampaignType !== 'popular_vote' || row.PrivacyMode === 'secret_ballot') { await connection.rollback(); return fail(res, 409, 'LIVE_RESULTS_UNSUPPORTED_CAMPAIGN_TYPE', 'This campaign does not support Live Leaderboard.'); }
        if (Number(row.VersionRowVersion) !== expectedVersion) { await connection.rollback(); return fail(res, 409, 'VERSION_CONFLICT', 'Campaign version changed. Reload before updating Live settings.'); }
        const confirmation = `${enabled ? 'ENABLE' : 'DISABLE'} LIVE ${row.CampaignCode}`;
        if (String(req.body?.confirmation || '') !== confirmation) { await connection.rollback(); return fail(res, 400, 'LIVE_SETTINGS_CONFIRMATION_REQUIRED', `Type ${confirmation} exactly.`); }
        if (enabled) {
            const supported = live.supportedQuestions(row.CampaignType, await questions(row.CurrentVersionID));
            if (!supported.ok) { await connection.rollback(); return fail(res, 409, supported.code, 'This campaign or question configuration does not support Live Leaderboard.'); }
        }
        const previous = Number(row.LiveLeaderboardEnabled) === 1;
        const [updated] = await connection.query('UPDATE SafetyVote_CampaignVersions SET LiveLeaderboardEnabled=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND RowVersion=?', [enabled ? 1 : 0, actor(req), row.CurrentVersionID, expectedVersion]);
        if (Number(updated.affectedRows) !== 1) { await connection.rollback(); return fail(res, 409, 'VERSION_CONFLICT', 'Campaign version changed. Reload before updating Live settings.'); }
        await connection.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [id, row.CurrentVersionID, actor(req), role(req), 'SAFETY_VOTE_LIVE_SETTINGS_UPDATE', 'SafetyVote_CampaignVersion', String(row.CurrentVersionID), 200, reason, JSON.stringify({ previousEnabled: previous, enabled, campaignStatus: row.Status, ballotsPreserved: true, answersPreserved: true, visibility: row.LiveLeaderboardVisibility, topN: Number(row.LiveLeaderboardTopN), privacyThreshold: Number(row.LiveLeaderboardPrivacyThreshold) }), req.ip || null, String(req.headers?.['user-agent'] || '').slice(0, 255) || null]);
        await connection.commit();
        return res.json({ success: true, data: { campaignId: id, versionId: Number(row.CurrentVersionID), versionRowVersion: expectedVersion + 1, enabled, previousEnabled: previous, config: { topN: Number(row.LiveLeaderboardTopN), scoreMode: row.LiveLeaderboardScoreMode, visibility: row.LiveLeaderboardVisibility, refreshSeconds: Number(row.LiveLeaderboardRefreshSeconds), privacyThreshold: Number(row.LiveLeaderboardPrivacyThreshold) }, ballotsPreserved: true, answersPreserved: true } });
    } catch (error) {
        await connection.rollback().catch(() => {});
        return fail(res, 500, 'LIVE_SETTINGS_UPDATE_FAILED', 'Unable to update Live Leaderboard settings.');
    } finally { connection.release(); }
});

module.exports = router;
