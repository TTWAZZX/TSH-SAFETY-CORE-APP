'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { sendMail, smtpConfigured } = require('../utils/email');

const TOKEN_TTL_MINUTES = 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const GENERIC_REQUEST_MESSAGE = 'หากบัญชีนี้มีอีเมลที่พร้อมใช้งาน ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้';

class PasswordResetError extends Error {
    constructor(code, message, httpStatus = 400) {
        super(message);
        this.name = 'PasswordResetError';
        this.code = code;
        this.httpStatus = httpStatus;
    }
}

function deliveryEnabled() {
    return ['1', 'true', 'yes', 'on'].includes(
        String(process.env.PASSWORD_RESET_EMAIL_DELIVERY_ENABLED || '').trim().toLowerCase()
    );
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function resetRateKey(ipAddress) {
    return `reset:${crypto.createHash('sha256').update(String(ipAddress || 'unknown')).digest('hex').slice(0, 32)}`;
}

function validEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return email.length >= 3 && email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function resetUrl(token) {
    const configured = String(process.env.PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:5500').trim();
    const base = configured.replace(/\/+$/, '').replace(/\/index\.html$/i, '');
    return `${base}/index.html#reset-password=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[character]));
}

function buildResetEmail({ employeeName, email, token }) {
    const url = resetUrl(token);
    const subject = '[TSH Safety Core] ตั้งรหัสผ่านใหม่';
    const text = [
        `เรียน ${employeeName || 'ผู้ใช้งาน'}`,
        '',
        'ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ',
        `ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ ${TOKEN_TTL_MINUTES} นาที: ${url}`,
        '',
        'หากคุณไม่ได้เป็นผู้ส่งคำขอ กรุณาเพิกเฉยต่ออีเมลนี้ รหัสผ่านเดิมจะยังใช้งานได้ตามปกติ',
        `ส่งถึง ${email}`,
        'TSH Safety Core',
    ].join('\n');
    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,'Noto Sans Thai',sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f1f5f9"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.10)"><tr><td style="padding:26px;background:linear-gradient(135deg,#064e3b,#0d9488);color:#fff"><div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:.8">TSH Safety Core</div><div style="font-size:24px;font-weight:700;margin-top:7px">ตั้งรหัสผ่านใหม่</div></td></tr><tr><td style="padding:30px"><p style="margin:0 0 14px">เรียน ${escapeHtml(employeeName || 'ผู้ใช้งาน')}</p><p style="margin:0 0 20px;line-height:1.7;color:#475569">เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ ${TOKEN_TTL_MINUTES} นาที</p><p style="margin:24px 0;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;border-radius:12px;background:#059669;color:#fff;text-decoration:none;font-weight:700">ตั้งรหัสผ่านใหม่</a></p><p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b">หากคุณไม่ได้เป็นผู้ส่งคำขอ กรุณาเพิกเฉยต่ออีเมลนี้ รหัสผ่านเดิมจะยังไม่ถูกเปลี่ยน</p></td></tr></table></td></tr></table></body></html>`;
    return { subject, text, html };
}

async function ensurePasswordResetSchema(queryable) {
    await queryable.query(`CREATE TABLE IF NOT EXISTS password_reset_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        EmployeeID VARCHAR(50) NOT NULL,
        EmailSnapshot VARCHAR(150) NOT NULL,
        TokenHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
        Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
        DeliveryStatus VARCHAR(20) NOT NULL DEFAULT 'Disabled',
        RequestedIPAddress VARCHAR(80) NULL,
        RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ExpiresAt DATETIME NOT NULL,
        CompletedAt DATETIME NULL,
        SupersededAt DATETIME NULL,
        UNIQUE KEY uq_password_reset_token (TokenHash),
        KEY idx_password_reset_employee (EmployeeID,Status,ExpiresAt),
        KEY idx_password_reset_status (Status,ExpiresAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await queryable.query(`CREATE TABLE IF NOT EXISTS password_reset_audit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        RequestID BIGINT UNSIGNED NULL,
        EmployeeID VARCHAR(80) NOT NULL,
        Action VARCHAR(50) NOT NULL,
        Detail VARCHAR(500) NULL,
        IPAddress VARCHAR(80) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_password_reset_audit_employee (EmployeeID,CreatedAt),
        KEY idx_password_reset_audit_request (RequestID,CreatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await queryable.query("UPDATE password_reset_requests SET Status='Expired' WHERE Status='Pending' AND ExpiresAt<=NOW()");
}

async function audit(queryable, { requestId = null, employeeId, action, detail = null, ipAddress = null }) {
    await queryable.query(
        'INSERT INTO password_reset_audit(RequestID,EmployeeID,Action,Detail,IPAddress) VALUES(?,?,?,?,?)',
        [requestId, String(employeeId || '').slice(0, 80), action, detail, ipAddress]
    );
}

async function requestPasswordReset({ pool, employeeId, ipAddress }) {
    await ensurePasswordResetSchema(pool);
    const normalizedId = String(employeeId || '').trim().slice(0, 50);
    const rateIdentity = normalizedId || resetRateKey(ipAddress);
    const [[attempts]] = await pool.query(
        `SELECT COUNT(*) attempts FROM password_reset_audit
          WHERE Action='ATTEMPTED' AND CreatedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE)
            AND (EmployeeID=? OR IPAddress=?)`,
        [rateIdentity, ipAddress]
    );
    if (Number(attempts?.attempts || 0) >= 5) {
        await audit(pool, { employeeId: rateIdentity, action: 'RATE_LIMITED', ipAddress });
        return { accepted: true, delivery: 'Suppressed' };
    }
    await audit(pool, { employeeId: rateIdentity, action: 'ATTEMPTED', ipAddress });
    if (!normalizedId) return { accepted: true, delivery: 'Suppressed' };

    const [[employee]] = await pool.query(
        'SELECT EmployeeID,EmployeeName,CompanyEmail FROM Employees WHERE EmployeeID=? LIMIT 1',
        [normalizedId]
    );
    const email = validEmail(employee?.CompanyEmail);
    if (!employee || !email) {
        await audit(pool, { employeeId: normalizedId, action: 'REQUEST_IGNORED', detail: employee ? 'email_unavailable' : 'account_unavailable', ipAddress });
        return { accepted: true, delivery: 'Suppressed' };
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const connection = await pool.getConnection();
    let requestId;
    let deliveryEmail = email;
    let deliveryEmployeeName = employee.EmployeeName;
    try {
        await connection.beginTransaction();
        const [[locked]] = await connection.query(
            'SELECT EmployeeID,EmployeeName,CompanyEmail FROM Employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE',
            [normalizedId]
        );
        const lockedEmail = validEmail(locked?.CompanyEmail);
        if (!locked || !lockedEmail) {
            await connection.rollback();
            await audit(pool, { employeeId: normalizedId, action: 'REQUEST_IGNORED', detail: 'email_unavailable', ipAddress });
            return { accepted: true, delivery: 'Suppressed' };
        }
        deliveryEmail = lockedEmail;
        deliveryEmployeeName = locked.EmployeeName;
        await connection.query(
            "UPDATE password_reset_requests SET Status='Superseded',SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending'",
            [normalizedId]
        );
        const [insert] = await connection.query(
            `INSERT INTO password_reset_requests
                (EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt)
             VALUES(?,?,?,'Pending','Disabled',?,DATE_ADD(NOW(),INTERVAL ? MINUTE))`,
            [normalizedId, lockedEmail, tokenHash(token), ipAddress, TOKEN_TTL_MINUTES]
        );
        requestId = Number(insert.insertId);
        await audit(connection, { requestId, employeeId: normalizedId, action: 'REQUESTED', ipAddress });
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
            try {
                const mail = buildResetEmail({ employeeName: deliveryEmployeeName, email: deliveryEmail, token });
                const sent = await sendMail({ to: deliveryEmail, ...mail });
                delivery = sent?.sent ? 'Sent' : 'Failed';
            } catch (_) {
                delivery = 'Failed';
            }
        }
    }
    await pool.query('UPDATE password_reset_requests SET DeliveryStatus=? WHERE id=?', [delivery, requestId]);
    await audit(pool, { requestId, employeeId: normalizedId, action: `DELIVERY_${delivery.toUpperCase()}`, ipAddress });
    return { accepted: true, delivery };
}

async function completePasswordReset({ pool, token, newPassword, ipAddress }) {
    if (!TOKEN_PATTERN.test(String(token || ''))) {
        throw new PasswordResetError('PASSWORD_RESET_INVALID', 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง', 400);
    }
    const passwordLength = typeof newPassword === 'string' ? Array.from(newPassword).length : 0;
    if (passwordLength < 4 || passwordLength > 128) {
        throw new PasswordResetError('PASSWORD_POLICY_VIOLATION', 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษรและไม่เกิน 128 ตัวอักษร', 422);
    }
    await ensurePasswordResetSchema(pool);
    const rateKey = resetRateKey(ipAddress);
    const [[attempts]] = await pool.query(
        "SELECT COUNT(*) attempts FROM password_reset_audit WHERE Action='RESET_ATTEMPTED' AND EmployeeID=? AND CreatedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE)",
        [rateKey]
    );
    if (Number(attempts?.attempts || 0) >= 10) {
        throw new PasswordResetError('PASSWORD_RESET_RATE_LIMITED', 'มีการลองใช้ลิงก์มากเกินไป กรุณาลองใหม่ภายหลัง', 429);
    }
    await audit(pool, { employeeId: rateKey, action: 'RESET_ATTEMPTED', ipAddress });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [[request]] = await connection.query(
            'SELECT * FROM password_reset_requests WHERE TokenHash=? LIMIT 1 FOR UPDATE',
            [tokenHash(token)]
        );
        if (request?.Status === 'Expired') {
            throw new PasswordResetError('PASSWORD_RESET_EXPIRED', 'ลิงก์ตั้งรหัสผ่านหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        if (!request || request.Status !== 'Pending') {
            throw new PasswordResetError('PASSWORD_RESET_INVALID', 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือถูกใช้งานแล้ว', 409);
        }
        if (new Date(request.ExpiresAt).getTime() <= Date.now()) {
            await connection.query("UPDATE password_reset_requests SET Status='Expired' WHERE id=?", [request.id]);
            await audit(connection, { requestId: request.id, employeeId: request.EmployeeID, action: 'EXPIRED', ipAddress });
            await connection.commit();
            throw new PasswordResetError('PASSWORD_RESET_EXPIRED', 'ลิงก์ตั้งรหัสผ่านหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const [updated] = await connection.query(
            'UPDATE Employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=?',
            [passwordHash, request.EmployeeID]
        );
        if (!updated.affectedRows) throw new PasswordResetError('PASSWORD_RESET_INVALID', 'ไม่สามารถตั้งรหัสผ่านจากลิงก์นี้ได้', 409);
        await connection.query("UPDATE password_reset_requests SET Status='Completed',CompletedAt=NOW() WHERE id=?", [request.id]);
        await connection.query(
            "UPDATE password_reset_requests SET Status='Superseded',SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending' AND id<>?",
            [request.EmployeeID, request.id]
        );
        await audit(connection, { requestId: request.id, employeeId: request.EmployeeID, action: 'COMPLETED', ipAddress });
        await connection.commit();
        return { employeeId: request.EmployeeID };
    } catch (error) {
        if (connection.connection?._closing !== true && connection._closing !== true) {
            await connection.rollback().catch(() => {});
        }
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    GENERIC_REQUEST_MESSAGE,
    PasswordResetError,
    TOKEN_TTL_MINUTES,
    buildResetEmail,
    completePasswordReset,
    ensurePasswordResetSchema,
    requestPasswordReset,
    tokenHash,
};
