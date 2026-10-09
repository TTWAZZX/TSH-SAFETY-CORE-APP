import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';
import { renderSafetyVoteFoundation as renderLegacySafetyVoteFoundation } from './admin-safety-vote.js?v=20261008-safety-vote-phase4-r1';
import {
    isSafetyVoteUxV1Enabled,
    openSafetyVoteConfirmDialog,
    safetyVoteActionBar,
    safetyVoteEmptyState,
    safetyVoteJourneyNav,
    safetyVoteRoleNav,
    safetyVoteStatusBadge
} from './safety-vote-ux-components.js?v=20261009-safety-vote-ux8-r1';
import { campaignMetrics, isNearClose, sectionsForCampaign, statusGroup } from './safety-vote-ux-model.mjs?v=20261008-safety-vote-ux1-r1';
import { renderSafetyVoteCampaignWizard } from './safety-vote-campaign-wizard.js?v=20261008-safety-vote-ux2-r1';
import { renderSafetyVoteOperationsWorkspace } from './admin-safety-vote-operations.js?v=20261009-safety-vote-ux8-r1';
import { renderSafetyVoteResultsWorkspace } from './admin-safety-vote-results.js?v=20261009-safety-vote-ux8-r1';
import { renderSafetyVoteGovernanceWorkspace } from './admin-safety-vote-governance.js?v=20261009-safety-vote-ux8-r1';

const VIEW_LABELS = {
    active: 'กำลังดำเนินการ',
    draft: 'ฉบับร่าง',
    scheduled: 'รอเปิด',
    completed: 'เสร็จสิ้น',
    archived: 'เก็บถาวร'
};

const TYPE_LABELS = {
    popular_vote: 'โหวตยอดนิยม', secret_election: 'เลือกตั้งลับ', survey: 'แบบสำรวจ', poll: 'แบบสำรวจสั้น',
    feedback: 'รับความคิดเห็น', nomination: 'เสนอชื่อ', award: 'รางวัล', submission_challenge: 'ส่งผลงาน',
    jury_scoring: 'กรรมการให้คะแนน', hybrid_scoring: 'โหวตร่วมกับกรรมการ', ranking: 'จัดลำดับ',
    prioritization: 'จัดลำดับความสำคัญ', allocation: 'จัดสรรคะแนน', resolution: 'ลงมติ', petition: 'ข้อเสนอ',
    event_choice: 'เลือกกิจกรรม', risk_perception: 'สำรวจการรับรู้ความเสี่ยง', knowledge_check: 'แบบทดสอบ', multi_stage: 'หลายขั้นตอน'
};
const PRIVACY_LABELS = { identified: 'ระบุตัวตน', confidential: 'ข้อมูลลับ', anonymous: 'ไม่ระบุตัวตน', secret_ballot: 'บัตรลงคะแนนลับ' };
const RESULT_LABELS = { live: 'แสดงระหว่างกิจกรรม', admin_only: 'ผู้ดูแลเท่านั้น', hidden_until_close: 'แสดงหลังปิดกิจกรรม', certified_only: 'แสดงหลังรับรองผล', published: 'เผยแพร่แล้ว' };

const state = {
    health: null,
    campaigns: [],
    selectedId: null,
    query: '',
    view: 'active',
    sort: 'updated_desc',
    drawerOpen: false,
    loading: true,
    error: null,
    denied: false,
    container: null
};

function visibleCampaigns() {
    const query = state.query.trim().toLocaleLowerCase('th');
    const rows = state.campaigns.filter(row => statusGroup(row.Status) === state.view).filter(row => {
        if (!query) return true;
        return [row.TitleTh, row.TitleEn, row.CampaignCode, row.CampaignType, row.OwnerEmployeeID]
            .some(value => String(value || '').toLocaleLowerCase('th').includes(query));
    });
    return rows.sort((a, b) => {
        if (state.sort === 'title_asc') return String(a.TitleTh || '').localeCompare(String(b.TitleTh || ''), 'th');
        if (state.sort === 'status_asc') return String(a.Status || '').localeCompare(String(b.Status || ''), 'en');
        return new Date(b.UpdatedAt || b.CreatedAt || 0) - new Date(a.UpdatedAt || a.CreatedAt || 0);
    });
}

