'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    registrationAdminEmailTemplate,
    registrationAdminRecipient,
} = require('../utils/registration-email-template');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

assert.strictEqual(registrationAdminRecipient({
    REGISTRATION_ADMIN_EMAIL: 'registration@example.test',
    ADMIN_EMAIL: 'admin@example.test',
}), 'registration@example.test');
assert.strictEqual(registrationAdminRecipient({ ADMIN_EMAIL: 'admin@example.test' }), 'admin@example.test');
assert.strictEqual(registrationAdminRecipient({}), '');

const mail = registrationAdminEmailTemplate({
    employeeName: '<Applicant>',
    employeeId: 'EMP-100',
    department: 'Safety',
    unit: 'Core',
    position: 'Officer',
    companyEmail: 'applicant@example.test',
    referenceCode: 'REF-100',
    submittedAt: '2026-10-10T10:00:00+07:00',
    appUrl: 'https://example.test/safety/tsh-safety-core',
    password: 'must-not-appear',
});
assert.match(mail.subject, /คำขอสมัครบัญชีใหม่/);
assert.match(mail.text, /EMP-100/);
assert.match(mail.text, /#admin/);
assert.match(mail.html, /&lt;Applicant&gt;/);
assert.doesNotMatch(`${mail.text}${mail.html}`, /must-not-appear/);

const nodeFoundation = read('backend/server.js');
const phpFoundation = read('api/handlers/foundation.php');
const nodeAdmin = read('backend/routes/admin.js');
const phpAdmin = read('api/handlers/admin_phase8.php');
const adminUi = read('public/js/pages/admin.js');
const loginUi = read('index.html');

for (const source of [nodeFoundation, phpFoundation]) {
    assert.match(source, /REGISTRATION_ADMIN_EMAIL_SENT/);
    assert.match(source, /REGISTRATION_ADMIN_EMAIL_SKIPPED/);
    assert.match(source, /REGISTRATION_ADMIN_EMAIL_FAILED/);
}

for (const source of [nodeAdmin, phpAdmin]) {
    assert.match(source, /EmployeeExists/);
    assert.match(source, /ExistingAccountActive/);
    assert.match(source, /CLOSE_DUPLICATE_REGISTRATION_REQUEST/);
    assert.match(source, /REGISTRATION_DUPLICATE_CLOSED/);
    assert.match(source, /Status='Cancelled'/);
    assert.match(source, /PasswordHash=NULL/);
    assert.match(source, /existing account was not changed/);
}

assert.match(adminUi, /ปิดคำขอซ้ำ/);
assert.match(adminUi, /พร้อมส่งอีเมลแจ้ง Admin/);
assert.match(adminUi, /ไม่แก้ไขบัญชีเดิม/);
assert.match(loginUi, /เปิดใช้งานบัญชีเดิมหรือใช้เมนูลืมรหัสผ่าน/);
assert.match(nodeFoundation, /\['Rejected', 'Cancelled'\]\.includes\(status\)/);
assert.match(phpFoundation, /in_array\(\$status, \['Rejected','Cancelled'\], true\)/);

console.log('Registration request notification and duplicate reconciliation contract: PASS');
