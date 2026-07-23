import { guardSubmitHandler } from '../utils/async-ui.js?v=20260715-phase32d-remaining-async-ux';
import { API } from '../api.js';
import { closeModal, escHtml, openModal, showToast } from '../ui.js';

let _conversationId = null;
let _conversations = [];
let _messages = [];
let _status = null;
let _kbDocs = [];
let _kbLoadError = '';
let _operationalLogs = [];
let _operationalLogError = '';
let _operationalLogFilters = { level: '', operation: '' };
let _observability = null;
let _observabilityError = '';
let _observabilityDays = 7;
let _kbFilters = { status: '', quality: '', source: '', category: '', query: '' };
let _busy = false;
let _kbBusy = false;
let _avatarBusy = false;
let _isAdmin = false;
let _activeTab = 'chat';
let _kbEditId = null;
let _kbReindexingIds = new Set();
let _kbRefiningIds = new Set();
let _kbOperationTimer = null;
let _selectedRiskImage = null;
let _riskImagePreviewUrl = '';
let _thinkingStartedAt = 0;
let _thinkingTimer = null;

const RISK_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const RISK_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const IMAGE_RISK_DRAFT_KEY = 'johnny_image_risk_draft';
const JOHNNY_PHASE2_MARKER = 'JOHNNY_PHASE2_MOBILE_FIELD_UX';
const JOHNNY_PHASE3_MARKER = 'JOHNNY_PHASE3_KB_QUALITY_ADMIN';
const JOHNNY_PHASE4_MARKER = 'JOHNNY_PHASE4_OBSERVABILITY';
const JOHNNY_PHASE5_MARKER = 'JOHNNY_PHASE5_WORKFLOW_INTEGRATION';

const QUICK_PROMPTS_LEGACY = [
    'PPE สำหรับงานเจียรควรมีอะไรบ้าง',
    'อธิบาย Hiyari Hatto แบบง่ายสำหรับพนักงานใหม่',
    'ISO 45001 เกี่ยวข้องกับพนักงานอย่างไร',
    'KY Ability ก่อนเริ่มงานควรคิดเรื่องอะไรบ้าง',
    'ถ้าเจอสารเคมีหกรั่วไหลควรทำอย่างไร',
    'ช่วยวิเคราะห์อันตรายจากรูปหน้างานนี้',
];

const QUICK_PROMPTS = [
    'ช่วยวิเคราะห์อันตรายจากรูปหน้างานนี้',
    'สรุปกฎความปลอดภัยจากเอกสารให้เข้าใจง่าย',
    'สิ่งนี้ทำได้ไหม ตามกฎบริษัท',
    'ช่วยทำ KY ก่อนเริ่มงานจากสถานการณ์นี้',
    'ช่วยร่าง Hiyari Hatto จากเหตุการณ์นี้',
    'ถ้าเจอสภาพไม่ปลอดภัย ต้องทำอย่างไรทันที',
    'PPE ที่เหมาะกับงานนี้ควรมีอะไรบ้าง',
    'ค้นข้อมูลจาก Knowledge Base ให้หน่อย',
];

const FIELD_USE_PROMPTS = [
    { label: 'วิเคราะห์รูป', prompt: 'ช่วยวิเคราะห์อันตรายจากรูปหน้างานนี้แบบสั้น ชัด และบอกสิ่งที่ต้องทำทันที' },
    { label: 'PPE งานนี้', prompt: 'PPE ที่เหมาะกับงานนี้ควรมีอะไรบ้าง และต้องเช็คอะไรเพิ่มก่อนเริ่มงาน' },
    { label: 'KY ก่อนเริ่ม', prompt: 'ช่วยทำ KY ก่อนเริ่มงานจากสถานการณ์นี้ โดยสรุปอันตราย มาตรการ และคนรับผิดชอบ' },
    { label: 'Near Miss', prompt: 'ถ้าเจอเหตุการณ์เกือบเกิดอุบัติเหตุแบบนี้ ควรบันทึกและแก้ไขอย่างไร' },
    { label: 'Patrol พบเสี่ยง', prompt: 'พบสภาพไม่ปลอดภัยระหว่าง Safety Patrol ต้องควบคุมหน้างานและติดตามอย่างไร' },
    { label: 'สารเคมีรั่ว', prompt: 'ถ้าเจอสารเคมีหกหรือรั่วไหล ต้องทำอะไรทันทีและต้องแจ้งใครบ้าง' },
];

function pageEl() {
    return document.getElementById('johnny-ai-page');
}

function normalizeCitations(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function johnnyAvatar(sizeClass = 'w-9 h-9', textClass = 'text-sm') {
    const src = _status?.johnnyAvatarUrl || _status?.avatarUrl || '';
    if (src) {
        return `<img src="${escHtml(src)}" alt="Johnny AI" class="${sizeClass} rounded-2xl object-cover shadow-sm flex-shrink-0 border border-emerald-100 bg-white">`;
    }
    return `
        <div class="${sizeClass} rounded-2xl flex items-center justify-center text-white ${textClass} font-black shadow-sm flex-shrink-0"
             style="background:linear-gradient(135deg,#064e3b,#0d9488)">J</div>
    `;
}

function sourceBadge(sourceType = 'ai_general') {
    if (sourceType === 'company_document') {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">ข้อมูลจากเอกสารบริษัท</span>';
    }
    if (sourceType === 'safety_knowledge') {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100">Safety Knowledge</span>';
    }
    if (sourceType === 'external_research') {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-100">ข้อมูลจากการค้นคว้าภายนอก</span>';
    }
    if (sourceType === 'system_data') {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-lime-50 text-lime-700 border border-lime-100">ข้อมูลจากระบบ TSH SCA</span>';
    }
    if (sourceType === 'image_analysis') {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-100">วิเคราะห์ความเสี่ยงจากรูปภาพ</span>';
    }
    if (sourceType === 'not_verified') {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">ไม่พบข้อมูลที่ยืนยันได้</span>';
    }
    return '<span class="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-100">ข้อมูลจากความรู้ทั่วไปของ AI</span>';
}

function fieldQuickPromptsHtml(limit = FIELD_USE_PROMPTS.length, extraClass = '') {
    return FIELD_USE_PROMPTS.slice(0, limit).map(item => `
        <button type="button"
                class="johnny-quick johnny-field-chip ${extraClass} shrink-0 rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-black text-emerald-800 shadow-sm hover:bg-emerald-50"
                data-prompt="${escHtml(item.prompt)}">
            ${escHtml(item.label)}
        </button>
    `).join('');
}

function imageAnalysisFieldCardHtml(sourceType) {
    if (sourceType !== 'image_analysis') return '';
    return `
        <div class="johnny-image-result-card mt-2 rounded-2xl border border-rose-100 bg-rose-50/80 p-3 text-xs text-rose-900">
            <div class="flex items-start gap-2">
                <span class="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-sm">📷</span>
                <div class="min-w-0">
                    <div class="font-black">อ่านผลจากรูปให้ง่ายขึ้น</div>
                    <div class="mt-1 leading-relaxed text-rose-800/85">ให้ใช้ผลนี้เป็นการคัดกรองเบื้องต้นหน้างาน: หยุดงานที่เสี่ยงสูง, กั้นพื้นที่, แจ้งหัวหน้างาน/SHE และตรวจจริงก่อนตัดสินใจ</div>
                </div>
            </div>
        </div>
    `;
}

async function copyJohnnyAnswer(messageIndex) {
    const msg = _messages[Number(messageIndex)];
    const text = String(msg?.MessageText || msg?.text || msg?.answer || '').trim();
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        showToast('คัดลอกคำตอบ Johnny แล้ว', 'success');
    } catch {
        showToast('คัดลอกอัตโนมัติไม่ได้ กรุณาแตะค้างเพื่อคัดลอก', 'warning');
    }
}

function updateComposerMode() {
    const sendBtn = document.getElementById('johnny-send');
    const input = document.getElementById('johnny-input');
    const imageBtn = document.getElementById('johnny-image-pick');
    if (sendBtn && !_busy) {
        sendBtn.textContent = _selectedRiskImage ? 'วิเคราะห์รูป' : 'ส่ง';
        sendBtn.classList.toggle('bg-rose-600', Boolean(_selectedRiskImage));
        sendBtn.classList.toggle('hover:bg-rose-700', Boolean(_selectedRiskImage));
        sendBtn.classList.toggle('bg-emerald-600', !Boolean(_selectedRiskImage));
        sendBtn.classList.toggle('hover:bg-emerald-700', !Boolean(_selectedRiskImage));
    }
    if (input) {
        input.placeholder = _selectedRiskImage
            ? 'เพิ่มบริบท เช่น จุดที่ถ่าย งานที่ทำ หรือสิ่งที่กังวล'
            : 'ถาม Johnny';
    }
    if (imageBtn) {
        imageBtn.classList.toggle('ring-2', Boolean(_selectedRiskImage));
        imageBtn.classList.toggle('ring-rose-300', Boolean(_selectedRiskImage));
    }
}

function normalizeAnswerQuality(msg) {
    const raw = msg?.AnswerQuality ?? msg?.answerQuality ?? msg?.quality ?? null;
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }
    return typeof raw === 'object' ? raw : null;
}

