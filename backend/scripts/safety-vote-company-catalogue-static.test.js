'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..','..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const service=read('backend/services/safety-vote-phase1.js');
const phpService=read('api/lib/safety_vote_phase1.php');
const node2=read('backend/routes/safety-vote-phase2.js');
const node3=read('backend/routes/safety-vote-phase3.js');
const php2=read('api/handlers/safety_vote_phase2.php');
const php3=read('api/handlers/safety_vote_phase3.php');
const ui=read('public/js/pages/safety-vote-page-ux1.js');
const uat=read('backend/scripts/safety-vote-phase1-api-uat.js');

for(const source of [service,phpService])for(const marker of ['catalogueVisible','detailVisible','participationAllowed','readOnlyDetail','company_catalogue_read_only','NOT_ELIGIBLE_READ_ONLY'])assert(source.includes(marker),`shared catalogue access contract missing ${marker}`);
for(const source of [node2,php2]){
    assert(source.includes('companyWideCatalogueRows')||source.includes('company_wide_catalogue_rows'),'company-wide catalogue query is missing');
    assert(source.includes("'Scheduled','Open','Closed','Certified','Published'"),'published lifecycle coverage is incomplete');
    assert(source.includes('c.IsHidden=0 AND c.IsTest=0'),'hidden/test exclusion is missing');
    assert(source.includes('DetailReadOnly')&&source.includes('ParticipationAllowed'),'catalogue access projection is missing');
    assert(source.includes('company_authenticated'),'catalogue response mode is missing');
}
for(const source of [node3,php3]){
    assert(source.includes('CAMPAIGN_NOT_ELIGIBLE'),'mutation eligibility denial is missing');
    assert(source.includes('participationAuthorization')||source.includes('svpa_require'),'central participation authorization guard is missing');
    assert(source.includes('questions:promotionPreOpen||discoveryOnly?[]:')||source.includes("'questions'=>($promotionPreOpen||$discoveryOnly)?[]:"),'read-only detail must suppress questions');
    assert(source.includes('ownResponses:discoveryOnly?[]:')||source.includes("'ownResponses'=>$discoveryOnly?[]:"),'read-only detail must suppress private response history');
}
assert(ui.includes("catalogueMode: 'legacy_discovery'"));
assert(ui.includes("data-sv-catalogue', 'company-wide-v1"));
assert(ui.includes("title.textContent = 'แคมเปญทั้งหมด'"));
assert(ui.includes('การเข้าร่วมยังขึ้นอยู่กับสิทธิ์ของแต่ละแคมเปญ'));
assert(ui.includes('เปิดดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน'));
for(const marker of ['sv-observer','legacy eligible-only campaign missing from company catalogue','observerMutation.status,403','company-catalogue-browser-probe'])assert(uat.includes(marker),`Node/PHP API UAT missing ${marker}`);

console.log('Safety Vote company-wide catalogue static contract: PASS (all published lifecycle campaigns, read-only detail, hidden/test exclusion, mutation denial, Node/PHP parity evidence)');\n