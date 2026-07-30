<?php
declare(strict_types=1);

require dirname(__DIR__, 2) . '/api/lib/personal_target_eligibility.php';

$payload = json_decode(stream_get_contents(STDIN) ?: '{}', true);
$eligibility = [];
foreach (($payload['eligibility'] ?? []) as $fixture) {
    $eligibility[] = personal_target_admin_eligibility(
        $fixture['activity'] ?? [],
        $fixture['row'] ?? null
    );
}
$policies = [];
foreach (($payload['policies'] ?? []) as $fixture) {
    $policies[] = personal_target_mandatory_policy(
        $fixture['state'] ?? [],
        (int) ($fixture['year'] ?? date('Y'))
    );
}
echo json_encode(['eligibility'=>$eligibility,'policies'=>$policies], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
