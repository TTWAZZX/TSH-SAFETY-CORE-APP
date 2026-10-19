'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('index.html');
const css = read('public/style.css');
const main = read('public/js/main.js');
const guides = read('public/js/login-guides.js');
const admin = read('public/js/pages/admin.js');
const moduleMeta = read('public/js/module-meta.js');
const node = read('backend/server.js');
const phpIndex = read('api/index.php');
const phpStorage = read('api/handlers/storage.php');
const browserUat = read('backend/scripts/dashboard-d4-browser-uat.js');
const checks = [];

function check(name, condition) {
    checks.push({ name, pass: Boolean(condition) });
    assert.ok(condition, name);
}

const desktopPanel = guides.slice(guides.indexOf('function desktopPanelHtml()'), guides.indexOf('function mobileHelpHtml()'));
const guideCatalog = guides.slice(guides.indexOf('export const LOGIN_MODULE_GUIDES'), guides.indexOf('export function helpCenterCoverage'));
const moduleOrder = moduleMeta.slice(moduleMeta.indexOf('export const MODULE_ORDER'), moduleMeta.indexOf('export const MODULE_META'));
const guideKeys = [...guideCatalog.matchAll(/\n\s*key: '([^']+)'/g)].map(match => match[1]);
const moduleKeys = [...moduleOrder.matchAll(/'([^']+)'/g)].map(match => match[1]);

