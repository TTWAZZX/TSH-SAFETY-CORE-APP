<?php
declare(strict_types=1);

function load_env_file(string $path): array
{
    if (!is_file($path)) {
        return [];
    }

    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || substr($line, 0, 1) === '#' || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $values[trim($key)] = trim($value, " \t\n\r\0\x0B\"'");
    }
    return $values;
}

$env = load_env_file(dirname(__DIR__) . '/backend/.env');
$localConfig = is_file(__DIR__ . '/config.local.php')
    ? require __DIR__ . '/config.local.php'
    : [];

$read = static function (string $key, $fallback = null) use ($env, $localConfig) {
    $localKey = strtolower($key);
    if (array_key_exists($localKey, $localConfig)) {
        return $localConfig[$localKey];
    }
    $processValue = getenv($key);
    if ($processValue !== false && $processValue !== '') {
        return $processValue;
    }
    return $env[$key] ?? $fallback;
};

return [
    'db_host' => (string) $read('DB_HOST', 'localhost'),
    'db_port' => (int) $read('DB_PORT', 3306),
    'db_user' => (string) $read('DB_USER', ''),
    'db_pass' => (string) $read('DB_PASS', ''),
    'db_name' => (string) $read('DB_NAME', ''),
    'db_ssl' => filter_var($read('DB_SSL', false), FILTER_VALIDATE_BOOLEAN),
    'jwt_secret' => (string) $read('JWT_SECRET', ''),
    'jwt_ttl' => 6 * 60 * 60,
    'email_enabled' => filter_var($read('EMAIL_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
    'smtp_host' => (string) $read('SMTP_HOST', ''),
    'smtp_port' => (int) $read('SMTP_PORT', 587),
    'smtp_secure' => filter_var($read('SMTP_SECURE', false), FILTER_VALIDATE_BOOLEAN),
    'smtp_starttls' => filter_var($read('SMTP_STARTTLS', true), FILTER_VALIDATE_BOOLEAN),
    'smtp_user' => (string) $read('SMTP_USER', ''),
    'smtp_pass' => (string) $read('SMTP_PASS', ''),
    'smtp_from' => (string) $read('SMTP_FROM', $read('SMTP_USER', 'noreply@localhost')),
    'smtp_from_name' => (string) $read('SMTP_FROM_NAME', 'TSH Safety Core'),
    'forklift_admin_email' => (string) $read('FORKLIFT_ADMIN_EMAIL', ''),
    'safety_admin_email' => (string) $read('SAFETY_ADMIN_EMAIL', ''),
    'hiyari_admin_email' => (string) $read('HIYARI_ADMIN_EMAIL', ''),
    'admin_email' => (string) $read('ADMIN_EMAIL', ''),
    'fourm_admin_email' => (string) $read('FOURM_ADMIN_EMAIL', ''),
    'public_upload_base_url' => (string) $read('PUBLIC_UPLOAD_BASE_URL', ''),
    'public_app_url' => (string) $read('PUBLIC_APP_URL', $read('APP_BASE_URL', '')),
    'gemini_api_key' => (string) $read('GEMINI_API_KEY', ''),
    'gemini_model' => (string) $read('GEMINI_MODEL', 'gemini-3.5-flash'),
    'gemini_models' => (string) $read('GEMINI_MODELS', $read('GEMINI_MODEL', 'gemini-3.5-flash') . ',gemini-2.5-flash,gemini-2.5-flash-lite'),
    'gemini_embedding_model' => (string) $read('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-2'),
    'gemini_api_base' => (string) $read('GEMINI_API_BASE', 'https://generativelanguage.googleapis.com/v1beta'),
    'gemini_timeout_ms' => (int) $read('GEMINI_TIMEOUT_MS', 30000),
    'gemini_max_output_tokens' => (int) $read('GEMINI_MAX_OUTPUT_TOKENS', 4096),
    'johnny_refine_transient_retries' => (int) $read('JOHNNY_REFINE_TRANSIENT_RETRIES', 1),
    'johnny_refine_retry_delay_ms' => (int) $read('JOHNNY_REFINE_RETRY_DELAY_MS', 1200),
    'gemini_embedding_dimension' => (int) $read('GEMINI_EMBEDDING_DIMENSION', 768),
    'johnny_max_context_chunks' => (int) $read('JOHNNY_MAX_CONTEXT_CHUNKS', 6),
    'johnny_max_chunks_per_doc' => (int) $read('JOHNNY_MAX_CHUNKS_PER_DOC', 30),
    'johnny_chunk_chars' => (int) $read('JOHNNY_CHUNK_CHARS', 3200),
    'johnny_chunk_overlap_chars' => (int) $read('JOHNNY_CHUNK_OVERLAP_CHARS', 350),
    'johnny_reindex_min_char_ratio' => (float) $read('JOHNNY_REINDEX_MIN_CHAR_RATIO', 0.65),
    'johnny_reindex_min_chunk_ratio' => (float) $read('JOHNNY_REINDEX_MIN_CHUNK_RATIO', 0.5),
    'johnny_operational_log_retention_days' => (int) $read('JOHNNY_OPERATIONAL_LOG_RETENTION_DAYS', 30),
    'johnny_pdf_min_local_text_chars' => (int) $read('JOHNNY_PDF_MIN_LOCAL_TEXT_CHARS', 1000),
    'johnny_pdf_min_size_for_short_text_bytes' => (int) $read('JOHNNY_PDF_MIN_SIZE_FOR_SHORT_TEXT_BYTES', 122880),
    'johnny_pdf_max_bytes_per_text_char' => (int) $read('JOHNNY_PDF_MAX_BYTES_PER_TEXT_CHAR', 180),
    'johnny_pdf_ai_max_expected_chars' => (int) $read('JOHNNY_PDF_AI_MAX_EXPECTED_CHARS', 12000),
    'johnny_kb_min_score' => (float) $read('JOHNNY_KB_MIN_SCORE', 0.68),
    'johnny_kb_max_upload_mb' => (int) $read('JOHNNY_KB_MAX_UPLOAD_MB', 30),
    'johnny_avatar_max_upload_mb' => (int) $read('JOHNNY_AVATAR_MAX_UPLOAD_MB', 5),
    'johnny_risk_image_max_upload_mb' => (int) $read('JOHNNY_RISK_IMAGE_MAX_UPLOAD_MB', 8),
    'johnny_web_research_enabled' => filter_var($read('JOHNNY_WEB_RESEARCH_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
    'johnny_web_allowed_domains' => (string) $read('JOHNNY_WEB_ALLOWED_DOMAINS', 'ilo.org,who.int,osha.gov,cdc.gov,niosh.cdc.gov,iso.org,epa.gov,hse.gov.uk,ratchakitcha.soc.go.th,mol.go.th,labour.go.th,osh.labour.go.th,diw.go.th,tisi.go.th,shawpat.or.th'),
    'johnny_system_data_enabled' => filter_var($read('JOHNNY_SYSTEM_DATA_ENABLED', true), FILTER_VALIDATE_BOOLEAN),
    'smtp_timeout' => (int) $read('SMTP_TIMEOUT_MS', 15000),
    'smtp_ehlo_domain' => (string) $read('SMTP_EHLO_DOMAIN', 'localhost'),
];
