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
    'function consumeBbsEntryIntent()',
    'async function loadActiveBbsTab(',
    'function reopenStoredDesignerIfNeeded()',
    "sessionStorage.setItem(bbsUiStorageKey()",
    "sessionStorage.getItem(bbsUiStorageKey()",
    'restoreBbsUiState();ensureBbsPersistenceListeners();const entry=consumeBbsEntryIntent();sanitizeBbsRestoredTab();await loadData()',
    'render({restoreScroll:true});reopenStoredDesignerIfNeeded()',
]) assert.ok(page.includes(marker),`BBS navigation persistence missing ${marker}`);

for(const marker of [
    'state.cardDataLoaded={reference:false,artwork:false,personal:false,department:false}',
    'async function loadMasterReference(',
    'async function loadMasterArtwork(',
    'async function loadCardFoundation(',
    'async function loadPersonalCardAdmin(',
    'async function loadDepartmentCardAdmin(',
    'async function loadCardWorkspace(',
    "if(state.tab==='cards')return trackSectionLoad('cards',()=>loadCardWorkspace(state.cardWorkspace,{force}))",
    'async function switchCardWorkspace(',
]) assert.ok(page.includes(marker),`BBS tab/workspace lazy loading missing ${marker}`);

for(const marker of [
    'async function loadPersonalTemplateCatalog(',
    'async function loadPersonalCardRows()',
    'async function loadDepartmentCardCatalog(',
    'async function refreshTemplateTrash(kind)',
    'await loadPersonalTemplateCatalog({trash:false})',
    'await loadDepartmentCardCatalog({trash:false})',
    'await loadMasterArtwork({force:true})',
]) assert.ok(page.includes(marker),`BBS targeted mutation refresh missing ${marker}`);

for(const marker of [
    'function revokeUrls(force=false)',
    'revokeUrls(true);overlay.remove()',
    'runtime.loadedPresetKind===runtime.kind',
    'if(runtime.loadedPresetKind!==runtime.kind)await loadPresetLists()',
    'addActivePreset(created.data)',
    'movePreset(item,true)',
    'movePreset(item,false)',
]) assert.ok(designer.includes(marker),`Designer targeted resource reuse missing ${marker}`);

for(const marker of [
    'DESIGNER_PREVIEW_MAX_PX=1600',
    'window.BBSDesignerPreview=Object.freeze(',
    'async function previewImageBlob(source)',
    'function sideAssetIds(sideName)',
    'function sideResourcesReady(sideName)',
    'async function preloadSideResources(sideName=runtime.side)',
    'function queueActiveSideResources()',
    'queueActiveSideResources();',
    "role:'background'",
    "role:'element'",
]) assert.ok(designer.includes(marker),`Designer active-side Preview missing ${marker}`);

const previewLoader=designer.match(/async function preloadSideResources[\s\S]*?\nasync function preloadResources/)?.[0]||'';
assert.ok(previewLoader.includes('sideAssetIds(sideName)'),'Active-side Preview must select only assets referenced by that side');
assert.ok(!previewLoader.includes('for(const side of runtime.record.layout.sides)'),'Active-side Preview must not preload every side');
assert.ok(page.includes('async function designerPrintResources(cards)')&&page.includes('const response=await apiFetch(url)'),'Printing must continue fetching authorized original resources');

const personalUpload=page.match(/async function uploadCardTemplate[\s\S]*?\nasync function uploadMasterArtwork/)?.[0]||'';
assert.ok(!personalUpload.includes('loadCardAdmin()'),'Personal Template upload must not reload cards, employees, foundation, or artwork');
const masterUpload=page.match(/async function uploadMasterArtwork[\s\S]*?\nasync function previewMasterArtwork/)?.[0]||'';
assert.ok(!masterUpload.includes('loadCardAdmin()'),'Master Artwork upload must not reload unrelated Card Admin data');
const departmentUpload=page.match(/async function uploadDepartmentTemplate[\s\S]*?\nasync function previewDepartmentTemplate/)?.[0]||'';
assert.ok(!departmentUpload.includes('loadCommunity()'),'Department Template upload must not reload Community reports or employees');
const designerBackgroundUpload=designer.match(/async function uploadBackground[\s\S]*?\nfunction bindLayoutSizeControls/)?.[0]||'';
assert.ok(!designerBackgroundUpload.includes('API.get(')&&!designerBackgroundUpload.includes('preloadResources()'),'Designer background upload must fetch only its newly uploaded asset');
const presetToolbar=designer.match(/function installPresetToolbar[\s\S]*?\nfunction installChooserTrash/)?.[0]||'';
assert.ok(!presetToolbar.includes('await loadPresetLists()'),'Preset Save/Trash/Restore must update only the confirmed in-memory catalog');
const presetApply=presetToolbar.match(/apply\.onclick[\s\S]*?trash\.onclick/)?.[0]||'';
assert.ok(!presetApply.includes('preloadResources()')&&!presetApply.includes('revokeUrls()'),'Apply Preset must preserve unchanged artwork resources');

const initialLoader=page.match(/async function loadData\(\)\s*\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(initialLoader.includes('loadActiveBbsTab({force:true})'),'Initial BBS load must request only the active tab');
assert.ok(!initialLoader.includes('loadCommunity')&&!initialLoader.includes('loadInspectorData')&&!initialLoader.includes('loadCardAdmin'),'Initial BBS load must not eagerly fetch inactive sections');

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
    'export function beginBbsPerformance(',
    'window.BBSPerformance = Object.freeze({',
    'summary: () => performanceSummary()',
    'export function uploadProgress(',
]) assert.ok(asyncUi.includes(marker),`BBS async UI missing ${marker}`);

assert.ok(designer.includes("control=control?.currentTarget||control"),'Designer busy state must resolve browser Event.currentTarget before touching the control');
assert.ok(designer.includes("typeof control.setAttribute==='function'"),'Designer busy state must reject non-element controls safely');
assert.ok(page.includes("beginBbsPerformance('page:initial-load')"),'BBS initial page load must publish a measurable baseline');
assert.ok(page.includes('`section:${section}`'),'Each BBS section load must have a distinct performance metric');

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
