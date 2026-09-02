<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/bbs_phase1.php';
require_once __DIR__ . '/../lib/bbs_checklist.php';

function bbs_phase1_audit(array $user, string $action, string $targetType, string $targetId, string $detail): void
{
    try {
        db_execute(
            'INSERT INTO admin_auditlogs(AdminID,AdminName,Role,Department,Module,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                (string) ($user['id'] ?? 'system'), (string) ($user['name'] ?? 'System'),
                (string) ($user['role'] ?? ''), (string) ($user['department'] ?? ''), 'bbs',
                $action, (string) ($_SERVER['REQUEST_METHOD'] ?? ''), (string) ($_SERVER['REQUEST_URI'] ?? ''),
                200, $targetType, $targetId, $detail, '{}',
                (string) ($_SERVER['REMOTE_ADDR'] ?? ''), mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
    } catch (Throwable $error) {
        error_log('[bbs-phase1] audit failed: ' . $error->getMessage());
    }
}

function bbs_phase1_employee_context(string $employeeId, string $asOf): ?array
{
    return db_row(
        "SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                mp.id PositionID,md.id DepartmentID,su.id SafetyUnitID,plm.BBSLevel,
                COALESCE(elig.Eligibility,'active') Eligibility,elig.Reason EligibilityReason
           FROM employees e
           LEFT JOIN master_positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings plm ON plm.PositionID=mp.id AND plm.IsActive=1
           LEFT JOIN master_departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department))
           LEFT JOIN master_safetyunits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit))
           LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(
                SELECT ee.id FROM BBS_Employee_Eligibility ee
                 WHERE LOWER(TRIM(ee.EmployeeID))=LOWER(TRIM(e.EmployeeID))
                   AND ee.IsActive=1 AND ee.EffectiveFrom<=?
                   AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?)
                 ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
          WHERE LOWER(TRIM(e.EmployeeID))=LOWER(TRIM(?)) LIMIT 1",
        [$asOf, $asOf, $employeeId]
    );
}

function bbs_phase1_checklist_readiness_candidates(): array
{
    return db_rows("SELECT s.*,s.IsActive MappingIsActive,v.id VersionID,v.VersionNo,v.Status VersionStatus,
                           v.EffectiveFrom,v.EffectiveTo,t.id TemplateID,t.TemplateCode,t.TemplateName,t.IsActive TemplateIsActive
                      FROM BBS_Checklist_Scope_Mappings s
                      JOIN BBS_Checklist_Versions v ON v.id=s.VersionID
                      JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID");
}

function bbs_phase1_with_checklist_readiness(array $rows, array $candidates, string $asOf): array
{
    foreach ($rows as &$row) {
        $row['ChecklistReadiness'] = bbs_checklist_readiness($candidates, [
            'departmentId' => $row['DepartmentID'] ?? null,
            'safetyUnitId' => $row['SafetyUnitID'] ?? null,
            'positionId' => $row['PositionID'] ?? null,
            'bbsLevel' => $row['BBSLevel'] ?? null,
        ], $asOf);
    }
    unset($row);
    return $rows;
}

function bbs_phase1_current_assignments(string $employeeId, string $asOf): array
{
    return db_rows(
        "SELECT a.*,s.EmployeeName SupervisorName,m.EmployeeName MemberName,
                sm.BBSLevel SupervisorLevel,mm.BBSLevel MemberLevel,
                d.Name DepartmentName,u.name SafetyUnitName
           FROM BBS_Hierarchy_Assignments a
           JOIN employees s ON s.EmployeeID=a.SupervisorEmployeeID
           JOIN employees m ON m.EmployeeID=a.MemberEmployeeID
           LEFT JOIN master_positions sp ON LOWER(TRIM(sp.Name))=LOWER(TRIM(s.Position))
           LEFT JOIN master_positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(m.Position))
           LEFT JOIN BBS_Position_Level_Mappings sm ON sm.PositionID=sp.id AND sm.IsActive=1
           LEFT JOIN BBS_Position_Level_Mappings mm ON mm.PositionID=mp.id AND mm.IsActive=1
           LEFT JOIN master_departments d ON d.id=a.DepartmentID
           LEFT JOIN master_safetyunits u ON u.id=a.SafetyUnitID
          WHERE a.IsActive=1 AND a.EffectiveFrom<=?
            AND (a.EffectiveTo IS NULL OR a.EffectiveTo>=?)
            AND (LOWER(TRIM(a.SupervisorEmployeeID))=LOWER(TRIM(?))
                 OR LOWER(TRIM(a.MemberEmployeeID))=LOWER(TRIM(?)))
          ORDER BY a.EffectiveFrom DESC,a.id DESC",
        [$asOf, $asOf, $employeeId, $employeeId]
    );
}

