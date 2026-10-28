import { resolveWorkflowProfile, wizardStepsFor as profileWizardStepsFor } from './safety-vote-workflow-profile.mjs';

export function workflowProfileFor(draft = {}) {
    return resolveWorkflowProfile(draft, { workSource: draft.workSource });
}

export function wizardStepsFor(draft = {}) {
    return profileWizardStepsFor(draft, { workSource: draft.workSource }).map(step => Object.freeze([...step]));
}

export const WIZARD_STEPS = Object.freeze(wizardStepsFor({ campaignType: 'survey' }));
export const OFFICIAL_RESULT_TOP_N_MIN = 1;
export const OFFICIAL_RESULT_TOP_N_MAX = 100;
export const OFFICIAL_RESULT_TOP_N_PRESETS = Object.freeze([3, 5, 10, 20, 50]);

export function officialResultTopNValid(value) {
    const topN = Number(value);
    return Number.isInteger(topN) && topN >= OFFICIAL_RESULT_TOP_N_MIN && topN <= OFFICIAL_RESULT_TOP_N_MAX;
}

export const CORE_TEMPLATES = Object.freeze([
    { key: 'survey', label: 'แบบสำรวจความคิดเห็น', description: 'เก็บคำตอบหนึ่งข้อหรือหลายข้อ', privacyMode: 'identified', questionType: 'rating' },
    { key: 'popular_vote', label: 'โหวตยอดนิยม', description: 'เลือกตัวเลือกหรือผลงานที่ชื่นชอบ', privacyMode: 'identified', questionType: 'single_choice' },
    { key: 'secret_election', label: 'เลือกตั้งแบบลับ', description: 'บัตรลงคะแนนลับและผลหลังการรับรอง', privacyMode: 'secret_ballot', questionType: 'single_choice', advancedRequired: true },
    { key: 'submission_challenge', label: 'ส่งผลงานเข้าร่วม', description: 'รับผลงานและส่งต่อกระบวนการตรวจ', privacyMode: 'identified', questionType: 'long_text', advancedRequired: true },
    { key: 'nomination', label: 'เสนอชื่อบุคคลหรือผลงาน', description: 'เสนอชื่อ ขอความยินยอม และตรวจรายการ', privacyMode: 'identified', questionType: 'employee_picker', advancedRequired: true },
    { key: 'jury_scoring', label: 'การประกวดโดยคณะกรรมการ', description: 'กำหนดเกณฑ์และมอบหมายกรรมการ', privacyMode: 'confidential', questionType: 'single_choice', advancedRequired: false }
]);

export const OPTION_TYPES = new Set(['single_choice', 'multiple_choice', 'yes_no_abstain', 'likert', 'ranking', 'matrix', 'allocation', 'token']);
export const QUESTION_TYPES = Object.freeze({
    survey: ['single_choice', 'multiple_choice', 'yes_no_abstain', 'rating', 'likert', 'ranking', 'matrix', 'allocation', 'token', 'short_text', 'long_text', 'date_time', 'employee_picker', 'organization_picker', 'file_upload'],
    popular_vote: ['single_choice', 'multiple_choice', 'yes_no_abstain', 'rating', 'likert', 'ranking', 'matrix', 'allocation', 'token'],
    secret_election: ['single_choice', 'multiple_choice'],
    submission_challenge: ['short_text', 'long_text', 'date_time', 'file_upload'],
    nomination: ['employee_picker', 'organization_picker', 'short_text', 'long_text', 'date_time', 'file_upload'],
    jury_scoring: ['single_choice', 'multiple_choice', 'rating', 'likert', 'ranking', 'short_text', 'long_text']
});
export const SECRET_BLOCKED_TYPES = new Set(['short_text', 'long_text', 'employee_picker', 'organization_picker', 'file_upload', 'matrix']);

export function templateFor(type) {
    return CORE_TEMPLATES.find(item => item.key === type) || CORE_TEMPLATES[0];
}

export function questionTypesFor(type) {
    return QUESTION_TYPES[type] || QUESTION_TYPES.survey;
}

export function hasOptions(questionType) {
    return OPTION_TYPES.has(questionType);
}

