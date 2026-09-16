'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const jwt=require('jsonwebtoken');
require('dotenv').config({path:path.join(__dirname,'..','.env')});
const app=require('../server');
const db=require('../db');
const {loadReadyTestUsers}=require('./ready-test-users');
const {resolveActiveArtwork,scopedFrontSlotKey}=require('../services/bbs-card-artwork');
const {tokenFingerprint}=require('../services/bbs-card');

const marker=`UAT-BBS-CARD-OUTPUT-${Date.now()}`;
const phpBase=String(process.env.LOCAL_PHP_UAT_URL||'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/,'');
const templateDir=path.join(__dirname,'..','private-uploads','bbs-card-templates');
const designerDir=path.join(__dirname,'..','private-uploads','bbs-card-designer');
const artworkDir=path.join(__dirname,'..','private-uploads','bbs-card-master-artwork');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const created={templates:[],layouts:[],artworkSlots:[],artworkVersions:[],globalRestore:null,cards:[],personalPrints:[],departmentPrints:[],departmentQrs:[],fingerprints:new Set(),files:new Set()};
let server,baseline,auditBaseline=0,originalSettings=[];

function localDatabaseOnly(){const host=String(process.env.DB_HOST||'').trim().toLowerCase();assert.ok(['localhost','127.0.0.1','::1'].includes(host),`Refusing mutable E2E against non-local DB_HOST ${host||'(empty)'}`);}
function tokenFor(user){return jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'15m'});}
function fileSet(dir){return fs.existsSync(dir)?fs.readdirSync(dir).sort():[];}
async function counts(){const tables=['BBS_Card_Templates','BBS_Department_Card_Templates','BBS_Card_Layout_Versions','BBS_Card_Layout_Sides','BBS_Card_Layout_Elements','BBS_Card_Layout_Assets','BBS_Card_Artwork_Slots','BBS_Card_Artwork_Versions','BBS_Cards','BBS_Card_Print_Logs','BBS_Department_QR_Cards','BBS_Department_Card_Print_Logs','BBS_Card_Designer_Print_Snapshots','BBS_QR_Resolve_Attempts','Admin_AuditLogs'];const result={};for(const table of tables){const[[row]]=await db.query(`SELECT COUNT(*) total FROM ${table}`);result[table]=Number(row.total);}return result;}
async function artworkState(){const[rows]=await db.query("SELECT s.id slotId,s.IsActive,s.RowVersion,v.id versionId,v.Status,v.ArchivedAt FROM BBS_Card_Artwork_Slots s LEFT JOIN BBS_Card_Artwork_Versions v ON v.ArtworkSlotID=s.id ORDER BY s.id,v.id");return rows;}
async function settingsState(){const[rows]=await db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled','department_cards_enabled') ORDER BY SettingKey");return rows;}

async function call(stack,nodeBase,route,{method='GET',token,body,form}={}){
  const url=stack==='node'?`${nodeBase}${route}`:`${phpBase}bbs${route.includes('?')?route.replace('?','&'):route}`;
  const headers={Accept:'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
  let payload;if(form)payload=form;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
  const response=await fetch(url,{method,headers,body:payload}),text=await response.text();let json;
  try{json=JSON.parse(text);}catch{throw new Error(`${stack} ${route} returned ${response.status}: ${text.slice(0,300)}`);}
  return{status:response.status,json};
}
function expect(response,status,label){assert.equal(response.status,status,`${label}: ${JSON.stringify(response.json)}`);assert.equal(response.json.success,true,`${label}: ${JSON.stringify(response.json)}`);return response.json.data;}

async function prepareFixtures(actor){
  const[candidates]=await db.query(`SELECT e.EmployeeID,e.EmployeeName,d.id departmentId
    FROM Employees e
    JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
    JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
    JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
    WHERE FIELD(m.BBSLevel,'Operator','Group Leader','Department Head','Section Head','Manager')>=2
      AND NOT EXISTS(SELECT 1 FROM BBS_Cards c WHERE c.EmployeeID=e.EmployeeID AND c.Status='Active')
      AND NOT EXISTS(SELECT 1 FROM BBS_Department_QR_Cards q WHERE q.DepartmentID=d.id AND q.Status='Active')
    ORDER BY e.EmployeeID`);
  let scope=null;
  for(const row of candidates){const keys=['Personal','Department'].map(kind=>scopedFrontSlotKey(kind,Number(row.departmentId),null));const[[found]]=await db.query('SELECT COUNT(*) total FROM BBS_Card_Artwork_Slots WHERE SlotKey IN (?)',[keys]);if(Number(found.total)===0){scope={employeeId:String(row.EmployeeID),employeeName:String(row.EmployeeName),departmentId:Number(row.departmentId),safetyUnitId:null};break;}}
  assert.ok(scope,'Local prerequisite missing: no eligible employee in an unused Department without an Active Department QR.');
  const[globalRows]=await db.query("SELECT v.StoredName,v.MimeType FROM BBS_Card_Artwork_Slots s JOIN BBS_Card_Artwork_Versions v ON v.ArtworkSlotID=s.id AND v.Status='Active' WHERE s.IsActive=1 AND s.SlotKey='BACK:GLOBAL' ORDER BY v.id DESC");
  const needsGlobal=!globalRows.some(row=>['image/png','image/jpeg','image/webp'].includes(row.MimeType)&&fs.existsSync(path.join(artworkDir,path.basename(String(row.StoredName||'')))));
  const connection=await db.getConnection();
  try{
    await connection.beginTransaction();
    if(needsGlobal){
      let[[slot]]=await connection.query("SELECT * FROM BBS_Card_Artwork_Slots WHERE SlotKey='BACK:GLOBAL' FOR UPDATE");
      if(!slot){const[result]=await connection.query("INSERT INTO BBS_Card_Artwork_Slots(SlotKey,ArtworkRole,TemplateKind,DepartmentID,SafetyUnitID,IsActive,CreatedBy,UpdatedBy) VALUES('BACK:GLOBAL','GlobalBack',NULL,NULL,NULL,1,?,?)",[actor,actor]);slot={id:Number(result.insertId)};created.artworkSlots.push(Number(slot.id));}
      else{const[versions]=await connection.query('SELECT id,Status,ArchivedAt FROM BBS_Card_Artwork_Versions WHERE ArtworkSlotID=? ORDER BY id',[slot.id]);created.globalRestore={slotId:Number(slot.id),isActive:Number(slot.IsActive),rowVersion:Number(slot.RowVersion),updatedBy:slot.UpdatedBy,updatedAt:slot.UpdatedAt,versions};await connection.query("UPDATE BBS_Card_Artwork_Versions SET Status='Archived',ArchivedAt=NOW() WHERE ArtworkSlotID=? AND Status='Active'",[slot.id]);}
      const stored=`${marker}-global-back.png`,target=path.join(artworkDir,stored);fs.mkdirSync(artworkDir,{recursive:true});await fs.promises.writeFile(target,png);created.files.add(target);
      const[[next]]=await connection.query('SELECT COALESCE(MAX(VersionNo),0)+1 nextNo FROM BBS_Card_Artwork_Versions WHERE ArtworkSlotID=?',[slot.id]);
      const[result]=await connection.query("INSERT INTO BBS_Card_Artwork_Versions(ArtworkSlotID,VersionNo,StoredName,OriginalName,MimeType,FileSize,PixelWidth,PixelHeight,Status,CreatedBy,ActivatedAt) VALUES(?,?,?,?, 'image/png',?,1,1,'Active',?,NOW())",[slot.id,Number(next.nextNo),stored,stored,png.length,actor]);created.artworkVersions.push(Number(result.insertId));
      await connection.query('UPDATE BBS_Card_Artwork_Slots SET IsActive=1,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?',[actor,slot.id]);
    }
    for(const kind of ['Personal','Department']){
      const stored=`${marker}-${kind}-front.png`,target=path.join(artworkDir,stored);fs.mkdirSync(artworkDir,{recursive:true});await fs.promises.writeFile(target,png);created.files.add(target);
      const[result]=await connection.query("INSERT INTO BBS_Card_Artwork_Slots(SlotKey,ArtworkRole,TemplateKind,DepartmentID,SafetyUnitID,IsActive,CreatedBy,UpdatedBy) VALUES(?,'ScopedFront',?,?,NULL,1,?,?)",[scopedFrontSlotKey(kind,scope.departmentId,null),kind,scope.departmentId,actor,actor]);const slotId=Number(result.insertId);created.artworkSlots.push(slotId);
      const[version]=await connection.query("INSERT INTO BBS_Card_Artwork_Versions(ArtworkSlotID,VersionNo,StoredName,OriginalName,MimeType,FileSize,PixelWidth,PixelHeight,Status,CreatedBy,ActivatedAt) VALUES(?,1,?,?, 'image/png',?,1,1,'Active',?,NOW())",[slotId,stored,stored,png.length,actor]);created.artworkVersions.push(Number(version.insertId));
    }
    await connection.commit();
  }catch(error){await connection.rollback().catch(()=>{});throw error;}finally{connection.release();}
  for(const kind of ['Personal','Department']){const resolved=await resolveActiveArtwork(db,{kind,departmentId:scope.departmentId,safetyUnitId:null});assert.deepEqual(resolved.missing,[],`${kind} artwork must resolve`);}
  return scope;
}

async function createTemplateAndLayout(nodeBase,token,kind,scope){
  const form=new FormData();form.set('templateName',`${marker}-${kind}`);form.set('departmentId',String(scope.departmentId));form.set('safetyUnitId','');form.set('widthMM','60');form.set('heightMM','85');
  if(kind==='Personal'){form.set('bbsLevel','');form.set('includeEmployeeId','1');}else form.set('displayOrder','0');
  const route=kind==='Personal'?'/admin/card-templates':'/admin/department-card-templates';
  let response=await call('php',nodeBase,route,{method:'POST',token,form});const template=expect(response,201,`${kind} Template create`);const templateId=Number(template.id);created.templates.push({kind,id:templateId,table:kind==='Personal'?'BBS_Card_Templates':'BBS_Department_Card_Templates'});
  const[[stored]]=await db.query(`SELECT BackgroundStoredName FROM ${created.templates.at(-1).table} WHERE id=?`,[templateId]);created.files.add(path.join(templateDir,path.basename(stored.BackgroundStoredName)));
  response=await call('php',nodeBase,`/admin/card-designer/${kind.toLowerCase()}/${templateId}/versions`,{method:'POST',token,body:{}});let layout=expect(response,201,`${kind} Designer Draft create`);const layoutId=Number(layout.id);created.layouts.push(layoutId);assert.notEqual(layout.readiness.status,'Blocked',`${kind} Draft readiness`);
  response=await call('php',nodeBase,`/admin/card-designer/versions/${layoutId}/lifecycle`,{method:'POST',token,body:{action:'activate'}});layout=expect(response,200,`${kind} Designer activate`);assert.equal(layout.Status,'Active');
  response=await call('php',nodeBase,`${route}/${templateId}`,{method:'PUT',token,body:{rowVersion:Number(template.RowVersion),action:'activate'}});const active=expect(response,200,`${kind} Template activate`);assert.equal(active.Status,'Active');
  return{templateId,layoutId};
}

async function exercise(nodeBase,token,scope,personal,department){
  let response=await call('php',nodeBase,`/admin/department-qr/${scope.departmentId}/issue`,{method:'POST',token,body:{reason:marker}});const departmentQr=expect(response,201,'Department QR issue');created.departmentQrs.push(Number(departmentQr.id));created.fingerprints.add(tokenFingerprint(departmentQr.rawToken));
  response=await call('php',nodeBase,'/qr/resolve',{method:'POST',token,body:{token:departmentQr.rawToken}});assert.equal(expect(response,200,'PHP Department QR resolve').kind,'Department');
  response=await call('node',nodeBase,'/qr/resolve',{method:'POST',token,body:{token:departmentQr.rawToken}});assert.equal(expect(response,200,'Node Department QR resolve').kind,'Department');
  response=await call('php',nodeBase,'/qr/claim',{method:'POST',token,body:{token:departmentQr.rawToken,returnRoute:'#bbs-smart-card'}});assert.equal(expect(response,200,'Department QR claim').mode,'community');

  response=await call('php',nodeBase,'/admin/cards/issue',{method:'POST',token,body:{employeeIds:[scope.employeeId],templateId:personal.templateId,reason:marker}});const issued=expect(response,201,'Personal issue')[0];const firstCardId=Number(issued.cardId);created.cards.push(firstCardId);created.fingerprints.add(tokenFingerprint(issued.rawToken));assert.equal(Number(issued.designerRender.layout.layoutVersionId),personal.layoutId);assert.ok(issued.designerRender.printSnapshot.receipt);assert.equal(issued.designerRender.values['employee.full_name'],scope.employeeName);
  response=await call('php',nodeBase,'/qr/resolve',{method:'POST',token,body:{token:issued.rawToken}});assert.equal(expect(response,200,'PHP Personal QR resolve').kind,'Personal');
  response=await call('node',nodeBase,'/qr/claim',{method:'POST',token,body:{token:issued.rawToken,returnRoute:'#bbs-smart-card'}});const claim=expect(response,200,'Node Personal QR claim');assert.equal(claim.verification.employeeId,scope.employeeId);
  response=await call('php',nodeBase,'/admin/cards/print-log',{method:'POST',token,body:{cardIds:[firstCardId],reason:marker,designerReceipts:[{cardId:firstCardId,receipt:issued.designerRender.printSnapshot.receipt}]}});const printed=expect(response,201,'Personal print log');created.personalPrints.push(...printed.printLogIds.map(Number));
  response=await call('php',nodeBase,`/admin/cards/${firstCardId}`,{token});let detail=expect(response,200,'PHP issued-card detail');assert.equal(detail.printLogs.length,1);assert.ok(detail.printLogs[0].SnapshotID);assert.equal(detail.security.rawQrAvailable,false);assert.equal(JSON.stringify(detail).includes(issued.rawToken),false,'Issued-card detail must not expose raw QR');
  response=await call('node',nodeBase,`/admin/cards?paged=1&pageSize=20&q=${encodeURIComponent(scope.employeeId)}`,{token});const nodeList=expect(response,200,'Node issued-card list');assert.equal(nodeList.rows.some(row=>Number(row.id)===firstCardId&&Number(row.PrintCount)===1),true);

  response=await call('php',nodeBase,`/admin/cards/${firstCardId}/replace`,{method:'POST',token,body:{reason:`${marker}-replace`}});const replacement=expect(response,201,'Personal replace');const secondCardId=Number(replacement.cardId);created.cards.push(secondCardId);created.fingerprints.add(tokenFingerprint(replacement.rawToken));assert.notEqual(replacement.rawToken,issued.rawToken);assert.equal(Number(replacement.designerRender.layout.layoutVersionId),personal.layoutId);
  response=await call('node',nodeBase,'/qr/resolve',{method:'POST',token,body:{token:issued.rawToken}});assert.equal(response.status,404,'Replaced Personal QR must be inactive');
  response=await call('php',nodeBase,'/qr/resolve',{method:'POST',token,body:{token:replacement.rawToken}});assert.equal(expect(response,200,'Replacement Personal QR resolve').kind,'Personal');
  response=await call('php',nodeBase,'/admin/cards/print-log',{method:'POST',token,body:{cardIds:[secondCardId],reason:marker,designerReceipts:[{cardId:secondCardId,receipt:replacement.designerRender.printSnapshot.receipt}]}});created.personalPrints.push(...expect(response,201,'Replacement print log').printLogIds.map(Number));
  response=await call('php',nodeBase,`/admin/cards/${secondCardId}/revoke`,{method:'POST',token,body:{reason:`${marker}-revoke`}});expect(response,200,'Personal revoke');
  response=await call('node',nodeBase,'/qr/resolve',{method:'POST',token,body:{token:replacement.rawToken}});assert.equal(response.status,404,'Revoked Personal QR must be inactive');
  response=await call('node',nodeBase,`/admin/cards/${secondCardId}`,{token});detail=expect(response,200,'Node replacement detail');assert.equal(detail.card.Status,'Revoked');assert.equal(detail.lifecycle.some(row=>Number(row.id)===firstCardId&&row.Status==='Replaced'),true);

  response=await call('php',nodeBase,`/department-cards/me?departmentId=${scope.departmentId}`,{token});const departmentView=expect(response,200,'PHP Department card output');const render=departmentView.designerLayouts?.[department.templateId];assert.ok(render?.printSnapshot?.receipt,'Department Designer receipt is required');assert.equal(Number(render.layout.layoutVersionId),department.layoutId);assert.equal(departmentView.qr.TokenFingerprint,departmentQr.TokenFingerprint);
  response=await call('php',nodeBase,'/department-cards/print-log',{method:'POST',token,body:{templateId:department.templateId,copies:2,paperSize:'A5',designerReceipt:render.printSnapshot.receipt}});const departmentPrint=expect(response,201,'Department print log');created.departmentPrints.push(Number(departmentPrint.id));
  response=await call('php',nodeBase,`/admin/department-card-output-history?paged=1&pageSize=20&departmentId=${scope.departmentId}&q=${encodeURIComponent(marker)}`,{token});const phpHistory=expect(response,200,'PHP Department output history');assert.equal(phpHistory.rows.some(row=>Number(row.id)===Number(departmentPrint.id)&&Number(row.SnapshotID)>0),true);assert.equal(JSON.stringify(phpHistory).includes(departmentQr.rawToken),false,'Department history must not expose raw QR');
  response=await call('node',nodeBase,`/admin/department-card-output-history?paged=1&pageSize=20&departmentId=${scope.departmentId}&q=${encodeURIComponent(marker)}`,{token});const nodeHistory=expect(response,200,'Node Department output history');assert.equal(nodeHistory.rows.some(row=>Number(row.id)===Number(departmentPrint.id)&&Number(row.SnapshotID)>0),true);
  const[snapshots]=await db.query('SELECT SnapshotJSON FROM BBS_Card_Designer_Print_Snapshots WHERE PersonalPrintLogID IN (?) OR DepartmentPrintLogID IN (?)',[created.personalPrints,created.departmentPrints]);assert.equal(snapshots.length,3);for(const row of snapshots){const text=String(row.SnapshotJSON);assert.equal(text.includes(issued.rawToken)||text.includes(replacement.rawToken)||text.includes(departmentQr.rawToken),false,'Print snapshot must never store raw QR');}
  console.log('BBS Card Output E2E: Personal Issue -> Resolve/Claim -> Print -> Replace -> Reprint -> Revoke PASS');
  console.log('BBS Card Output E2E: Department QR -> Resolve/Claim -> Active Designer Output -> Print -> Output History PASS');
  console.log('BBS Card Output E2E: PHP mutation/runtime and Node parity reads/resolution PASS');
}

async function cleanup(){
  if(created.fingerprints.size){const values=[...created.fingerprints];await db.query(`DELETE FROM BBS_QR_Resolve_Attempts WHERE TokenFingerprint IN (${values.map(()=>'?').join(',')})`,values).catch(()=>{});}
  if(created.personalPrints.length||created.departmentPrints.length){const clauses=[],params=[];if(created.personalPrints.length){clauses.push(`PersonalPrintLogID IN (${created.personalPrints.map(()=>'?').join(',')})`);params.push(...created.personalPrints);}if(created.departmentPrints.length){clauses.push(`DepartmentPrintLogID IN (${created.departmentPrints.map(()=>'?').join(',')})`);params.push(...created.departmentPrints);}await db.query(`DELETE FROM BBS_Card_Designer_Print_Snapshots WHERE ${clauses.join(' OR ')}`,params).catch(()=>{});}
  if(created.personalPrints.length)await db.query(`DELETE FROM BBS_Card_Print_Logs WHERE id IN (${created.personalPrints.map(()=>'?').join(',')})`,created.personalPrints).catch(()=>{});
  if(created.departmentPrints.length)await db.query(`DELETE FROM BBS_Department_Card_Print_Logs WHERE id IN (${created.departmentPrints.map(()=>'?').join(',')})`,created.departmentPrints).catch(()=>{});
  if(created.cards.length)await db.query(`DELETE FROM BBS_Cards WHERE id IN (${created.cards.map(()=>'?').join(',')})`,created.cards).catch(()=>{});
  if(created.departmentQrs.length)await db.query(`DELETE FROM BBS_Department_QR_Cards WHERE id IN (${created.departmentQrs.map(()=>'?').join(',')})`,created.departmentQrs).catch(()=>{});
  for(const id of [...created.layouts].reverse()){const[assets]=await db.query('SELECT StoredName FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]).catch(()=>[[]]);for(const asset of assets)if(asset.StoredName)created.files.add(path.join(designerDir,path.basename(asset.StoredName)));await db.query('DELETE FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[id]).catch(()=>{});await db.query('DELETE FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=?',[id]).catch(()=>{});await db.query('DELETE FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]).catch(()=>{});await db.query('DELETE FROM BBS_Card_Layout_Versions WHERE id=?',[id]).catch(()=>{});}
  for(const item of [...created.templates].reverse())await db.query(`DELETE FROM ${item.table} WHERE id=?`,[item.id]).catch(()=>{});
  await db.query("DELETE FROM Admin_AuditLogs WHERE id>? AND Module='bbs'",[auditBaseline]).catch(()=>{});
  if(created.artworkVersions.length)await db.query(`DELETE FROM BBS_Card_Artwork_Versions WHERE id IN (${created.artworkVersions.map(()=>'?').join(',')})`,created.artworkVersions).catch(()=>{});
  if(created.globalRestore){for(const version of created.globalRestore.versions)await db.query('UPDATE BBS_Card_Artwork_Versions SET Status=?,ArchivedAt=? WHERE id=?',[version.Status,version.ArchivedAt,version.id]).catch(()=>{});await db.query('UPDATE BBS_Card_Artwork_Slots SET IsActive=?,RowVersion=?,UpdatedBy=?,UpdatedAt=? WHERE id=?',[created.globalRestore.isActive,created.globalRestore.rowVersion,created.globalRestore.updatedBy,created.globalRestore.updatedAt,created.globalRestore.slotId]).catch(()=>{});}
  if(created.artworkSlots.length)await db.query(`DELETE FROM BBS_Card_Artwork_Slots WHERE id IN (${created.artworkSlots.map(()=>'?').join(',')})`,created.artworkSlots).catch(()=>{});
  for(const file of created.files)await fs.promises.rm(file,{force:true}).catch(()=>{});
  for(const row of originalSettings)await db.query('UPDATE BBS_Settings SET SettingValue=? WHERE SettingKey=?',[row.SettingValue,row.SettingKey]).catch(()=>{});
}

(async()=>{
  localDatabaseOnly();assert.ok(process.env.JWT_SECRET,'JWT_SECRET is required');
  baseline={counts:await counts(),artworkState:await artworkState(),settings:await settingsState(),templates:fileSet(templateDir),designer:fileSet(designerDir),artwork:fileSet(artworkDir)};
  const[[audit]]=await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');auditBaseline=Number(audit.id);
  [originalSettings]=await db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled','department_cards_enabled') ORDER BY SettingKey");
  assert.equal(originalSettings.length,3,'Local BBS Designer and Department Card settings are required.');
  await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled','department_cards_enabled')");
  const users=await loadReadyTestUsers(db),token=tokenFor(users.admin),scope=await prepareFixtures(users.admin.id);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const nodeBase=`http://127.0.0.1:${server.address().port}/api/bbs`;
  const personal=await createTemplateAndLayout(nodeBase,token,'Personal',scope),department=await createTemplateAndLayout(nodeBase,token,'Department',scope);
  await exercise(nodeBase,token,scope,personal,department);
  console.log('BBS Personal + Department reversible Local E2E execution: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  try{await cleanup();if(baseline){const after={counts:await counts(),artworkState:await artworkState(),settings:await settingsState(),templates:fileSet(templateDir),designer:fileSet(designerDir),artwork:fileSet(artworkDir)};assert.deepEqual(after,baseline,'E2E rollback did not restore the database/file/settings baseline');console.log('BBS Personal + Department Local E2E rollback: PASS (database rows, settings, Artwork state and private files restored)');}}
  catch(error){console.error(`Cleanup failed: ${error.stack||error}`);process.exitCode=1;}
  await db.end().catch(()=>{});
});
