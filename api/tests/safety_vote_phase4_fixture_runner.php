<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase4.php';
$x=json_decode(stream_get_contents(STDIN),true);
$variants=$x['variants'];
$criteria=[['criterionCode'=>'SAFE','title'=>'Safety','minScore'=>0,'maxScore'=>10,'weight'=>2]];
$sheetCriteria=[['id'=>1,'minScore'=>0,'maxScore'=>10,'weight'=>1]];
$scores=[['candidateId'=>10,'criterionId'=>1,'score'=>8]];
$stages=[
 ['stageKey'=>'QUAL','stageName'=>'Qualifying','sequenceNo'=>1,'advanceRule'=>['topN'=>2,'threshold'=>60,'blind'=>true]],
 ['stageKey'=>'FINAL','stageName'=>'Final','sequenceNo'=>2,'advanceRule'=>['topN'=>1,'threshold'=>70,'blind'=>true]],
];
echo json_encode([
 'calculations'=>array_map('sv4_calculate',$variants),
 'criteria'=>sv4_criteria($criteria),
 'sheet'=>sv4_sheet($sheetCriteria,[10],$scores),
 'stages'=>sv4_stages($stages),
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