function bbs_phase1_context_payload(array $user, string $asOf): array
{
    $employeeId = trim((string) ($user['id'] ?? $user['EmployeeID'] ?? ''));
    $employee = bbs_phase1_employee_context($employeeId, $asOf);
    if (!$employee) return ['error' => ['status' => 404, 'message' => 'Employee is not available in Employee Master.']];
    $assignments = bbs_phase1_current_assignments($employeeId, $asOf);
    $kpiRows = !empty($employee['BBSLevel'])
        ? db_rows('SELECT * FROM BBS_KPI_Rules WHERE BBSLevel=? AND IsActive=1 ORDER BY id', [$employee['BBSLevel']])
        : [];
    foreach ($kpiRows as &$rule) {
        $rule['weekdays'] = bbs_phase1_weekdays($rule['Weekdays'] ?? '');
        $rule['dueToday'] = bbs_phase1_kpi_due($rule, $asOf);
    }
    unset($rule);
    $pilotRows = db_rows(
        "SELECT p.*,d.Name DepartmentName,u.name SafetyUnitName
           FROM BBS_Pilot_Scopes p JOIN master_departments d ON d.id=p.DepartmentID
           JOIN master_safetyunits u ON u.id=p.SafetyUnitID
          WHERE p.IsActive=1 AND p.EffectiveFrom<=? AND (p.EffectiveTo IS NULL OR p.EffectiveTo>=?)",
        [$asOf, $asOf]
    );
    $isAdmin = strcasecmp((string) ($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0;
    $analyticsSetting = db_row("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='analytics_enabled' LIMIT 1");
    $batchSettings = [];
    try { foreach (db_rows("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('batch_observation_enabled','mobile_observation_wizard_enabled','draft_autosave_enabled')") as $setting) $batchSettings[$setting['SettingKey']] = (string)$setting['SettingValue'] === '1'; } catch (Throwable $ignored) { $batchSettings = []; }
    $inspectorEnrollment = null;
    try { $inspectorEnrollment = db_row("SELECT * FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND Status='Active' AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? ORDER BY EffectiveFrom DESC,id DESC LIMIT 1", [$employeeId,$asOf,$asOf]); } catch (Throwable $ignored) { $inspectorEnrollment = null; }
    $configurationReady = !empty($employee['BBSLevel']) && ($employee['Eligibility'] ?? '') === 'active';
    $inPilot = false;
    foreach ($pilotRows as $pilot) {
        if ((int) $pilot['DepartmentID'] === (int) ($employee['DepartmentID'] ?? 0)
            && (int) $pilot['SafetyUnitID'] === (int) ($employee['SafetyUnitID'] ?? 0)) $inPilot = true;
    }
    if (!$isAdmin) {
        $pilotRows = array_values(array_filter($pilotRows, static function (array $row) use ($employee): bool {
            return (int) $row['DepartmentID'] === (int) ($employee['DepartmentID'] ?? 0);
        }));
    }
    return ['data' => [
        'asOf' => $asOf,
        'employee' => $employee,
        'bbsLevel' => $employee['BBSLevel'] ?: null,
        'eligibility' => $employee['Eligibility'],
        'configurationReady' => $configurationReady,
        'denyReason' => $configurationReady ? null : (empty($employee['BBSLevel']) ? 'POSITION_NOT_MAPPED' : 'EMPLOYEE_NOT_ACTIVE'),
        'permissions' => [
            'configure' => $isAdmin,
            'companyRead' => $isAdmin,
            'departmentRead' => $isAdmin || bbs_phase1_level_rank($employee['BBSLevel'] ?? null) >= bbs_phase1_level_rank('Department Head'),
            'teamRead' => $isAdmin || bbs_phase1_level_rank($employee['BBSLevel'] ?? null) >= bbs_phase1_level_rank('Group Leader'),
            'selfHistory' => true,
            'observe' => $isAdmin || ($configurationReady && bbs_phase1_level_rank($employee['BBSLevel'] ?? null) >= bbs_phase1_level_rank('Group Leader') && !empty($inspectorEnrollment)),
            'manageOwnTeam' => !$isAdmin && !empty($inspectorEnrollment) && (int)($inspectorEnrollment['AllowSelfManage']??0)===1,
        ],
        'inspectorEnrollment' => $inspectorEnrollment,
        'assignments' => $assignments,
        'kpiRules' => $kpiRows,
        'analyticsEnabled' => (string) ($analyticsSetting['SettingValue'] ?? '0') === '1',
        'batchObservationEnabled' => !empty($batchSettings['batch_observation_enabled']),
        'mobileObservationWizardEnabled' => !empty($batchSettings['mobile_observation_wizard_enabled']),
        'draftAutosaveEnabled' => !empty($batchSettings['draft_autosave_enabled']),
        'pilot' => ['inPilot' => $inPilot, 'scopes' => $pilotRows],
    ]];
}

function bbs_phase1_positive_int($value): ?int
{
    $number = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    return $number === false ? null : (int) $number;
}

function bbs_phase1_admin_foundation(): array
{
    $positions = db_rows('SELECT id,Name FROM master_positions ORDER BY Name');
    $mappings = db_rows('SELECT m.*,p.Name PositionName FROM BBS_Position_Level_Mappings m JOIN master_positions p ON p.id=m.PositionID ORDER BY p.Name');
    $map = [];
    foreach ($mappings as $mapping) $map[(int) $mapping['PositionID']] = $mapping;
    foreach ($positions as &$position) $position['mapping'] = $map[(int) $position['id']] ?? null;
    unset($position);
    $assignments = db_rows(
        'SELECT a.*,s.EmployeeName SupervisorName,m.EmployeeName MemberName,d.Name DepartmentName,u.name SafetyUnitName
           FROM BBS_Hierarchy_Assignments a JOIN employees s ON s.EmployeeID=a.SupervisorEmployeeID
           JOIN employees m ON m.EmployeeID=a.MemberEmployeeID JOIN master_departments d ON d.id=a.DepartmentID
           LEFT JOIN master_safetyunits u ON u.id=a.SafetyUnitID ORDER BY a.IsActive DESC,a.EffectiveFrom DESC,a.id DESC'
    );
    $pilots = db_rows(
        'SELECT p.*,d.Name DepartmentName,u.name SafetyUnitName FROM BBS_Pilot_Scopes p
          JOIN master_departments d ON d.id=p.DepartmentID JOIN master_safetyunits u ON u.id=p.SafetyUnitID
         ORDER BY p.IsActive DESC,p.id DESC'
    );
    $eligibility = db_rows(
        'SELECT x.*,e.EmployeeName FROM BBS_Employee_Eligibility x JOIN employees e ON e.EmployeeID=x.EmployeeID
         ORDER BY x.IsActive DESC,x.EffectiveFrom DESC,x.id DESC'
    );
    return [
        'levels' => bbs_phase1_levels(),
        'eligibilityValues' => bbs_phase1_eligibility_values(),
        'assignmentTypes' => bbs_phase1_assignment_types(),
        'positions' => $positions,
        'departments' => db_rows('SELECT id,Name,Status,is_safety_core FROM master_departments ORDER BY Name'),
        'units' => db_rows('SELECT id,name,short_code,department_id FROM master_safetyunits ORDER BY department_id,sort_order,name'),
        'assignments' => $assignments,
        'kpiRules' => db_rows('SELECT * FROM BBS_KPI_Rules ORDER BY BBSLevel,MetricKey'),
        'pilotScopes' => $pilots,
        'eligibility' => $eligibility,
        'employees' => db_rows('SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM employees ORDER BY Department,Unit,EmployeeName'),
        'summary' => [
            'positions' => count($positions),
            'mappedPositions' => count(array_filter($mappings, static fn(array $row): bool => (int) $row['IsActive'] === 1)),
            'activeAssignments' => count(array_filter($assignments, static fn(array $row): bool => (int) $row['IsActive'] === 1)),
            'activePilotScopes' => count(array_filter($pilots, static fn(array $row): bool => (int) $row['IsActive'] === 1)),
        ],
    ];
}

function bbs_phase1_assignment_check(PDO $pdo, array $body, ?int $excludeId = null): array
{
    $asOf = (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d');
    $supervisor = bbs_phase1_employee_context(trim((string) ($body['supervisorEmployeeId'] ?? '')), $asOf);
    $member = bbs_phase1_employee_context(trim((string) ($body['memberEmployeeId'] ?? '')), $asOf);
    if (!$supervisor || !$member) return ['error' => ['status' => 404, 'message' => 'Supervisor or member was not found.']];
    $validation = bbs_phase1_validate_assignment(array_merge($body, [
        'supervisorLevel' => $supervisor['BBSLevel'] ?? null,
        'memberLevel' => $member['BBSLevel'] ?? null,
    ]));
    if (empty($validation['ok'])) return ['error' => ['status' => 400, 'message' => $validation['message']]];
    $departmentId = bbs_phase1_positive_int($body['departmentId'] ?? null);
    $safetyUnitId = ($body['safetyUnitId'] ?? '') === '' || ($body['safetyUnitId'] ?? null) === null
        ? null : bbs_phase1_positive_int($body['safetyUnitId']);
    if (!$departmentId || (int) ($supervisor['DepartmentID'] ?? 0) !== $departmentId || (int) ($member['DepartmentID'] ?? 0) !== $departmentId) {
        return ['error' => ['status' => 400, 'message' => 'Both employees must belong to the selected Department.']];
    }
    if ($validation['supervisorLevel'] === 'Group Leader') {
        if (!$safetyUnitId || (int) ($supervisor['SafetyUnitID'] ?? 0) !== $safetyUnitId || (int) ($member['SafetyUnitID'] ?? 0) !== $safetyUnitId) {
            return ['error' => ['status' => 400, 'message' => 'Group Leader assignments require both employees in the selected Safety Unit.']];
        }
    } elseif ($safetyUnitId && !db_row('SELECT id FROM master_safetyunits WHERE id=? AND department_id=? LIMIT 1', [$safetyUnitId, $departmentId])) {
        return ['error' => ['status' => 400, 'message' => 'Safety Unit does not belong to the selected Department.']];
    }
    $sql = "SELECT id FROM BBS_Hierarchy_Assignments WHERE MemberEmployeeID=? AND IsActive=1
             AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=?";
    $params = [$validation['memberId'], $validation['to'] ?: '9999-12-31', $validation['from']];
    if ($excludeId) { $sql .= ' AND id<>?'; $params[] = $excludeId; }
    $sql .= ' LIMIT 1 FOR UPDATE';
    if (db_row($sql, $params)) return ['error' => ['status' => 409, 'message' => 'This member already has an overlapping active hierarchy assignment.']];
    return compact('validation', 'supervisor', 'member', 'departmentId', 'safetyUnitId');
}

function handle_bbs_smart_card_routes(string $method, string $path): bool
{
    if (strpos($path, '/bbs') !== 0) return false;
    $user = require_user();

    if ($method === 'GET' && $path === '/bbs/levels') {
        json_response(['success' => true, 'data' => bbs_phase1_levels()]);
    }
    if ($method === 'GET' && $path === '/bbs/me/context') {
        $asOf = bbs_phase1_iso_date($_GET['asOf'] ?? (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'), true);
        if (!$asOf) json_response(['success' => false, 'message' => 'asOf must be a valid YYYY-MM-DD date.'], 400);
        $payload = bbs_phase1_context_payload($user, $asOf);
        if (isset($payload['error'])) json_response(['success' => false, 'message' => $payload['error']['message']], $payload['error']['status']);
        json_response(['success' => true, 'data' => $payload['data']]);
    }
    if ($method === 'GET' && $path === '/bbs/me/team') {
        $asOf = bbs_phase1_iso_date($_GET['asOf'] ?? (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'), true);
        if (!$asOf) json_response(['success' => false, 'message' => 'asOf must be a valid YYYY-MM-DD date.'], 400);
        $payload = bbs_phase1_context_payload($user, $asOf);
        if (isset($payload['error'])) json_response(['success' => false, 'message' => $payload['error']['message']], $payload['error']['status']);
        $employeeId = trim((string) ($user['id'] ?? ''));
        $rows = array_values(array_filter($payload['data']['assignments'], static fn(array $row): bool => (string) $row['SupervisorEmployeeID'] === $employeeId));
        json_response(['success' => true, 'data' => ['asOf' => $asOf, 'bbsLevel' => $payload['data']['bbsLevel'], 'rows' => $rows]]);
    }
    if ($method === 'GET' && $path === '/bbs/eligible-employees') {
        $asOf = bbs_phase1_iso_date($_GET['asOf'] ?? (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('Y-m-d'), true);
        if (!$asOf) json_response(['success' => false, 'message' => 'asOf must be a valid YYYY-MM-DD date.'], 400);
        $payload = bbs_phase1_context_payload($user, $asOf);
        if (isset($payload['error'])) json_response(['success' => false, 'message' => $payload['error']['message']], $payload['error']['status']);
        $isAdmin = strcasecmp((string) ($user['role'] ?? ''), 'Admin') === 0;
        if (!$isAdmin && (empty($payload['data']['configurationReady']) || empty($payload['data']['permissions']['observe']))) {
            json_response(['success' => true, 'data' => ['asOf' => $asOf, 'rows' => [], 'denyReason' => $payload['data']['denyReason'] ?: 'OBSERVATION_SCOPE_NOT_GRANTED']]);
        }
        if ($isAdmin) {
            $rows = db_rows(
                "SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,
                        p.id PositionID,md.id DepartmentID,su.id SafetyUnitID
                   FROM employees e JOIN master_positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
                   JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
                   LEFT JOIN master_departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department))
                   LEFT JOIN master_safetyunits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit))
                   LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(SELECT ee.id FROM BBS_Employee_Eligibility ee
                    WHERE ee.EmployeeID=e.EmployeeID AND ee.IsActive=1 AND ee.EffectiveFrom<=?
                      AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?) ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
                  WHERE COALESCE(elig.Eligibility,'active')='active' ORDER BY e.Department,e.Unit,e.EmployeeName",
                [$asOf, $asOf]
            );
        } else {
            $rows = db_rows(
                "SELECT DISTINCT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,mapping.BBSLevel,md.id DepartmentID,su.id SafetyUnitID,p.id PositionID
                   FROM BBS_Hierarchy_Assignments a JOIN employees e ON e.EmployeeID=a.MemberEmployeeID
                   JOIN master_positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
                   JOIN BBS_Position_Level_Mappings mapping ON mapping.PositionID=p.id AND mapping.IsActive=1
                   LEFT JOIN master_departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department))
                   LEFT JOIN master_safetyunits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit))
                   LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(SELECT ee.id FROM BBS_Employee_Eligibility ee
                    WHERE ee.EmployeeID=e.EmployeeID AND ee.IsActive=1 AND ee.EffectiveFrom<=?
                      AND (ee.EffectiveTo IS NULL OR ee.EffectiveTo>=?) ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
                  WHERE a.SupervisorEmployeeID=? AND a.IsActive=1 AND a.EffectiveFrom<=?
                    AND (a.EffectiveTo IS NULL OR a.EffectiveTo>=?) AND COALESCE(elig.Eligibility,'active')='active'
                  ORDER BY e.EmployeeName",
                [$asOf, $asOf, (string) ($user['id'] ?? ''), $asOf, $asOf]
            );
        }
        $rows = bbs_phase1_with_checklist_readiness($rows, bbs_phase1_checklist_readiness_candidates(), $asOf);
        json_response(['success' => true, 'data' => ['asOf' => $asOf, 'rows' => $rows, 'denyReason' => null]]);
    }

    if ($method === 'GET' && $path === '/bbs/admin/foundation') {
        require_admin();
        json_response(['success' => true, 'data' => bbs_phase1_admin_foundation()]);
    }
    $positionParams = route_params($path, '/bbs/admin/position-mappings/:positionId');
    if ($method === 'PUT' && $positionParams !== null) {
        $admin = require_admin();
        $positionId = bbs_phase1_positive_int($positionParams['positionId']);
        $body = json_body();
        $level = bbs_phase1_normalize_level($body['bbsLevel'] ?? null);
        $isActive = (isset($body['isActive']) && ($body['isActive'] === false || (int) $body['isActive'] === 0)) ? 0 : 1;
        if (!$positionId || !$level) json_response(['success' => false, 'message' => 'Valid PositionID and BBSLevel are required.'], 400);
        $position = db_row('SELECT id,Name FROM master_positions WHERE id=? LIMIT 1', [$positionId]);
        if (!$position) json_response(['success' => false, 'message' => 'Master Position was not found.'], 404);
        db_execute(
            'INSERT INTO BBS_Position_Level_Mappings(PositionID,BBSLevel,IsActive,ReviewedBy,ReviewedAt) VALUES(?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE BBSLevel=VALUES(BBSLevel),IsActive=VALUES(IsActive),ReviewedBy=VALUES(ReviewedBy),ReviewedAt=NOW()',
            [$positionId, $level, $isActive, (string) ($admin['id'] ?? '')]
        );
        bbs_phase1_audit($admin, 'BBS_POSITION_LEVEL_UPDATE', 'BBS_Position_Level_Mapping', (string) $positionId, $position['Name'] . ' -> ' . $level . '; active=' . $isActive);
        json_response(['success' => true, 'data' => ['positionId' => $positionId, 'positionName' => $position['Name'], 'bbsLevel' => $level, 'isActive' => $isActive], 'message' => 'BBS position mapping saved.']);
    }
    $kpiParams = route_params($path, '/bbs/admin/kpi-rules/:level');
    if ($method === 'PUT' && $kpiParams !== null) {
        $admin = require_admin();
        $body = json_body();
        $level = bbs_phase1_normalize_level($kpiParams['level']);
        $target = filter_var($body['targetCount'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]);
        $weekdays = bbs_phase1_weekdays($body['weekdays'] ?? []);
        $isActive = (isset($body['isActive']) && ($body['isActive'] === false || (int) $body['isActive'] === 0)) ? 0 : 1;
        if (!$level || $target === false || !$weekdays) json_response(['success' => false, 'message' => 'Valid BBSLevel, TargetCount (1-100), and Weekdays are required.'], 400);
        db_execute(
            "INSERT INTO BBS_KPI_Rules(BBSLevel,MetricKey,PeriodType,TargetCount,Weekdays,TimeZone,CountStatus,IsActive,UpdatedBy)
             VALUES(?,'submitted_observation','business_day',?,?,'Asia/Bangkok','submitted',?,?)
             ON DUPLICATE KEY UPDATE TargetCount=VALUES(TargetCount),Weekdays=VALUES(Weekdays),TimeZone='Asia/Bangkok',CountStatus='submitted',IsActive=VALUES(IsActive),UpdatedBy=VALUES(UpdatedBy)",
            [$level, (int) $target, implode(',', $weekdays), $isActive, (string) ($admin['id'] ?? '')]
        );
        bbs_phase1_audit($admin, 'BBS_KPI_RULE_UPDATE', 'BBS_KPI_Rule', $level, 'target=' . $target . '; weekdays=' . implode(',', $weekdays) . '; timezone=Asia/Bangkok');
        json_response(['success' => true, 'data' => ['bbsLevel' => $level, 'targetCount' => (int) $target, 'weekdays' => $weekdays, 'timeZone' => 'Asia/Bangkok', 'isActive' => $isActive], 'message' => 'BBS KPI rule saved.']);
    }
    if ($method === 'PUT' && $path === '/bbs/admin/pilot-scope') {
        $admin = require_admin();
        $body = json_body();
        $departmentId = bbs_phase1_positive_int($body['departmentId'] ?? null);
        $safetyUnitId = bbs_phase1_positive_int($body['safetyUnitId'] ?? null);
        $range = bbs_phase1_validate_range($body['effectiveFrom'] ?? null, $body['effectiveTo'] ?? null);
        if (!$departmentId || !$safetyUnitId || empty($range['ok'])) json_response(['success' => false, 'message' => $range['message'] ?? 'Valid Department and Safety Unit are required.'], 400);
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $unit = db_row('SELECT u.id,u.name,u.department_id,d.Name DepartmentName FROM master_safetyunits u JOIN master_departments d ON d.id=u.department_id WHERE u.id=? AND d.id=? LIMIT 1 FOR UPDATE', [$safetyUnitId, $departmentId]);
            if (!$unit) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Safety Unit does not belong to the selected Department.'], 400); }
            db_execute('UPDATE BBS_Pilot_Scopes SET IsActive=0,UpdatedBy=? WHERE IsActive=1', [(string) ($admin['id'] ?? '')]);
            db_execute(
                'INSERT INTO BBS_Pilot_Scopes(DepartmentID,SafetyUnitID,IsActive,EffectiveFrom,EffectiveTo,UpdatedBy) VALUES(?,?,1,?,?,?)
                 ON DUPLICATE KEY UPDATE IsActive=1,EffectiveFrom=VALUES(EffectiveFrom),EffectiveTo=VALUES(EffectiveTo),UpdatedBy=VALUES(UpdatedBy)',
                [$departmentId, $safetyUnitId, $range['from'], $range['to'], (string) ($admin['id'] ?? '')]
            );
            $pdo->commit();
            bbs_phase1_audit($admin, 'BBS_PILOT_SCOPE_UPDATE', 'BBS_Pilot_Scope', $departmentId . ':' . $safetyUnitId, $unit['DepartmentName'] . ' / ' . $unit['name']);
            json_response(['success' => true, 'data' => ['departmentId' => $departmentId, 'safetyUnitId' => $safetyUnitId, 'departmentName' => $unit['DepartmentName'], 'safetyUnitName' => $unit['name'], 'effectiveFrom' => $range['from'], 'effectiveTo' => $range['to']], 'message' => 'BBS pilot scope saved.']);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }
    if ($method === 'POST' && $path === '/bbs/admin/hierarchy-assignments') {
        $admin = require_admin();
        $body = json_body();
        $pdo = db(); $pdo->beginTransaction();
        try {
            $checked = bbs_phase1_assignment_check($pdo, $body);
            if (isset($checked['error'])) { $pdo->rollBack(); json_response(['success' => false, 'message' => $checked['error']['message']], $checked['error']['status']); }
            $stmt = $pdo->prepare('INSERT INTO BBS_Hierarchy_Assignments(SupervisorEmployeeID,MemberEmployeeID,DepartmentID,SafetyUnitID,AssignmentType,EffectiveFrom,EffectiveTo,IsActive,Reason,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,1,?,?,?)');
            $stmt->execute([$checked['validation']['supervisorId'],$checked['validation']['memberId'],$checked['departmentId'],$checked['safetyUnitId'],$checked['validation']['assignmentType'],$checked['validation']['from'],$checked['validation']['to'],mb_substr(trim((string) ($body['reason'] ?? '')),0,255) ?: null,(string) ($admin['id'] ?? ''),(string) ($admin['id'] ?? '')]);
            $id = (int) $pdo->lastInsertId(); $pdo->commit();
            bbs_phase1_audit($admin, 'BBS_HIERARCHY_ASSIGNMENT_CREATE', 'BBS_Hierarchy_Assignment', (string) $id, $checked['validation']['supervisorId'] . ' -> ' . $checked['validation']['memberId']);
            json_response(['success' => true, 'data' => ['id' => $id], 'message' => 'BBS hierarchy assignment created.'], 201);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }
    $assignmentParams = route_params($path, '/bbs/admin/hierarchy-assignments/:id');
    if ($assignmentParams !== null && $method === 'PUT') {
        $admin = require_admin(); $id = bbs_phase1_positive_int($assignmentParams['id']);
        if (!$id) json_response(['success' => false, 'message' => 'Invalid assignment ID.'], 400);
        $body = json_body(); $pdo = db(); $pdo->beginTransaction();
        try {
            if (!db_row('SELECT id FROM BBS_Hierarchy_Assignments WHERE id=? LIMIT 1 FOR UPDATE', [$id])) { $pdo->rollBack(); json_response(['success' => false, 'message' => 'Hierarchy assignment was not found.'], 404); }
            $checked = bbs_phase1_assignment_check($pdo, $body, $id);
            if (isset($checked['error'])) { $pdo->rollBack(); json_response(['success' => false, 'message' => $checked['error']['message']], $checked['error']['status']); }
            db_execute('UPDATE BBS_Hierarchy_Assignments SET SupervisorEmployeeID=?,MemberEmployeeID=?,DepartmentID=?,SafetyUnitID=?,AssignmentType=?,EffectiveFrom=?,EffectiveTo=?,IsActive=?,Reason=?,UpdatedBy=? WHERE id=?', [$checked['validation']['supervisorId'],$checked['validation']['memberId'],$checked['departmentId'],$checked['safetyUnitId'],$checked['validation']['assignmentType'],$checked['validation']['from'],$checked['validation']['to'],(isset($body['isActive'])&&($body['isActive']===false||(int)$body['isActive']===0))?0:1,mb_substr(trim((string)($body['reason']??'')),0,255)?:null,(string)($admin['id']??''),$id]);
            $pdo->commit(); bbs_phase1_audit($admin,'BBS_HIERARCHY_ASSIGNMENT_UPDATE','BBS_Hierarchy_Assignment',(string)$id,$checked['validation']['supervisorId'].' -> '.$checked['validation']['memberId']);
            json_response(['success'=>true,'data'=>['id'=>$id],'message'=>'BBS hierarchy assignment updated.']);
        } catch (Throwable $error) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $error; }
    }
    if ($assignmentParams !== null && $method === 'DELETE') {
        $admin = require_admin(); $id = bbs_phase1_positive_int($assignmentParams['id']);
        if (!$id) json_response(['success'=>false,'message'=>'Invalid assignment ID.'],400);
        $count = db_execute('UPDATE BBS_Hierarchy_Assignments SET IsActive=0,UpdatedBy=? WHERE id=? AND IsActive=1',[(string)($admin['id']??''),$id]);
        if (!$count) json_response(['success'=>false,'message'=>'Active hierarchy assignment was not found.'],404);
        bbs_phase1_audit($admin,'BBS_HIERARCHY_ASSIGNMENT_DEACTIVATE','BBS_Hierarchy_Assignment',(string)$id,'Soft-deactivated hierarchy assignment.');
        json_response(['success'=>true,'message'=>'BBS hierarchy assignment deactivated.']);
    }
    $eligibilityParams = route_params($path, '/bbs/admin/eligibility/:employeeId');
    if ($eligibilityParams !== null && $method === 'PUT') {
        $admin=require_admin();$employeeId=trim((string)$eligibilityParams['employeeId']);$body=json_body();$eligibility=strtolower(trim((string)($body['eligibility']??'')));$range=bbs_phase1_validate_range($body['effectiveFrom']??null,$body['effectiveTo']??null);
        if($employeeId===''||!in_array($eligibility,bbs_phase1_eligibility_values(),true)||empty($range['ok']))json_response(['success'=>false,'message'=>$range['message']??'Valid EmployeeID and eligibility are required.'],400);
        $pdo=db();$pdo->beginTransaction();
        try{
            if(!db_row('SELECT EmployeeID FROM employees WHERE EmployeeID=? LIMIT 1 FOR UPDATE',[$employeeId])){$pdo->rollBack();json_response(['success'=>false,'message'=>'Employee was not found.'],404);}
            if(db_row("SELECT id FROM BBS_Employee_Eligibility WHERE EmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1 FOR UPDATE",[$employeeId,$range['to']?:'9999-12-31',$range['from']])){$pdo->rollBack();json_response(['success'=>false,'message'=>'Employee already has an overlapping eligibility period.'],409);}
            $stmt=$pdo->prepare('INSERT INTO BBS_Employee_Eligibility(EmployeeID,Eligibility,EffectiveFrom,EffectiveTo,IsActive,Reason,CreatedBy,UpdatedBy) VALUES(?,?,?,?,1,?,?,?)');$stmt->execute([$employeeId,$eligibility,$range['from'],$range['to'],mb_substr(trim((string)($body['reason']??'')),0,255)?:null,(string)($admin['id']??''),(string)($admin['id']??'')]);$id=(int)$pdo->lastInsertId();$pdo->commit();
            bbs_phase1_audit($admin,'BBS_ELIGIBILITY_CREATE','BBS_Employee_Eligibility',(string)$id,$employeeId.' -> '.$eligibility);json_response(['success'=>true,'data'=>['id'=>$id,'employeeId'=>$employeeId,'eligibility'=>$eligibility],'message'=>'BBS employee eligibility saved.'],201);
        }catch(Throwable $error){if($pdo->inTransaction())$pdo->rollBack();throw $error;}
    }
    return true;
}
