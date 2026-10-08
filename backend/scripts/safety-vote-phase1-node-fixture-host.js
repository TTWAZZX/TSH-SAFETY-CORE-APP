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
};
for(let i=1;i<=30;i++){const n=String(i).padStart(2,'0');users[`sv-load-${n}`]={id:`SV-L${n}`,name:`Load Voter ${n}`,role:'User',department:'Production',unit:'Line 1',position:'Operator'};}
const app=express();
app.use(express.json({limit:'1mb'}));
app.use('/public',express.static(path.join(root,'public')));
app.get('/__phase2-browser',(_req,res)=>res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8fafc;font-family:Arial,sans-serif}button,input,select,textarea,a{min-height:44px}a{display:inline-flex;align-items:center}*{box-sizing:border-box}</style><body><main id="safety-vote-page"></main><script>window.API_BASE=location.origin+'/api';window.TSHSession={getToken:()=> 'sv-user',logout:()=>{}};</script><script type="module">import {loadSafetyVotePage} from '/public/js/pages/safety-vote.js';loadSafetyVotePage();</script></body></html>`));
app.get('/__phase3-admin-browser',(_req,res)=>res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8fafc;font-family:Arial,sans-serif}button,input,select,textarea{min-height:44px;max-width:100%}*{box-sizing:border-box}.hidden{display:none}.flex,.grid{display:flex;flex-wrap:wrap;gap:8px}.overflow-x-auto{max-width:100%;overflow-x:auto}main,section{max-width:100%}table{max-width:100%}</style><body><main id="safety-vote-admin"></main><script>window.API_BASE=location.origin+'/api';window.TSHSession={getToken:()=> 'sv-admin',logout:()=>{}};window.XLSX={};window.jspdf={};</script><script type="module">import {renderSafetyVoteFoundation} from '/public/js/pages/admin-safety-vote.js';renderSafetyVoteFoundation(document.getElementById('safety-vote-admin'));</script></body></html>`));
app.use((req,res,next)=>{const token=String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!users[token])return res.status(401).json({success:false});req.user={...users[token]};next();});
app.use('/api/safety-vote',require('../routes/safety-vote'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase7'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase6'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase5'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase4'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase3'));
app.use('/api/safety-vote',require('../routes/safety-vote-phase2'));
app.get('/__ready',(_req,res)=>res.json({success:true}));
app.listen(port,'127.0.0.1',()=>console.log(`SAFETY_VOTE_FIXTURE_READY ${port}`));
