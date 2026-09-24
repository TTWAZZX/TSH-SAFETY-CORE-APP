<?php
declare(strict_types=1);

const COMPANY_EMAIL_CHANGE_TTL_HOURS = 24;

final class CompanyEmailChangeException extends RuntimeException
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

function company_email_change_delivery_enabled(): bool
{
    global $config;
    return !empty($config['company_email_verification_delivery_enabled']);
}

function company_email_change_schema(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS company_email_verification_requests (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS company_email_change_audit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        RequestID BIGINT UNSIGNED NULL,
        EmployeeID VARCHAR(50) NOT NULL,
        Action VARCHAR(50) NOT NULL,
        Detail VARCHAR(500) NULL,
        IPAddress VARCHAR(80) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_company_email_audit_employee (EmployeeID,CreatedAt),
        KEY idx_company_email_audit_request (RequestID,CreatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("UPDATE company_email_verification_requests SET Status='Expired',PendingEmailKey=NULL WHERE Status='Pending' AND ExpiresAt<=NOW()");
}

function company_email_change_ip(): string
{
    return mb_substr(trim((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown')), 0, 80);
}

function company_email_change_token(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}

function company_email_change_hash(string $token): string
{
    return hash('sha256', $token);
}

function company_email_change_verification_rate_key(): string
{
    return 'verify:' . substr(hash('sha256', company_email_change_ip()), 0, 32);
}

function company_email_change_validate($value): string
{
    $email = strtolower(trim((string)($value ?? '')));
    if ($email === '' || mb_strlen($email) > 150 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new CompanyEmailChangeException('INVALID_COMPANY_EMAIL', 'กรุณากรอกอีเมลให้ถูกต้อง', 422);
    }
    return $email;
}

function company_email_change_audit(PDO $pdo, ?int $requestId, string $employeeId, string $action, ?string $detail = null): void
{
    $stmt = $pdo->prepare('INSERT INTO company_email_change_audit(RequestID,EmployeeID,Action,Detail,IPAddress) VALUES(?,?,?,?,?)');
    $stmt->execute([$requestId, $employeeId, $action, $detail, company_email_change_ip()]);
}

function company_email_change_rate_limit(PDO $pdo, string $employeeId): void
{
    company_email_change_schema($pdo);
    $ip = company_email_change_ip();
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM company_email_change_audit WHERE Action='ATTEMPTED' AND CreatedAt>=DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (EmployeeID=? OR IPAddress=?)");
    $stmt->execute([$employeeId, $ip]);
    if ((int)$stmt->fetchColumn() >= 10) {
        throw new CompanyEmailChangeException('COMPANY_EMAIL_RATE_LIMITED', 'มีคำขอมากเกินไป กรุณาลองใหม่ภายหลัง', 429);
    }
    company_email_change_audit($pdo, null, $employeeId, 'ATTEMPTED');
}

function company_email_change_assert_available(PDO $pdo, string $employeeId, string $email): void
{
    $stmt = $pdo->prepare('SELECT EmployeeID FROM employees WHERE LOWER(CompanyEmail)=LOWER(?) AND EmployeeID<>? LIMIT 1');
    $stmt->execute([$email, $employeeId]);
    if ($stmt->fetch()) {
        throw new CompanyEmailChangeException('COMPANY_EMAIL_IN_USE', 'อีเมลนี้ถูกใช้งานแล้ว', 409);
    }
    try {
        $stmt = $pdo->prepare("SELECT ID FROM registration_requests WHERE LOWER(CompanyEmail)=LOWER(?) AND Status='Pending' AND EmployeeID<>? LIMIT 1");
        $stmt->execute([$email, $employeeId]);
        if ($stmt->fetch()) {
            throw new CompanyEmailChangeException('COMPANY_EMAIL_IN_USE', 'อีเมลนี้อยู่ระหว่างการสมัครบัญชีอื่น', 409);
        }
    } catch (CompanyEmailChangeException $error) {
        throw $error;
    } catch (Throwable $error) {
        // Older installations may not have public registration yet.
    }
    $stmt = $pdo->prepare("SELECT id FROM company_email_verification_requests WHERE LOWER(NewCompanyEmail)=LOWER(?) AND Status='Pending' AND ExpiresAt>NOW() AND EmployeeID<>? LIMIT 1");
    $stmt->execute([$email, $employeeId]);
    if ($stmt->fetch()) {
        throw new CompanyEmailChangeException('COMPANY_EMAIL_IN_USE', 'อีเมลนี้อยู่ระหว่างการยืนยันโดยบัญชีอื่น', 409);
    }
}

function company_email_change_state(PDO $pdo, string $employeeId): array
{
    company_email_change_schema($pdo);
    $stmt = $pdo->prepare('SELECT EmployeeID,CompanyEmail FROM employees WHERE EmployeeID=? LIMIT 1');
    $stmt->execute([$employeeId]);
    $employee = $stmt->fetch();
    if (!$employee) {
        throw new CompanyEmailChangeException('PROFILE_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้งาน', 404);
    }
    $stmt = $pdo->prepare("SELECT id,NewCompanyEmail,RequestedAt,ExpiresAt,Status FROM company_email_verification_requests WHERE EmployeeID=? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$employeeId]);
    $latestRequest = $stmt->fetch() ?: null;
    $pending = $latestRequest && in_array((string)$latestRequest['Status'], ['Pending','Expired'], true) ? $latestRequest : null;
    return [
        'companyEmail' => $employee['CompanyEmail'] ?: null,
        'status' => !empty($employee['CompanyEmail']) ? 'ready' : 'missing',
        'pending' => $pending ? [
            'requestId' => (int)$pending['id'],
            'email' => $pending['NewCompanyEmail'],
            'status' => $pending['Status'],
            'requestedAt' => $pending['RequestedAt'],
            'expiresAt' => $pending['ExpiresAt'],
        ] : null,
        'deliveryEnabled' => company_email_change_delivery_enabled(),
    ];
}

function company_email_change_verification_url(string $token): string
{
    global $config;
    $configured = trim((string)($config['public_app_url'] ?? ''));
    if ($configured === '') $configured = 'http://localhost:5500';
    $base = preg_replace('#/index\.html$#i', '', rtrim($configured, '/'));
    return $base . '/index.html#verify-company-email=' . rawurlencode($token);
}

function company_email_change_mail(string $employeeName, string $email, string $token): array
{
    $url = company_email_change_verification_url($token);
    $safeName = htmlspecialchars($employeeName !== '' ? $employeeName : 'ผู้ใช้งาน', ENT_QUOTES, 'UTF-8');
    $safeEmail = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');
    $safeUrl = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
    $subject = '[TSH Safety Core] ยืนยันอีเมลของคุณ';
    $text = "เรียน " . ($employeeName !== '' ? $employeeName : 'ผู้ใช้งาน') . "\n\nระบบได้รับคำขอใช้ {$email} เป็นอีเมลสำหรับบัญชีของคุณ\nยืนยันภายใน 24 ชั่วโมง: {$url}\n\nหากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยต่ออีเมลฉบับนี้ อีเมลเดิมในระบบจะไม่ถูกเปลี่ยน\nTSH Safety Core";
    $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Noto Sans Thai,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px;background:#f1f5f9"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.10)"><tr><td style="padding:26px;background:#065f46;color:#fff"><div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:.8">TSH Safety Core</div><div style="font-size:24px;font-weight:700;margin-top:7px">ยืนยันอีเมลของคุณ</div></td></tr><tr><td style="padding:30px"><p style="margin:0 0 14px">เรียน ' . $safeName . '</p><p style="margin:0 0 20px;line-height:1.7;color:#475569">กรุณายืนยันว่า <strong>' . $safeEmail . '</strong> เป็นอีเมลสำหรับบัญชีของคุณ ลิงก์นี้ใช้ได้ครั้งเดียวและมีอายุ 24 ชั่วโมง</p><p style="margin:24px 0;text-align:center"><a href="' . $safeUrl . '" style="display:inline-block;padding:13px 24px;border-radius:12px;background:#059669;color:#fff;text-decoration:none;font-weight:700">ยืนยันอีเมล</a></p><p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b">หากคุณไม่ได้เป็นผู้ดำเนินการ กรุณาเพิกเฉยต่ออีเมลนี้ ข้อมูลเดิมจะไม่ถูกเปลี่ยน</p></td></tr></table></td></tr></table></body></html>';
    return ['subject' => $subject, 'text' => $text, 'html' => $html];
}

function company_email_change_create(PDO $pdo, string $employeeId, string $newEmail, string $currentPassword, ?int $resendRequestId = null): array
{
    $email = company_email_change_validate($newEmail);
    if ($currentPassword === '') {
        throw new CompanyEmailChangeException('CURRENT_PASSWORD_REQUIRED', 'กรุณากรอกรหัสผ่านปัจจุบัน', 400);
    }
    company_email_change_schema($pdo);
    company_email_change_rate_limit($pdo, $employeeId);
    $token = company_email_change_token();
    $employee = null;
    $requestId = 0;
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT EmployeeID,EmployeeName,CompanyEmail,Password FROM employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE');
        $stmt->execute([$employeeId]);
        $employee = $stmt->fetch();
        if (!$employee) throw new CompanyEmailChangeException('PROFILE_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้งาน', 404);
        $passwordOk = !empty($employee['Password'])
            ? password_verify($currentPassword, (string)$employee['Password'])
            : hash_equals((string)$employee['EmployeeID'], $currentPassword);
        if (!$passwordOk) throw new CompanyEmailChangeException('CURRENT_PASSWORD_INVALID', 'รหัสผ่านปัจจุบันไม่ถูกต้อง', 401);
        if (strtolower(trim((string)($employee['CompanyEmail'] ?? ''))) === $email) {
            throw new CompanyEmailChangeException('COMPANY_EMAIL_UNCHANGED', 'อีเมลนี้เป็นอีเมลปัจจุบันอยู่แล้ว', 409);
        }
        company_email_change_assert_available($pdo, $employeeId, $email);
        if ($resendRequestId !== null) {
            $stmt = $pdo->prepare("SELECT id,NewCompanyEmail FROM company_email_verification_requests WHERE id=? AND EmployeeID=? AND Status IN ('Pending','Expired') LIMIT 1 FOR UPDATE");
            $stmt->execute([$resendRequestId, $employeeId]);
            $prior = $stmt->fetch();
            if (!$prior) throw new CompanyEmailChangeException('EMAIL_CHANGE_REQUEST_NOT_FOUND', 'ไม่พบคำขอยืนยันที่รอดำเนินการ', 404);
            if (strtolower((string)$prior['NewCompanyEmail']) !== $email) throw new CompanyEmailChangeException('EMAIL_CHANGE_REQUEST_MISMATCH', 'ข้อมูลคำขอยืนยันไม่ตรงกัน', 409);
        }
        $stmt = $pdo->prepare("UPDATE company_email_verification_requests SET Status='Superseded',PendingEmailKey=NULL,SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending'");
        $stmt->execute([$employeeId]);
        $stmt = $pdo->prepare("INSERT INTO company_email_verification_requests(EmployeeID,PreviousCompanyEmail,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt) VALUES(?,?,?,?,?, 'Pending',?,DATE_ADD(NOW(),INTERVAL 24 HOUR))");
        $stmt->execute([$employeeId, $employee['CompanyEmail'] ?: null, $email, $email, company_email_change_hash($token), company_email_change_ip()]);
        $requestId = (int)$pdo->lastInsertId();
        company_email_change_audit($pdo, $requestId, $employeeId, $resendRequestId !== null ? 'RESENT' : 'REQUESTED', $email);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }

    $delivery = 'Disabled';
    if (company_email_change_delivery_enabled()) {
        if (!mailer_smtp_configured()) {
            $delivery = 'Unavailable';
        } else {
            $mail = company_email_change_mail((string)($employee['EmployeeName'] ?? ''), $email, $token);
            try {
                $sent = mailer_send_mail($email, $mail['subject'], $mail['text'], $mail['html']);
                $delivery = !empty($sent['sent']) ? 'Sent' : 'Failed';
            } catch (Throwable $error) {
                $delivery = 'Failed';
            }
        }
    }
    company_email_change_audit($pdo, $requestId, $employeeId, 'DELIVERY_' . strtoupper($delivery));
    return ['requestId' => $requestId, 'email' => $email, 'expiresInHours' => 24, 'delivery' => $delivery];
}

function company_email_change_cancel(PDO $pdo, string $employeeId, int $requestId): void
{
    company_email_change_schema($pdo);
    $stmt = $pdo->prepare("UPDATE company_email_verification_requests SET Status='Cancelled',PendingEmailKey=NULL,CancelledAt=NOW() WHERE id=? AND EmployeeID=? AND Status IN ('Pending','Expired')");
    $stmt->execute([$requestId, $employeeId]);
    if ($stmt->rowCount() === 0) throw new CompanyEmailChangeException('EMAIL_CHANGE_REQUEST_NOT_FOUND', 'ไม่พบคำขอยืนยันที่รอดำเนินการ', 404);
    company_email_change_audit($pdo, $requestId, $employeeId, 'CANCELLED');
}

function company_email_change_verify(PDO $pdo, string $token): array
{
    if (preg_match('/^[A-Za-z0-9_-]{43}$/', $token) !== 1) {
        throw new CompanyEmailChangeException('EMAIL_VERIFICATION_INVALID', 'ลิงก์ยืนยันไม่ถูกต้อง', 400);
    }
    company_email_change_schema($pdo);
    company_email_change_rate_limit($pdo, company_email_change_verification_rate_key());
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('SELECT * FROM company_email_verification_requests WHERE TokenHash=? LIMIT 1 FOR UPDATE');
        $stmt->execute([company_email_change_hash($token)]);
        $request = $stmt->fetch();
        if (!$request) throw new CompanyEmailChangeException('EMAIL_VERIFICATION_INVALID', 'ลิงก์ยืนยันไม่ถูกต้องหรือถูกใช้งานแล้ว', 409);
        if ($request['Status'] === 'Expired') throw new CompanyEmailChangeException('EMAIL_VERIFICATION_EXPIRED', 'ลิงก์ยืนยันหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        if ($request['Status'] !== 'Pending') throw new CompanyEmailChangeException('EMAIL_VERIFICATION_INVALID', 'ลิงก์ยืนยันไม่ถูกต้องหรือถูกใช้งานแล้ว', 409);
        if (strtotime((string)$request['ExpiresAt']) <= time()) {
            $stmt = $pdo->prepare("UPDATE company_email_verification_requests SET Status='Expired',PendingEmailKey=NULL WHERE id=?");
            $stmt->execute([(int)$request['id']]);
            company_email_change_audit($pdo, (int)$request['id'], (string)$request['EmployeeID'], 'EXPIRED');
            $pdo->commit();
            throw new CompanyEmailChangeException('EMAIL_VERIFICATION_EXPIRED', 'ลิงก์ยืนยันหมดอายุแล้ว กรุณาขอลิงก์ใหม่', 410);
        }
        company_email_change_assert_available($pdo, (string)$request['EmployeeID'], (string)$request['NewCompanyEmail']);
        $stmt = $pdo->prepare('UPDATE employees SET CompanyEmail=? WHERE EmployeeID=?');
        $stmt->execute([$request['NewCompanyEmail'], $request['EmployeeID']]);
        if ($stmt->rowCount() === 0) throw new CompanyEmailChangeException('PROFILE_NOT_FOUND', 'ไม่พบข้อมูลผู้ใช้งาน', 404);
        $stmt = $pdo->prepare("UPDATE company_email_verification_requests SET Status='Verified',PendingEmailKey=NULL,VerifiedAt=NOW() WHERE id=?");
        $stmt->execute([(int)$request['id']]);
        $stmt = $pdo->prepare("UPDATE company_email_verification_requests SET Status='Superseded',PendingEmailKey=NULL,SupersededAt=NOW() WHERE EmployeeID=? AND Status='Pending' AND id<>?");
        $stmt->execute([$request['EmployeeID'], (int)$request['id']]);
        company_email_change_audit($pdo, (int)$request['id'], (string)$request['EmployeeID'], 'VERIFIED', (string)$request['NewCompanyEmail']);
        $pdo->commit();
        return ['employeeId' => $request['EmployeeID'], 'companyEmail' => $request['NewCompanyEmail']];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
