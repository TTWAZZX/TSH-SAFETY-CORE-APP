'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const page = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'safety-culture.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public', 'js', 'main.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const checks = [
    ['wider PPE modal', page.includes("</form>`, 'max-w-5xl');")],
    ['three-step UI', page.includes("stepper.id = 'sc-ppef-stepper'") && page.includes("['3', 'ผลตรวจ PPE', 'Checklist']")],
    ['back and next navigation', page.includes("id = 'sc-ppef-next'") && page.includes("getElementById('sc-ppef-back')")],
    ['sticky action footer', page.includes("footerSection.className = 'sticky -bottom-1")],
    ['checklist before evidence', page.includes('form.insertBefore(checklistSection, evidenceSection)')],
    ['larger status controls', page.includes('data-ppe-status-option="compliant"') && page.includes('data-ppe-status-option="non-compliant"')],
    ['N/A remains checked by default', /value="na" checked class="accent-slate-400 sc-ppe-radio"/.test(page)],
    ['existing minimum-selection validation retained', page.includes("return v === 'compliant' || v === 'non-compliant';")],
    ['existing PPE API retained', page.includes("API.post('/safety-culture/ppe-inspections', payload)")],
    ['existing evidence precedence retained', page.includes("getElementById('sc-ppef-camera')?.files?.[0] || document.getElementById('sc-ppef-evidence')?.files?.[0]")],
    ['automatic Violation result handling retained', page.includes('result?.violationResult?.error')],
    ['cache key synchronized', main.includes('20260824-safety-culture-ppe-form-r1') && index.includes('20260824-safety-culture-ppe-form-r1')],
];

let failed = 0;
for (const [name, passed] of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
    if (!passed) failed += 1;
}

console.log(`\nSafety Culture PPE form layout: ${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