export function questionTypeAllowedForPrivacy(questionType, privacyMode) {
    if (privacyMode === 'secret_ballot') return !SECRET_BLOCKED_TYPES.has(questionType);
    if (privacyMode === 'anonymous') return questionType !== 'file_upload';
    return true;
}

export function defaultOptionsForType(questionType) {
    if (questionType === 'yes_no_abstain') return ['ใช่', 'ไม่ใช่', 'งดออกเสียง'].map(label => ({ label }));
    if (questionType === 'likert') return ['ไม่เห็นด้วยอย่างยิ่ง', 'ไม่เห็นด้วย', 'เป็นกลาง', 'เห็นด้วย', 'เห็นด้วยอย่างยิ่ง'].map(label => ({ label }));
    return hasOptions(questionType) ? [{ label: '' }, { label: '' }] : [];
}

export function defaultValidationForType(questionType) {
    if (questionType === 'rating') return { minNumber: 1, maxNumber: 5 };
    if (questionType === 'short_text') return { minLength: 1, maxLength: 1000 };
    if (questionType === 'long_text') return { minLength: 1, maxLength: 10000 };
    if (['employee_picker', 'organization_picker'].includes(questionType)) return { minLength: 1, maxLength: 1000 };
    if (['allocation', 'token'].includes(questionType)) return { totalMax: 100 };
    return {};
}

export function defaultQuestion(type = 'survey', index = 0) {
    const questionType = templateFor(type).questionType;
    return {
        questionCode: `Q${index + 1}`,
        questionType,
        title: '',
        helpText: '',
        imageFileId: null,
        imageAltText: '',
        isRequired: true,
        minSelections: 1,
        maxSelections: questionType === 'multiple_choice' ? 2 : 1,
        randomizeOptions: false,
        allowComment: false,
        validation: defaultValidationForType(questionType),
        displayCondition: null,
        options: defaultOptionsForType(questionType)
    };
}

export function defaultWork(index = 0) {
    return { id: null, workCode: `WORK-${index + 1}`, title: '', description: '', sourceCandidateId: null, gallery: [] };
}

export function createWizardDraft() {
    return {
        campaignType: 'survey', campaignCode: '', titleTh: '', titleEn: '', summary: '', description: '',
        workSource: null,
        privacyMode: 'identified', privacyThreshold: 5, maxParticipationAttempts: 1, discoveryMode: 'public_listing',
        openAt: '', closeAt: '', resultVisibility: 'hidden_until_close', officialResultTopN: 5, resultReleasePolicy: 'automatic',
        liveLeaderboardEnabled: false, liveLeaderboardTopN: 5, liveLeaderboardScoreMode: 'count_percentage',
        liveLeaderboardVisibility: 'after_submit', liveLeaderboardRefreshSeconds: 15, liveLeaderboardPrivacyThreshold: 5,
        questions: [defaultQuestion('survey')], works: [],
        juryCriteria: defaultJuryCriteria(), juryAssignments: [], juryStages: [],
        juryScoring: { method: 'weighted_jury', minJurors: 1, tieBreak: 'candidate_id' },
        juryBlind: true, juryConfigured: false,
        rules: [{ ruleGroup: 1, ruleOrder: 1, effect: 'include', attributeKey: 'all', operator: 'EQUALS', values: [], reason: 'พนักงานทั้งหมด' }],
        eligibilityPreview: null, eligibilityFrozen: false
    };
}

export function defaultJuryCriteria() {
    return [
        { criterionCode: 'CREATIVITY', title: 'ความคิดสร้างสรรค์', description: '', minScore: 1, maxScore: 5, weight: 40 },
        { criterionCode: 'AESTHETICS', title: 'ความสวยงาม', description: '', minScore: 1, maxScore: 5, weight: 30 },
        { criterionCode: 'PRACTICALITY', title: 'การนำไปใช้ได้จริง', description: '', minScore: 1, maxScore: 5, weight: 30 }
    ];
}

