import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { isSafetyVoteUxV1Enabled, safetyVoteRoleNav, safetyVoteStatusBadge, openSafetyVoteTypedConfirmationDialog } from './safety-vote-ux-components.js?v=20261008-safety-vote-ux7-r1';
import { normalizeVerification, normalizeAcceptance, normalizePreflight, normalizeObservability, normalizeCatalog, normalizePreview, evidenceTimeline } from './safety-vote-governance-model.mjs?v=20261008-safety-vote-ux7-r1';

const state = { container: null, campaign: null, onClose: null, loading: true, denied: false, moduleDisabled: false, error: null, partial: [], verification: null, acceptance: null, preflight: null, observability: null, catalog: [], providers: null, preview: null, receipts: [], busy: false, notice: '', actionError: '' };

function dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function partialIssue(label, error) {
    const code = error?.code || (error?.status ? `HTTP_${error.status}` : 'UNAVAILABLE');
    return { label, message: `${code} — ไม่ถือว่าผ่าน readiness และส่วนอื่นยังทำงานตามสิทธิ์ที่มี` };
}

function statePage() {
    const nav = safetyVoteRoleNav({ active: 'admin', showAdmin: true });
    if (state.moduleDisabled) return `<div class="svg-shell">${nav}<section class="svp-state svp-state--warning" role="status"><p class="sv-eyebrow">ปิดการใช้งานอยู่</p><h1>Safety Vote ยังไม่เปิดให้ใช้งาน</h1><p>ระบบหยุดแบบ fail-closed และไม่ได้อ่านหลักฐาน governance, acceptance หรือ handoff</p><button class="sv-button sv-button--secondary" data-svg-action="back">กลับศูนย์จัดการ</button></section></div>`;
    if (state.denied) return `<div class="svg-shell">${nav}<section class="svp-state svp-state--denied" role="alert"><p class="sv-eyebrow">ไม่อนุญาตให้เข้าถึง</p><h1>คุณไม่มีสิทธิ์ตรวจหลักฐานการปล่อยใช้งาน</h1><p>ต้องมีสิทธิ์ Audit View ก่อนจึงจะอ่าน verification และ acceptance evidence ได้ ระบบไม่ได้เปิดเผย hash หรือ audit metadata จากคำขอนี้</p><button class="sv-button sv-button--secondary" data-svg-action="back">กลับศูนย์จัดการ</button></section></div>`;
    return `<div class="svg-shell">${nav}<section class="svp-state svp-state--error" role="alert"><p class="sv-eyebrow">โหลดหลักฐานไม่สำเร็จ</p><h1>ยังเปิดพื้นที่ธรรมาภิบาลไม่ได้</h1><p>ไม่มีการส่ง handoff หรือบันทึก acceptance จากความล้มเหลวนี้</p><div class="svo-state-actions"><button class="sv-button sv-button--primary" data-svg-action="retry">ลองอีกครั้ง</button><button class="sv-button sv-button--secondary" data-svg-action="back">กลับศูนย์จัดการ</button></div></section></div>`;
}

