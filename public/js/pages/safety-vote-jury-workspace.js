import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { isSafetyVoteUxV1Enabled, openSafetyVoteConfirmDialog, openSafetyVoteReasonDialog, safetyVoteJourneyNav, safetyVoteRoleNav } from './safety-vote-ux-components.js?v=20261009-safety-vote-ux8-r1';
import {
    JURY_VIEW_LABELS, assignmentProgress, assignmentState, buildScorePayload, filterAssignments,
    normalizeScores, rankCandidateScores, safeJuryReceipt, scoreKey, scoreProgress, validateDraftScoreSheet, validateScoreSheet, valueOf
} from './safety-vote-jury-model.mjs?v=20261029-safety-vote-jury-ranked-review-r1';
import { formatThaiDateTime } from './safety-vote-time.mjs?v=20261015-safety-vote-thai-time-r1';
import { bindSafetyVoteImageGallery } from './safety-vote-image-gallery.js?v=20261024-safety-vote-gallery-r1';
import { hydrateSafetyVoteImages, releaseSafetyVoteImages } from '../utils/safety-vote-auth-image.js?v=20261024-safety-vote-gallery-r1';

const STORAGE_PREFIX = 'safety-vote-jury-draft:';
const state = {
    page: null, assignments: [], detail: null, selected: null, query: '', view: 'draft', screen: 'list', mode: 'edit',
    scores: {}, errors: [], receipt: null, loading: true, error: null, denied: false, moduleDisabled: false,
    inFlight: false, saveState: 'idle', saveMessage: '', submitError: null, saveTimer: null, savePromise: null,
    sessionTimer: null, sessionVisibilityHandler: null, sessionRefreshPromise: null,
    draftRevision: 0, serverRevision: 0, progressCandidateId: 0, onUser: null
};

const SESSION_REFRESH_MS = 4 * 60 * 1000;

function dateTime(value) {
    return formatThaiDateTime(value, 'ไม่ระบุเวลา');
}

function storageKey(id) { return `${STORAGE_PREFIX}${Number(id)}`; }
function readLocalDraft(id) {
    try { return JSON.parse(sessionStorage.getItem(storageKey(id)) || 'null'); } catch (_) { return null; }
}
function writeLocalDraft() {
    if (!state.detail || state.mode !== 'edit') return;
    try {
        sessionStorage.setItem(storageKey(state.detail.assignment.id), JSON.stringify({ sheetVersion: Number(valueOf(state.detail.assignment, 'SheetVersion', 'sheetVersion') || 1), savedAt: new Date().toISOString(), scores: state.scores }));
        state.saveState = 'local'; state.saveMessage = 'เก็บฉบับร่างในอุปกรณ์นี้แล้ว'; updateSaveStatus();
    } catch (_) { state.saveState = 'error'; state.saveMessage = 'เก็บฉบับร่างในอุปกรณ์นี้ไม่ได้'; updateSaveStatus(); }
}
function clearLocalDraft(id) { try { sessionStorage.removeItem(storageKey(id)); } catch (_) {} }
function clearStaleDrafts(assignments) {
    try {
        const allowed = new Set(assignments.filter(item => assignmentState(item) === 'draft').map(item => storageKey(item.id)));
        for (let index = sessionStorage.length - 1; index >= 0; index--) {
            const key = sessionStorage.key(index);
            if (key?.startsWith(STORAGE_PREFIX) && !allowed.has(key)) sessionStorage.removeItem(key);
        }
    } catch (_) {}
}

function stopSessionKeepAlive() {
    clearInterval(state.sessionTimer);
    state.sessionTimer = null;
    if (state.sessionVisibilityHandler) document.removeEventListener('visibilitychange', state.sessionVisibilityHandler);
    state.sessionVisibilityHandler = null;
}

async function refreshJurySession({ notify = false } = {}) {
    if (state.sessionRefreshPromise) return state.sessionRefreshPromise;
    state.sessionRefreshPromise = (async () => {
        if (!window.TSHSession?.getToken?.()) return false;
        const verification = await window.TSHSession.refreshSession({ preserveOnFailure: true });
        if (verification || window.TSHSession.getToken()) return true;
        if (state.detail && state.mode === 'edit') {
            collectScores();
            writeLocalDraft();
            state.saveState = 'error';
            state.saveMessage = 'เซสชันหมดอายุ · เก็บฉบับร่างไว้ในแท็บนี้แล้ว กรุณาเข้าสู่ระบบใหม่';
            updateSaveStatus();
        }
        if (notify) showToast('เซสชันหมดอายุ ฉบับร่างยังอยู่ในแท็บนี้ กรุณาเข้าสู่ระบบใหม่', 'error');
        return false;
    })().finally(() => { state.sessionRefreshPromise = null; });
    return state.sessionRefreshPromise;
}

function startSessionKeepAlive() {
    stopSessionKeepAlive();
    state.sessionTimer = setInterval(() => refreshJurySession(), SESSION_REFRESH_MS);
    state.sessionVisibilityHandler = () => {
        if (document.visibilityState === 'visible' && state.screen === 'detail' && state.mode === 'edit') refreshJurySession();
    };
    document.addEventListener('visibilitychange', state.sessionVisibilityHandler);
}

function loadingMarkup() {
    return `<div class="svj-shell" aria-busy="true" aria-live="polite"><span class="sr-only">กำลังโหลดงานประเมินของฉัน</span><div class="svp-skeleton svp-skeleton--hero"></div><div class="svj-card-grid">${Array.from({ length: 3 }, () => '<div class="svp-skeleton svp-skeleton--card"></div>').join('')}</div></div>`;
}

