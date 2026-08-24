'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { ProfileValidationError } = require('../utils/profile-validator');
const {
    CROSS_PATH_OPERATION,
    executeEmployeeProfileWrite,
    writeEmployeeProfileWithinTransaction,
} = require('../services/employee-profile-write');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'cross_path_profile_runner.php');

class SharedStore {
    constructor(scenario) {
        this.employee = null;
        this.departments = [
            { id: 1, Name: 'Production' },
            { id: 2, Name: 'Warehouse' },
            { id: 3, Name: 'Office' },
        ];
        this.units = [
            { id: 1, name: 'Unit A', department_id: 1 },
            { id: 2, name: 'Unit C', department_id: 1 },
            { id: 3, name: 'Unit B', department_id: 2 },
        ];
        this.positions = [{ id: 1, Name: 'Operator' }, { id: 2, Name: 'Manager' }];
        if (scenario === 'duplicate_position') this.positions.push({ id: 3, Name: ' operator ' });
        if (['partial_update', 'department_change', 'idempotent', 'resolver_failure', 'protected_forbidden', 'upsert_update'].includes(scenario)) {
            this.employee = {
                EmployeeID: 'E001', EmployeeName: 'Employee One', Department: 'Production', Unit: 'Unit A',
                Team: 'Team X', Position: 'Operator', CompanyEmail: null, Role: 'User',
                Password: 'stored-hash', MustChangePassword: 0,
            };
        }
        this.failMaster = scenario === 'master_failure';
        this.waiter = Promise.resolve();
    }

    async acquire() {
        const previous = this.waiter;
        let release;
        this.waiter = new Promise(resolve => { release = resolve; });
        await previous;
        return release;
    }
}

class FakeConnection {
    constructor(store) {
        this.store = store;
        this.snapshot = null;
        this.releaseLock = null;
        this.events = [];
    }

    async beginTransaction() {
        this.events.push('begin');
        this.snapshot = this.store.employee ? { ...this.store.employee } : null;
    }

    async query(sql, params = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        this.events.push(normalized);
        if (/FROM employees .*FOR UPDATE$/i.test(normalized)) {
            if (!this.releaseLock) this.releaseLock = await this.store.acquire();
            return [this.store.employee ? [{ ...this.store.employee }] : []];
        }
        if (/FROM master_departments/i.test(normalized)) {
            if (this.store.failMaster) throw new Error('master unavailable');
            return [this.store.departments.map(row => ({ ...row }))];
        }
        if (/FROM master_safetyunits/i.test(normalized)) {
            if (this.store.failMaster) throw new Error('master unavailable');
            return [this.store.units.map(row => ({ ...row }))];
        }
        if (/FROM master_positions/i.test(normalized)) {
            if (this.store.failMaster) throw new Error('master unavailable');
            return [this.store.positions.map(row => ({ ...row }))];
        }
        if (/^INSERT INTO employees /i.test(normalized)) {
            if (this.store.employee) {
                const error = new Error('duplicate');
                error.code = 'ER_DUP_ENTRY';
                throw error;
            }
            const fields = [
                'EmployeeID', 'EmployeeName', 'Department', 'Unit', 'Team', 'Position',
                'CompanyEmail', 'Role', 'Password', 'MustChangePassword',
            ];
            this.store.employee = Object.fromEntries(fields.map((field, index) => [field, params[index]]));
            return [{ affectedRows: 1 }];
        }
        if (/^UPDATE employees SET /i.test(normalized)) {
            const fields = normalized.match(/^UPDATE employees SET (.+) WHERE EmployeeID=\?/i)[1]
                .split(',').map(assignment => assignment.split('=')[0]);
            fields.forEach((field, index) => { this.store.employee[field] = params[index]; });
            return [{ affectedRows: 1 }];
        }
        if (/^SELECT EmployeeID,Password,MustChangePassword/i.test(normalized)) {
            return [this.store.employee ? [{ ...this.store.employee }] : []];
        }
        if (/^SELECT EmployeeID,EmployeeName/i.test(normalized)) {
            if (!this.store.employee) return [[]];
            const row = { ...this.store.employee };
            delete row.Password;
            return [[row]];
        }
        throw new Error(`Unexpected SQL: ${normalized}`);
    }

    async commit() {
        this.events.push('commit');
        this.snapshot = null;
        this.releaseLock?.();
        this.releaseLock = null;
    }

