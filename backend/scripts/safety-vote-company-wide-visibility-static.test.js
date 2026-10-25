'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..','..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const service=read('backend/services/safety-vote-phase1.js');
const phpService=read('api/lib/safety_vote_phase1.php');
const nodeRoute=read('backend/routes/safety-vote.js');
const phpRoute=read('api/handlers/safety_vote.php');
const wizard=read('public/js/pages/safety-vote-campaign-wizard.js');
const model=read('public/js/pages/safety-vote-wizard-model.mjs');
const migration=read('backend/migrations/20261024_safety_vote_company_wide_visibility.sql');
const rollback=read('backend/migrations/20261024_safety_vote_company_wide_visibility.rollback.sql');

for(const source of [service,phpService]){
    for(const token of ['company_authenticated','eligible_only','company_authenticated_after_publish','viewDoesNotGrantParticipation','existingCampaignsPreserved'])assert.ok(source.includes(token),`visibility contract missing ${token}`);
}
assert.match(nodeRoute,/enforceVisibilityContract/);
assert.match(nodeRoute,/SAFETY_VOTE_VISIBILITY_CONTRACT_UNAVAILABLE/);
assert.match(phpRoute,/sv_visibility_contract_state/);
assert.match(phpRoute,/safety_vote_visibility_contract/);
assert.match(model,/discoveryMode:\s*'public_listing'/);
assert.match(wizard,/ค่าเริ่มต้นองค์กร: พนักงานทุกคนเห็นแคมเปญที่เผยแพร่/);
assert.match(wizard,/การเห็นรายการและรายละเอียดไม่ให้สิทธิ์/);
assert.match(migration,/company_wide_campaign_visibility_enabled','0'/);
assert.doesNotMatch(migration,/UPDATE\s+SafetyVote_Campaigns|DELETE\s+FROM\s+SafetyVote_Campaigns/i);
assert.doesNotMatch(rollback,/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+SafetyVote_Campaigns/i);

console.log('Safety Vote company-wide visibility static contract: PASS (central contract, fail-closed gate, company-wide new default, participation remains eligibility-gated)');\n