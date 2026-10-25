'use strict';

const crypto = require('crypto');
const CONTRACT = '2026-10-25-safety-vote-company-visibility-remediation-r1';

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}

function hash(value) {
    return crypto.createHash('sha256').update(canonical(value)).digest('hex');
}

function project(row = {}) {
    return {
        id: Number(row.id || 0),
        campaignCode: String(row.CampaignCode || row.campaignCode || ''),
        title: String(row.TitleTh || row.title || ''),
        status: String(row.Status || row.status || ''),
        discoveryMode: String(row.DiscoveryMode || row.discoveryMode || ''),
        rowVersion: Number(row.RowVersion ?? row.rowVersion ?? 0),
        hidden: Number(row.IsHidden ?? row.hidden ?? 0) === 1,
        test: Number(row.IsTest ?? row.test ?? 0) === 1
    };
}

function classify(row = {}) {
    const item = project(row);
    if (item.status === 'Voided') return { ...item, decision: 'excluded', reason: 'VOIDED_CAMPAIGN' };
    if (item.hidden || item.test) return { ...item, decision: 'excluded', reason: 'HIDDEN_OR_TEST' };
    if (item.discoveryMode === 'public_listing') return { ...item, decision: 'unchanged', reason: 'ALREADY_COMPANY_WIDE' };
    if (item.discoveryMode === 'eligible_only') return { ...item, decision: 'remediate', reason: 'LEGACY_ELIGIBLE_ONLY', targetDiscoveryMode: 'public_listing' };
    return { ...item, decision: 'excluded', reason: 'UNKNOWN_DISCOVERY_MODE' };
}

function buildPlan(rows = []) {
    const items = rows.map(classify).sort((a, b) => a.id - b.id);
    const candidates = items.filter(item => item.decision === 'remediate');
    const protectedEvidence = ['eligibility snapshots', 'eligible voters', 'participation', 'ballots', 'answers', 'jury assignments/scores', 'result snapshots/rows', 'certifications', 'reports'];
    const fingerprint = candidates.map(({ id, campaignCode, discoveryMode, rowVersion, targetDiscoveryMode }) => ({ id, campaignCode, discoveryMode, rowVersion, targetDiscoveryMode }));
    const previewHash = hash({ contract: CONTRACT, candidates: fingerprint });
    return {
        contract: CONTRACT,
        dryRun: true,
        businessMutation: false,
        targetDiscoveryMode: 'public_listing',
        previewHash,
        exactConfirmation: `REMEDIATE COMPANY VISIBILITY ${previewHash.slice(0, 12).toUpperCase()}`,
        counts: {
            total: items.length,
            remediate: candidates.length,
            unchanged: items.filter(item => item.decision === 'unchanged').length,
            excluded: items.filter(item => item.decision === 'excluded').length
        },
        protectedEvidence,
        items
    };
}

module.exports = { CONTRACT, canonical, hash, project, classify, buildPlan };
