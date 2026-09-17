'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

(async()=>{
    const utilitySource=read('public/js/utils/bbs-qr-intent.js');
    const utility=await import('data:text/javascript;base64,'+Buffer.from(utilitySource).toString('base64'));
    assert.equal(utility.shouldDiscardBbsQrIntent({code:'QR_NOT_ACTIVE'}),true);
    assert.equal(utility.shouldDiscardBbsQrIntent({code:'QR_SCOPE_DENIED'}),true);
    assert.equal(utility.shouldDiscardBbsQrIntent({code:'BBS_ADMIN_ONLY'}),false);
    assert.equal(utility.shouldDiscardBbsQrIntent({code:'BBS_PILOT_ACCESS_REQUIRED'}),false);
    assert.equal(utility.isBbsRolloutBlockedError({code:'BBS_ADMIN_ONLY'}),true);
    assert.equal(utility.isBbsRolloutBlockedError({code:'BBS_PILOT_ACCESS_REQUIRED'}),true);
    assert.equal(utility.normalizeBbsQrRoute('https://evil.example'),'#bbs-smart-card');

    const priorWindow=globalThis.window,priorSession=globalThis.TSHSession,priorFetch=globalThis.fetch;
    let logoutCalls=0;
    globalThis.window={API_BASE:'https://example.invalid/api',location:{hostname:'example.invalid',pathname:'/index.html'}};
    globalThis.TSHSession={getToken:()=>null,logout:()=>{logoutCalls+=1;}};
    globalThis.fetch=async()=>new Response(JSON.stringify({success:false,message:'No token provided'}),{status:401,headers:{'content-type':'application/json'}});
    const apiSource=read('public/js/api.js'),apiModule=await import('data:text/javascript;base64,'+Buffer.from(apiSource).toString('base64'));
    await assert.rejects(apiModule.API.post('/bbs/qr/resolve',{token:'x'},{suppressErrorLog:true,preserveSessionOnAuthError:true}),error=>error?.message==='No token provided');
    assert.equal(logoutCalls,0,'pre-login QR resolve must not clear or redirect the login session');
    globalThis.window=priorWindow;globalThis.TSHSession=priorSession;globalThis.fetch=priorFetch;

    const main=read('public/js/main.js'),api=read('public/js/api.js');
    const capture=main.slice(main.indexOf('async function captureBbsQrIntent'),main.indexOf('async function consumeBbsQrIntent'));
    assert.ok(capture.indexOf('sessionStorage.setItem(BBS_QR_INTENT_KEY, token)')<capture.indexOf("API.post('/bbs/qr/resolve'"),'QR intent must be persisted before pre-login resolve');
    assert.match(capture,/preserveSessionOnAuthError:true/);
    assert.match(capture,/if\(!shouldDiscardBbsQrIntent\(error\)\)/);
    const consume=main.slice(main.indexOf('async function consumeBbsQrIntent'),main.indexOf('async function openBbsQrDestination'));
    assert.match(consume,/BBS_QR_PENDING_KEY/);
    assert.match(consume,/isBbsRolloutBlockedError/);
    assert.match(consume,/await openBbsQrDestination\(result\.data\?\.route\)/);
    assert.doesNotMatch(consume,/window\.location\.hash\s*=|\bhandleRouting\(\)/,'QR claim must not trigger duplicate BBS routing through hashchange plus a direct call');
    const destination=main.slice(main.indexOf('async function openBbsQrDestination'),main.indexOf('function consumePendingGuideRoute'));
    assert.match(destination,/normalizeBbsQrRoute\(route\)/);
    assert.match(destination,/history\.replaceState/);
    assert.match(destination,/await handleRouting\(\)/);
    assert.match(api,/preserveSessionOnAuthError/);
    assert.match(api,/!preserveSessionOnAuthError/);
    for(const source of [read('backend/services/bbs-rollout-access.js'),read('api/lib/bbs_rollout_access.php')])assert.match(source,/BBS_ADMIN_ONLY/);
    console.log('BBS QR pre-login intent, rollout hold, authenticated claim and safe-route contract: PASS');
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
