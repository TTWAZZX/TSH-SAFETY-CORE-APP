import { API, apiFetch } from '../api.js?v=20260723-onboarding-release';
import { escHtml, showToast } from '../ui.js?v=20260714-phase21-platform-shell';
import { openBbsCardDesigner } from './bbs-card-designer.js?v=20260902-bbs-phase10f2';

const state = { context: null, workspace: null, eligible: [], history: [], ownDrafts: [], tab: 'workspace', view: 'observer', draft: null, batchDraft:null, batchSelected:[], batchStep:1, masterReference:{levels:[],positions:[],departments:[],units:[],employees:[],summary:{}}, cardWorkspace:'overview', departmentConfigQuery:'', departmentConfigStatus:'all', departmentConfigSelectedId:null, cardTemplates: [], cardEmployees: [], cards: [], historyYear: new Date().getFullYear(), actionSummary: {}, actions: [], actionScope: 'all', actionStatus: '', actionPriority: '', slaRules: [], analytics: null, analyticsFilters: { scope:'', year:new Date().getFullYear(), month:0, departmentId:'', safetyUnitId:'', risk:'' }, departmentCards:null, community:null, communityEmployees:{rows:[],units:[]}, communityAdmin:{templates:[],qrCards:[],handlers:[],admins:[],departments:[]}, communityFilters:{year:new Date().getFullYear(),month:0}, inspectorSelf:{enabled:false,enrollment:null,team:[],available:[],coverage:{}}, inspectorAdmin:{enrollments:[],candidates:[],departments:[],units:[]}, inspectorTeam:null, inspectorSelectedId:null, inspectorCompliance:null, inspectorScheduleDetail:null, inspectorScheduleMode:'agenda', inspectorScheduleFilters:{year:new Date().getFullYear(),month:new Date().getMonth()+1}, loadErrors:{}, loadedAt:{}, retryingSection:'' };
state.listMeta={history:null,actions:null,actionOutbox:null,cardEmployees:null,cards:null};
state.historyFilters={status:'',departmentId:'',safetyUnitId:'',q:'',page:1,pageSize:20};
state.actionFilters={year:'',departmentId:'',safetyUnitId:'',q:'',page:1,pageSize:20};
state.actionOutbox={rows:[],meta:{deliveryEnabled:false,smtpConfigured:false,summary:{},eventTypes:[]},error:''};
state.actionOutboxFilters={status:'',eventType:'',year:'',q:'',page:1,pageSize:20};
state.communityFilters={...state.communityFilters,departmentId:'',safetyUnitId:'',q:'',actionStatus:'',priority:'',goodPage:1,riskyPage:1,pageSize:20};
state.cardFilters={q:'',status:'Active',departmentId:'',page:1,pageSize:20};
state.cardEmployeeFilters={q:'',departmentId:'',page:1,pageSize:24};
const yearNow = new Date().getFullYear();
const operationLocks = new WeakSet();
const listSearchTimers = new Map();
const cardTemplateAssetCache = new Map();
const CARD_PREVIEW_DPI = 150;

