import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { renderSafetyVoteFoundation as renderLegacySafetyVoteFoundation } from './admin-safety-vote.js?v=20261008-safety-vote-phase4-r1';
import {
    isSafetyVoteUxV1Enabled,
    isSafetyVoteEngagementV1Enabled,
    openSafetyVoteConfirmDialog,
    openSafetyVoteReasonDialog,
    safetyVoteEmptyState,
    safetyVoteRoleNav,
    safetyVoteStatusBadge
} from './safety-vote-ux-components.js?v=20261010-safety-vote-ux9a-r1';
import { campaignMetrics, isNearClose, sectionsForCampaign, statusGroup } from './safety-vote-ux-model.mjs?v=20261008-safety-vote-ux1-r1';
import { CORE_TEMPLATES } from './safety-vote-wizard-model.mjs?v=20261009-safety-vote-phase103-r1';
import { renderSafetyVoteCampaignWizard } from './safety-vote-campaign-wizard.js?v=20261011-safety-vote-admin-guided-drafts-r1';
import { renderSafetyVoteOperationsWorkspace } from './admin-safety-vote-operations.js?v=20261009-safety-vote-ux8-r1';
import { renderSafetyVoteResultsWorkspace } from './admin-safety-vote-results.js?v=20261009-safety-vote-ux8-r1';
import { renderSafetyVoteGovernanceWorkspace } from './admin-safety-vote-governance.js?v=20261009-safety-vote-ux8-r1';
import { renderSafetyVotePlanningWorkspace } from './admin-safety-vote-planning.js?v=20261010-safety-vote-ux9c-r1';
import { renderSafetyVoteReviewWorkspace } from './admin-safety-vote-review.js?v=20261010-safety-vote-admin-review-r1';

const VIEW_LABELS = {
    active: 'กำลังดำเนินการ',
    draft: 'ฉบับร่าง',
    scheduled: 'รอเปิด',
    completed: 'เสร็จสิ้น',
    archived: 'เก็บถาวร',
    voided: 'ยกเลิกแล้ว'
};

const ADMIN_WORKSPACES = [
    ['overview', 'ภาพรวม'],
    ['campaigns', 'แคมเปญ'],
    ['promotions', 'ป้ายประชาสัมพันธ์'],
    ['planning', 'วางแผนและสื่อสาร'],
    ['review', 'ตรวจทานและกำกับ']
];

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
    container: null,
    engagement: null,
    promotions: [],
    engagementUnavailable: false,
    promotionEditorId: null,
    promotionPreviewUrls: new Map(),
    promotionAssetUrls: new Map(),
    promotionAssets: [],
    promotionAssetsLoading: false,
    promotionAssetSelection: new Map(),
    templates: [],
    planningUnavailable: false,
    campaignLauncherOpen: false,
    selectedDraftIds: new Set(),
    workspace: 'overview'
};

