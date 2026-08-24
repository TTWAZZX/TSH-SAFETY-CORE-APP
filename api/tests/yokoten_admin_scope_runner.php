<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/yokoten_admin_scope.php';

$input = json_decode((string)stream_get_contents(STDIN), true);
if (!is_array($input)) {
    fwrite(STDERR, "Expected JSON input.\n");
    exit(1);
}

echo json_encode(
    (($input['action'] ?? 'plan') === 'coverage')
        ? yokoten_scope_build_unit_coverage($input)
        : yokoten_scope_build_department_unit_plan($input),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
);
