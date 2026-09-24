<?php
declare(strict_types=1);

$port = isset($argv[1]) ? (int)$argv[1] : 0;
if ($port < 1) {
    fwrite(STDERR, "Missing SMTP test port\n");
    exit(2);
}

$config = [
    'email_enabled' => true,
    'smtp_host' => '127.0.0.1',
    'smtp_port' => $port,
    'smtp_secure' => false,
    'smtp_starttls' => false,
    'smtp_user' => '',
    'smtp_pass' => '',
    'smtp_from' => 'uat@example.invalid',
    'smtp_from_name' => 'TSH Safety Core UAT',
    'smtp_ehlo_domain' => 'localhost',
    'smtp_timeout' => 3000,
    'public_app_url' => 'http://localhost:5500',
];

require_once __DIR__ . '/../../api/mailer.php';
require_once __DIR__ . '/../../api/lib/company_email_change.php';
require_once __DIR__ . '/../../api/lib/password_reset.php';

$token = rtrim(strtr(base64_encode(str_repeat(chr(19), 32)), '+/', '-_'), '=');
$recipient = 'account-php@example.invalid';
$company = company_email_change_mail('<PHP Company>', $recipient, $token);
$reset = password_reset_mail('<PHP Reset>', $recipient, $token);
$companyResult = mailer_send_mail($recipient, $company['subject'], $company['text'], $company['html']);
$resetResult = mailer_send_mail($recipient, $reset['subject'], $reset['text'], $reset['html']);

echo json_encode([
    'companySent' => !empty($companyResult['sent']),
    'resetSent' => !empty($resetResult['sent']),
    'companyEscaped' => strpos($company['html'], '&lt;PHP Company&gt;') !== false,
    'resetEscaped' => strpos($reset['html'], '&lt;PHP Reset&gt;') !== false,
    'companyHasFallbackLink' => strpos($company['text'], '#verify-company-email=') !== false,
    'resetHasFallbackLink' => strpos($reset['text'], '#reset-password=') !== false,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
