'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    buildMandatoryPolicyTarget,
    isAdminConfiguredTargetEligible,
} = require('../utils/personal-target-eligibility');

const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
assert.ok(fs.existsSync(phpBin), `PHP runtime not found: ${phpBin}`);

const payload = {
    eligibility: [
        { activity: { targetMode: 'manual' }, row: null },
        { activity: { targetMode: 'manual' }, row: { YearlyTarget: 2, IsNA: 1, source: 'override' } },
        { activity: { targetMode: 'manual' }, row: { YearlyTarget: 0, IsNA: 0, source: 'scope' } },
        { activity: { targetMode: 'manual' }, row: { YearlyTarget: 2, IsNA: 0, source: 'template' } },
        { activity: { targetMode: 'system_denominator' }, row: { YearlyTarget: 1, IsNA: 0, source: 'scope' } },
        { activity: { targetMode: 'system_denominator' }, row: { yearlyTarget: null, isNA: 0, source: 'none' } },
    ],
    policies: [
        { state: { available: true, policy: { id: 5, title: 'Current' }, acknowledged: false }, year: 2026 },
        { state: { available: true, policy: { id: 5, title: 'Current' }, acknowledged: true }, year: 2026 },
        { state: { available: true, policy: null, acknowledged: false }, year: 2026 },
        { state: { available: false, error: 'fixture failure' }, year: 2026 },
    ],
};

const nodeResult = {
    eligibility: payload.eligibility.map(fixture =>
        isAdminConfiguredTargetEligible(fixture.activity, fixture.row)
    ),
    policies: payload.policies.map(fixture =>
        buildMandatoryPolicyTarget(fixture.state, fixture.year)
    ),
};

const php = spawnSync(
    phpBin,
    [path.join(__dirname, 'personal-target-eligibility-fixture.php')],
    { input: JSON.stringify(payload), encoding: 'utf8' }
);
assert.strictEqual(php.status, 0, php.stderr);
assert.deepStrictEqual(JSON.parse(php.stdout), nodeResult, 'Node/PHP Personal Target eligibility parity');

assert.deepStrictEqual(
    nodeResult.eligibility.map(result => result.eligible),
    [false, false, false, true, true, false]
);
assert.strictEqual(nodeResult.policies[0].activityKey, 'policy_acknowledgement');
assert.strictEqual(nodeResult.policies[0].completionPct, 0);
assert.strictEqual(nodeResult.policies[1].completionPct, 100);
assert.strictEqual(nodeResult.policies[2].availabilityStatus, 'NO_CURRENT_POLICY');
assert.strictEqual(nodeResult.policies[3].availabilityStatus, 'DATA_UNAVAILABLE');

console.log('PASS Personal Target eligibility Node/PHP parity (10 fixtures)');
