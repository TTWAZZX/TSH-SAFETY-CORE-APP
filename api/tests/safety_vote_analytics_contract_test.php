<?php
declare(strict_types=1);

require_once __DIR__.'/../lib/safety_vote_analytics.php';

$checks = 0;
$assert = static function (bool $condition, string $message) use (&$checks): void {
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    $checks++;
};

$hidden = sva_metric(4, 5);
$visible = sva_metric(5, 5, 10);
$assert($hidden['value'] === null && $hidden['reason'] === 'PRIVACY_THRESHOLD', 'low count must be suppressed');
$assert($visible['value'] === 5 && $visible['percentage'] === 50.0, 'threshold count and rate must be visible');
$assert(sva_event_type('CTA_CLICK') === 'cta_click' && sva_event_type('identity') === null, 'event allowlist');
$assert(sva_queue_audit('queued=12; suppressed=7') === ['queued' => 12, 'suppressed' => 7], 'bounded queue audit parser');

$campaign = sva_campaign_metric([
    'id' => 1, 'campaignCode' => 'SHE-001-2026', 'title' => 'Fixture', 'status' => 'Open',
    'campaignType' => 'survey', 'privacyMode' => 'identified', 'privacyThreshold' => 5,
    'eligible' => 20, 'started' => 8, 'submitted' => 6, 'reach' => 9,
    'notificationReads' => 4, 'impressions' => 10, 'ctaClicks' => 2,
]);
$assert($campaign['conversion']['percentage'] === 30.0, 'conversion uses eligible denominator');
$assert($campaign['notificationReads']['value'] === null && $campaign['ctaClicks']['value'] === null, 'all low dimensions suppressed');

$conflicts = sva_conflicts([
    ['campaignId' => 1, 'campaignCode' => 'SHE-001-2026', 'channel' => 'email', 'scheduledAt' => '2026-10-10 10:00:00'],
    ['campaignId' => 2, 'campaignCode' => 'SHE-002-2026', 'channel' => 'email', 'scheduledAt' => '2026-10-10 10:05:00'],
    ['campaignId' => 1, 'campaignCode' => 'SHE-001-2026', 'channel' => 'email', 'scheduledAt' => '2026-10-10 10:20:00'],
    ['campaignId' => 2, 'campaignCode' => 'SHE-002-2026', 'channel' => 'email', 'scheduledAt' => '2026-10-10 10:25:00'],
]);
$assert(count($conflicts) === 2 && $conflicts[0]['windowMinutes'] === 30, 'interleaved schedule conflicts remain campaign/channel scoped');
$recommendations = sva_recommendations([$campaign], [], $conflicts);
$assert(count($recommendations) >= 2, 'deterministic recommendations');
$csv = sva_csv(['campaigns' => [$campaign]]);
$assert(str_contains($csv, 'SUPPRESSED') && !str_contains($csv, 'EmployeeID'), 'aggregate CSV suppresses low counts and identities');

echo "Safety Vote UX Phase 9C PHP analytics contract: PASS ({$checks} assertions)\n";
