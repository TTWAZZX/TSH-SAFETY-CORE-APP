<?php
declare(strict_types=1);

function load_env_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }

    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || substr($line, 0, 1) === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $values[trim($key)] = trim($value, " \t\n\r\0\x0B\"'");
    }
    return $values;
}

$env = load_env_file(dirname(__DIR__) . '/backend/.env');
$localConfig = is_file(__DIR__ . '/config.local.php')
    ? require __DIR__ . '/config.local.php'
    : [];

$read = static function (string $key, $fallback = null) use ($env, $localConfig) {
    $localKey = strtolower($key);
    if (array_key_exists($localKey, $localConfig)) {
        return $localConfig[$localKey];
    }
    $processValue = getenv($key);
    if ($processValue !== false && $processValue !== '') {
        return $processValue;
    }
    return $env[$key] ?? $fallback;
};

return [
    'db_host' => (string) $read('DB_HOST', 'localhost'),
    'db_port' => (int) $read('DB_PORT', 3306),
    'db_user' => (string) $read('DB_USER', ''),
    'db_pass' => (string) $read('DB_PASS', ''),
    'db_name' => (string) $read('DB_NAME', ''),
    'db_ssl' => filter_var($read('DB_SSL', false), FILTER_VALIDATE_BOOLEAN),
    'jwt_secret' => (string) $read('JWT_SECRET', ''),
    'jwt_ttl' => 6 * 60 * 60,
    'smtp_host' => (string) $read('SMTP_HOST', ''),
    'smtp_port' => (int) $read('SMTP_PORT', 587),
    'smtp_secure' => filter_var($read('SMTP_SECURE', false), FILTER_VALIDATE_BOOLEAN),
    'smtp_starttls' => filter_var($read('SMTP_STARTTLS', true), FILTER_VALIDATE_BOOLEAN),
    'smtp_user' => (string) $read('SMTP_USER', ''),
    'smtp_pass' => (string) $read('SMTP_PASS', ''),
    'smtp_from' => (string) $read('SMTP_FROM', $read('SMTP_USER', 'noreply@localhost')),
    'smtp_from_name' => (string) $read('SMTP_FROM_NAME', 'TSH Safety Core'),
    'smtp_timeout' => (int) $read('SMTP_TIMEOUT_MS', 15000),
    'smtp_ehlo_domain' => (string) $read('SMTP_EHLO_DOMAIN', 'localhost'),
];
