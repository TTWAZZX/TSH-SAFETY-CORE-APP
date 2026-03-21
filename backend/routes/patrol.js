// backend/routes/patrol.js
// Auth is applied at mount level: app.use('/api/patrol', authenticateToken, patrolRoutes)
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const multer  = require('multer');
const { storage, fileFilter } = require('../cloudinary');

// FIX: was using diskStorage (breaks on Vercel read-only filesystem)
// Now uses Cloudinary storage. Image URLs are stored in DB instead of local paths.
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

// ==========================================
// PART 1: Schedule & Stats
// ==========================================

// GET /api/patrol/my-monthly-plan?year=Y&month=M — personal plan for logged-in user
router.get('/my-monthly-plan', async (req, res) => {
    const { year, month } = req.query;
    const employeeId = req.user.id;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    try {
        // 1. Base team membership
        const [[base]] = await db.query(`
            SELECT tm.TeamID, tm.PatrolType,
                   t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Team_Members tm
            JOIN   Patrol_Teams t ON t.id = tm.TeamID
            WHERE  tm.EmployeeID = ?
            LIMIT  1
        `, [employeeId]);

        if (!base) return res.json({ success: true, data: null }); // ไม่ได้อยู่ในทีม

        // 2. Effective team override this month
        const [[override]] = await db.query(`
            SELECT mr.TeamID, t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Member_Rotation mr
            JOIN   Patrol_Teams t ON t.id = mr.TeamID
            WHERE  mr.EmployeeID = ? AND mr.Year = ? AND mr.Month = ?
        `, [employeeId, year, month]);

        const team = override
            ? { id: override.TeamID, name: override.TeamName, group: override.PatrolGroup, color: override.Color }
            : { id: base.TeamID,     name: base.TeamName,     group: base.PatrolGroup,     color: base.Color };

        // 3. Sessions for effective team this month
        const [sessions] = await db.query(`
            SELECT s.id, s.PatrolDate, s.PatrolRound, s.Status,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  s.TeamID = ? AND YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.PatrolDate
        `, [team.id, year, month]);

        // 4. Required sessions based on PatrolType
        const required = base.PatrolType === 'management'
            ? sessions
            : sessions.filter(s => s.PatrolRound === 2);

        // 5. User attendance this month
        const [attendance] = await db.query(`
            SELECT * FROM Patrol_Attendance
            WHERE  UserID = ? AND YEAR(PatrolDate) = ? AND MONTH(PatrolDate) = ?
        `, [employeeId, year, month]);

        // 6. Team roster for effective team this month
        const [roster] = await db.query(`
            SELECT tm.EmployeeID, tm.PatrolType, e.EmployeeName,
                   COALESCE(mr.TeamID, tm.TeamID) AS EffectiveTeamID
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            LEFT JOIN Patrol_Member_Rotation mr
                   ON mr.EmployeeID = tm.EmployeeID AND mr.Year = ? AND mr.Month = ?
            WHERE  COALESCE(mr.TeamID, tm.TeamID) = ?
            ORDER BY FIELD(tm.PatrolType,'top','committee','management'), e.EmployeeName
        `, [year, month, team.id]);

        res.json({
            success: true,
            data: {
                patrolType: base.PatrolType,
                team,
                sessions,
                required,
                attended: attendance.length,
                roster,
                compliance: {
                    required: required.length,
                    attended: attendance.length,
                    done: attendance.length >= required.length,
                },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/my-schedule', async (req, res) => {
    try {
        const { month, year } = req.query;
        const [rows] = await db.query(
            'SELECT * FROM Patrol_Sessions WHERE YEAR(PatrolDate) = ? AND MONTH(PatrolDate) = ? ORDER BY PatrolDate ASC',
            [year, month]
        );
        res.json(rows);
    } catch (error) {
        res.json([]);
    }
});

// FIX: was returning hardcoded mock data — now queries real DB
router.get('/attendance-stats', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                UserName AS Name,
                COUNT(*) AS Total,
                ROUND(COUNT(*) * 100.0 / NULLIF(
                    (SELECT COUNT(DISTINCT YEARWEEK(PatrolDate)) FROM Patrol_Attendance), 0
                )) AS Percent
            FROM Patrol_Attendance
            GROUP BY UserID, UserName
            ORDER BY Total DESC
            LIMIT 20
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงสถิติการเข้างานได้' });
    }
});

// FIX: was returning hardcoded mock data — now queries real DB
router.get('/dashboard-stats', async (req, res) => {
    const [bySection] = await db.query(`
        SELECT Area AS Section,
               COUNT(CASE WHEN CurrentStatus = 'Closed' THEN 1 END) AS Achieved,
               COUNT(CASE WHEN CurrentStatus != 'Closed' THEN 1 END) AS OnProcess
        FROM Patrol_Issues
        GROUP BY Area
        ORDER BY Achieved DESC
    `).catch(e => { console.error('dashboard-stats bySection:', e.message); return [[]]; });

    const [byRank] = await db.query(`
        SELECT HazardType AS HazardRank, COUNT(*) AS Count
        FROM Patrol_Issues
        GROUP BY HazardType
        ORDER BY Count DESC
    `).catch(e => { console.error('dashboard-stats byRank:', e.message); return [[]]; });

    res.json({ bySection: bySection || [], byRank: byRank || [] });
});

// ==========================================
// PART 2: Check-in
// ==========================================

router.post('/checkin', async (req, res) => {
    try {
        // ดึงข้อมูลผู้ใช้จาก JWT (req.user) ไม่รับจาก req.body เพื่อป้องกันการปลอมแปลง
        const UserID   = req.user.id;
        const UserName = req.user.name;
        const TeamName = req.user.team || '';
        const currentWeek = getWeekNumber(new Date());
        await db.query(
            'INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber) VALUES (?, ?, ?, ?)',
            [UserID, UserName, TeamName, currentWeek]
        );

        const [stats] = await db.query(
            'SELECT COUNT(*) AS TotalWalks, MAX(PatrolDate) AS LastWalk FROM Patrol_Attendance WHERE UserID = ?',
            [UserID]
        );
        const [teamStats] = await db.query(
            'SELECT COUNT(*) AS TeamWalks FROM Patrol_Attendance WHERE TeamName = ?',
            [TeamName]
        );
        const [todayWalkers] = await db.query(
            'SELECT UserName, PatrolDate FROM Patrol_Attendance WHERE DATE(PatrolDate) = CURDATE() ORDER BY PatrolDate DESC LIMIT 5'
        );

        res.json({
            success: true,
            message: 'เช็คอินสำเร็จ!',
            data: {
                totalWalks: stats[0].TotalWalks,
                teamWalks: teamStats[0].TeamWalks || 0,
                todayWalkers,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'ไม่สามารถเช็คอินได้' });
    }
});

// ==========================================
// PART 3: Issues
// ==========================================

router.get('/issues', async (req, res) => {
    try {
        const [issues] = await db.query('SELECT * FROM Patrol_Issues ORDER BY IssueID DESC');
        res.json({ success: true, issues });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลประเด็นได้' });
    }
});

router.post('/issue/save', upload.fields([
    { name: 'BeforeImage', maxCount: 1 },
    { name: 'TempImage',   maxCount: 1 },
    { name: 'AfterImage',  maxCount: 1 },
]), async (req, res) => {
    try {
        const data  = req.body;
        const files = req.files || {};
        // FIX: was returning local /uploads/ path (unusable on Vercel) — now returns Cloudinary URL
        const getUrl = (fieldName) => files[fieldName] ? files[fieldName][0].path : null;

        if (data.ActionType === 'OPEN') {
            await db.query(
                `INSERT INTO Patrol_Issues
                 (DateFound, FoundByTeam, Area, ResponsibleDept, HazardType, MachineName, HazardDescription, BeforeImage, CurrentStatus)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open')`,
                [data.DateFound, data.FoundByTeam, data.Area, data.ResponsibleDept,
                 data.HazardType, data.MachineName, data.HazardDescription, getUrl('BeforeImage')]
            );
        } else if (data.ActionType === 'TEMP') {
            await db.query(
                `UPDATE Patrol_Issues
                 SET TempDescription = ?, TempImage = ?, TempDate = NOW(), CurrentStatus = 'Temporary'
                 WHERE IssueID = ?`,
                [data.TempDescription, getUrl('TempImage'), data.IssueID]
            );
        } else if (data.ActionType === 'CLOSE') {
            await db.query(
                `UPDATE Patrol_Issues
                 SET ActionDescription = ?, AfterImage = ?, FinishDate = ?, CurrentStatus = 'Closed'
                 WHERE IssueID = ?`,
                [data.ActionDescription, getUrl('AfterImage'), data.FinishDate, data.IssueID]
            );
        } else {
            return res.status(400).json({ success: false, message: 'ActionType ไม่ถูกต้อง' });
        }

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกข้อมูลได้' });
    }
});

// ==========================================
// PART 4: Patrol Teams
// ==========================================

// GET /api/patrol/teams — list all teams with member count
router.get('/teams', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT t.*,
                   COUNT(m.id) AS MemberCount
            FROM   Patrol_Teams t
            LEFT JOIN Patrol_Team_Members m ON m.TeamID = t.id
            GROUP BY t.id
            ORDER BY t.id
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/teams — create team
router.post('/teams', async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    if (!Name || !PatrolGroup) return res.status(400).json({ success: false, message: 'Name และ PatrolGroup จำเป็น' });
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Teams (Name, PatrolGroup, Color) VALUES (?,?,?)',
            [Name, PatrolGroup, Color || '#6366f1']
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/patrol/teams/:id — update team
router.put('/teams/:id', async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    try {
        await db.query(
            'UPDATE Patrol_Teams SET Name=?, PatrolGroup=?, Color=? WHERE id=?',
            [Name, PatrolGroup, Color, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/teams/:id — delete team + members
router.delete('/teams/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE TeamID=?', [req.params.id]);
        await db.query('DELETE FROM Patrol_Teams WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PART 5: Team Members
// ==========================================

// GET /api/patrol/teams/:id/members — members with employee info
router.get('/teams/:id/members', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT m.id, m.TeamID, m.EmployeeID, m.PatrolType,
                   e.EmployeeName, e.Department, e.Position
            FROM   Patrol_Team_Members m
            LEFT JOIN Employees e ON e.EmployeeID = m.EmployeeID
            WHERE  m.TeamID = ?
            ORDER BY m.PatrolType DESC, e.EmployeeName
        `, [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/teams/:id/members — add member
router.post('/teams/:id/members', async (req, res) => {
    const { EmployeeID, PatrolType } = req.body;
    if (!EmployeeID || !PatrolType) return res.status(400).json({ success: false, message: 'EmployeeID และ PatrolType จำเป็น' });
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Team_Members (TeamID, EmployeeID, PatrolType) VALUES (?,?,?)',
            [req.params.id, EmployeeID, PatrolType]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'พนักงานนี้อยู่ในทีมนี้แล้ว' });
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/teams/:teamId/members/:memberId — remove member
router.delete('/teams/:teamId/members/:memberId', async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE id=? AND TeamID=?',
            [req.params.memberId, req.params.teamId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PART 6: Patrol Areas
// ==========================================

// GET /api/patrol/areas
router.get('/areas', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Patrol_Areas ORDER BY SortOrder, id');
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PART 7: Member Rotation (monthly team assignment per member)
// ==========================================
// SQL to create table (run once in DBeaver):
// CREATE TABLE IF NOT EXISTS Patrol_Member_Rotation (
//     id INT AUTO_INCREMENT PRIMARY KEY,
//     EmployeeID VARCHAR(50) NOT NULL,
//     TeamID INT NOT NULL,
//     Year INT NOT NULL,
//     Month INT NOT NULL,
//     UNIQUE KEY uk_emp_yr_mo (EmployeeID, Year, Month),
//     INDEX idx_team_yr_mo (TeamID, Year, Month)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

// GET /api/patrol/member-rotation?year=Y — all monthly assignments for the year
router.get('/member-rotation', async (req, res) => {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'year จำเป็น' });
    try {
        const [base] = await db.query(`
            SELECT tm.id, tm.EmployeeID, tm.TeamID, tm.PatrolType,
                   e.EmployeeName,
                   t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            JOIN   Patrol_Teams t ON t.id = tm.TeamID
            ORDER BY t.PatrolGroup, t.id, tm.PatrolType, e.EmployeeName
        `);
        const [monthly] = await db.query(`
            SELECT mr.EmployeeID, mr.TeamID, mr.Month,
                   t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Member_Rotation mr
            JOIN   Patrol_Teams t ON t.id = mr.TeamID
            WHERE  mr.Year = ?
            ORDER BY mr.Month
        `, [year]);
        res.json({ success: true, base, monthly });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/member-rotation — bulk upsert monthly member→team assignments
router.post('/member-rotation', async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        for (const { EmployeeID, TeamID, Year, Month } of items) {
            await conn.query(`
                INSERT INTO Patrol_Member_Rotation (EmployeeID, TeamID, Year, Month)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE TeamID=VALUES(TeamID)
            `, [EmployeeID, TeamID, Year, Month]);
        }
        await conn.commit();
        res.json({ success: true, saved: items.length });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { conn.release(); }
});

// GET /api/patrol/monthly-report?year=Y&month=M — monthly grid report (all teams + members)
router.get('/monthly-report', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    try {
        // Sessions for the month
        const [sessions] = await db.query(`
            SELECT s.id, s.TeamID, s.PatrolDate, s.PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            JOIN   Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.TeamID, s.PatrolDate
        `, [year, month]);

        // Members with effective team (rotation override or base)
        const [members] = await db.query(`
            SELECT tm.EmployeeID, tm.PatrolType,
                   e.EmployeeName,
                   COALESCE(mr.TeamID, tm.TeamID) AS EffectiveTeamID
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            LEFT JOIN Patrol_Member_Rotation mr
                   ON mr.EmployeeID = tm.EmployeeID AND mr.Year = ? AND mr.Month = ?
            ORDER BY COALESCE(mr.TeamID, tm.TeamID),
                     FIELD(tm.PatrolType,'top','committee','management'),
                     e.EmployeeName
        `, [year, month]);

        // Build team map from sessions
        const teamMap = {};
        sessions.forEach(s => {
            if (!teamMap[s.TeamID]) {
                teamMap[s.TeamID] = {
                    TeamID: s.TeamID, TeamName: s.TeamName,
                    PatrolGroup: s.PatrolGroup, Color: s.Color,
                    sessions: [], members: [],
                };
            }
            teamMap[s.TeamID].sessions.push(s);
        });

        // Assign members to effective team
        members.forEach(m => {
            if (teamMap[m.EffectiveTeamID]) {
                teamMap[m.EffectiveTeamID].members.push(m);
            }
        });

        const teams = Object.values(teamMap).sort((a, b) => a.TeamID - b.TeamID);
        res.json({ success: true, data: teams, year: parseInt(year), month: parseInt(month) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/member-schedule?year=Y — full annual schedule per member
router.get('/member-schedule', async (req, res) => {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'year จำเป็น' });
    try {
        // 1. Base team members
        const [members] = await db.query(`
            SELECT tm.EmployeeID, tm.TeamID AS BaseTeamID, tm.PatrolType,
                   e.EmployeeName, e.Department,
                   t.Name AS BaseTeamName, t.PatrolGroup
            FROM   Patrol_Team_Members tm
            JOIN   Employees e ON e.EmployeeID = tm.EmployeeID
            JOIN   Patrol_Teams t ON t.id = tm.TeamID
            ORDER BY t.PatrolGroup, tm.PatrolType, e.EmployeeName
        `);

        // 2. Monthly team overrides
        const [rotations] = await db.query(
            'SELECT EmployeeID, TeamID, Month FROM Patrol_Member_Rotation WHERE Year = ?', [year]
        );
        const rotMap = {};
        rotations.forEach(r => {
            if (!rotMap[r.EmployeeID]) rotMap[r.EmployeeID] = {};
            rotMap[r.EmployeeID][r.Month] = r.TeamID;
        });

        // 3. All sessions for the year with team + area info
        const [sessions] = await db.query(`
            SELECT s.TeamID, s.PatrolDate, s.PatrolRound,
                   t.Name AS TeamName, t.Color AS TeamColor,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ?
            ORDER BY s.PatrolDate
        `, [year]);

        // sessMap[teamId][month] = [ session, ... ]
        const sessMap = {};
        sessions.forEach(s => {
            const month = new Date(s.PatrolDate).getMonth() + 1;
            if (!sessMap[s.TeamID]) sessMap[s.TeamID] = {};
            if (!sessMap[s.TeamID][month]) sessMap[s.TeamID][month] = [];
            sessMap[s.TeamID][month].push(s);
        });

        // 4. Build per-member annual schedule
        const data = members.map(m => {
            const months = Array.from({ length: 12 }, (_, i) => {
                const month  = i + 1;
                const teamId = (rotMap[m.EmployeeID] || {})[month] || m.BaseTeamID;
                const all    = (sessMap[teamId] || {})[month] || [];
                // top & committee → round 2 only; management → all rounds
                const filtered = m.PatrolType === 'management'
                    ? all
                    : all.filter(s => s.PatrolRound === 2);
                return { month, teamId, sessions: filtered };
            });
            return { ...m, months };
        });

        res.json({ success: true, data, year: parseInt(year) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PART 8: Area Rotation
// ==========================================

// GET /api/patrol/rotation?year=&month= — rotation ของเดือน (all teams)
router.get('/rotation', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    try {
        const [rows] = await db.query(`
            SELECT r.*, t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            JOIN   Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
            ORDER BY t.id
        `, [year, month]);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/patrol/rotation — upsert rotation (array of {TeamID, AreaID, Year, Month})
router.post('/rotation', async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array ของ rotation' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        for (const { TeamID, AreaID, Year, Month } of items) {
            await conn.query(`
                INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE AreaID=VALUES(AreaID)
            `, [TeamID, AreaID, Year, Month]);
        }
        await conn.commit();
        res.json({ success: true, saved: items.length });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, message: err.message });
    } finally { conn.release(); }
});

// ==========================================
// PART 8: Generate Sessions
// ==========================================

// POST /api/patrol/generate-sessions { year, month }
// — สร้าง Patrol_Sessions จาก rotation ของเดือนนั้นอัตโนมัติ
router.post('/generate-sessions', async (req, res) => {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });

    try {
        // 1. ดึง rotation + teams ของเดือนนี้
        const [rotations] = await db.query(`
            SELECT r.TeamID, r.AreaID,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            JOIN   Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
        `, [year, month]);

        if (rotations.length === 0)
            return res.status(400).json({ success: false, message: 'ยังไม่มีตารางหมุนเวียนของเดือนนี้ กรุณาตั้งค่า Rotation ก่อน' });

        // 2. หาวันพุธทั้งหมดในเดือน (เรียงลำดับ)
        const wednesdays = getWednesdaysInMonth(parseInt(year), parseInt(month));
        // wednesdays[0]=พุธ1, [1]=พุธ2, [2]=พุธ3, [3]=พุธ4
        // Group A → [0],[2] (พุธที่ 1 & 3)
        // Group B → [1],[3] (พุธที่ 2 & 4)

        const groupDates = {
            A: [wednesdays[0], wednesdays[2]].filter(Boolean),
            B: [wednesdays[1], wednesdays[3]].filter(Boolean),
        };

        const conn = await db.getConnection();
        let created = 0;
        try {
            await conn.beginTransaction();
            for (const rot of rotations) {
                const dates = groupDates[rot.PatrolGroup] || [];
                for (let i = 0; i < dates.length; i++) {
                    const dateStr = dates[i]; // 'YYYY-MM-DD'
                    const round   = i + 1;    // 1 หรือ 2

                    // ตรวจว่ามี session นี้แล้วหรือยัง (ป้องกัน duplicate)
                    const [exist] = await conn.query(
                        'SELECT id FROM Patrol_Sessions WHERE PatrolDate=? AND TeamID=?',
                        [dateStr, rot.TeamID]
                    );
                    if (exist.length > 0) continue;

                    await conn.query(`
                        INSERT INTO Patrol_Sessions
                            (PatrolDate, TeamName, TeamID, AreaID, PatrolRound, Status)
                        VALUES (?,?,?,?,?,'Pending')
                    `, [dateStr, rot.TeamName, rot.TeamID, rot.AreaID, round]);
                    created++;
                }
            }
            await conn.commit();
            res.json({ success: true, created, message: `สร้าง ${created} sessions สำเร็จ` });
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally { conn.release(); }

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/patrol/monthly-summary?year=&month= — สรุปรายเดือนสำหรับแสดงใน patrol page
router.get('/monthly-summary', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    try {
        const [sessions] = await db.query(`
            SELECT s.*, s.PatrolDate AS ScheduledDate,
                   t.Color AS TeamColor, a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.PatrolDate, s.TeamID
        `, [year, month]);
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/patrol/sessions/:id — แก้ไขวันที่ / area / status
router.put('/sessions/:id', async (req, res) => {
    const { PatrolDate, AreaID, Status } = req.body;
    if (!PatrolDate && !AreaID && !Status)
        return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });
    try {
        const sets  = [];
        const vals  = [];
        if (PatrolDate) { sets.push('PatrolDate = ?'); vals.push(PatrolDate); }
        if (AreaID)     { sets.push('AreaID = ?');     vals.push(AreaID); }
        if (Status)     { sets.push('Status = ?');     vals.push(Status); }
        vals.push(req.params.id);
        const [result] = await db.query(
            `UPDATE Patrol_Sessions SET ${sets.join(', ')} WHERE id = ?`, vals
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'แก้ไข session เรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/patrol/sessions/:id — ลบ session (Admin)
router.delete('/sessions/:id', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM Patrol_Sessions WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'ลบ session เรียบร้อย' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// Helpers
// ==========================================

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// คืน array ของวันพุธในเดือน format 'YYYY-MM-DD' เรียงลำดับ
function getWednesdaysInMonth(year, month) {
    const result = [];
    const d = new Date(year, month - 1, 1);
    // หาวันพุธแรก
    while (d.getDay() !== 3) d.setDate(d.getDate() + 1);
    while (d.getMonth() === month - 1) {
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        result.push(`${d.getFullYear()}-${mm}-${dd}`);
        d.setDate(d.getDate() + 7);
    }
    return result; // [พุธ1, พุธ2, พุธ3, พุธ4]
}

// GET /api/patrol/attendance-overview?year=Y — ภาพรวมการเข้าร่วมรายบุคคลทั้งปี
router.get('/attendance-overview', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        // 1. สมาชิกทุกคนพร้อม PatrolType และ TeamID หลัก
        const [members] = await db.query(`
            SELECT tm.EmployeeID, e.EmployeeName AS Name, tm.PatrolType, tm.TeamID
            FROM Patrol_Team_Members tm
            JOIN Employees e ON e.EmployeeID = tm.EmployeeID
            ORDER BY FIELD(tm.PatrolType,'top','committee','management'), e.EmployeeName
        `);

        // 2. Sessions ทั้งปี
        const [sessions] = await db.query(`
            SELECT id, TeamID, PatrolRound
            FROM Patrol_Sessions
            WHERE YEAR(PatrolDate) = ?
        `, [year]);

        // 3. Monthly overrides (member rotation)
        const [rotations] = await db.query(`
            SELECT EmployeeID, TeamID, Month
            FROM Patrol_Member_Rotation
            WHERE Year = ?
        `, [year]);
        const rotMap = {};
        rotations.forEach(r => {
            if (!rotMap[r.EmployeeID]) rotMap[r.EmployeeID] = {};
            rotMap[r.EmployeeID][r.Month] = r.TeamID;
        });

        // 4. Attendance counts ทั้งปี
        const [attendance] = await db.query(`
            SELECT UserID, COUNT(*) AS Attended
            FROM Patrol_Attendance
            WHERE YEAR(PatrolDate) = ?
            GROUP BY UserID
        `, [year]);
        const attendMap = {};
        attendance.forEach(a => { attendMap[a.UserID] = parseInt(a.Attended); });

        // 5. Sessions จัดกลุ่มตาม TeamID × Month (สำหรับ rotation-aware count)
        const [sessWithMonth] = await db.query(`
            SELECT id, TeamID, PatrolRound, MONTH(PatrolDate) AS Month
            FROM Patrol_Sessions
            WHERE YEAR(PatrolDate) = ?
        `, [year]);

        // คำนวณ required sessions ต่อสมาชิก (คำนึง rotation)
        const result = members.map(m => {
            let required = 0;
            for (let mo = 1; mo <= 12; mo++) {
                const effectiveTeamId = (rotMap[m.EmployeeID]?.[mo]) || m.TeamID;
                const monthSess = sessWithMonth.filter(s => s.TeamID === effectiveTeamId && s.Month === mo);
                if (m.PatrolType === 'management') {
                    required += monthSess.length;
                } else {
                    // top / committee — รอบ 2 เท่านั้น
                    required += monthSess.filter(s => s.PatrolRound === 2).length;
                }
            }
            const attended = attendMap[m.EmployeeID] || 0;
            const percent  = required > 0 ? Math.round((attended / required) * 100) : 0;
            return { EmployeeID: m.EmployeeID, Name: m.Name, PatrolType: m.PatrolType, Year: year, Total: required, Attended: attended, Percent: percent };
        });

        // Grand totals
        const grandTotal    = result.reduce((s, r) => s + r.Total, 0);
        const grandAttended = result.reduce((s, r) => s + r.Attended, 0);
        const grandPercent  = grandTotal > 0 ? Math.round((grandAttended / grandTotal) * 100) : 0;

        const [latest] = await db.query(
            'SELECT MAX(PatrolDate) AS LatestDate FROM Patrol_Attendance WHERE YEAR(PatrolDate) = ?',
            [year]
        );

        res.json({
            success: true,
            data: {
                members: result,
                summary: { totalSessions: grandTotal, totalAttended: grandAttended, percent: grandPercent, latestDate: latest[0]?.LatestDate || null, year },
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
