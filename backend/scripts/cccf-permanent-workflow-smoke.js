// Focused CCCF Form A Permanent workflow smoke.
// Verifies Excel review, signed PDF upload, direct signed PDF, admin complete,
// and CCCF email outbox events without requiring SMTP to be configured.

const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FAILED: JWT_SECRET is not configured.');
    process.exit(1);
}

const RUN = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const ADMIN_ID = `CCFA${RUN}`;
const USER_ID = `CCFU${RUN}`;
const DIRECT_ID = `CCFD${RUN}`;
const NOEMAIL_ID = `CCFN${RUN}`;
const RECIPIENT = process.env.CCCF_SMOKE_EMAIL || process.env.CCCF_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'sattaya_w@thaisummit-harness.co.th';
const department = 'SAFETY HEALTH & ENVIRONMENT SEC.';
const today = new Date().toISOString().slice(0, 10);

function tokenFor(role, id, name) {
    return jwt.sign(
        { id, EmployeeID: id, name, EmployeeName: name, department, Department: department, role },
        JWT_SECRET,
        { expiresIn: '30m' }
    );
}

async function api(base, path, { method = 'GET', token, body, form, expect = 200 } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
        payload = form;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (res.status !== expect) {
        const message = json.message || json.error || text || `${method} ${path} failed`;
        throw new Error(`${method} ${path} expected ${expect}, got ${res.status}: ${message}`);
    }
    return json;
}

async function ensureEmployees() {
    await ensureEmployeeCompanyEmailColumn(db);
    const rows = [
        [ADMIN_ID, 'CODX CCCF Admin', department, 'Tester', RECIPIENT, 'Admin'],
        [USER_ID, 'CODX CCCF Excel User', department, 'Tester', RECIPIENT, 'User'],
        [DIRECT_ID, 'CODX CCCF Direct User', department, 'Tester', RECIPIENT, 'User'],
        [NOEMAIL_ID, 'CODX CCCF No Email User', department, 'Tester', null, 'User'],
    ];
    for (const row of rows) {
        await db.query(
            `INSERT INTO Employees (EmployeeID, EmployeeName, Department, Position, CompanyEmail, Role)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE EmployeeName=VALUES(EmployeeName), Department=VALUES(Department), Position=VALUES(Position), CompanyEmail=VALUES(CompanyEmail), Role=VALUES(Role)`,
            row
        );
    }
}

function permanentForm({ employeeId, jobArea, mode = 'excel_review', pdf = false }) {
    const form = new FormData();
    form.set('AssigneeID', employeeId);
    form.set('DocumentMode', mode);
    form.set('JobArea', jobArea);
    form.set('SubmitDate', today);
    form.set('Summary', `CODX CCCF Permanent smoke ${RUN}`);
    form.set('StopType', '6');
    form.set('Rank', 'C');
    const content = pdf
        ? '%PDF-1.4\n% CODX CCCF signed pdf smoke\n%%EOF\n'
        : 'topic,detail\nCODX CCCF,Excel review smoke\n';
    const type = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const name = pdf ? `codx-cccf-${RUN}.pdf` : `codx-cccf-${RUN}.xlsx`;
    form.set('FormFile', new Blob([content], { type }), name);
    return form;
}

function signedPdfForm() {
    const form = new FormData();
    form.set('FormFile', new Blob(['%PDF-1.4\n% CODX CCCF signed upload\n%%EOF\n'], { type: 'application/pdf' }), `codx-cccf-signed-${RUN}.pdf`);
    return form;
}

async function findPermanent(base, adminToken, marker) {
    const rows = await api(base, '/cccf/form-a-permanent', { token: adminToken });
    const list = Array.isArray(rows) ? rows : rows.data || [];
    const item = list.find(row => String(row.JobArea || '').includes(marker));
    if (!item) throw new Error(`Cannot find CCCF permanent record for ${marker}`);
    return item;
}

