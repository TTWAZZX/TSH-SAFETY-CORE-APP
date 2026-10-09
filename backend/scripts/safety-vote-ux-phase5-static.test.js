'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

(async () => {
    const workspace = read('public/js/pages/admin-safety-vote-operations.js');
    const center = read('public/js/pages/admin-safety-vote-ux1.js');
    const components = read('public/js/pages/safety-vote-ux-components.js');
    const css = read('public/style.css');
    const main = read('public/js/main.js');
    const html = read('index.html');
    const preflight = read('docs/safety-vote-ux-phase5-preflight-scope.md');
    const model = await import(pathToFileURL(path.join(root, 'public', 'js', 'pages', 'safety-vote-operations-model.mjs')).href);
    let checks = 0;
    const check = (value, message) => { checks += 1; assert(value, message); };

    check(components.includes('__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true'), 'Safety Vote UX must remain strict opt-in');
    check(center.includes('renderLegacySafetyVoteFoundation(container)'), 'flag-off rollback must retain the legacy Admin workspace');
    check(center.includes("action: 'open-operations'"), 'Admin Campaign Center must expose the Operations workspace');
    check(workspace.includes('/operations`'), 'existing Operations API is not used');
    check(workspace.includes('/analytics/organization`'), 'existing organization analytics API is not used');
    check(workspace.includes('/jury/progress`'), 'existing jury progress API is not used');
    check(workspace.includes('/stages`'), 'existing stages API is not used');
    check(workspace.includes('/results/snapshots`'), 'existing result snapshots API is not used');
    check(workspace.includes('/notifications/preview?audience=nonparticipants'), 'existing notification preview API is not used');
    check(workspace.includes('/notifications/queue`'), 'existing notification queue API is not used');
    check(workspace.includes("'/safety-vote/admin/operations/process-due'"), 'existing schedule processor is not used');
    check(workspace.includes("'/exports/certified-report'"), 'certified report API is not used');
    check(workspace.includes("'/exports'"), 'aggregate export API is not used');
    check(!workspace.includes('/results/calculate'), 'Operations UX must not calculate results');
    check(!workspace.includes('/certify'), 'Operations UX must not certify results');
    check(!workspace.includes('/publish'), 'Operations UX must not publish results');
    check(!workspace.includes('/notifications/dispatch'), 'Operations UX must not dispatch externally');
    check(workspace.includes('SECRET_DIMENSION_FORBIDDEN') && workspace.includes('analyticsPrivacy'), 'secret dimension denial must be an explicit privacy state');
    check(workspace.includes('metricView(metric)') && workspace.includes('metricView(row)'), 'server suppression metadata must drive metric rendering');
    check(!workspace.includes('notificationPreview.rows'), 'notification employee rows must not be rendered');
    check(workspace.includes('หน้าจอนี้ไม่แสดงรายชื่อ'), 'notification preview needs privacy-safe wording');
    check(workspace.includes('หน้าจอนี้ไม่อ่านตัวเลือกลงคะแนน'), 'ballot/blind identity privacy wording is missing');
    check(workspace.includes('Promise.allSettled'), 'partial-data loading is missing');
    check(workspace.includes('partialIssues') && workspace.includes('ไม่พร้อมใช้งาน'), 'partial state is incomplete');
    check(workspace.includes('normalizeSettledHttp') && workspace.includes('INVALID_API_RESPONSE'), 'non-JSON HTTP failures must become declared partial states');
    check(workspace.includes('warningLabel') && workspace.includes('ข้อมูลบางส่วนไม่พร้อม'), 'partial-state production wording is missing');
    check(workspace.includes('state.moduleDisabled') && workspace.includes('fail-closed'), 'module-disabled fail-closed state is missing');
    check(workspace.includes('state.denied') && workspace.includes('PERMISSION_DENIED'), 'permission denied state is missing');
    check(workspace.includes('openSafetyVoteConfirmDialog'), 'mutating operations need accessible confirmation');
    check(workspace.includes('if (state.busy) return'), 'duplicate action protection is missing');
    check(workspace.includes('SAFETY_VOTE_CERTIFY') && workspace.includes('exact result hash'), 'certification ownership wording is missing');
    check(/safety-vote-ux(?:5|6|7|8)-r1/.test(main) && /safety-vote-ux(?:5|6|7|8)-r1/.test(html), 'Phase 5-or-later cache chain is incomplete');
    check(css.includes('Safety Vote UX/UI Phase 5'), 'Phase 5 scoped CSS marker is missing');
    check(css.includes('.svo-action-bar') && css.includes('env(safe-area-inset-bottom)'), 'responsive sticky action bar lacks safe-area handling');
    check(css.includes('.svo-shell button') && css.includes('min-height: 44px'), '44 px touch targets are not enforced');
    check(css.includes(':focus-visible'), 'visible keyboard focus is missing');
    check(css.includes('@media (max-width: 430px)') && css.includes('@media (max-width: 767px)') && css.includes('@media (max-width: 1023px)'), 'required responsive breakpoints are incomplete');
    check(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion handling is missing');
    check(css.includes('overflow-x: clip'), 'horizontal overflow containment is missing');

    check(model.metricView({ visible: false, suppressed: true, reason: 'PRIVACY_THRESHOLD', value: null }).label === 'ปกปิด', 'suppressed metric must not reveal a number');
    check(model.metricView({ visible: true, value: 8, percentage: 80 }).value === 8, 'visible aggregate metric is incorrect');
    const jury = model.juryProgress([{ Status: 'Draft', ConflictState: 'clear', total: 2 }, { Status: 'Submitted', ConflictState: 'clear', total: 3 }, { Status: 'Recused', ConflictState: 'recused', total: 1 }]);
    check(jury.total === 6 && jury.submitted === 3 && jury.recused === 1 && jury.percent === 50, 'jury progress aggregation is incorrect');
    const ready = model.snapshotReadiness([{ id: 9, SnapshotNo: 2, Status: 'Frozen', ResultHash: 'a'.repeat(64) }, { id: 10, SnapshotNo: 3, Status: 'Certified', ResultHash: 'b'.repeat(64) }]);
    check(ready[0].aggregateExportReady && !ready[0].certifiedReportReady, 'Frozen snapshot export readiness is incorrect');
    check(ready[1].aggregateExportReady && ready[1].certifiedReportReady, 'Certified snapshot report readiness is incorrect');
    check(model.preferredSnapshot([{ id: 9, Status: 'Calculated' }, { id: 10, Status: 'Published' }], true).id === 10, 'certified snapshot selection is incorrect');
    const safe = model.safeTimeline([{ Action: 'SAFE', BoundedDetail: 'employee=E001; answer=A', OccurredAt: '2026-10-08T00:00:00Z' }]);
    check(safe.length === 1 && !Object.prototype.hasOwnProperty.call(safe[0], 'BoundedDetail'), 'timeline must omit bounded detail from presentation');
    const notifications = model.notificationSummary([{ Status: 'Queued', total: 2 }, { Status: 'Retry', total: 1 }, { Status: 'Sent', total: 4 }, { Status: 'Failed', total: 1 }]);
    check(notifications.queued === 3 && notifications.sent === 4 && notifications.failed === 1 && notifications.total === 8, 'notification status aggregation is incorrect');
    check(model.operationalWarnings({ operations: { health: { reconciliation: 'mismatch' }, campaign: {} } }).some(item => item.code === 'RECONCILIATION'), 'reconciliation warning is missing');

    for (const excluded of ['backend/routes/**', 'api/**', 'backend/migrations/**', 'shared/**']) {
        check(preflight.includes(excluded), `excluded scope is undocumented: ${excluded}`);
    }
    check(preflight.includes('GO_FOR_UX_PHASE5_LOCAL_IMPLEMENTATION'), 'preflight decision is missing');
    check(preflight.includes('SECRET_DIMENSION_FORBIDDEN') && preflight.includes('SAFETY_VOTE_CERTIFY'), 'privacy/certification ownership findings are incomplete');

    console.log(`Safety Vote UX Phase 5 static/unit/accessibility/scope contract: PASS (${checks} assertions)`);
})().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
