import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { isSafetyVoteUxV1Enabled, openSafetyVoteConfirmDialog, openSafetyVoteReasonDialog, safetyVoteRoleNav } from './safety-vote-ux-components.js?v=20261008-safety-vote-ux4-r1';
import {
    JURY_VIEW_LABELS, assignmentProgress, assignmentState, buildScorePayload, filterAssignments,
    normalizeScores, safeJuryReceipt, scoreKey, scoreProgress, validateScoreSheet, valueOf
} from './safety-vote-jury-model.mjs?v=20261008-safety-vote-ux4-r1';

const STORAGE_PREFIX = 'safety-vote-jury-draft:';
const state = {
    page: null, assignments: [], detail: null, selected: null, query: '', view: 'draft', screen: 'list', mode: 'edit',
    scores: {}, errors: [], receipt: null, loading: true, error: null, denied: false, moduleDisabled: false,
    inFlight: false, saveState: 'idle', saveMessage: '', submitError: null, saveTimer: null, savePromise: null, onUser: null
};

function dateTime(value) {
    if (!value) return 'ไม่ระบุเวลา';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'ไม่ระบุเวลา' : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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
    const status = assignmentState(item), scope = String(valueOf(item, 'AssignmentScope', 'assignmentScope')) === 'candidate' ? 'เฉพาะรายการที่มอบหมาย' : 'ทุกรายการในรอบ';
    return `<button type="button" class="svj-card" data-svj-assignment="${Number(item.id)}"><span class="svj-card__top"><span class="sv-status-badge sv-status-badge--${status === 'draft' ? 'scheduled' : status === 'submitted' ? 'published' : 'closed'}"><span class="sv-status-dot"></span>${JURY_VIEW_LABELS[status]}</span><span>ชุดที่ ${Number(valueOf(item, 'SheetVersion', 'sheetVersion') || 1)}</span></span><strong>${escHtml(valueOf(item, 'CampaignTitle', 'campaignTitle') || 'งานประเมิน Safety Vote')}</strong><span>รอบประเมิน #${Number(valueOf(item, 'StageID', 'stageId'))}</span><small>${escHtml(scope)}${status === 'submitted' ? ` · ส่ง ${dateTime(valueOf(item, 'SubmittedAt', 'submittedAt'))}` : ''}</small></button>`;
}

function renderList() {
    const rows = filterAssignments(state.assignments, { view: state.view, query: state.query }), progress = assignmentProgress(state.assignments);
    const counts = Object.fromEntries(Object.keys(JURY_VIEW_LABELS).map(key => [key, state.assignments.filter(item => assignmentState(item) === key).length]));
    state.page.innerHTML = `<div class="svj-shell" data-sv-jury-workspace="2026-10-08-safety-vote-ux4-r1">${safetyVoteRoleNav({ active: 'jury', showJury: true, juryCount: state.assignments.length })}<header class="svj-hero"><div><p class="sv-eyebrow">Safety Vote · Juror</p><h1>งานประเมินของฉัน</h1><p>แสดงเฉพาะงานที่ระบบมอบหมายให้บัญชีกรรมการของคุณ</p></div><div class="svj-progress-card" aria-label="ส่งแล้ว ${progress.submitted} จาก ${progress.total} งาน"><strong>${progress.submitted}/${progress.total}</strong><span>ส่งแล้ว</span><div class="svj-progress"><span style="width:${progress.total ? Math.round(progress.submitted / progress.total * 100) : 0}%"></span></div></div></header><section class="svj-toolbar" aria-label="ค้นหาและกรองงานประเมิน"><label><span class="sr-only">ค้นหางานประเมิน</span><input type="search" data-svj-search value="${escHtml(state.query)}" placeholder="ค้นหาชื่อกิจกรรม รอบ หรือสถานะ"></label><div class="svj-tabs" role="tablist" aria-label="สถานะงานประเมิน">${Object.entries(JURY_VIEW_LABELS).map(([key, label]) => `<button type="button" role="tab" data-svj-view="${key}" aria-selected="${state.view === key}">${label} <span>${counts[key]}</span></button>`).join('')}</div></section><main><section class="svj-card-grid" aria-label="รายการงานประเมิน">${rows.length ? rows.map(assignmentCard).join('') : `<div class="svp-empty"><span aria-hidden="true">✓</span><h2>${state.query ? 'ไม่พบงานประเมินที่ค้นหา' : `ยังไม่มีงาน${JURY_VIEW_LABELS[state.view]}`}</h2><p>${state.query ? 'ลองเปลี่ยนคำค้นหาหรือสถานะ' : 'เมื่อได้รับมอบหมายหรือสถานะเปลี่ยน รายการจะแสดงที่นี่'}</p></div>`}</section></main><p class="sr-only" aria-live="polite">แสดง ${rows.length} งานประเมิน</p></div>`;
    bindList();
}

