// backend/routes/person-search.js
// Employee Safety 360: searchable person profile backed by existing module tables.

const express = require('express');
const router = express.Router();
const db = require('../db');

const n = (value) => parseInt(value, 10) || 0;

async function safeOne(sql, params = []) {
    try {
        const [[row]] = await db.query(sql, params);
        return row || null;
    } catch {
        return null;
    }
}

async function safeRows(sql, params = []) {
    try {
        const [rows] = await db.query(sql, params);
        return rows || [];
    } catch {
        return [];
    }
}

function canViewEmployee(req, employeeId) {
    const role = req.user?.role || req.user?.Role;
    return role === 'Admin' || String(req.user?.id || '') === String(employeeId || '');
}

function scoreFrom(items) {
    const valid = items.filter(i => i.target > 0);
    if (!valid.length) return null;
    const avg = valid.reduce((sum, i) => sum + Math.min(Math.round((i.actual / i.target) * 100), 100), 0) / valid.length;
    return Math.round(avg);
}

router.get('/employees', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const department = String(req.query.department || '').trim();
    const limit = Math.min(Math.max(n(req.query.limit) || 20, 1), 50);
    const params = [];

    let sql = `
        SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role
        FROM Employees
        WHERE 1=1
    `;
    if (q) {
        sql += ` AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ? OR Unit LIKE ? OR Position LIKE ?)`;
        const like = `%${q}%`;
        params.push(like, like, like, like, like);
    }
    if (department && department !== 'all') {
        sql += ` AND Department = ?`;
        params.push(department);
    }
    sql += ` ORDER BY EmployeeName ASC LIMIT ${limit}`;

    try {
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/profile/:employeeId', async (req, res) => {
    const employeeId = String(req.params.employeeId || '').trim();
    const year = n(req.query.year) || new Date().getFullYear();
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID' });

    try {
        const employee = await safeOne(
            `SELECT EmployeeID, EmployeeName, Department, Unit, Team, Position, Role
             FROM Employees WHERE EmployeeID = ?`,
            [employeeId]
        );
        if (!employee) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });

        const [
            patrol, patrolIssues, cccfWorker, cccfPermanent, training, trainingPassed,
            hiyari, ky, yokoten, accidents, fourmOwner, fourmCreated, policyAck,
            ppeViolations, scwDocs, ojtDept, patrolRecent, trainingRecent, hiyariRecent,
            kyRecent, accidentRecent, fourmRecent, yokotenRecent, selfPatrolRecent,
        ] = await Promise.all([
            safeOne(`SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE UserID=? AND YEAR(PatrolDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Patrol_Issues WHERE ReporterID=? AND YEAR(DateFound)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE EmployeeID=? AND YEAR(SubmitDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Permanent WHERE AssigneeID=? AND YEAR(SubmitDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Training_Records WHERE EmployeeID=? AND YEAR(TrainingDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Training_Records WHERE EmployeeID=? AND YEAR(TrainingDate)=? AND IsPassed=1`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM HiyariReports WHERE ReporterID=? AND YEAR(ReportDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM KY_Activities WHERE ReporterID=? AND YEAR(ActivityDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM YokotenResponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Accident_Reports WHERE EmployeeID=? AND YEAR(AccidentDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE ResponsiblePerson=? AND YEAR(RequestDate)=?`, [employee.EmployeeName, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE CreatedByID=? AND YEAR(RequestDate)=?`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM Policy_Acknowledgements WHERE UserID=?`, [employeeId]),
            safeOne(`SELECT COUNT(*) AS cnt FROM SC_PPE_Violations WHERE EmployeeID=? AND YEAR(ViolationDate)=? AND (deleted_at IS NULL)`, [employeeId, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM SCW_Documents WHERE UploadedBy=? AND YEAR(UploadedAt)=?`, [employee.EmployeeName, year]),
            safeOne(`SELECT COUNT(*) AS cnt FROM OJT_Records WHERE Department=? AND YEAR(OJTDate)=?`, [employee.Department, year]),
            safeRows(`SELECT id, PatrolDate, PatrolType, Area, Notes, RecordedBy
                      FROM Patrol_Attendance WHERE UserID=? AND YEAR(PatrolDate)=?
                      ORDER BY PatrolDate DESC, id DESC LIMIT 12`, [employeeId, year]),
            safeRows(`SELECT r.id, r.TrainingDate, r.Score, r.IsPassed, c.CourseName, c.CourseCode
                      FROM Training_Records r LEFT JOIN Training_Courses c ON c.id = r.CourseID
                      WHERE r.EmployeeID=? AND YEAR(r.TrainingDate)=?
                      ORDER BY r.TrainingDate DESC, r.id DESC LIMIT 8`, [employeeId, year]),
            safeRows(`SELECT id, ReportDate, Location, Description, Status
                      FROM HiyariReports WHERE ReporterID=? AND YEAR(ReportDate)=?
                      ORDER BY ReportDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, ActivityDate, TeamName, HazardDescription, Status
                      FROM KY_Activities WHERE ReporterID=? AND YEAR(ActivityDate)=?
                      ORDER BY ActivityDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, AccidentDate, AccidentType, Status, Location
                      FROM Accident_Reports WHERE EmployeeID=? AND YEAR(AccidentDate)=?
                      ORDER BY AccidentDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, NoticeNo, RequestDate, Title, Status, ChangeType
                      FROM FourM_ChangeNotices
                      WHERE (CreatedByID=? OR ResponsiblePerson=?) AND YEAR(RequestDate)=?
                      ORDER BY RequestDate DESC LIMIT 6`, [employeeId, employee.EmployeeName, year]),
            safeRows(`SELECT ResponseID, ResponseDate, YokotenID, ApprovalStatus, IsRelated
                      FROM YokotenResponses WHERE EmployeeID=? AND YEAR(ResponseDate)=?
                      ORDER BY ResponseDate DESC LIMIT 6`, [employeeId, year]),
            safeRows(`SELECT id, CheckinDate, Location, Notes
                      FROM Patrol_Self_Checkin WHERE EmployeeID=? AND Year=?
                      ORDER BY CheckinDate DESC LIMIT 8`, [employeeId, year]),
        ]);

        const metrics = {
            patrol: n(patrol?.cnt),
            patrolIssues: n(patrolIssues?.cnt),
            cccfWorker: n(cccfWorker?.cnt),
            cccfPermanent: n(cccfPermanent?.cnt),
            training: n(training?.cnt),
            trainingPassed: n(trainingPassed?.cnt),
            hiyari: n(hiyari?.cnt),
            ky: n(ky?.cnt),
            yokoten: n(yokoten?.cnt),
            accidents: n(accidents?.cnt),
            fourmOwner: n(fourmOwner?.cnt),
            fourmCreated: n(fourmCreated?.cnt),
            policyAck: n(policyAck?.cnt),
            ppeViolations: n(ppeViolations?.cnt),
            scwDocs: n(scwDocs?.cnt),
            ojtDept: n(ojtDept?.cnt),
        };

        const complianceScore = scoreFrom([
            { actual: metrics.patrol, target: 12 },
            { actual: metrics.trainingPassed, target: Math.max(metrics.training, 1) },
            { actual: metrics.cccfWorker + metrics.cccfPermanent, target: 1 },
            { actual: metrics.hiyari + metrics.ky + metrics.yokoten, target: 1 },
        ]);

        const timeline = [
            ...patrolRecent.map(r => ({ type: 'Patrol', date: r.PatrolDate, title: r.Area || r.PatrolType || 'Patrol record', status: r.PatrolType, refId: r.id })),
            ...trainingRecent.map(r => ({ type: 'Training', date: r.TrainingDate, title: r.CourseName || r.CourseCode || 'Training', status: r.IsPassed ? 'Passed' : 'Not passed', refId: r.id })),
            ...hiyariRecent.map(r => ({ type: 'Hiyari', date: r.ReportDate, title: r.Location || r.Description || 'Near-miss', status: r.Status, refId: r.id })),
            ...kyRecent.map(r => ({ type: 'KY', date: r.ActivityDate, title: r.TeamName || r.HazardDescription || 'KY Activity', status: r.Status, refId: r.id })),
            ...accidentRecent.map(r => ({ type: 'Accident', date: r.AccidentDate, title: r.AccidentType || r.Location || 'Accident report', status: r.Status, refId: r.id })),
            ...fourmRecent.map(r => ({ type: '4M', date: r.RequestDate, title: `${r.NoticeNo || ''} ${r.Title || ''}`.trim(), status: r.Status, refId: r.id })),
            ...yokotenRecent.map(r => ({ type: 'Yokoten', date: r.ResponseDate, title: `Yokoten #${r.YokotenID}`, status: r.ApprovalStatus, refId: r.ResponseID })),
            ...selfPatrolRecent.map(r => ({ type: 'Self Patrol', date: r.CheckinDate, title: r.Location || 'Self Patrol', status: 'Recorded', refId: r.id })),
        ]
            .filter(i => i.date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 20);

        res.json({
            success: true,
            data: {
                year,
                employee,
                access: { canManagePatrol: (req.user?.role || req.user?.Role) === 'Admin', canViewSensitive: canViewEmployee(req, employeeId) },
                metrics,
                complianceScore,
                patrolRecords: patrolRecent,
                selfPatrolRecords: selfPatrolRecent,
                trainingRecords: trainingRecent,
                timeline,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
