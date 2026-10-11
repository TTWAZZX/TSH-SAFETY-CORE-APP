'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

const port = Number(process.env.BRANDING_WORKFLOW_UAT_PORT || 5021);
const baseUrl = `http://127.0.0.1:${port}/api`;
const settingKeys = ['app_branding', 'app_branding_draft', 'app_branding_versions'];
const runId = `branding-workflow-uat-${Date.now()}`;
const userAgent = `TSH-${runId}`;
let server;
let originalRows = [];

async function api(path, { method = 'GET', token, body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
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
            await connection.query(
                'INSERT INTO App_Settings(key_name,value,UpdatedAt) VALUES(?,?,?)',
                [row.key_name, row.value, row.UpdatedAt]
            );
        }
        await connection.query('DELETE FROM Admin_AuditLogs WHERE UserAgent=?', [userAgent]).catch(() => {});
        await connection.commit();
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        throw error;
    } finally { connection.release(); }
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
    server = await new Promise(resolve => {
        const instance = app.listen(port, '127.0.0.1', () => resolve(instance));
    });

    const initial = await api('/branding/workspace', { token: adminToken });
    assert.strictEqual(initial.status, 200, 'Admin workspace');
    assert.ok(initial.payload?.data?.published, 'Published Branding exists in workspace');

    const denied = await api('/branding/workspace', { token: userToken });
    assert.strictEqual(denied.status, 403, 'Non-Admin workspace denial');

    const bypassDenied = await api('/settings/app_branding', {
        method: 'PUT', token: adminToken, body: { value: { appName: `Bypass ${runId}` } },
    });
    assert.strictEqual(bypassDenied.status, 409, 'Generic settings Branding bypass denial');
    assert.strictEqual(bypassDenied.payload?.code, 'BRANDING_WORKFLOW_REQUIRED', 'Generic settings bypass code');

    const publicBefore = await api('/public/branding');
    assert.strictEqual(publicBefore.status, 200, 'Public Branding before Draft');

    const firstDraftValue = {
        ...initial.payload.data.published,
        appName: `Draft ${runId}`,
        loginHeroTitle: `First ${runId}`,
        loginBackgroundFit: 'contain',
        loginBackgroundFocusX: 25,
        loginBackgroundFocusY: 75,
        loginAnnouncementEnabled: true,
        loginAnnouncementTone: 'warning',
        loginAnnouncementTitle: `Notice ${runId}`,
        loginAnnouncementMessage: 'Privacy-safe local lifecycle notice',
        loginAnnouncementStartAt: '',
        loginAnnouncementEndAt: '',
        loginAnnouncementLinkLabel: 'Help',
        loginAnnouncementUrl: '/help',
        supportTitle: 'Local support',
        supportEmail: 'support@example.com',
        supportPhone: '02-000-0000',
        supportHours: '08:00-17:00',
        supportLinkLabel: 'Help center',
        supportUrl: 'https://example.com/help',
    };
    const firstDraft = await api('/branding/draft', { method: 'PUT', token: adminToken, body: { value: firstDraftValue } });
    assert.strictEqual(firstDraft.status, 200, 'Save Draft');
    assert.strictEqual(firstDraft.payload.data.value.appName, firstDraftValue.appName, 'Draft value');

    const publicDuringDraft = await api('/public/branding');
    assert.deepStrictEqual(publicDuringDraft.payload.data, publicBefore.payload.data, 'Draft is isolated from public Login');

    const conflict = await api('/branding/draft', { method: 'PUT', token: adminToken, body: { value: firstDraftValue, expectedDraftUpdatedAt: 'stale-version' } });
    assert.strictEqual(conflict.status, 409, 'Draft optimistic conflict');
    const staleDiscard = await api('/branding/draft', { method: 'DELETE', token: adminToken, body: { expectedDraftUpdatedAt: 'stale-version' } });
    assert.strictEqual(staleDiscard.status, 409, 'Discard Draft optimistic conflict');

    const unconfirmedPublish = await api('/branding/publish', { method: 'POST', token: adminToken, body: { expectedDraftUpdatedAt: firstDraft.payload.data.updatedAt } });
    assert.strictEqual(unconfirmedPublish.status, 400, 'Publish confirmation required');

    const firstPublish = await api('/branding/publish', {
        method: 'POST', token: adminToken,
        body: { confirmation: 'PUBLISH_BRANDING', expectedDraftUpdatedAt: firstDraft.payload.data.updatedAt, note: runId },
    });
    assert.strictEqual(firstPublish.status, 200, 'Publish Draft');
    assert.strictEqual(firstPublish.payload.data.draft, null, 'Draft removed after Publish');
    const firstVersionId = firstPublish.payload.data.activeVersionId;
    assert.ok(firstVersionId, 'Published version ID');
    const publicAfterFirst = await api('/public/branding');
    assert.strictEqual(publicAfterFirst.payload.data.appName, firstDraftValue.appName, 'Published value reaches public Login');
    assert.strictEqual(publicAfterFirst.payload.data.loginBackgroundFit, 'contain', 'Published full-image fit reaches public Login');
    assert.strictEqual(publicAfterFirst.payload.data.loginAnnouncementTitle, firstDraftValue.loginAnnouncementTitle, 'Published announcement reaches public Login');
    assert.strictEqual(publicAfterFirst.payload.data.supportEmail, firstDraftValue.supportEmail, 'Published support channel reaches public Login');

    const secondDraft = await api('/branding/draft', {
        method: 'PUT', token: adminToken,
        body: { value: { ...firstDraftValue, appName: `Second ${runId}`, loginBackgroundFocusX: 80 } },
    });
    const secondPublish = await api('/branding/publish', {
        method: 'POST', token: adminToken,
        body: { confirmation: 'PUBLISH_BRANDING', expectedDraftUpdatedAt: secondDraft.payload.data.updatedAt, note: `${runId}-second` },
    });
    assert.strictEqual(secondPublish.status, 200, 'Publish second version');
    assert.notStrictEqual(secondPublish.payload.data.activeVersionId, firstVersionId, 'Version IDs are immutable');

    const staleRollback = await api(`/branding/versions/${encodeURIComponent(firstVersionId)}/rollback`, {
        method: 'POST', token: adminToken,
        body: { confirmation: 'ROLLBACK_BRANDING', expectedActiveVersionId: 'stale-active' },
    });
    assert.strictEqual(staleRollback.status, 409, 'Rollback active-version conflict');

    const rollback = await api(`/branding/versions/${encodeURIComponent(firstVersionId)}/rollback`, {
        method: 'POST', token: adminToken,
        body: { confirmation: 'ROLLBACK_BRANDING', expectedActiveVersionId: secondPublish.payload.data.activeVersionId, note: runId },
    });
    assert.strictEqual(rollback.status, 200, 'Rollback version');
    assert.notStrictEqual(rollback.payload.data.activeVersionId, firstVersionId, 'Rollback creates a new version');
    assert.strictEqual(rollback.payload.data.versions[0].source, 'rollback', 'Rollback source metadata');
    assert.strictEqual(rollback.payload.data.versions[0].restoredFromVersionId, firstVersionId, 'Rollback lineage');
    const publicAfterRollback = await api('/public/branding');
    assert.strictEqual(publicAfterRollback.payload.data.appName, firstDraftValue.appName, 'Rollback reaches public Login');
    assert.strictEqual(publicAfterRollback.payload.data.loginBackgroundFit, 'contain', 'Rollback restores full-image fit');

    console.log('PASS Branding Draft/Publish/Version/Rollback Node API lifecycle');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    try { await restoreSettings(); } catch (error) {
        console.error('Branding settings restore failed:', error);
        process.exitCode = 1;
    }
    if (server) await new Promise(resolve => server.close(resolve));
    try {
        const restored = await snapshotSettings();
        assert.deepStrictEqual(restored, originalRows, 'Branding setting rows restored byte-for-byte');
        console.log('PASS Branding UAT cleanup: original App_Settings rows restored and test Audit rows removed');
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
    await db.end();
});
