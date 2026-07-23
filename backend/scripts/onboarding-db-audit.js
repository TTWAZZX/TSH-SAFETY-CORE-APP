'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const {
    ONBOARDING_STATUS,
    OnboardingResolutionError,
    normalizeOnboardingName,
    createOnboardingResolver,
} = require('../utils/onboarding-resolver');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'onboarding_resolver_runner.php');

function runPhp(payload) {
    const candidates = [
        process.env.PHP_BIN,
        process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : null,
        'php',
    ].filter(Boolean);
    for (const executable of [...new Set(candidates)]) {
        const run = spawnSync(executable, [phpRunner], {
            cwd: projectRoot,
            input: JSON.stringify(payload),
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 16 * 1024 * 1024,
        });
        if (run.error?.code === 'ENOENT') continue;
        if (run.error) throw run.error;
        assert.strictEqual(run.status, 0, run.stderr || `PHP resolver exited ${run.status}`);
        return JSON.parse(run.stdout);
    }
    throw new Error('PHP executable was not found. Set PHP_BIN to run the parity audit.');
}

(async () => {
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
        await connection.query('START TRANSACTION READ ONLY');
        transactionStarted = true;

        const [employees] = await connection.query(
            'SELECT EmployeeID,Password,MustChangePassword,Department,Unit FROM employees ORDER BY EmployeeID'
        );
        const [departments] = await connection.query('SELECT id,Name FROM master_departments ORDER BY id');
        const [units] = await connection.query('SELECT id,name,department_id FROM master_safetyunits ORDER BY department_id,id');
        const masterData = { departments, units };
        const resolver = createOnboardingResolver(masterData);

        const unknownDepartments = employees.filter(employee => (
            !resolver.masterIndex.departmentsByName.has(normalizeOnboardingName(employee.Department))
        ));
        const nodeResults = employees.map(employee => {
            try {
                return { employeeId: String(employee.EmployeeID), status: resolver.resolve(employee) };
            } catch (error) {
                if (!(error instanceof OnboardingResolutionError)) throw error;
                return { employeeId: String(employee.EmployeeID), error: error.code };
            }
        });

        const sanitizedEmployees = employees.map(employee => ({
            EmployeeID: String(employee.EmployeeID),
            Password: employee.Password === null ? null : 'SET',
            MustChangePassword: employee.MustChangePassword,
            Department: employee.Department,
            Unit: employee.Unit,
        }));
        const php = runPhp({ masterData, employees: sanitizedEmployees });
        const phpResults = php.results.map(result => {
            const comparable = { employeeId: result.employeeId };
            if (result.status) comparable.status = result.status;
            if (result.error) comparable.error = result.error;
            return comparable;
        });
        assert.deepStrictEqual(phpResults, nodeResults, 'Node/PHP database parity failed.');

        const counts = Object.values(ONBOARDING_STATUS).reduce((result, status) => {
            result[status] = nodeResults.filter(row => row.status === status).length;
            return result;
        }, {});
        const errors = nodeResults.filter(row => row.error).length;

        assert.strictEqual(nodeResults.length, employees.length, 'Not every employee was classified.');
        assert.strictEqual(unknownDepartments.length, 0, 'Unknown employee departments were found.');
        assert.strictEqual(errors, 0, 'Onboarding resolution errors were found.');

        console.log(JSON.stringify({
            readOnly: true,
            employees: employees.length,
            departments: departments.length,
            safetyUnits: units.length,
            counts,
            unknownDepartments: unknownDepartments.length,
            resolutionErrors: errors,
            nodePhpParity: true,
        }, null, 2));
    } finally {
        if (connection) {
            if (transactionStarted) await connection.rollback();
            await connection.end();
        }
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
