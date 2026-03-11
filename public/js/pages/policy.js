import { API } from '../api.js';
import { hideLoading, showError, showLoading, openModal, closeModal, showDocumentModal, showToast, showConfirmationModal } from '../ui.js';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';

// --- Global State ---
let allPolicies = [];
let policyEventListenersInitialized = false;

// --- Main Page Loader ---
export async function loadPolicyPage() {
    const container = document.getElementById('policy-page');

    if (!policyEventListenersInitialized) {
        setupPolicyPageEventListeners();
        policyEventListenersInitialized = true;
    }

    const userStr = localStorage.getItem('currentUser');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const isAdmin = currentUser && (
        (currentUser.role && currentUser.role.toLowerCase() === 'admin') ||
        (currentUser.Role && currentUser.Role.toLowerCase() === 'admin') ||
        (currentUser.id === 'admin')
    );

    container.innerHTML = `
        <div class="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">

            <!-- Page Header -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                         style="background: linear-gradient(135deg, #059669, #059669);">
                        <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                        </svg>
                    </div>
                    <div>
                        <h1 class="text-xl font-bold text-slate-800">นโยบายความปลอดภัย</h1>
                        <p class="text-xs text-slate-400 mt-0.5">Safety Policy · Thai Summit Harness Co., Ltd.</p>
                    </div>
                </div>
                ${isAdmin ? `
                <button id="btn-add-policy" class="btn btn-primary flex items-center gap-2 text-sm px-4 py-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                    </svg>
                    เพิ่มนโยบาย
                </button>` : ''}
            </div>

            <!-- Current Policy -->
            <div id="current-policy-container">
                <div class="card p-10 text-center text-slate-400">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-400 border-t-transparent mb-3"></div>
                    <p class="text-sm">กำลังโหลดข้อมูล...</p>
                </div>
            </div>

            <!-- History Timeline -->
            <div id="history-section" class="hidden">
                <div class="flex items-center gap-3 mb-4">
                    <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <h2 class="text-sm font-bold text-slate-500 uppercase tracking-wider">ประวัติย้อนหลัง</h2>
                </div>
                <div id="past-policy-container"></div>
            </div>
        </div>
    `;

    try {
        const raw = await API.get('/pagedata/policies');
        const data = normalizeApiObject(raw);

        let current = null;
        let past = [];

        if (data.current || data.past) {
            current = normalizeApiObject(data.current);
            past = normalizeApiArray(data.past);
        } else {
            const list = normalizeApiArray(data);
            current = list.find(p => p.IsCurrent == 1) || list[0] || null;
            past = list.filter(p => String(p.id) !== String(current?.id));
        }

        allPolicies = [current, ...past].filter(Boolean);

        renderCurrentPolicy(current, isAdmin);
        renderPastPolicies(past, isAdmin);

    } catch (error) {
        console.error("Error loading policies:", error);
        document.getElementById('current-policy-container').innerHTML = `
            <div class="card p-6 text-center">
                <p class="text-red-500 text-sm">เกิดข้อผิดพลาด: ${error.message}</p>
            </div>`;
    }
}

