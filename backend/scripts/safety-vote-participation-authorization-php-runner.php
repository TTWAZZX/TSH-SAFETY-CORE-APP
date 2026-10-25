<?php
declare(strict_types=1);
require_once __DIR__.'/../../api/lib/safety_vote_participation_authorization.php';
$input=json_decode((string)stream_get_contents(STDIN),true);
if(!is_array($input)){fwrite(STDERR,"Invalid JSON\n");exit(2);}
echo json_encode(array_map('svpa_authorize',$input),JSON_UNESCAPED_SLASHES);
