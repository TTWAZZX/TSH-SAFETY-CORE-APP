<?php
declare(strict_types=1);

function patrol_week(string $date): int
{
    return (int) (new DateTime($date))->format('W');
}

function patrol_year(): int
{
    return (int) date('Y');
}

function patrol_month(): int
{
    return (int) date('n');
}

function patrol_parse_year($value): ?int
{
    $year = (int) $value;
    $current = (int) date('Y');
    return $year >= 2000 && $year <= $current + 2 ? $year : null;
}

function patrol_parse_month($value): ?int
{
    $month = (int) $value;
    return $month >= 1 && $month <= 12 ? $month : null;
}

function patrol_query_year(): int
{
    return patrol_parse_year($_GET['year'] ?? null) ?? patrol_year();
}

function patrol_query_month(): int
{
    return patrol_parse_month($_GET['month'] ?? null) ?? patrol_month();
}

function patrol_validate_ym($year, $month = null, bool $requireMonth = true): array
{
    $parsedYear = patrol_parse_year($year);
    if ($parsedYear === null) {
        json_response(['success' => false, 'message' => 'year is invalid.'], 400);
    }
    if (!$requireMonth) {
        return [$parsedYear, null];
    }
    $parsedMonth = patrol_parse_month($month);
    if ($parsedMonth === null) {
        json_response(['success' => false, 'message' => 'month must be between 1 and 12.'], 400);
    }
    return [$parsedYear, $parsedMonth];
}

function patrol_user_name(array $user): string
{
    return trim((string) ($user['name'] ?? $user['id'] ?? '')) ?: 'System';
}

function patrol_is_admin(array $user): bool
{
    return strcasecmp((string) ($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0;
}

function patrol_can_view_roster_attendance_detail(string $employeeId, string $group): bool
{
    if (!in_array($group, ['top_management', 'supervisor'], true)) {
        return false;
    }
    return (bool) db_row('SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup=? LIMIT 1', [$employeeId, $group]);
}

function patrol_is_list_array(array $items): bool
{
    $expected = 0;
    foreach ($items as $key => $_) {
        if ($key !== $expected) {
            return false;
        }
        $expected++;
    }
    return true;
}

function patrol_uuid_v4(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function patrol_wednesdays(int $year, int $month): array
{
    $date = new DateTime(sprintf('%04d-%02d-01', $year, $month));
    while ((int) $date->format('N') !== 3) {
        $date->modify('+1 day');
    }
    $out = [];
    while ((int) $date->format('n') === $month) {
        $out[] = $date->format('Y-m-d');
        $date->modify('+7 days');
    }
    return $out;
}

function patrol_allowed_type($value): string
{
    $type = (string) $value;
    return in_array($type, ['normal', 'compensation', 'Re-inspection'], true) ? $type : 'normal';
}

function patrol_self_checkin_type($value): ?string
{
    $type = (string) $value;
    return in_array($type, ['normal', 'compensation'], true) ? $type : null;
}

function patrol_valid_date($value): ?string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return null;
    }
    $date = DateTime::createFromFormat('!Y-m-d', substr($raw, 0, 10));
    return $date && $date->format('Y-m-d') === substr($raw, 0, 10) ? $date->format('Y-m-d') : null;
}

function patrol_allowed_session_status($value): ?string
{
    $status = trim((string) $value);
    return in_array($status, ['Pending', 'Completed', 'Missed', 'Cancelled'], true) ? $status : null;
}

function patrol_store_optional_upload(string $field, array &$stored): ?string
{
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ((int) ($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'message' => 'Upload failed.'], 400);
    }
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > 10 * 1024 * 1024) {
        json_response(['success' => false, 'message' => 'Uploaded image is too large.'], 400);
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    $mime = function_exists('finfo_open') ? (string) finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp) : (string) ($file['type'] ?? '');
    $allowed = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'image/gif' => ['gif'],
    ];
    $ext = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    if (!isset($allowed[$mime]) || !in_array($ext, $allowed[$mime], true)) {
        json_response(['success' => false, 'message' => 'Unsupported image type: ' . $mime], 400);
    }
    $storedName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
    $target = upload_dir() . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file($tmp, $target)) {
        json_response(['success' => false, 'message' => 'Cannot store uploaded image.'], 500);
    }
    $url = upload_public_url($storedName, (string) ($file['name'] ?? $storedName));
    $stored[] = $url;
    return $url;
}

function patrol_cleanup_urls(array $urls): void
{
    foreach ($urls as $url) {
        delete_uploaded_file($url);
    }
}

function patrol_validate_issue(array $data): ?string
{
    $action = (string) ($data['ActionType'] ?? '');
    if (!in_array($action, ['OPEN', 'TEMP', 'CLOSE', 'UPDATE'], true)) return 'ActionType is invalid.';
    if (in_array($action, ['TEMP', 'CLOSE', 'UPDATE'], true) && empty($data['IssueID'])) return 'IssueID is required.';
    if ($action === 'OPEN') {
        if (empty($data['DateFound'])) return 'DateFound is required.';
        if (empty($data['Area'])) return 'Area is required.';
        if (empty($data['HazardType'])) return 'HazardType is required.';
        if (empty($data['HazardDescription'])) return 'HazardDescription is required.';
    }
    if ($action === 'TEMP' && trim((string) ($data['TempDescription'] ?? '')) === '') return 'TempDescription is required.';
    if ($action === 'CLOSE') {
        if (trim((string) ($data['ActionDescription'] ?? '')) === '') return 'ActionDescription is required.';
        if (empty($data['FinishDate'])) return 'FinishDate is required.';
    }
    return null;
}

