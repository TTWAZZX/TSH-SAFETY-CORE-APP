'use strict';

const BBS_LEVELS = Object.freeze([
    'Operator',
    'Group Leader',
    'Department Head',
    'Section Head',
    'Manager',
]);
const BBS_ELIGIBILITY = Object.freeze(['active', 'inactive', 'exempt', 'unavailable']);
const ASSIGNMENT_TYPES = Object.freeze(['permanent', 'temporary', 'acting']);

function normalizeLevel(value) {
    const text = String(value || '').trim().toLowerCase();
    return BBS_LEVELS.find(level => level.toLowerCase() === text) || null;
}

function levelRank(value) {
    const normalized = normalizeLevel(value);
    return normalized ? BBS_LEVELS.indexOf(normalized) : -1;
}

function normalizeIsoDate(value, { required = false } = {}) {
    const text = String(value || '').trim();
    if (!text && !required) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? undefined : text;
}

function databaseIsoDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return bangkokIsoDate(value);
    }
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
}

function validateEffectiveRange(fromValue, toValue) {
    const from = normalizeIsoDate(fromValue, { required: true });
    const to = normalizeIsoDate(toValue);
    if (!from) return { ok: false, message: 'EffectiveFrom must be a valid YYYY-MM-DD date.' };
    if (to === undefined) return { ok: false, message: 'EffectiveTo must be a valid YYYY-MM-DD date or blank.' };
    if (to && to < from) return { ok: false, message: 'EffectiveTo must not be before EffectiveFrom.' };
    return { ok: true, from, to };
}

function isEffective(row, asOf) {
    const date = normalizeIsoDate(asOf, { required: true });
    if (!date || Number(row?.IsActive ?? 1) !== 1) return false;
    const from = databaseIsoDate(row?.EffectiveFrom);
    const to = databaseIsoDate(row?.EffectiveTo);
    return Boolean(from && from <= date && (!to || to >= date));
}

function validateAssignmentCandidate(candidate) {
    const supervisorId = String(candidate?.supervisorEmployeeId || '').trim();
    const memberId = String(candidate?.memberEmployeeId || '').trim();
    const supervisorLevel = normalizeLevel(candidate?.supervisorLevel);
    const memberLevel = normalizeLevel(candidate?.memberLevel);
    const type = String(candidate?.assignmentType || 'permanent').trim().toLowerCase();
    const range = validateEffectiveRange(candidate?.effectiveFrom, candidate?.effectiveTo);
    if (!supervisorId || !memberId) return { ok: false, message: 'Supervisor and member are required.' };
    if (supervisorId.toLowerCase() === memberId.toLowerCase()) return { ok: false, message: 'Supervisor and member must be different employees.' };
    if (!supervisorLevel || !memberLevel) return { ok: false, message: 'Both employees require an active BBS level mapping.' };
    if (levelRank(supervisorLevel) !== levelRank(memberLevel) + 1) {
        return { ok: false, message: 'Hierarchy assignments must connect adjacent BBS levels.' };
    }
    if (!ASSIGNMENT_TYPES.includes(type)) return { ok: false, message: 'AssignmentType is invalid.' };
    if (!range.ok) return range;
    return { ok: true, supervisorId, memberId, supervisorLevel, memberLevel, assignmentType: type, ...range };
}

function normalizeWeekdays(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    const days = [...new Set(source.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort();
    return days;
}

function bangkokIsoDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function isoWeekday(isoDate) {
    const date = normalizeIsoDate(isoDate, { required: true });
    if (!date) return null;
    const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
}

function kpiDueForDate(rule, isoDate) {
    if (!rule || Number(rule.IsActive ?? 1) !== 1) return false;
    return normalizeWeekdays(rule.Weekdays).includes(isoWeekday(isoDate));
}

module.exports = {
    BBS_LEVELS,
    BBS_ELIGIBILITY,
    ASSIGNMENT_TYPES,
    normalizeLevel,
    levelRank,
    normalizeIsoDate,
    databaseIsoDate,
    validateEffectiveRange,
    isEffective,
    validateAssignmentCandidate,
    normalizeWeekdays,
    bangkokIsoDate,
    isoWeekday,
    kpiDueForDate,
};
