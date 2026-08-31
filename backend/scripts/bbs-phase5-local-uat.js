'use strict';
const assert=require('assert');
const path=require('path');
const fs=require('fs');
const mysql=require('mysql2/promise');
const jwt=require('jsonwebtoken');
require('dotenv').config({path:path.join(__dirname,'..','.env')});

const nodeBase=String(process.env.LOCAL_NODE_UAT_URL||'http://127.0.0.1:5000').replace(/\/+$/,'');
const phpBase=String(process.env.LOCAL_PHP_UAT_URL||'http://127.0.0.1:8099/api/index.php?route=').replace(/\/+$/,'');
const marker=`UAT-BBS5-${Date.now()}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
let db,templateId,observationId,answerId,actionId,auditBaseline=0;

const tokenFor=row=>jwt.sign({id:row.EmployeeID,name:row.EmployeeName,role:row.Role,department:row.Department,unit:row.Unit,position:row.Position},process.env.JWT_SECRET,{expiresIn:'30m'});
async function call(stack,route,{method='GET',token,body,form}={}){
    const url=stack==='node'?`${nodeBase}/api/bbs${route}`:`${phpBase}bbs${route.includes('?')?route.replace('?','&'):route}`;
    const headers={Accept:'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
    let payload;if(form)payload=form;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
    const response=await fetch(url,{method,headers,body:payload});const type=response.headers.get('content-type')||'';
    if(!type.includes('application/json'))return{status:response.status,bytes:Buffer.from(await response.arrayBuffer())};
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{const start=text.indexOf('{');try{json=start>=0?JSON.parse(text.slice(start)):null;}catch{throw new Error(`${stack} ${route} ${response.status}: ${text.slice(0,300)}`);}}return{status:response.status,json};
}

(async()=>{
    db=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASS,database:process.env.DB_NAME,port:Number(process.env.DB_PORT||3306)});
    const[[admin]]=await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID=? AND LOWER(Role)='admin' LIMIT 1",[process.env.PROD_UAT_ADMIN_ID]);assert.ok(admin,'Admin fixture unavailable');
    const[[owner]]=await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Position,Role FROM Employees WHERE EmployeeID<>? AND LOWER(Role)<>'admin' AND COALESCE(CompanyEmail,'')<>'' ORDER BY EmployeeID LIMIT 1",[admin.EmployeeID]);assert.ok(owner,'Owner fixture unavailable');
    const[[audit]]=await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');auditBaseline=Number(audit.id);
    let[[source]]=await db.query('SELECT v.id VersionID,i.id ItemID FROM BBS_Checklist_Versions v JOIN BBS_Checklist_Categories c ON c.VersionID=v.id JOIN BBS_Checklist_Items i ON i.CategoryID=c.id ORDER BY v.id,i.id LIMIT 1');
    if(!source){
        const[t]=await db.query("INSERT INTO BBS_Checklist_Templates(TemplateCode,TemplateName,CreatedBy) VALUES(?,?,?)",[`${marker}-TPL`,marker,admin.EmployeeID]);templateId=Number(t.insertId);
        const[v]=await db.query("INSERT INTO BBS_Checklist_Versions(TemplateID,VersionNo,Status,EffectiveFrom,PublishedAt,PublishedBy,CreatedBy) VALUES(?,1,'Published',CURDATE(),NOW(),?,?)",[templateId,admin.EmployeeID,admin.EmployeeID]);
        const[c]=await db.query("INSERT INTO BBS_Checklist_Categories(VersionID,CategoryName,SortOrder) VALUES(?,'UAT',1)",[v.insertId]);
        const[i]=await db.query("INSERT INTO BBS_Checklist_Items(CategoryID,ItemCode,ItemPrompt,UnsafeRequiresAction) VALUES(?,'UAT-5','Unsafe action lifecycle',1)",[c.insertId]);source={VersionID:v.insertId,ItemID:i.insertId};
    }
    const[[dept]]=await db.query('SELECT id FROM Master_Departments WHERE LOWER(TRIM(Name))=LOWER(TRIM(?)) LIMIT 1',[owner.Department]);
    const[obs]=await db.query("INSERT INTO BBS_Observations(ObservationNo,ObserverEmployeeID,ObservedEmployeeID,ChecklistVersionID,Status,ObservationDate,ObservedAt,ObserverNameSnapshot,ObservedNameSnapshot,ObservedDepartmentSnapshot,ObservedDepartmentID,IdempotencyKey,SubmittedAt) VALUES(?,?,?,?,'Submitted',CURDATE(),NOW(),?,?,?,?,?,NOW())",[marker,admin.EmployeeID,owner.EmployeeID,source.VersionID,admin.EmployeeName,owner.EmployeeName,owner.Department,dept?.id||null,`${marker}-key`]);observationId=Number(obs.insertId);
    const[answer]=await db.query("INSERT INTO BBS_Observation_Answers(ObservationID,ChecklistItemID,CategoryNameSnapshot,ItemCodeSnapshot,ItemPromptSnapshot,Response,UnsafeRequiresActionSnapshot,Remark,ImmediateAction) VALUES(?,?,?,'UAT-5','Unsafe action lifecycle','Unsafe',1,'UAT unsafe','UAT immediate')",[observationId,source.ItemID,'UAT']);answerId=Number(answer.insertId);
    const[action]=await db.query("INSERT INTO BBS_Corrective_Actions(ActionNo,ObservationID,AnswerID,OwnerEmployeeID,VerifierEmployeeID,Priority,DueDate,Description,Status,CreatedBy) VALUES(?,?,?,?,?,'High',DATE_SUB(CURDATE(),INTERVAL 1 DAY),'UAT action','Open',?)",[`${marker}-ACT`,observationId,answerId,owner.EmployeeID,admin.EmployeeID,admin.EmployeeID]);actionId=Number(action.insertId);
    await db.query("INSERT INTO BBS_Action_History(ActionID,FromStatus,ToStatus,ActorEmployeeID,Note,EventType) VALUES(?,NULL,'Open',?,'UAT create','Created')",[actionId,admin.EmployeeID]);
    const ownerToken=tokenFor(owner),adminToken=tokenFor(admin);

    let result=await call('node',`/actions/${actionId}/transition`,{method:'POST',token:ownerToken,body:{rowVersion:1,toStatus:'In Progress'}});if(result.status!==200)throw new Error(`Node transition failed ${result.status}: ${JSON.stringify(result.json)}`);
    const form=new FormData();form.append('evidenceType','After');form.append('evidence',new Blob([png],{type:'image/png'}),'after.png');
    result=await call('php',`/actions/${actionId}/evidence`,{method:'POST',token:ownerToken,form});assert.strictEqual(result.status,201,JSON.stringify(result.json));
    result=await call('php',`/actions/${actionId}`,{token:ownerToken});assert.strictEqual(result.status,200);assert.strictEqual(result.json.data.files.length,1);
    result=await call('php',`/actions/${actionId}/transition`,{method:'POST',token:ownerToken,body:{rowVersion:Number(result.json.data.RowVersion),toStatus:'Pending Verification'}});assert.strictEqual(result.status,200,JSON.stringify(result.json));
    result=await call('node',`/actions/${actionId}/transition`,{method:'POST',token:adminToken,body:{rowVersion:Number(result.json.data.RowVersion),toStatus:'Closed',note:'UAT verified'}});assert.strictEqual(result.status,200,JSON.stringify(result.json));
    result=await call('php',`/actions/${actionId}/transition`,{method:'POST',token:adminToken,body:{rowVersion:Number(result.json.data.RowVersion),toStatus:'Reopened',note:'UAT reopen'}});assert.strictEqual(result.status,200,JSON.stringify(result.json));
    const invalid=await call('node',`/actions/${actionId}/transition`,{method:'POST',token:adminToken,body:{rowVersion:Number(result.json.data.RowVersion),toStatus:'Closed',note:'invalid'}});assert.strictEqual(invalid.status,409);
    const first=await call('node','/actions/reminders/queue',{method:'POST',token:adminToken,body:{}});assert.strictEqual(first.status,200,JSON.stringify(first.json));
    const second=await call('php','/actions/reminders/queue',{method:'POST',token:adminToken,body:{}});assert.strictEqual(second.status,200,JSON.stringify(second.json));assert.ok(Number(second.json.data.suppressed)>=1,`second daily reminder must be suppressed: first=${JSON.stringify(first.json?.data)} second=${JSON.stringify(second.json?.data)}`);
    const[[setting]]=await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='action_notifications_enabled'");assert.strictEqual(String(setting.SettingValue),'0','UAT must not enable real delivery');
    console.log('BBS Phase 5 Node/PHP owner, evidence, verification, closure, reopen, escalation and suppression lifecycle UAT: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
    if(!db)return;let stored=[];
    if(actionId){const[files]=await db.query('SELECT StoredName FROM BBS_Action_Files WHERE ActionID=?',[actionId]).catch(()=>[[]]);stored=files.map(row=>row.StoredName);await db.query('DELETE FROM BBS_Action_EmailOutbox WHERE ActionID=?',[actionId]).catch(()=>{});await db.query('DELETE FROM BBS_Action_History WHERE ActionID=?',[actionId]).catch(()=>{});await db.query('DELETE FROM BBS_Action_Files WHERE ActionID=?',[actionId]).catch(()=>{});await db.query('DELETE FROM BBS_Corrective_Actions WHERE id=?',[actionId]).catch(()=>{});}
    if(answerId)await db.query('DELETE FROM BBS_Observation_Answers WHERE id=?',[answerId]).catch(()=>{});if(observationId)await db.query('DELETE FROM BBS_Observations WHERE id=?',[observationId]).catch(()=>{});if(templateId)await db.query('DELETE FROM BBS_Checklist_Templates WHERE id=?',[templateId]).catch(()=>{});
    await db.query("DELETE FROM Admin_AuditLogs WHERE id>? AND Module='bbs' AND Action LIKE 'BBS_ACTION_%'",[auditBaseline]).catch(()=>{});for(const name of stored)await fs.promises.rm(path.join(__dirname,'..','private-uploads','bbs-actions',path.basename(name)),{force:true}).catch(()=>{});
    const[[remaining]]=await db.query('SELECT COUNT(*) count FROM BBS_Corrective_Actions WHERE ActionNo LIKE ?',[`${marker}%`]).catch(()=>[[{count:-1}]]);console.log(`BBS Phase 5 UAT cleanup: actions=${remaining.count}`);await db.end();
});
