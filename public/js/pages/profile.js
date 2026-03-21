// public/js/pages/profile.js
// ======================================================
// Profile Slide-over Drawer (Enterprise)
// ======================================================
import { apiFetch } from '../api.js';
import { showToast } from '../ui.js';

let _masterCache = null;

// ─── Public API ────────────────────────────────────────────────────────────────
export function openProfileDrawer() {
    _ensureDrawerDOM();
    _loadAndRender();
    const overlay = document.getElementById('profile-overlay');
    const drawer  = document.getElementById('profile-drawer');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
        drawer.classList.remove('translate-x-full');
        drawer.classList.add('translate-x-0');
    });
}

export function closeProfileDrawer() {
    const overlay = document.getElementById('profile-overlay');
    const drawer  = document.getElementById('profile-drawer');
    if (!drawer) return;
    drawer.classList.remove('translate-x-0');
    drawer.classList.add('translate-x-full');
    setTimeout(() => overlay?.classList.add('hidden'), 300);
}

// ─── DOM bootstrap ─────────────────────────────────────────────────────────────
function _ensureDrawerDOM() {
    if (document.getElementById('profile-overlay')) return;

    const tpl = document.createElement('div');
    tpl.innerHTML = `
    <!-- Profile Drawer Overlay -->
    <div id="profile-overlay" class="fixed inset-0 z-50 hidden">
        <!-- backdrop -->
        <div id="profile-backdrop" class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"></div>
        <!-- drawer panel -->
        <div id="profile-drawer"
             class="absolute top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl
                    transform translate-x-full transition-transform duration-300 ease-in-out flex flex-col">

            <!-- Header -->
            <div class="relative overflow-hidden flex-shrink-0"
                 style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
                <div class="absolute inset-0 opacity-10 pointer-events-none">
                    <svg width="100%" height="100%"><defs><pattern id="pd" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#pd)"/></svg>
                </div>
                <div class="relative z-10 p-5 flex items-start justify-between">
                    <div class="flex items-center gap-3">
                        <div id="profile-avatar"
                             class="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
                             style="background:rgba(255,255,255,0.18)">
                            ?
                        </div>
                        <div>
                            <p id="profile-header-name" class="text-white font-bold text-lg leading-tight">กำลังโหลด...</p>
                            <p id="profile-header-id" class="text-emerald-200 text-sm mt-0.5"></p>
                            <span id="profile-header-role"
                                  class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white">
                            </span>
                        </div>
                    </div>
                    <button id="profile-close-btn"
                            class="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Tabs -->
            <div class="flex border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <button data-ptab="info"
                        class="profile-tab-btn flex-1 py-3 text-sm font-medium text-emerald-600 border-b-2 border-emerald-500 transition-colors">
                    ข้อมูลส่วนตัว
                </button>
                <button data-ptab="password"
                        class="profile-tab-btn flex-1 py-3 text-sm font-medium text-slate-500 hover:text-slate-700 border-b-2 border-transparent transition-colors">
                    เปลี่ยนรหัสผ่าน
                </button>
            </div>

            <!-- Body (scrollable) -->
            <div class="flex-1 overflow-y-auto p-5">
                <!-- Info Tab -->
                <div id="profile-tab-info">
                    <div id="profile-form-wrap">
                        <div class="flex items-center justify-center py-12">
                            <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
                        </div>
                    </div>
                </div>
                <!-- Password Tab -->
                <div id="profile-tab-password" class="hidden">
                    <form id="profile-pw-form" class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                รหัสผ่านปัจจุบัน
                            </label>
                            <input id="ppw-current" type="password" required autocomplete="current-password"
                                   placeholder="กรอกรหัสผ่านปัจจุบัน"
                                   class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                รหัสผ่านใหม่
                            </label>
                            <input id="ppw-new" type="password" required autocomplete="new-password"
                                   placeholder="อย่างน้อย 6 ตัวอักษร"
                                   class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                ยืนยันรหัสผ่านใหม่
                            </label>
                            <input id="ppw-confirm" type="password" required autocomplete="new-password"
                                   placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                                   class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
                        </div>
                        <div id="ppw-error" class="hidden text-sm text-red-600 font-medium bg-red-50 rounded-xl px-3 py-2"></div>
                        <button type="submit"
                                class="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition"
                                style="background:linear-gradient(135deg,#064e3b,#0d9488)">
                            บันทึกรหัสผ่านใหม่
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(tpl.firstElementChild);

    // Event listeners
    document.getElementById('profile-backdrop')?.addEventListener('click', closeProfileDrawer);
    document.getElementById('profile-close-btn')?.addEventListener('click', closeProfileDrawer);
    document.querySelectorAll('.profile-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.dataset.ptab));
    });
    document.getElementById('profile-pw-form')?.addEventListener('submit', _handleChangePassword);
}

function _switchTab(tab) {
    document.querySelectorAll('.profile-tab-btn').forEach(b => {
        const active = b.dataset.ptab === tab;
        b.classList.toggle('text-emerald-600', active);
        b.classList.toggle('border-emerald-500', active);
        b.classList.toggle('text-slate-500', !active);
        b.classList.toggle('border-transparent', !active);
    });
    document.getElementById('profile-tab-info').classList.toggle('hidden', tab !== 'info');
    document.getElementById('profile-tab-password').classList.toggle('hidden', tab !== 'password');
}

// ─── Load data & render form ────────────────────────────────────────────────
async function _loadAndRender() {
    const wrap = document.getElementById('profile-form-wrap');
    if (wrap) wrap.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
        </div>`;

    try {
        const [profileRes, masterRes] = await Promise.all([
            apiFetch('/profile'),
            _getMaster().catch(() => ({ departments: [], positions: [] })),
        ]);
        const data = profileRes?.data;
        if (!data) throw new Error('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้ กรุณาลองใหม่');
        _renderHeader(data);
        _renderForm(data, masterRes || { departments: [], positions: [] });
    } catch (err) {
        if (wrap) wrap.innerHTML = `<p class="text-center text-red-500 py-8">${err.message || 'โหลดข้อมูลไม่ได้'}</p>`;
    }
}

