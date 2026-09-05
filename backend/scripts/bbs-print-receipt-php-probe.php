<?php
declare(strict_types=1);
require_once __DIR__.'/../../api/lib/bbs_card_print_receipt.php';
$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$config=['jwt_secret'=>$input['secret']];
try{
    $result=$input['action']==='create'
        ? bbs_print_receipt_create($input['kind'],$input['subjectId'],$input['actorId'],$input['snapshot'],$input['now'])
        : bbs_print_receipt_read($input['receipt'],$input['expected'],$input['now']);
    echo json_encode(['result'=>$result],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
}catch(BbsPrintReceiptException $error){echo json_encode(['code'=>$error->apiCode,'status'=>$error->httpStatus]);}
