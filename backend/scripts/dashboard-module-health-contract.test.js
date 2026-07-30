'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const contractPath = path.join(root, 'config', 'dashboard-module-health-contract.json');
const frontendPath = path.join(root, 'public', 'js', 'pages', 'dashboard.js');
const nodePath = path.join(root, 'backend', 'routes', 'dashboard.js');
const phpPath = path.join(root, 'api', 'index.php');
const targetNodePath = path.join(root, 'backend', 'routes', 'activity-targets.js');
const targetPhpPath = path.join(root, 'api', 'handlers', 'targets.php');

const read = file => fs.readFileSync(file, 'utf8');
const contract = JSON.parse(read(contractPath));
const frontend = read(frontendPath);
const nodeSource = read(nodePath);
const phpSource = read(phpPath);
const targetNode = read(targetNodePath);
const targetPhp = read(targetPhpPath);

const EXPECTED_MODULES = [
    'patrol',
    'hiyari',
    'ky',
    'cccf',
    'yokoten',
    'training',
    'accident',
    'fourm',
    'kpi',
    'policy',
    'committee',
    'machine-safety',
    'ojt',
    'contractor',
    'safety-culture',
];

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertContractShape() {
    assert.match(contract.contractVersion, /^D4-\d{4}-\d{2}-\d{2}$/);
    assert.strictEqual(contract.route, '/api/dashboard/overview');
    assert.deepStrictEqual(
        contract.modules.map(module => module.key),
        EXPECTED_MODULES,
        'Contract must list all 15 Module Health cards in frontend order'
    );
    assert.strictEqual(new Set(contract.modules.map(module => module.key)).size, EXPECTED_MODULES.length);
    assert.ok(contract.requiredMetricFields.includes('numerator'));
    assert.ok(contract.requiredMetricFields.includes('denominator'));
    assert.ok(contract.requiredMetricFields.includes('percent'));
    assert.ok(contract.requiredMetricFields.includes('dataAvailable'));
    assert.ok(contract.statuses.includes('N_A'));
    assert.ok(contract.statuses.includes('DATA_UNAVAILABLE'));
    assert.strictEqual(contract.percentageRules.scaleMinimum, 0);
    assert.strictEqual(contract.percentageRules.scaleMaximum, 100);
    assert.strictEqual(contract.percentageRules.zeroDenominator, 'N_A');

    for (const module of contract.modules) {
        assert.ok(contract.metricTypes.includes(module.metricType), `${module.key}: valid metricType`);
        assert.ok(['required', 'not_applicable'].includes(module.percentagePolicy), `${module.key}: valid percentagePolicy`);
        assert.ok(module.current?.sourceTables?.length, `${module.key}: current source tables`);
        assert.ok(module.current?.calculation, `${module.key}: current calculation`);
        assert.ok(module.current?.knownGap, `${module.key}: current gap`);
        assert.ok(module.target?.sourceTables?.length, `${module.key}: target source tables`);
        assert.ok(module.target?.numerator, `${module.key}: target numerator/value`);
        assert.ok(module.target?.yearScope, `${module.key}: target year scope`);
        assert.strictEqual(module.implementationState, 'implemented_d4', `${module.key}: D4 implementation state`);

        if (module.metricType === 'progress') {
            assert.strictEqual(module.percentagePolicy, 'required', `${module.key}: progress requires percentage`);
            assert.ok(module.target.denominator, `${module.key}: progress denominator`);
            assert.ok(module.target.formula, `${module.key}: progress formula`);
            assert.strictEqual(module.target.zeroDenominator, 'N_A', `${module.key}: zero denominator semantics`);
        } else {
            assert.strictEqual(module.percentagePolicy, 'not_applicable', `${module.key}: no synthetic percentage`);
            assert.strictEqual(module.target.denominator, null, `${module.key}: denominator must be null`);
            assert.strictEqual(module.target.formula, null, `${module.key}: formula must be null`);
        }
    }
}

function assertRuntimeSurfaceMapping() {
    for (const module of contract.modules) {
        const frontendHash = new RegExp(`hash:\\s*['"]${escapeRegex(module.frontendHash)}['"]`);
        const nodeKey = new RegExp(`\\b${escapeRegex(module.responseKey)}\\s*:`);
        const phpKey = new RegExp(`['"]${escapeRegex(module.responseKey)}['"]\\s*=>`);

        assert.match(frontend, frontendHash, `${module.key}: frontend card exists`);
        assert.match(nodeSource, nodeKey, `${module.key}: Node overview response exists`);
        assert.match(phpSource, phpKey, `${module.key}: PHP overview response exists`);
    }
}

