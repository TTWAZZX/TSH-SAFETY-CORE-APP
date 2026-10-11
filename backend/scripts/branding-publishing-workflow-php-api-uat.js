'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const db = require('../db');

const root = path.resolve(__dirname, '..', '..');
const port = Number(process.env.BRANDING_WORKFLOW_PHP_UAT_PORT || 5022);
const baseUrl = `http://127.0.0.1:${port}/api/index.php?route=`;
const settingKeys = ['app_branding', 'app_branding_draft', 'app_branding_versions'];
const runId = `branding-workflow-php-uat-${Date.now()}`;
const userAgent = `TSH-${runId}`;
let phpServer;
let originalRows = [];
let stderr = '';

async function api(route, { method = 'GET', token, body } = {}) {
    const response = await fetch(`${baseUrl}${route.replace(/^\//, '')}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    return { status: response.status, payload };
}

async function snapshotSettings() {
    const [rows] = await db.query(
        'SELECT key_name,value,UpdatedAt FROM App_Settings WHERE key_name IN (?,?,?) ORDER BY key_name',
        settingKeys
    );
    return rows.map(row => ({ ...row }));
}

async function restoreSettings() {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('DELETE FROM App_Settings WHERE key_name IN (?,?,?)', settingKeys);
        for (const row of originalRows) {
            await connection.query('INSERT INTO App_Settings(key_name,value,UpdatedAt) VALUES(?,?,?)', [row.key_name, row.value, row.UpdatedAt]);
        }
        await connection.query('DELETE FROM Admin_AuditLogs WHERE UserAgent=?', [userAgent]).catch(() => {});
        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        throw error;
    } finally { connection.release(); }
}

async function startPhp() {
    phpServer = spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-S', `127.0.0.1:${port}`, '-t', root], {
        cwd: root,
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
    });
    phpServer.stderr.on('data', chunk => { stderr += chunk.toString(); });
    for (let attempt = 0; attempt < 60; attempt += 1) {
        if (phpServer.exitCode !== null) throw new Error(stderr || 'PHP Branding UAT server stopped');
        try {
            const response = await fetch(`${baseUrl}public/branding`);
            if (response.status < 500) return;
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`PHP Branding UAT server did not start: ${stderr}`);
}

async function main() {
    assert.ok(process.env.JWT_SECRET, 'JWT_SECRET is required');
    await db.query(`CREATE TABLE IF NOT EXISTS App_Settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    originalRows = await snapshotSettings();
    const [[admin]] = await db.query("SELECT EmployeeID,EmployeeName,Department,Role FROM Employees WHERE LOWER(Role)='admin' ORDER BY EmployeeID LIMIT 1");
    assert.ok(admin, 'Local Admin fixture is required');
    const adminUser = { id: admin.EmployeeID, name: admin.EmployeeName, department: admin.Department, role: admin.Role };
    const adminToken = jwt.sign(adminUser, process.env.JWT_SECRET, { expiresIn: '10m' });
    const userToken = jwt.sign({ ...adminUser, role: 'User' }, process.env.JWT_SECRET, { expiresIn: '10m' });
    await startPhp();

    const initial = await api('/branding/workspace', { token: adminToken });
    assert.strictEqual(initial.status, 200, JSON.stringify(initial.payload));
    assert.ok(initial.payload?.data?.published, 'PHP published Branding workspace');
    assert.strictEqual((await api('/branding/workspace', { token: userToken })).status, 403, 'PHP non-Admin denial');

    const bypass = await api('/settings/app_branding', { method: 'PUT', token: adminToken, body: { value: { appName: `Bypass ${runId}` } } });
    assert.strictEqual(bypass.status, 409, 'PHP generic settings Branding bypass denial');
    assert.strictEqual(bypass.payload?.code, 'BRANDING_WORKFLOW_REQUIRED');

    const publicBefore = await api('/public/branding');
    const value = {
        ...initial.payload.data.published,
        appName: `PHP Draft ${runId}`,
        loginHeroTitle: `PHP ${runId}`,
        loginBackgroundFit: 'contain',
        loginBackgroundFocusX: 20,
        loginBackgroundFocusY: 80,
        loginAnnouncementEnabled: true,
        loginAnnouncementTone: 'critical',
        loginAnnouncementTitle: `PHP Notice ${runId}`,
        loginAnnouncementMessage: 'PHP local lifecycle notice',
        loginAnnouncementLinkLabel: 'Help',
        loginAnnouncementUrl: '/help',
        supportTitle: 'PHP support',
        supportEmail: 'support@example.com',
        supportPhone: '02-000-0000',
        supportHours: '08:00-17:00',
        supportLinkLabel: 'Help center',
        supportUrl: 'https://example.com/help',
    };
    const draft = await api('/branding/draft', { method: 'PUT', token: adminToken, body: { value } });
    assert.strictEqual(draft.status, 200, JSON.stringify(draft.payload));
    assert.deepStrictEqual((await api('/public/branding')).payload?.data, publicBefore.payload?.data, 'PHP Draft remains private');
    assert.strictEqual((await api('/branding/draft', { method: 'PUT', token: adminToken, body: { value, expectedDraftUpdatedAt: 'stale' } })).status, 409, 'PHP Draft conflict');
    assert.strictEqual((await api('/branding/draft', { method: 'DELETE', token: adminToken, body: { expectedDraftUpdatedAt: 'stale' } })).status, 409, 'PHP discard Draft conflict');
    assert.strictEqual((await api('/branding/publish', { method: 'POST', token: adminToken, body: { expectedDraftUpdatedAt: draft.payload.data.updatedAt } })).status, 400, 'PHP publish confirmation');

    const published = await api('/branding/publish', { method: 'POST', token: adminToken, body: { confirmation: 'PUBLISH_BRANDING', expectedDraftUpdatedAt: draft.payload.data.updatedAt, note: runId } });
    assert.strictEqual(published.status, 200, JSON.stringify(published.payload));
    assert.strictEqual(published.payload.data.draft, null);
    const firstVersionId = published.payload.data.activeVersionId;
    const publicPublished = await api('/public/branding');
    assert.strictEqual(publicPublished.payload?.data?.appName, value.appName, 'PHP Publish reaches Login');
    assert.strictEqual(publicPublished.payload?.data?.loginBackgroundFit, 'contain', 'PHP full-image fit reaches Login');
    assert.strictEqual(publicPublished.payload?.data?.loginAnnouncementTitle, value.loginAnnouncementTitle, 'PHP announcement reaches Login');
    assert.strictEqual(publicPublished.payload?.data?.supportEmail, value.supportEmail, 'PHP support channel reaches Login');

    const secondDraft = await api('/branding/draft', { method: 'PUT', token: adminToken, body: { value: { ...value, appName: `PHP Second ${runId}` } } });
    const second = await api('/branding/publish', { method: 'POST', token: adminToken, body: { confirmation: 'PUBLISH_BRANDING', expectedDraftUpdatedAt: secondDraft.payload.data.updatedAt } });
    assert.strictEqual(second.status, 200, JSON.stringify(second.payload));
    assert.notStrictEqual(second.payload.data.activeVersionId, firstVersionId, 'PHP immutable version IDs');
    assert.strictEqual((await api(`/branding/versions/${firstVersionId}/rollback`, { method: 'POST', token: adminToken, body: { confirmation: 'ROLLBACK_BRANDING', expectedActiveVersionId: 'stale' } })).status, 409, 'PHP rollback conflict');
    const rollback = await api(`/branding/versions/${firstVersionId}/rollback`, { method: 'POST', token: adminToken, body: { confirmation: 'ROLLBACK_BRANDING', expectedActiveVersionId: second.payload.data.activeVersionId, note: runId } });
    assert.strictEqual(rollback.status, 200, JSON.stringify(rollback.payload));
    assert.notStrictEqual(rollback.payload.data.activeVersionId, firstVersionId, 'PHP rollback creates a new version');
    assert.strictEqual(rollback.payload.data.versions[0].restoredFromVersionId, firstVersionId, 'PHP rollback lineage');
    assert.strictEqual((await api('/public/branding')).payload?.data?.appName, value.appName, 'PHP rollback reaches Login');
    assert.strictEqual((await api('/public/branding')).payload?.data?.loginBackgroundFit, 'contain', 'PHP rollback restores full-image fit');

    console.log('PASS Branding Draft/Publish/Version/Rollback PHP API lifecycle');
}

main().catch(error => {
    console.error(error);
    if (stderr) console.error(stderr);
    process.exitCode = 1;
}).finally(async () => {
    try { await restoreSettings(); } catch (error) {
        console.error('PHP Branding settings restore failed:', error);
        process.exitCode = 1;
    }
    if (phpServer && phpServer.exitCode === null) phpServer.kill();
    try {
        assert.deepStrictEqual(await snapshotSettings(), originalRows, 'PHP Branding setting rows restored byte-for-byte');
        console.log('PASS PHP Branding UAT cleanup: original App_Settings rows restored and test Audit rows removed');
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
    await db.end();
});
