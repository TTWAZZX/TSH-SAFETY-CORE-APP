'use strict';

const assert = require('assert');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

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
    return JSON.parse(text);
}

function comparable(target) {
    return {
        activityKey: target.activityKey,
        yearlyTarget: target.yearlyTarget,
        actualCount: target.actualCount,
        completionPct: target.completionPct,
        passed: target.passed,
        noData: target.noData,
        source: target.source,
        eligibilityType: target.eligibilityType,
        eligibilitySource: target.eligibilitySource,
        isMandatory: target.isMandatory,
        availabilityStatus: target.availabilityStatus || null,
    };
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    const before = await fingerprint();
    const { user } = await loadReadyTestUsers(db);
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '10m' });
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
        const address = server.address();
        const [nodeBody, phpBody] = await Promise.all([
            getJson(`http://127.0.0.1:${address.port}/api/activity-targets/me`, token),
            getJson(`${phpBase}activity-targets/me`, token),
        ]);
        const nodeData = nodeBody.data;
        const phpData = phpBody.data;
        assert.ok(nodeData?.targets?.length >= 1, 'Node must return the mandatory baseline');
        assert.ok(phpData?.targets?.length >= 1, 'PHP must return the mandatory baseline');
        assert.strictEqual(nodeData.targets[0].activityKey, 'policy_acknowledgement');
        assert.strictEqual(phpData.targets[0].activityKey, 'policy_acknowledgement');
        assert.deepStrictEqual(nodeData.eligibility, phpData.eligibility, 'Node/PHP eligibility metadata parity');

        const nodeTargets = nodeData.targets.map(comparable);
        const phpTargets = phpData.targets.map(comparable);
        assert.deepStrictEqual(phpTargets, nodeTargets, 'Node/PHP Personal Target runtime parity');

        for (const target of nodeData.targets.slice(1)) {
            assert.strictEqual(target.eligibilityType, 'admin_configured', `${target.activityKey}: eligibility type`);
            assert.ok(['override', 'scope', 'template'].includes(target.source), `${target.activityKey}: effective Admin source`);
            assert.notStrictEqual(target.isNA, true, `${target.activityKey}: N/A targets are omitted`);
        }
        assert.ok(
            !nodeData.targets.some(target => target.source === 'system'),
            'System ratios must not create Personal Target eligibility'
        );
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
    const after = await fingerprint();
    assert.deepStrictEqual(after, before, 'Personal Target runtime test must not change guarded row counts');
    console.log('PASS Personal Target authenticated Node/PHP runtime parity; mandatory Policy baseline present; database fingerprint unchanged');
}

main()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.end());
