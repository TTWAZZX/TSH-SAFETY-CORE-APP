import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { isSafetyVoteUxV1Enabled, openSafetyVoteConfirmDialog, safetyVoteJourneyNav, safetyVoteRoleNav, safetyVoteStatusBadge } from './safety-vote-ux-components.js?v=20261009-safety-vote-ux8-r1';
import {
    juryProgress, metricView, notificationSummary, operationalWarnings, preferredSnapshot,
    safeTimeline, snapshotReadiness, stageRows, statusCounts, valueOf
} from './safety-vote-operations-model.mjs?v=20261008-safety-vote-ux5-r1';

const state = {
    container: null, campaign: null, onClose: null, onNavigate: null, operations: null, analytics: null, analyticsPrivacy: false,
    juryRows: [], stages: [], snapshots: [], partialIssues: [], loading: true, error: null, denied: false,
    moduleDisabled: false, busy: false, manageUnavailable: false, exportUnavailable: false,
    notificationPreview: null, latestReport: null, actionError: '', actionNotice: ''
};

const ACTION_LABELS = {
    SAFETY_VOTE_CAMPAIGN_OPEN: 'เปิดกิจกรรม', SAFETY_VOTE_CAMPAIGN_CLOSE: 'ปิดกิจกรรม',
    SAFETY_VOTE_SCHEDULE_OPEN: 'ระบบเปิดกิจกรรมตามกำหนด', SAFETY_VOTE_SCHEDULE_CLOSE: 'ระบบปิดกิจกรรมตามกำหนด',
    SAFETY_VOTE_NOTIFICATION_QUEUE: 'จัดคิวการแจ้งเตือน', SAFETY_VOTE_EXPORT_COMPLETE: 'สร้างรายงานรวม',
    SAFETY_VOTE_RESULT_CALCULATE: 'สร้าง Result Snapshot', SAFETY_VOTE_RESULT_FREEZE: 'ตรึง Result Snapshot',
    SAFETY_VOTE_RESULT_CERTIFY: 'รับรองผล', SAFETY_VOTE_RESULT_PUBLISH: 'เผยแพร่ผล'
};

const WARNING_LABELS = {
    RECONCILIATION: 'ยอดข้อมูลไม่สมดุล', SCHEDULE: 'กำหนดการไม่ครบ', JURY_PENDING: 'งานกรรมการยังไม่ครบ',
    RESULT_PENDING: 'ผลยังไม่พร้อม', PERMISSION_DENIED: 'สิทธิ์ของบัญชีไม่ครบ', PARTIAL_DATA: 'ข้อมูลบางส่วนไม่พร้อม',
    INVALID_API_RESPONSE: 'ข้อมูลบางส่วนไม่พร้อม'
};

function warningLabel(code) {
    return WARNING_LABELS[code] || (String(code || '').startsWith('HTTP_') ? 'ข้อมูลบางส่วนไม่พร้อม' : 'โปรดตรวจสอบ');
}

