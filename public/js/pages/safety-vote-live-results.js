import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';
import { formatThaiTime } from './safety-vote-time.mjs?v=20261015-safety-vote-thai-time-r1';
import { hydrateSafetyVoteImages, releaseSafetyVoteImages } from '../utils/safety-vote-auth-image.js?v=20261020-safety-vote-response-media-r2';

export function clearLiveResultImages(root) {
    releaseSafetyVoteImages(root);
}

function liveStatusMarkup(data) {
    if (data.status === 'empty') return '<div class="sv-live-status is-empty" role="status"><strong>กระดานพร้อมแล้ว · รอคะแนนแรก</strong><span>ระบบเตรียม Top รายการไว้ให้แล้ว และจะอัปเดตอัตโนมัติเมื่อเริ่มมีผู้ส่งคะแนน</span></div>';
    if (data.status === 'threshold_not_met') return `<div class="sv-live-status is-private" role="status"><strong>กำลังสะสมคะแนนอย่างเป็นส่วนตัว</strong><span>ระบบจะแสดงอันดับและคะแนนจริงเมื่อมีบัตร Accepted อย่างน้อย ${Number(data.minimumRequired).toLocaleString('th-TH')} ใบ ระหว่างนี้จะไม่เปิดเผยจำนวนที่ส่งแล้ว</span></div>`;
    return '';
}

function liveMetaMarkup(data) {
    const accepted = data.status === 'threshold_not_met' ? 'Accepted ซ่อนตามเกณฑ์' : `Accepted ${Number(data.totalAcceptedVotes || 0).toLocaleString('th-TH')}`;
    return `<div class="sv-live-board__meta"><span>${accepted}</span><span>อัปเดต ${formatThaiTime(data.lastCalculatedAt, 'ไม่ระบุเวลา', true)}</span><span>ครั้งถัดไป <strong data-sv-live-countdown>${Number(data.config?.refreshSeconds || 15)}</strong> วินาที</span></div>`;
}

function liveQuestionMarkup(question, data, admin) {
    const pending = data.status !== 'available';
    const scoreMode = data.config?.scoreMode || 'count_percentage';
    const rows = pending ? (question.summary || []) : (admin ? question.options : question.summary || question.options || []);
    const score = option => pending
        ? data.status === 'empty' ? '0 โหวต' : 'ซ่อนคะแนน'
        : scoreMode === 'count' ? `${Number(option.voteCount).toLocaleString('th-TH')} โหวต`
            : scoreMode === 'percentage' ? `${Number(option.percentage).toLocaleString('th-TH')}%`
                : `${Number(option.voteCount).toLocaleString('th-TH')} โหวต · ${Number(option.percentage).toLocaleString('th-TH')}%`;
    const note = data.status === 'empty'
        ? 'รายการเรียงตามลำดับที่ตั้งค่าไว้ ยังไม่ถือเป็นอันดับจนกว่าจะมีคะแนน'
        : data.status === 'threshold_not_met'
            ? `แสดงตัวเลือกตามลำดับที่ตั้งค่าไว้ โดยซ่อนอันดับและคะแนนจนกว่าจะครบ ${Number(data.minimumRequired).toLocaleString('th-TH')} บัตร`
            : 'เปอร์เซ็นต์คำนวณจากคำตอบ option ที่ valid ของคำถามนี้ รวมตัวเลือกงดออกเสียงถ้ามี และไม่รวมคำถามที่ไม่ได้ตอบ';
    return `<section class="sv-live-question"><h4>${escHtml(question.title || question.questionCode || '')}</h4><div class="sv-live-list">${rows.map(option => {
        const percentage = pending ? 0 : Math.max(0, Math.min(100, Number(option.percentage) || 0));
        const rank = pending ? '—' : Number(option.rank);
        const progressLabel = pending ? `${option.label} ยังไม่เปิดเผยคะแนน` : `${option.label} ${percentage} เปอร์เซ็นต์`;
        return `<article class="sv-live-row${pending ? ' is-pending' : ''}"><strong class="sv-live-rank">#${rank}</strong>${option.fileId ? `<button type="button" class="sv-live-image" data-sv-auth-media data-svp-media-state="loading" aria-busy="true" data-sv-image-gallery data-sv-gallery-group="live-${Number(question.questionId)}" data-sv-gallery-label="${escHtml(option.label)}" aria-label="ขยายภาพ ${escHtml(option.label)}"><img data-sv-live-file="${Number(option.fileId)}" data-sv-auth-file="${Number(option.fileId)}" alt="${escHtml(option.label)}" decoding="async"></button>` : ''}<div><strong>${escHtml(option.label)}</strong>${option.description ? `<small>${escHtml(option.description)}</small>` : ''}${option.tied && !pending ? '<span class="sv-live-tie">อันดับร่วม</span>' : ''}<div class="sv-live-progress" role="progressbar" aria-label="${escHtml(progressLabel)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width:${percentage}%"></span></div></div><span class="sv-live-score">${escHtml(score(option))}</span></article>`;
    }).join('')}</div><small>${escHtml(note)}</small></section>`;
}

export function liveResultsMarkup(data, { admin = false, error = null, loading = false, paused = false } = {}) {
    if (loading) return '<div class="sv-live-state" aria-busy="true"><strong>กำลังโหลดผลโหวตสด…</strong><span>ระบบกำลังอ่านเฉพาะข้อมูลรวมที่ผ่านสิทธิ์</span></div>';
    if (error) {
        const messages = { LIVE_RESULTS_DISABLED: 'แคมเปญนี้ปิด Live Leaderboard', LIVE_RESULTS_SUBMISSION_REQUIRED: 'ส่งคะแนนก่อนจึงจะดูผลโหวตสดได้', LIVE_RESULTS_ADMIN_ONLY: 'ผลโหวตสดจำกัดสำหรับ Admin', LIVE_RESULTS_CAMPAIGN_NOT_OPEN: 'กิจกรรมไม่อยู่ในสถานะเปิด ผลอย่างเป็นทางการใช้ workflow ผลและการรับรอง', LIVE_RESULTS_UNSUPPORTED_CAMPAIGN_TYPE: 'ประเภทแคมเปญนี้ไม่รองรับ Live Leaderboard', LIVE_RESULTS_UNSUPPORTED_QUESTION_TYPE: 'รูปแบบคำถามนี้ไม่รองรับ Live Leaderboard' };
        return `<div class="sv-live-state is-warning" role="status"><strong>${escHtml(messages[error.code] || 'ยังแสดงผลโหวตสดไม่ได้')}</strong><span>${escHtml(error.message || 'กรุณาลองใหม่')}</span></div>`;
    }
    if (!data) return '<div class="sv-live-state"><strong>ยังไม่มีข้อมูลผลโหวตสด</strong></div>';
    return `<div class="sv-live-board" data-sv-live-board data-sv-live-status="${escHtml(data.status || 'available')}"><div class="sv-live-board__heading"><div><p class="sv-eyebrow">Near real-time · Aggregate only</p><h3>ผลโหวตสด</h3></div><span>${paused ? 'พักการอัปเดต' : `Top ${Number(data.config?.topN || 5)}`}</span></div>${liveMetaMarkup(data)}${liveStatusMarkup(data)}${(data.questions || []).map(question => liveQuestionMarkup(question, data, admin)).join('')}<div class="sv-live-disclaimer" role="note">ผลระหว่างกิจกรรม ยังไม่ใช่ผลประกาศอย่างเป็นทางการ</div></div>`;
}

export async function hydrateLiveResultImages(root) {
    await hydrateSafetyVoteImages(root);
}
