'use strict';

// Phase 8 local-only write UAT. Every row uses a unique run prefix and is
// removed by exact primary key/EmployeeID in finally before fingerprints are
// compared with the pre-run baseline.

process.env.EMAIL_ENABLED = 'false';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const xlsx = require('xlsx');

const db = require('../db');
const app = require('../server');
const { smtpConfigured } = require('../utils/email');
const {
    CROSS_PATH_OPERATION,
    executeEmployeeProfileWrite,
} = require('../services/employee-profile-write');
const { resolveEmployeeOnboarding } = require('../utils/onboarding-resolver');

const projectRoot = path.resolve(__dirname, '..', '..');
const phpRunner = path.join(projectRoot, 'api', 'tests', 'uat_token_runner.php');
const phpBin = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const phpBase = process.env.PHP_UAT_BASE
    || 'http://127.0.0.1/tsh-safety-core/api/index.php';

const runPrefix = `U8${Date.now().toString(36).toUpperCase()}`;
const ids = Object.freeze({
    admin: `${runPrefix}A`,
    user: `${runPrefix}U`,
    nodeCreate: `${runPrefix}NC`,
    phpCreate: `${runPrefix}PC`,
    nodeUnknown: `${runPrefix}NX`,
    phpUnknown: `${runPrefix}PX`,
    nodeAtomicGood: `${runPrefix}NAG`,
    nodeAtomicBad: `${runPrefix}NAB`,
    phpAtomicGood: `${runPrefix}PAG`,
    phpAtomicBad: `${runPrefix}PAB`,
    nodePartialGood: `${runPrefix}NPG`,
    nodePartialBad: `${runPrefix}NPB`,
    phpPartialGood: `${runPrefix}PPG`,
    phpPartialBad: `${runPrefix}PPB`,
    nodeFlow: `${runPrefix}NF`,
    phpFlow: `${runPrefix}PF`,
    nodeRegistration: `${runPrefix}NR`,
    phpRegistration: `${runPrefix}PR`,
    nodeForbidden: `${runPrefix}N403`,
    phpForbidden: `${runPrefix}P403`,
});
const allIds = Object.values(ids);

let server = null;
let nodeBase = '';
let baseline = null;
let masters = null;
const results = [];

function localSafetyGate() {
    const dbHost = String(process.env.DB_HOST || '').trim().toLowerCase();
    const dbName = String(process.env.DB_NAME || '').trim().toLowerCase();
    const publicUrl = String(process.env.PUBLIC_UPLOAD_BASE_URL || '').trim().toLowerCase();
    assert(['localhost', '127.0.0.1', '::1'].includes(dbHost), `Refusing non-local DB_HOST: ${dbHost}`);
    assert(/(?:uat|test|local|dev)/i.test(dbName), `Refusing database without a UAT/test marker: ${dbName}`);
    assert(!publicUrl || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(publicUrl),
        `Refusing non-local public URL: ${publicUrl}`);
    assert.strictEqual(smtpConfigured(), false, 'SMTP must be disabled for local UAT');
}

