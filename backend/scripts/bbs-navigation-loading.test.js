'use strict';

const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const page=read('public/js/pages/bbs-smart-card.js');
const designer=read('public/js/pages/bbs-card-designer.js');
const admin=read('public/js/pages/admin.js');
const api=read('public/js/api.js');
const asyncUi=read('public/js/utils/bbs-async-ui.js');

for(const marker of [
    'BBS_UI_STATE_VERSION',
    'function bbsUiStorageKey()',
    'function restoreBbsUiState()',
    'function persistBbsUiState(',
    'function sanitizeBbsRestoredTab()',
    'function loadRestoredBbsTab()',
    'function reopenStoredDesignerIfNeeded()',
    "sessionStorage.setItem(bbsUiStorageKey()",
    "sessionStorage.getItem(bbsUiStorageKey()",
    'restoreBbsUiState();ensureBbsPersistenceListeners();await loadData();sanitizeBbsRestoredTab();await loadRestoredBbsTab()',
    'render({restoreScroll:true});reopenStoredDesignerIfNeeded()',
]) assert.ok(page.includes(marker),`BBS navigation persistence missing ${marker}`);

assert.ok(page.includes("delete copy.q"),'Persisted BBS state must exclude free-text searches');
assert.ok(page.includes("state.context?.employee?.EmployeeID"),'Persisted BBS state must be scoped by employee');
assert.ok(!page.includes("localStorage.setItem(bbsUiStorageKey()"),'Navigation state must be session-scoped');

for(const endpoint of [
    '/bbs/observations/${observationId}/evidence',
    '/bbs/observations/${state.draft.id}/evidence',
    '/bbs/actions/${id}/evidence',
    '/bbs/community/reports',
    '/bbs/admin/department-card-templates',
    '/bbs/admin/card-templates',
]) assert.ok(page.includes(`API.upload(\`${endpoint}\``)||page.includes(`API.upload('${endpoint}'`),`Progress upload missing ${endpoint}`);

for(const marker of [
    'export function apiUpload(',
    'new XMLHttpRequest()',
    "xhr.upload.addEventListener('progress'",
    "API Upload Error:",
    'upload: (url, body, options = {}) => apiUpload(url, body, options)',
]) assert.ok(api.includes(marker),`API progress contract missing ${marker}`);

for(const marker of [
    "id = 'bbs-operation-status'",
    'aria-live',
    'aria-busy="true"',
    'role="progressbar"',
    'export function beginBbsOperation(',
    'export function uploadProgress(',
]) assert.ok(asyncUi.includes(marker),`BBS async UI missing ${marker}`);

for(const marker of [
    "DESIGNER_SESSION_KEY='tsh_bbs_designer_session_v1'",
    'function persistDesignerSession(',
    'function clearDesignerSession()',
    'persistDesignerSession(id)',
    'API.upload(`/bbs/admin/card-designer/versions/${runtime.record.id}/assets`',
    "uploadProgress(operation,'กำลังอัปโหลดภาพพื้นหลัง...')",
]) assert.ok(designer.includes(marker),`Designer restore/loading missing ${marker}`);

for(const marker of [
    "beginBbsOperation('กำลังตรวจสอบไฟล์ Checklist'",
    "beginBbsOperation('กำลัง Import Checklist'",
    "target?.setAttribute('aria-busy', 'true')",
    'id="bbs-confirm-checklist-import"',
]) assert.ok(admin.includes(marker),`BBS System Console loading standard missing ${marker}`);

require('./bbs-runtime-assets').assertBbsRuntimeAssets();
console.log('BBS navigation persistence and loading standard: PASS');
