import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { loadSafetyVotePage as loadLegacySafetyVotePage } from './safety-vote.js?v=20261008-safety-vote-phase4-r1';
import { isSafetyVoteUxV1Enabled, isSafetyVoteEngagementV1Enabled, openSafetyVoteConfirmDialog, safetyVoteJourneyNav, safetyVoteRoleNav } from './safety-vote-ux-components.js?v=20261010-safety-vote-ux9b-r1';
import { loadSafetyVoteJuryWorkspace } from './safety-vote-jury-workspace.js?v=20261009-safety-vote-ux8-r1';
import {
    CAMPAIGN_TYPE_LABELS, PRIVACY_LABELS, buildBallotPayload, campaignType, filterCampaigns,
    isBallotCampaign, isChoiceQuestion, isQuestionVisible, participationState, privacyMode,
    privacyNotice, safeReceipt, validateParticipation, valueOf
} from './safety-vote-participation-model.mjs?v=20261008-safety-vote-ux3-r1';

const VIEW_LABELS = { open: 'เข้าร่วมได้', submitted: 'ส่งแล้ว', closed: 'สิ้นสุดแล้ว' };
const STATUS_LABELS = { Open: 'เปิดรับการเข้าร่วม', Closed: 'ปิดรับแล้ว', Published: 'ประกาศผลแล้ว' };
const state = {
    page: null, campaigns: [], detail: null, assignments: [], nominations: [], notifications: [], notificationCenter: [], promotions: [], promotionIndex: 0, submissions: [],
    view: 'open', query: '', screen: 'list', mode: 'edit', answers: {}, errors: [], receipt: null,
    loading: true, error: null, denied: false, moduleDisabled: false, inFlight: false, requestKey: '',
    workflowDraftId: null, workflowReference: '', submitError: null, objectUrls: new Set()
};

function bindRoleNavigation() {
    state.page.querySelector('[data-sv-role-link="admin"]')?.addEventListener('click', () => {
        window._saveTab?.('admin', 'safety-vote-foundation');
    });
}

function promotionForCampaign(campaignId) {
    return state.promotions.find(item => Number(item.campaignId) === Number(campaignId)) || null;
}

function promotionBannerMarkup() {
    if (!isSafetyVoteEngagementV1Enabled() || !state.promotions.length) return '';
    const index = Math.min(state.promotionIndex, state.promotions.length - 1), item = state.promotions[index], fileId = item.mobileFileId || item.desktopFileId;
    return `<section class="svp-promotion" aria-roledescription="carousel" aria-label="กิจกรรมประชาสัมพันธ์"><article aria-label="${index + 1} จาก ${state.promotions.length}">${fileId ? `<img data-svp-promotion-file="${Number(fileId)}" data-desktop-file="${Number(item.desktopFileId || fileId)}" alt="${escHtml(item.altText || '')}">` : '<div class="svp-promotion__fallback" aria-hidden="true">Safety Vote</div>'}<div class="svp-promotion__shade"><p class="sv-eyebrow">กิจกรรมแนะนำ</p><h2>${escHtml(item.titleTh)}</h2><p>${escHtml(item.subtitleTh || item.campaignTitle || '')}</p><button type="button" class="sv-button sv-button--primary" data-svp-campaign="${Number(item.campaignId)}">${escHtml(item.ctaLabel || 'ดูรายละเอียด')}</button></div></article>${state.promotions.length > 1 ? `<div class="svp-promotion__controls"><button type="button" class="sv-icon-button" data-svp-promotion-prev aria-label="ป้ายก่อนหน้า">←</button><span>${index + 1}/${state.promotions.length}</span><button type="button" class="sv-icon-button" data-svp-promotion-next aria-label="ป้ายถัดไป">→</button></div>` : ''}</section>`;
}

function taskStripMarkup() {
    if (!isSafetyVoteEngagementV1Enabled()) return '';
    const open = state.campaigns.filter(item => participationState(item) === 'open'), pending = state.nominations.filter(item => String(valueOf(item, 'ConsentState', 'consentState')) === 'pending'), jury = state.assignments.filter(item => !['submitted', 'recused'].includes(String(valueOf(item, 'Status', 'status')).toLowerCase()));
    const total = open.length + pending.length + jury.length;
    return `<section class="svp-my-tasks" aria-labelledby="svp-my-tasks-title"><div><p class="sv-eyebrow">รายการส่วนตัว</p><h2 id="svp-my-tasks-title">สิ่งที่คุณต้องทำ</h2><p>${total ? `มี ${total} รายการที่รอดำเนินการ` : 'ขณะนี้ไม่มีรายการที่ต้องดำเนินการ'}</p></div><div class="svp-my-tasks__grid">${open.length ? `<button type="button" data-svp-campaign="${Number(open[0].id)}"><strong>${open.length}</strong><span>กิจกรรมที่เข้าร่วมได้</span></button>` : ''}${pending.length ? `<button type="button" data-svp-scroll="consent"><strong>${pending.length}</strong><span>คำเสนอชื่อรอยืนยัน</span></button>` : ''}${jury.length ? `<button type="button" data-svp-jury="${Number(jury[0].id)}"><strong>${jury.length}</strong><span>งานประเมิน</span></button>` : ''}${!total ? '<span class="svp-my-tasks__done">✓ คุณจัดการรายการทั้งหมดแล้ว</span>' : ''}</div></section>`;
}

function notificationCenterMarkup() {
    if (!isSafetyVoteEngagementV1Enabled()) return '';
    const unread = state.notificationCenter.filter(item => !item.readAt);
    return `<section class="svp-notification-center" aria-labelledby="svp-notification-center-title"><div class="svp-notification-center__heading"><div><p class="sv-eyebrow">กล่องข้อความ</p><h2 id="svp-notification-center-title">การแจ้งเตือน Safety Vote</h2></div>${unread.length ? `<button type="button" class="sv-button sv-button--secondary" data-svp-read-all>อ่านทั้งหมด</button>` : ''}</div>${state.notificationCenter.length ? `<div class="svp-notification-center__list">${state.notificationCenter.slice(0, 20).map(item => `<article class="${item.readAt ? '' : 'is-unread'}"><button type="button" data-svp-notification="${Number(item.id)}" data-campaign-id="${Number(item.campaignId)}"><strong>${escHtml(item.metadata?.title || item.campaignTitle || 'Safety Vote')}</strong><span>${escHtml(item.metadata?.message || 'มีข้อมูลใหม่ในกิจกรรมนี้')}</span><small>${dateTime(item.dispatchedAt)}${item.readAt ? ' · อ่านแล้ว' : ' · ยังไม่อ่าน'}</small></button></article>`).join('')}</div>` : '<p class="svp-notification-center__empty">ยังไม่มีการแจ้งเตือน</p>'}</section>`;
}

