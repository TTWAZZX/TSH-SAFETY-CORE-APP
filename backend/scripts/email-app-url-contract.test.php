<?php
declare(strict_types=1);

$target = 'https://uat.tshpcl.com/safety/tsh-safety-core/';
putenv('PUBLIC_APP_URL=' . $target);

$config = require __DIR__ . '/../../api/config.php';
require_once __DIR__ . '/../../api/handlers/workflow_phase6.php';
require_once __DIR__ . '/../../api/handlers/admin_phase8.php';
require_once __DIR__ . '/../../api/lib/password_reset.php';
require_once __DIR__ . '/../../api/lib/company_email_change.php';

$_SERVER['HTTPS'] = 'on';
$_SERVER['HTTP_HOST'] = 'dev.tshpcl.com';
$_SERVER['SCRIPT_NAME'] = '/safety/tsh-safety-core/api/index.php';

$checks = [
    'config' => ($config['public_app_url'] ?? '') === $target,
    'workflow' => wf_app_url() === $target,
    'registration' => admin8_registration_login_url() === rtrim($target, '/'),
    'passwordReset' => strpos(password_reset_url('token'), rtrim($target, '/') . '/index.html#reset-password=') === 0,
    'companyEmail' => strpos(company_email_change_verification_url('token'), rtrim($target, '/') . '/index.html#verify-company-email=') === 0,
];

$failed = array_keys(array_filter($checks, static fn(bool $passed): bool => !$passed));
if ($failed) {
    fwrite(STDERR, 'Email app URL contract failed: ' . implode(', ', $failed) . PHP_EOL);
    exit(1);
}

echo 'Email app URL contract: ' . count($checks) . '/' . count($checks) . " passed\n";