const n = value => Number(value || 0);
const listRows = payload => Array.isArray(payload) ? payload : (payload?.rows || []);
const listPagination = payload => Array.isArray(payload) ? null : (payload?.pagination || null);
function masterFilterOptions(selected='', includeUnits=false, departmentId='') { const rows=includeUnits?(state.masterReference?.units||[]).filter(row=>!departmentId||n(row.department_id||row.DepartmentID)===n(departmentId)):masterDepartments();return rows.map(row=>`<option value="${n(row.id)}" ${n(selected)===n(row.id)?'selected':''}>${escHtml(row.Name||row.name)}</option>`).join(''); }
function listPager(key,meta,label='รายการ'){if(!meta)return'';return`<nav class="border-t bg-slate-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2" aria-label="แบ่งหน้า ${escHtml(label)}"><div class="text-xs text-slate-500">หน้า ${n(meta.page)}/${n(meta.totalPages)} · ${n(meta.total)} ${escHtml(label)}</div><div class="grid grid-cols-2 gap-2"><button type="button" data-list-page="${key}" data-page="${n(meta.page)-1}" ${meta.hasPrevious?'':'disabled'} class="min-h-11 rounded-xl border bg-white px-4 text-xs font-bold disabled:opacity-40">ก่อนหน้า</button><button type="button" data-list-page="${key}" data-page="${n(meta.page)+1}" ${meta.hasNext?'':'disabled'} class="min-h-11 rounded-xl border bg-white px-4 text-xs font-bold disabled:opacity-40">ถัดไป</button></div></nav>`;}
const fmtDate = value => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = value => value ? new Date(value).toLocaleString('th-TH', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '-';
const statusBadge = value => `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${value === 'Submitted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${value === 'Submitted' ? 'ส่งแล้ว' : 'ฉบับร่าง'}</span>`;

function accessibilityStyles() {
    return `<style>
      #bbs-smart-card-page :where(button,a[href],summary,label,input,select,textarea){touch-action:manipulation}
      #bbs-smart-card-page :where(button,a[href],summary,input,select,textarea):focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
      #bbs-smart-card-page [role="tab"]:focus-visible{outline-color:#fbbf24}
      #bbs-smart-card-page .bbs-scroll-region:focus-visible{outline:3px solid #38bdf8;outline-offset:-3px}
      #bbs-smart-card-page [aria-busy="true"]{cursor:wait;opacity:.72}
      .bbs-card-preview-stage{background-image:linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}
      .bbs-card-cut-line{outline:2px dashed #f97316;outline-offset:4px}
      .bbs-card-safe-area{position:absolute;inset:4%;border:1px dashed rgba(14,116,144,.8);pointer-events:none}
      .bbs-dialog-panel{max-height:calc(var(--app-visual-viewport-height,100dvh) - 1.5rem)}
      .bbs-dialog-panel :where(button,a[href],input,select,textarea):focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
      @media(max-width:767px),(max-height:500px){
        #bbs-smart-card-page :where(button,a[href],summary){min-height:44px}
        #bbs-smart-card-page :where(input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea){min-height:44px;font-size:16px}
        #bbs-smart-card-page [data-bbs-sticky-actions]>div{width:100%}
        .bbs-dialog-overlay{align-items:flex-end!important;padding:0!important}
        .bbs-dialog-panel{width:100%;max-width:none;border-radius:1.5rem 1.5rem 0 0;max-height:calc(var(--app-visual-viewport-height,100dvh) - max(.75rem,env(safe-area-inset-top)))}
        .bbs-dialog-panel :where(button,a[href]){min-height:44px}
        .bbs-dialog-panel :where(input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea){min-height:44px;font-size:16px}
      }
    </style>`;
}

function activeTabId() { return `bbs-tab-${state.tab}`; }

function focusSelectorFor(element) {
    if (!element || !element.closest?.('#bbs-smart-card-page')) return '';
    if (element.id) return `#${CSS.escape(element.id)}`;
    for (const name of ['data-bbs-tab','data-card-workspace','data-batch-employee','data-batch-response','data-bbs-resume','data-bbs-detail','data-action-detail']) {
        const value = element.getAttribute(name);
        if (value !== null) return `[${name}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    }
    if (element.name) {
        const value = element.value ? `[value="${String(element.value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]` : '';
        return `[name="${String(element.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]${value}`;
    }
    return '';
}

function enhanceAccessibility() {
    const page = document.getElementById('bbs-smart-card-page');
    if (!page) return;
    page.querySelectorAll('[data-bbs-tab]').forEach(tab => {
        const selected = tab.dataset.bbsTab === state.tab;
        tab.setAttribute('role', 'tab');
        tab.id = `bbs-tab-${tab.dataset.bbsTab}`;
        tab.setAttribute('aria-controls', 'bbs-smart-card-body');
        tab.setAttribute('aria-selected', selected ? 'true' : 'false');
        tab.tabIndex = selected ? 0 : -1;
    });
    const panel = page.querySelector('#bbs-smart-card-body');
    if (panel) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', activeTabId());
        panel.tabIndex = -1;
    }
    page.querySelectorAll('table').forEach((table, index) => {
        table.querySelectorAll('th').forEach(th => th.setAttribute('scope', 'col'));
        const region = table.closest('.overflow-x-auto');
        if (!region) return;
        const heading = region.closest('section,div')?.querySelector('h2,h3,h4');
        region.classList.add('bbs-scroll-region');
        region.tabIndex = 0;
        region.setAttribute('role', 'region');
        region.setAttribute('aria-label', heading?.textContent?.trim() || `ตารางข้อมูล BBS ${index + 1}`);
    });
    page.querySelectorAll('button:disabled').forEach(button => button.setAttribute('aria-disabled', 'true'));
    page.querySelectorAll('button[data-close]').forEach(button => button.setAttribute('aria-label', 'ปิดหน้าต่าง'));
}

function mountBbsDialog(overlay, label, returnFocus = document.activeElement) {
    const previous = returnFocus;
    const panel = overlay.firstElementChild;
    overlay.classList.add('bbs-dialog-overlay');
    overlay.dataset.mobileOverlayDialog = 'true';
    panel?.classList.add('bbs-dialog-panel');
    panel?.setAttribute('role', 'dialog');
    panel?.setAttribute('aria-modal', 'true');
    panel?.setAttribute('aria-label', label);
    panel?.setAttribute('tabindex', '-1');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('mobile-modal-open');
    document.body.dataset.mobileOverlayActive = '1';
    const focusables = () => [...panel.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    const close = () => {
        overlay.removeEventListener('keydown', onKeydown);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        document.body.classList.remove('mobile-modal-open');
        delete document.body.dataset.mobileOverlayActive;
        previous?.focus?.({ preventScroll:true });
        window.dispatchEvent(new CustomEvent('tsh:mobile-overlay-state'));
    };
    const onKeydown = event => {
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const items = focusables();
        if (!items.length) { event.preventDefault(); panel?.focus(); return; }
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    overlay.addEventListener('keydown', onKeydown);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelectorAll('[data-close]').forEach(button => {
        button.type = 'button';
        button.setAttribute('aria-label', 'ปิดหน้าต่าง');
        button.addEventListener('click', close);
    });
    requestAnimationFrame(() => (focusables()[0] || panel)?.focus?.());
    window.dispatchEvent(new CustomEvent('tsh:mobile-overlay-state'));
    return close;
}

function shell() {
    return `
      <div data-bbs-shell class="w-full space-y-6 animate-fade-in pb-10 min-w-0">
        ${accessibilityStyles()}
        <section class="rounded-3xl overflow-hidden text-white p-6 md:p-8" style="background:linear-gradient(135deg,#064e3b,#047857 58%,#0d9488)">
          <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <div><p class="text-xs font-black uppercase tracking-[.2em] text-emerald-200">Behavior Based Safety</p><h2 class="text-2xl md:text-3xl font-black mt-2">BBS Smart Card</h2><p class="text-emerald-100 mt-2">สังเกตพฤติกรรมอย่างสร้างสรรค์ เรียนรู้ และป้องกันก่อนเกิดเหตุ</p></div>
            <div class="grid grid-cols-2 gap-3 text-sm"><div class="rounded-2xl bg-white/10 border border-white/15 px-4 py-3"><div class="text-emerald-200 text-xs">BBS Level</div><div class="font-bold mt-1">${escHtml(state.context?.bbsLevel || 'ยังไม่กำหนด')}</div></div><div class="rounded-2xl bg-white/10 border border-white/15 px-4 py-3"><div class="text-emerald-200 text-xs">ขอบเขต</div><div class="font-bold mt-1">${state.context?.pilot?.inPilot ? 'Pilot Unit' : (state.context?.permissions?.companyRead ? 'Admin' : 'ประวัติส่วนตัว')}</div></div></div>
          </div>
          <div class="flex gap-2 mt-6 overflow-x-auto pb-1" role="tablist" aria-label="เมนู BBS Smart Card">
            ${[['workspace','ภาพรวมของฉัน'],['community','Community / บัตรแผนก'],...(state.inspectorSelf?.enabled&&(state.context?.permissions?.configure||state.inspectorSelf?.enrollment) ? [['team-management','ผู้ตรวจ / ทีม']] : []),...(state.context?.analyticsEnabled ? [['analytics','Analytics / รายงาน']] : []),['start','เริ่ม Observation'],['actions','Corrective Action'],['history','ประวัติ'],...(state.context?.permissions?.configure ? [['cards','จัดการบัตร / QR']] : [])].map(([key,label]) => `<button type="button" data-bbs-tab="${key}" class="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${state.tab === key ? 'bg-white text-emerald-800' : 'bg-emerald-950/20 hover:bg-emerald-950/30'}">${label}</button>`).join('')}
          </div>
        </section>
        <div id="bbs-smart-card-body">${body()}</div>
      </div>`;
}

function body() {
    if (state.tab === 'community') return sectionRecoveryView('community', communityView());
    if (state.tab === 'team-management') return sectionRecoveryView('inspectors', inspectorManagementView());
    if (!state.context?.configurationReady && !state.context?.permissions?.companyRead) return empty('ยังไม่พร้อมใช้งาน', 'ตำแหน่งของคุณยังไม่ได้ Mapping เป็น BBS Level หรือสถานะ BBS ไม่ Active กรุณาติดต่อ Admin');
    if (state.tab === 'start') return sectionRecoveryView('core', startView());
    if (state.tab === 'history') return sectionRecoveryView('history', historyView());
    if (state.tab === 'actions') return sectionRecoveryView('actions', actionsView());
    if (state.tab === 'analytics') return sectionRecoveryView('analytics', analyticsView());
    if (state.tab === 'cards' && state.context?.permissions?.configure) return sectionRecoveryView('cards', cardsView());
    return sectionRecoveryView('core', workspaceView());
}

function empty(title, detail) {
    return `<section role="status" class="rounded-2xl border border-slate-200 bg-white p-10 text-center"><div aria-hidden="true" class="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">i</div><h3 class="font-black text-slate-800 mt-4">${escHtml(title)}</h3><p class="text-sm text-slate-500 mt-2">${escHtml(detail)}</p></section>`;
}

function errorText(error) {
    return String(error?.message || 'ไม่สามารถเชื่อมต่อข้อมูลส่วนนี้ได้').trim();
}

function kpiSemantic(value = {}) {
    const status = value.status || value.kpiStatus || {};
    const fallbackCode = value.percentage === null || value.percentage === undefined ? 'NOT_CONFIGURED' : (n(value.percentage) === 0 ? 'ZERO_PERCENT' : 'PERCENT');
    const code = String(status.code || fallbackCode);
    const labels = { N_A:'N/A', NOT_CONFIGURED:'Not configured', NOT_INSPECTED:'ยังไม่ได้ตรวจ', ZERO_PERCENT:'0%', PERCENT:`${n(value.percentage ?? status.percentage)}%` };
    const descriptions = { N_A:'ไม่อยู่ในเกณฑ์ KPI สำหรับช่วงเวลานี้', NOT_CONFIGURED:'ยังไม่ได้กำหนดผู้ตรวจและ KPI', NOT_INSPECTED:'มีตารางตรวจ แต่ยังไม่มีเป้าหมายที่ถึงกำหนด', ZERO_PERCENT:'ถึงกำหนดแล้ว แต่ยังไม่มีผลงานที่นับ KPI', PERCENT:`ผลงาน ${n(value.numerator)}/${n(value.denominator)}` };
    const tones = { N_A:'slate', NOT_CONFIGURED:'amber', NOT_INSPECTED:'sky', ZERO_PERCENT:'rose', PERCENT:n(value.percentage ?? status.percentage)>=100?'emerald':'amber' };
    return { code, label:String(status.label || labels[code] || 'Not configured'), description:String(status.description || descriptions[code] || ''), tone:tones[code] || 'slate' };
}

function kpiStatusBadge(value = {}) {
    const view=kpiSemantic(value),colors={slate:'bg-slate-100 text-slate-600',amber:'bg-amber-100 text-amber-700',sky:'bg-sky-100 text-sky-700',rose:'bg-rose-100 text-rose-700',emerald:'bg-emerald-100 text-emerald-700'};
    return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-black ${colors[view.tone]||colors.slate}" title="${escHtml(view.description)}">${escHtml(view.label)}</span>`;
}

async function trackSectionLoad(section, loader) {
    try {
        const result = await loader();
        delete state.loadErrors[section];
        state.loadedAt[section] = new Date().toISOString();
        return result;
    } catch (error) {
        state.loadErrors[section] = { message:errorText(error), at:new Date().toISOString() };
        console.warn(`[bbs] ${section} load failed:`, errorText(error));
        return null;
    }
}

function sectionRecoveryView(section, content) {
    const issue = state.loadErrors[section];
    if (!issue) return content;
    const hasPrevious = Boolean(state.loadedAt[section]);
    const banner = `<section role="alert" class="rounded-2xl border border-amber-300 bg-amber-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h3 class="font-black text-amber-900">โหลดข้อมูลส่วนนี้ไม่สำเร็จ</h3><p class="text-sm text-amber-800 mt-1">${escHtml(issue.message)}</p><p class="text-xs text-amber-700 mt-2">${hasPrevious?'กำลังแสดงข้อมูลล่าสุดที่โหลดสำเร็จ กรุณาตรวจสอบอีกครั้งก่อนดำเนินการ':'ยังไม่มีข้อมูลที่ยืนยันได้ จึงซ่อนค่าประมาณเพื่อป้องกันความเข้าใจผิด'}</p></div><button type="button" data-bbs-retry="${section}" ${state.retryingSection===section?'disabled':''} class="shrink-0 rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white disabled:bg-amber-300">${state.retryingSection===section?'กำลังลองใหม่...':'ลองโหลดอีกครั้ง'}</button></section>`;
    return hasPrevious ? `<div class="space-y-5">${banner}${content}</div>` : banner;
}

async function withBusy(control, task, label = 'กำลังดำเนินการ...') {
    if (!control || operationLocks.has(control)) return null;
    operationLocks.add(control);
    const targets = control.matches?.('form') ? [...control.querySelectorAll('button[type="submit"],input[type="submit"]')] : [control];
    const snapshots = targets.map(target => ({ target, disabled:target.disabled, html:target.tagName === 'BUTTON' ? target.innerHTML : null, value:target.value }));
    control.setAttribute('aria-busy', 'true');
    targets.forEach(target => { target.disabled = true; if (target.tagName === 'BUTTON') target.textContent = label; else target.value = label; });
    try {
        return await task();
    } finally {
        operationLocks.delete(control);
        control.removeAttribute('aria-busy');
        snapshots.forEach(({target,disabled,html,value}) => {
            if (!target.isConnected) return;
            target.disabled = disabled;
            if (target.tagName === 'BUTTON') target.innerHTML = html;
            else target.value = value;
        });
    }
}

function bindBusy(control, eventName, handler, label) {
    if (!control) return;
    control[eventName] = event => withBusy(control, () => handler(event), label);
}

function workspaceView() {
    const kpi = state.workspace?.kpi || {};
    const kpiView = kpiSemantic(kpi);
    const action = state.actionSummary || {};
    return `<div class="space-y-5">
      <section data-bbs-workspace-kpi-status="${escHtml(kpiView.code)}" class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        ${metric('KPI เดือนนี้', kpiView.label, kpiView.code==='PERCENT'?`${n(kpi.numerator)}/${n(kpi.denominator)} · ${kpiView.description}`:kpiView.description, kpiView.tone)}
        ${metric('คนที่สังเกต', n(kpi.uniqueObserved), 'Unique employees', 'sky')}
        ${metric('Safe', n(kpi.safe), 'คำตอบ Safe', 'emerald')}
        ${metric('Unsafe', n(kpi.unsafe), 'ต้องเรียนรู้/ติดตาม', 'rose')}
      </section>
      ${n(action.OverdueCount) || n(action.PendingVerificationCount) ? `<button type="button" data-open-actions class="w-full rounded-2xl border ${n(action.OverdueCount) ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'} p-4 text-left flex items-center justify-between gap-4"><div><div class="font-black">Corrective Action ที่ต้องติดตาม</div><div class="text-xs mt-1">เกินกำหนด ${n(action.OverdueCount)} · รอตรวจยืนยัน ${n(action.PendingVerificationCount)}</div></div><span class="font-black">ดูรายการ →</span></button>` : ''}
      <section class="grid lg:grid-cols-5 gap-5">
        <div class="lg:col-span-3 rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b"><h3 class="font-black text-slate-800">My Team</h3><p class="text-xs text-slate-500 mt-1">รายชื่อจาก hierarchy assignment ที่ Active</p></div>${teamRows()}</div>
        <div class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b"><h3 class="font-black text-slate-800">ล่าสุด</h3><p class="text-xs text-slate-500 mt-1">Observation ที่คุณสร้างล่าสุด</p></div>${recentRows()}</div>
      </section>
    </div>`;
}

function inspectorManagementView() {
    const isAdmin=Boolean(state.context?.permissions?.configure),adminData=state.inspectorAdmin||{},self=state.inspectorSelf||{};
    const teamData=isAdmin?(state.inspectorTeam||{team:[],available:[],coverage:{},enrollment:null}):self;
    return `<div class="space-y-5">
      ${inspectorCompliancePanel(isAdmin)}
      ${isAdmin?`<section class="rounded-2xl border border-emerald-200 bg-white overflow-hidden"><div class="p-5 border-b border-emerald-100"><h3 class="font-black text-slate-800">แต่งตั้งผู้ตรวจ BBS</h3><p class="text-xs text-slate-500 mt-1">Admin กำหนดหัวหน้ากลุ่ม ขอบเขต KPI และสิทธิ์จัดทีมด้วยตนเอง</p></div><form id="bbs-inspector-enroll-form" class="p-5 grid lg:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end"><label class="text-xs font-bold text-slate-600">หัวหน้ากลุ่ม<select name="inspectorEmployeeId" required class="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"><option value="">เลือกหัวหน้ากลุ่ม</option>${(adminData.candidates||[]).map(row=>`<option value="${escHtml(row.EmployeeID)}">${escHtml(row.EmployeeName)} · ${escHtml(row.EmployeeID)} · ${escHtml(row.Department||'-')} / ${escHtml(row.Unit||'-')}</option>`).join('')}</select></label><label class="text-xs font-bold text-slate-600">เริ่มนับ KPI<input name="effectiveFrom" required type="date" value="${new Date().toLocaleDateString('en-CA')}" class="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"></label><div class="space-y-2 text-xs font-bold text-slate-600"><label class="flex gap-2"><input name="kpiRequired" type="checkbox" checked> ต้องทำ KPI</label><label class="flex gap-2"><input name="allowSelfManage" type="checkbox" checked> จัดทีมตนเองได้</label></div><button class="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">แต่งตั้ง</button></form></section>
      <section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b"><h3 class="font-black text-slate-800">ผู้ตรวจที่ Admin กำหนด</h3><p class="text-xs text-slate-500 mt-1">เลือก “จัดทีม” เพื่อเพิ่มหรือนำสมาชิกออกแทนหัวหน้ากลุ่ม</p></div><div class="divide-y">${(adminData.enrollments||[]).map(inspectorEnrollmentRow).join('')||'<div class="p-10 text-center text-sm text-slate-400">ยังไม่มีผู้ตรวจที่ได้รับการแต่งตั้ง</div>'}</div></section>`:''}
      ${state.inspectorScheduleDetail?inspectorSchedulePanel(state.inspectorScheduleDetail,isAdmin):''}
      ${teamData?.enrollment?inspectorTeamPanel(teamData,isAdmin):(!isAdmin?empty('Admin ยังไม่ได้แต่งตั้งคุณเป็นผู้ตรวจ','เมื่อได้รับการแต่งตั้งและเปิดสิทธิ์จัดทีม เมนูนี้จะแสดงสมาชิกที่เลือกได้ใน Unit ของคุณ'):'')}
    </div>`;
}

function inspectorEnrollmentRow(row){const selected=n(state.inspectorSelectedId)===n(row.id),active=Number(row.IsActive)===1&&row.Status==='Active';return `<div class="p-4 grid xl:grid-cols-[1fr_auto] gap-3 ${selected?'bg-emerald-50/50':''}"><div><div class="font-black text-slate-800">${escHtml(row.EmployeeName)} <span class="font-normal text-slate-400">· ${escHtml(row.InspectorEmployeeID)}</span></div><div class="text-xs text-slate-500 mt-1">${escHtml(row.DepartmentName)} / ${escHtml(row.SafetyUnitName)} · ทีม ${n(row.TeamCount)} คน · ${escHtml(row.EffectiveFrom)} → ${escHtml(row.EffectiveTo||'ไม่มีกำหนด')}</div><div class="flex flex-wrap gap-2 mt-2"><span class="rounded-full px-2 py-1 text-[10px] font-black ${active?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${escHtml(row.Status)}</span><span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">KPI ${n(row.KpiRequired)?'Required':'ไม่บังคับ'}</span><span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">Self-service ${n(row.AllowSelfManage)?'เปิด':'ล็อก'}</span></div></div><div class="flex flex-wrap items-center gap-2"><button data-inspector-open="${row.id}" class="rounded-xl bg-sky-600 px-3 py-2 text-xs font-black text-white">ทีม / ตารางตรวจ</button><button data-inspector-toggle-self="${row.id}" class="rounded-xl border px-3 py-2 text-xs font-bold text-slate-700">${n(row.AllowSelfManage)?'ล็อกทีม':'เปิดจัดทีม'}</button><button data-inspector-toggle-kpi="${row.id}" class="rounded-xl border px-3 py-2 text-xs font-bold text-slate-700">${n(row.KpiRequired)?'พัก KPI':'เปิด KPI'}</button><button data-inspector-toggle-status="${row.id}" class="rounded-xl border ${active?'border-amber-200 text-amber-700':'border-emerald-200 text-emerald-700'} px-3 py-2 text-xs font-bold">${active?'พักผู้ตรวจ':'เปิดใช้งาน'}</button></div></div>`;}

function inspectorCompliancePanel(isAdmin){
    const data=state.inspectorCompliance||{},summary=data.summary||{},filters=state.inspectorScheduleFilters;
    const rows=data.people||[];
    const summaryKpi=kpiSemantic(summary);
    return `<section data-bbs-compliance-kpi-status="${escHtml(summaryKpi.code)}" class="rounded-2xl border border-violet-200 bg-white overflow-hidden"><div class="p-5 border-b border-violet-100 flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h3 class="font-black text-slate-800">Inspector Schedule & Compliance</h3><p class="text-xs text-slate-500 mt-1">นับตามวันที่ Admin กำหนด ผลต่อวันไม่เกินเป้าของวันนั้น และไม่แก้ย้อนหลัง</p></div><div class="flex gap-2"><select data-inspector-period="year" class="rounded-xl border px-3 py-2 text-sm">${Array.from({length:5},(_,i)=>yearNow-2+i).map(year=>`<option value="${year}" ${n(filters.year)===year?'selected':''}>${year}</option>`).join('')}</select><select data-inspector-period="month" class="rounded-xl border px-3 py-2 text-sm">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${n(filters.month)===i+1?'selected':''}>${new Date(2000,i,1).toLocaleDateString('th-TH',{month:'long'})}</option>`).join('')}</select></div></div>
      <div class="grid grid-cols-2 xl:grid-cols-5 gap-3 p-5 bg-violet-50/40">${metric('ผู้ตรวจ',n(summary.inspectors),'คนที่ต้องทำ KPI','violet')}${metric('ตรวจครบวัน',n(summary.completedDays),`จาก ${n(summary.dueDays)} วันครบกำหนด`,'emerald')}${metric('ตรวจไม่ครบ',n(summary.partialDays),'มีผลงานแต่ต่ำกว่าเป้า','amber')}${metric('ไม่ได้ตรวจ',n(summary.missedDays),'วันที่ถึงกำหนดแล้ว','rose')}${metric('ผลรวม',summaryKpi.label,summaryKpi.code==='PERCENT'?`${n(summary.numerator)}/${n(summary.denominator)} · ${summaryKpi.description}`:summaryKpi.description,summaryKpi.tone)}</div>
      <div class="overflow-x-auto" tabindex="0" role="region" aria-label="ตารางสถานะ KPI ผู้ตรวจ"><table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="text-left p-3">ผู้ตรวจ</th><th class="p-3">ครบ</th><th class="p-3">ไม่ครบ</th><th class="p-3">ไม่ได้ตรวจ</th><th class="p-3">ผลงาน/เป้า</th><th class="p-3">สถานะ KPI</th><th class="p-3"></th></tr></thead><tbody class="divide-y">${rows.map(row=>`<tr><td class="p-3"><div class="font-bold text-slate-800">${escHtml(row.inspectorName||row.inspectorEmployeeId)}</div><div class="text-xs text-slate-500">${escHtml(row.department)} / ${escHtml(row.unit)} · ${escHtml(row.inspectorEmployeeId)}</div></td><td class="p-3 text-center font-bold text-emerald-700">${n(row.completedDays)}</td><td class="p-3 text-center font-bold text-amber-700">${n(row.partialDays)}</td><td class="p-3 text-center font-bold text-rose-700">${n(row.missedDays)}</td><td class="p-3 text-center font-bold">${n(row.numerator)}/${n(row.denominator)}</td><td class="p-3 text-center">${kpiStatusBadge(row)}</td><td class="p-3 text-right"><button data-inspector-open="${row.enrollmentId}" class="min-h-11 rounded-lg border border-violet-200 px-3 py-2 text-xs font-bold text-violet-700">ดูรายวัน</button></td></tr>`).join('')||`<tr><td colspan="7" class="p-10 text-center text-slate-400">${isAdmin?'ยังไม่มีผู้ตรวจที่ต้องทำ KPI ในเดือนนี้':'ยังไม่มีตารางตรวจสำหรับคุณในเดือนนี้'}</td></tr>`}</tbody></table></div></section>`;
}

function inspectorSchedulePanel(detail,isAdmin){
    const person=detail.compliance?.people?.[0],e=detail.enrollment||{},days=person?.days||[],activeRule=(detail.rules||[]).find(row=>row.Status==='Active');
    const color={Completed:'border-emerald-200 bg-emerald-50 text-emerald-700',Partial:'border-amber-200 bg-amber-50 text-amber-700',Missed:'border-rose-200 bg-rose-50 text-rose-700',Upcoming:'border-sky-200 bg-sky-50 text-sky-700',Exempt:'border-slate-200 bg-slate-100 text-slate-500','Not scheduled':'border-slate-100 bg-white text-slate-400'};
    const labels={Completed:'ครบ',Partial:'ไม่ครบ',Missed:'ไม่ได้ตรวจ',Upcoming:'กำหนดตรวจ',Exempt:'ยกเว้น','Not scheduled':'ไม่กำหนด'};
    const today=new Date().toLocaleDateString('en-CA');
    return `<section class="rounded-2xl border border-violet-200 bg-white overflow-hidden"><div class="p-5 border-b border-violet-100"><h3 class="font-black text-slate-800">ตารางตรวจของ ${escHtml(e.EmployeeName||e.InspectorName||e.InspectorEmployeeID)}</h3><p class="text-xs text-slate-500 mt-1">${escHtml(e.DepartmentName||'')} / ${escHtml(e.SafetyUnitName||'')} · สีในปฏิทินแสดงผลจริงเทียบเป้ารายวัน</p></div>
      ${isAdmin?`<div class="grid xl:grid-cols-2 border-b"><form id="bbs-inspector-schedule-form" data-enrollment-id="${e.id||e.EnrollmentID}" class="p-5 space-y-3"><div class="font-black text-sm">สร้างตารางเวอร์ชันใหม่</div><div class="grid grid-cols-2 gap-2"><input name="scheduleName" required maxlength="120" value="${escHtml(activeRule?.ScheduleName||'ตารางตรวจปกติ')}" class="rounded-xl border px-3 py-2 text-sm" placeholder="ชื่อตาราง"><input name="targetCount" required type="number" min="1" max="20" value="${n(activeRule?.TargetCount)||1}" class="rounded-xl border px-3 py-2 text-sm" placeholder="ครั้ง/วัน"></div><div class="flex flex-wrap gap-2">${[['1','จ.'],['2','อ.'],['3','พ.'],['4','พฤ.'],['5','ศ.'],['6','ส.'],['7','อา.']].map(([value,label])=>`<label class="rounded-lg border px-2 py-1.5 text-xs"><input type="checkbox" name="weekdays" value="${value}" ${(activeRule?.Weekdays||'1,2,3,4,5').split(',').includes(value)?'checked':''}> ${label}</label>`).join('')}</div><div class="grid grid-cols-2 gap-2"><label class="text-xs font-bold">เริ่มใช้<input name="effectiveFrom" required type="date" min="${today}" value="${today}" class="mt-1 w-full rounded-xl border px-3 py-2 text-sm"></label><label class="text-xs font-bold">สิ้นสุด (ไม่บังคับ)<input name="effectiveTo" type="date" min="${today}" class="mt-1 w-full rounded-xl border px-3 py-2 text-sm"></label></div><input name="reason" required maxlength="500" class="w-full rounded-xl border px-3 py-2 text-sm" placeholder="เหตุผลการกำหนด/เปลี่ยนตาราง"><button class="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white">บันทึกเป็นเวอร์ชันใหม่</button></form>
      <form id="bbs-inspector-override-form" data-enrollment-id="${e.id||e.EnrollmentID}" class="p-5 space-y-3 border-t xl:border-t-0 xl:border-l"><div class="font-black text-sm">กำหนดเฉพาะวัน</div><div class="grid grid-cols-2 gap-2"><input name="scheduleDate" required type="date" min="${today}" value="${today}" class="rounded-xl border px-3 py-2 text-sm"><select name="overrideType" class="rounded-xl border px-3 py-2 text-sm"><option value="Exempt">ยกเว้นวันตรวจ</option><option value="Required">กำหนดให้ตรวจ</option></select></div><input name="targetCount" type="number" min="1" max="20" value="1" class="w-full rounded-xl border px-3 py-2 text-sm" placeholder="เป้าหมายครั้ง/วัน (ใช้เมื่อกำหนดให้ตรวจ)"><input name="reason" required maxlength="500" class="w-full rounded-xl border px-3 py-2 text-sm" placeholder="เหตุผล เช่น อบรม ลา หรือวันตรวจพิเศษ"><button class="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-black text-white">บันทึกวันพิเศษ</button></form></div>`:''}
      <div class="p-5"><div class="mb-4 flex items-center justify-between gap-3"><div><h4 class="font-black text-slate-800">กำหนดการรายวัน</h4><p class="mt-1 text-xs text-slate-500">Agenda เหมาะกับมือถือและแสดงเป้าหมาย ผลจริง รวมถึงเหตุผลในแต่ละวัน</p></div><div class="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="รูปแบบตารางตรวจ"><button type="button" data-inspector-schedule-mode="agenda" aria-pressed="${state.inspectorScheduleMode==='agenda'}" class="min-h-11 rounded-lg px-3 text-xs font-black ${state.inspectorScheduleMode==='agenda'?'bg-white text-violet-700 shadow-sm':'text-slate-500'}">Agenda</button><button type="button" data-inspector-schedule-mode="calendar" aria-pressed="${state.inspectorScheduleMode==='calendar'}" class="min-h-11 rounded-lg px-3 text-xs font-black ${state.inspectorScheduleMode==='calendar'?'bg-white text-violet-700 shadow-sm':'text-slate-500'}">ปฏิทิน</button></div></div>${state.inspectorScheduleMode==='agenda'?inspectorScheduleAgenda(days,e,isAdmin,color,labels):inspectorScheduleCalendar(days,e,isAdmin,color,labels)}</div></section>`;
}

function inspectorOverrideRemove(day,e,isAdmin){return isAdmin&&(day.source==='Exempt'||day.source==='Required override')?`<button type="button" data-inspector-override-remove="${day.date}" data-enrollment-id="${e.id||e.EnrollmentID}" title="ลบการกำหนดเฉพาะวัน" aria-label="ลบการกำหนดเฉพาะวันที่ ${fmtDate(day.date)}" class="min-h-11 min-w-11 rounded-lg border border-current/20 text-lg">×</button>`:'';}
function inspectorScheduleAgenda(days,e,isAdmin,color,labels){if(!days.length)return'<div class="p-8 text-center text-sm text-slate-400">ไม่มีวันในช่วงที่เลือก</div>';return`<div data-inspector-agenda class="space-y-2">${days.map(day=>{const date=new Date(`${day.date}T00:00:00`),weekday=date.toLocaleDateString('th-TH',{weekday:'short'});return`<article class="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 ${color[day.status]||color['Not scheduled']}"><div class="rounded-xl bg-white/70 py-2 text-center"><div class="text-[10px] font-bold">${escHtml(weekday)}</div><div class="text-xl font-black">${n(day.date.slice(8))}</div></div><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="font-black">${escHtml(labels[day.status]||day.status)}</span><span class="rounded-full bg-white/70 px-2 py-1 text-[10px] font-bold">${day.target?`${n(day.actual)}/${n(day.target)} ครั้ง`:'ไม่มีเป้าหมาย'}</span></div><div class="mt-1 text-xs">${escHtml(day.source||'Schedule')}</div>${day.reason?`<p class="mt-1 text-xs whitespace-pre-wrap">${escHtml(day.reason)}</p>`:''}</div>${inspectorOverrideRemove(day,e,isAdmin)}</article>`;}).join('')}</div>`;}
function inspectorScheduleCalendar(days,e,isAdmin,color,labels){return`<div data-inspector-calendar class="overflow-x-auto" tabindex="0" role="region" aria-label="ปฏิทินตารางตรวจ"><div class="min-w-[700px]"><div class="mb-2 grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-slate-400">${['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'].map(v=>`<div>${v}</div>`).join('')}</div><div class="grid grid-cols-7 gap-2">${days.length?`${Array.from({length:new Date(`${days[0].date}T00:00:00`).getDay()},()=>'<div></div>').join('')}${days.map(day=>`<div class="min-h-24 rounded-xl border p-2 ${color[day.status]||color['Not scheduled']}"><div class="flex justify-between gap-1"><span class="font-black">${n(day.date.slice(8))}</span>${inspectorOverrideRemove(day,e,isAdmin)}</div><div class="mt-2 text-[10px] font-bold">${labels[day.status]||day.status}</div>${day.target?`<div class="mt-1 text-[10px]">${n(day.actual)}/${n(day.target)} ครั้ง</div>`:''}${day.reason?`<div class="mt-1 truncate text-[9px]" title="${escHtml(day.reason)}">${escHtml(day.reason)}</div>`:''}</div>`).join('')}`:'<div class="col-span-7 p-8 text-center text-sm text-slate-400">ไม่มีวันในช่วงที่เลือก</div>'}</div></div></div>`;}

function inspectorTeamPanel(data,isAdmin){const e=data.enrollment||{},coverage=data.coverage||{},canManage=isAdmin||data.canSelfManage;const unassigned=(data.available||[]).filter(row=>!row.CurrentSupervisorID);return `<section class="rounded-2xl border border-sky-200 bg-white overflow-hidden"><div class="p-5 border-b border-sky-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div><h3 class="font-black text-slate-800">ทีมของ ${escHtml(e.EmployeeName||state.context?.employee?.EmployeeName||e.InspectorEmployeeID)}</h3><p class="text-xs text-slate-500 mt-1">${escHtml(e.DepartmentName||'')} / ${escHtml(e.SafetyUnitName||'')} · สมาชิกหนึ่งคนมีหัวหน้าหลักได้หนึ่งคน</p></div><div class="grid grid-cols-2 gap-2 text-center"><div class="rounded-xl bg-sky-50 px-4 py-2"><div class="text-xl font-black text-sky-700">${n(coverage.observed)}/${n(coverage.total)}</div><div class="text-[10px] text-slate-500">ตรวจแล้วเดือนนี้</div></div><div class="rounded-xl bg-emerald-50 px-4 py-2"><div class="text-xl font-black text-emerald-700">${n(coverage.percentage)}%</div><div class="text-[10px] text-slate-500">Team Coverage</div></div></div></div>
      ${canManage?`<form id="bbs-inspector-team-add" data-enrollment-id="${e.id}" class="p-5 border-b bg-slate-50 grid md:grid-cols-[1fr_auto] gap-3"><select name="memberEmployeeId" required class="rounded-xl border px-3 py-2.5 text-sm"><option value="">เลือก Operator ที่ยังไม่มีหัวหน้าหลัก (${unassigned.length} คน)</option>${unassigned.map(row=>`<option value="${escHtml(row.EmployeeID)}">${escHtml(row.EmployeeName)} · ${escHtml(row.EmployeeID)}</option>`).join('')}</select><button ${unassigned.length?'':'disabled'} class="rounded-xl bg-sky-600 disabled:bg-slate-300 px-4 py-2.5 text-sm font-black text-white">+ เพิ่มเข้าทีม</button></form>`:`<div class="p-4 border-b bg-amber-50 text-xs font-bold text-amber-700">Admin ล็อกการจัดทีมด้วยตนเอง กรุณาติดต่อ Admin เมื่อต้องการเปลี่ยนสมาชิก</div>`}
      <div class="grid xl:grid-cols-2"><div><div class="px-5 py-3 bg-slate-50 text-xs font-black text-slate-600">สมาชิกปัจจุบัน</div><div class="divide-y">${(data.team||[]).map(row=>`<div class="p-4 flex items-center justify-between gap-3"><div><div class="font-bold text-slate-800">${escHtml(row.EmployeeName)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(row.EmployeeID)} · ตรวจเดือนนี้ ${n(row.SubmittedCount)} ครั้ง${row.LastObservedAt?` · ล่าสุด ${new Date(row.LastObservedAt).toLocaleDateString('th-TH')}`:''}</div></div>${canManage?`<button data-inspector-remove="${row.AssignmentID}" data-enrollment-id="${e.id}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">นำออก</button>`:''}</div>`).join('')||'<div class="p-8 text-center text-sm text-slate-400">ยังไม่มีสมาชิกในทีม</div>'}</div></div><div class="border-t xl:border-t-0 xl:border-l"><div class="px-5 py-3 bg-slate-50 text-xs font-black text-slate-600">พนักงานที่มีหัวหน้ากลุ่มอื่นแล้ว</div><div class="divide-y max-h-80 overflow-y-auto">${(data.available||[]).filter(row=>row.CurrentSupervisorID&&String(row.CurrentSupervisorID)!==String(e.InspectorEmployeeID)).map(row=>`<div class="p-4"><div class="font-bold text-slate-700">${escHtml(row.EmployeeName)} · ${escHtml(row.EmployeeID)}</div><div class="text-xs text-amber-600 mt-1">อยู่ในทีม ${escHtml(row.CurrentSupervisorName||row.CurrentSupervisorID)} — Admin ต้องเป็นผู้ย้าย</div></div>`).join('')||'<div class="p-8 text-center text-sm text-slate-400">ไม่มีสมาชิกที่ซ้ำกับทีมอื่น</div>'}</div></div></div>
    </section>`;}

function communityView() {
    const dashboard=state.community||{},cards=state.departmentCards||{},summary=dashboard.summary||{},canRisk=Boolean(dashboard.permissions?.viewRisky);
    if(dashboard.enabled===false)return empty('Community Report ปิดใช้งานชั่วคราว','Admin สามารถเปิดใช้งานได้เมื่อการตั้งค่าพร้อม');
    return `<div class="space-y-5">
      <section class="grid grid-cols-2 ${canRisk?'xl:grid-cols-4':'xl:grid-cols-2'} gap-3">
        ${metric('พฤติกรรมดี',n(summary.good),'เปิดให้พนักงานทุกคนเห็น','emerald')}
        ${metric('แบบบัตรแผนก',n(cards.templates?.length),escHtml(cards.department?.Name||'ยังไม่ผูกแผนก'),'sky')}
        ${canRisk?metric('พฤติกรรมเสี่ยง',n(summary.risky),'Admin เท่านั้น','rose'):''}
        ${canRisk?metric('Action ที่ยังเปิด',n(summary.openActions),`เกินกำหนด ${n(summary.overdue)}`,'amber'):''}
      </section>
      <section class="grid xl:grid-cols-5 gap-5">
        <form id="bbs-community-form" class="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div><h3 class="font-black text-slate-800">แจ้งพฤติกรรมดี / เสี่ยง</h3><p class="text-xs text-slate-500 mt-1">ผู้ถูกสังเกตไม่บังคับ และ Community Report ไม่นับ KPI การตรวจอย่างเป็นทางการ</p></div>
          <div class="grid grid-cols-2 gap-2">${[['Good','พฤติกรรมดี','emerald'],['Risky','พฤติกรรมเสี่ยง','rose']].map(([value,label,color])=>`<label class="rounded-xl border p-3 flex items-center gap-2 text-sm font-bold text-${color}-700"><input type="radio" name="reportType" value="${value}" ${value==='Good'?'checked':''}> ${label}</label>`).join('')}</div>
          <select name="observedEmployeeId" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">ไม่ทราบชื่อ / รายงานพื้นที่</option>${(state.communityEmployees.rows||[]).map(row=>`<option value="${escHtml(row.EmployeeID)}">${escHtml(row.EmployeeName)} · ${escHtml(row.EmployeeID)}</option>`).join('')}</select>
          <div class="grid grid-cols-2 gap-2"><select name="safetyUnitId" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">ไม่ระบุ Unit</option>${(state.communityEmployees.units||[]).map(row=>`<option value="${row.id}">${escHtml(row.name)}</option>`).join('')}</select><input name="areaText" maxlength="255" placeholder="พื้นที่ (ถ้ามี)" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"></div>
          <textarea name="description" required maxlength="8000" rows="4" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="อธิบายพฤติกรรมหรือสิ่งที่พบ"></textarea>
          <label class="block rounded-xl border border-dashed border-slate-300 p-3 text-xs font-bold text-slate-600">แนบรูป (ถ้ามี) JPG/PNG/WebP ≤ 10 MB<input name="evidence" type="file" accept="image/jpeg,image/png,image/webp" class="block mt-2 w-full text-xs font-normal"></label>
          <button ${cards.canReport?'':'disabled'} class="w-full rounded-xl bg-emerald-600 disabled:bg-slate-300 px-4 py-3 text-sm font-black text-white">ส่ง Community Report</button>${cards.canReport?'':`<p class="text-xs text-amber-700">ยังไม่มี QR กลางที่ Active สำหรับแผนกนี้ กรุณาติดต่อ Admin</p>`}
        </form>
        <div class="xl:col-span-3 rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b space-y-3"><div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h3 class="font-black text-slate-800">พฤติกรรมดีล่าสุด</h3><p class="text-xs text-slate-500 mt-1">เปิดให้ผู้ใช้ที่เข้าสู่ระบบทุกคนเห็น โดยไม่แสดงชื่อผู้แจ้ง</p></div>${communityPeriodFilters()}</div>${communityListFilters()}</div><div class="divide-y max-h-[34rem] overflow-y-auto">${(dashboard.good||[]).map(goodCommunityRow).join('')||'<div class="p-10 text-center text-sm text-slate-400">ยังไม่มีรายงานพฤติกรรมดีในช่วงนี้</div>'}</div>${listPager('community-good',dashboard.pagination?.good,'รายงานดี')}</div>
      </section>
      ${departmentTemplateGallery(cards)}
      ${canRisk?adminRiskPanel(dashboard):''}
    </div>`;
}

function communityPeriodFilters(){return `<div class="flex gap-2"><select data-community-filter="year" class="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option ${n(state.communityFilters.year)===yearNow?'selected':''}>${yearNow}</option><option ${n(state.communityFilters.year)===yearNow-1?'selected':''}>${yearNow-1}</option></select><select data-community-filter="month" class="rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="0">ทั้งปี</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${n(state.communityFilters.month)===i+1?'selected':''}>เดือน ${i+1}</option>`).join('')}</select></div>`;}
function communityListFilters(){const f=state.communityFilters,units=(state.masterReference?.units||[]).filter(row=>!f.departmentId||n(row.department_id||row.DepartmentID)===n(f.departmentId));return`<div class="grid sm:grid-cols-3 gap-2"><input data-list-search="community" value="${escHtml(f.q)}" type="search" placeholder="ค้นหาเลขรายงาน พื้นที่ หรือรายละเอียด" class="rounded-xl border px-3 py-2.5 text-sm"><select data-community-filter="departmentId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกแผนก</option>${masterFilterOptions(f.departmentId)}</select><select data-community-filter="safetyUnitId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุก Unit</option>${units.map(row=>`<option value="${n(row.id)}" ${n(f.safetyUnitId)===n(row.id)?'selected':''}>${escHtml(row.name||row.Name)}</option>`).join('')}</select></div>`;}
function goodCommunityRow(row){return `<div class="p-4"><div class="flex justify-between gap-3"><div class="font-bold text-slate-800">${escHtml(row.DepartmentName)}${row.SafetyUnitName?` / ${escHtml(row.SafetyUnitName)}`:''}</div><span class="text-xs text-slate-400 whitespace-nowrap">${new Date(row.CreatedAt).toLocaleString('th-TH')}</span></div><p class="text-sm text-slate-600 mt-2 whitespace-pre-wrap">${escHtml(row.Description)}</p><div class="text-xs text-slate-400 mt-2">${row.ObservedEmployeeName?`ผู้ถูกสังเกต ${escHtml(row.ObservedEmployeeName)}`:'ไม่ระบุผู้ถูกสังเกต'}${row.AreaText?` · พื้นที่ ${escHtml(row.AreaText)}`:''}${n(row.EvidenceCount)?` · มีหลักฐาน ${n(row.EvidenceCount)} ไฟล์`:''}</div></div>`;}
function departmentTemplateGallery(cards){return `<section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b flex justify-between gap-3"><div><h3 class="font-black text-slate-800">บัตรรายแผนก ${escHtml(cards.department?.Name||'')}</h3><p class="text-xs text-slate-500 mt-1">ทุก Template ใช้ QR กลางเดียวกัน เลือก Preview และจำนวนที่ต้องการพิมพ์</p></div><span class="text-xs font-bold ${cards.qr?'text-emerald-700':'text-amber-700'}">${cards.qr?`QR รุ่น ${n(cards.qr.Generation)}`:'ยังไม่มี QR'}</span></div><div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">${(cards.templates||[]).map(row=>`<article class="rounded-2xl border border-slate-200 p-4"><div class="font-black text-slate-800 truncate">${escHtml(row.TemplateName)}</div><div class="text-xs text-slate-500 mt-1">${n(row.WidthMM)}×${n(row.HeightMM)} mm</div><div class="grid grid-cols-[1fr_80px] gap-2 mt-4"><select data-dept-paper="${row.id}" class="rounded-xl border border-slate-200 px-2 py-2 text-xs"><option>A4</option><option>A5</option><option>A6</option></select><input data-dept-copies="${row.id}" type="number" min="1" max="100" value="1" class="rounded-xl border border-slate-200 px-2 py-2 text-xs"></div><div class="grid grid-cols-2 gap-2 mt-2"><button data-dept-template-preview="${row.id}" class="rounded-xl border px-3 py-2 text-xs font-bold text-sky-700">Preview</button><button data-dept-template-print="${row.id}" ${cards.qr?'':'disabled'} class="rounded-xl bg-emerald-600 disabled:bg-slate-300 px-3 py-2 text-xs font-black text-white">พิมพ์</button></div></article>`).join('')||'<div class="md:col-span-2 xl:col-span-3 p-8 text-center text-sm text-slate-400">ยังไม่มี Template ที่ Active สำหรับแผนกนี้</div>'}</div></section>`;}
function adminRiskPanel(data){const f=state.communityFilters;return `<section class="rounded-2xl border border-rose-200 bg-white overflow-hidden"><div class="p-5 border-b border-rose-100 space-y-3"><div><h3 class="font-black text-rose-800">พฤติกรรมเสี่ยงและ Community Action</h3><p class="text-xs text-rose-600 mt-1">เฉพาะ Admin · เปิดรายละเอียดเพื่อดูหลักฐานและประวัติ Action ครบถ้วน</p></div><div class="grid sm:grid-cols-2 gap-2"><select data-community-filter="actionStatus" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกสถานะ Action</option>${['Open','In Progress','Closed','Reopened'].map(v=>`<option ${f.actionStatus===v?'selected':''}>${v}</option>`).join('')}</select><select data-community-filter="priority" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุก Priority</option>${['Critical','High','Medium','Low'].map(v=>`<option ${f.priority===v?'selected':''}>${v}</option>`).join('')}</select></div></div><div class="divide-y max-h-96 overflow-y-auto">${(data.risky||[]).map(row=>`<article class="p-4 grid lg:grid-cols-[1fr_auto] gap-3"><div><div class="font-bold text-slate-800">${escHtml(row.ReportNo)} · ${escHtml(row.DepartmentName)}</div><p class="text-sm text-slate-600 mt-1">${escHtml(row.Description)}</p><div class="text-xs text-slate-400 mt-2">ผู้แจ้ง ${escHtml(row.ReporterName)} · ${row.ObservedEmployeeName?`ผู้ถูกสังเกต ${escHtml(row.ObservedEmployeeName)}`:'ไม่ระบุผู้ถูกสังเกต'}</div></div><div class="text-left lg:text-right text-xs"><span class="inline-flex rounded-full bg-rose-100 px-2 py-1 font-bold text-rose-700">${escHtml(row.ActionStatus||'Open')}</span><div class="mt-2 text-slate-500">ครบกำหนด ${fmtDate(row.DueDate)}</div><button type="button" data-community-risk-detail="${row.id}" class="mt-2 min-h-11 rounded-xl border border-rose-200 px-4 py-2 font-black text-rose-700">ดูหลักฐาน / ประวัติ</button></div></article>`).join('')||'<div class="p-8 text-center text-sm text-slate-400">ไม่มีรายงานเสี่ยงในช่วงนี้</div>'}</div>${listPager('community-risky',data.pagination?.risky,'รายงานเสี่ยง')}</section>`;}

function analyticsQuery(extra = {}) {
    const filter = { ...state.analyticsFilters, ...extra };
    const query = new URLSearchParams({ year:String(filter.year || yearNow), month:String(filter.month || 0) });
    ['scope','departmentId','safetyUnitId','risk'].forEach(key => { if (filter[key] !== '' && filter[key] !== null && filter[key] !== undefined) query.set(key, String(filter[key])); });
    return query;
}

function analyticsMetric(label, value, detail, tone='emerald', drilldown='') {
    const colors={emerald:'border-emerald-200 bg-emerald-50 text-emerald-800',sky:'border-sky-200 bg-sky-50 text-sky-800',rose:'border-rose-200 bg-rose-50 text-rose-800',amber:'border-amber-200 bg-amber-50 text-amber-800',slate:'border-slate-200 bg-slate-50 text-slate-700'};
    const tag=drilldown?'button':'div';
    return `<${tag} ${drilldown?`type="button" data-analytics-drilldown="${drilldown}"`:''} class="rounded-2xl border p-4 text-left ${colors[tone]||colors.emerald}"><div class="text-xs font-bold opacity-75">${escHtml(label)}</div><div class="mt-2 text-2xl font-black">${escHtml(String(value))}</div><div class="mt-1 text-xs opacity-70">${escHtml(detail)}</div></${tag}>`;
}

function analyticsView() {
    const d=state.analytics;
    if(!d)return empty('กำลังเตรียมรายงาน','กำลังโหลดข้อมูลตามสิทธิ์และขอบเขตของคุณ');
    const f=state.analyticsFilters,o=d.options||{},units=(o.units||[]).filter(row=>!f.departmentId||n(row.department_id)===n(f.departmentId));
    const kpiView=kpiSemantic(d.kpi||{});
    const scopeLabels={personal:'ส่วนตัว',team:'ทีมของฉัน',department:'แผนก',company:'ทั้งบริษัท'};
    return `<div class="space-y-5">
      <section class="rounded-2xl border border-slate-200 bg-white p-4" data-analytics-controls><div class="flex flex-col xl:flex-row xl:items-end justify-between gap-4"><div><h3 class="font-black text-slate-800">Management Analytics</h3><p class="mt-1 text-xs text-slate-500">ตัวเลขและ Export ใช้สูตรและ scope เดียวกันจาก Server · ข้อมูลถึง ${fmtDate(d.meta?.periodThrough)}</p></div>${d.permissions?.canExport?'<div class="flex flex-wrap gap-2"><button data-analytics-export="excel" class="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700">Excel</button><button data-analytics-export="pdf" class="rounded-xl border border-sky-200 px-3 py-2 text-xs font-black text-sky-700">PDF</button><button data-analytics-export="print" class="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Print</button></div>':''}</div>
        <div class="mt-4 grid grid-cols-2 lg:grid-cols-6 gap-2"><select data-analytics-filter="scope" class="rounded-xl border px-3 py-2.5 text-sm">${(o.scopes||[]).map(v=>`<option value="${v}" ${f.scope===v?'selected':''}>${scopeLabels[v]||v}</option>`).join('')}</select><select data-analytics-filter="year" class="rounded-xl border px-3 py-2.5 text-sm">${Array.from({length:Math.max(1,n(o.years?.max)-n(o.years?.min)+1)},(_,i)=>n(o.years?.max)-i).map(v=>`<option ${n(f.year)===v?'selected':''}>${v}</option>`).join('')}</select><select data-analytics-filter="month" class="rounded-xl border px-3 py-2.5 text-sm"><option value="0">ทั้งปี</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${n(f.month)===i+1?'selected':''}>${new Date(2000,i,1).toLocaleString('th-TH',{month:'long'})}</option>`).join('')}</select><select data-analytics-filter="departmentId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกแผนกที่มีสิทธิ์</option>${(o.departments||[]).map(row=>`<option value="${row.id}" ${n(f.departmentId)===n(row.id)?'selected':''}>${escHtml(row.Name)}</option>`).join('')}</select><select data-analytics-filter="safetyUnitId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุก Unit ที่มีสิทธิ์</option>${units.map(row=>`<option value="${row.id}" ${n(f.safetyUnitId)===n(row.id)?'selected':''}>${escHtml(row.name)}</option>`).join('')}</select><select data-analytics-filter="risk" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกระดับความเสี่ยง</option>${(o.risks||[]).map(v=>`<option ${f.risk===v?'selected':''}>${v}</option>`).join('')}</select></div>
      </section>
      <div id="bbs-analytics-report" class="space-y-5 bg-white print:p-4">
        <section data-bbs-analytics-kpi-status="${escHtml(kpiView.code)}" class="grid grid-cols-2 xl:grid-cols-6 gap-3">${analyticsMetric('KPI Completion',kpiView.label,kpiView.code==='PERCENT'?`${n(d.kpi?.numerator)}/${n(d.kpi?.denominator)} · ผ่าน ${n(d.kpi?.peopleMeeting)}/${n(d.kpi?.peopleTotal)} คน`:kpiView.description,kpiView.tone)}${analyticsMetric('Observation',n(d.totals?.observations),'Submitted เท่านั้น','sky','observations')}${analyticsMetric('Safe',n(d.totals?.safe),'คำตอบ Safe','emerald','safe')}${analyticsMetric('Unsafe',n(d.totals?.unsafe),`${n(d.totals?.unsafeRate)}% ของ Safe+Unsafe`,'rose','unsafe')}${analyticsMetric('Action ค้าง',n(d.actions?.total)-n(d.actions?.closed),`ปิดแล้ว ${n(d.actions?.closed)}/${n(d.actions?.total)}`,'amber','actions')}${analyticsMetric('เกิน SLA',n(d.actions?.overdue),`เฉลี่ยปิด ${n(d.actions?.avgClosureDays)} วัน`,'rose','overdue')}</section>
        <section class="grid xl:grid-cols-2 gap-5"><div class="rounded-2xl border bg-white p-5"><h4 class="font-black text-slate-800">Safe / Unsafe Trend</h4><p class="text-xs text-slate-500 mt-1">${f.month?'รายวัน':'รายเดือน'}</p>${analyticsTrend(d.trend||[])}</div><div class="rounded-2xl border bg-white p-5"><h4 class="font-black text-slate-800">Unsafe Pareto by Category</h4><p class="text-xs text-slate-500 mt-1">เรียงจาก Unsafe สูงสุด</p>${analyticsPareto(d.pareto||[])}</div></section>
        <section class="grid xl:grid-cols-3 gap-5"><div class="xl:col-span-2 rounded-2xl border bg-white overflow-hidden"><div class="p-5 border-b"><h4 class="font-black text-slate-800">Department / Unit Heatmap</h4><p class="text-xs text-slate-500 mt-1">สีเข้มขึ้นเมื่อ Unsafe rate สูง</p></div>${analyticsComparison(d.comparison||[])}</div><div class="rounded-2xl border bg-white p-5"><h4 class="font-black text-slate-800">Action Aging</h4><div class="mt-4 space-y-3">${(d.actions?.aging||[]).map(row=>analyticsBar(row.bucket,n(row.count),Math.max(1,...(d.actions?.aging||[]).map(x=>n(x.count))),'bg-amber-500')).join('')}</div><div class="mt-5 grid grid-cols-2 gap-2 text-xs">${[['Open',d.actions?.open],['In Progress',d.actions?.inProgress],['Pending Verify',d.actions?.pendingVerification],['Closed',d.actions?.closed]].map(([label,value])=>`<div class="rounded-xl bg-slate-50 p-3"><div class="text-slate-500">${label}</div><div class="mt-1 text-lg font-black text-slate-800">${n(value)}</div></div>`).join('')}</div></div></section>
        <section class="rounded-2xl border bg-white overflow-hidden"><div class="p-5 border-b"><h4 class="font-black text-slate-800">Observation ล่าสุด</h4><p class="text-xs text-slate-500 mt-1">Drill-down ตาม scope ที่ Server อนุญาต</p></div>${analyticsRecent(d.recent||[])}</section>
      </div>
    </div>`;
}

function analyticsTrend(rows){if(!rows.length)return'<div class="py-12 text-center text-sm text-slate-400">ไม่มีข้อมูลในช่วงนี้</div>';const max=Math.max(1,...rows.map(r=>n(r.safe)+n(r.unsafe)));return`<div class="mt-5 flex items-end gap-2 h-48 overflow-x-auto">${rows.map(row=>`<div class="min-w-8 flex-1 h-full flex flex-col justify-end items-center"><div class="w-full flex items-end justify-center gap-px" style="height:${Math.max(6,((n(row.safe)+n(row.unsafe))/max)*150)}px"><div title="Safe ${n(row.safe)}" class="w-1/2 bg-emerald-500 rounded-t" style="height:${Math.max(2,n(row.safe)/max*150)}px"></div><div title="Unsafe ${n(row.unsafe)}" class="w-1/2 bg-rose-500 rounded-t" style="height:${Math.max(2,n(row.unsafe)/max*150)}px"></div></div><div class="mt-2 text-[10px] text-slate-500">${escHtml(row.label)}</div></div>`).join('')}</div><div class="mt-3 flex gap-4 text-xs"><span class="text-emerald-700">● Safe</span><span class="text-rose-700">● Unsafe</span></div>`;}
function analyticsBar(label,value,max,tone='bg-rose-500'){return`<div><div class="flex justify-between gap-3 text-xs"><span class="font-bold text-slate-600 truncate">${escHtml(label||'-')}</span><span class="font-black text-slate-700">${value}</span></div><div class="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full ${tone} rounded-full" style="width:${Math.min(100,n(value)*100/Math.max(1,n(max)))}%"></div></div></div>`;}
function analyticsPareto(rows){if(!rows.length)return'<div class="py-12 text-center text-sm text-slate-400">ไม่มี Unsafe category</div>';const max=Math.max(1,...rows.map(r=>n(r.unsafe)));return`<div class="mt-5 space-y-3">${rows.slice(0,8).map(row=>analyticsBar(`${row.category} (${n(row.unsafeRate)}%)`,n(row.unsafe),max)).join('')}</div>`;}
function analyticsComparison(rows){if(!rows.length)return'<div class="p-10 text-center text-sm text-slate-400">ไม่มีข้อมูลเปรียบเทียบ</div>';return`<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="p-3 text-left">แผนก / Unit</th><th class="p-3 text-right">Obs.</th><th class="p-3 text-right">Unsafe</th><th class="p-3 text-right">Unsafe %</th><th class="p-3 text-right">Action ค้าง</th><th class="p-3 text-right">เกิน SLA</th></tr></thead><tbody class="divide-y">${rows.map(row=>`<tr style="background:rgba(244,63,94,${Math.min(.18,n(row.unsafeRate)/500)})"><td class="p-3"><div class="font-bold text-slate-700">${escHtml(row.department)}</div><div class="text-xs text-slate-400">${escHtml(row.unit)}</div></td><td class="p-3 text-right">${n(row.observations)}</td><td class="p-3 text-right font-bold text-rose-700">${n(row.unsafe)}</td><td class="p-3 text-right">${n(row.unsafeRate)}%</td><td class="p-3 text-right">${n(row.actionOpen)}</td><td class="p-3 text-right font-bold ${n(row.actionOverdue)?'text-rose-700':''}">${n(row.actionOverdue)}</td></tr>`).join('')}</tbody></table></div>`;}
function analyticsRecent(rows){if(!rows.length)return'<div class="p-10 text-center text-sm text-slate-400">ไม่มี Observation</div>';return`<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="p-3 text-left">วันที่ / เลขที่</th><th class="p-3 text-left">ผู้ตรวจ</th><th class="p-3 text-left">ผู้ถูกตรวจ</th><th class="p-3 text-left">แผนก / Unit</th><th class="p-3 text-right">Safe</th><th class="p-3 text-right">Unsafe</th><th class="p-3 text-right">Action</th></tr></thead><tbody class="divide-y">${rows.map(row=>`<tr><td class="p-3"><button data-bbs-detail="${row.id}" class="font-bold text-sky-700">${escHtml(row.ObservationNo)}</button><div class="text-xs text-slate-400">${fmtDate(row.ObservationDate)}</div></td><td class="p-3">${escHtml(row.ObserverNameSnapshot)}</td><td class="p-3">${escHtml(row.ObservedNameSnapshot)}</td><td class="p-3">${escHtml(row.ObservedDepartmentSnapshot||'-')}<div class="text-xs text-slate-400">${escHtml(row.ObservedUnitSnapshot||'-')}</div></td><td class="p-3 text-right text-emerald-700 font-bold">${n(row.SafeCount)}</td><td class="p-3 text-right text-rose-700 font-bold">${n(row.UnsafeCount)}</td><td class="p-3 text-right">${n(row.OpenActions)}</td></tr>`).join('')}</tbody></table></div>`;}