function formattedDate(value) {
    if (!value) return 'ยังไม่กำหนด';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'ยังไม่กำหนด';
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function selectedCampaign() {
    return state.campaigns.find(row => Number(row.id) === Number(state.selectedId)) || null;
}

function loadingMarkup() {
    return `<div class="sv-ux-shell" aria-busy="true" aria-live="polite"><span class="sr-only">กำลังโหลดรายการแคมเปญ</span><div class="sv-skeleton sv-skeleton--hero"></div><div class="sv-kpi-grid">${Array.from({ length: 4 }, () => '<div class="sv-skeleton sv-skeleton--kpi"></div>').join('')}</div><div class="sv-skeleton sv-skeleton--content"></div></div>`;
}

function systemStateMarkup() {
    if (state.denied) return `<div class="sv-ux-shell">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<section class="sv-state-panel sv-state-panel--denied" role="alert"><p class="sv-eyebrow">ไม่อนุญาตให้เข้าถึง</p><h1>คุณไม่มีสิทธิ์จัดการ Safety Vote</h1><p>บัญชีนี้ยังไม่มีสิทธิ์ดูหรือจัดการแคมเปญ กรุณาติดต่อผู้ดูแลระบบหากจำเป็นต้องใช้งาน</p><a class="sv-button sv-button--secondary" href="#dashboard">กลับหน้าหลัก</a></section></div>`;
    if (state.error) return `<div class="sv-ux-shell">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<section class="sv-state-panel sv-state-panel--error" role="alert"><p class="sv-eyebrow">โหลดข้อมูลไม่สำเร็จ</p><h1>ยังแสดงรายการแคมเปญไม่ได้</h1><p>การแก้ไขก่อนหน้ายังไม่ถูกส่งซ้ำ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p><button class="sv-button sv-button--primary" type="button" data-sv-action="retry">ลองอีกครั้ง</button></section></div>`;
    if (!state.health?.ready) return `<div class="sv-ux-shell">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<section class="sv-state-panel sv-state-panel--warning" role="status"><p class="sv-eyebrow">ยังไม่พร้อมใช้งาน</p><h1>Safety Vote ยังไม่พร้อมสำหรับการจัดการ</h1><p>ส่วนประกอบระบบยังไม่ครบ ระบบจึงปิดการทำงานไว้เพื่อป้องกันข้อมูลไม่สมบูรณ์</p><details><summary>ข้อมูลสำหรับผู้ดูแลระบบ</summary><p>Contract: ${escHtml(state.health?.contractVersion || 'ไม่พบ')} · Schema: ${escHtml(state.health?.schemaVersion || 'ไม่พบ')}</p></details></section></div>`;
    if (!state.health.moduleEnabled) return `<div class="sv-ux-shell">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<section class="sv-state-panel sv-state-panel--warning" role="status"><p class="sv-eyebrow">ปิดการใช้งานอยู่</p><h1>Safety Vote ยังไม่เปิดให้ใช้งาน</h1><p>ระบบยังคงปิดแบบ fail-closed และไม่ได้เรียกข้อมูลแคมเปญ คุณสามารถตรวจสอบความพร้อมแล้วเปิดใช้งานผ่านกระบวนการควบคุมที่ได้รับอนุมัติ</p><details><summary>ข้อมูลสำหรับผู้ดูแลระบบ</summary><p>สถานะโมดูล: ปิด · ไม่มีการเปลี่ยนแปลงข้อมูล</p></details></section></div>`;
    return '';
}

function campaignCard(row) {
    const selected = Number(row.id) === Number(state.selectedId);
    return `<button type="button" class="sv-campaign-card" data-sv-select="${Number(row.id)}" aria-pressed="${selected}"><span class="sv-campaign-card__top">${safetyVoteStatusBadge(row.Status)}<span class="sv-campaign-code">${escHtml(row.CampaignCode)}</span></span><strong>${escHtml(row.TitleTh || 'ไม่มีชื่อแคมเปญ')}</strong><span>${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || 'ไม่ระบุประเภท')}</span><small>ปรับปรุง ${formattedDate(row.UpdatedAt)}</small></button>`;
}

function campaignTable(rows) {
    return `<div class="sv-campaign-table-wrap"><table class="sv-campaign-table"><caption class="sr-only">รายการแคมเปญ Safety Vote</caption><thead><tr><th scope="col">แคมเปญ</th><th scope="col">ประเภท</th><th scope="col">สถานะ</th><th scope="col">ปรับปรุงล่าสุด</th><th scope="col"><span class="sr-only">เปิดรายละเอียด</span></th></tr></thead><tbody>${rows.map(row => `<tr class="${Number(row.id) === Number(state.selectedId) ? 'is-selected' : ''}"><td><strong>${escHtml(row.TitleTh || 'ไม่มีชื่อแคมเปญ')}</strong><small>${escHtml(row.CampaignCode)}</small></td><td>${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || 'ไม่ระบุ')}</td><td>${safetyVoteStatusBadge(row.Status)}</td><td>${formattedDate(row.UpdatedAt)}</td><td><button type="button" class="sv-icon-button" data-sv-select="${Number(row.id)}" aria-label="เปิดรายละเอียด ${escHtml(row.TitleTh || row.CampaignCode)}">ดู</button></td></tr>`).join('')}</tbody></table></div>`;
}

