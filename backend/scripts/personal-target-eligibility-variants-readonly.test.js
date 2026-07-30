'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyEligibilityVariants } = require('./personal-target-test-users');

const phpBase = String(
    process.env.LOCAL_PHP_API_URL || 'http://localhost/tsh-safety-core/api/index.php?route='
);

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
            (SELECT COUNT(*) FROM Policies) policies,
            (SELECT COUNT(*) FROM Policy_Acknowledgements) policyAcknowledgements
    `);
    return rows[0];
}

async function getJson(url, token) {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await response.text();
    assert.strictEqual(response.status, 200, `${url}: ${text.slice(0, 500)}`);
    return JSON.parse(text).data;
}

function comparable(data) {
    return {
        eligibility: data.eligibility,
        targets: data.targets.map(target => ({
            activityKey: target.activityKey,
            eligibilityType: target.eligibilityType,
            eligibilitySource: target.eligibilitySource,
            isMandatory: target.isMandatory,
            source: target.source,
            yearlyTarget: target.yearlyTarget,
            actualCount: target.actualCount,
            completionPct: target.completionPct,
            passed: target.passed,
            noData: target.noData,
        })),
    };
}

async function verifyVariant(name, variant, port) {
    if (!variant) return { name, available: false, skipped: true };
    const token = jwt.sign(variant.user, process.env.JWT_SECRET, { expiresIn: '10m' });
    const [nodeData, phpData] = await Promise.all([
        getJson(`http://127.0.0.1:${port}/api/activity-targets/me`, token),
        getJson(`${phpBase}activity-targets/me`, token),
    ]);
    assert.deepStrictEqual(comparable(phpData), comparable(nodeData), `${name}: Node/PHP parity`);
    assert.strictEqual(nodeData.targets[0]?.activityKey, 'policy_acknowledgement', `${name}: Policy first`);
    assert.strictEqual(nodeData.targets[0]?.isMandatory, true, `${name}: mandatory Policy`);

    const expectedAdditional = name === 'configured';
    assert.strictEqual(
        nodeData.eligibility.hasAdditionalConfiguredTargets,
        expectedAdditional,
        `${name}: eligibility flag`
    );
    assert.strictEqual(
        nodeData.targets.length,
        1 + variant.additionalActivityKeys.length,
        `${name}: effective target count`
    );
    assert.deepStrictEqual(
        nodeData.targets.slice(1).map(target => target.activityKey).sort(),
        [...variant.additionalActivityKeys].sort(),
        `${name}: effective Admin activities`
    );
    assert.strictEqual(
        nodeData.eligibility.emptyState,
        expectedAdditional ? null : 'NO_ADDITIONAL_ADMIN_TARGETS',
        `${name}: empty state`
    );
    return {
        name,
        available: true,
        skipped: false,
        targetCount: nodeData.targets.length,
        additionalConfiguredTargets: variant.additionalActivityKeys.length,
    };
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const before = await fingerprint();
    const variants = await loadReadyEligibilityVariants(db);
    assert.ok(variants.counts.ready > 0, 'At least one READY employee is required');

    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
        instance.once('error', reject);
    });
    let results;
    try {
        const port = server.address().port;
        results = await Promise.all([
            verifyVariant('baselineOnly', variants.baselineOnly, port),
            verifyVariant('configured', variants.configured, port),
        ]);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    assert.ok(
        results.some(result => result.available),
        'At least one Personal Target eligibility variant must be verifiable'
    );
    const after = await fingerprint();
    assert.deepStrictEqual(after, before, 'Eligibility variant test must not change guarded row counts');
    console.table(results);
    console.log(`READY availability: ${JSON.stringify(variants.counts)}`);
    console.log('PASS Personal Target READY eligibility variants; Node/PHP parity; database fingerprint unchanged');
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
