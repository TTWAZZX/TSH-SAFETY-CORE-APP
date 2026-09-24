<?php
declare(strict_types=1);

if (getenv('CONTROLLED_MAIL_UAT') !== '1') {
    fwrite(STDERR, "Controlled mail UAT opt-in is required.\n");
    exit(2);
}

$config = require __DIR__ . '/../../api/config.php';
require_once __DIR__ . '/../../api/mailer.php';
require_once __DIR__ . '/../../api/lib/password_reset.php';

$recipient = trim((string)($config['smtp_user'] ?? ''));
$ready = !empty($config['email_enabled'])
    && !empty($config['password_reset_email_delivery_enabled'])
    && mailer_smtp_configured()
    && filter_var($recipient, FILTER_VALIDATE_EMAIL);
if (!$ready) {
    fwrite(STDERR, "PHP controlled mail configuration is not ready.\n");
    exit(3);
}

$token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
$mail = password_reset_mail('Controlled Mail UAT', $recipient, $token);
$result = mailer_send_mail($recipient, '[UAT] ' . $mail['subject'], $mail['text'], $mail['html']);
if (empty($result['sent'])) {
    fwrite(STDERR, "PHP SMTP did not accept the message.\n");
    exit(4);
}

echo json_encode([
    'runtime' => 'PHP',
    'accepted' => true,
    'template' => 'password-reset',
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