function clearObjectUrls() {
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
}

function dateTime(value) {
    if (!value) return 'ไม่ระบุเวลา';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'ไม่ระบุเวลา' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function loadingMarkup() {
    return `<div class="svp-shell" aria-busy="true" aria-live="polite"><span class="sr-only">กำลังโหลดกิจกรรมของฉัน</span><div class="svp-skeleton svp-skeleton--hero"></div><div class="svp-card-grid">${Array.from({ length: 3 }, () => '<div class="svp-skeleton svp-skeleton--card"></div>').join('')}</div></div>`;
}

function stateMarkup() {
    if (state.denied) return `<div class="svp-shell">${safetyVoteRoleNav({ active: 'user' })}<section class="svp-state svp-state--denied" role="alert"><p class="sv-eyebrow">ไม่อนุญาตให้เข้าถึง</p><h1>คุณไม่มีสิทธิ์ใช้ Safety Vote</h1><p>บัญชีนี้ไม่มีสิทธิ์ดูหรือเข้าร่วมกิจกรรม กรุณาติดต่อผู้ดูแลระบบหากต้องใช้งาน</p><a class="sv-button sv-button--secondary" href="#dashboard">กลับหน้าหลัก</a></section></div>`;
    if (state.moduleDisabled) return `<div class="svp-shell">${safetyVoteRoleNav({ active: 'user' })}<section class="svp-state svp-state--warning" role="status"><p class="sv-eyebrow">ปิดการใช้งานอยู่</p><h1>Safety Vote ยังไม่เปิดให้ใช้งาน</h1><p>ระบบปิดแบบ fail-closed และไม่ได้อ่านข้อมูลแคมเปญ กรุณารอประกาศจากผู้ดูแลระบบ</p></section></div>`;
    if (state.error) return `<div class="svp-shell">${safetyVoteRoleNav({ active: 'user' })}<section class="svp-state svp-state--error" role="alert"><p class="sv-eyebrow">โหลดข้อมูลไม่สำเร็จ</p><h1>ยังแสดงกิจกรรมของฉันไม่ได้</h1><p>ไม่พบการส่งข้อมูลซ้ำ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p><button type="button" class="sv-button sv-button--primary" data-svp-action="retry-load">ลองอีกครั้ง</button></section></div>`;
    return '';
}

function campaignCard(campaign) {
    const type = campaignType(campaign), privacy = privacyMode(campaign), stateKey = participationState(campaign);
    const promotion = promotionForCampaign(campaign.id), fileId = promotion?.mobileFileId || promotion?.desktopFileId;
    const closingSoon = campaign.CloseAt && new Date(campaign.CloseAt).getTime() > Date.now() && new Date(campaign.CloseAt).getTime() - Date.now() <= 72 * 3600000;
    return `<button type="button" class="svp-campaign-card" data-svp-campaign="${Number(campaign.id)}">${fileId ? `<span class="svp-campaign-card__cover"><img data-svp-promotion-file="${Number(fileId)}" data-desktop-file="${Number(promotion.desktopFileId || fileId)}" alt="${escHtml(promotion.altText || '')}"></span>` : `<span class="svp-campaign-card__cover svp-campaign-card__cover--fallback" aria-hidden="true">${escHtml((CAMPAIGN_TYPE_LABELS[type] || 'Safety Vote').slice(0, 2))}</span>`}<span class="svp-campaign-card__top"><span class="sv-status-badge sv-status-badge--${stateKey === 'open' ? 'open' : stateKey === 'submitted' ? 'published' : 'closed'}"><span class="sv-status-dot"></span>${stateKey === 'submitted' ? 'ส่งแล้ว' : escHtml(STATUS_LABELS[campaign.Status] || campaign.Status)}</span><span>${closingSoon ? '<b class="svp-deadline-chip">ใกล้ปิด</b>' : escHtml(PRIVACY_LABELS[privacy] || privacy)}</span></span><strong>${escHtml(campaign.TitleTh || 'ไม่มีชื่อกิจกรรม')}</strong><span>${escHtml(CAMPAIGN_TYPE_LABELS[type] || type)} · ใช้เวลาประมาณ 3–5 นาที</span><p>${escHtml(campaign.Summary || 'เปิดดูรายละเอียดและเงื่อนไขก่อนเข้าร่วม')}</p><small>${campaign.CloseAt ? `ปิด ${dateTime(campaign.CloseAt)}` : 'ตรวจสอบกำหนดการในรายละเอียด'}</small></button>`;
}

function optionMedia(option) {
    return (option.media || []).map(item => `<a class="svp-option-media-link" href="${escHtml(item.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${item.mediaType === 'video' ? 'เปิดวิดีโอ' : 'เปิดลิงก์'} ${escHtml(item.title || option.label || '')}">${item.mediaType === 'video' ? '▶ วิดีโอ' : '↗ ลิงก์'}${item.title ? ` · ${escHtml(item.title)}` : ''}</a>`).join('');
}

function auxiliaryCoreMarkup() {
    const pending = state.nominations.filter(item => String(valueOf(item, 'ConsentState', 'consentState')) === 'pending');
    return `${pending.length ? `<section class="svp-aux" aria-labelledby="svp-consent-title"><h2 id="svp-consent-title">คำเสนอชื่อที่รอการยินยอม</h2>${pending.map(item => `<article><span>${escHtml(valueOf(item, 'NomineeNameSnapshot', 'nomineeNameSnapshot'))}</span><div><button type="button" class="sv-button sv-button--primary" data-svp-consent="${Number(item.id)}" data-accepted="true">ยินยอม</button><button type="button" class="sv-button sv-button--secondary" data-svp-consent="${Number(item.id)}" data-accepted="false">ปฏิเสธ</button></div></article>`).join('')}</section>` : ''}${state.assignments.length ? `<section class="svp-aux" id="sv-jury-workspace" role="region" aria-labelledby="sv-jury-workspace-title"><h2 id="sv-jury-workspace-title">งานประเมินที่ได้รับมอบหมาย</h2><p>เปิดพื้นที่กรรมการเพื่อทำงานตามเกณฑ์และสิทธิ์เดิมของระบบ</p><div class="svp-assignment-grid">${state.assignments.map(item => `<button type="button" data-svp-jury="${Number(item.id)}"><strong>แบบประเมิน #${Number(item.id)}</strong><span>${escHtml(valueOf(item, 'Status', 'status') || 'รอดำเนินการ')}</span></button>`).join('')}</div></section>` : ''}`;
}

function auxiliaryMarkup() {
    if (isSafetyVoteEngagementV1Enabled()) return auxiliaryCoreMarkup();
    const unread = state.notifications.filter(item => !valueOf(item, 'ReadAt', 'readAt'));
    const notifications = unread.length ? `<section class="svp-aux" aria-labelledby="svp-notification-title"><h2 id="svp-notification-title">การแจ้งเตือน Safety Vote</h2><div class="svp-notification-list">${unread.slice(0, 5).map(item => `<article><strong>${escHtml(valueOf(item, 'TitleTh', 'title', 'NotificationType') || 'มีรายการที่ต้องตรวจสอบ')}</strong><span>${escHtml(valueOf(item, 'MessageTh', 'message') || 'เปิดกิจกรรมที่เกี่ยวข้องเพื่อดูรายละเอียด')}</span></article>`).join('')}</div></section>` : '';
    return notifications + auxiliaryCoreMarkup();
}

function renderList() {
    clearObjectUrls();
    // Phase 1 regression contract: showJury: jury > 0 remains assignment-aware.
    const rows = filterCampaigns(state.campaigns, { view: state.view, query: state.query });
    const counts = Object.fromEntries(Object.keys(VIEW_LABELS).map(key => [key, state.campaigns.filter(campaign => participationState(campaign) === key).length]));
    state.page.innerHTML = `<div class="svp-shell" data-sv-participation="2026-10-08-safety-vote-ux3-r1">${safetyVoteRoleNav({ active: 'user', showJury: state.assignments.length > 0, juryCount: state.assignments.length })}<header class="svp-hero"><div><p class="sv-eyebrow">Safety Vote</p><h1>กิจกรรมของฉัน</h1><p>แสดงเฉพาะกิจกรรมที่รายชื่อผู้มีสิทธิ์ของคุณได้รับการยืนยันแล้ว</p></div><div class="svp-hero__count"><strong>${state.campaigns.length}</strong><span>กิจกรรม</span></div></header><section class="svp-toolbar" aria-label="ค้นหาและกรองกิจกรรม"><label><span class="sr-only">ค้นหากิจกรรม</span><input type="search" data-svp-search value="${escHtml(state.query)}" placeholder="ค้นหาชื่อ รหัส หรือประเภทกิจกรรม"></label><div class="svp-tabs" role="tablist" aria-label="สถานะการเข้าร่วม">${Object.entries(VIEW_LABELS).map(([key, label]) => `<button type="button" role="tab" data-svp-view="${key}" aria-selected="${state.view === key}">${label} <span>${counts[key]}</span></button>`).join('')}</div></section><main><section class="svp-card-grid" aria-label="รายการกิจกรรม">${rows.length ? rows.map(campaignCard).join('') : `<div class="svp-empty"><span aria-hidden="true">◌</span><h2>${state.query ? 'ไม่พบกิจกรรมที่ค้นหา' : `ยังไม่มีกิจกรรม${VIEW_LABELS[state.view]}`}</h2><p>${state.query ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'เมื่อมีกิจกรรมในสถานะนี้ รายการจะแสดงที่นี่'}</p></div>`}</section>${auxiliaryMarkup()}</main><p class="sr-only" aria-live="polite">แสดง ${rows.length} กิจกรรม</p></div>`;
    state.page.querySelector('.svp-shell')?.setAttribute('data-sv-engagement-version', '2026-10-10-safety-vote-ux-phase9a-r1');
    state.page.querySelector('.svp-hero')?.insertAdjacentHTML('beforebegin', promotionBannerMarkup());
    state.page.querySelector('.svp-hero')?.insertAdjacentHTML('afterend', taskStripMarkup());
    state.page.querySelector('main')?.insertAdjacentHTML('beforeend', notificationCenterMarkup());
    state.page.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'user', current: 'participation', campaign: {}, onPage: true }));
    bindList();
    hydratePromotionImages();
}

