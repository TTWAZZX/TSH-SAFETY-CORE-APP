'use strict';

const express = require('express');
const db = require('../db');
const { logAudit } = require('../utils/audit');
const { levelRank, bangkokIsoDate } = require('../services/bbs-phase1');
const { ANALYTICS_RISKS, number, percent, validYear, validMonth, normalizeRisk, periodRange, computeKpi, agingBucket } = require('../services/bbs-analytics');
const { computeCompliance } = require('../services/bbs-inspector-schedule');

const router = express.Router();
function actorId(req) { return String(req.user?.id || req.user?.EmployeeID || '').trim(); }
function admin(req) { return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin'; }
function positiveInt(value) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function phase6Error(res, error, label) { console.error(`[bbs-phase6] ${label}:`, error?.message || error); if (error?.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ success:false, code:'BBS_ANALYTICS_SETUP_REQUIRED', message:'BBS analytics requires the Phase 1-5 database migrations.' }); return res.status(500).json({ success:false, message:'Unable to load BBS analytics.' }); }

async function employeeContext(req) {
    const [[row]] = await db.query(`SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,md.id DepartmentID,su.id SafetyUnitID,m.BBSLevel FROM Employees e LEFT JOIN Master_Departments md ON LOWER(TRIM(md.Name))=LOWER(TRIM(e.Department)) LEFT JOIN Master_SafetyUnits su ON su.department_id=md.id AND LOWER(TRIM(su.name))=LOWER(TRIM(e.Unit)) LEFT JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) LEFT JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 WHERE e.EmployeeID=? LIMIT 1`, [actorId(req)]);
    return row || null;
}
function permittedScopes(req, employee) {
    if (admin(req)) return ['personal','team','department','company'];
    const scopes = ['personal']; const rank = levelRank(employee?.BBSLevel);
    if (rank >= levelRank('Group Leader')) scopes.push('team');
    if (rank >= levelRank('Department Head')) scopes.push('department');
    return scopes;
}
async function resolveFilters(req) {
    const [settingRows] = await db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('analytics_enabled','analytics_export_enabled')");
    const settings=Object.fromEntries(settingRows.map(row=>[row.SettingKey,String(row.SettingValue)]));
    if (settings.analytics_enabled !== '1') return { error:[503,'BBS analytics is currently disabled.'] };
    const employee = await employeeContext(req); if (!employee) return { error:[404,'Employee is not available in Employee Master.'] };
    const scopes = permittedScopes(req, employee); const requested = String(req.query.scope || (admin(req) ? 'company' : scopes.at(-1))).toLowerCase();
    if (!scopes.includes(requested)) return { error:[403,'The requested analytics scope is outside your BBS hierarchy permission.'] };
    const year = validYear(req.query.year); const month = validMonth(req.query.month); const risk = normalizeRisk(req.query.risk); const range = periodRange(year, month, bangkokIsoDate());
    let departmentId = positiveInt(req.query.departmentId), safetyUnitId = positiveInt(req.query.safetyUnitId);
    if (!admin(req) && requested === 'department') departmentId = Number(employee.DepartmentID) || null;
    if (!admin(req) && requested === 'personal') { departmentId = Number(employee.DepartmentID) || null; safetyUnitId = Number(employee.SafetyUnitID) || null; }
    if (requested === 'team') {
        const [assigned] = await db.query(`SELECT DISTINCT DepartmentID,SafetyUnitID FROM BBS_Hierarchy_Assignments WHERE SupervisorEmployeeID=? AND IsActive=1 AND EffectiveFrom<=? AND COALESCE(EffectiveTo,'9999-12-31')>=?`, [actorId(req), range.through, range.start]);
        if (!assigned.length && !admin(req)) return { error:[403,'No active BBS team assignment is available for this period.'] };
        if (departmentId && !assigned.some(row => Number(row.DepartmentID) === departmentId)) return { error:[403,'Department filter is outside your assigned team.'] };
        if (safetyUnitId && !assigned.some(row => Number(row.SafetyUnitID) === safetyUnitId)) return { error:[403,'Safety Unit filter is outside your assigned team.'] };
    }
    if (safetyUnitId) { const [[unit]] = await db.query('SELECT id,department_id FROM Master_SafetyUnits WHERE id=? LIMIT 1',[safetyUnitId]); if (!unit || (departmentId && Number(unit.department_id)!==departmentId)) return { error:[400,'Safety Unit does not belong to the selected Department.'] }; departmentId = departmentId || Number(unit.department_id); }
    return { employee, scopes, scope:requested, year, month, risk, range, departmentId, safetyUnitId, exportEnabled:settings.analytics_export_enabled==='1' };
}
function observationWhere(req, f, alias='o') {
    const where=[`${alias}.Status='Submitted'`,`${alias}.ObservationDate>=?`,`${alias}.ObservationDate<?`],params=[f.range.start,f.range.end];
    if (f.scope==='personal') { where.push(`(${alias}.ObserverEmployeeID=? OR ${alias}.ObservedEmployeeID=?)`);params.push(actorId(req),actorId(req)); }
    else if (f.scope==='team') { where.push(`EXISTS(SELECT 1 FROM BBS_Hierarchy_Assignments h WHERE h.SupervisorEmployeeID=? AND h.MemberEmployeeID=${alias}.ObservedEmployeeID AND h.DepartmentID=${alias}.ObservedDepartmentID AND h.IsActive=1 AND h.EffectiveFrom<=${alias}.ObservationDate AND COALESCE(h.EffectiveTo,'9999-12-31')>=${alias}.ObservationDate)`);params.push(actorId(req)); }
    else if (f.scope==='department') { where.push(`${alias}.ObservedDepartmentID=?`);params.push(f.departmentId || f.employee.DepartmentID); }
    if (f.departmentId && f.scope!=='department' && f.scope!=='personal') { where.push(`${alias}.ObservedDepartmentID=?`);params.push(f.departmentId); }
    if (f.safetyUnitId) { where.push(`${alias}.ObservedSafetyUnitID=?`);params.push(f.safetyUnitId); }
    if (f.risk) { where.push(`EXISTS(SELECT 1 FROM BBS_Corrective_Actions risk_ca WHERE risk_ca.ObservationID=${alias}.id AND risk_ca.Priority=?)`);params.push(f.risk); }
    return { sql:where.join(' AND '),params };
}
async function filterOptions(req, f) {
    let where='1=1',params=[];
    if (!admin(req) && f.scopes.includes('department')) { where='d.id=?';params=[f.employee.DepartmentID]; }
    else if (!admin(req) && f.scopes.includes('team')) { where='EXISTS(SELECT 1 FROM BBS_Hierarchy_Assignments h WHERE h.SupervisorEmployeeID=? AND h.DepartmentID=d.id AND h.IsActive=1 AND h.EffectiveFrom<=CURDATE() AND COALESCE(h.EffectiveTo,\'9999-12-31\')>=CURDATE())';params=[actorId(req)]; }
    else if (!admin(req)) { where='d.id=?';params=[f.employee.DepartmentID]; }
    const [departments]=await db.query(`SELECT d.id,d.Name FROM Master_Departments d WHERE ${where} ORDER BY d.Name`,params);
    if (!departments.length && f.employee.DepartmentID) departments.push({id:f.employee.DepartmentID,Name:f.employee.Department});
    const ids=departments.map(row=>Number(row.id)).filter(Boolean);let units=[];
    if(ids.length){const placeholders=ids.map(()=>'?').join(',');[units]=await db.query(`SELECT id,name,department_id FROM Master_SafetyUnits WHERE department_id IN (${placeholders}) ORDER BY department_id,sort_order,name`,ids);}
    const [[years]]=await db.query("SELECT MIN(YEAR(ObservationDate)) minYear,MAX(YEAR(ObservationDate)) maxYear FROM BBS_Observations WHERE Status='Submitted'");
    return {scopes:f.scopes,departments,units,risks:ANALYTICS_RISKS,years:{min:Number(years?.minYear||f.year),max:Number(years?.maxYear||f.year)}};
}
async function kpiPeople(req,f,where) {
    let sql=`SELECT ie.id EnrollmentID,e.EmployeeID,e.EmployeeName,d.Name DepartmentName,u.name SafetyUnitName,r.TargetCount,r.Weekdays,DATE_FORMAT(ie.EffectiveFrom,'%Y-%m-%d') EnrollmentFrom,DATE_FORMAT(ie.EffectiveTo,'%Y-%m-%d') EnrollmentTo FROM Employees e JOIN Master_Positions p ON LOWER(TRIM(p.Name))=LOWER(TRIM(e.Position)) JOIN BBS_Position_Level_Mappings m ON m.PositionID=p.id AND m.IsActive=1 JOIN BBS_KPI_Rules r ON r.BBSLevel=m.BBSLevel AND r.MetricKey='submitted_observation' AND r.IsActive=1 JOIN BBS_Inspector_Enrollments ie ON ie.InspectorEmployeeID=e.EmployeeID AND ie.Status='Active' AND ie.KpiRequired=1 AND ie.IsActive=1 AND ie.EffectiveFrom<? AND COALESCE(ie.EffectiveTo,'9999-12-31')>=? LEFT JOIN Master_Departments d ON LOWER(TRIM(d.Name))=LOWER(TRIM(e.Department)) LEFT JOIN Master_SafetyUnits u ON u.department_id=d.id AND LOWER(TRIM(u.name))=LOWER(TRIM(e.Unit)) WHERE 1=1`;const params=[f.range.end,f.range.start];
    if(f.scope==='personal'||f.scope==='team'){sql+=' AND e.EmployeeID=?';params.push(actorId(req));}
    else if(f.scope==='department'){sql+=' AND d.id=?';params.push(f.departmentId||f.employee.DepartmentID);}
    else {if(f.departmentId){sql+=' AND d.id=?';params.push(f.departmentId);}if(f.safetyUnitId){sql+=' AND u.id=?';params.push(f.safetyUnitId);}}
    const[people]=await db.query(sql,params);const[actual]=await db.query(`SELECT o.ObserverEmployeeID,o.ObservationDate,COUNT(*) ActualCount FROM BBS_Observations o WHERE ${where.sql} GROUP BY o.ObserverEmployeeID,o.ObservationDate`,where.params);
    if(!people.length)return computeKpi(people,actual,f.range);
    const ids=people.map(row=>Number(row.EnrollmentID)),placeholders=ids.map(()=>'?').join(',');
    const[rules,overrides]=await Promise.all([
        db.query(`SELECT * FROM BBS_Inspector_Schedule_Rules WHERE EnrollmentID IN (${placeholders}) AND Status='Active' AND EffectiveFrom<? AND COALESCE(EffectiveTo,'9999-12-31')>=?`,[...ids,f.range.end,f.range.start]).then(([rows])=>rows),
        db.query(`SELECT * FROM BBS_Inspector_Schedule_Overrides WHERE EnrollmentID IN (${placeholders}) AND ScheduleDate>=? AND ScheduleDate<? AND IsActive=1`,[...ids,f.range.start,f.range.end]).then(([rows])=>rows)
    ]);
    const compliance=computeCompliance({enrollments:people.map(row=>({...row,InspectorEmployeeID:row.EmployeeID,InspectorName:row.EmployeeName})),rules,overrides,actualRows:actual,range:f.range,today:f.range.through});
    return {numerator:compliance.summary.numerator,denominator:compliance.summary.denominator,percentage:compliance.summary.percentage,kpiStatus:compliance.summary.kpiStatus,peopleMeeting:compliance.people.filter(row=>row.denominator>0&&row.percentage>=100).length,peopleTotal:compliance.people.length,formula:'Capped submitted observations / effective inspector schedule target',people:compliance.people.map(row=>({employeeId:row.inspectorEmployeeId,employeeName:row.inspectorName,numerator:row.numerator,denominator:row.denominator,percentage:row.percentage,kpiStatus:row.kpiStatus}))};
}
function mergeComparison(observations,actions){const map=new Map();for(const row of observations){const key=`${row.DepartmentID||0}:${row.SafetyUnitID||0}`;map.set(key,{departmentId:Number(row.DepartmentID||0),safetyUnitId:Number(row.SafetyUnitID||0),department:row.Department||'-',unit:row.Unit||'-',observations:number(row.Observations),safe:number(row.SafeCount),unsafe:number(row.UnsafeCount),na:number(row.NACount),actionOpen:0,actionOverdue:0});}for(const row of actions){const key=`${row.DepartmentID||0}:${row.SafetyUnitID||0}`;const target=map.get(key)||{departmentId:Number(row.DepartmentID||0),safetyUnitId:Number(row.SafetyUnitID||0),department:row.Department||'-',unit:row.Unit||'-',observations:0,safe:0,unsafe:0,na:0,actionOpen:0,actionOverdue:0};target.actionOpen=number(row.ActionOpen);target.actionOverdue=number(row.ActionOverdue);map.set(key,target);}return[...map.values()].map(row=>({...row,unsafeRate:percent(row.unsafe,row.safe+row.unsafe)})).sort((a,b)=>b.unsafeRate-a.unsafeRate||b.observations-a.observations);}
async function analyticsPayload(req,f,{includeDetails=false}={}) {
    const where=observationWhere(req,f), actionWhere={sql:where.sql,params:[...where.params]};
    const queries=[
        db.query(`SELECT ${f.month?'DAY(o.ObservationDate)':'MONTH(o.ObservationDate)'} PeriodNo,COUNT(DISTINCT o.id) Observations,SUM(a.Response='Safe') SafeCount,SUM(a.Response='Unsafe') UnsafeCount,SUM(a.Response='N/A') NACount FROM BBS_Observations o LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id WHERE ${where.sql} GROUP BY PeriodNo ORDER BY PeriodNo`,where.params),
        db.query(`SELECT a.CategoryNameSnapshot Category,COUNT(*) Total,SUM(a.Response='Unsafe') UnsafeCount FROM BBS_Observations o JOIN BBS_Observation_Answers a ON a.ObservationID=o.id WHERE ${where.sql} GROUP BY a.CategoryNameSnapshot ORDER BY UnsafeCount DESC,Total DESC,Category LIMIT 20`,where.params),
        db.query(`SELECT o.ObservedDepartmentID DepartmentID,o.ObservedSafetyUnitID SafetyUnitID,MAX(o.ObservedDepartmentSnapshot) Department,MAX(o.ObservedUnitSnapshot) Unit,COUNT(DISTINCT o.id) Observations,SUM(a.Response='Safe') SafeCount,SUM(a.Response='Unsafe') UnsafeCount,SUM(a.Response='N/A') NACount FROM BBS_Observations o LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id WHERE ${where.sql} GROUP BY o.ObservedDepartmentID,o.ObservedSafetyUnitID`,where.params),
        db.query(`SELECT COUNT(*) Total,SUM(ca.Status='Open') OpenCount,SUM(ca.Status='In Progress') InProgressCount,SUM(ca.Status='Pending Verification') PendingVerificationCount,SUM(ca.Status='Closed') ClosedCount,SUM(ca.Status<>'Closed' AND ca.DueDate<CURDATE()) OverdueCount,AVG(CASE WHEN ca.Status='Closed' THEN DATEDIFF(ca.ClosedAt,ca.CreatedAt) END) AvgClosureDays FROM BBS_Corrective_Actions ca JOIN BBS_Observations o ON o.id=ca.ObservationID WHERE ${actionWhere.sql}${f.risk?' AND ca.Priority=?':''}`,f.risk?[...actionWhere.params,f.risk]:actionWhere.params),
        db.query(`SELECT ca.id,ca.Status,DATEDIFF(COALESCE(ca.ClosedAt,CURDATE()),ca.CreatedAt) AgeDays FROM BBS_Corrective_Actions ca JOIN BBS_Observations o ON o.id=ca.ObservationID WHERE ${actionWhere.sql}${f.risk?' AND ca.Priority=?':''}`,f.risk?[...actionWhere.params,f.risk]:actionWhere.params),
        db.query(`SELECT o.ObservedDepartmentID DepartmentID,o.ObservedSafetyUnitID SafetyUnitID,MAX(o.ObservedDepartmentSnapshot) Department,MAX(o.ObservedUnitSnapshot) Unit,SUM(ca.Status<>'Closed') ActionOpen,SUM(ca.Status<>'Closed' AND ca.DueDate<CURDATE()) ActionOverdue FROM BBS_Corrective_Actions ca JOIN BBS_Observations o ON o.id=ca.ObservationID WHERE ${actionWhere.sql}${f.risk?' AND ca.Priority=?':''} GROUP BY o.ObservedDepartmentID,o.ObservedSafetyUnitID`,f.risk?[...actionWhere.params,f.risk]:actionWhere.params),
        db.query(`SELECT o.id,o.ObservationNo,o.ObservationDate,o.ObserverEmployeeID,o.ObserverNameSnapshot,o.ObservedEmployeeID,o.ObservedNameSnapshot,o.ObservedDepartmentSnapshot,o.ObservedUnitSnapshot,SUM(a.Response='Safe') SafeCount,SUM(a.Response='Unsafe') UnsafeCount,SUM(a.Response='N/A') NACount,(SELECT COUNT(*) FROM BBS_Corrective_Actions ca WHERE ca.ObservationID=o.id AND ca.Status<>'Closed') OpenActions FROM BBS_Observations o LEFT JOIN BBS_Observation_Answers a ON a.ObservationID=o.id WHERE ${where.sql} GROUP BY o.id ORDER BY o.ObservationDate DESC,o.id DESC LIMIT ${includeDetails?5000:12}`,where.params),
        kpiPeople(req,f,where),
        filterOptions(req,f),
    ];
    const [trendResult,paretoResult,comparisonResult,actionSummaryResult,actionRowsResult,actionComparisonResult,recentResult,kpi,options]=await Promise.all(queries);
    const trend=trendResult[0].map(row=>({period:Number(row.PeriodNo),label:f.month?String(row.PeriodNo):new Date(2000,Number(row.PeriodNo)-1,1).toLocaleString('en',{month:'short'}),observations:number(row.Observations),safe:number(row.SafeCount),unsafe:number(row.UnsafeCount),na:number(row.NACount)}));
    const totals=trend.reduce((sum,row)=>({observations:sum.observations+row.observations,safe:sum.safe+row.safe,unsafe:sum.unsafe+row.unsafe,na:sum.na+row.na}),{observations:0,safe:0,unsafe:0,na:0});totals.unsafeRate=percent(totals.unsafe,totals.safe+totals.unsafe);
    const pareto=paretoResult[0].map(row=>({category:row.Category,total:number(row.Total),unsafe:number(row.UnsafeCount),unsafeRate:percent(row.UnsafeCount,row.Total)}));
    const heatmap=comparisonResult[0].map(row=>({departmentId:Number(row.DepartmentID||0),safetyUnitId:Number(row.SafetyUnitID||0),department:row.Department||'-',unit:row.Unit||'-',observations:number(row.Observations),safe:number(row.SafeCount),unsafe:number(row.UnsafeCount),na:number(row.NACount),unsafeRate:percent(row.UnsafeCount,number(row.SafeCount)+number(row.UnsafeCount))}));
    const actionRaw=actionSummaryResult[0][0]||{},agingMap={'0-3 days':0,'4-7 days':0,'8-14 days':0,'15+ days':0};for(const row of actionRowsResult[0])agingMap[agingBucket(row.AgeDays)]++;
    const actions={total:number(actionRaw.Total),open:number(actionRaw.OpenCount),inProgress:number(actionRaw.InProgressCount),pendingVerification:number(actionRaw.PendingVerificationCount),closed:number(actionRaw.ClosedCount),overdue:number(actionRaw.OverdueCount),closureRate:percent(actionRaw.ClosedCount,actionRaw.Total),avgClosureDays:Math.round(number(actionRaw.AvgClosureDays)*10)/10,aging:Object.entries(agingMap).map(([bucket,count])=>({bucket,count}))};
    return {meta:{scope:f.scope,year:f.year,month:f.month,departmentId:f.departmentId,safetyUnitId:f.safetyUnitId,risk:f.risk,periodStart:f.range.start,periodEnd:f.range.end,periodThrough:f.range.through,generatedAt:new Date().toISOString(),detailCount:recentResult[0].length},permissions:{scopes:f.scopes,canCompany:admin(req),canExport:f.exportEnabled},options,kpi,totals,trend,pareto,heatmap,actions,comparison:mergeComparison(comparisonResult[0],actionComparisonResult[0]),recent:recentResult[0]};
}

