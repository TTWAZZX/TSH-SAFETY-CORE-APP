<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase1.php';
$fixture=json_decode((string)stream_get_contents(STDIN),true)?:[];
$campaigns=array_map(fn($row)=>sv_campaign($row),$fixture['campaigns']??[]);
$ruleSet=sv_rules($fixture['rules']??[]);
echo json_encode(['campaigns'=>$campaigns,'ruleSet'=>$ruleSet,'eligible'=>$ruleSet['ok']?sv_evaluate($ruleSet['rules'],$fixture['employees']??[]):[],'hash'=>sv_hash($fixture['hashInput']??[])],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
