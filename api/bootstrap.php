<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

function json_response(array $payload, int $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $body = json_decode($raw, true);
    return is_array($body) ? $body : [];
}

function db(): PDO
{
    global $config;
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_port'],
        $config['db_name']
    );
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (!empty($config['db_ssl']) && defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
        $options[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = true;
    }
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], $options);
    return $pdo;
}

function base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64url_decode(string $value)
{
    $padding = strlen($value) % 4;
    if ($padding) {
        $value .= str_repeat('=', 4 - $padding);
    }
    return base64_decode(strtr($value, '-_', '+/'), true);
}

function jwt_sign(array $user): string
{
    global $config;
    if ($config['jwt_secret'] === '') {
        throw new RuntimeException('JWT_SECRET is not configured');
    }
    $now = time();
    $payload = array_merge($user, ['iat' => $now, 'exp' => $now + $config['jwt_ttl']]);
    $segments = [
        base64url_encode(json_encode(['alg' => 'HS256', 'typ' => 'JWT'], JSON_UNESCAPED_SLASHES)),
        base64url_encode(json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)),
    ];
    $signature = hash_hmac('sha256', implode('.', $segments), $config['jwt_secret'], true);
    $segments[] = base64url_encode($signature);
    return implode('.', $segments);
}

function jwt_verify(string $token): ?array
{
    global $config;
    if ($config['jwt_secret'] === '') {
        return null;
    }
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$header64, $payload64, $signature64] = $parts;
    $signature = base64url_decode($signature64);
    $expected = hash_hmac('sha256', $header64 . '.' . $payload64, $config['jwt_secret'], true);
    if ($signature === false || !hash_equals($expected, $signature)) {
        return null;
    }
    $header = json_decode((string) base64url_decode($header64), true);
    $payload = json_decode((string) base64url_decode($payload64), true);
    if (!is_array($header) || ($header['alg'] ?? '') !== 'HS256' || !is_array($payload)) {
        return null;
    }
    if (!isset($payload['exp']) || (int) $payload['exp'] < time()) {
        return null;
    }
    return $payload;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+(.+)$/i', trim($header), $matches) ? trim($matches[1]) : null;
}

function require_user(): array
{
    $token = bearer_token();
    if (!$token) {
        json_response(['success' => false, 'message' => 'No token provided'], 401);
    }
    $user = jwt_verify($token);
    if (!$user) {
        json_response(['success' => false, 'message' => 'Token is not valid'], 403);
    }
    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if (strcasecmp((string) ($user['role'] ?? $user['Role'] ?? ''), 'Admin') !== 0) {
        json_response(['success' => false, 'message' => 'Permission denied. Admin access required.'], 403);
    }
    return $user;
}

function route_params(string $path, string $pattern): ?array
{
    $names = [];
    $quoted = preg_quote($pattern, '#');
    $regex = preg_replace_callback('/\\\\:([A-Za-z0-9_]+)/', function ($matches) use (&$names) {
        $names[] = $matches[1];
        return '([^/]+)';
    }, $quoted);
    if (!preg_match('#^' . $regex . '$#', $path, $matches)) {
        return null;
    }
    array_shift($matches);
    $params = [];
    foreach ($names as $index => $name) {
        $params[$name] = rawurldecode($matches[$index]);
    }
    return $params;
}

function db_rows(string $sql, array $params = []): array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll() ?: [];
}

function db_row(string $sql, array $params = []): ?array
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ?: null;
}

function db_execute(string $sql, array $params = []): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

function validate_company_email($email): array
{
    $value = trim((string) ($email ?? ''));
    if ($value === '') {
        return ['ok' => true, 'email' => null];
    }
    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'email' => null, 'message' => 'รูปแบบ Company Email ไม่ถูกต้อง'];
    }
    return ['ok' => true, 'email' => $value];
}

