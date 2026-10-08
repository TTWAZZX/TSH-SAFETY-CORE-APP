<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase5.php';
$x=json_decode(stream_get_contents(STDIN),true);
echo json_encode([
 'suppression'=>array_map(fn($v)=>sv5_suppress($v['value'],$v['threshold'],$v['privacyMode'],$v['dimension']??null),$x['suppression']),
 'funnel'=>sv5_funnel($x['funnel']),
 'schedules'=>array_map('sv5_schedule',$x['schedules']),
 'notificationKey'=>sv5_notification_key($x['notification']),
 'metadata'=>sv5_safe_metadata($x['metadata']),
 'report'=>sv5_report_model($x['report']),
 'retention'=>sv5_retention($x['retention']['rows'],$x['retention']['days'],$x['retention']['now']),
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
