// public/js/pages/yokoten.js
import * as UI from '../ui.js';
import { apiFetch } from '../api.js';

// ─── Global helpers for inline onclick ────────────────────────────────────────
window._UI_closeModal = () => UI.closeModal();

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['ทั่วไป', 'อุปกรณ์', 'กระบวนการ', 'สิ่งแวดล้อม', 'พฤติกรรม'];
const RISK_LEVELS = [
    { value: 'Low',      label: 'ต่ำ',    color: 'emerald' },
    { value: 'Medium',   label: 'ปานกลาง', color: 'yellow'  },
    { value: 'High',     label: 'สูง',     color: 'orange'  },
    { value: 'Critical', label: 'วิกฤต',  color: 'red'     },
];

const RISK_BADGE = {
    Low:      '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">ต่ำ</span>',
    Medium:   '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">ปานกลาง</span>',
    High:     '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">สูง</span>',
    Critical: '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">วิกฤต</span>',
};

// ─── State ────────────────────────────────────────────────────────────────────
let _topics      = [];
let _history     = [];
let _isAdmin     = false;
let _activeTab   = 'topics';
let _filterRisk  = '';
let _filterAck   = '';

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function loadYokotenPage() {
    const container = document.getElementById('yokoten-page');
    if (!container) return;

    const user = window.TSHSession?.getUser() || {};
    _isAdmin = (user.role === 'Admin' || user.Role === 'Admin');

    container.innerHTML = `
        <div class="animate-fade-in space-y-6">
            <!-- Header -->
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                              style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347A3.001 3.001 0 0112 21a3.001 3.001 0 01-2.789-4.1l-.347-.347z"/>
                            </svg>
                        </span>
                        Yokoten
                    </h1>
                    <p class="text-sm text-slate-500 mt-1 ml-11">แบ่งปันบทเรียนและความรู้ด้านความปลอดภัย</p>
                </div>
                ${_isAdmin ? `
                <button onclick="window._yokAddTopic()"
                    class="btn btn-primary flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    เพิ่มหัวข้อใหม่
                </button>` : ''}
            </div>

            <!-- Tabs -->
            <div class="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
                <button onclick="window._yokSetTab('topics')" id="tab-topics"
                    class="yok-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    หัวข้อ Yokoten
                </button>
                <button onclick="window._yokSetTab('history')" id="tab-history"
                    class="yok-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    ประวัติแผนก
                </button>
                ${_isAdmin ? `
                <button onclick="window._yokSetTab('admin')" id="tab-admin"
                    class="yok-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    จัดการหัวข้อ
                </button>` : ''}
            </div>

            <!-- Tab Content -->
            <div id="yok-content"></div>
        </div>
    `;

    await refreshData();
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function refreshData() {
    UI.showLoading('กำลังโหลด...');
    try {
        const [topicsRes, histRes] = await Promise.all([
            apiFetch('/yokoten/topics'),
            apiFetch('/yokoten/dept-history'),
        ]);
        _topics  = topicsRes.data  || [];
        _history = histRes.data || [];
    } catch (err) {
        UI.showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        UI.hideLoading();
    }
    renderTab(_activeTab);
}

// ─── Tab Router ───────────────────────────────────────────────────────────────
window._yokSetTab = (tab) => {
    _activeTab = tab;
    document.querySelectorAll('.yok-tab').forEach(btn => {
        const active = btn.id === `tab-${tab}`;
        btn.className = `yok-tab px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            active ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm font-semibold'
                   : 'text-slate-500 hover:text-slate-700'
        }`;
    });
    renderTab(tab);
};

function renderTab(tab) {
    // Activate correct tab button
    window._yokSetTab(tab);
    const content = document.getElementById('yok-content');
    if (!content) return;

    if (tab === 'topics')  content.innerHTML = buildTopicsHtml();
    if (tab === 'history') content.innerHTML = buildHistoryHtml();
    if (tab === 'admin' && _isAdmin) content.innerHTML = buildAdminHtml();

    // Re-attach acknowledge form listeners
    if (tab === 'topics') {
        document.querySelectorAll('.yok-ack-form').forEach(f =>
            f.addEventListener('submit', handleAcknowledge)
        );
    }
}

// ─── TOPICS TAB ───────────────────────────────────────────────────────────────
function buildTopicsHtml() {
    // Summary stats
    const total  = _topics.length;
    const acked  = _topics.filter(t => t.myResponse).length;
    const pending = total - acked;
    const nearDeadline = _topics.filter(t => !t.myResponse && isNearDeadline(t.Deadline)).length;

    const statsHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            ${kpiCard('หัวข้อทั้งหมด', total, 'slate')}
            ${kpiCard('รับทราบแล้ว', acked, 'emerald')}
            ${kpiCard('รอการรับทราบ', pending, 'yellow')}
            ${kpiCard('ใกล้ครบกำหนด', nearDeadline, 'red')}
        </div>
    `;

    // Filter bar
    const filterHtml = `
        <div class="card p-4 mb-4 flex flex-wrap gap-3 items-center">
            <span class="text-sm font-medium text-slate-600">กรอง:</span>
            <select onchange="window._yokFilterRisk(this.value)"
                class="form-input text-sm py-1.5 rounded-lg w-40">
                <option value="">ทุกระดับความเสี่ยง</option>
                ${RISK_LEVELS.map(r => `<option value="${r.value}" ${_filterRisk===r.value?'selected':''}>${r.label}</option>`).join('')}
            </select>
            <select onchange="window._yokFilterAck(this.value)"
                class="form-input text-sm py-1.5 rounded-lg w-44">
                <option value="">ทุกสถานะ</option>
                <option value="pending" ${_filterAck==='pending'?'selected':''}>รอรับทราบ</option>
                <option value="acked"   ${_filterAck==='acked'?'selected':''}>รับทราบแล้ว</option>
            </select>
        </div>
    `;

    let filtered = _topics;
    if (_filterRisk) filtered = filtered.filter(t => t.RiskLevel === _filterRisk);
    if (_filterAck === 'pending') filtered = filtered.filter(t => !t.myResponse);
    if (_filterAck === 'acked')   filtered = filtered.filter(t => !!t.myResponse);

    const topicsHtml = filtered.length
        ? filtered.map(t => topicCard(t)).join('')
        : `<div class="card p-8 text-center text-slate-400">ไม่มีหัวข้อที่ตรงกับเงื่อนไข</div>`;

    return statsHtml + filterHtml + `<div class="space-y-4">${topicsHtml}</div>`;
}

window._yokFilterRisk = v => { _filterRisk = v; renderTab('topics'); };
window._yokFilterAck  = v => { _filterAck  = v; renderTab('topics'); };

function topicCard(t) {
    const acked = !!t.myResponse;
    const dateIssued = fmtDate(t.DateIssued);
    const deadlineHtml = t.Deadline ? deadlineBadge(t.Deadline, acked) : '';
    const deptCount = t.deptResponseCount || 0;

    const responseArea = acked
        ? `<div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
               <div class="flex items-center gap-2 text-sm">
                   <svg class="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                   </svg>
                   <span class="font-semibold text-emerald-600">รับทราบแล้ว</span>
                   <span class="text-slate-400">·</span>
                   <span class="${t.myResponse.IsRelated==='Yes'?'text-emerald-600':'text-slate-500'}">
                       ${t.myResponse.IsRelated==='Yes'?'เกี่ยวข้อง':'ไม่เกี่ยวข้อง'}
                   </span>
                   <span class="text-slate-400">·</span>
                   <span class="text-slate-500">${fmtDate(t.myResponse.ResponseDate)}</span>
               </div>
               ${t.myResponse.Comment ? `<p class="text-sm text-slate-600 mt-2 pl-6">${escapeHtml(t.myResponse.Comment)}</p>` : ''}
           </div>`
        : `<form class="yok-ack-form mt-4 pt-4 border-t border-slate-100 dark:border-slate-700"
                data-id="${t.YokotenID}">
               <p class="text-sm font-medium text-slate-700 mb-3">บันทึกการรับทราบ</p>
               <div class="flex gap-6 mb-3">
                   <label class="flex items-center gap-2 cursor-pointer text-sm">
                       <input type="radio" name="isRelated" value="Yes" class="accent-emerald-500"> เกี่ยวข้องกับแผนก
                   </label>
                   <label class="flex items-center gap-2 cursor-pointer text-sm">
                       <input type="radio" name="isRelated" value="No" checked class="accent-slate-400"> ไม่เกี่ยวข้อง
                   </label>
               </div>
               <textarea name="comment" rows="2" placeholder="ความคิดเห็น / การดำเนินการ (ถ้ามี)"
                   class="form-textarea w-full resize-none text-sm mb-3"></textarea>
               <div class="flex justify-end">
                   <button type="submit" class="btn btn-primary text-sm px-5">ยืนยันการรับทราบ</button>
               </div>
           </form>`;

    const attachHtml = t.AttachmentUrl
        ? `<a href="${t.AttachmentUrl}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:underline mt-1">
               <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                       d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
               </svg>
               ${escapeHtml(t.AttachmentName || 'ดูไฟล์แนบ')}
           </a>`
        : '';

    return `
        <div class="card p-5 border-l-4 ${acked ? 'border-emerald-400' : 'border-yellow-400'}">
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                        ${RISK_BADGE[t.RiskLevel] || RISK_BADGE.Low}
                        <span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">${escapeHtml(t.Category||'ทั่วไป')}</span>
                        ${deadlineHtml}
                    </div>
                    ${t.Title ? `<h3 class="font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(t.Title)}</h3>` : ''}
                    <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">${escapeHtml(t.TopicDescription)}</p>
                    ${attachHtml}
                    <p class="text-xs text-slate-400 mt-2">ประกาศ: ${dateIssued} · แผนกคุณตอบแล้ว ${deptCount} คน</p>
                </div>
                <div class="flex-shrink-0">
                    ${acked
                        ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                               <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
                               รับทราบ
                           </span>`
                        : `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                               <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
                               รอรับทราบ
                           </span>`
                    }
                </div>
            </div>
            ${responseArea}
        </div>
    `;
}

// ─── HISTORY TAB ──────────────────────────────────────────────────────────────
function buildHistoryHtml() {
    if (!_history.length) {
        return `<div class="card p-8 text-center text-slate-400">ยังไม่มีประวัติการตอบกลับของแผนกคุณ</div>`;
    }

    const rows = _history.map(r => `
        <tr class="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td class="px-4 py-3 text-sm">
                <div class="font-medium text-slate-800 dark:text-slate-100">${escapeHtml(r.Title || r.TopicDescription || '-')}</div>
                ${RISK_BADGE[r.RiskLevel] || ''}
            </td>
            <td class="px-4 py-3 text-sm">${escapeHtml(r.EmployeeName || r.EmployeeID)}</td>
            <td class="px-4 py-3 text-sm">
                <span class="${r.IsRelated==='Yes'?'text-emerald-600 font-medium':'text-slate-500'}">
                    ${r.IsRelated==='Yes'?'เกี่ยวข้อง':'ไม่เกี่ยวข้อง'}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-slate-500">${r.Comment ? escapeHtml(r.Comment) : '-'}</td>
            <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${fmtDate(r.ResponseDate)}</td>
        </tr>
    `).join('');

    return `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                <h3 class="font-semibold text-slate-700 dark:text-slate-200">ประวัติการตอบกลับของแผนก</h3>
                <p class="text-xs text-slate-400 mt-0.5">แสดง 100 รายการล่าสุด</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">หัวข้อ</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ชื่อพนักงาน</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ความเกี่ยวข้อง</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ความคิดเห็น</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">วันที่</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    `;
}

// ─── ADMIN TAB ────────────────────────────────────────────────────────────────
function buildAdminHtml() {
    const rows = _topics.map(t => `
        <tr class="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td class="px-4 py-3">
                <div class="font-medium text-slate-800 dark:text-slate-100 text-sm">${escapeHtml(t.Title || '-')}</div>
                <div class="text-xs text-slate-400 mt-0.5 line-clamp-1">${escapeHtml(t.TopicDescription)}</div>
            </td>
            <td class="px-4 py-3">${RISK_BADGE[t.RiskLevel] || RISK_BADGE.Low}</td>
            <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(t.Category||'ทั่วไป')}</td>
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${t.Deadline ? fmtDateOnly(t.Deadline) : '-'}</td>
            <td class="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">${fmtDate(t.DateIssued)}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium ${t.IsActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}">
                    ${t.IsActive ? 'ใช้งาน' : 'ปิดแล้ว'}
                </span>
            </td>
            <td class="px-4 py-3">
                <div class="flex gap-2">
                    <button onclick="window._yokEditTopic('${t.YokotenID}')"
                        class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">แก้ไข</button>
                    <button onclick="window._yokDeleteTopic('${t.YokotenID}','${escapeHtml(t.Title||t.TopicDescription).replace(/'/g,"\\'")}')"
                        class="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">ลบ</button>
                </div>
            </td>
        </tr>
    `).join('');

    return `
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700 dark:text-slate-200">รายการหัวข้อทั้งหมด</h3>
                <span class="text-xs text-slate-400">${_topics.length} หัวข้อ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">หัวข้อ</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ความเสี่ยง</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">หมวดหมู่</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ครบกำหนด</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">ประกาศ</th>
                            <th class="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">สถานะ</th>
                            <th class="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">ยังไม่มีหัวข้อ</td></tr>'}</tbody>
                </table>
            </div>
        </div>
    `;
}

// ─── ACKNOWLEDGE SUBMIT ───────────────────────────────────────────────────────
async function handleAcknowledge(e) {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
        await apiFetch('/yokoten/acknowledge', {
            method: 'POST',
            body: JSON.stringify({
                yokotenId: form.dataset.id,
                isRelated: form.isRelated.value,
                comment:   form.comment.value,
            }),
        });
        UI.showToast('บันทึกการรับทราบสำเร็จ', 'success');
        await refreshData();
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
        btn.disabled = false;
        btn.textContent = 'ยืนยันการรับทราบ';
    }
}

// ─── TOPIC FORM (ADD / EDIT) ──────────────────────────────────────────────────
window._yokAddTopic  = () => openTopicForm(null);
window._yokEditTopic = (id) => {
    const t = _topics.find(x => x.YokotenID === id);
    if (t) openTopicForm(t);
};

function openTopicForm(topic) {
    const isEdit = !!topic;
    const title  = isEdit ? escapeHtml(topic.Title || '')            : '';
    const desc   = isEdit ? escapeHtml(topic.TopicDescription || '') : '';
    const cat    = isEdit ? (topic.Category || 'ทั่วไป')             : 'ทั่วไป';
    const risk   = isEdit ? (topic.RiskLevel || 'Low')               : 'Low';
    const dl     = isEdit ? (topic.Deadline ? fmtDateOnly(topic.Deadline) : '') : '';
    const atch   = isEdit ? (topic.AttachmentUrl || '')              : '';
    const atchN  = isEdit ? (topic.AttachmentName || '')             : '';
    const active = isEdit ? !!topic.IsActive                         : true;

    const catOpts   = CATEGORIES.map(c => `<option value="${c}" ${cat===c?'selected':''}>${c}</option>`).join('');
    const riskOpts  = RISK_LEVELS.map(r => `<option value="${r.value}" ${risk===r.value?'selected':''}>${r.label}</option>`).join('');

    const html = `
        <form id="yok-topic-form" class="space-y-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">ชื่อหัวข้อ (ย่อ)</label>
                <input id="yt-title" type="text" value="${title}" maxlength="200"
                    placeholder="เช่น: อุบัติเหตุเครื่องปั๊ม ไลน์ B"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">รายละเอียด <span class="text-red-500">*</span></label>
                <textarea id="yt-desc" rows="4" required
                    placeholder="อธิบายบทเรียน / เหตุการณ์ / ความรู้ที่ต้องการแบ่งปัน"
                    class="form-textarea w-full resize-none">${desc}</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">หมวดหมู่</label>
                    <select id="yt-cat" class="form-input w-full">${catOpts}</select>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">ระดับความเสี่ยง</label>
                    <select id="yt-risk" class="form-input w-full">${riskOpts}</select>
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">วันครบกำหนดรับทราบ</label>
                <input id="yt-deadline" type="date" value="${dl}" class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">ลิงก์ไฟล์แนบ (URL)</label>
                <input id="yt-attach" type="url" value="${atch}"
                    placeholder="https://..."
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">ชื่อไฟล์แนบ</label>
                <input id="yt-attachname" type="text" value="${atchN}"
                    placeholder="เช่น: รายงานการสอบสวน.pdf"
                    class="form-input w-full">
            </div>
            ${isEdit ? `
            <div class="flex items-center gap-3">
                <input id="yt-active" type="checkbox" ${active?'checked':''} class="w-4 h-4 accent-emerald-500">
                <label for="yt-active" class="text-sm font-semibold text-slate-700 dark:text-slate-300">แสดงหัวข้อนี้ (ใช้งาน)</label>
            </div>` : ''}

            <div id="yt-error" class="text-sm text-red-500 font-medium hidden"></div>

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onclick="window._UI_closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
                <button type="submit" id="yt-submit" class="btn btn-primary px-5">
                    ${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ'}
                </button>
            </div>
        </form>
    `;

    UI.openModal(isEdit ? 'แก้ไขหัวข้อ Yokoten' : 'เพิ่มหัวข้อ Yokoten', html, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('yok-topic-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl  = document.getElementById('yt-error');
            const submit = document.getElementById('yt-submit');
            const desc2  = document.getElementById('yt-desc').value.trim();
            if (!desc2) {
                errEl.textContent = 'กรุณากรอกรายละเอียดหัวข้อ';
                errEl.classList.remove('hidden');
                return;
            }
            errEl.classList.add('hidden');
            submit.disabled = true;
            submit.textContent = 'กำลังบันทึก...';

            const payload = {
                Title:           document.getElementById('yt-title').value.trim() || null,
                TopicDescription: desc2,
                Category:        document.getElementById('yt-cat').value,
                RiskLevel:       document.getElementById('yt-risk').value,
                Deadline:        document.getElementById('yt-deadline').value || null,
                AttachmentUrl:   document.getElementById('yt-attach').value.trim() || null,
                AttachmentName:  document.getElementById('yt-attachname').value.trim() || null,
            };
            if (isEdit) {
                payload.IsActive = document.getElementById('yt-active').checked ? 1 : 0;
            }

            try {
                if (isEdit) {
                    await apiFetch(`/yokoten/topics/${topic.YokotenID}`, {
                        method: 'PUT', body: JSON.stringify(payload),
                    });
                } else {
                    await apiFetch('/yokoten/topics', {
                        method: 'POST', body: JSON.stringify(payload),
                    });
                }
                UI.closeModal();
                UI.showToast(isEdit ? 'อัปเดตหัวข้อสำเร็จ' : 'เพิ่มหัวข้อสำเร็จ', 'success');
                await refreshData();
                if (_isAdmin) renderTab('admin');
            } catch (err) {
                errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
                errEl.classList.remove('hidden');
                submit.disabled = false;
                submit.textContent = isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อ';
            }
        });
    }, 50);
}

