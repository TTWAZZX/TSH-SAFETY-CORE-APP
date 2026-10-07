<?php
declare(strict_types=1);

const JOHNNY_EVIDENCE_RANKING_VERSION = '2026-10-07-phase8.2-r1';

function johnny_evidence_clamp($value, float $min = 0.0, float $max = 1.0): float
{
    return max($min, min($max, (float) $value));
}

function johnny_evidence_type($sourceType): string
{
    return strtolower((string) ($sourceType ?: 'document')) === 'manual' ? 'safety_knowledge' : 'company_document';
}

function johnny_evidence_signals(array $options = []): array
{
    $usage = is_array($options['usageResult'] ?? null) ? $options['usageResult'] : [];
    $reasons = is_array($usage['reasons'] ?? null) ? $usage['reasons'] : [];
    return [
        'scoped' => !empty($options['scopedDocument']),
        'safety' => in_array('safety_or_emergency_signal', $reasons, true),
        'company' => in_array('company_document_signal', $reasons, true),
        'mixed' => !empty($usage['mixedIntent']),
    ];
}

function johnny_evidence_intent_boost(string $type, array $signals): float
{
    if (!empty($signals['scoped'])) return 0.04;
    if (!empty($signals['safety'])) return $type === 'safety_knowledge' ? 0.12 : -0.02;
    if (!empty($signals['company'])) return $type === 'company_document' ? 0.1 : 0.0;
    return 0.0;
}

function johnny_evidence_tier(float $score): string
{
    if ($score >= 0.82) return 'strong';
    if ($score >= 0.68) return 'high';
    if ($score >= 0.55) return 'supported';
    return 'weak';
}

function johnny_compare_evidence(array $a, array $b): int
{
    return ($b['evidenceScore'] <=> $a['evidenceScore'])
        ?: ($b['hybridScore'] <=> $a['hybridScore'])
        ?: ($b['semanticScore'] <=> $a['semanticScore'])
        ?: ($b['keywordScore'] <=> $a['keywordScore'])
        ?: ((int) ($a['documentId'] ?? 0) <=> (int) ($b['documentId'] ?? 0))
        ?: ((int) ($a['ChunkIndex'] ?? 0) <=> (int) ($b['ChunkIndex'] ?? 0));
}

