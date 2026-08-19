<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api/handlers/admin_phase8.php';

$payload = json_decode((string) stream_get_contents(STDIN), true);
$rows = is_array($payload['rows'] ?? null) ? $payload['rows'] : [];
$employees = is_array($payload['employees'] ?? null) ? $payload['employees'] : [];

echo json_encode(admin8_safety_ky_count_map($rows, $employees), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
