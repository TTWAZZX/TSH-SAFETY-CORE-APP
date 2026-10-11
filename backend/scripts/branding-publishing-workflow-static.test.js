'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const admin = read('public/js/pages/admin.js');
const nodeRoute = read('backend/routes/branding.js');
const nodeServer = read('backend/server.js');
const php = read('api/handlers/branding.php');
const phpIndex = read('api/index.php');
const nodeSettings = read('backend/routes/settings.js');
const phpPlatform = read('api/handlers/platform.php');
const main = read('public/js/main.js');
const browserUat = read('backend/scripts/dashboard-d4-browser-uat.js');

let passed = 0;
function check(name, condition) {
    if (!condition) throw new Error(`FAIL ${name}`);
    passed += 1;
    console.log(`PASS ${name}`);
}

check('public Login reads only the published app_branding key', main.includes("apiFetch('/public/branding')") && !main.includes('app_branding_draft'));
check('Node separates published draft and version-history settings', nodeRoute.includes("PUBLISHED_KEY = 'app_branding'") && nodeRoute.includes("DRAFT_KEY = 'app_branding_draft'") && nodeRoute.includes("VERSIONS_KEY = 'app_branding_versions'"));
check('PHP separates the same three settings keys', php.includes("BRANDING_PUBLISHED_KEY = 'app_branding'") && php.includes("BRANDING_DRAFT_KEY = 'app_branding_draft'") && php.includes("BRANDING_VERSIONS_KEY = 'app_branding_versions'"));
check('Node and PHP cap immutable history at 12 versions', nodeRoute.includes('HISTORY_LIMIT = 12') && php.includes('BRANDING_HISTORY_LIMIT = 12'));
check('Node mutation routes are Admin-only', ["router.put('/draft', isAdmin", "router.delete('/draft', isAdmin", "router.post('/publish', isAdmin", "router.post('/versions/:versionId/rollback', isAdmin"].every(value => nodeRoute.includes(value)));
check('PHP Branding workspace requires Admin', php.includes('$user = require_admin()'));
check('PHP Branding workspace is private and non-cacheable', php.includes("header('Cache-Control: private, no-store, max-age=0')") && php.includes("header('Pragma: no-cache')"));
check('Publish requires explicit confirmation in Node and PHP', nodeRoute.includes("confirmation !== 'PUBLISH_BRANDING'") && php.includes("!== 'PUBLISH_BRANDING'"));
check('Rollback requires explicit confirmation in Node and PHP', nodeRoute.includes("confirmation !== 'ROLLBACK_BRANDING'") && php.includes("!== 'ROLLBACK_BRANDING'"));
check('Draft publish uses optimistic conflict checking', nodeRoute.includes('BRANDING_DRAFT_CONFLICT') && php.includes('BRANDING_DRAFT_CONFLICT') && nodeRoute.includes('expectedDraftUpdatedAt') && php.includes('expectedDraftUpdatedAt'));
check('Discard Draft requires the exact current Draft revision', admin.includes("API.delete('/branding/draft'") && admin.includes('expectedDraftUpdatedAt: _brandingWorkspace.draft?.updatedAt') && (nodeRoute.match(/expectedDraftUpdatedAt/g) || []).length >= 2 && (php.match(/expectedDraftUpdatedAt/g) || []).length >= 2);
check('Rollback uses active-version conflict checking', nodeRoute.includes('BRANDING_VERSION_CONFLICT') && php.includes('BRANDING_VERSION_CONFLICT') && nodeRoute.includes('expectedActiveVersionId') && php.includes('expectedActiveVersionId'));
check('Node publish and rollback are transactional', (nodeRoute.match(/beginTransaction\(\)/g) || []).length >= 3 && (nodeRoute.match(/connection\.commit\(\)/g) || []).length >= 3);
check('PHP publish and rollback are transactional', (php.match(/beginTransaction\(\)/g) || []).length >= 3 && (php.match(/\$pdo->commit\(\)/g) || []).length >= 3);
check('Rollback creates a new immutable version', nodeRoute.includes("newVersion(target.value, nextNo, who, 'rollback'") && php.includes("branding_new_version($target['value'], $nextNo, $who, 'rollback'"));
check('Draft is removed only after successful publish', nodeRoute.includes("DELETE FROM App_Settings WHERE key_name=?', [DRAFT_KEY]") && php.includes("DELETE FROM app_settings WHERE key_name=?', [BRANDING_DRAFT_KEY]"));
check('Branding mutations write audit actions', ['SAVE_BRANDING_DRAFT', 'DISCARD_BRANDING_DRAFT', 'PUBLISH_BRANDING', 'ROLLBACK_BRANDING'].every(action => nodeRoute.includes(action) && php.includes(action)));
check('Node Branding router is authenticated at mount and individually Admin-gated', nodeServer.includes("app.use('/api/branding',          authenticateToken, brandingRoutes)") && nodeServer.includes("require('./routes/branding')"));
check('PHP Branding handler is loaded before generic platform settings', phpIndex.indexOf('handlers/branding.php') > -1 && phpIndex.indexOf('handle_branding_routes($method, $path)') < phpIndex.indexOf('handle_platform_routes($method, $path)'));
check('Admin UI exposes Draft Preview Publish Version and Rollback', ['Publishing Workflow', 'บันทึก Draft', 'Publish', 'Version History', 'data-branding-rollback'].every(value => admin.includes(value)));
check('Branding workspace separates the long form into five task-focused sections', ['overview', 'identity', 'login', 'communications', 'versions'].every(key => admin.includes(`data-branding-workspace-panel="${key}"`)) && admin.includes('BRANDING_WORKSPACE_SECTIONS'));
check('Branding workspace uses accessible tab semantics and roving keyboard focus', admin.includes('role="tablist"') && admin.includes('role="tab"') && admin.includes("event.key === 'ArrowRight'") && admin.includes("event.key === 'Home'") && admin.includes("event.key === 'End'"));
check('Draft and publish actions remain available before every editing section', admin.includes('data-branding-action-bar') && admin.includes('order-first') && admin.includes('aria-label="การจัดการ Draft และ Publish"'));
check('Overview integrates status summaries with direct editing shortcuts', admin.includes('aria-label="สรุปการตั้งค่า Branding"') && admin.includes("['identity', 'ข้อมูลแบรนด์'") && admin.includes("['versions', 'สถานะเผยแพร่'") && (admin.match(/data-branding-workspace-jump=/g) || []).length >= 3);
check('Editing follows a contextual previous and next workflow', admin.includes('branding-previous-section-btn') && admin.includes('branding-next-section-btn') && admin.includes("communications: 'overview'") && admin.includes("login: 'communications'"));
check('Publish and destructive Draft actions are reserved for final review', admin.includes("_setBrandingControlVisibility(publish, section === 'versions')") && admin.includes("_setBrandingControlVisibility(reset, section === 'versions')") && admin.includes("_setBrandingControlVisibility(discard, section === 'versions')"));
check('Unsaved changes are announced in the contextual action bar', admin.includes('branding-draft-status') && admin.includes('มีการแก้ไขที่ยังไม่ได้บันทึก'));
check('Admin UI no longer writes published Branding through generic settings endpoint', !admin.includes("API.put('/settings/app_branding'"));
check('Generic Node and PHP settings APIs cannot bypass Branding workflow', nodeSettings.includes('BRANDING_WORKFLOW_REQUIRED') && phpPlatform.includes('BRANDING_WORKFLOW_REQUIRED') && nodeSettings.includes('BRANDING_WORKFLOW_KEYS') && phpPlatform.includes('platform_is_branding_workflow_key'));
check('Admin UI refreshes public Branding only after publish or rollback', (admin.match(/window\._refreshAppBranding/g) || []).length === 2);
check('Admin UI preserves Published value when discarding Draft', admin.includes("API.delete('/branding/draft'") && admin.includes('ค่า Published และหน้า Login จริงจะไม่เปลี่ยน'));
check('Browser UAT checks the publishing workspace without mutation', browserUat.includes('publishingWorkflow') && browserUat.includes('Branding save action is Draft-only') && browserUat.includes('workspaceNavigation'));
check('Branding API failures are visible and retryable instead of masquerading as no Draft', admin.includes('เชื่อมต่อ Branding API ไม่สำเร็จ') && admin.includes('branding-api-retry-btn') && admin.includes("_brandingLoadError = String(err?.message"));

console.log(`PASS Branding Draft/Publish/Version/Rollback static contract: ${passed} checks`);
