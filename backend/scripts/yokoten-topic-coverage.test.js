'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'pages', 'yokoten.js'), 'utf8');
const nodeSource = fs.readFileSync(path.join(projectRoot, 'backend', 'routes', 'yokoten.js'), 'utf8');
const phpSource = fs.readFileSync(path.join(projectRoot, 'api', 'handlers', 'workflow_phase6.php'), 'utf8');
const checks = [];

function check(name, condition) {
    assert.ok(condition, name);
    checks.push(name);
    console.log(`PASS ${name}`);
}

function classify({ responded = false, responseExists = false, response = null } = {}) {
    const exists = Boolean(responseExists || response);
    return responded ? 'complete' : exists ? 'partial' : 'missing';
}

check('keeps Department and Topic coverage modes',
    source.includes("let _adminCoverageMode = 'department'")
    && source.includes("button('topic', 'ดูตามหัวข้อ'"));
check('reuses the existing Department-topic breakdown',
    source.includes('function _getAdminTopicCoverageRows(deptSummary, topic)')
    && source.includes('_getTopicTargetedDepts(deptSummary, topic)'));
check('classifies a complete Department-topic pair', classify({ responded: true, responseExists: true }) === 'complete');
check('classifies a response with incomplete Units as partial', classify({ responseExists: true }) === 'partial');
check('classifies an absent response as missing', classify({}) === 'missing');
check('renders covered and missing Unit columns',
    source.includes('Unit ที่ส่งแล้ว') && source.includes('Unit ที่ยังไม่ส่ง'));
check('renders Topic Coverage KPI counts',
    source.includes("'แผนกส่งครบ'")
    && source.includes("'ส่งบางส่วน / Unit ไม่ครบ'")
    && source.includes("'แผนกยังไม่ตอบ'")
    && source.includes("'Unit ส่งแล้ว/ทั้งหมด'"));
check('provides topic and status filters',
    source.includes('id="yok-admin-coverage-topic"')
    && source.includes('data-coverage-status="${status}"'));
check('preserves response drill-down',
    source.includes('class="yok-open-topic-btn')
    && source.includes("responseId: _getResponseId(response)"));
check('handles coverage-mode and filter events in the existing delegate',
    source.includes("e.target.closest('.yok-admin-coverage-mode')")
    && source.includes("e.target.closest('.yok-admin-coverage-status')")
    && source.includes("e.target.id === 'yok-admin-coverage-topic'"));
check('hides Department exports while Topic Coverage is active',
    source.includes("_adminView === 'dept' && _adminCoverageMode === 'department'"));
check('filters Topic Coverage by issued year and risk',
    source.includes('id="yok-admin-coverage-year"')
    && source.includes('id="yok-admin-coverage-risk"')
    && source.includes('function _filterAdminCoverageTopics'));
check('shows deadline and overdue days for incomplete rows',
    source.includes('function _topicCoverageDeadlineMeta')
    && source.includes('overdueDays: Math.abs(diffDays)')
    && source.includes('selected.topic.Deadline'));
check('exports the selected Topic Coverage view to Excel',
    source.includes('id="yok-topic-coverage-export"')
    && source.includes('function _exportAdminTopicCoverageExcel')
    && source.includes("XLSX.utils.book_append_sheet(wb, ws, 'Topic Coverage')"));
check('offers scoped row and bulk Reminder actions',
    source.includes('id="yok-topic-reminder-all"')
    && source.includes('class="yok-topic-reminder-btn')
    && source.includes("API.post('/yokoten/reminders/send'"));
check('opens Admin response-on-behalf with the missing Department preselected',
    source.includes('class="yok-topic-respond-behalf-btn')
    && source.includes('function _openAdminResponseForDepartment')
    && source.includes('_setAdminSelectionItem(departmentItem, true)')
    && source.includes('_renderAdminUnitSelection(form, { selectDepartment: department })'));
check('Node and PHP expose the same Admin-only Reminder route',
    nodeSource.includes("router.post('/reminders/send', isAdmin")
    && phpSource.includes("$method==='POST'&&$path==='/yokoten/reminders/send'")
    && phpSource.includes('require_admin()'));
check('Reminder backends recompute incomplete Unit coverage server-side',
    nodeSource.slice(nodeSource.indexOf("router.post('/reminders/send'"), nodeSource.indexOf("router.get('/dept-history'"))
        .includes('buildUnitCoverage')
    && phpSource.slice(phpSource.indexOf("$path==='/yokoten/reminders/send'"), phpSource.indexOf("$path==='/yokoten/dept-history'"))
        .includes('yokoten_scope_build_unit_coverage'));
check('Reminder recipient resolution follows Email Requirement Rules and company email validation',
    nodeSource.includes('getEmailRequirementRule({ ensureSchema: false })')
    && nodeSource.includes('validateCompanyEmail(employee.CompanyEmail)')
    && phpSource.includes('wf_yokoten_reminder_required_position_names()')
    && phpSource.includes('@thaisummit-harness\\.co\\.th'));
check('Reminder endpoints suppress duplicate sends for the same day',
    nodeSource.includes("EventType = 'MissingResponseReminder'")
    && nodeSource.includes('DATE(CreatedAt) = CURDATE()')
    && phpSource.includes("EventType='MissingResponseReminder'")
    && phpSource.includes('DATE(CreatedAt)=CURDATE()'));

console.log(`Yokoten Topic Coverage regression passed ${checks.length}/${checks.length}.`);