function actionBadge(value) {
    const tone = { Open:'bg-slate-100 text-slate-700', 'In Progress':'bg-sky-100 text-sky-700', 'Pending Verification':'bg-amber-100 text-amber-700', Closed:'bg-emerald-100 text-emerald-700', Reopened:'bg-rose-100 text-rose-700' };
    return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone[value] || 'bg-slate-100 text-slate-600'}">${escHtml(value || '-')}</span>`;
}

function actionsView() {
    const s = state.actionSummary || {};
    const admin = Boolean(state.context?.permissions?.configure);
    return `<div class="space-y-5">
      <section class="grid grid-cols-2 xl:grid-cols-6 gap-3">
        ${metric('ทั้งหมด', n(s.Total), 'ตามสิทธิ์ที่มองเห็น', 'sky')}
        ${metric('Open', n(s.OpenCount), 'ยังไม่เริ่ม', 'sky')}
        ${metric('กำลังแก้ไข', n(s.InProgressCount), 'In Progress', 'sky')}
        ${metric('รอยืนยัน', n(s.PendingVerificationCount), 'Pending Verification', 'sky')}
        ${metric('เกินกำหนด', n(s.OverdueCount), 'ต้องเร่งติดตาม', 'rose')}
        ${metric('ปิดแล้ว', n(s.ClosedCount), 'Verified & Closed', 'emerald')}
      </section>
      <section class="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div class="p-5 border-b space-y-4"><div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div><h3 class="font-black text-slate-800">Corrective Action / SLA</h3><p class="text-xs text-slate-500 mt-1">Unsafe ที่กำหนดให้ติดตามจะสร้าง Action อัตโนมัติ</p></div>${admin ? '<button type="button" data-action-reminder class="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white">จัดคิว Reminder / Escalation</button>' : ''}</div>
          <div class="grid sm:grid-cols-3 xl:grid-cols-4 gap-2"><select data-action-filter="scope" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all">ทั้งหมดที่มองเห็น</option><option value="mine" ${state.actionScope==='mine'?'selected':''}>ฉันรับผิดชอบ</option><option value="verify" ${state.actionScope==='verify'?'selected':''}>ฉันต้องยืนยัน</option><option value="overdue" ${state.actionScope==='overdue'?'selected':''}>เกินกำหนด</option></select><select data-action-filter="status" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">ทุกสถานะ</option>${['Open','In Progress','Pending Verification','Closed','Reopened'].map(v=>`<option ${state.actionStatus===v?'selected':''}>${v}</option>`).join('')}</select><select data-action-filter="priority" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">ทุก Priority</option>${['Critical','High','Medium','Low'].map(v=>`<option ${state.actionPriority===v?'selected':''}>${v}</option>`).join('')}</select><select data-action-list-filter="year" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกปี</option>${[yearNow,yearNow-1,yearNow-2].map(v=>`<option value="${v}" ${n(state.actionFilters.year)===v?'selected':''}>${v}</option>`).join('')}</select><input data-list-search="actions" value="${escHtml(state.actionFilters.q)}" type="search" placeholder="ค้นหา Action, พนักงาน หรือรายการตรวจ" class="rounded-xl border px-3 py-2.5 text-sm"><select data-action-list-filter="departmentId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกแผนก</option>${masterFilterOptions(state.actionFilters.departmentId)}</select><select data-action-list-filter="safetyUnitId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุก Unit</option>${masterFilterOptions(state.actionFilters.safetyUnitId,true,state.actionFilters.departmentId)}</select></div>
        </div>${actionRows()}${listPager('actions',state.listMeta.actions,'Action')}
      </section>
      ${admin ? actionOutboxView() : ''}
      ${admin ? slaView() : ''}
    </div>`;
}

function actionRows() {
    if (!state.actions.length) return `<div class="p-10 text-center text-sm text-slate-400">ไม่พบ Corrective Action ในตัวกรองนี้</div>`;
    return `<div class="divide-y">${state.actions.map(row => { const days=n(row.DaysRemaining);const overdue=row.Status!=='Closed'&&days<0;return `<button type="button" data-action-detail="${row.id}" class="w-full p-4 text-left hover:bg-slate-50 grid lg:grid-cols-[1fr_auto] gap-3"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="font-black text-slate-800">${escHtml(row.ActionNo)}</span>${actionBadge(row.Status)}<span class="rounded-full px-2 py-1 text-xs font-black ${row.Priority==='Critical'||row.Priority==='High'?'bg-rose-100 text-rose-700':'bg-slate-100 text-slate-600'}">${escHtml(row.Priority)}</span></div><div class="text-sm font-bold text-slate-700 mt-2 truncate">${escHtml(row.ItemCodeSnapshot)} · ${escHtml(row.ItemPromptSnapshot)}</div><div class="text-xs text-slate-500 mt-1">Owner: ${escHtml(row.OwnerName || row.OwnerEmployeeID)} · ${escHtml(row.ObservedDepartmentSnapshot || '-')} / ${escHtml(row.ObservedUnitSnapshot || '-')}</div></div><div class="lg:text-right"><div class="text-sm font-black ${overdue?'text-rose-600':'text-slate-700'}">กำหนด ${fmtDate(row.DueDate)}</div><div class="text-xs mt-1 ${overdue?'text-rose-500':'text-slate-400'}">${row.Status==='Closed'?'ปิดงานแล้ว':overdue?`เกิน ${Math.abs(days)} วัน`:days===0?'ครบกำหนดวันนี้':`เหลือ ${days} วัน`}</div></div></button>`; }).join('')}</div>`;
}

function actionEmailBadge(status) {
    const tone={Queued:'bg-amber-100 text-amber-800',Sent:'bg-emerald-100 text-emerald-800',Failed:'bg-rose-100 text-rose-800'};
    return `<span class="inline-flex rounded-full px-2.5 py-1 text-xs font-black ${tone[status]||'bg-slate-100 text-slate-700'}">${escHtml(status||'-')}</span>`;
}

