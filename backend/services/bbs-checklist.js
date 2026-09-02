'use strict';

const { BBS_LEVELS, normalizeIsoDate, validateEffectiveRange, normalizeLevel } = require('./bbs-phase1');

const VERSION_STATUSES = Object.freeze(['Draft', 'Published', 'Archived']);
const RESPONSE_TYPES = Object.freeze(['safe_unsafe_na']);

function cleanText(value, max = 255) {
    return String(value ?? '').trim().slice(0, max);
}

function nullablePositiveInt(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : false;
}

function validateDraftPayload(payload = {}) {
    const range = validateEffectiveRange(payload.effectiveFrom, payload.effectiveTo);
    if (!range.ok) return range;
    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];
    if (!categories.length || categories.length > 50) return { ok: false, message: 'Checklist requires 1-50 categories.' };
    if (!scopes.length || scopes.length > 100) return { ok: false, message: 'Checklist requires 1-100 scope mappings.' };
    const itemCodes = new Set();
    let itemCount = 0;
    const normalizedCategories = [];
    for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
        const category = categories[categoryIndex] || {};
        const categoryName = cleanText(category.name, 160);
        const items = Array.isArray(category.items) ? category.items : [];
        if (!categoryName || !items.length) return { ok: false, message: `Category ${categoryIndex + 1} requires a name and at least one item.` };
        const normalizedItems = [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            const item = items[itemIndex] || {};
            const code = cleanText(item.code, 50).toUpperCase();
            const prompt = cleanText(item.prompt, 500);
            const responseType = cleanText(item.responseType || 'safe_unsafe_na', 30).toLowerCase();
            if (!/^[A-Z0-9][A-Z0-9_-]{0,49}$/.test(code) || !prompt) return { ok: false, message: `Item ${itemIndex + 1} in category ${categoryIndex + 1} requires a valid code and prompt.` };
            if (itemCodes.has(code)) return { ok: false, message: `Item code ${code} is duplicated in this version.` };
            if (!RESPONSE_TYPES.includes(responseType)) return { ok: false, message: `Response type ${responseType} is not supported in Phase 2.` };
            itemCodes.add(code); itemCount += 1;
            normalizedItems.push({ code, prompt, responseType, helpText: cleanText(item.helpText, 500) || null, sortOrder: itemIndex + 1, isRequired: item.isRequired === false ? 0 : 1, unsafeRequiresRemark: item.unsafeRequiresRemark === false ? 0 : 1, unsafeRequiresPhoto: item.unsafeRequiresPhoto === true ? 1 : 0, unsafeRequiresAction: item.unsafeRequiresAction === true ? 1 : 0 });
        }
        normalizedCategories.push({ name: categoryName, sortOrder: categoryIndex + 1, items: normalizedItems });
    }
    if (itemCount > 300) return { ok: false, message: 'Checklist supports at most 300 items per version.' };
    const scopeKeys = new Set();
    const normalizedScopes = [];
    for (let index = 0; index < scopes.length; index += 1) {
        const scope = scopes[index] || {};
        const departmentId = nullablePositiveInt(scope.departmentId);
        const safetyUnitId = nullablePositiveInt(scope.safetyUnitId);
        const positionId = nullablePositiveInt(scope.positionId);
        const bbsLevel = scope.bbsLevel ? normalizeLevel(scope.bbsLevel) : null;
        const priority = Number(scope.priority ?? 0);
        if ([departmentId, safetyUnitId, positionId].includes(false) || (scope.bbsLevel && !bbsLevel) || !Number.isInteger(priority) || priority < -100 || priority > 100) return { ok: false, message: `Scope ${index + 1} contains an invalid Master ID, BBS level, or priority.` };
        if (safetyUnitId && !departmentId) return { ok: false, message: `Scope ${index + 1}: Safety Unit requires Department.` };
        const key = [departmentId || 0, safetyUnitId || 0, positionId || 0, bbsLevel || '', priority].join(':');
        if (scopeKeys.has(key)) return { ok: false, message: `Scope ${index + 1} is duplicated.` };
        scopeKeys.add(key);
        normalizedScopes.push({ departmentId, safetyUnitId, positionId, bbsLevel, priority });
    }
    return { ok: true, from: range.from, to: range.to, categories: normalizedCategories, scopes: normalizedScopes, itemCount };
}

function buildImportPreview(payload = {}) {
    const validation = validateDraftPayload(payload);
    if (!validation.ok) return validation;
    return {
        ...validation,
        summary: {
            categoryCount: validation.categories.length,
            itemCount: validation.itemCount,
            scopeCount: validation.scopes.length,
            effectiveFrom: validation.from,
            effectiveTo: validation.to,
        },
        normalized: {
            effectiveFrom: validation.from,
            effectiveTo: validation.to,
            categories: validation.categories,
            scopes: validation.scopes,
        },
    };
}

