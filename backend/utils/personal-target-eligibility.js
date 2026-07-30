'use strict';

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function isAdminConfiguredTargetEligible(activity, row) {
    if (!row) return { eligible: false, reason: 'NO_ADMIN_CONFIGURATION' };
    if (Object.prototype.hasOwnProperty.call(row, 'source') && ['none', 'missing'].includes(row.source)) {
        return { eligible: false, reason: 'NO_ADMIN_CONFIGURATION' };
    }
    if (Boolean(Number(row.IsNA ?? row.isNA ?? 0))) {
        return { eligible: false, reason: 'ADMIN_MARKED_N_A' };
    }
    const target = numberOrNull(row.YearlyTarget ?? row.yearlyTarget);
    if (activity?.targetMode !== 'system_denominator' && (target === null || target <= 0)) {
        return { eligible: false, reason: 'NO_POSITIVE_EFFECTIVE_TARGET' };
    }
    return { eligible: true, reason: 'ADMIN_CONFIGURED' };
}

function buildMandatoryPolicyTarget(policyState, year) {
    const available = policyState?.available !== false;
    const policy = policyState?.policy || null;
    const acknowledged = Boolean(policyState?.acknowledged);
    const base = {
        activityKey: 'policy_acknowledgement',
        label: 'Safety Policy Acknowledgement',
        desc: 'Acknowledge the current company safety policy.',
        metricType: 'binary',
        scopeType: 'employee',
        unitLabel: 'policy',
        targetMode: 'mandatory_policy',
        passPct: 100,
        isNA: false,
        source: 'mandatory_policy',
        targetYear: Number(year),
        scope: policy ? { type: 'current_policy', policyId: String(policy.id) } : { type: 'current_policy' },
        eligibilityType: 'mandatory_baseline',
        eligibilitySource: 'current_policy',
        isMandatory: true,
        navigationHash: 'policy',
        calculationMethod: 'current_policy_acknowledgement',
        targetSource: 'current_policy',
    };

    if (!available) {
        return {
            ...base,
            yearlyTarget: null,
            actualCount: null,
            completionPct: null,
            passed: null,
            noData: true,
            availabilityStatus: 'DATA_UNAVAILABLE',
            statusReason: policyState?.error || 'Current policy acknowledgement could not be read.',
        };
    }
    if (!policy) {
        return {
            ...base,
            yearlyTarget: null,
            actualCount: null,
            completionPct: null,
            passed: null,
            noData: true,
            availabilityStatus: 'NO_CURRENT_POLICY',
            statusReason: 'No current safety policy is configured.',
        };
    }
    return {
        ...base,
        yearlyTarget: 1,
        actualCount: acknowledged ? 1 : 0,
        completionPct: acknowledged ? 100 : 0,
        passed: acknowledged,
        noData: false,
        availabilityStatus: 'AVAILABLE',
        statusReason: acknowledged
            ? 'Current safety policy acknowledged.'
            : 'Current safety policy acknowledgement is required.',
        policyTitle: String(policy.title || ''),
    };
}

module.exports = {
    buildMandatoryPolicyTarget,
    isAdminConfiguredTargetEligible,
};
