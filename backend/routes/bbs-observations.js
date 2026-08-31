'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { logAudit } = require('../utils/audit');
const { bangkokIsoDate, normalizeIsoDate, levelRank } = require('../services/bbs-phase1');
const { resolveCandidates } = require('../services/bbs-checklist');
const { clean, normalizeAnswers, validateSubmission, businessWeekdays } = require('../services/bbs-observation');
const { createActionsForObservation } = require('../services/bbs-action');
const { computeCompliance } = require('../services/bbs-inspector-schedule');

const router = express.Router();
const privateDir = path.join(__dirname, '..', 'private-uploads', 'bbs');
fs.mkdirSync(privateDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, privateDir),
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(18).toString('hex')}${({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' })[file.mimetype] || ''}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const actorId = req => String(req.user?.id || req.user?.EmployeeID || '').trim();
const isAdmin = req => String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

function sqlDate(value) {
    if (value instanceof Date) return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return String(value || '').slice(0, 10);
}

function verifiedImageMime(filePath) {
    const head = fs.readFileSync(filePath).subarray(0, 16);
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
    if (head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return null;
}

function phase3Error(res, error, label) {
    console.error(`[bbs-phase3] ${label}:`, error?.message || error);
    if (error?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success: false, code: 'BBS_OBSERVATION_SETUP_REQUIRED', message: 'BBS Phase 3 database migration is required.' });
    return res.status(500).json({ success: false, message: 'Unable to process the BBS observation request.' });
}

async function employeeContext(employeeId, asOf, queryable = db) {
    const [[row]] = await queryable.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                md.id DepartmentID,su.id SafetyUnitID,mp.id PositionID,m.BBSLevel,
                COALESCE(elig.Eligibility,'active') Eligibility
           FROM Employees e
           LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department))
           LEFT JOIN Master_SafetyUnits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit))
           LEFT JOIN Master_Positions mp ON LOWER(TRIM(mp.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=mp.id AND m.IsActive=1
           LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(SELECT x.id FROM BBS_Employee_Eligibility x WHERE x.EmployeeID=e.EmployeeID AND x.IsActive=1 AND x.EffectiveFrom<=? AND (x.EffectiveTo IS NULL OR x.EffectiveTo>=?) ORDER BY x.EffectiveFrom DESC,x.id DESC LIMIT 1)
          WHERE LOWER(TRIM(e.EmployeeID))=LOWER(TRIM(?)) LIMIT 1`, [asOf, asOf, employeeId]);
    return row || null;
}

async function canObserve(req, observed, asOf, queryable = db) {
    if (isAdmin(req)) return true;
    const observer = await employeeContext(actorId(req), asOf, queryable);
    if (!observer || observer.Eligibility !== 'active' || levelRank(observer.BBSLevel) < levelRank('Group Leader')) return false;
    const [[enrollment]] = await queryable.query("SELECT id FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND DepartmentID=? AND SafetyUnitID=? AND Status='Active' AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [actorId(req), observer.DepartmentID, observer.SafetyUnitID, asOf, asOf]);
    if (!enrollment) return false;
    const [[pilot]] = await queryable.query("SELECT id FROM BBS_Pilot_Scopes WHERE DepartmentID=? AND SafetyUnitID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [observer.DepartmentID, observer.SafetyUnitID, asOf, asOf]);
    if (!pilot) return false;
    const [[assignment]] = await queryable.query("SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [actorId(req), observed.EmployeeID, asOf, asOf]);
    return Boolean(assignment);
}

async function canRead(req, observation, queryable = db) {
    if (isAdmin(req)) return true;
    const id = actorId(req);
    if (id === String(observation.ObserverEmployeeID) || id === String(observation.ObservedEmployeeID)) return true;
    const date = sqlDate(observation.ObservationDate);
    const [[assignment]] = await queryable.query("SELECT id FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND MemberEmployeeID=? AND DepartmentID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1", [id, observation.ObservedEmployeeID, observation.ObservedDepartmentID, date, date]);
    return Boolean(assignment);
}

async function loadObservation(id, queryable = db) {
    const [[observation]] = await queryable.query(
        `SELECT o.*,v.VersionNo,t.TemplateCode,t.TemplateName
           FROM BBS_Observations o JOIN BBS_Checklist_Versions v ON v.id=o.ChecklistVersionID
           JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID WHERE o.id=? LIMIT 1`, [id]);
    if (!observation) return null;
    const [answers] = await queryable.query(
        `SELECT a.*,COUNT(f.id) EvidenceCount
           FROM BBS_Observation_Answers a LEFT JOIN BBS_Observation_Files f ON f.AnswerID=a.id
          WHERE a.ObservationID=? GROUP BY a.id ORDER BY a.SortOrder,a.id`, [id]);
    const [files] = await queryable.query('SELECT id,ObservationID,AnswerID,OriginalName,MimeType,FileSize,CreatedAt FROM BBS_Observation_Files WHERE ObservationID=? ORDER BY id', [id]);
    return { ...observation, answers, files };
}

async function resolveChecklist(observed, asOf, queryable = db) {
    const [candidates] = await queryable.query(
        `SELECT s.*,v.id VersionID,v.VersionNo,v.EffectiveFrom,v.EffectiveTo,t.id TemplateID,t.TemplateCode,t.TemplateName
           FROM BBS_Checklist_Scope_Mappings s JOIN BBS_Checklist_Versions v ON v.id=s.VersionID AND v.Status='Published'
           JOIN BBS_Checklist_Templates t ON t.id=v.TemplateID AND t.IsActive=1
          WHERE s.IsActive=1 AND v.EffectiveFrom<=? AND COALESCE(v.EffectiveTo,'9999-12-31')>=?`, [asOf, asOf]);
    return resolveCandidates(candidates, { departmentId: observed.DepartmentID, safetyUnitId: observed.SafetyUnitID, positionId: observed.PositionID, bbsLevel: observed.BBSLevel });
}

async function batchEnabled(queryable = db) {
    const [[row]] = await queryable.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='batch_observation_enabled' LIMIT 1");
    return String(row?.SettingValue || '0') === '1';
}

function batchEmployeeIds(value) {
    if (!Array.isArray(value)) return null;
    const ids = [...new Set(value.map(item => clean(item, 20)).filter(Boolean))];
    return ids.length >= 2 && ids.length <= 50 ? ids : null;
}

function normalizeBatchMembers(value) {
    if (!Array.isArray(value) || value.length < 2 || value.length > 50) return { ok: false, message: 'Batch members must contain 2-50 employees.' };
    const observations = new Set(); const members = [];
    for (const entry of value) {
        const observationId = positiveInt(entry?.observationId);
        const parsed = normalizeAnswers(entry?.answers);
        if (!observationId || observations.has(observationId) || !parsed.ok) return { ok: false, message: parsed.message || 'Each batch member must have a unique observationId.' };
        observations.add(observationId);
        members.push({ observationId, rowVersion: entry?.rowVersion === undefined ? null : Number(entry.rowVersion), generalRemark: clean(entry?.generalRemark), answers: parsed.answers });
    }
    return { ok: true, members };
}

async function loadBatch(id, queryable = db) {
    const [[batch]] = await queryable.query('SELECT * FROM BBS_Observation_Batches WHERE id=? LIMIT 1', [id]);
    if (!batch) return null;
    const [memberRows] = await queryable.query('SELECT * FROM BBS_Observation_Batch_Members WHERE BatchID=? ORDER BY ChecklistVersionID,SortOrder,id', [id]);
    const members = [];
    for (const member of memberRows) members.push({ ...member, observation: await loadObservation(member.ObservationID, queryable) });
    const groups = [];
    for (const member of members) {
        let group = groups.find(item => Number(item.checklistVersionId) === Number(member.ChecklistVersionID));
        if (!group) {
            group = { checklistVersionId: Number(member.ChecklistVersionID), templateName: member.observation?.TemplateName || '', versionNo: Number(member.observation?.VersionNo || 0), members: [] };
            groups.push(group);
        }
        group.members.push(member);
    }
    return { ...batch, members, groups };
}

async function resolveBatchEmployees(req, employeeIds, observationDate, queryable) {
    const observer = await employeeContext(actorId(req), observationDate, queryable);
    if (!observer) return { ok: false, status: 404, message: 'Observer is not available in Employee Master.' };
    const resolvedEmployees = [];
    for (const employeeId of employeeIds) {
        if (employeeId.toLowerCase() === actorId(req).toLowerCase()) return { ok: false, status: 400, message: 'Self-observation is not allowed.' };
        const observed = await employeeContext(employeeId, observationDate, queryable);
        if (!observed) return { ok: false, status: 404, message: `Employee ${employeeId} is not available in Employee Master.` };
        if (!await canObserve(req, observed, observationDate, queryable)) return { ok: false, status: 403, code: 'OBSERVATION_SCOPE_DENIED', message: `Employee ${employeeId} is outside your active assignment scope.` };
        const resolved = await resolveChecklist(observed, observationDate, queryable);
        if (!resolved.ok) return { ok: false, status: resolved.code === 'CHECKLIST_CONFLICT' ? 409 : 404, ...resolved, employeeId };
        const versionId = Number(resolved.selected.VersionID);
        const [items] = await queryable.query(`SELECT i.*,c.CategoryName,c.SortOrder CategorySort FROM BBS_Checklist_Items i JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.VersionID=? ORDER BY c.SortOrder,c.id,i.SortOrder,i.id`, [versionId]);
        if (!items.length) return { ok: false, status: 409, message: `Resolved checklist for ${employeeId} has no items.` };
        resolvedEmployees.push({ observed, resolved, versionId, items });
    }
    return { ok: true, observer, employees: resolvedEmployees };
}

router.post('/batch-observations/preview', async (req, res) => {
    try {
        if (!await batchEnabled()) return res.status(503).json({ success: false, code: 'BATCH_OBSERVATION_DISABLED', message: 'Batch observation is currently disabled.' });
        const employeeIds = batchEmployeeIds(req.body?.observedEmployeeIds);
        const observationDate = normalizeIsoDate(req.body?.observationDate || bangkokIsoDate(), { required: true });
        if (!employeeIds || !observationDate) return res.status(400).json({ success: false, message: 'Select 2-50 unique employees and a valid observation date.' });
        const result = await resolveBatchEmployees(req, employeeIds, observationDate, db);
        if (!result.ok) return res.status(result.status).json({ success: false, ...result });
        const groups = [];
        for (const item of result.employees) {
            let group = groups.find(row => row.checklistVersionId === item.versionId);
            if (!group) { group = { checklistVersionId: item.versionId, templateName: item.resolved.selected.TemplateName, versionNo: Number(item.resolved.selected.VersionNo), employees: [], items: item.items }; groups.push(group); }
            group.employees.push(item.observed);
        }
        res.json({ success: true, data: { observationDate, employeeCount: employeeIds.length, groupCount: groups.length, groups } });
    } catch (error) { return phase3Error(res, error, 'batch preview'); }
});

router.get('/batch-observations/draft/active', async (req, res) => {
    try {
        if (!await batchEnabled()) return res.json({ success: true, data: null });
        const [[row]] = await db.query("SELECT id FROM BBS_Observation_Batches WHERE ObserverEmployeeID=? AND Status='Draft' ORDER BY UpdatedAt DESC,id DESC LIMIT 1", [actorId(req)]);
        res.json({ success: true, data: row ? await loadBatch(row.id) : null });
    } catch (error) { return phase3Error(res, error, 'active batch draft'); }
});

router.post('/batch-observations/draft', async (req, res) => {
    const employeeIds = batchEmployeeIds(req.body?.observedEmployeeIds);
    const observationDate = normalizeIsoDate(req.body?.observationDate || bangkokIsoDate(), { required: true });
    const key = clean(req.body?.idempotencyKey, 80);
    if (!employeeIds || !observationDate || !/^[A-Za-z0-9._:-]{8,55}$/.test(key)) return res.status(400).json({ success: false, message: 'Select 2-50 employees, a valid date, and an idempotency key.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        if (!await batchEnabled(conn)) { await conn.rollback(); return res.status(503).json({ success: false, code: 'BATCH_OBSERVATION_DISABLED', message: 'Batch observation is currently disabled.' }); }
        const [[existing]] = await conn.query('SELECT id,ObservationDate FROM BBS_Observation_Batches WHERE ObserverEmployeeID=? AND IdempotencyKey=? LIMIT 1 FOR UPDATE', [actorId(req), key]);
        if (existing) {
            const [existingMembers] = await conn.query('SELECT ObservedEmployeeID FROM BBS_Observation_Batch_Members WHERE BatchID=? ORDER BY ObservedEmployeeID', [existing.id]);
            const prior = existingMembers.map(row => String(row.ObservedEmployeeID).toLowerCase()).sort();
            const requested = employeeIds.map(value => value.toLowerCase()).sort();
            if (sqlDate(existing.ObservationDate) !== observationDate || JSON.stringify(prior) !== JSON.stringify(requested)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'IDEMPOTENCY_CONFLICT', message: 'This request key is already used for another batch selection.' }); }
            await conn.commit(); return res.json({ success: true, reused: true, data: await loadBatch(existing.id) });
        }
        const result = await resolveBatchEmployees(req, employeeIds, observationDate, conn);
        if (!result.ok) { await conn.rollback(); return res.status(result.status).json({ success: false, ...result }); }
        const groupCount = new Set(result.employees.map(item => item.versionId)).size;
        const batchNo = `BBS-BATCH-${observationDate.replaceAll('-', '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        const [batch] = await conn.query("INSERT INTO BBS_Observation_Batches(BatchNo,ObserverEmployeeID,ObservationDate,Status,IdempotencyKey,EmployeeCount,ChecklistGroupCount) VALUES(?,?,?,'Draft',?,?,?)", [batchNo, actorId(req), observationDate, key, employeeIds.length, groupCount]);
        let memberSort = 0;
        for (const item of result.employees) {
            memberSort += 1;
            const observed = item.observed;
            const no = `BBS-${observationDate.replaceAll('-', '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
            const observationKey = `batch:${crypto.createHash('sha256').update(`${key}:${observed.EmployeeID}`).digest('hex')}`;
            const [created] = await conn.query(`INSERT INTO BBS_Observations(ObservationNo,ObserverEmployeeID,ObservedEmployeeID,ChecklistVersionID,Status,ObservationDate,ObservedAt,ResolutionReason,ObserverNameSnapshot,ObserverDepartmentSnapshot,ObserverUnitSnapshot,ObserverPositionSnapshot,ObservedNameSnapshot,ObservedDepartmentSnapshot,ObservedUnitSnapshot,ObservedPositionSnapshot,ObservedDepartmentID,ObservedSafetyUnitID,ObservedPositionID,ObservedBBSLevel,IdempotencyKey) VALUES(?,?,?,?,'Draft',?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [no,result.observer.EmployeeID,observed.EmployeeID,item.versionId,observationDate,item.resolved.reason,result.observer.EmployeeName,result.observer.Department,result.observer.Unit,result.observer.Position,observed.EmployeeName,observed.Department,observed.Unit,observed.Position,observed.DepartmentID,observed.SafetyUnitID,observed.PositionID,observed.BBSLevel,observationKey]);
            let answerSort = 0;
            for (const checklistItem of item.items) { answerSort += 1; await conn.query(`INSERT INTO BBS_Observation_Answers(ObservationID,ChecklistItemID,CategoryNameSnapshot,ItemCodeSnapshot,ItemPromptSnapshot,IsRequiredSnapshot,UnsafeRequiresRemarkSnapshot,UnsafeRequiresPhotoSnapshot,UnsafeRequiresActionSnapshot,SortOrder) VALUES(?,?,?,?,?,?,?,?,?,?)`, [created.insertId,checklistItem.id,checklistItem.CategoryName,checklistItem.ItemCode,checklistItem.ItemPrompt,checklistItem.IsRequired,checklistItem.UnsafeRequiresRemark,checklistItem.UnsafeRequiresPhoto,checklistItem.UnsafeRequiresAction,answerSort]); }
            await conn.query("INSERT INTO BBS_Observation_Batch_Members(BatchID,ObservationID,ObservedEmployeeID,ChecklistVersionID,ResolutionReason,SortOrder,Status) VALUES(?,?,?,?,?,?,'Draft')", [batch.insertId,created.insertId,observed.EmployeeID,item.versionId,item.resolved.reason,memberSort]);
        }
        await conn.commit();
        await logAudit(req, { action: 'BBS_BATCH_DRAFT_CREATE', module: 'bbs', targetType: 'BBS_Observation_Batch', targetId: batch.insertId, detail: `employees=${employeeIds.length}; groups=${groupCount}` });
        res.status(201).json({ success: true, reused: false, data: await loadBatch(batch.insertId) });
    } catch (error) { try { await conn.rollback(); } catch (_) {} if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, code: 'DUPLICATE_BATCH_REQUEST', message: 'This batch request already exists.' }); return phase3Error(res, error, 'create batch draft'); } finally { conn.release(); }
});

