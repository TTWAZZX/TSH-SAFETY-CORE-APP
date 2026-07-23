const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const node = read('backend/routes/forklift.js');
const php = read('api/handlers/forklift.php');
const ui = read('public/js/pages/forklift.js');

const checks = [
    ['Node request document schema', node.includes('forklift_request_documents')],
    ['PHP request document schema', php.includes('forklift_request_documents')],
    ['Node request event schema', node.includes('forklift_request_events')],
    ['PHP request event schema', php.includes('forklift_request_events')],
    ['Required training certificate', node.includes('TRAINING_CERTIFICATE') && php.includes('TRAINING_CERTIFICATE')],
    ['Required employee photo', node.includes('EMPLOYEE_PHOTO') && php.includes('EMPLOYEE_PHOTO')],
    ['Renewal-only document', node.includes('RENEWAL_DOCUMENT') && php.includes('RENEWAL_DOCUMENT')],
    ['Request document kind checklist', node.includes('requestDocumentItems') && php.includes('fl_request_document_items')],
    ['Request document carryover parity', node.includes('carryOverRequestDocuments') && php.includes('fl_carry_over_request_documents')],
    ['Draft creation parity', node.includes("'DRAFT'") && php.includes("'DRAFT'")],
    ['Submit route parity', node.includes("'/requests/:id/submit'") && php.includes('/forklift/requests/:id/submit')],
    ['Return route parity', node.includes("'/requests/:id/return'") && php.includes('/forklift/requests/:id/return')],
    ['Self approval guard parity', node.includes('selfApproval') && php.includes('$selfApproval')],
    ['Request workspace UI', ui.includes('openRequestDetail') && ui.includes('fl-request-doc-upload')],
    ['Timeline UI', ui.includes('Timeline') && ui.includes('detail.Events')],
    ['Renewal request route parity', node.includes("'/licenses/:id/renewal-request'") && php.includes('/forklift/licenses/:id/renewal-request')],
    ['Renewal source linkage', node.includes('SourceLicenseID') && php.includes('SourceLicenseID')],
    ['Renewal history parity', node.includes('forklift_license_renewals') && php.includes('forklift_license_renewals')],
    ['Renewal UI', ui.includes('openRenewalRequest') && ui.includes('fl-renew-request')],
    ['Request SLA setting parity', node.includes('request_sla_days') && php.includes('request_sla_days')],
    ['Request summary endpoint parity', node.includes("'/requests/summary'") && php.includes('/forklift/requests/summary')],
    ['Request SLA dashboard UI', ui.includes('_requestSummary') && ui.includes('เกิน SLA')],
    ['Returned request notification parity', node.includes('ForkliftRequestReturned') && php.includes('ForkliftRequestReturned')],
    ['Renewal approval notification parity', node.includes('ForkliftRenewalRequestApproved') && php.includes('ForkliftRenewalRequestApproved')],
    ['Overdue queue endpoint parity', node.includes("'/requests/overdue'") && php.includes('/forklift/requests/overdue')],
    ['SLA escalation action parity', node.includes("'/requests/escalations/send'") && php.includes('/forklift/requests/escalations/send')],
    ['SLA escalation audit parity', node.includes('ESCALATE_OVERDUE_REQUESTS') && php.includes('ESCALATE_OVERDUE_REQUESTS')],
    ['Request queue filter UI', ui.includes('fl-request-status-filter') && ui.includes('fl-request-kind-filter') && ui.includes('fl-request-overdue-filter')],
    ['Request document required UI', ui.includes('บังคับ') && ui.includes('item.accept')],
    ['One-way request submit UI', ui.includes('TrainingCertificateFile') && ui.includes('EmployeePhotoFile') && ui.includes('`/forklift/requests/${result.id}/submit`')],
    ['One-way renewal submit UI', ui.includes('RenewalDocumentFile') && ui.includes('`/forklift/requests/${result.id}/submit`')],
    ['Auto expiry UI', ui.includes('syncExpireDate') && ui.includes('DefaultValidityMonths') && ui.includes('วันหมดอายุใหม่ <span')],
    ['User card/docs action UI', ui.includes('<button class="fl-card') && ui.includes('<button class="fl-docs') && ui.includes("can('FORKLIFT_PRINT') ? '<button id=\"fl-card-print\"")],
    ['Card preview view permission parity', node.includes("router.get('/licenses/:id/card'") && !node.includes("router.get('/licenses/:id/card', async (req, res) => {\n    if (!(await requirePermission(req, res, 'FORKLIFT_PRINT'))) return;") && php.includes("if($card!==null&&$method==='GET'){ $payload=fl_card_payload")],
    ['Verify URL uses app base not upload base', node.includes('process.env.PUBLIC_APP_BASE_URL ||') && !node.includes('PUBLIC_APP_BASE_URL || process.env.PUBLIC_UPLOAD_BASE_URL')],
    ['Admin can edit published template fields parity', node.includes('Published template version can only be edited by Admin.') && ui.includes("String(version.Status || '').toLowerCase() === 'published' && !can('IS_ADMIN')")],
    ['Request kind badge UI', ui.includes('requestKindBadge') && ui.includes('ต่ออายุ') && ui.includes('ขอใหม่')],
    ['Renewal source detail UI', ui.includes('sourceLicensePanel') && ui.includes('SourceLicenseNo') && ui.includes('SourceExpireDate')],
    ['Approved registry hint UI', ui.includes('approvedRequestHint') && ui.includes('ดูบัตรและเอกสารได้ที่แท็บทะเบียนใบอนุญาต')],
    ['Request source select parity', node.includes('SourceLicenseNo') && php.includes('SourceLicenseNo') && node.includes('LEFT JOIN forklift_licenses src') && php.includes('LEFT JOIN forklift_licenses src')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
console.log(`Forklift request workflow smoke: ${checks.length - failed.length}/${checks.length} passed.`);
if (failed.length) process.exit(1);