async function main() {
    await ensureEmployees();

    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const adminToken = tokenFor('Admin', ADMIN_ID, 'CODX CCCF Admin');
    const userToken = tokenFor('User', USER_ID, 'CODX CCCF Excel User');
    const directToken = tokenFor('User', DIRECT_ID, 'CODX CCCF Direct User');
    const noEmailToken = tokenFor('User', NOEMAIL_ID, 'CODX CCCF No Email User');
    const created = [];
    let originalEmailPolicy = null;

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS App_Settings (
                key_name  VARCHAR(100) PRIMARY KEY,
                value     TEXT,
                UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const [policyRows] = await db.query('SELECT value FROM App_Settings WHERE key_name = ?', ['cccf_require_company_email']);
        originalEmailPolicy = policyRows.length ? policyRows[0].value : null;

        await api(base, '/cccf/email-outbox', { token: adminToken });
        const beforeQueue = await api(base, '/cccf/email-outbox', { token: adminToken });
        const beforeMaxId = Math.max(0, ...(beforeQueue.data || []).map(row => Number(row.id || 0)));

        await api(base, '/settings/cccf_require_company_email', {
            method: 'PUT',
            token: adminToken,
            body: { value: '1' },
        });
        await api(base, '/cccf/form-a-permanent', {
            method: 'POST',
            token: noEmailToken,
            form: permanentForm({ employeeId: NOEMAIL_ID, jobArea: `CODX CCCF No Email Block ${RUN}` }),
            expect: 400,
        });

        await api(base, '/cccf/assignments', {
            method: 'POST',
            token: adminToken,
            body: { EmployeeID: USER_ID, AllowDirectSignedPdf: 0, DueDate: today, Note: `CODX due note ${RUN}` },
        });
        await api(base, '/cccf/assignments', {
            method: 'POST',
            token: adminToken,
            body: { EmployeeID: DIRECT_ID, AllowDirectSignedPdf: 1 },
        });
        const assignments = await api(base, '/cccf/assignments', { token: adminToken });
        const userAssignment = (Array.isArray(assignments) ? assignments : assignments.data || []).find(row => row.EmployeeID === USER_ID);
        if (!userAssignment?.DueDate || !String(userAssignment.Note || '').includes(RUN)) {
            throw new Error('CCCF assignment DueDate/Note was not saved or returned by API.');
        }

        const excelMarker = `CODX CCCF Excel Approved ${RUN}`;
        await api(base, '/cccf/form-a-permanent', {
            method: 'POST',
            token: userToken,
            form: permanentForm({ employeeId: USER_ID, jobArea: excelMarker }),
        });
        const excelRecord = await findPermanent(base, adminToken, excelMarker);
        created.push(excelRecord.id);
        await api(base, `/cccf/form-a-permanent/${excelRecord.id}/review`, {
            method: 'POST',
            token: adminToken,
            body: { ReviewStatus: 'Approved', ReviewComment: `CODX approve ${RUN}` },
        });
        await api(base, `/cccf/form-a-permanent/${excelRecord.id}/signed-file`, {
            method: 'POST',
            token: userToken,
            form: signedPdfForm(),
        });
        await api(base, `/cccf/form-a-permanent/${excelRecord.id}/complete`, {
            method: 'POST',
            token: adminToken,
            body: { CompleteComment: `CODX complete ${RUN}` },
        });

        const rejectMarker = `CODX CCCF Excel Rejected ${RUN}`;
        await api(base, '/cccf/form-a-permanent', {
            method: 'POST',
            token: userToken,
            form: permanentForm({ employeeId: USER_ID, jobArea: rejectMarker }),
        });
        const rejectRecord = await findPermanent(base, adminToken, rejectMarker);
        created.push(rejectRecord.id);
        await api(base, `/cccf/form-a-permanent/${rejectRecord.id}/review`, {
            method: 'POST',
            token: adminToken,
            body: { ReviewStatus: 'Rejected', ReviewComment: `CODX reject ${RUN}` },
        });

        const directMarker = `CODX CCCF Direct Signed ${RUN}`;
        await api(base, '/cccf/form-a-permanent', {
            method: 'POST',
            token: directToken,
            form: permanentForm({ employeeId: DIRECT_ID, jobArea: directMarker, mode: 'direct_signed', pdf: true }),
        });
        const directRecord = await findPermanent(base, adminToken, directMarker);
        created.push(directRecord.id);
        await api(base, `/cccf/form-a-permanent/${directRecord.id}/complete`, {
            method: 'POST',
            token: adminToken,
            body: { CompleteComment: `CODX direct complete ${RUN}` },
        });

        const afterQueue = await api(base, '/cccf/email-outbox', { token: adminToken });
        const newEvents = (afterQueue.data || []).filter(row => Number(row.id || 0) > beforeMaxId);
        const eventTypes = new Set(newEvents.map(row => row.EventType));
        const required = ['Assigned', 'Submitted', 'Approved', 'SignedFileUploaded', 'Completed', 'Rejected', 'DirectSignedSubmitted'];
        const missing = required.filter(type => !eventTypes.has(type));
        if (missing.length) throw new Error(`Missing CCCF email events: ${missing.join(', ')}`);

        console.log(JSON.stringify({
            ok: true,
            run: RUN,
            created,
            emailEvents: newEvents.map(row => ({ id: row.id, eventType: row.EventType, status: row.Status, subject: row.Subject })),
        }, null, 2));
    } finally {
        if (originalEmailPolicy === null) {
            await db.query('DELETE FROM App_Settings WHERE key_name = ?', ['cccf_require_company_email']).catch(() => {});
        } else {
            await db.query(
                `INSERT INTO App_Settings (key_name, value) VALUES ('cccf_require_company_email', ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), UpdatedAt = NOW()`,
                [originalEmailPolicy]
            ).catch(() => {});
        }
        if (created.length) {
            await db.query(`DELETE FROM CCCF_FormA_Permanent WHERE id IN (${created.map(() => '?').join(',')})`, created).catch(() => {});
        }
        await db.query('DELETE FROM CCCF_Assignments WHERE EmployeeID IN (?, ?, ?, ?)', [ADMIN_ID, USER_ID, DIRECT_ID, NOEMAIL_ID]).catch(() => {});
        await db.query('DELETE FROM Employees WHERE EmployeeID IN (?, ?, ?, ?)', [ADMIN_ID, USER_ID, DIRECT_ID, NOEMAIL_ID]).catch(() => {});
        await new Promise(resolve => server.close(resolve));
        await db.end().catch(() => {});
    }
}

main().catch(err => {
    console.error(JSON.stringify({ ok: false, message: err.message }, null, 2));
    process.exit(1);
});
