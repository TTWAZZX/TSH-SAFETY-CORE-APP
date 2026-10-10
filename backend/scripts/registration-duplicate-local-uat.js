'use strict';

process.env.EMAIL_ENABLED = 'false';

const assert = require('assert');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = require('../server');

const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`.toUpperCase();
let adminToken;
const employeeIds = [`RUN${stamp}`, `RUP${stamp}`];
const requestIds = [];
let nodeServer;
let phpServer;

function guardLocal() {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    const name = String(process.env.DB_NAME || '').trim();
    assert(['localhost', '127.0.0.1', '::1'].includes(host), `Refusing non-loopback DB_HOST: ${host}`);
    assert(/(?:uat|test|local|dev)/i.test(name), `Refusing database without local/test marker: ${name}`);
}

async function request(url, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (auth) headers.Authorization = `Bearer ${adminToken}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : {} };
}

async function seed(employeeId, referenceCode) {
    const originalPassword = `$2a$10$${'a'.repeat(53)}`;
    await db.query(
        `INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [employeeId, 'Registration Duplicate UAT', 'Safety', 'Core', '', 'Officer', 'User', originalPassword, 0]
    );
    const [created] = await db.query(
        `INSERT INTO registration_requests
         (ReferenceCode,EmployeeID,EmployeeName,Department,Unit,Position,CompanyEmail,PasswordHash,Status)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        [referenceCode, employeeId, 'Registration Duplicate UAT', 'Safety', 'Core', 'Officer', null, 'pending-password-must-be-cleared', 'Pending']
    );
    requestIds.push(Number(created.insertId));
    return { requestId: Number(created.insertId), originalPassword };
}

async function lifecycle(label, base, employeeId, referenceCode) {
    const seeded = await seed(employeeId, referenceCode);
    const [[directMatch]] = await db.query(
        `SELECT CASE WHEN e.EmployeeID IS NULL THEN 0 ELSE 1 END EmployeeExists,
                CASE WHEN e.Password IS NULL OR e.Password='' THEN 0 ELSE 1 END ExistingAccountActive
         FROM registration_requests r LEFT JOIN Employees e ON e.EmployeeID=r.EmployeeID
         WHERE r.ID=?`,
        [seeded.requestId]
    );
    assert.deepStrictEqual(
        [Number(directMatch.EmployeeExists), Number(directMatch.ExistingAccountActive)],
        [1, 1],
        `${label} direct master match failed`
    );
    const separator = base.includes('?') ? '&' : '?';
    const list = await request(`${base}${separator}status=Pending&q=${encodeURIComponent(employeeId)}`);
    assert.strictEqual(list.status, 200, `${label} pending list failed`);
    const row = (list.json.data || []).find(item => item.EmployeeID === employeeId);
    assert(row, `${label} pending row missing`);
    assert.strictEqual(Number(row.EmployeeExists), 1, `${label} master match missing`);
    assert.strictEqual(Number(row.ExistingAccountActive), 1, `${label} active account marker missing`);

    const approveBase = label === 'node'
        ? `${base}/${seeded.requestId}/approve`
        : base.replace('registration-requests', `registration-requests/${seeded.requestId}/approve`);
    const approved = await request(approveBase, { method: 'POST', body: {} });
    assert.strictEqual(approved.status, 200, `${label} duplicate close failed: ${JSON.stringify(approved.json)}`);
    assert.strictEqual(approved.json.code, 'REGISTRATION_DUPLICATE_CLOSED');
    assert.strictEqual(approved.json.resolution, 'duplicate_closed');

    const [[registration]] = await db.query(
        'SELECT Status,RejectionReason,PasswordHash FROM registration_requests WHERE ID=?',
        [seeded.requestId]
    );
    const [[employee]] = await db.query('SELECT Password FROM Employees WHERE EmployeeID=?', [employeeId]);
    assert.strictEqual(registration.Status, 'Cancelled');
    assert.match(registration.RejectionReason, /Employee Master/);
    assert.strictEqual(registration.PasswordHash, null);
    assert.strictEqual(employee.Password, seeded.originalPassword, `${label} existing password changed`);

    const statusUrl = label === 'node'
        ? base.replace('/admin/registration-requests', '/register/status')
        : base.replace('admin/registration-requests', 'register/status');
    const status = await request(statusUrl, {
        method: 'POST', auth: false, body: { EmployeeID: employeeId, ReferenceCode: referenceCode },
    });
    assert.strictEqual(status.status, 200, `${label} applicant status failed`);
    assert.strictEqual(status.json.data.status, 'Cancelled');
    assert.match(status.json.data.rejectionReason, /Employee Master/);

    const pendingAfter = await request(`${base}${separator}status=Pending&q=${encodeURIComponent(employeeId)}`);
    assert.strictEqual(pendingAfter.status, 200);
    assert.strictEqual((pendingAfter.json.data || []).some(item => item.EmployeeID === employeeId), false);
    console.log(`PASS ${label}: duplicate request closed, existing account unchanged, pending row removed`);
}