function verificationPanel() {
    const model = normalizeVerification(state.verification);
    if (!model.available) return `<div class="svg-empty"><strong>ยังไม่มีหลักฐาน verification ที่อ่านได้</strong><p>สถานะนี้ไม่ถือว่าผ่าน และไม่สร้าง hash ทดแทนในเบราว์เซอร์</p></div>`;
    return `<div class="svg-verification"><div class="svg-summary ${model.ready && model.privacySafe ? 'is-pass' : 'is-hold'}"><strong>${model.ready && model.privacySafe ? 'หลักฐานที่ตรวจได้ตรงกัน' : 'หลักฐานยังมีเงื่อนไขที่ต้องตรวจ'}</strong><span>Identity mappings ${model.identityMappings.toLocaleString('th-TH')} · Active certifiers ${model.activeCertifiers.toLocaleString('th-TH')}</span></div><div class="svg-check-grid">${model.checks.map(check => `<article class="svg-check ${check.state === 'pass' ? 'is-pass' : 'is-block'}"><div><strong>${escHtml(check.key.replaceAll('_', ' '))}</strong><span>${check.state === 'pass' ? 'hash ตรงกัน' : 'hash ไม่พร้อมหรือไม่ตรงกัน'}</span></div><dl><div><dt>Stored SHA-256</dt><dd><code>${escHtml(check.storedHash || 'ไม่มีค่า')}</code></dd></div><div><dt>Calculated SHA-256</dt><dd><code>${escHtml(check.calculatedHash || 'ไม่มีค่า')}</code></dd></div></dl></article>`).join('')}</div><div class="svg-hash"><span>Verification SHA-256</span><code>${escHtml(model.verificationHash || 'ไม่มีค่า')}</code><button class="sv-button sv-button--secondary" data-svg-copy="${escHtml(model.verificationHash)}" ${model.verificationHash ? '' : 'disabled'}>คัดลอก hash</button></div></div>`;
}

function preflightPanel() {
    const model = normalizePreflight(state.preflight);
    if (!model.available) return `<div class="svg-empty"><strong>ไม่มีสิทธิ์หรือยังอ่าน release preflight ไม่ได้</strong><p>ระบบคงสถานะ HOLD และไม่ตีความข้อมูลที่หายไปว่าเป็นการอนุมัติ</p></div>`;
    return `<div class="svg-preflight"><div class="svg-decision ${model.ready ? 'is-ready' : 'is-hold'}"><span>Release decision</span><strong>${escHtml(model.decision)}</strong><small>Production connected: ${model.productionConnected ? 'ใช่' : 'ไม่'} · Deploy authorized: ${model.deployAuthorized ? 'ใช่' : 'ไม่'}</small></div><ul class="svg-preflight-list">${model.checks.map(check => `<li class="${check.state === 'pass' ? 'is-pass' : 'is-block'}"><span>${escHtml(check.key.replaceAll('_', ' '))}${check.required ? ' · required' : ''}</span><strong>${check.state === 'pass' ? 'ผ่าน' : 'HOLD'}</strong></li>`).join('')}</ul>${model.missingAcceptance.length ? `<p class="svg-warning">ยังขาด acceptance: ${model.missingAcceptance.map(escHtml).join(', ')}</p>` : ''}<div class="svg-hash"><span>Preflight SHA-256</span><code>${escHtml(model.preflightHash || 'ไม่มีค่า')}</code></div></div>`;
}

function acceptancePanel() {
    const model = normalizeAcceptance(state.acceptance), phrase = `I ACCEPT SHE_OWNER ${state.campaign.CampaignCode || ''}`;
    const rows = model.rows.length ? `<div class="svg-acceptance-list">${model.rows.map(row => `<article class="${row.decision === 'Accepted' && !row.revokedAt ? 'is-accepted' : 'is-inactive'}"><div><strong>${escHtml(row.acceptanceArea)}</strong><span>${escHtml(row.decision)} · ${dateTime(row.approvedAt)}</span></div><dl><div><dt>ผู้อนุมัติ</dt><dd>${escHtml(row.approvedBy || 'ไม่ระบุ')}</dd></div><div><dt>หลักฐานอ้างอิง</dt><dd>${escHtml(row.evidenceReference || 'ไม่ระบุ')}</dd></div><div><dt>Evidence SHA-256</dt><dd><code>${escHtml(row.evidenceSha256 || 'ไม่มีค่า')}</code></dd></div></dl></article>`).join('')}</div>` : `<div class="svg-empty"><strong>ยังไม่มี SHE acceptance</strong><p>ต้องบันทึกโดยผู้มีสิทธิ์ Admin พร้อม reference และข้อความยืนยันที่ตรงทุกตัว</p></div>`;
    return `${rows}<div class="svg-inline-status ${model.ready ? 'is-pass' : 'is-hold'}"><strong>${model.ready ? 'SHE acceptance พร้อมใช้งาน' : 'ยังขาด SHE acceptance'}</strong><span>Required: ${model.required.map(escHtml).join(', ')}</span></div><button class="sv-button sv-button--primary" data-svg-action="accept-she" ${normalizePreflight(state.preflight).available && !model.ready ? '' : 'disabled'}>${model.ready ? 'SHE acceptance บันทึกแล้ว' : 'บันทึก Approve by SHE'}</button><p class="svg-help">ข้อความยืนยัน: <code>${escHtml(phrase)}</code></p>`;
}

