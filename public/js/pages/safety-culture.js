// public/js/pages/safety-culture.js

import * as UI from '../ui.js';
import { apiFetch } from '../api.js';

// ── State ─────────────────────────────────────────────────────────────
let _isAdmin      = false;
let _activeTab    = 'principles';
let _principles   = [];
let _assessments  = [];
let _ppeInspections = [];
let _dashData     = null;
let _filterYear   = new Date().getFullYear();
let _radarChart   = null;
let _barChart     = null;
let _lineChart    = null;

// ── Constants ─────────────────────────────────────────────────────────
const TOPIC_LABELS = [
    'เดินบน Walk Way',
    'ไม่ใช้โทรศัพท์ขณะเดิน',
    'ข้ามถนนทางม้าลาย',
    'หยุดชี้นิ้วก่อนข้าม',
    'ไม่ล้วงกระเป๋า',
    'PPE Control',
    'แยกขยะถูกต้อง',
];

// SVG placeholders for principle cards (w-14 h-14)
const TOPIC_SVG = [
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8.25V18a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V8.25m-18 0V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v2.25m-18 0h18M5.25 6h.008v.008H5.25V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0h.008v.008H9.75V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0h.008v.008H14.25V6zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18h3M3 3l18 18"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.07 5.695a1.575 1.575 0 01-1.548 1.625 8.269 8.269 0 01-3.371-.999 21.571 21.571 0 01-1.364-.988 1.575 1.575 0 112.004-2.43c.09.063.183.133.274.195v-2.502zm0 0H9m7.5 3a3 3 0 00-3-3h-1.5a3 3 0 00-3 3v3.75a3 3 0 003 3h1.5a3 3 0 003-3V7.575z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>`,
    `<svg class="w-14 h-14 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>`,
];