function dateTime(value) {
    if (!value) return 'ยังไม่กำหนด';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'ยังไม่กำหนด' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function loadingMarkup() {
    return `<div class="svo-shell" aria-busy="true" aria-live="polite"><span class="sr-only">กำลังโหลดศูนย์ปฏิบัติการ Safety Vote</span><div class="svp-skeleton svp-skeleton--hero"></div><div class="svo-kpi-grid">${Array.from({ length: 4 }, () => '<div class="svp-skeleton svp-skeleton--card"></div>').join('')}</div></div>`;
}

function stateMarkup() {
    const nav = safetyVoteRoleNav({ active: 'admin', showAdmin: true });
    if (state.moduleDisabled) return `<div class="svo-shell">${nav}<section class="svp-state svp-state--warning" role="status"><p class="sv-eyebrow">ปิดการใช้งานอยู่</p><h1>Safety Vote ยังไม่เปิดให้ใช้งาน</h1><p>ระบบปิดแบบ fail-closed และไม่ได้อ่านข้อมูลปฏิบัติการ กรุณารอการเปิดใช้งานผ่านกระบวนการที่ได้รับอนุมัติ</p><button type="button" class="sv-button sv-button--secondary" data-svo-action="back">กลับศูนย์จัดการ</button></section></div>`;
    if (state.denied) return `<div class="svo-shell">${nav}<section class="svp-state svp-state--denied" role="alert"><p class="sv-eyebrow">ไม่อนุญาตให้เข้าถึง</p><h1>คุณไม่มีสิทธิ์ดูศูนย์ปฏิบัติการนี้</h1><p>ต้องมีสิทธิ์ดูผล Safety Vote จึงจะเปิดข้อมูลรวมและสถานะการดำเนินงานได้ ระบบไม่ได้แสดงจำนวนหรือรายละเอียดแคมเปญจากคำขอนี้</p><button type="button" class="sv-button sv-button--secondary" data-svo-action="back">กลับศูนย์จัดการ</button></section></div>`;
    return `<div class="svo-shell">${nav}<section class="svp-state svp-state--error" role="alert"><p class="sv-eyebrow">โหลดข้อมูลไม่สำเร็จ</p><h1>ยังแสดงศูนย์ปฏิบัติการไม่ได้</h1><p>ระบบไม่ได้ส่งคำสั่งเปลี่ยนสถานะหรือสร้างรายงานซ้ำ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p><div class="svo-state-actions"><button type="button" class="sv-button sv-button--primary" data-svo-action="retry">ลองอีกครั้ง</button><button type="button" class="sv-button sv-button--secondary" data-svo-action="back">กลับศูนย์จัดการ</button></div></section></div>`;
}

function metricCard(label, metric) {
    const view = metricView(metric);
    return `<article class="svo-kpi ${view.visible ? '' : 'is-suppressed'}"><span>${escHtml(label)}</span><strong>${escHtml(view.label)}</strong>${view.visible && view.percentage !== null ? `<small>${view.percentage.toLocaleString('th-TH')}%</small>` : `<small>${view.reason === 'PRIVACY_THRESHOLD' ? 'ต่ำกว่าเกณฑ์ความเป็นส่วนตัว' : 'ไม่เปิดเผยตามนโยบาย'}</small>`}</article>`;
}

function warningMarkup() {
    const warnings = operationalWarnings({ operations: state.operations, jury: state.juryRows, snapshots: state.snapshots, stages: state.stages, partialIssues: state.partialIssues });
    if (!warnings.length) return `<section class="svo-ready" role="status"><span aria-hidden="true">✓</span><div><strong>ไม่พบคำเตือนจากข้อมูลปฏิบัติการที่โหลดได้</strong><p>ตรวจสิทธิ์และสถานะการรับรองแยกอีกครั้งก่อนประกาศผล</p></div></section>`;
    return `<section class="svo-warning-list" aria-labelledby="svo-warning-title"><h2 id="svo-warning-title">สิ่งที่ต้องตรวจสอบ</h2>${warnings.map(item => `<article class="is-${item.tone}" role="${item.tone === 'danger' ? 'alert' : 'status'}"><strong>${escHtml(warningLabel(item.code))}</strong><span>${escHtml(item.text)}</span></article>`).join('')}</section>`;
}

function timelineMarkup() {
    const rows = safeTimeline(state.operations?.timeline || []);
    if (!rows.length) return `<div class="svo-empty-inline"><strong>ยังไม่มีเหตุการณ์ใน Timeline</strong><span>เหตุการณ์ที่ผ่าน audit contract จะแสดงที่นี่</span></div>`;
    return `<ol class="svo-timeline">${rows.map(row => `<li><span aria-hidden="true"></span><div><strong>${escHtml(ACTION_LABELS[row.action] || row.action.replaceAll('_', ' '))}</strong><time>${dateTime(row.occurredAt)}</time>${row.statusCode ? `<small>${escHtml(row.statusCode)}</small>` : ''}</div></li>`).join('')}</ol>`;
}

function stagesMarkup() {
    const rows = stageRows(state.stages, state.juryRows);
    const all = juryProgress(state.juryRows);
    if (!rows.length && !all.total) return `<div class="svo-empty-inline"><strong>แคมเปญนี้ไม่มีรอบกรรมการ</strong><span>พื้นที่นี้จะแสดงเมื่อมี stage หรือ jury assignment ตาม contract เดิม</span></div>`;
    return `<div class="svo-jury-overview"><div><strong>${all.submitted}/${all.total}</strong><span>งานที่กรรมการส่งแล้ว</span></div><div class="svj-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${all.percent}" aria-label="ความคืบหน้างานกรรมการ ${all.percent} เปอร์เซ็นต์"><span style="width:${all.percent}%"></span></div><small>ถอนตัว ${all.recused} · Conflict ${all.conflict}</small></div><div class="svo-stage-list">${rows.map(row => `<article><div><span>รอบ ${row.sequence || row.id}</span><strong>${escHtml(row.name)}</strong><small>${escHtml(row.type)} · ${escHtml(row.status)}</small></div><div><strong>${row.jury.submitted}/${row.jury.total}</strong><span>ส่งแล้ว</span></div></article>`).join('')}</div>`;
}

function analyticsMarkup() {
    if (state.analyticsPrivacy) return `<div class="svo-privacy-state" role="note"><strong>ไม่แสดงข้อมูลตามหน่วยงานสำหรับบัตรลงคะแนนลับ</strong><p>เซิร์ฟเวอร์ปฏิเสธมิตินี้ด้วย <code>SECRET_DIMENSION_FORBIDDEN</code> และหน้าจอจะไม่คำนวณหรือหามิติทดแทน</p></div>`;
    if (!state.analytics) return `<div class="svo-empty-inline"><strong>ข้อมูลตามหน่วยงานไม่พร้อม</strong><span>ข้อมูลส่วนอื่นยังใช้งานได้โดยไม่ลดเกณฑ์ความเป็นส่วนตัว</span></div>`;
    const rows = state.analytics.rows || [];
    if (!rows.length) return `<div class="svo-empty-inline"><strong>ยังไม่มีข้อมูลการเข้าร่วมตามหน่วยงาน</strong><span>ระบบจะแสดงเมื่อมีข้อมูลและผ่านเกณฑ์ความเป็นส่วนตัว</span></div>`;
    return `<div class="svo-analytics-list">${rows.map(row => { const metric = metricView(row); return `<article><span>${escHtml(valueOf(row, 'dimension', 'Dimension') || 'ไม่ระบุหน่วยงาน')}</span><strong>${escHtml(metric.label)}</strong><small>${metric.visible ? 'ผู้ส่งแบบ/ลงคะแนน' : 'ปกปิดตามเกณฑ์ความเป็นส่วนตัว'}</small></article>`; }).join('')}</div>`;
}

function notificationMarkup() {
    const summary = notificationSummary(state.operations?.notifications || []);
    return `<div class="svo-notification-kpis"><div><strong>${summary.queued}</strong><span>รอส่ง/ลองใหม่</span></div><div><strong>${summary.sent}</strong><span>ส่งแล้ว</span></div><div class="${summary.failed ? 'is-danger' : ''}"><strong>${summary.failed}</strong><span>ส่งไม่สำเร็จ</span></div></div>${state.notificationPreview ? `<div class="svo-preview" role="status"><strong>กลุ่มผู้ยังไม่เข้าร่วม ${Number(state.notificationPreview.total || 0).toLocaleString('th-TH')} คน</strong><span>${state.notificationPreview.truncated ? 'API จำกัดรายละเอียดไว้ 100 รายการ; หน้าจอนี้ไม่แสดงรายชื่อ' : 'หน้าจอนี้แสดงเฉพาะจำนวนรวมและไม่แสดงรายชื่อ'}</span></div>` : ''}<div class="svo-inline-actions"><button type="button" class="sv-button sv-button--secondary" data-svo-action="preview-notifications" ${state.manageUnavailable || state.busy ? 'disabled' : ''}>ตรวจจำนวนผู้รับ</button><button type="button" class="sv-button sv-button--primary" data-svo-action="queue-notifications" ${state.manageUnavailable || state.busy ? 'disabled' : ''}>จัดคิวเตือนในระบบ</button></div><p class="svo-help">การจัดคิวไม่ใช่หลักฐานว่าส่งสำเร็จ และหน้าจอนี้ไม่สั่ง external dispatch</p>`;
}

function resultsMarkup() {
    const rows = snapshotReadiness(state.snapshots);
    const aggregate = preferredSnapshot(state.snapshots, false), certified = preferredSnapshot(state.snapshots, true);
    if (!rows.length) return `<div class="svo-empty-inline"><strong>ยังไม่มี Result Snapshot</strong><span>หน้าจอนี้ไม่คำนวณผลใหม่ กรุณาใช้ workflow เจ้าของผลตามสิทธิ์เดิม</span></div>`;
    return `<div class="svo-snapshot-list">${rows.map(row => `<article><div><span>Snapshot ${row.snapshotNo}</span><strong>${escHtml(row.status)}</strong><small>Stage ${row.stageId || '—'} · ${row.resultRows} result rows · ${escHtml(row.reconciliation)}</small></div><code aria-label="Result hash">${escHtml(row.resultHash ? `${row.resultHash.slice(0, 12)}…` : 'ไม่มี hash')}</code></article>`).join('')}</div><div class="svo-cert-note" role="note"><strong>การรับรองและประกาศผลเป็นหน้าที่แยก</strong><span>ต้องใช้สิทธิ์ <code>SAFETY_VOTE_CERTIFY</code>, assignment ผู้รับรอง และ exact result hash หน้านี้สร้างได้เฉพาะรายงานจาก snapshot ที่พร้อมเท่านั้น</span></div><div class="svo-export-actions"><button type="button" class="sv-button sv-button--secondary" data-svo-action="export-excel" ${!aggregate || state.busy || state.exportUnavailable ? 'disabled' : ''}>รายงานรวม Excel</button><button type="button" class="sv-button sv-button--secondary" data-svo-action="export-pdf" ${!aggregate || state.busy || state.exportUnavailable ? 'disabled' : ''}>รายงานรวม PDF</button><button type="button" class="sv-button sv-button--primary" data-svo-action="certified-report" ${!certified || state.busy || state.exportUnavailable ? 'disabled' : ''}>รายงานผลที่รับรองแล้ว</button></div>${state.latestReport ? `<div class="svo-report-receipt" role="status"><strong>สร้างรายงานสำเร็จ</strong><span>${escHtml(state.latestReport.reportId || '')} · SHA-256 ${escHtml(String(state.latestReport.contentSha256 || '').slice(0, 16))}…</span></div>` : ''}`;
}

function render() {
    if (!state.container) return;
    if (state.loading) { state.container.innerHTML = loadingMarkup(); return; }
    if (state.error || state.denied || state.moduleDisabled) { state.container.innerHTML = stateMarkup(); bind(); return; }
    const campaign = state.campaign || {}, operations = state.operations || {}, funnel = operations.funnel || {}, status = operations.campaign?.status || campaign.Status || 'Draft';
    const notificationCounts = statusCounts(operations.notifications || []), exportCounts = statusCounts(operations.exports || []);
    state.container.innerHTML = `<div class="svo-shell" data-sv-operations="2026-10-08-safety-vote-ux5-r1">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<header class="svo-hero"><button type="button" class="sv-icon-button" data-svo-action="back" aria-label="กลับศูนย์จัดการ Safety Vote">←</button><div><p class="sv-eyebrow">ศูนย์ปฏิบัติการ Safety Vote</p><h1>${escHtml(campaign.TitleTh || campaign.titleTh || 'แคมเปญ Safety Vote')}</h1><p>${escHtml(campaign.CampaignCode || campaign.campaignCode || '')} · ข้อมูลรวมสำหรับติดตามความพร้อม ไม่ใช่หน้ารับรองหรือคำนวณผล</p></div>${safetyVoteStatusBadge(status)}</header>${warningMarkup()}${state.actionError ? `<div class="svo-action-message is-error" role="alert">${escHtml(state.actionError)}</div>` : ''}${state.actionNotice ? `<div class="svo-action-message is-success" role="status">${escHtml(state.actionNotice)}</div>` : ''}<section class="svo-kpi-grid" aria-label="Funnel การเข้าร่วมที่ผ่านเกณฑ์ความเป็นส่วนตัว">${metricCard('ผู้มีสิทธิ์', funnel.eligible)}${metricCard('เริ่มแล้ว', funnel.started)}${metricCard('ส่งแล้ว', funnel.submitted)}${metricCard('บัตรที่รับ', funnel.accepted)}</section><div class="svo-privacy-banner" role="note"><strong>Privacy threshold ทำงานที่เซิร์ฟเวอร์</strong><span>ค่าที่ถูกปกปิดจะไม่ถูกคำนวณย้อนกลับ และหน้าจอนี้ไม่อ่านตัวเลือกลงคะแนน รายชื่อผู้ลงคะแนน หรือ blind identity</span></div><main class="svo-grid"><section class="svo-panel svo-panel--timeline" aria-labelledby="svo-timeline-title"><div class="svo-panel__heading"><div><p class="sv-eyebrow">Lifecycle</p><h2 id="svo-timeline-title">กำหนดการและ Timeline</h2></div><span>${escHtml(operations.campaign?.timeZone || 'Asia/Bangkok')}</span></div><dl class="svo-schedule"><div><dt>เปิด</dt><dd>${dateTime(operations.campaign?.scheduledOpenAt)}</dd></div><div><dt>ปิด</dt><dd>${dateTime(operations.campaign?.scheduledCloseAt)}</dd></div></dl>${timelineMarkup()}</section><section class="svo-panel" aria-labelledby="svo-jury-title"><div class="svo-panel__heading"><div><p class="sv-eyebrow">Stage health</p><h2 id="svo-jury-title">รอบและงานกรรมการ</h2></div></div>${stagesMarkup()}</section><section class="svo-panel" aria-labelledby="svo-analytics-title"><div class="svo-panel__heading"><div><p class="sv-eyebrow">Privacy-safe analytics</p><h2 id="svo-analytics-title">การเข้าร่วมตามหน่วยงาน</h2></div></div>${analyticsMarkup()}</section><section class="svo-panel" aria-labelledby="svo-notification-title"><div class="svo-panel__heading"><div><p class="sv-eyebrow">Delivery health</p><h2 id="svo-notification-title">สถานะการแจ้งเตือน</h2></div><span>${Number(notificationCounts.Failed || 0) ? 'ต้องตรวจสอบ' : 'ติดตามจากสถานะรวม'}</span></div>${notificationMarkup()}</section><section class="svo-panel svo-panel--results" aria-labelledby="svo-result-title"><div class="svo-panel__heading"><div><p class="sv-eyebrow">Result readiness</p><h2 id="svo-result-title">Snapshot และรายงาน</h2></div><span>Export สำเร็จ ${Number(exportCounts.Completed || 0)}</span></div>${resultsMarkup()}</section></main><footer class="svo-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svo-action="back">กลับศูนย์จัดการ</button><div><button type="button" class="sv-button sv-button--secondary" data-svo-action="refresh" ${state.busy ? 'disabled' : ''}>รีเฟรช</button><button type="button" class="sv-button sv-button--primary" data-svo-action="process-schedule" ${state.manageUnavailable || state.busy ? 'disabled' : ''}>ประมวลผลกำหนดการ</button></div></footer></div>`;
    state.container.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'admin', current: 'operations', campaign, onPage: typeof state.onNavigate !== 'function' }));
    bind();
}

