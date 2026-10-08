<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase7.php';
$x=json_decode(stream_get_contents(STDIN),true);
echo json_encode(['catalog'=>sv7_catalog(),'preview'=>sv7_preview($x['handoff']),'confirm'=>sv7_confirm($x['handoff']+$x['confirmation']),'verify'=>sv7_verify($x['verify']),'preflight'=>sv7_preflight($x['preflight']),'audit'=>sv7_safe_metadata($x['audit'])],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
