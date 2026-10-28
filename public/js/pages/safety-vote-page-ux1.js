import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { loadSafetyVotePage as loadLegacySafetyVotePage } from './safety-vote.js?v=20261020-safety-vote-duplicate-media-r3';
import { isSafetyVoteUxV1Enabled, isSafetyVoteEngagementV1Enabled, openSafetyVoteConfirmDialog, safetyVoteJourneyNav, safetyVoteRoleNav } from './safety-vote-ux-components.js?v=20261015-safety-vote-preview-gallery-r1';
import { bindSafetyVoteImageGallery } from './safety-vote-image-gallery.js?v=20261027-safety-vote-jury-work-media-r1';
import { formatThaiDateTime } from './safety-vote-time.mjs?v=20261015-safety-vote-thai-time-r1';
import { loadSafetyVoteJuryWorkspace } from './safety-vote-jury-workspace.js?v=20261028-safety-vote-jury-assignment-ux-r1';
import { clearLiveResultImages, hydrateLiveResultImages, liveResultsMarkup } from './safety-vote-live-results.js?v=20261020-safety-vote-duplicate-media-r3';
import { hydrateSafetyVoteImages, releaseSafetyVoteImages } from '../utils/safety-vote-auth-image.js?v=20261020-safety-vote-duplicate-media-r3';
import { bindSafetyVotePeoplePickers, safetyVotePeoplePickerMarkup } from './safety-vote-people-picker.js?v=20261024-safety-vote-people-picker-r1';
import {
    CAMPAIGN_TYPE_LABELS, PRIVACY_LABELS, buildBallotPayload, campaignMatchesView, campaignType, filterCampaigns,
    isBallotCampaign, isChoiceQuestion, isQuestionVisible, participationState, privacyMode,
    privacyNotice, safeReceipt, validateParticipation, valueOf
} from './safety-vote-participation-model.mjs?v=20261025-safety-vote-final-phase7-r1';

const questionControlBase=questionControl;
questionControl=function questionControlWithImage(question){
    const fileId=Number(question.imageFileId||0),label=question.imageAltText||question.title||'ภาพประกอบคำถาม';
    const image=fileId?`<button type="button" class="svp-gallery-trigger svp-question-image" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="question-cover-${Number(question.id)}" data-sv-gallery-label="${escHtml(label)}" aria-label="ขยายภาพ ${escHtml(label)}"><img data-svp-private-file="${fileId}" data-sv-auth-file="${fileId}" alt="${escHtml(label)}" decoding="async"></button>`:'';
    return image+questionControlBase(question);
};

const VIEW_LABELS = { all: 'ทั้งหมด', open: 'เข้าร่วมได้', upcoming: 'เร็ว ๆ นี้', submitted: 'ส่งแล้ว', closed: 'สิ้นสุดแล้ว' };
VIEW_LABELS.read_only = 'ดูรายละเอียด';
VIEW_LABELS.results = 'ดูผลกิจกรรม';
const STATUS_LABELS = { Draft: 'ประกาศล่วงหน้า · ยังไม่เปิดลงคะแนน', Scheduled: 'เผยแพร่แล้ว · ยังไม่เปิดลงคะแนน', Open: 'เปิดรับการเข้าร่วม', Closed: 'ปิดรับแล้ว', Certified: 'รับรองผลแล้ว', Published: 'ประกาศผลแล้ว' };
const ELIGIBILITY_LABELS = {
    initial_snapshot: ['มีสิทธิ์เข้าร่วม', 'รายชื่อผู้มีสิทธิ์ตั้งแต่เริ่มแคมเปญ'],
    automatic_rule_match: ['ได้รับสิทธิ์อัตโนมัติ', 'ระบบเพิ่มสิทธิ์ให้เมื่อข้อมูลตรงตามเงื่อนไข'],
    admin_amendment: ['แอดมินเพิ่มสิทธิ์ให้', 'ผู้ดูแลระบบเพิ่มสิทธิ์ภายหลังแบบมีประวัติตรวจสอบ'],
    public_listing: ['ดูรายละเอียดเท่านั้น', 'แคมเปญแสดงในรายการสาธารณะ แต่บัญชีนี้ไม่มีสิทธิ์ลงคะแนน']
};
const state = {
    page: null, campaigns: [], detail: null, assignments: [], nominations: [], notifications: [], notificationCenter: [], promotions: [], promotionHistory: [], promotionIndex: 0, submissions: [],
    view: 'all', query: '', screen: 'list', mode: 'edit', newAttempt: false, answers: {}, errors: [], receipt: null,
    loading: true, error: null, denied: false, moduleDisabled: false, inFlight: false, requestKey: '',
    workflowDraftId: null, workflowReference: '', submissionGallery: [], submitError: null, objectUrls: new Set(), trackedPromotionEvents: new Set(),
    liveView: false, liveResults: null, liveError: null, liveInFlight: false, livePaused: false, liveTimer: null, liveCountdownTimer: null, liveAbort: null, liveFailures: 0, liveVisibilityHandler: null,
    discoveryRefreshing: false, discoveryRefreshHandler: null, notificationsExpanded: false, catalogueMode: 'legacy_discovery',
    peopleLabels: {}, peoplePickerCleanup: null, officialResults: null, publicWorks: []
};

function trackPromotionEvent(promotionId, eventType) {
    if (!isSafetyVoteEngagementV1Enabled() || !promotionId) return;
    const key = `${Number(promotionId)}:${eventType}`;
    if (state.trackedPromotionEvents.has(key)) return;
    state.trackedPromotionEvents.add(key);
    API.post(`/safety-vote/engagement/promotions/${Number(promotionId)}/events`, { eventType }, { suppressErrorLog: true }).catch(() => state.trackedPromotionEvents.delete(key));
}

function bindRoleNavigation() {
    state.page.querySelector('[data-sv-role-link="admin"]')?.addEventListener('click', () => {
        window._saveTab?.('admin', 'safety-vote-foundation');
    });
}

function promotionForCampaign(campaignId) {
    return state.promotions.find(item => Number(item.campaignId) === Number(campaignId)) || null;
}

function eligibilityBadgeMarkup(source, { eligible = false, discoveryOnly = false } = {}) {
    let origin = String(source || '').trim().toLowerCase();
    if (!ELIGIBILITY_LABELS[origin]) origin = discoveryOnly ? 'public_listing' : eligible ? 'initial_snapshot' : '';
    if (!origin) return '';
    const [label, description] = ELIGIBILITY_LABELS[origin];
    return `<b class="svp-auto-eligibility-chip svp-eligibility-chip is-${origin}" title="${escHtml(description)}">${escHtml(label)}</b>`;
}

function promotionImageMarkup(fileId, desktopFileId, altText = '') {
    return `<span class="svp-auth-media__status" role="status"><span aria-hidden="true"></span><span data-sv-auth-status>กำลังโหลดภาพ…</span></span><img class="svp-auth-image" data-svp-promotion-file="${Number(fileId)}" data-desktop-file="${Number(desktopFileId || fileId)}" data-sv-auth-file="${Number(fileId)}" alt="${escHtml(altText)}" decoding="async">`;
}

function promotionBannerMarkup() {
    if (!isSafetyVoteEngagementV1Enabled() || !state.promotions.length) return '';
    const index = Math.min(state.promotionIndex, state.promotions.length - 1), item = state.promotions[index], fileId = item.mobileFileId || item.desktopFileId;
    const cta = `<button type="button" class="sv-button sv-button--primary" data-svp-campaign="${Number(item.campaignId)}" data-svp-promotion-cta="${Number(item.id)}">${escHtml(item.ctaLabel || 'ดูรายละเอียด')}</button>`;
    return `<section class="svp-promotion" aria-roledescription="carousel" aria-label="กิจกรรมประชาสัมพันธ์"><article aria-label="${index + 1} จาก ${state.promotions.length}" ${fileId ? 'data-svp-media-state="loading" aria-busy="true"' : ''}>${fileId ? promotionImageMarkup(fileId, item.desktopFileId, item.altText) : '<div class="svp-promotion__fallback" aria-hidden="true">Safety Vote</div>'}<div class="svp-promotion__shade"><p class="sv-eyebrow">กิจกรรมแนะนำ</p><h2>${escHtml(item.titleTh)}</h2><p>${escHtml(item.subtitleTh || item.campaignTitle || '')}</p>${cta}</div></article>${state.promotions.length > 1 ? `<div class="svp-promotion__controls"><button type="button" class="sv-icon-button" data-svp-promotion-prev aria-label="ป้ายก่อนหน้า">←</button><span>${index + 1}/${state.promotions.length}</span><button type="button" class="sv-icon-button" data-svp-promotion-next aria-label="ป้ายถัดไป">→</button></div>` : ''}</section>`;
}

function promotionHistoryMarkup() {
    if (!isSafetyVoteEngagementV1Enabled() || !state.promotionHistory.length) return '';
    return `<section class="svp-aux svp-promotion-history" aria-labelledby="svp-promotion-history-title"><div><p class="sv-eyebrow">ประวัติกิจกรรม</p><h2 id="svp-promotion-history-title">ป้ายกิจกรรมที่ผ่านมา</h2><p>ป้ายที่หมดเวลาแล้วยังคงแสดงเป็นประวัติ และเปิดรายละเอียดได้เมื่อแคมเปญเผยแพร่</p></div><div class="svp-card-grid">${state.promotionHistory.map(item => { const fileId = item.mobileFileId || item.desktopFileId, campaignVisible = state.campaigns.some(campaign => Number(campaign.id) === Number(item.campaignId)), detailAvailable = campaignVisible || ['Scheduled', 'Open', 'Closed', 'Certified', 'Published'].includes(item.campaignStatus); return `<button type="button" class="svp-campaign-card" ${detailAvailable ? `data-svp-campaign="${Number(item.campaignId)}"` : 'disabled aria-disabled="true"'}><span class="svp-campaign-card__cover" ${fileId ? 'data-svp-media-state="loading" aria-busy="true"' : ''}>${fileId ? promotionImageMarkup(fileId, item.desktopFileId, item.altText) : '<span class="svp-campaign-card__cover--fallback" aria-hidden="true">SV</span>'}</span><span class="svp-campaign-card__top"><span class="sv-status-badge sv-status-badge--closed"><span class="sv-status-dot"></span>สิ้นสุดแล้ว</span><span>${dateTime(item.endAt)}</span></span><strong>${escHtml(item.titleTh || item.campaignTitle || 'กิจกรรมที่ผ่านมา')}</strong><p>${escHtml(item.subtitleTh || item.campaignTitle || '')}</p><small>${escHtml(item.campaignCode || '')} · ${detailAvailable ? 'เปิดดูรายละเอียด' : 'รายละเอียดล่วงหน้าสิ้นสุดแล้ว'}</small></button>`; }).join('')}</div></section>`;
}