async function hydratePromotionImages() {
    await Promise.all([...state.page.querySelectorAll('[data-svp-promotion-file]')].map(async image => {
        const desktop = Number(image.dataset.desktopFile || 0), mobile = Number(image.dataset.svpPromotionFile || 0), fileId = matchMedia('(min-width: 768px)').matches && desktop ? desktop : mobile;
        try { const response = await API.get(`/safety-vote/files/${fileId}`, { suppressErrorLog: true }), url = URL.createObjectURL(await response.blob()); state.objectUrls.add(url); image.src = url; } catch { image.closest('.svp-campaign-card__cover')?.classList.add('is-unavailable'); image.remove(); }
    }));
}

function questionControl(question) {
    const id = Number(question.id), raw = state.answers[String(id)], options = question.options || [];
    if (isChoiceQuestion(question)) {
        const inputType = question.questionType === 'single_choice' || question.questionType === 'yes_no_abstain' || Number(question.maxSelections) === 1 ? 'radio' : 'checkbox';
        return `<div class="svp-options">${options.map(option => `<article class="svp-option">${option.fileId ? `<button type="button" class="svp-gallery-trigger" data-svp-file="${Number(option.fileId)}" data-svp-alt="${escHtml(option.label)}" aria-label="ขยายภาพ ${escHtml(option.label)}"><img data-svp-private-file="${Number(option.fileId)}" alt="${escHtml(option.label)}"></button>` : ''}<label><input type="${inputType}" name="svp-q-${id}" value="${Number(option.id)}" data-svp-answer="${id}" ${(Array.isArray(raw) && raw.map(Number).includes(Number(option.id))) ? 'checked' : ''}><span><strong>${escHtml(option.label)}</strong>${option.description ? `<small>${escHtml(option.description)}</small>` : ''}${optionMedia(option)}</span></label></article>`).join('')}</div>`;
    }
    if (question.questionType === 'rating') return `<label class="svp-inline-input"><span>คะแนน ${Number(question.validation?.minNumber ?? 0)}–${Number(question.validation?.maxNumber ?? 10)}</span><input type="number" data-svp-answer="${id}" value="${escHtml(raw ?? '')}" min="${Number(question.validation?.minNumber ?? 0)}" max="${Number(question.validation?.maxNumber ?? 10)}"></label>`;
    if (question.questionType === 'long_text') return `<textarea data-svp-answer="${id}" rows="5" maxlength="${Number(question.validation?.maxLength || 10000)}" placeholder="กรอกคำตอบ">${escHtml(raw || '')}</textarea>`;
    if (['short_text', 'employee_picker', 'organization_picker'].includes(question.questionType)) return `<input data-svp-answer="${id}" value="${escHtml(raw || '')}" maxlength="${Number(question.validation?.maxLength || 1000)}" placeholder="${question.questionType === 'employee_picker' ? 'รหัสพนักงาน' : 'กรอกคำตอบ'}">`;
    if (question.questionType === 'date_time') return `<input type="datetime-local" data-svp-answer="${id}" value="${escHtml(raw || '')}">`;
    if (question.questionType === 'file_upload') return `<label class="svp-file-control"><span>${Number(raw) ? 'แนบไฟล์แล้ว' : 'เลือกไฟล์คำตอบ'}</span><input type="file" data-svp-answer-file="${id}" ${Number(raw) ? `data-file-id="${Number(raw)}"` : ''}></label>`;
    if (question.questionType === 'ranking') return `<div class="svp-ranking">${options.map(option => `<label><span>${escHtml(option.label)}</span><select data-svp-rank="${id}" data-option-id="${Number(option.id)}"><option value="">—</option>${options.map((_, rank) => `<option value="${rank + 1}" ${Array.isArray(raw) && raw.map(Number).indexOf(Number(option.id)) === rank ? 'selected' : ''}>${rank + 1}</option>`).join('')}</select></label>`).join('')}</div>`;
    if (['allocation', 'token'].includes(question.questionType)) return `<div class="svp-ranking">${options.map(option => `<label><span>${escHtml(option.label)}</span><input type="number" min="0" value="${Number(raw?.[option.id] || 0)}" data-svp-allocation="${id}" data-option-id="${Number(option.id)}"></label>`).join('')}</div>`;
    if (question.questionType === 'matrix') return `<div class="svp-ranking">${options.map(option => `<label><span>${escHtml(option.label)}</span><input value="${escHtml(raw?.[option.id] || '')}" data-svp-matrix="${id}" data-option-id="${Number(option.id)}"></label>`).join('')}</div>`;
    return '<p class="svp-note">รูปแบบคำถามนี้ยังไม่มีตัวควบคุมในหน้าเข้าร่วม</p>';
}

