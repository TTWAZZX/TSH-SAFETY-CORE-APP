<?php
declare(strict_types=1);

const SVA_CONTRACT = '2026-10-10-safety-vote-ux-phase9c-r1';

function sva_int($value): int { return max(0, (int)$value); }
function sva_event_type($value): ?string { $type=strtolower(trim((string)$value)); return in_array($type,['impression','cta_click'],true)?$type:null; }
function sva_metric($value,$threshold,$base=null): array {
    $count=sva_int($value);$limit=max(2,sva_int($threshold)?:5);
    if($count<$limit)return['value'=>null,'visible'=>false,'suppressed'=>true,'reason'=>'PRIVACY_THRESHOLD','percentage'=>null];
    $denominator=$base===null?null:sva_int($base);$percentage=$denominator!==null&&$denominator>=$limit?round($count/$denominator*100,2):null;
    return['value'=>$count,'visible'=>true,'suppressed'=>false,'reason'=>null,'percentage'=>$percentage];
}
function sva_queue_audit($detail): array { return preg_match('/queued=(\d+)\s*;\s*suppressed=(\d+)/i',(string)$detail,$m)?['queued'=>sva_int($m[1]),'suppressed'=>sva_int($m[2])]:['queued'=>0,'suppressed'=>0]; }
function sva_campaign_metric(array$row): array {
    $threshold=max(2,sva_int($row['privacyThreshold']??5)?:5);$eligible=sva_int($row['eligible']??0);$started=sva_int($row['started']??0);$submitted=sva_int($row['submitted']??0);
    return['id'=>sva_int($row['id']??0),'campaignCode'=>(string)($row['campaignCode']??''),'title'=>(string)($row['title']??''),'status'=>(string)($row['status']??''),'campaignType'=>(string)($row['campaignType']??''),'privacyMode'=>(string)($row['privacyMode']??''),'privacyThreshold'=>$threshold,'eligible'=>sva_metric($eligible,$threshold),'started'=>sva_metric($started,$threshold,$eligible),'submitted'=>sva_metric($submitted,$threshold,$eligible),'conversion'=>sva_metric($submitted,$threshold,$eligible),'reach'=>sva_metric($row['reach']??0,$threshold),'notificationReads'=>sva_metric($row['notificationReads']??0,$threshold),'impressions'=>sva_metric($row['impressions']??0,$threshold),'ctaClicks'=>sva_metric($row['ctaClicks']??0,$threshold,$row['impressions']??0)];
}
function sva_conflicts(array$groups,int$minutes=30): array {
    $buckets=[];$out=[];foreach($groups as$row){$key=(int)$row['campaignId'].':'.(string)$row['channel'];$buckets[$key][]=$row;}
    foreach($buckets as$rows){usort($rows,fn($a,$b)=>strtotime((string)$a['scheduledAt'])<=>strtotime((string)$b['scheduledAt']));for($i=1;$i<count($rows);$i++){ $a=$rows[$i-1];$b=$rows[$i];$delta=strtotime((string)$b['scheduledAt'])-strtotime((string)$a['scheduledAt']);if($delta>=0&&$delta<=$minutes*60)$out[]=['campaignId'=>(int)$b['campaignId'],'campaignCode'=>(string)($b['campaignCode']??''),'channel'=>(string)$b['channel'],'firstAt'=>$a['scheduledAt'],'secondAt'=>$b['scheduledAt'],'windowMinutes'=>$minutes]; }}
    return array_slice($out,0,100);
}
function sva_recommendations(array$campaigns,array$deliveries,array$conflicts): array {
    $rows=[];foreach($campaigns as$item){$pct=$item['conversion']['percentage'];if($item['conversion']['visible']&&$pct<40)$rows[]=['key'=>'low-conversion','severity'=>'high','campaignId'=>$item['id'],'campaignCode'=>$item['campaignCode'],'title'=>'เพิ่มความชัดเจนของข้อความเชิญชวน','description'=>'อัตราการเข้าร่วมต่ำกว่า 40% ควรทบทวนหัวข้อ ปุ่ม CTA และช่วงเวลาสื่อสาร','action'=>'content'];elseif($item['conversion']['visible']&&$pct<70)$rows[]=['key'=>'conversion-opportunity','severity'=>'medium','campaignId'=>$item['id'],'campaignCode'=>$item['campaignCode'],'title'=>'ทดสอบข้อความประชาสัมพันธ์เพิ่มเติม','description'=>'อัตราการเข้าร่วมยังมีโอกาสเพิ่มขึ้น ควรเปรียบเทียบข้อความและช่วงเวลา','action'=>'content'];if($item['impressions']['visible']&&$item['ctaClicks']['visible']&&$item['ctaClicks']['percentage']<10)$rows[]=['key'=>'low-cta','severity'=>'medium','campaignId'=>$item['id'],'campaignCode'=>$item['campaignCode'],'title'=>'ปรับ CTA ของป้ายกิจกรรม','description'=>'อัตราคลิกต่ำกว่า 10% ควรทำให้ข้อความสั้น ชัดเจน และตรงกับกิจกรรม','action'=>'promotion'];}
    foreach($deliveries as$item)if($item['status']==='Failed'&&!empty($item['total']['visible'])){$rows[]=['key'=>'delivery-failures','severity'=>'high','campaignId'=>null,'campaignCode'=>'','title'=>'ตรวจสอบรายการส่งไม่สำเร็จ','description'=>'มีการส่งที่ไม่สำเร็จเหนือ privacy threshold ควรตรวจช่องทางและ error code ก่อน retry','action'=>'delivery'];break;}
    if(count($conflicts))$rows[]=['key'=>'schedule-conflict','severity'=>'medium','campaignId'=>null,'campaignCode'=>'','title'=>'แยกช่วงเวลาการแจ้งเตือน','description'=>'มีคิวช่องทางเดียวกันใกล้กันภายใน 30 นาที อาจทำให้ผู้รับได้รับข้อความถี่เกินไป','action'=>'schedule'];
    return array_slice($rows,0,50);
}
function sva_csv(array$model): string {
    $q=fn($value)=>'"'.str_replace('"','""',(string)($value??'')).'"';$rows=[['Campaign Code','Title','Status','Eligible','Started','Submitted','Conversion %','Reach','Impressions','CTA Clicks','CTA %']];
    foreach($model['campaigns']??[]as$row)$rows[]=[$row['campaignCode'],$row['title'],$row['status'],$row['eligible']['value']??'SUPPRESSED',$row['started']['value']??'SUPPRESSED',$row['submitted']['value']??'SUPPRESSED',$row['conversion']['percentage']??'SUPPRESSED',$row['reach']['value']??'SUPPRESSED',$row['impressions']['value']??'SUPPRESSED',$row['ctaClicks']['value']??'SUPPRESSED',$row['ctaClicks']['percentage']??'SUPPRESSED'];
    return"\xEF\xBB\xBF".implode("\r\n",array_map(fn($row)=>implode(',',array_map($q,$row)),$rows));
}
