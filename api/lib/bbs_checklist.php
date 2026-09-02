<?php
declare(strict_types=1);

function bbs_checklist_clean_text($value, int $max = 255): string
{
    return mb_substr(trim((string) $value), 0, $max);
}

function bbs_checklist_nullable_id($value)
{
    if ($value === '' || $value === null) return null;
    $number = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    return $number === false ? false : (int) $number;
}

function bbs_checklist_validate_draft(array $payload): array
{
    $range = bbs_phase1_validate_range($payload['effectiveFrom'] ?? null, $payload['effectiveTo'] ?? null);
    if (empty($range['ok'])) return $range;
    $categories = isset($payload['categories']) && is_array($payload['categories']) ? $payload['categories'] : [];
    $scopes = isset($payload['scopes']) && is_array($payload['scopes']) ? $payload['scopes'] : [];
    if (count($categories) < 1 || count($categories) > 50) return ['ok' => false, 'message' => 'Checklist requires 1-50 categories.'];
    if (count($scopes) < 1 || count($scopes) > 100) return ['ok' => false, 'message' => 'Checklist requires 1-100 scope mappings.'];
    $codes = []; $itemCount = 0; $normalizedCategories = [];
    foreach ($categories as $categoryIndex => $category) {
        $name = bbs_checklist_clean_text($category['name'] ?? '', 160);
        $items = isset($category['items']) && is_array($category['items']) ? $category['items'] : [];
        if ($name === '' || !$items) return ['ok' => false, 'message' => 'Category ' . ($categoryIndex + 1) . ' requires a name and at least one item.'];
        $normalizedItems = [];
        foreach ($items as $itemIndex => $item) {
            $code = strtoupper(bbs_checklist_clean_text($item['code'] ?? '', 50));
            $prompt = bbs_checklist_clean_text($item['prompt'] ?? '', 500);
            $type = strtolower(bbs_checklist_clean_text($item['responseType'] ?? 'safe_unsafe_na', 30));
            if (!preg_match('/^[A-Z0-9][A-Z0-9_-]{0,49}$/', $code) || $prompt === '') return ['ok' => false, 'message' => 'Item ' . ($itemIndex + 1) . ' in category ' . ($categoryIndex + 1) . ' requires a valid code and prompt.'];
            if (isset($codes[$code])) return ['ok' => false, 'message' => 'Item code ' . $code . ' is duplicated in this version.'];
            if ($type !== 'safe_unsafe_na') return ['ok' => false, 'message' => 'Response type ' . $type . ' is not supported in Phase 2.'];
            $codes[$code] = true; $itemCount++;
            $normalizedItems[] = ['code' => $code, 'prompt' => $prompt, 'responseType' => $type,
                'helpText' => bbs_checklist_clean_text($item['helpText'] ?? '', 500) ?: null,
                'sortOrder' => $itemIndex + 1, 'isRequired' => (($item['isRequired'] ?? true) === false) ? 0 : 1,
                'unsafeRequiresRemark' => (($item['unsafeRequiresRemark'] ?? true) === false) ? 0 : 1,
                'unsafeRequiresPhoto' => (($item['unsafeRequiresPhoto'] ?? false) === true) ? 1 : 0,
                'unsafeRequiresAction' => (($item['unsafeRequiresAction'] ?? false) === true) ? 1 : 0];
        }
        $normalizedCategories[] = ['name' => $name, 'sortOrder' => $categoryIndex + 1, 'items' => $normalizedItems];
    }
    if ($itemCount > 300) return ['ok' => false, 'message' => 'Checklist supports at most 300 items per version.'];
    $keys = []; $normalizedScopes = [];
    foreach ($scopes as $index => $scope) {
        $departmentId = bbs_checklist_nullable_id($scope['departmentId'] ?? null);
        $safetyUnitId = bbs_checklist_nullable_id($scope['safetyUnitId'] ?? null);
        $positionId = bbs_checklist_nullable_id($scope['positionId'] ?? null);
        $bbsLevel = !empty($scope['bbsLevel']) ? bbs_phase1_normalize_level($scope['bbsLevel']) : null;
        $priority = filter_var($scope['priority'] ?? 0, FILTER_VALIDATE_INT);
        if ($departmentId === false || $safetyUnitId === false || $positionId === false || (!empty($scope['bbsLevel']) && !$bbsLevel) || $priority === false || $priority < -100 || $priority > 100) return ['ok' => false, 'message' => 'Scope ' . ($index + 1) . ' contains an invalid Master ID, BBS level, or priority.'];
        if ($safetyUnitId && !$departmentId) return ['ok' => false, 'message' => 'Scope ' . ($index + 1) . ': Safety Unit requires Department.'];
        $key = implode(':', [$departmentId ?: 0, $safetyUnitId ?: 0, $positionId ?: 0, $bbsLevel ?: '', $priority]);
        if (isset($keys[$key])) return ['ok' => false, 'message' => 'Scope ' . ($index + 1) . ' is duplicated.'];
        $keys[$key] = true;
        $normalizedScopes[] = compact('departmentId', 'safetyUnitId', 'positionId', 'bbsLevel', 'priority');
    }
    return ['ok' => true, 'from' => $range['from'], 'to' => $range['to'], 'categories' => $normalizedCategories, 'scopes' => $normalizedScopes, 'itemCount' => $itemCount];
}

