'use strict';

const express = require('express');
const db = require('../db');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { bangkokIsoDate, normalizeIsoDate, databaseIsoDate, validateEffectiveRange } = require('../services/bbs-phase1');

const router = express.Router();
const STATUSES = Object.freeze(['Active', 'Suspended', 'Ended']);

function actorId(req) { return String(req.user?.id || req.user?.EmployeeID || '').trim(); }
function admin(req) { return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin'; }
function positiveInt(value) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function clean(value, max = 255) { return String(value || '').trim().slice(0, max); }
function bool(value, fallback = true) { return value === undefined ? fallback : !(value === false || Number(value) === 0 || String(value).toLowerCase() === 'false'); }

function routeError(res, error, label) {
    console.error(`[bbs-inspectors] ${label}:`, error?.message || error);
    if (error?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success:false, code:'BBS_INSPECTOR_SETUP_REQUIRED', message:'BBS inspector team migration is required.' });
    return res.status(500).json({ success:false, message:'Unable to manage BBS inspectors and teams.' });
}

async function enabled(queryable = db) {
    const [[row]] = await queryable.query("SELECT SettingValue FROM BBS_Settings WHERE SettingKey='inspector_team_management_enabled' LIMIT 1");
    return String(row?.SettingValue || '0') === '1';
}

async function requireInspectorFeature(_req, res, next) {
    try {
        if (!await enabled()) {
            return res.status(503).json({
                success:false,
                code:'BBS_INSPECTOR_FEATURE_DISABLED',
                message:'BBS inspector team management is currently disabled.'
            });
        }
        return next();
    } catch (error) {
        return routeError(res, error, 'inspector feature flag');
    }
}

async function employee(employeeId, queryable = db) {
    const [[row]] = await queryable.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.Role,
                d.id DepartmentID,u.id SafetyUnitID,m.BBSLevel
           FROM Employees e
           LEFT JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
           LEFT JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit))
           LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1
          WHERE e.EmployeeID=? LIMIT 1`, [employeeId]);
    return row || null;
}

async function enrollmentById(id, queryable = db, lock = false) {
    const [[row]] = await queryable.query(
        `SELECT DATE_FORMAT(x.EffectiveFrom,'%Y-%m-%d') EffectiveFrom,
                DATE_FORMAT(x.EffectiveTo,'%Y-%m-%d') EffectiveTo,x.*,
                e.EmployeeName,e.Department,e.Unit,e.Position,d.Name DepartmentName,u.name SafetyUnitName
           FROM BBS_Inspector_Enrollments x JOIN Employees e ON e.EmployeeID=x.InspectorEmployeeID
           JOIN Master_Departments d ON d.id=x.DepartmentID JOIN Master_SafetyUnits u ON u.id=x.SafetyUnitID
          WHERE x.id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (row) {
        row.EffectiveFrom = databaseIsoDate(row.EffectiveFrom);
        row.EffectiveTo = databaseIsoDate(row.EffectiveTo);
    }
    return row || null;
}

function effective(row, asOf) {
    return Number(row?.IsActive) === 1 && row?.Status === 'Active'
        && databaseIsoDate(row.EffectiveFrom) <= asOf
        && (!row.EffectiveTo || databaseIsoDate(row.EffectiveTo) >= asOf);
}

async function assertManage(req, enrollment, asOf) {
    if (admin(req)) return { actorMode:'Admin' };
    if (String(enrollment.InspectorEmployeeID) !== actorId(req)) return { error:[403, 'This inspector enrollment belongs to another employee.'] };
    if (!Number(enrollment.AllowSelfManage)) return { error:[403, 'Admin has locked self-service team management for this inspector.'] };
    if (!effective(enrollment, asOf)) return { error:[409, 'The inspector enrollment is not Active for today.'] };
    return { actorMode:'Self' };
}

