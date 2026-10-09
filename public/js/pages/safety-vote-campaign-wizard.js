import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { openSafetyVoteConfirmDialog, safetyVoteCampaignPreview, safetyVoteJourneyNav } from './safety-vote-ux-components.js?v=20261009-safety-vote-ux8-r1';
import {
    WIZARD_STEPS, CORE_TEMPLATES, applyTemplate, builderPayload, campaignPayload, contentValid,
    createWizardDraft, defaultQuestion, hasOptions, questionTypesFor, readinessItems, scheduleValid,
    templateFor, validateStep
} from './safety-vote-wizard-model.mjs?v=20261008-safety-vote-ux2-r1';

const TYPE_LABELS = Object.fromEntries(CORE_TEMPLATES.map(item => [item.key, item.label]));
const QUESTION_LABELS = { single_choice: 'เลือกหนึ่งตัวเลือก', multiple_choice: 'เลือกหลายตัวเลือก', yes_no_abstain: 'ใช่/ไม่ใช่/งดออกเสียง', rating: 'ให้คะแนน', likert: 'ระดับความคิดเห็น', short_text: 'ข้อความสั้น', long_text: 'ข้อความยาว', employee_picker: 'เลือกพนักงาน', file_upload: 'แนบไฟล์' };
const PRIVACY_OPTIONS = [
    ['identified', 'ระบุตัวตน', 'เหมาะกับกิจกรรมที่ต้องติดตามผู้เข้าร่วมตามสิทธิ์'],
    ['confidential', 'ข้อมูลลับ', 'จำกัดการเข้าถึงตัวตนตามสิทธิ์ที่กำหนด'],
    ['anonymous', 'ไม่ระบุตัวตน', 'คำตอบไม่ผูกกับตัวตนในผลลัพธ์'],
    ['secret_ballot', 'บัตรลงคะแนนลับ', 'ไม่เปิดเผยตัวเลือกและไม่แสดงผลระหว่างกิจกรรม']
];
const RESULT_OPTIONS = [
    ['hidden_until_close', 'แสดงหลังปิดกิจกรรม'], ['admin_only', 'ผู้ดูแลเท่านั้น'],
    ['live', 'แสดงระหว่างกิจกรรม'], ['certified_only', 'แสดงหลังรับรองผล'], ['published', 'เผยแพร่แล้ว']
];

function inputField(name, label, value = '', type = 'text', options = '') {
    return `<label class="svw-field"><span>${escHtml(label)}</span><input id="svw-${name}" data-svw-field="${name}" type="${type}" value="${escHtml(value ?? '')}" ${options}></label>`;
}

function textareaField(name, label, value = '', rows = 3) {
    return `<label class="svw-field"><span>${escHtml(label)}</span><textarea id="svw-${name}" data-svw-field="${name}" rows="${rows}">${escHtml(value ?? '')}</textarea></label>`;
}

function stepType(draft) {
    return `<div class="svw-template-grid" role="radiogroup" aria-label="ประเภทแคมเปญ">${CORE_TEMPLATES.map(item => `<button type="button" class="svw-template ${draft.campaignType === item.key ? 'is-selected' : ''}" data-svw-template="${item.key}" role="radio" aria-checked="${draft.campaignType === item.key}"><span class="svw-template__mark" aria-hidden="true">${draft.campaignType === item.key ? '✓' : '○'}</span><strong>${escHtml(item.label)}</strong><span>${escHtml(item.description)}</span>${item.advancedRequired ? '<small>ต้องตั้งค่าขั้นสูงเพิ่มเติมก่อนเปิด</small>' : '<small>ตั้งค่าและเปิดได้ใน wizard</small>'}</button>`).join('')}</div>`;
}

function stepDetails(draft) {
    return `<div class="svw-form-grid">${inputField('campaignCode', 'รหัสแคมเปญ', draft.campaignCode, 'text', 'maxlength="40" autocomplete="off"')}${inputField('titleTh', 'ชื่อแคมเปญภาษาไทย', draft.titleTh, 'text', 'maxlength="200"')}${inputField('titleEn', 'ชื่อภาษาอังกฤษ (ถ้ามี)', draft.titleEn, 'text', 'maxlength="200"')}${textareaField('summary', 'สรุปสำหรับการ์ดกิจกรรม', draft.summary, 2)}${textareaField('description', 'รายละเอียดกิจกรรม', draft.description, 5)}</div>`;
}

