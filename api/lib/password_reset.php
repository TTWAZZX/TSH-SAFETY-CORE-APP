<?php
declare(strict_types=1);

const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_GENERIC_MESSAGE = 'หากบัญชีนี้มีอีเมลที่พร้อมใช้งาน ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้';

final class PasswordResetException extends RuntimeException
{
    public string $reason;
    public int $httpStatus;

    public function __construct(string $reason, string $message, int $httpStatus = 400)
    {
        parent::__construct($message);
        $this->reason = $reason;
        $this->httpStatus = $httpStatus;
    }
}

function password_reset_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS password_reset_requests (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS password_reset_audit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        RequestID BIGINT UNSIGNED NULL,
        EmployeeID VARCHAR(80) NOT NULL,
        Action VARCHAR(50) NOT NULL,
        Detail VARCHAR(500) NULL,
        IPAddress VARCHAR(80) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_password_reset_audit_employee (EmployeeID,CreatedAt),
        KEY idx_password_reset_audit_request (RequestID,CreatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("UPDATE password_reset_requests SET Status='Expired' WHERE Status='Pending' AND ExpiresAt<=NOW()");
}

function password_reset_ip(): string
{
    return mb_substr(trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown')), 0, 80);
}

function password_reset_delivery_enabled(): bool
{
    global $config;
    return !empty($config['password_reset_email_delivery_enabled']);
}

function password_reset_hash(string $token): string
{
    return hash('sha256', $token);
}

function password_reset_rate_key(): string
{
    return 'reset:' . substr(hash('sha256', password_reset_ip()), 0, 32);
}

function password_reset_valid_email($value): ?string
{
    $email = strtolower(trim((string)($value ?? '')));
    return $email !== '' && mb_strlen($email) <= 150 && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
}

function password_reset_audit(PDO $pdo, ?int $requestId, string $employeeId, string $action, ?string $detail = null): void
{
    $stmt = $pdo->prepare('INSERT INTO password_reset_audit(RequestID,EmployeeID,Action,Detail,IPAddress) VALUES(?,?,?,?,?)');
    $stmt->execute([$requestId, mb_substr($employeeId, 0, 80), $action, $detail, password_reset_ip()]);
}

function password_reset_url(string $token): string
{
    global $config;
    $configured = trim((string)($config['public_app_url'] ?? ''));
    if ($configured === '') $configured = 'http://localhost:5500';
    $base = preg_replace('#/index\.html$#i', '', rtrim($configured, '/'));
    return $base . '/index.html#reset-password=' . rawurlencode($token);
}

function password_reset_mail(string $employeeName, string $email, string $token): array
{
    $url = password_reset_url($token);
    $safeName = htmlspecialchars($employeeName !== '' ? $employeeName : 'ผู้ใช้งาน', ENT_QUOTES, 'UTF-8');
    $safeUrl = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
    $subject = '[TSH Safety Core] ตั้งรหัสผ่านใหม่';
    $text = "เรียน " . ($employeeName !== '' ? $employeeName : 'ผู้ใช้งาน') . "\n\nระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ\nลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ 30 นาที: {$url}\n\nหากคุณไม่ได้เป็นผู้ส่งคำขอ กรุณาเพิกเฉยต่ออีเมลนี้ รหัสผ่านเดิมจะยังใช้งานได้ตามปกติ\nส่งถึง {$email}\nTSH Safety Core";
    $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Noto Sans Thai,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f1f5f9"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.10)"><tr><td style="padding:26px;background:#065f46;color:#fff"><div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:.8">TSH Safety Core</div><div style="font-size:24px;font-weight:700;margin-top:7px">ตั้งรหัสผ่านใหม่</div></td></tr><tr><td style="padding:30px"><p style="margin:0 0 14px">เรียน ' . $safeName . '</p><p style="margin:0 0 20px;line-height:1.7;color:#475569">เราได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ 30 นาที</p><p style="margin:24px 0;text-align:center"><a href="' . $safeUrl . '" style="display:inline-block;padding:13px 24px;border-radius:12px;background:#059669;color:#fff;text-decoration:none;font-weight:700">ตั้งรหัสผ่านใหม่</a></p><p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b">หากคุณไม่ได้เป็นผู้ส่งคำขอ กรุณาเพิกเฉยต่ออีเมลนี้ รหัสผ่านเดิมจะยังไม่ถูกเปลี่ยน</p></td></tr></table></td></tr></table></body></html>';
    return ['subject'=>$subject,'text'=>$text,'html'=>$html];
}

function password_reset_request(PDO $pdo, string $employeeId): array
{
    password_reset_schema($pdo);
    $employeeId = mb_substr(trim($employeeId), 0, 50);
    $rateIdentity = $employeeId !== '' ? $employeeId : password_reset_rate_key();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM password_reset_audit WHERE Action='ATTEMPTED' AND CreatedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (EmployeeID=? OR IPAddress=?)");
    $stmt->execute([$rateIdentity, password_reset_ip()]);
    if ((int)$stmt->fetchColumn() >= 5) {
        password_reset_audit($pdo, null, $rateIdentity, 'RATE_LIMITED');
        return ['accepted'=>true,'delivery'=>'Suppressed'];
    }
    password_reset_audit($pdo, null, $rateIdentity, 'ATTEMPTED');
    if ($employeeId === '') return ['accepted'=>true,'delivery'=>'Suppressed'];

    $employee = db_row('SELECT EmployeeID,EmployeeName,CompanyEmail FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    $email = password_reset_valid_email($employee['CompanyEmail'] ?? null);
    if (!$employee || $email === null) {
        password_reset_audit($pdo, null, $employeeId, 'REQUEST_IGNORED', $employee ? 'email_unavailable' : 'account_unavailable');
        return ['accepted'=>true,'delivery'=>'Suppressed'];
    }

    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $requestId = 0;
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT EmployeeID,EmployeeName,CompanyEmail FROM employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE');
        $stmt->execute([$employeeId]);
        $locked = $stmt->fetch();
        $lockedEmail = password_reset_valid_email($locked['CompanyEmail'] ?? null);
        if (!$locked || $lockedEmail === null) {
            $pdo->rollBack();
            password_reset_audit($pdo, null, $employeeId, 'REQUEST_IGNORED', 'email_unavailable');
            return ['accepted'=>true,'delivery'=>'Suppressed'];
        }
        $email = $lockedEmail;
        $employee['EmployeeName'] = $locked['EmployeeName'] ?? $employee['EmployeeName'] ?? '';
        $stmt = $pdo->prepare("UPDATE password_reset_requests SET Status='Superseded',SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending'");
        $stmt->execute([$employeeId]);
        $stmt = $pdo->prepare("INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt) VALUES(?,?,?,'Pending','Disabled',?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))");
        $stmt->execute([$employeeId, $lockedEmail, password_reset_hash($token), password_reset_ip()]);
        $requestId = (int)$pdo->lastInsertId();
        password_reset_audit($pdo, $requestId, $employeeId, 'REQUESTED');
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    $delivery = 'Disabled';
    if (password_reset_delivery_enabled()) {
        if (!mailer_smtp_configured()) {
            $delivery = 'Unavailable';
        } else {
            try {
                $mail = password_reset_mail((string)($employee['EmployeeName'] ?? ''), $email, $token);
                $sent = mailer_send_mail($email, $mail['subject'], $mail['text'], $mail['html']);
                $delivery = !empty($sent['sent']) ? 'Sent' : 'Failed';
            } catch (Throwable $error) {
                $delivery = 'Failed';
            }
        }
    }
    db_execute('UPDATE password_reset_requests SET DeliveryStatus=? WHERE id=?', [$delivery, $requestId]);
    password_reset_audit($pdo, $requestId, $employeeId, 'DELIVERY_' . strtoupper($delivery));
    return ['accepted'=>true,'delivery'=>$delivery];
}

function password_reset_complete(PDO $pdo, string $token, string $newPassword): array
{
    if (preg_match('/^[A-Za-z0-9_-]{43}$/', $token) !== 1) {
        throw new PasswordResetException('PASSWORD_RESET_INVALID', 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง', 400);
    }
    if (mb_strlen($newPassword) < 4 || mb_strlen($newPassword) > 128) {
        throw new PasswordResetException('PASSWORD_POLICY_VIOLATION', 'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษรและไม่เกิน 128 ตัวอักษร', 422);
    }
    password_reset_schema($pdo);
    $rateKey = password_reset_rate_key();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM password_reset_audit WHERE Action='RESET_ATTEMPTED' AND EmployeeID=? AND CreatedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE)");
    $stmt->execute([$rateKey]);
    if ((int)$stmt->fetchColumn() >= 10) {
        throw new PasswordResetException('PASSWORD_RESET_RATE_LIMITED', 'มีการลองใช้ลิงก์มากเกินไป กรุณาลองใหม่ภายหลัง', 429);
    }
    password_reset_audit($pdo, null, $rateKey, 'RESET_ATTEMPTED');
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT * FROM password_reset_requests WHERE TokenHash=? LIMIT 1 FOR UPDATE');
        $stmt->execute([password_reset_hash($token)]);
        $request = $stmt->fetch();
        if ($request && $request['Status'] === 'Expired') {
            throw new PasswordResetException('PASSWORD_RESET_EXPIRED', 'ลิงก์ตั้งรหัสผ่านหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        if (!$request || $request['Status'] !== 'Pending') {
            throw new PasswordResetException('PASSWORD_RESET_INVALID', 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้องหรือถูกใช้งานแล้ว', 409);
        }
        if (strtotime((string)$request['ExpiresAt']) <= time()) {
            db_execute("UPDATE password_reset_requests SET Status='Expired' WHERE id=?", [(int)$request['id']]);
            password_reset_audit($pdo, (int)$request['id'], (string)$request['EmployeeID'], 'EXPIRED');
            $pdo->commit();
            throw new PasswordResetException('PASSWORD_RESET_EXPIRED', 'ลิงก์ตั้งรหัสผ่านหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        $stmt = $pdo->prepare('UPDATE employees SET Password=?,MustChangePassword=0 WHERE EmployeeID=?');
        $stmt->execute([password_hash($newPassword, PASSWORD_BCRYPT), $request['EmployeeID']]);
        if ($stmt->rowCount() === 0) throw new PasswordResetException('PASSWORD_RESET_INVALID', 'ไม่สามารถตั้งรหัสผ่านจากลิงก์นี้ได้', 409);
        db_execute("UPDATE password_reset_requests SET Status='Completed',CompletedAt=NOW() WHERE id=?", [(int)$request['id']]);
        db_execute("UPDATE password_reset_requests SET Status='Superseded',SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending' AND id<>?", [$request['EmployeeID'], (int)$request['id']]);
        password_reset_audit($pdo, (int)$request['id'], (string)$request['EmployeeID'], 'COMPLETED');
        $pdo->commit();
        return ['employeeId'=>(string)$request['EmployeeID']];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