async function teamPayload(enrollment, asOf, queryable = db) {
    const monthStart = `${asOf.slice(0, 7)}-01`;
    const nextMonth = new Date(`${monthStart}T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monthEnd = nextMonth.toISOString().slice(0, 10);
    const [team] = await queryable.query(
        `SELECT a.id AssignmentID,a.EffectiveFrom,a.EffectiveTo,a.AssignmentType,a.Reason,
                e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,
                COUNT(o.id) SubmittedCount,MAX(o.SubmittedAt) LastObservedAt
           FROM BBS_Hierarchy_Assignments a JOIN Employees e ON e.EmployeeID=a.MemberEmployeeID
           LEFT JOIN BBS_Observations o ON o.ObserverEmployeeID=a.SupervisorEmployeeID
                AND o.ObservedEmployeeID=a.MemberEmployeeID AND o.Status='Submitted'
                AND o.ObservationDate>=? AND o.ObservationDate<?
          WHERE a.SupervisorEmployeeID=? AND a.DepartmentID=? AND a.SafetyUnitID=?
            AND a.IsActive=1 AND a.EffectiveFrom<=? AND COALESCE(a.EffectiveTo,'9999-12-31')>=?
          GROUP BY a.id,e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position
          ORDER BY e.EmployeeName`, [monthStart, monthEnd, enrollment.InspectorEmployeeID, enrollment.DepartmentID, enrollment.SafetyUnitID, asOf, asOf]);
    const [available] = await queryable.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,
                own.SupervisorEmployeeID CurrentSupervisorID,s.EmployeeName CurrentSupervisorName
           FROM Employees e
           JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
           JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 AND m.BBSLevel='Operator'
           JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department)) AND d.id=?
           JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit)) AND u.id=?
           LEFT JOIN BBS_Employee_Eligibility elig ON elig.id=(SELECT ee.id FROM BBS_Employee_Eligibility ee WHERE ee.EmployeeID=e.EmployeeID AND ee.IsActive=1 AND ee.EffectiveFrom<=? AND COALESCE(ee.EffectiveTo,'9999-12-31')>=? ORDER BY ee.EffectiveFrom DESC,ee.id DESC LIMIT 1)
           LEFT JOIN BBS_Hierarchy_Assignments own ON own.id=(SELECT h.id FROM BBS_Hierarchy_Assignments h WHERE h.MemberEmployeeID=e.EmployeeID AND h.IsActive=1 AND h.EffectiveFrom<=? AND COALESCE(h.EffectiveTo,'9999-12-31')>=? ORDER BY h.id DESC LIMIT 1)
           LEFT JOIN Employees s ON s.EmployeeID=own.SupervisorEmployeeID
          WHERE COALESCE(elig.Eligibility,'active')='active'
          ORDER BY e.EmployeeName`, [enrollment.DepartmentID, enrollment.SafetyUnitID, asOf, asOf, asOf, asOf]);
    const observed = new Set(team.filter(row => Number(row.SubmittedCount) > 0).map(row => String(row.EmployeeID)));
    return { team, available, coverage:{ observed:observed.size, total:team.length, percentage:team.length ? Math.round(observed.size * 10000 / team.length) / 100 : 0 } };
}

router.get('/inspectors/me', async (req, res) => {
    try {
        const asOf = normalizeIsoDate(req.query.asOf || bangkokIsoDate(), { required:true });
        if (!asOf) return res.status(400).json({ success:false, message:'asOf must be a valid YYYY-MM-DD date.' });
        if (!await enabled()) return res.json({ success:true, data:{ enabled:false, enrollment:null, team:[], available:[], coverage:{observed:0,total:0,percentage:0} } });
        const [[enrollment]] = await db.query(
            `SELECT DATE_FORMAT(x.EffectiveFrom,'%Y-%m-%d') EffectiveFrom,
                    DATE_FORMAT(x.EffectiveTo,'%Y-%m-%d') EffectiveTo,x.*,d.Name DepartmentName,u.name SafetyUnitName
               FROM BBS_Inspector_Enrollments x JOIN Master_Departments d ON d.id=x.DepartmentID JOIN Master_SafetyUnits u ON u.id=x.SafetyUnitID
              WHERE x.InspectorEmployeeID=? AND x.IsActive=1 AND x.EffectiveFrom<=? AND COALESCE(x.EffectiveTo,'9999-12-31')>=?
              ORDER BY (x.Status='Active') DESC,x.EffectiveFrom DESC,x.id DESC LIMIT 1`, [actorId(req), asOf, asOf]);
        if (!enrollment) return res.json({ success:true, data:{ enabled:true, enrollment:null, team:[], available:[], coverage:{observed:0,total:0,percentage:0} } });
        enrollment.EffectiveFrom = databaseIsoDate(enrollment.EffectiveFrom);
        enrollment.EffectiveTo = databaseIsoDate(enrollment.EffectiveTo);
        const data = await teamPayload(enrollment, asOf);
        return res.json({ success:true, data:{ enabled:true, enrollment, canSelfManage:effective(enrollment, asOf) && Number(enrollment.AllowSelfManage) === 1, ...data } });
    } catch (error) { return routeError(res, error, 'my inspector workspace'); }
});

