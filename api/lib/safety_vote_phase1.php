<?php
declare(strict_types=1);
require_once __DIR__.'/safety_vote_live_results.php';

const SAFETY_VOTE_CONTRACT_VERSION = '2026-10-08-safety-vote-phase0-r1';
const SAFETY_VOTE_VISIBILITY_CONTRACT_VERSION = '2026-10-24-company-wide-campaign-visibility-r1';
const SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE = 'public_listing';
const SAFETY_VOTE_CAMPAIGN_TYPES = ['popular_vote','secret_election','survey','poll','feedback','nomination','award','submission_challenge','jury_scoring','hybrid_scoring','ranking','prioritization','allocation','resolution','petition','event_choice','risk_perception','knowledge_check','multi_stage'];
const SAFETY_VOTE_PRIVACY_MODES = ['identified','confidential','anonymous','secret_ballot'];
const SAFETY_VOTE_RESULT_VISIBILITY = ['live','admin_only','hidden_until_close','certified_only','published'];
const SAFETY_VOTE_RULE_ATTRIBUTES = ['all','employee_id','department_id','safety_unit_id','position_id','role','team'];
const SAFETY_VOTE_RULE_OPERATORS = ['EQUALS','NOT_EQUALS','IN','NOT_IN','IS_EMPTY','IS_NOT_EMPTY'];
const SAFETY_VOTE_RULE_EFFECTS = ['include','exclude'];
const SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MIN = 1;
const SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MAX = 100;

