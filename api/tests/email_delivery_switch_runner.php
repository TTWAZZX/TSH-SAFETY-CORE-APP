<?php
declare(strict_types=1);

$config = [
    'email_enabled' => false,
    'smtp_host' => 'smtp.invalid',
];
require dirname(__DIR__) . '/mailer.php';

$result = mailer_send_mail('uat@example.invalid', 'UAT', 'UAT');
echo json_encode([
    'configured' => mailer_smtp_configured(),
    'result' => $result,
], JSON_UNESCAPED_SLASHES);

