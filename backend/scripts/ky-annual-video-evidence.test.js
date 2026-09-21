const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
assert.match(frontend, /External Backup.*SHA-256|External Backup.*SHA/, 'UI must explain protected deletion eligibility');
assert.match(main, /ky\.js\?v=20260921-ky-annual-video-r1/, 'cache chain must expose the new KY bundle');
assert.match(index, /main\.js\?v=20260921-ky-annual-video-r1/, 'HTML entry point must invalidate the cached main module');

console.log('KY annual video evidence contract: PASS');
