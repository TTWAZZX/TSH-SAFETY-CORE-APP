import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml, showToast } from '../ui.js?v=20260602-mobile-nav-m53';
import { bindSafetyVoteCampaignPreview, openSafetyVoteConfirmDialog, safetyVoteCampaignPreview, safetyVoteJourneyNav } from './safety-vote-ux-components.js?v=20261027-safety-vote-jury-score-ux-r1';
import { bindSafetyVoteImageGallery } from './safety-vote-image-gallery.js?v=20261027-safety-vote-jury-work-media-r1';
import { formatThaiDateTime, formatThaiTime, joinBangkokInput, splitBangkokInput, toBangkokInputValue } from './safety-vote-time.mjs?v=20261015-safety-vote-thai-time-r1';
import { bindSafetyVotePeoplePickers, safetyVotePeoplePickerMarkup } from './safety-vote-people-picker.js?v=20261024-safety-vote-people-picker-r1';
import { hydrateSafetyVoteImages, releaseSafetyVoteImages } from '../utils/safety-vote-auth-image.js?v=20261020-safety-vote-duplicate-media-r3';
import {
    WIZARD_STEPS, CORE_TEMPLATES, applyTemplate, builderPayload, campaignPayload, contentValid, contentValidationErrors,
    createWizardDraft, defaultOptionsForType, defaultQuestion, defaultValidationForType, defaultWork, hasOptions, juryValidationErrors,
    LIVE_LEADERBOARD_TOP_N_MAX, LIVE_LEADERBOARD_TOP_N_MIN, LIVE_LEADERBOARD_TOP_N_PRESETS, liveLeaderboardTopNValid,
    OFFICIAL_RESULT_TOP_N_MAX, OFFICIAL_RESULT_TOP_N_MIN, OFFICIAL_RESULT_TOP_N_PRESETS, officialResultTopNValid,
    questionTypeAllowedForPrivacy, questionTypesFor, questionValidationErrors, readinessItems, scheduleValid,
    templateFor, validateStep, wizardStepsFor, workflowProfileFor
} from './safety-vote-wizard-model.mjs?v=20261029-safety-vote-live-topn-r1';

const TYPE_LABELS = Object.fromEntries(CORE_TEMPLATES.map(item => [item.key, item.label]));

function officialResultTopNMarkup(value, resultReleasePolicy, campaignType) {
    const current = Number(value || 5);
    const preset = OFFICIAL_RESULT_TOP_N_PRESETS.includes(current) ? String(current) : 'custom';
    const presetOptions = OFFICIAL_RESULT_TOP_N_PRESETS.map(topN => `<option value="${topN}" ${preset===String(topN)?'selected':''}>Top ${topN}</option>`).join('');
    return `<section class="svw-live-config" aria-labelledby="svw-official-topn-title"><div class="svw-section-heading"><div><p class="sv-eyebrow">Official results</p><h3 id="svw-official-topn-title">ผลอย่างเป็นทางการและการเผยแพร่</h3></div></div><div class="svw-form-grid"><label class="svw-field"><span>ตัวเลือกด่วน</span><select data-svw-official-topn-preset>${presetOptions}<option value="custom" ${preset==='custom'?'selected':''}>กำหนดจำนวนเอง</option></select><small>เลือกค่าที่ใช้บ่อย หรือเลือกกำหนดเอง</small></label><label class="svw-field"><span>จำนวนอันดับที่เผยแพร่</span><input type="number" inputmode="numeric" min="${OFFICIAL_RESULT_TOP_N_MIN}" max="${OFFICIAL_RESULT_TOP_N_MAX}" step="1" data-svw-field="officialResultTopN" value="${current}"><small>กำหนดได้ ${OFFICIAL_RESULT_TOP_N_MIN}–${OFFICIAL_RESULT_TOP_N_MAX} อันดับ · กรณีคะแนนเสมอที่อันดับสุดท้ายจะแสดงผู้ที่เสมอกันครบ</small></label><label class="svw-field"><span>นโยบายเผยแพร่ผล</span><select data-svw-field="resultReleasePolicy"><option value="automatic" ${resultReleasePolicy==='automatic'?'selected':''}>อัตโนมัติเมื่อผ่านเงื่อนไข</option><option value="manual" ${resultReleasePolicy==='manual'?'selected':''}>ให้แอดมินรับรองและเผยแพร่</option></select><small>${campaignType==='popular_vote'?'แบบอัตโนมัติจะคำนวณและเผยแพร่เมื่อปิดกิจกรรม รวมถึงกรณีไม่มีคะแนน':'แบบอัตโนมัติจะเผยแพร่หลัง workflow เฉพาะประเภทและการรับรองครบเท่านั้น'}</small></label></div><p class="svw-inline-note">ค่านี้ใช้กับ Frozen/Certified/Published Snapshot และรายงานผลอย่างเป็นทางการเท่านั้น โดยไม่เปลี่ยนค่า Live Leaderboard</p></section>`;
}
const QUESTION_LABELS = { single_choice: 'เลือกหนึ่งตัวเลือก', multiple_choice: 'เลือกหลายตัวเลือก', yes_no_abstain: 'ใช่/ไม่ใช่/งดออกเสียง', rating: 'ให้คะแนน', likert: 'ระดับความคิดเห็น', ranking: 'จัดอันดับ', matrix: 'ตารางคำตอบรายแถว', allocation: 'แบ่งคะแนน', token: 'จัดสรรโทเคน', short_text: 'ข้อความสั้น', long_text: 'ข้อความยาว', date_time: 'วันและเวลา', employee_picker: 'เลือกพนักงาน', organization_picker: 'เลือกหน่วยงาน', file_upload: 'แนบไฟล์คำตอบ' };
const PRIVACY_OPTIONS = [
    ['identified', 'ระบุตัวตน', 'เก็บความสัมพันธ์ระหว่างบัญชีผู้ใช้กับคำตอบ เพื่อรองรับงานที่ต้องติดตามรายบุคคล'],
    ['confidential', 'ข้อมูลลับ', 'ยังเชื่อมตัวตนกับคำตอบ แต่จำกัดการใช้งานข้อมูลรายบุคคลไว้ในพื้นที่ผู้ดูแลที่ได้รับสิทธิ์'],
    ['anonymous', 'ไม่ระบุตัวตน', 'ไม่สร้างข้อมูลเชื่อมบัตรคำตอบกลับไปยังพนักงาน ผู้ดูแลดูได้เฉพาะผลรวมและสถานะการเข้าร่วม'],
    ['secret_ballot', 'บัตรลงคะแนนลับ', 'แยกตัวตนออกจากบัตรโดยถาวร ผู้ดูแลดูผลรวมได้หลังปิดและผ่านกระบวนการรับรอง']
];
const PRIVACY_DETAILS = {
    identified: ['ระบบเก็บความสัมพันธ์ระหว่างผู้ตอบกับคำตอบ', 'ผู้เข้าร่วมเห็นคำตอบของตนเองหลังส่งตามนโยบายแคมเปญ', 'Admin ดูพื้นที่จัดการและผลรวมได้เสมอ ส่วนข้อมูลรายบุคคลต้องใช้สิทธิ์งานที่เกี่ยวข้อง'],
    confidential: ['ระบบยังเก็บความสัมพันธ์ระหว่างผู้ตอบกับคำตอบ', 'ผู้ใช้ทั่วไปไม่เห็นข้อมูลของผู้อื่น และการส่งออกต้องผ่านสิทธิ์เฉพาะ', 'Admin ดูพื้นที่จัดการและผลรวมได้ แต่ข้อมูลรายบุคคลยังเป็นข้อมูลจำกัดและมี Audit'],
    anonymous: ['บัตรคำตอบไม่มีข้อมูลเชื่อมกลับไปยังพนักงาน แม้เป็น Admin ก็ไม่สามารถค้นว่าใครตอบอะไร', 'ระบบเก็บสถานะการเข้าร่วมแยกต่างหากเพื่อควบคุมจำนวนครั้ง โดยไม่เชื่อมกับบัตรคำตอบ', 'Admin ดูสถานะรวม ผลรวม และรายงานที่ผ่าน Threshold ได้'],
    secret_ballot: ['บัตรลงคะแนนไม่เก็บตัวตนและใบรับไม่แสดงตัวเลือก แม้เป็น Admin ก็ไม่สามารถเชื่อมผู้ใช้กับตัวเลือก', 'สถานะการเข้าร่วมถูกเก็บแยกจากบัตรลงคะแนน', 'Admin ดูแลแคมเปญและประมวลผลรวมได้หลังปิด โดยต้องผ่าน Recount, Freeze และ Certification ก่อนเผยแพร่']
};
const RESULT_OPTIONS = [
    ['hidden_until_close', 'ผู้เข้าร่วมเห็นหลังปิดกิจกรรม'], ['admin_only', 'ซ่อนจากผู้เข้าร่วม · Admin เท่านั้น'],
    ['live', 'ผู้เข้าร่วมเห็นระหว่างกิจกรรม'], ['certified_only', 'ผู้เข้าร่วมเห็นหลังรับรองผล'], ['published', 'เผยแพร่ให้ผู้เข้าร่วมแล้ว']
];

function localInputDate(value) {
    return value ? toBangkokInputValue(value) : '';
}

function inputField(name, label, value = '', type = 'text', options = '') {
    return `<label class="svw-field"><span>${escHtml(label)}</span><input id="svw-${name}" data-svw-field="${name}" type="${type}" value="${escHtml(value ?? '')}" ${options}></label>`;
}

function dateTime24Field(name, label, value) {
    const parts = splitBangkokInput(value);
    const [selectedHour = '00', selectedMinute = '00'] = parts.time.split(':');
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));
    return `<fieldset class="svw-field svw-field--datetime"><legend>${escHtml(label)} (เวลาไทย UTC+7)</legend><input type="date" lang="th-TH" data-svw-date-part="${name}" value="${parts.date}" required><span class="sv-time24"><select data-svw-hour-part="${name}" aria-label="ชั่วโมง" required>${hours.map(hour => `<option value="${hour}" ${hour === selectedHour ? 'selected' : ''}>${hour}</option>`).join('')}</select><b aria-hidden="true">:</b><select data-svw-minute-part="${name}" aria-label="นาที" required>${minutes.map(minute => `<option value="${minute}" ${minute === selectedMinute ? 'selected' : ''}>${minute}</option>`).join('')}</select><small>น. (24 ชั่วโมง)</small></span></fieldset>`;
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
    const secret = draft.privacyMode === 'secret_ballot';
    return `<section class="svw-privacy-scope" role="note"><strong>Privacy ใช้กำหนดการเก็บและเชื่อมโยงคำตอบของผู้เข้าร่วม</strong><span>ไม่ใช่การปิดสิทธิ์ Admin: บัญชี Role Admin ยังดูแลแคมเปญ สถานะรวม ผลรวม และรายงานได้ทุกโหมด แต่โหมด Anonymous/Secret จะไม่มีข้อมูลให้เชื่อมว่าใครตอบอะไร</span></section><fieldset class="svw-choice-fieldset"><legend>เลือกรูปแบบความเป็นส่วนตัวของคำตอบ</legend><div class="svw-choice-grid">${PRIVACY_OPTIONS.map(([key, label, description]) => `<label class="svw-choice ${draft.privacyMode === key ? 'is-selected' : ''}"><input type="radio" name="svw-privacy" value="${key}" data-svw-field="privacyMode" ${draft.privacyMode === key ? 'checked' : ''}><strong>${label}</strong><span>${description}</span></label>`).join('')}</div></fieldset><section class="svw-form-grid"><label class="svw-field"><span>จำนวนครั้งที่ผู้ใช้ส่งได้</span><input type="number" min="1" max="10" data-svw-field="maxParticipationAttempts" value="${secret ? 1 : Number(draft.maxParticipationAttempts || 1)}" ${secret ? 'disabled' : ''}><small>${secret ? 'บัตรลงคะแนนลับจำกัด 1 ครั้งเพื่อคงหลักการแยกตัวตนออกจากบัตร' : 'กำหนดได้ 1–10 ครั้ง แต่ละครั้งเป็นรายการถาวรและนับคะแนนแยกกัน'}</small></label></section><section class="svw-privacy-notice" role="note" aria-live="polite"><strong>${selected[1]}: ระบบเก็บและแสดงข้อมูลอย่างไร</strong><ul>${PRIVACY_DETAILS[draft.privacyMode].map(item => `<li>${escHtml(item)}</li>`).join('')}</ul><div class="svw-permission-matrix"><div><strong>Role Admin</strong><span>เข้าพื้นที่จัดการและดูผลรวมได้ทุก Privacy โดยไม่ขึ้นกับการแสดงผลสำหรับผู้เข้าร่วม</span></div><div><strong>ผู้ดูแลที่ได้รับมอบหมาย</strong><span>ต้องมี Permission ตามงาน เช่น Result View, Export, Certify หรือ Audit View</span></div><div><strong>ข้อมูลรายบุคคล</strong><span>มีได้เฉพาะ Identified/Confidential; Anonymous/Secret ไม่สามารถใช้สิทธิ์ใดข้ามข้อจำกัดนี้ได้</span></div></div><p class="svw-privacy-warning"><strong>ข้อควรทราบ:</strong> หลังตรึงรายชื่อหรือเปิดรับคำตอบแล้ว ไม่ควรเปลี่ยนระดับความเป็นส่วนตัวหรือความหมายของคำถาม จำนวนขั้นต่ำก่อนแสดงสถิติช่วยลดการคาดเดาตัวบุคคล</p></section>`;
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