function stateMarkup() {
    const nav = safetyVoteRoleNav({ active: 'jury', showJury: true, juryCount: state.assignments.length });
    if (state.moduleDisabled) return `<div class="svj-shell">${nav}<section class="svp-state svp-state--warning" role="status"><p class="sv-eyebrow">ปิดการใช้งานอยู่</p><h1>Safety Vote ยังไม่เปิดให้ใช้งาน</h1><p>ระบบปิดแบบ fail-closed และไม่ได้อ่านรายละเอียดงานประเมิน กรุณารอประกาศจากผู้ดูแลระบบ</p></section></div>`;
    if (state.denied) return `<div class="svj-shell">${nav}<section class="svp-state svp-state--denied" role="alert"><p class="sv-eyebrow">ไม่อนุญาตให้เข้าถึง</p><h1>ไม่พบงานประเมินที่คุณได้รับมอบหมาย</h1><p>ระบบไม่แสดงผู้สมัคร เกณฑ์ หรือคะแนนจากลิงก์นี้ หากควรได้รับงานนี้ กรุณาติดต่อผู้ดูแล Safety Vote</p><button type="button" class="sv-button sv-button--secondary" data-svj-action="back-list">กลับงานประเมินของฉัน</button></section></div>`;
    return `<div class="svj-shell">${nav}<section class="svp-state svp-state--error" role="alert"><p class="sv-eyebrow">โหลดข้อมูลไม่สำเร็จ</p><h1>ยังแสดงงานประเมินไม่ได้</h1><p>ระบบไม่ได้บันทึกหรือส่งคะแนนซ้ำ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง</p><button type="button" class="sv-button sv-button--primary" data-svj-action="retry">ลองอีกครั้ง</button></section></div>`;
}

function assignmentCard(item) {
    const status = assignmentState(item), scope = String(valueOf(item, 'AssignmentScope', 'assignmentScope')) === 'candidate' ? 'เฉพาะผลงานที่มอบหมาย' : 'ทุกผลงานในรอบ';
    const scoreCount = Math.max(0, Number(valueOf(item, 'ScoreCount', 'scoreCount') || 0));
    const expectedCount = Math.max(0, Number(valueOf(item, 'ExpectedScoreCount', 'expectedScoreCount') || 0));
    const stageName = valueOf(item, 'StageName', 'stageName') || 'รอบประเมิน';
    const statusLabel = status === 'draft' && scoreCount > 0 ? 'กำลังประเมิน' : status === 'draft' ? 'รอให้คะแนน' : status === 'submitted' ? 'ส่งผลประเมินแล้ว' : 'ถอนตัวจากการประเมิน';
    const actionLabel = status === 'draft' && scoreCount > 0 ? 'ประเมินต่อ' : status === 'draft' ? 'เริ่มประเมิน' : 'ดูรายละเอียด';
    const progress = status === 'submitted' ? `ส่ง ${dateTime(valueOf(item, 'SubmittedAt', 'submittedAt'))}` : expectedCount ? `ประเมินแล้ว ${scoreCount}/${expectedCount} รายการ` : scope;
    return `<button type="button" class="svj-card" data-svj-assignment="${Number(item.id)}"><span class="svj-card__top"><span class="sv-status-badge sv-status-badge--${status === 'draft' ? 'scheduled' : status === 'submitted' ? 'published' : 'closed'}"><span class="sv-status-dot"></span>${escHtml(statusLabel)}</span><span>${escHtml(actionLabel)}</span></span><strong>${escHtml(valueOf(item, 'CampaignTitle', 'campaignTitle') || 'งานตัดสิน Safety Vote')}</strong><span>${escHtml(stageName)}</span><small>${escHtml(scope)} · ${escHtml(progress)}</small></button>`;
}

function renderList() {
    const rows = filterAssignments(state.assignments, { view: state.view, query: state.query }), progress = assignmentProgress(state.assignments);
    const counts = Object.fromEntries(Object.keys(JURY_VIEW_LABELS).map(key => [key, state.assignments.filter(item => assignmentState(item) === key).length]));
    state.page.innerHTML = `<div class="svj-shell" data-sv-jury-workspace="2026-10-08-safety-vote-ux4-r1">${safetyVoteRoleNav({ active: 'jury', showJury: true, juryCount: state.assignments.length })}<header class="svj-hero"><div><p class="sv-eyebrow">Safety Vote · Juror</p><h1>งานประเมินของฉัน</h1><p>แสดงเฉพาะงานที่ระบบมอบหมายให้บัญชีกรรมการของคุณ</p></div><div class="svj-progress-card" aria-label="ส่งแล้ว ${progress.submitted} จาก ${progress.total} งาน"><strong>${progress.submitted}/${progress.total}</strong><span>ส่งแล้ว</span><div class="svj-progress"><span style="width:${progress.total ? Math.round(progress.submitted / progress.total * 100) : 0}%"></span></div></div></header><section class="svj-toolbar" aria-label="ค้นหาและกรองงานประเมิน"><label><span class="sr-only">ค้นหางานประเมิน</span><input type="search" data-svj-search value="${escHtml(state.query)}" placeholder="ค้นหาชื่อกิจกรรม รอบ หรือสถานะ"></label><div class="svj-tabs" role="tablist" aria-label="สถานะงานประเมิน">${Object.entries(JURY_VIEW_LABELS).map(([key, label]) => `<button type="button" role="tab" data-svj-view="${key}" aria-selected="${state.view === key}">${label} <span>${counts[key]}</span></button>`).join('')}</div></section><main><section class="svj-card-grid" aria-label="รายการงานประเมิน">${rows.length ? rows.map(assignmentCard).join('') : `<div class="svp-empty"><span aria-hidden="true">✓</span><h2>${state.query ? 'ไม่พบงานประเมินที่ค้นหา' : `ยังไม่มีงาน${JURY_VIEW_LABELS[state.view]}`}</h2><p>${state.query ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'เมื่อได้รับมอบหมายหรือสถานะเปลี่ยน รายการจะแสดงที่นี่'}</p></div>`}</section></main><p class="sr-only" aria-live="polite">แสดง ${rows.length} งานประเมิน</p></div>`;
    state.page.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'jury', current: 'jury', campaign: { CampaignType: 'jury_scoring' }, onPage: true }));
    bindList();
}