function ballotForm(detail) {
    const questions = detail.questions || [];
    return `<form class="svp-form" data-svp-form novalidate>${state.errors.length ? `<section class="svp-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบคำตอบ</h2><ul>${state.errors.map(error => `<li><a href="#svp-question-${Number(error.questionId)}">${escHtml(error.message)}</a></li>`).join('')}</ul></section>` : ''}${questions.map((question, index) => `<fieldset id="svp-question-${Number(question.id)}" class="svp-question ${isQuestionVisible(question, questions, state.answers) ? '' : 'is-hidden'}" data-svp-question="${Number(question.id)}"><legend>${index + 1}. ${escHtml(question.title)}</legend>${question.helpText ? `<p>${escHtml(question.helpText)}</p>` : ''}<small>${question.isRequired ? 'จำเป็น' : 'ไม่บังคับ'}${isChoiceQuestion(question) ? ` · เลือก ${Number(question.minSelections)}–${Number(question.maxSelections)} รายการ` : ''}</small>${questionControl(question)}</fieldset>`).join('')}</form>`;
}

function workflowForm(campaign) {
    const validation = state.errors.length ? `<section class="svp-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบข้อมูล</h2><ul>${state.errors.map(error => `<li><a href="#svp-question-${Number(error.questionId)}">${escHtml(error.message)}</a></li>`).join('')}</ul></section>` : '';
    if (campaignType(campaign) === 'submission_challenge') return `<form class="svp-form" data-svp-form novalidate>${validation}<section id="svp-question-0" class="svp-question" data-svp-question="0"><h2>ข้อมูลผลงาน</h2><label class="svp-field"><span>ชื่อผลงาน</span><input data-svp-workflow="title" value="${escHtml(state.answers.title || '')}" maxlength="300"></label><label class="svp-field"><span>รายละเอียด</span><textarea data-svp-workflow="description" rows="6" maxlength="10000">${escHtml(state.answers.description || '')}</textarea></label>${state.submissions.length ? `<p class="svp-note">คุณมีผลงานในกิจกรรมนี้ ${state.submissions.length} รายการ ระบบจะไม่สร้างรายการซ้ำระหว่างที่กำลังส่ง</p>` : ''}</section></form>`;
    return `<form class="svp-form" data-svp-form novalidate>${validation}<section id="svp-question-0" class="svp-question" data-svp-question="0"><h2>ข้อมูลการเสนอชื่อ</h2><label class="svp-field"><span>รหัสพนักงานของผู้ถูกเสนอชื่อ</span><input data-svp-workflow="nomineeEmployeeId" value="${escHtml(state.answers.nomineeEmployeeId || '')}" maxlength="20"></label><label class="svp-field"><span>เหตุผลประกอบการเสนอชื่อ</span><textarea data-svp-workflow="statement" rows="6" maxlength="5000">${escHtml(state.answers.statement || '')}</textarea></label></section></form>`;
}

