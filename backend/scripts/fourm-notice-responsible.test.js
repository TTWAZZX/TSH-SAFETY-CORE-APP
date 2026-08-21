'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    normalizeCompanyEmail,
    selectResponsibleEmployeeId,
    uniqueNoticeRecipients,
    noticeDepartmentMismatch,
} = require('../utils/fourmNoticeResponsible');

assert.strictEqual(selectResponsibleEmployeeId({
    isAdmin: true,
    requestedEmployeeId: ' 009999 ',
    actorEmployeeId: '001111',
}), '009999');
assert.strictEqual(selectResponsibleEmployeeId({
    isAdmin: false,
    requestedEmployeeId: '009999',
    actorEmployeeId: '001111',
}), '001111', 'ordinary users cannot assign another employee');
assert.throws(() => selectResponsibleEmployeeId({ isAdmin: false }), /required/);

assert.strictEqual(normalizeCompanyEmail('owner@thaisummit-harness.co.th'), 'owner@thaisummit-harness.co.th');
assert.strictEqual(normalizeCompanyEmail('invalid-address'), null);
assert.strictEqual(normalizeCompanyEmail('owner@gmail.com'), null);
assert.deepStrictEqual(uniqueNoticeRecipients([
    'owner@thaisummit-harness.co.th',
    'OWNER@thaisummit-harness.co.th',
    'admin@thaisummit-harness.co.th,invalid',
]), ['owner@thaisummit-harness.co.th', 'admin@thaisummit-harness.co.th']);

assert.strictEqual(noticeDepartmentMismatch('PRODUCTION 1 SEC.', 'PRODUCTION 2 SEC.'), true);
assert.strictEqual(noticeDepartmentMismatch(' PRODUCTION 1 SEC. ', 'PRODUCTION 1 SEC.'), false);
assert.strictEqual(noticeDepartmentMismatch('', 'PRODUCTION 1 SEC.'), false);

const root = path.resolve(__dirname, '..', '..');
const routeSource = fs.readFileSync(path.join(root, 'backend', 'routes', 'fourm.js'), 'utf8');
const phpSource = fs.readFileSync(path.join(root, 'api', 'handlers', 'fourm_phase7.php'), 'utf8');
const frontendSource = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'fourm.js'), 'utf8');
for (const source of [routeSource, phpSource]) {
    assert.match(source, /ResponsibleEmployeeID/);
    assert.match(source, /responsible-employees/);
    assert.match(source, /NoticeReassigned/);
    assert.match(source, /ResponsibleEmailReady|EmailReady/);
}
assert.match(frontendSource, /notice-responsible-search/);
assert.match(frontendSource, /notice-responsible-dept-warning/);
assert.match(frontendSource, /Employee Master/);

const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const phpResult = spawnSync(php, [path.join(root, 'api', 'tests', 'fourm_responsible_runner.php')], {
    cwd: root,
    input: JSON.stringify({
        validEmail: 'OWNER@thaisummit-harness.co.th',
        invalidEmail: 'owner@gmail.com',
        recipients: ['owner@thaisummit-harness.co.th', 'OWNER@thaisummit-harness.co.th', 'invalid'],
        noticeDepartment: 'PRODUCTION 1 SEC.',
        responsibleDepartment: 'PRODUCTION 2 SEC.',
    }),
    encoding: 'utf8',
});
assert.strictEqual(phpResult.status, 0, phpResult.stderr || phpResult.stdout);
const phpParity = JSON.parse(phpResult.stdout);
assert.deepStrictEqual(phpParity, {
    validEmail: 'owner@thaisummit-harness.co.th',
    invalidEmail: null,
    recipients: 'owner@thaisummit-harness.co.th',
    mismatch: true,
});

console.log('4M Notice responsible-person tests passed.');