function criterionValue(criterion, key) { return valueOf(criterion, key, key[0].toLowerCase() + key.slice(1)); }
function candidateGallery(candidate) {
    const items=candidate.gallery||[];if(!items.length)return'';
    return `<div class="sv-work-gallery sv-work-gallery--jury" aria-label="ภาพผลงาน ${escHtml(candidate.displayName)}">${items.map((item,index)=>`<figure class="sv-work-gallery__item ${item.isCover?'is-cover':''}"><button type="button" class="svp-gallery-trigger" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="jury-candidate-${Number(candidate.id)}" data-sv-gallery-label="${escHtml(item.altText||candidate.displayName)}" aria-label="เปิดภาพที่ ${index+1} ของ ${escHtml(candidate.displayName)}"><img data-sv-auth-file="${Number(item.fileId)}" alt="${escHtml(item.altText||candidate.displayName)}" decoding="async"></button>${item.caption?`<figcaption>${escHtml(item.caption)}</figcaption>`:''}</figure>`).join('')}</div>`;
}
function scoreStep(min, max) {
    return Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.01;
}
function quickScoreValues(min, max) {
    const step = scoreStep(min, max), span = max - min;
    return [...new Set([min, min + span * .25, min + span * .5, min + span * .75, max].map(value => {
        const normalized = step === 1 ? Math.round(value) : Math.round(value * 100) / 100;
        return Math.max(min, Math.min(max, normalized));
    }))];
}
function scoreControl(candidate, criterion) {
    const key = scoreKey(candidate.id, criterion.id), row = state.scores[key] || {}, min = Number(criterionValue(criterion, 'MinScore')), max = Number(criterionValue(criterion, 'MaxScore')), step = scoreStep(min, max), value = row.score ?? '', title = criterionValue(criterion, 'Title');
    const quick = quickScoreValues(min, max).map(score => `<button type="button" data-svj-score-quick="${key}" data-score="${score}" aria-pressed="${String(value) === String(score)}">${score}</button>`).join('');
    return `<article class="svj-score-row" id="svj-score-${key.replace(':', '-')}"><div class="svj-score-row__criterion"><strong>${escHtml(title)}</strong>${criterionValue(criterion, 'Description') ? `<p>${escHtml(criterionValue(criterion, 'Description'))}</p>` : ''}<small>ช่วงคะแนน ${min}–${max} · น้ำหนัก ${Number(criterionValue(criterion, 'Weight'))}%</small></div><section class="svj-score-entry" aria-label="ให้คะแนน ${escHtml(title)} สำหรับ ${escHtml(candidate.displayName)}"><div class="svj-score-entry__heading"><strong>คะแนน</strong><output data-svj-score-output="${key}" aria-live="polite">${value === '' ? 'ยังไม่เลือก' : `${escHtml(value)} / ${max}`}</output></div><input class="svj-score-slider" type="range" min="${min}" max="${max}" step="${step}" value="${value === '' ? min : escHtml(value)}" data-svj-score-range="${key}" aria-label="เลื่อนคะแนน ${escHtml(title)}"><div class="svj-score-entry__number"><button type="button" data-svj-score-step="-1" data-score-key="${key}" aria-label="ลดคะแนน ${escHtml(title)}">−</button><input type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${escHtml(value)}" data-svj-score="${key}" aria-label="คะแนน ${escHtml(title)} สำหรับ ${escHtml(candidate.displayName)}" placeholder="${min}–${max}"><button type="button" data-svj-score-step="1" data-score-key="${key}" aria-label="เพิ่มคะแนน ${escHtml(title)}">+</button></div><div class="svj-score-quick" role="group" aria-label="เลือกคะแนนอย่างรวดเร็ว">${quick}</div></section><label class="svj-comment"><span>หมายเหตุ (ไม่บังคับ)</span><textarea rows="2" maxlength="1000" data-svj-comment="${key}">${escHtml(row.comment || '')}</textarea></label></article>`;
}

function validationMarkup() {
    if (!state.errors.length) return '';
    const visible = state.errors.slice(0, 8), remaining = state.errors.length - visible.length;
    return `<section class="svp-validation svj-validation" role="alert" tabindex="-1"><h2>ยังส่งผลไม่ได้ · เหลือ ${state.errors.length} ช่องที่ต้องตรวจสอบ</h2><p>กดแต่ละรายการเพื่อไปยังช่องที่ต้องแก้ไข ฉบับร่างยังบันทึกบางส่วนได้ตามปกติ</p><ul>${visible.map(error => `<li><a href="#svj-score-${error.key.replace(':', '-')}" data-svj-error-key="${escHtml(error.key)}"><strong>ผลงาน ${Number(error.candidateIndex)}/${Number(error.candidateTotal)} · ${escHtml(error.candidateCode)}</strong><span>เกณฑ์ข้อ ${Number(error.criterionIndex)}/${Number(error.criterionTotal)} · ${escHtml(error.criterionTitle)}</span><small>${escHtml(error.message)}</small></a></li>`).join('')}</ul>${remaining > 0 ? `<p><strong>และอีก ${remaining} ช่อง</strong> — ดูความคืบหน้าของแต่ละผลงานเพื่อกรอกต่อ</p>` : ''}</section>`;
}

function focusValidationTarget(key) {
    const target = state.page?.querySelector(`#svj-score-${String(key).replace(':', '-')}`);
    if (!target) return;
    state.page.querySelectorAll('.svj-score-row.is-validation-target').forEach(row => row.classList.remove('is-validation-target'));
    target.classList.add('is-validation-target');
    target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.querySelector('[data-svj-score]')?.focus({ preventScroll: true });
    setTimeout(() => target.classList.remove('is-validation-target'), 2400);
}

function matrixSummaryMarkup() {
    const matrix = state.detail?.matrix || {};
    const works = Number(matrix.workCount ?? state.detail?.candidates?.length ?? 0);
    const criteria = Number(matrix.criteriaCount ?? state.detail?.criteria?.length ?? 0);
    const cells = Number(matrix.cellCount ?? works * criteria);
    return `<section class="svj-matrix-contract" data-sv-jury-matrix="${escHtml(matrix.contractVersion || '2026-10-25-jury-work-criteria-matrix-r1')}" aria-label="สรุปตารางผลงานและเกณฑ์"><div><p class="sv-eyebrow">WORK × CRITERIA MATRIX</p><h2>ให้คะแนน ${works} ผลงาน ตาม ${criteria} เกณฑ์</h2><p>ต้องกรอกครบ ${cells} ช่องก่อนส่ง คะแนนที่ยืนยันแล้วจะถูกใช้เป็นข้อมูลต้นทางของ Frozen Result โดยตรง</p></div><dl><div><dt>ผลงาน</dt><dd>${works}</dd></div><div><dt>เกณฑ์</dt><dd>${criteria}</dd></div><div><dt>น้ำหนักรวม</dt><dd>${Number(matrix.weightTotal || 0)}%</dd></div></dl></section>`;
}

function isCompleteScore(candidate, criterion) {
    const raw = state.scores[scoreKey(candidate.id, criterion.id)]?.score;
    const score = Number(raw), min = Number(criterionValue(criterion, 'MinScore')), max = Number(criterionValue(criterion, 'MaxScore'));
    return raw !== '' && raw !== undefined && raw !== null && Number.isFinite(score) && score >= min && score <= max;
}