function collectAnswers() {
    const questions = state.detail?.questions || [];
    for (const question of questions) {
        const id = String(question.id);
        if (isChoiceQuestion(question)) state.answers[id] = [...state.page.querySelectorAll(`[data-svp-answer="${id}"]:checked`)].map(input => Number(input.value));
        else if (question.questionType === 'ranking') state.answers[id] = [...state.page.querySelectorAll(`[data-svp-rank="${id}"]`)].filter(input => input.value).sort((a, b) => Number(a.value) - Number(b.value)).map(input => Number(input.dataset.optionId));
        else if (['allocation', 'token'].includes(question.questionType)) state.answers[id] = Object.fromEntries([...state.page.querySelectorAll(`[data-svp-allocation="${id}"]`)].map(input => [input.dataset.optionId, Number(input.value || 0)]));
        else if (question.questionType === 'matrix') state.answers[id] = Object.fromEntries([...state.page.querySelectorAll(`[data-svp-matrix="${id}"]`)].map(input => [input.dataset.optionId, input.value]));
        else if (question.questionType === 'file_upload') state.answers[id] = Number(state.page.querySelector(`[data-svp-answer-file="${id}"]`)?.dataset.fileId || state.answers[id] || 0);
        else state.answers[id] = state.page.querySelector(`[data-svp-answer="${id}"]`)?.value ?? state.answers[id] ?? '';
    }
    state.page.querySelectorAll('[data-svp-workflow]').forEach(input => { state.answers[input.dataset.svpWorkflow] = input.value; });
}

function answerSummary(question) {
    const raw = state.answers[String(question.id)];
    if (isChoiceQuestion(question)) return (raw || []).map(id => question.options.find(option => Number(option.id) === Number(id))?.label).filter(Boolean).join(', ') || 'ยังไม่ได้ตอบ';
    if (question.questionType === 'ranking') return (raw || []).map(id => question.options.find(option => Number(option.id) === Number(id))?.label).filter(Boolean).join(' → ') || 'ยังไม่ได้จัดลำดับ';
    if (['allocation', 'token', 'matrix'].includes(question.questionType)) return Object.entries(raw || {}).map(([id, value]) => `${question.options.find(option => Number(option.id) === Number(id))?.label || id}: ${value}`).join(', ') || 'ยังไม่ได้ตอบ';
    if (question.questionType === 'file_upload') return Number(raw) ? 'แนบไฟล์แล้ว' : 'ยังไม่ได้แนบไฟล์';
    return String(raw ?? '').trim() || 'ยังไม่ได้ตอบ';
}

function reviewMarkup() {
    const campaign = state.detail.campaign, type = campaignType(campaign);
    const rows = isBallotCampaign(campaign)
        ? state.detail.questions.filter(question => isQuestionVisible(question, state.detail.questions, state.answers)).map(question => `<li><strong>${escHtml(question.title)}</strong><span>${escHtml(answerSummary(question))}</span></li>`).join('')
        : type === 'submission_challenge'
            ? `<li><strong>ชื่อผลงาน</strong><span>${escHtml(state.answers.title)}</span></li><li><strong>รายละเอียด</strong><span>${escHtml(state.answers.description)}</span></li>`
            : `<li><strong>รหัสพนักงาน</strong><span>${escHtml(state.answers.nomineeEmployeeId)}</span></li><li><strong>เหตุผล</strong><span>${escHtml(state.answers.statement)}</span></li>`;
    return `<section class="svp-review" aria-labelledby="svp-review-title"><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2 id="svp-review-title">ตรวจคำตอบของคุณอีกครั้ง</h2><ul>${rows}</ul><div class="svp-immutable-warning" role="note"><strong>เมื่อยืนยันแล้วจะแก้ไขไม่ได้</strong><span>${privacyMode(campaign) === 'secret_ballot' ? 'ระบบจะไม่แสดงตัวเลือกในใบรับและไม่สามารถเชื่อมใบรับกลับไปยังบัตรลงคะแนน' : 'ระบบจะบันทึกการเข้าร่วมตามกติกาและสิทธิ์เดิมของกิจกรรม'}</span></div>${state.submitError ? `<div class="svp-submit-error" role="alert"><strong>ยังยืนยันการส่งไม่ได้</strong><span>${escHtml(state.submitError)}</span><small>ระบบไม่ส่งซ้ำอัตโนมัติ คุณสามารถลองส่งซ้ำด้วยรหัสคำขอเดิมหรือกลับไปตรวจสอบรายการ</small></div>` : ''}</section>`;
}

function receiptMarkup() {
    const receipt = state.receipt, secret = privacyMode(state.detail.campaign) === 'secret_ballot';
    return `<section class="svp-receipt" aria-labelledby="svp-receipt-title"><span class="svp-receipt__icon" aria-hidden="true">✓</span><p class="sv-eyebrow">รับข้อมูลแล้ว</p><h2 id="svp-receipt-title">ส่งรายการสำเร็จ</h2><dl><div><dt>เลขอ้างอิง</dt><dd>${escHtml(receipt.receiptCode)}</dd></div><div><dt>เวลาที่รับ</dt><dd>${dateTime(receipt.submittedAt)}</dd></div><div><dt>สถานะ</dt><dd>รับแล้ว · แก้ไขไม่ได้</dd></div></dl><div class="svp-privacy-receipt"><strong>${secret ? 'ใบรับบัตรลงคะแนนลับ' : 'ใบรับการเข้าร่วม'}</strong><p>${secret ? 'ใบรับนี้ยืนยันเฉพาะการรับบัตร ไม่แสดงตัวเลือกและใช้ค้นหาบัตรไม่ได้' : 'เพื่อความเป็นส่วนตัว ใบรับนี้ไม่แสดงคำตอบหรือตัวเลือกที่ส่ง'}</p></div></section>`;
}

function stickyActionMarkup() {
    if (state.mode === 'receipt') return `<footer class="svp-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svp-action="back-list">กลับกิจกรรมของฉัน</button></footer>`;
    if (state.mode === 'review') {
        const draftLocked = campaignType(state.detail?.campaign) === 'submission_challenge' && Boolean(state.workflowDraftId);
        return `<footer class="svp-action-bar">${draftLocked ? '<span class="svp-note">สร้างฉบับร่างแล้ว ระบบจะลองส่งฉบับร่างเดิมโดยไม่สร้างรายการซ้ำ</span>' : '<button type="button" class="sv-button sv-button--secondary" data-svp-action="edit">ย้อนกลับไปแก้ไข</button>'}<button type="button" class="sv-button sv-button--primary" data-svp-action="confirm" ${state.inFlight ? 'disabled' : ''}>${state.submitError ? 'ลองส่งซ้ำอย่างปลอดภัย' : 'ยืนยันส่งรายการ'}</button></footer>`;
    }
    return `<footer class="svp-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svp-action="back-list">กลับกิจกรรมของฉัน</button>${state.detail.canSubmit ? '<button type="button" class="sv-button sv-button--primary" data-svp-action="review">ตรวจคำตอบ</button>' : ''}</footer>`;
}

