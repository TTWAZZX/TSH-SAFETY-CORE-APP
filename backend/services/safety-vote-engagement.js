'use strict';

const CONTRACT_VERSION = '2026-10-10-safety-vote-ux-phase9a-r1';
const STATUSES = new Set(['Draft', 'Published', 'Archived']);

function clean(value, max = 255) {
    return String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function positiveInt(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function sqlDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
}
function normalizePromotion(input = {}) {
    const value = {
        campaignId: positiveInt(input.campaignId ?? input.CampaignID),
        titleTh: clean(input.titleTh ?? input.TitleTh, 160),
        subtitleTh: clean(input.subtitleTh ?? input.SubtitleTh, 500) || null,
        ctaLabel: clean(input.ctaLabel ?? input.CtaLabel ?? 'ดูรายละเอียด', 40),
        desktopFileId: positiveInt(input.desktopFileId ?? input.DesktopFileID),
        mobileFileId: positiveInt(input.mobileFileId ?? input.MobileFileID),
        altText: clean(input.altText ?? input.AltText, 240) || null,
        priority: Math.max(0, Math.min(100, Number.parseInt(input.priority ?? input.Priority ?? 0, 10) || 0)),
        startAt: sqlDate(input.startAt ?? input.StartAt),
        endAt: sqlDate(input.endAt ?? input.EndAt),
        status: clean(input.status ?? input.Status ?? 'Draft', 24),
        rowVersion: positiveInt(input.rowVersion ?? input.RowVersion)
    };
    const errors = [];
    if (!value.campaignId) errors.push({ field: 'campaignId', code: 'REQUIRED' });
    if (!value.titleTh) errors.push({ field: 'titleTh', code: 'REQUIRED' });
    if (!value.ctaLabel) errors.push({ field: 'ctaLabel', code: 'REQUIRED' });
    if (!value.startAt) errors.push({ field: 'startAt', code: 'INVALID_DATE' });
    if (!value.endAt) errors.push({ field: 'endAt', code: 'INVALID_DATE' });
    if (value.startAt && value.endAt && value.endAt <= value.startAt) errors.push({ field: 'endAt', code: 'MUST_FOLLOW_START' });
    if (!STATUSES.has(value.status)) errors.push({ field: 'status', code: 'INVALID_ENUM' });
    if ((value.desktopFileId || value.mobileFileId) && !value.altText) errors.push({ field: 'altText', code: 'REQUIRED_WITH_IMAGE' });
    return { ok: errors.length === 0, errors, value };
}

module.exports = { CONTRACT_VERSION, normalizePromotion, positiveInt, clean };
