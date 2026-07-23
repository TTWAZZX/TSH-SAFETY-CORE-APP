<?php
declare(strict_types=1);

function p5_user_name(array $user): string
{
    return trim((string)($user['name'] ?? $user['id'] ?? 'System')) ?: 'System';
}

function p5_uuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function p5_date($value): ?string
{
    $raw = trim((string)$value);
    if ($raw === '') return null;
    $raw = substr($raw, 0, 10);
    $d = DateTime::createFromFormat('!Y-m-d', $raw);
    return $d && $d->format('Y-m-d') === $raw ? $raw : null;
}

function p5_int($value, int $fallback = 0): int
{
    if ($value === null || $value === '') return $fallback;
    return max(0, (int)$value);
}

function p5_bool($value): int
{
    if ($value === true || $value === 1) return 1;
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
}

function p5_percent($value): ?float
{
    if ($value === null || $value === '') return null;
    $n = (float)$value;
    if (!is_finite($n) || $n < 0 || $n > 100) return null;
    return round($n, 3);
}

function p5_put_multipart(): array
{
    static $parsed = null;
    if ($parsed !== null) return $parsed;
    $parsed = ['fields' => [], 'files' => []];
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PUT') return $parsed;
    $type = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if (!preg_match('/boundary=(?:"([^"]+)"|([^;]+))/', $type, $match)) return $parsed;
    $boundary = $match[1] ?: trim($match[2]);
    $raw = (string)file_get_contents('php://input');
    foreach (explode('--' . $boundary, $raw) as $part) {
        $part = ltrim($part, "\r\n");
        if ($part === '' || $part === "--\r\n" || $part === '--') continue;
        $pair = explode("\r\n\r\n", $part, 2);
        if (count($pair) !== 2) continue;
        [$head, $value] = $pair;
        $value = preg_replace("/\r\n--$/", '', $value);
        if (!preg_match('/name="([^"]+)"/', $head, $nameMatch)) continue;
        $name = $nameMatch[1];
        if (!preg_match('/filename="([^"]*)"/', $head, $fileMatch)) {
            $parsed['fields'][$name] = rtrim($value, "\r\n");
            continue;
        }
        if ($fileMatch[1] === '') continue;
        $tmp = tempnam(sys_get_temp_dir(), 'p5-');
        file_put_contents($tmp, $value);
        register_shutdown_function(static function () use ($tmp): void {
            if (is_file($tmp)) @unlink($tmp);
        });
        $mime = 'application/octet-stream';
        if (preg_match('/Content-Type:\s*([^\r\n]+)/i', $head, $typeMatch)) $mime = trim($typeMatch[1]);
        $file = [
            'name' => $fileMatch[1],
            'type' => $mime,
            'tmp_name' => $tmp,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($tmp) ?: 0,
            'local_tmp' => true,
        ];
        if (!isset($parsed['files'][$name])) {
            $parsed['files'][$name] = $file;
        } else {
            if (!is_array($parsed['files'][$name]['name'] ?? null)) {
                $parsed['files'][$name] = [
                    'name' => [$parsed['files'][$name]['name']],
                    'type' => [$parsed['files'][$name]['type']],
                    'tmp_name' => [$parsed['files'][$name]['tmp_name']],
                    'error' => [$parsed['files'][$name]['error']],
                    'size' => [$parsed['files'][$name]['size']],
                    'local_tmp' => [$parsed['files'][$name]['local_tmp']],
                ];
            }
            $parsed['files'][$name]['name'][] = $file['name'];
            $parsed['files'][$name]['type'][] = $file['type'];
            $parsed['files'][$name]['tmp_name'][] = $file['tmp_name'];
            $parsed['files'][$name]['error'][] = $file['error'];
            $parsed['files'][$name]['size'][] = $file['size'];
            $parsed['files'][$name]['local_tmp'][] = true;
        }
    }
    return $parsed;
}

function p5_body(): array
{
    $put = p5_put_multipart();
    return $_POST ?: ($put['fields'] ?: json_body());
}

