<?php
declare(strict_types=1);

$_SERVER['REMOTE_ADDR'] = '127.0.0.31';
putenv('EMAIL_ENABLED=false');
putenv('COMPANY_EMAIL_VERIFICATION_DELIVERY_ENABLED=false');
require dirname(__DIR__, 2) . '/api/bootstrap.php';
require dirname(__DIR__, 2) . '/api/mailer.php';
require dirname(__DIR__, 2) . '/api/lib/company_email_change.php';

function ce_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function ce_expect_code(callable $operation, string $code): void
{
    try {
        $operation();
    } catch (CompanyEmailChangeException $error) {
        ce_assert($error->reason === $code, "Expected {$code}, got {$error->reason}");
        return;
    }
    throw new RuntimeException("Expected {$code}, but operation succeeded");
}

$suffix = substr((string)time(), -8);
$employeeId = 'ZCEPHP' . $suffix;
$password = 'CompanyEmail-PHP-42!';
$email = strtolower($employeeId) . '@gmail.com';
$knownToken = rtrim(strtr(base64_encode(str_repeat(chr(9), 32)), '+/', '-_'), '=');
$expiredToken = rtrim(strtr(base64_encode(str_repeat(chr(10), 32)), '+/', '-_'), '=');
$verificationAuditKey = 'verify:' . substr(hash('sha256', (string)$_SERVER['REMOTE_ADDR']), 0, 32);
$auditBaseline = 0;
$pdo = db();

try {
    company_email_change_schema($pdo);
    $auditBaseline = (int)(db_row('SELECT COALESCE(MAX(id),0) id FROM company_email_change_audit')['id'] ?? 0);
    db_execute('DELETE FROM company_email_change_audit WHERE EmployeeID=?', [$employeeId]);
    db_execute('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [$employeeId]);
    db_execute("DELETE FROM employees WHERE EmployeeID=? AND EmployeeName LIKE 'Company Email PHP Test%'", [$employeeId]);
    db_execute(
        'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,?,?,0)',
        [$employeeId, 'Company Email PHP Test', 'TEST', '', '', 'TEST', null, 'User', password_hash($password, PASSWORD_BCRYPT)]
    );

    ce_expect_code(fn() => company_email_change_create($pdo, $employeeId, 'not-an-email', $password), 'INVALID_COMPANY_EMAIL');
    ce_expect_code(fn() => company_email_change_create($pdo, $employeeId, $email, 'wrong'), 'CURRENT_PASSWORD_INVALID');

    $request = company_email_change_create($pdo, $employeeId, $email, $password);
    ce_assert($request['delivery'] === 'Disabled', 'PHP delivery must remain disabled during UAT');
    $state = company_email_change_state($pdo, $employeeId);
    ce_assert($state['companyEmail'] === null, 'Pending request must not update employees.CompanyEmail');
    ce_assert(($state['pending']['email'] ?? null) === $email, 'Pending email mismatch');
    company_email_change_cancel($pdo, $employeeId, (int)$request['requestId']);

    db_execute(
        "INSERT INTO company_email_verification_requests(EmployeeID,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt) VALUES(?,?,?,?, 'Pending',?,DATE_ADD(NOW(),INTERVAL 1 HOUR))",
        [$employeeId, $email, $email, company_email_change_hash($knownToken), '127.0.0.32']
    );
    $verified = company_email_change_verify($pdo, $knownToken);
    ce_assert($verified['companyEmail'] === $email, 'PHP verify email mismatch');
    ce_assert((db_row('SELECT CompanyEmail FROM employees WHERE EmployeeID=?', [$employeeId])['CompanyEmail'] ?? null) === $email, 'PHP verify did not promote email');
    ce_expect_code(fn() => company_email_change_verify($pdo, $knownToken), 'EMAIL_VERIFICATION_INVALID');

    $expiredEmail = 'expired.' . strtolower($employeeId) . '@yahoo.com';
    db_execute(
        "INSERT INTO company_email_verification_requests(EmployeeID,NewCompanyEmail,PendingEmailKey,TokenHash,Status,RequestedIPAddress,ExpiresAt) VALUES(?,?,?,?, 'Pending',?,DATE_SUB(NOW(),INTERVAL 1 MINUTE))",
        [$employeeId, $expiredEmail, $expiredEmail, company_email_change_hash($expiredToken), '127.0.0.33']
    );
    ce_expect_code(fn() => company_email_change_verify($pdo, $expiredToken), 'EMAIL_VERIFICATION_EXPIRED');

    $mail = company_email_change_mail('<PHP Test>', $email, $knownToken);
    ce_assert(str_contains($mail['html'], '&lt;PHP Test&gt;'), 'PHP email template must escape HTML');
    ce_assert(str_contains($mail['text'], '24 ชั่วโมง'), 'PHP email template TTL copy missing');
    echo "PHP Company Email lifecycle UAT passed: validation, reauth, pending, cancel, verify, one-time/expired token and disabled delivery.\n";
} finally {
    db_execute('DELETE FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?)', [$auditBaseline, $employeeId, $verificationAuditKey]);
    db_execute('DELETE FROM company_email_verification_requests WHERE EmployeeID=?', [$employeeId]);
    db_execute('DELETE FROM employees WHERE EmployeeID=?', [$employeeId]);
    $residue = db_row('SELECT (SELECT COUNT(*) FROM employees WHERE EmployeeID=?) employees,(SELECT COUNT(*) FROM company_email_verification_requests WHERE EmployeeID=?) requests,(SELECT COUNT(*) FROM company_email_change_audit WHERE id>? AND EmployeeID IN (?,?)) audits', [$employeeId, $employeeId, $auditBaseline, $employeeId, $verificationAuditKey]);
    echo 'PHP Company Email cleanup: employees=' . (int)($residue['employees'] ?? -1) . '; requests=' . (int)($residue['requests'] ?? -1) . '; audits=' . (int)($residue['audits'] ?? -1) . "\n";
}
