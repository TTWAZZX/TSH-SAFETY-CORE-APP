<?php
declare(strict_types=1);

const SAFETY_VOTE_ENGAGEMENT_CONTRACT='2026-10-10-safety-vote-ux-phase9a-r1';

function sveng_date($value):?string{$raw=trim((string)($value??''));if($raw==='')return null;try{return(new DateTimeImmutable($raw))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');}catch(Throwable$error){return null;}}
function sveng_promotion(array$input):array{
 $status=sv_clean($input['status']??$input['Status']??'Draft',24);$start=sveng_date($input['startAt']??$input['StartAt']??null);$end=sveng_date($input['endAt']??$input['EndAt']??null);
 $value=['campaignId'=>sv_positive_int($input['campaignId']??$input['CampaignID']??null),'titleTh'=>sv_clean($input['titleTh']??$input['TitleTh']??'',160),'subtitleTh'=>sv_clean($input['subtitleTh']??$input['SubtitleTh']??'',500)?:null,'ctaLabel'=>sv_clean($input['ctaLabel']??$input['CtaLabel']??'ดูรายละเอียด',40),'desktopFileId'=>sv_positive_int($input['desktopFileId']??$input['DesktopFileID']??null),'mobileFileId'=>sv_positive_int($input['mobileFileId']??$input['MobileFileID']??null),'altText'=>sv_clean($input['altText']??$input['AltText']??'',240)?:null,'priority'=>max(0,min(100,(int)($input['priority']??$input['Priority']??0))),'startAt'=>$start,'endAt'=>$end,'status'=>$status,'rowVersion'=>sv_positive_int($input['rowVersion']??$input['RowVersion']??null)];$errors=[];
 if(!$value['campaignId'])$errors[]=['field'=>'campaignId','code'=>'REQUIRED'];if($value['titleTh']==='')$errors[]=['field'=>'titleTh','code'=>'REQUIRED'];if($value['ctaLabel']==='')$errors[]=['field'=>'ctaLabel','code'=>'REQUIRED'];if(!$start)$errors[]=['field'=>'startAt','code'=>'INVALID_DATE'];if(!$end)$errors[]=['field'=>'endAt','code'=>'INVALID_DATE'];if($start&&$end&&$end<=$start)$errors[]=['field'=>'endAt','code'=>'MUST_FOLLOW_START'];if(!in_array($status,['Draft','Published','Archived'],true))$errors[]=['field'=>'status','code'=>'INVALID_ENUM'];if(($value['desktopFileId']||$value['mobileFileId'])&&!$value['altText'])$errors[]=['field'=>'altText','code'=>'REQUIRED_WITH_IMAGE'];return['ok'=>!$errors,'errors'=>$errors,'value'=>$value];
}
