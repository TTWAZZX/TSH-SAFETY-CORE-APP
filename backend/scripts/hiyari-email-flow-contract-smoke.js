const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const nodeRoute = read('backend/routes/hiyari.js');
const phpRoute = read('api/handlers/workflow_phase6.php');
const frontend = read('public/js/pages/hiyari.js');
const main = read('public/js/main.js');
const index = read('index.html');
const nodeAssignmentRoutes = nodeRoute.slice(
    nodeRoute.indexOf("router.post('/assignments'"),
    nodeRoute.indexOf("router.delete('/assignments/:id'")
);
const phpAssignmentRoutes = phpRoute.slice(
    phpRoute.indexOf("if(($method==='POST'&&$path==='/hiyari/assignments')"),
    phpRoute.indexOf("$p=route_params($path,'/hiyari/assignments/:id'); if($p!==null&&$method==='DELETE')")
);

let failures = 0;
let checks = 0;
function check(name, condition) {
    checks += 1;
    if (condition) {
        console.log(`PASS ${name}`);
        return;
    }
    failures += 1;
    console.error(`FAIL ${name}`);
}

const requiredEvents = [
    'Submitted',
    'SubmissionConfirmed',
    'DirectSignedSubmitted',
    'DirectSignedConfirmed',
    'Approved',
    'Rejected',
    'ReviewOverrideApproved',
    'ExcelResubmitted',
    'SignedFileUploaded',
    'Completed',
    'Closed',
    'Reopened',
    'OverdueReminder',
];

check('Node resolves Hiyari Admin before generic Admin and fallback',
    /process\.env\.HIYARI_ADMIN_EMAIL\s*\|\|\s*process\.env\.ADMIN_EMAIL\s*\|\|\s*DEFAULT_HIYARI_ADMIN_EMAIL/.test(nodeRoute));
check('PHP resolves Hiyari Admin through runtime config chain',
    phpRoute.includes("['hiyari_admin_email', 'admin_email']")
    && phpRoute.includes("filter_var($email, FILTER_VALIDATE_EMAIL)"));
check('Node queues both owner submission confirmations',
    nodeRoute.includes("eventType: 'SubmissionConfirmed'")
    && nodeRoute.includes("eventType: 'DirectSignedConfirmed'")
    && nodeRoute.includes('to: userRecipients.recipients'));
check('PHP queues both owner submission confirmations',
    phpRoute.includes("$direct?'DirectSignedConfirmed':'SubmissionConfirmed'")
    && phpRoute.includes("'Recipients'=>$recipientInfo['recipients']"));
check('Node has a dedicated completed template and uses it for signed upload',
    nodeRoute.includes('function buildUserCompletedEmail')
    && nodeRoute.includes('const completedMail = buildUserCompletedEmail({'));
check('PHP has a dedicated completed template and uses it for signed upload',
    phpRoute.includes('function wf_hiyari_completed_mail')
    && phpRoute.includes('$completed=wf_hiyari_completed_mail($row)'));
check('Completed owner template does not request another upload',
    nodeRoute.includes('ไม่ต้องอัปโหลดไฟล์ซ้ำ')
    && phpRoute.includes('ไม่ต้องอัปโหลดไฟล์ซ้ำ')
    && nodeRoute.includes('Signed PDF received / Completed')
    && phpRoute.includes('Signed PDF received / Completed'));
check('Approved-only review template no longer treats Completed as approval',
    nodeRoute.includes("const approved = reviewStatus === 'Approved';")
    && phpRoute.includes("$approved = $reviewStatus === 'Approved';"));
check('Node overdue action attempts delivery through standard outbox helper',
    /eventType:\s*'OverdueReminder'[\s\S]{0,300}deliveryAttempted:smtpConfigured\(\)/.test(nodeRoute)
    && nodeRoute.includes('await queueHiyariEmail({'));
check('PHP overdue action attempts delivery through standard outbox helper',
    phpRoute.includes("wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$r['id'],'EventType'=>'OverdueReminder'")
    && phpRoute.includes("'deliveryAttempted'=>mailer_smtp_configured()"));
