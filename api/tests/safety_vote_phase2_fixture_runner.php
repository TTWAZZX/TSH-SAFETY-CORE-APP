<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase2.php';
$f=json_decode((string)stream_get_contents(STDIN),true)?:[];
$builder=sv2_builder($f['questions']??null);
$answers=$builder['ok']?sv2_answers($f['resolvedQuestions']??[],$f['answers']??null):['ok'=>false,'errors'=>[],'answers'=>[]];
echo json_encode(['builder'=>$builder,'answers'=>$answers,'hash'=>sv2_hash($f['hashInput']??[]),'rowsHash'=>sv2_rows_hash($f['employees']??[]),'transitions'=>array_map(fn($x)=>sv2_transition($x[0],$x[1]),$f['transitions']??[])],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
