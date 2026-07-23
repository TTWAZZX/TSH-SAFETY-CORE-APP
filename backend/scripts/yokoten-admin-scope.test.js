'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildDepartmentUnitPlan } = require('../utils/yokoten-admin-scope');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'yokoten_admin_scope_runner.php');
const masterUnits = [
    { name: 'Maintenance', short_code: 'MTN', department: 'MAINTENANCE SEC.' },
    { name: 'Tube Cutting', short_code: 'PVC Cutting', department: 'MAINTENANCE SEC.' },
    { name: 'QC1 AUTO', short_code: 'QC1 AUTO', department: 'QUALITY CONTROL SEC.' },
    { name: 'QC2 MOTOR', short_code: 'QC2 MOTOR', department: 'QUALITY CONTROL SEC.' },
    { name: 'WH', short_code: 'WH', department: 'WAREHOUSE SEC.' },
];

const scenarios = [
    {
        name: 'maps canonical Units per Department',
        input: {
            departments: ['MAINTENANCE SEC.', 'WAREHOUSE SEC.'],
            departmentUnits: {
                'MAINTENANCE SEC.': ['Maintenance', 'Tube Cutting'],
                'WAREHOUSE SEC.': ['WH'],
            },
            topicUnits: ['Maintenance', 'Tube Cutting', 'WH'],
            masterUnits,
        },
        ok: true,
    },
    {
        name: 'resolves legacy QC1 and QC2 topic aliases uniquely',
        input: {
            departments: ['QUALITY CONTROL SEC.'],
            departmentUnits: {
                'QUALITY CONTROL SEC.': ['QC1 AUTO', 'QC2 MOTOR'],
            },
            topicUnits: ['QC1', 'QC2'],
            masterUnits,
        },
        ok: true,
        aliases: 2,
    },
    {
        name: 'normalizes CRLF case and whitespace for comparison',
        input: {
            departments: [' maintenance sec.\r\n'],
            departmentUnits: {
                'MAINTENANCE SEC.': ['maintenance'],
            },
            topicUnits: [' MAINTENANCE\r\n'],
            masterUnits,
        },
        ok: true,
    },
    {
        name: 'requires a Unit only for a Department with scoped Units',
        input: {
            departments: ['MAINTENANCE SEC.', 'OUTSOURCE SEC.'],
            departmentUnits: {
                'MAINTENANCE SEC.': [],
                'OUTSOURCE SEC.': [],
            },
            topicUnits: ['Maintenance'],
            masterUnits,
        },
        ok: false,
        error: 'Safety Unit is required for MAINTENANCE SEC.',
    },
    {
        name: 'rejects a Unit from a different Department',
        input: {
            departments: ['MAINTENANCE SEC.'],
            departmentUnits: {
                'MAINTENANCE SEC.': ['WH'],
            },
            topicUnits: ['Maintenance', 'WH'],
            masterUnits,
        },
        ok: false,
        error: 'Safety Unit WH does not belong to MAINTENANCE SEC.',
    },
    {
        name: 'rejects mapping for an unselected Department',
        input: {
            departments: ['WAREHOUSE SEC.'],
            departmentUnits: {
                'WAREHOUSE SEC.': ['WH'],
                'MAINTENANCE SEC.': ['Maintenance'],
            },
            topicUnits: ['Maintenance', 'WH'],
            masterUnits,
        },
        ok: false,
        error: 'Safety Unit mapping contains unselected Department: MAINTENANCE SEC.',
    },
    {
        name: 'fails closed on unresolved topic Unit',
        input: {
            departments: ['WAREHOUSE SEC.'],
            departmentUnits: {
                'WAREHOUSE SEC.': ['WH'],
            },
            topicUnits: ['UNKNOWN UNIT'],
            masterUnits,
        },
        ok: false,
        error: 'Topic Safety Unit scope is not in Master Data: UNKNOWN UNIT',
    },
    {
        name: 'fails before the legacy SafetyUnit column can truncate data',
        input: {
            departments: ['PRODUCTION 1 SEC.'],
            departmentUnits: {
                'PRODUCTION 1 SEC.': [
                    'PD1 Element Diecast',
                    'PD1 Element 3/1',
                    'PD1 Element 3/2',
                    'PD1 Element 3/3',
                    'PD1 Assy 3/1',
                    'PD1 Assy 3/2',
                    'PD1 Assy 3/3',
                ],
            },
            topicUnits: [
                'PD1 Element Diecast',
                'PD1 Element 3/1',
                'PD1 Element 3/2',
                'PD1 Element 3/3',
                'PD1 Assy 3/1',
                'PD1 Assy 3/2',
                'PD1 Assy 3/3',
            ],
            masterUnits: [
                { name: 'PD1 Element Diecast', department: 'PRODUCTION 1 SEC.' },
                { name: 'PD1 Element 3/1', department: 'PRODUCTION 1 SEC.' },
                { name: 'PD1 Element 3/2', department: 'PRODUCTION 1 SEC.' },
                { name: 'PD1 Element 3/3', department: 'PRODUCTION 1 SEC.' },
                { name: 'PD1 Assy 3/1', department: 'PRODUCTION 1 SEC.' },
                { name: 'PD1 Assy 3/2', department: 'PRODUCTION 1 SEC.' },
                { name: 'PD1 Assy 3/3', department: 'PRODUCTION 1 SEC.' },
            ],
        },
        ok: false,
        error: 'Selected Safety Units exceed the 100-character storage limit for PRODUCTION 1 SEC.',
    },
];

function runPhp(input) {
    const candidates = [
        process.env.PHP_BIN,
        process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : null,
        'php',
    ].filter(Boolean);
    for (const executable of candidates) {
        const result = spawnSync(executable, [phpRunner], {
            cwd: projectRoot,
            encoding: 'utf8',
            input: JSON.stringify(input),
            windowsHide: true,
        });
        if (!result.error && result.status === 0) return JSON.parse(result.stdout);
    }
    throw new Error('PHP executable was not found or the PHP parity runner failed.');
}

for (const scenario of scenarios) {
    const nodeResult = buildDepartmentUnitPlan(scenario.input);
    const phpResult = runPhp(scenario.input);
    assert.strictEqual(nodeResult.ok, scenario.ok, `${scenario.name}: unexpected Node status`);
    assert.deepStrictEqual(phpResult, nodeResult, `${scenario.name}: Node/PHP parity mismatch`);
    if (scenario.error) assert.ok(nodeResult.errors.includes(scenario.error), `${scenario.name}: expected error`);
    if (scenario.aliases) assert.strictEqual(nodeResult.aliases.length, scenario.aliases, `${scenario.name}: alias count`);
    console.log(`PASS ${scenario.name}`);
}

console.log(`Yokoten Department/Unit scope tests passed ${scenarios.length}/${scenarios.length} with Node/PHP parity.`);
