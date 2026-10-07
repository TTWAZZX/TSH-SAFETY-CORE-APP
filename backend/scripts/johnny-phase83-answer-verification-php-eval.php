<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/lib/johnny_answer_verification.php';

$payload = json_decode((string) stream_get_contents(STDIN), true);
if (!is_array($payload) || !is_array($payload['cases'] ?? null)) {
    fwrite(STDERR, "Invalid Phase 8.3 evaluator payload\n");
    exit(1);
}

$results = [];
foreach ($payload['cases'] as $case) {
    $result = johnny_verify_grounded_answer($case['input'] ?? []);
    $results[] = ['id' => $case['id'] ?? 'unknown', 'result' => $result];
}
echo json_encode(['version' => JOHNNY_ANSWER_VERIFICATION_VERSION, 'results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
