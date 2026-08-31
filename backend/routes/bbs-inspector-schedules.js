'use strict';

const express = require('express');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { bangkokIsoDate, normalizeIsoDate, databaseIsoDate, normalizeWeekdays } = require('../services/bbs-phase1');
const { computeCompliance } = require('../services/bbs-inspector-schedule');

const router = express.Router();
const OVERRIDE_TYPES = Object.freeze(['Required', 'Exempt']);

function actorId(req) { return String(req.user?.id || req.user?.EmployeeID || '').trim(); }
function admin(req) { return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin'; }
function positiveInt(value) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function clean(value, max = 255) { return String(value || '').trim().slice(0, max); }
function errorResponse(res, error, label) {
    console.error(`[bbs-inspector-schedules] ${label}:`, error?.message || error);
    if (error?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success:false, code:'BBS_INSPECTOR_SCHEDULE_SETUP_REQUIRED', message:'BBS inspector schedule migration is required.' });
    return res.status(500).json({ success:false, message:'Unable to manage inspector schedules.' });
}
async function enabled(queryable = db) {
    const [[row]] = await queryable.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='inspector_schedule_enabled' LIMIT 1");
    return String(row?.SettingValue || '0') === '1';
}
async function requireFeature(_req, res, next) {
    try {
        if (!await enabled()) return res.status(503).json({ success:false, code:'BBS_INSPECTOR_SCHEDULE_DISABLED', message:'BBS inspector schedule is currently disabled.' });
        return next();
    } catch (error) { return errorResponse(res, error, 'feature flag'); }
}
function period(query) {
    const year = Number(query.year || bangkokIsoDate().slice(0, 4));
    const month = Number(query.month || bangkokIsoDate().slice(5, 7));
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return null;
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const cursor = new Date(`${start}T00:00:00Z`); cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    return { year, month, start, end:cursor.toISOString().slice(0, 10), today:bangkokIsoDate() };
}
function previousDate(date) { const cursor = new Date(`${date}T00:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() - 1); return cursor.toISOString().slice(0, 10); }
async function enrollmentById(id, queryable = db, lock = false) {
    const [[row]] = await queryable.query(
        `SELECT x.*,e.EmployeeName InspectorName,d.Name DepartmentName,u.name SafetyUnitName,
                r.TargetCount,r.Weekdays
           FROM BBS_Inspector_Enrollments x
           JOIN Employees e ON e.EmployeeID=x.InspectorEmployeeID
           JOIN Master_Departments d ON d.id=x.DepartmentID
           JOIN Master_SafetyUnits u ON u.id=x.SafetyUnitID
           LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
           LEFT JOIN BBS_KPI_Rules r ON r.BBSLevel=m.BBSLevel AND r.MetricKey='submitted_observation' AND r.IsActive=1
          WHERE x.id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [id]
    );
    if (row) { row.EffectiveFrom = databaseIsoDate(row.EffectiveFrom); row.EffectiveTo = databaseIsoDate(row.EffectiveTo); }
    return row || null;
}
function canRead(req, enrollment) { return admin(req) || String(enrollment?.InspectorEmployeeID) === actorId(req); }
async function scheduleRows(enrollmentIds, range, queryable = db) {
    if (!enrollmentIds.length) return { rules:[], overrides:[], actualRows:[] };
    const placeholders = enrollmentIds.map(() => '?').join(',');
    const [rules, overrides, actualRows] = await Promise.all([
        queryable.query(
            `SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID IN (${placeholders}) AND Status='Active' AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=? ORDER BY EnrollmentID,EffectiveFrom,id`,
            [...enrollmentIds, range.end, range.start]
        ).then(([rows]) => rows),
        queryable.query(
            `SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID IN (${placeholders}) AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1 ORDER BY EnrollmentID,ScheduleDate`,
            [...enrollmentIds, range.start, range.end]
        ).then(([rows]) => rows),
        queryable.query(
            `SELECT ObserverEmployeeID,ObservationDate,COUNT(*) ActualCount FROM BBS_Observations WHERE Status='Submitted' AND ObservationDate>=? AND ObservationDate<? AND ObserverEmployeeID IN (SELECT InspectorEmployeeID FROM BBS_Inspector_Enrollments WHERE id IN (${placeholders})) GROUP BY ObserverEmployeeID,ObservationDate`,
            [range.start, range.end, ...enrollmentIds]
        ).then(([rows]) => rows)
    ]);
    return { rules, overrides, actualRows };
}
async function compliancePayload(req, range, requestedEnrollmentId = null) {
    const params = [range.end, range.start];
    let filter = '';
    if (!admin(req)) { filter = ' AND x.InspectorEmployeeID=?'; params.push(actorId(req)); }
    else if (requestedEnrollmentId) { filter = ' AND x.id=?'; params.push(requestedEnrollmentId); }
    const [enrollments] = await db.query(
        `SELECT x.id EnrollmentID,x.InspectorEmployeeID,e.EmployeeName InspectorName,
                d.Name DepartmentName,u.name SafetyUnitName,x.EffectiveFrom EnrollmentFrom,x.EffectiveTo EnrollmentTo,
                COALESCE(r.TargetCount,1) TargetCount,COALESCE(r.Weekdays,'1,2,3,4,5') Weekdays
           FROM BBS_Inspector_Enrollments x
           JOIN Employees e ON e.EmployeeID=x.InspectorEmployeeID
           JOIN Master_Departments d ON d.id=x.DepartmentID JOIN Master_SafetyUnits u ON u.id=x.SafetyUnitID
           LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
           LEFT JOIN BBS_KPI_Rules r ON r.BBSLevel=m.BBSLevel AND r.MetricKey='submitted_observation' AND r.IsActive=1
          WHERE x.Status='Active' AND x.KpiRequired=1 AND x.IsActive=1
            AND x.EffectiveFrom<? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?${filter}
          ORDER BY d.Name,u.name,e.EmployeeName`,
        params
    );
    const ids = enrollments.map(row => Number(row.EnrollmentID));
    const rows = await scheduleRows(ids, range);
    return { enabled:true, period:range, ...computeCompliance({ enrollments, ...rows, range, today:range.today }) };
}

