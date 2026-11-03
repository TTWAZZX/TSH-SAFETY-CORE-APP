<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase5.php';
$input=json_decode(stream_get_contents(STDIN),true)?:[];
echo json_encode(sv5_official_result_model($input),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
