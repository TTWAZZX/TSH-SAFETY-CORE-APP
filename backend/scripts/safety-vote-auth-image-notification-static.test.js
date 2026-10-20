'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const loader = read('public/js/utils/safety-vote-auth-image.js');
const user = read('public/js/pages/safety-vote-page-ux1.js');
const live = read('public/js/pages/safety-vote-live-results.js');
const planning = read('public/js/pages/admin-safety-vote-planning.js');
const nodePhase3 = read('backend/routes/safety-vote-phase3.js');
const phpPhase3 = read('api/handlers/safety_vote_phase3.php');
const css = read('public/style.css');

for (const marker of ['blobCache', 'กำลังโหลดภาพ', 'โหลดภาพไม่สำเร็จ', 'ลองใหม่', 'URL.createObjectURL', 'data-sv-auth-retry']) assert(loader.includes(marker), `central authenticated image loader missing ${marker}`);
assert(user.includes('hydrateSafetyVoteImages(state.page)') && user.includes('data-sv-auth-file'), 'participant images do not use the central loader');
for (const source of [nodePhase3, phpPhase3]) {
    assert(source.includes('o.FileID OptionFileID'), 'own-response query must include the selected option image');
    assert(source.includes('optionImageFileId'), 'own-response DTO must expose the private option image file ID');
}
for (const marker of ['submittedAnswerMarkup', 'svp-submitted-answer__image', 'data-sv-gallery-group', 'optionImageFileId']) assert(user.includes(marker), `submitted-answer image UI missing ${marker}`);
assert(css.includes('.svp-submitted-answer--with-image') && css.includes('.svp-submitted-answer__image'), 'submitted-answer image layout is incomplete');
assert(live.includes('hydrateSafetyVoteImages(root)') && live.includes('data-sv-auth-file'), 'live-result images do not use the central loader');
assert(css.includes('[data-svp-media-state="loaded"]') && css.includes('.svp-auth-media__retry'), 'loading, loaded and retry presentation is incomplete');
assert(user.includes("if (!isSafetyVoteEngagementV1Enabled() || !state.notificationCenter.length) return ''"), 'empty notification inbox must be hidden');
for (const marker of ['ยังไม่อ่าน', 'อ่านแล้ว', 'ดูทั้งหมด', 'แสดงเฉพาะข้อความที่ระบบส่งถึงบัญชีของคุณแล้ว']) assert(user.includes(marker), `notification inbox missing ${marker}`);
for (const marker of ['รอส่ง (Queued)', 'ส่งแล้ว (Sent)', 'ส่งไม่สำเร็จ (Failed)', 'ผู้ใช้จะเห็นเมื่อสถานะเป็น “ส่งแล้ว”']) assert(planning.includes(marker), `admin delivery wording missing ${marker}`);
console.log('Safety Vote authenticated images + notification UX: PASS');