function campaignListMarkup(rows, context = 'main') {
    if (!rows.length) return safetyVoteEmptyState({ title: state.query ? 'ไม่พบแคมเปญที่ค้นหา' : `ยังไม่มีรายการ${VIEW_LABELS[state.view]}`, description: state.query ? 'ลองเปลี่ยนคำค้นหา ตัวกรอง หรือสถานะที่เลือก' : 'เมื่อมีแคมเปญในสถานะนี้ รายการจะแสดงที่นี่', actionLabel: state.query ? 'ล้างคำค้นหา' : '', action: 'clear-search' });
    return `<div class="sv-campaign-list sv-campaign-list--${context}">${campaignTable(rows)}<div class="sv-campaign-cards">${rows.map(campaignCard).join('')}</div></div>`;
}

function detailMarkup(row) {
    if (!row) return `<section class="sv-master-detail__detail sv-detail-placeholder" aria-label="รายละเอียดแคมเปญ"><span aria-hidden="true">←</span><h2>เลือกแคมเปญเพื่อดูรายละเอียด</h2><p>รายละเอียดและเมนูที่เกี่ยวข้องกับประเภทแคมเปญจะแสดงในพื้นที่นี้</p></section>`;
    const sections = sectionsForCampaign(row);
    const draftWarning = String(row.Status).toLowerCase() === 'draft' ? `<div class="sv-readiness-warning" role="status"><strong>ควรตรวจความพร้อมก่อนเปิดแคมเปญ</strong><span>ตรวจเนื้อหา ผู้มีสิทธิ์ กำหนดการ และการแสดงผลให้ครบในพื้นที่จัดการ</span></div>` : '';
    return `<section class="sv-master-detail__detail" aria-labelledby="sv-detail-title"><div class="sv-detail-header"><div><p class="sv-eyebrow">${escHtml(row.CampaignCode)}</p><h2 id="sv-detail-title">${escHtml(row.TitleTh || 'ไม่มีชื่อแคมเปญ')}</h2><p>${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || 'ไม่ระบุประเภท')} · ${escHtml(PRIVACY_LABELS[row.PrivacyMode] || 'ไม่ระบุรูปแบบความเป็นส่วนตัว')}</p></div>${safetyVoteStatusBadge(row.Status)}</div>${draftWarning}<nav class="sv-workspace-nav" aria-label="ส่วนงานสำหรับแคมเปญประเภท ${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || '')}">${sections.map(([key, label], index) => `<button type="button" data-sv-section="${key}" ${index === 0 ? 'aria-current="page"' : ''}>${escHtml(label)}</button>`).join('')}</nav><dl class="sv-detail-summary"><div><dt>ผู้รับผิดชอบ</dt><dd>${escHtml(row.OwnerEmployeeID || 'ยังไม่ระบุ')}</dd></div><div><dt>เปิดกิจกรรม</dt><dd>${formattedDate(row.ScheduledOpenAt || row.OpenAt)}</dd></div><div><dt>ปิดกิจกรรม</dt><dd>${formattedDate(row.ScheduledCloseAt || row.CloseAt)}</dd></div><div><dt>การแสดงผล</dt><dd>${escHtml(RESULT_LABELS[row.ResultVisibility] || 'ตามการตั้งค่าแคมเปญ')}</dd></div></dl>${safetyVoteActionBar([{ label: 'ศูนย์ปฏิบัติการ', action: 'open-operations' }, { label: 'ผลและการรับรอง', action: 'open-results' }, { label: 'ธรรมาภิบาล', action: 'open-governance', primary: true }, { label: 'พื้นที่จัดการ', action: 'open-workspace' }, { label: 'ยกเลิกการเลือก', action: 'clear-selection' }])}</section>`;
}

