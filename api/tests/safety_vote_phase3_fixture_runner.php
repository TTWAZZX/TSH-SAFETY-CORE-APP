<?php
declare(strict_types=1);
require_once __DIR__.'/../lib/safety_vote_phase3.php';
$f=json_decode((string)stream_get_contents(STDIN),true)?:[];
$builder=sv3_builder($f['questions']??null,$f['privacyMode']??'identified');
$jsonBuilder=$builder;foreach($jsonBuilder['questions']as&$q)if(!$q['validation'])$q['validation']=(object)[];unset($q);
$answers=sv3_answers($f['resolvedQuestions']??[],$f['answers']??null,$f['privacyMode']??'identified');
$secret=(string)($f['secret']??'fixture-secret');
echo json_encode(['builder'=>$jsonBuilder,'answers'=>$answers,'decryptNode'=>sv3_decrypt((string)($f['nodeCipher']??''),$secret),'phpCipher'=>sv3_encrypt((string)($f['plainText']??'phase3'),$secret)],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
