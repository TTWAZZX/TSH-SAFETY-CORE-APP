<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/api/handlers/people.php';

$state = json_decode((string) stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
echo json_encode(people_build_data_quality($state), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