function render() {
    const container = state.container;
    if (!container) return;
    if (state.loading) { container.innerHTML = loadingMarkup(); return; }
    const systemState = systemStateMarkup();
    if (systemState) { container.innerHTML = systemState; bind(); return; }
    const rows = visibleCampaigns(), kpi = campaignMetrics(state.campaigns), selected = selectedCampaign();
    container.innerHTML = `<div class="sv-ux-shell" data-sv-ux-version="2026-10-08-safety-vote-ux1-r1">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}<header class="sv-admin-hero"><div><p class="sv-eyebrow">ศูนย์จัดการกิจกรรม</p><h1>จัดการ Safety Vote</h1><p>ติดตามแคมเปญ จัดลำดับงาน และเข้าสู่พื้นที่จัดการตามประเภทกิจกรรม</p></div><button type="button" class="sv-button sv-button--primary" data-sv-action="new-campaign">สร้างแคมเปญ</button></header><section class="sv-kpi-grid" aria-label="ภาพรวมแคมเปญ"><button data-sv-view="draft"><span>ฉบับร่าง</span><strong>${kpi.draft}</strong></button><button data-sv-view="active"><span>กำลังเปิด</span><strong>${kpi.open}</strong></button><button data-sv-view="active"><span>ใกล้ปิดใน 72 ชม.</span><strong>${kpi.nearClose}</strong></button><button data-sv-view="completed"><span>ปิดแล้ว</span><strong>${kpi.closed}</strong></button></section><section class="sv-list-panel" aria-labelledby="sv-campaign-list-title"><div class="sv-list-panel__heading"><div><p class="sv-eyebrow">รายการแคมเปญ</p><h2 id="sv-campaign-list-title">${VIEW_LABELS[state.view]}</h2></div><button class="sv-button sv-button--secondary sv-tablet-drawer-trigger" type="button" data-sv-action="open-drawer" aria-expanded="${state.drawerOpen}">เลือกแคมเปญ</button></div><div class="sv-toolbar"><label class="sv-search"><span class="sr-only">ค้นหาแคมเปญ</span><input type="search" value="${escHtml(state.query)}" placeholder="ค้นหาชื่อ รหัส หรือผู้รับผิดชอบ" data-sv-search></label><div class="sv-view-tabs" role="tablist" aria-label="สถานะแคมเปญ">${Object.entries(VIEW_LABELS).map(([key, label]) => `<button type="button" role="tab" data-sv-view="${key}" aria-selected="${state.view === key}">${escHtml(label)}</button>`).join('')}</div><label class="sv-sort"><span>เรียงตาม</span><select data-sv-sort><option value="updated_desc" ${state.sort === 'updated_desc' ? 'selected' : ''}>อัปเดตล่าสุด</option><option value="title_asc" ${state.sort === 'title_asc' ? 'selected' : ''}>ชื่อ ก–ฮ</option><option value="status_asc" ${state.sort === 'status_asc' ? 'selected' : ''}>สถานะ</option></select></label></div><div class="sv-master-detail"><div class="sv-master-detail__list">${campaignListMarkup(rows)}</div>${detailMarkup(selected)}</div></section><div class="sv-tablet-drawer ${state.drawerOpen ? 'is-open' : ''}" aria-hidden="${!state.drawerOpen}"><button type="button" class="sv-tablet-drawer__backdrop" data-sv-action="close-drawer" tabindex="-1" aria-label="ปิดรายการแคมเปญ"></button><aside role="dialog" aria-modal="true" aria-labelledby="sv-drawer-title"><div class="sv-tablet-drawer__header"><h2 id="sv-drawer-title">เลือกแคมเปญ</h2><button type="button" class="sv-icon-button" data-sv-action="close-drawer" aria-label="ปิด">×</button></div>${campaignListMarkup(rows, 'drawer')}</aside></div><p class="sr-only" aria-live="polite">แสดง ${rows.length} แคมเปญ</p></div>`;
    container.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'admin', current: 'center', campaign: selected || {} }));
    bind();
}

