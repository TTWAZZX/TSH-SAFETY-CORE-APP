import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { openSafetyVoteConfirmDialog, safetyVoteCampaignPreview, safetyVoteJourneyNav } from './safety-vote-ux-components.js?v=20261009-safety-vote-ux8-r1';
import {
    WIZARD_STEPS, CORE_TEMPLATES, applyTemplate, builderPayload, campaignPayload, contentValid,
    createWizardDraft, defaultOptionsForType, defaultQuestion, defaultValidationForType, hasOptions,
    questionTypeAllowedForPrivacy, questionTypesFor, questionValidationErrors, readinessItems, scheduleValid,
    templateFor, validateStep
} from './safety-vote-wizard-model.mjs?v=20261009-safety-vote-phase103-r1';

const TYPE_LABELS = Object.fromEntries(CORE_TEMPLATES.map(item => [item.key, item.label]));
const QUESTION_LABELS = { single_choice: 'เลือกหนึ่งตัวเลือก', multiple_choice: 'เลือกหลายตัวเลือก', yes_no_abstain: 'ใช่/ไม่ใช่/งดออกเสียง', rating: 'ให้คะแนน', likert: 'ระดับความคิดเห็น', ranking: 'จัดอันดับ', matrix: 'ตารางคำตอบรายแถว', allocation: 'แบ่งคะแนน', token: 'จัดสรรโทเคน', short_text: 'ข้อความสั้น', long_text: 'ข้อความยาว', date_time: 'วันและเวลา', employee_picker: 'เลือกพนักงาน', organization_picker: 'เลือกหน่วยงาน', file_upload: 'แนบไฟล์คำตอบ' };
const PRIVACY_OPTIONS = [
    ['identified', 'ระบุตัวตน', 'คำตอบเชื่อมกับพนักงาน เหมาะกับงานที่ต้องติดตามรายบุคคล'],
    ['confidential', 'ข้อมูลลับ', 'ยังเก็บตัวตน แต่จำกัดผู้ที่เปิดดูข้อมูลรายบุคคลตามสิทธิ์'],
    ['anonymous', 'ไม่ระบุตัวตน', 'บัตรคำตอบไม่เชื่อมกลับไปยังพนักงาน และรายงานเน้นผลรวม'],
    ['secret_ballot', 'บัตรลงคะแนนลับ', 'แยกการเข้าร่วมออกจากตัวเลือก ซ่อนผลจนปิดและรับรอง']
];
const PRIVACY_DETAILS = {
    identified: ['ระบบเก็บความสัมพันธ์ระหว่างผู้ตอบกับคำตอบ', 'ผู้มีสิทธิ์ที่เหมาะสมสามารถตรวจข้อมูลรายบุคคลได้', 'เหมาะกับแบบสำรวจหรือกิจกรรมที่ต้องติดตามผลรายคน'],
    confidential: ['ระบบยังเก็บความสัมพันธ์ระหว่างผู้ตอบกับคำตอบ', 'ผู้ใช้ทั่วไปเห็นเฉพาะข้อมูลตามสิทธิ์ ผู้ตรวจสอบหรือผู้ส่งออกที่ได้รับอนุญาตอาจเข้าถึงข้อมูลจำกัด', 'ข้อมูลลับไม่เท่ากับไม่ระบุตัวตน'],
    anonymous: ['บัตรคำตอบไม่มีข้อมูลเชื่อมกลับไปยังพนักงาน', 'ระบบเก็บสถานะการเข้าร่วมแยกต่างหากเพื่อป้องกันการตอบซ้ำ', 'ไม่อนุญาตคำตอบแบบแนบไฟล์ และควรใช้จำนวนขั้นต่ำก่อนแสดงสถิติ'],
    secret_ballot: ['บัตรลงคะแนนไม่เก็บตัวตนและใบรับไม่แสดงตัวเลือก', 'สถานะการเข้าร่วมถูกเก็บแยกจากบัตรลงคะแนน', 'ห้ามผลสด ต้องปิดและรับรองก่อนเผยแพร่']
};
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
    const campaignCode = draft.campaignCode || 'SHE-001-YYYY';
    return `<div class="svw-form-grid"><label class="svw-field"><span>รหัสแคมเปญ</span><input id="svw-campaignCode" value="${escHtml(campaignCode)}" readonly aria-describedby="svw-campaign-code-help"><small id="svw-campaign-code-help">ระบบสร้างรหัสรูปแบบ SHE-001-YYYY อัตโนมัติเมื่อบันทึกครั้งแรก และไม่สามารถแก้ไขภายหลัง</small></label>${inputField('titleTh', 'ชื่อแคมเปญภาษาไทย', draft.titleTh, 'text', 'maxlength="200"')}${inputField('titleEn', 'ชื่อภาษาอังกฤษ (ถ้ามี)', draft.titleEn, 'text', 'maxlength="200"')}${textareaField('summary', 'สรุปสำหรับการ์ดกิจกรรม', draft.summary, 2)}${textareaField('description', 'รายละเอียดกิจกรรม', draft.description, 5)}</div>`;
}