function observabilityPanel() {
    const model = normalizeObservability(state.observability);
    if (!model.available) return `<div class="svg-empty"><strong>ยังอ่าน observability ไม่ได้</strong><p>ไม่สรุปจำนวนแทนและไม่ดึงข้อมูลผู้ลงคะแนน</p></div>`;
    return `<div class="svg-kpis"><article><span>Handoffs ทั้งหมด</span><strong>${model.handoffs.total.toLocaleString('th-TH')}</strong></article><article><span>Delivered</span><strong>${model.handoffs.delivered.toLocaleString('th-TH')}</strong></article><article><span>Failed</span><strong>${model.handoffs.failed.toLocaleString('th-TH')}</strong></article><article class="${model.openAlerts ? 'is-alert' : ''}"><span>Open alerts</span><strong>${model.openAlerts.toLocaleString('th-TH')}</strong></article></div><div class="svg-privacy"><strong>Privacy-safe telemetry</strong><span>Voter-choice metrics: ${model.voterChoiceMetrics ? 'เปิด' : 'ปิด'}</span><span>Receipt lookup: ${model.receiptLookup ? 'เปิด' : 'ปิด'}</span></div>`;
}

function handoffPanel() {
    const adapters = state.catalog.filter(adapter => !adapter.automaticMutation && !adapter.canVote && !adapter.canCertify && !adapter.canReadHiddenResults);
    const options = adapters.map(adapter => `<option value="${escHtml(adapter.key)}">${escHtml(adapter.key)} · ${escHtml(adapter.mode)}</option>`).join('');
    const preview = state.preview ? `<div class="svg-preview" role="status"><div class="svg-summary ${!state.preview.externalMutation && !state.preview.payload.externalMutation ? 'is-pass' : 'is-hold'}"><strong>Certified aggregate preview</strong><span>External mutation: ${state.preview.externalMutation ? 'true' : 'false'} · voter identity: ${state.preview.payload.containsVoterIdentity ? 'true' : 'false'} · ballot choice: ${state.preview.payload.containsBallotChoice ? 'true' : 'false'}</span></div><dl><div><dt>Target</dt><dd>${escHtml(state.preview.payload.targetAdapter)}</dd></div><div><dt>Classification</dt><dd>${escHtml(state.preview.payload.classification)}</dd></div><div><dt>Snapshot</dt><dd>${state.preview.payload.resultSnapshotId}</dd></div><div><dt>Result SHA-256</dt><dd><code>${escHtml(state.preview.payload.resultHash)}</code></dd></div><div><dt>Report</dt><dd>${escHtml(state.preview.payload.reportId || 'ไม่มีรายงาน')}</dd></div><div><dt>Report SHA-256</dt><dd><code>${escHtml(state.preview.payload.reportSha256 || 'ไม่มีค่า')}</code></dd></div><div><dt>Preview SHA-256</dt><dd><code>${escHtml(state.preview.previewHash)}</code></dd></div></dl><p>ข้อความยืนยัน: <code>${escHtml(state.preview.confirmation)}</code></p><button class="sv-button sv-button--danger" data-svg-action="confirm-handoff">ยืนยัน fixture-only handoff</button></div>` : '';
    if (!adapters.length) return `<div class="svg-empty"><strong>ยังไม่มีสิทธิ์อ่าน adapter catalog</strong><p>Handoff preview และ confirmation ถูกปิด ไม่เลือก adapter จากการคาดเดา</p></div>`;
    return `<div class="svg-handoff-controls"><label><span>Read-only target adapter</span><select data-svg-adapter>${options}</select></label><button class="sv-button sv-button--secondary" data-svg-action="preview-handoff">สร้าง preview ที่ไม่ส่งออก</button></div>${preview}`;
}

