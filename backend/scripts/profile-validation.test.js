'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ONBOARDING_STATUS, resolveOnboardingState } = require('../utils/onboarding-resolver');
const { ProfileValidationError } = require('../utils/profile-validator');
const { executeProfileUpdate } = require('../services/profile-update');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'profile_validation_runner.php');

class SharedStore {
    constructor(scenario = 'canonical') {
        this.employee = {
            EmployeeID: 'E001', EmployeeName: 'Employee One', Department: 'Production', Unit: 'Unit A',
            Team: 'Team X', Position: 'Operator', Role: 'User', Password: 'stored-hash', MustChangePassword: 0,
        };
        this.departments = [
            { id: 1, Name: 'Production' }, { id: 2, Name: 'Warehouse' }, { id: 3, Name: 'Office' },
        ];
        this.units = [
            { id: 1, name: 'Unit A', department_id: 1 },
            { id: 2, name: 'Unit C', department_id: 1 },
            { id: 3, name: 'Unit B', department_id: 2 },
        ];
        this.positions = [{ id: 1, Name: 'Operator' }, { id: 2, Name: 'Manager' }];
        if (scenario === 'transition_safety') {
            this.employee.Department = 'Office';
            this.employee.Unit = '';
        }
        if (scenario === 'duplicate_position') this.positions.push({ id: 3, Name: ' operator ' });
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

    async beginTransaction() { this.events.push('begin'); }

    async query(sql, params = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        this.events.push(normalized);
        if (/FOR UPDATE/i.test(sql)) {
            this.releaseLock = await this.store.acquire();
            this.snapshot = { ...this.store.employee };
            return [[{ ...this.store.employee }]];
        }
        if (/^SELECT EmployeeID,Password,MustChangePassword/i.test(normalized)) return [[{ ...this.store.employee }]];
        if (/FROM master_departments/i.test(sql)) {
            if (this.store.failMaster) throw new Error('master unavailable');
            return [this.store.departments.map(row => ({ ...row }))];
        }
        if (/FROM master_safetyunits/i.test(sql)) {
            if (this.store.failMaster) throw new Error('master unavailable');
            return [this.store.units.map(row => ({ ...row }))];
        }
        if (/FROM master_positions/i.test(sql)) {
            if (this.store.failMaster) throw new Error('master unavailable');
            return [this.store.positions.map(row => ({ ...row }))];
        }
        if (/^UPDATE employees SET /i.test(normalized)) {
            const fields = normalized.match(/^UPDATE employees SET (.+) WHERE EmployeeID=\?/i)[1]
                .split(',').map(assignment => assignment.split('=')[0]);
            fields.forEach((field, index) => { this.store.employee[field] = params[index]; });
            return [{ affectedRows: 1 }];
        }
        if (/^SELECT EmployeeID,EmployeeName/i.test(normalized)) {
            const row = { ...this.store.employee };
            delete row.Password;
            return [[row]];
        }
        throw new Error(`Unexpected SQL: ${normalized}`);
    }

    async commit() {
        this.events.push('commit');
        this.releaseLock?.();
        this.releaseLock = null;
    }

    async rollback() {
        this.events.push('rollback');
        if (this.snapshot) this.store.employee = { ...this.snapshot };
        this.releaseLock?.();
        this.releaseLock = null;
    }
}

function payloadFor(scenario) {
    const payload = {
        EmployeeName: ' Employee New\r\n ', Department: ' production\r\n ',
        Unit: ' unit a ', Position: ' operator ',
    };
    if (scenario === 'idempotent') payload.EmployeeName = 'Employee One';
    if (scenario === 'empty_name') payload.EmployeeName = ' \r\n ';
    if (scenario === 'name_type') payload.EmployeeName = ['Employee'];
    if (scenario === 'long_name') payload.EmployeeName = 'ก'.repeat(256);
    if (scenario === 'invalid_department') payload.Department = 'Unknown';
    if (scenario === 'invalid_unit') payload.Unit = 'Unit B';
    if (scenario === 'unit_change') payload.Unit = ' unit c\r\n ';
    if (scenario === 'invalid_position') payload.Position = 'Unknown Position';
    if (scenario === 'forbidden') Object.assign(payload, {
        EmployeeID: 'ADMIN', Role: 'Admin', Team: 'Other Team', Password: 'plaintext',
        MustChangePassword: 1, CompanyEmail: 'other@example.com',
    });
    if (['department_no_units', 'transition_safety'].includes(scenario)) {
        payload.Department = scenario === 'department_no_units' ? 'Office' : 'Production';
        payload.Unit = scenario === 'department_no_units' ? 'Unit B' : '';
        payload.Position = 'Manager';
    }
    return payload;
}

function storeState(store) {
    return {
        employeeName: store.employee.EmployeeName,
        department: store.employee.Department,
        unit: store.employee.Unit,
        position: store.employee.Position,
        protectedFieldsPreserved: store.employee.Team === 'Team X'
            && store.employee.Role === 'User'
            && store.employee.Password === 'stored-hash'
            && store.employee.MustChangePassword === 0,
    };
}

async function runNodeCase(scenario) {
    const store = new SharedStore(scenario);
    const connection = new FakeConnection(store);
    let resolveStatus;
    if (scenario === 'resolver_password') {
        resolveStatus = async () => ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED;
    } else if (scenario === 'resolver_failure') {
        resolveStatus = async () => { throw new Error('resolver unavailable'); };
    } else {
        resolveStatus = async receivedConnection => {
            assert.strictEqual(receivedConnection, connection);
            return resolveOnboardingState(store.employee, {
                departments: store.departments, units: store.units,
            });
        };
    }
    try {
        const result = await executeProfileUpdate({
            connection, employeeId: 'E001', payload: payloadFor(scenario), resolveStatus,
        });
        return {
            outcome: 'success', status: result.status, nextAction: result.nextAction,
            idempotent: result.idempotent, changedFields: result.changedFields,
            profileTeam: result.employee.Team, profileRole: result.employee.Role,
            ...storeState(store),
        };
    } catch (error) {
        assert.ok(error instanceof ProfileValidationError);
        return { outcome: 'error', code: error.code, httpStatus: error.httpStatus, ...storeState(store) };
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

async function testConcurrentUpdates() {
    const store = new SharedStore();
    const firstConnection = new FakeConnection(store);
    const secondConnection = new FakeConnection(store);
    const resolveStatus = async () => resolveOnboardingState(store.employee, {
        departments: store.departments, units: store.units,
    });
    const firstPayload = payloadFor('canonical');
    const secondPayload = { ...firstPayload, EmployeeName: 'Employee Final' };
    const settled = await Promise.all([
        executeProfileUpdate({ connection: firstConnection, employeeId: 'E001', payload: firstPayload, resolveStatus }),
        executeProfileUpdate({ connection: secondConnection, employeeId: 'E001', payload: secondPayload, resolveStatus }),
    ]);
    assert.strictEqual(settled.length, 2);
    assert.strictEqual(store.employee.EmployeeName, 'Employee Final');
    assert.strictEqual(store.employee.Role, 'User');
}

async function testIdempotentSkipsUpdate() {
    const store = new SharedStore('idempotent');
    const connection = new FakeConnection(store);
    const result = await executeProfileUpdate({
        connection,
        employeeId: 'E001',
        payload: payloadFor('idempotent'),
        resolveStatus: async () => resolveOnboardingState(store.employee, {
            departments: store.departments,
            units: store.units,
        }),
    });
    assert.strictEqual(result.idempotent, true);
    assert.ok(!connection.events.some(event => /^UPDATE employees SET /i.test(event)));
}

async function testPostCommitResponseLoss() {
    const store = new SharedStore();
    const connection = new FakeConnection(store);
    const originalQuery = connection.query.bind(connection);
    let profileReads = 0;
    connection.query = async (sql, params) => {
        if (/^SELECT EmployeeID,EmployeeName/i.test(sql.trim()) && !/FOR UPDATE/i.test(sql)) {
            profileReads += 1;
            if (profileReads === 2) throw new Error('connection lost after commit');
        }
        return originalQuery(sql, params);
    };
    await assert.rejects(
        executeProfileUpdate({
            connection, employeeId: 'E001', payload: payloadFor('canonical'),
            resolveStatus: async () => ONBOARDING_STATUS.READY,
        }),
        error => error.code === 'PROFILE_VALIDATION_UNAVAILABLE' && error.httpStatus === 503
    );
    assert.strictEqual(store.employee.EmployeeName, 'Employee New');
    assert.ok(connection.events.includes('commit'));
    assert.ok(!connection.events.includes('rollback'));
}

function assertIntegrationContracts() {
    const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
    const server = read('backend/server.js');
    const foundation = read('api/handlers/foundation.php');
    const frontend = read('public/js/pages/profile.js');
    const main = read('public/js/main.js');
    const nodeService = read('backend/services/profile-update.js');
    const phpService = read('api/lib/profile_update.php');
    const nodeRoute = server.slice(server.indexOf("app.put('/api/profile'"), server.indexOf("app.put('/api/profile/safety-unit'"));
    const phpRoute = foundation.slice(foundation.indexOf("$path === '/profile'"), foundation.indexOf("$path === '/profile/safety-unit'"));
    const handler = frontend.slice(frontend.indexOf('async function _handleSaveProfile'), frontend.indexOf('function _ppwStrength'));

    assert.ok(nodeRoute.includes('executeProfileUpdate'));
    assert.ok(phpRoute.includes('profile_update_execute'));
    for (const route of [nodeRoute, phpRoute]) {
        assert.ok(route.includes('Profile updated successfully.'));
        assert.ok(route.includes('changedFields'));
        assert.ok(route.includes('onboardingStatus'));
        assert.ok(route.includes('token'));
    }
    for (const service of [nodeService, phpService]) {
        assert.ok(service.includes('FOR UPDATE'));
        for (const historicalTable of ['patrol_', 'cccf_', 'ky_', 'fourm_', 'hiyari', 'yokoten']) {
            assert.ok(!service.includes(`UPDATE ${historicalTable}`), 'profile service must not rewrite historical tables');
        }
    }
    assert.ok(!handler.includes('logout'));
    assert.ok(handler.includes('_recoverProfileUpdate'));
    assert.ok(frontend.includes('TSHSession.refreshSession({ preserveOnFailure: true })'));
    assert.ok(main.includes('window.continueAfterProfileUpdate'));
}

(async () => {
    const scenarioNames = [
        'canonical', 'idempotent', 'empty_name', 'name_type', 'long_name',
        'invalid_department', 'invalid_unit', 'unit_change', 'invalid_position', 'forbidden',
        'department_no_units', 'transition_safety', 'master_failure',
        'duplicate_position', 'resolver_password', 'resolver_failure',
    ];
    const nodeResults = {};
    for (const scenario of scenarioNames) nodeResults[scenario] = await runNodeCase(scenario);
    const phpResults = runPhp();
    for (const scenario of scenarioNames) {
        assert.deepStrictEqual(phpResults[scenario], nodeResults[scenario], `Node/PHP mismatch: ${scenario}`);
    }
    assert.deepStrictEqual(nodeResults.canonical.changedFields, ['EmployeeName']);
    assert.strictEqual(nodeResults.canonical.employeeName, 'Employee New');
    assert.strictEqual(nodeResults.idempotent.idempotent, true);
    assert.strictEqual(nodeResults.department_no_units.status, 'READY');
    assert.strictEqual(nodeResults.department_no_units.unit, '');
    assert.strictEqual(nodeResults.unit_change.unit, 'Unit C');
    assert.ok(nodeResults.unit_change.changedFields.includes('Unit'));
    assert.strictEqual(nodeResults.transition_safety.status, 'SAFETY_UNIT_REQUIRED');
    assert.strictEqual(nodeResults.transition_safety.department, 'Production');
    assert.strictEqual(nodeResults.transition_safety.nextAction, 'SELECT_SAFETY_UNIT');
    assert.strictEqual(nodeResults.forbidden.code, 'PROFILE_FIELD_NOT_ALLOWED');
    for (const scenario of ['master_failure', 'duplicate_position']) {
        assert.strictEqual(nodeResults[scenario].code, 'PROFILE_VALIDATION_UNAVAILABLE');
        assert.strictEqual(nodeResults[scenario].httpStatus, 503);
    }
    for (const scenario of ['resolver_password', 'resolver_failure']) {
        assert.strictEqual(nodeResults[scenario].code, 'ONBOARDING_STATE_UNAVAILABLE');
        assert.strictEqual(nodeResults[scenario].httpStatus, 503);
        assert.strictEqual(nodeResults[scenario].employeeName, 'Employee One');
    }
    assert.strictEqual(phpResults.double_submit.firstIdempotent, false);
    assert.strictEqual(phpResults.double_submit.secondIdempotent, true);
    await testIdempotentSkipsUpdate();
    await testConcurrentUpdates();
    await testPostCommitResponseLoss();
    assertIntegrationContracts();
    console.log(`Profile validation tests passed (${scenarioNames.length} Node/PHP parity cases).`);
    console.log('Allowlist, canonical masters, onboarding transition, rollback, concurrency, and recovery contracts passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
