<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api/handlers/platform.php';
require_once dirname(__DIR__, 2) . '/api/handlers/admin_phase8.php';

$payload = json_decode((string) stream_get_contents(STDIN), true);
$cases = is_array($payload) ? $payload : [];
$result = [];
foreach ($cases as $case) {
    $config = is_array($case['config'] ?? null) ? $case['config'] : [];
    $year = (int) ($case['year'] ?? date('Y'));
    $result[] = [
        'dashboard' => dashboard_cccf_worker_source_for_year($config, $year),
        'safetyCoreData' => admin8_cccf_worker_source_for_year($config, $year),
    ];
}
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
