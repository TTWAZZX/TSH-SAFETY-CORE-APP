<?php
declare(strict_types=1);

function bbs_rollout_mode_from_settings(array $settings): string
{
    if ((string)($settings['staged_admin_only'] ?? '0') === '1') return 'admin_only';
    if ((string)($settings['pilot_scope_only'] ?? '0') === '1') return 'controlled_pilot';
    return 'company_wide';
}

function bbs_load_rollout_mode(): string
{
    try {
        $rows = db_rows(
            "SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('staged_admin_only','pilot_scope_only')"
        );
    } catch (Throwable $error) {
        if (stripos($error->getMessage(), 'doesn\'t exist') !== false || stripos($error->getMessage(), 'no such table') !== false) {
            return 'company_wide';
        }
        throw $error;
    }
    $settings = [];
    foreach ($rows as $row) $settings[(string)$row['SettingKey']] = (string)$row['SettingValue'];
    return bbs_rollout_mode_from_settings($settings);
}

function bbs_rollout_employee_id(array $user): string
{
    return trim((string)($user['id'] ?? $user['EmployeeID'] ?? $user['employeeId'] ?? ''));
}

function bbs_rollout_is_admin(array $user): bool
{
    return strcasecmp(trim((string)($user['role'] ?? $user['Role'] ?? '')), 'Admin') === 0;
}

function bbs_is_effective_pilot_participant(string $employeeId, ?string $asOf = null): bool
{
    $employeeId = trim($employeeId);
    if ($employeeId === '') return false;
    $asOf = $asOf ?: date('Y-m-d');
    $row = db_row(
        "SELECT 1
           FROM BBS_Pilot_Scopes p
          WHERE p.IsActive=1
            AND p.EffectiveFrom<=?
            AND COALESCE(p.EffectiveTo,'9999-12-31')>=?
            AND (
                EXISTS (
                    SELECT 1 FROM BBS_Inspector_Enrollments e
                     WHERE e.InspectorEmployeeID=?
                       AND e.DepartmentID=p.DepartmentID AND e.SafetyUnitID=p.SafetyUnitID
                       AND e.Status='Active' AND e.IsActive=1
                       AND e.EffectiveFrom<=? AND COALESCE(e.EffectiveTo,'9999-12-31')>=?
                )
                OR EXISTS (
                    SELECT 1 FROM BBS_Hierarchy_Assignments a
                     WHERE a.MemberEmployeeID=?
                       AND a.DepartmentID=p.DepartmentID AND a.SafetyUnitID=p.SafetyUnitID
                       AND a.IsActive=1
                       AND a.EffectiveFrom<=? AND COALESCE(a.EffectiveTo,'9999-12-31')>=?
                )
            )
          LIMIT 1",
        [$asOf, $asOf, $employeeId, $asOf, $asOf, $employeeId, $asOf, $asOf]
    );
    return $row !== null;
}

function bbs_enforce_rollout_access(): void
{
    $mode = bbs_load_rollout_mode();
    if ($mode === 'company_wide') return;

    header('X-BBS-Rollout-Mode: ' . ($mode === 'admin_only' ? 'staged-admin-only' : 'controlled-pilot'));
    if ($mode === 'admin_only') {
        require_admin();
        return;
    }

    $user = require_user();
    if (bbs_rollout_is_admin($user)) return;
    if (bbs_is_effective_pilot_participant(bbs_rollout_employee_id($user))) return;
    json_response([
        'success' => false,
        'code' => 'BBS_PILOT_ACCESS_REQUIRED',
        'message' => 'BBS Smart Card is currently available only to approved Pilot participants.',
    ], 403);
}
