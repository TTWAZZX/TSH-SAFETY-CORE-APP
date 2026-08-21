<?php
declare(strict_types=1);

require_once dirname(__DIR__).'/handlers/fourm_phase7.php';

$rows=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$options=fm_bulk_code_options(['year'=>2026,'department'=>'all','find'=>'CU68','replace'=>'CU69']);
echo json_encode(fm_bulk_code_preview($rows,$options),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