function stepPrivacy(draft) {
    const selected = PRIVACY_OPTIONS.find(([key]) => key === draft.privacyMode) || PRIVACY_OPTIONS[0];
    return `<fieldset class="svw-choice-fieldset"><legend>เลือกรูปแบบความเป็นส่วนตัว</legend><div class="svw-choice-grid">${PRIVACY_OPTIONS.map(([key, label, description]) => `<label class="svw-choice ${draft.privacyMode === key ? 'is-selected' : ''}"><input type="radio" name="svw-privacy" value="${key}" data-svw-field="privacyMode" ${draft.privacyMode === key ? 'checked' : ''}><strong>${label}</strong><span>${description}</span></label>`).join('')}</div></fieldset><section class="svw-privacy-notice" role="note" aria-live="polite"><strong>${selected[1]}: ระบบเก็บและแสดงข้อมูลอย่างไร</strong><ul>${PRIVACY_DETAILS[draft.privacyMode].map(item => `<li>${escHtml(item)}</li>`).join('')}</ul><p class="svw-privacy-warning"><strong>ข้อควรทราบ:</strong> หลังตรึงรายชื่อหรือเปิดรับคำตอบแล้ว ไม่ควรเปลี่ยนระดับความเป็นส่วนตัวหรือความหมายของคำถาม จำนวนขั้นต่ำก่อนแสดงสถิติช่วยลดการคาดเดาตัวบุคคล</p></section>`;
}

function optionCard(option, questionIndex, optionIndex, total) {
    const imageAlt = option.label || `ตัวเลือก ${optionIndex + 1}`;
    const preview = option.previewUrl ? `<img src="${escHtml(option.previewUrl)}" alt="${escHtml(imageAlt)}">` : '<span aria-hidden="true">🖼️</span>';
    return `<article class="svw-option-card" data-svw-option-card="${questionIndex}:${optionIndex}"><div class="svw-option-media">${preview}</div><div class="svw-option-fields"><label class="svw-field"><span>ชื่อตัวเลือก</span><input data-svw-option-field="label" data-question-index="${questionIndex}" data-option-index="${optionIndex}" maxlength="300" value="${escHtml(option.label || '')}"></label><label class="svw-field"><span>คำอธิบาย (ถ้ามี)</span><textarea data-svw-option-field="description" data-question-index="${questionIndex}" data-option-index="${optionIndex}" rows="2" maxlength="2000">${escHtml(option.description || '')}</textarea></label><details class="svw-media-link"><summary>ลิงก์หรือวิดีโอ</summary><div class="svw-advanced-grid"><label class="svw-field"><span>ประเภท</span><select data-svw-option-field="mediaType" data-question-index="${questionIndex}" data-option-index="${optionIndex}"><option value="" ${!option.mediaType?'selected':''}>ไม่มี</option><option value="link" ${option.mediaType==='link'?'selected':''}>ลิงก์ HTTPS</option><option value="video" ${option.mediaType==='video'?'selected':''}>วิดีโอ YouTube / Vimeo</option></select></label><label class="svw-field"><span>URL</span><input type="url" inputmode="url" placeholder="https://" data-svw-option-field="mediaUrl" data-question-index="${questionIndex}" data-option-index="${optionIndex}" value="${escHtml(option.mediaUrl||'')}"></label><label class="svw-field"><span>ชื่อสื่อ (ถ้ามี)</span><input maxlength="200" data-svw-option-field="mediaTitle" data-question-index="${questionIndex}" data-option-index="${optionIndex}" value="${escHtml(option.mediaTitle||'')}"></label></div><p>ระบบไม่ดาวน์โหลดวิดีโอและไม่โหลด third-party อัตโนมัติ ผู้ใช้เป็นผู้กดเปิดเอง</p></details></div><div class="svw-option-actions" aria-label="จัดการตัวเลือก ${optionIndex + 1}"><button type="button" class="sv-icon-button" data-svw-move-option="up" data-question-index="${questionIndex}" data-option-index="${optionIndex}" aria-label="เลื่อนตัวเลือก ${optionIndex + 1} ขึ้น" ${optionIndex === 0 ? 'disabled' : ''}>↑</button><button type="button" class="sv-icon-button" data-svw-move-option="down" data-question-index="${questionIndex}" data-option-index="${optionIndex}" aria-label="เลื่อนตัวเลือก ${optionIndex + 1} ลง" ${optionIndex === total - 1 ? 'disabled' : ''}>↓</button><label class="sv-button sv-button--secondary svw-upload-button"><span>${option.fileId ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}</span><input type="file" accept="image/jpeg,image/png,image/webp" data-svw-option-image data-question-index="${questionIndex}" data-option-index="${optionIndex}"></label>${option.fileId ? `<button type="button" class="sv-button sv-button--secondary" data-svw-remove-option-image data-question-index="${questionIndex}" data-option-index="${optionIndex}">ลบรูป</button>` : ''}<button type="button" class="sv-icon-button sv-icon-button--danger" data-svw-remove-option data-question-index="${questionIndex}" data-option-index="${optionIndex}" aria-label="ลบตัวเลือก ${optionIndex + 1}" ${total <= 2 ? 'disabled' : ''}>×</button></div></article>`;
}