function actionOutboxView() {
    const box=state.actionOutbox||{},meta=box.meta||{},summary=meta.summary||{},f=state.actionOutboxFilters;
    const operational=meta.deliveryEnabled&&meta.smtpConfigured;
    const statusText=!meta.deliveryEnabled?'ปิดการส่งอีเมล BBS อยู่':!meta.smtpConfigured?'ยังไม่ได้ตั้งค่า SMTP':'ระบบส่งอีเมลพร้อมใช้งาน';
    const rows=(box.rows||[]).map(row=>`<article class="p-4 grid lg:grid-cols-[1fr_auto] gap-3" data-action-outbox-row="${n(row.id)}"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2">${actionEmailBadge(row.Status)}<span class="font-black text-slate-800">${escHtml(row.ActionNo||`Action #${row.ActionID}`)}</span><span class="text-xs font-bold text-slate-500">${escHtml(row.EventType)}</span></div><div class="mt-2 truncate text-sm font-bold text-slate-700">${escHtml(row.Subject)}</div><div class="mt-1 break-all text-xs text-slate-500">ถึง ${escHtml(row.Recipients)} · สร้าง ${fmtDateTime(row.CreatedAt)}</div>${row.Status==='Failed'&&row.Error?`<div role="alert" class="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">${escHtml(row.Error)}</div>`:''}</div><div class="lg:text-right text-xs text-slate-500"><div>ลองส่ง ${n(row.RetryCount)} ครั้ง</div><div class="mt-1">${row.SentAt?`ส่งเมื่อ ${fmtDateTime(row.SentAt)}`:row.LastAttemptAt?`ลองล่าสุด ${fmtDateTime(row.LastAttemptAt)}`:'ยังไม่เคยส่ง'}</div>${row.Status==='Failed'?`<button type="button" data-action-outbox-retry="${n(row.id)}" ${operational?'':'disabled'} class="mt-3 min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300" aria-label="ลองส่งอีเมล ${escHtml(row.ActionNo||row.ActionID)} อีกครั้ง">Retry</button>`:''}</div></article>`).join('');
    return `<section class="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-action-outbox><div class="p-5 border-b space-y-4"><div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3"><div><h3 class="font-black text-slate-800">Email Outbox</h3><p class="mt-1 text-xs text-slate-500">ติดตามอีเมล Corrective Action และลองส่งซ้ำเฉพาะรายการ Failed</p></div><div class="rounded-xl px-3 py-2 text-xs font-bold ${operational?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}">${statusText}</div></div><div class="grid grid-cols-2 lg:grid-cols-4 gap-2">${metric('ทั้งหมด',n(summary.Total),'Email events','sky')}${metric('Queued',n(summary.QueuedCount),'รอส่ง','amber')}${metric('Sent',n(summary.SentCount),'ส่งสำเร็จ','emerald')}${metric('Failed',n(summary.FailedCount),'ต้องตรวจสอบ','rose')}</div><div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-2"><input data-list-search="action-outbox" value="${escHtml(f.q)}" type="search" placeholder="ค้นหา Action, ผู้รับ หรือหัวข้อ" class="rounded-xl border px-3 py-2.5 text-sm"><select data-action-outbox-filter="status" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกสถานะ</option>${['Queued','Sent','Failed'].map(v=>`<option ${f.status===v?'selected':''}>${v}</option>`).join('')}</select><select data-action-outbox-filter="eventType" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุก Event</option>${(meta.eventTypes||[]).map(v=>`<option value="${escHtml(v)}" ${f.eventType===v?'selected':''}>${escHtml(v)}</option>`).join('')}</select><select data-action-outbox-filter="year" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกปี</option>${[yearNow,yearNow-1,yearNow-2].map(v=>`<option value="${v}" ${n(f.year)===v?'selected':''}>${v}</option>`).join('')}</select></div>${box.error?`<div role="alert" class="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">${escHtml(box.error)} <button type="button" data-action-outbox-reload class="ml-2 min-h-11 font-black underline">ลองโหลดอีกครั้ง</button></div>`:''}</div>${rows?`<div class="divide-y">${rows}</div>`:'<div class="p-10 text-center text-sm text-slate-400">ไม่พบรายการอีเมลในตัวกรองนี้</div>'}${listPager('action-outbox',state.listMeta.actionOutbox,'อีเมล')}</section>`;
}

function slaView() {
    return `<section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b"><h3 class="font-black text-slate-800">SLA Rules</h3><p class="text-xs text-slate-500 mt-1">มีผลกับ Action ใหม่; รายการเดิมคง Due Date เดิม</p></div><div class="grid md:grid-cols-2 xl:grid-cols-4 gap-3 p-5">${state.slaRules.map(r=>`<form data-sla-form="${escHtml(r.Priority)}" class="rounded-xl border p-4"><div class="font-black text-slate-800">${escHtml(r.Priority)}</div><label class="block text-xs text-slate-500 mt-3">SLA (วัน)<input name="slaDays" type="number" min="1" max="365" value="${n(r.SLADays)}" class="mt-1 w-full rounded-lg border px-3 py-2"></label><label class="block text-xs text-slate-500 mt-2">เตือนล่วงหน้า (วัน)<input name="nearDueDays" type="number" min="0" max="30" value="${n(r.NearDueDays)}" class="mt-1 w-full rounded-lg border px-3 py-2"></label><input type="hidden" name="rowVersion" value="${n(r.RowVersion)}"><button class="mt-3 w-full rounded-lg bg-slate-800 py-2 text-xs font-black text-white">บันทึก</button></form>`).join('')}</div></section>`;
}

function metric(label, value, detail, tone) {
    const colors = { emerald:'text-emerald-700 bg-emerald-50', sky:'text-sky-700 bg-sky-50', rose:'text-rose-700 bg-rose-50', amber:'text-amber-700 bg-amber-50', violet:'text-violet-700 bg-violet-50' };
    return `<div class="rounded-2xl border border-slate-200 bg-white p-5 min-w-0"><div class="text-xs font-bold text-slate-500">${label}</div><div class="text-3xl font-black mt-2 ${colors[tone]?.split(' ')[0] || ''}">${value}</div><div class="text-xs text-slate-400 mt-2">${detail}</div></div>`;
}

function employeeChecklistReadiness(row = {}) {
    const value = row.ChecklistReadiness;
    if (!value || typeof value !== 'object') return { ready:false, code:'UNKNOWN', message:'ยังไม่สามารถยืนยันสถานะ Checklist จาก Server ได้' };
    return { ...value, ready:value.ready === true, code:String(value.code || 'UNKNOWN') };
}

function checklistReadinessMeta(row = {}) {
    const readiness = employeeChecklistReadiness(row);
    const labels = { READY:'Ready', NO_CHECKLIST:'NO_CHECKLIST', SCOPE_MISMATCH:'Scope ไม่ตรง', VERSION_NOT_PUBLISHED:'Version ยังไม่ Published', VERSION_NOT_EFFECTIVE:'Version ยังไม่พร้อมใช้', CHECKLIST_CONFLICT:'Checklist Conflict', UNKNOWN:'ยังไม่ทราบสถานะ' };
    const ready = readiness.ready && readiness.code === 'READY';
    return {
        ...readiness,
        ready,
        label:labels[readiness.code] || readiness.code,
        badgeClass:ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800',
    };
}

function checklistReadinessBadge(row, id) {
    const readiness = checklistReadinessMeta(row);
    const detail = readiness.ready && readiness.templateName
        ? `${readiness.templateName} v${n(readiness.versionNo)}`
        : readiness.message;
    return `<div id="${id}" class="mt-3 rounded-xl border px-3 py-2 ${readiness.badgeClass}"><div class="text-[11px] font-black">${escHtml(readiness.label)}</div><div class="mt-0.5 text-[11px] leading-relaxed">${escHtml(detail || 'Server ยังไม่ยืนยัน Checklist')}</div></div>`;
}

function teamRows() {
    const rows = state.workspace?.team || [];
    if (!rows.length) return `<div class="p-8 text-center text-sm text-slate-400">ไม่มีสมาชิกใน assignment ปัจจุบัน</div>`;
    return `<div class="divide-y">${rows.map(row => { const eligible=state.eligible.find(item=>String(item.EmployeeID)===String(row.EmployeeID))||row,readiness=checklistReadinessMeta(eligible),reasonId=`bbs-team-readiness-${escHtml(row.EmployeeID)}`;return `<div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="min-w-0"><div class="font-bold text-slate-800 truncate">${escHtml(row.EmployeeName)}</div><div class="text-xs text-slate-500 truncate">${escHtml(row.EmployeeID)} · ${escHtml(row.Unit || row.Department || '-')}</div>${checklistReadinessBadge(eligible,reasonId)}</div><div class="flex items-center gap-3"><span class="text-xs text-slate-500">เดือนนี้ ${n(row.SubmittedCount)} ครั้ง</span>${state.context?.permissions?.observe ? `<button type="button" aria-describedby="${reasonId}" ${readiness.ready?'':'disabled'} class="min-h-11 rounded-xl px-3 text-xs font-bold ${readiness.ready?'text-emerald-700 hover:bg-emerald-50':'cursor-not-allowed bg-slate-100 text-slate-400'}" data-bbs-start="${escHtml(row.EmployeeID)}">${readiness.ready?'เริ่มตรวจ':'ยังตรวจไม่ได้'}</button>` : ''}</div></div>`;}).join('')}</div>`;
}

function recentRows() {
    const rows = state.workspace?.recent || [];
    if (!rows.length) return `<div class="p-8 text-center text-sm text-slate-400">ยังไม่มี Observation</div>`;
    return `<div class="divide-y">${rows.map(row => `<button type="button" data-bbs-detail="${row.id}" class="w-full text-left p-4 hover:bg-slate-50"><div class="flex justify-between gap-3"><div class="font-bold text-sm text-slate-800 truncate">${escHtml(row.ObservedNameSnapshot)}</div>${statusBadge(row.Status)}</div><div class="text-xs text-slate-400 mt-1">${escHtml(row.ObservationNo)} · ${fmtDate(row.ObservationDate)}</div></button>`).join('')}</div>`;
}

function resumableDrafts() {
    const employeeId = String(state.context?.employee?.EmployeeID || '');
    return state.ownDrafts.filter(row => row.Status === 'Draft' && String(row.ObserverEmployeeID) === employeeId);
}

function draftRecoveryPanel() {
    const rows = resumableDrafts();
    if (!rows.length) return '';
    return `<section class="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p class="text-xs font-black text-amber-700">SAVED DRAFTS</p><h3 class="mt-1 font-black text-slate-800">Resume an unfinished Observation</h3><p class="mt-1 text-xs text-slate-500">The server keeps these drafts when you change tabs or leave the form.</p></div><span class="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700">${rows.length} Draft</span></div><div class="mt-3 grid gap-2">${rows.slice(0, 5).map(row => `<div class="rounded-xl border border-amber-100 bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="min-w-0"><div class="truncate text-sm font-bold text-slate-800">${escHtml(row.ObservedNameSnapshot)}</div><div class="mt-1 text-xs text-slate-500">${escHtml(row.ObservationNo)} · ${fmtDate(row.ObservationDate)}</div></div><button type="button" data-bbs-resume="${row.id}" class="min-h-11 rounded-xl bg-amber-500 px-4 text-xs font-black text-white">Resume Draft</button></div>`).join('')}</div></section>`;
}

function startView() {
    if (!state.context?.permissions?.observe) return empty('ยังไม่มีสิทธิ์เริ่ม Observation', 'การเริ่มตรวจเปิดสำหรับ Group Leader ขึ้นไปที่มี hierarchy assignment ใน Pilot Unit ส่วนคุณยังดูประวัติที่เกี่ยวข้องกับตนเองได้');
    if (state.draft) return observationForm();
    if (state.batchDraft && state.context?.mobileObservationWizardEnabled) return batchObservationForm();
    const recovery = draftRecoveryPanel();
    if (!state.eligible.length) return `<div class="space-y-4">${recovery}${empty('ไม่พบพนักงานที่ตรวจได้', 'Admin ต้องตรวจ position mapping, eligibility และ hierarchy assignment ของ Pilot Unit')}</div>`;
    if (state.context?.batchObservationEnabled && state.context?.mobileObservationWizardEnabled) return `<div class="space-y-4">${recovery}${batchSelectorView()}</div>`;
    return `<div class="space-y-4">${recovery}<section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b"><h3 class="font-black text-slate-800">เลือกพนักงานที่ต้องการสังเกต</h3><p class="text-xs text-slate-500 mt-1">รายชื่อคำนวณจาก server ตาม assignment ที่ Active</p><label for="bbs-employee-search" class="sr-only">ค้นหาพนักงานที่ต้องการสังเกต</label><input id="bbs-employee-search" type="search" inputmode="search" class="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" placeholder="ค้นหารหัส ชื่อ Unit หรือตำแหน่ง"></div><div id="bbs-eligible-list" class="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-5">${eligibleCards(state.eligible)}</div></section></div>`;
}

function batchSelectorView() {
    const selected = new Set(state.batchSelected.map(String));
    const rows = state.eligible.filter(row => String(row.EmployeeID) !== String(state.context?.employee?.EmployeeID));
    const readyRows = rows.filter(row => checklistReadinessMeta(row).ready);
    return `<section class="rounded-2xl border border-slate-200 bg-white overflow-hidden pb-24 md:pb-0">
      <div class="p-4 md:p-5 border-b sticky top-0 bg-white z-10"><div class="flex items-start justify-between gap-3"><div><h3 class="font-black text-slate-800">งานวันนี้ · เลือกสมาชิกในทีม</h3><p class="text-xs text-slate-500 mt-1">เลือกได้เฉพาะคนที่ Server ยืนยัน Checklist ว่า Ready สูงสุด 50 คน</p><p class="mt-1 text-[11px] font-bold text-slate-400">Ready ${readyRows.length}/${rows.length} คน</p></div><span aria-live="polite" class="shrink-0 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-black">${selected.size} คน</span></div>
      <div class="flex gap-2 mt-4"><label for="bbs-batch-search" class="sr-only">ค้นหาสมาชิกในทีม</label><input id="bbs-batch-search" type="search" inputmode="search" class="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-base" placeholder="ค้นหารหัส ชื่อ Unit หรือตำแหน่ง"><button type="button" data-batch-select-all aria-pressed="${readyRows.length > 0 && readyRows.every(row => selected.has(String(row.EmployeeID))) ? 'true' : 'false'}" class="min-h-11 rounded-xl border border-emerald-300 px-3 text-xs font-black text-emerald-700">เลือก Ready ทั้งหมด</button></div></div>
      <div id="bbs-batch-list" class="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-4 md:p-5">${rows.map(row => {const readiness=checklistReadinessMeta(row),reasonId=`bbs-batch-readiness-${escHtml(row.EmployeeID)}`;return `<article data-search="${escHtml([row.EmployeeID,row.EmployeeName,row.Department,row.Unit,row.Position,readiness.label].join(' ').toLowerCase())}" class="rounded-2xl border ${selected.has(String(row.EmployeeID)) ? 'border-emerald-500 bg-emerald-50' : readiness.ready?'border-slate-200':'border-amber-200 bg-slate-50'} p-4 ${readiness.ready?'':'opacity-80'}"><label class="flex gap-3 ${readiness.ready?'cursor-pointer':'cursor-not-allowed'}"><input type="checkbox" aria-describedby="${reasonId}" data-batch-employee="${escHtml(row.EmployeeID)}" ${selected.has(String(row.EmployeeID))?'checked':''} ${readiness.ready?'':'disabled'} class="mt-1 h-5 w-5 accent-emerald-600 disabled:cursor-not-allowed"><span class="min-w-0"><span class="block font-black text-slate-800 truncate">${escHtml(row.EmployeeName)}</span><span class="block text-xs font-bold text-emerald-700 mt-1">${escHtml(row.EmployeeID)} · ${escHtml(row.BBSLevel||'-')}</span><span class="block text-xs text-slate-500 mt-2 truncate">${escHtml(row.Department||'-')} / ${escHtml(row.Unit||'-')}</span></span></label>${checklistReadinessBadge(row,reasonId)}<button type="button" aria-describedby="${reasonId}" ${readiness.ready?'':'disabled'} data-bbs-start="${escHtml(row.EmployeeID)}" class="mt-3 min-h-11 w-full rounded-xl text-xs font-black ${readiness.ready?'bg-slate-100 text-slate-700':'cursor-not-allowed bg-slate-200 text-slate-400'}">${readiness.ready?'ตรวจคนเดียว':'ยังตรวจไม่ได้'}</button></article>`;}).join('')}</div>
      <div data-bbs-sticky-actions aria-label="คำสั่งเลือกรายชื่อ" class="fixed md:sticky bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]"><div class="max-w-3xl mx-auto flex gap-3 items-center"><div aria-live="polite" class="flex-1 text-sm"><strong>${selected.size} คน</strong><span class="text-slate-500 block text-xs">ต้องเลือกอย่างน้อย 2 คน</span></div><button type="button" data-batch-create ${selected.size<2?'disabled':''} class="min-h-12 rounded-xl px-5 font-black text-white ${selected.size<2?'bg-slate-300':'bg-emerald-600'}">เริ่มตรวจพร้อมกัน</button></div></div>
    </section>`;
}

function batchObservationForm() {
    const batch=state.batchDraft,groups=batch.groups||[],maxStep=groups.length+1,step=Math.max(1,Math.min(maxStep,state.batchStep||1)),review=step===maxStep,group=review?null:groups[step-1];
    const percent=Math.round((step/maxStep)*100);
    return `<section class="space-y-4 pb-28"><div class="rounded-2xl border border-emerald-200 bg-white p-4 md:p-5 sticky top-0 z-20 shadow-sm"><div class="flex justify-between gap-3"><div><p class="text-xs font-black text-emerald-700">${escHtml(batch.BatchNo)} · ${n(batch.EmployeeCount)} คน</p><h3 class="font-black text-slate-800 mt-1">${review?'ตรวจทานก่อนส่ง':`Checklist ${step}/${groups.length}`}</h3><p class="text-xs text-slate-500 mt-1">${review?'ตรวจคำตอบ Unsafe และหลักฐานของแต่ละคน':`${escHtml(group?.templateName||'')} v${n(group?.versionNo)} · ${group?.members?.length||0} คน`}</p></div><span class="text-sm font-black text-emerald-700">${percent}%</span></div><div role="progressbar" aria-label="ความคืบหน้าการตรวจแบบกลุ่ม" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" class="h-2 rounded-full bg-slate-100 mt-3"><div class="h-full rounded-full bg-emerald-500" style="width:${percent}%"></div></div></div>
      ${review?batchReview():batchGroupForm(group)}
      <div data-bbs-sticky-actions aria-label="คำสั่งแบบตรวจกลุ่ม" class="fixed md:sticky bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]"><div class="max-w-4xl mx-auto flex gap-2"><button type="button" data-batch-back class="min-h-12 rounded-xl border px-4 font-bold text-slate-600">${step===1?'กลับเลือกรายชื่อ':'ย้อนกลับ'}</button><button type="button" data-batch-save class="min-h-12 rounded-xl border border-emerald-300 px-4 font-bold text-emerald-700">บันทึกร่าง</button><button type="button" data-batch-next class="min-h-12 flex-1 rounded-xl bg-emerald-600 px-4 font-black text-white">${review?'ส่งทั้งหมด':step===groups.length?'ตรวจทาน':'ถัดไป'}</button></div></div>
    </section>`;
}

function batchGroupForm(group) {
    const reference=group?.members?.[0]?.observation?.answers||[];
    return `<div class="space-y-4">${reference.map(item=>{
        const entries=(group.members||[]).map(member=>({member,answer:(member.observation.answers||[]).find(answer=>n(answer.ChecklistItemID)===n(item.ChecklistItemID))})).filter(entry=>entry.answer);
        const values=[...new Set(entries.map(entry=>entry.answer.Response||''))],common=values.length===1?values[0]:'';
        return `<article class="rounded-2xl border ${values.includes('Unsafe')?'border-rose-200':'border-slate-200'} bg-white p-4 md:p-5"><div class="flex gap-3"><span class="w-10 h-10 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black">${escHtml(item.ItemCodeSnapshot)}</span><div><p class="text-xs font-bold text-emerald-700">${escHtml(item.CategoryNameSnapshot)}</p><h4 class="font-bold text-slate-800 mt-1">${escHtml(item.ItemPromptSnapshot)}</h4></div></div>
        <div class="mt-4"><p class="text-xs font-bold text-slate-500 mb-2">ใช้คำตอบเดียวกับทุกคน</p><div class="grid grid-cols-3 gap-2" role="group" aria-label="คำตอบร่วมสำหรับ ${escHtml(item.ItemCodeSnapshot)}">${['Safe','Unsafe','N/A'].map(value=>`<button type="button" aria-pressed="${common===value?'true':'false'}" data-batch-common="${value}" data-checklist-item="${item.ChecklistItemID}" data-group-version="${group.checklistVersionId}" class="min-h-12 rounded-xl border text-sm font-black ${common===value?(value==='Safe'?'border-emerald-500 bg-emerald-100 text-emerald-700':value==='Unsafe'?'border-rose-500 bg-rose-100 text-rose-700':'border-slate-500 bg-slate-100'):'border-slate-200 text-slate-500'}">${value}</button>`).join('')}</div></div>
        <details class="mt-4" ${values.includes('Unsafe')||!common?'open':''}><summary class="cursor-pointer text-sm font-black text-slate-700">ปรับรายบุคคล · ${entries.length} คน</summary><div class="space-y-3 mt-3">${entries.map(({member,answer})=>batchPersonAnswer(member,answer)).join('')}</div></details></article>`;
    }).join('')}</div>`;
}

function batchPersonAnswer(member,a) {
    const response=a.Response||'',files=member.observation.files.filter(file=>n(file.AnswerID)===n(a.id));
    return `<div class="rounded-xl border ${response==='Unsafe'?'border-rose-200 bg-rose-50/40':'border-slate-200'} p-3" data-batch-answer-card="${a.id}"><div class="flex items-center justify-between gap-2"><div class="min-w-0"><div id="bbs-batch-person-${a.id}" class="font-bold text-sm text-slate-800 truncate">${escHtml(member.observation.ObservedNameSnapshot)}</div><div class="text-[11px] text-slate-500">${escHtml(member.ObservedEmployeeID)} · ${escHtml(member.observation.ObservedUnitSnapshot||'-')}</div></div><select data-batch-response="${a.id}" aria-labelledby="bbs-batch-person-${a.id}" class="min-h-11 rounded-xl border px-3 text-base"><option value="">เลือก</option>${['Safe','Unsafe','N/A'].map(value=>`<option ${response===value?'selected':''}>${value}</option>`).join('')}</select></div>
      <div class="${response==='Unsafe'?'':'hidden'} mt-3 space-y-3" data-batch-unsafe><label for="bbs-batch-remark-${a.id}" class="sr-only">หมายเหตุ Unsafe ของ ${escHtml(member.observation.ObservedNameSnapshot)}</label><textarea id="bbs-batch-remark-${a.id}" data-batch-remark="${a.id}" rows="2" class="w-full rounded-xl border border-rose-200 p-3 text-base" placeholder="หมายเหตุ Unsafe${n(a.UnsafeRequiresRemarkSnapshot)?' *':''}">${escHtml(a.Remark||'')}</textarea>${n(a.UnsafeRequiresActionSnapshot)?`<label for="bbs-batch-action-${a.id}" class="sr-only">การแก้ไขทันทีของ ${escHtml(member.observation.ObservedNameSnapshot)}</label><textarea id="bbs-batch-action-${a.id}" data-batch-action="${a.id}" rows="2" class="w-full rounded-xl border border-rose-200 p-3 text-base" placeholder="การแก้ไขทันที *">${escHtml(a.ImmediateAction||'')}</textarea>`:''}<div class="flex flex-wrap gap-2">${files.map(file=>`<span class="rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-700">${escHtml(file.OriginalName)}</span>`).join('')}<label class="min-h-11 inline-flex items-center rounded-lg border border-dashed px-3 text-xs font-black text-slate-600">+ รูปหลักฐาน<input type="file" aria-label="ถ่ายหรือเลือกรูปหลักฐานของ ${escHtml(member.observation.ObservedNameSnapshot)}" accept="image/jpeg,image/png,image/webp" capture="environment" class="sr-only" data-batch-upload="${a.id}" data-observation-id="${member.ObservationID}"></label></div></div></div>`;
}

function batchReview(){
    return `<div class="space-y-3">${(state.batchDraft.members||[]).map(member=>{const answers=member.observation.answers||[],safe=answers.filter(a=>a.Response==='Safe').length,unsafe=answers.filter(a=>a.Response==='Unsafe').length,na=answers.filter(a=>a.Response==='N/A').length,missing=answers.filter(a=>n(a.IsRequiredSnapshot)&&!a.Response).length;return `<article class="rounded-2xl border ${missing?'border-amber-300':unsafe?'border-rose-200':'border-emerald-200'} bg-white p-4"><div class="flex justify-between gap-3"><div><h4 class="font-black text-slate-800">${escHtml(member.observation.ObservedNameSnapshot)}</h4><p class="text-xs text-slate-500 mt-1">${escHtml(member.ObservedEmployeeID)} · ${escHtml(member.observation.ObservedUnitSnapshot||'-')}</p></div><span class="rounded-full px-3 py-1 text-xs font-black ${missing?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}">${missing?`ขาด ${missing} ข้อ`:'พร้อมส่ง'}</span></div><div class="grid grid-cols-3 gap-2 mt-3 text-center text-xs font-bold"><span class="rounded-lg bg-emerald-50 p-2 text-emerald-700">Safe ${safe}</span><span class="rounded-lg bg-rose-50 p-2 text-rose-700">Unsafe ${unsafe}</span><span class="rounded-lg bg-slate-100 p-2 text-slate-600">N/A ${na}</span></div></article>`;}).join('')}<label class="block rounded-2xl border bg-white p-4"><span class="text-sm font-bold text-slate-700">หมายเหตุภาพรวม</span><textarea id="bbs-batch-general" rows="3" class="mt-2 w-full rounded-xl border p-3 text-base">${escHtml(state.batchDraft.GeneralRemark||'')}</textarea></label></div>`;
}

function eligibleCards(rows) {
    return rows.filter(row => String(row.EmployeeID) !== String(state.context?.employee?.EmployeeID)).map(row => {const readiness=checklistReadinessMeta(row),reasonId=`bbs-single-readiness-${escHtml(row.EmployeeID)}`;return `<article data-search="${escHtml([row.EmployeeID,row.EmployeeName,row.Department,row.Unit,row.Position,readiness.label].join(' ').toLowerCase())}" class="rounded-2xl border p-4 ${readiness.ready?'border-slate-200':'border-amber-200 bg-slate-50'}"><div class="font-black text-slate-800">${escHtml(row.EmployeeName)}</div><div class="text-xs font-bold text-emerald-700 mt-1">${escHtml(row.EmployeeID)} · ${escHtml(row.BBSLevel || '-')}</div><div class="text-xs text-slate-500 mt-2">${escHtml(row.Department || '-')} / ${escHtml(row.Unit || '-')}</div><div class="text-xs text-slate-400 mt-1">${escHtml(row.Position || '-')}</div>${checklistReadinessBadge(row,reasonId)}<button type="button" aria-describedby="${reasonId}" ${readiness.ready?'':'disabled'} data-bbs-start="${escHtml(row.EmployeeID)}" class="mt-3 min-h-11 w-full rounded-xl text-sm font-black transition ${readiness.ready?'bg-emerald-600 text-white hover:bg-emerald-700':'cursor-not-allowed bg-slate-200 text-slate-400'}">${readiness.ready?'เริ่ม Observation':'ยังเริ่มตรวจไม่ได้'}</button></article>`;}).join('') || `<div class="col-span-full text-center p-8 text-sm text-slate-400">ไม่พบรายชื่อ</div>`;
}

function observationForm() {
    const d = state.draft;
    return `<form id="bbs-observation-form" class="space-y-4">
      <section class="rounded-2xl border border-emerald-200 bg-white p-5"><div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><p class="text-xs font-black text-emerald-700">${escHtml(d.ObservationNo)} · ${escHtml(d.Status)}</p><h3 class="text-xl font-black text-slate-800 mt-1">${escHtml(d.ObservedNameSnapshot)}</h3><p class="text-sm text-slate-500 mt-1">${escHtml(d.ObservedDepartmentSnapshot || '-')} / ${escHtml(d.ObservedUnitSnapshot || '-')} · ${escHtml(d.ObservedPositionSnapshot || '-')}</p></div><div class="text-sm"><div class="font-bold text-slate-700">${escHtml(d.TemplateName)} v${n(d.VersionNo)}</div><div class="text-xs text-slate-400 mt-1">Checklist version ถูกตรึงกับ Observation นี้</div></div></div></section>
      <div class="space-y-3">${d.answers.map(answer => answerCard(answer, d.files.filter(file => n(file.AnswerID) === n(answer.id)))).join('')}</div>
      <section class="rounded-2xl border border-slate-200 bg-white p-5"><label for="bbs-general-remark" class="text-sm font-bold text-slate-700">หมายเหตุภาพรวม</label><textarea id="bbs-general-remark" name="generalRemark" rows="3" class="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="ข้อมูลเพิ่มเติม (ถ้ามี)">${escHtml(d.GeneralRemark || '')}</textarea></section>
      <div data-bbs-sticky-actions aria-label="คำสั่ง Observation" class="sticky bottom-3 z-10 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-3 flex flex-col sm:flex-row gap-2 justify-between shadow-lg"><button type="button" data-bbs-cancel class="rounded-xl px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">กลับไปเลือกรายชื่อ</button><div class="flex flex-col sm:flex-row gap-2"><button type="button" data-bbs-save class="rounded-xl px-5 py-3 text-sm font-bold border border-emerald-300 text-emerald-700">บันทึกฉบับร่าง</button><button type="submit" class="rounded-xl px-6 py-3 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700">ส่ง Observation</button></div></div>
    </form>`;
}

function answerCard(a, files) {
    const response = a.Response || '';
    const unsafe = response === 'Unsafe';
    return `<fieldset class="rounded-2xl border ${unsafe ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-white'} p-5" data-answer-card="${a.id}"><legend class="sr-only">${escHtml(a.ItemCodeSnapshot)} ${escHtml(a.ItemPromptSnapshot)}</legend>
      <div class="flex gap-3"><div class="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-black shrink-0">${escHtml(a.ItemCodeSnapshot)}</div><div class="min-w-0"><div class="text-xs font-bold text-emerald-700">${escHtml(a.CategoryNameSnapshot)}</div><h4 class="font-bold text-slate-800 mt-1">${escHtml(a.ItemPromptSnapshot)}</h4></div></div>
      <div class="grid grid-cols-3 gap-2 mt-4" role="radiogroup" aria-label="ผลการสังเกต ${escHtml(a.ItemCodeSnapshot)}">${['Safe','Unsafe','N/A'].map(value => `<label class="min-h-12 flex items-center justify-center cursor-pointer rounded-xl border px-2 py-3 text-center text-sm font-black ${response === value ? (value === 'Safe' ? 'border-emerald-500 bg-emerald-100 text-emerald-700' : value === 'Unsafe' ? 'border-rose-500 bg-rose-100 text-rose-700' : 'border-slate-500 bg-slate-100 text-slate-700') : 'border-slate-200 text-slate-500'}"><input class="sr-only" type="radio" name="response-${a.id}" value="${value}" ${response === value ? 'checked' : ''}>${value}</label>`).join('')}</div>
      <div class="mt-4 ${unsafe ? '' : 'hidden'}" data-unsafe-fields>
        <label for="bbs-remark-${a.id}" class="text-xs font-bold text-rose-700">หมายเหตุ Unsafe ${n(a.UnsafeRequiresRemarkSnapshot) ? '*' : ''}</label><textarea id="bbs-remark-${a.id}" name="remark-${a.id}" rows="2" class="mt-1 w-full rounded-xl border border-rose-200 p-3 text-sm">${escHtml(a.Remark || '')}</textarea>
        ${n(a.UnsafeRequiresActionSnapshot) ? `<label for="bbs-action-${a.id}" class="block text-xs font-bold text-rose-700 mt-3">การแก้ไข/ป้องกันทันที *</label><textarea id="bbs-action-${a.id}" name="action-${a.id}" rows="2" class="mt-1 w-full rounded-xl border border-rose-200 p-3 text-sm">${escHtml(a.ImmediateAction || '')}</textarea>` : ''}
        <div class="mt-3"><div class="text-xs font-bold text-slate-600">หลักฐาน ${n(a.UnsafeRequiresPhotoSnapshot) ? '*' : '(ถ้ามี)'}</div><div class="flex flex-wrap gap-2 mt-2">${files.map(file => `<span class="inline-flex items-center gap-2 rounded-lg bg-sky-50 text-sky-700 px-2.5 py-1.5 text-xs"><button type="button" data-bbs-file="${file.id}">${escHtml(file.OriginalName)}</button><button type="button" aria-label="ลบหลักฐาน ${escHtml(file.OriginalName)}" data-bbs-file-delete="${file.id}" class="text-rose-500">×</button></span>`).join('')}<label data-bbs-upload-trigger="${a.id}" class="inline-flex cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-emerald-400">+ เพิ่มรูป<input type="file" aria-label="เลือกรูปหลักฐานสำหรับ ${escHtml(a.ItemCodeSnapshot)}" accept="image/jpeg,image/png,image/webp" class="sr-only" data-bbs-upload="${a.id}"></label></div></div>
      </div>
    </fieldset>`;
}

function historyView() {
    const f=state.historyFilters;
    return `<section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b space-y-3"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h3 class="font-black text-slate-800">ประวัติ Observation</h3><p class="text-xs text-slate-500 mt-1">ดูเฉพาะรายการตามสิทธิ์ของคุณ</p></div><div class="flex gap-2 overflow-x-auto" role="group" aria-label="มุมมองประวัติ">${[['observer','ที่ฉันตรวจ'],['observed','ฉันถูกตรวจ'],['team','ทีมของฉัน']].map(([key,label]) => `<button type="button" data-bbs-view="${key}" aria-pressed="${state.view===key?'true':'false'}" class="min-h-11 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${state.view === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}">${label}</button>`).join('')}</div></div><div class="grid sm:grid-cols-2 xl:grid-cols-5 gap-2"><input data-list-search="history" value="${escHtml(f.q)}" type="search" placeholder="ค้นหาเลข Observation หรือชื่อพนักงาน" class="rounded-xl border px-3 py-2.5 text-sm"><select data-history-filter="year" class="rounded-xl border px-3 py-2.5 text-sm">${[yearNow,yearNow-1,yearNow-2].map(v=>`<option value="${v}" ${state.historyYear===v?'selected':''}>${v}</option>`).join('')}</select><select data-history-filter="status" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกสถานะ</option><option ${f.status==='Draft'?'selected':''}>Draft</option><option ${f.status==='Submitted'?'selected':''}>Submitted</option></select><select data-history-filter="departmentId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกแผนก</option>${masterFilterOptions(f.departmentId)}</select><select data-history-filter="safetyUnitId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุก Unit</option>${masterFilterOptions(f.safetyUnitId,true,f.departmentId)}</select></div></div>${historyRows()}${listPager('history',state.listMeta.history,'Observation')}</section>`;
}

function masterDepartments() {
    const rows = state.masterReference?.departments || [];
    return rows.length ? rows : (state.communityAdmin?.departments || []);
}

function masterBbsLevels() {
    const rows = state.masterReference?.levels || [];
    return rows.length ? rows : ['Operator', 'Group Leader', 'Department Head', 'Section Head', 'Manager'];
}

function masterDepartmentOptions() {
    return masterDepartments().map(row => `<option value="${n(row.id)}">${escHtml(row.Name)}</option>`).join('');
}

function masterBbsLevelOptions() {
    return masterBbsLevels().map(value => `<option value="${escHtml(value)}">${escHtml(value)}</option>`).join('');
}

function cardReadiness() {
    const reference = state.masterReference || {};
    const departments = masterDepartments();
    const positions = reference.positions || [];
    const employees = reference.employees || [];
    const levels = masterBbsLevels();
    const groupLeaderIndex = levels.indexOf('Group Leader');
    const personalLevels = new Set(levels.slice(groupLeaderIndex < 0 ? 1 : groupLeaderIndex));
    const activeMappings = positions.filter(row => n(row.mapping?.IsActive) === 1);
    const personalMappings = activeMappings.filter(row => personalLevels.has(row.mapping?.BBSLevel));
    const personalTemplates = state.cardTemplates.filter(row => row.Status === 'Active');
    const departmentTemplates = (state.communityAdmin?.templates || []).filter(row => row.Status === 'Active');
    const departmentQrs = (state.communityAdmin?.qrCards || []).filter(row => row.Status === 'Active');
    const handlers = state.communityAdmin?.handlers || [];
    const configuredDepartments = new Set();
    const templateDepartments = new Set(departmentTemplates.map(row => n(row.DepartmentID)));
    const qrDepartments = new Set(departmentQrs.map(row => n(row.DepartmentID)));
    const handlerDepartments = new Set(handlers.map(row => n(row.DepartmentID)));
    departments.forEach(row => {
        const id = n(row.id);
        if (templateDepartments.has(id) && qrDepartments.has(id) && handlerDepartments.has(id)) configuredDepartments.add(id);
    });
    const reasons = [];
    if (!departments.length) reasons.push({ code:'MASTER_DEPARTMENTS_UNAVAILABLE', text:'Master Department ยังไม่พร้อม จึงยังเลือกขอบเขตแผนกไม่ได้' });
    if (!positions.length) reasons.push({ code:'MASTER_POSITIONS_UNAVAILABLE', text:'Master Position ยังไม่พร้อม จึงยังตรวจสอบสิทธิ์บัตรรายบุคคลไม่ได้' });
    else if (!activeMappings.length) reasons.push({ code:'POSITION_MAPPING_REQUIRED', text:'ยังไม่มี Position ที่ Mapping เป็น BBS Level ใน BBS Foundation' });
    else if (!personalMappings.length) reasons.push({ code:'GROUP_LEADER_MAPPING_REQUIRED', text:'ยังไม่มี Position ที่ Mapping ระดับ Group Leader ขึ้นไปสำหรับบัตรรายบุคคล' });
    else if (!n(state.listMeta.cardEmployees?.total) && !state.cardEmployees.length) reasons.push({ code:'PERSONAL_CARD_EMPLOYEE_REQUIRED', text:'ยังไม่พบพนักงานที่ Position ตรงกับ Mapping ระดับ Group Leader ขึ้นไป' });
    if (!personalTemplates.length) reasons.push({ code:'PERSONAL_TEMPLATE_REQUIRED', text:'ยังไม่มี Personal Card Template ที่ Active' });
    if (!departmentTemplates.length) reasons.push({ code:'DEPARTMENT_TEMPLATE_REQUIRED', text:'ยังไม่มี Department Card Template ที่ Active' });
    if (!departmentQrs.length) reasons.push({ code:'DEPARTMENT_QR_REQUIRED', text:'ยังไม่มี Department QR ที่ Active' });
    if (!handlers.length) reasons.push({ code:'DEPARTMENT_HANDLER_REQUIRED', text:'ยังไม่ได้กำหนด Risk Owner และ Verifier รายแผนก' });
    if (departments.length && configuredDepartments.size < departments.length) reasons.push({ code:'DEPARTMENT_CONFIGURATION_INCOMPLETE', text:`แผนกที่มี Active Template, QR และผู้รับผิดชอบครบแล้ว ${configuredDepartments.size} จาก ${departments.length} แผนก` });
    return {
        departments: departments.length,
        units: (reference.units || []).length,
        employees: employees.length,
        positions: positions.length,
        mappedPositions: activeMappings.length,
        eligiblePersonalEmployees: n(state.listMeta.cardEmployees?.total) || state.cardEmployees.length,
        personalTemplates: personalTemplates.length,
        activePersonalCards: state.cardFilters.status === 'Active' ? (n(state.listMeta.cards?.total) || state.cards.filter(row => row.Status === 'Active').length) : state.cards.filter(row => row.Status === 'Active').length,
        departmentTemplates: departmentTemplates.length,
        departmentQrs: departmentQrs.length,
        departmentHandlers: handlers.length,
        configuredDepartments: configuredDepartments.size,
        reasons
    };
}

function cardReadinessView() {
    const ready = cardReadiness();
    const complete = ready.departments > 0 && ready.mappedPositions > 0 && ready.reasons.length === 0;
    const metrics = [
        ['Master Departments', ready.departments],
        ['Master Positions / Mapped', `${ready.positions} / ${ready.mappedPositions}`],
        ['Personal Card Eligible', ready.eligiblePersonalEmployees],
        ['Department Ready', `${ready.configuredDepartments} / ${ready.departments}`]
    ];
    return `<section data-bbs-master-readiness class="rounded-2xl border ${complete ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'} overflow-hidden">
      <div class="p-5 border-b ${complete ? 'border-emerald-100' : 'border-amber-100'} flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div><div class="flex flex-wrap items-center gap-2"><h3 class="font-black text-slate-800">Master Data &amp; Card Readiness</h3><span class="rounded-full px-2.5 py-1 text-[11px] font-black ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${complete ? 'พร้อมใช้งาน' : 'ต้องตั้งค่าเพิ่มเติม'}</span></div><p class="text-xs text-slate-500 mt-1">ข้อมูลแผนก ตำแหน่ง ระดับ BBS และพนักงานมาจาก BBS Foundation / Master Data กลาง</p></div>
        <a href="#admin" class="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">เปิด System Console / BBS Foundation</a>
      </div>
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 p-5">${metrics.map(([label,value]) => `<div class="rounded-xl border border-white/80 bg-white p-4"><div class="text-[11px] font-bold text-slate-500">${label}</div><div class="mt-1 text-xl font-black text-slate-800">${value}</div></div>`).join('')}</div>
      ${ready.reasons.length ? `<div class="mx-5 mb-5 rounded-xl border border-amber-200 bg-white p-4"><div class="text-xs font-black text-amber-800">ข้อมูลที่ยังไม่พร้อม</div><ul class="mt-2 space-y-1.5">${ready.reasons.map(row => `<li data-readiness-code="${row.code}" class="text-xs text-slate-600">• ${escHtml(row.text)}</li>`).join('')}</ul></div>` : `<div class="mx-5 mb-5 rounded-xl border border-emerald-200 bg-white p-4 text-xs font-bold text-emerald-700">Master Data และการตั้งค่าบัตรพร้อมใช้งาน</div>`}
    </section>`;
}

function personalCardEmployeeEmptyState() {
    const reason = cardReadiness().reasons.find(row => ['MASTER_POSITIONS_UNAVAILABLE','POSITION_MAPPING_REQUIRED','GROUP_LEADER_MAPPING_REQUIRED','PERSONAL_CARD_EMPLOYEE_REQUIRED'].includes(row.code));
    return `<div class="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center"><div class="font-black text-amber-800">ยังไม่มีรายชื่อที่ออก Personal Card ได้</div><p class="mt-1 text-xs text-amber-700">${escHtml(reason?.text || 'Personal Card ออกได้เฉพาะพนักงานระดับ Group Leader ขึ้นไปตาม BBS Foundation')}</p></div>`;
}

function cardWorkspaceNavigation() {
    const items = [
        ['overview', 'ภาพรวมและความพร้อม', 'เริ่มจากตรงนี้'],
        ['personal', 'Personal Card', 'หัวหน้ากลุ่มขึ้นไป'],
        ['department', 'Department Card', 'QR กลางรายแผนก']
    ];
    return `<section data-card-workspace-navigation class="rounded-2xl border border-slate-200 bg-white p-3"><div class="grid grid-cols-1 sm:grid-cols-3 gap-2">${items.map(([key,label,description]) => `<button type="button" data-card-workspace="${key}" aria-pressed="${state.cardWorkspace===key?'true':'false'}" class="rounded-xl border px-4 py-3 text-left transition ${state.cardWorkspace===key?'border-emerald-500 bg-emerald-50 shadow-sm':'border-slate-200 hover:border-emerald-300'}"><div class="text-sm font-black ${state.cardWorkspace===key?'text-emerald-800':'text-slate-700'}">${label}</div><div class="mt-0.5 text-[11px] text-slate-500">${description}</div></button>`).join('')}</div></section>`;
}

function workflowStep(number, title, detail, ready) {
    return `<div class="flex gap-3 rounded-xl border ${ready?'border-emerald-200 bg-emerald-50/50':'border-amber-200 bg-amber-50/50'} p-3"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${ready?'bg-emerald-600 text-white':'bg-amber-500 text-white'}">${ready?'✓':number}</span><div><div class="text-xs font-black text-slate-800">${title}</div><div class="mt-0.5 text-[11px] text-slate-500">${detail}</div></div></div>`;
}

function cardOverviewView() {
    const ready = cardReadiness();
    const personalFoundationReady = ready.mappedPositions > 0 && ready.eligiblePersonalEmployees > 0;
    const personalTemplateReady = ready.personalTemplates > 0;
    return `<div class="space-y-5" data-card-guided-workflow="overview">
      ${cardReadinessView()}
      <section class="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <article class="rounded-2xl border border-sky-200 bg-white overflow-hidden">
          <div class="p-5 border-b border-sky-100 bg-sky-50/50"><div class="flex items-start justify-between gap-3"><div><span class="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-700">PERSONAL</span><h3 class="mt-2 font-black text-slate-800">บัตรรายบุคคล</h3><p class="mt-1 text-xs text-slate-500">สำหรับ Group Leader ขึ้นไป มี QR เฉพาะบุคคล</p></div><div class="text-right"><div class="text-2xl font-black text-sky-700">${ready.activePersonalCards}</div><div class="text-[10px] font-bold text-slate-400">Active cards</div></div></div></div>
          <div class="space-y-2 p-5">${workflowStep(1,'ตรวจสอบสิทธิ์จาก Master',`${ready.eligiblePersonalEmployees} คนพร้อมออกบัตร`,personalFoundationReady)}${workflowStep(2,'เตรียม Active Template',`${ready.personalTemplates} Template พร้อมใช้`,personalTemplateReady)}${workflowStep(3,'เลือกคนและออกบัตร','Issue, Print, Replace และ Revoke',ready.activePersonalCards>0)}</div>
          <div class="px-5 pb-5"><button type="button" data-card-workspace="personal" class="w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-black text-white">${!personalFoundationReady?'ตรวจสอบ Personal Card':'จัดการ Personal Card'} →</button></div>
        </article>
        <article class="rounded-2xl border border-emerald-200 bg-white overflow-hidden">
          <div class="p-5 border-b border-emerald-100 bg-emerald-50/50"><div class="flex items-start justify-between gap-3"><div><span class="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">DEPARTMENT</span><h3 class="mt-2 font-black text-slate-800">บัตรรายแผนก</h3><p class="mt-1 text-xs text-slate-500">หลาย Template ใช้ QR กลางหนึ่งชุดต่อแผนก</p></div><div class="text-right"><div class="text-2xl font-black text-emerald-700">${ready.configuredDepartments}/${ready.departments}</div><div class="text-[10px] font-bold text-slate-400">แผนกพร้อมใช้</div></div></div></div>
          <div class="space-y-2 p-5">${workflowStep(1,'สร้าง Template รายแผนก',`${ready.departmentTemplates} Active Template`,ready.departmentTemplates>0)}${workflowStep(2,'ออก QR กลางรายแผนก',`${ready.departmentQrs} แผนกมี Active QR`,ready.departmentQrs>0)}${workflowStep(3,'กำหนด Owner และ Verifier',`${ready.departmentHandlers} แผนกตั้งผู้รับผิดชอบแล้ว`,ready.departmentHandlers>0)}</div>
          <div class="px-5 pb-5"><button type="button" data-card-workspace="department" class="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">จัดการ Department Card →</button></div>
        </article>
      </section>
      <section class="rounded-2xl border border-slate-200 bg-slate-50 p-5"><h3 class="text-sm font-black text-slate-800">ลำดับที่แนะนำ</h3><p class="mt-1 text-xs text-slate-500">เริ่มจากเลือกประเภทบัตร → เตรียม Template → ตรวจความพร้อม → ออก QR/บัตร → Preview และ Print ระบบจะคงข้อมูลและประวัติเดิมทุกขั้นตอน</p></section>
    </div>`;
}

function departmentConfigurationRows() {
    const data = state.communityAdmin || {};
    const activeQrByDepartment = new Map((data.qrCards || []).filter(row => row.Status === 'Active').map(row => [n(row.DepartmentID), row]));
    const handlerByDepartment = new Map((data.handlers || []).filter(row => n(row.IsActive) !== 0).map(row => [n(row.DepartmentID), row]));
    const templatesByDepartment = new Map();
    (data.templates || []).forEach(row => {
        const id = n(row.DepartmentID);
        if (!templatesByDepartment.has(id)) templatesByDepartment.set(id, []);
        templatesByDepartment.get(id).push(row);
    });
    return masterDepartments().map(department => {
        const id = n(department.id);
        const templates = templatesByDepartment.get(id) || [];
        const activeTemplates = templates.filter(row => row.Status === 'Active');
        const qr = activeQrByDepartment.get(id) || null;
        const handler = handlerByDepartment.get(id) || null;
        const missing = [];
        if (!activeTemplates.length) missing.push('Template');
        if (!qr) missing.push('QR');
        if (!handler) missing.push('Owner/Verifier');
        return { id, name:department.Name, templates, activeTemplates, qr, handler, missing, ready:missing.length === 0 };
    });
}

function searchableAdminOptions(admins, selectedId) {
    return `<option value="">เลือก Admin</option>${admins.map(admin => { const search=[admin.EmployeeID,admin.EmployeeName,admin.Department].join(' ').toLowerCase();return `<option value="${escHtml(admin.EmployeeID)}" data-admin-option-search="${escHtml(search)}" ${String(selectedId||'')===String(admin.EmployeeID)?'selected':''}>${escHtml(admin.EmployeeName)} · ${escHtml(admin.EmployeeID)} · ${escHtml(admin.Department||'-')}</option>`; }).join('')}`;
}

function departmentConfigurationView() {
    const data = state.communityAdmin || {};
    const rows = departmentConfigurationRows();
    const selectedId = n(state.departmentConfigSelectedId) || n(rows[0]?.id);
    if (!state.departmentConfigSelectedId && selectedId) state.departmentConfigSelectedId = selectedId;
    const selected = rows.find(row => row.id === selectedId) || rows[0] || null;
    const readyCount = rows.filter(row => row.ready).length;
    if (!selected) return `<section class="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-bold text-amber-700">Master Department ยังไม่พร้อม</section>`;
    const handler = selected.handler;
    const admins = data.admins || [];
    return `<section data-department-configuration class="rounded-2xl border border-emerald-200 bg-white overflow-hidden">
      <div class="p-5 border-b border-emerald-100 bg-emerald-50/40"><div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"><div><h3 class="font-black text-emerald-900">Department Configuration Workspace</h3><p class="mt-1 text-xs text-emerald-700">ค้นหาแผนก เลือกหนึ่งรายการ แล้วตั้งค่า Template, QR และผู้รับผิดชอบในหน้ารายละเอียดเดียว</p></div><span class="rounded-full bg-white px-3 py-2 text-xs font-black text-emerald-700">พร้อม ${readyCount}/${rows.length} แผนก</span></div></div>
      <div class="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] min-w-0">
        <aside class="border-b xl:border-b-0 xl:border-r border-slate-200 min-w-0">
          <div class="p-4 border-b border-slate-100 space-y-2"><input data-department-config-search type="search" value="${escHtml(state.departmentConfigQuery)}" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="ค้นหาชื่อแผนก..."><select data-department-config-status class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="all" ${state.departmentConfigStatus==='all'?'selected':''}>ทุกสถานะ</option><option value="ready" ${state.departmentConfigStatus==='ready'?'selected':''}>พร้อมใช้งาน</option><option value="incomplete" ${state.departmentConfigStatus==='incomplete'?'selected':''}>ต้องตั้งค่าเพิ่ม</option></select><div class="text-[11px] text-slate-400"><span data-department-config-count>${rows.length}</span> แผนกจาก Master Data</div></div>
          <div class="max-h-[34rem] overflow-y-auto divide-y" data-department-config-list>${rows.map(row => `<button type="button" data-department-config-row data-department-id="${row.id}" data-config-status="${row.ready?'ready':'incomplete'}" data-config-search="${escHtml(row.name.toLowerCase())}" class="w-full p-4 text-left ${row.id===selected.id?'bg-emerald-50':'hover:bg-slate-50'}"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="truncate text-sm font-black text-slate-800">${escHtml(row.name)}</div><div class="mt-1 text-[11px] ${row.ready?'text-emerald-600':'text-amber-600'}">${row.ready?'พร้อมใช้งาน':`ขาด ${escHtml(row.missing.join(', '))}`}</div></div><span class="shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${row.ready?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">${row.ready?'READY':`${3-row.missing.length}/3`}</span></div></button>`).join('')}</div>
          <div data-department-config-empty class="hidden p-8 text-center text-xs text-slate-400">ไม่พบแผนกตามตัวกรอง</div>
        </aside>
        <div data-department-config-detail="${selected.id}" class="min-w-0">
          <div class="p-5 border-b border-slate-100"><div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div><div class="text-[10px] font-black text-emerald-600">SELECTED DEPARTMENT</div><h3 class="mt-1 text-lg font-black text-slate-800">${escHtml(selected.name)}</h3><div class="mt-2 flex flex-wrap gap-2"><span class="rounded-full px-2 py-1 text-[10px] font-black ${selected.activeTemplates.length?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">Template ${selected.activeTemplates.length?'พร้อม':'ยังไม่มี'}</span><span class="rounded-full px-2 py-1 text-[10px] font-black ${selected.qr?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">QR ${selected.qr?'Active':'ยังไม่มี'}</span><span class="rounded-full px-2 py-1 text-[10px] font-black ${handler?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}">Handler ${handler?'พร้อม':'ยังไม่ตั้ง'}</span></div></div><button type="button" data-dept-qr-issue="${selected.id}" class="rounded-xl ${selected.qr?'border border-amber-300 bg-white text-amber-700':'bg-emerald-600 text-white'} px-4 py-2.5 text-xs font-black">${selected.qr?'Rotate QR':'ออก QR กลาง'}</button></div></div>
          <div class="grid grid-cols-1 2xl:grid-cols-2 gap-5 p-5">
            <form id="bbs-dept-template-form" class="rounded-2xl border border-slate-200 p-4 space-y-3"><div><h4 class="font-black text-slate-800">1. เพิ่ม Template</h4><p class="mt-1 text-[11px] text-slate-500">Template นี้จะผูกกับ ${escHtml(selected.name)}</p></div><input type="hidden" name="departmentId" value="${selected.id}"><input name="templateName" required maxlength="160" class="w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="ชื่อ Template"><div class="grid grid-cols-3 gap-2"><input name="widthMM" type="number" min="40" max="500" value="105" class="min-w-0 rounded-xl border px-2 py-2 text-xs" title="กว้าง mm"><input name="heightMM" type="number" min="40" max="500" value="148" class="min-w-0 rounded-xl border px-2 py-2 text-xs" title="สูง mm"><input name="displayOrder" type="number" min="0" max="9999" value="0" class="min-w-0 rounded-xl border px-2 py-2 text-xs" title="ลำดับ"></div><input name="template" required type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-xs"><button class="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white">อัปโหลด Draft</button></form>
            <form data-community-handler="${selected.id}" class="rounded-2xl border border-slate-200 p-4 space-y-3"><div><h4 class="font-black text-slate-800">2. กำหนด Risk Owner / Verifier</h4><p class="mt-1 text-[11px] text-slate-500">ค้นหาด้วยชื่อ รหัสพนักงาน หรือแผนก จากบัญชี Admin ใน Employee Master</p></div><div><label class="text-[11px] font-bold text-slate-600">Risk Owner</label><input data-admin-picker-search="bbs-owner-admin" type="search" class="mt-1 w-full rounded-t-xl border border-b-0 px-3 py-2 text-xs" placeholder="ค้นหา Owner..."><select id="bbs-owner-admin" name="ownerEmployeeId" required size="${Math.min(4,Math.max(2,admins.length+1))}" class="w-full rounded-b-xl border px-2 py-2 text-xs">${searchableAdminOptions(admins,handler?.OwnerEmployeeID)}</select></div><div><label class="text-[11px] font-bold text-slate-600">Verifier</label><input data-admin-picker-search="bbs-verifier-admin" type="search" class="mt-1 w-full rounded-t-xl border border-b-0 px-3 py-2 text-xs" placeholder="ค้นหา Verifier..."><select id="bbs-verifier-admin" name="verifierEmployeeId" required size="${Math.min(4,Math.max(2,admins.length+1))}" class="w-full rounded-b-xl border px-2 py-2 text-xs">${searchableAdminOptions(admins,handler?.VerifierEmployeeID)}</select></div><button class="w-full rounded-xl bg-slate-800 px-3 py-2.5 text-sm font-black text-white">บันทึกผู้รับผิดชอบ</button></form>
          </div>
          <div class="border-t border-slate-100"><div class="p-5 flex items-center justify-between gap-3"><div><h4 class="font-black text-slate-800">3. Template ของแผนกนี้</h4><p class="mt-1 text-[11px] text-slate-500">Composite Preview จะตรวจรูป ขนาด QR และพื้นที่พิมพ์ก่อน Activate</p></div><span class="text-xs font-bold text-slate-500">${selected.templates.length} รายการ</span></div><div class="divide-y">${selected.templates.map(row=>`<div class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div class="font-bold text-slate-800">${escHtml(row.TemplateName)}</div><div class="mt-1 text-xs text-slate-500">${escHtml(row.Status)} · ${n(row.WidthMM)}×${n(row.HeightMM)} mm · ลำดับ ${n(row.DisplayOrder)}</div></div><div class="flex flex-wrap gap-2"><button data-card-designer-department="${row.id}" class="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">Visual Designer</button><button data-dept-template-preview="${row.id}" class="rounded-lg border px-3 py-2 text-xs font-bold text-sky-700">Preview + Readiness</button>${row.Status==='Draft'?`<button data-dept-template-action="activate" data-template-id="${row.id}" data-row-version="${row.RowVersion}" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Activate</button>`:''}${row.Status!=='Archived'?`<button data-dept-template-action="archive" data-template-id="${row.id}" data-row-version="${row.RowVersion}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Archive</button>`:''}</div></div>`).join('')||'<div class="p-8 text-center text-sm text-slate-400">ยังไม่มี Template สำหรับแผนกนี้</div>'}</div></div>
        </div>
      </div>
    </section>`;
}

function departmentCardsAdminView() {
    const ready = cardReadiness();
    return `<div class="space-y-5" data-card-guided-workflow="department">
      <section class="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5"><div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"><div><div class="text-[10px] font-black tracking-widest text-emerald-700">DEPARTMENT CARD WORKFLOW</div><h3 class="mt-1 font-black text-slate-800">ตั้งค่าทีละแผนกตามลำดับ</h3><p class="mt-1 text-xs text-slate-500">1. สร้าง Template → 2. Activate → 3. ออก QR → 4. กำหนด Owner/Verifier → 5. Preview และ Print</p></div><span class="rounded-full bg-white px-3 py-2 text-xs font-black text-emerald-700">พร้อม ${ready.configuredDepartments}/${ready.departments} แผนก</span></div></section>
      ${departmentConfigurationView()}
    </div>`;
}

function cardsView() {
    const content = state.cardWorkspace === 'personal' ? personalCardsView() : state.cardWorkspace === 'department' ? departmentCardsAdminView() : cardOverviewView();
    return `<div class="space-y-5">${cardWorkspaceNavigation()}${content}</div>`;
}

function personalCardsView() {
    const activeTemplates = state.cardTemplates.filter(row => row.Status === 'Active');
    const activeCards = state.cards.filter(row => row.Status === 'Active');
    return `<div class="space-y-5">
      <section data-card-guided-workflow="personal" class="rounded-2xl border border-sky-200 bg-sky-50/40 p-5"><div class="text-[10px] font-black tracking-widest text-sky-700">PERSONAL CARD WORKFLOW</div><h3 class="mt-1 font-black text-slate-800">ออกบัตรให้ Group Leader ขึ้นไป</h3><p class="mt-1 text-xs text-slate-500">1. สร้าง Template → 2. Activate → 3. เลือกพนักงาน → 4. Issue และ Print → 5. Replace/Revoke เมื่อจำเป็น</p></section>
      <section class="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form id="bbs-template-form" class="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"><div><h3 class="font-black text-slate-800">Personal Card Template</h3><p class="text-xs text-slate-500 mt-1">อัปโหลดพื้นหลัง JPG/PNG/WebP สูงสุด 10 MB · แผนกและระดับมาจาก Master Data</p></div><input name="templateName" required maxlength="160" placeholder="ชื่อ Template" class="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><div class="grid grid-cols-1 sm:grid-cols-2 gap-2"><select name="departmentId" data-master-source="departments" aria-label="ขอบเขตแผนกของ Template" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">ทุกแผนก</option>${masterDepartmentOptions()}</select><select name="bbsLevel" data-master-source="bbs-levels" aria-label="ระดับ BBS ของ Template" class="rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">ทุกระดับ</option>${masterBbsLevelOptions()}</select></div><label class="flex items-center gap-2 text-xs font-bold text-slate-600"><input name="includeEmployeeId" type="checkbox" checked> แสดง EmployeeID บนบัตร</label><input name="template" aria-label="ไฟล์พื้นหลัง Card Template" required type="file" accept="image/jpeg,image/png,image/webp" class="block w-full text-xs text-slate-500"><button class="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white">อัปโหลดเป็น Draft</button></form>
        <div class="xl:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b flex justify-between gap-3"><div><h3 class="font-black text-slate-800">Template Lifecycle</h3><p class="text-xs text-slate-500 mt-1">ตรวจ Composite Preview และ Print Readiness ก่อนยืนยัน Activate</p></div><span class="text-xs font-bold text-slate-500">${state.cardTemplates.length} รายการ</span></div><div class="divide-y max-h-80 overflow-y-auto">${state.cardTemplates.map(templateRow).join('') || `<div class="p-8 text-center text-sm text-slate-400">ยังไม่มี Template</div>`}</div></div>
      </section>
      <section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b space-y-3"><div class="flex flex-col lg:flex-row lg:items-end justify-between gap-3"><div><h3 class="font-black text-slate-800">ออกบัตรรายบุคคล / Batch</h3><p class="text-xs text-slate-500 mt-1">แสดงเฉพาะพนักงานระดับ Group Leader ขึ้นไปที่ Position Mapping พร้อมแล้ว · QR แสดงครั้งเดียวหลัง Issue</p></div><div class="flex flex-col sm:flex-row gap-2"><select id="bbs-issue-template" aria-label="เลือก Active Personal Card Template สำหรับออกบัตร" class="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">เลือก Active Template</option>${activeTemplates.map(t => `<option value="${t.id}">${escHtml(t.TemplateName)} · ${escHtml(t.DepartmentName || 'ทุกแผนก')} · ${escHtml(t.BBSLevel || 'ทุกระดับ')}</option>`).join('')}</select><button data-bbs-issue class="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">ออกบัตรและพิมพ์</button></div></div><div class="grid sm:grid-cols-[1fr_240px] gap-2"><input data-list-search="card-employees" value="${escHtml(state.cardEmployeeFilters.q)}" type="search" class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm" placeholder="ค้นหารหัส ชื่อ แผนก Unit หรือตำแหน่ง"><select data-card-employee-filter="departmentId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกแผนก</option>${masterFilterOptions(state.cardEmployeeFilters.departmentId)}</select></div></div><div id="bbs-card-employees" class="grid md:grid-cols-2 xl:grid-cols-3 gap-3 p-5 max-h-[34rem] overflow-y-auto">${state.cardEmployees.map(employeeCardChoice).join('') || personalCardEmployeeEmptyState()}</div>${listPager('card-employees',state.listMeta.cardEmployees,'พนักงาน')}</section>
      <section class="rounded-2xl border border-slate-200 bg-white overflow-hidden"><div class="p-5 border-b space-y-3"><div class="flex justify-between gap-3"><div><h3 class="font-black text-slate-800">ประวัติบัตรรายบุคคล</h3><p class="text-xs text-slate-500 mt-1">Revoke ใช้สำหรับบัตรสูญหาย; Replace ใช้สำหรับออกใหม่หรือพิมพ์ซ้ำ</p></div><span class="text-xs font-bold text-emerald-700">${n(state.listMeta.cards?.total)} รายการ</span></div><div class="grid sm:grid-cols-3 gap-2"><input data-list-search="cards" value="${escHtml(state.cardFilters.q)}" type="search" placeholder="ค้นหาพนักงาน Template หรือ QR" class="rounded-xl border px-3 py-2.5 text-sm"><select data-card-filter="status" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกสถานะ</option>${['Active','Revoked','Replaced'].map(v=>`<option ${state.cardFilters.status===v?'selected':''}>${v}</option>`).join('')}</select><select data-card-filter="departmentId" class="rounded-xl border px-3 py-2.5 text-sm"><option value="">ทุกแผนก</option>${masterFilterOptions(state.cardFilters.departmentId)}</select></div></div><div class="divide-y">${state.cards.map(activeCardRow).join('') || `<div class="p-8 text-center text-sm text-slate-400">ไม่พบบัตรตามตัวกรอง</div>`}</div>${listPager('cards',state.listMeta.cards,'บัตร')}</section>
    </div>`;
}

function communityAdminView(){const d=state.communityAdmin||{},activeByDept=new Map((d.qrCards||[]).filter(q=>q.Status==='Active').map(q=>[n(q.DepartmentID),q])),handlerByDept=new Map((d.handlers||[]).map(h=>[n(h.DepartmentID),h]));return `<section class="rounded-2xl border border-emerald-200 bg-emerald-50/30 overflow-hidden"><div class="p-5 border-b border-emerald-100"><h3 class="font-black text-emerald-900">บัตรรายแผนกและ Community Risk Handler</h3><p class="text-xs text-emerald-700 mt-1">1 QR ต่อแผนก ใช้ร่วมกันได้หลาย Template; Owner และ Verifier ของ Risk ต้องเป็น Admin</p></div><div class="grid xl:grid-cols-3 gap-5 p-5"><form id="bbs-dept-template-form" class="rounded-2xl bg-white border p-4 space-y-3"><h4 class="font-black text-slate-800">เพิ่ม Template รายแผนก</h4><input name="templateName" required maxlength="160" class="w-full rounded-xl border px-3 py-2 text-sm" placeholder="ชื่อ Template"><select name="departmentId" required class="w-full rounded-xl border px-3 py-2 text-sm"><option value="">เลือกแผนก</option>${(d.departments||[]).map(x=>`<option value="${x.id}">${escHtml(x.Name)}</option>`).join('')}</select><div class="grid grid-cols-3 gap-2"><input name="widthMM" type="number" min="40" max="500" value="105" class="rounded-xl border px-2 py-2 text-xs" title="กว้าง mm"><input name="heightMM" type="number" min="40" max="500" value="148" class="rounded-xl border px-2 py-2 text-xs" title="สูง mm"><input name="displayOrder" type="number" min="0" max="9999" value="0" class="rounded-xl border px-2 py-2 text-xs" title="ลำดับ"></div><input name="template" required type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-xs"><button class="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white">อัปโหลด Draft</button></form><div class="xl:col-span-2 rounded-2xl bg-white border overflow-hidden"><div class="p-4 border-b font-black text-slate-800">ตั้งค่า QR และผู้รับผิดชอบรายแผนก</div><div class="divide-y max-h-80 overflow-y-auto">${(d.departments||[]).map(dept=>{const q=activeByDept.get(n(dept.id)),h=handlerByDept.get(n(dept.id));return `<div class="p-4"><div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div><div class="font-bold text-slate-800">${escHtml(dept.Name)}</div><div class="text-xs mt-1 ${q?'text-emerald-600':'text-amber-600'}">${q?`QR Active รุ่น ${n(q.Generation)} · ${escHtml(q.TokenFingerprint)}`:'ยังไม่มี QR Active'}</div></div><button data-dept-qr-issue="${dept.id}" class="rounded-xl border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-700">${q?'Rotate QR':'ออก QR'}</button></div><form data-community-handler="${dept.id}" class="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-3"><select name="ownerEmployeeId" required class="rounded-xl border px-2 py-2 text-xs"><option value="">Risk Owner (Admin)</option>${(d.admins||[]).map(a=>`<option value="${escHtml(a.EmployeeID)}" ${String(h?.OwnerEmployeeID)===String(a.EmployeeID)?'selected':''}>${escHtml(a.EmployeeName)} · ${escHtml(a.EmployeeID)}</option>`).join('')}</select><select name="verifierEmployeeId" required class="rounded-xl border px-2 py-2 text-xs"><option value="">Verifier (Admin)</option>${(d.admins||[]).map(a=>`<option value="${escHtml(a.EmployeeID)}" ${String(h?.VerifierEmployeeID)===String(a.EmployeeID)?'selected':''}>${escHtml(a.EmployeeName)} · ${escHtml(a.EmployeeID)}</option>`).join('')}</select><button class="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white">บันทึก</button></form></div>`;}).join('')}</div></div></div><div class="border-t border-emerald-100 bg-white"><div class="p-4 font-black text-slate-800">Template รายแผนก</div><div class="divide-y">${(d.templates||[]).map(row=>`<div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><div class="font-bold text-slate-800">${escHtml(row.TemplateName)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(row.DepartmentName)} · ${escHtml(row.Status)} · ลำดับ ${n(row.DisplayOrder)}</div></div><div class="flex gap-2"><button data-dept-template-preview="${row.id}" class="rounded-lg border px-3 py-2 text-xs font-bold text-sky-700">Preview</button>${row.Status==='Draft'?`<button data-dept-template-action="activate" data-template-id="${row.id}" data-row-version="${row.RowVersion}" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Activate</button>`:''}${row.Status!=='Archived'?`<button data-dept-template-action="archive" data-template-id="${row.id}" data-row-version="${row.RowVersion}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Archive</button>`:''}</div></div>`).join('')||'<div class="p-6 text-center text-sm text-slate-400">ยังไม่มี Template รายแผนก</div>'}</div></div></section>`;}
function templateRow(row) { return `<div class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="min-w-0"><div class="font-bold text-slate-800 truncate">${escHtml(row.TemplateName)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(row.DepartmentName || 'ทุกแผนก')} · ${escHtml(row.BBSLevel || 'ทุกระดับ')} · ${n(row.WidthMM).toFixed(2)}×${n(row.HeightMM).toFixed(2)} mm · ${escHtml(row.Status)}</div></div><div class="flex flex-wrap gap-2"><button data-card-designer-personal="${row.id}" class="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">Visual Designer</button><button data-bbs-template-preview="${row.id}" class="rounded-lg border px-3 py-2 text-xs font-bold text-sky-700">Preview + Readiness</button>${row.Status === 'Draft' ? `<button data-bbs-template-action="activate" data-template-id="${row.id}" data-row-version="${row.RowVersion}" class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Activate</button>` : ''}${row.Status !== 'Archived' ? `<button data-bbs-template-action="archive" data-template-id="${row.id}" data-row-version="${row.RowVersion}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">Archive</button>` : ''}</div></div>`; }
function employeeCardChoice(row) { const search=escHtml([row.EmployeeID,row.EmployeeName,row.Department,row.Unit,row.Position].join(' ').toLowerCase()); return `<label data-card-search="${search}" class="rounded-xl border ${row.ActiveCardID ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'} p-4 flex gap-3"><input type="checkbox" data-card-employee="${escHtml(row.EmployeeID)}" ${row.ActiveCardID ? 'disabled' : ''} class="mt-1"><div class="min-w-0"><div class="font-bold text-slate-800 truncate">${escHtml(row.EmployeeName)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(row.EmployeeID)} · ${escHtml(row.BBSLevel)}</div><div class="text-xs text-slate-400 mt-1 truncate">${escHtml(row.Department || '-')} / ${escHtml(row.Unit || '-')}</div>${row.ActiveCardID ? `<span class="inline-flex mt-2 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">มีบัตร Active</span>` : ''}</div></label>`; }
function activeCardRow(row) { return `<div class="p-4 grid md:grid-cols-[1fr_auto] gap-3"><div class="min-w-0"><div class="font-bold text-slate-800 truncate">${escHtml(row.EmployeeName)} <span class="font-normal text-slate-400">· ${escHtml(row.EmployeeID)}</span></div><div class="text-xs text-slate-500 mt-1">${escHtml(row.Department || '-')} / ${escHtml(row.Unit || '-')} · ${escHtml(row.TemplateName)} · QR ${escHtml(row.TokenFingerprint)}</div><span class="mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black ${row.Status==='Active'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-600'}">${escHtml(row.Status)}</span></div>${row.Status==='Active'?`<div class="flex gap-2"><button data-bbs-card-replace="${row.id}" class="rounded-lg bg-amber-500 px-3 py-2 text-xs font-black text-white">Replace / Reprint</button><button data-bbs-card-revoke="${row.id}" class="rounded-lg border border-rose-200 px-3 py-2 text-xs font-black text-rose-600">บัตรสูญหาย / Revoke</button></div>`:''}</div>`; }

function historyRows() {
    if (!state.history.length) return `<div class="p-10 text-center text-sm text-slate-400">ไม่พบประวัติในมุมมองนี้</div>`;
    const currentEmployeeId = String(state.context?.employee?.EmployeeID || '');
    return `<div class="divide-y">${state.history.map(row => { const canResume=row.Status==='Draft'&&String(row.ObserverEmployeeID)===currentEmployeeId;return `<div class="w-full p-4 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-3 hover:bg-slate-50"><button type="button" data-bbs-detail="${row.id}" class="min-w-0 text-left"><div class="font-black text-slate-800 truncate">${escHtml(row.ObservedNameSnapshot)} <span class="font-normal text-slate-400">· ผู้ตรวจ ${escHtml(row.ObserverNameSnapshot)}</span></div><div class="text-xs text-slate-500 mt-1">${escHtml(row.ObservationNo)} · ${escHtml(row.ObservedDepartmentSnapshot || '-')} / ${escHtml(row.ObservedUnitSnapshot || '-')} · ${fmtDate(row.ObservationDate)}</div></button><div class="flex flex-wrap items-center gap-2">${statusBadge(row.Status)}<span class="text-xs text-emerald-700 font-bold">S ${n(row.SafeCount)}</span><span class="text-xs text-rose-700 font-bold">U ${n(row.UnsafeCount)}</span>${canResume?`<button type="button" data-bbs-resume="${row.id}" class="min-h-10 rounded-lg bg-amber-500 px-3 text-xs font-black text-white">Resume Draft</button>`:''}</div></div>`; }).join('')}</div>`;
}

function applyDepartmentConfigFilters() {
    const query = String(state.departmentConfigQuery || '').trim().toLowerCase();
    const status = state.departmentConfigStatus || 'all';
    let visible = 0;
    document.querySelectorAll('[data-department-config-row]').forEach(row => {
        const matchesQuery = !query || String(row.dataset.configSearch || '').includes(query);
        const matchesStatus = status === 'all' || row.dataset.configStatus === status;
        const show = matchesQuery && matchesStatus;
        row.classList.toggle('hidden', !show);
        if (show) visible += 1;
    });
    const count = document.querySelector('[data-department-config-count]');
    if (count) count.textContent = String(visible);
    document.querySelector('[data-department-config-empty]')?.classList.toggle('hidden', visible !== 0);
}

function bind() {
    document.querySelectorAll('[data-bbs-retry]').forEach(button => bindBusy(button, 'onclick', () => retrySection(button.dataset.bbsRetry), 'กำลังโหลด...'));
    document.querySelectorAll('[data-bbs-tab]').forEach(btn => {
        btn.onclick = () => switchBbsTab(btn.dataset.bbsTab);
        btn.onkeydown = event => {
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            event.preventDefault();
            const tabs = [...document.querySelectorAll('[data-bbs-tab]')];
            const current = tabs.indexOf(btn);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next]?.focus();
            tabs[next]?.click();
        };
    });
    document.querySelectorAll('[data-card-workspace]').forEach(btn => btn.onclick = () => { state.cardWorkspace = btn.dataset.cardWorkspace; render(); document.querySelector('[data-card-workspace-navigation]')?.scrollIntoView({behavior:'smooth',block:'start'}); });
    document.querySelector('[data-department-config-search]')?.addEventListener('input', event => { state.departmentConfigQuery=event.target.value;applyDepartmentConfigFilters(); });
    document.querySelector('[data-department-config-status]')?.addEventListener('change', event => { state.departmentConfigStatus=event.target.value;applyDepartmentConfigFilters(); });
    document.querySelectorAll('[data-department-config-row]').forEach(btn => btn.onclick = () => { state.departmentConfigSelectedId=n(btn.dataset.departmentId);render();document.querySelector('[data-department-config-detail]')?.scrollIntoView({behavior:'smooth',block:'start'}); });
    document.querySelectorAll('[data-admin-picker-search]').forEach(input => input.oninput = () => { const select=document.getElementById(input.dataset.adminPickerSearch);const query=input.value.trim().toLowerCase();select?.querySelectorAll('option').forEach(option=>{option.hidden=Boolean(query)&&!String(option.dataset.adminOptionSearch||'').includes(query);}); });
    applyDepartmentConfigFilters();
    document.querySelector('[data-open-actions]')?.addEventListener('click', async () => { state.tab='actions';state.actionScope='overdue';await trackSectionLoad('actions',loadActions);render(); });
    document.querySelectorAll('[data-action-detail]').forEach(btn => btn.onclick = () => openActionDetail(n(btn.dataset.actionDetail), btn));
    document.querySelectorAll('[data-action-filter]').forEach(input => input.onchange = async () => { const key=input.dataset.actionFilter;if(key==='scope')state.actionScope=input.value;if(key==='status')state.actionStatus=input.value;if(key==='priority')state.actionPriority=input.value;state.actionFilters.page=1;await trackSectionLoad('actions',loadActions);render(); });
    document.querySelectorAll('[data-action-list-filter]').forEach(input=>input.onchange=async()=>{const key=input.dataset.actionListFilter;state.actionFilters[key]=input.value;if(key==='departmentId')state.actionFilters.safetyUnitId='';state.actionFilters.page=1;await trackSectionLoad('actions',loadActions);render();});
    bindBusy(document.querySelector('[data-action-reminder]'), 'onclick', queueActionReminders, 'กำลังจัดคิว...');
    document.querySelectorAll('[data-action-outbox-filter]').forEach(input=>input.onchange=async()=>{state.actionOutboxFilters[input.dataset.actionOutboxFilter]=input.value;state.actionOutboxFilters.page=1;await reloadActionOutbox();});
    document.querySelectorAll('[data-action-outbox-retry]').forEach(button=>bindBusy(button,'onclick',()=>retryActionEmail(n(button.dataset.actionOutboxRetry)),'กำลังส่ง...'));
    bindBusy(document.querySelector('[data-action-outbox-reload]'),'onclick',reloadActionOutbox,'กำลังโหลด...');
    document.querySelectorAll('[data-sla-form]').forEach(form => bindBusy(form, 'onsubmit', saveSlaRule, 'กำลังบันทึก...'));
    document.querySelectorAll('[data-bbs-start]').forEach(btn => btn.onclick = () => startObservation(btn.dataset.bbsStart));
    document.querySelectorAll('[data-bbs-resume]').forEach(btn => btn.onclick = () => resumeDraft(n(btn.dataset.bbsResume)));
    document.querySelectorAll('[data-batch-employee]').forEach(input => input.onchange = () => { const id=String(input.dataset.batchEmployee),selected=new Set(state.batchSelected.map(String));input.checked?selected.add(id):selected.delete(id);state.batchSelected=[...selected].slice(0,50);render(); });
    document.querySelector('[data-batch-select-all]')?.addEventListener('click',()=>{const visible=[...document.querySelectorAll('#bbs-batch-list [data-search]:not(.hidden) [data-batch-employee]:not(:disabled)')].map(input=>String(input.dataset.batchEmployee));const selected=new Set(state.batchSelected.map(String)),allSelected=visible.length>0&&visible.every(id=>selected.has(id));visible.forEach(id=>allSelected?selected.delete(id):selected.add(id));state.batchSelected=[...selected].slice(0,50);render();});
    bindBusy(document.querySelector('[data-batch-create]'), 'onclick', createBatchObservation, 'กำลังสร้าง Draft...');
    document.querySelectorAll('[data-batch-common]').forEach(btn=>btn.onclick=()=>applyBatchCommon(n(btn.dataset.groupVersion),n(btn.dataset.checklistItem),btn.dataset.batchCommon));
    document.querySelectorAll('[data-batch-response]').forEach(input=>input.onchange=()=>{collectBatchDraft();const found=findBatchAnswer(n(input.dataset.batchResponse));if(found)found.Response=input.value||null;render();queueBatchAutosave();});
    document.querySelectorAll('[data-batch-upload]').forEach(input=>input.onchange=()=>uploadBatchEvidence(n(input.dataset.observationId),n(input.dataset.batchUpload),input.files?.[0]));
    document.querySelectorAll('[data-batch-remark],[data-batch-action],#bbs-batch-general').forEach(input=>input.oninput=()=>{collectBatchDraft();queueBatchAutosave();});
    document.querySelector('[data-batch-back]')?.addEventListener('click',batchBack);
    bindBusy(document.querySelector('[data-batch-save]'), 'onclick', ()=>saveBatchDraft(true), 'กำลังบันทึก...');
    bindBusy(document.querySelector('[data-batch-next]'), 'onclick', batchNext, 'กำลังตรวจสอบ...');
    document.querySelectorAll('[data-bbs-detail]').forEach(btn => btn.onclick = () => openDetail(n(btn.dataset.bbsDetail), btn));
    document.querySelectorAll('[data-bbs-view]').forEach(btn => btn.onclick = async () => { state.view = btn.dataset.bbsView;state.historyFilters.page=1; await trackSectionLoad('history',loadHistory); render(); });
    document.querySelectorAll('[data-history-filter]').forEach(input=>input.onchange=async()=>{const key=input.dataset.historyFilter;if(key==='year')state.historyYear=n(input.value);else state.historyFilters[key]=input.value;if(key==='departmentId')state.historyFilters.safetyUnitId='';state.historyFilters.page=1;await trackSectionLoad('history',loadHistory);render();});
    const search = document.getElementById('bbs-employee-search');
    search?.addEventListener('input', () => document.querySelectorAll('#bbs-eligible-list [data-search]').forEach(card => card.classList.toggle('hidden', !card.dataset.search.includes(search.value.trim().toLowerCase()))));
    const batchSearch=document.getElementById('bbs-batch-search');batchSearch?.addEventListener('input',()=>document.querySelectorAll('#bbs-batch-list [data-search]').forEach(card=>card.classList.toggle('hidden',!card.dataset.search.includes(batchSearch.value.trim().toLowerCase()))));
    document.querySelectorAll('input[type=radio][name^=response-]').forEach(input => input.onchange = () => { collectDraft(); render(); queueDraftAutosave(); });
    document.querySelectorAll('[name^=remark-],[name^=action-],[name=generalRemark]').forEach(input => input.oninput = () => { collectDraft(); queueDraftAutosave(); });
    document.querySelector('[data-bbs-cancel]')?.addEventListener('click', leaveSingleDraft);
    bindBusy(document.querySelector('[data-bbs-save]'), 'onclick', () => saveDraft(true), 'กำลังบันทึก...');
    bindBusy(document.getElementById('bbs-observation-form'), 'onsubmit', async event => { event.preventDefault(); await submitObservation(); }, 'กำลังส่ง...');
    document.querySelectorAll('[data-bbs-upload]').forEach(input => input.onchange = () => uploadEvidence(n(input.dataset.bbsUpload), input.files?.[0]));
    document.querySelectorAll('[data-bbs-file]').forEach(btn => btn.onclick = () => openEvidence(n(btn.dataset.bbsFile)));
    document.querySelectorAll('[data-bbs-file-delete]').forEach(btn => btn.onclick = () => deleteEvidence(n(btn.dataset.bbsFileDelete)));
    bindBusy(document.getElementById('bbs-template-form'), 'onsubmit', uploadCardTemplate, 'กำลังอัปโหลด...');
    document.querySelectorAll('[data-card-designer-personal]').forEach(btn => btn.onclick = () => { const template=state.cardTemplates.find(row=>n(row.id)===n(btn.dataset.cardDesignerPersonal));if(template)openBbsCardDesigner({kind:'Personal',template}); });
    document.querySelectorAll('[data-bbs-template-preview]').forEach(btn => btn.onclick = () => previewTemplate(n(btn.dataset.bbsTemplatePreview)));
    document.querySelectorAll('[data-bbs-template-action]').forEach(btn => bindBusy(btn, 'onclick', () => transitionTemplate(n(btn.dataset.templateId), n(btn.dataset.rowVersion), btn.dataset.bbsTemplateAction), 'กำลังบันทึก...'));
    bindBusy(document.querySelector('[data-bbs-issue]'), 'onclick', () => issueCards(), 'กำลังออกบัตร...');
    document.querySelectorAll('[data-bbs-card-replace]').forEach(btn => bindBusy(btn, 'onclick', () => replaceCard(n(btn.dataset.bbsCardReplace)), 'กำลังออกบัตร...'));
    document.querySelectorAll('[data-bbs-card-revoke]').forEach(btn => bindBusy(btn, 'onclick', () => revokeCard(n(btn.dataset.bbsCardRevoke)), 'กำลังยกเลิก...'));
    document.querySelectorAll('[data-card-filter]').forEach(input=>input.onchange=async()=>{state.cardFilters[input.dataset.cardFilter]=input.value;state.cardFilters.page=1;await trackSectionLoad('cards',loadCardAdmin);render();});
    document.querySelectorAll('[data-card-employee-filter]').forEach(input=>input.onchange=async()=>{state.cardEmployeeFilters[input.dataset.cardEmployeeFilter]=input.value;state.cardEmployeeFilters.page=1;await trackSectionLoad('cards',loadCardAdmin);render();});
    document.querySelectorAll('[data-analytics-filter]').forEach(input=>input.onchange=async()=>{const key=input.dataset.analyticsFilter;state.analyticsFilters[key]=input.value;if(key==='departmentId')state.analyticsFilters.safetyUnitId='';await trackSectionLoad('analytics',loadAnalytics);render();});
    document.querySelectorAll('[data-analytics-export]').forEach(btn=>btn.onclick=()=>exportAnalytics(btn.dataset.analyticsExport));
    document.querySelectorAll('[data-analytics-drilldown]').forEach(btn=>btn.onclick=()=>openAnalyticsDrilldown(btn.dataset.analyticsDrilldown,btn));
    bindBusy(document.getElementById('bbs-community-form'), 'onsubmit', submitCommunityReport, 'กำลังส่งรายงาน...');
    document.querySelectorAll('[data-community-filter]').forEach(input=>input.onchange=async()=>{const key=input.dataset.communityFilter;state.communityFilters[key]=['year','month','departmentId','safetyUnitId'].includes(key)?(input.value?n(input.value):''):input.value;if(key==='departmentId')state.communityFilters.safetyUnitId='';state.communityFilters.goodPage=1;state.communityFilters.riskyPage=1;await trackSectionLoad('community',loadCommunityDashboard);render();});
    document.querySelectorAll('[data-list-search]').forEach(input=>input.oninput=()=>{const key=input.dataset.listSearch;clearTimeout(listSearchTimers.get(key));listSearchTimers.set(key,setTimeout(async()=>{if(key==='history'){state.historyFilters.q=input.value;state.historyFilters.page=1;await trackSectionLoad('history',loadHistory);}else if(key==='actions'){state.actionFilters.q=input.value;state.actionFilters.page=1;await trackSectionLoad('actions',loadActions);}else if(key==='action-outbox'){state.actionOutboxFilters.q=input.value;state.actionOutboxFilters.page=1;await reloadActionOutbox();return;}else if(key==='community'){state.communityFilters.q=input.value;state.communityFilters.goodPage=1;state.communityFilters.riskyPage=1;await trackSectionLoad('community',loadCommunityDashboard);}else if(key==='cards'){state.cardFilters.q=input.value;state.cardFilters.page=1;await trackSectionLoad('cards',loadCardAdmin);}else if(key==='card-employees'){state.cardEmployeeFilters.q=input.value;state.cardEmployeeFilters.page=1;await trackSectionLoad('cards',loadCardAdmin);}render();},350));});
    document.querySelectorAll('[data-list-page]').forEach(btn=>btn.onclick=async()=>{const key=btn.dataset.listPage,page=n(btn.dataset.page);if(page<1)return;if(key==='history'){state.historyFilters.page=page;await trackSectionLoad('history',loadHistory);}else if(key==='actions'){state.actionFilters.page=page;await trackSectionLoad('actions',loadActions);}else if(key==='action-outbox'){state.actionOutboxFilters.page=page;await reloadActionOutbox();return;}else if(key==='community-good'){state.communityFilters.goodPage=page;await trackSectionLoad('community',loadCommunityDashboard);}else if(key==='community-risky'){state.communityFilters.riskyPage=page;await trackSectionLoad('community',loadCommunityDashboard);}else if(key==='cards'){state.cardFilters.page=page;await trackSectionLoad('cards',loadCardAdmin);}else if(key==='card-employees'){state.cardEmployeeFilters.page=page;await trackSectionLoad('cards',loadCardAdmin);}render();});
    document.querySelectorAll('[data-dept-template-preview]').forEach(btn=>btn.onclick=()=>previewDepartmentTemplate(n(btn.dataset.deptTemplatePreview)));
    document.querySelectorAll('[data-card-designer-department]').forEach(btn=>btn.onclick=()=>{const template=(state.communityAdmin?.templates||[]).find(row=>n(row.id)===n(btn.dataset.cardDesignerDepartment));if(template)openBbsCardDesigner({kind:'Department',template});});
    document.querySelectorAll('[data-dept-template-print]').forEach(btn=>btn.onclick=()=>printDepartmentTemplate(n(btn.dataset.deptTemplatePrint)));
    bindBusy(document.getElementById('bbs-dept-template-form'), 'onsubmit', uploadDepartmentTemplate, 'กำลังอัปโหลด...');
    document.querySelectorAll('[data-dept-template-action]').forEach(btn=>bindBusy(btn,'onclick',()=>transitionDepartmentTemplate(n(btn.dataset.templateId),n(btn.dataset.rowVersion),btn.dataset.deptTemplateAction),'กำลังบันทึก...'));
    document.querySelectorAll('[data-dept-qr-issue]').forEach(btn=>bindBusy(btn,'onclick',()=>issueDepartmentQr(n(btn.dataset.deptQrIssue)),'กำลังออก QR...'));
    document.querySelectorAll('[data-community-handler]').forEach(form=>bindBusy(form,'onsubmit',saveCommunityHandler,'กำลังบันทึก...'));
    document.querySelectorAll('[data-community-action]').forEach(btn=>bindBusy(btn,'onclick',()=>transitionCommunityAction(n(btn.dataset.actionId),n(btn.dataset.rowVersion),btn.dataset.communityAction),'กำลังบันทึก...'));
    document.querySelectorAll('[data-community-risk-detail]').forEach(btn=>btn.onclick=()=>openCommunityRiskDetail(n(btn.dataset.communityRiskDetail),btn));
    bindBusy(document.getElementById('bbs-inspector-enroll-form'), 'onsubmit', appointInspector, 'กำลังแต่งตั้ง...');
    document.querySelectorAll('[data-inspector-open]').forEach(btn=>btn.onclick=()=>openInspectorTeam(n(btn.dataset.inspectorOpen)));
    document.querySelectorAll('[data-inspector-schedule-mode]').forEach(btn=>btn.onclick=()=>{state.inspectorScheduleMode=btn.dataset.inspectorScheduleMode==='calendar'?'calendar':'agenda';render();});
    document.querySelectorAll('[data-inspector-toggle-self]').forEach(btn=>bindBusy(btn,'onclick',()=>updateInspectorSetting(n(btn.dataset.inspectorToggleSelf),'self'),'กำลังบันทึก...'));
    document.querySelectorAll('[data-inspector-toggle-kpi]').forEach(btn=>bindBusy(btn,'onclick',()=>updateInspectorSetting(n(btn.dataset.inspectorToggleKpi),'kpi'),'กำลังบันทึก...'));
    document.querySelectorAll('[data-inspector-toggle-status]').forEach(btn=>bindBusy(btn,'onclick',()=>updateInspectorSetting(n(btn.dataset.inspectorToggleStatus),'status'),'กำลังบันทึก...'));
    bindBusy(document.getElementById('bbs-inspector-team-add'), 'onsubmit', addInspectorTeamMember, 'กำลังเพิ่ม...');
    document.querySelectorAll('[data-inspector-remove]').forEach(btn=>bindBusy(btn,'onclick',()=>removeInspectorTeamMember(n(btn.dataset.enrollmentId),n(btn.dataset.inspectorRemove)),'กำลังนำออก...'));
    document.querySelectorAll('[data-inspector-period]').forEach(input=>input.onchange=async()=>{state.inspectorScheduleFilters[input.dataset.inspectorPeriod]=n(input.value);await trackSectionLoad('inspectors',loadInspectorData);render();});
    bindBusy(document.getElementById('bbs-inspector-schedule-form'), 'onsubmit', saveInspectorSchedule, 'กำลังบันทึก...');
    bindBusy(document.getElementById('bbs-inspector-override-form'), 'onsubmit', saveInspectorOverride, 'กำลังบันทึก...');
    document.querySelectorAll('[data-inspector-override-remove]').forEach(btn=>bindBusy(btn,'onclick',()=>removeInspectorOverride(n(btn.dataset.enrollmentId),btn.dataset.inspectorOverrideRemove),'กำลังยกเลิก...'));
}

