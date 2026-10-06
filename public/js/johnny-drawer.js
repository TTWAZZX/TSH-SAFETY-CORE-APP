import { API } from './api.js';
import { escHtml, showToast } from './ui.js';

const PHASE2_MARKER = 'JOHNNY_PHASE2_GLOBAL_SIDE_DRAWER';
const QUICK_PROMPTS = [
    'ช่วยแนะนำวิธีใช้งานระบบในหน้านี้',
    'มีเรื่องความปลอดภัยอะไรที่ควรตรวจสอบวันนี้',
    'ช่วยสรุปขั้นตอนเมื่อพบสภาพไม่ปลอดภัย',
];

let _initialized = false;
let _open = false;
let _busy = false;
let _loaded = false;
let _historyOpen = false;
let _conversationId = null;
let _conversations = [];
let _messages = [];
let _status = null;
let _userId = '';
let _userName = '';
let _activePage = '';
let _lastFocused = null;
let _loadPromise = null;
let _globalEventsBound = false;

function rootEl() {
    return document.getElementById('johnny-global-root');
}

function storageKey() {
    return `tsh_johnny_drawer_conversation_${_userId || 'user'}`;
}

function rememberConversation(id) {
    try {
        if (id) localStorage.setItem(storageKey(), String(id));
        else localStorage.removeItem(storageKey());
    } catch {}
}

function recalledConversation() {
    try {
        return localStorage.getItem(storageKey()) || '';
    } catch {
        return '';
    }
}

