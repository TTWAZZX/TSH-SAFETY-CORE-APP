<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase1.php';
require_once __DIR__.'/../lib/safety_vote_engagement.php';
$valid=sveng_promotion(['campaignId'=>7,'titleTh'=>'กิจกรรมเด่น','ctaLabel'=>'เข้าร่วม','priority'=>80,'startAt'=>'2026-10-10T01:00:00Z','endAt'=>'2026-10-17T01:00:00Z','status'=>'Published','altText'=>'ภาพกิจกรรม']);
if(!$valid['ok']||$valid['value']['priority']!==80||$valid['value']['status']!=='Published')throw new RuntimeException('Valid promotion normalization failed.');
$invalid=sveng_promotion(['campaignId'=>7,'titleTh'=>'กิจกรรมเด่น','ctaLabel'=>'เข้าร่วม','startAt'=>'2026-10-17T01:00:00Z','endAt'=>'2026-10-10T01:00:00Z','status'=>'Published']);
if($invalid['ok'])throw new RuntimeException('Invalid promotion timing was accepted.');
$missingAlt=sveng_promotion(['campaignId'=>7,'titleTh'=>'กิจกรรมเด่น','ctaLabel'=>'เข้าร่วม','desktopFileId'=>1,'startAt'=>'2026-10-10T01:00:00Z','endAt'=>'2026-10-17T01:00:00Z','status'=>'Draft']);
if($missingAlt['ok'])throw new RuntimeException('Image without alt text was accepted.');
echo "Safety Vote Engagement PHP contract: PASS (3 assertions)\n";