function taskStripMarkup() {
    if (!isSafetyVoteEngagementV1Enabled()) return '';
    const open = state.campaigns.filter(item => participationState(item) === 'open' && Number(item.DiscoveryOnly || 0) !== 1), pending = state.nominations.filter(item => String(valueOf(item, 'ConsentState', 'consentState')) === 'pending'), jury = state.assignments.filter(item => !['submitted', 'recused'].includes(String(valueOf(item, 'Status', 'status')).toLowerCase()));
    const total = open.length + pending.length + jury.length;
    return `<section class="svp-my-tasks" aria-labelledby="svp-my-tasks-title"><div><p class="sv-eyebrow">รายการส่วนตัว</p><h2 id="svp-my-tasks-title">สิ่งที่คุณต้องทำ</h2><p>${total ? `มี ${total} รายการที่รอดำเนินการ` : 'ขณะนี้ไม่มีรายการที่ต้องดำเนินการ'}</p></div><div class="svp-my-tasks__grid">${open.length ? `<button type="button" data-svp-campaign="${Number(open[0].id)}"><strong>${open.length}</strong><span>กิจกรรมที่เข้าร่วมได้</span></button>` : ''}${pending.length ? `<button type="button" data-svp-scroll="consent"><strong>${pending.length}</strong><span>คำเสนอชื่อรอยืนยัน</span></button>` : ''}${jury.length ? `<button type="button" data-svp-jury="${Number(jury[0].id)}"><strong>${jury.length}</strong><span>งานประเมิน</span></button>` : ''}${!total ? '<span class="svp-my-tasks__done">✓ คุณจัดการรายการทั้งหมดแล้ว</span>' : ''}</div></section>`;
}

function notificationCenterMarkup() {
    if (!isSafetyVoteEngagementV1Enabled() || !state.notificationCenter.length) return '';
    const unread = state.notificationCenter.filter(item => !item.readAt);
    const eventLabels = { announcement: 'ประกาศ', reminder: 'เตือนเข้าร่วม', closing_soon: 'ใกล้ปิดกิจกรรม', closing: 'ใกล้ปิดกิจกรรม', campaign_update: 'อัปเดตกิจกรรม', eligibility_granted: 'ได้รับสิทธิ์ใหม่' };
    const visible = state.notificationsExpanded ? state.notificationCenter.slice(0, 20) : state.notificationCenter.slice(0, 5);
    return `<section class="svp-notification-center" aria-labelledby="svp-notification-center-title"><div class="svp-notification-center__heading"><div><p class="sv-eyebrow">กล่องข้อความ${unread.length ? ` · ยังไม่อ่าน ${unread.length}` : ''}</p><h2 id="svp-notification-center-title">การแจ้งเตือน Safety Vote</h2><p>แสดงเฉพาะข้อความที่ระบบส่งถึงบัญชีของคุณแล้ว</p></div>${unread.length ? `<button type="button" class="sv-button sv-button--secondary" data-svp-read-all>อ่านทั้งหมด</button>` : ''}</div><div class="svp-notification-center__list">${visible.map(item => `<article class="${item.readAt ? '' : 'is-unread'}"><button type="button" data-svp-notification="${Number(item.id)}" data-campaign-id="${Number(item.campaignId)}"><strong>${escHtml(item.metadata?.title || item.campaignTitle || 'Safety Vote')}</strong><span>${escHtml(item.metadata?.message || 'มีข้อมูลใหม่ในกิจกรรมนี้')}</span><small>${escHtml(eventLabels[item.eventType] || 'แจ้งเตือน')} · ${dateTime(item.dispatchedAt)}${item.readAt ? ' · อ่านแล้ว' : ' · ยังไม่อ่าน'}</small></button></article>`).join('')}</div>${state.notificationCenter.length > 5 ? `<button type="button" class="svp-notification-center__more" data-svp-notification-more>${state.notificationsExpanded ? 'แสดงเฉพาะรายการล่าสุด' : `ดูทั้งหมด ${Math.min(20, state.notificationCenter.length)} รายการ`}</button>` : ''}</section>`;
}

function automaticEligibilityNoticeMarkup() {
    const item = state.notificationCenter.find(row => row.eventType === 'eligibility_granted' && !row.readAt);
    if (!item) return '';
    const campaign = state.campaigns.find(row => Number(row.id) === Number(item.campaignId));
    const canParticipate = Boolean(campaign && Number(campaign.VotingWindowOpen) === 1);
    return `<section class="svp-eligibility-granted" role="status" aria-live="polite"><span class="svp-eligibility-granted__icon" aria-hidden="true">✓</span><div><p class="sv-eyebrow">ได้รับสิทธิ์ใหม่</p><h2>${escHtml(item.metadata?.title || 'คุณได้รับสิทธิ์เข้าร่วมแคมเปญแล้ว')}</h2><p>${escHtml(item.metadata?.message || 'ข้อมูลของคุณตรงตามเงื่อนไขของแคมเปญ ระบบเพิ่มสิทธิ์ให้โดยอัตโนมัติแล้ว')}</p><small>ระบบแจ้งเฉพาะผลการตรวจสิทธิ์ และไม่เปิดเผยรายละเอียดกฎหรือข้อมูลส่วนบุคคลที่ใช้ตรวจสอบ</small></div><button type="button" class="sv-button sv-button--primary" data-svp-notification="${Number(item.id)}" data-campaign-id="${Number(item.campaignId)}">${canParticipate ? 'เปิดแคมเปญและโหวต' : 'ดูรายละเอียดแคมเปญ'}</button></section>`;
}

function clearObjectUrls(preserveSubmissionPreviews = false) {
    if (state.page) releaseSafetyVoteImages(state.page);
    if (preserveSubmissionPreviews) return;
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
}

function stopLivePolling() {
    clearTimeout(state.liveTimer); clearInterval(state.liveCountdownTimer); state.liveTimer = null; state.liveCountdownTimer = null;
    state.liveAbort?.abort(); state.liveAbort = null; state.liveInFlight = false;
    if (state.liveVisibilityHandler) document.removeEventListener('visibilitychange', state.liveVisibilityHandler);
    state.liveVisibilityHandler = null;
    if (state.page) clearLiveResultImages(state.page);
}

function scheduleLivePolling() {
    clearTimeout(state.liveTimer); clearInterval(state.liveCountdownTimer);
    if (!state.liveView || state.livePaused || document.hidden || !state.detail) return;
    const base = Math.max(10, Math.min(60, Number(state.liveResults?.config?.refreshSeconds || state.detail.campaign?.LiveLeaderboardRefreshSeconds || 15)));
    const delay = Math.min(60, base * Math.max(1, 2 ** state.liveFailures)); let remaining = delay;
    const tick = () => { remaining = Math.max(0, remaining - 1); const node = state.page?.querySelector('[data-sv-live-countdown]'); if (node) node.textContent = String(remaining); if (remaining > 0) state.liveCountdownTimer = setTimeout(tick, 1000); };
    state.liveCountdownTimer = setTimeout(tick, 1000);
    state.liveTimer = setTimeout(() => loadLiveResults(false), delay * 1000);
}

async function loadLiveResults(manual = true) {
    if (state.liveInFlight || !state.detail) return;
    state.liveInFlight = true; state.liveAbort = new AbortController(); updateUserLivePanel();
    try { const response = await API.get(`/safety-vote/campaigns/${Number(state.detail.campaign.id)}/live-results`, { suppressErrorLog: true, signal: state.liveAbort.signal }); state.liveResults = response.data; state.liveError = null; state.liveFailures = 0; }
    catch (error) { if (error?.name !== 'AbortError') { state.liveError = error; state.liveFailures = Math.min(2, state.liveFailures + 1); } }
    finally { state.liveInFlight = false; state.liveAbort = null; updateUserLivePanel(); if (!manual || !state.livePaused) scheduleLivePolling(); }
}

function updateUserLivePanel() {
    const panel = state.page?.querySelector('[data-svp-live-panel]'); if (!panel) return;
    panel.innerHTML = liveResultsMarkup(state.liveResults, { error: state.liveError, loading: state.liveInFlight && !state.liveResults, paused: state.livePaused });
    bindSafetyVoteImageGallery(panel); hydrateLiveResultImages(panel);
}

function startUserLivePolling() {
    if (!state.liveVisibilityHandler) {
        state.liveVisibilityHandler = () => { if (document.hidden) { clearTimeout(state.liveTimer); clearInterval(state.liveCountdownTimer); state.liveAbort?.abort(); } else if (state.liveView && !state.livePaused) loadLiveResults(false); };
        document.addEventListener('visibilitychange', state.liveVisibilityHandler);
    }
    loadLiveResults(false);
}

function dateTime(value) {
    return formatThaiDateTime(value, 'ไม่ระบุเวลา');
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
    const attemptCount = Math.max(0, Number(campaign.AttemptCount || 0));
    const maxAttempts = Math.max(1, Number(campaign.MaxParticipationAttempts || 1));
    const attemptStatus = attemptCount > 0 ? `ทำแล้ว ${Math.min(attemptCount, maxAttempts)}/${maxAttempts} ครั้ง${attemptCount < maxAttempts && campaign.VotingWindowOpen ? ` · ทำได้อีก ${maxAttempts - attemptCount} ครั้ง` : ''}` : `ทำได้สูงสุด ${maxAttempts} ครั้ง`;
    const discoveryOnly = Number(campaign.DiscoveryOnly || 0) === 1;
    const accessStatus = discoveryOnly ? 'ดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน' : attemptStatus;
    const eligibilityBadge = eligibilityBadgeMarkup(campaign.EligibilityOrigin, { eligible: Number(campaign.Eligible || 0) === 1, discoveryOnly });
    return `<button type="button" class="svp-campaign-card" data-svp-campaign="${Number(campaign.id)}" data-svp-status="${escHtml(campaign.Status || '')}">${fileId ? `<span class="svp-campaign-card__cover" data-svp-media-state="loading" aria-busy="true">${promotionImageMarkup(fileId, promotion.desktopFileId, promotion.altText)}</span>` : `<span class="svp-campaign-card__cover svp-campaign-card__cover--fallback" aria-hidden="true">${escHtml((CAMPAIGN_TYPE_LABELS[type] || 'Safety Vote').slice(0, 2))}</span>`}<span class="svp-campaign-card__top"><span class="sv-status-badge sv-status-badge--${stateKey === 'open' ? 'open' : stateKey === 'submitted' ? 'published' : 'closed'}"><span class="sv-status-dot"></span>${stateKey === 'submitted' ? 'ส่งแล้ว' : escHtml(STATUS_LABELS[campaign.Status] || campaign.Status)}</span><span>${closingSoon ? '<b class="svp-deadline-chip">ใกล้ปิด</b>' : escHtml(PRIVACY_LABELS[privacy] || privacy)}</span></span>${eligibilityBadge}<strong>${escHtml(campaign.TitleTh || 'ไม่มีชื่อกิจกรรม')}</strong><span>${escHtml(CAMPAIGN_TYPE_LABELS[type] || type)} · ${accessStatus}</span><p>${escHtml(campaign.Summary || 'เปิดดูรายละเอียดและเงื่อนไขก่อนเข้าร่วม')}</p><small>${campaign.CloseAt ? `ปิด ${dateTime(campaign.CloseAt)}` : 'ตรวจสอบกำหนดการในรายละเอียด'}</small></button>`;
}

