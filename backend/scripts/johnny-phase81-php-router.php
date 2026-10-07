<?php
declare(strict_types=1);

$loopback = ['localhost', '127.0.0.1', '::1'];
$dbHost = trim((string) getenv('DB_HOST'));
$dbName = trim((string) getenv('DB_NAME'));
$phase83Mode = getenv('JOHNNY_PHASE83_ANSWER_VERIFICATION') === '1';
$phase82Mode = $phase83Mode || getenv('JOHNNY_PHASE82_MULTI_SOURCE') === '1';
$databasePrefix = $phase83Mode ? 'phase83' : ($phase82Mode ? 'phase82' : 'phase81');
$mockBase = trim((string) getenv('JOHNNY_PHASE81_GEMINI_BASE'));
$mockHost = strtolower((string) parse_url($mockBase, PHP_URL_HOST));
if (!in_array(strtolower($dbHost), $loopback, true)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Phase 8.1 PHP fixture refuses non-loopback DB_HOST']);
    exit;
}
if (!preg_match('/^tsh_johnny_' . preg_quote($databasePrefix, '/') . '_php_\d+_\d+$/', $dbName)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Phase 8.1 PHP fixture database name is outside the guarded prefix']);
    exit;
}
if ($mockBase === '' || !in_array($mockHost, $loopback, true)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Phase 8.1 PHP fixture requires a loopback Gemini mock']);
    exit;
}

$config = [
    'db_host' => $dbHost,
    'db_port' => (int) (getenv('DB_PORT') ?: 3306),
    'db_user' => (string) getenv('DB_USER'),
    'db_pass' => (string) getenv('DB_PASS'),
    'db_name' => $dbName,
    'db_ssl' => false,
    'gemini_api_key' => 'phase81-local-mock',
    'gemini_model' => 'phase81-local-model',
    'gemini_models' => 'phase81-local-model',
    'gemini_embedding_model' => 'phase81-local-embedding',
    'gemini_embedding_dimension' => 4,
    'gemini_api_base' => $mockBase,
    'gemini_timeout_ms' => 5000,
    'gemini_max_output_tokens' => 512,
    'johnny_operational_log_retention_days' => 30,
    'johnny_chat_retention_days' => 180,
    'johnny_web_research_enabled' => false,
    'johnny_web_allowed_domains' => '',
    'johnny_system_data_enabled' => true,
];

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_body(): array
{
    $decoded = json_decode((string) file_get_contents('php://input'), true);
    return is_array($decoded) ? $decoded : [];
}

function db(): PDO
{
    global $config;
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_port'], $config['db_name']);
    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function db_rows(string $sql, array $params = []): array
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll() ?: [];
}

function db_row(string $sql, array $params = []): ?array
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    $row = $statement->fetch();
    return $row ?: null;
}

function db_execute(string $sql, array $params = []): int
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement->rowCount();
}

function route_params(string $path, string $pattern): ?array
{
    $names = [];
    $quoted = preg_quote($pattern, '#');
    $regex = preg_replace_callback('/\\\\:([A-Za-z0-9_]+)/', static function (array $matches) use (&$names): string {
        $names[] = $matches[1];
        return '([^/]+)';
    }, $quoted);
    if (!preg_match('#^' . $regex . '$#', $path, $matches)) return null;
    array_shift($matches);
    $params = [];
    foreach ($names as $index => $name) $params[$name] = rawurldecode($matches[$index]);
    return $params;
}

function phase81_bearer(): string
{
    $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    return preg_match('/^Bearer\s+(.+)$/i', trim($header), $matches) ? trim($matches[1]) : '';
}

function require_user(): array
{
    $users = [
        'phase81-admin' => ['id' => 'PHASE81-ADMIN', 'name' => 'Phase 8.1 Admin', 'role' => 'Admin', 'department' => 'UAT', 'unit' => 'Fixture'],
        'phase81-user' => ['id' => 'PHASE81-USER', 'name' => 'Phase 8.1 User', 'role' => 'User', 'department' => 'UAT', 'unit' => 'Fixture'],
    ];
    $token = phase81_bearer();
    if (!isset($users[$token])) json_response(['success' => false, 'message' => 'Fixture authentication required'], 401);
    return $users[$token];
}

function require_admin(): array
{
    $user = require_user();
    if (strcasecmp((string) ($user['role'] ?? ''), 'Admin') !== 0) {
        json_response(['success' => false, 'message' => 'Permission denied. Admin access required.'], 403);
    }
    return $user;
}

require_once dirname(__DIR__, 2) . '/api/handlers/johnny_ai.php';

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
if (strpos($path, '/api') === 0) $path = substr($path, 4) ?: '/';
handle_johnny_ai_routes($method, $path);
json_response(['success' => false, 'message' => 'Fixture route not found'], 404);
