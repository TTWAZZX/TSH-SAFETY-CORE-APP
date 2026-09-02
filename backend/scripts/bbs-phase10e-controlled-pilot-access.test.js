'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    BBS_ROLLOUT_MODE,
    resolveBbsRolloutMode,
    isEffectivePilotParticipant,
    createBbsRolloutAccessMiddleware,
} = require('../services/bbs-rollout-access');

const root = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(root, 'backend/migrations/20260901_bbs_phase10e_controlled_pilot_access.sql'), 'utf8');
const nodeService = fs.readFileSync(path.join(root, 'backend/services/bbs-rollout-access.js'), 'utf8');
const phpService = fs.readFileSync(path.join(root, 'api/lib/bbs_rollout_access.php'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const phpIndex = fs.readFileSync(path.join(root, 'api/index.php'), 'utf8');

assert.strictEqual(resolveBbsRolloutMode({ staged_admin_only: '1', pilot_scope_only: '1' }), BBS_ROLLOUT_MODE.ADMIN_ONLY);
assert.strictEqual(resolveBbsRolloutMode({ staged_admin_only: '0', pilot_scope_only: '1' }), BBS_ROLLOUT_MODE.CONTROLLED_PILOT);
assert.strictEqual(resolveBbsRolloutMode({ staged_admin_only: '0', pilot_scope_only: '0' }), BBS_ROLLOUT_MODE.COMPANY_WIDE);

const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
for (const fixture of [
    [{ staged_admin_only: '1', pilot_scope_only: '1' }, 'admin_only'],
    [{ staged_admin_only: '0', pilot_scope_only: '1' }, 'controlled_pilot'],
    [{ staged_admin_only: '0', pilot_scope_only: '0' }, 'company_wide'],
]) {
    const result = spawnSync(php, [path.join(root, 'api/tests/bbs_rollout_access_fixture_runner.php')], {
        input: JSON.stringify({ settings: fixture[0] }), encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(JSON.parse(result.stdout).mode, fixture[1]);
}

assert.match(migration, /'pilot_scope_only'\s*,\s*'0'/);
assert.doesNotMatch(migration, /\b(?:DELETE|DROP|TRUNCATE|ALTER)\b/i);
assert.match(nodeService, /BBS_PILOT_ACCESS_REQUIRED/);
assert.match(phpService, /BBS_PILOT_ACCESS_REQUIRED/);
assert.match(nodeService, /BBS_Inspector_Enrollments/);
assert.match(nodeService, /BBS_Hierarchy_Assignments/);
assert.match(nodeService, /BBS_Pilot_Scopes/);
assert.match(phpService, /BBS_Inspector_Enrollments/);
assert.match(phpService, /BBS_Hierarchy_Assignments/);
assert.match(phpService, /BBS_Pilot_Scopes/);
assert.match(server, /createBbsRolloutAccessMiddleware\(pool\)/);
assert.match(phpIndex, /bbs_enforce_rollout_access\(\)/);

(async () => {
    const participantDb = {
        async query(sql, params) {
            assert.match(sql, /BBS_Pilot_Scopes/);
            assert.strictEqual(params.length, 8);
            return [[{ permitted: 1 }]];
        },
    };
    const deniedDb = { async query() { return [[]]; } };
    assert.strictEqual(await isEffectivePilotParticipant(participantDb, '002671', '2026-09-01'), true);
    assert.strictEqual(await isEffectivePilotParticipant(deniedDb, '111111', '2026-09-01'), false);
    assert.strictEqual(await isEffectivePilotParticipant(deniedDb, '', '2026-09-01'), false);

    const response = () => ({
        statusCode: 200,
        headers: {},
        payload: null,
        setHeader(key, value) { this.headers[key] = value; },
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    });
    const middlewareDb = {
        async query(sql) {
            if (sql.includes('BBS_Settings')) return [[{ SettingKey: 'staged_admin_only', SettingValue: '0' }, { SettingKey: 'pilot_scope_only', SettingValue: '1' }]];
            throw new Error('Unexpected query');
        },
    };
    const authenticate = (req, _res, next) => { req.user = req.fixtureUser; return next(); };
    const requireAdmin = (req, res, next) => String(req.user?.role).toLowerCase() === 'admin'
        ? next()
        : res.status(403).json({ success: false });
    for (const fixture of [
        [{ id: 'ADMIN', role: 'Admin' }, false, true, 200],
        [{ id: '002671', role: 'User' }, true, true, 200],
        [{ id: '111111', role: 'User' }, false, false, 403],
    ]) {
        let nextCalled = false;
        const req = { fixtureUser: fixture[0] };
        const res = response();
        const middleware = createBbsRolloutAccessMiddleware(middlewareDb, {
            authenticateToken: authenticate,
            isAdmin: requireAdmin,
            isEffectivePilotParticipant: async () => fixture[1],
        });
        await middleware(req, res, error => { if (error) throw error; nextCalled = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(nextCalled, fixture[2]);
        assert.strictEqual(res.statusCode, fixture[3]);
        assert.strictEqual(res.headers['X-BBS-Rollout-Mode'], 'controlled-pilot');
        if (!fixture[2]) assert.strictEqual(res.payload.code, 'BBS_PILOT_ACCESS_REQUIRED');
    }
    console.log('BBS Phase 10E controlled Pilot access parity/security contract: PASS');
    process.exit(0);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
