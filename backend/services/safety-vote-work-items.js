'use strict';

const SOURCES = Object.freeze(['admin_curated', 'employee_submission', 'imported']);
const text = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const id = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

function parse(input = {}) {
    const source = String(input.workSource || '').trim().toLowerCase();
    const rows = Array.isArray(input.works) ? input.works : [];
    const errors = [];
    if (!SOURCES.includes(source)) errors.push('WORK_SOURCE_INVALID');
    if (rows.length > 100) errors.push('WORK_LIMIT_EXCEEDED');
    const seen = new Set();
    const works = rows.map((raw, index) => {
        const workCode = text(raw.workCode || `WORK-${index + 1}`, 50).toUpperCase();
        const title = text(raw.title, 255);
        const description = text(raw.description, 2000) || null;
        const sourceCandidateId = id(raw.sourceCandidateId);
        if (!workCode || seen.has(workCode)) errors.push('WORK_CODE_DUPLICATE_OR_EMPTY');
        if (!title) errors.push('WORK_TITLE_REQUIRED');
        if (source === 'imported' && !sourceCandidateId) errors.push('SOURCE_CANDIDATE_REQUIRED');
        seen.add(workCode);
        return { id: id(raw.id), workCode, title, description, sourceCandidateId, sortOrder: index + 1 };
    });
    if (source === 'admin_curated' && works.length === 0) errors.push('WORK_REQUIRED');
    return { ok: errors.length === 0, source, works, errors: [...new Set(errors)] };
}

module.exports = { CONTRACT_VERSION: '2026-10-25-jury-work-items-r1', SOURCES, parse, text, id };
