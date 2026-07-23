import { delegatedActionOptions, guardActionHandler, guardSubmitHandler } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
// public/js/pages/hiyari.js
import { API } from '../api.js';
import {
    hideLoading, showError, showLoading,
    openModal, openDetailModal, closeModal, showToast, showConfirmationModal, showDocumentModal, escHtml,
    statusBadge as dsStatusBadge
} from '../ui.js?v=20260602-mobile-nav-m53';
import { normalizeApiArray, normalizeApiObject } from '../utils/normalize.js';
import { buildActivityCard } from '../utils/activity-widget.js?v=20260602-activity-targets-at10';

// ─────────────────────────────────────────────────────────────────────────────
// Constants  (STOP_TYPES + RANKS mirror CCCF exactly)
// ─────────────────────────────────────────────────────────────────────────────
const STOP_TYPES = [
    { id: 1, code: 'Stop 1', label: 'อันตรายจากเครื่องจักร',        color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    { id: 2, code: 'Stop 2', label: 'อันตรายจากวัตถุหนักตกใส่',    color: '#f97316', bg: '#fff7ed', border: '#fed7aa', icon: 'M19 14l-7 7m0 0l-7-7m7 7V3' },
    { id: 3, code: 'Stop 3', label: 'อันตรายจากยานพาหนะ',          color: '#eab308', bg: '#fefce8', border: '#fef08a', icon: 'M8 17h8m-4-4v4M12 3L4 9v12h16V9l-8-6z' },
    { id: 4, code: 'Stop 4', label: 'อันตรายจากการตกจากที่สูง',    color: '#8b5cf6', bg: '#f5f3ff', border: '#ddd6fe', icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6' },
    { id: 5, code: 'Stop 5', label: 'อันตรายจากไฟฟ้า',             color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 6, code: 'Stop 6', label: 'อันตรายอื่นๆ',                color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
];
const RANKS = [
    { rank: 'A', label: 'Rank A', desc: 'เสียชีวิต, พิการ, สูญเสียอวัยวะ', detail: '7 วัน',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    { rank: 'B', label: 'Rank B', desc: 'บาดเจ็บหยุดงาน',                   detail: '15 วัน', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    { rank: 'C', label: 'Rank C', desc: 'บาดเจ็บเล็กน้อย ไม่หยุดงาน',      detail: '30 วัน', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
];

const CONSEQUENCES = [
    'บาดเจ็บเล็กน้อย', 'บาดเจ็บรุนแรง', 'เสียชีวิต',
    'ทรัพย์สินเสียหาย', 'ผลกระทบต่อสิ่งแวดล้อม',
    'การหยุดชะงักการผลิต', 'อื่นๆ',
];
const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES    = ['Open', 'In Progress', 'Closed'];
const HIYARI_ALLOWED_FILE_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const HIYARI_MAX_FILE_SIZE = 20 * 1024 * 1024;

const RISK_BADGE = {
    Low:      'bg-emerald-100 text-emerald-700',
    Medium:   'bg-yellow-100 text-yellow-700',
    High:     'bg-orange-100 text-orange-700',
    Critical: 'bg-red-100 text-red-700',
};
const RISK_LABEL = { Low: 'ต่ำ', Medium: 'ปานกลาง', High: 'สูง', Critical: 'วิกฤต' };
const RANK_BADGE = { A: 'bg-red-100 text-red-700', B: 'bg-orange-100 text-orange-700', C: 'bg-emerald-100 text-emerald-700' };
const RANK_LABEL = { A: 'Rank A', B: 'Rank B', C: 'Rank C' };

const STATUS_BADGE = {
    'Open':        'bg-sky-100 text-sky-700',
    'In Progress': 'bg-amber-100 text-amber-700',
    'Closed':      'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = { 'Open': 'รอดำเนินการ', 'In Progress': 'กำลังดำเนินการ', 'Closed': 'ปิดแล้ว' };
const REVIEW_LABEL = {
    PendingReview: 'รอแอดมินตรวจ Excel',
    Approved: 'Excel ผ่านแล้ว รอ PDF ลงนาม',
    Rejected: 'ตีกลับให้แก้ไข Excel',
    Completed: 'ส่ง PDF ลงนามแล้ว',
};
const REVIEW_BADGE = {
    PendingReview: 'bg-amber-50 text-amber-700 border-amber-200',
    Approved: 'bg-blue-50 text-blue-700 border-blue-200',
    Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function _isDirectSignedPdfReport(report) {
    return (report?.ReviewStatus || '') === 'Completed'
        && Boolean(report?.SignedFileUrl)
        && !report?.AttachmentUrl;
}

function _getDocumentFlowMeta(report) {
    if (_isDirectSignedPdfReport(report)) {
        return {
            label: 'PDF ส่งโดยตรง',
            note: 'แอดมินเปิดสิทธิ์ส่ง PDF โดยไม่ต้องส่ง Excel ก่อน',
            badge: 'bg-sky-50 text-sky-700 border-sky-200',
        };
    }
    const review = report?.ReviewStatus || 'PendingReview';
    const map = {
        PendingReview: {
            label: 'รอตรวจ Excel',
            note: 'ส่ง Excel แล้ว รอแอดมินตรวจสอบ',
            badge: REVIEW_BADGE.PendingReview,
        },
        Approved: {
            label: 'ผ่านแล้ว รอ PDF',
            note: 'Excel ผ่านแล้ว รอไฟล์ PDF ที่ลงนาม',
            badge: REVIEW_BADGE.Approved,
        },
        Rejected: {
            label: 'ไม่ผ่าน ต้องแก้ไข',
            note: 'Excel ถูกตีกลับให้แก้ไข',
            badge: REVIEW_BADGE.Rejected,
        },
        Completed: {
            label: 'PDF ส่งแล้ว',
            note: 'รับไฟล์ PDF ที่ลงนามแล้ว',
            badge: REVIEW_BADGE.Completed,
        },
    };
    return map[review] || {
        label: REVIEW_LABEL[review] || review || 'รอตรวจสอบ',
        note: 'ขั้นตอนเอกสาร Hiyari',
        badge: REVIEW_BADGE[review] || 'bg-slate-50 text-slate-500 border-slate-200',
    };
}

function _buildDocumentFlowBadge(report, { showNote = false } = {}) {
    const meta = _getDocumentFlowMeta(report);
    return `
        <span class="inline-flex px-2 py-0.5 rounded-full border text-[10px] font-semibold ${meta.badge}">
            ${escHtml(meta.label)}
        </span>
        ${showNote ? `<span class="block mt-1 text-[10px] text-slate-400">${escHtml(meta.note)}</span>` : ''}`;
}

function _fmtHiyariDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('th-TH');
}

function _canUploadSignedHiyariPdf(report) {
    const review = report?.ReviewStatus || '';
    return review === 'Approved' || (review === 'Completed' && Boolean(report?.SignedFileUrl));
}

function _renderHiyariWorkflowStepper(report) {
    const isDirect = _isDirectSignedPdfReport(report);
    const review = report?.ReviewStatus || 'PendingReview';
    const excelReviewed = isDirect || ['Approved', 'Rejected', 'Completed'].includes(review);
    const signedUploaded = Boolean(report?.SignedFileUrl) || review === 'Completed';
    const closed = (report?.Status || '') === 'Closed';
    const steps = [
        { label: 'Submitted', done: true, at: report?.CreatedAt || report?.ReportDate },
        { label: 'Excel Reviewed', done: excelReviewed, current: review === 'PendingReview', warn: review === 'Rejected', at: report?.ReviewedAt },
        { label: 'Signed PDF Uploaded', done: signedUploaded, current: review === 'Approved', at: report?.SignedUploadedAt },
        { label: 'Closed', done: closed, current: signedUploaded && !closed, at: report?.ClosedAt },
    ];
    return `
        <div class="rounded-xl border border-slate-200 bg-white px-3 py-3" data-hiyari-phase5-stepper="1">
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                ${steps.map(step => {
                    const tone = step.warn
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : step.done
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : step.current
                                ? 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500';
                    const dot = step.warn ? 'bg-rose-500' : step.done ? 'bg-emerald-500' : step.current ? 'bg-amber-500' : 'bg-slate-300';
                    return `
                    <div class="rounded-lg border ${tone} px-3 py-2">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${dot} flex-shrink-0"></span>
                            <p class="text-xs font-black">${escHtml(step.label)}</p>
                        </div>
                        <p class="mt-1 text-[11px] opacity-75">${escHtml(_fmtHiyariDateTime(step.at))}</p>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

function _renderHiyariOwnerCloseout(report) {
    const ownerLine = [report?.ReporterID, report?.Department].filter(Boolean).join(' · ');
    const submittedBy = report?.IsSubmittedOnBehalf
        ? `${report?.SubmittedByName || report?.SubmittedByID || '-'} (${report?.SubmittedByID || '-'})`
        : (report?.SubmittedByName || report?.SubmittedByID || '-');
    return `
        <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3" data-hiyari-phase5-owner-closeout="1">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Report Owner</p>
                    <p class="text-sm font-black text-slate-800">${escHtml(report?.ReporterName || '-')}</p>
                    <p class="text-xs text-slate-500">${escHtml(ownerLine || '-')}</p>
                    <p class="text-[11px] text-slate-400 mt-1">${escHtml(report?.CompanyEmail || '-')}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Submitted By</p>
                    <p class="text-sm font-black text-slate-800">${escHtml(submittedBy)}</p>
                    <p class="text-xs text-slate-500">${escHtml(report?.CreatedAt ? _fmtHiyariDateTime(report.CreatedAt) : '-')}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Reviewed / Signed</p>
                    <p class="text-xs text-slate-600">Reviewed by ${escHtml(report?.ReviewedBy || '-')} · ${escHtml(_fmtHiyariDateTime(report?.ReviewedAt))}</p>
                    <p class="text-xs text-slate-600 mt-1">Signed PDF · ${escHtml(_fmtHiyariDateTime(report?.SignedUploadedAt))}</p>
                </div>
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Close-out</p>
                    <p class="text-xs text-slate-600">Closed by ${escHtml(report?.ClosedBy || '-')} · ${escHtml(_fmtHiyariDateTime(report?.ClosedAt))}</p>
                    ${report?.ReopenedAt ? `<p class="text-xs text-amber-700 mt-1">Reopened by ${escHtml(report?.ReopenedBy || '-')} · ${escHtml(_fmtHiyariDateTime(report.ReopenedAt))}</p>` : ''}
                    ${report?.ReopenReason ? `<p class="text-xs text-amber-800 mt-1">Reason: ${escHtml(report.ReopenReason)}</p>` : ''}
                </div>
            </div>
        </div>`;
}

const CHART_COLORS = ['#f97316','#ef4444','#8b5cf6','#06b6d4','#10b981','#f59e0b','#6366f1'];

// ─────────────────────────────────────────────────────────────────────────────
// SLA Helpers  (A=7d  B=15d  C=30d — mirrors RANK constants)
// ─────────────────────────────────────────────────────────────────────────────
const _SLA_DAYS = { A: 7, B: 15, C: 30, Critical: 7, High: 15, Medium: 30, Low: 30 };

function _startOfLocalDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function _daysBetweenLocal(startValue, endValue = new Date()) {
    const start = _startOfLocalDate(startValue);
    const end = _startOfLocalDate(endValue);
    if (!start || !end) return 0;
    return Math.floor((end - start) / 86400000);
}

function _getSLA(report) {
    if (!report || report.Status === 'Closed') return null;
    const days = report.Rank ? _SLA_DAYS[report.Rank] : _SLA_DAYS[report.RiskLevel];
    if (!days || !report.ReportDate) return null;
    const elapsed   = _daysBetweenLocal(report.ReportDate);
    const remaining = days - elapsed;
    return { days, elapsed, remaining, overdue: remaining < 0, warning: remaining >= 0 && remaining <= 3 };
}

function _buildSLABadge(sla) {
    if (!sla) return '';
    if (sla.overdue) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ml-1" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5">เกิน ${Math.abs(sla.remaining)} วัน</span>`;
    if (sla.warning) return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ml-1" style="background:#fef9c3;color:#92400e;border:1px solid #fde68a">เหลือ ${sla.remaining} วัน</span>`;
    return '';
}

function _getSLARowStyle(sla) {
    if (!sla) return '';
    if (sla.overdue) return 'background:rgba(254,242,242,0.65)';
    if (sla.warning) return 'background:rgba(255,251,235,0.65)';
    return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let _isAdmin        = false;
let _activeTab      = 'dashboard';
let _reports        = [];
let _statsYear      = new Date().getFullYear();
let _statsMonth     = 'all';
let _statsDept      = 'all';
let _statsStatus    = 'all';
let _statsRank      = 'all';
let _filterStatus   = 'all';
let _filterDept     = 'all';
let _filterRisk     = 'all';
let _filterStopType = 'all';
let _filterRank     = 'all';
let _filterMonth    = 'all';
let _filterArea     = 'all';
let _historyYear    = '';
let _wizardStep     = 1;
let _searchQ        = '';
let _departments    = [];
let _areas          = [];
let _listenersReady = false;
let _chartLine      = null;
let _chartPie       = null;
let _chartBar       = null;
let _chartStop      = null;
let _chartRank      = null;
let _dashConfig     = { pinnedDepts: [] };
let _assignments    = [];
let _signedReportOptions = [];
let _empCache       = null;
let _posCache       = null;
let _hiyariForms    = [];
let _manageSubtab   = 'reviews';
let _submitInFlight = false;
let _submitDocumentMode = 'excel';
let _submitAssignments = [];
let _submitEmailProfile = undefined;
let _reviewNoticeTimer = null;
let _lastPendingReviewCount = null;
let _hiyariCardSaveMenu = null;
let _hiyariCardSaveHold = null;
const JOHNNY_IMAGE_RISK_DRAFT_KEY = 'johnny_image_risk_draft';

function _resetHistoryFilters({ keepYear = false } = {}) {
    _filterStatus = 'all';
    _filterDept = 'all';
    _filterRisk = 'all';
    _filterStopType = 'all';
    _filterRank = 'all';
    _filterMonth = 'all';
    _filterArea = 'all';
    _searchQ = '';
    if (!keepYear) _historyYear = '';
}

function _todayDateOnly() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function _companyEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function _isCompanyEmail(value) {
    return /^[^\s@]+@thaisummit-harness\.co\.th$/i.test(_companyEmail(value));
}

function _submitAssigneeLabel(assignment = {}) {
    const name = assignment.AssigneeName || assignment.EmployeeName || assignment.EmployeeID || '';
    const id = assignment.EmployeeID || '';
    const dept = assignment.Department || '-';
    const directBadge = Number(assignment.AllowDirectSignedPdf) === 1 ? ' · ส่ง PDF โดยตรงได้' : '';
    return [name, id, dept].filter(Boolean).join(' · ') + directBadge;
}

function _submitAssigneeSearchText(assignment = {}) {
    return [
        assignment.AssigneeName,
        assignment.EmployeeName,
        assignment.EmployeeID,
        assignment.Department,
        assignment.CompanyEmail,
        Number(assignment.AllowDirectSignedPdf) === 1 ? 'direct pdf' : '',
    ].filter(Boolean).join(' ').toLowerCase();
}

function _availableSubmitAssignments() {
    const directMode = _submitDocumentMode === 'direct';
    const rows = directMode && !_isAdmin
        ? _submitAssignments.filter(a => a.EmployeeID && Number(a.AllowDirectSignedPdf) === 1)
        : _submitAssignments.filter(a => a.EmployeeID);
    return rows;
}

function _filteredSubmitAssignments(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const rows = _availableSubmitAssignments();
    if (!q) return rows.slice(0, 200);
    return rows.filter(a => _submitAssigneeSearchText(a).includes(q)).slice(0, 200);
}

function _findSubmitAssigneeBySearch(value) {
    const q = String(value || '').trim().toLowerCase();
    if (!q) return null;
    return _availableSubmitAssignments().find(a => {
        const id = String(a.EmployeeID || '').trim();
        const label = _submitAssigneeLabel(a);
        const email = String(a.CompanyEmail || '').trim();
        return q === id.toLowerCase() || q === label.toLowerCase() || q === email.toLowerCase();
    }) || null;
}

function _syncSubmitAssigneeFromSearch({ applyEmail = true } = {}) {
    const input = document.getElementById('hiyari-on-behalf-search');
    const hidden = document.getElementById('hiyari-on-behalf');
    if (!hidden) return '';
    const selected = _getSelectedSubmitAssignment();
    if (selected && input?.value === _submitAssigneeLabel(selected)) return hidden.value;
    const match = _findSubmitAssigneeBySearch(input?.value || '');
    hidden.value = match?.EmployeeID || '';
    _renderSubmitAssigneeDropdown(input?.value || '', { open: Boolean(input?.value) });
    _renderSubmitOwnerPreview();
    if (applyEmail) _applyHiyariCompanyEmail({ loadEmployee: true });
    return hidden.value;
}

async function _selectSubmitAssignee(employeeId, { focusInput = false } = {}) {
    const hidden = document.getElementById('hiyari-on-behalf');
    const input = document.getElementById('hiyari-on-behalf-search');
    if (!hidden) return '';
    const assignment = _submitAssignments.find(a => String(a.EmployeeID || '') === String(employeeId || '')) || null;
    hidden.value = assignment?.EmployeeID || '';
    if (input) input.value = assignment ? _submitAssigneeLabel(assignment) : '';
    _renderSubmitAssigneeDropdown('', { open: false });
    await _applyHiyariCompanyEmail({ loadEmployee: true });
    _renderSubmitOwnerPreview();
    if (focusInput) input?.focus();
    return hidden.value;
}

function _getSelectedSubmitAssignment() {
    const selectedId = document.getElementById('hiyari-on-behalf')?.value || '';
    return selectedId
        ? _submitAssignments.find(a => String(a.EmployeeID || '') === String(selectedId)) || null
        : null;
}

function _ensureSelectedSubmitAssignmentEmail() {
    const selected = _getSelectedSubmitAssignment();
    const input = document.getElementById('hiyari-company-email');
    const selectedEmail = _companyEmail(selected?.CompanyEmail);
    if (selected && input && _isCompanyEmail(selectedEmail) && _companyEmail(input.value) !== selectedEmail) {
        input.value = selectedEmail;
        _renderSubmitOwnerPreview();
    }
    return _companyEmail(input?.value || '');
}

function _currentSubmitterMeta() {
    const user = TSHSession.getUser() || {};
    return {
        id: user.id || user.EmployeeID || user.employeeId || '-',
        name: user.name || user.EmployeeName || '-',
        department: user.department || user.Department || '-',
        email: user.email || user.Email || '',
    };
}

function _renderSubmitOwnerPreview() {
    const el = document.getElementById('hiyari-owner-preview');
    if (!el) return;
    const selected = _getSelectedSubmitAssignment();
    const submitter = _currentSubmitterMeta();
    const owner = selected ? {
        id: selected.EmployeeID || '-',
        name: selected.AssigneeName || selected.EmployeeName || selected.EmployeeID || '-',
        department: selected.Department || '-',
        email: selected.CompanyEmail || document.getElementById('hiyari-company-email')?.value || '',
        direct: Number(selected.AllowDirectSignedPdf) === 1,
    } : { ...submitter, email: document.getElementById('hiyari-company-email')?.value || submitter.email || '' };
    const isOnBehalf = Boolean(selected);
    el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="rounded-xl border border-emerald-100 bg-white p-3">
                <p class="text-[10px] font-bold uppercase text-emerald-600">Report Owner</p>
                <p class="mt-1 text-sm font-black text-slate-800">${escHtml(owner.name)}</p>
                <p class="text-xs text-slate-500">${escHtml([owner.id, owner.department].filter(Boolean).join(' · '))}</p>
                <p class="mt-1 text-[11px] text-slate-400">${escHtml(owner.email || 'CompanyEmail pending')}</p>
                ${owner.direct ? '<span class="mt-2 inline-flex px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-[10px] font-bold text-sky-700">Direct PDF allowed</span>' : ''}
            </div>
            <div class="rounded-xl border border-slate-200 bg-white p-3">
                <p class="text-[10px] font-bold uppercase text-slate-500">Submitted By</p>
                <p class="mt-1 text-sm font-black text-slate-800">${escHtml(submitter.name)}</p>
                <p class="text-xs text-slate-500">${escHtml([submitter.id, submitter.department].filter(Boolean).join(' · '))}</p>
                <p class="mt-1 text-[11px] ${isOnBehalf ? 'text-orange-600 font-semibold' : 'text-slate-400'}">${isOnBehalf ? 'This report will be submitted on behalf of the selected owner.' : 'This report will be submitted as the current user.'}</p>
            </div>
        </div>`;
}

function _currentUserIds() {
    const user = TSHSession.getUser() || {};
    return new Set([user.id, user.EmployeeID, user.employeeId].filter(Boolean).map(String));
}

function _canResubmitHiyariExcel(report) {
    if (!report || (report.ReviewStatus || '') !== 'Rejected') return false;
    if (_isAdmin) return true;
    const ids = _currentUserIds();
    return ids.has(String(report.ReporterID || '')) || ids.has(String(report.SubmittedByID || ''));
}

async function _loadSubmitEmailProfile() {
    if (_submitEmailProfile !== undefined) return _submitEmailProfile;
    const userIds = _currentUserIds();
    if (!userIds.size) {
        _submitEmailProfile = null;
        return null;
    }
    try {
        const res = await API.get('/employees');
        const employees = normalizeApiArray(res?.data ?? res);
        _submitEmailProfile = employees.find(emp => userIds.has(String(emp.EmployeeID || ''))) || null;
    } catch (_) {
        _submitEmailProfile = null;
    }
    return _submitEmailProfile;
}

async function _applyHiyariCompanyEmail({ loadEmployee = false } = {}) {
    const input = document.getElementById('hiyari-company-email');
    const help = document.getElementById('hiyari-company-email-help');
    if (!input) return;

    const selectedId = document.getElementById('hiyari-on-behalf')?.value || '';
    const selectedAssignment = selectedId
        ? _submitAssignments.find(a => String(a.EmployeeID || '') === String(selectedId))
        : null;
    const userIds = _currentUserIds();
    const currentAssignment = _submitAssignments.find(a => a.EmployeeID && userIds.has(String(a.EmployeeID)));

    let email = _companyEmail(selectedAssignment?.CompanyEmail || currentAssignment?.CompanyEmail);
    let source = selectedAssignment ? 'assignment' : (currentAssignment ? 'assignment' : '');
    if (!email && loadEmployee && !selectedId) {
        const profile = await _loadSubmitEmailProfile();
        email = _companyEmail(profile?.CompanyEmail);
        source = profile ? 'employee' : '';
    }

    if (_isCompanyEmail(email)) {
        input.value = email;
        input.readOnly = true;
        input.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-900');
        input.classList.remove('bg-white', 'border-amber-200');
        if (help) help.textContent = source === 'assignment'
            ? 'Auto-filled from Employee Master via Hiyari assignment.'
            : 'Auto-filled from Employee Master.';
        return;
    }

    input.readOnly = false;
    input.classList.remove('bg-emerald-50', 'border-emerald-200', 'text-emerald-900');
    input.classList.add('bg-white', 'border-amber-200');
    if (help) help.textContent = 'Employee Master has no CompanyEmail for this reporter. Enter a company email as fallback.';
}

function _validateHiyariFile(file) {
    if (!file) return null;
    if (!HIYARI_ALLOWED_FILE_TYPES.has(file.type)) {
        return 'รองรับเฉพาะไฟล์ Excel, PDF, JPG, PNG, WEBP';
    }
    if (file.size > HIYARI_MAX_FILE_SIZE) {
        return 'ไฟล์ต้องมีขนาดไม่เกิน 20 MB';
    }
    return null;
}

function _isExcelReviewFile(file) {
    if (!file) return false;
    return [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(file.type) || /\.(xls|xlsx)$/i.test(file.name || '');
}

function _validateExcelReviewFile(file) {
    if (!file) return 'กรุณาแนบไฟล์ Excel สำหรับให้แอดมินตรวจสอบ';
    const sizeError = _validateHiyariFile(file);
    if (sizeError) return sizeError;
    return _isExcelReviewFile(file) ? null : 'ขั้นตอนนี้รับเฉพาะไฟล์ Excel .xls หรือ .xlsx';
}

function _validateSignedPdf(file) {
    if (!file) return 'กรุณาแนบไฟล์ PDF ที่ลงนามแล้ว';
    if (file.size > HIYARI_MAX_FILE_SIZE) return 'ไฟล์ต้องมีขนาดไม่เกิน 20 MB';
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
        ? null
        : 'ขั้นตอนปิดงานรับเฉพาะไฟล์ PDF ที่ลงนามแล้ว';
}

function _validateHiyariSupportingFile(file) {
    if (!file) return null;
    if (file.size > HIYARI_MAX_FILE_SIZE) return 'ไฟล์ต้องมีขนาดไม่เกิน 20 MB';
    return ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        || /\.(pdf|jpe?g|png|webp)$/i.test(file.name || '')
        ? null
        : 'ไฟล์เพิ่มเติมรองรับเฉพาะ PDF, JPG, PNG, WEBP';
}

function _getAssignmentPeriod() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
        start,
        end,
        year: now.getFullYear(),
        label: now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
    };
}

function _isReportInPeriod(report, period) {
    if (!report?.ReportDate) return false;
    const dt = new Date(report.ReportDate);
    return dt >= period.start && dt < period.end;
}

function _buildAssignmentProgress(assignments, reports) {
    const period = _getAssignmentPeriod();
    const submittedIds = new Set(
        reports
            .filter(r => _isReportInPeriod(r, period))
            .map(r => String(r.ReporterID || '').trim())
            .filter(Boolean)
    );
    const byDept = new Map();

    assignments.forEach(a => {
        const dept = (a.Department || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
        if (!byDept.has(dept)) byDept.set(dept, { dept, total: 0, submitted: 0 });
        const row = byDept.get(dept);
        row.total += 1;
        if (submittedIds.has(String(a.EmployeeID || '').trim())) row.submitted += 1;
    });

    return {
        period,
        submittedIds,
        depts: Array.from(byDept.values()).sort((a, b) => b.total - a.total || a.dept.localeCompare(b.dept)),
    };
}

async function _loadAssignmentKpi(year = new Date().getFullYear()) {
    const [assignRes, reportRes] = await Promise.all([
        API.get('/hiyari/assignments').catch(() => ({ data: [] })),
        API.get(`/hiyari?year=${year}`).catch(() => ({ data: [] })),
    ]);
    const assignments = normalizeApiArray(assignRes?.data ?? assignRes);
    const reports = normalizeApiArray(reportRes?.data ?? reportRes);
    const assignedIds = assignments.map(a => String(a.EmployeeID || '').trim()).filter(Boolean);
    const assignedSet = new Set(assignedIds);
    const submittedIds = new Set(
        reports
            .map(r => String(r.ReporterID || '').trim())
            .filter(id => assignedSet.has(id))
    );
    const closedIds = new Set(
        reports
            .filter(r => r.Status === 'Closed')
            .map(r => String(r.ReporterID || '').trim())
            .filter(id => assignedSet.has(id))
    );

    const total = assignments.length;
    const closed = closedIds.size;
    const submitted = submittedIds.size;
    return {
        total,
        open: Math.max(total - submitted, 0),
        inProgress: Math.max(submitted - closed, 0),
        closed,
        closureRate: total ? Math.round((closed / total) * 100) : 0,
        assignments,
        reports,
    };
}

function _renderAssignmentProgress(progress) {
    const wrap = document.getElementById('assignment-progress');
    if (!wrap) return;
    if (!progress.depts.length) {
        wrap.innerHTML = '';
        return;
    }

    const total = progress.depts.reduce((sum, d) => sum + d.total, 0);
    const submitted = progress.depts.reduce((sum, d) => sum + d.submitted, 0);
    const pct = total ? Math.round((submitted / total) * 100) : 0;

    wrap.innerHTML = `
        <div class="mb-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div>
                    <p class="text-sm font-bold text-slate-800">Assignment Progress</p>
                    <p class="text-xs text-slate-500">รอบเดือน ${escHtml(progress.period.label)} · ส่งแล้ว ${submitted}/${total} คน (${pct}%)</p>
                </div>
                <div class="w-full md:w-48 h-2 rounded-full bg-white border border-orange-100 overflow-hidden">
                    <div class="h-full rounded-full" style="width:${pct}%;background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                ${progress.depts.map(d => {
                    const deptPct = d.total ? Math.round((d.submitted / d.total) * 100) : 0;
                    return `
                    <div class="rounded-xl bg-white border border-orange-100 p-3">
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <p class="text-xs font-bold text-slate-700 truncate">${escHtml(d.dept)}</p>
                            <span class="text-[11px] font-bold text-orange-700 whitespace-nowrap">${d.submitted}/${d.total} (${deptPct}%)</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div class="h-full rounded-full" style="width:${deptPct}%;background:#f97316"></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOADER
// ─────────────────────────────────────────────────────────────────────────────
export async function loadHiyariPage() {
    const container = document.getElementById('hiyari-page');
    if (!container) return;

    const user = TSHSession.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';

    window.closeModal = closeModal;

    container.innerHTML = buildShell();

    if (!_listenersReady) {
        setupEventListeners();
        _listenersReady = true;
    }

    await Promise.all([
        _fetchDepartments(),
        _fetchAreas(),
    ]);

    // Apply incoming filter from dashboard drill-down
    try {
        const _inFilter = JSON.parse(sessionStorage.getItem('pending_filter_hiyari') || 'null');
        if (_inFilter) {
            sessionStorage.removeItem('pending_filter_hiyari');
            if (_inFilter.tab)    _activeTab    = _inFilter.tab;
            if (_inFilter.status) _filterStatus = _inFilter.status;
            if (_inFilter.dept)   _filterDept   = _inFilter.dept;
            if (_inFilter.risk)   _filterRisk   = _inFilter.risk;
            if (_inFilter.stopType) _filterStopType = _inFilter.stopType;
            if (_inFilter.rank)   _filterRank   = _inFilter.rank;
            if (_inFilter.month)  _filterMonth  = _inFilter.month;
            if (_inFilter.area)   _filterArea   = _inFilter.area;
            if (_inFilter.year)   _historyYear  = _inFilter.year;
        }
    } catch (_) {}

    const johnnyDraft = _peekJohnnyImageRiskDraft('hiyari');
    _activeTab = johnnyDraft ? 'submit' : (_activeTab || window._getTab?.('hiyari', 'dashboard') || 'dashboard');
    switchTab(_activeTab);
    _loadHeroStats();   // async — fills stats strip without blocking tab render
    if (_isAdmin) _startManageReviewNoticeWatch();
    else _stopManageReviewNoticeWatch();
}

function _peekJohnnyImageRiskDraft(target) {
    try {
        const draft = JSON.parse(sessionStorage.getItem(JOHNNY_IMAGE_RISK_DRAFT_KEY) || 'null');
        return draft?.source === 'johnny_ai_image_analysis' && draft?.target === target ? draft : null;
    } catch {
        return null;
    }
}

function _consumeJohnnyImageRiskDraft(target) {
    const draft = _peekJohnnyImageRiskDraft(target);
    if (draft) sessionStorage.removeItem(JOHNNY_IMAGE_RISK_DRAFT_KEY);
    return draft;
}

function _johnnyDraftRiskRank(answer = '') {
    if (/Critical|High|วิกฤต|สูง/i.test(answer)) return 'A';
    if (/Medium|ปานกลาง/i.test(answer)) return 'B';
    return 'C';
}

function _applyJohnnyImageRiskDraftToHiyari() {
    const draft = _consumeJohnnyImageRiskDraft('hiyari');
    if (!draft) return;
    const form = document.getElementById('hiyari-form');
    if (!form) return;
    const answer = String(draft.answer || '').trim();
    form.querySelector('input[name="StopType"]')?.click();
    const rank = _johnnyDraftRiskRank(answer);
    form.querySelector(`input[name="Rank"][value="${rank}"]`)?.click();
    const desc = form.querySelector('[name="Description"]');
    const suggestion = form.querySelector('[name="Suggestion"]');
    if (desc && !desc.value) desc.value = `Draft from Johnny AI image risk analysis\n\n${answer}`;
    if (suggestion && !suggestion.value) suggestion.value = 'Review Johnny AI recommendations, confirm the real site condition, then define corrective and preventive actions before submitting.';
    showToast('เติม draft จาก Johnny AI แล้ว กรุณาตรวจสอบก่อนส่ง', 'success');
    form.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function _getTabs() {
    return [
        { id: 'dashboard', label: 'Dashboard',     icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>` },
        { id: 'submit',    label: 'รายงานใหม่',   icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>` },
        { id: 'history',   label: 'ประวัติ',       icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>` },
        ...(_isAdmin ? [{ id: 'manage', label: 'จัดการ', icon: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>` }] : []),
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SHELL
// ─────────────────────────────────────────────────────────────────────────────
function buildShell() {
    const tabHtml = _getTabs().map(t => `
        <button id="hiyari-tab-btn-${t.id}" data-tab="${t.id}"
            class="hiyari-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>
            ${t.label}
        </button>`).join('');

    return `
    <div class="space-y-6 animate-fade-in pb-10">

        <!-- ═══ HERO HEADER ═══ -->
        <div class="relative overflow-hidden rounded-2xl" data-hiyari-card-image="hiyari-hero" style="background:linear-gradient(135deg,#064e3b 0%,#065f46 55%,#0d9488 100%)">
            <!-- dot pattern -->
            <div class="absolute inset-0 opacity-10 pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="hiyari-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.3" fill="white"/></pattern></defs><rect width="100%" height="100%" fill="url(#hiyari-dots)"/></svg>
            </div>
            <!-- glow orb -->
            <div class="absolute -right-10 -top-10 w-52 h-52 rounded-full opacity-10 pointer-events-none"
                 style="background:radial-gradient(circle,#fff,transparent 70%)"></div>

            <div class="relative z-10 p-6">
                <!-- Title row -->
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white border border-white/30">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                                Hiyari-Hatto
                            </span>
                        </div>
                        <h1 class="text-xl md:text-2xl font-bold text-white leading-snug">รายงานเหตุการณ์เฉียดอุบัติเหตุ</h1>
                        <p class="text-sm mt-1" style="color:rgba(167,243,208,0.85)">Near Miss Reporting · Thai Summit Harness Co., Ltd.</p>
                    </div>
                    <!-- Stats strip -->
                    <div id="hiyari-hero-stats" class="grid grid-cols-2 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0"></div>
                </div>

                <!-- Tab bar -->
                <div class="flex overflow-x-auto gap-0 -mb-px scrollbar-none">
                    ${tabHtml}
                </div>
            </div>
        </div>

        <!-- Tab Content -->
        <div id="hiyari-tab-content" class="min-h-[400px]"></div>

    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────────────────────────────────────
async function switchTab(tab) {
    _activeTab = tab;
    window._saveTab?.('hiyari', tab);

    const active   = 'hiyari-tab flex items-center gap-1.5 px-4 py-3 text-xs font-bold whitespace-nowrap transition-all border-b-2 border-white text-white';
    const inactive = 'hiyari-tab flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 border-transparent text-white/70 hover:text-white hover:border-white/40';

    _getTabs().forEach(t => {
        const btn = document.getElementById(`hiyari-tab-btn-${t.id}`);
        if (!btn) return;
        btn.className = t.id === tab ? active : inactive;
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">${t.icon}</svg>${t.label}`;
    });

    const content = document.getElementById('hiyari-tab-content');
    if (!content) return;

    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 text-slate-400">
            <div class="animate-spin rounded-full h-9 w-9 border-4 border-emerald-500 border-t-transparent mb-3"></div>
            <p class="text-sm">กำลังโหลด...</p>
        </div>`;

    switch (tab) {
        case 'dashboard': await renderDashboard(content); break;
        case 'submit':
            renderSubmitForm(content);
            setTimeout(_applyJohnnyImageRiskDraftToHiyari, 0);
            break;
        case 'history':   await renderHistory(content);  break;
        case 'manage':    await renderManage(content);   break;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO STATS STRIP
// ─────────────────────────────────────────────────────────────────────────────
async function _loadHeroStats() {
    const strip = document.getElementById('hiyari-hero-stats');
    if (!strip) return;

    // Skeleton while loading
    strip.innerHTML = [1,2,3,4,5].map(() => `
        <div class="rounded-xl px-4 py-3 text-center animate-pulse" style="background:rgba(255,255,255,0.12);min-width:80px">
            <div class="h-7 bg-white/20 rounded-lg mb-1.5 mx-auto w-10"></div>
            <div class="h-3 bg-white/15 rounded w-14 mx-auto"></div>
        </div>`).join('');

    try {
        const year = new Date().getFullYear();
        const kpi  = await _loadAssignmentKpi(year);

        const stats = [
            { value: kpi.total      ?? '—', label: 'ทั้งหมด',       color: '#6ee7b7' },
            { value: kpi.open       ?? '—', label: 'รอดำเนินการ',    color: (kpi.open > 0) ? '#fde68a' : '#6ee7b7' },
            { value: kpi.inProgress ?? '—', label: 'กำลังดำเนินการ', color: (kpi.inProgress > 0) ? '#fde68a' : '#6ee7b7' },
            { value: kpi.closed     ?? '—', label: 'ปิดแล้ว',        color: '#6ee7b7' },
            { value: `${kpi.closureRate}%`, label: 'อัตราปิด',        color: kpi.closureRate >= 80 ? '#6ee7b7' : kpi.closureRate >= 50 ? '#fde68a' : '#fca5a5' },
        ];

        strip.innerHTML = stats.map(s => `
            <div class="rounded-xl px-4 py-3 text-center" style="background:rgba(255,255,255,0.12);backdrop-filter:blur(6px);min-width:80px">
                <p class="text-2xl font-bold" style="color:${s.color}">${s.value}</p>
                <p class="text-[11px] mt-0.5" style="color:rgba(167,243,208,0.85)">${s.label}</p>
            </div>`).join('');

        const atCard = await buildActivityCard('hiyari');
        if (atCard) {
            strip.insertAdjacentHTML('beforeend', atCard);
            strip.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 w-full md:w-auto flex-shrink-0';
        }
    } catch {
        strip.innerHTML = '';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function renderDashboard(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <!-- Dashboard control + report summary -->
            <div class="ds-section overflow-hidden border border-emerald-100" data-hiyari-card-image="hiyari-dashboard-summary">
                <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 border-b border-slate-100 bg-white">
                    <div>
                        <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Hiyari Dashboard</p>
                        <h3 class="text-lg font-black text-slate-800 mt-1">Near-Miss Summary / ภาพรวม Hiyari</h3>
                        <p class="text-xs text-slate-500 mt-1">สรุปรายงาน Near-Miss, สถานะการติดตาม, SLA และ Rank สำคัญ สำหรับทุกคนในองค์กร</p>
                    </div>
                    <div class="flex flex-wrap items-center gap-2" data-hiyari-card-ignore>
                        <select id="stats-year" class="form-input py-2 text-sm w-32">
                            ${[0,1,2].map(i => {
                                const y = new Date().getFullYear() - i;
                                return `<option value="${y}" ${y === _statsYear ? 'selected' : ''}>${y}</option>`;
                            }).join('')}
                        </select>
                        <select id="stats-month" class="form-input py-2 text-sm w-28"><option value="all">All months</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${String(i+1)===String(_statsMonth)?'selected':''}>${i+1}</option>`).join('')}</select>
                        <select id="stats-department" class="form-input py-2 text-sm w-44"><option value="all">All departments</option>${_departments.map(d=>`<option value="${escHtml(d)}" ${d===_statsDept?'selected':''}>${escHtml(d)}</option>`).join('')}</select>
                        <select id="stats-status" class="form-input py-2 text-sm w-36"><option value="all">All statuses</option>${['Open','In Progress','Closed'].map(v=>`<option value="${v}" ${v===_statsStatus?'selected':''}>${v}</option>`).join('')}</select>
                        <select id="stats-rank" class="form-input py-2 text-sm w-28"><option value="all">All ranks</option>${['A','B','C'].map(v=>`<option value="${v}" ${v===_statsRank?'selected':''}>Rank ${v}</option>`).join('')}</select>
                        <button id="hiyari-year-export-btn"
                            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 transition-all">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                            </svg>
                            Excel
                        </button>
                        <button id="hiyari-pdf-btn"
                            class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 transition-all">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                            </svg>
                            PDF
                        </button>
                    </div>
                </div>
                <div id="hiyari-executive-summary" class="p-5">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-3 animate-pulse">
                        ${[1,2,3,4].map(() => `<div class="h-20 bg-slate-50 rounded-xl"></div>`).join('')}
                    </div>
                </div>
            </div>
            <!-- Overdue alert (populated after stats load) -->
            <div id="overdue-alert" class="hidden"></div>

            <!-- KPI row -->
            <div id="kpi-row" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                ${[1,2,3,4,5,6].map(() => `<div class="ds-metric-card p-4 animate-pulse"><div class="h-8 bg-slate-100 rounded mb-2"></div><div class="h-4 bg-slate-50 rounded w-2/3"></div></div>`).join('')}
            </div>
            <div id="hiyari-dashboard-empty" class="hidden"></div>
            <!-- Stop + Rank row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-stop-type-chart">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สรุปตาม Stop Type</h3>
                    <div class="relative" style="height:180px"><canvas id="chart-stop"></canvas></div>
                </div>
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-rank-summary">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">สรุปตาม Rank</h3>
                    <div id="rank-summary" class="space-y-3 mt-1"></div>
                </div>
            </div>
            <!-- STOP x Rank matrix -->
            <div class="ds-section" data-hiyari-card-image="hiyari-stop-rank-matrix">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">STOP × Rank Matrix</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ภาพรวมความรุนแรงตามประเภทอันตราย เพื่อใช้ชี้จุดที่ต้องติดตามร่วมกันในองค์กร</p>
                    </div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase">A=7 วัน · B=15 วัน · C=30 วัน</span>
                </div>
                <div id="stop-rank-matrix"></div>
            </div>
            <!-- SLA compliance -->
            <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-sla-compliance">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">SLA Compliance</h3>
                            <p class="text-xs text-slate-400 mt-0.5">สถานะการควบคุมระยะเวลาดำเนินการตาม Rank</p>
                        </div>
                    </div>
                    <div id="sla-compliance-gauge"></div>
                </div>
                <div class="xl:col-span-2 ds-section p-5" data-hiyari-card-image="hiyari-overdue-list">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Top Overdue / Near Due</h3>
                            <p class="text-xs text-slate-400 mt-0.5">รายการที่เกินกำหนดหรือใกล้ครบกำหนด เพื่อใช้ follow-up ในที่ประชุม</p>
                        </div>
                        <button id="sla-goto-history-btn"
                            class="px-3 py-1.5 rounded-xl text-xs font-bold text-orange-700 border border-orange-200 hover:bg-orange-50 transition-colors">
                            ดูทั้งหมด
                        </button>
                    </div>
                    <div id="top-overdue-list"></div>
                </div>
            </div>
            <!-- Heatmap -->
            <div class="ds-section p-5" data-hiyari-card-image="hiyari-near-miss-heatmap">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">Near-Miss Heatmap</h3>
                        <p class="text-xs text-slate-400 mt-0.5">12 เดือน × Stop Type สีเข้มตามจำนวนรายงาน เพื่อดู pattern การเกิดซ้ำ</p>
                    </div>
                    <div class="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                        <span>น้อย</span>
                        <span class="w-4 h-4 rounded bg-emerald-50 border border-emerald-100"></span>
                        <span class="w-4 h-4 rounded bg-orange-100 border border-orange-200"></span>
                        <span class="w-4 h-4 rounded bg-red-200 border border-red-300"></span>
                        <span>มาก</span>
                    </div>
                </div>
                <div id="near-miss-heatmap"></div>
            </div>
            <!-- Analytics focus -->
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-area-focus">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Top Area Focus</h3>
                            <p class="text-xs text-slate-400 mt-0.5">พื้นที่ที่มี Near-Miss สูงสุด พร้อม drill-down ไปประวัติ</p>
                        </div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Area / Location</span>
                    </div>
                    <div id="area-focus"></div>
                </div>
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-monthly-rank-focus">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Monthly Rank Focus</h3>
                            <p class="text-xs text-slate-400 mt-0.5">แนวโน้ม Rank A/B/C รายเดือนเพื่อจับเดือนที่ต้องติดตาม</p>
                        </div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase">A / B / C</span>
                    </div>
                    <div id="monthly-rank-focus"></div>
                </div>
            </div>
            <!-- Charts row -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div class="lg:col-span-2 ds-section p-5" data-hiyari-card-image="hiyari-monthly-trend">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">แนวโน้มรายงานรายเดือน</h3>
                    <div class="relative" style="height:220px"><canvas id="chart-line"></canvas></div>
                </div>
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-consequence-chart">
                    <h3 class="text-sm font-bold text-slate-600 mb-4">ผลที่อาจเกิดขึ้น</h3>
                    <div class="relative" style="height:220px"><canvas id="chart-pie"></canvas></div>
                </div>
            </div>
            <!-- Dept summary -->
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-department-summary">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-sm font-bold text-slate-600">สรุปรายแผนก</h3>
                        ${_isAdmin ? `<button id="hiyari-dept-config-btn" data-hiyari-card-ignore
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            ตั้งค่าแผนก
                        </button>` : ''}
                    </div>
                    <div id="dept-rank" class="space-y-2"></div>
                </div>
                <div class="ds-section p-5" data-hiyari-card-image="hiyari-department-risk-ranking">
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <h3 class="text-sm font-bold text-slate-700">Department Risk Ranking</h3>
                            <p class="text-xs text-slate-400 mt-0.5">คะแนนถ่วงน้ำหนัก: Rank A=5, B=3, C=1, เกิน SLA +2</p>
                        </div>
                        <span class="text-[10px] font-bold text-slate-400 uppercase">Weighted score</span>
                    </div>
                    <div id="dept-risk-ranking"></div>
                </div>
            </div>
        </div>`;

    try {
        const [statsRes, cfgRes, assignmentKpi] = await Promise.all([
            API.get(`/hiyari/stats?${new URLSearchParams({year:String(_statsYear),month:_statsMonth,department:_statsDept,status:_statsStatus,rank:_statsRank})}`),
            API.get('/hiyari/dashboard-config').catch(() => ({ data: {} })),
            _loadAssignmentKpi(_statsYear),
        ]);
        const data = statsRes?.data || {};
        _dashConfig = cfgRes?.data || { pinnedDepts: [] };
        if (!Array.isArray(_dashConfig.pinnedDepts)) _dashConfig.pinnedDepts = [];

        renderKPI(data.kpi || {});
        renderExecutiveSummaryV2(data, assignmentKpi || {});
        renderDashboardEmptyState(data.kpi || {});
        renderStopChart(data.stopDist || []);
        renderRankSummary(data.rankDist || []);
        renderStopRankMatrix(data.reports || assignmentKpi?.reports || []);
        renderDeptRiskRanking(data.reports || assignmentKpi?.reports || []);
        renderSLACompliance(data.reports || assignmentKpi?.reports || []);
        renderNearMissHeatmap(data.reports || assignmentKpi?.reports || []);
        renderAreaFocus(data.areaRank || []);
        renderMonthlyRankFocus(data.monthlyRank || []);
        renderLineChart(data.monthly || []);
        renderPieChart(data.consequence || []);
        renderDeptRank(data.deptRank || []);

        // Overdue alert strip
        const alertEl = document.getElementById('overdue-alert');
        const oc = data.kpi?.overdueCount || 0;
        if (alertEl) {
            if (oc > 0) {
                alertEl.className = '';
                alertEl.innerHTML = `
                <div class="flex items-center gap-3 p-4 rounded-xl border" style="background:#fef2f2;border-color:#fca5a5">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#fee2e2">
                        <svg class="w-5 h-5" style="color:#b91c1c" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold" style="color:#b91c1c">มีรายงาน ${oc} รายการ เกินกำหนดดำเนินการ</p>
                        <p class="text-xs mt-0.5" style="color:#dc2626">รายงานยังไม่ได้รับการแก้ไขภายในระยะเวลาที่กำหนดตาม Rank (A=7วัน / B=15วัน / C=30วัน)</p>
                    </div>
                    <button id="overdue-goto-btn"
                            class="px-4 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-opacity hover:opacity-80"
                            style="background:#b91c1c">ดูรายการ</button>
                </div>`;
                document.getElementById('overdue-goto-btn')?.addEventListener('click', () => {
                    _resetHistoryFilters({ keepYear: true });
                    _historyYear = String(_statsYear);
                    _filterStatus = 'Open';
                    const content = document.getElementById('hiyari-tab-content');
                    if (content) switchTab('history');
                });
            } else {
                alertEl.className = 'hidden';
                alertEl.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

function renderKPI(kpi) {
    const cards = [
        { label: 'Open', value: (kpi.open||0)+(kpi.inProgress||0), color:'#0284c7', status:'Open', icon:'' },
        { label: 'Overdue', value:kpi.overdueCount||0, color:'#dc2626', status:'Open', icon:'' },
        { label: 'Near due', value:kpi.nearDueCount||0, color:'#d97706', status:'Open', icon:'' },
        { label: 'Pending Excel review', value:kpi.pendingReview||0, color:'#7c3aed', status:'all', icon:'' },
        { label: 'Pending signed PDF', value:kpi.pendingSignedPdf||0, color:'#ea580c', status:'all', icon:'' },
        { label: 'Rejected / resubmit', value:kpi.rejectedWaitingResubmit||0, color:'#be123c', status:'all', icon:'' },
    ];
    const row = document.getElementById('kpi-row');
    if (!row) return;
    row.innerHTML = cards.map(c => `
        <div class="ds-metric-card p-3 2xl:p-4 flex items-center gap-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all kpi-clickable"
             data-hiyari-card-image="hiyari-kpi-${_hiyariSafeFilePart(c.status)}"
             data-status="${c.status}" title="คลิกเพื่อกรองในประวัติ">
            <div class="w-10 h-10 2xl:w-11 2xl:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                 style="background:${c.color}18; color:${c.color}">
                <span class="text-base 2xl:text-lg font-black">${String(c.label).charAt(0)}</span>
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-xl 2xl:text-2xl font-bold text-slate-800">${c.value}</div>
                <div class="text-[11px] 2xl:text-xs leading-tight text-slate-500 mt-0.5">${c.label}</div>
            </div>
            <svg class="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
        </div>`).join('');

    row.querySelectorAll('.kpi-clickable').forEach(card => {
        card.addEventListener('click', () => {
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            _filterStatus = card.dataset.status;
            switchTab('history');
        });
    });
}

function renderExecutiveSummaryV2(data, assignmentKpi) {
    const el = document.getElementById('hiyari-executive-summary');
    if (!el) return;

    const reportKpi = data?.kpi || {};
    const rankMap = Object.fromEntries((data?.rankDist || []).map(d => [d.Rank, Number(d.count) || 0]));
    const overdue = Number(reportKpi.overdueCount) || 0;
    const rankA = Number(rankMap.A) || 0;
    const totalReports = Number(reportKpi.total) || 0;
    const openReports = Number(reportKpi.open) || 0;

    const health = overdue > 0 || rankA > 0
        ? { label: 'Action Required', bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' }
        : totalReports === 0
            ? { label: 'No Report', bg: '#f8fafc', fg: '#64748b', border: '#e2e8f0' }
            : { label: 'On Track', bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0' };

    const summaryItems = [
        { label: 'Total Reports', value: totalReports, sub: 'รายงาน Hiyari ทั้งหมดในปีนี้', color: '#0f766e' },
        { label: 'Open Reports', value: openReports, sub: 'รายงานที่ยังเปิดติดตาม', color: openReports ? '#d97706' : '#64748b', action: 'openReports' },
        { label: 'SLA Overdue', value: overdue, sub: overdue ? 'ต้องเร่งปิด' : 'ไม่มีรายการเกินกำหนด', color: overdue ? '#b91c1c' : '#047857', action: 'overdue' },
        { label: 'Critical Rank A', value: rankA, sub: rankA ? 'Critical watch' : 'ไม่พบ Rank A', color: rankA ? '#dc2626' : '#64748b', action: 'rankA' },
    ];

    el.innerHTML = `
        <div class="grid grid-cols-1 xl:grid-cols-[280px,1fr] gap-4">
            <div class="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Near-Miss Summary</p>
                        <h3 class="text-base font-bold text-slate-800 mt-1">ภาพรวม Hiyari ปี ${_statsYear}</h3>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                          style="background:${health.bg};color:${health.fg};border:1px solid ${health.border}">
                        ${health.label}
                    </span>
                </div>
                <p class="text-xs text-slate-500 mt-3 leading-relaxed">
                    สรุปสถานะรายงาน Hiyari ที่เกิดขึ้นจริง แยกจากสถานะ assignment ด้านล่าง
                </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                ${summaryItems.map(item => `
                    <button type="button"
                        class="rounded-2xl border border-slate-100 bg-white text-left p-4 hover:border-orange-200 hover:bg-orange-50/50 transition-colors ${item.action ? 'cursor-pointer' : 'cursor-default'}"
                        ${item.action ? `data-summary-action="${item.action}"` : ''}>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">${item.label}</p>
                        <p class="text-2xl font-black truncate" style="color:${item.color}">${escHtml(String(item.value))}</p>
                        <p class="text-xs text-slate-500 mt-0.5 truncate">${escHtml(String(item.sub))}</p>
                    </button>
                `).join('')}
            </div>
        </div>`;

    el.querySelectorAll('[data-summary-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.summaryAction;
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            if (action === 'overdue' || action === 'openReports') {
                _filterStatus = 'Open';
            } else if (action === 'rankA') {
                _filterRisk = 'Critical';
                _filterRank = 'A';
            }
            switchTab('history');
        });
    });
}

function renderDashboardEmptyState(kpi) {
    const el = document.getElementById('hiyari-dashboard-empty');
    if (!el) return;
    const totalReports = Number(kpi?.total) || 0;
    if (totalReports > 0) {
        el.className = 'hidden';
        el.innerHTML = '';
        return;
    }
    el.className = '';
    el.innerHTML = `
        <div class="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
                <p class="text-sm font-bold text-slate-700">ยังไม่มีรายงาน Hiyari ในปี ${_statsYear}</p>
                <p class="text-xs text-slate-500 mt-0.5">No near-miss report recorded for this dashboard year. กราฟและ heatmap จะแสดงเมื่อมีข้อมูลจริง</p>
            </div>
            <button type="button" data-tab="submit"
                class="hiyari-tab px-4 py-2 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 transition-colors">
                รายงานใหม่
            </button>
        </div>`;
}

function renderExecutiveSummary(data, assignmentKpi) {
    const el = document.getElementById('hiyari-executive-summary');
    if (!el) return;

    const kpi = data?.kpi || {};
    const rankMap = Object.fromEntries((data?.rankDist || []).map(d => [d.Rank, Number(d.count) || 0]));
    const stopMap = Object.fromEntries((data?.stopDist || []).map(d => [Number(d.StopType), Number(d.count) || 0]));
    const topStop = STOP_TYPES
        .map(s => ({ ...s, count: stopMap[s.id] || 0 }))
        .sort((a, b) => b.count - a.count)[0];
    const topDept = (data?.deptRank || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0];
    const assignedTotal = assignmentKpi?.total || 0;
    const submitted = Math.max((assignmentKpi?.inProgress || 0) + (assignmentKpi?.closed || 0), 0);
    const submitPct = assignedTotal ? Math.round((submitted / assignedTotal) * 100) : 0;
    const rankA = rankMap.A || 0;
    const overdue = Number(kpi.overdueCount) || 0;

    const health = overdue > 0 || rankA > 0
        ? { label: 'ต้องติดตาม', bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' }
        : submitPct >= 80
            ? { label: 'อยู่ในเกณฑ์ดี', bg: '#ecfdf5', fg: '#047857', border: '#bbf7d0' }
            : { label: 'กำลังสะสมข้อมูล', bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' };

    const summaryItems = [
        { label: 'ส่งตาม Assignment', value: `${submitted}/${assignedTotal}`, sub: `${submitPct}%`, color: '#0f766e' },
        { label: 'เกิน SLA', value: overdue, sub: overdue ? 'ต้องเร่งปิด' : 'ไม่มีรายการ', color: overdue ? '#b91c1c' : '#047857', action: 'overdue' },
        { label: 'Rank A', value: rankA, sub: rankA ? 'Critical watch' : 'ไม่พบ', color: rankA ? '#dc2626' : '#64748b', action: 'rankA' },
        { label: 'แผนกสูงสุด', value: topDept?.Department || '-', sub: topDept ? `${topDept.count || 0} รายการ` : 'ยังไม่มีข้อมูล', color: '#ea580c', action: topDept?.Department ? 'dept' : '' },
        { label: 'Stop Type สูงสุด', value: topStop?.code || '-', sub: topStop?.count ? `${topStop.count} รายการ` : 'ยังไม่มีข้อมูล', color: topStop?.color || '#64748b' },
    ];

    el.innerHTML = `
        <div class="ds-section overflow-hidden border border-emerald-100">
            <div class="flex flex-col xl:flex-row">
                <div class="xl:w-72 p-5 border-b xl:border-b-0 xl:border-r border-slate-100 bg-slate-50/70">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Report Summary</p>
                            <h3 class="text-base font-bold text-slate-800 mt-1">ภาพรวม Hiyari ปี ${_statsYear}</h3>
                        </div>
                        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap"
                              style="background:${health.bg};color:${health.fg};border:1px solid ${health.border}">
                            ${health.label}
                        </span>
                    </div>
                    <p class="text-xs text-slate-500 mt-3 leading-relaxed">
                        ฐาน KPI อิงจากพนักงานที่มอบหมายในแท็บจัดการ และสถานะการปิดรายงานจริงในระบบ
                    </p>
                </div>
                <div class="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    ${summaryItems.map(item => `
                        <button type="button"
                            class="h-full text-left p-4 hover:bg-orange-50/60 transition-colors ${item.action ? 'cursor-pointer' : 'cursor-default'}"
                            ${item.action ? `data-summary-action="${item.action}"` : ''}
                            ${item.action === 'dept' ? `data-dept="${escHtml(topDept.Department)}"` : ''}>
                            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">${item.label}</p>
                            <p class="text-xl font-black truncate" style="color:${item.color}">${escHtml(String(item.value))}</p>
                            <p class="text-xs text-slate-500 mt-0.5 truncate">${escHtml(String(item.sub))}</p>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>`;

    el.querySelectorAll('[data-summary-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.summaryAction;
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            if (action === 'overdue') {
                _filterStatus = 'Open';
            } else if (action === 'rankA') {
                _filterRisk = 'Critical';
                _filterRank = 'A';
            } else if (action === 'dept') {
                _filterDept = btn.dataset.dept || 'all';
            }
            switchTab('history');
        });
    });
}

function renderStopRankMatrix(reports) {
    const el = document.getElementById('stop-rank-matrix');
    if (!el) return;

    const matrix = {};
    STOP_TYPES.forEach(st => {
        matrix[st.id] = { A: 0, B: 0, C: 0, total: 0 };
    });

    reports.forEach(r => {
        const stopId = Number(r.StopType);
        const rank = r.Rank || ({ Critical: 'A', High: 'B', Low: 'C', Medium: 'C' }[r.RiskLevel]);
        if (!matrix[stopId] || !['A', 'B', 'C'].includes(rank)) return;
        matrix[stopId][rank] += 1;
        matrix[stopId].total += 1;
    });

    const maxCell = Math.max(
        1,
        ...STOP_TYPES.flatMap(st => ['A', 'B', 'C'].map(rank => matrix[st.id][rank] || 0))
    );
    const rankMeta = {
        A: { label: 'Rank A', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
        B: { label: 'Rank B', color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
        C: { label: 'Rank C', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    };
    const totalAll = STOP_TYPES.reduce((sum, st) => sum + matrix[st.id].total, 0);

    if (!totalAll) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6m-7 0h8m-8 0H5a2 2 0 01-2-2V7a2 2 0 012-2h3m11 12h-3m3 0a2 2 0 002-2V7a2 2 0 00-2-2h-3"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลสำหรับสร้าง STOP × Rank Matrix</p>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="overflow-x-auto">
            <table class="ds-table text-sm min-w-[720px]">
                <thead>
                    <tr class="text-left text-xs font-bold text-slate-400 uppercase tracking-wide">
                        <th class="px-3 py-2">Stop Type</th>
                        ${['A', 'B', 'C'].map(rank => `
                            <th class="px-3 py-2 text-center" style="color:${rankMeta[rank].color}">${rankMeta[rank].label}</th>
                        `).join('')}
                        <th class="px-3 py-2 text-center">รวม</th>
                        <th class="px-3 py-2">สัดส่วน</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${STOP_TYPES.map(st => {
                        const row = matrix[st.id];
                        const rowPct = totalAll ? Math.round((row.total / totalAll) * 100) : 0;
                        return `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="px-3 py-3">
                                <div class="flex items-center gap-2">
                                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${st.color}"></span>
                                    <div class="min-w-0">
                                        <p class="text-xs font-black text-slate-700">${st.code}</p>
                                        <p class="text-[10px] text-slate-400 truncate">${escHtml(st.label)}</p>
                                    </div>
                                </div>
                            </td>
                            ${['A', 'B', 'C'].map(rank => {
                                const count = row[rank] || 0;
                                const intensity = count ? Math.max(0.18, count / maxCell) : 0;
                                return `
                                <td class="px-3 py-3 text-center">
                                    <div class="mx-auto w-16 h-10 rounded-xl border flex items-center justify-center font-black text-sm"
                                         style="background:${count ? rankMeta[rank].bg : '#f8fafc'};border-color:${count ? rankMeta[rank].border : '#e2e8f0'};color:${count ? rankMeta[rank].color : '#cbd5e1'};opacity:${count ? 0.72 + (intensity * 0.28) : 1}">
                                        ${count}
                                    </div>
                                </td>`;
                            }).join('')}
                            <td class="px-3 py-3 text-center font-black text-slate-700">${row.total}</td>
                            <td class="px-3 py-3">
                                <div class="flex items-center gap-2">
                                    <div class="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                        <div class="h-full rounded-full" style="width:${rowPct}%;background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                                    </div>
                                    <span class="text-xs font-bold text-slate-500 w-9 text-right">${rowPct}%</span>
                                </div>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderDeptRiskRanking(reports) {
    const el = document.getElementById('dept-risk-ranking');
    if (!el) return;

    const deptMap = new Map();
    const rankWeight = { A: 5, B: 3, C: 1, Critical: 5, High: 3, Medium: 1, Low: 1 };

    reports.forEach(r => {
        const dept = (r.Department || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
        if (!deptMap.has(dept)) {
            deptMap.set(dept, { dept, score: 0, total: 0, rankA: 0, rankB: 0, rankC: 0, overdue: 0, open: 0 });
        }
        const row = deptMap.get(dept);
        const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]);
        const sla = _getSLA(r);

        row.total += 1;
        row.score += rankWeight[rank] || rankWeight[r.RiskLevel] || 1;
        if (rank === 'A') row.rankA += 1;
        else if (rank === 'B') row.rankB += 1;
        else row.rankC += 1;
        if (sla?.overdue) {
            row.overdue += 1;
            row.score += 2;
        }
        if (r.Status !== 'Closed') row.open += 1;
    });

    const rows = Array.from(deptMap.values())
        .sort((a, b) => b.score - a.score || b.rankA - a.rankA || b.overdue - a.overdue || b.total - a.total)
        .slice(0, 8);
    const maxScore = Math.max(1, ...rows.map(r => r.score));

    if (!rows.length) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลสำหรับจัดอันดับความเสี่ยงรายแผนก</p>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="space-y-2">
            ${rows.map((row, idx) => {
                const pct = Math.round((row.score / maxScore) * 100);
                const riskColor = row.rankA || row.overdue ? '#dc2626' : row.rankB ? '#ea580c' : '#16a34a';
                return `
                <button type="button" data-risk-dept="${escHtml(row.dept)}"
                        class="w-full text-left rounded-xl border border-slate-100 hover:border-orange-200 hover:bg-orange-50/60 transition-colors p-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                             style="background:${riskColor}14;color:${riskColor}">#${idx + 1}</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <p class="text-sm font-bold text-slate-800 truncate">${escHtml(row.dept)}</p>
                                <span class="text-sm font-black" style="color:${riskColor}">${row.score}</span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div class="h-full rounded-full" style="width:${pct}%;background:${riskColor}"></div>
                            </div>
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-semibold text-slate-500">รวม ${row.total}</span>
                                <span class="px-1.5 py-0.5 rounded bg-red-50 text-[10px] font-semibold text-red-600">A ${row.rankA}</span>
                                <span class="px-1.5 py-0.5 rounded bg-orange-50 text-[10px] font-semibold text-orange-600">B ${row.rankB}</span>
                                <span class="px-1.5 py-0.5 rounded bg-emerald-50 text-[10px] font-semibold text-emerald-600">C ${row.rankC}</span>
                                <span class="px-1.5 py-0.5 rounded bg-rose-50 text-[10px] font-semibold text-rose-600">เกิน SLA ${row.overdue}</span>
                                <span class="px-1.5 py-0.5 rounded bg-sky-50 text-[10px] font-semibold text-sky-600">Open ${row.open}</span>
                            </div>
                        </div>
                    </div>
                </button>`;
            }).join('')}
        </div>`;

    el.querySelectorAll('[data-risk-dept]').forEach(btn => {
        btn.addEventListener('click', () => {
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            _filterDept = btn.dataset.riskDept || 'all';
            switchTab('history');
        });
    });
}

function renderSLACompliance(reports) {
    const gaugeEl = document.getElementById('sla-compliance-gauge');
    const listEl = document.getElementById('top-overdue-list');
    if (!gaugeEl || !listEl) return;

    const active = reports.filter(r => r.Status !== 'Closed');
    const closed = reports.filter(r => r.Status === 'Closed');
    const overdue = active.filter(r => _getSLA(r)?.overdue);
    const nearDue = active.filter(r => {
        const sla = _getSLA(r);
        return sla?.warning && !sla.overdue;
    });
    const onTrack = active.filter(r => {
        const sla = _getSLA(r);
        return !sla || (!sla.overdue && !sla.warning);
    });
    const denominator = active.length + closed.length;
    const compliant = closed.length + onTrack.length;
    const pct = denominator ? Math.round((compliant / denominator) * 100) : 0;
    const gaugeColor = pct >= 90 ? '#059669' : pct >= 75 ? '#d97706' : '#dc2626';
    const dash = Math.max(0, Math.min(100, pct));

    gaugeEl.innerHTML = `
        <div class="flex flex-col items-center">
            <div class="relative w-40 h-40">
                <svg viewBox="0 0 120 120" class="w-40 h-40 -rotate-90">
                    <circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" stroke-width="12"/>
                    <circle cx="60" cy="60" r="48" fill="none" stroke="${gaugeColor}" stroke-width="12"
                            stroke-linecap="round" stroke-dasharray="${dash * 3.015} 301.5"/>
                </svg>
                <div class="absolute inset-0 flex flex-col items-center justify-center">
                    <p class="text-3xl font-black" style="color:${gaugeColor}">${pct}%</p>
                    <p class="text-[10px] font-bold text-slate-400 uppercase">Compliance</p>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 w-full mt-4">
                <div class="rounded-xl bg-emerald-50 border border-emerald-100 p-2 text-center">
                    <p class="text-lg font-black text-emerald-700">${closed.length + onTrack.length}</p>
                    <p class="text-[10px] text-emerald-700 font-semibold">ปกติ</p>
                </div>
                <div class="rounded-xl bg-amber-50 border border-amber-100 p-2 text-center">
                    <p class="text-lg font-black text-amber-700">${nearDue.length}</p>
                    <p class="text-[10px] text-amber-700 font-semibold">ใกล้ครบ</p>
                </div>
                <div class="rounded-xl bg-red-50 border border-red-100 p-2 text-center">
                    <p class="text-lg font-black text-red-700">${overdue.length}</p>
                    <p class="text-[10px] text-red-700 font-semibold">เกิน SLA</p>
                </div>
            </div>
        </div>`;

    const priorityRows = [...overdue, ...nearDue]
        .map(r => ({ report: r, sla: _getSLA(r) }))
        .filter(x => x.sla)
        .sort((a, b) => a.sla.remaining - b.sla.remaining)
        .slice(0, 6);

    if (!priorityRows.length) {
        listEl.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <p class="text-sm">ไม่มีรายการเกิน SLA หรือใกล้ครบกำหนด</p>
            </div>`;
    } else {
        listEl.innerHTML = `
            <div class="space-y-2">
                ${priorityRows.map(({ report: r, sla }) => {
                    const st = STOP_TYPES.find(s => s.id === Number(r.StopType));
                    const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]) || '-';
                    const isOver = sla.overdue;
                    const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
                    return `
                    <button type="button" data-overdue-id="${r.id}"
                            class="w-full text-left rounded-xl border ${isOver ? 'border-red-100 bg-red-50/50 hover:bg-red-50' : 'border-amber-100 bg-amber-50/50 hover:bg-amber-50'} p-3 transition-colors">
                        <div class="flex flex-col md:flex-row md:items-center gap-2">
                            <div class="flex-1 min-w-0">
                                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                                    <span class="px-1.5 py-0.5 rounded text-[10px] font-black ${rank === 'A' ? 'bg-red-100 text-red-700' : rank === 'B' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}">Rank ${rank}</span>
                                    ${st ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold" style="background:${st.bg};color:${st.color};border:1px solid ${st.border}">${st.code}</span>` : ''}
                                    <span class="text-[10px] text-slate-400">${date}</span>
                                </div>
                                <p class="text-sm font-bold text-slate-800 truncate">${escHtml(r.Department || '-')} · ${escHtml(r.ReporterName || '-')}</p>
                                <p class="text-xs text-slate-500 truncate mt-0.5">${escHtml(r.Description || '-')}</p>
                            </div>
                            <div class="md:w-28 flex-shrink-0 text-right">
                                <span class="inline-flex px-2 py-1 rounded-full text-[10px] font-black"
                                      style="background:${isOver ? '#fee2e2' : '#fef3c7'};color:${isOver ? '#b91c1c' : '#92400e'}">
                                    ${isOver ? `เกิน ${Math.abs(sla.remaining)} วัน` : `เหลือ ${sla.remaining} วัน`}
                                </span>
                            </div>
                        </div>
                    </button>`;
                }).join('')}
            </div>`;
    }

    listEl.querySelectorAll('[data-overdue-id]').forEach(btn => {
        btn.addEventListener('click', () => showDetailModal(btn.dataset.overdueId));
    });

    document.getElementById('sla-goto-history-btn')?.addEventListener('click', () => {
        _resetHistoryFilters({ keepYear: true });
        _historyYear = String(_statsYear);
        _filterStatus = 'Open';
        switchTab('history');
    });
}

function renderNearMissHeatmap(reports) {
    const el = document.getElementById('near-miss-heatmap');
    if (!el) return;

    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const matrix = {};
    STOP_TYPES.forEach(st => {
        matrix[st.id] = Array(12).fill(0);
    });

    reports.forEach(r => {
        const stopId = Number(r.StopType);
        if (!matrix[stopId] || !r.ReportDate) return;
        const dt = new Date(r.ReportDate);
        if (Number.isNaN(dt.getTime())) return;
        matrix[stopId][dt.getMonth()] += 1;
    });

    const values = STOP_TYPES.flatMap(st => matrix[st.id]);
    const max = Math.max(1, ...values);
    const total = values.reduce((sum, v) => sum + v, 0);

    if (!total) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลสำหรับสร้าง Heatmap</p>
            </div>`;
        return;
    }

    const cellStyle = (count) => {
        if (!count) return 'background:#f8fafc;color:#cbd5e1;border-color:#e2e8f0';
        const intensity = count / max;
        if (intensity >= 0.75) return 'background:#fecaca;color:#991b1b;border-color:#fca5a5';
        if (intensity >= 0.45) return 'background:#fed7aa;color:#9a3412;border-color:#fdba74';
        if (intensity >= 0.2) return 'background:#fef3c7;color:#92400e;border-color:#fde68a';
        return 'background:#dcfce7;color:#166534;border-color:#bbf7d0';
    };

    el.innerHTML = `
        <div class="overflow-x-auto">
            <div class="min-w-[860px]">
                <div class="grid gap-1.5" style="grid-template-columns:130px repeat(12,minmax(42px,1fr));">
                    <div></div>
                    ${months.map(m => `<div class="text-center text-[10px] font-bold text-slate-400 uppercase">${m}</div>`).join('')}
                    ${STOP_TYPES.map(st => `
                        <div class="flex items-center gap-2 min-w-0 pr-2">
                            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${st.color}"></span>
                            <div class="min-w-0">
                                <p class="text-xs font-black text-slate-700">${st.code}</p>
                                <p class="text-[9px] text-slate-400 truncate">${escHtml(st.label)}</p>
                            </div>
                        </div>
                        ${matrix[st.id].map((count, idx) => `
                            <button type="button"
                                    data-heat-stop="${st.id}"
                                    data-heat-month="${idx + 1}"
                                    class="h-10 rounded-lg border text-xs font-black transition-transform hover:scale-[1.04]"
                                    style="${cellStyle(count)}"
                                    title="${st.code} · ${months[idx]}: ${count} รายการ">
                                ${count || ''}
                            </button>
                        `).join('')}
                    `).join('')}
                </div>
            </div>
        </div>`;

    el.querySelectorAll('[data-heat-stop]').forEach(btn => {
        btn.addEventListener('click', () => {
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            _filterStopType = btn.dataset.heatStop || 'all';
            _filterMonth = btn.dataset.heatMonth || 'all';
            switchTab('history');
        });
    });
}

function renderAreaFocus(areaRank) {
    const el = document.getElementById('area-focus');
    if (!el) return;

    const rows = (areaRank || []).slice(0, 8);
    const max = Math.max(1, ...rows.map(r => Number(r.count) || 0));

    if (!rows.length) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูลพื้นที่สำหรับปีนี้</p>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="space-y-2">
            ${rows.map((row, idx) => {
                const count = Number(row.count) || 0;
                const pct = Math.round((count / max) * 100);
                const area = row.Location || 'Unspecified';
                const color = idx === 0 ? '#dc2626' : idx < 3 ? '#ea580c' : '#0f766e';
                return `
                <button type="button" data-area-focus="${escHtml(area)}"
                    class="w-full text-left rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/60 transition-colors p-3">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                             style="background:${color}14;color:${color}">#${idx + 1}</div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <p class="text-sm font-bold text-slate-800 truncate">${escHtml(area)}</p>
                                <span class="text-sm font-black" style="color:${color}">${count}</span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div>
                            </div>
                        </div>
                    </div>
                </button>`;
            }).join('')}
        </div>`;

    el.querySelectorAll('[data-area-focus]').forEach(btn => {
        btn.addEventListener('click', () => {
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            _filterArea = btn.dataset.areaFocus || 'all';
            switchTab('history');
        });
    });
}

function renderMonthlyRankFocus(monthlyRank) {
    const el = document.getElementById('monthly-rank-focus');
    if (!el) return;

    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const rankMeta = {
        A: { label: 'Rank A', color: '#dc2626', bg: '#fee2e2' },
        B: { label: 'Rank B', color: '#ea580c', bg: '#ffedd5' },
        C: { label: 'Rank C', color: '#059669', bg: '#dcfce7' },
    };
    const matrix = Array.from({ length: 12 }, (_, idx) => ({ month: idx + 1, A: 0, B: 0, C: 0, total: 0 }));
    (monthlyRank || []).forEach(row => {
        const monthIdx = (Number(row.month) || 1) - 1;
        const rank = row.Rank;
        if (!matrix[monthIdx] || !rankMeta[rank]) return;
        const count = Number(row.count) || 0;
        matrix[monthIdx][rank] += count;
        matrix[monthIdx].total += count;
    });

    const rows = matrix.filter(r => r.total > 0).sort((a, b) => b.A - a.A || b.B - a.B || b.total - a.total).slice(0, 6);
    if (!rows.length) {
        el.innerHTML = `
            <div class="text-center py-8 text-slate-400">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-6a2 2 0 012-2h2a2 2 0 012 2v6M7 21h10M5 21h14M5 3h14v4H5z"/>
                    </svg>
                </div>
                <p class="text-sm">ยังไม่มีข้อมูล Rank รายเดือนสำหรับปีนี้</p>
            </div>`;
        return;
    }

    el.innerHTML = `
        <div class="space-y-2">
            ${rows.map(row => `
                <div class="rounded-xl border border-slate-100 p-3">
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <p class="text-sm font-bold text-slate-800">${months[row.month - 1]} ${_statsYear}</p>
                        <span class="text-xs font-black text-slate-500">${row.total} รายการ</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        ${['A','B','C'].map(rank => `
                            <button type="button" data-month-rank="${rank}" data-month-no="${row.month}"
                                class="rounded-lg px-2 py-2 text-left border transition-colors hover:bg-slate-50"
                                style="border-color:${rankMeta[rank].bg}">
                                <p class="text-[10px] font-bold" style="color:${rankMeta[rank].color}">${rankMeta[rank].label}</p>
                                <p class="text-lg font-black" style="color:${rankMeta[rank].color}">${row[rank]}</p>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>`;

    el.querySelectorAll('[data-month-rank]').forEach(btn => {
        btn.addEventListener('click', () => {
            _resetHistoryFilters({ keepYear: true });
            _historyYear = String(_statsYear);
            _filterRank = btn.dataset.monthRank || 'all';
            _filterMonth = btn.dataset.monthNo || 'all';
            switchTab('history');
        });
    });
}

function renderStopChart(data) {
    const ctx = document.getElementById('chart-stop');
    if (!ctx) return;
    if (_chartStop) { _chartStop.destroy(); _chartStop = null; }

    const map = Object.fromEntries(data.map(d => [d.StopType, d.count]));
    _chartStop = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: STOP_TYPES.map(s => s.code),
            datasets: [{
                data: STOP_TYPES.map(s => map[s.id] || 0),
                backgroundColor: STOP_TYPES.map(s => s.color + '99'),
                borderColor:     STOP_TYPES.map(s => s.color),
                borderWidth: 2,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false },
                tooltip: { callbacks: { label: ctx => {
                    const st = STOP_TYPES[ctx.dataIndex];
                    return ` ${st?.label || ''}: ${ctx.parsed.y}`;
                }}}
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit', size: 11 } }, grid: { display: false } },
            },
        }
    });
}

function renderRankSummary(data) {
    const el = document.getElementById('rank-summary');
    if (!el) return;
    const map = Object.fromEntries(data.map(d => [d.Rank, d.count]));
    const total = data.reduce((s, d) => s + (d.count || 0), 0) || 1;
    el.innerHTML = RANKS.map(r => {
        const cnt = map[r.rank] || 0;
        const pct = Math.round(cnt / total * 100);
        return `
        <div>
            <div class="flex justify-between items-center mb-1">
                <span class="text-xs font-bold" style="color:${r.color}">${r.label}</span>
                <span class="text-xs text-slate-500">${cnt} รายการ (${total > 1 || cnt > 0 ? pct : 0}%)</span>
            </div>
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${r.color}"></div>
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">${r.desc} — ${r.detail}</p>
        </div>`;
    }).join('');
}

function renderLineChart(monthly) {
    const ctx = document.getElementById('chart-line');
    if (!ctx) return;
    if (_chartLine) { _chartLine.destroy(); _chartLine = null; }

    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const counts  = Array(12).fill(0);
    monthly.forEach(r => { counts[(r.month || 1) - 1] = r.count || 0; });

    _chartLine = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'จำนวนรายงาน',
                data: counts,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.08)',
                tension: 0.4, fill: true,
                pointBackgroundColor: '#f97316', pointRadius: 4,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { family: 'Kanit' } }, grid: { color: '#f1f5f9' } },
                x: { ticks: { font: { family: 'Kanit', size: 11 } }, grid: { display: false } },
            },
        }
    });
}

function renderPieChart(data) {
    const ctx = document.getElementById('chart-pie');
    if (!ctx) return;
    if (_chartPie) { _chartPie.destroy(); _chartPie = null; }

    _chartPie = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.label),
            datasets: [{ data: data.map(d => d.count), backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { font: { family: 'Kanit', size: 11 }, padding: 10, boxWidth: 12 } } },
            cutout: '55%',
        }
    });
}

