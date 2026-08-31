<?php
declare(strict_types=1);

function bbs_phase1_levels(): array
{
    return ['Operator', 'Group Leader', 'Department Head', 'Section Head', 'Manager'];
}

function bbs_phase1_eligibility_values(): array
{
    return ['active', 'inactive', 'exempt', 'unavailable'];
}

function bbs_phase1_assignment_types(): array
{
    return ['permanent', 'temporary', 'acting'];
}

function bbs_phase1_normalize_level($value): ?string
{
    $text = strtolower(trim((string) $value));
    foreach (bbs_phase1_levels() as $level) {
        if (strtolower($level) === $text) return $level;
    }
    return null;
}

function bbs_phase1_level_rank($value): int
{
    $level = bbs_phase1_normalize_level($value);
    if ($level === null) return -1;
    return (int) array_search($level, bbs_phase1_levels(), true);
}

function bbs_phase1_iso_date($value, bool $required = false)
{
    $text = trim((string) $value);
    if ($text === '' && !$required) return null;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $text, new DateTimeZone('UTC'));
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0))) return false;
    return $date->format('Y-m-d') === $text ? $text : false;
}

function bbs_phase1_validate_range($fromValue, $toValue): array
{
    $from = bbs_phase1_iso_date($fromValue, true);
    $to = bbs_phase1_iso_date($toValue, false);
    if (!$from) return ['ok' => false, 'message' => 'EffectiveFrom must be a valid YYYY-MM-DD date.'];
    if ($to === false) return ['ok' => false, 'message' => 'EffectiveTo must be a valid YYYY-MM-DD date or blank.'];
    if ($to !== null && $to < $from) return ['ok' => false, 'message' => 'EffectiveTo must not be before EffectiveFrom.'];
    return ['ok' => true, 'from' => $from, 'to' => $to];
}

function bbs_phase1_validate_assignment(array $candidate): array
{
    $supervisorId = trim((string) ($candidate['supervisorEmployeeId'] ?? ''));
    $memberId = trim((string) ($candidate['memberEmployeeId'] ?? ''));
    $supervisorLevel = bbs_phase1_normalize_level($candidate['supervisorLevel'] ?? null);
    $memberLevel = bbs_phase1_normalize_level($candidate['memberLevel'] ?? null);
    $type = strtolower(trim((string) ($candidate['assignmentType'] ?? 'permanent')));
    $range = bbs_phase1_validate_range($candidate['effectiveFrom'] ?? null, $candidate['effectiveTo'] ?? null);
    if ($supervisorId === '' || $memberId === '') return ['ok' => false, 'message' => 'Supervisor and member are required.'];
    if (strcasecmp($supervisorId, $memberId) === 0) return ['ok' => false, 'message' => 'Supervisor and member must be different employees.'];
    if ($supervisorLevel === null || $memberLevel === null) return ['ok' => false, 'message' => 'Both employees require an active BBS level mapping.'];
    if (bbs_phase1_level_rank($supervisorLevel) !== bbs_phase1_level_rank($memberLevel) + 1) {
        return ['ok' => false, 'message' => 'Hierarchy assignments must connect adjacent BBS levels.'];
    }
    if (!in_array($type, bbs_phase1_assignment_types(), true)) return ['ok' => false, 'message' => 'AssignmentType is invalid.'];
    if (empty($range['ok'])) return $range;
    return array_merge($range, [
        'supervisorId' => $supervisorId,
        'memberId' => $memberId,
        'supervisorLevel' => $supervisorLevel,
        'memberLevel' => $memberLevel,
        'assignmentType' => $type,
    ]);
}

function bbs_phase1_weekdays($value): array
{
    $source = is_array($value) ? $value : explode(',', (string) $value);
    $days = [];
    foreach ($source as $item) {
        $day = (int) $item;
        if ($day >= 1 && $day <= 7) $days[$day] = true;
    }
    $result = array_keys($days);
    sort($result);
    return $result;
}

function bbs_phase1_kpi_due(array $rule, string $isoDate): bool
{
    if ((int) ($rule['IsActive'] ?? 1) !== 1 || bbs_phase1_iso_date($isoDate, true) === false) return false;
    $day = (int) (new DateTimeImmutable($isoDate, new DateTimeZone('UTC')))->format('N');
    return in_array($day, bbs_phase1_weekdays($rule['Weekdays'] ?? ''), true);
}
