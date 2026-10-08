'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const root = path.resolve(__dirname, '..', '..');
const stamp = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
const names = {
    node: `tsh_safety_vote_phase1_node_${stamp}`,
    php: `tsh_safety_vote_phase1_php_${stamp}`,
};
const guard = /^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/;
const migrations = [
    '20261008_safety_vote_phase1_foundation.sql',
    '20261008_safety_vote_phase2_core_mvp.sql',
    '20261008_safety_vote_phase3_survey_submission.sql',
    '20261008_safety_vote_phase4_jury_scoring.sql',
    '20261008_safety_vote_phase5_operations.sql',
    '20261008_safety_vote_phase6_secret_election.sql',
    '20261008_safety_vote_phase7_integrations_governance.sql',
];
const children = [];
let admin;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function wait(url) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { Authorization: 'Bearer sv-admin' } });
            if (response.ok) return;
        } catch {}
        await sleep(150);
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function call(base, route, { method = 'GET', token = 'sv-admin', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { status: response.status, data, text };
}

async function seed(name) {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: name,
        multipleStatements: true,
    });
    try {
        await db.query('CREATE TABLE Admin_RolePermissions(role VARCHAR(50),permission VARCHAR(100),granted TINYINT,PRIMARY KEY(role,permission))');
        for (let phase = 0; phase < migrations.length; phase += 1) {
            const sql = fs.readFileSync(path.join(root, 'backend', 'migrations', migrations[phase]), 'utf8');
            await db.query(sql);
            const [[moduleSetting]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='module_enabled'");
            assert.strictEqual(moduleSetting.SettingValue, '0', `Phase ${phase + 1} must finish with module disabled`);
            if (phase === 0) {
                await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='module_enabled'");
                await db.query(sql);
                const [[reapplied]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='module_enabled'");
                assert.strictEqual(reapplied.SettingValue, '0', 'Phase 1 reapply must fail closed');
            }
            if (phase < migrations.length - 1) {
                await db.query("UPDATE SafetyVote_Settings SET SettingValue='1' WHERE SettingKey='module_enabled'");
            }
        }
        const [[integrationSetting]] = await db.query("SELECT SettingValue FROM SafetyVote_Settings WHERE SettingKey='phase7_integrations_enabled'");
        assert.strictEqual(integrationSetting.SettingValue, '0', 'Phase 7 integrations must finish disabled');
    } finally {
        await db.end();
    }
}

async function verifyStack(label, base, name) {
    const unauthenticated = await call(base, '/admin/health', { token: '' });
    assert.strictEqual(unauthenticated.status, 401, `${label} health must remain authenticated`);

    const health = await call(base, '/admin/health');
    assert.strictEqual(health.status, 200, `${label} health must remain available`);
    assert.strictEqual(health.data?.data?.moduleEnabled, false, `${label} health must report disabled`);

    const preflight = await call(base, '/admin/campaigns/1/release-preflight');
    assert.strictEqual(preflight.status, 404, `${label} read-only preflight must pass the disabled gate`);
    assert.notStrictEqual(preflight.data?.code, 'SAFETY_VOTE_MODULE_DISABLED');

    const probes = [
        await call(base, '/admin/campaigns'),
        await call(base, '/admin/integrations/catalog'),
        await call(base, '/campaigns/1'),
        await call(base, '/campaigns/1/ballot/submit', {
            method: 'POST',
            token: 'sv-user',
            body: { campaignVersion: 1, acknowledgedRules: true, answers: [] },
        }),
    ];
    for (const probe of probes) {
        assert.strictEqual(probe.status, 503, `${label} operational route must fail closed`);
        assert.strictEqual(probe.data?.code, 'SAFETY_VOTE_MODULE_DISABLED', `${label} disabled code parity`);
    }

    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: name,
    });
    try {
        const [[counts]] = await db.query('SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots) ballots,(SELECT COUNT(*) FROM SafetyVote_Participation) participation,(SELECT COUNT(*) FROM SafetyVote_RequestKeys) requestKeys');
        assert.deepStrictEqual([Number(counts.ballots), Number(counts.participation), Number(counts.requestKeys)], [0, 0, 0], `${label} disabled bypass must leave zero ballot residue`);
    } finally {
        await db.end();
    }
}

async function main() {
    assert.ok(new Set(['localhost', '127.0.0.1', '::1']).has(String(process.env.DB_HOST || '').trim().toLowerCase()), 'Refusing non-loopback DB_HOST');
    admin = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
    });
    for (const name of Object.values(names)) {
        assert.ok(guard.test(name));
        await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await seed(name);
    }

    const nodePort = 5111;
    const phpPort = 5112;
    const commonEnv = { ...process.env, SAFETY_VOTE_FIXTURE_KEEP_DISABLED: '1' };
    children.push(spawn(process.execPath, [path.join(__dirname, 'safety-vote-phase1-node-fixture-host.js')], {
        cwd: root,
        env: { ...commonEnv, DB_NAME: names.node, SAFETY_VOTE_FIXTURE_DB: names.node, SAFETY_VOTE_FIXTURE_PORT: String(nodePort) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    }));
    children.push(spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${phpPort}`, path.join(__dirname, 'safety-vote-phase1-php-router.php')], {
        cwd: root,
        env: { ...commonEnv, DB_NAME: names.php },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    }));
    await Promise.all([
        wait(`http://127.0.0.1:${nodePort}/__ready`),
        wait(`http://127.0.0.1:${phpPort}/__ready`),
    ]);
    await verifyStack('node', `http://127.0.0.1:${nodePort}/api/safety-vote`, names.node);
    await verifyStack('php', `http://127.0.0.1:${phpPort}/api/safety-vote`, names.php);
    console.log('Safety Vote Phase 8.3.1 disabled-mode Node/PHP parity: PASS');
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
}).finally(async () => {
    for (const child of children) if (child.exitCode === null) child.kill();
    await sleep(250);
    if (admin) {
        for (const name of Object.values(names)) {
            if (guard.test(name)) await admin.query(`DROP DATABASE IF EXISTS \`${name}\``).catch(() => {});
        }
        for (const name of Object.values(names)) {
            const [[row]] = await admin.query('SELECT COUNT(*) count FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=?', [name]);
            assert.strictEqual(Number(row.count), 0, `Disposable database residue: ${name}`);
        }
        await admin.end();
    }
});
