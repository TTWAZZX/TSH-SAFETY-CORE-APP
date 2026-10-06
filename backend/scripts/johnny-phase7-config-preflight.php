<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(2);
}

$root = dirname(__DIR__, 2);
$configPath = $root . '/api/config.local.php';
foreach ($argv as $argument) {
    if (strpos($argument, '--config=') === 0) $configPath = substr($argument, 9);
}
$resolved = realpath($configPath);
if ($resolved === false || !is_file($resolved)) {
    fwrite(STDERR, "CONFIG_PREFLIGHT_FAIL: configuration file is missing\n");
    exit(1);
}

$config = require $resolved;
if (!is_array($config)) {
    fwrite(STDERR, "CONFIG_PREFLIGHT_FAIL: configuration must return an array\n");
    exit(1);
}

$required = [
    'db_host', 'db_port', 'db_user', 'db_pass', 'db_name', 'jwt_secret',
    'public_upload_base_url', 'public_app_url',
    'gemini_api_key', 'gemini_model', 'gemini_models', 'gemini_embedding_model',
    'gemini_api_base', 'gemini_timeout_ms', 'gemini_max_output_tokens',
    'johnny_kb_max_upload_mb', 'johnny_avatar_max_upload_mb', 'johnny_risk_image_max_upload_mb',
    'johnny_chat_retention_days', 'johnny_operational_log_retention_days',
    'johnny_web_research_enabled', 'johnny_web_allowed_domains', 'johnny_system_data_enabled',
];
$errors = [];
$keyStatus = [];
foreach ($required as $key) {
    $present = array_key_exists($key, $config);
    $keyStatus[$key] = $present;
    if (!$present) $errors[] = 'missing-key:' . $key;
}

$nonEmpty = ['db_host', 'db_user', 'db_pass', 'db_name', 'jwt_secret', 'public_upload_base_url', 'public_app_url', 'gemini_api_key', 'gemini_model', 'gemini_models', 'gemini_embedding_model', 'gemini_api_base'];
foreach ($nonEmpty as $key) {
    if (!array_key_exists($key, $config)) continue;
    $value = trim((string) $config[$key]);
    if ($value === '' || stripos($value, 'SET_') === 0 || stripos($value, 'CHANGE_') === 0) $errors[] = 'invalid-or-placeholder:' . $key;
}

foreach (['public_upload_base_url', 'public_app_url', 'gemini_api_base'] as $key) {
    if (isset($config[$key]) && filter_var((string) $config[$key], FILTER_VALIDATE_URL) === false) $errors[] = 'invalid-url:' . $key;
}

$ranges = [
    'db_port' => [1, 65535],
    'gemini_timeout_ms' => [1000, 120000],
    'gemini_max_output_tokens' => [128, 65536],
    'johnny_kb_max_upload_mb' => [1, 100],
    'johnny_avatar_max_upload_mb' => [1, 20],
    'johnny_risk_image_max_upload_mb' => [1, 30],
    'johnny_chat_retention_days' => [30, 3650],
    'johnny_operational_log_retention_days' => [1, 365],
];
foreach ($ranges as $key => $range) {
    if (!array_key_exists($key, $config)) continue;
    $value = filter_var($config[$key], FILTER_VALIDATE_INT);
    if ($value === false || $value < $range[0] || $value > $range[1]) $errors[] = 'out-of-range:' . $key;
}

foreach (['johnny_web_research_enabled', 'johnny_system_data_enabled'] as $key) {
    if (array_key_exists($key, $config) && !is_bool($config[$key])) $errors[] = 'not-boolean:' . $key;
}
if (!empty($config['johnny_web_research_enabled']) && trim((string) ($config['johnny_web_allowed_domains'] ?? '')) === '') {
    $errors[] = 'empty-allowlist:johnny_web_allowed_domains';
}

$extensions = [
    'pdo_mysql' => extension_loaded('pdo_mysql'),
    'json' => extension_loaded('json'),
    'mbstring' => extension_loaded('mbstring'),
    'fileinfo' => extension_loaded('fileinfo'),
    'zip' => class_exists('ZipArchive'),
    'image-metadata' => function_exists('getimagesize'),
    'https-client' => function_exists('curl_init') || filter_var((string) ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN),
];
foreach ($extensions as $name => $available) {
    if (!$available) $errors[] = 'missing-capability:' . $name;
}
if (version_compare(PHP_VERSION, '7.4.0', '<')) $errors[] = 'php-version-below-7.4';

$report = [
    'success' => count($errors) === 0,
    'valuesSuppressed' => true,
    'phpVersion' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '.' . PHP_RELEASE_VERSION,
    'configFilePresent' => true,
    'keys' => $keyStatus,
    'capabilities' => $extensions,
    'errors' => $errors,
];
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
exit($report['success'] ? 0 : 1);
