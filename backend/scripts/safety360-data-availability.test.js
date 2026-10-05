'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const nodePeople = fs.readFileSync(path.join(root, 'backend', 'routes', 'person-search.js'), 'utf8');
const phpPeople = fs.readFileSync(path.join(root, 'api', 'handlers', 'people.php'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'public', 'js', 'pages', 'search.js'), 'utf8');

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notStrictEqual(start, -1, `Missing ${name}()`);
    const brace = source.indexOf('{', start);
    let depth = 0;
    for (let index = brace; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}()`);
}

const context = vm.createContext({ Set });
vm.runInContext(`${extractFunction(nodePeople, 'recordDataQualityFailure')}\n${extractFunction(nodePeople, 'buildDataQuality')}`, context);
assert.deepStrictEqual(
    JSON.parse(vm.runInContext("JSON.stringify(buildDataQuality({failures:[]}))", context)),
    { status: 'complete', unavailableModules: [], unavailableDetails: [], warnings: [] },
    'A successful zero-result profile must remain complete, not unavailable'
);
vm.runInContext("state={failures:[]}; recordDataQualityFailure(state,'training',true); recordDataQualityFailure(state,'timeline',false); recordDataQualityFailure(state,'training',true)", context);
const nodePartial = JSON.parse(vm.runInContext('JSON.stringify(buildDataQuality(state))', context));
assert.deepStrictEqual(nodePartial.unavailableModules, ['training']);
assert.deepStrictEqual(nodePartial.unavailableDetails, ['timeline']);
assert.strictEqual(nodePartial.warnings.length, 2, 'Duplicate source failures must be de-duplicated');

const phpCandidates = [process.env.PHP_BIN, 'C:\\xampp\\php\\php.exe', 'php'].filter(Boolean);
const phpBin = phpCandidates.find(candidate => candidate === 'php' || fs.existsSync(candidate));
assert.ok(phpBin, 'PHP runtime is required for Safety 360 data-quality parity');
const phpResult = spawnSync(phpBin, [path.join(__dirname, 'safety360-data-availability-fixture.php')], {
    cwd: root,
    input: JSON.stringify({ failures: [
        { source: 'training', affectsScore: true },
        { source: 'timeline', affectsScore: false },
        { source: 'training', affectsScore: true },
    ] }),
    encoding: 'utf8',
});
assert.strictEqual(phpResult.status, 0, phpResult.stderr || 'PHP Safety 360 data-quality fixture failed');
assert.deepStrictEqual(JSON.parse(phpResult.stdout), nodePartial, 'PHP and Node data-quality contracts must match');

for (const [runtime, source] of [['Node', nodePeople], ['PHP', phpPeople]]) {
    assert.ok(source.includes('SOURCE_UNAVAILABLE'), `${runtime} must expose a stable non-secret source failure code`);
    assert.ok(source.includes('unavailableModules'), `${runtime} must return unavailable score sources`);
    assert.ok(source.includes('source_unavailable'), `${runtime} must mark failed CCCF calculation instead of returning 0%`);
    assert.ok(/noData[^\n]*sourceUnavailable|sourceUnavailable[^\n]*noData/.test(source), `${runtime} failed personal source must become noData`);
}
assert.ok(nodePeople.includes('!row.noData && row.completionPct !== null'), 'Node score must exclude unavailable targets');
assert.ok(phpPeople.includes("return empty($row['noData']) && ($row['passed'] ?? null) !== null"), 'PHP score must exclude unavailable targets');
assert.ok(frontend.includes('renderDataQualityNotice(data.dataQuality)'), 'Safety 360 UI must render the data-quality warning');
assert.ok(frontend.includes('data-retry-profile'), 'Safety 360 UI must provide a retry action');
assert.ok(frontend.includes('Unavailable sources are not treated as zero or included in scoring.'), 'Safety 360 UI must explain zero-vs-error behavior');

console.log('Safety 360 Data Availability regression passed: real-zero/failed-source distinction, PHP/Node parity, score exclusion, warning and retry.');
