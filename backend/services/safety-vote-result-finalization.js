'use strict';

const p4 = require('./safety-vote-phase4');
const release = require('./safety-vote-result-release');

const CONTRACT = '2026-10-25-safety-vote-close-finalization-r1';

async function finalizePopularVote(queryable, campaignId, actor = 'SYSTEM_SCHEDULE', trigger = 'scheduled_close') {
    const [[campaign]] = await queryable.query(`SELECT c.id,c.CurrentVersionID,c.CampaignCode,c.Status,v.CampaignType,v.QuorumRuleJson,v.ResultReleasePolicy
        FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID
        WHERE c.id=? FOR UPDATE`, [campaignId]);
    if (!campaign || campaign.Status !== 'Closed') return { status: 'skipped', reason: 'CAMPAIGN_NOT_CLOSED' };
    if (campaign.CampaignType !== 'popular_vote') return { status: 'manual_required', reason: 'GOVERNED_CAMPAIGN_TYPE' };

    const [raw] = await queryable.query("SELECT q.id questionId,q.QuestionCode questionCode,q.Title questionTitle,o.id optionId,o.OptionCode optionCode,o.Label optionLabel,o.IsAbstain,COUNT(DISTINCT b.id) votes FROM SafetyVote_Questions q JOIN SafetyVote_Options o ON o.QuestionID=q.id AND o.Status='Active' LEFT JOIN SafetyVote_BallotAnswers a ON a.QuestionID=q.id AND a.OptionID=o.id LEFT JOIN SafetyVote_Ballots b ON b.id=a.BallotID AND b.CampaignVersionID=? AND b.Status='Accepted' WHERE q.CampaignVersionID=? AND q.Status='Active' AND q.QuestionType IN ('single_choice','multiple_choice','yes_no_abstain') GROUP BY q.id,q.QuestionCode,q.Title,o.id,o.OptionCode,o.Label,o.IsAbstain ORDER BY q.SortOrder,q.id,o.SortOrder,o.id", [campaign.CurrentVersionID, campaign.CurrentVersionID]);
    if (!raw.length) return { status: 'manual_required', reason: 'UNSUPPORTED_RESULT_INPUT' };

    const [[counts]] = await queryable.query("SELECT (SELECT id FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1) eligibilitySnapshotId,(SELECT EligibleCount FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1) eligible,(SELECT COUNT(*) FROM SafetyVote_Participation WHERE CampaignVersionID=? AND State='submitted') participation,(SELECT COUNT(*) FROM SafetyVote_Ballots WHERE CampaignVersionID=? AND Status='Accepted') accepted,(SELECT COUNT(*) FROM SafetyVote_Ballots WHERE CampaignVersionID=? AND Status='Rejected') rejected", [campaign.CurrentVersionID, campaign.CurrentVersionID, campaign.CurrentVersionID, campaign.CurrentVersionID, campaign.CurrentVersionID]);
    const rows = [];
    for (const questionId of [...new Set(raw.map(item => Number(item.questionId)))]) {
        const group = raw.filter(item => Number(item.questionId) === questionId).sort((a, b) => Number(b.votes) - Number(a.votes) || Number(a.optionId) - Number(b.optionId));
        const denominator = group.reduce((sum, item) => sum + Number(item.votes), 0);
        let priorVotes = null;
        let rank = 0;
        group.forEach((item, index) => {
            if (denominator > 0 && (priorVotes === null || Number(item.votes) !== priorVotes)) rank = index + 1;
            priorVotes = Number(item.votes);
            rows.push({ ...item, rank: denominator > 0 ? rank : null, denominator });
        });
    }
    const quorum = JSON.parse(campaign.QuorumRuleJson || '{}');
    const quorumState = Number(counts.participation || 0) >= Math.max(0, Number(quorum.minParticipation || 0)) ? 'met' : 'not_met';
    const tieState = [...new Set(rows.map(item => Number(item.questionId)))].some(questionId => {
        const group = rows.filter(item => Number(item.questionId) === questionId && Number(item.denominator) > 0);
        return group.filter(item => Number(item.rank) === 1).length > 1;
    }) ? 'tie' : 'none';
    const inputHash = p4.hash({ campaignVersionId: Number(campaign.CurrentVersionID), accepted: Number(counts.accepted || 0), rows: rows.map(item => [Number(item.questionId), Number(item.optionId), Number(item.votes)]) });
    const resultHash = p4.hash({ contract: CONTRACT, inputHash, quorumState, tieState, rows: rows.map(item => [Number(item.questionId), Number(item.optionId), Number(item.votes), item.rank]) });
    const [[existing]] = await queryable.query('SELECT id,SnapshotNo,Status,ResultHash FROM SafetyVote_ResultSnapshots WHERE CampaignVersionID=? AND StageID IS NULL AND CalculationContract=? AND InputHash=? ORDER BY SnapshotNo DESC,id DESC LIMIT 1', [campaign.CurrentVersionID, CONTRACT, inputHash]);
    if (existing) return { status: 'already_finalized', snapshotId: Number(existing.id), snapshotNo: Number(existing.SnapshotNo), resultHash: existing.ResultHash };

    const [[sequence]] = await queryable.query('SELECT COALESCE(MAX(SnapshotNo),0)+1 no FROM SafetyVote_ResultSnapshots WHERE CampaignVersionID=? AND StageID IS NULL', [campaign.CurrentVersionID]);
    const [created] = await queryable.query("INSERT INTO SafetyVote_ResultSnapshots(CampaignID,CampaignVersionID,StageID,SnapshotNo,CalculationContract,EligibilitySnapshotID,Status,EligibleCount,ParticipationCount,AcceptedBallotCount,RejectedBallotCount,AbstainCount,QuorumState,TieState,ReconciliationState,InputHash,ResultHash,CalculatedBy,FrozenAt,FrozenBy) VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,'balanced',?,?,?,NOW(),?)", [campaign.id, campaign.CurrentVersionID, Number(sequence.no), CONTRACT, counts.eligibilitySnapshotId || null, 'Frozen', Number(counts.eligible || 0), Number(counts.participation || 0), Number(counts.accepted || 0), Number(counts.rejected || 0), rows.filter(item => Number(item.IsAbstain) === 1).reduce((sum, item) => sum + Number(item.votes), 0), quorumState, tieState, inputHash, resultHash, actor, actor]);
    for (const item of rows) {
        const state = Number(item.denominator) === 0 ? 'no_result' : Number(item.rank) === 1 ? 'winner' : 'normal';
        await queryable.query("INSERT INTO SafetyVote_ResultRows(ResultSnapshotID,QuestionID,OptionID,MetricKey,RawCount,Numerator,Denominator,NumericValue,RankNo,ResultState,MetadataJson) VALUES(?,?,?,'vote_count',?,?,?,?,?,?,?)", [created.insertId, item.questionId, item.optionId, Number(item.votes), Number(item.votes), Number(item.denominator), Number(item.votes), item.rank, state, JSON.stringify({ questionCode: item.questionCode, questionTitle: item.questionTitle, optionCode: item.optionCode, optionLabel: item.optionLabel, percentage: Number(item.denominator) > 0 ? Math.round(Number(item.votes) / Number(item.denominator) * 10000) / 100 : 0 })]);
    }
    const releaseDecision = release.decision({ policy: campaign.ResultReleasePolicy, campaignType: campaign.CampaignType, snapshotStatus: 'Frozen', reconciliationState: 'balanced', governanceReady: true });
    if (releaseDecision.action === 'publish') {
        await queryable.query("UPDATE SafetyVote_ResultSnapshots SET Status='Published' WHERE id=? AND Status='Frozen'", [created.insertId]);
        await queryable.query("UPDATE SafetyVote_Campaigns SET Status='Published',PublishedAt=COALESCE(PublishedAt,NOW()),UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND Status='Closed'", [actor, campaign.id]);
    }
    await queryable.query("INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson) VALUES(?,?,?,'SYSTEM','SAFETY_VOTE_RESULT_AUTO_FINALIZE','SafetyVote_ResultSnapshot',?,200,?,?)", [campaign.id, campaign.CurrentVersionID, actor, String(created.insertId), releaseDecision.action === 'publish' ? 'Closed campaign result calculated and published by policy' : 'Closed campaign result calculated and frozen automatically', JSON.stringify({ trigger, contract: CONTRACT, releaseContract: release.CONTRACT, releasePolicy: releaseDecision.policy, releaseAction: releaseDecision.action, acceptedBallots: Number(counts.accepted || 0), noResult: Number(counts.accepted || 0) === 0, resultHash })]);
    return { status: releaseDecision.action === 'publish' ? 'published' : 'finalized', snapshotStatus: releaseDecision.action === 'publish' ? 'Published' : 'Frozen', releasePolicy: releaseDecision.policy, releaseReason: releaseDecision.reason, snapshotId: Number(created.insertId), snapshotNo: Number(sequence.no), resultHash, quorumState, tieState, noResult: Number(counts.accepted || 0) === 0 };
}

module.exports = { CONTRACT, finalizePopularVote };
