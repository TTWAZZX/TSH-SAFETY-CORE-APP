'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

process.env.EMAIL_ENABLED = 'false';
process.env.PASSWORD_RESET_EMAIL_DELIVERY_ENABLED = 'false';

const db = require('../db');
const {
    GENERIC_REQUEST_MESSAGE,
    PasswordResetError,
    buildResetEmail,
    completePasswordReset,
    ensurePasswordResetSchema,
    requestPasswordReset,
    tokenHash,
} = require('../services/password-reset');

const marker = `ZPR${Date.now().toString().slice(-9)}`;
const employeeWithEmail = `${marker}A`.slice(0, 20);
const employeeWithoutEmail = `${marker}B`.slice(0, 20);
const email = `${marker.toLowerCase()}@gmail.com`;
const originalPassword = 'Reset-Original-42!';
const newPassword = 'Reset-New-84!';
const knownToken = Buffer.alloc(32, 31).toString('base64url');
const expiredToken = Buffer.alloc(32, 32).toString('base64url');
const verifyAuditKey = `reset:${crypto.createHash('sha256').update('127.0.0.83').digest('hex').slice(0, 32)}`;
let auditBaseline = 0;

async function expectCode(promise, code) {
    await assert.rejects(promise, error => error instanceof PasswordResetError && error.code === code);
}

async function applyMigrationTwice() {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260924_password_reset_self_service.sql'), 'utf8');
    const statements = sql.split(';').map(statement => statement.trim()).filter(Boolean);
    for (let pass = 0; pass < 2; pass += 1) {
        for (const statement of statements) await db.query(statement);
    }
}

async function seedEmployee(employeeId, companyEmail) {
    await db.query(
        `INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?,0)`,
        [employeeId, `Password Reset Test ${employeeId}`, 'TEST', '', '', 'TEST', companyEmail, 'User', await bcrypt.hash(originalPassword, 4)]
    );
}

