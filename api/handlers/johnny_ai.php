<?php
declare(strict_types=1);

function johnny_ensure_schema(): void
{
    static $ready = false;
    if ($ready) return;

    db()->exec("CREATE TABLE IF NOT EXISTS app_settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT DEFAULT NULL,
        UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    db()->exec("CREATE TABLE IF NOT EXISTS johnny_chat_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        UserID VARCHAR(50) NOT NULL,
        Title VARCHAR(180) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_user_updated (UserID, UpdatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    db()->exec("CREATE TABLE IF NOT EXISTS johnny_chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ConversationID INT NOT NULL,
        UserID VARCHAR(50) NOT NULL,
        Role VARCHAR(20) NOT NULL,
        MessageText MEDIUMTEXT NOT NULL,
        SourceType VARCHAR(40) DEFAULT NULL,
        CitationsJson JSON DEFAULT NULL,
        Model VARCHAR(80) DEFAULT NULL,
        LatencyMs INT DEFAULT NULL,
        PromptTokens INT DEFAULT NULL,
        OutputTokens INT DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_conversation_created (ConversationID, CreatedAt),
        KEY idx_user_created (UserID, CreatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    db()->exec("CREATE TABLE IF NOT EXISTS johnny_kb_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        Title VARCHAR(220) NOT NULL,
        Category VARCHAR(80) DEFAULT 'general',
        OriginalName VARCHAR(220) NOT NULL,
        StoredName VARCHAR(220) NOT NULL,
        FileUrl TEXT NOT NULL,
        MimeType VARCHAR(120) DEFAULT NULL,
        FileSize INT DEFAULT 0,
        SourceType VARCHAR(30) NOT NULL DEFAULT 'document',
        TextContent MEDIUMTEXT DEFAULT NULL,
        IsActive TINYINT(1) NOT NULL DEFAULT 1,
        IndexedStatus VARCHAR(30) NOT NULL DEFAULT 'pending',
        ChunkCount INT NOT NULL DEFAULT 0,
        ErrorMessage TEXT DEFAULT NULL,
        AuditStatus VARCHAR(30) DEFAULT NULL,
        AuditJson MEDIUMTEXT DEFAULT NULL,
        LastAuditAt DATETIME DEFAULT NULL,
        ExtractionLogJson MEDIUMTEXT DEFAULT NULL,
        LastExtractionAt DATETIME DEFAULT NULL,
        UploadedBy VARCHAR(50) DEFAULT NULL,
        UploadedByName VARCHAR(120) DEFAULT NULL,
        UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        LastIndexedAt DATETIME DEFAULT NULL,
        KEY idx_active_status (IsActive, IndexedStatus),
        KEY idx_category (Category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN SourceType VARCHAR(30) NOT NULL DEFAULT 'document' AFTER FileSize"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN TextContent MEDIUMTEXT DEFAULT NULL AFTER SourceType"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN AuditStatus VARCHAR(30) DEFAULT NULL AFTER ErrorMessage"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN AuditJson MEDIUMTEXT DEFAULT NULL AFTER AuditStatus"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN LastAuditAt DATETIME DEFAULT NULL AFTER AuditJson"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN ExtractionLogJson MEDIUMTEXT DEFAULT NULL AFTER LastAuditAt"); } catch (Throwable $e) {}
    try { db()->exec("ALTER TABLE johnny_kb_documents ADD COLUMN LastExtractionAt DATETIME DEFAULT NULL AFTER ExtractionLogJson"); } catch (Throwable $e) {}

    db()->exec("CREATE TABLE IF NOT EXISTS johnny_kb_chunks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        DocumentID INT NOT NULL,
        ChunkIndex INT NOT NULL,
        ChunkText MEDIUMTEXT NOT NULL,
        PageLabel VARCHAR(80) DEFAULT NULL,
        EmbeddingJson MEDIUMTEXT DEFAULT NULL,
        EmbeddingModel VARCHAR(80) DEFAULT NULL,
        TokenEstimate INT DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_doc_chunk (DocumentID, ChunkIndex),
        KEY idx_doc (DocumentID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    db()->exec("CREATE TABLE IF NOT EXISTS johnny_operational_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        Level VARCHAR(20) NOT NULL,
        Operation VARCHAR(50) NOT NULL,
        Stage VARCHAR(80) DEFAULT NULL,
        UserID VARCHAR(50) DEFAULT NULL,
        ConversationID INT DEFAULT NULL,
        DocumentID INT DEFAULT NULL,
        Model VARCHAR(80) DEFAULT NULL,
        HttpStatus INT DEFAULT NULL,
        LatencyMs INT DEFAULT NULL,
        Message VARCHAR(900) DEFAULT NULL,
        MetaJson MEDIUMTEXT DEFAULT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_created (CreatedAt),
        KEY idx_level_created (Level, CreatedAt),
        KEY idx_operation_created (Operation, CreatedAt),
        KEY idx_document_created (DocumentID, CreatedAt),
        KEY idx_conversation_created (ConversationID, CreatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    try { db()->exec('ALTER TABLE johnny_operational_logs ADD KEY idx_created (CreatedAt)'); } catch (Throwable $e) {}
    global $config;
    $retentionDays = min(365, max(1, (int) ($config['johnny_operational_log_retention_days'] ?? 30)));
    db()->exec('DELETE FROM johnny_operational_logs WHERE CreatedAt < DATE_SUB(NOW(), INTERVAL ' . $retentionDays . ' DAY)');

    $ready = true;
}

function johnny_write_log(array $entry): void
{
    try {
        db_execute(
            'INSERT INTO johnny_operational_logs(Level,Operation,Stage,UserID,ConversationID,DocumentID,Model,HttpStatus,LatencyMs,Message,MetaJson) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
            [
                mb_substr((string) ($entry['level'] ?? 'info'), 0, 20),
                mb_substr((string) ($entry['operation'] ?? 'unknown'), 0, 50),
                isset($entry['stage']) ? mb_substr((string) $entry['stage'], 0, 80) : null,
                isset($entry['userId']) ? mb_substr((string) $entry['userId'], 0, 50) : null,
                !empty($entry['conversationId']) ? (int) $entry['conversationId'] : null,
                !empty($entry['documentId']) ? (int) $entry['documentId'] : null,
                isset($entry['model']) ? mb_substr((string) $entry['model'], 0, 80) : null,
                !empty($entry['httpStatus']) ? (int) $entry['httpStatus'] : null,
                !empty($entry['latencyMs']) ? (int) $entry['latencyMs'] : null,
                isset($entry['message']) ? mb_substr((string) $entry['message'], 0, 900) : null,
                isset($entry['meta']) ? mb_substr(johnny_json_encode($entry['meta']), 0, 60000) : null,
            ]
        );
    } catch (Throwable $error) {
        error_log('[johnny-ai] operational log failed: ' . $error->getMessage());
    }
}

function johnny_observability_days($value): int
{
    $days = (int) $value;
    return in_array($days, [1, 7, 30, 90], true) ? $days : 7;
}

function johnny_num($value): int
{
    return (int) ($value ?? 0);
}

function johnny_observability_summary(int $days): array
{
    $intervalSql = 'DATE_SUB(NOW(), INTERVAL ' . $days . ' DAY)';
    $logSummary = db_row("
        SELECT COUNT(*) AS totalLogs,
               SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors,
               SUM(CASE WHEN Level='warning' THEN 1 ELSE 0 END) AS warnings,
               SUM(CASE WHEN Level='info' THEN 1 ELSE 0 END) AS info,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               MAX(LatencyMs) AS maxLatencyMs,
               SUM(CASE WHEN CreatedAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR) AND Level='error' THEN 1 ELSE 0 END) AS errorsLastHour,
               MAX(CreatedAt) AS lastLogAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql
    ") ?: [];
    $operations = db_rows("
        SELECT Operation AS operation, COUNT(*) AS total,
               SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors,
               SUM(CASE WHEN Level='warning' THEN 1 ELSE 0 END) AS warnings,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               MAX(LatencyMs) AS maxLatencyMs
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql
        GROUP BY Operation
        ORDER BY total DESC, Operation ASC
        LIMIT 12
    ");
    $stages = db_rows("
        SELECT Operation AS operation, Stage AS stage, Level AS level, COUNT(*) AS total, MAX(CreatedAt) AS lastAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql AND Level IN ('error','warning')
        GROUP BY Operation, Stage, Level
        ORDER BY total DESC, lastAt DESC
        LIMIT 12
    ");
    $models = db_rows("
        SELECT Model AS model, COUNT(*) AS total,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql AND Model IS NOT NULL AND Model <> ''
        GROUP BY Model
        ORDER BY total DESC, model ASC
        LIMIT 8
    ");
    $httpStatuses = db_rows("
        SELECT HttpStatus AS httpStatus, COUNT(*) AS total
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql AND HttpStatus IS NOT NULL
        GROUP BY HttpStatus
        ORDER BY total DESC, HttpStatus ASC
        LIMIT 10
    ");
    $chatSummary = db_row("
        SELECT COUNT(*) AS assistantMessages,
               COUNT(DISTINCT ConversationID) AS conversations,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs,
               MAX(LatencyMs) AS maxLatencyMs,
               SUM(CASE WHEN SourceType IN ('not_verified','ai_general') THEN 1 ELSE 0 END) AS unverifiedAnswers,
               SUM(CASE WHEN SourceType IN ('company_document','safety_knowledge','system_data','external_research','image_analysis') THEN 1 ELSE 0 END) AS verifiedAnswers,
               SUM(CASE WHEN SourceType='image_analysis' THEN 1 ELSE 0 END) AS imageAnalyses,
               SUM(CASE WHEN SourceType='external_research' THEN 1 ELSE 0 END) AS externalResearchAnswers
        FROM johnny_chat_messages
        WHERE Role='assistant' AND CreatedAt >= $intervalSql
    ") ?: [];
    $sourceTypes = db_rows("
        SELECT SourceType AS sourceType, COUNT(*) AS total,
               AVG(CASE WHEN LatencyMs IS NOT NULL THEN LatencyMs END) AS avgLatencyMs
        FROM johnny_chat_messages
        WHERE Role='assistant' AND CreatedAt >= $intervalSql
        GROUP BY SourceType
        ORDER BY total DESC, sourceType ASC
        LIMIT 10
    ");
    $daily = db_rows("
        SELECT bucketDate,
               SUM(logs) AS logs,
               SUM(errors) AS errors,
               SUM(assistantMessages) AS assistantMessages,
               SUM(unverifiedAnswers) AS unverifiedAnswers
        FROM (
            SELECT DATE(CreatedAt) AS bucketDate, COUNT(*) AS logs,
                   SUM(CASE WHEN Level='error' THEN 1 ELSE 0 END) AS errors,
                   0 AS assistantMessages, 0 AS unverifiedAnswers
            FROM johnny_operational_logs
            WHERE CreatedAt >= $intervalSql
            GROUP BY DATE(CreatedAt)
            UNION ALL
            SELECT DATE(CreatedAt) AS bucketDate, 0 AS logs, 0 AS errors,
                   COUNT(*) AS assistantMessages,
                   SUM(CASE WHEN SourceType IN ('not_verified','ai_general') THEN 1 ELSE 0 END) AS unverifiedAnswers
            FROM johnny_chat_messages
            WHERE Role='assistant' AND CreatedAt >= $intervalSql
            GROUP BY DATE(CreatedAt)
        ) x
        GROUP BY bucketDate
        ORDER BY bucketDate ASC
    ");
    $recentIssues = db_rows("
        SELECT id,Level,Operation,Stage,UserID,ConversationID,DocumentID,Model,HttpStatus,LatencyMs,Message,MetaJson,CreatedAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql AND Level IN ('error','warning')
        ORDER BY id DESC
        LIMIT 20
    ");
    $slowSamples = db_rows("
        SELECT id,Level,Operation,Stage,Model,HttpStatus,LatencyMs,Message,CreatedAt
        FROM johnny_operational_logs
        WHERE CreatedAt >= $intervalSql AND LatencyMs IS NOT NULL
        ORDER BY LatencyMs DESC, id DESC
        LIMIT 10
    ");
    $kb = db_row("
        SELECT COUNT(*) AS totalDocs,
               SUM(CASE WHEN IsActive=1 THEN 1 ELSE 0 END) AS activeDocs,
               SUM(CASE WHEN IndexedStatus='ready' THEN 1 ELSE 0 END) AS readyDocs,
               SUM(CASE WHEN IndexedStatus='error' THEN 1 ELSE 0 END) AS errorDocs,
               SUM(CASE WHEN AuditStatus='warning' THEN 1 ELSE 0 END) AS warningDocs,
               SUM(CASE WHEN SourceType='manual' THEN 1 ELSE 0 END) AS manualDocs,
               SUM(CASE WHEN SourceType='document' THEN 1 ELSE 0 END) AS uploadedDocs,
               COALESCE(SUM(ChunkCount),0) AS declaredChunks,
               MAX(UpdatedAt) AS lastUpdatedAt
        FROM johnny_kb_documents
    ") ?: [];
    return [
        'marker' => 'JOHNNY_PHASE4_OBSERVABILITY',
        'days' => $days,
        'generatedAt' => gmdate('c'),
        'logs' => [
            'total' => johnny_num($logSummary['totalLogs'] ?? 0),
            'errors' => johnny_num($logSummary['errors'] ?? 0),
            'warnings' => johnny_num($logSummary['warnings'] ?? 0),
            'info' => johnny_num($logSummary['info'] ?? 0),
            'errorsLastHour' => johnny_num($logSummary['errorsLastHour'] ?? 0),
            'avgLatencyMs' => (int) round((float) ($logSummary['avgLatencyMs'] ?? 0)),
            'maxLatencyMs' => johnny_num($logSummary['maxLatencyMs'] ?? 0),
            'lastLogAt' => $logSummary['lastLogAt'] ?? null,
            'operations' => $operations,
            'stages' => $stages,
            'models' => $models,
            'httpStatuses' => $httpStatuses,
            'recentIssues' => $recentIssues,
            'slowSamples' => $slowSamples,
        ],
        'chat' => [
            'assistantMessages' => johnny_num($chatSummary['assistantMessages'] ?? 0),
            'conversations' => johnny_num($chatSummary['conversations'] ?? 0),
            'avgLatencyMs' => (int) round((float) ($chatSummary['avgLatencyMs'] ?? 0)),
            'maxLatencyMs' => johnny_num($chatSummary['maxLatencyMs'] ?? 0),
            'unverifiedAnswers' => johnny_num($chatSummary['unverifiedAnswers'] ?? 0),
            'verifiedAnswers' => johnny_num($chatSummary['verifiedAnswers'] ?? 0),
            'imageAnalyses' => johnny_num($chatSummary['imageAnalyses'] ?? 0),
            'externalResearchAnswers' => johnny_num($chatSummary['externalResearchAnswers'] ?? 0),
            'sourceTypes' => $sourceTypes,
        ],
        'kb' => [
            'totalDocs' => johnny_num($kb['totalDocs'] ?? 0),
            'activeDocs' => johnny_num($kb['activeDocs'] ?? 0),
            'readyDocs' => johnny_num($kb['readyDocs'] ?? 0),
            'errorDocs' => johnny_num($kb['errorDocs'] ?? 0),
            'warningDocs' => johnny_num($kb['warningDocs'] ?? 0),
            'manualDocs' => johnny_num($kb['manualDocs'] ?? 0),
            'uploadedDocs' => johnny_num($kb['uploadedDocs'] ?? 0),
            'declaredChunks' => johnny_num($kb['declaredChunks'] ?? 0),
            'lastUpdatedAt' => $kb['lastUpdatedAt'] ?? null,
        ],
        'daily' => $daily,
    ];
}

function johnny_user_id(array $user): string
{
    return trim((string) ($user['id'] ?? $user['EmployeeID'] ?? ''));
}

function johnny_clean_message($value): string
{
    $message = trim((string) $value);
    $message = preg_replace("/[ \t]+\n/u", "\n", $message) ?: $message;
    return mb_substr($message, 0, 4000);
}

function johnny_clean_knowledge_text($value): string
{
    $text = trim((string) $value);
    $text = preg_replace("/[ \t]+\n/u", "\n", $text) ?: $text;
    $text = preg_replace("/\n{4,}/u", "\n\n\n", $text) ?: $text;
    return mb_substr($text, 0, 60000);
}

function johnny_clean_answer($value): string
{
    $text = (string) $value;
    $text = preg_replace('/^\s*\*?\s*wait\s*,?.*format.*$/imu', '', $text) ?: $text;
    $text = preg_replace('/###STK_[A-Z_]+###/u', '', $text) ?: $text;
    $text = preg_replace('/\[(?:D|S|E)\d+\]/u', '', $text) ?: $text;
    $text = preg_replace('/\n{1,2}\s*แหล่งข้อมูล\s*:[\s\S]*$/u', '', $text) ?: $text;
    $text = preg_replace('/\n\nแต่ถ้า[\s\S]*น้องจอห์นนี่ครับ$/u', '', $text) ?: $text;
    $text = str_replace('**', '', $text);
    $text = preg_replace('/`+/u', '', $text) ?: $text;
    $text = preg_replace('/^#{1,6}\s*/mu', '', $text) ?: $text;
    $text = preg_replace('/^\s*>\s*/mu', '', $text) ?: $text;
    $text = preg_replace('/\*{2,}/u', '', $text) ?: $text;
    $text = preg_replace('#/{2,}#u', '/', $text) ?: $text;
    $text = preg_replace('/_{2,}/u', '_', $text) ?: $text;
    $text = preg_replace('/^[ \t]*[-*][ \t]+/mu', '- ', $text) ?: $text;
    $text = preg_replace("/[ \t]+\n/u", "\n", $text) ?: $text;
    $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?: $text;
    $text = trim($text);
    $text = preg_replace('/ผู้ครับ$/u', 'ทุกคนครับ', $text) ?: $text;
    $text = preg_replace('/[,:;]\s*$/u', '', $text) ?: $text;
    if ($text !== '' && !preg_match('/ครับ(?:ผม)?[\.!\?…]*$/u', $text)) {
        $text .= 'ครับ';
    }
    return $text;
}

function johnny_ensure_image_risk_rubric_answer($value): string
{
    $text = johnny_clean_answer($value);
    if ($text === '') {
        $text = 'สรุปจากรูป: ยังประเมินรายละเอียดจากรูปนี้ได้จำกัด ควรส่งรูปที่ชัดขึ้นและตรวจสอบหน้างานเพิ่มเติมครับ';
    }
    $fallback = [
        ['สรุปจากรูป', 'สรุปจากรูป: รูปนี้ประเมินได้จากสิ่งที่มองเห็นเท่านั้น'],
        ['ประเภทความเสี่ยง', 'ประเภทความเสี่ยง: ควรตรวจว่าเป็น Unsafe Condition, Unsafe Act, PPE, Equipment, Environmental หรือไม่'],
        ['Severity', 'Severity: ยังประเมินได้จำกัดจากรูป ต้องดูสภาพหน้างานจริง'],
        ['Likelihood', 'Likelihood: ยังประเมินได้จำกัดจากรูป ต้องยืนยันความถี่การสัมผัสงาน'],
        ['Risk Level', 'Risk Level: ระดับเบื้องต้นยังไม่ควรฟันธง จนกว่าจะตรวจสอบหน้างาน'],
        ['สิ่งที่ควรทำทันที', 'สิ่งที่ควรทำทันที: หยุดงานที่เสี่ยง แยกพื้นที่ และแจ้งหัวหน้างานหรือ SHE ถ้ามีอันตรายทันที'],
        ['มาตรการป้องกันถาวร', 'มาตรการป้องกันถาวร: กำหนดมาตรการทางวิศวกรรม วิธีปฏิบัติ และการตรวจติดตามให้เหมาะกับผลตรวจจริง'],
        ['ความมั่นใจ', 'ความมั่นใจและข้อมูลที่ต้องตรวจเพิ่ม: ควรยืนยันด้วยรูปชัด มุมกว้าง พื้นที่งาน กิจกรรม และผู้เกี่ยวข้อง'],
    ];
    $missing = [];
    foreach ($fallback as $item) {
        if (mb_strpos($text, $item[0]) === false) $missing[] = $item[1];
    }
    if ($missing) {
        $text = trim((string) preg_replace('/ครับ(?:ผม)?[\.!\?…]*$/u', '', $text));
        $text .= "\n\n" . implode("\n", $missing) . 'ครับ';
    }
    if (!preg_match('/ครับ(?:ผม)?[\.!\?…]*$/u', $text)) {
        $text .= 'ครับ';
    }
    return $text;
}

function johnny_title(string $message): string
{
    $oneLine = trim((string) preg_replace('/\s+/u', ' ', $message));
    if ($oneLine === '') return 'Johnny AI Chat';
    return mb_strlen($oneLine) > 70 ? mb_substr($oneLine, 0, 67) . '...' : $oneLine;
}

function johnny_conversation_for_user($conversationId, string $uid): ?array
{
    $id = (int) $conversationId;
    if ($id <= 0) return null;
    return db_row(
        'SELECT id, UserID, Title, CreatedAt, UpdatedAt FROM johnny_chat_conversations WHERE id=? AND UserID=? LIMIT 1',
        [$id, $uid]
    );
}

function johnny_create_conversation(string $uid, string $title): int
{
    $stmt = db()->prepare('INSERT INTO johnny_chat_conversations (UserID, Title) VALUES (?, ?)');
    $stmt->execute([$uid, $title]);
    return (int) db()->lastInsertId();
}

function johnny_recent_history(int $conversationId): array
{
    $rows = db_rows(
        'SELECT Role, MessageText FROM johnny_chat_messages WHERE ConversationID=? ORDER BY CreatedAt DESC, id DESC LIMIT 8',
        [$conversationId]
    );
    return array_reverse($rows);
}

function johnny_normalize_text(string $text): string
{
    if (function_exists('mb_check_encoding') && !mb_check_encoding($text, 'UTF-8')) {
        $encodings = ['UTF-8', 'ISO-8859-1', 'Windows-1252'];
        if (function_exists('mb_list_encodings')) {
            $available = array_map('strtoupper', mb_list_encodings());
            $encodings = array_values(array_filter($encodings, function ($encoding) use ($available) {
                return in_array(strtoupper($encoding), $available, true);
            }));
        }
        $converted = @mb_convert_encoding($text, 'UTF-8', $encodings ?: ['UTF-8']);
        if (is_string($converted) && $converted !== '') {
            $text = $converted;
        }
    }
    if (function_exists('iconv')) {
        $clean = @iconv('UTF-8', 'UTF-8//IGNORE', $text);
        if (is_string($clean)) {
            $text = $clean;
        }
    }
    $text = str_replace("\r", "\n", $text);
    $text = preg_replace("/[ \t]+\n/u", "\n", $text) ?: $text;
    $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?: $text;
    $text = preg_replace("/[ \t]{2,}/u", " ", $text) ?: $text;
    return trim($text);
}

function johnny_extracted_text_looks_bad(string $text): bool
{
    $normalized = johnny_normalize_text($text);
    if (mb_strlen($normalized) < 120) {
        return true;
    }
    $chars = preg_split('//u', $normalized, -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($chars) || !$chars) {
        return true;
    }
    $useful = 0;
    $bad = 0;
    foreach ($chars as $ch) {
        if (preg_match('/[\p{L}\p{N}\p{M}]/u', $ch)) {
            $useful++;
        } elseif (!preg_match('/^[\s\.,;:!\?\(\)\[\]\{\}\'"“”‘’\-–—_\/\\\\\|@#\$%&\*\+=<>~`\^°•·…]$/u', $ch)) {
            $bad++;
        }
    }
    $total = max(1, count($chars));
    return ($bad / $total) > 0.18 || ($useful / $total) < 0.35;
}

function johnny_pdf_text_needs_ai_fallback(string $text, string $filePath): bool
{
    global $config;
    $normalized = johnny_normalize_text($text);
    if (johnny_extracted_text_looks_bad($normalized)) return true;
    preg_match_all('/\b(?:Adobe|Identity|UCS|en-US|ToUnicode|CID|Registry|Ordering|Supplement)\b/u', $normalized, $artifactMatches);
    $artifactCount = is_array($artifactMatches[0] ?? null) ? count($artifactMatches[0]) : 0;
    $artifactPer10k = ($artifactCount * 10000) / max(1, mb_strlen($normalized));
    if ($artifactCount > 50 && $artifactPer10k > 3) return true;
    $size = is_file($filePath) ? (int) filesize($filePath) : 0;
    $minLocalChars = max(120, (int) ($config['johnny_pdf_min_local_text_chars'] ?? 1000));
    $minSizeForShortText = max(1, (int) ($config['johnny_pdf_min_size_for_short_text_bytes'] ?? (120 * 1024)));
    $maxBytesPerTextChar = max(1, (int) ($config['johnny_pdf_max_bytes_per_text_char'] ?? 180));
    $textLen = max(1, mb_strlen($normalized));
    if ($size >= $minSizeForShortText && $textLen < $minLocalChars) return true;
    if ($size >= $minSizeForShortText && ($size / $textLen) > $maxBytesPerTextChar) return true;
    return false;
}

function johnny_json_encode($value): string
{
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    $json = json_encode($value, $flags);
    if ($json === false) {
        throw new RuntimeException('Johnny AI cannot encode request JSON: ' . json_last_error_msg(), 500);
    }
    return $json;
}

function johnny_strip_xml(string $xml): string
{
    return html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8');
}

function johnny_zip_text(string $filePath, string $type): string
{
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('Server PHP ยังไม่มี ZipArchive สำหรับอ่าน Office file');
    }
    $zip = new ZipArchive();
    if ($zip->open($filePath) !== true) {
        throw new RuntimeException('ไม่สามารถอ่านไฟล์ Office ได้');
    }
    $parts = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = (string) $zip->getNameIndex($i);
        $ok = false;
        if ($type === 'docx') $ok = (bool) preg_match('#^word/(document|header\d*|footer\d*)\.xml$#i', $name);
        if ($type === 'pptx') $ok = (bool) preg_match('#^ppt/slides/slide\d+\.xml$#i', $name);
        if ($type === 'xlsx') $ok = (bool) preg_match('#^xl/(worksheets/sheet\d+|sharedStrings)\.xml$#i', $name);
        if (!$ok) continue;
        $xml = $zip->getFromIndex($i);
        if ($xml !== false) $parts[] = johnny_strip_xml((string) $xml);
    }
    $zip->close();
    return johnny_normalize_text(implode("\n\n", $parts));
}

function johnny_pdf_text(string $filePath): string
{
    $raw = (string) file_get_contents($filePath);
    $parts = [];
    if (preg_match_all('/stream\r?\n([\s\S]*?)\r?\nendstream/', $raw, $matches)) {
        foreach ($matches[1] as $stream) {
            $inflated = @gzuncompress($stream);
            $parts[] = $inflated !== false ? $inflated : $stream;
        }
    }
    $parts[] = $raw;
    $text = implode("\n", $parts);
    preg_match_all('/\(([^()]{2,})\)/', $text, $m);
    return johnny_normalize_text(str_replace(['\\n','\\r','\\t','\\(', '\\)'], ["\n","\n",' ','(',')'], implode(' ', $m[1] ?? [])));
}

function johnny_pdf_text_with_gemini(string $filePath, string $originalName, array &$trace = [], int $minimumExpectedChars = 0): string
{
    global $config;
    $apiKey = (string) ($config['gemini_api_key'] ?? '');
    if ($apiKey === '') {
        throw new RuntimeException('GEMINI_API_KEY is not configured for PDF extraction', 503);
    }
    $maxBytes = max(1, (int) ($config['johnny_pdf_gemini_max_mb'] ?? 18)) * 1024 * 1024;
    $size = is_file($filePath) ? (int) filesize($filePath) : 0;
    if ($size <= 0 || $size > $maxBytes) {
        throw new RuntimeException('PDF is too large for AI text extraction. Please upload DOCX/TXT or split the PDF.', 400);
    }
    $base = rtrim((string) ($config['gemini_api_base'] ?? 'https://generativelanguage.googleapis.com/v1beta'), '/');
    $pdfBase64 = base64_encode((string) file_get_contents($filePath));
    $headers = ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey];
    $timeoutMs = (int) ($config['johnny_pdf_extract_timeout_ms'] ?? 90000);
    $lastMessage = 'AI PDF extraction did not return readable text';
    $lastCode = 422;

    foreach (johnny_gemini_models() as $idx => $model) {
        $attemptStarted = microtime(true);
        $url = $base . '/models/' . rawurlencode($model) . ':generateContent';
        $payload = johnny_json_encode([
            'contents' => [[
                'role' => 'user',
                'parts' => [
                    ['text' => implode("\n", [
                        'Extract readable text from this PDF for a Thai safety knowledge base.',
                        'Use OCR for scanned pages, screenshots, tables, and embedded images when needed.',
                        'Preserve Thai text exactly, keep document order, include table text row-by-row, and do not summarize.',
                        'Return plain text only. If no readable text is available, return __NO_TEXT__.',
                        'Filename: ' . $originalName,
                    ])],
                    ['inline_data' => [
                        'mime_type' => 'application/pdf',
                        'data' => $pdfBase64,
                    ]],
                ],
            ]],
            'generationConfig' => [
                'maxOutputTokens' => (int) ($config['johnny_pdf_extract_max_output_tokens'] ?? 16384),
            ],
        ]);
        $status = 0;
        $err = '';
        $response = false;
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_TIMEOUT_MS => $timeoutMs,
            ]);
            $response = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);
            if ($response === false) {
                $lastMessage = $err ?: 'Gemini PDF extraction request failed';
                $lastCode = 502;
                $trace['attempts'][] = ['stage' => 'gemini_pdf', 'model' => $model, 'status' => 'error', 'httpStatus' => $status ?: null, 'durationMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'error' => mb_substr($lastMessage, 0, 500)];
                if ($idx < count(johnny_gemini_models()) - 1) continue;
                throw new RuntimeException($lastMessage, $lastCode);
            }
        } else {
            $context = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => implode("\r\n", $headers),
                    'content' => $payload,
                    'timeout' => max(1, (int) ceil($timeoutMs / 1000)),
                    'ignore_errors' => true,
                ],
            ]);
            $response = file_get_contents($url, false, $context);
            foreach (($http_response_header ?? []) as $header) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $m)) {
                    $status = (int) $m[1];
                    break;
                }
            }
            if ($response === false) {
                $lastMessage = 'Gemini PDF extraction request failed';
                $lastCode = 502;
                $trace['attempts'][] = ['stage' => 'gemini_pdf', 'model' => $model, 'status' => 'error', 'httpStatus' => $status ?: null, 'durationMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'error' => $lastMessage];
                if ($idx < count(johnny_gemini_models()) - 1) continue;
                throw new RuntimeException($lastMessage, $lastCode);
            }
        }
        $data = json_decode((string) $response, true);
        $data = is_array($data) ? $data : [];
        if ($status < 200 || $status >= 300) {
            $lastMessage = (string) ($data['error']['message'] ?? ('Gemini PDF extraction error (' . $status . ')'));
            $lastCode = $status >= 500 ? 502 : 400;
            $trace['attempts'][] = ['stage' => 'gemini_pdf', 'model' => $model, 'status' => 'error', 'httpStatus' => $status ?: null, 'durationMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'error' => mb_substr($lastMessage, 0, 500)];
            if ($idx < count(johnny_gemini_models()) - 1 && johnny_should_try_next_gemini_model($status, $data)) continue;
            throw new RuntimeException($lastMessage, $lastCode);
        }
        $text = johnny_normalize_text(johnny_extract_text($data));
        if ($text === '' || $text === '__NO_TEXT__' || johnny_extracted_text_looks_bad($text)) {
            $lastMessage = 'AI PDF extraction did not return readable text';
            $lastCode = 422;
            $trace['attempts'][] = ['stage' => 'gemini_pdf', 'model' => $model, 'status' => 'low_quality', 'httpStatus' => $status ?: null, 'durationMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'chars' => mb_strlen($text), 'error' => $lastMessage];
            if ($idx < count(johnny_gemini_models()) - 1) continue;
            throw new RuntimeException($lastMessage, $lastCode);
        }
        if ($minimumExpectedChars > 0 && mb_strlen($text) < $minimumExpectedChars) {
            $lastMessage = 'AI PDF extraction model ' . $model . ' returned incomplete text (' . mb_strlen($text) . '/' . $minimumExpectedChars . ' expected chars)';
            $lastCode = 422;
            $trace['attempts'][] = ['stage' => 'gemini_pdf', 'model' => $model, 'status' => 'incomplete', 'httpStatus' => $status ?: null, 'durationMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'chars' => mb_strlen($text), 'expectedChars' => $minimumExpectedChars, 'error' => $lastMessage];
            if ($idx < count(johnny_gemini_models()) - 1) continue;
            throw new RuntimeException($lastMessage, $lastCode);
        }
        $trace['attempts'][] = ['stage' => 'gemini_pdf', 'model' => $model, 'status' => 'success', 'httpStatus' => $status ?: null, 'durationMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'chars' => mb_strlen($text)];
        $trace['selectedMethod'] = 'gemini_pdf';
        return $text;
    }
    throw new RuntimeException($lastMessage, $lastCode);
}

function johnny_extract_document_text(string $filePath, string $originalName, array &$trace = []): string
{
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if (in_array($ext, ['txt', 'md', 'csv'], true)) {
        $text = johnny_normalize_text((string) file_get_contents($filePath));
        $trace['attempts'][] = ['stage' => 'local_parser', 'parser' => $ext, 'status' => 'success', 'chars' => mb_strlen($text)];
        $trace['selectedMethod'] = 'local_parser';
        return $text;
    }
    if ($ext === 'pdf') {
        $started = microtime(true);
        $localText = johnny_pdf_text($filePath);
        $needsFallback = johnny_pdf_text_needs_ai_fallback($localText, $filePath);
        $trace['attempts'][] = ['stage' => 'local_pdf', 'parser' => 'lightweight', 'status' => $needsFallback ? 'fallback' : 'success', 'durationMs' => (int) round((microtime(true) - $started) * 1000), 'chars' => mb_strlen($localText), 'reason' => $needsFallback ? 'quality_gate_requested_ai_ocr' : null];
        if (!$needsFallback) {
            $trace['selectedMethod'] = 'local_pdf';
            return $localText;
        }
        global $config;
        $size = is_file($filePath) ? (int) filesize($filePath) : 0;
        $maxBytesPerChar = max(1, (int) ($config['johnny_pdf_max_bytes_per_text_char'] ?? 180));
        $maxExpectedChars = max(1000, (int) ($config['johnny_pdf_ai_max_expected_chars'] ?? 12000));
        $minimumExpectedChars = max(
            (int) ($config['johnny_pdf_min_local_text_chars'] ?? 1000),
            min($maxExpectedChars, (int) floor($size / $maxBytesPerChar))
        );
        $trace['minimumExpectedChars'] = $minimumExpectedChars;
        return johnny_pdf_text_with_gemini($filePath, $originalName, $trace, $minimumExpectedChars);
    }
    if (in_array($ext, ['docx', 'pptx', 'xlsx'], true)) {
        $text = johnny_zip_text($filePath, $ext);
        $trace['attempts'][] = ['stage' => 'local_parser', 'parser' => $ext, 'status' => johnny_extracted_text_looks_bad($text) ? 'low_quality' : 'success', 'chars' => mb_strlen($text)];
        $trace['selectedMethod'] = 'local_parser';
        return $text;
    }
    throw new RuntimeException('ชนิดไฟล์นี้ยังไม่รองรับสำหรับ Knowledge Base');
}

function johnny_store_kb_upload(string $field): array
{
    global $config;
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        json_response(['success' => false, 'message' => 'กรุณาเลือกไฟล์ Knowledge Base'], 400);
    }
    if ((int) ($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'message' => 'Upload failed.'], 400);
    }
    $size = (int) ($file['size'] ?? 0);
    $max = max(1, (int) ($config['johnny_kb_max_upload_mb'] ?? 30)) * 1024 * 1024;
    if ($size <= 0 || $size > $max) {
        json_response(['success' => false, 'message' => 'Uploaded file is too large.'], 400);
    }
    $original = clean_upload_name($file['name'] ?? 'upload');
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!in_array($ext, ['pdf','docx','xlsx','pptx','txt','md','csv'], true)) {
        json_response(['success' => false, 'message' => 'Unsupported Johnny AI document type'], 400);
    }
    $stored = 'johnny-kb-' . date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
    $target = upload_dir() . DIRECTORY_SEPARATOR . $stored;
    if (!move_uploaded_file((string) ($file['tmp_name'] ?? ''), $target)) {
        json_response(['success' => false, 'message' => 'Cannot store uploaded file.'], 500);
    }
    return [
        'path' => $target,
        'storedName' => $stored,
        'originalName' => $original,
        'url' => upload_public_url($stored, $original),
        'mimetype' => (string) ($file['type'] ?? ''),
        'size' => $size,
    ];
}

function johnny_store_avatar_upload(string $field): array
{
    global $config;
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        json_response(['success' => false, 'message' => 'กรุณาเลือกรูปจอห์นนี่'], 400);
    }
    if ((int) ($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'message' => 'Upload failed.'], 400);
    }
    $size = (int) ($file['size'] ?? 0);
    $max = max(1, (int) ($config['johnny_avatar_max_upload_mb'] ?? 5)) * 1024 * 1024;
    if ($size <= 0 || $size > $max) {
        json_response(['success' => false, 'message' => 'Uploaded avatar is too large.'], 400);
    }
    $original = clean_upload_name($file['name'] ?? 'johnny-avatar');
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg','jpeg','png','gif','webp'], true)) {
        json_response(['success' => false, 'message' => 'Unsupported Johnny AI avatar type'], 400);
    }
    $mime = (string) ($file['type'] ?? '');
    if ($mime !== '' && !in_array($mime, ['image/jpeg','image/png','image/gif','image/webp'], true)) {
        json_response(['success' => false, 'message' => 'Unsupported Johnny AI avatar type'], 400);
    }
    $stored = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
    $target = upload_dir() . DIRECTORY_SEPARATOR . $stored;
    if (!move_uploaded_file((string) ($file['tmp_name'] ?? ''), $target)) {
        json_response(['success' => false, 'message' => 'Cannot store uploaded avatar.'], 500);
    }
    return [
        'path' => $target,
        'storedName' => $stored,
        'originalName' => $original,
        'url' => upload_public_url($stored, $original),
        'mimetype' => $mime,
        'size' => $size,
    ];
}

function johnny_store_risk_image_upload(string $field): array
{
    global $config;
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        json_response(['success' => false, 'message' => 'กรุณาเลือกรูปภาพสำหรับวิเคราะห์ความเสี่ยง'], 400);
    }
    if ((int) ($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'message' => 'Upload failed.'], 400);
    }
    $size = (int) ($file['size'] ?? 0);
    $max = max(1, (int) ($config['johnny_risk_image_max_upload_mb'] ?? 8)) * 1024 * 1024;
    if ($size <= 0 || $size > $max) {
        json_response(['success' => false, 'message' => 'Uploaded image is too large.'], 400);
    }
    $original = clean_upload_name($file['name'] ?? 'risk-image');
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!in_array($ext, ['jpg','jpeg','png','gif','webp'], true)) {
        json_response(['success' => false, 'message' => 'Unsupported Johnny AI risk image type'], 400);
    }
    $mime = (string) ($file['type'] ?? '');
    if ($mime !== '' && !in_array($mime, ['image/jpeg','image/png','image/gif','image/webp'], true)) {
        json_response(['success' => false, 'message' => 'Unsupported Johnny AI risk image type'], 400);
    }
    $stored = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
    $target = upload_dir() . DIRECTORY_SEPARATOR . $stored;
    if (!move_uploaded_file((string) ($file['tmp_name'] ?? ''), $target)) {
        json_response(['success' => false, 'message' => 'Cannot store uploaded risk image.'], 500);
    }
    return [
        'path' => $target,
        'storedName' => $stored,
        'originalName' => $original,
        'mimetype' => $mime,
        'size' => $size,
    ];
}

function johnny_setting(string $key): string
{
    $row = db_row('SELECT value FROM app_settings WHERE key_name=? LIMIT 1', [$key]);
    return (string) ($row['value'] ?? '');
}

function johnny_set_setting(string $key, string $value): void
{
    db_execute(
        'INSERT INTO app_settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value), UpdatedAt=NOW()',
        [$key, $value]
    );
}

function johnny_delete_setting(string $key): void
{
    db_execute('DELETE FROM app_settings WHERE key_name=?', [$key]);
}

function johnny_chunks(string $text): array
{
    global $config;
    $clean = johnny_normalize_text($text);
    $max = max(800, (int) ($config['johnny_chunk_chars'] ?? 3200));
    $overlap = max(0, min($max - 1, (int) ($config['johnny_chunk_overlap_chars'] ?? 350)));
    $limit = max(1, (int) ($config['johnny_max_chunks_per_doc'] ?? 30));
    $chunks = [];
    $len = mb_strlen($clean);
    $start = 0;
    while ($start < $len) {
        $part = trim(mb_substr($clean, $start, $max));
        if (mb_strlen($part) >= 80) $chunks[] = $part;
        if ($start + $max >= $len) break;
        $start = max(0, $start + $max - $overlap);
        if (count($chunks) >= $limit) break;
    }
    return $chunks;
}

function johnny_call_embedding(string $text, string $mode = 'document', string $title = 'none'): array
{
    global $config;
    $apiKey = (string) ($config['gemini_api_key'] ?? '');
    if ($apiKey === '') throw new RuntimeException('GEMINI_API_KEY is not configured', 503);
    $model = (string) ($config['gemini_embedding_model'] ?? 'gemini-embedding-2');
    $base = rtrim((string) ($config['gemini_api_base'] ?? 'https://generativelanguage.googleapis.com/v1beta'), '/');
    $prepared = $mode === 'query'
        ? 'task: question answering | query: ' . $text
        : 'title: ' . ($title !== '' ? $title : 'none') . ' | text: ' . $text;
    $payload = johnny_json_encode([
        'model' => 'models/' . $model,
        'content' => ['parts' => [['text' => $prepared]]],
        'outputDimensionality' => (int) ($config['gemini_embedding_dimension'] ?? 768),
    ]);
    $url = $base . '/models/' . rawurlencode($model) . ':embedContent';
    $headers = ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey];
    $timeout = max(1, (int) ceil(((int) ($config['gemini_timeout_ms'] ?? 30000)) / 1000));
    $status = 0;
    $err = '';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT_MS => (int) ($config['gemini_timeout_ms'] ?? 30000),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $payload,
                'timeout' => $timeout,
                'ignore_errors' => true,
            ],
        ]);
        $raw = file_get_contents($url, false, $context);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $status = (int) $m[1];
        }
    }
    if ($raw === false) throw new RuntimeException($err ?: 'Gemini embedding request failed', 502);
    $data = json_decode((string) $raw, true);
    $data = is_array($data) ? $data : [];
    if ($status < 200 || $status >= 300) {
        throw new RuntimeException((string) ($data['error']['message'] ?? 'Gemini embedding error'), $status >= 500 ? 502 : 400);
    }
    $values = $data['embedding']['values'] ?? ($data['embeddings'][0]['values'] ?? []);
    if (!is_array($values) || !$values) throw new RuntimeException('Gemini embedding response is empty');
    return array_map('floatval', $values);
}

