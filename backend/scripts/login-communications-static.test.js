'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const main = read('public/js/main.js');
const admin = read('public/js/pages/admin.js');
const nodeRoute = read('backend/routes/branding.js');
const nodeServer = read('backend/server.js');
const php = read('api/handlers/branding.php');
const phpIndex = read('api/index.php');
const browser = read('backend/scripts/dashboard-d4-browser-uat.js');

let passed = 0;
function check(name, condition) {
    assert.ok(condition, name);
    passed += 1;
    console.log(`PASS ${name}`);
}

const fields = [
    'loginAnnouncementEnabled', 'loginAnnouncementTone', 'loginAnnouncementTitle', 'loginAnnouncementMessage',
    'loginAnnouncementStartAt', 'loginAnnouncementEndAt', 'loginAnnouncementLinkLabel', 'loginAnnouncementUrl',
    'supportTitle', 'supportEmail', 'supportPhone', 'supportHours', 'supportLinkLabel', 'supportUrl'
];
check('Login contains accessible announcement and support regions', html.includes('id="login-system-announcement"') && html.includes('aria-live="polite"') && html.includes('id="login-support-links"') && html.includes('aria-label="ช่องทางช่วยเหลือ"'));
check('Desktop announcement belongs to the green brand panel while mobile retains a form fallback', html.includes('data-login-announcement-surface="brand"') && html.includes('data-login-announcement-surface="form"') && html.indexOf('id="login-system-announcement"') < html.indexOf('id="login-panel"') && main.includes("brandSurface ? 'border-white/20"));
check('Admin exposes announcement severity schedule content and CTA controls', ['branding-announcement-enabled', 'branding-announcement-tone', 'branding-announcement-title', 'branding-announcement-message', 'branding-announcement-start', 'branding-announcement-end', 'branding-announcement-link-label', 'branding-announcement-url'].every(id => admin.includes(id)));
check('Admin exposes email phone service hours and help-link controls', ['branding-support-title', 'branding-support-email', 'branding-support-phone', 'branding-support-hours', 'branding-support-link-label', 'branding-support-url'].every(id => admin.includes(id)));
check('Node and PHP Branding normalization preserve every communication field', fields.every(field => nodeRoute.includes(field) && php.includes(field)));
check('Node and PHP public contracts expose every communication field', fields.every(field => nodeServer.includes(field) && phpIndex.includes(field)));
check('Public URLs are restricted to HTTPS or same-origin paths', nodeRoute.includes("url.startsWith('/')") && nodeRoute.includes('/^https:\\/\\//i') && nodeServer.includes("url.startsWith('/')") && nodeServer.includes('/^https:\\/\\//i') && php.includes("str_starts_with($url, '/')") && php.includes("preg_match('/^https:") && phpIndex.includes("str_starts_with($url, '/')") && phpIndex.includes("preg_match('/^https:"));
check('Announcement supports info warning and critical semantic tones', ['info', 'warning', 'critical'].every(tone => main.includes(`${tone}: [`)) && admin.includes("['info', 'warning', 'critical']"));
check('Announcement display is bounded by enabled state and schedule', main.includes('_loginAnnouncementIsActive') && main.includes('now < start') && main.includes('now > end'));
check('Login renders communication text with textContent and safe DOM links', main.includes('title.textContent = branding.loginAnnouncementTitle') && main.includes('supportLinks.replaceChildren()') && main.includes("link.rel = 'noopener noreferrer'"));
check('Support channels use mailto tel and HTTPS help destinations', main.includes('mailto:${email}') && main.includes('tel:${phoneHref}') && main.includes('branding.supportUrl'));
check('Empty support configuration retains a useful Safety/Admin fallback', html.includes('login-support-fallback') && main.includes("fallback.classList.toggle('hidden'"));
check('Communication settings participate in Branding Draft Preview Publish and rollback', admin.includes('communicationFields') && admin.includes('_applyBrandingCommunicationPreview(clone, { forceAnnouncement: true })') && admin.includes("API.put('/branding/draft'"));
check('Draft Preview always shows a configured announcement while runtime keeps schedule enforcement', admin.includes('forceAnnouncement ? configured : _brandingAnnouncementActive') && admin.includes('ใน Preview จะแสดง Draft ที่เปิดใช้งานทันที') && main.includes('_loginAnnouncementIsActive'));
check('Admin validates announcement content schedule and URL policy before saving Draft', admin.includes('เวลาสิ้นสุดประกาศต้องอยู่หลังเวลาเริ่มแสดง') && admin.includes('กรุณาระบุหัวข้อหรือรายละเอียดประกาศก่อนเปิดใช้งาน') && admin.includes('ต้องเป็น HTTPS หรือ path ภายในระบบ'));
check('Browser UAT covers communication controls and real-layout Preview', browser.includes('loginCommunications') && browser.includes('announcementVisible') && browser.includes('supportLinks'));
check('Cache chain carries portrait Login communications Preview revision', html.includes('login-communications-r9-portrait-preview') && main.includes('login-communications-r9-portrait-preview'));

console.log(`PASS Login announcements and support channels static contract: ${passed} checks`);
