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
    const votingWindowValue = valueOf(campaign, 'VotingWindowOpen', 'votingWindowOpen');
    const votingWindowOpen = votingWindowValue === '' || Number(votingWindowValue) === 1;
    if (participation === 'submitted') return 'submitted';
    if (status === 'Scheduled' || (status === 'Open' && !votingWindowOpen)) return 'upcoming';
    if (status === 'Open' && votingWindowOpen) return 'open';
    return 'closed';
}

export function privacyNotice(campaign = {}) {
    const mode = privacyMode(campaign);
    if (mode === 'secret_ballot') return {
        title: 'บัตรลงคะแนนลับ',
        description: 'ระบบแยกสถานะการเข้าร่วมออกจากบัตรลงคะแนน ใบรับไม่แสดงตัวเลือก และแม้เป็น Admin ก็ไม่สามารถเชื่อมว่าคุณเลือกอะไรได้',
        receiptShowsAnswers: false
    };
    if (mode === 'anonymous') return {
        title: 'ไม่ระบุตัวตนในผลลัพธ์',
        description: 'คำตอบไม่เชื่อมกลับไปยังบัญชีของคุณ ระบบเก็บเฉพาะสถานะการเข้าร่วมแยกกัน และ Admin ดูได้เฉพาะผลรวมที่ผ่านเกณฑ์',
        receiptShowsAnswers: false
    };
    if (mode === 'confidential') return {
        title: 'ข้อมูลลับตามสิทธิ์',
        description: 'ระบบเชื่อมคำตอบกับบัญชี แต่จำกัดการเข้าถึงข้อมูลรายบุคคลตาม Permission และบันทึก Audit; Admin ยังดูสถานะและผลรวมได้',
        receiptShowsAnswers: false
    };
    return {
        title: 'ระบุตัวตนตามสิทธิ์',
        description: 'ระบบเชื่อมคำตอบกับบัญชีเพื่อรองรับการติดตามรายบุคคล ผู้ดูแลต้องมี Permission ตามงาน และ Admin ดูสถานะกับผลรวมได้',
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
    for (const [questionIndex, question] of questions.entries()) {
        if (!isQuestionVisible(question, questions, answers)) continue;
        const raw = answers[String(question.id)];
        const location = {
            targetId: `svp-question-${Number(question.id)}`,
            sectionLabel: 'คำถาม',
            itemIndex: questionIndex + 1,
            itemTotal: questions.length,
            itemCode: String(question.questionCode || `Q${questionIndex + 1}`),
            itemTitle: String(question.title || `คำถามข้อ ${questionIndex + 1}`)
        };
        if (question.isRequired && !hasParticipationAnswer(question, raw)) {
            errors.push({ questionId: Number(question.id), ...location, message: 'ยังไม่ได้ตอบคำถามที่จำเป็น' });
            continue;
        }
        if (isChoiceQuestion(question) && Array.isArray(raw)) {
            if (raw.length < Number(question.minSelections || 0)) errors.push({ questionId: Number(question.id), ...location, message: `ต้องเลือกอย่างน้อย ${Number(question.minSelections)} รายการ` });
            if (raw.length > Number(question.maxSelections || raw.length)) errors.push({ questionId: Number(question.id), ...location, message: `เลือกได้ไม่เกิน ${Number(question.maxSelections)} รายการ` });
        }
        if (question.questionType === 'ranking' && Array.isArray(raw) && new Set(raw.map(Number)).size !== raw.length) {
            errors.push({ questionId: Number(question.id), ...location, message: 'ลำดับตัวเลือกต้องไม่ซ้ำกัน' });
        }
        if (question.questionType === 'rating' && hasParticipationAnswer(question, raw)) {
            const min = Number(question.validation?.minNumber ?? 0), max = Number(question.validation?.maxNumber ?? 10), value = Number(raw);
            if (value < min || value > max) errors.push({ questionId: Number(question.id), ...location, message: `คะแนนต้องอยู่ระหว่าง ${min}–${max}` });
        }
    }
    return errors;
}

export function validateWorkflowParticipation(type, answers = {}, submissionGallery = []) {
    const errors = [];
    if (type === 'submission_challenge') {
        const fields = [
            { key: 'title', targetId: 'svp-workflow-title', title: 'ชื่อผลงาน' },
            { key: 'description', targetId: 'svp-workflow-description', title: 'รายละเอียดผลงาน' }
        ];
        fields.forEach((field, index) => {
            if (!String(answers[field.key] || '').trim()) errors.push({ questionId: 0, targetId: field.targetId, sectionLabel: 'ข้อมูลผลงาน', itemIndex: index + 1, itemTotal: fields.length, itemTitle: field.title, message: 'ยังไม่ได้กรอกข้อมูลที่จำเป็น' });
        });
        submissionGallery.forEach((item, index) => {
            if (!String(item.altText || '').trim()) errors.push({ questionId: 0, targetId: `svp-work-gallery-${index}`, sectionLabel: 'รูปผลงาน', itemIndex: index + 1, itemTotal: submissionGallery.length, itemTitle: `ภาพที่ ${index + 1}`, message: 'ยังไม่ได้ระบุคำอธิบายภาพ' });
        });
    } else {
        if (!String(answers.nomineeEmployeeId || '').trim()) errors.push({ questionId: 0, targetId: 'svp-workflow-nominee', sectionLabel: 'ข้อมูลการเสนอชื่อ', itemIndex: 1, itemTotal: 2, itemTitle: 'ผู้ถูกเสนอชื่อ', message: 'ยังไม่ได้เลือกพนักงาน' });
        if (!String(answers.statement || '').trim()) errors.push({ questionId: 0, targetId: 'svp-workflow-statement', sectionLabel: 'ข้อมูลการเสนอชื่อ', itemIndex: 2, itemTotal: 2, itemTitle: 'เหตุผลประกอบการเสนอชื่อ', message: 'ยังไม่ได้กรอกเหตุผล' });
    }
    return errors;
}

export function participationProgressItems(questions = [], answers = {}) {
    const errorsByQuestion = new Map(validateParticipation(questions, answers).map(error => [Number(error.questionId), error]));
    const visible = questions.filter(question => isQuestionVisible(question, questions, answers));
    return visible.map((question, index) => {
        const raw = answers[String(question.id)];
        const answered = hasParticipationAnswer(question, raw);
        const error = errorsByQuestion.get(Number(question.id));
        return {
            key: `question:${Number(question.id)}`,
            targetId: `svp-question-${Number(question.id)}`,
            label: String(question.title || `คำถามข้อ ${index + 1}`),
            shortLabel: String(question.questionCode || `ข้อ ${index + 1}`),
            index: index + 1,
            total: visible.length,
            required: Boolean(question.isRequired),
            status: error || (question.isRequired && !answered) ? 'incomplete' : answered ? 'complete' : 'optional',
            message: error?.message || (!answered && question.isRequired ? 'ยังไม่ได้ตอบ' : answered ? 'ครบแล้ว' : 'ไม่บังคับ')
        };
    });
}

export function workflowProgressItems(type, answers = {}, submissionGallery = []) {
    const definitions = type === 'submission_challenge'
        ? [
            { key: 'title', targetId: 'svp-workflow-title', label: 'ชื่อผลงาน', complete: Boolean(String(answers.title || '').trim()) },
            { key: 'description', targetId: 'svp-workflow-description', label: 'รายละเอียดผลงาน', complete: Boolean(String(answers.description || '').trim()) },
            ...submissionGallery.map((item, index) => ({ key: `gallery:${index}`, targetId: `svp-work-gallery-${index}`, label: `คำอธิบายภาพที่ ${index + 1}`, complete: Boolean(String(item.altText || '').trim()) }))
        ]
        : [
            { key: 'nomineeEmployeeId', targetId: 'svp-workflow-nominee', label: 'ผู้ถูกเสนอชื่อ', complete: Boolean(String(answers.nomineeEmployeeId || '').trim()) },
            { key: 'statement', targetId: 'svp-workflow-statement', label: 'เหตุผลประกอบ', complete: Boolean(String(answers.statement || '').trim()) }
        ];
    return definitions.map((item, index) => ({
        ...item,
        index: index + 1,
        total: definitions.length,
        required: true,
        status: item.complete ? 'complete' : 'incomplete',
        message: item.complete ? 'ครบแล้ว' : 'ยังไม่ครบ'
    }));
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

export function campaignMatchesView(campaign = {}, view = 'all') {
    const status = String(valueOf(campaign, 'Status', 'status'));
    const participation = String(valueOf(campaign, 'ParticipationState', 'participationState')).toLowerCase();
    const discoveryOnly = Number(valueOf(campaign, 'DiscoveryOnly', 'discoveryOnly') || 0) === 1;
    const votingWindow = valueOf(campaign, 'VotingWindowOpen', 'votingWindowOpen');
    const votingWindowOpen = votingWindow === '' || Number(votingWindow) === 1;
    if (view === 'all') return true;
    if (view === 'open') return status === 'Open' && votingWindowOpen && !discoveryOnly;
    if (view === 'upcoming') return status === 'Scheduled' || (status === 'Open' && !votingWindowOpen);
    if (view === 'submitted') return participation === 'submitted';
    if (view === 'read_only') return discoveryOnly;
    if (view === 'results') return ['Closed', 'Certified', 'Published'].includes(status);
    if (view === 'closed') return ['Closed', 'Certified', 'Published'].includes(status);
    return participationState(campaign) === view;
}

export function filterCampaigns(campaigns = [], { view = 'open', query = '' } = {}) {
    const normalized = String(query).trim().toLocaleLowerCase('th');
    return campaigns.filter(campaign => campaignMatchesView(campaign, view)).filter(campaign => {
        if (!normalized) return true;
        return ['TitleTh', 'Summary', 'CampaignCode', 'CampaignType'].some(key => String(campaign[key] || '').toLocaleLowerCase('th').includes(normalized));
    });
}
