'use strict';

const crypto = require('crypto');

const CONTRACT_VERSION = '2026-10-08-safety-vote-phase0-r1';
const CAMPAIGN_TYPES = Object.freeze(['popular_vote','secret_election','survey','poll','feedback','nomination','award','submission_challenge','jury_scoring','hybrid_scoring','ranking','prioritization','allocation','resolution','petition','event_choice','risk_perception','knowledge_check','multi_stage']);
const PRIVACY_MODES = Object.freeze(['identified','confidential','anonymous','secret_ballot']);
const RESULT_VISIBILITY = Object.freeze(['live','admin_only','hidden_until_close','certified_only','published']);
const RULE_ATTRIBUTES = Object.freeze(['all','employee_id','department_id','safety_unit_id','position_id','role','team']);
const RULE_OPERATORS = Object.freeze(['EQUALS','NOT_EQUALS','IN','NOT_IN','IS_EMPTY','IS_NOT_EMPTY']);
const RULE_EFFECTS = Object.freeze(['include','exclude']);

function clean(value, max = 255) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, max);
}

function positiveInt(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

function normalizeCode(value) {
    const code = clean(value, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return code || null;
}

function normalizeCampaign(input = {}) {
    const campaignType = clean(input.campaignType || input.CampaignType || 'popular_vote', 40).toLowerCase();
    const privacyMode = clean(input.privacyMode || input.PrivacyMode || 'identified', 24).toLowerCase();
    const resultVisibility = clean(input.resultVisibility || input.ResultVisibility || 'hidden_until_close', 24).toLowerCase();
    const titleTh = clean(input.titleTh || input.TitleTh, 200);
    const campaignCode = normalizeCode(input.campaignCode || input.CampaignCode);
    const errors = [];
    if (!campaignCode) errors.push({ field: 'campaignCode', code: 'REQUIRED' });
    if (!titleTh) errors.push({ field: 'titleTh', code: 'REQUIRED' });
    if (!CAMPAIGN_TYPES.includes(campaignType)) errors.push({ field: 'campaignType', code: 'INVALID_ENUM' });
    if (!PRIVACY_MODES.includes(privacyMode)) errors.push({ field: 'privacyMode', code: 'INVALID_ENUM' });
    if (!RESULT_VISIBILITY.includes(resultVisibility)) errors.push({ field: 'resultVisibility', code: 'INVALID_ENUM' });
    if (privacyMode === 'secret_ballot' && resultVisibility === 'live') errors.push({ field: 'resultVisibility', code: 'SECRET_LIVE_RESULT_FORBIDDEN' });
    return {
        ok: errors.length === 0,
        errors,
        value: {
            campaignCode,
            titleTh,
            titleEn: clean(input.titleEn || input.TitleEn, 200) || null,
            summary: clean(input.summary || input.Summary, 500) || null,
            description: clean(input.description || input.Description, 12000) || null,
            rulesText: clean(input.rulesText || input.RulesText, 12000) || null,
            templateKey: clean(input.templateKey || input.TemplateKey || 'blank', 50).toLowerCase(),
            campaignType,
            privacyMode,
            resultVisibility,
            discoveryMode: clean(input.discoveryMode || input.DiscoveryMode || 'eligible_only', 24) === 'public_listing' ? 'public_listing' : 'eligible_only',
            openAt: clean(input.openAt || input.OpenAt, 32) || null,
            closeAt: clean(input.closeAt || input.CloseAt, 32) || null,
            privacyThreshold: Math.max(2, Math.min(100, Number(input.privacyThreshold || input.PrivacyThreshold || 5))),
        },
    };
}

function normalizeRule(input = {}, index = 0) {
    const effect = clean(input.effect || input.Effect, 12).toLowerCase();
    const attributeKey = clean(input.attributeKey || input.AttributeKey, 40).toLowerCase();
    const operator = clean(input.operator || input.Operator, 20).toUpperCase();
    const rawValues = Array.isArray(input.values) ? input.values : (Array.isArray(input.Values) ? input.Values : []);
    const values = [...new Set(rawValues.map(value => clean(value, 160)).filter(Boolean))].slice(0, 500);
    const errors = [];
    if (!RULE_EFFECTS.includes(effect)) errors.push('INVALID_EFFECT');
    if (!RULE_ATTRIBUTES.includes(attributeKey)) errors.push('INVALID_ATTRIBUTE');
    if (!RULE_OPERATORS.includes(operator)) errors.push('INVALID_OPERATOR');
    if (!['IS_EMPTY','IS_NOT_EMPTY'].includes(operator) && attributeKey !== 'all' && values.length === 0) errors.push('VALUES_REQUIRED');
    if (attributeKey === 'all' && !['EQUALS','IN'].includes(operator)) errors.push('INVALID_ALL_OPERATOR');
    return { ok: errors.length === 0, errors, value: { ruleGroup: positiveInt(input.ruleGroup) || 1, ruleOrder: positiveInt(input.ruleOrder) || index + 1, effect, attributeKey, operator, values, reason: clean(input.reason || input.Reason, 255) || null } };
}

function normalizeRules(input) {
    if (!Array.isArray(input) || input.length > 100) return { ok: false, errors: [{ index: -1, codes: ['RULE_ARRAY_REQUIRED'] }], rules: [] };
    const parsed = input.map(normalizeRule);
    return { ok: parsed.every(row => row.ok), errors: parsed.flatMap((row, index) => row.ok ? [] : [{ index, codes: row.errors }]), rules: parsed.map(row => row.value) };
}

function scalarKey(value) {
    return clean(value, 160).toLocaleLowerCase('en-US');
}

function ruleMatches(rule, employee) {
    if (rule.attributeKey === 'all') return true;
    const map = { employee_id: employee.employeeId, department_id: employee.departmentId, safety_unit_id: employee.safetyUnitId, position_id: employee.positionId, role: employee.role, team: employee.team };
    const actual = scalarKey(map[rule.attributeKey]);
    const expected = rule.values.map(scalarKey);
    if (rule.operator === 'IS_EMPTY') return actual === '';
    if (rule.operator === 'IS_NOT_EMPTY') return actual !== '';
    const contains = expected.includes(actual);
    return ['EQUALS','IN'].includes(rule.operator) ? contains : !contains;
}

function evaluateEligibility(rules, employees) {
    const includes = rules.filter(rule => rule.effect === 'include');
    const excludes = rules.filter(rule => rule.effect === 'exclude');
    return employees.filter(employee => includes.some(rule => ruleMatches(rule, employee)) && !excludes.some(rule => ruleMatches(rule, employee))).map(employee => ({ ...employee, inclusionSource: 'rule', inclusionReason: includes.filter(rule => ruleMatches(rule, employee)).map(rule => rule.reason || `${rule.attributeKey}:${rule.operator}`).join('; ').slice(0, 255) }));
}

function canonicalHash(value) {
    function sort(item) {
        if (Array.isArray(item)) return item.map(sort);
        if (item && typeof item === 'object') return Object.keys(item).sort().reduce((out, key) => { out[key] = sort(item[key]); return out; }, {});
        return item;
    }
    return crypto.createHash('sha256').update(JSON.stringify(sort(value))).digest('hex');
}

module.exports = { CONTRACT_VERSION, CAMPAIGN_TYPES, PRIVACY_MODES, RESULT_VISIBILITY, RULE_ATTRIBUTES, RULE_OPERATORS, RULE_EFFECTS, clean, positiveInt, normalizeCode, normalizeCampaign, normalizeRule, normalizeRules, evaluateEligibility, canonicalHash };