function workMediaEditor(work, index) {
    const items = Array.isArray(work.gallery) ? work.gallery : [];
    const cover = items.find(item => item.isCover);
    const gallery = items.filter(item => !item.isCover);
    const group = `wizard-work-${Number(work.id || index + 1)}`;
    const previews = items.length ? `<div class="sv-work-gallery svw-work-media-grid" aria-label="รูปของผลงาน ${escHtml(work.title || work.workCode || index + 1)}">${items.map((item,itemIndex)=>`<figure class="sv-work-gallery__item ${item.isCover?'is-cover':''}"><button type="button" class="svp-gallery-trigger" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="${group}" data-sv-gallery-label="${escHtml(item.altText || work.title || work.workCode || 'ภาพผลงาน')}" aria-label="เปิด${item.isCover?'ภาพ Cover':`รูป Gallery ที่ ${itemIndex + (cover ? 0 : 1)}`} ของ ${escHtml(work.title || work.workCode || `ผลงาน ${index + 1}`)}"><img data-sv-auth-file="${Number(item.fileId)}" alt="${escHtml(item.altText || work.title || work.workCode || 'ภาพผลงาน')}" decoding="async"></button><figcaption>${item.isCover?'Cover':`Gallery ${gallery.indexOf(item)+1}`}${item.caption?` · ${escHtml(item.caption)}`:''}</figcaption></figure>`).join('')}</div>` : '<p class="svw-work-media-empty">ยังไม่มีรูปในผลงานนี้</p>';
    const saveHint = work.id
        ? 'รูปจะผูกกับผลงานนี้โดยตรงและเก็บเป็นไฟล์ส่วนตัว'
        : 'กรอกชื่อผลงานแล้วเลือกภาพได้ทันที ระบบจะบันทึกรายการผลงานก่อนอัปโหลดให้อัตโนมัติ';
    return `<section class="svw-inline-note svw-work-media-editor"><div><strong>รูปประจำผลงาน · Cover ${cover?'1':'0'}/1 · Gallery ${gallery.length} รูป</strong><p>${saveHint}</p><small>Gallery ตรงนี้เป็นชุดรูปของผลงานนี้ภายในแคมเปญ ไม่ใช่คลังรูปทั้งหมดของโมดูล Safety Vote</small></div>${previews}<div class="svw-inline-actions"><label class="sv-button sv-button--secondary"><span>${cover?'เปลี่ยน Cover':'เลือก Cover'}</span><input type="file" accept="image/jpeg,image/png,image/webp" data-svw-work-image="cover" data-work-index="${index}" hidden></label><label class="sv-button sv-button--secondary"><span>เพิ่มรูปเข้า Gallery</span><input type="file" accept="image/jpeg,image/png,image/webp" data-svw-work-image="gallery" data-work-index="${index}" ${items.length>=12?'disabled':''} hidden></label></div><small>เลือกจากคลังภาพหรือไฟล์ในอุปกรณ์ได้ · JPG, PNG หรือ WebP ไม่เกิน 10 MB · รวมสูงสุด 12 รูปต่อผลงาน</small></section>`;
}

function stepContent(draft) {
    if (draft.campaignType === 'jury_scoring') {
        const sources = [
            ['admin_curated','แอดมินจัดเตรียมผลงาน'],
            ['employee_submission','พนักงานส่งผลงาน'],
            ['imported','นำเข้าจากแคมเปญอื่น']
        ];
        const cards = (draft.works || []).map((work,index) => `<fieldset class="svw-question svw-work-item"><legend>ผลงาน ${index+1}</legend><div class="svw-question__heading"><strong>${escHtml(work.workCode || `WORK-${index+1}`)}</strong><div class="svw-question-actions"><button type="button" class="sv-icon-button" data-svw-move-work="up" data-index="${index}" ${index===0?'disabled':''} aria-label="เลื่อนผลงานขึ้น">↑</button><button type="button" class="sv-icon-button" data-svw-move-work="down" data-index="${index}" ${index===(draft.works||[]).length-1?'disabled':''} aria-label="เลื่อนผลงานลง">↓</button><button type="button" class="sv-button sv-button--secondary" data-svw-remove-work="${index}" ${(draft.works||[]).length===1?'disabled':''}>ลบผลงาน</button></div></div><div class="svw-form-grid"><label class="svw-field"><span>รหัสผลงาน</span><input maxlength="50" data-svw-work-field="workCode" data-index="${index}" value="${escHtml(work.workCode||'')}"></label><label class="svw-field"><span>ชื่อผลงาน</span><input maxlength="255" data-svw-work-field="title" data-index="${index}" value="${escHtml(work.title||'')}"></label>${draft.workSource==='imported'?`<label class="svw-field"><span>Candidate ID ต้นทาง</span><input type="number" min="1" data-svw-work-field="sourceCandidateId" data-index="${index}" value="${Number(work.sourceCandidateId||0)||''}"></label>`:''}</div><label class="svw-field"><span>รายละเอียดผลงาน</span><textarea rows="3" maxlength="2000" data-svw-work-field="description" data-index="${index}">${escHtml(work.description||'')}</textarea></label>${workMediaEditor(work,index)}</fieldset>`).join('');
        return `<section class="svw-privacy-scope" role="note"><strong>ผลงาน ไม่ใช่คำถามให้คะแนน</strong><span>ขั้นนี้เก็บเฉพาะรายการผลงานและรูป ส่วนเกณฑ์คะแนนหลายข้อกำหนดในขั้น “เกณฑ์ตัดสินและรายชื่อกรรมการ”</span></section><fieldset class="svw-choice-fieldset"><legend>แหล่งผลงาน</legend><div class="svw-choice-grid">${sources.map(([value,label])=>`<label class="svw-choice ${draft.workSource===value?'is-selected':''}"><input type="radio" name="svw-work-source" value="${value}" data-svw-field="workSource" ${draft.workSource===value?'checked':''}><strong>${label}</strong></label>`).join('')}</div></fieldset><div class="svw-section-heading"><div><p class="sv-eyebrow">${escHtml(TYPE_LABELS[draft.campaignType])}</p><h3>ผลงานที่เข้าประกวด</h3></div>${draft.workSource==='admin_curated'?'<button type="button" class="sv-button sv-button--secondary" data-svw-action="add-work">เพิ่มผลงาน</button>':''}</div><div class="svw-question-list">${cards||'<p class="svw-inline-note">ระบบจะสร้าง Work Item จากแหล่งที่เลือกเมื่อบันทึกขั้นนี้</p>'}</div>`;
    }
    const label = draft.campaignType === 'submission_challenge' ? 'ข้อกำหนดผลงาน' : draft.campaignType === 'nomination' ? 'ข้อมูลการเสนอชื่อ' : draft.campaignType === 'jury_scoring' ? 'รายการสำหรับการประเมิน' : 'คำถามและตัวเลือก';
    return `<div class="svw-section-heading"><div><p class="sv-eyebrow">${escHtml(TYPE_LABELS[draft.campaignType])}</p><h3>${label}</h3></div><button type="button" class="sv-button sv-button--secondary" data-svw-action="add-question">เพิ่มข้อ</button></div><div class="svw-question-list">${draft.questions.map((question, index) => questionCard(question, index, draft)).join('')}</div>`;
}

function ruleCard(rule, index) {
    return `<div class="svw-rule"><label><span>ผลของกฎ</span><select data-svw-rule-field="effect" data-index="${index}"><option value="include" ${rule.effect === 'include' ? 'selected' : ''}>รวม</option><option value="exclude" ${rule.effect === 'exclude' ? 'selected' : ''}>ยกเว้น</option></select></label><label><span>ข้อมูลอ้างอิง</span><select data-svw-rule-field="attributeKey" data-index="${index}">${[['all','พนักงานทั้งหมด'],['department_id','แผนก'],['safety_unit_id','หน่วยงานความปลอดภัย'],['position_id','ตำแหน่ง'],['role','บทบาท'],['team','ทีม']].map(([key,label])=>`<option value="${key}" ${rule.attributeKey===key?'selected':''}>${label}</option>`).join('')}</select></label><label><span>ค่า — คั่นด้วยเครื่องหมายจุลภาค</span><input data-svw-rule-field="values" data-index="${index}" value="${escHtml((rule.values||[]).join(', '))}" ${rule.attributeKey === 'all' ? 'disabled' : ''}></label><button type="button" class="sv-icon-button" data-svw-remove-rule="${index}" aria-label="ลบกฎที่ ${index + 1}" ${index === 0 && rule.attributeKey === 'all' ? 'disabled' : ''}>×</button></div>`;
}

function stepEligibility(draft) {
    const profile = workflowProfileFor(draft);
    if (!profile.eligibilityRequired) {
        const sourceLabel = profile.workSource === 'imported' ? 'นำเข้าจากแคมเปญอื่น' : 'แอดมินจัดเตรียมผลงาน';
        return `<section class="svw-privacy-scope" role="note" data-svw-eligibility-skipped><strong>ไม่ต้องตรึงรายชื่อผู้เข้าร่วมสำหรับแคมเปญนี้</strong><span>แหล่งผลงาน: ${escHtml(sourceLabel)} — ผู้ใช้ที่เข้าสู่ระบบทุกคนดูแคมเปญและ Public Work Gallery ได้แบบ Read-only แต่เฉพาะกรรมการที่ได้รับมอบหมายเท่านั้นที่เปิด Score Sheet และให้คะแนนได้</span><span>ขั้นตอนนี้ผ่านอัตโนมัติตาม Workflow Profile และไม่ได้ให้สิทธิ์เข้าร่วมจากการมองเห็นแคมเปญ</span></section>`;
    }
    const preview = draft.eligibilityPreview;
    return `<div class="svw-section-heading"><div><h3>กำหนดผู้มีสิทธิ์</h3><p>กฎทุกข้อใช้ตัวตรวจสอบและ Master Data เดิมของระบบ</p></div><button type="button" class="sv-button sv-button--secondary" data-svw-action="add-rule">เพิ่มกฎ</button></div><div class="svw-rule-list">${draft.rules.map(ruleCard).join('')}</div><div class="svw-eligibility-result" aria-live="polite">${preview ? `<div><strong>${Number(preview.eligibleCount).toLocaleString('th-TH')}</strong><span>ผู้มีสิทธิ์จากการตรวจสอบล่าสุด</span></div><div><strong>${Number(preview.accountReadyCount || 0).toLocaleString('th-TH')}</strong><span>บัญชีพร้อมใช้งานแล้ว</span></div><div><strong>${Number(preview.warningCount || 0).toLocaleString('th-TH')}</strong><span>ข้อมูลที่ควรติดตาม</span></div>` : '<p>ยังไม่ได้ตรวจสอบรายชื่อผู้มีสิทธิ์</p>'}</div>${preview ? '<p class="svw-privacy-scope" role="note">สถานะบัญชีและข้อมูลที่ควรติดตามเป็นข้อมูลประกอบเท่านั้น ไม่ขัดขวางการเปิดแคมเปญ ผู้มีสิทธิ์ที่ยังไม่เคยเข้าใช้งานสามารถลงชื่อเข้าใช้และดำเนินการตั้งค่าบัญชีภายหลังได้</p>' : ''}<div class="svw-inline-actions"><button type="button" class="sv-button sv-button--secondary" data-svw-action="preview-eligibility">ตรวจสอบรายชื่อ</button><button type="button" class="sv-button sv-button--primary" data-svw-action="freeze-eligibility" ${!Number(preview?.eligibleCount) || draft.eligibilityFrozen ? 'disabled' : ''}>${draft.eligibilityFrozen ? 'ตรึงรายชื่อแล้ว' : 'ยืนยันและตรึงรายชื่อ'}</button></div>`;
}

function stepSchedule(draft) {
    return `<div class="svw-form-grid">${dateTime24Field('openAt', 'เปิดกิจกรรม', draft.openAt)}${dateTime24Field('closeAt', 'ปิดกิจกรรม', draft.closeAt)}</div><div class="svw-inline-note" role="note"><strong>เวลาไทย (UTC+7) · รูปแบบ 24 ชั่วโมง</strong><p>ตัวอย่าง 17:30 คือห้าโมงครึ่งเย็น ระบบจะไม่ใช้ AM/PM และจะไม่เปลี่ยนสถานะหากข้อมูลไม่ครบหรือไม่ถูกต้อง</p></div>`;
}

function liveLeaderboardTopNMarkup(draft) {
    const current = liveLeaderboardTopNValid(draft.liveLeaderboardTopN) ? Number(draft.liveLeaderboardTopN) : 5;
    const preset = LIVE_LEADERBOARD_TOP_N_PRESETS.includes(current) ? String(current) : 'custom';
    const presetOptions = LIVE_LEADERBOARD_TOP_N_PRESETS.map(topN => `<option value="${topN}" ${preset===String(topN)?'selected':''}>Top ${topN}</option>`).join('');
    const official = officialResultTopNValid(draft.officialResultTopN) ? Number(draft.officialResultTopN) : 5;
    return `<label class="svw-field"><span>ตัวเลือกด่วน</span><select data-svw-live-topn-preset>${presetOptions}<option value="custom" ${preset==='custom'?'selected':''}>กำหนดจำนวนเอง</option></select><small>เลือกค่าที่ใช้บ่อย หรือกำหนดจำนวนอันดับผลสดเอง</small></label><label class="svw-field"><span>จำนวนอันดับผลสด</span><input type="number" inputmode="numeric" min="${LIVE_LEADERBOARD_TOP_N_MIN}" max="${LIVE_LEADERBOARD_TOP_N_MAX}" step="1" data-svw-field="liveLeaderboardTopN" value="${current}"><small>กำหนดได้ ${LIVE_LEADERBOARD_TOP_N_MIN}–${LIVE_LEADERBOARD_TOP_N_MAX} อันดับ · คะแนนเสมอที่ขอบอันดับจะแสดงครบ</small></label><div class="svw-field"><span>ใช้ค่าจากผลอย่างเป็นทางการ</span><button type="button" class="sv-button sv-button--secondary" data-svw-copy-official-topn>คัดลอก Top ${official}</button><small>คัดลอกครั้งเดียวเท่านั้น หลังจากนั้นทั้งสองค่ายังแก้แยกกันได้</small></div>`;
}