function activeProgressCandidate() {
    const candidates = state.detail?.candidates || [], criteria = state.detail?.criteria || [];
    const selected = candidates.find(candidate => Number(candidate.id) === Number(state.progressCandidateId));
    if (selected) return selected;
    return candidates.find(candidate => criteria.some(criterion => !isCompleteScore(candidate, criterion))) || candidates[0] || null;
}

function juryProgressNavigatorMarkup() {
    const candidates = state.detail?.candidates || [], criteria = state.detail?.criteria || [], active = activeProgressCandidate();
    if (!active) return '';
    state.progressCandidateId = Number(active.id);
    const completedWorks = candidates.filter(candidate => criteria.every(criterion => isCompleteScore(candidate, criterion))).length;
    return `<nav class="sv-progress-navigator svj-progress-navigator" data-svj-progress-navigator aria-label="ความคืบหน้าผลงานและเกณฑ์"><div class="sv-progress-navigator__heading"><div><strong>ตรวจความคืบหน้ารายผลงาน</strong><span>ครบ ${completedWorks}/${candidates.length} ผลงาน · เลือกผลงานแล้วกดเกณฑ์ที่ต้องการตรวจ</span></div><span class="sv-progress-navigator__summary ${completedWorks === candidates.length ? 'is-complete' : 'is-incomplete'}">${completedWorks === candidates.length ? 'ครบทุกผลงาน' : `เหลือ ${candidates.length - completedWorks} ผลงาน`}</span></div><div class="sv-progress-navigator__items svj-progress-works">${candidates.map((candidate, index) => { const complete = criteria.filter(criterion => isCompleteScore(candidate, criterion)).length, current = Number(candidate.id) === Number(active.id); return `<button type="button" class="sv-progress-item ${complete === criteria.length ? 'is-complete' : 'is-incomplete'} ${current ? 'is-current' : ''}" data-svj-progress-work="${Number(candidate.id)}" aria-current="${current ? 'true' : 'false'}"><span>${index + 1}</span><strong>${escHtml(candidate.candidateNo || candidate.displayName)}</strong><small>${complete === criteria.length ? 'ครบ' : `ขาด ${criteria.length - complete}`}</small></button>`; }).join('')}</div><section class="svj-progress-criteria" aria-label="เกณฑ์ของ ${escHtml(active.displayName)}"><header><strong>${escHtml(active.displayName)}</strong><span>กดเกณฑ์เพื่อไปยังช่องคะแนน</span></header><div class="sv-progress-navigator__items">${criteria.map((criterion, index) => { const key = scoreKey(active.id, criterion.id), complete = isCompleteScore(active, criterion); return `<button type="button" class="sv-progress-item ${complete ? 'is-complete' : 'is-incomplete'}" data-svj-progress-score="${escHtml(key)}"><span>${index + 1}</span><strong>${escHtml(criterionValue(criterion, 'Title'))}</strong><small>${complete ? 'ครบ' : 'ยังไม่ครบ'}</small></button>`; }).join('')}</div></section></nav>`;
}

function refreshJuryProgressNavigator() {
    const current = state.page?.querySelector('[data-svj-progress-navigator]');
    if (!current) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = juryProgressNavigatorMarkup();
    current.replaceWith(wrapper.firstElementChild);
}

function editMarkup() {
    const progress = scoreProgress(state.detail, state.scores);
    const criteria = state.detail.criteria || [];
    return `${validationMarkup()}${matrixSummaryMarkup()}<section class="svj-sheet-summary"><div><strong>${progress.completed}/${progress.total}</strong><span>รายการที่ให้คะแนนแล้ว</span></div><div class="svj-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.completed}" aria-label="ความคืบหน้าการให้คะแนน"><span style="width:${progress.percent}%"></span></div><p data-svj-save-status data-state="${state.saveState}" aria-live="polite">${escHtml(state.saveMessage || 'ระบบจะบันทึกฉบับร่างอัตโนมัติเมื่อเริ่มให้คะแนน')}</p></section><form class="svj-score-form" data-svj-form data-sv-result-binding="submitted_score_rows_to_frozen_result" novalidate>${(state.detail.candidates || []).map((candidate, index) => {
        const candidateCompleted = criteria.filter(criterion => {
            const raw = state.scores[scoreKey(candidate.id, criterion.id)]?.score;
            return raw !== '' && raw !== undefined && raw !== null && Number.isFinite(Number(raw));
        }).length;
        return `<fieldset class="svj-candidate" id="svj-candidate-${Number(candidate.id)}"><legend><span>${index + 1}</span>${escHtml(candidate.displayName)}</legend><div class="svj-candidate__workspace"><aside class="svj-candidate__evidence" aria-label="หลักฐานผลงาน ${escHtml(candidate.displayName)}"><div class="svj-candidate__meta"><div><span>รหัสผลงาน</span><strong>${escHtml(candidate.candidateNo)}</strong></div><span class="svj-candidate__progress" data-svj-candidate-progress="${Number(candidate.id)}">ให้คะแนนแล้ว ${candidateCompleted}/${criteria.length} เกณฑ์</span></div>${candidateGallery(candidate)}</aside><section class="svj-candidate__criteria" aria-label="แบบประเมิน ${escHtml(candidate.displayName)}"><header><div><span>แบบประเมินผลงาน</span><strong>${criteria.length} เกณฑ์ · น้ำหนักรวม ${Number(state.detail?.matrix?.weightTotal || 0)}%</strong></div><small>บันทึกร่างได้ทุกเมื่อ · ต้องครบทุกเกณฑ์ก่อนส่งผล</small></header>${criteria.map(criterion => scoreControl(candidate, criterion)).join('')}</section></div></fieldset>`;
    }).join('')}</form>`;
}

function reviewCoverMarkup(candidate) {
    const gallery = candidate.gallery || [], cover = gallery.find(item => item.isCover) || gallery[0];
    if (!cover?.fileId) return `<div class="svj-review-card__placeholder" role="img" aria-label="ไม่มีภาพผลงาน"><span aria-hidden="true">ภาพ</span><small>ไม่มีภาพผลงาน</small></div>`;
    const label = cover.altText || candidate.displayName || candidate.candidateNo || 'ภาพผลงาน';
    return `<button type="button" class="svj-review-card__cover" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="jury-review-${Number(candidate.id)}" data-sv-gallery-label="${escHtml(label)}" aria-label="เปิดภาพผลงาน ${escHtml(candidate.displayName)}"><img data-sv-auth-file="${Number(cover.fileId)}" alt="${escHtml(label)}" decoding="async"></button>`;
}

