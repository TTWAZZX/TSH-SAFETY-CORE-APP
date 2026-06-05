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

function p5_store_files(string $field, int $max = 20): array
{
    if (!isset($_FILES[$field])) return [];
    $input = $_FILES[$field];
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
    $stored = [];
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
        $storedName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
        $target = upload_dir() . DIRECTORY_SEPARATOR . $storedName;
        if (!move_uploaded_file($tmp, $target)) json_response(['success' => false, 'message' => 'Cannot store uploaded file.'], 500);
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

function handle_accident_routes(string $method, string $path): bool
{
    if (strpos($path, '/accident') !== 0) return false;
    $user = require_user(); ensure_accident_tables();
    $statCond = "AccidentType NOT IN ('Near Miss','First Aid') AND (AccidentType IN ('Medical Treatment','Lost Time','Fatal') OR Severity='Critical' OR IsRecordable=1 OR LostDays>0)";
    if ($method === 'GET' && $path === '/accident/reports') {
        $sql = "SELECT r.*,e.EmployeeName,e.Team,(SELECT COUNT(*) FROM accident_attachments a WHERE a.AccidentID=r.id) AS AttachmentCount FROM accident_reports r LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0)";
        $p = [];
        foreach (['department' => 'Department', 'type' => 'AccidentType', 'status' => 'Status'] as $q => $c) if (!empty($_GET[$q])) { $sql .= " AND r.$c=?"; $p[] = $_GET[$q]; }
        if (!empty($_GET['year'])) { $sql .= ' AND YEAR(r.AccidentDate)=?'; $p[] = (int)$_GET['year']; }
        json_response(['success' => true, 'data' => db_rows($sql . ' ORDER BY r.AccidentDate DESC,r.id DESC', $p)]);
    }
    $rp = route_params($path, '/accident/reports/:id/audit');
    if ($rp !== null && $method === 'GET') { require_admin(); json_response(['success' => true, 'data' => safe_rows("SELECT * FROM admin_auditlogs WHERE Module='accident' AND TargetID=? ORDER BY ActionTime DESC,id DESC LIMIT 20", [$rp['id']])]); }
    $rp = route_params($path, '/accident/reports/:id');
    if ($rp !== null && $method === 'GET') {
        $r = db_row("SELECT r.*,e.EmployeeName,e.Team FROM accident_reports r LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE r.id=? AND (r.IsDeleted IS NULL OR r.IsDeleted=0)", [$rp['id']]);
        if (!$r) json_response(['success' => false, 'message' => 'Not found.'], 404);
        $r['attachments'] = db_rows('SELECT * FROM accident_attachments WHERE AccidentID=? ORDER BY UploadedAt ASC', [$rp['id']]);
        json_response(['success' => true, 'data' => $r]);
    }
    if ($method === 'GET' && $path === '/accident/summary') {
        $year = (int)($_GET['year'] ?? date('Y')); $yf = ' AND YEAR(AccidentDate)=?'; $yp = [$year];
        $kpi = db_row("SELECT COUNT(*) AS total,COALESCE(SUM($statCond),0) AS recordable,COALESCE(SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END),0) AS lostDays,COALESCE(SUM(AccidentType='Near Miss'),0) AS nearMiss,COALESCE(SUM(AccidentType='Fatal'),0) AS fatal FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf", $yp);
        $trend = db_rows("SELECT MONTH(AccidentDate) AS mo,COUNT(*) AS total,SUM($statCond) AS recordable,SUM(AccidentType='Near Miss') AS nearMiss,SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf GROUP BY MONTH(AccidentDate) ORDER BY mo", $yp);
        $byType = db_rows("SELECT AccidentType,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf GROUP BY AccidentType ORDER BY cnt DESC", $yp);
        $byDept = db_rows("SELECT Department,COUNT(*) AS total,COALESCE(SUM($statCond),0) AS recordable,COALESCE(SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END),0) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf GROUP BY Department ORDER BY total DESC LIMIT 10", $yp);
        json_response(['success' => true, 'data' => ['kpi' => $kpi, 'daysSince' => null, 'trend' => $trend, 'byType' => $byType, 'byDept' => $byDept, 'recentReports' => db_rows("SELECT * FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0)$yf ORDER BY CreatedAt DESC,id DESC LIMIT 8", $yp), 'openActions' => db_rows("SELECT * FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND COALESCE(Status,'Open')<>'Closed'$yf ORDER BY DueDate ASC,id DESC LIMIT 8", $yp)]]);
    }
    if ($method === 'GET' && $path === '/accident/analytics') {
        $year = (int)($_GET['year'] ?? date('Y')); $yp = [$year];
        json_response(['success' => true, 'data' => [
            'deptRank' => db_rows("SELECT Department,COUNT(*) AS total,SUM($statCond) AS recordable,SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END) AS lostDays,SUM(AccidentType='Near Miss') AS nearMiss,SUM(AccidentType='Fatal') AS fatal,SUM(Severity='Critical') AS critical FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? GROUP BY Department ORDER BY total DESC LIMIT 10", $yp),
            'hotspot' => db_rows("SELECT COALESCE(Area,'(Unspecified)') AS area,COUNT(*) AS cnt,SUM($statCond) AS recordable,SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? GROUP BY Area ORDER BY cnt DESC LIMIT 8", $yp),
            'rootCauses' => db_rows("SELECT COALESCE(RootCause,'(Unspecified)') AS cause,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=? GROUP BY RootCause ORDER BY cnt DESC LIMIT 8", $yp),
            'nearMissTrend' => db_rows("SELECT MONTH(AccidentDate) AS mo,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND AccidentType='Near Miss' AND YEAR(AccidentDate)=? GROUP BY MONTH(AccidentDate) ORDER BY mo", $yp),
            'injuryTypeStats' => db_rows("SELECT COALESCE(NULLIF(InjuryType,''),'(Unspecified)') AS label,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND $statCond AND YEAR(AccidentDate)=? GROUP BY label ORDER BY cnt DESC LIMIT 10", $yp),
            'bodyPartStats' => db_rows("SELECT COALESCE(NULLIF(BodyPart,''),'(Unspecified)') AS label,COUNT(*) AS cnt FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND $statCond AND YEAR(AccidentDate)=? GROUP BY label ORDER BY cnt DESC LIMIT 10", $yp),
        ]]);
    }
    if (($method === 'POST' && $path === '/accident/reports') || ($rp !== null && $method === 'PUT')) {
        require_admin(); $files = p5_store_files('files', 10); $b = $_POST ?: json_body();
        try {
            $emp = db_row('SELECT Department,Position FROM employees WHERE EmployeeID=? LIMIT 1', [trim((string)($b['EmployeeID'] ?? ''))]);
            if (!$emp || !p5_date($b['ReportDate'] ?? null) || !p5_date($b['AccidentDate'] ?? null) || empty($b['AccidentType'])) json_response(['success' => false, 'message' => 'Invalid accident report payload.'], 400);
            $vals = [p5_date($b['ReportDate']), p5_date($b['AccidentDate']), trim((string)($b['AccidentTime'] ?? '')) ?: null, trim((string)$b['EmployeeID']), $emp['Department'] ?? null, $b['Area'] ?? null, $b['Location'] ?? null, $b['AccidentType'], $b['Severity'] ?? 'Minor', $b['Description'] ?? '', $b['RootCause'] ?? null, $b['RootCauseDetail'] ?? '', $b['ImmediateCause'] ?? null, $b['UnsafeAct'] ?? null, $b['UnsafeCondition'] ?? null, $b['CorrectiveAction'] ?? '', $b['PreventiveAction'] ?? null, p5_int($b['LostDays'] ?? 0), p5_bool($b['IsRecordable'] ?? 0), $b['Status'] ?? 'Open', $b['ReportedBy'] ?? p5_user_name($user), $b['InjuryType'] ?? null, $b['BodyPart'] ?? null, $b['MedicalTreatment'] ?? null, $b['Position'] ?? ($emp['Position'] ?? null), $b['EmploymentType'] ?? null, $b['ResponsiblePerson'] ?? null, p5_date($b['DueDate'] ?? null), null, $b['InvestigationStatus'] ?? (($b['Status'] ?? '') === 'Closed' ? 'Closed' : 'Reported'), $b['PotentialSeverity'] ?? null, $b['VerificationResult'] ?? null, $b['VerifiedBy'] ?? null, p5_date($b['VerifiedAt'] ?? null)];
            if ($method === 'POST') {
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
    if ($ap !== null && $method === 'DELETE') { require_admin(); $att = db_row('SELECT FileURL FROM accident_attachments WHERE id=?', [$ap['id']]); db_execute('DELETE FROM accident_attachments WHERE id=?', [$ap['id']]); if ($att) delete_uploaded_file($att['FileURL']); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/accident/monthly-reports') {
        $year = (int)($_GET['year'] ?? date('Y'));
        json_response(['success' => true, 'data' => accident_monthly_reports_for_year($year)]);
    }
    if ($method === 'POST' && $path === '/accident/monthly-reports') {
        require_admin();
        $files = p5_store_files('reportFile', 1);
        $b = $_POST ?: json_body();
        $year = (int)($b['Year'] ?? 0);
        $month = (int)($b['MonthNo'] ?? 0);
        if ($year < 2000 || $month < 1 || $month > 12) {
            p5_cleanup($files);
            json_response(['success' => false, 'message' => 'Invalid monthly report period.'], 400);
        }
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
            $monthlyStatus = [];
            if ($perf && !empty($perf['MonthlyStatus'])) {
                $decoded = json_decode((string)$perf['MonthlyStatus'], true);
                $monthlyStatus = is_array($decoded) ? $decoded : [];
            }
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
    if ($mr !== null && $method === 'DELETE') {
        require_admin();
        $row = db_row('SELECT Year,MonthNo,ReportFileUrl FROM accident_monthly_reports WHERE id=? LIMIT 1', [$mr['id']]);
        if (!$row) json_response(['success' => false, 'message' => 'Monthly report not found.'], 404);
        db_execute('DELETE FROM accident_monthly_reports WHERE id=?', [$mr['id']]);
        $perf = db_row('SELECT MonthlyStatus FROM accident_performance WHERE Year=? LIMIT 1', [(int)$row['Year']]);
        if ($perf && !empty($perf['MonthlyStatus'])) {
            $decoded = json_decode((string)$perf['MonthlyStatus'], true);
            if (is_array($decoded)) {
                unset($decoded[(string)$row['MonthNo']]);
                db_execute('UPDATE accident_performance SET MonthlyStatus=? WHERE Year=?', [json_encode($decoded, JSON_UNESCAPED_UNICODE), (int)$row['Year']]);
            }
        }
        delete_uploaded_file($row['ReportFileUrl'] ?? '');
        json_response(['success' => true]);
    }
    if ($method === 'GET' && $path === '/accident/performance') {
        $year = (int)($_GET['year'] ?? date('Y'));
        $row = db_row('SELECT * FROM accident_performance WHERE Year=?', [$year]) ?: ['Year' => $year, 'TotalHours' => 0, 'TotalDays' => 0, 'TargetHours' => 1000000, 'TargetDays' => 365, 'MonthlyStatus' => null, 'MonthlyManHours' => null, 'AnnualManHours' => 0, 'CumulativeManHours' => 0];
        $stats = db_row("SELECT COALESCE(SUM($statCond),0) AS statsTotal,COALESCE(SUM(CASE WHEN $statCond THEN LostDays ELSE 0 END),0) AS lostDays FROM accident_reports WHERE (IsDeleted IS NULL OR IsDeleted=0) AND YEAR(AccidentDate)=?", [$year]) ?: [];
        $annual = (float)($row['AnnualManHours'] ?: $row['TotalHours'] ?: 0); $count = (int)($stats['statsTotal'] ?? 0);
        $row['recordableCount'] = $count; $row['rates'] = ['annualManHours' => $annual, 'IFR' => $annual > 0 ? round($count * 1000000 / $annual, 3) : 0, 'TRIR' => $annual > 0 ? round($count * 200000 / $annual, 3) : 0, 'statCounts' => ['total' => $count]];
        $row['monthlyReports'] = accident_monthly_reports_for_year($year);
        json_response(['success' => true, 'data' => $row]);
    }
    if ($method === 'PUT' && $path === '/accident/performance') { require_admin(); $b = json_body(); $year = (int)($b['Year'] ?? 0); if ($year < 2000) json_response(['success' => false, 'message' => 'Invalid year.'], 400); db_execute('INSERT INTO accident_performance (Year,TotalHours,TotalDays,LastAccidentDate,TargetHours,TargetDays,MonthlyStatus,MonthlyManHours,AnnualManHours,CumulativeManHours,UpdatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE TotalHours=VALUES(TotalHours),TotalDays=VALUES(TotalDays),LastAccidentDate=VALUES(LastAccidentDate),TargetHours=VALUES(TargetHours),TargetDays=VALUES(TargetDays),MonthlyStatus=VALUES(MonthlyStatus),MonthlyManHours=VALUES(MonthlyManHours),AnnualManHours=VALUES(AnnualManHours),CumulativeManHours=VALUES(CumulativeManHours),UpdatedBy=VALUES(UpdatedBy)', [$year, p5_int($b['TotalHours'] ?? 0), p5_int($b['TotalDays'] ?? 0), p5_date($b['LastAccidentDate'] ?? null), p5_int($b['TargetHours'] ?? 1000000), p5_int($b['TargetDays'] ?? 365), isset($b['MonthlyStatus']) ? json_encode($b['MonthlyStatus'], JSON_UNESCAPED_UNICODE) : null, isset($b['MonthlyManHours']) ? json_encode($b['MonthlyManHours'], JSON_UNESCAPED_UNICODE) : null, (float)($b['AnnualManHours'] ?? 0), (float)($b['CumulativeManHours'] ?? 0), p5_user_name($user)]); json_response(['success' => true]); }
    if ($method === 'GET' && $path === '/accident/employees') { $q = '%' . trim((string)($_GET['q'] ?? '')) . '%'; json_response(['success' => true, 'data' => db_rows('SELECT EmployeeID,EmployeeName,Department,Team,Position FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? ORDER BY EmployeeName LIMIT 50', [$q, $q])]); }
    return false;
}

function ensure_machine_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety (id INT AUTO_INCREMENT PRIMARY KEY,MachineCode VARCHAR(50) NOT NULL,MachineName VARCHAR(255) NOT NULL,Department VARCHAR(100),Area VARCHAR(100),HasRiskAssessment TINYINT(1) DEFAULT 0,Remark TEXT,Status VARCHAR(20) NOT NULL DEFAULT 'active',RiskLevel VARCHAR(20) NOT NULL DEFAULT 'low',NextInspectionDate DATE NULL,CreatedBy VARCHAR(100),UpdatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_code(MachineCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety_files (id INT AUTO_INCREMENT PRIMARY KEY,MachineID INT NOT NULL,FileCategory VARCHAR(50) NOT NULL DEFAULT 'SafetyDeviceStandard',FileLabel VARCHAR(255),FileUrl TEXT,UploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UploadedBy VARCHAR(100),KEY idx_machine(MachineID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety_compliance (id INT AUTO_INCREMENT PRIMARY KEY,MachineID INT NOT NULL,ItemCode VARCHAR(10) NOT NULL,Status VARCHAR(20) NOT NULL DEFAULT 'na',UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UpdatedBy VARCHAR(100),UNIQUE KEY uq_machine_item(MachineID,ItemCode)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS machine_safety_issues (id INT AUTO_INCREMENT PRIMARY KEY,MachineID INT NOT NULL,Description TEXT NOT NULL,Severity VARCHAR(20) NOT NULL DEFAULT 'medium',Status VARCHAR(20) NOT NULL DEFAULT 'open',Resolution TEXT,CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,CreatedBy VARCHAR(100),ResolvedAt TIMESTAMP NULL DEFAULT NULL,ResolvedBy VARCHAR(100),KEY idx_machine(MachineID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function handle_machine_safety_routes(string $method, string $path): bool
{
    if (strpos($path, '/machine-safety') !== 0) return false;
    $user = require_user(); ensure_machine_tables();
    if ($method === 'GET' && $path === '/machine-safety') json_response(['success' => true, 'data' => db_rows("SELECT m.*,(SELECT COUNT(*) FROM machine_safety_files f WHERE f.MachineID=m.id AND f.FileCategory='SafetyDeviceStandard') AS SafetyDeviceCount,(SELECT COUNT(*) FROM machine_safety_files f WHERE f.MachineID=m.id AND f.FileCategory='LayoutCheckpoint') AS LayoutCheckpointCount,(SELECT COUNT(*) FROM machine_safety_compliance c WHERE c.MachineID=m.id AND c.Status='pass') AS CompliancePassCount,(SELECT COUNT(*) FROM machine_safety_compliance c WHERE c.MachineID=m.id AND c.Status!='na') AS ComplianceCheckedCount,(SELECT COUNT(*) FROM machine_safety_issues i WHERE i.MachineID=m.id AND i.Status='open') AS OpenIssueCount FROM machine_safety m ORDER BY m.MachineName")]);
    if ($method === 'POST' && $path === '/machine-safety') { require_admin(); $b = json_body(); if (empty($b['MachineCode']) || empty($b['MachineName'])) json_response(['success' => false, 'message' => 'MachineCode and MachineName are required.'], 400); db_execute('INSERT INTO machine_safety (MachineCode,MachineName,Department,Area,HasRiskAssessment,Remark,Status,RiskLevel,NextInspectionDate,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?)', [$b['MachineCode'], $b['MachineName'], $b['Department'] ?? null, $b['Area'] ?? null, p5_bool($b['HasRiskAssessment'] ?? 0), $b['Remark'] ?? null, $b['Status'] ?? 'active', $b['RiskLevel'] ?? 'low', p5_date($b['NextInspectionDate'] ?? null), p5_user_name($user)]); json_response(['success' => true, 'id' => (int)db()->lastInsertId()]); }
    $p = route_params($path, '/machine-safety/files/:fileId');
    if ($p !== null && $method === 'DELETE') { require_admin(); $f = db_row('SELECT FileUrl FROM machine_safety_files WHERE id=?', [$p['fileId']]); db_execute('DELETE FROM machine_safety_files WHERE id=?', [$p['fileId']]); if ($f) delete_uploaded_file($f['FileUrl']); json_response(['success' => true]); }
    $p = route_params($path, '/machine-safety/issues/:issueId');
    if ($p !== null && $method === 'PUT') { require_admin(); $b = json_body(); $status = in_array(($b['Status'] ?? ''), ['open', 'resolved'], true) ? $b['Status'] : 'open'; db_execute('UPDATE machine_safety_issues SET Status=?,Resolution=?,ResolvedAt=?,ResolvedBy=? WHERE id=?', [$status, $b['Resolution'] ?? null, $status === 'resolved' ? date('Y-m-d H:i:s') : null, $status === 'resolved' ? p5_user_name($user) : null, $p['issueId']]); json_response(['success' => true]); }
    if ($p !== null && $method === 'DELETE') { require_admin(); db_execute('DELETE FROM machine_safety_issues WHERE id=?', [$p['issueId']]); json_response(['success' => true]); }
    $p = route_params($path, '/machine-safety/:id/files');
    if ($p !== null && $method === 'GET') json_response(['success' => true, 'data' => db_rows('SELECT * FROM machine_safety_files WHERE MachineID=? ORDER BY FileCategory,UploadedAt DESC', [$p['id']])]);
    if ($p !== null && $method === 'POST') { require_admin(); $files = p5_store_files('file', 1); if (!$files) json_response(['success' => false, 'message' => 'No file uploaded.'], 400); $b = $_POST; $f = $files[0]; db_execute('INSERT INTO machine_safety_files (MachineID,FileCategory,FileLabel,FileUrl,UploadedBy) VALUES (?,?,?,?,?)', [$p['id'], $b['FileCategory'] ?? 'SafetyDeviceStandard', $b['FileLabel'] ?? $f['name'], $f['url'], p5_user_name($user)]); json_response(['success' => true]); }
    $p = route_params($path, '/machine-safety/:id/links');
    if ($p !== null && $method === 'POST') { require_admin(); $b = json_body(); if (empty($b['FileUrl'])) json_response(['success' => false, 'message' => 'FileUrl is required.'], 400); db_execute('INSERT INTO machine_safety_files (MachineID,FileCategory,FileLabel,FileUrl,UploadedBy) VALUES (?,?,?,?,?)', [$p['id'], $b['FileCategory'] ?? 'SafetyDeviceStandard', $b['FileLabel'] ?? $b['FileUrl'], $b['FileUrl'], p5_user_name($user)]); json_response(['success' => true]); }
    $p = route_params($path, '/machine-safety/:id/compliance');
    if ($p !== null && $method === 'GET') { $rows = db_rows('SELECT ItemCode,Status,UpdatedAt,UpdatedBy FROM machine_safety_compliance WHERE MachineID=? ORDER BY ItemCode', [$p['id']]); $map=[]; foreach($rows as $r)$map[$r['ItemCode']]=$r; $out=[]; foreach(['5.1','5.2','5.3','5.4','5.5','5.6','5.7','5.8'] as $c)$out[]=$map[$c]??['ItemCode'=>$c,'Status'=>'na','UpdatedAt'=>null,'UpdatedBy'=>null]; json_response(['success'=>true,'data'=>$out]); }
    if ($p !== null && $method === 'PUT') { require_admin(); $b=json_body(); foreach(($b['items']??[]) as $it) db_execute('INSERT INTO machine_safety_compliance (MachineID,ItemCode,Status,UpdatedBy) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE Status=VALUES(Status),UpdatedBy=VALUES(UpdatedBy)', [$p['id'],$it['ItemCode'],$it['Status']??'na',p5_user_name($user)]); json_response(['success'=>true]); }
    $p = route_params($path, '/machine-safety/:id/issues');
    if ($p !== null && $method === 'GET') json_response(['success'=>true,'data'=>db_rows('SELECT * FROM machine_safety_issues WHERE MachineID=? ORDER BY CreatedAt DESC',[$p['id']])]);
    if ($p !== null && $method === 'POST') { require_admin(); $b=json_body(); if(empty($b['Description'])) json_response(['success'=>false,'message'=>'Description is required.'],400); db_execute('INSERT INTO machine_safety_issues (MachineID,Description,Severity,CreatedBy) VALUES (?,?,?,?)',[$p['id'],$b['Description'],$b['Severity']??'medium',p5_user_name($user)]); json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]); }
    $p = route_params($path, '/machine-safety/:id');
    if ($p !== null && $method === 'PUT') { require_admin(); $b=json_body(); db_execute('UPDATE machine_safety SET MachineCode=?,MachineName=?,Department=?,Area=?,HasRiskAssessment=?,Remark=?,Status=?,RiskLevel=?,NextInspectionDate=?,UpdatedBy=? WHERE id=?',[$b['MachineCode'],$b['MachineName'],$b['Department']??null,$b['Area']??null,p5_bool($b['HasRiskAssessment']??0),$b['Remark']??null,$b['Status']??'active',$b['RiskLevel']??'low',p5_date($b['NextInspectionDate']??null),p5_user_name($user),$p['id']]); json_response(['success'=>true]); }
    if ($p !== null && $method === 'DELETE') { require_admin(); foreach(db_rows('SELECT FileUrl FROM machine_safety_files WHERE MachineID=?',[$p['id']]) as $f) delete_uploaded_file($f['FileUrl']); db_execute('DELETE FROM machine_safety_compliance WHERE MachineID=?',[$p['id']]); db_execute('DELETE FROM machine_safety_issues WHERE MachineID=?',[$p['id']]); db_execute('DELETE FROM machine_safety_files WHERE MachineID=?',[$p['id']]); db_execute('DELETE FROM machine_safety WHERE id=?',[$p['id']]); json_response(['success'=>true]); }
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
    db()->exec("CREATE TABLE IF NOT EXISTS sc_assessment_points (PointID VARCHAR(36) PRIMARY KEY,AssessmentID VARCHAR(36) NOT NULL,PointNo TINYINT NOT NULL,TopicKey VARCHAR(10) NOT NULL,TotalPeople INT DEFAULT 0,ComplyPeople INT DEFAULT 0,Pct DECIMAL(5,2),KEY idx_assessment(AssessmentID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_items (ItemID VARCHAR(36) PRIMARY KEY,ItemName VARCHAR(100) NOT NULL,Description TEXT,ImageUrl TEXT,SortOrder INT DEFAULT 99,IsActive TINYINT(1) DEFAULT 1,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    if ((int)(safe_scalar('SELECT COUNT(*) FROM sc_ppe_items') ?? 0) === 0) foreach(['Safety Helmet','Safety Glasses','Gloves','Safety Shoes','Face Shield','Ear Plug'] as $i=>$n) db_execute('INSERT INTO sc_ppe_items (ItemID,ItemName,SortOrder) VALUES (?,?,?)',[p5_uuid(),$n,$i+1]);
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_worktypes (WorkTypeID VARCHAR(36) PRIMARY KEY,Name VARCHAR(100) NOT NULL,Description TEXT,SortOrder INT DEFAULT 99,IsActive TINYINT(1) DEFAULT 1,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_worktype_items (ID INT AUTO_INCREMENT PRIMARY KEY,WorkTypeID VARCHAR(36) NOT NULL,ItemID VARCHAR(36) NOT NULL,UNIQUE KEY uq_wt_item(WorkTypeID,ItemID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppeinspections (InspectionID VARCHAR(36) PRIMARY KEY,InspectionDate DATE NOT NULL,Area VARCHAR(100),Department VARCHAR(100),InspectorID VARCHAR(50),InspectorName VARCHAR(100),WorkTypeID VARCHAR(36),WorkTypeName VARCHAR(100),WorkTypeSnapshot TEXT,InspectedEmployeeID VARCHAR(50),InspectedEmployeeName VARCHAR(100),IsPass TINYINT(1),IsUnregistered TINYINT(1) DEFAULT 0,TotalItems INT DEFAULT 0,CompliantItems INT DEFAULT 0,CompliancePct DECIMAL(5,2),Notes TEXT,ImageUrl TEXT,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME NULL,KEY idx_date(InspectionDate),KEY idx_dept(Department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_inspection_details (DetailID VARCHAR(36) PRIMARY KEY,InspectionID VARCHAR(36) NOT NULL,ItemID VARCHAR(36) NOT NULL,Status VARCHAR(20),KEY idx_insp(InspectionID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sc_ppe_violations (ViolationID VARCHAR(36) PRIMARY KEY,EmployeeID VARCHAR(50) NOT NULL,EmployeeName VARCHAR(100),Department VARCHAR(100),InspectionID VARCHAR(36),ViolationNo INT DEFAULT 1,WarningLevel VARCHAR(30) DEFAULT 'verbal',InspectorID VARCHAR(50),InspectorName VARCHAR(100),Note TEXT,ViolationDate DATE NOT NULL,CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME NULL,KEY idx_emp(EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function sc_score($v) { if ($v === '' || $v === null) return null; $n=(float)$v; if($n<0||$n>100) json_response(['success'=>false,'message'=>'Score must be 0-100.'],400); return round($n,2); }

function handle_safety_culture_routes(string $method, string $path): bool
{
    if (strpos($path, '/safety-culture') !== 0) return false;
    $user=require_user(); ensure_safety_culture_tables();
    if($method==='GET'&&$path==='/safety-culture/principles') json_response(['success'=>true,'data'=>db_rows('SELECT * FROM sc_principles ORDER BY SortOrder')]);
    $p=route_params($path,'/safety-culture/principles/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();if(!empty($b['IsFeatured']))db_execute('UPDATE sc_principles SET IsFeatured=0');db_execute('UPDATE sc_principles SET Title=?,Description=?,ImageUrl=?,AttachmentUrl=?,AttachmentName=?,IsFeatured=? WHERE PrincipleID=?',[$b['Title'],$b['Description']??null,$b['ImageUrl']??null,$b['AttachmentUrl']??null,$b['AttachmentName']??null,p5_bool($b['IsFeatured']??0),$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/assessments'){ $sql='SELECT * FROM sc_assessments';$pa=[];if(!empty($_GET['year'])){$sql.=' WHERE AssessmentYear=?';$pa[]=(int)$_GET['year'];}$rows=db_rows($sql.' ORDER BY COALESCE(AssessmentDate,MAKEDATE(AssessmentYear,1)) DESC,WeekNo DESC,CreatedAt DESC',$pa);foreach($rows as &$r){$r['points']=db_rows('SELECT * FROM sc_assessment_points WHERE AssessmentID=? ORDER BY TopicKey,PointNo',[$r['AssessmentID']]);$r['topicAreas']=json_decode((string)($r['TopicAreas']??'{}'),true)?:[];unset($r['TopicAreas']);}unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if(($method==='POST'&&$path==='/safety-culture/assessments')||(($p=route_params($path,'/safety-culture/assessments/:id'))!==null&&$method==='PUT')){require_admin();$b=json_body();$id=$method==='POST'?p5_uuid():$p['id'];$date=p5_date($b['AssessmentDate']??null);$year=$date?(int)substr($date,0,4):(int)($b['AssessmentYear']??date('Y'));$topicAreas=isset($b['topicAreas'])?json_encode($b['topicAreas'],JSON_UNESCAPED_UNICODE):null;$vals=[$year,$date,(int)($b['WeekNo']??0)?:null,$b['Area']??'ทั้งหมด',sc_score($b['T1_Score']??null),sc_score($b['T2_Score']??null),sc_score($b['T3_Score']??null),sc_score($b['T4_Score']??null),sc_score($b['T5_Score']??null),sc_score($b['T7_Score']??null),$b['Notes']??null,$topicAreas]; if($method==='POST')db_execute('INSERT INTO sc_assessments (AssessmentID,AssessmentYear,AssessmentDate,WeekNo,Area,T1_Score,T2_Score,T3_Score,T4_Score,T5_Score,T7_Score,Notes,CreatedBy,TopicAreas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',array_merge([$id],array_slice($vals,0,11),[p5_user_name($user),$topicAreas])); else {db_execute('UPDATE sc_assessments SET AssessmentYear=?,AssessmentDate=?,WeekNo=?,Area=?,T1_Score=?,T2_Score=?,T3_Score=?,T4_Score=?,T5_Score=?,T7_Score=?,Notes=?,TopicAreas=? WHERE AssessmentID=?',array_merge($vals,[$id]));db_execute('DELETE FROM sc_assessment_points WHERE AssessmentID=?',[$id]);} foreach(($b['points']??[]) as $pt)db_execute('INSERT INTO sc_assessment_points (PointID,AssessmentID,PointNo,TopicKey,TotalPeople,ComplyPeople,Pct) VALUES (?,?,?,?,?,?,?)',[p5_uuid(),$id,(int)$pt['PointNo'],$pt['TopicKey'],(int)$pt['TotalPeople'],(int)$pt['ComplyPeople'],isset($pt['Pct'])?$pt['Pct']:null]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/safety-culture/assessments/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM sc_assessment_points WHERE AssessmentID=?',[$p['id']]);db_execute('DELETE FROM sc_assessments WHERE AssessmentID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-items')json_response(['success'=>true,'data'=>db_rows('SELECT * FROM sc_ppe_items WHERE IsActive=1 ORDER BY SortOrder,CreatedAt')]);
    if($method==='POST'&&$path==='/safety-culture/ppe-items'){require_admin();$b=json_body();$id=p5_uuid();db_execute('INSERT INTO sc_ppe_items (ItemID,ItemName,Description,ImageUrl,SortOrder) VALUES (?,?,?,?,?)',[$id,$b['ItemName'],$b['Description']??null,$b['ImageUrl']??null,(int)($b['SortOrder']??99)]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/safety-culture/ppe-items/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE sc_ppe_items SET ItemName=?,Description=?,ImageUrl=?,SortOrder=? WHERE ItemID=?',[$b['ItemName'],$b['Description']??null,$b['ImageUrl']??null,(int)($b['SortOrder']??99),$p['id']]);json_response(['success'=>true]);} if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppe_items SET IsActive=0 WHERE ItemID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-work-types'){ $w=db_rows('SELECT * FROM sc_ppe_worktypes WHERE IsActive=1 ORDER BY SortOrder,Name');foreach($w as &$r)$r['items']=db_rows('SELECT wi.WorkTypeID,wi.ItemID,pi.ItemName,pi.Description,pi.ImageUrl,pi.SortOrder FROM sc_ppe_worktype_items wi JOIN sc_ppe_items pi ON pi.ItemID=wi.ItemID WHERE wi.WorkTypeID=? ORDER BY pi.SortOrder',[$r['WorkTypeID']]);unset($r);json_response(['success'=>true,'data'=>$w]);}
    if($method==='POST'&&$path==='/safety-culture/ppe-work-types'){require_admin();$b=json_body();$id=p5_uuid();db_execute('INSERT INTO sc_ppe_worktypes (WorkTypeID,Name,Description,SortOrder) VALUES (?,?,?,?)',[$id,$b['Name'],$b['Description']??null,(int)($b['SortOrder']??99)]);foreach(($b['ItemIDs']??[]) as $it)db_execute('INSERT IGNORE INTO sc_ppe_worktype_items (WorkTypeID,ItemID) VALUES (?,?)',[$id,$it]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/safety-culture/ppe-work-types/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE sc_ppe_worktypes SET Name=?,Description=?,SortOrder=? WHERE WorkTypeID=?',[$b['Name'],$b['Description']??null,(int)($b['SortOrder']??99),$p['id']]);db_execute('DELETE FROM sc_ppe_worktype_items WHERE WorkTypeID=?',[$p['id']]);foreach(($b['ItemIDs']??[]) as $it)db_execute('INSERT IGNORE INTO sc_ppe_worktype_items (WorkTypeID,ItemID) VALUES (?,?)',[$p['id'],$it]);json_response(['success'=>true]);} if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppe_worktypes SET IsActive=0 WHERE WorkTypeID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-violations/summary')json_response(['success'=>true,'data'=>db_rows('SELECT WarningLevel,COUNT(*) AS cnt FROM sc_ppe_violations WHERE deleted_at IS NULL GROUP BY WarningLevel')]);
    if($method==='GET'&&$path==='/safety-culture/ppe-violations'){require_admin();$sql='SELECT * FROM sc_ppe_violations WHERE deleted_at IS NULL';$pa=[];if(!empty($_GET['year'])){$sql.=' AND YEAR(ViolationDate)=?';$pa[]=(int)$_GET['year'];}json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY ViolationDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='POST'&&$path==='/safety-culture/ppe-violations'){require_admin();$b=json_body();$id=p5_uuid();db_execute('INSERT INTO sc_ppe_violations (ViolationID,EmployeeID,EmployeeName,Department,InspectionID,ViolationNo,WarningLevel,InspectorID,InspectorName,Note,ViolationDate) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$id,$b['EmployeeID'],$b['EmployeeName']??null,$b['Department']??null,$b['InspectionID']??null,(int)($b['ViolationNo']??1),$b['WarningLevel']??'verbal',$user['id']??'',p5_user_name($user),$b['Note']??null,p5_date($b['ViolationDate']??date('Y-m-d'))]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/safety-culture/ppe-violations/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppe_violations SET deleted_at=NOW() WHERE ViolationID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/ppe-inspections'){ $sql='SELECT * FROM sc_ppeinspections WHERE deleted_at IS NULL';$pa=[];if(!empty($_GET['year'])){$sql.=' AND YEAR(InspectionDate)=?';$pa[]=(int)$_GET['year'];}if(!empty($_GET['department'])){$sql.=' AND Department=?';$pa[]=$_GET['department'];}$rows=db_rows($sql.' ORDER BY InspectionDate DESC',$pa);foreach($rows as &$r)$r['details']=db_rows('SELECT d.*,i.ItemName,i.SortOrder FROM sc_ppe_inspection_details d JOIN sc_ppe_items i ON i.ItemID=d.ItemID WHERE d.InspectionID=? ORDER BY i.SortOrder',[$r['InspectionID']]);unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if($method==='POST'&&$path==='/safety-culture/ppe-inspections'){require_admin();$b=json_body();$id=p5_uuid();$items=$b['items']??[];$total=0;$ok=0;foreach($items as $it){if(($it['Status']??'')==='compliant'||($it['Status']??'')==='non-compliant'){$total++;if($it['Status']==='compliant')$ok++;}}$pct=$total?round($ok*100/$total,2):0;$pass=$total>0&&$ok===$total?1:0;db_execute('INSERT INTO sc_ppeinspections (InspectionID,InspectionDate,Area,Department,InspectorID,InspectorName,WorkTypeID,WorkTypeName,InspectedEmployeeID,InspectedEmployeeName,IsPass,IsUnregistered,TotalItems,CompliantItems,CompliancePct,Notes,ImageUrl) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,p5_date($b['InspectionDate']??null),$b['Area']??null,$b['Department']??null,$b['InspectorID']??($user['id']??''),$b['InspectorName']??p5_user_name($user),$b['WorkTypeID']??null,$b['WorkTypeName']??null,$b['InspectedEmployeeID']??null,$b['InspectedEmployeeName']??null,$pass,empty($b['InspectedEmployeeID'])?1:0,$total,$ok,$pct,$b['Notes']??null,$b['ImageUrl']??null]);foreach($items as $it)db_execute('INSERT INTO sc_ppe_inspection_details (DetailID,InspectionID,ItemID,Status) VALUES (?,?,?,?)',[p5_uuid(),$id,$it['ItemID'],$it['Status']]);json_response(['success'=>true,'id'=>$id,'isPass'=>$pass]);}
    $p=route_params($path,'/safety-culture/ppe-inspections/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE sc_ppeinspections SET Notes=? WHERE InspectionID=? AND deleted_at IS NULL',[isset($b['Notes'])?mb_substr((string)$b['Notes'],0,1000):null,$p['id']]);json_response(['success'=>true]);} if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE sc_ppeinspections SET deleted_at=NOW() WHERE InspectionID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/safety-culture/dashboard'){ $year=(int)($_GET['year']??date('Y')); json_response(['success'=>true,'data'=>['avgScores'=>db_row('SELECT AVG(T1_Score) AS avg_t1,AVG(T2_Score) AS avg_t2,AVG(T3_Score) AS avg_t3,AVG(T4_Score) AS avg_t4,AVG(T5_Score) AS avg_t5,AVG(T7_Score) AS avg_t7 FROM sc_assessments WHERE AssessmentYear=?',[$year]),'ppeStats'=>[['overall_pct'=>safe_scalar('SELECT AVG(CompliancePct) FROM sc_ppeinspections WHERE deleted_at IS NULL AND YEAR(InspectionDate)=?',[$year]),'itemBreakdown'=>db_rows("SELECT pi.ItemID,pi.ItemName,pi.SortOrder,SUM(CASE WHEN d.Status='compliant' THEN 1 ELSE 0 END) AS ok_count,COUNT(*) AS total_count FROM sc_ppe_inspection_details d JOIN sc_ppe_items pi ON pi.ItemID=d.ItemID JOIN sc_ppeinspections ins ON ins.InspectionID=d.InspectionID WHERE ins.deleted_at IS NULL AND YEAR(ins.InspectionDate)=? AND d.Status!='na' GROUP BY pi.ItemID,pi.ItemName,pi.SortOrder ORDER BY pi.SortOrder",[$year])]],'yearTrend'=>db_rows('SELECT AssessmentYear,AVG((COALESCE(T1_Score,0)+COALESCE(T2_Score,0)+COALESCE(T3_Score,0)+COALESCE(T4_Score,0)+COALESCE(T5_Score,0)+COALESCE(T7_Score,0))/NULLIF((T1_Score IS NOT NULL)+(T2_Score IS NOT NULL)+(T3_Score IS NOT NULL)+(T4_Score IS NOT NULL)+(T5_Score IS NOT NULL)+(T7_Score IS NOT NULL),0)) AS avg_score FROM sc_assessments GROUP BY AssessmentYear ORDER BY AssessmentYear')]]); }
    return false;
}