router.get('/inspectors/compliance', requireFeature, async (req, res) => {
    try {
        const range = period(req.query); if (!range) return res.status(400).json({ success:false, message:'Valid year and month are required.' });
        const enrollmentId = positiveInt(req.query.enrollmentId);
        return res.json({ success:true, data:await compliancePayload(req, range, enrollmentId) });
    } catch (error) { return errorResponse(res, error, 'compliance dashboard'); }
});

router.get('/inspectors/:id/schedule', requireFeature, async (req, res) => {
    try {
        const id = positiveInt(req.params.id), range = period(req.query);
        if (!id || !range) return res.status(400).json({ success:false, message:'Valid enrollment, year and month are required.' });
        const enrollment = await enrollmentById(id); if (!enrollment) return res.status(404).json({ success:false, message:'Inspector enrollment was not found.' });
        if (!canRead(req, enrollment)) return res.status(403).json({ success:false, message:'You cannot view another inspector schedule.' });
        const [rules, overrides, events, compliance] = await Promise.all([
            db.query('SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=? ORDER BY EffectiveFrom DESC,id DESC', [id]).then(([rows]) => rows),
            db.query('SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=? AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1 ORDER BY ScheduleDate', [id, range.start, range.end]).then(([rows]) => rows),
            db.query('SELECT * FROM BBS_Inspector_Schedule_Events WHERE EnrollmentID=? ORDER BY id DESC LIMIT 50', [id]).then(([rows]) => rows),
            compliancePayload(req, range, id)
        ]);
        return res.json({ success:true, data:{ enrollment, rules, overrides, events, compliance } });
    } catch (error) { return errorResponse(res, error, 'schedule detail'); }
});

