const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/ky.js');
const phpRoute = read('api/handlers/workflow_phase6.php');
const page = read('public/js/pages/ky.js');

for (const [label, source] of [['Node', nodeRoute], ['PHP', phpRoute]]) {
    assert(source.includes('KY_ACTIVITY_VOID_DUPLICATE'), `${label}: duplicate void audit is required`);
    assert(source.includes("Status='Voided'") || source.includes("Status = 'Voided'"), `${label}: protected delete must void the activity`);
    assert(source.includes("Status<>'Voided'") || source.includes("Status <> 'Voided'"), `${label}: active queries must exclude voided activities`);
    assert(source.includes('excludedFromStatistics'), `${label}: audit must record statistics exclusion`);
}

assert(phpRoute.includes('1 เดือน / 1 เรื่อง'), 'PHP: monthly duplicate prevention is required');
assert(phpRoute.includes('YearlyTarget FROM ky_program_config'), 'PHP: annual target parity is required');
assert(page.includes("body: JSON.stringify({ reason: reason.trim() })"), 'UI: delete must send the admin reason');
assert(page.includes('ออกจากประวัติและสถิติ'), 'UI: confirmation must disclose statistics behavior');

console.log('KY duplicate void contract: PASS');
