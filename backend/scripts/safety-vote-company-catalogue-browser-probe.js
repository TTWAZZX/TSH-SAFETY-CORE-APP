'use strict';

const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {spawn}=require('child_process');
const url=process.argv[2]||'http://127.0.0.1:5091/__company-catalogue';
const chromePath=process.env.SAFETY_VOTE_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=Number(process.env.SAFETY_VOTE_CATALOGUE_CDP_PORT||9864);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tsh-sv-catalogue-'));
const evidence=path.join(path.resolve(__dirname,'..','..'),'backups','local',`safety-vote-company-catalogue-${Date.now()}`);
const errors=[];let chrome,cdp;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Cdp{
    constructor(ws){this.id=1;this.pending=new Map();this.ws=new WebSocket(ws);}
    async connect(){this.ws.addEventListener('message',async event=>{let raw=event.data;if(raw&&raw.text)raw=await raw.text();const message=JSON.parse(String(raw));if(message.method==='Runtime.exceptionThrown')errors.push(message.params?.exceptionDetails?.exception?.description||message.params?.exceptionDetails?.text);if(message.method==='Runtime.consoleAPICalled'&&message.params?.type==='error')errors.push((message.params.args||[]).map(item=>item.value||item.description||'').join(' '));const pending=this.pending.get(message.id);if(pending){this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);}});await new Promise((resolve,reject)=>{this.ws.addEventListener('open',resolve,{once:true});this.ws.addEventListener('error',reject,{once:true});});}
    command(method,params={}){const id=this.id++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(this.pending.delete(id))reject(new Error(`CDP timeout ${method}`));},30000);});}
    close(){this.ws.close();}
}
async function evaluate(expression){const result=await cdp.command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value;}
async function wait(expression){for(let attempt=0;attempt<120;attempt++){if(await evaluate(expression))return;await sleep(200);}throw new Error(`Timed out: ${expression}`);}
async function screenshot(name){const result=await cdp.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,name),Buffer.from(result.data,'base64'));}

(async()=>{
    assert(fs.existsSync(chromePath),'Chrome is required');
    chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-sandbox','--disable-dev-shm-usage','--disable-extensions','--no-first-run','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','ignore'],windowsHide:true});
    let targets;for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(`http://127.0.0.1:${port}/json`);if(response.ok){targets=await response.json();break;}}catch(_){}await sleep(150);}const target=targets?.find(item=>item.type==='page');assert(target,'Chrome page target is unavailable');
    cdp=new Cdp(target.webSocketDebuggerUrl.replace('://localhost:','://127.0.0.1:'));await cdp.connect();await cdp.command('Page.enable');await cdp.command('Runtime.enable');
    for(const viewport of [{name:'mobile',width:390,height:844,mobile:true},{name:'tablet',width:768,height:1024,mobile:true},{name:'desktop',width:1366,height:768,mobile:false}]){
        await cdp.command('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});
        await cdp.command('Page.navigate',{url:`${url}?viewport=${viewport.name}`});
        await wait(`document.querySelector('[data-sv-catalogue="company-wide-v1"] [data-svp-campaign]')`);
        const list=await evaluate(`(()=>{const controls=[...document.querySelectorAll('button,input,select,textarea')].filter(node=>!node.disabled);return{title:document.querySelector('.svp-hero h1')?.textContent.trim(),copy:document.querySelector('.svp-hero h1 + p')?.textContent||'',readOnly:[...document.querySelectorAll('.svp-campaign-card')].some(card=>card.textContent.includes('ดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน')),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,minTouch:controls.length?Math.min(...controls.map(node=>node.getBoundingClientRect().height)):44};})()`);
        assert.strictEqual(list.title,'แคมเปญทั้งหมด');assert(list.copy.includes('การเข้าร่วมยังขึ้นอยู่กับสิทธิ์'));assert.strictEqual(list.readOnly,true);assert.strictEqual(list.overflow,false,`${viewport.name} list overflow`);assert(list.minTouch>=44,`${viewport.name} list touch target ${list.minTouch}`);
        await evaluate(`document.querySelector('[data-svp-campaign]').click()`);await wait(`document.querySelector('.svp-shell--detail')`);
        const detail=await evaluate(`(()=>{const text=document.body.textContent;const controls=[...document.querySelectorAll('button,input,select,textarea')].filter(node=>!node.disabled),official=document.querySelector('[data-svp-official-results]');return{readOnly:text.includes('เปิดดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน'),hasQuestion:Boolean(document.querySelector('[data-question-id],.svp-question')),hasReview:Boolean(document.querySelector('[data-svp-action="review"]')),officialState:official?.getAttribute('data-svp-official-results')||'',resultSource:official?.getAttribute('data-svp-result-source')||'',hasIntegrity:Boolean(document.querySelector('.svp-result-integrity code')?.textContent.trim()),release:document.querySelector('.svp-shell--detail')?.getAttribute('data-sv-company-user-ux')||'',overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,minTouch:controls.length?Math.min(...controls.map(node=>node.getBoundingClientRect().height)):44};})()`);
        assert.strictEqual(detail.readOnly,true);assert.strictEqual(detail.hasQuestion,false);assert.strictEqual(detail.hasReview,false);assert.strictEqual(detail.officialState,'available');assert.strictEqual(detail.resultSource,'immutable-snapshot');assert.strictEqual(detail.hasIntegrity,true);assert.strictEqual(detail.release,'phase5');assert.strictEqual(detail.overflow,false,`${viewport.name} detail overflow`);assert(detail.minTouch>=44,`${viewport.name} detail touch target ${detail.minTouch}`);await screenshot(`${viewport.name}.png`);
    }
    assert.deepStrictEqual(errors,[]);
    console.log(`Safety Vote company-wide catalogue Browser UAT: PASS (390, 768, 1366; ${evidence})`);
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;}).finally(async()=>{try{cdp?.close();}catch(_){}try{chrome?.kill();}catch(_){}await fs.promises.rm(profile,{recursive:true,force:true}).catch(()=>{});});\n