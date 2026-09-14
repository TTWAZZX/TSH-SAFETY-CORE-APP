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

const marker=`UAT-BBS-ARTWORK-TEMPLATE-${Date.now()}`;
const phpBase=String(process.env.LOCAL_PHP_UAT_URL||'http://localhost/tsh-safety-core/api/index.php?route=').replace(/\/+$/,'');
const templateDir=path.join(__dirname,'..','private-uploads','bbs-card-templates');
const designerDir=path.join(__dirname,'..','private-uploads','bbs-card-designer');
const artworkDir=path.join(__dirname,'..','private-uploads','bbs-card-master-artwork');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const created={templates:[],layouts:[],artworkSlots:[],artworkVersions:[],globalRestore:null,files:new Set(),auditTargets:[]};
let server,baseline;

function tokenFor(user){return jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'15m'});}
function localDatabaseOnly(){const host=String(process.env.DB_HOST||'').trim().toLowerCase();assert.ok(['localhost','127.0.0.1','::1'].includes(host),`Refusing mutable UAT against non-local DB_HOST ${host||'(empty)'}`);}
function fileSet(dir){if(!fs.existsSync(dir))return[];return fs.readdirSync(dir).sort();}

async function counts(){
    const tables=['BBS_Card_Templates','BBS_Department_Card_Templates','BBS_Card_Layout_Versions','BBS_Card_Layout_Sides','BBS_Card_Layout_Elements','BBS_Card_Layout_Assets','BBS_Card_Artwork_Slots','BBS_Card_Artwork_Versions','Admin_AuditLogs'];
    const result={};for(const table of tables){const[[row]]=await db.query(`SELECT COUNT(*) total FROM ${table}`);result[table]=Number(row.total);}
    return result;
}
async function artworkState(){const[rows]=await db.query("SELECT s.id slotId,s.IsActive,s.RowVersion,v.id versionId,v.Status,v.ArchivedAt FROM BBS_Card_Artwork_Slots s LEFT JOIN BBS_Card_Artwork_Versions v ON v.ArtworkSlotID=s.id ORDER BY s.id,v.id");return rows;}

