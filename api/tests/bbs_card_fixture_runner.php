<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/bbs_card.php';
$fixture=json_decode((string)stream_get_contents(STDIN),true)?:[];
$out=['hashes'=>[],'valid'=>[],'routes'=>[]];
foreach($fixture['tokens']??[] as$token){$out['hashes'][]=bbs_card_hash((string)$token);$out['valid'][]=bbs_card_valid_token($token);}
foreach($fixture['routes']??[] as$route)$out['routes'][]=bbs_card_route($route);
echo json_encode($out,JSON_UNESCAPED_SLASHES);