function issueFrom(result, label) {
    const error = result.reason;
    const permissionDenied = Number(error?.status) === 403 || error?.code === 'PERMISSION_DENIED';
    return { code: error?.code || 'PARTIAL_DATA', message: `${label} ไม่พร้อมใช้งาน${permissionDenied ? ' เนื่องจากสิทธิ์ของบัญชีนี้' : ''}` };
}

function normalizeSettledHttp(result) {
    if (result.status !== 'fulfilled' || result.value?.data !== undefined) return result;
    const status = Number(result.value?.status || 0);
    return { status: 'rejected', reason: { status, code: status ? `HTTP_${status}` : 'INVALID_API_RESPONSE' } };
}

async function loadData() {
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.partialIssues = []; render();
    const id = Number(state.campaign?.id);
    const paths = [
        API.get(`/safety-vote/admin/campaigns/${id}/operations`, { suppressErrorLog: true }),
        API.get(`/safety-vote/admin/campaigns/${id}/analytics/organization`, { suppressErrorLog: true }),
        API.get(`/safety-vote/admin/campaigns/${id}/jury/progress`, { suppressErrorLog: true }),
        API.get(`/safety-vote/admin/campaigns/${id}/stages`, { suppressErrorLog: true }),
        API.get(`/safety-vote/admin/campaigns/${id}/results/snapshots`, { suppressErrorLog: true })
    ];
    const [operations, analytics, jury, stages, snapshots] = (await Promise.allSettled(paths)).map(normalizeSettledHttp);
    if (operations.status === 'rejected') {
        const error = operations.reason;
        state.denied = Number(error?.status) === 403 || error?.code === 'PERMISSION_DENIED';
        state.moduleDisabled = error?.code === 'SAFETY_VOTE_MODULE_DISABLED';
        state.error = state.denied || state.moduleDisabled ? null : error;
    } else {
        state.operations = operations.value.data;
        state.analyticsPrivacy = analytics.status === 'rejected' && analytics.reason?.code === 'SECRET_DIMENSION_FORBIDDEN';
        state.analytics = analytics.status === 'fulfilled' ? analytics.value.data : null;
        state.juryRows = jury.status === 'fulfilled' ? jury.value.data?.rows || [] : [];
        state.stages = stages.status === 'fulfilled' ? stages.value.data?.rows || [] : [];
        state.snapshots = snapshots.status === 'fulfilled' ? snapshots.value.data?.rows || [] : [];
        state.manageUnavailable = [jury, stages].some(result => result.status === 'rejected' && (Number(result.reason?.status) === 403 || result.reason?.code === 'PERMISSION_DENIED'));
        if (analytics.status === 'rejected' && !state.analyticsPrivacy) state.partialIssues.push(issueFrom(analytics, 'ข้อมูลตามหน่วยงาน'));
        if (jury.status === 'rejected') state.partialIssues.push(issueFrom(jury, 'ความคืบหน้างานกรรมการ'));
        if (stages.status === 'rejected') state.partialIssues.push(issueFrom(stages, 'ข้อมูลรอบกิจกรรม'));
        if (snapshots.status === 'rejected') state.partialIssues.push(issueFrom(snapshots, 'Result Snapshot'));
    }
    state.loading = false; render();
}

