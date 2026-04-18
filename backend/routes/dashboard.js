// backend/routes/dashboard.js
// Cross-module KPI overview — accessible to all authenticated users.
// Mounted at /api/dashboard (authenticateToken only, no isAdmin).
const express = require('express');
const router  = express.Router();
const db      = require('../db');

const safe = async (sql, params = []) => {
    try { const [[r]] = await db.query(sql, params); return r?.cnt ?? r?.val ?? 0; }
    catch { return null; }
};

// ─── GET /api/dashboard/overview ─────────────────────────────────────────────
router.get('/overview', async (_req, res) => {
    const year = new Date().getFullYear();
    try {
        const [
            // Patrol
            patrolSessions, patrolAttended, patrolOpenIssues,
            // CCCF
            cccfWorkerYear, cccfAssigned, cccfCompleted,
            // Yokoten
            yokotenTopics, yokotenResponded,
            // Training
            trTotalEmp, trTotalPassed,
            // Hiyari
            hiyariOpen, hiyariYear,
            // KY
            kyYear,
            // Accident
            accYear, accRecordable,
            // Safety Culture
            scYear,
            // 4M Change
            fourmOpen,
        ] = await Promise.all([
            // Patrol: unique sessions with at least 1 attendee this year
            safe(`SELECT COUNT(DISTINCT DATE(PatrolDate)) AS cnt FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Patrol_Attendance WHERE YEAR(PatrolDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Patrol_Issues WHERE CurrentStatus NOT IN ('Closed')`),

            // CCCF
            safe(`SELECT COUNT(*) AS cnt FROM CCCF_FormA_Worker WHERE YEAR(SubmitDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM CCCF_Assignments`),
            safe(`SELECT COUNT(DISTINCT fa.AssigneeID) AS cnt FROM CCCF_FormA_Permanent fa
                  JOIN CCCF_Assignments ca ON fa.AssigneeID = ca.EmployeeID WHERE YEAR(fa.SubmitDate)=?`, [year]),

            // Yokoten
            safe(`SELECT COUNT(*) AS cnt FROM YokotenTopics WHERE IsActive=1`),
            safe(`SELECT COUNT(DISTINCT Department) AS cnt FROM YokotenResponses WHERE YEAR(ResponseDate)=?`, [year]),

            // Training
            safe(`SELECT COALESCE(SUM(TotalEmp),0) AS cnt FROM Training_Dept_Records WHERE Year=?`, [year]),
            safe(`SELECT COALESCE(SUM(PassedCount),0) AS cnt FROM Training_Dept_Records WHERE Year=?`, [year]),

            // Hiyari
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports WHERE Status NOT IN ('Closed','closed')`),
            safe(`SELECT COUNT(*) AS cnt FROM HiyariReports WHERE YEAR(ReportDate)=?`, [year]),

            // KY
            safe(`SELECT COUNT(*) AS cnt FROM KY_Activities WHERE YEAR(ActivityDate)=?`, [year]),

            // Accident
            safe(`SELECT COUNT(*) AS cnt FROM Accident_Reports WHERE YEAR(AccidentDate)=?`, [year]),
            safe(`SELECT COUNT(*) AS cnt FROM Accident_Reports WHERE YEAR(AccidentDate)=? AND IsRecordable=1`, [year]),

            // Safety Culture
            safe(`SELECT COUNT(*) AS cnt FROM Safety_Culture_Activities WHERE YEAR(ActivityDate)=?`, [year]),

            // 4M Change
            safe(`SELECT COUNT(*) AS cnt FROM FourM_ChangeNotices WHERE Status='Open'`),
        ]);

        // Derived metrics
        const patrolRate  = patrolAttended && patrolSessions
            ? Math.min(Math.round(patrolAttended / (patrolSessions * 1) * 100), 100) : null;
        const cccfPermPct = cccfAssigned
            ? Math.min(Math.round((cccfCompleted / cccfAssigned) * 100), 100) : null;
        const yokotenPct  = yokotenTopics
            ? Math.min(Math.round((yokotenResponded / yokotenTopics) * 100), 100) : null;
        const trainingPassRate = trTotalEmp
            ? Math.min(Math.round((trTotalPassed / trTotalEmp) * 100), 100) : null;

        res.json({
            success: true,
            data: {
                year,
                patrol:       { sessions: patrolSessions, attended: patrolAttended, openIssues: patrolOpenIssues, rate: patrolRate },
                cccf:         { workerYear: cccfWorkerYear, assigned: cccfAssigned, completed: cccfCompleted, permPct: cccfPermPct },
                yokoten:      { topics: yokotenTopics, responded: yokotenResponded, pct: yokotenPct },
                training:     { totalEmp: trTotalEmp, passed: trTotalPassed, passRate: trainingPassRate },
                hiyari:       { open: hiyariOpen, year: hiyariYear },
                ky:           { year: kyYear },
                accident:     { year: accYear, recordable: accRecordable },
                safetyCulture:{ year: scYear },
                fourm:        { open: fourmOpen },
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