function timelinePanel() {
    const rows = evidenceTimeline(normalizeAcceptance(state.acceptance), state.receipts);
    if (!rows.length) return `<div class="svg-empty"><strong>ยังไม่มีเหตุการณ์หลักฐาน</strong><p>Timeline จะแสดงเฉพาะ acceptance และ receipt ที่ไม่เปิดเผยข้อมูลผู้ลงคะแนน</p></div>`;
    return `<ol class="svg-timeline">${rows.map(row => `<li><span aria-hidden="true"></span><div><strong>${escHtml(row.title)}</strong><small>${dateTime(row.at)}${row.actor ? ` · ${escHtml(row.actor)}` : ''}</small><p>${escHtml(row.reference || '')}</p>${row.hash ? `<code>${escHtml(row.hash)}</code>` : ''}</div></li>`).join('')}</ol>`;
}

function render() {
    if (!state.container) return;
    if (state.loading) { state.container.innerHTML = `<div class="svg-shell" aria-busy="true" aria-live="polite"><span class="sr-only">กำลังโหลดหลักฐาน governance และ release readiness</span><div class="svp-skeleton svp-skeleton--hero"></div><div class="svp-skeleton svp-skeleton--card"></div></div>`; return; }
    if (state.error || state.denied || state.moduleDisabled) { state.container.innerHTML = statePage(); bind(); return; }
    const partial = state.partial.length ? `<section class="svg-partial" aria-labelledby="svg-partial-title"><h2 id="svg-partial-title">ข้อมูลบางส่วนไม่พร้อม</h2>${state.partial.map(item => `<article role="status"><strong>${escHtml(item.label)}</strong><span>${escHtml(item.message)}</span></article>`).join('')}</section>` : '';
    const accepted = normalizeAcceptance(state.acceptance).ready;
    state.container.innerHTML = `<div class="svg-shell" data-sv-governance="2026-10-08-safety-vote-ux7-r1">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<header class="svg-hero"><button class="sv-icon-button" data-svg-action="back" aria-label="กลับศูนย์จัดการ Safety Vote">←</button><div><p class="sv-eyebrow">ธรรมาภิบาลและหลักฐานการปล่อยใช้งาน Safety Vote</p><h1>${escHtml(state.campaign.TitleTh || state.campaign.CampaignCode || 'Safety Vote')}</h1><p>ตรวจ checksum, SHE acceptance, privacy-safe audit และ release HOLD โดยไม่อนุญาต Production หรือ external delivery</p></div>${safetyVoteStatusBadge(state.campaign.Status)}</header>${partial}${state.actionError ? `<div class="svg-message is-error" role="alert">${escHtml(state.actionError)}</div>` : ''}${state.notice ? `<div class="svg-message is-success" role="status">${escHtml(state.notice)}</div>` : ''}<main class="svg-grid"><section class="svg-panel svg-panel--wide" aria-labelledby="svg-preflight-title"><div class="svg-panel__heading"><div><p class="sv-eyebrow">Authoritative release gate</p><h2 id="svg-preflight-title">Release preflight checklist</h2></div></div>${preflightPanel()}</section><section class="svg-panel svg-panel--wide" aria-labelledby="svg-verification-title"><div class="svg-panel__heading"><div><p class="sv-eyebrow">Immutable evidence</p><h2 id="svg-verification-title">ตรวจ checksum และ privacy separation</h2></div></div>${verificationPanel()}</section><section class="svg-panel" aria-labelledby="svg-acceptance-title"><div class="svg-panel__heading"><div><p class="sv-eyebrow">SHE ownership</p><h2 id="svg-acceptance-title">Acceptance evidence</h2></div></div>${acceptancePanel()}</section><section class="svg-panel" aria-labelledby="svg-observability-title"><div class="svg-panel__heading"><div><p class="sv-eyebrow">Privacy-safe operations</p><h2 id="svg-observability-title">Observability และ alerts</h2></div></div>${observabilityPanel()}</section><section class="svg-panel svg-panel--wide" aria-labelledby="svg-handoff-title"><div class="svg-panel__heading"><div><p class="sv-eyebrow">No automatic delivery</p><h2 id="svg-handoff-title">Integration handoff preview</h2></div></div>${handoffPanel()}</section><section class="svg-panel svg-panel--wide" aria-labelledby="svg-timeline-title"><div class="svg-panel__heading"><div><p class="sv-eyebrow">Bounded audit evidence</p><h2 id="svg-timeline-title">Timeline หลักฐาน</h2></div></div>${timelinePanel()}</section></main><footer class="svg-action-bar"><button class="sv-button sv-button--secondary" data-svg-action="back">กลับศูนย์จัดการ</button><div><button class="sv-button sv-button--secondary" data-svg-action="refresh" ${state.busy ? 'disabled' : ''}>รีเฟรชหลักฐาน</button><button class="sv-button sv-button--primary" data-svg-action="accept-she" ${normalizePreflight(state.preflight).available && !state.busy && !accepted ? '' : 'disabled'}>${accepted ? 'SHE acceptance บันทึกแล้ว' : 'Approve by SHE'}</button></div></footer></div>`;
    bind();
}

