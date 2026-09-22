const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/ky.js');
const phpRoute = read('api/handlers/workflow_phase6.php');
const frontend = read('public/js/pages/ky.js');
const main = read('public/js/main.js');
const index = read('index.html');

for (const source of [nodeRoute, phpRoute]) {
    assert.match(source, /ky_annual_video_evidence/i, 'annual evidence table must exist in both runtimes');
    assert.match(source, /ky_annual_video_evidence_audit/i, 'immutable annual evidence audit must exist');
    assert.match(source, /annual-video-evidence/, 'annual evidence API must exist');
    assert.match(source, /ExternalBackupConfirmed/, 'external backup confirmation must be persisted');
    assert.match(source, /ExternalReference/, 'central-machine reference must be persisted');
    assert.match(source, /SHA256/, 'full-file SHA-256 metadata must be persisted');
    assert.match(source, /ADMIN_VERIFIED/, 'Admin verification must be audited');
    assert.match(source, /PRODUCTION_FILE_DELETED/, 'physical deletion must be audited');
    assert.match(source, /KY_EXTERNAL_BACKUP_REQUIRED|External backup must be confirmed/, 'unconfirmed external backup must fail closed');
    assert.match(source, /KY_ANNUAL_VIDEO_HASH_MISMATCH|failed SHA-256 verification/, 'physical deletion must fail on hash mismatch');
    assert.match(source, /RowVersion/, 'mutations must use optimistic concurrency');
    assert.match(source, /ProductionDeletedAt/, 'metadata must retain deletion state');
    assert.match(source, /KY_VIDEO_PROTECTED_BY_RETENTION/, 'legacy replacement and activity deletion paths must fail closed');
    assert.match(source, /ProductionDeletedAt=NULL/, 'a corrected replacement must reset the previous physical-deletion marker');
    assert.match(source, /activity video reference changed|Activity.*VideoUrl.*FOR UPDATE/is, 'deletion must lock and revalidate the current activity video reference');
    assert.match(source, /HasProductionVideo/, 'activity projections must identify Production video evidence');
    assert.match(source, /HasVerifiedExternalVideo/, 'activity projections must identify verified external video evidence');
    assert.match(source, /HasPendingExternalVideo/, 'activity projections must keep pending external video separate');
    assert.match(source, /videoEvidenceRate/, 'KY stats must expose the combined verified video-evidence rate');
    assert.match(source, /external_verified/, 'KY history must filter verified external evidence');
    assert.match(source, /external_pending/, 'KY history must filter pending external evidence');
    assert.match(source, /ScopeAlreadyRegistered/, 'annual candidate projection must identify an existing scope registration');
    assert.match(source, /ScopeEvidenceID/, 'annual candidate projection must link to its existing scope evidence');
    assert.match(source, /ky_video_file_inventory/i, 'Production video inventory table must exist in both runtimes');
    assert.match(source, /ky_video_file_inventory_audit/i, 'immutable Production video inventory audit must exist');
    assert.match(source, /video-inventory\/declare/, 'Production video inventory declaration API must exist');
    assert.match(source, /KY_VIDEO_INVENTORY_BACKUP_MISMATCH/, 'external backup hash mismatch must fail closed');
    assert.match(source, /KY_VIDEO_INVENTORY_NOT_VERIFIED|verified matching external backup/i, 'unverified Inventory cleanup must fail closed');
    assert.match(source, /departmentSource/, 'KY stats must identify the authoritative Department source');
    assert.match(source, /configuredDepartments/, 'KY stats must return every configured Department');
    assert.match(source, /unmappedDepartments/, 'KY stats must expose unmatched activity Department diagnostics');
    assert.match(source, /ProductionOriginalFileName/, 'Inventory projection must expose the current Production video file name');
}

assert.match(nodeRoute, /fs\.renameSync\(entry\.localPath, quarantine\)/, 'Node must quarantine files before committing deletion metadata');
assert.match(nodeRoute, /connection\.rollback/, 'Node deletion must support transaction rollback');
assert.match(nodeRoute, /fs\.renameSync\(entry\.quarantine, entry\.localPath\)/, 'Node must restore quarantine on rollback');
assert.match(phpRoute, /rename\(\$entry\['local'\],\$quarantine\)/, 'PHP must quarantine files before committing deletion metadata');
assert.match(phpRoute, /array_reverse\(\$quarantined\)/, 'PHP must restore quarantine on rollback');