function johnny_cosine(array $a, array $b): float
{
    if (count($a) !== count($b) || !$a) return 0.0;
    $dot = $ma = $mb = 0.0;
    foreach ($a as $i => $v) {
        $w = (float) ($b[$i] ?? 0);
        $dot += $v * $w;
        $ma += $v * $v;
        $mb += $w * $w;
    }
    return ($ma > 0 && $mb > 0) ? $dot / (sqrt($ma) * sqrt($mb)) : 0.0;
}

function johnny_keyword_terms(string $question): array
{
    $parts = preg_split('/[^\p{L}\p{N}_-]+/u', mb_strtolower($question), -1, PREG_SPLIT_NO_EMPTY);
    $skip = array_flip(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'what', 'how', 'why']);
    $out = [];
    foreach ($parts ?: [] as $term) {
        $term = trim($term);
        if (mb_strlen($term) < 2 || isset($skip[$term])) continue;
        if (!in_array($term, $out, true)) $out[] = $term;
        if (count($out) >= 24) break;
    }
    return $out;
}

function johnny_keyword_score(string $question, array $row): float
{
    $terms = johnny_keyword_terms($question);
    if (!$terms) return 0.0;
    $query = mb_strtolower(trim($question));
    $titleText = mb_strtolower((string) ($row['Title'] ?? '') . ' ' . (string) ($row['OriginalName'] ?? '') . ' ' . (string) ($row['Category'] ?? ''));
    $bodyText = mb_strtolower((string) ($row['ChunkText'] ?? ''));
    $score = (mb_strlen($query) >= 4 && mb_strpos($bodyText, $query) !== false) ? 0.25 : 0.0;
    $matchedWeight = 0.0;
    $totalWeight = 0.0;
    foreach ($terms as $term) {
        $weight = mb_strlen($term) >= 6 ? 1.25 : 1.0;
        $totalWeight += $weight;
        if (mb_strpos($titleText, $term) !== false) $matchedWeight += $weight * 1.5;
        elseif (mb_strpos($bodyText, $term) !== false) $matchedWeight += $weight;
    }
    if ($totalWeight > 0) $score += min(0.75, $matchedWeight / max($totalWeight * 1.4, 1.0));
    return max(0.0, min(1.0, $score));
}

