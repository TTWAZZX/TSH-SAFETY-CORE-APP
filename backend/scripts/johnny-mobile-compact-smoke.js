const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const checks = [];
const assert = (name, ok) => {
  checks.push({ name, ok: Boolean(ok) });
  if (!ok) process.exitCode = 1;
};

const cacheBust = '20260709-johnny-final-closeout';
const index = read('index.html');
const main = read('public/js/main.js');
const frontend = read('public/js/pages/johnny-ai.js');
const css = read('public/style.css');
const pkg = read('backend/package.json');

assert('index style cache bust', index.includes(`public/style.css?v=${cacheBust}`));
assert('index main cache bust', index.includes(`public/js/main.js?v=${cacheBust}`));
assert('main Johnny cache bust', main.includes(`pages/johnny-ai.js?v=${cacheBust}`));
assert('mobile compact shell marker', frontend.includes('data-johnny-mobile-compact="20260709"'));
assert('tab state marker', frontend.includes('data-johnny-tab="${escHtml(_activeTab)}"') && frontend.includes("shell.setAttribute('data-johnny-tab', _activeTab)"));
assert('empty state classes', frontend.includes('johnny-empty-state') && frontend.includes('johnny-empty-title') && frontend.includes('johnny-empty-quick'));
assert('mobile chat header compacted', css.includes('#johnny-ai-page .johnny-chat-layout > section > div:first-child > div') && css.includes('display: none;'));
assert('Johnny mobile bottom tab removed', css.includes('body[data-active-page="johnny-ai"] #bottom-tab-bar') && css.includes('display: none !important;'));
assert('empty quick hidden on mobile', css.includes('#johnny-ai-page .johnny-empty-quick') && css.includes('display: none !important;'));
assert('desktop quick rail wraps without horizontal scroll', css.includes('.johnny-field-quick-rail') && css.includes('flex-wrap: wrap;') && css.includes('overflow-x: visible !important;'));
assert('mobile quick rail keeps horizontal affordance', css.includes('#johnny-ai-page .johnny-field-quick-rail') && css.includes('flex-wrap: nowrap;') && css.includes('overflow-x: auto !important;'));
assert('composer compact dimensions', css.includes('grid-template-columns: 3.25rem minmax(0, 1fr) 3.75rem') && css.includes('height: 3.25rem !important;'));
assert('message safe padding compact', css.includes('calc(7.25rem + env(safe-area-inset-bottom, 0px))'));
assert('package scripts registered', pkg.includes('smoke:johnny-mobile-compact') && pkg.includes('uat:johnny-mobile-compact') && pkg.includes('smoke:johnny-golden-quality') && pkg.includes('uat:johnny-final-browser'));

const passed = checks.filter((check) => check.ok).length;
console.log(JSON.stringify({
  marker: 'JOHNNY_MOBILE_COMPACT_UX',
  cacheBust,
  passed,
  total: checks.length,
  checks,
}, null, 2));
