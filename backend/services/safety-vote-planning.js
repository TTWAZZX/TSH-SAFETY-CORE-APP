'use strict';

const crypto = require('crypto');
const CONTRACT_VERSION = '2026-10-10-safety-vote-ux-phase9b-r1';
const REVIEW_CONTRACT_VERSION = '2026-10-10-safety-vote-admin-review-r1';
const FILTER_KEYS = new Set(['search', 'status', 'campaignType', 'owner', 'sort', 'month']);
const SORTS = new Set(['updated_desc', 'title_asc', 'status_asc', 'open_asc']);

function clean(value, max = 255) {
    return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function positiveInt(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function sha256(value) {
    return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}
function normalizeSavedView(input = {}) {
    const name = clean(input.name ?? input.ViewName, 100), raw = input.filters && typeof input.filters === 'object' ? input.filters : {};
    const filters = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!FILTER_KEYS.has(key)) continue;
        if (key === 'sort') filters.sort = SORTS.has(String(value)) ? String(value) : 'updated_desc';
        else if (key === 'status') filters.status = Array.isArray(value) ? value.map(x => clean(x, 32)).filter(Boolean).slice(0, 10) : [clean(value, 32)].filter(Boolean);
        else filters[key] = clean(value, key === 'search' ? 120 : 50);
    }
    return { ok: Boolean(name), errors: name ? [] : [{ field: 'name', code: 'REQUIRED' }], value: { name, filters, isDefault: input.isDefault === true } };
}
function normalizeTemplateName(input = {}) {
    const name = clean(input.name ?? input.TemplateName, 120);
    return { ok: Boolean(name), errors: name ? [] : [{ field: 'name', code: 'REQUIRED' }], value: { name } };
}
function safeTemplateConfig(raw = {}) {
    const version = raw.version || {}, questions = Array.isArray(raw.questions) ? raw.questions : [], rules = Array.isArray(raw.rules) ? raw.rules : [];
    return {
        version: {
            campaignType: clean(version.campaignType, 40), privacyMode: clean(version.privacyMode, 24),
            titleTh: clean(version.titleTh, 200), titleEn: clean(version.titleEn, 200) || null,
            summary: clean(version.summary, 500) || null, description: clean(version.description, 10000) || null,
            rulesText: clean(version.rulesText, 10000) || null, timeZone: clean(version.timeZone || 'Asia/Bangkok', 50),
            resultVisibility: clean(version.resultVisibility || 'hidden_until_close', 24), editPolicy: clean(version.editPolicy || 'none', 24),
            scoringMethod: clean(version.scoringMethod || 'raw_count', 40), privacyThreshold: Math.max(2, Math.min(100, Number(version.privacyThreshold) || 5)),
            allowAbstain: Boolean(version.allowAbstain), randomizeOptions: Boolean(version.randomizeOptions), discoveryMode: clean(version.discoveryMode || 'eligible_only', 24)
        },
        questions: questions.slice(0, 50).map((question, questionIndex) => ({
            questionCode: clean(question.questionCode || `Q${questionIndex + 1}`, 50), questionType: clean(question.questionType || 'single_choice', 32),
            title: clean(question.title, 300), helpText: clean(question.helpText, 1000) || null, isRequired: Boolean(question.isRequired),
            minSelections: Math.max(0, Number(question.minSelections) || 0), maxSelections: Math.max(0, Number(question.maxSelections) || 0),
            randomizeOptions: Boolean(question.randomizeOptions), allowComment: Boolean(question.allowComment),
            validation: question.validation && typeof question.validation === 'object' ? question.validation : {},
            displayCondition: question.displayCondition && typeof question.displayCondition === 'object' ? question.displayCondition : null,
            resultVisibility: clean(question.resultVisibility || 'aggregate', 30), sortOrder: questionIndex + 1,
            options: (Array.isArray(question.options) ? question.options : []).slice(0, 200).map((option, optionIndex) => ({
                optionCode: clean(option.optionCode || `O${optionIndex + 1}`, 50), label: clean(option.label, 300), description: clean(option.description, 2000) || null,
                scoreValue: option.scoreValue == null ? null : Number(option.scoreValue), isAbstain: Boolean(option.isAbstain), fileId: null, media: [], sortOrder: optionIndex + 1
            }))
        })),
        rules: rules.filter(rule => !['employee', 'employee_id', 'employeeid'].includes(String(rule.attributeKey || '').toLowerCase())).slice(0, 100).map((rule, index) => ({
            ruleGroup: Math.max(1, Number(rule.ruleGroup) || 1), ruleOrder: index + 1, effect: clean(rule.effect || 'include', 12),
            attributeKey: clean(rule.attributeKey, 40), operator: clean(rule.operator || 'IN', 20), values: Array.isArray(rule.values) ? rule.values.map(x => clean(x, 100)).slice(0, 100) : [], reason: clean(rule.reason, 255) || null
        }))
    };
}
function normalizeNotificationPreview(input = {}) {
    const campaignId = positiveInt(input.campaignId), audience = ['eligible', 'nonparticipants'].includes(input.audience) ? input.audience : null;
    const channel = ['in_app', 'email'].includes(input.channel) ? input.channel : null, eventType = clean(input.eventType || 'announcement', 50), templateKey = clean(input.templateKey || 'admin_composer', 80);
    const title = clean(input.title, 160), message = clean(input.message, 300);
    const scheduledAt = clean(input.scheduledAt, 32), match = scheduledAt.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/), hour = match ? Number(match[2]) : NaN;
    const errors = [];
    if (!campaignId) errors.push({ field: 'campaignId', code: 'REQUIRED' });
    if (!audience) errors.push({ field: 'audience', code: 'INVALID_ENUM' });
    if (!channel) errors.push({ field: 'channel', code: 'INVALID_ENUM' });
    if (!match || !Number.isInteger(hour)) errors.push({ field: 'scheduledAt', code: 'INVALID_DATE' });
    if (!title) errors.push({ field: 'title', code: 'REQUIRED' });
    if (!message) errors.push({ field: 'message', code: 'REQUIRED' });
    const quietHoursBlocked = Number.isInteger(hour) && (hour >= 21 || hour < 7);
    return { ok: errors.length === 0, errors, value: { campaignId, audience, channel, eventType, templateKey, title, message, scheduledAt, quietHoursBlocked, windowKey: match ? match[1] : null } };
}