async function runAction(task, successMessage) {
    if (state.busy) return;
    state.busy = true; state.actionError = ''; state.actionNotice = ''; render();
    try {
        await task();
        state.actionNotice = successMessage;
        showToast(successMessage, 'success');
    } catch (error) {
        if (Number(error?.status) === 403 || error?.code === 'PERMISSION_DENIED') state.exportUnavailable = true;
        state.actionError = error?.message || 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และสถานะแล้วลองอีกครั้ง';
    } finally {
        state.busy = false; render();
    }
}

async function processSchedule() {
    await runAction(async () => {
        const response = await API.post('/safety-vote/admin/operations/process-due', {});
        await loadData();
        state.actionNotice = `ประมวลผลกำหนดการแล้ว ${Number(response.data?.changed?.length || 0)} แคมเปญ`;
    }, 'ประมวลผลกำหนดการแล้ว');
}

async function previewNotifications() {
    await runAction(async () => {
        const response = await API.get(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/notifications/preview?audience=nonparticipants`);
        state.notificationPreview = response.data;
    }, 'ตรวจจำนวนผู้รับการแจ้งเตือนแล้ว');
}

async function queueNotifications() {
    await runAction(async () => {
        const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/notifications/queue`, {
            audience: 'nonparticipants', eventType: 'reminder', templateKey: 'vote_reminder', channel: 'in_app',
            windowKey: new Date().toISOString().slice(0, 10), metadata: { route: '#safety-vote' }
        });
        state.actionNotice = `จัดคิว ${Number(response.data?.queued || 0)} รายการ · ระงับรายการซ้ำ ${Number(response.data?.suppressed || 0)}`;
        await loadData();
    }, 'จัดคิวการแจ้งเตือนแล้ว');
}