function johnny_extracted_summary(array $chunks, array $doc = []): array
{
    $totalChunks = count($chunks);
    $totalChars = 0;
    $embeddingCount = 0;
    $artifactCount = 0;
    $topics = [];
    $combinedParts = [];
    foreach ($chunks as $idx => $chunk) {
        $text = johnny_normalize_text((string) ($chunk['ChunkText'] ?? ''));
        $chars = mb_strlen($text);
        $totalChars += $chars;
        if ((string) ($chunk['EmbeddingJson'] ?? '') !== '') $embeddingCount++;
        if (preg_match_all('/\b(?:Adobe|Identity|UCS|en-US|ToUnicode|CID|Registry|Ordering|Supplement)\b/u', $text, $m)) {
            $artifactCount += count($m[0] ?? []);
        }
        if ($idx < 30 && $text !== '') {
            $parts = preg_split('/\n|[\.!\?。]/u', $text);
            $first = '';
            if (is_array($parts)) {
                foreach ($parts as $part) {
                    $part = trim((string) $part);
                    if ($part !== '') {
                        $first = $part;
                        break;
                    }
                }
            }
            if ($first === '') $first = mb_substr($text, 0, 140);
            $topics[] = [
                'chunkIndex' => (int) ($chunk['ChunkIndex'] ?? $idx),
                'chars' => (int) ($chunk['CharCount'] ?? $chars),
                'title' => mb_strlen($first) > 140 ? mb_substr($first, 0, 137) . '...' : $first,
            ];
        }
        $combinedParts[] = $text;
    }
    $combined = johnny_normalize_text(implode("\n", $combinedParts));
    preg_match_all('/\b[a-z][a-z0-9-]{3,}\b/i', strtolower($combined), $terms);
    $skip = ['this' => true, 'that' => true, 'with' => true, 'from' => true, 'page' => true, 'document' => true, 'revision' => true, 'issue' => true, 'date' => true];
    $keywords = [];
    foreach (($terms[0] ?? []) as $term) {
        if (!isset($skip[$term]) && !in_array($term, $keywords, true)) $keywords[] = $term;
        if (count($keywords) >= 12) break;
    }
    foreach (['PPE','KY','Hiyari','Patrol','Contractor','ผู้รับเหมา','อุบัติเหตุ','ความเสี่ยง','อันตราย','ความปลอดภัย','ควบคุม','มาตรการ','ฉุกเฉิน','อบรม','ตรวจสอบ','เครื่องจักร'] as $term) {
        if (mb_stripos($combined, $term) !== false && !in_array($term, $keywords, true)) array_unshift($keywords, $term);
    }
    $fileSize = (int) ($doc['FileSize'] ?? 0);
    return [
        'totalChunks' => $totalChunks,
        'totalChars' => $totalChars,
        'embeddingCount' => $embeddingCount,
        'artifactMatches' => $artifactCount,
        'quality' => [
            'noChunks' => $totalChunks === 0,
            'embeddingMismatch' => $totalChunks > 0 && $embeddingCount !== $totalChunks,
            'lowContent' => (string) ($doc['SourceType'] ?? 'document') === 'document' && $fileSize >= 100000 && $totalChars < 1000,
            'artifactHeavy' => $artifactCount > 50 && (($artifactCount * 10000) / max(1, $totalChars)) > 3,
        ],
        'topics' => $topics,
        'keywords' => array_slice(array_values(array_unique($keywords)), 0, 18),
        'preview' => mb_substr($combined, 0, 1600),
    ];
}

function johnny_clean_model_json_text(string $value): string
{
    $text = trim($value);
    $text = preg_replace('/^```(?:json)?/i', '', $text);
    $text = preg_replace('/```$/i', '', (string) $text);
    return trim((string) $text);
}

function johnny_audit_array($value, int $limit = 10): array
{
    if (is_array($value)) {
        $out = [];
        foreach ($value as $item) {
            $item = trim((string) $item);
            if ($item !== '') $out[] = $item;
            if (count($out) >= $limit) break;
        }
        return $out;
    }
    $text = trim((string) $value);
    return $text !== '' ? [$text] : [];
}

function johnny_normalize_document_audit($raw, array $doc = [], array $chunks = []): array
{
    $parsed = [];
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode(johnny_clean_model_json_text($raw), true);
        if (is_array($decoded)) $parsed = $decoded;
    } elseif (is_array($raw)) {
        $parsed = $raw;
    }
    $sourceSummary = johnny_extracted_summary($chunks, $doc);
    $relations = is_array($parsed['safetyRelations'] ?? null) ? $parsed['safetyRelations'] : [];
    $confidence = strtolower((string) ($parsed['confidence'] ?? ''));
    if (!in_array($confidence, ['high', 'medium', 'low'], true)) {
        $quality = $sourceSummary['quality'] ?? [];
        $confidence = (!empty($quality['noChunks']) || !empty($quality['lowContent']) || !empty($quality['artifactHeavy'])) ? 'low' : 'medium';
    }
    return [
        'summary' => mb_substr(trim((string) ($parsed['summary'] ?? $sourceSummary['preview'] ?? '')), 0, 1200),
        'mainTopics' => johnny_audit_array($parsed['mainTopics'] ?? $parsed['topics'] ?? array_map(static fn($item) => (string) ($item['title'] ?? ''), $sourceSummary['topics'] ?? []), 12),
        'safetyRelations' => [
            'PPE' => !empty($relations['PPE']),
            'Contractor' => !empty($relations['Contractor']),
            'KY' => !empty($relations['KY']),
            'Hiyari' => !empty($relations['Hiyari']),
            'Patrol' => !empty($relations['Patrol']),
        ],
        'requirements' => johnny_audit_array($parsed['requirements'] ?? [], 12),
        'procedures' => johnny_audit_array($parsed['procedures'] ?? [], 12),
        'prohibitions' => johnny_audit_array($parsed['prohibitions'] ?? [], 12),
        'uncertainAreas' => johnny_audit_array($parsed['uncertainAreas'] ?? [], 12),
        'qualityNotes' => johnny_audit_array($parsed['qualityNotes'] ?? [], 8),
        'confidence' => $confidence,
        'auditedAt' => gmdate('c'),
    ];
}

function johnny_build_audit_input(array $chunks): string
{
    global $config;
    $limit = max(1, (int) ($config['johnny_audit_max_chunks'] ?? 12));
    $chunkChars = max(400, (int) ($config['johnny_audit_chunk_chars'] ?? 1400));
    $maxInput = max(2000, (int) ($config['johnny_audit_max_input_chars'] ?? 16000));
    $parts = [];
    foreach (array_slice($chunks, 0, $limit) as $idx => $chunk) {
        $text = mb_substr(johnny_clean_knowledge_text((string) ($chunk['ChunkText'] ?? $chunk['chunk'] ?? '')), 0, $chunkChars);
        $parts[] = 'Chunk ' . ((int) ($chunk['ChunkIndex'] ?? $chunk['idx'] ?? $idx) + 1) . ":\n" . $text;
    }
    return mb_substr(implode("\n\n---\n\n", $parts), 0, $maxInput);
}

function johnny_audit_document_chunks(int $documentId, array $doc = []): array
{
    global $config;
    $limit = max(1, (int) ($config['johnny_audit_max_chunks'] ?? 12));
    $chunks = db_rows('SELECT ChunkIndex,ChunkText,CHAR_LENGTH(ChunkText) AS CharCount,EmbeddingJson FROM johnny_kb_chunks WHERE DocumentID=? ORDER BY ChunkIndex ASC,id ASC LIMIT ' . $limit, [$documentId]);
    if (!$chunks) {
        $audit = johnny_normalize_document_audit([
            'summary' => '',
            'confidence' => 'low',
            'uncertainAreas' => ['No indexed chunks were available for audit.'],
            'qualityNotes' => ['No indexed text found.'],
        ], $doc, $chunks);
        db_execute('UPDATE johnny_kb_documents SET AuditStatus=?, AuditJson=?, LastAuditAt=NOW() WHERE id=?', ['no_chunks', johnny_json_encode($audit), $documentId]);
        return $audit;
    }
    db_execute('UPDATE johnny_kb_documents SET AuditStatus=? WHERE id=?', ['auditing', $documentId]);
    try {
        $systemInstruction = implode("\n", [
            'You audit a Thai company safety Knowledge Base document after indexing.',
            'Use only the provided indexed chunks. Do not invent missing content.',
            'Return valid compact JSON only. No Markdown.',
            'JSON keys: summary, mainTopics, safetyRelations, requirements, procedures, prohibitions, uncertainAreas, qualityNotes, confidence.',
            'safetyRelations must be an object with boolean keys PPE, Contractor, KY, Hiyari, Patrol.',
            'confidence must be high, medium, or low.',
        ]);
        $contents = [[
            'role' => 'user',
            'parts' => [[
                'text' => implode("\n\n", [
                    'Document title: ' . (string) ($doc['Title'] ?? $doc['OriginalName'] ?? 'Knowledge Base'),
                    'Category: ' . (string) ($doc['Category'] ?? 'general'),
                    'Audit these indexed chunks:',
                    johnny_build_audit_input($chunks),
                ]),
            ]],
        ]];
        $result = johnny_call_gemini($systemInstruction, $contents, false, 'auto_audit', ['documentId' => $documentId]);
        $audit = johnny_normalize_document_audit((string) ($result['text'] ?? ''), $doc, $chunks);
        $audit['model'] = $result['model'] ?? null;
        db_execute('UPDATE johnny_kb_documents SET AuditStatus=?, AuditJson=?, LastAuditAt=NOW() WHERE id=?', ['ready', johnny_json_encode($audit), $documentId]);
        return $audit;
    } catch (Throwable $error) {
        $summary = johnny_extracted_summary($chunks, $doc);
        $audit = johnny_normalize_document_audit([
            'summary' => $summary['preview'] ?? '',
            'mainTopics' => array_map(static fn($item) => (string) ($item['title'] ?? ''), $summary['topics'] ?? []),
            'qualityNotes' => ['AI audit failed; fallback metadata was generated from indexed chunks.'],
            'uncertainAreas' => [mb_substr($error->getMessage(), 0, 240)],
            'confidence' => 'low',
        ], $doc, $chunks);
        db_execute('UPDATE johnny_kb_documents SET AuditStatus=?, AuditJson=?, LastAuditAt=NOW() WHERE id=?', ['failed', johnny_json_encode($audit), $documentId]);
        return $audit;
    }
}

function johnny_save_extraction_log(int $documentId, array $trace, string $outcome, ?Throwable $error = null): array
{
    $payload = $trace;
    $payload['outcome'] = $outcome;
    $payload['completedAt'] = gmdate('c');
    $payload['error'] = $error ? mb_substr($error->getMessage(), 0, 900) : null;
    db_execute('UPDATE johnny_kb_documents SET ExtractionLogJson=?,LastExtractionAt=NOW() WHERE id=?', [johnny_json_encode($payload), $documentId]);
    johnny_write_log([
        'level' => $outcome === 'accepted' ? 'info' : 'error',
        'operation' => 'document_index',
        'stage' => 'extraction_complete',
        'documentId' => $documentId,
        'message' => $outcome === 'accepted' ? 'Document extraction accepted' : $payload['error'],
        'meta' => ['outcome' => $outcome, 'selectedMethod' => $trace['selectedMethod'] ?? null, 'previousIndex' => $trace['previousIndex'] ?? null, 'candidate' => $trace['candidate'] ?? null, 'attempts' => $trace['attempts'] ?? []],
    ]);
    return $payload;
}

