'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const jwt=require('jsonwebtoken');
require('dotenv').config({path:path.join(__dirname,'..','.env')});
const app=require('../server');
const db=require('../db');
const {loadReadyTestUsers}=require('./ready-test-users');

const marker=`UAT-BBS10F5-${Date.now()}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const templateDir=path.join(__dirname,'..','private-uploads','bbs-card-templates');
let server, personalTemplateId, departmentTemplateId, personalLayoutId, departmentLayoutId, personalCardId, personalPrintLogId, departmentPrintLogId;
let originalSettings=[];
let departmentBlocked=false;

const tokenFor=payload=>jwt.sign(payload,process.env.JWT_SECRET,{expiresIn:'15m'});
async function call(base,route,{method='GET',token,body}={}){const headers={Accept:'application/json'};if(token)headers.Authorization=`Bearer ${token}`;if(body!==undefined)headers['Content-Type']='application/json';const response=await fetch(`${base}${route}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,json:await response.json()};}
async function createAndActivate(base,token,kind,templateId){let response=await call(base,`/admin/card-designer/${kind}/${templateId}/versions`,{method:'POST',token,body:{}});assert.strictEqual(response.status,201,JSON.stringify(response.json));const id=Number(response.json.data.id);response=await call(base,`/admin/card-designer/versions/${id}/lifecycle`,{method:'POST',token,body:{action:'activate'}});assert.strictEqual(response.status,200,JSON.stringify(response.json));assert.strictEqual(response.json.data.Status,'Active');return id;}
async function cleanup(){
  try{
    if(personalPrintLogId)await db.query('DELETE FROM BBS_Card_Designer_Print_Snapshots WHERE PersonalPrintLogID=?',[personalPrintLogId]);
    if(departmentPrintLogId)await db.query('DELETE FROM BBS_Card_Designer_Print_Snapshots WHERE DepartmentPrintLogID=?',[departmentPrintLogId]);
    if(personalPrintLogId)await db.query('DELETE FROM BBS_Card_Print_Logs WHERE id=?',[personalPrintLogId]);
    if(departmentPrintLogId)await db.query('DELETE FROM BBS_Department_Card_Print_Logs WHERE id=?',[departmentPrintLogId]);
    if(personalCardId)await db.query('DELETE FROM BBS_Cards WHERE id=?',[personalCardId]);
    for(const id of [personalLayoutId,departmentLayoutId].filter(Boolean)){await db.query('DELETE FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[id]);await db.query('DELETE FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=?',[id]);await db.query('DELETE FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]);await db.query('DELETE FROM BBS_Card_Layout_Versions WHERE id=?',[id]);}
    if(personalTemplateId)await db.query('DELETE FROM BBS_Card_Templates WHERE id=?',[personalTemplateId]);
    if(departmentTemplateId)await db.query('DELETE FROM BBS_Department_Card_Templates WHERE id=?',[departmentTemplateId]);
    for(const row of originalSettings)await db.query('UPDATE BBS_Settings SET SettingValue=? WHERE SettingKey=?',[row.SettingValue,row.SettingKey]);
    await fs.promises.rm(path.join(templateDir,`${marker}-personal.png`),{force:true});
    await fs.promises.rm(path.join(templateDir,`${marker}-department.png`),{force:true});
    const [[left]]=await db.query(`SELECT (SELECT COUNT(*) FROM BBS_Card_Templates WHERE TemplateName=?) personalTemplates,(SELECT COUNT(*) FROM BBS_Department_Card_Templates WHERE TemplateName=?) departmentTemplates,(SELECT COUNT(*) FROM BBS_Cards WHERE id=?) personalCards`,[`${marker}-Personal`,`${marker}-Department`,personalCardId||0]);
    assert.deepStrictEqual([Number(left.personalTemplates),Number(left.departmentTemplates),Number(left.personalCards)],[0,0,0]);
    const [settings]=await db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled') ORDER BY SettingKey");
    assert.strictEqual(String(settings.find(row=>row.SettingKey==='visual_card_designer_rendering_enabled')?.SettingValue),'0','Renderer must be OFF after UAT cleanup');
    console.log('BBS Phase 10F-5 controlled runtime UAT cleanup: no test templates/cards remain; renderer=0.');
  }catch(error){console.error(error.stack||error);process.exitCode=1;}
}