function hashRows(rows) {
    return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function tableFingerprint(table, orderBy) {
    const allowed = new Set(['employees', 'registration_requests', 'admin_auditlogs', 'auth_login_attempts']);
    assert(allowed.has(table));
    const [rows] = await db.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
    return { count: rows.length, hash: hashRows(rows) };
}

async function schemaFingerprint() {
    const [rows] = await db.query(
        `SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE()
           AND LOWER(TABLE_NAME) IN ('employees','registrationrequests','auth_login_attempts','admin_auditlogs')
         ORDER BY LOWER(TABLE_NAME),ORDINAL_POSITION`
    );
    return hashRows(rows);
}

async function snapshot() {
    return {
        employees: await tableFingerprint('employees', 'EmployeeID'),
        registrations: await tableFingerprint('registration_requests', 'ID'),
        audits: await tableFingerprint('admin_auditlogs', 'id'),
        loginAttempts: await tableFingerprint('auth_login_attempts', 'ID'),
        schema: await schemaFingerprint(),
    };
}

function placeholders(values) {
    return values.map(() => '?').join(',');
}

async function cleanup() {
    if (server) {
        await new Promise(resolve => server.close(resolve));
        server = null;
    }
    await new Promise(resolve => setTimeout(resolve, 600));

    const [registrationRows] = await db.query(
        `SELECT ID FROM registration_requests WHERE EmployeeID IN (${placeholders(allIds)})`,
        allIds
    );
    const registrationIds = registrationRows.map(row => Number(row.ID));
    const auditConditions = [
        `AdminID IN (${placeholders(allIds)})`,
        `TargetID IN (${placeholders(allIds)})`,
    ];
    const auditParams = [...allIds, ...allIds];
    if (registrationIds.length) {
        auditConditions.push(`(TargetType='RegistrationRequest' AND TargetID IN (${placeholders(registrationIds)}))`);
        auditParams.push(...registrationIds.map(String));
    }
    const [auditRows] = await db.query(
        `SELECT id FROM admin_auditlogs WHERE ${auditConditions.join(' OR ')}`,
        auditParams
    );
    const auditIds = auditRows.map(row => Number(row.id));
    const [attemptRows] = await db.query(
        `SELECT ID FROM auth_login_attempts WHERE EmployeeID IN (${placeholders(allIds)})`,
        allIds
    );
    const attemptIds = attemptRows.map(row => Number(row.ID));

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        if (auditIds.length) {
            await connection.query(`DELETE FROM admin_auditlogs WHERE id IN (${placeholders(auditIds)})`, auditIds);
        }
        if (attemptIds.length) {
            await connection.query(`DELETE FROM auth_login_attempts WHERE ID IN (${placeholders(attemptIds)})`, attemptIds);
        }
        if (registrationIds.length) {
            await connection.query(`DELETE FROM registration_requests WHERE ID IN (${placeholders(registrationIds)})`, registrationIds);
        }
        await connection.query(`DELETE FROM employees WHERE EmployeeID IN (${placeholders(allIds)})`, allIds);
        await connection.commit();
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }

    const [residueEmployees] = await db.query(
        `SELECT EmployeeID FROM employees WHERE EmployeeID IN (${placeholders(allIds)})`, allIds
    );
    const [residueRegistrations] = await db.query(
        `SELECT ID FROM registration_requests WHERE EmployeeID IN (${placeholders(allIds)})`, allIds
    );
    const [residueAudits] = await db.query(
        `SELECT id FROM admin_auditlogs WHERE AdminID IN (${placeholders(allIds)}) OR TargetID IN (${placeholders(allIds)})`,
        [...allIds, ...allIds]
    );
    const [residueAttempts] = await db.query(
        `SELECT ID FROM auth_login_attempts WHERE EmployeeID IN (${placeholders(allIds)})`, allIds
    );
    assert.strictEqual(residueEmployees.length, 0, 'Employee residue remains');
    assert.strictEqual(residueRegistrations.length, 0, 'Registration residue remains');
    assert.strictEqual(residueAudits.length, 0, 'Audit residue remains');
    assert.strictEqual(residueAttempts.length, 0, 'Login-attempt residue remains');
}

async function seedEmployee(employeeId, { role = 'User', unit = masters.unit, password, mustChange = 0 } = {}) {
    const connection = await db.getConnection();
    try {
        return await executeEmployeeProfileWrite({
            connection,
            operation: CROSS_PATH_OPERATION.CREATE,
            employeeId,
            profilePayload: {
                EmployeeName: `Local UAT ${employeeId}`,
                Department: masters.department,
                Unit: unit,
                Position: masters.position,
            },
            protectedFields: {
                Role: role,
                Password: password ?? null,
                MustChangePassword: mustChange,
            },
        });
    } finally {
        connection.release();
    }
}

function userPayload(employeeId, role, mustChangePassword = false, unit = masters.unit) {
    return {
        id: employeeId,
        name: `Local UAT ${employeeId}`,
        department: masters.department,
        unit,
        team: '',
        position: masters.position,
        role,
        mustChangePassword,
    };
}

function nodeToken(payload) {
    assert(process.env.JWT_SECRET, 'JWT_SECRET is not configured');
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function phpToken(payload) {
    const child = spawnSync(phpBin, [phpRunner], {
        cwd: projectRoot,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, EMAIL_ENABLED: 'false' },
    });
    if (child.status !== 0) throw new Error(`PHP token runner failed: ${child.stderr || child.stdout}`);
    const token = String(child.stdout || '').trim();
    assert(token.split('.').length === 3, 'PHP token runner returned an invalid JWT');
    return token;
}

async function apiRequest(kind, route, { method = 'GET', token, body, form } = {}) {
    const headers = { 'User-Agent': `TSH-Phase8-UAT/${runPrefix}` };
    if (token) headers.Authorization = `Bearer ${token}`;
    let requestBody;
    if (form) {
        requestBody = form;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
    }
    const url = kind === 'node'
        ? `${nodeBase}${route}`
        : `${phpBase}?route=${encodeURIComponent(route.replace(/^\//, ''))}`;
    const response = await fetch(url, { method, headers, body: requestBody });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}
    return { status: response.status, json, text };
}