assert.match(frontend, /Annual Video Evidence/, 'Admin annual evidence workspace must exist');
assert.match(frontend, /Annual Compliance Dashboard/, 'annual compliance dashboard must exist');
assert.match(frontend, /data-ky-annual-delete-selected/, 'bulk Production file deletion control must exist');
assert.match(frontend, /data-ky-annual-delete-one/, 'single Production file deletion control must exist');
assert.match(frontend, /data-ky-annual-download/, 'Admin download control must exist');
assert.match(frontend, /data-ky-annual-audit/, 'Admin audit viewer must exist');
assert.match(frontend, /ky-video-central-machine/, 'submit form must support central-machine evidence');
assert.match(frontend, /sha256Blob\(videoFile\)/, 'central-machine declaration must fingerprint the selected file');
assert.match(frontend, /storageMode:\s*'CentralMachine'/, 'central-machine mode must be sent explicitly');
assert.match(frontend, /storageMode:\s*'Production'/, 'Production mode must be registered explicitly');
assert.match(frontend, /ky-manage-video-central-machine/, 'Admin activity management must support central-machine evidence for closed activities');
assert.match(frontend, /selectedStatus !== 'Closed'/, 'Admin central-machine registration must be restricted to closed activities');
assert.match(frontend, /HasVerifiedExternalVideo/, 'History badges must consume verified external evidence state');
assert.match(frontend, /External video pending Admin verify/, 'pending external evidence must remain visibly uncounted');
assert.match(frontend, /data-ky-annual-focus-evidence/, 'already-registered candidates must navigate to their existing evidence row');
assert.match(frontend, /KY_ANNUAL_VIDEO_ALREADY_VERIFIED/, 'a concurrent verified-scope conflict must be handled without an unhandled rejection');
assert.match(frontend, /External Backup.*SHA-256|External Backup.*SHA/, 'UI must explain protected deletion eligibility');
assert.match(frontend, /Production Video Inventory/, 'Admin must see the separate Production Video Inventory workspace');
assert.match(frontend, /data-ky-inventory-register/, 'Inventory must support external backup registration');
assert.match(frontend, /data-ky-inventory-delete-selected/, 'Inventory must support guarded bulk cleanup');
assert.match(frontend, /max-h-\[60vh\]/, 'Inventory list must use the expanded 60vh viewport');
assert.match(frontend, /Overview.*Annual Compliance.*Production Inventory.*Cleanup Queue & Audit/s, 'Admin workspace must expose four focused views');
assert.match(frontend, /data-id="\$\{escHtml\(row\.ActivityID\)\}" data-ky-inventory-register=/, 'Inventory registration action lock must be scoped per Activity');
assert.match(frontend, /input\.addEventListener\('cancel', \(\) => finish\(null\)/, 'Inventory file picker must release its action lock when the picker is cancelled');
assert.match(frontend, /window\.addEventListener\('focus', handleWindowFocus, true\)/, 'Inventory file picker must recover when a browser omits the cancel event');
assert.match(frontend, /data-activity-date="\$\{escHtml\(String\(row\.ActivityDate\|\|''\)\.slice\(0,10\)\)\}"/, 'Inventory cards must retain their authoritative Activity Date');
assert.match(frontend, /formatKyActivityMonth\(row\.ActivityDate\)/, 'Inventory cards must display the Activity month');
assert.match(frontend, /formatKyActivityDate\(row\.ActivityDate\)/, 'Inventory cards must display the exact Activity date');
assert.match(frontend, /data-ky-inventory-help/, 'Inventory workspace must explain the external-backup registration workflow');
assert.match(frontend, /ไม่อัปโหลดไฟล์กลับขึ้น Production/, 'Inventory help must make the metadata-only file selection explicit');
assert.match(frontend, /KY_EXTERNAL_BACKUP_ROOT = '\\\\\\\\192\.168\.124\.87'/, 'Inventory registration must use the configured central-machine root');
assert.match(frontend, /buildKyInventoryBackupReference\(file\)/, 'Inventory registration must create its central-machine reference automatically');
assert.doesNotMatch(frontend, /window\.prompt\('ระบุพาธ \/ เลขอ้างอิงของไฟล์ที่เก็บไว้ในเครื่องกลาง'/, 'Inventory registration must not show a second path prompt');
assert.match(frontend, /KY_VIDEO_INVENTORY_BACKUP_MISMATCH[\s\S]*ขนาดหรือ SHA-256 ไม่ตรงกัน/, 'Inventory registration must explain a backup hash mismatch to the Admin');
assert.match(frontend, /ไฟล์ Production:/, 'Inventory cards must label the current Production video file name');
assert.match(frontend, /data-ky-inventory-registration-status/, 'Inventory cards must expose live registration feedback');
assert.match(frontend, /ยังไม่ได้ลงทะเบียน External Backup/, 'Unregistered Inventory cards must show a truthful initial state');
assert.match(frontend, /กำลังคำนวณ SHA-256:[\s\S]*กำลังเทียบกับไฟล์ Production และลงทะเบียน:/, 'Inventory registration must show hashing and server-registration phases');
assert.match(frontend, /ลงทะเบียนไม่สำเร็จ:/, 'Inventory registration failure must remain visible on its card');
assert.match(frontend, /data-ky-annual-admin-toolbar/, 'Annual Admin filters must use a sticky toolbar');
assert.match(frontend, /data-ky-annual-detail/, 'Annual evidence must expose a Detail Drawer action');
assert.match(frontend, /data-ky-inventory-detail/, 'Inventory evidence must expose a Detail Drawer action');
assert.match(frontend, /data-ky-cleanup-panel/, 'destructive actions must be isolated in Cleanup Queue');
assert.match(frontend, /data-ky-heatmap-department/, 'Heatmap must expose every canonical Department row for Browser UAT');
assert.match(frontend, /renderDepartmentDiagnostics/, 'Dashboard must render unmapped Department diagnostics');
assert.match(main, /ky\.js\?v=20260922-ky-inventory-feedback-r6/, 'cache chain must expose the truthful Inventory feedback bundle');
assert.match(index, /main\.js\?v=20260922-ky-inventory-feedback-r6/, 'HTML entry point must invalidate the cached main module');

async function verifyInventoryPickerCancelRecovery() {
    const start = frontend.indexOf('function chooseKyInventoryBackupFile()');
    const end = frontend.indexOf('\nfunction filterKyVideoInventory()', start);
    assert.ok(start >= 0 && end > start, 'Inventory picker implementation must be extractable for behavior testing');
    const pickerSource = frontend.slice(start, end);
    const created = [];
    const windowListeners = new Map();
    const context = {
        document: {
            createElement: () => {
                const listeners = new Map();
                const input = {
                    dataset: {},
                    files: [],
                    removed: false,
                    addEventListener: (name, handler) => listeners.set(name, handler),
                    click: () => {},
                    remove: () => { input.removed = true; },
                    dispatch: name => listeners.get(name)?.(),
                };
                created.push(input);
                return input;
            },
            body: { appendChild: () => {} },
        },
        window: {
            setTimeout,
            clearTimeout,
            addEventListener: (name, handler) => windowListeners.set(name, handler),
            removeEventListener: (name, handler) => {
                if (windowListeners.get(name) === handler) windowListeners.delete(name);
            },
        },
    };
    const chooseFile = vm.runInNewContext(`${pickerSource}; chooseKyInventoryBackupFile`, context);

    const firstChoice = chooseFile();
    assert.strictEqual(created.length, 1, 'first registration click must create a file picker');
    created[0].dispatch('cancel');
    assert.strictEqual(await firstChoice, null, 'cancelling the first picker must resolve without a file');
    assert.ok(created[0].removed, 'cancelled picker must be removed from the DOM');

    const secondChoice = chooseFile();
    assert.strictEqual(created.length, 2, 'a second registration click must create a fresh picker');
    created[1].dispatch('cancel');
    assert.strictEqual(await secondChoice, null, 'cancelling the second picker must also resolve');
    assert.ok(created[1].removed, 'second cancelled picker must leave no DOM residue');
}

verifyInventoryPickerCancelRecovery()
    .then(() => console.log('KY annual video evidence contract: PASS'))
    .catch(error => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