function criterionValue(criterion, key) { return valueOf(criterion, key, key[0].toLowerCase() + key.slice(1)); }
function scoreControl(candidate, criterion) {
    const key = scoreKey(candidate.id, criterion.id), row = state.scores[key] || {}, min = Number(criterionValue(criterion, 'MinScore')), max = Number(criterionValue(criterion, 'MaxScore'));
    return `<article class="svj-score-row" id="svj-score-${key.replace(':', '-')}"><div><strong>${escHtml(criterionValue(criterion, 'Title'))}</strong>${criterionValue(criterion, 'Description') ? `<p>${escHtml(criterionValue(criterion, 'Description'))}</p>` : ''}<small>ช่วงคะแนน ${min}–${max} · น้ำหนัก ${Number(criterionValue(criterion, 'Weight'))}</small></div><label><span>คะแนน</span><input type="number" min="${min}" max="${max}" step="0.01" value="${escHtml(row.score ?? '')}" data-svj-score="${key}" aria-label="คะแนน ${escHtml(criterionValue(criterion, 'Title'))} สำหรับ ${escHtml(candidate.displayName)}"></label><label class="svj-comment"><span>หมายเหตุ (ไม่บังคับ)</span><textarea rows="2" maxlength="1000" data-svj-comment="${key}">${escHtml(row.comment || '')}</textarea></label></article>`;
}

function validationMarkup() {
    return state.errors.length ? `<section class="svp-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบคะแนน</h2><ul>${state.errors.map(error => `<li><a href="#svj-score-${error.key.replace(':', '-')}">${escHtml(error.message)}</a></li>`).join('')}</ul></section>` : '';
}

function editMarkup() {
    const progress = scoreProgress(state.detail, state.scores);
    return `${validationMarkup()}<section class="svj-sheet-summary"><div><strong>${progress.completed}/${progress.total}</strong><span>รายการที่ให้คะแนนแล้ว</span></div><div class="svj-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.completed}" aria-label="ความคืบหน้าการให้คะแนน"><span style="width:${progress.percent}%"></span></div><p data-svj-save-status data-state="${state.saveState}" aria-live="polite">${escHtml(state.saveMessage || 'ยังไม่มีการแก้ไข')}</p></section><form class="svj-score-form" data-svj-form novalidate>${(state.detail.candidates || []).map((candidate, index) => `<fieldset class="svj-candidate"><legend><span>${index + 1}</span>${escHtml(candidate.displayName)}</legend><p class="svj-candidate__code">รหัสรายการ ${escHtml(candidate.candidateNo)}</p>${(state.detail.criteria || []).map(criterion => scoreControl(candidate, criterion)).join('')}</fieldset>`).join('')}</form>`;
}

