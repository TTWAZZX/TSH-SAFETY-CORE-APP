<?php
declare(strict_types=1);
const SAFETY_VOTE_RESULT_RELEASE_CONTRACT='2026-10-25-result-release-policy-r1';
function sv_result_release_normalize($value):string{return strtolower((string)$value)==='automatic'?'automatic':'manual';}
function sv_result_release_decision(array $input):array{
    $policy=sv_result_release_normalize($input['policy']??'manual');
    $type=(string)($input['campaignType']??'');
    $status=(string)($input['snapshotStatus']??'');
    $balanced=(string)($input['reconciliationState']??'')==='balanced';
    $governanceReady=!empty($input['governanceReady']);
    if($policy!=='automatic')return['contract'=>SAFETY_VOTE_RESULT_RELEASE_CONTRACT,'policy'=>$policy,'action'=>'hold','reason'=>'MANUAL_RELEASE'];
    if(!$balanced)return['contract'=>SAFETY_VOTE_RESULT_RELEASE_CONTRACT,'policy'=>$policy,'action'=>'hold','reason'=>'RECONCILIATION_REQUIRED'];
    if($type==='popular_vote'&&$status==='Frozen')return['contract'=>SAFETY_VOTE_RESULT_RELEASE_CONTRACT,'policy'=>$policy,'action'=>'publish','reason'=>'STANDARD_CLOSE_READY'];
    if($status==='Certified'&&$governanceReady)return['contract'=>SAFETY_VOTE_RESULT_RELEASE_CONTRACT,'policy'=>$policy,'action'=>'publish','reason'=>'GOVERNANCE_COMPLETE'];
    return['contract'=>SAFETY_VOTE_RESULT_RELEASE_CONTRACT,'policy'=>$policy,'action'=>'hold','reason'=>'GOVERNANCE_PENDING'];
}
