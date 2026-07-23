<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/onboarding_resolver.php';
require_once dirname(__DIR__) . '/lib/onboarding_enforcement.php';

$payload = json_decode((string)stream_get_contents(STDIN), true);
if (!is_array($payload) || !is_array($payload['cases'] ?? null)) {
    fwrite(STDERR, "Invalid enforcement test input.\n");
    exit(2);
}

$results = [];
foreach ($payload['cases'] as $case) {
    $block = onboarding_block(
        (string)($case['status'] ?? ''),
        (string)($case['method'] ?? 'GET'),
        (string)($case['path'] ?? '/')
    );
    $results[] = [
        'name' => (string)($case['name'] ?? ''),
        'requestKey' => onboarding_request_key((string)($case['method'] ?? 'GET'), (string)($case['path'] ?? '/')),
        'block' => $block,
    ];
}

echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