function stepResults(draft) {
    const disabled = draft.campaignType !== 'popular_vote' || draft.privacyMode === 'secret_ballot';
    return `<section class="svw-privacy-scope" role="note"><strong>การตั้งค่านี้ควบคุมสิ่งที่ผู้เข้าร่วมเห็น</strong><span>ไม่ปิดการเข้าถึงของ Role Admin หรือผู้ดูแลที่มี Permission ที่เกี่ยวข้อง และไม่เปลี่ยนกติกาการเก็บตัวตนของ Privacy ที่เลือกไว้</span></section><fieldset class="svw-choice-fieldset"><legend>การแสดงผลและประกาศผลสำหรับผู้เข้าร่วม</legend><div class="svw-choice-grid">${RESULT_OPTIONS.map(([key,label])=>`<label class="svw-choice ${draft.resultVisibility===key?'is-selected':''}"><input type="radio" name="svw-results" value="${key}" data-svw-field="resultVisibility" ${draft.resultVisibility===key?'checked':''} ${draft.privacyMode==='secret_ballot'&&key==='live'?'disabled':''}><strong>${label}</strong><span>${key==='live'?'ผู้เข้าร่วมเห็นผลรวมระหว่างกิจกรรม':'ควบคุมการเผยแพร่ให้ผู้เข้าร่วมตามสถานะ'}</span></label>`).join('')}</div></fieldset><div class="svw-form-grid">${inputField('privacyThreshold','จำนวนขั้นต่ำก่อนแสดงสถิติ',draft.privacyThreshold,'number','min="2" max="100"')}<label class="svw-field"><span>การค้นพบแคมเปญ</span><select data-svw-field="discoveryMode"><option value="eligible_only" ${draft.discoveryMode==='eligible_only'?'selected':''}>แสดงเฉพาะผู้มีสิทธิ์</option><option value="public_listing" ${draft.discoveryMode==='public_listing'?'selected':''}>แสดงในรายการสาธารณะตามสิทธิ์</option></select></label></div><section class="svw-live-config" aria-labelledby="svw-live-title"><div class="svw-section-heading"><div><p class="sv-eyebrow">Near real-time</p><h3 id="svw-live-title">Live Leaderboard</h3></div><label class="svw-live-toggle"><input type="checkbox" data-svw-field="liveLeaderboardEnabled" ${draft.liveLeaderboardEnabled?'checked':''} ${disabled?'disabled':''}><span>แสดงอันดับระหว่างกิจกรรม</span></label></div>${disabled?'<div class="svw-inline-note" role="status"><strong>รูปแบบนี้ไม่รองรับ</strong><p>รองรับเฉพาะ Popular Vote ที่ไม่ใช่บัตรลับ และคำถามแบบตัวเลือกที่เลือกได้สูงสุด 1 รายการ</p></div>':`<div class="svw-form-grid">${liveLeaderboardTopNMarkup(draft)}<label class="svw-field"><span>รูปแบบคะแนน</span><select data-svw-field="liveLeaderboardScoreMode"><option value="count" ${draft.liveLeaderboardScoreMode==='count'?'selected':''}>จำนวนโหวต</option><option value="percentage" ${draft.liveLeaderboardScoreMode==='percentage'?'selected':''}>เปอร์เซ็นต์</option><option value="count_percentage" ${draft.liveLeaderboardScoreMode==='count_percentage'?'selected':''}>จำนวนโหวตและเปอร์เซ็นต์</option></select></label><label class="svw-field"><span>ผู้เข้าร่วมเห็นผลเมื่อใด</span><select data-svw-field="liveLeaderboardVisibility"><option value="after_submit" ${draft.liveLeaderboardVisibility==='after_submit'?'selected':''}>หลังจากส่งคะแนนแล้ว (แนะนำ)</option><option value="always" ${draft.liveLeaderboardVisibility==='always'?'selected':''}>ตลอดช่วงกิจกรรม</option><option value="admin_only" ${draft.liveLeaderboardVisibility==='admin_only'?'selected':''}>ซ่อนจากผู้เข้าร่วม · Admin เท่านั้น</option></select></label>${inputField('liveLeaderboardRefreshSeconds','อัปเดตทุก (วินาที)',draft.liveLeaderboardRefreshSeconds,'number','min="10" max="60"')}${inputField('liveLeaderboardPrivacyThreshold','จำนวนขั้นต่ำก่อนแสดงผลสด',Math.max(5,Number(draft.privacyThreshold||5),Number(draft.liveLeaderboardPrivacyThreshold||5)),'number',`min="${Math.max(5,Number(draft.privacyThreshold||5))}" max="100"`)}</div>`}<div class="svw-inline-note svw-inline-note--warning" role="note"><strong>ผลระหว่างกิจกรรมอาจมีผลต่อการตัดสินใจของผู้ลงคะแนน</strong><p>ผลนี้เป็นข้อมูลชั่วคราว ไม่ใช่ผลประกาศอย่างเป็นทางการ และจะไม่แทนที่ Calculate → Freeze → Certify → Publish</p></div></section>`;
}

function liveLeaderboardPreview(draft) {
    if (!draft.liveLeaderboardEnabled) return '';
    const count = liveLeaderboardTopNValid(draft.liveLeaderboardTopN) ? Number(draft.liveLeaderboardTopN) : 5, labels = (draft.questions[0]?.options || []).map(option => option.label).filter(Boolean);
    const rows = labels.slice(0, count);
    return `<section class="sv-live-board sv-live-board--preview" data-sv-preview-statistics="unavailable-in-draft" aria-label="โครงสร้าง Live Leaderboard"><div class="sv-live-board__heading"><div><span class="sv-eyebrow">Preview · ยังไม่มีสถิติจริงใน Draft</span><h3>ผลโหวตสด</h3></div><span>Top ${count}</span></div><p class="sv-live-board__notice">ตำแหน่งที่ผู้ใช้จะเห็น · ${draft.liveLeaderboardVisibility==='admin_only'?'Admin เท่านั้น':draft.liveLeaderboardVisibility==='always'?'เห็นตลอดกิจกรรม':'หลังส่งคะแนนแล้ว'}</p>${rows.length ? rows.map(label=>`<div class="sv-live-row"><strong>—</strong><span>${escHtml(label)}</span><span>${draft.liveLeaderboardScoreMode==='percentage'?'—%':`— โหวต${draft.liveLeaderboardScoreMode==='count_percentage'?' · —%':''}`}</span></div>`).join('') : '<p class="svp-note">ยังไม่มีรายการจริงสำหรับแสดงผล</p>'}<small>Preview แสดงเฉพาะการตั้งค่าและชื่อรายการจริง ระบบจะมีจำนวนและอันดับหลังรับข้อมูลจริงเท่านั้น</small></section>`;
}

function participantPreview(draft, previewUserView, previewSubmitted) {
    const liveEnabled = Boolean(draft.liveLeaderboardEnabled) && draft.liveLeaderboardVisibility !== 'admin_only';
    const liveAllowed = draft.liveLeaderboardVisibility === 'always' || previewSubmitted;
    const scenario = liveEnabled && draft.liveLeaderboardVisibility === 'after_submit'
        ? `<div class="svw-preview-tabs" role="group" aria-label="จำลองสถานะผู้เข้าร่วม"><button type="button" data-svw-preview-submitted="false" aria-selected="${!previewSubmitted}">ก่อนส่งคะแนน</button><button type="button" data-svw-preview-submitted="true" aria-selected="${previewSubmitted}">หลังส่งคะแนน</button></div>`
        : '';
    const preview = safetyVoteCampaignPreview({ campaign: draft, questions: draft.questions, works: draft.works, criteria: draft.juryCriteria, mode: 'user', userView: previewUserView, liveMarkup: liveLeaderboardPreview(draft), liveEnabled, liveAllowed, previewSubmitted });
    return `${scenario}${preview}`;
}

function stepJury(draft, persisted) {
    if (draft.campaignType !== 'jury_scoring') return `<section class="svw-inline-note" role="status"><strong>แคมเปญนี้ไม่ใช้คณะกรรมการตัดสิน</strong><p>ขั้นตอนนี้ผ่านอัตโนมัติ คุณสามารถดำเนินการกำหนดผู้มีสิทธิ์ต่อได้</p></section>`;
    const locked = persisted.campaignStatus && persisted.campaignStatus !== 'Draft';
    const criteria = draft.juryCriteria || [], total = criteria.reduce((sum, item) => sum + Number(item.weight || 0), 0);
    const active = (draft.juryAssignments || []).filter(item => !['Revoked','Recused'].includes(item.Status || item.status));
    const history = (draft.juryAssignments || []).filter(item => ['Revoked','Recused'].includes(item.Status || item.status));
    return `<div class="svw-jury-builder">
        <section class="svw-privacy-scope" role="note"><strong>${locked ? 'แคมเปญเปิดแล้ว: ยังเพิ่ม–ถอนกรรมการได้ โดยเกณฑ์ยังคงล็อก' : 'กำหนดเกณฑ์ให้ชัดเจนก่อนมอบหมายกรรมการ'}</strong><span>เพิ่มหรือถอนกรรมการได้ระหว่าง Draft, Scheduled และ Open ทุกครั้งบันทึก Audit · คะแนน Draft จะเก็บไว้เป็นหลักฐาน · งานที่ส่งแล้วถอนไม่ได้และต้องใช้ Reopen</span></section>
        <section class="svw-jury-section" aria-labelledby="svw-jury-criteria-title"><div class="svw-section-heading"><div><p class="sv-eyebrow">Scoring criteria</p><h3 id="svw-jury-criteria-title">เกณฑ์การให้คะแนน</h3></div><div class="svw-jury-weight ${Math.abs(total-100)<=0.01?'is-valid':'is-invalid'}">รวมน้ำหนัก ${total.toLocaleString('th-TH')}%</div></div>
        <div class="svw-jury-criteria">${criteria.map((item,index)=>`<article class="svw-jury-criterion"><div class="svw-jury-criterion__head"><strong>เกณฑ์ ${index+1}</strong><div><button type="button" class="sv-icon-button" data-svw-move-criterion="up" data-index="${index}" ${locked||index===0?'disabled':''} aria-label="เลื่อนเกณฑ์ขึ้น">↑</button><button type="button" class="sv-icon-button" data-svw-move-criterion="down" data-index="${index}" ${locked||index===criteria.length-1?'disabled':''} aria-label="เลื่อนเกณฑ์ลง">↓</button><button type="button" class="sv-icon-button sv-icon-button--danger" data-svw-remove-criterion="${index}" ${locked||criteria.length<=1?'disabled':''} aria-label="ลบเกณฑ์">×</button></div></div><div class="svw-form-grid"><label class="svw-field"><span>ชื่อเกณฑ์</span><input data-svw-criterion-field="title" data-index="${index}" maxlength="200" value="${escHtml(item.title||item.Title||'')}" ${locked?'readonly':''}></label><label class="svw-field"><span>คะแนนต่ำสุด</span><input type="number" data-svw-criterion-field="minScore" data-index="${index}" value="${Number(item.minScore??item.MinScore??1)}" ${locked?'readonly':''}></label><label class="svw-field"><span>คะแนนสูงสุด</span><input type="number" data-svw-criterion-field="maxScore" data-index="${index}" value="${Number(item.maxScore??item.MaxScore??5)}" ${locked?'readonly':''}></label><label class="svw-field"><span>น้ำหนัก (%)</span><input type="number" min="0.01" max="100" step="0.01" data-svw-criterion-field="weight" data-index="${index}" value="${Number(item.weight??item.Weight??0)}" ${locked?'readonly':''}></label></div><label class="svw-field"><span>คำอธิบาย (ถ้ามี)</span><textarea rows="2" maxlength="1000" data-svw-criterion-field="description" data-index="${index}" ${locked?'readonly':''}>${escHtml(item.description||item.Description||'')}</textarea></label></article>`).join('')}</div>
        ${locked?'':`<button type="button" class="sv-button sv-button--secondary" data-svw-action="add-criterion" ${criteria.length>=50?'disabled':''}>เพิ่มเกณฑ์</button>`}
        <div class="svw-form-grid"><label class="svw-field"><span>จำนวนกรรมการขั้นต่ำ</span><input type="number" min="1" max="100" data-svw-jury-field="minJurors" value="${Number(draft.juryScoring?.minJurors||1)}" ${locked?'readonly':''}></label><label class="svw-choice"><input type="checkbox" data-svw-jury-field="juryBlind" ${draft.juryBlind?'checked':''} ${locked||active.length?'disabled':''}><strong>Blind judging</strong><span>${active.length?'ล็อกหลังมอบหมายกรรมการคนแรก เพื่อไม่ให้บริบทการประเมินเปลี่ยน':'ซ่อนชื่อเจ้าของผลงานจากกรรมการในหน้าประเมิน'}</span></label></div></section>
        <section class="svw-jury-section" aria-labelledby="svw-jurors-title"><div class="svw-section-heading"><div><p class="sv-eyebrow">Employee master</p><h3 id="svw-jurors-title">มอบหมายกรรมการรายบุคคล</h3></div><span class="sv-status-badge">${active.length.toLocaleString('th-TH')} คน</span></div>
        ${safetyVotePeoplePickerMarkup({pickerId:'jury-assignment',key:'juryAssignment',label:'ค้นหาและเลือกกรรมการ',help:'ค้นหาจากชื่อ รหัสพนักงาน แผนก หน่วยงาน หรือตำแหน่ง',excludedIds:active.map(item=>item.JurorEmployeeID||item.jurorEmployeeId)})}
        <div class="svw-jury-assigned">${active.map(item=>{const submitted=(item.Status||item.status)==='Submitted',scoreCount=Number(item.ScoreCount??item.scoreCount??0);return `<article><span><strong>${escHtml(item.JurorName||item.jurorName||item.JurorEmployeeID||item.jurorEmployeeId)}</strong><small>${escHtml(item.JurorEmployeeID||item.jurorEmployeeId)}${item.JurorDepartment?` · ${escHtml(item.JurorDepartment)}`:''}${scoreCount&&!submitted?` · มีคะแนน Draft ${scoreCount.toLocaleString('th-TH')} ช่อง (เก็บไว้เมื่อถอน)`:''}</small></span><span class="sv-status-badge">${escHtml(item.Status||item.status||'Draft')}</span><button type="button" class="sv-button sv-button--secondary" data-svw-revoke-juror="${Number(item.id)}" ${submitted?'disabled title="ส่งคะแนนแล้ว กรุณาใช้ Reopen"':''}>${submitted?'ส่งแล้ว · ถอนไม่ได้':'ถอนสิทธิ์'}</button></article>`;}).join('')||'<p class="svw-empty-copy">ยังไม่ได้เลือกกรรมการ</p>'}</div>
        ${history.length?`<details><summary>ประวัติที่ถอนหรือปฏิเสธงาน (${history.length})</summary><ul>${history.map(item=>`<li>${escHtml(item.JurorName||item.JurorEmployeeID||'')} — ${escHtml(item.Status||item.status)}</li>`).join('')}</ul></details>`:''}</section>
    </div>`;
}

