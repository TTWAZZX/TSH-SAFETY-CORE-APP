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
    assert.ok(index.includes('public/js/main.js?v=20260723-yokoten-dashboard-source-fix'), 'Production index cache marker');
    pass('Production index cache marker');

    const mainSource = await staticText('/public/js/main.js');
    assert.ok(mainSource.includes('yokoten.js?v=20260723-yokoten-dashboard-source-fix'), 'Production Yokoten cache marker');
    assert.ok(mainSource.includes('dashboard.js?v=20260723-yokoten-dashboard-source-fix'), 'Production Dashboard cache marker');
    pass('Production module cache markers');

    const yokotenSource = await staticText('/public/js/pages/yokoten.js');
    assert.ok(yokotenSource.includes('data-selection-mode="all"'), 'Yokoten select-all control');
    assert.ok(yokotenSource.includes('input[name="${groupName}"]:not(:disabled)'), 'Yokoten unanswered-only selection');
    pass('Production Yokoten bulk-response controls');

    const dashboardSource = await staticText('/public/js/pages/dashboard.js');
    assert.ok(dashboardSource.includes('row.coverageMeta?.[key]'), 'Dashboard source metadata tooltip');
    pass('Production Dashboard coverage tooltip');

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
