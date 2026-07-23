<?php
declare(strict_types=1);

function yokoten_scope_normalize($value): string
{
    $text = preg_replace('/[\r\n]+/u', ' ', (string)($value ?? '')) ?? '';
    $text = preg_replace('/\s+/u', ' ', $text) ?? '';
    return mb_strtolower(trim($text), 'UTF-8');
}

function yokoten_scope_unit_name(array $unit): string
{
    return trim((string)($unit['name'] ?? $unit['Name'] ?? ''));
}

function yokoten_scope_unit_department(array $unit): string
{
    return trim((string)($unit['department'] ?? $unit['Department'] ?? $unit['DeptName'] ?? $unit['deptName'] ?? ''));
}

function yokoten_scope_unique_units(array $units): array
{
    $unique = [];
    foreach ($units as $unit) {
        $key = yokoten_scope_normalize(yokoten_scope_unit_department($unit))
            . '::' . yokoten_scope_normalize(yokoten_scope_unit_name($unit));
        $unique[$key] = $unit;
    }
    return array_values($unique);
}

function yokoten_scope_resolve_topic_units(array $topicUnits, array $masterUnits): array
{
    $requestedUnits = [];
    foreach ($topicUnits as $value) {
        $name = trim((string)$value);
        if ($name !== '') $requestedUnits[$name] = true;
    }
    $resolved = [];
    $unresolved = [];
    $aliases = [];

    foreach (array_keys($requestedUnits) as $requested) {
        $key = yokoten_scope_normalize($requested);
        $matches = array_values(array_filter($masterUnits, static function (array $unit) use ($key): bool {
            $aliases = [
                yokoten_scope_unit_name($unit),
                $unit['short_code'] ?? null,
                $unit['ShortCode'] ?? null,
                $unit['shortCode'] ?? null,
            ];
            foreach ($aliases as $alias) {
                if (yokoten_scope_normalize($alias) === $key) return true;
            }
            return false;
        }));
        if (!$matches) {
            $matches = array_values(array_filter($masterUnits, static function (array $unit) use ($key): bool {
                $nameKey = yokoten_scope_normalize(yokoten_scope_unit_name($unit));
                return str_starts_with($nameKey, $key . ' ') || str_starts_with($key, $nameKey . ' ');
            }));
        }
        $matches = yokoten_scope_unique_units($matches);
        if (count($matches) !== 1) {
            $unresolved[] = $requested;
            continue;
        }
        $unit = $matches[0];
        $canonical = yokoten_scope_unit_name($unit);
        if (yokoten_scope_normalize($canonical) !== $key) {
            $aliases[] = ['requested' => $requested, 'resolved' => $canonical];
        }
        $resolvedKey = yokoten_scope_normalize(yokoten_scope_unit_department($unit))
            . '::' . yokoten_scope_normalize($canonical);
        $resolved[$resolvedKey] = $unit;
    }

    return [
        'units' => array_values($resolved),
        'unresolved' => $unresolved,
        'aliases' => $aliases,
    ];
}

function yokoten_scope_parse_department_units($raw): ?array
{
    if ($raw === null || $raw === '') return null;
    $value = $raw;
    if (is_string($raw)) {
        $value = json_decode($raw, true);
    }
    if (!is_array($value)) return null;
    $keys = array_keys($value);
    $isList = $value === [] || $keys === range(0, count($value) - 1);
    if ($isList) return null;
    $result = [];
    foreach ($value as $department => $units) {
        $name = trim((string)$department);
        if ($name === '' || !is_array($units)) continue;
        $selected = [];
        foreach ($units as $unit) {
            $unitName = trim((string)$unit);
            if ($unitName !== '') $selected[$unitName] = true;
        }
        $result[$name] = array_keys($selected);
    }
    return $result;
}

