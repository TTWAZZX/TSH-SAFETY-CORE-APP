import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { isSafetyVoteUxV1Enabled, safetyVoteJourneyNav, safetyVoteRoleNav, safetyVoteStatusBadge, openSafetyVoteConfirmDialog, openSafetyVoteReasonDialog, openSafetyVoteHashReasonDialog } from './safety-vote-ux-components.js?v=20261009-safety-vote-ux8-r1';
import { snapshotList, selectedSnapshot, resultReadiness, verificationChecks, publicPreview, isSecretCampaign } from './safety-vote-results-model.mjs?v=20261008-safety-vote-ux6-r1';

const state = { container: null, campaign: null, onClose: null, onNavigate: null, snapshots: [], stages: [], verification: null, published: null, selectedId: null, loading: true, denied: false, moduleDisabled: false, error: null, partial: [], busy: false, notice: '', actionError: '', receipt: null };

function dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statePage() {
    const nav = safetyVoteRoleNav({ active: 'admin', showAdmin: true });
    if (state.moduleDisabled) return `<div class="svr-shell">${nav}<section class="svp-state svp-state--warning" role="status"><p class="sv-eyebrow">ปิดการใช้งานอยู่</p><h1>Safety Vote ยังไม่เปิดให้ใช้งาน</h1><p>ระบบปิดแบบ fail-closed และไม่ได้อ่าน Result Snapshot หรือข้อมูลการรับรอง</p><button class="sv-button sv-button--secondary" data-svr-action="back">กลับศูนย์จัดการ</button></section></div>`;
    if (state.denied) return `<div class="svr-shell">${nav}<section class="svp-state svp-state--denied" role="alert"><p class="sv-eyebrow">ไม่อนุญาตให้เข้าถึง</p><h1>คุณไม่มีสิทธิ์ตรวจสอบผล</h1><p>ต้องมีสิทธิ์ดูผล Safety Vote ก่อน ระบบจึงจะแสดง metadata ของ snapshot ได้ คำขอนี้ไม่เปิดเผยจำนวน ผล หรือ hash</p><button class="sv-button sv-button--secondary" data-svr-action="back">กลับศูนย์จัดการ</button></section></div>`;
    return `<div class="svr-shell">${nav}<section class="svp-state svp-state--error" role="alert"><p class="sv-eyebrow">โหลดข้อมูลไม่สำเร็จ</p><h1>ยังเปิดพื้นที่ตรวจสอบผลไม่ได้</h1><p>ไม่มีการส่งคำสั่งคำนวณ รับรอง หรือเผยแพร่จากความล้มเหลวนี้</p><div class="svo-state-actions"><button class="sv-button sv-button--primary" data-svr-action="retry">ลองอีกครั้ง</button><button class="sv-button sv-button--secondary" data-svr-action="back">กลับศูนย์จัดการ</button></div></section></div>`;
}

function snapshotCards(rows, selected) {
    if (!rows.length) return `<div class="svr-empty"><strong>ยังไม่มี Result Snapshot</strong><p>เริ่ม calculation handoff ได้เมื่อมี stage และสิทธิ์ตาม contract เดิม หน้านี้ไม่คำนวณผลในเบราว์เซอร์</p></div>`;
    return `<div class="svr-snapshot-list" role="list" aria-label="Result Snapshot ทั้งหมด">${rows.map(row => `<button type="button" role="listitem" class="svr-snapshot ${row.id === selected?.id ? 'is-selected' : ''}" data-svr-snapshot="${row.id}" aria-pressed="${row.id === selected?.id}"><span>Snapshot ${row.snapshotNo}</span><strong>${escHtml(row.status)}</strong><small>${escHtml(row.runType)} · ${dateTime(row.calculatedAt)}</small><code>${escHtml(row.resultHash || 'ยังไม่มี Result SHA-256')}</code></button>`).join('')}</div>`;
}