function stepPrivacy(draft) {
    return `<fieldset class="svw-choice-fieldset"><legend>เลือกรูปแบบความเป็นส่วนตัว</legend><div class="svw-choice-grid">${PRIVACY_OPTIONS.map(([key, label, description]) => `<label class="svw-choice ${draft.privacyMode === key ? 'is-selected' : ''}"><input type="radio" name="svw-privacy" value="${key}" data-svw-field="privacyMode" ${draft.privacyMode === key ? 'checked' : ''}><strong>${label}</strong><span>${description}</span></label>`).join('')}</div></fieldset><div class="svw-privacy-notice" role="note"><strong>${draft.privacyMode === 'secret_ballot' ? 'การคุ้มครองบัตรลงคะแนนลับ' : 'การจัดการข้อมูลผู้เข้าร่วม'}</strong><p>${draft.privacyMode === 'secret_ballot' ? 'ใบรับจะไม่มีตัวเลือก ผลระหว่างกิจกรรมถูกซ่อน และการเปิดใช้ต้องผ่านการตั้งค่าการเลือกตั้งเดิมให้ครบ' : 'การมองเห็นตัวตนและข้อมูลยังถูกควบคุมด้วยสิทธิ์ฝั่งเซิร์ฟเวอร์'}</p></div>`;
}

function questionCard(question, index, draft) {
    const allowed = questionTypesFor(draft.campaignType);
    return `<fieldset class="svw-question"><legend>ข้อ ${index + 1}</legend><div class="svw-question__heading"><label class="svw-field"><span>รูปแบบคำถาม</span><select data-svw-question-field="questionType" data-index="${index}">${allowed.map(type => `<option value="${type}" ${question.questionType === type ? 'selected' : ''}>${escHtml(QUESTION_LABELS[type] || type)}</option>`).join('')}</select></label><button type="button" class="sv-button sv-button--secondary" data-svw-remove-question="${index}" ${draft.questions.length === 1 ? 'disabled' : ''}>ลบข้อนี้</button></div>${inputField(`question-${index}-title`, 'คำถามหรือหัวข้อ', question.title, 'text', `data-question-index="${index}"`)}${textareaField(`question-${index}-help`, 'คำแนะนำเพิ่มเติม (ถ้ามี)', question.helpText, 2)}${hasOptions(question.questionType) ? textareaField(`question-${index}-options`, 'ตัวเลือก — หนึ่งรายการต่อบรรทัด', (question.options || []).map(option => option.label).join('\n'), 5) : '<p class="svw-inline-note">คำถามรูปแบบนี้ไม่ใช้รายการตัวเลือก</p>'}</fieldset>`;
}

function stepContent(draft) {
    const label = draft.campaignType === 'submission_challenge' ? 'ข้อกำหนดผลงาน' : draft.campaignType === 'nomination' ? 'ข้อมูลการเสนอชื่อ' : draft.campaignType === 'jury_scoring' ? 'รายการสำหรับการประเมิน' : 'คำถามและตัวเลือก';
    return `<div class="svw-section-heading"><div><p class="sv-eyebrow">${escHtml(TYPE_LABELS[draft.campaignType])}</p><h3>${label}</h3></div><button type="button" class="sv-button sv-button--secondary" data-svw-action="add-question">เพิ่มข้อ</button></div><div class="svw-question-list">${draft.questions.map((question, index) => questionCard(question, index, draft)).join('')}</div>`;
}

function ruleCard(rule, index) {
    return `<div class="svw-rule"><label><span>ผลของกฎ</span><select data-svw-rule-field="effect" data-index="${index}"><option value="include" ${rule.effect === 'include' ? 'selected' : ''}>รวม</option><option value="exclude" ${rule.effect === 'exclude' ? 'selected' : ''}>ยกเว้น</option></select></label><label><span>ข้อมูลอ้างอิง</span><select data-svw-rule-field="attributeKey" data-index="${index}">${[['all','พนักงานทั้งหมด'],['department_id','แผนก'],['safety_unit_id','หน่วยงานความปลอดภัย'],['position_id','ตำแหน่ง'],['role','บทบาท'],['team','ทีม']].map(([key,label])=>`<option value="${key}" ${rule.attributeKey===key?'selected':''}>${label}</option>`).join('')}</select></label><label><span>ค่า — คั่นด้วยเครื่องหมายจุลภาค</span><input data-svw-rule-field="values" data-index="${index}" value="${escHtml((rule.values||[]).join(', '))}" ${rule.attributeKey === 'all' ? 'disabled' : ''}></label><button type="button" class="sv-icon-button" data-svw-remove-rule="${index}" aria-label="ลบกฎที่ ${index + 1}" ${index === 0 && rule.attributeKey === 'all' ? 'disabled' : ''}>×</button></div>`;
}