function contractChecks() {
    const node = fs.readFileSync(path.join(__dirname, '../services/password-reset.js'), 'utf8');
    const php = fs.readFileSync(path.join(__dirname, '../../api/lib/password_reset.php'), 'utf8');
    const nodeRoutes = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const phpRoutes = fs.readFileSync(path.join(__dirname, '../../api/index.php'), 'utf8');
    const phpConfig = fs.readFileSync(path.join(__dirname, '../../api/config.php'), 'utf8');
    const ui = fs.readFileSync(path.join(__dirname, '../../public/js/main.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    for (const source of [node, php]) {
        assert.match(source, /password_reset_requests/);
        assert.match(source, /sha256/i);
        assert.match(source, /30/);
        assert.match(source, /Status='Completed'/);
        assert.match(source, /Status='Superseded'/);
    }
    assert.match(node, /PASSWORD_RESET_EMAIL_DELIVERY_ENABLED/);
    assert.match(phpConfig, /PASSWORD_RESET_EMAIL_DELIVERY_ENABLED/);
    for (const source of [nodeRoutes, phpRoutes]) {
        assert.match(source, /password-reset\/request/);
        assert.match(source, /password-reset\/complete/);
    }
    assert.match(ui, /reset-password=/);
    assert.match(ui, /password-reset-complete-form/);
    assert.match(html, /forgot-password-btn/);
}

async function run() {
    contractChecks();
    assert.match(GENERIC_REQUEST_MESSAGE, /หากบัญชีนี้มีอีเมล/);
    await applyMigrationTwice();
    await ensurePasswordResetSchema(db);
    const [[start]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM password_reset_audit');
    auditBaseline = Number(start.id || 0);
    await seedEmployee(employeeWithEmail, email);
    await seedEmployee(employeeWithoutEmail, null);

    const unknown = await requestPasswordReset({ pool: db, employeeId: `${marker}X`, ipAddress: '127.0.0.80' });
    const missingEmail = await requestPasswordReset({ pool: db, employeeId: employeeWithoutEmail, ipAddress: '127.0.0.81' });
    assert.equal(unknown.accepted, true);
    assert.equal(missingEmail.accepted, true);
    const [[unknownRows]] = await db.query('SELECT COUNT(*) count FROM password_reset_requests WHERE EmployeeID IN (?,?)', [`${marker}X`, employeeWithoutEmail]);
    assert.equal(Number(unknownRows.count), 0);

    const first = await requestPasswordReset({ pool: db, employeeId: employeeWithEmail, ipAddress: '127.0.0.82' });
    assert.equal(first.delivery, 'Disabled');
    const [[firstRequest]] = await db.query('SELECT id,Status,DeliveryStatus,TokenHash FROM password_reset_requests WHERE EmployeeID=? ORDER BY id DESC LIMIT 1', [employeeWithEmail]);
    assert.equal(firstRequest.Status, 'Pending');
    assert.equal(firstRequest.DeliveryStatus, 'Disabled');
    assert.match(firstRequest.TokenHash, /^[a-f0-9]{64}$/);

    await requestPasswordReset({ pool: db, employeeId: employeeWithEmail, ipAddress: '127.0.0.82' });
    const [[superseded]] = await db.query('SELECT Status FROM password_reset_requests WHERE id=?', [firstRequest.id]);
    assert.equal(superseded.Status, 'Superseded');

    await db.query(
        `INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,'Pending','Disabled','127.0.0.83',DATE_ADD(NOW(),INTERVAL 5 MINUTE))`,
        [employeeWithEmail, email, tokenHash(knownToken)]
    );
    const completed = await completePasswordReset({ pool: db, token: knownToken, newPassword, ipAddress: '127.0.0.83' });
    assert.equal(completed.employeeId, employeeWithEmail);
    const [[employee]] = await db.query('SELECT Password,MustChangePassword FROM Employees WHERE EmployeeID=?', [employeeWithEmail]);
    assert.equal(await bcrypt.compare(newPassword, employee.Password), true);
    assert.equal(Number(employee.MustChangePassword), 0);
    await expectCode(completePasswordReset({ pool: db, token: knownToken, newPassword, ipAddress: '127.0.0.83' }), 'PASSWORD_RESET_INVALID');

    await db.query(
        `INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,'Pending','Disabled','127.0.0.83',DATE_SUB(NOW(),INTERVAL 1 MINUTE))`,
        [employeeWithEmail, email, tokenHash(expiredToken)]
    );
    await expectCode(completePasswordReset({ pool: db, token: expiredToken, newPassword, ipAddress: '127.0.0.83' }), 'PASSWORD_RESET_EXPIRED');
    await expectCode(completePasswordReset({ pool: db, token: knownToken, newPassword: '123', ipAddress: '127.0.0.83' }), 'PASSWORD_POLICY_VIOLATION');

    const mail = buildResetEmail({ employeeName: '<Reset Test>', email, token: knownToken });
    assert.match(mail.subject, /ตั้งรหัสผ่านใหม่/);
    assert.match(mail.html, /&lt;Reset Test&gt;/);
    assert.match(mail.text, /30 นาที/);
    assert.doesNotMatch(JSON.stringify(first), new RegExp(knownToken));
    console.log('Password reset tests passed: migration reapply, enumeration-safe request, missing email, supersede, disabled delivery, complete, one-time/expired token, password policy and templates.');
}

run().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await db.query('DELETE FROM password_reset_audit WHERE id>? AND (EmployeeID IN (?,?,?) OR EmployeeID=?)', [auditBaseline, employeeWithEmail, employeeWithoutEmail, `${marker}X`, verifyAuditKey]).catch(() => {});
    await db.query('DELETE FROM password_reset_requests WHERE EmployeeID IN (?,?)', [employeeWithEmail, employeeWithoutEmail]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID IN (?,?)', [employeeWithEmail, employeeWithoutEmail]).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (?,?)) employees,
            (SELECT COUNT(*) FROM password_reset_requests WHERE EmployeeID IN (?,?)) requests,
            (SELECT COUNT(*) FROM password_reset_audit WHERE id>? AND (EmployeeID IN (?,?,?) OR EmployeeID=?)) audits`,
        [employeeWithEmail, employeeWithoutEmail, employeeWithEmail, employeeWithoutEmail, auditBaseline, employeeWithEmail, employeeWithoutEmail, `${marker}X`, verifyAuditKey]
    ).catch(() => [[{ employees: -1, requests: -1, audits: -1 }]]);
    console.log(`Password reset cleanup: employees=${residue.employees}; requests=${residue.requests}; audits=${residue.audits}`);
    await db.end().catch(() => {});
});
