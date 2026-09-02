'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const rules = require('../services/bbs-checklist');

const root = path.resolve(__dirname, '..', '..');
const valid = {
    effectiveFrom: '2026-09-01', effectiveTo: '',
    categories: [{ name: 'Behavior', items: [{ code: 'SAFE-01', prompt: 'Uses PPE', responseType: 'safe_unsafe_na', unsafeRequiresRemark: true }] }],
    scopes: [{ departmentId: 18, safetyUnitId: 2, positionId: '', bbsLevel: 'Operator', priority: 10 }],
};
const fixture = {
    drafts: [valid, { ...valid, categories: [{ name: 'Behavior', items: [{ code: 'BAD CODE', prompt: 'x' }] }] }, { ...valid, scopes: [{ safetyUnitId: 2, priority: 0 }] }],
    importPreviews: [valid, { ...valid, categories: [{ name: 'Behavior', items: [{ code: 'DUP-01', prompt: 'x' }, { code: 'DUP-01', prompt: 'y' }] }] }],
    resolutions: [
        { context: { departmentId: 18, safetyUnitId: 2, positionId: 1, bbsLevel: 'Operator' }, candidates: [{ VersionID: 1, DepartmentID: 18, SafetyUnitID: null, PositionID: null, BBSLevel: null, Priority: 1, EffectiveFrom: '2026-09-01' }, { VersionID: 2, DepartmentID: 18, SafetyUnitID: 2, PositionID: null, BBSLevel: 'Operator', Priority: 0, EffectiveFrom: '2026-09-01' }] },
        { context: { departmentId: 18, safetyUnitId: 2, positionId: 1, bbsLevel: 'Operator' }, candidates: [{ VersionID: 3, DepartmentID: 18, SafetyUnitID: null, PositionID: null, BBSLevel: null, Priority: 5, EffectiveFrom: '2026-09-01' }, { VersionID: 4, DepartmentID: 18, SafetyUnitID: null, PositionID: null, BBSLevel: null, Priority: 5, EffectiveFrom: '2026-09-01' }] },
    ],
    publishConflicts: [{ mine: [{ DepartmentID: 18, SafetyUnitID: null, PositionID: 1, BBSLevel: null, Priority: 5 }], others: [{ VersionID: 8, DepartmentID: 18, SafetyUnitID: null, PositionID: 1, BBSLevel: null, Priority: 5 }, { VersionID: 9, DepartmentID: 19, SafetyUnitID: null, PositionID: 2, BBSLevel: null, Priority: 5 }] }],
};
const js = {
    drafts: fixture.drafts.map(rules.validateDraftPayload),
    importPreviews: fixture.importPreviews.map(rules.buildImportPreview),
    resolutions: fixture.resolutions.map(row => rules.resolveCandidates(row.candidates, row.context)),
    publishConflicts: fixture.publishConflicts.map(row => rules.detectPublishConflicts(row.mine, row.others)),
};
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runner = path.join(root, 'api', 'tests', 'bbs_checklist_fixture_runner.php');
const result = spawnSync(php, [runner], { input: JSON.stringify(fixture), encoding: 'utf8' });
assert.strictEqual(result.status, 0, result.stderr);
assert.deepStrictEqual(JSON.parse(result.stdout), js, 'Node/PHP checklist rule parity mismatch');
assert.strictEqual(js.drafts[0].ok, true);
assert.strictEqual(js.drafts[1].ok, false);
assert.strictEqual(js.drafts[2].ok, false);
assert.deepStrictEqual(js.importPreviews[0].summary, { categoryCount: 1, itemCount: 1, scopeCount: 1, effectiveFrom: '2026-09-01', effectiveTo: null });
assert.strictEqual(js.importPreviews[1].ok, false);
assert.strictEqual(js.resolutions[0].selected.VersionID, 2);
assert.strictEqual(js.resolutions[1].code, 'CHECKLIST_CONFLICT');
assert.deepStrictEqual(js.publishConflicts, [[8]]);

const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'bbs-checklists.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'bbs_checklists.php'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'admin.js'), 'utf8');
for (const marker of ['/admin/checklists', '/admin/checklist-versions/:versionId/publish', '/admin/checklist-versions/:versionId/clone', '/admin/checklist-versions/:versionId/archive', '/admin/checklist-versions/:versionId/import-preview', '/admin/checklist-versions/:versionId/import', '/checklists/resolve']) assert.ok(nodeRoute.includes(marker), `Node missing ${marker}`);
for (const marker of ['/bbs/admin/checklists', '/bbs/admin/checklist-versions/:versionId/publish', '/bbs/admin/checklist-versions/:versionId/clone', '/bbs/admin/checklist-versions/:versionId/archive', '/bbs/admin/checklist-versions/:versionId/import-preview', '/bbs/admin/checklist-versions/:versionId/import', '/bbs/checklists/resolve']) assert.ok(phpRoute.includes(marker), `PHP missing ${marker}`);
assert.ok(nodeRoute.includes('/admin/checklists/:templateId/status'));
assert.ok(phpRoute.includes('/bbs/admin/checklists/:templateId/status'));
for (const marker of ['Checklist Management', '_bbsExportChecklist', '_bbsPreviewImportFile', '/import-preview']) assert.ok(admin.includes(marker), `Admin missing ${marker}`);
assert.ok(admin.includes("API.get('/bbs/admin/checklists')"));
assert.ok(admin.includes("sessionStorage.setItem('bbs_admin_workspace', tab)"), 'Admin must guide configuration into the canonical BBS workspace.');
console.log('BBS Phase 2B checklist parity/contracts: PASS');
