import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { safetyVoteJourneyNav, safetyVoteRoleNav, safetyVoteStatusBadge } from './safety-vote-ux-components.js?v=20261010-safety-vote-ux9a-r1';
import { formatThaiDateTime } from './safety-vote-time.mjs?v=20261015-safety-vote-thai-time-r1';

const MODES = {
    closed_after_open: ['ไม่รับผู้มีสิทธิ์ใหม่หลังเปิด', 'ใช้รายชื่อที่ตรึงไว้เท่านั้น เหมาะกับงานที่ต้องการฐานผู้มีสิทธิ์คงที่'],
    admin_approval: ['ให้แอดมินตรวจสอบและอนุมัติ', 'แอดมิน Preview รายชื่อใหม่ ตรวจรายละเอียด แล้วจึงยืนยันเพิ่มแบบมี Audit'],
    automatic_rule_match: ['เพิ่มอัตโนมัติเมื่อเข้าเงื่อนไข', 'เมื่อผู้ใช้เปิดรายการหรือรายละเอียดแคมเปญ ระบบตรวจตามกฎและเพิ่มสิทธิ์ให้ทันที พร้อมสร้าง Snapshot และ Audit แบบ Add-only'],
};

const state = { container: null, campaign: null, onClose: null, onNavigate: null, overview: null, preview: null, loading: true, busy: false, error: null, notice: '' };
const statusAllowsAmendment = status => ['Scheduled', 'Open'].includes(String(status));
const dateTime = value => value ? formatThaiDateTime(value) : '—';
const hash = value => value ? `${String(value).slice(0, 12)}…` : '—';
const requestKey = () => globalThis.crypto?.randomUUID?.() || `eligibility-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function statePanel() {
    if (state.loading) return '<section class="sve-state" aria-busy="true"><span class="sv-loader" aria-hidden="true"></span><h1>กำลังโหลดข้อมูลผู้มีสิทธิ์</h1><p>ระบบกำลังตรวจสถานะ Snapshot และประวัติการเพิ่มรายชื่อ</p></section>';
    if (state.error) return `<section class="sve-state" role="alert"><h1>ยังโหลดข้อมูลผู้มีสิทธิ์ไม่ได้</h1><p>${escHtml(state.error.message || 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่')}</p><button type="button" class="sv-button sv-button--primary" data-sve-action="retry">ลองอีกครั้ง</button></section>`;
    return '';
}

function modeCards(data) {
    const selected = data.policy.enrollmentMode;
    return `<fieldset class="sve-mode-fieldset" ${data.policy.configurable ? '' : 'disabled'}><legend>นโยบายรับผู้มีสิทธิ์ใหม่</legend><div class="sve-mode-grid">${Object.entries(MODES).map(([key, copy]) => `<label class="sve-mode-card ${selected === key ? 'is-selected' : ''}"><input type="radio" name="sve-mode" value="${key}" ${selected === key ? 'checked' : ''}><strong>${copy[0]}</strong><span>${copy[1]}</span></label>`).join('')}</div></fieldset>`;
}

function policyEditor(data) {
    if (!data.featureEnabled) return '<div class="sve-banner is-warning" role="status"><strong>ส่วนเพิ่มผู้มีสิทธิ์ใหม่ยังปิดอยู่</strong><span>แสดงข้อมูลแบบอ่านอย่างเดียวจนกว่าจะเปิด feature ผ่านกระบวนการควบคุม</span></div>';
    if (!data.policy.configurable) return '<div class="sve-banner" role="note"><strong>นโยบายถูกล็อกตามสถานะแคมเปญ</strong><span>หลังปิดกิจกรรม ระบบอนุญาตให้ตรวจสอบ Snapshot และประวัติเท่านั้น</span></div>';
    const live = data.campaign.status !== 'Draft';
    return `<form class="sve-policy-form" data-sve-policy-form><label><span>เหตุผลการตั้งค่า</span><textarea name="reason" minlength="10" maxlength="500" rows="3" required placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร"></textarea></label>${live ? `<label><span>ข้อความยืนยันเมื่อเปลี่ยนนโยบาย</span><input name="confirmation" autocomplete="off" placeholder="SET ${escHtml(data.campaign.campaignCode)} ${escHtml(data.policy.enrollmentMode)}"><small>ระบบจะตรวจข้อความตามโหมดที่เลือกใหม่ เพื่อป้องกันการเปลี่ยนนโยบายของแคมเปญที่เผยแพร่แล้วโดยไม่ตั้งใจ</small></label>` : ''}<button type="submit" class="sv-button sv-button--secondary" ${state.busy ? 'disabled' : ''}>บันทึกนโยบาย</button></form>`;
}

function snapshotMarkup(snapshot) {
    if (!snapshot) return '<div class="sve-empty"><strong>ยังไม่มี Frozen Snapshot</strong><span>กลับไปตรวจและตรึงรายชื่อในขั้นผู้มีสิทธิ์ของ Wizard ก่อน</span></div>';
    return `<div class="sve-snapshot"><div><strong>Snapshot #${Number(snapshot.snapshotNo)}</strong><span>${snapshot.snapshotKind === 'amendment' ? 'เกิดจากการเพิ่มผู้มีสิทธิ์' : 'รายชื่อเริ่มต้น'}</span></div><dl><div><dt>ผู้มีสิทธิ์</dt><dd>${Number(snapshot.eligibleCount).toLocaleString('th-TH')}</dd></div><div><dt>บัญชีพร้อม</dt><dd>${Number(snapshot.accountReadyCount).toLocaleString('th-TH')}</dd></div><div><dt>ข้อมูลที่ควรติดตาม</dt><dd>${Number(snapshot.warningCount).toLocaleString('th-TH')}</dd></div><div><dt>ตรึงเมื่อ</dt><dd>${dateTime(snapshot.frozenAt)}</dd></div></dl><small>Rows SHA-256: <code>${escHtml(hash(snapshot.rowsHash))}</code></small></div>`;
}

function previewMarkup(data) {
    if (!statusAllowsAmendment(data.campaign.status)) return '<div class="sve-banner"><strong>สถานะนี้ไม่เปิดรับการแก้รายชื่อ</strong><span>Preview/Apply ใช้ได้เฉพาะ Scheduled หรือ Open ส่วน Draft ให้แก้กฎและ Freeze ผ่าน Wizard</span></div>';
    if (!data.policy.previewAllowed) return `<div class="sve-banner"><strong>ไม่ได้เปิดรับผู้มีสิทธิ์ใหม่</strong><span>เปลี่ยนนโยบายเป็น “ให้แอดมินตรวจสอบและอนุมัติ” หรือ “เพิ่มอัตโนมัติเมื่อเข้าเงื่อนไข” ก่อน Preview</span></div>`;
    const preview = state.preview, automatic = data.policy.enrollmentMode === 'automatic_rule_match';
    const guidance = automatic
        ? 'ระบบเพิ่มผู้ใช้ที่เข้าเงื่อนไขอัตโนมัติเมื่อเข้าหน้ารายการ/รายละเอียด หรือก่อนส่งคะแนน ส่วนปุ่มนี้ใช้ซิงก์ผู้เข้าเงื่อนไขทั้งหมดทันทีโดยแอดมิน'
        : 'Preview ไม่แก้ไขรายชื่อและไม่ลบผู้มีสิทธิ์เดิม';
    return `<div class="sve-preview-actions"><button type="button" class="sv-button sv-button--primary" data-sve-action="preview" ${state.busy ? 'disabled' : ''}>${automatic ? 'ตรวจสอบเพื่อซิงก์ทั้งหมด' : 'ตรวจสอบผู้มีสิทธิ์ใหม่'}</button><span>${guidance}</span></div>${preview ? `<section class="sve-preview" aria-live="polite"><div class="sve-preview-kpis"><div><strong>${Number(preview.candidateCount).toLocaleString('th-TH')}</strong><span>เข้าเงื่อนไขใหม่</span></div><div><strong>${Number(preview.accountReadyCount).toLocaleString('th-TH')}</strong><span>บัญชีพร้อม</span></div><div><strong>${Number(preview.warningCount).toLocaleString('th-TH')}</strong><span>ข้อมูลที่ควรติดตาม</span></div><div><strong>${Number(preview.ignoredRemovalCount).toLocaleString('th-TH')}</strong><span>การนำออกที่ระบบเพิกเฉย</span></div></div>${preview.rows?.length ? `<div class="sve-table-wrap"><table><thead><tr><th>พนักงาน</th><th>หน่วยงาน</th><th>ตำแหน่ง</th><th>บัญชี</th></tr></thead><tbody>${preview.rows.map(row => `<tr><td><strong>${escHtml(row.employeeId)}</strong><span>${escHtml(row.employeeName || '—')}</span></td><td>${escHtml(row.departmentName || '—')}<span>${escHtml(row.safetyUnitName || '')}</span></td><td>${escHtml(row.positionName || '—')}</td><td><span class="sve-account ${row.accountReady ? 'is-ready' : ''}">${row.accountReady ? 'พร้อม' : 'ยังไม่พร้อม'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="sve-empty"><strong>ไม่พบผู้มีสิทธิ์ใหม่</strong><span>รายชื่อปัจจุบันครอบคลุมผู้ที่เข้าเงื่อนไขทั้งหมดแล้ว</span></div>'}${preview.candidateCount ? `<form class="sve-apply-form" data-sve-apply-form><label><span>เหตุผลการเพิ่มรายชื่อ</span><textarea name="reason" minlength="10" maxlength="500" rows="3" required></textarea></label><label><span>พิมพ์ APPLY ${escHtml(data.campaign.campaignCode)}</span><input name="confirmation" autocomplete="off" required></label><button type="submit" class="sv-button sv-button--primary" ${state.busy ? 'disabled' : ''}>${automatic ? 'ซิงก์เพิ่ม' : 'ยืนยันเพิ่ม'} ${Number(preview.candidateCount).toLocaleString('th-TH')} คน</button></form>` : ''}</section>` : ''}`;
}

function historyMarkup(rows) {
    if (!rows.length) return '<div class="sve-empty"><strong>ยังไม่มีประวัติการเพิ่มผู้มีสิทธิ์</strong><span>เมื่อ Apply สำเร็จ รายการและ Snapshot lineage จะแสดงที่นี่</span></div>';
    return `<div class="sve-history">${rows.map(row => `<article><div><span class="sve-history-id">#${Number(row.id)}</span><strong>เพิ่ม ${Number(row.addedCount).toLocaleString('th-TH')} คน</strong><small>${dateTime(row.appliedAt || row.requestedAt)} · ${escHtml(row.appliedBy || row.requestedBy || 'ไม่ระบุ')}</small></div><p>${escHtml(row.reason || 'ไม่ระบุเหตุผล')}</p><dl><div><dt>ต้นทาง</dt><dd>Snapshot #${Number(row.sourceSnapshotId)}</dd></div><div><dt>ผลลัพธ์</dt><dd>Snapshot #${Number(row.resultSnapshotId || 0)}</dd></div><div><dt>สถานะ</dt><dd>${escHtml(row.status)}</dd></div><div><dt>After hash</dt><dd><code>${escHtml(hash(row.afterRowsHash))}</code></dd></div></dl></article>`).join('')}</div>`;
}

function render() {
    const host = state.container; if (!host) return;
    const panel = statePanel();
    if (panel) { host.innerHTML = `<div class="sve-shell">${panel}</div>`; bind(); return; }
    const data = state.overview, campaign = data.campaign;
    host.innerHTML = `<div class="sve-shell" data-sv-eligibility-admin="2026-10-20-r1">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<header class="sve-hero"><button type="button" class="sv-icon-button" data-sve-action="back" aria-label="กลับศูนย์จัดการ">←</button><div><p class="sv-eyebrow">จัดการผู้มีสิทธิ์ตามสถานะ</p><h1>${escHtml(state.campaign.TitleTh || state.campaign.titleTh || campaign.campaignCode)}</h1><p>${escHtml(campaign.campaignCode)} · Version ${Number(campaign.versionNo)} · เพิ่มรายชื่อแบบ Add-only เท่านั้น</p></div>${safetyVoteStatusBadge(campaign.status)}</header>${safetyVoteJourneyNav({ role: 'admin', current: 'readiness', campaign: state.campaign, onPage: true })}${state.notice ? `<div class="sve-banner is-success" role="status"><strong>${escHtml(state.notice)}</strong></div>` : ''}<main class="sve-layout"><section class="sve-panel"><div class="sve-heading"><div><p class="sv-eyebrow">Policy</p><h2>นโยบายผู้มีสิทธิ์ใหม่</h2></div><span>${data.featureEnabled ? 'พร้อมใช้งาน' : 'Feature ปิดอยู่'}</span></div>${modeCards(data)}${policyEditor(data)}</section><section class="sve-panel"><div class="sve-heading"><div><p class="sv-eyebrow">Current population</p><h2>Snapshot ปัจจุบัน</h2></div></div>${snapshotMarkup(data.currentSnapshot)}</section><section class="sve-panel sve-panel--full"><div class="sve-heading"><div><p class="sv-eyebrow">Preview & Apply</p><h2>ตรวจสอบผู้เข้าเงื่อนไขใหม่</h2></div></div>${previewMarkup(data)}</section><section class="sve-panel sve-panel--full"><div class="sve-heading"><div><p class="sv-eyebrow">Audit history</p><h2>ประวัติ Eligibility Amendment</h2></div><span>${data.amendments.length.toLocaleString('th-TH')} รายการ</span></div>${historyMarkup(data.amendments)}</section></main><footer class="sve-action-bar"><button type="button" class="sv-button sv-button--secondary" data-sve-action="back">กลับศูนย์จัดการ</button><button type="button" class="sv-button sv-button--secondary" data-sve-action="refresh" ${state.busy ? 'disabled' : ''}>รีเฟรช</button></footer></div>`;
    bind();
}

async function load() {
    state.loading = true; state.error = null; render();
    try { const response = await API.get(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/eligibility/amendments`, { suppressErrorLog: true }); state.overview = response.data; }
    catch (error) { state.error = error; }
    finally { state.loading = false; render(); }
}

async function savePolicy(form) {
    const selected = form.closest('.sve-panel').querySelector('input[name="sve-mode"]:checked')?.value;
    const values = new FormData(form), reason = String(values.get('reason') || '').trim();
    if (!selected || reason.length < 10) { showToast('กรุณาเลือกนโยบายและระบุเหตุผลอย่างน้อย 10 ตัวอักษร', 'warning'); return; }
    const live = state.overview.campaign.status !== 'Draft';
    const confirmation = live ? `SET ${state.overview.campaign.campaignCode} ${selected}` : '';
    if (live && String(values.get('confirmation') || '').trim() !== confirmation) { showToast(`กรุณาพิมพ์ ${confirmation} ให้ตรงทุกตัวอักษร`, 'warning'); return; }
    state.busy = true; render();
    try { await API.put(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/eligibility/enrollment-mode`, { enrollmentMode: selected, reason, confirmation }); state.preview = null; state.notice = 'บันทึกนโยบายและ Audit แล้ว'; showToast(state.notice, 'success'); await load(); }
    catch (error) { state.busy = false; showToast(error?.message || 'บันทึกนโยบายไม่สำเร็จ', 'error'); render(); }
}

async function runPreview() {
    state.busy = true; state.notice = ''; render();
    try { const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/eligibility/amendments/preview`, {}); state.preview = response.data; }
    catch (error) { showToast(error?.message || 'ตรวจสอบผู้มีสิทธิ์ใหม่ไม่สำเร็จ', 'error'); }
    finally { state.busy = false; render(); }
}

async function applyPreview(form) {
    const values = new FormData(form), reason = String(values.get('reason') || '').trim(), confirmation = String(values.get('confirmation') || '').trim();
    if (reason.length < 10 || confirmation !== `APPLY ${state.overview.campaign.campaignCode}`) { showToast('กรุณาระบุเหตุผลและพิมพ์ข้อความยืนยันให้ถูกต้อง', 'warning'); return; }
    state.busy = true; render();
    try {
        const response = await API.post(`/safety-vote/admin/campaigns/${Number(state.campaign.id)}/eligibility/amendments/apply`, { reason, confirmation, previewHash: state.preview.previewHash }, { headers: { 'Idempotency-Key': requestKey() } });
        state.preview = null; state.notice = `เพิ่มผู้มีสิทธิ์แล้ว ${Number(response.data.addedCount).toLocaleString('th-TH')} คน`;
        showToast(state.notice, 'success'); await load();
    } catch (error) { state.busy = false; if (error?.code === 'ELIGIBILITY_PREVIEW_STALE') state.preview = null; showToast(error?.message || 'เพิ่มผู้มีสิทธิ์ไม่สำเร็จ', 'error'); render(); }
}

function bind() {
    const host = state.container;
    host?.querySelectorAll('[data-sve-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.sveAction;
        if (action === 'back') state.onClose?.(); else if (action === 'retry' || action === 'refresh') load(); else if (action === 'preview') runPreview();
    }));
    host?.querySelector('[data-sve-policy-form]')?.addEventListener('submit', event => { event.preventDefault(); savePolicy(event.currentTarget); });
    host?.querySelector('[data-sve-apply-form]')?.addEventListener('submit', event => { event.preventDefault(); applyPreview(event.currentTarget); });
    host?.querySelectorAll('input[name="sve-mode"]').forEach(input => input.addEventListener('change', () => { host.querySelectorAll('.sve-mode-card').forEach(card => card.classList.toggle('is-selected', card.contains(input))); const confirmation = host.querySelector('[name="confirmation"]'); if (confirmation) confirmation.placeholder = `SET ${state.overview.campaign.campaignCode} ${input.value}`; }));
    host?.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => state.onNavigate?.(button.dataset.svJourneyStep)));
}

export async function renderSafetyVoteEligibilityWorkspace(container, { campaign, onClose = () => {}, onNavigate = null } = {}) {
    Object.assign(state, { container, campaign, onClose, onNavigate, overview: null, preview: null, loading: true, busy: false, error: null, notice: '' });
    await load();
}
