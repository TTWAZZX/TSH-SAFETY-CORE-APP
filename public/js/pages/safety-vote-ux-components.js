import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';

const STATUS_COPY = {
    Draft: ['ฉบับร่าง', 'draft'],
    Scheduled: ['รอเปิด', 'scheduled'],
    Open: ['กำลังเปิด', 'open'],
    Paused: ['หยุดชั่วคราว', 'paused'],
    Closed: ['ปิดแล้ว', 'closed'],
    Certified: ['รับรองแล้ว', 'certified'],
    Published: ['เผยแพร่แล้ว', 'published'],
    Archived: ['เก็บถาวร', 'archived'],
    Voided: ['ยกเลิก', 'voided']
};

export function isSafetyVoteUxV1Enabled() {
    return globalThis.window?.__TSH_FEATURE_FLAGS__?.safetyVoteUxV1 === true;
}

export function safetyVoteStatusBadge(status, extraClass = '') {
    const key = String(status || 'Draft');
    const [label, tone] = STATUS_COPY[key] || [key || 'ไม่ทราบสถานะ', 'neutral'];
    return `<span class="sv-status-badge sv-status-badge--${tone} ${extraClass}" aria-label="สถานะแคมเปญ: ${escHtml(label)}"><span aria-hidden="true" class="sv-status-dot"></span>${escHtml(label)}</span>`;
}

export function safetyVoteRoleNav({ active = 'user', showAdmin = false, showJury = false, juryCount = 0 } = {}) {
    const items = [
        { key: 'user', label: 'กิจกรรมของฉัน', href: '#safety-vote', show: true },
        { key: 'jury', label: `งานประเมิน${juryCount ? ` (${juryCount})` : ''}`, href: '#safety-vote', show: showJury },
        { key: 'admin', label: 'จัดการ Safety Vote', href: '#admin', show: showAdmin }
    ].filter(item => item.show);
    return `<nav class="sv-role-nav" aria-label="พื้นที่ Safety Vote ตามบทบาท">${items.map(item => `<a class="sv-role-nav__item" href="${item.href}" ${item.key === active ? 'aria-current="page"' : ''} data-sv-role-link="${item.key}">${escHtml(item.label)}</a>`).join('')}</nav>`;
}

export function safetyVoteEmptyState({ title, description, actionLabel = '', action = '' }) {
    return `<section class="sv-empty-state" aria-labelledby="sv-empty-title"><span class="sv-empty-state__icon" aria-hidden="true">◎</span><h2 id="sv-empty-title">${escHtml(title)}</h2><p>${escHtml(description)}</p>${actionLabel ? `<button type="button" class="sv-button sv-button--primary" data-sv-action="${escHtml(action)}">${escHtml(actionLabel)}</button>` : ''}</section>`;
}

export function safetyVoteActionBar(actions = []) {
    return `<div class="sv-action-bar" role="group" aria-label="การดำเนินการกับแคมเปญ">${actions.map(action => `<button type="button" class="sv-button ${action.primary ? 'sv-button--primary' : 'sv-button--secondary'}" data-sv-action="${escHtml(action.action)}" ${action.disabled ? 'disabled' : ''}>${escHtml(action.label)}</button>`).join('')}</div>`;
}

export function safetyVoteCampaignPreview({ campaign = {}, questions = [], mode = 'user' } = {}) {
    const title = campaign.titleTh || campaign.TitleTh || 'ชื่อแคมเปญ';
    const summary = campaign.summary || campaign.Summary || 'คำอธิบายกิจกรรมจะแสดงในพื้นที่นี้';
    const privacy = { identified: 'ระบุตัวตน', confidential: 'ข้อมูลลับ', anonymous: 'ไม่ระบุตัวตน', secret_ballot: 'บัตรลงคะแนนลับ' }[campaign.privacyMode || campaign.PrivacyMode] || 'ตามนโยบายแคมเปญ';
    if (mode === 'juror') {
        return `<article class="sv-live-preview sv-live-preview--juror" aria-label="ตัวอย่างหน้าจอกรรมการ"><p class="sv-eyebrow">งานประเมิน</p><h3>${escHtml(title)}</h3><p>${escHtml(summary)}</p><div class="sv-live-preview__notice"><strong>แบบประเมินที่ได้รับมอบหมาย</strong><span>ระบบจะแสดงเฉพาะรายการที่เซิร์ฟเวอร์มอบหมายให้กรรมการคนนี้</span></div><fieldset><legend>เกณฑ์ตัวอย่าง</legend><label><span>ความครบถ้วนและประโยชน์ต่อความปลอดภัย</span><input type="number" min="0" max="10" value="8" aria-label="คะแนนตัวอย่าง" disabled></label></fieldset></article>`;
    }
    return `<article class="sv-live-preview" aria-label="ตัวอย่างหน้าจอผู้เข้าร่วม"><div class="sv-live-preview__cover"><p class="sv-eyebrow">Safety Vote</p><h3>${escHtml(title)}</h3><p>${escHtml(summary)}</p></div><div class="sv-live-preview__meta"><span>${escHtml(privacy)}</span><span>ยังไม่เปิดใช้งาน</span></div>${questions.length ? questions.slice(0, 2).map((question, index) => `<fieldset><legend>${index + 1}. ${escHtml(question.title || 'คำถามตัวอย่าง')}</legend><div class="sv-live-preview__choices">${(question.options?.length ? question.options.slice(0, 3) : [{ label: 'พื้นที่กรอกคำตอบ' }]).map(option => `<span>${escHtml(option.label || 'ตัวเลือก')}</span>`).join('')}</div></fieldset>`).join('') : '<div class="sv-live-preview__notice"><strong>ยังไม่มีเนื้อหา</strong><span>เพิ่มคำถามหรือตัวเลือกในขั้นเนื้อหาเพื่อดูตัวอย่าง</span></div>'}</article>`;
}

