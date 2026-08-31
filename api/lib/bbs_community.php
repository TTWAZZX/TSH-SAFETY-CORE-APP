<?php
declare(strict_types=1);

require_once __DIR__.'/bbs_card.php';

function bbs_community_raw_token(int $departmentId,int $generation): string {
    global $config;
    $secret=(string)($config['jwt_secret']??'');
    if($secret==='')throw new RuntimeException('JWT secret is required for Department QR generation.');
    return rtrim(strtr(base64_encode(hash_hmac('sha256','bbs-department:'.$departmentId.':'.$generation,$secret,true)),'+/','-_'),'=');
}
function bbs_community_token_record(int $departmentId,int $generation): array {
    $raw=bbs_community_raw_token($departmentId,$generation);
    return['rawToken'=>$raw,'tokenHash'=>bbs_card_hash($raw),'fingerprint'=>bbs_card_fingerprint($raw)];
}
function bbs_community_report_type($value): ?string {
    $value=strtolower(bbs_card_clean($value,20));
    foreach(['Good','Risky']as$type)if(strtolower($type)===$value)return$type;
    return null;
}
function bbs_community_action_status($value): ?string {
    $value=strtolower(bbs_card_clean($value,30));
    foreach(['Open','In Progress','Closed','Reopened']as$status)if(strtolower($status)===$value)return$status;
    return null;
}
function bbs_community_paper_size($value): ?string {
    $value=strtoupper(bbs_card_clean($value,20));
    return in_array($value,['A4','A5','A6'],true)?$value:null;
}
