import { API } from '../api.js?v=20260908-bbs-navigation-loading-r1';
import { escHtml } from '../ui.js?v=20260602-mobile-nav-m53';

const urlsByRoot = new WeakMap();

export function clearLiveResultImages(root) {
    for (const url of urlsByRoot.get(root) || []) URL.revokeObjectURL(url);
    urlsByRoot.delete(root);
}

export function liveResultsMarkup(data, { admin = false, error = null, loading = false, paused = false } = {}) {
    if (loading) return '<div class="sv-live-state" aria-busy="true"><strong>กำลังโหลดผลโหวตสด…</strong><span>ระบบกำลังอ่านเฉพาะข้อมูลรวมที่ผ่านสิทธิ์</span></div>';
    if (error) {
        const messages = { LIVE_RESULTS_DISABLED: 'แคมเปญนี้ปิด Live Leaderboard', LIVE_RESULTS_SUBMISSION_REQUIRED: 'ส่งคะแนนก่อนจึงจะดูผลโหวตสดได้', LIVE_RESULTS_ADMIN_ONLY: 'ผลโหวตสดจำกัดสำหรับ Admin', LIVE_RESULTS_CAMPAIGN_NOT_OPEN: 'กิจกรรมไม่อยู่ในสถานะเปิด ผลอย่างเป็นทางการใช้ workflow ผลและการรับรอง', LIVE_RESULTS_UNSUPPORTED_CAMPAIGN_TYPE: 'ประเภทแคมเปญนี้ไม่รองรับ Live Leaderboard', LIVE_RESULTS_UNSUPPORTED_QUESTION_TYPE: 'รูปแบบคำถามนี้ไม่รองรับ Live Leaderboard' };
        return `<div class="sv-live-state is-warning" role="status"><strong>${escHtml(messages[error.code] || 'ยังแสดงผลโหวตสดไม่ได้')}</strong><span>${escHtml(error.message || 'กรุณาลองใหม่')}</span></div>`;
    }
    if (!data) return '<div class="sv-live-state"><strong>ยังไม่มีข้อมูลผลโหวตสด</strong></div>';
    if (data.status === 'threshold_not_met') return `<div class="sv-live-state is-private" role="status"><strong>ยังไม่ถึงเกณฑ์ความเป็นส่วนตัว</strong><span>ต้องมีบัตร Accepted อย่างน้อย ${Number(data.minimumRequired).toLocaleString('th-TH')} ใบ ระบบจึงจะแสดงคะแนนรายตัวเลือก</span></div>`;
    const scoreMode = data.config?.scoreMode || 'count_percentage';
    const score = option => scoreMode === 'count' ? `${Number(option.voteCount).toLocaleString('th-TH')} โหวต` : scoreMode === 'percentage' ? `${Number(option.percentage).toLocaleString('th-TH')}%` : `${Number(option.voteCount).toLocaleString('th-TH')} โหวต · ${Number(option.percentage).toLocaleString('th-TH')}%`;
    return `<div class="sv-live-board" data-sv-live-board><div class="sv-live-board__heading"><div><p class="sv-eyebrow">Near real-time · Aggregate only</p><h3>ผลโหวตสด</h3></div><span>${paused ? 'พักการอัปเดต' : `Top ${Number(data.config?.topN || 5)}`}</span></div><div class="sv-live-board__meta"><span>Accepted ${Number(data.totalAcceptedVotes).toLocaleString('th-TH')}</span><span>อัปเดต ${new Intl.DateTimeFormat('th-TH',{timeStyle:'medium'}).format(new Date(data.lastCalculatedAt))}</span><span>ครั้งถัดไป <strong data-sv-live-countdown>${Number(data.config?.refreshSeconds || 15)}</strong> วินาที</span></div>${(data.questions||[]).map(question=>`<section class="sv-live-question"><h4>${escHtml(question.title || question.questionCode || '')}</h4><div class="sv-live-list">${(admin ? question.options : question.summary || question.options || []).map(option=>`<article class="sv-live-row"><strong class="sv-live-rank">#${Number(option.rank)}</strong>${option.fileId?`<button type="button" class="sv-live-image" data-sv-image-gallery data-sv-gallery-group="live-${Number(question.questionId)}" data-sv-gallery-label="${escHtml(option.label)}" aria-label="ขยายภาพ ${escHtml(option.label)}"><img data-sv-live-file="${Number(option.fileId)}" alt="${escHtml(option.label)}"></button>`:''}<div><strong>${escHtml(option.label)}</strong>${option.description?`<small>${escHtml(option.description)}</small>`:''}${option.tied?'<span class="sv-live-tie">อันดับร่วม</span>':''}<div class="sv-live-progress" role="progressbar" aria-label="${escHtml(option.label)} ${Number(option.percentage)} เปอร์เซ็นต์" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(option.percentage)}"><span style="width:${Math.max(0,Math.min(100,Number(option.percentage)))}%"></span></div></div><span class="sv-live-score">${escHtml(score(option))}</span></article>`).join('')}</div><small>เปอร์เซ็นต์คำนวณจากคำตอบ option ที่ valid ของคำถามนี้ รวมตัวเลือกงดออกเสียงถ้ามี และไม่รวมคำถามที่ไม่ได้ตอบ</small></section>`).join('')}<div class="sv-live-disclaimer" role="note">ผลระหว่างกิจกรรม ยังไม่ใช่ผลประกาศอย่างเป็นทางการ</div></div>`;
}

export async function hydrateLiveResultImages(root) {
    clearLiveResultImages(root);
    const urls = new Set(); urlsByRoot.set(root, urls);
    await Promise.all([...root.querySelectorAll('[data-sv-live-file]')].map(async image => {
        try { const response = await API.get(`/safety-vote/files/${Number(image.dataset.svLiveFile)}`, { suppressErrorLog: true }); const url = URL.createObjectURL(await response.blob()); urls.add(url); image.src = url; }
        catch (_) { image.closest('.sv-live-image')?.remove(); }
    }));
}
