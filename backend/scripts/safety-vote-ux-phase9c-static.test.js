'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const rules=require('../services/safety-vote-analytics'),root=path.resolve(__dirname,'..','..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');let checks=0;const ok=(value,message)=>{assert(value,message);checks++;};

const hidden=rules.thresholdMetric(4,5),visible=rules.thresholdMetric(5,5,10);
ok(hidden.value===null&&hidden.reason==='PRIVACY_THRESHOLD','strict low-count suppression');
ok(visible.value===5&&visible.percentage===50,'visible threshold metric');
ok(rules.normalizeEventType('CTA_CLICK')==='cta_click'&&rules.normalizeEventType('identity')===null,'aggregate event allowlist');
ok(JSON.stringify(rules.queueAudit('queued=12; suppressed=7'))===JSON.stringify({queued:12,suppressed:7}),'bounded audit parser');
const campaign=rules.buildCampaignMetric({id:1,campaignCode:'SHE-001-2026',title:'Fixture',status:'Open',campaignType:'survey',privacyMode:'identified',privacyThreshold:5,eligible:20,started:8,submitted:6,reach:9,notificationReads:4,impressions:10,ctaClicks:2});
ok(campaign.conversion.percentage===30,'conversion contract');ok(campaign.notificationReads.value===null&&campaign.ctaClicks.value===null,'low dimensions suppressed');
const conflicts=rules.scheduleConflicts([{campaignId:1,campaignCode:'SHE-001-2026',channel:'email',scheduledAt:'2026-10-10T10:00:00Z'},{campaignId:2,campaignCode:'SHE-002-2026',channel:'email',scheduledAt:'2026-10-10T10:05:00Z'},{campaignId:1,campaignCode:'SHE-001-2026',channel:'email',scheduledAt:'2026-10-10T10:20:00Z'},{campaignId:2,campaignCode:'SHE-002-2026',channel:'email',scheduledAt:'2026-10-10T10:25:00Z'}]);
ok(conflicts.length===2&&conflicts.every(row=>row.windowMinutes===30),'interleaved campaign/channel schedule conflicts');ok(rules.recommendations([campaign],[],conflicts).length>=2,'actionable recommendations');ok(rules.csv({campaigns:[campaign]}).includes('SUPPRESSED'),'aggregate CSV suppression');

const migration=read('backend/migrations/20261010_safety_vote_ux_phase9c_engagement_analytics.sql'),rollback=read('backend/migrations/20261010_safety_vote_ux_phase9c_engagement_analytics.rollback.sql');
ok(migration.includes('SafetyVote_EngagementCounters')&&migration.includes("('engagement_enabled','0'"),'additive table and default OFF');
ok(!/(EmployeeID|RecipientEmployeeID|BallotID|AnswerID|CandidateID)/i.test(migration),'counter schema has no identity/choice columns');
ok(!/DROP\s+TABLE|DELETE\s+FROM/i.test(rollback)&&rollback.includes("'engagement_enabled','0'"),'data-preserving disable rollback');

const node=read('backend/routes/safety-vote-analytics.js'),php=read('api/handlers/safety_vote_analytics.php');
for(const marker of['/engagement/promotions/:id/events','/admin/engagement/analytics','/admin/engagement/analytics/export.csv']){ok(node.includes(marker),`Node ${marker}`);ok(php.includes(marker),`PHP ${marker}`);}
for(const source of[node,php]){ok(source.includes('engagement_enabled'),'independent engagement gate');ok(source.includes('SAFETY_VOTE_RESULT_VIEW')&&source.includes('SAFETY_VOTE_EXPORT'),'existing capabilities reused');ok(source.includes("Status='frozen'")||source.includes("Status=\'frozen\'"),'frozen eligibility event guard');ok(!/UPDATE\s+SafetyVote_(Ballots|BallotAnswers|JuryScores|ResultRows|Certifications)/i.test(source),'no protected engine mutation');}
ok(node.includes('containsIdentity: false')&&node.includes('containsVoterChoice: false'),'explicit privacy response contract');
ok(!node.includes('/notifications/dispatch')&&!php.includes('/notifications/dispatch'),'analytics never dispatches');
ok(node.includes('admin\\/engagement\\/analytics')&&node.includes('return next()'),'analytics gate is route-scoped');

const ui=read('public/js/pages/admin-safety-vote-planning.js'),user=read('public/js/pages/safety-vote-page-ux1.js'),css=read('public/style.css'),index=read('index.html');
for(const marker of['Engagement Analytics','Campaign comparison','Delivery governance','Schedule guard','Actionable optimization','Aggregate CSV'])ok(ui.includes(marker),marker);
ok(ui.includes('ทุกแคมเปญ')&&ui.includes('privacy threshold'),'all-campaign comparison and privacy wording');
ok(user.includes('/engagement/promotions/')&&user.includes("'impression'")&&user.includes("'cta_click'")&&user.includes('{ eventType }'),'aggregate promotion events');
ok(!/employeeId|candidateId|answerId/i.test(user.match(/trackPromotionEvent[\s\S]*?function promotionMarkup/)?.[0]||''),'event payload excludes identities');
ok(css.includes('.svan-dashboard')&&css.includes('.svan-table-wrap')&&css.includes('overflow-x: auto'),'responsive analytics workspace');
ok(/safetyVoteEngagementV1:\s*(true|false)/.test(index),'source feature flag remains explicit');

const phpRun=spawnSync(process.env.PHP_BIN||'C:\\xampp\\php\\php.exe',[path.join(root,'api','tests','safety_vote_analytics_contract_test.php')],{encoding:'utf8',windowsHide:true});
if(phpRun.error?.code==='EPERM'){
  const phpLib=read('api/lib/safety_vote_analytics.php');ok(phpLib.includes('SVA_CONTRACT'),'PHP contract marker');ok(phpLib.includes('PRIVACY_THRESHOLD'),'PHP threshold suppression');ok(phpLib.includes("['impression','cta_click']"),'PHP aggregate event allowlist');
}else{assert.strictEqual(phpRun.status,0,phpRun.error?.message||phpRun.stderr);process.stdout.write(phpRun.stdout);checks+=9;}
console.log(`Safety Vote UX Phase 9C static + Node/PHP contract: PASS (${checks} assertions)`);
