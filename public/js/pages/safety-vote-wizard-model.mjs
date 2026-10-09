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

export function questionValidationErrors(question, draft, index) {
    const errors = [];
    if (!question?.title?.trim()) errors.push('กรุณาระบุคำถามหรือหัวข้อ');
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
    return !(draft.privacyMode === 'secret_ballot' && draft.resultVisibility === 'live');
}

export function validateStep(step, draft) {
    const errors = [];
    if (step === 0 && !CORE_TEMPLATES.some(item => item.key === draft.campaignType)) errors.push('กรุณาเลือกประเภทแคมเปญ');
    if (step === 1) {
        if (!draft.titleTh.trim()) errors.push('กรุณาระบุชื่อแคมเปญภาษาไทย');
    }
    if (step === 2 && !privacyValid(draft)) errors.push('บัตรลงคะแนนลับไม่สามารถแสดงผลระหว่างกิจกรรมได้');
    if (step === 3) errors.push(...contentValidationErrors(draft));
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
        randomizeOptions: Boolean(question.randomizeOptions),
        allowComment: Boolean(question.allowComment),
        validation: question.validation || defaultValidationForType(question.questionType),
        displayCondition: question.displayCondition || null,
        options: hasOptions(question.questionType) ? question.options.map((option, optionIndex) => ({ optionCode: option.optionCode || `O${optionIndex + 1}`, label: option.label, description: option.description || null, fileId: Number(option.fileId || 0) || null, sortOrder: optionIndex + 1 })) : []
    }));
}
