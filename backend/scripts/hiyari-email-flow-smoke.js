// Sends real Hiyari workflow emails through the local API using UTF-8 Thai text.
// Intended for controlled email rendering checks only.
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

const RECIPIENT = process.env.HIYARI_ADMIN_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'sattaya_w@thaisummit-harness.co.th';
const ADMIN_ID = 'CODX-HIYARI-ADMIN';
const USER_ID = 'CODX-HIYARI-USER';
const DIRECT_ID = 'CODX-HIYARI-DIRECT';
const RUN = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const today = new Date().toISOString().slice(0, 10);
const department = 'SAFETY HEALTH & ENVIRONMENT SEC.';

function tokenFor(role, id, name) {
    return jwt.sign({ id, EmployeeID: id, name, EmployeeName: name, department, Department: department, role }, process.env.JWT_SECRET, { expiresIn: '30m' });
}

async function request(base, path, { method = 'GET', token, body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const res = await fetch(`${base}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!res.ok) {
        const message = json.message || json.error || text || `${method} ${path} failed`;
        throw new Error(`${method} ${path} -> HTTP ${res.status}: ${message}`);
    }
    return json;
}

function reportForm({ desc, pdf = false }) {
    const form = new FormData();
    form.set('Description', desc);
    form.set('Location', `พื้นที่ทดสอบอีเมล Hiyari ${RUN}`);
    form.set('PotentialConsequence', 'อื่นๆ');
    form.set('Rank', 'B');
    form.set('StopType', '6');
    form.set('Suggestion', 'ทดสอบรูปแบบอีเมลภาษาไทยของระบบ Hiyari-Hatto');
    form.set('ReportDate', today);
    form.set('CompanyEmail', RECIPIENT);
    const content = pdf ? '%PDF-1.4\n% CODX signed pdf smoke\n%%EOF\n' : 'หัวข้อ,รายละเอียด\nทดสอบ,อีเมลภาษาไทย\n';
    const type = pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const name = pdf ? `codx-hiyari-${RUN}.pdf` : `codx-hiyari-${RUN}.xlsx`;
    form.set('attachment', new Blob([content], { type }), name);
    return form;
}

function signedPdfForm() {
    const form = new FormData();
    form.set('file', new Blob(['%PDF-1.4\n% CODX signed pdf upload\n%%EOF\n'], { type: 'application/pdf' }), `codx-signed-${RUN}.pdf`);
    return form;
}

async function ensureEmployees() {
    const rows = [
        [ADMIN_ID, 'ผู้ทดสอบระบบ Hiyari Admin', department, 'Tester', RECIPIENT, 'Admin'],
        [USER_ID, 'ผู้ทดสอบระบบ Hiyari User', department, 'Tester', RECIPIENT, 'User'],
        [DIRECT_ID, 'ผู้ทดสอบระบบ Direct PDF', department, 'Tester', RECIPIENT, 'User'],
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

async function latestOutbox(afterId) {
    const [rows] = await db.query(
        `SELECT id, EventType, Recipients, Subject, Status, SentAt,
                LEFT(Body, 260) AS BodyPreview,
                CASE WHEN HtmlBody IS NULL THEN 0 ELSE 1 END AS HasHtml
         FROM Hiyari_EmailOutbox
         WHERE id > ?
         ORDER BY id ASC`,
        [afterId]
    );
    return rows;
}

async function main() {
    if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is not configured');
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    const [beforeRows] = await db.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM Hiyari_EmailOutbox');
    const beforeId = beforeRows[0].maxId || 0;
    await ensureEmployees();

    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const adminToken = tokenFor('Admin', ADMIN_ID, 'ผู้ทดสอบระบบ Hiyari Admin');
    const userToken = tokenFor('User', USER_ID, 'ผู้ทดสอบระบบ Hiyari User');
    const directToken = tokenFor('User', DIRECT_ID, 'ผู้ทดสอบระบบ Direct PDF');
    const created = [];

    try {
        await request(base, '/hiyari', { method: 'POST', token: userToken, form: reportForm({ desc: `ทดสอบอีเมลลูป 1 ส่งรายงานใหม่ ${RUN}` }) });
        let reports = (await request(base, '/hiyari', { token: adminToken })).data || [];
        const regular = reports.find(r => String(r.Description || '').includes(`ทดสอบอีเมลลูป 1 ส่งรายงานใหม่ ${RUN}`));
        if (!regular) throw new Error('Cannot find regular test report');
        created.push(regular.id);

        await request(base, `/hiyari/${regular.id}`, { method: 'PUT', token: adminToken, body: { ReviewStatus: 'Approved', ReviewComment: 'ทดสอบอีเมล: ตรวจสอบ Excel ผ่านแล้ว กรุณาดำเนินการลงนาม', Status: 'Open', CorrectiveAction: '' } });
        await request(base, `/hiyari/${regular.id}/signed-file`, { method: 'POST', token: userToken, form: signedPdfForm() });
        await request(base, `/hiyari/${regular.id}`, { method: 'PUT', token: adminToken, body: { Status: 'Closed', CorrectiveAction: 'ทดสอบอีเมล: ดำเนินการแก้ไขและปิดรายงานเรียบร้อย', AdminComment: 'ทดสอบข้อความปิดรายงานภาษาไทย' } });
        await request(base, `/hiyari/${regular.id}`, { method: 'PUT', token: adminToken, body: { Status: 'In Progress', CorrectiveAction: 'ทดสอบอีเมล: เปิดกลับเพื่อติดตามเพิ่มเติม', AdminComment: 'ทดสอบข้อความเปิดกลับภาษาไทย' } });

        await request(base, '/hiyari', { method: 'POST', token: userToken, form: reportForm({ desc: `ทดสอบอีเมลลูป 2 ตีกลับ ${RUN}` }) });
        reports = (await request(base, '/hiyari', { token: adminToken })).data || [];
        const rejectReport = reports.find(r => String(r.Description || '').includes(`ทดสอบอีเมลลูป 2 ตีกลับ ${RUN}`));
        if (!rejectReport) throw new Error('Cannot find reject test report');
        created.push(rejectReport.id);
        await request(base, `/hiyari/${rejectReport.id}`, { method: 'PUT', token: adminToken, body: { ReviewStatus: 'Rejected', ReviewComment: 'ทดสอบอีเมล: กรุณาแก้ไขรายละเอียดใน Excel ให้ครบถ้วนก่อนส่งใหม่', Status: 'Open', CorrectiveAction: '' } });

        await request(base, '/hiyari', { method: 'POST', token: userToken, form: reportForm({ desc: `ทดสอบอีเมลลูป 3 Admin Override ${RUN}` }) });
        reports = (await request(base, '/hiyari', { token: adminToken })).data || [];
        const overrideReport = reports.find(r => String(r.Description || '').includes(`ทดสอบอีเมลลูป 3 Admin Override ${RUN}`));
        if (!overrideReport) throw new Error('Cannot find override test report');
        created.push(overrideReport.id);
        await request(base, `/hiyari/${overrideReport.id}/approve-pdf-override`, { method: 'POST', token: adminToken, body: { reason: 'ทดสอบอีเมล: อนุญาตให้ส่ง PDF ที่ลงนามแล้วด้วย Admin Override' } });

        await request(base, '/hiyari/assignments', { method: 'POST', token: adminToken, body: { EmployeeID: DIRECT_ID, AllowDirectSignedPdf: 1, Note: `ทดสอบ direct PDF ${RUN}`, DueDate: today } }).catch(async err => {
            if (!String(err.message).includes('ถูกมอบหมายแล้ว') && !String(err.message).includes('already')) throw err;
            const assignments = (await request(base, '/hiyari/assignments', { token: adminToken })).data || [];
            const existing = assignments.find(a => a.EmployeeID === DIRECT_ID);
            if (existing) {
                await request(base, `/hiyari/assignments/${existing.id}`, { method: 'PUT', token: adminToken, body: { EmployeeID: DIRECT_ID, AllowDirectSignedPdf: 1, Note: `ทดสอบ direct PDF ${RUN}`, DueDate: today } });
            }
        });
        await request(base, '/hiyari/direct-signed', { method: 'POST', token: directToken, form: reportForm({ desc: `ทดสอบอีเมลลูป 4 Direct Signed PDF ${RUN}`, pdf: true }) });
        reports = (await request(base, '/hiyari', { token: adminToken })).data || [];
        const directReport = reports.find(r => String(r.Description || '').includes(`ทดสอบอีเมลลูป 4 Direct Signed PDF ${RUN}`));
        if (directReport) created.push(directReport.id);

        const emails = await latestOutbox(beforeId);
        console.log(JSON.stringify({ ok: true, run: RUN, recipient: RECIPIENT, reports: created, emailCount: emails.length, emails }, null, 2));
    } finally {
        server.close();
        await db.end?.();
    }
}

main().catch(err => {
    console.error(JSON.stringify({ ok: false, message: err.message }, null, 2));
    process.exit(1);
});