function reviewMarkup() {
    const ranked = rankCandidateScores(state.detail, state.scores), formatScore = value => Number(value).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `<section class="svj-review" aria-labelledby="svj-review-title"><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2 id="svj-review-title">อันดับคะแนนส่วนตัวและภาพผลงาน</h2><p>เรียงจากคะแนนถ่วงน้ำหนักที่คุณให้มากไปน้อย เพื่อช่วยตรวจความสอดคล้องก่อนส่ง โดยอันดับนี้เป็นของกรรมการคนนี้เท่านั้น ไม่ใช่ผลรวมอย่างเป็นทางการ และยังคงใช้ชื่อผลงานตาม Blind mode</p><div class="svj-review-grid">${ranked.map(item => { const candidate = item.candidate; return `<article class="svj-review-card" data-svj-review-rank="${item.rank}">${reviewCoverMarkup(candidate)}<div class="svj-review-card__body"><header><span class="svj-review-card__rank">อันดับ ${item.rank}${item.tied ? ' · คะแนนเท่ากัน' : ''}</span><strong>${item.weightedPercent === null ? 'ยังคำนวณไม่ได้' : `${formatScore(item.weightedPercent)}%`}</strong></header><div><h3>${escHtml(candidate.displayName)}</h3><small>รหัสผลงาน ${escHtml(candidate.candidateNo || `WORK-${candidate.id}`)}</small></div><dl>${item.breakdown.map(row => `<div><dt>${escHtml(row.title)} <small>น้ำหนัก ${Number(row.weight)}%</small></dt><dd>${row.score === null ? '—' : `${formatScore(row.score)} / ${formatScore(row.max)}`}</dd></div>`).join('')}</dl><button type="button" class="sv-button sv-button--secondary" data-svj-edit-work="${Number(candidate.id)}">กลับไปตรวจและแก้คะแนนผลงานนี้</button></div></article>`; }).join('')}</div><div class="svp-immutable-warning" role="note"><strong>เมื่อยืนยันแล้ว คะแนนชุดนี้จะแก้ไขไม่ได้</strong><span>การเปิดรอบแก้ไขต้องดำเนินการโดยผู้ดูแลที่มีสิทธิ์ และระบบจะสร้างชุดประเมินรุ่นใหม่โดยเก็บชุดเดิมไว้</span></div>${state.submitError ? `<div class="svp-submit-error" role="alert"><strong>ยังยืนยันการส่งไม่ได้</strong><span>${escHtml(state.submitError)}</span><small>ระบบตรวจสถานะล่าสุดแล้วและไม่ส่งซ้ำอัตโนมัติ</small></div>` : ''}</section>`;
}

function receiptMarkup() {
    const receipt = state.receipt;
    return `<section class="svj-receipt" aria-labelledby="svj-receipt-title"><span class="svp-receipt__icon" aria-hidden="true">✓</span><p class="sv-eyebrow">รับคะแนนแล้ว</p><h2 id="svj-receipt-title">ส่งแบบประเมินสำเร็จ</h2><dl><div><dt>เลขอ้างอิงงาน</dt><dd>JURY-${Number(receipt.assignmentId)}</dd></div><div><dt>ชุดประเมิน</dt><dd>${Number(receipt.sheetVersion)}</dd></div><div><dt>เวลาที่รับ</dt><dd>${dateTime(receipt.submittedAt)}</dd></div></dl><div class="svp-privacy-receipt"><strong>ใบรับนี้ไม่แสดงคะแนนหรือรายละเอียดผู้สมัคร</strong><p>ยืนยันเฉพาะว่าระบบรับแบบประเมินชุดนี้แล้วและล็อกไม่ให้แก้ไข</p></div></section>`;
}

function lockedMarkup() {
    const status = assignmentState(state.detail.assignment);
    return `<section class="svp-state svp-state--warning" role="status"><h2>${status === 'recused' ? 'คุณถอนตัวจากงานประเมินนี้แล้ว' : 'แบบประเมินนี้ถูกส่งและล็อกแล้ว'}</h2><p>${status === 'recused' ? 'ระบบไม่อนุญาตให้บันทึกหรือส่งคะแนนสำหรับงานนี้' : 'คะแนนที่ส่งแล้วแก้ไขไม่ได้ หากมีการเปิดรอบแก้ไข ระบบจะแสดงงานชุดใหม่ในรายการของคุณ'}</p></section>`;
}

function actionBarMarkup() {
    const editable = assignmentState(state.detail?.assignment) === 'draft';
    if (state.mode === 'receipt') return `<footer class="svj-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svj-action="back-list">กลับงานประเมินของฉัน</button></footer>`;
    if (!editable) return `<footer class="svj-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svj-action="back-list">กลับงานประเมินของฉัน</button></footer>`;
    if (state.mode === 'review') return `<footer class="svj-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svj-action="edit">ย้อนกลับไปแก้ไข</button><button type="button" class="sv-button sv-button--primary" data-svj-action="confirm" ${state.inFlight ? 'disabled' : ''}>ยืนยันส่งคะแนนแบบถาวร</button></footer>`;
    return `<footer class="svj-action-bar"><button type="button" class="sv-button sv-button--danger" data-svj-action="recuse">แจ้ง Conflict / ถอนตัว</button><div><button type="button" class="sv-button sv-button--secondary" data-svj-action="save" ${state.inFlight || state.saveState === 'saving' ? 'disabled' : ''}>บันทึกฉบับร่าง</button><button type="button" class="sv-button sv-button--primary" data-svj-action="review" ${state.inFlight || state.saveState === 'saving' ? 'disabled' : ''}>ตรวจสอบก่อนส่ง</button></div></footer>`;
}