// --- Render Functions ---
function renderCurrentPolicy(rawPolicy, isAdmin) {
    const container = document.getElementById('current-policy-container');
    const policy = normalizeApiObject(rawPolicy);

    if (!policy) {
        container.innerHTML = `
            <div class="card p-10 text-center">
                <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <p class="text-slate-500 font-medium">ยังไม่มีนโยบายปัจจุบัน</p>
                <p class="text-slate-400 text-sm mt-1">กดปุ่ม "เพิ่มนโยบาย" เพื่อเริ่มต้น</p>
            </div>`;
        return;
    }

    const year = policy.EffectiveDate ? new Date(policy.EffectiveDate).getFullYear() + 543 : '-';

    container.innerHTML = `
        <div class="card overflow-hidden">
            <!-- Gradient top bar -->
            <div class="h-1.5 w-full" style="background: linear-gradient(90deg, #059669, #059669, #0d9488)"></div>

            <div class="p-6 md:p-8">
                <!-- Header row -->
                <div class="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                             style="background: linear-gradient(135deg, #eff6ff, #dbeafe);">
                            <svg class="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                            </svg>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"></span>
                                    ฉบับปัจจุบัน (Active)
                                </span>
                                <span class="text-xs text-slate-400">พ.ศ. ${year}</span>
                            </div>
                            <h2 class="text-xl font-bold text-slate-800 leading-snug">${policy.PolicyTitle}</h2>
                            <div class="flex items-center gap-1.5 mt-1.5 text-xs text-slate-400">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                </svg>
                                วันที่มีผลบังคับใช้: <span class="font-medium text-slate-600">${formatDate(policy.EffectiveDate)}</span>
                            </div>
                        </div>
                    </div>

                    ${isAdmin ? `
                    <button class="btn-edit-policy flex-shrink-0 p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            data-id="${policy.id || policy.PolicyID}" title="แก้ไข">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                    </button>` : ''}
                </div>

                <!-- Description -->
                ${policy.Description ? `
                <div class="bg-slate-50 rounded-xl p-5 border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                    ${policy.Description}
                </div>` : ''}

                <!-- Document button -->
                ${policy.DocumentLink ? `
                <div class="mt-5 pt-5 border-t border-slate-100 flex items-center justify-between">
                    <p class="text-xs text-slate-400">เอกสารประกอบนโยบาย</p>
                    <a href="${policy.DocumentLink}" data-action="view-doc"
                       class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                       style="background: linear-gradient(135deg, #059669, #059669); box-shadow: 0 2px 8px rgba(6,78,59,0.25);"
                       onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 15px rgba(6,78,59,0.35)'"
                       onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 8px rgba(6,78,59,0.25)'">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                        </svg>
                        เปิดดูเอกสาร
                    </a>
                </div>` : ''}
            </div>
        </div>
    `;
}

function renderPastPolicies(rawPolicies, isAdmin) {
    const list = normalizeApiArray(rawPolicies);
    const historySection = document.getElementById('history-section');
    const container = document.getElementById('past-policy-container');

    if (!list.length) {
        historySection.classList.add('hidden');
        return;
    }

    historySection.classList.remove('hidden');

    container.innerHTML = `
        <div class="relative">
            <!-- Vertical timeline line -->
            <div class="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-200 rounded-full"></div>

            <div class="space-y-3">
                ${list.map(raw => {
                    const p = normalizeApiObject(raw);
                    const year = p.EffectiveDate ? new Date(p.EffectiveDate).getFullYear() + 543 : '-';
                    return `
                    <div class="relative flex items-start gap-4 group">
                        <!-- Timeline dot -->
                        <div class="flex-shrink-0 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10 group-hover:border-emerald-300 transition-colors">
                            <span class="text-xs font-bold text-slate-400 group-hover:text-emerald-600 transition-colors">${String(year).slice(-2)}</span>
                        </div>

                        <!-- Card -->
                        <div class="flex-1 card p-4 flex items-center justify-between gap-3 hover:border-emerald-200 transition-all" style="margin-top: 4px;">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 mb-0.5">
                                    <span class="text-xs text-slate-400 font-medium">พ.ศ. ${year}</span>
                                    <span class="text-slate-200">·</span>
                                    <span class="text-xs text-slate-400">${formatDate(p.EffectiveDate)}</span>
                                </div>
                                <h4 class="font-semibold text-slate-700 text-sm truncate group-hover:text-emerald-700 transition-colors">${p.PolicyTitle || '-'}</h4>
                            </div>

                            <div class="flex items-center gap-1 flex-shrink-0">
                                ${p.DocumentLink ? `
                                <a href="${p.DocumentLink}" data-action="view-doc"
                                   class="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="ดูเอกสาร">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                                    </svg>
                                </a>` : ''}

                                ${isAdmin ? `
                                <button class="btn-edit-policy p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" data-id="${p.id}" title="แก้ไข">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                                    </svg>
                                </button>
                                <button class="btn-delete-policy p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" data-id="${p.id}" title="ลบ">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                    </svg>
                                </button>` : ''}
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// --- Event Handling ---
function setupPolicyPageEventListeners() {
    document.addEventListener('click', async (event) => {
        if (!event.target.closest('#policy-page')) return;
        const target = event.target;

        if (target.closest('#btn-add-policy')) {
            showPolicyForm();
            return;
        }

        const editBtn = target.closest('.btn-edit-policy');
        if (editBtn) {
            const policyToEdit = allPolicies.find(p => String(p.id) === String(editBtn.dataset.id));
            if (policyToEdit) showPolicyForm(policyToEdit);
            return;
        }

        const deleteBtn = target.closest('.btn-delete-policy');
        if (deleteBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', 'ต้องการลบนโยบายนี้ใช่หรือไม่? ไม่สามารถย้อนกลับได้');
            if (confirmed) {
                showLoading('กำลังลบข้อมูล...');
                try {
                    await API.delete(`/policies/${deleteBtn.dataset.id}`);
                    showToast('ลบข้อมูลเรียบร้อยแล้ว', 'success');
                    await loadPolicyPage();
                } catch (error) {
                    showError(error);
                } finally {
                    hideLoading();
                }
            }
            return;
        }

        const viewDocBtn = target.closest('[data-action="view-doc"]');
        if (viewDocBtn) {
            event.preventDefault();
            showDocumentModal(viewDocBtn.href, 'เอกสารแนบ');
            return;
        }
    });
}

// --- Form ---
function showPolicyForm(rawPolicy = null) {
    const policy = normalizeApiObject(rawPolicy);
    const isEditing = policy !== null;

    const html = `
        <form id="policy-form" class="space-y-4">
            <input type="hidden" name="id" value="${policy?.id || ''}">

            <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex gap-2 text-sm text-emerald-700">
                <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>ใส่ลิงก์เอกสารจากแหล่งที่เชื่อถือได้ หรืออัปโหลดไฟล์โดยตรง</span>
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หัวข้อนโยบาย <span class="text-red-500">*</span></label>
                <input type="text" name="PolicyTitle" class="form-input w-full"
                       value="${policy?.PolicyTitle || ''}" required placeholder="เช่น นโยบายความปลอดภัย ปี 2568">
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">รายละเอียด</label>
                <textarea name="Description" class="form-textarea w-full h-24 resize-none"
                          placeholder="รายละเอียดเพิ่มเติม...">${policy?.Description || ''}</textarea>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่บังคับใช้ <span class="text-red-500">*</span></label>
                    <input type="text" id="EffectiveDate" name="EffectiveDate" class="form-input w-full bg-white"
                           value="${policy?.EffectiveDate ? new Date(policy.EffectiveDate).toISOString().split('T')[0] : ''}" required>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-slate-700 mb-1.5">ลิงก์เอกสาร (URL)</label>
                    <input type="text" name="DocumentLink" class="form-input w-full"
                           value="${policy?.DocumentLink || ''}" placeholder="https://...">
                </div>
            </div>

            <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">หรืออัปโหลดไฟล์ (PDF / DOCX)</label>
                <input type="file" name="PolicyFile" accept=".pdf,.doc,.docx"
                       class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
                <p class="text-xs text-slate-400 mt-1">* ถ้าเลือกไฟล์ ระบบจะใช้ไฟล์แทนลิงก์</p>
            </div>

            <div class="flex items-center gap-2.5 py-1">
                <input type="checkbox" id="IsCurrent" name="IsCurrent"
                       class="rounded text-emerald-600 w-4 h-4 focus:ring-emerald-500"
                       ${policy?.IsCurrent ? 'checked' : ''}>
                <label for="IsCurrent" class="text-sm text-slate-700 cursor-pointer select-none">
                    ตั้งเป็น <span class="font-semibold text-emerald-700">ฉบับปัจจุบัน (Active)</span>
                </label>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" class="btn btn-secondary px-4"
                        onclick="document.getElementById('modal-close-btn').click()">ยกเลิก</button>
                <button type="submit" class="btn btn-primary px-5">บันทึกข้อมูล</button>
            </div>
        </form>
    `;

    openModal(isEditing ? 'แก้ไขนโยบาย' : 'เพิ่มนโยบายใหม่', html, 'max-w-2xl');

    flatpickr("#EffectiveDate", {
        locale: "th",
        dateFormat: "Y-m-d",
        defaultDate: policy?.EffectiveDate || "today"
    });

    document.getElementById('policy-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEl = e.target;
        const submitBtn = formEl.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></span> กำลังบันทึก...';

        const formData = new FormData(formEl);
        try {
            showLoading('กำลังบันทึก...');
            const file = formData.get('PolicyFile');
            if (file && file.size > 0) {
                const uploadData = new FormData();
                uploadData.append('file', file);
                const uploadRes = await API.post('/files/upload', uploadData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                if (!uploadRes?.url) throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
                formData.set('DocumentLink', uploadRes.url);
            }
            formData.delete('PolicyFile');

            const data = Object.fromEntries(formData.entries());
            data.IsCurrent = formEl.querySelector('#IsCurrent').checked ? 1 : 0;

            if (data.id) {
                await API.put(`/policies/${data.id}`, data);
            } else {
                await API.post('/policies', data);
            }

            closeModal();
            showToast('บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
            await loadPolicyPage();
        } catch (error) {
            showError(error);
        } finally {
            hideLoading();
            submitBtn.disabled = false;
            submitBtn.textContent = 'บันทึกข้อมูล';
        }
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}
