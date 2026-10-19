'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/safety-vote-phase5.js');
const phpRoute = read('api/handlers/safety_vote_phase5.php');
const nodeService = read('backend/services/safety-vote-phase5.js');
const phpService = read('api/lib/safety_vote_phase5.php');
const page = read('public/js/pages/admin-safety-vote-results.js');
const css = read('public/style.css');
const index = read('index.html');
const checks = [
  [nodeRoute.includes("/admin/campaigns/:id/results/dashboard"), 'Node dashboard route missing'],
  [phpRoute.includes("/safety-vote/admin/campaigns/:id/results/dashboard"), 'PHP dashboard route missing'],
  [nodeRoute.includes("permit('SAFETY_VOTE_RESULT_VIEW')"), 'Node result-view permission missing'],
  [phpRoute.includes("sv_require_permission($u,'SAFETY_VOTE_RESULT_VIEW')"), 'PHP result-view permission missing'],
  [nodeService.includes("classification:'authorized_aggregate_only'"), 'Node aggregate classification missing'],
  [phpService.includes("'classification'=>'authorized_aggregate_only'"), 'PHP aggregate classification missing'],
  [nodeService.includes('identityFieldsIncluded:false'), 'Node identity exclusion missing'],
  [phpService.includes("'identityFieldsIncluded'=>false"), 'PHP identity exclusion missing'],
  [page.includes('Campaign Result Dashboard'), 'Admin dashboard UI missing'],
  [page.includes('data-svr-action="export-excel"'), 'Excel action missing'],
  [page.includes('data-svr-action="export-pdf"'), 'PDF action missing'],
  [page.includes("['Frozen', 'Certified', 'Published']"), 'Export snapshot-state guard missing'],
  [nodeRoute.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'Node XLSX MIME missing'],
  [phpRoute.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'PHP XLSX MIME missing'],
  [nodeRoute.includes("?'pdf':'xlsx'"), 'Node XLSX extension missing'],
  [phpRoute.includes("?'.pdf':'.xlsx'"), 'PHP XLSX extension missing'],
  [nodeRoute.includes("'utf16le'"), 'Node PDF Unicode encoding missing'],
  [phpRoute.includes("'UTF-16BE'"), 'PHP PDF Unicode encoding missing'],
  [css.includes('.svr-panel--dashboard'), 'Dashboard styles missing'],
  [css.includes('.svr-kpi-grid'), 'Responsive KPI grid missing'],
  [index.includes('20261019-safety-vote-open-feedback-r1'), 'Current runtime cache key missing'],
  [!page.includes('SafetyVote_ResultRows'), 'Client must not query result tables directly']
];
checks.forEach(([ok, message]) => assert(ok, message));
console.log(`Safety Vote Campaign Result Dashboard static contract: PASS (${checks.length} assertions)`);