function _renderHeader(data) {
    const initial = (data.EmployeeName || '?').charAt(0).toUpperCase();
    document.getElementById('profile-avatar').textContent = initial;
    document.getElementById('profile-header-name').textContent = data.EmployeeName || '-';
    document.getElementById('profile-header-id').textContent = `ID: ${data.EmployeeID}`;
    document.getElementById('profile-header-role').textContent = data.Role || 'User';
}

function _renderForm(data, master) {
    const wrap = document.getElementById('profile-form-wrap');
    if (!wrap) return;

    const allUnits = master.units || [];

    // Find dept id matching current department name
    const currentDept = (master.departments || []).find(d => d.Name === data.Department);
    const currentDeptId = currentDept?.id ?? null;
    const unitsForDept = currentDeptId ? allUnits.filter(u => u.department_id === currentDeptId) : [];
    const hasUnits = unitsForDept.length > 0;

    const deptOptions = (master.departments || []).map(d =>
        `<option value="${_esc(d.Name)}" data-id="${d.id}" ${data.Department === d.Name ? 'selected' : ''}>${_esc(d.Name)}</option>`
    ).join('');
    const posOptions = (master.positions || []).map(p =>
        `<option value="${_esc(p.Name)}" ${data.Position === p.Name ? 'selected' : ''}>${_esc(p.Name)}</option>`
    ).join('');
    const unitOptions = unitsForDept.map(u =>
        `<option value="${_esc(u.name)}" ${data.Unit === u.name ? 'selected' : ''}>${_esc(u.name)}</option>`
    ).join('');

    wrap.innerHTML = `
    <form id="profile-info-form" class="space-y-4">
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                รหัสพนักงาน
            </label>
            <input value="${_esc(data.EmployeeID)}" readonly
                   class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-600 text-sm text-slate-400 cursor-not-allowed">
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                ชื่อ-นามสกุล <span class="text-red-500">*</span>
            </label>
            <input id="pf-name" type="text" value="${_esc(data.EmployeeName)}" required
                   class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                แผนก
            </label>
            <select id="pf-dept"
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
                <option value="">-- เลือกแผนก --</option>
                ${deptOptions}
            </select>
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                ตำแหน่ง
            </label>
            <select id="pf-position"
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
                <option value="">-- เลือกตำแหน่ง --</option>
                ${posOptions}
            </select>
        </div>
        <div id="pf-unit-wrap" class="${hasUnits ? '' : 'hidden'}">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                หน่วยงาน (Unit)
            </label>
            <select id="pf-unit"
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition">
                <option value="">-- เลือกหน่วยงาน --</option>
                ${unitOptions}
            </select>
        </div>
        <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                บทบาท (Role)
            </label>
            <input value="${_esc(data.Role || 'User')}" readonly
                   class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-600 text-sm text-slate-400 cursor-not-allowed">
        </div>
        <div id="pf-error" class="hidden text-sm text-red-600 font-medium bg-red-50 rounded-xl px-3 py-2"></div>
        <button type="submit"
                class="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition mt-2"
                style="background:linear-gradient(135deg,#064e3b,#0d9488)">
            บันทึกข้อมูล
        </button>
    </form>`;

    document.getElementById('profile-info-form')?.addEventListener('submit', _handleSaveProfile);

    // Cascading unit dropdown when dept changes
    document.getElementById('pf-dept')?.addEventListener('change', function() {
        const selOpt   = this.options[this.selectedIndex];
        const deptId   = selOpt ? Number(selOpt.dataset.id) : null;
        const filtered = allUnits.filter(u => u.department_id === deptId);
        const unitWrap = document.getElementById('pf-unit-wrap');
        const unitSel  = document.getElementById('pf-unit');
        if (filtered.length > 0) {
            unitSel.innerHTML = '<option value="">-- เลือกหน่วยงาน --</option>' +
                filtered.map(u => `<option value="${_esc(u.name)}">${_esc(u.name)}</option>`).join('');
            unitWrap.classList.remove('hidden');
        } else {
            unitSel.innerHTML = '<option value="">-- เลือกหน่วยงาน --</option>';
            unitWrap.classList.add('hidden');
            unitSel.value = '';
        }
    });
}

