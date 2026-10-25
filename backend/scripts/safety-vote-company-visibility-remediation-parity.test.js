'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process'),model=require('../services/safety-vote-company-visibility-remediation');
const fixture={rows:[
 {id:4,CampaignCode:'LEGACY-OPEN',TitleTh:'Legacy Open',Status:'Open',DiscoveryMode:'eligible_only',RowVersion:7,IsHidden:0,IsTest:0},
 {id:1,CampaignCode:'PUBLIC',TitleTh:'Public',Status:'Published',DiscoveryMode:'public_listing',RowVersion:2,IsHidden:0,IsTest:0},
 {id:2,CampaignCode:'HIDDEN',TitleTh:'Hidden',Status:'Open',DiscoveryMode:'eligible_only',RowVersion:1,IsHidden:1,IsTest:0},
 {id:3,CampaignCode:'VOID',TitleTh:'Void',Status:'Voided',DiscoveryMode:'eligible_only',RowVersion:3,IsHidden:0,IsTest:0},
 {id:5,CampaignCode:'DRAFT',TitleTh:'Draft',Status:'Draft',DiscoveryMode:'eligible_only',RowVersion:4,IsHidden:0,IsTest:0}
]};
const node=model.buildPlan(fixture.rows),php=spawnSync(process.env.PHP_BIN||'C:\\xampp\\php\\php.exe',[path.join(__dirname,'../../api/tests/safety_vote_company_visibility_remediation_fixture_runner.php')],{input:JSON.stringify(fixture),encoding:'utf8'});assert.strictEqual(php.status,0,php.stderr);assert.deepStrictEqual(JSON.parse(php.stdout),node);assert.deepStrictEqual(node.counts,{total:5,remediate:2,unchanged:1,excluded:2});assert.deepStrictEqual(node.items.filter(x=>x.decision==='remediate').map(x=>x.id),[4,5]);assert.match(node.exactConfirmation,/^REMEDIATE COMPANY VISIBILITY [A-F0-9]{12}$/);assert.strictEqual(node.businessMutation,false);assert(node.protectedEvidence.includes('result snapshots/rows'));console.log('Safety Vote company visibility remediation Node/PHP parity: PASS');
