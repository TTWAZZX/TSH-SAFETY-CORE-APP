<?php
declare(strict_types=1);

function dashboard_metric_contract(): array
{
    static $contract = null;
    if (is_array($contract)) return $contract;

    $path = dirname(__DIR__, 2) . '/config/dashboard-module-health-contract.json';
    $raw = @file_get_contents($path);
    $decoded = $raw === false ? null : json_decode($raw, true);
    if (!is_array($decoded) || !isset($decoded['modules'], $decoded['percentageRules'])) {
        throw new RuntimeException('Dashboard metric contract is missing or invalid.');
    }
    $contract = $decoded;
    return $contract;
}

function dashboard_metric_module(string $key): array
{
    foreach (dashboard_metric_contract()['modules'] as $module) {
        if (($module['key'] ?? null) === $key) return $module;
    }
    throw new InvalidArgumentException('Unknown Dashboard metric key: ' . $key);
}

function dashboard_metric_number($value): ?float
{
    if ($value === null || $value === '') return null;
    return is_numeric($value) ? (float) $value : null;
}

function dashboard_metric_create(string $key, array $options = []): array
{
    $contract = dashboard_metric_contract();
    $module = dashboard_metric_module($key);
    $metricType = (string) ($module['metricType'] ?? '');
    $asOf = (string) ($options['asOf'] ?? gmdate('c'));
    $source = [
        'tables' => array_values($module['target']['sourceTables'] ?? []),
        'description' => (string) ($options['sourceDescription']
            ?? $module['target']['formula']
            ?? $module['target']['numerator']
            ?? ''),
    ];

    if (($options['dataAvailable'] ?? true) === false) {
        return [
            'key' => $key,
            'metricType' => $metricType,
            'numerator' => null,
            'denominator' => null,
            'percent' => null,
            'value' => null,
            'unit' => $options['unit'] ?? null,
            'source' => $source,
            'scope' => $options['scope'] ?? [],
            'dataAvailable' => false,
            'status' => 'DATA_UNAVAILABLE',
            'statusReason' => (string) ($options['unavailableReason']
                ?? 'One or more configured source queries could not be read.'),
            'asOf' => $asOf,
        ];
    }

    $numerator = dashboard_metric_number($options['numerator'] ?? null);
    $value = dashboard_metric_number($options['value'] ?? ($options['numerator'] ?? null));
    $metric = [
        'key' => $key,
        'metricType' => $metricType,
        'numerator' => $numerator,
        'denominator' => null,
        'percent' => null,
        'value' => $value,
        'unit' => $options['unit'] ?? null,
        'source' => $source,
        'scope' => $options['scope'] ?? [],
        'dataAvailable' => true,
        'status' => 'N_A',
        'statusReason' => (string) ($options['statusReason']
            ?? 'This metric has no evaluable health rule.'),
        'asOf' => $asOf,
    ];

    if ($metricType !== 'progress') {
        $statuses = $contract['statuses'] ?? [];
        $status = $options['status'] ?? null;
        if (is_string($status) && in_array($status, $statuses, true)) {
            $metric['status'] = $status;
            $metric['statusReason'] = (string) ($options['statusReason'] ?? $metric['statusReason']);
        }
        return $metric;
    }

    $denominator = dashboard_metric_number($options['denominator'] ?? null);
    $metric['denominator'] = $denominator;
    if ($denominator === null || $denominator <= 0) {
        $metric['numerator'] = $numerator ?? 0.0;
        $metric['value'] = $value ?? $metric['numerator'];
        $metric['statusReason'] = (string) ($options['zeroDenominatorReason']
            ?? 'No applicable denominator is configured for this scope.');
        return $metric;
    }

    $safeNumerator = max(0.0, $numerator ?? 0.0);
    $cappedNumerator = min($safeNumerator, $denominator);
    $metric['numerator'] = $safeNumerator;
    $metric['value'] = $value ?? $safeNumerator;
    $metric['percent'] = max(0, min(100, (int) round($cappedNumerator / $denominator * 100)));

    $defaultThresholds = $contract['percentageRules']['defaultThresholds'] ?? [];
    $onTrack = dashboard_metric_number($options['thresholds']['onTrackMinimum'] ?? null)
        ?? (float) ($defaultThresholds['onTrackMinimum'] ?? 80);
    $watch = dashboard_metric_number($options['thresholds']['watchMinimum'] ?? null)
        ?? (float) ($defaultThresholds['watchMinimum'] ?? 50);
    $metric['status'] = $metric['percent'] >= $onTrack
        ? 'ON_TRACK'
        : ($metric['percent'] >= $watch ? 'WATCH' : 'CRITICAL');
    $metric['statusReason'] = (string) ($options['statusReason']
        ?? sprintf('%d%% against %g%% On Track and %g%% Watch thresholds.', $metric['percent'], $onTrack, $watch));
    return $metric;
}