    async rollback() {
        this.events.push('rollback');
        this.store.employee = this.snapshot ? { ...this.snapshot } : null;
        this.releaseLock?.();
        this.releaseLock = null;
    }
}

function caseOptions(scenario) {
    const operation = ['partial_update', 'department_change', 'idempotent', 'resolver_failure', 'protected_forbidden'].includes(scenario)
        ? CROSS_PATH_OPERATION.UPDATE
        : scenario.startsWith('upsert_') ? CROSS_PATH_OPERATION.UPSERT : CROSS_PATH_OPERATION.CREATE;
    const profilePayload = {
        EmployeeName: ' Employee New\r\n ',
        Department: ' production\r\n ',
        Unit: ' unit a ',
        Position: ' operator ',
    };
    let protectedFields = {
        Team: 'Team Y', CompanyEmail: null, Role: 'User', Password: 'new-hash', MustChangePassword: 1,
    };
    const options = {};
    if (scenario === 'create_ready') protectedFields = { Role: 'User', Password: 'new-hash', MustChangePassword: 0 };
    if (scenario === 'create_password_blank_unit') profilePayload.Unit = '';
    if (scenario === 'create_safety') {
        profilePayload.Unit = '';
        protectedFields = { Role: 'User', Password: 'new-hash', MustChangePassword: 0 };
    }
    if (scenario === 'invalid_department') profilePayload.Department = 'Unknown';
    if (scenario === 'invalid_position') profilePayload.Position = 'Unknown';
    if (scenario === 'invalid_unit') profilePayload.Unit = 'Unit B';
    if (scenario === 'department_no_units') {
        profilePayload.Department = 'Office';
        profilePayload.Unit = 'Legacy';
        protectedFields = { Role: 'User', Password: 'new-hash', MustChangePassword: 0 };
    }
    if (scenario === 'partial_update') {
        return { operation, profilePayload: { EmployeeName: ' Employee Partial\r\n ' }, protectedFields: {}, options };
    }
    if (scenario === 'department_change') {
        return { operation, profilePayload: { Department: 'Warehouse' }, protectedFields: {}, options };
    }
    if (scenario === 'idempotent') return { operation, profilePayload: {}, protectedFields: {}, options };
    if (scenario === 'resolver_failure') {
        options.resolveStatus = async () => { throw new Error('resolver unavailable'); };
        return { operation, profilePayload: { EmployeeName: 'Will Roll Back' }, protectedFields: {}, options };
    }
    if (scenario === 'protected_forbidden') {
        return { operation, profilePayload: {}, protectedFields: { EmployeeID: 'ADMIN' }, options };
    }
    if (scenario === 'upsert_update') {
        return {
            operation,
            profilePayload: { EmployeeName: 'Imported', Department: 'Production', Unit: 'Unit C', Position: 'Manager' },
            protectedFields: { Role: 'Viewer' },
            options,
        };
    }
    return { operation, profilePayload, protectedFields, options };
}

function state(store) {
    if (!store.employee) return null;
    return {
        employeeName: String(store.employee.EmployeeName),
        department: String(store.employee.Department),
        unit: String(store.employee.Unit),
        position: String(store.employee.Position),
        team: String(store.employee.Team),
        role: String(store.employee.Role),
        passwordState: store.employee.Password === null ? 'NULL' : 'SET',
        mustChange: Number(store.employee.MustChangePassword),
    };
}

async function runNodeCase(scenario) {
    const store = new SharedStore(scenario);
    const connection = new FakeConnection(store);
    const testCase = caseOptions(scenario);
    try {
        const result = await executeEmployeeProfileWrite({
            connection,
            operation: testCase.operation,
            employeeId: 'E001',
            profilePayload: testCase.profilePayload,
            protectedFields: testCase.protectedFields,
            ...testCase.options,
        });
        return {
            outcome: 'success', status: result.status, nextAction: result.nextAction,
            inserted: result.inserted, idempotent: result.idempotent,
            changedFields: result.changedFields, state: state(store),
        };
    } catch (error) {
        assert.ok(error instanceof ProfileValidationError, error.stack || error);
        return { outcome: 'error', code: error.code, httpStatus: error.httpStatus, state: state(store) };
    }
}