// ─── DELETE TOPIC ─────────────────────────────────────────────────────────────
window._yokDeleteTopic = async (id, label) => {
    if (!confirm(`ลบหัวข้อ "${label}" ?\n(หากมีการตอบกลับแล้ว ระบบจะปิดหัวข้อแทนการลบ)`)) return;
    try {
        await apiFetch(`/yokoten/topics/${id}`, { method: 'DELETE' });
        UI.showToast('ดำเนินการสำเร็จ', 'success');
        await refreshData();
        renderTab('admin');
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isNearDeadline(deadline) {
    if (!deadline) return false;
    const diff = new Date(deadline) - new Date();
    return diff > 0 && diff < 3 * 86400000; // within 3 days
}

function deadlineBadge(deadline, acked) {
    if (!deadline) return '';
    const d = new Date(deadline);
    const now = new Date();
    const diff = d - now;
    if (acked) return '';
    if (diff < 0)         return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">เกินกำหนด</span>`;
    if (diff < 86400000)  return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 animate-pulse">ครบกำหนดวันนี้</span>`;
    if (diff < 3*86400000)return `<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">ใกล้ครบกำหนด</span>`;
    return `<span class="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">กำหนด: ${fmtDateOnly(deadline)}</span>`;
}

function kpiCard(label, value, color) {
    const colors = {
        slate:   'from-slate-500 to-slate-600',
        emerald: 'from-emerald-500 to-teal-600',
        yellow:  'from-yellow-400 to-amber-500',
        red:     'from-red-500 to-rose-600',
    };
    return `
        <div class="card p-4">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-br ${colors[color]||colors.slate} mb-2 flex items-center justify-center">
                <span class="text-white text-base font-bold">${value}</span>
            </div>
            <p class="text-2xl font-bold text-slate-800 dark:text-slate-100">${value}</p>
            <p class="text-xs text-slate-500 mt-0.5">${label}</p>
        </div>
    `;
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtDateOnly(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
