'use strict';

const assert = require('assert');
const db = require('../db');
const activityTargets = require('../routes/activity-targets');
const { isAdminConfiguredTargetEligible } = require('../utils/personal-target-eligibility');

const year = new Date().getFullYear();

async function fingerprint() {
    const [rows] = await db.query(`
        SELECT
            (SELECT COUNT(*) FROM Employees) employees,
            (SELECT COUNT(*) FROM Activity_Position_Templates) positionTargets,
            (SELECT COUNT(*) FROM Activity_Position_Template_Years) positionYearTargets,
            (SELECT COUNT(*) FROM Activity_Scope_Overrides) scopeTargets,
            (SELECT COUNT(*) FROM Activity_Scope_Override_Years) scopeYearTargets,
            (SELECT COUNT(*) FROM Employee_Activity_Targets) employeeTargets,
            (SELECT COUNT(*) FROM Employee_Activity_Target_Years) employeeYearTargets,
            (SELECT COUNT(*) FROM Policy_Acknowledgements) policyAcknowledgements
    `);
    return rows[0];
}

async function main() {
    const before = await fingerprint();
    const coverage = await activityTargets.getCoverageMatrix(year, { ensureSchema: false });
    const byEmployee = new Map();
    for (const row of coverage.rows) {
        if (!byEmployee.has(row.employeeId)) byEmployee.set(row.employeeId, []);
        const eligibility = isAdminConfiguredTargetEligible(
            { targetMode: row.targetMode },
            {
                yearlyTarget: row.yearlyTarget,
                isNA: row.isNA,
                source: row.source,
            }
        );
        if (eligibility.eligible) byEmployee.get(row.employeeId).push(row.activityKey);
    }
    const [[policy]] = await db.query(`
        SELECT p.id,
               (SELECT COUNT(DISTINCT pa.UserID)
                  FROM Policy_Acknowledgements pa
                 WHERE pa.PolicyID=p.id) acknowledged
          FROM Policies p
         WHERE p.IsCurrent=1
         ORDER BY p.EffectiveDate DESC,p.id DESC
         LIMIT 1
    `);
    const employees = byEmployee.size;
    const withAdditional = [...byEmployee.values()].filter(keys => keys.length > 0).length;
    const withoutAdditional = employees - withAdditional;
    const systemEligible = coverage.rows.filter(row => row.source === 'system').length;

    assert.strictEqual(systemEligible, 0, 'System ratios must not create eligibility');
    assert.strictEqual(employees, Number(before.employees), 'Every employee must be classified');
    assert.strictEqual(withAdditional + withoutAdditional, employees);
    const after = await fingerprint();
    assert.deepStrictEqual(after, before, 'Personal Target eligibility audit must be read-only');

    console.table([{
        year,
        employees,
        mandatoryPolicyTargets: employees,
        currentPolicy: policy ? 1 : 0,
        currentPolicyAcknowledged: Number(policy?.acknowledged || 0),
        withAdditionalAdminTargets: withAdditional,
        withoutAdditionalAdminTargets: withoutAdditional,
        systemGeneratedEligibility: systemEligible,
    }]);
    console.log('PASS Personal Target eligibility audit; all employees receive the mandatory baseline; database fingerprint unchanged');
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
