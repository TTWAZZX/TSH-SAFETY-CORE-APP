<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/cccf_worker_progress.php';
require_once __DIR__ . '/../lib/yokoten_admin_scope.php';

function wf_user_name(array $user): string
{
    return trim((string)($user['name'] ?? $user['EmployeeName'] ?? $user['id'] ?? 'System')) ?: 'System';
}

function wf_user_id(array $user): string
{
    return trim((string)($user['id'] ?? $user['EmployeeID'] ?? $user['employeeId'] ?? '')) ?: 'unknown';
}

function wf_is_admin(array $user): bool
{
    return strcasecmp((string)($user['role'] ?? $user['Role'] ?? ''), 'Admin') === 0;
}

function wf_date($value): ?string
{
    return function_exists('p5_date') ? p5_date($value) : null;
}

function wf_bool($value): int
{
    if (function_exists('p5_bool')) return p5_bool($value);
    return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
}

function wf_uuid(): string
{
    return function_exists('p5_uuid') ? p5_uuid() : bin2hex(random_bytes(16));
}

function wf_json($value, array $fallback = []): array
{
    if (is_array($value)) return $value;
    $decoded = json_decode((string)$value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function wf_put_multipart(): array
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
        if (trim((string)$fileMatch[1]) === '') {
            continue;
        }
        $tmp = tempnam(sys_get_temp_dir(), 'wf6-');
        file_put_contents($tmp, $value);
        $mime = 'application/octet-stream';
        if (preg_match('/Content-Type:\s*([^\r\n]+)/i', $head, $typeMatch)) $mime = trim($typeMatch[1]);
        $parsed['files'][$name] = [
            'name' => $fileMatch[1],
            'type' => $mime,
            'tmp_name' => $tmp,
            'error' => UPLOAD_ERR_OK,
            'size' => filesize($tmp) ?: 0,
            'local_tmp' => true,
        ];
    }
    return $parsed;
}

function wf_body(): array
{
    $put = wf_put_multipart();
    return $_POST ?: ($put['fields'] ?: json_body());
}

function wf_text($value, int $max = 1000): ?string
{
    $v = trim((string)($value ?? ''));
    return $v === '' ? null : mb_substr($v, 0, $max);
}

function wf_email_outbox(string $table, array $cols, bool $attemptImmediate = true): void
{
    try {
        db_execute(
            "INSERT INTO {$table} (" . implode(',', array_keys($cols)) . ") VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ")",
            array_values($cols)
        );
        $id = (int) db()->lastInsertId();
        if ($attemptImmediate) {
            $recipientColumn = array_key_exists('Recipient', $cols) ? 'Recipient' : 'Recipients';
            mailer_outbox_best_effort($table, $id, $recipientColumn, array_key_exists('HtmlBody', $cols) ? 'HtmlBody' : null);
        }
    } catch (Throwable $e) {
        // Email delivery is best-effort; never fail the user workflow.
    }
}

function wf_store_files(string $field, int $max = 20, int $maxBytes = 20971520): array
{
    $put = wf_put_multipart();
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
        'application/vnd.ms-powerpoint' => ['ppt'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['pptx'],
        'text/plain' => ['txt'], 'text/csv' => ['csv'],
        'video/mp4' => ['mp4'], 'video/quicktime' => ['mov'], 'video/webm' => ['webm'], 'video/x-msvideo' => ['avi'],
        'video/x-matroska' => ['mkv'], 'video/mpeg' => ['mpeg', 'mpg'],
    ];

    $stored = [];
    foreach ($files as $file) {
        if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
        if ((int)($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) json_response(['success' => false, 'message' => 'Upload failed.'], 400);
        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > $maxBytes) json_response(['success' => false, 'message' => 'Uploaded file is too large.'], 400);
        $tmp = (string)($file['tmp_name'] ?? '');
        $info = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
        $mime = $info ? (string)finfo_file($info, $tmp) : (string)($file['type'] ?? '');
        if ($info) finfo_close($info);
        $ext = strtolower(pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION));
        if (!isset($allowed[$mime]) || !in_array($ext, $allowed[$mime], true)) {
            json_response(['success' => false, 'message' => 'Unsupported file type: ' . $mime], 400);
        }
        $storedName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
        $target = upload_dir() . DIRECTORY_SEPARATOR . $storedName;
        $moved = !empty($file['local_tmp']) ? rename($tmp, $target) : move_uploaded_file($tmp, $target);
        if (!$moved) json_response(['success' => false, 'message' => 'Cannot store uploaded file.'], 500);
        if (!empty($file['local_tmp'])) @chmod($target, 0644);
        $stored[] = [
            'url' => upload_public_url($storedName, (string)$file['name']),
            'name' => clean_upload_name($file['name'] ?? $storedName),
            'stored' => $storedName,
            'type' => $mime,
            'ext' => $ext,
            'size' => $size,
        ];
    }
    return $stored;
}

function wf_cleanup_files(array $files): void
{
    foreach ($files as $f) delete_uploaded_file($f['url'] ?? null);
}

function wf_store_worker_images(): array
{
    $files = wf_store_files('WorkerImages', 3, 5 * 1024 * 1024);
    $allowed = ['image/jpeg', 'image/png', 'image/webp'];
    foreach ($files as $file) {
        if (!in_array((string)($file['type'] ?? ''), $allowed, true)) {
            wf_cleanup_files($files);
            json_response(['success' => false, 'message' => 'รองรับเฉพาะไฟล์ JPG, PNG และ WebP'], 400);
        }
    }
    return $files;
}

function wf_try_exec(string $sql): void
{
    try {
        db()->exec($sql);
    } catch (Throwable $e) {
        // Idempotent schema compatibility: column/index may already exist.
    }
}

function wf_ensure_cccf_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_activity (id INT AUTO_INCREMENT PRIMARY KEY,ActivityDate DATE NOT NULL,Area VARCHAR(255),Department VARCHAR(100),Description TEXT,Outcome TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_forma_worker (id INT AUTO_INCREMENT PRIMARY KEY,EmployeeName VARCHAR(100),EmployeeID VARCHAR(50),Department VARCHAR(100),SafetyUnit VARCHAR(100) NOT NULL DEFAULT '',SubmitDate DATE NOT NULL,JobArea VARCHAR(255),Equipment VARCHAR(255),HazardDescription TEXT,HowItHappened TEXT,BodyPart VARCHAR(255),Suggestion TEXT,StopType INT,`Rank` VARCHAR(10),CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_forma_permanent (id INT AUTO_INCREMENT PRIMARY KEY,SubmitterName VARCHAR(100),Department VARCHAR(100),JobArea VARCHAR(255),SubmitDate DATE NOT NULL,Summary TEXT,StopType INT,`Rank` VARCHAR(10),FileUrl TEXT,ExcelFileUrl TEXT,SignedFileUrl TEXT,SignedUploadedAt DATETIME,AssigneeID VARCHAR(50),DocumentMode VARCHAR(30) NOT NULL DEFAULT 'legacy',ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'Completed',ReviewComment TEXT,ReviewedBy VARCHAR(100),ReviewedAt DATETIME,CompletedBy VARCHAR(100),CompletedAt DATETIME,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_worker_attachments (id INT AUTO_INCREMENT PRIMARY KEY,WorkerRecordID INT NOT NULL,OriginalName VARCHAR(255) NOT NULL,StoredName VARCHAR(255) NOT NULL,FileUrl TEXT NOT NULL,MimeType VARCHAR(100) NOT NULL,FileSize INT NOT NULL DEFAULT 0,UploadedBy VARCHAR(100),CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,IsDeleted TINYINT(1) NOT NULL DEFAULT 0,DeletedBy VARCHAR(100),DeletedAt DATETIME,KEY idx_cccf_worker_attachment_record(WorkerRecordID,IsDeleted)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_permanent_sequences (PermanentYear SMALLINT UNSIGNED PRIMARY KEY,LastSeq INT UNSIGNED NOT NULL DEFAULT 0,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_assignments (id INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50),AssigneeName VARCHAR(100) NOT NULL,Department VARCHAR(100),AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0,DueDate DATE,Note TEXT,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_cccf_emp(EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_unit_targets (id INT AUTO_INCREMENT PRIMARY KEY,unit_name VARCHAR(200) NOT NULL,target_year INT NOT NULL DEFAULT 2026,yearly_target INT NOT NULL DEFAULT 1,achieved_override INT DEFAULT NULL,UpdatedBy VARCHAR(100),UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_unit_year(unit_name,target_year)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS cccf_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,PermanentID INT DEFAULT NULL,EventType VARCHAR(80) NOT NULL DEFAULT 'General',Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,SentAt DATETIME DEFAULT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_status(Status),KEY idx_perm(PermanentID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    wf_try_exec("ALTER TABLE cccf_forma_worker ADD COLUMN SafetyUnit VARCHAR(100) NOT NULL DEFAULT '' AFTER Department");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN StopType INT DEFAULT NULL AFTER Summary");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN `Rank` VARCHAR(10) DEFAULT NULL AFTER StopType");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN DocumentMode VARCHAR(30) NOT NULL DEFAULT 'legacy' AFTER AssigneeID");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'Completed' AFTER DocumentMode");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewComment TEXT DEFAULT NULL AFTER ReviewStatus");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewedBy VARCHAR(100) DEFAULT NULL AFTER ReviewComment");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ReviewedAt DATETIME DEFAULT NULL AFTER ReviewedBy");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN ExcelFileUrl TEXT DEFAULT NULL AFTER FileUrl");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN SignedFileUrl TEXT DEFAULT NULL AFTER ExcelFileUrl");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN SignedUploadedAt DATETIME DEFAULT NULL AFTER SignedFileUrl");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN CompletedBy VARCHAR(100) DEFAULT NULL AFTER ReviewedAt");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN CompletedAt DATETIME DEFAULT NULL AFTER CompletedBy");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN PermanentYear SMALLINT UNSIGNED DEFAULT NULL AFTER id");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN PermanentSeq INT UNSIGNED DEFAULT NULL AFTER PermanentYear");
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD COLUMN PermanentNo VARCHAR(30) DEFAULT NULL AFTER PermanentSeq");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN EmployeeID VARCHAR(50) DEFAULT NULL AFTER id");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0 AFTER Department");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN DueDate DATE DEFAULT NULL AFTER AllowDirectSignedPdf");
    wf_try_exec("ALTER TABLE cccf_assignments ADD COLUMN Note TEXT DEFAULT NULL AFTER DueDate");
    wf_cccf_backfill_permanent_numbers();
    wf_try_exec("ALTER TABLE cccf_forma_permanent ADD UNIQUE KEY uq_cccf_permanent_year_seq (PermanentYear,PermanentSeq)");
}

function wf_cccf_permanent_no(int $sequence): string
{
    return 'CCCF' . str_pad((string)$sequence, 3, '0', STR_PAD_LEFT);
}

