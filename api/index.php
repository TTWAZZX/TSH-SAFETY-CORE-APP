<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';
require __DIR__ . '/mailer.php';
require __DIR__ . '/handlers/foundation.php';
require __DIR__ . '/handlers/platform.php';
require __DIR__ . '/handlers/storage.php';
require __DIR__ . '/handlers/targets.php';
require __DIR__ . '/handlers/people.php';
require __DIR__ . '/handlers/content.php';
require __DIR__ . '/handlers/operational.php';
require __DIR__ . '/handlers/operational_phase5.php';
require __DIR__ . '/handlers/patrol.php';
require __DIR__ . '/handlers/forklift.php';
require __DIR__ . '/handlers/workflow_phase6.php';
require __DIR__ . '/handlers/fourm_phase7.php';
require __DIR__ . '/handlers/admin_phase8.php';
require __DIR__ . '/handlers/johnny_ai.php';

header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = '/' . trim((string) ($_GET['route'] ?? ''), '/');

function dashboard_parse_array($value): array
{
    if ($value === null || $value === '') {
        return [];
    }
    if (is_array($value)) {
        return array_values(array_filter(array_map('strval', $value), static function ($item) {
            return trim($item) !== '';
        }));
    }
    $decoded = json_decode((string) $value, true);
    if (is_array($decoded)) {
        return array_values(array_filter(array_map('strval', $decoded), static function ($item) {
            return trim($item) !== '';
        }));
    }
    return array_values(array_filter(array_map('trim', preg_split('/\s*(?:\|+|;|,)\s*/', (string) $value) ?: []), static function ($item) {
        return $item !== '';
    }));
}

function dashboard_by_department(array $rows, callable $valueFn): array
{
    $out = [];
    foreach ($rows as $row) {
        $dept = dashboard_department_key((string) ($row['Department'] ?? ''));
        if ($dept === '') {
            continue;
        }
        $out[$dept] = $valueFn($row);
    }
    return $out;
}

function dashboard_department_key(string $value): string
{
    $value = strtoupper(trim($value));
    $value = str_replace('.', '', $value);
    return (string) preg_replace('/\s+/', ' ', $value);
}

function dashboard_unit_key(string $value): string
{
    $value = preg_replace('/[\r\n]+/', ' ', $value);
    $value = strtoupper(trim((string) $value));
    return (string) preg_replace('/\s+/', ' ', $value);
}

function dashboard_metric_row_state(string $sql, array $params = []): array
{
    try {
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        return ['available' => true, 'row' => $stmt->fetch() ?: []];
    } catch (Throwable $e) {
        return ['available' => false, 'row' => [], 'error' => $e->getMessage()];
    }
}

function dashboard_patrol_company_progress(int $year): array
{
    $currentYear = (int) date('Y');
    $elapsedMonths = $year < $currentYear ? 12 : ($year > $currentYear ? 0 : (int) date('n'));
    $state = dashboard_metric_row_state(
        "SELECT COALESCE(SUM(LEAST(COALESCE(actual.actualCount,0),roster.requiredSlots)),0) numerator,
                COALESCE(SUM(roster.requiredSlots),0) denominator
           FROM (
                 SELECT EmployeeID,CEIL(SUM(COALESCE(TargetPerYear,0))*?/12) requiredSlots
                   FROM patrol_roster
                  GROUP BY EmployeeID
                ) roster
           LEFT JOIN (
                 SELECT EmployeeID,SUM(actualCount) actualCount
                   FROM (
                         SELECT UserID EmployeeID,COUNT(*) actualCount
                           FROM patrol_attendance
                          WHERE YEAR(PatrolDate)=?
                          GROUP BY UserID
                         UNION ALL
                         SELECT EmployeeID,COUNT(*) actualCount
                           FROM patrol_self_checkin
                          WHERE Year=?
                          GROUP BY EmployeeID
                        ) activity
                  GROUP BY EmployeeID
                ) actual ON actual.EmployeeID=roster.EmployeeID",
        [$elapsedMonths, $year, $year]
    );
    $state['numerator'] = (float) ($state['row']['numerator'] ?? 0);
    $state['denominator'] = (float) ($state['row']['denominator'] ?? 0);
    $state['elapsedMonths'] = $elapsedMonths;
    return $state;
}

function dashboard_ky_company_progress(int $year): array
{
    try {
        $configs = db_rows(
            'SELECT Department,SafetyUnits,YearlyTarget FROM ky_program_config WHERE Year=? AND IsActive=1',
            [$year]
        );
        $activities = db_rows(
            'SELECT Department,SafetyUnit,COUNT(*) actual
               FROM ky_activities
              WHERE YEAR(ActivityDate)=?
              GROUP BY Department,SafetyUnit',
            [$year]
        );
        $activityMap = [];
        foreach ($activities as $row) {
            $key = dashboard_department_key((string) ($row['Department'] ?? ''))
                . '::' . dashboard_unit_key((string) ($row['SafetyUnit'] ?? ''));
            $activityMap[$key] = (int) ($row['actual'] ?? 0);
        }
        $numerator = 0;
        $denominator = 0;
        foreach ($configs as $config) {
            $department = dashboard_department_key((string) ($config['Department'] ?? ''));
            $units = array_values(array_filter(array_map('dashboard_unit_key', dashboard_parse_array($config['SafetyUnits'] ?? null))));
            $target = max(0, (int) ($config['YearlyTarget'] ?? 0));
            if ($department === '' || $target <= 0) continue;
            if ($units) {
                $denominator += count($units) * $target;
                foreach ($units as $unit) {
                    $numerator += (int) ($activityMap[$department . '::' . $unit] ?? 0);
                }
            } else {
                $denominator += $target;
                foreach ($activityMap as $key => $actual) {
                    if (strpos($key, $department . '::') === 0) $numerator += $actual;
                }
            }
        }
        return [
            'available' => true,
            'numerator' => $numerator,
            'denominator' => $denominator,
            'configuredScopes' => count($configs),
        ];
    } catch (Throwable $e) {
        return [
            'available' => false,
            'numerator' => 0,
            'denominator' => 0,
            'configuredScopes' => 0,
            'error' => $e->getMessage(),
        ];
    }
}

function dashboard_yokoten_company_progress(int $year): array
{
    try {
        $departments = db_rows('SELECT Name FROM master_departments ORDER BY Name');
        $topics = db_rows(
            'SELECT YokotenID,TargetDepts FROM yokotentopics
              WHERE IsActive=1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)',
            [$year]
        );
        $responses = db_rows(
            'SELECT YokotenID,Department FROM yokotenresponses
              WHERE IsDeleted IS NULL OR IsDeleted=0'
        );
        $departmentMap = [];
        foreach ($departments as $row) {
            $key = dashboard_department_key((string) ($row['Name'] ?? ''));
            if ($key !== '') $departmentMap[$key] = trim((string) $row['Name']);
        }
        $assignedPairs = [];
        $topicIds = [];
        $unknown = [];
        foreach ($topics as $topic) {
            $topicId = (string) ($topic['YokotenID'] ?? '');
            $topicIds[$topicId] = true;
            $configured = dashboard_parse_array($topic['TargetDepts'] ?? null);
            $targets = $configured
                ? array_map('dashboard_department_key', $configured)
                : array_keys($departmentMap);
            foreach ($targets as $department) {
                if (!isset($departmentMap[$department])) {
                    $unknown[$department] = true;
                    continue;
                }
                $assignedPairs[$department . '::' . $topicId] = true;
            }
        }
        if ($unknown) {
            return [
                'available' => false,
                'numerator' => 0,
                'denominator' => 0,
                'topics' => count($topics),
                'respondedDepartments' => 0,
                'unknownDepartments' => array_keys($unknown),
                'error' => 'One or more Yokoten target Departments do not resolve to master_departments.',
            ];
        }
        $respondedPairs = [];
        $respondedDepartments = [];
        foreach ($responses as $response) {
            $topicId = (string) ($response['YokotenID'] ?? '');
            if (!isset($topicIds[$topicId])) continue;
            $department = dashboard_department_key((string) ($response['Department'] ?? ''));
            $pair = $department . '::' . $topicId;
            if (!isset($assignedPairs[$pair])) continue;
            $respondedPairs[$pair] = true;
            $respondedDepartments[$department] = true;
        }
        return [
            'available' => true,
            'numerator' => count($respondedPairs),
            'denominator' => count($assignedPairs),
            'topics' => count($topics),
            'respondedDepartments' => count($respondedDepartments),
            'unknownDepartments' => [],
        ];
    } catch (Throwable $e) {
        return [
            'available' => false,
            'numerator' => 0,
            'denominator' => 0,
            'topics' => 0,
            'respondedDepartments' => 0,
            'unknownDepartments' => [],
            'error' => $e->getMessage(),
        ];
    }
}

