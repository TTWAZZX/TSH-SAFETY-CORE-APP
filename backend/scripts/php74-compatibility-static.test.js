'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const roots = ['api', 'backend'];
const files = [];

function walk(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.isFile() && entry.name.endsWith('.php')) files.push(child);
    }
}

roots.forEach(walk);

const forbidden = [
    ['nullsafe operator', /\?->/],
    ['match expression', /\bmatch\s*\(/],
    ['attribute syntax', /^\s*#\[/m],
    ['PHP 8+ standard-library API', /\b(?:str_contains|str_starts_with|str_ends_with|array_is_list|get_debug_type|fdiv|preg_last_error_msg|enum_exists|json_validate|mysqli_execute_query)\s*\(/],
    ['PHP 8 enum declaration', /\benum\s+[A-Za-z_][A-Za-z0-9_]*/],
    ['PHP 8 mixed or never type', /(?:function\s+\w+\s*\([^)]*|\)\s*:|(?:public|protected|private)\s+)(?:mixed|never)\b/],
    ['removed legacy PHP API', /\b(?:each|create_function|get_magic_quotes_gpc|money_format)\s*\(/],
    ['removed curly-brace string offset', /\$[A-Za-z_][A-Za-z0-9_]*\s*\{[^}\r\n]+\}/],
    ['union type', /(?:function\s+\w+\s*\([^)]*|\)\s*:)\s*[?\w\\]+\s*\|\s*[?\w\\]+/],
    ['constructor property promotion', /function\s+__construct\s*\([^)]*\b(?:public|protected|private)\s+(?:readonly\s+)?[$?\\\w]/],
    ['readonly declaration', /\breadonly\s+(?:class|[$\\\w])/],
];

const violations = [];
for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [label, pattern] of forbidden) if (pattern.test(source)) violations.push(`${file}: ${label}`);
}

assert.deepStrictEqual(violations, [], `PHP 7.4 compatibility violations:\n${violations.join('\n')}`);
console.log(`PHP 7.4 static compatibility: PASS (${files.length} PHP files)`);
