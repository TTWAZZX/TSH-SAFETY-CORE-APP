// Focused KY email flow smoke.
// Verifies Submitted, AdminSubmitted, Reviewed, Closed, and HtmlBody in KY_EmailOutbox.

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
const ADMIN_ID = `KYAD${RUN}`;
const USER_ID = `KYUS${RUN}`;
const RECIPIENT = process.env.KY_SMOKE_EMAIL || process.env.KY_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'sattaya_w@thaisummit-harness.co.th';
const department = `CODX KY SMOKE ${RUN}`;
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
        [ADMIN_ID, 'CODX KY Admin', department, 'Tester', RECIPIENT, 'Admin'],
        [USER_ID, 'CODX KY User', department, 'Tester', RECIPIENT, 'User'],
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

function kyForm(marker) {
    const form = new FormData();
    form.set('ActivityDate', today);
    form.set('Department', department);
    form.set('TeamName', `CODX KY Team ${RUN}`);
    form.set('Participants', JSON.stringify(['CODX KY User']));
    form.set('KYTKeyword', `CODX KY email smoke ${RUN}`);
    form.set('RiskCategory', 'General');
    form.set('HazardDescription', marker);
    form.set('Countermeasure', `CODX countermeasure ${RUN}`);
    form.set('ReporterEmail', RECIPIENT);
    return form;
}

async function findKy(base, adminToken, marker) {
    const result = await api(base, `/ky?dept=${encodeURIComponent(department)}&year=${new Date(today).getFullYear()}`, {
        token: adminToken,
    });
    const item = (result.data || []).find(row => String(row.HazardDescription || '').includes(marker));
    if (!item) throw new Error(`Cannot find KY activity for ${marker}`);
    return item;
}

async function getOutbox(activityId) {
    const [rows] = await db.query(
        `SELECT id, ActivityID, EventType, Recipient, Subject, Status,
                CASE WHEN HtmlBody IS NULL OR HtmlBody = '' THEN 0 ELSE 1 END AS HasHtml,
                LEFT(HtmlBody, 180) AS HtmlPreview
         FROM KY_EmailOutbox
         WHERE ActivityID = ?
         ORDER BY id ASC`,
        [activityId]
    );
    return rows;
}

function assertEmailEvents(rows, required) {
    const eventTypes = new Set(rows.map(row => row.EventType));
    const missing = required.filter(type => !eventTypes.has(type));
    if (missing.length) throw new Error(`Missing KY email events: ${missing.join(', ')}`);
    const noHtml = rows.filter(row => required.includes(row.EventType) && !Number(row.HasHtml));
    if (noHtml.length) throw new Error(`KY email events missing HtmlBody: ${noHtml.map(row => row.EventType).join(', ')}`);
}

async function main() {
    await ensureEmployees();

    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const adminToken = tokenFor('Admin', ADMIN_ID, 'CODX KY Admin');
    const userToken = tokenFor('User', USER_ID, 'CODX KY User');
    const marker = `CODX KY email flow ${RUN}`;
    const created = [];
    const outboxIds = [];

    try {
        await api(base, '/ky', {
            method: 'POST',
            token: userToken,
            form: kyForm(marker),
            expect: 201,
        });
        const activity = await findKy(base, adminToken, marker);
        created.push(activity.id);

        await api(base, `/ky/${activity.id}`, {
            method: 'PUT',
            token: adminToken,
            body: {
                Status: 'Reviewed',
                AdminComment: `CODX reviewed ${RUN}`,
            },
        });
        await api(base, `/ky/${activity.id}`, {
            method: 'PUT',
            token: adminToken,
            body: {
                Status: 'Closed',
                AdminComment: `CODX closed ${RUN}`,
            },
        });

        const emails = await getOutbox(activity.id);
        outboxIds.push(...emails.map(row => row.id));
        assertEmailEvents(emails, ['Submitted', 'AdminSubmitted', 'Reviewed', 'Closed']);

        console.log(JSON.stringify({
            ok: true,
            run: RUN,
            activityId: activity.id,
            emailEvents: emails.map(row => ({
                id: row.id,
                eventType: row.EventType,
                recipient: row.Recipient,
                status: row.Status,
                hasHtml: Boolean(Number(row.HasHtml)),
                subject: row.Subject,
            })),
        }, null, 2));
    } finally {
        if (outboxIds.length) {
            await db.query(`DELETE FROM KY_EmailOutbox WHERE id IN (${outboxIds.map(() => '?').join(',')})`, outboxIds).catch(() => {});
        }
        if (created.length) {
            await db.query(`DELETE FROM KY_Video_Reactions WHERE ActivityID IN (${created.map(() => '?').join(',')})`, created).catch(() => {});
            await db.query(`DELETE FROM KY_Activities WHERE id IN (${created.map(() => '?').join(',')})`, created).catch(() => {});
            await db.query(`DELETE FROM Admin_AuditLogs WHERE targetType = 'KY_Activities' AND targetId IN (${created.map(() => '?').join(',')})`, created).catch(() => {});
        }
        await db.query('DELETE FROM Employees WHERE EmployeeID IN (?, ?)', [ADMIN_ID, USER_ID]).catch(() => {});
        await new Promise(resolve => server.close(resolve));
        await db.end().catch(() => {});
    }
}

main().catch(err => {
    console.error(JSON.stringify({ ok: false, message: err.message }, null, 2));
    process.exit(1);
});
