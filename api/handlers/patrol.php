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
    $role = trim((string) ($user['role'] ?? $user['Role'] ?? ''));
    if (strcasecmp($role, 'Admin') === 0) {
        return true;
    }
    $employeeId = trim((string) ($user['id'] ?? $user['EmployeeID'] ?? $user['employeeId'] ?? ''));
    if ($employeeId === '') {
        return false;
    }
    $row = db_row('SELECT Role FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]);
    return strcasecmp(trim((string) ($row['Role'] ?? '')), 'Admin') === 0;
}

function patrol_require_admin(array $user): void
{
    if (!patrol_is_admin($user)) {
        json_response(['success' => false, 'message' => 'Permission denied. Admin access required.'], 403);
    }
}

function patrol_can_review_leave(array $user): bool
{
    $role = strtolower(trim((string) ($user['role'] ?? $user['Role'] ?? '')));
    return patrol_is_admin($user) || strpos($role, 'safety') !== false;
}

function patrol_log_audit(array $user, string $action, string $targetType = '', $targetId = null, string $detail = '', array $metadata = []): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS admin_auditlogs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            AdminID VARCHAR(50) DEFAULT NULL,
            AdminName VARCHAR(255) DEFAULT NULL,
            Role VARCHAR(50) DEFAULT NULL,
            Department VARCHAR(100) DEFAULT NULL,
            Module VARCHAR(80) DEFAULT NULL,
            Action VARCHAR(100) DEFAULT NULL,
            Method VARCHAR(10) DEFAULT NULL,
            Path VARCHAR(255) DEFAULT NULL,
            StatusCode INT DEFAULT NULL,
            TargetType VARCHAR(100) DEFAULT NULL,
            TargetID VARCHAR(100) DEFAULT NULL,
            Detail TEXT DEFAULT NULL,
            Metadata TEXT DEFAULT NULL,
            IPAddress VARCHAR(80) DEFAULT NULL,
            UserAgent VARCHAR(255) DEFAULT NULL,
            ActionTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_module(Module),
            KEY idx_action_time(ActionTime)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db_execute(
            'INSERT INTO admin_auditlogs(AdminID,AdminName,Role,Department,Module,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                (string) ($user['id'] ?? $user['EmployeeID'] ?? ''),
                patrol_user_name($user),
                (string) ($user['role'] ?? $user['Role'] ?? ''),
                (string) ($user['department'] ?? $user['Department'] ?? ''),
                'patrol',
                $action,
                (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
                (string) ($_SERVER['REQUEST_URI'] ?? ''),
                200,
                $targetType,
                $targetId === null ? null : (string) $targetId,
                $detail,
                $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
                substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
    } catch (Throwable $e) {
        error_log('[patrol] audit log failed: ' . $e->getMessage());
    }
}

function patrol_can_view_roster_attendance_detail(string $employeeId, string $group): bool
{
    if (!in_array($group, ['top_management', 'supervisor'], true)) {
        return false;
    }
    return (bool) db_row('SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup=? LIMIT 1', [$employeeId, $group]);
}

function patrol_normalize_flexible_monthly_requirement($value): int
{
    $raw = $value;
    if (is_string($raw)) {
        $trimmed = trim($raw);
        if (substr($trimmed, 0, 1) === '{') {
            $parsed = json_decode($trimmed, true);
            if (is_array($parsed)) {
                $raw = $parsed['monthlyRequirement'] ?? ($parsed['value'] ?? $trimmed);
            } else {
                $raw = $trimmed;
            }
        } else {
            $raw = $trimmed;
        }
    }
    $n = is_numeric($raw) ? (int) $raw : 2;
    return max(1, min(10, $n));
}