function renderDetail() {
    releaseSafetyVoteImages(state.page);
    const assignment = state.detail.assignment, status = assignmentState(assignment), campaignTitle = valueOf(assignment, 'CampaignTitle', 'campaignTitle') || valueOf(state.selected || {}, 'CampaignTitle', 'campaignTitle') || 'งานตัดสิน Safety Vote';
    const stageName = valueOf(assignment, 'StageName', 'stageName') || 'รอบประเมิน';
    const body = state.mode === 'receipt' ? receiptMarkup() : state.mode === 'review' ? reviewMarkup() : status === 'draft' ? editMarkup() : lockedMarkup();
    state.page.innerHTML = `<div class="svj-shell svj-shell--detail" data-sv-jury-workspace="2026-10-28-safety-vote-jury-assignment-ux-r1">${safetyVoteRoleNav({ active: 'jury', showJury: true, juryCount: state.assignments.length })}<header class="svj-detail-header"><button type="button" class="sv-icon-button" data-svj-action="back-list" aria-label="กลับงานประเมินของฉัน">←</button><div><p class="sv-eyebrow">${escHtml(stageName)}${Number(valueOf(assignment, 'SheetVersion', 'sheetVersion') || 1) > 1 ? ` · เปิดประเมินใหม่ครั้งที่ ${Number(valueOf(assignment, 'SheetVersion', 'sheetVersion'))}` : ''}</p><h1>${escHtml(campaignTitle)}</h1><p>${state.detail.blind ? 'การประเมินแบบปกปิดตัวตน — ใช้เฉพาะชื่อแทนที่เซิร์ฟเวอร์ส่งมา' : 'ประเมินตามรายการและเกณฑ์ที่ได้รับมอบหมาย'}</p></div><span class="sv-status-badge sv-status-badge--${status === 'draft' ? 'scheduled' : status === 'submitted' ? 'published' : 'closed'}"><span class="sv-status-dot"></span>${JURY_VIEW_LABELS[status]}</span></header>${state.detail.blind ? '<section class="svj-blind-notice" role="note"><strong>Blind judging</strong><span>ห้ามใช้ข้อมูลนอกหน้าจอนี้เพื่อพยายามระบุตัวผู้ส่งผลงาน</span></section>' : ''}<main class="svj-main" aria-live="polite">${body}</main>${actionBarMarkup()}</div>`;
    if (status === 'draft' && state.mode === 'edit') state.page.querySelector('.svj-sheet-summary')?.insertAdjacentHTML('beforebegin', juryProgressNavigatorMarkup());
    state.page.querySelector('.sv-role-nav')?.insertAdjacentHTML('afterend', safetyVoteJourneyNav({ role: 'jury', current: 'jury', campaign: { CampaignType: 'jury_scoring', TitleTh: campaignTitle }, onPage: true }));
    bindDetail();
    bindSafetyVoteImageGallery(state.page);hydrateSafetyVoteImages(state.page);
    if (state.errors.length) state.page.querySelector('.svp-validation')?.focus();
}

function render() {
    if (state.loading) { state.page.innerHTML = loadingMarkup(); return; }
    if (state.error || state.denied || state.moduleDisabled) { state.page.innerHTML = stateMarkup(); bindState(); return; }
    state.screen === 'detail' && state.detail ? renderDetail() : renderList();
}

function collectScores() {
    state.page.querySelectorAll('[data-svj-score]').forEach(input => { const key = input.dataset.svjScore; state.scores[key] = { ...(state.scores[key] || {}), score: input.value }; });
    state.page.querySelectorAll('[data-svj-comment]').forEach(input => { const key = input.dataset.svjComment; state.scores[key] = { ...(state.scores[key] || {}), comment: input.value }; });
}

function updateSaveStatus() {
    const node = state.page?.querySelector('[data-svj-save-status]');
    if (node) { node.dataset.state = state.saveState; node.textContent = state.saveMessage; }
    const progress = scoreProgress(state.detail, state.scores), bar = state.page?.querySelector('.svj-sheet-summary [role=progressbar]');
    if (bar) { bar.setAttribute('aria-valuenow', String(progress.completed)); bar.querySelector('span').style.width = `${progress.percent}%`; }
    const count = state.page?.querySelector('.svj-sheet-summary > div strong'); if (count) count.textContent = `${progress.completed}/${progress.total}`;
    for (const candidate of state.detail?.candidates || []) {
        const criteria = state.detail?.criteria || [];
        const completed = criteria.filter(criterion => {
            const raw = state.scores[scoreKey(candidate.id, criterion.id)]?.score;
            return raw !== '' && raw !== undefined && raw !== null && Number.isFinite(Number(raw));
        }).length;
        const candidateProgress = state.page?.querySelector(`[data-svj-candidate-progress="${Number(candidate.id)}"]`);
        if (candidateProgress) candidateProgress.textContent = `ให้คะแนนแล้ว ${completed}/${criteria.length} เกณฑ์`;
    }
}

function scheduleAutosave() {
    collectScores(); refreshJuryProgressNavigator(); state.draftRevision += 1; writeLocalDraft(); clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveServer(false), 700);
}

async function saveServer(explicit) {
    if (state.savePromise) return state.savePromise;
    collectScores(); writeLocalDraft();
    const errors = validateDraftScoreSheet(state.detail, state.scores);
    if (errors.length) {
        if (explicit) { state.errors = errors; renderDetail(); }
        else { state.saveState = 'local'; state.saveMessage = 'เก็บในแท็บนี้แล้ว · แก้คะแนนที่ไม่ถูกต้องเพื่อบันทึกบนเซิร์ฟเวอร์'; updateSaveStatus(); }
        return false;
    }
    if (state.inFlight) return false;
    state.errors = [];
    const revision = state.draftRevision;
    state.saveState = 'saving'; state.saveMessage = 'กำลังบันทึกฉบับร่างบนเซิร์ฟเวอร์…'; updateSaveStatus();
    state.savePromise = (async () => {
        try {
            if (!await refreshJurySession({ notify: explicit })) return false;
            await API.put(`/safety-vote/jury/assignments/${Number(state.detail.assignment.id)}/scores`, buildScorePayload(state.detail, state.scores), { preserveSessionOnAuthError: true });
            const progress = scoreProgress(state.detail, state.scores);
            state.serverRevision = revision;
            state.saveState = 'saved'; state.saveMessage = `บันทึกอัตโนมัติบนเซิร์ฟเวอร์แล้ว · ${progress.completed}/${progress.total} ช่อง`; updateSaveStatus();
            if (explicit) showToast('บันทึกฉบับร่างคะแนนแล้ว', 'success');
            return true;
        } catch (error) {
            state.saveState = 'error'; state.saveMessage = 'บันทึกบนเซิร์ฟเวอร์ไม่ได้ · ฉบับร่างในอุปกรณ์ยังอยู่'; updateSaveStatus();
            if (explicit) showToast(error?.message || 'บันทึกฉบับร่างบนเซิร์ฟเวอร์ไม่สำเร็จ แต่ฉบับร่างในแท็บนี้ยังอยู่', 'error');
            return false;
        } finally {
            state.savePromise = null;
            if (state.saveState === 'saved' && state.draftRevision > state.serverRevision && state.mode === 'edit') {
                clearTimeout(state.saveTimer);
                state.saveTimer = setTimeout(() => saveServer(false), 250);
            }
        }
    })();
    return state.savePromise;
}