const REVIEW_CATEGORIES = new Set(['general', 'readiness', 'schedule', 'content', 'governance']);
const SENSITIVE_REVIEW_KEYS = /(ballot|answer|choice|candidate|voter|receipt|jury.?score|response.?identity)/i;
const SENSITIVE_REVIEW_TEXT = /(ballot\s*id|voter.{0,20}choice|jury\s*score|receipt\s*id|รหัสบัตรลงคะแนน|คำตอบของผู้ใช้|ตัวเลือกที่ลงคะแนน|คะแนนกรรมการรายบุคคล)/iu;

function normalizeReviewNote(input = {}) {
    const forbiddenField = Object.keys(input || {}).find(key => SENSITIVE_REVIEW_KEYS.test(key));
    const note = clean(input.note, 800);
    const category = REVIEW_CATEGORIES.has(String(input.category || 'general')) ? String(input.category || 'general') : null;
    const errors = [];
    if (!note) errors.push({ field: 'note', code: 'REQUIRED' });
    if (!category) errors.push({ field: 'category', code: 'INVALID_ENUM' });
    if (forbiddenField || SENSITIVE_REVIEW_TEXT.test(note)) errors.push({ field: forbiddenField || 'note', code: 'BALLOT_DATA_NOT_ALLOWED' });
    return { ok: errors.length === 0, errors, value: { note, category } };
}

function reviewReadiness(row = {}) {
    const open = row.ScheduledOpenAt ? new Date(row.ScheduledOpenAt) : null;
    const close = row.ScheduledCloseAt ? new Date(row.ScheduledCloseAt) : null;
    const checks = [
        { key: 'owner', label: 'ระบุผู้รับผิดชอบ', passed: Boolean(clean(row.OwnerEmployeeID, 20)) },
        { key: 'content', label: 'มีคำถามหรือเนื้อหาที่ใช้งาน', passed: Number(row.QuestionCount || 0) > 0 },
        { key: 'eligibility', label: 'มีกฎผู้มีสิทธิ์', passed: Number(row.EligibilityRuleCount || 0) > 0 },
        { key: 'schedule', label: 'กำหนดเวลาเปิดและปิดถูกต้อง', passed: Boolean(open && close && !Number.isNaN(open.getTime()) && close > open) }
    ];
    const passed = checks.filter(item => item.passed).length;
    return { passed, total: checks.length, percent: Math.round(passed / checks.length * 100), blockers: checks.filter(item => !item.passed), authoritative: false };
}

function scheduleConflicts(rows = []) {
    const groups = new Map();
    for (const row of rows) {
        const key = `${Number(row.CampaignID)}:${clean(row.Channel, 30)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    const result = new Map();
    for (const group of groups.values()) {
        group.sort((a, b) => new Date(a.ScheduledAt) - new Date(b.ScheduledAt));
        for (let i = 1; i < group.length; i += 1) {
            const minutes = Math.abs(new Date(group[i].ScheduledAt) - new Date(group[i - 1].ScheduledAt)) / 60000;
            if (minutes <= 30) {
                const id = Number(group[i].CampaignID);
                result.set(id, (result.get(id) || 0) + 1);
            }
        }
    }
    return result;
}

module.exports = { CONTRACT_VERSION, REVIEW_CONTRACT_VERSION, clean, positiveInt, sha256, normalizeSavedView, normalizeTemplateName, safeTemplateConfig, normalizeNotificationPreview, normalizeReviewNote, reviewReadiness, scheduleConflicts };