function p5_store_files(string $field, int $max = 20, string $profile = 'general'): array
{
    $put = p5_put_multipart();
    if (!isset($_FILES[$field]) && !isset($put['files'][$field])) return [];
    $input = $_FILES[$field] ?? $put['files'][$field];
    $files = [];
    if (is_array($input['name'])) {
        $count = min(count($input['name']), $max);
        for ($i = 0; $i < $count; $i++) {
            $files[] = [
                'name' => $input['name'][$i],
                'type' => $input['type'][$i],
                'tmp_name' => $input['tmp_name'][$i],
                'error' => $input['error'][$i],
                'size' => $input['size'][$i],
                'local_tmp' => $input['local_tmp'][$i] ?? false,
            ];
        }
    } else {
        $files[] = $input;
    }
    $allowed = [
        'image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png'], 'image/webp' => ['webp'], 'image/gif' => ['gif'],
        'application/pdf' => ['pdf'],
        'application/msword' => ['doc'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
        'application/vnd.ms-excel' => ['xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
        'text/plain' => ['txt'], 'text/csv' => ['csv'],
    ];
    if ($profile === 'accident') {
        $allowed = array_intersect_key($allowed, array_flip(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']));
    } elseif ($profile === 'monthly') {
        $allowed = array_intersect_key($allowed, array_flip([
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]));
    }
    $validated = [];
    foreach ($files as $file) {
        if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
        if ((int)($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) json_response(['success' => false, 'message' => 'Upload failed.'], 400);
        if ((int)($file['size'] ?? 0) <= 0 || (int)$file['size'] > 20 * 1024 * 1024) json_response(['success' => false, 'message' => 'Uploaded file is too large.'], 400);
        $tmp = (string)($file['tmp_name'] ?? '');
        $mime = function_exists('finfo_open') ? (string)finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp) : (string)($file['type'] ?? '');
        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!isset($allowed[$mime]) || !in_array($ext, $allowed[$mime], true)) {
            json_response(['success' => false, 'message' => 'Unsupported file type: ' . $mime], 400);
        }
        $validated[] = [$file, $tmp, $mime, $ext];
    }
    $stored = [];
    foreach ($validated as [$file, $tmp, $mime, $ext]) {
        $storedName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
        $target = upload_dir() . DIRECTORY_SEPARATOR . $storedName;
        $moved = !empty($file['local_tmp']) ? rename($tmp, $target) : move_uploaded_file($tmp, $target);
        if (!$moved) {
            p5_cleanup($stored);
            json_response(['success' => false, 'message' => 'Cannot store uploaded file.'], 500);
        }
        if (!empty($file['local_tmp'])) @chmod($target, 0644);
        $stored[] = [
            'url' => upload_public_url($storedName, (string)$file['name']),
            'name' => clean_upload_name($file['name'] ?? $storedName),
            'stored' => $storedName,
            'type' => $mime,
            'ext' => $ext,
            'size' => (int)$file['size'],
        ];
    }
    return $stored;
}

function p5_cleanup(array $files): void
{
    foreach ($files as $file) delete_uploaded_file($file['url'] ?? null);
}

function ensure_accident_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS accident_reports (
        id INT AUTO_INCREMENT PRIMARY KEY, ReportDate DATE, AccidentDate DATE NOT NULL, AccidentTime TIME NULL,
        EmployeeID VARCHAR(50) NOT NULL, Department VARCHAR(100), Area VARCHAR(255), Location VARCHAR(255),
        AccidentType VARCHAR(50) NOT NULL, Severity VARCHAR(50) DEFAULT 'Minor', Description TEXT,
        RootCause VARCHAR(255), RootCauseDetail TEXT, ImmediateCause VARCHAR(255), UnsafeAct TEXT, UnsafeCondition TEXT,
        CorrectiveAction TEXT, PreventiveAction TEXT, LostDays INT DEFAULT 0, IsRecordable TINYINT(1) DEFAULT 0,
        Status VARCHAR(50) DEFAULT 'Open', ReportedBy VARCHAR(100), CreatedBy VARCHAR(100),
        InjuryType VARCHAR(100), BodyPart VARCHAR(100), MedicalTreatment TEXT, Position VARCHAR(100), EmploymentType VARCHAR(100),
        ResponsiblePerson VARCHAR(100), DueDate DATE NULL, NearMissDetails TEXT,
        InvestigationStatus VARCHAR(50), PotentialSeverity VARCHAR(50), VerificationResult TEXT, VerifiedBy VARCHAR(100), VerifiedAt DATE NULL,
        IsDeleted TINYINT(1) DEFAULT 0, CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP, UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_date(AccidentDate), KEY idx_dept(Department), KEY idx_deleted(IsDeleted)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS accident_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY, AccidentID INT NOT NULL, FileName VARCHAR(255), FileURL TEXT, PublicID VARCHAR(255),
        FileType VARCHAR(100), FileSize BIGINT DEFAULT 0, UploadedBy VARCHAR(100), UploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_accident(AccidentID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS accident_performance (
        Year INT PRIMARY KEY, TotalHours INT DEFAULT 0, TotalDays INT DEFAULT 0, LastAccidentDate DATE NULL,
        TargetHours INT DEFAULT 1000000, TargetDays INT DEFAULT 365, MonthlyStatus TEXT, MonthlyManHours TEXT,
        AnnualManHours DECIMAL(15,2) DEFAULT 0, CumulativeManHours DECIMAL(15,2) DEFAULT 0, UpdatedBy VARCHAR(100),
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS accident_monthly_reports (
        id INT AUTO_INCREMENT PRIMARY KEY, Year INT NOT NULL, MonthNo TINYINT NOT NULL,
        Status VARCHAR(20) NOT NULL DEFAULT 'pending', ReportFileUrl TEXT NULL, ReportFileName VARCHAR(255) NULL,
        ReportFileType VARCHAR(100) NULL, ReportFileSize BIGINT DEFAULT 0, Notes TEXT NULL,
        UploadedBy VARCHAR(100) NULL, UploadedAt DATETIME NULL, UpdatedBy VARCHAR(100) NULL,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_acc_monthly_report (Year, MonthNo), KEY idx_year (Year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS accident_hotspot_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        AreaName VARCHAR(255) NOT NULL,
        DisplayName VARCHAR(255) DEFAULT NULL,
        MapXPercent DECIMAL(6,3) NOT NULL,
        MapYPercent DECIMAL(6,3) NOT NULL,
        IsPinned TINYINT(1) NOT NULL DEFAULT 1,
        UpdatedBy VARCHAR(100) DEFAULT NULL,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_acc_hotspot_area (AreaName),
        KEY idx_pinned (IsPinned)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function accident_monthly_reports_for_year(int $year): array
{
    return db_rows('SELECT * FROM accident_monthly_reports WHERE Year=? ORDER BY MonthNo ASC', [$year]);
}

function accident_monthly_report_status($value): string
{
    $status = trim((string)$value);
    return in_array($status, ['green', 'red', 'pending'], true) ? $status : 'pending';
}

function p5_json_object_array($value): array
{
    if ($value === null || $value === '') return [];
    if (is_array($value)) return array_values($value) === $value ? [] : $value;
    $decoded = json_decode((string)$value, true);
    if (is_string($decoded)) $decoded = json_decode($decoded, true);
    return is_array($decoded) && array_values($decoded) !== $decoded ? $decoded : [];
}

function p5_json_object_string($value): ?string
{
    if ($value === null || $value === '') return null;
    return json_encode(p5_json_object_array($value), JSON_UNESCAPED_UNICODE);
}

function p5_json_array($value): array
{
    if ($value === null || $value === '') return [];
    if (is_array($value)) return array_values($value);
    $decoded = json_decode((string)$value, true);
    if (is_string($decoded)) $decoded = json_decode($decoded, true);
    return is_array($decoded) ? array_values($decoded) : [];
}

function p5_accident_monthly_numbers($value): array
{
    $raw = p5_json_object_array($value);
    $clean = [];
    for ($i = 1; $i <= 12; $i++) {
        $key = (string)$i;
        $n = isset($raw[$key]) ? (float)$raw[$key] : 0.0;
        if ($n > 0 && $n < 999999999999) $clean[$key] = round($n, 2);
    }
    return $clean;
}

function p5_accident_year($value, ?int $fallback = null): int
{
    if ($value === null || $value === '') return $fallback ?? (int)date('Y');
    $raw = trim((string)$value);
    $year = ctype_digit($raw) ? (int)$raw : 0;
    if ($year < 2000 || $year > ((int)date('Y') + 5)) {
        json_response(['success' => false, 'message' => 'Invalid year.'], 400);
    }
    return $year;
}

function p5_accident_id($value): int
{
    $raw = trim((string)$value);
    $id = ctype_digit($raw) ? (int)$raw : 0;
    if ($id < 1) json_response(['success' => false, 'message' => 'Invalid ID.'], 400);
    return $id;
}

function p5_accident_days_in_year(int $year): int
{
    return (int)(new DateTimeImmutable(($year + 1) . '-01-01'))->diff(new DateTimeImmutable($year . '-01-01'))->days;
}

function p5_accident_free_days_for_year(int $year, ?string $lastAccidentDate): int
{
    $currentYear = (int)date('Y');
    if ($year > $currentYear) return 0;
    $end = $year < $currentYear
        ? new DateTimeImmutable($year . '-12-31')
        : new DateTimeImmutable(date('Y-m-d'));
    $start = $lastAccidentDate
        ? new DateTimeImmutable(substr($lastAccidentDate, 0, 10))
        : new DateTimeImmutable($year . '-01-01');
    if ($start > $end) return 0;
    $days = ((int)$start->diff($end)->days) + 1;
    return min(p5_accident_days_in_year($year), max(0, $days));
}

function p5_accident_near_miss_details(array $body): ?string
{
    if (trim((string)($body['AccidentType'] ?? '')) !== 'Near Miss') return null;
    $fields = [
        'NearMissNo', 'NearMissWorkType', 'NearMissPhone', 'NearMissShift',
        'NearMissWorkingOn', 'NearMissEvent', 'NearMissImprovementPoint',
        'NearMissLayoutNote', 'NearMissEventTitle', 'NearMissHazardFinding',
        'NearMissRelatedPeople', 'NearMissCAPA', 'NearMissRootCause',
    ];
    $details = [];
    foreach ($fields as $key) {
        $value = trim((string)($body[$key] ?? ''));
        if ($key === 'NearMissRelatedPeople' && $value !== '') {
            $parsed = json_decode($value, true);
            if (is_array($parsed)) {
                $people = [];
                foreach ($parsed as $person) {
                    if (!is_array($person)) continue;
                    $empId = trim((string)($person['EmployeeID'] ?? ''));
                    $empName = trim((string)($person['EmployeeName'] ?? ''));
                    if ($empId === '' && $empName === '') continue;
                    $people[] = [
                        'EmployeeID' => $empId,
                        'EmployeeName' => $empName,
                        'Position' => trim((string)($person['Position'] ?? '')),
                        'Department' => trim((string)($person['Department'] ?? '')),
                    ];
                }
                if ($people) $details[$key] = $people;
                continue;
            }
        }
        if ($value !== '') $details[$key] = $value;
    }
    return $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null;
}

function p5_accident_business_rule_error(array $body): ?string
{
    $type = trim((string)($body['AccidentType'] ?? ''));
    if (!in_array($type, ['Near Miss', 'First Aid', 'Medical Treatment', 'Lost Time', 'Fatal'], true)) return 'Invalid accident type.';
    $recordable = p5_bool($body['IsRecordable'] ?? 0) === 1;
    $lostDays = p5_int($body['LostDays'] ?? 0);
    $corrective = trim((string)($type === 'Near Miss' ? ($body['NearMissCAPA'] ?? $body['CorrectiveAction'] ?? '') : ($body['CorrectiveAction'] ?? '')));
    $needsRootCause = $recordable || in_array($type, ['Medical Treatment', 'Lost Time', 'Fatal'], true);
    if ($type === 'Near Miss' && trim((string)($body['NearMissEvent'] ?? '')) === '') return 'Near Miss event is required.';
    if ($type === 'Near Miss' && !in_array(trim((string)($body['PotentialSeverity'] ?? '')), ['Low', 'Medium', 'High', 'Critical'], true)) return 'Potential severity is required.';
    if ($type === 'Lost Time' && $lostDays < 1) return 'Lost Time requires at least one lost day.';
    if ($type === 'Medical Treatment' && trim((string)($body['MedicalTreatment'] ?? '')) === '') return 'Medical treatment detail is required.';
    if ($type === 'Fatal' && !$recordable) return 'Fatal must be recordable.';
    if ($needsRootCause && trim((string)($body['RootCause'] ?? '')) === '' && trim((string)($body['RootCauseDetail'] ?? '')) === '') return 'Root cause is required.';
    if ($needsRootCause && $corrective === '') return 'Corrective action is required.';
    if (trim((string)($body['Status'] ?? '')) === 'Closed' && $corrective === '') return 'Corrective action is required before closing.';
    if (trim((string)($body['Status'] ?? '')) === 'Closed' && trim((string)($body['VerificationResult'] ?? '')) === '') return 'Verification result is required before closing.';
    if (trim((string)($body['Status'] ?? '')) === 'Closed' && trim((string)($body['VerifiedBy'] ?? '')) === '') return 'Verified by is required before closing.';
    return null;
}

function handle_accident_routes(string $method, string $path): bool
{
    if (strpos($path, '/accident') !== 0) return false;
    $user = require_user();
    // Accident GET routes must remain read-only. Keep legacy bootstrap behavior
    // only for authenticated mutations; schema is provisioned outside reads.
    if (in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
        require_admin();
        ensure_accident_tables();
    }
    $statCond = "AccidentType NOT IN ('Near Miss','First Aid') AND (AccidentType IN ('Medical Treatment','Lost Time','Fatal') OR Severity='Critical' OR IsRecordable=1 OR LostDays>0)";
    if ($method === 'GET' && $path === '/accident/reports') {
        $sql = "SELECT r.*,e.EmployeeName,e.Team,(SELECT COUNT(*) FROM accident_attachments a WHERE a.AccidentID=r.id) AS AttachmentCount FROM accident_reports r LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0)";
        $p = [];
        foreach (['department' => 'Department', 'type' => 'AccidentType', 'status' => 'Status'] as $q => $c) if (!empty($_GET[$q])) { $sql .= " AND r.$c=?"; $p[] = $_GET[$q]; }
        if (isset($_GET['year']) && $_GET['year'] !== '') { $sql .= ' AND YEAR(r.AccidentDate)=?'; $p[] = p5_accident_year($_GET['year']); }
        json_response(['success' => true, 'data' => db_rows($sql . ' ORDER BY r.AccidentDate DESC,r.id DESC', $p)]);
    }
    $rp = route_params($path, '/accident/reports/:id/audit');
    if ($rp !== null) $rp['id'] = p5_accident_id($rp['id']);
    if ($rp !== null && $method === 'GET') { require_admin(); json_response(['success' => true, 'data' => safe_rows("SELECT * FROM admin_auditlogs WHERE Module='accident' AND TargetID=? ORDER BY ActionTime DESC,id DESC LIMIT 20", [$rp['id']])]); }
    $rp = route_params($path, '/accident/reports/:id');
    if ($rp !== null) $rp['id'] = p5_accident_id($rp['id']);
    if ($rp !== null && $method === 'GET') {
        $r = db_row("SELECT r.*,e.EmployeeName,e.Team FROM accident_reports r LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE r.id=? AND (r.IsDeleted IS NULL OR r.IsDeleted=0)", [$rp['id']]);
        if (!$r) json_response(['success' => false, 'message' => 'Not found.'], 404);
        $r['attachments'] = db_rows('SELECT * FROM accident_attachments WHERE AccidentID=? ORDER BY UploadedAt ASC', [$rp['id']]);
        json_response(['success' => true, 'data' => $r]);
    }
    if ($method === 'GET' && $path === '/accident/summary') {
        $year = p5_accident_year($_GET['year'] ?? null); $yf = ' AND YEAR(AccidentDate)=?'; $yp = [$year];
        $kpi = db_row("SELECT COUNT(*) AS total,COALESCE(SUM($statCond),0) AS recordable,COALESCE(SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END),0) AS lostDays,COALESCE(SUM(AccidentType='Near Miss'),0) AS nearMiss,COALESCE(SUM(AccidentType='Fatal'),0) AS fatal FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf", $yp);
        $trend = db_rows("SELECT MONTH(AccidentDate) AS mo,COUNT(*) AS total,SUM($statCond) AS recordable,SUM(AccidentType='Near Miss') AS nearMiss,SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf GROUP BY MONTH(AccidentDate) ORDER BY mo", $yp);
        $byType = db_rows("SELECT AccidentType,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf GROUP BY AccidentType ORDER BY cnt DESC", $yp);
        $byDept = db_rows("SELECT Department,COUNT(*) AS total,COALESCE(SUM($statCond),0) AS recordable,COALESCE(SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END),0) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf GROUP BY Department ORDER BY total DESC LIMIT 10", $yp);
        $lastStat = db_row("SELECT AccidentDate FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf AND $statCond ORDER BY AccidentDate DESC,id DESC LIMIT 1", $yp);
        $daysSince = p5_accident_free_days_for_year($year, $lastStat['AccidentDate'] ?? null);
        json_response(['success' => true, 'data' => ['kpi' => $kpi, 'daysSince' => $daysSince, 'lastStatAccidentDate' => $lastStat['AccidentDate'] ?? null, 'trend' => $trend, 'byType' => $byType, 'byDept' => $byDept, 'recentReports' => db_rows("SELECT * FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf ORDER BY CreatedAt DESC,id DESC LIMIT 8", $yp), 'openActions' => db_rows("SELECT * FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND COALESCE(Status,'Open')<>'Closed'$yf ORDER BY DueDate ASC,id DESC LIMIT 8", $yp)]]);
    }
    if ($method === 'GET' && $path === '/accident/analytics') {
        $year = p5_accident_year($_GET['year'] ?? null); $yp = [$year];
        json_response(['success' => true, 'data' => [
            'deptRank' => db_rows("SELECT Department,COUNT(*) AS total,SUM($statCond) AS recordable,SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END) AS lostDays,SUM(AccidentType='Near Miss') AS nearMiss,SUM(AccidentType='Fatal') AS fatal,SUM(Severity='Critical') AS critical FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? GROUP BY Department ORDER BY total DESC LIMIT 10", $yp),
            'hotspot' => db_rows("SELECT COALESCE(Area,'(Unspecified)') AS area,COUNT(*) AS cnt,SUM($statCond) AS recordable,SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? GROUP BY Area ORDER BY cnt DESC LIMIT 8", $yp),
            'rootCauses' => db_rows("SELECT COALESCE(RootCause,'(Unspecified)') AS cause,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? GROUP BY RootCause ORDER BY cnt DESC LIMIT 8", $yp),
            'nearMissTrend' => db_rows("SELECT MONTH(AccidentDate) AS mo,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND AccidentType='Near Miss' AND YEAR(AccidentDate)=? GROUP BY MONTH(AccidentDate) ORDER BY mo", $yp),
            'injuryTypeStats' => db_rows("SELECT COALESCE(NULLIF(InjuryType,''),'(Unspecified)') AS label,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND $statCond AND YEAR(AccidentDate)=? GROUP BY label ORDER BY cnt DESC LIMIT 10", $yp),
            'bodyPartStats' => db_rows("SELECT COALESCE(NULLIF(BodyPart,''),'(Unspecified)') AS label,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND $statCond AND YEAR(AccidentDate)=? GROUP BY label ORDER BY cnt DESC LIMIT 10", $yp),
        ]]);
    }
    if ($method === 'GET' && $path === '/accident/hotspot-positions') {
        json_response(['success' => true, 'data' => db_rows('SELECT id,AreaName,DisplayName,MapXPercent,MapYPercent,IsPinned,UpdatedBy,UpdatedAt FROM accident_hotspot_positions ORDER BY AreaName ASC')]);
    }
    if ($method === 'PUT' && $path === '/accident/hotspot-positions') {
        require_admin();
        $b = json_body();
        $items = isset($b['positions']) && is_array($b['positions']) ? $b['positions'] : [$b];
        foreach ($items as $item) {
            if (!is_array($item)) json_response(['success' => false, 'message' => 'Invalid hotspot position payload.'], 400);
            $areaName = trim((string)($item['AreaName'] ?? $item['areaName'] ?? $item['area'] ?? ''));
            $displayName = trim((string)($item['DisplayName'] ?? $item['displayName'] ?? $areaName));
            $x = p5_percent($item['MapXPercent'] ?? $item['mapXPercent'] ?? $item['x'] ?? null);
            $y = p5_percent($item['MapYPercent'] ?? $item['mapYPercent'] ?? $item['y'] ?? null);
            if ($areaName === '' || $x === null || $y === null) json_response(['success' => false, 'message' => 'Invalid hotspot position payload.'], 400);
            db_execute(
                'INSERT INTO accident_hotspot_positions (AreaName,DisplayName,MapXPercent,MapYPercent,IsPinned,UpdatedBy)
                 VALUES (?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE DisplayName=VALUES(DisplayName),MapXPercent=VALUES(MapXPercent),MapYPercent=VALUES(MapYPercent),IsPinned=VALUES(IsPinned),UpdatedBy=VALUES(UpdatedBy)',
                [$areaName, $displayName ?: $areaName, $x, $y, p5_bool($item['IsPinned'] ?? $item['isPinned'] ?? 1), p5_user_name($user)]
            );
        }
        json_response(['success' => true, 'data' => db_rows('SELECT id,AreaName,DisplayName,MapXPercent,MapYPercent,IsPinned,UpdatedBy,UpdatedAt FROM accident_hotspot_positions ORDER BY AreaName ASC')]);
    }
    $isAccidentReportCreate = $method === 'POST' && $path === '/accident/reports';
    if ($isAccidentReportCreate || ($rp !== null && ($method === 'PUT' || $method === 'POST'))) {
        require_admin(); $b = p5_body(); $files = [];
        try {
            $emp = db_row('SELECT Department,Position FROM employees WHERE EmployeeID=? LIMIT 1', [trim((string)($b['EmployeeID'] ?? ''))]);
            if (!$emp || !p5_date($b['ReportDate'] ?? null) || !p5_date($b['AccidentDate'] ?? null) || empty($b['AccidentType'])) json_response(['success' => false, 'message' => 'Invalid accident report payload.'], 400);
            $ruleError = p5_accident_business_rule_error($b);
            if ($ruleError !== null) json_response(['success' => false, 'message' => $ruleError], 400);
            $files = p5_store_files('files', 10, 'accident');
            $vals = [p5_date($b['ReportDate']), p5_date($b['AccidentDate']), trim((string)($b['AccidentTime'] ?? '')) ?: null, trim((string)$b['EmployeeID']), $emp['Department'] ?? null, $b['Area'] ?? null, $b['Location'] ?? null, $b['AccidentType'], $b['Severity'] ?? 'Minor', $b['Description'] ?? '', $b['RootCause'] ?? null, $b['RootCauseDetail'] ?? '', $b['ImmediateCause'] ?? null, $b['UnsafeAct'] ?? null, $b['UnsafeCondition'] ?? null, $b['CorrectiveAction'] ?? '', $b['PreventiveAction'] ?? null, p5_int($b['LostDays'] ?? 0), p5_bool($b['IsRecordable'] ?? 0), $b['Status'] ?? 'Open', $b['ReportedBy'] ?? p5_user_name($user), $b['InjuryType'] ?? null, $b['BodyPart'] ?? null, $b['MedicalTreatment'] ?? null, $b['Position'] ?? ($emp['Position'] ?? null), $b['EmploymentType'] ?? null, $b['ResponsiblePerson'] ?? null, p5_date($b['DueDate'] ?? null), p5_accident_near_miss_details($b), $b['InvestigationStatus'] ?? (($b['Status'] ?? '') === 'Closed' ? 'Closed' : 'Reported'), $b['PotentialSeverity'] ?? null, $b['VerificationResult'] ?? null, $b['VerifiedBy'] ?? null, p5_date($b['VerifiedAt'] ?? null)];
            if ($isAccidentReportCreate) {
                db_execute('INSERT INTO accident_reports (ReportDate,AccidentDate,AccidentTime,EmployeeID,Department,Area,Location,AccidentType,Severity,Description,RootCause,RootCauseDetail,ImmediateCause,UnsafeAct,UnsafeCondition,CorrectiveAction,PreventiveAction,LostDays,IsRecordable,Status,ReportedBy,InjuryType,BodyPart,MedicalTreatment,Position,EmploymentType,ResponsiblePerson,DueDate,NearMissDetails,InvestigationStatus,PotentialSeverity,VerificationResult,VerifiedBy,VerifiedAt,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', array_merge($vals, [p5_user_name($user)]));
                $id = (int)db()->lastInsertId();
            } else {
                $id = (int)$rp['id'];
                db_execute('UPDATE accident_reports SET ReportDate=?,AccidentDate=?,AccidentTime=?,EmployeeID=?,Department=?,Area=?,Location=?,AccidentType=?,Severity=?,Description=?,RootCause=?,RootCauseDetail=?,ImmediateCause=?,UnsafeAct=?,UnsafeCondition=?,CorrectiveAction=?,PreventiveAction=?,LostDays=?,IsRecordable=?,Status=?,ReportedBy=?,InjuryType=?,BodyPart=?,MedicalTreatment=?,Position=?,EmploymentType=?,ResponsiblePerson=?,DueDate=?,NearMissDetails=?,InvestigationStatus=?,PotentialSeverity=?,VerificationResult=?,VerifiedBy=?,VerifiedAt=? WHERE id=?', array_merge($vals, [$id]));
            }
            foreach ($files as $f) db_execute('INSERT INTO accident_attachments (AccidentID,FileName,FileURL,PublicID,FileType,FileSize,UploadedBy) VALUES (?,?,?,?,?,?,?)', [$id, $f['name'], $f['url'], $f['stored'], $f['type'], $f['size'], p5_user_name($user)]);
            json_response(['success' => true, 'message' => 'Saved.', 'id' => $id]);
        } catch (Throwable $e) { p5_cleanup($files); throw $e; }
    }
    if ($rp !== null && $method === 'DELETE') { require_admin(); db_execute('UPDATE accident_reports SET IsDeleted=1 WHERE id=?', [$rp['id']]); json_response(['success' => true]); }
    $ap = route_params($path, '/accident/attachments/:id');
    if ($ap !== null) $ap['id'] = p5_accident_id($ap['id']);
    if ($ap !== null && $method === 'DELETE') { require_admin(); $att = db_row('SELECT FileURL FROM accident_attachments WHERE id=?', [$ap['id']]); db_execute('DELETE FROM accident_attachments WHERE id=?', [$ap['id']]); if ($att) delete_uploaded_file($att['FileURL']); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/accident/monthly-reports') {
        $year = p5_accident_year($_GET['year'] ?? null);
        json_response(['success' => true, 'data' => accident_monthly_reports_for_year($year)]);
    }
    if ($method === 'POST' && $path === '/accident/monthly-reports') {
        require_admin();
        $b = $_POST ?: json_body();
        if (!isset($b['Year']) || $b['Year'] === '') json_response(['success' => false, 'message' => 'Invalid year.'], 400);
        $year = p5_accident_year($b['Year'] ?? null);
        $month = (int)($b['MonthNo'] ?? 0);
        if ($month < 1 || $month > 12) {
            json_response(['success' => false, 'message' => 'Invalid monthly report period.'], 400);
        }
        $files = p5_store_files('reportFile', 1, 'monthly');
        $status = accident_monthly_report_status($b['Status'] ?? 'pending');
        $existing = db_row('SELECT * FROM accident_monthly_reports WHERE Year=? AND MonthNo=? LIMIT 1', [$year, $month]);
        $file = $files[0] ?? null;
        try {
            db_execute(
                'INSERT INTO accident_monthly_reports (Year,MonthNo,Status,ReportFileUrl,ReportFileName,ReportFileType,ReportFileSize,Notes,UploadedBy,UploadedAt,UpdatedBy)
                 VALUES (?,?,?,?,?,?,?,?,?,IF(? IS NULL,NULL,NOW()),?)
                 ON DUPLICATE KEY UPDATE Status=VALUES(Status),ReportFileUrl=COALESCE(VALUES(ReportFileUrl),ReportFileUrl),
                    ReportFileName=COALESCE(VALUES(ReportFileName),ReportFileName),ReportFileType=COALESCE(VALUES(ReportFileType),ReportFileType),
                    ReportFileSize=COALESCE(VALUES(ReportFileSize),ReportFileSize),Notes=VALUES(Notes),
                    UploadedBy=IF(VALUES(ReportFileUrl) IS NULL,UploadedBy,VALUES(UploadedBy)),
                    UploadedAt=IF(VALUES(ReportFileUrl) IS NULL,UploadedAt,NOW()),UpdatedBy=VALUES(UpdatedBy)',
                [
                    $year, $month, $status, $file['url'] ?? null, $file['name'] ?? null, $file['type'] ?? null, $file['size'] ?? null,
                    $b['Notes'] ?? null, $file ? p5_user_name($user) : null, $file['url'] ?? null, p5_user_name($user),
                ]
            );
            $perf = db_row('SELECT MonthlyStatus FROM accident_performance WHERE Year=? LIMIT 1', [$year]);
            $monthlyStatus = $perf ? p5_json_object_array($perf['MonthlyStatus'] ?? null) : [];
            if ($status === 'pending') {
                unset($monthlyStatus[(string)$month]);
            } else {
                $monthlyStatus[(string)$month] = $status;
            }
            db_execute(
                'INSERT INTO accident_performance (Year,MonthlyStatus,UpdatedBy) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE MonthlyStatus=VALUES(MonthlyStatus),UpdatedBy=VALUES(UpdatedBy)',
                [$year, json_encode($monthlyStatus, JSON_UNESCAPED_UNICODE), p5_user_name($user)]
            );
            if ($file && $existing && !empty($existing['ReportFileUrl'])) {
                delete_uploaded_file($existing['ReportFileUrl']);
            }
            json_response(['success' => true, 'data' => db_row('SELECT * FROM accident_monthly_reports WHERE Year=? AND MonthNo=? LIMIT 1', [$year, $month])]);
        } catch (Throwable $e) {
            p5_cleanup($files);
            throw $e;
        }
    }
    $mr = route_params($path, '/accident/monthly-reports/:id');
    if ($mr !== null) $mr['id'] = p5_accident_id($mr['id']);
    if ($mr !== null && $method === 'DELETE') {
        require_admin();
        $row = db_row('SELECT Year,MonthNo,ReportFileUrl FROM accident_monthly_reports WHERE id=? LIMIT 1', [$mr['id']]);
        if (!$row) json_response(['success' => false, 'message' => 'Monthly report not found.'], 404);
        db_execute('DELETE FROM accident_monthly_reports WHERE id=?', [$mr['id']]);
        $perf = db_row('SELECT MonthlyStatus FROM accident_performance WHERE Year=? LIMIT 1', [(int)$row['Year']]);
        if ($perf && !empty($perf['MonthlyStatus'])) {
            $decoded = p5_json_object_array($perf['MonthlyStatus']);
            unset($decoded[(string)$row['MonthNo']]);
            db_execute('UPDATE accident_performance SET MonthlyStatus=? WHERE Year=?', [json_encode($decoded, JSON_UNESCAPED_UNICODE), (int)$row['Year']]);
        }
        delete_uploaded_file($row['ReportFileUrl'] ?? '');
        json_response(['success' => true]);
    }
    if ($method === 'GET' && $path === '/accident/performance') {
        $year = p5_accident_year($_GET['year'] ?? null);
        $row = db_row('SELECT * FROM accident_performance WHERE Year=?', [$year]) ?: ['Year' => $year, 'TotalHours' => 0, 'TotalDays' => 0, 'TargetHours' => 1000000, 'TargetDays' => 365, 'MonthlyStatus' => null, 'MonthlyManHours' => null, 'AnnualManHours' => 0, 'CumulativeManHours' => 0];
        $stats = db_row("SELECT COALESCE(SUM($statCond),0) AS statsTotal,COALESCE(SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END),0) AS lostDays,COALESCE(SUM(AccidentType='First Aid'),0) AS firstAid,COALESCE(SUM(AccidentType='Lost Time'),0) AS lostTime,COALESCE(SUM(AccidentType='Near Miss'),0) AS nearMiss,COALESCE(SUM(($statCond) AND (AccidentType='Fatal' OR Severity='Critical')),0) AS severe,COALESCE(SUM(($statCond) AND LostDays>3),0) AS lostOver3,COALESCE(SUM(($statCond) AND LostDays BETWEEN 1 AND 3),0) AS lostUnderEqual3,COALESCE(SUM(($statCond) AND COALESCE(LostDays,0)=0 AND AccidentType<>'Fatal' AND Severity<>'Critical'),0) AS nonLostRecordable FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=?", [$year]) ?: [];
        $lastStat = db_row("SELECT AccidentDate FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? AND $statCond ORDER BY AccidentDate DESC,id DESC LIMIT 1", [$year]);
        $monthlyManHours = p5_accident_monthly_numbers($row['MonthlyManHours'] ?? null);
        $monthlyTotal = array_sum($monthlyManHours);
        $annual = (float)($row['AnnualManHours'] ?? 0);
        if ($annual <= 0) $annual = $monthlyTotal > 0 ? $monthlyTotal : (float)($row['TotalHours'] ?? 0);
        $cumulative = (float)($row['CumulativeManHours'] ?? 0);
        if ($cumulative <= 0) $cumulative = $annual;
        $count = (int)($stats['statsTotal'] ?? 0);
        $lostTime = (int)($stats['lostTime'] ?? 0);
        $lostDays = (int)($stats['lostDays'] ?? 0);
        $rate = function (int $countValue, int $base = 1000000) use ($annual): float {
            return $annual > 0 ? round($countValue * $base / $annual, 3) : 0.0;
        };
        $effectiveLast = $lastStat['AccidentDate'] ?? ($row['LastAccidentDate'] ?? null);
        $row['MonthlyManHours'] = json_encode($monthlyManHours, JSON_UNESCAPED_UNICODE);
        $row['LastAccidentDate'] = $effectiveLast;
        $row['recordableCount'] = $count;
        $row['rates'] = [
            'monthlyManHours' => $monthlyManHours,
            'annualManHours' => round($annual, 2),
            'cumulativeManHours' => round($cumulative, 2),
            'hoursPer100k' => round($annual / 100000, 3),
            'totalManHour' => round($annual, 2),
            'IFR' => $rate($count, 1000000),
            'TCIR' => $rate($count, 200000),
            'LTIFR' => $rate($lostTime, 1000000),
            'ISR' => $rate($lostDays, 1000000),
            'TRIR' => $rate($count, 200000),
            'lastStatAccidentDate' => $effectiveLast,
            'statCounts' => [
                'total' => $count,
                'severe' => (int)($stats['severe'] ?? 0),
                'lostOver3' => (int)($stats['lostOver3'] ?? 0),
                'lostUnderEqual3' => (int)($stats['lostUnderEqual3'] ?? 0),
                'nonLostRecordable' => (int)($stats['nonLostRecordable'] ?? 0),
                'excludedFirstAid' => (int)($stats['firstAid'] ?? 0),
                'excludedNearMiss' => (int)($stats['nearMiss'] ?? 0),
            ],
        ];
        $row['monthlyReports'] = accident_monthly_reports_for_year($year);
        json_response(['success' => true, 'data' => $row]);
    }
    if ($method === 'PUT' && $path === '/accident/performance') {
        require_admin();
        $b = json_body();
        if (!isset($b['Year']) || $b['Year'] === '') json_response(['success' => false, 'message' => 'Invalid year.'], 400);
        $year = p5_accident_year($b['Year'] ?? null);
        $monthlyManHours = p5_accident_monthly_numbers($b['MonthlyManHours'] ?? null);
        $monthlyTotal = array_sum($monthlyManHours);
        $annual = $monthlyTotal > 0 ? $monthlyTotal : (float)p5_int($b['TotalHours'] ?? 0);
        $cumulative = $annual;
        $lastStat = db_row("SELECT AccidentDate FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? AND $statCond ORDER BY AccidentDate DESC,id DESC LIMIT 1", [$year]);
        $effectiveLast = $lastStat['AccidentDate'] ?? null;
        $autoDays = p5_accident_free_days_for_year($year, $effectiveLast);
        db_execute(
            'INSERT INTO accident_performance (Year,TotalHours,TotalDays,LastAccidentDate,TargetHours,TargetDays,MonthlyStatus,MonthlyManHours,AnnualManHours,CumulativeManHours,UpdatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE TotalHours=VALUES(TotalHours),TotalDays=VALUES(TotalDays),LastAccidentDate=VALUES(LastAccidentDate),TargetHours=VALUES(TargetHours),TargetDays=VALUES(TargetDays),MonthlyStatus=VALUES(MonthlyStatus),MonthlyManHours=VALUES(MonthlyManHours),AnnualManHours=VALUES(AnnualManHours),CumulativeManHours=VALUES(CumulativeManHours),UpdatedBy=VALUES(UpdatedBy)',
            [
                $year,
                (int)round($annual),
                $autoDays,
                $effectiveLast,
                p5_int($b['TargetHours'] ?? 1000000),
                p5_int($b['TargetDays'] ?? 365),
                array_key_exists('MonthlyStatus', $b) ? p5_json_object_string($b['MonthlyStatus']) : null,
                json_encode($monthlyManHours, JSON_UNESCAPED_UNICODE),
                $annual,
                $cumulative,
                p5_user_name($user),
            ]
        );
        json_response(['success' => true]);
    }
    if ($method === 'GET' && $path === '/accident/employees') { $q = '%' . trim((string)($_GET['q'] ?? '')) . '%'; json_response(['success' => true, 'data' => db_rows('SELECT EmployeeID,EmployeeName,Department,Team,Position FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? ORDER BY EmployeeName LIMIT 50', [$q, $q])]); }
    return false;
}

function ensure_machine_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety (id INT AUTO_INCREMENT PRIMARY KEY,MachineCode VARCHAR(50) NOT NULL,MachineName VARCHAR(255) NOT NULL,Department VARCHAR(100),Area VARCHAR(100),HasRiskAssessment TINYINT(1) DEFAULT 0,Remark TEXT,Status VARCHAR(20) NOT NULL DEFAULT 'active',RiskLevel VARCHAR(20) NOT NULL DEFAULT 'low',NextInspectionDate DATE NULL,CreatedBy VARCHAR(100),UpdatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_code(MachineCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety_files (id INT AUTO_INCREMENT PRIMARY KEY,MachineID INT NOT NULL,FileCategory VARCHAR(50) NOT NULL DEFAULT 'SafetyDeviceStandard',FileLabel VARCHAR(255),FileUrl TEXT,UploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UploadedBy VARCHAR(100),KEY idx_machine(MachineID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety_compliance (id INT AUTO_INCREMENT PRIMARY KEY,MachineID INT NOT NULL,ItemCode VARCHAR(10) NOT NULL,Status VARCHAR(20) NOT NULL DEFAULT 'na',UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100),UNIQUE KEY uq_machine_item(MachineID,ItemCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety_issues (id INT AUTO_INCREMENT PRIMARY KEY,MachineID INT NOT NULL,Description TEXT NOT NULL,Severity VARCHAR(20) NOT NULL DEFAULT 'medium',Status VARCHAR(20) NOT NULL DEFAULT 'open',Resolution TEXT,CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,CreatedBy VARCHAR(100),ResolvedAt TIMESTAMP NULL DEFAULT NULL,ResolvedBy VARCHAR(100),KEY idx_machine(MachineID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE machine_safety MODIFY COLUMN Area VARCHAR(500)",
        "ALTER TABLE machine_safety ADD COLUMN EffectiveDate DATE NULL",
        "ALTER TABLE machine_safety ADD COLUMN IssueBy VARCHAR(50) NULL",
        "ALTER TABLE machine_safety ADD COLUMN IssueByName VARCHAR(255) NULL",
        "ALTER TABLE machine_safety ADD COLUMN VerifiedBy VARCHAR(50) NULL",
        "ALTER TABLE machine_safety ADD COLUMN VerifiedByName VARCHAR(255) NULL",
    ] as $sql) {
        try { db()->exec($sql); } catch (Throwable $e) {}
    }
}

function msd_text($value, int $max): string
{
    $text = trim((string)($value ?? ''));
    if ($text === '') return '';
    return function_exists('mb_substr') ? mb_substr($text, 0, $max) : substr($text, 0, $max);
}

function msd_areas($value): string
{
    $items = is_array($value) ? $value : explode(',', (string)($value ?? ''));
    $seen = []; $out = [];
    foreach ($items as $item) {
        $name = msd_text($item, 100);
        $key = function_exists('mb_strtolower') ? mb_strtolower($name) : strtolower($name);
        if ($name !== '' && !isset($seen[$key])) { $seen[$key] = true; $out[] = $name; }
    }
    return implode(', ', $out);
}

function msd_next_document_no(): string
{
    $prefix = 'MSD-' . date('Y') . '-';
    $row = db_row('SELECT MachineCode FROM machine_safety WHERE MachineCode LIKE ? ORDER BY MachineCode DESC LIMIT 1', [$prefix . '%']);
    $seq = 1;
    if ($row && isset($row['MachineCode'])) {
        $last = (int)substr((string)$row['MachineCode'], strlen($prefix));
        if ($last > 0) $seq = $last + 1;
    }
    for ($i = 0; $i < 20; $i++) {
        $code = $prefix . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
        if (!db_row('SELECT id FROM machine_safety WHERE MachineCode=? LIMIT 1', [$code])) return $code;
        $seq++;
    }
    return $prefix . substr((string)time(), -6);
}

function msd_document_number_lock(): void
{
    $row = db_row('SELECT GET_LOCK(?, 5) AS acquired', ['machine_safety_document_number']);
    if ((int)($row['acquired'] ?? 0) !== 1) throw new RuntimeException('Machine Safety document number lock timeout');
}

function msd_document_number_unlock(): void
{
    try { db_row('SELECT RELEASE_LOCK(?) AS released', ['machine_safety_document_number']); } catch (Throwable $e) {}
}

function msd_choice($value, array $allowed, string $fallback): string
{
    $text = trim((string)($value ?? ''));
    return $text === '' ? $fallback : (in_array($text, $allowed, true) ? $text : '');
}

function msd_url($value): string
{
    $url = msd_text($value, 1024);
    if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) return '';
    $parts = parse_url($url);
    if (!is_array($parts) || !in_array(strtolower((string)($parts['scheme'] ?? '')), ['http', 'https'], true)) return '';
    if (!empty($parts['user']) || !empty($parts['pass'])) return '';
    return $url;
}

function msd_positive_id($value): bool
{
    return preg_match('/^[1-9][0-9]*$/', (string)$value) === 1;
}

function msd_machine_exists($id): bool
{
    return msd_positive_id($id) && (bool)db_row('SELECT id FROM machine_safety WHERE id=? LIMIT 1', [$id]);
}

function handle_machine_safety_routes(string $method, string $path): bool
{
    if (strpos($path, '/machine-safety') !== 0) return false;
    $user = require_user();
    if (in_array($method, ['POST', 'PUT', 'DELETE'], true)) { require_admin(); ensure_machine_tables(); }
    if ($method === 'GET' && $path === '/machine-safety') json_response(['success' => true, 'data' => db_rows("SELECT m.*,(SELECT COUNT(*) FROM machine_safety_files f WHERE f.MachineID=m.id AND f.FileCategory='SafetyDeviceStandard') AS SafetyDeviceCount,(SELECT COUNT(*) FROM machine_safety_files f WHERE f.MachineID=m.id AND f.FileCategory='LayoutCheckpoint') AS LayoutCheckpointCount,(SELECT COUNT(*) FROM machine_safety_compliance c WHERE c.MachineID=m.id AND c.Status='pass') AS CompliancePassCount,(SELECT COUNT(*) FROM machine_safety_compliance c WHERE c.MachineID=m.id AND c.Status!='na') AS ComplianceCheckedCount,(SELECT COUNT(*) FROM machine_safety_issues i WHERE i.MachineID=m.id AND i.Status='open') AS OpenIssueCount FROM machine_safety m ORDER BY m.MachineName")]);
    if ($method === 'POST' && $path === '/machine-safety') {
        $b = json_body(); $name=msd_text($b['MachineName']??'',255); $effective=p5_date($b['EffectiveDate']??null);
        $status=msd_choice($b['Status']??null,['active','maintenance','inactive','restricted','locked'],'active');
        $risk=msd_choice($b['RiskLevel']??null,['low','medium','high','critical'],'low');
        $areas=msd_areas($b['Areas']??($b['Area']??null)); $next=p5_date($b['NextInspectionDate']??null);
        if ($name==='' || !$effective) json_response(['success'=>false,'message'=>'Machine document name and effective date are required.'],400);
        if ($status==='' || $risk==='' || strlen($areas)>500 || (!empty($b['NextInspectionDate']) && !$next)) json_response(['success'=>false,'message'=>'Invalid Machine Safety document data.'],400);
        msd_document_number_lock();
        try {
            $code=msd_next_document_no();
            db_execute('INSERT INTO machine_safety (MachineCode,MachineName,Department,Area,HasRiskAssessment,Remark,Status,RiskLevel,NextInspectionDate,EffectiveDate,IssueBy,IssueByName,VerifiedBy,VerifiedByName,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$code,$name,msd_text($b['Department']??null,100)?:null,$areas?:null,p5_bool($b['HasRiskAssessment']??0),msd_text($b['Remark']??null,5000)?:null,$status,$risk,$next,$effective,msd_text($b['IssueBy']??null,50)?:null,msd_text($b['IssueByName']??null,255)?:null,msd_text($b['VerifiedBy']??null,50)?:null,msd_text($b['VerifiedByName']??null,255)?:null,p5_user_name($user)]);
            $id=(int)db()->lastInsertId();
        } finally { msd_document_number_unlock(); }
        json_response(['success'=>true,'id'=>$id,'MachineCode'=>$code],201);
    }
    $p = route_params($path, '/machine-safety/files/:fileId');
    if ($p !== null && $method === 'DELETE') { if(!msd_positive_id($p['fileId']))json_response(['success'=>false,'message'=>'Invalid file id.'],400); $f=db_row('SELECT FileUrl FROM machine_safety_files WHERE id=?',[$p['fileId']]); if(!$f)json_response(['success'=>false,'message'=>'File not found.'],404); db_execute('DELETE FROM machine_safety_files WHERE id=?',[$p['fileId']]); delete_uploaded_file($f['FileUrl']); json_response(['success'=>true]); }
    $p = route_params($path, '/machine-safety/issues/:issueId');
    if ($p !== null && $method === 'PUT') { if(!msd_positive_id($p['issueId']))json_response(['success'=>false,'message'=>'Invalid issue id.'],400); $b=json_body(); $status=msd_choice($b['Status']??null,['open','resolved'],''); if($status==='')json_response(['success'=>false,'message'=>'Invalid issue status.'],400); $n=db_execute('UPDATE machine_safety_issues SET Status=?,Resolution=?,ResolvedAt=?,ResolvedBy=? WHERE id=?',[$status,msd_text($b['Resolution']??null,5000)?:null,$status==='resolved'?date('Y-m-d H:i:s'):null,$status==='resolved'?p5_user_name($user):null,$p['issueId']]); if(!$n)json_response(['success'=>false,'message'=>'Issue not found.'],404); json_response(['success'=>true]); }
    if ($p !== null && $method === 'DELETE') { if(!msd_positive_id($p['issueId']))json_response(['success'=>false,'message'=>'Invalid issue id.'],400); if(!db_execute('DELETE FROM machine_safety_issues WHERE id=?',[$p['issueId']]))json_response(['success'=>false,'message'=>'Issue not found.'],404); json_response(['success'=>true]); }
    $p = route_params($path, '/machine-safety/:id/files');
    if ($p !== null && $method === 'GET') { if(!msd_positive_id($p['id']))json_response(['success'=>false,'message'=>'Invalid machine id.'],400); json_response(['success'=>true,'data'=>db_rows('SELECT * FROM machine_safety_files WHERE MachineID=? ORDER BY FileCategory,UploadedAt DESC',[$p['id']])]); }
    if ($p !== null && $method === 'POST') { if(!msd_machine_exists($p['id']))json_response(['success'=>false,'message'=>'Machine not found.'],404); $category=msd_choice($_POST['FileCategory']??null,['SafetyDeviceStandard','LayoutCheckpoint'],'SafetyDeviceStandard'); if($category==='')json_response(['success'=>false,'message'=>'Invalid file category.'],400); $files=p5_store_files('file',1); if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400); $f=$files[0]; try{db_execute('INSERT INTO machine_safety_files (MachineID,FileCategory,FileLabel,FileUrl,UploadedBy) VALUES (?,?,?,?,?)',[$p['id'],$category,msd_text($_POST['FileLabel']??$f['name'],255)?:$f['name'],$f['url'],p5_user_name($user)]);}catch(Throwable $e){p5_cleanup($files);throw $e;} json_response(['success'=>true],201); }
    $p = route_params($path, '/machine-safety/:id/links');
    if ($p !== null && $method === 'POST') { if(!msd_machine_exists($p['id']))json_response(['success'=>false,'message'=>'Machine not found.'],404); $b=json_body(); $url=msd_url($b['FileUrl']??null); $category=msd_choice($b['FileCategory']??null,['SafetyDeviceStandard','LayoutCheckpoint'],'SafetyDeviceStandard'); if($url===''||$category==='')json_response(['success'=>false,'message'=>'Valid FileUrl and category are required.'],400); db_execute('INSERT INTO machine_safety_files (MachineID,FileCategory,FileLabel,FileUrl,UploadedBy) VALUES (?,?,?,?,?)',[$p['id'],$category,msd_text($b['FileLabel']??$url,255)?:$url,$url,p5_user_name($user)]); json_response(['success'=>true],201); }
    $p = route_params($path, '/machine-safety/:id/compliance');
    if ($p !== null && $method === 'GET') { if(!msd_positive_id($p['id']))json_response(['success'=>false,'message'=>'Invalid machine id.'],400); $rows=db_rows('SELECT ItemCode,Status,UpdatedAt,UpdatedBy FROM machine_safety_compliance WHERE MachineID=? ORDER BY ItemCode',[$p['id']]); $map=[]; foreach($rows as $r)$map[$r['ItemCode']]=$r; $out=[]; foreach(['5.1','5.2','5.3','5.4','5.5','5.6','5.7','5.8'] as $c)$out[]=$map[$c]??['ItemCode'=>$c,'Status'=>'na','UpdatedAt'=>null,'UpdatedBy'=>null]; json_response(['success'=>true,'data'=>$out]); }
    if ($p !== null && $method === 'PUT') { if(!msd_machine_exists($p['id']))json_response(['success'=>false,'message'=>'Machine not found.'],404); $b=json_body(); $items=$b['items']??null; $codes=['5.1','5.2','5.3','5.4','5.5','5.6','5.7','5.8']; if(!is_array($items)||count($items)>count($codes))json_response(['success'=>false,'message'=>'Invalid compliance payload.'],400); $seen=[]; foreach($items as $it){$code=(string)($it['ItemCode']??'');$status=(string)($it['Status']??'');if(!in_array($code,$codes,true)||!in_array($status,['pass','fail','na'],true)||isset($seen[$code]))json_response(['success'=>false,'message'=>'Invalid or duplicate compliance item.'],400);$seen[$code]=true;} db()->beginTransaction(); try{foreach($items as $it)db_execute('INSERT INTO machine_safety_compliance (MachineID,ItemCode,Status,UpdatedBy) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE Status=VALUES(Status),UpdatedBy=VALUES(UpdatedBy)',[$p['id'],$it['ItemCode'],$it['Status'],p5_user_name($user)]);db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;} json_response(['success'=>true]); }
    $p = route_params($path, '/machine-safety/:id/issues');
    if ($p !== null && $method === 'GET') { if(!msd_positive_id($p['id']))json_response(['success'=>false,'message'=>'Invalid machine id.'],400); json_response(['success'=>true,'data'=>db_rows('SELECT * FROM machine_safety_issues WHERE MachineID=? ORDER BY CreatedAt DESC',[$p['id']])]); }
    if ($p !== null && $method === 'POST') { if(!msd_machine_exists($p['id']))json_response(['success'=>false,'message'=>'Machine not found.'],404); $b=json_body(); $description=msd_text($b['Description']??null,5000); $severity=msd_choice($b['Severity']??null,['low','medium','high','critical'],'medium'); if($description===''||$severity==='')json_response(['success'=>false,'message'=>'Valid Description and Severity are required.'],400); db_execute('INSERT INTO machine_safety_issues (MachineID,Description,Severity,CreatedBy) VALUES (?,?,?,?)',[$p['id'],$description,$severity,p5_user_name($user)]); json_response(['success'=>true,'id'=>(int)db()->lastInsertId()],201); }
    $p = route_params($path, '/machine-safety/:id');
    if ($p !== null && $method === 'PUT') {
        if(!msd_positive_id($p['id']))json_response(['success'=>false,'message'=>'Invalid machine id.'],400);
        $b=json_body(); $name=msd_text($b['MachineName']??'',255); $effective=p5_date($b['EffectiveDate']??null);
        $status=msd_choice($b['Status']??null,['active','maintenance','inactive','restricted','locked'],'active'); $risk=msd_choice($b['RiskLevel']??null,['low','medium','high','critical'],'low');
        $areas=msd_areas($b['Areas']??($b['Area']??null)); $next=p5_date($b['NextInspectionDate']??null); $row=db_row('SELECT MachineCode FROM machine_safety WHERE id=? LIMIT 1',[$p['id']]);
        if(!$row)json_response(['success'=>false,'message'=>'Machine not found.'],404);
        if($name===''||!$effective||$status===''||$risk===''||strlen($areas)>500||(!empty($b['NextInspectionDate'])&&!$next))json_response(['success'=>false,'message'=>'Invalid Machine Safety document data.'],400);
        $locked=empty($row['MachineCode']); if($locked)msd_document_number_lock();
        try{$code=$row['MachineCode']?:msd_next_document_no();db_execute('UPDATE machine_safety SET MachineCode=?,MachineName=?,Department=?,Area=?,HasRiskAssessment=?,Remark=?,Status=?,RiskLevel=?,NextInspectionDate=?,EffectiveDate=?,IssueBy=?,IssueByName=?,VerifiedBy=?,VerifiedByName=?,UpdatedBy=? WHERE id=?',[$code,$name,msd_text($b['Department']??null,100)?:null,$areas?:null,p5_bool($b['HasRiskAssessment']??0),msd_text($b['Remark']??null,5000)?:null,$status,$risk,$next,$effective,msd_text($b['IssueBy']??null,50)?:null,msd_text($b['IssueByName']??null,255)?:null,msd_text($b['VerifiedBy']??null,50)?:null,msd_text($b['VerifiedByName']??null,255)?:null,p5_user_name($user),$p['id']]);}finally{if($locked)msd_document_number_unlock();}
        json_response(['success'=>true,'MachineCode'=>$code]);
    }
    if ($p !== null && $method === 'DELETE') {
        if(!msd_machine_exists($p['id']))json_response(['success'=>false,'message'=>'Machine not found.'],404); $files=db_rows('SELECT FileUrl FROM machine_safety_files WHERE MachineID=?',[$p['id']]);
        db()->beginTransaction(); try{db_execute('DELETE FROM machine_safety_compliance WHERE MachineID=?',[$p['id']]);db_execute('DELETE FROM machine_safety_issues WHERE MachineID=?',[$p['id']]);db_execute('DELETE FROM machine_safety_files WHERE MachineID=?',[$p['id']]);db_execute('DELETE FROM machine_safety WHERE id=?',[$p['id']]);db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        foreach($files as $f)delete_uploaded_file($f['FileUrl']); json_response(['success'=>true]);
    }
    return false;
}

function ensure_contractor_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS contractor_documents (id VARCHAR(36) PRIMARY KEY,Title VARCHAR(255) NOT NULL,PartyType VARCHAR(20) NOT NULL DEFAULT 'Contractor',Category VARCHAR(100),Description TEXT,FileUrl TEXT NOT NULL,PublicID VARCHAR(255),FileType VARCHAR(50),FileSize BIGINT DEFAULT 0,UploadedBy VARCHAR(100),UploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_party(PartyType),KEY idx_cat(Category)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS contractor_activity_log (id INT AUTO_INCREMENT PRIMARY KEY,ActionType VARCHAR(30),DocID VARCHAR(36),DocTitle VARCHAR(255),Category VARCHAR(100),ActorName VARCHAR(100),Detail VARCHAR(255),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS contractor_companies (id VARCHAR(36) PRIMARY KEY,CompanyName VARCHAR(255) NOT NULL,PartyType VARCHAR(20) NOT NULL DEFAULT 'Contractor',Status VARCHAR(20) DEFAULT 'Active',CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_party(PartyType)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS contractor_accidentrecords (id VARCHAR(36) PRIMARY KEY,IncidentDate DATE NOT NULL,IncidentType VARCHAR(30) NOT NULL,PartyType VARCHAR(20) NOT NULL DEFAULT 'Contractor',CompanyName VARCHAR(255) NOT NULL,InvolvedPerson VARCHAR(255),Area VARCHAR(255),Description TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,DeletedAt DATETIME NULL,DeletedBy VARCHAR(100),KEY idx_date(IncidentDate),KEY idx_party(PartyType)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS contractor_accidentfiles (id VARCHAR(36) PRIMARY KEY,RecordID VARCHAR(36) NOT NULL,FileUrl TEXT NOT NULL,PublicID VARCHAR(255),FileName VARCHAR(255),FileType VARCHAR(50),FileSize BIGINT DEFAULT 0,UploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,KEY idx_record(RecordID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function contractor_log(string $type, ?string $id, string $title, string $cat, string $actor): void
{
    try { db_execute('INSERT INTO contractor_activity_log (ActionType,DocID,DocTitle,Category,ActorName) VALUES (?,?,?,?,?)', [$type, $id, mb_substr($title,0,255), mb_substr($cat,0,100), mb_substr($actor,0,100)]); } catch (Throwable $e) {}
}

function contractor_party($value): string
{
    return in_array((string)$value, ['Contractor','Supplier'], true) ? (string)$value : 'Contractor';
}

function contractor_incident($value): string
{
    return in_array((string)$value, ['Accident','Near Miss','First Aid','Property Damage'], true) ? (string)$value : 'Accident';
}

function ensure_contractor_company(string $name, string $party, string $actor): ?string
{
    $name = trim($name);
    if ($name === '') return null;
    $row = db_row('SELECT id FROM contractor_companies WHERE CompanyName=? AND PartyType=? AND DeletedAt IS NULL LIMIT 1', [$name, $party]);
    if ($row) return $row['id'];
    $id = p5_uuid();
    db_execute('INSERT INTO contractor_companies (id,CompanyName,PartyType,CreatedBy) VALUES (?,?,?,?)', [$id, $name, $party, $actor]);
    return $id;
}

function handle_contractor_routes(string $method, string $path): bool
{
    if (strpos($path, '/contractor') !== 0) return false;
    $user = require_user(); ensure_contractor_tables(); $actor = p5_user_name($user);
    if ($method === 'GET' && $path === '/contractor/documents') {
        $sql = 'SELECT * FROM contractor_documents WHERE DeletedAt IS NULL'; $p=[];
        if (!empty($_GET['category']) && $_GET['category'] !== 'all') { $sql.=' AND Category=?'; $p[]=$_GET['category']; }
        if (!empty($_GET['partyType']) && $_GET['partyType'] !== 'all') { $sql.=' AND PartyType=?'; $p[]=$_GET['partyType']; }
        if (!empty($_GET['q'])) { $sql.=' AND (Title LIKE ? OR Description LIKE ?)'; $q='%'.trim((string)$_GET['q']).'%'; $p[]=$q; $p[]=$q; }
        if (!empty($_GET['dateFrom'])) { $sql.=' AND DATE(UploadedAt)>=?'; $p[]=$_GET['dateFrom']; }
        if (!empty($_GET['dateTo'])) { $sql.=' AND DATE(UploadedAt)<=?'; $p[]=$_GET['dateTo']; }
        $rows = db_rows($sql.' ORDER BY UploadedAt DESC', $p); json_response(['success'=>true,'data'=>$rows,'total'=>count($rows)]);
    }
    if ($method === 'GET' && $path === '/contractor/documents/stats') json_response(['success'=>true,'data'=>['total'=>safe_scalar('SELECT COUNT(*) FROM contractor_documents WHERE DeletedAt IS NULL'),'byCategory'=>safe_rows('SELECT Category,COUNT(*) AS cnt FROM contractor_documents WHERE DeletedAt IS NULL GROUP BY Category ORDER BY cnt DESC'),'byParty'=>safe_rows('SELECT PartyType,COUNT(*) AS cnt FROM contractor_documents WHERE DeletedAt IS NULL GROUP BY PartyType ORDER BY PartyType'),'recentCount'=>safe_scalar('SELECT COUNT(*) FROM contractor_documents WHERE DeletedAt IS NULL AND UploadedAt>=DATE_SUB(NOW(),INTERVAL 30 DAY)')]]);
    if ($method === 'GET' && $path === '/contractor/activity') json_response(['success'=>true,'data'=>db_rows('SELECT * FROM contractor_activity_log ORDER BY CreatedAt DESC LIMIT '.min((int)($_GET['limit']??20),50))]);
    if ($method === 'GET' && $path === '/contractor/companies') {
        $sql='SELECT * FROM contractor_companies WHERE DeletedAt IS NULL'; $p=[]; if(!empty($_GET['partyType'])&&$_GET['partyType']!=='all'){$sql.=' AND PartyType=?';$p[]=$_GET['partyType'];} if(!empty($_GET['q'])){$sql.=' AND CompanyName LIKE ?';$p[]='%'.trim((string)$_GET['q']).'%';} json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY PartyType,CompanyName',$p)]);
    }
    if ($method === 'POST' && $path === '/contractor/companies') { require_admin(); $b=json_body(); $name=trim((string)($b['CompanyName']??'')); if($name==='') json_response(['success'=>false,'message'=>'CompanyName is required.'],400); $id=ensure_contractor_company($name,contractor_party($b['PartyType']??null),$actor); json_response(['success'=>true,'id'=>$id],201); }
    if ($method === 'POST' && $path === '/contractor/documents') { require_admin(); $files=p5_store_files('file',1); if(!$files) json_response(['success'=>false,'message'=>'No file uploaded.'],400); $b=$_POST; $title=trim((string)($b['Title']??'')); if($title===''){p5_cleanup($files);json_response(['success'=>false,'message'=>'Title is required.'],400);} $id=p5_uuid(); $f=$files[0]; db_execute('INSERT INTO contractor_documents (id,Title,PartyType,Category,Description,FileUrl,PublicID,FileType,FileSize,UploadedBy) VALUES (?,?,?,?,?,?,?,?,?,?)',[$id,$title,contractor_party($b['PartyType']??null),$b['Category']??'ทั่วไป',$b['Description']??null,$f['url'],$f['stored'],$f['ext'],$f['size'],$actor]); contractor_log('upload',$id,$title,$b['Category']??'',$actor); json_response(['success'=>true,'id'=>$id],201); }
    $p=route_params($path,'/contractor/documents/:id');
    if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE contractor_documents SET Title=?,PartyType=?,Category=?,Description=? WHERE id=? AND DeletedAt IS NULL',[$b['Title'],contractor_party($b['PartyType']??null),$b['Category']??'ทั่วไป',$b['Description']??null,$p['id']]);contractor_log('edit',$p['id'],$b['Title']??'',$b['Category']??'',$actor);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT Title,Category FROM contractor_documents WHERE id=? AND DeletedAt IS NULL',[$p['id']]);db_execute('UPDATE contractor_documents SET DeletedAt=NOW(),DeletedBy=? WHERE id=?',[$actor,$p['id']]);if($row)contractor_log('delete',$p['id'],$row['Title'],$row['Category']??'',$actor);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/contractor/accidents'){
        $sql='SELECT * FROM contractor_accidentrecords WHERE DeletedAt IS NULL';$p=[]; if(!empty($_GET['year'])){$sql.=' AND YEAR(IncidentDate)=?';$p[]=(int)$_GET['year'];} if(!empty($_GET['type'])&&$_GET['type']!=='all'){$sql.=' AND IncidentType=?';$p[]=$_GET['type'];} if(!empty($_GET['partyType'])&&$_GET['partyType']!=='all'){$sql.=' AND PartyType=?';$p[]=$_GET['partyType'];} if(!empty($_GET['q'])){$q='%'.trim((string)$_GET['q']).'%';$sql.=' AND (CompanyName LIKE ? OR InvolvedPerson LIKE ? OR Area LIKE ? OR Description LIKE ?)';array_push($p,$q,$q,$q,$q);} $rows=db_rows($sql.' ORDER BY IncidentDate DESC,CreatedAt DESC',$p); foreach($rows as &$r)$r['Files']=db_rows('SELECT * FROM contractor_accidentfiles WHERE RecordID=? ORDER BY UploadedAt ASC',[$r['id']]); unset($r); json_response(['success'=>true,'data'=>$rows]);
    }
    if($method==='GET'&&$path==='/contractor/accidents/stats'){ $year=(int)($_GET['year']??date('Y')); json_response(['success'=>true,'data'=>['year'=>$year,'byType'=>db_rows('SELECT IncidentType,COUNT(*) AS cnt FROM contractor_accidentrecords WHERE DeletedAt IS NULL AND YEAR(IncidentDate)=? GROUP BY IncidentType',[$year]),'byParty'=>db_rows('SELECT PartyType,COUNT(*) AS cnt FROM contractor_accidentrecords WHERE DeletedAt IS NULL AND YEAR(IncidentDate)=? GROUP BY PartyType',[$year]),'lastAccident'=>db_row("SELECT IncidentDate FROM contractor_accidentrecords WHERE DeletedAt IS NULL AND IncidentType='Accident' ORDER BY IncidentDate DESC LIMIT 1"),'recent'=>db_rows('SELECT * FROM contractor_accidentrecords WHERE DeletedAt IS NULL ORDER BY IncidentDate DESC,CreatedAt DESC LIMIT 5')]]); }
    if($method==='POST'&&$path==='/contractor/accidents'){require_admin();$files=p5_store_files('files',20);$b=$_POST;if(!p5_date($b['IncidentDate']??null)||empty($b['CompanyName'])){p5_cleanup($files);json_response(['success'=>false,'message'=>'IncidentDate and CompanyName are required.'],400);} $id=p5_uuid();$party=contractor_party($b['PartyType']??null);ensure_contractor_company($b['CompanyName'],$party,$actor);db_execute('INSERT INTO contractor_accidentrecords (id,IncidentDate,IncidentType,PartyType,CompanyName,InvolvedPerson,Area,Description,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?)',[$id,p5_date($b['IncidentDate']),contractor_incident($b['IncidentType']??null),$party,mb_substr($b['CompanyName'],0,255),$b['InvolvedPerson']??null,$b['Area']??null,$b['Description']??null,$actor]);foreach($files as $f)db_execute('INSERT INTO contractor_accidentfiles (id,RecordID,FileUrl,PublicID,FileName,FileType,FileSize) VALUES (?,?,?,?,?,?,?)',[p5_uuid(),$id,$f['url'],$f['stored'],$f['name'],$f['ext'],$f['size']]);contractor_log('accident_create',$id,contractor_incident($b['IncidentType']??null).': '.$b['CompanyName'],$party,$actor);json_response(['success'=>true,'id'=>$id],201);}
    $p=route_params($path,'/contractor/accidents/:id/files');
    if($p!==null&&$method==='POST'){require_admin();$files=p5_store_files('files',20);if(!$files)json_response(['success'=>false,'message'=>'No files uploaded.'],400);foreach($files as $f)db_execute('INSERT INTO contractor_accidentfiles (id,RecordID,FileUrl,PublicID,FileName,FileType,FileSize) VALUES (?,?,?,?,?,?,?)',[p5_uuid(),$p['id'],$f['url'],$f['stored'],$f['name'],$f['ext'],$f['size']]);json_response(['success'=>true],201);}
    $p=route_params($path,'/contractor/accidents/:id');
    if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE contractor_accidentrecords SET IncidentDate=?,IncidentType=?,PartyType=?,CompanyName=?,InvolvedPerson=?,Area=?,Description=? WHERE id=? AND DeletedAt IS NULL',[p5_date($b['IncidentDate']??null),contractor_incident($b['IncidentType']??null),contractor_party($b['PartyType']??null),$b['CompanyName'],$b['InvolvedPerson']??null,$b['Area']??null,$b['Description']??null,$p['id']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE contractor_accidentrecords SET DeletedAt=NOW(),DeletedBy=? WHERE id=?',[$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/contractor/accident-files/:fileId');
    if($p!==null&&$method==='DELETE'){require_admin();$f=db_row('SELECT FileUrl FROM contractor_accidentfiles WHERE id=?',[$p['fileId']]);db_execute('DELETE FROM contractor_accidentfiles WHERE id=?',[$p['fileId']]);if($f)delete_uploaded_file($f['FileUrl']);json_response(['success'=>true]);}
    return false;
}

function ensure_safety_culture_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS sc_principles (PrincipleID VARCHAR(36) PRIMARY KEY,SortOrder INT DEFAULT 0,Title VARCHAR(200) NOT NULL,Description TEXT,ImageUrl TEXT,AttachmentUrl TEXT,AttachmentName VARCHAR(255),IsFeatured TINYINT(1) DEFAULT 0,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    if ((int)(safe_scalar('SELECT COUNT(*) FROM sc_principles') ?? 0) === 0) for($i=1;$i<=8;$i++) db_execute('INSERT INTO sc_principles (PrincipleID,SortOrder,Title,Description) VALUES (?,?,?,?)', ['sc-p-0'.$i,$i,'Safety Culture '.$i,'']);
    db()->exec("CREATE TABLE IF NOT EXISTS sc_assessments (AssessmentID VARCHAR(36) PRIMARY KEY,AssessmentYear INT NOT NULL,AssessmentDate DATE NULL,WeekNo TINYINT NULL,Area VARCHAR(100),T1_Score DECIMAL(5,2),T2_Score DECIMAL(5,2),T3_Score DECIMAL(5,2),T4_Score DECIMAL(5,2),T5_Score DECIMAL(5,2),T7_Score DECIMAL(5,2),Notes TEXT,CreatedBy VARCHAR(100),TopicAreas TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,KEY idx_year(AssessmentYear)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_assessment_points (PointID VARCHAR(36) PRIMARY KEY,AssessmentID VARCHAR(36) NOT NULL,PointNo TINYINT NOT NULL,TopicKey VARCHAR(10) NOT NULL,LocationID VARCHAR(36) NULL,LocationName VARCHAR(200) NULL,TotalPeople INT DEFAULT 0,ComplyPeople INT DEFAULT 0,Pct DECIMAL(5,2),KEY idx_assessment(AssessmentID),KEY idx_location(LocationID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    try{db()->exec("ALTER TABLE sc_assessment_points ADD COLUMN LocationID VARCHAR(36) NULL AFTER TopicKey");}catch(Throwable $e){}
    try{db()->exec("ALTER TABLE sc_assessment_points ADD COLUMN LocationName VARCHAR(200) NULL AFTER LocationID");}catch(Throwable $e){}
    try{db()->exec("ALTER TABLE sc_assessment_points ADD INDEX idx_location(LocationID)");}catch(Throwable $e){}
    db()->exec("CREATE TABLE IF NOT EXISTS sc_assessment_locations (LocationID VARCHAR(36) PRIMARY KEY,LocationName VARCHAR(200) NOT NULL,LocationGroup VARCHAR(50) NOT NULL DEFAULT 'walkway',AppliesTo VARCHAR(50) NOT NULL DEFAULT 'T1-T5',SortOrder INT NOT NULL DEFAULT 99,IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_active_group(IsActive,LocationGroup,SortOrder)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_items (ItemID VARCHAR(36) PRIMARY KEY,ItemName VARCHAR(100) NOT NULL,Description TEXT,ImageUrl TEXT,SortOrder INT DEFAULT 99,IsActive TINYINT(1) DEFAULT 1,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    if ((int)(safe_scalar('SELECT COUNT(*) FROM sc_ppe_items') ?? 0) === 0) foreach(['Safety Helmet','Safety Glasses','Gloves','Safety Shoes','Face Shield','Ear Plug'] as $i=>$n) db_execute('INSERT INTO sc_ppe_items (ItemID,ItemName,SortOrder) VALUES (?,?,?)',[p5_uuid(),$n,$i+1]);
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_worktypes (WorkTypeID VARCHAR(36) PRIMARY KEY,Name VARCHAR(100) NOT NULL,Description TEXT,SortOrder INT DEFAULT 99,IsActive TINYINT(1) DEFAULT 1,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_worktype_items (ID INT AUTO_INCREMENT PRIMARY KEY,WorkTypeID VARCHAR(36) NOT NULL,ItemID VARCHAR(36) NOT NULL,UNIQUE KEY uq_wt_item(WorkTypeID,ItemID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppeinspections (InspectionID VARCHAR(36) PRIMARY KEY,InspectionDate DATE NOT NULL,Area VARCHAR(100),Department VARCHAR(100),InspectorID VARCHAR(50),InspectorName VARCHAR(100),WorkTypeID VARCHAR(36),WorkTypeName VARCHAR(100),WorkTypeSnapshot TEXT,InspectedEmployeeID VARCHAR(50),InspectedEmployeeName VARCHAR(100),IsPass TINYINT(1),IsUnregistered TINYINT(1) DEFAULT 0,TotalItems INT DEFAULT 0,CompliantItems INT DEFAULT 0,CompliancePct DECIMAL(5,2),Notes TEXT,ImageUrl TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME NULL,KEY idx_date(InspectionDate),KEY idx_dept(Department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_inspection_details (DetailID VARCHAR(36) PRIMARY KEY,InspectionID VARCHAR(36) NOT NULL,ItemID VARCHAR(36) NOT NULL,Status VARCHAR(20),KEY idx_insp(InspectionID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_violations (ViolationID VARCHAR(36) PRIMARY KEY,EmployeeID VARCHAR(50) NOT NULL,EmployeeName VARCHAR(100),Department VARCHAR(100),InspectionID VARCHAR(36),ViolationNo INT DEFAULT 1,WarningLevel VARCHAR(30) DEFAULT 'verbal',InspectorID VARCHAR(50),InspectorName VARCHAR(100),Note TEXT,ViolationDate DATE NOT NULL,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME NULL,KEY idx_emp(EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function sc_score($v) { if ($v === '' || $v === null) return null; $n=(float)$v; if($n<0||$n>100) json_response(['success'=>false,'message'=>'Score must be 0-100.'],400); return round($n,2); }
function sc_json_array($v): array { if(is_array($v)) return $v; if(is_string($v)&&trim($v)!==''){ $d=json_decode($v,true); return is_array($d)?$d:[]; } return []; }
function sc_topic_areas($v): ?string { $raw=sc_json_array($v); $clean=[]; foreach(['T1','T2','T3','T4','T5','T7'] as $k){ $s=trim((string)($raw[$k]??'')); if($s!=='') $clean[$k]=mb_substr($s,0,200); } return $clean?json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES):null; }
function sc_assessment_points($v): array { $out=[]; foreach(sc_json_array($v) as $pt){ $tk=trim((string)($pt['TopicKey']??'')); $pn=(int)($pt['PointNo']??0); if(!in_array($tk,['T1','T2','T3','T4','T5','T7'],true)||!in_array($pn,[1,2,3],true)) continue; $total=max(0,(int)($pt['TotalPeople']??0)); $comply=max(0,(int)($pt['ComplyPeople']??0)); if($comply>$total) json_response(['success'=>false,'message'=>"จำนวนคนที่ปฏิบัติตามต้องไม่มากกว่าจำนวนทั้งหมด ($tk จุดที่ $pn)"],400); $out[]=['TopicKey'=>$tk,'PointNo'=>$pn,'LocationID'=>($pt['LocationID']??'')!==''?mb_substr((string)$pt['LocationID'],0,36):null,'LocationName'=>($pt['LocationName']??'')!==''?mb_substr(trim((string)$pt['LocationName']),0,200):null,'TotalPeople'=>$total,'ComplyPeople'=>$comply,'Pct'=>$total>0?round($comply*100/$total,2):null]; } return $out; }
function sc_location_payload(array $b): array { $name=trim((string)($b['LocationName']??$b['Name']??'')); if($name==='') json_response(['success'=>false,'message'=>'กรุณาระบุชื่อจุดตรวจ'],400); $group=mb_substr(trim((string)($b['LocationGroup']??'walkway')),0,50)?:'walkway'; $applies=mb_substr(trim((string)($b['AppliesTo']??($group==='waste'?'T7':'T1-T5'))),0,50)?:'T1-T5'; return ['name'=>mb_substr($name,0,200),'group'=>$group,'applies'=>$applies,'sort'=>(int)($b['SortOrder']??99),'active'=>((isset($b['IsActive'])&&($b['IsActive']===false||$b['IsActive']===0||$b['IsActive']==='0'))?0:1)]; }
function sc_violation_lock_name(string $employeeId): string { return 'sc_ppe_v_'.substr(hash('sha256',$employeeId),0,32); }
function sc_violation_lock(string $employeeId): string { $name=sc_violation_lock_name($employeeId);$row=db_row('SELECT GET_LOCK(?,5) AS acquired',[$name]);if((int)($row['acquired']??0)!==1)json_response(['success'=>false,'message'=>'PPE violation sequence is busy.'],409);return $name; }
function sc_violation_unlock(?string $name): void { if($name!==null){try{db_row('SELECT RELEASE_LOCK(?) AS released',[$name]);}catch(Throwable $ignored){}} }

function handle_safety_culture_routes(string $method, string $path): bool
{
    if (strpos($path, '/safety-culture') !== 0) return false;
    $user=require_user();
    // Provisioning is write-only: authenticated GET routes must never run DDL, seed, or migration work.
    if(in_array($method,['POST','PUT','DELETE'],true)) ensure_safety_culture_tables();
    if($method==='GET'&&$path==='/safety-culture/assessment-locations'){ $all=isset($_GET['all'])&&$_GET['all']==='1'&&strcasecmp((string)($user['role']??$user['Role']??''),'Admin')===0; json_response(['success'=>true,'data'=>db_rows('SELECT * FROM sc_assessment_locations '.($all?'':'WHERE IsActive=1 ').'ORDER BY SortOrder,LocationGroup,LocationName')]); }
    if($method==='POST'&&$path==='/safety-culture/assessment-locations'){require_admin();$b=sc_location_payload(json_body());$id=p5_uuid();db_execute('INSERT INTO sc_assessment_locations (LocationID,LocationName,LocationGroup,AppliesTo,SortOrder,IsActive) VALUES (?,?,?,?,?,?)',[$id,$b['name'],$b['group'],$b['applies'],$b['sort'],$b['active']]);json_response(['success'=>true,'id'=>$id]);}
    $lp=route_params($path,'/safety-culture/assessment-locations/:id'); if($lp!==null&&$method==='PUT'){require_admin();$b=sc_location_payload(json_body());db_execute('UPDATE sc_assessment_locations SET LocationName=?,LocationGroup=?,AppliesTo=?,SortOrder=?,IsActive=? WHERE LocationID=?',[$b['name'],$b['group'],$b['applies'],$b['sort'],$b['active'],$lp['id']]);json_response(['success'=>true]);}
    if($lp!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_assessment_locations SET IsActive=0 WHERE LocationID=?',[$lp['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/principles') json_response(['success'=>true,'data'=>db_rows('SELECT * FROM sc_principles ORDER BY SortOrder')]);
    $p=route_params($path,'/safety-culture/principles/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();if(!empty($b['IsFeatured']))db_execute('UPDATE sc_principles SET IsFeatured=0');db_execute('UPDATE sc_principles SET Title=?,Description=?,ImageUrl=?,AttachmentUrl=?,AttachmentName=?,IsFeatured=? WHERE PrincipleID=?',[$b['Title'],$b['Description']??null,$b['ImageUrl']??null,$b['AttachmentUrl']??null,$b['AttachmentName']??null,p5_bool($b['IsFeatured']??0),$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/assessments'){ $sql='SELECT * FROM sc_assessments';$pa=[];if(!empty($_GET['year'])){$sql.=' WHERE AssessmentYear=?';$pa[]=(int)$_GET['year'];}$rows=db_rows($sql.' ORDER BY COALESCE(AssessmentDate,MAKEDATE(AssessmentYear,1)) DESC,WeekNo DESC,CreatedAt DESC',$pa);foreach($rows as &$r){$r['points']=db_rows('SELECT * FROM sc_assessment_points WHERE AssessmentID=? ORDER BY TopicKey,PointNo',[$r['AssessmentID']]);$r['topicAreas']=json_decode((string)($r['TopicAreas']??'{}'),true)?:[];unset($r['TopicAreas']);}unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if(($method==='POST'&&$path==='/safety-culture/assessments')||(($p=route_params($path,'/safety-culture/assessments/:id'))!==null&&$method==='PUT')){
        require_admin();$b=json_body();$id=$method==='POST'?p5_uuid():$p['id'];$date=p5_date($b['AssessmentDate']??null);$year=$date?(int)substr($date,0,4):(int)($b['AssessmentYear']??date('Y'));$topicAreas=sc_topic_areas($b['topicAreas']??null);$points=sc_assessment_points($b['points']??[]);$vals=[$year,$date,(int)($b['WeekNo']??0)?:null,$b['Area']??'ทั้งหมด',sc_score($b['T1_Score']??null),sc_score($b['T2_Score']??null),sc_score($b['T3_Score']??null),sc_score($b['T4_Score']??null),sc_score($b['T5_Score']??null),sc_score($b['T7_Score']??null),$b['Notes']??null,$topicAreas];
        db()->beginTransaction();
        try{
            if($method==='POST') db_execute('INSERT INTO sc_assessments (AssessmentID,AssessmentYear,AssessmentDate,WeekNo,Area,T1_Score,T2_Score,T3_Score,T4_Score,T5_Score,T7_Score,Notes,CreatedBy,TopicAreas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',array_merge([$id],array_slice($vals,0,11),[p5_user_name($user),$topicAreas]));
            else { if(db_execute('UPDATE sc_assessments SET AssessmentYear=?,AssessmentDate=?,WeekNo=?,Area=?,T1_Score=?,T2_Score=?,T3_Score=?,T4_Score=?,T5_Score=?,T7_Score=?,Notes=?,TopicAreas=? WHERE AssessmentID=?',array_merge($vals,[$id]))===0){db()->rollBack();json_response(['success'=>false,'message'=>'Assessment not found.'],404);} db_execute('DELETE FROM sc_assessment_points WHERE AssessmentID=?',[$id]); }
            foreach($points as $pt) db_execute('INSERT INTO sc_assessment_points (PointID,AssessmentID,PointNo,TopicKey,LocationID,LocationName,TotalPeople,ComplyPeople,Pct) VALUES (?,?,?,?,?,?,?,?,?)',[p5_uuid(),$id,$pt['PointNo'],$pt['TopicKey'],$pt['LocationID'],$pt['LocationName'],$pt['TotalPeople'],$pt['ComplyPeople'],$pt['Pct']]);
            db()->commit();
        }catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}
        json_response(['success'=>true,'id'=>$id],$method==='POST'?201:200);
    }
    $p=route_params($path,'/safety-culture/assessments/:id'); if($p!==null&&$method==='DELETE'){require_admin();db()->beginTransaction();try{db_execute('DELETE FROM sc_assessment_points WHERE AssessmentID=?',[$p['id']]);$affected=db_execute('DELETE FROM sc_assessments WHERE AssessmentID=?',[$p['id']]);if($affected===0){db()->rollBack();json_response(['success'=>false,'message'=>'Assessment not found.'],404);}db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-items')json_response(['success'=>true,'data'=>db_rows('SELECT * FROM sc_ppe_items WHERE IsActive=1 ORDER BY SortOrder,CreatedAt')]);
    if($method==='POST'&&$path==='/safety-culture/ppe-items'){require_admin();$b=json_body();$id=p5_uuid();db_execute('INSERT INTO sc_ppe_items (ItemID,ItemName,Description,ImageUrl,SortOrder) VALUES (?,?,?,?,?)',[$id,$b['ItemName'],$b['Description']??null,$b['ImageUrl']??null,(int)($b['SortOrder']??99)]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/safety-culture/ppe-items/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE sc_ppe_items SET ItemName=?,Description=?,ImageUrl=?,SortOrder=? WHERE ItemID=?',[$b['ItemName'],$b['Description']??null,$b['ImageUrl']??null,(int)($b['SortOrder']??99),$p['id']]);json_response(['success'=>true]);} if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppe_items SET IsActive=0 WHERE ItemID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-work-types'){ $w=db_rows('SELECT * FROM sc_ppe_worktypes WHERE IsActive=1 ORDER BY SortOrder,Name');foreach($w as &$r)$r['items']=db_rows('SELECT wi.WorkTypeID,wi.ItemID,pi.ItemName,pi.Description,pi.ImageUrl,pi.SortOrder FROM sc_ppe_worktype_items wi JOIN sc_ppe_items pi ON pi.ItemID=wi.ItemID WHERE wi.WorkTypeID=? ORDER BY pi.SortOrder',[$r['WorkTypeID']]);unset($r);json_response(['success'=>true,'data'=>$w]);}
    if($method==='POST'&&$path==='/safety-culture/ppe-work-types'){require_admin();$b=json_body();$itemIds=array_values(array_unique(array_filter(array_map('strval',p5_json_array($b['itemIds']??($b['ItemIDs']??[]))))));if(!count($itemIds))json_response(['success'=>false,'message'=>'กรุณาเลือก PPE ที่ต้องใช้ในเทมเพลตอย่างน้อย 1 รายการ'],400);$name=trim((string)($b['Name']??''));if($name==='')json_response(['success'=>false,'message'=>'Work type name is required.'],400);$id=p5_uuid();db()->beginTransaction();try{db_execute('INSERT INTO sc_ppe_worktypes (WorkTypeID,Name,Description,SortOrder) VALUES (?,?,?,?)',[$id,mb_substr($name,0,100),$b['Description']??null,(int)($b['SortOrder']??99)]);foreach($itemIds as $it)db_execute('INSERT IGNORE INTO sc_ppe_worktype_items (WorkTypeID,ItemID) VALUES (?,?)',[$id,$it]);db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}json_response(['success'=>true,'id'=>$id],201);}
    $p=route_params($path,'/safety-culture/ppe-work-types/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();$itemIds=array_values(array_unique(array_filter(array_map('strval',p5_json_array($b['itemIds']??($b['ItemIDs']??[]))))));if(!count($itemIds))json_response(['success'=>false,'message'=>'กรุณาเลือก PPE ที่ต้องใช้ในเทมเพลตอย่างน้อย 1 รายการ'],400);$name=trim((string)($b['Name']??''));if($name==='')json_response(['success'=>false,'message'=>'Work type name is required.'],400);db()->beginTransaction();try{$affected=db_execute('UPDATE sc_ppe_worktypes SET Name=?,Description=?,SortOrder=? WHERE WorkTypeID=? AND IsActive=1',[mb_substr($name,0,100),$b['Description']??null,(int)($b['SortOrder']??99),$p['id']]);if($affected===0){db()->rollBack();json_response(['success'=>false,'message'=>'Work type not found.'],404);}db_execute('DELETE FROM sc_ppe_worktype_items WHERE WorkTypeID=?',[$p['id']]);foreach($itemIds as $it)db_execute('INSERT IGNORE INTO sc_ppe_worktype_items (WorkTypeID,ItemID) VALUES (?,?)',[$p['id'],$it]);db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}json_response(['success'=>true]);} if($p!==null&&$method==='DELETE'){require_admin();$affected=db_execute('UPDATE sc_ppe_worktypes SET IsActive=0 WHERE WorkTypeID=? AND IsActive=1',[$p['id']]);if($affected===0)json_response(['success'=>false,'message'=>'Work type not found.'],404);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-violations/summary'){require_admin();json_response(['success'=>true,'data'=>db_rows('SELECT WarningLevel,COUNT(*) AS cnt FROM sc_ppe_violations WHERE deleted_at IS NULL GROUP BY WarningLevel')]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-violations'){require_admin();$sql='SELECT * FROM sc_ppe_violations WHERE deleted_at IS NULL';$pa=[];if(!empty($_GET['year'])){$sql.=' AND YEAR(ViolationDate)=?';$pa[]=(int)$_GET['year'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY ViolationDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='POST'&&$path==='/safety-culture/ppe-violations'){require_admin();$b=json_body();$empId=trim((string)($b['EmployeeID']??''));$empName=trim((string)($b['EmployeeName']??''));if($empId===''&&$empName==='')json_response(['success'=>false,'message'=>'Employee is required.'],400);$stableKey=$empId!==''?$empId:'__unreg__:'.mb_strtolower($empName,'UTF-8');$lock=sc_violation_lock($stableKey);$id=p5_uuid();try{db()->beginTransaction();$count=(int)(safe_scalar('SELECT COUNT(*) FROM sc_ppe_violations WHERE deleted_at IS NULL AND EmployeeID=?',[$stableKey])??0);$no=$count+1;$level=$no>=3?'written_warning':($no===2?'safety_notice':'verbal');db_execute('INSERT INTO sc_ppe_violations (ViolationID,EmployeeID,EmployeeName,Department,InspectionID,ViolationNo,WarningLevel,InspectorID,InspectorName,Note,ViolationDate) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$stableKey,$empName?:$empId,$b['Department']??null,$b['InspectionID']??null,$no,$level,$user['id']??'',p5_user_name($user),$b['Note']??null,p5_date($b['ViolationDate']??date('Y-m-d'))]);db()->commit();}catch(Throwable $e){if(db()->inTransaction())db()->rollBack();throw $e;}finally{sc_violation_unlock($lock);}json_response(['success'=>true,'id'=>$id,'violationNo'=>$no,'warningLevel'=>$level],201);}
    $p=route_params($path,'/safety-culture/ppe-violations/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppe_violations SET deleted_at=NOW() WHERE ViolationID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-inspections'){ $sql='SELECT * FROM sc_ppeinspections WHERE deleted_at IS NULL';$pa=[];if(!empty($_GET['year'])){$sql.=' AND YEAR(InspectionDate)=?';$pa[]=(int)$_GET['year'];}if(!empty($_GET['department'])){$sql.=' AND Department=?';$pa[]=$_GET['department'];}$rows=db_rows($sql.' ORDER BY InspectionDate DESC',$pa);foreach($rows as &$r)$r['details']=db_rows('SELECT d.*,i.ItemName,i.SortOrder FROM sc_ppe_inspection_details d JOIN sc_ppe_items i ON i.ItemID=d.ItemID WHERE d.InspectionID=? ORDER BY i.SortOrder',[$r['InspectionID']]);unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if($method==='POST'&&$path==='/safety-culture/ppe-inspections'){
        require_admin();
        $b=json_body();$id=p5_uuid();$items=p5_json_array($b['items']??[]);
        $total=0;$ok=0;
        foreach($items as $it){if(($it['Status']??'')==='compliant'||($it['Status']??'')==='non-compliant'){$total++;if($it['Status']==='compliant')$ok++;}}
        if($total===0)json_response(['success'=>false,'message'=>'กรุณาเลือกสถานะ PPE อย่างน้อย 1 รายการ'],400);
        $date=p5_date($b['InspectionDate']??null);$pct=$total?round($ok*100/$total,2):0;$pass=$total>0&&$ok===$total?1:0;
        $inspectorId=$b['InspectorID']??($user['id']??'');$inspectorName=$b['InspectorName']??p5_user_name($user);
        $rawEmpId=trim((string)($b['InspectedEmployeeID']??''));$empName=trim((string)($b['InspectedEmployeeName']??''));
        $isUnreg=$empName!==''&&$rawEmpId==='';$finalEmpId=$rawEmpId!==''?$rawEmpId:($isUnreg?'__unreg__:'.mb_strtolower($empName,'UTF-8'):null);
        $violationResult=null;$lock=null;
        try{
            db()->beginTransaction();
            db_execute('INSERT INTO sc_ppeinspections (InspectionID,InspectionDate,Area,Department,InspectorID,InspectorName,WorkTypeID,WorkTypeName,InspectedEmployeeID,InspectedEmployeeName,IsPass,IsUnregistered,TotalItems,CompliantItems,CompliancePct,Notes,ImageUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$date,$b['Area']??null,$b['Department']??null,$inspectorId,$inspectorName,$b['WorkTypeID']??null,$b['WorkTypeName']??null,$finalEmpId,$empName?:null,$pass,$isUnreg?1:0,$total,$ok,$pct,$b['Notes']??null,$b['ImageUrl']??null]);
            foreach($items as $it){if(!empty($it['ItemID']))db_execute('INSERT INTO sc_ppe_inspection_details (DetailID,InspectionID,ItemID,Status) VALUES (?,?,?,?)',[p5_uuid(),$id,$it['ItemID'],$it['Status']??'na']);}
            if(!$pass&&$empName!==''){
                $lock=sc_violation_lock($finalEmpId??'');
                $count=(int)(safe_scalar('SELECT COUNT(*) FROM sc_ppe_violations WHERE deleted_at IS NULL AND EmployeeID=?',[$finalEmpId??''])??0);
                $violationNo=$count+1;$warningLevel=$violationNo>=3?'written_warning':($violationNo===2?'safety_notice':'verbal');$vid=p5_uuid();
                db_execute('INSERT INTO sc_ppe_violations (ViolationID,EmployeeID,EmployeeName,Department,InspectionID,ViolationNo,WarningLevel,InspectorID,InspectorName,Note,ViolationDate) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$vid,$finalEmpId??'',$empName,$b['Department']??null,$id,$violationNo,$warningLevel,$inspectorId,$inspectorName,'Auto from failed PPE Checklist ('.$date.')',$date]);
                $violationResult=['id'=>$vid,'violationNo'=>$violationNo,'warningLevel'=>$warningLevel];
            }
            db()->commit();
        }catch(Exception $e){
            if(db()->inTransaction())db()->rollBack();
            throw $e;
        }finally{
            sc_violation_unlock($lock);
        }
        json_response(['success'=>true,'id'=>$id,'isPass'=>$pass,'violationResult'=>$violationResult]);
    }
    $p=route_params($path,'/safety-culture/ppe-inspections/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE sc_ppeinspections SET Notes=? WHERE InspectionID=? AND deleted_at IS NULL',[isset($b['Notes'])?mb_substr((string)$b['Notes'],0,1000):null,$p['id']]);json_response(['success'=>true]);} if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppeinspections SET deleted_at=NOW() WHERE InspectionID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/dashboard'){ $year=(int)($_GET['year']??date('Y')); json_response(['success'=>true,'data'=>['avgScores'=>db_row('SELECT AVG(T1_Score) AS avg_t1,AVG(T2_Score) AS avg_t2,AVG(T3_Score) AS avg_t3,AVG(T4_Score) AS avg_t4,AVG(T5_Score) AS avg_t5,AVG(T7_Score) AS avg_t7 FROM sc_assessments WHERE AssessmentYear=?',[$year]),'ppeStats'=>[['overall_pct'=>safe_scalar('SELECT AVG(CompliancePct) FROM sc_ppeinspections WHERE deleted_at IS NULL AND YEAR(InspectionDate)=?',[$year]),'itemBreakdown'=>db_rows("SELECT pi.ItemID,pi.ItemName,pi.SortOrder,SUM(CASE WHEN d.Status='compliant' THEN 1 ELSE 0 END) AS ok_count,COUNT(*) AS total_count FROM sc_ppe_inspection_details d JOIN sc_ppe_items pi ON pi.ItemID=d.ItemID JOIN sc_ppeinspections ins ON ins.InspectionID=d.InspectionID WHERE ins.deleted_at IS NULL AND YEAR(ins.InspectionDate)=? AND d.Status!='na' GROUP BY pi.ItemID,pi.ItemName,pi.SortOrder ORDER BY pi.SortOrder",[$year])]],'yearTrend'=>db_rows('SELECT AssessmentYear,AVG((COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+COALESCE(T3_Score,0)+COALESCE(T4_Score,0)+COALESCE(T5_Score,0)+COALESCE(T7_Score,0))/NULLIF((T1_Score IS NOT NULL)+(T2_Score IS NOT NULL)+(T3_Score IS NOT NULL)+(T4_Score IS NOT NULL)+(T5_Score IS NOT NULL)+(T7_Score IS NOT NULL),0)) AS avg_score FROM sc_assessments GROUP BY AssessmentYear ORDER BY AssessmentYear')]]); }
    return false;
}
