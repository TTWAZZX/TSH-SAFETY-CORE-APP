'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');

const baseUrl = String(
    process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core'
).replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');

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
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) {}
    return { response, payload, text };
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');

    const login = await request('/api/login', {
        method: 'POST',
        body: { employeeId: adminId, password: adminPassword },
    });
    assert.strictEqual(login.response.status, 200, `Login failed: ${login.text.slice(0, 300)}`);
    assert.ok(login.payload?.token, 'Login token missing');
    assert.strictEqual(login.payload?.user?.Role || login.payload?.user?.role, 'Admin', 'Admin role required');
    const token = login.payload.token;

    const [profile, employees, readiness] = await Promise.all([
        request('/api/profile', { token }),
        request('/api/admin/employees', { token }),
        request('/api/admin/email-readiness', { token }),
    ]);

    assert.strictEqual(profile.response.status, 200, `Profile failed: ${profile.text.slice(0, 300)}`);
    assert.strictEqual(employees.response.status, 200, `Employees failed: ${employees.text.slice(0, 300)}`);
    assert.strictEqual(readiness.response.status, 200, `Readiness failed: ${readiness.text.slice(0, 300)}`);
    assert.strictEqual(readiness.payload?.success, true, 'Email readiness success flag missing');

    const profileData = profile.payload?.data || {};
    assert.ok(Object.prototype.hasOwnProperty.call(profileData, 'CompanyEmail'), 'Profile CompanyEmail missing');
    assert.ok(profileData.CompanyEmailState && typeof profileData.CompanyEmailState === 'object', 'CompanyEmailState missing');
    assert.strictEqual(profileData.CompanyEmailState.deliveryEnabled, true, 'Company Email delivery must be enabled');

    const rows = employees.payload?.data;
    assert.ok(Array.isArray(rows), 'Employee list missing');
    const withEmail = rows.filter(row => String(row.CompanyEmail || '').trim()).length;
    assert.strictEqual(rows.length, 2537, 'Employee count changed from predeploy baseline');
    assert.strictEqual(withEmail, 120, 'Company Email count changed from predeploy baseline');

    const result = {
        success: true,
        login: 'PASS (normal login audit side effect only)',
        profileHasCompanyEmail: true,
        profileHasCompanyEmailState: true,
        companyEmailDeliveryEnabled: true,
        emailReadinessSuccess: true,
        employeeCount: rows.length,
        companyEmailCount: withEmail,
        mutationRequests: 0,
    };
    console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
