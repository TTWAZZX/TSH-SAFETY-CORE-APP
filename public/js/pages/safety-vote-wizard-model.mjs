export const WIZARD_STEPS = Object.freeze([
    ['type', 'ประเภทแคมเปญ'],
    ['details', 'ข้อมูลทั่วไป'],
    ['privacy', 'ความเป็นส่วนตัว'],
    ['content', 'เนื้อหา'],
    ['eligibility', 'ผู้มีสิทธิ์'],
    ['schedule', 'กำหนดเวลา'],
    ['results', 'การแสดงผล'],
    ['review', 'ตรวจสอบและเปิดใช้งาน']
]);

export const CORE_TEMPLATES = Object.freeze([
    { key: 'survey', label: 'แบบสำรวจความคิดเห็น', description: 'เก็บคำตอบหนึ่งข้อหรือหลายข้อ', privacyMode: 'identified', questionType: 'rating' },
    { key: 'popular_vote', label: 'โหวตยอดนิยม', description: 'เลือกตัวเลือกหรือผลงานที่ชื่นชอบ', privacyMode: 'identified', questionType: 'single_choice' },
    { key: 'secret_election', label: 'เลือกตั้งแบบลับ', description: 'บัตรลงคะแนนลับและผลหลังการรับรอง', privacyMode: 'secret_ballot', questionType: 'single_choice', advancedRequired: true },
    { key: 'submission_challenge', label: 'ส่งผลงานเข้าร่วม', description: 'รับผลงานและส่งต่อกระบวนการตรวจ', privacyMode: 'identified', questionType: 'long_text', advancedRequired: true },
    { key: 'nomination', label: 'เสนอชื่อบุคคลหรือผลงาน', description: 'เสนอชื่อ ขอความยินยอม และตรวจรายการ', privacyMode: 'identified', questionType: 'employee_picker', advancedRequired: true },
    { key: 'jury_scoring', label: 'การประกวดโดยคณะกรรมการ', description: 'กำหนดเกณฑ์และมอบหมายกรรมการ', privacyMode: 'confidential', questionType: 'single_choice', advancedRequired: true }
]);

const OPTION_TYPES = new Set(['single_choice', 'multiple_choice', 'yes_no_abstain', 'likert', 'ranking', 'matrix', 'allocation', 'token']);
const QUESTION_TYPES = Object.freeze({
    survey: ['single_choice', 'multiple_choice', 'yes_no_abstain', 'rating', 'likert', 'short_text', 'long_text'],
    popular_vote: ['single_choice', 'multiple_choice'],
    secret_election: ['single_choice', 'multiple_choice'],
    submission_challenge: ['long_text', 'file_upload'],
    nomination: ['employee_picker', 'long_text'],
    jury_scoring: ['single_choice', 'multiple_choice', 'rating']
});

export function templateFor(type) {
    return CORE_TEMPLATES.find(item => item.key === type) || CORE_TEMPLATES[0];
}

export function questionTypesFor(type) {
    return QUESTION_TYPES[type] || QUESTION_TYPES.survey;
}

export function hasOptions(questionType) {
    return OPTION_TYPES.has(questionType);
}

export function defaultQuestion(type = 'survey', index = 0) {
    const questionType = templateFor(type).questionType;
    return {
        questionCode: `Q${index + 1}`,
        questionType,
        title: '',
        helpText: '',
        isRequired: true,
        minSelections: 1,
        maxSelections: questionType === 'multiple_choice' ? 2 : 1,
        options: hasOptions(questionType) ? [{ label: '' }, { label: '' }] : []
    };
}

export function createWizardDraft() {
    return {
        campaignType: 'survey', campaignCode: '', titleTh: '', titleEn: '', summary: '', description: '',
        privacyMode: 'identified', privacyThreshold: 5, discoveryMode: 'eligible_only',
        openAt: '', closeAt: '', resultVisibility: 'hidden_until_close',
        questions: [defaultQuestion('survey')],
        rules: [{ ruleGroup: 1, ruleOrder: 1, effect: 'include', attributeKey: 'all', operator: 'EQUALS', values: [], reason: 'พนักงานทั้งหมด' }],
        eligibilityPreview: null, eligibilityFrozen: false
    };
}

