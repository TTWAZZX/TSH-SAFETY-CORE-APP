const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
}

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : '';
}

const nodeRoute = read('backend/routes/cccf.js');
const phpHandler = read('api/handlers/workflow_phase6.php');
const frontend = read('public/js/pages/cccf.js');
const mainJs = read('public/js/main.js');
const indexHtml = read('index.html');

const nodeComplete = sliceBetween(
  nodeRoute,
  "router.post('/form-a-permanent/:id/complete'",
  '// DELETE /cccf/form-a-permanent/:id'
);
const phpComplete = sliceBetween(
  phpHandler,
  "route_params($path,'/cccf/form-a-permanent/:id/complete')",
  "route_params($path,'/cccf/form-a-permanent/:id')"
);
const nodeOutbox = sliceBetween(
  nodeRoute,
  "router.get('/email-outbox'",
  "router.post('/email-outbox/:id/retry'"
);
const phpOutbox = sliceBetween(
  phpHandler,
  "if($method==='GET'&&$path==='/cccf/email-outbox')",
  "route_params($path,'/cccf/email-outbox/:id/retry')"
);

check('Node complete resolves owner recipient', nodeComplete.includes('resolveCccfPermanentOwnerRecipient(record)'));
check('Node complete returns idempotent alreadyCompleted', nodeComplete.includes('alreadyCompleted'));
check('Node complete queues Completed to owner email', nodeComplete.includes("to: ownerRecipient.email") && nodeComplete.includes("eventType: 'Completed'"));
check('Node complete does not fallback Completed to admin email', !nodeComplete.includes('getCccfAdminEmail()'));
check('Node outbox joins permanent and filters event type', nodeOutbox.includes('CCCF_EmailOutbox o') && nodeOutbox.includes('eventType'));
check('PHP owner recipient helper exists', phpHandler.includes('function wf_cccf_owner_recipient'));
check('PHP complete uses owner recipient', phpComplete.includes('wf_cccf_owner_recipient($row)'));
check('PHP complete does not fallback Completed to admin email', !phpComplete.includes('wf_cccf_admin_email()'));
check('PHP outbox joins permanent and filters event type', phpOutbox.includes('cccf_emailoutbox o') && phpOutbox.includes("$_GET['eventType']"));
check('Frontend shows owner preview before complete', frontend.includes('cccf-complete-recipient') && frontend.includes('getPermanentOwnerInfo(record)'));
check('Frontend hides repeat close action after completed', frontend.includes('const isCompleted') && frontend.includes('!isCompleted'));
check('Frontend has closed status label and filter', frontend.includes('ปิดงานแล้ว') && frontend.includes('cccf-email-event-filter'));
check('Cache bust points to the current CCCF Phase C1-C4 build', mainJs.includes('20260904-cccf-c1-c4-r1') && indexHtml.includes('20260904-cccf-c1-c4-r1'));

const failed = checks.filter(item => !item.pass);
checks.forEach(item => console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`));
if (failed.length) {
  console.error(`\n${failed.length} CCCF permanent owner complete smoke check(s) failed.`);
  process.exit(1);
}
console.log(`\nCCCF permanent owner complete smoke passed ${checks.length}/${checks.length}.`);
