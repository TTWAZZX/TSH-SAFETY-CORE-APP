'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
    ONBOARDING_STATUS,
    OnboardingResolutionError,
    createOnboardingResolver,
} = require('../utils/onboarding-resolver');
const {
    DATA_QUALITY_CLASSIFICATION: C,
    buildDataQualityReport,
    formatHumanReport,
} = require('../utils/data-quality-audit');
const { READ_ONLY_STATEMENTS, wantsJson, emptyFailureReport } = require('./data-quality-audit');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'onboarding_resolver_runner.php');
const fixedTime = '2026-01-01T00:00:00.000Z';
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
    positions: [
        { id: 1, Name: 'Worker' },
        { id: 2, Name: 'Manager' },
    ],
};

const employees = [
    { EmployeeID: 'T01', EmployeeName: 'One', Password: null, MustChangePassword: 0, Department: 'Production', Unit: '', Position: 'Worker' },
    { EmployeeID: 'T02', EmployeeName: 'Two', Password: 'secret-two', MustChangePassword: 1, Department: 'Production', Unit: '', Position: 'Worker' },
    { EmployeeID: 'T03', EmployeeName: 'Three', Password: 'secret-three', MustChangePassword: 0, Department: 'Production', Unit: '', Position: 'Worker' },
    { EmployeeID: 'T04', EmployeeName: 'Four', Password: 'secret-four', MustChangePassword: 0, Department: 'Production', Unit: 'Unit A', Position: 'Worker' },
    { EmployeeID: 'T05', EmployeeName: 'Five', Password: 'secret-five', MustChangePassword: 0, Department: 'Production', Unit: 'Inspection Team', Position: 'Worker' },
    { EmployeeID: 'T06', EmployeeName: 'Six', Password: 'secret-six', MustChangePassword: 0, Department: 'Office', Unit: '', Position: 'Worker' },
    { EmployeeID: 'T07', EmployeeName: 'Seven', Password: 'secret-seven', MustChangePassword: 0, Department: 'Office', Unit: 'Legacy', Position: 'Worker' },
    { EmployeeID: 'T08', EmployeeName: 'Eight', Password: 'secret-eight', MustChangePassword: 0, Department: 'Unknown', Unit: '', Position: 'Worker' },
    { EmployeeID: 'T09', EmployeeName: 'Nine', Password: 'secret-nine', MustChangePassword: 0, Department: 'Production', Unit: 'Unit A', Position: 'Ghost' },
    { EmployeeID: 'T10', EmployeeName: ' Ten\r\n', Password: 'secret-ten', MustChangePassword: 0, Department: ' Production\r\n', Unit: ' Unit A\r\n', Position: ' Worker ' },
    { EmployeeID: 'T11', EmployeeName: ' ', Password: 'secret-eleven', MustChangePassword: 0, Department: 'Production', Unit: 'Unit A', Position: 'Worker' },
    { EmployeeID: 'T12', EmployeeName: 'Twelve', Password: 'secret-twelve', MustChangePassword: 0, Department: 'Production', Unit: 'Unit A', Position: '' },
    { EmployeeID: 'T13', EmployeeName: 'X'.repeat(256), Password: 'secret-thirteen', MustChangePassword: 0, Department: 'Production', Unit: 'Unit A', Position: 'Worker' },
    { EmployeeID: 'T14', EmployeeName: 'Fourteen', Password: null, MustChangePassword: 0, Department: 'Not Yet Mastered', Unit: '', Position: 'Worker' },
];

function runPhpResolverParity() {
    const candidates = [
        process.env.PHP_BIN,
        process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : null,
        'php',
    ].filter(Boolean);
    const payload = {
        masterData: { departments: masterData.departments, units: masterData.units },
        employees: employees.map(employee => ({
            EmployeeID: employee.EmployeeID,
            Password: employee.Password === null ? null : 'SET',
            MustChangePassword: employee.MustChangePassword,
            Department: employee.Department,
            Unit: employee.Unit,
        })),
    };
    for (const executable of [...new Set(candidates)]) {
        const run = spawnSync(executable, [phpRunner], {
            cwd: projectRoot,
            input: JSON.stringify(payload),
            encoding: 'utf8',
            windowsHide: true,
        });
        if (run.error?.code === 'ENOENT') continue;
        if (run.error) throw run.error;
        assert.strictEqual(run.status, 0, run.stderr || `PHP resolver exited ${run.status}`);
        return JSON.parse(run.stdout).results;
    }
    throw new Error('PHP executable was not found.');
}

function nodeResolverResults() {
    const resolver = createOnboardingResolver({ departments: masterData.departments, units: masterData.units });
    return employees.map(employee => {
        const result = { name: '', employeeId: employee.EmployeeID };
        try {
            result.status = resolver.resolve(employee);
        } catch (error) {
            if (!(error instanceof OnboardingResolutionError)) throw error;
            result.error = error.code;
        }
        return result;
    });
}

