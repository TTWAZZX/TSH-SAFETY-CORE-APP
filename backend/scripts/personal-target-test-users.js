'use strict';

const activityTargets = require('../routes/activity-targets');
const { isAdminConfiguredTargetEligible } = require('../utils/personal-target-eligibility');
const { loadReadyEmployees } = require('./ready-test-users');

async function loadReadyEligibilityVariants(db, year = new Date().getFullYear()) {
    const [readyUsers, coverage] = await Promise.all([
        loadReadyEmployees(db),
        activityTargets.getCoverageMatrix(year, { ensureSchema: false }),
    ]);
    const additionalByEmployee = new Map();
    for (const row of coverage.rows) {
        const employeeId = String(row.employeeId || '');
        if (!additionalByEmployee.has(employeeId)) additionalByEmployee.set(employeeId, []);
        const eligibility = isAdminConfiguredTargetEligible(
            { targetMode: row.targetMode },
            {
                yearlyTarget: row.yearlyTarget,
                isNA: row.isNA,
                source: row.source,
            }
        );
        if (eligibility.eligible) additionalByEmployee.get(employeeId).push(row.activityKey);
    }

    const variants = readyUsers.map(user => ({
        user,
        additionalActivityKeys: additionalByEmployee.get(String(user.id)) || [],
    }));
    const configured = variants.find(item => item.additionalActivityKeys.length > 0) || null;
    const baselineOnly = variants.find(item => item.additionalActivityKeys.length === 0) || null;

    return {
        year: Number(year),
        configured,
        baselineOnly,
        counts: {
            ready: variants.length,
            configured: variants.filter(item => item.additionalActivityKeys.length > 0).length,
            baselineOnly: variants.filter(item => item.additionalActivityKeys.length === 0).length,
        },
    };
}

module.exports = { loadReadyEligibilityVariants };
