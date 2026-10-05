<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api/lib/cccf_worker_progress.php';

$input = json_decode((string) stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$output = array_map(static function (array $case): ?array {
    return cccf_worker_safety360_target_result($case['progress'] ?? null, $case['unit'] ?? null);
}, $input);

echo json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
