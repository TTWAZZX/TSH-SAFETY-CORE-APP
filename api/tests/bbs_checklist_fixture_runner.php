<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/bbs_phase1.php';
require_once __DIR__ . '/../lib/bbs_checklist.php';
$fixture = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$result = [
    'drafts' => array_map('bbs_checklist_validate_draft', $fixture['drafts'] ?? []),
    'importPreviews' => array_map('bbs_checklist_import_preview', $fixture['importPreviews'] ?? []),
    'resolutions' => array_map(static fn($row) => bbs_checklist_resolve_candidates($row['candidates'], $row['context']), $fixture['resolutions'] ?? []),
    'publishConflicts' => array_map(static fn($row) => bbs_checklist_publish_conflicts($row['mine'], $row['others']), $fixture['publishConflicts'] ?? []),
];
echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