router.get('/admin/inspectors', isAdmin, async (req, res) => {
    try {
        const asOf = normalizeIsoDate(req.query.asOf || bangkokIsoDate(), { required:true });
        if (!asOf) return res.status(400).json({ success:false, message:'asOf must be a valid YYYY-MM-DD date.' });
        const [enrollments, candidates, departments, units] = await Promise.all([
            db.query(`SELECT DATE_FORMAT(x.EffectiveFrom,'%Y-%m-%d') EffectiveFrom,
                    DATE_FORMAT(x.EffectiveTo,'%Y-%m-%d') EffectiveTo,x.*,
                    e.EmployeeName,e.Department,e.Unit,e.Position,d.Name DepartmentName,u.name SafetyUnitName,
                    (SELECT COUNT(*) FROM BBS_Hierarchy_Assignments h WHERE h.SupervisorEmployeeID=x.InspectorEmployeeID AND h.DepartmentID=x.DepartmentID AND h.SafetyUnitID=x.SafetyUnitID AND h.IsActive=1 AND h.EffectiveFrom<=? AND COALESCE(h.EffectiveTo,'9999-12-31')>=?) TeamCount
                FROM BBS_Inspector_Enrollments x JOIN Employees e ON e.EmployeeID=x.InspectorEmployeeID
                JOIN Master_Departments d ON d.id=x.DepartmentID JOIN Master_SafetyUnits u ON u.id=x.SafetyUnitID
                ORDER BY x.IsActive DESC,(x.Status='Active') DESC,x.EffectiveFrom DESC,x.id DESC`, [asOf, asOf]).then(([rows])=>rows),
            db.query(`SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,d.id DepartmentID,u.id SafetyUnitID
                FROM Employees e JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position))
                JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 AND m.BBSLevel='Group Leader'
                LEFT JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department))
                LEFT JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit))
                ORDER BY e.Department,e.Unit,e.EmployeeName`).then(([rows])=>rows),
            db.query('SELECT id,Name FROM Master_Departments ORDER BY Name').then(([rows])=>rows),
            db.query('SELECT id,name,department_id FROM Master_SafetyUnits ORDER BY department_id,sort_order,name').then(([rows])=>rows),
        ]);
        for (const enrollment of enrollments) {
            enrollment.EffectiveFrom = databaseIsoDate(enrollment.EffectiveFrom);
            enrollment.EffectiveTo = databaseIsoDate(enrollment.EffectiveTo);
        }
        return res.json({ success:true, data:{ enabled:await enabled(), statuses:STATUSES, enrollments, candidates, departments, units } });
    } catch (error) { return routeError(res, error, 'admin inspector list'); }
});