function optionMedia(option) {
    return (option.media || []).map(item => `<a class="svp-option-media-link" href="${escHtml(item.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" aria-label="${item.mediaType === 'video' ? 'เปิดวิดีโอ' : 'เปิดลิงก์'} ${escHtml(item.title || option.label || '')}">${item.mediaType === 'video' ? '▶ วิดีโอ' : '↗ ลิงก์'}${item.title ? ` · ${escHtml(item.title)}` : ''}</a>`).join('');
}

function juryAssignmentMeta(item = {}) {
    const status = String(valueOf(item, 'Status', 'status') || 'Draft').toLowerCase();
    const scoreCount = Math.max(0, Number(valueOf(item, 'ScoreCount', 'scoreCount') || 0));
    const expectedCount = Math.max(0, Number(valueOf(item, 'ExpectedScoreCount', 'expectedScoreCount') || 0));
    const stageName = String(valueOf(item, 'StageName', 'stageName') || 'รอบประเมิน');
    if (status === 'submitted') return { label: 'ส่งผลประเมินแล้ว', action: 'ดูผลที่ส่งแล้ว', progress: expectedCount ? `ประเมินครบ ${expectedCount} รายการ` : 'ส่งผลประเมินเรียบร้อยแล้ว', stageName };
    if (status === 'recused') return { label: 'ถอนตัวจากการประเมิน', action: 'ดูรายละเอียด', progress: 'แจ้งถอนตัวแล้ว', stageName };
    if (status === 'revoked') return { label: 'ยกเลิกการมอบหมาย', action: 'ดูรายละเอียด', progress: 'งานนี้ถูกยกเลิกแล้ว', stageName };
    if (scoreCount > 0) return { label: 'กำลังประเมิน', action: 'ประเมินต่อ', progress: expectedCount ? `ประเมินแล้ว ${scoreCount}/${expectedCount} รายการ` : `บันทึกแล้ว ${scoreCount} รายการ`, stageName };
    return { label: 'รอให้คะแนน', action: 'เริ่มประเมิน', progress: expectedCount ? `ต้องประเมิน ${expectedCount} รายการ` : 'พร้อมเริ่มประเมิน', stageName };
}

function juryAssignmentCard(item) {
    const meta = juryAssignmentMeta(item);
    return `<button type="button" data-svp-jury="${Number(item.id)}"><strong>${escHtml(valueOf(item, 'CampaignTitle', 'campaignTitle') || 'งานตัดสินที่ได้รับมอบหมาย')}</strong><span>${escHtml(meta.stageName)} · ${escHtml(meta.label)}</span><small>${escHtml(meta.progress)} · ${escHtml(meta.action)}</small></button>`;
}

function auxiliaryCoreMarkup() {
    const pending = state.nominations.filter(item => String(valueOf(item, 'ConsentState', 'consentState')) === 'pending');
    return `${pending.length ? `<section class="svp-aux" aria-labelledby="svp-consent-title"><h2 id="svp-consent-title">คำเสนอชื่อที่รอการยินยอม</h2>${pending.map(item => `<article><span>${escHtml(valueOf(item, 'NomineeNameSnapshot', 'nomineeNameSnapshot'))}</span><div><button type="button" class="sv-button sv-button--primary" data-svp-consent="${Number(item.id)}" data-accepted="true">ยินยอม</button><button type="button" class="sv-button sv-button--secondary" data-svp-consent="${Number(item.id)}" data-accepted="false">ปฏิเสธ</button></div></article>`).join('')}</section>` : ''}${state.assignments.length ? `<section class="svp-aux" id="sv-jury-workspace" role="region" aria-labelledby="sv-jury-workspace-title"><h2 id="sv-jury-workspace-title">งานตัดสินที่ได้รับมอบหมาย</h2><p>เลือกงานเพื่อเริ่มให้คะแนนหรือทำงานที่บันทึกไว้ต่อ</p><div class="svp-assignment-grid">${state.assignments.map(juryAssignmentCard).join('')}</div></section>` : ''}`;
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
    const counts = Object.fromEntries(Object.keys(VIEW_LABELS).map(key => [key, state.campaigns.filter(campaign => campaignMatchesView(campaign, key)).length]));
    state.page.innerHTML = `<div class="svp-shell" data-sv-participation="2026-10-16-safety-vote-public-discovery-r1">${safetyVoteRoleNav({ active: 'user', showJury: state.assignments.length > 0, juryCount: state.assignments.length })}<header class="svp-hero"><div><p class="sv-eyebrow">Safety Vote</p><h1>กิจกรรมของฉัน</h1><p>รวมกิจกรรมที่คุณมีสิทธิ์เข้าร่วม และกิจกรรมที่เปิดให้พนักงานทุกคนดูรายละเอียด</p></div><div class="svp-hero__count"><strong>${state.campaigns.length}</strong><span>กิจกรรม</span></div></header><section class="svp-toolbar" aria-label="ค้นหาและกรองกิจกรรม"><label><span class="sr-only">ค้นหากิจกรรม</span><input type="search" data-svp-search value="${escHtml(state.query)}" placeholder="ค้นหาชื่อ รหัส หรือประเภทกิจกรรม"></label><div class="svp-tabs" role="tablist" aria-label="สถานะการเข้าร่วม">${Object.entries(VIEW_LABELS).map(([key, label]) => `<button type="button" role="tab" data-svp-view="${key}" aria-selected="${state.view === key}">${label} <span>${counts[key]}</span></button>`).join('')}</div></section><main><section class="svp-card-grid" aria-label="รายการกิจกรรม">${rows.length ? rows.map(campaignCard).join('') : `<div class="svp-empty"><span aria-hidden="true">◌</span><h2>${state.query ? 'ไม่พบกิจกรรมที่ค้นหา' : `ยังไม่มีกิจกรรม${VIEW_LABELS[state.view]}`}</h2><p>${state.query ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'เมื่อมีกิจกรรมในสถานะนี้ รายการจะแสดงที่นี่'}</p></div>`}</section>${auxiliaryMarkup()}</main><p class="sr-only" aria-live="polite">แสดง ${rows.length} กิจกรรม</p></div>`;
    state.page.querySelector('.svp-shell')?.setAttribute('data-sv-company-user-ux', 'phase5');
    if (state.catalogueMode === 'company_authenticated') {
        state.page.querySelector('.svp-shell')?.setAttribute('data-sv-catalogue', 'company-wide-v1');
        const title = state.page.querySelector('.svp-hero h1'), description = state.page.querySelector('.svp-hero h1 + p'), countLabel = state.page.querySelector('.svp-hero__count span');
        if (title) title.textContent = 'แคมเปญทั้งหมด';
        if (description) description.textContent = 'พนักงานทุกคนดูแคมเปญที่เผยแพร่และรายละเอียดได้ การเข้าร่วมยังขึ้นอยู่กับสิทธิ์ของแต่ละแคมเปญ';
        if (countLabel) countLabel.textContent = 'แคมเปญที่เผยแพร่';
    }
    state.page.querySelector('.svp-shell')?.setAttribute('data-sv-engagement-version', '2026-10-10-safety-vote-ux-phase9a-r1');
    state.page.querySelector('.svp-hero')?.insertAdjacentHTML('beforebegin', promotionBannerMarkup());
    state.page.querySelector('.svp-hero')?.insertAdjacentHTML('beforebegin', automaticEligibilityNoticeMarkup());
    state.page.querySelector('.svp-hero')?.insertAdjacentHTML('afterend', taskStripMarkup());
    state.page.querySelector('main')?.insertAdjacentHTML('beforeend', promotionHistoryMarkup() + notificationCenterMarkup());
    if (state.promotions[state.promotionIndex]) trackPromotionEvent(state.promotions[state.promotionIndex].id, 'impression');
    state.page.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'user', current: 'participation', campaign: {}, onPage: true }));
    bindList();
    hydratePromotionImages();
}

function preparePromotionImages() {
    [...state.page.querySelectorAll('[data-svp-promotion-file]')].forEach(image => {
        const desktop = Number(image.dataset.desktopFile || 0), mobile = Number(image.dataset.svpPromotionFile || 0), fileId = matchMedia('(min-width: 768px)').matches && desktop ? desktop : mobile;
        image.dataset.svAuthFile = String(fileId);
    });
}

async function hydratePromotionImages() {
    preparePromotionImages();
    await hydrateSafetyVoteImages(state.page);
}

