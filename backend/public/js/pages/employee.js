import { showLoading, hideLoading, showToast, showError, openModal, closeModal } from '../ui.js';
import { apiFetch } from '../api.js';

let allEmployees = [];

export async function loadEmployeePage() {
    const container = document.getElementById('employee-page');
    
    // --- 1. Header & Toolbar ---
    container.innerHTML = `
        <div class="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
            
            <div class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <svg class="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                        จัดการพนักงาน (Employee Management)
                    </h1>
                    <p class="text-sm text-slate-500 mt-1">รายชื่อพนักงาน ข้อมูลตำแหน่ง และสิทธิ์การใช้งานระบบ</p>
                </div>
                
                <div class="flex flex-wrap gap-3 items-center">
                    <div class="relative group">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg class="w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        </div>
                        <input type="text" id="search-emp" placeholder="ค้นหาชื่อ, รหัส, หรือตำแหน่ง..." 
                            class="pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64 shadow-sm transition-all">
                    </div>

                    <div class="h-8 w-px bg-slate-200 mx-1 hidden md:block"></div>

                    <input type="file" id="excel-upload" hidden accept=".xlsx, .xls">
                    <button onclick="document.getElementById('excel-upload').click()" class="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                        <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                        Import Excel
                    </button>

                    <button onclick="openEmployeeModal()" class="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        เพิ่มพนักงาน
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-slate-200">
                        <thead class="bg-slate-50">
                            <tr>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">พนักงาน (Employee)</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">แผนก (Department)</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ตำแหน่ง (Position)</th>
                                <th scope="col" class="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">สิทธิ์ (Role)</th>
                                <th scope="col" class="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody id="emp-table-body" class="bg-white divide-y divide-slate-200">
                            <tr>
                                <td colspan="5" class="px-6 py-12 text-center text-slate-400">
                                    <div class="inline-flex items-center gap-2">
                                        <div class="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent"></div>
                                        กำลังโหลดข้อมูล...
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
                    <span class="text-xs text-slate-500" id="emp-total-count">ทั้งหมด 0 คน</span>
                </div>
            </div>
        </div>
    `;

    // --- Event Listeners ---
    document.getElementById('search-emp').addEventListener('keyup', (e) => handleSearch(e.target.value));
    document.getElementById('excel-upload').addEventListener('change', handleExcelUpload);

    await fetchEmployees();

    // Expose functions
    window.openEmployeeModal = openEmployeeModal;
    window.saveEmployee = saveEmployee;
    window.deleteEmployee = deleteEmployee;
    window.editEmployee = (id) => {
        const emp = allEmployees.find(e => e.EmployeeID == id); 
        if(emp) openEmployeeModal(emp);
    };
}

// --- Data Fetching ---
async function fetchEmployees() {
    try {
        const res = await apiFetch('/admin/employees');
        if (res.success) {
            allEmployees = res.data;
            renderEmployees(allEmployees);
        } else {
            throw new Error(res.message);
        }
    } catch (err) {
        document.getElementById('emp-table-body').innerHTML = `
            <tr><td colspan="5" class="px-6 py-12 text-center text-red-500">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
    }
}

// --- Rendering (Table View) ---
function renderEmployees(list) {
    const tbody = document.getElementById('emp-table-body');
    const countEl = document.getElementById('emp-total-count');
    
    if(countEl) countEl.innerText = `ทั้งหมด ${list.length} คน`;

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-16 text-center text-slate-400">
                    <svg class="w-12 h-12 mb-3 opacity-50 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                    <span class="text-sm font-medium">ไม่พบข้อมูลพนักงาน</span>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = list.map(emp => `
        <tr class="hover:bg-slate-50 transition-colors group">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10">
                        <div class="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                            ${emp.EmployeeName.charAt(0).toUpperCase()}
                        </div>
                    </div>
                    <div class="ml-4">
                        <div class="text-sm font-bold text-slate-900">${emp.EmployeeName}</div>
                        <div class="text-xs text-slate-500 font-mono">${emp.EmployeeID}</div>
                    </div>
                </div>
            </td>
            
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-slate-700">${emp.Department || '-'}</div>
            </td>

            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    ${emp.Position || '-'}
                </span>
            </td>

            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeClass(emp.Role)}">
                    ${emp.Role || 'User'}
                </span>
            </td>

            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onclick="editEmployee('${emp.EmployeeID}')" class="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-1.5 rounded-md transition-colors" title="แก้ไข">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="deleteEmployee('${emp.EmployeeID}')" class="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function handleSearch(keyword) {
    if (!keyword) return renderEmployees(allEmployees);
    const lower = keyword.toLowerCase();
    const filtered = allEmployees.filter(e => 
        (e.EmployeeName && e.EmployeeName.toLowerCase().includes(lower)) || 
        (e.EmployeeID && e.EmployeeID.toLowerCase().includes(lower)) ||
        (e.Position && e.Position.toLowerCase().includes(lower))
    );
    renderEmployees(filtered);
}