function scrollBbsContentStart() {
    const container = document.getElementById('main-content');
    if (container?.scrollTo) container.scrollTo({ top:0, behavior:'smooth' });
    else window.scrollTo({ top:0, behavior:'smooth' });
}

function render(options = {}) {
    const page = document.getElementById('bbs-smart-card-page');
    if (!page) return;
    const container = document.getElementById('main-content');
    const preserveScroll = options.preserveScroll !== false;
    const scrollTop = preserveScroll ? n(container?.scrollTop) : 0;
    const focusSelector = options.focusSelector || focusSelectorFor(document.activeElement);
    page.innerHTML = shell();
    bind();
    enhanceAccessibility();
    requestAnimationFrame(() => {
        if (preserveScroll && container) container.scrollTop = scrollTop;
        const target = focusSelector ? page.querySelector(focusSelector) : null;
        target?.focus?.({ preventScroll:true });
    });
}

async function switchBbsTab(nextTab) {
    if (!nextTab || nextTab === state.tab) return;
    if (state.tab === 'start') {
        try {
            if (state.draft) await saveDraft(false, false);
            if (state.batchDraft) { collectBatchDraft(); await saveBatchDraft(false, false); }
        } catch (_error) {
            showToast('Unable to save the current Draft. Please stay on this page and try again.', 'error');
            return;
        }
    }
    if (nextTab === 'cards' && state.tab === 'community') state.cardWorkspace = 'department';
    state.tab = nextTab;
    if(state.tab==='actions')await trackSectionLoad('actions',loadActions);
    if(state.tab==='analytics')await trackSectionLoad('analytics',loadAnalytics);
    if(state.tab==='community')await trackSectionLoad('community',loadCommunity);
    if(state.tab==='team-management')await trackSectionLoad('inspectors',loadInspectorData);
    render({ preserveScroll:false, focusSelector:`#${activeTabId()}` });
    scrollBbsContentStart();
}