function wf_cccf_backfill_permanent_numbers(): void
{
    $rows = db_rows(
        "SELECT id,
                COALESCE(NULLIF(PermanentYear,0),YEAR(COALESCE(SubmitDate,CreatedAt)),YEAR(CURDATE())) AS NumberYear,
                PermanentYear,PermanentSeq,PermanentNo
           FROM cccf_forma_permanent
          ORDER BY NumberYear,COALESCE(CreatedAt,SubmitDate),id"
    );
    if (!$rows) return;
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $byYear = [];
        foreach ($rows as $row) {
            $year = (int)($row['NumberYear'] ?? date('Y'));
            $byYear[$year][] = $row;
        }
        foreach ($byYear as $year => $yearRows) {
            $maxExisting = 0;
            foreach ($yearRows as $row) $maxExisting = max($maxExisting, (int)($row['PermanentSeq'] ?? 0));
            db_execute(
                'INSERT INTO cccf_permanent_sequences (PermanentYear,LastSeq) VALUES (?,?) ON DUPLICATE KEY UPDATE LastSeq=GREATEST(LastSeq,VALUES(LastSeq))',
                [$year,$maxExisting]
            );
            $sequenceRow = db_row('SELECT LastSeq FROM cccf_permanent_sequences WHERE PermanentYear=? FOR UPDATE', [$year]);
            $lastSeq = (int)($sequenceRow['LastSeq'] ?? 0);
            foreach ($yearRows as $row) {
                $sequence = (int)($row['PermanentSeq'] ?? 0);
                if ($sequence <= 0) $sequence = ++$lastSeq;
                $number = wf_cccf_permanent_no($sequence);
                if (
                    (int)($row['NumberYear'] ?? 0) !== (int)($row['PermanentYear'] ?? 0)
                    || (int)($row['PermanentSeq'] ?? 0) !== $sequence
                    || (string)($row['PermanentNo'] ?? '') !== $number
                ) {
                    db_execute(
                        'UPDATE cccf_forma_permanent SET PermanentYear=?,PermanentSeq=?,PermanentNo=? WHERE id=?',
                        [$year,$sequence,$number,$row['id']]
                    );
                }
                $lastSeq = max($lastSeq, $sequence);
            }
            db_execute(
                'UPDATE cccf_permanent_sequences SET LastSeq=GREATEST(LastSeq,?) WHERE PermanentYear=?',
                [$lastSeq,$year]
            );
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function wf_cccf_allocate_permanent_number(int $year): array
{
    db_execute('INSERT IGNORE INTO cccf_permanent_sequences (PermanentYear,LastSeq) VALUES (?,0)', [$year]);
    $row = db_row('SELECT LastSeq FROM cccf_permanent_sequences WHERE PermanentYear=? FOR UPDATE', [$year]);
    $sequence = (int)($row['LastSeq'] ?? 0) + 1;
    db_execute('UPDATE cccf_permanent_sequences SET LastSeq=? WHERE PermanentYear=?', [$sequence,$year]);
    return ['year'=>$year,'sequence'=>$sequence,'number'=>wf_cccf_permanent_no($sequence)];
}

function wf_cccf_worker_rows(): array
{
    $rows = db_rows('SELECT * FROM cccf_forma_worker ORDER BY SubmitDate DESC,id DESC');
    if (!$rows) return [];
    $ids = array_values(array_filter(array_map(static fn($row)=>(int)($row['id']??0),$rows)));
    if (!$ids) return $rows;
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $attachments = db_rows(
        "SELECT id,WorkerRecordID,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy,CreatedAt
           FROM cccf_worker_attachments
          WHERE IsDeleted=0 AND WorkerRecordID IN ($placeholders)
          ORDER BY id",
        $ids
    );
    $byRecord = [];
    foreach ($attachments as $item) $byRecord[(int)$item['WorkerRecordID']][] = $item;
    foreach ($rows as &$row) {
        $row['Attachments'] = $byRecord[(int)$row['id']] ?? [];
        $row['AttachmentCount'] = count($row['Attachments']);
    }
    unset($row);
    return $rows;
}

function wf_cccf_admin_email(): string
{
    return defined('SMTP_FROM') && SMTP_FROM ? SMTP_FROM : 'sattaya_w@thaisummit-harness.co.th';
}

function wf_cccf_valid_company_email($email): string
{
    $email = strtolower(trim((string)$email));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return '';
    $domain = '@thaisummit-harness.co.th';
    return substr($email, -strlen($domain)) === $domain ? $email : '';
}

function wf_cccf_is_excel_upload(array $file): bool
{
    return in_array((string)($file['ext'] ?? ''), ['xls', 'xlsx'], true)
        && in_array((string)($file['type'] ?? ''), [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ], true);
}

function wf_cccf_is_pdf_upload(array $file): bool
{
    return (string)($file['ext'] ?? '') === 'pdf'
        && (string)($file['type'] ?? '') === 'application/pdf';
}

function wf_cccf_direct_signed_allowed(array $user, ?string $assigneeId): bool
{
    if (wf_is_admin($user)) return true;
    $requesterId = wf_user_id($user);
    if ($assigneeId === null || $assigneeId === '' || $requesterId !== $assigneeId) return false;
    $assignment = db_row('SELECT AllowDirectSignedPdf FROM cccf_assignments WHERE EmployeeID=? LIMIT 1', [$assigneeId]);
    return (int)($assignment['AllowDirectSignedPdf'] ?? 0) === 1;
}

function wf_cccf_owner_recipient(array $record): array
{
    $assigneeId = trim((string)($record['AssigneeID'] ?? ''));
    if ($assigneeId === '') {
        return [
            'assigneeId' => '',
            'name' => (string)($record['SubmitterName'] ?? ''),
            'department' => (string)($record['Department'] ?? ''),
            'email' => '',
            'missingReason' => 'missing_assignee',
        ];
    }
    $employee = db_row('SELECT EmployeeID,EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=? LIMIT 1', [$assigneeId]) ?: [];
    $email = wf_cccf_valid_company_email($employee['CompanyEmail'] ?? '');
    return [
        'assigneeId' => $assigneeId,
        'name' => (string)($employee['EmployeeName'] ?? ($record['SubmitterName'] ?? '')),
        'department' => (string)($employee['Department'] ?? ($record['Department'] ?? '')),
        'email' => $email,
        'missingReason' => $email !== '' ? null : ($employee ? 'missing_company_email' : 'employee_not_found'),
    ];
}

function wf_cccf_save_unit_target(array $body, string $unitName, string $actor): void
{
    $unit = trim($unitName);
    $year = (int)($body['target_year'] ?? date('Y'));
    $target = max(0, (int)($body['yearly_target'] ?? 0));
    $rawOverride = $body['achieved_override'] ?? null;
    $override = ($rawOverride === null || trim((string)$rawOverride) === '') ? null : max(0, (int)$rawOverride);
    if ($unit === '') json_response(['success' => false, 'message' => 'Unit name is required.'], 400);
    if ($year < 2000 || $year > 2100) json_response(['success' => false, 'message' => 'Invalid target year.'], 400);
    db_execute(
        'INSERT INTO cccf_unit_targets (unit_name,target_year,yearly_target,achieved_override,UpdatedBy) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE yearly_target=VALUES(yearly_target),achieved_override=VALUES(achieved_override),UpdatedBy=VALUES(UpdatedBy)',
        [$unit, $year, $target, $override, $actor]
    );
    json_response(['success' => true]);
}

function wf_cccf_target_summary(int $year): array
{
    $distributed = db_row(
        'SELECT COALESCE(SUM(yearly_target),0) distributedTarget,
                COUNT(*) configuredUnits,
                COALESCE(SUM(yearly_target=0),0) zeroTargetUnits
           FROM cccf_unit_targets
          WHERE target_year=?',
        [$year]
    ) ?: [];
    ensure_activity_target_tables();
    $system = db_row(
        "SELECT COALESCE(SUM(t.YearlyTarget),0) systemTarget,
                COUNT(*) effectiveTargetEmployees
           FROM employee_activity_target_years t
           INNER JOIN employees e ON e.EmployeeID=t.EmployeeID
          WHERE t.ActivityKey='cccf_worker'
            AND t.TargetYear IN (?,0)
            AND (t.TargetYear=? OR NOT EXISTS (
                SELECT 1 FROM employee_activity_target_years tx
                 WHERE tx.EmployeeID=t.EmployeeID
                   AND tx.ActivityKey=t.ActivityKey
                   AND tx.TargetYear=?
            ))
            AND COALESCE(t.IsNA,0)=0
            AND t.YearlyTarget>0
            AND NOT EXISTS (
                SELECT 1
                  FROM activity_position_template_years p
                 WHERE p.PositionName=e.Position
                   AND p.ActivityKey='cccf_worker'
                   AND p.TargetYear IN (?,0)
                   AND (p.TargetYear=? OR NOT EXISTS (
                       SELECT 1 FROM activity_position_template_years px
                        WHERE px.PositionName=p.PositionName
                          AND px.ActivityKey=p.ActivityKey
                          AND px.TargetYear=?
                   ))
                   AND COALESCE(p.IsNA,0)=0
                   AND p.YearlyTarget>0
            )",
        [$year, $year, $year, $year, $year, $year]
    ) ?: [];
    if ((int) ($system['effectiveTargetEmployees'] ?? 0) === 0) $system = db_row(
        "SELECT COALESCE(SUM(t.YearlyTarget),0) systemTarget,
                COUNT(*) effectiveTargetEmployees
           FROM employee_activity_targets t
           INNER JOIN employees e ON e.EmployeeID=t.EmployeeID
           LEFT JOIN activity_position_templates p
             ON p.PositionName=e.Position
            AND p.ActivityKey='cccf_worker'
          WHERE t.ActivityKey='cccf_worker'
            AND COALESCE(t.IsNA,0)=0
            AND t.YearlyTarget>0
            AND (p.id IS NULL OR COALESCE(p.IsNA,0)=1 OR p.YearlyTarget<=0)"
    ) ?: [];
    $effectiveTargetEmployees = (int) ($system['effectiveTargetEmployees'] ?? 0);
    $systemTarget = $effectiveTargetEmployees > 0 ? (int) ($system['systemTarget'] ?? 0) : null;
    $distributedTarget = (int) ($distributed['distributedTarget'] ?? 0);
    return [
        'year' => $year,
        'systemTarget' => $systemTarget,
        'distributedTarget' => $distributedTarget,
        'difference' => $systemTarget === null ? null : $systemTarget - $distributedTarget,
        'configuredUnits' => (int) ($distributed['configuredUnits'] ?? 0),
        'zeroTargetUnits' => (int) ($distributed['zeroTargetUnits'] ?? 0),
        'effectiveTargetEmployees' => $effectiveTargetEmployees,
        'targetSource' => 'system_console_employee_cccf_worker',
    ];
}

function wf_cccf_mail(string $event, array $record, array $extra = []): array
{
    $eventLabel = [
        'Submitted' => 'Submitted',
        'DirectSignedSubmitted' => 'Direct signed PDF submitted',
        'Approved' => 'Excel approved',
        'Rejected' => 'Excel rejected',
        'Completed' => 'Completed',
        'SignedFileUploaded' => 'Signed PDF uploaded',
    ][$event] ?? $event;
    $tone = in_array($event, ['Approved', 'Completed', 'SignedFileUploaded', 'DirectSignedSubmitted'], true)
        ? 'completed'
        : ($event === 'Rejected' ? 'rejected' : 'pending');
    $summary = trim((string)($record['Summary'] ?? ''));
    $comment = trim((string)($extra['comment'] ?? $record['ReviewComment'] ?? ''));
    return wf_hiyari_mail([
        'subject' => '[CCCF] ' . $eventLabel . (!empty($record['SubmitterName']) ? ' - ' . $record['SubmitterName'] : ''),
        'title' => 'CCCF Form A Permanent - ' . $eventLabel,
        'kicker' => 'CCCF / FORM A PERMANENT',
        'moduleLabel' => 'CCCF Form A Permanent Workflow',
        'tone' => $tone,
        'greeting' => 'Dear Safety Admin / Related user',
        'intro' => [
            'A CCCF Form A Permanent workflow event has been recorded in TSH Safety Core.',
            'Please review the details and attached document status in the CCCF module.',
        ],
        'details' => [
            ['label' => 'Record ID', 'value' => $record['id'] ?? $record['PermanentID'] ?? '-', 'highlight' => true],
            ['label' => 'Event', 'value' => $eventLabel, 'highlight' => true],
            ['label' => 'Submitter', 'value' => $record['SubmitterName'] ?? '-'],
            ['label' => 'Employee ID', 'value' => $record['AssigneeID'] ?? '-'],
            ['label' => 'Department', 'value' => $record['Department'] ?? '-'],
            ['label' => 'Job / Area', 'value' => $record['JobArea'] ?? '-'],
            ['label' => 'Submit Date', 'value' => $record['SubmitDate'] ?? '-'],
            ['label' => 'Stop Type', 'value' => !empty($record['StopType']) ? 'Stop ' . $record['StopType'] : '-'],
            ['label' => 'Risk Rank', 'value' => $record['Rank'] ?? '-', 'highlight' => true],
            ['label' => 'Review Status', 'value' => $record['ReviewStatus'] ?? '-'],
            ['label' => 'Comment', 'value' => $comment !== '' ? $comment : '-'],
        ],
        'actions' => [
            'Open Patrol & CCCF > CCCF Form A Permanent.',
            'Verify the record, review status, and uploaded file before the next workflow step.',
        ],
        'note' => $summary !== '' ? $summary : 'No additional summary.',
    ]);
}

function wf_cccf_worker_employee_scope(string $employeeId): array
{
    return db_row('SELECT Department,Unit FROM employees WHERE EmployeeID=? LIMIT 1', [$employeeId]) ?: [];
}

function wf_cccf_worker_create_scope(array $user, bool $admin, array $body): array
{
    $employee = wf_cccf_worker_employee_scope(wf_user_id($user));
    $department = trim((string) ($employee['Department'] ?? ($user['department'] ?? '')));
    if ($admin) {
        $unit = trim((string) ($body['SafetyUnit'] ?? ''));
        if ($unit === '') json_response(['success'=>false,'message'=>'Safety Unit is required.'],400);
        return ['department'=>$department,'unit'=>wf_text($unit,100)];
    }
    if (!$employee) json_response(['success'=>false,'message'=>'ไม่พบข้อมูลพนักงานใน Employee Master'],409);
    $unit = trim((string) ($employee['Unit'] ?? ''));
    if ($unit === '') json_response(['success'=>false,'message'=>'ยังไม่ได้กำหนด Safety Unit ใน Employee Master กรุณาติดต่อ Admin'],409);
    return ['department'=>$department,'unit'=>wf_text($unit,100)];
}

function handle_cccf_routes(string $method, string $path): bool
{
    if (strpos($path, '/cccf') !== 0) return false;
    $user = require_user(); wf_ensure_cccf_tables(); $admin = wf_is_admin($user); $actor = wf_user_name($user);
    if ($method === 'GET' && $path === '/cccf') json_response(db_rows('SELECT * FROM cccf_activity ORDER BY ActivityDate DESC,id DESC'));
    if ($method === 'GET' && $path === '/cccf/worker-progress') { $year=(int)($_GET['year']??date('Y')); $data=cccf_worker_progress_data($year); if(!$admin)$data['employees']=array_values(array_filter($data['employees'],static fn($row)=>(string)($row['employeeId']??'')===wf_user_id($user))); json_response(['success'=>true,'data'=>$data]); }
    if ($method === 'POST' && $path === '/cccf/activity') { $b=json_body(); if(!wf_date($b['ActivityDate']??null)||empty($b['Area'])||empty($b['Department'])||empty($b['Description'])) json_response(['success'=>false,'message'=>'Invalid CCCF activity payload.'],400); db_execute('INSERT INTO cccf_activity (ActivityDate,Area,Department,Description,Outcome,CreatedBy) VALUES (?,?,?,?,?,?)',[wf_date($b['ActivityDate']),$b['Area'],$b['Department'],$b['Description'],$b['Outcome']??null,$actor]); json_response(['success'=>true]); }
    if ($method === 'GET' && $path === '/cccf/form-a-worker') json_response(wf_cccf_worker_rows());
    if ($method === 'POST' && $path === '/cccf/form-a-worker') {
        $b=wf_body();
        if(!wf_date($b['SubmitDate']??null)||empty($b['JobArea'])||empty($b['HazardDescription'])||empty($b['StopType'])||empty($b['Rank'])){
            json_response(['success'=>false,'message'=>'Invalid worker form payload.'],400);
        }
        $scope=wf_cccf_worker_create_scope($user,$admin,$b);
        $files=wf_store_worker_images();
        cccf_worker_snapshot_target(wf_user_id($user),(int)date('Y',strtotime((string)$b['SubmitDate'])),'form_submit');
        $pdo=db();
        try{
            $pdo->beginTransaction();
            db_execute('INSERT INTO cccf_forma_worker (EmployeeName,EmployeeID,Department,SafetyUnit,SubmitDate,JobArea,Equipment,HazardDescription,HowItHappened,BodyPart,Suggestion,StopType,`Rank`,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$actor,wf_user_id($user),$scope['department'],$scope['unit'],wf_date($b['SubmitDate']),wf_text($b['JobArea']??'',255),wf_text($b['Equipment']??'',255),$b['HazardDescription'],$b['HowItHappened']??null,$b['BodyPart']??null,$b['Suggestion']??null,(int)$b['StopType'],$b['Rank'],$actor]);
            $id=(int)$pdo->lastInsertId();
            foreach($files as $file){
                db_execute('INSERT INTO cccf_worker_attachments (WorkerRecordID,OriginalName,StoredName,FileUrl,MimeType,FileSize,UploadedBy) VALUES (?,?,?,?,?,?,?)',[$id,$file['name'],$file['stored'],$file['url'],$file['type'],$file['size'],$actor]);
            }
            $pdo->commit();
            json_response(['success'=>true,'id'=>$id,'attachmentCount'=>count($files)]);
        }catch(Throwable $e){
            if($pdo->inTransaction())$pdo->rollBack();
            wf_cleanup_files($files);
            throw $e;
        }
    }
    $p=route_params($path,'/cccf/form-a-worker/:id');
    if($p!==null&&($method==='PUT'||$method==='DELETE')){ $row=db_row('SELECT EmployeeID,SafetyUnit FROM cccf_forma_worker WHERE id=?',[$p['id']]); if(!$row) json_response(['success'=>false,'message'=>'Not found.'],404); if(!$admin && (string)$row['EmployeeID']!==wf_user_id($user)) json_response(['success'=>false,'message'=>'Permission denied.'],403); if($method==='DELETE'){ $attachments=db_rows('SELECT FileUrl FROM cccf_worker_attachments WHERE WorkerRecordID=? AND IsDeleted=0',[$p['id']]); $pdo=db(); try{$pdo->beginTransaction();db_execute('UPDATE cccf_worker_attachments SET IsDeleted=1,DeletedBy=?,DeletedAt=NOW() WHERE WorkerRecordID=? AND IsDeleted=0',[$actor,$p['id']]);db_execute('DELETE FROM cccf_forma_worker WHERE id=?',[$p['id']]);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;} foreach($attachments as $attachment)delete_uploaded_file($attachment['FileUrl']??null);json_response(['success'=>true]);} $b=json_body(); if(!wf_date($b['SubmitDate']??null)||empty($b['JobArea'])||empty($b['HazardDescription'])||empty($b['StopType'])||empty($b['Rank'])) json_response(['success'=>false,'message'=>'Invalid worker form payload.'],400); $unit=$admin?trim((string)($b['SafetyUnit']??'')):trim((string)($row['SafetyUnit']??'')); if($unit==='')json_response(['success'=>false,'message'=>'Safety Unit is required.'],400); db_execute('UPDATE cccf_forma_worker SET SafetyUnit=?,SubmitDate=?,JobArea=?,Equipment=?,HazardDescription=?,HowItHappened=?,BodyPart=?,Suggestion=?,StopType=?,`Rank`=? WHERE id=?',[wf_text($unit,100),wf_date($b['SubmitDate']??null),$b['JobArea']??'',$b['Equipment']??'',$b['HazardDescription']??'',$b['HowItHappened']??'',$b['BodyPart']??'',$b['Suggestion']??'',(int)($b['StopType']??0),$b['Rank']??null,$p['id']]); json_response(['success'=>true]); }
    if ($method === 'GET' && $path === '/cccf/form-a-permanent') json_response(db_rows('SELECT * FROM cccf_forma_permanent ORDER BY SubmitDate DESC,id DESC'));
    if (($method==='POST'&&$path==='/cccf/form-a-permanent')||(($p=route_params($path,'/cccf/form-a-permanent/:id'))!==null&&$method==='PUT')) {
        if($method==='PUT')require_admin();
        $files=wf_store_files('FormFile',1);
        $b=wf_body();
        $committed=false;
        try{
            if(!wf_date($b['SubmitDate']??null)||empty($b['JobArea'])||empty($b['StopType'])||empty($b['Rank'])) {
                wf_cleanup_files($files);
                json_response(['success'=>false,'message'=>'Invalid permanent form payload.'],400);
            }
            $mode=$b['DocumentMode']??$b['documentMode']??'excel_review';
            if(!in_array($mode,['excel_review','direct_signed','legacy'],true))$mode='excel_review';
            $file=$files[0]['url']??null;
            $submitter=$admin&& !empty($b['SubmitterName'])?$b['SubmitterName']:$actor;
            $dept=$admin&& !empty($b['Department'])?$b['Department']:($user['department']??'');
            $assignee=$b['AssigneeID']??($admin?null:wf_user_id($user));
            $assignee=$assignee!==null?trim((string)$assignee):null;
            if($assignee!==null&&$assignee!==''){
                $employee=db_row('SELECT EmployeeName,Department FROM employees WHERE EmployeeID=? LIMIT 1',[$assignee]);
                if(!$employee){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Employee not found.'],404);}
                $submitter=$employee['EmployeeName']??$submitter;
                $dept=$employee['Department']??$dept;
            }
            if($method==='POST'&&$mode==='excel_review'&&(!$files||!wf_cccf_is_excel_upload($files[0]))){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Excel review requires an Excel file.'],400);}
            if($method==='POST'&&$mode==='direct_signed'&&(!$files||!wf_cccf_is_pdf_upload($files[0]))){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Direct signed submission requires a PDF file.'],400);}
            if($method==='POST'&&$mode==='direct_signed'&&!wf_cccf_direct_signed_allowed($user,$assignee)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}
            $review=$mode==='excel_review'?'PendingReview':($mode==='direct_signed'?'Completed':'Completed');
            $excel=$mode==='excel_review'?$file:null;
            $signed=$mode==='direct_signed'?$file:null;
            $permanentNo=null;
            if($method==='POST'){
                $pdo=db();
                $pdo->beginTransaction();
                try{
                    $year=(int)date('Y',strtotime((string)$b['SubmitDate']));
                    $number=wf_cccf_allocate_permanent_number($year);
                    db_execute('INSERT INTO cccf_forma_permanent (PermanentYear,PermanentSeq,PermanentNo,SubmitterName,Department,JobArea,SubmitDate,Summary,StopType,`Rank`,FileUrl,ExcelFileUrl,SignedFileUrl,SignedUploadedAt,AssigneeID,DocumentMode,ReviewStatus,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$number['year'],$number['sequence'],$number['number'],$submitter,$dept,$b['JobArea'],wf_date($b['SubmitDate']),$b['Summary']??'',(int)$b['StopType'],$b['Rank'],$file,$excel,$signed,$signed?date('Y-m-d H:i:s'):null,$assignee,$mode,$review,$actor]);
                    $id=(int)$pdo->lastInsertId();
                    $permanentNo=$number['number'];
                    $pdo->commit();
                    $committed=true;
                }catch(Throwable $e){
                    if($pdo->inTransaction())$pdo->rollBack();
                    throw $e;
                }
            }else{
                $old=db_row('SELECT FileUrl,ExcelFileUrl,SignedFileUrl,PermanentNo FROM cccf_forma_permanent WHERE id=?',[$p['id']]);
                if(!$old){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}
                $file=$file?:($old['FileUrl']??null);
                db_execute('UPDATE cccf_forma_permanent SET SubmitterName=?,Department=?,JobArea=?,SubmitDate=?,Summary=?,StopType=?,`Rank`=?,FileUrl=?,ExcelFileUrl=COALESCE(?,ExcelFileUrl),DocumentMode=? WHERE id=?',[$submitter,$dept,$b['JobArea'],wf_date($b['SubmitDate']),$b['Summary']??'',(int)$b['StopType'],$b['Rank'],$file,$excel,$mode,$p['id']]);
                $id=(int)$p['id'];
                $permanentNo=$old['PermanentNo']??null;
                $committed=true;
                if($files&&($old['FileUrl']??null)!==$file)delete_uploaded_file($old['FileUrl']??null);
            }
            $mailRecord=db_row('SELECT * FROM cccf_forma_permanent WHERE id=?',[$id])?:['id'=>$id,'PermanentNo'=>$permanentNo,'SubmitterName'=>$submitter,'Department'=>$dept,'JobArea'=>$b['JobArea']??'','SubmitDate'=>wf_date($b['SubmitDate']??null),'Summary'=>$b['Summary']??'','StopType'=>$b['StopType']??null,'Rank'=>$b['Rank']??null,'ReviewStatus'=>$review,'AssigneeID'=>$assignee];
            $mail=wf_cccf_mail($mode==='direct_signed'?'DirectSignedSubmitted':'Submitted',$mailRecord);
            wf_email_outbox('cccf_emailoutbox',['PermanentID'=>$id,'EventType'=>$mode==='direct_signed'?'DirectSignedSubmitted':'Submitted','Recipients'=>wf_cccf_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
            json_response(['success'=>true,'id'=>$id,'permanentNo'=>$permanentNo]);
        }catch(Throwable $e){
            if(!$committed)wf_cleanup_files($files);
            throw $e;
        }
    }
    $p=route_params($path,'/cccf/form-a-permanent/:id/review'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();$st=$b['ReviewStatus']??'Approved';if(!in_array($st,['PendingReview','Approved','Rejected','Completed'],true))json_response(['success'=>false,'message'=>'Invalid review status.'],400);db_execute('UPDATE cccf_forma_permanent SET ReviewStatus=?,ReviewComment=?,ReviewedBy=?,ReviewedAt=NOW() WHERE id=?',[$st,$b['ReviewComment']??null,$actor,$p['id']]);$mailRecord=db_row('SELECT * FROM cccf_forma_permanent WHERE id=?',[$p['id']])?:['id'=>$p['id'],'ReviewStatus'=>$st];$mail=wf_cccf_mail($st,$mailRecord,['comment'=>$b['ReviewComment']??'']);wf_email_outbox('cccf_emailoutbox',['PermanentID'=>$p['id'],'EventType'=>$st,'Recipients'=>wf_cccf_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);json_response(['success'=>true]);}
    $p=route_params($path,'/cccf/form-a-permanent/:id/signed-file');
    if($p!==null&&$method==='POST'){
        $files=wf_store_files('FormFile',1);
        if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);
        if(!wf_cccf_is_pdf_upload($files[0])){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Signed file must be a PDF.'],400);}
        $row=db_row('SELECT AssigneeID,SignedFileUrl,ReviewStatus FROM cccf_forma_permanent WHERE id=?',[$p['id']]);
        if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}
        if(!$admin&&(string)($row['AssigneeID']??'')!==wf_user_id($user)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}
        if(!in_array((string)($row['ReviewStatus']??''),['Approved','Completed'],true)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Signed PDF can be uploaded only after approval.'],400);}
        $committed=false;
        try{
            db_execute("UPDATE cccf_forma_permanent SET SignedFileUrl=?,FileUrl=?,SignedUploadedAt=NOW(),ReviewStatus='Completed' WHERE id=?",[$files[0]['url'],$files[0]['url'],$p['id']]);
            $committed=true;
            if(($row['SignedFileUrl']??null)!==$files[0]['url'])delete_uploaded_file($row['SignedFileUrl']??null);
            $mailRecord=db_row('SELECT * FROM cccf_forma_permanent WHERE id=?',[$p['id']])?:['id'=>$p['id'],'ReviewStatus'=>'Completed'];
            $mail=wf_cccf_mail('SignedFileUploaded',$mailRecord);
            wf_email_outbox('cccf_emailoutbox',['PermanentID'=>$p['id'],'EventType'=>'SignedFileUploaded','Recipients'=>wf_cccf_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
            json_response(['success'=>true,'url'=>$files[0]['url']]);
        }catch(Throwable $e){
            if(!$committed)wf_cleanup_files($files);
            throw $e;
        }
    }
    $p=route_params($path,'/cccf/form-a-permanent/:id/complete'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();$row=db_row('SELECT * FROM cccf_forma_permanent WHERE id=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);$owner=wf_cccf_owner_recipient($row);if(($row['ReviewStatus']??'')==='Completed')json_response(['success'=>true,'alreadyCompleted'=>true,'recipientEmail'=>$owner['email'],'recipientName'=>$owner['name'],'recipientAssigneeId'=>$owner['assigneeId'],'emailStatus'=>'AlreadyCompleted']);if(empty($row['SignedFileUrl'])&&($row['DocumentMode']??'')!=='direct_signed')json_response(['success'=>false,'message'=>'Signed PDF is required before completing CCCF Permanent.'],400);$comment=trim((string)($b['ReviewComment']??$b['CompleteComment']??''));db_execute("UPDATE cccf_forma_permanent SET ReviewStatus='Completed',ReviewComment=COALESCE(NULLIF(?,''),ReviewComment),ReviewedBy=?,ReviewedAt=NOW(),CompletedBy=?,CompletedAt=NOW() WHERE id=?",[$comment,$actor,$actor,$p['id']]);$mailRecord=db_row('SELECT * FROM cccf_forma_permanent WHERE id=?',[$p['id']])?:array_merge($row,['ReviewStatus'=>'Completed']);$emailStatus='SkippedNoRecipient';if($owner['email']!==''){$mail=wf_cccf_mail('Completed',$mailRecord,['comment'=>$comment]);wf_email_outbox('cccf_emailoutbox',['PermanentID'=>$p['id'],'EventType'=>'Completed','Recipients'=>$owner['email'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);$emailStatus='Queued';}json_response(['success'=>true,'recipientEmail'=>$owner['email'],'recipientName'=>$owner['name'],'recipientAssigneeId'=>$owner['assigneeId'],'emailStatus'=>$emailStatus,'emailMissingReason'=>$owner['email']!==''?null:$owner['missingReason']]);}
    $p=route_params($path,'/cccf/form-a-permanent/:id'); if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT FileUrl,ExcelFileUrl,SignedFileUrl FROM cccf_forma_permanent WHERE id=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);db_execute('DELETE FROM cccf_forma_permanent WHERE id=?',[$p['id']]);foreach(array_unique(array_filter([$row['FileUrl']??null,$row['ExcelFileUrl']??null,$row['SignedFileUrl']??null])) as $u)delete_uploaded_file($u);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/cccf/email-outbox'){require_admin();$sql='SELECT o.*,p.PermanentNo,p.SubmitterName AS PermanentSubmitterName,p.AssigneeID AS PermanentAssigneeID FROM cccf_emailoutbox o LEFT JOIN cccf_forma_permanent p ON p.id=o.PermanentID';$pa=[];$where=[];if(!empty($_GET['status'])){$where[]='o.Status=?';$pa[]=$_GET['status'];}if(!empty($_GET['eventType'])){$where[]='o.EventType=?';$pa[]=$_GET['eventType'];}if($where)$sql.=' WHERE '.implode(' AND ',$where);json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY o.CreatedAt DESC LIMIT 200',$pa),'smtpConfigured'=>mailer_smtp_configured()]);}
    $p=route_params($path,'/cccf/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('cccf_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    if($method==='POST'&&$path==='/cccf/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('cccf_emailoutbox','Recipients','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retry email queue completed: sent {$r['sent']}, failed {$r['failed']}",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    if($method==='GET'&&$path==='/cccf/unit-targets')json_response(db_rows('SELECT * FROM cccf_unit_targets ORDER BY target_year DESC,unit_name ASC'));
    if($method==='GET'&&$path==='/cccf/target-summary'){ $year=(int)($_GET['year']??date('Y')); json_response(['success'=>true,'data'=>wf_cccf_target_summary($year)]); }
    if($method==='PUT'&&$path==='/cccf/unit-targets'){require_admin();$b=json_body();wf_cccf_save_unit_target($b,(string)($b['unit_name']??''),$actor);}
    $p=route_params($path,'/cccf/unit-targets/:unit'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();wf_cccf_save_unit_target($b,(string)$p['unit'],$actor);}
    if($method==='GET'&&$path==='/cccf/assignments')json_response(db_rows('SELECT a.*,COALESCE(e.EmployeeName,a.AssigneeName) AS AssigneeName,COALESCE(e.Department,a.Department) AS Department,e.CompanyEmail FROM cccf_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID ORDER BY Department,AssigneeName'));
    if(($method==='POST'&&$path==='/cccf/assignments')||(($p=route_params($path,'/cccf/assignments/:id'))!==null&&$method==='PUT')){require_admin();$b=json_body();$emp=$b['EmployeeID']??null;$name=$b['AssigneeName']??null;$dept=$b['Department']??null;if($emp){$er=db_row('SELECT EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=?',[$emp]);if(!$er)json_response(['success'=>false,'message'=>'Employee not found.'],404);$name=$er['EmployeeName'];$dept=$er['Department'];} if(!$emp&&(!$name||!$dept))json_response(['success'=>false,'message'=>'Invalid assignment payload.'],400); if($method==='POST'){db_execute('INSERT INTO cccf_assignments (EmployeeID,AssigneeName,Department,AllowDirectSignedPdf,DueDate,Note,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),wf_date($b['DueDate']??null),$b['Note']??null,$actor]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);} db_execute('UPDATE cccf_assignments SET EmployeeID=?,AssigneeName=?,Department=?,AllowDirectSignedPdf=?,DueDate=?,Note=?,CreatedBy=? WHERE id=?',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),wf_date($b['DueDate']??null),$b['Note']??null,$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/cccf/assignments/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM cccf_assignments WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    return false;
}

function wf_ensure_hiyari_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS hiyarireports (
        id VARCHAR(36) PRIMARY KEY,ReportDate DATE NOT NULL,ReporterID VARCHAR(50) NOT NULL,ReporterName VARCHAR(100) NOT NULL,
        Department VARCHAR(100) NOT NULL,SubmittedByID VARCHAR(50),SubmittedByName VARCHAR(100),IsSubmittedOnBehalf TINYINT(1) NOT NULL DEFAULT 0,
        CompanyEmail VARCHAR(255),Location VARCHAR(255),Description TEXT NOT NULL,PotentialConsequence VARCHAR(100),RiskLevel VARCHAR(20) DEFAULT 'Low',
        RiskRank VARCHAR(1),StopType INT,Suggestion TEXT,AttachmentUrl TEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Open',
        ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'PendingReview',ReviewComment TEXT,ReviewedAt DATETIME,ReviewedBy VARCHAR(100),
        ReviewOverrideReason TEXT,ReviewOverrideBy VARCHAR(100),ReviewOverrideAt DATETIME,SignedFileUrl TEXT,SignedUploadedAt DATETIME,
        CorrectiveAction TEXT,AdminComment TEXT,AdditionalFileUrl TEXT,ClosedAt DATETIME,ClosedBy VARCHAR(100),ReopenReason TEXT,ReopenedAt DATETIME,ReopenedBy VARCHAR(100),DeletedAt DATETIME,DeletedBy VARCHAR(100),
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_status(Status),KEY idx_dept(Department),KEY idx_date(ReportDate),KEY idx_rank(RiskRank),KEY idx_deleted(DeletedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_dashboard_config (ConfigKey VARCHAR(100) PRIMARY KEY,ConfigValue TEXT,UpdatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_assignments (id INT AUTO_INCREMENT PRIMARY KEY,EmployeeID VARCHAR(50),AssigneeName VARCHAR(100) NOT NULL,Department VARCHAR(100),AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0,Note TEXT,DueDate DATE,CreatedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_emp(EmployeeID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,ReportID VARCHAR(36),EventType VARCHAR(50),Recipients TEXT,Subject VARCHAR(255),Body TEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,RetryCount INT NOT NULL DEFAULT 0,LastAttemptAt DATETIME,LastFailureAt DATETIME,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,SentAt DATETIME,KEY idx_report(ReportID),KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS hiyari_report_revisions (id INT AUTO_INCREMENT PRIMARY KEY,ReportID VARCHAR(36) NOT NULL,RevisionNo INT NOT NULL,PreviousAttachmentUrl TEXT,ReplacementAttachmentUrl TEXT NOT NULL,ReviewComment TEXT,UploadedByID VARCHAR(50),UploadedByName VARCHAR(100),UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uq_report_revision(ReportID,RevisionNo),KEY idx_report(ReportID),KEY idx_uploaded_at(UploadedAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE hiyarireports ADD COLUMN SubmittedByID VARCHAR(50)",
        "ALTER TABLE hiyarireports ADD COLUMN SubmittedByName VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN IsSubmittedOnBehalf TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE hiyarireports ADD COLUMN CompanyEmail VARCHAR(255)",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewStatus VARCHAR(30) NOT NULL DEFAULT 'PendingReview'",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewComment TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewedBy VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewOverrideReason TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewOverrideBy VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN ReviewOverrideAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN SignedFileUrl TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN SignedUploadedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN ReopenReason TEXT",
        "ALTER TABLE hiyarireports ADD COLUMN ReopenedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN ReopenedBy VARCHAR(100)",
        "ALTER TABLE hiyarireports ADD COLUMN DeletedAt DATETIME",
        "ALTER TABLE hiyarireports ADD COLUMN DeletedBy VARCHAR(100)",
        "ALTER TABLE hiyari_emailoutbox ADD COLUMN RetryCount INT NOT NULL DEFAULT 0 AFTER Error",
        "ALTER TABLE hiyari_emailoutbox ADD COLUMN LastAttemptAt DATETIME AFTER RetryCount",
        "ALTER TABLE hiyari_emailoutbox ADD COLUMN LastFailureAt DATETIME AFTER LastAttemptAt",
        "ALTER TABLE hiyari_assignments ADD COLUMN AllowDirectSignedPdf TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE hiyari_assignments ADD COLUMN DueDate DATE",
    ] as $sql) wf_try_exec($sql);
}

function wf_hiyari_row_with_timeline(string $id): ?array
{
    $row = db_row('SELECT * FROM hiyarireports WHERE id=? AND DeletedAt IS NULL', [$id]);
    if (!$row) return null;
    $row['revisions'] = wf_hiyari_revisions($id);
    $row['timeline'] = [
        ['label' => 'Created', 'at' => $row['CreatedAt'] ?? null, 'by' => $row['SubmittedByName'] ?? $row['ReporterName'] ?? null],
        ['label' => 'Reviewed', 'at' => $row['ReviewedAt'] ?? null, 'by' => $row['ReviewedBy'] ?? null],
        ['label' => 'Signed File', 'at' => $row['SignedUploadedAt'] ?? null, 'by' => $row['ReporterName'] ?? null],
        ['label' => 'Closed', 'at' => $row['ClosedAt'] ?? null, 'by' => $row['ClosedBy'] ?? null],
        ['label' => 'Reopened', 'at' => $row['ReopenedAt'] ?? null, 'by' => $row['ReopenedBy'] ?? null],
    ];
    return $row;
}

function wf_hiyari_revisions(string $id): array
{
    return db_rows('SELECT id,ReportID,RevisionNo,PreviousAttachmentUrl,ReplacementAttachmentUrl,ReviewComment,UploadedByID,UploadedByName,UploadedAt FROM hiyari_report_revisions WHERE ReportID=? ORDER BY RevisionNo DESC,UploadedAt DESC,id DESC', [$id]);
}

function wf_hiyari_visibility_clause(array $user, string $alias = ''): array
{
    if (wf_is_admin($user)) return ['', []];
    $prefix = $alias !== '' ? $alias . '.' : '';
    $id = wf_user_id($user);
    return [" AND ({$prefix}ReporterID=? OR {$prefix}SubmittedByID=? OR {$prefix}Status='Closed')", [$id, $id]];
}

function wf_hiyari_is_owner(array $row, array $user): bool
{
    $id = wf_user_id($user);
    return $id === (string)($row['ReporterID'] ?? '') || $id === (string)($row['SubmittedByID'] ?? '');
}

function wf_hiyari_sanitize_for_viewer(array $row, array $user): array
{
    if (wf_is_admin($user) || wf_hiyari_is_owner($row, $user)) return $row;
    $row['IsLearningRecord'] = true;
    $row['ReadOnly'] = true;
    foreach ([
        'CompanyEmail', 'SubmittedByEmail', 'EmailRecipients', 'AttachmentUrl', 'AdditionalFileUrl',
        'AdminComment', 'ReviewOverrideReason', 'ReviewOverrideBy', 'ReviewOverrideAt',
        'ReviewedBy', 'ClosedBy', 'ReopenedBy', 'DeletedBy', 'ReopenReason',
        'ReporterID', 'SubmittedByID', 'SubmittedByName',
    ] as $field) $row[$field] = null;
    $row['revisions'] = [];
    return $row;
}

function wf_hiyari_visible_row(string $id, array $user): ?array
{
    [$where, $params] = wf_hiyari_visibility_clause($user);
    return db_row('SELECT * FROM hiyarireports WHERE id=? AND DeletedAt IS NULL' . $where, array_merge([$id], $params)) ?: null;
}

function wf_hiyari_audit(array $user, string $action, string $targetId, string $detail = '', array $metadata = []): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS admin_auditlogs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ActionTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            AdminID VARCHAR(50) NOT NULL,
            AdminName VARCHAR(100),
            Role VARCHAR(50),
            Department VARCHAR(100),
            Module VARCHAR(80),
            Action VARCHAR(80) NOT NULL,
            Method VARCHAR(10),
            Path VARCHAR(255),
            StatusCode INT,
            TargetType VARCHAR(80),
            TargetID VARCHAR(100),
            Detail TEXT,
            Metadata TEXT,
            IPAddress VARCHAR(80),
            UserAgent VARCHAR(255),
            INDEX idx_action(Action),
            INDEX idx_admin(AdminID),
            INDEX idx_module(Module),
            INDEX idx_actiontime(ActionTime)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db_execute(
            'INSERT INTO admin_auditlogs (AdminID,AdminName,Role,Department,Module,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata,IPAddress,UserAgent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                wf_user_id($user),
                wf_user_name($user),
                $user['role'] ?? $user['Role'] ?? null,
                $user['department'] ?? $user['Department'] ?? null,
                'hiyari',
                $action,
                $_SERVER['REQUEST_METHOD'] ?? null,
                substr((string)($_SERVER['REQUEST_URI'] ?? ''), 0, 255),
                200,
                'HiyariReports',
                $targetId,
                $detail,
                json_encode($metadata, JSON_UNESCAPED_UNICODE),
                $_SERVER['REMOTE_ADDR'] ?? null,
                substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
    } catch (Throwable $e) {
        // Audit must not break the Hiyari workflow.
    }
}

function wf_hiyari_admin_email(): string
{
    global $config;
    foreach (['hiyari_admin_email', 'admin_email'] as $key) {
        $email = trim((string)($config[$key] ?? ''));
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) return $email;
    }
    return 'sattaya_w@thaisummit-harness.co.th';
}

function wf_app_url(): string
{
    $env = getenv('PUBLIC_APP_URL') ?: getenv('APP_BASE_URL');
    $url = trim((string)($env ?: 'https://dev.tshpcl.com/safety/tsh-safety-core/'));
    return $url !== '' ? $url : 'https://dev.tshpcl.com/safety/tsh-safety-core/';
}

function wf_hiyari_mail_subject(string $action, string $detail = ''): string
{
    return '[Hiyari-Hatto] ' . $action . ($detail !== '' ? ' - ' . $detail : '');
}

function wf_hiyari_mail(array $args): array
{
    $subject = (string)($args['subject'] ?? wf_hiyari_mail_subject('Notification'));
    $title = (string)($args['title'] ?? 'Hiyari-Hatto Notification');
    $kicker = (string)($args['kicker'] ?? 'HIYARI-HATTO / NEAR-MISS REPORTING');
    $moduleLabel = (string)($args['moduleLabel'] ?? 'Hiyari-Hatto / Near-Miss Reporting Module');
    $tone = (string)($args['tone'] ?? 'pending');
    $greeting = (string)($args['greeting'] ?? 'เรียน ผู้เกี่ยวข้อง / Dear user');
    $intro = (array)($args['intro'] ?? []);
    $details = (array)($args['details'] ?? []);
    $actions = (array)($args['actions'] ?? []);
    $note = (string)($args['note'] ?? '');
    $colors = [
        'approved' => ['#166534', '#dcfce7', '#86efac', 'อนุมัติแล้ว'],
        'rejected' => ['#9f1239', '#ffe4e6', '#fda4af', 'ต้องแก้ไข'],
        'completed' => ['#166534', '#dcfce7', '#86efac', 'เสร็จสิ้น'],
        'pending' => ['#9a3412', '#ffedd5', '#fdba74', 'ต้องดำเนินการ'],
    ];
    $c = $colors[$tone] ?? $colors['pending'];
    $textLines = [$title, '', $greeting, ''];
    foreach ($intro as $line) $textLines[] = (string)$line;
    if ($details) {
        $textLines[] = '';
        $textLines[] = 'Details / รายละเอียด';
        foreach ($details as $d) $textLines[] = '- ' . ($d['label'] ?? '') . ': ' . (($d['value'] ?? '') !== '' ? $d['value'] : '-');
    }
    if ($actions) {
        $textLines[] = '';
        $textLines[] = 'Next action / สิ่งที่ต้องดำเนินการ';
        foreach ($actions as $a) $textLines[] = '- ' . $a;
    }
    if ($note !== '') {
        $textLines[] = '';
        $textLines[] = $note;
    }
    $appUrl = wf_app_url();
    if ($appUrl !== '') {
        $textLines[] = '';
        $textLines[] = 'เข้าสู่ระบบ / Open Safety Core';
        $textLines[] = $appUrl;
    }
    $detailHtml = '';
    foreach ($details as $d) {
        $label = htmlspecialchars((string)($d['label'] ?? ''), ENT_QUOTES, 'UTF-8');
        $value = htmlspecialchars((string)(($d['value'] ?? '') !== '' ? $d['value'] : '-'), ENT_QUOTES, 'UTF-8');
        $weight = !empty($d['highlight']) ? 'font-weight:700;color:#0f172a' : 'color:#334155';
        $detailHtml .= '<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;width:38%">' . $label . '</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;' . $weight . '">' . nl2br($value) . '</td></tr>';
    }
    $introHtml = '';
    foreach ($intro as $line) $introHtml .= '<p style="margin:0 0 10px 0;color:#334155;font-size:14px;line-height:1.65">' . htmlspecialchars((string)$line, ENT_QUOTES, 'UTF-8') . '</p>';
    $actionHtml = '';
    foreach ($actions as $a) $actionHtml .= '<li style="margin:0 0 6px 0;color:#334155;font-size:14px;line-height:1.7">' . htmlspecialchars((string)$a, ENT_QUOTES, 'UTF-8') . '</li>';
    $actionsBlock = $actionHtml ? '<div style="margin-top:18px;padding:16px;border:1px solid ' . $c[2] . ';border-radius:12px;background:' . $c[1] . '"><div style="font-size:12px;font-weight:800;color:' . $c[0] . ';letter-spacing:.04em;margin-bottom:10px">สิ่งที่ต้องดำเนินการ</div><ol style="margin:0;padding-left:20px">' . $actionHtml . '</ol></div>' : '';
    $safeAppUrl = htmlspecialchars($appUrl, ENT_QUOTES, 'UTF-8');
    $ctaHtml = $appUrl !== '' ? '<div style="margin-top:22px;text-align:center"><a href="' . $safeAppUrl . '" target="_blank" rel="noopener" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;line-height:1.2;padding:13px 22px;border-radius:999px;border:1px solid #0f766e">เข้าสู่ระบบ / Open Safety Core</a><div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5">หากปุ่มเปิดไม่ได้ ให้คัดลอกลิงก์นี้ / If the button does not open, copy this link:<br><a href="' . $safeAppUrl . '" target="_blank" rel="noopener" style="color:#0f766e;text-decoration:underline">' . $safeAppUrl . '</a></div></div>' : '';
    $noteHtml = $note !== '' ? '<div style="margin-top:18px;padding:14px;border-left:4px solid ' . $c[0] . ';background:#f8fafc;border-radius:10px"><div style="font-size:12px;font-weight:800;color:#475569;letter-spacing:.04em;margin-bottom:8px">หมายเหตุ</div><p style="margin:0;color:#334155;font-size:14px;line-height:1.65">' . htmlspecialchars($note, ENT_QUOTES, 'UTF-8') . '</p></div>' : '';
    $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . htmlspecialchars($subject, ENT_QUOTES, 'UTF-8') . '</title></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,Tahoma,sans-serif"><div style="display:none;max-height:0;overflow:hidden;color:transparent">' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center" style="padding:0 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 45px rgba(15,23,42,.08)"><tr><td bgcolor="#f8fafc" style="padding:0;background:#f8fafc;border-bottom:1px solid #e2e8f0"><div style="padding:28px 28px 24px 28px;border-top:5px solid ' . $c[0] . '"><div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">' . htmlspecialchars($kicker, ENT_QUOTES, 'UTF-8') . '</div><h1 style="margin:16px 0 0 0;color:#0f172a;font-size:26px;line-height:1.25;font-weight:800">' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1><div style="margin-top:14px;display:inline-block;padding:7px 12px;border-radius:999px;background:' . $c[1] . ';color:' . $c[0] . ';font-size:12px;font-weight:800;border:1px solid ' . $c[2] . '">' . htmlspecialchars($c[3], ENT_QUOTES, 'UTF-8') . '</div></div></td></tr><tr><td style="padding:26px 28px 8px 28px"><p style="margin:0 0 14px 0;color:#0f172a;font-size:15px;font-weight:800">' . htmlspecialchars($greeting, ENT_QUOTES, 'UTF-8') . '</p>' . $introHtml . '</td></tr><tr><td style="padding:8px 28px 0 28px"><div style="font-size:12px;font-weight:800;color:#64748b;letter-spacing:.04em;margin-bottom:10px">สรุปรายงาน</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff">' . ($detailHtml ?: '<tr><td style="padding:14px;color:#64748b;font-size:14px">No details available</td></tr>') . '</table>' . $actionsBlock . $ctaHtml . $noteHtml . '</td></tr><tr><td style="padding:24px 28px 28px 28px"><p style="margin:0;color:#334155;font-size:14px;line-height:1.6">ขอบคุณครับ/ค่ะ</p></td></tr><tr><td style="padding:18px 28px;background:#0f172a"><div style="color:#e2e8f0;font-size:13px;font-weight:800">TSH Safety Core Activity System</div><div style="color:#94a3b8;font-size:12px;margin-top:4px">' . htmlspecialchars($moduleLabel, ENT_QUOTES, 'UTF-8') . '</div><div style="color:#94a3b8;font-size:11px;margin-top:10px;line-height:1.5">อีเมลฉบับนี้เป็นการแจ้งเตือนอัตโนมัติจากระบบ TSH Safety Core Activity กรุณาอย่าตอบกลับอีเมลนี้</div></td></tr></table></td></tr></table></body></html>';
    return ['subject' => $subject, 'body' => implode("\n", $textLines), 'html' => $html];
}

function wf_hiyari_new_report_mail(array $data, bool $direct = false): array
{
    return wf_hiyari_mail([
        'subject' => $direct ? wf_hiyari_mail_subject('ผู้รายงานอัปโหลด PDF ที่ลงนามแล้ว', (string)($data['reporterName'] ?? '')) : wf_hiyari_mail_subject('มีรายงานใหม่รอตรวจสอบ Excel', (string)($data['reporterName'] ?? '')),
        'title' => $direct ? 'มีการอัปโหลด PDF ที่ลงนามแล้ว' : 'มีรายงาน Hiyari-Hatto ใหม่ รอตรวจสอบ',
        'tone' => $direct ? 'completed' : 'pending',
        'greeting' => 'เรียน ผู้ดูแลระบบความปลอดภัย / Dear Safety Admin',
        'intro' => $direct ? [
            'ผู้รายงานได้ส่งรายงาน Hiyari-Hatto / Near-Miss พร้อมไฟล์ PDF ที่ลงนามแล้ว',
            'กรุณาตรวจสอบเอกสารฉบับลงนาม และดำเนินการปิดงานเมื่อข้อมูลครบถ้วน',
        ] : [
            'ระบบได้รับรายงาน Hiyari-Hatto / Near-Miss ฉบับใหม่ และรอการตรวจสอบไฟล์ Excel',
            'กรุณาตรวจสอบความครบถ้วนของข้อมูล และบันทึกผลการตรวจในระบบ',
        ],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $data['reportId'] ?? '-', 'highlight' => true],
            ['label' => 'ผู้รายงาน / Reporter', 'value' => $data['reporterName'] ?? '-', 'highlight' => true],
            ['label' => 'รหัสพนักงาน / Employee ID', 'value' => $data['reporterId'] ?? '-'],
            ['label' => 'แผนก / Department', 'value' => $data['department'] ?? '-'],
            ['label' => 'ผู้ส่งข้อมูล / Submitter', 'value' => $data['submitterName'] ?? '-'],
            ['label' => 'วันที่รายงาน / Report Date', 'value' => $data['date'] ?? '-'],
            ['label' => 'พื้นที่ / Location', 'value' => $data['location'] ?? '-'],
            ['label' => 'ประเภทอันตราย / Stop Type', 'value' => !empty($data['stopType']) ? 'Stop ' . $data['stopType'] : '-'],
            ['label' => 'ระดับความรุนแรง / Rank', 'value' => $data['rank'] ?? '-', 'highlight' => true],
            ['label' => 'อีเมลแจ้งผล / Company Email', 'value' => $data['companyEmail'] ?? '-'],
        ],
        'actions' => $direct ? [
            'เปิดเมนู Hiyari-Hatto และตรวจสอบไฟล์ PDF ที่ลงนามแล้ว',
            'บันทึก Corrective Action / Admin Comment และปิดรายงานเมื่อครบถ้วน',
        ] : [
            'เปิดเมนู Hiyari-Hatto > จัดการ > ตรวจรายงาน',
            'ตรวจสอบไฟล์ Excel ที่แนบมาและความครบถ้วนของข้อมูล',
            'บันทึกผลเป็นผ่านการตรวจสอบ หรือ ตีกลับเพื่อแก้ไข พร้อมหมายเหตุที่ชัดเจน',
        ],
        'note' => $direct ? 'อีเมลนี้ถูกส่งถึง Safety Admin เมื่อผู้รายงานส่ง PDF ที่ลงนามแล้วผ่าน workflow' : 'อีเมลนี้ถูกส่งถึง Safety Admin เนื่องจากมีรายงาน Near-Miss ใหม่เข้าสู่ขั้นตอนตรวจสอบ Excel',
    ]);
}

function wf_hiyari_submission_confirmation_mail(array $data, bool $direct = false): array
{
    return wf_hiyari_mail([
        'subject' => $direct
            ? wf_hiyari_mail_subject('ระบบได้รับรายงานพร้อม Signed PDF แล้ว', (string)($data['reportId'] ?? ''))
            : wf_hiyari_mail_subject('ระบบได้รับรายงานแล้ว', (string)($data['reportId'] ?? '')),
        'title' => $direct ? 'ส่งรายงาน Hiyari พร้อม Signed PDF สำเร็จ' : 'ส่งรายงาน Hiyari สำเร็จ',
        'tone' => $direct ? 'completed' : 'pending',
        'greeting' => 'เรียน คุณ' . (($data['reporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => $direct
            ? ['ระบบได้รับรายงาน Hiyari-Hatto / Near-Miss พร้อม Signed PDF แล้ว และส่งต่อให้ Safety Admin ตรวจสอบเพื่อปิดงาน']
            : ['ระบบได้รับรายงาน Hiyari-Hatto / Near-Miss แล้ว และส่งต่อให้ Safety Admin ตรวจสอบไฟล์ Excel'],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $data['reportId'] ?? '-', 'highlight' => true],
            ['label' => 'ผู้รายงาน / Reporter', 'value' => $data['reporterName'] ?? '-'],
            ['label' => 'ผู้ส่งข้อมูล / Submitter', 'value' => $data['submitterName'] ?? '-'],
            ['label' => 'วันที่รายงาน / Report Date', 'value' => $data['date'] ?? '-'],
            ['label' => 'ระดับความรุนแรง / Rank', 'value' => $data['rank'] ?? '-', 'highlight' => true],
            ['label' => 'สถานะ / Status', 'value' => $direct ? 'Signed PDF submitted / รอ Admin ปิดงาน' : 'Pending review / รอตรวจ Excel', 'highlight' => true],
        ],
        'actions' => ['ติดตามสถานะล่าสุดได้จากเมนู Hiyari-Hatto ในระบบ Safety Core'],
        'note' => 'อีเมลฉบับนี้เป็นหลักฐานยืนยันว่าระบบได้รับรายงานเรียบร้อยแล้ว',
    ]);
}

function wf_hiyari_completed_mail(array $row): array
{
    return wf_hiyari_mail([
        'subject' => wf_hiyari_mail_subject('ได้รับ Signed PDF และดำเนินขั้นตอนเอกสารครบแล้ว', (string)($row['id'] ?? '')),
        'title' => 'ระบบได้รับ Signed PDF เรียบร้อยแล้ว',
        'tone' => 'completed',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => [
            'ระบบได้รับไฟล์ PDF ที่ลงนามแล้วสำหรับรายงาน Hiyari-Hatto / Near-Miss เรียบร้อยแล้ว',
            'ไม่ต้องอัปโหลดไฟล์ซ้ำ กรุณารอติดตามการตรวจสอบและการปิดงานจาก Safety Admin',
        ],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'สถานะเอกสาร / Document Status', 'value' => 'Signed PDF received / Completed', 'highlight' => true],
        ],
        'actions' => ['ติดตามสถานะปิดงานได้จากเมนู Hiyari-Hatto ในระบบ Safety Core'],
        'note' => 'หากต้องแก้ไขเอกสาร โปรดติดต่อ Safety Admin ก่อนอัปโหลดฉบับใหม่',
    ]);
}

function wf_hiyari_user_review_mail(array $row, string $reviewStatus, string $reviewComment): array
{
    $approved = $reviewStatus === 'Approved';
    return wf_hiyari_mail([
        'subject' => $approved ? wf_hiyari_mail_subject('ผลการตรวจรายงานผ่านแล้ว กรุณาดำเนินการลงนาม') : wf_hiyari_mail_subject('รายงานต้องแก้ไขก่อนดำเนินการต่อ'),
        'title' => $approved ? 'รายงาน Hiyari ผ่านการตรวจสอบแล้ว' : 'รายงาน Hiyari ต้องแก้ไขเพิ่มเติม',
        'tone' => $approved ? 'approved' : 'rejected',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => $approved ? [
            'รายงาน Hiyari-Hatto / Near-Miss ของท่านผ่านการตรวจสอบไฟล์ Excel แล้ว',
            'กรุณาพิมพ์รายงาน ดำเนินการลงนามตามขั้นตอน และอัปโหลดไฟล์ PDF ที่ลงนามแล้วกลับเข้าสู่ระบบ',
        ] : [
            'รายงาน Hiyari-Hatto / Near-Miss ของท่านยังไม่ผ่านการตรวจสอบไฟล์ Excel และต้องแก้ไขเพิ่มเติม',
            'กรุณาตรวจสอบหมายเหตุจาก Safety Admin และแก้ไข/ประสานงานเพิ่มเติมตามความจำเป็น',
        ],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'ผลการตรวจ / Review Status', 'value' => $approved ? 'ผ่านการตรวจสอบ / Approved' : 'ตีกลับเพื่อแก้ไข / Rejected', 'highlight' => true],
            ['label' => 'หมายเหตุจากผู้ตรวจ / Review Comment', 'value' => $reviewComment ?: '-'],
        ],
        'actions' => $approved ? ['อัปโหลดไฟล์ PDF ที่ลงนามแล้วในเมนู Hiyari-Hatto หลังดำเนินการลงนามครบถ้วน'] : ['แก้ไขไฟล์ Excel ตามหมายเหตุจากผู้ตรวจ', 'ประสาน Safety Admin หากต้องการข้อมูลหรือคำชี้แจงเพิ่มเติม'],
        'note' => $approved ? 'รายงานนี้เข้าสู่ขั้นตอนส่ง PDF ที่ลงนามแล้ว' : 'รายงานนี้ยังอยู่ในขั้นตอนแก้ไขจนกว่าข้อมูลจะครบถ้วน',
    ]);
}

function wf_hiyari_user_status_mail(array $row, string $status, string $correctiveAction, string $adminComment): array
{
    $closed = $status === 'Closed';
    return wf_hiyari_mail([
        'subject' => $closed ? wf_hiyari_mail_subject('ปิดรายงานเรียบร้อยแล้ว') : wf_hiyari_mail_subject('รายงานถูกเปิดกลับเพื่อดำเนินการต่อ'),
        'title' => $closed ? 'ปิดรายงาน Hiyari เรียบร้อยแล้ว' : 'รายงาน Hiyari ถูกเปิดกลับเพื่อดำเนินการต่อ',
        'tone' => $closed ? 'completed' : 'pending',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => $closed ? ['รายงาน Hiyari-Hatto / Near-Miss ของท่านได้รับการดำเนินการและปิดรายงานเรียบร้อยแล้ว'] : ['รายงาน Hiyari-Hatto / Near-Miss ของท่านถูกเปิดกลับเพื่อดำเนินการเพิ่มเติม', 'กรุณาติดตามสถานะในระบบหรือประสาน Safety Admin ตามหมายเหตุด้านล่าง'],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'สถานะปัจจุบัน / Current Status', 'value' => $closed ? 'ปิดรายงานแล้ว / Closed' : $status, 'highlight' => true],
            ['label' => 'Corrective Action', 'value' => $correctiveAction ?: '-'],
            ['label' => 'หมายเหตุจากผู้ดูแล / Admin Comment', 'value' => $adminComment ?: '-'],
        ],
        'actions' => $closed ? [] : ['ตรวจสอบสถานะล่าสุดในเมนู Hiyari-Hatto', 'ประสาน Safety Admin หากต้องดำเนินการเพิ่มเติม'],
        'note' => $closed ? 'รายงานนี้ดำเนินการครบตามขั้นตอน Hiyari close-out แล้ว' : 'รายงานนี้ถูกเปิดกลับและอาจต้องติดตามเพิ่มเติม',
    ]);
}

function wf_hiyari_override_mail(array $row, string $reason, string $actor): array
{
    return wf_hiyari_mail([
        'subject' => wf_hiyari_mail_subject('Admin อนุญาตให้ส่ง PDF ที่ลงนามแล้ว'),
        'title' => 'Admin อนุญาตให้ส่ง PDF ที่ลงนามแล้ว',
        'tone' => 'approved',
        'greeting' => 'เรียน คุณ' . (($row['ReporterName'] ?? '') ?: 'ผู้รายงาน'),
        'intro' => ['Safety Admin ได้อนุญาตให้รายงาน Hiyari-Hatto / Near-Miss ของท่านเข้าสู่ขั้นตอนส่ง PDF ที่ลงนามแล้ว โดยใช้สิทธิ์ Admin Override'],
        'details' => [
            ['label' => 'เลขที่รายงาน / Report ID', 'value' => $row['id'] ?? '-', 'highlight' => true],
            ['label' => 'ผู้อนุญาต / Approved by', 'value' => $actor, 'highlight' => true],
            ['label' => 'เหตุผล / Reason', 'value' => $reason ?: '-'],
        ],
        'actions' => ['อัปโหลดไฟล์ PDF ที่ลงนามแล้วในเมนู Hiyari-Hatto หลังลงนามครบถ้วน'],
        'note' => 'การอนุญาตกรณีพิเศษนี้ถูกบันทึกไว้เพื่อการตรวจสอบย้อนหลัง',
    ]);
}

function wf_hiyari_today(): string
{
    return date('Y-m-d');
}

function wf_hiyari_valid_date($value): ?string
{
    $date = wf_date($value);
    if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    $parts = array_map('intval', explode('-', $date));
    if (count($parts) !== 3 || !checkdate($parts[1], $parts[2], $parts[0])) return null;
    return $date <= wf_hiyari_today() ? $date : null;
}

function wf_hiyari_valid_rank($value): ?string
{
    $rank = strtoupper(trim((string)($value ?? '')));
    return in_array($rank, ['A', 'B', 'C'], true) ? $rank : null;
}

function wf_hiyari_risk_from_rank(string $rank, $fallback = null): string
{
    $map = ['A' => 'Critical', 'B' => 'High', 'C' => 'Low'];
    $risk = trim((string)($fallback ?? ''));
    return $map[$rank] ?? (in_array($risk, ['Low', 'Medium', 'High', 'Critical'], true) ? $risk : 'Low');
}

function wf_hiyari_valid_stop_type($value): ?int
{
    if ($value === null || $value === '') return null;
    $stopType = filter_var($value, FILTER_VALIDATE_INT);
    return in_array($stopType, [1, 2, 3, 4, 5, 6], true) ? $stopType : null;
}

function wf_hiyari_file_is(array $file, array $mimes, array $exts): bool
{
    $mime = strtolower((string)($file['type'] ?? ''));
    $ext = strtolower((string)($file['ext'] ?? pathinfo((string)($file['name'] ?? ''), PATHINFO_EXTENSION)));
    return in_array($mime, $mimes, true) || in_array($ext, $exts, true);
}

function wf_hiyari_supporting_file_is(array $file): bool
{
    return wf_hiyari_file_is($file, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], ['pdf', 'jpg', 'jpeg', 'png', 'webp']);
}

function wf_hiyari_valid_status($value): ?string
{
    $status = trim((string)($value ?? ''));
    return in_array($status, ['Open', 'In Progress', 'Closed'], true) ? $status : null;
}

function wf_hiyari_valid_review_status($value): ?string
{
    $status = trim((string)($value ?? ''));
    return in_array($status, ['PendingReview', 'Approved', 'Rejected', 'Completed'], true) ? $status : null;
}

function wf_hiyari_normalize_company_email($email): string
{
    return strtolower(trim((string)($email ?? '')));
}

function wf_hiyari_is_company_email($email): bool
{
    $email = wf_hiyari_normalize_company_email($email);
    return $email !== ''
        && filter_var($email, FILTER_VALIDATE_EMAIL)
        && substr($email, -strlen('@thaisummit-harness.co.th')) === '@thaisummit-harness.co.th';
}

function wf_hiyari_resolve_company_email(string $employeeId, $submittedEmail): ?string
{
    $row = db_row('SELECT CompanyEmail FROM employees WHERE EmployeeID=? AND CompanyEmail IS NOT NULL AND TRIM(CompanyEmail)<>"" LIMIT 1', [$employeeId]);
    $masterEmail = wf_hiyari_normalize_company_email($row['CompanyEmail'] ?? null);
    if (wf_hiyari_is_company_email($masterEmail)) return $masterEmail;
    $fallback = wf_hiyari_normalize_company_email($submittedEmail);
    return wf_hiyari_is_company_email($fallback) ? $fallback : null;
}

function wf_hiyari_user_recipient_info(array $row): array
{
    $reporterId = trim((string)($row['ReporterID'] ?? ''));
    $submittedById = trim((string)($row['SubmittedByID'] ?? ''));
    $ownerEmail = wf_hiyari_resolve_company_email($reporterId, $row['CompanyEmail'] ?? null);
    $submitterEmail = null;
    if ($submittedById !== '' && $submittedById !== $reporterId) {
        $submitterEmail = wf_hiyari_resolve_company_email($submittedById, null);
    }
    $emails = [];
    foreach ([$ownerEmail, $submitterEmail] as $email) {
        $normalized = wf_hiyari_normalize_company_email($email);
        if (wf_hiyari_is_company_email($normalized) && !in_array($normalized, $emails, true)) $emails[] = $normalized;
    }
    return [
        'emails' => $emails,
        'recipients' => implode(',', $emails),
        'ownerEmail' => $ownerEmail,
        'submitterEmail' => $submitterEmail,
    ];
}

function wf_hiyari_reject_upload(array $files, string $message, int $status = 400): void
{
    wf_cleanup_files($files);
    json_response(['success' => false, 'message' => $message], $status);
}

function handle_hiyari_routes(string $method, string $path): bool
{
    if (strpos($path, '/hiyari') !== 0) return false;
    $user=require_user(); wf_ensure_hiyari_tables(); $admin=wf_is_admin($user); $actor=wf_user_name($user);
    if($method==='GET'&&$path==='/hiyari/stats'){
        $year=(int)($_GET['year']??date('Y'));$month=max(0,min(12,(int)($_GET['month']??0)));$dept=trim((string)($_GET['department']??''));$status=trim((string)($_GET['status']??''));$rank=strtoupper(trim((string)($_GET['rank']??'')));
        $where='DeletedAt IS NULL AND YEAR(ReportDate)=?';$params=[$year];
        if($month){$where.=' AND MONTH(ReportDate)=?';$params[]=$month;}
        if($dept!==''&&$dept!=='all'){$where.=' AND Department=?';$params[]=$dept;}
        if($status!==''&&$status!=='all'){$where.=' AND Status=?';$params[]=$status;}
        if(in_array($rank,['A','B','C'],true)){$where.=' AND RiskRank=?';$params[]=$rank;}
        if(!$admin){$where.=" AND (ReporterID=? OR SubmittedByID=? OR Status='Closed')";$requester=wf_user_id($user);$params[]=$requester;$params[]=$requester;}
        $reports=db_rows("SELECT *,RiskRank AS `Rank` FROM hiyarireports WHERE $where ORDER BY ReportDate DESC",$params);
        $today=new DateTimeImmutable('today');$enriched=[];$kpi=['total'=>count($reports),'open'=>0,'inProgress'=>0,'closed'=>0,'overdueCount'=>0,'nearDueCount'=>0,'pendingReview'=>0,'pendingSignedPdf'=>0,'rejectedWaitingResubmit'=>0];
        foreach($reports as $r){$st=(string)($r['Status']??'');if($st==='Open')$kpi['open']++;elseif($st==='In Progress')$kpi['inProgress']++;elseif($st==='Closed')$kpi['closed']++;$review=(string)($r['ReviewStatus']??'');if($review==='PendingReview')$kpi['pendingReview']++;if($review==='Approved'&&empty($r['SignedFileUrl']))$kpi['pendingSignedPdf']++;if($review==='Rejected')$kpi['rejectedWaitingResubmit']++;$limit=['A'=>7,'B'=>15,'C'=>30][$r['Rank']??'']??30;$date=new DateTimeImmutable((string)$r['ReportDate']);$age=max(0,(int)$date->diff($today)->format('%r%a'));$remaining=$limit-$age;$r['ageDays']=$age;$r['slaDays']=$limit;$r['remainingDays']=$remaining;$r['slaStatus']=$remaining<0?'overdue':($remaining<=3?'near_due':'on_track');if($st!=='Closed'){if($r['slaStatus']==='overdue')$kpi['overdueCount']++;elseif($r['slaStatus']==='near_due')$kpi['nearDueCount']++;}$enriched[]=$r;}
        $actions=array_values(array_filter($enriched,static fn($r)=>($r['Status']??'')!=='Closed'&&(($r['slaStatus']??'')!=='on_track'||in_array($r['ReviewStatus']??'',['PendingReview','Rejected','Approved'],true))));usort($actions,static fn($a,$b)=>($a['remainingDays']??0)<=>($b['remainingDays']??0));$actions=array_slice($actions,0,20);
        $enriched=array_map(static fn($r)=>wf_hiyari_sanitize_for_viewer($r,$user),$enriched);
        $actions=array_map(static fn($r)=>wf_hiyari_sanitize_for_viewer($r,$user),$actions);
        $base="FROM hiyarireports WHERE $where"; json_response(['success'=>true,'data'=>[
        'phase'=>'dashboard_sla_intelligence','filters'=>['year'=>$year,'month'=>$month,'department'=>$dept?:'all','status'=>$status?:'all','rank'=>$rank?:'all'],
        'kpi'=>$kpi,
        'monthly'=>safe_rows("SELECT MONTH(ReportDate) AS month,COUNT(*) AS count $base GROUP BY MONTH(ReportDate) ORDER BY month",$params),
        'consequence'=>safe_rows("SELECT COALESCE(PotentialConsequence,'Unspecified') AS label,COUNT(*) AS count $base GROUP BY PotentialConsequence ORDER BY count DESC",$params),
        'riskDist'=>safe_rows("SELECT COALESCE(RiskLevel,'Low') AS level,COUNT(*) AS count $base GROUP BY RiskLevel",$params),
        'stopDist'=>safe_rows("SELECT StopType,COUNT(*) AS count $base AND StopType IS NOT NULL GROUP BY StopType ORDER BY StopType",$params),
        'rankDist'=>safe_rows("SELECT RiskRank AS `Rank`,COUNT(*) AS count $base AND RiskRank IS NOT NULL GROUP BY RiskRank",$params),
        'deptRank'=>safe_rows("SELECT Department,COUNT(*) AS count $base GROUP BY Department ORDER BY count DESC LIMIT 20",$params),
        'areaRank'=>safe_rows("SELECT COALESCE(NULLIF(Location,''),'Unspecified') AS Location,COUNT(*) AS count $base GROUP BY Location ORDER BY count DESC LIMIT 12",$params),
        'monthlyRank'=>safe_rows("SELECT MONTH(ReportDate) AS month,RiskRank AS `Rank`,COUNT(*) AS count $base AND RiskRank IS NOT NULL GROUP BY MONTH(ReportDate),RiskRank",$params),
        'monthlyStatus'=>safe_rows("SELECT MONTH(ReportDate) AS month,Status,COUNT(*) AS count $base GROUP BY MONTH(ReportDate),Status",$params),
        'stopRankMatrix'=>safe_rows("SELECT StopType,RiskRank AS `Rank`,COUNT(*) AS count $base GROUP BY StopType,RiskRank",$params),
        'departmentRiskRanking'=>safe_rows("SELECT Department,COUNT(*) AS count,SUM(RiskRank='A') AS rankA,SUM(RiskRank='B') AS rankB,SUM(RiskRank='C') AS rankC,SUM(CASE WHEN Status<>'Closed' AND DATEDIFF(CURDATE(),ReportDate)>CASE RiskRank WHEN 'A' THEN 7 WHEN 'B' THEN 15 ELSE 30 END THEN 1 ELSE 0 END) AS overdue,SUM(CASE RiskRank WHEN 'A' THEN 5 WHEN 'B' THEN 3 ELSE 1 END)+2*SUM(CASE WHEN Status<>'Closed' AND DATEDIFF(CURDATE(),ReportDate)>CASE RiskRank WHEN 'A' THEN 7 WHEN 'B' THEN 15 ELSE 30 END THEN 1 ELSE 0 END) AS score $base GROUP BY Department ORDER BY score DESC",$params),
        'assignmentCompletion'=>['total'=>(int)(db_row('SELECT COUNT(*) AS n FROM hiyari_assignments'.($dept!==''&&$dept!=='all'?' WHERE Department=?':''),$dept!==''&&$dept!=='all'?[$dept]:[])['n']??0),'completed'=>count(array_unique(array_filter(array_column($reports,'ReporterID'))))],
        'actionList'=>$actions,'reports'=>$enriched,
    ]]);}
    if($method==='GET'&&$path==='/hiyari/dashboard-config'){ $cfg=['pinnedDepts'=>[]]; foreach(db_rows('SELECT ConfigKey,ConfigValue FROM hiyari_dashboard_config') as $r)$cfg[$r['ConfigKey']]=wf_json($r['ConfigValue'],[]); json_response(['success'=>true,'data'=>$cfg]);}
    if($method==='PUT'&&$path==='/hiyari/dashboard-config'){require_admin();$b=json_body(); if(array_key_exists('pinnedDepts',$b))db_execute('INSERT INTO hiyari_dashboard_config (ConfigKey,ConfigValue,UpdatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue),UpdatedBy=VALUES(UpdatedBy)',['pinnedDepts',json_encode($b['pinnedDepts'],JSON_UNESCAPED_UNICODE),$actor]); json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/hiyari/assignments')json_response(['success'=>true,'data'=>db_rows('SELECT a.*,COALESCE(e.EmployeeName,a.AssigneeName) AS AssigneeName,COALESCE(e.Department,a.Department) AS Department,e.CompanyEmail FROM hiyari_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID ORDER BY Department,AssigneeName')]);
    if(($method==='POST'&&$path==='/hiyari/assignments')||(($p=route_params($path,'/hiyari/assignments/:id'))!==null&&$method==='PUT')){require_admin();$b=json_body();$emp=$b['EmployeeID']??null;$name=$b['AssigneeName']??null;$dept=$b['Department']??null;if($emp){$er=db_row('SELECT EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=?',[$emp]);if(!$er)json_response(['success'=>false,'message'=>'Employee not found.'],404);if(!wf_hiyari_is_company_email(wf_hiyari_normalize_company_email($er['CompanyEmail']??null)))json_response(['success'=>false,'message'=>'Employee Master must have a valid CompanyEmail before Hiyari assignment.'],400);$name=$er['EmployeeName'];$dept=$er['Department'];} if(!$emp&&(!$name||!$dept))json_response(['success'=>false,'message'=>'Invalid assignment payload.'],400); if($method==='POST'){db_execute('INSERT INTO hiyari_assignments (EmployeeID,AssigneeName,Department,AllowDirectSignedPdf,Note,DueDate,CreatedBy) VALUES (?,?,?,?,?,?,?)',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),$b['Note']??null,wf_date($b['DueDate']??null),$actor]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);} db_execute('UPDATE hiyari_assignments SET EmployeeID=?,AssigneeName=?,Department=?,AllowDirectSignedPdf=?,Note=?,DueDate=?,CreatedBy=? WHERE id=?',[$emp,$name,$dept,wf_bool($b['AllowDirectSignedPdf']??0),$b['Note']??null,wf_date($b['DueDate']??null),$actor,$p['id']]);json_response(['success'=>true]);}
    $p=route_params($path,'/hiyari/assignments/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM hiyari_assignments WHERE id=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/hiyari/email-outbox'){require_admin();$limit=min(max((int)($_GET['limit']??50),1),200);$sql='SELECT * FROM hiyari_emailoutbox';$pa=[];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' WHERE Status=?';$pa[]=$_GET['status'];}$pa[]=$limit;$summary=db_row("SELECT COUNT(*) total,SUM(Status='Queued') pending,SUM(Status='Failed') failed,SUM(Status='Sent') sent,COALESCE(SUM(RetryCount),0) retryCount,MAX(LastFailureAt) lastFailureAt FROM hiyari_emailoutbox")?:[];$summary['threshold']=5;$summary['warning']=(int)($summary['failed']??0)>=5;json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CreatedAt DESC LIMIT ?',$pa),'smtpConfigured'=>mailer_smtp_configured(),'summary'=>$summary]);}
    if($method==='POST'&&$path==='/hiyari/email-outbox/queue-overdue'){require_admin();$b=json_body();$year=(int)($b['year']??date('Y'));$reports=db_rows("SELECT id,ReporterID,SubmittedByID,ReporterName,Department,CompanyEmail,ReportDate,RiskRank,DATEDIFF(CURDATE(),ReportDate) AgeDays FROM hiyarireports WHERE DeletedAt IS NULL AND Status<>'Closed' AND YEAR(ReportDate)=? AND DATEDIFF(CURDATE(),ReportDate)>CASE RiskRank WHEN 'A' THEN 7 WHEN 'B' THEN 15 ELSE 30 END",[$year]);$queued=0;$skipped=0;foreach($reports as $r){if(db_row("SELECT id FROM hiyari_emailoutbox WHERE ReportID=? AND EventType='OverdueReminder' AND DATE(CreatedAt)=CURDATE() LIMIT 1",[$r['id']])){$skipped++;continue;}$recipientInfo=wf_hiyari_user_recipient_info($r);$recipients=array_values(array_unique(array_filter(array_merge([wf_hiyari_admin_email()],$recipientInfo['emails']))));$sla=['A'=>7,'B'=>15,'C'=>30][$r['RiskRank']??'']??30;$days=max(1,(int)$r['AgeDays']-$sla);$subject='[Hiyari-Hatto] Overdue '.$days.' day(s) - '.($r['ReporterName']??$r['id']);$body="Hiyari report {$r['id']} is overdue by $days day(s).\nRank: ".($r['RiskRank']??'-')."\nDepartment: ".($r['Department']??'-')."\nPlease review and close the required action.";wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$r['id'],'EventType'=>'OverdueReminder','Recipients'=>implode(',',$recipients),'Subject'=>$subject,'Body'=>$body,'HtmlBody'=>nl2br(htmlspecialchars($body,ENT_QUOTES,'UTF-8')),'Status'=>'Queued']);$queued++;}json_response(['success'=>true,'year'=>$year,'eligible'=>count($reports),'queued'=>$queued,'skipped'=>$skipped,'deliveryAttempted'=>mailer_smtp_configured()]);}
    if($method==='GET'&&$path==='/hiyari/file-health'){require_admin();$reports=db_rows('SELECT id,ReporterName,AttachmentUrl,AdditionalFileUrl,SignedFileUrl FROM hiyarireports WHERE DeletedAt IS NULL ORDER BY ReportDate DESC');$roots=[upload_dir(),dirname(__DIR__,2).DIRECTORY_SEPARATOR.'backend'.DIRECTORY_SEPARATOR.'uploads'];$fields=[['AttachmentUrl','Excel'],['AdditionalFileUrl','Additional'],['SignedFileUrl','Signed PDF']];$files=[];foreach($reports as $r)foreach($fields as [$field,$label]){$url=$r[$field]??null;if(!$url)continue;$urlPath=(string)parse_url((string)$url,PHP_URL_PATH);$stored=basename(rawurldecode($urlPath));parse_str((string)parse_url((string)$url,PHP_URL_QUERY),$query);$local=strpos($urlPath,'/uploads/')!==false;$disk=null;if($local)foreach($roots as $root){$candidate=$root.DIRECTORY_SEPARATOR.$stored;if(is_file($candidate)){$disk=$candidate;break;}}$ext=strtolower(pathinfo($stored,PATHINFO_EXTENSION));$status=$local?($disk?'ok':'missing'):'external';$files[]=['reportId'=>$r['id'],'reporterName'=>$r['ReporterName'],'field'=>$field,'label'=>$label,'url'=>$url,'originalName'=>$query['filename']??$stored,'storedName'=>$stored,'extension'=>$ext,'size'=>$disk?filesize($disk):null,'modifiedAt'=>$disk?date('c',filemtime($disk)):null,'scope'=>$local?'local':'external','status'=>$status,'previewType'=>in_array($ext,['jpg','jpeg','png','webp'],true)?'image':($ext==='pdf'?'pdf':(in_array($ext,['xls','xlsx'],true)?'excel':'file'))];}$missing=array_values(array_filter($files,fn($f)=>$f['status']==='missing'));json_response(['success'=>true,'data'=>['phase'=>'hiyari_file_attachment_health','readOnly'=>true,'summary'=>['reports'=>count($reports),'references'=>count($files),'ok'=>count(array_filter($files,fn($f)=>$f['status']==='ok')),'missing'=>count($missing),'external'=>count(array_filter($files,fn($f)=>$f['status']==='external')),'orphanCandidates'=>0],'files'=>$files,'missingFiles'=>$missing,'orphanCandidates'=>[],'note'=>'Orphan candidates are reviewed by System Health; no files are deleted automatically.']]);}
    $p=route_params($path,'/hiyari/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('hiyari_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    if($method==='POST'&&$path==='/hiyari/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('hiyari_emailoutbox','Recipients','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retry email queue completed: sent {$r['sent']}, failed {$r['failed']}",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    if($method==='GET'&&$path==='/hiyari'){
        $sql='SELECT * FROM hiyarireports WHERE DeletedAt IS NULL';
        $pa=[];
        $department=$_GET['dept']??($_GET['department']??null);
        $review=$_GET['review']??($_GET['reviewStatus']??null);
        foreach([
            [$_GET['status']??null,'Status'],
            [$department,'Department'],
            [$_GET['risk']??null,'RiskLevel'],
            [$_GET['rank']??null,'RiskRank'],
            [$review,'ReviewStatus'],
        ] as [$value,$column]){
            if($value!==null&&$value!==''&&$value!=='all'){$sql.=" AND $column=?";$pa[]=$value;}
        }
        $stopType=(int)($_GET['stopType']??0);
        if($stopType>=1&&$stopType<=6){$sql.=' AND StopType=?';$pa[]=$stopType;}
        $month=(int)($_GET['month']??0);
        if($month>=1&&$month<=12){$sql.=' AND MONTH(ReportDate)=?';$pa[]=$month;}
        $area=trim((string)($_GET['area']??''));
        if($area!==''&&$area!=='all'){$sql.=" AND COALESCE(NULLIF(TRIM(Location),''),'Unspecified')=?";$pa[]=$area;}
        $year=(int)($_GET['year']??0);
        if($year>0){$sql.=' AND YEAR(ReportDate)=?';$pa[]=$year;}
        $query=trim((string)($_GET['q']??''));
        if($query!==''){$sql.=' AND (ReporterName LIKE ? OR Description LIKE ? OR Location LIKE ?)';$like='%'.$query.'%';array_push($pa,$like,$like,$like);}
        [$visibleSql,$visibleParams]=wf_hiyari_visibility_clause($user);
        $sql.=$visibleSql;
        $pa=array_merge($pa,$visibleParams);
        $rows=db_rows($sql.' ORDER BY ReportDate DESC,CreatedAt DESC',$pa);
        json_response(['success'=>true,'data'=>array_map(static fn($row)=>wf_hiyari_sanitize_for_viewer($row,$user),$rows)]);
    }
    $p=route_params($path,'/hiyari/:id/timeline'); if($p!==null&&$method==='GET'){
        $row=wf_hiyari_visible_row($p['id'],$user);
        if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);
        if(!$admin&&!wf_hiyari_is_owner($row,$user))json_response(['success'=>true,'data'=>[]]);
        $row['timeline']=wf_hiyari_row_with_timeline($p['id'])['timeline']??[];
        json_response(['success'=>true,'data'=>$row['timeline']]);
    }
    $p=route_params($path,'/hiyari/:id'); if($p!==null&&$method==='GET'){
        $row=wf_hiyari_visible_row($p['id'],$user);
        if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);
        if(!$admin&&!wf_hiyari_is_owner($row,$user))json_response(['success'=>true,'data'=>wf_hiyari_sanitize_for_viewer($row,$user)]);
        $recipientInfo=wf_hiyari_user_recipient_info($row);
        $row['EmailRecipients']=$recipientInfo['emails'];
        $row['SubmittedByEmail']=$recipientInfo['submitterEmail'];
        $row['timeline']=wf_hiyari_row_with_timeline($p['id'])['timeline']??[];
        $row['revisions']=wf_hiyari_revisions($p['id']);
        json_response(['success'=>true,'data'=>$row]);
    }
    if(($method==='POST'&&($path==='/hiyari'||$path==='/hiyari/direct-signed'))){
        $field=isset($_FILES['attachment'])?'attachment':'file';
        $files=wf_store_files($field,1);
        $b=wf_body();
        $committed=false;
        try{
            $direct=$path==='/hiyari/direct-signed';
            $description=trim((string)($b['Description']??''));
            if($description==='')wf_hiyari_reject_upload($files,'กรุณาระบุรายละเอียดเหตุการณ์');
            if(!$files)wf_hiyari_reject_upload($files,$direct?'การส่ง PDF โดยตรงต้องแนบไฟล์ PDF ที่ลงนามแล้ว':'กรุณาแนบไฟล์ Excel .xls หรือ .xlsx สำหรับให้แอดมินตรวจสอบ');
            if($direct&&!wf_hiyari_file_is($files[0],['application/pdf'],['pdf']))wf_hiyari_reject_upload($files,'การส่ง PDF โดยตรงต้องแนบไฟล์ PDF ที่ลงนามแล้ว');
            if(!$direct&&!wf_hiyari_file_is($files[0],['application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['xls','xlsx']))wf_hiyari_reject_upload($files,'กรุณาแนบไฟล์ Excel .xls หรือ .xlsx สำหรับให้แอดมินตรวจสอบ');
            $rank=wf_hiyari_valid_rank($b['RiskRank']??($b['Rank']??null));
            if(!$rank)wf_hiyari_reject_upload($files,'Rank ไม่ถูกต้อง');
            $stopType=wf_hiyari_valid_stop_type($b['StopType']??null);
            if(!$stopType)wf_hiyari_reject_upload($files,'Stop Type ไม่ถูกต้อง');
            $date=wf_hiyari_valid_date($b['ReportDate']??null);
            if(!$date)wf_hiyari_reject_upload($files,'วันที่รายงานไม่ถูกต้อง');
            $submitterId=wf_user_id($user);
            $submitterName=$actor;
            $onBehalf=trim((string)($b['OnBehalfEmployeeID']??''));
            $reporter=$onBehalf!==''?$onBehalf:$submitterId;
            $assignment=null;
            if($direct||$onBehalf!==''){
                $assignment=db_row('SELECT a.EmployeeID,a.AllowDirectSignedPdf,COALESCE(e.EmployeeName,a.AssigneeName) AS AssigneeName,COALESCE(e.Department,a.Department) AS Department,e.CompanyEmail FROM hiyari_assignments a LEFT JOIN employees e ON e.EmployeeID=a.EmployeeID WHERE a.EmployeeID=? LIMIT 1',[$reporter]);
                if($onBehalf!==''&&!$assignment)wf_hiyari_reject_upload($files,'เลือกส่งแทนได้เฉพาะพนักงานที่อยู่ในรายการมอบหมาย Hiyari');
                if($direct&&!$admin&&(!$assignment||(int)($assignment['AllowDirectSignedPdf']??0)!==1))wf_hiyari_reject_upload($files,'บัญชีนี้ยังไม่ได้รับสิทธิ์ส่ง PDF ที่ลงนามแล้วโดยตรง',403);
            }
            $emp=db_row('SELECT EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=?',[$reporter]);
            $reporterName=$assignment['AssigneeName']??($emp['EmployeeName']??($b['ReporterName']??$submitterName));
            $dept=$assignment['Department']??($emp['Department']??($b['Department']??($user['department']??'')));
            $companyEmail=wf_hiyari_resolve_company_email($reporter,$b['CompanyEmail']??null);
            if(!$companyEmail)wf_hiyari_reject_upload($files,'Employee Master has no CompanyEmail for this reporter. Add CompanyEmail or submit a valid @thaisummit-harness.co.th email.');
            $file=$files[0]['url']??null;
            $isOnBehalf=$reporter!==$submitterId?1:0;
            $id=wf_uuid();
            db_execute('INSERT INTO hiyarireports (id,ReportDate,ReporterID,ReporterName,Department,SubmittedByID,SubmittedByName,IsSubmittedOnBehalf,CompanyEmail,Location,Description,PotentialConsequence,RiskLevel,RiskRank,StopType,Suggestion,AttachmentUrl,ReviewStatus,SignedFileUrl,SignedUploadedAt,Status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$date,$reporter,$reporterName,$dept,$submitterId,$submitterName,$isOnBehalf,$companyEmail,$b['Location']??null,$description,$b['PotentialConsequence']??null,wf_hiyari_risk_from_rank($rank,$b['RiskLevel']??null),$rank,$stopType,$b['Suggestion']??null,$direct?null:$file,$direct?'Completed':'PendingReview',$direct?$file:null,$direct?date('Y-m-d H:i:s'):null,'Open']);
            $committed=true;
            wf_hiyari_audit($user,$direct?'HIYARI_DIRECT_SIGNED_SUBMIT':'HIYARI_SUBMIT',$id,$isOnBehalf?'Submitted Hiyari report on behalf':'Submitted Hiyari report',['reporterId'=>$reporter,'submitterId'=>$submitterId,'isSubmittedOnBehalf'=>(bool)$isOnBehalf]);
            $mail=wf_hiyari_new_report_mail(['reportId'=>$id,'reporterName'=>$reporterName,'reporterId'=>$reporter,'department'=>$dept,'submitterName'=>$submitterName,'date'=>$date,'companyEmail'=>$companyEmail,'location'=>$b['Location']??null,'rank'=>$rank,'stopType'=>$stopType],$direct);
            wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$id,'EventType'=>$direct?'DirectSignedSubmitted':'Submitted','Recipients'=>wf_hiyari_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
            $confirmation=wf_hiyari_submission_confirmation_mail(['reportId'=>$id,'reporterName'=>$reporterName,'submitterName'=>$submitterName,'date'=>$date,'rank'=>$rank],$direct);
            $recipientInfo=wf_hiyari_user_recipient_info(['ReporterID'=>$reporter,'SubmittedByID'=>$submitterId,'CompanyEmail'=>$companyEmail]);
            wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$id,'EventType'=>$direct?'DirectSignedConfirmed':'SubmissionConfirmed','Recipients'=>$recipientInfo['recipients'],'Subject'=>$confirmation['subject'],'Body'=>$confirmation['body'],'HtmlBody'=>$confirmation['html'],'Status'=>'Queued']);
            json_response(['success'=>true,'id'=>$id]);
        }catch(Throwable $e){if(!$committed)wf_cleanup_files($files);throw $e;}
    }
    $p=route_params($path,'/hiyari/:id/approve-pdf-override'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();$reason=trim((string)($b['reason']??$b['Reason']??''));if(mb_strlen($reason)<5)json_response(['success'=>false,'message'=>'Override reason must contain at least 5 characters.'],400);$row=db_row('SELECT id,ReporterID,SubmittedByID,ReporterName,CompanyEmail,ReviewStatus FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);if(in_array((string)($row['ReviewStatus']??''),['Approved','Completed'],true))json_response(['success'=>false,'message'=>'This report can already accept a signed PDF.'],400);db_execute("UPDATE hiyarireports SET ReviewStatus='Approved',ReviewComment=?,ReviewedAt=NOW(),ReviewedBy=?,ReviewOverrideReason=?,ReviewOverrideBy=?,ReviewOverrideAt=NOW() WHERE id=? AND DeletedAt IS NULL",['Admin Override: '.$reason,$actor,$reason,$actor,$p['id']]);wf_hiyari_audit($user,'HIYARI_REVIEW_OVERRIDE',$p['id'],'Admin override approved signed PDF submission',['previousReviewStatus'=>$row['ReviewStatus']??null,'nextReviewStatus'=>'Approved','reason'=>$reason]);$recipientInfo=wf_hiyari_user_recipient_info($row);if($recipientInfo['recipients']!==''){$mail=wf_hiyari_override_mail($row,$reason,$actor);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>'ReviewOverrideApproved','Recipients'=>$recipientInfo['recipients'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);}json_response(['success'=>true]);}
    $p=route_params($path,'/hiyari/:id/replacement-excel');
    if($p!==null&&$method==='POST'){
        $field=isset($_FILES['file'])?'file':'attachment';$files=wf_store_files($field,1);
        if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);
        if(!wf_hiyari_file_is($files[0],['application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['xls','xlsx']))wf_hiyari_reject_upload($files,'Replacement file must be Excel .xls or .xlsx.');
        $row=db_row('SELECT id,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,ReportDate,CompanyEmail,Location,RiskRank,StopType,AttachmentUrl,ReviewStatus,ReviewComment FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);
        if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}
        $uid=wf_user_id($user);
        if(!$admin&&!in_array($uid,[(string)($row['ReporterID']??''),(string)($row['SubmittedByID']??'')],true)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}
        $adminOverride=$admin&&($row['ReviewStatus']??'')!=='Rejected';
        if(($row['ReviewStatus']??'')!=='Rejected'&&!$adminOverride){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Excel can be resubmitted only after the report is rejected.'],400);}
        $pdo=db();
        try{
            $pdo->beginTransaction();
            $next=db_row('SELECT COALESCE(MAX(RevisionNo),0)+1 AS nextNo FROM hiyari_report_revisions WHERE ReportID=? FOR UPDATE',[$p['id']]);
            $revisionNo=(int)($next['nextNo']??1);
            db_execute('INSERT INTO hiyari_report_revisions (ReportID,RevisionNo,PreviousAttachmentUrl,ReplacementAttachmentUrl,ReviewComment,UploadedByID,UploadedByName) VALUES (?,?,?,?,?,?,?)',[$p['id'],$revisionNo,$row['AttachmentUrl']??null,$files[0]['url'],$row['ReviewComment']??null,$uid,$actor]);
            $updated=db_execute("UPDATE hiyarireports SET AttachmentUrl=?,ReviewStatus='PendingReview',ReviewComment=NULL,ReviewedAt=NULL,ReviewedBy=NULL WHERE id=? AND DeletedAt IS NULL",[$files[0]['url'],$p['id']]);
            if($updated!==1)throw new RuntimeException('Hiyari report changed before replacement Excel update.');
            $pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();wf_cleanup_files($files);throw $e;}
        wf_hiyari_audit($user,$adminOverride?'HIYARI_EXCEL_REPLACE_ADMIN':'HIYARI_EXCEL_RESUBMIT',$p['id'],'Resubmitted Hiyari Excel revision '.$revisionNo,['revisionNo'=>$revisionNo,'previousReviewStatus'=>$row['ReviewStatus']??null,'nextReviewStatus'=>'PendingReview','previousAttachmentUrl'=>$row['AttachmentUrl']??null,'replacementAttachmentUrl'=>$files[0]['url'],'adminOverride'=>$adminOverride]);
        $subject='Hiyari Excel resubmitted: '.($row['ReporterName']??$p['id']);$body="A Hiyari Excel file was resubmitted and is waiting for review.\nReport ID: {$p['id']}\nReporter: ".($row['ReporterName']??'-')."\nDepartment: ".($row['Department']??'-')."\nRevision: ".$revisionNo."\nUploaded by: ".$actor;
        wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>'ExcelResubmitted','Recipients'=>wf_hiyari_admin_email(),'Subject'=>$subject,'Body'=>$body,'HtmlBody'=>nl2br(htmlspecialchars($body,ENT_QUOTES,'UTF-8')),'Status'=>'Queued']);
        json_response(['success'=>true,'url'=>$files[0]['url'],'revisionNo'=>$revisionNo]);
    }
    $p=route_params($path,'/hiyari/:id/resend-status-email'); if($p!==null&&$method==='POST'){
        require_admin();
        $row=db_row('SELECT * FROM hiyarireports WHERE id=? AND DeletedAt IS NULL LIMIT 1',[$p['id']]);
        if(!$row)json_response(['success'=>false,'message'=>'Hiyari report not found.'],404);
        $recipientInfo=wf_hiyari_user_recipient_info($row);
        if($recipientInfo['recipients']==='')json_response(['success'=>false,'message'=>'Owner and substitute submitter have no valid CompanyEmail.'],400);
        if(($row['Status']??'')==='Closed'){
            $statusKey='Closed';
            $mail=wf_hiyari_user_status_mail($row,'Closed',(string)($row['CorrectiveAction']??''),(string)($row['AdminComment']??''));
        }elseif(($row['ReviewStatus']??'')==='Completed'){
            $statusKey='Completed';
            $mail=wf_hiyari_completed_mail($row);
        }elseif(in_array((string)($row['ReviewStatus']??''),['Approved','Rejected'],true)){
            $statusKey=(string)$row['ReviewStatus'];
            $mail=wf_hiyari_user_review_mail($row,$statusKey,(string)($row['ReviewComment']??''));
        }else{
            $statusKey='PendingReview';
            $mail=wf_hiyari_submission_confirmation_mail([
                'reportId'=>$row['id']??$p['id'],
                'reporterName'=>$row['ReporterName']??'-',
                'submitterName'=>$row['SubmittedByName']??$row['ReporterName']??'-',
                'date'=>$row['ReportDate']??'-',
                'rank'=>$row['RiskRank']??'-',
            ],false);
        }
        wf_email_outbox('hiyari_emailoutbox',[
            'ReportID'=>$p['id'],
            'EventType'=>'ManualStatusResent:'.$statusKey,
            'Recipients'=>$recipientInfo['recipients'],
            'Subject'=>$mail['subject'],
            'Body'=>$mail['body'],
            'HtmlBody'=>$mail['html'],
            'Status'=>'Queued',
        ]);
        $delivery=db_row('SELECT Status,Error FROM hiyari_emailoutbox WHERE ReportID=? AND EventType=? ORDER BY id DESC LIMIT 1',[$p['id'],'ManualStatusResent:'.$statusKey])?:[];
        wf_hiyari_audit($user,'HIYARI_STATUS_EMAIL_RESEND',$p['id'],'Resent current Hiyari status email ('.$statusKey.')',['statusKey'=>$statusKey,'recipients'=>$recipientInfo['emails']]);
        json_response(['success'=>true,'statusKey'=>$statusKey,'recipients'=>$recipientInfo['emails'],'emailStatus'=>$delivery['Status']??'Unknown','emailError'=>$delivery['Error']??null,'deliveryAttempted'=>mailer_smtp_configured()]);
    }
    $p=route_params($path,'/hiyari/:id'); if($p!==null&&$method==='PUT'){
        require_admin();$b=json_body();$row=db_row('SELECT * FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);
        $status=array_key_exists('Status',$b)?wf_hiyari_valid_status($b['Status']):($row['Status']??'Open');
        if(!$status)json_response(['success'=>false,'message'=>'Invalid status.'],400);
        $review=array_key_exists('ReviewStatus',$b)?wf_hiyari_valid_review_status($b['ReviewStatus']):($row['ReviewStatus']??'PendingReview');
        if(!$review)json_response(['success'=>false,'message'=>'Invalid review status.'],400);
        if(!empty($row['SignedFileUrl'])&&$review==='Approved')$review='Completed';
        $reviewComment=(string)($b['ReviewComment']??$row['ReviewComment']??'');
        if($review==='Rejected'&&trim($reviewComment)==='')json_response(['success'=>false,'message'=>'ReviewComment is required when rejecting a report.'],400);
        if($review==='Approved'&&trim($reviewComment)==='')$reviewComment='ตรวจสอบไฟล์ Excel แล้ว ข้อมูลครบถ้วน อนุญาตให้ดำเนินการลงนามและส่ง PDF';
        $corrective=(string)($b['CorrectiveAction']??$row['CorrectiveAction']??'');
        $adminComment=(string)($b['AdminComment']??$row['AdminComment']??'');
        $reportDate=array_key_exists('ReportDate',$b)?wf_hiyari_valid_date($b['ReportDate']):($row['ReportDate']??null);
        if(!$reportDate)json_response(['success'=>false,'message'=>'ReportDate must be a valid date that is not in the future.'],400);
        $department=array_key_exists('Department',$b)?trim((string)($b['Department']??'')):trim((string)($row['Department']??''));
        if($department==='')json_response(['success'=>false,'message'=>'Department is required.'],400);
        $description=array_key_exists('Description',$b)?trim((string)($b['Description']??'')):trim((string)($row['Description']??''));
        if($description==='')json_response(['success'=>false,'message'=>'Description is required.'],400);
        $rankProvided=array_key_exists('RiskRank',$b)||array_key_exists('Rank',$b);
        $rank=$rankProvided?wf_hiyari_valid_rank($b['RiskRank']??$b['Rank']):wf_hiyari_valid_rank($row['RiskRank']??null);
        if($rankProvided&&!$rank)json_response(['success'=>false,'message'=>'Rank must be A, B, or C.'],400);
        $stopTypeProvided=array_key_exists('StopType',$b);
        $stopType=$stopTypeProvided?wf_hiyari_valid_stop_type($b['StopType']):wf_hiyari_valid_stop_type($row['StopType']??null);
        if($stopTypeProvided&&!$stopType)json_response(['success'=>false,'message'=>'StopType must be between 1 and 6.'],400);
        $location=array_key_exists('Location',$b)?trim((string)($b['Location']??'')):($row['Location']??null);
        $potentialConsequence=array_key_exists('PotentialConsequence',$b)?trim((string)($b['PotentialConsequence']??'')):($row['PotentialConsequence']??null);
        $suggestion=array_key_exists('Suggestion',$b)?trim((string)($b['Suggestion']??'')):($row['Suggestion']??null);
        if($status==='Closed'&&trim($corrective)==='')json_response(['success'=>false,'message'=>'CorrectiveAction is required.'],400);
        $isReopening=($row['Status']??'')==='Closed'&&$status!=='Closed';
        $reopenReason=array_key_exists('ReopenReason',$b)?trim((string)($b['ReopenReason']??'')):'';
        if($isReopening&&$reopenReason==='')json_response(['success'=>false,'message'=>'ReopenReason is required.'],400);
        $previousStatus=(string)($row['Status']??'');
        $previousReview=(string)($row['ReviewStatus']??'');
        $reviewChanged=$review!==$previousReview;
        $isClosing=$status==='Closed';
        $closeChanged=$isClosing&&$previousStatus!=='Closed';
        $nextClosedAt=$closeChanged?'__NOW__':($isReopening?null:($row['ClosedAt']??null));
        $nextClosedBy=$closeChanged?$actor:($isReopening?null:($row['ClosedBy']??null));
        $nextReopenReason=$isReopening?$reopenReason:($row['ReopenReason']??null);
        $nextReopenedAt=$isReopening?'__NOW__':($row['ReopenedAt']??null);
        $nextReopenedBy=$isReopening?$actor:($row['ReopenedBy']??null);
        $riskLevel=$rank?wf_hiyari_risk_from_rank($rank,$row['RiskLevel']??null):($row['RiskLevel']??'Low');
        db_execute("UPDATE hiyarireports SET ReportDate=?,Department=?,Location=?,Description=?,PotentialConsequence=?,Suggestion=?,RiskRank=?,RiskLevel=?,StopType=?,Status=?,CorrectiveAction=?,AdminComment=?,ReviewStatus=?,ReviewComment=?,ReviewedAt=CASE WHEN ?=1 THEN NOW() ELSE ReviewedAt END,ReviewedBy=CASE WHEN ?=1 THEN ? ELSE ReviewedBy END,ClosedAt=CASE WHEN ?='__NOW__' THEN NOW() ELSE ? END,ClosedBy=?,ReopenReason=?,ReopenedAt=CASE WHEN ?='__NOW__' THEN NOW() ELSE ? END,ReopenedBy=? WHERE id=?",[$reportDate,$department,$location,$description,$potentialConsequence,$suggestion,$rank,$riskLevel,$stopType,$status,$corrective,$adminComment,$review,$reviewComment,$reviewChanged?1:0,$reviewChanged?1:0,$actor,$nextClosedAt,$nextClosedAt,$nextClosedBy,$nextReopenReason,$nextReopenedAt,$nextReopenedAt,$nextReopenedBy,$p['id']]);
        $auditAction=$status==='Closed'&&$row['Status']!=='Closed'?'HIYARI_CLOSE':($row['Status']==='Closed'&&$status!=='Closed'?'HIYARI_REOPEN':($review!==($row['ReviewStatus']??null)&&$review==='Approved'?'HIYARI_REVIEW_APPROVED':($review!==($row['ReviewStatus']??null)&&$review==='Rejected'?'HIYARI_REVIEW_REJECTED':'HIYARI_UPDATE')));
        wf_hiyari_audit($user,$auditAction,$p['id'],'Updated Hiyari report',['previousStatus'=>$row['Status']??null,'nextStatus'=>$status,'previousReviewStatus'=>$row['ReviewStatus']??null,'nextReviewStatus'=>$review,'previousRank'=>$row['RiskRank']??null,'nextRank'=>$rank,'previousStopType'=>$row['StopType']??null,'nextStopType'=>$stopType,'businessFieldsChanged'=>array_intersect(array_keys($b),['ReportDate','Department','Location','Description','PotentialConsequence','Suggestion','RiskRank','Rank','StopType'])!==[],'reopenReason'=>$isReopening?$reopenReason:null]);
        $recipientInfo=wf_hiyari_user_recipient_info($row);
        if($recipientInfo['recipients']!==''&&$review!==$row['ReviewStatus']&&in_array($review,['Approved','Rejected'],true)){$mail=wf_hiyari_user_review_mail($row,$review,$reviewComment);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>$review,'Recipients'=>$recipientInfo['recipients'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);}
        if($recipientInfo['recipients']!==''&&$status!==$row['Status']&&($status==='Closed'||$row['Status']==='Closed')){$mail=wf_hiyari_user_status_mail($row,$status,$corrective,$isReopening?$reopenReason:$adminComment);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>$status==='Closed'?'Closed':'Reopened','Recipients'=>$recipientInfo['recipients'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);}
        json_response(['success'=>true]);
    }
    $p=route_params($path,'/hiyari/:id/attachment');
    if($p!==null&&$method==='POST'){
        require_admin();$files=wf_store_files('file',1);if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);
        if(!wf_hiyari_supporting_file_is($files[0]))wf_hiyari_reject_upload($files,'Additional attachment must be PDF, JPG, PNG, or WEBP.');
        $row=db_row('SELECT AdditionalFileUrl FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}
        $committed=false;
        try{
            db_execute('UPDATE hiyarireports SET AdditionalFileUrl=? WHERE id=?',[$files[0]['url'],$p['id']]);$committed=true;
            delete_uploaded_file($row['AdditionalFileUrl']??null);
            wf_hiyari_audit($user,'HIYARI_ATTACHMENT_UPDATE',$p['id'],'Updated Hiyari additional attachment',['replacedExisting'=>!empty($row['AdditionalFileUrl'])]);
            json_response(['success'=>true,'url'=>$files[0]['url']]);
        }catch(Throwable $e){if(!$committed)wf_cleanup_files($files);throw $e;}
    }
    $p=route_params($path,'/hiyari/:id/signed-file');
    if($p!==null&&$method==='POST'){
        $files=wf_store_files('file',1);if(!$files)json_response(['success'=>false,'message'=>'No file uploaded.'],400);
        if(!wf_hiyari_file_is($files[0],['application/pdf'],['pdf']))wf_hiyari_reject_upload($files,'Signed file must be a PDF.');
        $row=db_row('SELECT id,ReporterID,SubmittedByID,ReporterName,Department,ReportDate,CompanyEmail,Location,RiskRank,StopType,ReviewStatus,SignedFileUrl FROM hiyarireports WHERE id=? AND DeletedAt IS NULL',[$p['id']]);if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}
        if(!$admin&&!in_array(wf_user_id($user),[(string)$row['ReporterID'],(string)$row['SubmittedByID']],true)){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}
        $canAttachSignedPdf=($row['ReviewStatus']??'')==='Approved'||(($row['ReviewStatus']??'')==='Completed'&&!empty($row['SignedFileUrl']));if(!$canAttachSignedPdf){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Signed PDF can be uploaded after Excel review is approved.'],400);}
        $committed=false;
        try{
            db_execute("UPDATE hiyarireports SET SignedFileUrl=?,SignedUploadedAt=NOW(),ReviewStatus='Completed' WHERE id=?",[$files[0]['url'],$p['id']]);$committed=true;
            delete_uploaded_file($row['SignedFileUrl']??null);
            wf_hiyari_audit($user,'HIYARI_SIGNED_FILE_UPLOAD',$p['id'],'Uploaded signed Hiyari file',['replacedExisting'=>!empty($row['SignedFileUrl'])]);
            $mail=wf_hiyari_new_report_mail(['reportId'=>$p['id'],'reporterName'=>$row['ReporterName']??'-','reporterId'=>$row['ReporterID']??'-','department'=>$row['Department']??'-','submitterName'=>$actor,'date'=>$row['ReportDate']??'-','companyEmail'=>$row['CompanyEmail']??'-','location'=>$row['Location']??null,'rank'=>$row['RiskRank']??null,'stopType'=>$row['StopType']??null],true);
            wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>'SignedFileUploaded','Recipients'=>wf_hiyari_admin_email(),'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
            $recipientInfo=wf_hiyari_user_recipient_info($row);if($recipientInfo['recipients']!==''){$completed=wf_hiyari_completed_mail($row);wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$p['id'],'EventType'=>'Completed','Recipients'=>$recipientInfo['recipients'],'Subject'=>$completed['subject'],'Body'=>$completed['body'],'HtmlBody'=>$completed['html'],'Status'=>'Queued']);}
            json_response(['success'=>true,'url'=>$files[0]['url']]);
        }catch(Throwable $e){if(!$committed)wf_cleanup_files($files);throw $e;}
    }
    $p=route_params($path,'/hiyari/:id'); if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE hiyarireports SET DeletedAt=NOW(),DeletedBy=? WHERE id=? AND DeletedAt IS NULL',[$actor,$p['id']]);wf_hiyari_audit($user,'HIYARI_DELETE',$p['id'],'Soft deleted Hiyari report');json_response(['success'=>true]);}
    return false;
}

function wf_ky_audit(array $user, string $action, string $targetId, string $detail = '', array $metadata = []): void
{
    try {
        db()->exec("CREATE TABLE IF NOT EXISTS admin_auditlogs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ActionTime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            AdminID VARCHAR(50) NOT NULL,
            AdminName VARCHAR(100),
            Role VARCHAR(50),
            Department VARCHAR(100),
            Module VARCHAR(80),
            Action VARCHAR(80) NOT NULL,
            Method VARCHAR(10),
            Path VARCHAR(255),
            StatusCode INT,
            TargetType VARCHAR(80),
            TargetID VARCHAR(100),
            Detail TEXT,
            Metadata TEXT,
            IPAddress VARCHAR(80),
            UserAgent VARCHAR(255),
            INDEX idx_action(Action),
            INDEX idx_admin(AdminID),
            INDEX idx_module(Module),
            INDEX idx_actiontime(ActionTime)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        db_execute(
            'INSERT INTO admin_auditlogs (AdminID,AdminName,Role,Department,Module,Action,Method,Path,StatusCode,TargetType,TargetID,Detail,Metadata,IPAddress,UserAgent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                wf_user_id($user),
                wf_user_name($user),
                $user['role'] ?? $user['Role'] ?? null,
                $user['department'] ?? $user['Department'] ?? null,
                'ky',
                $action,
                $_SERVER['REQUEST_METHOD'] ?? null,
                substr((string)($_SERVER['REQUEST_URI'] ?? ''), 0, 255),
                200,
                'KY_Activities',
                $targetId,
                $detail,
                json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $_SERVER['REMOTE_ADDR'] ?? null,
                substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
    } catch (Throwable $e) {
        // Audit must not break the KY workflow.
    }
}

function wf_ensure_ky_tables(): void
{
    db()->exec("CREATE TABLE IF NOT EXISTS ky_activities (
        id VARCHAR(36) PRIMARY KEY,ActivityDate DATE NOT NULL,ReporterID VARCHAR(50) NOT NULL,ReporterName VARCHAR(100) NOT NULL,ReporterEmail VARCHAR(150),
        SubmittedByID VARCHAR(50),SubmittedByName VARCHAR(100),Department VARCHAR(100) NOT NULL,SafetyUnit VARCHAR(100),TeamName VARCHAR(100),Participants TEXT,
        KYTKeyword VARCHAR(255),RiskCategory VARCHAR(50) DEFAULT 'General',HazardDescription TEXT NOT NULL,Countermeasure TEXT,AttachmentUrl TEXT,VideoUrl TEXT,
        ShowVideoOnDashboard TINYINT(1) NOT NULL DEFAULT 1,IsVideoPinned TINYINT(1) NOT NULL DEFAULT 0,Status VARCHAR(20) NOT NULL DEFAULT 'Open',AdminComment TEXT,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_dept_ym(Department,ActivityDate),KEY idx_status(Status),KEY idx_date(ActivityDate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS ky_program_config (id INT AUTO_INCREMENT PRIMARY KEY,Year INT NOT NULL,Department VARCHAR(100) NOT NULL,SafetyUnits TEXT,YearlyTarget INT NOT NULL DEFAULT 12,DeadlineDay TINYINT DEFAULT 15,DeadlineNote VARCHAR(255),IsActive TINYINT(1) NOT NULL DEFAULT 1,CreatedBy VARCHAR(50),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_year_dept(Year,Department)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS ky_video_reactions (id INT AUTO_INCREMENT PRIMARY KEY,ActivityID VARCHAR(36) NOT NULL,EmployeeID VARCHAR(50) NOT NULL,Reaction VARCHAR(30) NOT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,UNIQUE KEY uq_react(ActivityID,EmployeeID),KEY idx_activity(ActivityID)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS ky_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,ActivityID VARCHAR(36),EventType VARCHAR(60) NOT NULL,Recipient VARCHAR(180) NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(20) NOT NULL DEFAULT 'Queued',Error TEXT,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,SentAt DATETIME NULL,KEY idx_activity(ActivityID),KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE ky_activities ADD COLUMN ReporterEmail VARCHAR(150)",
        "ALTER TABLE ky_activities ADD COLUMN SubmittedByID VARCHAR(50)",
        "ALTER TABLE ky_activities ADD COLUMN SubmittedByName VARCHAR(100)",
        "ALTER TABLE ky_activities ADD COLUMN SafetyUnit VARCHAR(100)",
        "ALTER TABLE ky_activities ADD COLUMN ShowVideoOnDashboard TINYINT(1) NOT NULL DEFAULT 1",
        "ALTER TABLE ky_activities ADD COLUMN IsVideoPinned TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE ky_emailoutbox ADD COLUMN HtmlBody MEDIUMTEXT",
    ] as $sql) wf_try_exec($sql);
}

function wf_ky_admin_email(): string
{
    if (defined('KY_ADMIN_EMAIL') && KY_ADMIN_EMAIL) return (string)KY_ADMIN_EMAIL;
    if (defined('HIYARI_ADMIN_EMAIL') && HIYARI_ADMIN_EMAIL) return (string)HIYARI_ADMIN_EMAIL;
    if (defined('ADMIN_EMAIL') && ADMIN_EMAIL) return (string)ADMIN_EMAIL;
    return defined('SMTP_FROM') && SMTP_FROM ? (string)SMTP_FROM : 'sattaya_w@thaisummit-harness.co.th';
}

function wf_ky_units($value): array
{
    $items = wf_json($value, []);
    if (!$items && is_string($value) && trim($value) !== '') {
        $items = preg_split('/[,;\r\n]+/', $value) ?: [];
    }
    return array_values(array_unique(array_filter(array_map(static function ($v) {
        return trim((string)$v);
    }, $items))));
}

function wf_ky_norm_key($value): string
{
    $text = preg_replace('/\s+/u', ' ', trim((string)$value)) ?: '';
    return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
}

function wf_ky_participant_employee_ids($value): array
{
    $ids = [];
    $add = static function ($item) use (&$ids): void {
        if ($item === null) return;
        if (is_string($item) || is_numeric($item)) {
            $text = trim((string)$item);
            if (preg_match('/^[A-Za-z0-9._-]{2,30}$/', $text) && preg_match('/\d/', $text)) $ids[$text] = true;
            return;
        }
        if (!is_array($item)) return;
        foreach (['EmployeeID','employeeId','employeeID','id','ID','empId'] as $key) {
            if (isset($item[$key]) && trim((string)$item[$key]) !== '') {
                $ids[trim((string)$item[$key])] = true;
                return;
            }
        }
    };
    if (is_array($value)) {
        foreach ($value as $item) $add($item);
    } else {
        $raw = trim((string)$value);
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                if (array_is_list($decoded)) foreach ($decoded as $item) $add($item);
                elseif (isset($decoded['participants']) && is_array($decoded['participants'])) foreach ($decoded['participants'] as $item) $add($item);
                else $add($decoded);
            } else {
                foreach (explode(',', $raw) as $item) $add($item);
            }
        }
    }
    return array_keys($ids);
}

function wf_ky_can_upload_followup_video(array $row, array $user): bool
{
    if (wf_is_admin($user)) return true;
    $userId = wf_user_id($user);
    if ($userId === '' || $userId === 'unknown') return false;
    if (in_array($userId, [trim((string)($row['ReporterID'] ?? '')), trim((string)($row['SubmittedByID'] ?? ''))], true)) return true;
    return in_array($userId, wf_ky_participant_employee_ids($row['Participants'] ?? ''), true);
}

function wf_ky_mail(string $event, array $row, array $extra = []): array
{
    $labels = [
        'Submitted' => 'Submitted',
        'AdminSubmitted' => 'New KY activity waiting for review',
        'Reviewed' => 'Reviewed',
        'Closed' => 'Closed',
        'MissingReminder' => 'Missing KY submission reminder',
    ];
    $label = $labels[$event] ?? $event;
    $tone = in_array($event, ['Reviewed', 'Closed'], true) ? 'completed' : 'pending';
    $comment = trim((string)($extra['comment'] ?? $row['AdminComment'] ?? ''));
    return wf_hiyari_mail([
        'subject' => '[KY Ability] ' . $label . (!empty($row['Department']) ? ' - ' . $row['Department'] : ''),
        'title' => 'KY Ability - ' . $label,
        'kicker' => 'KY ABILITY / KIKEN YOCHI ACTIVITY',
        'moduleLabel' => 'KY Ability / Kiken Yochi Activity Module',
        'tone' => $tone,
        'greeting' => (string)($extra['greeting'] ?? 'Dear Safety Admin / Related user'),
        'intro' => (array)($extra['intro'] ?? [
            'A KY activity workflow event has been recorded in TSH Safety Core.',
            'Please review the details in KY Ability and take the next action if required.',
        ]),
        'details' => [
            ['label' => 'Activity ID', 'value' => $row['id'] ?? $row['ActivityID'] ?? '-', 'highlight' => true],
            ['label' => 'Event', 'value' => $label, 'highlight' => true],
            ['label' => 'Activity Date', 'value' => $row['ActivityDate'] ?? '-'],
            ['label' => 'Reporter', 'value' => $row['ReporterName'] ?? '-'],
            ['label' => 'Reporter ID', 'value' => $row['ReporterID'] ?? '-'],
            ['label' => 'Department', 'value' => $row['Department'] ?? '-'],
            ['label' => 'Safety Unit', 'value' => $row['SafetyUnit'] ?? '-'],
            ['label' => 'KYT Keyword', 'value' => $row['KYTKeyword'] ?? '-'],
            ['label' => 'Risk Category', 'value' => $row['RiskCategory'] ?? '-', 'highlight' => true],
            ['label' => 'Status', 'value' => $row['Status'] ?? '-'],
            ['label' => 'Admin Comment', 'value' => $comment !== '' ? $comment : '-'],
        ],
        'actions' => (array)($extra['actions'] ?? [
            'Open KY Ability in TSH Safety Core.',
            'Review the hazard, countermeasure, evidence, and current status.',
        ]),
        'note' => (string)($extra['note'] ?? ($row['HazardDescription'] ?? '')),
    ]);
}

function wf_ky_reminder_rows(int $year, int $month): array
{
    $configs = safe_rows('SELECT Department,SafetyUnits,YearlyTarget,DeadlineDay,DeadlineNote FROM ky_program_config WHERE Year=? AND IsActive=1 ORDER BY Department', [$year]);
    $rows = [];
    foreach ($configs as $cfg) {
        $dept = trim((string)($cfg['Department'] ?? ''));
        if ($dept === '') continue;
        $units = wf_ky_units($cfg['SafetyUnits'] ?? []);
        $scopes = $units ?: [''];
        foreach ($scopes as $unit) {
            $params = [$dept, $year, $month];
            $sql = 'SELECT id FROM ky_activities WHERE Department=? AND YEAR(ActivityDate)=? AND MONTH(ActivityDate)=?';
            if ($unit !== '') {
                $sql .= ' AND SafetyUnit=?';
                $params[] = $unit;
            }
            if (db_row($sql . ' LIMIT 1', $params)) continue;
            $employees = safe_rows("SELECT EmployeeID,EmployeeName,Department,CompanyEmail FROM employees WHERE Department=? AND CompanyEmail IS NOT NULL AND CompanyEmail<>'' ORDER BY EmployeeName LIMIT 10", [$dept]);
            $recipients = array_values(array_filter($employees, static fn($e) => filter_var((string)($e['CompanyEmail'] ?? ''), FILTER_VALIDATE_EMAIL)));
            $key = $year . '-' . str_pad((string)$month, 2, '0', STR_PAD_LEFT) . '|' . $dept . '|' . $unit;
            $rows[] = [
                'key' => $key,
                'year' => $year,
                'month' => $month,
                'department' => $dept,
                'safetyUnit' => $unit,
                'candidateScope' => $unit !== '' ? 'unit' : 'dept',
                'readiness' => $recipients ? 'ready' : 'missing_email',
                'reason' => $recipients ? null : 'No valid CompanyEmail found for this department',
                'recipients' => $recipients,
                'reviewCandidates' => $employees,
            ];
        }
    }
    $ready = count(array_filter($rows, static fn($r) => $r['readiness'] === 'ready'));
    $recipientCount = 0;
    foreach ($rows as $row) if ($row['readiness'] === 'ready') $recipientCount += count($row['recipients']);
    return [
        'year' => $year,
        'month' => $month,
        'rows' => $rows,
        'summary' => [
            'total' => count($rows),
            'ready' => $ready,
            'blocked' => count($rows) - $ready,
            'recipients' => $recipientCount,
        ],
        'requiredPositions' => [],
        'smtpConfigured' => mailer_smtp_configured(),
    ];
}

function wf_ky_stats(int $year): array
{
    $configs = safe_rows('SELECT Department,SafetyUnits,YearlyTarget,DeadlineDay,DeadlineNote FROM ky_program_config WHERE Year=? AND IsActive=1 ORDER BY Department', [$year]);
    $configMap = [];
    $targetDepts = [];
    foreach ($configs as $cfg) {
        $dept = trim((string)($cfg['Department'] ?? ''));
        if ($dept === '') continue;
        $configMap[$dept] = $cfg;
        $targetDepts[] = $dept;
    }
    $usingConfig = count($targetDepts) > 0;
    if (!$usingConfig) {
        $targetDepts = array_map(static fn($r) => trim((string)($r['Name'] ?? $r['name'] ?? '')), safe_rows('SELECT Name FROM master_departments ORDER BY Name'));
        $targetDepts = array_values(array_filter($targetDepts));
    }
    $deptFilter = $usingConfig && $targetDepts ? ' AND Department IN (' . implode(',', array_fill(0, count($targetDepts), '?')) . ')' : '';
    $deptParams = $usingConfig && $targetDepts ? $targetDepts : [];

    $kpi = db_row("SELECT COUNT(*) AS total,COUNT(DISTINCT Department) AS rawDeptSubmitted,SUM(Status='Open') AS open,SUM(Status='Reviewed') AS reviewed,SUM(Status='Closed') AS closed FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter}", array_merge([$year], $deptParams)) ?: [];
    $monthly = safe_rows("SELECT MONTH(ActivityDate) AS month,COUNT(*) AS count FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} GROUP BY MONTH(ActivityDate) ORDER BY month", array_merge([$year], $deptParams));
    $byDept = safe_rows("SELECT Department,COUNT(*) AS count FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} GROUP BY Department ORDER BY count DESC LIMIT 20", array_merge([$year], $deptParams));
    $deptMonthly = safe_rows("SELECT Department,MONTH(ActivityDate) AS month,COUNT(*) AS count FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} GROUP BY Department,MONTH(ActivityDate) ORDER BY Department,month", array_merge([$year], $deptParams));
    $statusDist = safe_rows("SELECT Status,COUNT(*) AS count FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} GROUP BY Status", array_merge([$year], $deptParams));
    $riskCat = safe_rows("SELECT COALESCE(RiskCategory,'General') AS label,COUNT(*) AS count FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} GROUP BY RiskCategory ORDER BY count DESC", array_merge([$year], $deptParams));
    $topKeywords = safe_rows("SELECT KYTKeyword AS keyword,COUNT(*) AS count FROM ky_activities WHERE YEAR(ActivityDate)=? AND KYTKeyword IS NOT NULL AND KYTKeyword<>''{$deptFilter} GROUP BY KYTKeyword ORDER BY count DESC LIMIT 10", array_merge([$year], $deptParams));
    $yearlyRows = safe_rows("SELECT Department,COALESCE(SafetyUnit,'') AS SafetyUnit,COUNT(*) AS submitted FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} GROUP BY Department,COALESCE(SafetyUnit,'')", array_merge([$year], $deptParams));

    $yearlyMap = [];
    $yearlyUnitMap = [];
    foreach ($yearlyRows as $row) {
        $dept = (string)($row['Department'] ?? '');
        $unit = trim((string)($row['SafetyUnit'] ?? ''));
        $count = (int)($row['submitted'] ?? 0);
        $yearlyMap[$dept] = ($yearlyMap[$dept] ?? 0) + $count;
        if ($unit !== '') $yearlyUnitMap[$dept . '||' . $unit] = $count;
    }

    $currentMonth = (int)date('n');
    $currentYear = (int)date('Y');
    $pendingDepts = [];
    $pendingUnits = [];
    if ($year === $currentYear && $targetDepts) {
        $submittedRows = safe_rows("SELECT DISTINCT Department,COALESCE(SafetyUnit,'') AS SafetyUnit FROM ky_activities WHERE YEAR(ActivityDate)=? AND MONTH(ActivityDate)=?{$deptFilter}", array_merge([$year, $currentMonth], $deptParams));
        $submittedDepts = [];
        $submittedUnits = [];
        foreach ($submittedRows as $row) {
            $submittedDepts[(string)$row['Department']] = true;
            $submittedUnits[(string)$row['Department'] . '||' . trim((string)($row['SafetyUnit'] ?? ''))] = true;
        }
        foreach ($targetDepts as $dept) {
            $units = wf_ky_units($configMap[$dept]['SafetyUnits'] ?? []);
            if ($units) {
                $missing = array_values(array_filter($units, static fn($unit) => empty($submittedUnits[$dept . '||' . $unit])));
                if ($missing) $pendingDepts[] = $dept;
                foreach ($missing as $unit) $pendingUnits[] = ['department' => $dept, 'safetyUnit' => $unit];
            } elseif (empty($submittedDepts[$dept])) {
                $pendingDepts[] = $dept;
            }
        }
    }

    $programProgress = [];
    foreach ($targetDepts as $dept) {
        $cfg = $configMap[$dept] ?? [];
        $units = wf_ky_units($cfg['SafetyUnits'] ?? []);
        $unitTarget = max(0, (int)($cfg['YearlyTarget'] ?? 12));
        $target = max(1, count($units) ?: 1) * $unitTarget;
        $submitted = (int)($yearlyMap[$dept] ?? 0);
        $unitProgress = [];
        foreach ($units as $unit) {
            $unitSubmitted = (int)($yearlyUnitMap[$dept . '||' . $unit] ?? 0);
            $unitProgress[] = ['name'=>$unit,'submitted'=>$unitSubmitted,'target'=>$unitTarget,'pct'=>$unitTarget > 0 ? min(100, (int)round($unitSubmitted / $unitTarget * 100)) : 0];
        }
        $programProgress[] = [
            'department'=>$dept,'submitted'=>$submitted,'target'=>$target,'pct'=>$target > 0 ? min(100, (int)round($submitted / $target * 100)) : 0,
            'safetyUnits'=>$units,'safetyUnitProgress'=>$unitProgress,'unitTarget'=>$unitTarget,'unitCount'=>count($units) ?: 1,
            'deadlineDay'=>(int)($cfg['DeadlineDay'] ?? 15),'deadlineNote'=>$cfg['DeadlineNote'] ?? null,
        ];
    }
    $submittedDepts = array_values(array_filter($targetDepts, static fn($dept) => (int)($yearlyMap[$dept] ?? 0) > 0));
    $targetTotal = array_sum(array_map(static fn($p) => (int)$p['target'], $programProgress));
    $targetSubmitted = array_sum(array_map(static fn($p) => (int)$p['submitted'], $programProgress));
    $safetyUnitsTotal = array_sum(array_map(static fn($p) => (int)$p['unitCount'], $programProgress));

    return [
        'kpi' => [
            'total'=>(int)($kpi['total'] ?? 0),
            'deptSubmitted'=>count($submittedDepts),
            'totalDepts'=>count($targetDepts),
            'pendingDepts'=>max(0, count($targetDepts) - count($submittedDepts)),
            'safetyUnitsTotal'=>$safetyUnitsTotal,
            'targetTotal'=>$targetTotal,
            'targetSubmitted'=>$targetSubmitted,
            'completionRate'=>count($targetDepts) > 0 ? (int)round(count($submittedDepts) / count($targetDepts) * 100) : 0,
            'open'=>(int)($kpi['open'] ?? 0),
            'reviewed'=>(int)($kpi['reviewed'] ?? 0),
            'closed'=>(int)($kpi['closed'] ?? 0),
        ],
        'monthly'=>$monthly,
        'byDept'=>$byDept,
        'deptMonthly'=>$deptMonthly,
        'statusDist'=>$statusDist,
        'riskCat'=>$riskCat,
        'riskDist'=>$riskCat,
        'deptRank'=>$byDept,
        'topKeywords'=>$topKeywords,
        'keywordRank'=>$topKeywords,
        'pendingDepts'=>array_values(array_unique($pendingDepts)),
        'pendingUnits'=>$pendingUnits,
        'programProgress'=>$programProgress,
        'usingConfig'=>$usingConfig,
        'recent'=>safe_rows("SELECT * FROM ky_activities WHERE YEAR(ActivityDate)=?{$deptFilter} ORDER BY ActivityDate DESC,CreatedAt DESC LIMIT 10", array_merge([$year], $deptParams)),
    ];
}

function handle_ky_routes(string $method, string $path): bool
{
    if (strpos($path, '/ky') !== 0) return false;
    $user=require_user(); wf_ensure_ky_tables(); $admin=wf_is_admin($user); $actor=wf_user_name($user);
    if($method==='GET'&&$path==='/ky/employees'){ $q='%'.trim((string)($_GET['q']??'')).'%'; json_response(['success'=>true,'data'=>db_rows('SELECT EmployeeID,EmployeeName,Department,Position,CompanyEmail FROM employees WHERE EmployeeID LIKE ? OR EmployeeName LIKE ? ORDER BY EmployeeName LIMIT 50',[$q,$q])]);}
    if($method==='GET'&&$path==='/ky/email-profile'){ $row=db_row('SELECT EmployeeID,EmployeeName,Department,Position,CompanyEmail FROM employees WHERE EmployeeID=?',[wf_user_id($user)]); json_response(['success'=>true,'data'=>$row]);}
    if($method==='GET'&&$path==='/ky/stats'){json_response(['success'=>true,'data'=>wf_ky_stats((int)($_GET['year']??date('Y')))]);}
    if($method==='GET'&&$path==='/ky/check'){ $dept=$_GET['dept']??($user['department']??''); $year=(int)($_GET['year']??date('Y')); $month=(int)($_GET['month']??0); $unit=$_GET['unit']??null; $sql='SELECT id FROM ky_activities WHERE Department=? AND YEAR(ActivityDate)=?';$pa=[$dept,$year]; if($month>0){$sql.=' AND MONTH(ActivityDate)=?';$pa[]=$month;} if($unit){$sql.=' AND SafetyUnit=?';$pa[]=$unit;} $rows=db_rows($sql.' ORDER BY ActivityDate DESC',$pa); json_response(['success'=>true,'submitted'=>count($rows)>0,'count'=>count($rows),'items'=>$rows]);}
    if($method==='GET'&&$path==='/ky/program-config'){ $year=(int)($_GET['year']??date('Y')); json_response(['success'=>true,'data'=>db_rows('SELECT * FROM ky_program_config WHERE Year=? ORDER BY Department',[$year])]);}
    if($method==='POST'&&$path==='/ky/program-config'){require_admin();$b=json_body();$year=(int)($b['Year']??date('Y'));$dept=wf_text($b['Department']??'',100);if(!$dept)json_response(['success'=>false,'message'=>'Department is required.'],400);db_execute('INSERT INTO ky_program_config (Year,Department,SafetyUnits,YearlyTarget,DeadlineDay,DeadlineNote,IsActive,CreatedBy) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE SafetyUnits=VALUES(SafetyUnits),YearlyTarget=VALUES(YearlyTarget),DeadlineDay=VALUES(DeadlineDay),DeadlineNote=VALUES(DeadlineNote),IsActive=VALUES(IsActive)',[$year,$dept,is_array($b['SafetyUnits']??null)?json_encode($b['SafetyUnits'],JSON_UNESCAPED_UNICODE):($b['SafetyUnits']??null),(int)($b['YearlyTarget']??12),(int)($b['DeadlineDay']??15),$b['DeadlineNote']??null,wf_bool($b['IsActive']??1),$actor]);json_response(['success'=>true,'id'=>(int)db()->lastInsertId()]);}
    $p=route_params($path,'/ky/program-config/:cfgId'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE ky_program_config SET Department=COALESCE(?,Department),SafetyUnits=COALESCE(?,SafetyUnits),YearlyTarget=COALESCE(?,YearlyTarget),DeadlineDay=COALESCE(?,DeadlineDay),DeadlineNote=COALESCE(?,DeadlineNote),IsActive=COALESCE(?,IsActive) WHERE id=?',[$b['Department']??null,isset($b['SafetyUnits'])?(is_array($b['SafetyUnits'])?json_encode($b['SafetyUnits'],JSON_UNESCAPED_UNICODE):$b['SafetyUnits']):null,isset($b['YearlyTarget'])?(int)$b['YearlyTarget']:null,isset($b['DeadlineDay'])?(int)$b['DeadlineDay']:null,$b['DeadlineNote']??null,isset($b['IsActive'])?wf_bool($b['IsActive']):null,$p['cfgId']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('DELETE FROM ky_program_config WHERE id=?',[$p['cfgId']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/ky/reminder-queue'){
        require_admin();
        $year=(int)($_GET['year']??date('Y'));
        $month=(int)($_GET['month']??date('n'));
        if($month<1||$month>12)$month=(int)date('n');
        json_response(['success'=>true,'data'=>wf_ky_reminder_rows($year,$month)]);
    }
    if($method==='POST'&&$path==='/ky/reminders/send'){
        require_admin();
        $b=json_body();
        $year=(int)($b['year']??date('Y'));
        $month=(int)($b['month']??date('n'));
        if($month<1||$month>12)$month=(int)date('n');
        $keys=wf_json($b['keys']??[],[]);
        $data=wf_ky_reminder_rows($year,$month);
        $sent=0;$queued=0;$skipped=0;
        foreach($data['rows'] as $row){
            if($keys && !in_array($row['key'],$keys,true))continue;
            if(($row['readiness']??'')!=='ready'){ $skipped++; continue; }
            foreach($row['recipients'] as $recipient){
                $mail=wf_ky_mail('MissingReminder',[
                    'id'=>$row['key'],
                    'ActivityDate'=>$year.'-'.str_pad((string)$month,2,'0',STR_PAD_LEFT).'-01',
                    'ReporterName'=>$recipient['EmployeeName']??'-',
                    'ReporterID'=>$recipient['EmployeeID']??'-',
                    'Department'=>$row['department'],
                    'SafetyUnit'=>$row['safetyUnit'],
                    'KYTKeyword'=>'Monthly KY submission',
                    'RiskCategory'=>'Follow-up',
                    'Status'=>'Missing',
                    'HazardDescription'=>'KY activity has not been submitted for this monthly scope.',
                ],[
                    'greeting'=>'Dear '.$recipient['EmployeeName'],
                    'intro'=>['The system found that KY activity has not been submitted for this month.','Please submit KY activity in KY Ability when ready.'],
                    'actions'=>['Open KY Ability > Submit KY Activity.','Submit the monthly KY activity for the listed department or Safety Unit.'],
                ]);
                wf_email_outbox('ky_emailoutbox',['ActivityID'=>$row['key'],'EventType'=>'MissingReminder','Recipient'=>$recipient['CompanyEmail'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
                $queued++; if(mailer_smtp_configured())$sent++;
            }
        }
        json_response(['success'=>true,'message'=>'KY reminder queued','data'=>['summary'=>['queued'=>$queued,'sent'=>$sent,'skipped'=>$skipped,'recipients'=>$queued],'smtpConfigured'=>mailer_smtp_configured()]]);
    }
    if($method==='GET'&&$path==='/ky/video-showcase'){ $year=(int)($_GET['year']??date('Y'));$limit=min(max((int)($_GET['limit']??6),1),50);$userId=wf_user_id(require_user())?:'__anonymous__'; json_response(['success'=>true,'data'=>db_rows("SELECT a.*,COALESCE(rc.UsefulCount,0) AS UsefulCount,COALESCE(rc.PracticeCount,0) AS PracticeCount,COALESCE(rc.AwarenessCount,0) AS AwarenessCount,COALESCE(rc.AttentionCount,0) AS AttentionCount,COALESCE(rc.ReactionTotal,0) AS ReactionTotal,COALESCE(rc.ReactionTotal,0) AS ReactionCount,ur.Reaction AS MyReaction FROM ky_activities a LEFT JOIN (SELECT ActivityID,SUM(Reaction='useful') AS UsefulCount,SUM(Reaction='practice') AS PracticeCount,SUM(Reaction='awareness') AS AwarenessCount,SUM(Reaction='attention') AS AttentionCount,COUNT(*) AS ReactionTotal FROM ky_video_reactions GROUP BY ActivityID) rc ON rc.ActivityID=a.id LEFT JOIN ky_video_reactions ur ON ur.ActivityID=a.id AND ur.EmployeeID=? WHERE a.VideoUrl IS NOT NULL AND a.VideoUrl<>'' AND COALESCE(a.ShowVideoOnDashboard,1)=1 AND YEAR(a.ActivityDate)=? ORDER BY COALESCE(a.IsVideoPinned,0) DESC,COALESCE(rc.ReactionTotal,0) DESC,a.CreatedAt DESC LIMIT ?",[$userId,$year,$limit])]);}
    if($method==='GET'&&$path==='/ky/file-health'){require_admin();$year=(int)($_GET['year']??date('Y'));$records=db_rows('SELECT id,ActivityDate,ReporterID,ReporterName,Department,SafetyUnit,TeamName,KYTKeyword,AttachmentUrl,VideoUrl,Status,CreatedAt FROM ky_activities WHERE YEAR(ActivityDate)=? ORDER BY ActivityDate DESC,CreatedAt DESC',[$year]);$roots=[upload_dir(),dirname(__DIR__,2).DIRECTORY_SEPARATOR.'backend'.DIRECTORY_SEPARATOR.'uploads'];$files=[];$fields=[['AttachmentUrl','Attachment'],['VideoUrl','Video']];foreach($records as $r)foreach($fields as [$field,$label]){$url=trim((string)($r[$field]??''));$health=['field'=>$field,'url'=>$url,'scope'=>'empty','status'=>'empty','storedName'=>'','originalName'=>'','extension'=>'','size'=>null,'modifiedAt'=>null,'diskPath'=>null];if($url!==''){$pathPart=(string)parse_url($url,PHP_URL_PATH);$host=strtolower((string)parse_url($url,PHP_URL_HOST));$isLegacy=in_array($host,['localhost','127.0.0.1','::1'],true);$isUpload=strpos($pathPart,'/uploads/')!==false;$stored=$isUpload?basename(rawurldecode($pathPart)):'';parse_str((string)parse_url($url,PHP_URL_QUERY),$query);$disk=null;if($isUpload&&$stored!=='')foreach($roots as $root){$candidate=$root.DIRECTORY_SEPARATOR.$stored;if(is_file($candidate)){$disk=$candidate;break;}}$health=['field'=>$field,'url'=>$url,'scope'=>$isUpload?($isLegacy?'legacy-localhost':'local'):'external','status'=>$isLegacy?($disk?'legacy-localhost':'missing'):($isUpload?($disk?'ok':'missing'):'external'),'storedName'=>$stored,'originalName'=>$query['filename']??$stored,'extension'=>strtolower(pathinfo($stored,PATHINFO_EXTENSION)),'size'=>$disk?filesize($disk):null,'modifiedAt'=>$disk?date('c',filemtime($disk)):null,'diskPath'=>$disk?basename($disk):null];}$files[]=array_merge(['activityId'=>$r['id'],'activityDate'=>$r['ActivityDate'],'reporterId'=>$r['ReporterID'],'reporterName'=>$r['ReporterName'],'department'=>$r['Department'],'safetyUnit'=>$r['SafetyUnit'],'teamName'=>$r['TeamName'],'kytKeyword'=>$r['KYTKeyword'],'recordStatus'=>$r['Status'],'label'=>$label],$health);}$count=fn($s)=>count(array_filter($files,fn($f)=>$f['status']===$s));$missing=array_values(array_filter($files,fn($f)=>$f['status']==='missing'));$legacy=array_values(array_filter($files,fn($f)=>$f['scope']==='legacy-localhost'));json_response(['success'=>true,'data'=>['phase'=>'ky_media_file_health','readOnly'=>true,'year'=>$year,'summary'=>['activities'=>count($records),'references'=>count($files),'ok'=>$count('ok'),'missing'=>$count('missing'),'legacyLocalhost'=>count($legacy),'external'=>$count('external'),'empty'=>$count('empty')],'files'=>$files,'missingFiles'=>$missing,'legacyLocalhostFiles'=>$legacy,'note'=>'Read-only KY media health report. No files or database rows are changed automatically.']]);}
    if($method==='GET'&&$path==='/ky/evidence-overview'){
        $year=(int)($_GET['year']??date('Y'));
        $configs=db_rows('SELECT Department,SafetyUnits,YearlyTarget FROM ky_program_config WHERE Year=? AND IsActive=1 ORDER BY Department',[$year]);
        $rows=[];$rowMap=[];$deptKeys=[];
        foreach($configs as $deptIndex=>$cfg){$dept=trim((string)($cfg['Department']??''));if($dept==='')continue;$deptKeys[wf_ky_norm_key($dept)]=true;$units=wf_ky_units($cfg['SafetyUnits']??[]);foreach($units?:[''] as $unitIndex=>$unit){$key=wf_ky_norm_key($dept).'||'.wf_ky_norm_key($unit);if(isset($rowMap[$key]))continue;$row=['key'=>$key,'department'=>$dept,'safetyUnit'=>$unit,'yearlyTarget'=>(int)($cfg['YearlyTarget']??12),'submitted'=>0,'progressPct'=>0,'complete'=>0,'waitingVideo'=>0,'missingFile'=>0,'records'=>[],'order'=>$deptIndex*1000+$unitIndex];$rowMap[$key]=count($rows);$rows[]=$row;}}
        if(!$rows)json_response(['success'=>true,'data'=>['phase'=>'ky_evidence_overview_phase6','year'=>$year,'sourceOfTruth'=>'KY_Program_Config','rows'=>[],'summary'=>['departments'=>0,'safetyUnits'=>0,'submitted'=>0,'complete'=>0,'waitingVideo'=>0,'missingFile'=>0],'unmatchedActivities'=>[]]]);
        $activities=db_rows('SELECT id,ActivityDate,ReporterID,ReporterName,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,KYTKeyword,RiskCategory,HazardDescription,AttachmentUrl,VideoUrl,Status,Participants,CreatedAt FROM ky_activities WHERE YEAR(ActivityDate)=? ORDER BY ActivityDate DESC,CreatedAt DESC',[$year]);
        $unmatched=[];
        foreach($activities as $a){$deptKey=wf_ky_norm_key($a['Department']??'');if(empty($deptKeys[$deptKey]))continue;$key=$deptKey.'||'.wf_ky_norm_key($a['SafetyUnit']??'');if(!isset($rowMap[$key])){$unmatched[]=['id'=>$a['id']??null,'department'=>$a['Department']??null,'safetyUnit'=>$a['SafetyUnit']??null,'reason'=>'Safety Unit not active in Program Config'];continue;}$idx=$rowMap[$key];$hasFile=trim((string)($a['AttachmentUrl']??''))!=='';$hasVideo=trim((string)($a['VideoUrl']??''))!=='';$status=$hasFile&&$hasVideo?'complete':($hasFile?'waiting_video':'missing_file');$rows[$idx]['submitted']++;if($status==='complete')$rows[$idx]['complete']++;elseif($status==='waiting_video')$rows[$idx]['waitingVideo']++;else$rows[$idx]['missingFile']++;$rows[$idx]['records'][]=['id'=>$a['id']??null,'activityDate'=>$a['ActivityDate']??null,'reporterId'=>$a['ReporterID']??null,'reporterName'=>$a['ReporterName']??null,'submittedById'=>$a['SubmittedByID']??null,'submittedByName'=>$a['SubmittedByName']??null,'department'=>$rows[$idx]['department'],'safetyUnit'=>$rows[$idx]['safetyUnit'],'teamName'=>$a['TeamName']??null,'kytKeyword'=>$a['KYTKeyword']??null,'riskCategory'=>$a['RiskCategory']??null,'hazard'=>$a['HazardDescription']??null,'status'=>$a['Status']??null,'evidenceStatus'=>$status,'hasFile'=>$hasFile,'hasVideo'=>$hasVideo,'canUploadVideo'=>wf_ky_can_upload_followup_video($a,$user)&&(!$hasVideo||wf_is_admin($user))];}
        $summary=['departments'=>count(array_unique(array_map(fn($r)=>$r['department'],$rows))),'safetyUnits'=>count($rows),'submitted'=>0,'complete'=>0,'waitingVideo'=>0,'missingFile'=>0];
        $deptProgress=[];foreach($rows as &$r){$r['progressPct']=$r['yearlyTarget']>0?min(100,(int)round($r['submitted']/$r['yearlyTarget']*100)):0;$dk=wf_ky_norm_key($r['department']);if(!isset($deptProgress[$dk]))$deptProgress[$dk]=['submitted'=>0,'target'=>0,'pct'=>0];$deptProgress[$dk]['submitted']+=$r['submitted'];$deptProgress[$dk]['target']+=$r['yearlyTarget'];$deptProgress[$dk]['pct']=$deptProgress[$dk]['target']>0?min(100,(int)round($deptProgress[$dk]['submitted']/$deptProgress[$dk]['target']*100)):0;$summary['submitted']+=$r['submitted'];$summary['complete']+=$r['complete'];$summary['waitingVideo']+=$r['waitingVideo'];$summary['missingFile']+=$r['missingFile'];}unset($r);usort($rows,function($a,$b)use($deptProgress){$ap=$deptProgress[wf_ky_norm_key($a['department'])]['pct']??0;$bp=$deptProgress[wf_ky_norm_key($b['department'])]['pct']??0;return ($ap<=>$bp)?:strcmp((string)$a['department'],(string)$b['department'])?:((int)($a['order']??0)<=>(int)($b['order']??0));});foreach($rows as &$r){unset($r['order']);}unset($r);
        json_response(['success'=>true,'data'=>['phase'=>'ky_evidence_overview_phase6','year'=>$year,'sourceOfTruth'=>'KY_Program_Config','rows'=>$rows,'summary'=>$summary,'unmatchedActivities'=>$unmatched]]);
    }
    if($method==='POST'&&$path==='/ky/file-health/repair-legacy'){
        $repairUser=require_admin();$b=json_body();$year=(int)($b['year']??date('Y'));$apply=wf_bool($b['apply']??false);
        if($apply&&($b['confirmation']??'')!=='REPAIR_KY_LEGACY_URLS')json_response(['success'=>false,'message'=>'Apply requires confirmation REPAIR_KY_LEGACY_URLS.'],400);
        global $config;
        $configured=rtrim((string)($config['public_upload_base_url']??$config['public_app_url']??''),'/');
        $publicHost=strtolower((string)parse_url($configured,PHP_URL_HOST));
        if($publicHost===''||in_array($publicHost,['localhost','127.0.0.1','::1'],true)){$proto=trim(explode(',',(string)($_SERVER['HTTP_X_FORWARDED_PROTO']??(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'?'https':'http')))[0]);$host=trim(explode(',',(string)($_SERVER['HTTP_X_FORWARDED_HOST']??$_SERVER['HTTP_HOST']??''))[0]);$configured=rtrim($proto.'://'.$host,'/');$publicHost=strtolower((string)parse_url($configured,PHP_URL_HOST));}
        if($publicHost===''||in_array($publicHost,['localhost','127.0.0.1','::1'],true))json_response(['success'=>false,'message'=>'A non-local public upload base URL is required.'],400);
        $records=db_rows('SELECT id,ActivityDate,ReporterID,ReporterName,Department,SafetyUnit,TeamName,KYTKeyword,AttachmentUrl,VideoUrl FROM ky_activities WHERE YEAR(ActivityDate)=? ORDER BY ActivityDate DESC,CreatedAt DESC',[$year]);
        $roots=[upload_dir(),dirname(__DIR__,2).DIRECTORY_SEPARATOR.'backend'.DIRECTORY_SEPARATOR.'uploads'];$candidates=[];
        foreach($records as $r)foreach(['AttachmentUrl','VideoUrl'] as $field){$old=trim((string)($r[$field]??''));if($old==='')continue;$host=strtolower((string)parse_url($old,PHP_URL_HOST));$pathPart=(string)parse_url($old,PHP_URL_PATH);if(!in_array($host,['localhost','127.0.0.1','::1'],true)||strpos($pathPart,'/uploads/')===false)continue;$stored=basename(rawurldecode($pathPart));$disk=null;foreach($roots as $root){$candidate=$root.DIRECTORY_SEPARATOR.$stored;if(is_file($candidate)){$disk=$candidate;break;}}if(!$disk)continue;$query=(string)parse_url($old,PHP_URL_QUERY);$new=$configured.'/uploads/'.rawurlencode($stored).($query!==''?'?'.$query:'');$candidates[]=['activityId'=>$r['id'],'activityDate'=>$r['ActivityDate'],'reporterId'=>$r['ReporterID'],'reporterName'=>$r['ReporterName'],'department'=>$r['Department'],'safetyUnit'=>$r['SafetyUnit'],'teamName'=>$r['TeamName'],'kytKeyword'=>$r['KYTKeyword'],'field'=>$field,'storedName'=>$stored,'oldUrl'=>$old,'newUrl'=>$new,'size'=>filesize($disk),'modifiedAt'=>date('c',filemtime($disk))];}
        $repaired=0;
        if($apply&&$candidates){$pdo=db();$pdo->beginTransaction();try{foreach($candidates as $candidate){$field=$candidate['field']==='AttachmentUrl'?'AttachmentUrl':'VideoUrl';$stmt=$pdo->prepare("UPDATE ky_activities SET $field=? WHERE id=? AND $field=?");$stmt->execute([$candidate['newUrl'],$candidate['activityId'],$candidate['oldUrl']]);$repaired+=$stmt->rowCount();}if($repaired!==count($candidates))throw new RuntimeException('KY legacy URL repair conflict: expected '.count($candidates).', updated '.$repaired);$pdo->commit();}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}wf_ky_audit($repairUser,'KY_REPAIR_LEGACY_MEDIA_URLS',(string)$year,'Repaired '.$repaired.' KY legacy localhost media URL(s) for '.$year,['year'=>$year,'repaired'=>$repaired,'candidates'=>$candidates]);}
        json_response(['success'=>true,'data'=>['phase'=>'ky_media_legacy_url_repair','dryRun'=>!$apply,'applied'=>$apply,'year'=>$year,'repaired'=>$apply?$repaired:0,'candidateCount'=>count($candidates),'candidates'=>$candidates,'note'=>$apply?'Legacy localhost KY media URLs were rewritten to the configured public upload base URL.':'Dry run only. No database rows were changed.']]);
    }
    if($method==='GET'&&$path==='/ky/videos'){
        $kyVideoUser=require_user();$year=(int)($_GET['year']??date('Y'));$page=max((int)($_GET['page']??1),1);$pageSize=min(max((int)($_GET['pageSize']??12),1),50);$offset=($page-1)*$pageSize;$userId=wf_user_id($kyVideoUser)?:'__anonymous__';$adminVideos=wf_is_admin($kyVideoUser);
        $where=["a.VideoUrl IS NOT NULL","a.VideoUrl<>''","YEAR(a.ActivityDate)=?"];$pa=[$year];
        $add=function(string $condition,$value)use(&$where,&$pa){if($value===null||$value===''||$value==='all')return;$where[]=$condition;$pa[]=$value;};
        $add('a.Department=?',$_GET['department']??($_GET['dept']??null));$add('a.SafetyUnit=?',$_GET['safetyUnit']??null);$add('a.RiskCategory=?',$_GET['riskCategory']??($_GET['risk']??null));$add('a.Status=?',$_GET['status']??null);
        if(array_key_exists('pinned',$_GET)&&$_GET['pinned']!=='all'){$where[]='COALESCE(a.IsVideoPinned,0)=?';$pa[]=(($_GET['pinned']==='1'||$_GET['pinned']==='true')?1:0);}
        if(!$adminVideos){$where[]='COALESCE(a.ShowVideoOnDashboard,1)=1';}
        elseif(array_key_exists('show',$_GET)&&$_GET['show']!=='all'){$where[]='COALESCE(a.ShowVideoOnDashboard,1)=?';$pa[]=(($_GET['show']==='0'||$_GET['show']==='false'||$_GET['show']==='hidden')?0:1);}
        $q=trim((string)($_GET['q']??''));if($q!==''){$where[]='(a.ReporterName LIKE ? OR a.SubmittedByName LIKE ? OR a.Department LIKE ? OR a.SafetyUnit LIKE ? OR a.TeamName LIKE ? OR a.KYTKeyword LIKE ? OR a.HazardDescription LIKE ? OR a.Countermeasure LIKE ?)';$like='%'.$q.'%';array_push($pa,$like,$like,$like,$like,$like,$like,$like,$like);}
        $whereSql=implode(' AND ',$where);
        $join="LEFT JOIN (SELECT ActivityID,SUM(Reaction='useful') AS UsefulCount,SUM(Reaction='practice') AS PracticeCount,SUM(Reaction='awareness') AS AwarenessCount,SUM(Reaction='attention') AS AttentionCount,COUNT(*) AS ReactionTotal FROM ky_video_reactions GROUP BY ActivityID) rc ON rc.ActivityID=a.id LEFT JOIN ky_video_reactions ur ON ur.ActivityID=a.id AND ur.EmployeeID=?";
        $items=db_rows("SELECT a.id,a.ActivityDate,a.ReporterID,a.ReporterName,a.SubmittedByID,a.SubmittedByName,a.Department,a.SafetyUnit,a.TeamName,a.KYTKeyword,a.RiskCategory,a.HazardDescription,a.Countermeasure,a.VideoUrl,a.Status,a.IsVideoPinned,a.ShowVideoOnDashboard,a.CreatedAt,COALESCE(rc.UsefulCount,0) AS UsefulCount,COALESCE(rc.PracticeCount,0) AS PracticeCount,COALESCE(rc.AwarenessCount,0) AS AwarenessCount,COALESCE(rc.AttentionCount,0) AS AttentionCount,COALESCE(rc.ReactionTotal,0) AS ReactionTotal,COALESCE(rc.ReactionTotal,0) AS ReactionCount,ur.Reaction AS MyReaction FROM ky_activities a $join WHERE $whereSql ORDER BY COALESCE(a.IsVideoPinned,0) DESC,COALESCE(rc.ReactionTotal,0) DESC,a.CreatedAt DESC LIMIT ? OFFSET ?",array_merge([$userId],$pa,[$pageSize,$offset]));
        $total=(int)(db_row("SELECT COUNT(*) AS total FROM ky_activities a WHERE $whereSql",$pa)['total']??0);
        $summary=db_row("SELECT COUNT(*) AS totalVideos,SUM(COALESCE(a.IsVideoPinned,0)=1) AS pinnedVideos,SUM(COALESCE(a.ShowVideoOnDashboard,1)=0) AS hiddenVideos,COALESCE(SUM(COALESCE(rc.ReactionTotal,0)),0) AS totalReactions FROM ky_activities a LEFT JOIN (SELECT ActivityID,COUNT(*) AS ReactionTotal FROM ky_video_reactions GROUP BY ActivityID) rc ON rc.ActivityID=a.id WHERE $whereSql",$pa)?:[];
        $departments=db_rows("SELECT a.Department,COUNT(*) AS count FROM ky_activities a WHERE $whereSql AND COALESCE(a.Department,'')<>'' GROUP BY a.Department ORDER BY count DESC,a.Department LIMIT 20",$pa);
        json_response(['success'=>true,'data'=>['items'=>$items,'pagination'=>['page'=>$page,'pageSize'=>$pageSize,'total'=>$total,'pages'=>(int)ceil($total/$pageSize)],'summary'=>['totalVideos'=>(int)($summary['totalVideos']??0),'totalReactions'=>(int)($summary['totalReactions']??0),'pinnedVideos'=>(int)($summary['pinnedVideos']??0),'hiddenVideos'=>(int)($summary['hiddenVideos']??0),'departments'=>$departments],'filters'=>['year'=>$year,'department'=>$_GET['department']??($_GET['dept']??'all'),'safetyUnit'=>$_GET['safetyUnit']??'all','riskCategory'=>$_GET['riskCategory']??($_GET['risk']??'all'),'status'=>$_GET['status']??'all','pinned'=>$_GET['pinned']??'all','show'=>$adminVideos?($_GET['show']??'all'):'1','q'=>$q]]]);
    }
    $p=route_params($path,'/ky/:id/reaction'); if($p!==null&&$method==='POST'){ $b=json_body();$reaction=$b['reaction']??'useful';if(!in_array($reaction,['useful','practice','awareness','attention'],true))json_response(['success'=>false,'message'=>'Invalid reaction.'],400);db_execute('INSERT INTO ky_video_reactions (ActivityID,EmployeeID,Reaction) VALUES (?,?,?) ON DUPLICATE KEY UPDATE Reaction=VALUES(Reaction)',[$p['id'],wf_user_id($user),$reaction]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){db_execute('DELETE FROM ky_video_reactions WHERE ActivityID=? AND EmployeeID=?',[$p['id'],wf_user_id($user)]);json_response(['success'=>true]);}
    $p=route_params($path,'/ky/:id/video-dashboard'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();db_execute('UPDATE ky_activities SET ShowVideoOnDashboard=COALESCE(?,ShowVideoOnDashboard),IsVideoPinned=COALESCE(?,IsVideoPinned) WHERE id=?',[array_key_exists('show',$b)?wf_bool($b['show']):null,array_key_exists('pinned',$b)?wf_bool($b['pinned']):null,$p['id']]);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/ky'){ $sql='SELECT * FROM ky_activities WHERE 1=1';$pa=[];foreach(['status'=>'Status','department'=>'Department','safetyUnit'=>'SafetyUnit','riskCategory'=>'RiskCategory'] as $q=>$c){if(!empty($_GET[$q])&&$_GET[$q]!=='all'){$sql.=" AND $c=?";$pa[]=$_GET[$q];}} if(!empty($_GET['year'])){$sql.=' AND YEAR(ActivityDate)=?';$pa[]=(int)$_GET['year'];} if(!empty($_GET['month'])){$sql.=' AND MONTH(ActivityDate)=?';$pa[]=(int)$_GET['month'];} json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY ActivityDate DESC,CreatedAt DESC',$pa)]);}
    if($method==='GET'&&$path==='/ky/email-outbox'){require_admin();$limit=min(max((int)($_GET['limit']??50),1),200);$sql='SELECT * FROM ky_emailoutbox';$pa=[];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' WHERE Status=?';$pa[]=$_GET['status'];}$pa[]=$limit;json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CreatedAt DESC LIMIT ?',$pa),'smtpConfigured'=>mailer_smtp_configured()]);}
    if($method==='POST'&&$path==='/ky/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('ky_emailoutbox','Recipient','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retried {$r['processed']} KY email queue item(s)",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    $p=route_params($path,'/ky/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('ky_emailoutbox',(int)$p['id'],'Recipient','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    $p=route_params($path,'/ky/:id'); if($p!==null&&$method==='GET'){ $row=db_row('SELECT * FROM ky_activities WHERE id=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);$row['reactions']=db_rows('SELECT Reaction,COUNT(*) AS count FROM ky_video_reactions WHERE ActivityID=? GROUP BY Reaction',[$p['id']]);json_response(['success'=>true,'data'=>$row]);}
    if($method==='POST'&&$path==='/ky'){
        $files=wf_store_files('attachment',1);
        $videos=wf_store_files('video',1,200*1024*1024);
        $b=wf_body();
        try{
            $reject=function(string $message,int $status=400)use($files,$videos){wf_cleanup_files($files);wf_cleanup_files($videos);json_response(['success'=>false,'message'=>$message],$status);};
            $participantsRaw=(string)($b['Participants']??'');
            $participants=[];
            if($participantsRaw!==''){
                $decoded=json_decode($participantsRaw,true);
                if(is_array($decoded))$participants=array_values(array_filter(array_map(fn($p)=>trim((string)$p),$decoded)));
                else $participants=array_values(array_filter(array_map('trim',explode(',',$participantsRaw))));
            }
            if(!wf_date($b['ActivityDate']??null)||empty(trim((string)($b['HazardDescription']??''))))$reject('กรุณาระบุวันที่และรายละเอียดอันตราย');
            if(empty(trim((string)($b['TeamName']??''))))$reject('กรุณาระบุชื่อทีม');
            if(empty(trim((string)($b['KYTKeyword']??''))))$reject('กรุณาระบุ KYT Keyword');
            if(empty(trim((string)($b['Countermeasure']??''))))$reject('กรุณาระบุมาตรการตอบโต้');
            if(!$participants)$reject('กรุณาระบุผู้เข้าร่วมกิจกรรม KY อย่างน้อย 1 คน');
            if(!$files)$reject('กรุณาแนบไฟล์ภาพหรือเอกสารประกอบกิจกรรม KY');
            $id=wf_uuid();
            $reporter=$b['ReporterID']??$b['ReporterEmployeeID']??wf_user_id($user);
            $emp=db_row('SELECT EmployeeName,Department,CompanyEmail FROM employees WHERE EmployeeID=?',[$reporter]) ?: [];
            $date=wf_date($b['ActivityDate']);
            $reporterName=$emp['EmployeeName']??($b['ReporterName']??$actor);
            $reporterEmail=$emp['CompanyEmail']??($b['ReporterEmail']??null);
            $dept=$b['Department']??($emp['Department']??($user['department']??''));
            $dept=trim((string)$dept);
            if($dept==='')$reject('กรุณาเลือกแผนกหลัก');
            $dateYear=(int)date('Y',strtotime($date));
            $cfg=db_row('SELECT SafetyUnits FROM ky_program_config WHERE Year=? AND Department=? AND IsActive=1 LIMIT 1',[$dateYear,$dept])?:[];
            $configuredUnits=[];
            if(!empty($cfg['SafetyUnits'])){
                $decoded=json_decode((string)$cfg['SafetyUnits'],true);
                if(is_array($decoded))$configuredUnits=array_values(array_filter(array_map(fn($u)=>trim((string)$u),$decoded)));
            }
            $requestedUnit=trim((string)($b['SafetyUnit']??''));
            if($configuredUnits&&$requestedUnit==='')$reject('กรุณาเลือก Safety Unit สำหรับแผนกนี้');
            if($configuredUnits&&!in_array($requestedUnit,$configuredUnits,true))$reject('Safety Unit ไม่อยู่ใน Program Config ของแผนกนี้');
            $row=[
                'id'=>$id,'ActivityDate'=>$date,'ReporterID'=>$reporter,'ReporterName'=>$reporterName,'ReporterEmail'=>$reporterEmail,
                'SubmittedByID'=>wf_user_id($user),'SubmittedByName'=>$actor,'Department'=>$dept,'SafetyUnit'=>$configuredUnits?$requestedUnit:null,
                'TeamName'=>trim((string)$b['TeamName']),'Participants'=>json_encode($participants,JSON_UNESCAPED_UNICODE),'KYTKeyword'=>trim((string)$b['KYTKeyword']),
                'RiskCategory'=>$b['RiskCategory']??'General','HazardDescription'=>trim((string)$b['HazardDescription']),
                'Countermeasure'=>trim((string)$b['Countermeasure']),'Status'=>'Open'
            ];
            db_execute('INSERT INTO ky_activities (id,ActivityDate,ReporterID,ReporterName,ReporterEmail,SubmittedByID,SubmittedByName,Department,SafetyUnit,TeamName,Participants,KYTKeyword,RiskCategory,HazardDescription,Countermeasure,AttachmentUrl,VideoUrl,Status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$date,$reporter,$reporterName,$reporterEmail,wf_user_id($user),$actor,$dept,$configuredUnits?$requestedUnit:null,trim((string)$b['TeamName']),json_encode($participants,JSON_UNESCAPED_UNICODE),trim((string)$b['KYTKeyword']),$b['RiskCategory']??'General',trim((string)$b['HazardDescription']),trim((string)$b['Countermeasure']),$files[0]['url']??null,$videos[0]['url']??null,'Open']);
            if(!empty($reporterEmail)){
                $mail=wf_ky_mail('Submitted',$row,['greeting'=>'Dear '.$reporterName,'intro'=>['Your KY activity has been submitted and is waiting for Safety Admin review.','You can follow the status in KY Ability > History.']]);
                wf_email_outbox('ky_emailoutbox',['ActivityID'=>$id,'EventType'=>'Submitted','Recipient'=>$reporterEmail,'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
            }
            $adminMail=wf_ky_mail('AdminSubmitted',$row,['greeting'=>'Dear Safety Admin','intro'=>['A new KY activity has been submitted.','Please review the hazard, countermeasure, and evidence in KY Ability.'],'actions'=>['Open KY Ability > Manage.','Review the submitted activity and update the status.']]);
            wf_email_outbox('ky_emailoutbox',['ActivityID'=>$id,'EventType'=>'AdminSubmitted','Recipient'=>wf_ky_admin_email(),'Subject'=>$adminMail['subject'],'Body'=>$adminMail['body'],'HtmlBody'=>$adminMail['html'],'Status'=>'Queued']);
            json_response(['success'=>true,'id'=>$id]);
        }catch(Throwable $e){wf_cleanup_files($files);wf_cleanup_files($videos);throw $e;}
    }
    $p=route_params($path,'/ky/:id/video'); if($p!==null&&$method==='POST'){
        $row=db_row('SELECT id,ReporterID,SubmittedByID,Participants,VideoUrl,Status FROM ky_activities WHERE id=?',[$p['id']]);
        if(!$row)json_response(['success'=>false,'message'=>'ไม่พบกิจกรรม KY'],404);
        $isOwner=wf_ky_can_upload_followup_video($row,$user);$isAdmin=wf_is_admin($user);
        if(!$isAdmin&&!$isOwner)json_response(['success'=>false,'message'=>'แนบวิดีโอได้เฉพาะเจ้าของรายการหรือ Admin'],403);
        if(!$isAdmin&&!empty($row['VideoUrl']))json_response(['success'=>false,'message'=>'รายการนี้มีวิดีโอแล้ว กรุณาติดต่อ Admin หากต้องการเปลี่ยนไฟล์'],409);
        $videos=wf_store_files('video',1,200*1024*1024);
        if(!$videos)json_response(['success'=>false,'message'=>'กรุณาเลือกไฟล์วิดีโอ'],400);
        $video=$videos[0];$mime=strtolower((string)($video['type']??''));$ext=strtolower(pathinfo((string)($video['name']??$video['url']??''),PATHINFO_EXTENSION));
        if(strpos($mime,'video/')!==0&&!in_array($ext,['mp4','mov','webm','avi','mkv','mpeg','mpg'],true)){wf_cleanup_files($videos);json_response(['success'=>false,'message'=>'ไฟล์ที่เลือกไม่ใช่วิดีโอที่รองรับ'],400);}
        try{
            $previous=$row['VideoUrl']??null;db_execute('UPDATE ky_activities SET VideoUrl=? WHERE id=?',[$video['url'],$p['id']]);
            if($isAdmin&&!empty($previous))delete_uploaded_file($previous);
            wf_ky_audit($user,'KY_VIDEO_FOLLOWUP_UPLOAD',(string)$p['id'],$isAdmin&&!empty($previous)?'Admin replaced KY follow-up video':'Uploaded KY follow-up video',['canUpload'=>$isOwner,'admin'=>$isAdmin,'replacedExisting'=>!empty($previous),'status'=>$row['Status']??null]);
            json_response(['success'=>true,'data'=>['id'=>$p['id'],'videoUrl'=>$video['url']]]);
        }catch(Throwable $e){wf_cleanup_files($videos);throw $e;}
    }
    $p=route_params($path,'/ky/:id'); if($p!==null&&$method==='PUT'){
        require_admin();
        $files=wf_store_files('attachment',1);
        $videos=wf_store_files('video',1,200*1024*1024);
        try{
            $row=db_row('SELECT * FROM ky_activities WHERE id=?',[$p['id']]);
            if(!$row){wf_cleanup_files($files);wf_cleanup_files($videos);json_response(['success'=>false,'message'=>'Not found.'],404);}
            $b=wf_body();
            $attachment=$files?$files[0]['url']:($row['AttachmentUrl']??null);
            $video=$videos?$videos[0]['url']:($row['VideoUrl']??null);
            $nextStatus=$b['Status']??$row['Status'];
            if(!in_array($nextStatus,['Open','Reviewed','Closed'],true)){wf_cleanup_files($files);wf_cleanup_files($videos);json_response(['success'=>false,'message'=>'Invalid KY status.'],400);}
            db_execute('UPDATE ky_activities SET ActivityDate=COALESCE(?,ActivityDate),Department=COALESCE(?,Department),SafetyUnit=COALESCE(?,SafetyUnit),TeamName=COALESCE(?,TeamName),Participants=COALESCE(?,Participants),KYTKeyword=COALESCE(?,KYTKeyword),RiskCategory=COALESCE(?,RiskCategory),HazardDescription=COALESCE(?,HazardDescription),Countermeasure=COALESCE(?,Countermeasure),AttachmentUrl=?,VideoUrl=?,Status=COALESCE(?,Status),AdminComment=COALESCE(?,AdminComment) WHERE id=?',[wf_date($b['ActivityDate']??null),$b['Department']??null,$b['SafetyUnit']??null,$b['TeamName']??null,$b['Participants']??null,$b['KYTKeyword']??null,$b['RiskCategory']??null,$b['HazardDescription']??null,$b['Countermeasure']??null,$attachment,$video,$nextStatus,$b['AdminComment']??null,$p['id']]);
            if($files)delete_uploaded_file($row['AttachmentUrl']??null);
            if($videos)delete_uploaded_file($row['VideoUrl']??null);
            $updated=db_row('SELECT * FROM ky_activities WHERE id=?',[$p['id']]) ?: array_merge($row,$b,['Status'=>$nextStatus]);
            if(!empty($updated['ReporterEmail']) && $nextStatus!==($row['Status']??null) && in_array($nextStatus,['Reviewed','Closed'],true)){
                $event=$nextStatus==='Closed'?'Closed':'Reviewed';
                $mail=wf_ky_mail($event,$updated,['greeting'=>'Dear '.($updated['ReporterName']??'KY reporter'),'intro'=>[$event==='Closed'?'Your KY activity has been closed by Safety Admin.':'Your KY activity has been reviewed by Safety Admin.','Please open KY Ability if you need to check the admin comment or record detail.'],'comment'=>$b['AdminComment']??($updated['AdminComment']??'')]);
                wf_email_outbox('ky_emailoutbox',['ActivityID'=>$p['id'],'EventType'=>$event,'Recipient'=>$updated['ReporterEmail'],'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued']);
            }
            json_response(['success'=>true]);
        }catch(Throwable $e){wf_cleanup_files($files);wf_cleanup_files($videos);throw $e;}
    }
    $p=route_params($path,'/ky/:id'); if($p!==null&&$method==='DELETE'){
        require_admin();
        $row=db_row('SELECT AttachmentUrl,VideoUrl FROM ky_activities WHERE id=?',[$p['id']]);
        $pdo=db();
        try{
            $pdo->beginTransaction();
            db_execute('DELETE FROM ky_video_reactions WHERE ActivityID=?',[$p['id']]);
            db_execute('DELETE FROM ky_activities WHERE id=?',[$p['id']]);
            $pdo->commit();
        }catch(Throwable $e){
            if($pdo->inTransaction())$pdo->rollBack();
            throw $e;
        }
        if($row){delete_uploaded_file($row['AttachmentUrl']??null);delete_uploaded_file($row['VideoUrl']??null);}
        json_response(['success'=>true]);
    }
    return false;
}

function wf_ensure_yokoten_tables(): void
{
    static $ready = false;
    if ($ready) return;

    db()->exec("CREATE TABLE IF NOT EXISTS yokotentopics (
        YokotenID VARCHAR(36) PRIMARY KEY,Title VARCHAR(200),TopicDescription TEXT NOT NULL,Category VARCHAR(50) DEFAULT 'General',
        RiskLevel VARCHAR(20) DEFAULT 'Low',DateIssued DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,Deadline DATE,AttachmentUrl TEXT,AttachmentName VARCHAR(255),
        TargetDepts TEXT,TargetUnits TEXT,IsActive TINYINT(1) DEFAULT 1,CreatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokotenresponses (
        ResponseID VARCHAR(36) PRIMARY KEY,YokotenID VARCHAR(36) NOT NULL,Department VARCHAR(100) NOT NULL,SafetyUnit VARCHAR(100),EmployeeID VARCHAR(50) NOT NULL,
        EmployeeName VARCHAR(100),IsRelated VARCHAR(10) DEFAULT 'No',Comment TEXT,CorrectiveAction TEXT,ApprovalStatus VARCHAR(20),ApprovalComment TEXT,
        ApprovedBy VARCHAR(100),ApprovedAt DATETIME,ResponseDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        IsDeleted TINYINT(1) DEFAULT 0,UNIQUE KEY uq_dept_topic(YokotenID,Department),KEY idx_yokoten(YokotenID),KEY idx_dept(Department)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokoten_response_files (
        FileID VARCHAR(36) PRIMARY KEY,ResponseID VARCHAR(36) NOT NULL,YokotenID VARCHAR(36) NOT NULL,Department VARCHAR(100),FileName VARCHAR(255) NOT NULL,
        FileURL TEXT NOT NULL,PublicID VARCHAR(255),FileType VARCHAR(100),FileSize INT,UploadedBy VARCHAR(100),CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_response(ResponseID),KEY idx_yokoten(YokotenID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokoten_dashboard_config (id INT AUTO_INCREMENT PRIMARY KEY,ConfigKey VARCHAR(50) NOT NULL UNIQUE,ConfigValue TEXT,UpdatedBy VARCHAR(100),UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS yokoten_emailoutbox (id INT AUTO_INCREMENT PRIMARY KEY,ResponseID VARCHAR(36) DEFAULT NULL,EventType VARCHAR(80) NOT NULL DEFAULT 'General',Recipients TEXT NOT NULL,Subject VARCHAR(255) NOT NULL,Body MEDIUMTEXT,HtmlBody MEDIUMTEXT,Status VARCHAR(30) NOT NULL DEFAULT 'Queued',Error TEXT,SentAt DATETIME DEFAULT NULL,CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,KEY idx_response(ResponseID),KEY idx_status(Status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    foreach ([
        "ALTER TABLE yokotentopics ADD COLUMN Title VARCHAR(200)",
        "ALTER TABLE yokotentopics ADD COLUMN Category VARCHAR(50) DEFAULT 'General'",
        "ALTER TABLE yokotentopics ADD COLUMN RiskLevel VARCHAR(20) DEFAULT 'Low'",
        "ALTER TABLE yokotentopics ADD COLUMN Deadline DATE",
        "ALTER TABLE yokotentopics ADD COLUMN AttachmentUrl TEXT",
        "ALTER TABLE yokotentopics ADD COLUMN AttachmentName VARCHAR(255)",
        "ALTER TABLE yokotentopics ADD COLUMN TargetDepts TEXT",
        "ALTER TABLE yokotentopics ADD COLUMN TargetUnits TEXT",
        "ALTER TABLE yokotentopics ADD COLUMN IsActive TINYINT(1) DEFAULT 1",
        "ALTER TABLE yokotenresponses ADD COLUMN SafetyUnit VARCHAR(100)",
        "ALTER TABLE yokotenresponses ADD COLUMN CorrectiveAction TEXT",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovalStatus VARCHAR(20)",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovalComment TEXT",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovedBy VARCHAR(100)",
        "ALTER TABLE yokotenresponses ADD COLUMN ApprovedAt DATETIME",
        "ALTER TABLE yokotenresponses ADD COLUMN IsDeleted TINYINT(1) DEFAULT 0",
        "ALTER TABLE yokotenresponses MODIFY COLUMN EmployeeID VARCHAR(50) NOT NULL",
    ] as $sql) wf_try_exec($sql);
    $ready = true;
}

function wf_yokoten_attach_responses(array $topics, array $user): array
{
    $admin = wf_is_admin($user);
    $dept = trim((string)($user['department'] ?? ''));
    if (!$admin) {
        $topics = array_values(array_filter($topics, static function ($t) use ($dept) {
            return wf_yokoten_dept_targeted(wf_yokoten_normalize_topic($t), $dept);
        }));
    }
    foreach ($topics as &$t) {
        $targetDepts = wf_yokoten_scope_list($t['TargetDepts'] ?? null);
        $targetUnits = wf_yokoten_scope_list($t['TargetUnits'] ?? null);
        $t['targetDepts'] = $targetDepts;
        $t['targetUnits'] = $targetUnits;
        unset($t['TargetDepts'], $t['TargetUnits']);
        $sql = 'SELECT * FROM yokotenresponses WHERE YokotenID=? AND (IsDeleted IS NULL OR IsDeleted=0)';
        $params = [$t['YokotenID']];
        if (!$admin) {
            $sql .= ' AND Department=?';
            $params[] = $dept;
        }
        $responses = db_rows($sql . ' ORDER BY ResponseDate DESC', $params);
        foreach ($responses as &$r) {
            $r['files'] = db_rows('SELECT * FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC', [$r['ResponseID']]);
        }
        unset($r);
        if ($admin) $t['responses'] = $responses;
        $t['sharedResponseCount'] = (int)(safe_scalar("SELECT COUNT(*) FROM yokotenresponses WHERE YokotenID=? AND IsRelated='Yes' AND ApprovalStatus='approved' AND (IsDeleted IS NULL OR IsDeleted=0)", [$t['YokotenID']]) ?? 0);
        $mine = null;
        foreach ($responses as $r) {
            if ((string)$r['Department'] === $dept || (string)$r['EmployeeID'] === wf_user_id($user)) { $mine = $r; break; }
        }
        $t['myResponse'] = $mine;
        $t['deptResponse'] = $mine;
        $t['responseCount'] = $admin ? count($responses) : null;
    }
    unset($t);
    return $topics;
}

function wf_first_value(array $body, array $keys, $fallback = null)
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $body)) return $body[$key];
    }
    return $fallback;
}

function wf_yokoten_departments(array $body, array $user, bool $admin): array
{
    if (!$admin) {
        $dept = trim((string)($user['department'] ?? $user['Department'] ?? ''));
        return $dept === '' ? [] : [$dept];
    }
    $raw = wf_first_value($body, ['departments', 'Departments'], null);
    $out = [];
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        $items = is_array($decoded) ? $decoded : explode(',', $raw);
        foreach ($items as $item) {
            $dept = trim((string)$item);
            if ($dept !== '') $out[] = $dept;
        }
    } elseif (is_array($raw)) {
        foreach ($raw as $item) {
            $dept = trim((string)$item);
            if ($dept !== '') $out[] = $dept;
        }
    }
    $single = trim((string)wf_first_value($body, ['department', 'Department'], ''));
    if ($single !== '') $out[] = $single;
    return array_values(array_unique($out));
}

function wf_yokoten_related($value): string
{
    return strcasecmp(trim((string)$value), 'Yes') === 0 ? 'Yes' : 'No';
}

function wf_yokoten_scope_list($value): array
{
    return array_values(array_filter(array_map(static fn($v) => trim((string)$v), wf_json($value, [])), static fn($v) => $v !== ''));
}

function wf_yokoten_response_unit_list($value): array
{
    if (is_array($value)) {
        return array_values(array_filter(array_map(static fn($v) => trim((string)$v), $value), static fn($v) => $v !== ''));
    }
    $text = trim((string)$value);
    if ($text === '') return [];
    $json = json_decode($text, true);
    if (is_array($json)) {
        return array_values(array_filter(array_map(static fn($v) => trim((string)$v), $json), static fn($v) => $v !== ''));
    }
    return array_values(array_filter(array_map('trim', preg_split('/[,\n;|]+/', $text) ?: []), static fn($v) => $v !== ''));
}

function wf_yokoten_response_units(array $body, array $user, bool $admin): array
{
    if ($admin) {
        return array_values(array_unique(array_merge(
            wf_yokoten_response_unit_list(wf_first_value($body, ['safetyUnits', 'SafetyUnits'], null)),
            wf_yokoten_response_unit_list(wf_first_value($body, ['safetyUnit', 'SafetyUnit'], null))
        )));
    }
    return wf_yokoten_response_unit_list(wf_first_value($user, ['unit', 'Unit', 'team', 'Team'], null));
}

function wf_yokoten_normalize_topic(array $topic): array
{
    $topic['TargetDepts'] = wf_yokoten_scope_list($topic['TargetDepts'] ?? null);
    $topic['TargetUnits'] = wf_yokoten_scope_list($topic['TargetUnits'] ?? null);
    return $topic;
}

function wf_yokoten_dept_targeted(array $topic, string $dept): bool
{
    $targets = wf_yokoten_scope_list($topic['TargetDepts'] ?? []);
    return !$targets || in_array(trim($dept), $targets, true);
}

function wf_yokoten_has_safety_units(): bool
{
    try {
        return (int)(safe_scalar('SELECT COUNT(*) FROM master_safetyunits') ?? 0) > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function wf_yokoten_master_depts(): array
{
    return array_values(array_filter(array_map(static fn($r) => trim((string)($r['Name'] ?? '')), db_rows('SELECT Name FROM master_departments ORDER BY Name'))));
}

function wf_yokoten_master_units(): array
{
    try {
        return array_values(array_filter(array_map(static fn($r) => trim((string)($r['Name'] ?? '')), db_rows('SELECT Name FROM master_safetyunits ORDER BY Name'))));
    } catch (Throwable $e) {
        return [];
    }
}

function wf_yokoten_master_unit_rows(): array
{
    return db_rows(
        'SELECT u.name,u.short_code,d.Name AS department
         FROM master_safetyunits u
         LEFT JOIN master_departments d ON d.id=u.department_id
         ORDER BY u.department_id,u.sort_order,u.name'
    );
}

function wf_yokoten_filter_master_values($values, array $master): array
{
    $source = is_array($values) ? $values : wf_json($values, []);
    $allowed = array_flip(array_values(array_filter(array_map('strval', $master))));
    $out = [];
    foreach ($source as $v) {
        $v = trim((string)$v);
        if ($v === '') continue;
        if ($allowed && !isset($allowed[$v])) continue;
        $out[$v] = true;
    }
    return array_keys($out);
}

function wf_yokoten_unit_targeted(array $topic, ?string $unit): bool
{
    $unit = trim((string)$unit);
    $targets = wf_yokoten_scope_list($topic['TargetUnits'] ?? []);
    return $unit === '' || !$targets || in_array($unit, $targets, true);
}

function wf_yokoten_topic_unit_in_scope(array $topic, array $scopeUnits): bool
{
    if (!$scopeUnits) return true;
    $targets = wf_yokoten_scope_list($topic['TargetUnits'] ?? []);
    return !$targets || (bool)array_intersect($targets, $scopeUnits);
}

function wf_yokoten_company_overview(int $year): array
{
    $cfg = ['pinnedDepts'=>[],'pinnedUnits'=>[]];
    foreach (db_rows('SELECT ConfigKey,ConfigValue FROM yokoten_dashboard_config') as $r) $cfg[$r['ConfigKey']] = wf_json($r['ConfigValue'], []);
    $masterDepts = wf_yokoten_master_depts();
    $masterUnits = wf_yokoten_master_units();
    $configuredDepts = wf_yokoten_filter_master_values($cfg['pinnedDepts'] ?? [], $masterDepts);
    $configuredUnits = wf_yokoten_filter_master_values($cfg['pinnedUnits'] ?? [], $masterUnits);
    $scopeDepts = $configuredDepts ?: $masterDepts;
    $topicRows = array_map('wf_yokoten_normalize_topic', db_rows('SELECT YokotenID,Title,TopicDescription,RiskLevel,Category,Deadline,DateIssued,TargetDepts,TargetUnits FROM yokotentopics WHERE IsActive=1 AND (DateIssued IS NULL OR YEAR(DateIssued)=?) ORDER BY DateIssued DESC', [$year]));
    $topics = [];
    foreach ($topicRows as $t) {
        if (wf_yokoten_topic_unit_in_scope($t, $configuredUnits)) $topics[] = $t;
    }
    $responses = db_rows('SELECT r.YokotenID,r.Department,NULLIF(r.SafetyUnit,"") AS EffectiveSafetyUnit FROM yokotenresponses r WHERE r.YokotenID IN (SELECT YokotenID FROM yokotentopics WHERE IsActive=1) AND (r.IsDeleted IS NULL OR r.IsDeleted=0)');
    $deptSet = array_flip($scopeDepts);
    $respSet = [];
    foreach ($responses as $r) {
        $dept = trim((string)($r['Department'] ?? ''));
        if (!isset($deptSet[$dept])) continue;
        if ($configuredUnits) {
            $units = wf_yokoten_response_unit_list($r['EffectiveSafetyUnit'] ?? null);
            if ($units && !array_intersect($units, $configuredUnits)) continue;
        }
        $respSet[$dept.'::'.(string)$r['YokotenID']] = true;
    }
    $sharedRows = db_rows("SELECT YokotenID,COUNT(*) AS cnt FROM yokotenresponses WHERE IsRelated='Yes' AND ApprovalStatus='approved' AND (IsDeleted IS NULL OR IsDeleted=0) GROUP BY YokotenID");
    $shared = [];
    foreach ($sharedRows as $r) $shared[(string)$r['YokotenID']] = (int)$r['cnt'];
    $departments = [];
    foreach ($scopeDepts as $dept) {
        $assigned = [];
        foreach ($topics as $t) {
            if (wf_yokoten_dept_targeted($t, $dept)) $assigned[] = $t;
        }
        $responded = 0;
        foreach ($assigned as $t) if (isset($respSet[$dept.'::'.(string)$t['YokotenID']])) $responded++;
        $total = count($assigned);
        $departments[] = ['department'=>$dept,'totalTopics'=>$total,'respondedCount'=>$responded,'completionPct'=>$total?round($responded*100/$total):0];
    }
    $topicOut = [];
    $risk = [];
    $cat = [];
    foreach ($topics as $t) {
        $target = [];
        foreach ($scopeDepts as $dept) {
            if (wf_yokoten_dept_targeted($t, $dept)) $target[] = $dept;
        }
        if (!$target) continue;
        $responded = 0;
        foreach ($target as $dept) if (isset($respSet[$dept.'::'.(string)$t['YokotenID']])) $responded++;
        $riskLevel = (string)($t['RiskLevel'] ?? 'Low');
        $category = (string)($t['Category'] ?? 'General');
        $risk[$riskLevel] = ($risk[$riskLevel] ?? 0) + 1;
        $cat[$category] = ($cat[$category] ?? 0) + 1;
        $topicOut[] = ['yokotenId'=>$t['YokotenID'],'title'=>($t['Title'] ?: $t['TopicDescription']),'riskLevel'=>$riskLevel,'category'=>$category,'deadline'=>$t['Deadline'] ?? null,'targetDeptCount'=>count($target),'respondedDeptCount'=>$responded,'completionPct'=>round($responded*100/count($target)),'sharedResponseCount'=>$shared[(string)$t['YokotenID']] ?? 0];
    }
    $totalAssigned = array_sum(array_column($departments, 'totalTopics'));
    $responded = array_sum(array_column($departments, 'respondedCount'));
    $riskDistribution = [];
    foreach ($risk as $k => $v) $riskDistribution[] = ['riskLevel'=>$k,'count'=>$v];
    $categoryDistribution = [];
    foreach ($cat as $k => $v) $categoryDistribution[] = ['category'=>$k,'count'=>$v];
    return ['year'=>$year,'scope'=>['departments'=>$scopeDepts,'safetyUnits'=>$configuredUnits,'configuredDepartments'=>$configuredDepts,'configuredSafetyUnits'=>$configuredUnits,'usingAllDepartments'=>!$configuredDepts],'overall'=>['totalAssigned'=>$totalAssigned,'responded'=>$responded,'completionPct'=>$totalAssigned?round($responded*100/$totalAssigned):0,'sharedLearningCount'=>array_sum(array_column($topicOut,'sharedResponseCount'))],'departments'=>$departments,'topics'=>$topicOut,'riskDistribution'=>$riskDistribution,'categoryDistribution'=>$categoryDistribution];
}

function wf_yokoten_queue_approval_email(string $responseId, string $actor): void
{
    wf_yokoten_queue_email($responseId, 'Approved', $actor);
}

function wf_yokoten_delete_file_if_unreferenced(?string $fileUrl): void
{
    $fileUrl = trim((string)$fileUrl);
    if ($fileUrl === '') return;
    $references = (int)(safe_scalar(
        'SELECT COUNT(*) FROM yokoten_response_files WHERE FileURL=?',
        [$fileUrl]
    ) ?? 0);
    if ($references === 0) delete_uploaded_file($fileUrl);
}

function wf_yokoten_admin_email(): string
{
    $candidates = [
        getenv('YOKOTEN_ADMIN_EMAIL') ?: '',
        getenv('HIYARI_ADMIN_EMAIL') ?: '',
        getenv('ADMIN_EMAIL') ?: '',
        defined('SMTP_FROM') ? SMTP_FROM : '',
        wf_hiyari_admin_email(),
    ];
    foreach ($candidates as $email) {
        $email = trim((string)$email);
        if ($email !== '') return $email;
    }
    return 'sattaya_w@thaisummit-harness.co.th';
}

function wf_yokoten_mail(array $row, string $event, string $actor, string $recipientKind): array
{
    $topic = trim((string)($row['Title'] ?? '')) ?: wf_text($row['TopicDescription'] ?? 'Yokoten', 180);
    $dept = (string)($row['Department'] ?? '-');
    $risk = (string)($row['RiskLevel'] ?? '-');
    $related = (string)($row['IsRelated'] ?? '-');
    $comment = trim((string)($row['ApprovalComment'] ?? ''));
    $events = [
        'Submitted' => [
            'subject' => '[Yokoten] Response submitted - ' . $dept,
            'title' => 'Yokoten response submitted',
            'tone' => 'pending',
            'intro' => ['Your department response has been submitted successfully.', 'The department response is now recorded in Yokoten.'],
            'actions' => ['No further action is needed unless Safety Admin returns the item for correction.'],
        ],
        'Rejected' => [
            'subject' => '[Yokoten] Response returned for correction - ' . $dept,
            'title' => 'Yokoten response returned for correction',
            'tone' => 'rejected',
            'intro' => ['Safety Admin returned your Yokoten response for correction.', 'Please update the response and resubmit it for review.'],
            'actions' => ['Open Safety Core, review the admin comment, update corrective action/evidence, and submit again.'],
        ],
        'Resubmitted' => [
            'subject' => '[Yokoten] Corrected response resubmitted - ' . $dept,
            'title' => 'Yokoten corrected response resubmitted',
            'tone' => 'pending',
            'intro' => ['A department has resubmitted a corrected Yokoten response after rejection.', 'Please review the updated action and evidence.'],
            'actions' => ['Open the Yokoten admin approval view to approve or return the response.'],
        ],
        'RelatedSubmitted' => [
            'subject' => '[Yokoten] Related response waiting for approval - ' . $dept,
            'title' => 'Yokoten related response submitted',
            'tone' => 'pending',
            'intro' => ['A department marked this Yokoten topic as related and submitted corrective/preventive action evidence.', 'Please review the response in the Yokoten approval queue.'],
            'actions' => ['Open Safety Core and approve or return the pending Yokoten response.'],
        ],
        'Approved' => [
            'subject' => '[Yokoten] Response approved - ' . $dept,
            'title' => 'Yokoten response approved',
            'tone' => 'approved',
            'intro' => ['Your Yokoten department response has been reviewed and approved.', 'Please keep the corrective/preventive action evidence available for audit follow-up.'],
            'actions' => ['Open Safety Core if you need to review the approved Yokoten response.'],
        ],
    ];
    $cfg = $events[$event] ?? $events['Submitted'];
    $name = $recipientKind === 'admin' ? 'Safety Admin' : (($row['EmployeeName'] ?? '') ?: ($row['EmployeeID'] ?? 'user'));
    $details = [
        ['label' => 'Topic', 'value' => $topic],
        ['label' => 'Department', 'value' => $dept],
        ['label' => 'Risk Level', 'value' => $risk],
        ['label' => 'Related', 'value' => $related],
        ['label' => $event === 'Resubmitted' ? 'Resubmitted By' : 'Actor', 'value' => $actor ?: '-', 'highlight' => true],
    ];
    if ($comment !== '') $details[] = ['label' => 'Admin Comment', 'value' => $comment, 'highlight' => true];
    $mail = wf_hiyari_mail([
        'subject' => $cfg['subject'],
        'title' => $cfg['title'],
        'kicker' => 'Yokoten / Lesson Learned Sharing',
        'moduleLabel' => 'Yokoten / Lesson Learned Sharing Module',
        'tone' => $cfg['tone'],
        'greeting' => 'Dear ' . $name . ',',
        'intro' => $cfg['intro'],
        'details' => $details,
        'actions' => $cfg['actions'],
        'footerNote' => 'This is an automated Yokoten notification from TSH Safety Core Activity System.',
    ]);
    return ['subject' => $cfg['subject'], 'body' => $mail['body'], 'html' => $mail['html']];
}

function wf_yokoten_queue_email(string $responseId, string $event, string $actor, bool $attemptImmediate = true): void
{
    try {
        $row = db_row('SELECT r.ResponseID,r.Department,r.EmployeeID,r.EmployeeName,r.IsRelated,r.ApprovalComment,r.ApprovedAt,t.Title,t.TopicDescription,t.RiskLevel,e.CompanyEmail FROM yokotenresponses r LEFT JOIN yokotentopics t ON t.YokotenID=r.YokotenID LEFT JOIN employees e ON e.EmployeeID=r.EmployeeID WHERE r.ResponseID=?', [$responseId]);
        if (!$row) return;
        $recipientKind = ($event === 'Resubmitted' || $event === 'RelatedSubmitted') ? 'admin' : 'responder';
        $recipient = $recipientKind === 'admin' ? wf_yokoten_admin_email() : trim((string)($row['CompanyEmail'] ?? ''));
        if ($recipient === '') return;
        $mail = wf_yokoten_mail($row, $event, $actor, $recipientKind);
        wf_email_outbox(
            'yokoten_emailoutbox',
            ['ResponseID'=>$responseId,'EventType'=>$event,'Recipients'=>$recipient,'Subject'=>$mail['subject'],'Body'=>$mail['body'],'HtmlBody'=>$mail['html'],'Status'=>'Queued'],
            $attemptImmediate
        );
    } catch (Throwable $e) {
        // Email is best-effort; workflow actions must not fail because notification failed.
    }
}

function handle_yokoten_routes(string $method, string $path): bool
{
    if (strpos($path, '/yokoten') !== 0) return false;
    $user=require_user(); wf_ensure_yokoten_tables(); $admin=wf_is_admin($user); $actor=wf_user_name($user);
    if($method==='GET'&&$path==='/yokoten/topics'){ $topics=db_rows('SELECT * FROM yokotentopics WHERE IsActive=1 ORDER BY DateIssued DESC'); json_response(['success'=>true,'data'=>wf_yokoten_attach_responses($topics,$user)]);}
    if($method==='GET'&&$path==='/yokoten/dept-completion'){$depts=db_rows('SELECT Name FROM master_departments ORDER BY Name');$topics=array_map('wf_yokoten_normalize_topic',db_rows('SELECT YokotenID,Title,TopicDescription,RiskLevel,Category,Deadline,TargetDepts,TargetUnits FROM yokotentopics WHERE IsActive=1 ORDER BY DateIssued DESC'));$responses=db_rows('SELECT r.*,NULLIF(r.SafetyUnit,"") AS EffectiveSafetyUnit,(SELECT COUNT(*) FROM yokoten_response_files f WHERE f.ResponseID=r.ResponseID) AS fileCount FROM yokotenresponses r WHERE r.YokotenID IN (SELECT YokotenID FROM yokotentopics WHERE IsActive=1) AND (r.IsDeleted IS NULL OR r.IsDeleted=0)');$lookup=[];foreach($responses as $r)$lookup[(string)$r['Department'].'::'.(string)$r['YokotenID']]=$r;$summary=[];foreach($depts as $d){$dept=$d['Name'];$responded=0;$pending=0;$rejected=0;$last=null;$break=[];foreach($topics as $t){if(!wf_yokoten_dept_targeted($t,(string)$dept))continue;$key=(string)$dept.'::'.(string)$t['YokotenID'];$resp=$lookup[$key]??null;if($resp){$responded++;if(($resp['ApprovalStatus']??null)==='pending')$pending++;if(($resp['ApprovalStatus']??null)==='rejected')$rejected++;if(!$last||strtotime((string)$resp['ResponseDate'])>strtotime((string)$last))$last=$resp['ResponseDate'];}$unit=$resp?($resp['EffectiveSafetyUnit']??($resp['SafetyUnit']??null)):null;$break[]=['YokotenID'=>$t['YokotenID'],'title'=>($t['Title']?:$t['TopicDescription']),'responded'=>!!$resp,'isRelated'=>$resp['IsRelated']??null,'approvalStatus'=>$resp['ApprovalStatus']??null,'responseCount'=>$resp?1:0,'fileCount'=>$resp?(int)($resp['fileCount']??0):0,'respondedBy'=>$admin?($resp['EmployeeName']??null):null,'responseDate'=>$admin?($resp['ResponseDate']??null):null,'safetyUnit'=>$unit,'safetyUnits'=>wf_yokoten_response_unit_list($unit)];}$total=count($break);$summary[]=['department'=>$dept,'totalTopics'=>$total,'respondedCount'=>$responded,'pendingApproval'=>$pending,'rejected'=>$rejected,'completionPct'=>$total?round($responded*100/$total):0,'lastResponse'=>$admin?$last:null,'topicBreakdown'=>$break];}json_response(['success'=>true,'data'=>['topics'=>$topics,'deptSummary'=>$summary]]);}
    if($method==='GET'&&$path==='/yokoten/company-overview'){json_response(['success'=>true,'data'=>wf_yokoten_company_overview((int)($_GET['year']??date('Y')))]);}
    if($method==='GET'&&$path==='/yokoten/all-responses'){require_admin();$rows=db_rows('SELECT r.*,NULLIF(r.SafetyUnit,"") AS EffectiveSafetyUnit,t.Title,t.TopicDescription,t.Category,t.RiskLevel FROM yokotenresponses r JOIN yokotentopics t ON t.YokotenID=r.YokotenID WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0) ORDER BY r.ResponseDate DESC');foreach($rows as &$r)$r['files']=db_rows('SELECT * FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC',[$r['ResponseID']]);unset($r);json_response(['success'=>true,'data'=>$rows]);}
    $p=route_params($path,'/yokoten/topics/:id/shared-responses'); if($p!==null&&$method==='GET'){$topic=db_row('SELECT YokotenID FROM yokotentopics WHERE YokotenID=? AND IsActive=1',[$p['id']]);if(!$topic)json_response(['success'=>false,'message'=>'Topic not found.'],404);$rows=db_rows('SELECT r.ResponseID,r.YokotenID,r.Department,NULLIF(r.SafetyUnit,"") AS SafetyUnit,r.IsRelated,r.Comment,r.CorrectiveAction,r.ResponseDate FROM yokotenresponses r WHERE r.YokotenID=? AND r.IsRelated="Yes" AND r.ApprovalStatus="approved" AND (r.IsDeleted IS NULL OR r.IsDeleted=0) ORDER BY r.ResponseDate DESC',[$p['id']]);$out=[];foreach($rows as $r){$files=db_rows('SELECT FileID,ResponseID,FileName,FileURL,FileType,FileSize FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC',[$r['ResponseID']]);$out[]=['responseId'=>$r['ResponseID'],'yokotenId'=>$r['YokotenID'],'department'=>$r['Department'],'safetyUnit'=>$r['SafetyUnit']?:null,'isRelated'=>$r['IsRelated'],'comment'=>$r['Comment']?:null,'correctiveAction'=>$r['CorrectiveAction']?:null,'responseDate'=>$r['ResponseDate'],'files'=>$files];}json_response(['success'=>true,'data'=>$out]);}
    if($method==='GET'&&$path==='/yokoten/email-outbox'){require_admin();$limit=min(max((int)($_GET['limit']??50),1),200);$sql='SELECT * FROM yokoten_emailoutbox';$pa=[];if(!empty($_GET['status'])&&$_GET['status']!=='all'){$sql.=' WHERE Status=?';$pa[]=$_GET['status'];}$pa[]=$limit;json_response(['success'=>true,'data'=>db_rows($sql.' ORDER BY CreatedAt DESC LIMIT ?',$pa),'smtpConfigured'=>mailer_smtp_configured()]);}
    if($method==='POST'&&$path==='/yokoten/email-outbox/retry-queued'){require_admin();if(!mailer_smtp_configured())json_response(['success'=>false,'message'=>'SMTP is not configured.'],400);$b=json_body();$r=mailer_outbox_retry_queued('yokoten_emailoutbox','Recipients','HtmlBody',(int)($b['limit']??20));json_response(['success'=>true,'message'=>"Retry email queue completed: sent {$r['sent']}, failed {$r['failed']}",'processed'=>$r['processed'],'sent'=>$r['sent'],'failed'=>$r['failed'],'data'=>$r]);}
    $p=route_params($path,'/yokoten/email-outbox/:id/retry'); if($p!==null&&$method==='POST'){require_admin();try{$r=mailer_outbox_send('yokoten_emailoutbox',(int)$p['id'],'Recipients','HtmlBody');json_response(['success'=>true,'message'=>'Email sent.','data'=>$r]);}catch(Throwable $e){json_response(['success'=>false,'message'=>'Email send failed.','error'=>$e->getMessage()],500);}}
    if($method==='GET'&&$path==='/yokoten/dept-history'){ $dept=$admin?trim((string)($_GET['department']??'')):($user['department']??'');$pa=[];$sql='SELECT r.*,t.Title,t.TopicDescription,t.Category,t.RiskLevel FROM yokotenresponses r JOIN yokotentopics t ON t.YokotenID=r.YokotenID WHERE (r.IsDeleted IS NULL OR r.IsDeleted=0)';if($dept!==''){$sql.=' AND r.Department=?';$pa[]=$dept;}if(!empty($_GET['topicId'])){$sql.=' AND r.YokotenID=?';$pa[]=$_GET['topicId'];}$rows=db_rows($sql.' ORDER BY r.ResponseDate DESC',$pa);foreach($rows as &$r)$r['files']=db_rows('SELECT * FROM yokoten_response_files WHERE ResponseID=? ORDER BY CreatedAt ASC',[$r['ResponseID']]);unset($r);json_response(['success'=>true,'data'=>$rows]);}
    if($method==='GET'&&$path==='/yokoten/employee-completion'){require_admin();$topics=array_map('wf_yokoten_normalize_topic',db_rows('SELECT YokotenID,Title,TopicDescription,RiskLevel,TargetDepts,TargetUnits FROM yokotentopics WHERE IsActive=1 ORDER BY DateIssued DESC'));$emps=db_rows('SELECT EmployeeID,EmployeeName,Department,Position FROM employees ORDER BY Department,EmployeeName');$responses=db_rows('SELECT YokotenID,Department,EmployeeID,IsRelated,ApprovalStatus,ResponseDate FROM yokotenresponses WHERE YokotenID IN (SELECT YokotenID FROM yokotentopics WHERE IsActive=1) AND (IsDeleted IS NULL OR IsDeleted=0)');$lookup=[];foreach($responses as $r)$lookup[(string)$r['Department'].'::'.(string)$r['YokotenID']]=$r;$out=[];foreach($emps as $e){$dept=(string)($e['Department']??'');$assigned=array_values(array_filter($topics,static fn($t)=>wf_yokoten_dept_targeted($t,$dept)));if(!$assigned)continue;$count=0;$break=[];foreach($assigned as $t){$resp=$lookup[$dept.'::'.(string)$t['YokotenID']]??null;if($resp)$count++;$break[]=['YokotenID'=>$t['YokotenID'],'title'=>($t['Title']?:$t['TopicDescription']),'deptResponded'=>!!$resp,'isDeptResponder'=>$resp&&((string)$resp['EmployeeID']===(string)$e['EmployeeID']),'isRelated'=>$resp['IsRelated']??null,'approvalStatus'=>$resp['ApprovalStatus']??null];}$total=count($assigned);$out[]=['employeeId'=>$e['EmployeeID'],'name'=>$e['EmployeeName'],'department'=>$e['Department'],'position'=>$e['Position'],'respondedCount'=>$count,'totalTopics'=>$total,'completionPct'=>$total?round($count*100/$total):0,'breakdown'=>$break];}json_response(['success'=>true,'data'=>['topics'=>$topics,'employees'=>$out]]);}
    if(($method==='POST'&&$path==='/yokoten/respond')||(($p=route_params($path,'/yokoten/respond/:id'))!==null&&$method==='PUT')){
        $files=wf_store_files('responseFiles',10);$b=wf_body();
        try{
            $related=wf_yokoten_related(wf_first_value($b,['isRelated','IsRelated'],'No'));
            $comment=wf_text(wf_first_value($b,['comment','Comment'],null),5000);
            $corrective=wf_text(wf_first_value($b,['correctiveAction','CorrectiveAction'],null),5000);
            $responseUnits=wf_yokoten_response_units($b,$user,$admin);
            $safetyUnit=$responseUnits?wf_text(implode(', ',$responseUnits),100):null;
            if(false&&$admin&&$method==='POST'&&$safetyUnit===null&&wf_yokoten_has_safety_units()){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Safety Unit is required.'],400);}
            if($method==='POST'){
                $yid=trim((string)wf_first_value($b,['yokotenId','YokotenID'],''));
                if($yid===''){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'YokotenID is required.'],400);}
                $topic=db_row('SELECT * FROM yokotentopics WHERE YokotenID=? AND IsActive=1',[$yid]);
                if(!$topic){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Topic not found.'],404);}
                $topic=wf_yokoten_normalize_topic($topic);
                $depts=wf_yokoten_departments($b,$user,$admin);
                if(!$depts){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Department is required.'],400);}
                $invalidDepts=array_values(array_filter($depts,static fn($dept)=>!wf_yokoten_dept_targeted($topic,(string)$dept)));
                if($invalidDepts){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Department is outside this topic scope: '.implode(', ',$invalidDepts)],400);}
                $departmentUnitsRaw=wf_first_value($b,['departmentUnits','DepartmentUnits'],null);
                $hasDepartmentUnitMap=$departmentUnitsRaw!==null&&$departmentUnitsRaw!=='';
                $parsedDepartmentUnits=$hasDepartmentUnitMap?yokoten_scope_parse_department_units($departmentUnitsRaw):null;
                if($hasDepartmentUnitMap&&$parsedDepartmentUnits===null){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Invalid Department-to-Safety-Unit mapping.'],400);}
                $departmentUnitPlan=null;
                if($admin&&$hasDepartmentUnitMap){
                    $departmentUnitPlan=yokoten_scope_build_department_unit_plan([
                        'departments'=>$depts,
                        'departmentUnits'=>$parsedDepartmentUnits,
                        'fallbackUnits'=>$responseUnits,
                        'topicUnits'=>$topic['TargetUnits'],
                        'masterUnits'=>wf_yokoten_master_unit_rows(),
                    ]);
                    if(!$departmentUnitPlan['ok']){wf_cleanup_files($files);json_response(['success'=>false,'message'=>implode('; ',$departmentUnitPlan['errors']),'errors'=>$departmentUnitPlan['errors']],400);}
                }
                if($admin&&$departmentUnitPlan===null&&!empty($topic['TargetUnits'])&&!$responseUnits){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Safety Unit is required for this scoped topic.'],400);}
                $masterUnits=wf_yokoten_master_units();
                $badResponseUnits=$masterUnits?array_values(array_diff($responseUnits,$masterUnits)):[];
                if($departmentUnitPlan===null&&$badResponseUnits){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Safety Unit is not in Master Data.'],400);}
                $badTopicUnits=array_values(array_filter($responseUnits,static fn($unit)=>!wf_yokoten_unit_targeted($topic,$unit)));
                if($departmentUnitPlan===null&&$badTopicUnits){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Safety Unit is outside this topic scope.'],400);}
                if($related==='Yes'&&$corrective===null){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'CorrectiveAction is required when IsRelated is Yes.'],400);}
                if($related==='Yes'&&!$files){json_response(['success'=>false,'message'=>'At least one evidence file is required when IsRelated is Yes.'],400);}
                $ph=implode(',',array_fill(0,count($depts),'?'));
                $ids=[];$restoredResponseCount=0;$staleResponseFiles=[];$pdo=db();$ownsTransaction=!$pdo->inTransaction();
                try{
                    if($ownsTransaction)$pdo->beginTransaction();
                    $existingRows=db_rows(
                        "SELECT ResponseID,Department,IsDeleted FROM yokotenresponses WHERE YokotenID=? AND Department IN ($ph) FOR UPDATE",
                        array_merge([$yid],$depts)
                    );
                    $activeExisting=array_values(array_filter($existingRows,static fn($row)=>(int)($row['IsDeleted']??0)===0));
                    if($activeExisting){
                        if($ownsTransaction&&$pdo->inTransaction())$pdo->rollBack();
                        wf_cleanup_files($files);
                        json_response(['success'=>false,'message'=>'Selected department already responded.','existingResponse'=>$activeExisting[0]],409);
                    }
                    $deletedByDepartment=[];
                    foreach($existingRows as $existingRow){
                        if((int)($existingRow['IsDeleted']??0)!==1)continue;
                        $departmentKey=trim((string)($existingRow['Department']??''));
                        if($departmentKey!==''&&!isset($deletedByDepartment[$departmentKey]))$deletedByDepartment[$departmentKey]=$existingRow;
                    }
                    foreach($depts as $dept){
                        $rid=wf_uuid();$approval=$related==='Yes'?'pending':null;
                        $departmentSafetyUnit=$departmentUnitPlan!==null?(implode(', ',$departmentUnitPlan['unitMap'][$dept]??[])?:null):$safetyUnit;
                        $deletedRow=$deletedByDepartment[$dept]??null;
                        if($deletedRow){
                            $rid=(string)$deletedRow['ResponseID'];
                            $deletedFiles=db_rows(
                                'SELECT FileID,FileURL FROM yokoten_response_files WHERE ResponseID=? FOR UPDATE',
                                [$rid]
                            );
                            foreach($deletedFiles as $deletedFile)$staleResponseFiles[]=$deletedFile;
                            db_execute('DELETE FROM yokoten_response_files WHERE ResponseID=?',[$rid]);
                            $changed=db_execute(
                                'UPDATE yokotenresponses SET SafetyUnit=?,EmployeeID=?,EmployeeName=?,IsRelated=?,Comment=?,CorrectiveAction=?,ApprovalStatus=?,ApprovalComment=NULL,ApprovedBy=NULL,ApprovedAt=NULL,ResponseDate=NOW(),IsDeleted=0 WHERE ResponseID=? AND IsDeleted=1',
                                [$departmentSafetyUnit,wf_user_id($user),$actor,$related,$comment,$related==='Yes'?$corrective:null,$approval,$rid]
                            );
                            if($changed!==1)throw new RuntimeException('Unable to restore the deleted Yokoten response for '.$dept.'.');
                            $restoredResponseCount++;
                        }else{
                            db_execute(
                                'INSERT INTO yokotenresponses (ResponseID,YokotenID,Department,SafetyUnit,EmployeeID,EmployeeName,IsRelated,Comment,CorrectiveAction,ApprovalStatus) VALUES (?,?,?,?,?,?,?,?,?,?)',
                                [$rid,$yid,$dept,$departmentSafetyUnit,wf_user_id($user),$actor,$related,$comment,$related==='Yes'?$corrective:null,$approval]
                            );
                        }
                        $ids[]=$rid;
                        foreach($files as $f)db_execute('INSERT INTO yokoten_response_files (FileID,ResponseID,YokotenID,Department,FileName,FileURL,PublicID,FileType,FileSize,UploadedBy) VALUES (?,?,?,?,?,?,?,?,?,?)',[wf_uuid(),$rid,$yid,$dept,$f['name'],$f['url'],$f['stored'],$f['type'],$f['size'],$actor]);
                    }
                    if($ownsTransaction)$pdo->commit();
                }catch(Throwable $transactionError){
                    if($ownsTransaction&&$pdo->inTransaction())$pdo->rollBack();
                    throw $transactionError;
                }
                if($ownsTransaction)foreach($staleResponseFiles as $staleFile)wf_yokoten_delete_file_if_unreferenced($staleFile['FileURL']??null);
                $attemptImmediate=count($ids)===1;
                foreach($ids as $rid){wf_yokoten_queue_email((string)$rid,'Submitted',$actor,$attemptImmediate);if($related==='Yes')wf_yokoten_queue_email((string)$rid,'RelatedSubmitted',$actor,$attemptImmediate);}
                json_response([
                    'success'=>true,
                    'message'=>count($ids)>1?'Responses saved for '.count($ids).' departments.':'Response saved.',
                    'id'=>$ids[0]??null,
                    'responseId'=>$ids[0]??null,
                    'responseIds'=>$ids,
                    'restoredResponseCount'=>$restoredResponseCount,
                    'notificationMode'=>$attemptImmediate?'immediate':'queued',
                ]);
            }else{
                $row=db_row('SELECT * FROM yokotenresponses WHERE ResponseID=? AND (IsDeleted IS NULL OR IsDeleted=0)',[$p['id']]);
                if(!$row){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Not found.'],404);}
                $wasRejected=strcasecmp((string)($row['ApprovalStatus']??''),'rejected')===0;
                $sameDept=trim((string)($row['Department']??''))===trim((string)($user['department']??''));
                if(!$admin&&!$sameDept){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Permission denied.'],403);}
                if(!$admin&&strcasecmp((string)($row['ApprovalStatus']??''),'rejected')!==0){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'Only rejected responses can be edited.'],403);}
                $existingFiles=(int)(safe_scalar('SELECT COUNT(*) FROM yokoten_response_files WHERE ResponseID=?',[$p['id']])??0);
                if($related==='Yes'&&$corrective===null){wf_cleanup_files($files);json_response(['success'=>false,'message'=>'CorrectiveAction is required when IsRelated is Yes.'],400);}
                if($related==='Yes'&&$existingFiles+count($files)===0){json_response(['success'=>false,'message'=>'At least one evidence file is required when IsRelated is Yes.'],400);}
                $approval=$related==='Yes'?($admin?($row['ApprovalStatus']?:'pending'):'pending'):null;
                db_execute('UPDATE yokotenresponses SET SafetyUnit=COALESCE(?,SafetyUnit),IsRelated=?,Comment=?,CorrectiveAction=?,ApprovalStatus=?,ApprovalComment=?,ApprovedBy=?,ApprovedAt=? WHERE ResponseID=?',[$safetyUnit,$related,$comment,$related==='Yes'?$corrective:null,$approval,$admin?($row['ApprovalComment']??null):null,$admin?($row['ApprovedBy']??null):null,$admin?($row['ApprovedAt']??null):null,$p['id']]);
                foreach($files as $f)db_execute('INSERT INTO yokoten_response_files (FileID,ResponseID,YokotenID,Department,FileName,FileURL,PublicID,FileType,FileSize,UploadedBy) VALUES (?,?,?,?,?,?,?,?,?,?)',[wf_uuid(),$p['id'],$row['YokotenID'],$row['Department'],$f['name'],$f['url'],$f['stored'],$f['type'],$f['size'],$actor]);
                if($wasRejected&&$approval==='pending')wf_yokoten_queue_email((string)$p['id'],'Resubmitted',$actor);
                json_response(['success'=>true,'id'=>$p['id']]);
            }
        }catch(Throwable $e){wf_cleanup_files($files);throw $e;}
    }
    $p=route_params($path,'/yokoten/respond/:id'); if($p!==null&&$method==='DELETE'){require_admin();$row=db_row('SELECT ResponseID,IsDeleted FROM yokotenresponses WHERE ResponseID=?',[$p['id']]);if(!$row)json_response(['success'=>false,'message'=>'Not found.'],404);$changed=db_execute('UPDATE yokotenresponses SET IsDeleted=1 WHERE ResponseID=? AND (IsDeleted IS NULL OR IsDeleted=0)',[$p['id']]);json_response(['success'=>true,'alreadyDeleted'=>$changed===0]);}
    $p=route_params($path,'/yokoten/respond/:id/approve'); if($p!==null&&$method==='POST'){require_admin();db_execute("UPDATE yokotenresponses SET ApprovalStatus='approved',ApprovalComment=NULL,ApprovedBy=?,ApprovedAt=NOW() WHERE ResponseID=?",[$actor,$p['id']]);wf_yokoten_queue_approval_email((string)$p['id'],$actor);json_response(['success'=>true]);}
    $p=route_params($path,'/yokoten/respond/:id/reject'); if($p!==null&&$method==='POST'){require_admin();$b=json_body();db_execute("UPDATE yokotenresponses SET ApprovalStatus='rejected',ApprovalComment=?,ApprovedBy=?,ApprovedAt=NOW() WHERE ResponseID=?",[$b['comment']??$b['ApprovalComment']??null,$actor,$p['id']]);wf_yokoten_queue_email((string)$p['id'],'Rejected',$actor);json_response(['success'=>true]);}
    $p=route_params($path,'/yokoten/response-files/:fileId'); if($p!==null&&$method==='DELETE'){require_admin();$f=db_row('SELECT FileURL FROM yokoten_response_files WHERE FileID=?',[$p['fileId']]);db_execute('DELETE FROM yokoten_response_files WHERE FileID=?',[$p['fileId']]);if($f)delete_uploaded_file($f['FileURL']);json_response(['success'=>true]);}
    if($method==='GET'&&$path==='/yokoten/dashboard-config'){ $cfg=['pinnedDepts'=>[],'pinnedUnits'=>[]];foreach(db_rows('SELECT ConfigKey,ConfigValue FROM yokoten_dashboard_config') as $r)$cfg[$r['ConfigKey']]=wf_json($r['ConfigValue'],[]);$cfg['pinnedDepts']=wf_yokoten_filter_master_values($cfg['pinnedDepts'],wf_yokoten_master_depts());$cfg['pinnedUnits']=wf_yokoten_filter_master_values($cfg['pinnedUnits'],wf_yokoten_master_units());json_response(['success'=>true,'data'=>$cfg]);}
    if($method==='PUT'&&$path==='/yokoten/dashboard-config'){require_admin();$b=json_body();if(array_key_exists('pinnedDepts',$b))db_execute('INSERT INTO yokoten_dashboard_config (ConfigKey,ConfigValue,UpdatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue),UpdatedBy=VALUES(UpdatedBy)',['pinnedDepts',json_encode(wf_yokoten_filter_master_values($b['pinnedDepts'],wf_yokoten_master_depts()),JSON_UNESCAPED_UNICODE),$actor]);if(array_key_exists('pinnedUnits',$b))db_execute('INSERT INTO yokoten_dashboard_config (ConfigKey,ConfigValue,UpdatedBy) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ConfigValue=VALUES(ConfigValue),UpdatedBy=VALUES(UpdatedBy)',['pinnedUnits',json_encode(wf_yokoten_filter_master_values($b['pinnedUnits'],wf_yokoten_master_units()),JSON_UNESCAPED_UNICODE),$actor]);json_response(['success'=>true]);}
    if($method==='POST'&&$path==='/yokoten/topics'){require_admin();$b=json_body();$targetDepts=wf_yokoten_scope_list($b['TargetDepts']??null);$targetUnits=wf_yokoten_scope_list($b['TargetUnits']??null);$badDepts=array_values(array_diff($targetDepts,wf_yokoten_master_depts()));$masterUnits=wf_yokoten_master_units();$badUnits=$masterUnits?array_values(array_diff($targetUnits,$masterUnits)):[];if($badDepts)json_response(['success'=>false,'message'=>'Department is not in Master Data: '.implode(', ',$badDepts)],400);if($badUnits)json_response(['success'=>false,'message'=>'Safety Unit is not in Master Data: '.implode(', ',$badUnits)],400);if(false&&wf_yokoten_has_safety_units()&&!$targetUnits)json_response(['success'=>false,'message'=>'Safety Unit is required.'],400);$id=wf_uuid();db_execute('INSERT INTO yokotentopics (YokotenID,Title,TopicDescription,Category,RiskLevel,DateIssued,Deadline,AttachmentUrl,AttachmentName,TargetDepts,TargetUnits,IsActive,CreatedBy) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$b['Title']??null,$b['TopicDescription']??($b['Description']??''),$b['Category']??'General',$b['RiskLevel']??'Low',!empty($b['DateIssued'])?$b['DateIssued']:date('Y-m-d H:i:s'),wf_date($b['Deadline']??null),$b['AttachmentUrl']??null,$b['AttachmentName']??null,$targetDepts?json_encode($targetDepts,JSON_UNESCAPED_UNICODE):null,$targetUnits?json_encode($targetUnits,JSON_UNESCAPED_UNICODE):null,1,$actor]);json_response(['success'=>true,'id'=>$id]);}
    $p=route_params($path,'/yokoten/topics/:id'); if($p!==null&&$method==='PUT'){require_admin();$b=json_body();$targetDepts=wf_yokoten_scope_list($b['TargetDepts']??null);$targetUnits=wf_yokoten_scope_list($b['TargetUnits']??null);$badDepts=array_values(array_diff($targetDepts,wf_yokoten_master_depts()));$masterUnits=wf_yokoten_master_units();$badUnits=$masterUnits?array_values(array_diff($targetUnits,$masterUnits)):[];if($badDepts)json_response(['success'=>false,'message'=>'Department is not in Master Data: '.implode(', ',$badDepts)],400);if($badUnits)json_response(['success'=>false,'message'=>'Safety Unit is not in Master Data: '.implode(', ',$badUnits)],400);if(false&&wf_yokoten_has_safety_units()&&!$targetUnits)json_response(['success'=>false,'message'=>'Safety Unit is required.'],400);db_execute('UPDATE yokotentopics SET Title=?,TopicDescription=?,Category=?,RiskLevel=?,Deadline=?,AttachmentUrl=?,AttachmentName=?,TargetDepts=?,TargetUnits=? WHERE YokotenID=?',[$b['Title']??null,$b['TopicDescription']??($b['Description']??''),$b['Category']??'General',$b['RiskLevel']??'Low',wf_date($b['Deadline']??null),$b['AttachmentUrl']??null,$b['AttachmentName']??null,$targetDepts?json_encode($targetDepts,JSON_UNESCAPED_UNICODE):null,$targetUnits?json_encode($targetUnits,JSON_UNESCAPED_UNICODE):null,$p['id']]);json_response(['success'=>true]);}
    if($p!==null&&$method==='DELETE'){require_admin();db_execute('UPDATE yokotentopics SET IsActive=0 WHERE YokotenID=?',[$p['id']]);json_response(['success'=>true]);}
    if($method==='POST'&&$path==='/yokoten/bulk-approve'){require_admin();$b=json_body();$ids=$b['ids']??[];$n=0;foreach($ids as $id){$id=trim((string)$id);if($id==='')continue;$changed=db_execute("UPDATE yokotenresponses SET ApprovalStatus='approved',ApprovedBy=?,ApprovedAt=NOW() WHERE ResponseID=? AND ApprovalStatus='pending'",[$actor,$id]);$n+=$changed;if($changed)wf_yokoten_queue_approval_email($id,$actor);}json_response(['success'=>true,'approved'=>$n]);}
    return false;
}
