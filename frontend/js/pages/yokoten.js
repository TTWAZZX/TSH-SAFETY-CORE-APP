// js/pages/yokoten.js

import { apiFetch } from '../api.js';
import { showLoading, hideLoading, showError, showInfoModal } from '../ui.js';

// ฟังก์ชันหลักสำหรับโหลดและแสดงผลหน้า Yokoten
export async function loadYokotenPage() {
    const container = document.getElementById('yokoten-page');
    // แสดง Loading placeholder ขณะดึงข้อมูล
    container.innerHTML = `<div class="card p-6 text-center text-slate-500">กำลังโหลดข้อมูล Yokoten...</div>`;

    try {
        const result = await apiFetch('/api/yokoten/pagedata');
        if (!result.success) {
            throw new Error(result.message);
        }
        renderYokotenUserView(container, result.data);
    } catch (error) {
        container.innerHTML = `<div class="card p-6 text-center text-red-500">ไม่สามารถโหลดข้อมูล Yokoten ได้: ${error.message}</div>`;
    } finally {
        hideLoading();
    }
}

// ฟังก์ชันสำหรับสร้าง HTML ของหน้า Yokoten จากข้อมูลที่ได้จาก API
function renderYokotenUserView(container, data) {
    const { allTopics, myHistory, userStats } = data;
    const historyMap = new Map((myHistory || []).map(h => [h.YokotenID, h]));

    // สร้างการ์ดสรุปผล
    const statsHtml = `
        <div class="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="card p-4"><p class="text-sm font-medium text-slate-500">ยังไม่ได้รับทราบ</p><p class="text-3xl font-bold text-yellow-600">${userStats.unacknowledgedCount} <span class="text-lg">หัวข้อ</span></p></div>
            <div class="card p-4"><p class="text-sm font-medium text-slate-500">รับทราบแล้ว</p><p class="text-3xl font-bold text-green-600">${userStats.acknowledgedCount} <span class="text-lg">หัวข้อ</span></p></div>
            <div class="card p-4"><p class="text-sm font-medium text-slate-500">รับทราบล่าสุด</p><p class="text-2xl font-bold">${userStats.lastAcknowledgedDate}</p></div>
        </div>
    `;

    // สร้างการ์ดสำหรับแต่ละหัวข้อ
    const topicsHtml = allTopics && allTopics.length > 0 
        ? allTopics.map(topic => createTopicCard(topic, historyMap.get(topic.YokotenID))).join('') 
        : '<div class="card p-6 text-center">ยังไม่มีหัวข้อ Yokoten</div>';

    container.innerHTML = `
        ${statsHtml}
        <h2 class="text-xl font-bold mb-4">รายการ Yokoten</h2>
        <div class="space-y-4">
            ${topicsHtml}
        </div>
    `;

    // เพิ่ม Event Listener ให้กับทุกฟอร์มที่ถูกสร้างขึ้นมาใหม่
    document.querySelectorAll('.yokoten-ack-form').forEach(form => {
        form.addEventListener('submit', handleAcknowledgeSubmit);
    });
}

// ฟังก์ชันสำหรับสร้าง HTML ของการ์ด Yokoten หนึ่งใบ
function createTopicCard(topic, myResponse) {
    const isAcknowledged = !!myResponse;
    const topicDate = new Date(topic.DateIssued).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

    // ส่วนแสดงสถานะ (รับทราบแล้ว/รอ)
    const statusHtml = isAcknowledged
        ? `<div class="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg> รับทราบแล้ว</div>`
        : `<div class="text-yellow-600 dark:text-yellow-400 font-semibold">รอการรับทราบ</div>`;

    // ส่วนแสดงฟอร์ม หรือข้อมูลที่เคยตอบไปแล้ว
    const responseAreaHtml = isAcknowledged
        ? `
        <p class="text-sm"><strong>การตอบกลับของคุณ:</strong> <span class="font-semibold ${myResponse.IsRelated === 'Yes' ? 'text-blue-600' : 'text-red-600'}">${myResponse.IsRelated === 'Yes' ? 'เกี่ยวข้อง' : 'ไม่เกี่ยวข้อง'}</span></p>
        ${myResponse.Comment ? `<p class="text-sm mt-1"><strong>ความคิดเห็น:</strong> ${myResponse.Comment}</p>` : ''}
        <p class="text-xs text-slate-500 mt-2">บันทึกเมื่อ: ${new Date(myResponse.ResponseDate).toLocaleString('th-TH')}</p>
        `
        : `
        <form class="yokoten-ack-form" data-yokoten-id="${topic.YokotenID}">
            <div class="space-y-3">
                <div>
                    <label class="text-sm font-medium">หัวข้อนี้เกี่ยวข้องกับงานของคุณหรือไม่?</label>
                    <div class="mt-2 flex gap-4">
                        <label class="flex items-center"><input type="radio" name="isRelated" value="Yes" required class="form-checkbox h-4 w-4"><span class="ml-2">เกี่ยวข้อง</span></label>
                        <label class="flex items-center"><input type="radio" name="isRelated" value="No" class="form-checkbox h-4 w-4"><span class="ml-2">ไม่เกี่ยวข้อง</span></label>
                    </div>
                </div>
                <div>
                    <label class="text-sm font-medium">ความคิดเห็นเพิ่มเติม (ถ้ามี)</label>
                    <textarea name="comment" rows="2" class="w-full mt-1 form-textarea"></textarea>
                </div>
                <div class="text-right">
                    <button type="submit" class="btn btn-primary">ยืนยันการรับทราบ</button>
                </div>
            </div>
        </form>
        `;

    return `
    <div id="yokoten-card-${topic.YokotenID}" class="card p-5 transition-all duration-300">
        <div class="flex justify-between items-start gap-4">
            <div class="flex-grow">
                <p class="text-sm text-slate-500 dark:text-slate-400">วันที่ประกาศ: ${topicDate}</p>
                <p class="text-lg font-semibold mt-1">${topic.TopicDescription}</p>
                ${topic.SourceAccidentID ? `<span class="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">อ้างอิง: ${topic.SourceAccidentID}</span>` : ''}
            </div>
            <div class="flex-shrink-0" id="status-container-${topic.YokotenID}">
                ${statusHtml}
            </div>
        </div>
        ${topic.AttachmentLink ? `<a href="${topic.AttachmentLink}" target="_blank" rel="noopener noreferrer" class="mt-4 btn btn-secondary"> <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg> ดูไฟล์แนบ</a>` : ''}
        
        <div class="mt-4 pt-4 border-t dark:border-slate-700" id="response-area-${topic.YokotenID}">
            ${responseAreaHtml}
        </div>
    </div>
    `;
}

// ฟังก์ชันสำหรับจัดการเมื่อผู้ใช้กดยืนยันการรับทราบ
async function handleAcknowledgeSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mx-auto"></div>';

    const formData = new FormData(form);
    const responseData = {
        yokotenId: form.dataset.yokotenId,
        isRelated: formData.get('isRelated'),
        comment: formData.get('comment')
    };

    try {
        const res = await apiFetch('/api/yokoten/acknowledge', {
            method: 'POST',
            body: responseData
        });

        if (res.status === 'success') {
            showInfoModal('สำเร็จ', 'บันทึกการรับทราบเรียบร้อยแล้ว');
            // โหลดหน้า Yokoten ใหม่เพื่ออัปเดตข้อมูลทั้งหมด
            loadYokotenPage();
        }
    } catch (error) {
        showError(error);
        btn.disabled = false;
        btn.textContent = 'ยืนยันการรับทราบ';
    }
}