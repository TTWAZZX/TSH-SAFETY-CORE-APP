<?php
declare(strict_types=1);

function bbs_observation_clean($value, int $max = 4000): string
{
    return mb_substr(trim((string) ($value ?? '')), 0, $max);
}

function bbs_observation_normalize_answers($value): array
{
    if (!is_array($value)) return ['ok' => false, 'message' => 'answers must be an array.'];
    $seen = []; $answers = [];
    foreach ($value as $entry) {
        $answerId = bbs_phase1_positive_int($entry['answerId'] ?? null);
        $response = $entry['response'] ?? null;
        if ($response === '') $response = null;
        if (!$answerId || isset($seen[$answerId])) return ['ok' => false, 'message' => 'Each answer must have a unique valid answerId.'];
        if ($response !== null && !in_array($response, ['Safe', 'Unsafe', 'N/A'], true)) return ['ok' => false, 'message' => 'Unsupported response for answer ' . $answerId . '.'];
        $seen[$answerId] = true;
        $answers[] = ['answerId' => $answerId, 'response' => $response, 'remark' => bbs_observation_clean($entry['remark'] ?? ''), 'immediateAction' => bbs_observation_clean($entry['immediateAction'] ?? '')];
    }
    return ['ok' => true, 'answers' => $answers];
}

function bbs_observation_validate_submission(array $rows): array
{
    foreach ($rows as $row) {
        $response = $row['Response'] ?? null; $code = (string) ($row['ItemCodeSnapshot'] ?? 'item');
        if ((int) ($row['IsRequiredSnapshot'] ?? 0) === 1 && !in_array($response, ['Safe', 'Unsafe', 'N/A'], true)) return ['ok' => false, 'code' => 'ANSWER_REQUIRED', 'message' => 'Please answer ' . $code . '.'];
        if ($response === 'Unsafe' && (int) ($row['UnsafeRequiresRemarkSnapshot'] ?? 0) === 1 && bbs_observation_clean($row['Remark'] ?? '') === '') return ['ok' => false, 'code' => 'UNSAFE_REMARK_REQUIRED', 'message' => 'Unsafe item ' . $code . ' requires a remark.'];
        if ($response === 'Unsafe' && (int) ($row['UnsafeRequiresActionSnapshot'] ?? 0) === 1 && bbs_observation_clean($row['ImmediateAction'] ?? '') === '') return ['ok' => false, 'code' => 'UNSAFE_ACTION_REQUIRED', 'message' => 'Unsafe item ' . $code . ' requires an immediate action.'];
        if ($response === 'Unsafe' && (int) ($row['UnsafeRequiresPhotoSnapshot'] ?? 0) === 1 && (int) ($row['EvidenceCount'] ?? 0) < 1) return ['ok' => false, 'code' => 'UNSAFE_PHOTO_REQUIRED', 'message' => 'Unsafe item ' . $code . ' requires evidence.'];
    }
    return ['ok' => true];
}

function bbs_observation_business_weekdays(int $year, int $month, ?int $throughDay): int
{
    $last = (int) (new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $month), new DateTimeZone('Asia/Bangkok')))->format('t');
    $end = $throughDay === null ? $last : max(0, min($last, $throughDay)); $count = 0;
    for ($day = 1; $day <= $end; $day++) {
        $weekday = (int) (new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $month, $day), new DateTimeZone('Asia/Bangkok')))->format('N');
        if ($weekday <= 5) $count++;
    }
    return $count;
}
