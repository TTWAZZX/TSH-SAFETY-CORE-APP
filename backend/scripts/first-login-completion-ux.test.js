const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const main = read('public/js/main.js');
const html = read('index.html');

assert.match(html, /บัญชีพนักงานใหม่\?/u);
assert.match(html, /หากยังไม่เคยเปลี่ยนรหัสผ่าน/u);
assert.match(html, /หากเคยเปลี่ยนแล้ว ให้ใช้รหัสผ่านล่าสุด/u);
assert.match(html, /id="login-success-message"[^>]*role="status"[^>]*aria-live="polite"/u);

assert.match(main, /const FIRST_LOGIN_REENTRY_KEY = 'tsh_first_login_reentry'/u);
assert.match(main, /function showFirstLoginCompletion\(user, \{ safetyUnitSelected = false \} = \{\}\)/u);
assert.match(main, /กรุณาออกจากระบบและเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่ เพื่อโหลดสิทธิ์และเมนูล่าสุด/u);
assert.match(main, /id="onboarding-complete-relogin"/u);
assert.match(main, /rememberFirstLoginReentry\(user\);\s*TSHSession\.logout\(\);/u);

assert.match(main, /forced && status === 'READY' && res\.nextAction === 'ENTER_APP'[\s\S]{0,180}showFirstLoginCompletion\(res\.user\)/u);
assert.match(main, /showFirstLoginCompletion\(res\.user, \{ safetyUnitSelected: true \}\)/u);
assert.match(main, /showFirstLoginCompletion\(verification\.user, \{ safetyUnitSelected: true \}\)/u);
assert.match(main, /if \(forced && status === 'READY'\)[\s\S]{0,180}showFirstLoginCompletion\(verification\.user\)/u);
assert.match(main, /ตั้งค่าบัญชีสำเร็จแล้ว กรุณาเข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่/u);

console.log('First-login completion UX static contract: PASS (15 assertions)');
