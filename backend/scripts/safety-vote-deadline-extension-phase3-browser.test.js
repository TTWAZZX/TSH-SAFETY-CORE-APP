'use strict';
const assert = require('assert');
const express = require('express');
const path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..', '..');
const app = express();
let applyBody = null;

app.use(express.json());
app.get('/__phase3', (req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/style.css"></head><body><main id="workspace"></main><script>window.API_BASE='http://${req.get('host')}/api';window.__TSH_FEATURE_FLAGS__={safetyVoteUxV1:true,safetyVoteEngagementV1:true};window.TSHSession={getToken:()=> 'fixture',getUser:()=>({role:'Admin'}),logout:()=>{}};</script><script type="module">import {renderSafetyVoteOperationsWorkspace} from '/public/js/pages/admin-safety-vote-operations.js';await renderSafetyVoteOperationsWorkspace(document.getElementById('workspace'),{campaign:{id:8,CampaignCode:'SHE-008-2026',TitleTh:'Closed campaign fixture',Status:'Closed',CampaignType:'survey',RowVersion:9,VersionRowVersion:12}});</script></body></html>`));
app.get('/api/safety-vote/admin/campaigns/8/operations', (_req, res) => res.json({success:true,data:{campaign:{id:8,status:'Closed',campaignType:'survey',scheduledOpenAt:'2026-11-01 08:00:00',scheduledCloseAt:'2026-11-02 17:00:00',campaignRowVersion:9,versionRowVersion:12,timeZone:'Asia/Bangkok'},funnel:{eligible:{visible:true,value:20},started:{visible:true,value:10},submitted:{visible:true,value:8},accepted:{visible:true,value:8},reconciliation:'balanced'},workflow:{metrics:{}},eligibilityAdmissions:{},timeline:[],notifications:[],exports:[],health:{reconciliation:'balanced',privacySuppression:true}}}));
for (const suffix of ['analytics/organization','jury/progress','stages','results/snapshots']) app.get(`/api/safety-vote/admin/campaigns/8/${suffix}`, (_req, res) => res.json({success:true,data:{rows:[]}}));
app.post('/api/safety-vote/admin/campaigns/8/deadline-extension/preview', (req, res) => res.json({success:true,data:{campaignId:8,campaignCode:'SHE-008-2026',status:'Closed',currentCloseAt:'2026-11-02 17:00:00',newCloseAt:'2026-11-06 17:00:00',campaignRowVersion:9,versionRowVersion:12,extensionMode:'reopen_existing',reopenAllowed:true,nextCycleRequired:false,immutableEvidence:{resultSnapshots:0,statuses:[]},promotions:[],preserved:{participation:10,ballots:8,submissions:2,juryAssignments:1}}}));
app.post('/api/safety-vote/admin/campaigns/8/deadline-extension', (req, res) => { applyBody=req.body; res.json({success:true,data:{status:'Open',newCloseAt:'2026-11-06 17:00:00',campaignRowVersion:10,versionRowVersion:13,reopened:true,preserved:true}}); });
app.use(express.static(root));

(async()=>{
 const server=await new Promise((resolve,reject)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));listener.once('error',reject);});
 let browser=null;
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__phase3`,{waitUntil:'networkidle'});
  await page.locator('[data-svo-action="open-extension"]').click();await page.locator('[name="newCloseAt"]').fill('2026-11-06T17:00');await page.locator('[name="reason"]').fill('Governed reopen without official result evidence.');await page.locator('[data-svo-action="preview-extension"]').click();await page.locator('.svo-extension__preview').waitFor();
  await page.locator('[name="confirmation"]').fill('REOPEN SHE-008-2026');await page.locator('[data-svo-extension-form] button[type="submit"]').click();await page.locator('.svo-action-message.is-success').waitFor();
  assert.equal(applyBody.confirmation,'REOPEN SHE-008-2026');assert.deepEqual(applyBody.promotionIds,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
  console.log('Safety Vote deadline extension Phase 3 Browser UAT: PASS');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
