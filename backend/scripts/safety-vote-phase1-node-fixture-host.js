'use strict';

const express = require('express');
const path = require('path');
require('dotenv').config({ path:path.join(__dirname,'..','.env') });
const root=path.resolve(__dirname,'..','..');

const dbName=String(process.env.SAFETY_VOTE_FIXTURE_DB||'');
const port=Number(process.env.SAFETY_VOTE_FIXTURE_PORT||5091);
if(!new Set(['localhost','127.0.0.1','::1']).has(String(process.env.DB_HOST||'').trim().toLowerCase()))throw new Error('Fixture refuses non-loopback DB_HOST');
if(!/^tsh_safety_vote_phase1_(node|php)_\d+_\d+$/.test(dbName))throw new Error('Fixture database name is outside guarded prefix');
process.env.DB_NAME=dbName;

const users={
    'sv-admin':{id:'SV-ADMIN',name:'Safety Vote Admin',role:'Admin',department:'Safety',unit:'Core',position:'Officer'},
    'sv-user':{id:'SV-USER',name:'Safety Vote User',role:'User',department:'Production',unit:'Line 1',position:'Operator'},
    'sv-user2':{id:'SV-USER2',name:'Safety Vote User Two',role:'User',department:'Production',unit:'Line 1',position:'Operator'},
    'sv-ops-limited':{id:'SV-OPS-LIMITED',name:'Operations Viewer',role:'User',department:'Safety',unit:'Core',position:'Officer'},
    'sv-ops-denied':{id:'SV-OPS-DENIED',name:'Operations Denied',role:'User',department:'Safety',unit:'Core',position:'Officer'},
};
for(let i=1;i<=30;i++){const n=String(i).padStart(2,'0');users[`sv-load-${n}`]={id:`SV-L${n}`,name:`Load Voter ${n}`,role:'User',department:'Production',unit:'Line 1',position:'Operator'};}
for(let i=1;i<=10;i++){const n=String(i).padStart(2,'0');users[`sv-jury-${n}`]={id:`SV-J${n}`,name:`Juror ${n}`,role:'User',department:'Safety',unit:'Core',position:'Officer'};}
const app=express();
app.use(express.json({limit:'1mb'}));
app.use('/public',express.static(path.join(root,'public')));
app.get('/__phase2-browser',(_req,res)=>res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8fafc;font-family:Arial,sans-serif}button,input,select,textarea,a{min-height:44px}a{display:inline-flex;align-items:center}*{box-sizing:border-box}</style><body><main id="safety-vote-page"></main><script>window.API_BASE=location.origin+'/api';window.TSHSession={getToken:()=> 'sv-user',logout:()=>{}};</script><script type="module">import {loadSafetyVotePage} from '/public/js/pages/safety-vote.js';loadSafetyVotePage();</script></body></html>`));
app.get('/__phase3-admin-browser',(_req,res)=>res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8fafc;font-family:Arial,sans-serif}button,input,select,textarea{min-height:44px;max-width:100%}*{box-sizing:border-box}.hidden{display:none}.flex,.grid{display:flex;flex-wrap:wrap;gap:8px}.overflow-x-auto{max-width:100%;overflow-x:auto}main,section{max-width:100%}table{max-width:100%}</style><body><main id="safety-vote-admin"></main><script>window.API_BASE=location.origin+'/api';window.TSHSession={getToken:()=> 'sv-admin',logout:()=>{}};window.XLSX={};window.jspdf={};</script><script type="module">import {renderSafetyVoteFoundation} from '/public/js/pages/admin-safety-vote.js';renderSafetyVoteFoundation(document.getElementById('safety-vote-admin'));</script></body></html>`));
function uxPage({token,target,modulePath,exportName}){return`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><link rel="stylesheet" href="/public/style.css"><style>body{margin:0;background:#f8fafc;font-family:Arial,sans-serif}*{box-sizing:border-box}.hidden{display:none}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}main{width:100%;min-height:100vh}</style></head><body><main id="${target}"></main><script>window.API_BASE=location.origin+'/api';window.__TSH_FEATURE_FLAGS__={safetyVoteUxV1:true};window.TSHSession={getToken:()=> '${token}',logout:()=>{}};window.XLSX={};window.jspdf={};</script><script type="module">import {${exportName}} from '${modulePath}';${exportName}(${target==='safety-vote-admin'?`document.getElementById('${target}')`:''});</script></body></html>`;}
app.get('/__ux1-admin',(_req,res)=>res.type('html').send(uxPage({token:'sv-admin',target:'safety-vote-admin',modulePath:'/public/js/pages/admin-safety-vote-ux1.js',exportName:'renderSafetyVoteFoundation'})));
app.get('/__ux1-user',(_req,res)=>res.type('html').send(uxPage({token:'sv-user',target:'safety-vote-page',modulePath:'/public/js/pages/safety-vote-page-ux1.js',exportName:'loadSafetyVotePage'})));
app.get('/__ux1-juror',(_req,res)=>res.type('html').send(uxPage({token:'sv-user2',target:'safety-vote-page',modulePath:'/public/js/pages/safety-vote-page-ux1.js',exportName:'loadSafetyVotePage'})));
app.get('/__ux3-user/:number',(req,res)=>{const n=String(Number(req.params.number)||0).padStart(2,'0'),token=`sv-load-${n}`;if(!users[token])return res.status(404).send('Unknown guarded fixture user');return res.type('html').send(uxPage({token,target:'safety-vote-page',modulePath:'/public/js/pages/safety-vote-page-ux1.js',exportName:'loadSafetyVotePage'}));});
app.get('/__ux4-juror/:number',(req,res)=>{const n=String(Number(req.params.number)||0).padStart(2,'0'),token=`sv-jury-${n}`;if(!users[token])return res.status(404).send('Unknown guarded fixture juror');const html=uxPage({token,target:'safety-vote-page',modulePath:'/public/js/pages/safety-vote-jury-workspace.js',exportName:'loadSafetyVoteJuryWorkspace'}).replace('loadSafetyVoteJuryWorkspace();',"loadSafetyVoteJuryWorkspace({initialAssignmentId:Number(new URLSearchParams(location.search).get('assignment'))||null});");return res.type('html').send(html);});
app.get('/__ux5-admin/:mode',(req,res)=>{const token=req.params.mode==='limited'?'sv-ops-limited':req.params.mode==='denied'?'sv-ops-denied':'sv-admin',html=uxPage({token,target:'safety-vote-admin',modulePath:'/public/js/pages/admin-safety-vote-operations.js',exportName:'renderSafetyVoteOperationsWorkspace'}),call="renderSafetyVoteOperationsWorkspace(document.getElementById('safety-vote-admin'));",replacement="renderSafetyVoteOperationsWorkspace(document.getElementById('safety-vote-admin'),{campaign:{id:Number(new URLSearchParams(location.search).get('campaign'))||0,CampaignCode:'UX5-OPS',TitleTh:'ศูนย์ปฏิบัติการทดสอบ',Status:'Open',PrivacyMode:new URLSearchParams(location.search).get('privacy')||'confidential',ResultVisibility:'certified_only'},onClose:()=>{}});";return res.type('html').send(html.replace(call,replacement));});
app.get('/__ux1-denied',(_req,res)=>res.type('html').send(uxPage({token:'sv-user',target:'safety-vote-admin',modulePath:'/public/js/pages/admin-safety-vote-ux1.js',exportName:'renderSafetyVoteFoundation'})));
app.use((req,res,next)=>{const token=String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!users[token])return res.status(401).json({success:false});req.user={...users[token]};next();});
app.post('/__fixture/module/:enabled',async(req,res)=>{if(req.user.role!=='Admin')return res.status(403).json({success:false});const enabled=req.params.enabled==='1'?'1':'0',db=require('../db');await db.query("UPDATE SafetyVote_Settings SET SettingValue=?,UpdatedBy='guarded-fixture' WHERE SettingKey='module_enabled'",[enabled]);res.json({success:true,moduleEnabled:enabled==='1'});});
const safetyVoteRoutes=require('../routes/safety-vote');
app.use('/api/safety-vote',safetyVoteRoutes.operationalGate);
app.use('/api/safety-vote',safetyVoteRoutes);
app.use('/api/safety-vote',require('../routes/safety-vote-phase7'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase6'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase5'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase4'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase3'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase2'));
app.get('/__ready',(_req,res)=>res.json({success:true}));
async function start(){
    if(process.env.SAFETY_VOTE_FIXTURE_KEEP_DISABLED!=='1'){
        const db=require('../db');
        await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='guarded-fixture' WHERE SettingKey='module_enabled'");
        await db.query("UPDATE SafetyVote_Settings SET SettingValue='1',UpdatedBy='guarded-fixture' WHERE SettingKey='phase7_integrations_enabled'").catch(()=>{});
    }
    app.listen(port,'127.0.0.1',()=>console.log(`SAFETY_VOTE_FIXTURE_READY ${port}`));
}
start().catch(error=>{console.error(error);process.exit(1);});