export function juryValidationErrors(draft) {
    if (draft.campaignType !== 'jury_scoring') return [];
    const criteria = Array.isArray(draft.juryCriteria) ? draft.juryCriteria : [], errors = [];
    if (!criteria.length) errors.push('ต้องมีเกณฑ์การให้คะแนนอย่างน้อยหนึ่งข้อ');
    if (criteria.length > 50) errors.push('เพิ่มเกณฑ์ได้สูงสุด 50 ข้อ');
    criteria.forEach((criterion, index) => {
        const min = Number(criterion.minScore), max = Number(criterion.maxScore), weight = Number(criterion.weight);
        if (!String(criterion.title || '').trim()) errors.push(`เกณฑ์ ${index + 1}: กรุณาระบุชื่อเกณฑ์`);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) errors.push(`เกณฑ์ ${index + 1}: คะแนนต่ำสุดต้องน้อยกว่าคะแนนสูงสุด`);
        if (!Number.isFinite(weight) || weight <= 0 || weight > 100) errors.push(`เกณฑ์ ${index + 1}: น้ำหนักต้องอยู่ระหว่าง 0.01–100`);
    });
    const total = criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
    if (criteria.length && Math.abs(total - 100) > 0.01) errors.push('น้ำหนักเกณฑ์รวมต้องเท่ากับ 100%');
    const activeAssignments = (draft.juryAssignments || []).filter(item => !['Revoked','Recused'].includes(item.Status || item.status));
    if (!Number.isInteger(Number(draft.juryScoring?.minJurors)) || Number(draft.juryScoring?.minJurors) < 1) errors.push('จำนวนกรรมการขั้นต่ำต้องไม่น้อยกว่า 1 คน');
    if (!activeAssignments.length) errors.push('กรุณาเลือกกรรมการอย่างน้อยหนึ่งคนจากข้อมูลพนักงาน');
    else if (activeAssignments.length < Number(draft.juryScoring?.minJurors || 1)) errors.push('จำนวนกรรมการที่เลือกต้องไม่น้อยกว่าจำนวนกรรมการขั้นต่ำ');
    return errors;
}

export function applyTemplate(draft, type) {
    const template = templateFor(type);
    return {
        ...draft,
        campaignType: template.key,
        workSource: template.key === 'jury_scoring' ? 'admin_curated' : null,
        privacyMode: template.privacyMode,
        maxParticipationAttempts: template.privacyMode === 'secret_ballot' ? 1 : Number(draft.maxParticipationAttempts || 1),
        resultVisibility: template.key === 'secret_election' ? 'certified_only' : 'hidden_until_close',
        liveLeaderboardEnabled: false,
        questions: [defaultQuestion(template.key)], works: template.key === 'jury_scoring' ? [defaultWork()] : [],
        eligibilityPreview: null,
        eligibilityFrozen: false
    };
}