async function applyBatchAnswers(conn, batch, parsed) {
    const [memberRows] = await conn.query('SELECT * FROM BBS_Observation_Batch_Members WHERE BatchID=? ORDER BY id FOR UPDATE', [batch.id]);
    const byObservation = new Map(memberRows.map(row => [Number(row.ObservationID), row]));
    if (parsed.members.length !== memberRows.length || parsed.members.some(row => !byObservation.has(row.observationId))) return { ok: false, status: 400, message: 'Batch payload must contain every selected employee exactly once.' };
    for (const entry of parsed.members) {
        const [[observation]] = await conn.query('SELECT * FROM BBS_Observations WHERE id=? FOR UPDATE', [entry.observationId]);
        if (!observation || observation.Status !== 'Draft') return { ok: false, status: 409, code: 'IMMUTABLE_OBSERVATION', message: 'A batch member is no longer editable.' };
        if (entry.rowVersion !== null && entry.rowVersion !== Number(observation.RowVersion)) return { ok: false, status: 409, code: 'VERSION_CONFLICT', message: 'A batch member changed in another session. Reload before saving.' };
        const [owned] = await conn.query('SELECT id FROM BBS_Observation_Answers WHERE ObservationID=?', [entry.observationId]);
        const ownedIds = new Set(owned.map(row => Number(row.id)));
        if (entry.answers.some(answer => !ownedIds.has(answer.answerId))) return { ok: false, status: 400, message: 'An answer does not belong to its batch member.' };
        for (const answer of entry.answers) await conn.query('UPDATE BBS_Observation_Answers SET Response=?,Remark=?,ImmediateAction=? WHERE id=? AND ObservationID=?', [answer.response,answer.remark || null,answer.immediateAction || null,answer.answerId,entry.observationId]);
        await conn.query('UPDATE BBS_Observations SET GeneralRemark=?,RowVersion=RowVersion+1 WHERE id=?', [entry.generalRemark || null,entry.observationId]);
    }
    return { ok: true, memberRows };
}