function renderDetail() {
    clearObjectUrls();
    const detail = state.detail, campaign = detail.campaign, privacy = privacyNotice(campaign), submitted = String(valueOf(detail.participation, 'State', 'state')).toLowerCase() === 'submitted';
    const body = state.mode === 'receipt' ? receiptMarkup() : state.mode === 'review' ? reviewMarkup() : submitted ? `<section class="svp-receipt"><span class="svp-receipt__icon" aria-hidden="true">✓</span><h2>ระบบรับรายการของคุณแล้ว</h2><p>รายการที่ส่งแล้วไม่สามารถแก้ไขได้ ระบบไม่แสดงคำตอบย้อนหลังในหน้านี้</p><dl><div><dt>เวลาที่รับ</dt><dd>${dateTime(valueOf(detail.participation, 'SubmittedAt', 'submittedAt'))}</dd></div></dl></section>` : detail.canSubmit ? (isBallotCampaign(campaign) ? ballotForm(detail) : workflowForm(campaign)) : `<section class="svp-state svp-state--warning" role="status"><h2>กิจกรรมนี้ไม่เปิดรับรายการแล้ว</h2><p>คุณยังดูรายละเอียดและข้อกำหนดความเป็นส่วนตัวได้ แต่ไม่สามารถส่งรายการใหม่</p></section>`;
    state.page.innerHTML = `<div class="svp-shell svp-shell--detail" data-sv-participation="2026-10-08-safety-vote-ux3-r1">${safetyVoteRoleNav({ active: 'user', showJury: state.assignments.length > 0, juryCount: state.assignments.length })}<header class="svp-detail-header"><button type="button" class="sv-icon-button" data-svp-action="back-list" aria-label="กลับกิจกรรมของฉัน">←</button><div><p class="sv-eyebrow">${escHtml(campaign.CampaignCode)}</p><h1>${escHtml(campaign.TitleTh)}</h1><p>${escHtml(campaign.Summary || campaign.Description || '')}</p></div><span class="sv-status-badge sv-status-badge--${campaign.Status === 'Open' ? 'open' : 'closed'}"><span class="sv-status-dot"></span>${escHtml(STATUS_LABELS[campaign.Status] || campaign.Status)}</span></header><section class="svp-meta"><div><strong>${escHtml(CAMPAIGN_TYPE_LABELS[campaignType(campaign)] || campaignType(campaign))}</strong><span>${campaign.CloseAt ? `ปิด ${dateTime(campaign.CloseAt)}` : 'ไม่ระบุเวลาปิด'}</span></div><div class="svp-privacy-notice" role="note"><strong>${escHtml(privacy.title)}</strong><span>${escHtml(privacy.description)}</span></div></section><main class="svp-detail-main" aria-live="polite">${body}</main>${stickyActionMarkup()}</div>`;
    if (isSafetyVoteEngagementV1Enabled() && state.mode === 'edit' && !submitted) state.page.querySelector('.svp-detail-main')?.insertAdjacentHTML('afterbegin', `<section class="svp-campaign-intro" aria-labelledby="svp-campaign-intro-title"><div><p class="sv-eyebrow">ก่อนเข้าร่วม</p><h2 id="svp-campaign-intro-title">รายละเอียดกิจกรรม</h2><p>${escHtml(campaign.Description || campaign.Summary || 'ตรวจสอบข้อมูลและเงื่อนไขก่อนส่งรายการ')}</p></div><dl><div><dt>ผู้จัดกิจกรรม</dt><dd>${escHtml(campaign.OwnerEmployeeID || 'Safety / Admin')}</dd></div><div><dt>ระยะเวลาโดยประมาณ</dt><dd>3–5 นาที</dd></div><div><dt>เปิดกิจกรรม</dt><dd>${dateTime(campaign.OpenAt)}</dd></div><div><dt>ปิดกิจกรรม</dt><dd>${dateTime(campaign.CloseAt)}</dd></div></dl>${campaign.RulesText ? `<details><summary>กติกาและข้อกำหนด</summary><p>${escHtml(campaign.RulesText)}</p></details>` : ''}</section>`);
    state.page.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'user', current: 'participation', campaign, onPage: true }));
    bindDetail(); hydratePrivateImages();
    if (state.errors.length) state.page.querySelector('.svp-validation')?.focus();
}

async function hydratePrivateImages() {
    await Promise.all([...state.page.querySelectorAll('[data-svp-private-file]')].map(async image => {
        try { const response = await API.get(`/safety-vote/files/${Number(image.dataset.svpPrivateFile)}`), url = URL.createObjectURL(await response.blob()); state.objectUrls.add(url); image.src = url; }
        catch (_) { image.closest('.svp-gallery-trigger')?.remove(); }
    }));
}

function openGallery(button) {
    const source = button.querySelector('img'); if (!source?.src) return;
    const restore = document.activeElement, host = document.createElement('div');
    host.className = 'svp-gallery'; host.dataset.svpGallery = '';
    host.innerHTML = `<div class="svp-gallery__backdrop" data-svp-gallery-close></div><section role="dialog" aria-modal="true" aria-labelledby="svp-gallery-title"><div><h2 id="svp-gallery-title">${escHtml(button.dataset.svpAlt || 'ภาพตัวเลือก')}</h2><button type="button" class="sv-icon-button" data-svp-gallery-close aria-label="ปิดภาพ">×</button></div><img src="${escHtml(source.src)}" alt="${escHtml(button.dataset.svpAlt || '')}"></section>`;
    document.body.appendChild(host);
    const close = () => { host.remove(); if (restore?.isConnected) restore.focus(); };
    host.querySelectorAll('[data-svp-gallery-close]').forEach(node => node.addEventListener('click', close));
    host.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } if (event.key === 'Tab') { event.preventDefault(); host.querySelector('button')?.focus(); } });
    host.querySelector('button')?.focus();
}

function validateWorkflow() {
    const type = campaignType(state.detail.campaign), errors = [];
    if (type === 'submission_challenge') {
        if (!String(state.answers.title || '').trim()) errors.push({ questionId: 0, message: 'กรุณาระบุชื่อผลงาน' });
        if (!String(state.answers.description || '').trim()) errors.push({ questionId: 0, message: 'กรุณาระบุรายละเอียดผลงาน' });
    } else {
        if (!String(state.answers.nomineeEmployeeId || '').trim()) errors.push({ questionId: 0, message: 'กรุณาระบุรหัสพนักงานของผู้ถูกเสนอชื่อ' });
        if (!String(state.answers.statement || '').trim()) errors.push({ questionId: 0, message: 'กรุณาระบุเหตุผลประกอบการเสนอชื่อ' });
    }
    return errors;
}