async function retrySection(section) {
    if (!section || state.retryingSection) return;
    const loaders = { core:loadCoreData, history:loadHistory, community:loadCommunity, inspectors:loadInspectorData, actions:loadActions, analytics:loadAnalytics, cards:loadCardAdmin };
    const loader = loaders[section];
    if (!loader) return;
    state.retryingSection = section;
    render();
    await trackSectionLoad(section, loader);
    state.retryingSection = '';
    render({ focusSelector:`[data-bbs-retry="${section}"]` });
    if (!state.loadErrors[section]) showToast('โหลดข้อมูลล่าสุดแล้ว', 'success');
}

function collectDraft() {
    if (!state.draft) return [];
    const form = document.getElementById('bbs-observation-form');
    const answers = state.draft.answers.map(a => ({ answerId: n(a.id), response: form?.querySelector(`[name="response-${a.id}"]:checked`)?.value || null, remark: form?.querySelector(`[name="remark-${a.id}"]`)?.value || '', immediateAction: form?.querySelector(`[name="action-${a.id}"]`)?.value || '' }));
    answers.forEach(value => { const target = state.draft.answers.find(a => n(a.id) === value.answerId); Object.assign(target, { Response:value.response, Remark:value.remark, ImmediateAction:value.immediateAction }); });
    state.draft.GeneralRemark = form?.elements?.generalRemark?.value || '';
    return answers;
}

let draftAutosaveTimer = null;
let draftSavePromise = null;
async function saveDraft(notify = false, renderAfter = true) {
    if (!state.draft) return null;
    clearTimeout(draftAutosaveTimer);
    draftAutosaveTimer = null;
    if (draftSavePromise) await draftSavePromise;
    if (!state.draft) return null;
    const execute = async () => {
        const answers = collectDraft();
        const result = await API.put(`/bbs/observations/${state.draft.id}`, { rowVersion:n(state.draft.RowVersion), generalRemark:state.draft.GeneralRemark, answers });
        state.draft = result.data;
        return result.data;
    };
    draftSavePromise = execute();
    try {
        const saved = await draftSavePromise;
        if (notify) showToast('บันทึกฉบับร่างแล้ว', 'success');
        if (renderAfter) render();
        return saved;
    } finally {
        draftSavePromise = null;
    }
}

function queueDraftAutosave() {
    if (!state.context?.draftAutosaveEnabled || !state.draft) return;
    clearTimeout(draftAutosaveTimer);
    draftAutosaveTimer = setTimeout(() => saveDraft(false, false).catch(() => {}), 900);
}

async function leaveSingleDraft() {
    try {
        const saved = await saveDraft(false, false);
        if (saved) state.ownDrafts = [saved, ...state.ownDrafts.filter(row => n(row.id) !== n(saved.id))];
        state.draft = null;
        render();
        showToast('Draft saved. You can resume it from this page or History.', 'success');
    } catch (error) {
        showToast(error?.message || 'Unable to save Draft.', 'error');
    }
}

async function resumeDraft(id) {
    try {
        const result = await API.get(`/bbs/observations/${id}`);
        const draft = result.data;
        if (draft?.Status !== 'Draft') throw new Error('This Observation is no longer a Draft.');
        if (String(draft.ObserverEmployeeID) !== String(state.context?.employee?.EmployeeID || '')) throw new Error('Only the original observer can resume this Draft.');
        state.draft = draft;
        state.batchDraft = null;
        state.tab = 'start';
        render();
    } catch (error) {
        showToast(error?.message || 'Unable to resume Draft.', 'error');
    }
}

async function startObservation(employeeId) {
    try {
        const target = state.eligible.find(row => String(row.EmployeeID) === String(employeeId));
        if (target) {
            const readiness = checklistReadinessMeta(target);
            if (!readiness.ready) return showToast(`${readiness.label}: ${readiness.message || 'ยังไม่สามารถเริ่ม Observation ได้'}`, 'error');
        }
        const existing = resumableDrafts().find(row => String(row.ObservedEmployeeID) === String(employeeId));
        if (existing) { await resumeDraft(n(existing.id)); showToast('Existing Draft resumed instead of creating a duplicate.', 'success'); return; }
        state.tab = 'start'; render();
        const storageKey = `bbs_observation_key_${employeeId}`; let key = sessionStorage.getItem(storageKey);
        if (!key) { key = `${Date.now()}-${crypto.randomUUID()}`; sessionStorage.setItem(storageKey, key); }
        const result = await API.post('/bbs/observations/draft', { observedEmployeeId:employeeId, idempotencyKey:key });
        state.draft = result.data;
        state.ownDrafts = [result.data, ...state.ownDrafts.filter(row => n(row.id) !== n(result.data?.id))];
        sessionStorage.removeItem(storageKey); render();
    } catch (error) { showToast(error?.message || 'ไม่สามารถเริ่ม Observation ได้', 'error'); render(); }
}

function findBatchAnswer(answerId) {
    for(const member of state.batchDraft?.members||[]){const answer=(member.observation?.answers||[]).find(item=>n(item.id)===n(answerId));if(answer)return answer;}return null;
}

function collectBatchDraft(){
    if(!state.batchDraft)return [];
    document.querySelectorAll('[data-batch-response]').forEach(input=>{const answer=findBatchAnswer(n(input.dataset.batchResponse));if(answer)answer.Response=input.value||null;});
    document.querySelectorAll('[data-batch-remark]').forEach(input=>{const answer=findBatchAnswer(n(input.dataset.batchRemark));if(answer)answer.Remark=input.value;});
    document.querySelectorAll('[data-batch-action]').forEach(input=>{const answer=findBatchAnswer(n(input.dataset.batchAction));if(answer)answer.ImmediateAction=input.value;});
    const general=document.getElementById('bbs-batch-general');if(general)state.batchDraft.GeneralRemark=general.value;
    return (state.batchDraft.members||[]).map(member=>({observationId:n(member.ObservationID),rowVersion:n(member.observation.RowVersion),generalRemark:member.observation.GeneralRemark||'',answers:(member.observation.answers||[]).map(answer=>({answerId:n(answer.id),response:answer.Response||null,remark:answer.Remark||'',immediateAction:answer.ImmediateAction||''}))}));
}

function applyBatchCommon(versionId,itemId,response){
    collectBatchDraft();const group=(state.batchDraft.groups||[]).find(item=>n(item.checklistVersionId)===n(versionId));for(const member of group?.members||[]){const answer=(member.observation.answers||[]).find(item=>n(item.ChecklistItemID)===n(itemId));if(answer)answer.Response=response;}render();queueBatchAutosave();
}

async function createBatchObservation(){
    if(state.batchSelected.length<2)return showToast('กรุณาเลือกอย่างน้อย 2 คน','error');
    const selectedRows=state.batchSelected.map(id=>state.eligible.find(row=>String(row.EmployeeID)===String(id))).filter(Boolean),notReady=selectedRows.find(row=>!checklistReadinessMeta(row).ready);
    if(selectedRows.length!==state.batchSelected.length||notReady){const readiness=checklistReadinessMeta(notReady||{});return showToast(notReady?`${readiness.label}: ${notReady.EmployeeName} ยังไม่พร้อมตรวจ`:'กรุณาโหลดรายชื่อพนักงานใหม่ก่อนเริ่ม Batch','error');}
    try{const keyName='bbs_batch_idempotency_key';let key=sessionStorage.getItem(keyName);if(!key){key=`${Date.now()}-${crypto.randomUUID()}`;sessionStorage.setItem(keyName,key);}const preview=await API.post('/bbs/batch-observations/preview',{observedEmployeeIds:state.batchSelected});if(n(preview.data?.groupCount)>1)showToast(`ระบบจัดกลุ่มเป็น ${n(preview.data.groupCount)} Checklist`,'success');const result=await API.post('/bbs/batch-observations/draft',{observedEmployeeIds:state.batchSelected,idempotencyKey:key});state.batchDraft=result.data;state.batchStep=1;sessionStorage.removeItem(keyName);saveBatchRecovery();render();}catch(error){showToast(error?.message||'เริ่มตรวจพร้อมกันไม่สำเร็จ','error');}
}

function batchPayload(){return{rowVersion:n(state.batchDraft.RowVersion),step:state.batchStep,generalRemark:state.batchDraft.GeneralRemark||'',members:collectBatchDraft()};}

let batchAutosaveTimer=null;
let batchSavePromise=null;
async function saveBatchDraft(notify=false,renderAfter=true){
    if(!state.batchDraft)return null;
    clearTimeout(batchAutosaveTimer);batchAutosaveTimer=null;
    try{
        if(batchSavePromise)await batchSavePromise;
        if(!state.batchDraft)return null;
        batchSavePromise=API.put(`/bbs/batch-observations/${state.batchDraft.id}/draft`,batchPayload());
        const result=await batchSavePromise;state.batchDraft=result.data;saveBatchRecovery();if(notify)showToast('บันทึกฉบับร่างทั้งชุดแล้ว','success');if(renderAfter)render();return result.data;
    }catch(error){showToast(error?.message||'บันทึกฉบับร่างไม่สำเร็จ','error');throw error;}
    finally{batchSavePromise=null;}
}

function queueBatchAutosave(){if(!state.context?.draftAutosaveEnabled||!state.batchDraft)return;saveBatchRecovery();clearTimeout(batchAutosaveTimer);batchAutosaveTimer=setTimeout(()=>saveBatchDraft(false,false).catch(()=>{}),900);}
function batchRecoveryKey(){return `bbs_batch_recovery_${state.context?.employee?.EmployeeID||'unknown'}`;}
function saveBatchRecovery(){if(!state.context?.draftAutosaveEnabled||!state.batchDraft)return;localStorage.setItem(batchRecoveryKey(),JSON.stringify({id:n(state.batchDraft.id),step:n(state.batchStep),savedAt:new Date().toISOString()}));}
function clearBatchRecovery(){localStorage.removeItem(batchRecoveryKey());}

function batchBack(){collectBatchDraft();if(state.batchStep>1){state.batchStep-=1;saveBatchRecovery();render();return;}if(window.confirm('กลับไปเลือกรายชื่อ? ฉบับร่างนี้ยังเก็บไว้บนระบบ')){state.batchDraft=null;state.batchSelected=[];render();}}

async function batchNext(){
    collectBatchDraft();const max=(state.batchDraft.groups||[]).length+1;if(state.batchStep<max){try{await saveBatchDraft(false);state.batchStep+=1;saveBatchRecovery();render({preserveScroll:false});scrollBbsContentStart();}catch(_){ }return;}const issue=validateBatchClient();if(issue){state.batchStep=issue.step;saveBatchRecovery();render({preserveScroll:false});focusValidationTarget(issue.selector);return showToast(issue.message,'error');}if(!window.confirm(`ยืนยันส่งผลการตรวจ ${n(state.batchDraft.EmployeeCount)} คนพร้อมกัน?`))return;try{const result=await API.post(`/bbs/batch-observations/${state.batchDraft.id}/submit`,batchPayload());showToast(`ส่งครบ ${n(result.data?.EmployeeCount)} คน · สร้าง Action ${n(result.actionCount)}`,'success');state.batchDraft=null;state.batchSelected=[];clearBatchRecovery();state.tab='workspace';await loadData();render({preserveScroll:false});scrollBbsContentStart();}catch(error){showToast(error?.message||'ส่ง Batch Observation ไม่สำเร็จ ข้อมูลยังไม่ถูกส่งทั้งชุด','error');}
}

function validateBatchClient(){
    collectBatchDraft();for(const [groupIndex,group] of (state.batchDraft.groups||[]).entries()){for(const member of group.members||[]){for(const answer of member.observation.answers||[]){const files=member.observation.files.filter(file=>n(file.AnswerID)===n(answer.id)),base={step:groupIndex+1,selector:`[data-batch-answer-card="${answer.id}"]`};if(n(answer.IsRequiredSnapshot)&&!answer.Response)return{...base,message:`${member.observation.ObservedNameSnapshot}: กรุณาตอบ ${answer.ItemCodeSnapshot}`};if(answer.Response==='Unsafe'&&n(answer.UnsafeRequiresRemarkSnapshot)&&!String(answer.Remark||'').trim())return{...base,selector:`#bbs-batch-remark-${answer.id}`,message:`${member.observation.ObservedNameSnapshot}: Unsafe ${answer.ItemCodeSnapshot} ต้องมีหมายเหตุ`};if(answer.Response==='Unsafe'&&n(answer.UnsafeRequiresActionSnapshot)&&!String(answer.ImmediateAction||'').trim())return{...base,selector:`#bbs-batch-action-${answer.id}`,message:`${member.observation.ObservedNameSnapshot}: Unsafe ${answer.ItemCodeSnapshot} ต้องระบุการแก้ไขทันที`};if(answer.Response==='Unsafe'&&n(answer.UnsafeRequiresPhotoSnapshot)&&!files.length)return{...base,message:`${member.observation.ObservedNameSnapshot}: Unsafe ${answer.ItemCodeSnapshot} ต้องมีรูปหลักฐาน`};}}}return null;
}

async function compressObservationImage(file){
    if(!file||!file.type.startsWith('image/')||file.size<900000)return file;try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,file.type==='image/png'?'image/png':'image/jpeg',.82));bitmap.close();return blob?new File([blob],file.name,{type:blob.type,lastModified:file.lastModified}):file;}catch(_){return file;}
}

async function uploadBatchEvidence(observationId,answerId,file){
    if(!file)return;try{await saveBatchDraft(false);const compressed=await compressObservationImage(file),data=new FormData();data.append('answerId',String(answerId));data.append('evidence',compressed,compressed.name||file.name);await API.post(`/bbs/observations/${observationId}/evidence`,data);state.batchDraft=(await API.get(`/bbs/batch-observations/${state.batchDraft.id}`)).data;saveBatchRecovery();showToast(compressed.size<file.size?'อัปโหลดและลดขนาดรูปแล้ว':'อัปโหลดหลักฐานแล้ว','success');render();}catch(error){showToast(error?.message||'อัปโหลดหลักฐานไม่สำเร็จ','error');}
}

function validateClient() {
    const answers = collectDraft();
    for (const answer of answers) {
        const rule = state.draft.answers.find(row => n(row.id) === answer.answerId); const files = state.draft.files.filter(file => n(file.AnswerID) === answer.answerId);
        if (n(rule.IsRequiredSnapshot) && !answer.response) return { message:`กรุณาตอบ ${rule.ItemCodeSnapshot}`, selector:`[data-answer-card="${answer.answerId}"]` };
        if (answer.response === 'Unsafe' && n(rule.UnsafeRequiresRemarkSnapshot) && !answer.remark.trim()) return { message:`กรุณาระบุหมายเหตุ Unsafe: ${rule.ItemCodeSnapshot}`, selector:`#bbs-remark-${answer.answerId}` };
        if (answer.response === 'Unsafe' && n(rule.UnsafeRequiresActionSnapshot) && !answer.immediateAction.trim()) return { message:`กรุณาระบุการแก้ไขทันที: ${rule.ItemCodeSnapshot}`, selector:`#bbs-action-${answer.answerId}` };
        if (answer.response === 'Unsafe' && n(rule.UnsafeRequiresPhotoSnapshot) && !files.length) return { message:`กรุณาแนบหลักฐาน: ${rule.ItemCodeSnapshot}`, selector:`[data-bbs-upload-trigger="${answer.answerId}"]` };
    }
    return null;
}

function focusValidationTarget(selector) {
    requestAnimationFrame(() => {
        const target = document.querySelector(selector);
        if (!target) return;
        target.setAttribute('aria-invalid', 'true');
        if (!target.matches('input,select,textarea,button,[tabindex]')) target.tabIndex = -1;
        target.scrollIntoView({ behavior:'smooth', block:'center' });
        target.focus({ preventScroll:true });
    });
}

async function submitObservation() {
    try { const issue = validateClient(); if (issue) { focusValidationTarget(issue.selector); return showToast(issue.message, 'error'); } await saveDraft(false); const result = await API.post(`/bbs/observations/${state.draft.id}/submit`, { rowVersion:n(state.draft.RowVersion) }); showToast(result.reused ? 'รายการนี้ส่งแล้ว' : 'ส่ง Observation สำเร็จ', 'success'); state.draft = null; state.tab = 'workspace'; await loadData(); render({preserveScroll:false});scrollBbsContentStart(); } catch (error) { showToast(error?.message || 'ส่ง Observation ไม่สำเร็จ', 'error'); }
}

async function uploadEvidence(answerId, file) {
    if (!file) return;
    try { await saveDraft(false); const data = new FormData(); data.append('answerId', String(answerId)); data.append('evidence', file); await API.post(`/bbs/observations/${state.draft.id}/evidence`, data); state.draft = (await API.get(`/bbs/observations/${state.draft.id}`)).data; showToast('อัปโหลดหลักฐานแล้ว', 'success'); render(); } catch (error) { showToast(error?.message || 'อัปโหลดไม่สำเร็จ', 'error'); }
}

async function openEvidence(fileId) {
    try { const response = await apiFetch(`/bbs/observations/${state.draft?.id || document.querySelector('[data-detail-observation]')?.dataset.detailObservation}/evidence/${fileId}`); const blob = await response.blob(); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { showToast(error?.message || 'เปิดหลักฐานไม่สำเร็จ', 'error'); }
}

async function deleteEvidence(fileId) { try { await API.delete(`/bbs/observations/${state.draft.id}/evidence/${fileId}`); state.draft = (await API.get(`/bbs/observations/${state.draft.id}`)).data; render(); } catch (error) { showToast(error?.message || 'ลบหลักฐานไม่สำเร็จ', 'error'); } }

async function openDetail(id, returnFocus = document.activeElement) {
    try { const result = await API.get(`/bbs/observations/${id}`); const d = result.data; const modal = document.createElement('div'); modal.className = 'fixed inset-0 z-[90] bg-slate-950/60 p-3 md:p-8 flex items-center justify-center'; modal.innerHTML = `<div data-detail-observation="${d.id}" class="bg-white rounded-3xl max-w-3xl w-full max-h-full overflow-y-auto"><div class="sticky top-0 bg-white border-b p-5 flex justify-between"><div><div class="font-black text-slate-800">${escHtml(d.ObservationNo)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(d.ObservedNameSnapshot)} · ${fmtDate(d.ObservationDate)}</div></div><button data-close class="text-2xl text-slate-400">×</button></div><div class="p-5 space-y-3">${d.answers.map(a => `<div class="rounded-xl border p-4"><div class="flex justify-between gap-2"><div class="font-bold text-slate-800">${escHtml(a.ItemCodeSnapshot)} · ${escHtml(a.ItemPromptSnapshot)}</div><span class="font-black ${a.Response === 'Unsafe' ? 'text-rose-600' : a.Response === 'Safe' ? 'text-emerald-600' : 'text-slate-500'}">${escHtml(a.Response || '-')}</span></div>${a.Remark ? `<p class="text-sm text-slate-600 mt-2">${escHtml(a.Remark)}</p>` : ''}${d.files.filter(f => n(f.AnswerID) === n(a.id)).map(f => `<button class="mt-2 text-xs font-bold text-sky-700" data-modal-file="${f.id}">เปิดหลักฐาน: ${escHtml(f.OriginalName)}</button>`).join('')}</div>`).join('')}</div></div>`; document.body.appendChild(modal); mountBbsDialog(modal, `รายละเอียด Observation ${d.ObservationNo}`, returnFocus); modal.querySelectorAll('[data-modal-file]').forEach(btn => btn.onclick = async () => { try { const response = await apiFetch(`/bbs/observations/${d.id}/evidence/${btn.dataset.modalFile}`); const blob = await response.blob(); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { showToast(error?.message || 'เปิดหลักฐานไม่สำเร็จ', 'error'); } }); } catch (error) { showToast(error?.message || 'เปิดรายละเอียดไม่สำเร็จ', 'error'); }
}

function transitionButtons(d) {
    const buttons=[];
    if(d.permissions?.canWork&&(d.Status==='Open'||d.Status==='Reopened'))buttons.push(['In Progress','เริ่มดำเนินการ','bg-sky-600']);
    if(d.permissions?.canWork&&d.Status==='In Progress')buttons.push(['Pending Verification','ส่งตรวจยืนยัน','bg-amber-500']);
    if(d.permissions?.canVerify&&d.Status==='Pending Verification')buttons.push(['Closed','ยืนยันและปิดงาน','bg-emerald-600'],['Reopened','ส่งกลับแก้ไข','bg-rose-600']);
    if(d.permissions?.canVerify&&d.Status==='Closed')buttons.push(['Reopened','เปิดงานใหม่','bg-rose-600']);
    return buttons.map(([status,label,tone])=>`<button type="button" data-action-transition="${status}" class="rounded-xl px-4 py-2.5 text-sm font-black text-white ${tone}">${label}</button>`).join('');
}

async function openActionDetail(id, returnFocus = document.activeElement) {
    try {
        const d=(await API.get(`/bbs/actions/${id}`)).data;
        let owners=[];if(d.permissions?.canManage){try{owners=(await API.get(`/bbs/actions/${id}/owner-options`)).data||[];}catch(_error){owners=[];}}
        const modal=document.createElement('div');modal.className='fixed inset-0 z-[95] bg-slate-950/60 p-3 md:p-8 flex items-center justify-center';
        modal.innerHTML=`<div class="bg-white rounded-3xl max-w-4xl w-full max-h-full overflow-y-auto"><div class="sticky top-0 z-10 bg-white border-b p-5 flex justify-between gap-3"><div><div class="flex flex-wrap gap-2 items-center"><h3 class="font-black text-slate-800">${escHtml(d.ActionNo)}</h3>${actionBadge(d.Status)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(d.ObservationNo)} · ${escHtml(d.ObservedNameSnapshot)} · กำหนด ${fmtDate(d.DueDate)}</div></div><button data-close class="text-2xl text-slate-400">×</button></div><div class="p-5 space-y-5">
          <section class="rounded-2xl border p-5"><div class="text-xs font-black text-emerald-700">${escHtml(d.ItemCodeSnapshot)} · ${escHtml(d.Priority)}</div><div class="font-bold text-slate-800 mt-2">${escHtml(d.ItemPromptSnapshot)}</div><p class="text-sm text-slate-600 whitespace-pre-line mt-3">${escHtml(d.Description)}</p><div class="grid sm:grid-cols-2 gap-3 mt-4 text-xs text-slate-500"><div>Owner: <b class="text-slate-700">${escHtml(d.OwnerName||d.OwnerEmployeeID)}</b></div><div>Verifier: <b class="text-slate-700">${escHtml(d.VerifierName||d.VerifierEmployeeID)}</b></div></div></section>
          ${d.permissions?.canManage&&d.Status!=='Closed'?`<form data-action-manage class="rounded-2xl border border-sky-200 bg-sky-50/40 p-5"><h4 class="font-black text-slate-800">Owner / Priority / SLA</h4><div class="grid md:grid-cols-3 gap-2 mt-3"><select name="ownerEmployeeId" class="rounded-xl border px-3 py-2.5 text-sm">${owners.map(o=>`<option value="${escHtml(o.EmployeeID)}" ${String(o.EmployeeID)===String(d.OwnerEmployeeID)?'selected':''}>${escHtml(o.EmployeeName)} (${escHtml(o.EmployeeID)})</option>`).join('')}</select><select name="priority" class="rounded-xl border px-3 py-2.5 text-sm">${['Critical','High','Medium','Low'].map(v=>`<option ${d.Priority===v?'selected':''}>${v}</option>`).join('')}</select><input name="dueDate" type="date" value="${String(d.DueDate).slice(0,10)}" class="rounded-xl border px-3 py-2.5 text-sm"></div><textarea name="description" rows="3" class="mt-2 w-full rounded-xl border p-3 text-sm">${escHtml(d.Description)}</textarea><input name="note" placeholder="หมายเหตุการปรับข้อมูล" class="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm"><button class="mt-3 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-black text-white">บันทึกข้อมูล Action</button></form>`:''}
          <section class="rounded-2xl border p-5"><div class="flex items-center justify-between"><div><h4 class="font-black text-slate-800">หลักฐาน Before / After</h4><p class="text-xs text-slate-500 mt-1">ต้องมี After อย่างน้อย 1 รูปก่อนส่งตรวจยืนยัน</p></div></div><div class="grid md:grid-cols-2 gap-3 mt-4">${['Before','After'].map(type=>`<div class="rounded-xl bg-slate-50 p-3"><div class="text-xs font-black text-slate-700">${type}</div><div class="space-y-2 mt-2">${d.files.filter(f=>f.EvidenceType===type).map(f=>`<div class="flex justify-between gap-2 text-xs"><button data-action-file="${f.id}" class="truncate font-bold text-sky-700">${escHtml(f.OriginalName)}</button>${d.permissions?.canUpload&&d.Status!=='Closed'?`<button data-action-file-delete="${f.id}" class="text-rose-600">ลบ</button>`:''}</div>`).join('')||'<div class="text-xs text-slate-400">ยังไม่มีหลักฐาน</div>'}</div>${d.permissions?.canUpload&&d.Status!=='Closed'?`<label class="mt-3 inline-flex cursor-pointer rounded-lg border border-dashed px-3 py-2 text-xs font-bold text-slate-600">+ เพิ่มรูป ${type}<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" data-action-upload="${type}"></label>`:''}</div>`).join('')}</div></section>
          ${transitionButtons(d)?`<section class="rounded-2xl border border-amber-200 bg-amber-50/40 p-5"><h4 class="font-black text-slate-800">เปลี่ยนสถานะ</h4><textarea data-transition-note rows="2" class="mt-3 w-full rounded-xl border p-3 text-sm" placeholder="หมายเหตุ (จำเป็นเมื่อปิดหรือเปิดงานใหม่)"></textarea><div class="flex flex-wrap gap-2 mt-3">${transitionButtons(d)}</div></section>`:''}
          <section class="rounded-2xl border p-5"><h4 class="font-black text-slate-800">ประวัติการดำเนินการ</h4><div class="mt-3 space-y-3">${d.history.map(h=>`<div class="border-l-2 border-slate-200 pl-3"><div class="text-sm font-bold text-slate-700">${escHtml(h.EventType)} · ${escHtml(h.FromStatus||'-')} → ${escHtml(h.ToStatus)}</div><div class="text-xs text-slate-500 mt-1">${escHtml(h.ActorEmployeeID)} · ${new Date(h.CreatedAt).toLocaleString('th-TH')}</div>${h.Note?`<div class="text-xs text-slate-600 mt-1">${escHtml(h.Note)}</div>`:''}</div>`).join('')}</div></section>
        </div></div>`;
        document.body.appendChild(modal);const close=mountBbsDialog(modal,`Corrective Action ${d.ActionNo}`,returnFocus);
        bindBusy(modal.querySelector('[data-action-manage]'),'onsubmit',async e=>{e.preventDefault();try{const form=new FormData(e.currentTarget);await API.put(`/bbs/actions/${id}`,{rowVersion:n(d.RowVersion),ownerEmployeeId:form.get('ownerEmployeeId'),priority:form.get('priority'),dueDate:form.get('dueDate'),description:form.get('description'),note:form.get('note')});close();await refreshActions();showToast('บันทึก Action แล้ว','success');}catch(error){showToast(error?.message||'บันทึกไม่สำเร็จ','error');}},'กำลังบันทึก...');
        modal.querySelectorAll('[data-action-transition]').forEach(btn=>bindBusy(btn,'onclick',async()=>{try{await API.post(`/bbs/actions/${id}/transition`,{rowVersion:n(d.RowVersion),toStatus:btn.dataset.actionTransition,note:modal.querySelector('[data-transition-note]')?.value||''});close();await refreshActions();showToast('เปลี่ยนสถานะแล้ว','success');}catch(error){showToast(error?.message||'เปลี่ยนสถานะไม่สำเร็จ','error');}},'กำลังบันทึก...'));
        modal.querySelectorAll('[data-action-upload]').forEach(input=>input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const form=new FormData();form.append('evidenceType',input.dataset.actionUpload);form.append('evidence',file);await API.post(`/bbs/actions/${id}/evidence`,form);close();await openActionDetail(id);await refreshActions();showToast('อัปโหลดหลักฐานแล้ว','success');}catch(error){showToast(error?.message||'อัปโหลดไม่สำเร็จ','error');}});
        modal.querySelectorAll('[data-action-file]').forEach(btn=>btn.onclick=()=>openActionEvidence(id,n(btn.dataset.actionFile)));
        modal.querySelectorAll('[data-action-file-delete]').forEach(btn=>bindBusy(btn,'onclick',async()=>{try{await API.delete(`/bbs/actions/${id}/evidence/${btn.dataset.actionFileDelete}`);close();await openActionDetail(id);await refreshActions();}catch(error){showToast(error?.message||'ลบหลักฐานไม่สำเร็จ','error');}},'กำลังลบ...'));
    } catch(error){showToast(error?.message||'เปิด Corrective Action ไม่สำเร็จ','error');}
}