function answerQualityBadgeHtml(msg) {
    const quality = normalizeAnswerQuality(msg);
    if (!quality || Number(quality.phase || 0) < 1) return '';
    const confidence = String(quality.confidence || 'medium').toLowerCase();
    const confidenceMeta = confidence === 'high'
        ? { label: 'มั่นใจสูง', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
        : confidence === 'low'
            ? { label: 'ต้องตรวจสอบ', cls: 'bg-amber-50 text-amber-700 border-amber-100' }
            : { label: 'มั่นใจปานกลาง', cls: 'bg-sky-50 text-sky-700 border-sky-100' };
    const badges = [
        `<span class="inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-black ${confidenceMeta.cls}">${confidenceMeta.label}</span>`,
    ];
    if (quality.hasVerifiedSource) {
        badges.push('<span class="inline-flex items-center rounded-full border border-emerald-100 bg-white px-2 py-1 text-[11px] font-black text-emerald-700">มีแหล่งยืนยัน</span>');
    }
    if (quality.noVerifiedSource) {
        badges.push('<span class="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">ยังไม่พบแหล่งยืนยัน</span>');
    }
    if (quality.safetyCritical) {
        badges.push('<span class="inline-flex items-center rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">Safety critical</span>');
    }
    if (quality.emergencyEscalation) {
        badges.push('<span class="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">ควร Escalate</span>');
    }
    return `<div class="mt-2 flex flex-wrap items-center gap-2" data-johnny-phase1-quality="true">${badges.join('')}</div>`;
}

function renderText(text) {
    return escHtml(text || '').replace(/\n/g, '<br>');
}

function imageRiskDraftActions(msg, sourceType) {
    if (sourceType !== 'image_analysis' || msg.isTyping) return '';
    const id = String(msg.id || msg.messageId || '');
    return `
        <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="johnny-risk-draft-btn px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-[11px] font-black text-orange-700 hover:bg-orange-100" data-target="hiyari" data-message-id="${escHtml(id)}">
                Hiyari draft
            </button>
            <button type="button" class="johnny-risk-draft-btn px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-[11px] font-black text-indigo-700 hover:bg-indigo-100" data-target="ky" data-message-id="${escHtml(id)}">
                KY draft
            </button>
            <button type="button" class="johnny-risk-draft-btn px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[11px] font-black text-emerald-700 hover:bg-emerald-100" data-target="patrol" data-message-id="${escHtml(id)}">
                Patrol issue draft
            </button>
        </div>
    `;
}

function workflowActionTargets(msg, sourceType) {
    if (msg.isTyping || (msg.Role || msg.role) === 'user') return [];
    const text = String(msg.MessageText || msg.answer || msg.text || '').toLowerCase();
    const citations = normalizeCitations(msg.CitationsJson ?? msg.citations);
    const haystack = [
        text,
        sourceType,
        ...citations.map(item => `${item.type || ''} ${item.title || ''} ${item.sourceLabel || ''}`),
    ].join(' ').toLowerCase();
    const targets = [];
    if (/(patrol|safety patrol|เดินตรวจ|ตรวจความปลอดภัย)/i.test(haystack)) {
        targets.push({ id: 'patrol', label: 'Open Patrol', hash: '#patrol' });
    }
    if (/(hiyari|near miss|near-miss|ไฮยาริ|อุบัติการณ์|incident)/i.test(haystack)) {
        targets.push({ id: 'hiyari', label: 'Open Hiyari', hash: '#hiyari' });
    }
    if (/(^|\s)(ky|kyt)(\s|$)|ky ability|kiken yochi|อันตรายก่อนเริ่มงาน/i.test(haystack)) {
        targets.push({ id: 'ky', label: 'Open KY', hash: '#ky' });
    }
    return targets.filter((item, index, arr) => arr.findIndex(other => other.id === item.id) === index);
}

function workflowActionButtons(msg, sourceType) {
    const targets = workflowActionTargets(msg, sourceType);
    if (!targets.length) return '';
    const id = String(msg.id || msg.messageId || '');
    return `
        <div class="mt-2 flex flex-wrap gap-2" data-johnny-phase5="${JOHNNY_PHASE5_MARKER}">
            ${targets.map(target => `
                <button type="button" class="johnny-workflow-action px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-black text-slate-700 hover:bg-slate-50"
                        data-target="${escHtml(target.id)}" data-action="deep_link" data-message-id="${escHtml(id)}" data-source-type="${escHtml(sourceType)}">
                    ${escHtml(target.label)}
                </button>
            `).join('')}
        </div>
    `;
}

function citationGroups(citations) {
    return citations.reduce((groups, item) => {
        const type = item.type || (item.url ? 'external_research' : 'company_document');
        if (!groups[type]) groups[type] = [];
        groups[type].push(item);
        return groups;
    }, {});
}

function citationSectionTitle(type) {
    if (type === 'external_research') return 'ข้อมูลจากการค้นคว้าภายนอก';
    if (type === 'company_document') return 'ข้อมูลจากเอกสารบริษัท';
    if (type === 'safety_knowledge') return 'Safety Knowledge';
    if (type === 'system_data') return 'ข้อมูลจากระบบ TSH SCA';
    if (type === 'image_analysis') return 'การวิเคราะห์รูปภาพ';
    return 'แหล่งอ้างอิง';
}

function citationTheme(type) {
    if (type === 'safety_knowledge') {
        return {
            box: 'border-amber-100 bg-amber-50/70',
            title: 'text-amber-800',
            link: 'text-amber-800 hover:text-amber-950 underline decoration-amber-300',
            badge: 'bg-amber-100 text-amber-800 border-amber-200',
            muted: 'text-amber-700/75',
        };
    }
    if (type === 'system_data') {
        return {
            box: 'border-lime-100 bg-lime-50/70',
            title: 'text-lime-800',
            link: 'text-lime-800 hover:text-lime-950 underline decoration-lime-300',
            badge: 'bg-lime-100 text-lime-800 border-lime-200',
            muted: 'text-lime-700/75',
        };
    }
    if (type === 'external_research') {
        return {
            box: 'border-sky-100 bg-sky-50/70',
            title: 'text-sky-800',
            link: 'text-sky-800 hover:text-sky-950 underline decoration-sky-300',
            badge: 'bg-sky-100 text-sky-800 border-sky-200',
            muted: 'text-sky-700/75',
        };
    }
    if (type === 'image_analysis') {
        return {
            box: 'border-rose-100 bg-rose-50/70',
            title: 'text-rose-800',
            link: 'text-rose-800 hover:text-rose-950 underline decoration-rose-300',
            badge: 'bg-rose-100 text-rose-800 border-rose-200',
            muted: 'text-rose-700/75',
        };
    }
    return {
        box: 'border-emerald-100 bg-emerald-50/70',
        title: 'text-emerald-800',
        link: 'text-emerald-800 hover:text-emerald-950 underline decoration-emerald-300',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        muted: 'text-emerald-700/75',
    };
}

function displayHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function citationHtml(msg) {
    const citations = normalizeCitations(msg.CitationsJson ?? msg.citations);
    if (!citations.length) return '';
    const groups = citationGroups(citations);
    const order = ['image_analysis', 'company_document', 'safety_knowledge', 'system_data', 'external_research', ...Object.keys(groups).filter(type => !['image_analysis', 'company_document', 'safety_knowledge', 'system_data', 'external_research'].includes(type))];
    const activeTypes = order.filter(type => groups[type]?.length);
    const total = activeTypes.reduce((sum, type) => sum + groups[type].length, 0);
    const summaryText = activeTypes
        .map(type => `${citationSectionTitle(type).replace(/^ข้อมูลจาก/, '')} ${groups[type].length}`)
        .join(' • ');
    const groupHtml = activeTypes.map(type => {
        const theme = citationTheme(type);
        const items = groups[type].slice(0, 3);
        const hiddenCount = Math.max(0, groups[type].length - items.length);
        return `
            <div class="rounded-xl border ${theme.box} px-3 py-2">
                <div class="mb-2 flex items-center justify-between gap-2">
                    <div class="text-[11px] font-black ${theme.title}">${citationSectionTitle(type)}</div>
                    <div class="text-[10px] font-bold ${theme.muted}">${groups[type].length} แหล่ง</div>
                </div>
                <div class="space-y-1.5">
                    ${items.map((item, idx) => {
                        const href = item.fileUrl || item.url || item.uri || '';
                        const host = item.domain || displayHost(href);
                        const ref = `แหล่ง ${idx + 1}`;
                        const title = item.title || item.fileName || host || 'Knowledge Base';
                        const page = item.pageLabel ? ` • ${item.pageLabel}` : '';
                        const score = Number(item.hybridScore ?? item.score ?? 0);
                        const scoreText = score ? ` • match ${Math.round(score * 100)}%` : '';
                        const meta = [host, item.accessedAt ? `เข้าถึง ${String(item.accessedAt).slice(0, 10)}` : '', `${page}${scoreText}`.trim()].filter(Boolean).join(' • ');
                        const excerpt = item.excerpt || (Array.isArray(item.snippets) ? item.snippets[0] : '');
                        const hasTrace = Number.isFinite(score) && score > 0;
                        const hybridPercent = Number(item.hybridPercent ?? (score * 100));
                        const semanticPercent = Number(item.similarityPercent ?? ((item.similarityScore || 0) * 100));
                        const keywordPercent = Number(item.keywordPercent ?? ((item.keywordScore || 0) * 100));
                        const scoreWidth = Math.max(0, Math.min(100, hybridPercent || 0));
                        const trace = item.trace || {};
                        const titleHtml = href
                            ? `<a class="text-[12px] font-black ${theme.link}" href="${escHtml(href)}" target="_blank" rel="noopener">${escHtml(title)}</a>`
                            : `<div class="text-[12px] font-black ${theme.title}">${escHtml(title)}</div>`;
                        return `
                            <div class="rounded-lg bg-white/75 border border-white/70 px-2.5 py-2">
                                <div class="flex items-start gap-2">
                                    <span class="inline-flex min-w-12 justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-black ${theme.badge}">${escHtml(ref)}</span>
                                    <div class="min-w-0 flex-1">
                                        ${titleHtml}
                                        ${meta ? `<div class="mt-0.5 text-[10px] ${theme.muted}">${escHtml(meta)}</div>` : ''}
                                        ${(hasTrace || excerpt) ? `
                                            <details class="mt-1.5 rounded-lg border border-slate-100 bg-white/70 px-2 py-1.5">
                                                <summary class="cursor-pointer text-[10px] font-black text-slate-600">ดูรายละเอียด/Trace</summary>
                                                ${hasTrace ? `
                                                    <div class="mt-2 text-[10px] font-black text-slate-600">
                                                        hybrid ${hybridPercent.toFixed(1)}% • semantic ${semanticPercent.toFixed(1)}% • keyword ${keywordPercent.toFixed(1)}% • rank ${Number(item.rank || idx + 1)}
                                                    </div>
                                                    <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                                                        <div class="h-full rounded-full bg-emerald-500" style="width:${scoreWidth}%"></div>
                                                    </div>
                                                    <div class="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500 md:grid-cols-4">
                                                        <div>doc: ${escHtml(String(item.documentId || '-'))}</div>
                                                        <div>chunk: ${escHtml(String(Number(item.chunkIndex ?? 0) + 1))}</div>
                                                        <div>chunkId: ${escHtml(String(item.chunkId || '-'))}</div>
                                                        <div>min: ${Number(item.minScore || trace.threshold || 0).toFixed(2)}</div>
                                                        <div>method: ${escHtml(trace.method || 'embedding_cosine')}</div>
                                                        <div>tokens: ${escHtml(String(item.tokenEstimate || '-'))}</div>
                                                        <div>chars: ${escHtml(String(trace.chunkChars || '-'))}</div>
                                                        <div>selected: ${trace.selected === false ? 'no' : 'yes'}</div>
                                                    </div>
                                                ` : ''}
                                                ${excerpt ? `<div class="mt-2 text-[11px] text-slate-500 leading-relaxed">${escHtml(excerpt)}</div>` : ''}
                                            </details>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    ${hiddenCount ? `<div class="px-1 pt-0.5 text-[10px] font-bold ${theme.muted}">ซ่อนอีก ${hiddenCount} แหล่ง เพื่อให้หน้าแชทอ่านง่าย</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    return `
        <details class="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
            <summary class="cursor-pointer list-none">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-[11px] font-black text-emerald-800">แหล่งอ้างอิงที่ใช้ตอบ</div>
                    <div class="text-[10px] font-bold text-emerald-700/75">${total} แหล่ง • กดเพื่อดูรายละเอียด</div>
                </div>
                ${summaryText ? `<div class="mt-1 text-[10px] font-bold text-emerald-700/70">${escHtml(summaryText)}</div>` : ''}
            </summary>
            <div class="mt-2 space-y-2">
                ${groupHtml}
            </div>
        </details>
    `;
}

function thinkingElapsedSeconds() {
    return _thinkingStartedAt ? Math.max(0, Math.floor((Date.now() - _thinkingStartedAt) / 1000)) : 0;
}

function thinkingStageText(seconds = thinkingElapsedSeconds()) {
    if (seconds >= 30) return 'กำลังเรียบเรียงคำตอบให้ครบถ้วน อาจใช้เวลานิดหนึ่งครับ';
    if (seconds >= 15) return 'กำลังตรวจข้อมูลจากเอกสารและสรุปให้เข้าใจง่ายครับ';
    if (seconds >= 6) return 'กำลังค้นหลักฐานและจัดคำตอบให้เป็นข้อ ๆ ครับ';
    return 'จอห์นนี่กำลังคิดคำตอบให้ครับ';
}

function renderJohnnyTabs() {
    if (!_isAdmin) return '';
    const tabs = [
        {
            id: 'chat',
            label: 'แชทกับ Johnny',
            mobileLabel: 'Chat',
            sub: 'ถามคำถามและวิเคราะห์รูป',
            icon: '<svg class="johnny-tab-icon h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a10.6 10.6 0 0 1-3.78-.69L3 20l1.4-3.74A7.2 7.2 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" /></svg>',
            badge: '',
        },
        {
            id: 'admin',
            label: 'ตั้งค่าแอดมิน',
            mobileLabel: 'Admin',
            sub: 'รูปจอห์นนี่และ Knowledge Base',
            icon: '<svg class="johnny-tab-icon h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h3m-6 4.5h9m-11 4.5h13M6 3.75h12A2.25 2.25 0 0 1 20.25 6v12A2.25 2.25 0 0 1 18 20.25H6A2.25 2.25 0 0 1 3.75 18V6A2.25 2.25 0 0 1 6 3.75Z" /></svg>',
            badge: 'Admin',
        },
    ];
    return `
        <div class="johnny-tabs rounded-2xl border border-emerald-100 bg-white/90 p-2 shadow-sm">
            <div class="grid grid-cols-2 gap-2">
                ${tabs.map(tab => {
                    const active = _activeTab === tab.id;
                    return `
                        <button type="button" class="johnny-tab-btn rounded-xl px-3 py-2 text-left transition-colors ${active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'}" data-tab="${tab.id}" data-mobile-label="${escHtml(tab.mobileLabel)}" aria-label="${escHtml(`${tab.label} - ${tab.sub}`)}" title="${escHtml(tab.label)}">
                            ${tab.icon}
                            <span class="johnny-tab-copy">
                                <span class="flex items-center gap-2 text-sm font-black leading-tight">
                                    ${escHtml(tab.label)}
                                    ${tab.badge ? `<span class="johnny-tab-badge rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${active ? 'border-white/40 bg-white/15 text-white' : 'border-emerald-200 bg-white text-emerald-700'}">${escHtml(tab.badge)}</span>` : ''}
                                </span>
                                <span class="mt-0.5 block text-[11px] font-bold ${active ? 'text-emerald-50' : 'text-emerald-700/70'}">${escHtml(tab.sub)}</span>
                            </span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function bindJohnnyTabs() {
    document.querySelectorAll('.johnny-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchJohnnyTab(btn.dataset.tab || 'chat'));
    });
}

function switchJohnnyTab(tab) {
    _activeTab = tab === 'admin' && _isAdmin ? 'admin' : 'chat';
    const shell = pageEl()?.querySelector('.johnny-shell');
    if (shell) shell.setAttribute('data-johnny-tab', _activeTab);
    const chatPanel = document.getElementById('johnny-chat-panel');
    const adminPanel = document.getElementById('johnny-admin-panel');
    if (chatPanel) chatPanel.classList.toggle('hidden', _activeTab !== 'chat');
    if (adminPanel) adminPanel.classList.toggle('hidden', _activeTab !== 'admin');
    document.querySelectorAll('.johnny-tab-btn').forEach(btn => {
        const active = btn.dataset.tab === _activeTab;
        btn.className = `johnny-tab-btn rounded-xl px-3 py-2 text-left transition-colors ${active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100'}`;
        const sub = btn.querySelector('.johnny-tab-copy > span:last-child');
        if (sub) {
            sub.className = `mt-0.5 block text-[11px] font-bold ${active ? 'text-emerald-50' : 'text-emerald-700/70'}`;
        }
        const badge = btn.querySelector('.johnny-tab-badge');
        if (badge) {
            badge.className = `johnny-tab-badge rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${active ? 'border-white/40 bg-white/15 text-white' : 'border-emerald-200 bg-white text-emerald-700'}`;
        }
    });
    if (_activeTab === 'chat') renderMessages();
    if (_activeTab === 'admin') {
        renderKbAdmin();
        loadOperationalLogs();
    }
}

function openMobileHistory() {
    pageEl()?.querySelector('.johnny-shell')?.classList.add('history-open');
}

function closeMobileHistory() {
    pageEl()?.querySelector('.johnny-shell')?.classList.remove('history-open');
}

function messageHtml(msg, index = 0) {
    const role = msg.Role || msg.role;
    const isUser = role === 'user';
    const text = msg.MessageText || msg.text || msg.answer || '';
    if (isUser) {
        const imagePreview = msg.imagePreviewUrl
            ? `<img src="${escHtml(msg.imagePreviewUrl)}" alt="Risk image preview" class="mb-2 max-h-48 w-full rounded-xl object-cover border border-emerald-400/30">`
            : '';
        return `
            <div class="flex justify-end">
                <div class="johnny-message-wrap max-w-[82%] rounded-2xl rounded-tr-md bg-emerald-600 px-4 py-3 text-sm text-white shadow-sm">
                    ${imagePreview}
                    ${renderText(text)}
                </div>
            </div>
        `;
    }
    if (msg.isTyping) {
        const elapsed = thinkingElapsedSeconds();
        return `
            <div class="flex gap-3">
                ${johnnyAvatar()}
                <div class="johnny-message-wrap max-w-[92%] sm:max-w-[88%]">
                    <div class="johnny-thinking rounded-2xl rounded-tl-md border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                        <div class="flex items-center gap-3" aria-label="Johnny AI thinking">
                            <div class="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                                <span class="absolute h-10 w-10 rounded-full border-2 border-emerald-300 opacity-70 animate-ping"></span>
                                <span class="relative text-sm font-black">J</span>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5">
                                    <span class="johnny-thinking-dot"></span>
                                    <span class="johnny-thinking-dot"></span>
                                    <span class="johnny-thinking-dot"></span>
                                </div>
                                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-50">
                                    <div class="johnny-thinking-bar h-full rounded-full bg-emerald-500"></div>
                                </div>
                                <div class="mt-2 text-xs font-black text-emerald-800">${escHtml(thinkingStageText(elapsed))}</div>
                                <div class="mt-0.5 text-[11px] font-bold text-slate-400">กำลังประมวลผล ${elapsed} วินาที</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        return `
            <div class="flex gap-3">
                ${johnnyAvatar()}
                <div class="max-w-[88%]">
                    <div class="rounded-2xl rounded-tl-md border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                        <div class="flex items-center gap-1.5" aria-label="Johnny AI กำลังพิมพ์">
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style="animation-delay:120ms"></span>
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" style="animation-delay:240ms"></span>
                        </div>
                    </div>
                    <div class="mt-2 text-[11px] font-bold text-emerald-700">จอห์นนี่กำลังคิดคำตอบให้ครับ</div>
                </div>
            </div>
        `;
    }
    const sourceType = msg.SourceType || msg.sourceType || 'ai_general';
    return `
        <div class="flex gap-3">
            ${johnnyAvatar()}
            <div class="johnny-message-wrap max-w-[88%]">
                <div class="rounded-2xl rounded-tl-md border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm leading-relaxed">
                    ${renderText(text)}
                </div>
                ${imageAnalysisFieldCardHtml(sourceType)}
                ${citationHtml(msg)}
                ${answerQualityBadgeHtml(msg)}
                ${imageRiskDraftActions(msg, sourceType)}
                ${workflowActionButtons(msg, sourceType)}
                <div class="mt-2 flex flex-wrap items-center gap-2">
                    ${sourceBadge(sourceType)}
                    <button type="button" class="johnny-copy-answer inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                            data-message-index="${index}">คัดลอก</button>
                </div>
            </div>
        </div>
    `;
}

function renderMessages() {
    const box = document.getElementById('johnny-messages');
    if (!box) return;
    if (!_messages.length) {
        box.innerHTML = `
            <div class="johnny-empty-state h-full min-h-[360px] flex items-center justify-center">
                <div class="max-w-xl text-center px-4">
                    <div class="johnny-empty-avatar mx-auto inline-flex">${johnnyAvatar('w-16 h-16', 'text-2xl')}</div>
                    <h2 class="johnny-empty-title mt-4 text-xl font-black text-slate-800">Johnny AI พร้อมช่วยเรื่องความปลอดภัย</h2>
                    <p class="mt-2 text-sm text-slate-500">คุยกับจอห์นนี่ได้เลยครับ ถ้าเรื่องไหนไม่มีข้อมูลยืนยัน จอห์นนี่จะบอกตรงๆ</p>
                    <div class="johnny-empty-quick johnny-field-quick-rail mt-5 flex gap-2 overflow-x-auto pb-1">
                        ${fieldQuickPromptsHtml(6)}
                    </div>
                </div>
            </div>
        `;
        bindQuickPrompts();
        return;
    }
    box.innerHTML = `<div class="space-y-4 pb-4">${_messages.map((msg, index) => messageHtml(msg, index)).join('')}</div>`;
    box.querySelectorAll('.johnny-risk-draft-btn').forEach(btn => {
        btn.addEventListener('click', () => createRiskDraft(btn.dataset.target, btn.dataset.messageId));
    });
    box.querySelectorAll('.johnny-workflow-action').forEach(btn => {
        btn.addEventListener('click', () => openWorkflowTarget(btn.dataset.target, btn.dataset.action, btn.dataset.messageId, btn.dataset.sourceType));
    });
    box.querySelectorAll('.johnny-copy-answer').forEach(btn => {
        btn.addEventListener('click', () => copyJohnnyAnswer(btn.dataset.messageIndex));
    });
    box.scrollTop = box.scrollHeight;
}

async function logWorkflowAction(target, action, message = null, sourceType = '') {
    try {
        await API.post('/johnny/workflow-actions', {
            target,
            action,
            conversationId: _conversationId,
            messageId: message?.id || message?.messageId || null,
            sourceType: sourceType || message?.SourceType || message?.sourceType || null,
            createdAt: new Date().toISOString(),
        });
    } catch (_) {}
}

async function createRiskDraft(target, messageId = '') {
    const allowedTargets = new Set(['hiyari', 'ky', 'patrol']);
    if (!allowedTargets.has(target)) return;
    const message = _messages.find(item => String(item.id || item.messageId || '') === String(messageId))
        || [..._messages].reverse().find(item => (item.SourceType || item.sourceType) === 'image_analysis' && (item.Role || item.role) !== 'user');
    if (!message) {
        showToast('ไม่พบผลวิเคราะห์รูปภาพสำหรับสร้าง draft', 'error');
        return;
    }
    const answer = String(message.MessageText || message.answer || message.text || '').trim();
    const citations = normalizeCitations(message.CitationsJson ?? message.citations);
    const draft = {
        source: 'johnny_ai_image_analysis',
        target,
        answer,
        conversationId: _conversationId,
        messageId: message.id || message.messageId || null,
        createdAt: new Date().toISOString(),
        citationTitle: citations[0]?.title || citations[0]?.fileName || '',
        note: 'Draft created from Johnny AI image risk analysis. Please review and edit before submitting.',
    };
    try {
        sessionStorage.setItem(IMAGE_RISK_DRAFT_KEY, JSON.stringify(draft));
        await logWorkflowAction(target, 'draft', message, 'image_analysis');
        const hash = target === 'patrol' ? '#patrol' : `#${target}`;
        window.location.hash = hash;
        showToast('สร้าง draft แล้ว กรุณาตรวจสอบก่อนส่ง', 'success');
    } catch {
        showToast('ไม่สามารถสร้าง draft ได้', 'error');
    }
}

async function openWorkflowTarget(target, action = 'deep_link', messageId = '', sourceType = '') {
    const map = { hiyari: '#hiyari', ky: '#ky', patrol: '#patrol' };
    if (!map[target]) return;
    const message = _messages.find(item => String(item.id || item.messageId || '') === String(messageId)) || null;
    await logWorkflowAction(target, action || 'deep_link', message, sourceType);
    window.location.hash = map[target];
}

function renderConversations() {
    const list = document.getElementById('johnny-conversation-list');
    if (!list) return;
    if (!_conversations.length) {
        list.innerHTML = '<div class="px-3 py-4 text-xs text-slate-400 text-center">ยังไม่มีประวัติสนทนา</div>';
        return;
    }
    list.innerHTML = _conversations.map(row => {
        const active = Number(row.id) === Number(_conversationId);
        return `
            <button type="button" class="johnny-conv w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors ${active ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}"
                    data-id="${Number(row.id)}">
                <div class="font-bold truncate">${escHtml(row.Title || 'Johnny AI Chat')}</div>
                <div class="mt-0.5 text-[11px] text-slate-400">${escHtml((row.UpdatedAt || row.CreatedAt || '').slice(0, 16).replace('T', ' '))}</div>
            </button>
        `;
    }).join('');
    list.querySelectorAll('.johnny-conv').forEach(btn => {
        btn.addEventListener('click', () => {
            closeMobileHistory();
            loadConversation(btn.dataset.id);
        });
    });
}

function renderStatus() {
    const el = document.getElementById('johnny-status');
    const sidebarAvatar = document.getElementById('johnny-sidebar-avatar');
    if (sidebarAvatar) sidebarAvatar.innerHTML = johnnyAvatar('w-11 h-11', 'text-lg');
    if (!el) return;
    const configured = Boolean(_status?.geminiConfigured);
    el.innerHTML = `
        <div class="flex items-center gap-3">
            ${johnnyAvatar('w-12 h-12', 'text-lg')}
            <div class="min-w-0">
                <div class="font-black text-slate-800 leading-tight">จอห์นนี่ AI</div>
                <div class="text-xs font-bold text-emerald-700">ผู้ช่วย SHE ประจำ TSH SCA</div>
            </div>
        </div>
        <div class="mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${configured ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}">
            ${configured ? 'พร้อมคุยเรื่องความปลอดภัย' : 'จอห์นนี่ยังไม่พร้อมตอบ กรุณาแจ้งผู้ดูแลระบบ'}
        </div>
    `;
}

function kbStatusBadge(doc) {
    const status = doc.IndexedStatus || 'pending';
    const actualChunks = Number(doc.ActualChunkCount ?? doc.ChunkCount ?? 0);
    const embeddings = Number(doc.EmbeddingCount ?? actualChunks);
    const indexedChars = Number(doc.IndexedChars ?? 0);
    const lowContent = String(doc.SourceType || 'document') === 'document' && Number(doc.FileSize || 0) >= 100000 && indexedChars < 1000;
    if (!Number(doc.IsActive)) return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">ปิดใช้งาน</span>';
    if (status === 'ready' && (actualChunks < 1 || embeddings < actualChunks)) return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700">ดัชนีไม่สมบูรณ์</span>';
    if (status === 'ready' && lowContent) return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">อ่านเนื้อหาได้น้อย</span>';
    if (status === 'ready') return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">พร้อมค้นหา</span>';
    if (status === 'failed') return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700">อ่านเอกสารไม่สำเร็จ</span>';
    if (status === 'indexing') return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">กำลังทำดัชนี</span>';
    return '<span class="px-2 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">รอดำเนินการ</span>';
}

function setKbOperationMessage(message = '', tone = 'working', autoHideMs = 0) {
    const el = document.getElementById('johnny-kb-operation-status');
    if (_kbOperationTimer) clearTimeout(_kbOperationTimer);
    _kbOperationTimer = null;
    if (!el) return;
    if (!message) {
        el.className = 'hidden';
        el.textContent = '';
        return;
    }
    const tones = {
        working: 'border-amber-200 bg-amber-50 text-amber-800',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        error: 'border-red-200 bg-red-50 text-red-700',
    };
    el.className = `mx-4 mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${tones[tone] || tones.working}`;
    el.innerHTML = `${tone === 'working' ? '<span class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"></span>' : ''}${escHtml(message)}`;
    if (autoHideMs > 0) _kbOperationTimer = setTimeout(() => setKbOperationMessage(), autoHideMs);
}

function kbSourceBadge(doc) {
    if (String(doc.SourceType || 'document') === 'manual') {
        return '<span class="inline-flex px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black">พิมพ์เอง</span>';
    }
    return '<span class="inline-flex px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black">เอกสาร</span>';
}

function renderKbAdmin() {
    const wrap = document.getElementById('johnny-kb-admin');
    if (!wrap) return;
    if (!_isAdmin) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = `
        <div class="rounded-2xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
            <div class="px-4 py-3 border-b border-emerald-100" style="background:linear-gradient(135deg,#ecfdf5,#ffffff)">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                        <p class="text-[11px] font-black uppercase tracking-widest text-emerald-700">Admin Knowledge Base</p>
                        <h2 class="font-black text-slate-800">เอกสารบริษัทสำหรับ Johnny AI</h2>
                    </div>
                    <span class="text-xs text-slate-500">PDF, Word, Excel, PowerPoint, Text</span>
                </div>
            </div>
            <div id="johnny-kb-operation-status" class="hidden"></div>
            <form id="johnny-avatar-form" class="p-4 border-b border-emerald-50 grid grid-cols-1 lg:grid-cols-[1fr_280px_auto_auto] gap-3 items-center">
                <div class="flex items-center gap-3">
                    ${johnnyAvatar('w-14 h-14', 'text-xl')}
                    <div>
                        <div class="font-black text-slate-800">รูปจอห์นนี่</div>
                        <div class="text-xs text-slate-500">เปลี่ยนรูปผู้ช่วยที่แสดงในหน้าแชท</div>
                    </div>
                </div>
                <input id="johnny-avatar-file" type="file" class="form-input w-full rounded-xl border-emerald-100" accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp">
                <button id="johnny-avatar-upload" type="submit" class="h-[42px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-60">
                    บันทึกรูป
                </button>
                <button id="johnny-avatar-reset" type="button" class="h-[42px] px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 disabled:opacity-60" ${_status?.johnnyAvatarUrl ? '' : 'disabled'}>
                    รีเซ็ต
                </button>
            </form>
            <form id="johnny-kb-form" class="p-4 grid grid-cols-1 lg:grid-cols-[1fr_180px_260px_auto] gap-3 items-end">
                <label class="block">
                    <span class="text-xs font-bold text-slate-500">ชื่อเอกสาร</span>
                    <input id="johnny-kb-title" class="form-input mt-1 w-full rounded-xl border-emerald-100" maxlength="220" placeholder="เช่น คู่มือ PPE งานเจียร">
                </label>
                <label class="block">
                    <span class="text-xs font-bold text-slate-500">หมวด</span>
                    <input id="johnny-kb-category" class="form-input mt-1 w-full rounded-xl border-emerald-100" maxlength="80" value="general">
                </label>
                <label class="block">
                    <span class="text-xs font-bold text-slate-500">ไฟล์เอกสาร</span>
                    <input id="johnny-kb-file" type="file" class="form-input mt-1 w-full rounded-xl border-emerald-100" accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv">
                </label>
                <button id="johnny-kb-upload" type="submit" class="h-[42px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-60">
                    อัปโหลด
                </button>
            </form>
            <form id="johnny-knowledge-form" class="p-4 border-t border-emerald-50 space-y-3">
                <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px] gap-3">
                    <label class="block">
                        <span class="text-xs font-bold text-slate-500">หัวข้อ Safety Knowledge</span>
                        <input id="johnny-knowledge-topic" class="form-input mt-1 w-full rounded-xl border-emerald-100" maxlength="220" placeholder="เช่น กฎการเบิก PPE และ Smart PPE Stock">
                    </label>
                    <label class="block">
                        <span class="text-xs font-bold text-slate-500">หมวด</span>
                        <input id="johnny-knowledge-category" class="form-input mt-1 w-full rounded-xl border-emerald-100" maxlength="80" value="general">
                    </label>
                </div>
                <label class="block">
                    <span class="text-xs font-bold text-slate-500">เนื้อหา</span>
                    <textarea id="johnny-knowledge-content" class="form-input mt-1 w-full min-h-[120px] rounded-xl border-emerald-100 leading-relaxed" maxlength="60000" placeholder="พิมพ์เนื้อหาความรู้ ความปลอดภัย ขั้นตอน หรือกฎภายในที่ต้องการให้ Johnny ค้นเจอ"></textarea>
                </label>
                <div class="flex flex-wrap justify-end gap-2">
                    <button id="johnny-knowledge-cancel" type="button" class="hidden h-[40px] px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50">
                        ยกเลิกแก้ไข
                    </button>
                    <button id="johnny-knowledge-save" type="submit" class="h-[40px] px-4 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-60">
                        เพิ่ม Safety Knowledge
                    </button>
                </div>
            </form>
            <div id="johnny-kb-list" class="px-4 pb-4" data-johnny-phase3="${JOHNNY_PHASE3_MARKER}"></div>
        </div>
        <section class="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p class="text-[11px] font-black uppercase tracking-widest text-slate-500">Johnny Operational Log</p>
                    <h2 class="font-black text-slate-800">ตรวจสอบการทำงานและข้อผิดพลาด</h2>
                </div>
                <div class="grid grid-cols-2 gap-2 md:grid-cols-[120px_120px_120px_auto_auto]">
                    <select id="johnny-observability-days" class="form-input rounded-xl border-slate-200 text-xs">
                        <option value="1">1 day</option>
                        <option value="7">7 days</option>
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                    </select>
                    <select id="johnny-log-level" class="form-input rounded-xl border-slate-200 text-xs">
                        <option value="">ทุกระดับ</option>
                        <option value="error">Error</option>
                        <option value="warning">Warning</option>
                        <option value="info">Info</option>
                    </select>
                    <select id="johnny-log-operation" class="form-input rounded-xl border-slate-200 text-xs">
                        <option value="">ทุกงาน</option>
                        <option value="chat">Chat</option>
                        <option value="document_index">Index / Reindex</option>
                        <option value="refine">Refine</option>
                        <option value="auto_audit">Auto Audit</option>
                        <option value="image_analysis">Image Analysis</option>
                    </select>
                    <button id="johnny-log-refresh" type="button" class="rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100">รีเฟรช</button>
                </div>
            </div>
            <div id="johnny-observability-dashboard" class="border-b border-slate-100 p-4" data-johnny-phase4="${JOHNNY_PHASE4_MARKER}"></div>
            <div id="johnny-operational-log-list" class="max-h-[520px] overflow-y-auto p-4"></div>
        </section>
    `;
    renderKbList();
    document.getElementById('johnny-avatar-form')?.addEventListener('submit', uploadJohnnyAvatar);
    document.getElementById('johnny-avatar-reset')?.addEventListener('click', resetJohnnyAvatar);
    document.getElementById('johnny-kb-form')?.addEventListener('submit', uploadKbDocument);
    document.getElementById('johnny-knowledge-form')?.addEventListener('submit', saveManualKnowledge);
    document.getElementById('johnny-knowledge-cancel')?.addEventListener('click', cancelManualKnowledgeEdit);
    document.getElementById('johnny-log-level')?.addEventListener('change', event => {
        _operationalLogFilters.level = event.target.value || '';
        loadOperationalLogs();
    });
    document.getElementById('johnny-log-operation')?.addEventListener('change', event => {
        _operationalLogFilters.operation = event.target.value || '';
        loadOperationalLogs();
    });
    document.getElementById('johnny-log-refresh')?.addEventListener('click', () => {
        loadObservability();
        loadOperationalLogs();
    });
    document.getElementById('johnny-observability-days')?.addEventListener('change', event => {
        const next = Number(event.target.value || 7);
        _observabilityDays = [1, 7, 30, 90].includes(next) ? next : 7;
        loadObservability();
        loadOperationalLogs();
    });
    const levelSelect = document.getElementById('johnny-log-level');
    const operationSelect = document.getElementById('johnny-log-operation');
    const daysSelect = document.getElementById('johnny-observability-days');
    if (levelSelect) levelSelect.value = _operationalLogFilters.level;
    if (operationSelect) operationSelect.value = _operationalLogFilters.operation;
    if (daysSelect) daysSelect.value = String(_observabilityDays);
    renderObservability();
    renderOperationalLogs();
}

function num(value) {
    return Number(value || 0);
}

function ms(value) {
    const n = num(value);
    return n ? `${n.toLocaleString()} ms` : '-';
}

function renderMetricCard(label, value, detail = '', tone = 'slate') {
    const tones = {
        slate: 'border-slate-100 bg-white text-slate-800',
        red: 'border-red-100 bg-red-50 text-red-800',
        amber: 'border-amber-100 bg-amber-50 text-amber-800',
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
        sky: 'border-sky-100 bg-sky-50 text-sky-800',
    };
    return `
        <div class="rounded-xl border p-3 ${tones[tone] || tones.slate}">
            <div class="text-[10px] font-black uppercase tracking-widest opacity-70">${escHtml(label)}</div>
            <div class="mt-1 text-2xl font-black">${escHtml(String(value))}</div>
            ${detail ? `<div class="mt-1 text-[11px] font-bold opacity-75">${escHtml(detail)}</div>` : ''}
        </div>
    `;
}

function renderMiniTable(rows, columns, emptyLabel) {
    if (!Array.isArray(rows) || !rows.length) {
        return `<div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">${escHtml(emptyLabel)}</div>`;
    }
    return `
        <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="min-w-full divide-y divide-slate-100 text-xs">
                <thead class="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>${columns.map(col => `<th class="px-3 py-2 text-left">${escHtml(col.label)}</th>`).join('')}</tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                    ${rows.map(row => `
                        <tr>
                            ${columns.map(col => `<td class="px-3 py-2 align-top font-bold text-slate-600">${escHtml(String(col.value(row)))}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderObservability() {
    const el = document.getElementById('johnny-observability-dashboard');
    if (!el) return;
    if (_observabilityError) {
        el.innerHTML = `
            <div class="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                <div class="font-black">Observability failed</div>
                <div class="mt-1 text-xs">${escHtml(_observabilityError)}</div>
            </div>
        `;
        return;
    }
    if (!_observability) {
        el.innerHTML = '<div class="py-5 text-center text-sm font-bold text-slate-400">Loading observability...</div>';
        return;
    }
    const logs = _observability.logs || {};
    const chat = _observability.chat || {};
    const kb = _observability.kb || {};
    const unverifiedRate = chat.assistantMessages ? Math.round((num(chat.unverifiedAnswers) / num(chat.assistantMessages)) * 100) : 0;
    el.innerHTML = `
        <div class="space-y-4" data-johnny-phase4-dashboard="true">
            <div class="grid grid-cols-2 gap-3 lg:grid-cols-6">
                ${renderMetricCard('Logs', num(logs.total).toLocaleString(), `${num(logs.errors)} errors / ${num(logs.warnings)} warnings`, num(logs.errors) ? 'red' : 'emerald')}
                ${renderMetricCard('Last hour', num(logs.errorsLastHour).toLocaleString(), 'error events', num(logs.errorsLastHour) ? 'red' : 'emerald')}
                ${renderMetricCard('Chat', num(chat.assistantMessages).toLocaleString(), `${num(chat.conversations)} conversations`, 'sky')}
                ${renderMetricCard('Unverified', `${unverifiedRate}%`, `${num(chat.unverifiedAnswers)} answers`, unverifiedRate ? 'amber' : 'emerald')}
                ${renderMetricCard('Latency', ms(logs.avgLatencyMs), `max ${ms(logs.maxLatencyMs)}`, num(logs.avgLatencyMs) > 10000 ? 'amber' : 'slate')}
                ${renderMetricCard('KB ready', `${num(kb.readyDocs)}/${num(kb.totalDocs)}`, `${num(kb.declaredChunks)} chunks`, num(kb.errorDocs) ? 'red' : 'emerald')}
            </div>
            <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <section>
                    <div class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Operations</div>
                    ${renderMiniTable(logs.operations, [
                        { label: 'Operation', value: row => row.operation || '-' },
                        { label: 'Total', value: row => num(row.total).toLocaleString() },
                        { label: 'Err/Warn', value: row => `${num(row.errors)}/${num(row.warnings)}` },
                        { label: 'Avg', value: row => ms(Math.round(num(row.avgLatencyMs))) },
                    ], 'No operation events')}
                </section>
                <section>
                    <div class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Answer Sources</div>
                    ${renderMiniTable(chat.sourceTypes, [
                        { label: 'Source', value: row => row.sourceType || '-' },
                        { label: 'Answers', value: row => num(row.total).toLocaleString() },
                        { label: 'Avg', value: row => ms(Math.round(num(row.avgLatencyMs))) },
                    ], 'No answer source rows')}
                </section>
                <section>
                    <div class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Recent Issues</div>
                    ${renderMiniTable(logs.recentIssues?.slice(0, 8), [
                        { label: 'Level', value: row => row.Level || row.level || '-' },
                        { label: 'Area', value: row => `${row.Operation || row.operation || '-'}/${row.Stage || row.stage || '-'}` },
                        { label: 'HTTP', value: row => row.HttpStatus || row.httpStatus || '-' },
                        { label: 'When', value: row => String(row.CreatedAt || row.createdAt || '').slice(0, 16).replace('T', ' ') },
                    ], 'No warning or error rows')}
                </section>
                <section>
                    <div class="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Slow Samples</div>
                    ${renderMiniTable(logs.slowSamples?.slice(0, 8), [
                        { label: 'Operation', value: row => row.Operation || row.operation || '-' },
                        { label: 'Stage', value: row => row.Stage || row.stage || '-' },
                        { label: 'Latency', value: row => ms(row.LatencyMs || row.latencyMs) },
                        { label: 'Model', value: row => row.Model || row.model || '-' },
                    ], 'No latency samples')}
                </section>
            </div>
        </div>
    `;
}

async function loadObservability() {
    if (!_isAdmin) return;
    try {
        const res = await API.get(`/johnny/observability?days=${encodeURIComponent(_observabilityDays)}`);
        _observability = res?.data || null;
        _observabilityError = '';
    } catch (error) {
        _observability = null;
        _observabilityError = error.message || 'Unable to load observability';
    }
    renderObservability();
}

function parseOperationalMeta(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

function renderOperationalLogs() {
    const list = document.getElementById('johnny-operational-log-list');
    if (!list) return;
    if (_operationalLogError) {
        list.innerHTML = `
            <div class="rounded-xl border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-700">
                <div class="font-black">โหลด Operational Log ไม่สำเร็จ</div>
                <div class="mt-1 text-xs leading-relaxed">${escHtml(_operationalLogError)}</div>
                <button type="button" class="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100" data-action="johnny-log-retry">ลองใหม่</button>
            </div>
        `;
        list.querySelector('[data-action="johnny-log-retry"]')?.addEventListener('click', loadOperationalLogs);
        return;
    }
    if (!_operationalLogs.length) {
        const filtered = Boolean(_operationalLogFilters.level || _operationalLogFilters.operation);
        list.innerHTML = `
            <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <div class="text-sm font-black text-slate-500">${filtered ? 'ไม่พบ Log ตามตัวกรองนี้' : 'ยังไม่มี Operational Log'}</div>
                <div class="mt-1 text-xs text-slate-400">${filtered ? 'ลองเปลี่ยนระดับหรือประเภทงาน แล้วกดรีเฟรชอีกครั้ง' : 'เมื่อ Johnny ทำงาน ระบบจะแสดงเหตุการณ์ล่าสุดตรงนี้'}</div>
            </div>
        `;
        return;
    }
    const tone = {
        error: 'border-red-200 bg-red-50 text-red-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-700',
        info: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
    list.innerHTML = `<div class="space-y-2">${_operationalLogs.map(row => {
        const level = String(row.Level || 'info').toLowerCase();
        const meta = parseOperationalMeta(row.MetaJson);
        const refs = [row.UserID ? `User ${row.UserID}` : '', row.ConversationID ? `Conversation ${row.ConversationID}` : '', row.DocumentID ? `Document ${row.DocumentID}` : ''].filter(Boolean);
        return `
            <details class="rounded-xl border border-slate-100 bg-white p-3" ${level === 'error' ? 'open' : ''}>
                <summary class="cursor-pointer list-none">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${tone[level] || tone.info}">${escHtml(level)}</span>
                                <span class="text-xs font-black text-slate-700">${escHtml(row.Operation || '-')} / ${escHtml(row.Stage || '-')}</span>
                                ${row.Model ? `<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">${escHtml(row.Model)}</span>` : ''}
                            </div>
                            <div class="mt-1 break-words text-xs text-slate-600">${escHtml(row.Message || '-')}</div>
                        </div>
                        <div class="shrink-0 text-right text-[11px] text-slate-400">
                            <div>${escHtml(String(row.CreatedAt || '').slice(0, 19).replace('T', ' '))}</div>
                            <div>${row.HttpStatus ? `HTTP ${Number(row.HttpStatus)}` : ''}${row.LatencyMs ? ` · ${Number(row.LatencyMs).toLocaleString()} ms` : ''}</div>
                        </div>
                    </div>
                </summary>
                <div class="mt-3 border-t border-slate-100 pt-3">
                    <div class="flex flex-wrap gap-2 text-[11px] font-bold text-slate-500">${refs.length ? refs.map(ref => `<span class="rounded-lg bg-slate-50 px-2 py-1">${escHtml(ref)}</span>`).join('') : '<span>ไม่มี reference เพิ่มเติม</span>'}</div>
                    ${meta ? `<pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">${escHtml(JSON.stringify(meta, null, 2))}</pre>` : ''}
                </div>
            </details>`;
    }).join('')}</div>`;
}

async function loadOperationalLogs() {
    if (!_isAdmin) return;
    const list = document.getElementById('johnny-operational-log-list');
    if (list) list.innerHTML = '<div class="py-5 text-center text-sm font-bold text-slate-400">กำลังโหลด Log...</div>';
    try {
        const query = new URLSearchParams({ limit: '120' });
        if (_operationalLogFilters.level) query.set('level', _operationalLogFilters.level);
        if (_operationalLogFilters.operation) query.set('operation', _operationalLogFilters.operation);
        const res = await API.get(`/johnny/operational-logs?${query.toString()}`);
        _operationalLogs = Array.isArray(res?.data) ? res.data : [];
        _operationalLogError = '';
    } catch (error) {
        _operationalLogs = [];
        _operationalLogError = error.message || 'ไม่สามารถเชื่อมต่อ Operational Log ได้';
        showToast(error.message || 'โหลด Johnny Operational Log ไม่สำเร็จ', 'error');
    }
    renderOperationalLogs();
}

function normalizeKbFilterText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getKbQualityKey(doc = {}) {
    const quality = getKbDocumentQuality(doc);
    if (quality.score >= 85) return 'good';
    if (quality.score >= 60) return 'medium';
    return 'low';
}

function getKbDashboardSummary(docs = []) {
    const summary = {
        total: docs.length,
        ready: 0,
        failed: 0,
        lowQuality: 0,
        manual: 0,
        document: 0,
        chunks: 0,
        chars: 0,
        embeddings: 0,
        missingEmbeddings: 0,
        categories: new Set(),
    };
    docs.forEach(doc => {
        const status = String(doc.IndexedStatus || '').toLowerCase();
        const source = String(doc.SourceType || 'document');
        const chunks = Number(doc.ActualChunkCount ?? doc.ChunkCount ?? 0);
        const embeddings = Number(doc.EmbeddingCount ?? 0);
        if (status === 'ready' && Number(doc.IsActive) === 1) summary.ready += 1;
        if (status === 'failed' || doc.ErrorMessage) summary.failed += 1;
        if (getKbQualityKey(doc) === 'low') summary.lowQuality += 1;
        if (source === 'manual') summary.manual += 1;
        else summary.document += 1;
        summary.chunks += chunks;
        summary.chars += Number(doc.IndexedChars || 0);
        summary.embeddings += embeddings;
        summary.missingEmbeddings += Math.max(0, chunks - embeddings);
        if (doc.Category) summary.categories.add(String(doc.Category));
    });
    return summary;
}

function getKbDuplicateGroups(docs = []) {
    const groups = new Map();
    docs.forEach(doc => {
        const source = String(doc.SourceType || 'document');
        const name = source === 'manual' ? doc.Title : (doc.OriginalName || doc.Title);
        const key = `${source}|${normalizeKbFilterText(name)}|${Number(doc.FileSize || 0)}`;
        if (!normalizeKbFilterText(name)) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(doc);
    });
    return Array.from(groups.values()).filter(group => group.length > 1);
}

function getFilteredKbDocs(docs = []) {
    const query = normalizeKbFilterText(_kbFilters.query);
    return docs.filter(doc => {
        const status = String(doc.IndexedStatus || '').toLowerCase();
        const source = String(doc.SourceType || 'document');
        const category = String(doc.Category || 'general');
        const quality = getKbQualityKey(doc);
        if (_kbFilters.status === 'ready' && !(status === 'ready' && Number(doc.IsActive) === 1)) return false;
        if (_kbFilters.status === 'failed' && !(status === 'failed' || doc.ErrorMessage)) return false;
        if (_kbFilters.status === 'inactive' && Number(doc.IsActive) === 1) return false;
        if (_kbFilters.status === 'indexing' && status !== 'indexing') return false;
        if (_kbFilters.quality && quality !== _kbFilters.quality) return false;
        if (_kbFilters.source === 'manual' && source !== 'manual') return false;
        if (_kbFilters.source === 'document' && source === 'manual') return false;
        if (_kbFilters.category && category !== _kbFilters.category) return false;
        if (query) {
            const haystack = normalizeKbFilterText([
                doc.Title,
                doc.OriginalName,
                doc.Category,
                doc.UploadedByName,
                doc.ErrorMessage,
            ].join(' '));
            if (!haystack.includes(query)) return false;
        }
        return true;
    });
}

function renderKbQualityDashboard(summary, duplicateGroups) {
    const readinessPct = summary.total ? Math.round((summary.ready / summary.total) * 100) : 0;
    const embeddingPct = summary.chunks ? Math.round((summary.embeddings / summary.chunks) * 100) : 0;
    const cards = [
        ['Ready docs', `${summary.ready}/${summary.total}`, `${readinessPct}% active and indexed`, 'emerald'],
        ['Chunks', summary.chunks.toLocaleString(), `${summary.chars.toLocaleString()} indexed chars`, 'sky'],
        ['Embeddings', `${embeddingPct}%`, `${summary.missingEmbeddings.toLocaleString()} missing`, summary.missingEmbeddings ? 'amber' : 'emerald'],
        ['Low quality', summary.lowQuality.toLocaleString(), `${summary.failed.toLocaleString()} failed`, summary.lowQuality || summary.failed ? 'red' : 'emerald'],
        ['Manual knowledge', summary.manual.toLocaleString(), `${summary.document.toLocaleString()} uploaded docs`, 'amber'],
        ['Duplicates', duplicateGroups.length.toLocaleString(), 'same source/name/size', duplicateGroups.length ? 'amber' : 'emerald'],
    ];
    const tone = {
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800',
        sky: 'border-sky-100 bg-sky-50 text-sky-800',
        amber: 'border-amber-100 bg-amber-50 text-amber-800',
        red: 'border-red-100 bg-red-50 text-red-800',
    };
    return `
        <section class="mb-3 rounded-2xl border border-slate-100 bg-white p-4" data-johnny-phase3-dashboard="true">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div class="text-sm font-black text-slate-800">KB Quality Dashboard</div>
                    <div class="text-xs text-slate-400">Document readiness, extraction quality, embedding coverage, and duplicate risk</div>
                </div>
                <span class="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-700">${JOHNNY_PHASE3_MARKER}</span>
            </div>
            <div class="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                ${cards.map(([label, value, hint, color]) => `
                    <div class="rounded-xl border p-3 ${tone[color] || tone.emerald}">
                        <div class="text-[11px] font-black uppercase tracking-wide opacity-70">${escHtml(label)}</div>
                        <div class="mt-1 text-xl font-black">${escHtml(String(value))}</div>
                        <div class="mt-1 text-[11px] font-bold opacity-80">${escHtml(hint)}</div>
                    </div>
                `).join('')}
            </div>
        </section>
    `;
}

function renderKbDuplicateWarning(duplicateGroups) {
    if (!duplicateGroups.length) return '';
    return `
        <div class="mb-3 rounded-2xl border border-amber-100 bg-amber-50 p-4" data-johnny-phase3-duplicates="true">
            <div class="text-sm font-black text-amber-800">Duplicate document warning</div>
            <div class="mt-1 text-xs leading-relaxed text-amber-700">Found ${duplicateGroups.length.toLocaleString()} group(s) with the same source type, name, and file size. Review before reindexing so Johnny does not cite repeated content.</div>
            <div class="mt-3 space-y-2">
                ${duplicateGroups.slice(0, 5).map(group => `
                    <div class="rounded-xl bg-white/80 px-3 py-2 text-xs text-amber-800">
                        <div class="font-black">${escHtml(group[0]?.Title || group[0]?.OriginalName || 'Knowledge Base')}</div>
                        <div class="mt-1">${group.map(doc => `#${Number(doc.id)} ${escHtml(doc.IndexedStatus || '-')}`).join(' | ')}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderKbFilterBar(docs = [], filteredCount = 0) {
    const categories = Array.from(new Set(docs.map(doc => String(doc.Category || 'general')).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return `
        <div class="mb-3 rounded-2xl border border-slate-100 bg-slate-50 p-3" data-johnny-phase3-filters="true">
            <div class="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
                <input id="johnny-kb-filter-query" class="form-input rounded-xl border-slate-200 text-xs" value="${escHtml(_kbFilters.query)}" placeholder="Search title, category, uploader, error">
                <select id="johnny-kb-filter-status" class="form-input rounded-xl border-slate-200 text-xs">
                    <option value="">All status</option>
                    <option value="ready">Ready</option>
                    <option value="failed">Failed</option>
                    <option value="inactive">Inactive</option>
                    <option value="indexing">Indexing</option>
                </select>
                <select id="johnny-kb-filter-quality" class="form-input rounded-xl border-slate-200 text-xs">
                    <option value="">All quality</option>
                    <option value="good">Good</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low quality</option>
                </select>
                <select id="johnny-kb-filter-source" class="form-input rounded-xl border-slate-200 text-xs">
                    <option value="">All sources</option>
                    <option value="document">Document upload</option>
                    <option value="manual">Manual knowledge</option>
                </select>
                <select id="johnny-kb-filter-category" class="form-input rounded-xl border-slate-200 text-xs">
                    <option value="">All categories</option>
                    ${categories.map(category => `<option value="${escHtml(category)}">${escHtml(category)}</option>`).join('')}
                </select>
                <button type="button" id="johnny-kb-filter-clear" class="rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-100">Clear</button>
            </div>
            <div class="mt-2 text-[11px] font-bold text-slate-400">${filteredCount.toLocaleString()} of ${docs.length.toLocaleString()} item(s)</div>
        </div>
    `;
}

function bindKbPhase3Controls() {
    const query = document.getElementById('johnny-kb-filter-query');
    const status = document.getElementById('johnny-kb-filter-status');
    const quality = document.getElementById('johnny-kb-filter-quality');
    const source = document.getElementById('johnny-kb-filter-source');
    const category = document.getElementById('johnny-kb-filter-category');
    if (query) {
        query.value = _kbFilters.query || '';
        query.addEventListener('input', event => {
            _kbFilters.query = event.target.value || '';
            renderKbList();
        });
    }
    [
        [status, 'status'],
        [quality, 'quality'],
        [source, 'source'],
        [category, 'category'],
    ].forEach(([el, key]) => {
        if (!el) return;
        el.value = _kbFilters[key] || '';
        el.addEventListener('change', event => {
            _kbFilters[key] = event.target.value || '';
            renderKbList();
        });
    });
    document.getElementById('johnny-kb-filter-clear')?.addEventListener('click', () => {
        _kbFilters = { status: '', quality: '', source: '', category: '', query: '' };
        renderKbList();
    });
}

function renderKbList() {
    const list = document.getElementById('johnny-kb-list');
    if (!list) return;
    if (_kbLoadError) {
        list.innerHTML = `
            <div class="rounded-xl border border-red-100 bg-red-50 px-4 py-5 text-sm text-red-700">
                <div class="font-black">โหลด Knowledge Base ไม่สำเร็จ</div>
                <div class="mt-1 text-xs leading-relaxed">${escHtml(_kbLoadError)}</div>
                <button type="button" class="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-100" data-action="johnny-kb-retry">โหลดอีกครั้ง</button>
            </div>
        `;
        list.querySelector('[data-action="johnny-kb-retry"]')?.addEventListener('click', loadKbDocuments);
        return;
    }
    if (!_kbDocs.length) {
        list.innerHTML = `
            <div class="rounded-xl border border-dashed border-emerald-100 bg-emerald-50/60 px-4 py-6 text-center">
                <div class="text-sm font-black text-emerald-800">ยังไม่มีเอกสาร Knowledge Base</div>
                <div class="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-emerald-700/80">อัปโหลดเอกสารบริษัทหรือเพิ่ม Safety Knowledge เพื่อให้ Johnny ใช้ตอบจากข้อมูลภายในก่อนข้อมูลทั่วไป</div>
            </div>
        `;
        return;
    }
    const summary = getKbDashboardSummary(_kbDocs);
    const duplicateGroups = getKbDuplicateGroups(_kbDocs);
    const filteredDocs = getFilteredKbDocs(_kbDocs);
    const emptyFiltered = filteredDocs.length === 0;
    list.innerHTML = `
        ${renderKbQualityDashboard(summary, duplicateGroups)}
        ${renderKbDuplicateWarning(duplicateGroups)}
        ${renderKbFilterBar(_kbDocs, filteredDocs.length)}
        ${emptyFiltered ? `
            <div class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <div class="text-sm font-black text-slate-600">No Knowledge Base item matches these filters</div>
                <div class="mt-1 text-xs text-slate-400">Clear filters or adjust status, quality, source, category, or search text.</div>
            </div>
        ` : `
        <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-xs text-slate-500">
                    <tr>
                        <th class="px-3 py-2 text-left">เอกสาร</th>
                        <th class="px-3 py-2 text-left">สถานะ</th>
                        <th class="px-3 py-2 text-left">คุณภาพ</th>
                        <th class="px-3 py-2 text-right">Chunks</th>
                        <th class="px-3 py-2 text-left">ล่าสุด</th>
                        <th class="px-3 py-2 text-right">จัดการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 bg-white">
                    ${filteredDocs.map(doc => `
                        ${(() => {
                            const docId = Number(doc.id);
                            const reindexing = _kbReindexingIds.has(docId);
                            const refining = _kbRefiningIds.has(docId);
                            const operating = reindexing || refining;
                            const actualChunks = Number(doc.ActualChunkCount ?? doc.ChunkCount ?? 0);
                            const embeddings = Number(doc.EmbeddingCount ?? 0);
                            const indexedChars = Number(doc.IndexedChars ?? 0);
                            const lowContent = String(doc.SourceType || 'document') === 'document' && Number(doc.FileSize || 0) >= 100000 && indexedChars < 1000;
                            const healthy = actualChunks > 0 && embeddings === actualChunks && !lowContent;
                            const quality = getKbDocumentQuality(doc);
                            const canAskDocument = Number(doc.IsActive) === 1 && String(doc.IndexedStatus || '') === 'ready' && actualChunks > 0 && !operating;
                            return `<tr class="${operating ? 'bg-amber-50/60' : ''}" aria-busy="${operating}">
                            <td class="px-3 py-3 align-top">
                                <div class="flex flex-wrap items-center gap-2">
                                    <div class="font-black text-slate-700">${escHtml(doc.Title || doc.OriginalName || 'Knowledge Base')}</div>
                                    ${kbSourceBadge(doc)}
                                </div>
                                <div class="mt-0.5 text-[11px] text-slate-400">${escHtml(doc.Category || 'general')} • ${escHtml(doc.OriginalName || '')}</div>
                                <div class="mt-0.5 text-[11px] text-slate-400">${escHtml(String(doc.SourceType || 'document') === 'manual' ? 'Safety Knowledge' : (doc.OriginalName || ''))}</div>
                                <div class="mt-1 text-[11px] ${healthy ? 'text-emerald-700' : 'text-amber-700'}">DB: ${actualChunks.toLocaleString()} chunks · ${indexedChars.toLocaleString()} chars · embeddings ${embeddings.toLocaleString()}/${actualChunks.toLocaleString()}</div>
                                ${lowContent ? '<div class="mt-1 text-[11px] font-bold text-amber-700">ไฟล์มีขนาดใหญ่ แต่ระบบอ่านข้อความได้ต่ำกว่า 1,000 ตัวอักษร อาจเป็น PDF สแกน/ตาราง/ฟอนต์ฝัง ควร Reindex หรือลองไฟล์ DOCX/TXT</div>' : ''}
                                ${doc.ErrorMessage ? `<div class="mt-1 text-[11px] text-red-600">${escHtml(doc.ErrorMessage)}</div>` : ''}
                            </td>
                            <td class="px-3 py-3 align-top">${kbStatusBadge(operating ? { ...doc, IndexedStatus: 'indexing' } : doc)}</td>
                            <td class="px-3 py-3 align-top">
                                <div class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${quality.className}">
                                    <span class="h-1.5 w-1.5 rounded-full ${quality.dotClass}"></span>
                                    ${escHtml(quality.label)}
                                </div>
                                <div class="mt-1 text-[11px] font-bold ${quality.textClass}">${quality.score}% · ${escHtml(quality.hint)}</div>
                                <div class="mt-2">${kbAuditBadge(doc)}</div>
                            </td>
                            <td class="px-3 py-3 align-top text-right font-bold text-slate-600">${actualChunks.toLocaleString()}</td>
                            <td class="px-3 py-3 align-top text-xs text-slate-400">${escHtml((doc.LastIndexedAt || doc.UpdatedAt || doc.CreatedAt || '').slice(0, 16).replace('T', ' '))}</td>
                            <td class="px-3 py-3 align-top">
                                <div class="flex flex-wrap justify-end gap-2">
                                    <button type="button" class="johnny-kb-toggle px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" data-id="${docId}" data-active="${Number(doc.IsActive) ? 0 : 1}" ${operating ? 'disabled' : ''}>
                                        ${Number(doc.IsActive) ? 'ปิด' : 'เปิด'}
                                    </button>
                                    ${String(doc.SourceType || 'document') === 'manual' ? `
                                        <button type="button" class="johnny-kb-edit px-2.5 py-1.5 rounded-lg border border-amber-100 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50" data-id="${docId}" ${operating ? 'disabled' : ''}>
                                            แก้ไข
                                        </button>
                                    ` : ''}
                                    <button type="button" class="johnny-kb-extracted px-2.5 py-1.5 rounded-lg border border-sky-100 text-xs font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-50" data-id="${docId}" ${operating ? 'disabled' : ''}>
                                        ดูข้อความ
                                    </button>
                                    <button type="button" class="johnny-kb-summary px-2.5 py-1.5 rounded-lg border border-teal-100 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50" data-id="${docId}" ${canAskDocument ? '' : 'disabled'}>
                                        สรุป
                                    </button>
                                    <button type="button" class="johnny-kb-ask-doc inline-flex items-center px-2.5 py-1.5 rounded-lg border border-indigo-100 text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50" data-id="${docId}" ${canAskDocument ? '' : 'disabled'}>
                                        ถามเฉพาะ
                                    </button>
                                    <button type="button" class="johnny-kb-reindex px-2.5 py-1.5 rounded-lg border border-emerald-100 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70" data-id="${docId}" ${operating ? 'disabled' : ''}>
                                        ${reindexing ? '<span class="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"></span>กำลัง Reindex...' : refining ? '<span class="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"></span>กำลังเกลา...' : 'Reindex'}
                                    </button>
                                    <button type="button" class="johnny-kb-delete px-2.5 py-1.5 rounded-lg border border-red-100 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50" data-id="${docId}" ${operating ? 'disabled' : ''}>
                                        ลบ
                                    </button>
                                </div>
                            </td>
                        </tr>`;
                        })()}
                    `).join('')}
                </tbody>
            </table>
        </div>
        `}
    `;
    bindKbPhase3Controls();
    list.querySelectorAll('.johnny-kb-toggle').forEach(btn => {
        btn.addEventListener('click', () => toggleKbDocument(btn.dataset.id, btn.dataset.active === '1'));
    });
    list.querySelectorAll('.johnny-kb-edit').forEach(btn => {
        btn.addEventListener('click', () => editManualKnowledge(btn.dataset.id));
    });
    list.querySelectorAll('.johnny-kb-extracted').forEach(btn => {
        btn.addEventListener('click', () => viewKbExtracted(btn.dataset.id));
    });
    list.querySelectorAll('.johnny-kb-summary').forEach(btn => {
        btn.addEventListener('click', () => summarizeKbDocument(btn.dataset.id));
    });
    list.querySelectorAll('.johnny-kb-ask-doc').forEach(btn => {
        btn.addEventListener('click', () => askKbDocument(btn.dataset.id));
    });
    list.querySelectorAll('.johnny-kb-reindex').forEach(btn => {
        btn.addEventListener('click', () => reindexKbDocument(btn.dataset.id));
    });
    list.querySelectorAll('.johnny-kb-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteKbDocument(btn.dataset.id));
    });
}

function getKbDocumentQuality(doc = {}) {
    const status = String(doc.IndexedStatus || '').toLowerCase();
    const sourceType = String(doc.SourceType || 'document');
    const actualChunks = Number(doc.ActualChunkCount ?? doc.ChunkCount ?? 0);
    const embeddings = Number(doc.EmbeddingCount ?? 0);
    const indexedChars = Number(doc.IndexedChars ?? 0);
    const fileSize = Number(doc.FileSize || 0);
    const artifactChunks = Number(doc.ArtifactChunkCount || 0);
    const embeddingMismatch = actualChunks > 0 && embeddings !== actualChunks;
    const lowContent = sourceType === 'document' && fileSize >= 100000 && indexedChars < 1000;
    const artifactRisk = artifactChunks >= Math.max(3, Math.ceil(actualChunks * 0.2));

    if (status === 'indexing') {
        return {
            score: 0,
            label: 'กำลังอ่าน',
            hint: 'รอ index ให้เสร็จ',
            className: 'border-sky-100 bg-sky-50 text-sky-700',
            dotClass: 'bg-sky-500',
            textClass: 'text-sky-700',
        };
    }

    if (status === 'failed' || doc.ErrorMessage || actualChunks === 0) {
        return {
            score: 0,
            label: 'อ่านไม่สำเร็จ',
            hint: actualChunks === 0 ? 'ยังไม่มีข้อความที่ใช้ค้นหา' : 'มี error จากการ index',
            className: 'border-red-100 bg-red-50 text-red-700',
            dotClass: 'bg-red-500',
            textClass: 'text-red-700',
        };
    }

    let score = 100;
    const hints = [];
    if (embeddingMismatch) {
        score -= 30;
        hints.push('embedding ไม่ครบ');
    }
    if (lowContent) {
        score -= 35;
        hints.push('ข้อความน้อยผิดปกติ');
    }
    if (artifactRisk) {
        score -= 30;
        hints.push('พบ artifact');
    }
    if (sourceType === 'document' && indexedChars < 1500) {
        score -= 10;
        if (!hints.length) hints.push('ข้อความค่อนข้างน้อย');
    }
    score = Math.max(0, Math.min(100, score));

    if (score >= 85) {
        return {
            score,
            label: 'ดี',
            hint: hints[0] || 'พร้อมใช้ค้นหา',
            className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
            dotClass: 'bg-emerald-500',
            textClass: 'text-emerald-700',
        };
    }
    if (score >= 60) {
        return {
            score,
            label: 'พอใช้',
            hint: hints.join(' · ') || 'ควรตรวจข้อความ',
            className: 'border-amber-100 bg-amber-50 text-amber-700',
            dotClass: 'bg-amber-500',
            textClass: 'text-amber-700',
        };
    }
    return {
        score,
        label: 'เสี่ยงอ่านไม่ครบ',
        hint: hints.join(' · ') || 'ควร Reindex หรือตรวจไฟล์',
        className: 'border-red-100 bg-red-50 text-red-700',
        dotClass: 'bg-red-500',
        textClass: 'text-red-700',
    };
}

function extractedQualityBadges(summary = {}) {
    const quality = summary.quality || {};
    const badges = [];
    if (quality.noChunks) badges.push(['red', 'ยังไม่มี chunks']);
    if (quality.embeddingMismatch) badges.push(['amber', 'embedding ไม่ครบ']);
    if (quality.lowContent) badges.push(['amber', 'ข้อความน้อยผิดปกติ']);
    if (quality.artifactHeavy) badges.push(['red', 'พบ PDF/font artifact สูง']);
    if (!badges.length) badges.push(['emerald', 'พร้อมใช้งาน']);
    const colorMap = {
        emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-100 bg-amber-50 text-amber-700',
        red: 'border-red-100 bg-red-50 text-red-700',
    };
    return badges.map(([color, label]) => `<span class="inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${colorMap[color] || colorMap.emerald}">${escHtml(label)}</span>`).join('');
}

function parseKbAudit(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(String(value));
    } catch (_) {
        return null;
    }
}

function kbAuditBadge(doc = {}) {
    const status = String(doc.AuditStatus || '').toLowerCase();
    const audit = parseKbAudit(doc.AuditJson);
    if (status === 'auditing') {
        return '<span class="inline-flex rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-[11px] font-black text-sky-700">Audit: กำลังตรวจ</span>';
    }
    if (status === 'ready' && audit) {
        const confidence = String(audit.confidence || 'medium').toLowerCase();
        const color = confidence === 'high' ? 'emerald' : confidence === 'low' ? 'amber' : 'teal';
        const map = {
            emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
            teal: 'border-teal-100 bg-teal-50 text-teal-700',
            amber: 'border-amber-100 bg-amber-50 text-amber-700',
        };
        return `<span class="inline-flex rounded-full border px-2 py-1 text-[11px] font-black ${map[color]}">Audit: ${escHtml(confidence)}</span>`;
    }
    if (status === 'failed') {
        return '<span class="inline-flex rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">Audit: fallback</span>';
    }
    if (status === 'no_chunks') {
        return '<span class="inline-flex rounded-full border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">Audit: no chunks</span>';
    }
    return '<span class="inline-flex rounded-full border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-400">Audit: รอ reindex</span>';
}

function renderAuditList(items, emptyText) {
    const safe = Array.isArray(items) ? items.filter(Boolean).slice(0, 8) : [];
    if (!safe.length) return `<div class="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-400">${escHtml(emptyText)}</div>`;
    return `<ul class="space-y-1.5">${safe.map(item => `<li class="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">${escHtml(item)}</li>`).join('')}</ul>`;
}

function renderKbAuditPanel(doc = {}) {
    const audit = parseKbAudit(doc.AuditJson);
    if (!audit) {
        return `
            <div class="rounded-2xl border border-slate-100 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-sm font-black text-slate-800">Auto Audit หลัง Index</div>
                    ${kbAuditBadge(doc)}
                </div>
                <div class="mt-2 text-xs text-slate-400">ยังไม่มีผล audit ให้ Reindex เอกสารนี้เพื่อให้ Johnny ตรวจหัวข้อและข้อกำหนดอัตโนมัติ</div>
            </div>
        `;
    }
    const relations = audit.safetyRelations || {};
    const relationItems = ['PPE', 'Contractor', 'KY', 'Hiyari', 'Patrol'].map(key => `
        <span class="rounded-full border px-2 py-1 text-[11px] font-black ${relations[key] ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-slate-50 text-slate-400'}">${key}</span>
    `).join('');
    return `
        <div class="rounded-2xl border border-teal-100 bg-white p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div class="text-sm font-black text-teal-800">Auto Audit หลัง Index</div>
                    <div class="text-[11px] text-slate-400">${escHtml(String(doc.LastAuditAt || audit.auditedAt || '').slice(0, 16).replace('T', ' '))}</div>
                </div>
                ${kbAuditBadge(doc)}
            </div>
            <div class="mt-3 rounded-xl bg-teal-50/70 p-3 text-xs leading-relaxed text-teal-900">${escHtml(audit.summary || 'ยังไม่มีสรุป')}</div>
            <div class="mt-3 flex flex-wrap gap-2">${relationItems}</div>
            <div class="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                    <div class="mb-1 text-xs font-black text-slate-600">หัวข้อหลักที่พบ</div>
                    ${renderAuditList(audit.mainTopics, 'ยังไม่มีหัวข้อหลัก')}
                </div>
                <div>
                    <div class="mb-1 text-xs font-black text-slate-600">ข้อกำหนด/ขั้นตอนสำคัญ</div>
                    ${renderAuditList([...(audit.requirements || []), ...(audit.procedures || [])], 'ยังไม่พบข้อกำหนดหรือขั้นตอน')}
                </div>
                <div>
                    <div class="mb-1 text-xs font-black text-slate-600">ข้อห้าม/ข้อควรระวัง</div>
                    ${renderAuditList(audit.prohibitions, 'ยังไม่พบข้อห้ามชัดเจน')}
                </div>
                <div>
                    <div class="mb-1 text-xs font-black text-slate-600">จุดที่อ่านไม่มั่นใจ</div>
                    ${renderAuditList([...(audit.uncertainAreas || []), ...(audit.qualityNotes || [])], 'ยังไม่พบจุดเสี่ยงจาก audit')}
                </div>
            </div>
        </div>
    `;
}

function renderExtractionLogPanel(doc = {}) {
    const log = parseOperationalMeta(doc.ExtractionLogJson);
    if (!log) return '';
    const attempts = Array.isArray(log.attempts) ? log.attempts : [];
    const tone = { success: 'text-emerald-700 bg-emerald-50', fallback: 'text-amber-700 bg-amber-50', low_quality: 'text-amber-700 bg-amber-50', incomplete: 'text-red-700 bg-red-50', timeout: 'text-red-700 bg-red-50', error: 'text-red-700 bg-red-50' };
    return `
        <div class="rounded-2xl border border-sky-100 bg-white p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div class="text-sm font-black text-sky-800">Extraction Log</div>
                    <div class="text-[11px] text-slate-400">${escHtml(String(doc.LastExtractionAt || log.completedAt || '').slice(0, 19).replace('T', ' '))}</div>
                </div>
                <span class="rounded-full px-2 py-1 text-[11px] font-black ${log.outcome === 'accepted' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}">${log.outcome === 'accepted' ? 'นำไปใช้แล้ว' : 'ปฏิเสธผลใหม่'}</span>
            </div>
            <div class="mt-3 grid gap-2 md:grid-cols-3">
                <div class="rounded-xl bg-slate-50 p-3 text-xs"><div class="text-slate-400">วิธีที่ใช้</div><div class="mt-1 font-black text-slate-700">${escHtml(log.selectedMethod || '-')}</div></div>
                <div class="rounded-xl bg-slate-50 p-3 text-xs"><div class="text-slate-400">Index เดิม</div><div class="mt-1 font-black text-slate-700">${Number(log.previousIndex?.chunks || 0)} chunks · ${Number(log.previousIndex?.chars || 0).toLocaleString()} chars</div></div>
                <div class="rounded-xl bg-slate-50 p-3 text-xs"><div class="text-slate-400">ผลที่อ่านรอบนี้</div><div class="mt-1 font-black text-slate-700">${Number(log.candidate?.chunks || 0)} chunks · ${Number(log.candidate?.chars || 0).toLocaleString()} chars</div></div>
            </div>
            <div class="mt-3 space-y-2">
                ${attempts.map((attempt, index) => `
                    <div class="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 text-xs md:flex-row md:items-center md:justify-between">
                        <div class="min-w-0">
                            <span class="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1 font-black text-slate-500">${index + 1}</span>
                            <span class="font-black text-slate-700">${escHtml(attempt.stage || '-')}</span>
                            <span class="ml-2 text-slate-500">${escHtml(attempt.model || attempt.parser || '')}</span>
                            ${attempt.error ? `<div class="mt-1 break-words text-red-600">${escHtml(attempt.error)}</div>` : ''}
                        </div>
                        <div class="flex shrink-0 flex-wrap items-center gap-2">
                            <span class="rounded-full px-2 py-1 text-[10px] font-black ${tone[attempt.status] || 'bg-slate-50 text-slate-600'}">${escHtml(attempt.status || '-')}</span>
                            ${attempt.httpStatus ? `<span class="text-slate-400">HTTP ${Number(attempt.httpStatus)}</span>` : ''}
                            ${Number.isFinite(Number(attempt.chars)) ? `<span class="text-slate-400">${Number(attempt.chars).toLocaleString()} chars</span>` : ''}
                            ${attempt.durationMs ? `<span class="text-slate-400">${Number(attempt.durationMs).toLocaleString()} ms</span>` : ''}
                        </div>
                    </div>`).join('') || '<div class="text-xs text-slate-400">ไม่มี attempt log</div>'}
            </div>
            ${log.error ? `<div class="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">${escHtml(log.error)}</div>` : ''}
        </div>`;
}

async function viewKbExtracted(id) {
    if (!id) return;
    try {
        const res = await API.get(`/johnny/kb-documents/${encodeURIComponent(id)}/extracted`);
        const data = res?.data || {};
        const doc = data.document || {};
        const summary = data.summary || {};
        const chunks = Array.isArray(data.chunks) ? data.chunks : [];
        const topics = Array.isArray(summary.topics) ? summary.topics : [];
        const keywords = Array.isArray(summary.keywords) ? summary.keywords : [];
        openModal(
            `ตรวจข้อความที่ Johnny อ่านได้`,
            `
                <div class="space-y-4">
                    <div class="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <div class="text-base font-black text-slate-800">${escHtml(doc.Title || doc.OriginalName || 'Knowledge Base')}</div>
                        <div class="mt-1 text-xs text-slate-500">${escHtml(doc.OriginalName || '')}</div>
                        <div class="mt-3 flex flex-wrap gap-2">${extractedQualityBadges(summary)}</div>
                        <div class="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                            <div class="rounded-xl bg-white p-3"><div class="text-slate-400">Chunks</div><div class="text-lg font-black text-slate-800">${Number(summary.totalChunks || 0).toLocaleString()}</div></div>
                            <div class="rounded-xl bg-white p-3"><div class="text-slate-400">ตัวอักษร</div><div class="text-lg font-black text-slate-800">${Number(summary.totalChars || 0).toLocaleString()}</div></div>
                            <div class="rounded-xl bg-white p-3"><div class="text-slate-400">Embeddings</div><div class="text-lg font-black text-slate-800">${Number(summary.embeddingCount || 0).toLocaleString()}</div></div>
                            <div class="rounded-xl bg-white p-3"><div class="text-slate-400">Artifacts</div><div class="text-lg font-black text-slate-800">${Number(summary.artifactMatches || 0).toLocaleString()}</div></div>
                        </div>
                    </div>

                    ${renderKbAuditPanel(doc)}
                    ${renderExtractionLogPanel(doc)}

                    <div class="rounded-2xl border border-emerald-100 bg-white p-4">
                        <div class="text-sm font-black text-emerald-800">หัวข้อ/ช่วงข้อความที่พบ</div>
                        <div class="mt-2 flex flex-wrap gap-2">
                            ${keywords.length ? keywords.map(k => `<span class="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">${escHtml(k)}</span>`).join('') : '<span class="text-xs text-slate-400">ยังจับ keyword ไม่ได้</span>'}
                        </div>
                        <div class="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                            ${topics.length ? topics.map(t => `
                                <div class="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                                    <div class="font-black text-slate-600">Chunk ${Number(t.chunkIndex || 0) + 1} <span class="font-bold text-slate-400">(${Number(t.chars || 0).toLocaleString()} chars)</span></div>
                                    <div class="mt-1 text-slate-600">${escHtml(t.title || '')}</div>
                                </div>
                            `).join('') : '<div class="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">ยังไม่มีหัวข้อจาก chunks</div>'}
                        </div>
                    </div>

                    <div class="rounded-2xl border border-slate-100 bg-white p-4">
                        <div class="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div class="text-sm font-black text-slate-800">ข้อความจริงที่ถูกนำไปทำ Embedding</div>
                                <div class="text-[11px] text-slate-400">ถ้าตรงนี้อ่านไม่รู้เรื่อง Johnny ก็จะตอบจากเอกสารได้ไม่ดี</div>
                            </div>
                            <button id="johnny-kb-refine-extracted" type="button" class="shrink-0 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60" data-id="${escHtml(String(id))}" ${chunks.length ? '' : 'disabled'}>
                                เกลาข้อความใหม่
                            </button>
                        </div>
                        <div class="mb-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] leading-relaxed text-violet-700">
                            ปุ่มนี้จะให้ AI ปรับภาษา/ตัด artifact จากข้อความที่อ่านได้ โดยห้ามเพิ่มข้อมูลหรือเปลี่ยนความหมาย แล้วสร้าง embedding ใหม่ให้ Johnny ค้นหาได้ดีขึ้น ไฟล์ต้นฉบับยังไม่ถูกแก้ไข
                        </div>
                        <div class="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
                            ${chunks.length ? chunks.map(chunk => `
                                <details class="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/70 p-3" ${Number(chunk.chunkIndex || 0) === 0 ? 'open' : ''}>
                                    <summary class="cursor-pointer text-xs font-black text-slate-700">
                                        Chunk ${Number(chunk.chunkIndex || 0) + 1}
                                        <span class="font-bold text-slate-400">• ${Number(chunk.chars || 0).toLocaleString()} chars • ${chunk.hasEmbedding ? 'embedding พร้อม' : 'ไม่มี embedding'}</span>
                                    </summary>
                                    <pre class="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-relaxed text-slate-700">${escHtml(chunk.text || '')}</pre>
                                </details>
                            `).join('') : '<div class="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">ยังไม่มีข้อความที่ index แล้ว</div>'}
                        </div>
                    </div>
                </div>
            `,
            'max-w-5xl'
        );
        document.getElementById('johnny-kb-refine-extracted')?.addEventListener('click', () => refineKbExtracted(id));
    } catch (error) {
        console.error(error);
        showToast(error.message || 'ไม่สามารถเปิดข้อความที่ Johnny อ่านได้', 'error');
    }
}

async function refineKbExtracted(id) {
    const docId = Number(id);
    if (!Number.isInteger(docId) || _kbRefiningIds.has(docId)) return;
    const doc = _kbDocs.find(row => Number(row.id) === docId);
    if (!confirm('ให้ Johnny เกลา/ปรับภาษาข้อความที่อ่านได้ใหม่ใช่ไหม? ระบบจะไม่แก้ไฟล์ต้นฉบับ แต่จะอัปเดต chunks และ embeddings ที่ใช้ค้นหา')) return;
    _kbRefiningIds.add(docId);
    renderKbList();
    const btn = document.getElementById('johnny-kb-refine-extracted');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"></span>กำลังเกลา...';
    }
    setKbOperationMessage(`กำลังเกลาข้อความ “${doc?.Title || doc?.OriginalName || 'Knowledge Base'}” และสร้าง embeddings ใหม่ กรุณาอย่าปิดหน้านี้`, 'working');
    showToast('เริ่มเกลาข้อความแล้ว กรุณารอสักครู่', 'info');
    try {
        const res = await API.post(`/johnny/kb-documents/${encodeURIComponent(docId)}/refine`, {});
        const chunks = Number(res?.indexed?.chunks ?? 0);
        const limited = Boolean(res?.indexed?.limited);
        showToast(`เกลาข้อความสำเร็จ ${chunks.toLocaleString()} chunks`, 'success');
        await Promise.all([loadKbDocuments(), loadStatus()]);
        setKbOperationMessage(`เกลาข้อความสำเร็จ · ${chunks.toLocaleString()} chunks พร้อมค้นหา${limited ? ' · มีบาง chunk ยังไม่ได้เกลาเพราะเกิน limit' : ''}`, 'success', 6000);
        await viewKbExtracted(docId);
    } catch (err) {
        showToast(err?.message || 'เกลาข้อความไม่สำเร็จ', 'error');
        await loadKbDocuments();
        setKbOperationMessage(`เกลาข้อความไม่สำเร็จ: ${err?.message || 'ไม่ทราบสาเหตุ'}`, 'error');
    } finally {
        _kbRefiningIds.delete(docId);
        renderKbList();
    }
}

function setBusy(value) {
    _busy = value;
    if (value) {
        _thinkingStartedAt = Date.now();
        if (_thinkingTimer) clearInterval(_thinkingTimer);
        _thinkingTimer = setInterval(() => {
            if (_busy) renderMessages();
        }, 1000);
    } else {
        if (_thinkingTimer) clearInterval(_thinkingTimer);
        _thinkingTimer = null;
        _thinkingStartedAt = 0;
    }
    const btn = document.getElementById('johnny-send');
    const input = document.getElementById('johnny-input');
    const imageInput = document.getElementById('johnny-risk-image');
    const imageBtn = document.getElementById('johnny-image-pick');
    if (btn) {
        btn.disabled = value;
        btn.innerHTML = value
            ? '<span class="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span>'
            : 'ส่ง';
    }
    if (input) input.disabled = value;
    if (imageInput) imageInput.disabled = value;
    if (imageBtn) imageBtn.disabled = value;
    if (!value) updateComposerMode();
}

function clearRiskImage() {
    if (_riskImagePreviewUrl) URL.revokeObjectURL(_riskImagePreviewUrl);
    _selectedRiskImage = null;
    _riskImagePreviewUrl = '';
    const input = document.getElementById('johnny-risk-image');
    if (input) input.value = '';
    renderRiskImagePreview();
    updateComposerMode();
}

function renderRiskImagePreview() {
    const wrap = document.getElementById('johnny-risk-image-preview');
    if (!wrap) return;
    if (!_selectedRiskImage) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = `
        <div class="johnny-risk-preview-card mt-3 flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/80 p-2.5">
            <img src="${escHtml(_riskImagePreviewUrl)}" alt="Risk image preview" class="h-20 w-24 rounded-xl object-cover border border-white shadow-sm">
            <div class="min-w-0 flex-1">
                <div class="truncate text-xs font-black text-rose-800">${escHtml(_selectedRiskImage.name || 'risk-image')}</div>
                <div class="mt-0.5 text-[11px] font-bold text-rose-700/75">พร้อมวิเคราะห์รูปนี้ · เพิ่มบริบทในช่องข้อความได้</div>
                <div class="mt-1 text-[10px] font-bold text-rose-600/75">แตะปุ่มส่งเพื่อให้ Johnny สรุปจุดเสี่ยงและสิ่งที่ต้องทำทันที</div>
                <div class="mt-0.5 text-[11px] font-bold text-rose-700/75">พร้อมวิเคราะห์อันตรายจากรูปนี้</div>
            </div>
            <button id="johnny-risk-image-clear" type="button" class="h-8 px-3 rounded-lg bg-white border border-rose-100 text-xs font-bold text-rose-700 hover:bg-rose-50">ลบ</button>
        </div>
    `;
    document.getElementById('johnny-risk-image-clear')?.addEventListener('click', clearRiskImage);
    updateComposerMode();
}

function handleRiskImageChange(event) {
    const file = event.target?.files?.[0];
    if (!file) {
        clearRiskImage();
        return;
    }
    if (!RISK_IMAGE_TYPES.has(file.type)) {
        showToast('รองรับเฉพาะรูป JPG, PNG, GIF หรือ WEBP', 'warning');
        clearRiskImage();
        return;
    }
    if (file.size > RISK_IMAGE_MAX_BYTES) {
        showToast('รูปสำหรับวิเคราะห์ต้องไม่เกิน 8 MB', 'warning');
        clearRiskImage();
        return;
    }
    if (_riskImagePreviewUrl) URL.revokeObjectURL(_riskImagePreviewUrl);
    _selectedRiskImage = file;
    _riskImagePreviewUrl = URL.createObjectURL(file);
    renderRiskImagePreview();
    updateComposerMode();
}

function setKbBusy(value) {
    _kbBusy = value;
    const btn = document.getElementById('johnny-kb-upload');
    const knowledgeBtn = document.getElementById('johnny-knowledge-save');
    const knowledgeCancel = document.getElementById('johnny-knowledge-cancel');
    if (btn) {
        btn.disabled = value;
        btn.textContent = value ? 'กำลังทำดัชนี...' : 'อัปโหลด';
    }
    if (knowledgeBtn) {
        knowledgeBtn.disabled = value;
        knowledgeBtn.textContent = value ? 'กำลังทำดัชนี...' : (_kbEditId ? 'บันทึก Safety Knowledge' : 'เพิ่ม Safety Knowledge');
    }
    if (knowledgeCancel) knowledgeCancel.disabled = value;
    if (value) setKbOperationMessage('กำลังอัปโหลด อ่านเนื้อหา และสร้าง embeddings กรุณารอและอย่าปิดหน้านี้', 'working');
    else if (!_kbReindexingIds.size) setKbOperationMessage();
}

function setAvatarBusy(value) {
    _avatarBusy = value;
    const uploadBtn = document.getElementById('johnny-avatar-upload');
    const resetBtn = document.getElementById('johnny-avatar-reset');
    const input = document.getElementById('johnny-avatar-file');
    if (uploadBtn) {
        uploadBtn.disabled = value;
        uploadBtn.textContent = value ? 'กำลังบันทึก...' : 'บันทึกรูป';
    }
    if (resetBtn) resetBtn.disabled = value || !_status?.johnnyAvatarUrl;
    if (input) input.disabled = value;
}

async function loadStatus() {
    try {
        const res = await API.get('/johnny/status');
        _status = res?.data || {};
    } catch {
        _status = { geminiConfigured: false };
    }
    renderStatus();
    if (_isAdmin) renderKbAdmin();
    renderMessages();
}

async function loadKbDocuments() {
    if (!_isAdmin) return;
    try {
        const res = await API.get('/johnny/kb-documents?all=1');
        _kbDocs = res?.data || [];
        _kbLoadError = '';
    } catch (err) {
        _kbDocs = [];
        _kbLoadError = err?.message || 'ไม่สามารถเชื่อมต่อ Knowledge Base ได้';
        showToast(err?.message || 'โหลด Knowledge Base ไม่สำเร็จ', 'error');
    }
    renderKbList();
}

async function uploadJohnnyAvatar(event) {
    event.preventDefault();
    if (_avatarBusy) return;
    const file = document.getElementById('johnny-avatar-file')?.files?.[0];
    if (!file) {
        showToast('กรุณาเลือกรูปจอห์นนี่', 'warning');
        return;
    }
    const fd = new FormData();
    fd.append('avatarFile', file);
    setAvatarBusy(true);
    try {
        const res = await API.post('/johnny/avatar', fd);
        _status = { ...(_status || {}), johnnyAvatarUrl: res?.data?.johnnyAvatarUrl || '' };
        showToast('อัปเดตรูปจอห์นนี่แล้ว', 'success');
        renderKbAdmin();
        renderStatus();
        renderMessages();
    } catch (err) {
        showToast(err?.message || 'อัปเดตรูปจอห์นนี่ไม่สำเร็จ', 'error');
    } finally {
        setAvatarBusy(false);
    }
}

async function resetJohnnyAvatar() {
    if (_avatarBusy || !_status?.johnnyAvatarUrl) return;
    if (!confirm('รีเซ็ตรูปจอห์นนี่กลับเป็นตัวอักษร J?')) return;
    setAvatarBusy(true);
    try {
        await API.delete('/johnny/avatar');
        _status = { ...(_status || {}), johnnyAvatarUrl: '' };
        showToast('รีเซ็ตรูปจอห์นนี่แล้ว', 'success');
        renderKbAdmin();
        renderStatus();
        renderMessages();
    } catch (err) {
        showToast(err?.message || 'รีเซ็ตรูปจอห์นนี่ไม่สำเร็จ', 'error');
    } finally {
        setAvatarBusy(false);
    }
}

async function loadConversations() {
    try {
        const res = await API.get('/johnny/conversations');
        _conversations = res?.data || [];
    } catch {
        _conversations = [];
    }
    renderConversations();
}

async function loadConversation(id) {
    if (!id) return;
    try {
        const res = await API.get(`/johnny/conversations/${encodeURIComponent(id)}`);
        _conversationId = res?.data?.conversation?.id || null;
        _messages = res?.data?.messages || [];
        renderConversations();
        renderMessages();
    } catch (err) {
        showToast(err?.message || 'ไม่สามารถโหลดประวัติ Johnny AI ได้', 'error');
    }
}

function startNewChat() {
    closeMobileHistory();
    _conversationId = null;
    _messages = [];
    clearRiskImage();
    renderConversations();
    renderMessages();
    document.getElementById('johnny-input')?.focus();
}

async function deleteCurrentChat() {
    if (!_conversationId) return;
    if (!confirm('ลบประวัติสนทนานี้?')) return;
    try {
        await API.delete(`/johnny/conversations/${encodeURIComponent(_conversationId)}`);
        startNewChat();
        await loadConversations();
        showToast('ลบประวัติ Johnny AI แล้ว', 'success');
    } catch (err) {
        showToast(err?.message || 'ลบประวัติไม่สำเร็จ', 'error');
    }
}

async function submitMessage(text, options = {}) {
    const message = String(text || '').trim();
    if (!message || _busy) return;
    const documentId = Number(options.documentId || 0);
    const documentTitle = options.documentTitle || '';
    const input = document.getElementById('johnny-input');
    if (input) input.value = '';
    if (documentId) clearRiskImage();
    _messages.push({
        Role: 'user',
        MessageText: documentId ? `${message}\n\n[ถามเฉพาะเอกสาร: ${documentTitle || `#${documentId}`}]` : message,
    });
    _messages.push({ Role: 'assistant', isTyping: true });
    renderMessages();
    setBusy(true);
    try {
        const res = await API.post('/johnny/chat', {
            message,
            conversationId: _conversationId,
            ...(documentId ? { documentId } : {}),
        });
        const data = res?.data || {};
        _conversationId = data.conversationId || _conversationId;
        _messages = _messages.filter(item => !item.isTyping);
        _messages.push({
            Role: 'assistant',
            MessageText: data.answer || '',
            SourceType: data.sourceType || 'ai_general',
            CitationsJson: data.citations || [],
            AnswerQuality: data.answerQuality || null,
        });
        renderMessages();
        await loadConversations();
    } catch (err) {
        _messages = _messages.filter(item => !item.isTyping);
        _messages.push({
            Role: 'assistant',
            MessageText: err?.message || 'Johnny AI ยังตอบไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
            SourceType: 'not_verified',
        });
        renderMessages();
        showToast(err?.message || 'Johnny AI ยังตอบไม่ได้ในขณะนี้', 'error');
    } finally {
        setBusy(false);
        input?.focus();
    }
}

async function submitRiskImage(text) {
    const context = String(text || '').trim();
    if (!_selectedRiskImage || _busy) return;
    const input = document.getElementById('johnny-input');
    const fileInput = document.getElementById('johnny-risk-image');
    const file = _selectedRiskImage;
    const previewUrl = _riskImagePreviewUrl;
    const displayText = context
        ? `วิเคราะห์ความเสี่ยงจากรูปภาพ\nบริบท: ${context}`
        : 'วิเคราะห์ความเสี่ยงจากรูปภาพ';
    if (input) input.value = '';
    if (fileInput) fileInput.value = '';
    _selectedRiskImage = null;
    _riskImagePreviewUrl = '';
    renderRiskImagePreview();
    _messages.push({ Role: 'user', MessageText: displayText, imagePreviewUrl: previewUrl });
    _messages.push({ Role: 'assistant', isTyping: true });
    renderMessages();
    setBusy(true);
    try {
        const fd = new FormData();
        fd.append('riskImage', file);
        fd.append('message', context);
        if (_conversationId) fd.append('conversationId', _conversationId);
        const res = await API.post('/johnny/analyze-image', fd);
        const data = res?.data || {};
        _conversationId = data.conversationId || _conversationId;
        _messages = _messages.filter(item => !item.isTyping);
        _messages.push({
            Role: 'assistant',
            MessageText: data.answer || '',
            SourceType: data.sourceType || 'image_analysis',
            CitationsJson: data.citations || [],
            AnswerQuality: data.answerQuality || null,
        });
        renderMessages();
        await loadConversations();
    } catch (err) {
        _messages = _messages.filter(item => !item.isTyping);
        _messages.push({
            Role: 'assistant',
            MessageText: err?.message || 'Johnny AI ยังวิเคราะห์รูปนี้ไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
            SourceType: 'not_verified',
        });
        renderMessages();
        showToast(err?.message || 'วิเคราะห์รูปไม่สำเร็จ', 'error');
    } finally {
        setBusy(false);
        input?.focus();
    }
}

async function uploadKbDocument(event) {
    event.preventDefault();
    if (_kbBusy) return;
    const file = document.getElementById('johnny-kb-file')?.files?.[0];
    if (!file) {
        showToast('กรุณาเลือกไฟล์เอกสาร', 'warning');
        return;
    }
    const fd = new FormData();
    fd.append('kbFile', file);
    fd.append('title', document.getElementById('johnny-kb-title')?.value || file.name);
    fd.append('category', document.getElementById('johnny-kb-category')?.value || 'general');
    setKbBusy(true);
    try {
        await API.post('/johnny/kb-documents', fd);
        document.getElementById('johnny-kb-form')?.reset();
        const cat = document.getElementById('johnny-kb-category');
        if (cat) cat.value = 'general';
        showToast('อัปโหลดและทำ Knowledge Base สำเร็จ', 'success');
        await Promise.all([loadKbDocuments(), loadStatus()]);
    } catch (err) {
        showToast(err?.message || 'อัปโหลด Knowledge Base ไม่สำเร็จ', 'error');
        await loadKbDocuments();
    } finally {
        setKbBusy(false);
    }
}

function resetManualKnowledgeForm() {
    _kbEditId = null;
    const form = document.getElementById('johnny-knowledge-form');
    form?.reset();
    const cat = document.getElementById('johnny-knowledge-category');
    if (cat) cat.value = 'general';
    const cancel = document.getElementById('johnny-knowledge-cancel');
    const save = document.getElementById('johnny-knowledge-save');
    cancel?.classList.add('hidden');
    if (save) save.textContent = 'เพิ่ม Safety Knowledge';
}

function cancelManualKnowledgeEdit() {
    if (_kbBusy) return;
    resetManualKnowledgeForm();
}

function editManualKnowledge(id) {
    const doc = _kbDocs.find(row => Number(row.id) === Number(id));
    if (!doc || String(doc.SourceType || 'document') !== 'manual') return;
    _kbEditId = Number(doc.id);
    const topic = document.getElementById('johnny-knowledge-topic');
    const category = document.getElementById('johnny-knowledge-category');
    const content = document.getElementById('johnny-knowledge-content');
    const cancel = document.getElementById('johnny-knowledge-cancel');
    const save = document.getElementById('johnny-knowledge-save');
    if (topic) topic.value = doc.Title || '';
    if (category) category.value = doc.Category || 'general';
    if (content) content.value = doc.TextContent || '';
    cancel?.classList.remove('hidden');
    if (save) save.textContent = 'บันทึก Safety Knowledge';
    topic?.focus();
}

async function saveManualKnowledge(event) {
    event.preventDefault();
    if (_kbBusy) return;
    const topic = document.getElementById('johnny-knowledge-topic')?.value || '';
    const category = document.getElementById('johnny-knowledge-category')?.value || 'general';
    const content = document.getElementById('johnny-knowledge-content')?.value || '';
    if (!topic.trim()) {
        showToast('กรุณาระบุหัวข้อ Safety Knowledge', 'warning');
        return;
    }
    if (content.trim().length < 80) {
        showToast('กรุณาระบุเนื้อหาอย่างน้อย 80 ตัวอักษร', 'warning');
        return;
    }
    setKbBusy(true);
    try {
        const payload = { topic, category, content };
        if (_kbEditId) {
            const doc = _kbDocs.find(row => Number(row.id) === Number(_kbEditId));
            payload.isActive = doc ? Boolean(Number(doc.IsActive)) : true;
            await API.put(`/johnny/kb-knowledge/${encodeURIComponent(_kbEditId)}`, payload);
            showToast('บันทึก Safety Knowledge สำเร็จ', 'success');
        } else {
            await API.post('/johnny/kb-knowledge', payload);
            showToast('เพิ่ม Safety Knowledge สำเร็จ', 'success');
        }
        resetManualKnowledgeForm();
        await Promise.all([loadKbDocuments(), loadStatus()]);
    } catch (err) {
        showToast(err?.message || 'บันทึก Safety Knowledge ไม่สำเร็จ', 'error');
        await loadKbDocuments();
    } finally {
        setKbBusy(false);
    }
}

async function toggleKbDocument(id, active) {
    const doc = _kbDocs.find(row => Number(row.id) === Number(id));
    if (!doc) return;
    try {
        await API.put(`/johnny/kb-documents/${encodeURIComponent(id)}`, {
            title: doc.Title || doc.OriginalName || 'Knowledge Base',
            category: doc.Category || 'general',
            isActive: active,
        });
        await Promise.all([loadKbDocuments(), loadStatus()]);
    } catch (err) {
        showToast(err?.message || 'อัปเดตเอกสารไม่สำเร็จ', 'error');
    }
}

async function reindexKbDocument(id) {
    const docId = Number(id);
    if (!Number.isInteger(docId) || _kbReindexingIds.has(docId)) return;
    const doc = _kbDocs.find(row => Number(row.id) === docId);
    _kbReindexingIds.add(docId);
    renderKbList();
    setKbOperationMessage(`กำลัง Reindex “${doc?.Title || doc?.OriginalName || 'Knowledge Base'}” ระบบกำลังอ่านไฟล์และสร้าง embeddings กรุณาอย่าปิดหน้านี้`, 'working');
    showToast('เริ่ม Reindex แล้ว กรุณารอสักครู่', 'info');
    try {
        const res = await API.post(`/johnny/kb-documents/${encodeURIComponent(docId)}/reindex`, {});
        const chunks = Number(res?.indexed?.chunks ?? res?.data?.ChunkCount ?? 0);
        showToast(`Reindex สำเร็จ ${chunks.toLocaleString()} chunks`, 'success');
        await Promise.all([loadKbDocuments(), loadStatus()]);
        setKbOperationMessage(`Reindex สำเร็จ · ${chunks.toLocaleString()} chunks พร้อมค้นหา`, 'success', 5000);
    } catch (err) {
        showToast(err?.message || 'Reindex ไม่สำเร็จ', 'error');
        await loadKbDocuments();
        setKbOperationMessage(`Reindex ไม่สำเร็จ: ${err?.message || 'ไม่ทราบสาเหตุ'}`, 'error');
    } finally {
        _kbReindexingIds.delete(docId);
        renderKbList();
    }
}

async function deleteKbDocument(id) {
    if (!confirm('ลบเอกสาร Knowledge Base นี้?')) return;
    try {
        await API.delete(`/johnny/kb-documents/${encodeURIComponent(id)}`);
        showToast('ลบเอกสารแล้ว', 'success');
        await Promise.all([loadKbDocuments(), loadStatus()]);
    } catch (err) {
        showToast(err?.message || 'ลบเอกสารไม่สำเร็จ', 'error');
    }
}

function getAskableKbDocument(id) {
    const docId = Number(id);
    const doc = _kbDocs.find(row => Number(row.id) === docId);
    const actualChunks = Number(doc?.ActualChunkCount ?? doc?.ChunkCount ?? 0);
    if (!doc || Number(doc.IsActive) !== 1 || String(doc.IndexedStatus || '') !== 'ready' || actualChunks <= 0) {
        showToast('เอกสารนี้ยังไม่พร้อมให้ Johnny ถามเฉพาะเอกสาร กรุณา Reindex หรือเปิดใช้งานก่อน', 'warning');
        return null;
    }
    return doc;
}

async function summarizeKbDocument(id) {
    const doc = getAskableKbDocument(id);
    if (!doc || _busy) return;
    switchJohnnyTab('chat');
    const title = doc.Title || doc.OriginalName || 'Knowledge Base';
    const prompt = [
        'ช่วยสรุปเอกสารนี้ให้ Admin ตรวจสอบว่า Johnny เข้าใจเอกสารได้ถูกต้องหรือไม่',
        'ตอบจากเอกสารที่เลือกเท่านั้น',
        'สรุปเป็น 5 ส่วน: เอกสารนี้เกี่ยวกับอะไร, หัวข้อหลักที่พบ, ข้อกำหนดหรือขั้นตอนสำคัญ, จุดที่เกี่ยวกับ PPE/Contractor/KY/Hiyari/Patrol ถ้ามี, และจุดที่อ่านไม่ครบหรือควรตรวจเพิ่ม',
    ].join('\n');
    await submitMessage(prompt, { documentId: Number(doc.id), documentTitle: title });
}

function askKbDocument(id) {
    const doc = getAskableKbDocument(id);
    if (!doc) return;
    const title = doc.Title || doc.OriginalName || 'Knowledge Base';
    openModal(
        'ถามเฉพาะเอกสารนี้',
        `
            <form id="johnny-ask-doc-form" class="space-y-4">
                <div class="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                    <div class="text-sm font-black text-indigo-900">${escHtml(title)}</div>
                    <div class="mt-1 text-xs leading-relaxed text-indigo-700">Johnny จะค้นและตอบจาก chunks ของเอกสารนี้เท่านั้น ถ้าเอกสารนี้ไม่มีข้อมูลพอ Johnny ควรบอกว่าไม่พบข้อมูลยืนยันในเอกสารนี้</div>
                </div>
                <label class="block text-sm font-bold text-slate-700">
                    คำถาม
                    <textarea id="johnny-ask-doc-question" class="form-input mt-2 min-h-[120px] w-full rounded-xl border-indigo-100 leading-relaxed" maxlength="2000" placeholder="เช่น เอกสารนี้กำหนด PPE อะไรบ้าง หรือ ผู้รับเหมาต้องทำอะไรตอนเข้าพื้นที่"></textarea>
                </label>
                <div class="flex justify-end gap-2">
                    <button type="button" id="johnny-ask-doc-cancel" class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                    <button type="submit" class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700">ถาม Johnny</button>
                </div>
            </form>
        `,
        'max-w-2xl'
    );
    document.getElementById('johnny-ask-doc-cancel')?.addEventListener('click', closeModal);
    document.getElementById('johnny-ask-doc-question')?.focus();
    document.getElementById('johnny-ask-doc-form')?.addEventListener('submit', guardSubmitHandler(async event => {
        event.preventDefault();
        const question = document.getElementById('johnny-ask-doc-question')?.value || '';
        if (!question.trim()) {
            showToast('กรุณาพิมพ์คำถามก่อน', 'warning');
            return;
        }
        closeModal();
        switchJohnnyTab('chat');
        await submitMessage(question, { documentId: Number(doc.id), documentTitle: title });
    }));
}

function bindQuickPrompts() {
    document.querySelectorAll('.johnny-quick').forEach(btn => {
        btn.addEventListener('click', () => submitMessage(btn.dataset.prompt || btn.textContent || ''));
    });
}

function bindEvents() {
    document.getElementById('johnny-input')?.setAttribute('placeholder', 'ถาม Johnny');
    document.getElementById('johnny-history-open')?.addEventListener('click', openMobileHistory);
    document.getElementById('johnny-history-close')?.addEventListener('click', closeMobileHistory);
    document.getElementById('johnny-history-backdrop')?.addEventListener('click', closeMobileHistory);
    document.getElementById('johnny-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const text = document.getElementById('johnny-input')?.value || '';
        if (_selectedRiskImage) {
            submitRiskImage(text);
        } else {
            submitMessage(text);
        }
    });
    document.getElementById('johnny-image-pick')?.addEventListener('click', () => {
        document.getElementById('johnny-risk-image')?.click();
    });
    document.getElementById('johnny-risk-image')?.addEventListener('change', handleRiskImageChange);
    document.getElementById('johnny-new-chat')?.addEventListener('click', startNewChat);
    document.getElementById('johnny-delete-chat')?.addEventListener('click', deleteCurrentChat);
    bindQuickPrompts();
    updateComposerMode();
}

export async function loadJohnnyAiPage() {
    const el = pageEl();
    if (!el) return;
    const user = TSHSession.getUser() || {};
    _isAdmin = String(user.role || user.Role || '').toLowerCase() === 'admin';
    if (!_isAdmin) _activeTab = 'chat';
    el.innerHTML = `
        <div class="johnny-shell h-full min-h-[calc(100dvh-7rem)] space-y-3 sm:space-y-4" data-johnny-phase2="${JOHNNY_PHASE2_MARKER}" data-johnny-mobile-compact="20260709" data-johnny-tab="${escHtml(_activeTab)}">
            ${renderJohnnyTabs()}
            <div id="johnny-admin-panel" class="${_isAdmin && _activeTab === 'admin' ? '' : 'hidden'}">
                <div id="johnny-kb-admin"></div>
            </div>
            <div id="johnny-chat-panel" class="${_activeTab === 'chat' ? '' : 'hidden'}">
            <div class="johnny-chat-layout grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-3 sm:gap-4">
                <button id="johnny-history-backdrop" type="button" class="johnny-history-backdrop" aria-label="Close chat history"></button>
                <aside id="johnny-history-panel" class="johnny-history-panel order-2 lg:order-1 rounded-2xl border border-emerald-100 bg-white/90 shadow-sm overflow-hidden">
                    <div class="p-4 border-b border-emerald-100" style="background:linear-gradient(135deg,#ecfdf5,#ffffff)">
                        <div class="mb-3 flex items-center justify-between lg:hidden">
                            <p class="text-xs font-black uppercase tracking-wide text-slate-400">Chat History</p>
                            <button id="johnny-history-close" type="button" class="h-9 w-9 rounded-xl border border-slate-100 text-slate-500 hover:bg-slate-50" aria-label="Close chat history">×</button>
                        </div>
                        <div class="flex items-center gap-3">
                            <div id="johnny-sidebar-avatar">${johnnyAvatar('w-11 h-11', 'text-lg')}</div>
                            <div class="min-w-0">
                                <h2 class="font-black text-slate-800 leading-tight">Johnny AI</h2>
                                <p class="text-xs text-emerald-700 font-bold">SHE Assistant</p>
                            </div>
                        </div>
                        <button id="johnny-new-chat" type="button" class="mt-4 w-full px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
                            เริ่มแชทใหม่
                        </button>
                    </div>
                    <div class="p-3 border-b border-slate-100">
                        <div id="johnny-status" class="rounded-xl bg-slate-50 border border-slate-100 p-3"></div>
                    </div>
                    <div class="p-3">
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-xs font-black uppercase tracking-wide text-slate-400">History</p>
                            <button id="johnny-delete-chat" type="button" class="text-xs font-bold text-red-500 hover:text-red-600">ลบแชทนี้</button>
                        </div>
                        <div id="johnny-conversation-list" class="space-y-2 max-h-[45vh] overflow-y-auto pr-1"></div>
                    </div>
                </aside>

                <section class="order-1 lg:order-2 rounded-2xl border border-emerald-100 bg-white/75 shadow-sm overflow-hidden flex flex-col min-h-[calc(100dvh-15rem)] lg:min-h-[640px]">
                    <div class="px-4 sm:px-5 py-4 border-b border-emerald-100 bg-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <button id="johnny-history-open" type="button" class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 text-xs font-black text-emerald-700 lg:hidden" aria-label="Open chat history">
                            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                            </svg>
                            History
                        </button>
                        <div>
                            <p class="text-[11px] font-black uppercase tracking-widest text-emerald-700">Safety AI Helpdesk</p>
                            <h1 class="text-xl font-black text-slate-800">จอห์นนี่พร้อมช่วยตอบคำถาม SHE</h1>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${QUICK_PROMPTS.slice(0, 2).map(prompt => `
                                <button type="button" class="johnny-quick px-3 py-2 rounded-xl border border-emerald-100 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                                        data-prompt="${escHtml(prompt)}">${escHtml(prompt)}</button>
                            `).join('')}
                        </div>
                    </div>
                    <div class="johnny-field-quick-wrap border-b border-emerald-100 bg-emerald-50/60 px-3 py-2">
                        <div class="johnny-field-quick-rail flex gap-2 overflow-x-auto pb-1">
                            ${fieldQuickPromptsHtml(6)}
                        </div>
                    </div>
                    <div id="johnny-messages" class="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5" style="background:linear-gradient(180deg,#f8fafc,#ecfdf5)"></div>
                    <form id="johnny-form" class="johnny-field-composer p-3 sm:p-4 border-t border-emerald-100 bg-white">
                        <input id="johnny-risk-image" type="file" class="hidden" accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp">
                        <div class="grid grid-cols-[52px_minmax(0,1fr)_72px] sm:grid-cols-[56px_minmax(0,1fr)_88px] gap-2 items-stretch">
                            <button id="johnny-image-pick" type="button"
                                class="h-14 w-full rounded-2xl border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60 flex items-center justify-center"
                                title="แนบรูปเพื่อวิเคราะห์ความเสี่ยง">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 8.5A2.5 2.5 0 015.5 6H8l1.2-1.6A2 2 0 0110.8 3.6h2.4a2 2 0 011.6.8L16 6h2.5A2.5 2.5 0 0121 8.5v8A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5v-8z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M15.5 12.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" />
                                </svg>
                            </button>
                            <textarea id="johnny-input" rows="1" maxlength="4000"
                                class="johnny-composer-input form-input h-14 min-h-14 max-h-14 w-full resize-none rounded-2xl border-emerald-100 px-4 py-4 text-sm leading-5 focus:border-emerald-500 focus:ring-emerald-500"
                                placeholder="ถาม Johnny"></textarea>
                            <button id="johnny-send" type="submit"
                                class="h-14 w-full rounded-2xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center">
                                ส่ง
                            </button>
                        </div>
                        <div class="johnny-composer-help mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-400">
                            <span>มือถือหน้างาน: แนบรูป + เพิ่มบริบทสั้น ๆ จะช่วยให้ Johnny วิเคราะห์ตรงจุดขึ้น</span>
                            <span class="text-emerald-600">Phase 2 mobile ready</span>
                        </div>
                        <div id="johnny-risk-image-preview"></div>
                    </form>
                </section>
            </div>
            </div>
        </div>
    `;
    renderKbAdmin();
    bindJohnnyTabs();
    bindEvents();
    renderMessages();
    await Promise.all([loadStatus(), loadConversations(), loadKbDocuments(), _isAdmin ? loadObservability() : Promise.resolve(), _isAdmin ? loadOperationalLogs() : Promise.resolve()]);
}