check('Frontend describes send behavior and reports attempted delivery',
    frontend.includes('Send overdue reminders')
    && frontend.includes('Sending overdue reminders...')
    && frontend.includes("result?.deliveryAttempted?'Delivery attempted':'Queued for delivery'"));
check('Node and PHP resolve owner plus substitute submitter recipients',
    nodeRoute.includes('async function resolveHiyariUserRecipients')
    && nodeRoute.includes('SubmittedByID')
    && phpRoute.includes('function wf_hiyari_user_recipient_info')
    && phpRoute.includes("$row['SubmittedByID']"));
check('Status notifications use deduplicated owner and substitute recipients',
    nodeRoute.includes('to: userRecipients.recipients')
    && phpRoute.includes("'Recipients'=>$recipientInfo['recipients']"));
check('Assignment creation is independent of CompanyEmail readiness in Node and PHP',
    nodeAssignmentRoutes.includes('SELECT EmployeeName, Department FROM Employees')
    && !nodeAssignmentRoutes.includes('isValidCompanyEmail')
    && phpAssignmentRoutes.includes('SELECT EmployeeName,Department FROM employees')
    && !phpAssignmentRoutes.includes('wf_hiyari_is_company_email'));
check('Report submission accepts missing CompanyEmail in Node and PHP',
    nodeRoute.includes('companyEmail = await resolveReporterCompanyEmail(reporterId, CompanyEmail);')
    && !nodeRoute.includes('Employee Master has no CompanyEmail for this reporter.')
    && phpRoute.includes("$companyEmail=wf_hiyari_resolve_company_email($reporter,$b['CompanyEmail']??null);")
    && !phpRoute.includes('Employee Master has no CompanyEmail for this reporter.'));
check('Missing user email skips confirmation without blocking report submission',
    (nodeRoute.match(/if \(userRecipients\.recipients\) \{/g) || []).length >= 2
    && phpRoute.includes("if($recipientInfo['recipients']!=='')wf_email_outbox('hiyari_emailoutbox',['ReportID'=>$id"));
check('Frontend treats CompanyEmail as optional but validates a supplied value',
    frontend.includes('Company Email <span class="normal-case font-medium text-slate-400">(ไม่บังคับ)</span>')
    && !frontend.includes('id="hiyari-company-email" required')
    && frontend.includes('if (companyEmail && !_isCompanyEmail(companyEmail))')
    && frontend.includes("if (selectedAssignment && ownerChanged) input.value = '';"));
check('Bulk assignment failures surface the API reason per employee',
    frontend.includes("reason: error?.message ||")
    && frontend.includes("`${escHtml(item.name)}: ${escHtml(item.reason)}`"));
check('Hiyari assignment fix has a complete browser cache chain',
    main.includes("./pages/hiyari.js?v=20261109-hiyari-optional-email-r2")
    && index.includes('public/js/main.js?v=20261109-hiyari-optional-email-r2'));
check('Admin can resend the current status email with PHP and Node parity',
    nodeRoute.includes("router.post('/:id/resend-status-email'")
    && phpRoute.includes("route_params($path,'/hiyari/:id/resend-status-email')")
    && nodeRoute.includes('HIYARI_STATUS_EMAIL_RESEND')
    && phpRoute.includes('HIYARI_STATUS_EMAIL_RESEND')
    && nodeRoute.includes("emailStatus: delivery?.status || 'Unknown'")
    && phpRoute.includes("'emailStatus'=>$delivery['Status']??'Unknown'"));
check('Manage modal previews recipients and guards manual resend action',
    frontend.includes('btn-hiyari-resend-status-email')
    && frontend.includes('EmailRecipients')
    && frontend.includes("emailStatus === 'Sent'")
    && frontend.includes("guardActionHandler(async () =>"));
check('Node and PHP retain the complete Hiyari email event contract',
    requiredEvents.every((event) => nodeRoute.includes(event) && phpRoute.includes(event)));
check('Modified sources contain no Unicode replacement characters',
    !nodeRoute.includes('\uFFFD') && !phpRoute.includes('\uFFFD') && !frontend.includes('\uFFFD'));

console.log(`Hiyari email flow contract smoke: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
