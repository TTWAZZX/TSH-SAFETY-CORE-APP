<?php
declare(strict_types=1);

function svg_usage_total(array $usage):int{$total=0;foreach($usage as$key=>$value)if($key!=='files')$total+=(int)$value;return$total;}
function svg_capabilities(array$campaign,array$usage):array{
    $status=(string)($campaign['Status']??'');$hidden=(int)($campaign['IsHidden']??0)===1;$test=(int)($campaign['IsTest']??0)===1;$business=svg_usage_total($usage);$files=(int)($usage['files']??0);
    return['hide'=>in_array($status,['Draft','Scheduled','Open','Closed','Certified','Published'],true)&&!$hidden,'unhide'=>in_array($status,['Draft','Scheduled','Open','Closed','Certified','Published'],true)&&$hidden,'markTest'=>$status==='Draft'&&!$test&&$business===0,'unmarkTest'=>$status==='Draft'&&$test&&$business===0,'archive'=>in_array($status,['Closed','Certified','Published'],true),'restore'=>$status==='Archived'&&in_array((string)($campaign['ArchivedFromStatus']??''),['Closed','Certified','Published'],true),'void'=>in_array($status,['Draft','Scheduled','Open','Closed','Certified'],true),'purge'=>$status==='Voided'&&$test&&$business===0&&$files===0,'businessRows'=>$business,'files'=>$files];
}
