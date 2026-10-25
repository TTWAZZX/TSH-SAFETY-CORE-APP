<?php
declare(strict_types=1);

const SAFETY_VOTE_GALLERY_MAX_ITEMS = 12;

function svgallery_int($value): ?int { $number=(int)$value;return $number>0?$number:null; }
function svgallery_text($value,int$max): string { return mb_substr(trim((string)preg_replace('/[\x00-\x1F\x7F]/u',' ',(string)($value??''))),0,$max); }
function svgallery_metadata(array$input): array { $alt=svgallery_text($input['altText']??'',300);$caption=svgallery_text($input['caption']??'',500);return['ok'=>$alt!=='','value'=>['altText'=>$alt,'caption'=>$caption?:null],'errors'=>$alt?[]:['ALT_TEXT_REQUIRED']]; }
function svgallery_reorder($input): array { if(!is_array($input)||count($input)>SAFETY_VOTE_GALLERY_MAX_ITEMS)return['ok'=>false,'items'=>[],'errors'=>['GALLERY_ITEMS_INVALID']];$seen=[];$items=[];$errors=[];$covers=0;foreach(array_values($input)as$index=>$row){$row=is_array($row)?$row:[];$id=svgallery_int($row['id']??null);$meta=svgallery_metadata($row);if(!$id||isset($seen[$id]))$errors[]='GALLERY_ITEM_DUPLICATE_OR_INVALID';if(!$meta['ok'])$errors=array_merge($errors,$meta['errors']);if($id&&!isset($seen[$id])){$seen[$id]=true;$cover=($row['isCover']??false)===true;if($cover)$covers++;$items[]=array_merge(['id'=>$id],$meta['value'],['sortOrder'=>$index+1,'isCover'=>$cover]);}}if($covers>1)$errors[]='GALLERY_COVER_DUPLICATE';return['ok'=>count($errors)===0,'items'=>$items,'errors'=>array_values(array_unique($errors))]; }
