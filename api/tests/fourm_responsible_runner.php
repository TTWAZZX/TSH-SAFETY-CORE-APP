<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/handlers/fourm_phase7.php';

$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
echo json_encode([
    'validEmail'=>fm_valid_email($input['validEmail']??null),
    'invalidEmail'=>fm_valid_email($input['invalidEmail']??null),
    'recipients'=>fm_recipients($input['recipients']??[]),
    'mismatch'=>fm_notice_department_mismatch($input['noticeDepartment']??null,$input['responsibleDepartment']??null),
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