async function openActionEvidence(actionId,fileId){try{const response=await apiFetch(`/bbs/actions/${actionId}/evidence/${fileId}`);const blob=await response.blob();const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){showToast(error?.message||'เปิดหลักฐานไม่สำเร็จ','error');}}
async function loadActions(){const f=state.actionFilters,query=new URLSearchParams({paged:'1',page:String(f.page),pageSize:String(f.pageSize)});if(state.actionScope!=='all')query.set('scope',state.actionScope);if(state.actionStatus)query.set('status',state.actionStatus);if(state.actionPriority)query.set('priority',state.actionPriority);for(const key of ['year','departmentId','safetyUnitId','q'])if(f[key]!==''&&f[key]!==null)query.set(key,String(f[key]));const requests=[API.get('/bbs/actions/summary'),API.get(`/bbs/actions?${query}`)];if(state.context?.permissions?.configure)requests.push(API.get('/bbs/admin/action-sla-rules'));const result=await Promise.all(requests),payload=result[1].data;state.actionSummary=result[0].data||{};state.actions=listRows(payload);state.listMeta.actions=listPagination(payload);state.slaRules=result[2]?.data||state.slaRules;if(state.context?.permissions?.configure)await loadActionOutbox();}
async function loadActionOutbox(){if(!state.context?.permissions?.configure)return;const f=state.actionOutboxFilters,query=new URLSearchParams({paged:'1',page:String(f.page),pageSize:String(f.pageSize)});for(const key of ['status','eventType','year','q'])if(f[key]!==''&&f[key]!==null)query.set(key,String(f[key]));try{const result=await API.get(`/bbs/admin/action-outbox?${query}`),payload=result.data;state.actionOutbox.rows=listRows(payload);state.listMeta.actionOutbox=listPagination(payload);state.actionOutbox.meta=result.meta||state.actionOutbox.meta;state.actionOutbox.error='';}catch(error){state.actionOutbox.error=error?.message||'โหลด Email Outbox ไม่สำเร็จ';}}
async function reloadActionOutbox(){await loadActionOutbox();render();}
async function retryActionEmail(id){try{await API.post(`/bbs/admin/action-outbox/${id}/retry`,{});showToast('ส่งอีเมลซ้ำสำเร็จแล้ว','success');await reloadActionOutbox();}catch(error){showToast(error?.message||'Retry อีเมลไม่สำเร็จ','error');await reloadActionOutbox();}}
async function refreshActions(){await loadActions();render();}
async function queueActionReminders(){try{const result=await API.post('/bbs/actions/reminders/queue',{});const d=result.data||{};showToast(`จัดคิวแล้ว ${n(d.queued)} · Escalate ${n(d.escalated)} · ซ้ำ ${n(d.suppressed)}`,'success');await loadActions();render();}catch(error){showToast(error?.message||'จัดคิว Reminder ไม่สำเร็จ','error');}}
async function saveSlaRule(event){event.preventDefault();const form=new FormData(event.currentTarget);try{await API.put(`/bbs/admin/action-sla-rules/${encodeURIComponent(event.currentTarget.dataset.slaForm)}`,{slaDays:n(form.get('slaDays')),nearDueDays:n(form.get('nearDueDays')),rowVersion:n(form.get('rowVersion'))});await loadActions();render();showToast('บันทึก SLA Rule แล้ว','success');}catch(error){showToast(error?.message||'บันทึก SLA ไม่สำเร็จ','error');}}

function applyAnalyticsPayload(data) {
    state.analytics = data || null;
    if (state.analytics?.meta) {
        for (const key of ['scope','year','month','departmentId','safetyUnitId','risk']) state.analyticsFilters[key] = state.analytics.meta[key] ?? '';
    }
    return state.analytics;
}
async function loadAnalytics(){
    const result = await API.get(`/bbs/analytics?${analyticsQuery()}`);
    applyAnalyticsPayload(result.data);
}
async function analyticsExportData(){return(await API.get(`/bbs/analytics/export-data?${analyticsQuery()}`)).data;}
function analyticsSummaryRows(data){return[
    {Metric:'Scope',Value:data.meta.scope},{Metric:'Period',Value:`${data.meta.periodStart} to ${data.meta.periodThrough}`},{Metric:'KPI status',Value:kpiSemantic(data.kpi).label},{Metric:'KPI status code',Value:kpiSemantic(data.kpi).code},{Metric:'KPI numerator',Value:n(data.kpi.numerator)},{Metric:'KPI denominator',Value:n(data.kpi.denominator)},{Metric:'KPI percent',Value:data.kpi.percentage??''},{Metric:'Observations',Value:n(data.totals.observations)},{Metric:'Safe',Value:n(data.totals.safe)},{Metric:'Unsafe',Value:n(data.totals.unsafe)},{Metric:'Unsafe percent',Value:n(data.totals.unsafeRate)},{Metric:'Actions',Value:n(data.actions.total)},{Metric:'Closed actions',Value:n(data.actions.closed)},{Metric:'Overdue actions',Value:n(data.actions.overdue)},{Metric:'Generated at',Value:data.meta.generatedAt}
];}
async function exportAnalytics(type){
    let popup = null;
    try{
        if(type==='excel'&&!window.XLSX)throw new Error('ไม่พบไลบรารี Excel');
        if(type==='pdf'&&(!window.html2canvas||!window.jspdf?.jsPDF))throw new Error('ไม่พบไลบรารี PDF');
        if (type === 'print') {
            popup = window.open('', '_blank');
            if (!popup) throw new Error('Browser ปิดกั้นหน้าต่าง Print');
            popup.document.open();
            popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing BBS Analytics</title></head><body style="font-family:Arial,sans-serif;padding:32px"><h2>Preparing the latest BBS Analytics...</h2></body></html>');
            popup.document.close();
        }
        const data = await analyticsExportData();
        applyAnalyticsPayload(data);
        if(type==='excel'){
            const wb=XLSX.utils.book_new();const append=(name,rows)=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{Info:'No data'}]),name);
            append('Summary',analyticsSummaryRows(data));append('KPI People',(data.kpi.people||[]).map(row=>({EmployeeID:row.employeeId,EmployeeName:row.employeeName,Numerator:n(row.numerator),Denominator:n(row.denominator),KPIStatus:kpiSemantic(row).label,KPIStatusCode:kpiSemantic(row).code,KPIPercent:row.percentage??''})));append('Trend',data.trend||[]);append('Unsafe Pareto',data.pareto||[]);append('Dept Unit',data.comparison||[]);append('Action Aging',data.actions.aging||[]);append('Observations',(data.recent||[]).map(row=>({ObservationNo:row.ObservationNo,Date:String(row.ObservationDate).slice(0,10),ObserverID:row.ObserverEmployeeID,Observer:row.ObserverNameSnapshot,ObservedID:row.ObservedEmployeeID,Observed:row.ObservedNameSnapshot,Department:row.ObservedDepartmentSnapshot,Unit:row.ObservedUnitSnapshot,Safe:n(row.SafeCount),Unsafe:n(row.UnsafeCount),NA:n(row.NACount),OpenActions:n(row.OpenActions)})));XLSX.writeFile(wb,`BBS_Analytics_${data.meta.scope}_${data.meta.year}_${data.meta.month||'year'}.xlsx`);showToast('Export Excel สำเร็จ','success');return;
        }
        render();
        if(type==='pdf'){
            const target=document.getElementById('bbs-analytics-report');if(!target)return;const canvas=await html2canvas(target,{scale:1.5,useCORS:true,backgroundColor:'#ffffff',logging:false});const pdf=new jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),pageWidth=297,pageHeight=210,margin=8,imageWidth=pageWidth-margin*2,imageHeight=canvas.height*imageWidth/canvas.width;let y=margin;pdf.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',margin,y,imageWidth,imageHeight);let remaining=imageHeight-(pageHeight-margin*2);while(remaining>0){pdf.addPage();y=margin-(imageHeight-remaining);pdf.addImage(canvas.toDataURL('image/jpeg',.92),'JPEG',margin,y,imageWidth,imageHeight);remaining-=pageHeight-margin*2;}pdf.save(`BBS_Analytics_${state.analytics.meta.scope}_${state.analytics.meta.year}_${state.analytics.meta.month||'year'}.pdf`);showToast('Export PDF สำเร็จ','success');return;
        }
        const target=document.getElementById('bbs-analytics-report');if(!target||!popup)throw new Error('ไม่พบข้อมูลสำหรับ Print');popup.document.open();popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>BBS Analytics</title><script src="https://cdn.tailwindcss.com"><\/script><style>@page{size:A4 landscape;margin:8mm}body{font-family:Kanit,Arial,sans-serif;color:#0f172a}.overflow-x-auto{overflow:visible!important}button{border:0;background:transparent}</style></head><body>${target.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);popup.document.close();
    }catch(error){if(popup&&!popup.closed)popup.close();showToast(error?.message||'ส่งออกรายงานไม่สำเร็จ','error');}
}
async function openAnalyticsDrilldown(metric, returnFocus = document.activeElement){
    try{const result=await API.get(`/bbs/analytics/drilldown?${analyticsQuery({metric})}&metric=${encodeURIComponent(metric)}`),rows=result.data?.rows||[];const modal=document.createElement('div');modal.className='fixed inset-0 z-[120] bg-slate-950/60 p-3 md:p-8 flex items-center justify-center';modal.innerHTML=`<div class="bg-white rounded-3xl max-w-6xl w-full max-h-full overflow-hidden flex flex-col"><div class="p-5 border-b flex justify-between gap-3"><div><h3 class="font-black text-slate-800">Drill-down: ${escHtml(metric)}</h3><p class="text-xs text-slate-500 mt-1">${rows.length} รายการ · Scope ${escHtml(result.data?.meta?.scope||'')}</p></div><button data-close class="text-2xl text-slate-400">×</button></div><div class="overflow-auto">${analyticsRecent(rows)}</div></div>`;document.body.appendChild(modal);const close=mountBbsDialog(modal,`Analytics Drill-down ${metric}`,returnFocus);modal.querySelectorAll('[data-bbs-detail]').forEach(btn=>btn.onclick=()=>{close();openDetail(n(btn.dataset.bbsDetail));});}catch(error){showToast(error?.message||'เปิด Drill-down ไม่สำเร็จ','error');}
}

