<?php
declare(strict_types=1);

const SV_WORK_ITEMS_CONTRACT = '2026-10-25-jury-work-items-r1';
const SV_WORK_SOURCES = ['admin_curated','employee_submission','imported'];

function svwi_text($value,int $max):string{return mb_substr(trim((string)preg_replace('/[\x00-\x1F\x7F]/u',' ',(string)($value??''))),0,$max);}
function svwi_id($value):?int{$number=(int)$value;return$number>0?$number:null;}
function svwi_parse(array$input):array{$source=strtolower(trim((string)($input['workSource']??'')));$rows=is_array($input['works']??null)?$input['works']:[];$errors=[];$works=[];$seen=[];if(!in_array($source,SV_WORK_SOURCES,true))$errors[]='WORK_SOURCE_INVALID';if(count($rows)>100)$errors[]='WORK_LIMIT_EXCEEDED';foreach(array_values($rows)as$index=>$raw){$raw=is_array($raw)?$raw:[];$code=strtoupper(svwi_text($raw['workCode']??('WORK-'.($index+1)),50));$title=svwi_text($raw['title']??'',255);$description=svwi_text($raw['description']??'',2000);$sourceCandidateId=svwi_id($raw['sourceCandidateId']??null);if($code===''||isset($seen[$code]))$errors[]='WORK_CODE_DUPLICATE_OR_EMPTY';if($title==='')$errors[]='WORK_TITLE_REQUIRED';if($source==='imported'&&!$sourceCandidateId)$errors[]='SOURCE_CANDIDATE_REQUIRED';$seen[$code]=true;$works[]=['id'=>svwi_id($raw['id']??null),'workCode'=>$code,'title'=>$title,'description'=>$description!==''?$description:null,'sourceCandidateId'=>$sourceCandidateId,'sortOrder'=>$index+1];}if($source==='admin_curated'&&!$works)$errors[]='WORK_REQUIRED';return['ok'=>!$errors,'source'=>$source,'works'=>$works,'errors'=>array_values(array_unique($errors))];}
