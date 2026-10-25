'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const component = read('public/js/pages/safety-vote-people-picker.js');
const participant = read('public/js/pages/safety-vote-page-ux1.js');
const legacyParticipant = read('public/js/pages/safety-vote.js');
const wizard = read('public/js/pages/safety-vote-campaign-wizard.js');
const nodeRoute = read('backend/routes/safety-vote-phase3.js');
const phpRoute = read('api/handlers/safety_vote_phase3.php');
const css = read('public/style.css');
const checks = [];
const ok = (condition, label) => { assert(condition, label); checks.push(label); };

for (const source of [nodeRoute, phpRoute]) {
    ok(source.includes('/safety-vote/people') || source.includes("'/people'"), 'shared authenticated People endpoint');
    ok(source.includes('SAFETY_VOTE_VIEW'), 'People endpoint requires Safety Vote view permission');
    ok(source.includes('PEOPLE_QUERY_REQUIRED'), 'minimum search query enforced');
    ok(source.includes('employeeId') && source.includes('employeeName') && source.includes('department') && source.includes('unit') && source.includes('position'), 'bounded Employee Master projection');
    ok(!/SELECT[^\n;]*CompanyEmail[^\n;]*FROM Employees/i.test(source.slice(source.indexOf('PEOPLE_QUERY_REQUIRED') - 1500, source.indexOf('PEOPLE_QUERY_REQUIRED') + 2500)), 'People endpoint excludes company email');
}
ok(nodeRoute.includes('Math.min(25') && phpRoute.includes('min(25'), 'server result limit capped at 25');
ok(nodeRoute.includes('INSTR(LOWER') && phpRoute.includes('INSTR(LOWER'), 'literal substring search avoids wildcard broadening');
ok(component.includes('role="combobox"') && component.includes('role="listbox"') && component.includes('aria-live="polite"'), 'accessible combobox/listbox/status semantics');
ok(component.includes("setTimeout(search, 250)") && component.includes('AbortController'), 'debounced cancellable search');
ok(component.includes("ArrowDown") && component.includes("ArrowUp") && component.includes("Escape"), 'keyboard navigation contract');
ok(component.includes('data-sv-people-clear') && component.includes('cleared: true'), 'selection can be cleared explicitly');
ok(participant.includes("question.questionType === 'employee_picker'") && participant.includes("key:'nomineeEmployeeId'"), 'ballot employee questions and nomination workflow use People Picker');
ok(legacyParticipant.includes('safetyVotePeoplePickerMarkup') && legacyParticipant.includes('data-sv-people-value="nomineeEmployeeId"'), 'legacy fallback ballot and nomination workflow use People Picker');
ok(wizard.includes("key:'juryAssignment'") && wizard.includes('bindSafetyVotePeoplePickers'), 'Jury assignment uses shared People Picker');
ok(css.includes('.sv-people-picker__results') && css.includes('@media (max-width:430px)') && css.includes('prefers-reduced-motion'), 'responsive reduced-motion styling');
ok(component.includes('employeeId=${encodeURIComponent(hidden.value)}'), 'saved employee IDs hydrate from authoritative Master Data');

console.log(`Safety Vote Employee Master People Picker: PASS (${checks.length} assertions)`);