function normalize_role($role): string
{
    foreach (['Admin', 'User', 'Viewer'] as $allowed) {
        if (strcasecmp(trim((string) $role), $allowed) === 0) {
            return $allowed;
        }
    }
    return 'User';
}

function user_data(array $row): array
{
    return [
        'id' => (string) ($row['EmployeeID'] ?? ''),
        'name' => (string) ($row['EmployeeName'] ?? ''),
        'department' => (string) ($row['Department'] ?? ''),
        'unit' => (string) ($row['Unit'] ?? ''),
        'role' => normalize_role($row['Role'] ?? ''),
        'team' => (string) ($row['Team'] ?? ''),
    ];
}

function safe_scalar(string $sql, array $params = [])
{
    try {
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        if (!$row) {
            return 0;
        }
        $value = reset($row);
        return $value === null ? 0 : (is_numeric($value) ? $value + 0 : 0);
    } catch (Throwable $error) {
        return null;
    }
}

function safe_rows(string $sql, array $params = []): array
{
    try {
        $stmt = db()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll() ?: [];
    } catch (Throwable $error) {
        return [];
    }
}

function percent($numerator, $denominator): ?int
{
    $d = (float) ($denominator ?? 0);
    return $d > 0 ? max(0, min(100, (int) round(((float) ($numerator ?? 0) / $d) * 100))) : null;
}

function upload_dir(): string
{
    $dir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create uploads directory');
    }
    return $dir;
}

function clean_upload_name($name): string
{
    $name = basename(str_replace(["\r", "\n"], ' ', (string) $name));
    $name = trim((string) preg_replace('/\s+/', ' ', $name));
    return mb_substr($name !== '' ? $name : 'upload', 0, 180);
}

function upload_public_url(string $storedName, string $originalName): string
{
    $script = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php'));
    $base = rtrim(dirname(dirname($script)), '/.');
    return ($base !== '' ? $base : '') . '/uploads/' . rawurlencode($storedName)
        . '?filename=' . rawurlencode(clean_upload_name($originalName));
}

function store_uploaded_file(string $field, array $allowed, int $maxBytes): array
{
    $file = $_FILES[$field] ?? null;
    if (!is_array($file) || (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        json_response(['success' => false, 'message' => 'No file uploaded.'], 400);
    }
    if ((int) ($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        json_response(['success' => false, 'message' => 'Upload failed.'], 400);
    }
    $size = (int) ($file['size'] ?? 0);
    if ($size <= 0 || $size > $maxBytes) {
        json_response(['success' => false, 'message' => 'Uploaded file is too large.'], 400);
    }
    $tmp = (string) ($file['tmp_name'] ?? '');
    $mime = function_exists('finfo_open')
        ? (string) finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp)
        : (string) ($file['type'] ?? '');
    $extension = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
    $rule = $allowed[$mime] ?? null;
    if (!is_array($rule) || !in_array($extension, $rule, true)) {
        json_response(['success' => false, 'message' => 'Unsupported file type: ' . $mime], 400);
    }
    $storedName = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $extension;
    $target = upload_dir() . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file($tmp, $target)) {
        json_response(['success' => false, 'message' => 'Cannot store uploaded file.'], 500);
    }
    $originalName = clean_upload_name($file['name'] ?? 'upload');
    return [
        'url' => upload_public_url($storedName, $originalName),
        'originalName' => $originalName,
        'storedName' => $storedName,
        'mimetype' => $mime,
        'size' => $size,
    ];
}

function delete_uploaded_file($url): bool
{
    $path = (string) parse_url((string) $url, PHP_URL_PATH);
    if (strpos($path, '/uploads/') === false) {
        return false;
    }
    $name = basename(rawurldecode($path));
    if ($name === '' || $name === '.' || $name === '..') {
        return false;
    }
    $target = upload_dir() . DIRECTORY_SEPARATOR . $name;
    return is_file($target) ? unlink($target) : false;
}
