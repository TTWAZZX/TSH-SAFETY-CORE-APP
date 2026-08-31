<?php
declare(strict_types=1);
require_once __DIR__ . '/../handlers/bbs_smart_card.php';
require_once __DIR__ . '/../lib/bbs_observation.php';
$fixture = json_decode(stream_get_contents(STDIN), true) ?: [];
$out = [
    'answers' => array_map('bbs_observation_normalize_answers', $fixture['answers'] ?? []),
    'submissions' => array_map('bbs_observation_validate_submission', $fixture['submissions'] ?? []),
    'weekdays' => array_map(static fn($row) => bbs_observation_business_weekdays((int)$row['year'], (int)$row['month'], array_key_exists('throughDay',$row) && $row['throughDay'] !== null ? (int)$row['throughDay'] : null), $fixture['weekdays'] ?? []),
];
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