function reviewMarkup() {
    return `<section class="svj-review" aria-labelledby="svj-review-title"><p class="sv-eyebrow">ตรวจสอบก่อนส่ง</p><h2 id="svj-review-title">ตรวจคะแนนทุกเกณฑ์อีกครั้ง</h2><p>ระบบจะแสดงชื่อรายการตาม blind mode ที่เซิร์ฟเวอร์กำหนดเท่านั้น</p><div class="svj-review-grid">${(state.detail.candidates || []).map(candidate => `<article><h3>${escHtml(candidate.displayName)}</h3><dl>${(state.detail.criteria || []).map(criterion => { const row = state.scores[scoreKey(candidate.id, criterion.id)] || {}; return `<div><dt>${escHtml(criterionValue(criterion, 'Title'))}</dt><dd>${Number(row.score)}</dd></div>`; }).join('')}</dl></article>`).join('')}</div><div class="svp-immutable-warning" role="note"><strong>เมื่อยืนยันแล้ว คะแนนชุดนี้จะแก้ไขไม่ได้</strong><span>การเปิดรอบแก้ไขต้องดำเนินการโดยผู้ดูแลที่มีสิทธิ์ และระบบจะสร้างชุดประเมินรุ่นใหม่โดยเก็บชุดเดิมไว้</span></div>${state.submitError ? `<div class="svp-submit-error" role="alert"><strong>ยังยืนยันการส่งไม่ได้</strong><span>${escHtml(state.submitError)}</span><small>ระบบตรวจสถานะล่าสุดแล้วและไม่ส่งซ้ำอัตโนมัติ</small></div>` : ''}</section>`;
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
    const assignment = state.detail.assignment, status = assignmentState(assignment), campaignTitle = valueOf(state.selected || {}, 'CampaignTitle', 'campaignTitle') || 'งานประเมิน Safety Vote';
    const body = state.mode === 'receipt' ? receiptMarkup() : state.mode === 'review' ? reviewMarkup() : status === 'draft' ? editMarkup() : lockedMarkup();
    state.page.innerHTML = `<div class="svj-shell svj-shell--detail" data-sv-jury-workspace="2026-10-08-safety-vote-ux4-r1">${safetyVoteRoleNav({ active: 'jury', showJury: true, juryCount: state.assignments.length })}<header class="svj-detail-header"><button type="button" class="sv-icon-button" data-svj-action="back-list" aria-label="กลับงานประเมินของฉัน">←</button><div><p class="sv-eyebrow">รอบประเมิน #${Number(valueOf(assignment, 'StageID', 'stageId'))} · ชุดที่ ${Number(valueOf(assignment, 'SheetVersion', 'sheetVersion') || 1)}</p><h1>${escHtml(campaignTitle)}</h1><p>${state.detail.blind ? 'การประเมินแบบปกปิดตัวตน — ใช้เฉพาะชื่อแทนที่เซิร์ฟเวอร์ส่งมา' : 'ประเมินตามรายการและเกณฑ์ที่ได้รับมอบหมาย'}</p></div><span class="sv-status-badge sv-status-badge--${status === 'draft' ? 'scheduled' : status === 'submitted' ? 'published' : 'closed'}"><span class="sv-status-dot"></span>${JURY_VIEW_LABELS[status]}</span></header>${state.detail.blind ? '<section class="svj-blind-notice" role="note"><strong>Blind judging</strong><span>ห้ามใช้ข้อมูลนอกหน้าจอนี้เพื่อพยายามระบุตัวผู้ส่งผลงาน</span></section>' : ''}<main class="svj-main" aria-live="polite">${body}</main>${actionBarMarkup()}</div>`;
    bindDetail();
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
}

function scheduleAutosave() {
    collectScores(); writeLocalDraft(); clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => saveServer(false), 700);
}

