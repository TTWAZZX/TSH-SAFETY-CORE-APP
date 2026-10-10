<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase1.php';
require_once __DIR__.'/../lib/safety_vote_planning.php';
$saved=svpl_saved_view(['name'=>'เดือนนี้','isDefault'=>true,'filters'=>['month'=>'2026-10','status'=>['Open'],'unknown'=>'drop']]);
if(!$saved['ok']||isset($saved['value']['filters']['unknown']))throw new RuntimeException('Saved view normalization failed.');
$safe=svpl_safe_template(['version'=>['campaignType'=>'survey','titleTh'=>'ต้นแบบ'],'questions'=>[['title'=>'เลือก','options'=>[['label'=>'หนึ่ง','fileId'=>99,'media'=>[['url'=>'x']]]]]],'rules'=>[['attributeKey'=>'department','values'=>['Safety']],['attributeKey'=>'employee_id','values'=>['SV-USER']]]]);
if($safe['questions'][0]['options'][0]['fileId']!==null||count($safe['questions'][0]['options'][0]['media'])!==0||count($safe['rules'])!==1)throw new RuntimeException('Template exclusion failed.');
$quiet=svpl_notification_preview(['campaignId'=>1,'audience'=>'eligible','channel'=>'email','title'=>'แจ้งเตือน','message'=>'ข้อความ','scheduledAt'=>'2026-10-10T22:00']);
if(!$quiet['ok']||!$quiet['value']['quietHoursBlocked'])throw new RuntimeException('Quiet-hours validation failed.');
echo "Safety Vote Planning PHP contract: PASS (3 assertions)\n";
