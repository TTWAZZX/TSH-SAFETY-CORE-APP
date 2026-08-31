'use strict';

const RESPONSES = Object.freeze(['Safe', 'Unsafe', 'N/A']);

function clean(value, max = 4000) {
    return String(value ?? '').trim().slice(0, max);
}

function normalizeAnswers(value) {
    if (!Array.isArray(value)) return { ok: false, message: 'answers must be an array.' };
    const ids = new Set();
    const answers = [];
    for (const entry of value) {
        const answerId = Number(entry?.answerId);
        const response = entry?.response === null || entry?.response === '' || entry?.response === undefined ? null : String(entry.response);
        if (!Number.isInteger(answerId) || answerId < 1 || ids.has(answerId)) return { ok: false, message: 'Each answer must have a unique valid answerId.' };
        if (response !== null && !RESPONSES.includes(response)) return { ok: false, message: `Unsupported response for answer ${answerId}.` };
        ids.add(answerId);
        answers.push({ answerId, response, remark: clean(entry?.remark), immediateAction: clean(entry?.immediateAction) });
    }
    return { ok: true, answers };
}

function validateSubmission(rows = []) {
    for (const row of rows) {
        const response = row.Response;
        if (Number(row.IsRequiredSnapshot) === 1 && !RESPONSES.includes(response)) return { ok: false, code: 'ANSWER_REQUIRED', message: `Please answer ${row.ItemCodeSnapshot}.` };
        if (response === 'Unsafe' && Number(row.UnsafeRequiresRemarkSnapshot) === 1 && !clean(row.Remark)) return { ok: false, code: 'UNSAFE_REMARK_REQUIRED', message: `Unsafe item ${row.ItemCodeSnapshot} requires a remark.` };
        if (response === 'Unsafe' && Number(row.UnsafeRequiresActionSnapshot) === 1 && !clean(row.ImmediateAction)) return { ok: false, code: 'UNSAFE_ACTION_REQUIRED', message: `Unsafe item ${row.ItemCodeSnapshot} requires an immediate action.` };
        if (response === 'Unsafe' && Number(row.UnsafeRequiresPhotoSnapshot) === 1 && Number(row.EvidenceCount || 0) < 1) return { ok: false, code: 'UNSAFE_PHOTO_REQUIRED', message: `Unsafe item ${row.ItemCodeSnapshot} requires evidence.` };
    }
    return { ok: true };
}

function businessWeekdays(year, month, throughDay = null) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = throughDay === null ? last : Math.max(0, Math.min(last, Number(throughDay) || 0));
    let count = 0;
    for (let day = 1; day <= end; day += 1) {
        const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
        if (weekday >= 1 && weekday <= 5) count += 1;
    }
    return count;
}

module.exports = { RESPONSES, clean, normalizeAnswers, validateSubmission, businessWeekdays };
