<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/bbs_action.php';
$fixture=json_decode((string)stream_get_contents(STDIN),true)?:[];
echo json_encode([
    'priorities'=>array_map('bbs_action_priority',$fixture['priorities']??[]),
    'statuses'=>array_map('bbs_action_status',$fixture['statuses']??[]),
    'dates'=>array_map('bbs_action_date',$fixture['dates']??[]),
    'transitions'=>array_map(static fn($row)=>bbs_action_transition_allowed((string)$row[0],(string)$row[1]),$fixture['transitions']??[]),
    'ownerTransitions'=>array_map(static fn($row)=>bbs_action_owner_transition((string)$row[0],(string)$row[1]),$fixture['transitions']??[]),
    'verifierTransitions'=>array_map(static fn($row)=>bbs_action_verifier_transition((string)$row[0],(string)$row[1]),$fixture['transitions']??[]),
    'actionNos'=>array_map('bbs_action_no',$fixture['answerIds']??[]),
],JSON_UNESCAPED_SLASHES);