function questionControl(question) {
    const id = Number(question.id), raw = state.answers[String(id)], options = question.options || [];
    if (isChoiceQuestion(question)) {
        const inputType = question.questionType === 'single_choice' || question.questionType === 'yes_no_abstain' || Number(question.maxSelections) === 1 ? 'radio' : 'checkbox';
        return `<div class="svp-options">${options.map(option => `<article class="svp-option">${candidateGalleryMarkup(option,id,{ choiceName:`svp-q-${id}`, choiceValue:Number(option.id), choiceLabel:option.label })}<label><input type="${inputType}" name="svp-q-${id}" value="${Number(option.id)}" data-svp-answer="${id}" ${(Array.isArray(raw) && raw.map(Number).includes(Number(option.id))) ? 'checked' : ''}><span><strong>${escHtml(option.label)}</strong>${option.description ? `<small>${escHtml(option.description)}</small>` : ''}${optionMedia(option)}</span></label></article>`).join('')}</div>`;
    }
    if (question.questionType === 'rating') return `<label class="svp-inline-input"><span>คะแนน ${Number(question.validation?.minNumber ?? 0)}–${Number(question.validation?.maxNumber ?? 10)}</span><input type="number" data-svp-answer="${id}" value="${escHtml(raw ?? '')}" min="${Number(question.validation?.minNumber ?? 0)}" max="${Number(question.validation?.maxNumber ?? 10)}"></label>`;
    if (question.questionType === 'long_text') return `<textarea data-svp-answer="${id}" rows="5" maxlength="${Number(question.validation?.maxLength || 10000)}" placeholder="กรอกคำตอบ">${escHtml(raw || '')}</textarea>`;
    if (question.questionType === 'employee_picker') return safetyVotePeoplePickerMarkup({ pickerId: `question-${id}`, key: `question:${id}`, label: 'เลือกพนักงาน', value: raw || '', selectedLabel: state.peopleLabels[`question:${id}`] || '' });
    if (['short_text', 'organization_picker'].includes(question.questionType)) return `<input data-svp-answer="${id}" value="${escHtml(raw || '')}" maxlength="${Number(question.validation?.maxLength || 1000)}" placeholder="กรอกคำตอบ">`;
    if (question.questionType === 'date_time') return `<input type="datetime-local" data-svp-answer="${id}" value="${escHtml(raw || '')}">`;
    if (question.questionType === 'file_upload') return `<label class="svp-file-control"><span>${Number(raw) ? 'แนบไฟล์แล้ว' : 'เลือกไฟล์คำตอบ'}</span><input type="file" data-svp-answer-file="${id}" ${Number(raw) ? `data-file-id="${Number(raw)}"` : ''}></label>`;
    if (question.questionType === 'ranking') return `<div class="svp-ranking">${options.map(option => `<label><span>${escHtml(option.label)}</span><select data-svp-rank="${id}" data-option-id="${Number(option.id)}"><option value="">—</option>${options.map((_, rank) => `<option value="${rank + 1}" ${Array.isArray(raw) && raw.map(Number).indexOf(Number(option.id)) === rank ? 'selected' : ''}>${rank + 1}</option>`).join('')}</select></label>`).join('')}</div>`;
    if (['allocation', 'token'].includes(question.questionType)) return `<div class="svp-ranking">${options.map(option => `<label><span>${escHtml(option.label)}</span><input type="number" min="0" value="${Number(raw?.[option.id] || 0)}" data-svp-allocation="${id}" data-option-id="${Number(option.id)}"></label>`).join('')}</div>`;
    if (question.questionType === 'matrix') return `<div class="svp-ranking">${options.map(option => `<label><span>${escHtml(option.label)}</span><input value="${escHtml(raw?.[option.id] || '')}" data-svp-matrix="${id}" data-option-id="${Number(option.id)}"></label>`).join('')}</div>`;
    return '<p class="svp-note">รูปแบบคำถามนี้ยังไม่มีตัวควบคุมในหน้าเข้าร่วม</p>';
}

function candidateGalleryMarkup(option, questionId, choice = null, galleryGroup = '') {
    const gallery = Array.isArray(option.gallery) && option.gallery.length ? option.gallery : option.fileId ? [{ fileId: option.fileId, altText: option.label, caption: null, isCover: true }] : [];
    if (!gallery.length) return '';
    const group = galleryGroup || (choice ? 'campaign-choice-options' : `candidate-${Number(option.candidateId || option.id)}-question-${Number(questionId)}`);
    const choiceData = choice ? ` data-sv-gallery-choice-name="${escHtml(choice.choiceName)}" data-sv-gallery-choice-value="${Number(choice.choiceValue)}" data-sv-gallery-choice-label="${escHtml(choice.choiceLabel || option.label)}"` : '';
    return `<div class="sv-work-gallery sv-work-gallery--candidate" aria-label="ภาพผลงาน ${escHtml(option.label)}">${gallery.map((item,index)=>`<figure class="sv-work-gallery__item ${item.isCover?'is-cover':''}"><button type="button" class="svp-gallery-trigger" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="${group}"${choiceData} data-sv-gallery-label="${escHtml(item.altText||option.label)}" aria-label="เปิดภาพที่ ${index+1} ของ ${escHtml(option.label)}"><img data-svp-private-file="${Number(item.fileId)}" data-sv-auth-file="${Number(item.fileId)}" alt="${escHtml(item.altText||option.label)}" decoding="async"></button>${item.caption?`<figcaption>${escHtml(item.caption)}</figcaption>`:''}</figure>`).join('')}</div>`;
}

function publicWorkGalleryMarkup() {
    if (campaignType(state.detail?.campaign) !== 'jury_scoring') return '';
    const works = Array.isArray(state.publicWorks) ? state.publicWorks : [];
    return `<section class="svp-aux svp-public-work-gallery" data-svp-public-work-gallery aria-labelledby="svp-public-work-gallery-title"><div><p class="sv-eyebrow">ผลงานที่เข้าประกวด</p><h2 id="svp-public-work-gallery-title">Public Work Gallery</h2><p>พนักงานทุกคนดูผลงานได้แบบอ่านอย่างเดียว การดูผลงานไม่ได้ให้สิทธิ์เข้าตัดสิน</p></div>${works.length ? `<div class="svp-card-grid">${works.map(work => `<article class="svp-campaign-card svp-public-work-card"><strong>${escHtml(work.title || work.workCode || 'ผลงาน')}</strong><span>${escHtml(work.workCode || '')}</span>${work.description ? `<p>${escHtml(work.description)}</p>` : ''}${candidateGalleryMarkup({ id: work.id, candidateId: work.id, label: work.title || work.workCode, gallery: work.gallery || [] }, 0, null, 'campaign-public-works')}</article>`).join('')}</div>` : '<p class="svp-note">ยังไม่มีผลงานที่เปิดให้แสดง</p>'}</section>`;
}

function submissionGalleryEditor() {
    const rows = state.submissionGallery || [];
    return `<section class="sv-work-gallery-editor" aria-labelledby="svp-submission-gallery-title"><div><h3 id="svp-submission-gallery-title">รูปผลงาน</h3><p>เพิ่มได้สูงสุด 12 รูป · JPG, PNG หรือ WebP รูปละไม่เกิน 10 MB</p></div><label class="sv-button sv-button--secondary"><span>เพิ่มรูปผลงาน</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple data-svp-submission-gallery ${rows.length>=12?'disabled':''}></label>${rows.length?`<div class="sv-work-gallery-editor__grid">${rows.map((item,index)=>`<article><img src="${escHtml(item.previewUrl||'')}" alt=""><label class="svp-field"><span>คำอธิบายภาพ</span><input maxlength="300" value="${escHtml(item.altText||'')}" data-svp-gallery-alt="${index}" required></label><label class="svp-field"><span>คำบรรยาย (ถ้ามี)</span><input maxlength="500" value="${escHtml(item.caption||'')}" data-svp-gallery-caption="${index}"></label><button type="button" class="sv-button sv-button--secondary" data-svp-gallery-remove="${index}">ลบรูป</button></article>`).join('')}</div>`:'<p class="svp-note">ยังไม่มีรูปผลงาน</p>'}</section>`;
}

function ballotForm(detail) {
    const questions = detail.questions || [];
    return `<form class="svp-form" data-svp-form novalidate>${state.errors.length ? `<section class="svp-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบคำตอบ</h2><ul>${state.errors.map(error => `<li><a href="#svp-question-${Number(error.questionId)}">${escHtml(error.message)}</a></li>`).join('')}</ul></section>` : ''}${questions.map((question, index) => `<fieldset id="svp-question-${Number(question.id)}" class="svp-question ${isQuestionVisible(question, questions, state.answers) ? '' : 'is-hidden'}" data-svp-question="${Number(question.id)}"><legend>${index + 1}. ${escHtml(question.title)}</legend>${question.helpText ? `<p>${escHtml(question.helpText)}</p>` : ''}<small>${question.isRequired ? 'จำเป็น' : 'ไม่บังคับ'}${isChoiceQuestion(question) ? ` · เลือก ${Number(question.minSelections)}–${Number(question.maxSelections)} รายการ` : ''}</small>${questionControl(question)}</fieldset>`).join('')}</form>`;
}

function workflowRequirementsMarkup() {
    const questions = Array.isArray(state.detail?.questions) ? state.detail.questions : [];
    const rows = questions.filter(question => String(question.title || '').trim()).map((question, index) => `<li><strong>${index + 1}. ${escHtml(question.title)}</strong>${question.helpText ? `<span>${escHtml(question.helpText)}</span>` : ''}</li>`).join('');
    return rows ? `<section class="svp-workflow-requirements" aria-labelledby="svp-workflow-requirements-title"><h2 id="svp-workflow-requirements-title">ข้อกำหนดจากผู้จัดกิจกรรม</h2><ul>${rows}</ul></section>` : '';
}

