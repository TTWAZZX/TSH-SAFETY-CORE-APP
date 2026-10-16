<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_live_results.php';
$questions=[['id'=>1,'questionCode'=>'Q1','title'=>'Vote','maxSelections'=>1,'options'=>[['id'=>11,'optionCode'=>'A','label'=>'A','FileID'=>0],['id'=>12,'optionCode'=>'B','label'=>'B','FileID'=>0],['id'=>13,'optionCode'=>'C','label'=>'C','FileID'=>0],['id'=>14,'optionCode'=>'D','label'=>'D','FileID'=>0]]]];
$answers=array_map(fn($id)=>['QuestionID'=>1,'OptionID'=>$id],[11,11,11,12,12,13,13,14]);
echo json_encode(['config'=>svlr_config(['liveLeaderboardEnabled'=>true,'liveLeaderboardTopN'=>10,'liveLeaderboardScoreMode'=>'count_percentage','liveLeaderboardVisibility'=>'after_submit','liveLeaderboardRefreshSeconds'=>15,'liveLeaderboardPrivacyThreshold'=>7],7),'aggregate'=>svlr_aggregate($questions,$answers,2),'empty'=>svlr_masked_questions($questions,2,true),'threshold'=>svlr_masked_questions($questions,2,false)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
