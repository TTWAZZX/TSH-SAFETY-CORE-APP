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
assert.match(main, /fourm\.js\?v=20260819-fourm-white-screen-hotfix/);
assert.match(index, /main\.js\?v=20260819-fourm-white-screen-hotfix/);

const declarations = [...frontend.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map(match => match[1]);
const duplicates = declarations.filter((name, index) => declarations.indexOf(name) !== index);
assert.deepStrictEqual([...new Set(duplicates)], [], `duplicate function declarations: ${duplicates.join(', ')}`);

console.log('4M stabilization regression tests passed.');
