import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';
import { journeyPosition } from './safety-vote-journey-model.mjs?v=20261009-safety-vote-ux8-r1';

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

export function safetyVoteJourneyNav({ role = 'admin', current = 'center', campaign = {}, onPage = false } = {}) {
    const campaignType = campaign.CampaignType || campaign.campaignType || 'popular_vote';
    const { steps, index } = journeyPosition({ role, campaignType, current });
    const title = campaign.TitleTh || campaign.titleTh || campaign.CampaignCode || campaign.campaignCode || '';
    const crumbs = [
        `<a href="${role === 'admin' ? '#admin' : '#safety-vote'}" data-sv-journey-home>${role === 'admin' ? 'จัดการ Safety Vote' : role === 'jury' ? 'งานประเมินของฉัน' : 'กิจกรรมของฉัน'}</a>`,
        title ? `<span aria-current="location">${escHtml(title)}</span>` : ''
    ].filter(Boolean).join('<span aria-hidden="true">/</span>');
    return `<div class="sv-journey" data-sv-journey="2026-10-09-safety-vote-ux8-r1"><nav class="sv-breadcrumbs" aria-label="เส้นทางปัจจุบัน">${crumbs}</nav><nav class="sv-journey-steps" aria-label="ขั้นตอน Safety Vote"><ol>${steps.map((step, stepIndex) => `<li class="${stepIndex < index ? 'is-complete' : stepIndex === index ? 'is-current' : ''}"><button type="button" data-sv-journey-step="${step.key}" ${stepIndex === index ? 'aria-current="step"' : ''} ${onPage || stepIndex === index ? 'disabled' : ''}><span aria-hidden="true">${stepIndex + 1}</span><strong>${escHtml(step.label)}</strong></button></li>`).join('')}</ol></nav><p class="sr-only" aria-live="polite">${index >= 0 ? `ขั้นตอนปัจจุบัน ${index + 1} จาก ${steps.length}: ${escHtml(steps[index].label)}` : 'พื้นที่ Safety Vote'}</p></div>`;
}

export function safetyVoteStatePanel({ kind = 'error', eyebrow = '', title, description, retryAction = '', backHref = '' } = {}) {
    const role = kind === 'denied' || kind === 'error' ? 'alert' : 'status';
    return `<section class="svp-state svp-state--${escHtml(kind)}" role="${role}" tabindex="-1" data-sv-state="${escHtml(kind)}">${eyebrow ? `<p class="sv-eyebrow">${escHtml(eyebrow)}</p>` : ''}<h1>${escHtml(title || 'Safety Vote ยังไม่พร้อม')}</h1><p>${escHtml(description || 'ยังไม่สามารถแสดงข้อมูลส่วนนี้ได้')}</p>${retryAction ? `<button type="button" class="sv-button sv-button--primary" data-sv-retry="${escHtml(retryAction)}">ลองอีกครั้ง</button>` : ''}${backHref ? `<a class="sv-button sv-button--secondary" href="${escHtml(backHref)}">กลับหน้าหลัก</a>` : ''}</section>`;
}