function bind() {
    const container = state.container;
    container?.querySelectorAll('[data-sv-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.svView; state.selectedId = null; render(); }));
    container?.querySelector('[data-sv-search]')?.addEventListener('input', event => { state.query = event.target.value; render(); requestAnimationFrame(() => { const input = state.container?.querySelector('[data-sv-search]'); input?.focus(); input?.setSelectionRange(state.query.length, state.query.length); }); });
    container?.querySelector('[data-sv-sort]')?.addEventListener('change', event => { state.sort = event.target.value; render(); });
    container?.querySelectorAll('[data-sv-select]').forEach(button => button.addEventListener('click', () => { state.selectedId = Number(button.dataset.svSelect); state.drawerOpen = false; render(); state.container?.querySelector('#sv-detail-title')?.focus?.(); }));
    container?.querySelectorAll('[data-sv-action]').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.svAction)));
    container?.querySelectorAll('[data-sv-section]').forEach(button => button.addEventListener('click', () => { container.querySelectorAll('[data-sv-section]').forEach(item => item.removeAttribute('aria-current')); button.setAttribute('aria-current', 'page'); }));
    container?.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => handleJourneyStep(button.dataset.svJourneyStep)));
    container?.addEventListener('keydown', event => { if (event.key === 'Escape' && state.drawerOpen) { state.drawerOpen = false; render(); container.querySelector('[data-sv-action="open-drawer"]')?.focus(); } }, { once: true });
}

function handleJourneyStep(step) {
    if (step === 'readiness') { openCampaignWizard(); return; }
    if (step === 'operations') { openOperationsWorkspace(); return; }
    if (step === 'results') { openResultsWorkspace(); return; }
    if (step === 'governance') { openGovernanceWorkspace(); return; }
    if (step === 'participation' || step === 'jury') {
        const row = selectedCampaign();
        if (row) openLegacyWorkspace(row.id);
    }
}

async function openLegacyWorkspace(campaignId = null) {
    const container = state.container;
    container.innerHTML = `<div class="sv-ux-shell"><button type="button" class="sv-button sv-button--secondary" data-sv-back-center>← กลับศูนย์จัดการ</button><div data-sv-legacy-workspace aria-live="polite"></div></div>`;
    container.querySelector('[data-sv-back-center]').addEventListener('click', () => render());
    const workspace = container.querySelector('[data-sv-legacy-workspace]');
    await renderLegacySafetyVoteFoundation(workspace);
    if (campaignId) workspace.querySelector(`button[onclick="window._svSelect(${Number(campaignId)})"]`)?.click();
}

