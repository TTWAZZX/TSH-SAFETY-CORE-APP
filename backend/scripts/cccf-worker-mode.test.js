'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const cccfSource = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'cccf.js'), 'utf8');
const dashboardFrontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'dashboard.js'), 'utf8');
const dashboardNode = fs.readFileSync(path.join(root, 'backend', 'routes', 'dashboard.js'), 'utf8');
const adminNode = fs.readFileSync(path.join(root, 'backend', 'routes', 'admin.js'), 'utf8');
const dashboardPhp = fs.readFileSync(path.join(root, 'api', 'handlers', 'platform.php'), 'utf8');
const dashboardPhpIndex = fs.readFileSync(path.join(root, 'api', 'index.php'), 'utf8');
const adminPhp = fs.readFileSync(path.join(root, 'api', 'handlers', 'admin_phase8.php'), 'utf8');

function extractFunction(source, name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notStrictEqual(start, -1, `Missing ${name}()`);
    const paramsStart = source.indexOf('(', start);
    let paramsDepth = 0;
    let paramsEnd = -1;
    for (let index = paramsStart; index < source.length; index += 1) {
        if (source[index] === '(') paramsDepth += 1;
        if (source[index] === ')') paramsDepth -= 1;
        if (paramsDepth === 0) { paramsEnd = index; break; }
    }
    const braceStart = source.indexOf('{', paramsEnd);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Could not extract ${name}()`);
}

const context = vm.createContext({ Date, String, Number, Array, Set });
vm.runInContext(`
    ${extractFunction(cccfSource, 'normalizeCccfWorkerSource')}
    ${extractFunction(cccfSource, 'resolveCccfWorkerSource')}
    ${extractFunction(cccfSource, 'hasAdminRole')}
    ${extractFunction(cccfSource, 'resolveCccfAuthContext')}
    ${extractFunction(cccfSource, 'cccfWorkerPersonKey')}
    ${extractFunction(cccfSource, 'countDistinctCccfWorkerSubmitters')}
    ${extractFunction(dashboardFrontend, 'resolveDashboardCccfWorkerSource')}
    ${extractFunction(dashboardNode, 'resolveCccfWorkerSource')}
    ${extractFunction(adminNode, 'resolveSafetyCoreCccfWorkerSource')}
`, context);

const authCases = [
    { user: null, expected: false },
    { user: { role: 'Admin' }, expected: true },
    { user: { Role: 'Admin' }, expected: true },
    { user: { role: 'admin' }, expected: true },
    { user: { isAdmin: true, role: 'User' }, expected: true },
    { user: { role: 'User' }, expected: false },
];
for (const authCase of authCases) {
    context.authUser = authCase.user;
    assert.strictEqual(
        vm.runInContext('resolveCccfAuthContext(authUser).isAdmin', context),
        authCase.expected,
        `Unexpected CCCF admin resolution for ${JSON.stringify(authCase.user)}`
    );
}

const authRefreshContext = vm.createContext({
    sessionUser: null,
    TSHSession: { getUser: () => authRefreshContext.sessionUser },
});
vm.runInContext(`
    let currentUser = { role: 'User' };
    let isAdmin = false;
    ${extractFunction(cccfSource, 'hasAdminRole')}
    ${extractFunction(cccfSource, 'resolveCccfAuthContext')}
    ${extractFunction(cccfSource, 'refreshCccfAuthContext')}
`, authRefreshContext);
authRefreshContext.sessionUser = { id: 'ADMIN01', role: 'Admin' };
assert.strictEqual(vm.runInContext('refreshCccfAuthContext(); isAdmin', authRefreshContext), true, 'Same-page Admin login must enable CCCF Admin UI without refresh');
authRefreshContext.sessionUser = { id: 'USER01', role: 'User' };
assert.strictEqual(vm.runInContext('refreshCccfAuthContext(); isAdmin', authRefreshContext), false, 'Same-page User login must remove CCCF Admin UI without refresh');

const loadCccfPageSource = extractFunction(cccfSource, 'loadCccfPage');
assert.ok(
    loadCccfPageSource.indexOf('refreshCccfAuthContext();') < loadCccfPageSource.indexOf("API.get('/cccf/form-a-worker')"),
    'CCCF must refresh the session role before choosing Admin/User API requests'
);

const cases = [
    { config: {}, year: 2026, expected: 'manual_unit_target' },
    { config: { cccfWorkerSource: 'actual_department_worker' }, year: 2026, expected: 'actual_department_worker' },
    { config: { cccfWorkerSource: 'actual_department_worker', cccfWorkerSourceByYear: { 2026: 'manual_unit_target' } }, year: 2026, expected: 'manual_unit_target' },
    { config: { cccfWorkerSource: 'manual_unit_target', cccfWorkerSourceByYear: { 2027: 'actual_department_worker' } }, year: 2027, expected: 'actual_department_worker' },
    { config: { cccfWorkerSource: 'invalid', cccfWorkerSourceByYear: { 2026: 'invalid' } }, year: 2026, expected: 'manual_unit_target' },
];

for (const testCase of cases) {
    context.testConfig = testCase.config;
    context.testYear = testCase.year;
    assert.strictEqual(vm.runInContext('resolveCccfWorkerSource(testConfig, testYear)', context), testCase.expected);
    assert.strictEqual(vm.runInContext('resolveDashboardCccfWorkerSource(testConfig, testYear)', context), testCase.expected);
    assert.strictEqual(vm.runInContext('resolveSafetyCoreCccfWorkerSource(testConfig, testYear)', context), testCase.expected);
}

context.workerRows = [
    { id: 1, EmployeeID: '001001', EmployeeName: 'คนที่หนึ่ง' },
    { id: 2, EmployeeID: '001001', EmployeeName: 'คนที่หนึ่ง' },
    { id: 3, EmployeeID: '', EmployeeName: 'Legacy User' },
    { id: 4, EmployeeID: null, EmployeeName: ' legacy user ' },
    { id: 5, EmployeeID: '', EmployeeName: '', SafetyUnit: 'Unit A' },
];
assert.strictEqual(
    vm.runInContext('countDistinctCccfWorkerSubmitters(workerRows)', context),
    3,
    'Actual Worker achieved must count unique submitters, including stable legacy fallbacks'
);

const phpCandidates = [process.env.PHP_BIN, 'C:\\xampp\\php\\php.exe', 'php'].filter(Boolean);
const phpBin = phpCandidates.find(candidate => candidate === 'php' || fs.existsSync(candidate));
assert.ok(phpBin, 'PHP runtime is required for CCCF worker-mode parity');
const phpResult = spawnSync(phpBin, [path.join(__dirname, 'cccf-worker-mode-fixture.php')], {
    cwd: root,
    input: JSON.stringify(cases),
    encoding: 'utf8',
});
assert.strictEqual(phpResult.status, 0, phpResult.stderr || 'PHP CCCF worker-mode fixture failed');
assert.deepStrictEqual(JSON.parse(phpResult.stdout), cases.map(testCase => ({
    dashboard: testCase.expected,
    safetyCoreData: testCase.expected,
})));

assert.ok(cccfSource.includes('id="cccf-worker-mode-panel"'), 'Worker mode must be visible above the mode-specific surfaces');
assert.ok(cccfSource.includes("class=\"${isActualWorkerMode ? 'space-y-5' : 'hidden'}\""), 'Actual-only overview must hide in Manual mode');
assert.ok(cccfSource.includes('id="cccf-manual-legacy-records"'), 'Admin must retain a collapsed view of legacy Actual records');
assert.ok(cccfSource.includes('ไม่นำมาคำนวณในโหมด Manual / Override'), 'Manual mode must explain that legacy Actual rows are excluded');
assert.ok(cccfSource.includes("await API.post('/cccf/form-a-worker', formData)"), 'Existing Worker submission flow must remain intact');
assert.ok(cccfSource.includes('renderCccfFormsUserCard(_cccfForms)'), 'Existing related-form surface must remain intact in Actual mode');
assert.ok(cccfSource.includes('const achievedComputed = countDistinctCccfWorkerSubmitters(yearData);'), 'Worker Unit summary must count distinct actual submitters');
assert.ok(cccfSource.includes("{ label: 'ต้องส่งทั้งหมด'"), 'Worker Unit summary must lead with the shared Unit target');
assert.ok(cccfSource.includes("{ label: 'ยังไม่ส่ง'"), 'Worker Unit summary must expose remaining submissions directly');
assert.ok(cccfSource.includes('>ความคืบหน้า</th>'), 'Worker Unit table must expose progress at a glance');
assert.ok(cccfSource.includes('<details class="mb-5') && cccfSource.includes('รายละเอียดตรวจสอบสำหรับแอดมิน'), 'Actual diagnostic data must remain available in an Admin-only collapsed disclosure');
assert.ok(cccfSource.includes("const isActual = _cccfWorkerSource === 'actual_department_worker';"), 'Worker PDF must resolve the selected annual mode');
assert.ok(cccfSource.includes('const modeCode = isActual ? \'ACT\' : \'MNL\';'), 'Worker PDF document number must identify Manual or Actual mode');
assert.ok(cccfSource.includes('const unitRowsPerPage = 16;') && cccfSource.includes('แสดงครบทุก Unit ที่มี Target หรือผลการดำเนินงาน'), 'Worker PDF must paginate and export every relevant Unit');
assert.ok(cccfSource.includes('CCCF Form A Worker - Unit Progress'), 'Manual and Actual PDFs must include the shared Unit-progress register');
assert.ok(cccfSource.includes('CCCF Form A Worker - Actual Records Detail'), 'Actual PDF must retain a dedicated record-detail section');
assert.ok(cccfSource.includes('ID: ${escapeHtml(r.EmployeeID') && cccfSource.includes("attachmentCount > 0 ? `${attachmentCount} ไฟล์` : 'ไม่มี'"), 'Actual PDF detail must include EmployeeID and attachment status');
assert.ok(cccfSource.includes("...(isActual ? detailPages : [])"), 'Manual PDF must omit Actual record-detail pages');
assert.ok(cccfSource.includes('position:fixed;left:0;top:0;width:794px;height:1122px') && cccfSource.includes('requestAnimationFrame(resolve)'), 'Worker PDF renderer must use an in-viewport fixed A4 origin to prevent clipped page headers');
assert.ok(cccfSource.includes('height:112px;box-sizing:border-box;position:relative') && cccfSource.includes('left:28px;right:28px;top:18px'), 'Worker PDF header content must use deterministic fixed-page positioning');
assert.ok(cccfSource.includes('headerCaptureLooksClipped') && cccfSource.includes('attempt <= 3'), 'Worker PDF renderer must validate and retry clipped header captures');
assert.ok(cccfSource.includes('id="btn-export-worker-pdf"'), 'Worker PDF export must remain available in both modes');
assert.ok(cccfSource.includes("document.getElementById('btn-export-worker-pdf')?.addEventListener('click'"), 'Worker PDF export must use the established listener binding');
assert.ok(cccfSource.includes('async function exportCccfWorkerPDF()'), 'Worker PDF export must have a direct lexical handler');
assert.ok(cccfSource.includes('window.exportCccfWorkerPDF = exportCccfWorkerPDF;'), 'Worker PDF export must preserve the legacy global alias');
assert.ok(cccfSource.includes("console.info('[cccf] Worker PDF export completed'"), 'Worker PDF export must expose completion telemetry without personal data');
assert.ok(/\$\{isActualWorkerMode \? `[\s\S]{0,80}<button id="btn-open-worker-form"/.test(cccfSource), 'Worker submit action must remain Actual-only');
assert.ok(dashboardNode.includes('cccfWorkerSourceByYear: sourceByYear'), 'Node config sanitizer must retain annual source selection');
assert.ok(dashboardPhp.includes("'cccfWorkerSourceByYear' => $sourceByYear"), 'PHP config sanitizer must retain annual source selection');
assert.ok(dashboardNode.includes('const cccfWorkerMetric = cccfWorkerByUnit.get(deptKey);'), 'Node Overview must use shared Unit targets in both modes');
assert.ok(dashboardPhpIndex.includes('$cccfWorkerMetric = $cccfWorkerByUnit[$deptKey] ?? null;'), 'PHP Overview must use shared Unit targets in both modes');
assert.ok(dashboardNode.includes("COUNT(DISTINCT COALESCE("), 'Node Overview Actual achieved must count distinct submitters');
assert.ok(dashboardPhpIndex.includes('COUNT(DISTINCT COALESCE('), 'PHP Overview Actual achieved must count distinct submitters');
assert.ok(adminNode.includes('cccfWorkerSource,'), 'Node Safety Core Data must expose its resolved Worker source');
assert.ok(adminPhp.includes("'cccfWorkerSource' => $cccfWorkerSource"), 'PHP Safety Core Data must expose its resolved Worker source');
assert.ok(adminNode.includes("key_name='cccf_unit_sel'"), 'Node Safety Core Data must honor the selected CCCF Unit scope');
assert.ok(adminPhp.includes("key_name='cccf_unit_sel'"), 'PHP Safety Core Data must honor the selected CCCF Unit scope');
assert.ok(adminNode.includes('COUNT(DISTINCT COALESCE('), 'Node Safety Core Data Actual achieved must count distinct submitters');
assert.ok(adminPhp.includes('COUNT(DISTINCT COALESCE('), 'PHP Safety Core Data Actual achieved must count distinct submitters');

console.log(`CCCF worker-mode regression passed: ${cases.length} annual fallback/parity cases, same-page Admin/User auth refresh, shared Unit targets, mode-aware PDF export, distinct Actual submitters, selected Unit scope, and Permanent/legacy preservation.`);
