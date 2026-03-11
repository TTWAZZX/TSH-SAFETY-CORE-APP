// js/pages/yokoten.js
import { API } from '../api.js';
import { showLoading, hideLoading, showError, showInfoModal } from '../ui.js';

// ฟังก์ชันหลักสำหรับโหลดและแสดงผลหน้า Yokoten
export async function loadYokotenPage() {
    const container = document.getElementById('yokoten-page');
    container.innerHTML = `<div class="card p-6 text-center text-slate-500">กำลังโหลดข้อมูล Yokoten...</div>`;

    try {
        // ✅ STEP A3
        const res = await API.get('/yokoten/pagedata');

        if (!res.success) {
            throw new Error(res.message || 'โหลดข้อมูล Yokoten ไม่สำเร็จ');
        }

        renderYokotenUserView(container, res.data);

    } catch (error) {
        container.innerHTML = `
            <div class="card p-6 text-center text-red-500">
                ไม่สามารถโหลดข้อมูล Yokoten ได้: ${error.message}
            </div>
        `;
    } finally {
        hideLoading();
    }
}

// ฟังก์ชันสำหรับสร้าง HTML ของหน้า Yokoten
function renderYokotenUserView(container, data) {
    const { allTopics = [], myHistory = [], userStats = {} } = data;
    const historyMap = new Map(myHistory.map(h => [h.YokotenID, h]));

    const statsHtml = `
        <div class="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="card p-4">
                <p class="text-sm text-slate-500">ยังไม่ได้รับทราบ</p>
                <p class="text-3xl font-bold text-yellow-600">${userStats.unacknowledgedCount || 0}</p>
            </div>
            <div class="card p-4">
                <p class="text-sm text-slate-500">รับทราบแล้ว</p>
                <p class="text-3xl font-bold text-green-600">${userStats.acknowledgedCount || 0}</p>
            </div>
            <div class="card p-4">
                <p class="text-sm text-slate-500">รับทราบล่าสุด</p>
                <p class="text-lg font-bold">${userStats.lastAcknowledgedDate || '-'}</p>
            </div>
        </div>
    `;

    const topicsHtml = allTopics.length
        ? allTopics.map(t => createTopicCard(t, historyMap.get(t.YokotenID))).join('')
        : `<div class="card p-6 text-center">ยังไม่มีหัวข้อ Yokoten</div>`;

    container.innerHTML = `
        ${statsHtml}
        <h2 class="text-xl font-bold mb-4">รายการ Yokoten</h2>
        <div class="space-y-4">${topicsHtml}</div>
    `;

    document.querySelectorAll('.yokoten-ack-form')
        .forEach(form => form.addEventListener('submit', handleAcknowledgeSubmit));
}

// การ์ด Yokoten
function createTopicCard(topic, myResponse) {
    const isAcknowledged = !!myResponse;
    const topicDate = new Date(topic.DateIssued)
        .toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

    const statusHtml = isAcknowledged
        ? `<div class="text-green-600 font-semibold">✔ รับทราบแล้ว</div>`
        : `<div class="text-yellow-600 font-semibold">รอการรับทราบ</div>`;

    const responseAreaHtml = isAcknowledged
        ? `
            <p class="text-sm"><strong>การตอบกลับ:</strong>
                <span class="${myResponse.IsRelated === 'Yes' ? 'text-emerald-600' : 'text-red-600'}">
                    ${myResponse.IsRelated === 'Yes' ? 'เกี่ยวข้อง' : 'ไม่เกี่ยวข้อง'}
                </span>
            </p>
            ${myResponse.Comment ? `<p class="text-sm mt-1">${myResponse.Comment}</p>` : ''}
        `
        : `
            <form class="yokoten-ack-form" data-yokoten-id="${topic.YokotenID}">
                <div class="space-y-3">
                    <div class="flex gap-4">
                        <label><input type="radio" name="isRelated" value="Yes" required> เกี่ยวข้อง</label>
                        <label><input type="radio" name="isRelated" value="No"> ไม่เกี่ยวข้อง</label>
                    </div>
                    <textarea name="comment" rows="2" class="w-full form-textarea"></textarea>
                    <div class="text-right">
                        <button type="submit" class="btn btn-primary">ยืนยันการรับทราบ</button>
                    </div>
                </div>
            </form>
        `;

    return `
        <div class="card p-5">
            <div class="flex justify-between">
                <div>
                    <p class="text-sm text-slate-500">วันที่ประกาศ: ${topicDate}</p>
                    <p class="text-lg font-semibold">${topic.TopicDescription}</p>
                </div>
                ${statusHtml}
            </div>
            <div class="mt-4 border-t pt-4">${responseAreaHtml}</div>
        </div>
    `;
}

// submit รับทราบ
async function handleAcknowledgeSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    btn.disabled = true;

    const data = {
        yokotenId: form.dataset.yokotenId,
        isRelated: form.isRelated.value,
        comment: form.comment.value
    };

    try {
        const res = await API.post('/yokoten/acknowledge', data);

        if (!res.success) throw new Error(res.message);

        showInfoModal('สำเร็จ', 'บันทึกการรับทราบเรียบร้อยแล้ว');
        loadYokotenPage();

    } catch (err) {
        showError(err);
        btn.disabled = false;
        btn.textContent = 'ยืนยันการรับทราบ';
    }
}
