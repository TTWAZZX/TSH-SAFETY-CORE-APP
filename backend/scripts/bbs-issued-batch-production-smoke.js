'use strict';
require('dotenv').config({path:require('path').join(__dirname,'..','.env')});
const assert=require('assert/strict');

const base=String(process.env.PROD_UAT_URL||'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/,'');
const employeeId=String(process.env.PROD_UAT_ADMIN_ID||'').trim();
const password=String(process.env.PROD_UAT_ADMIN_PASSWORD||'');

async function json(url,options={}){
  const response=await fetch(url,options),text=await response.text();let body=null;
  try{body=JSON.parse(text);}catch(_){body=null;}
  return{response,body,text};
}

(async()=>{
  assert.ok(employeeId&&password,'Production Admin UAT credentials are required');
  const login=await json(`${base}/api/login`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({employeeId,password})});
  assert.equal(login.response.status,200,`Production login failed: ${login.text.slice(0,160)}`);
  assert.ok(login.body?.token,'Production login returned no token');
  const headers={Authorization:`Bearer ${login.body.token}`,Accept:'application/json'};
  const cardsUrl=`${base}/api/bbs/admin/cards?paged=1&page=1&pageSize=20&status=Active`;
  const before=await json(cardsUrl,{headers});
  assert.equal(before.response.status,200,`Active card catalog failed: ${before.text.slice(0,160)}`);
  const beforeRows=before.body?.data?.rows||[];
  const fingerprint=rows=>rows.map(row=>[Number(row.id),String(row.Status),String(row.TokenFingerprint)]);
  const rejected=await json(`${base}/api/bbs/admin/cards/replace-batch`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({cardIds:[],reason:'Production no-write route probe'})});
  assert.equal(rejected.response.status,400,`Empty batch must fail without mutation: ${rejected.text.slice(0,160)}`);
  assert.match(String(rejected.body?.message||''),/1-100 Active cards/i,'Production PHP route did not return the batch validation contract');
  const after=await json(cardsUrl,{headers});
  assert.equal(after.response.status,200,`Post-probe card catalog failed: ${after.text.slice(0,160)}`);
  assert.deepEqual(fingerprint(after.body?.data?.rows||[]),fingerprint(beforeRows),'No-write route probe changed an Active card');
  assert.equal(Number(after.body?.data?.pagination?.total||0),Number(before.body?.data?.pagination?.total||0),'No-write route probe changed the Active-card count');
  console.log(JSON.stringify({success:true,activeCards:Number(before.body?.data?.pagination?.total||beforeRows.length),emptyBatchStatus:rejected.response.status,activeCardsUnchanged:true,qrFingerprintsUnchanged:true,businessDataChanged:false},null,2));
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