function workflowForm(campaign) {
    const validation = state.errors.length ? `<section class="svp-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบข้อมูล</h2><ul>${state.errors.map(error => `<li><a href="#svp-question-${Number(error.questionId)}">${escHtml(error.message)}</a></li>`).join('')}</ul></section>` : '';
    const requirements = workflowRequirementsMarkup();
    if (campaignType(campaign) === 'submission_challenge') return `<form class="svp-form" data-svp-form novalidate>${validation}${requirements}<section id="svp-question-0" class="svp-question" data-svp-question="0"><h2>ข้อมูลผลงาน</h2><label class="svp-field"><span>ชื่อผลงาน</span><input data-svp-workflow="title" value="${escHtml(state.answers.title || '')}" maxlength="300"></label><label class="svp-field"><span>รายละเอียด</span><textarea data-svp-workflow="description" rows="6" maxlength="10000">${escHtml(state.answers.description || '')}</textarea></label>${submissionGalleryEditor()}${state.submissions.length ? `<p class="svp-note">คุณมีผลงานในกิจกรรมนี้ ${state.submissions.length} รายการ ระบบจะไม่สร้างรายการซ้ำระหว่างที่กำลังส่ง</p>` : ''}</section></form>`;
    return `<form class="svp-form" data-svp-form novalidate>${validation}${requirements}<section id="svp-question-0" class="svp-question" data-svp-question="0"><h2>ข้อมูลการเสนอชื่อ</h2>${safetyVotePeoplePickerMarkup({pickerId:'nominee',key:'nomineeEmployeeId',label:'ผู้ถูกเสนอชื่อ',value:state.answers.nomineeEmployeeId||'',selectedLabel:state.peopleLabels.nomineeEmployeeId||'',help:'ค้นหาจากชื่อ รหัสพนักงาน แผนก หน่วยงาน หรือตำแหน่ง'})}<label class="svp-field"><span>เหตุผลประกอบการเสนอชื่อ</span><textarea data-svp-workflow="statement" rows="6" maxlength="5000">${escHtml(state.answers.statement || '')}</textarea></label></section></form>`;
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
        else if (question.questionType === 'employee_picker') state.answers[id] = state.page.querySelector(`[data-sv-people-key="question:${id}"] [data-sv-people-value]`)?.value ?? state.answers[id] ?? '';
        else state.answers[id] = state.page.querySelector(`[data-svp-answer="${id}"]`)?.value ?? state.answers[id] ?? '';
    }
    state.page.querySelectorAll('[data-svp-workflow]').forEach(input => { state.answers[input.dataset.svpWorkflow] = input.value; });
    const nominee=state.page.querySelector('[data-sv-people-key="nomineeEmployeeId"] [data-sv-people-value]');if(nominee)state.answers.nomineeEmployeeId=nominee.value;
}

function answerSummary(question) {
    const raw = state.answers[String(question.id)];
    if (isChoiceQuestion(question)) return (raw || []).map(id => question.options.find(option => Number(option.id) === Number(id))?.label).filter(Boolean).join(', ') || 'ยังไม่ได้ตอบ';
    if (question.questionType === 'ranking') return (raw || []).map(id => question.options.find(option => Number(option.id) === Number(id))?.label).filter(Boolean).join(' → ') || 'ยังไม่ได้จัดลำดับ';
    if (['allocation', 'token', 'matrix'].includes(question.questionType)) return Object.entries(raw || {}).map(([id, value]) => `${question.options.find(option => Number(option.id) === Number(id))?.label || id}: ${value}`).join(', ') || 'ยังไม่ได้ตอบ';
    if (question.questionType === 'file_upload') return Number(raw) ? 'แนบไฟล์แล้ว' : 'ยังไม่ได้แนบไฟล์';
    if(question.questionType==='employee_picker')return state.peopleLabels[`question:${Number(question.id)}`]?`${state.peopleLabels[`question:${Number(question.id)}`]} (${String(raw||'')})`:String(raw||'').trim()||'ยังไม่ได้ตอบ';
    return String(raw ?? '').trim() || 'ยังไม่ได้ตอบ';
}

function reviewMarkup() {
    const campaign = state.detail.campaign, type = campaignType(campaign);
    const rows = isBallotCampaign(campaign)
        ? state.detail.questions.filter(question => isQuestionVisible(question, state.detail.questions, state.answers)).map(question => `<li><strong>${escHtml(question.title)}</strong><span>${escHtml(answerSummary(question))}</span></li>`).join('')
        : type === 'submission_challenge'
            ? `<li><strong>ชื่อผลงาน</strong><span>${escHtml(state.answers.title)}</span></li><li><strong>รายละเอียด</strong><span>${escHtml(state.answers.description)}</span></li><li><strong>รูปผลงาน</strong><span>${state.submissionGallery.length} รูป</span></li>${state.submissionGallery.length?`<li class="sv-work-gallery sv-work-gallery--review">${state.submissionGallery.map((item,index)=>`<figure class="sv-work-gallery__item"><button type="button" class="svp-gallery-trigger" data-sv-image-gallery data-sv-gallery-group="submission-review" data-sv-gallery-label="${escHtml(item.altText)}"><img src="${escHtml(item.previewUrl)}" alt="${escHtml(item.altText)}"></button>${item.caption?`<figcaption>${escHtml(item.caption)}</figcaption>`:''}</figure>`).join('')}</li>`:''}`
            : `<li><strong>ผู้ถูกเสนอชื่อ</strong><span>${escHtml(state.peopleLabels.nomineeEmployeeId?`${state.peopleLabels.nomineeEmployeeId} (${state.answers.nomineeEmployeeId})`:state.answers.nomineeEmployeeId)}</span></li><li><strong>เหตุผล</strong><span>${escHtml(state.answers.statement)}</span></li>`;
    return `<section class="svp-review" aria-labelledby="svp-review-title"><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2 id="svp-review-title">ตรวจคำตอบของคุณอีกครั้ง</h2><ul>${rows}</ul><div class="svp-immutable-warning" role="note"><strong>เมื่อยืนยันแล้วจะแก้ไขไม่ได้</strong><span>${privacyMode(campaign) === 'secret_ballot' ? 'ระบบจะไม่แสดงตัวเลือกในใบรับและไม่สามารถเชื่อมใบรับกลับไปยังบัตรลงคะแนน' : 'ระบบจะบันทึกการเข้าร่วมตามกติกาและสิทธิ์เดิมของกิจกรรม'}</span></div>${state.submitError ? `<div class="svp-submit-error" role="alert"><strong>ยังยืนยันการส่งไม่ได้</strong><span>${escHtml(state.submitError)}</span><small>ระบบไม่ส่งซ้ำอัตโนมัติ คุณสามารถลองส่งซ้ำด้วยรหัสคำขอเดิมหรือกลับไปตรวจสอบรายการ</small></div>` : ''}</section>`;
}

function receiptMarkup() {
    const receipt = state.receipt, secret = privacyMode(state.detail.campaign) === 'secret_ballot';
    return `<section class="svp-receipt" aria-labelledby="svp-receipt-title"><span class="svp-receipt__icon" aria-hidden="true">✓</span><p class="sv-eyebrow">รับข้อมูลแล้ว</p><h2 id="svp-receipt-title">ส่งรายการสำเร็จ</h2><dl><div><dt>เลขอ้างอิง</dt><dd>${escHtml(receipt.receiptCode)}</dd></div><div><dt>เวลาที่รับ</dt><dd>${dateTime(receipt.submittedAt)}</dd></div><div><dt>สถานะ</dt><dd>รับแล้ว · แก้ไขไม่ได้</dd></div></dl><div class="svp-privacy-receipt"><strong>${secret ? 'ใบรับบัตรลงคะแนนลับ' : 'ใบรับการเข้าร่วม'}</strong><p>${secret ? 'ใบรับนี้ยืนยันเฉพาะการรับบัตร ไม่แสดงตัวเลือกและใช้ค้นหาบัตรไม่ได้' : 'เพื่อความเป็นส่วนตัว ใบรับนี้ไม่แสดงคำตอบหรือตัวเลือกที่ส่ง'}</p></div></section>`;
}

function submittedAnswerValue(answer = {}) {
    if (answer.optionLabel) return answer.rankValue ? `${answer.rankValue}. ${answer.optionLabel}` : answer.optionLabel;
    if (answer.textValue) return answer.textValue;
    if (answer.numericValue !== null && answer.numericValue !== undefined) return String(answer.numericValue);
    if (answer.booleanValue !== null && answer.booleanValue !== undefined) return answer.booleanValue ? 'ใช่' : 'ไม่ใช่';
    if (answer.dateTimeValue) return dateTime(answer.dateTimeValue);
    if (answer.fileAttached) return 'แนบไฟล์แล้ว';
    return 'บันทึกคำตอบแล้ว';
}

function submittedAnswerMarkup(answer = {}, galleryGroup = '') {
    const label = submittedAnswerValue(answer);
    const fileId = Number(valueOf(answer, 'optionImageFileId', 'OptionImageFileID') || 0);
    if (!fileId) return `<span class="svp-submitted-answer">${escHtml(label)}</span>`;
    return `<span class="svp-submitted-answer svp-submitted-answer--with-image"><button type="button" class="svp-gallery-trigger svp-submitted-answer__image" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="${escHtml(galleryGroup)}" data-sv-gallery-label="${escHtml(label)}" data-svp-file="${fileId}" aria-label="ขยายภาพ ${escHtml(label)}"><img data-svp-private-file="${fileId}" data-sv-auth-file="${fileId}" alt="${escHtml(label)}" decoding="async"></button><span class="svp-submitted-answer__content"><small>คำตอบที่เลือก</small><span class="svp-submitted-answer__label">${escHtml(label)}</span></span></span>`;
}

function participationHistoryMarkup() {
    const detail = state.detail, participation = detail.participation || {}, attempts = Number(valueOf(participation, 'AttemptCount', 'attemptCount') || 0), maxAttempts = Number(valueOf(participation, 'MaxAttempts', 'maxAttempts') || 1), remaining = Number(valueOf(participation, 'RemainingAttempts', 'remainingAttempts') || 0), ownResponses = Array.isArray(detail.ownResponses) ? detail.ownResponses : [], canContinue = Boolean(detail.canSubmit && remaining > 0);
    const history = ownResponses.length ? `<div class="svp-review"><h3>คำตอบที่คุณส่ง</h3>${ownResponses.map((attempt, index) => `<details ${index === 0 ? 'open' : ''}><summary>ครั้งที่ ${attempts - index} · ${dateTime(attempt.submittedAt)}</summary><ul>${attempt.questions.map(question => `<li class="svp-review__row"><strong class="svp-review__question">${escHtml(question.title)}</strong><span class="svp-submitted-answers">${question.answers.map(answer => submittedAnswerMarkup(answer, `submitted-${Number(attempt.ballotSequence || index + 1)}-${Number(question.questionId || 0)}`)).join('')}</span></li>`).join('')}</ul></details>`).join('')}</div>` : `<div class="svp-privacy-receipt"><strong>เก็บสถานะโดยไม่เชื่อมคำตอบกลับหาคุณ</strong><p>แคมเปญแบบไม่ระบุตัวตนหรือบัตรลงคะแนนลับจะแสดงได้เฉพาะจำนวนครั้งและเวลาที่ส่ง ระบบจะไม่ค้นคืนตัวเลือกของคุณ</p></div>`;
    return `<section class="svp-receipt" aria-labelledby="svp-completed-title"><span class="svp-receipt__icon" aria-hidden="true">✓</span><h2 id="svp-completed-title">คุณทำรายการแล้ว ${attempts}/${maxAttempts} ครั้ง</h2><p>รายการที่ส่งแต่ละครั้งเป็นรายการถาวรและแก้ไขย้อนหลังไม่ได้</p><dl><div><dt>ส่งล่าสุด</dt><dd>${dateTime(valueOf(participation, 'SubmittedAt', 'submittedAt'))}</dd></div><div><dt>สิทธิ์คงเหลือ</dt><dd>${remaining} ครั้ง</dd></div></dl>${history}${canContinue ? '<button type="button" class="sv-button sv-button--primary" data-svp-action="new-attempt">ทำรายการครั้งถัดไป</button>' : ''}</section>`;
}