function johnny_rank_knowledge_evidence(array $rows, array $options = []): array
{
    $limit = max(1, (int) ($options['limit'] ?? 6));
    $scoped = !empty($options['scopedDocument']);
    $maxPerDocument = $scoped ? $limit : max(1, (int) ($options['maxChunksPerDocument'] ?? 2));
    $diversityMargin = johnny_evidence_clamp($options['diversityMargin'] ?? 0.18, 0.0, 0.5);
    $signals = johnny_evidence_signals($options);
    $ranked = [];
    $thresholdEligibleCount = 0;
    foreach ($rows as $row) {
        if (!$row || (array_key_exists('eligible', $row) && !$row['eligible'])) continue;
        $thresholdEligibleCount++;
        $type = johnny_evidence_type($row['SourceType'] ?? 'document');
        $boost = johnny_evidence_intent_boost($type, $signals);
        $hybrid = johnny_evidence_clamp($row['hybridScore'] ?? $row['score'] ?? 0);
        $score = johnny_evidence_clamp($hybrid + $boost);
        $row['semanticScore'] = johnny_evidence_clamp($row['semanticScore'] ?? 0);
        $row['keywordScore'] = johnny_evidence_clamp($row['keywordScore'] ?? 0);
        $row['hybridScore'] = $hybrid;
        $row['evidenceType'] = $type;
        $row['intentBoost'] = $boost;
        $row['evidenceScore'] = $score;
        $row['evidenceTier'] = johnny_evidence_tier($score);
        $row['rankingContract'] = JOHNNY_EVIDENCE_RANKING_VERSION;
        $row['score'] = $score;
        $ranked[] = $row;
    }
    usort($ranked, 'johnny_compare_evidence');

    $deduped = [];
    $seen = [];
    $perDocument = [];
    foreach ($ranked as $row) {
        $text = preg_replace('/\s+/u', ' ', mb_strtolower(trim((string) ($row['ChunkText'] ?? ''))));
        $docId = (int) ($row['documentId'] ?? 0);
        $key = $docId . ':' . (string) $text;
        if (isset($seen[$key])) continue;
        $count = (int) ($perDocument[$docId] ?? 0);
        if ($count >= $maxPerDocument) continue;
        $seen[$key] = true;
        $perDocument[$docId] = $count + 1;
        $deduped[] = $row;
    }
    $ranked = $deduped;

    $selected = [];
    $selectedKeys = [];
    $topScore = (float) ($ranked[0]['evidenceScore'] ?? 0);
    if (!$scoped) {
        $firstByDocument = [];
        foreach ($ranked as $row) {
            $docId = (int) ($row['documentId'] ?? 0);
            if (!isset($firstByDocument[$docId])) $firstByDocument[$docId] = $row;
        }
        $diverse = array_values(array_filter($firstByDocument, static function (array $row) use ($topScore, $diversityMargin): bool {
            return (float) $row['evidenceScore'] >= max(0.55, $topScore - $diversityMargin);
        }));
        usort($diverse, 'johnny_compare_evidence');
        foreach (array_slice($diverse, 0, $limit) as $row) {
            $selected[] = $row;
            $selectedKeys[(int) ($row['documentId'] ?? 0) . ':' . (string) ($row['chunkId'] ?? $row['id'] ?? $row['ChunkIndex'] ?? 0)] = true;
        }
    }
    foreach ($ranked as $row) {
        if (count($selected) >= $limit) break;
        $key = (int) ($row['documentId'] ?? 0) . ':' . (string) ($row['chunkId'] ?? $row['id'] ?? $row['ChunkIndex'] ?? 0);
        if (isset($selectedKeys[$key])) continue;
        $selected[] = $row;
        $selectedKeys[$key] = true;
    }
    usort($selected, 'johnny_compare_evidence');
    foreach ($selected as $index => &$row) {
        $row['rank'] = $index + 1;
        $row['score'] = $row['evidenceScore'];
    }
    unset($row);

    $documents = [];
    $sourceTypes = [];
    $strong = 0;
    foreach ($selected as $row) {
        $documents[(int) ($row['documentId'] ?? 0)] = true;
        $sourceTypes[(string) $row['evidenceType']] = true;
        if (($row['evidenceTier'] ?? '') === 'strong') $strong++;
    }
    return [
        'matches' => $selected,
        'summary' => [
            'version' => JOHNNY_EVIDENCE_RANKING_VERSION,
            'candidateCount' => count($rows),
            'eligibleCount' => $thresholdEligibleCount,
            'rankableCount' => count($ranked),
            'selectedCount' => count($selected),
            'distinctDocuments' => count($documents),
            'sourceTypes' => array_keys($sourceTypes),
            'strongEvidenceCount' => $strong,
            'topEvidenceScore' => $selected ? (float) $selected[0]['evidenceScore'] : 0.0,
            'diversityApplied' => !$scoped,
            'maxChunksPerDocument' => $maxPerDocument,
            'signals' => $signals,
        ],
    ];
}

function johnny_group_evidence_sources(array $matches): array
{
    $counts = [];
    foreach ($matches as $row) {
        $type = (string) ($row['evidenceType'] ?? johnny_evidence_type($row['SourceType'] ?? 'document'));
        $counts[$type] = (int) ($counts[$type] ?? 0) + 1;
    }
    $groups = [];
    foreach ($counts as $type => $count) {
        $groups[] = [
            'type' => $type,
            'label' => $type === 'safety_knowledge' ? 'ข้อมูลจาก safety knowledge' : 'ข้อมูลจากเอกสารบริษัท',
            'count' => $count,
            'contractVersion' => JOHNNY_EVIDENCE_RANKING_VERSION,
        ];
    }
    return $groups;
}

function johnny_primary_evidence_type(array $matches, array $options = []): ?string
{
    if (!$matches) return null;
    $groups = johnny_group_evidence_sources($matches);
    $signals = johnny_evidence_signals($options);
    if (!empty($signals['safety'])) {
        foreach ($groups as $group) if ($group['type'] === 'safety_knowledge') return 'safety_knowledge';
    }
    return (string) ($matches[0]['evidenceType'] ?? johnny_evidence_type($matches[0]['SourceType'] ?? 'document'));
}
