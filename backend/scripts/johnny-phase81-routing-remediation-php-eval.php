<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/lib/johnny_system_usage.php';

const JOHNNY_PHASE81_ROUTING_REMEDIATION_PHP = 'mock-only-no-db-no-network';

$payload = json_decode((string) stream_get_contents(STDIN), true);
$cases = is_array($payload['cases'] ?? null) ? $payload['cases'] : [];
$results = [];
foreach ($cases as $case) {
    $result = johnny_search_system_usage(
        (string) ($case['question'] ?? ''),
        is_array($case['pageContext'] ?? null) ? $case['pageContext'] : null
    );
    $deterministicUsage = !empty($result['pureUsage']) && ($result['confidenceLevel'] ?? '') === 'high';
    $liveSystemData = in_array('live_system_data_signal', $result['reasons'] ?? [], true);
    $results[] = [
        'id' => (string) ($case['id'] ?? ''),
        'matched' => !empty($result['matched']),
        'pureUsage' => !empty($result['pureUsage']),
        'confidence' => (float) ($result['confidence'] ?? 0),
        'confidenceLevel' => (string) ($result['confidenceLevel'] ?? 'none'),
        'reasons' => array_values($result['reasons'] ?? []),
        'explicitUiIntent' => !empty($result['explicitUiIntent']),
        'referencedPage' => $result['referencedPage'] ?? null,
        'referencedModules' => array_values($result['referencedModules'] ?? []),
        'requiresKnowledgeBase' => !empty($result['requiresKnowledgeBase']),
        'mixedIntent' => !empty($result['mixedIntent']),
        'broad' => !empty($result['broad']),
        'keys' => array_values(array_map(static fn(array $entry): string => (string) ($entry['key'] ?? ''), $result['entries'] ?? [])),
        'routingDecision' => [
            'deterministicUsage' => $deterministicUsage,
            'retrieveKnowledgeBase' => !$deterministicUsage,
            'allowWebResearch' => !$deterministicUsage && empty($result['requiresKnowledgeBase']) && !$liveSystemData,
        ],
    ];
}

echo json_encode([
    'marker' => 'JOHNNY_PHASE81_ROUTING_REMEDIATION_PHP',
    'mode' => JOHNNY_PHASE81_ROUTING_REMEDIATION_PHP,
    'results' => $results,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