router.get('/analytics',async(req,res)=>{try{const f=await resolveFilters(req);if(f.error)return res.status(f.error[0]).json({success:false,message:f.error[1]});const data=await analyticsPayload(req,f);return res.json({success:true,data});}catch(error){return phase6Error(res,error,'dashboard');}});
router.get('/analytics/export-data',async(req,res)=>{try{const f=await resolveFilters(req);if(f.error)return res.status(f.error[0]).json({success:false,message:f.error[1]});if(!f.exportEnabled)return res.status(403).json({success:false,message:'BBS analytics export is currently disabled.'});const data=await analyticsPayload(req,f,{includeDetails:true});if(admin(req))await logAudit(req,{action:'BBS_ANALYTICS_EXPORT',module:'bbs',targetType:'BBS_Analytics',targetId:`${f.scope}:${f.year}:${f.month||0}`,detail:`department=${f.departmentId||'all'}; unit=${f.safetyUnitId||'all'}; risk=${f.risk||'all'}; rows=${data.recent.length}`});return res.json({success:true,data});}catch(error){return phase6Error(res,error,'export');}});
router.get('/analytics/drilldown',async(req,res)=>{try{const f=await resolveFilters(req);if(f.error)return res.status(f.error[0]).json({success:false,message:f.error[1]});const metric=String(req.query.metric||'observations');if(!['observations','safe','unsafe','actions','overdue'].includes(metric))return res.status(400).json({success:false,message:'Unsupported drill-down metric.'});const data=await analyticsPayload(req,f,{includeDetails:true});let rows=data.recent;if(metric==='unsafe')rows=rows.filter(row=>number(row.UnsafeCount)>0);if(metric==='safe')rows=rows.filter(row=>number(row.SafeCount)>0);if(metric==='actions')rows=rows.filter(row=>number(row.OpenActions)>0);if(metric==='overdue'){const where=observationWhere(req,f);const[result]=await db.query(`SELECT o.id,o.ObservationNo,o.ObservationDate,o.ObserverEmployeeID,o.ObserverNameSnapshot,o.ObservedEmployeeID,o.ObservedNameSnapshot,o.ObservedDepartmentSnapshot,o.ObservedUnitSnapshot,COUNT(ca.id) OpenActions,SUM(ca.DueDate<CURDATE()) OverdueActions FROM BBS_Observations o JOIN BBS_Corrective_Actions ca ON ca.ObservationID=o.id AND ca.Status<>'Closed' WHERE ${where.sql}${f.risk?' AND ca.Priority=?':''} GROUP BY o.id HAVING OverdueActions>0 ORDER BY o.ObservationDate DESC,o.id DESC LIMIT 500`,f.risk?[...where.params,f.risk]:where.params);rows=result;}if(admin(req))await logAudit(req,{action:'BBS_ANALYTICS_DRILLDOWN',module:'bbs',targetType:'BBS_Analytics',targetId:metric,detail:`scope=${f.scope}; year=${f.year}; rows=${rows.length}`});return res.json({success:true,data:{meta:data.meta,metric,rows}});}catch(error){return phase6Error(res,error,'drilldown');}});

module.exports=router;
