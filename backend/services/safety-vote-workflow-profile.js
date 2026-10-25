'use strict';

const CONTRACT_VERSION = '2026-10-25-safety-vote-workflow-profile-r1';

const PROFILES = Object.freeze({
    survey: Object.freeze({
        contentModel: 'questions', actionModel: 'answer', participantRole: 'respondent',
        contentLabel: 'คำถามแบบสำรวจ', operationLabel: 'กติกาการตอบ', participantLabel: 'ผู้มีสิทธิ์ตอบ',
        eligibilityPolicy: 'required', juryRequired: false, publicGallery: false
    }),
    popular_vote: Object.freeze({
        contentModel: 'voting_options', actionModel: 'vote', participantRole: 'voter',
        contentLabel: 'รายการสำหรับลงคะแนน', operationLabel: 'กติกาการลงคะแนน', participantLabel: 'ผู้มีสิทธิ์ลงคะแนน',
        eligibilityPolicy: 'required', juryRequired: false, publicGallery: true
    }),
    secret_election: Object.freeze({
        contentModel: 'ballot_candidates', actionModel: 'secret_vote', participantRole: 'elector',
        contentLabel: 'บัตรและรายชื่อผู้สมัคร', operationLabel: 'กติกาการเลือกตั้ง', participantLabel: 'ผู้มีสิทธิ์เลือกตั้ง',
        eligibilityPolicy: 'required', juryRequired: false, publicGallery: false
    }),
    submission_challenge: Object.freeze({
        contentModel: 'submission_form', actionModel: 'submit', participantRole: 'submitter',
        contentLabel: 'แบบฟอร์มและไฟล์ผลงาน', operationLabel: 'ขั้นตอนตรวจผลงาน', participantLabel: 'ผู้มีสิทธิ์ส่งผลงาน',
        eligibilityPolicy: 'required', juryRequired: false, publicGallery: true
    }),
    nomination: Object.freeze({
        contentModel: 'nomination_form', actionModel: 'nominate', participantRole: 'nominator',
        contentLabel: 'หมวดและข้อมูลผู้ถูกเสนอ', operationLabel: 'ขั้นตอนตรวจและยินยอม', participantLabel: 'ผู้มีสิทธิ์เสนอชื่อ',
        eligibilityPolicy: 'required', juryRequired: false, publicGallery: false
    }),
    jury_scoring: Object.freeze({
        contentModel: 'work_items', actionModel: 'jury_score', participantRole: 'conditional_submitter',
        contentLabel: 'ผลงานที่เข้าประกวด', operationLabel: 'เกณฑ์ตัดสินและรายชื่อกรรมการ', participantLabel: 'ผู้ส่งผลงานและผู้เข้าร่วม',
        eligibilityPolicy: 'conditional_by_work_source', juryRequired: true, publicGallery: true
    })
});

const WORK_SOURCES = new Set(['admin_curated', 'employee_submission', 'imported']);

function resolveWorkflowProfile(input = {}, options = {}) {
    const row = typeof input === 'string' ? { campaignType: input } : (input || {});
    const requestedType = String(row.campaignType || row.CampaignType || 'survey').toLowerCase();
    const campaignType = Object.prototype.hasOwnProperty.call(PROFILES, requestedType) ? requestedType : 'survey';
    const requestedSource = String(options.workSource || row.workSource || row.WorkSource || 'admin_curated').toLowerCase();
    const workSource = campaignType === 'jury_scoring' && WORK_SOURCES.has(requestedSource) ? requestedSource : null;
    const profile = PROFILES[campaignType];
    const eligibilityRequired = profile.eligibilityPolicy === 'required'
        || (campaignType === 'jury_scoring' && workSource === 'employee_submission');
    return {
        contractVersion: CONTRACT_VERSION,
        campaignType,
        workSource,
        contentModel: profile.contentModel,
        actionModel: profile.actionModel,
        participantRole: profile.participantRole,
        contentLabel: profile.contentLabel,
        operationLabel: profile.operationLabel,
        participantLabel: profile.participantLabel,
        eligibilityPolicy: profile.eligibilityPolicy,
        eligibilityRequired,
        juryRequired: profile.juryRequired,
        publicGallery: profile.publicGallery,
        companyViewerMayParticipate: false
    };
}

module.exports = { CONTRACT_VERSION, PROFILES, resolveWorkflowProfile };
