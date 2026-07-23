'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    ONBOARDING_STATUS,
    OnboardingResolutionError,
    createOnboardingResolver,
    resolveEmployeeOnboarding,
} = require('../utils/onboarding-resolver');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'onboarding_resolver_runner.php');

const masterData = {
    departments: [
        { id: 1, Name: 'Production' },
        { id: 2, Name: 'Office' },
        { id: 3, Name: 'Quality Assurance' },
    ],
    units: [
        { id: 1, name: 'Unit A', department_id: 1 },
        { id: 2, name: 'Unit B', department_id: 1 },
        { id: 3, name: 'Inspection Team', department_id: 3 },
    ],
};

const cases = [
    {
        name: 'Password NULL has first priority',
        employee: { EmployeeID: 'T01', Password: null, MustChangePassword: 0, Department: 'Production', Unit: 'Unit A' },
        status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED,
    },
    {
        name: 'MustChangePassword requires password change',
        employee: { EmployeeID: 'T02', Password: 'hash', MustChangePassword: 1, Department: 'Production', Unit: 'Unit A' },
        status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED,
    },
    {
        name: 'Password gate wins over invalid Safety Unit',
        employee: { EmployeeID: 'T03', Password: null, MustChangePassword: 0, Department: 'Production', Unit: 'Wrong' },
        status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED,
    },
    {
        name: 'Valid Safety Unit is ready',
        employee: { EmployeeID: 'T04', Password: 'hash', MustChangePassword: 0, Department: 'Production', Unit: 'Unit A' },
        status: ONBOARDING_STATUS.READY,
    },
    {
        name: 'Empty Safety Unit requires selection',
        employee: { EmployeeID: 'T05', Password: 'hash', MustChangePassword: 0, Department: 'Production', Unit: '' },
        status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED,
    },
    {
        name: 'Safety Unit from another department requires selection',
        employee: { EmployeeID: 'T06', Password: 'hash', MustChangePassword: 0, Department: 'Production', Unit: 'Inspection Team' },
        status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED,
    },
    {
        name: 'Department without Safety Units is ready',
        employee: { EmployeeID: 'T07', Password: 'hash', MustChangePassword: 0, Department: 'Office', Unit: '' },
        status: ONBOARDING_STATUS.READY,
    },
    {
        name: 'CR/LF, trim, and case normalization match master data',
        employee: { EmployeeID: 'T08', Password: 'hash', MustChangePassword: 0, Department: ' QUALITY\r\nASSURANCE ', Unit: ' inspection\r\nteam ' },
        status: ONBOARDING_STATUS.READY,
    },
    {
        name: 'Unknown department fails closed',
        employee: { EmployeeID: 'T09', Password: 'hash', MustChangePassword: 0, Department: 'Unknown', Unit: '' },
        error: 'UNKNOWN_DEPARTMENT',
    },
    {
        name: 'Missing password state fails closed',
        employee: { EmployeeID: 'T10', MustChangePassword: 0, Department: 'Office', Unit: '' },
        error: 'EMPLOYEE_DATA_INVALID',
    },
];

function resolveCases() {
    const resolver = createOnboardingResolver(masterData);
    return cases.map(testCase => {
        const result = { name: testCase.name, employeeId: testCase.employee.EmployeeID };
        try {
            result.status = resolver.resolve(testCase.employee);
        } catch (error) {
            if (!(error instanceof OnboardingResolutionError)) throw error;
            result.error = error.code;
        }
        return result;
    });
}

function runPhp(payload) {
    const candidates = [
        process.env.PHP_BIN,
        process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : null,
        'php',
    ].filter(Boolean);

    let lastError = null;
    for (const executable of [...new Set(candidates)]) {
        const run = spawnSync(executable, [phpRunner], {
            cwd: projectRoot,
            input: JSON.stringify(payload),
            encoding: 'utf8',
            windowsHide: true,
        });
        if (run.error?.code === 'ENOENT') {
            lastError = run.error;
            continue;
        }
        if (run.error) throw run.error;
        assert.strictEqual(run.status, 0, run.stderr || `PHP resolver exited ${run.status}`);
        return JSON.parse(run.stdout);
    }
    throw lastError || new Error('PHP executable was not found.');
}

async function testDatabaseAdapter() {
    const queries = [];
    const fakeDatabase = {
        async query(sql) {
            queries.push(sql);
            if (sql.includes('FROM employees')) {
                return [[{ EmployeeID: 'T-DB', Password: 'hash', MustChangePassword: 0, Department: 'Office', Unit: '' }]];
            }
            if (sql.includes('FROM master_departments')) return [masterData.departments];
            if (sql.includes('FROM master_safetyunits')) return [masterData.units];
            throw new Error(`Unexpected query: ${sql}`);
        },
    };
    const status = await resolveEmployeeOnboarding(fakeDatabase, 'T-DB');
    assert.strictEqual(status, ONBOARDING_STATUS.READY);
    assert.strictEqual(queries.length, 3);
    assert.ok(queries.every(sql => /^SELECT\b/i.test(sql)), 'Database adapter must contain SELECT queries only.');

    await assert.rejects(
        () => resolveEmployeeOnboarding({ query: async () => { throw new Error('offline'); } }, 'T-DB'),
        error => error instanceof OnboardingResolutionError && error.code === 'DATABASE_READ_FAILED'
    );
}

(async () => {
    const nodeResults = resolveCases();
    cases.forEach((testCase, index) => {
        assert.strictEqual(nodeResults[index].status, testCase.status);
        assert.strictEqual(nodeResults[index].error, testCase.error);
    });
    assert.throws(
        () => createOnboardingResolver({
            departments: [{ id: 1, Name: 'Production' }, { id: 2, Name: ' PRODUCTION ' }],
            units: [],
        }),
        error => error instanceof OnboardingResolutionError && error.code === 'MASTER_DATA_INVALID'
    );
    assert.throws(
        () => createOnboardingResolver({ departments: [], units: [] }),
        error => error instanceof OnboardingResolutionError && error.code === 'MASTER_DATA_INVALID'
    );

    const php = runPhp({
        masterData,
        employees: cases.map(testCase => ({ ...testCase.employee, _testName: testCase.name })),
    });
    assert.deepStrictEqual(php.results, nodeResults, 'Node/PHP onboarding results must match.');
    assert.strictEqual(php.adapterStatus, ONBOARDING_STATUS.READY, 'PHP PDO adapter must resolve fixture data.');
    assert.strictEqual(php.invalidMasterError, 'MASTER_DATA_INVALID', 'PHP resolver must fail closed on empty Master data.');
    await testDatabaseAdapter();

    console.log(`Onboarding resolver tests passed (${cases.length} cases).`);
    console.log('Node/PHP parity passed.');
    console.log('Node query adapter and PHP PDO adapter passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