function dashboard_compliance_matrix(int $year, array $config): array
{
    $cccfWorkerSource = dashboard_cccf_worker_source_for_year($config, $year);
    $deptRows = safe_rows('SELECT Name FROM master_departments ORDER BY Name ASC');
    $allDeptNames = array_values(array_filter(array_map(static function ($row) {
        return trim((string) ($row['Name'] ?? ''));
    }, $deptRows)));
    $pinned = dashboard_parse_array($config['pinnedDepartments'] ?? []);
    $deptNames = [];
    if ($pinned) {
        foreach ($pinned as $dept) {
            if (in_array($dept, $allDeptNames, true)) {
                $deptNames[] = $dept;
            }
        }
    } else {
        $deptNames = array_slice($allDeptNames, 0, 12);
    }
    if (!$deptNames) {
        return [];
    }

    $employeeRows = safe_rows("SELECT Department, COUNT(DISTINCT EmployeeID) AS total FROM employees WHERE Department IS NOT NULL AND Department <> '' GROUP BY Department");
    $trainingRows = safe_rows('SELECT Department, SUM(PassedCount) AS passed, SUM(TotalEmp) AS total FROM training_dept_records WHERE Year=? GROUP BY Department', [$year]);
    $kyConfigRows = safe_rows('SELECT Department, SafetyUnits, YearlyTarget FROM ky_program_config WHERE Year=? AND IsActive=1', [$year]);
    $kyRows = safe_rows('SELECT Department, COUNT(*) AS cnt FROM ky_activities WHERE YEAR(ActivityDate)=? GROUP BY Department', [$year]);
    $hiyariRows = safe_rows("SELECT Department, COUNT(DISTINCT COALESCE(NULLIF(ReporterID,''),id)) AS submitted FROM hiyarireports WHERE YEAR(ReportDate)=? GROUP BY Department", [$year]);
    $fourmRows = safe_rows("SELECT Department, COUNT(*) AS total, COALESCE(SUM(Status='Closed'),0) AS closed FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY Department", [$year]);
    $yokotenConfigRows = safe_rows("SELECT ConfigKey,ConfigValue FROM yokoten_dashboard_config WHERE ConfigKey IN ('pinnedDepts','pinnedUnits')");
    $yokotenTopicRows = safe_rows('SELECT YokotenID, TargetDepts, TargetUnits FROM yokotentopics WHERE IsActive=1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)', [$year]);
    $yokotenResponseRows = safe_rows(
        "SELECT r.YokotenID,r.Department,
                COALESCE(NULLIF(r.SafetyUnit,''),NULLIF(e.Unit,''),NULLIF(e.Team,'')) EffectiveSafetyUnit
           FROM yokotenresponses r
           LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID
          WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0)"
    );
    $patrolIssueRows = safe_rows('SELECT IssueID,ResponsibleDept,CurrentStatus FROM patrol_issues WHERE YEAR(DateFound)=?', [$year]);
    $cccfUnitSetting = db_row("SELECT value FROM app_settings WHERE key_name='cccf_unit_sel' LIMIT 1") ?: [];
    $cccfUnitTargetRows = safe_rows(
        'SELECT unit_name Unit,yearly_target target,achieved_override achievedOverride
           FROM cccf_unit_targets
          WHERE target_year=?',
        [$year]
    );
    $cccfWorkerUnitRows = safe_rows(
        "SELECT TRIM(COALESCE(SafetyUnit,'')) Unit,
                MAX(TRIM(COALESCE(Department,''))) Department,
                COUNT(DISTINCT COALESCE(
                    NULLIF(TRIM(EmployeeID),''),
                    NULLIF(LOWER(TRIM(EmployeeName)),''),
                    CONCAT('__legacy_row__',id)
                )) computedAchieved
           FROM cccf_forma_worker
          WHERE YEAR(SubmitDate)=?
          GROUP BY TRIM(COALESCE(SafetyUnit,''))",
        [$year]
    );
    $masterUnitRows = safe_rows(
        "SELECT TRIM(u.name) Unit,TRIM(COALESCE(d.Name,'')) Department
           FROM master_safetyunits u
           LEFT JOIN master_departments d ON d.id=u.department_id"
    );
    $cccfAssignmentRows = safe_rows('SELECT COALESCE(e.Department,a.Department) AS Department, COUNT(DISTINCT COALESCE(NULLIF(a.EmployeeID,\'\'),a.id)) AS assigned FROM cccf_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID GROUP BY COALESCE(e.Department,a.Department)');
    $cccfPermanentRows = safe_rows(
        "SELECT COALESCE(e.Department,a.Department,p.Department) AS Department,
                COUNT(DISTINCT COALESCE(NULLIF(p.AssigneeID,''),p.id)) AS completed
         FROM cccf_forma_permanent p
         LEFT JOIN cccf_assignments a ON a.EmployeeID=p.AssigneeID
         LEFT JOIN employees e ON e.EmployeeID=p.AssigneeID
         WHERE YEAR(p.SubmitDate)=?
           AND (p.ReviewStatus='Completed' OR (p.ReviewStatus IS NULL AND p.FileUrl IS NOT NULL))
         GROUP BY COALESCE(e.Department,a.Department,p.Department)",
        [$year]
    );
    $accidentRows = safe_rows("SELECT Department, COUNT(*) AS total, COALESCE(SUM(Status IN ('Closed','closed')),0) AS closed FROM accident_reports WHERE YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0) GROUP BY Department", [$year]);
    $machineRows = safe_rows("
        SELECT m.Department, COUNT(DISTINCT m.id) AS machines,
               COALESCE(SUM(c.passItems),0) AS passItems, COALESCE(SUM(c.checkedItems),0) AS checkedItems,
               COALESCE(SUM(i.issueTotal),0) AS issueTotal, COALESCE(SUM(i.issueClosed),0) AS issueClosed
        FROM machine_safety m
        LEFT JOIN (
            SELECT MachineID, SUM(Status='pass') AS passItems, SUM(Status<>'na') AS checkedItems
            FROM machine_safety_compliance GROUP BY MachineID
        ) c ON c.MachineID=m.id
        LEFT JOIN (
            SELECT MachineID, COUNT(*) AS issueTotal, SUM(Status='resolved') AS issueClosed
            FROM machine_safety_issues GROUP BY MachineID
        ) i ON i.MachineID=m.id
        WHERE m.Status IS NULL OR m.Status <> 'inactive'
        GROUP BY m.Department
    ");
    $ojtRows = safe_rows(
        'SELECT r.Department,r.OJTDate,r.NextReviewDate,r.AttendeeCount,r.YearlyTarget
           FROM ojt_records r
          WHERE r.id=(
              SELECT r2.id
                FROM ojt_records r2
               WHERE TRIM(r2.Department)=TRIM(r.Department)
               ORDER BY COALESCE(r2.UpdatedAt,r2.OJTDate) DESC,r2.id DESC
               LIMIT 1
          )'
    );
    $safetyCultureRows = safe_rows('SELECT Department, AVG(CompliancePct) AS pct FROM sc_ppeinspections WHERE YEAR(InspectionDate)=? AND deleted_at IS NULL GROUP BY Department', [$year]);
    $targetMatrix = activity_target_coverage_matrix_data($year, false);
    $targetByDept = [];
    foreach ($targetMatrix['rows'] as $row) {
        $dept = dashboard_department_key((string) ($row['department'] ?? ''));
        if ($dept === '') continue;
        if (!isset($targetByDept[$dept])) $targetByDept[$dept] = ['slots'=>0,'covered'=>0,'missing'=>0,'zero'=>0,'na'=>0,'scope'=>0,'override'=>0,'template'=>0];
        $targetByDept[$dept]['slots']++;
        if (!empty($row['isNA'])) $targetByDept[$dept]['na']++;
        elseif (($row['source'] ?? '') === 'missing') $targetByDept[$dept]['missing']++;
        elseif (!empty($row['isZero'])) $targetByDept[$dept]['zero']++;
        else $targetByDept[$dept]['covered']++;
        if (isset($targetByDept[$dept][$row['source'] ?? ''])) $targetByDept[$dept][$row['source']]++;
    }

    $employeeCount = dashboard_by_department($employeeRows, static function ($r) { return (int) ($r['total'] ?? 0); });
    $trainingStats = dashboard_by_department($trainingRows, static function ($r) {
        return [
            'value'=>percent($r['passed'] ?? 0, $r['total'] ?? 0),
            'numerator'=>(int)($r['passed'] ?? 0),
            'denominator'=>(int)($r['total'] ?? 0),
        ];
    });
    $training = [];
    foreach ($trainingStats as $key => $metric) $training[$key] = $metric['value'];
    $kyActual = dashboard_by_department($kyRows, static function ($r) { return (int) ($r['cnt'] ?? 0); });
    $hiyari = dashboard_by_department($hiyariRows, static function ($r) { return (int) ($r['submitted'] ?? 0); });
    $fourm = dashboard_by_department($fourmRows, static function ($r) { return percent($r['closed'] ?? 0, $r['total'] ?? 0); });
    $patrolIssueCounts = [];
    foreach ($patrolIssueRows as $issue) {
        foreach (dashboard_parse_array($issue['ResponsibleDept'] ?? '') as $department) {
            $key = dashboard_department_key((string) $department);
            if ($key === '') continue;
            if (!isset($patrolIssueCounts[$key])) $patrolIssueCounts[$key] = ['total' => 0, 'closed' => 0];
            $patrolIssueCounts[$key]['total']++;
            if (($issue['CurrentStatus'] ?? '') === 'Closed') $patrolIssueCounts[$key]['closed']++;
        }
    }
    $patrolIssues = [];
    foreach ($patrolIssueCounts as $key => $counts) {
        $patrolIssues[$key] = $counts['total'] > 0 ? percent($counts['closed'], $counts['total']) : 100;
    }
    $selectedCccfUnits = [];
    foreach (dashboard_parse_array($cccfUnitSetting['value'] ?? '') as $unit) {
        $key = dashboard_unit_key((string)$unit);
        if ($key !== '') $selectedCccfUnits[$key] = true;
    }
    $masterUnitDepartments = [];
    foreach ($masterUnitRows as $row) {
        $unit = dashboard_unit_key((string)($row['Unit'] ?? ''));
        $department = dashboard_department_key((string)($row['Department'] ?? ''));
        if ($unit !== '' && $department !== '') $masterUnitDepartments[$unit] = $department;
    }
    $cccfWorkerUnitActual = [];
    $cccfWorkerUnitDepartment = [];
    foreach ($cccfWorkerUnitRows as $row) {
        $unit = dashboard_unit_key((string)($row['Unit'] ?? ''));
        if ($unit === '') continue;
        $cccfWorkerUnitActual[$unit] = max(0, (int)($row['computedAchieved'] ?? 0));
        $department = dashboard_department_key((string)($row['Department'] ?? ''));
        if ($department !== '') $cccfWorkerUnitDepartment[$unit] = $department;
    }
    $cccfWorkerByUnit = [];
    foreach ($cccfUnitTargetRows as $row) {
        $unit = dashboard_unit_key((string)($row['Unit'] ?? ''));
        if ($unit === '' || ($selectedCccfUnits && !isset($selectedCccfUnits[$unit]))) continue;
        $department = $masterUnitDepartments[$unit] ?? ($cccfWorkerUnitDepartment[$unit] ?? '');
        $target = max(0, (int)($row['target'] ?? 0));
        if ($department === '' || $target <= 0) continue;
        $computed = $cccfWorkerUnitActual[$unit] ?? 0;
        $rawOverride = $row['achievedOverride'] ?? null;
        $hasOverride = $rawOverride !== null && $rawOverride !== '';
        $achieved = $cccfWorkerSource === 'actual_department_worker'
            ? $computed
            : ($hasOverride ? max(0, (int)$rawOverride) : $computed);
        if (!isset($cccfWorkerByUnit[$department])) {
            $cccfWorkerByUnit[$department] = [
                'numerator'=>0,
                'denominator'=>0,
                'units'=>0,
                'source'=>$cccfWorkerSource === 'actual_department_worker'
                    ? 'Distinct CCCF Worker submitters / shared Unit targets'
                    : 'CCCF manual Unit target/override',
            ];
        }
        $cccfWorkerByUnit[$department]['numerator'] += min($achieved, $target);
        $cccfWorkerByUnit[$department]['denominator'] += $target;
        $cccfWorkerByUnit[$department]['units']++;
    }
    foreach ($cccfWorkerByUnit as &$metric) {
        $metric['value'] = percent($metric['numerator'], $metric['denominator']);
    }
    unset($metric);
    $cccfAssigned = dashboard_by_department($cccfAssignmentRows, static function ($r) { return (int) ($r['assigned'] ?? 0); });
    $cccfPermanent = dashboard_by_department($cccfPermanentRows, static function ($r) { return (int) ($r['completed'] ?? 0); });
    $accidentStats = dashboard_by_department($accidentRows, static function ($r) {
        $total = (int)($r['total'] ?? 0);
        $closed = (int)($r['closed'] ?? 0);
        return ['value'=>$total > 0 ? percent($closed, $total) : 100,'numerator'=>$closed,'denominator'=>$total];
    });
    $accident = [];
    foreach ($accidentStats as $key => $metric) $accident[$key] = $metric['value'];
    $machine = dashboard_by_department($machineRows, static function ($r) {
        $machines = (int) ($r['machines'] ?? 0);
        if ($machines <= 0) {
            return null;
        }
        $checked = (int) ($r['checkedItems'] ?? 0);
        $compliancePct = $checked > 0 ? percent($r['passItems'] ?? 0, $checked) : 0;
        $issueTotal = (int) ($r['issueTotal'] ?? 0);
        $issuePct = $issueTotal > 0 ? percent($r['issueClosed'] ?? 0, $issueTotal) : 100;
        return (int) round(((int) $compliancePct + (int) $issuePct) / 2);
    });
    $ojtStats = dashboard_by_department($ojtRows, static function ($r) {
        if (empty($r['OJTDate'])) {
            return ['value'=>0,'numerator'=>0,'denominator'=>0,'overdue'=>false];
        }
        $target = (int) ($r['YearlyTarget'] ?? 0);
        $attendees = (int)($r['AttendeeCount'] ?? 0);
        $coverage = $target > 0 ? percent($attendees, $target) : 100;
        $next = (string) ($r['NextReviewDate'] ?? '');
        $overdue = $next !== '' && strtotime($next) !== false && strtotime($next) < strtotime(date('Y-m-d'));
        return [
            'value'=>$overdue ? min((int)$coverage, 50) : $coverage,
            'numerator'=>$attendees,
            'denominator'=>$target,
            'overdue'=>$overdue,
        ];
    });
    $ojt = [];
    foreach ($ojtStats as $key => $metric) $ojt[$key] = $metric['value'];
    $safetyCulture = dashboard_by_department($safetyCultureRows, static function ($r) {
        return is_numeric($r['pct'] ?? null) ? max(0, min(100, (int) round((float) $r['pct']))) : null;
    });

    $kyTargets = [];
    foreach ($kyConfigRows as $row) {
        $dept = dashboard_department_key((string) ($row['Department'] ?? ''));
        if ($dept === '') {
            continue;
        }
        $unitCount = max(1, count(dashboard_parse_array($row['SafetyUnits'] ?? '')));
        $kyTargets[$dept] = $unitCount * ((int) ($row['YearlyTarget'] ?? 12) ?: 12);
    }

    $yokotenConfig = [];
    foreach ($yokotenConfigRows as $row) {
        $yokotenConfig[(string)($row['ConfigKey'] ?? '')] = dashboard_parse_array($row['ConfigValue'] ?? '');
    }
    $yokotenPinnedUnits = [];
    foreach (($yokotenConfig['pinnedUnits'] ?? []) as $unit) {
        $key = dashboard_unit_key((string)$unit);
        if ($key !== '') $yokotenPinnedUnits[$key] = true;
    }
    $yokotenTopics = [];
    foreach ($yokotenTopicRows as $topic) {
        $targetUnits = array_map('dashboard_unit_key', dashboard_parse_array($topic['TargetUnits'] ?? ''));
        if (!$yokotenPinnedUnits || !$targetUnits || array_intersect_key(array_flip($targetUnits), $yokotenPinnedUnits)) {
            $yokotenTopics[] = $topic;
        }
    }
    $yokotenResponseSet = [];
    foreach ($yokotenResponseRows as $row) {
        $department = dashboard_department_key((string)($row['Department'] ?? ''));
        if ($department === '') continue;
        if ($yokotenPinnedUnits) {
            $responseUnits = array_map('dashboard_unit_key', dashboard_parse_array($row['EffectiveSafetyUnit'] ?? ''));
            if ($responseUnits && !array_intersect_key(array_flip($responseUnits), $yokotenPinnedUnits)) continue;
        }
        $yokotenResponseSet[$department.'::'.(string)($row['YokotenID'] ?? '')] = true;
    }
    $yokotenTargets = [];
    $yokotenDone = [];
    foreach ($yokotenTopics as $topic) {
        $targets = dashboard_parse_array($topic['TargetDepts'] ?? '');
        $targetKeys = [];
        foreach ($targets as $target) $targetKeys[dashboard_department_key((string)$target)] = true;
        $scoped = $targets
            ? array_values(array_filter($deptNames, static fn($dept) => isset($targetKeys[dashboard_department_key((string)$dept)])))
            : $deptNames;
        foreach ($scoped as $dept) {
            $deptKey = dashboard_department_key((string) $dept);
            if ($deptKey !== '') {
                $yokotenTargets[$deptKey] = ($yokotenTargets[$deptKey] ?? 0) + 1;
                if (isset($yokotenResponseSet[$deptKey.'::'.(string)($topic['YokotenID'] ?? '')])) {
                    $yokotenDone[$deptKey] = ($yokotenDone[$deptKey] ?? 0) + 1;
                }
            }
        }
    }

    $matrix = [];
    foreach ($deptNames as $dept) {
        $deptKey = dashboard_department_key((string) $dept);
        $empTotal = $employeeCount[$deptKey] ?? 0;
        $kyTarget = $kyTargets[$deptKey] ?? 12;
        $yokotenTarget = $yokotenTargets[$deptKey] ?? 0;
        $cccfAssignedTotal = $cccfAssigned[$deptKey] ?? 0;
        $targetMeta = $targetByDept[$deptKey] ?? ['slots'=>0,'covered'=>0,'missing'=>0,'zero'=>0,'na'=>0,'scope'=>0,'override'=>0,'template'=>0];
        $cccfWorkerMetric = $cccfWorkerByUnit[$deptKey] ?? null;
        $patrolMetric = $patrolIssueCounts[$deptKey] ?? ['total'=>0,'closed'=>0];
        $accidentMetric = $accidentStats[$deptKey] ?? ['numerator'=>0,'denominator'=>0];
        $ojtMetric = $ojtStats[$deptKey] ?? null;
        $trainingMetric = $trainingStats[$deptKey] ?? null;
        $cells = [
            'activityTargets' => $targetMeta['slots'] > 0 ? percent($targetMeta['covered'] + $targetMeta['na'], $targetMeta['slots']) : null,
            'cccfWorker' => $cccfWorkerMetric['value'] ?? null,
            'cccfPermanent' => $cccfAssignedTotal > 0 ? percent($cccfPermanent[$deptKey] ?? 0, $cccfAssignedTotal) : null,
            'patrolIssues' => $patrolIssues[$deptKey] ?? 100,
            'hiyari' => $empTotal > 0 ? percent($hiyari[$deptKey] ?? 0, $empTotal) : null,
            'ky' => percent($kyActual[$deptKey] ?? 0, $kyTarget),
            'yokoten' => $yokotenTarget > 0 ? percent($yokotenDone[$deptKey] ?? 0, $yokotenTarget) : null,
            'training' => $training[$deptKey] ?? null,
            'fourm' => $fourm[$deptKey] ?? null,
            'accident' => $accident[$deptKey] ?? 100,
            'machine' => $machine[$deptKey] ?? null,
            'ojt' => $ojt[$deptKey] ?? 0,
            'safetyCulture' => $safetyCulture[$deptKey] ?? null,
        ];
        $coverageMeta = [
            'activityTargets'=>['numerator'=>$targetMeta['covered']+$targetMeta['na'],'denominator'=>$targetMeta['slots'],'source'=>'Activity target configuration'],
            'cccfWorker'=>$cccfWorkerMetric,
            'cccfPermanent'=>['numerator'=>$cccfPermanent[$deptKey]??0,'denominator'=>$cccfAssignedTotal,'source'=>'Completed CCCF Permanent / current assignments'],
            'patrolIssues'=>['numerator'=>$patrolMetric['closed'],'denominator'=>$patrolMetric['total'],'source'=>$patrolMetric['total']?'Closed Patrol issues / issues found this year':'No Patrol issues found this year'],
            'hiyari'=>['numerator'=>$hiyari[$deptKey]??0,'denominator'=>$empTotal,'source'=>'Distinct Hiyari reporters / employees'],
            'ky'=>['numerator'=>$kyActual[$deptKey]??0,'denominator'=>$kyTarget,'source'=>'KY activities / configured Unit targets'],
            'yokoten'=>['numerator'=>$yokotenDone[$deptKey]??0,'denominator'=>$yokotenTarget,'source'=>'Responded / assigned Yokoten topics issued this year'],
            'training'=>$trainingMetric ? array_merge($trainingMetric,['source'=>'Passed / total Training department records']) : null,
            'accident'=>['numerator'=>$accidentMetric['numerator'],'denominator'=>$accidentMetric['denominator'],'source'=>$accidentMetric['denominator']?'Closed / reported accidents this year':'No accidents reported this year'],
            'ojt'=>$ojtMetric ? array_merge($ojtMetric,['source'=>'Current OJT attendee target and review date']) : null,
        ];
        $values = array_values(array_filter($cells, static function ($v) {
            return $v !== null;
        }));
        $score = $values ? (int) round(array_sum($values) / count($values)) : 0;
        $matrix[] = array_merge(['department'=>$dept,'score'=>$score,'targetMeta'=>$targetMeta,'coverageMeta'=>$coverageMeta], $cells);
    }
    usort($matrix, static function ($a, $b) {
        if ((int) $a['score'] === (int) $b['score']) {
            return strcmp((string) $a['department'], (string) $b['department']);
        }
        return (int) $a['score'] <=> (int) $b['score'];
    });
    return $matrix;
}

