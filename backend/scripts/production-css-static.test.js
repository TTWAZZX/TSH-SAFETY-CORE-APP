'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const index = read('index.html');
const packageJson = JSON.parse(read('package.json'));
const config = read('tailwind.config.cjs');
const source = read('src/tailwind.css');
const output = read('public/tailwind.production.css');
const bbs = read('public/js/pages/bbs-smart-card.js');
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert(condition, message); };

check(packageJson.scripts['build:css']?.includes('tailwindcss'), 'A repeatable Tailwind build command is required');
check(packageJson.devDependencies?.tailwindcss === '^3.4.17', 'Tailwind compiler version must be pinned to the v3 production contract');
check(config.includes("'./index.html'") && config.includes("'./public/js/**/*.{js,mjs}'"), 'Tailwind must scan HTML and runtime templates');
check(source.includes('@tailwind base;') && source.includes('@tailwind utilities;'), 'Tailwind source layers are incomplete');
check(output.length > 50000 && output.length < 300000, 'Compiled CSS output is missing or unexpectedly large');
check(output.includes('.hidden{display:none}'), 'Core visibility utility is missing');
check(output.includes('.md\\:grid-cols-2'), 'Responsive runtime utilities are missing');
check(output.includes('.max-w-\\[80vw\\]'), 'Arbitrary value utilities are missing');
check(output.includes('.text-\\[11px\\]'), 'Arbitrary typography utilities are missing');
check(index.includes('public/tailwind.production.css?v=20261019-local-production-r1'), 'Application does not load compiled local CSS');
check(!index.includes('cdn.tailwindcss.com'), 'Application shell still loads Tailwind CDN');
check(!bbs.includes('cdn.tailwindcss.com') && bbs.includes('tailwind.production.css?v=20261019-local-production-r1'), 'Print view must use the same local CSS artifact');

console.log(`Local Production Tailwind CSS contract: PASS (${assertions} assertions, ${output.length} bytes)`);