function assertD2BackendCorrections() {
    const checks = [
        ['Node canonical moduleMetrics response', nodeSource.includes('moduleMetrics,')],
        ['PHP canonical moduleMetrics response', phpSource.includes("'moduleMetrics' => $moduleMetrics")],
        ['Node Patrol uses same-unit roster progress', nodeSource.includes('buildPatrolCompanyProgress(year)')],
        ['PHP Patrol uses same-unit roster progress', phpSource.includes('dashboard_patrol_company_progress($year)')],
        ['Node Hiyari uses Admin assignment progress', nodeSource.includes('buildHiyariCompanyProgress(year)')
            && nodeSource.includes('current Admin Hiyari assignments')],
        ['PHP Hiyari uses Admin assignment progress', phpSource.includes('$hiyariAssignmentTarget')
            && phpSource.includes('current Admin Hiyari assignments')],
        ['Node Yokoten uses Department-topic pairs', nodeSource.includes('assignedPairs: moduleMetrics.yokoten.denominator')],
        ['PHP Yokoten uses Department-topic pairs', phpSource.includes("'assignedPairs'=>$moduleMetrics['yokoten']['denominator']")],
        ['Node mixed-unit formulas removed', !nodeSource.includes('patrolAttended / (patrolSessions * 1)')
            && !nodeSource.includes('(yokotenResponded / yokotenTopics) * 100')],
        ['PHP hardcoded 4M metrics removed', !phpSource.includes("'trainingRequired' => 0")
            && !phpSource.includes("'curriculums' => 0")],
        ['PHP current policy acknowledgements scoped', phpSource.includes('COUNT(DISTINCT pa.UserID)')
            && phpSource.includes('p.IsCurrent=1')],
    ];

    for (const [label, present] of checks) {
        assert.ok(present, label);
    }
    return checks.map(([label]) => label);
}

function assertD3PersonalTargetEligibility() {
    const checks = [
        ['Node mandatory Policy baseline', targetNode.includes('mandatoryPolicyTarget')],
        ['PHP mandatory Policy baseline', targetPhp.includes('$mandatoryPolicyTarget')],
        ['Node Admin-configured eligibility filter', targetNode.includes('isAdminConfiguredTargetEligible')],
        ['PHP Admin-configured eligibility filter', targetPhp.includes('personal_target_admin_eligibility')],
        ['Node Personal Target eligibility metadata', targetNode.includes('NO_ADDITIONAL_ADMIN_TARGETS')],
        ['PHP Personal Target eligibility metadata', targetPhp.includes('NO_ADDITIONAL_ADMIN_TARGETS')],
        ['Node dynamic targets no longer default to system source', !targetNode.includes("a.metricType === 'dynamic_ratio' ? 'system' : 'none'")],
        ['PHP dynamic targets no longer default to system source', !targetPhp.includes("($isDynamic ? 'system' : 'missing')")],
    ];
    for (const [label, present] of checks) assert.ok(present, label);
    return checks.map(([label]) => label);
}

function assertD4FrontendConsumption() {
    const checks = [
        ['Frontend reads canonical moduleMetrics', frontend.includes('const metric = d.moduleMetrics?.[m.hash] || null')
            && frontend.includes('metric,')],
        ['Frontend uses canonical metric status', frontend.includes("const statusCode = MODULE_HEALTH_STATUS[metric?.status]")],
        ['Frontend exposes N/A signal', frontend.includes("_moduleSignalPill('N/A'")],
        ['Frontend exposes unavailable signal', frontend.includes("_moduleSignalPill('Unavailable'")],
        ['Frontend no longer defaults non-evaluable cards to On Track', !frontend.includes("const status = isCritical ? 'Critical' : isWatch ? 'Watch' : 'On Track'")],
        ['Frontend renders no-additional-target eligibility notice', frontend.includes('Company baseline only')],
    ];
    for (const [label, present] of checks) assert.ok(present, label);
    return checks.map(([label]) => label);
}

function main() {
    assertContractShape();
    assertRuntimeSurfaceMapping();
    const correctionChecks = assertD2BackendCorrections();
    const eligibilityChecks = assertD3PersonalTargetEligibility();
    const frontendChecks = assertD4FrontendConsumption();

    console.log(`Dashboard Module Health D1-D4 contract passed (${contract.contractVersion})`);
    console.log(`PASS ${contract.modules.length}/${EXPECTED_MODULES.length} module source mappings`);
    console.log(`PASS ${contract.requiredMetricFields.length} canonical metric fields`);
    console.log(`PASS ${correctionChecks.length} backend correction checks`);
    console.log(`PASS ${eligibilityChecks.length} Personal Target eligibility checks`);
    console.log(`PASS ${frontendChecks.length} frontend canonical-consumption checks`);
}

main();
