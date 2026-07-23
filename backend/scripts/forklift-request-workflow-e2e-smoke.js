const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const app = require('../server');
const db = require('../db');

const ROOT = path.join(__dirname, '..', '..');
const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
const artifactDir = path.join(ROOT, 'backups', 'local', `forklift-request-workflow-e2e-${stamp}`);
const result = {
  ok: false,
  stamp,
  checks: [],
  created: {
    employeeIds: [`FLREQ${stamp.slice(6)}`, `FLREN${stamp.slice(6)}`, `FLSLA${stamp.slice(6)}`],
    requestIds: [],
    licenseIds: [],
    documentIds: [],
  },
  cleanup: {},
};

function check(name, condition, detail = {}) {
  result.checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) {
    const err = new Error(`Smoke check failed: ${name}`);
    err.detail = detail;
    throw err;
  }
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function uploadPathFromUrl(url) {
  if (!url) return null;
  let pathname = url;
  try { pathname = new URL(url).pathname; } catch (_) {}
  const basename = path.basename(pathname);
  if (!basename || basename === '.' || basename === '/') return null;
  const candidates = [
    path.join(ROOT, 'backend', 'uploads', basename),
    path.join(ROOT, 'uploads', basename),
  ];
  return candidates.find(file => fs.existsSync(file)) || null;
}

function pdfBlob(label) {
  return new Blob([`%PDF-1.4\n% ${label} ${stamp}\n%%EOF\n`], { type: 'application/pdf' });
}

function pngBlob(label) {
  return new Blob([`PNG smoke image ${label} ${stamp}`], { type: 'image/png' });
}

function tokenFor(user) {
  return jwt.sign({
    id: String(user.EmployeeID),
    name: String(user.EmployeeName || user.EmployeeID),
    department: String(user.Department || ''),
    unit: String(user.Unit || ''),
    role: String(user.Role || user.role || 'User'),
  }, process.env.JWT_SECRET, { expiresIn: '45m' });
}

async function cleanup() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [docs] = result.created.requestIds.length
      ? await conn.query(`SELECT ID,FileUrl FROM forklift_request_documents WHERE RequestID IN (${result.created.requestIds.map(() => '?').join(',')})`, result.created.requestIds)
      : [[]];
    for (const doc of docs) {
      const filePath = uploadPathFromUrl(doc.FileUrl);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        result.cleanup.deletedFiles = (result.cleanup.deletedFiles || 0) + 1;
      }
    }
    if (result.created.requestIds.length) {
      const placeholders = result.created.requestIds.map(() => '?').join(',');
      const [docsDel] = await conn.query(`DELETE FROM forklift_request_documents WHERE RequestID IN (${placeholders})`, result.created.requestIds);
      const [eventsDel] = await conn.query(`DELETE FROM forklift_request_events WHERE RequestID IN (${placeholders})`, result.created.requestIds);
      const [typesDel] = await conn.query(`DELETE FROM forklift_request_type_map WHERE RequestID IN (${placeholders})`, result.created.requestIds);
      const [requestsDel] = await conn.query(`DELETE FROM forklift_license_requests WHERE ID IN (${placeholders})`, result.created.requestIds);
      result.cleanup.requestDocuments = docsDel.affectedRows;
      result.cleanup.requestEvents = eventsDel.affectedRows;
      result.cleanup.requestTypes = typesDel.affectedRows;
      result.cleanup.requests = requestsDel.affectedRows;
    }

    if (result.created.licenseIds.length) {
      const placeholders = result.created.licenseIds.map(() => '?').join(',');
      const [outboxDel] = await conn.query(`DELETE FROM Forklift_EmailOutbox WHERE LicenseID IN (${placeholders}) OR EmployeeID IN (${result.created.employeeIds.map(() => '?').join(',')})`, [...result.created.licenseIds, ...result.created.employeeIds]);
      const [renewalsDel] = await conn.query(`DELETE FROM forklift_license_renewals WHERE LicenseID IN (${placeholders})`, result.created.licenseIds);
      const [licenseDocsDel] = await conn.query(`DELETE FROM forklift_license_documents WHERE LicenseID IN (${placeholders})`, result.created.licenseIds);
      const [tokensDel] = await conn.query(`DELETE FROM forklift_verification_tokens WHERE LicenseID IN (${placeholders})`, result.created.licenseIds);
      const [typeMapDel] = await conn.query(`DELETE FROM forklift_license_type_map WHERE LicenseID IN (${placeholders})`, result.created.licenseIds);
      const [licensesDel] = await conn.query(`DELETE FROM forklift_licenses WHERE ID IN (${placeholders})`, result.created.licenseIds);
      result.cleanup.outbox = outboxDel.affectedRows;
      result.cleanup.renewals = renewalsDel.affectedRows;
      result.cleanup.licenseDocuments = licenseDocsDel.affectedRows;
      result.cleanup.tokens = tokensDel.affectedRows;
      result.cleanup.licenseTypes = typeMapDel.affectedRows;
      result.cleanup.licenses = licensesDel.affectedRows;
    } else if (result.created.employeeIds.length) {
      const [outboxDel] = await conn.query(`DELETE FROM Forklift_EmailOutbox WHERE EmployeeID IN (${result.created.employeeIds.map(() => '?').join(',')})`, result.created.employeeIds);
      result.cleanup.outbox = outboxDel.affectedRows;
    }

    const [photosDel] = await conn.query(`DELETE FROM forklift_employee_photos WHERE EmployeeID IN (${result.created.employeeIds.map(() => '?').join(',')})`, result.created.employeeIds);
    result.cleanup.employeePhotos = photosDel.affectedRows;
    const [employeesDel] = await conn.query(`DELETE FROM Employees WHERE EmployeeID IN (${result.created.employeeIds.map(() => '?').join(',')})`, result.created.employeeIds);
    result.cleanup.employees = employeesDel.affectedRows;
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    result.cleanup.error = err.message;
    throw err;
  } finally {
    conn.release();
  }
}

