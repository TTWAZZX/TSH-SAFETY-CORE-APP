'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const {
    CLASSIFICATION_ORDER,
    buildDataQualityReport,
    formatHumanReport,
} = require('../utils/data-quality-audit');

const READ_ONLY_STATEMENTS = Object.freeze({
    begin: 'START TRANSACTION READ ONLY',
    employees: 'SELECT EmployeeID,EmployeeName,Department,Unit,Position,Password,MustChangePassword FROM employees ORDER BY EmployeeID',
    departments: 'SELECT id,Name FROM master_departments ORDER BY id',
    units: 'SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id',
    positions: 'SELECT id,Name FROM master_positions ORDER BY id',
    finish: 'ROLLBACK',
});

function wantsJson(argv) {
    return argv.includes('--json') || argv.includes('--format=json');
}

function emptyFailureReport(error) {
    return {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        auditComplete: false,
        totalEmployees: 0,
        masters: { departments: 0, safetyUnits: 0, positions: 0, positionRelationship: 'GLOBAL' },
        onboardingStatusCounts: {
            PASSWORD_CHANGE_REQUIRED: 0,
            SAFETY_UNIT_REQUIRED: 0,
            READY: 0,
        },
        classificationCounts: Object.fromEntries(CLASSIFICATION_ORDER.map(name => [name, 0])),
        expectedStateCounts: {
            passwordPendingWithBlankUnit: 0,
            passwordPendingWithBlankRequiredUnit: 0,
            safetyUnitPendingWithBlankUnit: 0,
            totalBlankRequiredUnit: 0,
            totalPending: 0,
        },
        dataDefectEmployeeCount: 0,
        findings: Object.fromEntries(CLASSIFICATION_ORDER.map(name => [name, []])),
        masterAmbiguities: [],
        normalizationFindings: [],
        executionErrors: [{ code: 'AUDIT_EXECUTION_FAILED', message: String(error?.message || error) }],
        databaseMutationAttempted: false,
    };
}

async function runAudit() {
    let connection;
    let transactionStarted = false;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            port: Number(process.env.DB_PORT || 3306),
            connectTimeout: 10000,
        });
        await connection.query(READ_ONLY_STATEMENTS.begin);
        transactionStarted = true;

        const [employees] = await connection.query(READ_ONLY_STATEMENTS.employees);
        const [departments] = await connection.query(READ_ONLY_STATEMENTS.departments);
        const [units] = await connection.query(READ_ONLY_STATEMENTS.units);
        const [positions] = await connection.query(READ_ONLY_STATEMENTS.positions);

        return buildDataQualityReport({ employees, departments, units, positions });
    } finally {
        if (connection) {
            if (transactionStarted) await connection.query(READ_ONLY_STATEMENTS.finish);
            await connection.end();
        }
    }
}

if (require.main === module) {
    runAudit().then(report => {
        console.log(wantsJson(process.argv.slice(2)) ? JSON.stringify(report, null, 2) : formatHumanReport(report));
        if (!report.auditComplete || report.masterAmbiguities.length > 0) process.exitCode = 2;
    }).catch(error => {
        const report = emptyFailureReport(error);
        if (wantsJson(process.argv.slice(2))) console.log(JSON.stringify(report, null, 2));
        else {
            console.error(formatHumanReport(report));
            console.error(`Audit execution failed: ${report.executionErrors[0].message}`);
        }
        process.exitCode = 1;
    });
}

module.exports = {
    READ_ONLY_STATEMENTS,
    wantsJson,
    emptyFailureReport,
    runAudit,
};