// --- Excel Upload Handling ---
async function handleExcelUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ''; 

    if (!confirm(`ยืนยันการนำเข้าข้อมูลจากไฟล์: ${file.name}?`)) return;

    try {
        showLoading('กำลังอ่านไฟล์ Excel...');
        
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawRows = XLSX.utils.sheet_to_json(worksheet);
        
        if (rawRows.length === 0) throw new Error("ไฟล์ว่างเปล่า");

        const formattedRows = rawRows.map(row => ({
            EmployeeID: row['EmployeeID'] || row['รหัสพนักงาน'] || row['ID'],
            EmployeeName: row['EmployeeName'] || row['ชื่อ-นามสกุล'] || row['Name'],
            Department: row['Department'] || row['แผนก'] || row['Dept'],
            Position: row['Position'] || row['ตำแหน่ง'] || row['Pos'], // รองรับคอลัมน์ Position
            Role: row['Role'] || row['สิทธิ์'] || 'User'
        })).filter(r => r.EmployeeID && r.EmployeeName);

        if (formattedRows.length === 0) throw new Error("ไม่พบข้อมูลที่ถูกต้อง กรุณาตรวจสอบหัวตาราง");

        const res = await apiFetch('/admin/employees/import', {
            method: 'POST',
            body: { data: formattedRows }
        });

        if (res.success) {
            showToast(`นำเข้าสำเร็จ ${formattedRows.length} รายการ`, 'success');
            fetchEmployees();
        } else {
            throw new Error(res.message);
        }

    } catch (err) {
        showError(`นำเข้าไม่สำเร็จ: ${err.message}`);
    } finally {
        hideLoading();
    }
}

// --- Smart Form Modal ---
async function openEmployeeModal(emp = null) {
    showLoading('กำลังโหลดข้อมูล...');
    try {
        // Fetch Master Data
        const [depts, positions, roles] = await Promise.all([
            apiFetch('/master/departments'),
            apiFetch('/master/positions'), // เรียก API ตำแหน่ง
            apiFetch('/master/roles')
        ]);

        const isEdit = !!emp;
        const title = isEdit ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่';

        const createOptions = (list, selected) => {
            if(!list.success) return '';
            return list.data.map(item => 
                `<option value="${item.Name}" ${item.Name === selected ? 'selected' : ''}>${item.Name}</option>`
            ).join('');
        };

        const html = `
            <form id="emp-form" onsubmit="saveEmployee(event)" class="space-y-6">
                <input type="hidden" name="isEdit" value="${isEdit}">
                <div class="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 flex gap-2 items-start">
                    <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>กรุณากรอกข้อมูลให้ครบถ้วน รหัสพนักงานห้ามซ้ำกับที่มีอยู่</span>
                </div>

                <div class="grid grid-cols-2 gap-6">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">รหัสพนักงาน <span class="text-red-500">*</span></label>
                        <input type="text" name="EmployeeID" value="${emp?.EmployeeID || ''}" 
                            class="form-input w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}" 
                            required ${isEdit ? 'readonly' : ''} placeholder="เช่น EMP001">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">ชื่อ-นามสกุล <span class="text-red-500">*</span></label>
                        <input type="text" name="EmployeeName" value="${emp?.EmployeeName || ''}" 
                            class="form-input w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            required placeholder="เช่น สมชาย ใจดี">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-6">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">แผนก (Department)</label>
                        <div class="relative">
                            <select name="Department" class="form-select w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none">
                                <option value="">-- เลือกแผนก --</option>
                                ${createOptions(depts, emp?.Department)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">ตำแหน่ง (Position)</label>
                        <div class="relative">
                            <select name="Position" class="form-select w-full rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 appearance-none">
                                <option value="">-- เลือกตำแหน่ง --</option>
                                ${createOptions(positions, emp?.Position)}
                            </select>
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">สิทธิ์การใช้งาน (Role)</label>
                    <select name="Role" class="form-select w-full rounded-lg border-slate-300 bg-slate-50 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        ${createOptions(roles, emp?.Role || 'User')}
                    </select>
                </div>

                <div class="pt-6 border-t border-slate-100 flex justify-end gap-3">
                    <button type="button" onclick="closeModal()" class="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        ยกเลิก
                    </button>
                    <button type="submit" class="px-6 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">
                        ${isEdit ? 'บันทึกแก้ไข' : 'เพิ่มพนักงาน'}
                    </button>
                </div>
            </form>
        `;

        openModal(title, html);

    } catch (err) {
        showError(err);
    } finally {
        hideLoading();
    }
}

// --- CRUD Actions ---
async function saveEmployee(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const isEdit = data.isEdit === 'true';

    try {
        showLoading('กำลังบันทึก...');
        
        // Construct payload with Position
        const payload = {
            EmployeeID: data.EmployeeID,
            EmployeeName: data.EmployeeName,
            Department: data.Department,
            Position: data.Position, // ส่ง Position ไปแทน Team
            Role: data.Role
        };

        let res;
        if (isEdit) {
             res = await apiFetch(`/employees/${data.EmployeeID}`, { method: 'PUT', body: payload });
        } else {
             res = await apiFetch(`/employees`, { method: 'POST', body: payload });
        }

        if (res.success || res.status === 'success') {
            showToast('บันทึกข้อมูลเรียบร้อย', 'success');
            closeModal();
            fetchEmployees();
        } else {
            throw new Error(res.message || 'เกิดข้อผิดพลาด');
        }
    } catch (err) {
        // Fallback for compatibility
        try {
             await apiFetch('/admin/employees/import', { method: 'POST', body: { data: [data] } });
             showToast('บันทึกข้อมูลเรียบร้อย', 'success');
             closeModal();
             fetchEmployees();
        } catch(fallbackErr) {
             showError(err);
        }
    } finally {
        hideLoading();
    }
}

async function deleteEmployee(id) {
    if(!confirm(`ยืนยันการลบพนักงานรหัส: ${id}?\nการกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
    try {
        showLoading('กำลังลบ...');
        await apiFetch(`/employees/${id}`, { method: 'DELETE' });
        showToast('ลบพนักงานเรียบร้อย', 'success');
        fetchEmployees();
    } catch(err) {
        showError(err);
    } finally {
        hideLoading();
    }
}

function getRoleBadgeClass(role) {
    switch(role?.toLowerCase()) {
        case 'admin': return 'bg-purple-100 text-purple-700 border border-purple-200';
        case 'manager': return 'bg-amber-100 text-amber-700 border border-amber-200';
        case 'committee': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
        default: return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
}