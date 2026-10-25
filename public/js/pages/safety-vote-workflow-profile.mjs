export const WORKFLOW_PROFILE_CONTRACT = '2026-10-25-safety-vote-workflow-profile-r1';

const PROFILES = Object.freeze({
    survey: { contentModel:'questions', actionModel:'answer', participantRole:'respondent', contentLabel:'คำถามแบบสำรวจ', operationLabel:'กติกาการตอบ', participantLabel:'ผู้มีสิทธิ์ตอบ', eligibilityPolicy:'required', juryRequired:false, publicGallery:false },
    popular_vote: { contentModel:'voting_options', actionModel:'vote', participantRole:'voter', contentLabel:'รายการสำหรับลงคะแนน', operationLabel:'กติกาการลงคะแนน', participantLabel:'ผู้มีสิทธิ์ลงคะแนน', eligibilityPolicy:'required', juryRequired:false, publicGallery:true },
    secret_election: { contentModel:'ballot_candidates', actionModel:'secret_vote', participantRole:'elector', contentLabel:'บัตรและรายชื่อผู้สมัคร', operationLabel:'กติกาการเลือกตั้ง', participantLabel:'ผู้มีสิทธิ์เลือกตั้ง', eligibilityPolicy:'required', juryRequired:false, publicGallery:false },
    submission_challenge: { contentModel:'submission_form', actionModel:'submit', participantRole:'submitter', contentLabel:'แบบฟอร์มและไฟล์ผลงาน', operationLabel:'ขั้นตอนตรวจผลงาน', participantLabel:'ผู้มีสิทธิ์ส่งผลงาน', eligibilityPolicy:'required', juryRequired:false, publicGallery:true },
    nomination: { contentModel:'nomination_form', actionModel:'nominate', participantRole:'nominator', contentLabel:'หมวดและข้อมูลผู้ถูกเสนอ', operationLabel:'ขั้นตอนตรวจและยินยอม', participantLabel:'ผู้มีสิทธิ์เสนอชื่อ', eligibilityPolicy:'required', juryRequired:false, publicGallery:false },
    jury_scoring: { contentModel:'work_items', actionModel:'jury_score', participantRole:'conditional_submitter', contentLabel:'ผลงานที่เข้าประกวด', operationLabel:'เกณฑ์ตัดสินและรายชื่อกรรมการ', participantLabel:'ผู้ส่งผลงานและผู้เข้าร่วม', eligibilityPolicy:'conditional_by_work_source', juryRequired:true, publicGallery:true }
});

export function resolveWorkflowProfile(input = {}, options = {}) {
    const row = typeof input === 'string' ? { campaignType: input } : (input || {});
    const requestedType = String(row.campaignType || row.CampaignType || 'survey').toLowerCase();
    const campaignType = Object.prototype.hasOwnProperty.call(PROFILES, requestedType) ? requestedType : 'survey';
    const requestedSource = String(options.workSource || row.workSource || row.WorkSource || 'admin_curated').toLowerCase();
    const workSource = campaignType === 'jury_scoring' && ['admin_curated','employee_submission','imported'].includes(requestedSource) ? requestedSource : null;
    const profile = PROFILES[campaignType];
    return {
        contractVersion: WORKFLOW_PROFILE_CONTRACT,
        campaignType,
        workSource,
        ...profile,
        eligibilityRequired: profile.eligibilityPolicy === 'required' || (campaignType === 'jury_scoring' && workSource === 'employee_submission'),
        companyViewerMayParticipate: false
    };
}

export function wizardStepsFor(input = {}, options = {}) {
    const profile = resolveWorkflowProfile(input, options);
    return [
        ['type','ประเภทแคมเปญ'],
        ['details','ข้อมูลทั่วไป'],
        ['privacy','ความเป็นส่วนตัวและการมองเห็น'],
        ['content',profile.contentLabel],
        ['operation',profile.operationLabel],
        ['eligibility',profile.participantLabel],
        ['schedule','กำหนดเวลา'],
        ['results','การแสดงผล'],
        ['review','ตรวจสอบและเปิดใช้งาน']
    ];
}