function requestReview() {
    collectAnswers();
    state.errors = isBallotCampaign(state.detail.campaign) ? validateParticipation(state.detail.questions, state.answers) : validateWorkflow();
    if (state.errors.length) { renderDetail(); return; }
    state.mode = 'review'; state.submitError = null;
    if (!state.requestKey && isBallotCampaign(state.detail.campaign)) state.requestKey = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}-safety-vote-ux3`;
    renderDetail();
}

async function submitParticipation() {
    if (state.inFlight) return;
    state.inFlight = true; state.submitError = null; renderDetail();
    const campaign = state.detail.campaign, id = Number(campaign.id), type = campaignType(campaign);
    try {
        if (isBallotCampaign(campaign)) {
            const response = await API.post(`/safety-vote/campaigns/${id}/ballot/submit`, buildBallotPayload(state.detail, state.answers), { headers: { 'Idempotency-Key': state.requestKey } });
            state.receipt = safeReceipt({ campaign, receiptCode: response.data.receiptCode, replayed: response.data.replayed });
        } else if (type === 'submission_challenge') {
            if (!state.workflowDraftId) { const created = await API.post(`/safety-vote/campaigns/${id}/submissions`, { title: state.answers.title, description: state.answers.description }); state.workflowDraftId = Number(created.data.id); state.workflowReference = created.data.submissionCode; }
            await API.post(`/safety-vote/campaigns/${id}/submissions/${state.workflowDraftId}/submit`, {});
            state.receipt = safeReceipt({ campaign, receiptCode: state.workflowReference || `SUBMISSION-${state.workflowDraftId}` });
        } else {
            const response = await API.post(`/safety-vote/campaigns/${id}/nominations`, { nomineeEmployeeId: state.answers.nomineeEmployeeId, statement: state.answers.statement });
            state.receipt = safeReceipt({ campaign, receiptCode: `NOMINATION-${Number(response.data.id)}` });
        }
        state.mode = 'receipt'; state.inFlight = false; state.submitError = null;
        showToast('ระบบรับรายการของคุณแล้ว', 'success'); renderDetail();
    } catch (error) {
        state.inFlight = false;
        if (error?.code === 'BALLOT_ALREADY_SUBMITTED' || error?.code === 'NOMINATION_DUPLICATE') { await openCampaign(Number(campaign.id)); return; }
        state.submitError = error?.message || 'ระบบยังยืนยันการรับรายการไม่ได้'; state.mode = 'review'; renderDetail();
    }
}

function confirmSubmit() {
    const secret = privacyMode(state.detail.campaign) === 'secret_ballot';
    openSafetyVoteConfirmDialog({ title: 'ยืนยันส่งรายการแบบถาวร', description: secret ? 'เมื่อยืนยันแล้วจะแก้ไขไม่ได้ ระบบจะออกใบรับที่ไม่แสดงตัวเลือกและไม่สามารถค้นหาบัตรลงคะแนนจากใบรับได้' : 'เมื่อยืนยันแล้วจะแก้ไขไม่ได้ กรุณาตรวจคำตอบและข้อมูลกิจกรรมให้ครบก่อนส่ง', confirmLabel: 'ยืนยันและส่ง', onConfirm: submitParticipation });
}

function bindList() {
    bindRoleNavigation();
    state.page.querySelector('[data-svp-search]')?.addEventListener('input', event => { state.query = event.target.value; renderList(); requestAnimationFrame(() => { const input = state.page.querySelector('[data-svp-search]'); input?.focus(); input?.setSelectionRange(state.query.length, state.query.length); }); });
    state.page.querySelectorAll('[data-svp-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.svpView; renderList(); }));
    state.page.querySelectorAll('[data-svp-campaign]').forEach(button => button.addEventListener('click', () => openCampaign(Number(button.dataset.svpCampaign))));
    state.page.querySelector('[data-sv-role-link="jury"]')?.addEventListener('click', event => { event.preventDefault(); loadSafetyVoteJuryWorkspace({ page: state.page, onUser: load }); });
    state.page.querySelectorAll('[data-svp-jury]').forEach(button => button.addEventListener('click', () => loadSafetyVoteJuryWorkspace({ page: state.page, initialAssignmentId: Number(button.dataset.svpJury), onUser: load })));
    state.page.querySelector('[data-svp-promotion-prev]')?.addEventListener('click', () => { state.promotionIndex = (state.promotionIndex - 1 + state.promotions.length) % state.promotions.length; renderList(); });
    state.page.querySelector('[data-svp-promotion-next]')?.addEventListener('click', () => { state.promotionIndex = (state.promotionIndex + 1) % state.promotions.length; renderList(); });
    state.page.querySelectorAll('[data-svp-scroll]').forEach(button => button.addEventListener('click', () => state.page.querySelector('#svp-consent-title')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })));
    state.page.querySelectorAll('[data-svp-notification]').forEach(button => button.addEventListener('click', async () => { const id = Number(button.dataset.svpNotification), item = state.notificationCenter.find(row => Number(row.id) === id); if (item && !item.readAt) { try { await API.post(`/safety-vote/notification-center/${id}/read`, {}); item.readAt = new Date().toISOString(); } catch (_) {} } const campaignId = Number(button.dataset.campaignId); if (state.campaigns.some(row => Number(row.id) === campaignId)) openCampaign(campaignId); else renderList(); }));
    state.page.querySelector('[data-svp-read-all]')?.addEventListener('click', async () => { try { await API.post('/safety-vote/notification-center/read-all', {}); state.notificationCenter.forEach(item => { if (!item.readAt) item.readAt = new Date().toISOString(); }); renderList(); showToast('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด', 'success'); } catch (error) { showToast(error?.message || 'ปรับสถานะการแจ้งเตือนไม่สำเร็จ', 'error'); } });
    state.page.querySelectorAll('[data-svp-consent]').forEach(button => button.addEventListener('click', () => openSafetyVoteConfirmDialog({ title: button.dataset.accepted === 'true' ? 'ยืนยันการยินยอม' : 'ยืนยันการปฏิเสธ', description: 'ระบบจะบันทึกคำตอบตามรายการเสนอชื่อและสิทธิ์เดิม', confirmLabel: 'ยืนยัน', onConfirm: async () => { await API.post(`/safety-vote/nominations/${Number(button.dataset.svpConsent)}/consent`, { accepted: button.dataset.accepted === 'true' }); await load(); } })));
    state.page.querySelector('[data-svp-action="retry-load"]')?.addEventListener('click', load);
}

function bindDetail() {
    bindRoleNavigation();
    state.page.querySelectorAll('[data-svp-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.svpAction;
        if (action === 'back-list') { if (/^#safety-vote=/.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#safety-vote`); state.screen = 'list'; state.detail = null; state.answers = {}; state.receipt = null; state.requestKey = ''; renderList(); }
        else if (action === 'review') requestReview();
        else if (action === 'edit') { state.mode = 'edit'; state.submitError = null; if (isBallotCampaign(state.detail.campaign)) state.requestKey = ''; renderDetail(); }
        else if (action === 'confirm') confirmSubmit();
    }));
    state.page.querySelectorAll('[data-svp-answer],[data-svp-rank],[data-svp-allocation],[data-svp-matrix],[data-svp-workflow]').forEach(input => input.addEventListener('change', () => { collectAnswers(); state.page.querySelectorAll('[data-svp-question]').forEach(fieldset => { const question = state.detail.questions.find(item => Number(item.id) === Number(fieldset.dataset.svpQuestion)); fieldset.classList.toggle('is-hidden', !isQuestionVisible(question, state.detail.questions, state.answers)); }); }));
    state.page.querySelectorAll('[data-svp-answer-file]').forEach(input => input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file || state.inFlight) return; input.disabled = true;
        try { const form = new FormData(); form.append('file', file); const response = await API.upload(`/safety-vote/campaigns/${Number(state.detail.campaign.id)}/questions/${Number(input.dataset.svpAnswerFile)}/files`, form); input.dataset.fileId = String(response.data.id); state.answers[input.dataset.svpAnswerFile] = Number(response.data.id); showToast('แนบไฟล์คำตอบแล้ว', 'success'); }
        catch (_) { state.errors = [{ questionId: Number(input.dataset.svpAnswerFile), message: 'แนบไฟล์ไม่สำเร็จ กรุณาตรวจสอบชนิดและขนาดไฟล์' }]; renderDetail(); }
        finally { input.disabled = false; }
    }));
    state.page.querySelectorAll('[data-svp-file]').forEach(button => button.addEventListener('click', () => openGallery(button)));
}

