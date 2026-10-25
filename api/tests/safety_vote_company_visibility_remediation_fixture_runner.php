<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_company_visibility_remediation.php';
$input=json_decode(stream_get_contents(STDIN),true);
echo json_encode(sv_cvr_plan($input['rows']??[]),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
