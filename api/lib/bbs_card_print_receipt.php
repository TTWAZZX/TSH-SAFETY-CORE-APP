<?php
declare(strict_types=1);

class BbsPrintReceiptException extends RuntimeException {
    public string $apiCode;
    public int $httpStatus;
    public function __construct(string $message, string $code='BBS_PRINT_RECEIPT_INVALID', int $status=400) {
        parent::__construct($message); $this->apiCode=$code; $this->httpStatus=$status;
    }
}
function bbs_print_receipt_signature(string $payload): string {
    global $config;
    if (empty($config['jwt_secret'])) throw new RuntimeException('JWT_SECRET is not configured.');
    return hash_hmac('sha256','bbs-card-print-v1.'.$payload,$config['jwt_secret']);
}
function bbs_print_receipt_create(string $kind,int $subjectId,string $actorId,array $snapshot,?int $now=null): string {
    $snapshotJson=json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $json=json_encode(['purpose'=>'bbs-card-print-v1','kind'=>$kind,'subjectId'=>$subjectId,'actorId'=>$actorId,'expiresAt'=>($now??time())+86400,'snapshotJson'=>$snapshotJson],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $payload=rtrim(strtr(base64_encode($json),'+/','-_'),'=');
    if(strlen($payload)>524288)throw new BbsPrintReceiptException('The card layout is too large to prepare for printing.');
    return $payload.'.'.bbs_print_receipt_signature($payload);
}
function bbs_print_receipt_read($receipt,array $expected,?int $now=null): array {
    if(!is_string($receipt)||strlen($receipt)>524353)throw new BbsPrintReceiptException('Invalid print receipt.');
    $parts=explode('.',$receipt);
    if(count($parts)!==2||!preg_match('/^[A-Za-z0-9_-]+$/D',$parts[0])||!preg_match('/^[a-f0-9]{64}$/D',$parts[1])||!hash_equals(bbs_print_receipt_signature($parts[0]),$parts[1]))throw new BbsPrintReceiptException('The prepared card was modified. Prepare it again.');
    try {
        $payload=json_decode(base64_decode(strtr($parts[0],'-_','+/'),true),true,512,JSON_THROW_ON_ERROR);
        $snapshot=json_decode($payload['snapshotJson']??'',true,512,JSON_THROW_ON_ERROR);
    }catch(Throwable $error){throw new BbsPrintReceiptException('Invalid print receipt content.');}
    if(($payload['purpose']??null)!=='bbs-card-print-v1'||($payload['kind']??null)!==$expected['kind']||($payload['subjectId']??null)!==(int)$expected['subjectId']||($payload['actorId']??null)!==(string)$expected['actorId'])throw new BbsPrintReceiptException('This prepared card belongs to another request or user.','BBS_PRINT_RECEIPT_SCOPE',403);
    if(!is_int($payload['expiresAt']??null)||$payload['expiresAt']<($now??time()))throw new BbsPrintReceiptException('The prepared card expired. Prepare it again.','BBS_PRINT_RECEIPT_EXPIRED',409);
    $qr=$snapshot['values'][$expected['kind']==='Personal'?'card.personal_qr':'department.community_qr']??null;
    if(($qr['kind']??null)!==$expected['kind'].'Qr'||($qr['fingerprint']??null)!==(string)$expected['fingerprint']||!is_int($snapshot['layout']['layoutVersionId']??null))throw new BbsPrintReceiptException('The prepared card no longer matches its QR.','BBS_PRINT_RECEIPT_QR_CHANGED',409);
    return ['layoutVersionId'=>$snapshot['layout']['layoutVersionId'],'snapshot'=>$snapshot,'snapshotJson'=>$payload['snapshotJson'],'renderContractHash'=>hash('sha256',$payload['snapshotJson'])];
}
function bbs_print_receipt_respond(Throwable $error): void {
    if($error instanceof BbsPrintReceiptException)json_response(['success'=>false,'code'=>$error->apiCode,'message'=>$error->getMessage()],$error->httpStatus);
}