function requestReview() {
    clearTimeout(state.saveTimer);
    collectScores(); state.errors = validateScoreSheet(state.detail, state.scores);
    if (state.errors.length) { renderDetail(); return; }
    state.mode = 'review'; state.submitError = null; renderDetail();
}

async function submitScores() {
    if (state.inFlight) return;
    state.inFlight = true; state.submitError = null; renderDetail();
    const id = Number(state.detail.assignment.id);
    try {
        if (state.savePromise) await state.savePromise;
        if (!await refreshJurySession({ notify: true })) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        await API.put(`/safety-vote/jury/assignments/${id}/scores`, buildScorePayload(state.detail, state.scores), { preserveSessionOnAuthError: true });
        await API.post(`/safety-vote/jury/assignments/${id}/submit`, {}, { preserveSessionOnAuthError: true });
        clearLocalDraft(id);
        const current = await API.get(`/safety-vote/jury/assignments/${id}`, { suppressErrorLog: true });
        state.detail = current.data;
        const submittedAt = valueOf(current.data.assignment, 'SubmittedAt', 'submittedAt');
        const row = state.assignments.find(item => Number(item.id) === id); if (row) { row.Status = 'Submitted'; row.SubmittedAt = submittedAt; }
        state.receipt = safeJuryReceipt(state.detail.assignment); state.mode = 'receipt'; state.inFlight = false;
        showToast('ส่งคะแนนแล้วและไม่สามารถแก้ไขได้', 'success'); renderDetail();
    } catch (error) {
        state.inFlight = false;
        try {
            const current = await API.get(`/safety-vote/jury/assignments/${id}`, { suppressErrorLog: true });
            if (assignmentState(current.data.assignment) === 'submitted') {
                clearLocalDraft(id); state.detail = current.data; state.receipt = safeJuryReceipt(current.data.assignment); state.mode = 'receipt'; renderDetail(); return;
            }
        } catch (_) {}
        state.submitError = error?.message || 'ระบบยังยืนยันการรับคะแนนไม่ได้ กรุณาตรวจสอบสถานะแล้วลองอีกครั้ง'; state.mode = 'review'; renderDetail();
    }
}

function confirmSubmit() {
    openSafetyVoteConfirmDialog({ title: 'ยืนยันส่งคะแนนแบบถาวร', description: 'หลังยืนยัน คะแนนชุดนี้จะแก้ไขไม่ได้ ผู้ดูแลต้องเปิดชุดประเมินรุ่นใหม่หากมีเหตุจำเป็น กรุณาตรวจสอบทุกเกณฑ์ก่อนส่ง', confirmLabel: 'ยืนยันและส่งคะแนน', onConfirm: submitScores });
}

function confirmRecuse() {
    const id = Number(state.detail.assignment.id);
    openSafetyVoteReasonDialog({ title: 'แจ้ง Conflict of Interest / ถอนตัว', description: 'เมื่อยืนยันแล้ว งานนี้จะถูกล็อกและไม่สามารถบันทึกหรือส่งคะแนนได้ กรุณาระบุเหตุผลที่เพียงพอสำหรับผู้ดูแล', label: 'เหตุผลการถอนตัว', confirmLabel: 'ยืนยันถอนตัว', onConfirm: async reason => {
        await API.post(`/safety-vote/jury/assignments/${id}/recuse`, { reason }); clearLocalDraft(id);
        const row = state.assignments.find(item => Number(item.id) === id); if (row) { row.Status = 'Recused'; row.ConflictState = 'recused'; }
        state.screen = 'list'; state.detail = null; state.view = 'recused'; showToast('บันทึกการถอนตัวแล้ว', 'success'); renderList();
    } });
}

async function openAssignment(id) {
    stopSessionKeepAlive();
    state.loading = true; state.error = null; state.denied = false; state.screen = 'detail'; render();
    try {
        const response = await API.get(`/safety-vote/jury/assignments/${Number(id)}`);
        state.detail = response.data; state.selected = state.assignments.find(item => Number(item.id) === Number(id)) || { id };
        await Promise.all((state.detail.candidates||[]).map(async candidate=>{const response=await API.get(`/safety-vote/gallery/candidates/${Number(candidate.id)}`,{suppressErrorLog:true}).catch(()=>null);candidate.gallery=response?.data?.items||[];}));
        state.scores = normalizeScores(state.detail.scores || []); state.errors = []; state.submitError = null; state.mode = 'edit';
        if (assignmentState(state.detail.assignment) === 'draft') {
            const local = readLocalDraft(id), version = Number(valueOf(state.detail.assignment, 'SheetVersion', 'sheetVersion') || 1);
            if (local?.sheetVersion === version && local.scores) { state.scores = { ...state.scores, ...local.scores }; state.saveState = 'local'; state.saveMessage = 'กู้คืนฉบับร่างจากอุปกรณ์นี้แล้ว'; }
            else { state.saveState = Object.keys(state.scores).length ? 'saved' : 'idle'; state.saveMessage = Object.keys(state.scores).length ? 'โหลดฉบับร่างจากเซิร์ฟเวอร์แล้ว' : 'ยังไม่มีการแก้ไข'; }
        } else if (assignmentState(state.detail.assignment) === 'submitted') { state.receipt = safeJuryReceipt(state.detail.assignment); state.mode = 'receipt'; }
        state.loading = false; render();
        if (assignmentState(state.detail.assignment) === 'draft') startSessionKeepAlive();
    } catch (error) {
        state.loading = false; state.denied = error?.code === 'ASSIGNMENT_NOT_FOUND' || error?.code === 'PERMISSION_DENIED' || Number(error?.status) === 403;
        state.moduleDisabled = error?.code === 'SAFETY_VOTE_MODULE_DISABLED'; state.error = state.denied || state.moduleDisabled ? null : error; render();
    }
}

function bindList() {
    state.page.querySelector('[data-sv-role-link="user"]')?.addEventListener('click', event => { event.preventDefault(); state.onUser?.(); });
    state.page.querySelector('[data-svj-search]')?.addEventListener('input', event => { state.query = event.target.value; renderList(); requestAnimationFrame(() => { const input = state.page.querySelector('[data-svj-search]'); input?.focus(); input?.setSelectionRange(state.query.length, state.query.length); }); });
    state.page.querySelectorAll('[data-svj-view]').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.svjView; renderList(); }));
    state.page.querySelectorAll('[data-svj-assignment]').forEach(button => button.addEventListener('click', () => openAssignment(Number(button.dataset.svjAssignment))));
}

