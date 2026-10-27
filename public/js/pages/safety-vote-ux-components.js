import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';
import { journeyPosition } from './safety-vote-journey-model.mjs?v=20261009-safety-vote-ux8-r1';
import { resolveWorkflowProfile } from './safety-vote-workflow-profile.mjs?v=20261025-safety-vote-workflow-profile-r1';

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

export function isSafetyVoteEngagementV1Enabled() {
    return isSafetyVoteUxV1Enabled() && globalThis.window?.__TSH_FEATURE_FLAGS__?.safetyVoteEngagementV1 === true;
}

export function safetyVoteStatusBadge(status, extraClass = '') {
    const key = String(status || 'Draft');
    const [label, tone] = STATUS_COPY[key] || [key || 'ไม่ทราบสถานะ', 'neutral'];
    return `<span class="sv-status-badge sv-status-badge--${tone} ${extraClass}" aria-label="สถานะแคมเปญ: ${escHtml(label)}"><span aria-hidden="true" class="sv-status-dot"></span>${escHtml(label)}</span>`;
}

export function safetyVoteRoleNav({ active = 'user', showAdmin = false, showJury = false, juryCount = 0 } = {}) {
    const currentUser = globalThis.window?.TSHSession?.getUser?.() || {};
    const currentRole = currentUser.role ?? currentUser.Role ?? currentUser.roleName ?? currentUser.RoleName ?? '';
    showAdmin = showAdmin || String(currentRole).trim().toLowerCase() === 'admin';
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

function safetyVotePreviewWorkGallery(work = {}, workIndex = 0, context = 'participant') {
    const items = Array.isArray(work.gallery) ? work.gallery : Array.isArray(work.Gallery) ? work.Gallery : [];
    const workLabel = work.title || work.Title || work.workCode || work.WorkCode || `ผลงาน ${workIndex + 1}`;
    const group = `preview-${context}-work-${Number(work.id || work.ID || workIndex + 1)}`;
    if (!items.length) return '<p class="sv-live-preview__media-empty">ผลงานนี้ยังไม่มีรูปภาพ</p>';
    return `<div class="sv-work-gallery sv-work-gallery--review" aria-label="รูปของ ${escHtml(workLabel)}">${items.map((item, imageIndex) => {
        const fileId = Number(item.fileId || item.FileID || 0);
        const previewUrl = item.previewUrl || item.PreviewURL || '';
        const alt = item.altText || item.AltText || workLabel;
        const coverValue = item.isCover ?? item.IsCover;
        const isCover = coverValue === true || Number(coverValue) === 1;
        const image = fileId
            ? `<img data-sv-auth-file="${fileId}" alt="${escHtml(alt)}" decoding="async">`
            : previewUrl ? `<img src="${escHtml(previewUrl)}" alt="${escHtml(alt)}" decoding="async">` : '';
        if (!image) return '';
        return `<figure class="sv-work-gallery__item ${isCover ? 'is-cover' : ''}"><button type="button" class="svp-gallery-trigger" ${fileId ? 'data-sv-auth-media data-svp-media-state="loading" aria-busy="true"' : ''} data-sv-image-gallery data-sv-gallery-group="${escHtml(group)}" data-sv-gallery-label="${escHtml(alt)}" aria-label="เปิดภาพที่ ${imageIndex + 1} ของ ${escHtml(workLabel)}">${image}</button><figcaption>${isCover ? 'Cover' : `Gallery ${imageIndex + 1}`}${item.caption || item.Caption ? ` · ${escHtml(item.caption || item.Caption)}` : ''}</figcaption></figure>`;
    }).join('')}</div>`;
}

function safetyVoteJuryWorkPreview({ campaign = {}, works = [], criteria = [], mode = 'user' } = {}) {
    const title = campaign.titleTh || campaign.TitleTh || 'ชื่อแคมเปญ';
    const summary = campaign.summary || campaign.Summary || 'คำอธิบายกิจกรรมจะแสดงในพื้นที่นี้';
    const isActive = item => {
        const value = item.isActive ?? item.IsActive;
        return value === undefined || value === null || (value !== false && String(value) !== '0');
    };
    const activeWorks = works.filter(isActive);
    const activeCriteria = criteria.filter(isActive);
    const emptyWorks = '<div class="sv-live-preview__notice"><strong>ยังไม่มีผลงาน</strong><span>เพิ่มและบันทึกผลงานในขั้น “ผลงานที่เข้าประกวด” เพื่อดูหน้าจอจริง</span></div>';
    if (mode !== 'juror') {
        const gallery = activeWorks.length ? activeWorks.map((work, index) => {
            const code = work.workCode || work.WorkCode || `WORK-${index + 1}`;
            const workTitle = work.title || work.Title || `ผลงาน ${index + 1}`;
            const description = work.description || work.Description || '';
            return `<article class="sv-live-preview__work"><header><span>${escHtml(code)}</span><h4>${escHtml(workTitle)}</h4>${description ? `<p>${escHtml(description)}</p>` : ''}</header>${safetyVotePreviewWorkGallery(work, index, 'participant')}</article>`;
        }).join('') : emptyWorks;
        return `<article class="sv-live-preview sv-live-preview--works" data-sv-jury-preview="participant" aria-label="ตัวอย่างแกลลอรี่ผลงานสำหรับผู้เข้าร่วม"><div class="sv-live-preview__cover"><p class="sv-eyebrow">Safety Vote · Preview หน้าจอจริง</p><h3>${escHtml(title)}</h3><p>${escHtml(summary)}</p></div><div class="sv-live-preview__meta"><span>Public Work Gallery · อ่านอย่างเดียว</span><span>${activeWorks.length.toLocaleString('th-TH')} ผลงาน</span></div><div class="sv-live-preview__works">${gallery}</div><footer class="sv-live-preview__footer"><span>ผู้เข้าร่วมจะดูรายละเอียดและรูปผลงานได้ แต่ไม่มีช่องให้คะแนนของกรรมการ</span></footer></article>`;
    }
    const totalCells = activeWorks.length * activeCriteria.length;
    const matrix = activeWorks.length ? activeWorks.map((work, workIndex) => {
        const code = work.workCode || work.WorkCode || `WORK-${workIndex + 1}`;
        const workTitle = work.title || work.Title || `ผลงาน ${workIndex + 1}`;
        const description = work.description || work.Description || '';
        const controls = activeCriteria.length ? activeCriteria.map((criterion, criterionIndex) => {
            const criterionTitle = criterion.title || criterion.Title || `เกณฑ์ ${criterionIndex + 1}`;
            const criterionDescription = criterion.description || criterion.Description || '';
            const min = Number(criterion.minScore ?? criterion.MinScore ?? 1);
            const max = Number(criterion.maxScore ?? criterion.MaxScore ?? 5);
            const weight = Number(criterion.weight ?? criterion.Weight ?? 0);
            const quick = [...new Set([min,Math.round(min+(max-min)*.25),Math.round(min+(max-min)*.5),Math.round(min+(max-min)*.75),max])];
            return `<div class="sv-live-preview__criterion"><span><strong>${escHtml(criterionTitle)}</strong>${criterionDescription ? `<small>${escHtml(criterionDescription)}</small>` : ''}<small>ช่วงคะแนน ${min.toLocaleString('th-TH')}–${max.toLocaleString('th-TH')} · น้ำหนัก ${weight.toLocaleString('th-TH')}%</small></span><div class="sv-live-preview__score-control" aria-label="รูปแบบช่องคะแนน ${escHtml(criterionTitle)}"><input type="range" min="${min}" max="${max}" value="${min}" aria-label="Slider คะแนน" disabled><div><button type="button" disabled>−</button><input type="number" min="${min}" max="${max}" placeholder="${min}–${max}" aria-label="คะแนน ${escHtml(criterionTitle)} สำหรับ ${escHtml(workTitle)}" disabled><button type="button" disabled>+</button></div><div class="sv-live-preview__score-quick">${quick.map(score=>`<button type="button" disabled>${score}</button>`).join('')}</div></div></div>`;
        }).join('') : '<p class="sv-live-preview__media-empty">ยังไม่ได้กำหนดเกณฑ์การให้คะแนน</p>';
        return `<fieldset class="sv-live-preview__matrix-work"><legend><span>${workIndex + 1}</span>${escHtml(workTitle)}</legend><p class="sv-live-preview__work-code">รหัสผลงาน ${escHtml(code)}</p>${description ? `<p>${escHtml(description)}</p>` : ''}${safetyVotePreviewWorkGallery(work, workIndex, 'juror')}<div class="sv-live-preview__criteria">${controls}</div></fieldset>`;
    }).join('') : emptyWorks;
    return `<article class="sv-live-preview sv-live-preview--juror" data-sv-jury-preview="juror" aria-label="ตัวอย่าง Work × Criteria Matrix สำหรับกรรมการ"><p class="sv-eyebrow">Work × Criteria Matrix · Preview หน้าจอจริง</p><h3>${escHtml(title)}</h3><p>${escHtml(summary)}</p><div class="sv-live-preview__notice"><strong>${activeWorks.length.toLocaleString('th-TH')} ผลงาน × ${activeCriteria.length.toLocaleString('th-TH')} เกณฑ์ = ${totalCells.toLocaleString('th-TH')} ช่องคะแนน</strong><span>ระบบจริงจะแสดงเฉพาะชุดงานที่เซิร์ฟเวอร์มอบหมายให้กรรมการแต่ละคน</span></div><div class="sv-live-preview__matrix">${matrix}</div><footer class="sv-live-preview__footer"><span>Preview เท่านั้น · ช่องคะแนนถูกปิดและระบบจะไม่บันทึกคะแนน</span><button type="button" class="sv-button sv-button--primary" disabled>ตรวจสอบก่อนส่ง</button></footer></article>`;
}

function safetyVotePreviewQuestionImage(question = {}, questionIndex = 0) {
    const fileId = Number(question.imageFileId || question.ImageFileID || 0);
    const previewUrl = question.imagePreviewUrl || question.previewUrl || '';
    if (!fileId && !previewUrl) return '';
    const label = question.imageAltText || question.ImageAltText || question.title || `รูปประจำคำถาม ${questionIndex + 1}`;
    const image = fileId
        ? `<img data-sv-auth-file="${fileId}" alt="${escHtml(label)}" decoding="async">`
        : `<img src="${escHtml(previewUrl)}" alt="${escHtml(label)}" decoding="async">`;
    return `<button type="button" class="svp-gallery-trigger svp-question-image" ${fileId ? 'data-sv-auth-media data-svp-media-state="loading" aria-busy="true"' : ''} data-sv-image-gallery data-sv-gallery-group="preview-question-cover-${questionIndex}" data-sv-gallery-label="${escHtml(label)}" aria-label="ขยายภาพ ${escHtml(label)}">${image}</button>`;
}

function safetyVotePreviewOptionGallery(option = {}, questionIndex = 0, optionIndex = 0) {
    const items = Array.isArray(option.gallery) && option.gallery.length
        ? option.gallery
        : option.fileId || option.FileID
            ? [{ fileId: option.fileId || option.FileID, altText: option.imageAltText || option.label, isCover: true }]
            : option.previewUrl ? [{ previewUrl: option.previewUrl, altText: option.label, isCover: true }] : [];
    return items.map((item, imageIndex) => {
        const fileId = Number(item.fileId || item.FileID || 0);
        const previewUrl = item.previewUrl || '';
        const label = item.altText || item.AltText || option.label || `ตัวเลือก ${optionIndex + 1}`;
        const image = fileId ? `<img data-sv-auth-file="${fileId}" alt="${escHtml(label)}" decoding="async">` : previewUrl ? `<img src="${escHtml(previewUrl)}" alt="${escHtml(label)}" decoding="async">` : '';
        return image ? `<button type="button" class="svp-gallery-trigger" ${fileId ? 'data-sv-auth-media data-svp-media-state="loading" aria-busy="true"' : ''} data-sv-image-gallery data-sv-gallery-group="preview-question-${questionIndex}" data-sv-gallery-label="${escHtml(label)}" aria-label="เปิดภาพที่ ${imageIndex + 1} ของ ${escHtml(option.label || label)}">${image}</button>` : '';
    }).join('');
}

function safetyVoteWorkflowFormPreview(campaignType, questions = []) {
    const requirements = questions.filter(question => String(question.title || '').trim()).map((question, index) => `<li><strong>${index + 1}. ${escHtml(question.title)}</strong>${question.helpText ? `<span>${escHtml(question.helpText)}</span>` : ''}</li>`).join('');
    const requirementPanel = requirements ? `<section class="sv-live-preview__requirements"><h4>ข้อกำหนดที่ผู้ดูแลตั้งไว้</h4><ul>${requirements}</ul></section>` : '';
    if (campaignType === 'submission_challenge') {
        return `<div class="sv-live-preview__questions" data-sv-workflow-preview="submission_challenge">${requirementPanel}<fieldset><legend>ข้อมูลผลงาน</legend><label class="svp-field"><span>ชื่อผลงาน</span><input maxlength="300" placeholder="ระบุชื่อผลงาน"></label><label class="svp-field"><span>รายละเอียด</span><textarea rows="6" maxlength="10000" placeholder="อธิบายผลงาน"></textarea></label><section class="sv-work-gallery-editor"><div><h3>รูปผลงาน</h3><p>เพิ่มได้สูงสุด 12 รูป · JPG, PNG หรือ WebP รูปละไม่เกิน 10 MB</p></div><label class="sv-button sv-button--secondary"><span>เพิ่มรูปผลงาน</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple></label></section></fieldset></div>`;
    }
    return `<div class="sv-live-preview__questions" data-sv-workflow-preview="nomination">${requirementPanel}<fieldset><legend>ข้อมูลการเสนอชื่อ</legend><label class="svp-field"><span>ผู้ถูกเสนอชื่อ</span><input type="search" placeholder="ค้นหาชื่อ รหัสพนักงาน แผนก หรือหน่วยงาน"></label><label class="svp-field"><span>เหตุผลประกอบการเสนอชื่อ</span><textarea rows="6" maxlength="5000" placeholder="ระบุเหตุผลประกอบการเสนอชื่อ"></textarea></label></fieldset></div>`;
}

function safetyVoteAdminConfigurationPreview({ campaign = {}, questions = [], works = [], criteria = [] } = {}) {
    const profile = resolveWorkflowProfile(campaign, { workSource: campaign.workSource || campaign.WorkSource });
    const privacy = campaign.privacyMode || campaign.PrivacyMode || 'identified';
    const attempts = Number(campaign.maxParticipationAttempts || campaign.MaxParticipationAttempts || 1);
    const rows = [
        ['Workflow', profile.contentLabel],
        ['การทำรายการ', profile.operationLabel],
        ['บทบาทผู้ใช้', profile.participantLabel],
        ['Privacy', privacy],
        ['จำนวนครั้งสูงสุด', `${attempts.toLocaleString('th-TH')} ครั้ง`],
        ['ช่วงเวลา', `${campaign.openAt || campaign.OpenAt || 'ยังไม่กำหนด'} → ${campaign.closeAt || campaign.CloseAt || 'ยังไม่กำหนด'}`],
        ['การแสดงผล', campaign.resultVisibility || campaign.ResultVisibility || 'hidden_until_close'],
        ['การปล่อยผล', campaign.resultReleasePolicy || campaign.ResultReleasePolicy || 'automatic']
    ];
    const contentCount = profile.campaignType === 'jury_scoring' ? works.length : questions.length;
    return `<article class="sv-live-preview sv-live-preview--admin" data-sv-admin-preview="${escHtml(profile.campaignType)}" aria-label="สรุปการตั้งค่าจริงสำหรับผู้ดูแล"><p class="sv-eyebrow">Admin configuration · ข้อมูล Draft จริง</p><h3>${escHtml(campaign.titleTh || campaign.TitleTh || 'ชื่อแคมเปญ')}</h3><div class="sv-live-preview__admin-grid">${rows.map(([label, value]) => `<div><strong>${escHtml(label)}</strong><span>${escHtml(value)}</span></div>`).join('')}</div><div class="sv-live-preview__notice"><strong>${contentCount.toLocaleString('th-TH')} ${profile.campaignType === 'jury_scoring' ? 'ผลงาน' : 'รายการเนื้อหา'}${profile.juryRequired ? ` · ${criteria.length.toLocaleString('th-TH')} เกณฑ์` : ''}</strong><span>สรุปนี้อ่านจาก Draft ชุดเดียวกับที่ระบบจะบันทึกและตรวจ Readiness ไม่มีข้อมูลตัวอย่างแทรก</span></div></article>`;
}

export function safetyVoteCampaignPreview({ campaign = {}, questions = [], works = [], criteria = [], mode = 'user', userView = 'participation', liveMarkup = '', liveEnabled = false, liveAllowed = false, previewSubmitted = false } = {}) {
    const title = campaign.titleTh || campaign.TitleTh || 'ชื่อแคมเปญ';
    const summary = campaign.summary || campaign.Summary || 'คำอธิบายกิจกรรมจะแสดงในพื้นที่นี้';
    const privacy = { identified: 'ระบุตัวตน', confidential: 'ข้อมูลลับ', anonymous: 'ไม่ระบุตัวตน', secret_ballot: 'บัตรลงคะแนนลับ' }[campaign.privacyMode || campaign.PrivacyMode] || 'ตามนโยบายแคมเปญ';
    const campaignType = campaign.campaignType || campaign.CampaignType || '';
    const profile = resolveWorkflowProfile(campaign, { workSource: campaign.workSource || campaign.WorkSource });
    if (mode === 'admin') return safetyVoteAdminConfigurationPreview({ campaign, questions, works, criteria });
    if (campaignType === 'jury_scoring') return safetyVoteJuryWorkPreview({ campaign, works, criteria, mode });
    if (mode === 'juror') return '<article class="sv-live-preview sv-live-preview--juror"><div class="sv-live-preview__notice"><strong>แคมเปญนี้ไม่มีหน้าจอกรรมการ</strong><span>หน้าจอกรรมการใช้เฉพาะแคมเปญแบบคณะกรรมการให้คะแนน</span></div></article>';
    const control = (question, questionIndex) => {
        const type = question.questionType || 'single_choice', options = question.options || [], validation = question.validation || {};
        const choiceTypes = ['single_choice', 'multiple_choice', 'yes_no_abstain', 'likert'];
        if (choiceTypes.includes(type)) {
            const inputType = type === 'single_choice' || type === 'yes_no_abstain' || Number(question.maxSelections) === 1 ? 'radio' : 'checkbox';
            return `<div class="svp-options">${options.map((option, optionIndex) => `<article class="svp-option">${safetyVotePreviewOptionGallery(option, questionIndex, optionIndex)}<label><input type="${inputType}" name="sv-preview-q-${questionIndex}" value="${escHtml(option.optionCode || option.OptionCode || optionIndex)}" data-sv-preview-answer><span><strong>${escHtml(option.label || `ตัวเลือก ${optionIndex + 1}`)}</strong>${option.description ? `<small>${escHtml(option.description)}</small>` : ''}</span></label></article>`).join('')}</div>`;
        }
        if (type === 'rating') return `<label class="svp-inline-input"><span>คะแนน ${Number(validation.minNumber ?? 1)}–${Number(validation.maxNumber ?? 5)}</span><input type="number" min="${Number(validation.minNumber ?? 1)}" max="${Number(validation.maxNumber ?? 5)}" data-sv-preview-answer></label>`;
        if (type === 'long_text') return `<textarea class="svw-live-answer" rows="4" maxlength="${Number(validation.maxLength || 10000)}" placeholder="กรอกคำตอบ" data-sv-preview-answer></textarea>`;
        if (['short_text','employee_picker','organization_picker'].includes(type)) return `<input class="svw-live-answer" maxlength="${Number(validation.maxLength || 1000)}" placeholder="กรอกคำตอบ" data-sv-preview-answer>`;
        if (type === 'date_time') return '<input class="svw-live-answer" type="datetime-local" data-sv-preview-answer>';
        if (type === 'file_upload') return '<label class="svp-file-control"><span>ทดลองเลือกไฟล์ (ไม่อัปโหลดใน Preview)</span><input type="file" data-sv-preview-answer></label>';
        if (type === 'ranking') return `<div class="svp-ranking">${options.map((option, optionIndex) => `<label><span>${escHtml(option.label || `ตัวเลือก ${optionIndex + 1}`)}</span><select data-sv-preview-answer><option value="">—</option>${options.map((_, rank) => `<option value="${rank + 1}">${rank + 1}</option>`).join('')}</select></label>`).join('')}</div>`;
        if (['allocation','token'].includes(type)) return `<div class="svp-ranking">${options.map((option, optionIndex) => `<label><span>${escHtml(option.label || `ตัวเลือก ${optionIndex + 1}`)}</span><input type="number" min="0" value="0" data-sv-preview-answer></label>`).join('')}</div>`;
        if (type === 'matrix') return `<div class="svp-ranking">${options.map((option, optionIndex) => `<label><span>${escHtml(option.label || `แถว ${optionIndex + 1}`)}</span><input data-sv-preview-answer></label>`).join('')}</div>`;
        return '<p class="svp-note">รูปแบบคำถามนี้ไม่มีตัวควบคุมสำหรับ Preview</p>';
    };
    const showLive = liveEnabled && liveAllowed && userView === 'live';
    const tabs = liveEnabled ? `<nav class="svp-detail-tabs" aria-label="กิจกรรม"><button type="button" data-svw-user-view="participation" aria-current="${showLive ? 'false' : 'page'}">ลงคะแนน</button><button type="button" data-svw-user-view="live" aria-current="${showLive ? 'page' : 'false'}" ${liveAllowed ? '' : 'disabled'}>ผลโหวตสด</button>${liveAllowed ? '' : '<span>ส่งคะแนนก่อนจึงดูได้</span>'}</nav>` : '';
    const actionLabel = campaignType === 'popular_vote' ? 'ตรวจคะแนนโหวต' : campaignType === 'secret_election' ? 'ตรวจบัตรก่อนส่ง' : campaignType === 'submission_challenge' ? 'ตรวจผลงานก่อนส่ง' : campaignType === 'nomination' ? 'ตรวจคำเสนอชื่อ' : 'ตรวจคำตอบ';
    const workflowForm = ['submission_challenge','nomination'].includes(campaignType) ? safetyVoteWorkflowFormPreview(campaignType, questions) : '';
    const maxAttempts = Math.max(1, Number(campaign.maxParticipationAttempts || campaign.MaxParticipationAttempts || 1));
    const participation = previewSubmitted
        ? `<section class="svp-receipt" aria-labelledby="sv-preview-completed-title"><span class="svp-receipt__icon" aria-hidden="true">✓</span><h2 id="sv-preview-completed-title">คุณทำรายการแล้ว 1/${maxAttempts.toLocaleString('th-TH')} ครั้ง</h2><p>สถานะหลังส่งตามการตั้งค่าจริง · สิทธิ์คงเหลือ ${Math.max(0,maxAttempts-1).toLocaleString('th-TH')} ครั้ง ส่วนเวลาและเลขอ้างอิงจะเกิดจากรายการจริงเท่านั้น</p></section>`
        : `${workflowForm || `<div class="sv-live-preview__questions">${questions.length ? questions.map((question, index) => { const condition = question.displayCondition || {}; return `<fieldset data-sv-preview-question-code="${escHtml(question.questionCode || `Q${index + 1}`)}" ${condition.questionCode ? `data-sv-preview-condition-code="${escHtml(condition.questionCode)}" data-sv-preview-condition-operator="${escHtml(condition.operator || '')}" data-sv-preview-condition-value="${escHtml(condition.value ?? '')}"` : ''}>${safetyVotePreviewQuestionImage(question, index)}<legend>${index + 1}. ${escHtml(question.title || 'ยังไม่ได้ระบุชื่อ')}${question.isRequired === false ? '' : ' *'}</legend>${question.helpText ? `<p class="sv-live-preview__help">${escHtml(question.helpText)}</p>` : ''}<small>${question.isRequired === false ? 'ไม่บังคับ' : 'จำเป็น'}${['single_choice','multiple_choice','yes_no_abstain','likert'].includes(question.questionType) ? ` · เลือก ${Number(question.minSelections ?? 1)}–${Number(question.maxSelections ?? 1)} รายการ` : ''}</small>${control(question, index)}</fieldset>`; }).join('') : '<div class="sv-live-preview__notice"><strong>ยังไม่มีเนื้อหา</strong><span>เพิ่มเนื้อหาในขั้นที่กำหนดเพื่อดูหน้าจอจริง</span></div>'}</div>`}<footer class="sv-live-preview__footer"><span>Preview เท่านั้น ระบบจะไม่ส่งข้อมูลหรือเพิ่มสถิติ</span><button type="button" class="sv-button sv-button--primary" disabled>${escHtml(actionLabel)}</button></footer>`;
    const privacyNotice = campaignType === 'secret_election' ? '<div class="sv-live-preview__notice"><strong>บัตรลงคะแนนลับ</strong><span>หน้าจอจริงจะแยกข้อมูลการเข้าร่วมออกจากบัตร และใบรับจะไม่แสดงตัวเลือก</span></div>' : '';
    return `<article class="sv-live-preview" data-sv-workflow-preview="${escHtml(campaignType)}" aria-label="ตัวอย่างหน้าจอจริงของ${escHtml(profile.participantLabel)}"><div class="sv-live-preview__cover"><p class="sv-eyebrow">${escHtml(profile.contentLabel)} · Preview หน้าจอจริง</p><h3>${escHtml(title)}</h3><p>${escHtml(summary)}</p></div><div class="sv-live-preview__meta"><span>${escHtml(privacy)}</span><span>${escHtml(profile.participantLabel)} · ไม่บันทึกข้อมูลใน Preview</span></div>${privacyNotice}${tabs}<div aria-live="polite">${showLive ? liveMarkup : participation}</div></article>`;
}

export function bindSafetyVoteCampaignPreview(root = document) {
    const preview = root?.querySelector?.('.sv-live-preview[data-sv-workflow-preview]');
    if (!preview) return () => {};
    const fields = [...preview.querySelectorAll('[data-sv-preview-question-code]')];
    const answerFor = code => {
        const field = fields.find(item => item.dataset.svPreviewQuestionCode === code);
        if (!field) return [];
        const controls = [...field.querySelectorAll('[data-sv-preview-answer]')];
        const choices = controls.filter(input => ['radio','checkbox'].includes(input.type));
        if (choices.length) return choices.filter(input => input.checked).map(input => String(input.value));
        return controls.map(input => input.type === 'file' ? (input.files?.length ? 'file' : '') : String(input.value || '')).filter(Boolean);
    };
    const update = () => fields.forEach(field => {
        const code = field.dataset.svPreviewConditionCode;
        if (!code) return;
        const values = answerFor(code), expected = String(field.dataset.svPreviewConditionValue || ''), operator = field.dataset.svPreviewConditionOperator;
        const answered = values.length > 0;
        const visible = operator === 'answered' ? answered
            : operator === 'not_answered' ? !answered
                : operator === 'equals' || operator === 'includes' ? values.includes(expected)
                    : operator === 'not_equals' || operator === 'not_includes' ? !values.includes(expected) : true;
        field.hidden = !visible;
        field.querySelectorAll('input,select,textarea').forEach(control => { control.disabled = !visible; });
    });
    preview.addEventListener('input', update);
    preview.addEventListener('change', update);
    update();
    return () => { preview.removeEventListener('input', update); preview.removeEventListener('change', update); };
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
    host.innerHTML = `<div class="sv-dialog-backdrop" data-sv-dialog-close></div><section class="sv-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sv-dialog-title" aria-describedby="sv-dialog-description sv-dialog-error"><h2 id="sv-dialog-title">${escHtml(title)}</h2><p id="sv-dialog-description">${escHtml(description)}</p><p id="sv-dialog-error" class="sv-dialog__error" role="alert" aria-live="assertive" hidden></p><div class="sv-dialog__actions"><button type="button" class="sv-button sv-button--secondary" data-sv-dialog-close>${escHtml(cancelLabel)}</button><button type="button" class="sv-button ${tone === 'danger' ? 'sv-button--danger' : 'sv-button--primary'}" data-sv-dialog-confirm>${escHtml(confirmLabel)}</button></div></section>`;
    root.body.appendChild(host);
    const focusable = [...host.querySelectorAll('button')];
    host.querySelector('[data-sv-dialog-confirm]')?.focus();
    const close = () => closeSafetyVoteDialog(root);
    host.querySelectorAll('[data-sv-dialog-close]').forEach(button => button.addEventListener('click', close));
    host.querySelector('[data-sv-dialog-confirm]')?.addEventListener('click', async () => {
        const button = host.querySelector('[data-sv-dialog-confirm]');
        const error = host.querySelector('#sv-dialog-error');
        const originalLabel = button.textContent;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'กำลังตรวจสอบ...';
        if (error) { error.hidden = true; error.textContent = ''; }
        try { await onConfirm(); close(); }
        catch (caught) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = originalLabel;
            const details = Array.isArray(caught?.details)
                ? caught.details.map(item => item?.message || item?.detail || item?.label || item?.code).filter(Boolean)
                : [];
            if (error) {
                error.textContent = [caught?.message || 'ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่', ...details].join(' · ');
                error.hidden = false;
            }
            button.focus();
        }
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