export function applyTemplate(draft, type) {
    const template = templateFor(type);
    return {
        ...draft,
        campaignType: template.key,
        privacyMode: template.privacyMode,
        resultVisibility: template.key === 'secret_election' ? 'certified_only' : 'hidden_until_close',
        questions: [defaultQuestion(template.key)],
        eligibilityPreview: null,
        eligibilityFrozen: false
    };
}

function validQuestion(question) {
    if (!question?.title?.trim() || !questionTypesFor(question._campaignType || 'survey').includes(question.questionType)) return false;
    if (!hasOptions(question.questionType)) return true;
    return Array.isArray(question.options) && question.options.length >= 2 && question.options.every(option => option.label?.trim());
}

export function contentValid(draft) {
    return Array.isArray(draft.questions) && draft.questions.length > 0 && draft.questions.every(question => validQuestion({ ...question, _campaignType: draft.campaignType }));
}

export function scheduleValid(draft) {
    if (!draft.openAt || !draft.closeAt) return false;
    const open = new Date(draft.openAt), close = new Date(draft.closeAt);
    return !Number.isNaN(open.getTime()) && !Number.isNaN(close.getTime()) && open < close;
}

export function privacyValid(draft) {
    return !(draft.privacyMode === 'secret_ballot' && draft.resultVisibility === 'live');
}

export function validateStep(step, draft) {
    const errors = [];
    if (step === 0 && !CORE_TEMPLATES.some(item => item.key === draft.campaignType)) errors.push('กรุณาเลือกประเภทแคมเปญ');
    if (step === 1) {
        if (!draft.campaignCode.trim()) errors.push('กรุณาระบุรหัสแคมเปญ');
        if (!draft.titleTh.trim()) errors.push('กรุณาระบุชื่อแคมเปญภาษาไทย');
    }
    if (step === 2 && !privacyValid(draft)) errors.push('บัตรลงคะแนนลับไม่สามารถแสดงผลระหว่างกิจกรรมได้');
    if (step === 3 && !contentValid(draft)) errors.push('กรุณากรอกเนื้อหาและตัวเลือกที่จำเป็นให้ครบ');
    if (step === 4) {
        if (!draft.rules.length) errors.push('ต้องมีกฎผู้มีสิทธิ์อย่างน้อยหนึ่งข้อ');
        if (!Number(draft.eligibilityPreview?.eligibleCount)) errors.push('ต้องตรวจสอบแล้วพบผู้มีสิทธิ์อย่างน้อยหนึ่งคน');
        if (!draft.eligibilityFrozen) errors.push('กรุณายืนยันและตรึงรายชื่อผู้มีสิทธิ์ก่อนดำเนินการต่อ');
    }
    if (step === 5 && !scheduleValid(draft)) errors.push('วันเวลาเปิดต้องอยู่ก่อนวันเวลาปิด');
    if (step === 6 && !privacyValid(draft)) errors.push('การแสดงผลไม่สอดคล้องกับความเป็นส่วนตัว');
    return errors;
}

export function readinessItems(draft, persisted = {}) {
    const template = templateFor(draft.campaignType);
    return [
        { key: 'details', label: 'ข้อมูลทั่วไปบันทึกแล้ว', pass: Boolean(persisted.campaignId && draft.campaignCode.trim() && draft.titleTh.trim()) },
        { key: 'privacy', label: 'ความเป็นส่วนตัวและการแสดงผลสอดคล้องกัน', pass: privacyValid(draft) },
        { key: 'content', label: 'เนื้อหาผ่านการตรวจสอบและบันทึกแล้ว', pass: Boolean(persisted.builderSaved && contentValid(draft)) },
        { key: 'eligibility', label: 'ตรวจสอบและตรึงรายชื่อผู้มีสิทธิ์แล้ว', pass: Boolean(draft.eligibilityFrozen && Number(draft.eligibilityPreview?.eligibleCount) > 0) },
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
        discoveryMode: draft.discoveryMode,
        resultVisibility: draft.resultVisibility,
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
        isRequired: question.isRequired !== false,
        minSelections: Number(question.minSelections ?? (question.isRequired === false ? 0 : 1)),
        maxSelections: Number(question.maxSelections || 1),
        sortOrder: index + 1,
        validation: question.questionType === 'rating' ? { minNumber: 1, maxNumber: 5 } : {},
        options: hasOptions(question.questionType) ? question.options.map((option, optionIndex) => ({ optionCode: option.optionCode || `O${optionIndex + 1}`, label: option.label, description: option.description || null, sortOrder: optionIndex + 1 })) : []
    }));
}
