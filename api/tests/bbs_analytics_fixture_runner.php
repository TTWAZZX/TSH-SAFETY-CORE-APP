<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/bbs_phase1.php';
require_once __DIR__.'/../handlers/bbs_analytics.php';
$fixture=json_decode((string)stream_get_contents(STDIN),true)?:[];
$range=bbs_analytics_range((int)$fixture['year'],(int)$fixture['month'],(string)($fixture['today']??''));
echo json_encode([
    'risks'=>array_map('bbs_analytics_risk',$fixture['risks']??[]),
    'percentages'=>array_map(static fn($row)=>bbs_analytics_pct($row[0],$row[1]),$fixture['percentages']??[]),
    'range'=>$range,
    'dates'=>bbs_analytics_required_dates($range,(string)($fixture['weekdays']??'')),
    'aging'=>array_map('bbs_analytics_aging',$fixture['ages']??[]),
],JSON_UNESCAPED_SLASHES);
