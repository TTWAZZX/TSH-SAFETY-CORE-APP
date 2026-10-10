'use strict';

const assert = require('assert');
const { registrationEmailTemplate } = require('../utils/registration-email-template');

for (const status of ['Approved', 'Rejected']) {
    const mail = registrationEmailTemplate({
        status,
        employeeName: '<Test User>',
        employeeId: 'EMP-EMAIL-1',
        referenceCode: 'REF-EMAIL-1',
        reason: status === 'Rejected' ? 'ข้อมูลไม่ครบ' : '',
        loginUrl: 'https://example.test/safety/tsh-safety-core',
    });
    assert.match(mail.subject, /TSH Safety Core/);
    assert.match(mail.text, /EMP-EMAIL-1/);
    assert.match(mail.html, /&lt;Test User&gt;/);
    assert.doesNotMatch(mail.html, /<Test User>/);
}

console.log('Registration applicant email templates: PASS');