function localInputDate(value, fallbackHours = 0) {
    const date = value ? new Date(value) : new Date(Date.now() + fallbackHours * 3600000);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function relativeUpdated(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'ยังไม่มีข้อมูลเวลา';
    const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (minutes < 1) return 'เมื่อสักครู่';
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} ชั่วโมงที่แล้ว`;
    return formattedDate(value);
}

function draftReadiness(row) {
    const task = (state.engagement?.tasks || []).find(item => item.key === 'draft-readiness' && Number(item.campaignId) === Number(row.id));
    const checks = [Boolean(row.TitleTh), Boolean(row.CampaignType && row.PrivacyMode), !task, Boolean(row.ScheduledOpenAt && row.ScheduledCloseAt)];
    const passed = checks.filter(Boolean).length;
    return { passed, total: checks.length, percent: Math.round(passed / checks.length * 100) };
}

function adminWorkspaceNav() {
    return `<nav class="sv-admin-workspaces" aria-label="พื้นที่จัดการ Safety Vote">${ADMIN_WORKSPACES.map(([key, label]) => `<button type="button" data-sv-workspace="${key}" ${state.workspace === key ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`;
}

function actionCenterMarkup() {
    if (!isSafetyVoteEngagementV1Enabled()) return '';
    if (state.engagementUnavailable) return `<section class="sv-engagement-state" role="status"><strong>เครื่องมือประชาสัมพันธ์ยังปิดอยู่</strong><span>Campaign Center ยังใช้งานได้ตามปกติ และไม่มีการอ่านข้อมูล Engagement เพิ่มเติม</span></section>`;
    const data = state.engagement || { tasks: [], summary: {} }, tasks = data.tasks || [], summary = data.summary || {};
    return `<section class="sv-engagement" aria-labelledby="sv-engagement-title">
        <div class="sv-engagement__heading"><div><p class="sv-eyebrow">งานที่ต้องดำเนินการ</p><h2 id="sv-engagement-title">งานของฉันวันนี้</h2><p>รวมรายการสำคัญโดยไม่แสดงคำตอบ ตัวเลือกลงคะแนน หรือข้อมูลผู้ใช้รายบุคคล</p></div><button type="button" class="sv-button sv-button--secondary" data-sv-workspace="promotions">จัดการป้ายประชาสัมพันธ์</button></div>
        <div class="sv-engagement-summary" aria-label="ภาพรวมงาน"><div><strong>${Number(summary.total || 0)}</strong><span>งานที่ต้องตรวจ</span></div><div><strong>${Number(summary.high || 0)}</strong><span>เร่งด่วน</span></div><div><strong>${Number(summary.livePromotions || 0)}</strong><span>ป้ายกำลังแสดง</span></div><div><strong>${Number(summary.promotionDrafts || 0)}</strong><span>ป้ายฉบับร่าง</span></div></div>
        ${tasks.length ? `<div class="sv-task-list">${tasks.slice(0, 8).map(task => `<button type="button" data-sv-task-campaign="${Number(task.campaignId)}" data-sv-task-action="${escHtml(task.action)}"><span class="sv-task-tone sv-task-tone--${task.severity === 'high' ? 'high' : 'medium'}">${task.severity === 'high' ? 'เร่งด่วน' : 'ติดตาม'}</span><strong>${escHtml(task.title || task.campaignCode)}</strong><small>${escHtml(task.message)}</small><span>เปิดรายการ →</span></button>`).join('')}</div>` : `<p class="sv-engagement-empty">ยังไม่มีงานเร่งด่วนในขณะนี้</p>`}
    </section>`;
}

function promotionPreviewMarkup(slot, label, ratio, recommended) {
    const url = state.promotionPreviewUrls.get(slot);
    return `<article class="sv-promotion-preview sv-promotion-preview--${slot}"><div>${url ? `<img src="${escHtml(url)}" alt="ตัวอย่างภาพ ${label}">` : '<span aria-hidden="true">ตัวอย่างภาพ</span>'}</div><strong>${label}</strong><small>${recommended} · สัดส่วน ${ratio}</small><p data-sv-image-status="${slot}" aria-live="polite">${url ? 'พร้อมอัปโหลด กรุณาตรวจสอบการครอบภาพ' : 'ยังไม่ได้เลือกภาพใหม่'}</p></article>`;
}

function promotionAssetLibraryMarkup(editing) {
    if (state.promotionAssetsLoading) return '<section class="sv-promotion-library" aria-busy="true"><h3>คลังภาพของแคมเปญ</h3><p>กำลังโหลดภาพที่ใช้ซ้ำได้…</p></section>';
    if (!state.promotionAssets.length) return '<section class="sv-promotion-library"><h3>คลังภาพของแคมเปญ</h3><p>ยังไม่มีภาพที่ใช้ซ้ำได้ คุณสามารถอัปโหลดภาพใหม่ด้านบน หรือเพิ่มภาพจากพื้นที่วางแผนและสื่อสาร</p></section>';
    return `<section class="sv-promotion-library" aria-labelledby="sv-promotion-library-title"><div><h3 id="sv-promotion-library-title">เลือกใช้ภาพเดิม</h3><p>ใช้ซ้ำได้เฉพาะภาพของแคมเปญและเวอร์ชันปัจจุบัน ระบบจะไม่คัดลอกไฟล์ข้ามแคมเปญ</p></div><div class="sv-promotion-library__grid">${state.promotionAssets.map(asset => {
        const desktopSelected = Number(state.promotionAssetSelection.get('desktop')) === Number(asset.id) || (!state.promotionAssetSelection.has('desktop') && Number(editing?.desktopFileId) === Number(asset.id));
        const mobileSelected = Number(state.promotionAssetSelection.get('mobile')) === Number(asset.id) || (!state.promotionAssetSelection.has('mobile') && Number(editing?.mobileFileId) === Number(asset.id));
        return `<article><div class="sv-promotion-library__preview">${state.promotionAssetUrls.get(Number(asset.id)) ? `<img src="${escHtml(state.promotionAssetUrls.get(Number(asset.id)))}" alt="ตัวอย่าง ${escHtml(asset.originalName)}">` : '<span aria-hidden="true">กำลังโหลดภาพ</span>'}</div><strong>${escHtml(asset.originalName)}</strong><small>${Math.ceil(Number(asset.fileSize || 0) / 1024).toLocaleString('th-TH')} KB · ${escHtml(asset.purpose || 'promotion_library')}</small><div><button type="button" class="sv-button ${desktopSelected ? 'sv-button--primary' : 'sv-button--secondary'}" data-sv-library-asset="${Number(asset.id)}" data-slot="desktop" aria-pressed="${desktopSelected}">ใช้กับ Desktop</button><button type="button" class="sv-button ${mobileSelected ? 'sv-button--primary' : 'sv-button--secondary'}" data-sv-library-asset="${Number(asset.id)}" data-slot="mobile" aria-pressed="${mobileSelected}">ใช้กับ Mobile</button></div></article>`;
    }).join('')}</div></section>`;
}

function promotionWorkspaceMarkup() {
    if (!isSafetyVoteEngagementV1Enabled()) return `<section class="sv-state-panel sv-state-panel--warning" role="status"><h1>ป้ายประชาสัมพันธ์ยังปิดอยู่</h1><p>เปิดใช้ได้เมื่อ safetyVoteEngagementV1 และ engagement_enabled ผ่าน gate ทั้งคู่</p></section>`;
    if (state.engagementUnavailable) return `<section class="sv-state-panel sv-state-panel--warning" role="status"><h1>เครื่องมือประชาสัมพันธ์ยังไม่พร้อม</h1><p>ระบบแคมเปญยังใช้งานได้ตามปกติ และยังไม่มีการอ่านหรือแก้ไขข้อมูลป้าย</p></section>`;
    const editing = state.promotions.find(item => Number(item.id) === Number(state.promotionEditorId)) || null;
    const campaignId = editing?.campaignId || state.selectedId || state.campaigns.find(row => row.Status !== 'Voided')?.id || '';
    const form = state.promotionEditorId === null ? '' : `<section class="sv-promotion-editor" aria-labelledby="sv-promotion-editor-title"><div class="sv-promotion-editor__heading"><div><p class="sv-eyebrow">${editing ? 'แก้ไขป้าย' : 'ป้ายใหม่'}</p><h2 id="sv-promotion-editor-title">${editing ? escHtml(editing.titleTh) : 'สร้างป้ายประชาสัมพันธ์'}</h2></div><button type="button" class="sv-button sv-button--secondary" data-sv-promotion-cancel>กลับรายการป้าย</button></div><div class="sv-promotion-editor__layout"><form class="sv-promotion-form" data-sv-promotion-form>
        <label><span>กิจกรรม</span><select name="campaignId" required>${state.campaigns.filter(row => row.Status !== 'Voided').map(row => `<option value="${Number(row.id)}" ${Number(row.id) === Number(campaignId) ? 'selected' : ''}>${escHtml(row.CampaignCode)} · ${escHtml(row.TitleTh || 'ไม่มีชื่อ')}</option>`).join('')}</select></label>
        <label><span>หัวข้อ</span><input name="titleTh" maxlength="160" required value="${escHtml(editing?.titleTh || '')}"></label>
        <label><span>คำอธิบายสั้น</span><textarea name="subtitleTh" maxlength="500" rows="3">${escHtml(editing?.subtitleTh || '')}</textarea></label>
        <div class="sv-promotion-form__grid"><label><span>ข้อความบนปุ่ม</span><input name="ctaLabel" maxlength="40" required value="${escHtml(editing?.ctaLabel || 'ดูรายละเอียด')}"></label><label><span>ลำดับ 0–100</span><input name="priority" type="number" min="0" max="100" value="${Number(editing?.priority || 0)}"></label><label><span>เริ่มแสดง</span><input name="startAt" type="datetime-local" required value="${localInputDate(editing?.startAt)}"></label><label><span>สิ้นสุด</span><input name="endAt" type="datetime-local" required value="${localInputDate(editing?.endAt, 168)}"></label></div>
        <label><span>คำอธิบายภาพสำหรับ Screen Reader</span><input name="altText" maxlength="240" value="${escHtml(editing?.altText || '')}" placeholder="อธิบายสาระสำคัญของภาพ ไม่ต้องขึ้นต้นว่า รูปภาพ"></label>
        <div class="sv-promotion-assets"><label><span>ภาพ Desktop</span><small>แนะนำ 1600×800 px (2:1) ขั้นต่ำ 1200×600 px</small><input name="desktop" type="file" accept="image/jpeg,image/png,image/webp" data-sv-promotion-image="desktop"></label><label><span>ภาพ Mobile</span><small>แนะนำ 1080×1350 px (4:5) ขั้นต่ำ 720×900 px</small><input name="mobile" type="file" accept="image/jpeg,image/png,image/webp" data-sv-promotion-image="mobile"></label></div>
        <p class="sv-promotion-guidance" role="note">ใช้ JPG หรือ WebP ไม่เกิน 10 MB และควรต่ำกว่า 1.5 MB เพื่อโหลดเร็ว ไม่ควรฝังข้อความหรือปุ่มลงในภาพ เพราะระบบจะแสดงหัวข้อและปุ่มให้เหมาะกับแต่ละหน้าจอ</p>
        <input type="hidden" name="rowVersion" value="${Number(editing?.rowVersion || 0)}"><div class="sv-promotion-form__actions">${editing && editing.status !== 'Archived' ? '<button type="submit" class="sv-button sv-button--secondary" name="intent" value="Archived">เก็บถาวร</button>' : ''}<button type="submit" class="sv-button sv-button--secondary" name="intent" value="Draft">บันทึกฉบับร่าง</button><button type="submit" class="sv-button sv-button--primary" name="intent" value="Published">เผยแพร่</button></div>
    </form><aside class="sv-promotion-previews" aria-label="ตัวอย่างการครอบภาพ">${promotionPreviewMarkup('desktop', 'Desktop', '2:1', '1600×800 px')}${promotionPreviewMarkup('mobile', 'Mobile', '4:5', '1080×1350 px')}<div class="sv-promotion-safezone"><strong>ตำแหน่งเนื้อหาที่ปลอดภัย</strong><span>Desktop: วางจุดสำคัญด้านขวา</span><span>Mobile: วางจุดสำคัญครึ่งบน</span></div></aside></div>${promotionAssetLibraryMarkup(editing)}</section>`;
    return `<section class="sv-promotion-workspace" aria-labelledby="sv-promotion-title"><header class="sv-workspace-hero"><div><p class="sv-eyebrow">ประชาสัมพันธ์กิจกรรม</p><h1 id="sv-promotion-title">ป้ายประชาสัมพันธ์</h1><p>จัดการภาพ ข้อความ ช่วงเวลา และดูตัวอย่างก่อนเผยแพร่ โดยไม่เปลี่ยนสิทธิ์เข้าร่วมแคมเปญ</p></div>${state.promotionEditorId === null ? '<button type="button" class="sv-button sv-button--primary" data-sv-promotion-new>สร้างป้ายกิจกรรม</button>' : ''}</header>${form}<section class="sv-promotion-library" aria-labelledby="sv-promotion-list-title"><div class="sv-list-panel__heading"><div><p class="sv-eyebrow">รายการป้าย</p><h2 id="sv-promotion-list-title">ทั้งหมด ${state.promotions.length.toLocaleString('th-TH')} รายการ</h2></div></div><div class="sv-promotion-list">${state.promotions.length ? state.promotions.map(item => `<article><div><span class="sv-status-badge sv-status-badge--${item.status === 'Published' ? 'open' : item.status === 'Archived' ? 'archived' : 'draft'}"><span class="sv-status-dot"></span>${item.status === 'Published' ? 'เผยแพร่' : item.status === 'Archived' ? 'เก็บถาวร' : 'ฉบับร่าง'}</span><strong>${escHtml(item.titleTh)}</strong><small>${escHtml(item.campaignCode)} · ${formattedDate(item.startAt)}–${formattedDate(item.endAt)}</small></div><button type="button" class="sv-button sv-button--secondary" data-sv-promotion-edit="${Number(item.id)}">${item.status === 'Archived' ? 'ดูรายละเอียด' : 'แก้ไข'}</button></article>`).join('') : safetyVoteEmptyState({ title: 'ยังไม่มีป้ายประชาสัมพันธ์', description: 'สร้างป้ายแรกเพื่อแนะนำกิจกรรมแก่ผู้มีสิทธิ์' })}</div></section></section>`;
}

function campaignLauncherMarkup() {
    if (!state.campaignLauncherOpen) return '';
    return `<div class="sv-launcher-backdrop" data-sv-launcher-close><section class="sv-campaign-launcher" role="dialog" aria-modal="true" aria-labelledby="sv-launcher-title"><header><div><p class="sv-eyebrow">สร้างแคมเปญใหม่</p><h2 id="sv-launcher-title">เริ่มจากรูปแบบที่เหมาะกับงาน</h2><p>ระบบจะสร้างรหัสใหม่เมื่อบันทึกครั้งแรก และไม่คัดลอกไฟล์ รายชื่อที่ตรึง การเข้าร่วม บัตรลงคะแนน คะแนน ผล หรือการรับรอง</p></div><button type="button" class="sv-icon-button" data-sv-launcher-close aria-label="ปิด">×</button></header><section aria-labelledby="sv-built-in-title"><h3 id="sv-built-in-title">รูปแบบมาตรฐาน</h3><div class="sv-template-chooser">${CORE_TEMPLATES.map(item => `<button type="button" data-sv-built-in-template="${escHtml(item.key)}"><strong>${escHtml(item.label)}</strong><span>${escHtml(TYPE_LABELS[item.key] || item.key)}</span><small>${item.advancedRequired ? 'มีการตั้งค่าขั้นสูงเพิ่มเติม' : 'ตั้งค่าได้ครบใน Wizard'}</small></button>`).join('')}</div></section><section aria-labelledby="sv-reusable-title"><h3 id="sv-reusable-title">แม่แบบที่ทีมบันทึกไว้</h3>${state.templates.length ? `<div class="sv-template-chooser">${state.templates.map(item => `<button type="button" data-sv-reusable-template="${Number(item.id)}"><strong>${escHtml(item.name)}</strong><span>${escHtml(TYPE_LABELS[item.campaignType] || item.campaignType)}</span><small>คัดลอกเฉพาะ configuration</small></button>`).join('')}</div>` : `<p class="sv-launcher-empty">${state.planningUnavailable ? 'คลังแม่แบบยังไม่พร้อม แต่ยังสร้างจากรูปแบบมาตรฐานได้' : 'ยังไม่มีแม่แบบที่บันทึกไว้ สามารถสร้างจากรูปแบบมาตรฐานก่อน'}</p>`}</section></section></div>`;
}

function overviewToolsMarkup() {
    if (!isSafetyVoteEngagementV1Enabled() || state.engagementUnavailable) return '';
    return `<section class="sv-admin-tool-grid" aria-label="เครื่องมือจัดการ"><button type="button" data-sv-workspace="campaigns"><span>แคมเปญ</span><strong>สร้างและจัดการกิจกรรม</strong><small>แก้ไข Draft ตรวจความพร้อม และติดตามสถานะ</small></button><button type="button" data-sv-workspace="promotions"><span>ประชาสัมพันธ์</span><strong>จัดการป้ายกิจกรรม</strong><small>เตรียมภาพ Desktop/Mobile และกำหนดเวลาแสดง</small></button><button type="button" data-sv-workspace="planning"><span>การวางแผน</span><strong>ปฏิทินและการสื่อสาร</strong><small>แม่แบบ คลังภาพ ลิงก์/QR และคิวแจ้งเตือน</small></button></section>`;
}

function visibleCampaigns() {
    const query = state.query.trim().toLocaleLowerCase('th');
    const rows = state.campaigns.filter(row => {
        const status = String(row.Status || '').toLowerCase();
        if (state.view === 'voided') return status === 'voided';
        if (state.view === 'archived') return status === 'archived';
        return statusGroup(row.Status) === state.view;
    }).filter(row => {
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
    const draft = String(row.Status).toLowerCase() === 'draft';
    const readiness = draft ? draftReadiness(row) : null;
    return `<article class="sv-campaign-card ${selected ? 'is-selected' : ''}">${draft && state.view === 'draft' ? `<label class="sv-draft-selector"><input type="checkbox" data-sv-draft-select="${Number(row.id)}" ${state.selectedDraftIds.has(Number(row.id)) ? 'checked' : ''}><span>เลือกฉบับร่างนี้</span></label>` : ''}<button type="button" class="sv-campaign-card__select" data-sv-select="${Number(row.id)}" aria-pressed="${selected}"><span class="sv-campaign-card__top">${safetyVoteStatusBadge(row.Status)}<span class="sv-campaign-code">${escHtml(row.CampaignCode)}</span></span><strong>${escHtml(row.TitleTh || 'ไม่มีชื่อแคมเปญ')}</strong><span>${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || 'ไม่ระบุประเภท')}</span>${readiness ? `<span class="sv-readiness-meter"><span><i style="width:${readiness.percent}%"></i></span><small>ความพร้อมเบื้องต้น ${readiness.passed}/${readiness.total}</small></span>` : ''}<small>แก้ไขล่าสุด ${relativeUpdated(row.UpdatedAt)} · ${escHtml(row.OwnerEmployeeID || 'ไม่ระบุผู้รับผิดชอบ')}</small></button>${draft ? `<div class="sv-campaign-card__actions"><button type="button" class="sv-button sv-button--primary" data-sv-edit-draft="${Number(row.id)}">แก้ไขต่อ</button><button type="button" class="sv-button sv-button--secondary" data-sv-duplicate-campaign="${Number(row.id)}">ทำสำเนา</button><button type="button" class="sv-button sv-button--secondary" data-sv-void-draft="${Number(row.id)}">ยกเลิกร่าง</button></div>` : ''}</article>`;
}

function campaignTable(rows) {
    const selectable = state.view === 'draft' && rows.some(row => String(row.Status).toLowerCase() === 'draft');
    const allSelected = selectable && rows.filter(row => String(row.Status).toLowerCase() === 'draft').every(row => state.selectedDraftIds.has(Number(row.id)));
    return `<div class="sv-campaign-table-wrap"><table class="sv-campaign-table"><caption class="sr-only">รายการแคมเปญ Safety Vote</caption><thead><tr>${selectable ? `<th scope="col"><label class="sv-table-check"><input type="checkbox" data-sv-draft-select-all ${allSelected ? 'checked' : ''}><span class="sr-only">เลือกฉบับร่างทั้งหมดในรายการ</span></label></th>` : ''}<th scope="col">แคมเปญ</th><th scope="col">ประเภท</th><th scope="col">ความพร้อม</th><th scope="col">ปรับปรุงล่าสุด</th><th scope="col">ดำเนินการ</th></tr></thead><tbody>${rows.map(row => { const draft = String(row.Status).toLowerCase() === 'draft', readiness = draft ? draftReadiness(row) : null; return `<tr class="${Number(row.id) === Number(state.selectedId) ? 'is-selected' : ''}">${selectable ? `<td><label class="sv-table-check"><input type="checkbox" data-sv-draft-select="${Number(row.id)}" ${state.selectedDraftIds.has(Number(row.id)) ? 'checked' : ''}><span class="sr-only">เลือก ${escHtml(row.TitleTh || row.CampaignCode)}</span></label></td>` : ''}<td><strong>${escHtml(row.TitleTh || 'ไม่มีชื่อแคมเปญ')}</strong><small>${escHtml(row.CampaignCode)}</small></td><td>${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || 'ไม่ระบุ')}</td><td>${readiness ? `<span class="sv-readiness-meter"><span><i style="width:${readiness.percent}%"></i></span><small>${readiness.passed}/${readiness.total} · ${safetyVoteStatusBadge(row.Status)}</small></span>` : safetyVoteStatusBadge(row.Status)}</td><td><strong>${relativeUpdated(row.UpdatedAt)}</strong><small>${escHtml(row.OwnerEmployeeID || 'ไม่ระบุผู้รับผิดชอบ')}</small></td><td><div class="sv-row-actions">${draft ? `<button type="button" class="sv-button sv-button--primary" data-sv-edit-draft="${Number(row.id)}">แก้ไขต่อ</button>` : ''}<button type="button" class="sv-button sv-button--secondary" data-sv-select="${Number(row.id)}" aria-label="เปิดรายละเอียด ${escHtml(row.TitleTh || row.CampaignCode)}">ดู</button>${draft ? `<button type="button" class="sv-button sv-button--secondary" data-sv-duplicate-campaign="${Number(row.id)}">ทำสำเนา</button><button type="button" class="sv-button sv-button--danger-quiet" data-sv-void-draft="${Number(row.id)}">ยกเลิกร่าง</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`;
}

function campaignListMarkup(rows, context = 'main') {
    if (!rows.length) return safetyVoteEmptyState({ title: state.query ? 'ไม่พบแคมเปญที่ค้นหา' : `ยังไม่มีรายการ${VIEW_LABELS[state.view]}`, description: state.query ? 'ลองเปลี่ยนคำค้นหา ตัวกรอง หรือสถานะที่เลือก' : 'เมื่อมีแคมเปญในสถานะนี้ รายการจะแสดงที่นี่', actionLabel: state.query ? 'ล้างคำค้นหา' : '', action: 'clear-search' });
    return `<div class="sv-campaign-list sv-campaign-list--${context}">${campaignTable(rows)}<div class="sv-campaign-cards">${rows.map(campaignCard).join('')}</div></div>`;
}

function detailMarkup(row) {
    if (!row) return `<section class="sv-master-detail__detail sv-detail-placeholder" aria-label="รายละเอียดแคมเปญ"><span aria-hidden="true">←</span><h2>เลือกแคมเปญเพื่อดูรายละเอียด</h2><p>รายละเอียดและเมนูที่เกี่ยวข้องกับประเภทแคมเปญจะแสดงในพื้นที่นี้</p></section>`;
    const sections = sectionsForCampaign(row);
    const draftWarning = String(row.Status).toLowerCase() === 'draft' ? `<div class="sv-readiness-warning" role="status"><strong>ควรตรวจความพร้อมก่อนเปิดแคมเปญ</strong><span>ตรวจเนื้อหา ผู้มีสิทธิ์ กำหนดการ และการแสดงผลให้ครบในพื้นที่จัดการ</span></div>` : '';
    const draft = String(row.Status).toLowerCase() === 'draft';
    const readiness = draft ? draftReadiness(row) : null;
    const actions = draft
        ? `<div class="sv-context-actions"><button type="button" class="sv-button sv-button--primary" data-sv-edit-draft="${Number(row.id)}">แก้ไขต่อ</button><details><summary class="sv-button sv-button--secondary">เพิ่มเติม</summary><div><button type="button" data-sv-duplicate-campaign="${Number(row.id)}">ทำสำเนาเฉพาะการตั้งค่า</button><button type="button" data-sv-action="open-workspace">ตั้งค่าขั้นสูง</button><button type="button" data-sv-action="open-versions">เวอร์ชันและนโยบาย</button><button type="button" class="is-danger" data-sv-void-draft="${Number(row.id)}">ยกเลิกร่าง</button></div></details></div>`
        : `<div class="sv-context-actions"><button type="button" class="sv-button sv-button--primary" data-sv-action="open-operations">ศูนย์ปฏิบัติการ</button><details><summary class="sv-button sv-button--secondary">เพิ่มเติม</summary><div><button type="button" data-sv-action="open-results">ผลและการรับรอง</button><button type="button" data-sv-action="open-governance">ธรรมาภิบาล</button><button type="button" data-sv-action="open-versions">เวอร์ชันและนโยบาย</button></div></details></div>`;
    return `<section class="sv-master-detail__detail" aria-labelledby="sv-detail-title"><div class="sv-detail-header"><div><p class="sv-eyebrow">${escHtml(row.CampaignCode)}</p><h2 id="sv-detail-title" tabindex="-1">${escHtml(row.TitleTh || 'ไม่มีชื่อแคมเปญ')}</h2><p>${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || 'ไม่ระบุประเภท')} · ${escHtml(PRIVACY_LABELS[row.PrivacyMode] || 'ไม่ระบุรูปแบบความเป็นส่วนตัว')}</p><small>แก้ไขล่าสุด ${relativeUpdated(row.UpdatedAt)} โดย ${escHtml(row.OwnerEmployeeID || 'ไม่ระบุผู้รับผิดชอบ')}</small></div>${safetyVoteStatusBadge(row.Status)}</div>${draftWarning}${readiness ? `<section class="sv-detail-readiness" aria-label="ความพร้อมเบื้องต้น"><div><strong>ความพร้อมเบื้องต้น ${readiness.percent}%</strong><span>${readiness.passed} จาก ${readiness.total} หมวด · ตรวจรายละเอียดจริงใน Wizard ก่อนเปิด</span></div><span><i style="width:${readiness.percent}%"></i></span></section>` : ''}<nav class="sv-workspace-nav" aria-label="ส่วนงานสำหรับแคมเปญประเภท ${escHtml(TYPE_LABELS[row.CampaignType] || row.CampaignType || '')}">${sections.map(([key, label], index) => `<button type="button" data-sv-section="${key}" ${index === 0 ? 'aria-current="page"' : ''}>${escHtml(label)}</button>`).join('')}</nav><dl class="sv-detail-summary"><div><dt>ผู้รับผิดชอบ</dt><dd>${escHtml(row.OwnerEmployeeID || 'ยังไม่ระบุ')}</dd></div><div><dt>เปิดกิจกรรม</dt><dd>${formattedDate(row.ScheduledOpenAt || row.OpenAt)}</dd></div><div><dt>ปิดกิจกรรม</dt><dd>${formattedDate(row.ScheduledCloseAt || row.CloseAt)}</dd></div><div><dt>การแสดงผล</dt><dd>${escHtml(RESULT_LABELS[row.ResultVisibility] || 'ตามการตั้งค่าแคมเปญ')}</dd></div></dl>${actions}</section>`;
}

function campaignWorkspaceMarkup(rows, selected) {
    const selectedCount = [...state.selectedDraftIds].filter(id => state.campaigns.some(row => Number(row.id) === id && String(row.Status).toLowerCase() === 'draft')).length;
    const bulk = state.view === 'draft' ? `<div class="sv-bulk-draft-bar" role="region" aria-label="จัดการฉบับร่างหลายรายการ"><span><strong>${selectedCount}</strong> รายการที่เลือก</span><button type="button" class="sv-button sv-button--danger-quiet" data-sv-bulk-void ${selectedCount ? '' : 'disabled'}>ยกเลิกร่างที่เลือก</button></div>` : '';
    return `<section class="sv-campaign-workspace" aria-labelledby="sv-campaign-workspace-title"><header class="sv-workspace-hero"><div><p class="sv-eyebrow">จัดการกิจกรรม</p><h1 id="sv-campaign-workspace-title">แคมเปญ</h1><p>ค้นหา แก้ไขฉบับร่าง และเปิดพื้นที่จัดการของแต่ละกิจกรรม</p></div><button type="button" class="sv-button sv-button--primary" data-sv-action="new-campaign">สร้างแคมเปญ</button></header><section class="sv-list-panel" aria-labelledby="sv-campaign-list-title"><div class="sv-list-panel__heading"><div><p class="sv-eyebrow">รายการแคมเปญ</p><h2 id="sv-campaign-list-title">${VIEW_LABELS[state.view]}</h2></div><button class="sv-button sv-button--secondary sv-tablet-drawer-trigger" type="button" data-sv-action="open-drawer" aria-expanded="${state.drawerOpen}">เลือกแคมเปญ</button></div><div class="sv-toolbar"><label class="sv-search"><span class="sr-only">ค้นหาแคมเปญ</span><input type="search" value="${escHtml(state.query)}" placeholder="ค้นหาชื่อ รหัส หรือผู้รับผิดชอบ" data-sv-search></label><div class="sv-view-tabs" role="tablist" aria-label="สถานะแคมเปญ">${Object.entries(VIEW_LABELS).map(([key, label]) => `<button type="button" role="tab" data-sv-view="${key}" aria-selected="${state.view === key}">${escHtml(label)}</button>`).join('')}</div><label class="sv-sort"><span>เรียงตาม</span><select data-sv-sort><option value="updated_desc" ${state.sort === 'updated_desc' ? 'selected' : ''}>อัปเดตล่าสุด</option><option value="title_asc" ${state.sort === 'title_asc' ? 'selected' : ''}>ชื่อ ก–ฮ</option><option value="status_asc" ${state.sort === 'status_asc' ? 'selected' : ''}>สถานะ</option></select></label></div>${bulk}<div class="sv-master-detail"><div class="sv-master-detail__list">${campaignListMarkup(rows)}</div>${detailMarkup(selected)}</div></section><div class="sv-tablet-drawer ${state.drawerOpen ? 'is-open' : ''}" aria-hidden="${!state.drawerOpen}"><button type="button" class="sv-tablet-drawer__backdrop" data-sv-action="close-drawer" tabindex="-1" aria-label="ปิดรายการแคมเปญ"></button><aside role="dialog" aria-modal="true" aria-labelledby="sv-drawer-title"><div class="sv-tablet-drawer__header"><h2 id="sv-drawer-title">เลือกแคมเปญ</h2><button type="button" class="sv-icon-button" data-sv-action="close-drawer" aria-label="ปิด">×</button></div>${campaignListMarkup(rows, 'drawer')}</aside></div><p class="sr-only" aria-live="polite">แสดง ${rows.length} แคมเปญ</p></section>`;
}

function overviewMarkup(kpi) {
    return `<header class="sv-admin-hero"><div><p class="sv-eyebrow">ศูนย์จัดการกิจกรรม</p><h1>จัดการ Safety Vote</h1><p>ดูงานสำคัญก่อน แล้วเข้าสู่พื้นที่เฉพาะเมื่อต้องสร้างหรือแก้ไขข้อมูล</p></div><div class="sv-hero-actions"><button type="button" class="sv-button sv-button--secondary" data-sv-promotion-new>สร้างป้ายกิจกรรม</button><button type="button" class="sv-button sv-button--primary" data-sv-action="new-campaign">สร้างแคมเปญ</button></div></header><section class="sv-kpi-grid" aria-label="ภาพรวมแคมเปญ"><button data-sv-kpi-view="draft"><span>ฉบับร่าง</span><strong>${kpi.draft}</strong></button><button data-sv-kpi-view="active"><span>กำลังเปิด</span><strong>${kpi.open}</strong></button><button data-sv-kpi-view="active"><span>ใกล้ปิดใน 72 ชม.</span><strong>${kpi.nearClose}</strong></button><button data-sv-kpi-view="completed"><span>ปิดแล้ว</span><strong>${kpi.closed}</strong></button></section>${actionCenterMarkup()}${overviewToolsMarkup()}`;
}

function render() {
    const container = state.container;
    if (!container) return;
    if (state.loading) { container.innerHTML = loadingMarkup(); return; }
    const systemState = systemStateMarkup();
    if (systemState) { container.innerHTML = systemState; bind(); return; }
    const rows = visibleCampaigns(), kpi = campaignMetrics(state.campaigns), selected = selectedCampaign();
    const content = state.workspace === 'campaigns' ? campaignWorkspaceMarkup(rows, selected) : state.workspace === 'promotions' ? promotionWorkspaceMarkup() : overviewMarkup(kpi);
    container.innerHTML = `<div class="sv-ux-shell" data-sv-ux-version="2026-10-11-admin-guided-drafts-r1">${safetyVoteRoleNav({ active: 'admin', showAdmin: true })}${adminWorkspaceNav()}${content}${campaignLauncherMarkup()}</div>`;
    container.querySelector('.sv-ux-shell')?.setAttribute('data-sv-engagement-version', '2026-10-10-safety-vote-ux-phase9a-r1');
    bind();
}

function clearPromotionPreviews() {
    for (const url of state.promotionPreviewUrls.values()) URL.revokeObjectURL(url);
    state.promotionPreviewUrls.clear();
}

function clearPromotionAssetUrls() {
    for (const url of state.promotionAssetUrls.values()) URL.revokeObjectURL(url);
    state.promotionAssetUrls.clear();
}

async function hydratePromotionAssets() {
    const missing = state.promotionAssets.filter(asset => !state.promotionAssetUrls.has(Number(asset.id)));
    await Promise.all(missing.map(async asset => {
        try {
            const response = await API.get(`/safety-vote/files/${Number(asset.id)}`, { suppressErrorLog: true });
            state.promotionAssetUrls.set(Number(asset.id), URL.createObjectURL(await response.blob()));
        } catch (_) {}
    }));
    if (missing.length && state.workspace === 'promotions' && state.promotionEditorId !== null) render();
}

async function loadPromotionAssets(campaignId) {
    clearPromotionAssetUrls();
    state.promotionAssets = [];
    const id = Number(campaignId || 0);
    if (!id || state.engagementUnavailable || !isSafetyVoteEngagementV1Enabled()) { render(); return; }
    state.promotionAssetsLoading = true; render();
    try {
        const response = await API.get(`/safety-vote/admin/planning/campaigns/${id}/assets`, { suppressErrorLog: true });
        state.promotionAssets = response.data?.rows || [];
    } catch (_) { state.promotionAssets = []; }
    finally { state.promotionAssetsLoading = false; render(); hydratePromotionAssets(); }
}

function openCreationLauncher() {
    state.campaignLauncherOpen = true;
    render();
    requestAnimationFrame(() => state.container?.querySelector('.sv-campaign-launcher [data-sv-built-in-template], .sv-campaign-launcher [data-sv-launcher-close]')?.focus());
}

async function openReusableTemplate(templateId) {
    try {
        const response = await API.get(`/safety-vote/admin/planning/templates/${Number(templateId)}`);
        state.campaignLauncherOpen = false;
        openCampaignWizard(null, { initialConfig: response.data?.config, sourceLabel: response.data?.name || 'แม่แบบที่บันทึกไว้' });
    } catch (error) { showToast(error?.message || 'เปิดแม่แบบไม่สำเร็จ', 'error'); }
}

async function duplicateCampaignConfig(campaignId) {
    const row = state.campaigns.find(item => Number(item.id) === Number(campaignId));
    if (!row) return;
    try {
        const response = await API.get(`/safety-vote/admin/planning/campaigns/${Number(campaignId)}/config-copy`);
        openCampaignWizard(null, { initialConfig: response.data?.config, sourceLabel: `สำเนา ${row.CampaignCode}` });
    } catch (error) { showToast(error?.message || 'คัดลอกการตั้งค่าไม่สำเร็จ', 'error'); }
}

function bulkVoidDrafts() {
    const rows = state.campaigns.filter(row => state.selectedDraftIds.has(Number(row.id)) && String(row.Status).toLowerCase() === 'draft');
    if (!rows.length) return;
    openSafetyVoteReasonDialog({
        title: `ยกเลิกแคมเปญฉบับร่าง ${rows.length} รายการ`,
        description: 'ระบบจะดำเนินการทีละรายการและเก็บรหัสแคมเปญ เหตุผล และ Audit ไว้ ไม่มีการลบข้อมูลแบบถาวร รายการที่สถานะเปลี่ยนระหว่างดำเนินการจะถูกข้ามอย่างปลอดภัย',
        label: 'เหตุผลสำหรับทุกรายการที่เลือก', confirmLabel: `ยืนยันยกเลิก ${rows.length} รายการ`,
        onConfirm: async reason => {
            let completed = 0, failed = 0;
            for (const row of rows) {
                try { await API.delete(`/safety-vote/admin/campaigns/${Number(row.id)}`, { body: JSON.stringify({ reason: `[Bulk ${rows.length}] ${reason}` }) }); completed += 1; state.selectedDraftIds.delete(Number(row.id)); }
                catch (_) { failed += 1; }
            }
            state.selectedId = null;
            await load();
            showToast(failed ? `ยกเลิกสำเร็จ ${completed} รายการ และข้าม ${failed} รายการที่ดำเนินการไม่ได้` : `ยกเลิกฉบับร่าง ${completed} รายการแล้ว พร้อมเก็บ Audit`, failed ? 'warning' : 'success');
        }
    });
}

function previewPromotionImage(input) {
    const slot = input.dataset.svPromotionImage, file = input.files?.[0];
    if (!file) return;
    const status = state.container?.querySelector(`[data-sv-image-status="${slot}"]`);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        input.value = '';
        if (status) status.textContent = 'รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB';
        showToast('ไฟล์ภาพไม่ถูกต้องหรือมีขนาดเกิน 10 MB', 'error');
        return;
    }
    const oldUrl = state.promotionPreviewUrls.get(slot);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const url = URL.createObjectURL(file); state.promotionPreviewUrls.set(slot, url);
    const preview = state.container?.querySelector(`.sv-promotion-preview--${slot} > div`);
    if (preview) preview.innerHTML = `<img src="${escHtml(url)}" alt="ตัวอย่างภาพ ${slot === 'desktop' ? 'Desktop' : 'Mobile'}">`;
    const image = new Image();
    image.onload = () => {
        const expected = slot === 'desktop' ? 2 : 0.8, ratio = image.naturalWidth / image.naturalHeight;
        const minWidth = slot === 'desktop' ? 1200 : 720, minHeight = slot === 'desktop' ? 600 : 900;
        const warnings = [];
        if (image.naturalWidth < minWidth || image.naturalHeight < minHeight) warnings.push(`ความละเอียดต่ำกว่าขั้นต่ำ ${minWidth}×${minHeight} px`);
        if (Math.abs(ratio - expected) > 0.08) warnings.push(`สัดส่วนต่างจาก ${slot === 'desktop' ? '2:1' : '4:5'} และอาจถูกครอบ`);
        if (file.size > 1.5 * 1024 * 1024) warnings.push('ไฟล์ใหญ่กว่า 1.5 MB อาจโหลดช้า');
        if (status) status.textContent = `${image.naturalWidth}×${image.naturalHeight} px · ${(file.size / 1024 / 1024).toFixed(2)} MB${warnings.length ? ` — ${warnings.join(' · ')}` : ' — ขนาดเหมาะสม'}`;
        status?.classList.toggle('is-warning', warnings.length > 0);
    };
    image.src = url;
}

function voidDraftCampaign(campaignId) {
    const row = state.campaigns.find(item => Number(item.id) === Number(campaignId));
    if (!row || String(row.Status).toLowerCase() !== 'draft') return;
    openSafetyVoteReasonDialog({
        title: 'ยกเลิกแคมเปญฉบับร่าง',
        description: `“${row.TitleTh || row.CampaignCode}” จะออกจากรายการงานที่กำลังทำ รหัสแคมเปญและ Audit จะยังถูกเก็บไว้ และไม่สามารถแก้ไขร่างนี้ต่อได้`,
        label: 'เหตุผลที่ยกเลิกร่าง', confirmLabel: 'ยืนยันยกเลิกร่าง',
        onConfirm: async reason => {
            await API.delete(`/safety-vote/admin/campaigns/${Number(row.id)}`, { body: JSON.stringify({ reason }) });
            state.selectedId = null; state.view = 'voided';
            await load();
            showToast('ยกเลิกแคมเปญฉบับร่างแล้ว และเก็บประวัติไว้ใน Audit', 'success');
        }
    });
}

function bind() {
    const container = state.container;
    container?.querySelectorAll('[data-sv-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.svView; state.selectedId = null; if (state.view !== 'draft') state.selectedDraftIds.clear(); render(); }));
    container?.querySelectorAll('[data-sv-kpi-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.svKpiView; state.workspace = 'campaigns'; state.selectedId = null; render(); }));
    container?.querySelectorAll('[data-sv-workspace]').forEach(button => button.addEventListener('click', () => {
        const workspace = button.dataset.svWorkspace;
        if (workspace === 'planning') { renderSafetyVotePlanningWorkspace(container, { campaigns: state.campaigns, selectedId: state.selectedId, onClose: () => { state.workspace = 'overview'; load(); } }); return; }
        if (workspace === 'review') { state.workspace = 'review'; renderSafetyVoteReviewWorkspace(container, { onClose: () => { state.workspace = 'overview'; render(); }, onAction: (action, campaign) => { state.selectedId = Number(campaign?.id || 0) || null; if (action === 'edit' && campaign) { const row = state.campaigns.find(item => Number(item.id) === Number(campaign.id)); if (row) openCampaignWizard(row); return; } if (action === 'promotion') { state.workspace = 'promotions'; state.promotionEditorId = 0; render(); return; } if (action === 'planning') { renderSafetyVotePlanningWorkspace(container, { campaigns: state.campaigns, selectedId: state.selectedId, onClose: () => { state.workspace = 'overview'; render(); } }); return; } if (action === 'operations' && campaign) { const row = state.campaigns.find(item => Number(item.id) === Number(campaign.id)); if (row) openWorkspace(row, 'open-operations'); } } }); return; }
        state.workspace = workspace; state.drawerOpen = false; state.campaignLauncherOpen = false; render();
    }));
    container?.querySelector('[data-sv-search]')?.addEventListener('input', event => { state.query = event.target.value; render(); requestAnimationFrame(() => { const input = state.container?.querySelector('[data-sv-search]'); input?.focus(); input?.setSelectionRange(state.query.length, state.query.length); }); });
    container?.querySelector('[data-sv-sort]')?.addEventListener('change', event => { state.sort = event.target.value; render(); });
    container?.querySelectorAll('[data-sv-select]').forEach(button => button.addEventListener('click', () => { state.selectedId = Number(button.dataset.svSelect); state.drawerOpen = false; render(); state.container?.querySelector('#sv-detail-title')?.focus?.(); }));
    container?.querySelectorAll('[data-sv-action]').forEach(button => button.addEventListener('click', () => handleAction(button.dataset.svAction)));
    container?.querySelectorAll('[data-sv-section]').forEach(button => button.addEventListener('click', () => { container.querySelectorAll('[data-sv-section]').forEach(item => item.removeAttribute('aria-current')); button.setAttribute('aria-current', 'page'); }));
    container?.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => handleJourneyStep(button.dataset.svJourneyStep)));
    container?.querySelectorAll('[data-sv-edit-draft]').forEach(button => button.addEventListener('click', () => openCampaignWizard(Number(button.dataset.svEditDraft))));
    container?.querySelectorAll('[data-sv-void-draft]').forEach(button => button.addEventListener('click', () => voidDraftCampaign(Number(button.dataset.svVoidDraft))));
    container?.querySelectorAll('[data-sv-duplicate-campaign]').forEach(button => button.addEventListener('click', () => duplicateCampaignConfig(Number(button.dataset.svDuplicateCampaign))));
    container?.querySelectorAll('[data-sv-draft-select]').forEach(input => input.addEventListener('change', () => { const id = Number(input.dataset.svDraftSelect); if (input.checked) state.selectedDraftIds.add(id); else state.selectedDraftIds.delete(id); render(); }));
    container?.querySelector('[data-sv-draft-select-all]')?.addEventListener('change', event => { visibleCampaigns().filter(row => String(row.Status).toLowerCase() === 'draft').forEach(row => event.target.checked ? state.selectedDraftIds.add(Number(row.id)) : state.selectedDraftIds.delete(Number(row.id))); render(); });
    container?.querySelector('[data-sv-bulk-void]')?.addEventListener('click', bulkVoidDrafts);
    container?.querySelectorAll('[data-sv-launcher-close]').forEach(node => node.addEventListener('click', event => { if (node.classList.contains('sv-launcher-backdrop') && event.target !== node) return; state.campaignLauncherOpen = false; render(); requestAnimationFrame(() => state.container?.querySelector('[data-sv-action="new-campaign"]')?.focus()); }));
    container?.querySelector('.sv-campaign-launcher')?.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const targets = [...event.currentTarget.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
        if (!targets.length) return;
        const first = targets[0], last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    container?.querySelectorAll('[data-sv-built-in-template]').forEach(button => button.addEventListener('click', () => { state.campaignLauncherOpen = false; openCampaignWizard(null, { initialTemplateKey: button.dataset.svBuiltInTemplate, sourceLabel: button.querySelector('strong')?.textContent || 'รูปแบบมาตรฐาน' }); }));
    container?.querySelectorAll('[data-sv-reusable-template]').forEach(button => button.addEventListener('click', () => openReusableTemplate(Number(button.dataset.svReusableTemplate))));
    container?.querySelectorAll('[data-sv-promotion-new]').forEach(button => button.addEventListener('click', () => { clearPromotionPreviews(); state.promotionAssetSelection.clear(); state.workspace = 'promotions'; state.promotionEditorId = 0; render(); const campaignId = state.campaigns.find(row => row.Status !== 'Voided')?.id; loadPromotionAssets(campaignId); requestAnimationFrame(() => container.querySelector('[data-sv-promotion-form] input[name="titleTh"]')?.focus()); }));
    container?.querySelector('[data-sv-promotion-cancel]')?.addEventListener('click', () => { clearPromotionPreviews(); clearPromotionAssetUrls(); state.promotionAssetSelection.clear(); state.promotionAssets = []; state.promotionEditorId = null; render(); });
    container?.querySelectorAll('[data-sv-promotion-edit]').forEach(button => button.addEventListener('click', () => { clearPromotionPreviews(); state.promotionAssetSelection.clear(); state.promotionEditorId = Number(button.dataset.svPromotionEdit); const editing = state.promotions.find(item => Number(item.id) === Number(state.promotionEditorId)); render(); loadPromotionAssets(editing?.campaignId); requestAnimationFrame(() => container.querySelector('[data-sv-promotion-form] input[name="titleTh"]')?.focus()); }));
    container?.querySelectorAll('[data-sv-promotion-image]').forEach(input => input.addEventListener('change', () => previewPromotionImage(input)));
    container?.querySelector('[data-sv-promotion-form] select[name="campaignId"]')?.addEventListener('change', event => { state.promotionAssetSelection.clear(); loadPromotionAssets(Number(event.target.value)); });
    container?.querySelectorAll('[data-sv-library-asset]').forEach(button => button.addEventListener('click', () => { const slot = button.dataset.slot, id = Number(button.dataset.svLibraryAsset); if (Number(state.promotionAssetSelection.get(slot)) === id) state.promotionAssetSelection.delete(slot); else state.promotionAssetSelection.set(slot, id); render(); }));
    container?.querySelectorAll('[data-sv-task-campaign]').forEach(button => button.addEventListener('click', () => { state.selectedId = Number(button.dataset.svTaskCampaign); const action = button.dataset.svTaskAction; if (action === 'operations') openOperationsWorkspace(); else if (action === 'results') openResultsWorkspace(); else if (action === 'workspace') handleAction('open-workspace'); else render(); }));
    container?.querySelector('[data-sv-promotion-form]')?.addEventListener('submit', event => { event.preventDefault(); const intent = event.submitter?.value || 'Draft'; if (intent === 'Published') openSafetyVoteConfirmDialog({ title: 'เผยแพร่ป้ายกิจกรรม', description: 'ป้ายจะแสดงเฉพาะผู้มีสิทธิ์ตามช่วงเวลาที่กำหนด และไม่เปลี่ยนสิทธิ์เข้าร่วมหรือเนื้อหาบัตรลงคะแนน', confirmLabel: 'เผยแพร่', onConfirm: () => savePromotion(event.currentTarget, intent) }); else if (intent === 'Archived') openSafetyVoteConfirmDialog({ title: 'เก็บป้ายกิจกรรม', description: 'ป้ายจะหยุดแสดงแก่ผู้ใช้ แต่ประวัติและ Audit จะยังอยู่', confirmLabel: 'เก็บถาวร', tone: 'danger', onConfirm: () => savePromotion(event.currentTarget, intent) }); else savePromotion(event.currentTarget, intent); });
    if (container) container.onkeydown = event => { if (event.key !== 'Escape') return; if (state.campaignLauncherOpen) { state.campaignLauncherOpen = false; render(); requestAnimationFrame(() => state.container?.querySelector('[data-sv-action="new-campaign"]')?.focus()); return; } if (state.drawerOpen) { state.drawerOpen = false; render(); container.querySelector('[data-sv-action="open-drawer"]')?.focus(); } };
}

async function savePromotion(form, status) {
    if (!form.reportValidity()) return;
    const values = new FormData(form), desktop = values.get('desktop'), mobile = values.get('mobile');
    const editing = state.promotions.find(item => Number(item.id) === Number(state.promotionEditorId));
    const altText = String(values.get('altText') || '').trim();
    if ((desktop?.size || mobile?.size || editing?.desktopFileId || editing?.mobileFileId || state.promotionAssetSelection.size) && !altText) { showToast('กรุณาระบุคำอธิบายภาพสำหรับผู้ใช้ Screen Reader', 'warning'); form.elements.altText?.focus(); return; }
    const payload = { campaignId: Number(values.get('campaignId')), titleTh: String(values.get('titleTh') || '').trim(), subtitleTh: String(values.get('subtitleTh') || '').trim(), ctaLabel: String(values.get('ctaLabel') || '').trim(), altText, priority: Number(values.get('priority') || 0), startAt: new Date(String(values.get('startAt'))).toISOString(), endAt: new Date(String(values.get('endAt'))).toISOString(), status, rowVersion: Number(values.get('rowVersion') || 0) || undefined };
    [...form.elements].forEach(element => { element.disabled = true; });
    try {
        let response = editing ? await API.put(`/safety-vote/admin/promotions/${Number(editing.id)}`, payload) : await API.post('/safety-vote/admin/promotions', payload);
        const id = Number(response.data.id);
        for (const slot of ['desktop', 'mobile']) {
            const file = slot === 'desktop' ? desktop : mobile;
            const libraryFileId = Number(state.promotionAssetSelection.get(slot) || 0);
            if (!file?.size && libraryFileId) await API.post(`/safety-vote/admin/planning/promotions/${id}/assets/${libraryFileId}`, { slot });
        }
        for (const [slot, file] of [['desktop', desktop], ['mobile', mobile]]) if (file?.size) { const body = new FormData(); body.append('file', file); response = await API.upload(`/safety-vote/admin/promotions/${id}/assets/${slot}`, body); }
        clearPromotionPreviews();
        clearPromotionAssetUrls();
        state.promotionAssetSelection.clear(); state.promotionAssets = [];
        state.promotionEditorId = null;
        await loadEngagement();
        render();
        showToast(status === 'Published' ? 'เผยแพร่ป้ายกิจกรรมแล้ว' : status === 'Archived' ? 'เก็บป้ายกิจกรรมถาวรแล้ว' : 'บันทึกป้ายฉบับร่างแล้ว', 'success');
    } catch (error) {
        showToast(error?.message || 'บันทึกป้ายกิจกรรมไม่สำเร็จ', 'error');
        [...form.elements].forEach(element => { element.disabled = false; });
    }
}

async function loadEngagement() {
    if (!isSafetyVoteEngagementV1Enabled()) { state.engagement = null; state.promotions = []; state.templates = []; state.planningUnavailable = false; state.engagementUnavailable = false; return; }
    try {
        const [center, promotions, planning] = await Promise.all([
            API.get('/safety-vote/admin/engagement/action-center', { suppressErrorLog: true }),
            API.get('/safety-vote/admin/promotions', { suppressErrorLog: true }),
            API.get('/safety-vote/admin/planning/overview', { suppressErrorLog: true }).catch(error => ({ data: null, planningError: error }))
        ]);
        state.engagement = center.data || null;
        state.promotions = promotions.data?.rows || [];
        state.templates = planning.data?.templates || [];
        state.planningUnavailable = Boolean(planning.planningError);
        state.engagementUnavailable = false;
    } catch (error) {
        if (['SAFETY_VOTE_ENGAGEMENT_DISABLED', 'SAFETY_VOTE_ENGAGEMENT_SETUP_REQUIRED'].includes(error?.code)) { state.engagementUnavailable = true; state.engagement = null; state.promotions = []; state.templates = []; state.planningUnavailable = true; return; }
        throw error;
    }
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

function openCampaignWizard(campaignId = null, options = {}) {
    const container = state.container;
    renderSafetyVoteCampaignWizard(container, {
        campaignId,
        ...options,
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

async function openVersionWorkspace() {
    const row = selectedCampaign(); if (!row) return;
    const host = state.container;
    host.innerHTML = `<div class="sv-ux-shell"><button type="button" class="sv-button sv-button--secondary" data-sv-back-center>← กลับศูนย์จัดการ</button><section class="sv-version-workspace" aria-live="polite"><p>กำลังโหลดเวอร์ชัน…</p></section></div>`;
    host.querySelector('[data-sv-back-center]').addEventListener('click',()=>render());
    const panel=host.querySelector('.sv-version-workspace');
    try {
        const [history,policy]=await Promise.all([API.get(`/safety-vote/admin/campaigns/${Number(row.id)}/versions`),API.get(`/safety-vote/admin/campaigns/${Number(row.id)}/edit-policy`)]),data=history.data,items=data.versions||[],rule=policy.data?.rules||{};
        panel.innerHTML=`<header><p class="sv-eyebrow">${escHtml(row.CampaignCode)}</p><h1>เวอร์ชันและนโยบายการแก้ไข</h1><p>เวอร์ชันที่กำลังใช้งานคือ V${Number(items.find(x=>Number(x.id)===Number(data.currentVersionId))?.VersionNo||1)}</p></header><section class="sv-version-policy" role="note"><h2>หลังเปิดแคมเปญแก้อะไรได้บ้าง</h2><ul><li>${escHtml(rule.openCampaign||'เนื้อหา live ถูกล็อก')}</li><li>${escHtml(rule.revision||'สร้าง revision แยกจาก live')}</li><li>${escHtml(rule.activation||'ต้องปิดแคมเปญก่อนสลับเวอร์ชัน')}</li><li>แคมเปญแบบกรรมการ/ผู้สมัคร/เลือกตั้งลับต้องตั้งค่าขั้นสูงและตรวจ readiness ใหม่ใน revision — ระบบไม่คัดลอก assignment หรือผลเดิม</li></ul></section><section><h2>ประวัติเวอร์ชัน</h2><div class="sv-version-list">${items.map(item=>`<article><div><strong>V${Number(item.VersionNo)} · ${escHtml(item.TitleTh||'ไม่มีชื่อ')}</strong><span>${Number(item.id)===Number(data.currentVersionId)?'กำลังใช้งาน':escHtml(item.Status)}</span></div><p>${escHtml(item.ChangeReason||'เวอร์ชันเริ่มต้น')}</p>${item.policy?.activateRevisionAllowed&&Number(item.id)!==Number(data.currentVersionId)?`<label class="svw-field"><span>พิมพ์ ACTIVATE ${escHtml(row.CampaignCode)} V${Number(item.VersionNo)}</span><input data-sv-activate-confirm="${Number(item.id)}"><button type="button" class="sv-button sv-button--primary" data-sv-activate-version="${Number(item.id)}" data-version-no="${Number(item.VersionNo)}">ใช้เวอร์ชันนี้</button></label>`:''}</article>`).join('')}</div></section><section class="sv-version-create"><h2>เตรียม revision ใหม่</h2><p>สร้างสำเนาแบบ Draft โดยไม่กระทบผู้ใช้ในเวอร์ชันปัจจุบัน</p><label class="svw-field"><span>เหตุผลการแก้ไข</span><textarea rows="3" minlength="10" maxlength="500" data-sv-revision-reason></textarea></label><button type="button" class="sv-button sv-button--secondary" data-sv-create-revision>สร้าง Draft revision</button></section>`;
        panel.querySelector('[data-sv-create-revision]')?.addEventListener('click',async()=>{const reason=panel.querySelector('[data-sv-revision-reason]')?.value.trim()||'';if(reason.length<10){showToast('กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร','warning');return;}try{await API.post(`/safety-vote/admin/campaigns/${Number(row.id)}/versions`,{reason});showToast('สร้าง Draft revision แล้ว','success');openVersionWorkspace();}catch(error){showToast(error?.message||'สร้าง revision ไม่สำเร็จ','error');}});
        panel.querySelectorAll('[data-sv-activate-version]').forEach(button=>button.addEventListener('click',async()=>{const vid=Number(button.dataset.svActivateVersion),versionNo=Number(button.dataset.versionNo),confirmation=panel.querySelector(`[data-sv-activate-confirm="${vid}"]`)?.value||'';try{await API.post(`/safety-vote/admin/campaigns/${Number(row.id)}/versions/${vid}/activate`,{confirmation});showToast('สลับเวอร์ชันแล้ว แคมเปญกลับเป็น Draft และต้องตรวจความพร้อมใหม่','success');await load();}catch(error){showToast(error?.message||`ยังใช้ V${versionNo} ไม่ได้`,'error');}}));
    } catch(error) { panel.innerHTML=`<div class="sv-state-panel sv-state-panel--error" role="alert"><h1>โหลดเวอร์ชันไม่สำเร็จ</h1><p>${escHtml(error?.message||'กรุณาลองใหม่')}</p></div>`; }
}

function handleAction(action) {
    if (action === 'retry') { load(); return; }
    if (action === 'clear-search') { state.query = ''; render(); return; }
    if (action === 'clear-selection') { state.selectedId = null; render(); return; }
    if (action === 'open-drawer') { state.drawerOpen = true; render(); requestAnimationFrame(() => state.container?.querySelector('.sv-tablet-drawer aside button')?.focus()); return; }
    if (action === 'close-drawer') { state.drawerOpen = false; render(); return; }
    if (action === 'new-campaign') { openCreationLauncher(); return; }
    if (action === 'open-operations') { openOperationsWorkspace(); return; }
    if (action === 'open-results') { openResultsWorkspace(); return; }
    if (action === 'open-governance') { openGovernanceWorkspace(); return; }
    if (action === 'open-versions') { openVersionWorkspace(); return; }
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
        await loadEngagement();
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