async function openCampaign(id) {
    state.screen = 'detail'; state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.errors = []; state.answers = {}; state.receipt = null; state.requestKey = ''; state.workflowDraftId = null; state.workflowReference = ''; state.submitError = null;
    state.page.innerHTML = loadingMarkup();
    try {
        const response = await API.get(`/safety-vote/campaigns/${id}`);
        state.detail = response.data; state.mode = 'edit'; state.loading = false;
        if (campaignType(state.detail.campaign) === 'submission_challenge') { const submissions = await API.get(`/safety-vote/campaigns/${id}/my-submissions`, { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } })); state.submissions = submissions.data.rows || []; }
        renderDetail();
    } catch (error) {
        state.loading = false; state.denied = error?.code === 'CAMPAIGN_NOT_ELIGIBLE' || Number(error?.status) === 403; state.error = state.denied ? null : error; state.screen = 'list'; render();
    }
}

function render() {
    if (state.loading) { state.page.innerHTML = loadingMarkup(); return; }
    if (state.denied || state.moduleDisabled || state.error) { state.page.innerHTML = stateMarkup(); bindList(); return; }
    if (state.screen === 'detail' && state.detail) renderDetail(); else renderList();
}

async function load() {
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.screen = 'list'; render();
    try {
        const [campaigns, nominations, assignments, notifications] = await Promise.all([
            API.get('/safety-vote/me/campaigns', { suppressErrorLog: true }),
            API.get('/safety-vote/me/nominations', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } })),
            API.get('/safety-vote/jury/assignments', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } })),
            API.get('/safety-vote/notifications', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } }))
        ]);
        state.campaigns = campaigns.data.rows || []; state.nominations = nominations.data.rows || []; state.assignments = assignments.data.rows || []; state.notifications = notifications.data.rows || [];
        state.promotions = []; state.notificationCenter = []; state.promotionIndex = 0;
        if (isSafetyVoteEngagementV1Enabled()) {
            const [promotions, center] = await Promise.all([
                API.get('/safety-vote/me/promotions', { suppressErrorLog: true }).catch(error => ['SAFETY_VOTE_ENGAGEMENT_DISABLED', 'SAFETY_VOTE_ENGAGEMENT_SETUP_REQUIRED'].includes(error?.code) ? ({ data: { rows: [] } }) : Promise.reject(error)),
                API.get('/safety-vote/notification-center', { suppressErrorLog: true }).catch(error => ['SAFETY_VOTE_ENGAGEMENT_DISABLED', 'SAFETY_VOTE_ENGAGEMENT_SETUP_REQUIRED'].includes(error?.code) ? ({ data: { rows: [] } }) : Promise.reject(error))
            ]);
            state.promotions = promotions.data?.rows || [];
            state.notificationCenter = center.data?.rows || [];
        }
    } catch (error) {
        state.moduleDisabled = error?.code === 'SAFETY_VOTE_MODULE_DISABLED';
        state.denied = !state.moduleDisabled && (error?.code === 'PERMISSION_DENIED' || Number(error?.status) === 403);
        state.error = state.moduleDisabled || state.denied ? null : error; state.campaigns = [];
    } finally {
        state.loading = false;
        const sharedCode = /^#safety-vote=([A-Za-z0-9-]{1,40})$/.exec(location.hash)?.[1];
        const sharedCampaign = sharedCode ? state.campaigns.find(row => String(row.CampaignCode || '').toUpperCase() === decodeURIComponent(sharedCode).toUpperCase()) : null;
        if (sharedCampaign && !state.moduleDisabled && !state.denied && !state.error) await openCampaign(Number(sharedCampaign.id));
        else render();
    }
}

export async function loadSafetyVotePage() {
    if (!isSafetyVoteUxV1Enabled()) return loadLegacySafetyVotePage();
    state.page = document.getElementById('safety-vote-page'); if (!state.page) return;
    await load();
}
