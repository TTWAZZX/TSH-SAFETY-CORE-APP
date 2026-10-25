<?php
declare(strict_types=1);

const SV_PARTICIPATION_AUTHORIZATION_CONTRACT = '2026-10-25-safety-vote-participation-authorization-r1';

function svpa_type_groups(): array {
    return [
        'ballot'=>['popular_vote','secret_election','survey','poll','feedback','ranking','prioritization','allocation','resolution','petition','event_choice','risk_perception','knowledge_check','multi_stage','hybrid_scoring'],
        'submission'=>['submission_challenge','jury_scoring','hybrid_scoring','multi_stage'],
        'nomination'=>['nomination','award','multi_stage'],
        'jury'=>['jury_scoring','hybrid_scoring','multi_stage'],
    ];
}

function svpa_actions(): array {
    return [
        'ballot_submit'=>['group'=>'ballot','entitlement'=>'eligible'],
        'answer_file_upload'=>['group'=>'ballot','entitlement'=>'eligible'],
        'submission_create'=>['group'=>'submission','entitlement'=>'eligible'],
        'submission_update'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'submission_submit'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'submission_withdraw'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'submission_file_upload'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'submission_gallery_upload'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'submission_gallery_update'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'submission_gallery_remove'=>['group'=>'submission','entitlement'=>'eligible_owner'],
        'nomination_create'=>['group'=>'nomination','entitlement'=>'eligible'],
        'nomination_consent'=>['group'=>'nomination','entitlement'=>'nominee'],
        'jury_score_save'=>['group'=>'jury','entitlement'=>'assignment'],
        'jury_score_submit'=>['group'=>'jury','entitlement'=>'assignment'],
        'jury_recuse'=>['group'=>'jury','entitlement'=>'assignment'],
    ];
}

function svpa_denial(int $status, string $code, string $message): array {
    return ['allowed'=>false,'status'=>$status,'code'=>$code,'message'=>$message,'contractVersion'=>SV_PARTICIPATION_AUTHORIZATION_CONTRACT];
}

function svpa_authorize(array $input): array {
    $action=(string)($input['action']??'');$actions=svpa_actions();$policy=$actions[$action]??null;$campaign=$input['campaign']??null;
    if(!$policy)return svpa_denial(400,'PARTICIPATION_ACTION_INVALID','Participation action is not recognized.');
    if(!is_array($campaign))return svpa_denial(404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');
    if((int)($campaign['IsHidden']??$campaign['isHidden']??0)===1||(int)($campaign['IsTest']??$campaign['isTest']??0)===1)return svpa_denial(409,'CAMPAIGN_NOT_PARTICIPATABLE','Hidden and test campaigns cannot accept participant actions.');
    $type=(string)($campaign['CampaignType']??$campaign['campaignType']??'');$groups=svpa_type_groups();
    if(!in_array($type,$groups[$policy['group']],true))return svpa_denial(409,'PARTICIPATION_ACTION_NOT_SUPPORTED','This participation action is not supported by the campaign type.');
    $current=(int)($campaign['CurrentVersionID']??$campaign['currentVersionId']??0);$resource=(int)($input['resourceVersionId']??0);
    if($resource>0&&$current!==$resource)return svpa_denial(409,'PARTICIPATION_VERSION_CONFLICT','The participation resource is not in the current campaign version.');
    if((string)($campaign['Status']??$campaign['status']??'')!=='Open'||(int)($campaign['VotingWindowOpen']??$campaign['votingWindowOpen']??0)!==1)return svpa_denial(409,'CAMPAIGN_NOT_IN_VOTING_WINDOW','The campaign participation window is closed.');
    $entitlement=$policy['entitlement'];
    if(strpos($entitlement,'eligible')!==false&&($input['eligible']??false)!==true)return svpa_denial(403,'CAMPAIGN_NOT_ELIGIBLE','This account has read-only catalogue access and cannot participate.');
    if($entitlement==='eligible_owner'&&($input['owner']??false)!==true)return svpa_denial(403,'PARTICIPATION_OWNERSHIP_REQUIRED','Only the owner may change this participation resource.');
    if($entitlement==='nominee'&&($input['nominee']??false)!==true)return svpa_denial(403,'PARTICIPATION_NOMINEE_REQUIRED','Only the nominated employee may record consent.');
    if($entitlement==='assignment'&&($input['assignment']??false)!==true)return svpa_denial(403,'PARTICIPATION_ASSIGNMENT_REQUIRED','An active jury assignment is required.');
    return ['allowed'=>true,'status'=>200,'code'=>'PARTICIPATION_AUTHORIZED','contractVersion'=>SV_PARTICIPATION_AUTHORIZATION_CONTRACT,'action'=>$action,'entitlement'=>$entitlement,'campaignType'=>$type];
}

function svpa_require(array $input): array {
    $decision=svpa_authorize($input);
    if(!$decision['allowed'])json_response(['success'=>false,'code'=>$decision['code'],'message'=>$decision['message'],'details'=>['contractVersion'=>SV_PARTICIPATION_AUTHORIZATION_CONTRACT,'action'=>$input['action']??null]],$decision['status']);
    return $decision;
}