function bbs_checklist_import_preview(array $payload): array
{
    $validation = bbs_checklist_validate_draft($payload);
    if (empty($validation['ok'])) return $validation;
    $validation['summary'] = [
        'categoryCount' => count($validation['categories']),
        'itemCount' => $validation['itemCount'],
        'scopeCount' => count($validation['scopes']),
        'effectiveFrom' => $validation['from'],
        'effectiveTo' => $validation['to'],
    ];
    $validation['normalized'] = [
        'effectiveFrom' => $validation['from'],
        'effectiveTo' => $validation['to'],
        'categories' => $validation['categories'],
        'scopes' => $validation['scopes'],
    ];
    return $validation;
}

function bbs_checklist_specificity(array $scope): int
{
    return (!empty($scope['SafetyUnitID']) ? 100 : 0) + (!empty($scope['DepartmentID']) ? 40 : 0) + (!empty($scope['PositionID']) ? 20 : 0) + (!empty($scope['BBSLevel']) ? 10 : 0);
}

function bbs_checklist_scope_matches(array $scope, array $context): bool
{
    return (empty($scope['DepartmentID']) || (int) $scope['DepartmentID'] === (int) ($context['departmentId'] ?? 0))
        && (empty($scope['SafetyUnitID']) || (int) $scope['SafetyUnitID'] === (int) ($context['safetyUnitId'] ?? 0))
        && (empty($scope['PositionID']) || (int) $scope['PositionID'] === (int) ($context['positionId'] ?? 0))
        && (empty($scope['BBSLevel']) || $scope['BBSLevel'] === ($context['bbsLevel'] ?? null));
}

function bbs_checklist_scopes_overlap(array $a, array $b): bool
{
    foreach (['DepartmentID','SafetyUnitID','PositionID','BBSLevel'] as $key) if (!empty($a[$key]) && !empty($b[$key]) && (string) $a[$key] !== (string) $b[$key]) return false;
    return true;
}

function bbs_checklist_publish_conflicts(array $mine, array $others): array
{
    $ids=[]; foreach($mine as $left)foreach($others as $right)if((int)$left['Priority']===(int)$right['Priority']&&bbs_checklist_specificity($left)===bbs_checklist_specificity($right)&&bbs_checklist_scopes_overlap($left,$right))$ids[(int)$right['VersionID']]=true;
    $result=array_keys($ids);sort($result);return $result;
}

