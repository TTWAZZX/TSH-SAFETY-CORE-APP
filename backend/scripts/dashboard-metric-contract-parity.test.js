'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { createDashboardMetric } = require('../utils/dashboard-metric-contract');

const root = path.resolve(__dirname, '..', '..');
const phpCandidates = [
    process.env.PHP_BIN,
    'C:\\xampp\\php\\php.exe',
    'php',
].filter(Boolean);
const phpBin = phpCandidates.find(candidate => {
    if (candidate === 'php') return true;
    return fs.existsSync(candidate);
});

assert.ok(phpBin, 'PHP runtime is required for Node/PHP metric parity.');

const asOf = '2026-07-24T00:00:00.000Z';
const fixtures = [
    {
        key: 'patrol',
        options: { numerator: 8, denominator: 10, unit: 'slots', scope: { year: 2026 }, asOf },
    },
    {
        key: 'training',
        options: { numerator: 12, denominator: 10, unit: 'employees', scope: { year: 2026 }, asOf },
    },
    {
        key: 'ky',
        options: { numerator: 0, denominator: 0, unit: 'activities', scope: { year: 2026 }, asOf },
    },
    {
        key: 'yokoten',
        options: {
            numerator: 0,
            denominator: 0,
            unit: 'pairs',
            scope: { year: 2026 },
            dataAvailable: false,
            unavailableReason: 'fixture read failure',
            asOf,
        },
    },
    {
        key: 'accident',
        options: {
            numerator: 2,
            value: 2,
            unit: 'incidents',
            scope: { year: 2026 },
            status: 'CRITICAL',
            statusReason: 'fixture risk',
            asOf,
        },
    },
    {
        key: 'kpi',
        options: { numerator: 10, value: 10, unit: 'metrics', scope: { year: 2026 }, asOf },
    },
    {
        key: 'fourm',
        options: { numerator: 6, denominator: 10, unit: 'notices', scope: { year: 2026 }, asOf },
    },
];

const nodeResult = fixtures.map(fixture => createDashboardMetric(fixture.key, fixture.options));
const phpResult = spawnSync(
    phpBin,
    [path.join(__dirname, 'dashboard-metric-contract-fixture.php')],
    {
        cwd: root,
        input: JSON.stringify(fixtures),
        encoding: 'utf8',
    }
);

assert.strictEqual(phpResult.status, 0, phpResult.stderr || 'PHP fixture runner failed.');
const parsedPhpResult = JSON.parse(phpResult.stdout);
assert.deepStrictEqual(parsedPhpResult, nodeResult, 'Node and PHP canonical metric results must be identical.');

assert.strictEqual(nodeResult[0].percent, 80);
assert.strictEqual(nodeResult[0].status, 'ON_TRACK');
assert.strictEqual(nodeResult[1].percent, 100);
assert.strictEqual(nodeResult[1].numerator, 12);
assert.strictEqual(nodeResult[2].percent, null);
assert.strictEqual(nodeResult[2].status, 'N_A');
assert.strictEqual(nodeResult[3].status, 'DATA_UNAVAILABLE');
assert.strictEqual(nodeResult[4].percent, null);
assert.strictEqual(nodeResult[4].status, 'CRITICAL');
assert.strictEqual(nodeResult[5].status, 'N_A');
assert.strictEqual(nodeResult[6].status, 'WATCH');

console.log(`PASS Node/PHP Dashboard metric parity (${fixtures.length} fixtures)`);