function questionPreview(question) {
    const optionRows = (question.options || []).map((option, index) => `<div class="svw-live-option"><span class="svw-live-option__control" aria-hidden="true">${question.questionType==='ranking'?index+1:''}</span>${option.previewUrl ? `<img src="${escHtml(option.previewUrl)}" alt="${escHtml(option.label || `ตัวเลือก ${index + 1}`)}">` : ''}<span><strong>${escHtml(option.label || `ตัวเลือก ${index + 1}`)}</strong>${option.description ? `<small>${escHtml(option.description)}</small>` : ''}${option.mediaType&&option.mediaUrl?`<a href="${escHtml(option.mediaUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${option.mediaType==='video'?'เปิดวิดีโอ':'เปิดลิงก์'}${option.mediaTitle?` — ${escHtml(option.mediaTitle)}`:''}</a>`:''}</span>${['allocation','token','matrix'].includes(question.questionType)?'<input tabindex="-1" disabled aria-label="ตัวอย่างช่องคำตอบ">':''}</div>`).join('');
    const validation=question.validation||{};
    let options=optionRows;
    if(question.questionType==='rating')options=`<div class="svw-live-scale"><span>${Number(validation.minNumber??1)}</span><input type="range" disabled><span>${Number(validation.maxNumber??5)}</span></div>`;
    else if(question.questionType==='long_text')options='<textarea class="svw-live-answer" disabled aria-label="ตัวอย่างคำตอบแบบยาว"></textarea>';
    else if(['short_text','employee_picker','organization_picker','date_time'].includes(question.questionType))options=`<input class="svw-live-answer" disabled placeholder="${question.questionType==='date_time'?'เลือกวันและเวลา':'กรอกคำตอบ'}" aria-label="ตัวอย่างช่องคำตอบ">`;
    else if(question.questionType==='file_upload')options='<div class="svw-live-answer">เลือกไฟล์คำตอบส่วนตัว</div>';
    return `<aside class="svw-question-preview" aria-label="ตัวอย่างคำถามสำหรับผู้เข้าร่วม"><span>Preview</span><h4>${escHtml(question.title || 'ตัวอย่างคำถาม')}</h4>${question.helpText ? `<p>${escHtml(question.helpText)}</p>` : ''}<div>${options}</div></aside>`;
}

function advancedQuestionSettings(question,index,draft){
    const validation=question.validation||{},earlier=draft.questions.slice(0,index),condition=question.displayCondition||null,operator=condition?.operator||'answered',needsValue=!['answered','not_answered'].includes(operator),errors=questionValidationErrors(question,draft,index);
    const selection=hasOptions(question.questionType)?`<label class="svw-field"><span>เลือกขั้นต่ำ</span><input type="number" min="0" max="100" data-svw-question-config="minSelections" data-question-index="${index}" value="${Number(question.minSelections??1)}"></label><label class="svw-field"><span>เลือกสูงสุด</span><input type="number" min="1" max="100" data-svw-question-config="maxSelections" data-question-index="${index}" value="${Number(question.maxSelections??1)}"></label>`:'';
    const numeric=question.questionType==='rating'?`<label class="svw-field"><span>คะแนนต่ำสุด</span><input type="number" data-svw-validation-field="minNumber" data-question-index="${index}" value="${Number(validation.minNumber??1)}"></label><label class="svw-field"><span>คะแนนสูงสุด</span><input type="number" data-svw-validation-field="maxNumber" data-question-index="${index}" value="${Number(validation.maxNumber??5)}"></label>`:'';
    const textRange=['short_text','long_text','employee_picker','organization_picker'].includes(question.questionType)?`<label class="svw-field"><span>อักษรขั้นต่ำ</span><input type="number" min="0" data-svw-validation-field="minLength" data-question-index="${index}" value="${Number(validation.minLength??1)}"></label><label class="svw-field"><span>อักษรสูงสุด</span><input type="number" min="1" max="${question.questionType==='long_text'?10000:1000}" data-svw-validation-field="maxLength" data-question-index="${index}" value="${Number(validation.maxLength??(question.questionType==='long_text'?10000:1000))}"></label>`:'';
    const total=['allocation','token'].includes(question.questionType)?`<label class="svw-field"><span>ยอดรวมสูงสุด</span><input type="number" min="1" data-svw-validation-field="totalMax" data-question-index="${index}" value="${Number(validation.totalMax??100)}"></label>`:'';
    const conditionOptions=earlier.map(item=>`<option value="${escHtml(item.questionCode)}" ${condition?.questionCode===item.questionCode?'selected':''}>${escHtml(item.questionCode)} — ${escHtml(item.title||'ยังไม่มีชื่อ')}</option>`).join('');
    return `<details class="svw-advanced-settings"><summary>การตั้งค่าและ Validation ขั้นสูง</summary><div class="svw-advanced-grid"><label class="svw-toggle"><input type="checkbox" data-svw-question-config="isRequired" data-question-index="${index}" ${question.isRequired!==false?'checked':''}><span>จำเป็นต้องตอบ</span></label>${selection}${numeric}${textRange}${total}<label class="svw-field"><span>แสดงเมื่อ</span><select data-svw-condition-field="questionCode" data-question-index="${index}"><option value="">แสดงเสมอ</option>${conditionOptions}</select></label>${earlier.length?`<label class="svw-field"><span>เงื่อนไข</span><select data-svw-condition-field="operator" data-question-index="${index}" ${condition?'':'disabled'}>${[['answered','ตอบแล้ว'],['not_answered','ยังไม่ตอบ'],['equals','เท่ากับ'],['not_equals','ไม่เท่ากับ'],['includes','มีตัวเลือก'],['not_includes','ไม่มีตัวเลือก']].map(([value,label])=>`<option value="${value}" ${operator===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="svw-field"><span>ค่าที่ใช้เปรียบเทียบ</span><input data-svw-condition-field="value" data-question-index="${index}" value="${escHtml(condition?.value||'')}" ${!condition||!needsValue?'disabled':''} placeholder="รหัสตัวเลือกหรือค่า"></label>`:''}</div>${errors.length?`<ul class="svw-question-errors" role="alert">${errors.map(error=>`<li>${escHtml(error)}</li>`).join('')}</ul>`:''}</details>`;
}

function questionCard(question, index, draft) {
    const allowed = questionTypesFor(draft.campaignType);
    const optionBuilder = hasOptions(question.questionType) ? `<section class="svw-option-builder" aria-label="ตัวเลือกของข้อ ${index + 1}"><div class="svw-option-builder__heading"><div><h4>ตัวเลือก</h4><p>เพิ่มรายละเอียด รูปภาพ และจัดลำดับได้ทีละรายการ</p></div><button type="button" class="sv-button sv-button--secondary" data-svw-add-option="${index}">เพิ่มตัวเลือก</button></div><div class="svw-option-list">${(question.options || []).map((option, optionIndex) => optionCard(option, index, optionIndex, question.options.length)).join('')}</div><details class="svw-bulk-import"><summary>นำเข้าหลายตัวเลือก (Bulk import)</summary><p>หนึ่งรายการต่อบรรทัด รองรับ <code>ชื่อ | คำอธิบาย</code></p><textarea rows="5" data-svw-bulk-input="${index}" placeholder="แนวคิด A | ลดความเสี่ยงจากการลื่นล้ม&#10;แนวคิด B | ตรวจเครื่องจักรก่อนเริ่มงาน"></textarea><div><label><input type="radio" name="svw-bulk-mode-${index}" value="append" checked> เพิ่มต่อท้าย</label><label><input type="radio" name="svw-bulk-mode-${index}" value="replace"> แทนที่ทั้งหมด</label><button type="button" class="sv-button sv-button--secondary" data-svw-bulk-apply="${index}">นำเข้า</button></div></details></section>` : '<p class="svw-inline-note">คำถามรูปแบบนี้ไม่ใช้รายการตัวเลือก</p>';
    return `<fieldset class="svw-question"><legend>ข้อ ${index + 1}</legend><div class="svw-question__heading"><label class="svw-field"><span>รูปแบบคำถาม</span><select data-svw-question-field="questionType" data-index="${index}">${allowed.map(type => `<option value="${type}" ${question.questionType === type ? 'selected' : ''} ${!questionTypeAllowedForPrivacy(type,draft.privacyMode)&&question.questionType!==type?'disabled':''}>${escHtml(QUESTION_LABELS[type] || type)}${!questionTypeAllowedForPrivacy(type,draft.privacyMode)?' — ไม่รองรับ Privacy นี้':''}</option>`).join('')}</select></label><div class="svw-question-actions"><button type="button" class="sv-icon-button" data-svw-move-question="up" data-index="${index}" aria-label="เลื่อนคำถามข้อ ${index + 1} ขึ้น" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" class="sv-icon-button" data-svw-move-question="down" data-index="${index}" aria-label="เลื่อนคำถามข้อ ${index + 1} ลง" ${index === draft.questions.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="sv-button sv-button--secondary" data-svw-remove-question="${index}" ${draft.questions.length === 1 ? 'disabled' : ''}>ลบข้อนี้</button></div></div><div class="svw-question-grid"><div>${inputField(`question-${index}-title`, 'คำถามหรือหัวข้อ', question.title, 'text', `data-question-index="${index}"`)}${textareaField(`question-${index}-help`, 'คำแนะนำเพิ่มเติม (ถ้ามี)', question.helpText, 2)}${advancedQuestionSettings(question,index,draft)}${optionBuilder}</div>${questionPreview(question)}</div></fieldset>`;
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
    const state = { step: 0, maxStep: 0, draft: createWizardDraft(), persisted: { campaignId: null, versionId: null, rowVersion: null, builderSaved: false }, saveState: 'idle', saveMessage: 'ยังไม่ได้บันทึก', errors: [], previewMode: 'user', dirty: false, timer: null, saveChain: Promise.resolve(), objectUrls: new Set(), hydratingFiles: new Set() };

    const setSaveState = (kind, message) => {
        state.saveState = kind; state.saveMessage = message;
        const node = container.querySelector('[data-svw-save-status]');
        if (node) { node.dataset.state = kind; node.textContent = message; }
    };

    const readFields = () => {
        container.querySelectorAll('[data-svw-field]').forEach(input => { if (input.type === 'radio' && !input.checked) return; state.draft[input.dataset.svwField] = input.type === 'number' ? Number(input.value) : input.value; });
        container.querySelectorAll('[data-svw-question-field]').forEach(input => { const index = Number(input.dataset.index), question = state.draft.questions[index]; if (question) question[input.dataset.svwQuestionField] = input.value; });
        state.draft.questions.forEach((question,index)=>{
            const title=container.querySelector(`[data-svw-field="question-${index}-title"]`),help=container.querySelector(`[data-svw-field="question-${index}-help"]`);
            if(title)question.title=title.value;if(help)question.helpText=help.value;
        });
        container.querySelectorAll('[data-svw-option-field]').forEach(input=>{
            const question=state.draft.questions[Number(input.dataset.questionIndex)],option=question?.options?.[Number(input.dataset.optionIndex)];
            if(option)option[input.dataset.svwOptionField]=input.value;
        });
        container.querySelectorAll('[data-svw-question-config]').forEach(input=>{
            const question=state.draft.questions[Number(input.dataset.questionIndex)];if(!question)return;
            question[input.dataset.svwQuestionConfig]=input.type==='checkbox'?input.checked:Number(input.value);
        });
        container.querySelectorAll('[data-svw-validation-field]').forEach(input=>{
            const question=state.draft.questions[Number(input.dataset.questionIndex)];if(!question)return;
            question.validation={...(question.validation||{}),[input.dataset.svwValidationField]:Number(input.value)};
        });
        container.querySelectorAll('[data-svw-condition-field]').forEach(input=>{
            const question=state.draft.questions[Number(input.dataset.questionIndex)];if(!question)return;
            const questionCode=container.querySelector(`[data-svw-condition-field="questionCode"][data-question-index="${input.dataset.questionIndex}"]`)?.value||'';
            if(!questionCode){question.displayCondition=null;return;}
            question.displayCondition={questionCode,operator:container.querySelector(`[data-svw-condition-field="operator"][data-question-index="${input.dataset.questionIndex}"]`)?.value||'answered',value:container.querySelector(`[data-svw-condition-field="value"][data-question-index="${input.dataset.questionIndex}"]`)?.value||''};
        });
        container.querySelectorAll('[data-svw-rule-field]').forEach(input=>{const rule=state.draft.rules[Number(input.dataset.index)];if(!rule)return;rule[input.dataset.svwRuleField]=input.dataset.svwRuleField==='values'?input.value.split(',').map(x=>x.trim()).filter(Boolean):input.value;if(rule.attributeKey==='all')rule.values=[];});
    };

    const persistCampaign = async () => {
        readFields();
        if (!state.draft.titleTh.trim()) { setSaveState('idle', 'ยังไม่ได้บันทึก — ระบุชื่อแคมเปญก่อน'); return false; }
        setSaveState('saving', 'กำลังบันทึก…');
        try {
            const payload = campaignPayload(state.draft);
            const response = state.persisted.campaignId
                ? await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}`, { ...payload, rowVersion: state.persisted.rowVersion })
                : await API.post('/safety-vote/admin/campaigns', payload);
            const row = response.data?.campaign || response.data;
            state.persisted.campaignId = Number(row.id);
            state.persisted.versionId = Number(row.CurrentVersionID || row.currentVersionId || state.persisted.versionId || 0);
            state.persisted.rowVersion = Number(row.RowVersion || row.rowVersion || 1);
            state.draft.campaignCode = row.CampaignCode || row.campaignCode || state.draft.campaignCode;
            const codeField = container.querySelector('#svw-campaignCode');
            if (codeField && state.draft.campaignCode) codeField.value = state.draft.campaignCode;
            state.dirty = false;
            setSaveState('saved', `บันทึกแล้ว ${new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`);
            return true;
        } catch (error) {
            setSaveState('error', 'บันทึกไม่สำเร็จ — ลองอีกครั้ง');
            throw error;
        }
    };

    const preserveOptionPreviews = questions => {
        const previews = new Map();
        state.draft.questions.forEach((question,questionIndex) => (question.options || []).forEach((option,optionIndex) => {
            const key=`${question.questionCode||`Q${questionIndex+1}`}|${option.optionCode||`O${optionIndex+1}`}`;
            previews.set(key, { previewUrl: option.previewUrl, imageUnavailable: option.imageUnavailable, mediaType:option.mediaType||'', mediaUrl:option.mediaUrl||'', mediaTitle:option.mediaTitle||'' });
        }));
        return questions.map((question,questionIndex) => ({ ...question, options: (question.options || []).map((option,optionIndex) => ({ ...option, ...(previews.get(`${question.questionCode||`Q${questionIndex+1}`}|${option.optionCode||`O${optionIndex+1}`}`) || {}) })) }));
    };

    const mediaPayload = () => state.draft.questions.flatMap((question,questionIndex)=>(question.options||[]).map((option,optionIndex)=>({
        mediaType:option.mediaType, scopeType:'option', questionCode:question.questionCode||`Q${questionIndex+1}`, optionCode:option.optionCode||`O${optionIndex+1}`, url:option.mediaUrl, title:option.mediaTitle
    })).filter(item=>item.mediaType&&item.url));

    const saveBuilder = async () => {
        if (!contentValid(state.draft) || !await persistCampaign()) return false;
        setSaveState('saving', 'กำลังบันทึกเนื้อหา…');
        try {
            const response = await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/builder`, { questions: builderPayload(state.draft) });
            await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/versions/${state.persisted.versionId}/media`, { items: mediaPayload() });
            state.persisted.builderSaved = true;
            if (response.data?.questions?.length) state.draft.questions = preserveOptionPreviews(response.data.questions);
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

    const revokePreview = option => {
        if (option?.previewUrl?.startsWith('blob:')) { URL.revokeObjectURL(option.previewUrl); state.objectUrls.delete(option.previewUrl); }
        if (option) delete option.previewUrl;
    };

    const deleteOptionFile = async option => {
        if (!option?.fileId || !state.persisted.campaignId) return;
        await API.delete(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/files/${option.fileId}`, { body: JSON.stringify({ reason: 'Removed from question option card builder' }) });
        revokePreview(option); option.fileId = null; delete option.fileName;
    };

    const hydrateOptionImages = async () => {
        const options = state.draft.questions.flatMap(question => question.options || []).filter(option => option.fileId && !option.previewUrl && !option.imageUnavailable && !state.hydratingFiles.has(Number(option.fileId)));
        if (!options.length) return;
        await Promise.all(options.map(async option => {
            const fileId = Number(option.fileId); state.hydratingFiles.add(fileId);
            try { const response = await API.get(`/safety-vote/files/${fileId}`); const url = URL.createObjectURL(await response.blob()); state.objectUrls.add(url); option.previewUrl = url; }
            catch (_) { option.imageUnavailable = true; }
            finally { state.hydratingFiles.delete(fileId); }
        }));
        if (state.step === 3) render();
    };

    const uploadOptionImage = async input => {
        readFields(); const file = input.files?.[0]; if (!file) return;
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { showToast('รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB', 'error'); input.value=''; return; }
        let uploadedFileId = null;
        try {
            if (!state.persisted.campaignId && !await persistCampaign()) { input.value=''; return; }
            const question = state.draft.questions[Number(input.dataset.questionIndex)], option = question?.options?.[Number(input.dataset.optionIndex)];
            if (!option) return;
            const oldFile = option.fileId, form = new FormData(); form.append('file', file); form.append('filePurpose', 'option_image');
            setSaveState('saving', 'กำลังอัปโหลดรูปภาพ…');
            const response = await API.upload(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/files`, form);
            uploadedFileId = Number(response.data.id);
            if (oldFile) await deleteOptionFile({ ...option, fileId: oldFile });
            revokePreview(option); option.fileId = uploadedFileId; option.fileName = response.data.originalName || file.name; delete option.imageUnavailable;
            option.previewUrl = URL.createObjectURL(file); state.objectUrls.add(option.previewUrl); state.persisted.builderSaved=false; enqueueSave(); render();
        } catch (error) {
            if (uploadedFileId) await API.delete(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/files/${uploadedFileId}`, { body: JSON.stringify({ reason: 'Rollback incomplete option image replacement' }) }).catch(()=>{});
            setSaveState('error', 'อัปโหลดรูปภาพไม่สำเร็จ'); showToast(error?.message || 'อัปโหลดรูปภาพไม่สำเร็จ', 'error');
        }
    };

    const moveItem = (items, index, direction) => { const target = index + (direction === 'up' ? -1 : 1); if (target < 0 || target >= items.length) return false; [items[index], items[target]] = [items[target], items[index]]; return true; };
    const nextQuestionCode = () => { const used=new Set(state.draft.questions.map(question=>question.questionCode));let index=1;while(used.has(`Q${index}`))index++;return`Q${index}`; };

    const applyBulkImport = async questionIndex => {
        readFields(); const input=container.querySelector(`[data-svw-bulk-input="${questionIndex}"]`), question=state.draft.questions[questionIndex]; if(!input||!question)return;
        const imported=input.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{const [label,...description]=line.split('|');return {label:label.trim(),description:description.join('|').trim()};}).filter(option=>option.label);
        if(!imported.length){showToast('กรุณาใส่ตัวเลือกอย่างน้อย 1 รายการ','error');return;}
        const mode=container.querySelector(`input[name="svw-bulk-mode-${questionIndex}"]:checked`)?.value||'append', next=mode==='replace'?imported:[...(question.options||[]),...imported];
        if(next.length>100){showToast('หนึ่งคำถามมีตัวเลือกได้สูงสุด 100 รายการ','error');return;}
        try {
            if(mode==='replace')for(const option of question.options||[])await deleteOptionFile(option);
            question.options=next;state.persisted.builderSaved=false;enqueueSave();render();
        } catch(error) { showToast(error?.message||'นำเข้าตัวเลือกไม่สำเร็จ','error'); render(); }
    };

    const render = () => {
        const [stepKey, stepTitle] = WIZARD_STEPS[state.step];
        container.innerHTML = `<div class="svw-shell" data-sv-wizard="2026-10-08-safety-vote-ux2-r1"><header class="svw-header"><button type="button" class="sv-icon-button" data-svw-action="close" aria-label="กลับศูนย์จัดการ">←</button><div><p class="sv-eyebrow">สร้างแคมเปญ</p><h1>${escHtml(stepTitle)}</h1></div><div class="svw-progress-copy">ขั้น ${state.step + 1} จาก ${WIZARD_STEPS.length}</div></header><div class="svw-progress" role="progressbar" aria-label="ความคืบหน้าการสร้างแคมเปญ" aria-valuemin="1" aria-valuemax="8" aria-valuenow="${state.step + 1}"><span style="width:${(state.step + 1) / WIZARD_STEPS.length * 100}%"></span></div><div class="svw-layout"><nav class="svw-step-nav" aria-label="ขั้นตอนสร้างแคมเปญ">${WIZARD_STEPS.map(([key,label],index)=>`<button type="button" data-svw-step="${index}" ${index===state.step?'aria-current="step"':''} ${index>state.maxStep?'disabled':''}><span>${index+1}</span><span>${escHtml(label)}</span></button>`).join('')}</nav><main class="svw-main" data-step="${stepKey}">${state.errors.length?`<section class="svw-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบข้อมูล</h2><ul>${state.errors.map(error=>`<li>${escHtml(error)}</li>`).join('')}</ul></section>`:''}<section class="svw-card">${stepMarkup(state.step,state.draft,state.persisted,state.previewMode)}</section></main></div><div class="svw-save-status" data-svw-save-status data-state="${state.saveState}" aria-live="polite">${escHtml(state.saveMessage)}</div><footer class="svw-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svw-action="back" ${state.step===0?'disabled':''}>ย้อนกลับ</button><div>${state.saveState==='error'?'<button type="button" class="sv-button sv-button--secondary" data-svw-action="retry">ลองบันทึกอีกครั้ง</button>':''}${state.step===7?reviewAction():`<button type="button" class="sv-button sv-button--primary" data-svw-action="next">ถัดไป</button>`}</div></footer></div>`;
        container.querySelector('.svw-header')?.insertAdjacentHTML('beforebegin', safetyVoteJourneyNav({ role: 'admin', current: 'readiness', campaign: state.draft, onPage: typeof onNavigate !== 'function' }));
        bind();
        if (state.step === 3) hydrateOptionImages();
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

    const cleanup = () => { clearTimeout(state.timer); state.objectUrls.forEach(url=>URL.revokeObjectURL(url)); state.objectUrls.clear(); };
    const finishClose = () => { cleanup(); onClose(); };
    const requestClose = () => { if(!state.dirty&&state.saveState!=='saving')return finishClose();openSafetyVoteConfirmDialog({title:'ออกจากการสร้างแคมเปญ',description:'ข้อมูลที่บันทึกแล้วจะยังอยู่ แต่ข้อมูลล่าสุดที่ยังไม่ได้บันทึกอาจสูญหาย',confirmLabel:'ออกจากหน้านี้',tone:'danger',onConfirm:finishClose}); };

    const bind = () => {
        container.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => onNavigate?.(button.dataset.svJourneyStep)));
        container.querySelectorAll('[data-svw-field],[data-svw-question-field],[data-svw-option-field],[data-svw-question-config],[data-svw-validation-field],[data-svw-condition-field],[data-svw-rule-field]').forEach(input=>input.addEventListener('input',()=>{readFields();if(input.dataset.svwRuleField){state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;}if(input.dataset.svwOptionField||input.dataset.svwQuestionConfig||input.dataset.svwValidationField||input.dataset.svwConditionField)state.persisted.builderSaved=false;enqueueSave();}));
        container.querySelectorAll('[data-svw-option-field]').forEach(input=>input.addEventListener('change',()=>{readFields();render();}));
        container.querySelectorAll('[data-svw-question-config],[data-svw-validation-field]').forEach(input=>input.addEventListener('change',()=>{readFields();const question=state.draft.questions[Number(input.dataset.questionIndex)];if(question&&input.dataset.svwQuestionConfig==='isRequired')question.minSelections=question.isRequired===false?0:Math.max(1,Number(question.minSelections||1));state.persisted.builderSaved=false;render();}));
        container.querySelectorAll('[data-svw-condition-field]').forEach(input=>input.addEventListener('change',()=>{readFields();state.persisted.builderSaved=false;render();}));
        container.querySelectorAll('[data-svw-question-field="questionType"]').forEach(input=>input.addEventListener('change',async()=>{const question=state.draft.questions[Number(input.dataset.index)],previousType=question?.questionType;readFields();if(question){if(hasOptions(previousType)&&!hasOptions(question.questionType)){try{for(const option of question.options||[])await deleteOptionFile(option);}catch(error){question.questionType=previousType;showToast(error?.message||'เปลี่ยนรูปแบบคำถามไม่สำเร็จ','error');return render();}}question.options=hasOptions(question.questionType)?(question.options?.length?question.options:defaultOptionsForType(question.questionType)):[];question.validation=defaultValidationForType(question.questionType);question.minSelections=question.isRequired===false?0:1;question.maxSelections=['multiple_choice','ranking'].includes(question.questionType)?Math.min(2,question.options.length):1;}state.persisted.builderSaved=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-rule-field="attributeKey"]').forEach(input=>input.addEventListener('change',()=>{readFields();state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}));
        container.querySelectorAll('input[type="radio"][data-svw-field]').forEach(input=>input.addEventListener('change',()=>{readFields();render();}));
        container.querySelectorAll('[data-svw-template]').forEach(button=>button.addEventListener('click',()=>{state.draft=applyTemplate(state.draft,button.dataset.svwTemplate);state.persisted.builderSaved=false;state.dirty=true;setSaveState('dirty','ยังไม่ได้บันทึก');render();}));
        container.querySelectorAll('[data-svw-step]').forEach(button=>button.addEventListener('click',()=>{readFields();state.step=Number(button.dataset.svwStep);state.errors=[];render();}));
        container.querySelectorAll('[data-svw-preview]').forEach(button=>button.addEventListener('click',()=>{state.previewMode=button.dataset.svwPreview;render();}));
        container.querySelectorAll('[data-svw-add-option]').forEach(button=>button.addEventListener('click',()=>{readFields();const question=state.draft.questions[Number(button.dataset.svwAddOption)];if(!question)return;if((question.options||[]).length>=100)return showToast('หนึ่งคำถามมีตัวเลือกได้สูงสุด 100 รายการ','error');question.options=[...(question.options||[]),{label:'',description:'',fileId:null}];state.persisted.builderSaved=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-move-option]').forEach(button=>button.addEventListener('click',()=>{readFields();const question=state.draft.questions[Number(button.dataset.questionIndex)];if(question&&moveItem(question.options,Number(button.dataset.optionIndex),button.dataset.svwMoveOption)){state.persisted.builderSaved=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-move-question]').forEach(button=>button.addEventListener('click',()=>{readFields();if(moveItem(state.draft.questions,Number(button.dataset.index),button.dataset.svwMoveQuestion)){state.persisted.builderSaved=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-bulk-apply]').forEach(button=>button.addEventListener('click',()=>applyBulkImport(Number(button.dataset.svwBulkApply))));
        container.querySelectorAll('[data-svw-option-image]').forEach(input=>input.addEventListener('change',()=>uploadOptionImage(input)));
        container.querySelectorAll('[data-svw-remove-option-image]').forEach(button=>button.addEventListener('click',async()=>{readFields();const option=state.draft.questions[Number(button.dataset.questionIndex)]?.options?.[Number(button.dataset.optionIndex)];if(!option)return;try{await deleteOptionFile(option);state.persisted.builderSaved=false;enqueueSave();render();}catch(error){showToast(error?.message||'ลบรูปภาพไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-option]').forEach(button=>button.addEventListener('click',async()=>{readFields();const question=state.draft.questions[Number(button.dataset.questionIndex)],index=Number(button.dataset.optionIndex),option=question?.options?.[index];if(!question||!option||question.options.length<=2)return;try{await deleteOptionFile(option);question.options.splice(index,1);state.persisted.builderSaved=false;enqueueSave();render();}catch(error){showToast(error?.message||'ลบตัวเลือกไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-question]').forEach(button=>button.addEventListener('click',async()=>{readFields();const index=Number(button.dataset.svwRemoveQuestion),question=state.draft.questions[index];if(!question||state.draft.questions.length<=1)return;try{for(const option of question.options||[])await deleteOptionFile(option);state.draft.questions.splice(index,1);state.persisted.builderSaved=false;enqueueSave();render();}catch(error){showToast(error?.message||'ลบคำถามไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-rule]').forEach(button=>button.addEventListener('click',()=>{state.draft.rules.splice(Number(button.dataset.svwRemoveRule),1);state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}));
        container.querySelectorAll('[data-svw-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.svwAction;if(action==='next')next();else if(action==='back'){readFields();state.step=Math.max(0,state.step-1);state.errors=[];render();}else if(action==='close')requestClose();else if(action==='retry')persistForStep(state.step).catch(()=>{});else if(action==='add-question'){const question=defaultQuestion(state.draft.campaignType,state.draft.questions.length);question.questionCode=nextQuestionCode();state.draft.questions.push(question);state.persisted.builderSaved=false;render();}else if(action==='add-rule'){state.draft.rules.push({effect:'include',attributeKey:'department_id',operator:'IN',values:[],reason:'กำหนดจาก wizard'});state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}else if(action==='preview-eligibility')previewEligibility();else if(action==='freeze-eligibility')freezeEligibility();else if(action==='open')openCampaign();else if(action==='advanced')onOpenAdvanced(state.persisted.campaignId);}));
    };

    render();
    return { getState:()=>structuredClone({step:state.step,maxStep:state.maxStep,draft:state.draft,persisted:state.persisted,saveState:state.saveState}), destroy:cleanup };
}