function patrol_flexible_monthly_requirement(): array
{
    $row = db_row("SELECT value FROM app_settings WHERE key_name='patrol_flexible_monthly_requirement' LIMIT 1");
    return [
        'monthlyRequirement' => patrol_normalize_flexible_monthly_requirement($row['value'] ?? null),
        'targetSource' => $row ? 'app_settings' : 'flexible_default',
    ];
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

function patrol_days_in_month(int $year, int $month): array
{
    $date = new DateTime(sprintf('%04d-%02d-01', $year, $month));
    $last = (int) $date->format('t');
    $out = [];
    for ($day = 1; $day <= $last; $day++) {
        $out[] = sprintf('%04d-%02d-%02d', $year, $month, $day);
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
        if (!patrol_issue_multi_values($data['HazardType'] ?? null)) return 'HazardType is required.';
        if (empty($data['HazardDescription'])) return 'HazardDescription is required.';
    }
    if ($action === 'TEMP' && trim((string) ($data['TempDescription'] ?? '')) === '') return 'TempDescription is required.';
    if ($action === 'CLOSE') {
        if (trim((string) ($data['ActionDescription'] ?? '')) === '') return 'ActionDescription is required.';
        if (empty($data['FinishDate'])) return 'FinishDate is required.';
    }
    return null;
}

function patrol_issue_multi_values($value): array
{
    if (is_array($value)) {
        return array_values(array_filter(array_map(static fn($v) => trim((string) $v), $value), static fn($v) => $v !== ''));
    }
    $text = trim((string) ($value ?? ''));
    if ($text === '') return [];
    if (substr($text, 0, 1) === '[') {
        $parsed = json_decode($text, true);
        if (is_array($parsed)) {
            return array_values(array_filter(array_map(static fn($v) => trim((string) $v), $parsed), static fn($v) => $v !== ''));
        }
    }
    return array_values(array_filter(array_map('trim', preg_split('/\s*(?:\|+|;)\s*/', $text) ?: []), static fn($v) => $v !== ''));
}

function patrol_issue_multi_display($value, string $fallback = '-'): string
{
    $values = patrol_issue_multi_values($value);
    return $values ? implode(', ', $values) : $fallback;
}

function patrol_normalize_validate_issue_classification(array &$data): ?string
{
    $hazards = array_values(array_unique(patrol_issue_multi_values($data['HazardType'] ?? null)));
    $departments = array_values(array_unique(patrol_issue_multi_values($data['ResponsibleDept'] ?? null)));
    $units = array_values(array_unique(patrol_issue_multi_values($data['ResponsibleUnit'] ?? null)));
    $hazardIds = [];
    foreach ($hazards as $hazard) {
        if (!preg_match('/^STOP\s*([1-6])(?:\s|$)/i', $hazard, $matches)) return 'HazardType contains an invalid STOP type.';
        $hazardIds[] = (int) $matches[1];
    }
    if ($departments) {
        $validDepartments = array_column(db_rows('SELECT Name FROM master_departments'), 'Name');
        foreach ($departments as $department) {
            if (!in_array($department, $validDepartments, true)) return 'ResponsibleDept contains an unknown department.';
        }
    }
    if ($units) {
        if (!$departments) return 'ResponsibleUnit requires at least one ResponsibleDept.';
        $validUnits = [];
        foreach (db_rows('SELECT u.name,d.Name AS Department FROM master_safetyunits u JOIN master_departments d ON d.id=u.department_id') as $row) {
            if (in_array((string) ($row['Department'] ?? ''), $departments, true)) {
                $validUnits[] = (string) ($row['name'] ?? '');
            }
        }
        foreach ($units as $unit) {
            if (!in_array($unit, $validUnits, true)) return 'ResponsibleUnit must belong to a selected ResponsibleDept.';
        }
    }
    $hazardIds = array_values(array_unique($hazardIds));
    $data['HazardType'] = implode('|', array_map(static fn($id) => 'STOP ' . $id, $hazardIds));
    $data['ResponsibleDept'] = implode('|', $departments);
    $data['ResponsibleUnit'] = implode('|', $units);
    $textLength = static fn(string $value): int => function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    if ($textLength($data['HazardType']) > 100) return 'Too many STOP types selected.';
    if ($textLength($data['ResponsibleDept']) > 100) return 'Selected ResponsibleDept values are too long.';
    if ($textLength($data['ResponsibleUnit']) > 200) return 'Selected ResponsibleUnit values are too long.';
    return null;
}

function patrol_issue_actor(array $user): array
{
    $employeeId = trim((string) ($user['id'] ?? $user['EmployeeID'] ?? ''));
    if ($employeeId === '') return $user;
    return db_row('SELECT EmployeeID AS id,Department AS department,Unit AS unit,Role AS role FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]) ?: $user;
}

function patrol_can_update_issue(array $user, array $issue): bool
{
    if (trim((string) ($issue['CurrentStatus'] ?? '')) === 'Closed') return false;
    $employeeId = trim((string) ($user['id'] ?? $user['EmployeeID'] ?? ''));
    if ($employeeId !== '' && $employeeId === trim((string) ($issue['ReporterID'] ?? ''))) return true;
    $department = trim((string) ($user['department'] ?? $user['Department'] ?? ''));
    $unit = trim((string) ($user['unit'] ?? $user['Unit'] ?? ''));
    $departments = patrol_issue_multi_values($issue['ResponsibleDept'] ?? null);
    $units = patrol_issue_multi_values($issue['ResponsibleUnit'] ?? null);
    return ($department !== '' && in_array($department, $departments, true))
        || ($unit !== '' && in_array($unit, $units, true));
}

function patrol_issue_initial_changed(array $data, array $issue): bool
{
    foreach (['DateFound', 'FoundByTeam', 'Area', 'MachineName', 'HazardDescription', 'Rank', 'DueDate', 'BeforeImage'] as $field) {
        if (!array_key_exists($field, $data)) continue;
        $incoming = trim((string) ($data[$field] ?? ''));
        $current = trim((string) ($issue[$field] ?? ''));
        if (in_array($field, ['DateFound', 'DueDate'], true)) {
            $incoming = $incoming !== '' && strtotime($incoming) !== false ? date('Y-m-d', strtotime($incoming)) : '';
            $current = $current !== '' && strtotime($current) !== false ? date('Y-m-d', strtotime($current)) : '';
        }
        if ($incoming !== $current) return true;
    }
    foreach (['HazardType', 'ResponsibleDept', 'ResponsibleUnit'] as $field) {
        if (!array_key_exists($field, $data)) continue;
        $incoming = array_values(array_unique(patrol_issue_multi_values($data[$field] ?? null)));
        $current = array_values(array_unique(patrol_issue_multi_values($issue[$field] ?? null)));
        sort($incoming);
        sort($current);
        if ($incoming !== $current) return true;
    }
    return false;
}

function patrol_require_issue_progress_access(array $user, array $issue, array $data, array $stored): void
{
    if (patrol_is_admin($user)) return;
    if (!patrol_can_update_issue($user, $issue)) {
        patrol_cleanup_urls($stored);
        json_response(['success' => false, 'message' => 'Closed issues are view-only.'], 403);
    }
    if (($issue['CurrentStatus'] ?? '') === 'Closed') {
        patrol_cleanup_urls($stored);
        json_response(['success' => false, 'message' => 'Closed issues are view-only.'], 403);
    }
    if (patrol_issue_initial_changed($data, $issue)) {
        patrol_cleanup_urls($stored);
        json_response(['success' => false, 'message' => 'Initial issue details cannot be changed after submission.'], 403);
    }
}

function patrol_blank_to_null($value): ?string
{
    $text = trim((string) ($value ?? ''));
    return $text === '' ? null : $text;
}

function patrol_run_issue_transaction(callable $work): void
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $work();
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function patrol_issue_update_status(array $issue, bool $isAdminAction, bool $hasTemp, bool $hasFinal): string
{
    $current = (string) ($issue['CurrentStatus'] ?? '');
    if ($isAdminAction) {
        if ($hasFinal) return 'Closed';
        if ($hasTemp) return 'Temporary';
        return $current !== '' ? $current : 'Open';
    }
    return ($hasTemp || $current === 'Temporary') ? 'Temporary' : ($current ?: 'Open');
}

function patrol_issue_actor_meta(array $user): array
{
    $id = trim((string) ($user['id'] ?? $user['EmployeeID'] ?? $user['employeeId'] ?? ''));
    $name = trim((string) ($user['name'] ?? $user['EmployeeName'] ?? $user['employeeName'] ?? $id));
    $role = trim((string) ($user['role'] ?? $user['Role'] ?? ''));
    return ['id' => $id !== '' ? $id : null, 'name' => $name !== '' ? $name : null, 'role' => $role !== '' ? $role : null];
}

function patrol_record_issue_event($issueId, string $eventType, array $actor, ?string $fromStatus = null, ?string $toStatus = null, ?string $comment = null, array $images = [], array $metadata = []): array
{
    if (!$issueId || $eventType === '') return ['recorded' => false, 'reason' => 'missing issueId/eventType'];
    $actorMeta = patrol_issue_actor_meta($actor);
    try {
        db_execute(
            'INSERT INTO patrol_issue_events
             (IssueID, EventType, ActorID, ActorName, ActorRole, FromStatus, ToStatus, Comment, BeforeImage, TempImage, AfterImage, Metadata)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $issueId,
                $eventType,
                $actorMeta['id'],
                $actorMeta['name'],
                $actorMeta['role'],
                $fromStatus,
                $toStatus,
                $comment,
                $images['beforeImage'] ?? $images['BeforeImage'] ?? null,
                $images['tempImage'] ?? $images['TempImage'] ?? null,
                $images['afterImage'] ?? $images['AfterImage'] ?? null,
                $metadata ? json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            ]
        );
        return ['recorded' => true];
    } catch (Throwable $e) {
        error_log('[patrol/issue-event] record failed: ' . $e->getMessage());
        return ['recorded' => false, 'reason' => $e->getMessage()];
    }
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
        "ALTER TABLE patrol_self_checkin ADD COLUMN PatrolType VARCHAR(20) DEFAULT 'normal'",
        'ALTER TABLE patrol_self_checkin ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_self_checkin ADD INDEX idx_patrol_self_checkin_session (ScheduledSessionID)',
        'ALTER TABLE patrol_issues ADD COLUMN ReporterID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN OpenedByID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN OpenedAt DATETIME DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN TemporaryByID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN TemporaryAt DATETIME DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN ClosedByID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN ClosedAt DATETIME DEFAULT NULL',
        "ALTER TABLE patrol_issues ADD COLUMN CloseApprovalStatus VARCHAR(30) NOT NULL DEFAULT 'None'",
        'ALTER TABLE patrol_issues ADD COLUMN CloseRequestedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN CloseRequestedAt DATETIME DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN CloseApprovedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN CloseApprovedAt DATETIME DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN CloseRejectedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN CloseRejectedAt DATETIME DEFAULT NULL',
        'ALTER TABLE patrol_issues ADD COLUMN CloseRejectReason TEXT DEFAULT NULL',
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
        PatrolType VARCHAR(20) DEFAULT 'normal',
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
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_leave_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        EmployeeID VARCHAR(50) NOT NULL,
        RosterGroup VARCHAR(30) NOT NULL,
        ScheduledSessionID VARCHAR(80) NOT NULL,
        ScheduledDate DATE NOT NULL,
        LeaveType VARCHAR(80) DEFAULT NULL,
        Destination VARCHAR(255) DEFAULT NULL,
        Reason TEXT NOT NULL,
        AttachmentUrl TEXT DEFAULT NULL,
        Status VARCHAR(30) NOT NULL DEFAULT 'Approved',
        CreatedBy VARCHAR(50) DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ReviewedBy VARCHAR(50) DEFAULT NULL,
        ReviewNote TEXT DEFAULT NULL,
        ReviewedAt DATETIME DEFAULT NULL,
        UNIQUE KEY uq_patrol_leave_session(EmployeeID,RosterGroup,ScheduledSessionID),
        KEY idx_employee_year(EmployeeID,ScheduledDate),
        KEY idx_status(Status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    try {
        db()->exec('ALTER TABLE patrol_leave_requests ADD COLUMN ReviewNote TEXT DEFAULT NULL AFTER ReviewedBy');
    } catch (Throwable $e) {}
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_rank_a_hotspot_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        AreaName VARCHAR(150) NOT NULL,
        DisplayName VARCHAR(150) DEFAULT NULL,
        MapXPercent DECIMAL(7,3) NOT NULL,
        MapYPercent DECIMAL(7,3) NOT NULL,
        IsPinned TINYINT(1) NOT NULL DEFAULT 1,
        UpdatedBy VARCHAR(100) DEFAULT NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_patrol_rank_a_hotspot_area(AreaName)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_rank_a_hotspot_issue_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        IssueID BIGINT NOT NULL,
        MapXPercent DECIMAL(7,3) NOT NULL,
        MapYPercent DECIMAL(7,3) NOT NULL,
        UpdatedBy VARCHAR(100) DEFAULT NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_patrol_rank_a_hotspot_issue(IssueID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS patrol_issue_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        IssueID BIGINT NOT NULL,
        EventType VARCHAR(60) NOT NULL,
        ActorID VARCHAR(50) DEFAULT NULL,
        ActorName VARCHAR(255) DEFAULT NULL,
        ActorRole VARCHAR(80) DEFAULT NULL,
        FromStatus VARCHAR(40) DEFAULT NULL,
        ToStatus VARCHAR(40) DEFAULT NULL,
        Comment TEXT DEFAULT NULL,
        BeforeImage TEXT DEFAULT NULL,
        TempImage TEXT DEFAULT NULL,
        AfterImage TEXT DEFAULT NULL,
        Metadata MEDIUMTEXT DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_issue_created (IssueID, CreatedAt),
        KEY idx_event_type (EventType),
        KEY idx_actor (ActorID)
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

function patrol_pass_threshold(int $required, int $passPct = 80): int
{
    return (int) ceil(max(0, $required) * max(0, min(100, $passPct)) / 100);
}

function patrol_phase3_metrics(array $args): array
{
    $requiredToDate = (int) ($args['requiredToDate'] ?? 0);
    $yearlyTarget = (int) ($args['yearlyTarget'] ?? 0);
    $checkedToDate = (int) ($args['checkedToDate'] ?? 0);
    $checkedYear = (int) ($args['checkedYear'] ?? 0);
    $leaveStats = $args['leaveStats'] ?? [];
    $passPct = (int) ($args['passPct'] ?? 80);
    $thresholdToDate = patrol_pass_threshold($requiredToDate, $passPct);
    $thresholdYear = patrol_pass_threshold($yearlyTarget, $passPct);
    $acceptedCoverageToDate = (int) ($leaveStats['acceptedCoverageToDate'] ?? 0);
    $acceptedCoverageYear = (int) ($leaveStats['acceptedCoverageYear'] ?? 0);
    $actualPassToDate = $checkedToDate >= $thresholdToDate;
    $actualPassYear = $checkedYear >= $thresholdYear;
    $acceptedPassToDate = $acceptedCoverageToDate >= $thresholdToDate;
    $acceptedPassYear = $acceptedCoverageYear >= $thresholdYear;
    return [
        'passThresholdToDate' => $thresholdToDate,
        'passThresholdYear' => $thresholdYear,
        'actualPassToDate' => $actualPassToDate,
        'actualPassYear' => $actualPassYear,
        'acceptedPassToDate' => $acceptedPassToDate,
        'acceptedPassYear' => $acceptedPassYear,
        'checkedToDate' => $checkedToDate,
        'checkedYear' => $checkedYear,
        'leaveYear' => (int) ($leaveStats['leaveYear'] ?? 0),
        'allowedLeaveYear' => (int) ($leaveStats['allowedLeaveYear'] ?? 0),
        'acceptedLeaveYear' => (int) ($leaveStats['acceptedLeaveYear'] ?? 0),
        'overLeaveYear' => (int) ($leaveStats['overLeaveYear'] ?? 0),
        'leaveRemainingYear' => (int) ($leaveStats['leaveRemainingYear'] ?? 0),
        'acceptedCoverageToDate' => $acceptedCoverageToDate,
        'acceptedCoverageYear' => $acceptedCoverageYear,
        'finalStatus' => $actualPassToDate ? 'Pass' : ($acceptedPassToDate ? 'Accepted by leave' : 'Below target'),
    ];
}

function patrol_leave_status($value): string
{
    $status = trim((string) ($value ?: 'Approved'));
    return in_array($status, ['Pending', 'Approved', 'Rejected', 'Cancelled'], true) ? $status : 'Approved';
}

function patrol_leave_accepted(array $row): bool
{
    return (string) ($row['Status'] ?? '') === 'Approved';
}

function patrol_leave_blocking(array $row): bool
{
    return in_array((string) ($row['Status'] ?? ''), ['Pending', 'Approved'], true);
}

function patrol_leave_rows(string $employeeId, string $group, int $year, array $filters = []): array
{
    $where = ['RosterGroup=?', 'YEAR(ScheduledDate)=?'];
    $params = [$group, $year];
    if ($employeeId !== '') {
        array_unshift($where, 'EmployeeID=?');
        array_unshift($params, $employeeId);
    }
    if (!empty($filters['status'])) {
        $where[] = 'Status=?';
        $params[] = patrol_leave_status($filters['status']);
    }
    $rows = db_rows(
        "SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,DATE_FORMAT(ScheduledDate,'%Y-%m-%d') AS ScheduledDate,
                LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,CreatedAt,ReviewedBy,ReviewNote,ReviewedAt
         FROM patrol_leave_requests
         WHERE " . implode(' AND ', $where) . "
         ORDER BY ScheduledDate,id",
        $params
    );
    foreach ($rows as &$row) {
        $row['ScheduledDate'] = substr((string) ($row['ScheduledDate'] ?? ''), 0, 10);
    }
    return $rows;
}

function patrol_attach_leave_items(array $items, array $leaveRows): array
{
    $bySession = [];
    $byDate = [];
    foreach ($leaveRows as $row) {
        $sid = (string) ($row['ScheduledSessionID'] ?? '');
        if ($sid !== '') $bySession[$sid] = $row;
        $date = substr((string) ($row['ScheduledDate'] ?? ''), 0, 10);
        if ($date !== '' && !isset($byDate[$date])) $byDate[$date] = $row;
    }
    foreach ($items as &$item) {
        $sid = (string) ($item['ScheduledSessionID'] ?? ($item['sessionId'] ?? ($item['id'] ?? '')));
        $date = substr((string) ($item['ScheduledDate'] ?? ($item['PatrolDate'] ?? ($item['date'] ?? ''))), 0, 10);
        $leave = $bySession[$sid] ?? ($byDate[$date] ?? null);
        $item['leave'] = $leave;
        if ($leave && empty($item['isCompleted']) && patrol_leave_blocking($leave)) {
            $pending = (string) ($leave['Status'] ?? '') === 'Pending';
            $item['isLeave'] = !$pending;
            $item['isLeavePending'] = $pending;
            $item['status'] = $pending ? 'leave_pending' : 'leave';
            $item['checkinStatus'] = $pending ? 'leave_pending' : 'leave';
            $item['completionStatus'] = $pending ? 'leave_pending' : 'leave';
        }
    }
    return $items;
}

function patrol_leave_stats(array $args): array
{
    $requiredToDate = (int) ($args['requiredToDate'] ?? 0);
    $yearlyTarget = (int) ($args['yearlyTarget'] ?? 0);
    $checkedToDate = (int) ($args['checkedToDate'] ?? 0);
    $checkedYear = (int) ($args['checkedYear'] ?? 0);
    $leaveRows = $args['leaveRows'] ?? [];
    $passPct = max(0, min(100, (int) ($args['passPct'] ?? 80)));
    $allowancePct = max(0, 100 - $passPct);
    $today = date('Y-m-d');
    $accepted = array_values(array_filter($leaveRows, 'patrol_leave_accepted'));
    $pending = array_values(array_filter($leaveRows, static fn($row) => (string) ($row['Status'] ?? '') === 'Pending'));
    $leaveToDate = count(array_filter($accepted, static fn($row) => substr((string) ($row['ScheduledDate'] ?? ''), 0, 10) <= $today));
    $leaveYear = count($accepted);
    $allowedToDate = (int) floor($requiredToDate * $allowancePct / 100);
    $allowedYear = (int) floor($yearlyTarget * $allowancePct / 100);
    $acceptedToDate = min($leaveToDate, $allowedToDate);
    $acceptedYear = min($leaveYear, $allowedYear);
    $coverageToDate = $checkedToDate + $acceptedToDate;
    $coverageYear = $checkedYear + $acceptedYear;
    return [
        'passPct' => $passPct,
        'leaveAllowancePct' => $allowancePct,
        'leaveToDate' => $leaveToDate,
        'leaveYear' => $leaveYear,
        'pendingLeave' => count($pending),
        'allowedLeaveToDate' => $allowedToDate,
        'allowedLeaveYear' => $allowedYear,
        'acceptedLeaveToDate' => $acceptedToDate,
        'acceptedLeaveYear' => $acceptedYear,
        'overLeaveToDate' => max(0, $leaveToDate - $allowedToDate),
        'overLeaveYear' => max(0, $leaveYear - $allowedYear),
        'leaveRemainingToDate' => max(0, $allowedToDate - $leaveToDate),
        'leaveRemainingYear' => max(0, $allowedYear - $leaveYear),
        'acceptedCoverageToDate' => $coverageToDate,
        'acceptedCoverageYear' => $coverageYear,
        'acceptedCoverageToDatePct' => patrol_pct($coverageToDate, $requiredToDate),
        'acceptedCoverageYearPct' => patrol_pct($coverageYear, $yearlyTarget),
    ];
}

function patrol_leave_attachment_upload(): array
{
    return store_uploaded_file('Attachment', [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png' => ['png'],
        'image/webp' => ['webp'],
        'application/pdf' => ['pdf'],
        'application/msword' => ['doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
    ], 10 * 1024 * 1024);
}

function patrol_supervisor_monthly_requirement(): int
{
    return 2;
}

function patrol_activity_target_for_employee(string $employeeId, array $employee, string $activityKey = 'patrol', ?int $year = null): ?array
{
    try {
        $merged = merged_activity_targets($employeeId, $year);
        $row = $merged['overrideMap'][$activityKey] ?? $merged['scopeMap'][$activityKey] ?? $merged['templateMap'][$activityKey] ?? null;
        $source = isset($merged['overrideMap'][$activityKey]) ? 'override'
            : (isset($merged['scopeMap'][$activityKey]) ? 'scope' : 'template');
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
            $record['PatrolType'] = $record['PatrolType'] ?? 'normal';
            $record['scheduledDate'] = $date;
            $record['actualDate'] = $actual;
            $record['isMakeup'] = ($record['PatrolType'] ?? '') === 'compensation' || (!empty($record['ScheduledSessionID']) && $actual !== $date);
            $itemRecords[] = $record;
        }
        $hasMakeup = false;
        foreach ($itemRecords as $record) {
            if (!empty($record['isMakeup']) || ($record['PatrolType'] ?? '') === 'compensation') {
                $hasMakeup = true;
                break;
            }
        }
        $status = $itemRecords ? ($hasMakeup ? 'makeup' : 'checked') : ($date <= date('Y-m-d') ? 'missed' : 'upcoming');
        $slot['status'] = $status;
        $slot['checkinStatus'] = $status;
        $slot['isOpen'] = count($itemRecords) === 0;
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

function patrol_resolve_supervisor_scheduled_session(string $employeeId, string $date, ?string $requestedSessionId, array $options = []): array
{
    $year = (int) substr($date, 0, 4);
    $detail = patrol_attendance_detail_supervisor($employeeId, $year, true);
    $sessions = $detail['schedule'] ?? [];
    $map = patrol_session_map($sessions);
    $session = null;
    $sid = trim((string) ($requestedSessionId ?? ''));
    if ($sid !== '') {
        if (empty($map[$sid])) {
            json_response(['success' => false, 'message' => 'Selected schedule is not valid for this employee.'], 400);
        }
        $session = $map[$sid];
        if (empty($options['preserveActualDate'])) {
            $date = substr((string) ($session['date'] ?? $session['PatrolDate']), 0, 10);
        }
    } else {
        if (!empty($options['requireSession'])) {
            json_response(['success' => false, 'message' => 'ScheduledSessionID is required for self-patrol check-in.'], 400);
        }
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
        $leave = db_row("SELECT id FROM patrol_leave_requests WHERE EmployeeID=? AND RosterGroup='supervisor' AND ScheduledSessionID=? AND Status IN ('Pending','Approved') LIMIT 1", [$employeeId, $session['id']]);
        if ($leave) {
            json_response(['success' => false, 'message' => 'Selected schedule already has a pending/approved leave request.'], 409);
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

function patrol_admin_email(): string
{
    foreach (['PATROL_ADMIN_EMAIL', 'HIYARI_ADMIN_EMAIL', 'ADMIN_EMAIL', 'SMOKE_ADMIN_EMAIL', 'SMTP_FROM', 'SMTP_USER'] as $key) {
        $value = trim((string) getenv($key));
        if ($value !== '' && filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return $value;
        }
    }
    return '';
}

function patrol_admin_emails(): array
{
    $values = [patrol_admin_email()];
    try {
        foreach (db_rows("SELECT CompanyEmail FROM employees WHERE CompanyEmail IS NOT NULL AND TRIM(CompanyEmail)<>'' AND (LOWER(Role)='admin' OR LOWER(Role) LIKE '%safety%') LIMIT 80") as $row) {
            $values[] = $row['CompanyEmail'] ?? '';
        }
    } catch (Throwable $e) {
        error_log('[patrol/issue-email] Admin recipient lookup failed: ' . $e->getMessage());
    }
    return patrol_unique_email_recipients($values);
}

function patrol_unique_email_recipients(array $values): array
{
    $out = [];
    $seen = [];
    foreach ($values as $value) {
        foreach (preg_split('/[;,]/', (string) $value) ?: [] as $email) {
            $email = trim($email);
            $key = strtolower($email);
            if ($email === '' || isset($seen[$key]) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                continue;
            }
            $seen[$key] = true;
            $out[] = $email;
        }
    }
    return $out;
}

function patrol_leave_reviewer_emails(): array
{
    $values = [patrol_admin_email()];
    try {
        foreach (db_rows("SELECT CompanyEmail FROM employees WHERE CompanyEmail IS NOT NULL AND TRIM(CompanyEmail)<>'' AND (LOWER(Role)='admin' OR LOWER(Role) LIKE '%safety%') LIMIT 80") as $row) {
            $values[] = $row['CompanyEmail'] ?? '';
        }
    } catch (Throwable $e) {
        error_log('[patrol/leave-email] reviewer lookup failed: ' . $e->getMessage());
    }
    return patrol_unique_email_recipients($values);
}

function patrol_issue_for_email($issueId): ?array
{
    return db_row(
        'SELECT i.*,
                e.EmployeeName AS ReporterName,
                e.CompanyEmail AS ReporterEmail,
                e.Department AS ReporterDepartment,
                e.Unit AS ReporterUnit,
                e.Team AS ReporterTeam,
                requester.EmployeeName AS CloseRequesterName,
                requester.CompanyEmail AS CloseRequesterEmail
         FROM patrol_issues i
         LEFT JOIN employees e ON e.EmployeeID=i.ReporterID
         LEFT JOIN employees requester ON requester.EmployeeID=i.CloseRequestedBy
         WHERE i.IssueID=?
         LIMIT 1',
        [$issueId]
    ) ?: null;
}

function patrol_leave_for_email($leaveId): ?array
{
    return db_row(
        "SELECT l.*,
                DATE_FORMAT(l.ScheduledDate,'%Y-%m-%d') AS ScheduledDate,
                e.EmployeeName,
                e.CompanyEmail,
                e.Department,
                e.Position,
                e.Unit,
                reviewer.EmployeeName AS ReviewerName
         FROM patrol_leave_requests l
         LEFT JOIN employees e ON e.EmployeeID=l.EmployeeID
         LEFT JOIN employees reviewer ON reviewer.EmployeeID=l.ReviewedBy
         WHERE l.id=?
         LIMIT 1",
        [$leaveId]
    ) ?: null;
}

function patrol_issue_email_date($value): string
{
    $value = trim((string) ($value ?? ''));
    return $value !== '' ? substr($value, 0, 10) : '-';
}

function patrol_build_issue_mail(array $issue, string $eventType, array $actor, string $recipientKind): array
{
    $issueId = (string) ($issue['IssueID'] ?? '');
    $machine = trim((string) ($issue['MachineName'] ?? ''));
    if ($machine === '') $machine = patrol_issue_multi_display($issue['HazardType'] ?? null, '');
    if ($machine === '') $machine = trim((string) ($issue['Area'] ?? 'Patrol issue'));
    $isAdmin = $recipientKind === 'admin';
    $configs = [
        'IssueCreated' => [
            'subject' => '[Safety Patrol] New issue #' . $issueId . ' - ' . $machine,
            'title' => 'New Safety Patrol issue recorded',
            'tone' => strtoupper((string) ($issue['Rank'] ?? '')) === 'A' ? 'warning' : 'neutral',
            'introAdmin' => ['A new Safety Patrol issue has been recorded and is ready for follow-up.'],
            'introReporter' => ['Your Safety Patrol issue has been recorded successfully.', 'The Safety/Admin team has also been notified.'],
            'actions' => ['Open Safety Core to review the issue details and follow-up status.'],
        ],
        'TemporaryUpdated' => [
            'subject' => '[Safety Patrol] Temporary action updated #' . $issueId,
            'title' => 'Temporary action updated',
            'tone' => 'warning',
            'introAdmin' => ['A temporary action was recorded for this Safety Patrol issue.'],
            'introReporter' => ['A temporary action was recorded for the Safety Patrol issue you opened.'],
            'actions' => ['Open Safety Core to review the temporary action and continue tracking until final close.'],
        ],
        'IssueClosed' => [
            'subject' => '[Safety Patrol] Issue closed #' . $issueId,
            'title' => 'Safety Patrol issue closed',
            'tone' => 'completed',
            'introAdmin' => ['This Safety Patrol issue has been closed.'],
            'introReporter' => ['The Safety Patrol issue you opened has been closed.'],
            'actions' => ['Open Safety Core if you need to review the final corrective action.'],
        ],
        'CloseRequested' => [
            'subject' => '[Safety Patrol] Close approval requested #' . $issueId,
            'title' => 'Safety Patrol close approval requested',
            'tone' => 'pending',
            'introAdmin' => ['A Safety Patrol issue close request is waiting for Admin approval.'],
            'introReporter' => ['A Safety Patrol issue close request is waiting for Admin approval.'],
            'actions' => ['Open Safety Patrol to review the final action and approve or reject the close request.'],
        ],
        'CloseApproved' => [
            'subject' => '[Safety Patrol] Close request approved #' . $issueId,
            'title' => 'Safety Patrol close request approved',
            'tone' => 'completed',
            'introAdmin' => ['The Safety Patrol close request has been approved.'],
            'introReporter' => $recipientKind === 'requester'
                ? ['Your Safety Patrol close request has been approved.']
                : ['The Safety Patrol issue you opened has been approved for close.'],
            'actions' => ['Open Safety Core if you need to review the final corrective action.'],
        ],
        'CloseRejected' => [
            'subject' => '[Safety Patrol] Close request rejected #' . $issueId,
            'title' => 'Safety Patrol close request rejected',
            'tone' => 'rejected',
            'introAdmin' => ['The Safety Patrol close request has been rejected.'],
            'introReporter' => $recipientKind === 'requester'
                ? ['Your Safety Patrol close request has been rejected. Please review the reason and update the corrective action.']
                : ['The Safety Patrol close request for the issue you opened has been rejected.'],
            'actions' => ['Open Safety Patrol to review the rejection reason and follow-up action.'],
        ],
    ];
    $cfg = $configs[$eventType] ?? $configs['IssueCreated'];
    $reporter = trim((string) ($issue['ReporterName'] ?? $issue['ReporterID'] ?? $issue['FoundByTeam'] ?? '-')) ?: '-';
    $actorName = patrol_user_name($actor);
    $details = [
        ['label' => 'Issue ID', 'value' => $issueId !== '' ? '#' . $issueId : '-', 'highlight' => true],
        ['label' => 'Status', 'value' => $issue['CurrentStatus'] ?? '-'],
        ['label' => 'Rank', 'value' => $issue['Rank'] ?? '-'],
        ['label' => 'STOP Type', 'value' => patrol_issue_multi_display($issue['HazardType'] ?? null)],
        ['label' => 'Area', 'value' => $issue['Area'] ?? '-'],
        ['label' => 'Machine / Location', 'value' => $issue['MachineName'] ?? '-'],
        ['label' => 'Hazard Detail', 'value' => $issue['HazardDescription'] ?? '-'],
        ['label' => 'Responsible', 'value' => trim(patrol_issue_multi_display($issue['ResponsibleDept'] ?? null, '') . ' / ' . patrol_issue_multi_display($issue['ResponsibleUnit'] ?? null, ''), ' /') ?: '-'],
        ['label' => 'Found Date', 'value' => patrol_issue_email_date($issue['DateFound'] ?? null)],
        ['label' => 'Due Date', 'value' => patrol_issue_email_date($issue['DueDate'] ?? null), 'highlight' => !empty($issue['DueDate'])],
        ['label' => 'Finished Date', 'value' => patrol_issue_email_date($issue['FinishDate'] ?? null)],
        ['label' => 'Opened By', 'value' => $reporter],
        ['label' => 'Actor', 'value' => $actorName],
    ];
    if ($eventType === 'TemporaryUpdated') {
        $details[] = ['label' => 'Temporary Action', 'value' => $issue['TempDescription'] ?? '-', 'highlight' => true];
    }
    if ($eventType === 'IssueClosed') {
        $details[] = ['label' => 'Final Action', 'value' => $issue['ActionDescription'] ?? '-', 'highlight' => true];
    }
    if (in_array($eventType, ['CloseRequested', 'CloseApproved', 'CloseRejected'], true)) {
        $details[] = ['label' => 'Final Action', 'value' => $issue['ActionDescription'] ?? '-', 'highlight' => true];
        $details[] = ['label' => 'Close Approval', 'value' => $issue['CloseApprovalStatus'] ?? '-', 'highlight' => true];
        $details[] = ['label' => 'Close Requested By', 'value' => $issue['CloseRequesterName'] ?? ($issue['CloseRequestedBy'] ?? '-')];
    }
    if ($eventType === 'CloseRejected') {
        $details[] = ['label' => 'Reject Reason', 'value' => $issue['CloseRejectReason'] ?? '-', 'highlight' => true];
    }
    if (function_exists('wf_hiyari_mail')) {
        return wf_hiyari_mail([
            'subject' => $cfg['subject'],
            'title' => $cfg['title'],
            'kicker' => 'SAFETY PATROL ISSUE',
            'moduleLabel' => 'Safety Patrol Module',
            'tone' => $cfg['tone'],
            'greeting' => $isAdmin ? 'Dear Safety Admin,' : 'Dear ' . ($recipientKind === 'requester' ? ($issue['CloseRequesterName'] ?? 'Safety Patrol user') : ($issue['ReporterName'] ?? 'Safety Patrol user')) . ',',
            'intro' => $isAdmin ? $cfg['introAdmin'] : $cfg['introReporter'],
            'details' => $details,
            'actions' => $cfg['actions'],
            'footerNote' => 'This is an automated Safety Patrol issue notification from TSH Safety Core Activity System.',
        ]);
    }
    $lines = [$cfg['title'], ''];
    foreach ($details as $detail) {
        $lines[] = (string) ($detail['label'] ?? '') . ': ' . (string) (($detail['value'] ?? '') ?: '-');
    }
    return ['subject' => $cfg['subject'], 'body' => implode("\n", $lines), 'html' => null];
}

function patrol_queue_issue_email($issueId, string $eventType, array $actor): array
{
    $issue = patrol_issue_for_email($issueId);
    if (!$issue) {
        return ['queued' => false, 'sent' => false, 'reason' => 'Issue not found'];
    }
    $recipientRows = [];
    if ($eventType === 'CloseRequested') {
        foreach (patrol_admin_emails() as $email) {
            $recipientRows[] = ['email' => $email, 'kind' => 'admin', 'employeeId' => null];
        }
    } elseif (in_array($eventType, ['CloseApproved', 'CloseRejected'], true)) {
        foreach (patrol_unique_email_recipients([$issue['CloseRequesterEmail'] ?? '']) as $email) {
            $recipientRows[] = ['email' => $email, 'kind' => 'requester', 'employeeId' => $issue['CloseRequestedBy'] ?? null];
        }
        foreach (patrol_unique_email_recipients([$issue['ReporterEmail'] ?? '']) as $email) {
            $recipientRows[] = ['email' => $email, 'kind' => 'reporter', 'employeeId' => $issue['ReporterID'] ?? null];
        }
    } else {
        foreach (patrol_unique_email_recipients([$issue['ReporterEmail'] ?? '']) as $email) {
            $recipientRows[] = ['email' => $email, 'kind' => 'reporter', 'employeeId' => $issue['ReporterID'] ?? null];
        }
        foreach (patrol_admin_emails() as $email) {
            $recipientRows[] = ['email' => $email, 'kind' => 'admin', 'employeeId' => null];
        }
    }
    $seenEmail = [];
    $recipientRows = array_values(array_filter($recipientRows, static function ($recipient) use (&$seenEmail) {
        $key = strtolower((string) ($recipient['email'] ?? ''));
        if ($key === '' || isset($seenEmail[$key])) {
            return false;
        }
        $seenEmail[$key] = true;
        return true;
    }));
    if (!$recipientRows) {
        return ['queued' => false, 'sent' => false, 'reason' => 'No valid email recipients'];
    }
    $results = [];
    foreach ($recipientRows as $recipient) {
        try {
            $mail = patrol_build_issue_mail($issue, $eventType, $actor, $recipient['kind']);
            db_execute(
                'INSERT INTO patrol_emailoutbox(AttendanceID,EmployeeID,EventType,Recipients,Subject,Body,HtmlBody,Status) VALUES(NULL,?,?,?,?,?,?,"Queued")',
                [$recipient['employeeId'], $eventType, $recipient['email'], $mail['subject'], $mail['body'], $mail['html'] ?? null]
            );
            $outboxId = (int) db()->lastInsertId();
            if (function_exists('mailer_outbox_best_effort')) {
                mailer_outbox_best_effort('patrol_emailoutbox', $outboxId, 'Recipients', 'HtmlBody');
            }
            $row = db_row('SELECT Status,Error,SentAt FROM patrol_emailoutbox WHERE id=?', [$outboxId]) ?: [];
            $results[] = [
                'outboxId' => $outboxId,
                'recipient' => $recipient['kind'],
                'status' => $row['Status'] ?? 'Queued',
                'sent' => !empty($row['SentAt']) || ($row['Status'] ?? '') === 'Sent',
                'reason' => $row['Error'] ?? null,
            ];
        } catch (Throwable $e) {
            $results[] = ['outboxId' => null, 'recipient' => $recipient['kind'], 'status' => 'Failed', 'sent' => false, 'reason' => $e->getMessage()];
        }
    }
    return [
        'queued' => count(array_filter($results, static fn($item) => !empty($item['outboxId']))) > 0,
        'sent' => count(array_filter($results, static fn($item) => !empty($item['sent']))) > 0,
        'results' => $results,
    ];
}

function patrol_build_leave_mail(array $leave, string $eventType, array $actor, string $recipientKind): array
{
    $isReviewer = $recipientKind === 'reviewer';
    $employeeName = trim((string) ($leave['EmployeeName'] ?? ($leave['EmployeeID'] ?? 'Safety Patrol user'))) ?: 'Safety Patrol user';
    $status = trim((string) ($leave['Status'] ?? '')) ?: '-';
    $leaveId = (string) ($leave['id'] ?? '');
    $actorName = patrol_user_name($actor);
    $group = str_replace('_', ' ', (string) ($leave['RosterGroup'] ?? '-'));
    $configs = [
        'PatrolLeaveSubmitted' => [
            'subject' => '[Safety Patrol] Leave request submitted - ' . $employeeName,
            'title' => 'Safety Patrol leave request submitted',
            'tone' => $status === 'Approved' ? 'completed' : 'pending',
            'introUser' => $status === 'Approved'
                ? ['Your Safety Patrol leave request has been saved and approved automatically.']
                : ['Your Safety Patrol leave request has been submitted for Admin/Safety review.'],
            'introReviewer' => ['A Safety Patrol leave request is waiting for review.'],
            'actions' => ['Open Safety Patrol to review the leave request and schedule impact.'],
        ],
        'PatrolLeaveApproved' => [
            'subject' => '[Safety Patrol] Leave request approved - ' . $employeeName,
            'title' => 'Safety Patrol leave request approved',
            'tone' => 'completed',
            'introUser' => ['Your Safety Patrol leave request has been approved.'],
            'introReviewer' => ['A Safety Patrol leave request has been approved.'],
            'actions' => ['Open Safety Patrol to review leave allowance and final coverage.'],
        ],
        'PatrolLeaveRejected' => [
            'subject' => '[Safety Patrol] Leave request rejected - ' . $employeeName,
            'title' => 'Safety Patrol leave request rejected',
            'tone' => 'rejected',
            'introUser' => ['Your Safety Patrol leave request has been rejected. The scheduled round is no longer blocked as leave.'],
            'introReviewer' => ['A Safety Patrol leave request has been rejected.'],
            'actions' => ['Open Safety Patrol to review the request and schedule status.'],
        ],
        'PatrolLeaveCancelled' => [
            'subject' => '[Safety Patrol] Leave request cancelled - ' . $employeeName,
            'title' => 'Safety Patrol leave request cancelled',
            'tone' => 'neutral',
            'introUser' => ['Your Safety Patrol leave request has been cancelled.'],
            'introReviewer' => ['A Safety Patrol leave request has been cancelled.'],
            'actions' => ['Open Safety Patrol to review the request and schedule status.'],
        ],
    ];
    $cfg = $configs[$eventType] ?? $configs['PatrolLeaveSubmitted'];
    $details = [
        ['label' => 'Leave ID', 'value' => $leaveId !== '' ? '#' . $leaveId : '-', 'highlight' => true],
        ['label' => 'Employee', 'value' => $employeeName, 'highlight' => true],
        ['label' => 'Employee ID', 'value' => $leave['EmployeeID'] ?? '-'],
        ['label' => 'Department', 'value' => $leave['Department'] ?? '-'],
        ['label' => 'Position', 'value' => $leave['Position'] ?? '-'],
        ['label' => 'Roster Group', 'value' => $group ?: '-'],
        ['label' => 'Scheduled Date', 'value' => substr((string) ($leave['ScheduledDate'] ?? ''), 0, 10) ?: '-'],
        ['label' => 'Scheduled Session', 'value' => $leave['ScheduledSessionID'] ?? '-'],
        ['label' => 'Leave Type', 'value' => $leave['LeaveType'] ?? '-'],
        ['label' => 'Destination', 'value' => $leave['Destination'] ?? '-'],
        ['label' => 'Reason', 'value' => $leave['Reason'] ?? '-'],
        ['label' => 'Status', 'value' => $status, 'highlight' => true],
        ['label' => 'Reviewer', 'value' => $leave['ReviewerName'] ?? ($leave['ReviewedBy'] ?? $actorName ?: '-')],
        ['label' => 'Review Note', 'value' => $leave['ReviewNote'] ?? '-'],
    ];
    if (function_exists('wf_hiyari_mail')) {
        return wf_hiyari_mail([
            'subject' => $cfg['subject'],
            'title' => $cfg['title'],
            'kicker' => 'SAFETY PATROL LEAVE',
            'moduleLabel' => 'Safety Patrol Module',
            'tone' => $cfg['tone'],
            'greeting' => $isReviewer ? 'Dear Safety Admin,' : 'Dear ' . $employeeName . ',',
            'intro' => $isReviewer ? $cfg['introReviewer'] : $cfg['introUser'],
            'details' => $details,
            'actions' => $cfg['actions'],
            'footerNote' => 'This is an automated Safety Patrol leave notification from TSH Safety Core Activity System.',
        ]);
    }
    $lines = [$cfg['title'], ''];
    foreach ($details as $detail) {
        $lines[] = (string) ($detail['label'] ?? '') . ': ' . (string) (($detail['value'] ?? '') ?: '-');
    }
    return ['subject' => $cfg['subject'], 'body' => implode("\n", $lines), 'html' => null];
}

function patrol_leave_event_from_status(string $status): string
{
    if ($status === 'Approved') return 'PatrolLeaveApproved';
    if ($status === 'Rejected') return 'PatrolLeaveRejected';
    if ($status === 'Cancelled') return 'PatrolLeaveCancelled';
    return 'PatrolLeaveSubmitted';
}

function patrol_queue_leave_email($leaveId, string $eventType, array $actor): array
{
    $leave = patrol_leave_for_email($leaveId);
    if (!$leave) {
        return ['queued' => false, 'sent' => false, 'reason' => 'Leave request not found'];
    }
    $recipientRows = [];
    foreach (patrol_unique_email_recipients([$leave['CompanyEmail'] ?? '']) as $email) {
        $recipientRows[] = ['email' => $email, 'kind' => 'employee', 'employeeId' => $leave['EmployeeID'] ?? null];
    }
    foreach (patrol_leave_reviewer_emails() as $email) {
        $recipientRows[] = ['email' => $email, 'kind' => 'reviewer', 'employeeId' => null];
    }
    $seenEmail = [];
    $recipientRows = array_values(array_filter($recipientRows, static function ($recipient) use (&$seenEmail) {
        $key = strtolower((string) ($recipient['email'] ?? ''));
        if ($key === '' || isset($seenEmail[$key])) {
            return false;
        }
        $seenEmail[$key] = true;
        return true;
    }));
    if (!$recipientRows) {
        return ['queued' => false, 'sent' => false, 'reason' => 'No valid email recipients'];
    }
    $results = [];
    foreach ($recipientRows as $recipient) {
        try {
            $mail = patrol_build_leave_mail($leave, $eventType, $actor, $recipient['kind']);
            db_execute(
                'INSERT INTO patrol_emailoutbox(AttendanceID,EmployeeID,EventType,Recipients,Subject,Body,HtmlBody,Status) VALUES(NULL,?,?,?,?,?,?,"Queued")',
                [$recipient['employeeId'], $eventType, $recipient['email'], $mail['subject'], $mail['body'], $mail['html'] ?? null]
            );
            $outboxId = (int) db()->lastInsertId();
            if (function_exists('mailer_outbox_best_effort')) {
                mailer_outbox_best_effort('patrol_emailoutbox', $outboxId, 'Recipients', 'HtmlBody');
            }
            $row = db_row('SELECT Status,Error,SentAt FROM patrol_emailoutbox WHERE id=?', [$outboxId]) ?: [];
            $results[] = [
                'outboxId' => $outboxId,
                'recipient' => $recipient['kind'],
                'status' => $row['Status'] ?? 'Queued',
                'sent' => !empty($row['SentAt']) || ($row['Status'] ?? '') === 'Sent',
                'reason' => $row['Error'] ?? null,
            ];
        } catch (Throwable $e) {
            $results[] = ['outboxId' => null, 'recipient' => $recipient['kind'], 'status' => 'Failed', 'sent' => false, 'reason' => $e->getMessage()];
        }
    }
    return [
        'queued' => count(array_filter($results, static fn($item) => !empty($item['outboxId']))) > 0,
        'sent' => count(array_filter($results, static fn($item) => !empty($item['sent']))) > 0,
        'results' => $results,
    ];
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
        $leave = db_row("SELECT id FROM patrol_leave_requests WHERE EmployeeID=? AND RosterGroup='top_management' AND ScheduledSessionID=? AND Status IN ('Pending','Approved') LIMIT 1", [$employeeId, $session['id']]);
        if ($leave) {
            json_response(['success' => false, 'message' => 'Selected schedule already has a pending/approved leave request.'], 409);
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
    $activityTarget = patrol_activity_target_for_employee($employeeId, $employee, 'patrol', $year);
    $passPct = (int) ($activityTarget['passPct'] ?? 80);
    $sessions = patrol_top_sessions($employeeId, $year);
    $leaveRows = patrol_leave_rows($employeeId, 'top_management', $year);

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
    $scheduleWithLeave = patrol_attach_leave_items($schedule, $leaveRows);
    $leaveStats = patrol_leave_stats([
        'requiredToDate' => $requiredToDate,
        'yearlyTarget' => $yearlyTarget,
        'checkedToDate' => $completedScheduled,
        'checkedYear' => $completed,
        'leaveRows' => $leaveRows,
        'passPct' => $passPct,
    ]);
    $phase3 = patrol_phase3_metrics([
        'requiredToDate' => $requiredToDate,
        'yearlyTarget' => $yearlyTarget,
        'checkedToDate' => $completedScheduled,
        'checkedYear' => $completed,
        'leaveStats' => $leaveStats,
        'passPct' => $passPct,
    ]);
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
            'passPct' => $passPct,
            'leave' => $leaveStats,
            'scheduledTotal' => count($sessions),
            'missingToDate' => max(0, $requiredToDate - $completedScheduled),
            'upcoming' => max(0, count($sessions) - $requiredToDate),
            'progressToDatePct' => patrol_pct($completedScheduled, $requiredToDate),
            'fullYearPct' => patrol_pct($completed, $yearlyTarget),
            'acceptedCoverageToDatePct' => $leaveStats['acceptedCoverageToDatePct'] ?? 0,
            'acceptedCoverageYearPct' => $leaveStats['acceptedCoverageYearPct'] ?? 0,
        ] + $phase3,
        'periods' => array_values($periods),
        'schedule' => $scheduleWithLeave,
        'leaveRequests' => $leaveRows,
        'records' => $attendance,
        'extraRecords' => $extraRecords,
    ];
}

function patrol_flexible_supervisor_attendance_detail(string $employeeId, int $year, array $employee): array
{
    $flexConfig = patrol_flexible_monthly_requirement();
    $monthlyRequirement = (int) $flexConfig['monthlyRequirement'];
    $targetSource = (string) $flexConfig['targetSource'];
    $dueMonth = patrol_due_month($year);
    $areas = db_rows('SELECT id,Name,Code FROM patrol_areas ORDER BY SortOrder,id');
    $records = db_rows("SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.PatrolType,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName FROM patrol_self_checkin sc LEFT JOIN employees e ON e.EmployeeID=sc.RecordedBy WHERE sc.EmployeeID=? AND sc.Year=? ORDER BY sc.CheckinDate,sc.id", [$employeeId, $year]);
    $recordsByMonth = [];
    $recordsByDate = [];
    foreach ($records as $idx => $r) {
        $date = substr((string) $r['CheckinDate'], 0, 10);
        $m = (int) ($r['Month'] ?? substr($date, 5, 2));
        $r['CheckinDate'] = $date;
        $r['PatrolType'] = $r['PatrolType'] ?? 'normal';
        $r['mode'] = empty($r['RecordedBy']) || (string) $r['RecordedBy'] === $employeeId ? 'self' : 'admin_recorded';
        $records[$idx] = $r;
        if (!isset($recordsByMonth[$m])) $recordsByMonth[$m] = [];
        $recordsByMonth[$m][] = $r;
        $dayRecord = $r;
        $dayRecord['actualDate'] = $date;
        $dayRecord['scheduledDate'] = $date;
        $dayRecord['isMakeup'] = false;
        $dayRecord['source'] = strpos((string) ($r['ScheduledSessionID'] ?? ''), 'FLEX:') === 0 ? 'flexible' : 'self';
        if (!isset($recordsByDate[$date])) $recordsByDate[$date] = [];
        $recordsByDate[$date][] = $dayRecord;
    }
    $requiredToDate = 0;
    $completedToDate = 0;
    $periods = [];
    for ($m = 1; $m <= 12; $m++) {
        $monthRecords = $recordsByMonth[$m] ?? [];
        $completed = count($monthRecords);
        $quotaFull = $completed >= $monthlyRequirement;
        $isDue = $m <= $dueMonth;
        if ($isDue) {
            $requiredToDate += $monthlyRequirement;
            $completedToDate += min($completed, $monthlyRequirement);
        }
        $items = [];
        foreach (patrol_days_in_month($year, $m) as $date) {
            $dayRecords = $recordsByDate[$date] ?? [];
            $isCompleted = count($dayRecords) > 0;
            $items[] = [
                'date' => $date,
                'ScheduledDate' => $date,
                'ScheduledSessionID' => "FLEX:$employeeId:$date",
                'status' => $isCompleted ? 'checked' : ($quotaFull ? 'locked' : 'open'),
                'isCompleted' => $isCompleted,
                'isOpen' => !$isCompleted && !$quotaFull,
                'records' => $dayRecords,
            ];
        }
        $periods[] = [
            'month' => $m,
            'required' => $isDue ? $monthlyRequirement : 0,
            'monthlyRequirement' => $monthlyRequirement,
            'completed' => $completed,
            'missing' => $isDue ? max(0, $monthlyRequirement - $completed) : 0,
            'status' => !$isDue ? 'upcoming' : ($quotaFull ? 'completed' : ($completed > 0 ? 'partial' : 'missed')),
            'records' => $monthRecords,
            'actualRecords' => $monthRecords,
            'items' => $items,
        ];
    }
    $openSchedule = [];
    foreach ($periods as $p) {
        foreach (($p['items'] ?? []) as $item) {
            if (($item['status'] ?? '') === 'open' && empty($item['isCompleted'])) $openSchedule[] = $item;
        }
    }
    return [
        'mode' => 'flexible_quota',
        'group' => 'supervisor',
        'scheduleMode' => 'flexible',
        'year' => $year,
        'employee' => $employee,
        'roster' => ['RosterID' => null, 'TargetPerYear' => $monthlyRequirement * 12, 'ConfiguredTargetPerYear' => $monthlyRequirement * 12],
        'monthlyRequirement' => $monthlyRequirement,
        'targetSource' => $targetSource,
        'allowedAreas' => array_map(static function ($a) { return ['id' => (int) ($a['id'] ?? 0), 'Name' => $a['Name'] ?? '', 'Code' => $a['Code'] ?? '']; }, $areas),
        'summary' => [
            'completed' => count($records),
            'completedToDateCapped' => $completedToDate,
            'requiredToDate' => $requiredToDate,
            'yearlyTarget' => $monthlyRequirement * 12,
            'configuredYearlyTarget' => $monthlyRequirement * 12,
            'targetSource' => $targetSource,
            'scheduledTotal' => 0,
            'missingToDate' => max(0, $requiredToDate - $completedToDate),
            'upcomingMonths' => max(0, 12 - $dueMonth),
            'progressToDatePct' => patrol_pct($completedToDate, $requiredToDate),
            'fullYearPct' => patrol_pct(count($records), $monthlyRequirement * 12),
        ],
        'periods' => $periods,
        'schedule' => [],
        'openSchedule' => $openSchedule,
        'records' => $records,
    ];
}

function patrol_attendance_detail_supervisor(string $employeeId, int $year, bool $allowPositionSupervisor = false): array
{
    $employee = db_row('SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,mp.IsSupervisorPatrol FROM employees e LEFT JOIN master_positions mp ON mp.Name=e.Position WHERE e.EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$employee) json_response(['success' => false, 'message' => 'Employee not found.'], 404);
    $roster = db_row("SELECT id AS RosterID,TargetPerYear,SortOrder FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$employeeId]);
    if (!$roster && (!$allowPositionSupervisor || empty($employee['IsSupervisorPatrol']))) json_response(['success' => false, 'message' => 'Employee is not in Sec. & Supervisor roster.'], 404);
    $activityTarget = patrol_activity_target_for_employee($employeeId, $employee, 'patrol', $year);
    $fallbackTarget = (int) ($roster['TargetPerYear'] ?? (patrol_supervisor_monthly_requirement() * 12));
    $yearlyTarget = (int) ($activityTarget['yearlyTarget'] ?? $fallbackTarget);
    $passPct = (int) ($activityTarget['passPct'] ?? 80);
    $targetSource = $activityTarget['source'] ?? ($roster ? 'patrol_roster' : 'position_schedule');
    $dueMonth = patrol_due_month($year);
    $leaveRows = patrol_leave_rows($employeeId, 'supervisor', $year);
    $records = db_rows("SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.PatrolType,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName FROM patrol_self_checkin sc LEFT JOIN employees e ON e.EmployeeID=sc.RecordedBy WHERE sc.EmployeeID=? AND sc.Year=? ORDER BY sc.CheckinDate,sc.id", [$employeeId, $year]);
    $actualRecordsByMonth = [];
    foreach ($records as $idx => $r) {
        $m = (int) ($r['Month'] ?? substr((string) $r['CheckinDate'], 5, 2));
        if (!isset($actualRecordsByMonth[$m])) $actualRecordsByMonth[$m] = [];
        $r['PatrolType'] = $r['PatrolType'] ?? 'normal';
        $r['mode'] = empty($r['RecordedBy']) || (string) $r['RecordedBy'] === $employeeId ? 'self' : 'admin_recorded';
        $records[$idx] = $r;
        $actualRecordsByMonth[$m][] = $r;
    }
    $schedule = patrol_attach_leave_items(patrol_attach_supervisor_records_to_schedule($records, patrol_supervisor_schedule_slots($year)), $leaveRows);
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
        $monthItems = $scheduleByMonth[$m] ?? [];
        $monthRecords = [];
        foreach ($monthItems as $item) {
            foreach (($item['records'] ?? []) as $record) {
                $monthRecords[] = $record;
            }
        }
        $completed = 0;
        foreach ($monthItems as $item) {
            if (!empty($item['isCompleted'])) $completed++;
        }
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
            'actualRecords' => $actualRecordsByMonth[$m] ?? [],
            'items' => $monthItems,
        ];
    }
    $currentMonth = max(1, min(12, patrol_due_month($year) ?: 1));
    $openSchedule = array_values(array_filter($schedule, static function ($item) {
        return empty($item['isCompleted']) && empty($item['isLeave']) && empty($item['isLeavePending']);
    }));
    $completed = count($records);
    $leaveStats = patrol_leave_stats([
        'requiredToDate' => $requiredToDate,
        'yearlyTarget' => $effectiveYearlyTarget,
        'checkedToDate' => $completedToDate,
        'checkedYear' => $completed,
        'leaveRows' => $leaveRows,
        'passPct' => $passPct,
    ]);
    $phase3 = patrol_phase3_metrics([
        'requiredToDate' => $requiredToDate,
        'yearlyTarget' => $effectiveYearlyTarget,
        'checkedToDate' => $completedToDate,
        'checkedYear' => $completed,
        'leaveStats' => $leaveStats,
        'passPct' => $passPct,
    ]);
    return [
        'mode' => 'scheduled_quota',
        'scheduleMode' => 'scheduled',
        'group' => 'supervisor',
        'year' => $year,
        'employee' => $employee,
        'roster' => ['RosterID' => $roster ? (int) $roster['RosterID'] : null, 'TargetPerYear' => $effectiveYearlyTarget, 'ConfiguredTargetPerYear' => $yearlyTarget],
        'monthlyRequirement' => (int) ($scheduledRequirementByMonth[$currentMonth] ?? 0),
        'passPct' => $passPct,
        'targetSource' => $targetSource,
        'summary' => [
            'completed' => $completed,
            'completedToDateCapped' => $completedToDate,
            'requiredToDate' => $requiredToDate,
            'yearlyTarget' => $effectiveYearlyTarget,
            'configuredYearlyTarget' => $yearlyTarget,
            'passPct' => $passPct,
            'leave' => $leaveStats,
            'targetSource' => $targetSource,
            'scheduledTotal' => count($schedule),
            'missingToDate' => max(0, $requiredToDate - $completedToDate),
            'upcomingMonths' => max(0, 12 - $dueMonth),
            'progressToDatePct' => patrol_pct($completedToDate, $requiredToDate),
            'fullYearPct' => patrol_pct($completed, $effectiveYearlyTarget),
            'acceptedCoverageToDatePct' => $leaveStats['acceptedCoverageToDatePct'] ?? 0,
            'acceptedCoverageYearPct' => $leaveStats['acceptedCoverageYearPct'] ?? 0,
        ] + $phase3,
        'periods' => $periods,
        'schedule' => $schedule,
        'openSchedule' => $openSchedule,
        'leaveRequests' => $leaveRows,
        'records' => $records,
    ];
}

function patrol_flexible_self_payload(string $employeeId, int $year, int $month, array $employee): array
{
    $flexConfig = patrol_flexible_monthly_requirement();
    $monthlyRequirement = (int) $flexConfig['monthlyRequirement'];
    $targetSource = (string) $flexConfig['targetSource'];
    $areas = db_rows('SELECT id,Name,Code FROM patrol_areas ORDER BY SortOrder,id');
    $records = db_rows("SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.PatrolType,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName FROM patrol_self_checkin sc LEFT JOIN employees e ON e.EmployeeID=sc.RecordedBy WHERE sc.EmployeeID=? AND sc.Year=? ORDER BY sc.CheckinDate,sc.id", [$employeeId, $year]);
    $normalized = [];
    $monthlyRecords = [];
    $recordsByDate = [];
    foreach ($records as $r) {
        $date = substr((string) ($r['CheckinDate'] ?? ''), 0, 10);
        $r['CheckinDate'] = $date;
        $r['PatrolType'] = $r['PatrolType'] ?? 'normal';
        $r['mode'] = empty($r['RecordedBy']) || (string) $r['RecordedBy'] === $employeeId ? 'self' : 'admin_recorded';
        $normalized[] = $r;
        $recordMonth = (int) ($r['Month'] ?? substr($date, 5, 2));
        if ($recordMonth !== $month) {
            continue;
        }
        $r['actualDate'] = $date;
        $r['scheduledDate'] = $date;
        $r['isMakeup'] = false;
        $r['source'] = strpos((string) ($r['ScheduledSessionID'] ?? ''), 'FLEX:') === 0 ? 'flexible' : 'self';
        $monthlyRecords[] = $r;
        if (!isset($recordsByDate[$date])) $recordsByDate[$date] = [];
        $recordsByDate[$date][] = $r;
    }
    $completed = count($monthlyRecords);
    $quotaFull = $completed >= $monthlyRequirement;
    $calendarDays = [];
    foreach (patrol_days_in_month($year, $month) as $date) {
        $dayRecords = $recordsByDate[$date] ?? [];
        $isCompleted = count($dayRecords) > 0;
        $calendarDays[] = [
            'date' => $date,
            'ScheduledDate' => $date,
            'ScheduledSessionID' => 'FLEX:' . $employeeId . ':' . $date,
            'status' => $isCompleted ? 'checked' : ($quotaFull ? 'locked' : 'open'),
            'isCompleted' => $isCompleted,
            'isOpen' => !$isCompleted && !$quotaFull,
            'records' => $dayRecords,
        ];
    }
    $allowedAreas = array_map(static function ($a) {
        return ['id' => (int) ($a['id'] ?? 0), 'Name' => $a['Name'] ?? '', 'Code' => $a['Code'] ?? ''];
    }, $areas);
    return [
        'isSupervisorPatrol' => true,
        'scheduleMode' => 'flexible',
        'position' => $employee['Position'] ?? '',
        'checkins' => $monthlyRecords,
        'target' => $monthlyRequirement,
        'monthlyRequirement' => $monthlyRequirement,
        'completed' => $completed,
        'remaining' => max(0, $monthlyRequirement - $completed),
        'periodStatus' => $quotaFull ? 'completed' : ($completed > 0 ? 'partial' : 'open'),
        'yearlyTarget' => $monthlyRequirement * 12,
        'yearlyCompleted' => count($normalized),
        'targetSource' => $targetSource,
        'allowedAreas' => $allowedAreas,
        'calendarDays' => $calendarDays,
        'schedule' => [],
        'openSchedule' => [],
    ];
}

function patrol_parse_flexible_session_id($value): ?array
{
    $raw = trim((string) $value);
    if (!preg_match('/^FLEX:([^:]+):(\d{4}-\d{2}-\d{2})$/', $raw, $m)) {
        return null;
    }
    $date = patrol_valid_date($m[2]);
    return $date ? ['employeeId' => $m[1], 'date' => $date] : null;
}

function patrol_resolve_flexible_self_checkin(string $employeeId, string $date, $scheduledSessionId, $location): array
{
    $parsed = patrol_parse_flexible_session_id($scheduledSessionId);
    if (!$parsed) {
        json_response(['success' => false, 'message' => 'Flexible ScheduledSessionID is invalid.'], 400);
    }
    if ((string) $parsed['employeeId'] !== $employeeId) {
        json_response(['success' => false, 'message' => 'Flexible ScheduledSessionID does not match current user.'], 403);
    }
    if ((string) $parsed['date'] !== $date) {
        json_response(['success' => false, 'message' => 'Flexible check-in date must match ScheduledSessionID date.'], 400);
    }
    $emp = db_row('SELECT mp.IsSupervisorPatrol FROM employees e LEFT JOIN master_positions mp ON mp.Name=e.Position WHERE e.EmployeeID=? LIMIT 1', [$employeeId]);
    if (!$emp || empty($emp['IsSupervisorPatrol'])) {
        json_response(['success' => false, 'message' => 'Position is not allowed for flexible Self-Patrol.'], 403);
    }
    $roster = db_row("SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$employeeId]);
    if ($roster) {
        json_response(['success' => false, 'message' => 'Flexible Self-Patrol is not available for scheduled supervisor roster members.'], 400);
    }
    $areaInput = trim((string) $location);
    if ($areaInput === '') {
        json_response(['success' => false, 'message' => 'Location must be selected from Patrol_Areas.'], 400);
    }
    $area = db_row('SELECT id,Name,Code FROM patrol_areas WHERE CAST(id AS CHAR)=? OR Name=? OR Code=? LIMIT 1', [$areaInput, $areaInput, $areaInput]);
    if (!$area) {
        json_response(['success' => false, 'message' => 'Location must be selected from Patrol_Areas.'], 400);
    }
    if (db_row("SELECT id FROM patrol_self_checkin WHERE EmployeeID=? AND DATE(CheckinDate)=? AND ScheduledSessionID LIKE 'FLEX:%' LIMIT 1", [$employeeId, $date])) {
        json_response(['success' => false, 'message' => 'Flexible Self-Patrol already checked in for this date.'], 409);
    }
    $year = (int) substr($date, 0, 4);
    $month = (int) substr($date, 5, 2);
    $flexConfig = patrol_flexible_monthly_requirement();
    $monthlyRequirement = (int) $flexConfig['monthlyRequirement'];
    $count = (int) (safe_scalar('SELECT COUNT(*) FROM patrol_self_checkin WHERE EmployeeID=? AND Year=? AND Month=?', [$employeeId, $year, $month]) ?? 0);
    if ($count >= $monthlyRequirement) {
        json_response(['success' => false, 'message' => 'Flexible Self-Patrol monthly quota is already completed.'], 409);
    }
    return [
        'date' => $date,
        'session' => [
            'id' => trim((string) $scheduledSessionId),
            'PatrolDate' => $date,
            'AreaName' => $area['Name'] ?: ($area['Code'] ?? $areaInput),
            'AreaCode' => $area['Code'] ?? '',
        ],
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
        if ($group === 'supervisor') json_response(['success' => true, 'data' => patrol_attendance_detail_supervisor($employeeId, $year, true)]);
        if ($group === 'top_management') json_response(['success' => true, 'data' => patrol_attendance_detail_top($employeeId, $year)]);
    }

    if ($method === 'GET' && $path === '/patrol/my-schedule') { [$year, $month] = patrol_validate_ym($_GET['year'] ?? null, $_GET['month'] ?? null); json_response(patrol_user_month_schedule($uid, $year, $month)['items']); }
    if ($method === 'GET' && $path === '/patrol/attendance-stats') json_response(db_rows("SELECT UserName AS Name,COUNT(*) AS Total,MAX(PatrolDate) AS LastWalk,ROUND(COUNT(*)*100.0/NULLIF((SELECT COUNT(DISTINCT YEARWEEK(PatrolDate)) FROM patrol_attendance),0)) AS Percent FROM patrol_attendance GROUP BY UserID,UserName ORDER BY Total DESC LIMIT 20"));
    if ($method === 'GET' && $path === '/patrol/dashboard-stats') {
        $hazardMap = [];
        foreach (safe_rows('SELECT HazardType FROM patrol_issues') as $row) {
            $values = patrol_issue_multi_values($row['HazardType'] ?? null);
            if (!$values) $values = ['Unspecified'];
            foreach ($values as $value) {
                $hazardMap[$value] = ($hazardMap[$value] ?? 0) + 1;
            }
        }
        $byRank = [];
        foreach ($hazardMap as $label => $count) {
            $byRank[] = ['HazardRank' => $label, 'Count' => $count];
        }
        usort($byRank, static fn($a, $b) => ((int) $b['Count']) <=> ((int) $a['Count']));
        json_response(['bySection' => safe_rows("SELECT Area AS Section,COUNT(CASE WHEN CurrentStatus='Closed' THEN 1 END) AS Achieved,COUNT(CASE WHEN CurrentStatus!='Closed' THEN 1 END) AS OnProcess FROM patrol_issues GROUP BY Area ORDER BY Achieved DESC"), 'byRank' => $byRank]);
    }
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

    if ($method === 'GET' && $path === '/patrol/rank-a-hotspot-positions') {
        json_response(['success' => true, 'data' => db_rows('SELECT id,AreaName,DisplayName,MapXPercent,MapYPercent,IsPinned,UpdatedBy,UpdatedAt FROM patrol_rank_a_hotspot_positions ORDER BY AreaName ASC')]);
    }
    if ($method === 'PUT' && $path === '/patrol/rank-a-hotspot-positions') {
        patrol_require_admin($user);
        $b = json_body();
        $items = $b['positions'] ?? null;
        if (!is_array($items) || count($items) < 1) {
            json_response(['success' => false, 'message' => 'positions array is required.'], 400);
        }
        foreach ($items as $item) {
            if (!is_array($item)) {
                json_response(['success' => false, 'message' => 'Invalid hotspot position payload.'], 400);
            }
            $areaName = mb_substr(trim((string) ($item['AreaName'] ?? $item['areaName'] ?? '')), 0, 150);
            $displayName = mb_substr(trim((string) ($item['DisplayName'] ?? $item['displayName'] ?? $areaName)), 0, 150);
            $x = isset($item['MapXPercent']) ? (float) $item['MapXPercent'] : (isset($item['mapXPercent']) ? (float) $item['mapXPercent'] : (isset($item['x']) ? (float) $item['x'] : null));
            $y = isset($item['MapYPercent']) ? (float) $item['MapYPercent'] : (isset($item['mapYPercent']) ? (float) $item['mapYPercent'] : (isset($item['y']) ? (float) $item['y'] : null));
            if ($areaName === '' || $x === null || $y === null || $x < 0 || $x > 100 || $y < 0 || $y > 100) {
                json_response(['success' => false, 'message' => 'Invalid hotspot position payload.'], 400);
            }
            db_execute(
                'INSERT INTO patrol_rank_a_hotspot_positions (AreaName,DisplayName,MapXPercent,MapYPercent,IsPinned,UpdatedBy)
                 VALUES (?,?,?,?,1,?)
                 ON DUPLICATE KEY UPDATE DisplayName=VALUES(DisplayName),MapXPercent=VALUES(MapXPercent),MapYPercent=VALUES(MapYPercent),IsPinned=1,UpdatedBy=VALUES(UpdatedBy),UpdatedAt=NOW()',
                [$areaName, $displayName ?: $areaName, $x, $y, patrol_user_name($user)]
            );
        }
        json_response(['success' => true, 'data' => db_rows('SELECT id,AreaName,DisplayName,MapXPercent,MapYPercent,IsPinned,UpdatedBy,UpdatedAt FROM patrol_rank_a_hotspot_positions ORDER BY AreaName ASC')]);
    }
    if ($method === 'GET' && $path === '/patrol/rank-a-hotspot-issue-positions') {
        json_response(['success' => true, 'data' => db_rows('SELECT id,IssueID,MapXPercent,MapYPercent,UpdatedBy,UpdatedAt FROM patrol_rank_a_hotspot_issue_positions ORDER BY IssueID ASC')]);
    }
    if ($method === 'PUT' && $path === '/patrol/rank-a-hotspot-issue-positions') {
        patrol_require_admin($user);
        $b = json_body();
        $items = $b['positions'] ?? null;
        if (!is_array($items) || count($items) < 1 || count($items) > 500) {
            json_response(['success' => false, 'message' => 'positions array with 1-500 items is required.'], 400);
        }
        foreach ($items as $item) {
            if (!is_array($item)) {
                json_response(['success' => false, 'message' => 'Invalid Rank A issue position payload.'], 400);
            }
            $issueRaw = $item['IssueID'] ?? $item['issueId'] ?? null;
            $issueId = filter_var($issueRaw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            $x = isset($item['MapXPercent']) ? (float) $item['MapXPercent'] : (isset($item['mapXPercent']) ? (float) $item['mapXPercent'] : (isset($item['x']) ? (float) $item['x'] : null));
            $y = isset($item['MapYPercent']) ? (float) $item['MapYPercent'] : (isset($item['mapYPercent']) ? (float) $item['mapYPercent'] : (isset($item['y']) ? (float) $item['y'] : null));
            if ($issueId === false || $x === null || $y === null || !is_finite($x) || !is_finite($y) || $x < 0 || $x > 100 || $y < 0 || $y > 100) {
                json_response(['success' => false, 'message' => 'Invalid Rank A issue position payload.'], 400);
            }
            if (!db_row('SELECT IssueID FROM patrol_issues WHERE IssueID=? AND UPPER(COALESCE(`Rank`,""))="A" LIMIT 1', [$issueId])) {
                json_response(['success' => false, 'message' => 'Rank A Patrol issue #' . $issueId . ' was not found.'], 400);
            }
            db_execute(
                'INSERT INTO patrol_rank_a_hotspot_issue_positions (IssueID,MapXPercent,MapYPercent,UpdatedBy)
                 VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE MapXPercent=VALUES(MapXPercent),MapYPercent=VALUES(MapYPercent),UpdatedBy=VALUES(UpdatedBy),UpdatedAt=NOW()',
                [$issueId, $x, $y, patrol_user_name($user)]
            );
        }
        json_response(['success' => true, 'data' => db_rows('SELECT id,IssueID,MapXPercent,MapYPercent,UpdatedBy,UpdatedAt FROM patrol_rank_a_hotspot_issue_positions ORDER BY IssueID ASC')]);
    }
    if ($method === 'GET' && $path === '/patrol/issues') {
        json_response(['success' => true, 'data' => db_rows(
            'SELECT i.*,
                    e.EmployeeName AS ReporterName,
                    e.CompanyEmail AS ReporterEmail,
                    e.Department AS ReporterDepartment,
                    e.Unit AS ReporterUnit,
                    e.Team AS ReporterTeam,
                    e.Position AS ReporterPosition
             FROM patrol_issues i
             LEFT JOIN employees e ON e.EmployeeID=i.ReporterID
             ORDER BY i.IssueID DESC'
        )]);
    }
    $issueEvents = route_params($path, '/patrol/issue/:id/events');
    if ($issueEvents !== null && $method === 'GET') {
        json_response(['success' => true, 'data' => db_rows(
            'SELECT id,IssueID,EventType,ActorID,ActorName,ActorRole,FromStatus,ToStatus,Comment,BeforeImage,TempImage,AfterImage,Metadata,CreatedAt
             FROM patrol_issue_events
             WHERE IssueID=?
             ORDER BY CreatedAt ASC,id ASC',
            [$issueEvents['id']]
        )]);
    }
    if ($method === 'POST' && $path === '/patrol/issue/save') {
        $stored = [];
        $issueMutationCommitted = false;
        try {
            $b = $_POST ?: json_body();
            $before = patrol_store_optional_upload('BeforeImage', $stored);
            $temp = patrol_store_optional_upload('TempImage', $stored);
            $after = patrol_store_optional_upload('AfterImage', $stored);
            $error = patrol_validate_issue($b);
            if ($error) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => $error], 400); }
            $action = (string) $b['ActionType'];
            if ($action === 'OPEN' || ($action === 'UPDATE' && patrol_is_admin($user))) {
                $classificationError = patrol_normalize_validate_issue_classification($b);
                if ($classificationError) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => $classificationError], 400); }
            }
            $email = null;
            $savedId = null;
            if ($action === 'OPEN') {
                db_execute('INSERT INTO patrol_issues(DateFound,FoundByTeam,Area,ResponsibleDept,ResponsibleUnit,HazardType,MachineName,HazardDescription,`Rank`,DueDate,BeforeImage,CurrentStatus,ReporterID,OpenedByID,OpenedAt,CloseApprovalStatus) VALUES(?,?,?,?,?,?,?,?,?,?,?,"Open",?,?,NOW(),"None")', [$b['DateFound'], $b['FoundByTeam'] ?? null, $b['Area'], $b['ResponsibleDept'] ?? null, $b['ResponsibleUnit'] ?? null, $b['HazardType'], $b['MachineName'] ?? null, $b['HazardDescription'], $b['Rank'] ?? null, $b['DueDate'] ?? null, $before, $uid, $uid]);
                $savedId = (int) db()->lastInsertId();
                patrol_record_issue_event($savedId, 'CREATED', $user, null, 'Open', $b['HazardDescription'] ?? null, ['beforeImage' => $before], array_merge($b, ['IssueID' => $savedId, 'CurrentStatus' => 'Open']));
                $email = patrol_queue_issue_email($savedId, 'IssueCreated', $user);
            } elseif ($action === 'TEMP') {
                $current = db_row('SELECT * FROM patrol_issues WHERE IssueID=?', [$b['IssueID']]);
                if (!$current) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => 'Issue not found.'], 404); }
                patrol_require_issue_progress_access($user, $current, $b, $stored);
                patrol_run_issue_transaction(function () use ($b, $temp, $uid) {
                    db_execute("UPDATE patrol_issues SET TempDescription=?,TempImage=COALESCE(?,TempImage),TempDate=NOW(),TemporaryByID=?,TemporaryAt=NOW(),CurrentStatus='Temporary' WHERE IssueID=?", [$b['TempDescription'], $temp, $uid, $b['IssueID']]);
                });
                $issueMutationCommitted = true;
                if ($temp && $current) delete_uploaded_file($current['TempImage']);
                $savedId = (int) $b['IssueID'];
                patrol_record_issue_event($savedId, 'TEMP_UPDATED', $user, $current['CurrentStatus'] ?? null, 'Temporary', $b['TempDescription'] ?? null, ['tempImage' => $temp], array_merge($b, ['CurrentStatus' => 'Temporary']));
                $email = patrol_queue_issue_email($savedId, 'TemporaryUpdated', $user);
            } elseif ($action === 'CLOSE') {
                $current = db_row('SELECT * FROM patrol_issues WHERE IssueID=?', [$b['IssueID']]);
                if (!$current) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => 'Issue not found.'], 404); }
                $isAdminAction = patrol_is_admin($user);
                if (!$isAdminAction) {
                    patrol_require_issue_progress_access($user, $current, $b, $stored);
                    if ((string) ($current['CloseApprovalStatus'] ?? '') === 'Pending') {
                        patrol_cleanup_urls($stored);
                        json_response(['success' => false, 'message' => 'This issue already has a pending close request.'], 409);
                    }
                    $requestStatus = ($current['CurrentStatus'] ?? '') === 'Temporary' ? 'Temporary' : (($current['CurrentStatus'] ?? '') ?: 'Open');
                    patrol_run_issue_transaction(function () use ($b, $after, $requestStatus, $uid) {
                        db_execute("UPDATE patrol_issues SET ActionDescription=?,AfterImage=COALESCE(?,AfterImage),FinishDate=?,CurrentStatus=?,CloseApprovalStatus='Pending',CloseRequestedBy=?,CloseRequestedAt=NOW(),CloseApprovedBy=NULL,CloseApprovedAt=NULL,CloseRejectedBy=NULL,CloseRejectedAt=NULL,CloseRejectReason=NULL WHERE IssueID=?", [$b['ActionDescription'], $after, $b['FinishDate'], $requestStatus, $uid, $b['IssueID']]);
                    });
                    $issueMutationCommitted = true;
                    if ($after && $current) delete_uploaded_file($current['AfterImage']);
                    $savedId = (int) $b['IssueID'];
                    patrol_record_issue_event($savedId, 'CLOSE_REQUESTED', $user, $current['CurrentStatus'] ?? null, $requestStatus, $b['ActionDescription'] ?? null, ['afterImage' => $after], array_merge($b, ['CurrentStatus' => $requestStatus, 'CloseApprovalStatus' => 'Pending']));
                    $email = patrol_queue_issue_email($savedId, 'CloseRequested', $user);
                    json_response(['success' => true, 'message' => 'Close request submitted.', 'id' => $savedId, 'email' => $email]);
                }
                db_execute("UPDATE patrol_issues SET ActionDescription=?,AfterImage=COALESCE(?,AfterImage),FinishDate=?,CurrentStatus='Closed',ResultStatus='Closed',ClosedByID=?,ClosedAt=NOW(),CloseApprovalStatus='Approved',CloseApprovedBy=?,CloseApprovedAt=NOW() WHERE IssueID=?", [$b['ActionDescription'], $after, $b['FinishDate'], $uid, $uid, $b['IssueID']]);
                if ($after && $current) delete_uploaded_file($current['AfterImage']);
                $savedId = (int) $b['IssueID'];
                patrol_record_issue_event($savedId, 'CLOSED', $user, $current['CurrentStatus'] ?? null, 'Closed', $b['ActionDescription'] ?? null, ['afterImage' => $after], array_merge($b, ['CurrentStatus' => 'Closed', 'CloseApprovalStatus' => 'Approved']));
                $email = patrol_queue_issue_email($savedId, 'IssueClosed', $user);
            } else {
                $current = db_row('SELECT * FROM patrol_issues WHERE IssueID=?', [$b['IssueID']]);
                if (!$current) { patrol_cleanup_urls($stored); json_response(['success' => false, 'message' => 'Issue not found.'], 404); }
                $isAdminAction = patrol_is_admin($user);
                if (!$isAdminAction) patrol_require_issue_progress_access($user, $current, $b, $stored);
                $hasFinal = trim((string) ($b['ActionDescription'] ?? '')) !== '';
                $hasTemp = trim((string) ($b['TempDescription'] ?? '')) !== '';
                $finishDate = patrol_blank_to_null($b['FinishDate'] ?? null);
                $status = patrol_issue_update_status($current, $isAdminAction, $hasTemp, $hasFinal);
                if (!$isAdminAction) {
                    if ($hasFinal && (string) ($current['CloseApprovalStatus'] ?? '') === 'Pending') {
                        patrol_cleanup_urls($stored);
                        json_response(['success' => false, 'message' => 'This issue already has a pending close request.'], 409);
                    }
                    $savedId = (int) $b['IssueID'];
                    patrol_run_issue_transaction(function () use ($b, $temp, $uid, $after, $finishDate, $status, $hasFinal, $savedId) {
                        db_execute('UPDATE patrol_issues SET TempDescription=?,TempImage=COALESCE(?,TempImage),TempDate=IF(? IS NOT NULL AND ?!="",NOW(),TempDate),TemporaryByID=IF(? IS NOT NULL AND ?!="",?,TemporaryByID),TemporaryAt=IF(? IS NOT NULL AND ?!="",NOW(),TemporaryAt),ActionDescription=?,AfterImage=COALESCE(?,AfterImage),FinishDate=?,CurrentStatus=? WHERE IssueID=?', [patrol_blank_to_null($b['TempDescription'] ?? null), $temp, patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), $uid, patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['ActionDescription'] ?? null), $after, $finishDate, $status, $b['IssueID']]);
                        if ($hasFinal) {
                            db_execute("UPDATE patrol_issues SET CloseApprovalStatus='Pending',CloseRequestedBy=?,CloseRequestedAt=NOW(),CloseApprovedBy=NULL,CloseApprovedAt=NULL,CloseRejectedBy=NULL,CloseRejectedAt=NULL,CloseRejectReason=NULL WHERE IssueID=?", [$uid, $savedId]);
                        }
                    });
                    $issueMutationCommitted = true;
                    if ($temp && $current) delete_uploaded_file($current['TempImage']);
                    if ($after && $current) delete_uploaded_file($current['AfterImage']);
                    if ($status === 'Temporary' && ($current['CurrentStatus'] ?? '') !== 'Temporary') {
                        $email = patrol_queue_issue_email($savedId, 'TemporaryUpdated', $user);
                    }
                    patrol_record_issue_event($savedId, $hasFinal ? 'CLOSE_REQUESTED' : ($status === 'Temporary' && ($current['CurrentStatus'] ?? '') !== 'Temporary' ? 'TEMP_UPDATED' : 'UPDATED'), $user, $current['CurrentStatus'] ?? null, $status, patrol_blank_to_null($b['TempDescription'] ?? null) ?: patrol_blank_to_null($b['ActionDescription'] ?? null), ['tempImage' => $temp, 'afterImage' => $after], array_merge($b, ['CurrentStatus' => $status, 'CloseApprovalStatus' => $hasFinal ? 'Pending' : ($current['CloseApprovalStatus'] ?? null)]));
                    if ($hasFinal) {
                        $email = patrol_queue_issue_email($savedId, 'CloseRequested', $user);
                    }
                    json_response(['success' => true, 'message' => 'Saved.', 'id' => $savedId, 'email' => $email]);
                }
                db_execute('UPDATE patrol_issues SET Area=COALESCE(?,Area),ResponsibleDept=COALESCE(?,ResponsibleDept),ResponsibleUnit=?,HazardType=COALESCE(?,HazardType),MachineName=?,HazardDescription=COALESCE(?,HazardDescription),`Rank`=COALESCE(?,`Rank`),DueDate=COALESCE(?,DueDate),TempDescription=?,TempImage=COALESCE(?,TempImage),TempDate=IF(? IS NOT NULL AND ?!="",NOW(),TempDate),TemporaryByID=IF(? IS NOT NULL AND ?!="",?,TemporaryByID),TemporaryAt=IF(? IS NOT NULL AND ?!="",NOW(),TemporaryAt),ActionDescription=?,AfterImage=COALESCE(?,AfterImage),FinishDate=?,CurrentStatus=?,ClosedByID=IF(?="Closed",?,ClosedByID),ClosedAt=IF(?="Closed",NOW(),ClosedAt),CloseApprovalStatus=IF(?="Closed","Approved",CloseApprovalStatus),CloseApprovedBy=IF(?="Closed",?,CloseApprovedBy),CloseApprovedAt=IF(?="Closed",NOW(),CloseApprovedAt) WHERE IssueID=?', [$b['Area'] ?? null, $b['ResponsibleDept'] ?? null, $b['ResponsibleUnit'] ?? null, $b['HazardType'] ?? null, $b['MachineName'] ?? null, $b['HazardDescription'] ?? null, $b['Rank'] ?? null, patrol_blank_to_null($b['DueDate'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), $temp, patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), $uid, patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['TempDescription'] ?? null), patrol_blank_to_null($b['ActionDescription'] ?? null), $after, $finishDate, $status, $status, $uid, $status, $status, $status, $uid, $status, $b['IssueID']]);
                if ($temp && $current) delete_uploaded_file($current['TempImage']);
                if ($after && $current) delete_uploaded_file($current['AfterImage']);
                $savedId = (int) $b['IssueID'];
                if ($status === 'Closed' && ($current['CurrentStatus'] ?? '') !== 'Closed') {
                    $email = patrol_queue_issue_email($savedId, 'IssueClosed', $user);
                } elseif ($status === 'Temporary' && ($current['CurrentStatus'] ?? '') !== 'Temporary') {
                    $email = patrol_queue_issue_email($savedId, 'TemporaryUpdated', $user);
                }
                patrol_record_issue_event($savedId, $status === 'Closed' && ($current['CurrentStatus'] ?? '') !== 'Closed' ? 'CLOSED' : ($status === 'Temporary' && ($current['CurrentStatus'] ?? '') !== 'Temporary' ? 'TEMP_UPDATED' : 'UPDATED'), $user, $current['CurrentStatus'] ?? null, $status, patrol_blank_to_null($b['ActionDescription'] ?? null) ?: patrol_blank_to_null($b['TempDescription'] ?? null), ['tempImage' => $temp, 'afterImage' => $after], array_merge($b, ['CurrentStatus' => $status, 'CloseApprovalStatus' => $status === 'Closed' ? 'Approved' : ($current['CloseApprovalStatus'] ?? null)]));
            }
            json_response(['success' => true, 'message' => 'Saved.', 'id' => $savedId, 'email' => $email]);
        } catch (Throwable $e) {
            if (!$issueMutationCommitted) patrol_cleanup_urls($stored);
            throw $e;
        }
    }
    $closeReview = route_params($path, '/patrol/issue/:id/close-review');
    if ($closeReview !== null && $method === 'POST') {
        patrol_require_admin($user);
        $issueId = $closeReview['id'];
        $b = json_body();
        $action = strtolower(trim((string) ($b['action'] ?? $b['Action'] ?? '')));
        $reason = patrol_blank_to_null($b['reason'] ?? $b['Reason'] ?? $b['CloseRejectReason'] ?? null);
        if (!in_array($action, ['approve', 'reject'], true)) {
            json_response(['success' => false, 'message' => 'Review action must be approve or reject.'], 400);
        }
        if ($action === 'reject' && !$reason) {
            json_response(['success' => false, 'message' => 'Reject reason is required.'], 400);
        }
        $issue = db_row('SELECT * FROM patrol_issues WHERE IssueID=?', [$issueId]);
        if (!$issue) {
            json_response(['success' => false, 'message' => 'Issue not found.'], 404);
        }
        if ((string) ($issue['CloseApprovalStatus'] ?? '') !== 'Pending') {
            json_response(['success' => false, 'message' => 'This issue has no pending close request.'], 409);
        }
        if ($action === 'approve') {
            db_execute("UPDATE patrol_issues SET CurrentStatus='Closed',ResultStatus='Closed',ClosedByID=COALESCE(CloseRequestedBy,ClosedByID),ClosedAt=NOW(),CloseApprovalStatus='Approved',CloseApprovedBy=?,CloseApprovedAt=NOW(),CloseRejectedBy=NULL,CloseRejectedAt=NULL,CloseRejectReason=NULL WHERE IssueID=?", [$uid, $issueId]);
            patrol_record_issue_event($issueId, 'CLOSE_APPROVED', $user, $issue['CurrentStatus'] ?? null, 'Closed', $issue['ActionDescription'] ?? null, ['afterImage' => $issue['AfterImage'] ?? null], array_merge($issue, ['CurrentStatus' => 'Closed', 'CloseApprovalStatus' => 'Approved']));
            patrol_log_audit($user, 'APPROVE_CLOSE_PATROL_ISSUE', 'patrol_issues', $issueId, 'Approve close request for patrol issue #' . $issueId, array_merge($issue, ['CurrentStatus' => 'Closed', 'CloseApprovalStatus' => 'Approved']));
            $email = patrol_queue_issue_email($issueId, 'CloseApproved', $user);
            json_response(['success' => true, 'message' => 'Close request approved.', 'status' => 'Approved', 'email' => $email]);
        }
        db_execute("UPDATE patrol_issues SET CloseApprovalStatus='Rejected',CloseRejectedBy=?,CloseRejectedAt=NOW(),CloseRejectReason=?,CloseApprovedBy=NULL,CloseApprovedAt=NULL WHERE IssueID=?", [$uid, $reason, $issueId]);
        patrol_record_issue_event($issueId, 'CLOSE_REJECTED', $user, $issue['CurrentStatus'] ?? null, $issue['CurrentStatus'] ?? null, $reason, ['afterImage' => $issue['AfterImage'] ?? null], array_merge($issue, ['CloseApprovalStatus' => 'Rejected', 'CloseRejectReason' => $reason]));
        patrol_log_audit($user, 'REJECT_CLOSE_PATROL_ISSUE', 'patrol_issues', $issueId, 'Reject close request for patrol issue #' . $issueId, array_merge($issue, ['CloseApprovalStatus' => 'Rejected', 'CloseRejectReason' => $reason]));
        $email = patrol_queue_issue_email($issueId, 'CloseRejected', $user);
        json_response(['success' => true, 'message' => 'Close request rejected.', 'status' => 'Rejected', 'email' => $email]);
    }
    $p = route_params($path, '/patrol/issue/:id');
    if ($p !== null && $method === 'DELETE') { require_admin(); $row = db_row('SELECT BeforeImage,TempImage,AfterImage FROM patrol_issues WHERE IssueID=?', [$p['id']]); $count = db_execute('DELETE FROM patrol_issues WHERE IssueID=?', [$p['id']]); if ($count === 0) json_response(['success' => false, 'message' => 'Not found.'], 404); try { db_execute('DELETE FROM patrol_rank_a_hotspot_issue_positions WHERE IssueID=?', [$p['id']]); } catch (Throwable $e) {} if ($row) patrol_cleanup_urls([$row['BeforeImage'], $row['TempImage'], $row['AfterImage']]); json_response(['success' => true, 'message' => 'Deleted.']); }

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
        $leaveYearTotal = 0;
        $allowedLeaveYearTotal = 0;
        $acceptedLeaveYearTotal = 0;
        $overLeaveYearTotal = 0;
        $acceptedCoverageToDateTotal = 0;
        $acceptedCoverageYearTotal = 0;
        $acceptedPassToDateTotal = 0;
        foreach ($members as $m) {
            $detail = patrol_attendance_detail_top((string) $m['EmployeeID'], $year);
            $summary = $detail['summary'];
            $leave = $summary['leave'] ?? [];
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
            $leaveYearTotal += (int) ($summary['leaveYear'] ?? ($leave['leaveYear'] ?? 0));
            $allowedLeaveYearTotal += (int) ($summary['allowedLeaveYear'] ?? ($leave['allowedLeaveYear'] ?? 0));
            $acceptedLeaveYearTotal += (int) ($summary['acceptedLeaveYear'] ?? ($leave['acceptedLeaveYear'] ?? 0));
            $overLeaveYearTotal += (int) ($summary['overLeaveYear'] ?? ($leave['overLeaveYear'] ?? 0));
            $acceptedCoverageToDateTotal += (int) ($summary['acceptedCoverageToDate'] ?? ($leave['acceptedCoverageToDate'] ?? $completedToDate));
            $acceptedCoverageYearTotal += (int) ($summary['acceptedCoverageYear'] ?? ($leave['acceptedCoverageYear'] ?? $fullYearCompleted));
            if (!empty($summary['acceptedPassToDate'])) $acceptedPassToDateTotal++;
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
                'PassPct' => (int) ($summary['passPct'] ?? 80),
                'PassThresholdToDate' => (int) ($summary['passThresholdToDate'] ?? patrol_pass_threshold($requiredToDate, (int) ($summary['passPct'] ?? 80))),
                'PassThresholdYear' => (int) ($summary['passThresholdYear'] ?? patrol_pass_threshold($yearlyTarget, (int) ($summary['passPct'] ?? 80))),
                'LeaveYear' => (int) ($summary['leaveYear'] ?? ($leave['leaveYear'] ?? 0)),
                'AllowedLeaveYear' => (int) ($summary['allowedLeaveYear'] ?? ($leave['allowedLeaveYear'] ?? 0)),
                'AcceptedLeaveYear' => (int) ($summary['acceptedLeaveYear'] ?? ($leave['acceptedLeaveYear'] ?? 0)),
                'LeaveRemainingYear' => (int) ($summary['leaveRemainingYear'] ?? ($leave['leaveRemainingYear'] ?? 0)),
                'OverLeaveYear' => (int) ($summary['overLeaveYear'] ?? ($leave['overLeaveYear'] ?? 0)),
                'AcceptedCoverageToDate' => (int) ($summary['acceptedCoverageToDate'] ?? ($leave['acceptedCoverageToDate'] ?? $completedToDate)),
                'AcceptedCoverageYear' => (int) ($summary['acceptedCoverageYear'] ?? ($leave['acceptedCoverageYear'] ?? $fullYearCompleted)),
                'AcceptedCoverageToDatePct' => (int) ($summary['acceptedCoverageToDatePct'] ?? ($leave['acceptedCoverageToDatePct'] ?? 0)),
                'AcceptedCoverageYearPct' => (int) ($summary['acceptedCoverageYearPct'] ?? ($leave['acceptedCoverageYearPct'] ?? 0)),
                'ActualPassToDate' => !empty($summary['actualPassToDate']),
                'AcceptedPassToDate' => !empty($summary['acceptedPassToDate']),
                'FinalStatus' => $summary['finalStatus'] ?? 'Below target',
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
            'leaveYearTotal' => $leaveYearTotal,
            'allowedLeaveYearTotal' => $allowedLeaveYearTotal,
            'acceptedLeaveYearTotal' => $acceptedLeaveYearTotal,
            'overLeaveYearTotal' => $overLeaveYearTotal,
            'acceptedCoverageToDateTotal' => $acceptedCoverageToDateTotal,
            'acceptedCoverageYearTotal' => $acceptedCoverageYearTotal,
            'acceptedCoverageToDatePct' => patrol_pct($acceptedCoverageToDateTotal, $requiredToDateTotal),
            'acceptedCoverageYearPct' => patrol_pct($acceptedCoverageYearTotal, $yearlyTargetTotal),
            'acceptedPassToDateTotal' => $acceptedPassToDateTotal,
            'latestDate' => $latestRow['LatestDate'] ?? null,
            'year' => $year,
        ]]]);
    }
    if ($method === 'GET' && $path === '/patrol/member-attendance') { if (empty($_GET['employeeId'])) json_response(['success' => false, 'message' => 'employeeId is required.'], 400); json_response(['success' => true, 'data' => db_rows('SELECT id,PatrolDate,PatrolType,Area,Notes,ScheduledSessionID FROM patrol_attendance WHERE UserID=? AND YEAR(PatrolDate)=? ORDER BY PatrolDate DESC,id DESC', [$_GET['employeeId'], patrol_query_year()])]); }
    if ($method === 'GET' && $path === '/patrol/my-self-patrol') {
        $year = patrol_query_year();
        $month = patrol_query_month();
        $emp = db_row('SELECT mp.IsSupervisorPatrol,e.Position FROM employees e LEFT JOIN master_positions mp ON mp.Name=e.Position WHERE e.EmployeeID=?', [$uid]);
        $roster = db_row("SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$uid]);
        if ((empty($emp) || empty($emp['IsSupervisorPatrol'])) && !$roster) {
            json_response(['success' => true, 'data' => ['isSupervisorPatrol' => false, 'checkins' => []]]);
        }
        $detail = patrol_attendance_detail_supervisor($uid, $year, !empty($emp['IsSupervisorPatrol']));
        $period = [];
        foreach ($detail['periods'] ?? [] as $p) {
            if ((int) ($p['month'] ?? 0) === $month) {
                $period = $p;
                break;
            }
        }
        $items = $period['items'] ?? [];
        $open = array_values(array_filter($items, static function ($item) {
            return empty($item['isCompleted']) && empty($item['isLeave']) && empty($item['isLeavePending']);
        }));
        $yearSchedule = $detail['schedule'] ?? [];
        $openYearSchedule = $detail['openSchedule'] ?? array_values(array_filter($yearSchedule, static function ($item) {
            return empty($item['isCompleted']) && empty($item['isLeave']) && empty($item['isLeavePending']);
        }));
        $monthlyRequirement = (int) ($period['monthlyRequirement'] ?? ($period['required'] ?? 0));
        $completed = (int) ($period['completed'] ?? 0);
        json_response(['success' => true, 'data' => [
            'isSupervisorPatrol' => true,
            'scheduleMode' => 'scheduled',
            'position' => $emp['Position'] ?? ($detail['employee']['Position'] ?? ''),
            'checkins' => $period['records'] ?? [],
            'target' => $monthlyRequirement,
            'monthlyRequirement' => $monthlyRequirement,
            'completed' => $completed,
            'remaining' => max(0, $monthlyRequirement - $completed),
            'periodStatus' => $period['status'] ?? 'upcoming',
            'yearlyTarget' => (int) ($detail['summary']['yearlyTarget'] ?? 0),
            'yearlyCompleted' => (int) ($detail['summary']['completed'] ?? 0),
            'passPct' => (int) ($detail['summary']['passPct'] ?? ($detail['passPct'] ?? 80)),
            'leave' => $detail['summary']['leave'] ?? null,
            'leaveRequests' => $detail['leaveRequests'] ?? [],
            'acceptedCoverageToDatePct' => (int) ($detail['summary']['acceptedCoverageToDatePct'] ?? 0),
            'acceptedCoverageYearPct' => (int) ($detail['summary']['acceptedCoverageYearPct'] ?? 0),
            'scheduledTotal' => (int) ($detail['summary']['scheduledTotal'] ?? count($yearSchedule)),
            'targetSource' => $detail['targetSource'] ?? ($detail['summary']['targetSource'] ?? 'patrol_roster'),
            'currentPeriod' => $period,
            'periods' => $detail['periods'] ?? [],
            'schedule' => $items,
            'openSchedule' => $open,
            'yearSchedule' => $yearSchedule,
            'openYearSchedule' => $openYearSchedule,
        ]]);
    }
    if ($method === 'GET' && $path === '/patrol/leave-requests') {
        $group = trim((string) ($_GET['group'] ?? ($_GET['RosterGroup'] ?? 'supervisor')));
        if (!in_array($group, ['top_management', 'supervisor'], true)) {
            json_response(['success' => false, 'message' => 'group is invalid.'], 400);
        }
        $reviewer = patrol_can_review_leave($user);
        $wantsAll = $reviewer && in_array(strtolower(trim((string) ($_GET['all'] ?? ($_GET['allEmployees'] ?? '')))), ['1', 'true', 'yes'], true);
        $employeeId = $wantsAll ? '' : ($reviewer && !empty($_GET['employeeId']) ? (string) $_GET['employeeId'] : $uid);
        if ($employeeId === '' && !$wantsAll) {
            json_response(['success' => false, 'message' => 'employeeId is required.'], 400);
        }
        $year = patrol_query_year();
        $status = trim((string) ($_GET['status'] ?? ''));
        json_response(['success' => true, 'data' => patrol_leave_rows($employeeId, $group, $year, ['status' => $status])]);
    }
    if ($method === 'POST' && $path === '/patrol/leave-request') {
        $b = stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') !== false ? $_POST : json_body();
        $group = trim((string) ($b['RosterGroup'] ?? ($b['group'] ?? '')));
        if (!in_array($group, ['top_management', 'supervisor'], true)) {
            json_response(['success' => false, 'message' => 'RosterGroup is invalid.'], 400);
        }
        $employeeId = patrol_is_admin($user) && !empty($b['EmployeeID']) ? trim((string) $b['EmployeeID']) : $uid;
        $sid = trim((string) ($b['ScheduledSessionID'] ?? ($b['scheduledSessionId'] ?? '')));
        $scheduledDate = patrol_valid_date($b['ScheduledDate'] ?? ($b['scheduledDate'] ?? ($b['date'] ?? null)));
        $reason = trim((string) ($b['Reason'] ?? ($b['reason'] ?? '')));
        if ($sid === '' && !$scheduledDate) json_response(['success' => false, 'message' => 'ScheduledSessionID or ScheduledDate is required.'], 400);
        if ($reason === '') json_response(['success' => false, 'message' => 'Reason is required.'], 400);
        $year = $scheduledDate ? (int) substr($scheduledDate, 0, 4) : (int) date('Y');
        $detail = $group === 'supervisor'
            ? patrol_attendance_detail_supervisor($employeeId, $year, true)
            : patrol_attendance_detail_top($employeeId, $year);
        $target = null;
        foreach (($detail['schedule'] ?? []) as $item) {
            $itemId = trim((string) ($item['ScheduledSessionID'] ?? ($item['sessionId'] ?? ($item['id'] ?? ''))));
            $itemDate = substr((string) ($item['ScheduledDate'] ?? ($item['PatrolDate'] ?? ($item['date'] ?? ''))), 0, 10);
            if (($sid !== '' && ($itemId === $sid || (string) ($item['id'] ?? '') === $sid)) || ($scheduledDate && $itemDate === $scheduledDate)) {
                $target = $item;
                break;
            }
        }
        if (!$target) json_response(['success' => false, 'message' => 'Selected schedule is not valid for this employee.'], 400);
        $targetId = trim((string) ($target['ScheduledSessionID'] ?? ($target['sessionId'] ?? ($target['id'] ?? $sid))));
        $targetDate = substr((string) ($target['ScheduledDate'] ?? ($target['PatrolDate'] ?? ($target['date'] ?? $scheduledDate))), 0, 10);
        if (!empty($target['isCompleted']) || !empty($target['records'])) json_response(['success' => false, 'message' => 'Selected schedule is already completed.'], 409);
        if (!empty($target['isLeave']) || !empty($target['isLeavePending']) || patrol_leave_blocking($target['leave'] ?? [])) json_response(['success' => false, 'message' => 'Selected schedule already has a pending/approved leave request.'], 409);
        if (db_row("SELECT id FROM patrol_leave_requests WHERE EmployeeID=? AND RosterGroup=? AND ScheduledSessionID=? AND Status IN ('Pending','Approved') LIMIT 1", [$employeeId, $group, $targetId])) {
            json_response(['success' => false, 'message' => 'Selected schedule already has a leave request.'], 409);
        }
        $upload = patrol_leave_attachment_upload();
        $url = $upload['url'] ?? null;
        try {
            $status = patrol_can_review_leave($user) ? 'Approved' : 'Pending';
            db_execute(
                'INSERT INTO patrol_leave_requests(EmployeeID,RosterGroup,ScheduledSessionID,ScheduledDate,LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,ReviewedBy,ReviewedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                [$employeeId, $group, $targetId, $targetDate, trim((string) ($b['LeaveType'] ?? ($b['leaveType'] ?? ''))) ?: null, trim((string) ($b['Destination'] ?? ($b['destination'] ?? ''))) ?: null, $reason, $url, $status, $uid, $status === 'Approved' ? $uid : null, $status === 'Approved' ? date('Y-m-d H:i:s') : null]
            );
        } catch (Throwable $e) {
            if ($url) delete_uploaded_file($url);
            json_response(['success' => false, 'message' => strpos($e->getMessage(), 'Duplicate') !== false ? 'Selected schedule already has a leave request.' : $e->getMessage()], 409);
        }
        $id = (int) db()->lastInsertId();
        patrol_log_audit($user, 'SUBMIT_PATROL_LEAVE', 'patrol_leave_requests', $id, 'Submit patrol leave ' . $employeeId . ' ' . $group . ' ' . $targetDate . ' -> ' . $status, [
            'employeeId' => $employeeId,
            'group' => $group,
            'scheduledSessionId' => $targetId,
            'scheduledDate' => $targetDate,
            'status' => $status,
        ]);
        try {
            $email = patrol_queue_leave_email($id, 'PatrolLeaveSubmitted', $user);
        } catch (Throwable $e) {
            $email = ['queued' => false, 'sent' => false, 'reason' => $e->getMessage()];
        }
        json_response(['success' => true, 'message' => $status === 'Pending' ? 'Leave request submitted for review.' : 'Leave request saved.', 'data' => db_row('SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,ScheduledDate,LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,CreatedAt,ReviewedBy,ReviewNote,ReviewedAt FROM patrol_leave_requests WHERE id=?', [$id]), 'email' => $email]);
    }
    $review = route_params($path, '/patrol/leave-request/:id/review');
    if ($review !== null && $method === 'PATCH') {
        if (!patrol_can_review_leave($user)) json_response(['success' => false, 'message' => 'Permission denied. Admin/Safety access required.'], 403);
        $b = json_body();
        $action = strtolower(trim((string) ($b['action'] ?? ($b['Status'] ?? ($b['status'] ?? '')))));
        $map = ['approve' => 'Approved', 'approved' => 'Approved', 'reject' => 'Rejected', 'rejected' => 'Rejected', 'cancel' => 'Cancelled', 'cancelled' => 'Cancelled'];
        $nextStatus = $map[$action] ?? '';
        if ($nextStatus === '') json_response(['success' => false, 'message' => 'Review action is invalid.'], 400);
        $note = trim((string) ($b['ReviewNote'] ?? ($b['reviewNote'] ?? ($b['reason'] ?? ''))));
        if ($nextStatus === 'Rejected' && $note === '') json_response(['success' => false, 'message' => 'Reject reason is required.'], 400);
        $row = db_row('SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,ScheduledDate,Status FROM patrol_leave_requests WHERE id=?', [$review['id']]);
        if (!$row) json_response(['success' => false, 'message' => 'Not found.'], 404);
        if (!in_array((string) ($row['Status'] ?? ''), ['Pending', 'Approved'], true) && $nextStatus !== 'Cancelled') {
            json_response(['success' => false, 'message' => 'This leave request is already reviewed.'], 409);
        }
        db_execute('UPDATE patrol_leave_requests SET Status=?,ReviewedBy=?,ReviewNote=?,ReviewedAt=NOW() WHERE id=?', [$nextStatus, $uid, $note !== '' ? $note : null, $review['id']]);
        patrol_log_audit($user, 'REVIEW_PATROL_LEAVE_' . strtoupper($nextStatus), 'patrol_leave_requests', $review['id'], 'Review patrol leave ' . ($row['EmployeeID'] ?? '') . ' ' . ($row['RosterGroup'] ?? '') . ' ' . substr((string) ($row['ScheduledDate'] ?? ''), 0, 10) . ': ' . ($row['Status'] ?? '') . ' -> ' . $nextStatus, [
            'previousStatus' => $row['Status'] ?? null,
            'nextStatus' => $nextStatus,
            'note' => $note !== '' ? '[provided]' : null,
        ]);
        try {
            $email = patrol_queue_leave_email($review['id'], patrol_leave_event_from_status($nextStatus), $user);
        } catch (Throwable $e) {
            $email = ['queued' => false, 'sent' => false, 'reason' => $e->getMessage()];
        }
        json_response(['success' => true, 'message' => 'Leave request ' . $nextStatus . '.', 'data' => db_row('SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,ScheduledDate,LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,CreatedAt,ReviewedBy,ReviewNote,ReviewedAt FROM patrol_leave_requests WHERE id=?', [$review['id']]), 'email' => $email]);
    }
    $p = route_params($path, '/patrol/leave-request/:id');
    if ($p !== null && $method === 'DELETE') {
        $row = db_row('SELECT id,EmployeeID,AttachmentUrl FROM patrol_leave_requests WHERE id=?', [$p['id']]);
        if (!$row) json_response(['success' => false, 'message' => 'Not found.'], 404);
        if ((string) $row['EmployeeID'] !== $uid && !patrol_is_admin($user)) json_response(['success' => false, 'message' => 'Permission denied.'], 403);
        db_execute('DELETE FROM patrol_leave_requests WHERE id=?', [$p['id']]);
        if (!empty($row['AttachmentUrl'])) delete_uploaded_file($row['AttachmentUrl']);
        json_response(['success' => true]);
    }
    if ($method === 'POST' && $path === '/patrol/self-checkin') {
        $b = json_body();
        $date = patrol_valid_date($b['CheckinDate'] ?? null);
        if (!$date) json_response(['success' => false, 'message' => 'CheckinDate is required.'], 400);
        $type = patrol_self_checkin_type($b['PatrolType'] ?? 'normal');
        if (!$type) json_response(['success' => false, 'message' => 'PatrolType is invalid.'], 400);
        $sid = trim((string) ($b['ScheduledSessionID'] ?? ''));
        if ($sid === '') json_response(['success' => false, 'message' => 'ScheduledSessionID is required for self-patrol check-in.'], 400);
        $emp = db_row('SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.CompanyEmail,mp.IsSupervisorPatrol FROM employees e LEFT JOIN master_positions mp ON mp.Name=e.Position WHERE e.EmployeeID=?', [$uid]);
        if (!$emp || empty($emp['IsSupervisorPatrol'])) {
            $roster = db_row("SELECT id FROM patrol_roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1", [$uid]);
            if (!$roster) json_response(['success' => false, 'message' => 'Position is not allowed for Self-Patrol.'], 403);
        }
        $resolved = strpos($sid, 'FLEX:') === 0
            ? patrol_resolve_flexible_self_checkin($uid, $date, $sid, $b['Location'] ?? null)
            : patrol_resolve_supervisor_scheduled_session($uid, $date, $sid, ['requireSession' => true, 'preserveActualDate' => $type === 'compensation']);
        $effectiveDate = $resolved['date'];
        $session = $resolved['session'] ?? null;
        $location = $b['Location'] ?? null;
        if (strpos($sid, 'FLEX:') === 0) {
            $location = $session['AreaName'] ?? ($session['AreaCode'] ?? $location);
        } elseif (!$location && $session) {
            $location = $session['AreaName'] ?? ($session['AreaCode'] ?? null);
        }
        db_execute('INSERT INTO patrol_self_checkin(EmployeeID,CheckinDate,Location,Notes,Year,Month,PatrolType,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?,?)', [$uid, $effectiveDate, $location, $b['Notes'] ?? null, (int) substr($effectiveDate, 0, 4), (int) substr($effectiveDate, 5, 2), $type, $uid, $session['id'] ?? null]);
        $selfCheckinId = (int) db()->lastInsertId();
        $attendance = [
            'id' => $selfCheckinId,
            'UserID' => $uid,
            'UserName' => $emp['EmployeeName'] ?? patrol_user_name($user),
            'TeamName' => 'Sec. & Supervisor',
            'PatrolDate' => $effectiveDate,
            'PatrolType' => $type,
            'Area' => $location,
            'Notes' => $b['Notes'] ?? null,
            'ScheduledSessionID' => $session['id'] ?? null,
        ];
        $email = patrol_queue_checkin_email($selfCheckinId, $emp ?: [], $attendance, $session);
        json_response(['success' => true, 'message' => 'Check-in saved.', 'id' => $selfCheckinId, 'email' => $email, 'data' => [
            'group' => 'supervisor',
            'checkin' => [
                'id' => $selfCheckinId, 'employeeId' => $uid, 'employeeName' => $attendance['UserName'],
                'position' => $emp['Position'] ?? null, 'department' => $emp['Department'] ?? null,
                'type' => $type, 'actualDate' => $effectiveDate,
                'scheduledDate' => $session ? substr((string) ($session['PatrolDate'] ?? $effectiveDate), 0, 10) : $effectiveDate,
                'isMakeup' => $session && substr((string) ($session['PatrolDate'] ?? ''), 0, 10) !== $effectiveDate,
                'scheduledSessionId' => $session['id'] ?? null, 'round' => $session['PatrolRound'] ?? null,
                'area' => $location, 'teamName' => 'Sec. & Supervisor',
            ],
            'email' => $email,
        ]]);
    }
    $p = route_params($path, '/patrol/self-checkin/:id'); if ($p !== null && $method === 'DELETE') { $row = db_row('SELECT EmployeeID FROM patrol_self_checkin WHERE id=?', [$p['id']]); if (!$row) json_response(['success' => false, 'message' => 'Not found.'], 404); if ((string) $row['EmployeeID'] !== $uid && !patrol_is_admin($user)) json_response(['success' => false, 'message' => 'Permission denied.'], 403); db_execute('DELETE FROM patrol_self_checkin WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/patrol/supervisor-overview') {
        $year = patrol_query_year();
        $members = db_rows("SELECT pr.id AS RosterID,pr.EmployeeID,pr.TargetPerYear,e.EmployeeName,e.Department,e.Position FROM patrol_roster pr JOIN employees e ON e.EmployeeID=pr.EmployeeID WHERE pr.RosterGroup='supervisor' ORDER BY pr.SortOrder,e.Department,e.EmployeeName");
        foreach ($members as &$m) {
            $detail = patrol_attendance_detail_supervisor((string) $m['EmployeeID'], $year);
            $summary = $detail['summary'];
            $leave = $summary['leave'] ?? [];
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
            $m['passPct'] = (int) ($summary['passPct'] ?? 80);
            $m['passThresholdToDate'] = (int) ($summary['passThresholdToDate'] ?? patrol_pass_threshold($requiredToDate, (int) ($summary['passPct'] ?? 80)));
            $m['passThresholdYear'] = (int) ($summary['passThresholdYear'] ?? patrol_pass_threshold($yearlyTarget, (int) ($summary['passPct'] ?? 80)));
            $m['leaveYear'] = (int) ($summary['leaveYear'] ?? ($leave['leaveYear'] ?? 0));
            $m['allowedLeaveYear'] = (int) ($summary['allowedLeaveYear'] ?? ($leave['allowedLeaveYear'] ?? 0));
            $m['acceptedLeaveYear'] = (int) ($summary['acceptedLeaveYear'] ?? ($leave['acceptedLeaveYear'] ?? 0));
            $m['leaveRemainingYear'] = (int) ($summary['leaveRemainingYear'] ?? ($leave['leaveRemainingYear'] ?? 0));
            $m['overLeaveYear'] = (int) ($summary['overLeaveYear'] ?? ($leave['overLeaveYear'] ?? 0));
            $m['acceptedCoverageToDate'] = (int) ($summary['acceptedCoverageToDate'] ?? ($leave['acceptedCoverageToDate'] ?? $completedToDate));
            $m['acceptedCoverageYear'] = (int) ($summary['acceptedCoverageYear'] ?? ($leave['acceptedCoverageYear'] ?? $fullYearCompleted));
            $m['acceptedCoverageToDatePct'] = (int) ($summary['acceptedCoverageToDatePct'] ?? ($leave['acceptedCoverageToDatePct'] ?? 0));
            $m['acceptedCoverageYearPct'] = (int) ($summary['acceptedCoverageYearPct'] ?? ($leave['acceptedCoverageYearPct'] ?? 0));
            $m['actualPassToDate'] = !empty($summary['actualPassToDate']);
            $m['acceptedPassToDate'] = !empty($summary['acceptedPassToDate']);
            $m['finalStatus'] = $summary['finalStatus'] ?? 'Below target';
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
    if ($method === 'GET' && $path === '/patrol/supervisor-checkins') { if (empty($_GET['employeeId'])) json_response(['success' => false, 'message' => 'employeeId is required.'], 400); json_response(['success' => true, 'data' => db_rows('SELECT id,CheckinDate,Location,Notes,Year,Month,PatrolType,RecordedBy,ScheduledSessionID FROM patrol_self_checkin WHERE EmployeeID=? AND Year=? ORDER BY CheckinDate DESC', [$_GET['employeeId'], patrol_query_year()])]); }
    if ($method === 'POST' && $path === '/patrol/admin-record') { require_admin(); $b = json_body(); $date = patrol_valid_date($b['PatrolDate'] ?? null); if (empty($b['EmployeeID']) || !$date) json_response(['success' => false, 'message' => 'EmployeeID and PatrolDate are required.'], 400); if (trim((string) ($b['ScheduledSessionID'] ?? '')) === '') json_response(['success' => false, 'message' => 'ScheduledSessionID is required for admin on-behalf patrol records.'], 400); $emp = db_row('SELECT e.EmployeeName,t.Name AS TeamName FROM employees e LEFT JOIN patrol_team_members tm ON tm.EmployeeID=e.EmployeeID LEFT JOIN patrol_teams t ON t.id=tm.TeamID WHERE e.EmployeeID=? LIMIT 1', [$b['EmployeeID']]); if (!$emp) json_response(['success' => false, 'message' => 'Employee not found.'], 404); $resolved = patrol_resolve_scheduled_session((string) $b['EmployeeID'], $date, $b['ScheduledSessionID'] ?? null); $session = $resolved['session'] ?? null; $area = trim((string) ($b['Area'] ?? '')) ?: null; if (!$area && $session) $area = $session['AreaName'] ?: ($session['AreaCode'] ?? null); db_execute('INSERT INTO patrol_attendance(UserID,UserName,TeamName,WeekNumber,PatrolDate,Year,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?,?,?,?)', [$b['EmployeeID'], $emp['EmployeeName'], $emp['TeamName'] ?? '', patrol_week($date), $date, (int) substr($date, 0, 4), patrol_allowed_type($b['PatrolType'] ?? null), $area, $b['Notes'] ?? null, $uid, $session['id'] ?? null]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/admin-record/:id'); if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_attendance WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'POST' && $path === '/patrol/admin-record/supervisor') { require_admin(); $b = json_body(); $date = patrol_valid_date($b['CheckinDate'] ?? null); if (empty($b['EmployeeID']) || !$date) json_response(['success' => false, 'message' => 'EmployeeID and CheckinDate are required.'], 400); $type = patrol_self_checkin_type($b['PatrolType'] ?? 'normal'); if (!$type) json_response(['success' => false, 'message' => 'PatrolType is invalid.'], 400); $sid = trim((string) ($b['ScheduledSessionID'] ?? '')); if ($sid === '') json_response(['success' => false, 'message' => 'ScheduledSessionID is required for admin on-behalf self-patrol records.'], 400); $resolved = strpos($sid, 'FLEX:') === 0 ? patrol_resolve_flexible_self_checkin((string) $b['EmployeeID'], $date, $sid, $b['Location'] ?? null) : patrol_resolve_supervisor_scheduled_session((string) $b['EmployeeID'], $date, $sid, ['requireSession' => true, 'preserveActualDate' => $type === 'compensation']); $effectiveDate = $resolved['date']; $session = $resolved['session'] ?? null; $location = $b['Location'] ?? null; if (strpos($sid, 'FLEX:') === 0) $location = $session['AreaName'] ?? ($session['AreaCode'] ?? $location); elseif (!$location && $session) $location = $session['AreaName'] ?? ($session['AreaCode'] ?? null); db_execute('INSERT INTO patrol_self_checkin(EmployeeID,CheckinDate,Location,Notes,Year,Month,PatrolType,RecordedBy,ScheduledSessionID) VALUES(?,?,?,?,?,?,?,?,?)', [$b['EmployeeID'], $effectiveDate, $location, $b['Notes'] ?? null, (int) substr($effectiveDate, 0, 4), (int) substr($effectiveDate, 5, 2), $type, $uid, $session['id'] ?? null]); json_response(['success' => true, 'id' => (int) db()->lastInsertId()]); }
    $p = route_params($path, '/patrol/admin-record/supervisor/:id'); if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM patrol_self_checkin WHERE id=?', [$p['id']]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/patrol/employee-search') { require_admin(); $q = '%' . trim((string) ($_GET['q'] ?? '')) . '%'; json_response(['success' => true, 'data' => db_rows('SELECT EmployeeID,EmployeeName,Department,Position FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? ORDER BY EmployeeName LIMIT 30', [$q, $q, $q])]); }

    return false;
}
