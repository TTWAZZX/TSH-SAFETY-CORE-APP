'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const release=require('../services/safety-vote-result-release'),root=path.join(__dirname,'..','..'),php=process.env.PHP_BIN||'C:\\xampp\\php\\php.exe';
const fixtures=[
 {policy:'manual',campaignType:'popular_vote',snapshotStatus:'Frozen',reconciliationState:'balanced',governanceReady:true},
 {policy:'automatic',campaignType:'popular_vote',snapshotStatus:'Frozen',reconciliationState:'balanced',governanceReady:true},
 {policy:'automatic',campaignType:'jury_scoring',snapshotStatus:'Frozen',reconciliationState:'balanced',governanceReady:false},
 {policy:'automatic',campaignType:'jury_scoring',snapshotStatus:'Certified',reconciliationState:'balanced',governanceReady:true},
 {policy:'automatic',campaignType:'secret_election',snapshotStatus:'Certified',reconciliationState:'balanced',governanceReady:true},
 {policy:'automatic',campaignType:'popular_vote',snapshotStatus:'Frozen',reconciliationState:'mismatch',governanceReady:true}
],node=fixtures.map(release.decision),run=spawnSync(php,[path.join(root,'api','tests','safety_vote_result_release_runner.php')],{input:JSON.stringify(fixtures),encoding:'utf8',windowsHide:true});
assert.equal(run.status,0,String(run.error||run.stderr||''));assert.deepEqual(JSON.parse(run.stdout),node);assert.deepEqual(node.map(x=>x.action),['hold','publish','hold','publish','publish','hold']);
const migration=fs.readFileSync(path.join(root,'backend','migrations','20261025_safety_vote_result_release_policy.sql'),'utf8'),rollback=fs.readFileSync(path.join(root,'backend','migrations','20261025_safety_vote_result_release_policy.rollback.sql'),'utf8'),wizard=fs.readFileSync(path.join(root,'public','js','pages','safety-vote-campaign-wizard.js'),'utf8'),finalization=fs.readFileSync(path.join(root,'backend','services','safety-vote-result-finalization.js'),'utf8');
for(const marker of ['ResultReleasePolicy','result_release_policy_contract','2026-10-25-result-release-policy-r1'])assert(migration.includes(marker));assert(rollback.includes('intentionally retained'));for(const marker of ['result-release-policy','อัตโนมัติเมื่อผ่านเงื่อนไข','workflow เฉพาะประเภท'])assert(wizard.includes(marker));for(const marker of ['release.decision','SAFETY_VOTE_RESULT_AUTO_FINALIZE','Published'])assert(finalization.includes(marker));
console.log('Safety Vote Phase 4 result release policy Node/PHP parity and static contract: PASS');
