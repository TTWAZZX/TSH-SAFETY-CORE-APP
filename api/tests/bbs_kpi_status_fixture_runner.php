<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/bbs_phase1.php';
require_once __DIR__ . '/../handlers/bbs_inspector_schedules.php';
$fixture = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
echo json_encode(
    array_map('bbs_schedule_kpi_status', $fixture['statuses'] ?? []),
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
);