function verificationPanel(secret) {
    if (!state.verification) return `<div class="svr-partial" role="status"><strong>หลักฐาน governance บางส่วนไม่พร้อม</strong><p>บัญชีนี้อาจไม่มีสิทธิ์ Audit หรือยังไม่มีหลักฐานที่เซิร์ฟเวอร์ตรวจได้ สถานะนี้ไม่ถือว่าผ่าน</p></div>`;
    const checks = verificationChecks(state.verification);
    return `<div class="svr-verification"><div class="svr-verification__summary"><strong>${state.verification.privacySafe ? 'ผ่านการแยกข้อมูลตาม privacy contract' : 'ยังไม่ผ่าน privacy contract'}</strong><span>ผู้รับรองที่ active ${Number(state.verification.activeCertifiers || 0)}${secret ? ' / ต้องการ 2 คน' : ''}</span></div><ul>${checks.map(check => `<li class="${check.pass ? 'is-pass' : 'is-block'}"><span>${escHtml(check.key.replaceAll('_', ' '))}</span><strong>${check.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</strong></li>`).join('')}</ul></div>`;
}

function readinessPanel(snapshot, secret) {
    const readiness = resultReadiness(snapshot, { secret, verification: state.verification });
    if (!snapshot) return `<div class="svr-empty"><strong>ยังตรวจความพร้อมไม่ได้</strong><p>เลือกหรือสร้าง snapshot ผ่าน workflow เดิมก่อน</p></div>`;
    return `<div class="svr-readiness ${readiness.ready ? 'is-ready' : 'is-blocked'}" role="status"><strong>${readiness.ready ? 'Snapshot ผ่านเงื่อนไข metadata สำหรับขั้นถัดไป' : 'Snapshot ยังมีเงื่อนไขที่ต้องแก้'}</strong>${readiness.blocks.length ? `<ul>${readiness.blocks.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>` : '<p>เซิร์ฟเวอร์ยังคงตรวจสิทธิ์ assignment, exact hash และสถานะอีกครั้งทุกคำสั่ง</p>'}</div><dl class="svr-metadata"><div><dt>สถานะ</dt><dd>${escHtml(snapshot.status)}</dd></div><div><dt>Calculation contract</dt><dd>${escHtml(snapshot.calculationContract || 'ไม่ระบุ')}</dd></div><div><dt>Reconciliation</dt><dd>${escHtml(snapshot.reconciliation)}</dd></div><div><dt>Quorum</dt><dd>${escHtml(snapshot.quorum)}</dd></div><div><dt>Tie</dt><dd>${escHtml(snapshot.tie)}</dd></div><div><dt>Result rows</dt><dd>${snapshot.resultRows.toLocaleString('th-TH')} แถว (ไม่แสดงรายละเอียดก่อนเผยแพร่)</dd></div></dl><div class="svr-exact-hash"><span>Exact Result SHA-256</span><code>${escHtml(snapshot.resultHash || 'ยังไม่มี hash')}</code><button type="button" class="sv-button sv-button--secondary" data-svr-action="copy-hash" ${snapshot.resultHash ? '' : 'disabled'}>คัดลอก hash</button></div>`;
}

function publicationPanel(snapshot) {
    const preview = publicPreview({ campaign: state.campaign, snapshot, published: state.published });
    if (!preview.visible) return `<div class="svr-publication is-hidden" role="note"><strong>ยังไม่เปิดเผยผล</strong><p>${escHtml(preview.message)}</p><small>Result visibility: ${escHtml(preview.visibility)}</small></div>`;
    return `<div class="svr-publication is-visible"><strong>ตัวอย่างผลที่เผยแพร่แล้ว</strong><p>${escHtml(preview.message)}</p><div class="svr-public-rows">${preview.rows.map(row => `<article><span>${escHtml(row.positionCode || 'ผลรวม')}</span><strong>อันดับ ${row.rank || '—'}</strong><small>${row.count.toLocaleString('th-TH')} คะแนน/บัตร · ${escHtml(row.state)}</small></article>`).join('')}</div></div>`;
}

function certifierAssignment(secret) {
    if (!secret || String(state.campaign?.Status) !== 'Draft') return '';
    return `<section class="svr-panel" aria-labelledby="svr-assignment-title"><div class="svr-panel__heading"><div><p class="sv-eyebrow">Dual control setup</p><h2 id="svr-assignment-title">มอบหมายผู้รับรองอิสระ</h2></div></div><p class="svr-help">ใช้ได้เฉพาะ Secret Election สถานะ Draft และอ้างอิง Employee Master เดิม การมอบหมายไม่ใช่การรับรองผล</p><div class="svr-assignment-form"><label><span>รหัสพนักงาน</span><input type="text" maxlength="20" data-svr-employee autocomplete="off"></label><label><span>บทบาทควบคุม</span><select data-svr-control-role><option value="primary">Primary</option><option value="secondary">Secondary</option></select></label><button type="button" class="sv-button sv-button--primary" data-svr-action="assign-certifier">ตรวจและยืนยันการมอบหมาย</button></div></section>`;
}

function actions(snapshot, secret) {
    const hasStages = state.stages.length > 0;
    return `<footer class="svr-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svr-action="back">กลับศูนย์จัดการ</button><div><button type="button" class="sv-button sv-button--secondary" data-svr-action="refresh" ${state.busy ? 'disabled' : ''}>รีเฟรช</button><button type="button" class="sv-button sv-button--secondary" data-svr-action="calculate" ${state.busy || (!secret && !hasStages) ? 'disabled' : ''}>${secret ? 'สร้าง Recount Snapshot' : 'สร้าง Calculation Snapshot'}</button><button type="button" class="sv-button sv-button--secondary" data-svr-action="freeze" ${state.busy || !snapshot?.canFreeze ? 'disabled' : ''}>ตรึง Snapshot</button><button type="button" class="sv-button sv-button--primary" data-svr-action="certify" ${state.busy || !snapshot?.canCertify || snapshot?.status === 'Certified' ? 'disabled' : ''}>รับรองด้วย exact hash</button><button type="button" class="sv-button sv-button--danger" data-svr-action="publish" ${state.busy || !snapshot?.canPublish ? 'disabled' : ''}>เผยแพร่ผล</button></div></footer>`;
}

function render() {
    if (!state.container) return;
    if (state.loading) { state.container.innerHTML = `<div class="svr-shell" aria-busy="true" aria-live="polite"><span class="sr-only">กำลังโหลดพื้นที่ตรวจสอบและรับรองผล</span><div class="svp-skeleton svp-skeleton--hero"></div><div class="svp-skeleton svp-skeleton--card"></div></div>`; return; }
    if (state.error || state.denied || state.moduleDisabled) { state.container.innerHTML = statePage(); bind(); return; }
    const rows = snapshotList(state.snapshots), snapshot = selectedSnapshot(rows, state.selectedId), secret = isSecretCampaign(state.campaign);
    state.selectedId = snapshot?.id || null;
    const partial = state.partial.length ? `<section class="svr-partial-list" aria-labelledby="svr-partial-title"><h2 id="svr-partial-title">ข้อมูลบางส่วนไม่พร้อม</h2>${state.partial.map(item => `<article role="status"><strong>${escHtml(item.label)}</strong><span>${escHtml(item.message)}</span></article>`).join('')}</section>` : '';
    state.container.innerHTML = `<div class="svr-shell" data-sv-results="2026-10-08-safety-vote-ux6-r1">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<header class="svr-hero"><button type="button" class="sv-icon-button" data-svr-action="back" aria-label="กลับศูนย์จัดการ Safety Vote">←</button><div><p class="sv-eyebrow">ตรวจสอบและรับรองผล Safety Vote</p><h1>${escHtml(state.campaign.TitleTh || state.campaign.CampaignCode || 'Safety Vote')}</h1><p>${secret ? 'Secret Election · dual control' : 'ผลมาตรฐาน'} · ตรวจ snapshot และ exact hash ก่อนดำเนินการที่ย้อนกลับไม่ได้</p></div>${safetyVoteStatusBadge(state.campaign.Status)}</header>${partial}${state.actionError ? `<div class="svr-message is-error" role="alert">${escHtml(state.actionError)}</div>` : ''}${state.notice ? `<div class="svr-message is-success" role="status">${escHtml(state.notice)}</div>` : ''}${state.receipt ? `<div class="svr-receipt" role="status"><strong>${escHtml(state.receipt.title)}</strong><span>Snapshot ${Number(state.receipt.snapshotId || 0)} · ${escHtml(state.receipt.status || '')}</span><code>${escHtml(state.receipt.resultHash || '')}</code></div>` : ''}<main class="svr-grid"><section class="svr-panel svr-panel--snapshots" aria-labelledby="svr-snapshots-title"><div class="svr-panel__heading"><div><p class="sv-eyebrow">Immutable result versions</p><h2 id="svr-snapshots-title">เปรียบเทียบ Snapshot</h2></div><span>${rows.length.toLocaleString('th-TH')} รุ่น</span></div>${snapshotCards(rows, snapshot)}</section><section class="svr-panel" aria-labelledby="svr-readiness-title"><div class="svr-panel__heading"><div><p class="sv-eyebrow">Readiness</p><h2 id="svr-readiness-title">ความพร้อมและ exact hash</h2></div></div>${readinessPanel(snapshot, secret)}</section><section class="svr-panel" aria-labelledby="svr-governance-title"><div class="svr-panel__heading"><div><p class="sv-eyebrow">SHE governance</p><h2 id="svr-governance-title">หลักฐานการควบคุมและความเป็นส่วนตัว</h2></div></div>${verificationPanel(secret)}</section><section class="svr-panel" aria-labelledby="svr-public-title"><div class="svr-panel__heading"><div><p class="sv-eyebrow">Visibility preview</p><h2 id="svr-public-title">ตัวอย่างหลังเผยแพร่</h2></div></div>${publicationPanel(snapshot)}</section></main>${certifierAssignment(secret)}${actions(snapshot, secret)}</div>`;
    state.container.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'admin', current: 'results', campaign: state.campaign, onPage: typeof state.onNavigate !== 'function' }));
    bind();
}

