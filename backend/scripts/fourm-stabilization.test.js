'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const phpHandler = fs.readFileSync(path.join(root, 'api', 'handlers', 'fourm_phase7.php'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'fourm.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';
const runner = path.join(root, 'api', 'tests', 'fourm_multipart_runner.php');

function multipart(parts, boundary = '----codex-fourm-boundary') {
    return {
        contentType: `multipart/form-data; boundary=${boundary}`,
        body: parts.map(part => {
            const disposition = part.filename === undefined
                ? `Content-Disposition: form-data; name="${part.name}"`
                : `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"`;
            const type = part.filename === undefined ? '' : `\r\nContent-Type: ${part.type || 'application/octet-stream'}`;
            return `--${boundary}\r\n${disposition}${type}\r\n\r\n${part.value || ''}\r\n`;
        }).join('') + `--${boundary}--\r\n`,
    };
}

function parseMultipart(parts) {
    const payload = multipart(parts);
    const result = spawnSync(php, [runner, payload.contentType], {
        cwd: root,
        input: payload.body,
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
}

const emptyFile = parseMultipart([
    { name: 'Title', value: 'Closed notice edit' },
    { name: 'attachment', filename: '', value: '', type: 'application/octet-stream' },
]);
assert.strictEqual(Object.keys(emptyFile.files).length, 0, 'empty optional attachment must be ignored');
assert.strictEqual(emptyFile.fields.Title, 'Closed notice edit');

const realFile = parseMultipart([
    { name: 'Title', value: 'Closed notice edit' },
    { name: 'attachment', filename: 'evidence.pdf', value: '%PDF-test', type: 'application/pdf' },
]);
assert.strictEqual(realFile.files.attachment.name, 'evidence.pdf');
assert.strictEqual(realFile.files.attachment.size, Buffer.byteLength('%PDF-test'));

assert.match(phpHandler, /FOURM_DUPLICATE/);
assert.match(phpHandler, /LOWER\(TRIM\(CourseCode\)\)=LOWER\(TRIM\(\?\)\)/);
assert.match(phpHandler, /LOWER\(TRIM\(CurriculumCode\)\)=LOWER\(TRIM\(\?\)\)/);
assert.match(phpHandler, /Only assigned employees can be transferred\./);
assert.match(phpHandler, /Select a different destination curriculum\./);
assert.match(phpHandler, /Select a different destination course\./);
assert.match(phpHandler, /COURSE_MASTER_UPDATE/);
assert.match(phpHandler, /CURRICULUM_ASSIGNMENT_TRANSFER/);
assert.match(frontend, /fd\.delete\('attachment'\)/);
assert.match(frontend, /id="tm-workspace"/);
assert.match(frontend, /id="tm-curriculum-pane"/);
assert.match(frontend, /id="tm-detail-pane"/);
assert.match(frontend, /id="btn-tm-mobile-back"/);
assert.match(frontend, /function _tmApplyWorkspaceMode\(\)/);
assert.match(frontend, /overflow-y-auto overscroll-contain/);
assert.match(main, /fourm\.js\?v=20260821-fourm-transfer-picker-r2/);
assert.match(index, /main\.js\?v=20260821-fourm-transfer-picker-r2/);
assert.match(frontend, /id="notice-responsible-search"/);
assert.match(frontend, /notice-responsible-dept-warning/);
assert.match(frontend, /\/fourm\/responsible-employees\?q=/);
assert.match(phpHandler, /ResponsibleEmployeeID/);
assert.match(phpHandler, /NoticeReassigned/);
assert.match(frontend, /เพิ่มเข้าหลักสูตร \/ Assign IDs/);
assert.match(frontend, /await saveAssignments\(eligible, event\.currentTarget\)/);
assert.match(frontend, /Assignment read-back verification failed/);
assert.match(frontend, /id="tm-curriculum-transfer-search"/);
assert.match(frontend, /data-course-hover-preview/);
assert.match(frontend, /loadDestinationCourses/);
assert.match(frontend, /Assignment is still active after removal/);
assert.match(frontend, /อ่านอย่างเดียว \/ Read only/);
assert.match(frontend, /4M Training PIC: จัดการพนักงานในแผนก/);
assert.doesNotMatch(frontend, /Added \$\{eligible\.length\}/);
const curriculumTransferHandler = frontend.slice(
    frontend.indexOf('async function showTransferCurriculumAssignmentModal'),
    frontend.indexOf('async function showTrainingCoursePickerModal'),
);
assert.ok(
    curriculumTransferHandler.indexOf('const body = Object.fromEntries(new FormData(form).entries())')
        < curriculumTransferHandler.indexOf('await showConfirmationModal'),
    'curriculum transfer payload must be captured before confirmation detaches/disables the form',
);
assert.match(curriculumTransferHandler, /if \(btn\?\.isConnected\) btn\.disabled = false/);
const courseTransferHandler = frontend.slice(
    frontend.indexOf('async function showTransferAssignmentModal'),
    frontend.indexOf('async function showTrainingEmployeeHistoryModal'),
);
assert.ok(
    courseTransferHandler.indexOf('const body = Object.fromEntries(new FormData(form).entries())')
        < courseTransferHandler.indexOf('await showConfirmationModal'),
    'course transfer payload must be captured before confirmation detaches/disables the form',
);
assert.strictEqual(
    (frontend.match(/^async function showAssignEmployeesModal\(\)/gm) || []).length,
    1,
    'only one active Assign Employees modal implementation is allowed'
);

const moduleSyntax = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: frontend,
    encoding: 'utf8',
});
assert.strictEqual(moduleSyntax.status, 0, moduleSyntax.stderr || 'fourm.js ES module syntax check failed');

const requiredTrainingSymbols = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: `${frontend}\nexport {
        fetchTrainingPermissions,
        renderTrainingMatrix,
        fetchTrainingMatrix,
        renderTrainingCurriculums,
        fetchTrainingCourses,
        renderTrainingCourses,
        fetchTrainingAssignments,
        renderTrainingAssignments,
        showTrainingCurriculumForm,
        showTrainingCourseForm,
        showAssignEmployeesModal,
        showTrainingAuditLogModal
    };\n`,
    encoding: 'utf8',
});
assert.strictEqual(
    requiredTrainingSymbols.status,
    0,
    requiredTrainingSymbols.stderr || 'Training Matrix functions are not available in module scope'
);

console.log('4M stabilization regression tests passed.');
