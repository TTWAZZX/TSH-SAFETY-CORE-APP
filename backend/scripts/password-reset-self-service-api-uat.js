'use strict';

process.env.EMAIL_ENABLED = 'false';
process.env.PASSWORD_RESET_EMAIL_DELIVERY_ENABLED = 'false';

const assert = require('assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const app = require('../server');
const { ensurePasswordResetSchema, tokenHash } = require('../services/password-reset');

const employeeId = `ZPRAPI${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
const unknownId = `${employeeId}X`.slice(0, 20);
const email = `${employeeId.toLowerCase()}@gmail.com`;
const originalPassword = 'Reset-API-Original-42!';
const newPassword = 'Reset-API-New-84!';
const nodePort = 5097;
const phpPort = 5098;
const rateKeys = ['127.0.0.1', '::ffff:127.0.0.1', '::1']
    .map(ip => `reset:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`);
let server;
let phpServer;
let auditBaseline = 0;

async function request(base, pathname, body) {
    const startedAt = Date.now();
    const response = await fetch(`${base}${pathname}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, payload: await response.json(), elapsedMs: Date.now() - startedAt };
}

async function startPhpServer() {
    const root = path.resolve(__dirname, '../..');
    phpServer = spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', [
        '-S', `127.0.0.1:${phpPort}`, '-t', root,
    ], {
        cwd: root,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
            ...process.env,
            EMAIL_ENABLED: 'false',
            PASSWORD_RESET_EMAIL_DELIVERY_ENABLED: 'false',
        },
    });
    let startupError = '';
    phpServer.stderr.on('data', chunk => { startupError += chunk.toString(); });
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (phpServer.exitCode !== null) throw new Error(startupError || 'PHP test server stopped during startup');
        try {
            const response = await fetch(`http://127.0.0.1:${phpPort}/api/index.php?route=register/options`);
            if (response.status < 500) return;
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`PHP test server did not start: ${startupError}`);
}

async function resetStack() {
    await db.query('DELETE FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?,?,?)', [auditBaseline, employeeId, unknownId, ...rateKeys]);
    await db.query('DELETE FROM password_reset_requests WHERE EmployeeID=?', [employeeId]);
    await db.query('UPDATE Employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=?', [await bcrypt.hash(originalPassword, 4), employeeId]);
}

async function runStack(label, base, rawToken) {
    const unknown = await request(base, '/password-reset/request', { employeeId: unknownId });
    const available = await request(base, '/password-reset/request', { employeeId });
    assert.equal(unknown.status, 202, `${label}: unknown generic status`);
    assert.equal(available.status, 202, `${label}: available generic status`);
    assert.equal(unknown.payload.message, available.payload.message, `${label}: enumeration-safe message`);
    assert.equal(Object.hasOwn(available.payload, 'data'), false, `${label}: response must not expose email/delivery`);
    assert.ok(unknown.elapsedMs >= 250 && available.elapsedMs >= 250, `${label}: generic response delay missing`);

    const [[pending]] = await db.query(
        'SELECT id,DeliveryStatus,Status FROM password_reset_requests WHERE EmployeeID=? ORDER BY id DESC LIMIT 1',
        [employeeId]
    );
    assert.equal(pending.Status, 'Pending', `${label}: pending request`);
    assert.equal(pending.DeliveryStatus, 'Disabled', `${label}: delivery disabled`);

    const mismatch = await request(base, '/password-reset/complete', {
        token: rawToken, newPassword, confirmPassword: `${newPassword}x`,
    });
    assert.equal(mismatch.status, 422, `${label}: confirmation mismatch`);
    assert.equal(mismatch.payload.code, 'PASSWORD_CONFIRMATION_MISMATCH');

    await db.query(
        `INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,'Pending','Disabled','127.0.0.1',DATE_ADD(NOW(),INTERVAL 5 MINUTE))`,
        [employeeId, email, tokenHash(rawToken)]
    );
    const completed = await request(base, '/password-reset/complete', {
        token: rawToken, newPassword, confirmPassword: newPassword,
    });
    assert.equal(completed.status, 200, `${label}: complete`);
    const reused = await request(base, '/password-reset/complete', {
        token: rawToken, newPassword, confirmPassword: newPassword,
    });
    assert.equal(reused.status, 409, `${label}: one-time token`);
    const [[saved]] = await db.query('SELECT Password,MustChangePassword FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.equal(await bcrypt.compare(newPassword, saved.Password), true, `${label}: password saved`);
    assert.equal(Number(saved.MustChangePassword), 0, `${label}: onboarding password flag cleared`);
}

(async () => {
    assert.ok(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()));
    assert.match(String(process.env.DB_NAME || ''), /(?:uat|test|local|dev)/i);
    await ensurePasswordResetSchema(db);
    const [[start]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM password_reset_audit');
    auditBaseline = Number(start.id || 0);
    await db.query(
        `INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?,0)`,
        [employeeId, `Password Reset API Test ${employeeId}`, 'TEST', '', '', 'TEST', email, 'User', await bcrypt.hash(originalPassword, 4)]
    );
    server = app.listen(nodePort);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    await runStack('Node', `http://127.0.0.1:${nodePort}/api`, Buffer.alloc(32, 51).toString('base64url'));
    await resetStack();
    await startPhpServer();
    await runStack('PHP', `http://127.0.0.1:${phpPort}/api/index.php?route=`, Buffer.alloc(32, 52).toString('base64url'));
    console.log('Password Reset API UAT passed for Node and PHP: enumeration-safe request, hidden email/delivery, disabled SMTP, confirmation, complete, one-time token and password persistence.');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (phpServer && phpServer.exitCode === null) {
        phpServer.kill();
        await new Promise(resolve => phpServer.once('close', resolve));
    }
    await db.query('DELETE FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?,?,?)', [auditBaseline, employeeId, unknownId, ...rateKeys]).catch(() => {});
    await db.query('DELETE FROM password_reset_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM admin_auditlogs WHERE AdminID=? OR TargetID IN (?,?)', [employeeId, employeeId, unknownId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) employees,
            (SELECT COUNT(*) FROM password_reset_requests WHERE EmployeeID=?) requests,
            (SELECT COUNT(*) FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?,?,?)) audits`,
        [employeeId, employeeId, auditBaseline, employeeId, unknownId, ...rateKeys]
    ).catch(() => [[{ employees: -1, requests: -1, audits: -1 }]]);
    console.log(`Password Reset API cleanup: employees=${residue.employees}; requests=${residue.requests}; audits=${residue.audits}`);
    await db.end().catch(() => {});
});