function partialIssue(label, error) {
    const code = error?.code || (error?.status ? `HTTP_${error.status}` : 'UNAVAILABLE');
    return { label, message: `${code} — ไม่ถือว่าผ่าน readiness และส่วนอื่นยังทำงานตามสิทธิ์ที่มี` };
}

async function loadData() {
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.partial = []; render();
    const id = Number(state.campaign.id);
    try {
        const snapshots = await API.get(`/safety-vote/admin/campaigns/${id}/results/snapshots`, { suppressErrorLog: true });
        state.snapshots = snapshots.data?.rows || [];
    } catch (error) {
        state.denied = error?.code === 'PERMISSION_DENIED' || Number(error?.status) === 403;
        state.moduleDisabled = error?.code === 'SAFETY_VOTE_MODULE_DISABLED';
        state.error = state.denied || state.moduleDisabled ? null : error;
        state.loading = false; render(); return;
    }
    const [stages, verification] = await Promise.allSettled([
        API.get(`/safety-vote/admin/campaigns/${id}/stages`, { suppressErrorLog: true }),
        API.get(`/safety-vote/admin/campaigns/${id}/release-verification`, { suppressErrorLog: true })
    ]);
    state.stages = stages.status === 'fulfilled' ? stages.value.data?.rows || [] : [];
    state.verification = verification.status === 'fulfilled' ? verification.value.data : null;
    if (stages.status === 'rejected') state.partial.push(partialIssue('บริบท Stage', stages.reason));
    if (verification.status === 'rejected') state.partial.push(partialIssue('หลักฐาน SHE governance', verification.reason));
    const current = selectedSnapshot(state.snapshots, state.selectedId);
    state.published = null;
    if (isSecretCampaign(state.campaign) && current?.published) {
        try { state.published = (await API.get(`/safety-vote/campaigns/${id}/results`, { suppressErrorLog: true })).data; }
        catch (error) { state.partial.push(partialIssue('ตัวอย่างผลที่เผยแพร่', error)); }
    }
    state.loading = false; render();
}

