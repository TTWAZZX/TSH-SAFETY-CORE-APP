<?php
declare(strict_types=1);

$_SERVER['REQUEST_METHOD'] = 'PUT';
$_SERVER['CONTENT_TYPE'] = (string)($argv[1] ?? '');

require_once dirname(__DIR__) . '/handlers/fourm_phase7.php';

$parsed = fm_parse_put_multipart_raw((string)stream_get_contents(STDIN), $_SERVER['CONTENT_TYPE']);
foreach ($parsed['files'] as $file) {
    if (!empty($file['tmp']) && is_file($file['tmp'])) @unlink($file['tmp']);
}

echo json_encode([
    'fields' => $parsed['fields'],
    'files' => array_map(static function (array $file): array {
        return ['name' => $file['name'], 'size' => $file['size'], 'type' => $file['type']];
    }, $parsed['files']),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
