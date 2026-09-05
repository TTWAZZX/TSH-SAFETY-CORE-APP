'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path:path.join(__dirname, '..', '.env'), quiet:true });
const app = require('../server');
const db = require('../db');
const { loadReadyTestUsers } = require('./ready-test-users');

const chromePath = process.env.CCCF_C1_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const appUrl = process.env.CCCF_C1_APP_URL || 'http://127.0.0.1/tsh-safety-core/index.html';
const cdpPort = Number(process.env.CCCF_C1_CDP_PORT || 9853);
const marker = `UAT-CCCF-C1C3-${Date.now()}`;
const permanentSeq = 100000 + Number(String(Date.now()).slice(-5));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsh-cccf-c1c3-'));
const pending = new Map();
const consoleErrors = [];
let commandId = 1;
let socket;
let chrome;
let server;
let recordId;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function command(method, params={}, timeout=60000) {
    const id=commandId++;
    return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout ${method}`));},timeout);
        pending.set(id,{resolve,reject,timer});
        socket.send(JSON.stringify({id,method,params}));
    });
}
async function evaluate(expression) {
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result?.value;
}
async function waitFor(expression,timeout=15000) {
    const started=Date.now();
    while(Date.now()-started<timeout){if(await evaluate(expression))return;await sleep(250);}
    throw new Error(`Timed out: ${expression}; console=${consoleErrors.join(' | ')}`);
}
async function connectChrome(apiUrl) {
    chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-allow-origins=*','--window-size=1365,900',`--remote-debugging-port=${cdpPort}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
    let targets;
    for(let i=0;i<60;i++){try{const response=await fetch(`http://127.0.0.1:${cdpPort}/json`);if(response.ok){targets=await response.json();break;}}catch(_){}await sleep(250);}
    const page=targets?.find(row=>row.type==='page');assert.ok(page?.webSocketDebuggerUrl,'Chrome target unavailable');
    socket=new WebSocket(page.webSocketDebuggerUrl.replace('://localhost:','://127.0.0.1:'));
    socket.addEventListener('message',async event=>{let raw=event.data;if(raw&&typeof raw.text==='function')raw=await raw.text();if(raw instanceof ArrayBuffer)raw=Buffer.from(raw).toString('utf8');const message=JSON.parse(String(raw));if(message.method==='Runtime.exceptionThrown')consoleErrors.push(message.params?.exceptionDetails?.exception?.description||message.params?.exceptionDetails?.text||'Runtime exception');if(message.method==='Runtime.consoleAPICalled'&&message.params?.type==='error')consoleErrors.push((message.params.args||[]).map(x=>x.value||x.description||'').join(' '));const current=pending.get(message.id);if(!current)return;pending.delete(message.id);clearTimeout(current.timer);message.error?current.reject(new Error(message.error.message)):current.resolve(message.result);});
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    await command('Page.enable');await command('Runtime.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.API_BASE=${JSON.stringify(`${apiUrl}/api`)};`});
}

(async()=>{
    assert.ok(fs.existsSync(chromePath),'Chrome is required');
    const ready=await loadReadyTestUsers(db);
    const admin=ready.admin;
    const token=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'20m'});
    // A cancelled local browser process can leave only its clearly labelled
    // test row. Remove that residue before allocating this run.
    const [stale] = await db.query("SELECT id FROM CCCF_FormA_Permanent WHERE JobArea LIKE 'UAT-CCCF-C1C3-%'");
    for (const row of stale) {
        await db.query('DELETE FROM CCCF_EmailOutbox WHERE PermanentID=?', [row.id]).catch(() => {});
        await db.query('DELETE FROM CCCF_FormA_Permanent WHERE id=?', [row.id]);
    }
    const [insert]=await db.query("INSERT INTO CCCF_FormA_Permanent(PermanentYear,PermanentSeq,PermanentNo,SubmitterName,Department,JobArea,SubmitDate,Summary,StopType,`Rank`,FileUrl,ExcelFileUrl,AssigneeID,DocumentMode,ReviewStatus,CreatedBy) VALUES(YEAR(CURDATE()),?,?,?,?,?,CURDATE(),?,6,'C',?,?,?,'excel_review','PendingReview',?)",[permanentSeq,marker,admin.name,admin.department,marker,marker,`/uploads/${marker}.xlsx`,`/uploads/${marker}.xlsx`,admin.id,admin.id]);
    recordId=Number(insert.insertId);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const apiUrl=`http://127.0.0.1:${server.address().port}`;
    await connectChrome(apiUrl);await command('Page.navigate',{url:appUrl});await sleep(1500);
    const user={id:admin.id,EmployeeID:admin.id,name:admin.name,EmployeeName:admin.name,role:admin.role,Role:admin.role,department:admin.department,Department:admin.department,unit:admin.unit,Unit:admin.unit,position:admin.position,Position:admin.position};
    await evaluate(`(()=>{localStorage.setItem('tsh_token',${JSON.stringify(token)});localStorage.setItem('tsh_user',${JSON.stringify(JSON.stringify(user))});location.hash='#cccf';location.reload();return true;})()`);
    await waitFor(`typeof window._cccfOpenPermanentForAssignee==='function' && typeof window._cccfShowPermanentDetail==='function'`);
    // The module opens on its Worker tab by default, so the Permanent rows are
    // not necessarily visible yet. The rendered form button means the shared
    // permanent dataset and Employee Master lookup have both finished loading.
    await waitFor(`document.querySelector('#btn-open-permanent-form')`);

    await evaluate(`window._cccfOpenPermanentForAssignee(${JSON.stringify(admin.id)})`);
    await waitFor(`document.querySelector('#permanent-owner-search')`);
    const picker=await evaluate(`(()=>{const input=document.querySelector('#permanent-owner-search');input.value=${JSON.stringify(admin.id)};input.dispatchEvent(new Event('input',{bubbles:true}));return{role:input.getAttribute('role'),controls:input.getAttribute('aria-controls')};})()`);
    assert.deepStrictEqual(picker,{role:'combobox',controls:'permanent-owner-results'});
    await waitFor(`document.querySelector('#permanent-owner-results [data-owner-id=${JSON.stringify(admin.id)}]')`);
    const selected=await evaluate(`(()=>{document.querySelector('#permanent-owner-results [data-owner-id=${JSON.stringify(admin.id)}]').click();return{assignee:document.querySelector('#permanent-assignee-id').value,name:document.querySelector('#permanent-owner-name-display').value,expanded:document.querySelector('#permanent-owner-search').getAttribute('aria-expanded')};})()`);
    assert.strictEqual(selected.assignee,String(admin.id));
    assert.ok(selected.name);
    assert.strictEqual(selected.expanded,'false');

    await evaluate(`closeModal()`);await sleep(350);
    await evaluate(`window._cccfShowPermanentDetail(${recordId})`);
    await waitFor(`document.querySelector('#modal-body')?.innerText.includes(${JSON.stringify(marker)})`);
    await evaluate(`Array.from(document.querySelectorAll('#modal-body button')).find(button=>button.textContent.includes('Approve Excel')).click()`);
    await waitFor(`document.querySelector('#cccf-review-comment')`);
    const comment=`Keep comment ${marker}`;
    await evaluate(`(()=>{const field=document.querySelector('#cccf-review-comment');field.value=${JSON.stringify(comment)};field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();return true;})()`);
    await sleep(600);
    const review=await evaluate(`(()=>({visible:!document.querySelector('#modal-wrapper').classList.contains('hidden'),value:document.querySelector('#cccf-review-comment')?.value||'',focused:document.activeElement?.id,hasForm:Boolean(document.querySelector('#cccf-review-form'))}))()`);
    assert.deepStrictEqual(review,{visible:true,value:comment,focused:'cccf-review-comment',hasForm:true});

    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(400);
    const mobile=await evaluate(`(()=>({pageOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,dialogOverflow:document.querySelector('#modal-container').scrollWidth>document.querySelector('#modal-container').clientWidth+2,fieldSize:document.querySelector('#cccf-review-comment').getBoundingClientRect().width}))()`);
    assert.strictEqual(mobile.pageOverflow,false);
    assert.strictEqual(mobile.dialogOverflow,false);
    assert.ok(mobile.fieldSize>250);
    assert.deepStrictEqual(consoleErrors,[],`Browser console errors: ${consoleErrors.join(' | ')}`);
    console.log('CCCF Phase C1-C3 searchable owner and stable review dialog browser UAT: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{
    try{socket?.close();}catch(_){}try{chrome?.kill();}catch(_){}
    if(server)await new Promise(resolve=>server.close(resolve));
    if(recordId)await db.query('DELETE FROM CCCF_FormA_Permanent WHERE id=?',[recordId]).catch(()=>{});
    const[[remaining]]=await db.query('SELECT COUNT(*) count FROM CCCF_FormA_Permanent WHERE id=?',[recordId||0]).catch(()=>[[{count:-1}]]);
    console.log(`CCCF C1-C3 browser cleanup: records=${remaining.count}`);
    if(Number(remaining.count)!==0)process.exitCode=1;
    await db.end().catch(()=>{});await fs.promises.rm(profile,{recursive:true,force:true}).catch(()=>{});
});