function runPhp() {
    const candidates = [process.env.PHP_BIN, process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : null, 'php'].filter(Boolean);
    for (const executable of [...new Set(candidates)]) {
        const run = spawnSync(executable, [phpRunner], { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
        if (run.error?.code === 'ENOENT') continue;
        if (run.error) throw run.error;
        assert.strictEqual(run.status, 0, run.stderr || `PHP runner exited ${run.status}`);
        return JSON.parse(run.stdout).results;
    }
    throw new Error('PHP executable was not found.');
}

async function testConcurrency() {
    const store = new SharedStore('partial_update');
    const first = new FakeConnection(store);
    const second = new FakeConnection(store);
    const results = await Promise.all([
        executeEmployeeProfileWrite({
            connection: first, operation: CROSS_PATH_OPERATION.UPDATE, employeeId: 'E001',
            profilePayload: { EmployeeName: 'Concurrent First' }, protectedFields: {},
        }),
        executeEmployeeProfileWrite({
            connection: second, operation: CROSS_PATH_OPERATION.UPDATE, employeeId: 'E001',
            profilePayload: { EmployeeName: 'Concurrent Final' }, protectedFields: {},
        }),
    ]);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(store.employee.EmployeeName, 'Concurrent Final');
    assert.strictEqual(store.employee.Role, 'User');
}

async function testAtomicImportRollback() {
    const store = new SharedStore('partial_update');
    const connection = new FakeConnection(store);
    await connection.beginTransaction();
    await writeEmployeeProfileWithinTransaction({
        connection, operation: CROSS_PATH_OPERATION.UPSERT, employeeId: 'E001',
        profilePayload: { EmployeeName: 'Imported First', Department: 'Production', Unit: 'Unit A', Position: 'Operator' },
        protectedFields: { Role: 'Viewer' },
    });
    await assert.rejects(
        writeEmployeeProfileWithinTransaction({
            connection, operation: CROSS_PATH_OPERATION.UPSERT, employeeId: 'E001',
            profilePayload: { EmployeeName: 'Bad Row', Department: 'Unknown', Unit: '', Position: 'Operator' },
            protectedFields: { Role: 'Admin', Password: 'must-not-leak' },
        }),
        error => error.code === 'INVALID_DEPARTMENT'
    );
    await connection.rollback();
    assert.strictEqual(store.employee.EmployeeName, 'Employee One');
    assert.strictEqual(store.employee.Role, 'User');
}

async function testCreateRetryDoesNotDuplicate() {
    const store = new SharedStore('create_ready');
    const firstConnection = new FakeConnection(store);
    const options = caseOptions('create_ready');
    await executeEmployeeProfileWrite({
        connection: firstConnection,
        operation: CROSS_PATH_OPERATION.CREATE,
        employeeId: 'E001',
        profilePayload: options.profilePayload,
        protectedFields: options.protectedFields,
    });
    const retryConnection = new FakeConnection(store);
    await assert.rejects(
        executeEmployeeProfileWrite({
            connection: retryConnection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId: 'E001',
            profilePayload: options.profilePayload,
            protectedFields: options.protectedFields,
        }),
        error => error.code === 'EMPLOYEE_ALREADY_EXISTS' && error.httpStatus === 409
    );
    assert.strictEqual(store.employee.EmployeeID, 'E001');
    assert.strictEqual(store.employee.EmployeeName, 'Employee New');
}

function assertIntegrationContracts() {
    const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
    const service = read('backend/services/employee-profile-write.js');
    const server = read('backend/server.js');
    const admin = read('backend/routes/admin.js');
    const adminPage = read('public/js/pages/admin.js');
    const foundation = read('api/handlers/foundation.php');
    const phpAdmin = read('api/handlers/admin_phase8.php');
    assert.ok(service.includes('FOR UPDATE'));
    assert.ok(service.includes('beginTransaction'));
    assert.ok(server.includes("authenticateToken, isAdmin"));
    assert.ok(admin.includes('writeEmployeeProfileWithinTransaction'));
    assert.ok(foundation.includes('require_admin()'));
    assert.ok(phpAdmin.includes('crosspath_write_employee_profile_in_transaction'));
    for (const source of [server, admin, foundation, phpAdmin]) {
        assert.ok(source.includes('CROSS_PATH_'));
    }

    const nodeLegacyImport = server.slice(
        server.indexOf("app.post('/api/admin/employees/import'"),
        server.indexOf('app.use((err, req, res, next)')
    );
    const nodeExcelImport = admin.slice(
        admin.indexOf("router.post('/employee/import'"),
        admin.indexOf("router.get('/email-requirement-rules'")
    );
    const phpLegacyImport = foundation.slice(
        foundation.indexOf("$path === '/admin/employees/import'"),
        foundation.indexOf("$path === '/admin/employee/import'")
    );
    const phpExcelImport = foundation.slice(
        foundation.indexOf("$path === '/admin/employee/import'"),
        foundation.indexOf("route_params($path, '/admin/employee/:id')")
    );
    for (const importSource of [nodeLegacyImport, nodeExcelImport]) {
        assert.ok(importSource.includes('CROSS_PATH_OPERATION.CREATE'));
        assert.ok(!importSource.includes('CROSS_PATH_OPERATION.UPSERT'));
        assert.ok(importSource.includes('duplicateCount'));
    }
    for (const importSource of [phpLegacyImport, phpExcelImport]) {
        assert.ok(importSource.includes('CROSS_PATH_CREATE'));
        assert.ok(!importSource.includes('CROSS_PATH_UPSERT'));
        assert.ok(importSource.includes('$duplicateCount'));
    }
    assert.ok(admin.includes("router.get('/employee/recent-additions'"));
    assert.ok(admin.includes("l.Action='CREATE_EMPLOYEE'"));
    assert.ok(nodeExcelImport.includes("'CREATE_EMPLOYEE'"));
    assert.ok(foundation.includes("$path === '/admin/employee/recent-additions'"));
    assert.ok(foundation.includes("auth_audit_log('CREATE_EMPLOYEE'"));
    for (const employeeListSource of [admin, foundation]) {
        assert.ok(employeeListSource.includes('created.ActionTime AS CreatedAt'));
        assert.ok(employeeListSource.includes('CreationSource'));
        assert.ok(employeeListSource.includes("Action='CREATE_EMPLOYEE'"));
    }
    assert.ok(adminPage.includes("API.get('/admin/employees')"));
    assert.ok(adminPage.includes("value=\"created_desc\""));
    assert.ok(adminPage.includes('function _empCompareIds'));
    assert.ok(adminPage.includes('function _empSortRows'));
    assert.ok(adminPage.includes("_empRecentSourceFilter"));
    for (const historicalTable of ['patrol_', 'cccf_', 'ky_', 'fourm_', 'hiyari', 'yokoten']) {
        assert.ok(!service.toLowerCase().includes(`update ${historicalTable}`));
    }
}

(async () => {
    const scenarios = [
        'create_canonical', 'create_password_blank_unit', 'create_ready', 'create_safety', 'invalid_department', 'invalid_position', 'invalid_unit',
        'department_no_units', 'partial_update', 'department_change', 'duplicate_position', 'master_failure',
        'resolver_failure', 'idempotent', 'protected_forbidden', 'upsert_update',
    ];
    const nodeResults = {};
    for (const scenario of scenarios) nodeResults[scenario] = await runNodeCase(scenario);
    const phpResults = runPhp();
    for (const scenario of scenarios) {
        assert.deepStrictEqual(phpResults[scenario], nodeResults[scenario], `Node/PHP mismatch: ${scenario}`);
    }
    assert.strictEqual(nodeResults.create_canonical.status, 'PASSWORD_CHANGE_REQUIRED');
    assert.strictEqual(nodeResults.create_password_blank_unit.status, 'PASSWORD_CHANGE_REQUIRED');
    assert.strictEqual(nodeResults.create_safety.status, 'SAFETY_UNIT_REQUIRED');
    assert.strictEqual(nodeResults.create_ready.status, 'READY');
    assert.strictEqual(nodeResults.department_no_units.state.unit, '');
    assert.strictEqual(nodeResults.partial_update.state.department, 'Production');
    assert.strictEqual(nodeResults.partial_update.state.unit, 'Unit A');
    assert.strictEqual(nodeResults.department_change.code, 'INVALID_SAFETY_UNIT');
    assert.strictEqual(nodeResults.resolver_failure.state.employeeName, 'Employee One');
    assert.strictEqual(nodeResults.idempotent.idempotent, true);
    assert.strictEqual(nodeResults.protected_forbidden.httpStatus, 403);
    assert.ok(!JSON.stringify({ nodeResults, phpResults }).includes('must-not-leak'));
    await testConcurrency();
    await testAtomicImportRollback();
    await testCreateRetryDoesNotDuplicate();
    assertIntegrationContracts();
    console.log(`Cross-path profile tests passed (${scenarios.length} Node/PHP parity cases).`);
    console.log('Create/update/upsert, partial fields, canonical masters, rollback, concurrency, import atomicity, and protected-field contracts passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
