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
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64');
const templateDir = path.join(__dirname, '..', 'private-uploads', 'bbs-card-templates');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-bbs10f2-browser-'));
const pending = new Map();
const consoleErrors = [];
let commandId = 1;
let socket;
let chrome;
let server;
let templateId;
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
    if(auditBaseline)await db.query("DELETE FROM Admin_AuditLogs WHERE id>? AND Module='bbs' AND TargetType IN ('BBS_Card_Layout_Version','BBS_Card_Layout_Asset')",[auditBaseline]).catch(()=>{});
    await fs.promises.rm(path.join(templateDir,`${marker}.png`),{force:true}).catch(()=>{});
    const[[remaining]]=await db.query('SELECT (SELECT COUNT(*) FROM BBS_Card_Templates WHERE TemplateName=?) templates,(SELECT COUNT(*) FROM BBS_Card_Layout_Versions WHERE PersonalTemplateID=?) versions',[marker,templateId||0]).catch(()=>[[{templates:-1,versions:-1}]]);
    console.log(`BBS Phase 10F-2 browser cleanup: templates=${remaining.templates}, versions=${remaining.versions}`);
    assert.deepStrictEqual([Number(remaining.templates),Number(remaining.versions)],[0,0]);
}

(async()=>{
    assert.ok(fs.existsSync(chromePath),'Chrome is required');
    const ready=await loadReadyTestUsers(db),admin=ready.admin,token=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'20m'});
    const[[audit]]=await db.query('SELECT COALESCE(MAX(id),0) id FROM Admin_AuditLogs');auditBaseline=Number(audit.id);
    fs.mkdirSync(templateDir,{recursive:true});await fs.promises.writeFile(path.join(templateDir,`${marker}.png`),png);
    const[result]=await db.query("INSERT INTO BBS_Card_Templates(TemplateName,BackgroundStoredName,OriginalName,MimeType,FileSize,WidthMM,HeightMM,Status,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,85.60,53.98,'Draft',?,?)",[marker,`${marker}.png`,`${marker}.png`,'image/png',png.length,admin.id,admin.id]);templateId=Number(result.insertId);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const apiUrl=`http://127.0.0.1:${server.address().port}`;
    await connectChrome(apiUrl);await command('Page.navigate',{url:appUrl});await sleep(1500);
    const user={id:admin.id,EmployeeID:admin.id,name:admin.name,EmployeeName:admin.name,role:admin.role,Role:admin.role,department:admin.department,Department:admin.department,unit:admin.unit,Unit:admin.unit,position:admin.position,Position:admin.position};
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#bbs-smart-card';location.reload();return true;})()`);
    await waitFor(`document.querySelector('[data-bbs-tab="cards"]')`);await evaluate(`document.querySelector('[data-bbs-tab="cards"]').click()`);
    await waitFor(`document.querySelector('[data-card-workspace="personal"]')`);await evaluate(`document.querySelector('[data-card-workspace="personal"]').click()`);
    await waitFor(`document.querySelector('[data-card-designer-personal="${templateId}"]')`);await evaluate(`document.querySelector('[data-card-designer-personal="${templateId}"]').click()`);
    await waitFor(`document.querySelector('[data-designer-create]')`);await evaluate(`document.querySelector('[data-designer-create]').click()`);
    await waitFor(`document.querySelector('[data-designer-canvas]') && document.querySelector('[data-add-static]')`);
    let desktop=await evaluate(`(()=>({dialog:document.querySelector('.bbs-designer-dialog')?.getAttribute('role'),canvas:Boolean(document.querySelector('[data-designer-canvas]')),preview:document.querySelector('.bbs-designer-dialog')?.innerText.includes('PREVIEW ONLY'),save:Boolean(document.querySelector('[data-save]')),overflow:document.querySelector('.bbs-designer-dialog')?.scrollWidth>document.querySelector('.bbs-designer-dialog')?.clientWidth+2}))()`);
    assert.deepStrictEqual(desktop,{dialog:'dialog',canvas:true,preview:true,save:true,overflow:false});
    const before=await evaluate(`document.querySelectorAll('[data-designer-element]').length`);await evaluate(`document.querySelector('[data-add-static]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length>${before}`);await evaluate(`document.querySelector('[data-undo]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length===${before}`);await evaluate(`document.querySelector('[data-redo]').click()`);await waitFor(`document.querySelectorAll('[data-designer-element]').length>${before}`);
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(500);
    const mobile=await evaluate(`(()=>{const note=document.querySelector('.bbs-designer-mobile-note'),save=document.querySelector('[data-save]'),left=document.querySelector('.bbs-designer-panel:first-child');return{note:getComputedStyle(note).display!=='none',save:getComputedStyle(save).display==='none',left:getComputedStyle(left).display==='none',pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};})()`);
    assert.deepStrictEqual(mobile,{note:true,save:true,left:true,pageOverflow:false});
    assert.deepStrictEqual(consoleErrors,[],`Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('BBS Phase 10F-2 desktop editor and phone preview-only browser UAT: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{try{socket?.close();}catch(_){}try{chrome?.kill();}catch(_){}if(server)await new Promise(resolve=>server.close(resolve));try{await cleanup();}catch(error){console.error(error.stack||error);process.exitCode=1;}await db.end().catch(()=>{});await fs.promises.rm(profile,{recursive:true,force:true}).catch(()=>{});});