function yokoten_scope_build_department_unit_plan(array $input): array
{
    $departments = [];
    foreach (($input['departments'] ?? []) as $value) {
        $name = trim((string)$value);
        if ($name !== '') $departments[$name] = true;
    }
    $departments = array_keys($departments);
    $topicUnits = array_values($input['topicUnits'] ?? []);
    $masterUnits = array_values($input['masterUnits'] ?? []);
    $fallbackUnits = array_values($input['fallbackUnits'] ?? []);
    $mapping = yokoten_scope_parse_department_units($input['departmentUnits'] ?? null);
    $strictMapping = $mapping !== null;
    $scope = yokoten_scope_resolve_topic_units($topicUnits, $masterUnits);
    $errors = [];
    $unitMap = [];

    if ($topicUnits && $scope['unresolved']) {
        $errors[] = 'Topic Safety Unit scope is not in Master Data: ' . implode(', ', $scope['unresolved']);
    }

    $selectedDepartmentKeys = array_fill_keys(array_map('yokoten_scope_normalize', $departments), true);
    if ($strictMapping) {
        $extra = array_values(array_filter(array_keys($mapping), static fn($department) =>
            !isset($selectedDepartmentKeys[yokoten_scope_normalize($department)])
        ));
        if ($extra) $errors[] = 'Safety Unit mapping contains unselected Department: ' . implode(', ', $extra);
    }

    foreach ($departments as $department) {
        $departmentKey = yokoten_scope_normalize($department);
        $scopedUnits = array_values(array_filter($scope['units'], static fn(array $unit) =>
            yokoten_scope_normalize(yokoten_scope_unit_department($unit)) === $departmentKey
        ));
        $rawSelected = $fallbackUnits;
        if ($strictMapping) {
            $rawSelected = [];
            foreach ($mapping as $mappedDepartment => $mappedUnits) {
                if (yokoten_scope_normalize($mappedDepartment) === $departmentKey) {
                    $rawSelected = $mappedUnits;
                    break;
                }
            }
        }
        $canonicalSelected = [];
        foreach ($rawSelected as $requestedUnit) {
            $unitKey = yokoten_scope_normalize($requestedUnit);
            $matches = yokoten_scope_unique_units(array_values(array_filter($masterUnits, static fn(array $unit) =>
                yokoten_scope_normalize(yokoten_scope_unit_name($unit)) === $unitKey
            )));
            if (count($matches) !== 1) {
                $errors[] = 'Safety Unit is not in Master Data: ' . $requestedUnit;
                continue;
            }
            $unit = $matches[0];
            if (yokoten_scope_normalize(yokoten_scope_unit_department($unit)) !== $departmentKey) {
                $errors[] = 'Safety Unit ' . yokoten_scope_unit_name($unit) . ' does not belong to ' . $department;
                continue;
            }
            $inScope = !$topicUnits || (bool)array_filter($scopedUnits, static fn(array $item) =>
                yokoten_scope_normalize(yokoten_scope_unit_name($item))
                    === yokoten_scope_normalize(yokoten_scope_unit_name($unit))
            );
            if (!$inScope) {
                $errors[] = 'Safety Unit ' . yokoten_scope_unit_name($unit) . ' is outside the topic scope for ' . $department;
                continue;
            }
            $canonicalSelected[yokoten_scope_unit_name($unit)] = true;
        }
        $canonicalSelected = array_keys($canonicalSelected);
        if ($scopedUnits && !$canonicalSelected) $errors[] = 'Safety Unit is required for ' . $department;
        if (!$scopedUnits && $canonicalSelected) $errors[] = 'No scoped Safety Unit is assigned to ' . $department;
        if (mb_strlen(implode(', ', $canonicalSelected), 'UTF-8') > 100) {
            $errors[] = 'Selected Safety Units exceed the 100-character storage limit for ' . $department;
        }
        $unitMap[$department] = $canonicalSelected;
    }

    return [
        'ok' => !$errors,
        'errors' => array_values(array_unique($errors)),
        'unitMap' => $unitMap,
        'unresolved' => $scope['unresolved'],
        'aliases' => $scope['aliases'],
    ];
}
