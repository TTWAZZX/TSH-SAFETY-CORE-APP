'use strict';

if (process.env.CONTROLLED_MAIL_UAT !== '1') {
    console.error('Controlled mail UAT opt-in is required.');
    process.exit(2);
}

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const assert = require('assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const {
    CompanyEmailChangeError,
    createRequest,
    ensureCompanyEmailChangeSchema,
    verifyRequest,
} = require('../services/company-email-change');
const {
    PasswordResetError,
    completePasswordReset,
    ensurePasswordResetSchema,
    requestPasswordReset,
} = require('../services/password-reset');

const marker = `ZCM${Date.now().toString().slice(-9)}`;
const employeeId = marker.slice(0, 20);
const originalPassword = 'Controlled-Mail-42!';
const newPassword = 'Controlled-Mail-84!';
const companyToken = Buffer.alloc(32, 51).toString('base64url');
const resetToken = Buffer.alloc(32, 52).toString('base64url');
const companyVerifyIp = '127.0.0.121';
const resetCompleteIp = '127.0.0.123';
const companyRateKey = `verify:${crypto.createHash('sha256').update(companyVerifyIp).digest('hex').slice(0, 32)}`;
const resetRateKey = `reset:${crypto.createHash('sha256').update(resetCompleteIp).digest('hex').slice(0, 32)}`;
let companyAuditBaseline = 0;
let resetAuditBaseline = 0;

function enabled(name) {
    return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function controlledRecipient() {
    const source = String(process.env.SMTP_USER || '').trim().toLowerCase();
    const match = source.match(/^([^@]+)@(gmail\.com)$/i);
    if (!match) throw new Error('Controlled lifecycle requires a Gmail SMTP_USER for a private plus alias.');
    return `${match[1]}+tsh-safety-uat-${Date.now()}@${match[2]}`;
}

async function withKnownToken(byte, operation) {
    const original = crypto.randomBytes;
    crypto.randomBytes = size => size === 32 ? Buffer.alloc(32, byte) : original(size);
    try {
        return await operation();
    } finally {
        crypto.randomBytes = original;
    }
}

async function expectCompanyCode(operation, code) {
    await assert.rejects(operation, error => error instanceof CompanyEmailChangeError && error.code === code);
}

async function expectResetCode(operation, code) {
    await assert.rejects(operation, error => error instanceof PasswordResetError && error.code === code);
}

async function run() {
    assert.equal(enabled('EMAIL_ENABLED'), true);
    assert.equal(enabled('COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED'), true);
    assert.equal(enabled('PASSWORD_RESET_EMAIL_DELIVERY_ENABLED'), true);
    const email = controlledRecipient();

    await ensureCompanyEmailChangeSchema(db);
    await ensurePasswordResetSchema(db);
    const [[companyStart]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM company_email_change_audit');
    const [[resetStart]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM password_reset_audit');
    companyAuditBaseline = Number(companyStart.id || 0);
    resetAuditBaseline = Number(resetStart.id || 0);

    await db.query(
        `INSERT INTO Employees
            (EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?,0)`,
        [employeeId, 'Controlled Mail Lifecycle UAT', 'TEST', '', '', 'TEST', null, 'User', await bcrypt.hash(originalPassword, 4)]
    );

    const company = await withKnownToken(51, () => createRequest({
        pool: db,
        employeeId,
        newEmail: email,
        currentPassword: originalPassword,
        ipAddress: '127.0.0.120',
    }));
    assert.equal(company.delivery, 'Sent');
    const [[beforeVerify]] = await db.query('SELECT CompanyEmail FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.equal(beforeVerify.CompanyEmail, null);
    const verified = await verifyRequest({ pool: db, token: companyToken, ipAddress: companyVerifyIp });
    assert.equal(verified.companyEmail, email);
    await expectCompanyCode(
        verifyRequest({ pool: db, token: companyToken, ipAddress: companyVerifyIp }),
        'EMAIL_VERIFICATION_INVALID'
    );

    const reset = await withKnownToken(52, () => requestPasswordReset({
        pool: db,
        employeeId,
        ipAddress: '127.0.0.122',
    }));
    assert.equal(reset.accepted, true);
    assert.equal(reset.delivery, 'Sent');
    const completed = await completePasswordReset({
        pool: db,
        token: resetToken,
        newPassword,
        ipAddress: resetCompleteIp,
    });
    assert.equal(completed.employeeId, employeeId);
    await expectResetCode(
        completePasswordReset({ pool: db, token: resetToken, newPassword, ipAddress: resetCompleteIp }),
        'PASSWORD_RESET_INVALID'
    );

    const [[employee]] = await db.query('SELECT CompanyEmail,Password,MustChangePassword FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.equal(employee.CompanyEmail, email);
    assert.equal(await bcrypt.compare(newPassword, employee.Password), true);
    assert.equal(Number(employee.MustChangePassword), 0);
    const [[companyRequest]] = await db.query('SELECT Status FROM company_email_verification_requests WHERE id=?', [company.requestId]);
    const [[resetRequest]] = await db.query(
        'SELECT Status,DeliveryStatus FROM password_reset_requests WHERE EmployeeID=? ORDER BY id DESC LIMIT 1',
        [employeeId]
    );
    assert.equal(companyRequest.Status, 'Verified');
    assert.deepEqual({ status: resetRequest.Status, delivery: resetRequest.DeliveryStatus }, { status: 'Completed', delivery: 'Sent' });

    const [companyActions] = await db.query(
        'SELECT Action FROM company_email_change_audit WHERE id>? AND EmployeeID=? ORDER BY id',
        [companyAuditBaseline, employeeId]
    );
    const [resetActions] = await db.query(
        'SELECT Action FROM password_reset_audit WHERE id>? AND EmployeeID=? ORDER BY id',
        [resetAuditBaseline, employeeId]
    );
    assert.deepEqual(companyActions.map(row => row.Action), ['ATTEMPTED', 'REQUESTED', 'DELIVERY_SENT', 'VERIFIED']);
    assert.deepEqual(resetActions.map(row => row.Action), ['ATTEMPTED', 'REQUESTED', 'DELIVERY_SENT', 'COMPLETED']);
    console.log(JSON.stringify({
        passed: true,
        realMessagesAccepted: 2,
        companyStatus: 'Verified',
        resetStatus: 'Completed',
        oneTimeLinksRejected: 2,
    }));
}

run().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await db.query(
        'DELETE FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?)',
        [resetAuditBaseline, employeeId, resetRateKey, `reset:${employeeId}`]
    ).catch(() => {});
    await db.query('DELETE FROM password_reset_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query(
        'DELETE FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?)',
        [companyAuditBaseline, employeeId, companyRateKey]
    ).catch(() => {});
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) employees,
            (SELECT COUNT(*) FROM company_email_verification_requests WHERE EmployeeID=?) companyRequests,
            (SELECT COUNT(*) FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?)) companyAudits,
            (SELECT COUNT(*) FROM password_reset_requests WHERE EmployeeID=?) resetRequests,
            (SELECT COUNT(*) FROM password_reset_audit WHERE id>? AND EmployeeID IN (?,?,?)) resetAudits`,
        [employeeId, employeeId, companyAuditBaseline, employeeId, companyRateKey,
            employeeId, resetAuditBaseline, employeeId, resetRateKey, `reset:${employeeId}`]
    ).catch(() => [[{ employees: -1, companyRequests: -1, companyAudits: -1, resetRequests: -1, resetAudits: -1 }]]);
    console.log(JSON.stringify({ cleanup: residue }));
    await db.end().catch(() => {});
});
