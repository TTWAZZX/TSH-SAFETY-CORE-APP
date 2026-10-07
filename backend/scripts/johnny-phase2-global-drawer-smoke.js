'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const drawer = read('public/js/johnny-drawer.js');
const main = read('public/js/main.js');
const style = read('public/style.css');
const index = read('index.html');
const pkg = read('backend/package.json');
const nodeRoute = read('backend/routes/johnny-ai.js');
const phpRoute = read('api/handlers/johnny_ai.php');
const cacheBust = '20261007-johnny-launcher-avatar-r1';

const checks = [];
function check(name, ok) {
    checks.push({ name, ok: Boolean(ok) });
    if (!ok) process.exitCode = 1;
}

check('Phase 2 marker', drawer.includes('JOHNNY_PHASE2_GLOBAL_SIDE_DRAWER'));
check('global launcher and dialog', drawer.includes('johnny-global-launcher') && drawer.includes('role="dialog"') && drawer.includes('aria-modal="true"'));
check('launcher uses configured Johnny avatar', drawer.includes('johnny-global-launcher-avatar') && drawer.includes("loadStatus().catch") && drawer.includes("johnnyAvatarUrl"));
check('launcher avatar has safe fallback', drawer.includes("querySelector('img')?.addEventListener('error'") && drawer.includes('avatarFallbackHtml'));
check('open and close controls', drawer.includes('openJohnnyDrawer') && drawer.includes('closeJohnnyDrawer'));
check('route-aware hiding on full workspace', drawer.includes("_activePage === 'johnny-ai'") && drawer.includes('is-page-hidden'));
check('lazy API loading', drawer.includes('async function ensureLoaded()') && drawer.includes("API.get('/johnny/status')"));
check('text chat contract', drawer.includes("API.post('/johnny/chat'") && drawer.includes('conversationId: _conversationId'));
check('current page context sent with chat', drawer.includes('pageContext: {') && drawer.includes('page: _activePage') && drawer.includes("getElementById('page-title')"));
check('page context is untrusted in Node and PHP', nodeRoute.includes('function johnnyPageContext') && phpRoute.includes('function johnny_page_context') && nodeRoute.includes('untrusted navigation metadata only') && phpRoute.includes('untrusted navigation metadata only'));
check('Node/PHP page-context parity', nodeRoute.includes('scopedDocument, pageContext') && phpRoute.includes("'pageContext' => $pageContext"));
check('conversation history contract', drawer.includes("API.get('/johnny/conversations')") && drawer.includes('/johnny/conversations/${encodeURIComponent(conversationId)}'));
check('user-scoped conversation memory', drawer.includes('tsh_johnny_drawer_conversation_${_userId'));
check('new and delete conversation UX', drawer.includes('startNewChat') && drawer.includes('deleteConversation'));
check('authenticated KB citation access', drawer.includes('/johnny/kb-documents/${encodeURIComponent(id)}/file') && drawer.includes('response.blob()'));
check('answer safety metadata', drawer.includes('AnswerQuality: data.answerQuality') && drawer.includes('normalizeQuality') && drawer.includes('sourceLabel'));
check('quick prompts', drawer.includes('QUICK_PROMPTS') && drawer.includes('data-johnny-prompt'));
check('Enter and Shift+Enter behavior', drawer.includes("event.key === 'Enter'") && drawer.includes('!event.shiftKey') && drawer.includes('event.isComposing'));
check('Escape and Tab focus trap', drawer.includes("event.key === 'Escape'") && drawer.includes("event.key !== 'Tab'") && drawer.includes('focusableElements'));
check('focus restoration', drawer.includes('_lastFocused') && drawer.includes('restoreFocus'));
check('live message region', drawer.includes('role="log"') && drawer.includes('aria-live="polite"'));
check('lazy load retry guard', drawer.includes('let _loadPromise = null') && drawer.includes(".finally(() =>"));
check('global keyboard listener bound once', drawer.includes('let _globalEventsBound = false') && drawer.includes('if (!_globalEventsBound)'));
check('main initializes after authenticated gate', main.includes('initJohnnyDrawer({') && main.indexOf('initJohnnyDrawer({') > main.indexOf('if (gate.required)'));
check('main synchronizes route', main.includes('syncJohnnyDrawerRoute(hash)'));
check('logout destroys private drawer state', main.includes('destroyJohnnyDrawer()') && drawer.includes('export function destroyJohnnyDrawer()') && drawer.includes("_userId = ''"));
check('desktop drawer CSS', style.includes('.johnny-global-panel') && style.includes('width: min(94vw, 27rem)') && style.includes('transform: translateX(105%)'));
check('mobile full-screen drawer CSS', style.includes('height: var(--app-visual-viewport-height, 100dvh)') && style.includes('body.johnny-global-open #bottom-tab-bar'));
check('mobile safe-area launcher', style.includes('bottom: calc(var(--mobile-bottom-nav-height) + 0.75rem)') && style.includes('env(safe-area-inset-right, 0px)'));
check('touch-size controls', style.includes('min-height: 3.25rem') && style.includes('min-height: 2.75rem'));
check('reduced-motion support', style.includes('@media (prefers-reduced-motion: reduce)'));
check('Phase 2 cache chain in index', index.includes(`public/style.css?v=${cacheBust}`) && index.includes(`public/js/main.js?v=${cacheBust}`));
check('Phase 2 cache chain in main', main.includes(`johnny-drawer.js?v=${cacheBust}`) && main.includes(`pages/johnny-ai.js?v=${cacheBust}`));
check('package script registered', pkg.includes('smoke:johnny-phase2-global-drawer'));
check('no obsolete visible phase copy', !drawer.includes('Phase 2 mobile ready'));

const passed = checks.filter(item => item.ok).length;
console.log(JSON.stringify({
    marker: 'JOHNNY_PHASE2_GLOBAL_SIDE_DRAWER',
    cacheBust,
    passed,
    total: checks.length,
    checks,
}, null, 2));