function stepReview(draft, persisted, previewMode, previewUserView, previewSubmitted) {
    const items = readinessItems(draft, persisted), ready = items.every(item => item.pass), advanced = templateFor(draft.campaignType).advancedRequired;
    const secondaryMode = draft.campaignType === 'jury_scoring' ? 'juror' : 'admin';
    const effectiveMode = previewMode === 'user' ? 'user' : secondaryMode;
    const preview = effectiveMode === 'user'
        ? participantPreview(draft, previewUserView, previewSubmitted)
        : safetyVoteCampaignPreview({ campaign: draft, questions: draft.questions, works: draft.works, criteria: draft.juryCriteria, mode: effectiveMode });
    return `<div class="svw-review-grid"><section class="svw-readiness" aria-labelledby="svw-readiness-title"><div class="svw-section-heading"><div><p class="sv-eyebrow">Readiness checklist</p><h3 id="svw-readiness-title">ความพร้อมก่อนเปิดใช้งาน</h3></div><span class="sv-status-badge ${ready?'sv-status-badge--open':'sv-status-badge--scheduled'}"><span class="sv-status-dot"></span>${ready?'พร้อมเปิด':'ยังไม่พร้อม'}</span></div><ul>${items.map(item=>`<li class="${item.pass?'is-pass':'is-block'}"><span aria-hidden="true">${item.pass?'✓':'!'}</span><span>${escHtml(item.label)}</span></li>`).join('')}</ul>${advanced?'<div class="svw-readiness__advanced" role="status"><strong>ต้องตั้งค่าตามประเภทแคมเปญต่อ</strong><p>ระบบจะพาไปยังพื้นที่จัดการเดิมสำหรับการเลือกตั้งลับ ผลงาน การเสนอชื่อ หรือกรรมการ โดยยังไม่เปิดแคมเปญอัตโนมัติ</p></div>':''}</section><section class="svw-preview-panel"><div class="svw-preview-tabs" role="tablist" aria-label="ตัวอย่างหน้าจอตามบทบาท"><button type="button" role="tab" data-svw-preview="user" aria-selected="${effectiveMode==='user'}">หน้าผู้ใช้จริง</button><button type="button" role="tab" data-svw-preview="${secondaryMode}" aria-selected="${effectiveMode===secondaryMode}">${secondaryMode==='juror'?'หน้ากรรมการจริง':'การตั้งค่า Admin'}</button></div>${preview}</section></div>`;
}

function stepMarkup(step, draft, persisted, previewMode, previewUserView, previewSubmitted) {
    return [stepType, stepDetails, stepPrivacy, stepContent, value=>stepJury(value,persisted), stepEligibility, stepSchedule, stepResults][step]?.(draft) || stepReview(draft, persisted, previewMode, previewUserView, previewSubmitted);
}