async function check(name, callback) {
    await callback();
    results.push(name);
    console.log(`PASS ${name}`);
}

function assertStatus(response, expected, context) {
    assert.strictEqual(response.status, expected,
        `${context}: expected ${expected}, received ${response.status}: ${response.text.slice(0, 500)}`);
}

async function loadMasters() {
    const [[row]] = await db.query(
        `SELECT d.id departmentId,d.Name department,u.name unit,p.Name position
         FROM master_departments d
         JOIN master_safetyunits u ON u.department_id=d.id
         CROSS JOIN master_positions p
         WHERE d.Name IS NOT NULL AND TRIM(d.Name)<>''
           AND u.name IS NOT NULL AND TRIM(u.name)<>''
           AND p.Name IS NOT NULL AND TRIM(p.Name)<>''
         ORDER BY d.id,u.id,p.id LIMIT 1`
    );
    assert(row, 'No valid department/unit/position combination exists');
    return row;
}

async function chooseRegistrationPosition() {
    const response = await apiRequest('node', '/register/options');
    assertStatus(response, 200, 'Node registration options');
    const required = new Set((response.json?.data?.requiredEmailPositionIds || []).map(Number));
    const position = (response.json?.data?.positions || []).find(row => !required.has(Number(row.id)));
    assert(position, 'UAT requires at least one position that does not require CompanyEmail');
    return String(position.Name);
}