(async()=>{
  assert.ok(process.env.JWT_SECRET,'JWT_SECRET is required');
  const users=await loadReadyTestUsers(db),adminToken=tokenFor(users.admin);
  [originalSettings]=await db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled')");
  assert.strictEqual(originalSettings.length,2,'Designer settings are required before UAT');
  await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='visual_card_designer_enabled'");
  await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='visual_card_designer_rendering_enabled'");
  fs.mkdirSync(templateDir,{recursive:true});
  await fs.promises.writeFile(path.join(templateDir,`${marker}-personal.png`),png);
  await fs.promises.writeFile(path.join(templateDir,`${marker}-department.png`),png);
  const [personalTemplate]=await db.query("INSERT INTO BBS_Card_Templates(TemplateName,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,IncludeEmployeeID,Status,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,85.6,53.98,1,'Active',?,?)",[`${marker}-Personal`,`${marker}-personal.png`,`${marker}-personal.png`,'image/png',png.length,users.admin.id,users.admin.id]);
  personalTemplateId=Number(personalTemplate.insertId);
  const [[departmentQr]]=await db.query("SELECT q.*,d.Name DepartmentName FROM BBS_Department_QR_Cards q JOIN Master_Departments d ON d.id=q.DepartmentID WHERE q.Status='Active' LIMIT 1");
  if(departmentQr){
    const [departmentTemplate]=await db.query("INSERT INTO BBS_Department_Card_Templates(TemplateName,DepartmentID,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,DisplayOrder,Status,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?, ?,105,148,0,'Active',?,?)",[`${marker}-Department`,departmentQr.DepartmentID,`${marker}-department.png`,`${marker}-department.png`,'image/png',png.length,users.admin.id,users.admin.id]);
    departmentTemplateId=Number(departmentTemplate.insertId);
  }else{
    departmentBlocked=true;
    console.warn('BBS Phase 10F-5 Department runtime UAT blocked: no existing Active Department QR. The test will not create or rotate one.');
  }
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}/api/bbs`;
  personalLayoutId=await createAndActivate(base,adminToken,'personal',personalTemplateId);
  if(departmentTemplateId)departmentLayoutId=await createAndActivate(base,adminToken,'department',departmentTemplateId);
  const [[eligible]]=await db.query("SELECT e.EmployeeID FROM Employees e JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 WHERE FIELD(m.BBSLevel,'Operator','Group Leader','Department Head','Section Head','Manager')>=2 AND NOT EXISTS(SELECT 1 FROM BBS_Cards c WHERE c.EmployeeID=e.EmployeeID AND c.Status='Active') LIMIT 1");
  assert.ok(eligible,'Controlled UAT requires one eligible employee without an Active Personal Card.');
  let response=await call(base,'/admin/cards/issue',{method:'POST',token:adminToken,body:{employeeIds:[eligible.EmployeeID],templateId:personalTemplateId,reason:marker}});
  assert.strictEqual(response.status,201,JSON.stringify(response.json));const issued=response.json.data[0];personalCardId=Number(issued.cardId);
  assert.ok(issued.rawToken&&issued.designerRender?.layout,'Personal issue must provide real QR only in the Issue response plus a server-selected layout.');
  assert.strictEqual(JSON.stringify(issued.designerRender.layout).includes(`${marker}-personal.png`),false,'Personal render contract must not expose stored filenames.');
  response=await call(base,'/admin/cards/print-log',{method:'POST',token:adminToken,body:{cardIds:[personalCardId],reason:marker}});
  assert.strictEqual(response.status,201,JSON.stringify(response.json));personalPrintLogId=Number(response.json.data.printLogIds[0]);
  const [[personalSnapshot]]=await db.query('SELECT SnapshotJSON FROM BBS_Card_Designer_Print_Snapshots WHERE PersonalPrintLogID=?',[personalPrintLogId]);
  assert.ok(personalSnapshot,'Personal print must create a visual snapshot.');assert.strictEqual(String(personalSnapshot.SnapshotJSON).includes(issued.rawToken),false,'Personal snapshot must not retain the raw QR.');assert.match(String(personalSnapshot.SnapshotJSON),/PersonalQr/);
  if(departmentTemplateId){
    response=await call(base,`/department-cards/me?departmentId=${departmentQr.DepartmentID}`,{token:adminToken});
    assert.strictEqual(response.status,200,JSON.stringify(response.json));const departmentRender=response.json.data.designerLayouts?.[departmentTemplateId];
    assert.ok(departmentRender?.layout,'Department view must receive the server-selected Active Department layout.');assert.strictEqual(JSON.stringify(departmentRender.layout).includes(`${marker}-department.png`),false,'Department render contract must not expose stored filenames.');
    response=await call(base,'/department-cards/print-log',{method:'POST',token:adminToken,body:{templateId:departmentTemplateId,copies:2,paperSize:'A5'}});
    assert.strictEqual(response.status,201,JSON.stringify(response.json));departmentPrintLogId=Number(response.json.data.id);
    const [[departmentSnapshot]]=await db.query('SELECT SnapshotJSON FROM BBS_Card_Designer_Print_Snapshots WHERE DepartmentPrintLogID=?',[departmentPrintLogId]);
    assert.ok(departmentSnapshot,'Department print must create a visual snapshot.');assert.strictEqual(String(departmentSnapshot.SnapshotJSON).includes(departmentRender.values['department.community_qr']),false,'Department snapshot must not retain the raw shared QR.');assert.match(String(departmentSnapshot.SnapshotJSON),/DepartmentQr/);
  }
  console.log(`BBS Phase 10F-5 controlled runtime UAT: Personal Issue/Print and QR secrecy: PASS${departmentBlocked?' (Department blocked by missing Active QR).':'; Department Active QR/Print and snapshot: PASS.'}`);
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await cleanup();await db.end().catch(()=>{});});
