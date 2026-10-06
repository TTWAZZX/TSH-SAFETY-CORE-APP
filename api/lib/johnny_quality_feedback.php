<?php
declare(strict_types=1);

const JOHNNY_ANSWER_FEEDBACK_CONTRACT = __DIR__ . '/../../shared/johnny-answer-feedback.json';

function johnny_feedback_contract(): array
{
    static $contract = null;
    if (is_array($contract)) return $contract;
    $raw = @file_get_contents(JOHNNY_ANSWER_FEEDBACK_CONTRACT);
    $parsed = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($parsed) || !is_array($parsed['ratings'] ?? null) || !is_array($parsed['negativeReasons'] ?? null)) {
        throw new RuntimeException('Johnny answer feedback contract is invalid');
    }
    $contract = $parsed;
    return $contract;
}

function johnny_normalize_feedback(array $input): array
{
    $contract = johnny_feedback_contract();
    $rating = strtolower(trim((string) ($input['rating'] ?? '')));
    if (!in_array($rating, $contract['ratings'], true)) {
        throw new InvalidArgumentException('Invalid Johnny answer feedback rating');
    }
    $allowedReasons = array_map(static fn($item) => (string) ($item['code'] ?? ''), $contract['negativeReasons']);
    $requestedReason = strtolower(trim((string) ($input['reasonCode'] ?? '')));
    $reasonCode = $rating === 'not_helpful'
        ? (in_array($requestedReason, $allowedReasons, true) ? $requestedReason : 'other')
        : null;
    return ['rating' => $rating, 'reasonCode' => $reasonCode, 'version' => $contract['version'] ?? 'unknown'];
}

function johnny_feedback_percent($part, $total): int
{
    $total = (int) $total;
    return $total > 0 ? (int) round(((int) $part / $total) * 100) : 0;
}

function johnny_release_health(array $input): array
{
    $contract = johnny_feedback_contract();
    $thresholds = $contract['releaseThresholds'] ?? [];
    $feedbackTotal = (int) ($input['feedbackTotal'] ?? 0);
    $assistantMessages = (int) ($input['assistantMessages'] ?? 0);
    $logTotal = (int) ($input['logTotal'] ?? 0);
    $rates = [
        'notHelpfulPercent' => johnny_feedback_percent($input['notHelpful'] ?? 0, $feedbackTotal),
        'unverifiedPercent' => johnny_feedback_percent($input['unverifiedAnswers'] ?? 0, $assistantMessages),
        'operationalErrorPercent' => johnny_feedback_percent($input['logErrors'] ?? 0, $logTotal),
    ];
    $blockers = [];
    $warnings = [];
    if ((int) ($input['unsafeFeedback'] ?? 0) > 0) $blockers[] = 'unsafe_feedback_requires_review';
    if ((int) ($input['errorsLastHour'] ?? 0) > 0) $blockers[] = 'recent_operational_errors';
    $minimumSamples = (int) ($thresholds['minimumFeedbackSamples'] ?? 10);
    if ($feedbackTotal >= $minimumSamples && $rates['notHelpfulPercent'] > (int) ($thresholds['maximumNotHelpfulRatePercent'] ?? 25)) {
        $warnings[] = 'not_helpful_rate_above_threshold';
    }
    if ($assistantMessages > 0 && $rates['unverifiedPercent'] > (int) ($thresholds['maximumUnverifiedRatePercent'] ?? 20)) {
        $warnings[] = 'unverified_rate_above_threshold';
    }
    if ($logTotal > 0 && $rates['operationalErrorPercent'] > (int) ($thresholds['maximumOperationalErrorRatePercent'] ?? 5)) {
        $warnings[] = 'operational_error_rate_above_threshold';
    }
    $feedbackSampleReady = $feedbackTotal >= $minimumSamples;
    $status = $blockers ? 'needs_review' : ($warnings ? 'watch' : ($feedbackSampleReady ? 'healthy' : 'insufficient_feedback'));
    return [
        'version' => $contract['version'] ?? 'unknown',
        'status' => $status,
        'feedbackSampleReady' => $feedbackSampleReady,
        'thresholds' => $thresholds,
        'rates' => $rates,
        'blockers' => $blockers,
        'warnings' => $warnings,
    ];
}