async function loadCommunityDashboard(){const f=state.communityFilters,q=new URLSearchParams({paged:'1',pageSize:String(f.pageSize),year:String(n(f.year)||yearNow),goodPage:String(f.goodPage),riskyPage:String(f.riskyPage)});for(const key of ['month','departmentId','safetyUnitId','q','actionStatus','priority'])if(f[key]!==''&&f[key]!==null&&!(key==='month'&&n(f[key])===0))q.set(key,String(f[key]));state.community=(await API.get(`/bbs/community/dashboard?${q}`)).data||null;}
async function loadCommunity(){const [cards,dashboard,employees]=await Promise.all([API.get('/bbs/department-cards/me'),loadCommunityDashboard().then(()=>null),API.get('/bbs/community/employees')]);state.departmentCards=cards.data||null;state.communityEmployees=employees.data||{rows:[],units:[]};if(state.context?.permissions?.configure)state.communityAdmin=(await API.get('/bbs/admin/department-cards')).data||state.communityAdmin;}
async function submitCommunityReport(event){event.preventDefault();const form=new FormData(event.currentTarget);try{const result=await API.post('/bbs/community/reports',form);showToast(result.data?.reportType==='Risky'?'ส่งรายงานเสี่ยงและสร้าง Corrective Action แล้ว':'เผยแพร่พฤติกรรมดีแล้ว','success');event.currentTarget.reset();await loadCommunity();render();}catch(error){showToast(error?.message||'ส่ง Community Report ไม่สำเร็จ','error');}}
function cardTemplateRecord(kind,id){const rows=kind==='personal'?state.cardTemplates:[...(state.communityAdmin?.templates||[]),...(state.departmentCards?.templates||[])];return rows.find(row=>n(row.id)===n(id))||null;}
function cardImageDimensions(dataUrl){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(new Error('ไฟล์พื้นหลังไม่สามารถแสดงผลเป็นรูปภาพได้'));image.src=dataUrl;});}
async function loadCardTemplateAsset(kind,id){const key=`${kind}:${id}`;if(cardTemplateAssetCache.has(key))return cardTemplateAssetCache.get(key);const path=kind==='personal'?`/bbs/admin/card-templates/${id}/file`:`/bbs/department-card-templates/${id}/file`;const response=await apiFetch(path),blob=await response.blob();if(!blob.size)throw new Error('ไฟล์พื้นหลังว่างเปล่า');const dataUrl=await blobDataUrl(blob),image=await cardImageDimensions(dataUrl),asset={dataUrl,blobSize:blob.size,mimeType:blob.type,imageWidth:image.width,imageHeight:image.height};cardTemplateAssetCache.set(key,asset);return asset;}
async function departmentPrintContext(template){try{const result=await API.get(`/bbs/department-cards/me?departmentId=${n(template.DepartmentID)}`);return result.data||null;}catch(error){return {loadError:error?.message||'โหลด QR ของแผนกไม่สำเร็จ',department:null,templates:[],qr:null};}}
function personalTemplateMatchesEmployee(template,employee){return Boolean(employee)&&(!template.DepartmentID||n(template.DepartmentID)===n(employee.DepartmentID))&&(!template.BBSLevel||String(template.BBSLevel)===String(employee.BBSLevel));}
function personalPreviewEmployee(template,preferred=null){return preferred||state.cardEmployees.find(row=>personalTemplateMatchesEmployee(template,row))||state.cardEmployees[0]||null;}
function cardPreviewCheck(level,title,detail){return{level,title,detail};}
function assessCardTemplate(kind,template,asset,{intent='',employee=null,departmentContext=null}={}){
    const width=n(template.WidthMM)||(kind==='personal'?85.6:0),height=n(template.HeightMM)||(kind==='personal'?54:0),checks=[];
    const add=(level,title,detail)=>checks.push(cardPreviewCheck(level,title,detail));
    if(width<40||width>500||height<40||height>500)add('blocked','ขนาดบัตรไม่ถูกต้อง',`ขนาด ${width} × ${height} mm อยู่นอกช่วงที่รองรับ 40–500 mm`);else add('ready','ขนาดบัตร',`${width} × ${height} mm`);
    if(!asset?.imageWidth||!asset?.imageHeight)add('blocked','รูปพื้นหลังไม่พร้อม','ไม่สามารถอ่านขนาดพิกเซลของรูปได้');else{
        const expectedRatio=width/height,actualRatio=asset.imageWidth/asset.imageHeight,ratioGap=Math.abs(actualRatio-expectedRatio)/expectedRatio;
        const dpi=Math.floor(Math.min(asset.imageWidth/(width/25.4),asset.imageHeight/(height/25.4)));
        add(ratioGap>0.03?'warning':'ready','สัดส่วนรูปพื้นหลัง',`${asset.imageWidth} × ${asset.imageHeight} px · ต่างจากสัดส่วนบัตร ${(ratioGap*100).toFixed(1)}%`);
        add(dpi<72?'warning':dpi<CARD_PREVIEW_DPI?'warning':'ready','ความละเอียดสำหรับพิมพ์',`ประมาณ ${dpi} DPI${dpi<CARD_PREVIEW_DPI?` · แนะนำอย่างน้อย ${CARD_PREVIEW_DPI} DPI`:''}`);
    }
    if(!asset?.mimeType||!['image/jpeg','image/png','image/webp'].includes(asset.mimeType))add('warning','ชนิดไฟล์พื้นหลัง',asset?.mimeType||'Browser ไม่ได้ระบุชนิดไฟล์');else add('ready','ชนิดไฟล์พื้นหลัง',asset.mimeType.replace('image/','').toUpperCase());
    const qrWidth=kind==='personal'?22:Math.min(34,width*.25),qrTooSmall=qrWidth<18;
    add(qrTooSmall&&intent==='print'?'blocked':qrWidth<20?'warning':'ready','พื้นที่ QR',`${qrWidth.toFixed(1)} mm · มุมขวาล่าง · เว้นขอบ 4%`);
    if(typeof window.qrcode!=='function')add(['print','issue','replace'].includes(intent)?'blocked':'warning','ระบบสร้าง QR','QR library ยังไม่พร้อม จึงยังพิมพ์ไม่ได้');
    if(kind==='personal'){
        if(employee){const scopeMatches=personalTemplateMatchesEmployee(template,employee);add(!scopeMatches&&['issue','replace'].includes(intent)?'blocked':scopeMatches?'ready':'warning','ข้อมูลตัวอย่าง',scopeMatches?`${employee.EmployeeName} · ${employee.Department||'-'} · ${employee.Position||'-'}`:`${employee.EmployeeName} ไม่ตรงกับขอบเขตแผนก/ระดับของ Template`);}else add('warning','ข้อมูลตัวอย่างไม่พร้อม','ยังไม่มีพนักงานที่ตรงกับขอบเขต Template จะแสดงข้อมูลตัวอย่างแทน');
        if(width-35<38)add('warning','พื้นที่ข้อความ','พื้นที่ชื่อและข้อมูลพนักงานอาจแคบเกินไป');else add('ready','พื้นที่ข้อความ','ชื่อ แผนก Unit ตำแหน่ง และรหัสอยู่ใน Safe area');
    }else{
        const departmentName=departmentContext?.department?.Name||template.DepartmentName;
        add(departmentName?'ready':'blocked','ข้อมูลแผนก',departmentName||'ไม่พบแผนกจาก Master Data');
        if(departmentContext?.loadError)add(intent==='print'?'blocked':'warning','ข้อมูล QR',departmentContext.loadError);
        else if(!departmentContext?.qr?.qrUrl)add(intent==='print'?'blocked':'warning','ข้อมูล QR','แผนกนี้ยังไม่มี Active QR จึงยังพิมพ์ไม่ได้');
        else add('ready','ข้อมูล QR',`Active QR รุ่น ${n(departmentContext.qr.Generation)}`);
    }
    const status=checks.some(row=>row.level==='blocked')?'blocked':checks.some(row=>row.level==='warning')?'warning':'ready';
    return{status,checks,width,height};
}
function cardPreviewQr(qrUrl,actual){if(typeof window.qrcode!=='function')return`<div class="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-rose-300 bg-white text-center text-[10px] font-black text-rose-600">QR library<br>ไม่พร้อม</div>`;const source=qrUrl||'BBS-PREVIEW-NOT-ACTIVE';return`<div class="relative"><img src="${qrDataUrl(source)}" alt="${actual?'Active QR Code':'ตัวอย่างตำแหน่ง QR Code'}" class="block w-full bg-white">${actual?'':`<span class="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-amber-500/90 py-1 text-center text-[9px] font-black text-white">PREVIEW</span>`}</div>`;}
function compositeCardPreview(kind,template,asset,assessment,{employee=null,departmentContext=null}={}){
    const ratio=assessment.width/assessment.height,wide=ratio>=1,departmentName=departmentContext?.department?.Name||template.DepartmentName||'แผนกตัวอย่าง';
    const person=employee||{EmployeeName:'ชื่อพนักงานตัวอย่าง',EmployeeID:'012345',Department:template.DepartmentName||'แผนกตัวอย่าง',Unit:'Unit ตัวอย่าง',Position:template.BBSLevel||'Group Leader'};
    const qrUrl=kind==='department'?departmentContext?.qr?.qrUrl:null,actualQr=Boolean(qrUrl);
    return`<div class="bbs-card-preview-stage rounded-2xl border border-slate-200 p-5"><div class="mx-auto bbs-card-cut-line relative overflow-hidden bg-white shadow-2xl" style="aspect-ratio:${assessment.width}/${assessment.height};max-width:${wide?'680px':'430px'};background-image:${kind==='personal'?'linear-gradient(90deg,rgba(255,255,255,.96),rgba(255,255,255,.58)),':''}url('${asset.dataUrl}');background-size:cover;background-position:center"><div class="bbs-card-safe-area" aria-hidden="true"></div>${kind==='personal'?`<div class="absolute inset-[6%] flex items-stretch justify-between gap-[4%]"><div class="min-w-0 w-[64%] self-center"><div class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-700 text-xl font-black text-white">${escHtml((person.EmployeeName||'?').trim().charAt(0).toUpperCase())}</div><div class="mt-3 truncate text-base sm:text-xl font-black text-slate-900">${escHtml(person.EmployeeName)}</div><div class="mt-1 truncate text-[10px] sm:text-sm font-bold text-slate-700">${escHtml(person.Department||'-')} / ${escHtml(person.Unit||'-')}</div><div class="mt-1 truncate text-[10px] sm:text-sm font-bold text-slate-700">${escHtml(person.Position||'-')}</div>${n(template.IncludeEmployeeID)!==0?`<div class="mt-2 font-mono text-xs sm:text-base font-black">${escHtml(person.EmployeeID||'-')}</div>`:''}</div><div class="w-[27%] max-w-[150px] self-end rounded-xl bg-white p-2 text-center shadow-lg">${cardPreviewQr(null,false)}<div class="mt-1 text-[8px] sm:text-[10px] font-black">BBS SMART CARD</div><div class="text-[7px] sm:text-[9px] text-slate-500">Scan → Login → Workspace</div></div></div>`:`<div class="absolute right-[4%] bottom-[4%] w-[25%] max-w-[150px] rounded-xl bg-white p-2 text-center shadow-lg">${cardPreviewQr(qrUrl,actualQr)}<div class="mt-1 text-[8px] sm:text-[10px] font-black">แจ้งพฤติกรรมดี / เสี่ยง</div></div><div class="absolute left-[4%] bottom-[4%] max-w-[62%] rounded-lg bg-white/90 px-2 py-1 text-[9px] sm:text-xs font-black text-emerald-900">${escHtml(departmentName)}</div>`}</div><div class="mt-4 flex flex-wrap gap-3 text-[10px] font-bold"><span class="text-orange-700">เส้นสีส้ม = ขอบตัด</span><span class="text-cyan-700">เส้นสีฟ้า = Safe area</span><span class="text-slate-500">ตัวอย่างตามสัดส่วน ${assessment.width} × ${assessment.height} mm</span></div></div>`;
}
function previewReadinessPanel(assessment){const palette={ready:['bg-emerald-100 text-emerald-700','พร้อม'],warning:['bg-amber-100 text-amber-700','ควรตรวจสอบ'],blocked:['bg-rose-100 text-rose-700','ยังไม่พร้อม']},[badge,label]=palette[assessment.status];return`<section class="rounded-2xl border border-slate-200 bg-white"><div class="flex items-center justify-between gap-3 border-b p-4"><div><h4 class="font-black text-slate-800">Print Readiness</h4><p class="mt-1 text-xs text-slate-500">ตรวจขนาด รูปพื้นหลัง QR และพื้นที่ข้อความก่อนดำเนินการ</p></div><span class="rounded-full px-3 py-1.5 text-xs font-black ${badge}">${label}</span></div><div class="grid gap-2 p-4 sm:grid-cols-2">${assessment.checks.map(row=>{const p=palette[row.level];return`<div class="rounded-xl border border-slate-100 p-3"><div class="flex items-start gap-2"><span class="mt-0.5 rounded-full px-2 py-0.5 text-[9px] font-black ${p[0]}">${p[1]}</span><div><div class="text-xs font-black text-slate-800">${escHtml(row.title)}</div><div class="mt-1 text-[11px] text-slate-500">${escHtml(row.detail)}</div></div></div></div>`;}).join('')}</div></section>`;}
async function openCardTemplatePreview(kind,id,options={}){
    const returnFocus=options.returnFocus||document.activeElement,template=cardTemplateRecord(kind,id);if(!template)return showToast('ไม่พบ Template ที่เลือก','error');
    try{
        const [asset,departmentContext]=await Promise.all([loadCardTemplateAsset(kind,id),kind==='department'?departmentPrintContext(template):Promise.resolve(null)]);
        const employee=kind==='personal'?personalPreviewEmployee(template,options.employee):null,assessment=assessCardTemplate(kind,template,asset,{intent:options.intent||'',employee,departmentContext});
        const modal=document.createElement('div');modal.className='fixed inset-0 z-[130] bg-slate-950/70 p-3 md:p-8 flex items-center justify-center';
        const actionLabel={activate:'ยืนยัน Activate',print:'พิมพ์จาก Preview นี้',issue:'ออกบัตรและพิมพ์',replace:'Replace และพิมพ์'}[options.intent]||'';
        modal.innerHTML=`<div class="w-full max-w-6xl overflow-y-auto rounded-3xl bg-slate-50"><div class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white p-5"><div><div class="text-[10px] font-black tracking-widest text-emerald-700">COMPOSITE CARD PREVIEW</div><h3 class="mt-1 font-black text-slate-800">${escHtml(template.TemplateName)}</h3><p class="mt-1 text-xs text-slate-500">${kind==='personal'?'Personal Card':'Department Card'} · ${escHtml(template.Status||'-')}</p></div><button data-close class="text-2xl text-slate-400">×</button></div><div class="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">${compositeCardPreview(kind,template,asset,assessment,{employee,departmentContext})}${previewReadinessPanel(assessment)}</div><div class="sticky bottom-0 flex flex-col-reverse gap-2 border-t bg-white p-4 sm:flex-row sm:justify-end"><button data-close class="rounded-xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-700">ปิด Preview</button>${actionLabel?`<button data-preview-confirm ${assessment.status==='blocked'?'disabled':''} class="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">${actionLabel}</button>`:''}</div></div>`;
        document.body.appendChild(modal);const close=mountBbsDialog(modal,`พรีวิว ${template.TemplateName}`,returnFocus),confirmButton=modal.querySelector('[data-preview-confirm]');
        if(confirmButton&&options.onConfirm)bindBusy(confirmButton,'onclick',async()=>{close();await options.onConfirm({template,asset,assessment,departmentContext,employee});},'กำลังดำเนินการ...');
    }catch(error){showToast(error?.message||'สร้าง Composite Preview ไม่สำเร็จ','error');}
}
async function previewDepartmentTemplate(id){return openCardTemplatePreview('department',id);}
async function printDepartmentTemplate(id){return openCardTemplatePreview('department',id,{intent:'print',onConfirm:context=>executeDepartmentPrint(id,context)});}
async function executeDepartmentPrint(id,previewContext=null){const template=previewContext?.template||cardTemplateRecord('department',id),context=previewContext?.departmentContext||await departmentPrintContext(template||{}),qr=context?.qr;if(!template||!qr?.qrUrl)return showToast('ยังไม่มี Template หรือ Active QR ที่พร้อมพิมพ์','error');const copies=Math.min(100,Math.max(1,n(document.querySelector(`[data-dept-copies="${id}"]`)?.value)||1)),paper=document.querySelector(`[data-dept-paper="${id}"]`)?.value||'A4',popup=window.open('','_blank');if(!popup)return showToast('Browser ปิดกั้นหน้าต่างพิมพ์','error');try{const background=previewContext?.asset?.dataUrl||(await loadCardTemplateAsset('department',id)).dataUrl,pages=Array.from({length:copies},()=>`<article class="card" style="width:${n(template.WidthMM)}mm;height:${n(template.HeightMM)}mm;background-image:url('${background}')"><div class="safe"></div><div class="qr"><img src="${qrDataUrl(qr.qrUrl)}"><strong>แจ้งพฤติกรรมดี / เสี่ยง</strong></div></article>`).join('');popup.document.open();popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escHtml(template.TemplateName)}</title><style>@page{size:${paper};margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Kanit,Arial,sans-serif}.sheet{display:flex;flex-wrap:wrap;gap:5mm;align-content:start}.card{position:relative;overflow:hidden;background-size:cover;background-position:center;border:.2mm dashed #f97316;break-inside:avoid}.safe{position:absolute;inset:4%;border:.2mm dashed #0891b2;pointer-events:none}.qr{position:absolute;right:4%;bottom:4%;width:25%;max-width:34mm;text-align:center;background:#fff;padding:2mm;border-radius:2mm;box-shadow:0 1mm 4mm #0003}.qr img{width:100%;display:block}.qr strong{display:block;font-size:2.4mm;margin-top:1mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.safe{display:none}}</style></head><body><main class="sheet">${pages}</main><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);popup.document.close();await API.post('/bbs/department-cards/print-log',{templateId:id,copies,paperSize:paper});showToast(`เตรียมพิมพ์ ${copies} ใบแล้ว`,'success');}catch(error){popup.close();showToast(error?.message||'สร้างงานพิมพ์ไม่สำเร็จ','error');}}
async function uploadDepartmentTemplate(event){event.preventDefault();try{await API.post('/bbs/admin/department-card-templates',new FormData(event.currentTarget));showToast('อัปโหลด Template รายแผนกเป็น Draft แล้ว','success');await loadCommunity();render();}catch(error){showToast(error?.message||'อัปโหลด Template ไม่สำเร็จ','error');}}
async function transitionDepartmentTemplate(id,rowVersion,action){if(action==='activate')return openCardTemplatePreview('department',id,{intent:'activate',onConfirm:()=>performDepartmentTemplateTransition(id,rowVersion,action)});return performDepartmentTemplateTransition(id,rowVersion,action);}
async function performDepartmentTemplateTransition(id,rowVersion,action){try{await API.put(`/bbs/admin/department-card-templates/${id}`,{rowVersion,action});showToast(action==='activate'?'เปิดใช้ Template แล้ว':'Archive Template แล้ว','success');await loadCommunity();render();}catch(error){showToast(error?.message||'เปลี่ยนสถานะ Template ไม่สำเร็จ','error');}}
async function issueDepartmentQr(departmentId){if(!window.confirm('ยืนยันออกหรือ Rotate QR กลางของแผนกนี้? QR เดิมจะใช้ไม่ได้ทันที'))return;try{await API.post(`/bbs/admin/department-qr/${departmentId}/issue`,{reason:'Issue / rotate from BBS Admin UI'});showToast('ออก QR กลางของแผนกแล้ว','success');await loadCommunity();render();}catch(error){showToast(error?.message||'ออก QR ไม่สำเร็จ','error');}}
async function saveCommunityHandler(event){event.preventDefault();const form=new FormData(event.currentTarget);try{await API.put(`/bbs/admin/community-handlers/${event.currentTarget.dataset.communityHandler}`,{ownerEmployeeId:form.get('ownerEmployeeId'),verifierEmployeeId:form.get('verifierEmployeeId')});showToast('บันทึก Community Risk Handler แล้ว','success');await loadCommunity();render();}catch(error){showToast(error?.message||'บันทึก Handler ไม่สำเร็จ','error');}}
async function transitionCommunityAction(id,rowVersion,status){const requiresNote=['Closed','Reopened'].includes(status),note=requiresNote?window.prompt(status==='Closed'?'สรุปผลการแก้ไขก่อนปิดงาน':'เหตุผลที่เปิดงานใหม่',''):'';if(requiresNote&&(note===null||!note.trim()))return;try{await API.put(`/bbs/admin/community-actions/${id}`,{rowVersion,status,note:note?.trim()||''});showToast('เปลี่ยนสถานะ Community Action แล้ว','success');await loadCommunityDashboard();render();}catch(error){showToast(error?.message||'เปลี่ยนสถานะ Action ไม่สำเร็จ','error');}}

function communityActionButtons(action){if(!action)return'';return`${action.Status==='Open'?`<button type="button" data-risk-action="In Progress" class="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white">เริ่มดำเนินการ</button>`:''}${action.Status!=='Closed'?`<button type="button" data-risk-action="Closed" class="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">ปิดงาน</button>`:`<button type="button" data-risk-action="Reopened" class="min-h-11 rounded-xl border border-rose-300 px-4 py-2 text-sm font-black text-rose-700">เปิดใหม่</button>`}`;}
async function openCommunityRiskEvidence(reportId,fileId){try{const response=await apiFetch(`/bbs/community/reports/${reportId}/evidence/${fileId}`);const blob=await response.blob(),url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){showToast(error?.message||'เปิดหลักฐาน Community Risk ไม่สำเร็จ','error');}}
async function openCommunityRiskDetail(id,returnFocus=document.activeElement){try{
    const data=(await API.get(`/bbs/admin/community-reports/${id}`)).data,report=data.report||{},action=data.action,files=data.files||[],modal=document.createElement('div');modal.className='fixed inset-0 z-[95] bg-slate-950/60 p-3 md:p-8 flex items-center justify-center';
    modal.innerHTML=`<div data-community-risk-dialog class="bg-white rounded-3xl max-w-4xl w-full max-h-full overflow-y-auto"><header class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white p-5"><div><div class="text-[10px] font-black tracking-wider text-rose-600">COMMUNITY RISK DETAIL · ADMIN ONLY</div><h3 class="mt-1 font-black text-slate-800">${escHtml(report.ReportNo)}</h3><p class="mt-1 text-xs text-slate-500">${fmtDateTime(report.CreatedAt)} · ${escHtml(report.DepartmentName)}${report.SafetyUnitName?` / ${escHtml(report.SafetyUnitName)}`:''}</p></div><button type="button" data-close class="text-2xl text-slate-400">×</button></header><div class="space-y-5 p-4 md:p-5">
      <section class="rounded-2xl border border-rose-200 bg-rose-50/40 p-4"><div class="grid gap-3 sm:grid-cols-2 text-xs"><div><span class="text-slate-500">ผู้แจ้ง</span><div class="mt-1 font-bold text-slate-800">${escHtml(report.ReporterName||report.ReporterEmployeeID)} · ${escHtml(report.ReporterEmployeeID)}</div></div><div><span class="text-slate-500">ผู้ถูกสังเกต</span><div class="mt-1 font-bold text-slate-800">${report.ObservedEmployeeID?`${escHtml(report.ObservedEmployeeName||report.ObservedEmployeeID)} · ${escHtml(report.ObservedEmployeeID)}`:'ไม่ระบุ / รายงานพื้นที่'}</div></div><div><span class="text-slate-500">พื้นที่</span><div class="mt-1 font-bold text-slate-800">${escHtml(report.AreaText||'-')}</div></div><div><span class="text-slate-500">สถานะรายงาน</span><div class="mt-1 font-bold text-rose-700">${escHtml(report.Status||'-')}</div></div></div><p class="mt-4 whitespace-pre-wrap text-sm text-slate-700">${escHtml(report.Description)}</p></section>
      <section class="rounded-2xl border p-4"><h4 class="font-black text-slate-800">หลักฐาน (${files.length})</h4><div class="mt-3 grid gap-2 sm:grid-cols-2">${files.map(file=>`<button type="button" data-risk-evidence="${file.id}" class="min-h-11 rounded-xl border bg-slate-50 p-3 text-left"><div class="truncate text-sm font-bold text-sky-700">${escHtml(file.OriginalName)}</div><div class="mt-1 text-[10px] text-slate-500">${escHtml(file.MimeType)} · ${Math.max(1,Math.round(n(file.FileSize)/1024))} KB · ${fmtDateTime(file.CreatedAt)}</div></button>`).join('')||'<div class="sm:col-span-2 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-400">ไม่มีไฟล์หลักฐาน</div>'}</div></section>
      ${action?`<section class="rounded-2xl border p-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h4 class="font-black text-slate-800">${escHtml(action.ActionNo)}</h4><div class="mt-1 text-xs text-slate-500">${escHtml(action.Priority)} · ครบกำหนด ${fmtDate(action.DueDate)}</div></div><span class="self-start rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">${escHtml(action.Status)}</span></div><div class="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div>Owner: <b>${escHtml(action.OwnerName||action.OwnerEmployeeID)}</b></div><div>Verifier: <b>${escHtml(action.VerifierName||action.VerifierEmployeeID)}</b></div></div><p class="mt-3 whitespace-pre-wrap text-sm text-slate-600">${escHtml(action.Description)}</p><div class="mt-4 flex flex-wrap gap-2">${communityActionButtons(action)}</div></section>
      <section class="rounded-2xl border p-4"><h4 class="font-black text-slate-800">Action History</h4><ol class="mt-4 space-y-4">${(action.history||[]).map(item=>`<li class="border-l-2 border-rose-200 pl-4"><div class="text-sm font-bold text-slate-700">${escHtml(item.FromStatus||'สร้างรายการ')} → ${escHtml(item.ToStatus)}</div><div class="mt-1 text-xs text-slate-500">${escHtml(item.ActorName||item.ActorEmployeeID)} · ${fmtDateTime(item.CreatedAt)}</div>${item.Note?`<p class="mt-1 whitespace-pre-wrap text-xs text-slate-600">${escHtml(item.Note)}</p>`:''}</li>`).join('')||'<li class="text-sm text-slate-400">ยังไม่มีประวัติ</li>'}</ol></section>`:'<section class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">ไม่พบ Community Action ที่เชื่อมกับรายงานนี้ กรุณาตรวจสอบข้อมูลกับผู้ดูแลระบบ</section>'}
    </div></div>`;document.body.appendChild(modal);const close=mountBbsDialog(modal,`รายละเอียด Community Risk ${report.ReportNo}`,returnFocus);modal.querySelectorAll('[data-risk-evidence]').forEach(btn=>btn.onclick=()=>openCommunityRiskEvidence(report.id,n(btn.dataset.riskEvidence)));modal.querySelectorAll('[data-risk-action]').forEach(btn=>bindBusy(btn,'onclick',async()=>{const status=btn.dataset.riskAction,requiresNote=['Closed','Reopened'].includes(status),note=requiresNote?window.prompt(status==='Closed'?'สรุปผลการแก้ไขก่อนปิดงาน':'เหตุผลที่เปิดงานใหม่',''):'';if(requiresNote&&(note===null||!note.trim()))return;try{await API.put(`/bbs/admin/community-actions/${action.id}`,{rowVersion:n(action.RowVersion),status,note:note?.trim()||''});close();await loadCommunityDashboard();render();showToast('เปลี่ยนสถานะ Community Action แล้ว','success');}catch(error){showToast(error?.message||'เปลี่ยนสถานะ Action ไม่สำเร็จ','error');}},'กำลังบันทึก...'));
}catch(error){showToast(error?.message||'เปิดรายละเอียด Community Risk ไม่สำเร็จ','error');}}

async function loadInspectorData(){
    try {
        state.inspectorSelf=(await API.get('/bbs/inspectors/me')).data||state.inspectorSelf;
        if(state.context?.permissions?.configure){state.inspectorAdmin=(await API.get('/bbs/admin/inspectors')).data||state.inspectorAdmin;if(state.inspectorSelectedId){try{state.inspectorTeam=(await API.get(`/bbs/inspectors/${state.inspectorSelectedId}/team`)).data;}catch(_error){state.inspectorSelectedId=null;state.inspectorTeam=null;}}}
        const {year,month}=state.inspectorScheduleFilters;
        state.inspectorCompliance=(await API.get(`/bbs/inspectors/compliance?year=${year}&month=${month}`)).data;
        if(!state.context?.permissions?.configure&&state.inspectorSelf?.enrollment?.id)state.inspectorSelectedId=n(state.inspectorSelf.enrollment.id);
        if(state.inspectorSelectedId){try{state.inspectorScheduleDetail=(await API.get(`/bbs/inspectors/${state.inspectorSelectedId}/schedule?year=${year}&month=${month}`)).data;}catch(_error){state.inspectorScheduleDetail=null;}}
    } catch (error) {
        console.warn('[bbs] inspector team management is unavailable:', error?.message || error);
        throw error;
    }
}
async function appointInspector(event){event.preventDefault();const form=new FormData(event.currentTarget),candidate=(state.inspectorAdmin?.candidates||[]).find(row=>String(row.EmployeeID)===String(form.get('inspectorEmployeeId')));if(!candidate)return showToast('กรุณาเลือกหัวหน้ากลุ่ม','error');try{const result=await API.post('/bbs/admin/inspectors',{inspectorEmployeeId:candidate.EmployeeID,departmentId:n(candidate.DepartmentID),safetyUnitId:n(candidate.SafetyUnitID),status:'Active',kpiRequired:event.currentTarget.elements.kpiRequired.checked,allowSelfManage:event.currentTarget.elements.allowSelfManage.checked,effectiveFrom:form.get('effectiveFrom'),effectiveTo:null,reason:'Appointed by Admin'});state.inspectorSelectedId=n(result.data?.id);showToast('แต่งตั้งผู้ตรวจ BBS แล้ว','success');await loadInspectorData();if(state.inspectorSelectedId)state.inspectorTeam=(await API.get(`/bbs/inspectors/${state.inspectorSelectedId}/team`)).data;render();}catch(error){showToast(error?.message||'แต่งตั้งผู้ตรวจไม่สำเร็จ','error');}}
async function openInspectorTeam(id){try{state.inspectorSelectedId=id;const{year,month}=state.inspectorScheduleFilters;const[team,schedule]=await Promise.all([API.get(`/bbs/inspectors/${id}/team`),API.get(`/bbs/inspectors/${id}/schedule?year=${year}&month=${month}`)]);state.inspectorTeam=team.data;state.inspectorScheduleDetail=schedule.data;render();}catch(error){showToast(error?.message||'เปิดทีมและตารางตรวจไม่สำเร็จ','error');}}
async function updateInspectorSetting(id,mode){const row=(state.inspectorAdmin?.enrollments||[]).find(item=>n(item.id)===n(id));if(!row)return;const payload={rowVersion:n(row.RowVersion),inspectorEmployeeId:row.InspectorEmployeeID,departmentId:n(row.DepartmentID),safetyUnitId:n(row.SafetyUnitID),status:mode==='status'?(row.Status==='Active'?'Suspended':'Active'):row.Status,kpiRequired:mode==='kpi'?!n(row.KpiRequired):Boolean(n(row.KpiRequired)),allowSelfManage:mode==='self'?!n(row.AllowSelfManage):Boolean(n(row.AllowSelfManage)),effectiveFrom:String(row.EffectiveFrom).slice(0,10),effectiveTo:row.EffectiveTo?String(row.EffectiveTo).slice(0,10):null,isActive:Boolean(n(row.IsActive)),reason:row.Reason||'Updated by Admin'};try{await API.put(`/bbs/admin/inspectors/${id}`,payload);showToast('บันทึกการตั้งค่าผู้ตรวจแล้ว','success');await loadInspectorData();render();}catch(error){showToast(error?.message||'บันทึกการตั้งค่าไม่สำเร็จ','error');}}
async function addInspectorTeamMember(event){event.preventDefault();const id=n(event.currentTarget.dataset.enrollmentId),memberId=new FormData(event.currentTarget).get('memberEmployeeId');try{await API.post(`/bbs/inspectors/${id}/team`,{memberEmployeeId:memberId,effectiveFrom:new Date().toLocaleDateString('en-CA'),reason:state.context?.permissions?.configure?'Assigned by Admin':'Selected by appointed Group Leader'});showToast('เพิ่มสมาชิกเข้าทีมแล้ว','success');await loadInspectorData();if(state.context?.permissions?.configure)state.inspectorTeam=(await API.get(`/bbs/inspectors/${id}/team`)).data;render();}catch(error){showToast(error?.message||'เพิ่มสมาชิกไม่สำเร็จ','error');}}
async function removeInspectorTeamMember(enrollmentId,assignmentId){if(!window.confirm('นำพนักงานคนนี้ออกจากทีม? ประวัติเดิมจะยังคงอยู่'))return;try{await API.delete(`/bbs/inspectors/${enrollmentId}/team/${assignmentId}`);showToast('นำสมาชิกออกจากทีมแล้ว','success');await loadInspectorData();if(state.context?.permissions?.configure)state.inspectorTeam=(await API.get(`/bbs/inspectors/${enrollmentId}/team`)).data;render();}catch(error){showToast(error?.message||'นำสมาชิกออกไม่สำเร็จ','error');}}
async function saveInspectorSchedule(event){event.preventDefault();const id=n(event.currentTarget.dataset.enrollmentId),form=new FormData(event.currentTarget),weekdays=[...event.currentTarget.querySelectorAll('[name="weekdays"]:checked')].map(input=>n(input.value));try{await API.put(`/bbs/admin/inspectors/${id}/schedule`,{scheduleName:form.get('scheduleName'),weekdays,targetCount:n(form.get('targetCount')),effectiveFrom:form.get('effectiveFrom'),effectiveTo:form.get('effectiveTo')||null,reason:form.get('reason')});showToast('บันทึกตารางตรวจเวอร์ชันใหม่แล้ว','success');await loadInspectorData();render();}catch(error){showToast(error?.message||'บันทึกตารางตรวจไม่สำเร็จ','error');}}
async function saveInspectorOverride(event){event.preventDefault();const id=n(event.currentTarget.dataset.enrollmentId),form=new FormData(event.currentTarget),type=form.get('overrideType');try{await API.put(`/bbs/admin/inspectors/${id}/schedule-overrides/${form.get('scheduleDate')}`,{overrideType:type,targetCount:type==='Required'?n(form.get('targetCount')):null,reason:form.get('reason')});showToast('บันทึกวันตรวจพิเศษแล้ว','success');await loadInspectorData();render();}catch(error){showToast(error?.message||'บันทึกวันตรวจพิเศษไม่สำเร็จ','error');}}
async function removeInspectorOverride(id,date){if(!window.confirm(`ยกเลิกการกำหนดเฉพาะวันที่ ${date}?`))return;try{await API.delete(`/bbs/admin/inspectors/${id}/schedule-overrides/${date}`);showToast('ยกเลิกวันพิเศษแล้ว','success');await loadInspectorData();render();}catch(error){showToast(error?.message||'ยกเลิกวันพิเศษไม่สำเร็จ','error');}}

async function loadHistory() { const f=state.historyFilters,q=new URLSearchParams({paged:'1',page:String(f.page),pageSize:String(f.pageSize),view:state.view,year:String(state.historyYear||yearNow)});for(const key of ['status','departmentId','safetyUnitId','q'])if(f[key]!==''&&f[key]!==null)q.set(key,String(f[key]));const payload=(await API.get(`/bbs/observations?${q}`)).data;state.history=listRows(payload);state.listMeta.history=listPagination(payload); }
async function loadCardAdmin() { if(!state.context?.permissions?.configure)return;const ef=state.cardEmployeeFilters,cf=state.cardFilters,employeeQuery=new URLSearchParams({paged:'1',page:String(ef.page),pageSize:String(ef.pageSize)}),cardQuery=new URLSearchParams({paged:'1',page:String(cf.page),pageSize:String(cf.pageSize)});for(const key of ['q','departmentId'])if(ef[key]!==''&&ef[key]!==null)employeeQuery.set(key,String(ef[key]));for(const key of ['q','status','departmentId'])if(cf[key]!==''&&cf[key]!==null)cardQuery.set(key,String(cf[key]));const[foundation,templates,employees,cards]=await Promise.all([API.get('/bbs/admin/foundation').catch(()=>({data:null})),API.get('/bbs/admin/card-templates'),API.get(`/bbs/admin/card-employees?${employeeQuery}`),API.get(`/bbs/admin/cards?${cardQuery}`)]);if(foundation.data){state.masterReference=foundation.data;state.communityAdmin={...state.communityAdmin,departments:foundation.data.departments||state.communityAdmin.departments};}state.cardTemplates=templates.data||[];state.cardEmployees=listRows(employees.data);state.listMeta.cardEmployees=listPagination(employees.data);state.cards=listRows(cards.data);state.listMeta.cards=listPagination(cards.data); }
async function loadCoreData() {
    const ownDraftRequest = state.context?.permissions?.observe
        ? API.get('/bbs/observations?view=observer&status=Draft')
        : Promise.resolve({ data: [] });
    const [workspace, eligible, history, ownHistory, actionSummary, activeBatch] = await Promise.all([
        API.get('/bbs/workspace'),
        state.context?.permissions?.observe ? API.get('/bbs/eligible-employees') : Promise.resolve({ data:{ rows:[] } }),
        API.get(`/bbs/observations?paged=1&page=${state.historyFilters.page}&pageSize=${state.historyFilters.pageSize}&view=${state.view}&year=${state.historyYear}`),
        ownDraftRequest,
        API.get('/bbs/actions/summary'),
        state.context?.permissions?.observe && state.context?.batchObservationEnabled
            ? API.get('/bbs/batch-observations/draft/active').catch(() => ({ data:null }))
            : Promise.resolve({ data:null })
    ]);
    state.workspace = workspace.data;
    state.eligible = eligible.data?.rows || [];
    const readyIds = new Set(state.eligible.filter(row => checklistReadinessMeta(row).ready).map(row => String(row.EmployeeID)));
    state.batchSelected = state.batchSelected.filter(id => readyIds.has(String(id)));
    state.history = listRows(history.data);
    state.listMeta.history = listPagination(history.data);
    state.loadedAt.history = new Date().toISOString();
    delete state.loadErrors.history;
    state.ownDrafts = (ownHistory.data || []).filter(row => row.Status === 'Draft');
    state.actionSummary = actionSummary.data || {};
    if (!state.batchDraft && activeBatch.data) {
        state.batchDraft = activeBatch.data;
        try {
            const recovery = JSON.parse(localStorage.getItem(batchRecoveryKey()) || '{}');
            if (n(recovery.id) === n(state.batchDraft.id)) state.batchStep = Math.max(1, n(recovery.step) || 1);
        } catch (_) {
            state.batchStep = 1;
        }
    }
}
async function loadData() {
    await Promise.all([
        trackSectionLoad('community', loadCommunity),
        trackSectionLoad('inspectors', loadInspectorData)
    ]);
    if (!state.context?.configurationReady && !state.context?.permissions?.companyRead) return;
    await Promise.all([
        trackSectionLoad('core', loadCoreData),
        state.context?.permissions?.configure ? trackSectionLoad('cards', loadCardAdmin) : Promise.resolve(null)
    ]);
}

async function uploadCardTemplate(event){event.preventDefault();try{const form=new FormData(event.currentTarget);form.set('includeEmployeeId',event.currentTarget.elements.includeEmployeeId.checked?'1':'0');await API.post('/bbs/admin/card-templates',form);showToast('อัปโหลด Card Template เป็น Draft แล้ว','success');await loadCardAdmin();render();}catch(error){showToast(error?.message||'อัปโหลด Template ไม่สำเร็จ','error');}}
async function transitionTemplate(id,rowVersion,action){if(action==='activate')return openCardTemplatePreview('personal',id,{intent:'activate',onConfirm:()=>performTemplateTransition(id,rowVersion,action)});return performTemplateTransition(id,rowVersion,action);}
async function performTemplateTransition(id,rowVersion,action){try{await API.put(`/bbs/admin/card-templates/${id}`,{rowVersion,action});showToast(action==='activate'?'เปิดใช้ Template แล้ว':'Archive Template แล้ว','success');await loadCardAdmin();render();}catch(error){showToast(error?.message||'เปลี่ยนสถานะ Template ไม่สำเร็จ','error');}}
async function previewTemplate(id){return openCardTemplatePreview('personal',id);}
function openCardPrintPopup(){const popup=window.open('','_blank');if(!popup){showToast('Popup is blocked. Allow popups before issuing or replacing a card. No card was changed.','error');return null;}popup.document.open();popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparing BBS cards</title></head><body style="font-family:Arial,sans-serif;padding:32px"><h2>Preparing BBS Smart Card...</h2><p>Keep this window open while the secure QR is generated.</p></body></html>');popup.document.close();return popup;}
async function preloadCardBackgrounds(templateIds){const backgrounds=new Map();for(const templateId of [...new Set(templateIds.map(n).filter(Boolean))]){const response=await apiFetch(`/bbs/admin/card-templates/${templateId}/file`);backgrounds.set(templateId,await blobDataUrl(await response.blob()));}return backgrounds;}
async function issueCards(previewConfirmed=false){const employeeIds=[...document.querySelectorAll('[data-card-employee]:checked')].map(el=>el.dataset.cardEmployee);const templateId=n(document.getElementById('bbs-issue-template')?.value),template=cardTemplateRecord('personal',templateId);if(!employeeIds.length||!templateId||!template)return showToast('กรุณาเลือกพนักงานและ Active Template','error');const selectedEmployees=employeeIds.map(id=>state.cardEmployees.find(row=>String(row.EmployeeID)===String(id))).filter(Boolean),incompatible=selectedEmployees.filter(row=>!personalTemplateMatchesEmployee(template,row));if(incompatible.length)return showToast(`Template ไม่ตรงกับพนักงาน ${incompatible[0].EmployeeName}${incompatible.length>1?` และอีก ${incompatible.length-1} คน`:''}`,'error');if(!previewConfirmed){return openCardTemplatePreview('personal',templateId,{intent:'issue',employee:selectedEmployees[0],onConfirm:()=>issueCards(true)});}if(typeof window.qrcode!=='function')return showToast('QR library is unavailable. No card was changed.','error');const popup=openCardPrintPopup();if(!popup)return;let issued=false;try{const backgrounds=await preloadCardBackgrounds([templateId]);const result=await API.post('/bbs/admin/cards/issue',{employeeIds,templateId,reason:'Initial issue'});issued=true;await printIssuedCards(result.data||[],'Initial issue',popup,backgrounds);await loadCardAdmin();render();}catch(error){if(!issued&&!popup.closed)popup.close();showToast(error?.message||'ออกบัตรไม่สำเร็จ','error');}}
async function replaceCard(id,previewConfirmed=false){const current=state.cards.find(row=>n(row.id)===n(id));if(!current)return showToast('ไม่พบบัตร Active ที่เลือก','error');if(!previewConfirmed){const employee=state.cardEmployees.find(row=>String(row.EmployeeID)===String(current.EmployeeID))||current;return openCardTemplatePreview('personal',n(current.TemplateID),{intent:'replace',employee,onConfirm:()=>replaceCard(id,true)});}const reason=window.prompt('เหตุผลการออกบัตรใหม่ / พิมพ์ซ้ำ','Replace / reprint');if(reason===null||!reason.trim())return;if(typeof window.qrcode!=='function')return showToast('QR library is unavailable. No card was changed.','error');const popup=openCardPrintPopup();if(!popup)return;let issued=false;try{const backgrounds=await preloadCardBackgrounds([current.TemplateID]);const result=await API.post(`/bbs/admin/cards/${id}/replace`,{reason:reason.trim()});issued=true;await printIssuedCards([result.data],reason.trim(),popup,backgrounds);await loadCardAdmin();render();}catch(error){if(!issued&&!popup.closed)popup.close();showToast(error?.message||'ออกบัตรใหม่ไม่สำเร็จ','error');}}
async function revokeCard(id){const reason=window.prompt('ระบุเหตุผล เช่น บัตรสูญหาย');if(reason===null||!reason.trim())return;try{await API.post(`/bbs/admin/cards/${id}/revoke`,{reason:reason.trim()});showToast('ยกเลิก QR ใบเดิมแล้ว','success');await loadCardAdmin();render();}catch(error){showToast(error?.message||'Revoke ไม่สำเร็จ','error');}}
function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
function qrDataUrl(text){const qr=window.qrcode(0,'M');qr.addData(text);qr.make();return qr.createDataURL(6,0);}
async function printIssuedCards(cards,reason,popup,backgrounds=new Map()){if(!cards.length){if(popup&&!popup.closed)popup.close();return;}try{for(const card of cards){if(!backgrounds.has(n(card.templateId))){const response=await apiFetch(`/bbs/admin/card-templates/${card.templateId}/file`);backgrounds.set(n(card.templateId),await blobDataUrl(await response.blob()));}}const pages=cards.map(card=>`<article class="card" style="width:${n(card.widthMM)}mm;height:${n(card.heightMM)}mm;background-image:linear-gradient(90deg,rgba(255,255,255,.96),rgba(255,255,255,.58)),url('${backgrounds.get(n(card.templateId))}')"><div class="safe"></div><div class="identity"><div class="avatar">${escHtml((card.employeeName||'?').trim().charAt(0).toUpperCase())}</div><div class="name">${escHtml(card.employeeName)}</div><div class="meta">${escHtml(card.department||'-')} / ${escHtml(card.unit||'-')}</div><div class="meta">${escHtml(card.position||'-')}</div>${card.includeEmployeeId?`<div class="emp">${escHtml(card.employeeId)}</div>`:''}</div><div class="qr"><img src="${qrDataUrl(card.qrUrl)}"><strong>BBS SMART CARD</strong><small>Scan → Login → Workspace</small></div></article>`).join('');popup.document.open();popup.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>BBS Smart Card Print</title><style>@page{size:A4;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Kanit,Arial,sans-serif;color:#0f172a}.sheet{display:grid;grid-template-columns:repeat(2,85.6mm);gap:5mm;align-content:start}.card{position:relative;overflow:hidden;background-size:cover;background-position:center;border:.2mm dashed #f97316;border-radius:3mm;break-inside:avoid;display:flex;justify-content:space-between;padding:5mm}.safe{position:absolute;inset:4%;border:.2mm dashed #0891b2;pointer-events:none}.identity{width:55mm;min-width:0;z-index:1}.avatar{width:14mm;height:14mm;border-radius:50%;background:#047857;color:#fff;display:flex;align-items:center;justify-content:center;font-size:7mm;font-weight:900}.name{font-size:4.2mm;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2mm}.meta{font-size:2.7mm;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1mm}.emp{font:900 3.2mm monospace;margin-top:2mm}.qr{width:23mm;text-align:center;align-self:end;z-index:1}.qr img{width:22mm;height:22mm;display:block;background:#fff}.qr strong{font-size:2.2mm;display:block;margin-top:1mm}.qr small{font-size:1.7mm;display:block}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.safe{display:none}}</style></head><body><main class="sheet">${pages}</main><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);popup.document.close();try{await API.post('/bbs/admin/cards/print-log',{cardIds:cards.map(card=>card.cardId),reason});}catch(logError){console.warn('[bbs] card print log failed:',logError?.message||logError);showToast('Cards are ready to print, but the print log could not be saved.','error');return;}showToast(`เตรียมพิมพ์ ${cards.length} บัตรแล้ว`,'success');}catch(error){if(popup&&!popup.closed){popup.document.open();popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>BBS card recovery</title></head><body style="font-family:Arial,sans-serif;padding:32px"><h2>Card was issued, but the print page could not be rendered.</h2><p>Keep this window open and contact Admin before replacing the card.</p></body></html>');popup.document.close();}showToast(error?.message||'สร้างไฟล์พิมพ์ไม่สำเร็จ','error');}}

export async function loadBbsSmartCardPage() {
    const page = document.getElementById('bbs-smart-card-page'); if (!page) return;
    page.innerHTML = `<div role="status" aria-live="polite" class="h-64 flex items-center justify-center text-emerald-700 font-bold">กำลังโหลด BBS Smart Card...</div>`;
    try { state.context = (await API.get('/bbs/me/context')).data; await loadData(); const qrEmployee=sessionStorage.getItem('bbs_qr_observed_employee'),communityDepartment=sessionStorage.getItem('bbs_community_department_id'),adminWorkspace=sessionStorage.getItem('bbs_admin_workspace');if(qrEmployee){sessionStorage.removeItem('bbs_qr_observed_employee');await startObservation(qrEmployee);}else{if(communityDepartment){sessionStorage.removeItem('bbs_community_department_id');state.tab='community';}else if(adminWorkspace&&state.context?.permissions?.configure){const allowed=new Set(['workspace','team-management','cards']);sessionStorage.removeItem('bbs_admin_workspace');if(allowed.has(adminWorkspace))state.tab=adminWorkspace;}render();} } catch (error) { page.innerHTML = `<section role="alert" class="rounded-2xl border border-rose-200 bg-white p-10 text-center"><h3 class="font-black text-slate-800">ไม่สามารถเปิด BBS Smart Card</h3><p class="text-sm text-slate-500 mt-2">${escHtml(errorText(error))}</p><button type="button" data-bbs-page-reload class="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">ลองเชื่อมต่อใหม่</button></section>`;page.querySelector('[data-bbs-page-reload]')?.addEventListener('click',()=>loadBbsSmartCardPage()); }
}