function assertClassification(report) {
    assert.strictEqual(report.classificationCounts[C.EXPECTED_PASSWORD_PENDING], 3);
    assert.strictEqual(report.classificationCounts[C.EXPECTED_SAFETY_UNIT_PENDING], 1);
    assert.strictEqual(report.classificationCounts[C.READY_VALID], 7);
    assert.strictEqual(report.classificationCounts[C.INVALID_UNIT_FOR_DEPARTMENT], 1);
    assert.strictEqual(report.classificationCounts[C.UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS], 1);
    assert.strictEqual(report.classificationCounts[C.UNKNOWN_DEPARTMENT], 2);
    assert.strictEqual(report.classificationCounts[C.INVALID_POSITION], 1);
    assert.strictEqual(report.classificationCounts[C.HIDDEN_WHITESPACE_OR_LINEBREAK], 2);
    assert.strictEqual(report.classificationCounts[C.MASTER_DATA_AMBIGUITY], 0);
    assert.strictEqual(report.classificationCounts[C.OTHER_PROFILE_ANOMALIES], 3);
    assert.strictEqual(report.onboardingStatusCounts[ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED], 3);
    assert.strictEqual(report.onboardingStatusCounts[ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED], 2);
    assert.strictEqual(report.onboardingStatusCounts[ONBOARDING_STATUS.READY], 8);
    assert.strictEqual(report.expectedStateCounts.passwordPendingWithBlankUnit, 3);
    assert.strictEqual(report.expectedStateCounts.passwordPendingWithBlankRequiredUnit, 2);
    assert.strictEqual(report.expectedStateCounts.safetyUnitPendingWithBlankUnit, 1);
    assert.strictEqual(report.expectedStateCounts.totalBlankRequiredUnit, 3);
    assert.strictEqual(report.dataDefectEmployeeCount, 9);
    assert.strictEqual(
        report.findings[C.EXPECTED_SAFETY_UNIT_PENDING][0].requiresUserSelection,
        true
    );
    assert.strictEqual(
        report.findings[C.INVALID_UNIT_FOR_DEPARTMENT][0].automaticReplacementAllowed,
        false
    );
    assert.strictEqual(
        report.findings[C.UNEXPECTED_UNIT_WITHOUT_MASTER_UNITS][0].automaticClearAllowed,
        false
    );
    assert.strictEqual(report.findings[C.INVALID_POSITION][0].canonicalCandidates.length, 0);
    assert.strictEqual(report.findings[C.HIDDEN_WHITESPACE_OR_LINEBREAK][0].employeeId, 'T10');
}

function assertReportContract(report) {
    for (const key of [
        'generatedAt', 'readOnly', 'totalEmployees', 'masters', 'onboardingStatusCounts',
        'classificationCounts', 'findings', 'masterAmbiguities', 'normalizationFindings',
        'executionErrors', 'databaseMutationAttempted',
    ]) {
        assert.ok(Object.prototype.hasOwnProperty.call(report, key), `Missing report field: ${key}`);
    }
    assert.strictEqual(report.readOnly, true);
    assert.strictEqual(report.databaseMutationAttempted, false);
    assert.deepStrictEqual(report.executionErrors, []);
    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes('"Password"'), 'Report must not contain a Password field.');
    assert.ok(!serialized.includes('secret-'), 'Report must not contain password values.');
}

function assertReadOnlyImplementation() {
    const allowed = /^(SELECT\b|START TRANSACTION READ ONLY$|ROLLBACK$)/i;
    for (const statement of Object.values(READ_ONLY_STATEMENTS)) {
        assert.ok(allowed.test(statement), `Unexpected database statement: ${statement}`);
    }
    const cliSource = fs.readFileSync(path.join(__dirname, 'data-quality-audit.js'), 'utf8');
    assert.ok(!/\b(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE)\b/i.test(cliSource));
    assert.ok(!/\bCREATE\s+(TABLE|TRIGGER|PROCEDURE|EVENT)\b/i.test(cliSource));
}

(async () => {
    const input = { employees, ...masterData };
    const report = buildDataQualityReport(input, { generatedAt: fixedTime });
    assert.strictEqual(report.auditComplete, true);
    assertClassification(report);
    assertReportContract(report);
    assert.deepStrictEqual(
        buildDataQualityReport(input, { generatedAt: fixedTime }),
        report,
        'Report must be deterministic for unchanged input and timestamp.'
    );
    assert.deepStrictEqual(runPhpResolverParity(), nodeResolverResults(), 'Node/PHP resolver parity failed.');

    const ambiguous = buildDataQualityReport({
        employees: [],
        departments: [{ id: 1, Name: 'Production' }, { id: 2, Name: ' PRODUCTION\r\n' }],
        units: [],
        positions: masterData.positions,
    }, { generatedAt: fixedTime });
    assert.strictEqual(ambiguous.auditComplete, false);
    assert.ok(ambiguous.masterAmbiguities.length > 0);
    assert.strictEqual(ambiguous.databaseMutationAttempted, false);

    const unavailable = buildDataQualityReport({ employees: [], departments: [], units: [], positions: [] }, { generatedAt: fixedTime });
    assert.strictEqual(unavailable.auditComplete, false);
    assert.ok(unavailable.masterAmbiguities.length >= 2);

    assert.ok(formatHumanReport(report).includes('READ ONLY'));
    assert.strictEqual(wantsJson(['--json']), true);
    assert.strictEqual(wantsJson(['--format=json']), true);
    assert.strictEqual(emptyFailureReport(new Error('offline')).executionErrors.length, 1);
    assertReadOnlyImplementation();

    console.log('Phase 6 data-quality audit tests passed (14 employee scenarios).');
    console.log('Classification, deterministic output, secret exclusion, read-only guard, and Node/PHP resolver parity passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
