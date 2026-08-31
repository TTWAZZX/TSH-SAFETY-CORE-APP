'use strict';

const crypto = require('crypto');
const { clean, hashToken, tokenFingerprint } = require('./bbs-card');

const REPORT_TYPES = Object.freeze(['Good', 'Risky']);
const ACTION_STATUSES = Object.freeze(['Open', 'In Progress', 'Closed', 'Reopened']);
const PAPER_SIZES = Object.freeze(['A4', 'A5', 'A6']);

function departmentRawToken(departmentId, generation) {
    const secret = String(process.env.JWT_SECRET || '');
    if (!secret) throw new Error('JWT_SECRET is required for Department QR generation.');
    return crypto.createHmac('sha256', secret)
        .update(`bbs-department:${Number(departmentId)}:${Number(generation)}`)
        .digest('base64url');
}

function departmentTokenRecord(departmentId, generation) {
    const rawToken = departmentRawToken(departmentId, generation);
    return { rawToken, tokenHash: hashToken(rawToken), fingerprint: tokenFingerprint(rawToken) };
}

function normalizeReportType(value) {
    const candidate = clean(value, 20).toLowerCase();
    return REPORT_TYPES.find(type => type.toLowerCase() === candidate) || null;
}

function normalizeActionStatus(value) {
    const candidate = clean(value, 30).toLowerCase();
    return ACTION_STATUSES.find(status => status.toLowerCase() === candidate) || null;
}

function normalizePaperSize(value) {
    const candidate = clean(value, 20).toUpperCase();
    return PAPER_SIZES.includes(candidate) ? candidate : null;
}

module.exports = {
    REPORT_TYPES,
    ACTION_STATUSES,
    PAPER_SIZES,
    departmentRawToken,
    departmentTokenRecord,
    normalizeReportType,
    normalizeActionStatus,
    normalizePaperSize,
};
