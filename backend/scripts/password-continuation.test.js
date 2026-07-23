'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ONBOARDING_STATUS, OnboardingResolutionError } = require('../utils/onboarding-resolver');
const {
    PasswordContinuationError,
    executePasswordContinuation,
} = require('../services/password-continuation');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'password_continuation_runner.php');

class SharedEmployeeStore {
    constructor() {
        this.employee = {
            EmployeeID: 'E001', EmployeeName: 'Employee One', Department: 'Production', Unit: '',
            Team: 'A', Position: 'Operator', Role: 'User', Password: 'hash:oldpass', MustChangePassword: 1,
        };
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
        this.transaction = false;
        this.locked = false;
        this.releaseLock = null;
        this.snapshot = null;
        this.events = [];
    }

    async beginTransaction() {
        this.transaction = true;
        this.events.push('begin');
    }

    async query(sql, params) {
        this.events.push(sql.replace(/\s+/g, ' ').trim());
        if (/FOR UPDATE/i.test(sql)) {
            this.releaseLock = await this.store.acquire();
            this.locked = true;
            this.snapshot = { ...this.store.employee };
            return [[{ ...this.store.employee }]];
        }
        if (/^UPDATE employees/i.test(sql.trim())) {
            this.store.employee.Password = params[0];
            this.store.employee.MustChangePassword = 0;
            return [{ affectedRows: 1 }];
        }
        if (/^SELECT EmployeeID/i.test(sql.trim())) {
            const fresh = { ...this.store.employee };
            delete fresh.Password;
            return [[fresh]];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
    }

    async commit() {
        this.events.push('commit');
        this.transaction = false;
        if (this.locked) this.releaseLock?.();
        this.locked = false;
        this.releaseLock = null;
    }

    async rollback() {
        this.events.push('rollback');
        if (this.snapshot) this.store.employee = { ...this.snapshot };
        this.transaction = false;
        if (this.locked) this.releaseLock?.();
        this.locked = false;
        this.releaseLock = null;
    }
}

const comparePassword = async (plain, hash) => hash === `hash:${plain}`;
const hashPassword = async plain => `hash:${plain}`;

async function runNodeCase(name) {
    const store = new SharedEmployeeStore();
    const connection = new FakeConnection(store);
    const currentPassword = name === 'wrong_current' ? 'incorrect' : 'oldpass';
    const newPassword = name === 'reuse' ? 'oldpass' : (name === 'short' ? 'abc' : 'newpass');
    let status = name === 'safety' ? ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED : ONBOARDING_STATUS.READY;
    const resolveStatus = async receivedConnection => {
        assert.strictEqual(receivedConnection, connection, 'resolver must use the transaction connection');
        if (name === 'resolver_failure') throw new Error('master read failed');
        if (name === 'unknown_department') {
            throw new OnboardingResolutionError('UNKNOWN_DEPARTMENT', 'unknown');
        }
        if (name === 'password_state_stuck') return ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED;
        return status;
    };

    try {
        const result = await executePasswordContinuation({
            connection, employeeId: 'E001', currentPassword, newPassword,
            comparePassword, hashPassword, resolveStatus,
        });
        return {
            outcome: 'success', status: result.status, nextAction: result.nextAction,
            mustChangePassword: store.employee.MustChangePassword,
            newPasswordStored: store.employee.Password === 'hash:newpass',
            oldPasswordStored: store.employee.Password === 'hash:oldpass',
        };
    } catch (error) {
        assert.ok(error instanceof PasswordContinuationError);
        return {
            outcome: 'error', code: error.code, httpStatus: error.httpStatus,
            mustChangePassword: store.employee.MustChangePassword,
            newPasswordStored: store.employee.Password === 'hash:newpass',
            oldPasswordStored: store.employee.Password === 'hash:oldpass',
        };
    }
}

function runPhp() {
    const candidates = [
        process.env.PHP_BIN,
        process.platform === 'win32' ? 'C:\\xampp\\php\\php.exe' : null,
        'php',
    ].filter(Boolean);
    for (const executable of [...new Set(candidates)]) {
        const run = spawnSync(executable, [phpRunner], { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
        if (run.error?.code === 'ENOENT') continue;
        if (run.error) throw run.error;
        assert.strictEqual(run.status, 0, run.stderr || `PHP runner exited ${run.status}`);
        return JSON.parse(run.stdout).results;
    }
    throw new Error('PHP executable was not found.');
}

async function testConcurrentDoubleSubmit() {
    const store = new SharedEmployeeStore();
    const firstConnection = new FakeConnection(store);
    const secondConnection = new FakeConnection(store);
    let firstResolver = true;
    const resolveStatus = async () => {
        if (firstResolver) {
            firstResolver = false;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        return ONBOARDING_STATUS.READY;
    };
    const invoke = connection => executePasswordContinuation({
        connection, employeeId: 'E001', currentPassword: 'oldpass', newPassword: 'newpass',
        comparePassword, hashPassword, resolveStatus,
    });
    const settled = await Promise.allSettled([invoke(firstConnection), invoke(secondConnection)]);
    assert.strictEqual(settled.filter(item => item.status === 'fulfilled').length, 1);
    const rejected = settled.find(item => item.status === 'rejected');
    assert.strictEqual(rejected.reason.code, 'CURRENT_PASSWORD_INVALID');
    assert.strictEqual(store.employee.Password, 'hash:newpass');
    assert.strictEqual(store.employee.MustChangePassword, 0);
    assert.ok(firstConnection.events.some(event => /FOR UPDATE/.test(event)));
}

async function testPostCommitResponseLoss() {
    const store = new SharedEmployeeStore();
    const connection = new FakeConnection(store);
    const originalQuery = connection.query.bind(connection);
    let profileReadCount = 0;
    connection.query = async (sql, params) => {
        if (/^SELECT EmployeeID/i.test(sql.trim()) && !/FOR UPDATE/i.test(sql)) {
            profileReadCount += 1;
            if (profileReadCount === 2) throw new Error('connection lost after commit');
        }
        return originalQuery(sql, params);
    };
    await assert.rejects(
        executePasswordContinuation({
            connection, employeeId: 'E001', currentPassword: 'oldpass', newPassword: 'newpass',
            comparePassword, hashPassword,
            resolveStatus: async () => ONBOARDING_STATUS.READY,
        }),
        error => error.code === 'ONBOARDING_STATE_UNAVAILABLE' && error.httpStatus === 503
    );
    assert.strictEqual(store.employee.Password, 'hash:newpass');
    assert.strictEqual(store.employee.MustChangePassword, 0);
    assert.ok(connection.events.includes('commit'));
    assert.ok(!connection.events.includes('rollback'), 'a completed commit must not be rolled back locally');
}

function assertIntegrationContracts() {
    const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
    const server = read('backend/server.js');
    const foundation = read('api/handlers/foundation.php');
    const frontend = read('public/js/main.js');
    const session = read('public/js/session.js');
    const api = read('public/js/api.js');
    const handler = frontend.slice(frontend.indexOf('async function handleChangePassword'), frontend.indexOf('async function handleLogin'));

    for (const source of [server, foundation]) {
        assert.ok(source.includes('Password changed successfully.'));
        assert.ok(source.includes('executePasswordContinuation') || source.includes('password_continuation_execute'));
        assert.ok(source.includes('nextAction'));
        assert.ok(source.includes('onboardingStatus'));
    }
    assert.ok(server.includes('pool.getConnection()') && server.includes('executePasswordContinuation'));
    assert.ok(!foundation.slice(0, foundation.indexOf("$path === '/register/status'")).includes('ensure_auth_security_schema'));
    assert.ok(!handler.includes('TSHSession.logout()'), 'password continuation must not log out');
    assert.ok(handler.includes('TSHSession.setSession(res.user, res.token)'));
    assert.ok(handler.includes("res.nextAction === 'SELECT_SAFETY_UNIT'"));
    assert.ok(frontend.includes('recoverPasswordContinuation'));
    assert.ok(handler.includes('await recoverPasswordContinuation()'));
    assert.ok(session.includes('preserveOnFailure') && session.includes('refreshSession'));
    assert.ok(api.includes("data?.code === 'CURRENT_PASSWORD_INVALID'"));
    assert.ok(frontend.includes("apiFetch('/onboarding/status')"));
}

(async () => {
    const scenarioNames = ['ready', 'safety', 'wrong_current', 'reuse', 'short', 'resolver_failure', 'unknown_department', 'password_state_stuck'];
    const nodeResults = {};
    for (const name of scenarioNames) nodeResults[name] = await runNodeCase(name);
    const phpResults = runPhp();
    for (const name of scenarioNames) {
        assert.deepStrictEqual(phpResults[name], nodeResults[name], `Node/PHP mismatch: ${name}`);
    }

    assert.deepStrictEqual(nodeResults.ready, {
        outcome: 'success', status: 'READY', nextAction: 'ENTER_APP',
        mustChangePassword: 0, newPasswordStored: true, oldPasswordStored: false,
    });
    assert.strictEqual(nodeResults.safety.nextAction, 'SELECT_SAFETY_UNIT');
    assert.strictEqual(nodeResults.reuse.code, 'PASSWORD_REUSE_NOT_ALLOWED');
    assert.strictEqual(nodeResults.reuse.httpStatus, 409);
    for (const name of ['resolver_failure', 'unknown_department', 'password_state_stuck']) {
        assert.strictEqual(nodeResults[name].code, 'ONBOARDING_STATE_UNAVAILABLE');
        assert.strictEqual(nodeResults[name].httpStatus, 503);
        assert.strictEqual(nodeResults[name].oldPasswordStored, true, `${name} must roll back`);
        assert.strictEqual(nodeResults[name].mustChangePassword, 1, `${name} must restore the password gate`);
    }
    assert.strictEqual(phpResults.double_submit.second.code, 'CURRENT_PASSWORD_INVALID');
    assert.strictEqual(phpResults.double_submit.state.newPasswordStored, true);

    await testConcurrentDoubleSubmit();
    await testPostCommitResponseLoss();
    assertIntegrationContracts();
    console.log(`Password continuation tests passed (${scenarioNames.length} Node/PHP parity cases).`);
    console.log('Rollback, password reuse, concurrent double submit, fresh-session, and recovery contracts passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