async function call(stack,nodeBase,route,{method='GET',token,body,form}={}){
    const url=stack==='node'?`${nodeBase}${route}`:`${phpBase}bbs${route.includes('?')?route.replace('?','&'):route}`;
    const headers={Accept:'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
    let payload;if(form)payload=form;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
    const response=await fetch(url,{method,headers,body:payload}),text=await response.text();let json;
    try{json=JSON.parse(text);}catch{const start=text.indexOf('{');if(start<0)throw new Error(`${stack} ${route} returned ${response.status}: ${text.slice(0,240)}`);json=JSON.parse(text.slice(start));}
    return{status:response.status,json};
}

async function prepareIsolatedScopes(actor){
    const[globalRows]=await db.query("SELECT v.StoredName,v.MimeType FROM BBS_Card_Artwork_Slots s JOIN BBS_Card_Artwork_Versions v ON v.ArtworkSlotID=s.id AND v.Status='Active' WHERE s.IsActive=1 AND s.SlotKey='BACK:GLOBAL' ORDER BY v.id DESC");
    const needsGlobalFixture=!globalRows.some(row=>['image/png','image/jpeg','image/webp'].includes(row.MimeType)&&fs.existsSync(path.join(artworkDir,path.basename(String(row.StoredName||'')))));
    const[candidates]=await db.query("SELECT d.id departmentId,u.id safetyUnitId FROM Master_Departments d LEFT JOIN Master_SafetyUnits u ON u.department_id=d.id WHERE d.Status='Active' ORDER BY u.id IS NULL,u.id,d.id");
    let scope=null;
    for(const row of candidates){const departmentId=Number(row.departmentId),safetyUnitId=row.safetyUnitId==null?null:Number(row.safetyUnitId),keys=['Personal','Department'].map(kind=>scopedFrontSlotKey(kind,departmentId,safetyUnitId));const[[found]]=await db.query('SELECT COUNT(*) total FROM BBS_Card_Artwork_Slots WHERE SlotKey IN (?)',[keys]);if(Number(found.total)===0){scope={departmentId,safetyUnitId};break;}}
    assert.ok(scope,'Local prerequisite missing: no unused Department/Unit scope is available for reversible Artwork fixtures.');
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        if(needsGlobalFixture){
            let[[slot]]=await connection.query("SELECT * FROM BBS_Card_Artwork_Slots WHERE SlotKey='BACK:GLOBAL' FOR UPDATE");
            if(!slot){const[result]=await connection.query("INSERT INTO BBS_Card_Artwork_Slots(SlotKey,ArtworkRole,TemplateKind,DepartmentID,SafetyUnitID,IsActive,CreatedBy,UpdatedBy) VALUES('BACK:GLOBAL','GlobalBack',NULL,NULL,NULL,1,?,?)",[actor,actor]);slot={id:Number(result.insertId)};created.artworkSlots.push(Number(slot.id));}
            else{const[versions]=await connection.query('SELECT id,Status,ArchivedAt FROM BBS_Card_Artwork_Versions WHERE ArtworkSlotID=? ORDER BY id',[slot.id]);created.globalRestore={slotId:Number(slot.id),isActive:Number(slot.IsActive),rowVersion:Number(slot.RowVersion),updatedBy:slot.UpdatedBy,updatedAt:slot.UpdatedAt,versions};await connection.query("UPDATE BBS_Card_Artwork_Versions SET Status='Archived',ArchivedAt=NOW() WHERE ArtworkSlotID=? AND Status='Active'",[slot.id]);}
            const stored=`${marker}-Global-Back.png`,target=path.join(artworkDir,stored);fs.mkdirSync(artworkDir,{recursive:true});await fs.promises.writeFile(target,png);created.files.add(target);
            const[[next]]=await connection.query('SELECT COALESCE(MAX(VersionNo),0)+1 nextNo FROM BBS_Card_Artwork_Versions WHERE ArtworkSlotID=?',[slot.id]);
            const[version]=await connection.query("INSERT INTO BBS_Card_Artwork_Versions(ArtworkSlotID,VersionNo,StoredName,OriginalName,MimeType,FileSize,PixelWidth,PixelHeight,Status,CreatedBy,ActivatedAt) VALUES(?,?,?,?, 'image/png',?,1,1,'Active',?,NOW())",[slot.id,Number(next.nextNo),stored,`${marker}-Global-Back.png`,png.length,actor]);created.artworkVersions.push(Number(version.insertId));
            await connection.query('UPDATE BBS_Card_Artwork_Slots SET IsActive=1,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?',[actor,slot.id]);
        }
        for(const kind of ['Personal','Department']){
            const stored=`${marker}-${kind}-front.png`,target=path.join(artworkDir,stored);fs.mkdirSync(artworkDir,{recursive:true});await fs.promises.writeFile(target,png);created.files.add(target);
            const slotKey=scopedFrontSlotKey(kind,scope.departmentId,scope.safetyUnitId),[slot]=await connection.query("INSERT INTO BBS_Card_Artwork_Slots(SlotKey,ArtworkRole,TemplateKind,DepartmentID,SafetyUnitID,IsActive,CreatedBy,UpdatedBy) VALUES(?,'ScopedFront',?,?,?,?,?,?)",[slotKey,kind,scope.departmentId,scope.safetyUnitId,1,actor,actor]);
            const slotId=Number(slot.insertId);created.artworkSlots.push(slotId);
            const[version]=await connection.query("INSERT INTO BBS_Card_Artwork_Versions(ArtworkSlotID,VersionNo,StoredName,OriginalName,MimeType,FileSize,PixelWidth,PixelHeight,Status,CreatedBy,ActivatedAt) VALUES(?,1,?,?, 'image/png',?,1,1,'Active',?,NOW())",[slotId,stored,`${marker}-${kind}-front.png`,png.length,actor]);created.artworkVersions.push(Number(version.insertId));
        }
        await connection.commit();
    }catch(error){await connection.rollback().catch(()=>{});throw error;}finally{connection.release();}
    const result={};for(const kind of ['Personal','Department']){const resolved=await resolveActiveArtwork(db,{kind,...scope});assert.deepEqual(resolved.missing,[]);result[kind]={kind,...scope,resolved};}
    return result;
}

