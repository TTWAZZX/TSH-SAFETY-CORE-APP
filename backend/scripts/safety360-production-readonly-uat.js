'use strict';

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const base = String(process.env.PROD_UAT_URL || 'https://dev.tshpcl.com/safety/tsh-safety-core').replace(/\/+$/, '');
const adminId = String(process.env.PROD_UAT_ADMIN_ID || '').trim();
const adminPassword = String(process.env.PROD_UAT_ADMIN_PASSWORD || '');
const employeeId = String(process.env.SAFETY360_UAT_EMPLOYEE_ID || '002390').trim();
const year = Number(process.env.SAFETY360_UAT_YEAR || new Date().getFullYear());
const mode = process.argv.includes('--postdeploy') ? 'postdeploy' : 'predeploy';

async function request(relative, { method = 'GET', token, body } = {}) {
    const headers = { Accept: 'application/json', 'Cache-Control': 'no-cache' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${relative}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) {}
    return { response, payload, text };
}

async function main() {
    assert.ok(adminId && adminPassword, 'Production Admin UAT credentials are required');
    const login = await request('/api/login', { method: 'POST', body: { employeeId: adminId, password: adminPassword } });
    assert.strictEqual(login.response.status, 200, `Production login failed: ${login.text.slice(0, 500)}`);
    assert.ok(login.payload?.token, 'Production login token missing');
    assert.strictEqual(String(login.payload?.user?.Role || login.payload?.user?.role).toLowerCase(), 'admin', 'Production Admin role required');
    const token = login.payload.token;

    const [search, profile, workerRowsResponse, workerProgressResponse, unitTargetsResponse] = await Promise.all([
        request(`/api/person-search/employees?q=${encodeURIComponent(employeeId)}&department=all&page=1&limit=10`, { token }),
        request(`/api/person-search/profile/${encodeURIComponent(employeeId)}?year=${year}`, { token }),
        request('/api/cccf/form-a-worker', { token }),
        request(`/api/cccf/worker-progress?year=${year}`, { token }),
        request('/api/cccf/unit-targets', { token }),
    ]);
    assert.strictEqual(search.response.status, 200, `Production person search failed: ${search.text.slice(0, 500)}`);
    assert.strictEqual(profile.response.status, 200, `Production Safety 360 failed: ${profile.text.slice(0, 700)}`);
    assert.strictEqual(workerRowsResponse.response.status, 200, `Production CCCF Worker read failed: ${workerRowsResponse.text.slice(0, 500)}`);
    assert.strictEqual(workerProgressResponse.response.status, 200, `Production CCCF Worker progress failed: ${workerProgressResponse.text.slice(0, 500)}`);
    assert.strictEqual(unitTargetsResponse.response.status, 200, `Production CCCF unit targets failed: ${unitTargetsResponse.text.slice(0, 500)}`);
    const employees = search.payload?.data || [];
    const data = profile.payload?.data || {};
    const employee = employees.find(row => String(row.EmployeeID) === employeeId);
    assert.ok(employee, `Production search did not return ${employeeId}`);
    assert.strictEqual(data.employee?.EmployeeID, employeeId, 'Production profile EmployeeID mismatch');
    const workerRows = Array.isArray(workerRowsResponse.payload) ? workerRowsResponse.payload : (workerRowsResponse.payload?.data || []);
    const normalizeName = value => String(value || '').normalize('NFC').replace(/[\s\u200B-\u200D\uFEFF]+/gu, '').toLocaleLowerCase('th-TH');
    const normalizedName = normalizeName(data.employee?.EmployeeName);
    const normalizedFirstName = normalizeName(String(data.employee?.EmployeeName || '').split(/\s+/u)[0]);
    const numericId = String(Number(employeeId));
    const matchingWorkerRows = workerRows.filter(row => {
        const rowYear = Number(String(row.SubmitDate || '').slice(0, 4));
        const rowId = String(row.EmployeeID || '').trim();
        const rowName = normalizeName(row.EmployeeName);
        const creator = normalizeName(row.CreatedBy);
        const idMatch = rowId === employeeId || (/^\d+$/.test(rowId) && String(Number(rowId)) === numericId);
        const nameMatch = rowName === normalizedName || (normalizedFirstName && (rowName.includes(normalizedFirstName) || creator.includes(normalizedFirstName)));
        return rowYear === year && (idMatch || nameMatch);
    });
    const target = (data.activityTargets || []).find(row => row.activityKey === 'cccf_worker');
    assert.ok(target, 'Production CCCF Worker target missing');
    const workerProgress = workerProgressResponse.payload?.data || {};
    const progressEmployee = (workerProgress.employees || []).find(row => String(row.employeeId) === employeeId) || null;
    const progressUnit = (workerProgress.units || []).find(row => String(row.unit || '').trim() === String(data.employee?.Unit || '').trim()) || null;
    const unitTargets = Array.isArray(unitTargetsResponse.payload) ? unitTargetsResponse.payload : (unitTargetsResponse.payload?.data || []);
    const configuredUnitTarget = unitTargets.find(row => Number(row.target_year) === year && String(row.unit_name || '').trim() === String(data.employee?.Unit || '').trim()) || null;

    if (mode === 'postdeploy') {
        assert.ok(configuredUnitTarget, 'Production configured CCCF Unit target is required');
        assert.strictEqual(target.yearlyTarget, Number(configuredUnitTarget.yearly_target), 'Production Safety 360 must use the Unit denominator');
        assert.strictEqual(target.actualCount, Number(configuredUnitTarget.achieved_override), 'Production Safety 360 must use the Unit achieved override');
        assert.strictEqual(target.completionPct, 100, 'Production CCCF Worker must be 100%');
        assert.strictEqual(target.passed, true, 'Production CCCF Worker must pass');
        assert.strictEqual(target.noData, false, 'Production CCCF source must be available');
        assert.strictEqual(target.calculationMethod, 'cccf_worker_unit_achieved_override');
        assert.deepStrictEqual(target.calculationScope, { type: 'department_unit', department: data.employee.Department, unit: data.employee.Unit });
        assert.strictEqual(data.dataQuality?.status, 'complete', 'Production Safety 360 data sources must be complete');
    }

    console.log(JSON.stringify({
        success: true,
        mode,
        base,
        employee: { EmployeeID: data.employee.EmployeeID, EmployeeName: data.employee.EmployeeName },
        cccfWorker: {
            yearlyTarget: target.yearlyTarget,
            actualCount: target.actualCount,
            completionPct: target.completionPct,
            passPct: target.passPct,
            passed: target.passed,
            noData: target.noData,
            calculationMethod: target.calculationMethod || null,
            calculationScope: target.calculationScope || null,
            rawRecords: target.rawRecords ?? null,
            configuredCoverageTarget: target.configuredCoverageTarget ?? null,
        },
        dataQuality: data.dataQuality || null,
        metricsCccfWorker: data.metrics?.cccfWorker ?? null,
        matchingWorkerRows: matchingWorkerRows.map(row => ({
            id: row.id,
            EmployeeID: row.EmployeeID,
            EmployeeName: row.EmployeeName,
            Department: row.Department,
            SafetyUnit: row.SafetyUnit,
            SubmitDate: row.SubmitDate,
            CreatedBy: row.CreatedBy,
        })),
        workerProgressEmployee: progressEmployee,
        workerProgressUnit: progressUnit,
        configuredUnitTarget,
        activityTargetSummary: data.activityTargetSummary || null,
        mutations: 'none; normal Admin login audit side effect only',
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