async function uploadRequestDoc(api, requestId, type, suffix, blob = pdfBlob(`${type}-${suffix}`), ext = 'pdf') {
  const form = new FormData();
  form.append('DocumentType', type);
  form.append('file', blob, `${type.toLowerCase()}-${suffix}.${ext}`);
  const uploaded = await api(`/forklift/requests/${requestId}/documents`, { method: 'POST', body: form });
  result.created.documentIds.push(uploaded.id);
}

async function uploadRequiredDocs(api, requestId, suffix, { renewal = false } = {}) {
  await uploadRequestDoc(api, requestId, 'TRAINING_CERTIFICATE', suffix);
  await uploadRequestDoc(api, requestId, 'EMPLOYEE_PHOTO', suffix, pngBlob(`${suffix}-photo`), 'png');
  if (renewal) await uploadRequestDoc(api, requestId, 'RENEWAL_DOCUMENT', suffix);
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  let server;
  try {
    const [[admin]] = await db.query("SELECT EmployeeID,EmployeeName,Department,Unit,Role FROM Employees WHERE LOWER(Role)='admin' ORDER BY EmployeeID LIMIT 1");
    check('admin user available for signed local token', Boolean(admin), {});

    const employees = [
      [result.created.employeeIds[0], 'Forklift Request E2E User', 'SMOKE', 'SMOKE-REQ', 'Smoke Driver', 'User', `flreq.${stamp}@example.com`],
      [result.created.employeeIds[1], 'Forklift Renewal E2E User', 'SMOKE', 'SMOKE-REN', 'Smoke Driver', 'User', `flren.${stamp}@example.com`],
      [result.created.employeeIds[2], 'Forklift SLA E2E User', 'SMOKE', 'SMOKE-SLA', 'Smoke Driver', 'User', `flsla.${stamp}@example.com`],
    ];
    for (const row of employees) {
      await db.query(
        `INSERT INTO Employees(EmployeeID,EmployeeName,Department,Unit,Position,Role,CompanyEmail)
         VALUES(?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE EmployeeName=VALUES(EmployeeName),Department=VALUES(Department),Unit=VALUES(Unit),Position=VALUES(Position),Role=VALUES(Role),CompanyEmail=VALUES(CompanyEmail)`,
        row
      );
    }

    server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const makeApi = authToken => async (endpoint, options = {}) => {
      const res = await fetch(`${base}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.message || `${res.status} ${res.statusText}`);
        err.response = data;
        err.status = res.status;
        throw err;
      }
      return data;
    };
    const adminApi = makeApi(tokenFor({ ...admin, Role: 'Admin' }));
    const userApi = makeApi(tokenFor({ EmployeeID: result.created.employeeIds[0], EmployeeName: employees[0][1], Department: 'SMOKE', Unit: 'SMOKE-REQ', Role: 'User' }));
    const renewalUserApi = makeApi(tokenFor({ EmployeeID: result.created.employeeIds[1], EmployeeName: employees[1][1], Department: 'SMOKE', Unit: 'SMOKE-REN', Role: 'User' }));
    const slaUserApi = makeApi(tokenFor({ EmployeeID: result.created.employeeIds[2], EmployeeName: employees[2][1], Department: 'SMOKE', Unit: 'SMOKE-SLA', Role: 'User' }));

    const types = await adminApi('/forklift/license-types');
    const type = (types.data || []).find(row => row.Code === 'FORKLIFT') || types.data?.[0];
    check('license type seed available', Boolean(type?.ID), { count: types.data?.length || 0 });

    const draft = await userApi('/forklift/requests', {
      method: 'POST',
      body: JSON.stringify({
        EmployeeID: result.created.employeeIds[0],
        LicenseTypeID: type.ID,
        IssueDate: todayPlus(0),
        ExpireDate: todayPlus(365),
        CertificateNo: `REQ-${stamp}`,
        Note: `E2E request ${stamp}`,
      }),
    });
    result.created.requestIds.push(draft.id);
    check('user creates NEW request draft', draft.id && draft.RequestStatus === 'DRAFT', draft);

    await uploadRequestDoc(userApi, draft.id, 'TRAINING_CERTIFICATE', 'new-incomplete');
    let incompleteBlocked = false;
    try {
      await userApi(`/forklift/requests/${draft.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
    } catch (err) {
      incompleteBlocked = err.status === 409 && (err.response?.checklist || []).some(item => item.type === 'EMPLOYEE_PHOTO' && item.complete === false);
    }
    check('NEW request requires employee photo before submit', incompleteBlocked, {});

    await uploadRequiredDocs(userApi, draft.id, 'new-a');
    let detail = (await userApi(`/forklift/requests/${draft.id}`)).data;
    check('required checklist complete before submit', detail.CanSubmit === true && (detail.Documents || []).length >= 2, { checklist: detail.Checklist, docs: detail.Documents?.length });
    await userApi(`/forklift/requests/${draft.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
    detail = (await userApi(`/forklift/requests/${draft.id}`)).data;
    check('user submits request', detail.RequestStatus === 'SUBMITTED', { status: detail.RequestStatus });

    let selfApprovalBlocked = false;
    try {
      await userApi(`/forklift/requests/${draft.id}/approve`, { method: 'POST', body: JSON.stringify({ ReviewNote: 'self approve attempt' }) });
    } catch (err) {
      selfApprovalBlocked = err.status === 403;
    }
    check('self-approval is blocked', selfApprovalBlocked, {});

    await adminApi(`/forklift/requests/${draft.id}/start-review`, { method: 'POST', body: JSON.stringify({}) });
    await adminApi(`/forklift/requests/${draft.id}/return`, { method: 'POST', body: JSON.stringify({ ReviewNote: 'Please replace document for E2E smoke' }) });
    detail = (await userApi(`/forklift/requests/${draft.id}`)).data;
    check('admin can return request', detail.RequestStatus === 'RETURNED' && (detail.Events || []).some(e => e.EventType === 'RETURNED'), { status: detail.RequestStatus });

    await uploadRequiredDocs(userApi, draft.id, 'new-b');
    await userApi(`/forklift/requests/${draft.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
    const approved = await adminApi(`/forklift/requests/${draft.id}/approve`, { method: 'POST', body: JSON.stringify({ ReviewNote: 'Approved by E2E smoke' }) });
    result.created.licenseIds.push(approved.id);
    detail = (await adminApi(`/forklift/requests/${draft.id}`)).data;
    check('admin approves NEW request and creates license', detail.RequestStatus === 'APPROVED' && Number(detail.LicenseID) === Number(approved.id), { status: detail.RequestStatus, licenseId: detail.LicenseID });
    const [[newCarryover]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM forklift_license_documents WHERE LicenseID=?) AS licenseDocs,
        (SELECT COUNT(*) FROM forklift_employee_photos WHERE EmployeeID=? AND DeletedAt IS NULL) AS employeePhotos`,
      [approved.id, result.created.employeeIds[0]]
    );
    check('approval carries certificate and employee photo to license records', Number(newCarryover.licenseDocs || 0) >= 1 && Number(newCarryover.employeePhotos || 0) >= 1, newCarryover);

    const sourceLicense = await adminApi('/forklift/licenses', {
      method: 'POST',
      body: JSON.stringify({
        EmployeeID: result.created.employeeIds[1],
        LicenseTypeID: type.ID,
        IssueDate: todayPlus(-365),
        ExpireDate: todayPlus(30),
        CertificateNo: `REN-OLD-${stamp}`,
        Note: `E2E renewal source ${stamp}`,
      }),
    });
    result.created.licenseIds.push(sourceLicense.id);
    const renewalDraft = await renewalUserApi(`/forklift/licenses/${sourceLicense.id}/renewal-request`, {
      method: 'POST',
      body: JSON.stringify({
        NewIssueDate: todayPlus(31),
        NewExpireDate: todayPlus(396),
        NewCertificateNo: `REN-NEW-${stamp}`,
        RenewalNote: `E2E renewal ${stamp}`,
      }),
    });
    result.created.requestIds.push(renewalDraft.id);
    await uploadRequiredDocs(renewalUserApi, renewalDraft.id, 'renewal', { renewal: true });
    await renewalUserApi(`/forklift/requests/${renewalDraft.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
    const renewalApproved = await adminApi(`/forklift/requests/${renewalDraft.id}/approve`, { method: 'POST', body: JSON.stringify({ ReviewNote: 'Renewal approved by E2E smoke' }) });
    const renewed = await adminApi(`/forklift/licenses/${sourceLicense.id}`);
    const renewalRows = await adminApi(`/forklift/licenses/${sourceLicense.id}/renewals`);
    check('renewal approval updates existing license', Number(renewalApproved.id) === Number(sourceLicense.id) && renewed.data.CertificateNo === `REN-NEW-${stamp}` && (renewalRows.data || []).length >= 1, {
      approval: renewalApproved,
      certificate: renewed.data?.CertificateNo,
      renewals: renewalRows.data?.length,
    });
    const [[renewalCarryover]] = await db.query('SELECT COUNT(*) AS licenseDocs FROM forklift_license_documents WHERE LicenseID=? AND DocumentType IN (?,?)', [sourceLicense.id, 'training_certificate', 'renewal_document']);
    check('renewal approval carries training and renewal documents', Number(renewalCarryover.licenseDocs || 0) >= 2, renewalCarryover);

    const slaDraft = await slaUserApi('/forklift/requests', {
      method: 'POST',
      body: JSON.stringify({
        EmployeeID: result.created.employeeIds[2],
        LicenseTypeID: type.ID,
        IssueDate: todayPlus(0),
        ExpireDate: todayPlus(365),
        CertificateNo: `SLA-${stamp}`,
        Note: `E2E overdue ${stamp}`,
      }),
    });
    result.created.requestIds.push(slaDraft.id);
    await uploadRequiredDocs(slaUserApi, slaDraft.id, 'sla');
    await slaUserApi(`/forklift/requests/${slaDraft.id}/submit`, { method: 'POST', body: JSON.stringify({}) });
    await db.query("UPDATE forklift_license_requests SET SubmittedAt=DATE_SUB(NOW(), INTERVAL 8 DAY), RequestedAt=DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE ID=?", [slaDraft.id]);
    const overdue = await adminApi('/forklift/requests/overdue');
    check('overdue endpoint includes SLA-aged request', (overdue.data || []).some(row => Number(row.ID) === Number(slaDraft.id)), { overdueCount: overdue.data?.length || 0 });
    const escalation = await adminApi('/forklift/requests/escalations/send', { method: 'POST', body: JSON.stringify({ ids: [slaDraft.id] }) });
    const [[slaEvent]] = await db.query("SELECT COUNT(*) AS count FROM forklift_request_events WHERE RequestID=? AND EventType='SLA_ESCALATED'", [slaDraft.id]);
    check('selected escalation queues local email and records event', Number(escalation.data?.queued || 0) === 1 && Number(slaEvent.count || 0) >= 1, { escalation: escalation.data, events: slaEvent.count });

    const summarySelf = await slaUserApi('/forklift/requests/summary');
    const summaryAdmin = await adminApi('/forklift/requests/summary');
    check('request summary scopes self vs approver queue', summarySelf.data?.scope === 'SELF' && summaryAdmin.data?.scope === 'ALL', { self: summarySelf.data?.scope, admin: summaryAdmin.data?.scope });

    await cleanup();
    const [[left]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM forklift_license_requests WHERE ID IN (${result.created.requestIds.map(() => '?').join(',')})) AS requests,
        (SELECT COUNT(*) FROM forklift_licenses WHERE ID IN (${result.created.licenseIds.map(() => '?').join(',')})) AS licenses,
        (SELECT COUNT(*) FROM Employees WHERE EmployeeID IN (${result.created.employeeIds.map(() => '?').join(',')})) AS employees`,
      [...result.created.requestIds, ...result.created.licenseIds, ...result.created.employeeIds]
    );
    check('cleanup removed temporary E2E DB rows', left.requests === 0 && left.licenses === 0 && left.employees === 0, left);
    result.ok = true;
  } catch (err) {
    result.error = { message: err.message, detail: err.detail || err.response || null, status: err.status || null };
    try { await cleanup(); } catch (cleanupErr) { result.cleanup.errorAfterFailure = cleanupErr.message; }
    throw err;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.end();
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: result.ok, artifactDir, checks: result.checks.length, cleanup: result.cleanup, error: result.error || null }, null, 2));
  }
}

main().catch(() => process.exit(1));