export function questionValidationErrors(question, draft, index) {
    const errors = [];
    if (!question?.title?.trim()) errors.push('กรุณาระบุคำถามหรือหัวข้อ');
    if (question?.imageFileId && !String(question.imageAltText || '').trim()) errors.push('รูปประจำคำถามต้องมีคำอธิบายภาพ');
    if (!questionTypesFor(draft.campaignType).includes(question.questionType)) errors.push('ประเภทคำถามไม่รองรับกับแคมเปญนี้');
    if (!questionTypeAllowedForPrivacy(question.questionType, draft.privacyMode)) errors.push('ประเภทคำถามนี้ไม่รองรับระดับความเป็นส่วนตัวที่เลือก');
    const options = Array.isArray(question.options) ? question.options : [];
    const min = Number(question.minSelections ?? (question.isRequired === false ? 0 : 1)), max = Number(question.maxSelections ?? 1);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max) errors.push('จำนวนตัวเลือกขั้นต่ำ/สูงสุดไม่ถูกต้อง');
    if (['single_choice','yes_no_abstain','likert'].includes(question.questionType) && (min > 1 || max !== 1)) errors.push('คำถามชนิดนี้เลือกได้สูงสุดหนึ่งรายการ');
    if (hasOptions(question.questionType)) {
        if (options.length < 2 || options.length > 100 || options.some(option => !option.label?.trim())) errors.push('ต้องมีตัวเลือก 2–100 รายการและระบุชื่อให้ครบ');
        if (['multiple_choice','ranking'].includes(question.questionType) && max > options.length) errors.push('จำนวนที่เลือกสูงสุดต้องไม่เกินจำนวนตัวเลือก');
    }
    const validation = question.validation || {};
    if (question.questionType === 'rating' && (!Number.isFinite(Number(validation.minNumber)) || !Number.isFinite(Number(validation.maxNumber)) || Number(validation.minNumber) >= Number(validation.maxNumber))) errors.push('ช่วงคะแนนต้องเป็นตัวเลขและค่าต่ำสุดต้องน้อยกว่าค่าสูงสุด');
    if (['short_text','long_text','employee_picker','organization_picker'].includes(question.questionType)) {
        const hardMax = question.questionType === 'long_text' ? 10000 : 1000, minLength=Number(validation.minLength), maxLength=Number(validation.maxLength);
        if (!Number.isInteger(minLength) || !Number.isInteger(maxLength) || minLength < 0 || maxLength < 1 || minLength > maxLength || maxLength > hardMax) errors.push(`ความยาวคำตอบต้องอยู่ในช่วง 0–${hardMax} ตัวอักษร`);
    }
    if (['allocation','token'].includes(question.questionType) && (!Number.isFinite(Number(validation.totalMax)) || Number(validation.totalMax) <= 0)) errors.push('คะแนนรวมสูงสุดต้องมากกว่า 0');
    if (question.displayCondition) {
        const earlier = draft.questions.slice(0,index).map(item => item.questionCode);
        if (!earlier.includes(question.displayCondition.questionCode)) errors.push('เงื่อนไขการแสดงผลต้องอ้างอิงคำถามก่อนหน้า');
        if (!['equals','not_equals','includes','not_includes','answered','not_answered'].includes(question.displayCondition.operator)) errors.push('ตัวดำเนินการของเงื่อนไขไม่ถูกต้อง');
    }
    return errors;
}

export function contentValid(draft) {
    return contentValidationErrors(draft).length===0;
}

export function contentValidationErrors(draft) {
    if (draft.campaignType === 'jury_scoring') {
        const works = Array.isArray(draft.works) ? draft.works : [], errors = [];
        if (draft.workSource === 'admin_curated' && !works.length) errors.push('ต้องมีผลงานที่เข้าประกวดอย่างน้อยหนึ่งรายการ');
        if (works.length > 100) errors.push('เพิ่มผลงานได้สูงสุด 100 รายการ');
        const codes = works.map((work,index) => String(work.workCode || `WORK-${index+1}`).trim().toUpperCase());
        if (new Set(codes).size !== codes.length) errors.push('รหัสผลงานต้องไม่ซ้ำกัน');
        works.forEach((work,index) => {
            if (!String(work.title || '').trim()) errors.push(`ผลงาน ${index+1}: กรุณาระบุชื่อผลงาน`);
            if (draft.workSource === 'imported' && !Number(work.sourceCandidateId)) errors.push(`ผลงาน ${index+1}: กรุณาเลือกผลงานต้นทาง`);
        });
        return errors;
    }
    if (!Array.isArray(draft.questions) || !draft.questions.length) return ['ต้องมีคำถามอย่างน้อยหนึ่งข้อ'];
    const errors=[];
    if(draft.questions.length>50)errors.push('เพิ่มคำถามได้สูงสุด 50 ข้อ');
    const codes=draft.questions.map(question=>question.questionCode);
    if(codes.some(code=>!code)||new Set(codes).size!==codes.length)errors.push('รหัสคำถามต้องไม่ว่างและไม่ซ้ำกัน');
    errors.push(...draft.questions.flatMap((question,index)=>questionValidationErrors(question,draft,index).map(error=>`ข้อ ${index+1}: ${error}`)));
    return errors;
}

export function scheduleValid(draft) {
    if (!draft.openAt || !draft.closeAt) return false;
    const open = new Date(draft.openAt), close = new Date(draft.closeAt);
    return !Number.isNaN(open.getTime()) && !Number.isNaN(close.getTime()) && open < close;
}

export function privacyValid(draft) {
    const attempts = Number(draft.maxParticipationAttempts || 1);
    return Number.isInteger(attempts) && attempts >= 1 && attempts <= 10
        && !(draft.privacyMode === 'secret_ballot' && (draft.resultVisibility === 'live' || attempts !== 1));
}

