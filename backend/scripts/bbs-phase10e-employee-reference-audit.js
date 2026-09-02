'use strict';

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const sourcePath = process.argv[2];
if (!sourcePath || !fs.existsSync(sourcePath)) {
    console.error('Usage: node bbs-phase10e-employee-reference-audit.js <employee-master.xlsx>');
    process.exit(2);
}

const normalize = value => String(value ?? '').trim();
const compact = value => normalize(value).toLowerCase().replace(/[._\s/-]+/g, '');
const findValue = (row, aliases) => {
    const byKey = new Map(Object.keys(row).map(key => [compact(key), row[key]]));
    for (const alias of aliases) if (byKey.has(compact(alias))) return normalize(byKey.get(compact(alias)));
    return '';
};

const workbook = xlsx.readFile(path.resolve(sourcePath), { cellDates: false });
const matches = [];
const sheets = [];
for (const sheetName of workbook.SheetNames) {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    sheets.push({ sheet: sheetName, rows: rows.length, headers: rows[0] ? Object.keys(rows[0]) : [] });
    for (const row of rows) {
        const department = findValue(row, ['Department', 'แผนก', 'หน่วยงาน']);
        const unit = findValue(row, ['Unit', 'Safety Unit', 'ส่วนงาน', 'ยูนิต']);
        if (!/maintenance/i.test(department) || !/tube\s*cutting/i.test(unit)) continue;
        matches.push({
            employeeId: findValue(row, ['EmployeeID', 'Employee ID', 'รหัสพนักงาน', 'รหัส']),
            name: findValue(row, ['Name', 'Employee Name', 'ชื่อ-นามสกุล', 'ชื่อ']),
            department,
            unit,
            position: findValue(row, ['Position', 'ตำแหน่ง']),
            sheet: sheetName,
        });
    }
}

console.log(JSON.stringify({
    readOnly: true,
    imported: false,
    source: path.basename(sourcePath),
    sheets,
    approvedPilotReferenceRows: matches,
}, null, 2));
