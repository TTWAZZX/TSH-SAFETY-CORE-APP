<?php
declare(strict_types=1);

function bbs_card_clean($value, int $max = 255): string { return mb_substr(trim((string) preg_replace('/[\r\n]+/u', ' ', (string) ($value ?? ''))), 0, $max); }
function bbs_card_token(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }
function bbs_card_hash(string $token): string { return hash('sha256', $token); }
function bbs_card_fingerprint(string $token): string { return substr(bbs_card_hash($token), 0, 12); }
function bbs_card_valid_token($token): bool { return preg_match('/^[A-Za-z0-9_-]{43}$/D', (string) $token) === 1; }
function bbs_card_route($value): string { $route=bbs_card_clean($value,120); return preg_match('#^\#bbs-smart-card(?:$|[/?])#',$route) ? $route : '#bbs-smart-card'; }
function bbs_card_template_dir(): string { $dir=dirname(__DIR__,2).'/backend/private-uploads/bbs-card-templates'; if(!is_dir($dir))mkdir($dir,0770,true); return $dir; }
function bbs_card_file_mime(string $file): ?string {
    $head=(string)file_get_contents($file,false,null,0,16);
    if(strlen($head)>=3&&ord($head[0])===0xff&&ord($head[1])===0xd8&&ord($head[2])===0xff)return'image/jpeg';
    if(substr($head,0,8)==="\x89PNG\r\n\x1a\n")return'image/png';
    if(substr($head,0,4)==='RIFF'&&substr($head,8,4)==='WEBP')return'image/webp';
    return null;
}
function bbs_card_app_url(): string {
    global $config; $configured=rtrim((string)($config['public_app_url']??''),'/'); if($configured!=='')return preg_replace('/#.*$/','',$configured);
    $https=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off');$scheme=$https?'https':'http';$host=(string)($_SERVER['HTTP_HOST']??'localhost');$script=str_replace('\\','/',(string)($_SERVER['SCRIPT_NAME']??'/api/index.php'));$root=rtrim(dirname(dirname($script)),'/');return $scheme.'://'.$host.$root.'/index.html';
}
function bbs_card_payload(array $employee,array $template,string $token): array {
    return ['employeeId'=>(string)$employee['EmployeeID'],'employeeName'=>(string)($employee['EmployeeName']??''),'department'=>(string)($employee['Department']??''),'unit'=>(string)($employee['Unit']??''),'position'=>(string)($employee['Position']??''),'bbsLevel'=>(string)($employee['BBSLevel']??''),'photoUrl'=>'','templateId'=>(int)$template['id'],'templateName'=>(string)$template['TemplateName'],'widthMM'=>(float)($template['WidthMM']??85.60),'heightMM'=>(float)($template['HeightMM']??53.98),'includeEmployeeId'=>(int)($template['IncludeEmployeeID']??1)===1,'qrUrl'=>bbs_card_app_url().'#bbs-qr='.$token];
}
function bbs_card_employees(array $ids, ?PDO $pdo=null): array {
    if(!$ids)return[];$pdo=$pdo?:db();$marks=implode(',',array_fill(0,count($ids),'?'));$stmt=$pdo->prepare("SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,md.id DepartmentID FROM employees e LEFT JOIN master_departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) LEFT JOIN master_positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 WHERE e.EmployeeID IN ($marks)");$stmt->execute($ids);return$stmt->fetchAll()?:[];
}
function bbs_card_template_matches(array $template,array $employee): bool { return (empty($template['DepartmentID'])||(int)$template['DepartmentID']===(int)($employee['DepartmentID']??0))&&(empty($template['BBSLevel'])||(string)$template['BBSLevel']===(string)($employee['BBSLevel']??'')); }
