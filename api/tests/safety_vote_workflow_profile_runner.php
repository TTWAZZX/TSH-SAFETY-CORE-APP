<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_workflow_profile.php';
$input = json_decode(stream_get_contents(STDIN), true);
$rows = [];
foreach (($input['cases'] ?? []) as $case) {
    $rows[] = safety_vote_resolve_workflow_profile($case);
}
echo json_encode($rows, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