function ensure_patrol_schema(): void
{
    foreach ([
        'ALTER TABLE patrol_attendance ADD COLUMN Notes TEXT DEFAULT NULL',
        'ALTER TABLE patrol_attendance ADD COLUMN Area VARCHAR(200) DEFAULT NULL',
        'ALTER TABLE patrol_attendance ADD COLUMN PatrolType VARCHAR(20) DEFAULT NULL',
        'ALTER TABLE patrol_attendance ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_attendance ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_attendance ADD INDEX idx_patrol_attendance_session (ScheduledSessionID)',
        'ALTER TABLE patrol_self_checkin ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_self_checkin ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_self_checkin ADD INDEX idx_patrol_self_checkin_session (ScheduledSessionID)',
        'ALTER TABLE patrol_issues ADD COLUMN ReporterID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE employees ADD COLUMN CompanyEmail VARCHAR(150) DEFAULT NULL',
        'ALTER TABLE patrol_team_members MODIFY COLUMN PatrolType VARCHAR(20) NOT NULL',
        'ALTER TABLE patrol_team_rotation ADD COLUMN PatrolRound TINYINT NOT NULL DEFAULT 0',
        'ALTER TABLE patrol_team_rotation MODIFY COLUMN AreaID INT DEFAULT NULL',
        'ALTER TABLE master_positions ADD COLUMN PatrolPassPct INT DEFAULT 80',
    ] as $sql) {
        try { db()->exec($sql); } catch (Throwable $e) {}
    }
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_roster (
        id INT AUTO_INCREMENT PRIMARY KEY,
        EmployeeID VARCHAR(50) NOT NULL,
        RosterGroup VARCHAR(20) NOT NULL,
        TargetPerYear INT NOT NULL DEFAULT 12,
        SortOrder INT DEFAULT 99,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_emp_group(EmployeeID,RosterGroup)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_self_checkin (
        id INT AUTO_INCREMENT PRIMARY KEY,
        EmployeeID VARCHAR(50) NOT NULL,
        CheckinDate DATE NOT NULL,
        Location VARCHAR(255) DEFAULT NULL,
        Notes TEXT DEFAULT NULL,
        Year INT NOT NULL,
        Month INT NOT NULL,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_emp_year(EmployeeID,Year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_emailoutbox (
        id INT AUTO_INCREMENT PRIMARY KEY,
        AttendanceID INT DEFAULT NULL,
        EmployeeID VARCHAR(50) DEFAULT NULL,
        EventType VARCHAR(50) NOT NULL DEFAULT 'CheckInRecorded',
        Recipients TEXT NOT NULL,
        Subject VARCHAR(255) NOT NULL,
        Body MEDIUMTEXT,
        HtmlBody MEDIUMTEXT,
        Status VARCHAR(30) NOT NULL DEFAULT 'Queued',
        Error TEXT,
        SentAt DATETIME DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_attendance(AttendanceID),
        KEY idx_employee(EmployeeID),
        KEY idx_status(Status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    try {
        db()->exec('ALTER TABLE patrol_team_rotation DROP INDEX uq_team_yr_mo');
    } catch (Throwable $e) {}
    try {
        db()->exec('ALTER TABLE patrol_team_rotation ADD UNIQUE KEY uq_team_yr_mo_rnd (TeamID,Year,Month,PatrolRound)');
    } catch (Throwable $e) {}
}

function patrol_cutoff_date(int $year): string
{
    $currentYear = (int) date('Y');
    if ($year < $currentYear) return sprintf('%04d-12-31', $year);
    if ($year > $currentYear) return sprintf('%04d-01-01', $year);
    return date('Y-m-d');
}

function patrol_due_month(int $year): int
{
    $currentYear = (int) date('Y');
    if ($year < $currentYear) return 12;
    if ($year > $currentYear) return 0;
    return (int) date('n');
}

function patrol_pct(int $done, int $target): int
{
    return $target > 0 ? min(100, (int) round($done * 100 / $target)) : 0;
}

function patrol_supervisor_monthly_requirement(): int
{
    return 2;
}

function patrol_activity_target_for_employee(string $employeeId, array $employee, string $activityKey = 'patrol'): ?array
{
    try {
        $position = trim((string) ($employee['Position'] ?? ''));
        $department = trim((string) ($employee['Department'] ?? ''));
        $unit = trim((string) ($employee['Unit'] ?? ''));

        $row = db_row(
            'SELECT YearlyTarget,PassPct,IsNA FROM employee_activity_targets WHERE EmployeeID=? AND ActivityKey=? LIMIT 1',
            [$employeeId, $activityKey]
        );
        $source = 'override';
        if (!$row && $department !== '') {
            $row = db_row(
                "SELECT YearlyTarget,PassPct,IsNA,Department,Unit
                   FROM activity_scope_overrides
                  WHERE Department=? AND (Unit=? OR Unit='')
                    AND ActivityKey=?
                  ORDER BY CASE WHEN Unit=? THEN 0 ELSE 1 END
                  LIMIT 1",
                [$department, $unit, $activityKey, $unit]
            );
            $source = 'scope';
        }
        if (!$row && $position !== '') {
            $row = db_row(
                'SELECT YearlyTarget,PassPct,IsNA FROM activity_position_templates WHERE PositionName=? AND ActivityKey=? LIMIT 1',
                [$position, $activityKey]
            );
            $source = 'template';
        }
        if (!$row || !empty($row['IsNA'])) return null;
        $target = (int) ($row['YearlyTarget'] ?? 0);
        if ($target < 1) return null;
        return ['yearlyTarget' => $target, 'passPct' => (int) ($row['PassPct'] ?? 80), 'source' => $source];
    } catch (Throwable $e) {
        return null;
    }
}

function patrol_monthly_required_from_yearly_target(int $yearlyTarget, int $month): int
{
    if ($yearlyTarget < 1 || $month < 1 || $month > 12) return 0;
    $current = (int) ceil($yearlyTarget * $month / 12);
    $previous = (int) ceil($yearlyTarget * ($month - 1) / 12);
    return max(0, $current - $previous);
}

function patrol_current_monthly_requirement(int $year, int $yearlyTarget): int
{
    $month = max(1, min(12, patrol_due_month($year) ?: 1));
    return patrol_monthly_required_from_yearly_target($yearlyTarget, $month);
}

function patrol_supervisor_requirement_from_schedule_count(int $count): int
{
    return $count > 0 ? (int) ceil($count / 2) : 0;
}

function patrol_top_sessions(string $employeeId, int $year): array
{
    $base = db_row('SELECT TeamID,PatrolType FROM patrol_team_members WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$base) return [];
    $rotations = db_rows('SELECT Month,TeamID FROM patrol_member_rotation WHERE EmployeeID=? AND Year=?', [$employeeId, $year]);
    $rotMap = [];
    foreach ($rotations as $r) $rotMap[(int) $r['Month']] = (int) $r['TeamID'];
    $teamIds = array_values(array_filter(array_unique(array_merge([(int) $base['TeamID']], array_values($rotMap)))));
    if (!$teamIds) return [];
    $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
    $params = array_merge([$year], $teamIds);
    $rows = db_rows("SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode FROM patrol_sessions s LEFT JOIN patrol_teams t ON t.id=s.TeamID LEFT JOIN patrol_areas a ON a.id=s.AreaID WHERE YEAR(s.PatrolDate)=? AND s.TeamID IN ($placeholders) ORDER BY s.PatrolDate,s.PatrolRound", $params);
    $sessions = [];
    foreach ($rows as $s) {
        $date = substr((string) $s['PatrolDate'], 0, 10);
        $month = (int) substr($date, 5, 2);
        $effectiveTeam = $rotMap[$month] ?? (int) $base['TeamID'];
        if ((int) $s['TeamID'] !== $effectiveTeam) continue;
        if (strcasecmp((string) ($s['Status'] ?? ''), 'Cancelled') === 0) continue;
        if (($base['PatrolType'] ?? '') !== 'management' && (int) ($s['PatrolRound'] ?? 0) !== 2) continue;
        $s['PatrolDate'] = $date;
        $sessions[] = $s;
    }
    return $sessions;
}

function patrol_session_map(array $sessions): array
{
    $map = [];
    foreach ($sessions as $s) $map[(string) $s['id']] = $s;
    return $map;
}

function patrol_completed_session_ids(string $employeeId, int $year): array
{
    $rows = db_rows('SELECT DISTINCT ScheduledSessionID FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? AND ScheduledSessionID IS NOT NULL AND ScheduledSessionID<>""', [$employeeId, $year]);
    $out = [];
    foreach ($rows as $r) $out[(string) $r['ScheduledSessionID']] = true;
    return $out;
}

function patrol_user_month_schedule(string $employeeId, int $year, int $month): array
{
    $sessions = array_values(array_filter(patrol_top_sessions($employeeId, $year), static function ($s) use ($month) {
        return (int) substr((string) $s['PatrolDate'], 5, 2) === $month;
    }));
    $attendance = db_rows("SELECT id,PatrolDate,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? AND MONTH(PatrolDate)=? ORDER BY PatrolDate,id", [$employeeId, $year, $month]);
    $attByDate = [];
    $attBySession = [];
    foreach ($attendance as $a) {
        $d = substr((string) $a['PatrolDate'], 0, 10);
        if (!isset($attByDate[$d])) $attByDate[$d] = [];
        $attByDate[$d][] = $a;
        if (!empty($a['ScheduledSessionID'])) {
            $sid = (string) $a['ScheduledSessionID'];
            if (!isset($attBySession[$sid])) $attBySession[$sid] = [];
            $attBySession[$sid][] = $a;
        }
    }
    $items = [];
    $completed = 0;
    foreach ($sessions as $s) {
        $date = substr((string) $s['PatrolDate'], 0, 10);
        $sessionRecords = $attBySession[(string) $s['id']] ?? [];
        $dateRecords = array_values(array_filter($attByDate[$date] ?? [], static function ($r) {
            return empty($r['ScheduledSessionID']);
        }));
        $records = array_map(static function ($r) use ($date) {
            $actual = substr((string) $r['PatrolDate'], 0, 10);
            $r['scheduledDate'] = $date;
            $r['actualDate'] = $actual;
            $r['isMakeup'] = !empty($r['ScheduledSessionID']) && $actual !== $date;
            return $r;
        }, array_merge($sessionRecords, $dateRecords));
        $done = count($records) > 0;
        if ($done) $completed++;
        $items[] = [
            'id' => $s['id'],
            'SessionID' => $s['id'],
            'ScheduledSessionID' => $s['id'],
            'PatrolDate' => $date,
            'ScheduledDate' => $date,
            'date' => $date,
            'TeamID' => (int) ($s['TeamID'] ?? 0),
            'TeamName' => $s['TeamName'] ?? '',
            'TeamColor' => $s['TeamColor'] ?? '',
            'PatrolRound' => (int) ($s['PatrolRound'] ?? 0),
            'Status' => $s['Status'] ?? 'Pending',
            'completionStatus' => $done ? 'completed' : ($date <= date('Y-m-d') ? 'missing' : 'upcoming'),
            'isCompleted' => $done,
            'actualDate' => $records[0]['actualDate'] ?? null,
            'isMakeup' => !empty($records[0]['isMakeup']),
            'AreaName' => $s['AreaName'] ?? '',
            'AreaCode' => $s['AreaCode'] ?? '',
            'records' => $records,
        ];
    }
    return ['items' => $items, 'required' => count($items), 'completed' => $completed, 'attendance' => $attendance];
}

function patrol_supervisor_schedule_slots(int $year): array
{
    $rows = db_rows("SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode FROM patrol_sessions s LEFT JOIN patrol_teams t ON t.id=s.TeamID LEFT JOIN patrol_areas a ON a.id=s.AreaID WHERE YEAR(s.PatrolDate)=? AND (s.Status IS NULL OR s.Status<>'Cancelled') ORDER BY s.PatrolDate,s.PatrolRound,s.TeamID", [$year]);
    $seen = [];
    $slots = [];
    foreach ($rows as $row) {
        $date = substr((string) $row['PatrolDate'], 0, 10);
        $round = (int) ($row['PatrolRound'] ?? 0);
        $key = $date . ':' . $round;
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $row['SessionID'] = $row['id'];
        $row['ScheduledSessionID'] = $row['id'];
        $row['PatrolDate'] = $date;
        $row['ScheduledDate'] = $date;
        $row['date'] = $date;
        $row['PatrolRound'] = $round;
        $slots[] = $row;
    }
    return $slots;
}

function patrol_attach_supervisor_records_to_schedule(array $records, array $slots): array
{
    $bySession = [];
    $byDate = [];
    foreach ($records as $record) {
        if (!empty($record['ScheduledSessionID'])) {
            $sid = (string) $record['ScheduledSessionID'];
            if (!isset($bySession[$sid])) $bySession[$sid] = [];
            $bySession[$sid][] = $record;
        } else {
            $date = substr((string) $record['CheckinDate'], 0, 10);
            if (!isset($byDate[$date])) $byDate[$date] = [];
            $byDate[$date][] = $record;
        }
    }
    $used = [];
    $out = [];
    foreach ($slots as $slot) {
        $date = substr((string) ($slot['date'] ?? $slot['PatrolDate']), 0, 10);
        $linked = $bySession[(string) $slot['id']] ?? [];
        $fallback = [];
        if (!$linked) {
            foreach ($byDate[$date] ?? [] as $record) {
                $rid = (string) ($record['id'] ?? '');
                if ($rid !== '' && empty($used[$rid])) {
                    $fallback[] = $record;
                    $used[$rid] = true;
                    break;
                }
            }
        }
        $itemRecords = [];
        foreach (array_merge($linked, $fallback) as $record) {
            $actual = substr((string) $record['CheckinDate'], 0, 10);
            $record['scheduledDate'] = $date;
            $record['actualDate'] = $actual;
            $record['isMakeup'] = !empty($record['ScheduledSessionID']) && $actual !== $date;
            $itemRecords[] = $record;
        }
        $status = $itemRecords ? 'completed' : ($date <= date('Y-m-d') ? 'missed' : 'upcoming');
        $slot['status'] = $status;
        $slot['sessionId'] = $slot['id'];
        $slot['patrolRound'] = (int) ($slot['PatrolRound'] ?? 0);
        $slot['teamId'] = (int) ($slot['TeamID'] ?? 0);
        $slot['teamName'] = $slot['TeamName'] ?? '';
        $slot['areaName'] = $slot['AreaName'] ?? '';
        $slot['areaCode'] = $slot['AreaCode'] ?? '';
        $slot['records'] = $itemRecords;
        $slot['isCompleted'] = count($itemRecords) > 0;
        $out[] = $slot;
    }
    return $out;
}

function patrol_resolve_supervisor_scheduled_session(string $employeeId, string $date, ?string $requestedSessionId): array
{
    $year = (int) substr($date, 0, 4);
    $detail = patrol_attendance_detail_supervisor($employeeId, $year);
    $sessions = $detail['schedule'] ?? [];
    $map = patrol_session_map($sessions);
    $session = null;
    $sid = trim((string) ($requestedSessionId ?? ''));
    if ($sid !== '') {
        if (empty($map[$sid])) {
            json_response(['success' => false, 'message' => 'Selected schedule is not valid for this employee.'], 400);
        }
        $session = $map[$sid];
        $date = substr((string) ($session['date'] ?? $session['PatrolDate']), 0, 10);
    } else {
        foreach ($sessions as $s) {
            if (substr((string) ($s['date'] ?? $s['PatrolDate']), 0, 10) === $date && empty($s['isCompleted'])) {
                $session = $s;
                break;
            }
        }
    }
    if ($session) {
        $scheduledDate = substr((string) ($session['date'] ?? $session['PatrolDate']), 0, 10);
        $linked = db_row('SELECT id FROM patrol_self_checkin WHERE EmployeeID=? AND ScheduledSessionID=? LIMIT 1', [$employeeId, $session['id']]);
        $sameDate = db_row('SELECT id FROM patrol_self_checkin WHERE EmployeeID=? AND DATE(CheckinDate)=? AND (ScheduledSessionID IS NULL OR ScheduledSessionID="") LIMIT 1', [$employeeId, $scheduledDate]);
        if ($linked || $sameDate) {
            json_response(['success' => false, 'message' => 'Selected schedule is already completed.'], 409);
        }
    }
    return ['session' => $session, 'date' => $date];
}

function patrol_checkin_mail(array $employee, array $attendance, ?array $session): array
{
    $type = ($attendance['PatrolType'] ?? '') === 'compensation' ? 'เดินซ่อม / Makeup' : 'เดินปกติ / Routine';
    $actual = substr((string) ($attendance['PatrolDate'] ?? ''), 0, 10);
    $scheduled = $session ? substr((string) ($session['PatrolDate'] ?? ''), 0, 10) : $actual;
    $name = trim((string) ($employee['EmployeeName'] ?? $attendance['UserName'] ?? $attendance['UserID'] ?? ''));
    $details = [
        ['label' => 'ผู้เดินตรวจ / Inspector', 'value' => $name ?: '-','highlight' => true],
        ['label' => 'รหัสพนักงาน / Employee ID', 'value' => $attendance['UserID'] ?? '-'],
        ['label' => 'ตำแหน่ง / Position', 'value' => $employee['Position'] ?? '-'],
        ['label' => 'แผนก / Department', 'value' => $employee['Department'] ?? '-'],
        ['label' => 'ประเภท / Type', 'value' => $type, 'highlight' => true],
        ['label' => 'วันที่เดินจริง / Actual Date', 'value' => $actual ?: '-'],
        ['label' => 'วันที่ตามรอบ / Scheduled Date', 'value' => $scheduled ?: '-'],
        ['label' => 'รอบ / Round', 'value' => !empty($session['PatrolRound']) ? 'Round ' . (int) $session['PatrolRound'] : '-'],
        ['label' => 'ทีม / Team', 'value' => $session['TeamName'] ?? ($attendance['TeamName'] ?? '-')],
        ['label' => 'พื้นที่ / Area', 'value' => $attendance['Area'] ?? ($session['AreaName'] ?? '-')],
        ['label' => 'หมายเหตุ / Notes', 'value' => $attendance['Notes'] ?? '-'],
    ];
    if (function_exists('wf_hiyari_mail')) {
        return wf_hiyari_mail([
            'subject' => '[Safety Patrol] Check-in recorded - ' . ($name ?: ($attendance['UserID'] ?? '')),
            'title' => 'บันทึก Safety Patrol สำเร็จ',
            'kicker' => 'SAFETY PATROL',
            'moduleLabel' => 'Safety Patrol Module',
            'tone' => 'completed',
            'greeting' => 'เรียน คุณ' . ($name ?: 'ผู้ใช้งาน') . ' / Dear Safety Patrol user',
            'intro' => [
                'ระบบบันทึกการเดินตรวจของคุณเรียบร้อยแล้ว',
                'กรุณาเปิดระบบเพื่อตรวจสอบประวัติและสถานะรอบการเดินของคุณได้ทุกเวลา',
            ],
            'details' => $details,
            'actions' => ['เปิด Safety Patrol เพื่อตรวจสอบ My Schedule และประวัติการเดินตรวจ'],
            'note' => 'อีเมลนี้ส่งอัตโนมัติหลังจากผู้ใช้บันทึกการเดินตรวจด้วยตนเอง',
        ]);
    }
    $lines = ['Safety Patrol check-in recorded', '', 'Dear ' . ($name ?: 'user'), ''];
    foreach ($details as $d) $lines[] = ($d['label'] ?? '') . ': ' . (($d['value'] ?? '') ?: '-');
    $url = function_exists('wf_app_url') ? wf_app_url() : 'https://dev.tshpcl.com/safety/tsh-safety-core/';
    $lines[] = '';
    $lines[] = 'Open Safety Core: ' . $url;
    $htmlDetails = '';
    foreach ($details as $d) $htmlDetails .= '<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#64748b">' . htmlspecialchars((string) ($d['label'] ?? ''), ENT_QUOTES, 'UTF-8') . '</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">' . htmlspecialchars((string) (($d['value'] ?? '') ?: '-'), ENT_QUOTES, 'UTF-8') . '</td></tr>';
    $safeUrl = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
    return ['subject' => '[Safety Patrol] Check-in recorded', 'body' => implode("\n", $lines), 'html' => '<html><body><h2>Safety Patrol check-in recorded</h2><table>' . $htmlDetails . '</table><p><a href="' . $safeUrl . '">เข้าสู่ระบบ / Open Safety Core</a></p></body></html>'];
}

function patrol_queue_checkin_email(int $attendanceId, array $employee, array $attendance, ?array $session): array
{
    $recipient = trim((string) ($employee['CompanyEmail'] ?? ''));
    if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        return ['queued' => false, 'sent' => false, 'reason' => 'No valid CompanyEmail'];
    }
    try {
        $mail = patrol_checkin_mail($employee, $attendance, $session);
        db_execute('INSERT INTO patrol_emailoutbox(AttendanceID,EmployeeID,EventType,Recipients,Subject,Body,HtmlBody,Status) VALUES(?,?,?,?,?,?,?,"Queued")', [$attendanceId, $attendance['UserID'] ?? null, 'SelfCheckInRecorded', $recipient, $mail['subject'], $mail['body'], $mail['html'] ?? null]);
        $outboxId = (int) db()->lastInsertId();
        if (function_exists('mailer_outbox_best_effort')) {
            mailer_outbox_best_effort('patrol_emailoutbox', $outboxId, 'Recipients', 'HtmlBody');
        }
        $row = db_row('SELECT Status,Error,SentAt FROM patrol_emailoutbox WHERE id=?', [$outboxId]) ?: [];
        return ['queued' => true, 'outboxId' => $outboxId, 'status' => $row['Status'] ?? 'Queued', 'sent' => !empty($row['SentAt']) || ($row['Status'] ?? '') === 'Sent'];
    } catch (Throwable $e) {
        return ['queued' => false, 'sent' => false, 'reason' => $e->getMessage()];
    }
}

function patrol_resolve_scheduled_session(string $employeeId, string $date, ?string $requestedSessionId): array
{
    $year = (int) substr($date, 0, 4);
    $sessions = patrol_top_sessions($employeeId, $year);
    $sessionMap = patrol_session_map($sessions);
    $session = null;
    $sessionId = trim((string) ($requestedSessionId ?? ''));
    if ($sessionId !== '') {
        if (empty($sessionMap[$sessionId])) {
            json_response(['success' => false, 'message' => 'Selected schedule is not valid for this employee.'], 400);
        }
        $session = $sessionMap[$sessionId];
        if (substr($date, 0, 7) !== substr((string) $session['PatrolDate'], 0, 7)) {
            json_response(['success' => false, 'message' => 'Makeup patrol must be linked to a scheduled round in the same month.'], 400);
        }
    } else {
        $matches = [];
        foreach ($sessions as $s) {
            if (substr((string) $s['PatrolDate'], 0, 10) === $date) $matches[] = $s;
        }
        if (count($matches) === 1) $session = $matches[0];
    }
    if ($session) {
        $exists = db_row('SELECT id FROM patrol_attendance WHERE UserID=? AND ScheduledSessionID=? LIMIT 1', [$employeeId, $session['id']]);
        $existsDate = db_row('SELECT id FROM patrol_attendance WHERE UserID=? AND DATE(PatrolDate)=? AND (ScheduledSessionID IS NULL OR ScheduledSessionID="") LIMIT 1', [$employeeId, substr((string) $session['PatrolDate'], 0, 10)]);
        if ($exists || $existsDate) {
            json_response(['success' => false, 'message' => 'Selected schedule is already completed.'], 409);
        }
    }
    return ['session' => $session, 'sessions' => $sessions];
}

function patrol_attendance_detail_top(string $employeeId, int $year): array
{
    $employee = db_row('SELECT EmployeeID,EmployeeName,Department,Position FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$employee) json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    $roster = db_row("SELECT id AS RosterID,TargetPerYear,SortOrder FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='top_management' LIMIT 1", [$employeeId]);
    if (!$roster) json_response(['success' => false, 'message' => 'Employee is not in Top & Management roster.'], 404);
    $sessions = patrol_top_sessions($employeeId, $year);

    $attendance = db_rows("SELECT pa.id,pa.PatrolDate,pa.PatrolType,pa.Area,pa.Notes,pa.RecordedBy,pa.ScheduledSessionID,e.EmployeeName AS RecordedByName FROM patrol_attendance pa LEFT JOIN employees e ON e.EmployeeID=pa.RecordedBy WHERE pa.UserID=? AND YEAR(pa.PatrolDate)=? ORDER BY pa.PatrolDate,pa.id", [$employeeId, $year]);
    $attByDate = [];
    $attBySession = [];
    foreach ($attendance as $idx => $a) {
        $d = substr((string) $a['PatrolDate'], 0, 10);
        if (!isset($attByDate[$d])) $attByDate[$d] = [];
        $a['mode'] = empty($a['RecordedBy']) || (string) $a['RecordedBy'] === $employeeId ? 'self' : 'admin_recorded';
        $a['isMakeup'] = !empty($a['ScheduledSessionID']) && $d !== '';
        $attendance[$idx] = $a;
        $attByDate[$d][] = $a;
        if (!empty($a['ScheduledSessionID'])) {
            $sid = (string) $a['ScheduledSessionID'];
            if (!isset($attBySession[$sid])) $attBySession[$sid] = [];
            $attBySession[$sid][] = $a;
        }
    }

    $cutoff = patrol_cutoff_date($year);
    $periods = [];
    for ($m = 1; $m <= 12; $m++) $periods[$m] = ['month' => $m, 'required' => 0, 'completed' => 0, 'missed' => 0, 'upcoming' => 0, 'items' => []];
    $schedule = [];
    $requiredToDate = 0;
    $completedScheduled = 0;
    foreach ($sessions as $s) {
        $date = substr((string) $s['PatrolDate'], 0, 10);
        $month = (int) substr($date, 5, 2);
        $sessionRecords = $attBySession[(string) $s['id']] ?? [];
        $dateRecords = array_values(array_filter($attByDate[$date] ?? [], static function ($r) {
            return empty($r['ScheduledSessionID']);
        }));
        $records = array_merge($sessionRecords, $dateRecords);
        $done = !empty($records);
        $due = $date <= $cutoff;
        $status = $done ? 'completed' : ($due ? 'missed' : 'upcoming');
        if ($due) $requiredToDate++;
        if ($done) $completedScheduled++;
        $item = [
            'date' => $date,
            'status' => $status,
            'sessionId' => $s['id'],
            'patrolRound' => (int) ($s['PatrolRound'] ?? 0),
            'teamId' => (int) ($s['TeamID'] ?? 0),
            'teamName' => $s['TeamName'] ?? '',
            'areaName' => $s['AreaName'] ?? '',
            'areaCode' => $s['AreaCode'] ?? '',
            'records' => array_map(static function ($r) use ($date) {
                $r['scheduledDate'] = $date;
                $r['actualDate'] = substr((string) $r['PatrolDate'], 0, 10);
                $r['isMakeup'] = !empty($r['ScheduledSessionID']) && $r['actualDate'] !== $date;
                return $r;
            }, $records),
        ];
        $schedule[] = $item;
        $periods[$month]['required']++;
        if ($status === 'completed') $periods[$month]['completed']++;
        elseif ($status === 'missed') $periods[$month]['missed']++;
        else $periods[$month]['upcoming']++;
        $periods[$month]['items'][] = $item;
    }
    $scheduledDates = [];
    foreach ($sessions as $s) $scheduledDates[substr((string) $s['PatrolDate'], 0, 10)] = true;
    $extraRecords = [];
    foreach ($attendance as $a) {
        $d = substr((string) $a['PatrolDate'], 0, 10);
        if (empty($a['ScheduledSessionID']) && empty($scheduledDates[$d])) $extraRecords[] = $a;
    }

    $yearlyTarget = (int) ($roster['TargetPerYear'] ?? 0);
    $completed = count($attendance);
    return [
        'mode' => 'scheduled_calendar',
        'group' => 'top_management',
        'year' => $year,
        'employee' => $employee,
        'roster' => ['RosterID' => (int) $roster['RosterID'], 'TargetPerYear' => $yearlyTarget],
        'summary' => [
            'completed' => $completed,
            'completedScheduled' => $completedScheduled,
            'requiredToDate' => $requiredToDate,
            'yearlyTarget' => $yearlyTarget,
            'scheduledTotal' => count($sessions),
            'missingToDate' => max(0, $requiredToDate - $completedScheduled),
            'upcoming' => max(0, count($sessions) - $requiredToDate),
            'progressToDatePct' => patrol_pct($completedScheduled, $requiredToDate),
            'fullYearPct' => patrol_pct($completed, $yearlyTarget),
        ],
        'periods' => array_values($periods),
        'schedule' => $schedule,
        'records' => $attendance,
        'extraRecords' => $extraRecords,
    ];
}

function patrol_attendance_detail_supervisor(string $employeeId, int $year): array
{
    $employee = db_row('SELECT EmployeeID,EmployeeName,Department,Unit,Position FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$employee) json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    $roster = db_row("SELECT id AS RosterID,TargetPerYear,SortOrder FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$employeeId]);
    if (!$roster) json_response(['success' => false, 'message' => 'Employee is not in Sec. & Supervisor roster.'], 404);
    $activityTarget = patrol_activity_target_for_employee($employeeId, $employee, 'patrol');
    $fallbackTarget = (int) ($roster['TargetPerYear'] ?? (patrol_supervisor_monthly_requirement() * 12));
    $yearlyTarget = (int) ($activityTarget['yearlyTarget'] ?? $fallbackTarget);
    $targetSource = $activityTarget['source'] ?? 'patrol_roster';
    $dueMonth = patrol_due_month($year);
    $records = db_rows("SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName FROM patrol_self_checkin sc LEFT JOIN employees e ON e.EmployeeID=sc.RecordedBy WHERE sc.EmployeeID=? AND sc.Year=? ORDER BY sc.CheckinDate,sc.id", [$employeeId, $year]);
    $byMonth = [];
    foreach ($records as $idx => $r) {
        $m = (int) ($r['Month'] ?? substr((string) $r['CheckinDate'], 5, 2));
        if (!isset($byMonth[$m])) $byMonth[$m] = [];
        $r['mode'] = empty($r['RecordedBy']) || (string) $r['RecordedBy'] === $employeeId ? 'self' : 'admin_recorded';
        $records[$idx] = $r;
        $byMonth[$m][] = $r;
    }
    $schedule = patrol_attach_supervisor_records_to_schedule($records, patrol_supervisor_schedule_slots($year));
    $scheduleByMonth = [];
    foreach ($schedule as $item) {
        $m = (int) substr((string) ($item['date'] ?? $item['PatrolDate']), 5, 2);
        if (!isset($scheduleByMonth[$m])) $scheduleByMonth[$m] = [];
        $scheduleByMonth[$m][] = $item;
    }
    $scheduledRequirementByMonth = [];
    $scheduledYearlyTarget = 0;
    for ($m = 1; $m <= 12; $m++) {
        $monthRequirement = patrol_supervisor_requirement_from_schedule_count(count($scheduleByMonth[$m] ?? []));
        $scheduledRequirementByMonth[$m] = $monthRequirement;
        $scheduledYearlyTarget += $monthRequirement;
    }
    $effectiveYearlyTarget = $scheduledYearlyTarget > 0 ? $scheduledYearlyTarget : $yearlyTarget;
    $periods = [];
    $requiredToDate = 0;
    $completedToDate = 0;
    for ($m = 1; $m <= 12; $m++) {
        $monthRecords = $byMonth[$m] ?? [];
        $completed = count($monthRecords);
        $isDue = $m <= $dueMonth;
        $monthRequirement = $scheduledRequirementByMonth[$m] ?? 0;
        $required = $isDue ? $monthRequirement : 0;
        if ($isDue) {
            $requiredToDate += $monthRequirement;
            $completedToDate += min($completed, $monthRequirement);
        }
        $status = !$isDue ? 'upcoming' : ($completed >= $monthRequirement ? 'completed' : ($completed > 0 ? 'partial' : 'missed'));
        $periods[] = [
            'month' => $m,
            'required' => $required,
            'monthlyRequirement' => $monthRequirement,
            'completed' => $completed,
            'missing' => $isDue ? max(0, $monthRequirement - $completed) : 0,
            'status' => $status,
            'records' => $monthRecords,
            'items' => $scheduleByMonth[$m] ?? [],
        ];
    }
    $currentMonth = max(1, min(12, patrol_due_month($year) ?: 1));
    $openSchedule = array_values(array_filter($schedule, static function ($item) {
        return empty($item['isCompleted']);
    }));
    $completed = count($records);
    return [
        'mode' => 'scheduled_quota',
        'group' => 'supervisor',
        'year' => $year,
        'employee' => $employee,
        'roster' => ['RosterID' => (int) $roster['RosterID'], 'TargetPerYear' => $effectiveYearlyTarget, 'ConfiguredTargetPerYear' => $yearlyTarget],
        'monthlyRequirement' => (int) ($scheduledRequirementByMonth[$currentMonth] ?? 0),
        'targetSource' => $targetSource,
        'summary' => [
            'completed' => $completed,
            'completedToDateCapped' => $completedToDate,
            'requiredToDate' => $requiredToDate,
            'yearlyTarget' => $effectiveYearlyTarget,
            'configuredYearlyTarget' => $yearlyTarget,
            'targetSource' => $targetSource,
            'scheduledTotal' => count($schedule),
            'missingToDate' => max(0, $requiredToDate - $completedToDate),
            'upcomingMonths' => max(0, 12 - $dueMonth),
            'progressToDatePct' => patrol_pct($completedToDate, $requiredToDate),
            'fullYearPct' => patrol_pct($completed, $effectiveYearlyTarget),
        ],
        'periods' => $periods,
        'schedule' => $schedule,
        'openSchedule' => $openSchedule,
        'records' => $records,
    ];
}

function handle_patrol_routes(string $method, string $path): bool
{
    if (strpos($path, '/patrol') !== 0) return false;
    $user = require_user();
    ensure_patrol_schema();
    $uid = (string) ($user['id'] ?? '');

    if ($method === 'GET' && $path === '/patrol/my-monthly-plan') {
        [$year, $month] = patrol_validate_ym($_GET['year'] ?? null, $_GET['month'] ?? null);
        $base = db_row("SELECT tm.TeamID,tm.PatrolType,t.Name AS TeamName,t.PatrolGroup,t.Color FROM patrol_team_members tm JOIN patrol_teams t ON t.id=tm.TeamID WHERE tm.EmployeeID=? LIMIT 1", [$uid]);
        if (!$base) json_response(['success' => true, 'data' => null]);
        $override = db_row("SELECT mr.TeamID,t.Name AS TeamName,t.PatrolGroup,t.Color FROM patrol_member_rotation mr JOIN patrol_teams t ON t.id=mr.TeamID WHERE mr.EmployeeID=? AND mr.Year=? AND mr.Month=?", [$uid, $year, $month]);
        $team = $override
            ? ['id' => $override['TeamID'], 'name' => $override['TeamName'], 'group' => $override['PatrolGroup'], 'color' => $override['Color']]
            : ['id' => $base['TeamID'], 'name' => $base['TeamName'], 'group' => $base['PatrolGroup'], 'color' => $base['Color']];
        $personalSchedule = patrol_user_month_schedule($uid, $year, $month);
        $sessions = $personalSchedule['items'];
        $required = $personalSchedule['items'];
        $attendance = $personalSchedule['attendance'];
        $attendanceDates = [];
        foreach ($attendance as $row) $attendanceDates[] = substr((string) $row['PatrolDate'], 0, 10);
        $roster = db_rows("SELECT tm.EmployeeID,tm.PatrolType,e.EmployeeName,COALESCE(mr.TeamID,tm.TeamID) AS EffectiveTeamID FROM patrol_team_members tm JOIN employees e ON e.EmployeeID=tm.EmployeeID LEFT JOIN patrol_member_rotation mr ON mr.EmployeeID=tm.EmployeeID AND mr.Year=? AND mr.Month=? WHERE COALESCE(mr.TeamID,tm.TeamID)=? ORDER BY FIELD(tm.PatrolType,'top','committee','management'),e.EmployeeName", [$year, $month, $team['id']]);
        json_response(['success' => true, 'data' => ['patrolType' => $base['PatrolType'], 'team' => $team, 'sessions' => $sessions, 'required' => $required, 'attended' => (int) $personalSchedule['completed'], 'attendanceDates' => $attendanceDates, 'roster' => $roster, 'compliance' => ['required' => (int) $personalSchedule['required'], 'attended' => (int) $personalSchedule['completed'], 'done' => (int) $personalSchedule['completed'] >= (int) $personalSchedule['required']]]]);
    }

    if ($method === 'GET' && $path === '/patrol/my-yearly-stats') {
        $year = patrol_query_year();
        $yearlyCount = (int) (safe_scalar('SELECT COUNT(*) FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=?', [$uid, $year]) ?? 0);
        $rosterRow = db_row('SELECT TargetPerYear,RosterGroup FROM patrol_roster WHERE EmployeeID=? LIMIT 1', [$uid]);
        $recent = db_rows('SELECT PatrolDate,PatrolType,Area,Notes FROM patrol_attendance WHERE UserID=? ORDER BY PatrolDate DESC,id DESC LIMIT 6', [$uid]);
        $teamBase = db_row('SELECT TeamID FROM patrol_team_members WHERE EmployeeID=? LIMIT 1', [$uid]);
        $teamRank = null; $teamMemberStats = []; $monthlySched = [];
        if ($teamBase) {
            $members = db_rows("SELECT tm.EmployeeID,e.Position,(SELECT COUNT(*) FROM patrol_attendance pa WHERE pa.UserID=tm.EmployeeID AND YEAR(pa.PatrolDate)=?) AS cnt FROM patrol_team_members tm JOIN employees e ON e.EmployeeID=tm.EmployeeID WHERE tm.TeamID=? ORDER BY cnt DESC", [$year, $teamBase['TeamID']]);
            foreach ($members as $idx => $m) {
                if ((string) $m['EmployeeID'] === $uid) $teamRank = ['rank' => $idx + 1, 'total' => count($members)];
                $teamMemberStats[] = ['EmployeeID' => $m['EmployeeID'], 'position' => $m['Position'], 'yearlyCount' => (int) $m['cnt']];
            }
            $monthlySched = db_rows('SELECT MONTH(s.PatrolDate) AS month,COUNT(*) AS cnt FROM patrol_sessions s JOIN patrol_team_members tm ON tm.TeamID=s.TeamID AND tm.EmployeeID=? WHERE YEAR(s.PatrolDate)=? GROUP BY MONTH(s.PatrolDate)', [$uid, $year]);
        }
        $monthlyRequired = safe_scalar('SELECT COUNT(*) FROM patrol_sessions s JOIN patrol_team_members tm ON tm.TeamID=s.TeamID AND tm.EmployeeID=? WHERE YEAR(s.PatrolDate)=? AND MONTH(s.PatrolDate)=? AND s.PatrolRound=2', [$uid, $year, patrol_month()]);
        $monthlyAtt = db_rows('SELECT MONTH(PatrolDate) AS month,COUNT(*) AS cnt FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? GROUP BY MONTH(PatrolDate)', [$uid, $year]);
        $attMap = []; $schedMap = [];
        foreach ($monthlyAtt as $r) $attMap[(int) $r['month']] = (int) $r['cnt'];
        foreach ($monthlySched as $r) $schedMap[(int) $r['month']] = (int) $r['cnt'];
        $breakdown = [];
        for ($m = 1; $m <= 12; $m++) $breakdown[] = ['month' => $m, 'attended' => $attMap[$m] ?? 0, 'scheduled' => $schedMap[$m] ?? 0];
        json_response(['success' => true, 'data' => ['year' => $year, 'yearlyCount' => $yearlyCount, 'yearlyTarget' => $rosterRow['TargetPerYear'] ?? null, 'recentCheckins' => $recent, 'teamRank' => $teamRank, 'teamMemberStats' => $teamMemberStats, 'monthlyRequired' => $monthlyRequired, 'selfPatrolYear' => ['count' => (int) (safe_scalar('SELECT COUNT(*) FROM patrol_self_checkin WHERE EmployeeID=? AND Year=?', [$uid, $year]) ?? 0)], 'monthlyBreakdown' => $breakdown]]);
    }

    if ($method === 'GET' && $path === '/patrol/position-thresholds') json_response(['success' => true, 'data' => db_rows('SELECT id,Name,COALESCE(PatrolPassPct,80) AS PatrolPassPct FROM master_positions ORDER BY Name')]);
    $p = route_params($path, '/patrol/position-thresholds/:id');
    if ($p !== null && $method === 'PUT') { require_admin(); $b = json_body(); db_execute('UPDATE master_positions SET PatrolPassPct=? WHERE id=?', [(int) $b['PatrolPassPct'], $p['id']]); json_response(['success' => true]); }

    if ($method === 'GET' && $path === '/patrol/day-detail') {
        $date = patrol_valid_date($_GET['date'] ?? null);
        if (!$date) json_response(['success' => false, 'message' => 'date is required.'], 400);
        $sessions = db_rows("SELECT s.SessionID AS id,s.PatrolRound,s.Status,t.id AS TeamID,t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode,(SELECT COUNT(*) FROM patrol_team_members WHERE TeamID=s.TeamID) AS MemberCount,(SELECT COUNT(DISTINCT pa.UserID) FROM patrol_attendance pa WHERE DATE(pa.PatrolDate)=? AND pa.TeamName=t.Name) AS AttendedCount FROM patrol_sessions s LEFT JOIN patrol_teams t ON t.id=s.TeamID LEFT JOIN patrol_areas a ON a.id=s.AreaID WHERE DATE(s.PatrolDate)=? ORDER BY s.PatrolRound ASC,t.Name ASC", [$date, $date]);
        $totalExpected = 0; $totalAttended = 0;
        foreach ($sessions as $s) { $totalExpected += (int) $s['MemberCount']; $totalAttended += (int) $s['AttendedCount']; }
        json_response(['success' => true, 'data' => ['date' => $date, 'sessions' => $sessions, 'totalExpected' => $totalExpected, 'totalAttended' => $totalAttended, 'overallPct' => $totalExpected > 0 ? (int) round($totalAttended * 100 / $totalExpected) : 0]]);
    }

    if ($method === 'GET' && $path === '/patrol/attendance-detail') {
        $year = patrol_query_year();
        $employeeId = trim((string) ($_GET['employeeId'] ?? $uid));
        $group = trim((string) ($_GET['group'] ?? 'top_management'));
        if ($employeeId === '') json_response(['success' => false, 'message' => 'employeeId is required.'], 400);
        if (!in_array($group, ['top_management', 'supervisor'], true)) json_response(['success' => false, 'message' => 'group is invalid.'], 400);
        if (!patrol_is_admin($user) && $employeeId !== $uid && !patrol_can_view_roster_attendance_detail($employeeId, $group)) json_response(['success' => false, 'message' => 'Permission denied.'], 403);
        if ($group === 'supervisor') json_response(['success' => true, 'data' => patrol_attendance_detail_supervisor($employeeId, $year)]);
        if ($group === 'top_management') json_response(['success' => true, 'data' => patrol_attendance_detail_top($employeeId, $year)]);
    }

    if ($method === 'GET' && $path === '/patrol/my-schedule') { [$year, $month] = patrol_validate_ym($_GET['year'] ?? null, $_GET['month'] ?? null); json_response(patrol_user_month_schedule($uid, $year, $month)['items']); }
    if ($method === 'GET' && $path === '/patrol/attendance-stats') json_response(db_rows("SELECT UserName AS Name,COUNT(*) AS Total,MAX(PatrolDate) AS LastWalk,ROUND(COUNT(*)*100.0/NULLIF((SELECT COUNT(DISTINCT YEARWEEK(PatrolDate)) FROM patrol_attendance),0)) AS Percent FROM patrol_attendance GROUP BY UserID,UserName ORDER BY Total DESC LIMIT 20"));
    if ($method === 'GET' && $path === '/patrol/dashboard-stats') json_response(['bySection' => safe_rows("SELECT Area AS Section,COUNT(CASE WHEN CurrentStatus='Closed' THEN 1 END) AS Achieved,COUNT(CASE WHEN CurrentStatus!='Closed' THEN 1 END) AS OnProcess FROM patrol_issues GROUP BY Area ORDER BY Achieved DESC"), 'byRank' => safe_rows('SELECT HazardType AS HazardRank,COUNT(*) AS Count FROM patrol_issues GROUP BY HazardType ORDER BY Count DESC')]);
    if ($method === 'GET' && $path === '/patrol/email-outbox') { require_admin(); $status = trim((string) ($_GET['status'] ?? '')); $limit = max(1, min(100, (int) ($_GET['limit'] ?? 50))); $params = []; $sql = 'SELECT id,AttendanceID,EmployeeID,EventType,Recipients,Subject,Status,Error,SentAt,CreatedAt FROM patrol_emailoutbox'; if ($status !== '') { $sql .= ' WHERE Status=?'; $params[] = $status; } $sql .= ' ORDER BY id DESC LIMIT ' . $limit; json_response(['success' => true, 'data' => db_rows($sql, $params)]); }
    $p = route_params($path, '/patrol/email-outbox/:id/retry'); if ($p !== null && $method === 'POST') { require_admin(); try { $r = mailer_outbox_send('patrol_emailoutbox', (int) $p['id'], 'Recipients', 'HtmlBody'); json_response(['success' => true, 'message' => 'Email sent.', 'data' => $r]); } catch (Throwable $e) { json_response(['success' => false, 'message' => 'Email send failed.', 'error' => $e->getMessage()], 500); } }
    if ($method === 'POST' && $path === '/patrol/email-outbox/retry-queued') { require_admin(); if (!mailer_smtp_configured()) json_response(['success' => false, 'message' => 'SMTP is not configured.'], 400); $b = json_body(); $r = mailer_outbox_retry_queued('patrol_emailoutbox', 'Recipients', 'HtmlBody', (int) ($b['limit'] ?? 20)); json_response(['success' => true, 'message' => "Retried {$r['processed']} Patrol email queue item(s)", 'processed' => $r['processed'], 'sent' => $r['sent'], 'failed' => $r['failed'], 'data' => $r]); }

    if ($method === 'POST' && $path === '/patrol/checkin') {
        $b = json_body();
        $date = patrol_valid_date($b['PatrolDate'] ?? null) ?? date('Y-m-d');
        $type = patrol_self_checkin_type($b['PatrolType'] ?? 'normal');
        if ($type === null) json_response(['success' => false, 'message' => 'Self check-in supports only normal or compensation patrol.'], 400);
        if ($type === 'compensation' && trim((string) ($b['ScheduledSessionID'] ?? '')) === '') json_response(['success' => false, 'message' => 'ScheduledSessionID is required for makeup patrol.'], 400);
        if (db_row('SELECT id FROM patrol_attendance WHERE UserID=? AND DATE(PatrolDate)=? AND PatrolType=? LIMIT 1', [$uid, $date, $type])) json_response(['success' => false, 'message' => 'Duplicate patrol check-in.'], 409);
        $emp = db_row('SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Position,e.CompanyEmail,t.Name AS TeamName FROM employees e LEFT JOIN patrol_team_members tm ON tm.EmployeeID=e.EmployeeID LEFT JOIN patrol_teams t ON t.id=tm.TeamID WHERE e.EmployeeID=? LIMIT 1', [$uid]);
        $teamName = (string) ($emp['TeamName'] ?? ($user['team'] ?? ''));
        $resolved = patrol_resolve_scheduled_session($uid, $date, $b['ScheduledSessionID'] ?? null);
        $session = $resolved['session'] ?? null;
        $area = trim((string) ($b['Area'] ?? '')) ?: null;
        if (!$area && $session) $area = $session['AreaName'] ?: ($session['AreaCode'] ?? null);
        $notes = trim((string) ($b['Notes'] ?? '')) ?: null;
        db_execute('INSERT INTO patrol_attendance(UserID,UserName,TeamName,WeekNumber,PatrolDate,Year,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [$uid, $emp['EmployeeName'] ?? patrol_user_name($user), $teamName, patrol_week($date), $date, (int) substr($date, 0, 4), $type, $area, $notes, $uid, $session['id'] ?? null]);
        $attendanceId = (int) db()->lastInsertId();
        $attendance = ['id' => $attendanceId, 'UserID' => $uid, 'UserName' => $emp['EmployeeName'] ?? patrol_user_name($user), 'TeamName' => $teamName, 'PatrolDate' => $date, 'PatrolType' => $type, 'Area' => $area, 'Notes' => $notes, 'ScheduledSessionID' => $session['id'] ?? null];
        $email = patrol_queue_checkin_email($attendanceId, $emp ?: [], $attendance, $session);
        json_response(['success' => true, 'message' => 'Check-in saved.', 'data' => ['checkin' => ['id' => $attendanceId, 'employeeId' => $uid, 'employeeName' => $attendance['UserName'], 'position' => $emp['Position'] ?? null, 'department' => $emp['Department'] ?? null, 'type' => $type, 'actualDate' => $date, 'scheduledDate' => $session ? substr((string) $session['PatrolDate'], 0, 10) : $date, 'isMakeup' => $session && substr((string) $session['PatrolDate'], 0, 10) !== $date, 'scheduledSessionId' => $session['id'] ?? null, 'round' => $session['PatrolRound'] ?? null, 'area' => $area, 'teamName' => $teamName], 'email' => $email, 'totalWalks' => (int) (safe_scalar('SELECT COUNT(*) FROM patrol_attendance WHERE UserID=?', [$uid]) ?? 0), 'teamWalks' => (int) (safe_scalar('SELECT COUNT(*) FROM patrol_attendance WHERE TeamName=?', [$teamName]) ?? 0), 'todayWalkers' => db_rows('SELECT UserName,PatrolDate FROM patrol_attendance WHERE DATE(PatrolDate)=CURDATE() ORDER BY PatrolDate DESC LIMIT 5')]]);
    }

    if ($method === 'GET' && $path === '/patrol/issues') json_response(['success' => true, 'data' => db_rows('SELECT * FROM patrol_issues ORDER BY IssueID DESC')]);
    if ($method === 'POST' && $path === '/patrol/issue/save') {
        $stored = [];
        try {
            $b = $_POST ?: json_body();
            $before = patrol_store_optional_upload('BeforeImage', $stored);
            $temp = patrol_store_optional_upload('TempImage', $stored);
            $after = patrol_store_optional_upload('AfterImage', $stored);
            $error = patrol_validate_issue($b);
            if ($error) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => $error], 400); }
            $action = (string) $b['ActionType'];
            if (in_array($action, ['CLOSE', 'UPDATE'], true) && !patrol_is_admin($user)) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => 'Admin access required.'], 403); }
            if ($action === 'OPEN') {
                db_execute('INSERT INTO patrol_issues(DateFound,FoundByTeam,Area,ResponsibleDept,ResponsibleUnit,HazardType,MachineName,HazardDescription,`Rank`,DueDate,BeforeImage,CurrentStatus,ReporterID) VALUES(?,?,?,?,?,?,?,?,?,?,?,"Open",?)', [$b['DateFound'], $b['FoundByTeam'] ?? null, $b['Area'], $b['ResponsibleDept'] ?? null, $b['ResponsibleUnit'] ?? null, $b['HazardType'], $b['MachineName'] ?? null, $b['HazardDescription'], $b['Rank'] ?? null, $b['DueDate'] ?? null, $before, $uid]);
                json_response(['success' => true, 'message' => 'Saved.', 'id' => (int) db()->lastInsertId()]);
            } elseif ($action === 'TEMP') {
                $current = db_row('SELECT TempImage FROM patrol_issues WHERE IssueID=?', [$b['IssueID']]);
                db_execute("UPDATE patrol_issues SET TempDescription=?,TempImage=COALESCE(?,TempImage),TempDate=NOW(),CurrentStatus='Temporary' WHERE IssueID=?", [$b['TempDescription'], $temp, $b['IssueID']]);
                if ($temp && $current) delete_uploaded_file($current['TempImage']);
            } elseif ($action === 'CLOSE') {
                $current = db_row('SELECT AfterImage FROM patrol_issues WHERE IssueID=?', [$b['IssueID']]);
                db_execute("UPDATE patrol_issues SET ActionDescription=?,AfterImage=COALESCE(?,AfterImage),FinishDate=?,CurrentStatus='Closed',ResultStatus='Closed' WHERE IssueID=?", [$b['ActionDescription'], $after, $b['FinishDate'], $b['IssueID']]);
                if ($after && $current) delete_uploaded_file($current['AfterImage']);
            } else {
                $current = db_row('SELECT TempImage,AfterImage FROM patrol_issues WHERE IssueID=?', [$b['IssueID']]);
                $hasFinal = trim((string) ($b['ActionDescription'] ?? '')) !== '';
                $hasTemp = trim((string) ($b['TempDescription'] ?? '')) !== '';
                $status = $hasFinal ? 'Closed' : ($hasTemp ? 'Temporary' : 'Open');
                db_execute('UPDATE patrol_issues SET Area=COALESCE(?,Area),ResponsibleDept=COALESCE(?,ResponsibleDept),ResponsibleUnit=?,HazardType=COALESCE(?,HazardType),MachineName=?,HazardDescription=COALESCE(?,HazardDescription),`Rank`=COALESCE(?,`Rank`),DueDate=COALESCE(?,DueDate),TempDescription=?,TempImage=COALESCE(?,TempImage),TempDate=IF(? IS NOT NULL AND ?!="",NOW(),TempDate),ActionDescription=?,AfterImage=COALESCE(?,AfterImage),FinishDate=?,CurrentStatus=? WHERE IssueID=?', [$b['Area'] ?? null, $b['ResponsibleDept'] ?? null, $b['ResponsibleUnit'] ?? null, $b['HazardType'] ?? null, $b['MachineName'] ?? null, $b['HazardDescription'] ?? null, $b['Rank'] ?? null, $b['DueDate'] ?? null, $b['TempDescription'] ?? null, $temp, $temp, $b['TempDescription'] ?? null, $b['ActionDescription'] ?? null, $after, $b['FinishDate'] ?? null, $status, $b['IssueID']]);
                if ($temp && $current) delete_uploaded_file($current['TempImage']);
                if ($after && $current) delete_uploaded_file($current['AfterImage']);
            }
            json_response(['success' => true, 'message' => 'Saved.']);
        } catch (Throwable $e) {
            patrol_cleanup_urls($stored);
            throw $e;
        }
    }
    $p = route_params($path, '/patrol/issue/:id');
    if ($p !== null && $method === 'DELETE') { require_admin(); $row = db_row('SELECT BeforeImage,TempImage,AfterImage FROM patrol_issues WHERE IssueID=?', [$p['id']]); $count = db_execute('DELETE FROM patrol_issues WHERE IssueID=?', [$p['id']]); if ($count === 0) json_response(['success' => false, 'message' => 'Not found.'], 404); if ($row) patrol_cleanup_urls([$row['BeforeImage'], $row['TempImage'], $row['AfterImage']]); json_response(['success' => true, 'message' => 'Deleted.']); }

    if ($method === 'GET' && $path === '/patrol/teams') json_response(['success' => true, 'data' => db_rows('SELECT t.*,(SELECT COUNT(*) FROM patrol_team_members tm WHERE tm.TeamID=t.id) AS MemberCount FROM patrol_teams t ORDER BY t.Name')]);
    if ($method === 'POST' && $path === '/patrol/teams') { require_admin(); $b = json_body(); if (empty($b['Name'])) json_response(['success' => false, 'message' => 'Name is required.'], 400); db_execute('INSERT INTO patrol_teams(Name,PatrolGroup,Color) VALUES(?,?,?)', [$b['Name'], $b['PatrolGroup'] ?? null, $b['Color'] ?? null]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/teams/:id');
    if ($p !== null && $method === 'PUT') { require_admin(); $b = json_body(); db_execute('UPDATE patrol_teams SET Name=?,PatrolGroup=?,Color=? WHERE id=?', [$b['Name'], $b['PatrolGroup'] ?? null, $b['Color'] ?? null, $p['id']]); json_response(['success' => true]); }
    if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_team_members WHERE TeamID=?', [$p['id']]); db_execute('DELETE FROM patrol_teams WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    $p = route_params($path, '/patrol/teams/:id/members');
    if ($p !== null && $method === 'GET') json_response(['success' => true, 'data' => db_rows('SELECT tm.*,e.EmployeeName,e.Department,e.Position FROM patrol_team_members tm LEFT JOIN employees e ON e.EmployeeID=tm.EmployeeID WHERE tm.TeamID=? ORDER BY e.EmployeeName', [$p['id']])]);
    if ($p !== null && $method === 'POST') { require_admin(); $b = json_body(); db_execute('INSERT INTO patrol_team_members(TeamID,EmployeeID,PatrolType) VALUES(?,?,?)', [$p['id'], $b['EmployeeID'], $b['PatrolType'] ?? 'management']); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/teams/:teamId/members/:memberId');
    if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_team_members WHERE TeamID=? AND id=?', [$p['teamId'], $p['memberId']]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/patrol/areas') json_response(['success' => true, 'data' => db_rows('SELECT * FROM patrol_areas ORDER BY SortOrder,id')]);

    if ($method === 'GET' && $path === '/patrol/member-rotation') {
        [$year] = patrol_validate_ym($_GET['year'] ?? null, null, false);
        $base = db_rows("SELECT tm.id,tm.EmployeeID,tm.TeamID,tm.PatrolType,e.EmployeeName,t.Name AS TeamName,t.PatrolGroup,t.Color FROM patrol_team_members tm JOIN employees e ON e.EmployeeID=tm.EmployeeID JOIN patrol_teams t ON t.id=tm.TeamID ORDER BY t.PatrolGroup,t.id,tm.PatrolType,e.EmployeeName");
        $monthly = db_rows('SELECT mr.EmployeeID,mr.TeamID,mr.Month,t.Name AS TeamName,t.PatrolGroup,t.Color FROM patrol_member_rotation mr JOIN patrol_teams t ON t.id=mr.TeamID WHERE mr.Year=? ORDER BY mr.Month', [$year]);
        json_response(['success' => true, 'base' => $base, 'monthly' => $monthly]);
    }
    if ($method === 'POST' && $path === '/patrol/member-rotation') { require_admin(); $items = json_body(); if (!patrol_is_list_array($items) || count($items) === 0) json_response(['success' => false, 'message' => 'Array payload is required.'], 400); db()->beginTransaction(); try { foreach ($items as $it) { [$y, $m] = patrol_validate_ym($it['Year'] ?? null, $it['Month'] ?? null); db_execute('INSERT INTO patrol_member_rotation(EmployeeID,TeamID,Year,Month) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE TeamID=VALUES(TeamID)', [$it['EmployeeID'], $it['TeamID'], $y, $m]); } db()->commit(); json_response(['success' => true, 'saved' => count($items)]); } catch (Throwable $e) { db()->rollBack(); throw $e; } }

    if ($method === 'GET' && $path === '/patrol/monthly-report') {
        [$year, $month] = patrol_validate_ym($_GET['year'] ?? null, $_GET['month'] ?? null);
        $sessions = db_rows("SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,t.Name AS TeamName,t.PatrolGroup,t.Color,a.Name AS AreaName,a.Code AS AreaCode FROM patrol_sessions s JOIN patrol_teams t ON t.id=s.TeamID LEFT JOIN patrol_areas a ON a.id=s.AreaID WHERE YEAR(s.PatrolDate)=? AND MONTH(s.PatrolDate)=? ORDER BY s.TeamID,s.PatrolDate", [$year, $month]);
        $members = db_rows("SELECT tm.EmployeeID,tm.PatrolType,e.EmployeeName,COALESCE(mr.TeamID,tm.TeamID) AS EffectiveTeamID FROM patrol_team_members tm JOIN employees e ON e.EmployeeID=tm.EmployeeID LEFT JOIN patrol_member_rotation mr ON mr.EmployeeID=tm.EmployeeID AND mr.Year=? AND mr.Month=? ORDER BY COALESCE(mr.TeamID,tm.TeamID),FIELD(tm.PatrolType,'top','committee','management'),e.EmployeeName", [$year, $month]);
        $teamMap = [];
        foreach ($sessions as $s) { $id = (int) $s['TeamID']; if (!isset($teamMap[$id])) $teamMap[$id] = ['TeamID' => $id, 'TeamName' => $s['TeamName'], 'PatrolGroup' => $s['PatrolGroup'], 'Color' => $s['Color'], 'sessions' => [], 'members' => []]; $teamMap[$id]['sessions'][] = $s; }
        foreach ($members as $m) { $id = (int) $m['EffectiveTeamID']; if (isset($teamMap[$id])) $teamMap[$id]['members'][] = $m; }
        json_response(['success' => true, 'data' => array_values($teamMap), 'year' => $year, 'month' => $month]);
    }
    if ($method === 'GET' && $path === '/patrol/member-schedule') {
        [$year] = patrol_validate_ym($_GET['year'] ?? null, null, false);
        $members = db_rows("SELECT tm.EmployeeID,tm.TeamID AS BaseTeamID,tm.PatrolType,e.EmployeeName,e.Department,t.Name AS BaseTeamName,t.PatrolGroup FROM patrol_team_members tm JOIN employees e ON e.EmployeeID=tm.EmployeeID JOIN patrol_teams t ON t.id=tm.TeamID ORDER BY t.PatrolGroup,tm.PatrolType,e.EmployeeName");
        $rotations = db_rows('SELECT EmployeeID,TeamID,Month FROM patrol_member_rotation WHERE Year=?', [$year]);
        $rotMap = []; foreach ($rotations as $r) $rotMap[$r['EmployeeID']][(int) $r['Month']] = $r['TeamID'];
        $sessions = db_rows('SELECT s.TeamID,s.PatrolDate,s.PatrolRound,t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode FROM patrol_sessions s LEFT JOIN patrol_teams t ON t.id=s.TeamID LEFT JOIN patrol_areas a ON a.id=s.AreaID WHERE YEAR(s.PatrolDate)=? ORDER BY s.PatrolDate', [$year]);
        $sessMap = []; foreach ($sessions as $s) $sessMap[(int) $s['TeamID']][(int) substr((string) $s['PatrolDate'], 5, 2)][] = $s;
        $data = []; foreach ($members as $m) { $months = []; for ($i = 1; $i <= 12; $i++) { $teamId = $rotMap[$m['EmployeeID']][$i] ?? $m['BaseTeamID']; $all = $sessMap[(int) $teamId][$i] ?? []; $filtered = []; foreach ($all as $s) if (($m['PatrolType'] ?? '') === 'management' || (int) $s['PatrolRound'] === 2) $filtered[] = $s; $months[] = ['month' => $i, 'teamId' => $teamId, 'sessions' => $filtered]; } $m['months'] = $months; $data[] = $m; }
        json_response(['success' => true, 'data' => $data, 'year' => $year]);
    }

    if ($method === 'GET' && $path === '/patrol/rotation') { [$year, $month] = patrol_validate_ym($_GET['year'] ?? null, $_GET['month'] ?? null); json_response(['success' => true, 'data' => db_rows('SELECT r.TeamID,r.AreaID,r.Year,r.Month,COALESCE(r.PatrolRound,0) AS PatrolRound,t.Name AS TeamName,t.PatrolGroup,t.Color,a.Name AS AreaName,a.Code AS AreaCode FROM patrol_team_rotation r JOIN patrol_teams t ON t.id=r.TeamID LEFT JOIN patrol_areas a ON a.id=r.AreaID WHERE r.Year=? AND r.Month=? ORDER BY t.id,r.PatrolRound', [$year, $month])]); }
    if ($method === 'POST' && $path === '/patrol/rotation') { require_admin(); $items = json_body(); if (!patrol_is_list_array($items) || count($items) === 0) json_response(['success' => false, 'message' => 'Array payload is required.'], 400); db()->beginTransaction(); try { $saved = 0; foreach ($items as $it) { [$y, $m] = patrol_validate_ym($it['Year'] ?? null, $it['Month'] ?? null); db_execute('DELETE FROM patrol_team_rotation WHERE TeamID=? AND Year=? AND Month=?', [$it['TeamID'], $y, $m]); if (empty($it['r1']) && empty($it['r2'])) { db_execute('INSERT INTO patrol_team_rotation(TeamID,AreaID,Year,Month,PatrolRound) VALUES(?,NULL,?,?,0)', [$it['TeamID'], $y, $m]); $saved++; } else { if (!empty($it['r1'])) { db_execute('INSERT INTO patrol_team_rotation(TeamID,AreaID,Year,Month,PatrolRound) VALUES(?,?,?,?,1)', [$it['TeamID'], $it['r1'], $y, $m]); $saved++; } if (!empty($it['r2'])) { db_execute('INSERT INTO patrol_team_rotation(TeamID,AreaID,Year,Month,PatrolRound) VALUES(?,?,?,?,2)', [$it['TeamID'], $it['r2'], $y, $m]); $saved++; } } } db()->commit(); json_response(['success' => true, 'saved' => $saved]); } catch (Throwable $e) { db()->rollBack(); throw $e; } }
    if ($method === 'POST' && $path === '/patrol/generate-sessions') { require_admin(); $b = json_body(); [$year, $month] = patrol_validate_ym($b['year'] ?? $b['Year'] ?? null, $b['month'] ?? $b['Month'] ?? null); $rotations = db_rows('SELECT r.TeamID,r.AreaID,r.PatrolRound,t.Name AS TeamName,t.PatrolGroup,t.Color FROM patrol_team_rotation r JOIN patrol_teams t ON t.id=r.TeamID WHERE r.Year=? AND r.Month=? AND r.AreaID IS NOT NULL', [$year, $month]); if (!$rotations) json_response(['success' => false, 'message' => 'No rotation configured.'], 400); $weds = patrol_wednesdays($year, $month); $groupDates = ['A' => array_values(array_filter([$weds[0] ?? null, $weds[2] ?? null])), 'B' => array_values(array_filter([$weds[1] ?? null, $weds[3] ?? null]))]; $teams = []; foreach ($rotations as $r) { $tid = (int) $r['TeamID']; if (!isset($teams[$tid])) $teams[$tid] = ['TeamID' => $tid, 'TeamName' => $r['TeamName'], 'PatrolGroup' => $r['PatrolGroup'], 'rounds' => []]; $round = (int) $r['PatrolRound']; if ($round === 0) { $teams[$tid]['rounds'][1] = $r['AreaID']; $teams[$tid]['rounds'][2] = $r['AreaID']; } else $teams[$tid]['rounds'][$round] = $r['AreaID']; } $created = 0; db()->beginTransaction(); try { foreach ($teams as $team) { $dates = $groupDates[$team['PatrolGroup']] ?? []; foreach ($team['rounds'] as $round => $areaId) { $date = $dates[$round - 1] ?? null; if (!$date || !$areaId) continue; if ((int) (safe_scalar('SELECT COUNT(*) FROM patrol_sessions WHERE PatrolDate=? AND TeamID=? AND PatrolRound=?', [$date, $team['TeamID'], $round]) ?? 0) > 0) continue; db_execute('INSERT INTO patrol_sessions(SessionID,PatrolDate,TeamName,TeamID,AreaID,PatrolRound,Status) VALUES(?,?,?,?,?,?,?)', [patrol_uuid_v4(), $date, $team['TeamName'], $team['TeamID'], $areaId, $round, 'Pending']); $created++; } } db()->commit(); json_response(['success' => true, 'created' => $created, 'message' => 'Sessions generated.']); } catch (Throwable $e) { db()->rollBack(); throw $e; } }
    if ($method === 'GET' && $path === '/patrol/monthly-summary') { [$year, $month] = patrol_validate_ym($_GET['year'] ?? null, $_GET['month'] ?? null); json_response(['success' => true, 'data' => db_rows('SELECT s.*,s.SessionID AS id,s.PatrolDate AS ScheduledDate,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode FROM patrol_sessions s LEFT JOIN patrol_teams t ON t.id=s.TeamID LEFT JOIN patrol_areas a ON a.id=s.AreaID WHERE YEAR(s.PatrolDate)=? AND MONTH(s.PatrolDate)=? ORDER BY s.PatrolDate,s.PatrolRound', [$year, $month])]); }
    $p = route_params($path, '/patrol/sessions/:id/toggle-cancel'); if ($p !== null && $method === 'PATCH') { require_admin(); $r = db_row('SELECT Status FROM patrol_sessions WHERE SessionID=?', [$p['id']]); db_execute('UPDATE patrol_sessions SET Status=? WHERE SessionID=?', [($r['Status'] ?? '') === 'Cancelled' ? 'Pending' : 'Cancelled', $p['id']]); json_response(['success' => true]); }
    $p = route_params($path, '/patrol/sessions/:id');
    if ($p !== null && $method === 'PUT') {
        require_admin();
        $b = json_body();
        $session = db_row('SELECT SessionID,PatrolDate,TeamID,AreaID,PatrolRound,Status FROM patrol_sessions WHERE SessionID=?', [$p['id']]);
        if (!$session) json_response(['success' => false, 'message' => 'Session not found.'], 404);

        $sets = [];
        $vals = [];
        $targetDate = substr((string) $session['PatrolDate'], 0, 10);
        $targetTeam = (int) $session['TeamID'];
        $targetRound = (int) $session['PatrolRound'];

        if (array_key_exists('PatrolDate', $b)) {
            $date = patrol_valid_date($b['PatrolDate']);
            if (!$date) json_response(['success' => false, 'message' => 'PatrolDate is invalid.'], 400);
            $sets[] = 'PatrolDate=?';
            $vals[] = $date;
            $targetDate = $date;
        }
        if (array_key_exists('AreaID', $b)) {
            $areaId = ($b['AreaID'] === '' || $b['AreaID'] === null) ? null : (int) $b['AreaID'];
            $sets[] = 'AreaID=?';
            $vals[] = $areaId;
        }
        if (array_key_exists('Status', $b)) {
            $status = patrol_allowed_session_status($b['Status']);
            if (!$status) json_response(['success' => false, 'message' => 'Status is invalid.'], 400);
            $sets[] = 'Status=?';
            $vals[] = $status;
        }
        if (!$sets) json_response(['success' => false, 'message' => 'No session fields to update.'], 400);

        if ((int) (safe_scalar('SELECT COUNT(*) FROM patrol_sessions WHERE PatrolDate=? AND TeamID=? AND PatrolRound=? AND SessionID<>?', [$targetDate, $targetTeam, $targetRound, $p['id']]) ?? 0) > 0) {
            json_response(['success' => false, 'message' => 'A session for this team, round, and date already exists.'], 409);
        }

        $vals[] = $p['id'];
        db_execute('UPDATE patrol_sessions SET ' . implode(',', $sets) . ' WHERE SessionID=?', $vals);
        json_response(['success' => true, 'message' => 'Session updated.', 'data' => ['SessionID' => $p['id'], 'PatrolDate' => $targetDate]]);
    }
    if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_sessions WHERE SessionID=?', [$p['id']]); json_response(['success' => true]); }

    if ($method === 'GET' && $path === '/patrol/attendance-overview') {
        $year = patrol_query_year();
        $members = db_rows("SELECT pr.id AS RosterID,pr.EmployeeID,pr.TargetPerYear,e.EmployeeName AS Name,e.Position,e.Department FROM patrol_roster pr JOIN employees e ON e.EmployeeID=pr.EmployeeID WHERE pr.RosterGroup='top_management' ORDER BY pr.SortOrder,e.EmployeeName");
        $latestRow = db_row('SELECT MAX(PatrolDate) AS LatestDate FROM patrol_attendance WHERE YEAR(PatrolDate)=?', [$year]);
        $result = [];
        $requiredToDateTotal = 0;
        $completedToDateTotal = 0;
        $yearlyTargetTotal = 0;
        $fullYearCompletedTotal = 0;
        $scheduledTotal = 0;
        $missingToDateTotal = 0;
        $upcomingTotal = 0;
        foreach ($members as $m) {
            $detail = patrol_attendance_detail_top((string) $m['EmployeeID'], $year);
            $summary = $detail['summary'];
            $requiredToDate = (int) ($summary['requiredToDate'] ?? 0);
            $completedToDate = (int) ($summary['completedScheduled'] ?? 0);
            $yearlyTarget = (int) ($summary['yearlyTarget'] ?? $m['TargetPerYear']);
            $fullYearCompleted = (int) ($summary['completed'] ?? 0);
            $progressPct = patrol_pct($completedToDate, $requiredToDate);
            $fullYearPct = patrol_pct($fullYearCompleted, $yearlyTarget);
            $requiredToDateTotal += $requiredToDate;
            $completedToDateTotal += $completedToDate;
            $yearlyTargetTotal += $yearlyTarget;
            $fullYearCompletedTotal += $fullYearCompleted;
            $scheduledTotal += (int) ($summary['scheduledTotal'] ?? 0);
            $missingToDateTotal += (int) ($summary['missingToDate'] ?? 0);
            $upcomingTotal += (int) ($summary['upcoming'] ?? 0);
            $result[] = [
                'RosterID' => $m['RosterID'],
                'EmployeeID' => $m['EmployeeID'],
                'Name' => $m['Name'],
                'Position' => $m['Position'],
                'Department' => $m['Department'],
                'TargetPerYear' => $yearlyTarget,
                'Year' => $year,
                'Total' => $requiredToDate,
                'Attended' => $completedToDate,
                'Percent' => $progressPct,
                'ProgressToDatePct' => $progressPct,
                'FullYearPct' => $fullYearPct,
                'fullYearPct' => $fullYearPct,
                'RequiredToDate' => $requiredToDate,
                'CompletedToDate' => $completedToDate,
                'CompletedScheduled' => $completedToDate,
                'ScheduledTotal' => (int) ($summary['scheduledTotal'] ?? 0),
                'MissingToDate' => (int) ($summary['missingToDate'] ?? 0),
                'Upcoming' => (int) ($summary['upcoming'] ?? 0),
                'YearlyTarget' => $yearlyTarget,
                'FullYearCompleted' => $fullYearCompleted,
            ];
        }
        json_response(['success' => true, 'data' => ['members' => $result, 'summary' => [
            'totalSessions' => $requiredToDateTotal,
            'totalAttended' => $completedToDateTotal,
            'percent' => patrol_pct($completedToDateTotal, $requiredToDateTotal),
            'progressToDatePct' => patrol_pct($completedToDateTotal, $requiredToDateTotal),
            'requiredToDate' => $requiredToDateTotal,
            'completedToDate' => $completedToDateTotal,
            'scheduledTotal' => $scheduledTotal,
            'missingToDate' => $missingToDateTotal,
            'upcoming' => $upcomingTotal,
            'yearlyTargetTotal' => $yearlyTargetTotal,
            'fullYearCompleted' => $fullYearCompletedTotal,
            'fullYearPct' => patrol_pct($fullYearCompletedTotal, $yearlyTargetTotal),
            'latestDate' => $latestRow['LatestDate'] ?? null,
            'year' => $year,
        ]]]);
    }
    if ($method === 'GET' && $path === '/patrol/member-attendance') { if (empty($_GET['employeeId'])) json_response(['success' => false, 'message' => 'employeeId is required.'], 400); json_response(['success' => true, 'data' => db_rows('SELECT id,PatrolDate,PatrolType,Area,Notes,ScheduledSessionID FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? ORDER BY PatrolDate DESC,id DESC', [$_GET['employeeId'], patrol_query_year()])]); }
    if ($method === 'GET' && $path === '/patrol/my-self-patrol') { $year = patrol_query_year(); $month = patrol_query_month(); $emp = db_row('SELECT mp.IsSupervisorPatrol,e.Position FROM employees e LEFT JOIN master_positions mp ON mp.Name=e.Position WHERE e.EmployeeID=?', [$uid]); $roster = db_row("SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$uid]); if (!$roster) json_response(['success' => true, 'data' => ['isSupervisorPatrol' => false, 'checkins' => []]]); $detail = patrol_attendance_detail_supervisor($uid, $year); $period = []; foreach ($detail['periods'] ?? [] as $p) { if ((int) ($p['month'] ?? 0) === $month) { $period = $p; break; } } $items = $period['items'] ?? []; $open = array_values(array_filter($items, static function ($item) { return empty($item['isCompleted']); })); json_response(['success' => true, 'data' => ['isSupervisorPatrol' => true, 'position' => $emp['Position'] ?? ($detail['employee']['Position'] ?? ''), 'checkins' => $period['records'] ?? [], 'target' => (int) ($period['monthlyRequirement'] ?? ($period['required'] ?? 0)), 'yearlyTarget' => (int) ($detail['summary']['yearlyTarget'] ?? 0), 'yearlyCompleted' => (int) ($detail['summary']['completed'] ?? 0), 'targetSource' => $detail['targetSource'] ?? ($detail['summary']['targetSource'] ?? 'patrol_roster'), 'schedule' => $items, 'openSchedule' => $open]]); }
    if ($method === 'POST' && $path === '/patrol/self-checkin') { $b = json_body(); $date = patrol_valid_date($b['CheckinDate'] ?? null); if (!$date) json_response(['success' => false, 'message' => 'CheckinDate is required.'], 400); $emp = db_row('SELECT mp.IsSupervisorPatrol FROM employees e LEFT JOIN master_positions mp ON mp.Name=e.Position WHERE e.EmployeeID=?', [$uid]); if (!$emp || empty($emp['IsSupervisorPatrol'])) { $roster = db_row("SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$uid]); if (!$roster) json_response(['success' => false, 'message' => 'Position is not allowed for Self-Patrol.'], 403); } $resolved = patrol_resolve_supervisor_scheduled_session($uid, $date, $b['ScheduledSessionID'] ?? null); $effectiveDate = $resolved['date']; $session = $resolved['session'] ?? null; db_execute('INSERT INTO patrol_self_checkin(EmployeeID,CheckinDate,Location,Notes,Year,Month,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?)', [$uid, $effectiveDate, $b['Location'] ?? null, $b['Notes'] ?? null, (int) substr($effectiveDate, 0, 4), (int) substr($effectiveDate, 5, 2), $uid, $session['id'] ?? null]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/self-checkin/:id'); if ($p !== null && $method === 'DELETE') { $row = db_row('SELECT EmployeeID FROM patrol_self_checkin WHERE id=?', [$p['id']]); if (!$row) json_response(['success' => false, 'message' => 'Not found.'], 404); if ((string) $row['EmployeeID'] !== $uid && !patrol_is_admin($user)) json_response(['success' => false, 'message' => 'Permission denied.'], 403); db_execute('DELETE FROM patrol_self_checkin WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/patrol/supervisor-overview') {
        $year = patrol_query_year();
        $members = db_rows("SELECT pr.id AS RosterID,pr.EmployeeID,pr.TargetPerYear,e.EmployeeName,e.Department,e.Position FROM patrol_roster pr JOIN employees e ON e.EmployeeID=pr.EmployeeID WHERE pr.RosterGroup='supervisor' ORDER BY pr.SortOrder,e.Department,e.EmployeeName");
        foreach ($members as &$m) {
            $detail = patrol_attendance_detail_supervisor((string) $m['EmployeeID'], $year);
            $summary = $detail['summary'];
            $requiredToDate = (int) ($summary['requiredToDate'] ?? 0);
            $completedToDate = (int) ($summary['completedToDateCapped'] ?? 0);
            $yearlyTarget = (int) ($summary['yearlyTarget'] ?? $m['TargetPerYear']);
            $fullYearCompleted = (int) ($summary['completed'] ?? 0);
            $progressPct = patrol_pct($completedToDate, $requiredToDate);
            $fullYearPct = patrol_pct($fullYearCompleted, $yearlyTarget);
            $m['attended'] = $completedToDate;
            $m['target'] = $requiredToDate;
            $m['percent'] = $progressPct;
            $m['progressToDatePct'] = $progressPct;
            $m['fullYearPct'] = $fullYearPct;
            $m['yearlyTarget'] = $yearlyTarget;
            $m['fullYearCompleted'] = $fullYearCompleted;
            $m['requiredToDate'] = $requiredToDate;
            $m['completedToDateCapped'] = $completedToDate;
            $m['missingToDate'] = (int) ($summary['missingToDate'] ?? 0);
            $m['upcomingMonths'] = (int) ($summary['upcomingMonths'] ?? 0);
            $m['monthlyRequirement'] = (int) ($detail['monthlyRequirement'] ?? patrol_current_monthly_requirement($year, $yearlyTarget));
        }
        unset($m);
        json_response(['success' => true, 'data' => $members]);
    }
    if ($method === 'GET' && $path === '/patrol/roster') { $group = trim((string) ($_GET['group'] ?? '')); json_response(['success' => true, 'data' => db_rows('SELECT pr.id,pr.EmployeeID,pr.RosterGroup,pr.TargetPerYear,pr.SortOrder,e.EmployeeName,e.Position,e.Department FROM patrol_roster pr JOIN employees e ON e.EmployeeID=pr.EmployeeID' . ($group ? ' WHERE pr.RosterGroup=?' : '') . ' ORDER BY pr.RosterGroup,pr.SortOrder,e.EmployeeName', $group ? [$group] : [])]); }
    if ($method === 'POST' && $path === '/patrol/roster') { require_admin(); $b = json_body(); if (empty($b['EmployeeID']) || empty($b['RosterGroup']) || !in_array($b['RosterGroup'], ['top_management', 'supervisor'], true)) json_response(['success' => false, 'message' => 'Invalid roster payload.'], 400); db_execute('INSERT INTO patrol_roster(EmployeeID,RosterGroup,TargetPerYear,SortOrder) VALUES(?,?,?,?)', [$b['EmployeeID'], $b['RosterGroup'], (int) ($b['TargetPerYear'] ?? 12), (int) ($b['SortOrder'] ?? 99)]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/roster/:id'); if ($p !== null && $method === 'PUT') { require_admin(); $b = json_body(); if ((int) ($b['TargetPerYear'] ?? 0) < 1) json_response(['success' => false, 'message' => 'TargetPerYear is invalid.'], 400); db_execute('UPDATE patrol_roster SET TargetPerYear=?,SortOrder=? WHERE id=?', [(int) $b['TargetPerYear'], (int) ($b['SortOrder'] ?? 99), $p['id']]); json_response(['success' => true]); } if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_roster WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/patrol/my-missed-sessions') {
        $year = patrol_query_year();
        $sessions = patrol_top_sessions($uid, $year);
        $completed = patrol_completed_session_ids($uid, $year);
        $out = [];
        foreach ($sessions as $s) {
            $date = substr((string) $s['PatrolDate'], 0, 10);
            if ($date >= date('Y-m-d')) continue;
            if (!empty($completed[(string) $s['id']])) continue;
            if (db_row('SELECT id FROM patrol_attendance WHERE UserID=? AND DATE(PatrolDate)=? AND (ScheduledSessionID IS NULL OR ScheduledSessionID="") LIMIT 1', [$uid, $date])) continue;
            $out[] = ['id' => $s['id'], 'ScheduledSessionID' => $s['id'], 'PatrolDate' => $date, 'PatrolRound' => (int) ($s['PatrolRound'] ?? 0), 'AreaName' => $s['AreaName'] ?? '', 'AreaCode' => $s['AreaCode'] ?? '', 'TeamName' => $s['TeamName'] ?? ''];
        }
        json_response(['success' => true, 'data' => $out]);
    }
    if ($method === 'GET' && $path === '/patrol/supervisor-checkins') { if (empty($_GET['employeeId'])) json_response(['success' => false, 'message' => 'employeeId is required.'], 400); json_response(['success' => true, 'data' => db_rows('SELECT id,CheckinDate,Location,Notes,Year,Month,RecordedBy FROM patrol_self_checkin WHERE EmployeeID=? AND Year=? ORDER BY CheckinDate DESC', [$_GET['employeeId'], patrol_query_year()])]); }
    if ($method === 'POST' && $path === '/patrol/admin-record') { require_admin(); $b = json_body(); $date = patrol_valid_date($b['PatrolDate'] ?? null); if (empty($b['EmployeeID']) || !$date) json_response(['success' => false, 'message' => 'EmployeeID and PatrolDate are required.'], 400); if (trim((string) ($b['ScheduledSessionID'] ?? '')) === '') json_response(['success' => false, 'message' => 'ScheduledSessionID is required for admin on-behalf patrol records.'], 400); $emp = db_row('SELECT e.EmployeeName,t.Name AS TeamName FROM employees e LEFT JOIN patrol_team_members tm ON tm.EmployeeID=e.EmployeeID LEFT JOIN patrol_teams t ON t.id=tm.TeamID WHERE e.EmployeeID=? LIMIT 1', [$b['EmployeeID']]); if (!$emp) json_response(['success' => false, 'message' => 'Employee not found.'], 404); $resolved = patrol_resolve_scheduled_session((string) $b['EmployeeID'], $date, $b['ScheduledSessionID'] ?? null); $session = $resolved['session'] ?? null; $area = trim((string) ($b['Area'] ?? '')) ?: null; if (!$area && $session) $area = $session['AreaName'] ?: ($session['AreaCode'] ?? null); db_execute('INSERT INTO patrol_attendance(UserID,UserName,TeamName,WeekNumber,PatrolDate,Year,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [$b['EmployeeID'], $emp['EmployeeName'], $emp['TeamName'] ?? '', patrol_week($date), $date, (int) substr($date, 0, 4), patrol_allowed_type($b['PatrolType'] ?? null), $area, $b['Notes'] ?? null, $uid, $session['id'] ?? null]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/admin-record/:id'); if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_attendance WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'POST' && $path === '/patrol/admin-record/supervisor') { require_admin(); $b = json_body(); $date = patrol_valid_date($b['CheckinDate'] ?? null); if (empty($b['EmployeeID']) || !$date) json_response(['success' => false, 'message' => 'EmployeeID and CheckinDate are required.'], 400); if (trim((string) ($b['ScheduledSessionID'] ?? '')) === '') json_response(['success' => false, 'message' => 'ScheduledSessionID is required for admin on-behalf self-patrol records.'], 400); $resolved = patrol_resolve_supervisor_scheduled_session((string) $b['EmployeeID'], $date, $b['ScheduledSessionID'] ?? null); $effectiveDate = $resolved['date']; $session = $resolved['session'] ?? null; $location = $b['Location'] ?? null; if (!$location && $session) $location = $session['AreaName'] ?? ($session['AreaCode'] ?? null); db_execute('INSERT INTO patrol_self_checkin(EmployeeID,CheckinDate,Location,Notes,Year,Month,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?)', [$b['EmployeeID'], $effectiveDate, $location, $b['Notes'] ?? null, (int) substr($effectiveDate, 0, 4), (int) substr($effectiveDate, 5, 2), $uid, $session['id'] ?? null]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/admin-record/supervisor/:id'); if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_self_checkin WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/patrol/employee-search') { require_admin(); $q = '%' . trim((string) ($_GET['q'] ?? '')) . '%'; json_response(['success' => true, 'data' => db_rows('SELECT EmployeeID,EmployeeName,Department,Position FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? ORDER BY EmployeeName LIMIT 30', [$q, $q, $q])]); }

    return false;
}
