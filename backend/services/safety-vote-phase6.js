'use strict';
const crypto=require('crypto');
const CONTRACT='2026-10-08-safety-vote-phase6-r1';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const integer=(v,d=0)=>Number.isInteger(Number(v))?Number(v):d;

function config(raw={}){
  const errors=[],seen=new Set(),questions=new Set();
  const positions=(Array.isArray(raw.positions)?raw.positions:[]).map((p,i)=>{
    const positionCode=String(p.positionCode||'').trim().toUpperCase().slice(0,50);
    const questionId=integer(p.questionId);
    const seatCount=Math.max(1,Math.min(100,integer(p.seatCount,1)));
    const maxSelections=Math.max(1,Math.min(100,integer(p.maxSelections,seatCount)));
    const candidateIds=[...new Set((p.candidateIds||[]).map(Number).filter(Number.isInteger))].sort((a,b)=>a-b);
    const tieRule=['unresolved','candidate_id'].includes(p.tieRule)?p.tieRule:'unresolved';
    if(!positionCode||!questionId||seen.has(positionCode)||questions.has(questionId)||!String(p.title||'').trim()||maxSelections>seatCount||candidateIds.length<seatCount)errors.push('POSITION_INVALID');
    seen.add(positionCode);questions.add(questionId);
    return{positionCode,questionId,title:String(p.title||'').trim().slice(0,300),seatCount,maxSelections,allowAbstain:p.allowAbstain!==false,tieRule,sortOrder:integer(p.sortOrder,i+1),candidateIds};
  }).sort((a,b)=>a.sortOrder-b.sortOrder||a.positionCode.localeCompare(b.positionCode));
  if(!positions.length)errors.push('POSITIONS_REQUIRED');
  return{ok:!errors.length,errors:[...new Set(errors)],positions,configHash:hash(positions)};
}

function receipt(code){return{receipt:String(code||''),receiptHash:hash(String(code||'')),proof:'accepted_only',canLocateBallot:false};}

function calculate(input={}){
  const cfg=config({positions:input.positions});
  const counts=new Map((input.counts||[]).map(x=>[`${String(x.positionCode||'').toUpperCase()}:${Number(x.candidateId)||0}:${x.abstain?1:0}`,Math.max(0,integer(x.count))]));
  const eligible=Math.max(0,integer(input.eligibleCount)),participation=Math.max(0,integer(input.participationCount)),accepted=Math.max(0,integer(input.acceptedBallotCount)),errors=[];
  if(!cfg.ok)errors.push(...cfg.errors);
  if(participation>eligible||accepted!==participation)errors.push('RECONCILIATION_FAILED');
  const rows=[],ties=[];
  for(const p of cfg.positions){
    const ranked=p.candidateIds.map(candidateId=>({positionCode:p.positionCode,candidateId,count:counts.get(`${p.positionCode}:${candidateId}:0`)||0})).sort((a,b)=>b.count-a.count||a.candidateId-b.candidateId);
    const cut=ranked[p.seatCount-1]?.count;
    const tied=cut!==undefined&&ranked.filter(x=>x.count===cut).length>1&&ranked.some((x,i)=>i>=p.seatCount&&x.count===cut);
    if(tied&&p.tieRule==='unresolved')ties.push(p.positionCode);
    ranked.forEach((x,i)=>rows.push({...x,rank:i+1,resultState:tied&&p.tieRule==='unresolved'&&x.count===cut?'tied':i<p.seatCount?'elected':'not_elected'}));
    rows.push({positionCode:p.positionCode,candidateId:null,count:counts.get(`${p.positionCode}:0:1`)||0,rank:null,resultState:'abstain'});
  }
  const tieState=ties.length?'unresolved':'none',reconciliationState=errors.length?'failed':'balanced',abstainCount=rows.filter(x=>x.resultState==='abstain').reduce((n,x)=>n+x.count,0);
  const payload={contract:CONTRACT,configHash:cfg.configHash,eligibleCount:eligible,participationCount:participation,acceptedBallotCount:accepted,abstainCount,reconciliationState,tieState,tiedPositions:ties,rows};
  return{ok:!errors.length&&tieState==='none',errors:[...new Set(errors)],...payload,inputHash:hash({positions:cfg.positions,counts:Object.fromEntries([...counts].sort())}),resultHash:hash(payload)};
}

function certification({resultHash,certifications=[],required=2}){const need=Math.max(2,integer(required,2)),active=certifications.filter(x=>x.decision==='certified'&&!x.revokedAt&&x.resultHash===resultHash),people=new Set(active.map(x=>String(x.employeeId)));return{required:need,activeCount:people.size,ready:people.size>=need,resultHash};}
function auditMetadata(raw={}){const safe={};for(const k of ['resultHash','inputHash','snapshotNo','actionType','reasonCode','reportId','contentSha256'])if(typeof raw[k]==='string'||Number.isFinite(raw[k]))safe[k]=raw[k];return safe;}
module.exports={CONTRACT,hash,config,receipt,calculate,certification,auditMetadata};