async function runAction(task, success) {
    if (state.busy) return;
    state.busy = true; state.notice = ''; state.actionError = ''; render();
    try { await task(); state.notice = success; showToast(success, 'success'); }
    catch (error) { state.actionError = error?.message || error?.code || 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบสิทธิ์ สถานะ และ exact hash'; throw error; }
    finally { state.busy = false; render(); }
}

async function calculate(reason = '') {
    const secret = isSecretCampaign(state.campaign), id = Number(state.campaign.id);
    await runAction(async () => {
        if (secret) await API.post(`/safety-vote/admin/campaigns/${id}/results/recount`, { reason });
        else await API.post(`/safety-vote/admin/campaigns/${id}/results/calculate`, { stageId: Number(state.stages[0]?.id) });
        state.selectedId = null;
        await loadData();
    }, secret ? 'สร้าง Recount Snapshot ผ่าน contract เดิมแล้ว' : 'สร้าง Calculation Snapshot ผ่าน contract เดิมแล้ว');
}

async function freeze(snapshot) {
    await runAction(async () => { await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/results/${snapshot.id}/freeze`, {}); await loadData(); }, 'ตรึง Result Snapshot แล้ว');
}

async function certify(snapshot, payload) {
    const secret = isSecretCampaign(state.campaign), id = Number(state.campaign.id);
    await runAction(async () => {
        const suffix = secret ? 'certify-secret' : 'certify';
        const response = await API.post(`/safety-vote/admin/campaigns/${id}/results/${snapshot.id}/${suffix}`, payload);
        state.receipt = { title: secret && response.data?.status === 'AwaitingSecondCertifier' ? 'บันทึกการรับรองคนที่หนึ่งแล้ว — รอผู้รับรองอิสระคนที่สอง' : 'บันทึกการรับรองแล้ว', snapshotId: snapshot.id, status: response.data?.status, resultHash: response.data?.resultHash || snapshot.resultHash };
        await loadData();
    }, 'บันทึกการรับรองตาม exact result hash แล้ว');
}

async function publish(snapshot) {
    await runAction(async () => {
        const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/results/${snapshot.id}/publish`, {});
        state.receipt = { title: 'เผยแพร่ผลแล้ว', snapshotId: snapshot.id, status: response.data?.status, resultHash: response.data?.resultHash || snapshot.resultHash };
        state.campaign.Status = 'Published';
        await loadData();
    }, 'เผยแพร่ผลที่ผ่านการรับรองแล้ว');
}

