<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase5.php';
$input=json_decode(stream_get_contents(STDIN),true)?:[];
echo json_encode([
    'integrity'=>sv5_snapshot_integrity($input['snapshot']??[],$input['rows']??[]),
    'top'=>sv5_official_top_n_groups($input['groups']??[],$input['topN']??null)
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
