'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { createOnboardingResolver, ONBOARDING_STATUS } = require('../utils/onboarding-resolver');
const rules = require('../services/safety-vote-phase1');
const phase2 = require('../services/safety-vote-phase2');
const campaignGovernance = require('../services/safety-vote-campaign-governance');
const resultFinalization = require('../services/safety-vote-result-finalization');

const router = express.Router();
const privateDir = path.join(__dirname, '..', 'private-uploads', 'safety-vote');
fs.mkdirSync(privateDir, { recursive: true });
const REQUIRED_TABLES = ['SafetyVote_Settings','SafetyVote_Campaigns','SafetyVote_CampaignVersions','SafetyVote_Stages','SafetyVote_EligibilityRules','SafetyVote_EligibilitySnapshots','SafetyVote_EligibleVoters','SafetyVote_CampaignRoles','SafetyVote_Files','SafetyVote_AuditLogs','SafetyVote_Questions','SafetyVote_Options','SafetyVote_Candidates','SafetyVote_Participation','SafetyVote_Ballots','SafetyVote_BallotIdentities','SafetyVote_BallotAnswers','SafetyVote_RequestKeys','SafetyVote_Submissions','SafetyVote_Nominations','SafetyVote_JuryCriteria','SafetyVote_JuryAssignments','SafetyVote_JuryScores','SafetyVote_ResultSnapshots','SafetyVote_ResultRows','SafetyVote_Certifications','SafetyVote_StageAdvancements','SafetyVote_Reports','SafetyVote_ExportJobs','SafetyVote_Notifications','SafetyVote_NotificationDeliveries','SafetyVote_CampaignPurgeLog'];
const SCHEMA_VERSION = '2026-10-08-phase5-r1';
const VERSION_SHAPE = {
    media: ['ParentVersionID','ChangeReason'],
    live: ['LiveLeaderboardEnabled','LiveLeaderboardTopN','LiveLeaderboardScoreMode','LiveLeaderboardVisibility','LiveLeaderboardRefreshSeconds','LiveLeaderboardPrivacyThreshold'],
    attempts: ['MaxParticipationAttempts'],
    eligibility: ['EligibilityEnrollmentMode','EligibilityEnrollmentUpdatedAt','EligibilityEnrollmentUpdatedBy'],
};
const PERMISSIONS = ['SAFETY_VOTE_VIEW','SAFETY_VOTE_CREATE','SAFETY_VOTE_MANAGE','SAFETY_VOTE_ELIGIBILITY_MANAGE','SAFETY_VOTE_SUBMISSION_REVIEW','SAFETY_VOTE_JURY','SAFETY_VOTE_RESULT_VIEW','SAFETY_VOTE_CERTIFY','SAFETY_VOTE_EXPORT','SAFETY_VOTE_AUDIT_VIEW','SAFETY_VOTE_ADMIN'];

