const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'hiyari.js'), 'utf8');
const nodeRoute = fs.readFileSync(path.join(root, 'backend', 'routes', 'hiyari.js'), 'utf8');
const phpRoute = fs.readFileSync(path.join(root, 'api', 'handlers', 'workflow_phase6.php'), 'utf8');

const expectedFrontendParams = ['status', 'risk', 'dept', 'stopType', 'rank', 'month', 'area', 'year', 'q'];
for (const param of expectedFrontendParams) {
    assert.ok(frontend.includes(`params.set('${param}'`), `History UI must send ${param}`);
}

assert.ok(nodeRoute.includes('req.query.dept ?? req.query.department'), 'Node must accept dept and department aliases');
assert.ok(nodeRoute.includes('req.query.review ?? req.query.reviewStatus'), 'Node must accept review aliases');

const expectedPhpContracts = [
    "$_GET['dept']??($_GET['department']??null)",
    "$_GET['review']??($_GET['reviewStatus']??null)",
    "$_GET['stopType']??0",
    "$_GET['month']??0",
    "$_GET['area']??''",
    "$_GET['year']??0",
    "$_GET['q']??''",
    'AND StopType=?',
    'AND MONTH(ReportDate)=?',
    "COALESCE(NULLIF(TRIM(Location),''),'Unspecified')=?",
    'ReporterName LIKE ? OR Description LIKE ? OR Location LIKE ?',
];
for (const contract of expectedPhpContracts) {
    assert.ok(phpRoute.includes(contract), `PHP Production list route is missing: ${contract}`);
}

assert.ok(phpRoute.includes('wf_hiyari_visibility_clause($user)'), 'History filters must preserve viewer visibility rules');
assert.ok(phpRoute.includes('$pa=array_merge($pa,$visibleParams)'), 'Visibility parameters must remain parameterized after filters');

console.log('Hiyari History filter contract passed: frontend, Node, and PHP support the same filter set.');
