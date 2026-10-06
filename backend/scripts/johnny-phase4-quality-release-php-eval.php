<?php
declare(strict_types=1);

require_once __DIR__ . '/../../api/lib/johnny_quality_feedback.php';

const JOHNNY_PHASE4_QUALITY_RELEASE_PHP = 'mock-only-no-db-no-network';
$results = [];
$check = static function (string $name, bool $pass, string $details = '') use (&$results): void {
    $results[] = ['name' => $name, 'pass' => $pass, 'details' => $details];
};

$contract = johnny_feedback_contract();
$check('contract version', ($contract['version'] ?? '') === '2026-10-06-phase4-r1');
$check('fixed ratings', ($contract['ratings'] ?? []) === ['helpful', 'not_helpful']);
$check('no message text', ($contract['privacy']['storesMessageText'] ?? null) === false);
$check('no free text', ($contract['privacy']['storesFreeText'] ?? null) === false);

$helpful = johnny_normalize_feedback(['rating' => 'HELPFUL', 'reasonCode' => 'unsafe']);
$negative = johnny_normalize_feedback(['rating' => 'not_helpful', 'reasonCode' => 'missing_source']);
$fallback = johnny_normalize_feedback(['rating' => 'not_helpful', 'reasonCode' => 'invented']);
$check('helpful clears reason', $helpful['rating'] === 'helpful' && $helpful['reasonCode'] === null);
$check('negative reason accepted', $negative['reasonCode'] === 'missing_source');
$check('unknown reason bounded', $fallback['reasonCode'] === 'other');
$invalidRejected = false;
try { johnny_normalize_feedback(['rating' => 'five_stars']); } catch (InvalidArgumentException $error) { $invalidRejected = true; }
$check('invalid rating rejected', $invalidRejected);

$scenarios = [
    ['insufficient feedback', [], 'insufficient_feedback'],
    ['healthy', ['feedbackTotal' => 10, 'notHelpful' => 1, 'assistantMessages' => 20, 'unverifiedAnswers' => 1, 'logTotal' => 100, 'logErrors' => 1], 'healthy'],
    ['not helpful watch', ['feedbackTotal' => 20, 'notHelpful' => 6], 'watch'],
    ['unverified watch', ['feedbackTotal' => 10, 'assistantMessages' => 10, 'unverifiedAnswers' => 3], 'watch'],
    ['error rate watch', ['feedbackTotal' => 10, 'logTotal' => 20, 'logErrors' => 2], 'watch'],
    ['unsafe review', ['feedbackTotal' => 10, 'unsafeFeedback' => 1], 'needs_review'],
    ['recent error review', ['feedbackTotal' => 10, 'errorsLastHour' => 1], 'needs_review'],
];
foreach ($scenarios as [$name, $input, $expected]) {
    $health = johnny_release_health($input);
    $check('release health: ' . $name, ($health['status'] ?? '') === $expected, json_encode($health));
}

$phpRoute = (string) file_get_contents(__DIR__ . '/../../api/handlers/johnny_ai.php');
$schemaMigration = (string) file_get_contents(__DIR__ . '/../migrations/20261006_johnny_phase7_schema.sql');
$workspace = (string) file_get_contents(__DIR__ . '/../../public/js/pages/johnny-ai.js');
$drawer = (string) file_get_contents(__DIR__ . '/../../public/js/johnny-drawer.js');
$contains = static function (string $haystack, string $needle): bool { return strpos($haystack, $needle) !== false; };
$check('PHP uses explicit feedback migration', $contains($schemaMigration, 'CREATE TABLE IF NOT EXISTS johnny_answer_feedback'));
$check('PHP enforces assistant ownership', $contains($phpRoute, "UserID=? AND Role='assistant'"));
$check('PHP has PUT feedback route', $contains($phpRoute, "'/johnny/messages/:id/feedback'"));
$check('PHP history exposes feedback', $contains($phpRoute, 'FeedbackRating') && $contains($phpRoute, 'FeedbackReasonCode'));
$check('PHP observability has release health', $contains($phpRoute, 'releaseHealth') && $contains($phpRoute, 'unsafeFeedback'));
$check('workspace feedback controls', $contains($workspace, 'data-johnny-phase4-feedback') && $contains($workspace, 'updateAnswerFeedback'));
$check('drawer feedback controls', $contains($drawer, 'data-johnny-phase4-feedback') && $contains($drawer, 'updateFeedback'));

$failures = array_values(array_filter($results, static fn($item) => !$item['pass']));
echo json_encode([
    'marker' => 'JOHNNY_PHASE4_QUALITY_FEEDBACK_RELEASE_READINESS_PHP',
    'mode' => JOHNNY_PHASE4_QUALITY_RELEASE_PHP,
    'checks' => count($results),
    'passed' => count($results) - count($failures),
    'failed' => count($failures),
    'failures' => $failures,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($failures ? 1 : 0);
