<?php
declare(strict_types=1);

function personal_target_number_or_null($value): ?float
{
    if ($value === null || $value === '') return null;
    return is_numeric($value) ? (float) $value : null;
}

function personal_target_admin_eligibility(array $activity, ?array $row): array
{
    if ($row === null) return ['eligible'=>false,'reason'=>'NO_ADMIN_CONFIGURATION'];
    if (array_key_exists('source', $row) && in_array($row['source'], ['none','missing'], true)) {
        return ['eligible'=>false,'reason'=>'NO_ADMIN_CONFIGURATION'];
    }
    if (!empty($row['IsNA'] ?? $row['isNA'] ?? 0)) {
        return ['eligible'=>false,'reason'=>'ADMIN_MARKED_N_A'];
    }
    $target = personal_target_number_or_null($row['YearlyTarget'] ?? $row['yearlyTarget'] ?? null);
    if (($activity['targetMode'] ?? '') !== 'system_denominator' && ($target === null || $target <= 0)) {
        return ['eligible'=>false,'reason'=>'NO_POSITIVE_EFFECTIVE_TARGET'];
    }
    return ['eligible'=>true,'reason'=>'ADMIN_CONFIGURED'];
}

function personal_target_mandatory_policy(array $policyState, int $year): array
{
    $available = ($policyState['available'] ?? true) !== false;
    $policy = is_array($policyState['policy'] ?? null) ? $policyState['policy'] : null;
    $acknowledged = !empty($policyState['acknowledged']);
    $base = [
        'activityKey'=>'policy_acknowledgement',
        'label'=>'Safety Policy Acknowledgement',
        'desc'=>'Acknowledge the current company safety policy.',
        'metricType'=>'binary',
        'scopeType'=>'employee',
        'unitLabel'=>'policy',
        'targetMode'=>'mandatory_policy',
        'passPct'=>100,
        'isNA'=>false,
        'source'=>'mandatory_policy',
        'targetYear'=>$year,
        'scope'=>$policy
            ? ['type'=>'current_policy','policyId'=>(string) ($policy['id'] ?? '')]
            : ['type'=>'current_policy'],
        'eligibilityType'=>'mandatory_baseline',
        'eligibilitySource'=>'current_policy',
        'isMandatory'=>true,
        'navigationHash'=>'policy',
        'calculationMethod'=>'current_policy_acknowledgement',
        'targetSource'=>'current_policy',
    ];
    if (!$available) {
        return array_merge($base, [
            'yearlyTarget'=>null,'actualCount'=>null,'completionPct'=>null,'passed'=>null,'noData'=>true,
            'availabilityStatus'=>'DATA_UNAVAILABLE',
            'statusReason'=>(string) ($policyState['error'] ?? 'Current policy acknowledgement could not be read.'),
        ]);
    }
    if ($policy === null) {
        return array_merge($base, [
            'yearlyTarget'=>null,'actualCount'=>null,'completionPct'=>null,'passed'=>null,'noData'=>true,
            'availabilityStatus'=>'NO_CURRENT_POLICY',
            'statusReason'=>'No current safety policy is configured.',
        ]);
    }
    return array_merge($base, [
        'yearlyTarget'=>1,
        'actualCount'=>$acknowledged ? 1 : 0,
        'completionPct'=>$acknowledged ? 100 : 0,
        'passed'=>$acknowledged,
        'noData'=>false,
        'availabilityStatus'=>'AVAILABLE',
        'statusReason'=>$acknowledged
            ? 'Current safety policy acknowledged.'
            : 'Current safety policy acknowledgement is required.',
        'policyTitle'=>(string) ($policy['title'] ?? ''),
    ]);
}