function confirmAction(action) {
    const snapshot = selectedSnapshot(state.snapshots, state.selectedId), secret = isSecretCampaign(state.campaign);
    if (action === 'calculate') {
        if (secret) return openSafetyVoteReasonDialog({ title: 'สร้าง Recount Snapshot ใหม่', description: 'ระบบจะใช้ calculation contract เดิมกับบัตรที่รับแล้วโดยไม่แก้ ballot และจะสร้าง snapshot ใหม่ที่อ้างอิงรุ่นก่อน กรุณาระบุเหตุผล', confirmLabel: 'ยืนยันสร้าง Recount', onConfirm: calculate });
        return openSafetyVoteConfirmDialog({ title: 'สร้าง Calculation Snapshot', description: 'ระบบจะส่ง stage ที่มีอยู่ไปยัง calculation API เดิม ผลลัพธ์จะถูกบันทึกเป็น snapshot ใหม่และไม่แก้ ballot หรือคะแนนกรรมการ', confirmLabel: 'ยืนยันคำนวณ', onConfirm: calculate });
    }
    if (action === 'freeze' && snapshot) return openSafetyVoteConfirmDialog({ title: 'ตรึง Result Snapshot', description: `Snapshot ${snapshot.snapshotNo} จะเปลี่ยนจาก Calculated เป็น Frozen และใช้ hash นี้ในขั้นรับรอง`, confirmLabel: 'ยืนยันตรึง Snapshot', onConfirm: () => freeze(snapshot) });
    if (action === 'certify' && snapshot) return openSafetyVoteHashReasonDialog({ title: secret ? 'รับรองผลแบบ Dual Control' : 'รับรอง Result Snapshot', description: 'การรับรองเป็นการตัดสินใจที่ตรวจสอบย้อนหลังได้ กรุณาตรวจและกรอก exact Result SHA-256 ทุกตัวพร้อมเหตุผล ระบบจะตรวจสิทธิ์และ assignment ซ้ำ', expectedHash: snapshot.resultHash, onConfirm: payload => certify(snapshot, payload) });
    if (action === 'publish' && snapshot) return openSafetyVoteConfirmDialog({ title: 'เผยแพร่ผลที่รับรองแล้ว', description: secret ? 'คำสั่งนี้เปิดเผยเฉพาะผลจาก snapshot ที่ผู้รับรองอิสระสองคนรับรอง exact hash เดียวกัน เซิร์ฟเวอร์จะปฏิเสธหาก dual control ไม่ครบ' : 'คำสั่งนี้จะเปลี่ยน snapshot ที่รับรองแล้วเป็น Published ตาม result visibility เดิม', confirmLabel: 'ยืนยันเผยแพร่ผล', tone: 'danger', onConfirm: () => publish(snapshot) });
}