function stickyActionMarkup() {
    if (state.mode === 'receipt') return `<footer class="svp-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svp-action="back-list">กลับกิจกรรมของฉัน</button></footer>`;
    if (state.mode === 'review') {
        const draftLocked = campaignType(state.detail?.campaign) === 'submission_challenge' && Boolean(state.workflowDraftId);
        return `<footer class="svp-action-bar">${draftLocked ? '<span class="svp-note">สร้างฉบับร่างแล้ว ระบบจะลองส่งฉบับร่างเดิมโดยไม่สร้างรายการซ้ำ</span>' : '<button type="button" class="sv-button sv-button--secondary" data-svp-action="edit">ย้อนกลับไปแก้ไข</button>'}<button type="button" class="sv-button sv-button--primary" data-svp-action="confirm" ${state.inFlight ? 'disabled' : ''}>${state.submitError ? 'ลองส่งซ้ำอย่างปลอดภัย' : 'ยืนยันส่งรายการ'}</button></footer>`;
    }
    const submitted = String(valueOf(state.detail?.participation, 'State', 'state')).toLowerCase() === 'submitted';
    return `<footer class="svp-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svp-action="back-list">กลับกิจกรรมของฉัน</button>${state.detail.canSubmit && (!submitted || state.newAttempt) ? '<button type="button" class="sv-button sv-button--primary" data-svp-action="review">ตรวจคำตอบ</button>' : ''}</footer>`;
}

function officialResultsMarkup(results, campaign) {
    if (!['Closed', 'Certified', 'Published'].includes(String(campaign?.Status || ''))) return '';
    if (!results) return `<section class="svp-official-results svp-official-results--pending" data-svp-official-results="pending"><p class="sv-eyebrow">ผลกิจกรรม</p><h2>ยังไม่มีผลที่เปิดเผยได้</h2><p>กิจกรรมปิดรับรายการแล้ว ระบบจะแสดงผลจาก Result Snapshot ที่ตรึงและผ่านนโยบายการเปิดเผยของแคมเปญเท่านั้น</p></section>`;
    const snapshot = results.snapshot || {}, kpis = results.kpis || {}, groups = Array.isArray(results.officialGroups) ? results.officialGroups : (Array.isArray(results.groups) ? results.groups : []);
    const stateLabel = results.officialState === 'published' ? 'ประกาศผลแล้ว' : results.officialState === 'certified' ? 'รับรองผลแล้ว' : 'ตรึงผลแล้ว';
    const noResult = results.noResult === true;
    const groupMarkup = noResult ? '' : groups.map(group => `<article class="svp-official-results__question"><h3>${escHtml(group.title || 'ผลจัดอันดับรวม')}</h3><div class="svp-official-results__ranking">${(group.rows || []).map(row => { const value = Number(row.value || 0), rank = row.rank == null ? '–' : Number(row.rank).toLocaleString('th-TH'); return `<div class="svp-official-results__rank" data-result-state="${escHtml(row.state || 'normal')}"><span class="svp-official-results__rank-no" aria-label="อันดับ ${rank}">${rank}</span><div><strong>${escHtml(row.label || row.code || 'รายการผล')}</strong><span>${value.toLocaleString('th-TH',{maximumFractionDigits:2})} คะแนน${row.code ? ` · ${escHtml(row.code)}` : ''}</span><span class="svp-official-results__bar" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,Number(row.barPercentage||0)))}%"></i></span></div></div>`; }).join('')}</div></article>`).join('');
    return `<section class="svp-official-results ${noResult ? 'is-empty' : ''}" data-svp-official-results="${noResult ? 'no-result' : 'available'}" data-svp-result-source="immutable-snapshot"><div class="svp-official-results__header"><div><p class="sv-eyebrow">ผลกิจกรรมอย่างเป็นทางการ</p><div class="svp-official-results__title-line"><h2>${noResult ? 'สิ้นสุดกิจกรรม · ไม่มีคะแนน' : 'ผลจาก Snapshot ที่ตรวจสอบย้อนกลับได้'}</h2><span class="svp-official-results__state">${stateLabel}</span></div><p>${noResult ? 'ไม่มีบัตรที่ระบบรับรอง จึงไม่มีการจัดอันดับหรือสร้างผู้ชนะ' : 'แสดงเฉพาะผลรวมจาก Snapshot แบบอ่านอย่างเดียว โดยไม่เปิดเผยตัวตนหรือคำตอบรายบุคคล'}</p></div><dl><div><dt>ผู้มีสิทธิ์</dt><dd>${Number(kpis.eligible || 0).toLocaleString('th-TH')}</dd></div><div><dt>เข้าร่วม</dt><dd>${Number(kpis.participation || 0).toLocaleString('th-TH')}</dd></div><div><dt>อัตราเข้าร่วม</dt><dd>${Number(kpis.turnoutPercentage || 0).toLocaleString('th-TH',{maximumFractionDigits:2})}%</dd></div></dl></div>${groupMarkup}<details class="svp-result-integrity"><summary>ข้อมูลยืนยันผล Snapshot #${Number(snapshot.snapshotNo || 0)}</summary><dl><div><dt>สถานะ</dt><dd>${escHtml(snapshot.status || '')}</dd></div><div><dt>คำนวณเมื่อ</dt><dd>${dateTime(snapshot.calculatedAt)}</dd></div><div><dt>Result SHA-256</dt><dd><code>${escHtml(snapshot.resultHash || '')}</code></dd></div></dl></details></section>`;
}