async function validateEnrollment(conn, body, excludeId = null) {
    const inspectorId = clean(body.inspectorEmployeeId, 20);
    const departmentId = positiveInt(body.departmentId), safetyUnitId = positiveInt(body.safetyUnitId);
    const status = STATUSES.includes(body.status) ? body.status : 'Active';
    const range = validateEffectiveRange(body.effectiveFrom, body.effectiveTo);
    if (!inspectorId || !departmentId || !safetyUnitId || !range.ok) return { error:[400, range.message || 'Inspector, Department, Safety Unit and effective dates are required.'] };
    const inspector = await employee(inspectorId, conn);
    if (!inspector) return { error:[404, 'Inspector employee was not found.'] };
    if (inspector.BBSLevel !== 'Group Leader') return { error:[400, 'Only an active Group Leader mapping can be appointed as an inspector.'] };
    if (Number(inspector.DepartmentID) !== departmentId || Number(inspector.SafetyUnitID) !== safetyUnitId) return { error:[400, 'Inspector must belong to the selected Department and Safety Unit.'] };
    const params = [inspectorId, range.to || '9999-12-31', range.from];
    let sql = `SELECT id FROM BBS_Inspector_Enrollments WHERE InspectorEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=?`;
    if (excludeId) { sql += ' AND id<>?'; params.push(excludeId); }
    sql += ' LIMIT 1 FOR UPDATE';
    const [[overlap]] = await conn.query(sql, params);
    if (overlap) return { error:[409, 'This Group Leader already has an overlapping inspector enrollment.'] };
    return { inspector, inspectorId, departmentId, safetyUnitId, status, range, kpiRequired:bool(body.kpiRequired), allowSelfManage:bool(body.allowSelfManage), reason:clean(body.reason) || null };
}

router.post('/admin/inspectors', isAdmin, requireInspectorFeature, async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction(); const checked = await validateEnrollment(conn, req.body || {});
        if (checked.error) { await conn.rollback(); return res.status(checked.error[0]).json({ success:false, message:checked.error[1] }); }
        const [result] = await conn.query(`INSERT INTO BBS_Inspector_Enrollments(InspectorEmployeeID,DepartmentID,SafetyUnitID,Status,KpiRequired,AllowSelfManage,EffectiveFrom,EffectiveTo,IsActive,Reason,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)`, [checked.inspectorId,checked.departmentId,checked.safetyUnitId,checked.status,checked.kpiRequired?1:0,checked.allowSelfManage?1:0,checked.range.from,checked.range.to,checked.reason,actorId(req),actorId(req)]);
        await conn.commit(); await logAudit(req,{action:'BBS_INSPECTOR_ENROLL',module:'bbs',targetType:'BBS_Inspector_Enrollment',targetId:result.insertId,detail:`${checked.inspectorId}; scope=${checked.departmentId}:${checked.safetyUnitId}; self=${checked.allowSelfManage?1:0}; kpi=${checked.kpiRequired?1:0}`});
        return res.status(201).json({ success:true, data:{id:result.insertId}, message:'BBS inspector appointed.' });
    } catch(error){try{await conn.rollback();}catch(_){} return routeError(res,error,'appoint inspector');} finally{conn.release();}
});

router.put('/admin/inspectors/:id', isAdmin, requireInspectorFeature, async (req, res) => {
    const id=positiveInt(req.params.id), rowVersion=positiveInt(req.body?.rowVersion); if(!id||!rowVersion)return res.status(400).json({success:false,message:'Valid enrollment ID and RowVersion are required.'});
    const conn=await db.getConnection();
    try{await conn.beginTransaction();const existing=await enrollmentById(id,conn,true);if(!existing){await conn.rollback();return res.status(404).json({success:false,message:'Inspector enrollment was not found.'});}if(Number(existing.RowVersion)!==rowVersion){await conn.rollback();return res.status(409).json({success:false,code:'VERSION_CONFLICT',message:'Inspector enrollment changed. Reload before saving.'});}const checked=await validateEnrollment(conn,req.body||{},id);if(checked.error){await conn.rollback();return res.status(checked.error[0]).json({success:false,message:checked.error[1]});}await conn.query(`UPDATE BBS_Inspector_Enrollments SET InspectorEmployeeID=?,DepartmentID=?,SafetyUnitID=?,Status=?,KpiRequired=?,AllowSelfManage=?,EffectiveFrom=?,EffectiveTo=?,IsActive=?,Reason=?,RowVersion=RowVersion+1,UpdatedBy=? WHERE id=?`,[checked.inspectorId,checked.departmentId,checked.safetyUnitId,checked.status,checked.kpiRequired?1:0,checked.allowSelfManage?1:0,checked.range.from,checked.range.to,bool(req.body?.isActive)?1:0,checked.reason,actorId(req),id]);await conn.commit();await logAudit(req,{action:'BBS_INSPECTOR_UPDATE',module:'bbs',targetType:'BBS_Inspector_Enrollment',targetId:id,detail:`${checked.inspectorId}; status=${checked.status}; self=${checked.allowSelfManage?1:0}; kpi=${checked.kpiRequired?1:0}`});return res.json({success:true,message:'BBS inspector enrollment saved.'});}catch(error){try{await conn.rollback();}catch(_){}return routeError(res,error,'update inspector');}finally{conn.release();}
});

