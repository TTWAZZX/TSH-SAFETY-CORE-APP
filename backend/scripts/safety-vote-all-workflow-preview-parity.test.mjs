import assert from 'node:assert/strict';
import { safetyVoteCampaignPreview } from '../../public/js/pages/safety-vote-ux-components.js';

const base = {
    titleTh: 'กิจกรรมความปลอดภัย', summary: 'รายละเอียดจริงของกิจกรรม', privacyMode: 'identified',
    maxParticipationAttempts: 2, openAt: '2026-11-01T08:00', closeAt: '2026-11-05T17:00',
    resultVisibility: 'hidden_until_close', resultReleasePolicy: 'automatic'
};
const choiceQuestion = {
    questionCode: 'Q1', questionType: 'single_choice', title: 'เลือกรายการที่เหมาะสม', helpText: 'เลือกได้หนึ่งรายการ',
    imageFileId: 901, imageAltText: 'ภาพประจำคำถาม', isRequired: true, minSelections: 1, maxSelections: 1,
    options: [{ optionCode: 'A', label: 'ตัวเลือก A', fileId: 902 }, { optionCode: 'B', label: 'ตัวเลือก B' }]
};

const cases = [
    ['survey', { ...choiceQuestion, questionType: 'rating', validation: { minNumber: 2, maxNumber: 9 }, options: [] }, /คะแนน 2–9/, /คำถามแบบสำรวจ/],
    ['popular_vote', choiceQuestion, /ตรวจคะแนนโหวต/, /รายการสำหรับลงคะแนน/],
    ['secret_election', choiceQuestion, /บัตรลงคะแนนลับ/, /ตรวจบัตรก่อนส่ง/],
    ['submission_challenge', { questionCode: 'RULE', questionType: 'long_text', title: 'ต้องสอดคล้องกับ Road Safety', helpText: 'แนบภาพผลงานให้ครบ' }, /data-sv-workflow-preview="submission_challenge"/, /ตรวจผลงานก่อนส่ง/],
    ['nomination', { questionCode: 'RULE', questionType: 'employee_picker', title: 'เสนอชื่อพนักงานดีเด่น', helpText: 'ระบุเหตุผลประกอบ' }, /data-sv-workflow-preview="nomination"/, /ตรวจคำเสนอชื่อ/]
];

for (const [campaignType, question, expectedA, expectedB] of cases) {
    const campaign = { ...base, campaignType, privacyMode: campaignType === 'secret_election' ? 'secret_ballot' : 'identified' };
    const user = safetyVoteCampaignPreview({ campaign, questions: [question], mode: 'user' });
    assert.match(user, new RegExp(`data-sv-workflow-preview="${campaignType}"`));
    assert.match(user, expectedA);
    assert.match(user, expectedB);
    assert.doesNotMatch(user, /คำถามตัวอย่าง|เกณฑ์ตัวอย่าง|value="8"/);
    const admin = safetyVoteCampaignPreview({ campaign, questions: [question], mode: 'admin' });
    assert.match(admin, new RegExp(`data-sv-admin-preview="${campaignType}"`));
    assert.match(admin, /2 ครั้ง/);
    assert.match(admin, /2026-11-01T08:00 → 2026-11-05T17:00/);
}

const imageVote = safetyVoteCampaignPreview({ campaign: { ...base, campaignType: 'popular_vote' }, questions: [choiceQuestion], mode: 'user' });
assert.match(imageVote, /data-sv-auth-file="901"/);
assert.match(imageVote, /data-sv-auth-file="902"/);

const jury = safetyVoteCampaignPreview({
    campaign: { ...base, campaignType: 'jury_scoring', workSource: 'admin_curated' },
    works: [{ id: 1, workCode: 'W1', title: 'ผลงานจริง', gallery: [{ fileId: 903, isCover: true }] }],
    criteria: [{ title: 'ประโยชน์ต่อความปลอดภัย', minScore: 1, maxScore: 7, weight: 100 }], mode: 'juror'
});
assert.match(jury, /1 ผลงาน × 1 เกณฑ์ = 1 ช่องคะแนน/);
assert.match(jury, /min="1" max="7"/);
assert.match(jury, /data-sv-auth-file="903"/);

console.log('Safety Vote all-workflow final-preview parity: PASS (6 workflow profiles, User/Admin/Juror)');
