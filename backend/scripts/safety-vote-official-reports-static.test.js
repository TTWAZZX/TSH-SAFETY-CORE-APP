'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const nodeRoute = read('backend/routes/safety-vote-phase5.js');
const nodeService = read('backend/services/safety-vote-phase5.js');
const phpRoute = read('api/handlers/safety_vote_phase5.php');
const phpService = read('api/lib/safety_vote_phase5.php');
const page = read('public/js/pages/admin-safety-vote-results.js');
const index = read('index.html');
const checks = [
  [nodeService.includes("templateVersion:'2026-10-16-safety-vote-official-report-r1'"), 'Node template version missing'],
  [phpService.includes("'templateVersion'=>'2026-10-16-safety-vote-official-report-r1'"), 'PHP template version missing'],
  [nodeService.includes("documentStatus:official?'OFFICIAL_CERTIFIED_RESULT':'CONTROLLED_RESULT_COPY'"), 'Node document status policy missing'],
  [phpService.includes("$official?'OFFICIAL_CERTIFIED_RESULT':'CONTROLLED_RESULT_COPY'"), 'PHP document status policy missing'],
  [nodeService.includes("classification:'AUTHORIZED_AGGREGATE_ONLY'"), 'Node classification missing'],
  [phpService.includes("'classification'=>'AUTHORIZED_AGGREGATE_ONLY'"), 'PHP classification missing'],
  [nodeService.includes('containsVoterIdentity:false'), 'Node voter identity exclusion missing'],
  [phpService.includes("'containsVoterIdentity'=>false"), 'PHP voter identity exclusion missing'],
  [nodeRoute.includes("add('Summary'"), 'Node Summary sheet missing'],
  [nodeRoute.includes("add('Results'"), 'Node Results sheet missing'],
  [nodeRoute.includes("add('Verification'"), 'Node Verification sheet missing'],
  [phpRoute.includes("$sheets=['Summary'=>$summary,'Results'=>$results,'Verification'=>$verification]"), 'PHP three-sheet workbook missing'],
  [nodeRoute.includes('pageCount=chunks.length'), 'Node multipage PDF missing'],
  [phpRoute.includes('$pageCount=count($chunks)'), 'PHP multipage PDF missing'],
  [nodeRoute.includes("Decision='certified' AND RevokedAt IS NULL"), 'Node active certification evidence missing'],
  [phpRoute.includes("Decision='certified' AND RevokedAt IS NULL"), 'PHP active certification evidence missing'],
  [page.includes('Excel ทางการ') && page.includes('PDF ทางการ'), 'Official report actions missing'],
  [page.includes('/exports/certified-report'), 'Certified report endpoint selection missing'],
  [page.includes('Controlled result copy — ยังไม่รับรอง'), 'Frozen report disclosure missing'],
  [index.includes('20261019-safety-vote-account-advisory-r1'), 'Current Safety Vote runtime cache key missing']
];
checks.forEach(([ok, message]) => assert(ok, message));
console.log(`Safety Vote official Excel/PDF static contract: PASS (${checks.length} assertions)`);