function bindDetail() {
    state.page.querySelector('.svj-main')?.addEventListener('click', event => {
        const work = event.target.closest('[data-svj-progress-work]');
        if (work) {
            event.preventDefault();
            state.progressCandidateId = Number(work.dataset.svjProgressWork);
            refreshJuryProgressNavigator();
            return;
        }
        const score = event.target.closest('[data-svj-progress-score]');
        if (score) {
            event.preventDefault();
            focusValidationTarget(score.dataset.svjProgressScore);
        }
    });
    state.page.querySelector('[data-sv-role-link="user"]')?.addEventListener('click', event => { event.preventDefault(); state.onUser?.(); });
    const syncScoreUi = (key, raw, schedule = false) => {
        const number = state.page.querySelector(`[data-svj-score="${key}"]`), range = state.page.querySelector(`[data-svj-score-range="${key}"]`), output = state.page.querySelector(`[data-svj-score-output="${key}"]`);
        if (!number || !range) return;
        const min = Number(number.min), max = Number(number.max), numeric = Number(raw), valid = raw !== '' && Number.isFinite(numeric) && numeric >= min && numeric <= max;
        number.value = raw;
        number.setAttribute('aria-invalid', valid || raw === '' ? 'false' : 'true');
        if (valid) range.value = String(numeric);
        if (output) output.textContent = valid ? `${numeric} / ${max}` : raw === '' ? 'ยังไม่เลือก' : `ต้องอยู่ระหว่าง ${min}–${max}`;
        state.page.querySelectorAll(`[data-svj-score-quick="${key}"]`).forEach(button => button.setAttribute('aria-pressed', valid && Number(button.dataset.score) === numeric ? 'true' : 'false'));
        if (schedule) scheduleAutosave();
    };
    state.page.querySelectorAll('[data-svj-score]').forEach(input => input.addEventListener('input', () => syncScoreUi(input.dataset.svjScore, input.value, true)));
    state.page.querySelectorAll('[data-svj-score-range]').forEach(input => input.addEventListener('input', () => syncScoreUi(input.dataset.svjScoreRange, input.value, true)));
    state.page.querySelectorAll('[data-svj-score-step]').forEach(button => button.addEventListener('click', () => {
        const input = state.page.querySelector(`[data-svj-score="${button.dataset.scoreKey}"]`); if (!input) return;
        const min = Number(input.min), max = Number(input.max), step = Number(input.step || 1), current = input.value === '' ? (Number(button.dataset.svjScoreStep) > 0 ? min - step : max + step) : Number(input.value);
        const next = Math.max(min, Math.min(max, Math.round((current + Number(button.dataset.svjScoreStep) * step) * 100) / 100));
        syncScoreUi(button.dataset.scoreKey, String(next), true);
    }));
    state.page.querySelectorAll('[data-svj-score-quick]').forEach(button => button.addEventListener('click', () => syncScoreUi(button.dataset.svjScoreQuick, button.dataset.score, true)));
    state.page.querySelectorAll('[data-svj-comment]').forEach(input => input.addEventListener('input', scheduleAutosave));
    state.page.querySelectorAll('[data-svj-error-key]').forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        focusValidationTarget(link.dataset.svjErrorKey);
    }));
    state.page.querySelectorAll('[data-svj-edit-work]').forEach(button => button.addEventListener('click', () => {
        const candidateId = Number(button.dataset.svjEditWork);
        state.mode = 'edit'; state.submitError = null; state.progressCandidateId = candidateId; renderDetail();
        requestAnimationFrame(() => {
            const target = state.page.querySelector(`#svj-candidate-${candidateId}`);
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target?.querySelector('[data-svj-score]')?.focus({ preventScroll: true });
        });
    }));
    state.page.querySelectorAll('[data-svj-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.svjAction;
        if (action === 'back-list') { clearTimeout(state.saveTimer); stopSessionKeepAlive(); state.screen = 'list'; state.detail = null; state.receipt = null; renderList(); }
        else if (action === 'save') saveServer(true);
        else if (action === 'review') requestReview();
        else if (action === 'edit') { state.mode = 'edit'; state.submitError = null; renderDetail(); }
        else if (action === 'confirm') confirmSubmit();
        else if (action === 'recuse') confirmRecuse();
    }));
}

function bindState() {
    state.page.querySelector('[data-sv-role-link="user"]')?.addEventListener('click', event => { event.preventDefault(); state.onUser?.(); });
    state.page.querySelector('[data-svj-action="retry"]')?.addEventListener('click', () => loadQueue());
    state.page.querySelector('[data-svj-action="back-list"]')?.addEventListener('click', () => loadQueue());
}

async function loadQueue(initialAssignmentId = null) {
    stopSessionKeepAlive();
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.screen = 'list'; render();
    try {
        const response = await API.get('/safety-vote/jury/assignments', { suppressErrorLog: true });
        state.assignments = (response.data.rows || []).filter(item => assignmentState(item) !== 'revoked'); clearStaleDrafts(state.assignments); state.loading = false;
        if (initialAssignmentId) return openAssignment(Number(initialAssignmentId));
        renderList();
    } catch (error) {
        state.loading = false; state.moduleDisabled = error?.code === 'SAFETY_VOTE_MODULE_DISABLED';
        state.denied = !state.moduleDisabled && (error?.code === 'PERMISSION_DENIED' || Number(error?.status) === 403);
        state.error = state.moduleDisabled || state.denied ? null : error; render();
    }
}

export async function loadSafetyVoteJuryWorkspace({ page = document.getElementById('safety-vote-page'), initialAssignmentId = null, onUser = null } = {}) {
    if (!isSafetyVoteUxV1Enabled() || !page) return false;
    clearTimeout(state.saveTimer);
    stopSessionKeepAlive();
    Object.assign(state, { page, assignments: [], detail: null, selected: null, query: '', view: 'draft', screen: 'list', mode: 'edit', scores: {}, errors: [], receipt: null, loading: true, error: null, denied: false, moduleDisabled: false, inFlight: false, saveState: 'idle', saveMessage: '', submitError: null, savePromise: null, draftRevision: 0, serverRevision: 0, onUser });
    await loadQueue(initialAssignmentId);
    return true;
}
