<?php
declare(strict_types=1);

require __DIR__ . '/../lib/bbs_rollout_access.php';

$payload = json_decode((string)stream_get_contents(STDIN), true);
if (!is_array($payload)) {
    fwrite(STDERR, "Invalid fixture JSON\n");
    exit(2);
}

echo json_encode([
    'mode' => bbs_rollout_mode_from_settings((array)($payload['settings'] ?? [])),
], JSON_UNESCAPED_SLASHES);