function scopeSpecificity(scope = {}) {
    return (scope.SafetyUnitID ? 100 : 0) + (scope.DepartmentID ? 40 : 0) + (scope.PositionID ? 20 : 0) + (scope.BBSLevel ? 10 : 0);
}

function scopeMatches(scope, context) {
    return (!scope.DepartmentID || Number(scope.DepartmentID) === Number(context.departmentId))
        && (!scope.SafetyUnitID || Number(scope.SafetyUnitID) === Number(context.safetyUnitId))
        && (!scope.PositionID || Number(scope.PositionID) === Number(context.positionId))
        && (!scope.BBSLevel || scope.BBSLevel === context.bbsLevel);
}

function scopesCanOverlap(a = {}, b = {}) {
    const dimensions = ['DepartmentID', 'SafetyUnitID', 'PositionID', 'BBSLevel'];
    return dimensions.every(key => !a[key] || !b[key] || String(a[key]) === String(b[key]));
}

function detectPublishConflicts(mine = [], others = []) {
    const ids = new Set();
    for (const left of mine) for (const right of others) {
        if (Number(left.Priority) === Number(right.Priority)
            && scopeSpecificity(left) === scopeSpecificity(right)
            && scopesCanOverlap(left, right)) ids.add(Number(right.VersionID));
    }
    return [...ids].filter(Number.isInteger).sort((a, b) => a - b);
}

function resolveCandidates(candidates = [], context = {}) {
    const matched = candidates.filter(row => scopeMatches(row, context)).map(row => ({ ...row, specificity: scopeSpecificity(row) }));
    matched.sort((a, b) => b.specificity - a.specificity || Number(b.Priority) - Number(a.Priority) || String(b.EffectiveFrom).localeCompare(String(a.EffectiveFrom)) || Number(b.VersionID) - Number(a.VersionID));
    if (!matched.length) return { ok: false, code: 'NO_CHECKLIST', message: 'No published checklist matches this employee and date.' };
    const top = matched[0];
    const ties = matched.filter(row => row.specificity === top.specificity && Number(row.Priority) === Number(top.Priority) && String(row.EffectiveFrom) === String(top.EffectiveFrom));
    if (new Set(ties.map(row => Number(row.VersionID))).size > 1) return { ok: false, code: 'CHECKLIST_CONFLICT', message: 'Multiple published checklist versions have equal resolution priority.', conflicts: ties.map(row => Number(row.VersionID)) };
    return { ok: true, selected: top, reason: `specificity=${top.specificity}; priority=${Number(top.Priority)}; effectiveFrom=${top.EffectiveFrom}` };
}

function checklistReadiness(candidates = [], context = {}, asOf = '') {
    const date = String(asOf || '').slice(0, 10);
    const activePublished = candidates.filter(row => Number(row.MappingIsActive ?? row.IsActive) === 1
        && Number(row.TemplateIsActive ?? 1) === 1
        && String(row.VersionStatus || row.Status || '') === 'Published'
        && String(row.EffectiveFrom || '') <= date
        && (!row.EffectiveTo || String(row.EffectiveTo).slice(0, 10) >= date));
    const resolved = resolveCandidates(activePublished, context);
    if (resolved.ok) return {
        ready: true,
        code: 'READY',
        message: `Ready: ${resolved.selected.TemplateName || resolved.selected.TemplateCode || 'Published checklist'} v${Number(resolved.selected.VersionNo || 0)}.`,
        checklistVersionId: Number(resolved.selected.VersionID),
        templateName: resolved.selected.TemplateName || null,
        versionNo: Number(resolved.selected.VersionNo || 0),
    };
    if (resolved.code === 'CHECKLIST_CONFLICT') return { ready: false, code: resolved.code, message: resolved.message, conflicts: resolved.conflicts || [] };

    const matching = candidates.filter(row => Number(row.MappingIsActive ?? row.IsActive) === 1 && scopeMatches(row, context));
    if (matching.some(row => String(row.VersionStatus || row.Status || '') === 'Draft')) {
        return { ready: false, code: 'VERSION_NOT_PUBLISHED', message: 'A matching checklist exists, but its version is not Published.' };
    }
    if (matching.some(row => String(row.VersionStatus || row.Status || '') === 'Published')) {
        return { ready: false, code: 'VERSION_NOT_EFFECTIVE', message: 'A matching Published checklist exists, but it is inactive or outside the effective date.' };
    }
    if (activePublished.length) return { ready: false, code: 'SCOPE_MISMATCH', message: 'Published checklists exist, but none matches this employee scope.' };
    return { ready: false, code: 'NO_CHECKLIST', message: 'No checklist is configured for this employee and date.' };
}

module.exports = { VERSION_STATUSES, RESPONSE_TYPES, cleanText, nullablePositiveInt, validateDraftPayload, buildImportPreview, scopeSpecificity, scopeMatches, scopesCanOverlap, detectPublishConflicts, resolveCandidates, checklistReadiness };
