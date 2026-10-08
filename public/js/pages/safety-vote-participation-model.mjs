export const CAMPAIGN_TYPE_LABELS = Object.freeze({
    survey: 'แบบสำรวจความคิดเห็น',
    popular_vote: 'โหวตยอดนิยม',
    secret_election: 'เลือกตั้งแบบลับ',
    submission_challenge: 'ส่งผลงานเข้าร่วม',
    nomination: 'เสนอชื่อบุคคลหรือผลงาน',
    award: 'เสนอชื่อเพื่อรับรางวัล',
    jury_scoring: 'การประกวดโดยคณะกรรมการ'
});

export const PRIVACY_LABELS = Object.freeze({
    identified: 'ระบุตัวตน',
    confidential: 'ข้อมูลลับ',
    anonymous: 'ไม่ระบุตัวตน',
    secret_ballot: 'บัตรลงคะแนนลับ'
});

const CHOICE_TYPES = new Set(['single_choice', 'multiple_choice', 'yes_no_abstain', 'likert']);

export function valueOf(source = {}, ...keys) {
    for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
    return '';
}

export function campaignType(campaign = {}) {
    return String(valueOf(campaign, 'CampaignType', 'campaignType') || 'survey');
}

export function privacyMode(campaign = {}) {
    return String(valueOf(campaign, 'PrivacyMode', 'privacyMode') || 'identified');
}

export function participationState(campaign = {}) {
    const status = String(valueOf(campaign, 'Status', 'status'));
    const participation = String(valueOf(campaign, 'ParticipationState', 'participationState')).toLowerCase();
    if (participation === 'submitted') return 'submitted';
    if (status === 'Open') return 'open';
    return 'closed';
}

export function privacyNotice(campaign = {}) {
    const mode = privacyMode(campaign);
    if (mode === 'secret_ballot') return {
        title: 'บัตรลงคะแนนลับ',
        description: 'ระบบรับรองเฉพาะว่ารับบัตรแล้ว ใบรับจะไม่แสดงตัวเลือกและไม่สามารถใช้ค้นหาบัตรของคุณได้',
        receiptShowsAnswers: false
    };
    if (mode === 'anonymous') return {
        title: 'ไม่ระบุตัวตนในผลลัพธ์',
        description: 'คำตอบถูกจัดเก็บตามข้อกำหนดความเป็นส่วนตัว และใบรับไม่แสดงคำตอบที่ส่ง',
        receiptShowsAnswers: false
    };
    if (mode === 'confidential') return {
        title: 'ข้อมูลลับตามสิทธิ์',
        description: 'ข้อมูลผู้เข้าร่วมถูกจำกัดการเข้าถึงตามสิทธิ์ของระบบ เมื่อส่งแล้วไม่สามารถแก้ไขได้',
        receiptShowsAnswers: false
    };
    return {
        title: 'ระบุตัวตนตามสิทธิ์',
        description: 'ระบบบันทึกการเข้าร่วมตามบัญชีของคุณ เมื่อส่งแล้วไม่สามารถแก้ไขได้',
        receiptShowsAnswers: false
    };
}

export function isChoiceQuestion(question = {}) {
    return CHOICE_TYPES.has(String(question.questionType));
}

export function isQuestionVisible(question, questions, answers) {
    const condition = question?.displayCondition;
    if (!condition) return true;
    const parent = questions.find(item => item.questionCode === condition.questionCode);
    if (!parent) return false;
    const raw = answers[String(parent.id)];
    const expected = (Array.isArray(condition.value) ? condition.value : [condition.value]).map(String);
    const selectedIds = Array.isArray(raw) ? raw.map(Number) : [];
    const selectedCodes = selectedIds.map(id => parent.options?.find(option => Number(option.id) === id)?.optionCode).filter(Boolean).map(String);
    const scalar = !Array.isArray(raw) && raw !== undefined && raw !== null ? String(raw).trim() : '';
    const actual = selectedCodes.length ? selectedCodes : (scalar ? [scalar] : []);
    const answered = actual.length > 0;
    const includes = actual.some(item => expected.includes(item));
    const equal = actual.length === 1 && expected.includes(actual[0]);
    return condition.operator === 'answered' ? answered
        : condition.operator === 'not_answered' ? !answered
            : condition.operator === 'equals' ? equal
                : condition.operator === 'not_equals' ? !equal
                    : condition.operator === 'includes' ? includes
                        : condition.operator === 'not_includes' ? !includes
                            : false;
}

