// public/js/pages/machine-safety.js
import { API, apiFetch } from '../api.js';
import * as UI from '../ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let _machines   = [];
let _depts      = [];
let _search     = '';
let _filterDept = '';
let _filterStatus = '';
let _isAdmin    = false;

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function loadMachineSafetyPage() {
    const container = document.getElementById('machine-safety-page');
    if (!container) return;

    const user = TSHSession.getUser();
    _isAdmin = user?.role === 'Admin' || user?.Role === 'Admin';

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-64 text-slate-400">
            <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลดข้อมูล...</p>
        </div>`;

    await Promise.all([_fetchMachines(), _fetchDepts()]);
    _renderPage(container);
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function _fetchMachines() {
    try {
        const res = await API.get('/machine-safety');
        _machines = res.data || [];
    } catch { _machines = []; }
}

async function _fetchDepts() {
    try {
        const res = await API.get('/master/departments');
        _depts = (res.data || []).map(d => d.Name);
    } catch { _depts = []; }
}

// ─── Render Page ──────────────────────────────────────────────────────────────
function _renderPage(container) {
    const total     = _machines.length;
    const compliant = _machines.filter(m => m.SafetyDeviceCount > 0 && m.LayoutCheckpointCount > 0).length;
    const partial   = _machines.filter(m => (m.SafetyDeviceCount > 0) !== (m.LayoutCheckpointCount > 0)).length;
    const none      = total - compliant - partial;
    const pct       = total ? Math.round(compliant * 100 / total) : 0;

    container.innerHTML = `
    <div class="max-w-5xl mx-auto space-y-6 animate-fade-in pb-10">

        <!-- Header -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background: linear-gradient(135deg, #059669, #059669);">
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                </div>
                <div>
                    <h1 class="text-xl font-bold text-slate-800">Machine Safety Devices</h1>
                    <p class="text-xs text-slate-400 mt-0.5">Safety Device Standard และ Layout & Checkpoint ของเครื่องจักร</p>
                </div>
            </div>
            ${_isAdmin ? `
            <button onclick="window._msdOpenAdd()" class="btn btn-primary flex items-center gap-2 text-sm px-4 py-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                เพิ่มเครื่องจักร
            </button>` : ''}
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="card p-4">
                <p class="text-xs text-slate-500 font-medium">เครื่องจักรทั้งหมด</p>
                <p class="text-3xl font-bold text-slate-800 mt-1">${total}</p>
            </div>
            <div class="card p-4 border-emerald-200">
                <p class="text-xs text-emerald-600 font-medium">มีครบทั้ง 2 รายการ</p>
                <p class="text-3xl font-bold text-emerald-600 mt-1">${compliant}</p>
                <p class="text-xs text-slate-400 mt-0.5">Safety Std. + Layout</p>
            </div>
            <div class="card p-4 border-amber-200">
                <p class="text-xs text-amber-600 font-medium">มีบางส่วน</p>
                <p class="text-3xl font-bold text-amber-600 mt-1">${partial}</p>
            </div>
            <div class="card p-4 border-blue-200">
                <p class="text-xs text-blue-600 font-medium">Compliance</p>
                <p class="text-3xl font-bold text-blue-600 mt-1">${pct}%</p>
                <div class="mt-2 w-full bg-slate-100 rounded-full h-1.5">
                    <div class="h-1.5 rounded-full" style="width:${pct}%; background:linear-gradient(90deg,#3b82f6,#06b6d4)"></div>
                </div>
            </div>
        </div>

        <!-- Legend -->
        <div class="flex flex-wrap gap-4 text-xs text-slate-500">
            <span class="flex items-center gap-1.5">
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 font-bold text-xs">✓</span>
                มีไฟล์แนบ
            </span>
            <span class="flex items-center gap-1.5">
                <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500 font-bold text-xs">✗</span>
                ยังไม่มีไฟล์
            </span>
            <span class="flex items-center gap-1.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">📁 ไฟล์</span>
                กดเพื่อดู/ดาวน์โหลด/ปริ้น
            </span>
        </div>

        <!-- Filter Bar -->
        <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
            <div class="relative flex-1 min-w-[180px]">
                <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input id="msd-search" type="text" placeholder="ค้นหาชื่อ / รหัสเครื่องจักร..."
                    value="${_search}"
                    class="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    oninput="window._msdFilter()">
            </div>
            <select id="msd-dept" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">ทุกแผนก</option>
                ${[...new Set(_machines.map(m => m.Department).filter(Boolean))].sort()
                    .map(d => `<option value="${d}" ${_filterDept===d?'selected':''}>${d}</option>`).join('')}
            </select>
            <select id="msd-status" class="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
                onchange="window._msdFilter()">
                <option value="">ทุกสถานะ</option>
                <option value="full" ${_filterStatus==='full'?'selected':''}>ครบทั้ง 2 รายการ</option>
                <option value="partial" ${_filterStatus==='partial'?'selected':''}>มีบางส่วน</option>
                <option value="none" ${_filterStatus==='none'?'selected':''}>ยังไม่มีเลย</option>
            </select>
            <span id="msd-count" class="text-xs text-slate-400 ml-auto"></span>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div id="msd-table-wrap" class="overflow-x-auto">
                ${_renderTable()}
            </div>
        </div>

    </div>`;

    _updateCount();
}

// ─── Table ────────────────────────────────────────────────────────────────────
function _renderTable() {
    const filtered = _getFiltered();

    if (filtered.length === 0) {
        return `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="font-medium">ไม่พบข้อมูลเครื่องจักร</p>
        </div>`;
    }

    const rows = filtered.map(m => {
        const hasSafety  = m.SafetyDeviceCount > 0;
        const hasLayout  = m.LayoutCheckpointCount > 0;
        const isFull     = hasSafety && hasLayout;
        const isPartial  = hasSafety !== hasLayout;

        const statusBadge = isFull
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✅ ครบ</span>`
            : isPartial
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⚠️ บางส่วน</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-500">❌ ไม่มี</span>`;

        const tick = (v) => v
            ? `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">✓</span>`
            : `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500 text-xs font-bold">✗</span>`;

        const tickRisk = m.HasRiskAssessment
            ? `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">✓</span>`
            : `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-xs font-bold">✗</span>`;

        const updated = m.UpdatedAt
            ? new Date(m.UpdatedAt).toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'2-digit' })
            : '—';

        // File buttons — linked together, open modal with both sections
        const fileBtn = `
            <button onclick="window._msdOpenFiles(${m.id}, '${_esc(m.MachineName)}')"
                title="Safety Device Standard (${m.SafetyDeviceCount} ไฟล์)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-l-lg text-xs font-medium border-y border-l transition-colors
                ${hasSafety ? 'border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Std.${hasSafety ? ` (${m.SafetyDeviceCount})` : ''}
            </button><button onclick="window._msdOpenFiles(${m.id}, '${_esc(m.MachineName)}', 'LayoutCheckpoint')"
                title="Layout & Checkpoint (${m.LayoutCheckpointCount} ไฟล์)"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-r-lg text-xs font-medium border transition-colors
                ${hasLayout ? 'border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                Layout${hasLayout ? ` (${m.LayoutCheckpointCount})` : ''}
            </button>`;

        const adminBtns = _isAdmin ? `
            <button onclick="window._msdOpenEdit(${m.id})"
                class="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="แก้ไข">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="window._msdDelete(${m.id}, '${_esc(m.MachineName)}')"
                class="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>` : '';

        return `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 text-sm font-mono text-slate-600 whitespace-nowrap">${m.MachineCode}</td>
            <td class="px-4 py-3 min-w-[160px]">
                <p class="text-sm font-medium text-slate-800">${m.MachineName}</p>
                ${m.Remark ? `<p class="text-xs text-slate-400 truncate max-w-[200px]">${m.Remark}</p>` : ''}
            </td>
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${m.Department || '—'}</td>
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${m.Area || '—'}</td>
            <td class="px-4 py-3 text-center">${tickRisk}</td>
            <td class="px-4 py-3 text-center">${tick(hasSafety)}</td>
            <td class="px-4 py-3 text-center">${tick(hasLayout)}</td>
            <td class="px-4 py-3 text-center">${statusBadge}</td>
            <td class="px-4 py-3 whitespace-nowrap">${fileBtn}</td>
            <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${updated}</td>
            ${_isAdmin ? `<td class="px-4 py-3"><div class="flex items-center gap-1">${adminBtns}</div></td>` : ''}
        </tr>`;
    }).join('');

    return `<table class="w-full text-left border-collapse">
        <thead>
            <tr class="bg-slate-50 border-b-2 border-slate-200">
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">รหัส</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ชื่อเครื่องจักร</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">แผนก</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">พื้นที่</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">ประเมินความเสี่ยง</th>
                <th class="px-4 py-3 text-xs font-semibold text-blue-500 uppercase tracking-wide text-center whitespace-nowrap">Safety Device Std.</th>
                <th class="px-4 py-3 text-xs font-semibold text-purple-500 uppercase tracking-wide text-center whitespace-nowrap">Layout & Checkpoint</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">สถานะรวม</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">ไฟล์แนบ</th>
                <th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">อัปเดต</th>
                ${_isAdmin ? `<th class="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">จัดการ</th>` : ''}
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function _getFiltered() {
    return _machines.filter(m => {
        if (_search) {
            const q = _search.toLowerCase();
            if (!m.MachineName.toLowerCase().includes(q) && !m.MachineCode.toLowerCase().includes(q)) return false;
        }
        if (_filterDept && m.Department !== _filterDept) return false;
        const hasSafety = m.SafetyDeviceCount > 0;
        const hasLayout = m.LayoutCheckpointCount > 0;
        if (_filterStatus === 'full'    && !(hasSafety && hasLayout)) return false;
        if (_filterStatus === 'partial' && hasSafety === hasLayout)   return false;
        if (_filterStatus === 'none'    && (hasSafety || hasLayout))  return false;
        return true;
    });
}

function _updateCount() {
    const el = document.getElementById('msd-count');
    if (el) el.textContent = `แสดง ${_getFiltered().length} / ${_machines.length} รายการ`;
}

window._msdFilter = function() {
    _search       = document.getElementById('msd-search')?.value || '';
    _filterDept   = document.getElementById('msd-dept')?.value   || '';
    _filterStatus = document.getElementById('msd-status')?.value || '';
    const wrap = document.getElementById('msd-table-wrap');
    if (wrap) wrap.innerHTML = _renderTable();
    _updateCount();
};

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
function _deptOptions(selected = '') {
    const all = [...new Set([..._depts, ...(_machines.map(m => m.Department).filter(Boolean))])].sort();
    return all.map(d => `<option value="${d}" ${d === selected ? 'selected' : ''}>${d}</option>`).join('');
}

function _machineFormHtml(m = {}) {
    return `
    <form id="msd-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รหัสเครื่องจักร <span class="text-red-500">*</span></label>
                <input name="MachineCode" required value="${m.MachineCode || ''}" placeholder="เช่น MC-001"
                    class="form-input w-full">
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อเครื่องจักร <span class="text-red-500">*</span></label>
                <input name="MachineName" required value="${m.MachineName || ''}" placeholder="ชื่อเครื่องจักร"
                    class="form-input w-full">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
                <select name="Department"
                    class="form-input w-full">
                    <option value="">— เลือกแผนก —</option>
                    ${_deptOptions(m.Department || '')}
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">พื้นที่ / Line</label>
                <input name="Area" value="${m.Area || ''}" placeholder="เช่น Line A, Zone 2"
                    class="form-input w-full">
            </div>
        </div>

        <div class="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="HasRiskAssessment" ${m.HasRiskAssessment ? 'checked' : ''}
                    class="w-4 h-4 rounded accent-emerald-500">
                <span class="text-sm text-slate-700">มีการประเมินความเสี่ยง (Risk Assessment)</span>
            </label>
        </div>

        <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Remark" rows="2" placeholder="หมายเหตุเพิ่มเติม"
                class="form-textarea w-full resize-none">${m.Remark || ''}</textarea>
        </div>

        <div id="msd-form-error" class="text-sm text-red-500 hidden"></div>

        <div class="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button type="button" onclick="window._UI_closeModal()"
                class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`;
}

function _formBody(formEl) {
    const fd = new FormData(formEl);
    return {
        MachineCode:      fd.get('MachineCode'),
        MachineName:      fd.get('MachineName'),
        Department:       fd.get('Department'),
        Area:             fd.get('Area'),
        HasRiskAssessment: fd.get('HasRiskAssessment') === 'on',
        Remark:           fd.get('Remark'),
    };
}

window._msdOpenAdd = function() {
    UI.openModal('เพิ่มเครื่องจักร', _machineFormHtml());
    setTimeout(() => {
        document.getElementById('msd-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await API.post('/machine-safety', _formBody(e.target));
                UI.closeModal();
                UI.showToast('เพิ่มเครื่องจักรสำเร็จ', 'success');
                await _fetchMachines();
                _renderPage(document.getElementById('machine-safety-page'));
            } catch (err) {
                _showFormErr(err.message);
            }
        });
    }, 50);
};

window._msdOpenEdit = function(id) {
    const m = _machines.find(x => x.id === id);
    if (!m) return;
    UI.openModal('แก้ไขข้อมูลเครื่องจักร', _machineFormHtml(m));
    setTimeout(() => {
        document.getElementById('msd-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await apiFetch(`/machine-safety/${id}`, { method: 'PUT', body: JSON.stringify(_formBody(e.target)) });
                UI.closeModal();
                UI.showToast('อัปเดตสำเร็จ', 'success');
                await _fetchMachines();
                _renderPage(document.getElementById('machine-safety-page'));
            } catch (err) {
                _showFormErr(err.message);
            }
        });
    }, 50);
};

function _showFormErr(msg) {
    const el = document.getElementById('msd-form-error');
    if (el) { el.textContent = msg || 'เกิดข้อผิดพลาด'; el.classList.remove('hidden'); }
}

// ─── Delete ───────────────────────────────────────────────────────────────────
window._msdDelete = async function(id, name) {
    if (!confirm(`ลบ "${name}" ?\nไฟล์แนบทั้งหมดจะถูกลบด้วย`)) return;
    try {
        await apiFetch(`/machine-safety/${id}`, { method: 'DELETE' });
        UI.showToast('ลบสำเร็จ', 'success');
        await _fetchMachines();
        _renderPage(document.getElementById('machine-safety-page'));
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── Files Modal ──────────────────────────────────────────────────────────────
// defaultTab: 'SafetyDeviceStandard' | 'LayoutCheckpoint'
window._msdOpenFiles = async function(machineId, machineName, defaultTab = 'SafetyDeviceStandard') {
    UI.openModal(`📁 ไฟล์แนบ — ${machineName}`, `
        <div id="msd-files-body">
            <div class="flex justify-center py-8">
                <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
            </div>
        </div>`);

    const filesRes = await API.get(`/machine-safety/${machineId}/files`);
    const files    = filesRes.data || [];

    const safetyFiles  = files.filter(f => f.FileCategory === 'SafetyDeviceStandard');
    const layoutFiles  = files.filter(f => f.FileCategory === 'LayoutCheckpoint');

    const body = document.getElementById('msd-files-body');
    if (!body) return;

    body.innerHTML = `
        <!-- Tabs -->
        <div class="flex border-b border-slate-200 mb-4">
            <button id="tab-safety" onclick="window._msdSwitchTab('SafetyDeviceStandard')"
                class="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
                ${defaultTab==='SafetyDeviceStandard' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                <span class="flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Safety Device Standard
                    <span class="ml-1 px-1.5 py-0.5 rounded-full text-xs ${safetyFiles.length ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}">${safetyFiles.length}</span>
                </span>
            </button>
            <button id="tab-layout" onclick="window._msdSwitchTab('LayoutCheckpoint')"
                class="px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
                ${defaultTab==='LayoutCheckpoint' ? 'border-purple-500 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}">
                <span class="flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"/></svg>
                    Layout & Checkpoint
                    <span class="ml-1 px-1.5 py-0.5 rounded-full text-xs ${layoutFiles.length ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400'}">${layoutFiles.length}</span>
                </span>
            </button>
        </div>

        <!-- Tab panels -->
        <div id="panel-SafetyDeviceStandard" class="${defaultTab==='SafetyDeviceStandard'?'':'hidden'}">
            ${_fileList(safetyFiles, machineId, machineName, 'SafetyDeviceStandard')}
        </div>
        <div id="panel-LayoutCheckpoint" class="${defaultTab==='LayoutCheckpoint'?'':'hidden'}">
            ${_fileList(layoutFiles, machineId, machineName, 'LayoutCheckpoint')}
        </div>
    `;

    if (_isAdmin) _attachUploadHandlers(machineId, machineName);
};

window._msdSwitchTab = function(tab) {
    ['SafetyDeviceStandard','LayoutCheckpoint'].forEach(t => {
        const btn   = document.getElementById(t === 'SafetyDeviceStandard' ? 'tab-safety' : 'tab-layout');
        const panel = document.getElementById(`panel-${t}`);
        if (btn && panel) {
            const active = t === tab;
            panel.classList.toggle('hidden', !active);
            const color = t === 'SafetyDeviceStandard' ? 'blue' : 'purple';
            btn.className = `px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${active
                ? `border-${color}-500 text-${color}-600`
                : 'border-transparent text-slate-500 hover:text-slate-700'}`;
        }
    });
};

function _fileList(files, machineId, machineName, category) {
    const color   = category === 'SafetyDeviceStandard' ? 'blue' : 'purple';
    const catLabel = category === 'SafetyDeviceStandard' ? 'Safety Device Standard' : 'Layout & Checkpoint';

    const list = files.length === 0
        ? `<p class="text-center text-slate-400 py-6 text-sm">ยังไม่มีไฟล์ ${catLabel}</p>`
        : `<ul class="divide-y divide-slate-100 mb-4">
            ${files.map(f => `
            <li class="flex items-center justify-between py-3 gap-3">
                <div class="flex items-center gap-2 min-w-0">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-${color}-50">
                        <svg class="w-4 h-4 text-${color}-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <div class="min-w-0">
                        <p class="text-sm font-medium text-slate-700 truncate">${f.FileLabel || 'ไฟล์'}</p>
                        <p class="text-xs text-slate-400">${f.UploadedBy} · ${new Date(f.UploadedAt).toLocaleDateString('th-TH')}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <a href="${f.FileUrl}" target="_blank" rel="noopener"
                        class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors bg-${color}-50 text-${color}-600 hover:bg-${color}-100">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        ดาวน์โหลด / ปริ้น
                    </a>
                    ${_isAdmin ? `<button onclick="window._msdDeleteFile(${f.id}, ${machineId}, '${_esc(machineName)}', '${category}')"
                        class="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบไฟล์">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>` : ''}
                </div>
            </li>`).join('')}
        </ul>`;

    const uploadForm = _isAdmin ? `
        <div class="border-t border-slate-200 pt-4">
            <p class="text-sm font-semibold text-slate-700 mb-3">อัปโหลดไฟล์ ${catLabel}</p>
            <form id="upload-form-${category}" data-category="${category}" class="space-y-3">
                <input name="FileLabel" placeholder="ชื่อ / คำอธิบาย เช่น Standard v2.1"
                    class="form-input w-full">
                <input type="file" name="file" required
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                    class="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-${color}-50 file:text-${color}-600 hover:file:bg-${color}-100">
                <div class="upload-error-${category} text-sm text-red-500 hidden"></div>
                <div class="flex justify-end">
                    <button type="submit" class="btn btn-primary px-4">อัปโหลด</button>
                </div>
            </form>
        </div>` : '';

    return list + uploadForm;
}

function _attachUploadHandlers(machineId, machineName) {
    ['SafetyDeviceStandard', 'LayoutCheckpoint'].forEach(cat => {
        const form = document.getElementById(`upload-form-${cat}`);
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            fd.append('FileCategory', cat);
            const btn = e.target.querySelector('button[type=submit]');
            btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...';
            try {
                await apiFetch(`/machine-safety/${machineId}/files`, { method: 'POST', body: fd });
                UI.showToast('อัปโหลดสำเร็จ', 'success');
                await _fetchMachines();
                window._msdOpenFiles(machineId, machineName, cat);
            } catch (err) {
                const errEl = form.querySelector(`.upload-error-${cat}`);
                if (errEl) { errEl.textContent = err.message || 'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
                btn.disabled = false; btn.textContent = 'อัปโหลด';
            }
        });
    });
}

window._msdDeleteFile = async function(fileId, machineId, machineName, category) {
    if (!confirm('ลบไฟล์นี้?')) return;
    try {
        await apiFetch(`/machine-safety/files/${fileId}`, { method: 'DELETE' });
        UI.showToast('ลบไฟล์สำเร็จ', 'success');
        await _fetchMachines();
        window._msdOpenFiles(machineId, machineName, category);
    } catch (err) {
        UI.showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
window._UI_closeModal = () => UI.closeModal();

function _esc(str) {
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
