const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'ky.js'), 'utf8');
const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'ky.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'workflow_phase6.php'), 'utf8');

const frontendParams = ['status', 'dateFrom', 'dateTo', 'year', 'department', 'depts', 'riskCategory', 'source', 'evidence', 'q'];
for (const param of frontendParams) {
    assert.ok(frontend.includes(`params.set('${param}'`), `KY History UI must send ${param}`);
}

for (const contract of [
    'req.query.department || req.query.dept',
    'req.query.riskCategory || req.query.risk',
    "source === 'admin'",
    "source === 'self'",
    "evidence === 'complete'",
    "evidence === 'waiting_video'",
    "evidence === 'no_video'",
    "evidence === 'missing_file'",
    'ActivityDate BETWEEN ? AND ?',
    'ReporterName LIKE ? OR SubmittedByName LIKE ?',
]) {
    assert.ok(nodeRoute.includes(contract), `Node KY list route is missing: ${contract}`);
}

for (const contract of [
    "$_GET['department']??($_GET['dept']??'')",
    "$_GET['riskCategory']??($_GET['risk']??'')",
    "$_GET['depts']",
    "$_GET['dateFrom']",
    "$_GET['dateTo']",
    "$_GET['source']",
    "$_GET['evidence']",
    "$_GET['q']",
    'SubmittedByID IS NOT NULL AND SubmittedByID<>ReporterID',
    "COALESCE(TRIM(AttachmentUrl),'')<>''",
    'ActivityDate BETWEEN ? AND ?',
    'ReporterName LIKE ? OR SubmittedByName LIKE ?',
]) {
    assert.ok(phpRoute.includes(contract), `PHP Production KY list route is missing: ${contract}`);
}

assert.ok(frontend.includes("e.target.closest('#ky-history-clear')"), 'KY History must provide one-action filter reset');
assert.ok(frontend.includes('requestId !== _historyRequestSeq'), 'KY History must ignore stale search responses');
assert.ok(frontend.includes('วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด'), 'KY History must validate reversed date ranges');
assert.ok(frontend.includes('พบ ${records.length.toLocaleString'), 'KY History must announce the filtered result count');

console.log('KY History filter contract passed: UI, Node, and PHP support the complete filter/search set.');
