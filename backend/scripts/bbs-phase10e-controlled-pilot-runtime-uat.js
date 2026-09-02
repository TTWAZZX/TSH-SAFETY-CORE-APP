'use strict';

const jwt = require('jsonwebtoken');
const db = require('../db');
const { loadReadyEmployees } = require('./ready-test-users');

const tokenFor = payload => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });

async function call(base, path, token, options = {}) {
    const response = await fetch(`${base}${path}`, {
        method: options.method || 'GET',
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body, mode: response.headers.get('x-bbs-rollout-mode') };
}

(async () => {
    const [settingRows] = await db.query(
        "SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('staged_admin_only','pilot_scope_only')"
    );
    const original = Object.fromEntries(settingRows.map(row => [row.SettingKey, String(row.SettingValue)]));
    let server;
    try {
        const ready = await loadReadyEmployees(db);
        const admin = ready.find(row => String(row.role).toLowerCase() === 'admin');
        const inspector = ready.find(row => row.id === '002671');
        const excluded = ready.find(row => row.id === '111111');
        if (!admin || !inspector || !excluded) throw new Error('Controlled Pilot UAT requires READY Admin, 002671 and 111111 accounts.');

        const app = require('../server');

        await db.query("UPDATE BBS_Settings SET SettingValue='0' WHERE SettingKey='staged_admin_only'");
        await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='pilot_scope_only'");

        server = app.listen(0, '127.0.0.1');
        await new Promise(resolve => server.once('listening', resolve));
        const base = `http://127.0.0.1:${server.address().port}/api`;
        const results = [
            ['Admin context', await call(base, '/bbs/me/context', tokenFor(admin)), 200],
            ['Approved inspector context', await call(base, '/bbs/me/context', tokenFor(inspector)), 200],
            ['Excluded same-scope account', await call(base, '/bbs/me/context', tokenFor(excluded)), 403],
            ['Pilot cannot use Admin API', await call(base, '/bbs/admin/foundation', tokenFor(inspector)), 403],
            ['Anonymous shared QR blocked during Pilot', await call(base, '/bbs/qr/resolve', null, { method: 'POST', body: { token: 'invalid' } }), 401],
        ];
        for (const [name, result, expected] of results) {
            if (result.status !== expected) throw new Error(`${name}: expected ${expected}, received ${result.status}`);
            if (result.mode !== 'controlled-pilot') throw new Error(`${name}: rollout response header is missing.`);
            if (name.startsWith('Excluded') && result.body.code !== 'BBS_PILOT_ACCESS_REQUIRED') {
                throw new Error(`${name}: expected BBS_PILOT_ACCESS_REQUIRED.`);
            }
        }
        console.log(JSON.stringify(results.map(([name, result, expected]) => ({ name, status: result.status, expected, mode: result.mode })), null, 2));
        console.log('BBS Phase 10E controlled Pilot runtime UAT: PASS');
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await db.query(
            `INSERT INTO BBS_Settings (SettingKey,SettingValue) VALUES ('staged_admin_only',?),('pilot_scope_only',?)
             ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue)`,
            [original.staged_admin_only || '1', original.pilot_scope_only || '0']
        ).catch(error => console.error('CRITICAL: failed to restore rollout settings:', error.message));
        await db.end().catch(() => {});
    }
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
