const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

process.env.COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED = 'false';
const db = require('../db');
const {
    CompanyEmailChangeError,
    buildVerificationEmail,
    cancelRequest,
    createRequest,
    loadState,
    tokenHash,
    verifyRequest,
} = require('../services/company-email-change');

const marker = `ZCE${Date.now().toString().slice(-9)}`;
const employeeA = `${marker}A`.slice(0, 20);
const employeeB = `${marker}B`.slice(0, 20);
const password = 'CompanyEmail-Test-42!';
const emailA = `${marker.toLowerCase()}a@gmail.com`;
const emailB = `${marker.toLowerCase()}b@outlook.com`;
const knownToken = Buffer.alloc(32, 7).toString('base64url');
const expiredToken = Buffer.alloc(32, 8).toString('base64url');
const verificationAuditKeys = ['127.0.0.15', '127.0.0.16', '127.0.0.18']
    .map(ip => `verify:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`);
let auditBaseline = 0;

async function expectCode(promise, code) {
    await assert.rejects(promise, error => error instanceof CompanyEmailChangeError && error.code === code);
}

async function applyMigrationTwice() {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260924_company_email_self_service.sql'), 'utf8');
    const statements = sql.split(';').map(value => value.trim()).filter(Boolean);
    for (let pass = 0; pass < 2; pass += 1) {
        for (const statement of statements) await db.query(statement);
    }
}

function contractChecks() {
    const node = fs.readFileSync(path.join(__dirname, '../services/company-email-change.js'), 'utf8');
    const php = fs.readFileSync(path.join(__dirname, '../../api/lib/company_email_change.php'), 'utf8');
    const phpRoutes = fs.readFileSync(path.join(__dirname, '../../api/index.php'), 'utf8');
    const nodeRoutes = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const profileUi = fs.readFileSync(path.join(__dirname, '../../public/js/pages/profile.js'), 'utf8');
    const mainUi = fs.readFileSync(path.join(__dirname, '../../public/js/main.js'), 'utf8');

    for (const source of [node, php]) {
        assert.doesNotMatch(source, /ต้องลงท้ายด้วย @thaisummit-harness\.co\.th/i);
        assert.match(source, /sha256/i);
        assert.match(source, /PendingEmailKey/);
        assert.match(source, /CURRENT_PASSWORD_INVALID/);
        assert.match(source, /Status='Verified'/);
        assert.match(source, /Status='Cancelled'/);
        assert.match(source, /Status='Expired'/);
        assert.match(source, /COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED/i);
    }
    for (const source of [nodeRoutes, phpRoutes]) {
        assert.match(source, /profile\/company-email\/request/);
        assert.match(source, /profile\/company-email\/resend/);
        assert.match(source, /profile\/company-email\/verify/);
    }
    assert.match(profileUi, /name@example\.com/);
    assert.match(profileUi, /pf-company-email-cancel/);
    assert.match(mainUi, /verify-company-email=/);
}

async function insertEmployee(employeeId, companyEmail = null) {
    const hash = await bcrypt.hash(password, 4);
    await db.query(
        `INSERT INTO Employees
            (EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?,0)`,
        [employeeId, `Company Email Test ${employeeId}`, 'TEST', '', '', 'TEST', companyEmail, 'User', hash]
    );
}