function stepEligibility(draft) {
    const preview = draft.eligibilityPreview;
    return `<div class="svw-section-heading"><div><h3>กำหนดผู้มีสิทธิ์</h3><p>กฎทุกข้อใช้ตัวตรวจสอบและ Master Data เดิมของระบบ</p></div><button type="button" class="sv-button sv-button--secondary" data-svw-action="add-rule">เพิ่มกฎ</button></div><div class="svw-rule-list">${draft.rules.map(ruleCard).join('')}</div><div class="svw-eligibility-result" aria-live="polite">${preview ? `<div><strong>${Number(preview.eligibleCount).toLocaleString('th-TH')}</strong><span>ผู้มีสิทธิ์จากการตรวจสอบล่าสุด</span></div><div><strong>${Number(preview.accountReadyCount || 0).toLocaleString('th-TH')}</strong><span>บัญชีพร้อมใช้งาน</span></div><div><strong>${Number(preview.warningCount || 0).toLocaleString('th-TH')}</strong><span>รายการที่ควรตรวจสอบ</span></div>` : '<p>ยังไม่ได้ตรวจสอบรายชื่อผู้มีสิทธิ์</p>'}</div><div class="svw-inline-actions"><button type="button" class="sv-button sv-button--secondary" data-svw-action="preview-eligibility">ตรวจสอบรายชื่อ</button><button type="button" class="sv-button sv-button--primary" data-svw-action="freeze-eligibility" ${!Number(preview?.eligibleCount) || draft.eligibilityFrozen ? 'disabled' : ''}>${draft.eligibilityFrozen ? 'ตรึงรายชื่อแล้ว' : 'ยืนยันและตรึงรายชื่อ'}</button></div>`;
}

function stepSchedule(draft) {
    return `<div class="svw-form-grid">${inputField('openAt', 'วันเวลาเปิดกิจกรรม', draft.openAt, 'datetime-local')}${inputField('closeAt', 'วันเวลาปิดกิจกรรม', draft.closeAt, 'datetime-local')}</div><div class="svw-inline-note" role="note"><strong>เขตเวลา Asia/Bangkok</strong><p>ระบบจะใช้กลไกกำหนดเวลาปัจจุบันและจะไม่เปลี่ยนสถานะหากข้อมูลไม่ครบหรือไม่ถูกต้อง</p></div>`;
}

function stepResults(draft) {
    return `<fieldset class="svw-choice-fieldset"><legend>การแสดงผลและประกาศผล</legend><div class="svw-choice-grid">${RESULT_OPTIONS.map(([key,label])=>`<label class="svw-choice ${draft.resultVisibility===key?'is-selected':''}"><input type="radio" name="svw-results" value="${key}" data-svw-field="resultVisibility" ${draft.resultVisibility===key?'checked':''} ${draft.privacyMode==='secret_ballot'&&key==='live'?'disabled':''}><strong>${label}</strong><span>${key==='live'?'เห็นผลรวมระหว่างกิจกรรม':'ควบคุมการเผยแพร่ตามสถานะ'}</span></label>`).join('')}</div></fieldset><div class="svw-form-grid">${inputField('privacyThreshold','จำนวนขั้นต่ำก่อนแสดงสถิติ',draft.privacyThreshold,'number','min="2" max="100"')}<label class="svw-field"><span>การค้นพบแคมเปญ</span><select data-svw-field="discoveryMode"><option value="eligible_only" ${draft.discoveryMode==='eligible_only'?'selected':''}>แสดงเฉพาะผู้มีสิทธิ์</option><option value="public_listing" ${draft.discoveryMode==='public_listing'?'selected':''}>แสดงในรายการสาธารณะตามสิทธิ์</option></select></label></div>`;
}

