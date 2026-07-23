'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    ONBOARDING_STATUS,
    resolveOnboardingState,
} = require('../utils/onboarding-resolver');
const {
    SafetyUnitContinuationError,
    executeSafetyUnitContinuation,
} = require('../services/safety-unit-continuation');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'safety_unit_continuation_runner.php');

class SharedStore {
    constructor(scenario = 'canonical') {
        this.employee = {
            EmployeeID: 'E001', EmployeeName: 'Employee One', Department: ' Production\r\n ', Unit: '',
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
        if (scenario === 'duplicate_master') this.units.push({ id: 4, name: ' unit a ', department_id: 1 });
        if (scenario === 'unknown_department') this.employee.Department = 'Unknown';
        if (scenario === 'no_units') this.employee.Department = 'Office';
        if (['idempotent', 'already_completed'].includes(scenario)) this.employee.Unit = 'Unit A';
        if (scenario === 'password_required') this.employee.MustChangePassword = 1;
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
        this.transaction = false;
        this.events = [];
    }

    async beginTransaction() {
        this.transaction = true;
        this.events.push('begin');
    }

    async query(sql, params = []) {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        this.events.push(normalized);
        if (/FOR UPDATE/i.test(sql)) {
            this.releaseLock = await this.store.acquire();
            this.snapshot = { ...this.store.employee };
            return [[{ ...this.store.employee }]];
        }
        if (/^SELECT EmployeeID,Password,MustChangePassword/i.test(normalized)) {
            return [[{ ...this.store.employee }]];
        }
        if (/FROM master_departments/i.test(sql)) {
            if (this.store.failMaster) throw new Error('master database unavailable');
            return [this.store.departments.map(row => ({ ...row }))];
        }
        if (/FROM master_safetyunits/i.test(sql)) {
            if (this.store.failMaster) throw new Error('master database unavailable');
            return [this.store.units.map(row => ({ ...row }))];
        }
        if (/^UPDATE employees SET Unit=/i.test(normalized)) {
            this.store.employee.Unit = params[0];
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
        this.transaction = false;
        this.releaseLock?.();
        this.releaseLock = null;
    }

    async rollback() {
        this.events.push('rollback');
        if (this.snapshot) this.store.employee = { ...this.snapshot };
        this.transaction = false;
        this.releaseLock?.();
        this.releaseLock = null;
    }
}

function requestedUnit(scenario) {
    if (scenario === 'blank') return ' \r\n ';
    if (scenario === 'wrong_department') return 'Unit B';
    if (scenario === 'invalid') return 'Unknown Unit';
    if (scenario === 'already_completed') return 'Unit C';
    return ' unit a\r\n ';
}

function stateResult(store) {
    return {
        unit: store.employee.Unit,
        otherFieldsPreserved: store.employee.EmployeeName === 'Employee One'
            && store.employee.Team === 'Team X'
            && store.employee.Position === 'Operator'
            && store.employee.Role === 'User'
            && store.employee.Password === 'stored-hash',
    };
}

async function runNodeCase(scenario) {
    const store = new SharedStore(scenario);
    const connection = new FakeConnection(store);
    let resolveStatus;
    if (scenario === 'final_stuck') {
        resolveStatus = async () => ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED;
    } else {
        resolveStatus = async receivedConnection => {
            assert.strictEqual(receivedConnection, connection);
            if (store.failMaster) throw new Error('master database unavailable');
            return resolveOnboardingState(store.employee, {
                departments: store.departments,
                units: store.units,
            });
        };
    }
    try {
        const result = await executeSafetyUnitContinuation({
            connection, employeeId: 'E001', requestedUnit: requestedUnit(scenario), resolveStatus,
        });
        return {
            outcome: 'success', status: result.status, nextAction: result.nextAction,
            idempotent: result.idempotent, profileUnit: result.employee.Unit,
            profilePosition: result.employee.Position, ...stateResult(store),
        };
    } catch (error) {
        assert.ok(error instanceof SafetyUnitContinuationError);
        return { outcome: 'error', code: error.code, httpStatus: error.httpStatus, ...stateResult(store) };
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

async function testConcurrentReplay() {
    const store = new SharedStore('canonical');
    const firstConnection = new FakeConnection(store);
    const secondConnection = new FakeConnection(store);
    const resolveStatus = async () => resolveOnboardingState(store.employee, {
        departments: store.departments, units: store.units,
    });
    const invoke = (connection, unit) => executeSafetyUnitContinuation({
        connection, employeeId: 'E001', requestedUnit: unit, resolveStatus,
    });
    const sameUnit = await Promise.all([invoke(firstConnection, 'Unit A'), invoke(secondConnection, ' unit a ')]);
    assert.strictEqual(sameUnit.filter(result => result.idempotent).length, 1);
    assert.strictEqual(store.employee.Unit, 'Unit A');

    const differentStore = new SharedStore('canonical');
    const a = new FakeConnection(differentStore);
    const c = new FakeConnection(differentStore);
    const differentResolver = async () => resolveOnboardingState(differentStore.employee, {
        departments: differentStore.departments, units: differentStore.units,
    });
    const settled = await Promise.allSettled([
        executeSafetyUnitContinuation({ connection: a, employeeId: 'E001', requestedUnit: 'Unit A', resolveStatus: differentResolver }),
        executeSafetyUnitContinuation({ connection: c, employeeId: 'E001', requestedUnit: 'Unit C', resolveStatus: differentResolver }),
    ]);
    assert.strictEqual(settled[0].status, 'fulfilled');
    assert.strictEqual(settled[1].status, 'rejected');
    assert.strictEqual(settled[1].reason.code, 'ONBOARDING_ALREADY_COMPLETED');
    assert.strictEqual(differentStore.employee.Unit, 'Unit A');
}

async function testPostCommitResponseLoss() {
    const store = new SharedStore('canonical');
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
        executeSafetyUnitContinuation({
            connection, employeeId: 'E001', requestedUnit: 'Unit A',
            resolveStatus: async () => resolveOnboardingState(store.employee, {
                departments: store.departments, units: store.units,
            }),
        }),
        error => error.code === 'ONBOARDING_STATE_UNAVAILABLE' && error.httpStatus === 503
    );
    assert.strictEqual(store.employee.Unit, 'Unit A');
    assert.ok(connection.events.includes('commit'));
    assert.ok(!connection.events.includes('rollback'));
}

function assertIntegrationContracts() {
    const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
    const server = read('backend/server.js');
    const foundation = read('api/handlers/foundation.php');
    const frontend = read('public/js/main.js');
    const nodeService = read('backend/services/safety-unit-continuation.js');
    const phpService = read('api/lib/safety_unit_continuation.php');
    const nodeRoute = server.slice(server.indexOf("app.put('/api/profile/safety-unit'"), server.indexOf("app.put('/api/profile/employee-id'"));
    const phpRoute = foundation.slice(foundation.indexOf("$path === '/profile/safety-unit'"), foundation.indexOf("$path === '/profile/employee-id'"));
    const safetyHandlerStart = frontend.indexOf('async function handleSafetyUnitGateSubmit');
    const routingStart = frontend.indexOf('// Routing (Hash-based)', safetyHandlerStart);
    const frontendHandler = frontend.slice(safetyHandlerStart, routingStart);

    assert.ok(nodeRoute.includes('executeSafetyUnitContinuation'));
    assert.ok(!nodeRoute.includes('ensureAuthSecuritySchema'));
    assert.ok(phpRoute.includes('safety_unit_continuation_execute'));
    for (const route of [nodeRoute, phpRoute]) {
        assert.ok(route.includes('Safety Unit saved successfully.'));
        assert.ok(route.includes('onboardingStatus'));
        assert.ok(route.includes('nextAction'));
        assert.ok(route.includes('idempotent'));
    }
    for (const service of [nodeService, phpService]) {
        assert.ok(service.includes('FOR UPDATE'));
        assert.ok(service.includes('INVALID_SAFETY_UNIT'));
        assert.ok(service.includes('ONBOARDING_ALREADY_COMPLETED'));
    }
    assert.ok(!frontendHandler.includes('TSHSession.logout()'));
    assert.ok(frontendHandler.includes('TSHSession.setSession(res.user, res.token)'));
    assert.ok(frontendHandler.includes('recoverSafetyUnitContinuation'));
    assert.ok(frontend.includes('async function recoverSafetyUnitContinuation'));
    assert.ok(frontend.includes('TSHSession.refreshSession({ preserveOnFailure: true })'));
}

(async () => {
    const scenarioNames = [
        'canonical', 'blank', 'wrong_department', 'invalid', 'unknown_department',
        'no_units', 'idempotent', 'already_completed', 'master_failure',
        'duplicate_master', 'password_required', 'final_stuck',
    ];
    const nodeResults = {};
    for (const scenario of scenarioNames) nodeResults[scenario] = await runNodeCase(scenario);
    const phpResults = runPhp();
    for (const scenario of scenarioNames) {
        assert.deepStrictEqual(phpResults[scenario], nodeResults[scenario], `Node/PHP mismatch: ${scenario}`);
    }
    assert.deepStrictEqual(nodeResults.canonical, {
        outcome: 'success', status: 'READY', nextAction: 'ENTER_APP', idempotent: false,
        profileUnit: 'Unit A', profilePosition: 'Operator', unit: 'Unit A', otherFieldsPreserved: true,
    });
    assert.strictEqual(nodeResults.blank.code, 'SAFETY_UNIT_VALUE_REQUIRED');
    assert.strictEqual(nodeResults.wrong_department.httpStatus, 422);
    assert.strictEqual(nodeResults.idempotent.idempotent, true);
    assert.strictEqual(nodeResults.already_completed.code, 'ONBOARDING_ALREADY_COMPLETED');
    for (const scenario of ['unknown_department', 'master_failure', 'duplicate_master', 'final_stuck']) {
        assert.strictEqual(nodeResults[scenario].code, 'ONBOARDING_STATE_UNAVAILABLE');
        assert.strictEqual(nodeResults[scenario].httpStatus, 503);
        assert.strictEqual(nodeResults[scenario].unit, '');
    }
    assert.strictEqual(phpResults.double_submit.firstIdempotent, false);
    assert.strictEqual(phpResults.double_submit.secondIdempotent, true);
    await testConcurrentReplay();
    await testPostCommitResponseLoss();
    assertIntegrationContracts();
    console.log(`Safety Unit continuation tests passed (${scenarioNames.length} Node/PHP parity cases).`);
    console.log('Canonical master save, rollback, idempotency, concurrency, fresh-session, and recovery contracts passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
