<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase6.php';
$x=json_decode(stream_get_contents(STDIN),true);
echo json_encode(['config'=>sv6_config(['positions'=>$x['positions']]),'receipt'=>sv6_receipt($x['receipt']),'result'=>sv6_calculate($x['calculation']),'adversarial'=>array_map('sv6_calculate',$x['adversarial']),'certification'=>sv6_certification($x['certification']),'audit'=>sv6_audit_metadata($x['audit'])],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