router.get('/inspectors/:id/team', requireInspectorFeature, async (req,res)=>{
    const id=positiveInt(req.params.id),asOf=normalizeIsoDate(req.query.asOf||bangkokIsoDate(),{required:true});if(!id||!asOf)return res.status(400).json({success:false,message:'Valid enrollment ID and asOf are required.'});
    try{const enrollment=await enrollmentById(id);if(!enrollment)return res.status(404).json({success:false,message:'Inspector enrollment was not found.'});const access=await assertManage(req,enrollment,asOf);if(access.error)return res.status(access.error[0]).json({success:false,message:access.error[1]});return res.json({success:true,data:{enrollment,canSelfManage:access.actorMode==='Admin'||Number(enrollment.AllowSelfManage)===1,...await teamPayload(enrollment,asOf)}});}catch(error){return routeError(res,error,'load inspector team');}
});

router.post('/inspectors/:id/team', requireInspectorFeature, async (req,res)=>{
    const id=positiveInt(req.params.id),memberId=clean(req.body?.memberEmployeeId,20),asOf=normalizeIsoDate(req.body?.effectiveFrom||bangkokIsoDate(),{required:true});if(!id||!memberId||!asOf)return res.status(400).json({success:false,message:'Enrollment, member and effective date are required.'});
    const conn=await db.getConnection();
    try{await conn.beginTransaction();const enrollment=await enrollmentById(id,conn,true);if(!enrollment){await conn.rollback();return res.status(404).json({success:false,message:'Inspector enrollment was not found.'});}const access=await assertManage(req,enrollment,bangkokIsoDate());if(access.error){await conn.rollback();return res.status(access.error[0]).json({success:false,message:access.error[1]});}if(asOf<String(enrollment.EffectiveFrom).slice(0,10)||(enrollment.EffectiveTo&&asOf>String(enrollment.EffectiveTo).slice(0,10))){await conn.rollback();return res.status(400).json({success:false,message:'Assignment date must be inside the inspector enrollment period.'});}const member=await employee(memberId,conn);if(!member){await conn.rollback();return res.status(404).json({success:false,message:'Team member was not found.'});}if(member.BBSLevel!=='Operator'||Number(member.DepartmentID)!==Number(enrollment.DepartmentID)||Number(member.SafetyUnitID)!==Number(enrollment.SafetyUnitID)){await conn.rollback();return res.status(400).json({success:false,message:'Only Operators in the appointed Department and Safety Unit can be added.'});}const[[owned]]=await conn.query("SELECT id,SupervisorEmployeeID FROM BBS_Hierarchy_Assignments WHERE MemberEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=? LIMIT 1 FOR UPDATE",[memberId,asOf,asOf]);if(owned){await conn.rollback();return res.status(409).json({success:false,code:'MEMBER_ALREADY_ASSIGNED',message:String(owned.SupervisorEmployeeID)===String(enrollment.InspectorEmployeeID)?'This employee is already in this team.':'This employee already belongs to another primary inspector. Admin must transfer the assignment.'});}const[result]=await conn.query(`INSERT INTO BBS_Hierarchy_Assignments(SupervisorEmployeeID,MemberEmployeeID,DepartmentID,SafetyUnitID,AssignmentType,EffectiveFrom,EffectiveTo,IsActive,Reason,CreatedBy,UpdatedBy) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[enrollment.InspectorEmployeeID,memberId,enrollment.DepartmentID,enrollment.SafetyUnitID,'permanent',asOf,enrollment.EffectiveTo||null,1,clean(req.body?.reason)||'Inspector team assignment',actorId(req),actorId(req)]);await conn.query(`INSERT INTO BBS_Inspector_Team_Events(EnrollmentID,AssignmentID,InspectorEmployeeID,MemberEmployeeID,EventType,ActorEmployeeID,ActorMode,Reason) VALUES(?,?,?,?,?,?,?,?)`,[id,result.insertId,enrollment.InspectorEmployeeID,memberId,'Added',actorId(req),access.actorMode,clean(req.body?.reason)||null]);await conn.commit();await logAudit(req,{action:'BBS_INSPECTOR_TEAM_ADD',module:'bbs',targetType:'BBS_Hierarchy_Assignment',targetId:result.insertId,detail:`enrollment=${id}; ${enrollment.InspectorEmployeeID} -> ${memberId}; mode=${access.actorMode}`});return res.status(201).json({success:true,data:{assignmentId:result.insertId},message:'Employee added to the inspector team.'});}catch(error){try{await conn.rollback();}catch(_){}return routeError(res,error,'add inspector team member');}finally{conn.release();}
});

router.delete('/inspectors/:id/team/:assignmentId', requireInspectorFeature, async (req,res)=>{
    const id=positiveInt(req.params.id),assignmentId=positiveInt(req.params.assignmentId);if(!id||!assignmentId)return res.status(400).json({success:false,message:'Valid enrollment and assignment IDs are required.'});const conn=await db.getConnection();
    try{await conn.beginTransaction();const enrollment=await enrollmentById(id,conn,true);if(!enrollment){await conn.rollback();return res.status(404).json({success:false,message:'Inspector enrollment was not found.'});}const access=await assertManage(req,enrollment,bangkokIsoDate());if(access.error){await conn.rollback();return res.status(access.error[0]).json({success:false,message:access.error[1]});}const[[assignment]]=await conn.query(`SELECT * FROM BBS_Hierarchy_Assignments WHERE id=? AND SupervisorEmployeeID=? AND DepartmentID=? AND SafetyUnitID=? AND IsActive=1 LIMIT 1 FOR UPDATE`,[assignmentId,enrollment.InspectorEmployeeID,enrollment.DepartmentID,enrollment.SafetyUnitID]);if(!assignment){await conn.rollback();return res.status(404).json({success:false,message:'Active team assignment was not found in this inspector scope.'});}const reason=clean(req.body?.reason)||'Removed from inspector team';await conn.query('UPDATE BBS_Hierarchy_Assignments SET IsActive=0,Reason=?,UpdatedBy=? WHERE id=?',[reason,actorId(req),assignmentId]);await conn.query(`INSERT INTO BBS_Inspector_Team_Events(EnrollmentID,AssignmentID,InspectorEmployeeID,MemberEmployeeID,EventType,ActorEmployeeID,ActorMode,Reason) VALUES(?,?,?,?,?,?,?,?)`,[id,assignmentId,enrollment.InspectorEmployeeID,assignment.MemberEmployeeID,'Removed',actorId(req),access.actorMode,reason]);await conn.commit();await logAudit(req,{action:'BBS_INSPECTOR_TEAM_REMOVE',module:'bbs',targetType:'BBS_Hierarchy_Assignment',targetId:assignmentId,detail:`enrollment=${id}; member=${assignment.MemberEmployeeID}; mode=${access.actorMode}`});return res.json({success:true,message:'Employee removed from the inspector team.'});}catch(error){try{await conn.rollback();}catch(_){}return routeError(res,error,'remove inspector team member');}finally{conn.release();}
});

module.exports = router;