function renderDetail() {
    clearObjectUrls(true);
    const detail = state.detail, campaign = detail.campaign, privacy = privacyNotice(campaign), submitted = String(valueOf(detail.participation, 'State', 'state')).toLowerCase() === 'submitted';
    const preOpen = Boolean(detail.preOpen || detail.accessMode === 'pre_open_promotion');
    const previewOnly = Boolean(detail.eligibility?.previewOnly);
    const discoveryOnly = detail.eligibility?.discoveryOnly === true || Number(detail.eligibility?.discoveryOnly || 0) === 1 || detail.accessMode === 'public_listing_preview';
    const eligibilityBadge = eligibilityBadgeMarkup(detail.eligibility?.eligibilityOrigin, { eligible: Boolean(detail.eligibility?.eligible), discoveryOnly });
    const liveEnabled = !preOpen && !discoveryOnly && Number(campaign.LiveLeaderboardEnabled) === 1 && campaign.LiveLeaderboardVisibility !== 'admin_only', liveAllowed = campaign.LiveLeaderboardVisibility === 'always' || submitted;
    const waitingForWindow = preOpen || ['Draft', 'Scheduled', 'Open'].includes(campaign.Status) && Number(campaign.VotingWindowOpen) !== 1;
    const opensAt = detail.opensAt || campaign.OpenAt || campaign.ScheduledOpenAt;
    const juryAssignment = state.assignments.find(item => Number(valueOf(item, 'CampaignID', 'campaignId')) === Number(campaign.id) && !['revoked', 'recused'].includes(String(valueOf(item, 'Status', 'status')).toLowerCase())) || null;
    const juryMeta = juryAssignment ? juryAssignmentMeta(juryAssignment) : null;
    const previewNotice = `<section class="svp-state svp-state--warning" role="status"><h2>${juryAssignment ? 'คุณมีสิทธิ์กรรมการสำหรับแคมเปญนี้' : 'กำลังดูในฐานะผู้ดูแลระบบ'}</h2><p>บัญชีนี้ไม่ได้อยู่ในรายชื่อผู้เข้าร่วม จึงไม่สามารถลงคะแนนหรือส่งรายการในฐานะผู้เข้าร่วมได้${juryAssignment ? ` แต่ยังสามารถทำหน้าที่กรรมการใน ${escHtml(juryMeta.stageName)} ได้ตามปกติ` : ''}</p>${juryAssignment ? `<button type="button" class="sv-button sv-button--primary" data-svp-jury="${Number(juryAssignment.id)}">${escHtml(juryMeta.action)}</button>` : ''}</section>`;
    const normalBody = state.mode === 'receipt' ? receiptMarkup() : state.mode === 'review' ? reviewMarkup() : submitted && !state.newAttempt ? participationHistoryMarkup() : previewOnly ? previewNotice : discoveryOnly ? `<section class="svp-state svp-state--warning" role="status"><h2>เปิดดูรายละเอียดได้ · ไม่มีสิทธิ์ลงคะแนน</h2><p>แคมเปญนี้แสดงในรายการสำหรับพนักงานทุกคน แต่บัญชีของคุณไม่อยู่ในรายชื่อผู้มีสิทธิ์ คุณจึงดูรายละเอียด กติกา และกำหนดการได้ โดยระบบจะไม่แสดงคำถามหรือปุ่มส่งคะแนน</p></section>` : detail.canSubmit ? (isBallotCampaign(campaign) ? ballotForm(detail) : workflowForm(campaign)) : waitingForWindow ? `<section class="svp-state svp-state--warning" role="status"><h2>ดูรายละเอียดได้แล้ว · ยังไม่เปิดลงคะแนน</h2><p>ป้ายนี้เปิดให้คุณดูรายละเอียด กติกา และกำหนดการล่วงหน้าได้ แต่ระบบยังปิดคำถามและปุ่มส่งคะแนน${opensAt ? ` จนถึง ${dateTime(opensAt)}` : ' จนกว่าผู้ดูแลระบบจะเปิดแคมเปญ'}</p></section>` : `<section class="svp-state svp-state--warning" role="status"><h2>กิจกรรมนี้ไม่เปิดรับรายการแล้ว</h2><p>คุณยังดูรายละเอียดและข้อกำหนดความเป็นส่วนตัวได้ แต่ไม่สามารถส่งรายการใหม่</p></section>`;
    const body = state.liveView ? `<section class="svp-live-workspace"><div class="svp-live-actions"><button type="button" class="sv-button sv-button--secondary" data-svp-action="live-refresh">Refresh</button><button type="button" class="sv-button sv-button--secondary" data-svp-action="live-toggle">${state.livePaused?'Resume':'Pause'}</button></div><div data-svp-live-panel>${liveResultsMarkup(state.liveResults,{error:state.liveError,loading:state.liveInFlight,paused:state.livePaused})}</div></section>` : `${publicWorkGalleryMarkup()}${normalBody}${officialResultsMarkup(state.officialResults,campaign)}`;
    const tabs = liveEnabled ? `<nav class="svp-detail-tabs" aria-label="กิจกรรม"><button type="button" data-svp-action="participation" aria-current="${!state.liveView?'page':'false'}">ลงคะแนน</button><button type="button" data-svp-action="live" aria-current="${state.liveView?'page':'false'}" ${!liveAllowed?'disabled':''}>ผลโหวตสด</button>${!liveAllowed?'<span>ส่งคะแนนก่อนจึงดูได้</span>':''}</nav>` : '';
    const promotion = detail.promotion || promotionForCampaign(campaign.id), promotionFileId = promotion?.mobileFileId || promotion?.desktopFileId;
    const promotionCover = preOpen && promotionFileId ? `<figure class="svp-preopen-cover" data-svp-media-state="loading" aria-busy="true">${promotionImageMarkup(promotionFileId, promotion.desktopFileId, promotion.altText || promotion.titleTh || campaign.TitleTh)}<figcaption>${escHtml(promotion.titleTh || campaign.TitleTh || '')}</figcaption></figure>` : '';
    state.page.innerHTML = `<div class="svp-shell svp-shell--detail" data-sv-participation="2026-10-16-safety-vote-preopen-detail-r1">${safetyVoteRoleNav({ active: 'user', showJury: state.assignments.length > 0, juryCount: state.assignments.length })}<header class="svp-detail-header"><button type="button" class="sv-icon-button" data-svp-action="back-list" aria-label="กลับกิจกรรมของฉัน">←</button><div><p class="sv-eyebrow">${escHtml(campaign.CampaignCode)}</p><h1>${escHtml(campaign.TitleTh)}</h1><p>${escHtml(campaign.Summary || campaign.Description || '')}</p></div><div class="svp-detail-header__badges"><span class="sv-status-badge sv-status-badge--${campaign.Status === 'Open' && !preOpen ? 'open' : 'closed'}"><span class="sv-status-dot"></span>${escHtml(STATUS_LABELS[campaign.Status] || campaign.Status)}</span>${eligibilityBadge}</div></header>${promotionCover}<section class="svp-meta"><div><strong>${escHtml(CAMPAIGN_TYPE_LABELS[campaignType(campaign)] || campaignType(campaign))}</strong><span>${campaign.CloseAt ? `ปิด ${dateTime(campaign.CloseAt)}` : 'ไม่ระบุเวลาปิด'}</span></div><div class="svp-privacy-notice" role="note"><strong>${escHtml(privacy.title)}</strong><span>${escHtml(privacy.description)}</span></div></section>${tabs}<main class="svp-detail-main" aria-live="polite">${body}</main>${state.liveView?'':stickyActionMarkup()}</div>`;
    state.page.querySelector('.svp-shell')?.setAttribute('data-sv-company-user-ux', 'phase5');
    if (isSafetyVoteEngagementV1Enabled() && state.mode === 'edit' && !submitted && !state.liveView) state.page.querySelector('.svp-detail-main')?.insertAdjacentHTML('afterbegin', `<section class="svp-campaign-intro" aria-labelledby="svp-campaign-intro-title"><div><p class="sv-eyebrow">ก่อนเข้าร่วม</p><h2 id="svp-campaign-intro-title">รายละเอียดกิจกรรม</h2><p>${escHtml(campaign.Description || campaign.Summary || 'ตรวจสอบข้อมูลและเงื่อนไขก่อนส่งรายการ')}</p></div><dl><div><dt>ผู้จัดกิจกรรม</dt><dd>${escHtml(campaign.OwnerEmployeeID || 'Safety / Admin')}</dd></div><div><dt>ระยะเวลาโดยประมาณ</dt><dd>3–5 นาที</dd></div><div><dt>เปิดกิจกรรม</dt><dd>${dateTime(campaign.OpenAt)}</dd></div><div><dt>ปิดกิจกรรม</dt><dd>${dateTime(campaign.CloseAt)}</dd></div></dl>${campaign.RulesText ? `<details><summary>กติกาและข้อกำหนด</summary><p>${escHtml(campaign.RulesText)}</p></details>` : ''}</section>`);
    state.page.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'user', current: 'participation', campaign, onPage: true }));
    preparePromotionImages();
    bindDetail(); bindSafetyVoteImageGallery(state.page); hydratePrivateImages();
    if (state.errors.length) state.page.querySelector('.svp-validation')?.focus();
}

async function hydratePrivateImages() {
    await hydrateSafetyVoteImages(state.page);
}

function validateWorkflow() {
    const type = campaignType(state.detail.campaign), errors = [];
    if (type === 'submission_challenge') {
        if (!String(state.answers.title || '').trim()) errors.push({ questionId: 0, message: 'กรุณาระบุชื่อผลงาน' });
        if (!String(state.answers.description || '').trim()) errors.push({ questionId: 0, message: 'กรุณาระบุรายละเอียดผลงาน' });
        if (state.submissionGallery.some(item => !String(item.altText || '').trim())) errors.push({ questionId: 0, message: 'กรุณาระบุคำอธิบายสำหรับรูปผลงานทุกภาพ' });
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
    let submitResponse = null;
    try {
        if (isBallotCampaign(campaign)) {
            const response = await API.post(`/safety-vote/campaigns/${id}/ballot/submit`, buildBallotPayload(state.detail, state.answers), { headers: { 'Idempotency-Key': state.requestKey } });
            submitResponse = response;
            state.receipt = safeReceipt({ campaign, receiptCode: response.data.receiptCode, replayed: response.data.replayed });
        } else if (type === 'submission_challenge') {
            if (!state.workflowDraftId) { const created = await API.post(`/safety-vote/campaigns/${id}/submissions`, { title: state.answers.title, description: state.answers.description }); state.workflowDraftId = Number(created.data.id); state.workflowReference = created.data.submissionCode; }
            for (const item of state.submissionGallery.filter(row=>!row.id)) { const form=new FormData();form.append('file',item.file);form.append('altText',item.altText);form.append('caption',item.caption||'');const uploaded=await API.upload(`/safety-vote/submissions/${state.workflowDraftId}/gallery`,form);item.id=Number(uploaded.data.id);item.fileId=Number(uploaded.data.fileId); }
            await API.post(`/safety-vote/campaigns/${id}/submissions/${state.workflowDraftId}/submit`, {});
            state.receipt = safeReceipt({ campaign, receiptCode: state.workflowReference || `SUBMISSION-${state.workflowDraftId}` });
        } else {
            const response = await API.post(`/safety-vote/campaigns/${id}/nominations`, { nomineeEmployeeId: state.answers.nomineeEmployeeId, statement: state.answers.statement });
            state.receipt = safeReceipt({ campaign, receiptCode: `NOMINATION-${Number(response.data.id)}` });
        }
        const previousAttempts = Number(valueOf(state.detail.participation, 'AttemptCount', 'attemptCount') || 0), maxAttempts = Number(submitResponse?.data?.maxAttempts || valueOf(state.detail.participation, 'MaxAttempts', 'maxAttempts') || 1);
        state.detail.participation = { State: 'submitted', AttemptCount: Number(submitResponse?.data?.attemptCount || previousAttempts + 1), MaxAttempts: maxAttempts, RemainingAttempts: Number(submitResponse?.data?.remainingAttempts ?? Math.max(0, maxAttempts - previousAttempts - 1)), SubmittedAt: submitResponse?.data?.submittedAt || state.receipt?.submittedAt || new Date().toISOString() };
        state.newAttempt = false;
        state.mode = 'receipt'; state.inFlight = false; state.submitError = null;
        showToast('ระบบรับรายการของคุณแล้ว', 'success'); renderDetail();
    } catch (error) {
        state.inFlight = false;
        if (['BALLOT_ALREADY_SUBMITTED','PARTICIPATION_LIMIT_REACHED','NOMINATION_DUPLICATE'].includes(error?.code)) { await openCampaign(Number(campaign.id)); return; }
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
    state.page.querySelector('[data-svp-promotion-cta]')?.addEventListener('click', event => trackPromotionEvent(event.currentTarget.dataset.svpPromotionCta, 'cta_click'));
    state.page.querySelector('[data-sv-role-link="jury"]')?.addEventListener('click', event => { event.preventDefault(); loadSafetyVoteJuryWorkspace({ page: state.page, onUser: load }); });
    state.page.querySelectorAll('[data-svp-jury]').forEach(button => button.addEventListener('click', () => loadSafetyVoteJuryWorkspace({ page: state.page, initialAssignmentId: Number(button.dataset.svpJury), onUser: load })));
    state.page.querySelector('[data-svp-promotion-prev]')?.addEventListener('click', () => { state.promotionIndex = (state.promotionIndex - 1 + state.promotions.length) % state.promotions.length; renderList(); });
    state.page.querySelector('[data-svp-promotion-next]')?.addEventListener('click', () => { state.promotionIndex = (state.promotionIndex + 1) % state.promotions.length; renderList(); });
    state.page.querySelectorAll('[data-svp-scroll]').forEach(button => button.addEventListener('click', () => state.page.querySelector('#svp-consent-title')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })));
    state.page.querySelectorAll('[data-svp-notification]').forEach(button => button.addEventListener('click', async () => { const id = Number(button.dataset.svpNotification), item = state.notificationCenter.find(row => Number(row.id) === id); if (item && !item.readAt) { try { await API.post(`/safety-vote/notification-center/${id}/read`, {}); item.readAt = new Date().toISOString(); } catch (_) {} } const campaignId = Number(button.dataset.campaignId); if (state.campaigns.some(row => Number(row.id) === campaignId)) openCampaign(campaignId); else renderList(); }));
    state.page.querySelector('[data-svp-notification-more]')?.addEventListener('click', () => { state.notificationsExpanded = !state.notificationsExpanded; renderList(); state.page.querySelector('#svp-notification-center-title')?.scrollIntoView({ block: 'center' }); });
    state.page.querySelector('[data-svp-read-all]')?.addEventListener('click', async () => { try { await API.post('/safety-vote/notification-center/read-all', {}); state.notificationCenter.forEach(item => { if (!item.readAt) item.readAt = new Date().toISOString(); }); renderList(); showToast('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด', 'success'); } catch (error) { showToast(error?.message || 'ปรับสถานะการแจ้งเตือนไม่สำเร็จ', 'error'); } });
    state.page.querySelectorAll('[data-svp-consent]').forEach(button => button.addEventListener('click', () => openSafetyVoteConfirmDialog({ title: button.dataset.accepted === 'true' ? 'ยืนยันการยินยอม' : 'ยืนยันการปฏิเสธ', description: 'ระบบจะบันทึกคำตอบตามรายการเสนอชื่อและสิทธิ์เดิม', confirmLabel: 'ยืนยัน', onConfirm: async () => { await API.post(`/safety-vote/nominations/${Number(button.dataset.svpConsent)}/consent`, { accepted: button.dataset.accepted === 'true' }); await load(); } })));
    state.page.querySelector('[data-svp-action="retry-load"]')?.addEventListener('click', load);
}

