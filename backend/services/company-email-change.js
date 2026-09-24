const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendMail, smtpConfigured } = require('../utils/email');

const TOKEN_TTL_HOURS = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

class CompanyEmailChangeError extends Error {
    constructor(code, message, httpStatus = 400) {
        super(message);
        this.name = 'CompanyEmailChangeError';
        this.code = code;
        this.httpStatus = httpStatus;
    }
}

function deliveryEnabled() {
    return ['1', 'true', 'yes', 'on'].includes(
        String(process.env.COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED || '').trim().toLowerCase()
    );
}

function createToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function normalizeAccountEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (email.length < 3 || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new CompanyEmailChangeError('INVALID_COMPANY_EMAIL', 'กรุณากรอกอีเมลให้ถูกต้อง', 422);
    }
    return email;
}

function verificationRateKey(ipAddress) {
    return `verify:${crypto.createHash('sha256').update(String(ipAddress || 'unknown')).digest('hex').slice(0, 32)}`;
}

function verificationUrl(token) {
    const configured = String(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:5500').trim();
    const base = configured.replace(/\/+$/, '').replace(/\/index\.html$/i, '');
    return `${base}/index.html#verify-company-email=${encodeURIComponent(token)}`;
}

function buildVerificationEmail({ employeeName, email, token }) {
    const url = verificationUrl(token);
    const subject = '[TSH Safety Core] ยืนยันอีเมลของคุณ';
    const text = [
        `เรียน ${employeeName || 'ผู้ใช้งาน'}`,
        '',
        `ระบบได้รับคำขอใช้ ${email} เป็นอีเมลสำหรับบัญชีของคุณ`,
        `ยืนยันภายใน ${TOKEN_TTL_HOURS} ชั่วโมง: ${url}`,
        '',
        'หากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยต่ออีเมลฉบับนี้ อีเมลเดิมในระบบจะไม่ถูกเปลี่ยน',
        'TSH Safety Core',
    ].join('\n');
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,'Noto Sans Thai',sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f1f5f9"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.10)"><tr><td style="padding:26px;background:linear-gradient(135deg,#064e3b,#0d9488);color:#fff"><div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:.8">TSH Safety Core</div><div style="font-size:24px;font-weight:700;margin-top:7px">ยืนยันอีเมลของคุณ</div></td></tr><tr><td style="padding:30px"><p style="margin:0 0 14px">เรียน ${escapeHtml(employeeName || 'ผู้ใช้งาน')}</p><p style="margin:0 0 20px;line-height:1.7;color:#475569">กรุณายืนยันว่า <strong>${escapeHtml(email)}</strong> เป็นอีเมลสำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ ${TOKEN_TTL_HOURS} ชั่วโมง</p><p style="margin:24px 0;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;border-radius:12px;background:#059669;color:#fff;text-decoration:none;font-weight:700">ยืนยันอีเมล</a></p><p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b">หากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยต่ออีเมลนี้ ข้อมูลเดิมจะไม่ถูกเปลี่ยน</p></td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}

async function ensureCompanyEmailChangeSchema(queryable) {
    await queryable.query(`CREATE TABLE IF NOT EXISTS company_email_verification_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        EmployeeID VARCHAR(50) NOT NULL,
        PreviousCompanyEmail VARCHAR(150) NULL,
        NewCompanyEmail VARCHAR(150) NOT NULL,
        PendingEmailKey VARCHAR(150) NULL,
        TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
        RequestedIPAddress VARCHAR(80) NULL,
        RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ExpiresAt DATETIME NOT NULL,
        VerifiedAt DATETIME NULL,
        CancelledAt DATETIME NULL,
        SupersededAt DATETIME NULL,
        UNIQUE KEY uq_company_email_change_token (TokenHash),
        UNIQUE KEY uq_company_email_change_pending_email (PendingEmailKey),
        KEY idx_company_email_change_employee (EmployeeID,Status,ExpiresAt),
        KEY idx_company_email_change_email (NewCompanyEmail,Status,ExpiresAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await queryable.query(`CREATE TABLE IF NOT EXISTS company_email_change_audit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        RequestID BIGINT UNSIGNED NULL,
        EmployeeID VARCHAR(50) NOT NULL,
        Action VARCHAR(50) NOT NULL,
        Detail VARCHAR(500) NULL,
        IPAddress VARCHAR(80) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company_email_audit_employee (EmployeeID,CreatedAt),
        KEY idx_company_email_audit_request (RequestID,CreatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await queryable.query(
        "UPDATE company_email_verification_requests SET Status='Expired',PendingEmailKey=NULL WHERE Status='Pending' AND ExpiresAt<=NOW()"
    );
}

async function audit(queryable, { requestId = null, employeeId, action, detail = null, ipAddress = null }) {
    await queryable.query(
        'INSERT INTO company_email_change_audit(RequestID,EmployeeID,Action,Detail,IPAddress) VALUES(?,?,?,?,?)',
        [requestId, employeeId, action, detail, ipAddress]
    );
}

async function checkRateLimit(queryable, employeeId, ipAddress) {
    const [[row]] = await queryable.query(
        `SELECT COUNT(*) attempts FROM company_email_change_audit
          WHERE Action='ATTEMPTED' AND CreatedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE)
            AND (EmployeeID=? OR IPAddress=?)`,
        [employeeId, ipAddress]
    );
    if (Number(row?.attempts || 0) >= 10) {
        throw new CompanyEmailChangeError('COMPANY_EMAIL_RATE_LIMITED', 'มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง', 429);
    }
    await audit(queryable, { employeeId, action: 'ATTEMPTED', ipAddress });
}

async function loadState(queryable, employeeId) {
    await ensureCompanyEmailChangeSchema(queryable);
    const [[employee]] = await queryable.query(
        'SELECT EmployeeID,CompanyEmail FROM Employees WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    if (!employee) throw new CompanyEmailChangeError('PROFILE_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้งาน', 404);
    const [[latestRequest]] = await queryable.query(
        `SELECT id,NewCompanyEmail,RequestedAt,ExpiresAt,Status
           FROM company_email_verification_requests
          WHERE EmployeeID=? ORDER BY id DESC LIMIT 1`,
        [employeeId]
    );
    const pending = latestRequest && ['Pending', 'Expired'].includes(latestRequest.Status) ? latestRequest : null;
    return {
        companyEmail: employee.CompanyEmail || null,
        status: employee.CompanyEmail ? 'ready' : 'missing',
        pending: pending ? {
            requestId: Number(pending.id),
            email: pending.NewCompanyEmail,
            status: pending.Status,
            requestedAt: pending.RequestedAt,
            expiresAt: pending.ExpiresAt,
        } : null,
        deliveryEnabled: deliveryEnabled(),
    };
}

async function assertEmailAvailable(queryable, employeeId, email) {
    const [[owner]] = await queryable.query(
        'SELECT EmployeeID FROM Employees WHERE LOWER(CompanyEmail)=LOWER(?) AND EmployeeID<>? LIMIT 1',
        [email, employeeId]
    );
    if (owner) throw new CompanyEmailChangeError('COMPANY_EMAIL_IN_USE', 'อีเมลนี้ถูกใช้งานแล้ว', 409);
    const [[registration]] = await queryable.query(
        "SELECT ID FROM registration_requests WHERE LOWER(CompanyEmail)=LOWER(?) AND Status='Pending' AND EmployeeID<>? LIMIT 1",
        [email, employeeId]
    ).catch(() => [[null]]);
    if (registration) throw new CompanyEmailChangeError('COMPANY_EMAIL_IN_USE', 'อีเมลนี้อยู่ระหว่างการสมัครบัญชีอื่น', 409);
    const [[pending]] = await queryable.query(
        "SELECT id FROM company_email_verification_requests WHERE LOWER(NewCompanyEmail)=LOWER(?) AND Status='Pending' AND ExpiresAt>NOW() AND EmployeeID<>? LIMIT 1",
        [email, employeeId]
    );
    if (pending) throw new CompanyEmailChangeError('COMPANY_EMAIL_IN_USE', 'อีเมลนี้อยู่ระหว่างการยืนยันโดยบัญชีอื่น', 409);
}

async function createRequest({ pool, employeeId, newEmail, currentPassword, ipAddress, resendRequestId = null }) {
    const email = normalizeAccountEmail(newEmail);
    if (typeof currentPassword !== 'string' || !currentPassword) {
        throw new CompanyEmailChangeError('CURRENT_PASSWORD_REQUIRED', 'กรุณากรอกรหัสผ่านปัจจุบัน', 400);
    }
    await ensureCompanyEmailChangeSchema(pool);
    await checkRateLimit(pool, employeeId, ipAddress);
    const connection = await pool.getConnection();
    const token = createToken();
    let employee;
    let requestId;
    try {
        await connection.beginTransaction();
        [[employee]] = await connection.query(
            'SELECT EmployeeID,EmployeeName,CompanyEmail,Password FROM Employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE',
            [employeeId]
        );
        if (!employee) throw new CompanyEmailChangeError('PROFILE_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้งาน', 404);
        const passwordOk = employee.Password
            ? await bcrypt.compare(currentPassword, employee.Password)
            : currentPassword === employee.EmployeeID;
        if (!passwordOk) throw new CompanyEmailChangeError('CURRENT_PASSWORD_INVALID', 'รหัสผ่านปัจจุบันไม่ถูกต้อง', 401);
        if (String(employee.CompanyEmail || '').trim().toLowerCase() === email) {
            throw new CompanyEmailChangeError('COMPANY_EMAIL_UNCHANGED', 'อีเมลนี้เป็นอีเมลปัจจุบันอยู่แล้ว', 409);
        }
        await assertEmailAvailable(connection, employeeId, email);
        if (resendRequestId) {
            const [[prior]] = await connection.query(
                "SELECT id,NewCompanyEmail FROM company_email_verification_requests WHERE id=? AND EmployeeID=? AND Status IN ('Pending','Expired') LIMIT 1 FOR UPDATE",
                [resendRequestId, employeeId]
            );
            if (!prior) throw new CompanyEmailChangeError('EMAIL_CHANGE_REQUEST_NOT_FOUND', 'ไม่พบคำขอยืนยันที่รอดำเนินการ', 404);
            if (String(prior.NewCompanyEmail).toLowerCase() !== email) {
                throw new CompanyEmailChangeError('EMAIL_CHANGE_REQUEST_MISMATCH', 'ข้อมูลคำขอยืนยันไม่ตรงกัน', 409);
            }
        }
        await connection.query(
            "UPDATE company_email_verification_requests SET Status='Superseded',PendingEmailKey=NULL,SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending'",
            [employeeId]
        );
        const [insert] = await connection.query(
            `INSERT INTO company_email_verification_requests
                (EmployeeID,PreviousCompanyEmail,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt)
             VALUES(?,?,?,?,?, 'Pending',?,DATE_ADD(NOW(),INTERVAL ? HOUR))`,
            [employeeId, employee.CompanyEmail || null, email, email, tokenHash(token), ipAddress, TOKEN_TTL_HOURS]
        );
        requestId = Number(insert.insertId);
        await audit(connection, { requestId, employeeId, action: resendRequestId ? 'RESENT' : 'REQUESTED', detail: email, ipAddress });
        await connection.commit();
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }

    let delivery = 'Disabled';
    if (deliveryEnabled()) {
        if (!smtpConfigured()) {
            delivery = 'Unavailable';
        } else {
            const mail = buildVerificationEmail({ employeeName: employee.EmployeeName, email, token });
            try {
                const sent = await sendMail({ to: email, ...mail });
                delivery = sent?.sent ? 'Sent' : 'Failed';
            } catch (error) {
                delivery = 'Failed';
            }
        }
    }
    await audit(pool, {
        requestId,
        employeeId,
        action: `DELIVERY_${delivery.toUpperCase()}`,
        ipAddress,
    });
    return { requestId, email, expiresInHours: TOKEN_TTL_HOURS, delivery };
}

async function cancelRequest({ pool, employeeId, requestId, ipAddress }) {
    await ensureCompanyEmailChangeSchema(pool);
    const [result] = await pool.query(
        "UPDATE company_email_verification_requests SET Status='Cancelled',PendingEmailKey=NULL,CancelledAt=NOW() WHERE id=? AND EmployeeID=? AND Status IN ('Pending','Expired')",
        [requestId, employeeId]
    );
    if (!result.affectedRows) throw new CompanyEmailChangeError('EMAIL_CHANGE_REQUEST_NOT_FOUND', 'ไม่พบคำขอยืนยันที่รอดำเนินการ', 404);
    await audit(pool, { requestId, employeeId, action: 'CANCELLED', ipAddress });
}

async function verifyRequest({ pool, token, ipAddress }) {
    if (!TOKEN_PATTERN.test(String(token || ''))) {
        throw new CompanyEmailChangeError('EMAIL_VERIFICATION_INVALID', 'ลิงก์ยืนยันไม่ถูกต้อง', 400);
    }
    await ensureCompanyEmailChangeSchema(pool);
    await checkRateLimit(pool, verificationRateKey(ipAddress), ipAddress);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [[request]] = await connection.query(
            'SELECT * FROM company_email_verification_requests WHERE TokenHash=? LIMIT 1 FOR UPDATE',
            [tokenHash(token)]
        );
        if (!request) {
            throw new CompanyEmailChangeError('EMAIL_VERIFICATION_INVALID', 'ลิงก์ยืนยันไม่ถูกต้องหรือถูกใช้งานแล้ว', 409);
        }
        if (request.Status === 'Expired') {
            throw new CompanyEmailChangeError('EMAIL_VERIFICATION_EXPIRED', 'ลิงก์ยืนยันหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        if (request.Status !== 'Pending') {
            throw new CompanyEmailChangeError('EMAIL_VERIFICATION_INVALID', 'ลิงก์ยืนยันไม่ถูกต้องหรือถูกใช้งานแล้ว', 409);
        }
        if (new Date(request.ExpiresAt).getTime() <= Date.now()) {
            await connection.query("UPDATE company_email_verification_requests SET Status='Expired',PendingEmailKey=NULL WHERE id=?", [request.id]);
            await audit(connection, { requestId: request.id, employeeId: request.EmployeeID, action: 'EXPIRED', ipAddress });
            await connection.commit();
            throw new CompanyEmailChangeError('EMAIL_VERIFICATION_EXPIRED', 'ลิงก์ยืนยันหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        await assertEmailAvailable(connection, request.EmployeeID, request.NewCompanyEmail);
        const [updated] = await connection.query(
            'UPDATE Employees SET CompanyEmail=? WHERE EmployeeID=?',
            [request.NewCompanyEmail, request.EmployeeID]
        );
        if (!updated.affectedRows) throw new CompanyEmailChangeError('PROFILE_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้งาน', 404);
        await connection.query("UPDATE company_email_verification_requests SET Status='Verified',PendingEmailKey=NULL,VerifiedAt=NOW() WHERE id=?", [request.id]);
        await connection.query(
            "UPDATE company_email_verification_requests SET Status='Superseded',PendingEmailKey=NULL,SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending' AND id<>?",
            [request.EmployeeID, request.id]
        );
        await audit(connection, { requestId: request.id, employeeId: request.EmployeeID, action: 'VERIFIED', detail: request.NewCompanyEmail, ipAddress });
        await connection.commit();
        return { employeeId: request.EmployeeID, companyEmail: request.NewCompanyEmail };
    } catch (error) {
        if (connection.connection?._closing !== true) await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    CompanyEmailChangeError,
    TOKEN_TTL_HOURS,
    buildVerificationEmail,
    cancelRequest,
    createRequest,
    deliveryEnabled,
    ensureCompanyEmailChangeSchema,
    loadState,
    tokenHash,
    verifyRequest,
};
