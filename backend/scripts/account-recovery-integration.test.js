'use strict';

const assert = require('assert/strict');
const bcrypt = require('bcryptjs');

process.env.EMAIL_ENABLED = 'false';
process.env.COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED = 'false';
process.env.PASSWORD_RESET_EMAIL_DELIVERY_ENABLED = 'false';

const db = require('../db');
const {
    createRequest,
    ensureCompanyEmailChangeSchema,
    tokenHash: companyTokenHash,
    verifyRequest,
} = require('../services/company-email-change');
const {
    completePasswordReset,
    ensurePasswordResetSchema,
    requestPasswordReset,
    tokenHash: resetTokenHash,
} = require('../services/password-reset');

const marker = `ZAR${Date.now().toString().slice(-9)}`;
const employeeId = marker.slice(0, 20);
const email = `${marker.toLowerCase()}@example.com`;
const originalPassword = 'Account-Recovery-42!';
const newPassword = 'Account-Recovery-84!';
const companyToken = Buffer.alloc(32, 41).toString('base64url');
const resetToken = Buffer.alloc(32, 42).toString('base64url');
let companyAuditBaseline = 0;
let resetAuditBaseline = 0;

async function run() {
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
        [employeeId, `Account Recovery ${employeeId}`, 'TEST', '', '', 'TEST', null, 'User', await bcrypt.hash(originalPassword, 4)]
    );

    const emailRequest = await createRequest({
        pool: db,
        employeeId,
        newEmail: email,
        currentPassword: originalPassword,
        ipAddress: '127.0.0.91',
    });
    assert.equal(emailRequest.delivery, 'Disabled');
    await db.query(
        'UPDATE company_email_verification_requests SET TokenHash=? WHERE id=?',
        [companyTokenHash(companyToken), emailRequest.requestId]
    );
    const verified = await verifyRequest({ pool: db, token: companyToken, ipAddress: '127.0.0.92' });
    assert.equal(verified.companyEmail, email);

    const resetRequest = await requestPasswordReset({ pool: db, employeeId, ipAddress: '127.0.0.93' });
    assert.equal(resetRequest.accepted, true);
    assert.equal(resetRequest.delivery, 'Disabled');
    const [[pendingReset]] = await db.query(
        "SELECT id FROM password_reset_requests WHERE EmployeeID=? AND Status='Pending' ORDER BY id DESC LIMIT 1",
        [employeeId]
    );
    assert.ok(pendingReset?.id);
    await db.query('UPDATE password_reset_requests SET TokenHash=? WHERE id=?', [resetTokenHash(resetToken), pendingReset.id]);
    const completed = await completePasswordReset({ pool: db, token: resetToken, newPassword, ipAddress: '127.0.0.94' });
    assert.equal(completed.employeeId, employeeId);

    const [[employee]] = await db.query('SELECT CompanyEmail,Password,MustChangePassword FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.equal(employee.CompanyEmail, email);
    assert.equal(await bcrypt.compare(newPassword, employee.Password), true);
    assert.equal(Number(employee.MustChangePassword), 0);

    const [companyActions] = await db.query(
        'SELECT Action FROM company_email_change_audit WHERE id>? AND EmployeeID=? ORDER BY id',
        [companyAuditBaseline, employeeId]
    );
    const [resetActions] = await db.query(
        'SELECT Action FROM password_reset_audit WHERE id>? AND EmployeeID=? ORDER BY id',
        [resetAuditBaseline, employeeId]
    );
    assert.deepEqual(companyActions.map(row => row.Action), ['ATTEMPTED', 'REQUESTED', 'DELIVERY_DISABLED', 'VERIFIED']);
    assert.deepEqual(resetActions.map(row => row.Action), ['ATTEMPTED', 'REQUESTED', 'DELIVERY_DISABLED', 'COMPLETED']);
    console.log('Account recovery integration passed: Profile email request -> verification -> forgot password -> password replacement with complete audit trail.');
}

run().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await db.query('DELETE FROM password_reset_audit WHERE id>? AND EmployeeID=?', [resetAuditBaseline, employeeId]).catch(() => {});
    await db.query('DELETE FROM password_reset_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM company_email_change_audit WHERE id>? AND EmployeeID=?', [companyAuditBaseline, employeeId]).catch(() => {});
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [employeeId]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID=?', [employeeId]).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID=?) employees,
            (SELECT COUNT(*) FROM company_email_verification_requests WHERE EmployeeID=?) companyRequests,
            (SELECT COUNT(*) FROM company_email_change_audit WHERE id>? AND EmployeeID=?) companyAudits,
            (SELECT COUNT(*) FROM password_reset_requests WHERE EmployeeID=?) resetRequests,
            (SELECT COUNT(*) FROM password_reset_audit WHERE id>? AND EmployeeID=?) resetAudits`,
        [employeeId, employeeId, companyAuditBaseline, employeeId, employeeId, resetAuditBaseline, employeeId]
    ).catch(() => [[{ employees: -1, companyRequests: -1, companyAudits: -1, resetRequests: -1, resetAudits: -1 }]]);
    console.log(`Account recovery cleanup: employees=${residue.employees}; companyRequests=${residue.companyRequests}; companyAudits=${residue.companyAudits}; resetRequests=${residue.resetRequests}; resetAudits=${residue.resetAudits}`);
    await db.end().catch(() => {});
});