let dialogRestoreTarget = null;

export function closeSafetyVoteDialog(root = document) {
    const dialog = root.querySelector('[data-sv-dialog]');
    if (!dialog) return;
    dialog.remove();
    if (dialogRestoreTarget?.isConnected) dialogRestoreTarget.focus();
    dialogRestoreTarget = null;
}

export function openSafetyVoteConfirmDialog({
    title,
    description,
    confirmLabel = 'ยืนยัน',
    cancelLabel = 'ยกเลิก',
    tone = 'primary',
    onConfirm = () => {},
    root = document
}) {
    closeSafetyVoteDialog(root);
    dialogRestoreTarget = root.activeElement;
    const host = root.createElement('div');
    host.dataset.svDialog = 'confirm';
    host.className = 'sv-dialog-layer';
    host.innerHTML = `<div class="sv-dialog-backdrop" data-sv-dialog-close></div><section class="sv-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sv-dialog-title" aria-describedby="sv-dialog-description"><h2 id="sv-dialog-title">${escHtml(title)}</h2><p id="sv-dialog-description">${escHtml(description)}</p><div class="sv-dialog__actions"><button type="button" class="sv-button sv-button--secondary" data-sv-dialog-close>${escHtml(cancelLabel)}</button><button type="button" class="sv-button ${tone === 'danger' ? 'sv-button--danger' : 'sv-button--primary'}" data-sv-dialog-confirm>${escHtml(confirmLabel)}</button></div></section>`;
    root.body.appendChild(host);
    const focusable = [...host.querySelectorAll('button')];
    host.querySelector('[data-sv-dialog-confirm]')?.focus();
    const close = () => closeSafetyVoteDialog(root);
    host.querySelectorAll('[data-sv-dialog-close]').forEach(button => button.addEventListener('click', close));
    host.querySelector('[data-sv-dialog-confirm]')?.addEventListener('click', async () => {
        const button = host.querySelector('[data-sv-dialog-confirm]');
        button.disabled = true;
        try { await onConfirm(); close(); } catch (_) { button.disabled = false; }
    });
    host.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab' || !focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
    });
}

export function openSafetyVoteReasonDialog({
    title,
    description,
    label = 'เหตุผล',
    confirmLabel = 'ยืนยัน',
    cancelLabel = 'ยกเลิก',
    maxLength = 1000,
    onConfirm = () => {},
    root = document
}) {
    closeSafetyVoteDialog(root);
    dialogRestoreTarget = root.activeElement;
    const host = root.createElement('div');
    host.dataset.svDialog = 'reason';
    host.className = 'sv-dialog-layer';
    host.innerHTML = `<div class="sv-dialog-backdrop" data-sv-dialog-close></div><section class="sv-dialog" role="dialog" aria-modal="true" aria-labelledby="sv-dialog-title" aria-describedby="sv-dialog-description"><h2 id="sv-dialog-title">${escHtml(title)}</h2><p id="sv-dialog-description">${escHtml(description)}</p><label class="sv-dialog__field" for="sv-dialog-reason"><span>${escHtml(label)}</span><textarea id="sv-dialog-reason" rows="5" maxlength="${Number(maxLength)}" aria-describedby="sv-dialog-reason-error"></textarea></label><p id="sv-dialog-reason-error" class="sv-dialog__error" role="alert" aria-live="assertive"></p><div class="sv-dialog__actions"><button type="button" class="sv-button sv-button--secondary" data-sv-dialog-close>${escHtml(cancelLabel)}</button><button type="button" class="sv-button sv-button--danger" data-sv-dialog-confirm>${escHtml(confirmLabel)}</button></div></section>`;
    root.body.appendChild(host);
    const textarea = host.querySelector('textarea'), focusable = [textarea, ...host.querySelectorAll('button')];
    textarea?.focus();
    const close = () => closeSafetyVoteDialog(root);
    host.querySelectorAll('[data-sv-dialog-close]').forEach(button => button.addEventListener('click', close));
    host.querySelector('[data-sv-dialog-confirm]')?.addEventListener('click', async () => {
        const reason = textarea?.value.trim() || '', error = host.querySelector('.sv-dialog__error');
        if (!reason) { error.textContent = 'กรุณาระบุเหตุผลก่อนยืนยัน'; textarea?.setAttribute('aria-invalid', 'true'); textarea?.focus(); return; }
        const button = host.querySelector('[data-sv-dialog-confirm]');
        button.disabled = true; textarea.disabled = true;
        try { await onConfirm(reason); close(); } catch (caught) { button.disabled = false; textarea.disabled = false; error.textContent = caught?.message || 'ยังบันทึกเหตุผลไม่ได้ กรุณาลองอีกครั้ง'; }
    });
    host.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab' || !focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first.focus(); }
    });
}
