<?php
declare(strict_types=1);

$dbHost=trim((string)getenv('DB_HOST'));$dbName=trim((string)getenv('DB_NAME'));
if(!in_array(strtolower($dbHost),['localhost','127.0.0.1','::1'],true)||!preg_match('/^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/',$dbName)){http_response_code(500);echo'{"success":false}';exit;}
$config=['db_host'=>$dbHost,'db_port'=>(int)(getenv('DB_PORT')?:3306),'db_user'=>(string)getenv('DB_USER'),'db_pass'=>(string)getenv('DB_PASS'),'db_name'=>$dbName,'db_ssl'=>false,'jwt_secret'=>(string)(getenv('JWT_SECRET')?:'fixture-secret')];
function json_response(array$payload,int$status=200){http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');echo json_encode($payload,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function json_body():array{$body=json_decode((string)file_get_contents('php://input'),true);return is_array($body)?$body:[];}
function db():PDO{global$config;static$pdo=null;if($pdo instanceof PDO)return$pdo;$pdo=new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',$config['db_host'],$config['db_port'],$config['db_name']),$config['db_user'],$config['db_pass'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);return$pdo;}
function db_rows(string$sql,array$params=[]):array{$stmt=db()->prepare($sql);$stmt->execute($params);return$stmt->fetchAll()?:[];}
function db_row(string$sql,array$params=[]):?array{$stmt=db()->prepare($sql);$stmt->execute($params);$row=$stmt->fetch();return$row?:null;}
function db_execute(string$sql,array$params=[]):int{$stmt=db()->prepare($sql);$stmt->execute($params);return$stmt->rowCount();}
function route_params(string$path,string$pattern):?array{$names=[];$quoted=preg_quote($pattern,'#');$regex=preg_replace_callback('/\\\\:([A-Za-z0-9_]+)/',function($matches)use(&$names){$names[]=$matches[1];return'([^/]+)';},$quoted);if(!preg_match('#^'.$regex.'$#',$path,$matches))return null;array_shift($matches);$out=[];foreach($names as$i=>$name)$out[$name]=rawurldecode($matches[$i]);return$out;}
function require_user():array{$header=(string)($_SERVER['HTTP_AUTHORIZATION']??'');$token=preg_match('/^Bearer\s+(.+)$/i',trim($header),$m)?trim($m[1]):'';$users=['sv-admin'=>['id'=>'SV-ADMIN','name'=>'Safety Vote Admin','role'=>'Admin','department'=>'Safety','unit'=>'Core','position'=>'Officer'],'sv-user'=>['id'=>'SV-USER','name'=>'Safety Vote User','role'=>'User','department'=>'Production','unit'=>'Line 1','position'=>'Operator'],'sv-user2'=>['id'=>'SV-USER2','name'=>'Safety Vote User Two','role'=>'User','department'=>'Production','unit'=>'Line 1','position'=>'Operator']];for($i=1;$i<=30;$i++){$n=str_pad((string)$i,2,'0',STR_PAD_LEFT);$users['sv-load-'.$n]=['id'=>'SV-L'.$n,'name'=>'Load Voter '.$n,'role'=>'User','department'=>'Production','unit'=>'Line 1','position'=>'Operator'];}if(!isset($users[$token]))json_response(['success'=>false],401);return$users[$token];}
if((string)getenv('SAFETY_VOTE_FIXTURE_KEEP_DISABLED')!=='1'){db_execute("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='guarded-fixture' WHERE SettingKey='module_enabled'");try{db_execute("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='guarded-fixture' WHERE SettingKey='phase7_integrations_enabled'");}catch(Throwable$error){}}
require_once __DIR__.'/../../api/lib/onboarding_resolver.php';
require_once __DIR__.'/../../api/handlers/safety_vote.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase2.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase3.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase4.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase5.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase6.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase7.php';
require_once __DIR__.'/../../api/handlers/safety_vote_phase10_4.php';
$path=parse_url((string)($_SERVER['REQUEST_URI']??'/'),PHP_URL_PATH)?:'/';
if($path==='/__ready')json_response(['success'=>true]);
if(strpos($path,'/api')===0)$path=substr($path,4)?:'/';
sv_gate_request((string)($_SERVER['REQUEST_METHOD']??'GET'),$path);
if(handle_safety_vote_phase10_4_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_phase7_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_phase6_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_phase5_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_phase4_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_phase3_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_phase2_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
if(handle_safety_vote_routes((string)($_SERVER['REQUEST_METHOD']??'GET'),$path))exit;
json_response(['success'=>false],404);
