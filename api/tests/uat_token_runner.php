<?php
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

$payload = json_decode((string)stream_get_contents(STDIN), true);
if (!is_array($payload) || trim((string)($payload['id'] ?? '')) === '') {
    fwrite(STDERR, "A user payload with an id is required.\n");
    exit(2);
}

echo jwt_sign($payload);

