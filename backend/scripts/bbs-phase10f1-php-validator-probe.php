<?php
declare(strict_types=1);
require __DIR__.'/../../api/lib/bbs_card_designer.php';
try{$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);$layout=bbs_designer_normalize((array)($input['layout']??[]),(string)($input['kind']??''));echo json_encode(['ok'=>true,'layout'=>$layout,'readiness'=>bbs_designer_readiness($layout)],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);}
catch(Throwable$e){echo json_encode(['ok'=>false,'message'=>$e->getMessage()],JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);exit(2);}