function renderDeptRank(allDepts) {
    const el = document.getElementById('dept-rank');
    if (!el) return;

    const pinned = _dashConfig.pinnedDepts || [];
    const countMap = Object.fromEntries(allDepts.map(d => [d.Department, d.count || 0]));
    const depts  = pinned.length
        ? pinned.map(dept => ({ Department: dept, count: countMap[dept] || 0 }))
        : allDepts.slice(0, 8);
    if (!depts.length) {
        el.innerHTML = `<div class="text-center py-6 text-slate-400">
            <p class="text-sm">${pinned.length ? 'ยังไม่มีรายการในแผนกที่เลือก' : 'ยังไม่มีข้อมูล'}</p>
        </div>`;
        return;
    }

    const max = Math.max(...depts.map(d => d.count), 1);
    el.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            ${depts.map(d => `
            <div class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-0.5">
                        <span class="text-xs font-medium text-slate-700 truncate">${escHtml(d.Department)}</span>
                        <span class="text-xs font-bold text-orange-600 ml-2 flex-shrink-0">${d.count}</span>
                    </div>
                    <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div class="h-full rounded-full" style="width:${Math.round((d.count/max)*100)}%;background:linear-gradient(90deg,#f97316,#ef4444)"></div>
                    </div>
                </div>
            </div>`).join('')}
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD CONFIG MODAL (Admin)
// ─────────────────────────────────────────────────────────────────────────────
function openDashConfigModal() {
    const pinned = _dashConfig.pinnedDepts || [];
    const html = `
        <div class="space-y-4 px-1">
            <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                เลือกแผนกที่ต้องการแสดงในส่วน "สรุปรายแผนก" ถ้าไม่เลือกจะแสดง 8 แผนกแรก
            </div>
            <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">แผนกที่แสดง</label>
                <div class="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-1" id="dept-config-list">
                    ${_departments.map(d => `
                    <label class="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer hover:border-orange-300 hover:bg-orange-50 transition-colors">
                        <input type="checkbox" name="dept" value="${escHtml(d)}" ${pinned.includes(d) ? 'checked' : ''}
                               class="w-4 h-4 rounded text-orange-500">
                        <span class="text-sm text-slate-700">${escHtml(d)}</span>
                    </label>`).join('')}
                </div>
            </div>
            <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onclick="window.closeModal&&window.closeModal()"
                        class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                <button id="save-dash-config-btn"
                        class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">บันทึก</button>
            </div>
        </div>`;

    openModal('ตั้งค่าแผนกที่แสดง', html, 'max-w-md');

    document.getElementById('save-dash-config-btn')?.addEventListener('click', guardActionHandler(async () => {
        const checked = [...document.querySelectorAll('#dept-config-list input[name="dept"]:checked')]
            .map(cb => cb.value);
        const btn = document.getElementById('save-dash-config-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังบันทึก...`;
        try {
            await API.put('/hiyari/dashboard-config', { pinnedDepts: checked });
            _dashConfig.pinnedDepts = checked;
            closeModal();
            showToast('บันทึกการตั้งค่าสำเร็จ', 'success');
            // Refresh dept display without full reload
            const allRes = await API.get(`/hiyari/stats?year=${_statsYear}`);
            renderDeptRank(allRes?.data?.deptRank || []);
        } catch (err) {
            showError(err);
        } finally {
            btn.disabled = false;
            btn.textContent = 'บันทึก';
        }
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT — 2-page formal dashboard report
// ─────────────────────────────────────────────────────────────────────────────
async function exportHiyariPDF() {
    if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
        showToast('ไลบรารี PDF ยังไม่พร้อม', 'error');
        return;
    }
    const btn = document.getElementById('hiyari-pdf-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'กำลังสร้าง PDF...';
    }

    const pages = [];
    try {
        const [statsRes, assignmentKpi] = await Promise.all([
            API.get(`/hiyari/stats?${new URLSearchParams({ year: String(_statsYear), month: _statsMonth, department: _statsDept, status: _statsStatus, rank: _statsRank })}`),
            _loadAssignmentKpi(_statsYear),
        ]);
        const data = statsRes?.data || {};
        const reportKpi = data.kpi || {};
        const reports = assignmentKpi?.reports || [];
        const rankMap = Object.fromEntries((data.rankDist || []).map(d => [d.Rank, Number(d.count) || 0]));
        const stopMap = Object.fromEntries((data.stopDist || []).map(d => [Number(d.StopType), Number(d.count) || 0]));
        const monthCounts = Array(12).fill(0);
        const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        (data.monthly || []).forEach(r => { monthCounts[(Number(r.month) || 1) - 1] = Number(r.count) || 0; });

        const assignedTotal = Number(assignmentKpi?.total) || 0;
        const submitted = (Number(assignmentKpi?.inProgress) || 0) + (Number(assignmentKpi?.closed) || 0);
        const submitPct = assignedTotal ? Math.round((submitted / assignedTotal) * 100) : 0;
        const active = reports.filter(r => r.Status !== 'Closed');
        const closed = reports.filter(r => r.Status === 'Closed');
        const overdue = active.filter(r => _getSLA(r)?.overdue);
        const nearDue = active.filter(r => {
            const sla = _getSLA(r);
            return sla?.warning && !sla.overdue;
        });
        const onTrack = active.filter(r => {
            const sla = _getSLA(r);
            return !sla || (!sla.overdue && !sla.warning);
        });
        const slaDenom = active.length + closed.length;
        const slaPct = slaDenom ? Math.round(((closed.length + onTrack.length) / slaDenom) * 100) : 0;

        const matrix = {};
        STOP_TYPES.forEach(st => { matrix[st.id] = { A: 0, B: 0, C: 0, total: 0 }; });
        reports.forEach(r => {
            const stopId = Number(r.StopType);
            const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]);
            if (!matrix[stopId] || !['A','B','C'].includes(rank)) return;
            matrix[stopId][rank] += 1;
            matrix[stopId].total += 1;
        });

        const deptRiskRows = (() => {
            const map = new Map();
            const weights = { A: 5, B: 3, C: 1, Critical: 5, High: 3, Medium: 1, Low: 1 };
            reports.forEach(r => {
                const dept = (r.Department || 'ไม่ระบุ').trim() || 'ไม่ระบุ';
                if (!map.has(dept)) map.set(dept, { dept, score: 0, total: 0, rankA: 0, rankB: 0, rankC: 0, overdue: 0, open: 0 });
                const row = map.get(dept);
                const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]);
                const sla = _getSLA(r);
                row.total += 1;
                row.score += weights[rank] || weights[r.RiskLevel] || 1;
                if (rank === 'A') row.rankA += 1;
                else if (rank === 'B') row.rankB += 1;
                else row.rankC += 1;
                if (sla?.overdue) { row.overdue += 1; row.score += 2; }
                if (r.Status !== 'Closed') row.open += 1;
            });
            return Array.from(map.values())
                .sort((a, b) => b.score - a.score || b.rankA - a.rankA || b.overdue - a.overdue || b.total - a.total)
                .slice(0, 8);
        })();
        const maxDeptScore = Math.max(1, ...deptRiskRows.map(r => r.score));
        const areaRows = (data.areaRank || []).slice(0, 6);
        const overdueRows = reports
            .map(r => ({ report: r, sla: _getSLA(r) }))
            .filter(x => x.sla?.overdue || x.sla?.warning)
            .sort((a, b) => a.sla.remaining - b.sla.remaining)
            .slice(0, 8);

        const buildPage = (innerHtml) => {
            const div = document.createElement('div');
            div.style.cssText = [
                'position:fixed',
                'left:-9999px',
                'top:0',
                'width:794px',
                'height:1122px',
                'background:#ffffff',
                'font-family:Kanit,Arial,sans-serif',
                'font-size:11px',
                'color:#1e293b',
                'display:flex',
                'flex-direction:column',
                'box-sizing:border-box',
                'overflow:hidden',
            ].join(';');
            div.innerHTML = innerHtml;
            document.body.appendChild(div);
            pages.push(div);
            return div;
        };

        const safe = (v) => escHtml(String(v ?? '-'));
        const reportTotal = Number(reportKpi.total) || reports.length || 0;
        const generatedDate = new Date().toLocaleDateString('th-TH', { day:'numeric', month:'long', year:'numeric' });
        const bar = (pct, color, h = 7) => `
            <div style="height:${h}px;background:#e2e8f0;border-radius:999px;overflow:hidden">
                <div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:${color};border-radius:999px"></div>
            </div>`;
        const sectionTitle = (title, sub = '') => `
            <div style="display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid #dbeafe;padding-bottom:7px;margin-bottom:10px">
                <div>
                    <h2 style="font-size:14px;font-weight:900;color:#065f46;margin:0">${title}</h2>
                    ${sub ? `<p style="font-size:9.5px;color:#64748b;margin:2px 0 0">${sub}</p>` : ''}
                </div>
            </div>`;
        const metricCard = (label, value, color, sub = '') => `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:11px;text-align:center;min-height:72px">
                <div style="font-size:24px;font-weight:900;color:${color};line-height:1">${safe(value)}</div>
                <div style="font-size:9.5px;color:#475569;margin-top:6px;font-weight:800">${label}</div>
                ${sub ? `<div style="font-size:8.5px;color:#94a3b8;margin-top:2px">${sub}</div>` : ''}
            </div>`;
        const headerHtml = `
            <div style="background:#065f46;color:#fff;padding:18px 28px;flex-shrink:0">
                <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start">
                    <div>
                        <p style="font-size:10px;opacity:.82;margin:0 0 3px">Thai Summit Harness Co., Ltd. · Safety Summary Report</p>
                        <h1 style="font-size:21px;font-weight:900;margin:0">Hiyari-Hatto (Near-Miss) Report</h1>
                        <p style="font-size:11px;opacity:.9;margin:5px 0 0">รายงานภาพรวมประจำปี ${_statsYear} · สร้างรายงานเมื่อ ${generatedDate}</p>
                    </div>
                    <div style="text-align:right;font-size:9.5px;line-height:1.55;opacity:.92">
                        <div>Rank A SLA: 7 วัน</div>
                        <div>Rank B SLA: 15 วัน</div>
                        <div>Rank C SLA: 30 วัน</div>
                    </div>
                </div>
            </div>`;
        const footerHtml = (page) => `
            <div style="margin-top:auto;padding:8px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:9px;display:flex;justify-content:space-between;flex-shrink:0">
                <span>Hiyari-Hatto Summary Report · Thai Summit Harness Co., Ltd.</span>
                <span>Page ${page} of 2</span>
            </div>`;

        const stopRows = STOP_TYPES.map(s => {
            const cnt = stopMap[s.id] || 0;
            const pct = Math.round((cnt / (reportTotal || 1)) * 100);
            return `<div style="margin-bottom:6px">
                <div style="display:flex;justify-content:space-between;font-size:9.5px;margin-bottom:2px">
                    <b style="color:${s.color}">${safe(s.code)}</b><span>${cnt} (${pct}%)</span>
                </div>${bar(pct, s.color, 6)}
            </div>`;
        }).join('');
        const rankRows = RANKS.map(r => {
            const cnt = rankMap[r.rank] || 0;
            const pct = Math.round((cnt / (reportTotal || 1)) * 100);
            return `<div style="margin-bottom:9px">
                <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">
                    <b style="color:${r.color}">${safe(r.label)}</b><span>${cnt} (${pct}%)</span>
                </div>${bar(pct, r.color, 7)}
            </div>`;
        }).join('');
        const matrixRows = STOP_TYPES.map(s => `
            <tr style="background:#f8fafc">
                <td style="padding:7px 8px;border-bottom:3px solid #fff"><b style="color:${s.color}">${safe(s.code)}</b><div style="font-size:8px;color:#64748b">${safe(s.label)}</div></td>
                <td style="padding:7px;text-align:center;color:#dc2626;font-weight:900;border-bottom:3px solid #fff">${matrix[s.id].A}</td>
                <td style="padding:7px;text-align:center;color:#ea580c;font-weight:900;border-bottom:3px solid #fff">${matrix[s.id].B}</td>
                <td style="padding:7px;text-align:center;color:#16a34a;font-weight:900;border-bottom:3px solid #fff">${matrix[s.id].C}</td>
                <td style="padding:7px;text-align:center;color:#334155;font-weight:900;border-bottom:3px solid #fff">${matrix[s.id].total}</td>
            </tr>`).join('');
        const monthlyCells = monthCounts.map(c => {
            const pct = Math.round((c / Math.max(1, ...monthCounts)) * 100);
            return `<td style="padding:6px 3px;text-align:center;border-left:1px solid #e2e8f0">
                <div style="height:58px;display:flex;align-items:flex-end;justify-content:center">
                    <div style="width:16px;height:${Math.max(4, pct)}%;background:#0f766e;border-radius:6px 6px 0 0"></div>
                </div>
                <div style="font-size:12px;font-weight:900;color:#0f766e">${c}</div>
            </td>`;
        }).join('');

        const p1 = buildPage(`
            ${headerHtml}
            <div style="padding:18px 28px 14px;flex:1">
                ${sectionTitle('1. ภาพรวมรายงาน / Report Summary', 'สรุปจำนวนรายงาน สถานะติดตาม SLA และความรุนแรงตาม Rank')}
                <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px">
                    ${metricCard('รายงานทั้งหมด', reportTotal, '#0f766e', 'Total Reports')}
                    ${metricCard('ส่งตาม Assignment', `${submitted}/${assignedTotal}`, '#0284c7', `${submitPct}% Coverage`)}
                    ${metricCard('เปิดติดตาม', active.length, active.length ? '#d97706' : '#64748b', 'Open')}
                    ${metricCard('ปิดแล้ว', closed.length, '#059669', 'Closed')}
                    ${metricCard('เกิน SLA', overdue.length, overdue.length ? '#dc2626' : '#059669', 'Overdue')}
                    ${metricCard('Rank A', rankMap.A || 0, (rankMap.A || 0) ? '#dc2626' : '#64748b', 'Critical')}
                </div>
                <div style="display:grid;grid-template-columns:1.1fr .9fr;gap:12px;margin-bottom:12px">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:8px">Key Notes / ประเด็นสำคัญ</div>
                        ${[
                            `Submission coverage ${submitted}/${assignedTotal} (${submitPct}%)`,
                            `SLA compliance ${slaPct}% · ใกล้ครบกำหนด ${nearDue.length} · เกินกำหนด ${overdue.length}`,
                            `Rank A ${rankMap.A || 0} รายการ · Rank B ${rankMap.B || 0} รายการ · Rank C ${rankMap.C || 0} รายการ`,
                            deptRiskRows[0] ? `แผนกที่ควรติดตามสูงสุด: ${deptRiskRows[0].dept} (${deptRiskRows[0].score} คะแนน)` : 'ยังไม่พบแผนกที่มีความเสี่ยงสะสมเด่นชัด',
                        ].map(t => `<div style="font-size:10.2px;color:#334155;margin-bottom:6px;display:flex;gap:6px"><span style="color:#f97316;font-weight:900">•</span><span>${safe(t)}</span></div>`).join('')}
                    </div>
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;text-align:center">
                        <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:7px">SLA Compliance</div>
                        <div style="font-size:48px;font-weight:900;line-height:1;color:${slaPct >= 90 ? '#059669' : slaPct >= 75 ? '#d97706' : '#dc2626'}">${slaPct}%</div>
                        <div style="font-size:9.5px;color:#64748b;margin:8px 0 10px">ปกติ ${closed.length + onTrack.length} · ใกล้ครบกำหนด ${nearDue.length} · เกินกำหนด ${overdue.length}</div>
                        ${bar(slaPct, slaPct >= 90 ? '#059669' : slaPct >= 75 ? '#d97706' : '#dc2626', 8)}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        ${sectionTitle('2. Rank Distribution', 'จำนวนรายงานแยกตามความรุนแรง')}
                        ${rankRows}
                    </div>
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        ${sectionTitle('3. STOP Distribution', 'จำนวนรายงานแยกตาม Stop Type')}
                        ${stopRows}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        ${sectionTitle('4. Monthly Trend', 'แนวโน้มรายงานรายเดือน')}
                        <table style="width:100%;border-collapse:collapse;font-size:9px">
                            <tr>${monthlyCells}</tr>
                            <tr>${months.map(m => `<td style="padding:4px 2px;text-align:center;color:#64748b;border-left:1px solid #e2e8f0">${m}</td>`).join('')}</tr>
                        </table>
                    </div>
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        ${sectionTitle('5. STOP × Rank Matrix', 'ใช้ดูรูปแบบความเสี่ยงซ้ำตามประเภทอันตราย')}
                        <table style="width:100%;border-collapse:collapse;font-size:9.5px">
                            <tr style="background:#065f46;color:#fff">
                                <th style="padding:6px;text-align:left">Stop</th><th>A</th><th>B</th><th>C</th><th>Total</th>
                            </tr>
                            ${matrixRows}
                        </table>
                    </div>
                </div>
            </div>
            ${footerHtml(1)}`);

        const deptRows = deptRiskRows.map((r, i) => {
            const pct = Math.round((r.score / maxDeptScore) * 100);
            const color = r.rankA || r.overdue ? '#dc2626' : r.rankB ? '#ea580c' : '#16a34a';
            return `<tr style="background:${i % 2 ? '#fff' : '#f8fafc'}">
                <td style="padding:7px;text-align:center;font-weight:900">#${i + 1}</td>
                <td style="padding:7px;font-weight:800">${safe(r.dept)}</td>
                <td style="padding:7px;text-align:center;font-weight:900;color:${color}">${r.score}</td>
                <td style="padding:7px;text-align:center;color:#dc2626;font-weight:900">${r.rankA}</td>
                <td style="padding:7px;text-align:center;color:#ea580c;font-weight:900">${r.rankB}</td>
                <td style="padding:7px;text-align:center;color:#16a34a;font-weight:900">${r.rankC}</td>
                <td style="padding:7px;text-align:center;color:#b91c1c;font-weight:900">${r.overdue}</td>
                <td style="padding:7px;width:120px">${bar(pct, color, 6)}</td>
            </tr>`;
        }).join('');
        const areaList = areaRows.length ? areaRows.map((r, i) => {
            const cnt = Number(r.count) || 0;
            const pct = Math.round((cnt / Math.max(1, Number(areaRows[0]?.count) || 1)) * 100);
            return `<div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">
                    <b>${i + 1}. ${safe(r.Location || r.Area || r.area || 'ไม่ระบุ')}</b><span>${cnt}</span>
                </div>${bar(pct, '#0f766e', 6)}
            </div>`;
        }).join('') : `<p style="font-size:10px;color:#94a3b8;margin:0">ยังไม่มีข้อมูลพื้นที่สำหรับปีนี้</p>`;
        const followRows = overdueRows.length ? overdueRows.map(({ report: r, sla }, i) => {
            const rank = r.Rank || ({ Critical: 'A', High: 'B', Medium: 'C', Low: 'C' }[r.RiskLevel]) || '-';
            const st = STOP_TYPES.find(s => s.id === Number(r.StopType));
            const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const slaText = sla.overdue ? `เกิน ${Math.abs(sla.remaining)} วัน` : `เหลือ ${sla.remaining} วัน`;
            const color = sla.overdue ? '#dc2626' : '#d97706';
            return `<tr style="background:${i % 2 ? '#fff' : '#f8fafc'}">
                <td style="padding:7px;color:#64748b">${safe(date)}</td>
                <td style="padding:7px"><b>${safe(r.Department || '-')}</b><div style="font-size:8.5px;color:#64748b">${safe(r.ReporterName || '-')}</div></td>
                <td style="padding:7px;text-align:center;font-weight:900;color:${rank === 'A' ? '#dc2626' : rank === 'B' ? '#ea580c' : '#16a34a'}">${safe(rank)}</td>
                <td style="padding:7px;color:${st?.color || '#64748b'};font-weight:800">${safe(st?.code || '-')}</td>
                <td style="padding:7px;color:#334155">${safe(String(r.Description || '-').slice(0, 68))}</td>
                <td style="padding:7px;text-align:right;font-weight:900;color:${color}">${safe(slaText)}</td>
            </tr>`;
        }).join('') : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#94a3b8">ไม่มีรายการเกินกำหนดหรือใกล้ครบกำหนด</td></tr>`;

        const p2 = buildPage(`
            ${headerHtml}
            <div style="padding:18px 28px 14px;flex:1">
                ${sectionTitle('6. Department Risk Ranking', 'คะแนนถ่วงน้ำหนัก: Rank A=5, B=3, C=1, เกิน SLA +2')}
                <table style="width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:12px">
                    <tr style="background:#065f46;color:#fff">
                        <th style="padding:7px;text-align:center">#</th>
                        <th style="padding:7px;text-align:left">Department</th>
                        <th style="padding:7px;text-align:center">Score</th>
                        <th style="padding:7px;text-align:center">A</th>
                        <th style="padding:7px;text-align:center">B</th>
                        <th style="padding:7px;text-align:center">C</th>
                        <th style="padding:7px;text-align:center">SLA</th>
                        <th style="padding:7px;text-align:left">Weight</th>
                    </tr>
                    ${deptRows || `<tr><td colspan="8" style="padding:16px;text-align:center;color:#94a3b8">ยังไม่มีข้อมูลแผนกสำหรับปีนี้</td></tr>`}
                </table>
                <div style="display:grid;grid-template-columns:.85fr 1.15fr;gap:12px;margin-bottom:12px">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        ${sectionTitle('7. Top Area Focus', 'พื้นที่ที่มีรายงานสูงสุด')}
                        ${areaList}
                    </div>
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px">
                        ${sectionTitle('8. Action Follow-up', 'รายการที่ควรติดตามตาม SLA')}
                        <table style="width:100%;border-collapse:collapse;font-size:8.8px">
                            <tr style="background:#065f46;color:#fff">
                                <th style="padding:6px;text-align:left">Date</th>
                                <th style="padding:6px;text-align:left">Department / Reporter</th>
                                <th style="padding:6px;text-align:center">Rank</th>
                                <th style="padding:6px;text-align:left">Stop</th>
                                <th style="padding:6px;text-align:left">Description</th>
                                <th style="padding:6px;text-align:right">SLA</th>
                            </tr>
                            ${followRows}
                        </table>
                    </div>
                </div>
                <div style="border:1px solid #d1fae5;background:#f0fdf4;border-radius:12px;padding:13px">
                    <div style="font-size:12px;font-weight:900;color:#065f46;margin-bottom:6px">ข้อเสนอแนะสำหรับการติดตาม / Follow-up Notes</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:9.8px;color:#334155;line-height:1.55">
                        <div><b style="color:#dc2626">1. Rank A / SLA</b><br>ติดตามรายการ Rank A และรายการเกินกำหนดก่อนเป็นลำดับแรก</div>
                        <div><b style="color:#ea580c">2. Repeated Pattern</b><br>ดู Stop Type หรือพื้นที่ที่เกิดซ้ำ เพื่อกำหนดการป้องกันเฉพาะจุด</div>
                        <div><b style="color:#0f766e">3. Assignment</b><br>ทบทวน coverage ของพนักงานที่มอบหมายและกระตุ้นการรายงานอย่างต่อเนื่อง</div>
                    </div>
                </div>
            </div>
            ${footerHtml(2)}`);

        const { jsPDF } = jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        for (const [i, el] of [p1, p2].entries()) {
            const canvas = await html2canvas(el, { scale: 1.7, useCORS: true, logging: false });
            if (i > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, 210, 297);
        }

        const period = _statsMonth !== 'all' ? `${_statsYear}-${String(_statsMonth).padStart(2,'0')}` : String(_statsYear);
        const fname = `Hiyari_${period}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.pdf`;
        pdf.save(fname);
        showToast('Export PDF สำเร็จ', 'success');
    } catch (err) {
        console.error('Hiyari PDF error:', err);
        showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
    } finally {
        pages.forEach(el => el?.parentNode?.removeChild(el));
        if (btn) { btn.disabled = false; btn.textContent = 'PDF'; }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: SUBMIT FORM — 3-Step Wizard
// ─────────────────────────────────────────────────────────────────────────────
function renderSubmitForm(container) {
    _wizardStep = 1;
    _submitInFlight = false;
    const user  = TSHSession.getUser() || {};
    const today = _todayDateOnly();
    const reporterId = user.id || user.EmployeeID || '-';
    const reporterName = user.name || user.EmployeeName || '-';
    const reporterDept = user.department || user.Department || '-';
    const reporterPosition = user.position || user.Position || '';
    const userEmail = user.email || user.Email || '';
    const areaOptions = _areas.length
        ? _areas.map(a => `<option value="${escHtml(a)}"></option>`).join('')
        : '';

    const stepDefs = [
        { n:1, label:'ประเภทอันตราย' },
        { n:2, label:'รายละเอียด' },
        { n:3, label:'ส่งรายงาน' },
    ];

    container.innerHTML = `
    <div class="w-full space-y-4">
        <div id="hiyari-document-mode-panel" class="ds-section p-4 md:p-5">
            <div class="mb-3">
                <p class="text-[10px] font-bold uppercase text-emerald-600">Document Submission</p>
                <h3 id="hiyari-document-mode-title" class="text-base font-black text-slate-800 mt-1">เลือกขั้นตอนเอกสารที่ต้องการส่ง</h3>
                <p id="hiyari-document-mode-note" class="hidden text-xs text-slate-500 mt-1"></p>
            </div>
            <div id="hiyari-document-mode-grid" class="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <button type="button" id="hiyari-mode-excel" data-submit-mode="excel"
                    class="hiyari-submit-mode text-left rounded-xl border-2 border-orange-300 bg-orange-50 p-4 transition-colors">
                    <p class="text-sm font-black text-slate-800">ส่ง Excel เพื่อตรวจสอบ</p>
                    <p class="text-xs text-slate-600 mt-1">เริ่มรายงานใหม่ แนบไฟล์ Excel ให้แอดมินตรวจสอบก่อนพิมพ์ลงนาม</p>
                </button>
                <button type="button" id="hiyari-mode-pdf" data-submit-mode="pdf"
                    class="hiyari-submit-mode text-left rounded-xl border-2 border-slate-200 bg-white p-4 hover:border-emerald-200 transition-colors">
                    <p class="text-sm font-black text-slate-800">ส่ง PDF หลังผ่านการตรวจ</p>
                    <p class="text-xs text-slate-600 mt-1">เลือกเฉพาะรายงานที่ Excel ผ่านแล้ว แล้วอัปโหลด PDF เพื่อปิดขั้นตอนเอกสาร</p>
                </button>
                <button type="button" id="hiyari-mode-direct" data-submit-mode="direct"
                    class="hiyari-submit-mode hidden text-left rounded-xl border-2 border-slate-200 bg-white p-4 hover:border-sky-200 transition-colors">
                    <div class="flex flex-wrap items-center gap-2">
                        <p class="text-sm font-black text-slate-800">ส่ง PDF ลงนามโดยตรง</p>
                        <span class="px-2 py-0.5 rounded-full border border-sky-200 bg-sky-100 text-[10px] font-bold text-sky-700">สิทธิ์พิเศษ</span>
                    </div>
                    <p class="text-xs text-slate-600 mt-1">ใช้ได้เฉพาะพนักงานที่แอดมินเปิดสิทธิ์ในรายการมอบหมาย ระบบจะสร้างรายงานพร้อม PDF โดยไม่ต้องส่ง Excel ก่อน</p>
                </button>
            </div>
        </div>

        <div id="hiyari-excel-flow" class="space-y-4">
        <!-- ── Progress indicator ── -->
        <div class="ds-section p-5 md:p-6">
            <div class="flex items-center gap-0">
                ${stepDefs.map((s, idx) => `
                <div class="flex items-center ${idx < 2 ? 'flex-1' : ''}">
                    <div class="flex flex-col items-center">
                        <div id="wz-circle-${s.n}" class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${s.n === 1 ? 'text-white' : 'bg-slate-100 text-slate-400'}"
                             style="${s.n === 1 ? 'background:linear-gradient(135deg,#f97316,#ef4444)' : ''}">${s.n}</div>
                        <span id="wz-label-${s.n}" class="text-[10px] mt-1 font-semibold whitespace-nowrap ${s.n === 1 ? 'text-orange-600' : 'text-slate-400'}">${s.label}</span>
                    </div>
                    ${idx < 2 ? `<div id="wz-line-${s.n}" class="flex-1 h-1 rounded-full mx-2 transition-all bg-slate-200"></div>` : ''}
                </div>`).join('')}
            </div>
        </div>

        <!-- ── Form shell (single <form> wraps all steps so FormData works) ── -->
        <div class="ds-section overflow-hidden w-full">
            <div class="h-1.5 w-full" style="background:linear-gradient(90deg,#f97316,#ef4444)"></div>
            <div class="p-5 md:p-8">
            <form id="hiyari-form">

            <!-- ════ STEP 1: ประเภทอันตราย ════ -->
            <div id="wizard-step-1" class="space-y-5">
                <div class="flex items-center gap-2.5 mb-1">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">เลือกประเภทอันตรายที่พบ</h3>
                        <p class="text-xs text-slate-400 mt-0.5">เลือกประเภทอันตรายและระดับความรุนแรงก่อน เพื่อช่วยกำหนด SLA การดำเนินการ</p>
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">ประเภทอันตราย (Stop Type) <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
                        ${STOP_TYPES.map(st => `
                        <label class="cursor-pointer">
                            <input type="radio" name="StopType" value="${st.id}" class="peer hidden">
                            <div class="h-full min-h-[118px] rounded-xl border-2 p-3 transition-all peer-checked:ring-2 peer-checked:ring-orange-400 peer-checked:border-orange-300"
                                 style="background:${st.bg};border-color:${st.border}">
                                <div class="flex items-center gap-1.5 mb-1">
                                    <svg class="w-3.5 h-3.5 flex-shrink-0" style="color:${st.color}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${st.icon}"/>
                                    </svg>
                                    <p class="text-xs font-black" style="color:${st.color}">${st.code}</p>
                                </div>
                                <p class="text-[10px] text-slate-600 leading-relaxed">${st.label}</p>
                            </div>
                        </label>`).join('')}
                    </div>
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2">ระดับความรุนแรง (Rank) <span class="text-red-500">*</span></label>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        ${RANKS.map(r => `
                        <label class="cursor-pointer">
                            <input type="radio" name="Rank" value="${r.rank}" class="peer hidden">
                            <div class="h-full min-h-[104px] rounded-xl border-2 p-3 transition-all peer-checked:ring-2 peer-checked:ring-orange-400 peer-checked:border-orange-300"
                                 style="background:${r.bg};border-color:${r.border}">
                                <div class="flex items-center justify-between mb-1">
                                    <p class="text-xs font-black" style="color:${r.color}">${r.label}</p>
                                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style="background:${r.color}22;color:${r.color}">${r.detail}</span>
                                </div>
                                <p class="text-[10px] text-slate-600">${r.desc}</p>
                            </div>
                        </label>`).join('')}
                    </div>
                </div>
                <div class="flex justify-end pt-3 border-t border-slate-100">
                    <button type="button" id="wz-next-1" class="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        ถัดไป
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ════ STEP 2: รายละเอียด ════ -->
            <div id="wizard-step-2" class="hidden space-y-4">
                <div class="flex items-center gap-2.5 mb-1">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">รายละเอียดเหตุการณ์</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ระบุวันที่ สถานที่ และรายละเอียดของเหตุการณ์ที่พบ</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                         style="background:linear-gradient(135deg,#f97316,#ef4444)">${escHtml((reporterName || '?')[0])}</div>
                    <div class="min-w-0">
                        <p class="font-semibold text-slate-800 text-sm truncate">${escHtml(reporterName)}</p>
                        <p class="text-xs text-slate-400">${escHtml([reporterId, reporterDept, reporterPosition].filter(Boolean).join(' · '))}</p>
                    </div>
                </div>
                <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 space-y-3">
                    <div>
                        <p class="text-xs font-bold text-emerald-800">ผู้รายงาน / Submit on behalf of</p>
                        <p class="text-[11px] text-emerald-700 mt-0.5">หากส่งแทน ให้เลือกพนักงานจากรายการมอบหมาย Hiyari ที่แอดมินกำหนดไว้</p>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">เจ้าของรายงาน</label>
                            <input type="hidden" name="OnBehalfEmployeeID" id="hiyari-on-behalf" value="">
                            <div class="relative">
                                <input type="text" id="hiyari-on-behalf-search"
                                       class="form-input w-full rounded-xl text-sm pr-10"
                                       placeholder="Search name / ID / department / email"
                                       autocomplete="off" role="combobox" aria-expanded="false" aria-controls="hiyari-on-behalf-list">
                                <button type="button" id="hiyari-on-behalf-clear"
                                        class="hidden absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                        aria-label="Clear selected report owner">×</button>
                                <div id="hiyari-on-behalf-list"
                                     class="hidden absolute z-30 mt-2 w-full max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"></div>
                            </div>
                            <p id="hiyari-on-behalf-help" class="text-[11px] text-slate-400 mt-1">Search assignment list by employee name, ID, department, or CompanyEmail.</p>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Company Email <span class="text-red-500">*</span></label>
                            <input type="email" name="CompanyEmail" id="hiyari-company-email" required
                                   value="${escHtml(userEmail)}"
                                   placeholder="name@thaisummit-harness.co.th"
                                   pattern="^[^\\s@]+@thaisummit-harness\\.co\\.th$"
                                   class="form-input w-full rounded-xl text-sm">
                            <p id="hiyari-company-email-help" class="text-[11px] text-slate-400 mt-1">Auto-filled from Employee Master when CompanyEmail is available.</p>
                        </div>
                    </div>
                    <div id="hiyari-owner-preview"></div>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div class="lg:col-span-3">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Report Date <span class="text-red-500">*</span></label>
                        <input type="date" name="ReportDate" class="form-input w-full rounded-xl text-sm" value="${today}" max="${today}">
                    </div>
                    <div class="lg:col-span-9">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Area / Location</label>
                        <input type="text" name="Location" list="hiyari-area-list" class="form-input w-full rounded-xl text-sm" placeholder="เลือกจาก Master Area หรือพิมพ์อื่น ๆ">
                        <datalist id="hiyari-area-list">
                            ${areaOptions}
                            <option value="อื่น ๆ / Other"></option>
                        </datalist>
                        <p class="text-[11px] text-slate-400 mt-1">${_areas.length ? `Master Areas ${_areas.length} รายการ · พิมพ์เองได้` : 'ยังไม่มี Master Area · พิมพ์พื้นที่เองได้'}</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 xl:grid-cols-12 gap-3">
                    <div class="xl:col-span-8">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">รายละเอียดเหตุการณ์ <span class="text-red-500">*</span></label>
                    <textarea name="Description" rows="4" id="wz-description"
                              class="form-input w-full rounded-xl text-sm resize-none"
                              placeholder="อธิบายสิ่งที่เกิดขึ้นหรือเกือบเกิดขึ้นอย่างละเอียด เช่น ขณะทำอะไร เกิดอะไรขึ้น มีใครอยู่ด้วยหรือไม่..."></textarea>
                    </div>
                    <div class="xl:col-span-4">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ผลที่อาจเกิดขึ้น</label>
                    <select name="PotentialConsequence" class="form-select w-full rounded-xl text-sm">
                        <option value="">-- เลือก --</option>
                        ${CONSEQUENCES.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <div class="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-800">
                        เลือกผลกระทบที่ใกล้เคียงที่สุด เพื่อให้ทีม Safety วิเคราะห์ความเสี่ยงและแนวโน้มได้แม่นยำขึ้น
                    </div>
                    </div>
                </div>
                <div class="flex justify-between pt-3 border-t border-slate-100">
                    <button type="button" id="wz-back-2" class="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                        ย้อนกลับ
                    </button>
                    <button type="button" id="wz-next-2" class="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        ถัดไป
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- ════ STEP 3: ข้อเสนอแนะ + ไฟล์ ════ -->
            <div id="wizard-step-3" class="hidden space-y-4">
                <div class="flex items-center gap-2.5 mb-1">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-800 text-sm">ข้อเสนอแนะ & ไฟล์แนบ</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ระบุข้อเสนอแนะเพื่อป้องกัน และตรวจสอบข้อมูลก่อนส่ง</p>
                    </div>
                </div>
                <!-- Forms download card — injected by JS after load -->
                <div id="hiyari-forms-user-card"></div>
                <div class="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
                    <p id="hiyari-attachment-flow-title" class="font-bold">Excel Review / ส่งให้ตรวจสอบ</p>
                    <p id="hiyari-attachment-flow-note" class="mt-1 leading-relaxed">ขั้นตอนนี้ส่งไฟล์ Excel ให้แอดมินตรวจสอบก่อน เมื่อผ่านแล้วให้กลับมาที่โหมด “ส่ง PDF ที่ลงนามแล้ว”</p>
                </div>
                <div class="grid grid-cols-1 xl:grid-cols-12 gap-3">
                    <div class="xl:col-span-7">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ข้อเสนอแนะ / แนวทางปรับปรุง</label>
                    <textarea name="Suggestion" rows="3"
                              class="form-input w-full rounded-xl text-sm resize-none"
                              placeholder="ข้อเสนอแนะเพื่อป้องกันไม่ให้เกิดซ้ำ เช่น ปรับปรุง SOP / ซ่อมอุปกรณ์ / เพิ่ม Warning Sign..."></textarea>
                    </div>
                    <div class="xl:col-span-5">
                    <label id="hiyari-attachment-label" class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ไฟล์ Excel สำหรับตรวจสอบ <span class="text-red-500">*</span></label>
                    <input type="file" name="attachment" id="hiyari-file"
                           accept=".xls,.xlsx" required
                           class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                    <p id="hiyari-attachment-help" class="text-xs text-slate-400 mt-1">ขั้นตอนนี้รับเฉพาะ Excel .xls หรือ .xlsx · ขนาดไม่เกิน 20 MB</p>
                    <div id="hiyari-file-preview" class="mt-3"></div>
                    </div>
                </div>
                <!-- Pre-submit summary -->
                <div id="wz-summary" class="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-2">
                    <p class="font-bold text-orange-800 text-sm mb-2">ตรวจสอบข้อมูลก่อนส่ง</p>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-700">
                        <div><span class="text-slate-400">Stop Type:</span> <span id="sum-stop" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">Rank:</span> <span id="sum-rank" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">วันที่:</span> <span id="sum-date" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">สถานที่:</span> <span id="sum-location" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">Report Owner:</span> <span id="sum-owner" class="font-semibold">-</span></div>
                        <div><span class="text-slate-400">Submitted By:</span> <span id="sum-submitter" class="font-semibold">-</span></div>
                        <div class="col-span-2"><span class="text-slate-400">CompanyEmail:</span> <span id="sum-email" class="font-semibold">-</span></div>
                        <div class="col-span-2"><span class="text-slate-400">รายละเอียด:</span> <span id="sum-desc" class="font-semibold">-</span></div>
                    </div>
                </div>
                <div class="flex justify-between pt-3 border-t border-slate-100">
                    <button type="button" id="wz-back-3" class="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                        </svg>
                        ย้อนกลับ
                    </button>
                    <button type="submit" id="hiyari-submit-btn"
                            class="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                        </svg>
                        ส่งรายงาน
                    </button>
                </div>
            </div>

            </form>
            </div>
        </div>
        </div>

        <div id="hiyari-signed-pdf-flow" class="hidden ds-section overflow-hidden">
            <div class="h-1.5 w-full bg-emerald-600"></div>
            <div class="p-5 md:p-8 space-y-4">
                <div>
                    <p class="text-[10px] font-bold uppercase text-emerald-600">Signed PDF Submission</p>
                    <h3 class="text-base font-black text-slate-800 mt-1">ส่ง PDF ที่ลงนามแล้ว</h3>
                    <p class="text-xs text-slate-500 mt-1">เลือกจากรายงานที่แอดมินตรวจ Excel ผ่านแล้วเท่านั้น ระบบจะผูก PDF กลับเข้ารายงานเดิม</p>
                </div>
                <form id="hiyari-signed-pdf-form" class="space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">รายงานที่ผ่านการตรวจ Excel <span class="text-red-500">*</span></label>
                        <select id="hiyari-signed-report-id" name="ReportID" required class="form-select w-full rounded-xl text-sm">
                            <option value="">กำลังโหลดรายการ...</option>
                        </select>
                    </div>
                    <div id="hiyari-signed-report-summary" class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        เลือกรายงานเพื่อดูข้อมูลก่อนอัปโหลด PDF
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">PDF ที่ลงนามแล้ว <span class="text-red-500">*</span></label>
                        <input type="file" name="file" id="hiyari-signed-pdf-file" accept=".pdf" required
                               class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-all">
                        <p class="text-xs text-slate-400 mt-1">รับเฉพาะไฟล์ PDF หลังพิมพ์และลงนามครบแล้ว</p>
                    </div>
                    <div class="flex justify-end pt-3 border-t border-slate-100">
                        <button type="submit" id="hiyari-signed-pdf-submit"
                            class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 transition-colors">
                            ส่ง PDF ปิดขั้นตอนเอกสาร
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>`;

    document.querySelectorAll('.hiyari-submit-mode').forEach(btn => {
        btn.addEventListener('click', guardActionHandler(async () => _setSubmitDocumentMode(btn.dataset.submitMode)));
    });
    _loadDirectSignedPermissionOptions();
    document.getElementById('hiyari-signed-report-id')?.addEventListener('change', (e) => {
        _renderSignedReportSummary(_signedReportOptions.find(r => String(r.id) === String(e.target.value)));
    });
    document.getElementById('hiyari-signed-pdf-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const reportId = document.getElementById('hiyari-signed-report-id')?.value;
        const file = document.getElementById('hiyari-signed-pdf-file')?.files?.[0] || null;
        const fileError = _validateSignedPdf(file);
        if (!reportId) {
            showToast('กรุณาเลือกรายงานที่ผ่านการตรวจ Excel แล้ว', 'error');
            return;
        }
        if (fileError) {
            showToast(fileError, 'error');
            return;
        }
        const btn = document.getElementById('hiyari-signed-pdf-submit');
        try {
            if (btn) btn.disabled = true;
            showLoading('กำลังส่ง PDF ที่ลงนามแล้ว...');
            await API.post(`/hiyari/${reportId}/signed-file`, new FormData(form));
            showToast('ส่ง PDF ที่ลงนามแล้วสำเร็จ', 'success');
            form?.reset();
            await Promise.all([
                _loadSignedSubmissionOptions(),
                fetchAndRenderTable().catch(() => {}),
                _loadHeroStats(),
            ]);
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
            if (btn) btn.disabled = false;
        }
    }));

    // ── Wizard step controller ─────────────────────────────────────────────────
    function _wzGo(toStep) {
        _wizardStep = toStep;
        [1, 2, 3].forEach(n => {
            const stepEl   = document.getElementById(`wizard-step-${n}`);
            const circleEl = document.getElementById(`wz-circle-${n}`);
            const labelEl  = document.getElementById(`wz-label-${n}`);
            const lineEl   = document.getElementById(`wz-line-${n}`);
            if (stepEl)   stepEl.classList.toggle('hidden', n !== toStep);
            if (circleEl) {
                const done   = n < toStep;
                const active = n === toStep;
                circleEl.style.background = active ? 'linear-gradient(135deg,#f97316,#ef4444)' : done ? '#f97316' : '';
                circleEl.className = `w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${active || done ? 'text-white' : 'bg-slate-100 text-slate-400'}`;
                circleEl.innerHTML = done
                    ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>`
                    : String(n);
            }
            if (labelEl)  labelEl.className = `text-[10px] mt-1 font-semibold whitespace-nowrap ${n === toStep ? 'text-orange-600' : n < toStep ? 'text-orange-400' : 'text-slate-400'}`;
            if (lineEl)   lineEl.style.background = n < toStep ? '#f97316' : '#e2e8f0';
        });
    }

    // Step 1 → 2
    document.getElementById('wz-next-1')?.addEventListener('click', () => {
        const form = document.getElementById('hiyari-form');
        if (!form?.querySelector('input[name="StopType"]:checked')?.value) { showToast('กรุณาเลือกประเภทอันตราย (Stop Type)', 'error'); return; }
        if (!form?.querySelector('input[name="Rank"]:checked')?.value)     { showToast('กรุณาเลือกระดับความรุนแรง (Rank)', 'error'); return; }
        _wzGo(2);
    });

    // Step 2 ↔ 1
    document.getElementById('wz-back-2')?.addEventListener('click', () => _wzGo(1));

    // Step 2 → 3 (validate + populate summary)
    document.getElementById('wz-next-2')?.addEventListener('click', () => {
        const desc = document.getElementById('wz-description')?.value.trim();
        if (!desc) { showToast('กรุณากรอกรายละเอียดเหตุการณ์', 'error'); return; }
        const form     = document.getElementById('hiyari-form');
        const stopVal  = form?.querySelector('input[name="StopType"]:checked')?.value;
        const rankVal  = form?.querySelector('input[name="Rank"]:checked')?.value;
        const dateVal  = form?.querySelector('input[name="ReportDate"]')?.value;
        const locVal   = form?.querySelector('input[name="Location"]')?.value.trim();
        const behalfSearch = document.getElementById('hiyari-on-behalf-search')?.value.trim() || '';
        const behalfId = document.getElementById('hiyari-on-behalf')?.value.trim() || '';
        if (behalfSearch && !behalfId) { showToast('Please select a matching Hiyari assignment from the dropdown.', 'error'); return; }
        const companyEmail = _ensureSelectedSubmitAssignmentEmail();
        if (!_isCompanyEmail(companyEmail)) { showToast('CompanyEmail must use @thaisummit-harness.co.th.', 'error'); return; }
        const stopMeta = STOP_TYPES.find(s => String(s.id) === String(stopVal));
        const rankMeta = RANKS.find(r => r.rank === rankVal);
        const selectedOwner = _getSelectedSubmitAssignment();
        const submitter = _currentSubmitterMeta();
        const ownerLabel = selectedOwner
            ? `${selectedOwner.AssigneeName || selectedOwner.EmployeeName || selectedOwner.EmployeeID || '-'} (${selectedOwner.EmployeeID || '-'})`
            : `${submitter.name} (${submitter.id})`;
        const el = id => document.getElementById(id);
        if (el('sum-stop'))  el('sum-stop').textContent  = stopMeta ? `${stopMeta.code} — ${stopMeta.label}` : '-';
        if (el('sum-rank'))  el('sum-rank').textContent  = rankMeta ? `${rankMeta.label} (${rankMeta.detail})` : '-';
        if (el('sum-date'))  el('sum-date').textContent  = dateVal ? new Date(dateVal).toLocaleDateString('th-TH',{ day:'numeric', month:'long', year:'numeric' }) : '-';
        if (el('sum-location')) el('sum-location').textContent = locVal || 'ไม่ระบุ';
        if (el('sum-owner')) el('sum-owner').textContent = ownerLabel;
        if (el('sum-submitter')) el('sum-submitter').textContent = `${submitter.name} (${submitter.id})`;
        if (el('sum-email')) el('sum-email').textContent = companyEmail || '-';
        if (el('sum-desc'))  el('sum-desc').textContent  = desc;
        _wzGo(3);
    });

    // Step 3 → 2
    document.getElementById('wz-back-3')?.addEventListener('click', () => _wzGo(2));

    // ── Load and inject active forms card ─────────────────────────────────────
    _loadHiyariForms(false).then(forms => {
        const cardEl = document.getElementById('hiyari-forms-user-card');
        if (cardEl) cardEl.innerHTML = _renderHiyariFormsUserCard(forms);
    });
    _loadSubmitAssigneeOptions();
    _applyHiyariCompanyEmail({ loadEmployee: true }).then(() => _renderSubmitOwnerPreview());
    document.getElementById('hiyari-company-email')?.addEventListener('input', _renderSubmitOwnerPreview);
    const behalfInput = document.getElementById('hiyari-on-behalf-search');
    behalfInput?.addEventListener('focus', () => _renderSubmitAssigneeDropdown(behalfInput.value, { open: true }));
    behalfInput?.addEventListener('input', () => {
        document.getElementById('hiyari-on-behalf').value = '';
        _renderSubmitAssigneeDropdown(behalfInput.value, { open: true });
        _applyHiyariCompanyEmail({ loadEmployee: true });
    });
    behalfInput?.addEventListener('change', () => {
        const value = _syncSubmitAssigneeFromSearch({ applyEmail: true });
        if (!value && behalfInput.value.trim()) _renderSubmitAssigneeDropdown(behalfInput.value, { open: true });
    });
    const behalfList = document.getElementById('hiyari-on-behalf-list');
    const pickBehalfOption = async (e) => {
        const option = e.target.closest('.hiyari-on-behalf-option');
        if (!option) return;
        e.preventDefault();
        e.stopPropagation();
        await _selectSubmitAssignee(option.dataset.employeeId || '');
    };
    behalfList?.addEventListener('pointerdown', pickBehalfOption);
    behalfList?.addEventListener('mousedown', pickBehalfOption);
    behalfList?.addEventListener('click', pickBehalfOption);
    document.getElementById('hiyari-on-behalf-clear')?.addEventListener('click', guardActionHandler(async () => {
        document.getElementById('hiyari-on-behalf').value = '';
        if (behalfInput) behalfInput.value = '';
        _renderSubmitAssigneeDropdown('', { open: false });
        await _applyHiyariCompanyEmail({ loadEmployee: true });
        behalfInput?.focus();
    }));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#hiyari-on-behalf-search') && !e.target.closest('#hiyari-on-behalf-list')) {
            _renderSubmitAssigneeDropdown(behalfInput?.value || '', { open: false });
        }
    });

    // ── Image / file preview ───────────────────────────────────────────────────
    document.getElementById('hiyari-file')?.addEventListener('change', function () {
        const preview = document.getElementById('hiyari-file-preview');
        if (!preview) return;
        const file = this.files[0];
        if (!file) { preview.innerHTML = ''; return; }
        const fileError = _submitDocumentMode === 'direct'
            ? _validateSignedPdf(file)
            : _validateExcelReviewFile(file);
        if (fileError) {
            showToast(fileError, 'error');
            this.value = '';
            preview.innerHTML = '';
            return;
        }
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            preview.innerHTML = `
            <div class="relative inline-block">
                <img src="${url}" class="w-32 h-32 rounded-xl object-cover border-2 border-orange-200 shadow-sm">
                <button type="button" id="clear-preview"
                        class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center hover:bg-red-600 transition-colors">×</button>
            </div>`;
        } else {
            preview.innerHTML = `
            <div class="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                <svg class="w-5 h-5 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span class="text-xs text-slate-600 max-w-[200px] truncate">${escHtml(file.name)}</span>
                <button type="button" id="clear-preview" class="text-slate-400 hover:text-red-500 font-bold transition-colors ml-1">×</button>
            </div>`;
        }
        document.getElementById('clear-preview')?.addEventListener('click', () => {
            this.value = '';
            preview.innerHTML = '';
        });
    });

    // ── Final submit ───────────────────────────────────────────────────────────
    document.getElementById('hiyari-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        if (_submitInFlight) return;
        const form     = e.target;
        const stopType = form.querySelector('input[name="StopType"]:checked')?.value;
        const rank     = form.querySelector('input[name="Rank"]:checked')?.value;
        const desc     = form.querySelector('textarea[name="Description"]')?.value.trim();
        const file     = form.querySelector('input[name="attachment"]')?.files?.[0] || null;
        const companyEmail = _ensureSelectedSubmitAssignmentEmail();
        if (!stopType || !rank || !desc) {
            showToast('ข้อมูลไม่ครบ — กรุณาย้อนกลับและตรวจสอบ', 'error'); return;
        }
        if (!_isCompanyEmail(companyEmail)) {
            showToast('CompanyEmail must use @thaisummit-harness.co.th. If it is missing, update Employee Master or enter a valid company email.', 'error');
            return;
        }
        const behalfSearch = document.getElementById('hiyari-on-behalf-search')?.value.trim() || '';
        const behalfId = document.getElementById('hiyari-on-behalf')?.value.trim() || '';
        if (behalfSearch && !behalfId) {
            showToast('กรุณาเลือกเจ้าของรายงานจากรายการมอบหมาย Hiyari', 'error');
            return;
        }
        const fileError = _submitDocumentMode === 'direct'
            ? _validateSignedPdf(file)
            : _validateExcelReviewFile(file);
        if (fileError) {
            showToast(fileError, 'error');
            return;
        }
        const btn = document.getElementById('hiyari-submit-btn');
        _submitInFlight = true;
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span> กำลังส่ง...`;
        try {
            showLoading(_submitDocumentMode === 'direct' ? 'กำลังส่ง PDF ที่ลงนามแล้ว...' : 'กำลังส่งรายงาน...');
            await API.post(_submitDocumentMode === 'direct' ? '/hiyari/direct-signed' : '/hiyari', new FormData(form));
            showToast(_submitDocumentMode === 'direct' ? 'ส่ง PDF ที่ลงนามแล้วโดยตรงสำเร็จ' : 'ส่งรายงาน Hiyari-Hatto สำเร็จ', 'success');
            if (_isAdmin) {
                _lastPendingReviewCount = await _refreshManageReviewNotice({ toast: false });
            }
            form.reset();
            await _applyHiyariCompanyEmail({ loadEmployee: true });
            _renderSubmitAssigneeDropdown('', { open: false });
            _renderSubmitOwnerPreview();
            const prev = document.getElementById('hiyari-file-preview');
            if (prev) prev.innerHTML = '';
            _wzGo(1);
            await Promise.all([
                _loadHeroStats(),
                fetchAndRenderTable().catch(() => {}),
                loadAndRenderAssignments().catch(() => {}),
            ]);
        } catch (err) {
            showError(err);
        } finally {
            _submitInFlight = false;
            hideLoading();
            btn.disabled = false;
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg> ส่งรายงาน`;
        }
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: HISTORY
// ─────────────────────────────────────────────────────────────────────────────
async function renderHistory(container) {
    container.innerHTML = `
        <div class="space-y-4">
            <!-- Filter bar -->
            <div class="ds-filter-bar">
                <div class="flex flex-wrap gap-2 items-center">
                    ${buildFilterSelect('filter-status', 'สถานะ', [
                        { v:'all', l:'ทุกสถานะ' },
                        ...STATUSES.map(s => ({ v:s, l: STATUS_LABEL[s] || s }))
                    ], _filterStatus)}
                    ${buildFilterSelect('filter-risk', 'Rank', [
                        { v:'all',      l:'ทุก Rank' },
                        { v:'Critical', l:'Rank A (Critical)' },
                        { v:'High',     l:'Rank B (High)' },
                        { v:'Low',      l:'Rank C (Low)' },
                    ], _filterRisk)}
                    ${buildFilterSelect('filter-rank-code', 'Rank Code', [
                        { v:'all', l:'ทุก Rank Code' },
                        { v:'A', l:'Rank A' },
                        { v:'B', l:'Rank B' },
                        { v:'C', l:'Rank C' },
                    ], _filterRank)}
                    ${buildFilterSelect('filter-stop-type', 'Stop Type', [
                        { v:'all', l:'ทุก Stop Type' },
                        ...STOP_TYPES.map(s => ({ v:String(s.id), l:`${s.code} - ${s.label}` }))
                    ], _filterStopType)}
                    ${buildFilterSelect('filter-dept', 'แผนก', [
                        { v:'all', l:'ทุกแผนก' },
                        ..._departments.map(d => ({ v:d, l:d }))
                    ], _filterDept)}
                    ${buildFilterSelect('filter-area', 'พื้นที่', [
                        { v:'all', l:'ทุกพื้นที่' },
                        ..._areas.map(a => ({ v:a, l:a }))
                    ], _filterArea)}
                    ${buildFilterSelect('filter-month', 'เดือน', [
                        { v:'all', l:'ทุกเดือน' },
                        ...['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'].map((m, idx) => ({ v:String(idx + 1), l:m }))
                    ], _filterMonth)}
                    ${buildFilterSelect('history-year', 'ปี', [
                        { v:'', l:'ทุกปี' },
                        ...[0,1,2].map(i => { const y = new Date().getFullYear() - i; return { v:String(y), l:String(y) }; })
                    ], _historyYear)}
                    <div class="relative flex-1 min-w-[220px]">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        <input id="history-search" type="text" placeholder="ค้นหาชื่อ, สถานที่, รายละเอียด..."
                               value="${_searchQ}"
                               class="form-input w-full pl-9 text-sm py-2 rounded-xl">
                    </div>
                    <button id="hiyari-export-btn"
                        class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-orange-200 text-orange-700 bg-white hover:bg-orange-50 transition-all flex-shrink-0">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 10v6m0 0l-3-3m3 3l3-3M4 17v1a2 2 0 002 2h12a2 2 0 002-2v-1M7 7l4.586-4.586a2 2 0 012.828 0L19 7"/>
                        </svg>
                        Export Excel
                    </button>
                    <button id="hiyari-clear-filters-btn"
                        class="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-all flex-shrink-0">
                        Clear
                    </button>
            </div>
            <!-- Table -->
            <div class="ds-table-wrap">
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">ผู้รายงาน</th>
                                <th class="px-4 py-3">แผนก</th>
                                <th class="px-4 py-3">Stop Type</th>
                                <th class="px-4 py-3">Rank</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3">ขั้นตอนเอกสาร</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="history-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="8" class="text-center py-8 text-slate-400">
                                <div class="animate-spin inline-block h-6 w-6 border-4 border-orange-400 border-t-transparent rounded-full mb-2"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

    await fetchAndRenderTable();
}

function buildFilterSelect(id, placeholder, opts, current) {
    return `<select id="${id}" aria-label="${escHtml(placeholder)}"
        class="form-select !w-auto min-w-[132px] max-w-[210px] h-10 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:border-orange-200 focus:border-orange-400 focus:ring-orange-100">
        ${opts.map(o => `<option value="${o.v}" ${o.v === current ? 'selected' : ''}>${o.l}</option>`).join('')}
    </select>`;
}

async function fetchAndRenderTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    try {
        const params = new URLSearchParams();
        if (_filterStatus !== 'all') params.set('status', _filterStatus);
        if (_filterRisk   !== 'all') params.set('risk',   _filterRisk);
        if (_filterDept   !== 'all') params.set('dept',   _filterDept);
        if (_filterStopType !== 'all') params.set('stopType', _filterStopType);
        if (_filterRank     !== 'all') params.set('rank',     _filterRank);
        if (_filterMonth    !== 'all') params.set('month',    _filterMonth);
        if (_filterArea     !== 'all') params.set('area',     _filterArea);
        if (_historyYear)            params.set('year',   _historyYear);
        if (_searchQ.trim())         params.set('q',      _searchQ.trim());

        const res = await API.get(`/hiyari?${params}`);
        _reports  = normalizeApiArray(res?.data ?? res);
        renderTable();
    } catch (err) {
        console.error('History error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTable() {
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (!_reports.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400 text-sm">ไม่พบรายงาน</td></tr>`;
        return;
    }

    tbody.innerHTML = _reports.map(r => {
        const date  = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
        const st    = STOP_TYPES.find(s => s.id === Number(r.StopType));
        const rankR = RANKS.find(x => x.rank === r.Rank);
        const sla   = _getSLA(r);
        const rowStyle = _getSLARowStyle(sla);
        return `
        <tr class="transition-colors group" style="${rowStyle}">
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
            <td class="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">${escHtml(r.ReporterName || '-')}</td>
            <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${escHtml(r.Department || '-')}</td>
            <td class="px-4 py-3">
                ${st
                    ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                              style="background:${st.bg};color:${st.color};border:1px solid ${st.border}">${st.code}</span>`
                    : `<span class="text-xs text-slate-400">-</span>`}
            </td>
            <td class="px-4 py-3">
                ${rankR
                    ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RANK_BADGE[rankR.rank]}">${rankR.label}</span>`
                    : (r.RiskLevel
                        ? dsStatusBadge(r.RiskLevel || '-', { label: RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-' })
                        : `<span class="text-xs text-slate-400">-</span>`)}
            </td>
            <td class="px-4 py-3">
                ${dsStatusBadge(r.Status || '-', { label: STATUS_LABEL[r.Status] || r.Status || '-' })}
                ${_buildSLABadge(sla)}
            </td>
            <td class="px-4 py-3 min-w-[150px]">
                ${_buildDocumentFlowBadge(r, { showNote: true })}
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
                <button class="btn-view-report px-3 py-1 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
                        data-id="${r.id}">ดูรายละเอียด</button>
                ${_isAdmin ? `
                    <button class="btn-manage-report px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all ml-1"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)"
                            data-id="${r.id}">แก้ไข</button>
                    <button class="btn-delete-report p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
                            data-id="${r.id}" data-name="${escHtml(r.ReporterName || '')}" title="ลบ">
                        <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: ADMIN MANAGE
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MODULE FORMS — shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function _formFileIcon(mime) {
    if (!mime) return '📄';
    if (mime.includes('pdf'))   return '📕';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return '📘';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return '📗';
    if (mime.startsWith('image/')) return '🖼';
    return '📄';
}

function _formFileLabel(mime) {
    if (!mime) return 'ไฟล์';
    if (mime.includes('pdf'))   return 'PDF';
    if (mime.includes('word') || mime.includes('officedocument.wordprocessing')) return 'Word';
    if (mime.includes('excel') || mime.includes('spreadsheetml')) return 'Excel';
    if (mime.startsWith('image/')) return 'รูปภาพ';
    return 'ไฟล์';
}

async function _loadHiyariForms(adminAll = false) {
    try {
        const url = adminAll ? '/module-forms?module=hiyari&all=1' : '/module-forms?module=hiyari';
        const res = await API.get(url);
        _hiyariForms = normalizeApiArray(res?.data ?? res);
    } catch { _hiyariForms = []; }
    return _hiyariForms;
}

function _renderHiyariFormsManage() {
    const forms = _hiyariForms;
    const rows = forms.length
        ? forms.map(f => {
            const activeClass = f.IsActive ? '' : 'opacity-50';
            return `
            <tr class="hover:bg-slate-50 transition-colors ${activeClass}">
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800 text-sm">${escHtml(f.Title)}</div>
                    ${f.Description ? `<div class="text-xs text-slate-400 mt-0.5 truncate max-w-[220px]">${escHtml(f.Description)}</div>` : ''}
                </td>
                <td class="px-4 py-3 text-xs text-slate-500">${escHtml(f.Version || '—')}</td>
                <td class="px-4 py-3 text-xs text-slate-500">${_formFileLabel(f.FileType)}</td>
                <td class="px-4 py-3">
                    ${f.IsActive
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ใช้งาน</span>`
                        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>ปิดใช้งาน</span>`}
                </td>
                <td class="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">${new Date(f.UploadedAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <a href="${escHtml(f.FileUrl)}" target="_blank" class="px-3 py-1 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 transition-colors inline-block">ดูไฟล์</a>
                    <button class="hiyari-form-toggle px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${f.IsActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}"
                            data-id="${f.id}" data-active="${f.IsActive}">${f.IsActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
                    <button class="hiyari-form-delete p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-0.5"
                            data-id="${f.id}" data-title="${escHtml(f.Title)}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="6" class="text-center py-8 text-slate-400 text-sm">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            ยังไม่มีแบบฟอร์ม — กด "เพิ่มแบบฟอร์ม" เพื่อเพิ่ม
        </td></tr>`;

    const el = document.getElementById('hiyari-forms-tbody');
    if (el) el.innerHTML = rows;
}

function _openHiyariFormUploadModal() {
    const html = `
    <div class="space-y-4 p-1">
        <form id="hiyari-form-upload-form" class="space-y-3">
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ชื่อแบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="text" id="hff-title" class="form-input w-full rounded-xl text-sm" placeholder="เช่น แบบฟอร์มรายงาน Hiyari-Hatto" maxlength="200">
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">เวอร์ชั่น</label>
                    <input type="text" id="hff-version" class="form-input w-full rounded-xl text-sm" placeholder="เช่น v1.0" maxlength="30">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1">ลำดับแสดง</label>
                    <input type="number" id="hff-sort" class="form-input w-full rounded-xl text-sm" placeholder="99" min="0" max="999">
                </div>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">คำอธิบาย</label>
                <textarea id="hff-desc" rows="2" class="form-input w-full rounded-xl text-sm resize-none" placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"></textarea>
            </div>
            <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">ไฟล์แบบฟอร์ม <span class="text-red-500">*</span></label>
                <input type="file" id="hff-file"
                       accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                       class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                <p class="text-xs text-slate-400 mt-1">รองรับ PDF, Word, Excel, รูปภาพ · ขนาดไม่เกิน 20 MB</p>
            </div>
        </form>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button onclick="window.closeModal&&window.closeModal()" class="px-4 py-2 rounded-xl text-sm text-slate-600 hover:bg-slate-100 transition-colors">ยกเลิก</button>
            <button id="hff-submit-btn" class="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                    style="background:linear-gradient(135deg,#f97316,#ef4444)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                อัปโหลดแบบฟอร์ม
            </button>
        </div>
    </div>`;
    openModal('เพิ่มแบบฟอร์ม Hiyari', html, 'max-w-lg');
    document.getElementById('hff-submit-btn')?.addEventListener('click', guardActionHandler(async () => {
        const title = document.getElementById('hff-title')?.value.trim();
        const fileEl = document.getElementById('hff-file');
        if (!title) { showToast('กรุณาระบุชื่อแบบฟอร์ม', 'error'); return; }
        if (!fileEl?.files?.length) { showToast('กรุณาเลือกไฟล์', 'error'); return; }
        const btn = document.getElementById('hff-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังอัปโหลด...'; }
        try {
            const fd = new FormData();
            fd.append('module', 'hiyari');
            fd.append('title', title);
            fd.append('description', document.getElementById('hff-desc')?.value.trim() || '');
            fd.append('version', document.getElementById('hff-version')?.value.trim() || '');
            fd.append('sortOrder', document.getElementById('hff-sort')?.value || '99');
            fd.append('formFile', fileEl.files[0]);
            await API.post('/module-forms', fd);
            closeModal();
            showToast('อัปโหลดแบบฟอร์มสำเร็จ', 'success');
            await _loadHiyariForms(true);
            _renderHiyariFormsManage();
        } catch (err) {
            showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>อัปโหลดแบบฟอร์ม'; }
        }
    }));
}

function _renderHiyariFormsUserCard(forms) {
    const active = forms.filter(f => f.IsActive);
    if (!active.length) return '';
    return `
    <div class="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-orange-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span class="text-sm font-bold text-orange-800">แบบฟอร์มที่ต้องกรอกและแนบ</span>
        </div>
        <p class="text-xs text-orange-700 mb-3">กรุณาดาวน์โหลดแบบฟอร์ม กรอกข้อมูล และนำมาแนบในช่องไฟล์แนบด้านล่าง</p>
        <div class="space-y-2">
            ${active.map(f => `
            <div class="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-orange-100 gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                    <span class="text-base flex-shrink-0">${_formFileIcon(f.FileType)}</span>
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-slate-800 truncate">${escHtml(f.Title)}</div>
                        <div class="text-xs text-slate-400">${_formFileLabel(f.FileType)}${f.Version ? ` · ${escHtml(f.Version)}` : ''}</div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <a href="${escHtml(f.FileUrl)}" target="_blank"
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-600 hover:bg-sky-50 border border-sky-200 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                        </svg>
                        ดูไฟล์
                    </a>
                    <a href="${escHtml(f.FileUrl)}" download
                       class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-100 border border-orange-200 transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                        </svg>
                        ดาวน์โหลด
                    </a>
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

async function _renderHiyariEmailQueueHealth() {
    const el = document.getElementById('hiyari-email-queue-health');
    if (!el || !_isAdmin) return;
    try {
        const res = await API.get('/hiyari/email-outbox?limit=8');
        const s = res?.summary || {};
        const rows = normalizeApiArray(res?.data ?? []);
        el.innerHTML = `<div class="rounded-2xl border ${s.warning?'border-red-200 bg-red-50':'border-slate-200 bg-slate-50'} p-4" data-hiyari-phase7-email-health="1">
            <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div><p class="text-xs font-black ${s.warning?'text-red-700':'text-slate-700'}">Hiyari Email Queue Health</p><p class="text-[11px] text-slate-500 mt-0.5">SMTP ${res?.smtpConfigured?'configured':'not configured'} · warning threshold ${s.threshold||5} failed</p><button type="button" id="hiyari-queue-overdue-btn" class="mt-2 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-[11px] font-bold">Send overdue reminders</button></div>
                <div class="grid grid-cols-4 gap-2 text-center">${[['Pending',s.pending],['Failed',s.failed],['Sent',s.sent],['Retries',s.retryCount]].map(([k,v])=>`<div class="rounded-xl bg-white border border-slate-200 px-3 py-2"><p class="text-lg font-black text-slate-800">${Number(v)||0}</p><p class="text-[9px] text-slate-500 uppercase">${k}</p></div>`).join('')}</div>
            </div>
            ${s.warning?'<p class="mt-3 text-xs font-bold text-red-700">Email failures reached the health-warning threshold. Check SMTP and retry the failed queue.</p>':''}
            ${rows.length?`<div class="mt-3 overflow-x-auto"><table class="w-full text-[11px]"><tbody>${rows.map(r=>`<tr class="border-t border-slate-200"><td class="py-2 pr-2 font-bold">${escHtml(r.EventType||'General')}</td><td class="py-2 pr-2">${escHtml(r.Status||'-')}</td><td class="py-2 pr-2">retry ${Number(r.RetryCount)||0}</td><td class="py-2 text-slate-500 truncate max-w-[240px]">${escHtml(r.Error||'')}</td><td class="py-2 text-right">${r.Status!=='Sent'?`<button type="button" data-hiyari-email-retry="${r.id}" class="px-2 py-1 rounded-lg border border-amber-200 text-amber-700">Retry</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:''}
        </div>`;
        el.querySelectorAll('[data-hiyari-email-retry]').forEach(btn=>btn.addEventListener('click',guardActionHandler(async()=>{try{btn.disabled=true;await API.post(`/hiyari/email-outbox/${btn.dataset.hiyariEmailRetry}/retry`,{});showToast('Email sent successfully','success');await _renderHiyariEmailQueueHealth();}catch(error){showError(error);}finally{btn.disabled=false;}})));
        document.getElementById('hiyari-queue-overdue-btn')?.addEventListener('click',guardActionHandler(async()=>{try{showLoading('Sending overdue reminders...');const result=await API.post('/hiyari/email-outbox/queue-overdue',{year:_statsYear});showToast(`${result?.deliveryAttempted?'Delivery attempted':'Queued for delivery'} ${result?.queued||0}; skipped ${result?.skipped||0}`,'success');await _renderHiyariEmailQueueHealth();}catch(error){showError(error);}finally{hideLoading();}}));
    } catch (error) { el.innerHTML = `<div class="text-xs text-red-600">Email queue health unavailable: ${escHtml(error.message||'error')}</div>`; }
}

async function _renderHiyariFileHealth() {
    const el=document.getElementById('hiyari-file-health-panel'); if(!el||!_isAdmin)return;
    try{const res=await API.get('/hiyari/file-health');const data=res?.data||{},s=data.summary||{},rows=data.files||[];
        el.innerHTML=`<div data-hiyari-phase8-file-health="1"><div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4"><div><h3 class="text-sm font-black text-slate-800">Hiyari File & Attachment Health</h3><p class="text-xs text-slate-500 mt-1">Read-only scan · no automatic deletion</p></div><div class="grid grid-cols-4 gap-2">${[['References',s.references],['OK',s.ok],['Missing',s.missing],['External',s.external]].map(([k,v])=>`<div class="rounded-xl border border-slate-200 px-3 py-2 text-center"><p class="text-lg font-black ${k==='Missing'&&Number(v)?'text-red-600':'text-slate-800'}">${Number(v)||0}</p><p class="text-[9px] text-slate-500 uppercase">${k}</p></div>`).join('')}</div></div>
        <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-left text-slate-500 border-b"><th class="py-2">Report</th><th>Type</th><th>File</th><th>Metadata</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(f=>`<tr class="border-b border-slate-100"><td class="py-2 pr-3">${escHtml(f.reporterName||f.reportId)}</td><td class="pr-3">${escHtml(f.label)}</td><td class="pr-3 max-w-[240px] truncate">${escHtml(f.originalName||f.storedName)}</td><td class="pr-3 text-slate-500">${f.size!=null?`${Math.ceil(Number(f.size)/1024)} KB`:''} ${escHtml(f.extension||'')}</td><td class="pr-3"><span class="font-bold ${f.status==='missing'?'text-red-600':f.status==='ok'?'text-emerald-600':'text-sky-600'}">${escHtml(f.status)}</span></td><td class="text-right"><a href="${escHtml(f.url)}" target="_blank" rel="noopener" class="text-orange-600 font-bold">Preview</a></td></tr>`).join('')}</tbody></table></div><p class="mt-3 text-[11px] text-slate-500">${escHtml(data.note||'')}</p></div>`;
    }catch(error){el.innerHTML=`<p class="text-sm text-red-600">File health unavailable: ${escHtml(error.message||'error')}</p>`;}
}

async function renderManage(container) {
    container.innerHTML = `
        <div class="space-y-5">
            <div class="ds-section p-3">
                <div class="flex flex-wrap gap-2" id="hiyari-manage-subtabs">
                    <button type="button" data-manage-subtab="reviews"
                        class="hiyari-manage-subtab px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                        ตรวจรายงาน <span id="hiyari-review-pending-badge" class="hidden ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700"></span>
                    </button>
                    <button type="button" data-manage-subtab="assignments"
                        class="hiyari-manage-subtab px-4 py-2 rounded-xl text-sm font-bold transition-colors">รายการมอบหมาย</button>
                    <button type="button" data-manage-subtab="forms"
                        class="hiyari-manage-subtab px-4 py-2 rounded-xl text-sm font-bold transition-colors">แบบฟอร์มที่เกี่ยวข้อง</button>
                    <button type="button" data-manage-subtab="files"
                        class="hiyari-manage-subtab px-4 py-2 rounded-xl text-sm font-bold transition-colors">File Health</button>
                </div>
            </div>

            <div id="hiyari-manage-panel-reviews" class="ds-section p-5">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">ตรวจรายงาน Excel</h3>
                        <p class="text-xs text-slate-400 mt-0.5">ตรวจไฟล์ที่ผู้ใช้ส่งมา อนุมัติให้พิมพ์ลงนาม หรือตีกลับให้แก้ไข</p>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <select id="manage-filter-review" class="form-select rounded-xl text-sm w-full md:w-64">
                        <option value="PendingReview">รอแอดมินตรวจ Excel</option>
                        <option value="Approved">Excel ผ่านแล้ว รอ PDF ลงนาม</option>
                        <option value="Rejected">ตีกลับให้แก้ไข Excel</option>
                        <option value="Completed">ส่ง PDF ลงนามแล้ว</option>
                        <option value="DirectSigned">PDF ส่งโดยตรง</option>
                        <option value="all">ทุกขั้นตอนเอกสาร</option>
                    </select>
                    <button id="hiyari-retry-email-queue-btn" type="button"
                        class="px-3 py-2 rounded-xl text-xs font-bold border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors">
                        Retry Email Queue
                    </button>
                    </div>
                </div>
                <div id="hiyari-email-queue-health" class="mb-4"></div>
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">วันที่</th>
                                <th class="px-4 py-3">ผู้รายงาน</th>
                                <th class="px-4 py-3">รายละเอียด</th>
                                <th class="px-4 py-3">Rank</th>
                                <th class="px-4 py-3">ขั้นตอนเอกสาร</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="manage-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-8 text-slate-400">กำลังโหลดรายการรอตรวจ...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ── Assignment section ── -->
            <div id="hiyari-manage-panel-assignments" class="ds-section p-5 hidden">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">รายการมอบหมาย</h3>
                        <p class="text-xs text-slate-400 mt-0.5">กำหนดพนักงานที่ต้องรายงาน Hiyari-Hatto</p>
                    </div>
                    <button id="btn-add-assignment"
                        class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มรายการ
                    </button>
                </div>
                <div id="assignment-progress"></div>
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">ชื่อ-นามสกุล</th>
                                <th class="px-4 py-3">รหัสพนักงาน</th>
                                <th class="px-4 py-3">แผนก</th>
                                <th class="px-4 py-3">วันกำหนดส่ง</th>
                                <th class="px-4 py-3">ส่ง PDF โดยตรง</th>
                                <th class="px-4 py-3">หมายเหตุ</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="assignments-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="8" class="text-center py-6 text-slate-400">
                                <div class="animate-spin inline-block h-5 w-5 border-4 border-orange-400 border-t-transparent rounded-full mb-1.5"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- ── Forms management section ── -->
            <div id="hiyari-manage-panel-forms" class="ds-section p-5 hidden">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h3 class="text-sm font-bold text-slate-700">แบบฟอร์มที่เกี่ยวข้อง</h3>
                        <p class="text-xs text-slate-400 mt-0.5">จัดการแบบฟอร์มที่ผู้ใช้ต้องดาวน์โหลดและกรอก</p>
                    </div>
                    <button id="btn-add-hiyari-form"
                        class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                        </svg>
                        เพิ่มแบบฟอร์ม
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="ds-table text-sm">
                        <thead>
                            <tr class="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th class="px-4 py-3">ชื่อแบบฟอร์ม</th>
                                <th class="px-4 py-3">เวอร์ชั่น</th>
                                <th class="px-4 py-3">ประเภท</th>
                                <th class="px-4 py-3">สถานะ</th>
                                <th class="px-4 py-3">วันที่อัปโหลด</th>
                                <th class="px-4 py-3"></th>
                            </tr>
                        </thead>
                        <tbody id="hiyari-forms-tbody" class="divide-y divide-slate-100">
                            <tr><td colspan="6" class="text-center py-6 text-slate-400">
                                <div class="animate-spin inline-block h-5 w-5 border-4 border-orange-400 border-t-transparent rounded-full mb-1.5"></div>
                                <div class="text-sm">กำลังโหลด...</div>
                            </td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            <div id="hiyari-manage-panel-files" class="ds-section p-5 hidden"><div id="hiyari-file-health-panel">Loading file health...</div></div>
        </div>`;

    await Promise.all([
        fetchAndRenderManage('PendingReview'),
        loadAndRenderAssignments(),
        _loadHiyariForms(true).then(() => _renderHiyariFormsManage()),
        _renderHiyariEmailQueueHealth(),
        _renderHiyariFileHealth(),
    ]);
    await _refreshManageReviewNotice({ toast: false });
    _setManageSubtab(_manageSubtab);

    document.querySelectorAll('.hiyari-manage-subtab').forEach(btn => {
        btn.addEventListener('click', () => _setManageSubtab(btn.dataset.manageSubtab));
    });
    document.getElementById('manage-filter-review')?.addEventListener('change', (e) => fetchAndRenderManage(e.target.value));
    document.getElementById('hiyari-retry-email-queue-btn')?.addEventListener('click', guardActionHandler(async () => {
        const confirmed = await showConfirmationModal(
            'Retry Email Queue',
            'ต้องการส่งอีเมล Hiyari ที่ค้างคิวหรือส่งไม่สำเร็จอีกครั้งหรือไม่?'
        );
        if (!confirmed) return;
        try {
            showLoading('กำลัง retry อีเมลค้างคิว...');
            const res = await API.post('/hiyari/email-outbox/retry-queued', { limit: 20 });
            showToast(`ส่งสำเร็จ ${res?.sent || 0} ฉบับ / ไม่สำเร็จ ${res?.failed || 0} ฉบับ`, res?.failed ? 'warning' : 'success');
            await _renderHiyariEmailQueueHealth();
        } catch (err) {
            showError(err);
        } finally {
            hideLoading();
        }
    }));

    document.getElementById('btn-add-hiyari-form')?.addEventListener('click', _openHiyariFormUploadModal);

    document.querySelector('#hiyari-forms-tbody')?.addEventListener('click', guardActionHandler(async e => {
        const toggleBtn = e.target.closest('.hiyari-form-toggle');
        const deleteBtn = e.target.closest('.hiyari-form-delete');

        if (toggleBtn) {
            const id = toggleBtn.dataset.id;
            const isActive = toggleBtn.dataset.active === '1' || toggleBtn.dataset.active === 'true' || toggleBtn.dataset.active === 1;
            const form = _hiyariForms.find(f => String(f.id) === String(id));
            if (!form) return;
            try {
                await API.put(`/module-forms/${id}`, {
                    title: form.Title,
                    description: form.Description,
                    version: form.Version,
                    sortOrder: form.SortOrder,
                    isActive: isActive ? 0 : 1,
                });
                showToast(isActive ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว', 'success');
                await _loadHiyariForms(true);
                _renderHiyariFormsManage();
            } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
        }

        if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            const title = deleteBtn.dataset.title;
            showConfirmationModal(`ลบแบบฟอร์ม "${title}" ใช่หรือไม่?`, async () => {
                try {
                    await API.delete(`/module-forms/${id}`);
                    showToast('ลบแบบฟอร์มสำเร็จ', 'success');
                    await _loadHiyariForms(true);
                    _renderHiyariFormsManage();
                } catch (err) { showToast(err.message || 'เกิดข้อผิดพลาด', 'error'); }
            });
        }
    }, { render: false, target: event => event?.target?.closest?.('.hiyari-form-toggle, .hiyari-form-delete') || null, actionKey: (_event, button) => `hiyari:forms:${button.classList.contains('hiyari-form-delete') ? 'delete' : 'toggle'}:${button.dataset.id}` }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENTS — load + render
// ─────────────────────────────────────────────────────────────────────────────
async function loadAndRenderAssignments() {
    const tbody = document.getElementById('assignments-tbody');
    if (!tbody) return;
    try {
        const period = _getAssignmentPeriod();
        const [assignRes, reportRes] = await Promise.all([
            API.get('/hiyari/assignments'),
            API.get(`/hiyari?year=${period.year}`).catch(() => ({ data: [] })),
        ]);
        _assignments = normalizeApiArray(assignRes?.data ?? assignRes);
        const periodReports = normalizeApiArray(reportRes?.data ?? reportRes);
        const progress = _buildAssignmentProgress(_assignments, periodReports);
        _renderAssignmentProgress(progress);

        if (!_assignments.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 text-sm">
                <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
                    </svg>
                </div>
                ยังไม่มีรายการมอบหมาย
            </td></tr>`;
            return;
        }

        tbody.innerHTML = _assignments.map(a => {
            const due = a.DueDate ? new Date(a.DueDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const submitted = progress.submittedIds.has(String(a.EmployeeID || '').trim());
            const statusHtml = submitted
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>ส่งแล้ว</span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>ยังไม่ส่ง</span>`;
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 font-medium text-slate-800">${escHtml(a.AssigneeName || '-')}</td>
                <td class="px-4 py-3 text-slate-500 text-xs">${escHtml(a.EmployeeID || '-')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs">${escHtml(a.Department || '-')}</td>
                <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${due}</td>
                <td class="px-4 py-3 whitespace-nowrap">${Number(a.AllowDirectSignedPdf) === 1
                    ? '<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">อนุญาต</span>'
                    : '<span class="text-xs text-slate-400">Flow Excel</span>'}</td>
                <td class="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">${escHtml(a.Note || '-')}</td>
                <td class="px-4 py-3 whitespace-nowrap">${statusHtml}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button class="btn-edit-assignment px-3 py-1 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
                            data-id="${a.id}">แก้ไข</button>
                    <button class="btn-delete-assignment p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-1"
                            data-id="${a.id}" data-name="${escHtml(a.AssigneeName || '')}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Assignments fetch error:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-red-500 text-sm">เกิดข้อผิดพลาด: ${escHtml(err.message)}</td></tr>`;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ASSIGNMENT MODAL (Add / Edit)
// ─────────────────────────────────────────────────────────────────────────────

// Fetch all employees from master once and cache
async function _loadEmpCache() {
    if (_empCache) return _empCache;
    try {
        const res  = await API.get('/employees');
        _empCache  = (res?.data || res || []).filter(e => e.EmployeeID);
    } catch { _empCache = []; }
    return _empCache;
}

// Fetch master positions once and cache (Name field)
async function _loadPosCache() {
    if (_posCache) return _posCache;
    try {
        const res = await API.get('/master/positions');
        _posCache = (res?.data || res || []).map(p => (p.Name || '').trim()).filter(Boolean).sort();
    } catch { _posCache = []; }
    return _posCache;
}

// Ensure master departments are loaded (already fetched on page load — this is a safe fallback)
async function _fetchDepartments() {
    if (_departments.length) return _departments;
    try {
        const res = await API.get('/master/departments');
        _departments = normalizeApiArray(res?.data ?? res).map(d => (d.Name || d.name || '').trim()).filter(Boolean);
    } catch { _departments = []; }
    return _departments;
}

function _setManageSubtab(subtab) {
    _manageSubtab = ['reviews', 'assignments', 'forms', 'files'].includes(subtab) ? subtab : 'reviews';
    ['reviews', 'assignments', 'forms', 'files'].forEach(key => {
        document.getElementById(`hiyari-manage-panel-${key}`)?.classList.toggle('hidden', key !== _manageSubtab);
        const btn = document.querySelector(`.hiyari-manage-subtab[data-manage-subtab="${key}"]`);
        if (!btn) return;
        btn.className = `hiyari-manage-subtab px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
            key === _manageSubtab
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
        }`;
    });
}

async function _refreshManageReviewNotice({ toast = true } = {}) {
    if (!_isAdmin) return 0;
    try {
        const res = await API.get('/hiyari');
        const reports = normalizeApiArray(res?.data ?? res);
        const pending = reports.filter(r => (r.ReviewStatus || 'PendingReview') === 'PendingReview').length;
        const badge = document.getElementById('hiyari-review-pending-badge');
        if (badge) {
            badge.textContent = String(pending);
            badge.classList.toggle('hidden', pending === 0);
        }
        const manageTab = document.querySelector('.hiyari-tab[data-tab="manage"]');
        let mainBadge = document.getElementById('hiyari-main-review-badge');
        if (manageTab && !mainBadge) {
            mainBadge = document.createElement('span');
            mainBadge.id = 'hiyari-main-review-badge';
            mainBadge.className = 'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700';
            manageTab.appendChild(mainBadge);
        }
        if (mainBadge) {
            mainBadge.textContent = String(pending);
            mainBadge.classList.toggle('hidden', pending === 0);
        }
        if (toast && pending > 0) {
            showToast(`มีรายงาน Excel รอตรวจสอบ ${pending} รายการ`, 'info');
        }
        return pending;
    } catch (_) {
        return 0;
    }
}

function _stopManageReviewNoticeWatch() {
    if (_reviewNoticeTimer) {
        clearInterval(_reviewNoticeTimer);
        _reviewNoticeTimer = null;
    }
    _lastPendingReviewCount = null;
}

async function _startManageReviewNoticeWatch() {
    _stopManageReviewNoticeWatch();
    _lastPendingReviewCount = await _refreshManageReviewNotice();
    _reviewNoticeTimer = setInterval(async () => {
        if (!document.getElementById('hiyari-page')) {
            _stopManageReviewNoticeWatch();
            return;
        }

        const pending = await _refreshManageReviewNotice({ toast: false });
        if (_lastPendingReviewCount !== null && pending > _lastPendingReviewCount) {
            showToast(`มีรายงาน Excel รอตรวจสอบเพิ่ม ${pending - _lastPendingReviewCount} รายการ`, 'info');
        }
        _lastPendingReviewCount = pending;
    }, 45000);
}

async function _setSubmitDocumentMode(mode = 'excel') {
    _submitDocumentMode = ['excel', 'pdf', 'direct'].includes(mode) ? mode : 'excel';
    const useExistingPdf = _submitDocumentMode === 'pdf';
    const useDirectPdf = _submitDocumentMode === 'direct';
    document.getElementById('hiyari-excel-flow')?.classList.toggle('hidden', useExistingPdf);
    document.getElementById('hiyari-signed-pdf-flow')?.classList.toggle('hidden', !useExistingPdf);

    [
        ['hiyari-mode-excel', 'excel', 'border-orange-300', 'bg-orange-50'],
        ['hiyari-mode-pdf', 'pdf', 'border-emerald-300', 'bg-emerald-50'],
        ['hiyari-mode-direct', 'direct', 'border-sky-300', 'bg-sky-50'],
    ].forEach(([id, key, border, bg]) => {
        const el = document.getElementById(id);
        const active = key === _submitDocumentMode;
        el?.classList.toggle(border, active);
        el?.classList.toggle(bg, active);
        el?.classList.toggle('border-slate-200', !active);
        el?.classList.toggle('bg-white', !active);
    });

    const file = document.getElementById('hiyari-file');
    if (file) {
        file.accept = useDirectPdf ? '.pdf' : '.xls,.xlsx';
        file.value = '';
    }
    const preview = document.getElementById('hiyari-file-preview');
    if (preview) preview.innerHTML = '';
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = value;
    };
    setText('hiyari-attachment-flow-title', useDirectPdf ? 'Direct Signed PDF / ส่ง PDF โดยตรง' : 'Excel Review / ส่งให้ตรวจสอบ');
    setText('hiyari-attachment-flow-note', useDirectPdf
        ? 'สิทธิ์นี้กำหนดโดยแอดมินในรายการมอบหมาย ระบบจะสร้างรายงานพร้อมไฟล์ PDF ที่ลงนามแล้วและแจ้งผู้ดูแลให้ตรวจสอบ'
        : 'ขั้นตอนนี้ส่งไฟล์ Excel ให้แอดมินตรวจสอบก่อน เมื่อผ่านแล้วให้กลับมาที่โหมด “ส่ง PDF ที่ลงนามแล้ว”');
    setText('hiyari-attachment-label', useDirectPdf
        ? 'PDF ที่ลงนามแล้ว <span class="text-red-500">*</span>'
        : 'ไฟล์ Excel สำหรับตรวจสอบ <span class="text-red-500">*</span>');
    setText('hiyari-attachment-help', useDirectPdf
        ? 'รับเฉพาะ PDF ที่พิมพ์และลงนามครบแล้ว ขนาดไม่เกิน 20 MB'
        : 'ขั้นตอนนี้รับเฉพาะ Excel .xls หรือ .xlsx ขนาดไม่เกิน 20 MB');
    _renderSubmitAssigneeOptions();
    if (useExistingPdf) await _loadSignedSubmissionOptions();
}

async function _loadDirectSignedPermissionOptions() {
    const button = document.getElementById('hiyari-mode-direct');
    if (!button) return [];
    try {
        const assignments = _submitAssignments.length
            ? _submitAssignments
            : normalizeApiArray((await API.get('/hiyari/assignments'))?.data ?? []);
        _submitAssignments = assignments;
        await _applySubmitModeAccess(assignments);
        return assignments;
    } catch (_) {
        button.classList.add('hidden');
        return [];
    }
}

async function _applySubmitModeAccess(assignments = []) {
    const excelButton = document.getElementById('hiyari-mode-excel');
    const pdfButton = document.getElementById('hiyari-mode-pdf');
    const directButton = document.getElementById('hiyari-mode-direct');
    const grid = document.getElementById('hiyari-document-mode-grid');
    const title = document.getElementById('hiyari-document-mode-title');
    const note = document.getElementById('hiyari-document-mode-note');
    if (!directButton) return;

    const user = TSHSession.getUser() || {};
    const userIds = new Set([user.id, user.EmployeeID, user.employeeId].filter(Boolean).map(String));
    const currentUserCanSubmitDirect = assignments.some(a =>
        a.EmployeeID
        && userIds.has(String(a.EmployeeID))
        && Number(a.AllowDirectSignedPdf) === 1
    );

    if (!_isAdmin && currentUserCanSubmitDirect) {
        excelButton?.classList.add('hidden');
        pdfButton?.classList.add('hidden');
        directButton.classList.remove('hidden');
        grid?.classList.remove('lg:grid-cols-3');
        grid?.classList.add('lg:grid-cols-1');
        if (title) title.textContent = 'ส่งรายงาน PDF ที่ลงนามแล้ว';
        if (note) {
            note.textContent = 'บัญชีนี้ได้รับอนุญาตจากแอดมินให้ส่ง PDF ที่ลงนามแล้วได้โดยไม่ต้องส่ง Excel เพื่อตรวจสอบก่อน';
            note.classList.remove('hidden');
        }
        if (_submitDocumentMode !== 'direct') await _setSubmitDocumentMode('direct');
        return;
    }

    excelButton?.classList.remove('hidden');
    pdfButton?.classList.remove('hidden');
    grid?.classList.remove('lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3');
    grid?.classList.add(_isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-2');
    if (title) title.textContent = 'เลือกขั้นตอนเอกสารที่ต้องการส่ง';
    note?.classList.add('hidden');
    note && (note.textContent = '');

    if (_isAdmin) {
        directButton.classList.remove('hidden');
        return;
    }

    directButton.classList.add('hidden');
    if (_submitDocumentMode === 'direct') await _setSubmitDocumentMode('excel');
}

async function _loadSubmitAssigneeOptions() {
    const select = document.getElementById('hiyari-on-behalf');
    if (!select) return;
    try {
        const res = await API.get('/hiyari/assignments');
        _submitAssignments = normalizeApiArray(res?.data ?? res);
        _renderSubmitAssigneeOptions();
        await _applyHiyariCompanyEmail({ loadEmployee: true });
        _renderSubmitOwnerPreview();
        await _loadDirectSignedPermissionOptions();
    } catch (_) {
        _submitAssignments = [];
        select.value = '';
        const search = document.getElementById('hiyari-on-behalf-search');
        const list = document.getElementById('hiyari-on-behalf-list');
        if (search) search.value = '';
        if (list) list.innerHTML = '';
        _renderSubmitOwnerPreview();
    }
}

function _renderSubmitAssigneeOptions() {
    return _renderSubmitAssigneeDropdown(document.getElementById('hiyari-on-behalf-search')?.value || '');
}

function _renderSubmitAssigneeDropdown(query = '', { open = false } = {}) {
    const hidden = document.getElementById('hiyari-on-behalf');
    const input = document.getElementById('hiyari-on-behalf-search');
    const list = document.getElementById('hiyari-on-behalf-list');
    const clear = document.getElementById('hiyari-on-behalf-clear');
    const help = document.getElementById('hiyari-on-behalf-help');
    if (!hidden || !list) return;
    const currentValue = hidden.value;
    const selected = currentValue
        ? _availableSubmitAssignments().find(a => String(a.EmployeeID || '') === String(currentValue)) || null
        : null;
    if (selected && input) {
        input.value = _submitAssigneeLabel(selected);
        query = '';
    } else if (currentValue) {
        hidden.value = '';
    }
    const assignments = _filteredSubmitAssignments(query);
    const rows = assignments.length
        ? assignments.map(a => {
            const direct = Number(a.AllowDirectSignedPdf) === 1;
            return `
                <button type="button" class="hiyari-on-behalf-option w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
                        data-employee-id="${escHtml(a.EmployeeID || '')}">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-slate-800 truncate">${escHtml(a.AssigneeName || a.EmployeeName || a.EmployeeID || '-')}</p>
                            <p class="text-xs text-slate-500 truncate">${escHtml([a.EmployeeID, a.Department || '-'].filter(Boolean).join(' · '))}</p>
                            <p class="text-[11px] text-slate-400 truncate">${escHtml(a.CompanyEmail || 'CompanyEmail missing')}</p>
                        </div>
                        ${direct ? '<span class="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">Direct PDF</span>' : ''}
                    </div>
                </button>`;
        }).join('')
        : '<div class="px-3 py-4 text-sm text-slate-500">No matching Hiyari assignment.</div>';
    list.innerHTML = rows;
    list.classList.toggle('hidden', !open);
    input?.setAttribute('aria-expanded', open ? 'true' : 'false');
    clear?.classList.toggle('hidden', !hidden.value && !input?.value);
    if (help) {
        help.className = `text-[11px] mt-1 ${input?.value && !hidden.value ? 'text-rose-600 font-semibold' : 'text-slate-400'}`;
        help.textContent = input?.value && !hidden.value
            ? 'Select a matching assignment from the dropdown, or clear the field to submit as yourself.'
            : 'Search assignment list by employee name, ID, department, or CompanyEmail.';
    }
    _renderSubmitOwnerPreview();
    _applyHiyariCompanyEmail({ loadEmployee: false });
}

async function _loadSignedSubmissionOptions() {
    const select = document.getElementById('hiyari-signed-report-id');
    if (!select) return [];
    select.innerHTML = '<option value="">กำลังโหลดรายการ...</option>';
    try {
        const user = TSHSession.getUser() || {};
        const userIds = new Set([user.id, user.EmployeeID, user.employeeId].filter(Boolean).map(String));
        const res = await API.get('/hiyari');
        _signedReportOptions = normalizeApiArray(res?.data ?? res).filter(r => {
            if (r.ReviewStatus !== 'Approved' || r.SignedFileUrl) return false;
            if (_isAdmin) return true;
            return userIds.has(String(r.ReporterID || '')) || userIds.has(String(r.SubmittedByID || ''));
        });
        if (!_signedReportOptions.length) {
            select.innerHTML = '<option value="">ยังไม่มีรายงานที่ Excel ผ่านและรอ PDF ลงนาม</option>';
            _renderSignedReportSummary(null);
            return [];
        }
        select.innerHTML = `
            <option value="">เลือกรายงานที่ต้องการส่ง PDF</option>
            ${_signedReportOptions.map(r => {
                const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH') : '-';
                return `<option value="${escHtml(r.id)}">${escHtml(date)} · ${escHtml(r.ReporterName || '-')} · ${escHtml(r.Department || '-')} · ${escHtml(REVIEW_LABEL[r.ReviewStatus] || r.ReviewStatus)}</option>`;
            }).join('')}`;
        _renderSignedReportSummary(null);
        return _signedReportOptions;
    } catch (err) {
        select.innerHTML = '<option value="">โหลดรายการไม่สำเร็จ</option>';
        _renderSignedReportSummary(null);
        return [];
    }
}

function _renderSignedReportSummary(report) {
    const el = document.getElementById('hiyari-signed-report-summary');
    if (!el) return;
    if (!report) {
        el.innerHTML = 'เลือกรายงานเพื่อดูข้อมูลก่อนอัปโหลด PDF';
        return;
    }
    const stop = STOP_TYPES.find(s => s.id === Number(report.StopType));
    const date = report.ReportDate ? new Date(report.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
    el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div><span class="text-slate-400">เจ้าของรายงาน:</span> <b class="text-slate-700">${escHtml(report.ReporterName || '-')}</b></div>
            <div><span class="text-slate-400">วันที่รายงาน:</span> <b class="text-slate-700">${escHtml(date)}</b></div>
            <div><span class="text-slate-400">Stop Type:</span> <b class="text-slate-700">${escHtml(stop?.code || '-')}</b></div>
            <div><span class="text-slate-400">Rank:</span> <b class="text-slate-700">${escHtml(report.Rank || '-')}</b></div>
            <div class="md:col-span-2"><span class="text-slate-400">ขั้นตอนเอกสาร:</span> <b class="text-emerald-700">${escHtml(REVIEW_LABEL[report.ReviewStatus] || report.ReviewStatus || '-')}</b></div>
        </div>`;
}

async function _fetchAreas() {
    if (_areas.length) return _areas;
    try {
        const res = await API.get('/master/areas');
        _areas = normalizeApiArray(res?.data ?? res)
            .map(a => (a.Name || a.AreaName || a.name || '').trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
    } catch { _areas = []; }
    return _areas;
}

// Shared submit handler for both Add and Edit
function _attachAssignmentFormSubmit(assignment) {
    const isEdit = !!assignment;
    document.getElementById('assignment-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
        e.preventDefault();
        const fd  = new FormData(e.target);
        const btn = document.getElementById('assignment-save-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังบันทึก...`;

        const payload = {
            AssigneeName: fd.get('AssigneeName') || null,
            EmployeeID:   fd.get('EmployeeID')   || null,
            Department:   fd.get('Department')   || null,
            DueDate:      fd.get('DueDate')      || null,
            Note:         fd.get('Note')         || null,
            AllowDirectSignedPdf: fd.get('AllowDirectSignedPdf') ? 1 : 0,
        };

        try {
            if (isEdit) {
                await API.put(`/hiyari/assignments/${assignment.id}`, payload);
                showToast('แก้ไขรายการสำเร็จ', 'success');
            } else {
                await API.post('/hiyari/assignments', payload);
                showToast('เพิ่มรายการสำเร็จ', 'success');
            }
            closeModal();
            await loadAndRenderAssignments();
            await _loadHeroStats();
        } catch (err) {
            showError(err);
            btn.disabled = false;
            btn.textContent = isEdit ? 'บันทึก' : 'เพิ่ม';
        }
    }));
}

function openAssignmentModal(assignment = null) {
    const isEdit = !!assignment;

    // ── EDIT MODE ────────────────────────────────────────────────────────────
    if (isEdit) {
        const html = `
        <div class="space-y-4 px-1">
            <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                แก้ไขข้อมูลรายการมอบหมาย
            </div>
            <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                     style="background:linear-gradient(135deg,#f97316,#ef4444)">
                    ${escHtml((assignment.AssigneeName || '?')[0])}
                </div>
                <div class="min-w-0">
                    <p class="font-semibold text-slate-800 text-sm">${escHtml(assignment.AssigneeName || '-')}</p>
                    <p class="text-xs text-slate-500">${[assignment.Department, assignment.EmployeeID].filter(Boolean).map(escHtml).join(' · ') || '-'}</p>
                </div>
            </div>
            <form id="assignment-form" class="space-y-3">
                <input type="hidden" name="EmployeeID"   value="${escHtml(assignment.EmployeeID   || '')}">
                <input type="hidden" name="AssigneeName" value="${escHtml(assignment.AssigneeName || '')}">
                <input type="hidden" name="Department"   value="${escHtml(assignment.Department   || '')}">
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันกำหนดส่ง</label>
                    <input type="date" name="DueDate" class="form-input w-full rounded-xl text-sm"
                           value="${assignment.DueDate ? assignment.DueDate.split('T')[0] : ''}">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หมายเหตุ</label>
                    <textarea name="Note" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                              placeholder="รายละเอียดเพิ่มเติม...">${escHtml(assignment.Note || '')}</textarea>
                </div>
                <label class="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                    <input type="checkbox" name="AllowDirectSignedPdf" value="1" class="mt-0.5 h-4 w-4 accent-sky-600"
                           ${Number(assignment.AllowDirectSignedPdf) === 1 ? 'checked' : ''}>
                    <span>
                        <span class="block text-sm font-bold text-slate-800">อนุญาตส่ง PDF ที่ลงนามแล้วโดยตรง</span>
                        <span class="block text-xs text-slate-500 mt-0.5">พนักงานรายนี้ข้ามขั้นส่ง Excel ได้ และหน้า รายงานใหม่ จะแสดงเฉพาะ flow ส่ง PDF โดยตรงเพื่อลดความสับสน</span>
                        <span class="block text-xs text-sky-700 mt-1">ระบบยังบันทึกผู้ส่ง ตรวจสอบสิทธิ์ และแจ้งแอดมินเมื่อมี PDF เข้ามา</span>
                    </span>
                </label>
                <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                    <button type="button" onclick="window.closeModal&&window.closeModal()"
                            class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                    <button type="submit" id="assignment-save-btn"
                            class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)">บันทึก</button>
                </div>
            </form>
        </div>`;
        openModal('แก้ไขรายการมอบหมาย', html, 'max-w-md');
        _attachAssignmentFormSubmit(assignment);
        return;
    }

    // ── ADD MODE — multi-select with position/dept filters ───────────────────
    const html = `
    <div class="space-y-3 px-1">
        <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
            <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
            </svg>
            เลือกพนักงานจากตำแหน่ง/ส่วนงาน หรือค้นหาชื่อ — เลือกได้ทีละหลายคน
        </div>

        <!-- Filters -->
        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ตำแหน่ง</label>
                <select id="emp-filter-pos" class="form-select w-full rounded-xl text-sm">
                    <option value="">— ทุกตำแหน่ง —</option>
                </select>
            </div>
            <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">ส่วนงาน / แผนก</label>
                <select id="emp-filter-dept" class="form-select w-full rounded-xl text-sm">
                    <option value="">— ทุกส่วนงาน —</option>
                </select>
            </div>
        </div>

        <!-- Search -->
        <div class="relative">
            <div class="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
            <input type="text" id="emp-search-input" autocomplete="off"
                   class="form-input w-full rounded-xl text-sm pl-9"
                   placeholder="พิมพ์ชื่อหรือรหัสพนักงาน...">
            <div id="emp-search-spinner" class="hidden absolute inset-y-0 right-3 flex items-center">
                <span class="animate-spin w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full inline-block"></span>
            </div>
        </div>

        <!-- Results header: count + select-all -->
        <div id="emp-results-header" class="hidden flex items-center justify-between px-0.5">
            <p id="emp-result-count" class="text-[11px] text-slate-400"></p>
            <button id="emp-select-all-btn" type="button"
                    class="text-[11px] font-semibold text-orange-600 hover:text-orange-800 transition-colors">
                เลือกทั้งหมด
            </button>
        </div>

        <!-- Results list with checkboxes -->
        <div id="emp-search-results" class="hidden max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100"></div>

        <!-- Selected summary chips -->
        <div id="emp-sel-summary" class="hidden rounded-xl border border-orange-200 bg-orange-50 p-3">
            <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-orange-800">
                    เลือกแล้ว <span id="sel-count">0</span> คน
                </span>
                <button id="emp-clear-all" type="button"
                        class="text-[11px] text-slate-400 hover:text-red-500 transition-colors">ล้างทั้งหมด</button>
            </div>
            <div id="sel-chips" class="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto"></div>
        </div>

        <!-- Placeholder -->
        <div id="emp-placeholder" class="py-6 text-center text-slate-400">
            <div class="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                </svg>
            </div>
            <p class="text-sm font-medium">เลือกตำแหน่ง/ส่วนงาน หรือพิมพ์ค้นหา</p>
        </div>

        <!-- Common form fields + submit -->
        <form id="assignment-form" class="space-y-3 border-t border-slate-100 pt-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันกำหนดส่ง</label>
                    <input type="date" id="add-due-date" class="form-input w-full rounded-xl text-sm">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">หมายเหตุ</label>
                    <input type="text" id="add-note" class="form-input w-full rounded-xl text-sm"
                           placeholder="หมายเหตุ (ถ้ามี)">
                </div>
            </div>
            <label class="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
                <input type="checkbox" id="add-allow-direct-pdf" class="mt-0.5 h-4 w-4 accent-sky-600">
                <span>
                    <span class="block text-sm font-bold text-slate-800">อนุญาตส่ง PDF ที่ลงนามแล้วโดยตรง</span>
                    <span class="block text-xs text-slate-500 mt-0.5">ใช้สิทธิ์นี้กับพนักงานที่เลือกทั้งหมดในรอบการเพิ่มนี้ และหน้า รายงานใหม่ ของพนักงานเหล่านี้จะแสดงเฉพาะ flow ส่ง PDF โดยตรง</span>
                </span>
            </label>
            <div class="flex justify-end gap-3">
                <button type="button" onclick="window.closeModal&&window.closeModal()"
                        class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                <button type="submit" id="assignment-save-btn" disabled
                        class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all opacity-50 cursor-not-allowed"
                        style="background:linear-gradient(135deg,#f97316,#ef4444)">
                    เพิ่ม <span id="save-count">0</span> คน
                </button>
            </div>
        </form>
    </div>`;

    openModal('เพิ่มรายการมอบหมาย', html, 'max-w-md');

    // ── State ─────────────────────────────────────────────────────────────────
    const assignedIds  = new Set(_assignments.map(a => a.EmployeeID).filter(Boolean));
    const selectedEmps = new Map(); // EmployeeID → emp object
    let   currentMatches = [];      // current filtered result (for select-all)

    const searchInput   = document.getElementById('emp-search-input');
    const filterPosEl   = document.getElementById('emp-filter-pos');
    const filterDeptEl  = document.getElementById('emp-filter-dept');
    const resultsEl     = document.getElementById('emp-search-results');
    const resultsHdrEl  = document.getElementById('emp-results-header');
    const countEl       = document.getElementById('emp-result-count');
    const selectAllBtn  = document.getElementById('emp-select-all-btn');
    const summaryEl     = document.getElementById('emp-sel-summary');
    const selCountEl    = document.getElementById('sel-count');
    const chipsEl       = document.getElementById('sel-chips');
    const placeholderEl = document.getElementById('emp-placeholder');
    const spinnerEl     = document.getElementById('emp-search-spinner');
    const saveBtn       = document.getElementById('assignment-save-btn');
    const saveCountEl   = document.getElementById('save-count');

    // ── Populate filter dropdowns ─────────────────────────────────────────────
    Promise.all([_loadPosCache(), _fetchDepartments()]).then(([positions]) => {
        positions.forEach(name => {
            filterPosEl.insertAdjacentHTML('beforeend', `<option value="${escHtml(name)}">${escHtml(name)}</option>`);
        });
        _departments.forEach(name => {
            filterDeptEl.insertAdjacentHTML('beforeend', `<option value="${escHtml(name)}">${escHtml(name)}</option>`);
        });
    });

    // ── Selection UI updater ──────────────────────────────────────────────────
    function updateSelectionUI() {
        const count = selectedEmps.size;
        selCountEl.textContent  = count;
        saveCountEl.textContent = count;

        if (count > 0) {
            summaryEl.classList.remove('hidden');
            placeholderEl.classList.add('hidden');
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            // Render chips
            chipsEl.innerHTML = Array.from(selectedEmps.values()).map(e => `
                <span class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px] font-medium bg-orange-200 text-orange-900">
                    ${escHtml(e.EmployeeName || e.EmployeeID)}
                    <button type="button" data-remove="${escHtml(e.EmployeeID)}"
                            class="emp-chip-remove w-3.5 h-3.5 rounded-full hover:bg-orange-400 hover:text-white flex items-center justify-center text-orange-600 flex-shrink-0">×</button>
                </span>`).join('');
            chipsEl.querySelectorAll('.emp-chip-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectedEmps.delete(btn.dataset.remove);
                    updateSelectionUI();
                    syncCheckboxes();
                });
            });
        } else {
            summaryEl.classList.add('hidden');
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            if (resultsEl.classList.contains('hidden')) placeholderEl.classList.remove('hidden');
        }

        // Update select-all button label
        const available = currentMatches.filter(e => !assignedIds.has(e.EmployeeID));
        const allSel    = available.length > 0 && available.every(e => selectedEmps.has(e.EmployeeID));
        selectAllBtn.textContent = allSel ? 'ยกเลิกทั้งหมด' : `เลือกทั้งหมด (${available.length})`;
    }

    // Sync checkbox states in the visible result list to match selectedEmps
    function syncCheckboxes() {
        resultsEl.querySelectorAll('.emp-cb[data-id]').forEach(cb => {
            cb.checked = selectedEmps.has(cb.dataset.id);
        });
    }

    // ── Render result rows with checkboxes ────────────────────────────────────
    function renderResults(matches, emps) {
        currentMatches = matches;
        const available = matches.filter(e => !assignedIds.has(e.EmployeeID));

        countEl.textContent = matches.length ? `แสดง ${matches.length} คน` : '';
        resultsHdrEl.classList.toggle('hidden', !matches.length);
        selectAllBtn.classList.toggle('hidden', !available.length);

        if (!matches.length) {
            resultsEl.innerHTML = `<div class="px-4 py-3 text-sm text-slate-400 text-center">ไม่พบพนักงานที่ตรงกัน</div>`;
            resultsEl.classList.remove('hidden');
            updateSelectionUI();
            return;
        }

        resultsEl.innerHTML = matches.map(e => {
            const already  = assignedIds.has(e.EmployeeID);
            const checked  = selectedEmps.has(e.EmployeeID);
            const subtitle = [e.Position, e.Department, e.EmployeeID].filter(Boolean).map(escHtml).join(' · ');
            return `
            <label class="emp-result-row flex items-center gap-3 px-3 py-2.5 transition-colors select-none
                          ${already ? 'opacity-50 cursor-not-allowed bg-slate-50' : 'hover:bg-orange-50 cursor-pointer'}"
                   data-id="${escHtml(e.EmployeeID)}">
                <input type="checkbox" class="emp-cb w-4 h-4 rounded accent-orange-500 flex-shrink-0"
                       data-id="${escHtml(e.EmployeeID)}"
                       ${already ? 'disabled' : ''}
                       ${checked  ? 'checked' : ''}>
                <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                     style="background:${already ? '#cbd5e1' : 'linear-gradient(135deg,#f97316,#ef4444)'}">
                    ${escHtml((e.EmployeeName || '?')[0])}
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-slate-800 truncate">${escHtml(e.EmployeeName || '')}</p>
                    <p class="text-xs text-slate-400 truncate">${subtitle}</p>
                </div>
                ${already
                    ? `<span class="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-500">
                           <span class="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"></span>เพิ่มแล้ว
                       </span>`
                    : ''}
            </label>`;
        }).join('');
        resultsEl.classList.remove('hidden');
        placeholderEl.classList.add('hidden');

        // Checkbox change handlers
        resultsEl.querySelectorAll('.emp-cb:not([disabled])').forEach(cb => {
            cb.addEventListener('change', () => {
                const emp = emps.find(e => e.EmployeeID === cb.dataset.id);
                if (!emp) return;
                if (cb.checked) selectedEmps.set(emp.EmployeeID, emp);
                else            selectedEmps.delete(emp.EmployeeID);
                updateSelectionUI();
            });
        });

        updateSelectionUI();
    }

    // ── Filter logic ──────────────────────────────────────────────────────────
    function applyFilters(emps) {
        const q    = searchInput.value.trim().toLowerCase();
        const pos  = filterPosEl.value;
        const dept = filterDeptEl.value;
        return emps.filter(e => {
            const matchPos  = !pos  || (e.Position   || '').trim() === pos;
            const matchDept = !dept || (e.Department || '').trim() === dept;
            const matchText = !q    ||
                (e.EmployeeName || '').toLowerCase().includes(q) ||
                (e.EmployeeID   || '').toLowerCase().includes(q);
            return matchPos && matchDept && matchText;
        });
    }

    async function refreshResults() {
        const q    = searchInput.value.trim();
        const pos  = filterPosEl.value;
        const dept = filterDeptEl.value;
        if (!q && !pos && !dept) {
            resultsEl.classList.add('hidden');
            resultsHdrEl.classList.add('hidden');
            currentMatches = [];
            if (!selectedEmps.size) placeholderEl.classList.remove('hidden');
            return;
        }
        spinnerEl.classList.remove('hidden');
        const emps = await _loadEmpCache();
        spinnerEl.classList.add('hidden');
        renderResults(applyFilters(emps), emps);
    }

    // ── Select all / clear all ────────────────────────────────────────────────
    selectAllBtn.addEventListener('click', guardActionHandler(async () => {
        const emps      = await _loadEmpCache();
        const available = currentMatches.filter(e => !assignedIds.has(e.EmployeeID));
        const allSel    = available.every(e => selectedEmps.has(e.EmployeeID));
        if (allSel) {
            available.forEach(e => selectedEmps.delete(e.EmployeeID));
        } else {
            available.forEach(e => selectedEmps.set(e.EmployeeID, e));
        }
        syncCheckboxes();
        updateSelectionUI();
    }));

    document.getElementById('emp-clear-all').addEventListener('click', () => {
        selectedEmps.clear();
        syncCheckboxes();
        updateSelectionUI();
    });

    // ── Submit — loop POST per employee ───────────────────────────────────────
    document.getElementById('assignment-form').addEventListener('submit', guardSubmitHandler(async (ev) => {
        ev.preventDefault();
        if (!selectedEmps.size) return;
        const dueDate = document.getElementById('add-due-date').value || null;
        const note    = document.getElementById('add-note').value.trim() || null;
        const allowDirectSignedPdf = document.getElementById('add-allow-direct-pdf')?.checked ? 1 : 0;
        const empList = Array.from(selectedEmps.values());

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังเพิ่ม...`;

        const failed = [];
        for (const emp of empList) {
            try {
                await API.post('/hiyari/assignments', {
                    EmployeeID:   emp.EmployeeID,
                    AssigneeName: emp.EmployeeName || '',
                    Department:   emp.Department   || '',
                    DueDate:      dueDate,
                    Note:         note,
                    AllowDirectSignedPdf: allowDirectSignedPdf,
                });
            } catch { failed.push(escHtml(emp.EmployeeName || emp.EmployeeID)); }
        }

        const ok = empList.length - failed.length;
        if (ok)           showToast(`เพิ่ม ${ok} คนสำเร็จ`, 'success');
        if (failed.length) showToast(`ไม่สามารถเพิ่มได้: ${failed.join(', ')}`, 'error');

        closeModal();
        await loadAndRenderAssignments();
        await _loadHeroStats();
    }));

    // ── Event wiring ──────────────────────────────────────────────────────────
    filterPosEl.addEventListener('change',  () => refreshResults());
    filterDeptEl.addEventListener('change', () => refreshResults());
    let _searchTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(refreshResults, 200);
    });

    searchInput.focus();
}

async function fetchAndRenderManage(reviewFilter) {
    const tbody = document.getElementById('manage-tbody');
    if (!tbody) return;
    try {
        const params = new URLSearchParams();
        if (reviewFilter && !['all', 'DirectSigned'].includes(reviewFilter)) params.set('review', reviewFilter);
        const res    = await API.get(`/hiyari?${params}`);
        const reports = normalizeApiArray(res?.data ?? res)
            .filter(r => reviewFilter !== 'DirectSigned' || _isDirectSignedPdfReport(r));

        if (!reports.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-10 text-slate-400 text-sm">ไม่พบรายงาน</td></tr>`;
            return;
        }

        tbody.innerHTML = reports.map(r => {
            const date = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric' }) : '-';
            const sla  = _getSLA(r);
            const rowStyle = _getSLARowStyle(sla);
            return `
            <tr class="transition-colors" style="${rowStyle}">
                <td class="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">${date}</td>
                <td class="px-4 py-3">
                    <div class="font-medium text-slate-800">${escHtml(r.ReporterName || '-')}</div>
                    <div class="text-xs text-slate-400">${escHtml(r.Department || '-')}</div>
                </td>
                <td class="px-4 py-3 text-slate-600 text-xs max-w-[200px]">
                    <div class="truncate">${escHtml(r.Description || '-')}</div>
                    ${(() => { const st = STOP_TYPES.find(s => s.id === Number(r.StopType)); return st ? `<span class="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold" style="background:${st.bg};color:${st.color}">${st.code}</span>` : ''; })()}
                </td>
                <td class="px-4 py-3">
                    ${r.Rank
                        ? `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RANK_BADGE[r.Rank] || 'bg-slate-100 text-slate-500'}">${RANK_LABEL[r.Rank] || r.Rank}</span>`
                        : `<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-'}</span>`
                    }
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                        ${STATUS_LABEL[r.Status] || r.Status || '-'}
                    </span>
                    <div class="mt-1">${_buildDocumentFlowBadge(r, { showNote: true })}</div>
                    ${_buildSLABadge(sla)}
                </td>
                <td class="px-4 py-3 text-right flex items-center gap-1 justify-end">
                    <button class="btn-manage-report px-3 py-1 rounded-lg text-xs font-semibold text-white transition-all"
                            style="background:linear-gradient(135deg,#f97316,#ef4444)"
                            data-id="${r.id}">จัดการ</button>
                    <button class="btn-delete-report p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            data-id="${r.id}" data-name="${escHtml(r.ReporterName || '')}" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error('Manage fetch error:', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
async function showDetailModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const [res, timelineRes] = await Promise.all([
            API.get(`/hiyari/${id}`),
            API.get(`/hiyari/${id}/timeline`).catch(() => ({ data: [] })),
        ]);
        const r   = normalizeApiObject(res?.data ?? res);
        const timeline = normalizeApiArray(timelineRes?.data ?? timelineRes);
        hideLoading();

        const date  = r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric' }) : '-';
        const isImg = url => url && /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url);
        const stDet = STOP_TYPES.find(s => s.id === Number(r.StopType));
        const rankR = RANKS.find(x => x.rank === r.Rank);
        const statusLabel = STATUS_LABEL[r.Status] || r.Status || '-';
        const stopLabel = stDet?.code || '-';
        const rankLabel = rankR?.label || RISK_LABEL[r.RiskLevel] || r.RiskLevel || '-';
        const highRisk = ['A','B'].includes(r.Rank) || ['High','Critical'].includes(r.RiskLevel);
        const revisions = normalizeApiArray(r.revisions || r.Revisions || []);
        const canResubmitExcel = _canResubmitHiyariExcel(r);

        const html = `
            <div class="space-y-4 px-1 text-sm">

                ${r.IsLearningRecord ? `
                <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
                    <p class="text-sm font-bold">รายงานปิดงานสำหรับเรียนรู้</p>
                    <p class="mt-1 text-xs leading-relaxed">รายการนี้เป็นข้อมูลแบบอ่านอย่างเดียว ระบบซ่อนข้อมูลติดต่อ ไฟล์ต้นฉบับ และบันทึกภายในไว้แล้ว</p>
                </div>` : ''}

                <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Status</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(statusLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Stop Type</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(stopLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Rank</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(rankLabel)}</p>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p class="text-[10px] font-bold uppercase text-slate-400">Date</p>
                        <p class="mt-1 text-sm font-bold text-slate-700">${escHtml(date)}</p>
                    </div>
                </div>
                <div class="rounded-xl border ${REVIEW_BADGE[r.ReviewStatus] || 'border-slate-200 bg-slate-50 text-slate-700'} px-3 py-2">
                    <p class="text-[10px] font-bold uppercase opacity-70">Document Review</p>
                    <p class="mt-1 text-sm font-bold">${escHtml(REVIEW_LABEL[r.ReviewStatus] || r.ReviewStatus || 'รอตรวจสอบ')}</p>
                    ${r.ReviewComment ? `<p class="text-xs mt-1">หมายเหตุ: ${escHtml(r.ReviewComment)}</p>` : ''}
                </div>
                ${r.ReviewOverrideReason ? `
                <div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <p class="text-[10px] font-bold uppercase">Admin Override</p>
                    <p class="mt-1 text-xs leading-relaxed">${escHtml(r.ReviewOverrideReason)}</p>
                    <p class="mt-1 text-[11px] text-amber-700">${escHtml(r.ReviewOverrideBy || '-')} · ${r.ReviewOverrideAt ? new Date(r.ReviewOverrideAt).toLocaleString('th-TH') : '-'}</p>
                </div>` : ''}

                ${_renderHiyariWorkflowStepper(r)}
                ${_renderHiyariOwnerCloseout(r)}

                <!-- Header block -->
                <div class="hidden">
                    <div class="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-sm text-orange-800">${escHtml(r.Location || 'Hiyari-Hatto')}</p>
                        <p class="text-xs text-slate-500 mt-0.5">รายงานโดย ${escHtml(r.ReporterName || '-')} · ${date}</p>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'}">
                            ${STATUS_LABEL[r.Status] || r.Status || '-'}
                        </span>
                        ${stDet
                            ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold" style="background:${stDet.bg};color:${stDet.color};border:1px solid ${stDet.border}">${stDet.code}</span>`
                            : ''}
                        ${rankR
                            ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${RANK_BADGE[rankR.rank]}">${rankR.label}</span>`
                            : (r.RiskLevel ? `<span class="px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_BADGE[r.RiskLevel] || 'bg-slate-100 text-slate-500'}">${RISK_LABEL[r.RiskLevel] || r.RiskLevel}</span>` : '')}
                    </div>
                </div>

                <!-- Info grid -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">แผนก</p><p class="text-sm text-slate-700">${escHtml(r.Department || '-')}</p></div>
                    <div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">ผลที่อาจเกิดขึ้น</p><p class="text-sm text-slate-700">${escHtml(r.PotentialConsequence || '-')}</p></div>
                    ${stDet ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Stop Type</p><p class="text-sm font-semibold" style="color:${stDet.color}">${stDet.code} — ${stDet.label}</p></div>` : ''}
                    ${rankR ? `<div><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Rank</p><p class="text-sm font-bold" style="color:${rankR.color}">${rankR.label} · ${rankR.desc} (${rankR.detail})</p></div>` : ''}
                    ${r.Description ? `<div class="col-span-2"><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">รายละเอียดเหตุการณ์</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.Description)}</p></div>` : ''}
                    ${r.Suggestion ? `<div class="col-span-2"><p class="text-[10px] font-bold text-blue-400 uppercase mb-1">ข้อเสนอแนะ</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.Suggestion)}</p></div>` : ''}
                    ${r.CorrectiveAction ? `<div class="col-span-2"><p class="text-[10px] font-bold text-emerald-500 uppercase mb-1">Corrective Action</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.CorrectiveAction)}</p></div>` : ''}
                    ${r.AdminComment ? `<div class="col-span-2"><p class="text-[10px] font-bold text-amber-500 uppercase mb-1">ความคิดเห็น Admin</p><p class="text-sm text-slate-700 leading-relaxed">${escHtml(r.AdminComment)}</p></div>` : ''}
                    ${r.IsSubmittedOnBehalf ? `<div class="col-span-2"><p class="text-[10px] font-bold text-slate-400 uppercase mb-1">ส่งแทนโดย</p><p class="text-sm text-slate-700">${escHtml(r.SubmittedByName || r.SubmittedByID || '-')}</p></div>` : ''}
                </div>

                <!-- Attachments (CCCF file-link style for non-images) -->
                ${(r.AttachmentUrl || r.AdditionalFileUrl || r.SignedFileUrl) ? `
                <div>
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">ไฟล์แนบ</p>
                    <div class="flex flex-col gap-2">
                        ${r.AttachmentUrl ? (isImg(r.AttachmentUrl)
                            ? buildFileThumb(r.AttachmentUrl, 'ไฟล์จากผู้รายงาน', true)
                            : `<a href="${escHtml(r.AttachmentUrl)}" target="_blank" rel="noopener noreferrer"
                                  class="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-colors">
                                <svg class="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                <span class="text-sm font-semibold text-orange-700">ไฟล์จากผู้รายงาน</span>
                               </a>`)
                        : ''}
                        ${r.AdditionalFileUrl ? (isImg(r.AdditionalFileUrl)
                            ? buildFileThumb(r.AdditionalFileUrl, 'ไฟล์เพิ่มเติม (Admin)', true)
                            : `<a href="${escHtml(r.AdditionalFileUrl)}" target="_blank" rel="noopener noreferrer"
                                  class="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-300 hover:bg-orange-50 transition-colors">
                                <svg class="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                <span class="text-sm font-semibold text-orange-700">ไฟล์เพิ่มเติม (Admin)</span>
                               </a>`)
                        : ''}
                        ${r.SignedFileUrl ? `<a href="${escHtml(r.SignedFileUrl)}" target="_blank" rel="noopener noreferrer"
                                  class="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 hover:border-emerald-300 transition-colors">
                                <span class="text-sm font-semibold text-emerald-700">ไฟล์รายงานที่ลงนามแล้ว</span>
                               </a>` : ''}
                    </div>
                </div>` : ''}

                ${canResubmitExcel ? `
                <form id="hiyari-excel-resubmit-form" data-id="${escHtml(r.id)}" class="border-t border-slate-100 pt-4 space-y-2">
                    <p class="text-xs font-bold text-rose-700">ส่ง Excel ใหม่ / Replacement Excel</p>
                    <div class="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                        ${r.ReviewComment ? `<p class="font-semibold">Reject reason: ${escHtml(r.ReviewComment)}</p>` : '<p class="font-semibold">This report was rejected and needs a corrected Excel file.</p>'}
                        <p class="mt-1 text-rose-700">After upload, the document review status will return to Pending Review.</p>
                    </div>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="file" name="file" required accept=".xls,.xlsx"
                               class="block flex-1 text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-rose-50 file:text-rose-700">
                        <button type="submit" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700">ส่ง Excel ใหม่</button>
                    </div>
                    <p class="text-[11px] text-slate-400">รองรับเฉพาะไฟล์ Excel .xls หรือ .xlsx ขนาดไม่เกิน 20 MB</p>
                </form>` : ''}

                ${revisions.length ? `
                <div class="border-t border-slate-100 pt-4">
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-3">Excel Revision History</p>
                    <div class="space-y-2">
                        ${revisions.slice(0, 8).map(item => `
                        <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-xs font-bold text-slate-700">Revision ${escHtml(item.RevisionNo || '-')}</p>
                                <p class="text-[11px] text-slate-400">${item.UploadedAt ? new Date(item.UploadedAt).toLocaleString('th-TH') : ''}</p>
                            </div>
                            <p class="mt-1 text-[11px] text-slate-500">Uploaded by ${escHtml(item.UploadedByName || item.UploadedByID || '-')}</p>
                            ${item.ReviewComment ? `<p class="mt-1 text-xs text-rose-700">Reject reason: ${escHtml(item.ReviewComment)}</p>` : ''}
                            <div class="mt-2 flex flex-wrap gap-2">
                                ${item.ReplacementAttachmentUrl ? `<a href="${escHtml(item.ReplacementAttachmentUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-orange-700 hover:underline">Latest Excel</a>` : ''}
                                ${item.PreviousAttachmentUrl ? `<a href="${escHtml(item.PreviousAttachmentUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold text-slate-500 hover:underline">Previous Excel</a>` : ''}
                            </div>
                        </div>`).join('')}
                    </div>
                </div>` : ''}

                ${_canUploadSignedHiyariPdf(r) ? `
                <form id="hiyari-signed-upload-form" data-id="${escHtml(r.id)}" class="border-t border-slate-100 pt-4 space-y-2">
                    <p class="text-xs font-bold text-slate-700">อัปโหลดไฟล์หลังลงนาม / Signed report</p>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="file" name="file" required accept=".pdf"
                               class="block flex-1 text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700">
                        <button type="submit" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700">อัปโหลด</button>
                    </div>
                    <p class="text-[11px] text-slate-400">รับเฉพาะ PDF หลังพิมพ์และลงนามแล้ว ระบบจะแจ้งแอดมินให้ตรวจสอบ</p>
                </form>` : ''}

                ${timeline.length ? `
                <div class="border-t border-slate-100 pt-4">
                    <p class="text-[10px] font-bold text-slate-400 uppercase mb-3">Review Timeline</p>
                    <div class="space-y-2">
                        ${timeline.slice(0, 8).map(item => `
                        <div class="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                            <div class="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0"></div>
                            <div class="min-w-0 flex-1">
                                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <p class="text-xs font-bold text-slate-700">${escHtml(item.Action || '-')}</p>
                                    <p class="text-[11px] text-slate-400">${item.ActionTime ? new Date(item.ActionTime).toLocaleString('th-TH') : ''}</p>
                                </div>
                                <p class="text-xs text-slate-500 mt-0.5">${escHtml(item.Detail || '-')}</p>
                                <p class="text-[11px] text-slate-400 mt-0.5">${escHtml(item.AdminName || item.AdminID || '-')}</p>
                            </div>
                        </div>`).join('')}
                    </div>
                </div>` : ''}

                ${r.Status === 'Closed' && r.ClosedAt ? `
                <p class="text-xs text-slate-400 text-right">ปิดโดย ${escHtml(r.ClosedBy || '-')} เมื่อ ${new Date(r.ClosedAt).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' })}</p>` : ''}

                <!-- Hiyari → Yokoten shortcut (Rank A/B or High/Critical RiskLevel) -->
                ${highRisk ? `
                <div class="border-t border-slate-100 pt-4">
                    <p class="text-xs text-slate-400 mb-2">เหตุการณ์ความเสี่ยงสูง — สามารถแปลงเป็นบทเรียน Yokoten ได้</p>
                    <button id="btn-to-yokoten"
                        data-id="${r.id}"
                        data-title="${escHtml(r.PotentialConsequence || r.Description || 'Hiyari #' + r.id)}"
                        data-desc="${escHtml(r.Description || '')}"
                        data-dept="${escHtml(r.Department || '')}"
                        data-risk="${escHtml(r.RiskLevel || '')}"
                        class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                        style="background:linear-gradient(135deg,#0ea5e9,#6366f1);box-shadow:0 2px 8px rgba(14,165,233,0.35)">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                        </svg>
                        แปลงเป็น Yokoten Topic
                    </button>
                </div>` : ''}
            </div>`;

        openDetailModal({
            title: escHtml(r.Location || 'Hiyari-Hatto'),
            subtitle: `${date} · ${r.Department || '-'} · ${r.ReporterName || '-'}`,
            meta: [
                { label: statusLabel, className: `${STATUS_BADGE[r.Status] || 'bg-slate-100 text-slate-500'} border-slate-200` },
                stDet ? { label: stDet.code, className: 'bg-orange-50 text-orange-700 border-orange-200' } : null,
                rankR ? { label: rankR.label, className: `${RANK_BADGE[rankR.rank] || 'bg-slate-100 text-slate-500'} border-slate-200` } : null,
                highRisk ? { label: 'High attention', className: 'bg-rose-50 text-rose-700 border-rose-200' } : null,
            ],
            body: html,
            size: 'max-w-2xl'
        });
        document.getElementById('hiyari-excel-resubmit-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const file = fd.get('file');
            const fileError = _validateExcelReviewFile(file);
            if (fileError) {
                showToast(fileError, 'error');
                return;
            }
            try {
                showLoading('กำลังส่ง Excel ใหม่...');
                await API.post(`/hiyari/${form.dataset.id}/replacement-excel`, fd);
                showToast('ส่ง Excel ใหม่สำเร็จ รอ Admin ตรวจสอบอีกครั้ง', 'success');
                closeModal();
                await fetchAndRenderTable().catch(() => {});
                await _loadHeroStats();
            } catch (err) {
                showError(err);
            } finally {
                hideLoading();
            }
        }));
        document.getElementById('hiyari-signed-upload-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const file = fd.get('file');
            const fileError = _validateSignedPdf(file);
            if (fileError) {
                showToast(fileError, 'error');
                return;
            }
            try {
                showLoading('กำลังอัปโหลดไฟล์ลงนาม...');
                await API.post(`/hiyari/${form.dataset.id}/signed-file`, fd);
                showToast('อัปโหลดไฟล์ลงนามสำเร็จ', 'success');
                closeModal();
                await fetchAndRenderTable().catch(() => {});
                await _loadHeroStats();
            } catch (err) {
                showError(err);
            } finally {
                hideLoading();
            }
        }));
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

function field(label, value) {
    return `<div>
        <p class="text-xs text-slate-400 font-medium mb-0.5">${escHtml(label)}</p>
        <p class="text-slate-700 font-semibold">${escHtml(value)}</p>
    </div>`;
}

function buildFileThumb(url, label, isImage) {
    if (isImage) {
        return `<button class="btn-preview-file group relative overflow-hidden rounded-xl border-2 border-slate-200 hover:border-orange-400 transition-all w-24 h-24"
                         data-url="${url}" data-title="${label}" title="${label}">
            <img src="${url}" alt="${label}" class="w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-end">
                <span class="w-full text-center text-white text-xs py-1 bg-black bg-opacity-40 opacity-0 group-hover:opacity-100 transition-all">${label}</span>
            </div>
        </button>`;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-sm text-slate-600">
        <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
        ${label}
    </a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MANAGE MODAL (Admin)
// ─────────────────────────────────────────────────────────────────────────────
async function showManageModal(id) {
    try {
        showLoading('กำลังโหลด...');
        const res = await API.get(`/hiyari/${id}`);
        const r   = normalizeApiObject(res?.data ?? res);
        hideLoading();
        const emailRecipients = Array.isArray(r.EmailRecipients)
            ? r.EmailRecipients.filter(Boolean)
            : [r.CompanyEmail, r.SubmittedByEmail].filter(Boolean).filter((email, index, list) => list.indexOf(email) === index);
        const emailRecipientLabel = emailRecipients.length ? emailRecipients.join(', ') : 'ยังไม่พบ CompanyEmail ที่ส่งได้';

        const html = `
            <div class="space-y-4 text-sm">

                <!-- Header block (CCCF-style brief info) -->
                <div class="bg-orange-50 border border-orange-100 rounded-xl p-3 flex gap-2.5 text-sm text-orange-800">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-orange-100">
                        <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold">${escHtml(r.ReporterName || '-')} · ${escHtml(r.Department || '-')}</p>
                        <p class="text-xs text-slate-500 mt-0.5">${r.ReportDate ? new Date(r.ReportDate).toLocaleDateString('th-TH') : ''}</p>
                        ${r.Description ? `<p class="text-xs text-slate-700 mt-1.5 line-clamp-2">${escHtml(r.Description)}</p>` : ''}
                        ${r.AttachmentUrl ? `<a href="${escHtml(r.AttachmentUrl)}" target="_blank" rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg bg-white border border-orange-200 text-xs font-bold text-orange-700 hover:bg-orange-100">
                            เปิดไฟล์ Excel ที่ส่งตรวจ
                        </a>` : '<p class="text-xs text-rose-600 mt-2">ไม่พบไฟล์ Excel ที่ส่งตรวจ</p>'}
                    </div>
                </div>

                <form id="manage-form" class="space-y-4 px-1">
                    <input type="hidden" name="id" value="${r.id}">

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="col-span-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                            <p class="text-xs font-black text-orange-800">ข้อมูลรายงาน (Admin edit)</p>
                            <p class="mt-1 text-[11px] text-slate-500">แก้ไขข้อมูลเนื้อหาได้ โดยผู้รายงาน ผู้ส่งแทน ไฟล์ต้นฉบับ และประวัติ Audit จะไม่ถูกเปลี่ยน</p>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">วันที่รายงาน *</label>
                            <input type="date" name="ReportDate" required max="${new Date().toISOString().slice(0, 10)}"
                                   value="${escHtml(String(r.ReportDate || '').slice(0, 10))}" class="form-input w-full rounded-xl text-sm">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">แผนก *</label>
                            <input type="text" name="Department" required maxlength="100" value="${escHtml(r.Department || '')}"
                                   class="form-input w-full rounded-xl text-sm">
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ประเภทอันตราย (Stop Type) *</label>
                            <select name="StopType" required class="form-select w-full rounded-xl text-sm">
                                ${STOP_TYPES.map(item => `<option value="${item.id}" ${Number(r.StopType) === item.id ? 'selected' : ''}>${escHtml(item.code)} - ${escHtml(item.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ระดับความรุนแรง (Rank) *</label>
                            <select name="RiskRank" required class="form-select w-full rounded-xl text-sm">
                                ${RANKS.map(item => `<option value="${item.rank}" ${r.Rank === item.rank || r.RiskRank === item.rank ? 'selected' : ''}>${escHtml(item.label)} - ${escHtml(item.desc)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">พื้นที่ / จุดเกิดเหตุ</label>
                            <input type="text" name="Location" maxlength="255" value="${escHtml(r.Location || '')}" class="form-input w-full rounded-xl text-sm">
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">รายละเอียดเหตุการณ์ *</label>
                            <textarea name="Description" required rows="3" maxlength="4000" class="form-input w-full rounded-xl text-sm resize-none">${escHtml(r.Description || '')}</textarea>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ผลที่อาจเกิดขึ้น</label>
                            <input type="text" name="PotentialConsequence" maxlength="255" list="hiyari-consequence-options"
                                   value="${escHtml(r.PotentialConsequence || '')}" class="form-input w-full rounded-xl text-sm">
                            <datalist id="hiyari-consequence-options">${CONSEQUENCES.map(value => `<option value="${escHtml(value)}"></option>`).join('')}</datalist>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ข้อเสนอแนะ</label>
                            <textarea name="Suggestion" rows="2" maxlength="4000" class="form-input w-full rounded-xl text-sm resize-none">${escHtml(r.Suggestion || '')}</textarea>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">สถานะ</label>
                            <select name="Status" class="form-select w-full rounded-xl text-sm">
                                ${STATUSES.map(s => `<option value="${s}" ${r.Status === s ? 'selected' : ''}>${STATUS_LABEL[s] || s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-span-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-3">
                            <div>
                                <label class="block text-[10px] font-bold text-blue-600 uppercase mb-1.5">ผลตรวจเอกสาร</label>
                                <select name="ReviewStatus" class="form-select w-full rounded-xl text-sm">
                                    ${Object.entries(REVIEW_LABEL).map(([value, label]) => `<option value="${value}" ${r.ReviewStatus === value ? 'selected' : ''}>${label}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-[10px] font-bold text-blue-600 uppercase mb-1.5">หมายเหตุผลตรวจ</label>
                                <textarea name="ReviewComment" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                                          placeholder="เช่น ผ่านการตรวจสอบแล้ว / ข้อมูลที่ต้องแก้ไข">${escHtml(r.ReviewComment || '')}</textarea>
                            </div>
                            <div class="rounded-lg border border-blue-200 bg-white/70 p-2.5 space-y-2">
                                <p class="text-[11px] text-blue-800"><b>ผู้รับอีเมล:</b> ${escHtml(emailRecipientLabel)}</p>
                                <p class="text-[11px] text-blue-700">ระบบส่งอัตโนมัติเมื่อผลตรวจเปลี่ยนเป็น “ผ่าน” หรือ “ไม่ผ่าน” เท่านั้น หากสถานะเดิมถูกบันทึกไปแล้ว ให้ใช้ปุ่มส่งซ้ำด้านล่าง</p>
                                ${r.IsSubmittedOnBehalf ? `<p class="text-[11px] text-blue-700">รายการนี้ส่งแทนโดย ${escHtml(r.SubmittedByName || r.SubmittedByID || '-')} ระบบจะแจ้งทั้งเจ้าของงานและผู้ส่งแทน โดยตัดอีเมลซ้ำออก</p>` : ''}
                                <button type="button" id="btn-hiyari-resend-status-email"
                                        class="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-blue-300 bg-white text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                                    ส่งอีเมลสถานะปัจจุบันซ้ำ
                                </button>
                            </div>
                        </div>
                        ${!['Approved', 'Completed'].includes(r.ReviewStatus) ? `
                        <div class="col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <p class="text-[10px] font-bold uppercase text-amber-700">Admin Override</p>
                                    <p class="text-sm font-black text-slate-800 mt-0.5">อนุญาตให้ส่ง PDF ที่ลงนามแล้ว</p>
                                    <p class="text-xs text-slate-600 mt-1 leading-relaxed">ใช้เฉพาะกรณีที่ต้องข้ามขั้นตอนตรวจ Excel ตาม flow ปกติ ระบบจะบันทึกผู้อนุญาต เหตุผล เวลา และส่งอีเมลแจ้งผู้รายงาน</p>
                                </div>
                                <span class="px-2 py-1 rounded-lg bg-white border border-amber-200 text-[10px] font-bold text-amber-700 whitespace-nowrap">Exception</span>
                            </div>
                            <textarea id="hiyari-override-reason" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                                      placeholder="ระบุเหตุผล เช่น เอกสารได้รับการตรวจนอกระบบแล้ว / มีข้อจำกัดด้านเอกสารเดิม"></textarea>
                            <button type="button" id="btn-hiyari-override"
                                    class="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
                                อนุญาตส่ง PDF ด้วย Admin Override
                            </button>
                        </div>` : (r.ReviewOverrideReason ? `
                        <div class="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                            <p class="text-[10px] font-bold uppercase text-emerald-700">Admin Override Recorded</p>
                            <p class="text-xs text-slate-700 mt-1">${escHtml(r.ReviewOverrideReason)}</p>
                            <p class="text-[11px] text-slate-500 mt-1">${escHtml(r.ReviewOverrideBy || '-')} · ${r.ReviewOverrideAt ? new Date(r.ReviewOverrideAt).toLocaleString('th-TH') : '-'}</p>
                        </div>` : '')}
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Corrective Action</label>
                            <textarea name="CorrectiveAction" rows="3" class="form-input w-full rounded-xl text-sm resize-none"
                                      placeholder="ระบุมาตรการแก้ไข...">${escHtml(r.CorrectiveAction || '')}</textarea>
                        </div>
                        <div class="col-span-2">
                            <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">ความคิดเห็น / หมายเหตุ</label>
                            <textarea name="AdminComment" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                                      placeholder="หมายเหตุเพิ่มเติม...">${escHtml(r.AdminComment || '')}</textarea>
                        </div>
                        <div id="hiyari-reopen-reason-wrap" class="col-span-2 ${r.Status === 'Closed' ? '' : 'hidden'}">
                            <label class="block text-[10px] font-bold text-amber-600 uppercase mb-1.5">Reopen Reason</label>
                            <textarea name="ReopenReason" rows="2" class="form-input w-full rounded-xl text-sm resize-none"
                                      placeholder="Required when changing a closed report back to Open or In Progress">${escHtml(r.ReopenReason || '')}</textarea>
                            <p class="text-[11px] text-amber-700 mt-1">Required only when reopening a closed Hiyari report.</p>
                        </div>
                        <div class="col-span-2">
                            ${r.AdditionalFileUrl ? `<a href="${escHtml(r.AdditionalFileUrl)}" target="_blank" rel="noopener noreferrer"
                                class="inline-flex items-center gap-2 text-xs font-semibold text-orange-700 hover:text-orange-800 mb-3">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                ดูไฟล์ปัจจุบัน
                            </a>` : ''}
                            <input type="file" id="manage-file" accept=".jpg,.jpeg,.png,.webp,.pdf"
                                   class="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all">
                            <p class="text-xs text-slate-400 mt-1">${r.AdditionalFileUrl ? 'หากไม่เลือกไฟล์ใหม่ ระบบจะเก็บไฟล์เดิมไว้' : 'รองรับ PDF, JPG, PNG, WEBP · ขนาดไม่เกิน 20 MB'}</p>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-2 border-t border-slate-100">
                        <button type="button" onclick="window.closeModal&&window.closeModal()"
                                class="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors">ยกเลิก</button>
                        <button type="submit" id="manage-save-btn"
                                class="px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm transition-all"
                                style="background:linear-gradient(135deg,#f97316,#ef4444)">บันทึก</button>
                    </div>
                </form>
            </div>`;

        openModal('จัดการรายงาน Hiyari', html, 'max-w-3xl');

        const reviewSelect = document.querySelector('#manage-form select[name="ReviewStatus"]');
        const reviewComment = document.querySelector('#manage-form textarea[name="ReviewComment"]');
        const statusSelect = document.querySelector('#manage-form select[name="Status"]');
        const reopenReasonWrap = document.getElementById('hiyari-reopen-reason-wrap');
        const syncReopenReason = () => {
            const show = r.Status === 'Closed' && statusSelect?.value !== 'Closed';
            reopenReasonWrap?.classList.toggle('hidden', !show);
        };
        statusSelect?.addEventListener('change', syncReopenReason);
        syncReopenReason();
        reviewSelect?.addEventListener('change', () => {
            const current = String(reviewComment?.value || '').trim();
            if (!reviewComment || current) return;
            if (reviewSelect.value === 'Approved') {
                reviewComment.value = 'ตรวจสอบไฟล์ Excel แล้ว ข้อมูลครบถ้วน อนุญาตให้ดำเนินการลงนามและส่ง PDF';
            } else if (reviewSelect.value === 'Rejected') {
                reviewComment.placeholder = 'ระบุรายการที่ต้องแก้ไข เพื่อให้ผู้รายงานนำกลับไปปรับเอกสาร';
            }
        });

        document.getElementById('btn-hiyari-resend-status-email')?.addEventListener('click', guardActionHandler(async () => {
            const button = document.getElementById('btn-hiyari-resend-status-email');
            const confirmed = await showConfirmationModal(
                'ยืนยันส่งอีเมลสถานะซ้ำ',
                `ระบบจะส่งอีเมลสถานะปัจจุบันไปยัง ${emailRecipientLabel} ต้องการดำเนินการต่อหรือไม่?`
            );
            if (!confirmed) return;
            try {
                button.disabled = true;
                button.textContent = 'กำลังส่งอีเมล...';
                showLoading('กำลังส่งอีเมลสถานะปัจจุบัน...');
                const result = await API.post(`/hiyari/${r.id}/resend-status-email`, {});
                const recipients = Array.isArray(result?.recipients) ? result.recipients.join(', ') : emailRecipientLabel;
                const emailStatus = String(result?.emailStatus || 'Unknown');
                if (emailStatus === 'Failed' || emailStatus === 'QueueFailed') {
                    showToast(`ส่งอีเมลไม่สำเร็จ: ${result?.emailError || emailStatus}`, 'error');
                } else {
                    showToast(`${emailStatus === 'Sent' ? 'ส่งอีเมลสำเร็จ' : 'คิวอีเมลแล้ว'}: ${recipients}`, 'success');
                }
            } catch (error) {
                showError(error);
            } finally {
                hideLoading();
                if (button) {
                    button.disabled = false;
                    button.textContent = 'ส่งอีเมลสถานะปัจจุบันซ้ำ';
                }
            }
        }));

        document.getElementById('btn-hiyari-override')?.addEventListener('click', guardActionHandler(async () => {
            const btn = document.getElementById('btn-hiyari-override');
            const reason = String(document.getElementById('hiyari-override-reason')?.value || '').trim();
            if (reason.length < 5) {
                showToast('กรุณาระบุเหตุผลการอนุญาตอย่างน้อย 5 ตัวอักษร', 'error');
                return;
            }
            const confirmed = await showConfirmationModal(
                'ยืนยัน Admin Override',
                'ต้องการอนุญาตให้รายงานนี้ส่ง PDF ที่ลงนามแล้ว โดยบันทึกเหตุผลและแจ้งอีเมลไปยังผู้รายงานใช่หรือไม่?'
            );
            if (!confirmed) return;

            try {
                btn.disabled = true;
                btn.textContent = 'กำลังอนุญาต...';
                showLoading('กำลังอนุญาตขั้นตอนเอกสาร...');
                await API.post(`/hiyari/${r.id}/approve-pdf-override`, { reason });
                closeModal();
                showToast('อนุญาตให้ส่ง PDF ที่ลงนามแล้วเรียบร้อยแล้ว', 'success');
                if (_activeTab === 'history') await fetchAndRenderTable();
                else if (_activeTab === 'manage') {
                    await fetchAndRenderManage(document.getElementById('manage-filter-review')?.value || 'PendingReview');
                    await _refreshManageReviewNotice({ toast: false });
                }
                await _loadHeroStats();
            } catch (err) {
                showError(err);
            } finally {
                hideLoading();
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'อนุญาตส่ง PDF ด้วย Admin Override';
                }
            }
        }));

        document.getElementById('manage-form')?.addEventListener('submit', guardSubmitHandler(async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('manage-save-btn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-1.5"></span> กำลังบันทึก...`;

            try {
                showLoading('กำลังบันทึก...');
                const fd = new FormData(e.target);
                const nextStatus = fd.get('Status');
                const corrective = String(fd.get('CorrectiveAction') || '').trim();
                const reopenReason = String(fd.get('ReopenReason') || '').trim();
                const description = String(fd.get('Description') || '').trim();
                const department = String(fd.get('Department') || '').trim();
                if (!description || !department || !fd.get('ReportDate') || !fd.get('RiskRank') || !fd.get('StopType')) {
                    showToast('กรุณากรอกข้อมูลรายงานที่มีเครื่องหมาย * ให้ครบ', 'error');
                    return;
                }
                if (nextStatus === 'Closed' && !corrective) {
                    showToast('กรุณาระบุ Corrective Action ก่อนปิดรายงาน', 'error');
                    return;
                }

                if (r.Status === 'Closed' && nextStatus !== 'Closed' && !reopenReason) {
                    showToast('Reopen reason is required before reopening this Hiyari report.', 'error');
                    return;
                }

                const fileEl = document.getElementById('manage-file');
                const adminFile = fileEl?.files?.[0] || null;
                const fileError = _validateHiyariSupportingFile(adminFile);
                if (fileError) {
                    showToast(fileError, 'error');
                    return;
                }

                // Update status / corrective action / comment (logic unchanged)
                await API.put(`/hiyari/${r.id}`, {
                    ReportDate:       fd.get('ReportDate'),
                    Department:       department,
                    Location:         String(fd.get('Location') || '').trim(),
                    Description:      description,
                    PotentialConsequence: String(fd.get('PotentialConsequence') || '').trim(),
                    Suggestion:       String(fd.get('Suggestion') || '').trim(),
                    RiskRank:         fd.get('RiskRank'),
                    StopType:         Number(fd.get('StopType')),
                    Status:           nextStatus,
                    CorrectiveAction: corrective,
                    AdminComment:     fd.get('AdminComment'),
                    ReviewStatus:     fd.get('ReviewStatus'),
                    ReviewComment:    fd.get('ReviewComment'),
                    ReopenReason:     reopenReason,
                });

                // Upload additional file if selected (logic unchanged)
                if (fileEl?.files?.length) {
                    const fileFd = new FormData();
                    fileFd.append('file', fileEl.files[0]);
                    await API.post(`/hiyari/${r.id}/attachment`, fileFd);
                }

                closeModal();
                showToast('อัปเดตรายงานสำเร็จ', 'success');
                if (_activeTab === 'history') await fetchAndRenderTable();
                else if (_activeTab === 'manage') {
                    await fetchAndRenderManage(document.getElementById('manage-filter-review')?.value || 'PendingReview');
                    await _refreshManageReviewNotice({ toast: false });
                }
                await _loadHeroStats();
            } catch (err) {
                showError(err);
            } finally {
                hideLoading();
                saveBtn.disabled = false;
                saveBtn.textContent = 'บันทึก';
            }
        }));
    } catch (err) {
        hideLoading();
        showError(err);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
    document.addEventListener('click', guardActionHandler(async (e) => {
        if (e.target.closest('[data-hiyari-card-save-action]')) {
            const card = _hiyariCardSaveMenu?.card;
            _hiyariHideCardImageMenu();
            if (card) _hiyariDownloadCardImage(card);
            return;
        }
        if (!e.target.closest('#hiyari-card-save-menu')) _hiyariHideCardImageMenu();
        if (!e.target.closest('#hiyari-page')) return;

        // Tab switch
        const tabBtn = e.target.closest('.hiyari-tab');
        if (tabBtn) { await switchTab(tabBtn.dataset.tab); return; }

        // View detail
        const viewBtn = e.target.closest('.btn-view-report');
        if (viewBtn) { await showDetailModal(viewBtn.dataset.id); return; }

        // Manage (Admin)
        const manageBtn = e.target.closest('.btn-manage-report');
        if (manageBtn) { await showManageModal(manageBtn.dataset.id); return; }

        // Delete (Admin)
        const deleteBtn = e.target.closest('.btn-delete-report');
        if (deleteBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบรายงานของ "${deleteBtn.dataset.name}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/hiyari/${deleteBtn.dataset.id}`);
                    showToast('ลบรายงานสำเร็จ', 'success');
                    if (_activeTab === 'history') await fetchAndRenderTable();
                    else if (_activeTab === 'manage') {
                        await fetchAndRenderManage(document.getElementById('manage-filter-review')?.value || 'PendingReview');
                        await _refreshManageReviewNotice({ toast: false });
                    }
                    await _loadHeroStats();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // File preview
        const previewBtn = e.target.closest('.btn-preview-file');
        if (previewBtn) {
            showDocumentModal(previewBtn.dataset.url, previewBtn.dataset.title);
            return;
        }

        // Export PDF (dashboard)
        if (e.target.closest('#hiyari-pdf-btn')) { exportHiyariPDF(); return; }

        // Export current dashboard year
        if (e.target.closest('#hiyari-year-export-btn')) { exportHiyariYearExcel(); return; }

        // Dept config (dashboard admin)
        if (e.target.closest('#hiyari-dept-config-btn')) { openDashConfigModal(); return; }

        // Export Excel
        if (e.target.closest('#hiyari-export-btn')) { exportHiyariExcel(); return; }

        // Clear history filters
        if (e.target.closest('#hiyari-clear-filters-btn')) {
            _resetHistoryFilters();
            await fetchAndRenderTable();
            const content = document.getElementById('hiyari-tab-content');
            if (content) await renderHistory(content);
            return;
        }

        // Add assignment
        if (e.target.closest('#btn-add-assignment')) { openAssignmentModal(null); return; }

        // Edit assignment
        const editAssignBtn = e.target.closest('.btn-edit-assignment');
        if (editAssignBtn) {
            const a = _assignments.find(x => String(x.id) === String(editAssignBtn.dataset.id));
            if (a) openAssignmentModal(a);
            return;
        }

        // Delete assignment
        const delAssignBtn = e.target.closest('.btn-delete-assignment');
        if (delAssignBtn) {
            const confirmed = await showConfirmationModal('ยืนยันการลบ', `ต้องการลบรายการมอบหมายของ "${delAssignBtn.dataset.name}" ใช่หรือไม่?`);
            if (confirmed) {
                showLoading('กำลังลบ...');
                try {
                    await API.delete(`/hiyari/assignments/${delAssignBtn.dataset.id}`);
                    showToast('ลบรายการสำเร็จ', 'success');
                    await loadAndRenderAssignments();
                    await _loadHeroStats();
                } catch (err) { showError(err); }
                finally { hideLoading(); }
            }
            return;
        }

        // Convert Hiyari → Yokoten topic
        const yokoBtn = e.target.closest('#btn-to-yokoten');
        if (yokoBtn) {
            try {
                sessionStorage.setItem('hiyari_to_yokoten', JSON.stringify({
                    sourceId:   yokoBtn.dataset.id,
                    title:      yokoBtn.dataset.title,
                    description: yokoBtn.dataset.desc,
                    department: yokoBtn.dataset.dept,
                    riskLevel:  yokoBtn.dataset.risk,
                }));
            } catch (_) {}
            window.closeModal?.();
            window.location.hash = 'yokoten';
            return;
        }
    }, delegatedActionOptions('hiyari')));

    // Filter changes
    document.addEventListener('change', async (e) => {
        if (!e.target.closest('#hiyari-page')) return;

        if (e.target.id === 'filter-status') { _filterStatus = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-risk')   { _filterRisk   = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-rank-code') { _filterRank = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-stop-type') { _filterStopType = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-dept')   { _filterDept   = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-area')   { _filterArea   = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'filter-month')  { _filterMonth  = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'history-year')  { _historyYear  = e.target.value; await fetchAndRenderTable(); return; }
        if (e.target.id === 'stats-year') {
            _statsYear = parseInt(e.target.value);
            const content = document.getElementById('hiyari-tab-content');
            if (content) await renderDashboard(content);
            return;
        }
        if (['stats-month','stats-department','stats-status','stats-rank'].includes(e.target.id)) {
            if (e.target.id === 'stats-month') _statsMonth = e.target.value;
            if (e.target.id === 'stats-department') _statsDept = e.target.value;
            if (e.target.id === 'stats-status') _statsStatus = e.target.value;
            if (e.target.id === 'stats-rank') _statsRank = e.target.value;
            const content = document.getElementById('hiyari-tab-content');
            if (content) await renderDashboard(content);
            return;
        }
    });

    // Search debounce
    document.addEventListener('input', debounce(async (e) => {
        if (!e.target.closest('#hiyari-page')) return;
        if (e.target.id === 'history-search') {
            _searchQ = e.target.value;
            await fetchAndRenderTable();
        }
    }, 350));

    document.addEventListener('contextmenu', _hiyariShowCardContextMenu);
    document.addEventListener('pointerdown', _hiyariStartCardImageHold);
    document.addEventListener('pointermove', _hiyariMoveCardImageHold);
    document.addEventListener('pointerup', _hiyariCancelCardImageHold);
    document.addEventListener('pointercancel', _hiyariCancelCardImageHold);
}

function _hiyariShowCardContextMenu(event) {
    const card = event.target?.closest?.('[data-hiyari-card-image]');
    if (!card || !document.getElementById('hiyari-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    event.preventDefault();
    _hiyariShowCardImageMenu(card, event.clientX, event.clientY);
}

function _hiyariStartCardImageHold(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const card = event.target?.closest?.('[data-hiyari-card-image]');
    if (!card || !document.getElementById('hiyari-page')?.contains(card)) return;
    if (event.target.closest('button,a,input,select,textarea,label,[contenteditable="true"]')) return;
    _hiyariCancelCardImageHold();
    _hiyariCardSaveHold = {
        card,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
            if (!_hiyariCardSaveHold || _hiyariCardSaveHold.card !== card) return;
            _hiyariShowCardImageMenu(card, _hiyariCardSaveHold.x, _hiyariCardSaveHold.y);
        }, 800),
    };
}

function _hiyariMoveCardImageHold(event) {
    if (!_hiyariCardSaveHold || event.pointerId !== _hiyariCardSaveHold.pointerId) return;
    if (Math.abs(event.clientX - _hiyariCardSaveHold.x) > 10 || Math.abs(event.clientY - _hiyariCardSaveHold.y) > 10) {
        _hiyariCancelCardImageHold();
    }
}

function _hiyariCancelCardImageHold() {
    if (_hiyariCardSaveHold?.timer) clearTimeout(_hiyariCardSaveHold.timer);
    _hiyariCardSaveHold = null;
}

function _hiyariShowCardImageMenu(card, clientX, clientY) {
    _hiyariHideCardImageMenu();
    const menu = document.createElement('div');
    menu.id = 'hiyari-card-save-menu';
    menu.className = 'fixed z-[9999] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl';
    menu.style.minWidth = '170px';
    menu.innerHTML = `
        <button type="button" data-hiyari-card-save-action
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-orange-50 hover:text-orange-700">
            <svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m4 7H5a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2z"/>
            </svg>
            บันทึกเป็นรูปภาพ
        </button>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(8, clientX), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, clientY), window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    _hiyariCardSaveMenu = { card, menu };
}

function _hiyariHideCardImageMenu() {
    _hiyariCardSaveMenu?.menu?.remove?.();
    _hiyariCardSaveMenu = null;
}

async function _hiyariDownloadCardImage(card) {
    if (typeof html2canvas === 'undefined') {
        showToast('ไม่พบ library สำหรับบันทึกรูปภาพ', 'error');
        return;
    }
    const name = _hiyariSafeFilePart(card.dataset.hiyariCardImage || 'hiyari-card');
    try {
        showLoading('Saving card image...');
        const canvas = await html2canvas(card, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1.5),
            useCORS: true,
            onclone: doc => {
                doc.querySelectorAll('[data-hiyari-card-ignore]').forEach(el => { el.style.display = 'none'; });
            },
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}-${_statsYear}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('บันทึกรูปภาพการ์ดแล้ว', 'success');
    } catch (err) {
        showToast(err?.message || 'บันทึกรูปภาพการ์ดไม่สำเร็จ', 'error');
    } finally {
        hideLoading();
    }
}

function _hiyariSafeFilePart(value) {
    return String(value || 'hiyari-card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'hiyari-card';
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────────────
async function exportHiyariExcel(filename = '') {
    if (!window.XLSX) { showToast('ไม่พบ SheetJS library — กรุณารีเฟรชหน้า', 'error'); return; }
    if (!_reports.length) { showToast('ไม่มีข้อมูลสำหรับ Export', 'warning'); return; }

    const [assignRes,outboxRes,fileRes,statsRes]=await Promise.all([
        API.get('/hiyari/assignments').catch(()=>({data:[]})),
        _isAdmin?API.get('/hiyari/email-outbox?limit=200').catch(()=>({data:[]})):Promise.resolve({data:[]}),
        _isAdmin?API.get('/hiyari/file-health').catch(()=>({data:{files:[]}})):Promise.resolve({data:{files:[]}}),
        API.get(`/hiyari/stats?year=${_statsYear}`).catch(()=>({data:{}})),
    ]);
    const assignments=normalizeApiArray(assignRes?.data??assignRes),outbox=normalizeApiArray(outboxRes?.data??outboxRes),fileRows=normalizeApiArray(fileRes?.data?.files??[]),stats=statsRes?.data||{};
    const fileByReport=new Map();fileRows.forEach(f=>{if(!fileByReport.has(String(f.reportId)))fileByReport.set(String(f.reportId),[]);fileByReport.get(String(f.reportId)).push(f);});
    const reports=_reports.map(r=>{const sla=_getSLA(r),files=fileByReport.get(String(r.id))||[];return {
        ReportDate:r.ReportDate||'',Reporter:r.ReporterName||'',ReporterID:r.ReporterID||'',SubmittedBy:r.SubmittedByName||'',SubmittedByID:r.SubmittedByID||'',Department:r.Department||'',Area:r.Location||'',Rank:r.Rank||'',StopType:r.StopType||'',Status:r.Status||'',ReviewStatus:r.ReviewStatus||'',SignedStatus:r.SignedFileUrl?'Signed PDF available':'Pending signed PDF',SLAStatus:sla?(sla.overdue?'Overdue':sla.warning?'Near due':'On track'):'N/A',SLADays:sla?.limit??'',RemainingDays:sla?.remaining??'',FileHealth:files.some(f=>f.status==='missing')?'Missing file':files.length?'OK':'No reference',CorrectiveAction:r.CorrectiveAction||'',ClosedBy:r.ClosedBy||'',ClosedAt:r.ClosedAt||''};});
    const slaRows=reports.map(r=>({ReportDate:r.ReportDate,Reporter:r.Reporter,Department:r.Department,Rank:r.Rank,Status:r.Status,SLAStatus:r.SLAStatus,SLADays:r.SLADays,RemainingDays:r.RemainingDays}));
    const reviewRows=reports.map(r=>({ReportDate:r.ReportDate,Reporter:r.Reporter,SubmittedBy:r.SubmittedBy,Department:r.Department,ReviewStatus:r.ReviewStatus,SignedStatus:r.SignedStatus,FileHealth:r.FileHealth}));
    const assignmentRows=assignments.map(a=>({EmployeeID:a.EmployeeID||'',Employee:a.AssigneeName||'',Department:a.Department||'',CompanyEmail:a.CompanyEmail||'',DirectSignedPdf:Number(a.AllowDirectSignedPdf)===1?'Yes':'No',DueDate:a.DueDate||'',Note:a.Note||''}));
    const emailRows=outbox.map(e=>({CreatedAt:e.CreatedAt||'',ReportID:e.ReportID||'',EventType:e.EventType||'',Recipients:e.Recipients||'',Status:e.Status||'',RetryCount:Number(e.RetryCount)||0,LastFailureAt:e.LastFailureAt||'',Error:e.Error||''}));
    const k=stats.kpi||{},topArea=(stats.areaRank||[])[0]||{},topDept=(stats.departmentRiskRanking||stats.deptRank||[])[0]||{};
    const management=[{'Metric / ตัวชี้วัด':'Report filters','Value / ค่า':JSON.stringify({year:_statsYear,month:_statsMonth,department:_statsDept,status:_statsStatus,rank:_statsRank})},{'Metric / ตัวชี้วัด':'Total reports','Value / ค่า':reports.length},{'Metric / ตัวชี้วัด':'Rank A','Value / ค่า':reports.filter(r=>r.Rank==='A').length},{'Metric / ตัวชี้วัด':'Rank B','Value / ค่า':reports.filter(r=>r.Rank==='B').length},{'Metric / ตัวชี้วัด':'Overdue','Value / ค่า':reports.filter(r=>r.SLAStatus==='Overdue').length},{'Metric / ตัวชี้วัด':'Closed rate','Value / ค่า':reports.length?`${Math.round(reports.filter(r=>r.Status==='Closed').length*100/reports.length)}%`:'0%'},{'Metric / ตัวชี้วัด':'Top area','Value / ค่า':topArea.Location||'-'},{'Metric / ตัวชี้วัด':'Top department','Value / ค่า':topDept.Department||'-'},{'Metric / ตัวชี้วัด':'Pending review','Value / ค่า':k.pendingReview||0},{'Metric / ตัวชี้วัด':'Pending signed PDF','Value / ค่า':k.pendingSignedPdf||0}];
    const wb=XLSX.utils.book_new();
    const append=(name,rows)=>{const safe=rows.length?rows:[{Info:'No data'}],ws=XLSX.utils.json_to_sheet(safe);ws['!cols']=Object.keys(safe[0]).map(key=>({wch:Math.min(48,Math.max(14,key.length+4))}));XLSX.utils.book_append_sheet(wb,ws,name);};
    append('Reports',reports);append('SLA',slaRows);append('Assignments',assignmentRows);append('Review Status',reviewRows);append('Email Status',emailRows);append('Management Summary',management);

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, filename || `Hiyari_${today}.xlsx`);
    showToast('Export multi-sheet สำเร็จ', 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
async function exportHiyariYearExcel() {
    const oldReports = _reports;
    try {
        showLoading('กำลัง Export ข้อมูลรายปี...');
        const params = new URLSearchParams();
        params.set('year', String(_statsYear));
        const res = await API.get(`/hiyari?${params}`);
        _reports = normalizeApiArray(res?.data ?? res);
        await exportHiyariExcel(`Hiyari_${_statsYear}.xlsx`);
    } catch (err) {
        showError(err);
    } finally {
        _reports = oldReports;
        hideLoading();
    }
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