check('desktop login brand panel has a stable customization target', html.includes('id="login-brand-panel"'));
check('legacy module grid is hidden until the guide entry is rendered', html.includes('id="login-guide-desktop-host" class="hidden"'));
check('desktop guide entry exposes one consolidated guide action', desktopPanel.includes('ดูคู่มือทั้งหมด') && desktopPanel.includes('login-guide-entry'));
check('desktop guide entry uses a concise module-wide description', desktopPanel.includes('รวมวิธีใช้ทุกโมดูล') && !desktopPanel.includes('รวมวิธีใช้ทุกโมดูลและ Safety Vote'));
check('desktop guide entry no longer renders module cards', !desktopPanel.includes('LOGIN_MODULE_GUIDES.map(compactCardHtml)') && !desktopPanel.includes('login-guide-list'));
check('desktop guide entry is compact and moved into the footer above copyright', css.includes('#login-guide-desktop-host') && css.includes('margin-bottom: .8rem') && guides.includes("footer.insertBefore(desktopHost, footerDivider || footer.firstChild)") && !html.includes('data-module-count'));
check('guide center remains the destination for the consolidated action', guides.includes("if (event.target.closest('[data-guide-all]'))") && guides.includes('openGuideCenter();'));
check('guide catalog covers every current module exactly once', guideKeys.length === moduleKeys.length && new Set(guideKeys).size === guideKeys.length && moduleKeys.every(key => guideKeys.includes(key)));
check('Safety Vote guide covers User Admin Juror privacy and governance', guides.includes("key: 'safety-vote'") && guides.includes("updatedAt: '2026-10-11'") && guides.includes('privacy threshold') && moduleMeta.includes("'Juror'"));
check('custom login background is applied behind a readability gradient', main.includes('loginBackgroundUrl') && main.includes("loginBrandPanel.style.backgroundImage") && main.includes('baseGradient'));
check('missing custom background preserves the branded gradient fallback', main.includes("linear-gradient(160deg, #022c22 0%, #064e3b 40%, #065f46 75%, #0d9488 100%)"));
check('login background uses cover and centered positioning', css.includes('#login-brand-panel') && css.includes('background-size: cover') && css.includes('background-position: center'));
check('consolidated guide CTA retains a 44px target', css.includes('.login-guide-entry .login-guide-all-btn') && css.includes('min-height: 44px'));
check('Branding state preserves the background URL', admin.includes("loginBackgroundUrl: String(raw.loginBackgroundUrl || '').trim().slice(0, 1024)"));
check('Branding UI documents file limits and portrait dimensions', admin.includes('ไม่เกิน 5 MB') && admin.includes('1200 × 1600 px'));
check('Branding UI offers explicit crop and full-image display modes', admin.includes('name="branding-background-fit"') && admin.includes('เต็มพื้นที่ (Cover)') && admin.includes('เห็นภาพครบ (Contain)'));
check('Branding UI provides one real-layout Login preview and fallback controls', admin.includes('branding-background-input') && admin.includes('branding-background-reset') && admin.includes('branding-login-page-preview') && admin.includes('Preview หน้า Login') && admin.includes('_brandingLoginPreviewDocument') && admin.includes("document.getElementById('login-overlay')") && !admin.includes('branding-background-preview') && !admin.includes('branding-preview-hero'));
check('real-layout preview supports exact Desktop Tablet and Mobile viewports', admin.includes("desktop: { label: 'Desktop', width: 1440, height: 900 }") && admin.includes("tablet: { label: 'Tablet', width: 768, height: 1024 }") && admin.includes("mobile: { label: 'Mobile', width: 390, height: 844 }") && admin.includes('data-branding-preview-device'));
check('real-layout preview is isolated read-only and fails visibly', admin.includes('iframe.srcdoc = previewDocument') && admin.includes('sandbox="allow-same-origin allow-scripts"') && admin.includes("input.setAttribute('readonly', '')") && admin.includes("control.setAttribute('aria-disabled', 'true')") && admin.includes('ไม่สามารถสร้าง Preview จากหน้า Login จริงได้'));
check('combined Login preview opens as an accessible full-screen dialog', admin.includes('branding-login-full-preview-btn') && admin.includes('_openBrandingLoginFullPreview') && admin.includes("overlay.setAttribute('role', 'dialog')") && admin.includes("overlay.setAttribute('aria-modal', 'true')") && admin.includes("event.key === 'Escape'") && admin.includes('data-branding-preview-close'));
check('authenticated Browser UAT covers Branding real layout devices and full-screen focus restore', browserUat.includes('APP_VISUAL_AUDIT_ADMIN_TAB') && browserUat.includes('auditBrandingRealLayoutPreview') && browserUat.includes("{ key: 'desktop', width: 1440, height: 900 }") && browserUat.includes("{ key: 'tablet', width: 768, height: 1024 }") && browserUat.includes("{ key: 'mobile', width: 390, height: 844 }") && browserUat.includes('focusReturned'));
check('Branding stores bounded background focal coordinates with legacy center defaults', admin.includes('loginBackgroundFocusX: 50') && admin.includes('loginBackgroundFocusY: 50') && admin.includes('normalizeFocus(raw.loginBackgroundFocusX)') && main.includes('normalizeFocus(raw.loginBackgroundFocusY)'));
check('Login runtime applies the saved background focal point to the image layer', main.includes('${_currentBranding.loginBackgroundFocusX}% ${_currentBranding.loginBackgroundFocusY}%') && main.includes('loginBrandPanel.style.backgroundPosition = shouldLoadBackground'));
check('Node and PHP preserve the allowlisted background fit mode', node.includes("loginBackgroundFit: String(branding.loginBackgroundFit) === 'contain' ? 'contain' : 'cover'") && phpIndex.includes("'loginBackgroundFit' => ($branding['loginBackgroundFit'] ?? '') === 'contain' ? 'contain' : 'cover'"));
check('runtime and Preview use the same cover or contain image sizing', main.includes('`cover, ${backgroundFit}`') && admin.includes('`cover, ${backgroundFit}`') && admin.includes("loginBackgroundFit === 'contain'"));
check('Admin focus editor supports click keyboard sliders presets and a Preview-only Safe Area', admin.includes('branding-focus-picker') && admin.includes("event.key === 'ArrowLeft'") && admin.includes('branding-focus-x') && admin.includes('data-branding-focus-preset') && admin.includes('data-branding-safe-area-guide') && admin.includes('เส้น Safe Area เป็นเพียงไกด์ใน Preview'));
check('Admin focus editor mirrors the portrait left Login panel instead of a landscape canvas', admin.includes('aspect-[3/4]') && admin.includes('จำลองสัดส่วนภาพฝั่งซ้ายแนวตั้ง 3:4'));
check('Node and PHP public Branding contracts expose clamped focus coordinates', node.includes('loginBackgroundFocusX: Number.isFinite(focusX)') && node.includes('loginBackgroundFocusY: Number.isFinite(focusY)') && phpIndex.includes("'loginBackgroundFocusX' => max(0, min(100") && phpIndex.includes("'loginBackgroundFocusY' => max(0, min(100"));
check('authenticated Browser UAT verifies public focus contract focal position and Safe Area visibility without saving', browserUat.includes('public Branding focus X is bounded') && browserUat.includes("markerLeft: '75%'") && browserUat.includes('Safe Area guide can be hidden') && browserUat.includes('safeAreaToggle: true'));
check('Admin upload uses a dedicated background endpoint and field', admin.includes("API.post('/upload/branding-background', fd)") && admin.includes("fd.append('background', file)"));
check('Node public Branding response exposes bounded background URL', node.includes("loginBackgroundUrl: String(branding.loginBackgroundUrl || '').slice(0, 1024)"));
check('Node background upload is Admin-only and bounded to 5 MB', node.includes("app.post('/api/upload/branding-background', authenticateToken, isAdmin") && node.includes('brandingBackgroundUpload.single(\'background\')') && node.includes('limits: { fileSize: 5 * 1024 * 1024 }'));
check('Node background upload is audited', node.includes("action: 'UPLOAD_BRANDING_BACKGROUND'"));
check('PHP public Branding response exposes bounded background URL', phpIndex.includes("'loginBackgroundUrl' => mb_substr((string) ($branding['loginBackgroundUrl'] ?? ''), 0, 1024)"));
check('PHP background upload is Admin-only with matching size and types', phpStorage.includes("$path === '/upload/branding-background'") && phpStorage.includes("store_uploaded_file('background'") && phpStorage.includes('5 * 1024 * 1024'));
check('cache chain includes the current Login Branding and application revisions', html.includes('main.js?v=20261019-safety-vote-open-feedback-r1') && main.includes('login-guides.js?v=20261011-login-branding-background-r2'));

console.log(JSON.stringify({
    marker: 'LOGIN_BRANDING_BACKGROUND',
    mode: 'static-no-db-no-network',
    passed: checks.filter(item => item.pass).length,
    total: checks.length,
    checks,
}, null, 2));
