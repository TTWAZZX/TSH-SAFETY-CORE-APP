'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const dashboardRoute = require('../routes/dashboard');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeSource = read('backend/routes/dashboard.js');
const phpSource = read('api/index.php');
const frontendSource = read('public/js/pages/dashboard.js');
const year = Number(process.argv[2] || new Date().getFullYear());

const normalizeDepartment = value => String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
const normalizeUnit = value => String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
const parseArray = value => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
        return String(value).split(/\s*(?:\|+|;|,)\s*/);
    }
};
const percent = (numerator, denominator) => denominator
    ? Math.max(0, Math.min(100, Math.round((Number(numerator) / Number(denominator)) * 100)))
    : null;

function sourceContractChecks() {
    const contracts = [
        ['Node CCCF Manual uses selected Units', nodeSource.includes("key_name='cccf_unit_sel'") && nodeSource.includes('selectedCccfUnits')],
        ['PHP CCCF Manual uses selected Units', phpSource.includes("key_name='cccf_unit_sel'") && phpSource.includes('$selectedCccfUnits')],
        ['Node CCCF Manual uses target and override', nodeSource.includes('CCCF_Unit_Targets') && nodeSource.includes('achievedOverride')],
        ['PHP CCCF Manual uses target and override', phpSource.includes('cccf_unit_targets') && phpSource.includes('achievedOverride')],
        ['Node Yokoten uses module year and Unit scope', nodeSource.includes('DateIssued IS NULL OR YEAR(DateIssued)=?') && nodeSource.includes('yokotenPinnedUnits')],
        ['PHP Yokoten uses module year and Unit scope', phpSource.includes('DateIssued IS NULL OR YEAR(DateIssued)=?') && phpSource.includes('$yokotenPinnedUnits')],
        ['Node Yokoten numerator only counts in-scope assigned topics', nodeSource.includes('yokotenResponseSet.has(`${deptKey}::${topic.YokotenID}`)')],
        ['PHP Yokoten numerator only counts in-scope assigned topics', phpSource.includes("$yokotenResponseSet[$deptKey.'::'.(string)($topic['YokotenID'] ?? '')]")],
        ['Node OJT selects deterministic latest record', nodeSource.includes('COALESCE(r2.UpdatedAt, r2.OJTDate) DESC, r2.id DESC')],
        ['PHP OJT selects deterministic latest record', phpSource.includes('COALESCE(r2.UpdatedAt,r2.OJTDate) DESC,r2.id DESC')],
        ['Node sends coverage source metadata', nodeSource.includes('coverageMeta')],
        ['PHP sends coverage source metadata', phpSource.includes("'coverageMeta'=>$coverageMeta")],
        ['Node Dashboard resolves activity targets without schema writes', nodeSource.includes("getCoverageMatrix(year, { ensureSchema: false })")],
        ['PHP Dashboard resolves activity targets without schema writes', phpSource.includes('activity_target_coverage_matrix_data($year, false)')],
        ['Frontend exposes numerator, denominator, and source', frontendSource.includes('row.coverageMeta?.[key]') && frontendSource.includes('meta.source ||')],
    ];
    for (const [name, condition] of contracts) assert.ok(condition, name);
    return contracts.map(([name]) => name);
}

async function loadConfig() {
    const [rows] = await db.query("SELECT ConfigValue FROM Dashboard_Config WHERE ConfigKey='enterprise' LIMIT 1");
    const raw = rows[0]?.ConfigValue;
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    return {
        healthGreen: 85,
        healthAmber: 65,
        alertDueSoonDays: 7,
        hiddenModules: [],
        pinnedDepartments: [],
        cccfWorkerSource: 'manual_unit_target',
        ...parsed,
        cccfWorkerSource: 'manual_unit_target',
    };
}