function stepReview(draft, persisted, previewMode) {
    const items = readinessItems(draft, persisted), ready = items.every(item => item.pass), advanced = templateFor(draft.campaignType).advancedRequired;
    return `<div class="svw-review-grid"><section class="svw-readiness" aria-labelledby="svw-readiness-title"><div class="svw-section-heading"><div><p class="sv-eyebrow">Readiness checklist</p><h3 id="svw-readiness-title">ความพร้อมก่อนเปิดใช้งาน</h3></div><span class="sv-status-badge ${ready?'sv-status-badge--open':'sv-status-badge--scheduled'}"><span class="sv-status-dot"></span>${ready?'พร้อมเปิด':'ยังไม่พร้อม'}</span></div><ul>${items.map(item=>`<li class="${item.pass?'is-pass':'is-block'}"><span aria-hidden="true">${item.pass?'✓':'!'}</span><span>${escHtml(item.label)}</span></li>`).join('')}</ul>${advanced?'<div class="svw-readiness__advanced" role="status"><strong>ต้องตั้งค่าตามประเภทแคมเปญต่อ</strong><p>ระบบจะพาไปยังพื้นที่จัดการเดิมสำหรับการเลือกตั้งลับ ผลงาน การเสนอชื่อ หรือกรรมการ โดยยังไม่เปิดแคมเปญอัตโนมัติ</p></div>':''}</section><section class="svw-preview-panel"><div class="svw-preview-tabs" role="tablist" aria-label="ตัวอย่างหน้าจอตามบทบาท"><button type="button" role="tab" data-svw-preview="user" aria-selected="${previewMode==='user'}">ผู้เข้าร่วม</button><button type="button" role="tab" data-svw-preview="juror" aria-selected="${previewMode==='juror'}">กรรมการ</button></div>${safetyVoteCampaignPreview({campaign:draft,questions:draft.questions,mode:previewMode})}</section></div>`;
}

function stepMarkup(step, draft, persisted, previewMode) {
    return [stepType, stepDetails, stepPrivacy, stepContent, stepEligibility, stepSchedule, stepResults][step]?.(draft) || stepReview(draft, persisted, previewMode);
}