async function assignCertifier() {
    const employeeId = state.container.querySelector('[data-svr-employee]')?.value.trim(), controlRole = state.container.querySelector('[data-svr-control-role]')?.value;
    if (!employeeId) { state.actionError = 'กรุณาระบุรหัสพนักงานจาก Employee Master'; render(); return; }
    openSafetyVoteConfirmDialog({ title: 'มอบหมายผู้รับรองอิสระ', description: `ยืนยันมอบหมาย ${employeeId} เป็น ${controlRole} สำหรับ Secret Election นี้ การดำเนินการนี้ยังไม่รับรองผล`, confirmLabel: 'ยืนยันการมอบหมาย', onConfirm: () => runAction(async () => { const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/certifiers`, { employeeId, controlRole }); state.receipt = { title: 'มอบหมายผู้รับรองแล้ว', snapshotId: 0, status: response.data?.controlRole, resultHash: '' }; await loadData(); }, 'มอบหมายผู้รับรองอิสระแล้ว') });
}

function bind() {
    state.container?.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => state.onNavigate?.(button.dataset.svJourneyStep)));
    state.container?.querySelectorAll('[data-svr-snapshot]').forEach(button => button.addEventListener('click', () => { state.selectedId = Number(button.dataset.svrSnapshot); render(); }));
    state.container?.querySelectorAll('[data-svr-action]').forEach(button => button.addEventListener('click', async () => {
        const action = button.dataset.svrAction;
        if (action === 'back') state.onClose?.();
        else if (action === 'retry' || action === 'refresh') loadData();
        else if (action === 'copy-hash') { const snapshot = selectedSnapshot(state.snapshots, state.selectedId); if (snapshot?.resultHash) { await navigator.clipboard?.writeText(snapshot.resultHash); showToast('คัดลอก Result SHA-256 แล้ว', 'success'); } }
        else if (action === 'assign-certifier') assignCertifier();
        else confirmAction(action);
    }));
}

export async function renderSafetyVoteResultsWorkspace(container, { campaign = null, onClose = null, onNavigate = null } = {}) {
    if (!isSafetyVoteUxV1Enabled() || !container || !campaign?.id) return false;
    Object.assign(state, { container, campaign, onClose, onNavigate, snapshots: [], stages: [], verification: null, published: null, selectedId: null, loading: true, denied: false, moduleDisabled: false, error: null, partial: [], busy: false, notice: '', actionError: '', receipt: null });
    await loadData();
    return true;
}