// ─── Handlers ──────────────────────────────────────────────────────────────────
async function _handleSaveProfile(e) {
    e.preventDefault();
    const errEl  = document.getElementById('pf-error');
    const btn    = e.target.querySelector('button[type=submit]');
    errEl.classList.add('hidden');

    const unitWrap = document.getElementById('pf-unit-wrap');
    const body = {
        EmployeeName: document.getElementById('pf-name')?.value?.trim(),
        Department:   document.getElementById('pf-dept')?.value,
        Position:     document.getElementById('pf-position')?.value,
        Unit:         unitWrap?.classList.contains('hidden') ? '' : (document.getElementById('pf-unit')?.value || ''),
    };
    if (!body.EmployeeName) {
        errEl.textContent = 'กรุณาระบุชื่อ-นามสกุล';
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    try {
        await apiFetch('/profile', { method: 'PUT', body: JSON.stringify(body) });
        showToast('อัปเดตโปรไฟล์สำเร็จ', 'success');
        // Refresh header name
        const nameEl = document.getElementById('profile-header-name');
        if (nameEl) nameEl.textContent = body.EmployeeName;
    } catch (err) {
        errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึกข้อมูล';
    }
}

async function _handleChangePassword(e) {
    e.preventDefault();
    const errEl  = document.getElementById('ppw-error');
    const btn    = e.target.querySelector('button[type=submit]');
    errEl.classList.add('hidden');

    const current = document.getElementById('ppw-current')?.value;
    const newPw   = document.getElementById('ppw-new')?.value;
    const confirm = document.getElementById('ppw-confirm')?.value;

    if (!current || !newPw || !confirm) {
        errEl.textContent = 'กรุณากรอกข้อมูลให้ครบถ้วน';
        errEl.classList.remove('hidden');
        return;
    }
    if (newPw.length < 6) {
        errEl.textContent = 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร';
        errEl.classList.remove('hidden');
        return;
    }
    if (newPw !== confirm) {
        errEl.textContent = 'รหัสผ่านใหม่ไม่ตรงกัน';
        errEl.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    try {
        await apiFetch('/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
        });
        showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
        e.target.reset();
    } catch (err) {
        errEl.textContent = err.message || 'เกิดข้อผิดพลาด';
        errEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึกรหัสผ่านใหม่';
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function _getMaster() {
    if (_masterCache) return _masterCache;
    // Also works via /api/master/safety-units but /register/options bundles all 3 in one call
    const res = await apiFetch('/register/options');
    _masterCache = res.data || { departments: [], positions: [], units: [] };
    return _masterCache;
}

function _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