const upload = multer({
    storage: multer.diskStorage({ destination: (_req,_file,cb)=>cb(null,privateDir), filename: (_req,file,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(18).toString('hex')}${({ 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','application/pdf':'.pdf' })[file.mimetype]||''}`) }),
    limits: { fileSize: 10*1024*1024, files: 1 },
    fileFilter: (_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype)),
});

function actor(req){return String(req.user?.id||req.user?.EmployeeID||'').trim();}
function role(req){return String(req.user?.role||req.user?.Role||'').trim().toUpperCase();}
function removeFile(file){if(!file)return;fs.unlink(path.join(privateDir,path.basename(file)),()=>{});}
function verifiedMime(file){const head=fs.readFileSync(file).subarray(0,16),ascii=head.toString('ascii');if(head[0]===0xff&&head[1]===0xd8&&head[2]===0xff)return'image/jpeg';if(head.length>=8&&head.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(ascii.slice(0,4)==='RIFF'&&ascii.slice(8,12)==='WEBP')return'image/webp';if(ascii.slice(0,5)==='%PDF-')return'application/pdf';return null;}
function privateDisk(storedName){const disk=path.join(privateDir,path.basename(String(storedName||'')));return disk.startsWith(privateDir)&&fs.existsSync(disk)?disk:null;}
async function resolvePrivateDisk(file){
    if(String(file.StoredName||'')!==path.basename(String(file.StoredName||'')))return null;
    const direct=privateDisk(file.StoredName);
    if(direct)return direct;
    const sha=String(file.ContentSha256||'').toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(sha))return null;
    const[aliases]=await db.query("SELECT StoredName FROM SafetyVote_Files WHERE Status='Active' AND ContentSha256=? AND MimeType=? AND FileSize=? AND id<>? ORDER BY id",[sha,file.MimeType,Number(file.FileSize||0),Number(file.id)]);
    for(const alias of aliases){const disk=privateDisk(alias.StoredName);if(disk)return disk;}
    return null;
}
async function cloneOptionImages(connection, sourceVersionId, targetCampaignId, targetVersionId, uploadedBy) {
    const [files] = await connection.query(`SELECT DISTINCT f.*
        FROM SafetyVote_Options o
        JOIN SafetyVote_Questions q ON q.id=o.QuestionID
        JOIN SafetyVote_Files f ON f.id=o.FileID AND f.Status='Active'
        WHERE q.CampaignVersionID=? AND q.Status='Active' AND o.Status='Active' AND o.FileID IS NOT NULL
        ORDER BY f.id`, [sourceVersionId]);
    const copied = new Map();
    for (const file of files) {
        const disk = await resolvePrivateDisk(file);
        if (!disk || verifiedMime(disk) !== file.MimeType) throw Object.assign(new Error('A source option image is unavailable.'), { code: 'SOURCE_OPTION_IMAGE_UNAVAILABLE' });
        const actual = crypto.createHash('sha256').update(fs.readFileSync(disk)).digest('hex');
        if (actual !== String(file.ContentSha256 || '').toLowerCase()) throw Object.assign(new Error('A source option image failed integrity verification.'), { code: 'SOURCE_OPTION_IMAGE_UNAVAILABLE' });
        const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[file.MimeType];
        if (!extension) throw Object.assign(new Error('A source option image has an unsupported type.'), { code: 'SOURCE_OPTION_IMAGE_UNAVAILABLE' });
        const storedName = `${Date.now()}-${crypto.randomBytes(18).toString('hex')}${extension}`;
        const target = path.join(privateDir, storedName);
        fs.copyFileSync(disk, target, fs.constants.COPYFILE_EXCL);
        let created;
        try {
            [created] = await connection.query('INSERT INTO SafetyVote_Files(CampaignID,CampaignVersionID,FilePurpose,StoredName,OriginalName,MimeType,FileSize,ContentSha256,UploadedBy) VALUES(?,?,?,?,?,?,?,?,?)', [targetCampaignId,targetVersionId,'option_image',storedName,file.OriginalName,file.MimeType,file.FileSize,file.ContentSha256,uploadedBy]);
        } catch (error) {
            fs.rmSync(target, { force: true });
            throw error;
        }
        copied.set(Number(file.id), Number(created.insertId));
    }
    for (const [sourceFileId, targetFileId] of copied) {
        await connection.query(`UPDATE SafetyVote_Options target
            JOIN SafetyVote_Questions targetQuestion ON targetQuestion.id=target.QuestionID AND targetQuestion.CampaignVersionID=?
            JOIN SafetyVote_Questions sourceQuestion ON sourceQuestion.CampaignVersionID=? AND sourceQuestion.QuestionCode=targetQuestion.QuestionCode
            JOIN SafetyVote_Options source ON source.QuestionID=sourceQuestion.id AND source.OptionCode=target.OptionCode
            SET target.FileID=? WHERE source.FileID=?`, [targetVersionId,sourceVersionId,targetFileId,sourceFileId]);
    }
    return copied.size;
}
function error(res,status,code,message,details){return res.status(status).json({success:false,code,message,...(details?{details}:{})});}
function securityHeaders(_req,res,next){
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('Pragma','no-cache');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    return next();
}
router.use(securityHeaders);

async function reconcileDueCampaignClosures() {
    const connection = await db.getConnection();
    const changed = [];
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(`SELECT c.id,c.CurrentVersionID,c.CampaignCode,v.CloseAt
            FROM SafetyVote_Campaigns c
            JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID
            WHERE c.Status='Open'
              AND COALESCE(v.CloseAt,c.ScheduledCloseAt) IS NOT NULL
              AND COALESCE(v.CloseAt,c.ScheduledCloseAt)<=NOW()
            ORDER BY c.id
            LIMIT 100
            FOR UPDATE`);
        for (const row of rows) {
            const [result] = await connection.query("UPDATE SafetyVote_Campaigns SET Status='Closed',ClosedAt=COALESCE(ClosedAt,NOW()),UpdatedBy='SYSTEM_SCHEDULE',RowVersion=RowVersion+1 WHERE id=? AND Status='Open'", [row.id]);
            if (!result.affectedRows) continue;
            await connection.query("UPDATE SafetyVote_CampaignVersions SET Status='Closed',UpdatedBy='SYSTEM_SCHEDULE',RowVersion=RowVersion+1 WHERE id=? AND Status IN ('Frozen','Open')", [row.CurrentVersionID]);
            await connection.query("INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson) VALUES(?,?,'SYSTEM_SCHEDULE','SYSTEM','SAFETY_VOTE_SCHEDULE_CLOSE','SafetyVote_Campaign',?,200,'Scheduled close reconciled automatically',?)", [row.id,row.CurrentVersionID,String(row.id),JSON.stringify({ campaignCode: row.CampaignCode, closeAt: row.CloseAt, trigger: 'authenticated_request_guard' })]);
            changed.push({ id: Number(row.id), versionId: Number(row.CurrentVersionID), status: 'Closed' });
        }
        await connection.commit();
        for (const item of changed) {
            const finalization = await db.getConnection();
            try {
                await finalization.beginTransaction();
                item.resultFinalization = await resultFinalization.finalizePopularVote(finalization, item.id, 'SYSTEM_SCHEDULE', 'authenticated_request_guard');
                await finalization.commit();
            } catch (finalizationError) {
                await finalization.rollback().catch(() => {});
                item.resultFinalization = { status: 'failed', code: finalizationError.code || 'RESULT_FINALIZATION_FAILED' };
                console.error('[safety-vote] automatic result finalization failed', { campaignId: item.id, code: finalizationError.code || null });
            } finally {
                finalization.release();
            }
        }
        return changed;
    } catch (error) {
        await connection.rollback().catch(() => {});
        throw error;
    } finally {
        connection.release();
    }
}

router.use(async (req, res, next) => {
    if (req.method === 'GET' && req.path === '/admin/health') return next();
    try {
        res.locals.safetyVoteDueClosures = await reconcileDueCampaignClosures();
        return next();
    } catch (reconcileError) {
        console.error('[safety-vote] due closure reconciliation failed', { code: reconcileError.code || null });
        return error(res, 503, 'SAFETY_VOTE_SCHEDULE_RECONCILIATION_FAILED', 'Unable to reconcile due campaign closures safely.');
    }
});

async function schemaHealth(queryable=db){
    const [rows]=await queryable.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${REQUIRED_TABLES.map(()=>'?').join(',')})`,REQUIRED_TABLES);
    const found=new Set(rows.map(row=>String(row.TABLE_NAME).toLowerCase()));
    const missing=REQUIRED_TABLES.filter(name=>!found.has(name.toLowerCase()));
    if(missing.length)return{ready:false,missing,contractVersion:rules.CONTRACT_VERSION,schemaVersion:null,moduleEnabled:false,visibilityContract:rules.campaignVisibilityContract({},false),capabilities:{questionImages:false,candidateSubmissionGallery:false,juryWorkItems:false,atomicMedia:false,companyWideCampaignVisibility:false}};
    const [settings]=await queryable.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('contract_version','schema_version','module_enabled','company_wide_campaign_visibility_contract','company_wide_campaign_visibility_enabled','jury_work_items_contract','atomic_media_contract')");
    const [versionColumns]=await queryable.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions'");
    const [questionImageColumns]=await queryable.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_Questions' AND COLUMN_NAME IN ('ImageFileID','ImageAltText')");
    const [galleryTables]=await queryable.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_GalleryItems'");
    const [mediaMutationTables]=await queryable.query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_MediaMutations'");
    const [candidateWorkColumns]=await queryable.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_Candidates' AND COLUMN_NAME IN ('SourceType','SourceCampaignID','SourceCandidateID')");
    const map=Object.fromEntries(settings.map(row=>[row.SettingKey,String(row.SettingValue)]));
    const moduleEnabled=map.module_enabled==='1',companyWideEnabled=map.company_wide_campaign_visibility_enabled==='1'&&map.company_wide_campaign_visibility_contract===rules.VISIBILITY_CONTRACT_VERSION,questionImagesReady=new Set(questionImageColumns.map(row=>String(row.COLUMN_NAME).toLowerCase())).size===2,candidateSubmissionGalleryReady=galleryTables.length===1,juryWorkItemsReady=candidateWorkColumns.length===3&&map.jury_work_items_contract==='2026-10-25-jury-work-items-r1',atomicMediaReady=mediaMutationTables.length===1&&map.atomic_media_contract==='2026-10-25-atomic-media-r1',schemaReady=['2026-10-15-live-results-r1','2026-10-16-participation-attempts-r1','2026-10-16-campaign-governance-r1','2026-10-20-eligibility-amendments-r1','2026-10-24-question-images-r1','2026-10-24-candidate-submission-gallery-r1','2026-10-25-official-topn-next-cycle-r1','2026-10-25-result-release-policy-r1','2026-10-25-jury-work-items-atomic-media-r1'].includes(map.schema_version)||(!moduleEnabled&&[SCHEMA_VERSION,'2026-10-08-phase6-r1','2026-10-08-phase7-r1','2026-10-09-phase10.4-r1'].includes(map.schema_version));
    const shapeByVersion={
        '2026-10-09-phase10.4-r1':[...VERSION_SHAPE.media],
        '2026-10-15-live-results-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live],
        '2026-10-16-participation-attempts-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts],
        '2026-10-16-campaign-governance-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts],
        '2026-10-20-eligibility-amendments-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts,...VERSION_SHAPE.eligibility],
        '2026-10-24-question-images-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts,...VERSION_SHAPE.eligibility],
        '2026-10-24-candidate-submission-gallery-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts,...VERSION_SHAPE.eligibility],
        '2026-10-25-official-topn-next-cycle-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts,...VERSION_SHAPE.eligibility,'OfficialResultTopN'],
        '2026-10-25-result-release-policy-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts,...VERSION_SHAPE.eligibility,'OfficialResultTopN','ResultReleasePolicy'],
        '2026-10-25-jury-work-items-atomic-media-r1':[...VERSION_SHAPE.media,...VERSION_SHAPE.live,...VERSION_SHAPE.attempts,...VERSION_SHAPE.eligibility,'OfficialResultTopN','ResultReleasePolicy','WorkSource'],
    },foundColumns=new Set(versionColumns.map(row=>String(row.COLUMN_NAME).toLowerCase())),missingColumns=(shapeByVersion[map.schema_version]||[]).filter(name=>!foundColumns.has(name.toLowerCase())),capabilityShapeReady=map.schema_version!=='2026-10-24-question-images-r1'||questionImagesReady,galleryShapeReady=map.schema_version!=='2026-10-24-candidate-submission-gallery-r1'||(questionImagesReady&&candidateSubmissionGalleryReady);
    return{ready:map.contract_version===rules.CONTRACT_VERSION&&schemaReady&&!missingColumns.length&&capabilityShapeReady&&galleryShapeReady&&(map.schema_version!=='2026-10-25-jury-work-items-atomic-media-r1'||(juryWorkItemsReady&&atomicMediaReady)),missing:[],missingColumns,contractVersion:map.contract_version||null,schemaVersion:map.schema_version||null,moduleEnabled,visibilityContract:rules.campaignVisibilityContract({},companyWideEnabled),capabilities:{questionImages:questionImagesReady,candidateSubmissionGallery:candidateSubmissionGalleryReady,juryWorkItems:juryWorkItemsReady,atomicMedia:atomicMediaReady,companyWideCampaignVisibility:companyWideEnabled}};
}
async function visibilityContractState(queryable=db,lock=false){const[rows]=await queryable.query("SELECT SettingKey,SettingValue FROM SafetyVote_Settings WHERE SettingKey IN ('company_wide_campaign_visibility_contract','company_wide_campaign_visibility_enabled')"+(lock?' FOR UPDATE':''));const map=Object.fromEntries(rows.map(row=>[row.SettingKey,String(row.SettingValue)])),enabled=map.company_wide_campaign_visibility_enabled==='1'&&map.company_wide_campaign_visibility_contract===rules.VISIBILITY_CONTRACT_VERSION;return rules.campaignVisibilityContract({},enabled);}
async function enforceVisibilityContract(req,res,next){
    try{
        const contract=await visibilityContractState();
        req.svVisibilityContract=contract;
        const createsCampaign=req.method==='POST'&&req.path==='/campaigns';
        const updatesDraft=req.method==='PUT'&&/^\/campaigns\/[1-9]\d*$/.test(req.path);
        if(contract.enabled&&(createsCampaign||updatesDraft))req.body={...(req.body||{}),discoveryMode:contract.storageDiscoveryMode};
        return next();
    }catch(e){return error(res,503,'SAFETY_VOTE_VISIBILITY_CONTRACT_UNAVAILABLE','Unable to verify the campaign visibility contract.');}
}
async function requireSchema(req,res,next){try{const health=await schemaHealth();if(!health.ready)return error(res,503,'SAFETY_VOTE_SCHEMA_NOT_READY','Safety Vote schema is not ready.',health);req.safetyVoteHealth=health;next();}catch(e){return error(res,503,'SAFETY_VOTE_SCHEMA_NOT_READY','Unable to verify Safety Vote schema.');}}
function isReadonlyControlRequest(req){return req.method==='GET'&&(req.path==='/admin/health'||/^\/admin\/campaigns\/[1-9]\d*\/release-preflight$/.test(req.path));}
async function operationalGate(req,res,next){if(isReadonlyControlRequest(req))return next();try{const health=await schemaHealth();if(!health.ready)return error(res,503,'SAFETY_VOTE_SCHEMA_NOT_READY','Safety Vote schema is not ready.',health);if(!health.moduleEnabled)return error(res,503,'SAFETY_VOTE_MODULE_DISABLED','Safety Vote is disabled.',health);req.safetyVoteHealth=health;return next();}catch(e){return error(res,503,'SAFETY_VOTE_SCHEMA_NOT_READY','Unable to verify Safety Vote schema.');}}
async function hasPermission(req,permission){if(role(req)==='ADMIN')return true;const id=actor(req);const[[override]]=await db.query('SELECT granted FROM Admin_UserPermissions WHERE employee_id=? AND permission=? LIMIT 1',[id,permission]);if(override)return Number(override.granted)===1;const[[row]]=await db.query('SELECT granted FROM Admin_RolePermissions WHERE UPPER(role)=? AND permission=? LIMIT 1',[role(req),permission]);if(row&&Number(row.granted)===1)return true;const[[admin]]=await db.query('SELECT granted FROM Admin_UserPermissions WHERE employee_id=? AND permission=? LIMIT 1',[id,'SAFETY_VOTE_ADMIN']);return Boolean(admin&&Number(admin.granted)===1);}
async function canReadPrivateFile(req,file){
    if(role(req)==='ADMIN'||await hasPermission(req,'SAFETY_VOTE_MANAGE'))return true;
    try{
        const[[publicWork]]=await db.query("SELECT g.id FROM SafetyVote_GalleryItems g JOIN SafetyVote_Candidates w ON w.id=g.OwnerID AND g.OwnerType='candidate' JOIN SafetyVote_CampaignVersions v ON v.id=w.CampaignVersionID JOIN SafetyVote_Campaigns c ON c.id=v.CampaignID AND c.CurrentVersionID=v.id WHERE g.FileID=? AND g.Status='Active' AND w.Status IN ('Active','Finalist') AND v.CampaignType='jury_scoring' AND c.Status IN ('Scheduled','Open','Closed','Certified','Published') AND c.IsHidden=0 AND c.IsTest=0 LIMIT 1",[file.id]);
        if(publicWork)return true;
    }catch(error){if(!['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code))throw error;}
    if(String(file.FilePurpose||'').toLowerCase()==='candidate_gallery'){
        try{const[[assigned]]=await db.query("SELECT g.id FROM SafetyVote_GalleryItems g JOIN SafetyVote_Candidates c ON c.id=g.OwnerID AND g.OwnerType='candidate' JOIN SafetyVote_JuryAssignments a ON a.CampaignVersionID=c.CampaignVersionID AND a.JurorEmployeeID=? AND a.Status IN ('Draft','Submitted') AND (a.CandidateID IS NULL OR a.CandidateID=c.id) WHERE g.FileID=? AND g.Status='Active' LIMIT 1",[actor(req),file.id]);if(assigned)return true;}catch(error){if(!['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error.code))throw error;}
    }
    const restricted=Boolean(file.SubmissionID||file.QuestionID)||['submission','answer'].includes(String(file.FilePurpose||'').toLowerCase());
    if(restricted){
        if(String(file.UploadedBy||'')===actor(req))return true;
        if(file.SubmissionID&&await hasPermission(req,'SAFETY_VOTE_SUBMISSION_REVIEW'))return true;
        if(file.QuestionID&&await hasPermission(req,'SAFETY_VOTE_EXPORT'))return true;
        return false;
    }
    const[[scope]]=await db.query("SELECT e.id FROM SafetyVote_EligibilitySnapshots s JOIN SafetyVote_EligibleVoters e ON e.SnapshotID=s.id JOIN SafetyVote_Campaigns c ON c.CurrentVersionID=s.CampaignVersionID WHERE c.id=? AND s.Status='frozen' AND e.EmployeeID=? LIMIT 1",[file.CampaignID,actor(req)]);
    return Boolean(scope);
}
function rehearsalProjection(row){return{employeeId:String(row.employeeId),departmentId:row.departmentId??null,safetyUnitId:row.safetyUnitId??null,positionId:row.positionId??null,role:row.role||'',team:row.team||'',accountReady:Boolean(row.accountReady)};}
function eligibilityDiff(baseline,current,limit=100){const before=new Map(baseline.map(row=>[String(row.employeeId),rehearsalProjection(row)])),after=new Map(current.map(row=>[String(row.employeeId),rehearsalProjection(row)])),added=[],removed=[],changed=[];for(const[id,row]of after)if(!before.has(id))added.push(id);else if(JSON.stringify(row)!==JSON.stringify(before.get(id)))changed.push(id);for(const id of before.keys())if(!after.has(id))removed.push(id);for(const rows of[added,removed,changed])rows.sort((a,b)=>a.localeCompare(b));const unchanged=Math.max(0,after.size-added.length-changed.length);return{addedCount:added.length,removedCount:removed.length,changedCount:changed.length,unchangedCount:unchanged,addedEmployeeIds:added.slice(0,limit),removedEmployeeIds:removed.slice(0,limit),changedEmployeeIds:changed.slice(0,limit),truncated:added.length>limit||removed.length>limit||changed.length>limit};}
function permit(permission){return async(req,res,next)=>{try{if(await hasPermission(req,permission))return next();return error(res,403,'PERMISSION_DENIED','Safety Vote permission is required.');}catch(e){return error(res,503,'PERMISSION_CHECK_UNAVAILABLE','Unable to verify Safety Vote permission.');}};}
function permitAll(permissions){return async(req,res,next)=>{try{for(const permission of permissions)if(!await hasPermission(req,permission))return error(res,403,'PERMISSION_DENIED','All permissions required for this Safety Vote action are not granted.',{requiredPermissions:permissions});return next();}catch(e){return error(res,503,'PERMISSION_CHECK_UNAVAILABLE','Unable to verify Safety Vote permissions.');}};}
async function audit(req,action,targetType,targetId,detail,metadata={}){try{await db.query('INSERT INTO SafetyVote_AuditLogs(CampaignID,CampaignVersionID,ActorEmployeeID,ActorRole,Action,TargetType,TargetID,StatusCode,BoundedDetail,MetadataJson,IPAddress,UserAgent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[req.svCampaignId||null,req.svVersionId||null,actor(req),role(req),action,targetType,String(targetId||''),200,rules.clean(detail,1000)||null,JSON.stringify(metadata),req.ip||null,String(req.headers?.['user-agent']||'').slice(0,255)||null]);req.auditLogged=true;}catch(e){console.warn('[safety-vote] audit failed:',e.message);}}

async function masterProjection(queryable=db){
    const [[employees],[departments],[units],[positions]]=await Promise.all([
        queryable.query('SELECT EmployeeID,EmployeeName,Department,Unit,Team,Position,Role,Password,MustChangePassword FROM employees ORDER BY EmployeeID'),
        queryable.query('SELECT id,Name,Status,is_safety_core FROM Master_Departments ORDER BY Name'),
        queryable.query('SELECT id,name,department_id,short_code,sort_order FROM Master_SafetyUnits ORDER BY department_id,sort_order,name'),
        queryable.query('SELECT id,Name FROM Master_Positions ORDER BY Name'),
    ]);
    const resolver=createOnboardingResolver({departments,units});
    const key=value=>String(value??'').trim().replace(/\s+/g,'').toLocaleLowerCase('en-US');
    const dept=new Map(departments.map(row=>[key(row.Name),row]));
    const unit=new Map(units.map(row=>[`${row.department_id}\0${key(row.name)}`,row]));
    const pos=new Map(positions.map(row=>[key(row.Name),row]));
    const rows=employees.map(row=>{const d=dept.get(key(row.Department))||null,u=d?unit.get(`${d.id}\0${key(row.Unit)}`)||null:null,p=pos.get(key(row.Position))||null;let onboardingStatus;try{onboardingStatus=resolver.resolve(row);}catch(e){onboardingStatus=e.code||'UNRESOLVED';}return{employeeId:String(row.EmployeeID),employeeName:row.EmployeeName||'',departmentId:d?Number(d.id):null,departmentName:row.Department||'',safetyUnitId:u?Number(u.id):null,safetyUnitName:row.Unit||'',positionId:p?Number(p.id):null,positionName:row.Position||'',role:row.Role||'',team:row.Team||'',masterPresent:true,accountReady:onboardingStatus===ONBOARDING_STATUS.READY,onboardingStatus,masterWarnings:[!d?'DEPARTMENT_UNRESOLVED':null,d&&!u&&units.some(x=>Number(x.department_id)===Number(d.id))?'SAFETY_UNIT_UNRESOLVED':null,!p?'POSITION_UNRESOLVED':null].filter(Boolean)};});
    return{employees:rows,departments,units,positions};
}
async function campaignRow(id,lock=false,queryable=db){
    const[rows]=await queryable.query(`SELECT c.*,v.VersionNo,v.ContractVersion,v.TemplateKey,v.CampaignType,v.WorkSource,v.PrivacyMode,v.TitleTh,v.TitleEn,v.Summary,v.Description,v.RulesText,v.TimeZone,v.OpenAt,v.CloseAt,v.ResultVisibility,v.OfficialResultTopN,v.ResultReleasePolicy,v.PrivacyThreshold,v.MaxParticipationAttempts,v.LiveLeaderboardEnabled,v.LiveLeaderboardTopN,v.LiveLeaderboardScoreMode,v.LiveLeaderboardVisibility,v.LiveLeaderboardRefreshSeconds,v.LiveLeaderboardPrivacyThreshold,v.EligibilityEnrollmentMode,v.EligibilityEnrollmentUpdatedAt,v.EligibilityEnrollmentUpdatedBy,v.Status VersionStatus,v.RowVersion VersionRowVersion FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID WHERE c.id=?${lock?' FOR UPDATE':''}`,[id]);
    const row=rows[0]||null;
    if(row&&lock){const contract=await visibilityContractState(queryable);if(contract.enabled)row.DiscoveryMode=contract.storageDiscoveryMode;}
    return row;
}
async function governanceUsage(id,versionId,queryable=db){
    const[[row]]=await queryable.query(`SELECT
      (SELECT COUNT(*) FROM SafetyVote_Participation WHERE CampaignID=?) participation,
      (SELECT COUNT(*) FROM SafetyVote_Ballots WHERE CampaignVersionID IN (SELECT id FROM SafetyVote_CampaignVersions WHERE CampaignID=?)) ballots,
      (SELECT COUNT(*) FROM SafetyVote_Submissions WHERE CampaignID=?) submissions,
      (SELECT COUNT(*) FROM SafetyVote_Nominations WHERE CampaignID=?) nominations,
      (SELECT COUNT(*) FROM SafetyVote_JuryScores js JOIN SafetyVote_JuryAssignments ja ON ja.id=js.AssignmentID WHERE ja.CampaignVersionID IN (SELECT id FROM SafetyVote_CampaignVersions WHERE CampaignID=?)) juryScores,
      (SELECT COUNT(*) FROM SafetyVote_ResultSnapshots WHERE CampaignID=?) resultSnapshots,
      (SELECT COUNT(*) FROM SafetyVote_ExportJobs WHERE CampaignID=?) exportJobs,
      (SELECT COUNT(*) FROM SafetyVote_Notifications WHERE CampaignID=?) notifications,
      (SELECT COUNT(*) FROM SafetyVote_IntegrationHandoffs WHERE CampaignID=?) integrationHandoffs,
      (SELECT COUNT(*) FROM SafetyVote_IntegrationSnapshots WHERE CampaignID=?) integrationSnapshots,
      (SELECT COUNT(*) FROM SafetyVote_AcceptanceEvidence WHERE CampaignID=?) acceptanceEvidence,
      (SELECT COUNT(*) FROM SafetyVote_OperationalAlerts WHERE CampaignID=?) operationalAlerts,
      (SELECT COUNT(*) FROM SafetyVote_ResultActions WHERE CampaignID=?) resultActions,
      (SELECT COUNT(*) FROM SafetyVote_CampaignTemplates WHERE SourceCampaignID=?) reusableTemplates,
      (SELECT COUNT(*) FROM SafetyVote_RequestKeys WHERE CampaignVersionID IN (SELECT id FROM SafetyVote_CampaignVersions WHERE CampaignID=?)) requestKeys,
      (SELECT COUNT(*) FROM SafetyVote_Promotions WHERE CampaignID=?) promotions,
      (SELECT COUNT(*) FROM SafetyVote_EngagementCounters WHERE CampaignID=?) engagement,
      (SELECT COUNT(*) FROM SafetyVote_Files WHERE CampaignID=?) files`,[id,id,id,id,id,id,id,id,id,id,id,id,id,id,id,id,id,id]);
    return Object.fromEntries(Object.entries(row||{}).map(([key,value])=>[key,Number(value||0)]));
}

router.get('/admin/health',permit('SAFETY_VOTE_VIEW'),async(req,res)=>{try{const health=await schemaHealth();return res.status(health.ready?200:503).json({success:health.ready,data:health,...(!health.ready?{code:'SAFETY_VOTE_SCHEMA_NOT_READY',message:'Safety Vote schema is not ready.'}:{})});}catch(e){return error(res,503,'SAFETY_VOTE_SCHEMA_NOT_READY','Unable to verify Safety Vote schema.');}});
router.use('/admin',requireSchema);
router.use('/admin',enforceVisibilityContract);
router.get('/admin/permissions',permit('SAFETY_VOTE_VIEW'),async(req,res)=>{const grantedPermissions=[];for(const permission of PERMISSIONS)if(await hasPermission(req,permission))grantedPermissions.push(permission);const duplicateRequired=['SAFETY_VOTE_MANAGE','SAFETY_VOTE_CREATE','SAFETY_VOTE_ELIGIBILITY_MANAGE'];return res.json({success:true,data:{permissions:PERMISSIONS,grantedPermissions,admin:role(req)==='ADMIN',capabilities:{duplicateCampaign:duplicateRequired.every(permission=>grantedPermissions.includes(permission))},requirements:{duplicateCampaign:duplicateRequired}}});});
router.get('/admin/campaigns',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{try{const[rows]=await db.query("SELECT c.id,c.CampaignCode,c.Status,c.OwnerEmployeeID,c.DiscoveryMode,c.IsHidden,c.HiddenAt,c.HideReason,c.IsTest,c.TestMarkedAt,c.TestReason,c.ArchivedAt,c.ArchivedFromStatus,c.ArchiveReason,c.VoidedAt,c.VoidReason,c.RowVersion,c.CreatedAt,c.UpdatedAt,v.VersionNo,v.CampaignType,v.PrivacyMode,v.TitleTh,v.TitleEn,v.ResultVisibility,v.OfficialResultTopN,v.ResultReleasePolicy,v.LiveLeaderboardEnabled,v.LiveLeaderboardTopN,v.LiveLeaderboardScoreMode,v.LiveLeaderboardVisibility,v.LiveLeaderboardRefreshSeconds,v.LiveLeaderboardPrivacyThreshold,v.EligibilityEnrollmentMode,v.EligibilityEnrollmentUpdatedAt,v.EligibilityEnrollmentUpdatedBy,v.RowVersion VersionRowVersion,pending.id PendingDraftVersionID,pending.VersionNo PendingDraftVersionNo,pending.TitleTh PendingDraftTitle FROM SafetyVote_Campaigns c JOIN SafetyVote_CampaignVersions v ON v.id=c.CurrentVersionID LEFT JOIN SafetyVote_CampaignVersions pending ON pending.CampaignID=c.id AND pending.Status='Draft' AND pending.id<>c.CurrentVersionID AND pending.VersionNo=(SELECT MAX(pv.VersionNo) FROM SafetyVote_CampaignVersions pv WHERE pv.CampaignID=c.id AND pv.Status='Draft' AND pv.id<>c.CurrentVersionID) ORDER BY c.UpdatedAt DESC,c.id DESC LIMIT 250");res.json({success:true,data:{rows,total:rows.length,visibilityContract:await visibilityContractState(),scheduleReconciled:res.locals.safetyVoteDueClosures||[]}});}catch(e){return error(res,500,'SAFETY_VOTE_READ_FAILED','Unable to load campaigns.');}});
router.post('/admin/campaigns',permit('SAFETY_VOTE_CREATE'),async(req,res)=>{const parsed=rules.normalizeCampaign(req.body||{},{requireCampaignCode:false});if(!parsed.ok)return error(res,400,'VALIDATION_FAILED','Campaign validation failed.',parsed.errors);const v=parsed.value,year=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric'}).format(new Date()));for(let attempt=0;attempt<5;attempt++){const connection=await db.getConnection();try{await connection.beginTransaction();const[[last]]=await connection.query("SELECT MAX(CAST(SUBSTRING(CampaignCode,5,3) AS UNSIGNED)) sequenceNo FROM SafetyVote_Campaigns WHERE CampaignCode REGEXP ? FOR UPDATE",[`^SHE-[0-9]{3}-${year}$`]),campaignCode=rules.formatCampaignCode(Number(last.sequenceNo||0)+1,year);if(!campaignCode){await connection.rollback();return error(res,409,'CAMPAIGN_CODE_EXHAUSTED','The annual campaign code range is exhausted.');}const[created]=await connection.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES(?,'Draft',?,?,?,?,?,?)",[campaignCode,actor(req),v.discoveryMode,v.openAt,v.closeAt,actor(req),actor(req)]);const id=Number(created.insertId);const[version]=await connection.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,TemplateKey,CampaignType,PrivacyMode,TitleTh,TitleEn,Summary,Description,RulesText,OpenAt,CloseAt,ResultVisibility,OfficialResultTopN,ResultReleasePolicy,PrivacyThreshold,MaxParticipationAttempts,LiveLeaderboardEnabled,LiveLeaderboardTopN,LiveLeaderboardScoreMode,LiveLeaderboardVisibility,LiveLeaderboardRefreshSeconds,LiveLeaderboardPrivacyThreshold,CreatedBy,UpdatedBy) VALUES(?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[id,rules.CONTRACT_VERSION,v.templateKey,v.campaignType,v.privacyMode,v.titleTh,v.titleEn,v.summary,v.description,v.rulesText,v.openAt,v.closeAt,v.resultVisibility,v.officialResultTopN,v.resultReleasePolicy,v.privacyThreshold,v.maxParticipationAttempts,v.liveLeaderboardEnabled?1:0,v.liveLeaderboardTopN,v.liveLeaderboardScoreMode,v.liveLeaderboardVisibility,v.liveLeaderboardRefreshSeconds,v.liveLeaderboardPrivacyThreshold,actor(req),actor(req)]);await connection.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?',[version.insertId,id]);await connection.commit();req.svCampaignId=id;req.svVersionId=Number(version.insertId);await audit(req,'SAFETY_VOTE_CAMPAIGN_CREATE','SafetyVote_Campaign',id,`code=${campaignCode}; type=${v.campaignType}`,{campaignCodeGenerated:true,campaignCodeYear:year,maxParticipationAttempts:v.maxParticipationAttempts,officialResultTopN:v.officialResultTopN,resultReleasePolicy:v.resultReleasePolicy});return res.status(201).json({success:true,data:await campaignRow(id)});}catch(e){await connection.rollback().catch(()=>{});if(e.code==='ER_DUP_ENTRY'&&attempt<4)continue;console.error('[safety-vote] campaign create failed',{code:e.code||null,errno:e.errno||null,sqlState:e.sqlState||null,message:e.message||String(e)});return error(res,500,e.code==='ER_DUP_ENTRY'?'CAMPAIGN_CODE_ALLOCATION_FAILED':'SAFETY_VOTE_CREATE_FAILED','Unable to create campaign.');}finally{connection.release();}}});
router.post('/admin/campaigns/:id/duplicate',permitAll(['SAFETY_VOTE_MANAGE','SAFETY_VOTE_CREATE','SAFETY_VOTE_ELIGIBILITY_MANAGE']),async(req,res)=>{const sourceId=rules.positiveInt(req.params.id),year=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric'}).format(new Date()));if(!sourceId)return error(res,400,'VALIDATION_FAILED','Valid source campaign ID is required.');for(let attempt=0;attempt<5;attempt++){const connection=await db.getConnection();try{await connection.beginTransaction();const source=await campaignRow(sourceId,true,connection);if(!source||source.Status==='Voided'){await connection.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Source campaign was not found.');}const[[last]]=await connection.query("SELECT MAX(CAST(SUBSTRING(CampaignCode,5,3) AS UNSIGNED)) sequenceNo FROM SafetyVote_Campaigns WHERE CampaignCode REGEXP ? FOR UPDATE",[`^SHE-[0-9]{3}-${year}$`]),campaignCode=rules.formatCampaignCode(Number(last.sequenceNo||0)+1,year);if(!campaignCode){await connection.rollback();return error(res,409,'CAMPAIGN_CODE_EXHAUSTED','The annual campaign code range is exhausted.');}const title=`${String(source.TitleTh||source.CampaignCode).trim()} (สำเนา)`.slice(0,200);const[created]=await connection.query("INSERT INTO SafetyVote_Campaigns(CampaignCode,Status,OwnerEmployeeID,DiscoveryMode,ScheduledOpenAt,ScheduledCloseAt,CreatedBy,UpdatedBy) VALUES(?,'Draft',?,?,NULL,NULL,?,?)",[campaignCode,actor(req),source.DiscoveryMode||'eligible_only',actor(req),actor(req)]);const id=Number(created.insertId);const[version]=await connection.query("INSERT INTO SafetyVote_CampaignVersions(CampaignID,VersionNo,ContractVersion,TemplateKey,CampaignType,PrivacyMode,TitleTh,TitleEn,Summary,Description,RulesText,TimeZone,OpenAt,CloseAt,ResultVisibility,OfficialResultTopN,ResultReleasePolicy,PrivacyThreshold,MaxParticipationAttempts,LiveLeaderboardEnabled,LiveLeaderboardTopN,LiveLeaderboardScoreMode,LiveLeaderboardVisibility,LiveLeaderboardRefreshSeconds,LiveLeaderboardPrivacyThreshold,EditPolicy,ScoringMethod,ScoringConfigJson,TieBreakRule,QuorumRuleJson,AllowAbstain,RandomizeOptions,Status,CreatedBy,UpdatedBy) SELECT ?,1,?,'config_copy',CampaignType,PrivacyMode,?,TitleEn,Summary,Description,RulesText,TimeZone,NULL,NULL,ResultVisibility,OfficialResultTopN,ResultReleasePolicy,PrivacyThreshold,MaxParticipationAttempts,LiveLeaderboardEnabled,LiveLeaderboardTopN,LiveLeaderboardScoreMode,LiveLeaderboardVisibility,LiveLeaderboardRefreshSeconds,LiveLeaderboardPrivacyThreshold,EditPolicy,ScoringMethod,ScoringConfigJson,TieBreakRule,QuorumRuleJson,AllowAbstain,RandomizeOptions,'Draft',?,? FROM SafetyVote_CampaignVersions WHERE id=?",[id,rules.CONTRACT_VERSION,title,actor(req),actor(req),source.CurrentVersionID]);const versionId=Number(version.insertId);await connection.query('UPDATE SafetyVote_Campaigns SET CurrentVersionID=? WHERE id=?',[versionId,id]);await connection.query("INSERT INTO SafetyVote_Questions(CampaignVersionID,QuestionCode,QuestionType,Title,HelpText,IsRequired,MinSelections,MaxSelections,RandomizeOptions,AllowComment,ValidationJson,DisplayConditionJson,ResultVisibility,SortOrder,Status,CreatedBy,UpdatedBy) SELECT ?,QuestionCode,QuestionType,Title,HelpText,IsRequired,MinSelections,MaxSelections,RandomizeOptions,AllowComment,ValidationJson,DisplayConditionJson,ResultVisibility,SortOrder,Status,?,? FROM SafetyVote_Questions WHERE CampaignVersionID=? AND Status='Active'",[versionId,actor(req),actor(req),source.CurrentVersionID]);await connection.query("INSERT INTO SafetyVote_Options(QuestionID,OptionCode,Label,Description,ScoreValue,IsAbstain,FileID,SortOrder,Status,CreatedBy,UpdatedBy) SELECT nq.id,o.OptionCode,o.Label,o.Description,o.ScoreValue,o.IsAbstain,NULL,o.SortOrder,o.Status,?,? FROM SafetyVote_Options o JOIN SafetyVote_Questions oq ON oq.id=o.QuestionID JOIN SafetyVote_Questions nq ON nq.CampaignVersionID=? AND nq.QuestionCode=oq.QuestionCode WHERE oq.CampaignVersionID=? AND oq.Status='Active' AND o.Status='Active'",[actor(req),actor(req),versionId,source.CurrentVersionID]);const copiedOptionImages=await cloneOptionImages(connection,source.CurrentVersionID,id,versionId,actor(req));await connection.query("INSERT INTO SafetyVote_EligibilityRules(CampaignVersionID,RuleGroup,RuleOrder,Effect,AttributeKey,Operator,ValuesJson,Reason,IsActive,CreatedBy,UpdatedBy) SELECT ?,RuleGroup,RuleOrder,Effect,AttributeKey,Operator,ValuesJson,Reason,IsActive,?,? FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? AND IsActive=1 AND LOWER(AttributeKey) NOT IN ('employee','employee_id','employeeid')",[versionId,actor(req),actor(req),source.CurrentVersionID]);await connection.commit();req.svCampaignId=id;req.svVersionId=versionId;const excluded=['nonOptionFiles','media','frozenEligibility','eligibleVoters','roles','participation','ballots','answers','candidates','jury','results','certifications','notifications'];await audit(req,'SAFETY_VOTE_CAMPAIGN_DUPLICATE','SafetyVote_Campaign',id,`source=${sourceId}; code=${campaignCode}; optionImages=${copiedOptionImages}`,{sourceCampaignId:sourceId,sourceCampaignCode:source.CampaignCode,copiedOptionImages,excluded});return res.status(201).json({success:true,data:{...(await campaignRow(id)),sourceCampaignId:sourceId,copiedOptionImages,excluded}});}catch(e){await connection.rollback().catch(()=>{});if(e.code==='ER_DUP_ENTRY'&&attempt<4)continue;const unavailable=e.code==='SOURCE_OPTION_IMAGE_UNAVAILABLE';return error(res,unavailable?409:500,unavailable?'SOURCE_OPTION_IMAGE_UNAVAILABLE':e.code==='ER_DUP_ENTRY'?'CAMPAIGN_CODE_ALLOCATION_FAILED':'CAMPAIGN_DUPLICATE_FAILED',unavailable?e.message:'Unable to duplicate campaign safely.');}finally{connection.release();}}});
router.get('/admin/campaigns/:id',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{const id=rules.positiveInt(req.params.id);if(!id)return error(res,400,'VALIDATION_FAILED','Valid campaign ID is required.');try{const row=await campaignRow(id);if(!row)return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');const[rulesRows]=await db.query('SELECT * FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? ORDER BY RuleGroup,RuleOrder,id',[row.CurrentVersionID]);res.json({success:true,data:{campaign:row,eligibilityRules:rulesRows.map(r=>({...r,values:JSON.parse(r.ValuesJson||'[]')}))}});}catch(e){return error(res,500,'SAFETY_VOTE_READ_FAILED','Unable to load campaign.');}});
router.put('/admin/campaigns/:id',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{const id=rules.positiveInt(req.params.id),expected=rules.positiveInt(req.body?.rowVersion);if(!id||!expected)return error(res,400,'VALIDATION_FAILED','Campaign ID and rowVersion are required.');const parsed=rules.normalizeCampaign(req.body||{});if(!parsed.ok)return error(res,400,'VALIDATION_FAILED','Campaign validation failed.',parsed.errors);const v=parsed.value,connection=await db.getConnection();try{await connection.beginTransaction();const row=await campaignRow(id,true,connection);if(!row){await connection.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');}if(row.Status!=='Draft'||row.VersionStatus!=='Draft'){await connection.rollback();return error(res,409,'CAMPAIGN_STATE_CONFLICT','Only Draft campaigns can be edited.');}if(Number(row.RowVersion)!==expected){await connection.rollback();return error(res,409,'VERSION_CONFLICT','Campaign changed. Reload before saving.');}if(v.campaignCode!==row.CampaignCode){await connection.rollback();return error(res,409,'CAMPAIGN_CODE_IMMUTABLE','The generated campaign code cannot be changed.');}await connection.query('UPDATE SafetyVote_Campaigns SET DiscoveryMode=?,ScheduledOpenAt=?,ScheduledCloseAt=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?',[v.discoveryMode,v.openAt,v.closeAt,actor(req),id]);await connection.query('UPDATE SafetyVote_CampaignVersions SET TemplateKey=?,CampaignType=?,PrivacyMode=?,TitleTh=?,TitleEn=?,Summary=?,Description=?,RulesText=?,OpenAt=?,CloseAt=?,ResultVisibility=?,PrivacyThreshold=?,MaxParticipationAttempts=?,LiveLeaderboardEnabled=?,LiveLeaderboardTopN=?,LiveLeaderboardScoreMode=?,LiveLeaderboardVisibility=?,LiveLeaderboardRefreshSeconds=?,LiveLeaderboardPrivacyThreshold=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?',[v.templateKey,v.campaignType,v.privacyMode,v.titleTh,v.titleEn,v.summary,v.description,v.rulesText,v.openAt,v.closeAt,v.resultVisibility,v.privacyThreshold,v.maxParticipationAttempts,v.liveLeaderboardEnabled?1:0,v.liveLeaderboardTopN,v.liveLeaderboardScoreMode,v.liveLeaderboardVisibility,v.liveLeaderboardRefreshSeconds,v.liveLeaderboardPrivacyThreshold,actor(req),row.CurrentVersionID]);await connection.commit();req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,'SAFETY_VOTE_CAMPAIGN_UPDATE','SafetyVote_Campaign',id,`code=${row.CampaignCode}`,{maxParticipationAttempts:v.maxParticipationAttempts});res.json({success:true,data:await campaignRow(id)});}catch(e){await connection.rollback().catch(()=>{});return error(res,500,'SAFETY_VOTE_UPDATE_FAILED','Unable to update campaign.');}finally{connection.release();}});

router.delete('/admin/campaigns/:id',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{
    const id=rules.positiveInt(req.params.id),reason=rules.clean(req.body?.reason,500);
    if(!id||!reason)return error(res,400,'VALIDATION_FAILED','Campaign ID and void reason are required.');
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        const row=await campaignRow(id,true,connection);
        if(!row){await connection.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');}
        if(row.Status!=='Draft'||row.VersionStatus!=='Draft'){await connection.rollback();return error(res,409,'CAMPAIGN_STATE_CONFLICT','Only Draft campaigns can be voided.');}
        await connection.query("UPDATE SafetyVote_Campaigns SET Status='Voided',VoidedAt=NOW(),VoidedBy=?,VoidReason=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?",[actor(req),reason,actor(req),id]);
        await connection.query("UPDATE SafetyVote_CampaignVersions SET Status='Voided',UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?",[actor(req),row.CurrentVersionID]);
        await connection.commit();req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;
        await audit(req,'SAFETY_VOTE_CAMPAIGN_VOID','SafetyVote_Campaign',id,reason);
        return res.json({success:true,data:{id,status:'Voided'}});
    }catch(e){await connection.rollback().catch(()=>{});return error(res,500,'SAFETY_VOTE_VOID_FAILED','Unable to void campaign.');}finally{connection.release();}
});

router.get('/admin/campaigns/:id/governance-policy',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{
    const id=rules.positiveInt(req.params.id);if(!id)return error(res,400,'VALIDATION_FAILED','Valid campaign ID is required.');
    try{const row=await campaignRow(id);if(!row)return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');const usage=await governanceUsage(id,row.CurrentVersionID);return res.json({success:true,data:{campaign:row,usage,capabilities:campaignGovernance.capabilities(row,usage),purgeConfirmation:row.TitleTh}});}catch(e){return error(res,500,'CAMPAIGN_GOVERNANCE_READ_FAILED','Unable to load campaign governance policy.');}
});

router.post('/admin/campaigns/:id/governance/:action',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{
    const id=rules.positiveInt(req.params.id),action=String(req.params.action||'').toLowerCase(),reason=rules.clean(req.body?.reason,500),expected=rules.positiveInt(req.body?.rowVersion);
    if(!id||!['hide','unhide','mark-test','unmark-test','archive','restore','void','purge'].includes(action))return error(res,400,'VALIDATION_FAILED','Supported campaign governance action is required.');
    if(!expected)return error(res,400,'VALIDATION_FAILED','rowVersion is required.');
    if(!['unhide','unmark-test','restore'].includes(action)&&(!reason||reason.length<10))return error(res,400,'VALIDATION_FAILED','A reason of at least 10 characters is required.');
    if(['mark-test','unmark-test','purge'].includes(action)&&!(await hasPermission(req,'SAFETY_VOTE_ADMIN')))return error(res,403,'PERMISSION_DENIED','Safety Vote Admin permission is required.');
    const cx=await db.getConnection();
    try{
        await cx.beginTransaction();const row=await campaignRow(id,true,cx);if(!row){await cx.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');}
        if(Number(row.RowVersion)!==expected){await cx.rollback();return error(res,409,'VERSION_CONFLICT','Campaign changed. Reload before continuing.');}
        const usage=await governanceUsage(id,row.CurrentVersionID,cx),caps=campaignGovernance.capabilities(row,usage),key=action.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
        if(!caps[key]){await cx.rollback();return error(res,409,'CAMPAIGN_GOVERNANCE_BLOCKED','This action is blocked by campaign status, retained data, or file evidence.',{usage,capabilities:caps});}
        const who=actor(req);
        if(action==='hide')await cx.query('UPDATE SafetyVote_Campaigns SET IsHidden=1,HiddenAt=NOW(),HiddenBy=?,HideReason=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?',[who,reason,who,id]);
        if(action==='unhide')await cx.query('UPDATE SafetyVote_Campaigns SET IsHidden=0,HiddenAt=NULL,HiddenBy=NULL,HideReason=NULL,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?',[who,id]);
        if(action==='mark-test')await cx.query('UPDATE SafetyVote_Campaigns SET IsTest=1,IsHidden=1,TestMarkedAt=NOW(),TestMarkedBy=?,TestReason=?,HiddenAt=COALESCE(HiddenAt,NOW()),HiddenBy=COALESCE(HiddenBy,?),HideReason=COALESCE(HideReason,?),UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?',[who,reason,who,'Test campaign is hidden from participants.',who,id]);
        if(action==='unmark-test')await cx.query('UPDATE SafetyVote_Campaigns SET IsTest=0,TestMarkedAt=NULL,TestMarkedBy=NULL,TestReason=NULL,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?',[who,id]);
        if(action==='archive')await cx.query("UPDATE SafetyVote_Campaigns SET ArchivedFromStatus=Status,Status='Archived',ArchivedAt=NOW(),ArchivedBy=?,ArchiveReason=?,IsHidden=1,HiddenAt=COALESCE(HiddenAt,NOW()),HiddenBy=COALESCE(HiddenBy,?),HideReason=COALESCE(HideReason,'Archived campaign'),UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?",[who,reason,who,who,id]);
        if(action==='restore')await cx.query("UPDATE SafetyVote_Campaigns SET Status=ArchivedFromStatus,ArchivedAt=NULL,ArchivedBy=NULL,ArchiveReason=NULL,ArchivedFromStatus=NULL,IsHidden=1,HiddenAt=COALESCE(HiddenAt,NOW()),HiddenBy=COALESCE(HiddenBy,?),HideReason=COALESCE(HideReason,'Restored campaign requires explicit unhide'),UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?",[who,who,id]);
        if(action==='void'){await cx.query("UPDATE SafetyVote_Campaigns SET Status='Voided',VoidedAt=NOW(),VoidedBy=?,VoidReason=?,IsHidden=1,HiddenAt=COALESCE(HiddenAt,NOW()),HiddenBy=COALESCE(HiddenBy,?),HideReason=COALESCE(HideReason,'Voided campaign'),UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=?",[who,reason,who,who,id]);await cx.query("UPDATE SafetyVote_CampaignVersions SET Status='Voided',UpdatedBy=?,RowVersion=RowVersion+1 WHERE CampaignID=?",[who,id]);}
        if(action==='purge'){
            const confirmation=String(req.body?.confirmation||'');if(confirmation!==String(row.TitleTh||'')){await cx.rollback();return error(res,400,'PURGE_CONFIRMATION_REQUIRED','Exact campaign title confirmation is required.');}
            await cx.query('INSERT INTO SafetyVote_CampaignPurgeLog(CampaignIDOriginal,CampaignCode,TitleSnapshot,PurgeReason,ConfirmationSha256,PurgedBy,MetadataJson) VALUES(?,?,?,?,SHA2(?,256),?,?)',[id,row.CampaignCode,row.TitleTh,reason,confirmation,who,JSON.stringify({usage,versionId:Number(row.CurrentVersionID),policy:'test-void-zero-business-zero-files'})]);
            const[versions]=await cx.query('SELECT id FROM SafetyVote_CampaignVersions WHERE CampaignID=?',[id]);const versionIds=versions.map(item=>Number(item.id));
            if(versionIds.length){await cx.query('DELETE FROM SafetyVote_MediaLinks WHERE CampaignID=? OR CampaignVersionID IN (?)',[id,versionIds]);await cx.query('DELETE FROM SafetyVote_CampaignRoles WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_EligibleVoters WHERE SnapshotID IN (SELECT id FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID IN (?))',[versionIds]);await cx.query('DELETE FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_EligibilityRules WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_ElectionPositionCandidates WHERE PositionID IN (SELECT id FROM SafetyVote_ElectionPositions WHERE CampaignVersionID IN (?))',[versionIds]);await cx.query('DELETE FROM SafetyVote_ElectionPositions WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_CertifierAssignments WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_JuryAssignments WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_JuryCriteria WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_StageAdvancements WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_Candidates WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_Options WHERE QuestionID IN (SELECT id FROM SafetyVote_Questions WHERE CampaignVersionID IN (?))',[versionIds]);await cx.query('DELETE FROM SafetyVote_Questions WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('DELETE FROM SafetyVote_Stages WHERE CampaignVersionID IN (?)',[versionIds]);await cx.query('UPDATE SafetyVote_CampaignVersions SET ParentVersionID=NULL WHERE CampaignID=?',[id]);await cx.query('DELETE FROM SafetyVote_CampaignVersions WHERE CampaignID=?',[id]);}
            await cx.query('DELETE FROM SafetyVote_AuditLogs WHERE CampaignID=?',[id]);await cx.query('DELETE FROM SafetyVote_Campaigns WHERE id=?',[id]);
        }
        await cx.commit();
        if(action!=='purge'){req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,`SAFETY_VOTE_CAMPAIGN_${action.replace('-','_').toUpperCase()}`,'SafetyVote_Campaign',id,reason||`action=${action}`,{fromStatus:row.Status,usage});}
        return res.json({success:true,data:action==='purge'?{id,purged:true,auditRetained:true}:{campaign:await campaignRow(id),usage}});
    }catch(e){await cx.rollback().catch(()=>{});console.error('[safety-vote] campaign governance failed:',e);return error(res,500,'CAMPAIGN_GOVERNANCE_FAILED','Unable to apply campaign governance action.');}finally{cx.release();}
});

router.get('/admin/master/employees',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{try{const data=await masterProjection(),q=rules.clean(req.query.q,100).toLocaleLowerCase(),departmentId=rules.positiveInt(req.query.departmentId),unitId=rules.positiveInt(req.query.safetyUnitId);let rows=data.employees;if(q)rows=rows.filter(r=>[r.employeeId,r.employeeName,r.departmentName,r.safetyUnitName,r.positionName].some(v=>String(v).toLocaleLowerCase().includes(q)));if(departmentId)rows=rows.filter(r=>r.departmentId===departmentId);if(unitId)rows=rows.filter(r=>r.safetyUnitId===unitId);const page=Math.max(1,rules.positiveInt(req.query.page)||1),pageSize=Math.min(100,Math.max(1,rules.positiveInt(req.query.pageSize)||25)),total=rows.length;res.json({success:true,data:{rows:rows.slice((page-1)*pageSize,page*pageSize),total,page,pageSize}});}catch(e){return error(res,503,'MASTER_DATA_INVALID','Employee Master is unavailable or ambiguous.');}});
router.get('/admin/master/departments',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{try{const data=await masterProjection();res.json({success:true,data:data.departments});}catch(e){return error(res,503,'MASTER_DATA_INVALID','Department Master is unavailable.');}});
router.get('/admin/master/safety-units',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{try{const data=await masterProjection();res.json({success:true,data:data.units});}catch(e){return error(res,503,'MASTER_DATA_INVALID','Safety Unit Master is unavailable.');}});
router.get('/admin/master/positions',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{try{const data=await masterProjection();res.json({success:true,data:data.positions});}catch(e){return error(res,503,'MASTER_DATA_INVALID','Position Master is unavailable.');}});

router.put('/admin/campaigns/:id/eligibility/rules',permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'),async(req,res)=>{const id=rules.positiveInt(req.params.id),parsed=rules.normalizeRules(req.body?.rules);if(!id||!parsed.ok)return error(res,400,'VALIDATION_FAILED','Eligibility rules are invalid.',parsed.errors);const connection=await db.getConnection();try{await connection.beginTransaction();const row=await campaignRow(id,true,connection);if(!row){await connection.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');}if(row.Status!=='Draft'){await connection.rollback();return error(res,409,'CAMPAIGN_STATE_CONFLICT','Eligibility rules are editable only in Draft.');}await connection.query('DELETE FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=?',[row.CurrentVersionID]);for(const rule of parsed.rules)await connection.query('INSERT INTO SafetyVote_EligibilityRules(CampaignVersionID,RuleGroup,RuleOrder,Effect,AttributeKey,Operator,ValuesJson,Reason,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?)',[row.CurrentVersionID,rule.ruleGroup,rule.ruleOrder,rule.effect,rule.attributeKey,rule.operator,JSON.stringify(rule.values),rule.reason,actor(req),actor(req)]);await connection.commit();req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,'SAFETY_VOTE_ELIGIBILITY_RULES_UPDATE','SafetyVote_Campaign',id,`rules=${parsed.rules.length}`,{ruleCount:parsed.rules.length,ruleHash:rules.canonicalHash(parsed.rules)});res.json({success:true,data:{rules:parsed.rules,ruleHash:rules.canonicalHash(parsed.rules)}});}catch(e){await connection.rollback().catch(()=>{});return error(res,500,'SAFETY_VOTE_RULE_SAVE_FAILED','Unable to save eligibility rules.');}finally{connection.release();}});
router.post('/admin/campaigns/:id/eligibility/preview',permit('SAFETY_VOTE_ELIGIBILITY_MANAGE'),async(req,res)=>{const id=rules.positiveInt(req.params.id);if(!id)return error(res,400,'VALIDATION_FAILED','Valid campaign ID is required.');try{const row=await campaignRow(id);if(!row)return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');let parsed;if(Array.isArray(req.body?.rules))parsed=rules.normalizeRules(req.body.rules);else{const[stored]=await db.query('SELECT RuleGroup ruleGroup,RuleOrder ruleOrder,Effect effect,AttributeKey attributeKey,Operator operator,ValuesJson,Reason reason FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? AND IsActive=1 ORDER BY RuleGroup,RuleOrder,id',[row.CurrentVersionID]);parsed=rules.normalizeRules(stored.map(r=>({...r,values:JSON.parse(r.ValuesJson||'[]')})));}if(!parsed.ok)return error(res,400,'VALIDATION_FAILED','Eligibility rules are invalid.',parsed.errors);const master=await masterProjection(),eligible=rules.evaluateEligibility(parsed.rules,master.employees),warnings=eligible.reduce((sum,e)=>sum+e.masterWarnings.length,0),breakdown={};for(const e of eligible){const key=e.departmentName||'Unresolved';breakdown[key]=(breakdown[key]||0)+1;}res.json({success:true,data:{ruleHash:rules.canonicalHash(parsed.rules),eligibleCount:eligible.length,accountReadyCount:eligible.filter(e=>e.accountReady).length,warningCount:warnings,breakdown,rows:eligible.slice(0,250),truncated:eligible.length>250}});}catch(e){return error(res,503,'MASTER_DATA_INVALID','Unable to preview eligibility against Master Data.');}});
router.post('/admin/campaigns/:id/rehearsal',permit('SAFETY_VOTE_ADMIN'),async(req,res)=>{const id=rules.positiveInt(req.params.id),campaign=await campaignRow(id||0);if(!campaign)return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');if(campaign.Status!=='Draft'||campaign.VersionStatus!=='Draft')return error(res,409,'REHEARSAL_DRAFT_REQUIRED','Rehearsal is available only for a Draft campaign.');if(req.body?.mode!=='dry_run'||req.body?.confirmation!==`REHEARSE ${campaign.CampaignCode}`)return error(res,400,'REHEARSAL_CONFIRMATION_REQUIRED','Exact dry-run confirmation is required.');try{const[stored]=await db.query('SELECT RuleGroup ruleGroup,RuleOrder ruleOrder,Effect effect,AttributeKey attributeKey,Operator operator,ValuesJson,Reason reason FROM SafetyVote_EligibilityRules WHERE CampaignVersionID=? AND IsActive=1 ORDER BY RuleGroup,RuleOrder,id',[campaign.CurrentVersionID]),parsed=rules.normalizeRules(stored.map(row=>({...row,values:JSON.parse(row.ValuesJson||'[]')}))),master=await masterProjection(),eligible=parsed.ok?rules.evaluateEligibility(parsed.rules,master.employees):[],[[snapshot]]=await db.query("SELECT * FROM SafetyVote_EligibilitySnapshots WHERE CampaignVersionID=? AND Status='frozen' ORDER BY SnapshotNo DESC LIMIT 1",[campaign.CurrentVersionID]),[baseline]=snapshot?await db.query('SELECT EmployeeID employeeId,DepartmentIDSnapshot departmentId,SafetyUnitIDSnapshot safetyUnitId,PositionIDSnapshot positionId,RoleSnapshot role,TeamSnapshot team,AccountReady accountReady FROM SafetyVote_EligibleVoters WHERE SnapshotID=? ORDER BY EmployeeID',[snapshot.id]):[[]],[[questions]]=await db.query("SELECT COUNT(*) total FROM SafetyVote_Questions WHERE CampaignVersionID=? AND Status='Active'",[campaign.CurrentVersionID]),[[usage]]=await db.query("SELECT (SELECT COUNT(*) FROM SafetyVote_Ballots WHERE CampaignVersionID=?) ballots,(SELECT COUNT(*) FROM SafetyVote_Participation WHERE CampaignVersionID=?) participation,(SELECT COUNT(*) FROM SafetyVote_RequestKeys WHERE CampaignVersionID=?) requestKeys,(SELECT COUNT(*) FROM SafetyVote_JuryScores js JOIN SafetyVote_JuryAssignments ja ON ja.id=js.AssignmentID WHERE ja.CampaignVersionID=?) juryScores,(SELECT COUNT(*) FROM SafetyVote_ResultSnapshots WHERE CampaignVersionID=?) resultSnapshots,(SELECT COUNT(*) FROM SafetyVote_Certifications sc JOIN SafetyVote_ResultSnapshots rs ON rs.id=sc.ResultSnapshotID WHERE rs.CampaignVersionID=?) certifications,(SELECT COUNT(*) FROM SafetyVote_Reports rp JOIN SafetyVote_ResultSnapshots rs ON rs.id=rp.ResultSnapshotID WHERE rs.CampaignVersionID=?) reports,(SELECT COUNT(*) FROM SafetyVote_Notifications WHERE CampaignID=?) notifications,(SELECT COUNT(*) FROM SafetyVote_ExportJobs WHERE CampaignID=?) exportJobs",[campaign.CurrentVersionID,campaign.CurrentVersionID,campaign.CurrentVersionID,campaign.CurrentVersionID,campaign.CurrentVersionID,campaign.CurrentVersionID,campaign.CurrentVersionID,id,id]);const current=eligible.map(rehearsalProjection),diff=eligibilityDiff(baseline,current),ruleHash=parsed.ok?rules.canonicalHash(parsed.rules):'',rowsHash=phase2.rowsHash(current),warningCount=eligible.reduce((sum,row)=>sum+row.masterWarnings.length,0),accountReadyCount=eligible.filter(row=>row.accountReady).length,businessCounts=Object.fromEntries(Object.entries(usage).map(([key,value])=>[key,Number(value)])),businessRows=Object.values(businessCounts).reduce((sum,value)=>sum+value,0),checks=[['draft_state',true],['eligibility_rules',parsed.ok&&parsed.rules.length>0],['active_questions',Number(questions.total)>0],['frozen_baseline',Boolean(snapshot)],['eligible_population',eligible.length>0],['account_readiness',accountReadyCount===eligible.length],['master_warnings',warningCount===0],['eligibility_drift',Boolean(snapshot)&&snapshot.RowsHash===rowsHash&&!diff.addedCount&&!diff.removedCount&&!diff.changedCount],['business_residue',businessRows===0]].map(([key,pass])=>({key,state:pass?'pass':'block'})),ready=checks.every(check=>check.state==='pass'),data={rehearsal:true,dryRun:true,externalDelivery:false,businessMutation:false,ready,decision:ready?'PASS':'HOLD',campaign:{id:Number(campaign.id),campaignCode:campaign.CampaignCode,status:campaign.Status,campaignType:campaign.CampaignType,privacyMode:campaign.PrivacyMode},eligibility:{baseline:snapshot?{snapshotId:Number(snapshot.id),snapshotNo:Number(snapshot.SnapshotNo),ruleHash:snapshot.RuleHash,rowsHash:snapshot.RowsHash,eligibleCount:Number(snapshot.EligibleCount)}:null,current:{ruleHash,rowsHash,eligibleCount:eligible.length,accountReadyCount,warningCount},diff},mutationGuard:{businessRows,businessCounts},checks};data.rehearsalHash=rules.canonicalHash(data);return res.json({success:true,data});}catch(e){return error(res,503,'REHEARSAL_UNAVAILABLE','Unable to complete rehearsal safely.');}});

router.put('/admin/campaigns/:id/official-result-topn',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{
    const id=rules.positiveInt(req.params.id),topN=Number(req.body?.officialResultTopN);
    if(!id||!Number.isInteger(topN)||topN<rules.OFFICIAL_RESULT_TOP_N_MIN||topN>rules.OFFICIAL_RESULT_TOP_N_MAX)return error(res,400,'VALIDATION_FAILED',`Official result Top N must be an integer from ${rules.OFFICIAL_RESULT_TOP_N_MIN} to ${rules.OFFICIAL_RESULT_TOP_N_MAX}.`);
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        const row=await campaignRow(id,true,connection);
        if(!row){await connection.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');}
        if(row.Status!=='Draft'||row.VersionStatus!=='Draft'){await connection.rollback();return error(res,409,'CAMPAIGN_STATE_CONFLICT','Official result display is editable only in Draft.');}
        const[result]=await connection.query('UPDATE SafetyVote_CampaignVersions SET OfficialResultTopN=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND OfficialResultTopN<>?',[topN,actor(req),row.CurrentVersionID,topN]);
        await connection.commit();
        if(result.affectedRows){req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,'SAFETY_VOTE_OFFICIAL_TOPN_UPDATE','SafetyVote_CampaignVersion',row.CurrentVersionID,`topN=${topN}`,{officialResultTopN:topN});}
        return res.json({success:true,data:{campaignId:id,versionId:Number(row.CurrentVersionID),officialResultTopN:topN,changed:Boolean(result.affectedRows)}});
    }catch(e){await connection.rollback().catch(()=>{});return error(res,500,'OFFICIAL_TOPN_UPDATE_FAILED','Unable to save official result display.');}finally{connection.release();}
});

router.put('/admin/campaigns/:id/result-release-policy',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{
    const id=rules.positiveInt(req.params.id),policy=String(req.body?.resultReleasePolicy||'').toLowerCase();
    if(!id||!['manual','automatic'].includes(policy))return error(res,400,'VALIDATION_FAILED','Result release policy must be manual or automatic.');
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        const row=await campaignRow(id,true,connection);
        if(!row){await connection.rollback();return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');}
        if(row.Status!=='Draft'||row.VersionStatus!=='Draft'){await connection.rollback();return error(res,409,'CAMPAIGN_STATE_CONFLICT','Result release policy is editable only in Draft.');}
        const[result]=await connection.query('UPDATE SafetyVote_CampaignVersions SET ResultReleasePolicy=?,UpdatedBy=?,RowVersion=RowVersion+1 WHERE id=? AND ResultReleasePolicy<>?',[policy,actor(req),row.CurrentVersionID,policy]);
        await connection.commit();
        if(result.affectedRows){req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,'SAFETY_VOTE_RESULT_RELEASE_POLICY_UPDATE','SafetyVote_CampaignVersion',row.CurrentVersionID,`policy=${policy}`,{resultReleasePolicy:policy});}
        return res.json({success:true,data:{campaignId:id,versionId:Number(row.CurrentVersionID),resultReleasePolicy:policy,changed:Boolean(result.affectedRows)}});
    }catch(e){await connection.rollback().catch(()=>{});return error(res,500,'RESULT_RELEASE_POLICY_UPDATE_FAILED','Unable to save result release policy.');}finally{connection.release();}
});

router.post('/admin/campaigns/:id/files',permit('SAFETY_VOTE_MANAGE'),(req,res)=>upload.single('file')(req,res,async uploadError=>{if(uploadError)return error(res,400,'FILE_UPLOAD_REJECTED',uploadError.code==='LIMIT_FILE_SIZE'?'File must not exceed 10 MB.':'File upload was rejected.');const id=rules.positiveInt(req.params.id),purpose=rules.clean(req.body?.filePurpose||'cover',40);let persisted=false;try{if(!id||!req.file)throw Object.assign(new Error('A valid campaign and file are required.'),{status:400});const row=await campaignRow(id);if(!row)throw Object.assign(new Error('Campaign was not found.'),{status:404});if(row.Status!=='Draft')throw Object.assign(new Error('Files can be added only to Draft campaigns.'),{status:409});const mime=verifiedMime(req.file.path);if(!mime||mime!==req.file.mimetype)throw Object.assign(new Error('File content does not match its declared type.'),{status:400});const sha=crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');const[result]=await db.query('INSERT INTO SafetyVote_Files(CampaignID,CampaignVersionID,FilePurpose,StoredName,OriginalName,MimeType,FileSize,ContentSha256,UploadedBy) VALUES(?,?,?,?,?,?,?,?,?)',[id,row.CurrentVersionID,purpose,path.basename(req.file.filename),rules.clean(req.file.originalname,255),mime,req.file.size,sha,actor(req)]);persisted=true;req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,'SAFETY_VOTE_FILE_UPLOAD','SafetyVote_File',result.insertId,`purpose=${purpose}; size=${req.file.size}`,{purpose,mime,size:req.file.size,sha256:sha});res.status(201).json({success:true,data:{id:Number(result.insertId),filePurpose:purpose,originalName:rules.clean(req.file.originalname,255),mimeType:mime,fileSize:req.file.size,sha256:sha}});}catch(e){if(!persisted)removeFile(req.file?.filename);return error(res,e.status||500,e.status===409?'CAMPAIGN_STATE_CONFLICT':'FILE_UPLOAD_REJECTED',e.status?e.message:'Unable to store file.');}}));
router.get('/files/:fileId',requireSchema,permit('SAFETY_VOTE_VIEW'),async(req,res)=>{const id=rules.positiveInt(req.params.fileId);if(!id)return error(res,404,'FILE_NOT_FOUND','File was not found.');try{const[[file]]=await db.query("SELECT f.* FROM SafetyVote_Files f WHERE f.id=? AND f.Status='Active' LIMIT 1",[id]);if(!file||!await canReadPrivateFile(req,file))return error(res,404,'FILE_NOT_FOUND','File was not found.');const disk=await resolvePrivateDisk(file);if(!disk||verifiedMime(disk)!==file.MimeType)return error(res,404,'FILE_NOT_FOUND','File is unavailable.');const actual=crypto.createHash('sha256').update(fs.readFileSync(disk)).digest('hex');if(actual!==String(file.ContentSha256||'').toLowerCase())return error(res,409,'FILE_INTEGRITY_FAILED','File integrity verification failed.');res.setHeader('Content-Type',file.MimeType);res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.OriginalName)}`);return res.sendFile(disk);}catch(e){return error(res,500,'FILE_READ_FAILED','Unable to read file.');}});
router.delete('/admin/campaigns/:id/files/:fileId',permit('SAFETY_VOTE_MANAGE'),async(req,res)=>{const id=rules.positiveInt(req.params.id),fileId=rules.positiveInt(req.params.fileId),reason=rules.clean(req.body?.reason,255);if(!id||!fileId||!reason)return error(res,400,'VALIDATION_FAILED','Campaign, file and removal reason are required.');try{const row=await campaignRow(id);if(!row)return error(res,404,'CAMPAIGN_NOT_FOUND','Campaign was not found.');if(row.Status!=='Draft')return error(res,409,'CAMPAIGN_STATE_CONFLICT','Files can be removed only from Draft campaigns.');const[result]=await db.query("UPDATE SafetyVote_Files SET Status='Removed',RemovedBy=?,RemovedAt=NOW(),RemovalReason=? WHERE id=? AND CampaignID=? AND Status='Active'",[actor(req),reason,fileId,id]);if(!result.affectedRows)return error(res,404,'FILE_NOT_FOUND','File was not found.');req.svCampaignId=id;req.svVersionId=row.CurrentVersionID;await audit(req,'SAFETY_VOTE_FILE_REMOVE','SafetyVote_File',fileId,reason);res.json({success:true});}catch(e){return error(res,500,'FILE_REMOVE_FAILED','Unable to remove file.');}});

module.exports=router;
module.exports.schemaHealth=schemaHealth;
module.exports.masterProjection=masterProjection;
module.exports.operationalGate=operationalGate;
module.exports.isReadonlyControlRequest=isReadonlyControlRequest;
module.exports.securityHeaders=securityHeaders;
module.exports.reconcileDueCampaignClosures=reconcileDueCampaignClosures;
