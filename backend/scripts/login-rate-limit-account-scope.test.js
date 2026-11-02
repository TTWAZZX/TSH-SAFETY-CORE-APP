'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const php = fs.readFileSync(path.join(root, 'api', 'bootstrap.php'), 'utf8');
const node = fs.readFileSync(path.join(root, 'backend', 'server.js'), 'utf8');

for (const [runtime, source] of [['PHP', php], ['Node', node]]) {
    const limiter = source.match(/(?:function auth_check_login_limit|async function authCheckLoginLimit)[\s\S]*?\n}/)?.[0] || '';
    const recorder = source.match(/(?:function auth_record_login|async function authRecordLogin)[\s\S]*?\n}/)?.[0] || '';

    assert.match(limiter, /EmployeeID=\?/i, `${runtime}: login limiter must be scoped to the employee account`);
    assert.doesNotMatch(limiter, /IPAddress=\?/i, `${runtime}: shared IP must not lock unrelated employee accounts`);
    assert.match(limiter, /scope['"]?\s*(?:=>|:)\s*['"]employee['"]/i, `${runtime}: rate-limit audit scope is missing`);
    assert.match(recorder, /Successful=0 AND EmployeeID=\?/i, `${runtime}: successful login must clear only that employee's failures`);
    assert.doesNotMatch(recorder, /Successful=0 AND IPAddress=\?/i, `${runtime}: successful login must not clear failures for unrelated accounts`);
}

assert.match(php, /mb_substr\(trim\(\$employeeId\), 0, 80\)/, 'PHP employee ID normalization is missing');
assert.match(node, /String\(employeeId \|\| ''\)\.trim\(\)\.slice\(0, 80\)/, 'Node employee ID normalization is missing');

console.log('Login rate-limit account scope: PASS (shared IP cannot lock unrelated employee accounts)');