function parseJson(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    if (typeof raw !== 'string') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function normalizeCitations(message) {
    const value = parseJson(message?.CitationsJson ?? message?.citations, []);
    return Array.isArray(value) ? value : [];
}

function normalizeQuality(message) {
    const value = parseJson(message?.AnswerQuality ?? message?.answerQuality, null);
    return value && typeof value === 'object' ? value : null;
}

function messageText(message) {
    return String(message?.MessageText ?? message?.answer ?? message?.text ?? '');
}

function renderText(value) {
    return escHtml(String(value || '')).replace(/\n/g, '<br>');
}

const FEEDBACK_REASONS = [
    ['incorrect', 'ข้อมูลไม่ถูกต้อง'],
    ['outdated', 'ข้อมูลล้าสมัย'],
    ['unclear', 'คำตอบไม่ชัดเจน'],
    ['missing_source', 'ไม่มีแหล่งอ้างอิงที่ต้องการ'],
    ['unsafe', 'คำแนะนำอาจไม่ปลอดภัย'],
    ['other', 'เหตุผลอื่น'],
];

function feedbackHtml(message) {
    const messageId = Number(message?.id || message?.messageId || 0);
    if (!messageId || message?.isTyping) return '';
    const rating = String(message.FeedbackRating || message.feedbackRating || '');
    const reason = String(message.FeedbackReasonCode || message.feedbackReasonCode || 'other');
    const busy = Boolean(message.feedbackBusy);
    return `
        <div class="johnny-global-feedback" data-johnny-phase4-feedback="true" data-message-id="${messageId}">
            <span>คำตอบนี้ช่วยได้ไหม</span>
            <button type="button" class="johnny-global-feedback-button ${rating === 'helpful' ? 'is-selected' : ''}" data-feedback-rating="helpful" data-message-id="${messageId}" aria-pressed="${rating === 'helpful'}" ${busy ? 'disabled' : ''}>ช่วยได้</button>
            <button type="button" class="johnny-global-feedback-button ${rating === 'not_helpful' ? 'is-selected is-negative' : ''}" data-feedback-rating="not_helpful" data-message-id="${messageId}" aria-pressed="${rating === 'not_helpful'}" ${busy ? 'disabled' : ''}>ควรปรับปรุง</button>
            ${rating === 'not_helpful' ? `
                <label class="sr-only" for="johnny-global-feedback-reason-${messageId}">เหตุผลที่ควรปรับปรุง</label>
                <select id="johnny-global-feedback-reason-${messageId}" class="johnny-global-feedback-reason" data-message-id="${messageId}" ${busy ? 'disabled' : ''}>
                    ${FEEDBACK_REASONS.map(([code, label]) => `<option value="${code}" ${reason === code ? 'selected' : ''}>${label}</option>`).join('')}
                </select>` : ''}
            <span class="sr-only" aria-live="polite">${busy ? 'กำลังบันทึกความคิดเห็น' : (rating ? 'บันทึกความคิดเห็นแล้ว' : '')}</span>
        </div>
    `;
}

async function updateFeedback(messageId, rating = '', reasonCode = '') {
    const message = _messages.find(item => Number(item.id || item.messageId || 0) === Number(messageId));
    if (!message || message.feedbackBusy) return;
    const current = String(message.FeedbackRating || message.feedbackRating || '');
    message.feedbackBusy = true;
    renderMessages();
    try {
        if (rating && rating === current && !reasonCode) {
            await API.delete(`/johnny/messages/${encodeURIComponent(messageId)}/feedback`);
            message.FeedbackRating = '';
            message.FeedbackReasonCode = '';
        } else {
            const response = await API.put(`/johnny/messages/${encodeURIComponent(messageId)}/feedback`, { rating, reasonCode });
            message.FeedbackRating = response?.data?.rating || rating;
            message.FeedbackReasonCode = response?.data?.reasonCode || '';
        }
        showToast('บันทึกความคิดเห็นแล้ว', 'success');
    } catch (error) {
        showToast(error?.message || 'บันทึกความคิดเห็นไม่สำเร็จ', 'error');
    } finally {
        message.feedbackBusy = false;
        renderMessages();
    }
}

function avatarHtml(size = 'johnny-global-avatar') {
    const url = String(_status?.johnnyAvatarUrl || _status?.avatarUrl || '');
    if (url) return `<img class="${size}" src="${escHtml(url)}" alt="Johnny AI">`;
    return `<span class="${size} johnny-global-avatar-fallback" aria-hidden="true">J</span>`;
}

function sourceLabel(sourceType) {
    const labels = {
        company_document: 'เอกสารบริษัท',
        safety_knowledge: 'Safety Knowledge',
        system_data: 'ข้อมูลระบบ TSH SCA',
        system_usage: 'คู่มือการใช้งานระบบ',
        external_research: 'ข้อมูลภายนอก',
        image_analysis: 'วิเคราะห์รูปภาพ',
        not_verified: 'ยังไม่ยืนยันข้อมูล',
        ai_general: 'ความรู้ทั่วไปของ AI',
    };
    return labels[sourceType] || labels.ai_general;
}

function qualityHtml(message) {
    const quality = normalizeQuality(message);
    if (!quality) return '';
    const confidence = String(quality.confidence || 'medium').toLowerCase();
    const label = confidence === 'high' ? 'มั่นใจสูง' : confidence === 'low' ? 'ต้องตรวจสอบ' : 'มั่นใจปานกลาง';
    return `<span class="johnny-global-quality is-${escHtml(confidence)}">${escHtml(label)}</span>`;
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''), window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function citationsHtml(message) {
    const citations = normalizeCitations(message).slice(0, 3);
    if (!citations.length) return '';
    const messageId = Number(message?.id || message?.messageId || 0);
    const sourceType = String(message?.SourceType || message?.sourceType || 'ai_general');
    return `
        <div class="johnny-global-citations">
            <div class="johnny-global-citations-title">แหล่งอ้างอิง</div>
            ${citations.map((citation, index) => {
                const title = citation.title || citation.fileName || citation.sourceLabel || `แหล่ง ${index + 1}`;
                const documentId = Number(citation.documentId || 0);
                const type = String(citation.type || '');
                if (type === 'system_usage' && citation.route) {
                    return `<button type="button" class="johnny-global-citation" data-johnny-route="${escHtml(citation.route)}" data-message-id="${messageId}" data-source-type="${escHtml(sourceType)}">${index + 1}. ${escHtml(title)}</button>`;
                }
                if (documentId && type === 'company_document') {
                    return `<button type="button" class="johnny-global-citation" data-johnny-document-id="${documentId}" data-johnny-document-title="${escHtml(title)}">${index + 1}. ${escHtml(title)}</button>`;
                }
                const href = safeExternalUrl(citation.url || citation.uri || '');
                if (href) return `<a class="johnny-global-citation" href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">${index + 1}. ${escHtml(title)}</a>`;
                return `<span class="johnny-global-citation is-static">${index + 1}. ${escHtml(title)}</span>`;
            }).join('')}
        </div>
    `;
}

async function openWorkflowRoute(rawRoute, messageId) {
    const route = String(rawRoute || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
    const registry = Array.isArray(_status?.workflow?.navigationTargets) ? _status.workflow.navigationTargets : [];
    const target = registry.find(item => item.key === route || item.route === route);
    if (!target || !Number(messageId)) return;
    let canonicalRoute = target.route;
    try {
        const response = await API.post('/johnny/workflow-actions', {
            target: target.key,
            action: 'navigate',
            messageId: Number(messageId),
        });
        canonicalRoute = response?.data?.route || canonicalRoute;
    } catch (_) {}
    canonicalRoute = String(canonicalRoute || '').replace(/[^a-z0-9-]/gi, '');
    if (!canonicalRoute) return;
    closeJohnnyDrawer({ restoreFocus: false });
    window.location.hash = canonicalRoute;
}

function messageHtml(message) {
    const role = String(message?.Role || message?.role || 'assistant').toLowerCase();
    if (message?.isTyping) {
        return `
            <div class="johnny-global-message is-assistant is-typing">
                ${avatarHtml('johnny-global-message-avatar')}
                <div class="johnny-global-bubble">
                    <span></span><span></span><span></span>
                    <span class="sr-only">Johnny AI กำลังตอบ</span>
                </div>
            </div>
        `;
    }
    if (role === 'user') {
        return `<div class="johnny-global-message is-user"><div class="johnny-global-bubble">${renderText(messageText(message))}</div></div>`;
    }
    const sourceType = String(message?.SourceType || message?.sourceType || 'ai_general');
    return `
        <div class="johnny-global-message is-assistant">
            ${avatarHtml('johnny-global-message-avatar')}
            <div class="johnny-global-message-body">
                <div class="johnny-global-bubble">${renderText(messageText(message))}</div>
                ${citationsHtml(message)}
                <div class="johnny-global-message-meta">
                    <span class="johnny-global-source is-${escHtml(sourceType)}">${escHtml(sourceLabel(sourceType))}</span>
                    ${qualityHtml(message)}
                </div>
                ${feedbackHtml(message)}
            </div>
        </div>
    `;
}

function emptyHtml() {
    const pageTitle = document.getElementById('page-title')?.textContent?.trim() || 'ระบบ TSH Safety Core';
    return `
        <div class="johnny-global-empty">
            ${avatarHtml('johnny-global-empty-avatar')}
            <h3>สวัสดีครับ${_userName ? ` คุณ${escHtml(_userName)}` : ''}</h3>
            <p>ถาม Johnny เรื่องความปลอดภัยหรือวิธีใช้งาน <strong>${escHtml(pageTitle)}</strong> ได้เลยครับ</p>
            <div class="johnny-global-quick-list">
                ${QUICK_PROMPTS.map(prompt => `<button type="button" class="johnny-global-quick" data-johnny-prompt="${escHtml(prompt)}">${escHtml(prompt)}</button>`).join('')}
            </div>
        </div>
    `;
}

function renderMessages() {
    const container = document.getElementById('johnny-global-messages');
    if (!container) return;
    container.innerHTML = _messages.length ? _messages.map(messageHtml).join('') : emptyHtml();
    container.querySelectorAll('[data-johnny-prompt]').forEach(button => {
        button.addEventListener('click', () => submitMessage(button.dataset.johnnyPrompt || ''));
    });
    container.querySelectorAll('[data-johnny-document-id]').forEach(button => {
        button.addEventListener('click', () => openAuthenticatedDocument(button.dataset.johnnyDocumentId, button.dataset.johnnyDocumentTitle));
    });
    container.querySelectorAll('[data-johnny-route]').forEach(button => {
        button.addEventListener('click', () => openWorkflowRoute(button.dataset.johnnyRoute, button.dataset.messageId));
    });
    container.querySelectorAll('.johnny-global-feedback-button').forEach(button => {
        button.addEventListener('click', () => updateFeedback(button.dataset.messageId, button.dataset.feedbackRating));
    });
    container.querySelectorAll('.johnny-global-feedback-reason').forEach(select => {
        select.addEventListener('change', () => updateFeedback(select.dataset.messageId, 'not_helpful', select.value));
    });
    container.scrollTop = container.scrollHeight;
}

function renderHeader() {
    const avatar = document.getElementById('johnny-global-header-avatar');
    if (avatar) avatar.innerHTML = avatarHtml();
    const privacy = document.getElementById('johnny-global-privacy');
    if (privacy) {
        const days = Number(_status?.privacy?.chatRetentionDays || 180);
        privacy.textContent = `ประวัติ ${days} วัน`;
    }
}

function renderHistory() {
    const panel = document.getElementById('johnny-global-history');
    const toggle = document.getElementById('johnny-global-history-toggle');
    if (!panel || !toggle) return;
    panel.hidden = !_historyOpen;
    toggle.setAttribute('aria-expanded', _historyOpen ? 'true' : 'false');
    if (!_historyOpen) return;
    panel.innerHTML = _conversations.length
        ? _conversations.map(item => {
            const active = Number(item.id) === Number(_conversationId);
            return `
                <div class="johnny-global-history-row ${active ? 'is-active' : ''}">
                    <button type="button" class="johnny-global-history-open" data-conversation-id="${Number(item.id)}">
                        <strong>${escHtml(item.Title || 'Johnny AI Chat')}</strong>
                        <span>${escHtml(String(item.UpdatedAt || item.CreatedAt || '').slice(0, 16).replace('T', ' '))}</span>
                    </button>
                    <button type="button" class="johnny-global-history-delete" data-delete-conversation-id="${Number(item.id)}" aria-label="ลบบทสนทนา ${escHtml(item.Title || '')}">×</button>
                </div>
            `;
        }).join('')
        : '<div class="johnny-global-history-empty">ยังไม่มีประวัติสนทนา</div>';
    panel.querySelectorAll('[data-conversation-id]').forEach(button => {
        button.addEventListener('click', () => loadConversation(button.dataset.conversationId));
    });
    panel.querySelectorAll('[data-delete-conversation-id]').forEach(button => {
        button.addEventListener('click', () => deleteConversation(button.dataset.deleteConversationId));
    });
}

function setBusy(value) {
    _busy = Boolean(value);
    const send = document.getElementById('johnny-global-send');
    const input = document.getElementById('johnny-global-input');
    if (send) {
        send.disabled = _busy;
        send.textContent = _busy ? 'กำลังตอบ…' : 'ส่ง';
    }
    if (input) input.disabled = _busy;
}

async function loadConversations() {
    try {
        const response = await API.get('/johnny/conversations');
        _conversations = Array.isArray(response?.data) ? response.data : [];
    } catch {
        _conversations = [];
    }
    renderHistory();
}

async function loadConversation(id) {
    const conversationId = Number(id || 0);
    if (!conversationId || _busy) return;
    try {
        const response = await API.get(`/johnny/conversations/${encodeURIComponent(conversationId)}`);
        _conversationId = Number(response?.data?.conversation?.id || 0) || null;
        _messages = Array.isArray(response?.data?.messages) ? response.data.messages : [];
        rememberConversation(_conversationId);
        _historyOpen = false;
        renderHistory();
        renderMessages();
        document.getElementById('johnny-global-input')?.focus();
    } catch (error) {
        showToast(error?.message || 'โหลดประวัติ Johnny AI ไม่สำเร็จ', 'error');
    }
}

function startNewChat() {
    if (_busy) return;
    _conversationId = null;
    _messages = [];
    _historyOpen = false;
    rememberConversation(null);
    renderHistory();
    renderMessages();
    document.getElementById('johnny-global-input')?.focus();
}

async function deleteConversation(id) {
    const conversationId = Number(id || 0);
    if (!conversationId || _busy) return;
    const item = _conversations.find(row => Number(row.id) === conversationId);
    if (!window.confirm(`ลบบทสนทนา “${item?.Title || 'Johnny AI Chat'}”?`)) return;
    try {
        await API.delete(`/johnny/conversations/${encodeURIComponent(conversationId)}`);
        if (Number(_conversationId) === conversationId) startNewChat();
        await loadConversations();
        showToast('ลบบทสนทนาแล้ว', 'success');
    } catch (error) {
        showToast(error?.message || 'ลบบทสนทนาไม่สำเร็จ', 'error');
    }
}

async function openAuthenticatedDocument(documentId, title) {
    const id = Number(documentId || 0);
    if (!id) return;
    const preview = window.open('about:blank', '_blank');
    if (preview) preview.opener = null;
    try {
        const response = await API.get(`/johnny/kb-documents/${encodeURIComponent(id)}/file`);
        if (!(response instanceof Response) || !response.ok) throw new Error('ไม่สามารถเปิดเอกสารนี้ได้');
        const blobUrl = URL.createObjectURL(await response.blob());
        if (preview) preview.location.replace(blobUrl);
        else {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = String(title || `johnny-kb-${id}`);
            link.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
        preview?.close();
        showToast(error?.message || 'ไม่สามารถเปิดเอกสาร Knowledge Base ได้', 'error');
    }
}

async function submitMessage(rawText) {
    const text = String(rawText || '').trim();
    if (!text || _busy) return;
    const input = document.getElementById('johnny-global-input');
    if (input) input.value = '';
    _messages.push({ Role: 'user', MessageText: text });
    _messages.push({ Role: 'assistant', isTyping: true });
    setBusy(true);
    renderMessages();
    try {
        const response = await API.post('/johnny/chat', {
            message: text,
            conversationId: _conversationId,
            pageContext: {
                page: _activePage,
                title: document.getElementById('page-title')?.textContent?.trim() || '',
            },
        });
        const data = response?.data || {};
        _conversationId = Number(data.conversationId || _conversationId || 0) || null;
        rememberConversation(_conversationId);
        _messages = _messages.filter(message => !message.isTyping);
        _messages.push({
            id: data.messageId || null,
            Role: 'assistant',
            MessageText: data.answer || '',
            SourceType: data.sourceType || 'ai_general',
            CitationsJson: data.citations || [],
            Sources: data.sources || [],
            AnswerQuality: data.answerQuality || null,
        });
        renderMessages();
        await loadConversations();
    } catch (error) {
        _messages = _messages.filter(message => !message.isTyping);
        _messages.push({
            Role: 'assistant',
            MessageText: error?.message || 'Johnny AI ยังตอบไม่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
            SourceType: 'not_verified',
        });
        renderMessages();
        showToast(error?.message || 'Johnny AI ยังตอบไม่ได้ในขณะนี้', 'error');
    } finally {
        setBusy(false);
        input?.focus();
    }
}

async function ensureLoaded() {
    if (_loaded) return;
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
        const [statusResult] = await Promise.allSettled([
            API.get('/johnny/status'),
            loadConversations(),
        ]);
        if (statusResult.status === 'fulfilled') _status = statusResult.value?.data || null;
        renderHeader();
        const recalled = Number(recalledConversation() || 0);
        if (recalled && _conversations.some(item => Number(item.id) === recalled)) await loadConversation(recalled);
        else renderMessages();
        _loaded = true;
    })().finally(() => {
        _loadPromise = null;
    });
    return _loadPromise;
}

function focusableElements() {
    const panel = document.getElementById('johnny-global-panel');
    if (!panel) return [];
    return [...panel.querySelectorAll('button:not([disabled]), a[href], textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.offsetParent !== null);
}

function handleDrawerKeydown(event) {
    if (!_open) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeJohnnyDrawer();
        return;
    }
    if (event.key !== 'Tab') return;
    const focusables = focusableElements();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

export async function openJohnnyDrawer() {
    if (!_initialized || _activePage === 'johnny-ai') return;
    _lastFocused = document.activeElement;
    _open = true;
    rootEl()?.classList.add('is-open');
    document.body.classList.add('johnny-global-open');
    document.getElementById('johnny-global-launcher')?.setAttribute('aria-expanded', 'true');
    document.getElementById('johnny-global-panel')?.setAttribute('aria-hidden', 'false');
    await ensureLoaded();
    window.setTimeout(() => document.getElementById('johnny-global-input')?.focus(), 30);
}

export function closeJohnnyDrawer({ restoreFocus = true } = {}) {
    if (!_initialized) return;
    _open = false;
    _historyOpen = false;
    rootEl()?.classList.remove('is-open');
    document.body.classList.remove('johnny-global-open');
    document.getElementById('johnny-global-launcher')?.setAttribute('aria-expanded', 'false');
    document.getElementById('johnny-global-panel')?.setAttribute('aria-hidden', 'true');
    renderHistory();
    if (restoreFocus) (_lastFocused?.isConnected ? _lastFocused : document.getElementById('johnny-global-launcher'))?.focus?.();
}

export function destroyJohnnyDrawer() {
    if (_initialized) closeJohnnyDrawer({ restoreFocus: false });
    rootEl()?.remove();
    _initialized = false;
    _open = false;
    _busy = false;
    _loaded = false;
    _loadPromise = null;
    _historyOpen = false;
    _conversationId = null;
    _conversations = [];
    _messages = [];
    _status = null;
    _userId = '';
    _userName = '';
    _activePage = '';
    _lastFocused = null;
    document.body.classList.remove('johnny-global-open');
}

export function syncJohnnyDrawerRoute(page) {
    _activePage = String(page || '');
    const root = rootEl();
    if (!root) return;
    const hidden = _activePage === 'johnny-ai';
    root.classList.toggle('is-page-hidden', hidden);
    if (hidden && _open) closeJohnnyDrawer({ restoreFocus: false });
}

function bindEvents() {
    document.getElementById('johnny-global-launcher')?.addEventListener('click', openJohnnyDrawer);
    document.getElementById('johnny-global-close')?.addEventListener('click', () => closeJohnnyDrawer());
    document.getElementById('johnny-global-backdrop')?.addEventListener('click', () => closeJohnnyDrawer());
    document.getElementById('johnny-global-new')?.addEventListener('click', startNewChat);
    document.getElementById('johnny-global-history-toggle')?.addEventListener('click', () => {
        _historyOpen = !_historyOpen;
        renderHistory();
    });
    document.getElementById('johnny-global-workspace')?.addEventListener('click', () => {
        closeJohnnyDrawer({ restoreFocus: false });
        window.location.hash = 'johnny-ai';
    });
    document.getElementById('johnny-global-form')?.addEventListener('submit', event => {
        event.preventDefault();
        submitMessage(document.getElementById('johnny-global-input')?.value || '');
    });
    document.getElementById('johnny-global-input')?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
        }
    });
    if (!_globalEventsBound) {
        document.addEventListener('keydown', handleDrawerKeydown);
        _globalEventsBound = true;
    }
}

function drawerHtml() {
    return `
        <div id="johnny-global-root" data-johnny-phase2="${PHASE2_MARKER}" class="johnny-global-root">
            <button id="johnny-global-launcher" type="button" class="johnny-global-launcher" aria-label="เปิดแชท Johnny AI" aria-controls="johnny-global-panel" aria-expanded="false">
                <span class="johnny-global-launcher-icon" aria-hidden="true">J</span>
                <span class="johnny-global-launcher-label">ถาม Johnny</span>
            </button>
            <button id="johnny-global-backdrop" type="button" class="johnny-global-backdrop" aria-label="ปิดแชท Johnny AI" tabindex="-1"></button>
            <aside id="johnny-global-panel" class="johnny-global-panel" role="dialog" aria-modal="true" aria-labelledby="johnny-global-title" aria-hidden="true">
                <header class="johnny-global-header">
                    <div id="johnny-global-header-avatar">${avatarHtml()}</div>
                    <div class="johnny-global-header-copy">
                        <h2 id="johnny-global-title">Johnny AI</h2>
                        <p><span class="johnny-global-online-dot"></span>ผู้ช่วย SHE พร้อมใช้งาน</p>
                    </div>
                    <button id="johnny-global-new" type="button" class="johnny-global-icon-button" title="เริ่มแชทใหม่" aria-label="เริ่มแชทใหม่">＋</button>
                    <button id="johnny-global-close" type="button" class="johnny-global-icon-button" title="ปิด" aria-label="ปิดแชท Johnny AI">×</button>
                </header>
                <div class="johnny-global-toolbar">
                    <button id="johnny-global-history-toggle" type="button" aria-expanded="false" aria-controls="johnny-global-history">ประวัติสนทนา</button>
                    <span id="johnny-global-privacy">ประวัติ 180 วัน</span>
                    <button id="johnny-global-workspace" type="button">เปิดหน้าหลัก ↗</button>
                </div>
                <div id="johnny-global-history" class="johnny-global-history" hidden></div>
                <div id="johnny-global-messages" class="johnny-global-messages" role="log" aria-live="polite" aria-relevant="additions text">${emptyHtml()}</div>
                <form id="johnny-global-form" class="johnny-global-form">
                    <label for="johnny-global-input" class="sr-only">พิมพ์คำถามถึง Johnny AI</label>
                    <textarea id="johnny-global-input" rows="1" maxlength="4000" placeholder="ถาม Johnny เรื่องความปลอดภัยหรือการใช้งานระบบ"></textarea>
                    <button id="johnny-global-send" type="submit">ส่ง</button>
                    <p>Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่ · โปรดตรวจสอบข้อมูลสำคัญกับแหล่งต้นทาง</p>
                </form>
            </aside>
        </div>
    `;
}

export function initJohnnyDrawer({ userId = '', userName = '' } = {}) {
    const normalizedUserId = String(userId || '');
    if (_initialized && normalizedUserId === _userId) {
        _userName = String(userName || '');
        return;
    }
    if (_initialized) rootEl()?.remove();
    document.body.classList.remove('johnny-global-open');
    _userId = normalizedUserId;
    _userName = String(userName || '');
    _conversationId = null;
    _conversations = [];
    _messages = [];
    _status = null;
    _loaded = false;
    _loadPromise = null;
    _open = false;
    _busy = false;
    _historyOpen = false;
    _initialized = true;
    document.body.insertAdjacentHTML('beforeend', drawerHtml());
    bindEvents();
    syncJohnnyDrawerRoute(document.body.dataset.activePage || '');
}