function bindDetail() {
    state.peoplePickerCleanup?.();
    state.peoplePickerCleanup=bindSafetyVotePeoplePickers(state.page,{onChange:detail=>{state.answers[detail.key.startsWith('question:')?detail.key.split(':')[1]:detail.key]=detail.employeeId;if(detail.person)state.peopleLabels[detail.key]=detail.person.employeeName||detail.employeeId;else delete state.peopleLabels[detail.key];collectAnswers();state.page.querySelectorAll('[data-svp-question]').forEach(fieldset=>{const question=state.detail.questions.find(item=>Number(item.id)===Number(fieldset.dataset.svpQuestion));fieldset.classList.toggle('is-hidden',!isQuestionVisible(question,state.detail.questions,state.answers));});}});
    bindRoleNavigation();
    state.page.querySelectorAll('[data-svp-jury]').forEach(button => button.addEventListener('click', () => loadSafetyVoteJuryWorkspace({ page: state.page, initialAssignmentId: Number(button.dataset.svpJury), onUser: load })));
    state.page.querySelectorAll('[data-svp-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.svpAction;
        if (action === 'back-list') { stopLivePolling(); if (/^#safety-vote=/.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#safety-vote`); state.screen = 'list'; state.detail = null; state.newAttempt = false; state.answers = {}; state.peopleLabels={}; state.receipt = null; state.requestKey = ''; renderList(); }
        else if (action === 'review') requestReview();
        else if (action === 'edit') { state.mode = 'edit'; state.submitError = null; if (isBallotCampaign(state.detail.campaign)) state.requestKey = ''; renderDetail(); }
        else if (action === 'confirm') confirmSubmit();
        else if (action === 'new-attempt') { state.newAttempt = true; state.mode = 'edit'; state.answers = {}; state.peopleLabels={}; state.errors = []; state.receipt = null; state.requestKey = ''; state.submitError = null; renderDetail(); }
        else if (action === 'participation') { stopLivePolling(); state.liveView = false; renderDetail(); }
        else if (action === 'live') { state.liveView = true; renderDetail(); startUserLivePolling(); }
        else if (action === 'live-refresh') loadLiveResults(true);
        else if (action === 'live-toggle') { state.livePaused = !state.livePaused; renderDetail(); if (!state.livePaused) loadLiveResults(true); else scheduleLivePolling(); }
    }));
    state.page.querySelectorAll('[data-svp-answer],[data-svp-rank],[data-svp-allocation],[data-svp-matrix],[data-svp-workflow]').forEach(input => input.addEventListener('change', () => { collectAnswers(); state.page.querySelectorAll('[data-svp-question]').forEach(fieldset => { const question = state.detail.questions.find(item => Number(item.id) === Number(fieldset.dataset.svpQuestion)); fieldset.classList.toggle('is-hidden', !isQuestionVisible(question, state.detail.questions, state.answers)); }); }));
    state.page.querySelector('[data-svp-submission-gallery]')?.addEventListener('change',event=>{for(const file of [...(event.target.files||[])].slice(0,Math.max(0,12-state.submissionGallery.length))){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){showToast(`${file.name}: รองรับเฉพาะ JPG, PNG หรือ WebP ไม่เกิน 10 MB`,'error');continue;}const previewUrl=URL.createObjectURL(file);state.objectUrls.add(previewUrl);state.submissionGallery.push({file,previewUrl,altText:file.name.replace(/\.[^.]+$/,''),caption:''});}renderDetail();});
    state.page.querySelectorAll('[data-svp-gallery-alt]').forEach(input=>input.addEventListener('input',()=>{state.submissionGallery[Number(input.dataset.svpGalleryAlt)].altText=input.value;}));
    state.page.querySelectorAll('[data-svp-gallery-caption]').forEach(input=>input.addEventListener('input',()=>{state.submissionGallery[Number(input.dataset.svpGalleryCaption)].caption=input.value;}));
    state.page.querySelectorAll('[data-svp-gallery-remove]').forEach(button=>button.addEventListener('click',async()=>{const index=Number(button.dataset.svpGalleryRemove),item=state.submissionGallery[index];if(item?.id)await API.delete(`/safety-vote/gallery/items/${item.id}`).catch(error=>showToast(error?.message||'ลบรูปไม่สำเร็จ','error'));if(item?.previewUrl){URL.revokeObjectURL(item.previewUrl);state.objectUrls.delete(item.previewUrl);}state.submissionGallery.splice(index,1);renderDetail();}));
    state.page.querySelectorAll('[data-svp-answer-file]').forEach(input => input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file || state.inFlight) return; input.disabled = true;
        try { const form = new FormData(); form.append('file', file); const response = await API.upload(`/safety-vote/campaigns/${Number(state.detail.campaign.id)}/questions/${Number(input.dataset.svpAnswerFile)}/files`, form); input.dataset.fileId = String(response.data.id); state.answers[input.dataset.svpAnswerFile] = Number(response.data.id); showToast('แนบไฟล์คำตอบแล้ว', 'success'); }
        catch (_) { state.errors = [{ questionId: Number(input.dataset.svpAnswerFile), message: 'แนบไฟล์ไม่สำเร็จ กรุณาตรวจสอบชนิดและขนาดไฟล์' }]; renderDetail(); }
        finally { input.disabled = false; }
    }));
}

async function openCampaign(id) {
    stopLivePolling();
    clearObjectUrls();
    state.screen = 'detail'; state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.errors = []; state.answers = {}; state.peopleLabels={}; state.receipt = null; state.requestKey = ''; state.workflowDraftId = null; state.workflowReference = ''; state.submissionGallery = []; state.submitError = null; state.officialResults = null;
    state.publicWorks = []; state.page.innerHTML = loadingMarkup();
    try {
        const response = await API.get(`/safety-vote/campaigns/${id}`);
        state.detail = response.data; state.mode = 'edit'; state.newAttempt = false; state.loading = false; state.liveView = false; state.liveResults = null; state.liveError = null; state.livePaused = false; state.liveFailures = 0;
        if (['Closed', 'Certified', 'Published'].includes(String(state.detail.campaign?.Status || ''))) {
            const official = await API.get(`/safety-vote/campaigns/${id}/official-results`, { suppressErrorLog: true }).catch(() => null);
            state.officialResults = official?.data || null;
        }
        if (campaignType(state.detail.campaign) === 'jury_scoring') {
            const works = await API.get(`/safety-vote/campaigns/${id}/works`, { suppressErrorLog: true }).catch(() => null);
            state.publicWorks = works?.data?.rows || [];
        }
        const candidateOptions=(state.detail.questions||[]).flatMap(question=>question.options||[]);
        await Promise.all(candidateOptions.map(async option=>{const response=await API.get(`/safety-vote/gallery/options/${Number(option.id)}`,{suppressErrorLog:true}).catch(()=>null);if(response){option.candidateId=Number(response.data.ownerId);option.gallery=response.data.items||[];}}));
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

async function refreshDiscoveryFromLatestSnapshot() {
    if (state.discoveryRefreshing || state.loading || state.screen !== 'list' || document.hidden || document.getElementById('safety-vote-page') !== state.page) return;
    state.discoveryRefreshing = true;
    try {
        const response = await API.get('/safety-vote/me/campaigns', { suppressErrorLog: true });
        state.campaigns = response.data.rows || [];
        state.catalogueMode = response.data.catalogueMode || 'legacy_discovery';
        if (state.screen === 'list') renderList();
    } catch (_) {
        // Preserve the last successful discovery view; the normal page load still surfaces hard failures.
    } finally {
        state.discoveryRefreshing = false;
    }
}

function bindLatestSnapshotDiscoveryRefresh() {
    if (state.discoveryRefreshHandler) {
        window.removeEventListener('focus', state.discoveryRefreshHandler);
        document.removeEventListener('visibilitychange', state.discoveryRefreshHandler);
    }
    state.discoveryRefreshHandler = () => {
        if (!document.hidden) refreshDiscoveryFromLatestSnapshot();
    };
    window.addEventListener('focus', state.discoveryRefreshHandler);
    document.addEventListener('visibilitychange', state.discoveryRefreshHandler);
}

async function load() {
    stopLivePolling();
    clearObjectUrls();
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.screen = 'list'; render();
    try {
        const campaigns = await API.get('/safety-vote/me/campaigns', { suppressErrorLog: true });
        const [nominations, assignments, notifications] = await Promise.all([
            API.get('/safety-vote/me/nominations', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } })),
            API.get('/safety-vote/jury/assignments', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } })),
            API.get('/safety-vote/notifications', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } }))
        ]);
        state.campaigns = campaigns.data.rows || []; state.catalogueMode = campaigns.data.catalogueMode || 'legacy_discovery'; state.nominations = nominations.data.rows || []; state.assignments = assignments.data.rows || []; state.notifications = notifications.data.rows || [];
        state.promotions = []; state.promotionHistory = []; state.notificationCenter = []; state.promotionIndex = 0;
        if (isSafetyVoteEngagementV1Enabled()) {
            const [promotions, center] = await Promise.all([
                API.get('/safety-vote/me/promotions', { suppressErrorLog: true }).catch(() => ({ data: { rows: [], history: [] } })),
                API.get('/safety-vote/notification-center', { suppressErrorLog: true }).catch(() => ({ data: { rows: [] } }))
            ]);
            state.promotions = promotions.data?.rows || [];
            state.promotionHistory = promotions.data?.history || [];
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
    bindLatestSnapshotDiscoveryRefresh();
    await load();
}