async function createReport(format, certified = false) {
    const snapshot = preferredSnapshot(state.snapshots, certified);
    if (!snapshot) return;
    await runAction(async () => {
        const suffix = certified ? '/exports/certified-report' : '/exports';
        const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}${suffix}`, { snapshotId: snapshot.id, format });
        state.latestReport = certified ? response.data : response.data?.report;
        await loadData();
    }, certified ? 'สร้างรายงานผลที่รับรองแล้ว' : 'สร้างรายงานรวมแล้ว');
}

function confirmAction(action) {
    if (action === 'process-schedule') return openSafetyVoteConfirmDialog({ title: 'ประมวลผลกำหนดการที่ถึงเวลา', description: 'คำสั่งนี้จะใช้ contract เดิมประมวลผลทุกแคมเปญที่ถึงเวลาเปิดหรือปิดในเขตเวลา Asia/Bangkok และบันทึก audit กรุณายืนยันว่าต้องการดำเนินการตอนนี้', confirmLabel: 'ยืนยันประมวลผล', onConfirm: processSchedule });
    if (action === 'queue-notifications') return openSafetyVoteConfirmDialog({ title: 'จัดคิวเตือนผู้ยังไม่เข้าร่วม', description: 'ระบบจะจัดคิวข้อความในระบบให้ผู้มีสิทธิ์ที่ยังไม่ส่ง และระงับรายการซ้ำตาม suppression key หน้าจอนี้จะไม่สั่ง external dispatch', confirmLabel: 'ยืนยันจัดคิว', onConfirm: queueNotifications });
    if (action.startsWith('export-') || action === 'certified-report') {
        const certified = action === 'certified-report', format = action === 'export-excel' ? 'excel' : 'pdf';
        return openSafetyVoteConfirmDialog({ title: certified ? 'สร้างรายงานผลที่รับรองแล้ว' : 'สร้างรายงานข้อมูลรวม', description: 'ระบบจะสร้างไฟล์ใหม่จาก Result Snapshot ที่ผ่านสถานะตาม contract โดยไม่คำนวณผลหรือรับรองผลใหม่', confirmLabel: 'ยืนยันสร้างรายงาน', onConfirm: () => createReport(format, certified) });
    }
}

function bind() {
    state.container?.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => state.onNavigate?.(button.dataset.svJourneyStep)));
    state.container?.querySelectorAll('[data-svo-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.svoAction;
        if (action === 'back') state.onClose?.();
        else if (action === 'retry' || action === 'refresh') loadData();
        else if (action === 'preview-notifications') previewNotifications();
        else confirmAction(action);
    }));
}

export async function renderSafetyVoteOperationsWorkspace(container, { campaign = null, onClose = null, onNavigate = null } = {}) {
    if (!isSafetyVoteUxV1Enabled() || !container || !campaign?.id) return false;
    Object.assign(state, { container, campaign, onClose, onNavigate, operations: null, analytics: null, analyticsPrivacy: false, juryRows: [], stages: [], snapshots: [], partialIssues: [], loading: true, error: null, denied: false, moduleDisabled: false, busy: false, manageUnavailable: false, exportUnavailable: false, notificationPreview: null, latestReport: null, actionError: '', actionNotice: '' });
    await loadData();
    return true;
}
