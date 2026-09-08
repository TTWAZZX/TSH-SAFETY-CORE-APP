'use strict';

const assert=require('assert/strict');
const crypto=require('crypto');
const fs=require('fs');
const path=require('path');
const jwt=require('jsonwebtoken');
require('dotenv').config({path:path.join(__dirname,'..','.env')});
const app=require('../server');
const db=require('../db');
const {loadReadyTestUsers}=require('./ready-test-users');

const marker=`UAT-BBS-MASTER-${Date.now()}`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const templateDir=path.join(__dirname,'..','private-uploads','bbs-card-templates');
const masterDir=path.join(__dirname,'..','private-uploads','bbs-card-master-artwork');
const assetDir=path.join(__dirname,'..','private-uploads','bbs-card-designer');
const createdMasterFiles=[],createdTemplateFiles=[],layoutIds=[],templateIds=[],masterIds=[];
let server,originalDesignerSetting='0',priorMasterIds=[];
let base='';

function tokenFor(payload){return jwt.sign(payload,process.env.JWT_SECRET,{expiresIn:'15m'});}
async function call(base,route,{method='GET',token,body}={}){const headers={Accept:'application/json'};if(token)headers.Authorization=`Bearer ${token}`;if(body!==undefined)headers['Content-Type']='application/json';const response=await fetch(`${base}${route}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return{status:response.status,json:await response.json()};}
async function upload(base,route,token,name){const form=new FormData();form.set('artwork',new Blob([png],{type:'image/png'}),name);const response=await fetch(`${base}${route}`,{method:'POST',headers:{Accept:'application/json',Authorization:`Bearer ${token}`},body:form});return{status:response.status,json:await response.json()};}
async function cleanup(){
    try{
        for(const id of layoutIds){const[assets]=await db.query('SELECT StoredName FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]);for(const row of assets)await fs.promises.rm(path.join(assetDir,path.basename(row.StoredName)),{force:true});await db.query('DELETE FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[id]);await db.query('DELETE FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=?',[id]);await db.query('DELETE FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]);await db.query('DELETE FROM BBS_Card_Layout_Versions WHERE id=?',[id]);}
        if(templateIds[0])await db.query('DELETE FROM BBS_Card_Templates WHERE id=?',[templateIds[0]]);
        if(templateIds[1])await db.query('DELETE FROM BBS_Department_Card_Templates WHERE id=?',[templateIds[1]]);
        if(masterIds.length)await db.query(`DELETE FROM BBS_Card_Master_Artwork WHERE id IN (${masterIds.map(()=>'?').join(',')})`,masterIds);
        if(priorMasterIds.length)await db.query(`UPDATE BBS_Card_Master_Artwork SET Status='Active',ArchivedAt=NULL WHERE id IN (${priorMasterIds.map(()=>'?').join(',')})`,priorMasterIds);
        await db.query("UPDATE BBS_Settings SET SettingValue=? WHERE SettingKey='visual_card_designer_enabled'",[originalDesignerSetting]);
        for(const file of [...createdMasterFiles,...createdTemplateFiles])await fs.promises.rm(file,{force:true});
        const[[left]]=await db.query("SELECT (SELECT COUNT(*) FROM BBS_Card_Master_Artwork WHERE OriginalName LIKE ?) masters,(SELECT COUNT(*) FROM BBS_Card_Templates WHERE TemplateName LIKE ?) personal,(SELECT COUNT(*) FROM BBS_Department_Card_Templates WHERE TemplateName LIKE ?) department",[`${marker}%`,`${marker}%`,`${marker}%`]);
        assert.deepEqual([Number(left.masters),Number(left.personal),Number(left.department)],[0,0,0]);
        console.log('BBS Master Artwork Local UAT cleanup: PASS (no test records/files remain).');
    }catch(error){console.error(error.stack||error);process.exitCode=1;}
}

(async()=>{
    const users=await loadReadyTestUsers(db),adminToken=tokenFor(users.admin);
    const[[setting]]=await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='visual_card_designer_enabled'");originalDesignerSetting=String(setting?.SettingValue||'0');
    await db.query("UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='visual_card_designer_enabled'");
    fs.mkdirSync(templateDir,{recursive:true});fs.mkdirSync(masterDir,{recursive:true});
    const[prior]=await db.query("SELECT id FROM BBS_Card_Master_Artwork WHERE Status='Active'");priorMasterIds=prior.map(row=>Number(row.id));if(priorMasterIds.length)await db.query("UPDATE BBS_Card_Master_Artwork SET Status='Archived',ArchivedAt=NOW() WHERE Status='Active'");
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/bbs`;
    for(const kind of ['Personal','Department'])for(const side of ['Front','Back']){const response=await upload(base,`/admin/card-master-artwork/${kind.toLowerCase()}/${side.toLowerCase()}`,adminToken,`${marker}-${kind}-${side}.png`);assert.equal(response.status,201,JSON.stringify(response.json));masterIds.push(Number(response.json.data.id));assert.equal(response.json.data.templateKind,kind);assert.equal(response.json.data.side,side);const[[stored]]=await db.query('SELECT StoredName FROM BBS_Card_Master_Artwork WHERE id=?',[response.json.data.id]);createdMasterFiles.push(path.join(masterDir,path.basename(stored.StoredName)));}
    for(const kind of ['Personal','Department']){const stored=`${marker}-${kind}-legacy.png`,file=path.join(templateDir,stored);await fs.promises.writeFile(file,png);createdTemplateFiles.push(file);if(kind==='Personal'){const[result]=await db.query("INSERT INTO BBS_Card_Templates(TemplateName,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,IncludeEmployeeID,Status,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,60,85,1,'Draft',?,?)",[`${marker}-Personal`,stored,stored,'image/png',png.length,users.admin.id,users.admin.id]);templateIds.push(Number(result.insertId));}else{const[[department]]=await db.query('SELECT id FROM Master_Departments ORDER BY id LIMIT 1');assert.ok(department);const[result]=await db.query("INSERT INTO BBS_Department_Card_Templates(TemplateName,DepartmentID,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,DisplayOrder,Status,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?, ?,60,85,0,'Draft',?,?)",[`${marker}-Department`,department.id,stored,stored,'image/png',png.length,users.admin.id,users.admin.id]);templateIds.push(Number(result.insertId));}}
    let response=await call(base,'/admin/card-master-artwork',{token:adminToken});assert.equal(response.status,200,JSON.stringify(response.json));for(const kind of ['Personal','Department'])for(const side of ['Front','Back'])assert.ok(response.json.data.slots[kind][side]);
    for(const [kind,templateId] of [['personal',templateIds[0]],['department',templateIds[1]]]){response=await call(base,`/admin/card-designer/${kind}/${templateId}/versions`,{method:'POST',token:adminToken,body:{}});assert.equal(response.status,201,JSON.stringify(response.json));const layout=response.json.data;layoutIds.push(Number(layout.id));assert.deepEqual(layout.layout.sides.map(side=>side.side),['Front','Back']);for(const side of layout.layout.sides){assert.equal(side.storageClass,'DesignerAsset');assert.equal(side.masterArtworkKind,kind==='personal'?'Personal':'Department');assert.equal(side.masterArtworkSide,side.side);assert.ok(side.masterArtworkId);assert.ok(side.backgroundAssetId);}assert.notEqual(layout.readiness.status,'Blocked');const crossed=structuredClone(layout.layout);crossed.sides[1].backgroundAssetId=crossed.sides[0].backgroundAssetId;response=await call(base,`/admin/card-designer/versions/${layout.id}`,{method:'PUT',token:adminToken,body:{rowVersion:layout.RowVersion,layout:crossed}});assert.equal(response.status,409,JSON.stringify(response.json));assert.equal(response.json.code,'MASTER_ARTWORK_REQUIRED');assert.match(response.json.message,/matching Master Artwork/);}
    const[provenance]=await db.query(`SELECT v.TemplateKind,s.Side,m.TemplateKind MasterKind,m.Side MasterSide FROM BBS_Card_Layout_Versions v JOIN BBS_Card_Layout_Sides s ON s.LayoutVersionID=v.id JOIN BBS_Card_Layout_Assets a ON a.LayoutVersionID=v.id AND a.StoredName=s.BackgroundStoredName JOIN BBS_Card_Master_Artwork m ON m.id=a.MasterArtworkID WHERE v.id IN (?,?) ORDER BY v.TemplateKind,s.Side`,layoutIds);
    assert.equal(provenance.length,4);assert.ok(provenance.every(row=>row.TemplateKind===row.MasterKind&&row.Side===row.MasterSide));
    console.log('BBS Master Artwork Local UAT: 4 isolated slots, immutable snapshots and cross-side rejection: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await cleanup();await db.end().catch(()=>{});});