export function renderSafetyVoteCampaignWizard(container, { onClose = () => {}, onComplete = () => {}, onOpenAdvanced = () => {}, onNavigate = null } = {}) {
    const state = { step: 0, maxStep: 0, draft: createWizardDraft(), persisted: { campaignId: null, rowVersion: null, builderSaved: false }, saveState: 'idle', saveMessage: 'ยังไม่ได้บันทึก', errors: [], previewMode: 'user', dirty: false, timer: null, saveChain: Promise.resolve() };

    const setSaveState = (kind, message) => {
        state.saveState = kind; state.saveMessage = message;
        const node = container.querySelector('[data-svw-save-status]');
        if (node) { node.dataset.state = kind; node.textContent = message; }
    };

    const readFields = () => {
        container.querySelectorAll('[data-svw-field]').forEach(input => { if (input.type === 'radio' && !input.checked) return; state.draft[input.dataset.svwField] = input.type === 'number' ? Number(input.value) : input.value; });
        container.querySelectorAll('[data-svw-question-field]').forEach(input => { const index = Number(input.dataset.index), question = state.draft.questions[index]; if (question) question[input.dataset.svwQuestionField] = input.value; });
        state.draft.questions.forEach((question,index)=>{
            const title=container.querySelector(`[data-svw-field="question-${index}-title"]`),help=container.querySelector(`[data-svw-field="question-${index}-help"]`),options=container.querySelector(`[data-svw-field="question-${index}-options"]`);
            if(title)question.title=title.value;if(help)question.helpText=help.value;if(options)question.options=options.value.split('\n').map(value=>value.trim()).filter(Boolean).map((label,i)=>({label,optionCode:`O${i+1}`}));
        });
        container.querySelectorAll('[data-svw-rule-field]').forEach(input=>{const rule=state.draft.rules[Number(input.dataset.index)];if(!rule)return;rule[input.dataset.svwRuleField]=input.dataset.svwRuleField==='values'?input.value.split(',').map(x=>x.trim()).filter(Boolean):input.value;if(rule.attributeKey==='all')rule.values=[];});
    };

    const persistCampaign = async () => {
        readFields();
        if (!state.draft.campaignCode.trim() || !state.draft.titleTh.trim()) { setSaveState('idle', 'ยังไม่ได้บันทึก — ระบุรหัสและชื่อก่อน'); return false; }
        setSaveState('saving', 'กำลังบันทึก…');
        try {
            const payload = campaignPayload(state.draft);
            const response = state.persisted.campaignId
                ? await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}`, { ...payload, rowVersion: state.persisted.rowVersion })
                : await API.post('/safety-vote/admin/campaigns', payload);
            const row = response.data?.campaign || response.data;
            state.persisted.campaignId = Number(row.id);
            state.persisted.rowVersion = Number(row.RowVersion || row.rowVersion || 1);
            state.dirty = false;
            setSaveState('saved', `บันทึกแล้ว ${new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`);
            return true;
        } catch (error) {
            setSaveState('error', 'บันทึกไม่สำเร็จ — ลองอีกครั้ง');
            throw error;
        }
    };

    const saveBuilder = async () => {
        if (!contentValid(state.draft) || !await persistCampaign()) return false;
        setSaveState('saving', 'กำลังบันทึกเนื้อหา…');
        try {
            const response = await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/builder`, { questions: builderPayload(state.draft) });
            state.persisted.builderSaved = true;
            if (response.data?.questions?.length) state.draft.questions = response.data.questions;
            state.dirty = false; setSaveState('saved', 'บันทึกเนื้อหาแล้ว'); return true;
        } catch (error) { state.persisted.builderSaved = false; setSaveState('error', 'บันทึกเนื้อหาไม่สำเร็จ — ลองอีกครั้ง'); throw error; }
    };

    const saveRules = async () => {
        if (!await persistCampaign()) return false;
        await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/eligibility/rules`, { rules: state.draft.rules.map((rule,index)=>({...rule,ruleGroup:1,ruleOrder:index+1,operator:rule.attributeKey==='all'?'EQUALS':'IN'})) });
        return true;
    };

    const persistForStep = async step => {
        if (step === 0) return true;
        if ([1,2,5,6].includes(step)) return persistCampaign();
        if (step === 3) return saveBuilder();
        // Once the server has frozen the eligibility snapshot, moving forward must
        // not rewrite the rules behind that snapshot. Rule edits explicitly clear
        // the local frozen state and require a fresh preview/freeze cycle.
        if (step === 4) return state.draft.eligibilityFrozen ? true : saveRules();
        return true;
    };

    const enqueueSave = () => {
        clearTimeout(state.timer); state.dirty = true; setSaveState('dirty', 'ยังไม่ได้บันทึก');
        if (![1,2,3,5,6].includes(state.step)) return;
        state.timer = setTimeout(() => { state.saveChain = state.saveChain.then(() => persistForStep(state.step)).catch(()=>{}); }, 800);
    };

    const render = () => {
        const [stepKey, stepTitle] = WIZARD_STEPS[state.step];
        container.innerHTML = `<div class="svw-shell" data-sv-wizard="2026-10-08-safety-vote-ux2-r1"><header class="svw-header"><button type="button" class="sv-icon-button" data-svw-action="close" aria-label="กลับศูนย์จัดการ">←</button><div><p class="sv-eyebrow">สร้างแคมเปญ</p><h1>${escHtml(stepTitle)}</h1></div><div class="svw-progress-copy">ขั้น ${state.step + 1} จาก ${WIZARD_STEPS.length}</div></header><div class="svw-progress" role="progressbar" aria-label="ความคืบหน้าการสร้างแคมเปญ" aria-valuemin="1" aria-valuemax="8" aria-valuenow="${state.step + 1}"><span style="width:${(state.step + 1) / WIZARD_STEPS.length * 100}%"></span></div><div class="svw-layout"><nav class="svw-step-nav" aria-label="ขั้นตอนสร้างแคมเปญ">${WIZARD_STEPS.map(([key,label],index)=>`<button type="button" data-svw-step="${index}" ${index===state.step?'aria-current="step"':''} ${index>state.maxStep?'disabled':''}><span>${index+1}</span><span>${escHtml(label)}</span></button>`).join('')}</nav><main class="svw-main" data-step="${stepKey}">${state.errors.length?`<section class="svw-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบข้อมูล</h2><ul>${state.errors.map(error=>`<li>${escHtml(error)}</li>`).join('')}</ul></section>`:''}<section class="svw-card">${stepMarkup(state.step,state.draft,state.persisted,state.previewMode)}</section></main></div><div class="svw-save-status" data-svw-save-status data-state="${state.saveState}" aria-live="polite">${escHtml(state.saveMessage)}</div><footer class="svw-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svw-action="back" ${state.step===0?'disabled':''}>ย้อนกลับ</button><div>${state.saveState==='error'?'<button type="button" class="sv-button sv-button--secondary" data-svw-action="retry">ลองบันทึกอีกครั้ง</button>':''}${state.step===7?reviewAction():`<button type="button" class="sv-button sv-button--primary" data-svw-action="next">ถัดไป</button>`}</div></footer></div>`;
        container.querySelector('.svw-header')?.insertAdjacentHTML('beforebegin', safetyVoteJourneyNav({ role: 'admin', current: 'readiness', campaign: state.draft, onPage: typeof onNavigate !== 'function' }));
        bind();
    };

    const reviewAction = () => {
        const ready = readinessItems(state.draft,state.persisted).every(item=>item.pass), advanced = templateFor(state.draft.campaignType).advancedRequired;
        if (advanced) return `<button type="button" class="sv-button sv-button--primary" data-svw-action="advanced" ${!state.persisted.campaignId?'disabled':''}>ไปตั้งค่าขั้นสูง</button>`;
        return `<button type="button" class="sv-button sv-button--primary" data-svw-action="open" ${!ready?'disabled':''}>เปิดแคมเปญ</button>`;
    };

    const next = async () => {
        clearTimeout(state.timer); readFields(); state.errors = validateStep(state.step,state.draft); if(state.errors.length){render();container.querySelector('.svw-validation')?.focus();return;}
        try { await state.saveChain; if(!await persistForStep(state.step))return; state.step=Math.min(7,state.step+1);state.maxStep=Math.max(state.maxStep,state.step);state.errors=[];render();container.querySelector('.svw-main')?.focus?.(); }
        catch(error){state.errors=[error?.message||'บันทึกข้อมูลไม่สำเร็จ'];render();container.querySelector('.svw-validation')?.focus();}
    };

    const previewEligibility = async () => {
        clearTimeout(state.timer); readFields();
        try { await state.saveChain; await saveRules(); setSaveState('saving','กำลังตรวจสอบรายชื่อ…');const response=await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/eligibility/preview`,{rules:state.draft.rules.map((rule,index)=>({...rule,ruleGroup:1,ruleOrder:index+1,operator:rule.attributeKey==='all'?'EQUALS':'IN'}))});state.draft.eligibilityPreview=response.data;state.draft.eligibilityFrozen=false;setSaveState('saved','ตรวจสอบรายชื่อแล้ว');render(); }
        catch(error){state.errors=[error?.message||'ตรวจสอบรายชื่อไม่สำเร็จ'];setSaveState('error','ตรวจสอบไม่สำเร็จ — ลองอีกครั้ง');render();}
    };

    const freezeEligibility = () => openSafetyVoteConfirmDialog({title:'ยืนยันการตรึงรายชื่อผู้มีสิทธิ์',description:`ระบบจะบันทึกรายชื่อผู้มีสิทธิ์ ${Number(state.draft.eligibilityPreview?.eligibleCount||0).toLocaleString('th-TH')} คนเป็น snapshot สำหรับแคมเปญนี้ การเปลี่ยนกฎภายหลังต้องตรวจสอบและตรึงใหม่`,confirmLabel:'ยืนยันและตรึงรายชื่อ',onConfirm:async()=>{const response=await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/eligibility/freeze`,{reason:'Safety Vote UX Phase 2 readiness wizard'});state.draft.eligibilityFrozen=true;state.draft.eligibilityPreview={...state.draft.eligibilityPreview,...response.data};setSaveState('saved','ตรึงรายชื่อผู้มีสิทธิ์แล้ว');render();}});

    const openCampaign = () => openSafetyVoteConfirmDialog({title:'ยืนยันการเปิดแคมเปญ',description:'เมื่อเปิดแล้ว เนื้อหาและรายชื่อผู้มีสิทธิ์ชุดนี้จะถูกใช้รับคำตอบ การแก้ไขฉบับร่างจะถูกจำกัดตามกติกาเดิมของระบบ',confirmLabel:'เปิดแคมเปญ',onConfirm:async()=>{const response=await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/lifecycle/open`,{});showToast('เปิดแคมเปญแล้ว','success');await onComplete({campaignId:state.persisted.campaignId,status:response.data?.status||'Open'});}});

    const requestClose = () => { if(!state.dirty&&state.saveState!=='saving')return onClose();openSafetyVoteConfirmDialog({title:'ออกจากการสร้างแคมเปญ',description:'ข้อมูลที่บันทึกแล้วจะยังอยู่ แต่ข้อมูลล่าสุดที่ยังไม่ได้บันทึกอาจสูญหาย',confirmLabel:'ออกจากหน้านี้',tone:'danger',onConfirm:onClose}); };

    const bind = () => {
        container.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => onNavigate?.(button.dataset.svJourneyStep)));
        container.querySelectorAll('[data-svw-field],[data-svw-question-field],[data-svw-rule-field]').forEach(input=>input.addEventListener('input',()=>{readFields();if(input.dataset.svwRuleField){state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;}enqueueSave();}));
        container.querySelectorAll('[data-svw-question-field="questionType"]').forEach(input=>input.addEventListener('change',()=>{readFields();const question=state.draft.questions[Number(input.dataset.index)];if(question){question.options=hasOptions(question.questionType)?(question.options?.length?question.options:[{label:''},{label:''}]):[];question.minSelections=question.isRequired===false?0:1;question.maxSelections=question.questionType==='multiple_choice'?2:1;}state.persisted.builderSaved=false;render();}));
        container.querySelectorAll('[data-svw-rule-field="attributeKey"]').forEach(input=>input.addEventListener('change',()=>{readFields();state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}));
        container.querySelectorAll('input[type="radio"][data-svw-field]').forEach(input=>input.addEventListener('change',()=>{readFields();render();}));
        container.querySelectorAll('[data-svw-template]').forEach(button=>button.addEventListener('click',()=>{state.draft=applyTemplate(state.draft,button.dataset.svwTemplate);state.persisted.builderSaved=false;state.dirty=true;setSaveState('dirty','ยังไม่ได้บันทึก');render();}));
        container.querySelectorAll('[data-svw-step]').forEach(button=>button.addEventListener('click',()=>{readFields();state.step=Number(button.dataset.svwStep);state.errors=[];render();}));
        container.querySelectorAll('[data-svw-preview]').forEach(button=>button.addEventListener('click',()=>{state.previewMode=button.dataset.svwPreview;render();}));
        container.querySelectorAll('[data-svw-remove-question]').forEach(button=>button.addEventListener('click',()=>{state.draft.questions.splice(Number(button.dataset.svwRemoveQuestion),1);state.persisted.builderSaved=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-remove-rule]').forEach(button=>button.addEventListener('click',()=>{state.draft.rules.splice(Number(button.dataset.svwRemoveRule),1);state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}));
        container.querySelectorAll('[data-svw-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.svwAction;if(action==='next')next();else if(action==='back'){readFields();state.step=Math.max(0,state.step-1);state.errors=[];render();}else if(action==='close')requestClose();else if(action==='retry')persistForStep(state.step).catch(()=>{});else if(action==='add-question'){state.draft.questions.push(defaultQuestion(state.draft.campaignType,state.draft.questions.length));state.persisted.builderSaved=false;render();}else if(action==='add-rule'){state.draft.rules.push({effect:'include',attributeKey:'department_id',operator:'IN',values:[],reason:'กำหนดจาก wizard'});state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}else if(action==='preview-eligibility')previewEligibility();else if(action==='freeze-eligibility')freezeEligibility();else if(action==='open')openCampaign();else if(action==='advanced')onOpenAdvanced(state.persisted.campaignId);}));
    };

    render();
    return { getState:()=>structuredClone({step:state.step,maxStep:state.maxStep,draft:state.draft,persisted:state.persisted,saveState:state.saveState}), destroy:()=>clearTimeout(state.timer) };
}
