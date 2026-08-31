<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bbs_phase1.php';

$input = json_decode((string) stream_get_contents(STDIN), true);
if (!is_array($input)) {
    fwrite(STDERR, "Invalid fixture input\n");
    exit(2);
}

$results = [];
foreach (($input['assignments'] ?? []) as $fixture) {
    $results['assignments'][] = bbs_phase1_validate_assignment($fixture);
}
foreach (($input['kpi'] ?? []) as $fixture) {
    $results['kpi'][] = bbs_phase1_kpi_due($fixture['rule'] ?? [], (string) ($fixture['date'] ?? ''));
}
$results['levels'] = array_map('bbs_phase1_normalize_level', $input['levels'] ?? []);
$results['weekdays'] = array_map('bbs_phase1_weekdays', $input['weekdays'] ?? []);

echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
