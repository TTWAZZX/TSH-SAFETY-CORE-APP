'use strict';

process.env.EMAIL_ENABLED = 'false';
process.env.COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED = 'false';

const assert = require('assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = require('../server');
const { CROSS_PATH_OPERATION, executeEmployeeProfileWrite } = require('../services/employee-profile-write');
const { ensureCompanyEmailChangeSchema, tokenHash } = require('../services/company-email-change');

const employeeId = `ZCEAPI${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
const password = 'CompanyEmail-API-42!';
const nodePort = 5095;
const phpPort = 5096;
let server;
let phpServer;
let auditBaseline = 0;
const verificationAuditKeys = ['127.0.0.1', '::ffff:127.0.0.1', '::1']
    .map(ip => `verify:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`);

async function request(base, pathname, { method = 'GET', token = null, body = null } = {}) {
    const response = await fetch(`${base}${pathname}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    return { status: response.status, payload };
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
            COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED: 'false',
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

async function seedEmployee() {
    const [[master]] = await db.query(
        `SELECT d.Name department,u.name unit,p.Name position
           FROM master_departments d
           JOIN master_safetyunits u ON u.department_id=d.id
           CROSS JOIN master_positions p
          ORDER BY d.id,u.id,p.id LIMIT 1`
    );
    assert(master, 'Profile masters unavailable');
    const connection = await db.getConnection();
    try {
        await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId,
            profilePayload: {
                EmployeeName: `Company Email API Test ${employeeId}`,
                Department: master.department,
                Unit: master.unit,
                Position: master.position,
            },
            protectedFields: {
                Role: 'User', Password: await bcrypt.hash(password, 4), MustChangePassword: 0,
            },
        });
    } finally {
        connection.release();
    }
    return {
        id: employeeId, name: `Company Email API Test ${employeeId}`,
        department: master.department, unit: master.unit, position: master.position,
        role: 'User', team: '', mustChangePassword: false,
    };
}

async function resetStackState() {
    await db.query('DELETE FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?,?,?)', [auditBaseline, employeeId, ...verificationAuditKeys]);
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [employeeId]);
    await db.query('UPDATE Employees SET CompanyEmail=NULL WHERE EmployeeID=?', [employeeId]);
}

async function runStack(label, base, token, email, rawToken) {
    const profileBefore = await request(base, '/profile', { token });
    assert.equal(profileBefore.status, 200, `${label}: profile read`);
    assert.equal(profileBefore.payload.data.CompanyEmail, null);
    assert.equal(profileBefore.payload.data.CompanyEmailState.status, 'missing');

    const invalid = await request(base, '/profile/company-email/request', {
        method: 'POST', token, body: { companyEmail: 'not-an-email', currentPassword: password },
    });
    assert.equal(invalid.status, 422, `${label}: invalid email format`);
    assert.equal(invalid.payload.code, 'INVALID_COMPANY_EMAIL');

    const wrongPassword = await request(base, '/profile/company-email/request', {
        method: 'POST', token, body: { companyEmail: email, currentPassword: 'wrong' },
    });
    assert.equal(wrongPassword.status, 401, `${label}: current password re-auth`);
    assert.equal(wrongPassword.payload.code, 'CURRENT_PASSWORD_INVALID');

    const created = await request(base, '/profile/company-email/request', {
        method: 'POST', token, body: { companyEmail: email, currentPassword: password },
    });
    assert.equal(created.status, 202, `${label}: create request`);
    assert.equal(created.payload.data.delivery, 'Disabled', `${label}: real email must remain disabled`);
    const requestId = Number(created.payload.data.requestId);

    const pendingProfile = await request(base, '/profile', { token });
    assert.equal(pendingProfile.payload.data.CompanyEmail, null, `${label}: pending must not promote email`);
    assert.equal(pendingProfile.payload.data.CompanyEmailState.pending.email, email);

    const cancelled = await request(base, `/profile/company-email/request/${requestId}`, { method: 'DELETE', token });
    assert.equal(cancelled.status, 200, `${label}: cancel`);

    await db.query(
        `INSERT INTO company_email_verification_requests
            (EmployeeID,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,?, 'Pending','127.0.0.41',DATE_ADD(NOW(),INTERVAL 1 HOUR))`,
        [employeeId, email, email, tokenHash(rawToken)]
    );
    const verified = await request(base, '/profile/company-email/verify', { method: 'POST', body: { token: rawToken } });
    assert.equal(verified.status, 200, `${label}: verify`);
    assert.equal(verified.payload.data.companyEmail, email);
    const reused = await request(base, '/profile/company-email/verify', { method: 'POST', body: { token: rawToken } });
    assert.equal(reused.status, 409, `${label}: one-time token`);
    const [[saved]] = await db.query('SELECT CompanyEmail FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.equal(saved.CompanyEmail, email, `${label}: promoted CompanyEmail`);
}

(async () => {
    assert(['localhost', '127.0.0.1', '::1'].includes(String(process.env.DB_HOST || '').toLowerCase()));
    assert(/(?:uat|test|local|dev)/i.test(String(process.env.DB_NAME || '')));
    await ensureCompanyEmailChangeSchema(db);
    const [[auditStart]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM company_email_change_audit');
    auditBaseline = Number(auditStart.id || 0);
    const user = await seedEmployee();
    const authToken = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30m' });
    server = app.listen(nodePort);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });

    await runStack(
        'Node', `http://127.0.0.1:${nodePort}/api`, authToken,
        `${employeeId.toLowerCase()}.node@gmail.com`, Buffer.alloc(32, 21).toString('base64url')
    );
    await resetStackState();
    await startPhpServer();
    await runStack(
        'PHP', `http://127.0.0.1:${phpPort}/api/index.php?route=`, authToken,
        `${employeeId.toLowerCase()}.php@outlook.com`, Buffer.alloc(32, 22).toString('base64url')
    );
    console.log('Company Email API UAT passed for Node and PHP: profile state, multi-provider email, re-auth, disabled delivery, pending, cancel, verify and one-time token.');
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (phpServer && phpServer.exitCode === null) {
        phpServer.kill();
        await new Promise(resolve => phpServer.once('close', resolve));
    }
    await db.query('DELETE FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?,?,?)', [auditBaseline, employeeId, ...verificationAuditKeys]).catch(() => {});
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM admin_auditlogs WHERE AdminID=? OR TargetID=?', [employeeId, employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) employees,
            (SELECT COUNT(*) FROM company_email_verification_requests WHERE EmployeeID=?) requests,
            (SELECT COUNT(*) FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?,?,?)) audits`,
        [employeeId, employeeId, auditBaseline, employeeId, ...verificationAuditKeys]
    ).catch(() => [[{ employees: -1, requests: -1, audits: -1 }]]);
    console.log(`Company Email API cleanup: employees=${residue.employees}; requests=${residue.requests}; audits=${residue.audits}`);
    await db.end().catch(() => {});
});
