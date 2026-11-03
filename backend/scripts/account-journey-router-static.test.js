'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const node = read('backend/server.js');
const php = read('api/handlers/foundation.php');
const page = read('index.html');

for (const source of [node, php]) {
    for (const marker of ['2026-11-03-account-journey-router-r1', 'NEW_REGISTRATION', 'ACTIVATE', 'LOGIN', 'CHECK_STATUS', 'CONTACT_ADMIN', 'personalDataIncluded', 'businessMutation']) {
        assert(source.includes(marker), `Account journey backend marker missing: ${marker}`);
    }
    assert(source.includes('ACCOUNT_JOURNEY_RESOLVED') && source.includes('ACCOUNT_JOURNEY_RATE_LIMITED'), 'Journey audit/rate-limit contract missing');
    assert(!/SELECT\s+EmployeeName[^;]+account\/journey/is.test(source), 'Journey endpoint must not disclose employee profile fields');
}
for (const marker of ['account-journey-check', 'registration-account-journey-check', '_syncAccountEmployeeId', '_applyAccountJourney', '_resolveAccountJourney', 'LOGIN_OR_ADMIN_RESET', 'NEW_REGISTRATION_OR_ADMIN']) {
    assert(page.includes(marker), `Account journey UI marker missing: ${marker}`);
}
assert(page.includes('คุณยังสามารถเข้าสู่ระบบหรือสมัครบัญชีด้วยขั้นตอนเดิมได้'), 'Legacy fallback guidance missing');
assert(page.includes('20261103-account-journey-router-r1'), 'Account journey cache marker missing');
console.log('Account Journey Router static contract: PASS (Node/PHP parity, privacy, rate limit, shared EmployeeID, legacy fallback and cache chain)');
