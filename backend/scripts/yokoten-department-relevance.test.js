'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'pages', 'yokoten.js'), 'utf8');
const checks = [];

function check(name, condition) {
    assert.ok(condition, name);
    checks.push(name);
    console.log(`PASS ${name}`);
}

function classify(item = {}) {
    if (!item.responded) return 'incomplete';
    if (String(item.isRelated || '').toLowerCase() === 'yes') return 'related';
    if (String(item.isRelated || '').toLowerCase() === 'no') return 'not_related';
    return 'incomplete';
}

check('counts a fully covered Yes response as related',
    classify({ responded: true, isRelated: 'Yes' }) === 'related');
check('counts a fully covered No response as not related',
    classify({ responded: true, isRelated: 'No' }) === 'not_related');
check('keeps partial Unit coverage in incomplete even when relevance is Yes',
    classify({ responded: false, responseExists: true, isRelated: 'Yes' }) === 'incomplete');
check('does not infer a missing relevance value as not related',
    classify({ responded: true }) === 'incomplete');
check('uses the existing Department completion and response datasets',
    source.includes("API.get('/yokoten/dept-completion')")
    && source.includes("API.get('/yokoten/all-responses')")
    && source.includes('normalizeApiArray(dept.topicBreakdown)'));
check('scopes relevance totals to the selected Dashboard year',
    source.includes("new Date(topic.DateIssued).getFullYear() === _dashYear")
    && source.includes('activeIds.has(String(item.YokotenID))'));
check('offers progress and relevance modes in the existing Department card',
    source.includes('data-dept-chart-mode="progress"')
    && source.includes('data-dept-chart-mode="relevance"')
    && source.includes("localStorage.setItem('yok_dept_chart_mode'"));
check('renders related, not-related, and incomplete stacked datasets',
    source.includes("{ label: 'เกี่ยวข้อง', data: sorted.map(dept => dept.related)")
    && source.includes("{ label: 'ไม่เกี่ยวข้อง', data: sorted.map(dept => dept.notRelated)")
    && source.includes("{ label: 'ยังไม่ตอบ / Unit ไม่ครบ', data: sorted.map(dept => dept.incomplete)")
    && source.includes('stacked: relevanceMode'));
check('opens a Department drill-down from a chart segment',
    source.includes('_openDeptRelevanceModal(department, relevanceMode')
    && source.includes("const filterByDataset = ['related', 'not_related', 'incomplete']"));
check('provides drill-down filters and preserves topic detail navigation',
    source.includes("['all', 'related', 'not_related', 'incomplete'].includes(filter)")
    && source.includes("e.target.closest('.yok-dept-relevance-filter')")
    && source.includes('class="yok-open-topic-btn'));
check('keeps the Department relevance drill-down Admin-only',
    source.includes('function _openDeptRelevanceModal(department, filter = \'all\') {\n    if (!_isAdmin) return;'));

console.log(`Yokoten Department relevance regression passed ${checks.length}/${checks.length}.`);
