'use strict';

const fs = require('fs');
const path = require('path');

const contractPath = path.resolve(__dirname, '..', '..', 'config', 'dashboard-module-health-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const moduleMap = new Map(contract.modules.map(module => [module.key, module]));

function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function metricSource(module, description) {
    return {
        tables: [...module.target.sourceTables],
        description: description || module.target.formula || module.target.numerator,
    };
}

function unavailableMetric(module, options, asOf) {
    return {
        key: module.key,
        metricType: module.metricType,
        numerator: null,
        denominator: module.metricType === 'progress' ? null : null,
        percent: null,
        value: null,
        unit: options.unit || null,
        source: metricSource(module, options.sourceDescription),
        scope: options.scope || {},
        dataAvailable: false,
        status: 'DATA_UNAVAILABLE',
        statusReason: options.unavailableReason || 'One or more configured source queries could not be read.',
        asOf,
    };
}

function createDashboardMetric(key, options = {}) {
    const module = moduleMap.get(key);
    if (!module) throw new Error(`Unknown Dashboard metric key: ${key}`);

    const asOf = options.asOf || new Date().toISOString();
    if (options.dataAvailable === false) return unavailableMetric(module, options, asOf);

    const numerator = finiteNumber(options.numerator);
    const value = finiteNumber(options.value ?? options.numerator);
    const base = {
        key,
        metricType: module.metricType,
        numerator,
        denominator: null,
        percent: null,
        value,
        unit: options.unit || null,
        source: metricSource(module, options.sourceDescription),
        scope: options.scope || {},
        dataAvailable: true,
        status: 'N_A',
        statusReason: options.statusReason || 'This metric has no evaluable health rule.',
        asOf,
    };

    if (module.metricType !== 'progress') {
        if (options.status && contract.statuses.includes(options.status)) {
            base.status = options.status;
            base.statusReason = options.statusReason || base.statusReason;
        }
        return base;
    }

    const denominator = finiteNumber(options.denominator);
    base.denominator = denominator;
    if (denominator === null || denominator <= 0) {
        base.numerator = numerator ?? 0;
        base.value = value ?? base.numerator;
        base.statusReason = options.zeroDenominatorReason || 'No applicable denominator is configured for this scope.';
        return base;
    }

    const safeNumerator = Math.max(0, numerator ?? 0);
    const cappedNumerator = Math.min(safeNumerator, denominator);
    base.numerator = safeNumerator;
    base.value = value ?? safeNumerator;
    base.percent = Math.max(0, Math.min(100, Math.round(cappedNumerator / denominator * 100)));

    const onTrackMinimum = finiteNumber(options.thresholds?.onTrackMinimum)
        ?? contract.percentageRules.defaultThresholds.onTrackMinimum;
    const watchMinimum = finiteNumber(options.thresholds?.watchMinimum)
        ?? contract.percentageRules.defaultThresholds.watchMinimum;
    base.status = base.percent >= onTrackMinimum
        ? 'ON_TRACK'
        : base.percent >= watchMinimum
            ? 'WATCH'
            : 'CRITICAL';
    base.statusReason = options.statusReason
        || `${base.percent}% against ${onTrackMinimum}% On Track and ${watchMinimum}% Watch thresholds.`;
    return base;
}

module.exports = {
    contract,
    createDashboardMetric,
};