function sv_clean($value, int $max=255): string { $value=preg_replace('/[\x00-\x1F\x7F]/u',' ',(string)($value??''));$value=preg_replace('/\s+/u',' ',trim((string)$value));return mb_substr((string)$value,0,$max); }
function sv_positive_int($value): ?int { $number=filter_var($value,FILTER_VALIDATE_INT);return $number!==false&&$number>0?(int)$number:null; }
function sv_code($value): ?string { $code=strtoupper(sv_clean($value,40));$code=preg_replace('/[^A-Z0-9_-]/','-',$code);$code=preg_replace('/-+/','-',(string)$code);$code=trim((string)$code,'-');return $code!==''?$code:null; }
function sv_campaign_code(int $sequence,?int $year=null): ?string {$year=$year??(int)date('Y');if($sequence<1||$sequence>999||$year<2000||$year>9999)return null;return sprintf('SHE-%03d-%04d',$sequence,$year);}
function sv_campaign_visibility_contract(array $input=[],bool $enabled=false): array {
    $requested=sv_clean($input['discoveryMode']??$input['DiscoveryMode']??'eligible_only',24);
    return[
        'contractVersion'=>SAFETY_VOTE_VISIBILITY_CONTRACT_VERSION,
        'enabled'=>$enabled,
        'catalogAudience'=>'company_authenticated',
        'detailAudience'=>'company_authenticated',
        'participationAudience'=>'eligible_only',
        'resultsAudience'=>'company_authenticated_after_publish',
        'storageDiscoveryMode'=>$enabled?SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE:($requested===SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE?SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE:'eligible_only'),
        'publishedLifecycleStatuses'=>['Scheduled','Open','Closed','Certified','Published'],
        'excludedLifecycleStatuses'=>['Draft','Voided'],
        'excludedFlags'=>['IsHidden','IsTest'],
        'viewDoesNotGrantParticipation'=>true,
        'existingCampaignsPreserved'=>true,
    ];
}
function sv_apply_campaign_visibility_contract(array $input): array {
    $contract=$GLOBALS['safety_vote_visibility_contract']??null;
    if(is_array($contract)&&!empty($contract['enabled']))$input['discoveryMode']=SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE;
    return $input;
}
function sv_company_wide_catalog_enabled(): bool {
    $contract=$GLOBALS['safety_vote_visibility_contract']??null;
    return is_array($contract)&&!empty($contract['enabled']);
}
function sv_campaign_catalogue_access(array $campaign,bool $eligible=false,bool $enabled=false): array {
    $status=sv_clean($campaign['Status']??$campaign['status']??'',24);
    $hidden=(int)($campaign['IsHidden']??$campaign['isHidden']??0)===1;
    $test=(int)($campaign['IsTest']??$campaign['isTest']??0)===1;
    $storedMode=sv_clean($campaign['DiscoveryMode']??$campaign['discoveryMode']??'eligible_only',24);
    $publishedLifecycle=in_array($status,['Scheduled','Open','Closed','Certified','Published'],true);
    $effectiveMode=$enabled?SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE:($storedMode===SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE?SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE:'eligible_only');
    $catalogueVisible=$publishedLifecycle&&!$hidden&&!$test&&($eligible||$effectiveMode===SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE);
    return[
        'catalogueVisible'=>$catalogueVisible,
        'detailVisible'=>$catalogueVisible,
        'participationAllowed'=>$catalogueVisible&&$eligible,
        'readOnlyDetail'=>$catalogueVisible&&!$eligible,
        'accessMode'=>$catalogueVisible?($eligible?'eligible_participant':'company_catalogue_read_only'):'hidden',
        'effectiveDiscoveryMode'=>$effectiveMode,
        'reasonCode'=>!$publishedLifecycle?'LIFECYCLE_NOT_PUBLISHED':($hidden?'CAMPAIGN_HIDDEN':($test?'CAMPAIGN_TEST':(!$eligible&&$effectiveMode!==SAFETY_VOTE_COMPANY_WIDE_DISCOVERY_MODE?'LEGACY_ELIGIBILITY_ONLY':(!$eligible?'NOT_ELIGIBLE_READ_ONLY':'ELIGIBLE')))),
    ];
}
function sv_campaign(array $input,bool $requireCode=true): array {
    $input=sv_apply_campaign_visibility_contract($input);
    $type=strtolower(sv_clean($input['campaignType']??$input['CampaignType']??'popular_vote',40));$privacy=strtolower(sv_clean($input['privacyMode']??$input['PrivacyMode']??'identified',24));$visibility=strtolower(sv_clean($input['resultVisibility']??$input['ResultVisibility']??'hidden_until_close',24));$title=sv_clean($input['titleTh']??$input['TitleTh']??'',200);$code=sv_code($input['campaignCode']??$input['CampaignCode']??'');$officialTopNRaw=$input['officialResultTopN']??$input['OfficialResultTopN']??$input['liveLeaderboardTopN']??$input['LiveLeaderboardTopN']??5;$officialTopN=filter_var($officialTopNRaw,FILTER_VALIDATE_INT);$resultReleasePolicy=strtolower(sv_clean($input['resultReleasePolicy']??$input['ResultReleasePolicy']??'automatic',24));$errors=[];
    if($requireCode&&$code===null)$errors[]=['field'=>'campaignCode','code'=>'REQUIRED'];if($title==='')$errors[]=['field'=>'titleTh','code'=>'REQUIRED'];if(!in_array($type,SAFETY_VOTE_CAMPAIGN_TYPES,true))$errors[]=['field'=>'campaignType','code'=>'INVALID_ENUM'];if(!in_array($privacy,SAFETY_VOTE_PRIVACY_MODES,true))$errors[]=['field'=>'privacyMode','code'=>'INVALID_ENUM'];if(!in_array($visibility,SAFETY_VOTE_RESULT_VISIBILITY,true))$errors[]=['field'=>'resultVisibility','code'=>'INVALID_ENUM'];if($officialTopN===false||$officialTopN<SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MIN||$officialTopN>SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MAX)$errors[]=['field'=>'officialResultTopN','code'=>'INVALID_RANGE'];if(!in_array($resultReleasePolicy,['manual','automatic'],true))$errors[]=['field'=>'resultReleasePolicy','code'=>'INVALID_ENUM'];if($privacy==='secret_ballot'&&$visibility==='live')$errors[]=['field'=>'resultVisibility','code'=>'SECRET_LIVE_RESULT_FORBIDDEN'];
    $threshold=max(2,min(100,(int)($input['privacyThreshold']??$input['PrivacyThreshold']??5)));$live=svlr_config($input,$threshold);$errors=array_merge($errors,$live['errors']);$maxAttempts=(int)($input['maxParticipationAttempts']??$input['MaxParticipationAttempts']??1);if($maxAttempts<1||$maxAttempts>10)$errors[]=['field'=>'maxParticipationAttempts','code'=>'INVALID_RANGE'];if($privacy==='secret_ballot'&&$maxAttempts!==1)$errors[]=['field'=>'maxParticipationAttempts','code'=>'SECRET_BALLOT_SINGLE_ATTEMPT_REQUIRED'];if($live['value']['enabled']&&$type!=='popular_vote')$errors[]=['field'=>'liveLeaderboardEnabled','code'=>'UNSUPPORTED_CAMPAIGN_TYPE'];if($live['value']['enabled']&&$privacy==='secret_ballot')$errors[]=['field'=>'liveLeaderboardEnabled','code'=>'SECRET_LIVE_RESULT_FORBIDDEN'];
    return['ok'=>count($errors)===0,'errors'=>$errors,'value'=>['campaignCode'=>$code,'titleTh'=>$title,'titleEn'=>sv_clean($input['titleEn']??$input['TitleEn']??'',200)?:null,'summary'=>sv_clean($input['summary']??$input['Summary']??'',500)?:null,'description'=>sv_clean($input['description']??$input['Description']??'',12000)?:null,'rulesText'=>sv_clean($input['rulesText']??$input['RulesText']??'',12000)?:null,'templateKey'=>strtolower(sv_clean($input['templateKey']??$input['TemplateKey']??'blank',50)),'campaignType'=>$type,'privacyMode'=>$privacy,'resultVisibility'=>$visibility,'officialResultTopN'=>$officialTopN!==false&&$officialTopN>=SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MIN&&$officialTopN<=SAFETY_VOTE_OFFICIAL_RESULT_TOP_N_MAX?$officialTopN:5,'resultReleasePolicy'=>in_array($resultReleasePolicy,['manual','automatic'],true)?$resultReleasePolicy:'automatic','discoveryMode'=>sv_clean($input['discoveryMode']??$input['DiscoveryMode']??'',24)==='public_listing'?'public_listing':'eligible_only','openAt'=>sv_clean($input['openAt']??$input['OpenAt']??'',32)?:null,'closeAt'=>sv_clean($input['closeAt']??$input['CloseAt']??'',32)?:null,'privacyThreshold'=>$threshold,'maxParticipationAttempts'=>max(1,min(10,$maxAttempts)),'liveLeaderboardEnabled'=>$live['value']['enabled'],'liveLeaderboardTopN'=>$live['value']['topN'],'liveLeaderboardScoreMode'=>$live['value']['scoreMode'],'liveLeaderboardVisibility'=>$live['value']['visibility'],'liveLeaderboardRefreshSeconds'=>$live['value']['refreshSeconds'],'liveLeaderboardPrivacyThreshold'=>$live['value']['privacyThreshold']]];
}
function sv_rule(array $input,int $index=0): array { $effect=strtolower(sv_clean($input['effect']??$input['Effect']??'',12));$attribute=strtolower(sv_clean($input['attributeKey']??$input['AttributeKey']??'',40));$operator=strtoupper(sv_clean($input['operator']??$input['Operator']??'',20));$raw=is_array($input['values']??null)?$input['values']:(is_array($input['Values']??null)?$input['Values']:[]);$values=array_slice(array_values(array_unique(array_values(array_filter(array_map(fn($v)=>sv_clean($v,160),$raw),fn($v)=>$v!=='')))),0,500);$errors=[];if(!in_array($effect,SAFETY_VOTE_RULE_EFFECTS,true))$errors[]='INVALID_EFFECT';if(!in_array($attribute,SAFETY_VOTE_RULE_ATTRIBUTES,true))$errors[]='INVALID_ATTRIBUTE';if(!in_array($operator,SAFETY_VOTE_RULE_OPERATORS,true))$errors[]='INVALID_OPERATOR';if(!in_array($operator,['IS_EMPTY','IS_NOT_EMPTY'],true)&&$attribute!=='all'&&!$values)$errors[]='VALUES_REQUIRED';if($attribute==='all'&&!in_array($operator,['EQUALS','IN'],true))$errors[]='INVALID_ALL_OPERATOR';return['ok'=>!$errors,'errors'=>$errors,'value'=>['ruleGroup'=>sv_positive_int($input['ruleGroup']??null)??1,'ruleOrder'=>sv_positive_int($input['ruleOrder']??null)??$index+1,'effect'=>$effect,'attributeKey'=>$attribute,'operator'=>$operator,'values'=>$values,'reason'=>sv_clean($input['reason']??$input['Reason']??'',255)?:null]]; }
function sv_rules($input): array { if(!is_array($input)||count($input)>100)return['ok'=>false,'errors'=>[['index'=>-1,'codes'=>['RULE_ARRAY_REQUIRED']]],'rules'=>[]];$parsed=[];foreach(array_values($input)as$i=>$row)$parsed[]=sv_rule(is_array($row)?$row:[],$i);$errors=[];foreach($parsed as$i=>$row)if(!$row['ok'])$errors[]=['index'=>$i,'codes'=>$row['errors']];return['ok'=>!$errors,'errors'=>$errors,'rules'=>array_map(fn($row)=>$row['value'],$parsed)]; }
function sv_scalar_key($value): string { return mb_strtolower(sv_clean($value,160),'UTF-8'); }
function sv_rule_matches(array $rule,array $employee): bool { if($rule['attributeKey']==='all')return true;$map=['employee_id'=>$employee['employeeId']??null,'department_id'=>$employee['departmentId']??null,'safety_unit_id'=>$employee['safetyUnitId']??null,'position_id'=>$employee['positionId']??null,'role'=>$employee['role']??null,'team'=>$employee['team']??null];$actual=sv_scalar_key($map[$rule['attributeKey']]??'');$expected=array_map('sv_scalar_key',$rule['values']);if($rule['operator']==='IS_EMPTY')return$actual==='';if($rule['operator']==='IS_NOT_EMPTY')return$actual!=='';$contains=in_array($actual,$expected,true);return in_array($rule['operator'],['EQUALS','IN'],true)?$contains:!$contains; }
function sv_evaluate(array $rules,array $employees): array { $includes=array_values(array_filter($rules,fn($r)=>$r['effect']==='include'));$excludes=array_values(array_filter($rules,fn($r)=>$r['effect']==='exclude'));$out=[];foreach($employees as$employee){$matched=array_values(array_filter($includes,fn($r)=>sv_rule_matches($r,$employee)));if(!$matched||array_filter($excludes,fn($r)=>sv_rule_matches($r,$employee)))continue;$reasons=array_map(fn($r)=>$r['reason']?:$r['attributeKey'].':'.$r['operator'],$matched);$employee['inclusionSource']='rule';$employee['inclusionReason']=mb_substr(implode('; ',$reasons),0,255);$out[]=$employee;}return$out; }
function sv_sort_recursive($value){if(!is_array($value))return$value;if(array_keys($value)!==range(0,count($value)-1))ksort($value);foreach($value as$key=>$item)$value[$key]=sv_sort_recursive($item);return$value;}
function sv_hash($value): string { return hash('sha256',json_encode(sv_sort_recursive($value),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)); }