async function run() {
    contractChecks();
    await applyMigrationTwice();
    const [[auditStart]] = await db.query('SELECT COALESCE(MAX(id),0) id FROM company_email_change_audit');
    auditBaseline = Number(auditStart.id || 0);
    await db.query('DELETE FROM company_email_change_audit WHERE EmployeeID IN (?,?)', [employeeA, employeeB]);
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID IN (?,?)', [employeeA, employeeB]);
    await db.query("DELETE FROM Employees WHERE EmployeeID IN (?,?) AND EmployeeName LIKE 'Company Email Test %'", [employeeA, employeeB]);
    await insertEmployee(employeeA);
    await insertEmployee(employeeB, emailB);

    await expectCode(createRequest({
        pool: db, employeeId: employeeA, newEmail: 'not-an-email', currentPassword: password, ipAddress: '127.0.0.10',
    }), 'INVALID_COMPANY_EMAIL');
    await expectCode(createRequest({
        pool: db, employeeId: employeeA, newEmail: emailA, currentPassword: 'wrong', ipAddress: '127.0.0.11',
    }), 'CURRENT_PASSWORD_INVALID');

    const requested = await createRequest({
        pool: db, employeeId: employeeA, newEmail: emailA, currentPassword: password, ipAddress: '127.0.0.12',
    });
    assert.equal(requested.delivery, 'Disabled');
    assert.equal(requested.email, emailA);
    let state = await loadState(db, employeeA);
    assert.equal(state.companyEmail, null);
    assert.equal(state.status, 'missing');
    assert.equal(state.pending.email, emailA);
    assert.equal(state.deliveryEnabled, false);
    const readyState = await loadState(db, employeeB);
    assert.equal(readyState.companyEmail, emailB);
    assert.equal(readyState.status, 'ready');

    const resent = await createRequest({
        pool: db, employeeId: employeeA, newEmail: emailA, currentPassword: password,
        ipAddress: '127.0.0.13', resendRequestId: requested.requestId,
    });
    const [[superseded]] = await db.query('SELECT Status,PendingEmailKey FROM company_email_verification_requests WHERE id=?', [requested.requestId]);
    assert.equal(superseded.Status, 'Superseded');
    assert.equal(superseded.PendingEmailKey, null);
    await cancelRequest({ pool: db, employeeId: employeeA, requestId: resent.requestId, ipAddress: '127.0.0.14' });
    state = await loadState(db, employeeA);
    assert.equal(state.pending, null);

    await db.query(
        `INSERT INTO company_email_verification_requests
            (EmployeeID,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,?, 'Pending','127.0.0.15',DATE_ADD(NOW(),INTERVAL 1 HOUR))`,
        [employeeA, emailA, emailA, tokenHash(knownToken)]
    );
    const verified = await verifyRequest({ pool: db, token: knownToken, ipAddress: '127.0.0.15' });
    assert.equal(verified.companyEmail, emailA);
    const [[employeeAfter]] = await db.query('SELECT CompanyEmail FROM Employees WHERE EmployeeID=?', [employeeA]);
    assert.equal(employeeAfter.CompanyEmail, emailA);
    await expectCode(verifyRequest({ pool: db, token: knownToken, ipAddress: '127.0.0.16' }), 'EMAIL_VERIFICATION_INVALID');

    await expectCode(createRequest({
        pool: db, employeeId: employeeB, newEmail: emailA, currentPassword: password, ipAddress: '127.0.0.17',
    }), 'COMPANY_EMAIL_IN_USE');

    await db.query(
        `INSERT INTO company_email_verification_requests
            (EmployeeID,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt)
         VALUES(?,?,?,?, 'Pending','127.0.0.18',DATE_SUB(NOW(),INTERVAL 1 MINUTE))`,
        [employeeB, `${marker.toLowerCase()}expired@yahoo.com`, `${marker.toLowerCase()}expired@yahoo.com`, tokenHash(expiredToken)]
    );
    const expiredState = await loadState(db, employeeB);
    assert.equal(expiredState.pending.status, 'Expired');
    await expectCode(verifyRequest({ pool: db, token: expiredToken, ipAddress: '127.0.0.18' }), 'EMAIL_VERIFICATION_EXPIRED');

    const mail = buildVerificationEmail({ employeeName: '<Test>', email: emailA, token: knownToken });
    assert.match(mail.html, /ยืนยันอีเมล/);
    assert.match(mail.html, /&lt;Test&gt;/);
    assert.match(mail.text, /24 ชั่วโมง/);
    assert.doesNotMatch(JSON.stringify(requested), new RegExp(knownToken));

    console.log('Company Email self-service tests passed: migration reapply, request, reauth, resend, cancel, verify, one-time token, uniqueness, templates, PHP/Node/UI contract.');
}

run().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    await db.query('DELETE FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?,?,?,?)', [auditBaseline, employeeA, employeeB, ...verificationAuditKeys]).catch(() => {});
    await db.query('DELETE FROM company_email_verification_requests WHERE EmployeeID IN (?,?)', [employeeA, employeeB]).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID IN (?,?)', [employeeA, employeeB]).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (?,?)) employees,
            (SELECT COUNT(*) FROM company_email_verification_requests WHERE EmployeeID IN (?,?)) requests,
            (SELECT COUNT(*) FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?,?,?,?)) audits`,
        [employeeA, employeeB, employeeA, employeeB, auditBaseline, employeeA, employeeB, ...verificationAuditKeys]
    ).catch(() => [[{ employees: -1, requests: -1, audits: -1 }]]);
    console.log(`Company Email test cleanup: employees=${residue.employees}; requests=${residue.requests}; audits=${residue.audits}`);
    await db.end();
});