function johnny_index_document(int $documentId, string $filePath, string $title, string $originalName): array
{
    global $config;
    $before = db_row('SELECT COUNT(*) AS cnt,COALESCE(SUM(CHAR_LENGTH(ChunkText)),0) AS chars FROM johnny_kb_chunks WHERE DocumentID=?', [$documentId]) ?: [];
    $previousCount = (int) ($before['cnt'] ?? 0);
    $previousChars = (int) ($before['chars'] ?? 0);
    $trace = [
        'version' => 1,
        'startedAt' => gmdate('c'),
        'file' => ['name' => $originalName, 'extension' => strtolower(pathinfo($originalName, PATHINFO_EXTENSION)), 'bytes' => is_file($filePath) ? (int) filesize($filePath) : 0],
        'previousIndex' => ['chunks' => $previousCount, 'chars' => $previousChars],
        'selectedMethod' => null,
        'attempts' => [],
        'candidate' => null,
    ];
    db_execute('UPDATE johnny_kb_documents SET IndexedStatus=?, ErrorMessage=NULL, AuditStatus=NULL WHERE id=?', ['indexing', $documentId]);
    $pdo = db();
    try {
        $chunks = johnny_chunks(johnny_extract_document_text($filePath, $originalName, $trace));
        if (!$chunks) throw new RuntimeException('ไม่พบข้อความที่อ่านได้จากเอกสารนี้');
        $nextChars = array_sum(array_map('mb_strlen', $chunks));
        $trace['candidate'] = ['chunks' => count($chunks), 'chars' => $nextChars];
        $minCharRatio = min(1, max(0, (float) ($config['johnny_reindex_min_char_ratio'] ?? 0.65)));
        $minChunkRatio = min(1, max(0, (float) ($config['johnny_reindex_min_chunk_ratio'] ?? 0.5)));
        $suspiciousRegression = $previousCount >= 2
            && $previousChars >= 1000
            && count($chunks) < $previousCount * $minChunkRatio
            && $nextChars < $previousChars * $minCharRatio;
        if ($suspiciousRegression) {
            throw new RuntimeException(sprintf(
                'ผล Reindex มีข้อความลดลงผิดปกติ (%d → %d chunks, %s → %s ตัวอักษร) ระบบเก็บ index เดิมไว้ กรุณาตรวจไฟล์ต้นฉบับแล้วลองใหม่',
                $previousCount,
                count($chunks),
                number_format($previousChars),
                number_format($nextChars)
            ));
        }
        $model = (string) ($config['gemini_embedding_model'] ?? 'gemini-embedding-2');
        $prepared = [];
        foreach ($chunks as $idx => $chunk) {
            $prepared[] = ['idx' => $idx, 'chunk' => $chunk, 'embedding' => johnny_call_embedding($chunk, 'document', $title)];
        }
        $pdo->beginTransaction();
        db_execute('DELETE FROM johnny_kb_chunks WHERE DocumentID=?', [$documentId]);
        foreach ($prepared as $item) {
            db_execute(
                'INSERT INTO johnny_kb_chunks(DocumentID,ChunkIndex,ChunkText,PageLabel,EmbeddingJson,EmbeddingModel,TokenEstimate) VALUES(?,?,?,?,?,?,?)',
                [$documentId, $item['idx'], $item['chunk'], 'chunk ' . ($item['idx'] + 1), johnny_json_encode($item['embedding']), $model, (int) ceil(mb_strlen($item['chunk']) / 4)]
            );
        }
        db_execute('UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=NULL, LastIndexedAt=NOW() WHERE id=?', ['ready', count($chunks), $documentId]);
        $pdo->commit();
        $extractionLog = johnny_save_extraction_log($documentId, $trace, 'accepted');
        $audit = johnny_audit_document_chunks($documentId, ['id' => $documentId, 'Title' => $title, 'OriginalName' => $originalName, 'SourceType' => 'document']);
        return [
            'chunks' => count($chunks),
            'chars' => $nextChars,
            'embeddings' => count($prepared),
            'audit' => $audit,
            'extractionLog' => $extractionLog,
        ];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $message = mb_substr($error->getMessage(), 0, 900);
        db_execute(
            'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=?, LastIndexedAt=NOW() WHERE id=?',
            [$previousCount > 0 ? 'ready' : 'failed', $previousCount, $previousCount > 0 ? 'Reindex failed; previous index retained: ' . $message : $message, $documentId]
        );
        try { johnny_save_extraction_log($documentId, $trace, 'rejected', $error); } catch (Throwable $logError) { error_log('[johnny-ai] save extraction log failed: ' . $logError->getMessage()); }
        throw $error;
    }
}

function johnny_index_manual_knowledge(int $documentId, string $title, string $content): array
{
    global $config;
    $before = db_row('SELECT COUNT(*) AS cnt FROM johnny_kb_chunks WHERE DocumentID=?', [$documentId]) ?: [];
    $previousCount = (int) ($before['cnt'] ?? 0);
    db_execute('UPDATE johnny_kb_documents SET IndexedStatus=?, ErrorMessage=NULL, AuditStatus=NULL WHERE id=?', ['indexing', $documentId]);
    $pdo = db();
    try {
        $chunks = johnny_chunks($content);
        if (!$chunks) throw new RuntimeException('กรุณาระบุเนื้อหา safety knowledge อย่างน้อย 80 ตัวอักษร');
        $model = (string) ($config['gemini_embedding_model'] ?? 'gemini-embedding-2');
        $prepared = [];
        foreach ($chunks as $idx => $chunk) {
            $prepared[] = ['idx' => $idx, 'chunk' => $chunk, 'embedding' => johnny_call_embedding($chunk, 'document', $title)];
        }
        $pdo->beginTransaction();
        db_execute('DELETE FROM johnny_kb_chunks WHERE DocumentID=?', [$documentId]);
        foreach ($prepared as $item) {
            db_execute(
                'INSERT INTO johnny_kb_chunks(DocumentID,ChunkIndex,ChunkText,PageLabel,EmbeddingJson,EmbeddingModel,TokenEstimate) VALUES(?,?,?,?,?,?,?)',
                [$documentId, $item['idx'], $item['chunk'], 'manual ' . ($item['idx'] + 1), johnny_json_encode($item['embedding']), $model, (int) ceil(mb_strlen($item['chunk']) / 4)]
            );
        }
        db_execute('UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=NULL, LastIndexedAt=NOW() WHERE id=?', ['ready', count($chunks), $documentId]);
        $pdo->commit();
        $audit = johnny_audit_document_chunks($documentId, ['id' => $documentId, 'Title' => $title, 'OriginalName' => $title, 'SourceType' => 'manual']);
        return [
            'chunks' => count($chunks),
            'chars' => array_sum(array_map('mb_strlen', $chunks)),
            'embeddings' => count($prepared),
            'audit' => $audit,
        ];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $message = mb_substr($error->getMessage(), 0, 900);
        db_execute(
            'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=?, LastIndexedAt=NOW() WHERE id=?',
            [$previousCount > 0 ? 'ready' : 'failed', $previousCount, $previousCount > 0 ? 'Reindex failed; previous index retained: ' . $message : $message, $documentId]
        );
        throw $error;
    }
}

function johnny_clean_refined_chunk_text(string $value, string $fallback = ''): string
{
    $text = preg_replace('/^```(?:text|markdown)?/i', '', $value);
    $text = preg_replace('/```$/i', '', (string) $text);
    $text = preg_replace('/^\s*(?:ข้อความที่เกลาแล้ว|ปรับภาษาแล้ว|ผลลัพธ์)\s*[:：]\s*/iu', '', (string) $text);
    $text = johnny_clean_knowledge_text((string) $text);
    return mb_strlen($text) >= 40 ? $text : johnny_clean_knowledge_text($fallback);
}

function johnny_refine_chunk_text(string $chunkText, string $docTitle, int $chunkIndex, int $documentId = 0): string
{
    global $config;
    $original = johnny_clean_knowledge_text($chunkText);
    if ($original === '') return $original;
    $systemInstruction = implode("\n", [
        'You are a careful Thai safety-document text editor for a company Knowledge Base.',
        'Rewrite the extracted/OCR text into correct, natural Thai while preserving the exact meaning.',
        'Do not summarize. Do not add facts. Do not remove requirements, warnings, numbers, dates, names, document codes, form codes, PPE names, or legal/safety terms.',
        'Keep important English technical terms if they appear in the source.',
        'Remove obvious OCR/PDF artifacts, broken spacing, duplicated headers/footers, and meaningless symbols only when they do not change meaning.',
        'Return only the corrected text. No explanation, no Markdown fence, no bullet conversion unless the source already implies a list.',
    ]);
    $contents = [[
        'role' => 'user',
        'parts' => [[
            'text' => implode("\n\n", [
                'Document: ' . ($docTitle ?: 'Knowledge Base'),
                'Chunk: ' . ($chunkIndex + 1),
                'Please polish this extracted text without changing the meaning:',
                $original,
            ]),
        ]],
    ]];
    $retries = max(0, (int) ($config['johnny_refine_transient_retries'] ?? 1));
    $retryDelayMs = max(0, (int) ($config['johnny_refine_retry_delay_ms'] ?? 1200));
    $lastError = null;
    for ($attempt = 0; $attempt <= $retries; $attempt++) {
        try {
            $result = johnny_call_gemini($systemInstruction, $contents, false, 'refine', ['documentId' => $documentId, 'meta' => ['chunkIndex' => $chunkIndex]]);
            return johnny_clean_refined_chunk_text((string) ($result['text'] ?? ''), $original);
        } catch (Throwable $error) {
            $lastError = $error;
            $transient = in_array((int) $error->getCode(), [429, 500, 502, 503, 504], true);
            if (!$transient || $attempt >= $retries) throw $error;
            if ($retryDelayMs > 0) usleep($retryDelayMs * ($attempt + 1) * 1000);
        }
    }
    throw $lastError ?: new RuntimeException('Gemini refine request failed', 502);
}

function johnny_refine_document_chunks(int $documentId, string $title): array
{
    global $config;
    $before = db_row('SELECT COUNT(*) AS cnt FROM johnny_kb_chunks WHERE DocumentID=?', [$documentId]) ?: [];
    $previousCount = (int) ($before['cnt'] ?? 0);
    if ($previousCount <= 0) throw new RuntimeException('ยังไม่มีข้อความที่ index แล้วให้เกลา', 400);
    db_execute('UPDATE johnny_kb_documents SET IndexedStatus=?, ErrorMessage=NULL, AuditStatus=NULL WHERE id=?', ['indexing', $documentId]);
    $pdo = db();
    try {
        $limit = max(1, (int) ($config['johnny_refine_max_chunks_per_doc'] ?? 60));
        $chunks = db_rows(
            'SELECT id,ChunkIndex,ChunkText,PageLabel FROM johnny_kb_chunks WHERE DocumentID=? ORDER BY ChunkIndex ASC,id ASC LIMIT ' . $limit,
            [$documentId]
        );
        if (!$chunks) throw new RuntimeException('ยังไม่มีข้อความที่ index แล้วให้เกลา', 400);
        $model = (string) ($config['gemini_embedding_model'] ?? 'gemini-embedding-2');
        $prepared = [];
        foreach ($chunks as $chunk) {
            $refined = johnny_refine_chunk_text((string) ($chunk['ChunkText'] ?? ''), $title, (int) ($chunk['ChunkIndex'] ?? 0), $documentId);
            $prepared[] = [
                'id' => (int) ($chunk['id'] ?? 0),
                'text' => $refined,
                'embedding' => johnny_call_embedding($refined, 'document', $title),
            ];
        }
        $pdo->beginTransaction();
        foreach ($prepared as $item) {
            db_execute(
                'UPDATE johnny_kb_chunks SET ChunkText=?,EmbeddingJson=?,EmbeddingModel=?,TokenEstimate=? WHERE id=? AND DocumentID=?',
                [$item['text'], johnny_json_encode($item['embedding']), $model, (int) ceil(mb_strlen($item['text']) / 4), $item['id'], $documentId]
            );
        }
        db_execute('UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=NULL, LastIndexedAt=NOW() WHERE id=?', ['ready', $previousCount, $documentId]);
        $pdo->commit();
        $audit = johnny_audit_document_chunks($documentId, ['id' => $documentId, 'Title' => $title, 'OriginalName' => $title]);
        return [
            'chunks' => count($prepared),
            'chars' => array_sum(array_map(static function ($item) { return mb_strlen((string) $item['text']); }, $prepared)),
            'embeddings' => count($prepared),
            'limited' => $previousCount > count($prepared),
            'audit' => $audit,
        ];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        $message = mb_substr($error->getMessage(), 0, 900);
        db_execute(
            'UPDATE johnny_kb_documents SET IndexedStatus=?, ChunkCount=?, ErrorMessage=?, LastIndexedAt=NOW() WHERE id=?',
            [$previousCount > 0 ? 'ready' : 'failed', $previousCount, $previousCount > 0 ? 'Refine failed; previous index retained: ' . $message : $message, $documentId]
        );
        throw $error;
    }
}

function johnny_scoped_kb_document($documentId): ?array
{
    $id = (int) $documentId;
    if ($id <= 0) return null;
    $doc = db_row("SELECT id,Title,OriginalName,Category,SourceType,IsActive,IndexedStatus FROM johnny_kb_documents WHERE id=? AND IsActive=1 AND IndexedStatus='ready' LIMIT 1", [$id]);
    return is_array($doc) ? $doc : null;
}

