<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_result_release.php';
$input=json_decode(stream_get_contents(STDIN),true)?:[];
$out=[];
foreach($input as$row)$out[]=sv_result_release_decision(is_array($row)?$row:[]);
echo json_encode($out,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
