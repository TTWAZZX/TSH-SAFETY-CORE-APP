'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'pages', 'safety-culture.js'), 'utf8');
const checks = [];

function check(name, fn) {
    fn();
    checks.push(name);
    console.log(`PASS ${name}`);
}

check('defaults Assessment to History and compact table mode', () => {
    assert.match(source, /let _asmtView = 'history';/);
    assert.match(source, /let _asmtTableMode = 'compact';/);
});

check('provides History, Overview, and Admin Setup subviews', () => {
    assert.match(source, /id: 'history', label: 'ประวัติการประเมิน'/);
    assert.match(source, /id: 'overview', label: 'ภาพรวมและแนวโน้ม'/);
    assert.match(source, /id: 'setup', label: 'ตั้งค่าจุดตรวจ'/);
});

check('keeps Setup hidden from non-Admin users', () => {
    assert.match(source, /_isAdmin \? \[\{ id: 'setup'/);
    assert.match(source, /if \(!_isAdmin && _asmtView === 'setup'\) _asmtView = 'history'/);
});

check('renders the location master only in Setup view', () => {
    assert.match(source, /if \(_asmtView === 'setup' && _isAdmin\)[\s\S]{0,180}buildAssessmentLocationsAdmin\(\)/);
});

check('uses a compact decision-oriented history table by default', () => {
    assert.match(source, /compactHeaders = \['วันที่','พื้นที่','จุดตรวจ','เฉลี่ย','ต้องติดตาม','ระดับ','Note',''\]/);
    assert.match(source, /_assessmentRowSummary\(a\)/);
});

check('retains full T1-T7 inspection scores in Detailed mode', () => {
    assert.match(source, /detailedHeaders = \['วันที่','พื้นที่','จุดตรวจ','T1','T2','T3','T4','T5','T6','T7','เฉลี่ย','ระดับ','Note',''\]/);
    assert.match(source, /_asmtTableMode === 'detailed'/);
});

check('prevents detailed columns from collapsing into overlapping text', () => {
    assert.match(source, /const columnWidths = _asmtTableMode === 'detailed'/);
    assert.match(source, /<colgroup>\$\{columnWidths\.map/);
    assert.match(source, /table-layout:fixed/);
    assert.match(source, /whitespace-nowrap/);
});

check('paginates Assessment history without changing the API', () => {
    assert.match(source, /records\.slice\(\(_asmtHistoryPage - 1\) \* _asmtPageSize, _asmtHistoryPage \* _asmtPageSize\)/);
    assert.match(source, /\[10, 20, 50\]/);
});

check('keeps History pagination state distinct from the Assessment PDF page builder', () => {
    assert.match(source, /let _asmtHistoryPage = 1/);
    assert.doesNotMatch(source, /let _asmtPage\s*=/);
    assert.match(source, /function _asmtPage\(/);
});

check('resets pagination when Assessment filters change', () => {
    assert.match(source, /_scSetAsmtMonth[\s\S]{0,150}_asmtHistoryPage = 1/);
    assert.match(source, /_scClearAsmtFilters[\s\S]{0,200}_asmtHistoryPage = 1/);
});

check('keeps existing detail, edit, delete, and PDF workflows', () => {
    assert.match(source, /window\._scViewAssessment/);
    assert.match(source, /window\._scEditAssessment/);
    assert.match(source, /window\._scDeleteAssessment/);
    assert.match(source, /window\._scExportAssessmentPDF/);
});

check('moves Notes and Maturity Guide into a collapsed additional section', () => {
    assert.match(source, /<details class="ds-section overflow-hidden">/);
    assert.match(source, /ข้อมูลเพิ่มเติม: Follow-up Notes และ Culture Maturity Guide/);
});

check('keeps the legacy layout as a local fallback only', () => {
    assert.match(source, /function buildAssessmentHtmlLegacy\(\)/);
    assert.match(source, /function buildAssessmentHtml\(\)/);
});

console.log(`Safety Culture Assessment layout regression passed ${checks.length}/${checks.length}.`);