router.put('/admin/inspectors/:id/schedule', isAdmin, requireFeature, async (req, res) => {
    const id = positiveInt(req.params.id), effectiveFrom = normalizeIsoDate(req.body?.effectiveFrom, { required:true });
    const effectiveTo = normalizeIsoDate(req.body?.effectiveTo);
    const weekdays = normalizeWeekdays(req.body?.weekdays), targetCount = positiveInt(req.body?.targetCount);
    const scheduleName = clean(req.body?.scheduleName, 120) || 'Inspection schedule', reason = clean(req.body?.reason);
    if (!id || !effectiveFrom || effectiveTo === undefined || (effectiveTo && effectiveTo < effectiveFrom) || !weekdays.length || !targetCount || targetCount > 20 || !reason) return res.status(400).json({ success:false, message:'Enrollment, weekdays, target, effective dates and reason are required.' });
    if (effectiveFrom < bangkokIsoDate()) return res.status(409).json({ success:false, code:'HISTORICAL_SCHEDULE_IMMUTABLE', message:'Schedule versions cannot start in the past.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const enrollment = await enrollmentById(id, conn, true); if (!enrollment) { await conn.rollback(); return res.status(404).json({ success:false, message:'Inspector enrollment was not found.' }); }
        if (effectiveFrom < enrollment.EffectiveFrom || (enrollment.EffectiveTo && effectiveFrom > enrollment.EffectiveTo) || (effectiveTo && enrollment.EffectiveTo && effectiveTo > enrollment.EffectiveTo)) { await conn.rollback(); return res.status(400).json({ success:false, message:'Schedule dates must stay inside the inspector enrollment period.' }); }
        const [activeRules] = await conn.query("SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID=? AND Status='Active' ORDER BY EffectiveFrom,id FOR UPDATE", [id]);
        for (const rule of activeRules) {
            const from = databaseIsoDate(rule.EffectiveFrom), to = databaseIsoDate(rule.EffectiveTo);
            if (from >= effectiveFrom) await conn.query("UPDATE BBS_Inspector_Schedule_Rules SET Status='Replaced',RowVersion=RowVersion+1 WHERE id=?", [rule.id]);
            else if (!to || to >= effectiveFrom) await conn.query('UPDATE BBS_Inspector_Schedule_Rules SET EffectiveTo=?,RowVersion=RowVersion+1 WHERE id=?', [previousDate(effectiveFrom), rule.id]);
        }
        const [result] = await conn.query(
            `INSERT INTO BBS_Inspector_Schedule_Rules(EnrollmentID,ScheduleName,Weekdays,TargetCount,EffectiveFrom,EffectiveTo,Status,Reason,CreatedBy) VALUES(?,?,?,?,?,?,'Active',?,?)`,
            [id, scheduleName, weekdays.join(','), targetCount, effectiveFrom, effectiveTo || null, reason, actorId(req)]
        );
        await conn.query(`INSERT INTO BBS_Inspector_Schedule_Events(EnrollmentID,RuleID,EventType,ActorEmployeeID,DetailText) VALUES(?,?,'RuleVersionCreated',?,?)`, [id, result.insertId, actorId(req), JSON.stringify({ scheduleName, weekdays, targetCount, effectiveFrom, effectiveTo, reason })]);
        await conn.commit();
        await logAudit(req, { action:'BBS_INSPECTOR_SCHEDULE_VERSION', module:'bbs', targetType:'BBS_Inspector_Schedule_Rule', targetId:result.insertId, detail:`enrollment=${id}; weekdays=${weekdays.join(',')}; target=${targetCount}; from=${effectiveFrom}` });
        return res.status(201).json({ success:true, data:{ id:result.insertId }, message:'Inspector schedule version created.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return errorResponse(res, error, 'save schedule'); }
    finally { conn.release(); }
});

router.put('/admin/inspectors/:id/schedule-overrides/:date', isAdmin, requireFeature, async (req, res) => {
    const id = positiveInt(req.params.id), date = normalizeIsoDate(req.params.date, { required:true });
    const type = OVERRIDE_TYPES.includes(req.body?.overrideType) ? req.body.overrideType : null;
    const targetCount = type === 'Required' ? positiveInt(req.body?.targetCount) : null, reason = clean(req.body?.reason);
    if (!id || !date || !type || (type === 'Required' && (!targetCount || targetCount > 20)) || !reason) return res.status(400).json({ success:false, message:'Valid date, override type, target and reason are required.' });
    if (date < bangkokIsoDate()) return res.status(409).json({ success:false, code:'HISTORICAL_SCHEDULE_IMMUTABLE', message:'Past schedule dates cannot be changed.' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction(); const enrollment = await enrollmentById(id, conn, true);
        if (!enrollment) { await conn.rollback(); return res.status(404).json({ success:false, message:'Inspector enrollment was not found.' }); }
        if (date < enrollment.EffectiveFrom || (enrollment.EffectiveTo && date > enrollment.EffectiveTo)) { await conn.rollback(); return res.status(400).json({ success:false, message:'Override date must stay inside the inspector enrollment period.' }); }
        await conn.query(
            `INSERT INTO BBS_Inspector_Schedule_Overrides(EnrollmentID,ScheduleDate,OverrideType,TargetCount,Reason,IsActive,CreatedBy,UpdatedBy)
             VALUES(?,?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE OverrideType=VALUES(OverrideType),TargetCount=VALUES(TargetCount),Reason=VALUES(Reason),IsActive=1,RowVersion=RowVersion+1,UpdatedBy=VALUES(UpdatedBy)`,
            [id, date, type, targetCount, reason, actorId(req), actorId(req)]
        );
        const [[override]] = await conn.query('SELECT id FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID=? AND ScheduleDate=?', [id, date]);
        await conn.query(`INSERT INTO BBS_Inspector_Schedule_Events(EnrollmentID,OverrideID,EventType,ScheduleDate,ActorEmployeeID,DetailText) VALUES(?,?,'OverrideSaved',?,?,?)`, [id, override.id, date, actorId(req), JSON.stringify({ type, targetCount, reason })]);
        await conn.commit();
        await logAudit(req, { action:'BBS_INSPECTOR_SCHEDULE_OVERRIDE', module:'bbs', targetType:'BBS_Inspector_Schedule_Override', targetId:override.id, detail:`enrollment=${id}; date=${date}; type=${type}; target=${targetCount || 0}` });
        return res.json({ success:true, data:{ id:override.id }, message:'Schedule date override saved.' });
    } catch (error) { try { await conn.rollback(); } catch (_) {} return errorResponse(res, error, 'save override'); }
    finally { conn.release(); }
});

router.delete('/admin/inspectors/:id/schedule-overrides/:date', isAdmin, requireFeature, async (req, res) => {
    const id = positiveInt(req.params.id), date = normalizeIsoDate(req.params.date, { required:true });
    if (!id || !date) return res.status(400).json({ success:false, message:'Valid enrollment and date are required.' });
    if (date < bangkokIsoDate()) return res.status(409).json({ success:false, code:'HISTORICAL_SCHEDULE_IMMUTABLE', message:'Past schedule dates cannot be changed.' });
    try {
        const [result] = await db.query('UPDATE BBS_Inspector_Schedule_Overrides SET IsActive=0,RowVersion=RowVersion+1,UpdatedBy=? WHERE EnrollmentID=? AND ScheduleDate=? AND IsActive=1', [actorId(req), id, date]);
        if (!result.affectedRows) return res.status(404).json({ success:false, message:'Active schedule override was not found.' });
        await db.query(`INSERT INTO BBS_Inspector_Schedule_Events(EnrollmentID,EventType,ScheduleDate,ActorEmployeeID,DetailText) VALUES(?,'OverrideRemoved',?,?,?)`, [id, date, actorId(req), clean(req.body?.reason) || 'Override removed']);
        await logAudit(req, { action:'BBS_INSPECTOR_SCHEDULE_OVERRIDE_REMOVE', module:'bbs', targetType:'BBS_Inspector_Schedule_Override', targetId:`${id}:${date}`, detail:clean(req.body?.reason) || 'Override removed' });
        return res.json({ success:true, message:'Schedule date override removed.' });
    } catch (error) { return errorResponse(res, error, 'remove override'); }
});

module.exports = router;