export function validateStep(step, draft) {
    const errors = [];
    const profile = workflowProfileFor(draft);
    if (step === 0 && !CORE_TEMPLATES.some(item => item.key === draft.campaignType)) errors.push('กรุณาเลือกประเภทแคมเปญ');
    if (step === 1) {
        if (!draft.titleTh.trim()) errors.push('กรุณาระบุชื่อแคมเปญภาษาไทย');
    }
    if (step === 2 && !privacyValid(draft)) errors.push('บัตรลงคะแนนลับไม่สามารถแสดงผลระหว่างกิจกรรมได้');
    if (step === 3) errors.push(...contentValidationErrors(draft));
    if (step === 4 && profile.juryRequired) errors.push(...juryValidationErrors(draft));
    if (step === 5 && profile.eligibilityRequired) {
        if (!draft.rules.length) errors.push('ต้องมีกฎผู้มีสิทธิ์อย่างน้อยหนึ่งข้อ');
        if (!Number(draft.eligibilityPreview?.eligibleCount)) errors.push('ต้องตรวจสอบแล้วพบผู้มีสิทธิ์อย่างน้อยหนึ่งคน');
        if (!draft.eligibilityFrozen) errors.push('กรุณายืนยันและตรึงรายชื่อผู้มีสิทธิ์ก่อนดำเนินการต่อ');
    }
    if (step === 6 && !scheduleValid(draft)) errors.push('วันเวลาเปิดต้องอยู่ก่อนวันเวลาปิด');
    if (step === 7) {
        if (!privacyValid(draft)) errors.push('การแสดงผลไม่สอดคล้องกับความเป็นส่วนตัว');
        if (!officialResultTopNValid(draft.officialResultTopN)) errors.push(`ผลอย่างเป็นทางการต้องกำหนดจำนวนเต็ม ${OFFICIAL_RESULT_TOP_N_MIN}–${OFFICIAL_RESULT_TOP_N_MAX} อันดับ`);
        if (!['manual','automatic'].includes(String(draft.resultReleasePolicy))) errors.push('นโยบายเผยแพร่ผลต้องเป็นแบบอัตโนมัติหรือให้แอดมินเผยแพร่');
        if (draft.liveLeaderboardEnabled && draft.campaignType !== 'popular_vote') errors.push('Live Leaderboard รองรับเฉพาะแคมเปญโหวตยอดนิยม');
        if (draft.liveLeaderboardEnabled && draft.questions.some(question => Number(question.maxSelections) !== 1 || !hasOptions(question.questionType))) errors.push('Live Leaderboard รองรับเฉพาะคำถามแบบตัวเลือกที่เลือกได้สูงสุด 1 รายการ');
        if (draft.liveLeaderboardEnabled && ![5,10].includes(Number(draft.liveLeaderboardTopN))) errors.push('จำนวนอันดับต้องเป็น Top 5 หรือ Top 10');
        if (draft.liveLeaderboardEnabled && (Number(draft.liveLeaderboardRefreshSeconds) < 10 || Number(draft.liveLeaderboardRefreshSeconds) > 60)) errors.push('ความถี่อัปเดตต้องอยู่ระหว่าง 10–60 วินาที');
        if (draft.liveLeaderboardEnabled && Number(draft.liveLeaderboardPrivacyThreshold) < Math.max(5, Number(draft.privacyThreshold))) errors.push('จำนวนขั้นต่ำของผลสดต้องไม่น้อยกว่า Privacy threshold และข้อกำหนด Server');
    }
    return errors;
}

