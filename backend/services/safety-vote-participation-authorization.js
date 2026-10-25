'use strict';

const CONTRACT_VERSION = '2026-10-25-safety-vote-participation-authorization-r1';

const TYPE_GROUPS = Object.freeze({
    ballot: Object.freeze(['popular_vote','secret_election','survey','poll','feedback','ranking','prioritization','allocation','resolution','petition','event_choice','risk_perception','knowledge_check','multi_stage','hybrid_scoring']),
    submission: Object.freeze(['submission_challenge','jury_scoring','hybrid_scoring','multi_stage']),
    nomination: Object.freeze(['nomination','award','multi_stage']),
    jury: Object.freeze(['jury_scoring','hybrid_scoring','multi_stage']),
});

const ACTIONS = Object.freeze({
    ballot_submit: { group: 'ballot', entitlement: 'eligible' },
    answer_file_upload: { group: 'ballot', entitlement: 'eligible' },
    submission_create: { group: 'submission', entitlement: 'eligible' },
    submission_update: { group: 'submission', entitlement: 'eligible_owner' },
    submission_submit: { group: 'submission', entitlement: 'eligible_owner' },
    submission_withdraw: { group: 'submission', entitlement: 'eligible_owner' },
    submission_file_upload: { group: 'submission', entitlement: 'eligible_owner' },
    submission_gallery_upload: { group: 'submission', entitlement: 'eligible_owner' },
    submission_gallery_update: { group: 'submission', entitlement: 'eligible_owner' },
    submission_gallery_remove: { group: 'submission', entitlement: 'eligible_owner' },
    nomination_create: { group: 'nomination', entitlement: 'eligible' },
    nomination_consent: { group: 'nomination', entitlement: 'nominee' },
    jury_score_save: { group: 'jury', entitlement: 'assignment' },
    jury_score_submit: { group: 'jury', entitlement: 'assignment' },
    jury_recuse: { group: 'jury', entitlement: 'assignment' },
});

function denial(status, code, message) {
    return { allowed: false, status, code, message, contractVersion: CONTRACT_VERSION };
}

function authorize(input = {}) {
    const action = String(input.action || '');
    const policy = ACTIONS[action];
    const campaign = input.campaign || null;
    if (!policy) return denial(400, 'PARTICIPATION_ACTION_INVALID', 'Participation action is not recognized.');
    if (!campaign) return denial(404, 'CAMPAIGN_NOT_FOUND', 'Campaign was not found.');
    if (Number(campaign.IsHidden ?? campaign.isHidden) === 1 || Number(campaign.IsTest ?? campaign.isTest) === 1) return denial(409, 'CAMPAIGN_NOT_PARTICIPATABLE', 'Hidden and test campaigns cannot accept participant actions.');
    const campaignType = String(campaign.CampaignType || campaign.campaignType || '');
    if (!TYPE_GROUPS[policy.group].includes(campaignType)) return denial(409, 'PARTICIPATION_ACTION_NOT_SUPPORTED', 'This participation action is not supported by the campaign type.');
    const currentVersionId = Number(campaign.CurrentVersionID ?? campaign.currentVersionId ?? 0);
    const resourceVersionId = Number(input.resourceVersionId || 0);
    if (resourceVersionId && currentVersionId !== resourceVersionId) return denial(409, 'PARTICIPATION_VERSION_CONFLICT', 'The participation resource is not in the current campaign version.');
    const windowOpen = Number(campaign.VotingWindowOpen ?? campaign.votingWindowOpen) === 1;
    if (String(campaign.Status || campaign.status) !== 'Open' || !windowOpen) return denial(409, 'CAMPAIGN_NOT_IN_VOTING_WINDOW', 'The campaign participation window is closed.');
    if (policy.entitlement.includes('eligible') && input.eligible !== true) return denial(403, 'CAMPAIGN_NOT_ELIGIBLE', 'This account has read-only catalogue access and cannot participate.');
    if (policy.entitlement === 'eligible_owner' && input.owner !== true) return denial(403, 'PARTICIPATION_OWNERSHIP_REQUIRED', 'Only the owner may change this participation resource.');
    if (policy.entitlement === 'nominee' && input.nominee !== true) return denial(403, 'PARTICIPATION_NOMINEE_REQUIRED', 'Only the nominated employee may record consent.');
    if (policy.entitlement === 'assignment' && input.assignment !== true) return denial(403, 'PARTICIPATION_ASSIGNMENT_REQUIRED', 'An active jury assignment is required.');
    return { allowed: true, status: 200, code: 'PARTICIPATION_AUTHORIZED', contractVersion: CONTRACT_VERSION, action, entitlement: policy.entitlement, campaignType };
}

module.exports = { CONTRACT_VERSION, TYPE_GROUPS, ACTIONS, authorize };