async function waitFor(url) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const response = await fetch(url);
            if (response.status < 500) return;
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Fixture did not start: ${url}`);
}

async function cleanup() {
    if (nodeServer) await new Promise(resolve => nodeServer.close(resolve));
    if (phpServer && phpServer.exitCode === null) phpServer.kill();
    await new Promise(resolve => setTimeout(resolve, 250));
    if (requestIds.length) {
        await db.query(`DELETE FROM Admin_AuditLogs WHERE (TargetType='RegistrationRequest' AND TargetID IN (${requestIds.map(() => '?').join(',')})) OR TargetID IN (?,?)`, [...requestIds, ...employeeIds]).catch(() => {});
    }
    await db.query('DELETE FROM registration_requests WHERE EmployeeID IN (?,?)', employeeIds).catch(() => {});
    await db.query('DELETE FROM Employees WHERE EmployeeID IN (?,?)', employeeIds).catch(() => {});
    const [[residue]] = await db.query(
        `SELECT
           (SELECT COUNT(*) FROM registration_requests WHERE EmployeeID IN (?,?)) registrations,
           (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (?,?)) employees`,
        [...employeeIds, ...employeeIds]
    );
    assert.deepStrictEqual([Number(residue.registrations), Number(residue.employees)], [0, 0]);
    await db.end();
}

(async () => {
    let failure;
    try {
        guardLocal();
        const [[admin]] = await db.query(
            "SELECT EmployeeID,EmployeeName,Role FROM Employees WHERE Role='Admin' ORDER BY EmployeeID LIMIT 1"
        );
        assert(admin?.EmployeeID, 'Local UAT requires an existing Admin identity');
        adminToken = jwt.sign({
            id: admin.EmployeeID,
            EmployeeID: admin.EmployeeID,
            name: admin.EmployeeName || 'Local Admin',
            role: 'Admin',
            onboardingStatus: 'READY',
        }, process.env.JWT_SECRET, { expiresIn: '10m' });
        nodeServer = app.listen(0, '127.0.0.1');
        await new Promise((resolve, reject) => {
            nodeServer.once('listening', resolve);
            nodeServer.once('error', reject);
        });
        const nodeBase = `http://127.0.0.1:${nodeServer.address().port}/api/admin/registration-requests`;

        const phpPort = 18000 + Math.floor(Math.random() * 1000);
        phpServer = spawn(process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe', [
            '-d', 'display_errors=0', '-S', `127.0.0.1:${phpPort}`, '-t', require('path').resolve(__dirname, '..', '..'),
        ], { env: { ...process.env, EMAIL_ENABLED: 'false' }, stdio: 'ignore', windowsHide: true });
        const phpBase = `http://127.0.0.1:${phpPort}/api/index.php?route=admin/registration-requests`;
        await waitFor(`http://127.0.0.1:${phpPort}/api/index.php?route=register/options`);

        await lifecycle('node', nodeBase, employeeIds[0], `REF-N-${stamp}`);
        await lifecycle('php', phpBase, employeeIds[1], `REF-P-${stamp}`);
    } catch (error) {
        failure = error;
        console.error(error.stack || error);
    }
    try {
        await cleanup();
        console.log('CLEANUP PASS: zero registration/employee residue');
    } catch (error) {
        failure = failure || error;
        console.error(error.stack || error);
    }
    if (failure) process.exitCode = 1;
})();