async function expectedManualCccf() {
    const [[settingRows], [targetRows], [actualRows], [masterRows]] = await Promise.all([
        db.query("SELECT value FROM App_Settings WHERE key_name='cccf_unit_sel' LIMIT 1"),
        db.query('SELECT unit_name Unit, yearly_target target, achieved_override achievedOverride FROM CCCF_Unit_Targets WHERE target_year=?', [year]),
        db.query("SELECT TRIM(COALESCE(SafetyUnit,'')) Unit, COUNT(*) computedAchieved FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=? GROUP BY TRIM(COALESCE(SafetyUnit,''))", [year]),
        db.query("SELECT TRIM(u.name) Unit, TRIM(COALESCE(d.Name,'')) Department FROM Master_SafetyUnits u LEFT JOIN Master_Departments d ON d.id=u.department_id"),
    ]);
    const selected = new Set(parseArray(settingRows[0]?.value).map(normalizeUnit));
    const actual = new Map(actualRows.map(row => [normalizeUnit(row.Unit), Number(row.computedAchieved || 0)]));
    const departments = new Map(masterRows.map(row => [normalizeUnit(row.Unit), normalizeDepartment(row.Department)]));
    const totals = new Map();
    for (const row of targetRows) {
        const unit = normalizeUnit(row.Unit);
        if (!unit || (selected.size && !selected.has(unit))) continue;
        const department = departments.get(unit);
        const target = Math.max(0, Number(row.target || 0));
        if (!department || !target) continue;
        const achieved = row.achievedOverride === null || row.achievedOverride === ''
            ? (actual.get(unit) || 0)
            : Math.max(0, Number(row.achievedOverride || 0));
        const metric = totals.get(department) || { numerator: 0, denominator: 0, units: 0 };
        metric.numerator += Math.min(achieved, target);
        metric.denominator += target;
        metric.units += 1;
        totals.set(department, metric);
    }
    for (const metric of totals.values()) metric.value = percent(metric.numerator, metric.denominator);
    return totals;
}

async function main() {
    const staticChecks = sourceContractChecks();
    const config = await loadConfig();
    const matrix = await dashboardRoute.buildComplianceMatrix(year, config);
    const expected = await expectedManualCccf();

    assert.ok(matrix.length > 0, 'Dashboard matrix must contain configured departments');
    assert.ok([...expected.values()].some(metric => metric.numerator > 0), 'Read-only CCCF source must contain achieved data');
    assert.ok(matrix.some(row => Number(row.cccfWorker) > 0), 'CCCF Manual must not collapse real achieved data to all zero');

    const visibleColumns = [
        'activityTargets', 'cccfWorker', 'cccfPermanent', 'patrolIssues', 'hiyari',
        'ky', 'yokoten', 'training', 'accident', 'ojt',
    ];
    const sourceColumns = [
        'activityTargets', 'cccfWorker', 'cccfPermanent', 'patrolIssues', 'hiyari',
        'ky', 'yokoten', 'training', 'accident', 'ojt',
    ];

    for (const row of matrix) {
        const key = normalizeDepartment(row.department);
        const manual = expected.get(key);
        assert.strictEqual(row.cccfWorker, manual?.value ?? null, `CCCF Manual parity: ${row.department}`);
        for (const column of visibleColumns) {
            assert.ok(Object.prototype.hasOwnProperty.call(row, column), `${column} value exists: ${row.department}`);
        }
        for (const column of sourceColumns) {
            assert.ok(Object.prototype.hasOwnProperty.call(row.coverageMeta || {}, column), `${column} metadata exists: ${row.department}`);
        }
        for (const column of sourceColumns) {
            const meta = row.coverageMeta[column];
            if (!meta) {
                assert.ok(row[column] === null || (column === 'ojt' && row[column] === 0), `${column} missing-source semantics: ${row.department}`);
                continue;
            }
            let expectedValue = percent(meta.numerator, meta.denominator);
            if ((column === 'patrolIssues' || column === 'accident') && !Number(meta.denominator)) expectedValue = 100;
            if (column === 'ojt') expectedValue = meta.value;
            assert.strictEqual(row[column], expectedValue, `${column} numerator/denominator parity: ${row.department}`);
        }
    }

    console.log(`Dashboard coverage source smoke passed for ${year}`);
    console.log(`PASS ${staticChecks.length} Node/PHP/frontend source contracts`);
    console.log(`PASS ${matrix.length} department rows with all visible source metadata`);
    console.table(matrix.map(row => {
        const meta = row.coverageMeta.cccfWorker;
        return {
            Department: row.department,
            'CCCF Manual': row.cccfWorker === null ? 'N/A' : `${row.cccfWorker}%`,
            'CCCF Done/Target': meta ? `${meta.numerator}/${meta.denominator}` : 'N/A',
            'CCCF Permanent': row.cccfPermanent,
            Patrol: row.patrolIssues,
            Hiyari: row.hiyari,
            KY: row.ky,
            Yokoten: row.yokoten,
            Training: row.training,
            Accident: row.accident,
            OJT: row.ojt,
        };
    }));
}

main()
    .then(() => db.end())
    .catch(async error => {
        console.error(error.stack || error);
        try { await db.end(); } catch (_) {}
        process.exitCode = 1;
    });