async function saveServer(explicit) {
    if (state.savePromise) return state.savePromise;
    collectScores(); writeLocalDraft();
    const errors = validateScoreSheet(state.detail, state.scores);
    if (errors.length) {
        if (explicit) { state.errors = errors; renderDetail(); }
        else { state.saveState = 'local'; state.saveMessage = 'เก็บในอุปกรณ์นี้แล้ว · บันทึกบนเซิร์ฟเวอร์เมื่อกรอกครบ'; updateSaveStatus(); }
        return false;
    }
    if (state.inFlight) return false;
    state.saveState = 'saving'; state.saveMessage = 'กำลังบันทึกฉบับร่างบนเซิร์ฟเวอร์…'; updateSaveStatus();
    state.savePromise = (async () => {
        try {
            await API.put(`/safety-vote/jury/assignments/${Number(state.detail.assignment.id)}/scores`, buildScorePayload(state.detail, state.scores));
            state.saveState = 'saved'; state.saveMessage = 'บันทึกฉบับร่างบนเซิร์ฟเวอร์แล้ว'; updateSaveStatus();
            if (explicit) showToast('บันทึกฉบับร่างคะแนนแล้ว', 'success');
            return true;
        } catch (error) {
            state.saveState = 'error'; state.saveMessage = 'บันทึกบนเซิร์ฟเวอร์ไม่ได้ · ฉบับร่างในอุปกรณ์ยังอยู่'; updateSaveStatus();
            if (explicit) { state.errors = [{ key: Object.keys(state.scores)[0] || '0:0', message: error?.message || 'บันทึกฉบับร่างไม่สำเร็จ' }]; renderDetail(); }
            return false;
        } finally {
            state.savePromise = null;
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
        await API.put(`/safety-vote/jury/assignments/${id}/scores`, buildScorePayload(state.detail, state.scores));
        await API.post(`/safety-vote/jury/assignments/${id}/submit`, {});
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
    state.loading = true; state.error = null; state.denied = false; state.screen = 'detail'; render();
    try {
        const response = await API.get(`/safety-vote/jury/assignments/${Number(id)}`);
        state.detail = response.data; state.selected = state.assignments.find(item => Number(item.id) === Number(id)) || { id };
        state.scores = normalizeScores(state.detail.scores || []); state.errors = []; state.submitError = null; state.mode = 'edit';
        if (assignmentState(state.detail.assignment) === 'draft') {
            const local = readLocalDraft(id), version = Number(valueOf(state.detail.assignment, 'SheetVersion', 'sheetVersion') || 1);
            if (local?.sheetVersion === version && local.scores) { state.scores = { ...state.scores, ...local.scores }; state.saveState = 'local'; state.saveMessage = 'กู้คืนฉบับร่างจากอุปกรณ์นี้แล้ว'; }
            else { state.saveState = Object.keys(state.scores).length ? 'saved' : 'idle'; state.saveMessage = Object.keys(state.scores).length ? 'โหลดฉบับร่างจากเซิร์ฟเวอร์แล้ว' : 'ยังไม่มีการแก้ไข'; }
        } else if (assignmentState(state.detail.assignment) === 'submitted') { state.receipt = safeJuryReceipt(state.detail.assignment); state.mode = 'receipt'; }
        state.loading = false; render();
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
    state.page.querySelector('[data-sv-role-link="user"]')?.addEventListener('click', event => { event.preventDefault(); state.onUser?.(); });
    state.page.querySelectorAll('[data-svj-score],[data-svj-comment]').forEach(input => input.addEventListener('input', scheduleAutosave));
    state.page.querySelectorAll('[data-svj-action]').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.svjAction;
        if (action === 'back-list') { clearTimeout(state.saveTimer); state.screen = 'list'; state.detail = null; state.receipt = null; renderList(); }
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
    state.loading = true; state.error = null; state.denied = false; state.moduleDisabled = false; state.screen = 'list'; render();
    try {
        const response = await API.get('/safety-vote/jury/assignments', { suppressErrorLog: true });
        state.assignments = response.data.rows || []; clearStaleDrafts(state.assignments); state.loading = false;
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
    Object.assign(state, { page, assignments: [], detail: null, selected: null, query: '', view: 'draft', screen: 'list', mode: 'edit', scores: {}, errors: [], receipt: null, loading: true, error: null, denied: false, moduleDisabled: false, inFlight: false, saveState: 'idle', saveMessage: '', submitError: null, savePromise: null, onUser });
    await loadQueue(initialAssignmentId);
    return true;
}
