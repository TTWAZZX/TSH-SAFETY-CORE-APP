'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ONBOARDING_STATUS, OnboardingResolutionError } = require('../utils/onboarding-resolver');
const {
    onboardingRequestKey,
    onboardingBlock,
    createOnboardingEnforcement,
} = require('../middleware/onboarding');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'onboarding_enforcement_runner.php');

const cases = [
    { name: 'password blocks business API', status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED, method: 'GET', path: '/api/dashboard' },
    { name: 'password blocks Safety Unit save', status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED, method: 'PUT', path: '/api/profile/safety-unit' },
    { name: 'password allows change password', status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED, method: 'POST', path: '/api/change-password' },
    { name: 'password allows session verify', status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED, method: 'POST', path: '/api/session/verify?refresh=1' },
    { name: 'password allows status', status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED, method: 'GET', path: '/api/onboarding/status/' },
    { name: 'safety blocks business API', status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED, method: 'POST', path: '/api/ky' },
    { name: 'safety blocks profile mutation', status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED, method: 'PUT', path: '/api/profile' },
    { name: 'safety allows Safety Unit save', status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED, method: 'PUT', path: '/api/profile/safety-unit' },
    { name: 'safety allows change password', status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED, method: 'POST', path: '/api/change-password' },
    { name: 'ready allows business API', status: ONBOARDING_STATUS.READY, method: 'DELETE', path: '/api/patrol/issue/7' },
    { name: 'invalid state fails closed', status: 'UNKNOWN', method: 'GET', path: '/api/onboarding/status' },
];

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
        });
        if (run.error?.code === 'ENOENT') continue;
        if (run.error) throw run.error;
        assert.strictEqual(run.status, 0, run.stderr || `PHP enforcement runner exited ${run.status}`);
        return JSON.parse(run.stdout);
    }
    throw new Error('PHP executable was not found.');
}

function nodeDecisions() {
    return cases.map(testCase => ({
        name: testCase.name,
        requestKey: onboardingRequestKey(testCase.method, testCase.path),
        block: onboardingBlock(testCase.status, testCase.method, testCase.path),
    }));
}

async function invokeMiddleware({ status, method = 'GET', path = '/api/dashboard', user, error }) {
    const queryable = { query: async () => { throw new Error('The injected resolver must own test database behavior.'); } };
    const calls = [];
    const middleware = createOnboardingEnforcement({
        queryable,
        resolveStatus: async (receivedDb, employeeId) => {
            calls.push({ receivedDb, employeeId });
            if (error) throw error;
            return status;
        },
    });
    const req = {
        user: user || { id: 'E001', mustChangePassword: false, unit: 'Stale Unit' },
        method,
        originalUrl: path,
    };
    const result = { nextCalled: false, statusCode: null, payload: null, req, calls, queryable };
    const res = {
        status(code) { result.statusCode = code; return this; },
        json(payload) { result.payload = payload; return payload; },
    };
    await middleware(req, res, () => { result.nextCalled = true; });
    return result;
}

function assertIntegrationContracts() {
    const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
    const auth = read('backend/middleware/auth.js');
    const server = read('backend/server.js');
    const bootstrap = read('api/bootstrap.php');
    const foundation = read('api/handlers/foundation.php');
    const phpIndex = read('api/index.php');

    assert.ok(auth.includes('enforceCurrentOnboarding(req, res, next)'), 'Node auth must call database-backed onboarding enforcement.');
    assert.ok(!auth.includes('user.mustChangePassword'), 'Node auth must not trust onboarding state from JWT.');
    assert.ok(server.includes("app.get('/api/onboarding/status', authenticateToken"), 'Node onboarding status endpoint must be authenticated.');
    assert.ok(server.includes('status: req.onboardingStatus') && server.includes('FROM Employees WHERE EmployeeID=? LIMIT 1'), 'Node session verify must use database state.');
    assert.ok(server.includes("app.post('/api/login', async"), 'Node login must remain public.');

    assert.ok(bootstrap.includes('onboarding_resolve_employee(db(), $employeeId)'), 'PHP auth must resolve onboarding from the database.');
    assert.ok(!bootstrap.includes("!empty($user['mustChangePassword'])"), 'PHP auth must not trust onboarding state from JWT.');
    assert.ok(foundation.includes("$path === '/onboarding/status'") && foundation.includes("'status' => $user['onboardingStatus']"), 'PHP status endpoint contract is missing.');
    assert.ok(phpIndex.includes('FROM employees WHERE EmployeeID=? LIMIT 1') && phpIndex.includes("'status' => $decoded['onboardingStatus']"), 'PHP session verify must use database state.');
}

(async () => {
    const node = nodeDecisions();
    const php = runPhp({ cases });
    assert.deepStrictEqual(php.results, node, 'Node/PHP enforcement decisions must match.');

    const stalePasswordToken = await invokeMiddleware({
        status: ONBOARDING_STATUS.PASSWORD_CHANGE_REQUIRED,
        user: { id: 'E001', mustChangePassword: false, unit: 'Unit A' },
    });
    assert.strictEqual(stalePasswordToken.nextCalled, false);
    assert.strictEqual(stalePasswordToken.statusCode, 428);
    assert.deepStrictEqual(stalePasswordToken.payload, {
        success: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        onboardingStatus: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Password change is required before using the system.',
    });
    assert.strictEqual(stalePasswordToken.calls[0].employeeId, 'E001');
    assert.strictEqual(stalePasswordToken.calls[0].receivedDb, stalePasswordToken.queryable);

    const staleUnitToken = await invokeMiddleware({ status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED });
    assert.strictEqual(staleUnitToken.statusCode, 428);
    assert.strictEqual(staleUnitToken.payload.code, 'SAFETY_UNIT_REQUIRED');

    const safetySave = await invokeMiddleware({
        status: ONBOARDING_STATUS.SAFETY_UNIT_REQUIRED,
        method: 'PUT',
        path: '/api/profile/safety-unit',
    });
    assert.strictEqual(safetySave.nextCalled, true);

    const ready = await invokeMiddleware({ status: ONBOARDING_STATUS.READY });
    assert.strictEqual(ready.nextCalled, true);

    for (const error of [
        new OnboardingResolutionError('UNKNOWN_DEPARTMENT', 'unknown'),
        new OnboardingResolutionError('DATABASE_READ_FAILED', 'offline'),
    ]) {
        const failed = await invokeMiddleware({ error });
        assert.strictEqual(failed.nextCalled, false);
        assert.strictEqual(failed.statusCode, 503);
        assert.deepStrictEqual(failed.payload, {
            success: false,
            code: 'ONBOARDING_STATE_UNAVAILABLE',
            message: 'Unable to verify onboarding state.',
        });
    }

    assertIntegrationContracts();
    console.log(`Onboarding enforcement tests passed (${cases.length} parity cases).`);
    console.log('Direct API bypass, stale JWT, allowlist, and fail-closed checks passed.');
    console.log('Node/PHP enforcement parity and integration contracts passed.');
})().catch(error => {
    console.error(error.stack || error);
    process.exit(1);
});
