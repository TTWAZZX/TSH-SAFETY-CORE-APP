'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path:path.join(__dirname, '..', '.env') });
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const chromePath = process.env.BBS_PHASE10F2_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.BBS_PHASE10F2_APP_URL || 'http://127.0.0.1/tsh-safety-core/index.html';
const cdpPort = Number(process.env.BBS_PHASE10F2_CDP_PORT || 9852);
const marker = `UAT-BBS10F2-BROWSER-${Date.now()}`;
const presetMarker = `${marker}-PRESET`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
const templateDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-templates');
const masterDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-master-artwork');
const assetDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-designer');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs10f2-browser-'));
const pending = new Map();
const consoleErrors = [];
let commandId = 1;
let socket;
let chrome;
let server;
let templateId;
const masterIds = [];
const masterFiles = [];
let priorMasterIds = [];
let auditBaseline = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(method, params={}, timeout=60000) {
    const id = commandId++;
    return new Promise((resolve,reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, timeout);
        pending.set(id, { resolve,reject,timer });
        socket.send(JSON.stringify({ id,method,params }));
    });
}
async function evaluate(expression) {
    const result = await command('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
}
async function waitFor(expression, timeout=45000) {
    const started = Date.now();
    while (Date.now()-started<timeout) { if(await evaluate(expression)) return; await sleep(250); }
    throw new Error(`Timed out: ${expression}; console=${consoleErrors.join(' | ')}`);
}
async function connectChrome(apiUrl) {
    chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-allow-origins=*','--window-size=1365,900',`--remote-debugging-port=${cdpPort}`,`--user-data-dir=${profile}`,'about:blank'], { stdio:'ignore',windowsHide:true });
    let targets;
    for(let i=0;i<60;i++){try{const response=await fetch(`http://127.0.0.1:${cdpPort}/json`);if(response.ok){targets=await response.json();break;}}catch(_){}await sleep(250);}
    const page=targets?.find(row=>row.type==='page');assert.ok(page?.webSocketDebuggerUrl,'Chrome target unavailable');
    socket=new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:','://127.0.0.1:'));
    socket.addEventListener('message',async event=>{let raw=event.data;if(raw&&typeof raw.text==='function')raw=await raw.text();if(raw instanceof ArrayBuffer)raw=Buffer.from(raw).toString('utf8');const message=JSON.parse(String(raw));if(message.method==='Runtime.exceptionThrown')consoleErrors.push(message.params?.exceptionDetails?.exception?.description||message.params?.exceptionDetails?.text||'Runtime exception');if(message.method==='Runtime.consoleAPICalled'&&message.params?.type==='error')consoleErrors.push((message.params.args||[]).map(x=>x.value||x.description||'').join(' '));const current=pending.get(message.id);if(!current)return;pending.delete(message.id);clearTimeout(current.timer);message.error?current.reject(new Error(message.error.message)):current.resolve(message.result);});
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    await command('Page.enable');await command('Runtime.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};`});
}

async function cleanup() {
    if(templateId){const[versions]=await db.query('SELECT id FROM BBS_Card_Layout_Versions WHERE PersonalTemplateID=?',[templateId]).catch(()=>[[]]);for(const version of versions){const id=Number(version.id);const[assets]=await db.query('SELECT StoredName FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]).catch(()=>[[]]);await db.query('DELETE FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[id]).catch(()=>{});await db.query('DELETE FROM BBS_Card_Layout_Sides WHERE LayoutVersionID=?',[id]).catch(()=>{});await db.query('DELETE FROM BBS_Card_Layout_Assets WHERE LayoutVersionID=?',[id]).catch(()=>{});await db.query('DELETE FROM BBS_Card_Layout_Versions WHERE id=?',[id]).catch(()=>{});for(const asset of assets)await fs.promises.rm(path.join(__dirname,'..','private-uploads','bbs-card-designer',path.basename(asset.StoredName)),{force:true}).catch(()=>{});}await db.query('DELETE FROM BBS_Card_Templates WHERE id=?',[templateId]).catch(()=>{});}
    if(masterIds.length)await db.query(`DELETE FROM BBS_Card_Master_Artwork WHERE id IN (${masterIds.map(()=>'?').join(',')})`,masterIds).catch(()=>{});
    if(priorMasterIds.length)await db.query(`UPDATE BBS_Card_Master_Artwork SET Status='Active',ArchivedAt=NULL WHERE id IN (${priorMasterIds.map(()=>'?').join(',')})`,priorMasterIds).catch(()=>{});
    await db.query('DELETE FROM BBS_Card_Layout_Presets WHERE PresetName=?',[presetMarker]).catch(()=>{});
    if(auditBaseline)await db.query("DELETE FROM Admin_AuditLogs WHERE id>? AND Module='bbs' AND TargetType IN ('BBS_Card_Layout_Version','BBS_Card_Layout_Asset','BBS_Card_Layout_Preset')",[auditBaseline]).catch(()=>{});
    await fs.promises.rm(path.join(templateDir,`${marker}.png`),{force:true}).catch(()=>{});
    for(const file of masterFiles)await fs.promises.rm(file,{force:true}).catch(()=>{});
    const[[remaining]]=await db.query('SELECT (SELECT COUNT(*) FROM BBS_Card_Templates WHERE TemplateName=?) templates,(SELECT COUNT(*) FROM BBS_Card_Layout_Versions WHERE PersonalTemplateID=?) versions,(SELECT COUNT(*) FROM BBS_Card_Master_Artwork WHERE OriginalName LIKE ?) masters,(SELECT COUNT(*) FROM BBS_Card_Layout_Presets WHERE PresetName=?) presets',[marker,templateId||0,`${marker}%`,presetMarker]).catch(()=>[[{templates:-1,versions:-1,masters:-1,presets:-1}]]);
    console.log(`BBS Phase 10F-2 browser cleanup: templates=${remaining.templates}, versions=${remaining.versions}, masters=${remaining.masters}, presets=${remaining.presets}`);
    assert.deepStrictEqual([Number(remaining.templates),Number(remaining.versions),Number(remaining.masters),Number(remaining.presets)],[0,0,0,0]);
}

(async()=>{
    assert.ok(fs.existsSync(chromePath),'Chrome is required');
    const ready=await loadReadyTestUsers(db),admin=ready.admin,token=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'20m'});
    const[[audit]]=await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');auditBaseline=Number(audit.id);
    fs.mkdirSync(templateDir,{recursive:true});fs.mkdirSync(masterDir,{recursive:true});await fs.promises.writeFile(path.join(templateDir,`${marker}.png`),png);
    const[priorMasters]=await db.query("SELECT id FROM BBS_Card_Master_Artwork WHERE TemplateKind='Personal' AND Status='Active'");priorMasterIds=priorMasters.map(row=>Number(row.id));if(priorMasterIds.length)await db.query("UPDATE BBS_Card_Master_Artwork SET Status='Archived',ArchivedAt=NOW() WHERE TemplateKind='Personal' AND Status='Active'");
    for(const side of ['Front','Back']){const stored=`${marker}-${side}.png`,file=path.join(masterDir,stored);await fs.promises.writeFile(file,png);masterFiles.push(file);const[[next]]=await db.query("SELECT COALESCE(MAX(VersionNo),0)+1 nextNo FROM BBS_Card_Master_Artwork WHERE TemplateKind='Personal' AND Side=?",[side]);const[result]=await db.query("INSERT INTO BBS_Card_Master_Artwork(TemplateKind,Side,VersionNo,StoredName,OriginalName,MimeType,FileSize,PixelWidth,PixelHeight,Status,CreatedBy,ActivatedAt) VALUES('Personal',?,?,?,?, 'image/png',?,1,1,'Active',?,NOW())",[side,Number(next.nextNo),stored,stored,png.length,admin.id]);masterIds.push(Number(result.insertId));}
    const[result]=await db.query("INSERT INTO BBS_Card_Templates(TemplateName,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,Status,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,85.60,53.98,'Draft',?,?)",[marker,`${marker}.png`,`${marker}.png`,'image/png',png.length,admin.id,admin.id]);templateId=Number(result.insertId);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const apiUrl=`http://127.0.0.1:${server.address().port}`;
    await connectChrome(apiUrl);await command('Page.navigate',{url:appUrl});await sleep(1500);
    const user={id:admin.id,EmployeeID:admin.id,name:admin.name,EmployeeName:admin.name,role:admin.role,Role:admin.role,department:admin.department,Department:admin.department,unit:admin.unit,Unit:admin.unit,position:admin.position,Position:admin.position};
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`document.querySelector('[data-bbs-group="admin"]')`);
    const initialPerformance=await evaluate(`(()=>{const summary=window.BBSPerformance?.summary?.()||[];return{summary,bbsRequests:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/api/bbs/')).length};})()`);
    assert.ok(initialPerformance.summary.some(row=>row.name==='section:core'),'Default BBS entry must load the active Core workspace');
    for(const inactive of ['section:community','section:inspectors','section:cards'])assert.ok(!initialPerformance.summary.some(row=>row.name===inactive),`Default BBS entry loaded inactive ${inactive}`);
    await evaluate(`document.querySelector('[data-bbs-group="admin"]').click()`);
    await waitFor(`document.querySelector('[data-bbs-tab="cards"]')`);await evaluate(`document.querySelector('[data-bbs-tab="cards"]').click()`);
    await waitFor(`document.querySelector('[data-card-workspace="personal"]')`);await evaluate(`document.querySelector('[data-card-workspace="personal"]').click()`);
    await waitFor(`document.querySelector('[data-card-designer-personal="${templateId}"]')`);await evaluate(`document.querySelector('[data-card-designer-personal="${templateId}"]').click()`);
    await waitFor(`document.querySelector('[data-designer-create]')`);await evaluate(`document.querySelector('[data-designer-create]').click()`);
    await waitFor(`document.querySelector('[data-designer-canvas]') && document.querySelector('[data-add-static]')`);
    const initialPreview=await evaluate(`window.BBSDesignerPreview?.stats?.()||[]`);
    assert.ok(initialPreview.some(row=>row.side==='Front'&&row.role==='background'),'Designer must load the initially active Front preview');
    assert.ok(!initialPreview.some(row=>row.side==='Back'),'Designer must defer Back resources until that side is opened');
    assert.ok(!initialPreview.some(row=>row.role==='element'),'Designer must not load unreferenced private assets');
    const resourcesBeforeBack=await evaluate(`performance.getEntriesByType('resource').length`);
    await evaluate(`document.querySelector('.bbs-designer-dialog button[data-side="Back"]').click()`);
    await waitFor(`(window.BBSDesignerPreview?.stats?.()||[]).some(row=>row.side==='Back'&&row.role==='background') && !document.getElementById('bbs-operation-status')`);
    const backPreviewRequests=await evaluate(`performance.getEntriesByType('resource').slice(${resourcesBeforeBack}).filter(entry=>entry.name.includes('/api/')).map(entry=>new URL(entry.name,location.href).pathname)`);
    assert.deepStrictEqual(backPreviewRequests.filter(pathname=>pathname.includes('/api/bbs/admin/card-designer/')),backPreviewRequests,'Back switch must not request non-Designer data');
    assert.equal(backPreviewRequests.filter(pathname=>pathname.endsWith('/sides/back/background')).length,1,'Back switch must request only its background when it has no referenced image element');
    assert.ok(!backPreviewRequests.some(pathname=>pathname.endsWith('/sides/front/background')),'Back switch must not reload Front artwork');
    await evaluate(`document.querySelector('.bbs-designer-dialog button[data-side="Front"]').click()`);
    await waitFor(`document.querySelector('[data-designer-canvas]')?.getAttribute('aria-label')==='Front card canvas'`);
    let desktop=await evaluate(`(()=>({dialog:document.querySelector('.bbs-designer-dialog')?.getAttribute('role'),canvas:Boolean(document.querySelector('[data-designer-canvas]')),preview:document.querySelector('.bbs-designer-dialog')?.innerText.includes('PREVIEW ONLY'),save:Boolean(document.querySelector('[data-save]')),overflow:document.querySelector('.bbs-designer-dialog')?.scrollWidth>document.querySelector('.bbs-designer-dialog')?.clientWidth+2}))()`);
    assert.deepStrictEqual(desktop,{dialog:'dialog',canvas:true,preview:true,save:true,overflow:false});
    const before=await evaluate(`document.querySelectorAll('[data-designer-element]').length`);await evaluate(`document.querySelector('[data-add-static]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length>${before}`);await evaluate(`document.querySelector('[data-undo]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length===${before}`);await evaluate(`document.querySelector('[data-redo]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length>${before}`);
    const resourcesBeforeSave=await evaluate(`performance.getEntriesByType('resource').length`);
    await evaluate(`document.querySelector('[data-save]').click()`);
    await waitFor(`document.querySelector('[data-save]') && !document.querySelector('[data-save]').hasAttribute('aria-busy') && !document.getElementById('bbs-operation-status')`);
    const saveRequests=await evaluate(`performance.getEntriesByType('resource').slice(${resourcesBeforeSave}).filter(entry=>entry.name.includes('/api/')).map(entry=>new URL(entry.name,location.href).pathname)`);
    assert.equal(saveRequests.filter(pathname=>pathname.includes('/api/bbs/admin/card-designer/versions/')).length,1,'Designer Save must issue only its Draft update request');
    assert.ok(!saveRequests.some(pathname=>pathname.includes('/background')||pathname.includes('/assets/')),'Designer Save must reuse unchanged image resources');
    await evaluate(`(()=>{window.prompt=()=>${JSON.stringify(presetMarker)};document.querySelector('[data-preset-save]').click();return true;})()`);
    await waitFor(`[...document.querySelectorAll('[data-preset-select] option')].some(option=>option.textContent===${JSON.stringify(presetMarker)}) && !document.getElementById('bbs-operation-status')`);
    const presetId=await evaluate(`Number([...document.querySelectorAll('[data-preset-select] option')].find(option=>option.textContent===${JSON.stringify(presetMarker)})?.value||0)`);
    assert.ok(presetId>0,'Targeted Preset fixture was not created');
    const resourcesBeforeApply=await evaluate(`performance.getEntriesByType('resource').length`);
    await evaluate(`(()=>{window.confirm=()=>true;const select=document.querySelector('[data-preset-select]');select.value='${presetId}';select.dispatchEvent(new Event('change'));document.querySelector('[data-preset-apply]').click();return true;})()`);
    await waitFor(`document.querySelector('[data-preset-apply]') && !document.querySelector('[data-preset-apply]').hasAttribute('aria-busy') && !document.getElementById('bbs-operation-status')`);
    const applyRequests=await evaluate(`performance.getEntriesByType('resource').slice(${resourcesBeforeApply}).filter(entry=>entry.name.includes('/api/')).map(entry=>new URL(entry.name,location.href).pathname)`);
    assert.deepStrictEqual(applyRequests,[`/api/bbs/admin/card-layout-presets/${presetId}/apply`],'Apply Preset must issue only its mutation request');
    const resourcesBeforePresetTrash=await evaluate(`performance.getEntriesByType('resource').length`);
    await evaluate(`(()=>{const select=document.querySelector('[data-preset-select]');select.value='${presetId}';select.dispatchEvent(new Event('change'));document.querySelector('[data-preset-trash]').click();return true;})()`);
    await waitFor(`document.querySelector('[data-preset-restore="${presetId}"]') && !document.getElementById('bbs-operation-status')`);
    const presetTrashRequests=await evaluate(`performance.getEntriesByType('resource').slice(${resourcesBeforePresetTrash}).filter(entry=>entry.name.includes('/api/')).map(entry=>new URL(entry.name,location.href).pathname)`);
    assert.deepStrictEqual(presetTrashRequests,[`/api/bbs/admin/card-layout-presets/${presetId}`],'Preset Trash must update only its confirmed in-memory catalogs');
    const[[draftRow]]=await db.query("SELECT id FROM BBS_Card_Layout_Versions WHERE PersonalTemplateID=? AND Status='Draft' AND IsDeleted=0 ORDER BY VersionNo DESC LIMIT 1",[templateId]);assert.ok(draftRow?.id,'Designer Draft fixture missing before legacy rebase browser test');const layoutId=Number(draftRow.id),legacyAssetIds=[];for(const side of ['Front','Back']){const stored=`${marker}-legacy-${side}.png`;await fs.promises.writeFile(path.join(assetDir,stored),png);const[asset]=await db.query("INSERT INTO BBS_Card_Layout_Assets(LayoutVersionID,AssetKey,StoredName,OriginalName,MimeType,FileSize,Status,CreatedBy) VALUES(?,?,?,?,?,?,'Active',?)",[layoutId,`${marker}-legacy-${side}`,stored,stored,'image/png',png.length,admin.id]);legacyAssetIds.push(Number(asset.insertId));await db.query("UPDATE BBS_Card_Layout_Sides SET StorageClass='DesignerAsset',BackgroundStoredName=?,BackgroundOriginalName=?,BackgroundMimeType='image/png',BackgroundFileSize=? WHERE LayoutVersionID=? AND Side=?",[stored,stored,png.length,layoutId,side]);}
    await evaluate(`document.querySelector('[data-designer-close]').click()`);await waitFor(`!document.querySelector('.bbs-designer-overlay')`);await evaluate(`document.querySelector('[data-card-designer-personal="${templateId}"]').click()`);await waitFor(`document.querySelector('[data-designer-open]')`);await evaluate(`document.querySelector('[data-designer-open]').click()`);await waitFor(`document.querySelector('[data-master-artwork-rebase]') && document.querySelector('[data-master-artwork-rebase-note]')`);
    const repairPrompt=await evaluate(`({note:document.querySelector('[data-master-artwork-rebase-note]').textContent,saveDisabled:document.querySelector('[data-save]').disabled,button:document.querySelector('[data-master-artwork-rebase]').textContent})`);assert.ok(repairPrompt.note.includes('เปลี่ยนเฉพาะภาพพื้นหลัง Front/Back'),'Visible rebase impact note is missing');assert.equal(repairPrompt.saveDisabled,true,'Normal Save must remain disabled until legacy Master Artwork is repaired');assert.ok(repairPrompt.button.includes('ซ่อม Master Artwork'),'Rebase action label is missing');
    const[[storedElementsBeforeRepair]]=await db.query('SELECT COUNT(*) count FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[layoutId]);const elementCountBeforeRepair=await evaluate(`document.querySelectorAll('[data-designer-element]').length`);await evaluate(`document.querySelector('[data-add-static]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length>${elementCountBeforeRepair}`);const resourcesBeforeRepair=await evaluate(`performance.getEntriesByType('resource').length`);await evaluate(`(()=>{window.confirm=()=>true;document.querySelector('[data-master-artwork-rebase]').click();return true;})()`);await waitFor(`!document.querySelector('[data-master-artwork-rebase]') && !document.getElementById('bbs-operation-status')`);const repairRequests=await evaluate(`performance.getEntriesByType('resource').slice(${resourcesBeforeRepair}).filter(entry=>entry.name.includes('/api/')).map(entry=>new URL(entry.name,location.href).pathname)`);assert.ok(repairRequests.includes(`/api/bbs/admin/card-designer/versions/${layoutId}/master-artwork-rebase`),'Browser must call the targeted Master Artwork rebase endpoint');const[[preservedElement]]=await db.query('SELECT COUNT(*) count FROM BBS_Card_Layout_Elements WHERE LayoutVersionID=?',[layoutId]);assert.equal(Number(preservedElement.count),Number(storedElementsBeforeRepair.count)+1,'Rebase must preserve the unsaved element submitted by the browser');const[repairedSides]=await db.query('SELECT s.Side,a.MasterArtworkID,m.TemplateKind,m.Side MasterSide FROM BBS_Card_Layout_Sides s JOIN BBS_Card_Layout_Assets a ON a.LayoutVersionID=s.LayoutVersionID AND a.StoredName=s.BackgroundStoredName JOIN BBS_Card_Master_Artwork m ON m.id=a.MasterArtworkID WHERE s.LayoutVersionID=? ORDER BY FIELD(s.Side,\'Front\',\'Back\')',[layoutId]);assert.equal(repairedSides.length,2);assert.ok(repairedSides.every(row=>row.MasterArtworkID&&row.TemplateKind==='Personal'&&row.Side===row.MasterSide),'Repaired sides must use matching Personal Master Artwork snapshots');const[[retainedLegacy]]=await db.query(`SELECT COUNT(*) count FROM BBS_Card_Layout_Assets WHERE id IN (${legacyAssetIds.map(()=>'?').join(',')}) AND Status='Active'`,legacyAssetIds);assert.equal(Number(retainedLegacy.count),2,'Legacy assets must remain retained after repair');await evaluate(`document.querySelector('[data-add-shape]').click()`);await waitFor(`document.querySelector('[data-save]') && !document.querySelector('[data-save]').disabled`);await evaluate(`document.querySelector('[data-save]').click()`);await waitFor(`document.querySelector('[data-save]') && !document.querySelector('[data-save]').hasAttribute('aria-busy') && !document.getElementById('bbs-operation-status')`);
    const performanceBaseline=await evaluate(`window.BBSPerformance?.summary?.()||[]`);
    assert.ok(performanceBaseline.some(row=>row.name==='page:initial-load'),'BBS initial-load performance metric is missing');
    assert.ok(performanceBaseline.some(row=>row.name==='designer:กำลังสร้างแบบร่าง...'),'Designer create performance metric is missing');
    assert.ok(performanceBaseline.some(row=>row.name==='designer:กำลังบันทึกแบบร่าง...'),'Designer save performance metric is missing');
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(500);
    const mobile=await evaluate(`(()=>{const note=document.querySelector('.bbs-designer-mobile-note'),save=document.querySelector('[data-save]'),left=document.querySelector('.bbs-designer-panel:first-child');return{note:getComputedStyle(note).display!=='none',save:getComputedStyle(save).display==='none',left:getComputedStyle(left).display==='none',pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.deepStrictEqual(mobile,{note:true,save:true,left:true,pageOverflow:false});
    assert.deepStrictEqual(consoleErrors,[],`Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('BBS lazy initial comparison:',JSON.stringify(initialPerformance));
    console.log('BBS active-side Preview:',JSON.stringify({initialPreview,backPreviewRequests,stats:await evaluate(`window.BBSDesignerPreview?.stats?.()||[]`)}));
    console.log('BBS targeted Save requests:',JSON.stringify(saveRequests));
    console.log('BBS targeted Apply requests:',JSON.stringify(applyRequests));
    console.log('BBS targeted Preset Trash requests:',JSON.stringify(presetTrashRequests));
    console.log('BBS legacy Draft repair:',JSON.stringify({layoutId,repairPrompt,repairRequests,repairedSides:repairedSides.length,retainedLegacy:Number(retainedLegacy.count)}));
    console.log('BBS performance baseline:',JSON.stringify(performanceBaseline));
    console.log('BBS Phase 10F-2 desktop editor, busy-state save and phone preview-only browser UAT: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{try{socket?.close();}catch(_){}try{chrome?.kill();}catch(_){}if(server)await new Promise(resolve=>server.close(resolve));try{await cleanup();}catch(error){console.error(error.stack||error);process.exitCode=1;}await db.end().catch(()=>{});await fs.promises.rm(profile,{recursive:true,force:true}).catch(()=>{});});