async function loadData() {
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.partial = []; state.preview = null; render();
    const id = Number(state.campaign.id);
    try { state.verification = (await API.get(`/safety-vote/admin/campaigns/${id}/release-verification`, { suppressErrorLog: true })).data; }
    catch (error) { state.denied = error?.code === 'PERMISSION_DENIED' || Number(error?.status) === 403; state.moduleDisabled = error?.code === 'SAFETY_VOTE_MODULE_DISABLED'; state.error = state.denied || state.moduleDisabled ? null : error; state.loading = false; render(); return; }
    const calls = [
        ['Acceptance evidence', API.get(`/safety-vote/admin/campaigns/${id}/acceptance-evidence`, { suppressErrorLog: true })],
        ['Observability', API.get(`/safety-vote/admin/campaigns/${id}/observability`, { suppressErrorLog: true })],
        ['Release preflight', API.get(`/safety-vote/admin/campaigns/${id}/release-preflight`, { suppressErrorLog: true })],
        ['Adapter catalog', API.get('/safety-vote/admin/integrations/catalog', { suppressErrorLog: true })],
        ['Provider mode', API.get('/safety-vote/admin/integrations/providers', { suppressErrorLog: true })]
    ];
    const results = await Promise.allSettled(calls.map(item => item[1]));
    state.acceptance = results[0].status === 'fulfilled' ? results[0].value.data : null;
    state.observability = results[1].status === 'fulfilled' ? results[1].value.data : null;
    state.preflight = results[2].status === 'fulfilled' ? results[2].value.data : null;
    state.catalog = results[3].status === 'fulfilled' ? normalizeCatalog(results[3].value.data) : [];
    state.providers = results[4].status === 'fulfilled' ? results[4].value.data : null;
    results.forEach((result, index) => { if (result.status === 'rejected') state.partial.push(partialIssue(calls[index][0], result.reason)); });
    state.loading = false; render();
}

