'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const baseUrl = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const year = new Date().getFullYear();
const checks = [];

function pass(name, details = '') {
    checks.push({ name, passed: true, details });
    console.log(`PASS ${name}${details ? ` — ${details}` : ''}`);
}

async function request(relative, { method = 'GET', token, body } = {}) {
    const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${relative}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { response, text, json };
}

async function staticText(relative) {
    const response = await fetch(`${baseUrl}${relative}${relative.includes('?') ? '&' : '?'}uat=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
    });
    assert.strictEqual(response.status, 200, `${relative} must return 200`);
    return response.text();
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required in backend/.env');

    const index = await staticText('/');
    assert.ok(index.includes('public/js/main.js?v=20260825-yokoten-department-relevance-r1'), 'Production index cache marker');
    pass('Production index cache marker');

    const mainSource = await staticText('/public/js/main.js');
    assert.ok(mainSource.includes('yokoten.js?v=20260825-yokoten-department-relevance-r1'), 'Production Yokoten cache marker');
    assert.ok(mainSource.includes('dashboard.js?v=20260822-cccf-shared-target-r4'), 'Production Dashboard cache marker');
    assert.ok(mainSource.includes('safety-culture.js?v=20260824-safety-culture-ppe-form-r1'), 'Production Safety Culture cache marker');
    pass('Production module cache markers');

    const safetyCultureSource = await staticText('/public/js/pages/safety-culture.js');
    for (const marker of [
        "let _asmtView = 'history'",
        "let _asmtTableMode = 'compact'",
        'data-asmt-view=',
        'data-asmt-table-mode=',
        'sc-asmt-page-size',
        'const columnWidths',
    ]) {
        assert.ok(safetyCultureSource.includes(marker), `Production Safety Culture Assessment marker missing: ${marker}`);
    }
    pass('Production Safety Culture Assessment layout markers', 'History, Overview, Setup, detailed scores, pagination');
    for (const marker of [
        "stepper.id = 'sc-ppef-stepper'",
        "['3', 'ผลตรวจ PPE', 'Checklist']",
        'form.insertBefore(checklistSection, evidenceSection)',
        'data-ppe-status-option="compliant"',
        'value="na" checked class="accent-slate-400 sc-ppe-radio"',
        "API.post('/safety-culture/ppe-inspections', payload)",
    ]) {
        assert.ok(safetyCultureSource.includes(marker), `Production Safety Culture PPE marker missing: ${marker}`);
    }
    pass('Production Safety Culture PPE form markers', 'three steps, checklist controls, N/A default, API unchanged');

    const yokotenSource = await staticText('/public/js/pages/yokoten.js');
    assert.ok(yokotenSource.includes('data-selection-mode="all"'), 'Yokoten select-all control');
    assert.ok(yokotenSource.includes("choice.responded ? 'bg-slate-50 text-slate-400 cursor-not-allowed'"), 'Yokoten answered Department lock');
    pass('Production Yokoten bulk-response controls');
    for (const marker of [
        'yok-admin-coverage-year',
        'yok-admin-coverage-risk',
        'yok-topic-coverage-export',
        'yok-topic-reminder-all',
        'yok-topic-respond-behalf-btn',
    ]) {
        assert.ok(yokotenSource.includes(marker), `Production Topic Coverage marker missing: ${marker}`);
    }
    pass('Production Yokoten Topic Coverage follow-up controls', 'year, risk, Excel, Reminder, response-on-behalf');
    for (const marker of [
        'data-dept-chart-mode="relevance"',
        'yok-dept-relevance-filter',
        "const filterByDataset = ['related', 'not_related', 'incomplete']",
        "if (!item?.responded) return 'incomplete'",
    ]) {
        assert.ok(yokotenSource.includes(marker), `Production Department relevance marker missing: ${marker}`);
    }
    pass('Production Yokoten Department relevance controls', 'stacked chart, full-Unit classification, Department drill-down');

    const dashboardSource = await staticText('/public/js/pages/dashboard.js');
    assert.ok(dashboardSource.includes('const metric = d.moduleMetrics?.[m.hash] || null'), 'Dashboard canonical metric source');
    pass('Production Dashboard canonical moduleMetrics rendering');

    const login = await request('/api/login', {
        method: 'POST',
        body: { employeeId: adminId, password: adminPassword },
    });
    assert.strictEqual(login.response.status, 200, `Admin login failed: ${login.text.slice(0, 300)}`);
    assert.strictEqual(login.json?.user?.Role || login.json?.user?.role, 'Admin', 'UAT account must be Admin');
    const token = login.json?.token;
    assert.ok(token, 'Admin login token missing');
    pass('Authenticated Production Admin login', 'expected login audit side effect only');

    const dashboard = await request('/api/dashboard/overview', { token });
    assert.strictEqual(dashboard.response.status, 200, `Dashboard overview failed: ${dashboard.text.slice(0, 300)}`);
    const data = dashboard.json?.data;
    const matrix = data?.complianceMatrix;
    const moduleMetrics = data?.moduleMetrics;
    const expectedModuleKeys = [
        'patrol', 'hiyari', 'ky', 'cccf', 'yokoten', 'training', 'accident', 'fourm',
        'kpi', 'policy', 'committee', 'machine-safety', 'ojt', 'contractor', 'safety-culture',
    ];
    const requiredMetricFields = [
        'key', 'metricType', 'numerator', 'denominator', 'percent', 'value', 'unit',
        'source', 'scope', 'dataAvailable', 'status', 'statusReason', 'asOf',
    ];
    assert.deepStrictEqual(Object.keys(moduleMetrics || {}).sort(), [...expectedModuleKeys].sort(), 'Canonical module metric keys');
    for (const key of expectedModuleKeys) {
        const metric = moduleMetrics[key];
        for (const field of requiredMetricFields) {
            assert.ok(Object.prototype.hasOwnProperty.call(metric || {}, field), `${key}.${field} missing`);
        }
        if (metric.metricType === 'progress' && metric.dataAvailable && Number(metric.denominator) > 0) {
            const expected = Math.round(
                Math.min(Math.max(Number(metric.numerator), 0), Number(metric.denominator))
                / Number(metric.denominator)
                * 100
            );
            assert.strictEqual(Number(metric.percent), expected, `${key} percentage formula`);
        }
    }
    assert.ok(
        String(moduleMetrics.hiyari.source?.description || '').includes('Admin Hiyari assignments'),
        'Hiyari source must be Admin assignments'
    );
    assert.strictEqual(Number(data?.hiyari?.assignmentTarget), Number(moduleMetrics.hiyari.denominator), 'Hiyari target parity');
    assert.strictEqual(Number(data?.hiyari?.assignmentClosed), Number(moduleMetrics.hiyari.numerator), 'Hiyari closed parity');
    pass(
        'Production canonical Module Health metrics',
        `${expectedModuleKeys.length} cards; Hiyari ${moduleMetrics.hiyari.numerator}/${moduleMetrics.hiyari.denominator} = ${moduleMetrics.hiyari.percent}%`
    );
    assert.ok(Array.isArray(matrix) && matrix.length > 0, 'Dashboard matrix is empty');
    assert.strictEqual(data?.config?.cccfWorkerSource, 'manual_unit_target', 'CCCF source must be manual Unit targets');
    const visible = ['activityTargets', 'cccfWorker', 'cccfPermanent', 'patrolIssues', 'hiyari', 'ky', 'yokoten', 'training', 'accident', 'ojt'];
    for (const row of matrix) {
        for (const column of visible) {
            assert.ok(Object.prototype.hasOwnProperty.call(row, column), `${column} missing for ${row.department}`);
            assert.ok(Object.prototype.hasOwnProperty.call(row.coverageMeta || {}, column), `${column} metadata missing for ${row.department}`);
        }
        const metric = row.coverageMeta.cccfWorker;
        if (metric?.denominator > 0) {
            const expected = Math.max(0, Math.min(100, Math.round((Number(metric.numerator) / Number(metric.denominator)) * 100)));
            assert.strictEqual(row.cccfWorker, expected, `CCCF percentage mismatch for ${row.department}`);
        }
    }
    const positiveCccf = matrix.filter(row => Number(row.cccfWorker) > 0);
    assert.ok(positiveCccf.length > 0, 'Production CCCF Manual is still all zero');
    pass('Production Dashboard coverage matrix', `${matrix.length} departments; ${positiveCccf.length} CCCF rows above 0%`);

    const personalTargets = await request('/api/activity-targets/me', { token });
    assert.strictEqual(personalTargets.response.status, 200, `Personal Targets failed: ${personalTargets.text.slice(0, 300)}`);
    const personalData = personalTargets.json?.data;
    assert.ok(Array.isArray(personalData?.targets) && personalData.targets.length >= 1, 'Personal Targets are empty');
    const mandatoryPolicy = personalData.targets.find(target => target.activityKey === 'policy_acknowledgement');
    assert.ok(mandatoryPolicy?.isMandatory, 'Mandatory Safety Policy target missing');
    const additionalTargets = personalData.targets.filter(target => !target.isMandatory);
    assert.strictEqual(
        Number(personalData.eligibility?.additionalConfiguredTargets),
        additionalTargets.length,
        'Admin-configured Personal Target count'
    );
    assert.strictEqual(
        Boolean(personalData.eligibility?.hasAdditionalConfiguredTargets),
        additionalTargets.length > 0,
        'Personal Target eligibility flag'
    );
    pass('Production Personal Target eligibility', `1 mandatory + ${additionalTargets.length} Admin-configured`);

    const companyOverview = await request(`/api/yokoten/company-overview?year=${year}`, { token });
    assert.strictEqual(companyOverview.response.status, 200, `Yokoten company overview failed: ${companyOverview.text.slice(0, 300)}`);
    const companyRows = companyOverview.json?.data?.departments || [];
    const companyMap = new Map(companyRows.map(row => [String(row.department || '').trim().toUpperCase(), Number(row.completionPct)]));
    let compared = 0;
    for (const row of matrix) {
        const expected = companyMap.get(String(row.department || '').trim().toUpperCase());
        if (expected === undefined || row.yokoten === null) continue;
        assert.strictEqual(Number(row.yokoten), expected, `Yokoten dashboard/module mismatch for ${row.department}`);
        compared += 1;
    }
    assert.ok(compared > 0, 'No Yokoten department rows were comparable');
    pass('Yokoten Dashboard/module parity', `${compared} departments`);

    const responseCountBefore = await request('/api/yokoten/all-responses', { token });
    assert.strictEqual(responseCountBefore.response.status, 200, `Yokoten response count failed: ${responseCountBefore.text.slice(0, 300)}`);
    const beforeCount = Array.isArray(responseCountBefore.json?.data) ? responseCountBefore.json.data.length : 0;
    const invalidSubmit = await request('/api/yokoten/respond', { method: 'POST', token, body: {} });
    assert.strictEqual(invalidSubmit.response.status, 400, `Invalid Yokoten submit must fail validation without a write: ${invalidSubmit.text.slice(0, 300)}`);
    const responseCountAfter = await request('/api/yokoten/all-responses', { token });
    assert.strictEqual(responseCountAfter.response.status, 200, `Yokoten response re-count failed: ${responseCountAfter.text.slice(0, 300)}`);
    const afterCount = Array.isArray(responseCountAfter.json?.data) ? responseCountAfter.json.data.length : 0;
    assert.strictEqual(afterCount, beforeCount, 'Invalid Yokoten submit changed response data');
    pass('Production Yokoten submit validation', `HTTP 400; response count unchanged ${beforeCount}/${afterCount}`);

    const outboxBefore = await request('/api/yokoten/email-outbox?limit=200', { token });
    assert.strictEqual(outboxBefore.response.status, 200, `Yokoten outbox read failed: ${outboxBefore.text.slice(0, 300)}`);
    const beforeOutboxCount = Array.isArray(outboxBefore.json?.data) ? outboxBefore.json.data.length : 0;
    const invalidReminder = await request('/api/yokoten/reminders/send', { method: 'POST', token, body: {} });
    assert.strictEqual(invalidReminder.response.status, 400, `Invalid Reminder request must fail before send: ${invalidReminder.text.slice(0, 300)}`);
    const outboxAfter = await request('/api/yokoten/email-outbox?limit=200', { token });
    assert.strictEqual(outboxAfter.response.status, 200, `Yokoten outbox re-read failed: ${outboxAfter.text.slice(0, 300)}`);
    const afterOutboxCount = Array.isArray(outboxAfter.json?.data) ? outboxAfter.json.data.length : 0;
    assert.strictEqual(afterOutboxCount, beforeOutboxCount, 'Invalid Reminder request changed the Production outbox');
    pass('Production Yokoten Reminder route', `Admin validation HTTP 400; outbox unchanged ${beforeOutboxCount}/${afterOutboxCount}`);

    const outputDir = path.join(
        path.resolve(__dirname, '..', '..'),
        'backups',
        'production',
        `yokoten-dashboard-readonly-uat-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}`
    );
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify({
        production: baseUrl,
        executedAt: new Date().toISOString(),
        authenticated: true,
        businessDataWrites: false,
        expectedSideEffects: ['successful login audit/attempt record', 'normal login housekeeping'],
        moduleMetrics,
        personalTargetEligibility: personalData.eligibility,
        yokotenResponseCountBefore: beforeCount,
        yokotenResponseCountAfter: afterCount,
        yokotenOutboxCountBefore: beforeOutboxCount,
        yokotenOutboxCountAfter: afterOutboxCount,
        matrix: matrix.map(row => ({
            department: row.department,
            cccfWorker: row.cccfWorker,
            cccfNumerator: row.coverageMeta?.cccfWorker?.numerator ?? null,
            cccfDenominator: row.coverageMeta?.cccfWorker?.denominator ?? null,
            yokoten: row.yokoten,
        })),
        checks,
        passed: true,
    }, null, 2));
    console.log(`ARTIFACT ${outputDir}`);
}

main().catch(error => {
    console.error(`FAIL ${error.stack || error.message || error}`);
    process.exit(1);
});
