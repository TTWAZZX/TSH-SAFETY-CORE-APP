'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const nodeRoute = read('backend/routes/hiyari.js');
const phpRoute = read('api/handlers/workflow_phase6.php');
const frontend = read('public/js/pages/hiyari.js');

const checks = [];
function check(name, condition) {
    assert.ok(condition, name);
    checks.push(name);
}

check('Node user visibility includes own/substitute and Closed learning reports',
    nodeRoute.includes("ReporterID = ? OR ${prefix}SubmittedByID = ? OR ${prefix}Status = 'Closed'"));
check('PHP user visibility includes own/substitute and Closed learning reports',
    phpRoute.includes("ReporterID=? OR {$prefix}SubmittedByID=? OR {$prefix}Status='Closed'"));
check('Node stats uses the same visibility contract',
    nodeRoute.includes("where += \" AND (ReporterID = ? OR SubmittedByID = ? OR Status = 'Closed')\""));
check('PHP stats uses the same visibility contract',
    phpRoute.includes("$where.=\" AND (ReporterID=? OR SubmittedByID=? OR Status='Closed')\""));
check('Node learning view sanitizes contact, source files, and audit internals',
    nodeRoute.includes('sanitizeHiyariReportForViewer')
        && nodeRoute.includes("'CompanyEmail', 'SubmittedByEmail', 'EmailRecipients', 'AttachmentUrl', 'AdditionalFileUrl'"));
check('PHP learning view sanitizes contact, source files, and audit internals',
    phpRoute.includes('wf_hiyari_sanitize_for_viewer')
        && phpRoute.includes("'CompanyEmail', 'SubmittedByEmail', 'EmailRecipients', 'AttachmentUrl', 'AdditionalFileUrl'"));
check('Learning report timeline is not exposed to non-owners in Node and PHP',
    nodeRoute.includes('return res.json({ success: true, data: [] });')
        && phpRoute.includes("if(!$admin&&!wf_hiyari_is_owner($row,$user))json_response(['success'=>true,'data'=>[]]);"));
check('Mutation ownership remains separate from learning read access',
    nodeRoute.includes('return isRequestAdmin(req) || isHiyariOwner(req, report);'));
check('Signed PDF selector only includes Approved rows without a signed PDF',
    frontend.includes("if (r.ReviewStatus !== 'Approved' || r.SignedFileUrl) return false;"));
check('Admin form exposes all approved business edit fields',
    ['ReportDate', 'Department', 'Location', 'Description', 'PotentialConsequence', 'Suggestion', 'RiskRank', 'StopType']
        .every(field => frontend.includes(`name=\"${field}\"`)));
check('Node admin update persists business fields and derives RiskLevel from Rank',
    nodeRoute.includes('RiskRank         = COALESCE(?, RiskRank)')
        && nodeRoute.includes('normalizedRank ? RANK_TO_RISK[normalizedRank] : null'));
check('PHP admin update persists business fields and derives RiskLevel from Rank',
    phpRoute.includes('SET ReportDate=?,Department=?,Location=?,Description=?,PotentialConsequence=?,Suggestion=?,RiskRank=?,RiskLevel=?,StopType=?')
        && phpRoute.includes('$riskLevel=$rank?wf_hiyari_risk_from_rank'));
check('Learning detail has an explicit read-only banner',
    frontend.includes('รายงานปิดงานสำหรับเรียนรู้') && frontend.includes('ข้อมูลแบบอ่านอย่างเดียว'));

console.log(`Hiyari learning/admin-edit smoke passed ${checks.length}/${checks.length}`);
for (const name of checks) console.log(`PASS ${name}`);