async function runAction(task, success) {
    if (state.busy) return;
    state.busy = true; state.notice = ''; state.actionError = ''; render();
    try { await task(); state.notice = success; showToast(success, 'success'); }
    catch (error) { state.actionError = error?.message || error?.code || 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และหลักฐาน'; throw error; }
    finally { state.busy = false; render(); }
}

function acceptShe() {
    const expected = `I ACCEPT SHE_OWNER ${state.campaign.CampaignCode || ''}`;
    openSafetyVoteTypedConfirmationDialog({ title: 'Approve by SHE', description: 'บันทึก acceptance นี้ในฐานะหลักฐาน governance ของแคมเปญ กรุณาระบุ reference ที่ตรวจสอบได้และกรอกข้อความยืนยันให้ตรงทุกตัว', expectedConfirmation: expected, referenceLabel: 'Evidence reference', referenceRequired: true, onConfirm: payload => runAction(async () => {
        const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/acceptance-evidence`, { acceptanceArea: 'she_owner', decision: 'Accepted', evidenceReference: payload.evidenceReference, confirmation: payload.confirmation });
        state.receipts.push({ type: 'acceptance', at: new Date().toISOString(), title: 'บันทึก SHE acceptance แล้ว', actor: 'บัญชีที่ยืนยัน', reference: payload.evidenceReference, hash: response.data?.evidenceSha256 || '' });
        await loadData();
    }, 'บันทึก SHE acceptance แล้ว') });
}

async function previewHandoff() {
    const adapter = state.container.querySelector('[data-svg-adapter]')?.value;
    if (!adapter) return;
    await runAction(async () => { const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/integrations/handoffs/preview`, { targetAdapter: adapter }); state.preview = normalizePreview(response.data); }, 'สร้าง handoff preview แล้ว — ยังไม่มีการส่งออกภายนอก');
}

function confirmHandoff() {
    if (!state.preview) return;
    openSafetyVoteTypedConfirmationDialog({ title: 'ยืนยัน fixture-only handoff', description: 'คำสั่งนี้บันทึก receipt ใน local fixture เท่านั้น Server ต้องตอบ externalDelivery=false และจะ fail closed เมื่อไม่มี fixture adapter', expectedConfirmation: state.preview.confirmation, confirmLabel: 'ยืนยัน handoff ตาม preview', onConfirm: payload => runAction(async () => {
        const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/integrations/handoffs/confirm`, { targetAdapter: state.preview.payload.targetAdapter, previewHash: state.preview.previewHash, confirmation: payload.confirmation });
        if (response.data?.externalDelivery !== false) throw new Error('หยุดการยืนยัน: server ไม่ได้ยืนยัน externalDelivery=false');
        state.receipts.push({ type: 'handoff', at: new Date().toISOString(), title: 'บันทึก fixture handoff receipt', actor: 'บัญชีที่ยืนยัน', reference: response.data?.providerReceipt || '', hash: state.preview.previewHash });
        state.preview = null; await loadData();
    }, 'บันทึก fixture-only handoff แล้ว — ไม่มี external delivery') });
}

function bind() {
    state.container?.querySelectorAll('[data-svg-copy]').forEach(button => button.addEventListener('click', async () => { const value = button.dataset.svgCopy; if (value) { await navigator.clipboard?.writeText(value); showToast('คัดลอก SHA-256 แล้ว', 'success'); } }));
    state.container?.querySelectorAll('[data-svg-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.svgAction;
        if (action === 'back') state.onClose?.();
        else if (action === 'retry' || action === 'refresh') loadData();
        else if (action === 'accept-she') acceptShe();
        else if (action === 'preview-handoff') previewHandoff().catch(() => {});
        else if (action === 'confirm-handoff') confirmHandoff();
    }));
}

export async function renderSafetyVoteGovernanceWorkspace(container, { campaign = null, onClose = null } = {}) {
    if (!isSafetyVoteUxV1Enabled() || !container || !campaign?.id) return false;
    Object.assign(state, { container, campaign, onClose, loading: true, denied: false, moduleDisabled: false, error: null, partial: [], verification: null, acceptance: null, preflight: null, observability: null, catalog: [], providers: null, preview: null, receipts: [], busy: false, notice: '', actionError: '' });
    await loadData();
    return true;
}