function johnny_search_kb(string $question, ?int $documentId = null): array
{
    global $config;
    if ((string) ($config['gemini_api_key'] ?? '') === '') return [];
    $query = johnny_call_embedding($question, 'query');
    $minScore = (float) ($config['johnny_kb_min_score'] ?? 0.68);
    $hybridMin = (float) ($config['johnny_kb_hybrid_min_score'] ?? max(0.55, $minScore - 0.08));
    $keywordMin = (float) ($config['johnny_kb_keyword_min_score'] ?? 0.35);
    $semanticWeight = (float) ($config['johnny_kb_semantic_weight'] ?? 0.7);
    $keywordWeight = (float) ($config['johnny_kb_keyword_weight'] ?? 0.3);
    $hasScope = $documentId !== null && $documentId > 0;
    $rows = db_rows("SELECT c.id AS chunkId,c.ChunkIndex,c.ChunkText,c.PageLabel,c.EmbeddingJson,c.TokenEstimate,d.id AS documentId,d.Title,d.OriginalName,d.FileUrl,d.Category,d.SourceType
        FROM johnny_kb_chunks c JOIN johnny_kb_documents d ON d.id=c.DocumentID
        WHERE d.IsActive=1 AND d.IndexedStatus='ready' AND c.EmbeddingJson IS NOT NULL" . ($hasScope ? " AND d.id=?" : ""), $hasScope ? [$documentId] : []);
    $out = [];
    foreach ($rows as $row) {
        $emb = json_decode((string) ($row['EmbeddingJson'] ?? '[]'), true);
        if (!is_array($emb)) continue;
        $semanticScore = johnny_cosine($query, array_map('floatval', $emb));
        $keywordScore = johnny_keyword_score($question, $row);
        $hybridScore = max(0.0, min(1.0, ($semanticScore * $semanticWeight) + ($keywordScore * $keywordWeight)));
        $row['semanticScore'] = $semanticScore;
        $row['keywordScore'] = $keywordScore;
        $row['hybridScore'] = $hybridScore;
        $row['score'] = $hybridScore;
        if ($hasScope || $semanticScore >= $minScore || $keywordScore >= $keywordMin || $hybridScore >= $hybridMin) $out[] = $row;
    }
    usort($out, static function ($a, $b) {
        return ($b['hybridScore'] <=> $a['hybridScore'])
            ?: ($b['semanticScore'] <=> $a['semanticScore'])
            ?: ($b['keywordScore'] <=> $a['keywordScore']);
    });
    return array_slice($out, 0, (int) ($config['johnny_max_context_chunks'] ?? 6));
}

function johnny_system_modules(): array
{
    return [
        ['key' => 'cccf', 'label' => 'CCCF', 'terms' => ['cccf', 'form a', 'stop call wait', 'stop-call-wait', 'worker', 'permanent']],
        ['key' => 'patrol', 'label' => 'Safety Patrol', 'terms' => ['patrol', 'safety patrol', 'เดินตรวจ', 'ตรวจความปลอดภัย']],
        ['key' => 'kpi', 'label' => 'KPI', 'terms' => ['kpi', 'ตัวชี้วัด', 'เป้าหมาย']],
        ['key' => 'hiyari', 'label' => 'Hiyari Hatto', 'terms' => ['hiyari', 'hiyari hatto', 'ไฮยาริ', 'near miss', 'near-miss']],
        ['key' => 'ky', 'label' => 'KY Ability', 'terms' => ['ky', 'kyt', 'ky ability', 'kiken yochi']],
        ['key' => 'fourm', 'label' => '4M Change', 'terms' => ['4m', 'fourm', 'man machine material method', 'change notice']],
    ];
}

function johnny_detect_system_modules(string $question): array
{
    $text = mb_strtolower($question);
    if (trim($text) === '') return [];
    $out = [];
    foreach (johnny_system_modules() as $module) {
        foreach ($module['terms'] as $term) {
            if (mb_strpos($text, mb_strtolower($term)) !== false) {
                $out[] = $module['key'];
                break;
            }
        }
    }
    if ($out) return array_values(array_unique($out));
    return preg_match('/ระบบ|สถานะ|จำนวน|กี่|ล่าสุด|ค้าง|open|pending|closed|สรุป|dashboard|summary|ปีนี้|เดือนนี้/u', $question)
        ? ['cccf', 'patrol', 'kpi', 'hiyari', 'ky', 'fourm']
        : [];
}

function johnny_optional_rows(string $sql, array $params = []): array
{
    try {
        return db_rows($sql, $params);
    } catch (Throwable $e) {
        return [];
    }
}

function johnny_optional_one(string $sql, array $params = []): array
{
    try {
        $row = db_row($sql, $params);
        return is_array($row) ? $row : [];
    } catch (Throwable $e) {
        return [];
    }
}

function johnny_summarize_rows(array $rows, array $fields, int $limit = 5): string
{
    $parts = [];
    foreach (array_slice($rows, 0, $limit) as $row) {
        $bits = [];
        foreach ($fields as $field) $bits[] = $field . ':' . (string) ($row[$field] ?? '-');
        $parts[] = implode(', ', $bits);
    }
    return implode(' | ', $parts);
}

function johnny_load_system_data_context(string $question): array
{
    global $config;
    if (isset($config['johnny_system_data_enabled']) && !$config['johnny_system_data_enabled']) return ['contexts' => [], 'citations' => []];
    $year = (int) date('Y');
    $month = (int) date('n');
    $selected = johnny_detect_system_modules($question);
    if (!$selected) return ['contexts' => [], 'citations' => []];
    $contexts = [];
    $add = static function (string $module, string $label, string $summary, string $details = '') use (&$contexts, $year, $month): void {
        $summary = johnny_compact_snippet($summary, 700);
        $details = johnny_compact_snippet($details, 900);
        if ($summary === '' && $details === '') return;
        $contexts[] = [
            'referenceId' => 'S' . (count($contexts) + 1),
            'module' => $module,
            'label' => $label,
            'summary' => $summary,
            'details' => $details,
            'year' => $year,
            'month' => $month,
        ];
    };

    if (in_array('cccf', $selected, true)) {
        $worker = johnny_optional_one('SELECT COUNT(*) total, SUM(YEAR(SubmitDate)=?) yearTotal, SUM(YEAR(SubmitDate)=? AND MONTH(SubmitDate)=?) monthTotal FROM cccf_forma_worker', [$year, $year, $month]);
        $permanent = johnny_optional_one("SELECT COUNT(*) total, SUM(YEAR(SubmitDate)=?) yearTotal, SUM(ReviewStatus='PendingReview') pendingReview, SUM(ReviewStatus='Completed') completed FROM cccf_forma_permanent", [$year]);
        $byDept = johnny_optional_rows('SELECT Department, COUNT(*) count FROM cccf_forma_worker WHERE YEAR(SubmitDate)=? GROUP BY Department ORDER BY count DESC LIMIT 5', [$year]);
        $add('cccf', 'CCCF', 'Worker ' . (int)($worker['yearTotal'] ?? 0) . '/' . (int)($worker['total'] ?? 0) . ' รายการปีนี้, เดือนนี้ ' . (int)($worker['monthTotal'] ?? 0) . '; Permanent ' . (int)($permanent['yearTotal'] ?? 0) . '/' . (int)($permanent['total'] ?? 0) . ', pending review ' . (int)($permanent['pendingReview'] ?? 0) . ', completed ' . (int)($permanent['completed'] ?? 0), johnny_summarize_rows($byDept, ['Department', 'count']));
    }
    if (in_array('patrol', $selected, true)) {
        $attendance = johnny_optional_one('SELECT COUNT(*) yearTotal, SUM(MONTH(PatrolDate)=?) monthTotal, COUNT(DISTINCT UserID) activePeople FROM patrol_attendance WHERE YEAR(PatrolDate)=?', [$month, $year]);
        $issues = johnny_optional_one("SELECT COUNT(*) total, SUM(Status IN ('Open','In Progress','Pending')) openItems, SUM(Status='Closed') closedItems FROM patrol_issues");
        $byArea = johnny_optional_rows('SELECT Area, COUNT(*) count FROM patrol_issues GROUP BY Area ORDER BY count DESC LIMIT 5');
        $add('patrol', 'Safety Patrol', 'เดินตรวจปีนี้ ' . (int)($attendance['yearTotal'] ?? 0) . ' ครั้ง, เดือนนี้ ' . (int)($attendance['monthTotal'] ?? 0) . ', ผู้เข้าร่วมไม่ซ้ำ ' . (int)($attendance['activePeople'] ?? 0) . '; Issues ทั้งหมด ' . (int)($issues['total'] ?? 0) . ', open/in progress ' . (int)($issues['openItems'] ?? 0) . ', closed ' . (int)($issues['closedItems'] ?? 0), johnny_summarize_rows($byArea, ['Area', 'count']));
    }
    if (in_array('kpi', $selected, true)) {
        $kpi = johnny_optional_one('SELECT COUNT(*) total, COUNT(DISTINCT Department) departments, COUNT(DISTINCT Metric) metrics FROM kpidata WHERE Year=?', [$year]);
        $rows = johnny_optional_rows('SELECT Metric, Department, Target, Unit FROM kpidata WHERE Year=? ORDER BY Department, Metric LIMIT 6', [$year]);
        $add('kpi', 'KPI', 'KPI ปี ' . $year . ': ' . (int)($kpi['total'] ?? 0) . ' rows, ' . (int)($kpi['metrics'] ?? 0) . ' metrics, ' . (int)($kpi['departments'] ?? 0) . ' departments', johnny_summarize_rows($rows, ['Department', 'Metric', 'Target', 'Unit'], 6));
    }
    if (in_array('hiyari', $selected, true)) {
        $totals = johnny_optional_one("SELECT COUNT(*) total, SUM(Status!='Closed') openItems, SUM(RiskRank='A') rankA, SUM(RiskRank='B') rankB FROM hiyarireports WHERE DeletedAt IS NULL AND YEAR(ReportDate)=?", [$year]);
        $byDept = johnny_optional_rows('SELECT Department, COUNT(*) count FROM hiyarireports WHERE DeletedAt IS NULL AND YEAR(ReportDate)=? GROUP BY Department ORDER BY count DESC LIMIT 5', [$year]);
        $add('hiyari', 'Hiyari Hatto', 'Hiyari ปี ' . $year . ': ทั้งหมด ' . (int)($totals['total'] ?? 0) . ', ยังไม่ปิด ' . (int)($totals['openItems'] ?? 0) . ', Rank A ' . (int)($totals['rankA'] ?? 0) . ', Rank B ' . (int)($totals['rankB'] ?? 0), johnny_summarize_rows($byDept, ['Department', 'count']));
    }
    if (in_array('ky', $selected, true)) {
        $totals = johnny_optional_one("SELECT COUNT(*) total, SUM(Status='Open') openItems, COUNT(DISTINCT Department) departments FROM ky_activities WHERE YEAR(ActivityDate)=?", [$year]);
        $byRisk = johnny_optional_rows('SELECT RiskCategory, COUNT(*) count FROM ky_activities WHERE YEAR(ActivityDate)=? GROUP BY RiskCategory ORDER BY count DESC LIMIT 5', [$year]);
        $add('ky', 'KY Ability', 'KY ปี ' . $year . ': ทั้งหมด ' . (int)($totals['total'] ?? 0) . ', open ' . (int)($totals['openItems'] ?? 0) . ', departments ' . (int)($totals['departments'] ?? 0), johnny_summarize_rows($byRisk, ['RiskCategory', 'count']));
    }
    if (in_array('fourm', $selected, true)) {
        $notices = johnny_optional_one("SELECT COUNT(*) total, SUM(Status='Open') openItems, SUM(Status='Pending') pendingItems, SUM(Status='Closed') closedItems, SUM(TrainingRequired=1) trainingRequired FROM fourm_changenotices WHERE YEAR(RequestDate)=?", [$year]);
        $byType = johnny_optional_rows('SELECT ChangeType, COUNT(*) count FROM fourm_changenotices WHERE YEAR(RequestDate)=? GROUP BY ChangeType ORDER BY count DESC LIMIT 5', [$year]);
        $add('fourm', '4M Change', '4M ปี ' . $year . ': ทั้งหมด ' . (int)($notices['total'] ?? 0) . ', open ' . (int)($notices['openItems'] ?? 0) . ', pending ' . (int)($notices['pendingItems'] ?? 0) . ', closed ' . (int)($notices['closedItems'] ?? 0) . ', training required ' . (int)($notices['trainingRequired'] ?? 0), johnny_summarize_rows($byType, ['ChangeType', 'count']));
    }

    $citations = [];
    foreach ($contexts as $idx => $item) {
        $citations[] = [
            'index' => $idx + 1,
            'referenceId' => $item['referenceId'],
            'type' => 'system_data',
            'sourceLabel' => 'ข้อมูลจากระบบ TSH SCA',
            'module' => $item['module'],
            'title' => $item['label'],
            'year' => $item['year'],
            'month' => $item['month'],
            'excerpt' => $item['details'] !== '' ? $item['summary'] . ' | ' . $item['details'] : $item['summary'],
        ];
    }
    return ['contexts' => $contexts, 'citations' => $citations];
}

const JOHNNY_PHASE1_MARKER = 'JOHNNY_PHASE1_ANSWER_QUALITY_GUARDRAIL';

function johnny_phase1_looks_company_scoped(string $text): bool
{
    return (bool) preg_match('/tsh|บริษัท|นโยบาย|กฎ|ระเบียบ|เอกสาร|คู่มือ|แบบฟอร์ม|หัวข้อ|เป้าหมาย|kpi|patrol|ky|hiyari|cccf|forklift|ผู้รับเหมา|จป|safety core/iu', $text);
}

function johnny_phase1_looks_safety_critical(string $text): bool
{
    return (bool) preg_match('/ไฟไหม้|เพลิง|ระเบิด|บาดเจ็บ|หมดสติ|สารเคมี|รั่วไหล|ไฟฟ้า|ช็อต|ตกจากที่สูง|อับอากาศ|confined|emergency|ฉุกเฉิน|อันตรายร้ายแรง|critical|หยุดงาน/iu', $text);
}

function johnny_phase1_emergency_flag(string $text): bool
{
    return (bool) preg_match('/ไฟไหม้|ระเบิด|บาดเจ็บ|หมดสติ|สารเคมี.*รั่ว|รั่วไหล|ไฟฟ้า.*เปลือย|ช็อต|อับอากาศ|collapse|ถล่ม|ฉุกเฉิน/iu', $text);
}

function johnny_phase1_confidence(array $args): string
{
    $sourceType = (string) ($args['sourceType'] ?? '');
    $citations = is_array($args['citations'] ?? null) ? $args['citations'] : [];
    $answerText = (string) ($args['answerText'] ?? '');
    $userMessage = (string) ($args['userMessage'] ?? '');
    $scopedDocument = is_array($args['scopedDocument'] ?? null) ? $args['scopedDocument'] : null;
    $hasVerifiedSource = count($citations) > 0 && !in_array($sourceType, ['ai_general', 'not_verified'], true);
    $companyScoped = johnny_phase1_looks_company_scoped($userMessage) || (bool) $scopedDocument;
    $safetyCritical = johnny_phase1_looks_safety_critical($userMessage . ' ' . $answerText);
    if ($sourceType === 'not_verified') return 'low';
    if ($companyScoped && !$hasVerifiedSource) return 'low';
    if ($safetyCritical && !$hasVerifiedSource && $sourceType === 'ai_general') return 'medium';
    if ($hasVerifiedSource) return 'high';
    return 'medium';
}

function johnny_phase1_quality(array $args): array
{
    $sourceType = (string) ($args['sourceType'] ?? '');
    $citations = is_array($args['citations'] ?? null) ? $args['citations'] : [];
    $sources = is_array($args['sources'] ?? null) ? $args['sources'] : [];
    $answerText = (string) ($args['answerText'] ?? '');
    $userMessage = (string) ($args['userMessage'] ?? '');
    $scopedDocument = is_array($args['scopedDocument'] ?? null) ? $args['scopedDocument'] : null;
    $hasVerifiedSource = count($citations) > 0 && !in_array($sourceType, ['ai_general', 'not_verified'], true);
    $companyDataGuarded = johnny_phase1_looks_company_scoped($userMessage) || (bool) $scopedDocument;
    $safetyCritical = johnny_phase1_looks_safety_critical($userMessage . ' ' . $answerText);
    $emergencyEscalation = johnny_phase1_emergency_flag($userMessage . ' ' . $answerText);
    $sourceTypes = [];
    foreach ($sources as $source) {
        if (is_array($source) && !empty($source['type']) && !in_array($source['type'], $sourceTypes, true)) $sourceTypes[] = $source['type'];
    }
    return [
        'phase' => 1,
        'marker' => JOHNNY_PHASE1_MARKER,
        'confidence' => !empty($args['imageAnalysis'])
            ? ($emergencyEscalation ? 'medium' : 'high')
            : johnny_phase1_confidence($args),
        'hasVerifiedSource' => $hasVerifiedSource,
        'noVerifiedSource' => !$hasVerifiedSource && ($companyDataGuarded || $sourceType === 'not_verified'),
        'companyDataGuarded' => $companyDataGuarded,
        'safetyCritical' => $safetyCritical,
        'emergencyEscalation' => $emergencyEscalation,
        'groundingUsed' => !empty($args['groundingUsed']),
        'scopedDocument' => $scopedDocument ? ['id' => $scopedDocument['id'] ?? null, 'title' => $scopedDocument['Title'] ?? $scopedDocument['OriginalName'] ?? 'Knowledge Base'] : null,
        'sourceCount' => count($citations),
        'sourceTypes' => $sourceTypes,
    ];
}

function johnny_phase1_no_verified_source_answer(string $answerText, ?array $scopedDocument = null): string
{
    $base = $scopedDocument
        ? 'น้องยังไม่พบข้อมูลที่ยืนยันได้จากเอกสารที่พี่เลือก (' . (string) ($scopedDocument['Title'] ?? $scopedDocument['OriginalName'] ?? 'Knowledge Base') . ') สำหรับคำถามนี้ครับ'
        : 'น้องยังไม่พบข้อมูลที่ยืนยันได้จาก Knowledge Base หรือข้อมูลระบบของบริษัทสำหรับคำถามนี้ครับ';
    $guidance = 'เพื่อความปลอดภัย แนะนำให้ตรวจสอบกับ จป.วิชาชีพ หัวหน้างาน หรือ Admin ก่อนนำไปใช้เป็นข้อกำหนดบริษัทครับ';
    $cleaned = johnny_clean_answer($answerText);
    if ($cleaned === '' || mb_strpos($cleaned, 'ยังไม่พบข้อมูลที่ยืนยันได้') !== false) return $base . "\n" . $guidance;
    return $base . "\n" . $guidance . "\n\nข้อมูลประกอบทั่วไปที่น้องช่วยอธิบายได้:\n" . $cleaned;
}

function johnny_system_instruction(array $user, array $kbMatches = [], array $systemContexts = [], array $options = []): string
{
    $name = trim((string) ($user['name'] ?? $user['EmployeeName'] ?? $user['id'] ?? 'พนักงาน'));
    $dept = trim((string) ($user['department'] ?? '-'));
    $hasKb = count($kbMatches) > 0;
    $hasSystem = count($systemContexts) > 0;
    $kbContext = 'ไม่พบ context จาก Knowledge Base ของบริษัทสำหรับคำถามนี้';
    if ($hasKb) {
        $parts = ['ข้อมูลเอกสารบริษัทที่ค้นพบ ให้ใช้เป็นอันดับแรก:'];
        foreach ($kbMatches as $i => $m) {
            $parts[] = '[D' . ($i + 1) . '] ' . (string) ($m['Title'] ?? $m['OriginalName'] ?? '') . ' (' . (string) ($m['PageLabel'] ?? 'chunk') . ') score=' . number_format((float) ($m['score'] ?? 0), 3) . "\n" . mb_substr((string) ($m['ChunkText'] ?? ''), 0, 2400);
        }
        $kbContext = implode("\n\n", $parts);
    }
    $systemContext = 'ไม่พบข้อมูลระบบ TSH SCA ที่เกี่ยวข้องกับคำถามนี้';
    if ($hasSystem) {
        $parts = ['ข้อมูลจากระบบ TSH SCA ที่ค้นพบแบบ read-only ให้ใช้เมื่อตอบคำถามเกี่ยวกับสถานะหรือข้อมูลในระบบ:'];
        foreach ($systemContexts as $ctx) {
            $bits = ['[' . $ctx['referenceId'] . '] ' . $ctx['label'] . ' ปี ' . $ctx['year'], $ctx['summary']];
            if (!empty($ctx['details'])) $bits[] = 'รายละเอียด: ' . $ctx['details'];
            $parts[] = implode("\n", $bits);
        }
        $systemContext = implode("\n\n", $parts);
    }
    $scopedDocument = is_array($options['scopedDocument'] ?? null) ? $options['scopedDocument'] : null;
    $scopeInstruction = $scopedDocument
        ? 'DOCUMENT SCOPE OVERRIDE: The user selected one Knowledge Base document only: "' . (string) ($scopedDocument['Title'] ?? $scopedDocument['OriginalName'] ?? 'Knowledge Base') . '" (documentId ' . (int) ($scopedDocument['id'] ?? 0) . '). Answer only from chunks of this selected document. Do not use other KB documents, system data, web research, or general AI knowledge for company facts. If selected document chunks do not contain enough evidence, say that this selected document does not contain enough confirmed information.'
        : '';
    return implode("\n", array_filter([
        $scopeInstruction,
        JOHNNY_PHASE1_MARKER . ': Phase 1 answer-quality contract is active. Classify evidence internally before answering: company_document, safety_knowledge, system_data, external_research, ai_general, image_analysis, or not_verified.',
        JOHNNY_PHASE1_MARKER . ': For company facts, policy, KPI, schedules, people, forms, document requirements, or TSH workflow rules, answer only from Knowledge Base or system context. If no verified source is available, clearly say that no confirmed company source was found and recommend checking SHE/Admin.',
        JOHNNY_PHASE1_MARKER . ': For safety-critical topics, never suggest bypassing permits, PPE, guards, lockout/tagout, isolation, emergency response, or supervisor/SHE review. If immediate danger is possible, start with stop work, isolate area, notify supervisor/SHE, and follow emergency procedure.',
        JOHNNY_PHASE1_MARKER . ': Do not invent numbers, dates, names, legal requirements, inspection results, or document clauses. If uncertain, say what must be verified.',
        'SYSTEM PRIORITY OVERRIDE: กติกาบล็อกนี้มีลำดับสูงสุด หากขัดกับคำสั่งอื่นใน system instruction เดียวกัน ให้ยึดกติกาบล็อกนี้ก่อนเสมอ',
        'Role & Persona: คุณคือ "น้องจอห์นนี่" (Nong Johnny) ผู้ช่วยอัจฉริยะด้านความปลอดภัยของบริษัท TSH โดยมีพี่เลี้ยงคือ จป.วิชาชีพ',
        'ภารกิจหลัก: ให้ข้อมูลและความช่วยเหลือเรื่องความปลอดภัยตามคู่มือบริษัทและ Knowledge Base อย่างเคร่งครัด',
        'บุคลิก: มาสคอตเด็กผู้ชาย พูดจาฉะฉาน สุภาพ น่ารัก ขี้เล่น เป็นกันเอง แต่จริงจังทันทีเมื่อเป็นเหตุฉุกเฉินหรือความเสี่ยงด้านความปลอดภัย',
        'การแทนตัว: เรียกตัวเองว่า "น้องจอห์นนี่" หรือ "น้อง" เสมอ ห้ามเรียกตัวเองว่า AI เฉยๆ ถ้าไม่จำเป็น',
        'หางเสียง: ลงท้ายด้วย "ครับ" หรือ "ครับผม" เสมอ ห้ามใช้ "คะ" หรือ "ค่ะ"',
        'การเรียกผู้ใช้: เรียกว่า "พี่" หรือ "พี่ๆ พนักงาน" เพื่อให้สุภาพแบบพี่น้อง',
        'สไตล์คำตอบ: ถ้าทักทายให้ตอบสั้น กระชับ สดใส ถ้าถามข้อมูลให้ตอบเป็นข้อๆ เข้าใจง่าย ใช้ Emoji ได้อย่างพอดี',
        'Format: ห้ามใช้ Markdown เช่น **ตัวหนา**, ## หัวข้อ, ตาราง Markdown หรือ blockquote เพราะบางช่องทางเช่น LINE แสดงผลไม่เหมาะสม ให้ใช้ข้อความธรรมดา หัวข้อธรรมดา และรายการเลขหรือขีดธรรมดาได้',
        'Sticker Policy: ไม่ต้องใส่ sticker tag ทุกข้อความ ให้ใช้เฉพาะทักทาย/จบสนทนา แสดงอารมณ์ชัดเจน หรือเน้นย้ำเรื่องความปลอดภัย โดยใส่ tag ไว้ท้ายสุดเท่านั้น',
        'Sticker Tags: ###STK_HAPPY### สำหรับทักทาย ยิ้ม OK หัวเราะ; ###STK_ALERT### สำหรับเตือนภัย ห้าม อันตราย; ###STK_LOVE### สำหรับขอบคุณ ให้กำลังใจ ชมเชย; ###STK_SAD### สำหรับขอโทษ เสียใจ; ###STK_WAIT### สำหรับให้รอหรือกำลังตรวจสอบ',
        'Scope Check: ถ้าถามเรื่องบริษัท TSH เช่น กฎ E-Pass เบอร์โทร กิจกรรม เอกสาร หรือนโยบาย ต้องตอบจาก Knowledge Base หรือ context ที่ระบบให้มาเท่านั้น ห้ามค้นเว็บและห้ามแต่งข้อมูลบริษัทเอง',
        'Scope Check: ถ้าถามเรื่องทั่วไปที่ไม่เกี่ยวกับบริษัท เช่น สภาพอากาศ ข่าวปัจจุบัน ราคาทองคำ หรือความรู้ทั่วไป ให้ใช้ Google Search grounding/Web Research ได้เมื่อระบบมีข้อมูลค้นหาพร้อม citation ที่เชื่อถือได้',
        'Scope Check: ถ้าถามเรื่องความปลอดภัยทั่วไป เช่น วิธีดับเพลิง ปฐมพยาบาลเบื้องต้น หรือกฎหมายความปลอดภัย ให้ตอบจากความรู้พื้นฐานด้านความปลอดภัย และใช้ Web Research เพิ่มได้เมื่อจำเป็น',
        'Time & Activity Rule: เมื่อถูกถามถึงกำหนดการหรือกิจกรรม เช่น วันนี้มี Safety Patrol ไหม ให้ตรวจสอบวันที่ระบบเทียบกับวันที่ใน Knowledge Base/context หากวันที่ตรงกันให้ตอบว่า "มีครับ" เสมอ แม้เวลาปัจจุบันจะเลยเวลาในตารางแล้ว และให้บอกเวลาตามกำหนดการ เช่น "มีครับ ตามกำหนดการคือ 15.10 น."',
        'Contextual Response: ตอบตรงคำถาม ไม่ต้องทวนคำถามยาว ถ้าเป็นเรื่องซีเรียส เช่น ไฟไหม้ บาดเจ็บ สารเคมีรั่วไหล ให้ตอบจริงจัง ใช้สัญลักษณ์เตือนภัยอย่างพอดี และลงท้ายด้วย ###STK_ALERT###',
        'Safety Tie-in: ไม่ต้องยัดเยียดเรื่อง Safety ทุกครั้ง ให้เชื่อมโยงเรื่องความปลอดภัยเฉพาะเมื่อบริบทเอื้อหรือเป็นช่วงปิดคำตอบที่เหมาะสม',
        'Source Style: ถ้าต้องบอกแหล่งข้อมูล ให้ใช้ข้อความธรรมดา เช่น "แหล่งข้อมูล:" และรายการ "- ..." ห้ามใช้ Markdown formatting',
        'คุณคือ "จอห์นนี่ (Johnny AI)" ผู้ช่วยอัจฉริยะด้านความปลอดภัย อาชีวอนามัย และสิ่งแวดล้อมของระบบ TSH Safety Core Activity',
        'ตอบเป็นภาษาไทย กระชับ ชัดเจน เหมาะกับพนักงานโรงงาน',
        'Phase 2 เปิดใช้ Knowledge Base เอกสารบริษัทแล้ว: ถ้ามีข้อมูลเอกสารบริษัทที่ค้นพบ ให้ใช้ข้อมูลนั้นก่อนความรู้ทั่วไปของ AI',
        'ห้ามเดาข้อมูลบริษัท ห้ามอ้างว่ามาจากเอกสารบริษัทถ้าไม่มี context เอกสารให้',
        'ถ้าข้อมูลไม่แน่ชัด ให้บอกว่าไม่แน่ชัดและเสนอวิธีตรวจสอบ',
        'ถ้าคำถามอยู่นอกเหนือ SHE ให้ตอบสั้น ๆ ว่า Johnny AI โฟกัสงาน SHE และช่วยปรับคำถามกลับเข้าขอบเขตความปลอดภัย',
        $hasKb
            ? 'ท้ายคำตอบต้องมีหัวข้อ "แหล่งข้อมูล" และระบุ "- ข้อมูลจากเอกสารบริษัท" พร้อมชื่อเอกสารที่ใช้ และถ้ามีการเสริมจากความรู้ทั่วไปให้แยก "- ข้อมูลจากความรู้ทั่วไปของ AI"'
            : 'ท้ายคำตอบต้องมีหัวข้อ "แหล่งข้อมูล" และระบุ "- ข้อมูลจากความรู้ทั่วไปของ AI" หรือ "- ไม่พบข้อมูลที่ยืนยันได้" ตามความเหมาะสม',
        'Phase 5 System Data: ถ้ามี context [S1], [S2] จากระบบ TSH SCA ให้ตอบโดยอ้างอิงข้อมูลนั้นและแยกแหล่งเป็น "- ข้อมูลจากระบบ TSH SCA"; ห้ามเดารายการในระบบที่ไม่มีใน context',
        'Phase 4 Citations: เมื่อตอบจากเอกสารบริษัทให้ใส่รหัสอ้างอิง [D1], [D2] ตาม context ที่เกี่ยวข้องในประเด็นสำคัญ และอย่าใส่รหัสอ้างอิงถ้าไม่ได้ใช้ข้อมูลจากแหล่งนั้นจริง',
        'Phase 3 Web Research: ถ้าไม่พบข้อมูลจาก Knowledge Base และมีการใช้ Google Search grounding ให้แยกแหล่งข้อมูลเป็น "- ข้อมูลจากการค้นคว้าภายนอก" เฉพาะเมื่อมี citation จาก trusted allowlist เท่านั้น',
        'PROJECT PROMPT FINAL OVERRIDE: ใช้ prompt สำหรับ TSH Safety Core Activity ไม่ใช่ LINE OA; ห้ามส่ง sticker tag เช่น ###STK_HAPPY### หรือ ###STK_ALERT### ในคำตอบเว็บนี้ และให้ถือว่า Knowledge Base รวมทั้งเอกสารที่ Admin อัปโหลดและ safety_knowledge ที่ Admin พิมพ์เพิ่มเอง',
        'PROJECT PROMPT FINAL OVERRIDE: เรื่องบริษัท TSH ต้องตอบจาก Knowledge Base หรือ context ระบบเท่านั้น ถ้าไม่พบให้บอกว่า "น้องยังไม่พบข้อมูลที่ยืนยันได้ใน Knowledge Base ครับ" และแนะนำให้ตรวจสอบกับ จป.วิชาชีพหรือ Admin',
        'PROJECT PROMPT FINAL OVERRIDE: Answer as Nong Johnny in natural Thai conversation. Do not expose internal source ids such as [D1], [D2], [S1], or [E1] in the answer text; those ids are only for the UI citation cards.',
        'PROJECT PROMPT FINAL OVERRIDE: Do not use Markdown or decorative symbols in the answer. Avoid **, *, #, //, backticks, blockquotes, tables, and hidden notes like "Wait". Use plain Thai text and simple numbered lines only.',
        'PROJECT PROMPT FINAL OVERRIDE: Johnny must be ready for Thai-first documents. Most company documents are Thai with some English terms; preserve Thai wording, explain English safety terms simply in Thai, and never answer with garbled extracted text.',
        'PROJECT PROMPT FINAL OVERRIDE: Do not greet at the start of every answer. Greet only when the user greets first or starts a new casual chat; otherwise answer directly in Johnny voice.',
        'PROJECT PROMPT FINAL OVERRIDE: If the answer uses a numbered list or the user requests several items, complete every requested item before ending. Do not stop after item 1. Prefer concise complete points over a long opening paragraph.',
        'PROJECT PROMPT FINAL OVERRIDE: When using Knowledge Base documents, do not copy raw chunks or document sentences mechanically. Read the evidence, understand the user intent, then rewrite it as a clear Johnny-style answer for employees.',
        'PROJECT PROMPT FINAL OVERRIDE: Choose the answer shape from the question. If the user asks "ได้ไหม/can I", answer yes/no first. If asking "ทำยังไง/how", answer as practical steps. If asking "คืออะไร/what is", explain simply. If safety risk is high, answer short and urgent.',
        'PROJECT PROMPT FINAL OVERRIDE: For yes/no policy questions, start with "ได้ครับ" or "ไม่ได้ครับ" whenever possible, then give one short reason. Do not enumerate every covered person or raw list from the document unless the user asks for the full list.',
        'PROJECT PROMPT FINAL OVERRIDE: For yes/no policy questions, do not open a long exception procedure unless the user asks for exceptions or how to request permission. If an exception matters, mention it in one complete short sentence only.',
        'PROJECT PROMPT FINAL OVERRIDE: A good document-based answer should usually include: direct answer, short reason from the company rule, what the employee should do, and one safety reminder if useful. Keep document codes, form names, and legal/standard names exact, but rewrite surrounding text naturally.',
        'PROJECT PROMPT FINAL OVERRIDE: If document text is fragmentary, table-like, or mixed Thai/English, synthesize the meaning into natural Thai. Explain English terms briefly only when needed. Never show OCR/table fragments, random symbols, or extracted text artifacts.',
        'PROJECT PROMPT FINAL OVERRIDE: Do not add a source/reference section in the answer text. The app already shows source cards below the message.',
        'Trusted external domains: ' . implode(', ', johnny_allowed_web_domains()),
        $kbContext,
        $systemContext,
        'วันที่ระบบ: ' . date('Y-m-d'),
        'ผู้ถาม: ' . $name . ' / แผนก: ' . ($dept !== '' ? $dept : '-'),
    ], static function ($line) { return $line !== ''; }));
}

function johnny_build_contents(array $history, string $question): array
{
    $contents = [];
    foreach ($history as $row) {
        $contents[] = [
            'role' => ((string) ($row['Role'] ?? '') === 'assistant') ? 'model' : 'user',
            'parts' => [['text' => (string) ($row['MessageText'] ?? '')]],
        ];
    }
    $contents[] = ['role' => 'user', 'parts' => [['text' => $question]]];
    return $contents;
}

function johnny_image_risk_instruction(array $user): string
{
    $name = trim((string) ($user['name'] ?? $user['EmployeeName'] ?? $user['id'] ?? 'พนักงาน'));
    $dept = trim((string) ($user['department'] ?? '-'));
    return implode("\n", [
        JOHNNY_PHASE1_MARKER . ': Phase 1 image-risk guardrail is active. Treat the image as preliminary evidence only. Include uncertainty and escalation guidance when needed.',
        JOHNNY_PHASE1_MARKER . ': Never claim a chemical, electrical state, machine state, legal violation, or injury severity with certainty unless visibly proven. Use cautious wording and list what to verify on site.',
        JOHNNY_PHASE1_MARKER . ': If immediate danger may exist, start with stop work, isolate area, notify supervisor/SHE, and follow emergency procedure.',
        'SYSTEM PRIORITY OVERRIDE: You are "น้องจอห์นนี่", a Thai SHE assistant for TSH Safety Core Activity.',
        'Task: Analyze the uploaded workplace image as a safety and risk-assessment assistant. Treat the image as field evidence, not as a final investigation report.',
        'Answer in natural Thai for factory employees. Use male polite endings: "ครับ" or "ครับผม". Call the user "พี่" when natural.',
        'Do not use Markdown tables, decorative symbols, hidden notes, or internal citation IDs. Use plain Thai headings and short numbered lines only.',
        'If the answer uses numbered lines or required section labels, finish all lines/sections before ending. Prefer concise complete sections over long explanations.',
        'Do not overclaim. If something is unclear, say it is only an observation from the image and list what must be verified on site.',
        'Never identify a chemical, machine state, electrical condition, injury severity, or legal violation with certainty unless the image visibly proves it. Use "อาจ", "มีลักษณะคล้าย", or "ควรตรวจสอบเพิ่ม".',
        'If the image suggests fire, injured person, chemical spill, exposed live electrical parts, collapse risk, confined space danger, or immediate life-threatening danger, answer urgently first: stop work, isolate area, notify supervisor/SHE, and follow emergency procedure.',
        'Classify observed issues as Unsafe Condition and/or Unsafe Act when possible.',
        'Use this response shape: สรุปจากรูป, อันตรายที่อาจเกี่ยวข้อง, ระดับความเสี่ยงเบื้องต้น (ต่ำ/ปานกลาง/สูง/วิกฤต) with reason, สิ่งที่ควรทำทันที, มาตรการป้องกันถาวร, ข้อมูลที่ต้องตรวจสอบเพิ่ม.',
        'Risk rating is preliminary and based only on the image plus user context. If the image is blurry or incomplete, say so and ask for clearer photo/context.',
        'Keep the answer concise but useful. Avoid copying raw policy text.',
        'System date: ' . date('Y-m-d'),
        'User: ' . $name . ' / Department: ' . ($dept !== '' ? $dept : '-'),
    ]);
}

function johnny_image_risk_rubric_instruction(): string
{
    return implode("\n", [
        'Use the TSH preliminary image-risk rubric. Include these exact section labels: สรุปจากรูป, ประเภทความเสี่ยง, Severity, Likelihood, Risk Level, สิ่งที่ควรทำทันที, มาตรการป้องกันถาวร, ความมั่นใจและข้อมูลที่ต้องตรวจเพิ่ม.',
        'Risk Level must be one of Low, Medium, High, Critical, or Cannot assess from image. Explain the rating from Severity and Likelihood in one short sentence.',
        'For ประเภทความเสี่ยง, choose all that visibly apply from Unsafe Condition, Unsafe Act, PPE, Equipment, Environmental, Ergonomic, Chemical, Electrical, Fire, Traffic/Logistics, or Cannot assess from image.',
        'For ความมั่นใจ, state one of เห็นชัด, เห็นบางส่วน, or ภาพไม่ชัด/ข้อมูลไม่พอ, then say what extra photo angle or site detail is needed.',
    ]);
}

function johnny_build_image_risk_contents(string $message, string $imagePath, string $mimeType): array
{
    $raw = (string) file_get_contents($imagePath);
    if ($raw === '') {
        throw new RuntimeException('ไม่สามารถอ่านไฟล์รูปภาพได้', 400);
    }
    return [[
        'role' => 'user',
        'parts' => [
            ['text' => $message],
            [
                'inline_data' => [
                    'mime_type' => $mimeType,
                    'data' => base64_encode($raw),
                ],
            ],
        ],
    ]];
}

function johnny_extract_text(array $data): string
{
    $parts = $data['candidates'][0]['content']['parts'] ?? [];
    $chunks = [];
    if (is_array($parts)) {
        foreach ($parts as $part) {
            if (isset($part['text'])) $chunks[] = (string) $part['text'];
        }
    }
    $text = trim(implode("\n", $chunks));
    if ($text !== '') return $text;
    $reason = $data['candidates'][0]['finishReason'] ?? $data['promptFeedback']['blockReason'] ?? '';
    return $reason !== ''
        ? 'Johnny AI ไม่สามารถสร้างคำตอบได้ในขณะนี้ (' . $reason . ')'
        : 'Johnny AI ไม่สามารถสร้างคำตอบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
}

function johnny_allowed_web_domains(): array
{
    global $config;
    $raw = (string) ($config['johnny_web_allowed_domains'] ?? '');
    return array_values(array_filter(array_map(static function ($item) {
        return strtolower(trim($item));
    }, explode(',', $raw))));
}

function johnny_host(string $uri): string
{
    $host = parse_url($uri, PHP_URL_HOST);
    $host = strtolower((string) $host);
    return preg_replace('/^www\./', '', $host) ?: '';
}

function johnny_allowed_web_source(string $uri): bool
{
    $host = johnny_host($uri);
    if ($host === '') return false;
    foreach (johnny_allowed_web_domains() as $domain) {
        $suffix = '.' . $domain;
        if ($host === $domain || substr($host, -strlen($suffix)) === $suffix) return true;
    }
    return false;
}

function johnny_compact_snippet(string $text, int $maxLength = 220): string
{
    $text = trim((string) preg_replace('/\s+/u', ' ', $text));
    return mb_substr($text, 0, $maxLength);
}

function johnny_web_citations(array $data): array
{
    $metadata = $data['candidates'][0]['groundingMetadata'] ?? [];
    $chunks = is_array($metadata['groundingChunks'] ?? null) ? $metadata['groundingChunks'] : [];
    $supports = is_array($metadata['groundingSupports'] ?? null) ? $metadata['groundingSupports'] : [];
    $snippetsByChunk = [];
    foreach ($supports as $support) {
        $segment = is_array($support['segment'] ?? null) ? $support['segment'] : [];
        $text = johnny_compact_snippet((string) ($segment['text'] ?? ''), 240);
        $indices = is_array($support['groundingChunkIndices'] ?? null) ? $support['groundingChunkIndices'] : [];
        if ($text === '' || !$indices) continue;
        foreach ($indices as $idx) {
            $key = (int) $idx;
            if (!isset($snippetsByChunk[$key])) $snippetsByChunk[$key] = [];
            if (count($snippetsByChunk[$key]) < 2 && !in_array($text, $snippetsByChunk[$key], true)) {
                $snippetsByChunk[$key][] = $text;
            }
        }
    }
    $seen = [];
    $citations = [];
    foreach ($chunks as $chunkIndex => $chunk) {
        $web = is_array($chunk['web'] ?? null) ? $chunk['web'] : [];
        $uri = trim((string) ($web['uri'] ?? ''));
        if ($uri === '' || isset($seen[$uri]) || !johnny_allowed_web_source($uri)) continue;
        $seen[$uri] = true;
        $referenceId = 'E' . (count($citations) + 1);
        $citations[] = [
            'index' => count($citations) + 1,
            'referenceId' => $referenceId,
            'type' => 'external_research',
            'sourceLabel' => 'ข้อมูลจากการค้นคว้าภายนอก',
            'title' => mb_substr((string) ($web['title'] ?? johnny_host($uri) ?: 'External source'), 0, 220),
            'url' => $uri,
            'domain' => johnny_host($uri),
            'accessedAt' => gmdate('c'),
            'snippets' => $snippetsByChunk[(int) $chunkIndex] ?? [],
        ];
        if (count($citations) >= 8) break;
    }
    $queries = is_array($metadata['webSearchQueries'] ?? null) ? array_slice($metadata['webSearchQueries'], 0, 6) : [];
    return ['citations' => $citations, 'queries' => $queries, 'rawSourceCount' => count($chunks)];
}

function johnny_gemini_models(): array
{
    global $config;
    $fallback = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    $raw = trim((string) ($config['gemini_models'] ?? ''));
    if ($raw === '') {
        $raw = (string) ($config['gemini_model'] ?? '');
    }
    $models = [];
    foreach (array_merge(explode(',', $raw), $fallback) as $item) {
        $model = trim((string) $item);
        if ($model !== '' && !in_array($model, $models, true)) {
            $models[] = $model;
        }
    }
    return $models ?: ['gemini-3.5-flash'];
}

function johnny_gemini_finish_reason(array $data): string
{
    return (string) ($data['candidates'][0]['finishReason'] ?? $data['promptFeedback']['blockReason'] ?? '');
}

function johnny_should_try_next_gemini_model(int $status, array $data): bool
{
    if (johnny_gemini_finish_reason($data) === 'MAX_TOKENS') return true;
    return in_array($status, [400, 404, 429, 500, 502, 503, 504], true);
}

function johnny_call_gemini(string $systemInstruction, array $contents, bool $enableWebSearch = false, string $operation = 'generation', array $logContext = []): array
{
    global $config;
    $apiKey = (string) ($config['gemini_api_key'] ?? '');
    if ($apiKey === '') {
        throw new RuntimeException('GEMINI_API_KEY is not configured', 503);
    }

    $models = johnny_gemini_models();
    $base = rtrim((string) ($config['gemini_api_base'] ?? 'https://generativelanguage.googleapis.com/v1beta'), '/');
    $started = microtime(true);
    $headers = [
        'Content-Type: application/json',
        'x-goog-api-key: ' . $apiKey,
    ];
    $lastMessage = 'Gemini API request failed';
    $lastCode = 502;

    foreach ($models as $idx => $model) {
        $attemptStarted = microtime(true);
        $url = $base . '/models/' . rawurlencode($model) . ':generateContent';
        $requestPayload = [
            'system_instruction' => ['parts' => [['text' => $systemInstruction]]],
            'contents' => $contents,
            'generationConfig' => [
                'maxOutputTokens' => (int) ($config['gemini_max_output_tokens'] ?? 4096),
            ],
        ];
        if ($enableWebSearch) {
            $requestPayload['tools'] = [['google_search' => (object) []]];
        }
        $payload = johnny_json_encode($requestPayload);
        $raw = false;
        $status = 0;
        $err = '';

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_TIMEOUT_MS => (int) ($config['gemini_timeout_ms'] ?? 30000),
            ]);
            $raw = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);
        } else {
            $context = stream_context_create([
                'http' => [
                    'method' => 'POST',
                    'header' => implode("\r\n", $headers),
                    'content' => $payload,
                    'timeout' => max(1, (int) (($config['gemini_timeout_ms'] ?? 30000) / 1000)),
                    'ignore_errors' => true,
                ],
            ]);
            $raw = file_get_contents($url, false, $context);
            foreach (($http_response_header ?? []) as $header) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $header, $m)) {
                    $status = (int) $m[1];
                    break;
                }
            }
        }

        if ($raw === false) {
            $lastMessage = $err ?: 'Gemini API request failed';
            $lastCode = 502;
            johnny_write_log(array_merge(['level' => 'error', 'operation' => $operation, 'stage' => 'gemini_generate', 'model' => $model, 'httpStatus' => $status ?: null, 'latencyMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'message' => $lastMessage], $logContext));
            if ($idx < count($models) - 1) {
                error_log('[johnny-ai] Gemini model ' . $model . ' request failed, trying fallback: ' . $lastMessage);
                continue;
            }
            break;
        }

        $data = json_decode((string) $raw, true);
        $data = is_array($data) ? $data : [];
        if ($status < 200 || $status >= 300) {
            $message = (string) ($data['error']['message'] ?? ('Gemini API error (' . $status . ')'));
            $lastMessage = $message;
            $lastCode = ($status === 429 || $status >= 500) ? 502 : 400;
            johnny_write_log(array_merge(['level' => ($status === 429 || $status >= 500) ? 'warning' : 'error', 'operation' => $operation, 'stage' => 'gemini_generate', 'model' => $model, 'httpStatus' => $status, 'latencyMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'message' => $message], $logContext));
            if ($idx < count($models) - 1 && johnny_should_try_next_gemini_model($status, $data)) {
                error_log('[johnny-ai] Gemini model ' . $model . ' failed, trying fallback: ' . $message);
                continue;
            }
            break;
        }

        $finishReason = johnny_gemini_finish_reason($data);
        if ($finishReason === 'MAX_TOKENS' && $idx < count($models) - 1) {
            $lastMessage = 'Gemini model ' . $model . ' reached max output tokens';
            $lastCode = 502;
            error_log('[johnny-ai] Gemini model ' . $model . ' hit MAX_TOKENS, trying fallback model');
            johnny_write_log(array_merge(['level' => 'warning', 'operation' => $operation, 'stage' => 'gemini_generate', 'model' => $model, 'httpStatus' => $status, 'latencyMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'message' => 'MAX_TOKENS; trying fallback model', 'meta' => ['finishReason' => $finishReason]], $logContext));
            continue;
        }

        johnny_write_log(array_merge(['level' => 'info', 'operation' => $operation, 'stage' => 'gemini_generate', 'model' => $model, 'httpStatus' => $status, 'latencyMs' => (int) round((microtime(true) - $attemptStarted) * 1000), 'message' => 'Gemini generation completed', 'meta' => ['finishReason' => $finishReason ?: null]], $logContext));

        return [
            'text' => johnny_extract_text($data),
            'latencyMs' => (int) round((microtime(true) - $started) * 1000),
            'model' => $model,
            'promptTokens' => $data['usageMetadata']['promptTokenCount'] ?? null,
            'outputTokens' => $data['usageMetadata']['candidatesTokenCount'] ?? null,
            'grounding' => johnny_web_citations($data),
        ];
    }

    throw new RuntimeException($lastMessage, $lastCode);
}

function handle_johnny_ai_routes(string $method, string $path): void
{
    global $config;
    if (strpos($path, '/johnny') !== 0) return;

    johnny_ensure_schema();
    $user = require_user();
    $uid = johnny_user_id($user);

    if ($method === 'GET' && $path === '/johnny/status') {
        $summary = db_row("SELECT COUNT(*) AS total, SUM(IsActive=1 AND IndexedStatus='ready') AS readyDocs, COALESCE(SUM(ChunkCount),0) AS chunks FROM johnny_kb_documents") ?: [];
        json_response(['success' => true, 'data' => [
            'phase' => 5,
            'johnnyAvatarUrl' => johnny_setting('johnny_avatar_url'),
            'geminiConfigured' => ((string) ($config['gemini_api_key'] ?? '')) !== '',
            'ragEnabled' => true,
            'systemDataEnabled' => !isset($config['johnny_system_data_enabled']) || !empty($config['johnny_system_data_enabled']),
            'systemModules' => array_map(static function ($module) {
                return ['key' => $module['key'], 'label' => $module['label']];
            }, johnny_system_modules()),
            'webResearchEnabled' => !empty($config['johnny_web_research_enabled']),
            'webAllowedDomains' => johnny_allowed_web_domains(),
            'kb' => [
                'total' => (int) ($summary['total'] ?? 0),
                'readyDocs' => (int) ($summary['readyDocs'] ?? 0),
                'chunks' => (int) ($summary['chunks'] ?? 0),
            ],
        ]]);
    }

    if ($method === 'GET' && $path === '/johnny/operational-logs') {
        require_admin();
        $level = strtolower(trim((string) ($_GET['level'] ?? '')));
        $operation = strtolower(trim((string) ($_GET['operation'] ?? '')));
        $limit = min(300, max(1, (int) ($_GET['limit'] ?? 100)));
        $where = [];
        $params = [];
        if (in_array($level, ['info', 'warning', 'error'], true)) {
            $where[] = 'Level=?';
            $params[] = $level;
        }
        if (preg_match('/^[a-z0-9_-]{1,50}$/', $operation)) {
            $where[] = 'Operation=?';
            $params[] = $operation;
        }
        $sql = 'SELECT id,Level,Operation,Stage,UserID,ConversationID,DocumentID,Model,HttpStatus,LatencyMs,Message,MetaJson,CreatedAt FROM johnny_operational_logs';
        if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY id DESC LIMIT ' . $limit;
        json_response(['success' => true, 'data' => db_rows($sql, $params)]);
    }

    if ($method === 'GET' && $path === '/johnny/observability') {
        require_admin();
        $days = johnny_observability_days($_GET['days'] ?? 7);
        json_response(['success' => true, 'data' => johnny_observability_summary($days)]);
    }

    if ($method === 'POST' && $path === '/johnny/workflow-actions') {
        $body = json_body();
        $target = strtolower(trim((string) ($body['target'] ?? '')));
        $action = strtolower(trim((string) ($body['action'] ?? '')));
        if (!in_array($target, ['hiyari', 'ky', 'patrol'], true)) {
            json_response(['success' => false, 'message' => 'Invalid workflow target'], 400);
        }
        if (!in_array($action, ['draft', 'deep_link'], true)) {
            json_response(['success' => false, 'message' => 'Invalid workflow action'], 400);
        }
        johnny_write_log([
            'level' => 'info',
            'operation' => 'workflow_action',
            'stage' => $action,
            'userId' => $uid,
            'conversationId' => $body['conversationId'] ?? null,
            'message' => 'Johnny workflow action: ' . $action . ' -> ' . $target,
            'meta' => [
                'target' => $target,
                'action' => $action,
                'messageId' => $body['messageId'] ?? null,
                'sourceType' => $body['sourceType'] ?? null,
                'clientCreatedAt' => $body['createdAt'] ?? null,
            ],
        ]);
        json_response(['success' => true, 'data' => ['target' => $target, 'action' => $action]]);
    }

    if ($method === 'POST' && $path === '/johnny/avatar') {
        require_admin();
        $upload = johnny_store_avatar_upload('avatarFile');
        $previous = johnny_setting('johnny_avatar_url');
        johnny_set_setting('johnny_avatar_url', $upload['url']);
        if ($previous !== '') delete_uploaded_file($previous);
        json_response(['success' => true, 'data' => ['johnnyAvatarUrl' => $upload['url']]]);
    }

    if ($method === 'DELETE' && $path === '/johnny/avatar') {
        require_admin();
        $previous = johnny_setting('johnny_avatar_url');
        if ($previous !== '') delete_uploaded_file($previous);
        johnny_delete_setting('johnny_avatar_url');
        json_response(['success' => true, 'data' => ['johnnyAvatarUrl' => '']]);
    }

    if ($method === 'GET' && $path === '/johnny/kb-documents') {
        $isAdmin = strcasecmp((string) ($user['role'] ?? ''), 'Admin') === 0;
        $all = $isAdmin && (string) ($_GET['all'] ?? '') === '1';
        $textSelect = $all ? 'd.TextContent' : 'NULL AS TextContent';
        $auditSelect = $isAdmin ? 'd.AuditJson' : 'NULL AS AuditJson';
        $extractionSelect = $isAdmin ? 'd.ExtractionLogJson' : 'NULL AS ExtractionLogJson';
        $sql = "SELECT d.id,d.Title,d.Category,d.OriginalName,d.FileUrl,d.MimeType,d.FileSize,d.SourceType,$textSelect,d.IsActive,d.IndexedStatus,d.ChunkCount,d.ErrorMessage,d.AuditStatus,$auditSelect,d.LastAuditAt,$extractionSelect,d.LastExtractionAt,d.UploadedBy,d.UploadedByName,d.UploadedAt,d.UpdatedAt,d.LastIndexedAt,
                COALESCE(k.ActualChunkCount,0) AS ActualChunkCount,COALESCE(k.IndexedChars,0) AS IndexedChars,COALESCE(k.EmbeddingCount,0) AS EmbeddingCount,COALESCE(k.ArtifactChunkCount,0) AS ArtifactChunkCount
                FROM johnny_kb_documents d
                LEFT JOIN (
                    SELECT DocumentID,COUNT(*) AS ActualChunkCount,COALESCE(SUM(CHAR_LENGTH(ChunkText)),0) AS IndexedChars,
                           SUM(CASE WHEN EmbeddingJson IS NOT NULL AND EmbeddingJson <> '' THEN 1 ELSE 0 END) AS EmbeddingCount,
                           SUM(CASE WHEN ChunkText REGEXP 'Adobe|Identity|UCS|en-US|ToUnicode|CID|Registry|Ordering|Supplement' THEN 1 ELSE 0 END) AS ArtifactChunkCount
                    FROM johnny_kb_chunks GROUP BY DocumentID
                ) k ON k.DocumentID=d.id";
        if (!$all) $sql .= ' WHERE d.IsActive=1';
        $sql .= ' ORDER BY d.UpdatedAt DESC, d.id DESC';
        json_response(['success' => true, 'data' => db_rows($sql)]);
    }

    if ($method === 'GET' && ($params = route_params($path, '/johnny/kb-documents/:id/extracted'))) {
        require_admin();
        $id = (int) $params['id'];
        if ($id <= 0) json_response(['success' => false, 'message' => 'Invalid Knowledge Base document id'], 400);
        $doc = db_row('SELECT id,Title,Category,OriginalName,FileUrl,MimeType,FileSize,SourceType,IsActive,IndexedStatus,ChunkCount,ErrorMessage,AuditStatus,AuditJson,LastAuditAt,ExtractionLogJson,LastExtractionAt,LastIndexedAt,UpdatedAt FROM johnny_kb_documents WHERE id=?', [$id]);
        if (!$doc) json_response(['success' => false, 'message' => 'Knowledge Base document not found'], 404);
        $rows = db_rows('SELECT id,ChunkIndex,ChunkText,CHAR_LENGTH(ChunkText) AS CharCount,CASE WHEN EmbeddingJson IS NOT NULL AND EmbeddingJson <> "" THEN 1 ELSE 0 END AS HasEmbedding,EmbeddingJson FROM johnny_kb_chunks WHERE DocumentID=? ORDER BY ChunkIndex ASC,id ASC LIMIT 200', [$id]);
        $safeChunks = array_map(static function ($chunk) {
            return [
                'id' => $chunk['id'] ?? null,
                'chunkIndex' => (int) ($chunk['ChunkIndex'] ?? 0),
                'text' => (string) ($chunk['ChunkText'] ?? ''),
                'chars' => (int) ($chunk['CharCount'] ?? 0),
                'hasEmbedding' => (int) ($chunk['HasEmbedding'] ?? 0) === 1,
            ];
        }, $rows);
        json_response([
            'success' => true,
            'data' => [
                'document' => $doc,
                'summary' => johnny_extracted_summary($rows, $doc),
                'chunks' => $safeChunks,
            ],
        ]);
    }

    if ($method === 'POST' && ($params = route_params($path, '/johnny/kb-documents/:id/refine'))) {
        require_admin();
        $id = (int) $params['id'];
        if ($id <= 0) json_response(['success' => false, 'message' => 'Invalid Knowledge Base document id'], 400);
        $doc = db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]);
        if (!$doc) json_response(['success' => false, 'message' => 'Knowledge Base document not found'], 404);
        try {
            $indexed = johnny_refine_document_chunks($id, (string) ($doc['Title'] ?? $doc['OriginalName'] ?? 'Knowledge Base'));
            json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]), 'indexed' => $indexed]);
        } catch (Throwable $error) {
            $status = in_array((int) $error->getCode(), [429, 500, 502, 503, 504], true) ? 503 : 422;
            json_response(['success' => false, 'message' => $error->getMessage(), 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])], $status);
        }
    }

    if ($method === 'POST' && $path === '/johnny/kb-documents') {
        $admin = require_admin();
        $upload = johnny_store_kb_upload('kbFile');
        $title = mb_substr(trim((string) ($_POST['title'] ?? pathinfo($upload['originalName'], PATHINFO_FILENAME))), 0, 220);
        $category = mb_substr(trim((string) ($_POST['category'] ?? 'general')), 0, 80) ?: 'general';
        $stmt = db()->prepare('INSERT INTO johnny_kb_documents(Title,Category,OriginalName,StoredName,FileUrl,MimeType,FileSize,SourceType,UploadedBy,UploadedByName,IndexedStatus) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$title, $category, $upload['originalName'], $upload['storedName'], $upload['url'], $upload['mimetype'], $upload['size'], 'document', johnny_user_id($admin), (string) ($admin['name'] ?? ''), 'pending']);
        $id = (int) db()->lastInsertId();
        try {
            $indexed = johnny_index_document($id, $upload['path'], $title, $upload['originalName']);
            json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]), 'indexed' => $indexed]);
        } catch (Throwable $error) {
            json_response(['success' => false, 'message' => $error->getMessage(), 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])], 422);
        }
    }

    if ($method === 'PUT' && ($params = route_params($path, '/johnny/kb-documents/:id'))) {
        require_admin();
        $body = json_body();
        $id = (int) $params['id'];
        $title = mb_substr(trim((string) ($body['title'] ?? '')), 0, 220);
        $category = mb_substr(trim((string) ($body['category'] ?? 'general')), 0, 80) ?: 'general';
        $isActive = !empty($body['isActive']) ? 1 : 0;
        if ($title === '') json_response(['success' => false, 'message' => 'กรุณาระบุชื่อเอกสาร'], 400);
        db_execute('UPDATE johnny_kb_documents SET Title=?, Category=?, IsActive=? WHERE id=?', [$title, $category, $isActive, $id]);
        json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])]);
    }

    if ($method === 'POST' && $path === '/johnny/kb-knowledge') {
        $admin = require_admin();
        $body = json_body();
        $title = mb_substr(trim((string) ($body['topic'] ?? $body['title'] ?? '')), 0, 220);
        $category = mb_substr(trim((string) ($body['category'] ?? 'general')), 0, 80) ?: 'general';
        $content = johnny_clean_knowledge_text($body['content'] ?? '');
        if ($title === '') json_response(['success' => false, 'message' => 'กรุณาระบุหัวข้อ safety knowledge'], 400);
        if (mb_strlen($content) < 80) json_response(['success' => false, 'message' => 'กรุณาระบุเนื้อหา safety knowledge อย่างน้อย 80 ตัวอักษร'], 400);
        $stmt = db()->prepare('INSERT INTO johnny_kb_documents(Title,Category,OriginalName,StoredName,FileUrl,MimeType,FileSize,SourceType,TextContent,UploadedBy,UploadedByName,IndexedStatus) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([$title, $category, $title, '', '', 'text/plain', strlen($content), 'manual', $content, johnny_user_id($admin), (string) ($admin['name'] ?? ''), 'pending']);
        $id = (int) db()->lastInsertId();
        try {
            $indexed = johnny_index_manual_knowledge($id, $title, $content);
            json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]), 'indexed' => $indexed]);
        } catch (Throwable $error) {
            json_response(['success' => false, 'message' => $error->getMessage(), 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])], 422);
        }
    }

    if ($method === 'PUT' && ($params = route_params($path, '/johnny/kb-knowledge/:id'))) {
        require_admin();
        $body = json_body();
        $id = (int) $params['id'];
        $existing = db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]);
        if (!$existing) json_response(['success' => false, 'message' => 'ไม่พบ safety knowledge'], 404);
        if ((string) ($existing['SourceType'] ?? 'document') !== 'manual') json_response(['success' => false, 'message' => 'รายการนี้เป็นเอกสารอัปโหลด ไม่สามารถแก้เนื้อหาแบบพิมพ์เองได้'], 400);
        $title = mb_substr(trim((string) ($body['topic'] ?? $body['title'] ?? '')), 0, 220);
        $category = mb_substr(trim((string) ($body['category'] ?? 'general')), 0, 80) ?: 'general';
        $content = johnny_clean_knowledge_text($body['content'] ?? '');
        $isActive = array_key_exists('isActive', $body) ? (!empty($body['isActive']) ? 1 : 0) : (int) ($existing['IsActive'] ?? 1);
        if ($title === '') json_response(['success' => false, 'message' => 'กรุณาระบุหัวข้อ safety knowledge'], 400);
        if (mb_strlen($content) < 80) json_response(['success' => false, 'message' => 'กรุณาระบุเนื้อหา safety knowledge อย่างน้อย 80 ตัวอักษร'], 400);
        db_execute('UPDATE johnny_kb_documents SET Title=?, Category=?, OriginalName=?, TextContent=?, FileSize=?, IsActive=?, IndexedStatus=?, ErrorMessage=NULL WHERE id=?', [$title, $category, $title, $content, strlen($content), $isActive, 'pending', $id]);
        try {
            $indexed = johnny_index_manual_knowledge($id, $title, $content);
            json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]), 'indexed' => $indexed]);
        } catch (Throwable $error) {
            json_response(['success' => false, 'message' => $error->getMessage(), 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])], 422);
        }
    }

    if ($method === 'POST' && ($params = route_params($path, '/johnny/kb-documents/:id/reindex'))) {
        require_admin();
        $id = (int) $params['id'];
        $doc = db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]);
        if (!$doc) json_response(['success' => false, 'message' => 'ไม่พบเอกสาร Knowledge Base'], 404);
        if ((string) ($doc['SourceType'] ?? 'document') === 'manual') {
            try {
                $indexed = johnny_index_manual_knowledge($id, (string) $doc['Title'], (string) ($doc['TextContent'] ?? ''));
                json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]), 'indexed' => $indexed]);
            } catch (Throwable $error) {
                json_response(['success' => false, 'message' => $error->getMessage(), 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])], 422);
            }
        }
        $filePath = upload_dir() . DIRECTORY_SEPARATOR . basename((string) ($doc['StoredName'] ?? ''));
        if (!is_file($filePath)) json_response(['success' => false, 'message' => 'ไม่พบไฟล์ต้นฉบับบน server'], 404);
        try {
            $indexed = johnny_index_document($id, $filePath, (string) $doc['Title'], (string) $doc['OriginalName']);
            json_response(['success' => true, 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]), 'indexed' => $indexed]);
        } catch (Throwable $error) {
            json_response(['success' => false, 'message' => $error->getMessage(), 'data' => db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id])], 422);
        }
    }

    if ($method === 'DELETE' && ($params = route_params($path, '/johnny/kb-documents/:id'))) {
        require_admin();
        $id = (int) $params['id'];
        $doc = db_row('SELECT * FROM johnny_kb_documents WHERE id=?', [$id]);
        if (!$doc) json_response(['success' => false, 'message' => 'ไม่พบเอกสาร Knowledge Base'], 404);
        db_execute('DELETE FROM johnny_kb_chunks WHERE DocumentID=?', [$id]);
        db_execute('DELETE FROM johnny_kb_documents WHERE id=?', [$id]);
        if ((string) ($doc['SourceType'] ?? 'document') !== 'manual') delete_uploaded_file($doc['FileUrl'] ?? '');
        json_response(['success' => true]);
    }

    if ($method === 'GET' && $path === '/johnny/conversations') {
        json_response(['success' => true, 'data' => db_rows(
            'SELECT id, Title, CreatedAt, UpdatedAt FROM johnny_chat_conversations WHERE UserID=? ORDER BY UpdatedAt DESC LIMIT 30',
            [$uid]
        )]);
    }

    if ($method === 'GET' && ($params = route_params($path, '/johnny/conversations/:id'))) {
        $conversation = johnny_conversation_for_user($params['id'], $uid);
        if (!$conversation) json_response(['success' => false, 'message' => 'ไม่พบประวัติสนทนา'], 404);
        $messages = db_rows(
            'SELECT id, Role, MessageText, SourceType, CitationsJson, Model, LatencyMs, CreatedAt FROM johnny_chat_messages WHERE ConversationID=? AND UserID=? ORDER BY CreatedAt ASC, id ASC',
            [(int) $conversation['id'], $uid]
        );
        json_response(['success' => true, 'data' => ['conversation' => $conversation, 'messages' => $messages]]);
    }

    if ($method === 'DELETE' && ($params = route_params($path, '/johnny/conversations/:id'))) {
        $conversation = johnny_conversation_for_user($params['id'], $uid);
        if (!$conversation) json_response(['success' => false, 'message' => 'ไม่พบประวัติสนทนา'], 404);
        db_execute('DELETE FROM johnny_chat_messages WHERE ConversationID=? AND UserID=?', [(int) $conversation['id'], $uid]);
        db_execute('DELETE FROM johnny_chat_conversations WHERE id=? AND UserID=?', [(int) $conversation['id'], $uid]);
        json_response(['success' => true]);
    }

    if ($method === 'POST' && $path === '/johnny/analyze-image') {
        $upload = johnny_store_risk_image_upload('riskImage');
        $context = johnny_clean_message($_POST['message'] ?? $_POST['context'] ?? '');
        $promptText = $context !== ''
            ? 'ช่วยวิเคราะห์อันตรายและประเมินความเสี่ยงจากรูปนี้ โดยมีบริบทจากผู้ใช้: ' . $context
            : 'ช่วยวิเคราะห์อันตรายและประเมินความเสี่ยงจากรูปนี้';
        $userMessage = $context !== ''
            ? 'วิเคราะห์ความเสี่ยงจากรูปภาพ: ' . $upload['originalName'] . "\n" . 'บริบท: ' . $context
            : 'วิเคราะห์ความเสี่ยงจากรูปภาพ: ' . $upload['originalName'];
        $conversation = johnny_conversation_for_user($_POST['conversationId'] ?? 0, $uid);
        $conversationId = $conversation ? (int) $conversation['id'] : johnny_create_conversation($uid, johnny_title($userMessage));
        db_execute(
            'INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson) VALUES (?, ?, ?, ?, ?, ?)',
            [$conversationId, $uid, 'user', $userMessage, 'user', '[]']
        );
        try {
            $result = johnny_call_gemini(
                johnny_image_risk_instruction($user) . "\n" . johnny_image_risk_rubric_instruction(),
                johnny_build_image_risk_contents($promptText, $upload['path'], (string) $upload['mimetype']),
                false,
                'image_analysis',
                ['userId' => $uid, 'conversationId' => $conversationId]
            );
            $answerText = johnny_ensure_image_risk_rubric_answer($result['text']);
            $citations = [[
                'index' => 1,
                'referenceId' => 'IMG1',
                'type' => 'image_analysis',
                'sourceLabel' => 'การวิเคราะห์รูปภาพจากผู้ใช้',
                'title' => $upload['originalName'],
                'fileName' => $upload['originalName'],
                'mimeType' => $upload['mimetype'],
                'fileSize' => $upload['size'],
                'excerpt' => $context !== '' ? $context : 'ไม่มีบริบทเพิ่มเติมจากผู้ใช้',
            ]];
            $sources = [['type' => 'image_analysis', 'label' => 'การวิเคราะห์รูปภาพจากผู้ใช้', 'count' => 1]];
            $answerQuality = johnny_phase1_quality([
                'userMessage' => $userMessage,
                'answerText' => $answerText,
                'sourceType' => 'image_analysis',
                'citations' => $citations,
                'sources' => $sources,
                'imageAnalysis' => true,
            ]);
            $stmt = db()->prepare('INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model, LatencyMs, PromptTokens, OutputTokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $conversationId, $uid, 'assistant', $answerText, 'image_analysis',
                json_encode($citations, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $result['model'], $result['latencyMs'], $result['promptTokens'], $result['outputTokens'],
            ]);
            db_execute('UPDATE johnny_chat_conversations SET UpdatedAt=NOW() WHERE id=? AND UserID=?', [$conversationId, $uid]);
            if (is_file($upload['path'])) @unlink($upload['path']);
            json_response(['success' => true, 'data' => [
                'conversationId' => $conversationId,
                'messageId' => (int) db()->lastInsertId(),
                'answer' => $answerText,
                'sourceType' => 'image_analysis',
                'citations' => $citations,
                'sources' => $sources,
                'answerQuality' => $answerQuality,
                'latencyMs' => $result['latencyMs'],
            ]]);
        } catch (Throwable $error) {
            if (is_file($upload['path'])) @unlink($upload['path']);
            error_log('[johnny-ai] image analysis failed: ' . $error->getMessage());
            $status = (int) $error->getCode();
            if ($status < 400 || $status > 599) $status = 500;
            $msg = $status === 503
                ? 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับ Johnny AI'
                : 'Johnny AI ยังวิเคราะห์รูปนี้ไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
            db_execute(
                'INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$conversationId, $uid, 'assistant', $msg, 'not_verified', '[]', johnny_gemini_models()[0] ?? 'gemini-3.5-flash']
            );
            json_response(['success' => false, 'message' => $msg], $status);
        }
    }

    if ($method === 'POST' && $path === '/johnny/chat') {
        $body = json_body();
        $message = johnny_clean_message($body['message'] ?? '');
        $scopedDocument = johnny_scoped_kb_document($body['documentId'] ?? 0);
        if (!empty($body['documentId']) && !$scopedDocument) {
            json_response(['success' => false, 'message' => 'Selected Knowledge Base document is not ready or active'], 404);
        }
        if ($message === '') json_response(['success' => false, 'message' => 'กรุณาพิมพ์คำถามก่อนส่งถึง Johnny AI'], 400);

        $conversation = johnny_conversation_for_user($body['conversationId'] ?? 0, $uid);
        $conversationId = $conversation ? (int) $conversation['id'] : johnny_create_conversation($uid, johnny_title($message));
        db_execute(
            'INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson) VALUES (?, ?, ?, ?, ?, ?)',
            [$conversationId, $uid, 'user', $message, 'user', '[]']
        );

        try {
            $kbMatches = [];
            try {
                $kbMatches = johnny_search_kb($message, $scopedDocument ? (int) $scopedDocument['id'] : null);
                johnny_write_log(['level' => 'info', 'operation' => 'chat', 'stage' => 'kb_retrieval', 'userId' => $uid, 'conversationId' => $conversationId, 'documentId' => $scopedDocument ? (int) $scopedDocument['id'] : null, 'message' => 'Knowledge retrieval completed', 'meta' => ['matches' => count($kbMatches), 'scoped' => (bool) $scopedDocument]]);
            } catch (Throwable $searchError) {
                error_log('[johnny-ai] kb search skipped: ' . $searchError->getMessage());
                johnny_write_log(['level' => 'error', 'operation' => 'chat', 'stage' => 'kb_retrieval', 'userId' => $uid, 'conversationId' => $conversationId, 'documentId' => $scopedDocument ? (int) $scopedDocument['id'] : null, 'message' => $searchError->getMessage()]);
            }
            $systemData = ['contexts' => [], 'citations' => []];
            if (!$scopedDocument) {
                try {
                    $systemData = johnny_load_system_data_context($message);
                } catch (Throwable $systemError) {
                    error_log('[johnny-ai] system data skipped: ' . $systemError->getMessage());
                    $systemData = ['contexts' => [], 'citations' => []];
                }
            }
            $citations = [];
            foreach ($kbMatches as $idx => $match) {
                $citations[] = [
                    'index' => $idx + 1,
                    'rank' => $idx + 1,
                    'referenceId' => 'D' . ($idx + 1),
                    'type' => ((string) ($match['SourceType'] ?? 'document') === 'manual') ? 'safety_knowledge' : 'company_document',
                    'sourceLabel' => 'ข้อมูลจากเอกสารบริษัท',
                    'sourceLabel' => ((string) ($match['SourceType'] ?? 'document') === 'manual') ? 'ข้อมูลจาก safety knowledge' : 'ข้อมูลจากเอกสารบริษัท',
                    'documentId' => (int) ($match['documentId'] ?? 0),
                    'chunkId' => (int) ($match['id'] ?? $match['chunkId'] ?? 0),
                    'chunkIndex' => (int) ($match['ChunkIndex'] ?? $idx),
                    'title' => (string) ($match['Title'] ?? $match['OriginalName'] ?? 'Knowledge Base'),
                    'fileName' => (string) ($match['OriginalName'] ?? $match['Title'] ?? ''),
                    'fileUrl' => (string) ($match['FileUrl'] ?? ''),
                    'pageLabel' => (string) ($match['PageLabel'] ?? ''),
                    'score' => round((float) ($match['score'] ?? 0), 4),
                    'similarityScore' => round((float) ($match['semanticScore'] ?? $match['score'] ?? 0), 4),
                    'similarityPercent' => round(((float) ($match['semanticScore'] ?? $match['score'] ?? 0)) * 100, 1),
                    'keywordScore' => round((float) ($match['keywordScore'] ?? 0), 4),
                    'keywordPercent' => round(((float) ($match['keywordScore'] ?? 0)) * 100, 1),
                    'hybridScore' => round((float) ($match['hybridScore'] ?? $match['score'] ?? 0), 4),
                    'hybridPercent' => round(((float) ($match['hybridScore'] ?? $match['score'] ?? 0)) * 100, 1),
                    'minScore' => (float) ($config['johnny_kb_hybrid_min_score'] ?? max(0.55, (float) ($config['johnny_kb_min_score'] ?? 0.68) - 0.08)),
                    'tokenEstimate' => (int) ($match['TokenEstimate'] ?? ceil(mb_strlen((string) ($match['ChunkText'] ?? '')) / 4)),
                    'excerpt' => johnny_compact_snippet((string) ($match['ChunkText'] ?? ''), 700),
                    'trace' => [
                        'method' => 'hybrid_semantic_keyword',
                        'semanticMethod' => 'gemini_embedding_cosine',
                        'queryMode' => 'task: question answering',
                        'rank' => $idx + 1,
                        'selected' => true,
                        'scopedDocumentId' => $scopedDocument ? (int) $scopedDocument['id'] : null,
                        'threshold' => (float) ($config['johnny_kb_hybrid_min_score'] ?? max(0.55, (float) ($config['johnny_kb_min_score'] ?? 0.68) - 0.08)),
                        'semanticThreshold' => (float) ($config['johnny_kb_min_score'] ?? 0.68),
                        'keywordThreshold' => (float) ($config['johnny_kb_keyword_min_score'] ?? 0.35),
                        'semanticWeight' => (float) ($config['johnny_kb_semantic_weight'] ?? 0.7),
                        'keywordWeight' => (float) ($config['johnny_kb_keyword_weight'] ?? 0.3),
                        'score' => round((float) ($match['hybridScore'] ?? $match['score'] ?? 0), 4),
                        'semanticScore' => round((float) ($match['semanticScore'] ?? $match['score'] ?? 0), 4),
                        'keywordScore' => round((float) ($match['keywordScore'] ?? 0), 4),
                        'hybridScore' => round((float) ($match['hybridScore'] ?? $match['score'] ?? 0), 4),
                        'chunkChars' => mb_strlen((string) ($match['ChunkText'] ?? '')),
                    ],
                ];
            }
            foreach (($systemData['citations'] ?? []) as $systemCitation) {
                $systemCitation['index'] = count($citations) + 1;
                $citations[] = $systemCitation;
            }
            $kbSourceType = 'company_document';
            foreach ($kbMatches as $match) {
                if ((string) ($match['SourceType'] ?? 'document') === 'manual') {
                    $kbSourceType = 'safety_knowledge';
                    break;
                }
            }
            $sourceType = $kbMatches ? $kbSourceType : (!empty($systemData['citations']) ? 'system_data' : 'ai_general');
            $sources = $kbMatches
                ? [['type' => 'company_document', 'label' => 'ข้อมูลจากเอกสารบริษัท', 'count' => count($kbMatches)]]
                : (!empty($systemData['citations'])
                    ? [['type' => 'system_data', 'label' => 'ข้อมูลจากระบบ TSH SCA', 'count' => count($systemData['citations'])]]
                    : [['type' => 'ai_general', 'label' => 'ข้อมูลจากความรู้ทั่วไปของ AI']]);
            if ($kbMatches && !empty($systemData['citations'])) {
                $sources[] = ['type' => 'system_data', 'label' => 'ข้อมูลจากระบบ TSH SCA', 'count' => count($systemData['citations'])];
            }
            if ($kbMatches) {
                $sources[0]['type'] = $kbSourceType;
                $sources[0]['label'] = $kbSourceType === 'safety_knowledge' ? 'ข้อมูลจาก safety knowledge' : 'ข้อมูลจากเอกสารบริษัท';
            }
            $enableWebSearch = !$scopedDocument && !empty($config['johnny_web_research_enabled']) && !$kbMatches && empty($systemData['citations']);
            $result = johnny_call_gemini(
                johnny_system_instruction($user, $kbMatches, $systemData['contexts'] ?? [], ['scopedDocument' => $scopedDocument]),
                johnny_build_contents(johnny_recent_history($conversationId), $message),
                $enableWebSearch,
                'chat',
                ['userId' => $uid, 'conversationId' => $conversationId, 'documentId' => $scopedDocument ? (int) $scopedDocument['id'] : null]
            );
            $answerText = johnny_clean_answer($result['text']);
            $groundingUsed = false;
            if (!$kbMatches && !empty($result['grounding']['citations'])) {
                $citations = $result['grounding']['citations'];
                $sourceType = 'external_research';
                $groundingUsed = true;
                $sources = [[
                    'type' => 'external_research',
                    'label' => 'ข้อมูลจากการค้นคว้าภายนอก',
                    'count' => count($citations),
                    'queries' => $result['grounding']['queries'] ?? [],
                ]];
            }
            $answerQuality = johnny_phase1_quality([
                'userMessage' => $message,
                'answerText' => $answerText,
                'sourceType' => $sourceType,
                'citations' => $citations,
                'sources' => $sources,
                'scopedDocument' => $scopedDocument,
                'groundingUsed' => $groundingUsed,
            ]);
            if (!empty($answerQuality['noVerifiedSource']) && !empty($answerQuality['companyDataGuarded'])) {
                $sourceType = 'not_verified';
                $citations = [];
                $sources = [['type' => 'not_verified', 'label' => 'ไม่พบข้อมูลที่ยืนยันได้', 'count' => 0]];
                $answerText = johnny_phase1_no_verified_source_answer($answerText, $scopedDocument);
                $answerQuality = johnny_phase1_quality([
                    'userMessage' => $message,
                    'answerText' => $answerText,
                    'sourceType' => $sourceType,
                    'citations' => $citations,
                    'sources' => $sources,
                    'scopedDocument' => $scopedDocument,
                    'groundingUsed' => false,
                ]);
            }
            $stmt = db()->prepare('INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model, LatencyMs, PromptTokens, OutputTokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $conversationId, $uid, 'assistant', $answerText, $sourceType, json_encode($citations, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $result['model'], $result['latencyMs'], $result['promptTokens'], $result['outputTokens'],
            ]);
            db_execute('UPDATE johnny_chat_conversations SET UpdatedAt=NOW() WHERE id=? AND UserID=?', [$conversationId, $uid]);
            json_response(['success' => true, 'data' => [
                'conversationId' => $conversationId,
                'messageId' => (int) db()->lastInsertId(),
                'answer' => $answerText,
                'sourceType' => $sourceType,
                'citations' => $citations,
                'sources' => $sources,
                'answerQuality' => $answerQuality,
                'latencyMs' => $result['latencyMs'],
            ]]);
        } catch (Throwable $error) {
            error_log('[johnny-ai] chat failed: ' . $error->getMessage());
            $status = (int) $error->getCode();
            if ($status < 400 || $status > 599) $status = 500;
            $msg = $status === 503
                ? 'ยังไม่ได้ตั้งค่า GEMINI_API_KEY สำหรับ Johnny AI'
                : 'Johnny AI ยังตอบไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
            db_execute(
                'INSERT INTO johnny_chat_messages (ConversationID, UserID, Role, MessageText, SourceType, CitationsJson, Model) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$conversationId, $uid, 'assistant', $msg, 'not_verified', '[]', johnny_gemini_models()[0] ?? 'gemini-3.5-flash']
            );
            json_response(['success' => false, 'message' => $msg], $status);
        }
    }

    json_response(['success' => false, 'message' => 'Johnny AI endpoint is not implemented', 'path' => $path], 501);
}