try {
    handle_foundation_routes($method, $path);
    handle_platform_routes($method, $path);
    handle_storage_routes($method, $path);
    handle_target_routes($method, $path);
    handle_people_routes($method, $path);
    handle_content_routes($method, $path);
    handle_training_routes($method, $path);
    handle_ojt_routes($method, $path);
    handle_patrol_routes($method, $path);
    handle_forklift_routes($method, $path);
    handle_accident_routes($method, $path);
    handle_machine_safety_routes($method, $path);
    handle_contractor_routes($method, $path);
    handle_safety_culture_routes($method, $path);
    handle_cccf_routes($method, $path);
    handle_hiyari_routes($method, $path);
    handle_ky_routes($method, $path);
    handle_yokoten_routes($method, $path);
    handle_fourm_routes($method, $path);
    handle_admin_phase8_routes($method, $path);
    handle_johnny_ai_routes($method, $path);

    if ($method === 'GET' && $path === '/public/branding') {
        $stmt = db()->prepare('SELECT value FROM app_settings WHERE key_name = ? LIMIT 1');
        $stmt->execute(['app_branding']);
        $branding = json_decode((string) ($stmt->fetchColumn() ?: '{}'), true);
        $branding = is_array($branding) ? $branding : [];
        json_response(['success' => true, 'data' => [
            'appName' => mb_substr((string) ($branding['appName'] ?? ''), 0, 80),
            'tagline' => mb_substr((string) ($branding['tagline'] ?? ''), 0, 80),
            'loginHeroTitle' => mb_substr((string) ($branding['loginHeroTitle'] ?? ''), 0, 140),
            'loginHeroSubtitle' => mb_substr((string) ($branding['loginHeroSubtitle'] ?? ''), 0, 180),
            'logoUrl' => mb_substr((string) ($branding['logoUrl'] ?? ''), 0, 1024),
        ]]);
    }

    if ($method === 'POST' && $path === '/login') {
        $body = json_body();
        $employeeId = trim((string) ($body['employeeId'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        if ($employeeId === '' || $password === '') {
            auth_audit_log('LOGIN_FAILED', $employeeId, 400, ['reason' => 'missing_credentials']);
            json_response(['success' => false, 'message' => 'กรุณากรอกรหัสพนักงานและรหัสผ่าน'], 400);
        }
        auth_check_login_limit($employeeId);
        ensure_auth_security_schema();
        $stmt = db()->prepare('SELECT * FROM employees WHERE EmployeeID = ? LIMIT 1');
        $stmt->execute([$employeeId]);
        $employee = $stmt->fetch();
        $valid = false;
        if ($employee) {
            if (!empty($employee['Password'])) {
                $valid = password_verify($password, (string) $employee['Password']);
            } else {
                $valid = hash_equals((string) $employee['EmployeeID'], $password);
                if ($valid) {
                    $hash = password_hash($password, PASSWORD_BCRYPT);
                    $update = db()->prepare('UPDATE employees SET Password = ?, MustChangePassword = 1 WHERE EmployeeID = ?');
                    $update->execute([$hash, $employeeId]);
                    $employee['MustChangePassword'] = 1;
                }
            }
        }
        if (!$employee || !$valid) {
            auth_record_login($employeeId, false);
            auth_audit_log('LOGIN_FAILED', $employeeId, 401, ['reason' => 'invalid_credentials']);
            json_response(['success' => false, 'message' => 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'], 401);
        }
        auth_record_login($employeeId, true);
        $user = user_data($employee);
        json_response(['success' => true, 'user' => $user, 'token' => jwt_sign($user)]);
    }

    if ($method === 'POST' && $path === '/session/verify') {
        $decoded = require_user();
        try {
            $employee = db_row(
                'SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,MustChangePassword FROM employees WHERE EmployeeID=? LIMIT 1',
                [(string)($decoded['id'] ?? $decoded['EmployeeID'] ?? '')]
            );
        } catch (Throwable $error) {
            $employee = null;
        }
        if (!$employee) {
            $failure = onboarding_unavailable_response();
            json_response($failure['payload'], $failure['httpStatus']);
        }
        $currentUser = user_data($employee);
        json_response([
            'success' => true,
            'status' => $decoded['onboardingStatus'],
            'onboardingStatus' => $decoded['onboardingStatus'],
            'user' => $currentUser,
            'token' => jwt_sign($currentUser),
        ]);
    }

    if ($method === 'GET' && $path === '/register/options') {
        $departments = safe_rows('SELECT id, Name FROM master_departments ORDER BY Name');
        $positions = safe_rows('SELECT id, Name FROM master_positions ORDER BY Name');
        $units = safe_rows('SELECT id, name, department_id FROM master_safetyunits ORDER BY sort_order, name');
        $emailRule = admin8_email_rule();
        json_response(['success' => true, 'data' => [
            'departments'=>$departments,
            'positions'=>$positions,
            'units'=>$units,
            'requiredEmailPositionIds'=>$emailRule['requiredPositionIds'],
            'companyEmailDomain'=>'@thaisummit-harness.co.th',
        ]]);
    }

    if ($method === 'GET' && $path === '/profile') {
        $user = require_user();
        $stmt = db()->prepare(
            'SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role FROM employees WHERE EmployeeID = ? LIMIT 1'
        );
        $stmt->execute([(string) ($user['id'] ?? '')]);
        $profile = $stmt->fetch();
        if (!$profile) {
            json_response(['success' => false, 'message' => 'ไม่พบข้อมูลผู้ใช้'], 404);
        }
        json_response(['success' => true, 'data' => $profile]);
    }

    if ($method === 'GET' && $path === '/master/departments') {
        require_user();
        json_response(['success' => true, 'data' => safe_rows('SELECT * FROM master_departments ORDER BY Name ASC')]);
    }

    if ($method === 'GET' && $path === '/dashboard/overview') {
        require_user();
        $year = (int) date('Y');
        $patrolSessions = safe_scalar('SELECT COUNT(DISTINCT DATE(PatrolDate)) FROM patrol_attendance WHERE YEAR(PatrolDate)=?', [$year]);
        $patrolAttended = safe_scalar('SELECT COUNT(*) FROM patrol_attendance WHERE YEAR(PatrolDate)=?', [$year]);
        $patrolOpenIssues = safe_scalar(
            "SELECT COUNT(*) FROM patrol_issues WHERE YEAR(DateFound)=? AND CurrentStatus NOT IN ('Closed')",
            [$year]
        );
        $cccfWorker = safe_scalar('SELECT COUNT(*) FROM cccf_forma_worker WHERE YEAR(SubmitDate)=?', [$year]);
        try {
            $cccfWorkerOverview = cccf_worker_progress_data($year, false);
        } catch (Throwable $e) {
            $cccfWorkerOverview = ['overall' => []];
        }
        $cccfWorkerActualTowardTarget = (int) ($cccfWorkerOverview['overall']['actualTowardTarget'] ?? $cccfWorker);
        $cccfWorkerRawRecords = (int) ($cccfWorkerOverview['overall']['rawRecords'] ?? $cccfWorker);
        $cccfAssigned = safe_scalar(
            "SELECT COUNT(DISTINCT a.EmployeeID)
               FROM cccf_assignments a
               JOIN employees e ON e.EmployeeID=a.EmployeeID
              WHERE a.EmployeeID IS NOT NULL AND TRIM(a.EmployeeID)<>''"
        );
        $cccfCompleted = safe_scalar(
            "SELECT COUNT(DISTINCT fa.AssigneeID)
             FROM cccf_forma_permanent fa
             JOIN cccf_assignments ca ON fa.AssigneeID = ca.EmployeeID
             JOIN employees e ON e.EmployeeID = ca.EmployeeID
             WHERE YEAR(fa.SubmitDate)=?
               AND (fa.ReviewStatus='Completed' OR (fa.ReviewStatus IS NULL AND fa.FileUrl IS NOT NULL))",
            [$year]
        );
        $yokotenTopics = safe_scalar(
            'SELECT COUNT(*) FROM yokotentopics
              WHERE IsActive=1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?)',
            [$year]
        );
        $yokotenResponded = safe_scalar(
            'SELECT COUNT(DISTINCT r.Department)
               FROM yokotenresponses r
               JOIN yokotentopics t ON t.YokotenID=r.YokotenID
              WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0)
                AND t.IsActive=1
                AND (t.DateIssued IS NULL OR YEAR(t.DateIssued)=?)',
            [$year]
        );
        $trainingTotal = safe_scalar('SELECT COALESCE(SUM(TotalEmp),0) FROM training_dept_records WHERE Year=?', [$year]);
        $trainingPassed = safe_scalar(
            'SELECT COALESCE(SUM(LEAST(GREATEST(COALESCE(PassedCount,0),0),GREATEST(COALESCE(TotalEmp,0),0))),0)
               FROM training_dept_records WHERE Year=?',
            [$year]
        );
        $hiyariOpen = safe_scalar(
            "SELECT COUNT(*) FROM hiyarireports
              WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL AND Status NOT IN ('Closed','closed')",
            [$year]
        );
        $hiyariYear = safe_scalar(
            'SELECT COUNT(*) FROM hiyarireports WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL',
            [$year]
        );
        $hiyariClosed = safe_scalar(
            "SELECT COUNT(*) FROM hiyarireports
              WHERE YEAR(ReportDate)=? AND DeletedAt IS NULL AND Status IN ('Closed','closed')",
            [$year]
        );
        $hiyariAssignmentTarget = safe_scalar('SELECT COUNT(*) FROM hiyari_assignments');
        $hiyariAssignmentClosed = safe_scalar(
            "SELECT COUNT(DISTINCT a.id)
               FROM hiyari_assignments a
               JOIN hiyarireports r
                 ON NULLIF(TRIM(r.ReporterID),'')=NULLIF(TRIM(a.EmployeeID),'')
              WHERE YEAR(r.ReportDate)=?
                AND r.DeletedAt IS NULL
                AND r.Status IN ('Closed','closed')",
            [$year]
        );
        $kyYear = safe_scalar('SELECT COUNT(*) FROM ky_activities WHERE YEAR(ActivityDate)=?', [$year]);
        $accidentYear = safe_scalar(
            'SELECT COUNT(*) FROM accident_reports
              WHERE YEAR(AccidentDate)=? AND (IsDeleted IS NULL OR IsDeleted=0)',
            [$year]
        );
        $recordable = safe_scalar(
            'SELECT COUNT(*) FROM accident_reports
              WHERE YEAR(AccidentDate)=? AND IsRecordable=1 AND (IsDeleted IS NULL OR IsDeleted=0)',
            [$year]
        );
        $fourmTotal = safe_scalar('SELECT COUNT(*) FROM fourm_changenotices WHERE YEAR(RequestDate)=?', [$year]);
        $fourmOpen = safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Open' AND YEAR(RequestDate)=?", [$year]);
        $fourmPending = safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Pending' AND YEAR(RequestDate)=?", [$year]);
        $fourmClosed = safe_scalar("SELECT COUNT(*) FROM fourm_changenotices WHERE Status='Closed' AND YEAR(RequestDate)=?", [$year]);
        $active = (int) ($fourmOpen ?? 0) + (int) ($fourmPending ?? 0);
        $fourmOverdue = safe_scalar(
            "SELECT COUNT(*) FROM fourm_changenotices
              WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(),RequestDate)>30
                AND YEAR(RequestDate)=?",
            [$year]
        );
        $fourmTrainingRequired = safe_scalar(
            'SELECT COUNT(*) FROM fourm_changenotices WHERE TrainingRequired=1 AND YEAR(RequestDate)=?',
            [$year]
        );
        $fourmMatrixCurriculums = safe_scalar(
            'SELECT COUNT(*) FROM fourm_curriculums WHERE IsActive=1 AND Year=?',
            [$year]
        );
        $fourmMatrixCourses = safe_scalar(
            'SELECT COUNT(*) FROM fourm_courses co
              JOIN fourm_curriculums cur ON cur.id=co.CurriculumID
             WHERE co.IsActive=1 AND cur.IsActive=1 AND cur.Year=?',
            [$year]
        );
        $fourmMatrixEmployees = safe_scalar(
            "SELECT COUNT(DISTINCT ce.EmployeeID) FROM fourm_curriculumemployees ce
              JOIN fourm_curriculums cur ON cur.id=ce.CurriculumID
             WHERE ce.Status='Assigned' AND cur.IsActive=1 AND cur.Year=?",
            [$year]
        );
        $fourmMatrixTransferred = safe_scalar(
            "SELECT COUNT(*) FROM fourm_curriculumemployees ce
              JOIN fourm_curriculums cur ON cur.id=ce.CurriculumID
             WHERE ce.Status='Transferred' AND cur.Year=?",
            [$year]
        );

        $kpiMetrics = safe_scalar('SELECT COUNT(*) FROM kpidata WHERE Year=?', [$year]);
        $kpiAnnouncements = safe_scalar('SELECT COUNT(*) FROM kpiannouncements WHERE IsCurrent=1');
        $policyTotal = safe_scalar('SELECT COUNT(*) FROM policies WHERE IsCurrent=1');
        $policyAcked = safe_scalar(
            'SELECT COUNT(DISTINCT pa.UserID) FROM policy_acknowledgements pa
              JOIN policies p ON p.id=pa.PolicyID WHERE p.IsCurrent=1'
        );
        $policyEligible = safe_scalar('SELECT COUNT(*) FROM employees');
        $committeeTotal = safe_scalar('SELECT COUNT(*) FROM committees WHERE IsCurrent=1');
        $machineTotal = safe_scalar("SELECT COUNT(*) FROM machine_safety WHERE Status IS NULL OR Status<>'inactive'");
        $machineOpenIssues = safe_scalar(
            "SELECT COUNT(*) FROM machine_safety_issues i
              JOIN machine_safety m ON m.id=i.MachineID
             WHERE i.Status='open' AND (m.Status IS NULL OR m.Status<>'inactive')"
        );
        $machineCritical = safe_scalar(
            "SELECT COUNT(*) FROM machine_safety
              WHERE RiskLevel IN ('high','critical') AND (Status IS NULL OR Status<>'inactive')"
        );
        $ojtRecords = safe_scalar('SELECT COUNT(*) FROM ojt_records WHERE YEAR(OJTDate)=?', [$year]);
        $ojtDocs = safe_scalar('SELECT COUNT(*) FROM scw_documents WHERE YEAR(UploadedAt)=?', [$year]);
        $contractorDocs = safe_scalar('SELECT COUNT(*) FROM contractor_documents');
        $contractorRecent = safe_scalar(
            'SELECT COUNT(*) FROM contractor_documents WHERE UploadedAt>=DATE_SUB(NOW(),INTERVAL 30 DAY)'
        );
        $safetyCultureYear = safe_scalar('SELECT COUNT(*) FROM sc_assessments WHERE AssessmentYear=?', [$year]);

        $patrolProgress = dashboard_patrol_company_progress($year);
        $kyProgress = dashboard_ky_company_progress($year);
        $yokotenProgress = dashboard_yokoten_company_progress($year);
        $machineComplianceState = dashboard_metric_row_state(
            "SELECT COALESCE(SUM(c.Status='pass'),0) numerator,
                    COALESCE(SUM(c.Status<>'na'),0) denominator
               FROM machine_safety m
               JOIN machine_safety_compliance c ON c.MachineID=m.id
              WHERE m.Status IS NULL OR m.Status<>'inactive'"
        );
        $ojtProgressState = dashboard_metric_row_state(
            'SELECT COALESCE(SUM(LEAST(GREATEST(COALESCE(AttendeeCount,0),0),
                                           GREATEST(COALESCE(YearlyTarget,0),0))),0) numerator,
                    COALESCE(SUM(GREATEST(COALESCE(YearlyTarget,0),0)),0) denominator,
                    COUNT(*) records,
                    COALESCE(SUM(NextReviewDate IS NOT NULL AND NextReviewDate<CURDATE()),0) overdue
               FROM ojt_records WHERE YEAR(OJTDate)=?',
            [$year]
        );
        $safetyCultureProgressState = dashboard_metric_row_state(
            'SELECT COUNT(*) assessments,
                    COALESCE(SUM(COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+
                                 COALESCE(T3_Score,0)+COALESCE(T4_Score,0)+
                                 COALESCE(T5_Score,0)+COALESCE(T7_Score,0)),0) numerator,
                    COALESCE(SUM((T1_Score IS NOT NULL)+(T2_Score IS NOT NULL)+
                                 (T3_Score IS NOT NULL)+(T4_Score IS NOT NULL)+
                                 (T5_Score IS NOT NULL)+(T7_Score IS NOT NULL)),0)*100 denominator,
                    (SELECT AVG(CompliancePct) FROM sc_ppeinspections
                      WHERE YEAR(InspectionDate)=? AND deleted_at IS NULL) ppePct
               FROM sc_assessments WHERE AssessmentYear=?',
            [$year, $year]
        );

        $asOf = gmdate('c');
        $scope = ['year' => $year];
        $machineNumerator = (float) ($machineComplianceState['row']['numerator'] ?? 0);
        $machineDenominator = (float) ($machineComplianceState['row']['denominator'] ?? 0);
        $ojtNumerator = (float) ($ojtProgressState['row']['numerator'] ?? 0);
        $ojtDenominator = (float) ($ojtProgressState['row']['denominator'] ?? 0);
        $ojtOverdue = (int) ($ojtProgressState['row']['overdue'] ?? 0);
        $safetyCultureNumerator = (float) ($safetyCultureProgressState['row']['numerator'] ?? 0);
        $safetyCultureDenominator = (float) ($safetyCultureProgressState['row']['denominator'] ?? 0);
        $safetyCulturePpePct = isset($safetyCultureProgressState['row']['ppePct'])
            ? (float) $safetyCultureProgressState['row']['ppePct']
            : null;

        $moduleMetrics = [
            'patrol' => dashboard_metric_create('patrol', [
                'numerator'=>$patrolProgress['numerator'],
                'denominator'=>$patrolProgress['denominator'],
                'unit'=>'attendance_slots',
                'scope'=>array_merge($scope, ['window'=>'year_to_date','elapsedMonths'=>$patrolProgress['elapsedMonths']]),
                'dataAvailable'=>$patrolProgress['available'],
                'unavailableReason'=>$patrolProgress['error'] ?? null,
                'sourceDescription'=>'Completed eligible attendance slots / roster attendance slots due year-to-date.',
                'asOf'=>$asOf,
            ]),
            'hiyari' => dashboard_metric_create('hiyari', [
                'numerator'=>$hiyariAssignmentClosed,
                'denominator'=>$hiyariAssignmentTarget,
                'unit'=>'employees',
                'scope'=>$scope,
                'dataAvailable'=>$hiyariAssignmentClosed !== null && $hiyariAssignmentTarget !== null,
                'sourceDescription'=>'Distinct assigned employees with a closed current-year report / current Admin Hiyari assignments.',
                'asOf'=>$asOf,
            ]),
            'ky' => dashboard_metric_create('ky', [
                'numerator'=>$kyProgress['numerator'],'denominator'=>$kyProgress['denominator'],'unit'=>'activities',
                'scope'=>array_merge($scope, ['configuredScopes'=>$kyProgress['configuredScopes']]),
                'dataAvailable'=>$kyProgress['available'],'unavailableReason'=>$kyProgress['error'] ?? null,
                'sourceDescription'=>'Eligible activities in configured Department and Safety Unit scopes / active configured yearly targets.',
                'asOf'=>$asOf,
            ]),
            'cccf' => dashboard_metric_create('cccf', [
                'numerator'=>$cccfCompleted,'denominator'=>$cccfAssigned,'unit'=>'employees','scope'=>$scope,
                'dataAvailable'=>$cccfCompleted !== null && $cccfAssigned !== null,
                'sourceDescription'=>'Distinct valid current-year permanent Form A completions / distinct current employee assignments.',
                'asOf'=>$asOf,
            ]),
            'yokoten' => dashboard_metric_create('yokoten', [
                'numerator'=>$yokotenProgress['numerator'],'denominator'=>$yokotenProgress['denominator'],
                'unit'=>'department_topic_pairs','scope'=>array_merge($scope, ['topics'=>$yokotenProgress['topics']]),
                'dataAvailable'=>$yokotenProgress['available'],'unavailableReason'=>$yokotenProgress['error'] ?? null,
                'sourceDescription'=>'Valid Department-topic response pairs / assigned Department-topic pairs for active topics issued in the year.',
                'asOf'=>$asOf,
            ]),
            'training' => dashboard_metric_create('training', [
                'numerator'=>$trainingPassed,'denominator'=>$trainingTotal,'unit'=>'employees','scope'=>$scope,
                'dataAvailable'=>$trainingPassed !== null && $trainingTotal !== null,
                'sourceDescription'=>'Capped passed employee count / total employee count in current-year training records.',
                'asOf'=>$asOf,
            ]),
            'accident' => dashboard_metric_create('accident', [
                'numerator'=>$recordable,'value'=>$recordable,'unit'=>'recordable_incidents','scope'=>$scope,
                'dataAvailable'=>$recordable !== null,
                'status'=>(int) ($recordable ?? 0) === 0 ? 'ON_TRACK' : 'CRITICAL',
                'statusReason'=>(int) ($recordable ?? 0) === 0
                    ? 'No recordable incidents in the current year.'
                    : $recordable . ' recordable incident(s) in the current year.',
                'sourceDescription'=>'Count of non-deleted recordable accident reports in the current year.',
                'asOf'=>$asOf,
            ]),
            'fourm' => dashboard_metric_create('fourm', [
                'numerator'=>$fourmClosed,'denominator'=>$fourmTotal,'unit'=>'change_notices','scope'=>$scope,
                'dataAvailable'=>$fourmClosed !== null && $fourmTotal !== null,
                'sourceDescription'=>'Closed change notices / all change notices requested in the current year.',
                'asOf'=>$asOf,
            ]),
            'kpi' => dashboard_metric_create('kpi', [
                'numerator'=>$kpiMetrics,'value'=>$kpiMetrics,'unit'=>'metrics','scope'=>$scope,
                'dataAvailable'=>$kpiMetrics !== null,
                'sourceDescription'=>'Count of KPI metric rows configured for the current year.','asOf'=>$asOf,
            ]),
            'policy' => dashboard_metric_create('policy', [
                'numerator'=>$policyAcked,'denominator'=>(int) ($policyTotal ?? 0) > 0 ? $policyEligible : 0,
                'unit'=>'employees','scope'=>array_merge($scope, ['currentPolicies'=>(int) ($policyTotal ?? 0)]),
                'dataAvailable'=>$policyTotal !== null && $policyAcked !== null && $policyEligible !== null,
                'zeroDenominatorReason'=>(int) ($policyTotal ?? 0) > 0
                    ? 'No eligible employees are present.'
                    : 'No current safety policy is configured.',
                'sourceDescription'=>'Distinct employees acknowledging the current policy / all employees eligible to acknowledge it.',
                'asOf'=>$asOf,
            ]),
            'committee' => dashboard_metric_create('committee', [
                'numerator'=>$committeeTotal,'value'=>$committeeTotal,'unit'=>'committees','scope'=>$scope,
                'dataAvailable'=>$committeeTotal !== null,'sourceDescription'=>'Count of current committee records.','asOf'=>$asOf,
            ]),
            'machine-safety' => dashboard_metric_create('machine-safety', [
                'numerator'=>$machineNumerator,'denominator'=>$machineDenominator,'unit'=>'compliance_items','scope'=>$scope,
                'dataAvailable'=>$machineComplianceState['available'],'unavailableReason'=>$machineComplianceState['error'] ?? null,
                'sourceDescription'=>'Passed applicable compliance items / checked applicable compliance items on active machines.',
                'asOf'=>$asOf,
            ]),
            'ojt' => dashboard_metric_create('ojt', [
                'numerator'=>$ojtNumerator,'denominator'=>$ojtDenominator,'unit'=>'attendees','scope'=>$scope,
                'dataAvailable'=>$ojtProgressState['available'],'unavailableReason'=>$ojtProgressState['error'] ?? null,
                'sourceDescription'=>'Capped attendee counts / configured yearly attendee targets in current-year OJT records.',
                'asOf'=>$asOf,
            ]),
            'contractor' => dashboard_metric_create('contractor', [
                'numerator'=>$contractorDocs,'value'=>$contractorDocs,'unit'=>'documents','scope'=>$scope,
                'dataAvailable'=>$contractorDocs !== null,'sourceDescription'=>'Count of contractor and supplier documents.',
                'asOf'=>$asOf,
            ]),
            'safety-culture' => dashboard_metric_create('safety-culture', [
                'numerator'=>$safetyCultureNumerator,'denominator'=>$safetyCultureDenominator,
                'unit'=>'assessment_score_points',
                'scope'=>array_merge($scope, ['ppeCompliancePercent'=>$safetyCulturePpePct]),
                'dataAvailable'=>$safetyCultureProgressState['available'],
                'unavailableReason'=>$safetyCultureProgressState['error'] ?? null,
                'sourceDescription'=>'Sum of entered safety-culture topic scores / maximum points for those entered topics.',
                'asOf'=>$asOf,
            ]),
        ];

        $config = dashboard_config();
        $positive = array_values(array_filter([
            $moduleMetrics['patrol']['percent'],
            $moduleMetrics['cccf']['percent'],
            $moduleMetrics['yokoten']['percent'],
            $moduleMetrics['training']['percent'],
        ], static function ($value) {
            return $value !== null;
        }));
        $base = $positive ? (int) round(array_sum($positive) / count($positive)) : 70;
        $penalty = min((int) ($recordable ?? 0) * 15, 30)
            + min((int) ($hiyariOpen ?? 0) * 2, 18)
            + min($active * 2, 15)
            + min((int) ($patrolOpenIssues ?? 0), 15);
        $score = max(0, min(100, $base - $penalty));
        $status = $score >= $config['healthGreen'] ? 'Good' : ($score >= $config['healthAmber'] ? 'Watch' : 'Critical');
        $complianceMatrix = dashboard_compliance_matrix($year, $config);
        json_response(['success' => true, 'data' => [
            'year' => $year, 'config' => $config,
            'moduleMetrics' => $moduleMetrics,
            'healthIndex' => ['score' => $score, 'status' => $status, 'base' => $base, 'penalty' => $penalty, 'thresholds' => ['green' => $config['healthGreen'], 'amber' => $config['healthAmber']]],
            'complianceMatrix' => $complianceMatrix,
            'patrol' => [
                'sessions'=>$patrolSessions,
                'attended'=>$patrolAttended,
                'required'=>$moduleMetrics['patrol']['denominator'],
                'completed'=>$moduleMetrics['patrol']['numerator'],
                'openIssues'=>$patrolOpenIssues,
                'rate'=>$moduleMetrics['patrol']['percent'],
            ],
            'cccf' => [
                'workerYear'=>$cccfWorkerActualTowardTarget,
                'workerRawRecords'=>$cccfWorkerRawRecords,
                'workerCalculation'=>'cccf_worker_progress_engine_actual_toward_target',
                'assigned'=>$cccfAssigned,
                'completed'=>$cccfCompleted,
                'permPct'=>$moduleMetrics['cccf']['percent'],
            ],
            'yokoten' => [
                'topics'=>$yokotenTopics,
                'responded'=>$yokotenResponded,
                'respondedPairs'=>$moduleMetrics['yokoten']['numerator'],
                'assignedPairs'=>$moduleMetrics['yokoten']['denominator'],
                'pct'=>$moduleMetrics['yokoten']['percent'],
            ],
            'training' => ['totalEmp'=>$trainingTotal,'passed'=>$trainingPassed,'passRate'=>$moduleMetrics['training']['percent']],
            'hiyari' => [
                'open'=>$hiyariOpen,'year'=>$hiyariYear,'closed'=>$hiyariClosed,
                'assignmentTarget'=>$moduleMetrics['hiyari']['denominator'],
                'assignmentClosed'=>$moduleMetrics['hiyari']['numerator'],
                'assignmentRemaining'=>max(
                    0,
                    (int) ($moduleMetrics['hiyari']['denominator'] ?? 0)
                    - (int) ($moduleMetrics['hiyari']['numerator'] ?? 0)
                ),
                'closureRate'=>$moduleMetrics['hiyari']['percent'],
            ],
            'ky' => ['year'=>$kyYear,'target'=>$moduleMetrics['ky']['denominator'],'pct'=>$moduleMetrics['ky']['percent']],
            'accident' => ['year'=>$accidentYear,'recordable'=>$recordable,'metricStatus'=>$moduleMetrics['accident']['status']],
            'fourm' => [
                'total'=>$fourmTotal,'open'=>$fourmOpen,'pending'=>$fourmPending,'closed'=>$fourmClosed,
                'active'=>$active,'overdue'=>$fourmOverdue,'trainingRequired'=>$fourmTrainingRequired,
                'closureRate'=>$moduleMetrics['fourm']['percent'],
                'matrix'=>[
                    'curriculums'=>$fourmMatrixCurriculums,
                    'courses'=>$fourmMatrixCourses,
                    'employees'=>$fourmMatrixEmployees,
                    'transferred'=>$fourmMatrixTransferred,
                ],
            ],
            'safetyCulture' => [
                'year'=>$safetyCultureYear,
                'pct'=>$moduleMetrics['safety-culture']['percent'],
                'ppePct'=>$safetyCulturePpePct,
            ],
            'kpi' => ['metrics'=>$kpiMetrics,'announcements'=>$kpiAnnouncements],
            'policy' => [
                'total'=>$policyTotal,'acknowledged'=>$policyAcked,'eligible'=>$policyEligible,
                'pct'=>$moduleMetrics['policy']['percent'],
            ],
            'committee' => ['total'=>$committeeTotal],
            'machineSafety' => [
                'total'=>$machineTotal,'openIssues'=>$machineOpenIssues,'critical'=>$machineCritical,
                'passed'=>$machineNumerator,'applicable'=>$machineDenominator,
                'pct'=>$moduleMetrics['machine-safety']['percent'],
            ],
            'ojt' => [
                'records'=>$ojtRecords,'docs'=>$ojtDocs,'completed'=>$ojtNumerator,
                'target'=>$ojtDenominator,'overdue'=>$ojtOverdue,'pct'=>$moduleMetrics['ojt']['percent'],
            ],
            'contractor' => ['docs'=>$contractorDocs,'recent'=>$contractorRecent],
        ]]);
    }

    if ($method === 'GET' && $path === '/dashboard/alerts') {
        require_user();
        $dashboardConfig = dashboard_config();
        $dueSoonDays = (int) ($dashboardConfig['alertDueSoonDays'] ?? 7);
        json_response(['success' => true, 'data' => [
            'overdueAccident' => safe_rows(
                "SELECT id, AccidentDate, AccidentType, Department, DueDate
                 FROM accident_reports
                 WHERE DueDate IS NOT NULL AND DueDate < CURDATE()
                   AND Status != 'Closed' AND (IsDeleted IS NULL OR IsDeleted = 0)
                 ORDER BY DueDate ASC LIMIT 10"
            ),
            'dueSoonAccident' => safe_rows(
                "SELECT id, AccidentDate, AccidentType, Department, DueDate
                 FROM accident_reports
                 WHERE DueDate IS NOT NULL AND DueDate >= CURDATE()
                   AND DueDate <= DATE_ADD(CURDATE(), INTERVAL " . $dueSoonDays . " DAY)
                   AND Status != 'Closed' AND (IsDeleted IS NULL OR IsDeleted = 0)
                 ORDER BY DueDate ASC LIMIT 10"
            ),
            'machineOverdue' => safe_rows(
                "SELECT MachineID, MachineName, Department, NextInspectionDate
                 FROM machine_safety
                 WHERE NextInspectionDate IS NOT NULL AND NextInspectionDate < CURDATE()
                   AND (Status IS NULL OR Status NOT IN ('inactive'))
                 ORDER BY NextInspectionDate ASC LIMIT 10"
            ),
            'yokotenOverdue' => safe_rows(
                "SELECT t.YokotenID, t.Title, t.Deadline, COUNT(r.ResponseID) AS respondedCount
                 FROM yokotentopics t
                 LEFT JOIN yokotenresponses r ON r.YokotenID = t.YokotenID
                   AND (r.IsDeleted IS NULL OR r.IsDeleted = 0)
                 WHERE t.Deadline IS NOT NULL AND t.Deadline < CURDATE() AND t.IsActive = 1
                 GROUP BY t.YokotenID, t.Title, t.Deadline
                 ORDER BY t.Deadline ASC LIMIT 10"
            ),
            'openPatrolIssues' => safe_rows(
                "SELECT id, DateFound, Area, HazardType, ResponsibleDept, `Rank`
                 FROM patrol_issues WHERE CurrentStatus NOT IN ('Closed')
                 ORDER BY DateFound ASC LIMIT 10"
            ),
            'fourmOverdue' => safe_rows(
                "SELECT id, NoticeNo, Title, ResponsiblePerson, Department, RequestDate, Status
                 FROM fourm_changenotices
                 WHERE Status IN ('Open','Pending') AND DATEDIFF(CURDATE(), RequestDate) > 30
                 ORDER BY RequestDate ASC LIMIT 10"
            ),
            'fourmTrainingRequired' => safe_rows(
                "SELECT id, NoticeNo, Title, ResponsiblePerson, Department, RequestDate, Status
                 FROM fourm_changenotices
                 WHERE TrainingRequired = 1 AND Status IN ('Open','Pending')
                 ORDER BY RequestDate ASC LIMIT 10"
            ),
            'dueSoonDays' => $dueSoonDays,
        ]]);
    }

    json_response(['success' => false, 'message' => 'PHP compatibility endpoint is not implemented yet', 'path' => $path], 501);
} catch (Throwable $error) {
    error_log('[php-api] ' . $method . ' ' . $path . ': ' . $error->getMessage());
    if ($method === 'GET' && $path === '/public/branding') {
        json_response(['success' => true, 'data' => []]);
    }
    json_response(['success' => false, 'message' => 'เกิดข้อผิดพลาดในการเชื่อมต่อ API'], 500);
}