export function readinessItems(draft, persisted = {}) {
    const template = templateFor(draft.campaignType);
    const profile = workflowProfileFor(draft);
    return [
        { key: 'details', label: 'ข้อมูลทั่วไปบันทึกแล้ว', pass: Boolean(persisted.campaignId && draft.campaignCode.trim() && draft.titleTh.trim()) },
        { key: 'privacy', label: 'ความเป็นส่วนตัวและการแสดงผลสอดคล้องกัน', pass: privacyValid(draft) },
        { key: 'content', label: 'เนื้อหาผ่านการตรวจสอบและบันทึกแล้ว', pass: Boolean(persisted.builderSaved && contentValid(draft)) },
        { key: 'operation', label: profile.juryRequired ? 'กำหนดเกณฑ์ตัดสินและรายชื่อกรรมการแล้ว' : `${profile.operationLabel}พร้อมใช้งาน`, pass: !profile.juryRequired || Boolean(draft.juryConfigured && !juryValidationErrors(draft).length) },
        { key: 'eligibility', label: profile.eligibilityRequired ? `ตรวจสอบและตรึง${profile.participantLabel}แล้ว` : `ไม่ต้องตรึง${profile.participantLabel}สำหรับแหล่งผลงานนี้`, pass: !profile.eligibilityRequired || Boolean(draft.eligibilityFrozen && Number(draft.eligibilityPreview?.eligibleCount) > 0) },
        { key: 'schedule', label: 'กำหนดเวลาเปิดและปิดถูกต้อง', pass: scheduleValid(draft) },
        { key: 'advanced', label: template.advancedRequired ? 'ตั้งค่าขั้นสูงตามประเภทแคมเปญในพื้นที่จัดการ' : 'ไม่ต้องตั้งค่าขั้นสูงเพิ่มเติม', pass: !template.advancedRequired }
    ];
}

export function campaignPayload(draft) {
    const apiDate = value => value ? `${String(value).replace('T', ' ')}${String(value).length === 16 ? ':00' : ''}` : null;
    return {
        campaignCode: draft.campaignCode,
        titleTh: draft.titleTh,
        titleEn: draft.titleEn,
        summary: draft.summary,
        description: draft.description,
        templateKey: draft.campaignType,
        campaignType: draft.campaignType,
        privacyMode: draft.privacyMode,
        privacyThreshold: Number(draft.privacyThreshold || 5),
        maxParticipationAttempts: draft.privacyMode === 'secret_ballot' ? 1 : Number(draft.maxParticipationAttempts || 1),
        discoveryMode: draft.discoveryMode,
        resultVisibility: draft.resultVisibility,
        officialResultTopN: Number(draft.officialResultTopN || 5),
        resultReleasePolicy: String(draft.resultReleasePolicy || 'automatic'),
        liveLeaderboardEnabled: Boolean(draft.liveLeaderboardEnabled),
        liveLeaderboardTopN: Number(draft.liveLeaderboardTopN || 5),
        liveLeaderboardScoreMode: draft.liveLeaderboardScoreMode,
        liveLeaderboardVisibility: draft.liveLeaderboardVisibility,
        liveLeaderboardRefreshSeconds: Number(draft.liveLeaderboardRefreshSeconds || 15),
        liveLeaderboardPrivacyThreshold: Math.max(5, Number(draft.privacyThreshold || 5), Number(draft.liveLeaderboardPrivacyThreshold || 5)),
        openAt: apiDate(draft.openAt),
        closeAt: apiDate(draft.closeAt)
    };
}

export function builderPayload(draft) {
    return draft.questions.map((question, index) => ({
        questionCode: question.questionCode || `Q${index + 1}`,
        questionType: question.questionType,
        title: question.title,
        helpText: question.helpText || null,
        imageFileId: Number(question.imageFileId || 0) || null,
        imageAltText: question.imageFileId ? String(question.imageAltText || '').trim() : null,
        isRequired: question.isRequired !== false,
        minSelections: Number(question.minSelections ?? (question.isRequired === false ? 0 : 1)),
        maxSelections: Number(question.maxSelections || 1),
        sortOrder: index + 1,
        randomizeOptions: Boolean(question.randomizeOptions),
        allowComment: Boolean(question.allowComment),
        validation: question.validation || defaultValidationForType(question.questionType),
        displayCondition: question.displayCondition || null,
        options: hasOptions(question.questionType) ? question.options.map((option, optionIndex) => ({ optionCode: option.optionCode || `O${optionIndex + 1}`, label: option.label, description: option.description || null, fileId: Number(option.fileId || 0) || null, sortOrder: optionIndex + 1 })) : []
    }));
}
