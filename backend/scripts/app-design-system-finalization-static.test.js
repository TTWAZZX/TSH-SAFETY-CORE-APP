'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
const dashboardBrowserUat = fs.readFileSync(path.join(__dirname, 'dashboard-d4-browser-uat.js'), 'utf8');
const policyPage = fs.readFileSync(path.join(root, 'public/js/pages/policy.js'), 'utf8');
const safetyCulturePage = fs.readFileSync(path.join(root, 'public/js/pages/safety-culture.js'), 'utf8');
const kpiPage = fs.readFileSync(path.join(root, 'public/js/pages/kpi.js'), 'utf8');
const patrolPage = fs.readFileSync(path.join(root, 'public/js/pages/patrol.js'), 'utf8');
const machineSafetyPage = fs.readFileSync(path.join(root, 'public/js/pages/machine-safety.js'), 'utf8');
const forkliftPage = fs.readFileSync(path.join(root, 'public/js/pages/forklift.js'), 'utf8');
const fourmPage = fs.readFileSync(path.join(root, 'public/js/pages/fourm.js'), 'utf8');
const checks = [];

function check(name, condition) {
    checks.push({ name, pass: Boolean(condition) });
    assert.ok(condition, name);
}

check('stylesheet cache key carries design-system surface revision', index.includes('surface-r7-fullwidth-r1-compact-r1-a11y-r1'));
check('main and changed page modules share the design-system cache revision', index.includes('public/js/main.js?v=20261011-login-communications-r9-portrait-preview-johnny-admin-workspace-r1') && [
    'policy.js',
    'patrol.js',
    'kpi.js',
    'machine-safety.js',
    'forklift.js',
    'safety-culture.js',
].every(file => main.includes(`./pages/${file}?v=20261011-design-system-a11y-r1`)));
check('control radius token is defined', css.includes('--app-radius-control: .75rem'));
check('primary text token is defined', css.includes('--app-text: #1e293b'));
check('muted text token is defined', css.includes('--app-text-muted: #64748b'));
check('focus color and ring tokens are defined', css.includes('--app-focus: #059669') && css.includes('--app-focus-ring: rgb(5 150 105 / .20)'));
check('motion timing token is defined', css.includes('--app-motion-fast: 160ms ease'));
check('form primitives share border and control radius tokens', css.includes('.form-input, .form-select, .form-textarea, .form-multiselect') && css.includes('border-radius: var(--app-radius-control)'));
check('form hover remains distinct from focus', css.includes(':hover:not(:disabled)') && css.includes('border-color: var(--app-border-accent)'));
check('form focus uses accessible shared ring', css.includes('box-shadow: 0 0 0 3px var(--app-focus-ring)'));
check('disabled controls remain legible without opacity fading', css.includes('background: var(--app-surface-muted)') && css.includes('opacity: 1'));
check('buttons use the shared control radius', css.includes('#main-content .btn') && css.includes('min-height: 40px'));
check('interactive elements receive keyboard focus visibility', css.includes('summary, [tabindex]):focus-visible') && css.includes('outline: 3px solid var(--app-focus-ring)'));
check('disabled buttons suppress motion effects', css.includes('[aria-disabled="true"]') && css.includes('transform: none !important'));
check('metric labels avoid forced uppercase', css.includes('#main-content .ds-metric-label') && css.includes('text-transform: none'));
check('empty states use shared soft hierarchy', css.includes('.ds-empty-state, .sv-empty-state') && css.includes('linear-gradient(145deg, var(--app-surface-muted)'));
check('loading skeletons use shared neutral-green surfaces', css.includes('.sv-skeleton, .svp-skeleton') && css.includes('var(--app-surface-inset) 25%'));
check('modal surface receives shared border and elevated shadow', css.includes('#modal-container') && css.includes('0 24px 64px rgb(15 68 51 / .18)'));
check('desktop modal radius is responsive', css.includes('@media (min-width: 768px)') && css.includes('border-radius: 1.125rem !important'));
check('mobile interactive controls preserve 44px targets', /@media \(max-width: 767px\)[\s\S]*?#main-content :is\(button,[\s\S]*?min-width: 44px !important;[\s\S]*?min-height: 44px !important;/u.test(css));
check('carousel indicators separate a 44px hit area from the visual dot', css.includes('#main-content .carousel-dot::after') && patrolPage.includes("--carousel-dot-width") && patrolPage.includes('aria-current'));
check('reduced-motion preference is honored', css.includes('@media (prefers-reduced-motion: reduce)') && css.includes('transition-duration: .01ms !important'));
check('authenticated browser UAT covers all five responsive viewports', [
    '{ width: 390, height: 844 }',
    '{ width: 430, height: 932 }',
    '{ width: 768, height: 1024 }',
    '{ width: 1366, height: 768 }',
    '{ width: 1920, height: 1080 }',
].every(viewport => dashboardBrowserUat.includes(viewport)));
check('responsive browser UAT records overflow state and screenshots', dashboardBrowserUat.includes('horizontalOverflow') && dashboardBrowserUat.includes('responsive-module-health-'));
check('per-module audit covers all 23 application routes', dashboardBrowserUat.includes('const applicationRoutes = [') && dashboardBrowserUat.includes("'dashboard', 'search', 'johnny-ai'") && dashboardBrowserUat.includes("'fourm', 'admin'"));
check('per-module audit checks render overflow focus and typography', dashboardBrowserUat.includes('pagePresent') && dashboardBrowserUat.includes('pageOverflow') && dashboardBrowserUat.includes('focusVisible') && dashboardBrowserUat.includes('fontFamily'));
check('per-module audit fails on small touch targets or missing accessible names', dashboardBrowserUat.includes('touch targets smaller than 44px') && dashboardBrowserUat.includes('interactive controls without accessible names'));
check('touch-target audit permits only subpixel rasterization tolerance', dashboardBrowserUat.includes('rect.width < 43.5 || rect.height < 43.5'));
check('per-module audit blocks unexpected business writes', dashboardBrowserUat.includes('DESIGN_SYSTEM_UAT_BLOCKED_WRITE') && dashboardBrowserUat.includes('unexpected write attempt'));
check('browser wait tolerates transient reload execution contexts', dashboardBrowserUat.includes('Navigation briefly destroys the prior execution context') && dashboardBrowserUat.includes('lastError = error'));
check('browser UAT keeps its disposable Chrome profile inside the workspace', dashboardBrowserUat.includes("'.uat-browser-runtime'") && dashboardBrowserUat.includes('fs.rmSync(profileDir'));
check('focus audit uses a real keyboard Tab event', dashboardBrowserUat.includes("Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab'") && dashboardBrowserUat.includes('page?.contains(document.activeElement)'));
check('page render audit uses route visibility and records content height', dashboardBrowserUat.includes("!page.classList.contains('hidden')") && dashboardBrowserUat.includes('contentHeight: page?.scrollHeight'));
check('per-module audit supports bounded single-route diagnosis', dashboardBrowserUat.includes('APP_VISUAL_AUDIT_ROUTE') && dashboardBrowserUat.includes('const auditedRoutes'));
check('route audit serializes asynchronous page loading', dashboardBrowserUat.includes("history.replaceState(null, '', '#' + route)") && dashboardBrowserUat.includes("await handleRouting()"));
check('route audit waits for the requested page to become visibly rendered', dashboardBrowserUat.includes("!page.classList.contains('hidden') && style.display !== 'none' && style.visibility !== 'hidden'"));
check('route audit revalidates visibility after asynchronous content settles', dashboardBrowserUat.includes('if (!await evaluate(visibleRouteExpression))') && dashboardBrowserUat.includes('await waitFor(visibleRouteExpression, 30000)'));
check('overflow failures identify offending elements', dashboardBrowserUat.includes('const overflowElements') && dashboardBrowserUat.includes('audited.overflowElements'));
check('policy KPI cards remain two columns until wide desktop', policyPage.includes('id="stats-bar" class="grid grid-cols-2 xl:grid-cols-4 gap-4"'));
check('Safety Culture hero defers horizontal layout until wide desktop', safetyCulturePage.includes('flex flex-col xl:flex-row justify-between items-start xl:items-center') && safetyCulturePage.includes('grid grid-cols-2 xl:grid-cols-4 gap-3 w-full xl:w-auto'));
check('Safety Culture principle metrics remain readable in narrow app content', safetyCulturePage.includes('<div class="grid grid-cols-2 xl:grid-cols-4 gap-4">'));
check('KPI icon controls expose accessible names', kpiPage.includes('aria-label="ปีก่อนหน้า"') && kpiPage.includes('aria-label="ปีถัดไป"') && kpiPage.includes('aria-label="แก้ไข KPI"') && kpiPage.includes('aria-label="ลบ KPI"'));
check('Patrol icon and carousel controls expose accessible names', patrolPage.includes('aria-label="รีเฟรชข้อมูล Safety Patrol"') && patrolPage.includes('aria-label="แสดงสไลด์ ${idx + 1}"'));
check('Machine Safety pagination exposes accessible names', machineSafetyPage.includes('aria-label="หน้าก่อนหน้า"') && machineSafetyPage.includes('aria-label="หน้าถัดไป"'));
check('Forklift date filters expose accessible names', forkliftPage.includes('aria-label="วันหมดอายุตั้งแต่"') && forkliftPage.includes('aria-label="วันหมดอายุถึง"'));
check('Safety Culture featured campaign control exposes an accessible name', safetyCulturePage.includes('aria-label="ดูรายละเอียด ${escHtml(featured.Title)}"'));
check('4M charts stay bounded by responsive grid cells', fourmPage.includes('fourm-chart-grid') && fourmPage.includes('fourm-chart-frame') && css.includes('#fourm-page .fourm-chart-frame > canvas') && main.includes('./pages/fourm.js?v=20261011-fourm-chart-containment-r1'));

console.log(JSON.stringify({
    marker: 'APP_DESIGN_SYSTEM_FINALIZATION',
    mode: 'static-no-db-no-network',
    passed: checks.filter(item => item.pass).length,
    total: checks.length,
    checks,
}, null, 2));