export function renderSafetyVoteCampaignWizard(container, { campaignId = null, initialTemplateKey = null, initialConfig = null, sourceLabel = '', onClose = () => {}, onComplete = () => {}, onOpenAdvanced = () => {}, onNavigate = null } = {}) {
    let recoveryKey = `safetyVoteAdminDraft:v1:${campaignId ? Number(campaignId) : 'new'}`;
    const state = { step: 0, maxStep: 0, draft: createWizardDraft(), persisted: { campaignId: null, versionId: null, rowVersion: null, campaignStatus: 'Draft', builderSaved: false, preservedMedia: [], serverUpdatedAt: null }, liveJuryMode: false, saveState: 'idle', saveMessage: 'ยังไม่ได้บันทึก', errors: [], previewMode: 'user', previewUserView: 'participation', previewSubmitted: false, dirty: false, timer: null, saveChain: Promise.resolve(), objectUrls: new Set(), hydratingFiles: new Set(), workMediaUploads: new Set(), recovery: null, peoplePickerCleanup: null };

    const clone = value => JSON.parse(JSON.stringify(value));
    const configDraft = config => {
        const version = config?.version || {}, type = version.campaignType || version.CampaignType || 'survey';
        const base = applyTemplate(createWizardDraft(), type);
        const rules = Array.isArray(config?.rules) ? config.rules.map((rule, index) => ({
            ruleGroup: Number(rule.ruleGroup || rule.RuleGroup || 1), ruleOrder: Number(rule.ruleOrder || rule.RuleOrder || index + 1),
            effect: rule.effect || rule.Effect || 'include', attributeKey: rule.attributeKey || rule.AttributeKey || 'all',
            operator: rule.operator || rule.Operator || 'EQUALS', values: clone(rule.values || []), reason: rule.reason || rule.Reason || ''
        })) : [];
        return {
            ...base,
            titleTh: version.titleTh || version.TitleTh ? `${version.titleTh || version.TitleTh} (สำเนา)` : '',
            titleEn: version.titleEn || version.TitleEn || '', summary: version.summary || version.Summary || '', description: version.description || version.Description || '',
            privacyMode: version.privacyMode || version.PrivacyMode || base.privacyMode,
            privacyThreshold: Number(version.privacyThreshold || version.PrivacyThreshold || base.privacyThreshold),
            maxParticipationAttempts: Number(version.maxParticipationAttempts || version.MaxParticipationAttempts || 1),
            discoveryMode: version.discoveryMode || version.DiscoveryMode || base.discoveryMode,
            resultVisibility: version.resultVisibility || version.ResultVisibility || base.resultVisibility,
            officialResultTopN: Number(version.officialResultTopN || version.OfficialResultTopN || base.officialResultTopN || 5),
            resultReleasePolicy: version.resultReleasePolicy || version.ResultReleasePolicy || base.resultReleasePolicy || 'automatic',
            liveLeaderboardEnabled: false,
            campaignCode: '', openAt: '', closeAt: '',
            questions: Array.isArray(config?.questions) && config.questions.length ? clone(config.questions) : base.questions,
            rules: rules.length ? rules : base.rules,
            eligibilityPreview: null, eligibilityFrozen: false
        };
    };

    const safeRecoveryDraft = () => JSON.parse(JSON.stringify(state.draft, (key, value) => ['previewUrl', 'imageUnavailable'].includes(key) ? undefined : value));
    const writeRecovery = () => {
        try { sessionStorage.setItem(recoveryKey, JSON.stringify({ savedAt: Date.now(), step: state.step, maxStep: state.maxStep, draft: safeRecoveryDraft() })); } catch (_) {}
    };
    const clearRecovery = () => { try { sessionStorage.removeItem(recoveryKey); } catch (_) {} state.recovery = null; };
    const readRecovery = () => {
        try {
            const record = JSON.parse(sessionStorage.getItem(recoveryKey) || 'null');
            if (!record?.draft || !Number.isFinite(Number(record.savedAt)) || Date.now() - Number(record.savedAt) > 24 * 60 * 60 * 1000) { clearRecovery(); return null; }
            return record;
        } catch (_) { clearRecovery(); return null; }
    };

    const hydrateDraft = async id => {
        container.innerHTML = '<div class="svw-shell" aria-busy="true" aria-live="polite"><div class="sv-state-panel"><h1>กำลังเปิดแคมเปญฉบับร่าง…</h1><p>ระบบกำลังโหลดข้อมูลล่าสุดก่อนอนุญาตให้แก้ไข</p></div></div>';
        try {
            const detail = await API.get(`/safety-vote/admin/campaigns/${Number(id)}`), row = detail.data?.campaign || {};
            const campaignStatus = String(row.Status || '');
            const liveJuryMode = ['Scheduled','Open'].includes(campaignStatus) && row.CampaignType === 'jury_scoring';
            if (campaignStatus !== 'Draft' && !liveJuryMode) throw new Error('แก้ไขได้เฉพาะแคมเปญฉบับร่าง หรือรายชื่อกรรมการของแคมเปญที่กำลังใช้งาน');
            const juryRequests = row.CampaignType === 'jury_scoring' ? [
                API.get(`/safety-vote/admin/campaigns/${Number(id)}/stages`),
                API.get(`/safety-vote/admin/campaigns/${Number(id)}/scoring`),
                API.get(`/safety-vote/admin/campaigns/${Number(id)}/jury/criteria`),
                API.get(`/safety-vote/admin/campaigns/${Number(id)}/jury/assignments`)
            ] : [];
            const [builder, media, ...juryData] = await Promise.all([
                row.CampaignType === 'jury_scoring' ? API.get(`/safety-vote/admin/campaigns/${Number(id)}/works`) : API.get(`/safety-vote/admin/campaigns/${Number(id)}/builder`),
                API.get(`/safety-vote/admin/campaigns/${Number(id)}/versions/${Number(row.CurrentVersionID)}/media`),
                ...juryRequests
            ]);
            const questions = row.CampaignType === 'jury_scoring' ? [] : (builder.data?.questions || []), works = row.CampaignType === 'jury_scoring' ? (builder.data?.rows || []) : [], mediaItems = media.data?.items || [], optionMediaKeys = new Set();
            for (const item of mediaItems) {
                if (item.scopeType !== 'option') continue;
                const question = questions.find(value => value.questionCode === item.questionCode), option = question?.options?.find(value => value.optionCode === item.optionCode);
                if (!option) continue;
                option.mediaType = item.mediaType || ''; option.mediaUrl = item.url || ''; option.mediaTitle = item.title || '';
                optionMediaKeys.add(`${item.scopeType}|${item.questionCode || ''}|${item.optionCode || ''}|${item.mediaType || ''}|${item.url || ''}`);
            }
            state.draft = {
                ...state.draft,
                campaignType: row.CampaignType || state.draft.campaignType,
                workSource: row.WorkSource || row.workSource || builder.data?.workSource || ((row.CampaignType || state.draft.campaignType) === 'jury_scoring' ? 'admin_curated' : null),
                campaignCode: row.CampaignCode || '',
                titleTh: row.TitleTh || '', titleEn: row.TitleEn || '',
                summary: row.Summary || '', description: row.Description || '',
                privacyMode: row.PrivacyMode || state.draft.privacyMode,
                privacyThreshold: Number(row.PrivacyThreshold || 5),
                maxParticipationAttempts: Number(row.MaxParticipationAttempts || 1),
                discoveryMode: row.DiscoveryMode || 'public_listing',
                openAt: localInputDate(row.OpenAt || row.ScheduledOpenAt),
                closeAt: localInputDate(row.CloseAt || row.ScheduledCloseAt),
                resultVisibility: row.ResultVisibility || 'hidden_until_close',
                officialResultTopN: Number(row.OfficialResultTopN || 5),
                resultReleasePolicy: row.ResultReleasePolicy || 'manual',
                liveLeaderboardEnabled: Boolean(Number(row.LiveLeaderboardEnabled || 0)),
                liveLeaderboardTopN: Number(row.LiveLeaderboardTopN || 5),
                liveLeaderboardScoreMode: row.LiveLeaderboardScoreMode || 'count_percentage',
                liveLeaderboardVisibility: row.LiveLeaderboardVisibility || 'after_submit',
                liveLeaderboardRefreshSeconds: Number(row.LiveLeaderboardRefreshSeconds || 15),
                liveLeaderboardPrivacyThreshold: Number(row.LiveLeaderboardPrivacyThreshold || row.PrivacyThreshold || 5),
                questions: questions.length ? questions : state.draft.questions,
                works: works.length ? works : (row.CampaignType === 'jury_scoring' && (row.WorkSource || builder.data?.workSource || 'admin_curated') === 'admin_curated' ? [defaultWork()] : []),
                rules: (detail.data?.eligibilityRules || []).map((rule, index) => ({
                    ruleGroup: Number(rule.RuleGroup || rule.ruleGroup || 1),
                    ruleOrder: Number(rule.RuleOrder || rule.ruleOrder || index + 1),
                    effect: rule.Effect || rule.effect || 'include',
                    attributeKey: rule.AttributeKey || rule.attributeKey || 'all',
                    operator: rule.Operator || rule.operator || 'EQUALS',
                    values: rule.values || [], reason: rule.Reason || rule.reason || ''
                })),
                juryStages: juryData[0]?.data?.rows || [],
                juryScoring: juryData[1]?.data?.config || state.draft.juryScoring,
                juryCriteria: (juryData[2]?.data?.rows || []).map((item,index)=>({criterionCode:item.CriterionCode||item.criterionCode||`CRITERION_${index+1}`,title:item.Title||item.title||'',description:item.Description||item.description||'',minScore:Number(item.MinScore??item.minScore??1),maxScore:Number(item.MaxScore??item.maxScore??5),weight:Number(item.Weight??item.weight??0)})),
                juryAssignments: juryData[3]?.data?.rows || [],
                juryBlind: Boolean(juryData[0]?.data?.rows?.[0]?.advanceRule?.blind ?? true),
                juryConfigured: row.CampaignType !== 'jury_scoring' || Boolean((juryData[2]?.data?.rows||[]).length && (juryData[3]?.data?.rows||[]).some(item=>!['Revoked','Recused'].includes(item.Status||item.status)))
            };
            if (row.CampaignType === 'jury_scoring' && !state.draft.juryCriteria.length) state.draft.juryCriteria = createWizardDraft().juryCriteria;
            if (!state.draft.rules.length) state.draft.rules = createWizardDraft().rules;
            state.persisted = { campaignId: Number(row.id), versionId: Number(row.CurrentVersionID), rowVersion: Number(row.RowVersion), campaignStatus, builderSaved: row.CampaignType === 'jury_scoring' ? (works.length > 0 || (builder.data?.workSource === 'employee_submission')) : questions.length > 0, preservedMedia: mediaItems.filter(item => !optionMediaKeys.has(`${item.scopeType}|${item.questionCode || ''}|${item.optionCode || ''}|${item.mediaType || ''}|${item.url || ''}`)), serverUpdatedAt: row.UpdatedAt || null };
            state.liveJuryMode = liveJuryMode;
            state.step = liveJuryMode ? 4 : state.step;
            state.maxStep = liveJuryMode ? 4 : WIZARD_STEPS.length - 1;
            state.saveState = 'saved'; state.saveMessage = liveJuryMode ? 'โหลดรายชื่อกรรมการล่าสุดแล้ว · เกณฑ์ถูกล็อก' : 'โหลดฉบับร่างล่าสุดแล้ว';
            const recovery = readRecovery(), serverTime = new Date(row.UpdatedAt || 0).getTime();
            state.recovery = recovery && Number(recovery.savedAt) > serverTime ? recovery : null;
            if (recovery && !state.recovery) clearRecovery();
            render();
        } catch (error) {
            container.innerHTML = `<div class="svw-shell"><section class="sv-state-panel sv-state-panel--error" role="alert"><h1>เปิดแคมเปญฉบับร่างไม่ได้</h1><p>${escHtml(error?.message || 'กรุณาลองใหม่')}</p><button type="button" class="sv-button sv-button--secondary" data-svw-load-close>กลับรายการแคมเปญ</button></section></div>`;
            container.querySelector('[data-svw-load-close]')?.addEventListener('click', onClose);
        }
    };

    const setSaveState = (kind, message) => {
        state.saveState = kind; state.saveMessage = message;
        const node = container.querySelector('[data-svw-save-status]');
        if (node) { node.dataset.state = kind; node.textContent = message; }
    };

    const readFields = () => {
        container.querySelectorAll('[data-svw-field]').forEach(input => { if (input.type === 'radio' && !input.checked) return; state.draft[input.dataset.svwField] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value; });
        container.querySelectorAll('[data-svw-date-part]').forEach(input => { const name = input.dataset.svwDatePart, hour = container.querySelector(`[data-svw-hour-part="${name}"]`)?.value, minute = container.querySelector(`[data-svw-minute-part="${name}"]`)?.value; state.draft[name] = joinBangkokInput(input.value, `${hour}:${minute}`); });
        container.querySelectorAll('[data-svw-question-field]').forEach(input => { const index = Number(input.dataset.index), question = state.draft.questions[index]; if (question) question[input.dataset.svwQuestionField] = input.value; });
        state.draft.questions.forEach((question,index)=>{
            const title=container.querySelector(`[data-svw-field="question-${index}-title"]`),help=container.querySelector(`[data-svw-field="question-${index}-help"]`);
            if(title)question.title=title.value;if(help)question.helpText=help.value;
        });
        container.querySelectorAll('[data-svw-option-field]').forEach(input=>{
            const question=state.draft.questions[Number(input.dataset.questionIndex)],option=question?.options?.[Number(input.dataset.optionIndex)];
            if(option)option[input.dataset.svwOptionField]=input.value;
        });
        container.querySelectorAll('[data-svw-work-field]').forEach(input=>{const work=state.draft.works[Number(input.dataset.index)];if(work)work[input.dataset.svwWorkField]=input.type==='number'?(Number(input.value)||null):input.value;});
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
        container.querySelectorAll('[data-svw-criterion-field]').forEach(input=>{const criterion=state.draft.juryCriteria[Number(input.dataset.index)];if(!criterion)return;criterion[input.dataset.svwCriterionField]=input.type==='number'?Number(input.value):input.value;});
        container.querySelectorAll('[data-svw-jury-field]').forEach(input=>{if(input.dataset.svwJuryField==='juryBlind')state.draft.juryBlind=input.checked;else state.draft.juryScoring[input.dataset.svwJuryField]=Number(input.value);});
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
            const previousRecoveryKey = recoveryKey;
            state.persisted.campaignId = Number(row.id);
            await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/official-result-topn`, { officialResultTopN: Number(state.draft.officialResultTopN || 5) });
            await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/result-release-policy`, { resultReleasePolicy: String(state.draft.resultReleasePolicy || 'automatic') });
            recoveryKey = `safetyVoteAdminDraft:v1:${state.persisted.campaignId}`;
            if (previousRecoveryKey !== recoveryKey) { try { sessionStorage.removeItem(previousRecoveryKey); } catch (_) {} }
            state.persisted.versionId = Number(row.CurrentVersionID || row.currentVersionId || state.persisted.versionId || 0);
            state.persisted.rowVersion = Number(row.RowVersion || row.rowVersion || 1);
            state.persisted.serverUpdatedAt = row.UpdatedAt || row.updatedAt || new Date().toISOString();
            state.draft.campaignCode = row.CampaignCode || row.campaignCode || state.draft.campaignCode;
            state.draft.discoveryMode = row.DiscoveryMode || row.discoveryMode || state.draft.discoveryMode;
            const codeField = container.querySelector('#svw-campaignCode');
            if (codeField && state.draft.campaignCode) codeField.value = state.draft.campaignCode;
            state.dirty = false;
            clearRecovery();
            setSaveState('saved', `บันทึกแล้ว ${formatThaiTime(new Date())}`);
            return true;
        } catch (error) {
            writeRecovery();
            setSaveState('error', 'บันทึกไม่สำเร็จ — ลองอีกครั้ง');
            throw error;
        }
    };

    const preserveOptionPreviews = questions => {
        const previews = new Map();
        const questionPreviews = new Map(state.draft.questions.map((question,index)=>[question.questionCode||`Q${index+1}`,{previewUrl:question.previewUrl,imageUnavailable:question.imageUnavailable}]));
        state.draft.questions.forEach((question,questionIndex) => (question.options || []).forEach((option,optionIndex) => {
            const key=`${question.questionCode||`Q${questionIndex+1}`}|${option.optionCode||`O${optionIndex+1}`}`;
            previews.set(key, { previewUrl: option.previewUrl, imageUnavailable: option.imageUnavailable, mediaType:option.mediaType||'', mediaUrl:option.mediaUrl||'', mediaTitle:option.mediaTitle||'' });
        }));
        return questions.map((question,questionIndex) => ({ ...question, ...(questionPreviews.get(question.questionCode||`Q${questionIndex+1}`)||{}), options: (question.options || []).map((option,optionIndex) => ({ ...option, ...(previews.get(`${question.questionCode||`Q${questionIndex+1}`}|${option.optionCode||`O${optionIndex+1}`}`) || {}) })) }));
    };

    const mediaPayload = () => [...(state.persisted.preservedMedia || []), ...state.draft.questions.flatMap((question,questionIndex)=>(question.options||[]).map((option,optionIndex)=>({
        mediaType:option.mediaType, scopeType:'option', questionCode:question.questionCode||`Q${questionIndex+1}`, optionCode:option.optionCode||`O${optionIndex+1}`, url:option.mediaUrl, title:option.mediaTitle
    })).filter(item=>item.mediaType&&item.url))];

    const saveBuilder = async () => {
        if (!contentValid(state.draft) || !await persistCampaign()) return false;
        setSaveState('saving', 'กำลังบันทึกเนื้อหา…');
        try {
            if (state.draft.campaignType === 'jury_scoring') {
                const response = await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/works`, { workSource: state.draft.workSource || 'admin_curated', works: (state.draft.works || []).map((work,index)=>({ id: work.id || null, workCode: work.workCode || `WORK-${index+1}`, title: work.title || '', description: work.description || '', sourceCandidateId: Number(work.sourceCandidateId||0)||null })) });
                state.draft.works = response.data?.rows || [];
                state.draft.workSource = response.data?.workSource || state.draft.workSource;
                state.persisted.builderSaved = Boolean(response.data?.serverConfirmed);
                state.dirty = false; clearRecovery(); setSaveState('saved', 'บันทึกผลงานแล้ว'); return true;
            }
            await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/builder`, { questions: builderPayload(state.draft) });
            await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/versions/${state.persisted.versionId}/media`, { items: mediaPayload() });
            const refreshed = await API.get(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/builder`);
            state.persisted.builderSaved = true;
            if (refreshed.data?.questions?.length) state.draft.questions = preserveOptionPreviews(refreshed.data.questions);
            state.dirty = false; clearRecovery(); setSaveState('saved', 'บันทึกเนื้อหาแล้ว'); return true;
        } catch (error) { state.persisted.builderSaved = false; writeRecovery(); setSaveState('error', 'บันทึกเนื้อหาไม่สำเร็จ — ลองอีกครั้ง'); throw error; }
    };

    const saveRules = async () => {
        if (!await persistCampaign()) return false;
        await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/eligibility/rules`, { rules: state.draft.rules.map((rule,index)=>({...rule,ruleGroup:1,ruleOrder:index+1,operator:rule.attributeKey==='all'?'EQUALS':'IN'})) });
        return true;
    };

    const ensureJuryStage = async () => {
        if (!await persistCampaign()) return null;
        let stage = (state.draft.juryStages || [])[0];
        if (stage?.id) return stage;
        const response = await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/stages`, { stages: [{ stageKey: 'JURY_FINAL', stageName: 'รอบตัดสินโดยคณะกรรมการ', stageType: 'jury', sequenceNo: 1, advanceRule: { blind: Boolean(state.draft.juryBlind) }, resultVisibility: 'admin_only', status: 'Draft' }] });
        state.draft.juryStages = response.data?.rows || [];
        return state.draft.juryStages[0] || null;
    };

    const saveJuryConfiguration = async () => {
        if (state.draft.campaignType !== 'jury_scoring') { state.draft.juryConfigured = true; return true; }
        if (state.liveJuryMode) return true;
        const errors = juryValidationErrors(state.draft), configurationErrors = errors.filter(error => !error.includes('กรรมการ')); if (configurationErrors.length) return false;
        setSaveState('saving','กำลังบันทึกเกณฑ์และกรรมการ…');
        const stage = await ensureJuryStage(); if (!stage?.id) throw new Error('สร้างรอบการตัดสินไม่สำเร็จ');
        await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/scoring`, { config: { ...state.draft.juryScoring, method: 'weighted_jury', tieBreak: state.draft.juryScoring?.tieBreak || 'candidate_id' } });
        await API.put(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/jury/criteria`, { stageId: Number(stage.id), criteria: state.draft.juryCriteria.map((item,index)=>({ ...item, criterionCode: item.criterionCode || `CRITERION_${index+1}`, sortOrder: index + 1 })) });
        state.draft.juryConfigured = !juryValidationErrors(state.draft).length; state.dirty = false; clearRecovery(); setSaveState('saved','บันทึกเกณฑ์และกรรมการแล้ว'); return true;
    };

    const persistForStep = async step => {
        if (step === 0) return true;
        if ([1,2,6,7].includes(step)) return persistCampaign();
        if (step === 3) return saveBuilder();
        if (step === 4) return saveJuryConfiguration();
        // Once the server has frozen the eligibility snapshot, moving forward must
        // not rewrite the rules behind that snapshot. Rule edits explicitly clear
        // the local frozen state and require a fresh preview/freeze cycle.
        if (step === 5) return !workflowProfileFor(state.draft).eligibilityRequired || state.draft.eligibilityFrozen ? true : saveRules();
        return true;
    };

    const enqueueSave = () => {
        clearTimeout(state.timer); state.dirty = true; setSaveState('dirty', 'ยังไม่ได้บันทึก');
        writeRecovery();
        if (![1,2,3,4,6,7].includes(state.step) || state.liveJuryMode) return;
        state.timer = setTimeout(() => { state.saveChain = state.saveChain.then(() => persistForStep(state.step)).catch(()=>{}); }, 800);
    };

    const revokePreview = option => {
        if (option?.previewUrl?.startsWith('blob:')) { URL.revokeObjectURL(option.previewUrl); state.objectUrls.delete(option.previewUrl); }
        if (option) delete option.previewUrl;
    };

    const loadPrivateImagePreview = async (target, fileId) => {
        const response = await API.get(`/safety-vote/files/${Number(fileId)}`, { suppressErrorLog: true });
        const blob = await response.blob();
        if (!blob.size || !String(blob.type || '').startsWith('image/')) throw new Error('ระบบบันทึกรูปแล้ว แต่ไม่สามารถอ่านไฟล์รูปที่บันทึกกลับมาได้');
        revokePreview(target);
        const url = URL.createObjectURL(blob);
        state.objectUrls.add(url);
        target.previewUrl = url;
        delete target.imageUnavailable;
    };

    const flushBuilderBeforeMediaMutation = async (questionIndex, optionIndex = null) => {
        readFields();
        const originalQuestion = state.draft.questions[questionIndex];
        const questionCode = originalQuestion?.questionCode || `Q${questionIndex + 1}`;
        const originalOption = optionIndex === null ? null : originalQuestion?.options?.[optionIndex];
        const optionCode = originalOption?.optionCode || (optionIndex === null ? null : `O${optionIndex + 1}`);
        const hadPendingDraft = state.dirty || !state.persisted.builderSaved;
        clearTimeout(state.timer);
        await state.saveChain;
        readFields();
        let question = state.draft.questions.find(item => item.questionCode === questionCode) || state.draft.questions[questionIndex];
        let target = optionIndex === null ? question : question?.options?.find(item => item.optionCode === optionCode) || question?.options?.[optionIndex];
        if (!target?.id) {
            const errors = contentValidationErrors(state.draft);
            if (errors.length) {
                state.errors = errors;
                render();
                container.querySelector('.svw-validation')?.focus();
                throw new Error(errors[0]);
            }
            if (!await saveBuilder()) throw new Error('ยังไม่สามารถบันทึกรายการเพื่อเพิ่มรูปได้');
            question = state.draft.questions.find(item => item.questionCode === questionCode) || state.draft.questions[questionIndex];
            target = optionIndex === null ? question : question?.options?.find(item => item.optionCode === optionCode) || question?.options?.[optionIndex];
        }
        return { target, hadPendingDraft };
    };

    const finishMediaMutation = (hadPendingDraft, savedMessage) => {
        if (hadPendingDraft) {
            state.dirty = true;
            state.persisted.builderSaved = false;
            writeRecovery();
            setSaveState('dirty', `${savedMessage} · ข้อมูลอื่นยังไม่ได้บันทึก`);
            if (contentValid(state.draft)) enqueueSave();
            return;
        }
        state.dirty = false;
        state.persisted.builderSaved = true;
        clearRecovery();
        setSaveState('saved', savedMessage);
    };

    const deleteOptionFile = async option => {
        if (!option?.fileId) return;
        if (!option?.id || !state.persisted.campaignId) throw new Error('บันทึกตัวเลือกก่อนลบรูป');
        const requestKey = `option-image-remove-${state.persisted.campaignId}-${option.id}-${Date.now()}`;
        const response = await API.delete(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/media/atomic`, { headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: JSON.stringify({ scopeType: 'option_image', scopeId: Number(option.id), reason: 'Removed from question option card builder' }) });
        if (!response.data?.serverConfirmed) throw new Error('Server did not confirm option image removal.');
        revokePreview(option); option.fileId = null; delete option.fileName; delete option.imageUnavailable;
        state.dirty = false; state.persisted.builderSaved = true; clearRecovery(); setSaveState('saved', 'ลบรูปตัวเลือกและบันทึกแล้ว');
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
        if ([3, 8].includes(state.step)) render();
    };

    const hydrateQuestionImages = async () => {
        const questions=state.draft.questions.filter(question=>question.imageFileId&&!question.previewUrl&&!question.imageUnavailable&&!state.hydratingFiles.has(Number(question.imageFileId)));
        if(!questions.length)return;
        await Promise.all(questions.map(async question=>{const fileId=Number(question.imageFileId);state.hydratingFiles.add(fileId);try{const response=await API.get(`/safety-vote/files/${fileId}`);const url=URL.createObjectURL(await response.blob());state.objectUrls.add(url);question.previewUrl=url;}catch(_){question.imageUnavailable=true;}finally{state.hydratingFiles.delete(fileId);}}));
        if([3,8].includes(state.step))render();
    };

    const renderQuestionImageEditors = () => {
        if(state.step!==3)return;
        container.querySelectorAll('.svw-question').forEach((fieldset,index)=>{const question=state.draft.questions[index];if(!question)return;const host=document.createElement('section');host.className='svw-question-media';host.innerHTML=`<div class="svw-question-media__preview">${question.previewUrl?`<button type="button" class="svp-gallery-trigger" data-sv-image-gallery data-sv-gallery-group="question-cover-${index}" data-sv-gallery-label="${escHtml(question.imageAltText||question.title||`ภาพประกอบข้อ ${index+1}`)}" aria-label="ขยายภาพประกอบข้อ ${index+1}"><img src="${escHtml(question.previewUrl)}" alt="${escHtml(question.imageAltText||'')}" decoding="async"></button>`:'<span>ยังไม่มีรูปประกอบคำถาม</span>'}</div><div class="svw-question-media__controls"><label class="sv-button sv-button--secondary"><span>${question.imageFileId?'เปลี่ยนรูป':'เพิ่มรูปประจำคำถาม'}</span><input type="file" accept="image/jpeg,image/png,image/webp" data-svw-question-image="${index}"></label>${question.imageFileId?`<label class="svw-field"><span>คำอธิบายภาพสำหรับผู้ใช้โปรแกรมอ่านหน้าจอ</span><input maxlength="300" value="${escHtml(question.imageAltText||'')}" data-svw-question-image-alt="${index}" required></label><button type="button" class="sv-button sv-button--secondary" data-svw-remove-question-image="${index}">ลบรูป</button>`:''}<small><strong>ขนาดแนะนำ 1600 × 900 พิกเซล (กว้าง × สูง, 16:9 แนวนอน)</strong><br>JPG, PNG หรือ WebP ไม่เกิน 10 MB · ระบบเก็บเป็นไฟล์ส่วนตัวและเปิดดูภาพใหญ่ได้</small></div>`;fieldset.querySelector('.svw-question-grid > div')?.prepend(host);});
    };

    const deleteQuestionFile = async question => {
        if(!question?.imageFileId)return;
        if(!question?.id||!state.persisted.campaignId)throw new Error('บันทึกคำถามก่อนลบรูป');
        const requestKey=`question-image-remove-${state.persisted.campaignId}-${question.id}-${Date.now()}`;
        const response=await API.delete(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/media/atomic`,{headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify({scopeType:'question_image',scopeId:Number(question.id),reason:'Removed from question image builder'})});
        if(!response.data?.serverConfirmed)throw new Error('Server did not confirm question image removal.');
        revokePreview(question);question.imageFileId=null;question.imageAltText='';delete question.fileName;delete question.imageUnavailable;
        state.dirty=false;state.persisted.builderSaved=true;clearRecovery();setSaveState('saved','ลบรูปคำถามและบันทึกแล้ว');
    };

    const uploadQuestionImage = async input => {
        const index=Number(input.dataset.svwQuestionImage),file=input.files?.[0];if(!file)return;
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){showToast('รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB','error');input.value='';return;}
        try{const prepared=await flushBuilderBeforeMediaMutation(index),question=prepared.target;if(!question?.id)throw new Error('ยังไม่สามารถระบุคำถามที่จะผูกรูปได้');const form=new FormData(),altText=String(question.imageAltText||question.title||`ภาพประกอบคำถามข้อ ${index+1}`).trim();form.append('file',file);form.append('scopeType','question_image');form.append('scopeId',String(question.id));form.append('altText',altText);const requestKey=`question-image-${state.persisted.campaignId}-${question.id}-${Date.now()}`;setSaveState('saving','กำลังอัปโหลดและบันทึกรูปคำถาม…');const response=await API.upload(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/media/atomic`,form,{headers:{'Idempotency-Key':requestKey}});if(!response.data?.serverConfirmed)throw new Error('Server did not confirm question image upload.');question.imageFileId=Number(response.data.fileId);question.imageAltText=altText;question.fileName=file.name;await loadPrivateImagePreview(question,question.imageFileId);finishMediaMutation(prepared.hadPendingDraft,'อัปโหลดรูปคำถามและบันทึกแล้ว');render();}catch(error){setSaveState('error','อัปโหลดรูปคำถามไม่สำเร็จ');showToast(error?.message||'อัปโหลดรูปคำถามไม่สำเร็จ','error');input.value='';}
    };

    const uploadOptionImage = async input => {
        readFields();const questionIndex=Number(input.dataset.questionIndex),optionIndex=Number(input.dataset.optionIndex),file=input.files?.[0];if(!file)return;
        if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){showToast('รองรับเฉพาะ JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB','error');input.value='';return;}
        try{const prepared=await flushBuilderBeforeMediaMutation(questionIndex,optionIndex),option=prepared.target;if(!option?.id)throw new Error('ยังไม่สามารถระบุตัวเลือกที่จะผูกรูปได้');const form=new FormData(),altText=String(option.label||`ภาพตัวเลือก ${optionIndex+1}`).trim();form.append('file',file);form.append('scopeType','option_image');form.append('scopeId',String(option.id));form.append('altText',altText);const requestKey=`option-image-${state.persisted.campaignId}-${option.id}-${Date.now()}`;setSaveState('saving','กำลังอัปโหลดและบันทึกรูปตัวเลือก…');const response=await API.upload(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/media/atomic`,form,{headers:{'Idempotency-Key':requestKey}});if(!response.data?.serverConfirmed)throw new Error('Server did not confirm option image upload.');option.fileId=Number(response.data.fileId);option.fileName=file.name;await loadPrivateImagePreview(option,option.fileId);finishMediaMutation(prepared.hadPendingDraft,'อัปโหลดรูปตัวเลือกและบันทึกแล้ว');render();}catch(error){setSaveState('error','อัปโหลดรูปตัวเลือกไม่สำเร็จ');showToast(error?.message||'อัปโหลดรูปตัวเลือกไม่สำเร็จ','error');input.value='';}
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

    const refreshJuryAssignments = async () => {
        const response=await API.get(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/jury/assignments`);
        state.draft.juryAssignments=response.data?.rows||[];
        state.draft.juryConfigured=Boolean(state.draft.juryCriteria?.length&&state.draft.juryAssignments.some(item=>!['Revoked','Recused'].includes(item.Status||item.status)));
    };

    const assignJuror = async employeeId => {
        try{clearTimeout(state.timer);readFields();const stage=await ensureJuryStage();if(!stage?.id)throw new Error('ยังไม่มีรอบการตัดสิน');setSaveState('saving','กำลังมอบหมายกรรมการ…');await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/jury/assignments`,{stageId:Number(stage.id),jurorEmployeeId:employeeId});await refreshJuryAssignments();if(!state.liveJuryMode)await saveJuryConfiguration();state.dirty=false;clearRecovery();setSaveState('saved','เพิ่มกรรมการและบันทึกเกณฑ์แล้ว');render();}
        catch(error){showToast(error?.message||'เพิ่มกรรมการไม่สำเร็จ','error');setSaveState('error','เพิ่มกรรมการไม่สำเร็จ');}
    };

    const revokeJuror = assignmentId => openSafetyVoteConfirmDialog({title:'ยืนยันการถอนกรรมการ',description:'ถอนสิทธิ์ได้หากงานยังไม่ถูกส่ง คะแนน Draft ที่มีอยู่จะยังคงเก็บเป็นหลักฐาน และทุกการถอนจะบันทึก Audit หากเพิ่มกรรมการคนเดิมกลับ ระบบจะคืนงาน Draft เดิมให้ทำต่อ',confirmLabel:'ถอนกรรมการ',tone:'danger',onConfirm:async()=>{await API.delete(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/jury/assignments/${assignmentId}`);await refreshJuryAssignments();state.dirty=false;clearRecovery();setSaveState('saved','ถอนกรรมการแล้ว · เก็บคะแนน Draft ไว้');render();}});

    const uploadWorkImage = async input => {
        const workIndex = Number(input.dataset.workIndex), file = input.files?.[0], scope = input.dataset.svwWorkImage === 'cover' ? 'work_cover' : 'work_gallery';
        if (!state.draft.works?.[workIndex] || !file || state.workMediaUploads.has(workIndex)) return;
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { input.value=''; return showToast('รองรับเฉพาะ JPG, PNG หรือ WebP ไม่เกิน 10 MB','error'); }
        state.workMediaUploads.add(workIndex);
        const card = input.closest('.svw-work-item');
        card?.setAttribute('aria-busy','true');
        card?.querySelectorAll('[data-svw-work-image]').forEach(control=>{control.disabled=true;});
        try {
            clearTimeout(state.timer);
            await state.saveChain;
            readFields();
            let current = state.draft.works?.[workIndex];
            const preservePendingDraft = Boolean(current?.id && (state.dirty || !state.persisted.builderSaved));
            if (!current?.id) {
                const validationErrors = contentValidationErrors(state.draft);
                if (validationErrors.length) throw new Error(`ยังบันทึกผลงานเพื่อเพิ่มรูปไม่ได้: ${validationErrors[0]}`);
                if (!await saveBuilder()) throw new Error('ยังบันทึกผลงานเพื่อเพิ่มรูปไม่ได้');
            }
            current = state.draft.works?.[workIndex];
            if (!current?.id) throw new Error('กรุณาบันทึกผลงานก่อนเพิ่มรูป');
            const form = new FormData();
            form.append('file', file); form.append('scopeType', scope); form.append('scopeId', String(current.id)); form.append('altText', current.title || current.workCode || 'ภาพผลงาน');
            const requestKey = `work-media-${state.persisted.campaignId}-${current.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            setSaveState('saving','กำลังอัปโหลดและผูกไฟล์กับผลงาน…');
            const response = await API.upload(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/media/atomic`, form, { headers: { 'Idempotency-Key': requestKey } });
            if (!response.data?.serverConfirmed) throw new Error('เซิร์ฟเวอร์ยังไม่ยืนยันการบันทึกไฟล์');
            const refreshed = await API.get(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/works`);
            const serverRows = refreshed.data?.rows || [];
            if (preservePendingDraft) {
                const serverById = new Map(serverRows.map(work=>[Number(work.id),work]));
                state.draft.works = state.draft.works.map(work=>serverById.has(Number(work.id))?{...work,gallery:serverById.get(Number(work.id)).gallery||[]}:work);
                state.dirty=true; state.persisted.builderSaved=false; writeRecovery(); setSaveState('dirty','บันทึกรูปแล้ว · ข้อมูลอื่นยังไม่ได้บันทึก');
            } else {
                state.draft.works = serverRows.length ? serverRows : state.draft.works; state.dirty=false; state.persisted.builderSaved=true; clearRecovery(); setSaveState('saved','อัปโหลดและบันทึกรูปแล้ว');
            }
            showToast(scope==='work_cover'?'บันทึก Cover แล้ว':'เพิ่มรูปใน Gallery แล้ว','success'); input.value=''; render();
        } catch (error) { setSaveState('error','อัปโหลดรูปไม่สำเร็จ — ไม่มีการผูกไฟล์ค้าง'); showToast(error?.message||'อัปโหลดรูปผลงานไม่สำเร็จ','error'); input.value=''; }
        finally { state.workMediaUploads.delete(workIndex); if(card?.isConnected){card.removeAttribute('aria-busy');card.querySelectorAll('[data-svw-work-image]').forEach(control=>{control.disabled=false;});} }
    };

    const removeWorkImage = async (workIndex, scopeType) => {
        const work=state.draft.works?.[Number(workIndex)];if(!work?.id)return;
        const requestKey=`work-media-remove-${state.persisted.campaignId}-${work.id}-${scopeType}-${Date.now()}`;
        setSaveState('saving','กำลังลบรูปและบันทึก…');
        const response=await API.delete(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/media/atomic`,{headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify({scopeType,scopeId:Number(work.id),reason:'Removed from governed work media editor'})});
        if(!response.data?.serverConfirmed)throw new Error('Server did not confirm work image removal.');
        const refreshed=await API.get(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/works`);state.draft.works=refreshed.data?.rows||state.draft.works;state.dirty=false;state.persisted.builderSaved=true;clearRecovery();setSaveState('saved','ลบรูปผลงานและบันทึกแล้ว');render();
    };

    const render = () => {
        releaseSafetyVoteImages(container);
        const steps = wizardStepsFor(state.draft);
        const [stepKey, stepTitle] = steps[state.step];
        const editing = Boolean(state.persisted.campaignId);
        const readiness = readinessItems(state.draft, state.persisted), readyCount = readiness.filter(item => item.pass).length;
        const recovery = state.recovery ? `<section class="svw-recovery" role="status"><div><strong>พบข้อมูลล่าสุดที่ยังไม่ได้บันทึก</strong><span>บันทึกชั่วคราวในเบราว์เซอร์เมื่อ ${formatThaiDateTime(state.recovery.savedAt)}</span></div><div><button type="button" class="sv-button sv-button--primary" data-svw-recovery="restore">กู้คืนข้อมูล</button><button type="button" class="sv-button sv-button--secondary" data-svw-recovery="discard">ไม่ใช้ข้อมูลที่กู้คืน</button></div></section>` : '';
        container.innerHTML = `<div class="svw-shell" data-sv-wizard="2026-10-25-adaptive-wizard-phase5a-r1"><header class="svw-header"><button type="button" class="sv-icon-button" data-svw-action="close" aria-label="กลับศูนย์จัดการ">←</button><div><p class="sv-eyebrow">${state.liveJuryMode?'จัดการกรรมการระหว่างแคมเปญ':editing?'แก้ไขแคมเปญฉบับร่าง':'สร้างแคมเปญ'}${sourceLabel ? ` · ${escHtml(sourceLabel)}` : ''}</p><h1>${escHtml(stepTitle)}</h1>${state.persisted.serverUpdatedAt ? `<small>แก้ไขล่าสุด ${formatThaiDateTime(state.persisted.serverUpdatedAt)}</small>` : ''}</div><div class="svw-progress-copy">${state.liveJuryMode?'เฉพาะรายชื่อกรรมการ':`ขั้น ${state.step + 1} จาก ${steps.length}`}</div></header><div class="svw-progress" role="progressbar" aria-label="ความคืบหน้าการสร้างแคมเปญ" aria-valuemin="1" aria-valuemax="${steps.length}" aria-valuenow="${state.step + 1}"><span style="width:${(state.step + 1) / steps.length * 100}%"></span></div>${recovery}<section class="svw-readiness-summary" aria-label="ความพร้อมเบื้องต้น"><div><strong>ความพร้อม ${readyCount}/${readiness.length}</strong><span>${readyCount === readiness.length ? 'พร้อมตรวจสอบขั้นสุดท้าย' : 'ระบบจะอัปเดตตามข้อมูลที่กรอก'}</span></div><div class="sv-readiness-meter" role="progressbar" aria-label="ความพร้อมของแคมเปญ" aria-valuemin="0" aria-valuemax="${readiness.length}" aria-valuenow="${readyCount}"><span style="width:${readiness.length ? readyCount/readiness.length*100 : 0}%"></span></div></section><div class="svw-layout"><nav class="svw-step-nav" aria-label="ขั้นตอนสร้างแคมเปญ">${steps.map(([key,label],index)=>`<button type="button" data-svw-step="${index}" ${index===state.step?'aria-current="step"':''} ${(state.liveJuryMode&&index!==4)||index>state.maxStep?'disabled':''}><span>${index+1}</span><span>${escHtml(label)}</span></button>`).join('')}</nav><main class="svw-main" data-step="${stepKey}">${state.errors.length?`<section class="svw-validation" role="alert" tabindex="-1"><h2>กรุณาตรวจสอบข้อมูล</h2><ul>${state.errors.map(error=>`<li>${escHtml(error)}</li>`).join('')}</ul></section>`:''}<section class="svw-card">${stepMarkup(state.step,state.draft,state.persisted,state.previewMode,state.previewUserView,state.previewSubmitted)}</section></main></div><div class="svw-save-status" data-svw-save-status data-state="${state.saveState}" aria-live="polite">${escHtml(state.saveMessage)}</div><footer class="svw-action-bar"><button type="button" class="sv-button sv-button--secondary" data-svw-action="${state.liveJuryMode?'close':'back'}" ${!state.liveJuryMode&&state.step===0?'disabled':''}>${state.liveJuryMode?'เสร็จสิ้น':'ย้อนกลับ'}</button><div>${state.saveState==='error'?'<button type="button" class="sv-button sv-button--secondary" data-svw-action="retry">ลองบันทึกอีกครั้ง</button>':''}${state.liveJuryMode?'':state.step===steps.length-1?reviewAction():`<button type="button" class="sv-button sv-button--primary" data-svw-action="next">ถัดไป</button>`}</div></footer></div>`;
        if (state.step === 7) {
            const discoveryField = container.querySelector('[data-svw-field="discoveryMode"]')?.closest('.svw-field');
            const officialTopN = officialResultTopNMarkup(state.draft.officialResultTopN, state.draft.resultReleasePolicy, state.draft.campaignType);
            container.querySelector('.svw-live-config')?.insertAdjacentHTML('beforebegin', officialTopN);
            discoveryField?.insertAdjacentHTML('beforebegin', '<section class="svw-privacy-scope" role="note"><strong>ค่าเริ่มต้นองค์กร: พนักงานทุกคนเห็นแคมเปญที่เผยแพร่</strong><span>การเห็นรายการและรายละเอียดไม่ให้สิทธิ์ตอบแบบสอบถาม ลงคะแนน ส่งผลงาน หรือให้คะแนน กิจกรรมเหล่านี้ยังตรวจรายชื่อผู้มีสิทธิ์และหน้าที่กรรมการแยกต่างหาก</span></section>');
            const discoveryHelp = state.draft.discoveryMode === 'public_listing'
                ? 'พนักงานที่เข้าสู่ระบบทุกคนเห็นการ์ดและรายละเอียด แต่เฉพาะผู้มีสิทธิ์ในรายชื่อที่ยืนยันแล้วเท่านั้นที่เห็นคำถามและลงคะแนนได้'
                : 'เฉพาะผู้มีสิทธิ์ในรายชื่อที่ยืนยันแล้วเท่านั้นที่เห็นแคมเปญ รายละเอียด คำถาม และการลงคะแนน';
            discoveryField?.insertAdjacentHTML('beforeend', `<small data-svw-discovery-help>${discoveryHelp}</small>`);
        }
        container.querySelector('.svw-header')?.insertAdjacentHTML('beforebegin', safetyVoteJourneyNav({ role: 'admin', current: 'readiness', campaign: state.draft, onPage: typeof onNavigate !== 'function' }));
        renderQuestionImageEditors();
        bind();
        if ([3,8].includes(state.step)) bindSafetyVoteImageGallery(container);
        if (state.step === 8) bindSafetyVoteCampaignPreview(container);
        if ([3,8].includes(state.step)) hydrateSafetyVoteImages(container);
        if ([3,8].includes(state.step)) hydrateOptionImages();
        if ([3,8].includes(state.step)) hydrateQuestionImages();
    };

    const reviewAction = () => {
        const ready = readinessItems(state.draft,state.persisted).every(item=>item.pass), advanced = templateFor(state.draft.campaignType).advancedRequired;
        if (advanced) return `<button type="button" class="sv-button sv-button--primary" data-svw-action="advanced" ${!state.persisted.campaignId?'disabled':''}>ไปตั้งค่าขั้นสูง</button>`;
        const scheduled = state.draft.openAt && new Date(state.draft.openAt).getTime() > Date.now();
        return `<button type="button" class="sv-button sv-button--primary" data-svw-action="open" ${!ready?'disabled':''}>${scheduled ? 'ตั้งเวลาแคมเปญ' : 'เปิดแคมเปญ'}</button>`;
    };

    const next = async () => {
        clearTimeout(state.timer); readFields(); state.errors = validateStep(state.step,state.draft); if(state.errors.length){render();container.querySelector('.svw-validation')?.focus();return;}
        try { await state.saveChain; if(!await persistForStep(state.step))return; state.step=Math.min(WIZARD_STEPS.length-1,state.step+1);state.maxStep=Math.max(state.maxStep,state.step);state.errors=[];render();container.querySelector('.svw-main')?.focus?.(); }
        catch(error){state.errors=[error?.message||'บันทึกข้อมูลไม่สำเร็จ'];render();container.querySelector('.svw-validation')?.focus();}
    };

    const previewEligibility = async () => {
        clearTimeout(state.timer); readFields();
        try { await state.saveChain; await saveRules(); setSaveState('saving','กำลังตรวจสอบรายชื่อ…');const response=await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/eligibility/preview`,{rules:state.draft.rules.map((rule,index)=>({...rule,ruleGroup:1,ruleOrder:index+1,operator:rule.attributeKey==='all'?'EQUALS':'IN'}))});state.draft.eligibilityPreview=response.data;state.draft.eligibilityFrozen=false;setSaveState('saved','ตรวจสอบรายชื่อแล้ว');render(); }
        catch(error){state.errors=[error?.message||'ตรวจสอบรายชื่อไม่สำเร็จ'];setSaveState('error','ตรวจสอบไม่สำเร็จ — ลองอีกครั้ง');render();}
    };

    const freezeEligibility = () => openSafetyVoteConfirmDialog({title:'ยืนยันการตรึงรายชื่อผู้มีสิทธิ์',description:`ระบบจะบันทึกรายชื่อผู้มีสิทธิ์ ${Number(state.draft.eligibilityPreview?.eligibleCount||0).toLocaleString('th-TH')} คนเป็น snapshot สำหรับแคมเปญนี้ การเปลี่ยนกฎภายหลังต้องตรวจสอบและตรึงใหม่`,confirmLabel:'ยืนยันและตรึงรายชื่อ',onConfirm:async()=>{const response=await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/eligibility/freeze`,{reason:'Safety Vote UX Phase 2 readiness wizard'});state.draft.eligibilityFrozen=true;state.draft.eligibilityPreview={...state.draft.eligibilityPreview,...response.data};setSaveState('saved','ตรึงรายชื่อผู้มีสิทธิ์แล้ว');render();}});

    const readinessLabel = blocker => ({
        ACTIVE_QUESTIONS: 'ยังไม่มีคำถามที่เปิดใช้งาน', CONTENT_PRESENT: 'ยังไม่มีคำถามที่เปิดใช้งาน',
        QUESTION_OPTIONS_COMPLETE: 'ตัวเลือกของคำถามยังไม่ครบ', OPTIONS_COMPLETE: 'ตัวเลือกของคำถามยังไม่ครบ',
        ELIGIBILITY_RULES_VALID: 'กฎผู้มีสิทธิ์ไม่สมบูรณ์', ELIGIBILITY_FROZEN: 'ยังไม่ได้ตรึงรายชื่อผู้มีสิทธิ์',
        ELIGIBILITY_RULES_UNCHANGED: 'กฎผู้มีสิทธิ์เปลี่ยนหลังตรึงรายชื่อ', ELIGIBILITY_ROWS_UNCHANGED: 'ข้อมูลผู้มีสิทธิ์เปลี่ยนหลังตรึงรายชื่อ',
        ELIGIBILITY_NOT_DRIFTED: 'กฎหรือข้อมูลผู้มีสิทธิ์เปลี่ยนหลังตรึงรายชื่อ', ELIGIBLE_POPULATION: 'ไม่พบผู้มีสิทธิ์',
        ELIGIBLE_VOTERS_PRESENT: 'ไม่พบผู้มีสิทธิ์', ELIGIBLE_ACCOUNTS_READY: 'บัญชีผู้มีสิทธิ์บางรายการยังไม่พร้อมหรือมีคำเตือน',
        SCHEDULE_VALID: 'กำหนดเวลาเปิด–ปิดไม่ถูกต้อง', PARTICIPANT_VISIBILITY: 'แคมเปญถูกซ่อนหรืออยู่ในโหมดทดสอบ',
        PRODUCTION_VISIBILITY: 'แคมเปญถูกซ่อนหรืออยู่ในโหมดทดสอบ'
    }[blocker?.code] || blocker?.detail || blocker?.code || 'พบรายการที่ยังไม่พร้อม');

    const openCampaign = () => {
        const scheduled = state.draft.openAt && new Date(state.draft.openAt).getTime() > Date.now(), command = scheduled ? 'schedule' : 'open', label = scheduled ? 'ตั้งเวลาแคมเปญ' : 'เปิดแคมเปญ';
        return openSafetyVoteConfirmDialog({
            title:`ยืนยันการ${label}`,
            description:scheduled?'ระบบจะตรึงเนื้อหาและรายชื่อผู้มีสิทธิ์ แล้วเปิดรับคะแนนอัตโนมัติเมื่อถึงเวลา Asia/Bangkok ที่กำหนด':'เมื่อเปิดแล้ว เนื้อหาและรายชื่อผู้มีสิทธิ์ชุดนี้จะถูกใช้รับคำตอบ การแก้ไขฉบับร่างจะถูกจำกัดตามกติกาเดิมของระบบ',
            confirmLabel:label,
            onConfirm:async()=>{
                const readiness = await API.get(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/readiness`);
                if (!readiness.data?.ready) {
                    const error = new Error('ยังเปิดแคมเปญไม่ได้ กรุณาแก้รายการที่ระบบตรวจพบ');
                    error.details = (readiness.data?.blockers || []).map(blocker => ({ message: readinessLabel(blocker) }));
                    throw error;
                }
                const response=await API.post(`/safety-vote/admin/campaigns/${state.persisted.campaignId}/lifecycle/${command}`,{});
                showToast(`${label}แล้ว`,'success');cleanup();await onComplete({campaignId:state.persisted.campaignId,status:response.data?.status||(scheduled?'Scheduled':'Open')});
            }
        });
    };

    const beforeUnload = event => { if (!state.dirty && state.saveState !== 'saving') return; event.preventDefault(); event.returnValue = ''; };
    const cleanup = () => { clearTimeout(state.timer); state.peoplePickerCleanup?.(); window.removeEventListener('beforeunload', beforeUnload); releaseSafetyVoteImages(container); state.objectUrls.forEach(url=>URL.revokeObjectURL(url)); state.objectUrls.clear(); };
    const finishClose = () => { cleanup(); onClose(); };
    const requestClose = () => { if(!state.dirty&&state.saveState!=='saving')return finishClose();openSafetyVoteConfirmDialog({title:'ออกจากการสร้างแคมเปญ',description:'ข้อมูลที่บันทึกแล้วจะยังอยู่ แต่ข้อมูลล่าสุดที่ยังไม่ได้บันทึกอาจสูญหาย',confirmLabel:'ออกจากหน้านี้',tone:'danger',onConfirm:finishClose}); };
    const requestNavigate = step => { const proceed = () => { cleanup(); onNavigate?.(step); }; if(!state.dirty&&state.saveState!=='saving')return proceed();openSafetyVoteConfirmDialog({title:'ออกจากแคมเปญฉบับร่าง',description:'ระบบเก็บข้อมูลล่าสุดไว้สำหรับกู้คืน แต่การเปลี่ยนพื้นที่ตอนนี้อาจทำให้ข้อมูลที่ยังไม่ส่งถึงเซิร์ฟเวอร์ไม่ถูกบันทึก',confirmLabel:'เปลี่ยนพื้นที่',tone:'danger',onConfirm:proceed}); };

    const bind = () => {
        state.peoplePickerCleanup?.();state.peoplePickerCleanup=bindSafetyVotePeoplePickers(container,{onChange:detail=>{if(detail.key==='juryAssignment'&&detail.employeeId)assignJuror(detail.employeeId);}});
        container.querySelectorAll('[data-svw-question-image]').forEach(input=>input.addEventListener('change',()=>uploadQuestionImage(input)));
        container.querySelectorAll('[data-svw-work-image]').forEach(input=>input.addEventListener('change',()=>uploadWorkImage(input)));
        container.querySelectorAll('.svw-work-item').forEach((card,index)=>{const work=state.draft.works?.[index],items=work?.gallery||[],actions=card.querySelector('.svw-inline-actions');if(!actions||!items.length)return;const cover=items.find(item=>item.isCover),gallery=items.filter(item=>!item.isCover);if(cover)actions.insertAdjacentHTML('beforeend',`<button type="button" class="sv-button sv-button--secondary" data-svw-remove-work-media="work_cover" data-work-index="${index}">ลบ Cover</button>`);if(gallery.length)actions.insertAdjacentHTML('beforeend',`<button type="button" class="sv-button sv-button--secondary" data-svw-remove-work-media="work_gallery" data-work-index="${index}">ลบรูป Gallery ล่าสุด</button>`);});
        container.querySelectorAll('[data-svw-remove-work-media]').forEach(button=>button.addEventListener('click',async()=>{try{await removeWorkImage(Number(button.dataset.workIndex),button.dataset.svwRemoveWorkMedia);}catch(error){setSaveState('error','ลบรูปผลงานไม่สำเร็จ');showToast(error?.message||'ลบรูปผลงานไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-question-image-alt]').forEach(input=>input.addEventListener('input',()=>{const question=state.draft.questions[Number(input.dataset.svwQuestionImageAlt)];if(question){question.imageAltText=input.value;state.persisted.builderSaved=false;enqueueSave();}}));
        container.querySelectorAll('[data-svw-remove-question-image]').forEach(button=>button.addEventListener('click',async()=>{const question=state.draft.questions[Number(button.dataset.svwRemoveQuestionImage)];if(!question)return;try{await deleteQuestionFile(question);render();}catch(error){showToast(error?.message||'ลบรูปประจำคำถามไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-question]').forEach(button=>button.addEventListener('click',()=>{const question=state.draft.questions[Number(button.dataset.svwRemoveQuestion)];if(question?.imageFileId)deleteQuestionFile(question).catch(()=>{});}));
        container.querySelectorAll('[data-sv-journey-step]').forEach(button => button.addEventListener('click', () => requestNavigate(button.dataset.svJourneyStep)));
        container.querySelectorAll('[data-svw-recovery]').forEach(button => button.addEventListener('click', () => { if (button.dataset.svwRecovery === 'restore') { state.draft = clone(state.recovery.draft); state.step = Math.max(0, Math.min(WIZARD_STEPS.length-1, Number(state.recovery.step || 0))); state.maxStep = Math.max(state.step, Math.min(WIZARD_STEPS.length-1, Number(state.recovery.maxStep || 0))); state.dirty = true; state.recovery = null; setSaveState('dirty', 'กู้คืนข้อมูลแล้ว — ยังไม่ได้บันทึก'); writeRecovery(); } else clearRecovery(); render(); }));
        container.querySelectorAll('[data-svw-field],[data-svw-date-part],[data-svw-hour-part],[data-svw-minute-part],[data-svw-question-field],[data-svw-option-field],[data-svw-work-field],[data-svw-question-config],[data-svw-validation-field],[data-svw-condition-field],[data-svw-rule-field],[data-svw-criterion-field],[data-svw-jury-field]').forEach(input=>input.addEventListener('input',()=>{readFields();if(input.dataset.svwRuleField){state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;}if(input.dataset.svwOptionField||input.dataset.svwWorkField||input.dataset.svwQuestionConfig||input.dataset.svwValidationField||input.dataset.svwConditionField)state.persisted.builderSaved=false;if(input.dataset.svwCriterionField||input.dataset.svwJuryField)state.draft.juryConfigured=false;if(input.dataset.svwField==='officialResultTopN'&&!officialResultTopNValid(state.draft.officialResultTopN)){clearTimeout(state.timer);state.dirty=true;writeRecovery();setSaveState('dirty',`กรุณากำหนดจำนวนอันดับ ${OFFICIAL_RESULT_TOP_N_MIN}–${OFFICIAL_RESULT_TOP_N_MAX}`);return;}if(input.dataset.svwField==='liveLeaderboardTopN'&&!liveLeaderboardTopNValid(state.draft.liveLeaderboardTopN)){clearTimeout(state.timer);state.dirty=true;writeRecovery();setSaveState('dirty',`กรุณากำหนดจำนวนอันดับผลสด ${LIVE_LEADERBOARD_TOP_N_MIN}–${LIVE_LEADERBOARD_TOP_N_MAX}`);return;}enqueueSave();}));
        container.querySelector('[data-svw-official-topn-preset]')?.addEventListener('change',event=>{const input=container.querySelector('[data-svw-field="officialResultTopN"]');if(!input)return;if(event.currentTarget.value==='custom'){input.focus();input.select();return;}input.value=event.currentTarget.value;input.dispatchEvent(new Event('input',{bubbles:true}));});
        container.querySelector('[data-svw-field="officialResultTopN"]')?.addEventListener('input',event=>{const preset=container.querySelector('[data-svw-official-topn-preset]');if(preset)preset.value=OFFICIAL_RESULT_TOP_N_PRESETS.includes(Number(event.currentTarget.value))?String(Number(event.currentTarget.value)):'custom';});
        container.querySelector('[data-svw-live-topn-preset]')?.addEventListener('change',event=>{const input=container.querySelector('[data-svw-field="liveLeaderboardTopN"]');if(!input)return;if(event.currentTarget.value==='custom'){input.focus();input.select();return;}input.value=event.currentTarget.value;input.dispatchEvent(new Event('input',{bubbles:true}));});
        container.querySelector('[data-svw-field="liveLeaderboardTopN"]')?.addEventListener('input',event=>{const preset=container.querySelector('[data-svw-live-topn-preset]');if(preset)preset.value=LIVE_LEADERBOARD_TOP_N_PRESETS.includes(Number(event.currentTarget.value))?String(Number(event.currentTarget.value)):'custom';});
        container.querySelector('[data-svw-copy-official-topn]')?.addEventListener('click',()=>{const input=container.querySelector('[data-svw-field="liveLeaderboardTopN"]');if(!input)return;input.value=String(officialResultTopNValid(state.draft.officialResultTopN)?Number(state.draft.officialResultTopN):5);input.dispatchEvent(new Event('input',{bubbles:true}));showToast('คัดลอกจำนวนอันดับจากผลอย่างเป็นทางการแล้ว','success');});
        container.querySelectorAll('[data-svw-option-field]').forEach(input=>input.addEventListener('change',()=>{readFields();render();}));
        container.querySelector('[data-svw-field="discoveryMode"]')?.addEventListener('change',()=>{readFields();render();});
        container.querySelectorAll('[data-svw-question-config],[data-svw-validation-field]').forEach(input=>input.addEventListener('change',()=>{readFields();const question=state.draft.questions[Number(input.dataset.questionIndex)];if(question&&input.dataset.svwQuestionConfig==='isRequired')question.minSelections=question.isRequired===false?0:Math.max(1,Number(question.minSelections||1));state.persisted.builderSaved=false;render();}));
        container.querySelectorAll('[data-svw-condition-field]').forEach(input=>input.addEventListener('change',()=>{readFields();state.persisted.builderSaved=false;render();}));
        container.querySelectorAll('[data-svw-question-field="questionType"]').forEach(input=>input.addEventListener('change',async()=>{const question=state.draft.questions[Number(input.dataset.index)],previousType=question?.questionType;readFields();if(question){if(hasOptions(previousType)&&!hasOptions(question.questionType)){try{for(const option of question.options||[])await deleteOptionFile(option);}catch(error){question.questionType=previousType;showToast(error?.message||'เปลี่ยนรูปแบบคำถามไม่สำเร็จ','error');return render();}}question.options=hasOptions(question.questionType)?(question.options?.length?question.options:defaultOptionsForType(question.questionType)):[];question.validation=defaultValidationForType(question.questionType);question.minSelections=question.isRequired===false?0:1;question.maxSelections=['multiple_choice','ranking'].includes(question.questionType)?Math.min(2,question.options.length):1;}state.persisted.builderSaved=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-rule-field="attributeKey"]').forEach(input=>input.addEventListener('change',()=>{readFields();state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;render();}));
        container.querySelectorAll('input[type="radio"][data-svw-field]:not([name="svw-work-source"])').forEach(input=>input.addEventListener('change',()=>{readFields();enqueueSave();render();}));
        container.querySelectorAll('input[name="svw-work-source"]').forEach(input=>input.addEventListener('change',()=>{const previous=state.draft.workSource;readFields();if(previous!==state.draft.workSource){state.draft.works=state.draft.workSource==='admin_curated'?[defaultWork()]:[];state.persisted.builderSaved=false;}enqueueSave();render();}));
        container.querySelectorAll('[data-svw-template]').forEach(button=>button.addEventListener('click',()=>{state.draft=applyTemplate(state.draft,button.dataset.svwTemplate);state.persisted.builderSaved=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-step]').forEach(button=>button.addEventListener('click',()=>{readFields();state.step=Number(button.dataset.svwStep);state.errors=[];render();}));
        container.querySelectorAll('[data-svw-preview]').forEach(button=>button.addEventListener('click',()=>{state.previewMode=button.dataset.svwPreview;render();}));
        container.querySelectorAll('[data-svw-user-view]').forEach(button=>button.addEventListener('click',()=>{if(button.disabled)return;state.previewUserView=button.dataset.svwUserView;render();}));
        container.querySelectorAll('[data-svw-preview-submitted]').forEach(button=>button.addEventListener('click',()=>{state.previewSubmitted=button.dataset.svwPreviewSubmitted==='true';if(!state.previewSubmitted)state.previewUserView='participation';render();}));
        container.querySelectorAll('[data-svw-add-option]').forEach(button=>button.addEventListener('click',()=>{readFields();const question=state.draft.questions[Number(button.dataset.svwAddOption)];if(!question)return;if((question.options||[]).length>=100)return showToast('หนึ่งคำถามมีตัวเลือกได้สูงสุด 100 รายการ','error');question.options=[...(question.options||[]),{label:'',description:'',fileId:null}];state.persisted.builderSaved=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-move-option]').forEach(button=>button.addEventListener('click',()=>{readFields();const question=state.draft.questions[Number(button.dataset.questionIndex)];if(question&&moveItem(question.options,Number(button.dataset.optionIndex),button.dataset.svwMoveOption)){state.persisted.builderSaved=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-move-question]').forEach(button=>button.addEventListener('click',()=>{readFields();if(moveItem(state.draft.questions,Number(button.dataset.index),button.dataset.svwMoveQuestion)){state.persisted.builderSaved=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-move-work]').forEach(button=>button.addEventListener('click',()=>{readFields();if(moveItem(state.draft.works,Number(button.dataset.index),button.dataset.svwMoveWork)){state.persisted.builderSaved=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-remove-work]').forEach(button=>button.addEventListener('click',()=>{readFields();if(state.draft.works.length>1){state.draft.works.splice(Number(button.dataset.svwRemoveWork),1);state.persisted.builderSaved=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-bulk-apply]').forEach(button=>button.addEventListener('click',()=>applyBulkImport(Number(button.dataset.svwBulkApply))));
        container.querySelectorAll('[data-svw-option-image]').forEach(input=>input.addEventListener('change',()=>uploadOptionImage(input)));
        container.querySelectorAll('[data-svw-remove-option-image]').forEach(button=>button.addEventListener('click',async()=>{readFields();const option=state.draft.questions[Number(button.dataset.questionIndex)]?.options?.[Number(button.dataset.optionIndex)];if(!option)return;try{await deleteOptionFile(option);render();}catch(error){showToast(error?.message||'ลบรูปภาพไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-option]').forEach(button=>button.addEventListener('click',async()=>{readFields();const question=state.draft.questions[Number(button.dataset.questionIndex)],index=Number(button.dataset.optionIndex),option=question?.options?.[index];if(!question||!option||question.options.length<=2)return;try{await deleteOptionFile(option);question.options.splice(index,1);state.persisted.builderSaved=false;enqueueSave();render();}catch(error){showToast(error?.message||'ลบตัวเลือกไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-question]').forEach(button=>button.addEventListener('click',async()=>{readFields();const index=Number(button.dataset.svwRemoveQuestion),question=state.draft.questions[index];if(!question||state.draft.questions.length<=1)return;try{for(const option of question.options||[])await deleteOptionFile(option);state.draft.questions.splice(index,1);state.persisted.builderSaved=false;enqueueSave();render();}catch(error){showToast(error?.message||'ลบคำถามไม่สำเร็จ','error');}}));
        container.querySelectorAll('[data-svw-remove-rule]').forEach(button=>button.addEventListener('click',()=>{state.draft.rules.splice(Number(button.dataset.svwRemoveRule),1);state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;enqueueSave();render();}));
        container.querySelectorAll('[data-svw-move-criterion]').forEach(button=>button.addEventListener('click',()=>{readFields();if(moveItem(state.draft.juryCriteria,Number(button.dataset.index),button.dataset.svwMoveCriterion)){state.draft.juryConfigured=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-remove-criterion]').forEach(button=>button.addEventListener('click',()=>{readFields();if(state.draft.juryCriteria.length>1){state.draft.juryCriteria.splice(Number(button.dataset.svwRemoveCriterion),1);state.draft.juryConfigured=false;enqueueSave();render();}}));
        container.querySelectorAll('[data-svw-revoke-juror]').forEach(button=>button.addEventListener('click',()=>revokeJuror(Number(button.dataset.svwRevokeJuror))));
        container.querySelectorAll('[data-svw-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.svwAction;if(action==='next')next();else if(action==='back'){readFields();state.step=Math.max(0,state.step-1);state.errors=[];render();}else if(action==='close')requestClose();else if(action==='retry')persistForStep(state.step).catch(()=>{});else if(action==='add-question'){const question=defaultQuestion(state.draft.campaignType,state.draft.questions.length);question.questionCode=nextQuestionCode();state.draft.questions.push(question);state.persisted.builderSaved=false;enqueueSave();render();}else if(action==='add-work'){state.draft.works.push(defaultWork(state.draft.works.length));state.persisted.builderSaved=false;enqueueSave();render();}else if(action==='add-criterion'){readFields();const index=state.draft.juryCriteria.length;state.draft.juryCriteria.push({criterionCode:`CRITERION_${index+1}`,title:'',description:'',minScore:1,maxScore:5,weight:0});state.draft.juryConfigured=false;enqueueSave();render();}else if(action==='add-rule'){state.draft.rules.push({effect:'include',attributeKey:'department_id',operator:'IN',values:[],reason:'กำหนดจาก wizard'});state.draft.eligibilityPreview=null;state.draft.eligibilityFrozen=false;enqueueSave();render();}else if(action==='preview-eligibility')previewEligibility();else if(action==='freeze-eligibility')freezeEligibility();else if(action==='open')openCampaign();else if(action==='advanced'){cleanup();onOpenAdvanced(state.persisted.campaignId);}}));
    };

    window.addEventListener('beforeunload', beforeUnload);
    if (campaignId) hydrateDraft(campaignId); else {
        if (initialConfig) state.draft = configDraft(initialConfig);
        else if (initialTemplateKey) state.draft = applyTemplate(createWizardDraft(), initialTemplateKey);
        state.recovery = readRecovery();
        if (sourceLabel) state.saveMessage = `เริ่มจาก ${sourceLabel} — ยังไม่ได้บันทึก`;
        render();
    }
    return { getState:()=>structuredClone({step:state.step,maxStep:state.maxStep,draft:state.draft,persisted:state.persisted,saveState:state.saveState}), destroy:cleanup };
}
