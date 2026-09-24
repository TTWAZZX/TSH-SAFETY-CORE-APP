<?php
declare(strict_types=1);

$_SERVER['REMOTE_ADDR'] = '127.0.0.91';
putenv('EMAIL_ENABLED=false');
putenv('PASSWORD_RESET_EMAIL_DELIVERY_ENABLED=false');
require dirname(__DIR__, 2) . '/api/bootstrap.php';
require dirname(__DIR__, 2) . '/api/mailer.php';
require dirname(__DIR__, 2) . '/api/lib/password_reset.php';

function pr_assert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function pr_expect_code(callable $operation, string $code): void
{
    try {
        $operation();
    } catch (PasswordResetException $error) {
        pr_assert($error->reason === $code, "Expected {$code}, got {$error->reason}");
        return;
    }
    throw new RuntimeException("Expected {$code}, but operation succeeded");
}

$suffix = substr((string)time(), -8);
$employeeWithEmail = 'ZPRPHP' . $suffix . 'A';
$employeeWithoutEmail = 'ZPRPHP' . $suffix . 'B';
$unknownEmployee = 'ZPRPHP' . $suffix . 'X';
$email = strtolower($employeeWithEmail) . '@gmail.com';
$originalPassword = 'Reset-PHP-Original-42!';
$newPassword = 'Reset-PHP-New-84!';
$knownToken = rtrim(strtr(base64_encode(str_repeat(chr(41), 32)), '+/', '-_'), '=');
$expiredToken = rtrim(strtr(base64_encode(str_repeat(chr(42), 32)), '+/', '-_'), '=');
$rateKey = password_reset_rate_key();
$auditBaseline = 0;
$pdo = db();

try {
    password_reset_schema($pdo);
    $auditBaseline = (int)(db_row('SELECT COALESCE(MAX(id),0) id FROM password_reset_audit')['id'] ?? 0);
    db_execute(
        'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,?,?,0)',
        [$employeeWithEmail, 'Password Reset PHP Test A', 'TEST', '', '', 'TEST', $email, 'User', password_hash($originalPassword, PASSWORD_BCRYPT)]
    );
    db_execute(
        'INSERT INTO employees(EmployeeID,EmployeeName,Department,Unit,Team,Position,CompanyEmail,Role,Password,MustChangePassword) VALUES(?,?,?,?,?,?,?,?,?,0)',
        [$employeeWithoutEmail, 'Password Reset PHP Test B', 'TEST', '', '', 'TEST', null, 'User', password_hash($originalPassword, PASSWORD_BCRYPT)]
    );

    $unknown = password_reset_request($pdo, $unknownEmployee);
    $missing = password_reset_request($pdo, $employeeWithoutEmail);
    pr_assert($unknown['accepted'] === true && $missing['accepted'] === true, 'Enumeration-safe responses missing');
    pr_assert((int)(db_row('SELECT COUNT(*) count FROM password_reset_requests WHERE EmployeeID IN (?,?)', [$unknownEmployee, $employeeWithoutEmail])['count'] ?? -1) === 0, 'Unavailable accounts must not create reset requests');

    $requested = password_reset_request($pdo, $employeeWithEmail);
    pr_assert($requested['delivery'] === 'Disabled', 'PHP reset email delivery must remain disabled');
    $request = db_row('SELECT id,Status,DeliveryStatus,TokenHash FROM password_reset_requests WHERE EmployeeID=? ORDER BY id DESC LIMIT 1', [$employeeWithEmail]);
    pr_assert(($request['Status'] ?? null) === 'Pending', 'PHP reset request must be pending');
    pr_assert(($request['DeliveryStatus'] ?? null) === 'Disabled', 'PHP delivery status mismatch');

    password_reset_request($pdo, $employeeWithEmail);
    pr_assert((db_row('SELECT Status FROM password_reset_requests WHERE id=?', [(int)$request['id']])['Status'] ?? null) === 'Superseded', 'PHP resend must supersede old request');

    db_execute(
        "INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt) VALUES(?,?,?,'Pending','Disabled',?,DATE_ADD(NOW(),INTERVAL 5 MINUTE))",
        [$employeeWithEmail, $email, password_reset_hash($knownToken), password_reset_ip()]
    );
    $completed = password_reset_complete($pdo, $knownToken, $newPassword);
    pr_assert($completed['employeeId'] === $employeeWithEmail, 'PHP completed employee mismatch');
    $employee = db_row('SELECT Password,MustChangePassword FROM employees WHERE EmployeeID=?', [$employeeWithEmail]);
    pr_assert(password_verify($newPassword, (string)$employee['Password']), 'PHP password hash mismatch');
    pr_assert((int)$employee['MustChangePassword'] === 0, 'PHP MustChangePassword was not cleared');
    pr_expect_code(fn() => password_reset_complete($pdo, $knownToken, $newPassword), 'PASSWORD_RESET_INVALID');

    db_execute(
        "INSERT INTO password_reset_requests(EmployeeID,EmailSnapshot,TokenHash,Status,DeliveryStatus,RequestedIPAddress,ExpiresAt) VALUES(?,?,?,'Pending','Disabled',?,DATE_SUB(NOW(),INTERVAL 1 MINUTE))",
        [$employeeWithEmail, $email, password_reset_hash($expiredToken), password_reset_ip()]
    );
    pr_expect_code(fn() => password_reset_complete($pdo, $expiredToken, $newPassword), 'PASSWORD_RESET_EXPIRED');
    pr_expect_code(fn() => password_reset_complete($pdo, $knownToken, '123'), 'PASSWORD_POLICY_VIOLATION');

    $mail = password_reset_mail('<PHP Reset>', $email, $knownToken);
    pr_assert(str_contains($mail['html'], '&lt;PHP Reset&gt;'), 'PHP reset template must escape HTML');
    pr_assert(str_contains($mail['text'], '30 นาที'), 'PHP reset template TTL missing');
    echo "PHP Password Reset UAT passed: enumeration-safe request, missing email, supersede, disabled delivery, complete, one-time/expired token, policy and template.\n";
} finally {
    db_execute('DELETE FROM password_reset_audit WHERE id>? AND (EmployeeID IN (?,?,?) OR EmployeeID=?)', [$auditBaseline, $employeeWithEmail, $employeeWithoutEmail, $unknownEmployee, $rateKey]);
    db_execute('DELETE FROM password_reset_requests WHERE EmployeeID IN (?,?)', [$employeeWithEmail, $employeeWithoutEmail]);
    db_execute('DELETE FROM employees WHERE EmployeeID IN (?,?)', [$employeeWithEmail, $employeeWithoutEmail]);
    $residue = db_row(
        'SELECT (SELECT COUNT(*) FROM employees WHERE EmployeeID IN (?,?)) employees,(SELECT COUNT(*) FROM password_reset_requests WHERE EmployeeID IN (?,?)) requests,(SELECT COUNT(*) FROM password_reset_audit WHERE id>? AND (EmployeeID IN (?,?,?) OR EmployeeID=?)) audits',
        [$employeeWithEmail, $employeeWithoutEmail, $employeeWithEmail, $employeeWithoutEmail, $auditBaseline, $employeeWithEmail, $employeeWithoutEmail, $unknownEmployee, $rateKey]
    );
    echo 'PHP Password Reset cleanup: employees=' . (int)($residue['employees'] ?? -1) . '; requests=' . (int)($residue['requests'] ?? -1) . '; audits=' . (int)($residue['audits'] ?? -1) . "\n";
}
