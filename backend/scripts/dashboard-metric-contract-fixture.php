<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/api/lib/dashboard_metric_contract.php';

$raw = stream_get_contents(STDIN);
$payload = json_decode($raw ?: '[]', true);
if (!is_array($payload)) {
    fwrite(STDERR, "Expected a JSON fixture array.\n");
    exit(2);
}

$result = [];
foreach ($payload as $fixture) {
    $result[] = dashboard_metric_create(
        (string) ($fixture['key'] ?? ''),
        is_array($fixture['options'] ?? null) ? $fixture['options'] : []
    );
}

echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