async function runBackendSuite(kind, token, userToken, registrationPosition) {
    const isNode = kind === 'node';
    const createId = isNode ? ids.nodeCreate : ids.phpCreate;
    const unknownId = isNode ? ids.nodeUnknown : ids.phpUnknown;
    const atomicGood = isNode ? ids.nodeAtomicGood : ids.phpAtomicGood;
    const atomicBad = isNode ? ids.nodeAtomicBad : ids.phpAtomicBad;
    const partialGood = isNode ? ids.nodePartialGood : ids.phpPartialGood;
    const partialBad = isNode ? ids.nodePartialBad : ids.phpPartialBad;
    const flowId = isNode ? ids.nodeFlow : ids.phpFlow;
    const registrationId = isNode ? ids.nodeRegistration : ids.phpRegistration;
    const forbiddenId = isNode ? ids.nodeForbidden : ids.phpForbidden;

    await check(`${kind}: public registration options`, async () => {
        const response = await apiRequest(kind, '/register/options');
        assertStatus(response, 200, `${kind} options`);
        assert(response.json?.data?.departments?.length > 0);
    });

    await check(`${kind}: non-admin authorization`, async () => {
        const response = await apiRequest(kind, '/admin/employee/create', {
            method: 'POST', token: userToken,
            body: { EmployeeID: forbiddenId, EmployeeName: 'Forbidden UAT' },
        });
        assertStatus(response, 403, `${kind} authorization`);
        const [[row]] = await db.query('SELECT EmployeeID FROM employees WHERE EmployeeID=?', [forbiddenId]);
        assert.strictEqual(row, undefined);
    });

    await check(`${kind}: admin create canonical profile`, async () => {
        const response = await apiRequest(kind, '/admin/employee/create', {
            method: 'POST', token,
            body: {
                EmployeeID: createId,
                EmployeeName: `  Local UAT ${kind} Create  `,
                Department: ` ${masters.department}\r\n`,
                Unit: ` ${masters.unit}\n`,
                Position: ` ${masters.position}\r`,
                Role: 'User',
            },
        });
        assertStatus(response, 200, `${kind} create`);
        assert.strictEqual(response.json?.onboardingStatus, 'PASSWORD_CHANGE_REQUIRED');
        const [[row]] = await db.query('SELECT Department,Unit,Position FROM employees WHERE EmployeeID=?', [createId]);
        assert.deepStrictEqual(
            { Department: row.Department, Unit: row.Unit, Position: row.Position },
            { Department: masters.department, Unit: masters.unit, Position: masters.position }
        );
    });

    await check(`${kind}: invalid department fails closed`, async () => {
        const response = await apiRequest(kind, '/admin/employee/create', {
            method: 'POST', token,
            body: {
                EmployeeID: unknownId,
                EmployeeName: 'Unknown Department UAT',
                Department: `${runPrefix}-UNKNOWN`,
                Unit: '',
                Position: masters.position,
            },
        });
        assertStatus(response, 422, `${kind} unknown department`);
        assert.strictEqual(response.json?.code, 'INVALID_DEPARTMENT');
        const [[row]] = await db.query('SELECT EmployeeID FROM employees WHERE EmployeeID=?', [unknownId]);
        assert.strictEqual(row, undefined);
    });

    await check(`${kind}: partial update idempotency and rollback`, async () => {
        const same = await apiRequest(kind, `/employees/${encodeURIComponent(createId)}`, {
            method: 'PUT', token,
            body: { Department: masters.department, Unit: masters.unit },
        });
        assertStatus(same, 200, `${kind} idempotent update`);
        assert.strictEqual(same.json?.idempotent, true);
        const before = await db.query('SELECT EmployeeName,Department,Unit,Position FROM employees WHERE EmployeeID=?', [createId]);
        const invalid = await apiRequest(kind, `/employees/${encodeURIComponent(createId)}`, {
            method: 'PUT', token,
            body: { Department: `${runPrefix}-UNKNOWN`, Unit: '' },
        });
        assertStatus(invalid, 422, `${kind} invalid update`);
        const after = await db.query('SELECT EmployeeName,Department,Unit,Position FROM employees WHERE EmployeeID=?', [createId]);
        assert.deepStrictEqual(after[0], before[0]);
    });

    await check(`${kind}: JSON import atomic rollback`, async () => {
        const response = await apiRequest(kind, '/admin/employees/import', {
            method: 'POST', token,
            body: { data: [
                { EmployeeID: atomicGood, EmployeeName: 'Atomic Good', Department: masters.department, Unit: masters.unit, Position: masters.position },
                { EmployeeID: atomicBad, EmployeeName: 'Atomic Bad', Department: `${runPrefix}-UNKNOWN`, Unit: '', Position: masters.position },
            ] },
        });
        assertStatus(response, 422, `${kind} atomic import`);
        const [rows] = await db.query('SELECT EmployeeID FROM employees WHERE EmployeeID IN (?,?)', [atomicGood, atomicBad]);
        assert.strictEqual(rows.length, 0);
    });

    await check(`${kind}: partial import isolates invalid row`, async () => {
        let response;
        const rows = [
            { EmployeeID: partialGood, EmployeeName: 'Partial Good', Department: masters.department, Unit: masters.unit, Position: masters.position },
            { EmployeeID: partialBad, EmployeeName: 'Partial Bad', Department: `${runPrefix}-UNKNOWN`, Unit: '', Position: masters.position },
        ];
        if (isNode) {
            const sheet = xlsx.utils.json_to_sheet(rows);
            const workbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(workbook, sheet, 'Employees');
            const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            const form = new FormData();
            form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'phase8-uat.xlsx');
            response = await apiRequest(kind, '/admin/employee/import', { method: 'POST', token, form });
        } else {
            const form = new FormData();
            form.append('rows', JSON.stringify(rows));
            response = await apiRequest(kind, '/admin/employee/import', { method: 'POST', token, form });
        }
        assertStatus(response, 200, `${kind} partial import`);
        assert.strictEqual(Number(response.json?.successCount), 1);
        assert.strictEqual(Number(response.json?.errorCount), 1);
        const [created] = await db.query('SELECT EmployeeID FROM employees WHERE EmployeeID IN (?,?) ORDER BY EmployeeID', [partialGood, partialBad]);
        assert.deepStrictEqual(created.map(row => row.EmployeeID), [partialGood]);
    });

    await check(`${kind}: password then Safety Unit continuation`, async () => {
        const initial = await apiRequest(kind, '/profile', { token: isNode ? nodeToken(userPayload(flowId, 'User', true, '')) : phpToken(userPayload(flowId, 'User', true, '')) });
        assertStatus(initial, 428, `${kind} password gate`);
        assert.strictEqual(initial.json?.code, 'PASSWORD_CHANGE_REQUIRED');
        const changed = await apiRequest(kind, '/change-password', {
            method: 'POST',
            token: isNode ? nodeToken(userPayload(flowId, 'User', true, '')) : phpToken(userPayload(flowId, 'User', true, '')),
            body: { currentPassword: `${runPrefix}!Temp9`, newPassword: `${runPrefix}!Ready9` },
        });
        assertStatus(changed, 200, `${kind} password continuation`);
        assert.strictEqual(changed.json?.onboardingStatus, 'SAFETY_UNIT_REQUIRED');
        const gated = await apiRequest(kind, '/profile', { token: changed.json.token });
        assertStatus(gated, 428, `${kind} Safety Unit gate`);
        assert.strictEqual(gated.json?.code, 'SAFETY_UNIT_REQUIRED');
        const selected = await apiRequest(kind, '/profile/safety-unit', {
            method: 'PUT', token: changed.json.token, body: { Unit: ` ${masters.unit}\r\n` },
        });
        assertStatus(selected, 200, `${kind} Safety Unit continuation`);
        assert.strictEqual(selected.json?.onboardingStatus, 'READY');
        const ready = await apiRequest(kind, '/profile', { token: selected.json.token });
        assertStatus(ready, 200, `${kind} ready profile`);
        const selfUpdate = await apiRequest(kind, '/profile', {
            method: 'PUT', token: selected.json.token,
            body: {
                EmployeeName: `Local UAT ${kind} Ready`,
                Department: masters.department,
                Unit: masters.unit,
                Position: masters.position,
            },
        });
        assertStatus(selfUpdate, 200, `${kind} self profile update`);
        assert.strictEqual(selfUpdate.json?.onboardingStatus, 'READY');
    });

    await check(`${kind}: registration approval concurrency`, async () => {
        const registration = await apiRequest(kind, '/register', {
            method: 'POST',
            body: {
                EmployeeID: registrationId,
                EmployeeName: `Local UAT ${kind} Registration`,
                Department: masters.department,
                Unit: '',
                Position: registrationPosition,
                CompanyEmail: '',
                password: `${runPrefix}!Register9`,
                RegistrationMode: 'new',
                Website: '',
            },
        });
        assertStatus(registration, 202, `${kind} registration`);
        const [[request]] = await db.query('SELECT ID,CompanyEmail FROM registration_requests WHERE EmployeeID=?', [registrationId]);
        assert(request?.ID, `${kind} registration request not found`);
        assert(!request.CompanyEmail, `${kind} registration unexpectedly has an email recipient`);
        const route = `/admin/registration-requests/${request.ID}/approve`;
        const approvals = await Promise.all([
            apiRequest(kind, route, { method: 'POST', token, body: {} }),
            apiRequest(kind, route, { method: 'POST', token, body: {} }),
        ]);
        assert.deepStrictEqual(approvals.map(item => item.status).sort((a, b) => a - b), [200, 409]);
        const status = await resolveEmployeeOnboarding(db, registrationId);
        assert.strictEqual(status, 'SAFETY_UNIT_REQUIRED');
    });
}

