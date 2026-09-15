'use strict';

const assert = require('assert');
const db = require('../db');

const yearArg = process.argv.find((arg) => /^20\d{2}$/.test(arg));
const year = Number(yearArg || new Date().getFullYear());

function assertReadOnly(sql) {
    const normalized = String(sql || '').trim();
    assert.match(normalized, /^(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i,
        'Accident audit only permits read-only SQL');
    assert.doesNotMatch(normalized,
        /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|TRUNCATE|CALL|LOAD)\b/i);
}

async function select(sql, params = []) {
    assertReadOnly(sql);
    const [rows] = await db.query(sql, params);
    return rows;
}

async function fingerprint() {
    const [row] = await select(`
        SELECT COUNT(*) AS totalRows,
               COALESCE(SUM(IsDeleted IS NULL OR IsDeleted=0),0) AS activeRows,
               COALESCE(SUM(IsRecordable=1),0) AS flaggedRows,
               COALESCE(SUM(LostDays),0) AS storedLostDays,
               COALESCE(MAX(id),0) AS maxId,
               COALESCE(MAX(UpdatedAt),'') AS maxUpdatedAt
          FROM Accident_Reports
    `);
    return row;
}

async function run() {
    assert(Number.isInteger(year) && year >= 2000 && year <= 2100, 'Invalid audit year');
    const before = await fingerprint();
    const [summary] = await select(`
        SELECT COUNT(*) AS reports,
               COALESCE(SUM(IsRecordable=1
                   AND AccidentType NOT IN ('Near Miss','First Aid')),0) AS officialRecordable,
               COALESCE(SUM(CASE WHEN IsRecordable=1
                   AND AccidentType NOT IN ('Near Miss','First Aid')
                   THEN LostDays ELSE 0 END),0) AS officialLostDays,
               COALESCE(SUM(IsRecordable=1
                   AND AccidentType='Lost Time'),0) AS officialLostTimeCases,
               COALESCE(SUM(IsRecordable=0 AND (
                   AccidentType IN ('Medical Treatment','Lost Time','Fatal')
                   OR Severity='Critical'
                   OR LostDays>0
               )),0) AS formerlyImplicitCases,
               COALESCE(SUM(IsRecordable=1
                   AND AccidentType IN ('Near Miss','First Aid')),0) AS invalidFlaggedExcludedTypes
          FROM Accident_Reports
         WHERE (IsDeleted IS NULL OR IsDeleted=0)
           AND YEAR(AccidentDate)=?
    `, [year]);
    const formerlyImplicitRows = await select(`
        SELECT id, AccidentDate, AccidentType, Severity, LostDays,
               IsRecordable, Status, Department
          FROM Accident_Reports
         WHERE (IsDeleted IS NULL OR IsDeleted=0)
           AND YEAR(AccidentDate)=?
           AND IsRecordable=0
           AND (AccidentType IN ('Medical Treatment','Lost Time','Fatal')
                OR Severity='Critical' OR LostDays>0)
         ORDER BY AccidentDate DESC, id DESC
         LIMIT 100
    `, [year]);
    const after = await fingerprint();

    assert.deepStrictEqual(after, before, 'Read-only audit changed the database fingerprint');
    assert.strictEqual(Number(summary.invalidFlaggedExcludedTypes), 0,
        'Found Near Miss/First Aid rows incorrectly flagged as Recordable');

    console.log(JSON.stringify({
        success: true,
        readOnly: true,
        year,
        summary,
        formerlyImplicitRows,
        databaseFingerprintUnchanged: true,
    }, null, 2));
}

run()
    .catch((error) => {
        console.error(error.stack || error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.end();
    });