const PPE_ITEMS = [
    { key: 'Helmet',     label: 'Safety Helmet',  icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>` },
    { key: 'Glasses',    label: 'Safety Glasses', icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>` },
    { key: 'Gloves',     label: 'Gloves',         icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.07 5.695a1.575 1.575 0 01-1.548 1.625 8.269 8.269 0 01-3.371-.999 21.571 21.571 0 01-1.364-.988 1.575 1.575 0 112.004-2.43c.09.063.183.133.274.195v-2.502zm0 0H9m7.5 3a3 3 0 00-3-3h-1.5a3 3 0 00-3 3v3.75a3 3 0 003 3h1.5a3 3 0 003-3V7.575z"/></svg>` },
    { key: 'Shoes',      label: 'Safety Shoes',   icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"/></svg>` },
    { key: 'FaceShield', label: 'Face Shield',    icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/></svg>` },
    { key: 'EarPlug',    label: 'Ear Plug',       icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>` },
];

function getMaturity(avg) {
    const v = parseFloat(avg);
    if (v <= 2.0) return { label: 'Reactive',    color: 'text-red-600',     bg: 'bg-red-100',      border: 'border-red-300',     dot: 'bg-red-400' };
    if (v <= 3.0) return { label: 'Basic',        color: 'text-amber-600',   bg: 'bg-amber-100',    border: 'border-amber-300',   dot: 'bg-amber-400' };
    if (v <= 4.0) return { label: 'Proactive',    color: 'text-blue-600',    bg: 'bg-blue-100',     border: 'border-blue-300',    dot: 'bg-blue-400' };
    return               { label: 'Generative',   color: 'text-emerald-600', bg: 'bg-emerald-100',  border: 'border-emerald-300', dot: 'bg-emerald-400 animate-pulse' };
}

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

function scoreColor(v) {
    if (v == null) return 'text-slate-300';
    const n = parseFloat(v);
    if (n >= 4) return 'text-emerald-600 font-semibold';
    if (n >= 3) return 'text-blue-600 font-semibold';
    if (n >= 2) return 'text-amber-600 font-semibold';
    return 'text-red-600 font-semibold';
}

// ── Entry Point ───────────────────────────────────────────────────────
export async function loadSafetyCulturePage() {
    const container = document.getElementById('safety-culture-page');
    if (!container) return;

    const user = window.TSHSession?.getUser() || {};
    _isAdmin = user.role === 'Admin' || user.Role === 'Admin';
    _filterYear = new Date().getFullYear();
    _activeTab  = 'principles';

    container.innerHTML = buildShellHtml();
    attachGlobalHandlers();
    await refreshAll();
}

// ── Shell ─────────────────────────────────────────────────────────────
function buildShellHtml() {
    const years = [...Array(5)].map((_, i) => new Date().getFullYear() - i);
    return `
    <div class="max-w-6xl mx-auto space-y-6 animate-fade-in pb-10">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
                <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
                    <span class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style="background:linear-gradient(135deg,#059669,#0d9488);box-shadow:0 2px 10px rgba(5,150,105,0.3)">
                        <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
                        </svg>
                    </span>
                    Safety &amp; Environment Culture
                </h1>
                <p class="text-sm text-slate-500 mt-1 ml-11">วัฒนธรรมความปลอดภัยและสิ่งแวดล้อม</p>
            </div>
            <div class="flex items-center gap-2">
                <select id="sc-year-filter" onchange="window._scSetYear(this.value)" class="form-select text-sm">
                    ${years.map(y => `<option value="${y}" ${y===_filterYear?'selected':''}>${y}</option>`).join('')}
                </select>
                <button onclick="window._scExportPDF()" class="btn btn-secondary text-sm px-4 flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    Export PDF
                </button>
            </div>
        </div>
        <div id="sc-tabs" class="flex gap-1 flex-wrap bg-slate-100 p-1.5 rounded-xl">
            ${[
                { id:'principles', label:'วัฒนธรรมความปลอดภัย' },
                { id:'dashboard',  label:'Dashboard'            },
                { id:'assessment', label:'ผลการประเมิน'          },
                { id:'ppe',        label:'PPE Control'           },
            ].map(t => `
                <button id="sct-${t.id}" onclick="window._scSetTab('${t.id}')"
                    class="sc-tab px-4 py-2.5 text-sm font-semibold rounded-lg transition-all whitespace-nowrap ${_activeTab===t.id?'bg-white text-emerald-700 shadow-sm':'text-slate-500 hover:text-slate-700'}">
                    ${t.label}
                </button>`).join('')}
        </div>
        <div id="sc-content"></div>
    </div>`;
}

// ── Global Handlers ───────────────────────────────────────────────────
function attachGlobalHandlers() {
    window._scSetTab = (tab) => {
        _activeTab = tab;
        document.querySelectorAll('.sc-tab').forEach(btn => {
            const active = btn.id === `sct-${tab}`;
            btn.className = `sc-tab px-4 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`;
        });
        renderCurrentTab();
    };

    window._scSetYear = async (y) => {
        _filterYear = parseInt(y);
        await refreshAll();
    };

    window._scEditPrinciple     = (id) => openPrincipleForm(id);
    window._scAddAssessment     = () => openAssessmentForm(null);
    window._scEditAssessment    = (id) => openAssessmentForm(id);
    window._scDeleteAssessment  = (id) => deleteAssessment(id);
    window._scAddPPE            = () => openPPEForm();
    window._scViewPPE           = (id) => viewPPERecord(id);
    window._scDeletePPE         = (id) => deletePPE(id);
    window._scExportPDF         = () => exportPDF();
    window._UI_closeModal       = () => UI.closeModal();
}

// ── Data ──────────────────────────────────────────────────────────────
async function refreshAll() {
    UI.showLoading('กำลังโหลดข้อมูล...');
    try {
        const [pRes, aRes, ppeRes, dRes] = await Promise.all([
            apiFetch('/safety-culture/principles'),
            apiFetch(`/safety-culture/assessments?year=${_filterYear}`),
            apiFetch(`/safety-culture/ppe-inspections?year=${_filterYear}`),
            apiFetch(`/safety-culture/dashboard?year=${_filterYear}`),
        ]);
        _principles    = pRes.data  || [];
        _assessments   = aRes.data  || [];
        _ppeInspections = ppeRes.data || [];
        _dashData      = dRes.data  || null;
    } catch (err) {
        UI.showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        UI.hideLoading();
    }
    renderCurrentTab();
}

function destroyCharts() {
    [_radarChart, _barChart, _lineChart].forEach(c => { if (c) c.destroy(); });
    _radarChart = _barChart = _lineChart = null;
}

function renderCurrentTab() {
    const content = document.getElementById('sc-content');
    if (!content) return;
    destroyCharts();
    switch (_activeTab) {
        case 'principles': content.innerHTML = buildPrinciplesHtml(); break;
        case 'assessment': content.innerHTML = buildAssessmentHtml(); break;
        case 'ppe':        content.innerHTML = buildPPEHtml();        break;
        case 'dashboard':
            content.innerHTML = buildDashboardHtml();
            setTimeout(initCharts, 150);
            break;
    }
}

// ── Tab: Principles ───────────────────────────────────────────────────
function buildPrinciplesHtml() {
    const cards = _principles.map(p => {
        const idx   = p.SortOrder - 1;
        const icon  = TOPIC_SVG[idx] || TOPIC_SVG[5];
        const isPPE = p.SortOrder === 6;
        return `
        <div class="card overflow-hidden hover:shadow-md transition-shadow flex flex-col">
            ${p.ImageUrl
                ? `<img src="${esc(p.ImageUrl)}" alt="${esc(p.Title)}" class="w-full h-44 object-cover">`
                : `<div class="w-full h-44 flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5)">${icon}</div>`
            }
            <div class="p-4 flex flex-col flex-1">
                <div class="flex items-start gap-2 mb-2">
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white flex-shrink-0 mt-0.5" style="background:linear-gradient(135deg,#059669,#0d9488)">${p.SortOrder}</span>
                    <h3 class="font-semibold text-slate-800 text-sm leading-snug flex-1">${esc(p.Title)}</h3>
                    ${_isAdmin ? `<button onclick="window._scEditPrinciple('${esc(p.PrincipleID)}')" class="flex-shrink-0 p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors" title="แก้ไข"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>` : ''}
                </div>
                <p class="text-xs text-slate-500 leading-relaxed flex-1">${esc(p.Description)}</p>
                <div class="mt-3 flex flex-col gap-1.5">
                    ${p.AttachmentUrl ? `<a href="${esc(p.AttachmentUrl)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline font-medium"><svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>${esc(p.AttachmentName||'ดาวน์โหลดเอกสาร')}</a>` : ''}
                    ${isPPE ? `<button onclick="window._scSetTab('ppe')" class="text-left inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"><svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>ดู PPE Inspection Checklist →</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div>
        <p class="text-sm text-slate-500 mb-4">วัฒนธรรมความปลอดภัย ${_principles.length} หัวข้อ</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            ${cards || '<p class="col-span-full text-center py-12 text-slate-400">ไม่พบข้อมูล</p>'}
        </div>
    </div>`;
}

// ── Tab: Assessment ───────────────────────────────────────────────────
function buildAssessmentHtml() {
    const rows = _assessments.map(a => {
        const vals = [a.T1_Score, a.T2_Score, a.T3_Score, a.T4_Score, a.T5_Score, a.T7_Score].filter(v => v != null);
        const avg  = vals.length ? (vals.reduce((s,v)=>s+parseFloat(v),0)/vals.length).toFixed(2) : null;
        const mat  = avg ? getMaturity(avg) : null;
        const scoreCell = (v) => `<td class="px-3 py-3 text-center text-sm ${scoreColor(v)}">${v!=null?parseFloat(v).toFixed(1):'-'}</td>`;
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 text-sm font-medium text-slate-800">${a.AssessmentYear}</td>
            <td class="px-4 py-3 text-sm text-slate-600">${esc(a.Area)}</td>
            ${scoreCell(a.T1_Score)}${scoreCell(a.T2_Score)}${scoreCell(a.T3_Score)}${scoreCell(a.T4_Score)}${scoreCell(a.T5_Score)}
            <td class="px-3 py-3 text-center text-xs text-slate-400 italic">PPE*</td>
            ${scoreCell(a.T7_Score)}
            <td class="px-4 py-3 text-center">${avg ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${mat.bg} ${mat.color}">${avg}</span>` : '-'}</td>
            <td class="px-4 py-3 text-center text-xs">${mat ? `<span class="inline-flex items-center gap-1.5 font-semibold ${mat.color}"><span class="w-1.5 h-1.5 rounded-full inline-block ${mat.dot}"></span>${mat.label}</span>` : '-'}</td>
            ${_isAdmin ? `<td class="px-4 py-3 whitespace-nowrap">
                <button onclick="window._scEditAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-100 transition-colors" title="แก้ไข"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                <button onclick="window._scDeleteAssessment('${a.AssessmentID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
            </td>` : ''}
        </tr>`;
    }).join('');

    const colCount = _isAdmin ? 12 : 11;
    return `
    <div class="space-y-4">
        ${_isAdmin ? `<div class="flex justify-end"><button onclick="window._scAddAssessment()" class="btn btn-primary px-5 flex items-center gap-2"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>บันทึกผลการประเมิน</button></div>` : ''}
        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">ประวัติการประเมิน ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${_assessments.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ปี</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พื้นที่</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="เดินบน Walk Way">T1</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ไม่ใช้โทรศัพท์">T2</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ข้ามถนนทางม้าลาย">T3</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="หยุดชี้นิ้ว">T4</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="ไม่ล้วงกระเป๋า">T5</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="PPE Control">T6</th>
                            <th class="px-3 py-3 text-center text-xs font-semibold text-slate-500 uppercase" title="แยกขยะ">T7</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">เฉลี่ย</th>
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">ระดับ</th>
                            ${_isAdmin ? '<th class="px-4 py-3"></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="${colCount}" class="text-center py-12 text-slate-400">ยังไม่มีผลการประเมินสำหรับปี ${_filterYear}</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
        <p class="text-xs text-slate-400">* T6 (PPE Control) คำนวณจาก PPE Inspection Checklist แยกต่างหาก</p>
        <div class="card p-4">
            <h4 class="text-sm font-semibold text-slate-700 mb-3">Culture Maturity Level — คำอธิบายระดับ</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                ${[
                    { range:'1.0–2.0', level:'Reactive',   cls:'border-red-200 bg-red-50',       txt:'text-red-600',     desc:'ตั้งรับ ยังไม่มีระบบ' },
                    { range:'2.1–3.0', level:'Basic',      cls:'border-amber-200 bg-amber-50',   txt:'text-amber-600',   desc:'มีกฎแต่ยังไม่สม่ำเสมอ' },
                    { range:'3.1–4.0', level:'Proactive',  cls:'border-blue-200 bg-blue-50',     txt:'text-blue-600',    desc:'ป้องกันล่วงหน้า ระบบดี' },
                    { range:'4.1–5.0', level:'Generative', cls:'border-emerald-200 bg-emerald-50',txt:'text-emerald-600', desc:'วัฒนธรรมแข็งแกร่ง' },
                ].map(m=>`<div class="border rounded-lg p-3 ${m.cls}"><div class="text-xs text-slate-500">${m.range}</div><div class="font-bold ${m.txt}">${m.level}</div><div class="text-xs text-slate-500 mt-0.5">${m.desc}</div></div>`).join('')}
            </div>
        </div>
    </div>`;
}

// ── Tab: PPE ──────────────────────────────────────────────────────────
function buildPPEHtml() {
    const itemStats = {};
    PPE_ITEMS.forEach(item => {
        const all = _ppeInspections.filter(r => r[item.key] && r[item.key] !== '');
        const ok  = all.filter(r => r[item.key] === 'Compliant').length;
        itemStats[item.key] = { total: all.length, ok, pct: all.length ? ((ok/all.length)*100).toFixed(1) : null };
    });

    const overallPct = _ppeInspections.length
        ? (_ppeInspections.reduce((s,r)=>s+parseFloat(r.CompliancePct||0),0)/_ppeInspections.length).toFixed(1)
        : null;

    const summaryCards = PPE_ITEMS.map(item => {
        const { ok, total, pct } = itemStats[item.key];
        const p = pct !== null ? parseFloat(pct) : null;
        const cls = p===null ? 'border-slate-100 bg-slate-50 text-slate-400'
                  : p>=90   ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : p>=70   ? 'border-amber-100 bg-amber-50 text-amber-700'
                  :           'border-red-100 bg-red-50 text-red-700';
        const iconCls = p===null?'text-slate-400':p>=90?'text-emerald-500':p>=70?'text-amber-500':'text-red-500';
        return `<div class="border rounded-xl p-4 text-center ${cls}">
            <div class="flex justify-center mb-2 ${iconCls}">${item.icon}</div>
            <div class="text-xs font-medium opacity-75">${item.label}</div>
            <div class="text-2xl font-bold mt-1">${p!==null?p+'%':'–'}</div>
            <div class="text-xs mt-0.5 opacity-70">${ok}/${total} รายการ</div>
        </div>`;
    }).join('');

    const rows = _ppeInspections.map(r => {
        const pct = parseFloat(r.CompliancePct||0);
        const pctCls = pct>=90?'text-emerald-600 font-bold':pct>=70?'text-amber-600 font-semibold':'text-red-600 font-semibold';
        return `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">${fmtDate(r.InspectionDate)}</td>
            <td class="px-4 py-3 text-sm text-slate-600">${esc(r.Area||r.Department||'-')}</td>
            <td class="px-4 py-3 text-sm text-slate-600">${esc(r.InspectorName||'-')}</td>
            ${PPE_ITEMS.map(item => {
                const v = r[item.key];
                return `<td class="px-2 py-3 text-center text-sm">${
                    v==='Compliant'    ? '<span class="text-emerald-500 font-bold">✓</span>' :
                    v==='Non-Compliant'? '<span class="text-red-500 font-bold">✗</span>'     :
                    '<span class="text-slate-300">–</span>'}
                </td>`;
            }).join('')}
            <td class="px-4 py-3 text-center text-sm ${pctCls}">${pct.toFixed(1)}%</td>
            <td class="px-4 py-3">
                <div class="flex items-center gap-1">
                    <button onclick="window._scViewPPE('${r.InspectionID}')" class="p-1.5 rounded text-slate-400 hover:text-blue-500 hover:bg-slate-100 transition-colors" title="รายละเอียด"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></button>
                    ${_isAdmin ? `<button onclick="window._scDeletePPE('${r.InspectionID}')" class="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="ลบ"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');

    const colCount = _isAdmin ? 10+PPE_ITEMS.length : 9+PPE_ITEMS.length;
    return `
    <div class="space-y-5">
        ${overallPct !== null ? `
        <div class="card p-5 border-l-4 ${parseFloat(overallPct)>=90?'border-emerald-400':parseFloat(overallPct)>=70?'border-amber-400':'border-red-400'}">
            <div class="flex items-center justify-between mb-3">
                <div>
                    <p class="text-sm text-slate-500 font-medium">Overall PPE Compliance — ปี ${_filterYear}</p>
                    <p class="text-4xl font-bold mt-1 ${parseFloat(overallPct)>=90?'text-emerald-600':parseFloat(overallPct)>=70?'text-amber-600':'text-red-600'}">${overallPct}%</p>
                </div>
                <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${parseFloat(overallPct)>=90?'bg-emerald-100':parseFloat(overallPct)>=70?'bg-amber-100':'bg-red-100'}">
                    <svg class="w-6 h-6 ${parseFloat(overallPct)>=90?'text-emerald-600':parseFloat(overallPct)>=70?'text-amber-500':'text-red-500'}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/></svg>
                </div>
            </div>
            <div class="bg-slate-100 rounded-full h-3"><div class="h-3 rounded-full ${parseFloat(overallPct)>=90?'bg-emerald-500':parseFloat(overallPct)>=70?'bg-amber-500':'bg-red-500'}" style="width:${Math.min(overallPct,100)}%"></div></div>
        </div>` : `<div class="card p-4 text-center text-slate-400 text-sm">ยังไม่มีข้อมูล PPE Inspection สำหรับปี ${_filterYear}</div>`}

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">${summaryCards}</div>

        <div class="flex justify-end">
            <button onclick="window._scAddPPE()" class="btn btn-primary px-5 flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                บันทึกผล PPE Inspection
            </button>
        </div>

        <div class="card overflow-hidden">
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-semibold text-slate-700">บันทึกการตรวจ PPE ปี ${_filterYear}</h3>
                <span class="text-xs text-slate-400">${_ppeInspections.length} รายการ</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">วันที่ตรวจ</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">พื้นที่</th>
                            <th class="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ผู้ตรวจ</th>
                            ${PPE_ITEMS.map(i=>`<th class="px-2 py-3 text-center text-slate-500" title="${i.label}"><div class="flex justify-center">${i.icon}</div></th>`).join('')}
                            <th class="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Compliance %</th>
                            <th class="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="${colCount}" class="text-center py-12 text-slate-400">ยังไม่มีข้อมูลการตรวจ PPE สำหรับปี ${_filterYear}</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

// ── Tab: Dashboard ────────────────────────────────────────────────────
function buildDashboardHtml() {
    const avg      = _dashData?.avgScores;
    const ppeStats = _dashData?.ppeStats;
    const trend    = _dashData?.yearTrend || [];

    let overallAvg = null;
    if (avg) {
        const vals = [avg.avg_t1,avg.avg_t2,avg.avg_t3,avg.avg_t4,avg.avg_t5,avg.avg_t7].filter(v=>v!=null).map(v=>parseFloat(v));
        if (vals.length) overallAvg = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2);
    }
    const mat = overallAvg ? getMaturity(overallAvg) : null;

    const ppePct = ppeStats?.overall_pct ? parseFloat(ppeStats.overall_pct) : null;
    const ppeScore = ppePct !== null ? ((ppePct/100)*4+1).toFixed(2) : null;

    const scoreCards = [
        { label:'เดินบน Walk Way',    val:avg?.avg_t1, code:'T1' },
        { label:'ไม่ใช้โทรศัพท์',    val:avg?.avg_t2, code:'T2' },
        { label:'ข้ามถนนทางม้าลาย',  val:avg?.avg_t3, code:'T3' },
        { label:'หยุดยืนชี้นิ้ว',     val:avg?.avg_t4, code:'T4' },
        { label:'ไม่ล้วงกระเป๋า',    val:avg?.avg_t5, code:'T5' },
        { label:'PPE Control',        val:ppeScore,    code:'T6', note:'(จาก PPE%)' },
        { label:'แยกขยะถูกต้อง',     val:avg?.avg_t7, code:'T7' },
    ].map(c => {
        const v = c.val!=null ? parseFloat(c.val) : null;
        const cls = scoreColor(v);
        return `<div class="card p-4 text-center">
            <div class="flex justify-center mb-2">
                <span class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold text-white" style="background:linear-gradient(135deg,#059669,#0d9488)">${c.code}</span>
            </div>
            <div class="text-xs text-slate-500 leading-tight mb-2">${c.label}${c.note?`<br><span class="opacity-60">${c.note}</span>`:''}</div>
            <div class="text-2xl font-bold ${cls}">${v!=null?v.toFixed(1):'–'}</div>
            <div class="text-xs text-slate-400">/ 5.0</div>
        </div>`;
    }).join('');

    const ppeRows = ppeStats ? [
        { label:'Safety Helmet', ok:ppeStats.helmet_ok,  total:ppeStats.helmet_total  },
        { label:'Safety Glasses',ok:ppeStats.glasses_ok, total:ppeStats.glasses_total },
        { label:'Gloves',        ok:ppeStats.gloves_ok,  total:ppeStats.gloves_total  },
        { label:'Safety Shoes',  ok:ppeStats.shoes_ok,   total:ppeStats.shoes_total   },
        { label:'Face Shield',   ok:ppeStats.shield_ok,  total:ppeStats.shield_total  },
        { label:'Ear Plug',      ok:ppeStats.earplug_ok, total:ppeStats.earplug_total },
    ].map(item => {
        const p = item.total>0 ? ((item.ok/item.total)*100).toFixed(1) : null;
        const cls = p===null?'text-slate-400':parseFloat(p)>=90?'text-emerald-600':parseFloat(p)>=70?'text-amber-600':'text-red-600';
        const barCls = p===null?'bg-slate-200':parseFloat(p)>=90?'bg-emerald-500':parseFloat(p)>=70?'bg-amber-500':'bg-red-500';
        return `<div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <span class="text-sm text-slate-700 w-28 flex-shrink-0">${item.label}</span>
            <div class="flex-1 bg-slate-100 rounded-full h-2"><div class="h-2 rounded-full ${barCls}" style="width:${p||0}%"></div></div>
            <span class="text-sm font-bold w-14 text-right ${cls}">${p!==null?p+'%':'–'}</span>
        </div>`;
    }).join('') : '';

    return `
    <div class="space-y-5">
        ${mat ? `
        <div class="card p-5 border-l-4 ${mat.border}">
            <div class="flex items-center justify-between">
                <div>
                    <p class="text-sm text-slate-500 font-medium">Culture Maturity Level — ปี ${_filterYear}</p>
                    <div class="flex items-center gap-3 mt-2">
                        <span class="text-4xl font-bold ${mat.color}">${overallAvg}</span>
                        <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-bold text-sm ${mat.bg} ${mat.color}"><span class="w-2 h-2 rounded-full inline-block ${mat.dot}"></span>${mat.label}</span>
                    </div>
                </div>
                <div class="hidden md:block text-right text-sm text-slate-500">
                    <div>จาก ${_assessments.length} รายการประเมิน</div>
                    <div>${_ppeInspections.length} ครั้งตรวจ PPE</div>
                </div>
            </div>
        </div>` : `
        <div class="card p-10 text-center text-slate-400">
            <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
            <p>ยังไม่มีข้อมูลการประเมิน — กรุณาบันทึกผลในแท็บ "ผลการประเมิน"</p>
        </div>`}

        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">${scoreCards}</div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="card p-5">
                <h3 class="font-semibold text-slate-700 mb-4">คะแนนเฉลี่ยแต่ละหัวข้อ — Radar Chart</h3>
                <div class="relative" style="height:280px"><canvas id="sc-radar-chart"></canvas></div>
            </div>
            <div class="card p-5">
                <h3 class="font-semibold text-slate-700 mb-4">คะแนนแต่ละหัวข้อ — Bar Chart</h3>
                <div class="relative" style="height:280px"><canvas id="sc-bar-chart"></canvas></div>
            </div>
        </div>

        <div class="card p-5">
            <h3 class="font-semibold text-slate-700 mb-4">แนวโน้มคะแนนเฉลี่ยรายปี — Trend</h3>
            <div class="relative" style="height:220px"><canvas id="sc-line-chart"></canvas></div>
        </div>

        ${ppeStats ? `
        <div class="card p-5">
            <h3 class="font-semibold text-slate-700 mb-4">PPE Compliance Summary — ปี ${_filterYear}</h3>
            ${ppeRows}
        </div>` : ''}
    </div>`;
}

// ── Charts ────────────────────────────────────────────────────────────
function initCharts() {
    const avg      = _dashData?.avgScores;
    const ppeStats = _dashData?.ppeStats;
    const trend    = _dashData?.yearTrend || [];

    const ppePct   = ppeStats?.overall_pct ? parseFloat(ppeStats.overall_pct) : null;
    const ppeScore = ppePct !== null ? ((ppePct/100)*4+1) : 0;

    const scores = [
        parseFloat(avg?.avg_t1||0),
        parseFloat(avg?.avg_t2||0),
        parseFloat(avg?.avg_t3||0),
        parseFloat(avg?.avg_t4||0),
        parseFloat(avg?.avg_t5||0),
        parseFloat(ppeScore.toFixed(2)),
        parseFloat(avg?.avg_t7||0),
    ];

    const barColors = scores.map(s => s>=4?'#059669':s>=3?'#3b82f6':s>=2?'#f59e0b':'#ef4444');

    const radarEl = document.getElementById('sc-radar-chart');
    if (radarEl) {
        _radarChart = new Chart(radarEl, {
            type: 'radar',
            data: {
                labels: TOPIC_LABELS,
                datasets: [{ label:`ปี ${_filterYear}`, data: scores,
                    backgroundColor:'rgba(5,150,105,0.15)', borderColor:'#059669',
                    borderWidth:2, pointBackgroundColor:'#059669', pointRadius:4 }]
            },
            options: { responsive:true, maintainAspectRatio:false,
                scales:{ r:{ min:0, max:5, ticks:{ stepSize:1, font:{size:9} }, pointLabels:{ font:{size:10} } } },
                plugins:{ legend:{ display:false } } }
        });
    }

    const barEl = document.getElementById('sc-bar-chart');
    if (barEl) {
        _barChart = new Chart(barEl, {
            type: 'bar',
            data: {
                labels: TOPIC_LABELS.map(l => l.length>12 ? l.slice(0,11)+'…' : l),
                datasets: [{ data:scores, backgroundColor:barColors, borderRadius:6 }]
            },
            options: { responsive:true, maintainAspectRatio:false,
                scales:{ y:{ min:0, max:5, ticks:{ stepSize:1, font:{size:10} } }, x:{ ticks:{ font:{size:9} } } },
                plugins:{ legend:{ display:false } } }
        });
    }

    const lineEl = document.getElementById('sc-line-chart');
    if (lineEl && trend.length) {
        _lineChart = new Chart(lineEl, {
            type: 'line',
            data: {
                labels: trend.map(t => t.AssessmentYear),
                datasets: [{ label:'คะแนนเฉลี่ย',
                    data: trend.map(t => parseFloat(parseFloat(t.avg_score||0).toFixed(2))),
                    borderColor:'#059669', backgroundColor:'rgba(5,150,105,0.1)',
                    borderWidth:2.5, pointRadius:5, fill:true, tension:0.35 }]
            },
            options: { responsive:true, maintainAspectRatio:false,
                scales:{ y:{ min:0, max:5, ticks:{ stepSize:1, font:{size:10} } }, x:{ ticks:{ font:{size:11} } } },
                plugins:{ legend:{ display:false } } }
        });
    }
}

// ── Principle Form ────────────────────────────────────────────────────
function openPrincipleForm(id) {
    const p = _principles.find(x => x.PrincipleID === id);
    if (!p) return;
    UI.openModal(`แก้ไขหัวข้อที่ ${p.SortOrder}`, `
    <form id="sc-pf" class="space-y-4">
        <input type="hidden" name="PrincipleID" value="${esc(p.PrincipleID)}">
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อหัวข้อ</label>
            <input name="Title" type="text" required value="${esc(p.Title)}" class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">คำอธิบาย</label>
            <textarea name="Description" rows="3" class="form-textarea w-full resize-none">${esc(p.Description||'')}</textarea></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">URL รูปภาพ</label>
            <input name="ImageUrl" type="url" value="${esc(p.ImageUrl||'')}" placeholder="https://..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">URL ไฟล์แนบ (Download)</label>
            <input name="AttachmentUrl" type="url" value="${esc(p.AttachmentUrl||'')}" placeholder="https://..." class="form-input w-full"></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ชื่อไฟล์แนบ</label>
            <input name="AttachmentName" type="text" value="${esc(p.AttachmentName||'')}" placeholder="เช่น คู่มือ Walk Way.pdf" class="form-input w-full"></div>
        <div id="sc-pf-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window._UI_closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('sc-pf')?.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            const errEl = document.getElementById('sc-pf-err');
            try {
                await apiFetch(`/safety-culture/principles/${data.PrincipleID}`, { method:'PUT', body:JSON.stringify(data) });
                UI.closeModal(); UI.showToast('บันทึกสำเร็จ','success');
                await refreshAll();
            } catch(err) { errEl.textContent=err.message||'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
        });
    }, 50);
}

// ── Assessment Form ───────────────────────────────────────────────────
function openAssessmentForm(id) {
    const a = id ? _assessments.find(x => x.AssessmentID === id) : null;
    const yr = new Date().getFullYear();
    const si = (name, label, val) => `
    <div><label class="block text-sm font-semibold text-slate-700 mb-1">${label}</label>
        <input name="${name}" type="number" min="1" max="5" step="0.1" value="${val!=null&&val!=undefined?val:''}" placeholder="1–5" class="form-input w-full"></div>`;

    UI.openModal(a?'แก้ไขผลการประเมิน':'บันทึกผลการประเมิน', `
    <form id="sc-af" class="space-y-4">
        ${a?`<input type="hidden" name="AssessmentID" value="${a.AssessmentID}">` : ''}
        <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">ปีการประเมิน</label>
                <input name="AssessmentYear" type="number" required min="2020" max="2099" value="${a?.AssessmentYear||yr}" class="form-input w-full"></div>
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">พื้นที่/แผนก</label>
                <input name="Area" type="text" value="${esc(a?.Area||'ทั้งหมด')}" class="form-input w-full"></div>
        </div>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">คะแนนรายหัวข้อ (1–5)</p>
        <div class="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
            หัวข้อที่ 6 (PPE Control) ไม่ต้องกรอกที่นี่ — ระบบคำนวณจาก PPE Inspection อัตโนมัติ
        </div>
        <div class="grid grid-cols-2 gap-3">
            ${si('T1_Score','1. เดินบน Walk Way',a?.T1_Score)}
            ${si('T2_Score','2. ไม่ใช้โทรศัพท์ขณะเดิน',a?.T2_Score)}
            ${si('T3_Score','3. ข้ามถนนทางม้าลาย',a?.T3_Score)}
            ${si('T4_Score','4. หยุดยืนชี้นิ้ว',a?.T4_Score)}
            ${si('T5_Score','5. ไม่ล้วงกระเป๋า',a?.T5_Score)}
            ${si('T7_Score','7. แยกขยะถูกต้อง',a?.T7_Score)}
        </div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none">${esc(a?.Notes||'')}</textarea></div>
        <div id="sc-af-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window._UI_closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-lg');

    setTimeout(() => {
        document.getElementById('sc-af')?.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            const errEl = document.getElementById('sc-af-err');
            try {
                if (data.AssessmentID) {
                    await apiFetch(`/safety-culture/assessments/${data.AssessmentID}`, { method:'PUT', body:JSON.stringify(data) });
                } else {
                    await apiFetch('/safety-culture/assessments', { method:'POST', body:JSON.stringify(data) });
                }
                UI.closeModal(); UI.showToast('บันทึกผลการประเมินสำเร็จ','success');
                await refreshAll();
            } catch(err) { errEl.textContent=err.message||'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
        });
    }, 50);
}

async function deleteAssessment(id) {
    if (!confirm('ต้องการลบผลการประเมินนี้?')) return;
    try {
        await apiFetch(`/safety-culture/assessments/${id}`, { method:'DELETE' });
        UI.showToast('ลบสำเร็จ','success'); await refreshAll();
    } catch(err) { UI.showToast('ลบไม่สำเร็จ: '+err.message,'error'); }
}

// ── PPE Form ──────────────────────────────────────────────────────────
function openPPEForm() {
    const today = new Date().toISOString().split('T')[0];
    const checklist = PPE_ITEMS.map(item => `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between py-2.5 border-b border-slate-100 gap-2">
        <div class="flex items-center gap-2 min-w-0">
            <span class="flex-shrink-0 text-slate-500">${item.icon}</span>
            <span class="text-sm font-medium text-slate-700">${item.label}</span>
        </div>
        <div class="flex gap-3 flex-shrink-0">
            <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="${item.key}" value="Compliant" class="accent-emerald-500">
                <span class="text-emerald-600 font-medium">Compliant</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="${item.key}" value="Non-Compliant" class="accent-red-500">
                <span class="text-red-500 font-medium">Non-Compliant</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" name="${item.key}" value="" checked class="accent-slate-400">
                <span class="text-slate-400">N/A</span>
            </label>
        </div>
    </div>`).join('');

    UI.openModal('บันทึกผล PPE Inspection', `
    <form id="sc-ppef" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">วันที่ตรวจ</label>
                <input name="InspectionDate" type="date" required value="${today}" class="form-input w-full"></div>
            <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">Area/พื้นที่</label>
                <input name="Area" type="text" placeholder="เช่น Production Area 1" class="form-input w-full"></div>
        </div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">แผนก</label>
            <input name="Department" type="text" placeholder="ชื่อแผนก" class="form-input w-full"></div>
        <div class="bg-slate-50 rounded-xl border border-slate-100 p-4">
            <p class="text-sm font-semibold text-slate-700 mb-3">PPE Checklist</p>
            ${checklist}
        </div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">หมายเหตุ</label>
            <textarea name="Notes" rows="2" class="form-textarea w-full resize-none" placeholder="หมายเหตุ..."></textarea></div>
        <div><label class="block text-sm font-semibold text-slate-700 mb-1.5">URL รูปภาพหลักฐาน</label>
            <input name="ImageUrl" type="url" placeholder="https://..." class="form-input w-full"></div>
        <div id="sc-ppef-err" class="text-sm text-red-500 hidden"></div>
        <div class="flex justify-end gap-3 pt-3 border-t">
            <button type="button" onclick="window._UI_closeModal()" class="btn btn-secondary px-5">ยกเลิก</button>
            <button type="submit" class="btn btn-primary px-5">บันทึก</button>
        </div>
    </form>`, 'max-w-2xl');

    setTimeout(() => {
        document.getElementById('sc-ppef')?.addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            const errEl = document.getElementById('sc-ppef-err');
            try {
                await apiFetch('/safety-culture/ppe-inspections', { method:'POST', body:JSON.stringify(data) });
                UI.closeModal(); UI.showToast('บันทึกผล PPE Inspection สำเร็จ','success');
                await refreshAll();
            } catch(err) { errEl.textContent=err.message||'เกิดข้อผิดพลาด'; errEl.classList.remove('hidden'); }
        });
    }, 50);
}

function viewPPERecord(id) {
    const r = _ppeInspections.find(x => x.InspectionID === id);
    if (!r) return;
    const rows = PPE_ITEMS.map(item => {
        const v = r[item.key];
        return `<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
            <div class="flex items-center gap-2"><span class="text-slate-500">${item.icon}</span><span class="text-sm text-slate-700">${item.label}</span></div>
            <span class="text-sm font-semibold ${v==='Compliant'?'text-emerald-600':v==='Non-Compliant'?'text-red-500':'text-slate-400'}">
                ${v==='Compliant'?'✓ Compliant':v==='Non-Compliant'?'✗ Non-Compliant':'— N/A'}
            </span>
        </div>`;
    }).join('');
    const pct = parseFloat(r.CompliancePct||0);
    const pctCls = pct>=90?'text-emerald-600':pct>=70?'text-amber-600':'text-red-600';
    UI.openModal('ผล PPE Inspection', `
    <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-slate-500">วันที่ตรวจ: </span><span class="font-medium">${fmtDate(r.InspectionDate)}</span></div>
            <div><span class="text-slate-500">ผู้ตรวจ: </span><span class="font-medium">${esc(r.InspectorName||'-')}</span></div>
            <div><span class="text-slate-500">พื้นที่: </span><span class="font-medium">${esc(r.Area||'-')}</span></div>
            <div><span class="text-slate-500">แผนก: </span><span class="font-medium">${esc(r.Department||'-')}</span></div>
        </div>
        <div class="bg-slate-50 rounded-xl border border-slate-100 p-4">${rows}</div>
        <div class="flex items-center justify-between font-bold text-sm pt-1">
            <span class="text-slate-700">Compliance Rate</span>
            <span class="text-xl ${pctCls}">${pct.toFixed(1)}% <span class="text-sm font-normal text-slate-500">(${r.CompliantItems}/${r.TotalItems} รายการ)</span></span>
        </div>
        ${r.Notes?`<div class="text-xs text-slate-500 bg-slate-50 rounded-lg p-3"><strong>หมายเหตุ:</strong> ${esc(r.Notes)}</div>`:''}
        ${r.ImageUrl?`<a href="${esc(r.ImageUrl)}" target="_blank" rel="noopener" class="inline-block text-sm text-emerald-600 hover:underline">ดูรูปภาพหลักฐาน →</a>`:''}
    </div>`, 'max-w-md');
}

async function deletePPE(id) {
    if (!confirm('ต้องการลบบันทึกการตรวจ PPE นี้?')) return;
    try {
        await apiFetch(`/safety-culture/ppe-inspections/${id}`, { method:'DELETE' });
        UI.showToast('ลบสำเร็จ','success'); await refreshAll();
    } catch(err) { UI.showToast('ลบไม่สำเร็จ: '+err.message,'error'); }
}

// ── PDF Export ────────────────────────────────────────────────────────
async function exportPDF() {
    if (typeof window.jspdf === 'undefined') {
        UI.showToast('ไลบรารี PDF ยังโหลดไม่สำเร็จ','error'); return;
    }
    UI.showToast('กำลังสร้าง PDF...','info');
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        const pageW = 210, margin = 15, cW = pageW - margin*2;
        let y = margin;

        // Header bar
        pdf.setFillColor(6,78,59);
        pdf.rect(0,0,pageW,28,'F');
        pdf.setTextColor(255,255,255);
        pdf.setFontSize(14); pdf.setFont('helvetica','bold');
        pdf.text('Safety & Environment Culture Report', pageW/2, 12, { align:'center' });
        pdf.setFontSize(9); pdf.setFont('helvetica','normal');
        pdf.text(`Thai Summit Harness Co., Ltd.  |  Assessment Year: ${_filterYear}  |  Generated: ${new Date().toLocaleDateString('th-TH')}`, pageW/2, 21, { align:'center' });
        y = 38;

        const avg      = _dashData?.avgScores;
        const ppeStats = _dashData?.ppeStats;

        // Maturity
        if (avg) {
            const vals = [avg.avg_t1,avg.avg_t2,avg.avg_t3,avg.avg_t4,avg.avg_t5,avg.avg_t7].filter(v=>v!=null).map(v=>parseFloat(v));
            const overall = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : null;
            const mat = overall ? getMaturity(overall) : null;
            pdf.setTextColor(30,30,30); pdf.setFontSize(11); pdf.setFont('helvetica','bold');
            pdf.text('Culture Maturity Level', margin, y); y+=6;
            pdf.setFont('helvetica','normal'); pdf.setFontSize(10);
            pdf.text(`Overall Average: ${overall||'N/A'}   Level: ${mat?.label||'N/A'}`, margin, y); y+=10;
        }

        // Score summary
        pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(30,30,30);
        pdf.text('Score Summary', margin, y); y+=6;
        const ppePct2 = ppeStats?.overall_pct ? parseFloat(ppeStats.overall_pct).toFixed(1) : null;
        const scoreRows = [
            ['T1','เดินบน Walk Way',avg?.avg_t1],['T2','ไม่ใช้โทรศัพท์ขณะเดิน',avg?.avg_t2],
            ['T3','ข้ามถนนทางม้าลาย',avg?.avg_t3],['T4','หยุดยืนชี้นิ้ว',avg?.avg_t4],
            ['T5','ไม่ล้วงกระเป๋า',avg?.avg_t5],['T6',`PPE Control (${ppePct2||'N/A'}% compliance)`,null],
            ['T7','แยกขยะถูกต้อง',avg?.avg_t7],
        ];
        pdf.setFontSize(9); pdf.setFont('helvetica','normal');
        scoreRows.forEach(([code,label,val],i) => {
            pdf.setFillColor(i%2===0?248:255,i%2===0?250:255,i%2===0?252:255);
            pdf.rect(margin,y-3.5,cW,7,'F');
            pdf.setTextColor(100,100,100); pdf.text(code,margin+2,y);
            pdf.setTextColor(30,30,30);    pdf.text(label,margin+14,y);
            const display = val!=null ? parseFloat(val).toFixed(1) : (code==='T6'&&ppePct2 ? `PPE: ${ppePct2}%` : 'N/A');
            pdf.setFont('helvetica','bold'); pdf.setTextColor(5,150,105);
            pdf.text(display, margin+cW-2, y, { align:'right' });
            pdf.setFont('helvetica','normal'); y+=8;
        });
        y+=4;

        // PPE section
        if (ppeStats) {
            if (y>240) { pdf.addPage(); y=20; }
            pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(30,30,30);
            pdf.text('PPE Compliance Result', margin, y); y+=6;
            const ppeItems2 = [
                ['Safety Helmet',ppeStats.helmet_ok,ppeStats.helmet_total],
                ['Safety Glasses',ppeStats.glasses_ok,ppeStats.glasses_total],
                ['Gloves',ppeStats.gloves_ok,ppeStats.gloves_total],
                ['Safety Shoes',ppeStats.shoes_ok,ppeStats.shoes_total],
                ['Face Shield',ppeStats.shield_ok,ppeStats.shield_total],
                ['Ear Plug',ppeStats.earplug_ok,ppeStats.earplug_total],
            ];
            pdf.setFontSize(9); pdf.setFont('helvetica','normal');
            ppeItems2.forEach(([label,ok,total],i) => {
                const p = total>0?((ok/total)*100).toFixed(1):'N/A';
                pdf.setFillColor(i%2===0?248:255,i%2===0?250:255,i%2===0?252:255);
                pdf.rect(margin,y-3.5,cW,7,'F');
                pdf.setTextColor(30,30,30); pdf.text(label,margin+2,y);
                const pNum = p!=='N/A'?parseFloat(p):0;
                pdf.setFont('helvetica','bold');
                pdf.setTextColor(pNum>=90?5:pNum>=70?245:239, pNum>=90?150:pNum>=70?158:68, pNum>=90?105:pNum>=70?11:68);
                pdf.text(p!=='N/A'?`${p}%`:'N/A', margin+cW-2, y, { align:'right' });
                pdf.setFont('helvetica','normal'); y+=8;
            });
            y+=4;
        }

        // Suggestions
        if (y>240) { pdf.addPage(); y=20; }
        pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(30,30,30);
        pdf.text('Improvement Suggestions', margin, y); y+=6;
        const suggestions = buildSuggestions();
        pdf.setFontSize(9); pdf.setFont('helvetica','normal');
        suggestions.forEach(s => {
            if (y>270) { pdf.addPage(); y=20; }
            const lines = pdf.splitTextToSize(`• ${s}`, cW-5);
            lines.forEach(l => { pdf.setTextColor(60,60,60); pdf.text(l,margin+3,y); y+=5.5; });
        });

        // Footer
        const total = pdf.getNumberOfPages();
        for (let i=1;i<=total;i++) {
            pdf.setPage(i);
            pdf.setFontSize(7); pdf.setTextColor(160,160,160);
            pdf.text(`TSH Safety Core Activity — Safety & Environment Culture Report — Page ${i}/${total}`, pageW/2, 291, { align:'center' });
        }

        pdf.save(`Safety_Culture_${_filterYear}.pdf`);
        UI.showToast('สร้าง PDF สำเร็จ','success');
    } catch(err) {
        console.error(err);
        UI.showToast('สร้าง PDF ไม่สำเร็จ: '+err.message,'error');
    }
}

function buildSuggestions() {
    const avg = _dashData?.avgScores;
    if (!avg) return ['กรุณาบันทึกผลการประเมินเพื่อรับคำแนะนำการพัฒนา'];
    const list = [];
    const pairs = [
        [avg.avg_t1,'T1 Walk Way — เสริมสัญลักษณ์ Walk Way และจัดกิจกรรมรณรงค์'],
        [avg.avg_t2,'T2 No-Phone Policy — เพิ่มป้ายเตือนและบังคับใช้อย่างสม่ำเสมอ'],
        [avg.avg_t3,'T3 Crosswalk — ติดตั้งสิ่งกีดขวางเพื่อป้องกันการข้ามถนนผิดจุด'],
        [avg.avg_t4,'T4 Pointing & Calling — บรรจุในการประชุม Safety Briefing ทุกวัน'],
        [avg.avg_t5,'T5 Hands-Free Walking — อบรมให้ความรู้เรื่องการป้องกันการลื่นหกล้ม'],
        [avg.avg_t7,'T7 Waste Segregation — ติดป้ายถังขยะให้ชัดเจนและจัดอบรมทบทวน'],
    ];
    pairs.forEach(([score,msg]) => { if (score!=null && parseFloat(score)<3.5) list.push(msg); });
    const ppeStats = _dashData?.ppeStats;
    if (ppeStats?.overall_pct && parseFloat(ppeStats.overall_pct)<90) {
        list.push('PPE — เพิ่มความเข้มงวดในการตรวจ PPE ประจำวัน และจัดเตรียมอุปกรณ์สำรอง');
    }
    return list.length ? list : ['ทุกหัวข้ออยู่ในเกณฑ์ดี — รักษาระดับวัฒนธรรมความปลอดภัยให้ต่อเนื่อง'];
}