export function focusSafetyVoteHeading(root = document) {
    requestAnimationFrame(() => {
        const heading = root?.querySelector?.('h1');
        if (!heading) return;
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
    });
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

export function openSafetyVoteHashReasonDialog({
    title,
    description,
    expectedHash,
    confirmLabel = 'ยืนยันการรับรอง',
    onConfirm = () => {},
    root = document
}) {
    closeSafetyVoteDialog(root);
    dialogRestoreTarget = root.activeElement;
    const hash = String(expectedHash || '').toLowerCase();
    const host = root.createElement('div');
    host.dataset.svDialog = 'hash-reason';
    host.className = 'sv-dialog-layer';
    host.innerHTML = `<div class="sv-dialog-backdrop" data-sv-dialog-close></div><section class="sv-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sv-dialog-title" aria-describedby="sv-dialog-description"><h2 id="sv-dialog-title">${escHtml(title)}</h2><p id="sv-dialog-description">${escHtml(description)}</p><div class="sv-hash-review"><span>Result SHA-256 ที่ต้องตรวจสอบ</span><code>${escHtml(hash)}</code></div><label class="sv-dialog__field" for="sv-dialog-hash"><span>กรอก Result SHA-256 ให้ตรงกันทุกตัว</span><input id="sv-dialog-hash" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="64" aria-describedby="sv-dialog-hash-error"></label><p id="sv-dialog-hash-error" class="sv-dialog__error" role="alert" aria-live="assertive"></p><label class="sv-dialog__field" for="sv-dialog-reason"><span>เหตุผลการรับรอง</span><textarea id="sv-dialog-reason" rows="4" maxlength="1000" aria-describedby="sv-dialog-reason-error"></textarea></label><p id="sv-dialog-reason-error" class="sv-dialog__error" role="alert" aria-live="assertive"></p><div class="sv-dialog__actions"><button type="button" class="sv-button sv-button--secondary" data-sv-dialog-close>ยกเลิก</button><button type="button" class="sv-button sv-button--danger" data-sv-dialog-confirm disabled>${escHtml(confirmLabel)}</button></div></section>`;
    root.body.appendChild(host);
    const hashInput = host.querySelector('#sv-dialog-hash'), reasonInput = host.querySelector('#sv-dialog-reason');
    const confirm = host.querySelector('[data-sv-dialog-confirm]');
    const focusable = [hashInput, reasonInput, ...host.querySelectorAll('button')];
    const validate = () => {
        const hashMatches = hash.length === 64 && hashInput.value.trim().toLowerCase() === hash;
        const hasReason = Boolean(reasonInput.value.trim());
        confirm.disabled = !(hashMatches && hasReason);
        return { hashMatches, hasReason };
    };
    hashInput.addEventListener('input', validate);
    reasonInput.addEventListener('input', validate);
    hashInput.focus();
    const close = () => closeSafetyVoteDialog(root);
    host.querySelectorAll('[data-sv-dialog-close]').forEach(button => button.addEventListener('click', close));
    confirm.addEventListener('click', async () => {
        const checked = validate();
        if (!checked.hashMatches) { host.querySelector('#sv-dialog-hash-error').textContent = 'Result SHA-256 ไม่ตรงกับ snapshot ที่เลือก'; hashInput.setAttribute('aria-invalid', 'true'); hashInput.focus(); return; }
        if (!checked.hasReason) { host.querySelector('#sv-dialog-reason-error').textContent = 'กรุณาระบุเหตุผลก่อนยืนยัน'; reasonInput.setAttribute('aria-invalid', 'true'); reasonInput.focus(); return; }
        confirm.disabled = true; hashInput.disabled = true; reasonInput.disabled = true;
        try { await onConfirm({ resultHash: hashInput.value.trim().toLowerCase(), reason: reasonInput.value.trim() }); close(); }
        catch (error) { hashInput.disabled = false; reasonInput.disabled = false; validate(); host.querySelector('#sv-dialog-reason-error').textContent = error?.message || 'ยังรับรองผลไม่ได้ กรุณาตรวจสอบสิทธิ์และสถานะ'; }
    });
    host.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const enabled = focusable.filter(node => node && !node.disabled), first = enabled[0], last = enabled.at(-1);
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
}

export function openSafetyVoteTypedConfirmationDialog({
    title,
    description,
    expectedConfirmation,
    referenceLabel = '',
    referenceRequired = false,
    confirmLabel = 'ยืนยันและบันทึกหลักฐาน',
    onConfirm = () => {},
    root = document
}) {
    closeSafetyVoteDialog(root);
    dialogRestoreTarget = root.activeElement;
    const expected = String(expectedConfirmation || '');
    const host = root.createElement('div');
    host.dataset.svDialog = 'typed-confirmation';
    host.className = 'sv-dialog-layer';
    host.innerHTML = `<div class="sv-dialog-backdrop" data-sv-dialog-close></div><section class="sv-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sv-dialog-title" aria-describedby="sv-dialog-description"><h2 id="sv-dialog-title">${escHtml(title)}</h2><p id="sv-dialog-description">${escHtml(description)}</p>${referenceLabel ? `<label class="sv-dialog__field" for="sv-dialog-reference"><span>${escHtml(referenceLabel)}</span><input id="sv-dialog-reference" type="text" maxlength="255" autocomplete="off"></label>` : ''}<div class="sv-hash-review"><span>ข้อความยืนยันที่ต้องกรอกให้ตรงทุกตัว</span><code>${escHtml(expected)}</code></div><label class="sv-dialog__field" for="sv-dialog-confirmation"><span>กรอกข้อความยืนยัน</span><input id="sv-dialog-confirmation" type="text" maxlength="160" autocomplete="off" spellcheck="false" aria-describedby="sv-dialog-confirmation-error"></label><p id="sv-dialog-confirmation-error" class="sv-dialog__error" role="alert" aria-live="assertive"></p><div class="sv-dialog__actions"><button type="button" class="sv-button sv-button--secondary" data-sv-dialog-close>ยกเลิก</button><button type="button" class="sv-button sv-button--danger" data-sv-dialog-confirm disabled>${escHtml(confirmLabel)}</button></div></section>`;
    root.body.appendChild(host);
    const reference = host.querySelector('#sv-dialog-reference'), confirmation = host.querySelector('#sv-dialog-confirmation'), confirm = host.querySelector('[data-sv-dialog-confirm]');
    const focusable = [reference, confirmation, ...host.querySelectorAll('button')].filter(Boolean);
    const validate = () => {
        const exact = expected && confirmation.value.trim() === expected;
        const hasReference = !referenceRequired || Boolean(reference?.value.trim());
        confirm.disabled = !(exact && hasReference);
        return { exact, hasReference };
    };
    reference?.addEventListener('input', validate); confirmation.addEventListener('input', validate); (reference || confirmation).focus();
    const close = () => closeSafetyVoteDialog(root);
    host.querySelectorAll('[data-sv-dialog-close]').forEach(button => button.addEventListener('click', close));
    confirm.addEventListener('click', async () => {
        const checked = validate(), error = host.querySelector('#sv-dialog-confirmation-error');
        if (!checked.hasReference) { error.textContent = 'กรุณาระบุแหล่งอ้างอิงหลักฐานก่อนยืนยัน'; reference?.focus(); return; }
        if (!checked.exact) { error.textContent = 'ข้อความยืนยันไม่ตรงกับข้อความที่กำหนด'; confirmation.setAttribute('aria-invalid', 'true'); confirmation.focus(); return; }
        confirm.disabled = true; confirmation.disabled = true; if (reference) reference.disabled = true;
        try { await onConfirm({ confirmation: confirmation.value.trim(), evidenceReference: reference?.value.trim() || '' }); close(); }
        catch (caught) { confirmation.disabled = false; if (reference) reference.disabled = false; validate(); error.textContent = caught?.message || 'ยังบันทึกคำยืนยันไม่ได้ กรุณาตรวจสอบสิทธิ์และสถานะ'; }
    });
    host.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const enabled = focusable.filter(node => !node.disabled), first = enabled[0], last = enabled.at(-1);
        if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
}