function openCampaignWizard() {
    const container = state.container;
    renderSafetyVoteCampaignWizard(container, {
        onClose: () => load(),
        onComplete: () => load(),
        onOpenAdvanced: campaignId => openLegacyWorkspace(campaignId),
        onNavigate: handleJourneyStep
    });
}

function openOperationsWorkspace() {
    const row = selectedCampaign();
    if (!row) return;
    renderSafetyVoteOperationsWorkspace(state.container, { campaign: row, onClose: () => render(), onNavigate: handleJourneyStep });
}

function openResultsWorkspace() {
    const row = selectedCampaign();
    if (!row) return;
    renderSafetyVoteResultsWorkspace(state.container, { campaign: row, onClose: () => render(), onNavigate: handleJourneyStep });
}

function openGovernanceWorkspace() {
    const row = selectedCampaign();
    if (!row) return;
    renderSafetyVoteGovernanceWorkspace(state.container, { campaign: row, onClose: () => render(), onNavigate: handleJourneyStep });
}

function handleAction(action) {
    if (action === 'retry') { load(); return; }
    if (action === 'clear-search') { state.query = ''; render(); return; }
    if (action === 'clear-selection') { state.selectedId = null; render(); return; }
    if (action === 'open-drawer') { state.drawerOpen = true; render(); requestAnimationFrame(() => state.container?.querySelector('.sv-tablet-drawer aside button')?.focus()); return; }
    if (action === 'close-drawer') { state.drawerOpen = false; render(); return; }
    if (action === 'new-campaign') { openCampaignWizard(); return; }
    if (action === 'open-operations') { openOperationsWorkspace(); return; }
    if (action === 'open-results') { openResultsWorkspace(); return; }
    if (action === 'open-governance') { openGovernanceWorkspace(); return; }
    if (action === 'open-workspace') {
        const row = selectedCampaign();
        if (!row) return;
        openSafetyVoteConfirmDialog({ title: 'เปิดพื้นที่จัดการแคมเปญ', description: `ระบบจะเปิดเครื่องมือจัดการของ “${row.TitleTh || row.CampaignCode}” โดยยังคงกติกาและสิทธิ์เดิมทั้งหมด`, confirmLabel: 'เปิดพื้นที่จัดการ', onConfirm: () => openLegacyWorkspace(row.id) });
    }
}

async function enrichOpenCampaigns(rows) {
    const openRows = rows.filter(row => String(row.Status).toLowerCase() === 'open' && !row.ScheduledCloseAt && !row.CloseAt).slice(0, 25);
    await Promise.all(openRows.map(async row => {
        try {
            const response = await API.get(`/safety-vote/admin/campaigns/${Number(row.id)}`, { suppressErrorLog: true });
            Object.assign(row, response.data?.campaign || {});
        } catch (_) {}
    }));
}

async function load() {
    state.loading = true; state.error = null; state.denied = false; render();
    try {
        const health = await API.get('/safety-vote/admin/health', { suppressErrorLog: true });
        state.health = health.data;
        if (!state.health?.ready || !state.health?.moduleEnabled) { state.campaigns = []; return; }
        const campaigns = await API.get('/safety-vote/admin/campaigns', { suppressErrorLog: true });
        state.campaigns = campaigns.data?.rows || [];
        await enrichOpenCampaigns(state.campaigns);
        if (state.selectedId && !state.campaigns.some(row => Number(row.id) === Number(state.selectedId))) state.selectedId = null;
    } catch (error) {
        state.denied = Number(error?.status) === 403 || error?.code === 'PERMISSION_DENIED';
        state.error = state.denied ? null : error;
        if (error?.code === 'SAFETY_VOTE_MODULE_DISABLED') state.health = { ...(error.details || {}), ready: true, moduleEnabled: false };
    } finally {
        state.loading = false;
        render();
    }
}

export async function renderSafetyVoteFoundation(container) {
    if (!isSafetyVoteUxV1Enabled()) return renderLegacySafetyVoteFoundation(container);
    state.container = container;
    await load();
}

export const safetyVoteUxPhase1TestHooks = { statusGroup, isNearClose, campaignMetrics, sectionsForCampaign };
