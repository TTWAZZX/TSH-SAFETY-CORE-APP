<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api/lib/johnny_evidence_ranking.php';

$payload = json_decode((string) stream_get_contents(STDIN), true);
if (!is_array($payload) || !is_array($payload['cases'] ?? null)) {
    fwrite(STDERR, "Invalid Phase 8.2 evaluator payload\n");
    exit(2);
}

$results = [];
foreach ($payload['cases'] as $case) {
    $ranked = johnny_rank_knowledge_evidence(
        is_array($case['rows'] ?? null) ? $case['rows'] : [],
        is_array($case['options'] ?? null) ? $case['options'] : []
    );
    $results[] = [
        'id' => (string) ($case['id'] ?? ''),
        'matches' => array_map(static function (array $row): array {
            return [
                'documentId' => (int) ($row['documentId'] ?? 0),
                'chunkId' => (int) ($row['chunkId'] ?? 0),
                'rank' => (int) ($row['rank'] ?? 0),
                'evidenceType' => (string) ($row['evidenceType'] ?? ''),
                'intentBoost' => (float) ($row['intentBoost'] ?? 0),
                'evidenceScore' => (float) ($row['evidenceScore'] ?? 0),
                'evidenceTier' => (string) ($row['evidenceTier'] ?? ''),
                'rankingContract' => (string) ($row['rankingContract'] ?? ''),
            ];
        }, $ranked['matches']),
        'summary' => $ranked['summary'],
        'groups' => johnny_group_evidence_sources($ranked['matches']),
        'primary' => johnny_primary_evidence_type($ranked['matches'], is_array($case['options'] ?? null) ? $case['options'] : []),
    ];
}

echo json_encode([
    'marker' => 'JOHNNY_PHASE82_EVIDENCE_RANKING_PHP',
    'mode' => 'mock-only-no-db-no-network',
    'results' => $results,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
