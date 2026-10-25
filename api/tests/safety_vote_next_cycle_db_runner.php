<?php
declare(strict_types=1);

require_once __DIR__.'/../bootstrap.php';
require_once __DIR__.'/../lib/safety_vote_phase1.php';
require_once __DIR__.'/../lib/safety_vote_next_cycle.php';

$host=strtolower(trim((string)($config['db_host']??'')));
if(!in_array($host,['localhost','127.0.0.1','::1'],true)){
    fwrite(STDERR,"Refusing non-local database\n");
    exit(2);
}

$pdo=db();
$pdo->beginTransaction();
try{
    $campaign=db_row("SELECT c.*,rs.ResultHash FROM SafetyVote_Campaigns c LEFT JOIN SafetyVote_ResultSnapshots rs ON rs.CampaignVersionID=c.CurrentVersionID AND rs.Status='Published' WHERE c.id=4 ORDER BY rs.SnapshotNo DESC LIMIT 1 FOR UPDATE");
    $draft=$campaign?db_row("SELECT * FROM SafetyVote_CampaignVersions WHERE CampaignID=? AND Status='Draft' AND id<>? ORDER BY VersionNo DESC LIMIT 1 FOR UPDATE",[(int)$campaign['id'],(int)$campaign['CurrentVersionID']]):null;
    if(!$campaign||!$draft)throw new RuntimeException('Local completed-campaign Draft fixture is unavailable.');
    $before=['current'=>(int)$campaign['CurrentVersionID'],'status'=>(string)$campaign['Status'],'hash'=>$campaign['ResultHash']??null];
    $result=sv_next_cycle_create($pdo,$campaign,$draft,'PHASE23_PHP_UAT');
    $source=db_row('SELECT CurrentVersionID,Status FROM SafetyVote_Campaigns WHERE id=?',[(int)$campaign['id']]);
    $hash=db_row("SELECT ResultHash FROM SafetyVote_ResultSnapshots WHERE CampaignVersionID=? AND Status='Published' ORDER BY SnapshotNo DESC LIMIT 1",[$before['current']]);
    if((int)$source['CurrentVersionID']!==$before['current']||(string)$source['Status']!==$before['status']||($hash['ResultHash']??null)!==$before['hash'])throw new RuntimeException('Source campaign or published result changed.');
    if((int)$result['targetCampaignId']===(int)$campaign['id']||empty($result['sourceCampaignPreserved'])||empty($result['sourceResultHashPreserved']))throw new RuntimeException('Next-cycle preservation contract failed.');
    $pdo->rollBack();
    echo json_encode(['success'=>true,'contract'=>$result['contract'],'sourcePreserved'=>true,'transactionRolledBack'=>true],JSON_UNESCAPED_SLASHES);
}catch(Throwable $error){
    if($pdo->inTransaction())$pdo->rollBack();
    fwrite(STDERR,$error->getMessage()."\n");
    exit(1);
}
