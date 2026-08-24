'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');

const baseUrl = String(
    process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core'
).replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const userId = String(process.env.PROD_UAT_USER_ID || '').trim();
const userPassword = String(process.env.PROD_UAT_USER_PASSWORD || '');
const checks = [];

function pass(name, detail = '') {
    checks.push({ name, detail });
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
}

async function request(relative, { method = 'GET', token, body } = {}) {
    const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${relative}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { response, text, json };
}

async function staticText(relative) {
    const response = await fetch(`${baseUrl}${relative}`, {
        headers: { 'Cache-Control': 'no-cache' },
    });
    assert.strictEqual(response.status, 200, `${relative} must return 200`);
    return response.text();
}

async function login(employeeId, password, expectedRole) {
    const result = await request('/api/login', {
        method: 'POST',
        body: { employeeId, password },
    });
    assert.strictEqual(result.response.status, 200, `Login failed: ${result.text.slice(0, 300)}`);
    assert.ok(result.json?.token, 'Login token missing');
    const role = result.json?.user?.Role || result.json?.user?.role;
    if (expectedRole === 'non-admin') {
        assert.notStrictEqual(role, 'Admin', 'Ordinary UAT account must not be Admin');
    } else {
        assert.strictEqual(role, expectedRole, `Expected ${expectedRole} login role`);
    }
    return { token: result.json.token, role };
}

async function main() {
    assert.ok(adminId && adminPassword && userId && userPassword, 'Production UAT credentials are required');

    const index = await staticText('/index.html');
    assert.ok(index.includes('20260824-employee-sort-r1'), 'Index cache marker missing');
    pass('Production index cache marker');

    const mainSource = await staticText('/public/js/main.js');
    assert.ok(mainSource.includes('admin.js?v=20260824-employee-sort-r1'), 'Admin cache marker missing');
    pass('Production Admin module cache marker');

    const adminSource = await staticText('/public/js/pages/admin.js');
    assert.ok(adminSource.includes('emp-recent-additions'), 'Recent additions UI missing');
    assert.ok(adminSource.includes('เพิ่มเฉพาะ EmployeeID ใหม่เท่านั้น'), 'Create-only import message missing');
    assert.ok(adminSource.includes('emp-sort-filter'), 'Employee sort control missing');
    assert.ok(adminSource.includes('_empRecentSourceFilter'), 'Recent source filter missing');
    pass('Production Employee Master UI contracts');

    const employeeSource = await staticText('/public/js/pages/employee.js');
    assert.ok(employeeSource.includes('duplicateCount'), 'Legacy import duplicate summary missing');
    pass('Production legacy Employee import contract');

    const adminLogin = await login(adminId, adminPassword, 'Admin');
    pass('Authenticated Production Admin login', 'normal login audit side effect only');

    const employees = await request('/api/admin/employees', { token: adminLogin.token });
    assert.strictEqual(employees.response.status, 200, `Admin employees failed: ${employees.text.slice(0, 300)}`);
    assert.ok(Array.isArray(employees.json?.data), 'Admin employees data must be an array');
    const timestampedEmployees = employees.json.data.filter(row => row.CreatedAt);
    assert.ok(timestampedEmployees.length > 0, 'Admin employees must include at least one creation timestamp');
    assert.ok(timestampedEmployees.every(row => ['manual', 'import'].includes(row.CreationSource)), 'Unexpected employee creation source');
    pass('Admin employee creation metadata', `${timestampedEmployees.length}/${employees.json.data.length} timestamped`);

    const recent = await request('/api/admin/employee/recent-additions', { token: adminLogin.token });
    assert.strictEqual(recent.response.status, 200, `Recent additions failed: ${recent.text.slice(0, 300)}`);
    assert.strictEqual(recent.json?.success, true, 'Recent additions success flag missing');
    assert.ok(Array.isArray(recent.json?.data), 'Recent additions data must be an array');
    assert.ok(recent.json.data.length <= 5, 'Recent additions default limit must be five');
    for (const row of recent.json.data) {
        assert.ok(row.EmployeeID && row.EmployeeName, 'Recent employee identity missing');
        assert.ok(['manual', 'import'].includes(row.Source), 'Unexpected recent employee source');
    }
    pass('Admin recent additions API', `${recent.json.data.length} rows`);

    const unauthenticated = await request('/api/admin/employee/recent-additions');
    assert.strictEqual(unauthenticated.response.status, 401, 'Unauthenticated recent additions must return 401');
    pass('Unauthenticated permission boundary', '401');

    const userLogin = await login(userId, userPassword, 'non-admin');
    const forbidden = await request('/api/admin/employee/recent-additions', { token: userLogin.token });
    assert.strictEqual(forbidden.response.status, 403, 'Ordinary user recent additions must return 403');
    pass('Ordinary user permission boundary', `${userLogin.role}: 403`);

    console.log(`Employee Master Production read-only UAT: ${checks.length}/${checks.length} passed.`);
}

main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