async function exercise(stack,nodeBase,kind,scope,token){
    const lower=kind.toLowerCase(),form=new FormData();
    form.set('templateName',`${marker}-${stack}-${kind}`);form.set('departmentId',String(scope.departmentId));form.set('safetyUnitId',scope.safetyUnitId?String(scope.safetyUnitId):'');form.set('widthMM','60');form.set('heightMM','85');
    if(kind==='Personal'){form.set('bbsLevel','');form.set('includeEmployeeId','1');}else form.set('displayOrder','0');
    const createRoute=kind==='Personal'?'/admin/card-templates':'/admin/department-card-templates';
    let response=await call(stack,nodeBase,createRoute,{method:'POST',token,form});
    assert.equal(response.status,201,`${stack} ${kind} template create: ${JSON.stringify(response.json)}`);
    const templateId=Number(response.json.data.id),table=kind==='Personal'?'BBS_Card_Templates':'BBS_Department_Card_Templates';
    created.templates.push({kind,id:templateId,table});created.auditTargets.push([kind==='Personal'?'BBS_Card_Template':'BBS_Department_Card_Template',templateId]);
    const[[template]]=await db.query(`SELECT * FROM ${table} WHERE id=?`,[templateId]);
    const fallback=path.join(templateDir,path.basename(template.BackgroundStoredName));created.files.add(fallback);
    assert.ok(fs.existsSync(fallback),`${stack} ${kind} fallback file missing`);
    const frontFile=path.join(artworkDir,path.basename(scope.resolved.front.StoredName));
    assert.deepEqual(fs.readFileSync(fallback),fs.readFileSync(frontFile),`${stack} ${kind} fallback differs from resolved Scoped Front`);
    assert.equal(template.OriginalName,scope.resolved.front.OriginalName);

    response=await call(stack,nodeBase,`/admin/card-designer/${lower}/${templateId}/versions`,{method:'POST',token,body:{}});
    assert.equal(response.status,201,`${stack} ${kind} Designer Draft create: ${JSON.stringify(response.json)}`);
    const layoutId=Number(response.json.data.id);created.layouts.push(layoutId);created.auditTargets.push(['BBS_Card_Layout_Version',layoutId]);
    const sides=response.json.data.layout.sides;
    assert.deepEqual(sides.map(side=>side.side),['Front','Back']);
    assert.ok(sides.every(side=>side.storageClass==='CardArtwork'));
    assert.equal(Number(sides.find(side=>side.side==='Front').artworkVersionId),Number(scope.resolved.front.ArtworkVersionID));
    assert.equal(Number(sides.find(side=>side.side==='Back').artworkVersionId),Number(scope.resolved.back.ArtworkVersionID));
    assert.notEqual(response.json.data.readiness.status,'Blocked');

    response=await call(stack,nodeBase,`/admin/card-designer/versions/${layoutId}`,{token});assert.equal(response.status,200,JSON.stringify(response.json));
    const detail=response.json.data;
    response=await call(stack,nodeBase,`/admin/card-designer/versions/${layoutId}`,{method:'PUT',token,body:{rowVersion:detail.RowVersion,layout:detail.layout}});
    assert.equal(response.status,200,`${stack} ${kind} Designer Draft save: ${JSON.stringify(response.json)}`);
    assert.notEqual(response.json.data.readiness.status,'Blocked');
    console.log(`${stack.toUpperCase()} ${kind}: artwork resolve -> fileless Template -> Designer Draft -> Save PASS`);
}