async function main() {
    localSafetyGate();
    const [[identity]] = await db.query('SELECT DATABASE() db,@@hostname host,@@port port');
    assert(/(?:uat|test|local|dev)/i.test(String(identity.db || '')));
    baseline = await snapshot();
    masters = await loadMasters();

    const adminHash = await bcrypt.hash(`${runPrefix}!Admin9`, 10);
    const userHash = await bcrypt.hash(`${runPrefix}!User9`, 10);
    const flowHash = await bcrypt.hash(`${runPrefix}!Temp9`, 10);
    await seedEmployee(ids.admin, { role: 'Admin', password: adminHash, mustChange: 0 });
    await seedEmployee(ids.user, { role: 'User', password: userHash, mustChange: 0 });
    await seedEmployee(ids.nodeFlow, { role: 'User', unit: '', password: flowHash, mustChange: 1 });
    await seedEmployee(ids.phpFlow, { role: 'User', unit: '', password: flowHash, mustChange: 1 });

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    nodeBase = `http://127.0.0.1:${server.address().port}/api`;

    const adminPayload = userPayload(ids.admin, 'Admin');
    const readyUserPayload = userPayload(ids.user, 'User');
    const registrationPosition = await chooseRegistrationPosition();

    console.log(`Phase 8 local UAT run ${runPrefix}`);
    console.log(`Database ${identity.db} on ${identity.host}:${identity.port}; email delivery disabled.`);
    await runBackendSuite('node', nodeToken(adminPayload), nodeToken(readyUserPayload), registrationPosition);
    await runBackendSuite('php', phpToken(adminPayload), phpToken(readyUserPayload), registrationPosition);
}

(async () => {
    let failure = null;
    try {
        await main();
    } catch (error) {
        failure = error;
        console.error(`FAIL ${error.stack || error.message || error}`);
    }

    try {
        await cleanup();
        if (baseline) {
            const after = await snapshot();
            assert.deepStrictEqual(after, baseline, 'Database fingerprint changed after UAT cleanup');
        }
        console.log(`CLEANUP PASS: zero synthetic residue; baseline fingerprints restored.`);
    } catch (cleanupError) {
        console.error(`CLEANUP FAIL ${cleanupError.stack || cleanupError.message || cleanupError}`);
        failure = failure || cleanupError;
    } finally {
        await db.end().catch(() => {});
    }

    console.log(`Phase 8 local UAT: ${results.length} checks passed.`);
    if (failure) process.exitCode = 1;
})();