export function hasParticipationAnswer(question, raw) {
    if (isChoiceQuestion(question) || question.questionType === 'ranking') return Array.isArray(raw) && raw.length > 0;
    if (['allocation', 'token'].includes(question.questionType)) return raw && Object.values(raw).some(value => Number(value) > 0);
    if (question.questionType === 'matrix') return raw && Object.values(raw).some(value => String(value).trim());
    if (question.questionType === 'rating') return raw !== '' && raw !== undefined && raw !== null && Number.isFinite(Number(raw));
    if (question.questionType === 'file_upload') return Number(raw) > 0;
    return Boolean(String(raw ?? '').trim());
}

export function validateParticipation(questions = [], answers = {}) {
    const errors = [];
    for (const question of questions) {
        if (!isQuestionVisible(question, questions, answers)) continue;
        const raw = answers[String(question.id)];
        if (question.isRequired && !hasParticipationAnswer(question, raw)) {
            errors.push({ questionId: Number(question.id), message: `กรุณาตอบ “${question.title}”` });
            continue;
        }
        if (isChoiceQuestion(question) && Array.isArray(raw)) {
            if (raw.length < Number(question.minSelections || 0)) errors.push({ questionId: Number(question.id), message: `เลือกอย่างน้อย ${Number(question.minSelections)} รายการใน “${question.title}”` });
            if (raw.length > Number(question.maxSelections || raw.length)) errors.push({ questionId: Number(question.id), message: `เลือกได้ไม่เกิน ${Number(question.maxSelections)} รายการใน “${question.title}”` });
        }
        if (question.questionType === 'ranking' && Array.isArray(raw) && new Set(raw.map(Number)).size !== raw.length) {
            errors.push({ questionId: Number(question.id), message: `กรุณาใช้ลำดับไม่ซ้ำกันใน “${question.title}”` });
        }
        if (question.questionType === 'rating' && hasParticipationAnswer(question, raw)) {
            const min = Number(question.validation?.minNumber ?? 0), max = Number(question.validation?.maxNumber ?? 10), value = Number(raw);
            if (value < min || value > max) errors.push({ questionId: Number(question.id), message: `คะแนนของ “${question.title}” ต้องอยู่ระหว่าง ${min}–${max}` });
        }
    }
    return errors;
}

export function answerPayload(question, raw) {
    const questionId = Number(question.id);
    if (isChoiceQuestion(question)) return { questionId, optionIds: (Array.isArray(raw) ? raw : []).map(Number) };
    if (question.questionType === 'ranking') return { questionId, rankedOptionIds: (Array.isArray(raw) ? raw : []).map(Number) };
    if (['allocation', 'token'].includes(question.questionType)) return { questionId, allocations: Object.entries(raw || {}).map(([optionId, value]) => ({ optionId: Number(optionId), value: Number(value || 0) })) };
    if (question.questionType === 'matrix') return { questionId, matrixValues: Object.fromEntries(Object.entries(raw || {}).filter(([, value]) => String(value).trim())) };
    if (question.questionType === 'rating') return { questionId, numericValue: Number(raw) };
    if (['short_text', 'long_text', 'employee_picker', 'organization_picker'].includes(question.questionType)) return { questionId, textValue: String(raw || '') };
    if (question.questionType === 'date_time') return { questionId, dateTimeValue: String(raw || '') };
    if (question.questionType === 'file_upload') return { questionId, fileId: Number(raw || 0) };
    return { questionId };
}

export function buildBallotPayload(detail, answers = {}) {
    const questions = detail?.questions || [];
    return {
        campaignVersion: Number(valueOf(detail?.campaign, 'VersionNo', 'versionNo')),
        acknowledgedRules: true,
        answers: questions
            .filter(question => isQuestionVisible(question, questions, answers) && hasParticipationAnswer(question, answers[String(question.id)]))
            .map(question => answerPayload(question, answers[String(question.id)]))
    };
}

export function isBallotCampaign(campaign = {}) {
    return !['submission_challenge', 'nomination', 'award'].includes(campaignType(campaign));
}

export function safeReceipt({ campaign = {}, receiptCode = '', submittedAt = '', replayed = false } = {}) {
    const secret = privacyMode(campaign) === 'secret_ballot';
    return {
        receiptCode: String(receiptCode),
        submittedAt: submittedAt || new Date().toISOString(),
        status: 'accepted',
        canEdit: false,
        proof: secret ? 'accepted_only' : 'participation_accepted',
        canLocateBallot: false,
        answersIncluded: false,
        replayed: Boolean(replayed)
    };
}

export function filterCampaigns(campaigns = [], { view = 'open', query = '' } = {}) {
    const normalized = String(query).trim().toLocaleLowerCase('th');
    return campaigns.filter(campaign => participationState(campaign) === view).filter(campaign => {
        if (!normalized) return true;
        return ['TitleTh', 'Summary', 'CampaignCode', 'CampaignType'].some(key => String(campaign[key] || '').toLocaleLowerCase('th').includes(normalized));
    });
}