router.put('/batch-observations/:id/draft', async (req, res) => {
    const id = positiveInt(req.params.id); const parsed = normalizeBatchMembers(req.body?.members);
    if (!id || !parsed.ok) return res.status(400).json({ success: false, message: parsed.message || 'Invalid batch ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        if (!await batchEnabled(conn)) { await conn.rollback(); return res.status(503).json({ success: false, code: 'BATCH_OBSERVATION_DISABLED', message: 'Batch observation is currently disabled.' }); }
        const [[batch]] = await conn.query('SELECT * FROM BBS_Observation_Batches WHERE id=? FOR UPDATE', [id]);
        if (!batch) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Batch was not found.' }); }
        if (!isAdmin(req) && String(batch.ObserverEmployeeID) !== actorId(req)) { await conn.rollback(); return res.status(403).json({ success: false, message: 'Only the observer can edit this batch.' }); }
        if (batch.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, code: 'IMMUTABLE_BATCH', message: 'Submitted batches cannot be edited.' }); }
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(batch.RowVersion)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This batch changed in another session. Reload before saving.' }); }
        const applied = await applyBatchAnswers(conn, batch, parsed); if (!applied.ok) { await conn.rollback(); return res.status(applied.status).json({ success: false, ...applied }); }
        const payload = JSON.stringify({ step: Math.max(1, Math.min(51, Number(req.body?.step) || 1)) });
        await conn.query('UPDATE BBS_Observation_Batches SET GeneralRemark=?,DraftPayload=?,RowVersion=RowVersion+1 WHERE id=?', [clean(req.body?.generalRemark) || null,payload,id]);
        await conn.commit(); res.json({ success: true, data: await loadBatch(id), message: 'Batch draft saved.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return phase3Error(res, error, 'save batch draft'); } finally { conn.release(); }
});

router.post('/batch-observations/:id/submit', async (req, res) => {
    const id = positiveInt(req.params.id); const parsed = normalizeBatchMembers(req.body?.members);
    if (!id || !parsed.ok) return res.status(400).json({ success: false, message: parsed.message || 'Invalid batch ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        if (!await batchEnabled(conn)) { await conn.rollback(); return res.status(503).json({ success: false, code: 'BATCH_OBSERVATION_DISABLED', message: 'Batch observation is currently disabled.' }); }
        const [[batch]] = await conn.query('SELECT * FROM BBS_Observation_Batches WHERE id=? FOR UPDATE', [id]);
        if (!batch) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Batch was not found.' }); }
        if (!isAdmin(req) && String(batch.ObserverEmployeeID) !== actorId(req)) { await conn.rollback(); return res.status(403).json({ success: false, message: 'Only the observer can submit this batch.' }); }
        if (batch.Status === 'Submitted') { await conn.commit(); return res.json({ success: true, reused: true, data: await loadBatch(id), message: 'Batch was already submitted.' }); }
        if (batch.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, code: 'IMMUTABLE_BATCH', message: 'Batch is not in Draft status.' }); }
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(batch.RowVersion)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This batch changed in another session. Reload before submitting.' }); }
        const applied = await applyBatchAnswers(conn, batch, parsed); if (!applied.ok) { await conn.rollback(); return res.status(applied.status).json({ success: false, ...applied }); }
        let actionCount = 0;
        for (const member of applied.memberRows) {
            const [[observation]] = await conn.query('SELECT * FROM BBS_Observations WHERE id=? FOR UPDATE', [member.ObservationID]);
            const [answers] = await conn.query(`SELECT a.*,COUNT(f.id) EvidenceCount FROM BBS_Observation_Answers a LEFT JOIN BBS_Observation_Files f ON f.AnswerID=a.id WHERE a.ObservationID=? GROUP BY a.id ORDER BY a.SortOrder`, [member.ObservationID]);
            const validation = validateSubmission(answers);
            if (!validation.ok) { await conn.rollback(); return res.status(400).json({ success: false, ...validation, observedEmployeeId: member.ObservedEmployeeID }); }
            await conn.query("UPDATE BBS_Observations SET Status='Submitted',SubmittedAt=NOW(),RowVersion=RowVersion+1 WHERE id=?", [member.ObservationID]);
            const actions = await createActionsForObservation(conn, observation, answers, actorId(req)); actionCount += actions.length;
        }
        await conn.query("UPDATE BBS_Observation_Batch_Members SET Status='Submitted' WHERE BatchID=?", [id]);
        await conn.query("UPDATE BBS_Observation_Batches SET Status='Submitted',GeneralRemark=?,SubmittedAt=NOW(),DraftPayload=NULL,RowVersion=RowVersion+1 WHERE id=?", [clean(req.body?.generalRemark) || null,id]);
        await conn.commit();
        await logAudit(req, { action: 'BBS_BATCH_SUBMIT', module: 'bbs', targetType: 'BBS_Observation_Batch', targetId: id, detail: `employees=${batch.EmployeeCount}; actions=${actionCount}` });
        res.json({ success: true, reused: false, actionCount, data: await loadBatch(id), message: 'Batch submitted atomically.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return phase3Error(res, error, 'submit batch'); } finally { conn.release(); }
});

router.get('/batch-observations/:id', async (req, res) => {
    const id = positiveInt(req.params.id); if (!id) return res.status(400).json({ success: false, message: 'Invalid batch ID.' });
    try {
        if (!await batchEnabled()) return res.status(503).json({ success: false, code: 'BATCH_OBSERVATION_DISABLED', message: 'Batch observation is currently disabled.' });
        const batch = await loadBatch(id); if (!batch) return res.status(404).json({ success: false, message: 'Batch was not found.' });
        if (!isAdmin(req) && String(batch.ObserverEmployeeID) !== actorId(req)) return res.status(403).json({ success: false, message: 'Batch detail is visible only to its observer.' });
        res.json({ success: true, data: batch });
    } catch (error) { return phase3Error(res, error, 'batch detail'); }
});

router.get('/workspace', async (req, res) => {
    try {
        const today = bangkokIsoDate();
        const year = Math.max(2000, Math.min(2100, Number(req.query.year) || Number(today.slice(0, 4))));
        const month = Math.max(1, Math.min(12, Number(req.query.month) || Number(today.slice(5, 7))));
        const observer = await employeeContext(actorId(req), today);
        if (!observer) return res.status(404).json({ success: false, message: 'Employee is not available in Employee Master.' });
        const from = `${year}-${String(month).padStart(2, '0')}-01`;
        const to = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        const [[metric]] = await db.query(
            `SELECT COUNT(DISTINCT o.id) SubmittedCount,COUNT(DISTINCT o.ObservedEmployeeID) UniqueObserved,
                    COALESCE(SUM(a.Response='Safe'),0) SafeCount,COALESCE(SUM(a.Response='Unsafe'),0) UnsafeCount
               FROM BBS_Observations o LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id
              WHERE o.ObserverEmployeeID=? AND o.Status='Submitted' AND o.ObservationDate>=? AND o.ObservationDate<?`, [actorId(req), from, to]);
        const nowYear = Number(today.slice(0, 4)); const nowMonth = Number(today.slice(5, 7));
        const through = year < nowYear || (year === nowYear && month < nowMonth) ? null : (year === nowYear && month === nowMonth ? Number(today.slice(8, 10)) : 0);
        const ruleRows = observer.BBSLevel ? await db.query("SELECT TargetCount,Weekdays FROM BBS_KPI_Rules WHERE BBSLevel=? AND MetricKey='submitted_observation' AND IsActive=1 ORDER BY id LIMIT 1", [observer.BBSLevel]).then(([rows]) => rows) : [];
        const [[enrollment]] = await db.query("SELECT id EnrollmentID,InspectorEmployeeID,DATE_FORMAT(EffectiveFrom,'%Y-%m-%d') EnrollmentFrom,DATE_FORMAT(EffectiveTo,'%Y-%m-%d') EnrollmentTo FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND Status='Active' AND KpiRequired=1 AND IsActive=1 AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=? ORDER BY EffectiveFrom DESC,id DESC LIMIT 1", [actorId(req), to, from]);
        const throughDate = through === null ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10) : (through > 0 ? `${year}-${String(month).padStart(2,'0')}-${String(through).padStart(2,'0')}` : '0000-00-00');
        const [dailyActual] = await db.query("SELECT ObservationDate,COUNT(*) ActualCount FROM BBS_Observations WHERE ObserverEmployeeID=? AND Status='Submitted' AND ObservationDate>=? AND ObservationDate<? GROUP BY ObservationDate", [actorId(req), from, to]);
        let kpiCompliance={summary:{numerator:0,denominator:0,percentage:0}};
        if(enrollment){
            const [scheduleRules,scheduleOverrides]=await Promise.all([
                db.query("SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=? AND Status='Active' AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=?",[enrollment.EnrollmentID,to,from]).then(([rows])=>rows),
                db.query("SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=? AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1",[enrollment.EnrollmentID,from,to]).then(([rows])=>rows)
            ]);
            kpiCompliance=computeCompliance({enrollments:[{...enrollment,TargetCount:Number(ruleRows[0]?.TargetCount||1),Weekdays:ruleRows[0]?.Weekdays||'1,2,3,4,5'}],rules:scheduleRules,overrides:scheduleOverrides,actualRows:dailyActual.map(row=>({...row,ObserverEmployeeID:actorId(req)})),range:{start:from,end:to},today:throughDate});
        }
        const cappedNumerator=kpiCompliance.summary.numerator,target=kpiCompliance.summary.denominator;
        const [recent] = await db.query(`SELECT id,ObservationNo,ObservedEmployeeID,ObservedNameSnapshot,Status,ObservationDate,SubmittedAt FROM BBS_Observations WHERE ObserverEmployeeID=? ORDER BY CreatedAt DESC LIMIT 8`, [actorId(req)]);
        const [team] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel,
                    COUNT(o.id) SubmittedCount,MAX(o.SubmittedAt) LastObservedAt
               FROM BBS_Hierarchy_Assignments h JOIN Employees e ON e.EmployeeID=h.MemberEmployeeID
               LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
               LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
               LEFT JOIN BBS_Observations o ON o.ObservedEmployeeID=e.EmployeeID AND o.ObserverEmployeeID=? AND o.Status='Submitted' AND o.ObservationDate>=? AND o.ObservationDate<?
              WHERE h.SupervisorEmployeeID=? AND h.IsActive=1 AND h.EffectiveFrom<=? AND COALESCE(h.EffectiveTo,'9999-12-31')>=?
              GROUP BY e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,m.BBSLevel ORDER BY e.EmployeeName`, [actorId(req), from, to, actorId(req), today, today]);
        res.json({ success: true, data: { observer, period: { year, month, from, to }, kpi: { numerator: cappedNumerator, denominator: target, percentage: target ? kpiCompliance.summary.percentage : null, formula: 'Capped submitted observations / effective inspector schedule target (Asia/Bangkok)', enrolled: Boolean(enrollment), uniqueObserved: Number(metric.UniqueObserved || 0), safe: Number(metric.SafeCount || 0), unsafe: Number(metric.UnsafeCount || 0) }, team, recent } });
    } catch (error) { return phase3Error(res, error, 'workspace'); }
});

router.post('/observations/draft', async (req, res) => {
    const observedId = clean(req.body?.observedEmployeeId, 20);
    const observationDate = normalizeIsoDate(req.body?.observationDate || bangkokIsoDate(), { required: true });
    const key = clean(req.body?.idempotencyKey, 80);
    if (!observedId || !observationDate || !/^[A-Za-z0-9._:-]{8,80}$/.test(key)) return res.status(400).json({ success: false, message: 'Observed employee, valid date, and idempotency key are required.' });
    if (observedId.toLowerCase() === actorId(req).toLowerCase()) return res.status(400).json({ success: false, message: 'Self-observation is not allowed.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[existing]] = await conn.query('SELECT id,ObservedEmployeeID FROM BBS_Observations WHERE ObserverEmployeeID=? AND IdempotencyKey=? LIMIT 1 FOR UPDATE', [actorId(req), key]);
        if (existing) {
            await conn.commit();
            if (String(existing.ObservedEmployeeID).toLowerCase() !== observedId.toLowerCase()) return res.status(409).json({ success: false, code: 'IDEMPOTENCY_CONFLICT', message: 'This request key is already used for another employee.' });
            return res.json({ success: true, reused: true, data: await loadObservation(existing.id) });
        }
        const observer = await employeeContext(actorId(req), observationDate, conn);
        const observed = await employeeContext(observedId, observationDate, conn);
        if (!observer || !observed) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Observer or observed employee is not available in Employee Master.' }); }
        if (!await canObserve(req, observed, observationDate, conn)) { await conn.rollback(); return res.status(403).json({ success: false, code: 'OBSERVATION_SCOPE_DENIED', message: 'Employee is outside your active BBS pilot assignment scope.' }); }
        const resolved = await resolveChecklist(observed, observationDate, conn);
        if (!resolved.ok) { await conn.rollback(); return res.status(resolved.code === 'CHECKLIST_CONFLICT' ? 409 : 404).json({ success: false, ...resolved }); }
        const versionId = Number(resolved.selected.VersionID);
        const [items] = await conn.query(`SELECT i.*,c.CategoryName,c.SortOrder CategorySort FROM BBS_Checklist_Items i JOIN BBS_Checklist_Categories c ON c.id=i.CategoryID WHERE c.VersionID=? ORDER BY c.SortOrder,c.id,i.SortOrder,i.id`, [versionId]);
        if (!items.length) { await conn.rollback(); return res.status(409).json({ success: false, message: 'Resolved checklist has no items.' }); }
        const no = `BBS-${observationDate.replaceAll('-', '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        const [created] = await conn.query(
            `INSERT INTO BBS_Observations(ObservationNo,ObserverEmployeeID,ObservedEmployeeID,ChecklistVersionID,Status,ObservationDate,ObservedAt,ResolutionReason,ObserverNameSnapshot,ObserverDepartmentSnapshot,ObserverUnitSnapshot,ObserverPositionSnapshot,ObservedNameSnapshot,ObservedDepartmentSnapshot,ObservedUnitSnapshot,ObservedPositionSnapshot,ObservedDepartmentID,ObservedSafetyUnitID,ObservedPositionID,ObservedBBSLevel,IdempotencyKey)
             VALUES(?,?,?,?,'Draft',?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [no, observer.EmployeeID, observed.EmployeeID, versionId, observationDate, resolved.reason, observer.EmployeeName, observer.Department, observer.Unit, observer.Position, observed.EmployeeName, observed.Department, observed.Unit, observed.Position, observed.DepartmentID, observed.SafetyUnitID, observed.PositionID, observed.BBSLevel, key]);
        let sort = 0;
        for (const item of items) {
            sort += 1;
            await conn.query(`INSERT INTO BBS_Observation_Answers(ObservationID,ChecklistItemID,CategoryNameSnapshot,ItemCodeSnapshot,ItemPromptSnapshot,IsRequiredSnapshot,UnsafeRequiresRemarkSnapshot,UnsafeRequiresPhotoSnapshot,UnsafeRequiresActionSnapshot,SortOrder) VALUES(?,?,?,?,?,?,?,?,?,?)`, [created.insertId, item.id, item.CategoryName, item.ItemCode, item.ItemPrompt, item.IsRequired, item.UnsafeRequiresRemark, item.UnsafeRequiresPhoto, item.UnsafeRequiresAction, sort]);
        }
        await conn.commit();
        await logAudit(req, { action: 'BBS_OBSERVATION_DRAFT_CREATE', module: 'bbs', targetType: 'BBS_Observation', targetId: created.insertId, detail: `observed=${observed.EmployeeID}; checklistVersion=${versionId}` });
        res.status(201).json({ success: true, reused: false, data: await loadObservation(created.insertId) });
    } catch (error) { try { await conn.rollback(); } catch (_) {} if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, code: 'DUPLICATE_OBSERVATION_REQUEST', message: 'The observation request was already created.' }); return phase3Error(res, error, 'create draft'); } finally { conn.release(); }
});

router.put('/observations/:id', async (req, res) => {
    const id = positiveInt(req.params.id); const parsed = normalizeAnswers(req.body?.answers);
    if (!id || !parsed.ok) return res.status(400).json({ success: false, message: parsed.message || 'Invalid observation ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[observation]] = await conn.query('SELECT * FROM BBS_Observations WHERE id=? LIMIT 1 FOR UPDATE', [id]);
        if (!observation) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Observation was not found.' }); }
        if (!isAdmin(req) && String(observation.ObserverEmployeeID) !== actorId(req)) { await conn.rollback(); return res.status(403).json({ success: false, message: 'Only the observer can edit this draft.' }); }
        if (observation.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, code: 'IMMUTABLE_OBSERVATION', message: 'Submitted observations cannot be edited.' }); }
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(observation.RowVersion)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This draft changed in another session. Reload before saving.' }); }
        const [owned] = await conn.query('SELECT id FROM BBS_Observation_Answers WHERE ObservationID=?', [id]);
        const ownedIds = new Set(owned.map(row => Number(row.id)));
        if (parsed.answers.some(answer => !ownedIds.has(answer.answerId))) { await conn.rollback(); return res.status(400).json({ success: false, message: 'An answer does not belong to this observation.' }); }
        for (const answer of parsed.answers) await conn.query('UPDATE BBS_Observation_Answers SET Response=?,Remark=?,ImmediateAction=? WHERE id=? AND ObservationID=?', [answer.response, answer.remark || null, answer.immediateAction || null, answer.answerId, id]);
        await conn.query('UPDATE BBS_Observations SET GeneralRemark=?,RowVersion=RowVersion+1 WHERE id=?', [clean(req.body?.generalRemark) || null, id]);
        await conn.commit();
        res.json({ success: true, data: await loadObservation(id), message: 'Draft saved.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return phase3Error(res, error, 'save draft'); } finally { conn.release(); }
});

router.post('/observations/:id/submit', async (req, res) => {
    const id = positiveInt(req.params.id); if (!id) return res.status(400).json({ success: false, message: 'Invalid observation ID.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[observation]] = await conn.query('SELECT * FROM BBS_Observations WHERE id=? LIMIT 1 FOR UPDATE', [id]);
        if (!observation) { await conn.rollback(); return res.status(404).json({ success: false, message: 'Observation was not found.' }); }
        if (!isAdmin(req) && String(observation.ObserverEmployeeID) !== actorId(req)) { await conn.rollback(); return res.status(403).json({ success: false, message: 'Only the observer can submit this observation.' }); }
        if (observation.Status === 'Submitted') { await conn.commit(); return res.json({ success: true, reused: true, data: await loadObservation(id), message: 'Observation was already submitted.' }); }
        if (observation.Status !== 'Draft') { await conn.rollback(); return res.status(409).json({ success: false, message: 'Observation is not in Draft status.' }); }
        if (req.body?.rowVersion !== undefined && Number(req.body.rowVersion) !== Number(observation.RowVersion)) { await conn.rollback(); return res.status(409).json({ success: false, code: 'VERSION_CONFLICT', message: 'This draft changed in another session. Reload before submitting.' }); }
        const [answers] = await conn.query(`SELECT a.*,COUNT(f.id) EvidenceCount FROM BBS_Observation_Answers a LEFT JOIN BBS_Observation_Files f ON f.AnswerID=a.id WHERE a.ObservationID=? GROUP BY a.id ORDER BY a.SortOrder`, [id]);
        const validation = validateSubmission(answers);
        if (!validation.ok) { await conn.rollback(); return res.status(400).json({ success: false, ...validation }); }
        await conn.query("UPDATE BBS_Observations SET Status='Submitted',SubmittedAt=NOW(),RowVersion=RowVersion+1 WHERE id=?", [id]);
        const actions = await createActionsForObservation(conn, observation, answers, actorId(req));
        await conn.commit();
        await logAudit(req, { action: 'BBS_OBSERVATION_SUBMIT', module: 'bbs', targetType: 'BBS_Observation', targetId: id, detail: `observed=${observation.ObservedEmployeeID}` });
        res.json({ success: true, reused: false, actionCount: actions.length, data: await loadObservation(id), message: 'Observation submitted.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return phase3Error(res, error, 'submit'); } finally { conn.release(); }
});

router.get('/observations', async (req, res) => {
    try {
        const view = ['observer', 'observed', 'team'].includes(String(req.query.view)) ? String(req.query.view) : 'observer';
        const status = ['Draft', 'Submitted'].includes(String(req.query.status)) ? String(req.query.status) : null;
        const year = Number(req.query.year); const params = []; let where = '1=1';
        if (!isAdmin(req)) {
            if (view === 'observer') { where += ' AND o.ObserverEmployeeID=?'; params.push(actorId(req)); }
            else if (view === 'observed') { where += ' AND o.ObservedEmployeeID=?'; params.push(actorId(req)); }
            else { where += ` AND EXISTS(SELECT 1 FROM BBS_Hierarchy_Assignments h WHERE h.SupervisorEmployeeID=? AND h.MemberEmployeeID=o.ObservedEmployeeID AND h.DepartmentID=o.ObservedDepartmentID AND h.IsActive=1 AND h.EffectiveFrom<=o.ObservationDate AND COALESCE(h.EffectiveTo,'9999-12-31')>=o.ObservationDate)`; params.push(actorId(req)); }
        }
        if (status) { where += ' AND o.Status=?'; params.push(status); }
        if (Number.isInteger(year) && year >= 2000 && year <= 2100) { where += ' AND YEAR(o.ObservationDate)=?'; params.push(year); }
        const [rows] = await db.query(`SELECT o.id,o.ObservationNo,o.ObserverEmployeeID,o.ObserverNameSnapshot,o.ObservedEmployeeID,o.ObservedNameSnapshot,o.ObservedDepartmentSnapshot,o.ObservedUnitSnapshot,o.Status,o.ObservationDate,o.SubmittedAt,SUM(a.Response='Safe') SafeCount,SUM(a.Response='Unsafe') UnsafeCount,SUM(a.Response='N/A') NACount FROM BBS_Observations o LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id WHERE ${where} GROUP BY o.id ORDER BY o.ObservationDate DESC,o.id DESC LIMIT 250`, params);
        res.json({ success: true, data: rows });
    } catch (error) { return phase3Error(res, error, 'history'); }
});

router.get('/observations/:id', async (req, res) => {
    const id = positiveInt(req.params.id); if (!id) return res.status(400).json({ success: false, message: 'Invalid observation ID.' });
    try {
        const observation = await loadObservation(id);
        if (!observation) return res.status(404).json({ success: false, message: 'Observation was not found.' });
        if (!await canRead(req, observation)) return res.status(403).json({ success: false, message: 'Observation is outside your permitted scope.' });
        if (isAdmin(req)) await logAudit(req, { action: 'BBS_OBSERVATION_DETAIL_VIEW', module: 'bbs', targetType: 'BBS_Observation', targetId: id, detail: `observed=${observation.ObservedEmployeeID}` });
        res.json({ success: true, data: observation });
    } catch (error) { return phase3Error(res, error, 'detail'); }
});

router.post('/observations/:id/evidence', (req, res) => {
    upload.single('evidence')(req, res, async error => {
        if (error) return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Evidence image must not exceed 10 MB.' : 'Evidence upload failed.' });
        const cleanup = () => { if (req.file?.path) fs.unlink(req.file.path, () => {}); };
        const id = positiveInt(req.params.id); const answerId = positiveInt(req.body?.answerId);
        if (!id || !answerId || !req.file) { cleanup(); return res.status(400).json({ success: false, message: 'A JPEG, PNG, or WebP evidence image and answerId are required.' }); }
        const verifiedMime = verifiedImageMime(req.file.path);
        if (!verifiedMime || verifiedMime !== req.file.mimetype) { cleanup(); return res.status(400).json({ success: false, message: 'Evidence content does not match an allowed JPEG, PNG, or WebP image.' }); }
        try {
            const [[observation]] = await db.query('SELECT * FROM BBS_Observations WHERE id=? LIMIT 1', [id]);
            if (!observation) { cleanup(); return res.status(404).json({ success: false, message: 'Observation was not found.' }); }
            if (observation.Status !== 'Draft' || (!isAdmin(req) && String(observation.ObserverEmployeeID) !== actorId(req))) { cleanup(); return res.status(403).json({ success: false, message: 'Evidence can only be added by the observer while the observation is Draft.' }); }
            const [[answer]] = await db.query('SELECT id FROM BBS_Observation_Answers WHERE id=? AND ObservationID=? LIMIT 1', [answerId, id]);
            if (!answer) { cleanup(); return res.status(400).json({ success: false, message: 'Answer does not belong to this observation.' }); }
            const [created] = await db.query('INSERT INTO BBS_Observation_Files(ObservationID,AnswerID,StoredName,OriginalName,MimeType,FileSize,UploadedBy) VALUES(?,?,?,?,?,?,?)', [id, answerId, path.basename(req.file.filename), clean(req.file.originalname, 255), req.file.mimetype, req.file.size, actorId(req)]);
            res.status(201).json({ success: true, data: { id: created.insertId, answerId, originalName: clean(req.file.originalname, 255), mimeType: req.file.mimetype, fileSize: req.file.size }, message: 'Evidence uploaded securely.' });
        } catch (uploadError) { cleanup(); return phase3Error(res, uploadError, 'upload evidence'); }
    });
});

router.get('/observations/:id/evidence/:fileId', async (req, res) => {
    const id = positiveInt(req.params.id); const fileId = positiveInt(req.params.fileId);
    if (!id || !fileId) return res.status(400).json({ success: false, message: 'Invalid evidence path.' });
    try {
        const observation = await loadObservation(id);
        if (!observation) return res.status(404).json({ success: false, message: 'Observation was not found.' });
        if (!await canRead(req, observation)) return res.status(403).json({ success: false, message: 'Evidence is outside your permitted scope.' });
        const [[file]] = await db.query('SELECT * FROM BBS_Observation_Files WHERE id=? AND ObservationID=? LIMIT 1', [fileId, id]);
        if (!file) return res.status(404).json({ success: false, message: 'Evidence was not found.' });
        const diskPath = path.join(privateDir, path.basename(file.StoredName));
        if (!fs.existsSync(diskPath)) return res.status(404).json({ success: false, message: 'Evidence file is unavailable.' });
        res.setHeader('Content-Type', file.MimeType); res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.OriginalName)}`); res.sendFile(diskPath);
    } catch (error) { return phase3Error(res, error, 'retrieve evidence'); }
});

router.delete('/observations/:id/evidence/:fileId', async (req, res) => {
    const id = positiveInt(req.params.id); const fileId = positiveInt(req.params.fileId);
    if (!id || !fileId) return res.status(400).json({ success: false, message: 'Invalid evidence path.' });
    try {
        const [[observation]] = await db.query('SELECT * FROM BBS_Observations WHERE id=? LIMIT 1', [id]);
        if (!observation) return res.status(404).json({ success: false, message: 'Observation was not found.' });
        if (observation.Status !== 'Draft' || (!isAdmin(req) && String(observation.ObserverEmployeeID) !== actorId(req))) return res.status(403).json({ success: false, message: 'Evidence can only be removed by the observer while Draft.' });
        const [[file]] = await db.query('SELECT * FROM BBS_Observation_Files WHERE id=? AND ObservationID=? LIMIT 1', [fileId, id]);
        if (!file) return res.status(404).json({ success: false, message: 'Evidence was not found.' });
        await db.query('DELETE FROM BBS_Observation_Files WHERE id=? AND ObservationID=?', [fileId, id]);
        fs.unlink(path.join(privateDir, path.basename(file.StoredName)), () => {});
        res.json({ success: true, message: 'Evidence removed.' });
    } catch (error) { return phase3Error(res, error, 'delete evidence'); }
});

module.exports = router;