async function cleanup(){
    for(const id of [...created.layouts].reverse()){
        const[assets]=await db.query('SELECT StoredName FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]).catch(()=>[[]]);
        for(const asset of assets)if(asset.StoredName)created.files.add(path.join(designerDir,path.basename(asset.StoredName)));
        await db.query('DELETE FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[id]).catch(()=>{});
        await db.query('DELETE FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=?',[id]).catch(()=>{});
        await db.query('DELETE FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]).catch(()=>{});
        await db.query('DELETE FROM BBS_Card_Layout_Versions WHERE id=?',[id]).catch(()=>{});
    }
    for(const item of [...created.templates].reverse())await db.query(`DELETE FROM ${item.table} WHERE id=?`,[item.id]).catch(()=>{});
    for(const[target,id]of created.auditTargets)await db.query("DELETE FROM Admin_AuditLogs WHERE Module='bbs' AND TargetType=? AND TargetID=?",[target,String(id)]).catch(()=>{});
    if(created.artworkVersions.length)await db.query(`DELETE FROM BBS_Card_Artwork_Versions WHERE id IN (${created.artworkVersions.map(()=>'?').join(',')})`,created.artworkVersions).catch(()=>{});
    if(created.globalRestore){for(const version of created.globalRestore.versions)await db.query('UPDATE BBS_Card_Artwork_Versions SET Status=?,ArchivedAt=? WHERE id=?',[version.Status,version.ArchivedAt,version.id]).catch(()=>{});await db.query('UPDATE BBS_Card_Artwork_Slots SET IsActive=?,RowVersion=?,UpdatedBy=?,UpdatedAt=? WHERE id=?',[created.globalRestore.isActive,created.globalRestore.rowVersion,created.globalRestore.updatedBy,created.globalRestore.updatedAt,created.globalRestore.slotId]).catch(()=>{});}
    if(created.artworkSlots.length)await db.query(`DELETE FROM BBS_Card_Artwork_Slots WHERE id IN (${created.artworkSlots.map(()=>'?').join(',')})`,created.artworkSlots).catch(()=>{});
    for(const file of created.files)await fs.promises.rm(file,{force:true}).catch(()=>{});
}

(async()=>{
    localDatabaseOnly();assert.ok(process.env.JWT_SECRET,'JWT_SECRET is required');
    baseline={counts:await counts(),artworkState:await artworkState(),templates:fileSet(templateDir),designer:fileSet(designerDir),artwork:fileSet(artworkDir)};
    const[[setting]]=await db.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='visual_card_designer_enabled'");assert.equal(String(setting?.SettingValue),'1','Local visual_card_designer_enabled must already be 1; UAT will not change rollout flags.');
    const users=await loadReadyTestUsers(db),token=tokenFor(users.admin),scopes=await prepareIsolatedScopes(users.admin.id);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const nodeBase=`http://127.0.0.1:${server.address().port}/api/bbs`;
    const phpProbe=await call('php',nodeBase,'/admin/card-artwork',{token});assert.equal(phpProbe.status,200,`PHP local API prerequisite failed: ${JSON.stringify(phpProbe.json)}`);
    for(const stack of ['node','php'])for(const kind of ['Personal','Department'])await exercise(stack,nodeBase,kind,scopes[kind],token);
    console.log('BBS Artwork-first reversible Local E2E execution: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
    if(server)await new Promise(resolve=>server.close(resolve));
    try{
        await cleanup();
        if(baseline){const after={counts:await counts(),artworkState:await artworkState(),templates:fileSet(templateDir),designer:fileSet(designerDir),artwork:fileSet(artworkDir)};assert.deepEqual(after,baseline,'Local UAT rollback did not restore the database/file baseline');console.log('BBS Artwork-first Local E2E rollback: PASS (database rows, Artwork state and private files restored to baseline)');}
    }catch(error){console.error(`Cleanup failed: ${error.message}`);process.exitCode=1;}
    await db.end().catch(()=>{});
});