function bbs_checklist_resolve_candidates(array $candidates, array $context): array
{
    $matched = [];
    foreach ($candidates as $row) if (bbs_checklist_scope_matches($row, $context)) { $row['specificity'] = bbs_checklist_specificity($row); $matched[] = $row; }
    usort($matched, static function ($a, $b) {
        return ($b['specificity'] <=> $a['specificity']) ?: ((int) $b['Priority'] <=> (int) $a['Priority']) ?: strcmp((string) $b['EffectiveFrom'], (string) $a['EffectiveFrom']) ?: ((int) $b['VersionID'] <=> (int) $a['VersionID']);
    });
    if (!$matched) return ['ok' => false, 'code' => 'NO_CHECKLIST', 'message' => 'No published checklist matches this employee and date.'];
    $top = $matched[0]; $versionIds = [];
    foreach ($matched as $row) if ($row['specificity'] === $top['specificity'] && (int) $row['Priority'] === (int) $top['Priority'] && (string) $row['EffectiveFrom'] === (string) $top['EffectiveFrom']) $versionIds[(int) $row['VersionID']] = true;
    if (count($versionIds) > 1) return ['ok' => false, 'code' => 'CHECKLIST_CONFLICT', 'message' => 'Multiple published checklist versions have equal resolution priority.', 'conflicts' => array_keys($versionIds)];
    return ['ok' => true, 'selected' => $top, 'reason' => 'specificity=' . $top['specificity'] . '; priority=' . (int) $top['Priority'] . '; effectiveFrom=' . $top['EffectiveFrom']];
}

function bbs_checklist_readiness(array $candidates, array $context, string $asOf): array
{
    $activePublished = array_values(array_filter($candidates, static function (array $row) use ($asOf): bool {
        $mappingActive = (int) ($row['MappingIsActive'] ?? $row['IsActive'] ?? 0) === 1;
        $templateActive = (int) ($row['TemplateIsActive'] ?? 1) === 1;
        $published = (string) ($row['VersionStatus'] ?? $row['Status'] ?? '') === 'Published';
        $from = substr((string) ($row['EffectiveFrom'] ?? ''), 0, 10);
        $to = empty($row['EffectiveTo']) ? null : substr((string) $row['EffectiveTo'], 0, 10);
        return $mappingActive && $templateActive && $published && $from <= $asOf && ($to === null || $to >= $asOf);
    }));
    $resolved = bbs_checklist_resolve_candidates($activePublished, $context);
    if (!empty($resolved['ok'])) {
        $selected = $resolved['selected'];
        return [
            'ready' => true,
            'code' => 'READY',
            'message' => 'Ready: ' . ($selected['TemplateName'] ?? $selected['TemplateCode'] ?? 'Published checklist') . ' v' . (int) ($selected['VersionNo'] ?? 0) . '.',
            'checklistVersionId' => (int) $selected['VersionID'],
            'templateName' => $selected['TemplateName'] ?? null,
            'versionNo' => (int) ($selected['VersionNo'] ?? 0),
        ];
    }
    if (($resolved['code'] ?? '') === 'CHECKLIST_CONFLICT') return ['ready' => false, 'code' => 'CHECKLIST_CONFLICT', 'message' => $resolved['message'], 'conflicts' => $resolved['conflicts'] ?? []];

    $matching = array_values(array_filter($candidates, static fn(array $row): bool => (int) ($row['MappingIsActive'] ?? $row['IsActive'] ?? 0) === 1 && bbs_checklist_scope_matches($row, $context)));
    foreach ($matching as $row) if ((string) ($row['VersionStatus'] ?? $row['Status'] ?? '') === 'Draft') return ['ready' => false, 'code' => 'VERSION_NOT_PUBLISHED', 'message' => 'A matching checklist exists, but its version is not Published.'];
    foreach ($matching as $row) if ((string) ($row['VersionStatus'] ?? $row['Status'] ?? '') === 'Published') return ['ready' => false, 'code' => 'VERSION_NOT_EFFECTIVE', 'message' => 'A matching Published checklist exists, but it is inactive or outside the effective date.'];
    if ($activePublished) return ['ready' => false, 'code' => 'SCOPE_MISMATCH', 'message' => 'Published checklists exist, but none matches this employee scope.'];
    return ['ready' => false, 'code' => 'NO_CHECKLIST', 'message' => 'No checklist is configured for this employee and date.'];
}
