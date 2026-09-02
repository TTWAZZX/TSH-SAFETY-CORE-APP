// backend/routes/patrol.js
// Auth is applied at mount level: app.use('/api/patrol', authenticateToken, patrolRoutes)
const express      = require('express');
const router       = express.Router();
const db           = require('../db');
const mysql        = require('mysql2'); // used for mysql.escape() in generate-sessions
const { randomUUID } = require('crypto'); // UUID for Patrol_Sessions.SessionID (VARCHAR)
const multer       = require('multer');
const { storage, fileFilter, deleteLocalUpload } = require('../storage');
const { isAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { sendMail, smtpConfigured } = require('../utils/email');
const { ensureEmployeeCompanyEmailColumn } = require('../utils/company-email');
const { buildHiyariEmail } = require('../utils/hiyari-email-template');
const { getMergedTargets } = require('./activity-targets');
const {
    canUpdatePatrolIssue,
    hasInitialIssueFieldChanges,
    issueMultiDisplay,
    issueMultiValues,
    issueStopIds,
} = require('../utils/patrol-issue-values');

// Auto-migrate: Patrol_Attendance columns + Master_Positions.PatrolPassPct
(async () => {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS Patrol_Self_Checkin (
            id INT AUTO_INCREMENT PRIMARY KEY,
            EmployeeID VARCHAR(50) NOT NULL,
            CheckinDate DATE NOT NULL,
            Location VARCHAR(255) DEFAULT NULL,
            Notes TEXT DEFAULT NULL,
            Year INT NOT NULL,
            Month INT NOT NULL,
            PatrolType VARCHAR(20) DEFAULT 'normal',
            CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_emp_year (EmployeeID, Year)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } catch (e) {
        console.warn('Patrol self-checkin schema initialization:', e.message);
    }
    for (const sql of [
        'ALTER TABLE Patrol_Attendance ADD COLUMN Notes TEXT DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN Area VARCHAR(200) DEFAULT NULL',
        'ALTER TABLE Master_Positions ADD COLUMN PatrolPassPct INT DEFAULT 80',
        'ALTER TABLE Patrol_Attendance ADD COLUMN PatrolType VARCHAR(20) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD COLUMN CheckinAt DATETIME DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD INDEX idx_patrol_attendance_session (ScheduledSessionID)',
        'ALTER TABLE Patrol_Attendance ADD COLUMN IdempotencyKey VARCHAR(80) DEFAULT NULL',
        'ALTER TABLE Patrol_Attendance ADD UNIQUE INDEX uq_patrol_attendance_user_request (UserID, IdempotencyKey)',
        'ALTER TABLE Patrol_Attendance ADD UNIQUE INDEX uq_patrol_attendance_user_session (UserID, ScheduledSessionID)',
        'ALTER TABLE Patrol_Team_Members ADD UNIQUE INDEX uq_patrol_team_members_employee (EmployeeID)',
        'ALTER TABLE Patrol_Self_Checkin ADD COLUMN RecordedBy VARCHAR(50) DEFAULT NULL',
        "ALTER TABLE Patrol_Self_Checkin ADD COLUMN PatrolType VARCHAR(20) DEFAULT 'normal'",
        'ALTER TABLE Patrol_Self_Checkin ADD COLUMN ScheduledSessionID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Self_Checkin ADD INDEX idx_patrol_self_checkin_session (ScheduledSessionID)',
        'ALTER TABLE Patrol_Issues ADD COLUMN ReporterID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN OpenedByID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN OpenedAt DATETIME DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN TemporaryByID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN TemporaryAt DATETIME DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN ClosedByID VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN ClosedAt DATETIME DEFAULT NULL',
        "ALTER TABLE Patrol_Issues ADD COLUMN CloseApprovalStatus VARCHAR(30) NOT NULL DEFAULT 'None'",
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseRequestedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseRequestedAt DATETIME DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseApprovedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseApprovedAt DATETIME DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseRejectedBy VARCHAR(50) DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseRejectedAt DATETIME DEFAULT NULL',
        'ALTER TABLE Patrol_Issues ADD COLUMN CloseRejectReason TEXT DEFAULT NULL',
        'ALTER TABLE Employees ADD COLUMN CompanyEmail VARCHAR(150) DEFAULT NULL',
        // Ensure PatrolType in Team_Members is VARCHAR (not ENUM) to support 'committee'
        'ALTER TABLE Patrol_Team_Members MODIFY COLUMN PatrolType VARCHAR(20) NOT NULL',
        // Per-round area assignment (0=legacy both rounds, 1=round1, 2=round2)
        'ALTER TABLE Patrol_Team_Rotation ADD COLUMN IF NOT EXISTS PatrolRound TINYINT NOT NULL DEFAULT 0',
        // Allow AreaID=NULL so we can store "explicit no-patrol" sentinel (PatrolRound=0, AreaID=NULL)
        'ALTER TABLE Patrol_Team_Rotation MODIFY COLUMN AreaID INT DEFAULT NULL',
    ]) { try { await db.query(sql); } catch (_) {} }
    try {
        await db.query("INSERT INTO App_Settings (key_name,value) VALUES ('patrol_checkin_v2_enabled','0') ON DUPLICATE KEY UPDATE value=value");
    } catch (_) {}

    // Note: imported MySQL-compatible schemas may not allow changing this AUTO_INCREMENT safely.
    // IDs are generated in application code using MAX(SessionID)+1 within transactions.

    // Auto-create Patrol_Roster table (admin-managed roster for Top Management & Supervisor overview)
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_Roster (
                id INT AUTO_INCREMENT PRIMARY KEY,
                EmployeeID VARCHAR(50) NOT NULL,
                RosterGroup VARCHAR(20) NOT NULL,
                TargetPerYear INT NOT NULL DEFAULT 12,
                SortOrder INT DEFAULT 99,
                CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_emp_group (EmployeeID, RosterGroup)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (_) {}

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_EmailOutbox (
                id INT AUTO_INCREMENT PRIMARY KEY,
                AttendanceID INT DEFAULT NULL,
                EmployeeID VARCHAR(50) DEFAULT NULL,
                EventType VARCHAR(50) NOT NULL DEFAULT 'CheckInRecorded',
                Recipients TEXT NOT NULL,
                Subject VARCHAR(255) NOT NULL,
                Body MEDIUMTEXT,
                HtmlBody MEDIUMTEXT,
                Status VARCHAR(30) NOT NULL DEFAULT 'Queued',
                Error TEXT,
                SentAt DATETIME DEFAULT NULL,
                CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_attendance (AttendanceID),
                KEY idx_employee (EmployeeID),
                KEY idx_status (Status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await db.query('ALTER TABLE Patrol_EmailOutbox ADD COLUMN HtmlBody MEDIUMTEXT AFTER Body').catch(() => {});
    } catch (_) {}

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_Leave_Requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                EmployeeID VARCHAR(50) NOT NULL,
                RosterGroup VARCHAR(30) NOT NULL,
                ScheduledSessionID VARCHAR(80) NOT NULL,
                ScheduledDate DATE NOT NULL,
                LeaveType VARCHAR(80) DEFAULT NULL,
                Destination VARCHAR(255) DEFAULT NULL,
                Reason TEXT NOT NULL,
                AttachmentUrl TEXT DEFAULT NULL,
                Status VARCHAR(30) NOT NULL DEFAULT 'Approved',
                CreatedBy VARCHAR(50) DEFAULT NULL,
                CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ReviewedBy VARCHAR(50) DEFAULT NULL,
                ReviewNote TEXT DEFAULT NULL,
                ReviewedAt DATETIME DEFAULT NULL,
                UNIQUE KEY uq_patrol_leave_session (EmployeeID, RosterGroup, ScheduledSessionID),
                KEY idx_employee_year (EmployeeID, ScheduledDate),
                KEY idx_status (Status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        await db.query('ALTER TABLE Patrol_Leave_Requests ADD COLUMN ReviewNote TEXT DEFAULT NULL AFTER ReviewedBy').catch(() => {});
    } catch (_) {}

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_RankA_Hotspot_Positions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                AreaName VARCHAR(150) NOT NULL,
                DisplayName VARCHAR(150) DEFAULT NULL,
                MapXPercent DECIMAL(7,3) NOT NULL,
                MapYPercent DECIMAL(7,3) NOT NULL,
                IsPinned TINYINT(1) NOT NULL DEFAULT 1,
                UpdatedBy VARCHAR(100) DEFAULT NULL,
                UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_patrol_rank_a_hotspot_area (AreaName)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (_) {}

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_RankA_Hotspot_Issue_Positions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                IssueID BIGINT NOT NULL,
                MapXPercent DECIMAL(7,3) NOT NULL,
                MapYPercent DECIMAL(7,3) NOT NULL,
                UpdatedBy VARCHAR(100) DEFAULT NULL,
                UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_patrol_rank_a_hotspot_issue (IssueID)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (_) {}

    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS Patrol_Issue_Events (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                IssueID BIGINT NOT NULL,
                EventType VARCHAR(60) NOT NULL,
                ActorID VARCHAR(50) DEFAULT NULL,
                ActorName VARCHAR(255) DEFAULT NULL,
                ActorRole VARCHAR(80) DEFAULT NULL,
                FromStatus VARCHAR(40) DEFAULT NULL,
                ToStatus VARCHAR(40) DEFAULT NULL,
                Comment TEXT DEFAULT NULL,
                BeforeImage TEXT DEFAULT NULL,
                TempImage TEXT DEFAULT NULL,
                AfterImage TEXT DEFAULT NULL,
                Metadata MEDIUMTEXT DEFAULT NULL,
                CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                KEY idx_issue_created (IssueID, CreatedAt),
                KEY idx_event_type (EventType),
                KEY idx_actor (ActorID)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
    } catch (_) {}

    // Migrate unique key to include PatrolRound (drop old key, add new one)
    try {
        const [idxRows] = await db.query(`
            SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Patrol_Team_Rotation'
            AND NON_UNIQUE = 0 AND INDEX_NAME != 'PRIMARY' AND INDEX_NAME != 'uq_team_yr_mo_rnd'
        `);
        for (const { INDEX_NAME } of idxRows) {
            try { await db.query(`ALTER TABLE Patrol_Team_Rotation DROP INDEX \`${INDEX_NAME}\``); } catch (_) {}
        }
        await db.query('ALTER TABLE Patrol_Team_Rotation ADD UNIQUE KEY uq_team_yr_mo_rnd (TeamID, Year, Month, PatrolRound)');
    } catch (_) {}
})();

// Uses backend/storage.js local uploads. Image URLs are stored in DB.
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
});

const ISSUE_ACTION_TYPES = ['OPEN', 'TEMP', 'CLOSE', 'UPDATE'];
const SESSION_STATUSES = ['Pending', 'Completed', 'Missed', 'Cancelled'];

function isAdminUser(req) {
    return String(req.user?.role || req.user?.Role || '').toLowerCase() === 'admin';
}

function canReviewPatrolLeave(req) {
    const role = String(req.user?.role || req.user?.Role || '').toLowerCase();
    return isAdminUser(req) || role.includes('safety');
}

async function canViewRosterAttendanceDetail(employeeId, group) {
    if (!['top_management', 'supervisor'].includes(group)) return false;
    const [[row]] = await db.query(
        'SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup=? LIMIT 1',
        [employeeId, group]
    );
    return !!row;
}

function cleanupUploadedIssueFiles(files = {}) {
    Object.values(files).flat().forEach(file => deleteLocalUpload(file?.path));
}

async function normalizeAndValidateIssueClassification(data = {}) {
    const hazardIds = issueStopIds(data.HazardType);
    const departments = [...new Set(issueMultiValues(data.ResponsibleDept))];
    const units = [...new Set(issueMultiValues(data.ResponsibleUnit))];
    if (issueMultiValues(data.HazardType).length !== hazardIds.length) {
        return 'HazardType contains an invalid STOP type.';
    }
    if (departments.length) {
        const [rows] = await db.query('SELECT Name FROM Master_Departments WHERE Name IN (?)', [departments]);
        const valid = new Set(rows.map(row => String(row.Name)));
        if (departments.some(name => !valid.has(name))) return 'ResponsibleDept contains an unknown department.';
    }
    if (units.length) {
        if (!departments.length) return 'ResponsibleUnit requires at least one ResponsibleDept.';
        const [rows] = await db.query(`
            SELECT u.name, d.Name AS Department
            FROM Master_SafetyUnits u
            JOIN Master_Departments d ON d.id = u.department_id
            WHERE u.name IN (?)
        `, [units]);
        const valid = new Set(rows
            .filter(row => departments.includes(String(row.Department)))
            .map(row => String(row.name)));
        if (units.some(name => !valid.has(name))) return 'ResponsibleUnit must belong to a selected ResponsibleDept.';
    }
    data.HazardType = hazardIds.map(id => `STOP ${id}`).join('|');
    data.ResponsibleDept = departments.join('|');
    data.ResponsibleUnit = units.join('|');
    if (data.HazardType.length > 100) return 'Too many STOP types selected.';
    if (data.ResponsibleDept.length > 100) return 'Selected ResponsibleDept values are too long.';
    if (data.ResponsibleUnit.length > 200) return 'Selected ResponsibleUnit values are too long.';
    return null;
}

async function loadPatrolIssueActor(req) {
    const employeeId = String(req.user?.id || req.user?.EmployeeID || '').trim();
    if (!employeeId) return req.user || {};
    const [[employee]] = await db.query(
        'SELECT EmployeeID AS id, Department AS department, Unit AS unit, Role AS role FROM Employees WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    return employee || req.user || {};
}

async function requirePatrolIssueProgressAccess(req, res, issue, files, data = {}) {
    if (isAdminUser(req)) return true;
    const actor = await loadPatrolIssueActor(req);
    if (!canUpdatePatrolIssue(actor, issue)) {
        cleanupUploadedIssueFiles(files);
        res.status(403).json({ success: false, message: 'Closed issues are view-only.' });
        return false;
    }
    if (issue.CurrentStatus === 'Closed') {
        cleanupUploadedIssueFiles(files);
        res.status(403).json({ success: false, message: 'Closed issues are view-only.' });
        return false;
    }
    if (hasInitialIssueFieldChanges(data, issue)) {
        cleanupUploadedIssueFiles(files);
        res.status(403).json({ success: false, message: 'Initial issue details cannot be changed after submission.' });
        return false;
    }
    return true;
}

function blankToNull(value) {
    const text = String(value ?? '').trim();
    return text ? text : null;
}

async function runPatrolIssueTransaction(work) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    } catch (err) {
        try { await connection.rollback(); } catch (_) {}
        throw err;
    } finally {
        connection.release();
    }
}

function issueUpdateStatus(issue = {}, isAdminAction, hasTemp, hasFinal) {
    const current = String(issue.CurrentStatus || '').trim();
    if (isAdminAction) {
        if (hasFinal) return 'Closed';
        if (hasTemp) return 'Temporary';
        return current || 'Open';
    }
    return hasTemp || current === 'Temporary' ? 'Temporary' : (current || 'Open');
}

function validateIssuePayload(data = {}) {
    const actionType = data.ActionType;
    if (!ISSUE_ACTION_TYPES.includes(actionType)) return 'ActionType ไม่ถูกต้อง';
    if (['TEMP', 'CLOSE', 'UPDATE'].includes(actionType) && !data.IssueID) return 'ไม่พบ IssueID';
    if (actionType === 'OPEN') {
        if (!data.DateFound) return 'กรุณาระบุวันที่พบปัญหา';
        if (!data.Area) return 'กรุณาระบุพื้นที่ตรวจ';
        if (!issueMultiValues(data.HazardType).length) return 'กรุณาระบุประเภทอันตราย';
        if (!data.HazardDescription) return 'กรุณาระบุรายละเอียดปัญหา';
    }
    if (actionType === 'TEMP' && !data.TempDescription) return 'กรุณาระบุรายละเอียดการแก้ไขชั่วคราว';
    if (actionType === 'CLOSE') {
        if (!data.ActionDescription) return 'กรุณาระบุรายละเอียดการแก้ไข';
        if (!data.FinishDate) return 'กรุณาระบุวันที่เสร็จสิ้น';
    }
    return null;
}

function patrolIssueAuditMeta(data = {}) {
    return {
        issueId: data.IssueID || null,
        actionType: data.ActionType || null,
        area: data.Area || null,
        responsibleDept: data.ResponsibleDept || null,
        responsibleUnit: data.ResponsibleUnit || null,
        hazardType: data.HazardType || null,
        rank: data.Rank || null,
        currentStatus: data.CurrentStatus || null,
    };
}

function patrolIssueActorMeta(user = {}) {
    return {
        id: String(user.id || user.EmployeeID || user.employeeId || '').trim() || null,
        name: String(user.name || user.EmployeeName || user.employeeName || user.id || '').trim() || null,
        role: String(user.role || user.Role || '').trim() || null,
    };
}

async function recordPatrolIssueEvent({ issueId, eventType, actor, fromStatus = null, toStatus = null, comment = null, images = {}, metadata = {} }) {
    if (!issueId || !eventType) return { recorded: false, reason: 'missing issueId/eventType' };
    const actorMeta = patrolIssueActorMeta(actor);
    try {
        await db.query(
            `INSERT INTO Patrol_Issue_Events
             (IssueID, EventType, ActorID, ActorName, ActorRole, FromStatus, ToStatus, Comment, BeforeImage, TempImage, AfterImage, Metadata)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                issueId,
                eventType,
                actorMeta.id,
                actorMeta.name,
                actorMeta.role,
                fromStatus,
                toStatus,
                comment,
                images.beforeImage || images.BeforeImage || null,
                images.tempImage || images.TempImage || null,
                images.afterImage || images.AfterImage || null,
                Object.keys(metadata || {}).length ? JSON.stringify(metadata) : null,
            ]
        );
        return { recorded: true };
    } catch (err) {
        console.error('[patrol/issue-event] record failed:', err.message);
        return { recorded: false, reason: err.message };
    }
}

function parseYear(value) {
    const year = Number(value);
    const current = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > current + 2) return null;
    return year;
}

function parseMonth(value) {
    const month = Number(value);
    if (!Number.isInteger(month) || month < 1 || month > 12) return null;
    return month;
}

function validateYearMonthInput({ year, month }, { requireMonth = true } = {}) {
    const parsedYear = parseYear(year);
    if (!parsedYear) return { error: 'year ไม่ถูกต้อง' };
    if (!requireMonth) return { year: parsedYear };
    const parsedMonth = parseMonth(month);
    if (!parsedMonth) return { error: 'month ต้องอยู่ระหว่าง 1-12' };
    return { year: parsedYear, month: parsedMonth };
}

function parseDateInput(value) {
    const raw = String(value ?? '').trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const normalized = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return normalized === match[0] ? normalized : null;
}

function sendPatrolError(res, err, fallback = 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง', statusCode = 500) {
    console.error('[patrol]', err?.message || err);
    return res.status(err?.statusCode || statusCode).json({
        success: false,
        ...(err?.code ? { code: err.code } : {}),
        message: err?.statusCode ? err.message : fallback,
        ...(err?.data ? { data: err.data } : {}),
    });
}

const PATROL_FLEXIBLE_MONTHLY_REQUIREMENT_KEY = 'patrol_flexible_monthly_requirement';
const PATROL_FLEXIBLE_MONTHLY_REQUIREMENT_DEFAULT = 2;

function normalizePatrolFlexibleMonthlyRequirement(value) {
    let raw = value;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                raw = parsed.monthlyRequirement ?? parsed.value ?? trimmed;
            } catch {
                raw = trimmed;
            }
        } else {
            raw = trimmed;
        }
    }
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return PATROL_FLEXIBLE_MONTHLY_REQUIREMENT_DEFAULT;
    return Math.max(1, Math.min(10, n));
}

async function getPatrolFlexibleMonthlyRequirement() {
    try {
        const [rows] = await db.query(
            'SELECT value FROM App_Settings WHERE key_name = ? LIMIT 1',
            [PATROL_FLEXIBLE_MONTHLY_REQUIREMENT_KEY]
        );
        return {
            monthlyRequirement: normalizePatrolFlexibleMonthlyRequirement(rows[0]?.value),
            targetSource: rows.length ? 'app_settings' : 'flexible_default',
        };
    } catch {
        return {
            monthlyRequirement: PATROL_FLEXIBLE_MONTHLY_REQUIREMENT_DEFAULT,
            targetSource: 'flexible_default',
        };
    }
}

async function patrolCheckinV2Enabled() {
    try {
        const [[row]] = await db.query(
            "SELECT value FROM App_Settings WHERE key_name='patrol_checkin_v2_enabled' LIMIT 1"
        );
        return String(row?.value || '0') === '1';
    } catch {
        return false;
    }
}

function patrolIdempotencyKey(value) {
    const key = String(value || '').trim();
    return /^[A-Za-z0-9][A-Za-z0-9:_-]{15,79}$/.test(key) ? key : null;
}

function patrolTodayBangkok() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function patrolBangkokDateTime() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function patrolActualActivityKind(record = {}, sessionMap = new Map()) {
    const sid = String(record.ScheduledSessionID || '').trim();
    if (!sid) return record.IsV2Request ? 'extra' : 'scheduledNormal';
    const session = sessionMap.get(sid);
    const actualDate = dateOnly(record.PatrolDate);
    const scheduledDate = session ? dateOnly(session.PatrolDate) : '';
    return String(record.PatrolType || '').toLowerCase() === 'compensation'
        || (scheduledDate && actualDate !== scheduledDate) ? 'makeup' : 'scheduledNormal';
}

function patrolActualActivity(records = [], sessionMap = new Map()) {
    const summary = { total: 0, scheduledNormal: 0, makeup: 0, extra: 0 };
    for (const record of records) {
        summary.total++;
        summary[patrolActualActivityKind(record, sessionMap)]++;
    }
    return summary;
}

// ==========================================
// PART 1: Schedule & Stats
// ==========================================

// GET /api/patrol/my-monthly-plan?year=Y&month=M — personal plan for logged-in user
router.get('/my-monthly-plan', async (req, res) => {
    const { year, month } = req.query;
    const employeeId = req.user.id;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        // 1. Base team membership
        const base = await patrolBaseMembership(employeeId);

        if (!base) return res.json({ success: true, data: null }); // ไม่ได้อยู่ในทีม

        // 2. Effective team override this month
        const [[override]] = await db.query(`
            SELECT mr.TeamID, t.Name AS TeamName, t.PatrolGroup, t.Color
            FROM   Patrol_Member_Rotation mr
            JOIN   Patrol_Teams t ON t.id = mr.TeamID
            WHERE  mr.EmployeeID = ? AND mr.Year = ? AND mr.Month = ?
        `, [employeeId, ym.year, ym.month]);

        const team = override
            ? { id: override.TeamID, name: override.TeamName, group: override.PatrolGroup, color: override.Color }
            : { id: base.TeamID,     name: base.TeamName,     group: base.PatrolGroup,     color: base.Color };

        const personalSchedule = await buildPersonalMonthlySchedule(employeeId, ym.year, ym.month);
        const checkinV2Enabled = await patrolCheckinV2Enabled();
        const sessions = personalSchedule.items;
        const required = personalSchedule.items;
        const attendance = personalSchedule.attendance;

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
        `, [ym.year, ym.month, team.id]);

        // Normalize attendance dates to YYYY-MM-DD for reliable matching
        const attendanceDates = attendance.map(a => {
            const d = new Date(a.PatrolDate);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        });

        res.json({
            success: true,
            data: {
                patrolType: base.PatrolType,
                team,
                sessions,
                required,
                attended: personalSchedule.completed,
                attendanceDates,
                actualActivity: personalSchedule.actualActivity,
                activityRecords: personalSchedule.activityRecords,
                features: { checkinV2Enabled },
                roster,
                compliance: {
                    required: personalSchedule.required,
                    attended: personalSchedule.completed,
                    done: personalSchedule.completed >= personalSchedule.required,
                },
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/my-yearly-stats?year=Y — yearly patrol stats for logged-in user
router.get('/my-yearly-stats', async (req, res) => {
    const parsedYear = req.query.year ? parseYear(req.query.year) : new Date().getFullYear();
    if (!parsedYear) return res.status(400).json({ success: false, message: 'year ไม่ถูกต้อง' });
    const year       = parsedYear;
    const employeeId = req.user.id;
    try {
        // 1. Yearly attendance count
        const [[yearStats]] = await db.query(
            `SELECT COUNT(*) AS yearlyCount FROM Patrol_Attendance
             WHERE UserID = ? AND YEAR(PatrolDate) = ?`,
            [employeeId, year]
        );

        // 2. Yearly target from Patrol_Roster (either group)
        const [[rosterRow]] = await db.query(
            `SELECT TargetPerYear, RosterGroup FROM Patrol_Roster WHERE EmployeeID = ? LIMIT 1`,
            [employeeId]
        );

        // 3. Recent check-ins (last 6)
        const [recentCheckins] = await db.query(
            `SELECT PatrolDate, CheckinAt, PatrolType, Area, Notes FROM Patrol_Attendance
             WHERE UserID = ?
             ORDER BY PatrolDate DESC, id DESC LIMIT 6`,
            [employeeId]
        );

        // 4. Team rank this year (among team members by yearly attendance)
        const [[teamBase]] = await db.query(
            `SELECT tm.TeamID FROM Patrol_Team_Members tm WHERE tm.EmployeeID = ? LIMIT 1`,
            [employeeId]
        );

        let teamRank = null;
        let teamMemberStats = [];
        if (teamBase) {
            const [teamMembers] = await db.query(
                `SELECT tm.EmployeeID, e.Position,
                        (SELECT COUNT(*) FROM Patrol_Attendance pa
                         WHERE pa.UserID = tm.EmployeeID AND YEAR(pa.PatrolDate) = ?) AS cnt
                 FROM Patrol_Team_Members tm
                 JOIN Employees e ON e.EmployeeID = tm.EmployeeID
                 WHERE tm.TeamID = ?
                 ORDER BY cnt DESC`,
                [year, teamBase.TeamID]
            );
            const myIdx = teamMembers.findIndex(m => m.EmployeeID === employeeId);
            if (myIdx !== -1) {
                teamRank = { rank: myIdx + 1, total: teamMembers.length };
            }
            teamMemberStats = teamMembers.map(m => ({ EmployeeID: m.EmployeeID, position: m.Position, yearlyCount: m.cnt }));
        }

        // 5. Self-patrol yearly count (supervisor)
        const [[spYear]] = await db.query(
            `SELECT COUNT(*) AS spCount FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?`,
            [employeeId, year]
        );

        // 6. Monthly required count this month (for per-member compliance context)
        const curMonth = new Date().getMonth() + 1;
        const [[monthlyRequired]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM Patrol_Sessions s
             JOIN Patrol_Team_Members tm ON tm.TeamID = s.TeamID AND tm.EmployeeID = ?
             WHERE YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ? AND s.PatrolRound = 2`,
            [employeeId, year, curMonth]
        );

        // 7. Monthly actual-walk breakdown. The actual walk month is the visual
        // authority, while the linked session month remains the compliance source.
        const [monthlyActivity] = await db.query(
            `SELECT MONTH(pa.PatrolDate) AS month,
                    SUM(CASE WHEN pa.ScheduledSessionID IS NOT NULL
                                  AND (LOWER(COALESCE(pa.PatrolType,'')) = 'compensation' OR DATE(pa.PatrolDate) <> DATE(ps.PatrolDate))
                             THEN 1 ELSE 0 END) AS makeup,
                    SUM(CASE WHEN pa.ScheduledSessionID IS NULL AND pa.IdempotencyKey IS NOT NULL THEN 1 ELSE 0 END) AS extra,
                    SUM(CASE WHEN (pa.ScheduledSessionID IS NOT NULL
                                      AND NOT (LOWER(COALESCE(pa.PatrolType,'')) = 'compensation' OR DATE(pa.PatrolDate) <> DATE(ps.PatrolDate)))
                                   OR (pa.ScheduledSessionID IS NULL AND pa.IdempotencyKey IS NULL)
                             THEN 1 ELSE 0 END) AS scheduledNormal,
                    COUNT(*) AS cnt
             FROM Patrol_Attendance pa
             LEFT JOIN Patrol_Sessions ps ON ps.SessionID = pa.ScheduledSessionID
             WHERE pa.UserID = ? AND YEAR(pa.PatrolDate) = ?
             GROUP BY MONTH(pa.PatrolDate)`,
            [employeeId, year]
        );

        const [monthlyCompletedBySchedule] = await db.query(
            `SELECT MONTH(ps.PatrolDate) AS month, COUNT(pa.id) AS cnt
             FROM Patrol_Attendance pa
             JOIN Patrol_Sessions ps ON ps.SessionID = pa.ScheduledSessionID
             WHERE pa.UserID = ? AND YEAR(ps.PatrolDate) = ?
             GROUP BY MONTH(ps.PatrolDate)`,
            [employeeId, year]
        );

        // 8. Monthly scheduled sessions for user's team
        let monthlySched = [];
        if (teamBase) {
            const [ms] = await db.query(
                `SELECT MONTH(s.PatrolDate) AS month, COUNT(*) AS cnt
                 FROM Patrol_Sessions s
                 JOIN Patrol_Team_Members tm ON tm.TeamID = s.TeamID AND tm.EmployeeID = ?
                 WHERE YEAR(s.PatrolDate) = ?
                 GROUP BY MONTH(s.PatrolDate)`,
                [employeeId, year]
            );
            monthlySched = ms;
        }

        const monthlyActivityMap = {};
        const monthlyCompletedMap = {};
        const monthlySchedMap = {};
        monthlyActivity.forEach(r => { monthlyActivityMap[r.month] = r; });
        monthlyCompletedBySchedule.forEach(r => { monthlyCompletedMap[r.month] = parseInt(r.cnt); });
        monthlySched.forEach(r => { monthlySchedMap[r.month] = parseInt(r.cnt); });
        const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const activity = monthlyActivityMap[month] || {};
            const scheduled = monthlySchedMap[month] || 0;
            return {
                month,
                attended: Number(activity.cnt || 0),
                scheduled,
                scheduledNormal: Number(activity.scheduledNormal || 0),
                makeup: Number(activity.makeup || 0),
                extra: Number(activity.extra || 0),
                missed: Math.max(0, scheduled - Number(monthlyCompletedMap[month] || 0)),
            };
        });

        res.json({
            success: true,
            data: {
                year,
                yearlyCount:  yearStats.yearlyCount,
                yearlyTarget: rosterRow?.TargetPerYear || null,
                recentCheckins,
                teamRank,
                teamMemberStats,
                monthlyRequired: monthlyRequired?.cnt ?? null,
                selfPatrolYear: { count: spYear.spCount },
                monthlyBreakdown,
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/position-thresholds — ดึงรายการตำแหน่งพร้อม PatrolPassPct
router.get('/position-thresholds', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, Name, COALESCE(PatrolPassPct, 80) AS PatrolPassPct FROM Master_Positions ORDER BY Name ASC'
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/position-thresholds/:positionId — อัปเดตเกณฑ์ผ่าน (Admin)
router.put('/position-thresholds/:positionId', isAdmin, async (req, res) => {
    const pct = parseInt(req.body.PatrolPassPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ success: false, message: 'ค่าต้องอยู่ระหว่าง 0–100' });
    }
    try {
        await db.query('UPDATE Master_Positions SET PatrolPassPct = ? WHERE id = ?', [pct, req.params.positionId]);
        res.json({ success: true, message: 'บันทึกเกณฑ์สำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/day-detail?date=YYYY-MM-DD — รายละเอียดการเดินตรวจในวันที่ระบุ
router.get('/day-detail', async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่' });
    try {
        const [sessions] = await db.query(`
            SELECT s.SessionID AS id, s.PatrolRound, s.Status,
                   t.id AS TeamID, t.Name AS TeamName, t.Color AS TeamColor,
                   a.Name AS AreaName, a.Code AS AreaCode,
                   (SELECT COUNT(*) FROM Patrol_Team_Members WHERE TeamID = s.TeamID) AS MemberCount,
                   (SELECT COUNT(DISTINCT pa.UserID)
                    FROM Patrol_Attendance pa
                    WHERE DATE(pa.PatrolDate) = ? AND pa.TeamName = t.Name) AS AttendedCount
            FROM Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE DATE(s.PatrolDate) = ?
            ORDER BY s.PatrolRound ASC, t.Name ASC
        `, [date, date]);

        const totalExpected = sessions.reduce((sum, s) => sum + (s.MemberCount || 0), 0);
        const totalAttended = sessions.reduce((sum, s) => sum + (s.AttendedCount || 0), 0);

        res.json({
            success: true,
            data: {
                date,
                sessions,
                totalExpected,
                totalAttended,
                overallPct: totalExpected > 0 ? Math.round((totalAttended / totalExpected) * 100) : 0,
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.get('/my-schedule', async (req, res) => {
    const ym = validateYearMonthInput({ year: req.query.year, month: req.query.month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        const schedule = await buildPersonalMonthlySchedule(req.user.id, ym.year, ym.month);
        res.json(schedule.items);
    } catch (error) {
        sendPatrolError(res, error, 'ไม่สามารถดึงตาราง Patrol ได้');
    }
});

// FIX: was returning hardcoded mock data — now queries real DB
router.get('/attendance-stats', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                UserName AS Name,
                COUNT(*) AS Total,
                MAX(PatrolDate) AS LastWalk,
                MAX(CheckinAt) AS LastCheckinAt,
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
        sendPatrolError(res, error, 'ไม่สามารถดึงสถิติการเข้างานได้');
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

    const [hazardRows] = await db.query(`
        SELECT HazardType
        FROM Patrol_Issues
    `).catch(e => { console.error('dashboard-stats hazardRows:', e.message); return [[]]; });
    const hazardMap = new Map();
    (hazardRows || []).forEach(row => {
        const values = issueMultiValues(row.HazardType);
        (values.length ? values : ['Unspecified']).forEach(value => hazardMap.set(value, (hazardMap.get(value) || 0) + 1));
    });
    const byRank = [...hazardMap.entries()]
        .map(([HazardRank, Count]) => ({ HazardRank, Count }))
        .sort((a, b) => b.Count - a.Count);

    res.json({ bySection: bySection || [], byRank: byRank || [] });
});

router.get('/email-outbox', isAdmin, async (req, res) => {
    try {
        const status = String(req.query.status || '').trim();
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
        const params = [];
        let sql = 'SELECT id,AttendanceID,EmployeeID,EventType,Recipients,Subject,Status,Error,SentAt,CreatedAt FROM Patrol_EmailOutbox';
        if (status) {
            sql += ' WHERE Status=?';
            params.push(status);
        }
        sql += ` ORDER BY id DESC LIMIT ${limit}`;
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err, 'Cannot load Patrol email outbox.');
    }
});

router.post('/email-outbox/retry-queued', isAdmin, async (req, res) => {
    if (!smtpConfigured()) return res.status(400).json({ success: false, message: 'SMTP is not configured.' });
    const limit = Math.max(1, Math.min(100, Number(req.body?.limit || 20)));
    try {
        const [rows] = await db.query(
            `SELECT * FROM Patrol_EmailOutbox
             WHERE Status IN ('Queued','Failed')
             ORDER BY id ASC
             LIMIT ${limit}`
        );
        let sent = 0;
        let failed = 0;
        for (const item of rows) {
            try {
                await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
                await db.query(`UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [item.id]);
                sent++;
            } catch (error) {
                await db.query(`UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [error.message, item.id]).catch(() => {});
                failed++;
            }
        }
        res.json({ success: true, processed: rows.length, sent, failed });
    } catch (err) {
        sendPatrolError(res, err, 'Cannot retry Patrol email queue.');
    }
});

router.post('/email-outbox/:id/retry', isAdmin, async (req, res) => {
    try {
        const [[item]] = await db.query('SELECT * FROM Patrol_EmailOutbox WHERE id=? LIMIT 1', [req.params.id]);
        if (!item) return res.status(404).json({ success: false, message: 'Not found.' });
        await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
        await db.query(`UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [req.params.id]);
        res.json({ success: true, message: 'Email sent.' });
    } catch (err) {
        await db.query(`UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [err.message, req.params.id]).catch(() => {});
        res.status(500).json({ success: false, message: 'Email send failed.', error: err.message });
    }
});

// ==========================================
// PART 2: Check-in
// ==========================================

router.post('/checkin', async (req, res) => {
    try {
        // ดึงข้อมูลผู้ใช้จาก JWT (req.user) ไม่รับจาก req.body เพื่อป้องกันการปลอมแปลง
        const UserID   = req.user.id;
        const [[employee]] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Position,e.CompanyEmail
             FROM Employees e WHERE e.EmployeeID=? LIMIT 1`,
            [UserID]
        );
        const UserName = employee?.EmployeeName || req.user.name || UserID;
        const Notes     = req.body.Notes?.trim() || null;
        let Area      = req.body.Area?.trim()  || null;
        const checkinV2Enabled = await patrolCheckinV2Enabled();
        const ALLOWED_PATROL_TYPES = ['normal', 'compensation'];
        let PatrolType = ALLOWED_PATROL_TYPES.includes(req.body.PatrolType || 'normal') ? (req.body.PatrolType || 'normal') : null;
        if (!PatrolType) {
            return res.status(400).json({ success: false, message: 'Self check-in supports only normal or compensation patrol.' });
        }
        const requestedMode = String(req.body.CheckinMode || '').trim().toLowerCase();
        const mode = checkinV2Enabled
            ? (requestedMode || (PatrolType === 'compensation' ? 'makeup' : (req.body.ScheduledSessionID ? 'scheduled' : 'extra')))
            : (PatrolType === 'compensation' ? 'makeup' : (req.body.ScheduledSessionID ? 'scheduled' : 'extra'));
        if (!['scheduled', 'makeup', 'extra'].includes(mode)) {
            return res.status(400).json({ success: false, message: 'CheckinMode must be scheduled, makeup or extra.' });
        }
        PatrolType = mode === 'makeup' ? 'compensation' : 'normal';
        if (mode === 'makeup' && !String(req.body.ScheduledSessionID || '').trim()) {
            return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for makeup patrol.' });
        }
        if (checkinV2Enabled && mode === 'extra' && String(req.body.ScheduledSessionID || '').trim()) {
            return res.status(400).json({ success: false, message: 'Extra patrol must not be linked to a scheduled round.' });
        }
        // PatrolDate: user may supply an explicit date for compensation patrol (same year only)
        let patrolDate = null;
        if (req.body.PatrolDate) {
            const d = new Date(req.body.PatrolDate);
            if (!isNaN(d.getTime())) patrolDate = d.toISOString().split('T')[0];
        }
        const effectiveDate = checkinV2Enabled ? patrolTodayBangkok() : (patrolDate || new Date().toISOString().split('T')[0]);
        const checkinAt = patrolBangkokDateTime();
        const idempotencyRaw = String(req.body.IdempotencyKey || '').trim();
        const idempotencyKey = idempotencyRaw ? patrolIdempotencyKey(idempotencyRaw) : null;
        if (idempotencyRaw && !idempotencyKey) {
            return res.status(400).json({ success: false, message: 'IdempotencyKey is invalid.' });
        }
        if (checkinV2Enabled && idempotencyKey) {
            const [[existingRequest]] = await db.query(
                `SELECT id,UserID,UserName,TeamName,PatrolDate,CheckinAt,PatrolType,Area,Notes,ScheduledSessionID
                   FROM Patrol_Attendance WHERE UserID=? AND IdempotencyKey=? LIMIT 1`,
                [UserID, idempotencyKey]
            );
            if (existingRequest) {
                return res.json({
                    success: true,
                    message: 'Check-in was already saved.',
                    data: {
                        idempotentReplay: true,
                        checkin: {
                            id: Number(existingRequest.id), employeeId: UserID, employeeName: existingRequest.UserName,
                            type: existingRequest.PatrolType, mode,
                            actualDate: dateOnly(existingRequest.PatrolDate), checkinAt: existingRequest.CheckinAt || null,
                            scheduledSessionId: existingRequest.ScheduledSessionID || null,
                            area: existingRequest.Area || null, teamName: existingRequest.TeamName || '',
                        },
                    },
                });
            }
        }

        // ป้องกัน check-in ซ้ำในวันเดียวกัน (ยกเว้น compensation ที่ใช้วันอื่น)
        const [[dupCheck]] = checkinV2Enabled ? [[null]] : await db.query(
            `SELECT id FROM Patrol_Attendance
             WHERE UserID = ? AND DATE(PatrolDate) = ? AND PatrolType = ?
             LIMIT 1`,
            [UserID, effectiveDate, PatrolType]
        );
        if (dupCheck) {
            return res.status(409).json({ success: false, message: 'คุณได้เช็คอินประเภทนี้ในวันนี้แล้ว' });
        }

        const currentWeek = getWeekNumber(new Date(`${effectiveDate}T12:00:00`));
        const { session } = mode === 'extra'
            ? { session: null }
            : await resolveTopScheduledSession(UserID, effectiveDate, req.body.ScheduledSessionID, { checkinV2Enabled, mode });
        if (checkinV2Enabled && mode === 'scheduled' && !session) {
            return res.status(409).json({ success: false, code: 'PATROL_SCHEDULE_NOT_FOUND', message: 'No scheduled Patrol round is assigned to this user today.' });
        }
        const effectiveTeam = await patrolEffectiveTeam(UserID, Number(effectiveDate.slice(0, 4)), Number(effectiveDate.slice(5, 7)));
        const TeamName = effectiveTeam?.TeamName || req.user.team || '';
        if (!Area && session) Area = session.AreaName || session.AreaCode || null;
        let insert;
        try {
            [insert] = await db.query(
                'INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, Notes, Area, PatrolType, PatrolDate, CheckinAt, RecordedBy, ScheduledSessionID, IdempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [UserID, UserName, TeamName, currentWeek, Notes, Area, PatrolType, effectiveDate, checkinAt, UserID, session?.id || null, idempotencyKey]
            );
        } catch (err) {
            if (checkinV2Enabled && idempotencyKey && err.code === 'ER_DUP_ENTRY') {
                const [[replayed]] = await db.query(
                    `SELECT id,UserName,TeamName,PatrolDate,CheckinAt,PatrolType,Area,ScheduledSessionID
                       FROM Patrol_Attendance WHERE UserID=? AND IdempotencyKey=? LIMIT 1`,
                    [UserID, idempotencyKey]
                );
                if (replayed) {
                    return res.json({
                        success: true,
                        message: 'Check-in was already saved.',
                        data: {
                            idempotentReplay: true,
                            checkin: {
                                id: Number(replayed.id), employeeId: UserID, employeeName: replayed.UserName,
                                type: replayed.PatrolType, mode, actualDate: dateOnly(replayed.PatrolDate), checkinAt: replayed.CheckinAt || null,
                                scheduledSessionId: replayed.ScheduledSessionID || null, area: replayed.Area || null,
                                teamName: replayed.TeamName || '',
                            },
                        },
                    });
                }
            }
            if (session?.id && err.code === 'ER_DUP_ENTRY') {
                const [[completedSession]] = await db.query(
                    'SELECT id FROM Patrol_Attendance WHERE UserID=? AND ScheduledSessionID=? LIMIT 1',
                    [UserID, session.id]
                );
                if (completedSession) {
                    return res.status(409).json({
                        success: false,
                        code: 'PATROL_SESSION_ALREADY_COMPLETED',
                        message: 'Selected schedule is already completed.',
                        data: { attendanceId:Number(completedSession.id), scheduledSessionId:String(session.id) },
                    });
                }
            }
            throw err;
        }
        const attendanceId = insert.insertId;
        const attendance = { id: attendanceId, UserID, UserName, TeamName, PatrolDate: effectiveDate, PatrolType, Area, Notes, ScheduledSessionID: session?.id || null };
        const email = await queuePatrolCheckinEmail({ attendanceId, employee, attendance, session }).catch(err => ({ queued: false, sent: false, reason: err.message }));

        const [stats] = await db.query(
            'SELECT COUNT(*) AS TotalWalks, MAX(PatrolDate) AS LastWalk, MAX(CheckinAt) AS LastCheckinAt FROM Patrol_Attendance WHERE UserID = ?',
            [UserID]
        );
        const [teamStats] = await db.query(
            'SELECT COUNT(*) AS TeamWalks FROM Patrol_Attendance WHERE TeamName = ?',
            [TeamName]
        );
        const [todayWalkers] = await db.query(
            'SELECT UserName, PatrolDate FROM Patrol_Attendance WHERE DATE(PatrolDate) = ? ORDER BY PatrolDate DESC LIMIT 5',
            [effectiveDate]
        );

        res.json({
            success: true,
            message: 'เช็คอินสำเร็จ!',
            data: {
                totalWalks: stats[0].TotalWalks,
                teamWalks: teamStats[0].TeamWalks || 0,
                todayWalkers,
                checkin: {
                    id: attendanceId,
                    employeeId: UserID,
                    employeeName: UserName,
                    position: employee?.Position || null,
                    department: employee?.Department || null,
                    type: PatrolType,
                    mode,
                    actualDate: effectiveDate,
                    checkinAt: stats[0].LastCheckinAt || null,
                    scheduledDate: session ? dateOnly(session.PatrolDate) : effectiveDate,
                    isMakeup: Boolean(session) && dateOnly(session.PatrolDate) !== effectiveDate,
                    scheduledSessionId: session?.id || null,
                    round: session?.PatrolRound || null,
                    area: Area,
                    teamName: TeamName,
                },
                email,
            },
        });
    } catch (err) {
        console.error(err);
        if (err?.statusCode) {
            return res.status(err.statusCode).json({ success: false, ...(err.code ? { code: err.code } : {}), message: err.message, ...(err.data ? { data: err.data } : {}) });
        }
        res.status(500).json({ success: false, message: 'ไม่สามารถเช็คอินได้' });
    }
});

                                // ==========================================
// PART 3: Issues
// ==========================================

router.get('/rank-a-hotspot-positions', async (_req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, AreaName, DisplayName, MapXPercent, MapYPercent, IsPinned, UpdatedBy, UpdatedAt
            FROM Patrol_RankA_Hotspot_Positions
            ORDER BY AreaName ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot load Patrol Rank A hotspot positions.' });
    }
});

router.put('/rank-a-hotspot-positions', isAdmin, async (req, res) => {
    try {
        const items = Array.isArray(req.body?.positions) ? req.body.positions : [];
        if (!items.length) {
            return res.status(400).json({ success: false, message: 'positions array is required.' });
        }
        for (const item of items) {
            const areaName = String(item.AreaName || item.areaName || '').trim().slice(0, 150);
            const displayName = String(item.DisplayName || item.displayName || areaName).trim().slice(0, 150);
            const x = Number(item.MapXPercent ?? item.mapXPercent ?? item.x);
            const y = Number(item.MapYPercent ?? item.mapYPercent ?? item.y);
            if (!areaName || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
                return res.status(400).json({ success: false, message: 'Invalid hotspot position payload.' });
            }
            await db.query(`
                INSERT INTO Patrol_RankA_Hotspot_Positions
                    (AreaName, DisplayName, MapXPercent, MapYPercent, IsPinned, UpdatedBy)
                VALUES (?, ?, ?, ?, 1, ?)
                ON DUPLICATE KEY UPDATE
                    DisplayName=VALUES(DisplayName),
                    MapXPercent=VALUES(MapXPercent),
                    MapYPercent=VALUES(MapYPercent),
                    IsPinned=1,
                    UpdatedBy=VALUES(UpdatedBy),
                    UpdatedAt=NOW()
            `, [areaName, displayName || areaName, x, y, req.user?.id || req.user?.name || null]);
        }
        const [rows] = await db.query(`
            SELECT id, AreaName, DisplayName, MapXPercent, MapYPercent, IsPinned, UpdatedBy, UpdatedAt
            FROM Patrol_RankA_Hotspot_Positions
            ORDER BY AreaName ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot save Patrol Rank A hotspot positions.' });
    }
});

router.get('/rank-a-hotspot-issue-positions', async (_req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, IssueID, MapXPercent, MapYPercent, UpdatedBy, UpdatedAt
            FROM Patrol_RankA_Hotspot_Issue_Positions
            ORDER BY IssueID ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot load Patrol Rank A issue positions.' });
    }
});

router.put('/rank-a-hotspot-issue-positions', isAdmin, async (req, res) => {
    try {
        const items = Array.isArray(req.body?.positions) ? req.body.positions : [];
        if (!items.length || items.length > 500) {
            return res.status(400).json({ success: false, message: 'positions array with 1-500 items is required.' });
        }
        for (const item of items) {
            const issueId = Number(item.IssueID ?? item.issueId);
            const x = Number(item.MapXPercent ?? item.mapXPercent ?? item.x);
            const y = Number(item.MapYPercent ?? item.mapYPercent ?? item.y);
            if (!Number.isSafeInteger(issueId) || issueId <= 0 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
                return res.status(400).json({ success: false, message: 'Invalid Rank A issue position payload.' });
            }
            const [[issue]] = await db.query(
                'SELECT IssueID FROM Patrol_Issues WHERE IssueID=? AND UPPER(COALESCE(`Rank`, ""))="A" LIMIT 1',
                [issueId]
            );
            if (!issue) {
                return res.status(400).json({ success: false, message: `Rank A Patrol issue #${issueId} was not found.` });
            }
            await db.query(`
                INSERT INTO Patrol_RankA_Hotspot_Issue_Positions
                    (IssueID, MapXPercent, MapYPercent, UpdatedBy)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    MapXPercent=VALUES(MapXPercent),
                    MapYPercent=VALUES(MapYPercent),
                    UpdatedBy=VALUES(UpdatedBy),
                    UpdatedAt=NOW()
            `, [issueId, x, y, req.user?.id || req.user?.name || null]);
        }
        const [rows] = await db.query(`
            SELECT id, IssueID, MapXPercent, MapYPercent, UpdatedBy, UpdatedAt
            FROM Patrol_RankA_Hotspot_Issue_Positions
            ORDER BY IssueID ASC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot save Patrol Rank A issue positions.' });
    }
});

router.get('/issues', async (req, res) => {
    try {
        const [issues] = await db.query(`
            SELECT i.*,
                   e.EmployeeName AS ReporterName,
                   e.CompanyEmail AS ReporterEmail,
                   e.Department AS ReporterDepartment,
                   e.Unit AS ReporterUnit,
                   e.Team AS ReporterTeam,
                   e.Position AS ReporterPosition
            FROM Patrol_Issues i
            LEFT JOIN Employees e ON e.EmployeeID = i.ReporterID
            ORDER BY i.IssueID DESC
        `);
        res.json({ success: true, data: issues });
    } catch (err) {
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลประเด็นได้' });
    }
});

router.get('/issue/:id/events', async (req, res) => {
    try {
        const [events] = await db.query(
            `SELECT id, IssueID, EventType, ActorID, ActorName, ActorRole,
                    FromStatus, ToStatus, Comment, BeforeImage, TempImage, AfterImage,
                    Metadata, CreatedAt
             FROM Patrol_Issue_Events
             WHERE IssueID = ?
             ORDER BY CreatedAt ASC, id ASC`,
            [req.params.id]
        );
        res.json({ success: true, data: events });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Cannot load patrol issue events.' });
    }
});

router.post('/issue/save', upload.fields([
    { name: 'BeforeImage', maxCount: 1 },
    { name: 'TempImage',   maxCount: 1 },
    { name: 'AfterImage',  maxCount: 1 },
]), async (req, res) => {
    const files = req.files || {};
    let issueMutationCommitted = false;
    try {
        const data  = req.body;
        // Store the public upload URL returned by the storage engine.
        const getUrl = (fieldName) => files[fieldName] ? files[fieldName][0].path : null;
        const validationError = validateIssuePayload(data);
        if (validationError) {
            cleanupUploadedIssueFiles(files);
            return res.status(400).json({ success: false, message: validationError });
        }
        if (data.ActionType === 'OPEN' || (data.ActionType === 'UPDATE' && isAdminUser(req))) {
            const classificationError = await normalizeAndValidateIssueClassification(data);
            if (classificationError) {
                cleanupUploadedIssueFiles(files);
                return res.status(400).json({ success: false, message: classificationError });
            }
        }

        let email = null;
        if (data.ActionType === 'OPEN') {
            const [result] = await db.query(
                `INSERT INTO Patrol_Issues
                 (DateFound, FoundByTeam, Area, ResponsibleDept, ResponsibleUnit, HazardType, MachineName, HazardDescription, \`Rank\`, DueDate, BeforeImage, CurrentStatus, ReporterID, OpenedByID, OpenedAt, CloseApprovalStatus)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, NOW(), 'None')`,
                [data.DateFound, data.FoundByTeam, data.Area,
                 data.ResponsibleDept || null, data.ResponsibleUnit || null,
                 data.HazardType, data.MachineName, data.HazardDescription,
                 data.Rank || null, data.DueDate || null, getUrl('BeforeImage'),
                 req.user.id, req.user.id]
            );
            await recordPatrolIssueEvent({
                issueId: result.insertId,
                eventType: 'CREATED',
                actor: req.user,
                toStatus: 'Open',
                comment: data.HazardDescription || null,
                images: { beforeImage: getUrl('BeforeImage') },
                metadata: patrolIssueAuditMeta({ ...data, IssueID: result.insertId, CurrentStatus: 'Open' }),
            });
            email = await queuePatrolIssueEmail({ issueId: result.insertId, eventType: 'IssueCreated', actor: req.user })
                .catch(err => ({ queued: false, sent: false, reason: err.message }));
            await logAudit(req, {
                module: 'patrol',
                action: 'OPEN_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: result.insertId,
                detail: `Open patrol issue: ${data.Area || ''} ${issueMultiDisplay(data.HazardType, '')}`.trim(),
                metadata: patrolIssueAuditMeta({ ...data, IssueID: result.insertId, CurrentStatus: 'Open' }),
            });
        } else if (data.ActionType === 'TEMP') {
            const [[current]] = await db.query('SELECT * FROM Patrol_Issues WHERE IssueID = ?', [data.IssueID]);
            if (!current) {
                cleanupUploadedIssueFiles(files);
                return res.status(404).json({ success: false, message: 'Issue not found.' });
            }
            if (!await requirePatrolIssueProgressAccess(req, res, current, files, data)) return;
            const tempImage = getUrl('TempImage');
            await runPatrolIssueTransaction(connection => connection.query(
                `UPDATE Patrol_Issues
                 SET TempDescription = ?, TempImage = COALESCE(?, TempImage), TempDate = NOW(), TemporaryByID = ?, TemporaryAt = NOW(), CurrentStatus = 'Temporary'
                 WHERE IssueID = ?`,
                [data.TempDescription, tempImage, req.user.id, data.IssueID]
            ));
            issueMutationCommitted = true;
            if (tempImage) deleteLocalUpload(current?.TempImage);
            await recordPatrolIssueEvent({
                issueId: data.IssueID,
                eventType: 'TEMP_UPDATED',
                actor: req.user,
                fromStatus: current.CurrentStatus || null,
                toStatus: 'Temporary',
                comment: data.TempDescription || null,
                images: { tempImage },
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: 'Temporary' }),
            });
            email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'TemporaryUpdated', actor: req.user })
                .catch(err => ({ queued: false, sent: false, reason: err.message }));
            await logAudit(req, {
                module: 'patrol',
                action: 'TEMP_FIX_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: data.IssueID,
                detail: `Temporary fix patrol issue #${data.IssueID}`,
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: 'Temporary' }),
            });
        } else if (data.ActionType === 'CLOSE') {
            /* Legacy admin-only close guard removed in Phase 2.
                cleanupUploadedIssueFiles(files);
                return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้นที่ปิดประเด็นได้' });
            */
            const isAdminAction = isAdminUser(req);
            const [[current]] = await db.query('SELECT * FROM Patrol_Issues WHERE IssueID = ?', [data.IssueID]);
            if (!current) {
                cleanupUploadedIssueFiles(files);
                return res.status(404).json({ success: false, message: 'Issue not found.' });
            }
            const afterImage = getUrl('AfterImage');
            if (!isAdminAction) {
                if (!await requirePatrolIssueProgressAccess(req, res, current, files, data)) return;
                if (String(current.CloseApprovalStatus || '') === 'Pending') {
                    cleanupUploadedIssueFiles(files);
                    return res.status(409).json({ success: false, message: 'This issue already has a pending close request.' });
                }
                const requestStatus = current.CurrentStatus === 'Temporary' ? 'Temporary' : (current.CurrentStatus || 'Open');
                await runPatrolIssueTransaction(connection => connection.query(
                    `UPDATE Patrol_Issues
                     SET ActionDescription = ?, AfterImage = COALESCE(?, AfterImage), FinishDate = ?,
                         CurrentStatus = ?, CloseApprovalStatus = 'Pending',
                         CloseRequestedBy = ?, CloseRequestedAt = NOW(),
                         CloseApprovedBy = NULL, CloseApprovedAt = NULL,
                         CloseRejectedBy = NULL, CloseRejectedAt = NULL, CloseRejectReason = NULL
                     WHERE IssueID = ?`,
                    [data.ActionDescription, afterImage, data.FinishDate, requestStatus, req.user.id, data.IssueID]
                ));
                issueMutationCommitted = true;
                if (afterImage) deleteLocalUpload(current?.AfterImage);
                await recordPatrolIssueEvent({
                    issueId: data.IssueID,
                    eventType: 'CLOSE_REQUESTED',
                    actor: req.user,
                    fromStatus: current.CurrentStatus || null,
                    toStatus: requestStatus,
                    comment: data.ActionDescription || null,
                    images: { afterImage },
                    metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: requestStatus, CloseApprovalStatus: 'Pending' }),
                });
                await logAudit(req, {
                    module: 'patrol',
                    action: 'REQUEST_CLOSE_PATROL_ISSUE',
                    targetType: 'Patrol_Issues',
                    targetId: data.IssueID,
                    detail: `Request close patrol issue #${data.IssueID}`,
                    metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: requestStatus, CloseApprovalStatus: 'Pending' }),
                });
                email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'CloseRequested', actor: req.user })
                    .catch(err => ({ queued: false, sent: false, reason: err.message }));
                return res.json({ success: true, message: 'Close request submitted.', email });
            }
            await db.query(
                `UPDATE Patrol_Issues
                 SET ActionDescription = ?, AfterImage = ?, FinishDate = ?, CurrentStatus = 'Closed',
                     ClosedByID = ?, ClosedAt = NOW(), CloseApprovalStatus = 'Approved',
                     CloseApprovedBy = ?, CloseApprovedAt = NOW()
                 WHERE IssueID = ?`,
                [data.ActionDescription, afterImage, data.FinishDate, req.user.id, req.user.id, data.IssueID]
            );
            if (afterImage) deleteLocalUpload(current?.AfterImage);
            await recordPatrolIssueEvent({
                issueId: data.IssueID,
                eventType: 'CLOSED',
                actor: req.user,
                fromStatus: current?.CurrentStatus || null,
                toStatus: 'Closed',
                comment: data.ActionDescription || null,
                images: { afterImage },
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: 'Closed', CloseApprovalStatus: 'Approved' }),
            });
            email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'IssueClosed', actor: req.user })
                .catch(err => ({ queued: false, sent: false, reason: err.message }));
            await logAudit(req, {
                module: 'patrol',
                action: 'CLOSE_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: data.IssueID,
                detail: `Close patrol issue #${data.IssueID}`,
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: 'Closed' }),
            });
        } else if (data.ActionType === 'UPDATE') {
            // Admin can edit every field and close; regular users can only update progress fields.
            const isAdminAction = isAdminUser(req);
            const hasFinal = !!(data.ActionDescription && data.ActionDescription.trim());
            const hasTemp  = !!(data.TempDescription && data.TempDescription.trim());
            const finishDate = blankToNull(data.FinishDate);
            const newTempImage  = getUrl('TempImage');
            const newAfterImage = getUrl('AfterImage');
            const [[current]] = await db.query('SELECT * FROM Patrol_Issues WHERE IssueID = ?', [data.IssueID]);
            if (!current) {
                cleanupUploadedIssueFiles(files);
                return res.status(404).json({ success: false, message: 'Issue not found.' });
            }
            if (!isAdminAction && !await requirePatrolIssueProgressAccess(req, res, current, files, data)) return;
            const newStatus = issueUpdateStatus(current, isAdminAction, hasTemp, hasFinal);
            if (!isAdminAction) {
                if (hasFinal && String(current.CloseApprovalStatus || '') === 'Pending') {
                    cleanupUploadedIssueFiles(files);
                    return res.status(409).json({ success: false, message: 'This issue already has a pending close request.' });
                }
                await runPatrolIssueTransaction(async connection => {
                    await connection.query(
                    `UPDATE Patrol_Issues SET
                        TempDescription   = ?,
                        TempImage         = COALESCE(?, TempImage),
                        TempDate          = IF(? IS NOT NULL AND ? != '', NOW(), TempDate),
                        TemporaryByID     = IF(? IS NOT NULL AND ? != '', ?, TemporaryByID),
                        TemporaryAt       = IF(? IS NOT NULL AND ? != '', NOW(), TemporaryAt),
                        ActionDescription = ?,
                        AfterImage        = COALESCE(?, AfterImage),
                        FinishDate        = ?,
                        CurrentStatus     = ?
                     WHERE IssueID = ?`,
                    [
                        blankToNull(data.TempDescription),
                        newTempImage,
                        blankToNull(data.TempDescription),
                        blankToNull(data.TempDescription),
                        blankToNull(data.TempDescription),
                        blankToNull(data.TempDescription),
                        req.user.id,
                        blankToNull(data.TempDescription),
                        blankToNull(data.TempDescription),
                        blankToNull(data.ActionDescription),
                        newAfterImage,
                        finishDate,
                        newStatus,
                        data.IssueID
                    ]
                    );
                if (hasFinal) {
                    await connection.query(
                        `UPDATE Patrol_Issues
                         SET CloseApprovalStatus = 'Pending',
                             CloseRequestedBy = ?, CloseRequestedAt = NOW(),
                             CloseApprovedBy = NULL, CloseApprovedAt = NULL,
                             CloseRejectedBy = NULL, CloseRejectedAt = NULL, CloseRejectReason = NULL
                         WHERE IssueID = ?`,
                        [req.user.id, data.IssueID]
                    );
                }
                });
                issueMutationCommitted = true;
                if (newTempImage) deleteLocalUpload(current?.TempImage);
                if (newAfterImage) deleteLocalUpload(current?.AfterImage);
                if (newStatus === 'Temporary' && current?.CurrentStatus !== 'Temporary') {
                    email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'TemporaryUpdated', actor: req.user })
                        .catch(err => ({ queued: false, sent: false, reason: err.message }));
                }
                await recordPatrolIssueEvent({
                    issueId: data.IssueID,
                    eventType: hasFinal ? 'CLOSE_REQUESTED' : (newStatus === 'Temporary' && current?.CurrentStatus !== 'Temporary' ? 'TEMP_UPDATED' : 'UPDATED'),
                    actor: req.user,
                    fromStatus: current.CurrentStatus || null,
                    toStatus: newStatus,
                    comment: blankToNull(data.TempDescription) || blankToNull(data.ActionDescription),
                    images: { tempImage: newTempImage, afterImage: newAfterImage },
                    metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: newStatus, CloseApprovalStatus: hasFinal ? 'Pending' : current.CloseApprovalStatus }),
                });
                if (hasFinal) {
                    email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'CloseRequested', actor: req.user })
                        .catch(err => ({ queued: false, sent: false, reason: err.message }));
                }
                await logAudit(req, {
                    module: 'patrol',
                    action: hasFinal ? 'REQUEST_CLOSE_PATROL_ISSUE' : 'UPDATE_PATROL_ISSUE_PROGRESS',
                    targetType: 'Patrol_Issues',
                    targetId: data.IssueID,
                    detail: hasFinal ? `Request close patrol issue #${data.IssueID}` : `Update patrol issue progress #${data.IssueID}`,
                    metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: newStatus, CloseApprovalStatus: hasFinal ? 'Pending' : current.CloseApprovalStatus }),
                });
                return res.json({ success: true, message: 'Saved.', email });
            }
            await db.query(
                `UPDATE Patrol_Issues SET
                    Area              = COALESCE(?, Area),
                    ResponsibleDept   = COALESCE(?, ResponsibleDept),
                    ResponsibleUnit   = ?,
                    HazardType        = COALESCE(?, HazardType),
                    MachineName       = ?,
                    HazardDescription = COALESCE(?, HazardDescription),
                    \`Rank\`          = COALESCE(?, \`Rank\`),
                    DueDate           = COALESCE(?, DueDate),
                    TempDescription   = ?,
                    TempImage         = COALESCE(?, TempImage),
                    TempDate          = IF(? IS NOT NULL AND ? != '', NOW(), TempDate),
                    TemporaryByID     = IF(? IS NOT NULL AND ? != '', ?, TemporaryByID),
                    TemporaryAt       = IF(? IS NOT NULL AND ? != '', NOW(), TemporaryAt),
                    ActionDescription = ?,
                    AfterImage        = COALESCE(?, AfterImage),
                    FinishDate        = ?,
                    CurrentStatus     = ?,
                    ClosedByID        = IF(? = 'Closed', ?, ClosedByID),
                    ClosedAt          = IF(? = 'Closed', NOW(), ClosedAt),
                    CloseApprovalStatus = IF(? = 'Closed', 'Approved', CloseApprovalStatus),
                    CloseApprovedBy   = IF(? = 'Closed', ?, CloseApprovedBy),
                    CloseApprovedAt   = IF(? = 'Closed', NOW(), CloseApprovedAt)
                 WHERE IssueID = ?`,
                [
                    data.Area              || null,
                    data.ResponsibleDept   || null,
                    data.ResponsibleUnit   || null,
                    data.HazardType        || null,
                    data.MachineName       || null,
                    data.HazardDescription || null,
                    data.Rank              || null,
                    blankToNull(data.DueDate),
                    blankToNull(data.TempDescription),
                    newTempImage,
                    blankToNull(data.TempDescription),
                    blankToNull(data.TempDescription),
                    blankToNull(data.TempDescription),
                    blankToNull(data.TempDescription),
                    req.user.id,
                    blankToNull(data.TempDescription),
                    blankToNull(data.TempDescription),
                    blankToNull(data.ActionDescription),
                    newAfterImage,
                    finishDate,
                    newStatus,
                    newStatus,
                    req.user.id,
                    newStatus,
                    newStatus,
                    newStatus,
                    req.user.id,
                    newStatus,
                    data.IssueID
                ]
            );
            if (newTempImage) deleteLocalUpload(current?.TempImage);
            if (newAfterImage) deleteLocalUpload(current?.AfterImage);
            if (newStatus === 'Closed' && current?.CurrentStatus !== 'Closed') {
                email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'IssueClosed', actor: req.user })
                    .catch(err => ({ queued: false, sent: false, reason: err.message }));
            } else if (newStatus === 'Temporary' && current?.CurrentStatus !== 'Temporary') {
                email = await queuePatrolIssueEmail({ issueId: data.IssueID, eventType: 'TemporaryUpdated', actor: req.user })
                    .catch(err => ({ queued: false, sent: false, reason: err.message }));
            }
            await recordPatrolIssueEvent({
                issueId: data.IssueID,
                eventType: newStatus === 'Closed' && current?.CurrentStatus !== 'Closed'
                    ? 'CLOSED'
                    : (newStatus === 'Temporary' && current?.CurrentStatus !== 'Temporary' ? 'TEMP_UPDATED' : 'UPDATED'),
                actor: req.user,
                fromStatus: current.CurrentStatus || null,
                toStatus: newStatus,
                comment: blankToNull(data.ActionDescription) || blankToNull(data.TempDescription),
                images: { tempImage: newTempImage, afterImage: newAfterImage },
                metadata: patrolIssueAuditMeta({
                    ...data,
                    CurrentStatus: newStatus,
                    CloseApprovalStatus: newStatus === 'Closed' ? 'Approved' : current.CloseApprovalStatus,
                }),
            });
            await logAudit(req, {
                module: 'patrol',
                action: 'UPDATE_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: data.IssueID,
                detail: `Update patrol issue #${data.IssueID}`,
                metadata: patrolIssueAuditMeta({ ...data, CurrentStatus: newStatus }),
            });
        } else {
            return res.status(400).json({ success: false, message: 'ActionType ไม่ถูกต้อง' });
        }

        res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อย', email });
    } catch (err) {
        console.error(err);
        if (!issueMutationCommitted) cleanupUploadedIssueFiles(files);
        res.status(500).json({ success: false, message: 'ไม่สามารถบันทึกข้อมูลได้' });
    }
});

// DELETE /api/patrol/issue/:id — Admin only
router.post('/issue/:id/close-review', async (req, res) => {
    if (!isAdminUser(req)) {
        return res.status(403).json({ success: false, message: 'Admin access required.' });
    }
    const issueId = req.params.id;
    const action = String(req.body?.action || req.body?.Action || '').trim().toLowerCase();
    const reason = blankToNull(req.body?.reason || req.body?.Reason || req.body?.CloseRejectReason);
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Review action must be approve or reject.' });
    }
    if (action === 'reject' && !reason) {
        return res.status(400).json({ success: false, message: 'Reject reason is required.' });
    }
    try {
        const [[issue]] = await db.query('SELECT * FROM Patrol_Issues WHERE IssueID = ?', [issueId]);
        if (!issue) {
            return res.status(404).json({ success: false, message: 'Issue not found.' });
        }
        const approvalStatus = String(issue.CloseApprovalStatus || '');
        const requestedStatus = action === 'approve' ? 'Approved' : 'Rejected';
        if (approvalStatus === requestedStatus) {
            return res.json({
                success: true,
                message: `Close request was already ${requestedStatus.toLowerCase()}.`,
                status: requestedStatus,
                alreadyProcessed: true,
                email: { queued: false, sent: false, reason: 'Already processed' },
            });
        }
        if (approvalStatus !== 'Pending') {
            return res.status(409).json({ success: false, message: 'This issue has no pending close request.' });
        }

        if (action === 'approve') {
            const [update] = await db.query(
                `UPDATE Patrol_Issues
                 SET CurrentStatus = 'Closed', ResultStatus = 'Closed',
                     ClosedByID = COALESCE(CloseRequestedBy, ClosedByID),
                     ClosedAt = NOW(),
                     CloseApprovalStatus = 'Approved',
                     CloseApprovedBy = ?, CloseApprovedAt = NOW(),
                     CloseRejectedBy = NULL, CloseRejectedAt = NULL, CloseRejectReason = NULL
                 WHERE IssueID = ? AND CloseApprovalStatus = 'Pending'`,
                [req.user.id, issueId]
            );
            if (!update.affectedRows) {
                const [[latest]] = await db.query('SELECT CloseApprovalStatus FROM Patrol_Issues WHERE IssueID = ?', [issueId]);
                if (String(latest?.CloseApprovalStatus || '') === 'Approved') {
                    return res.json({ success: true, message: 'Close request was already approved.', status: 'Approved', alreadyProcessed: true, email: { queued: false, sent: false, reason: 'Already processed' } });
                }
                return res.status(409).json({ success: false, message: 'This close request was reviewed by another Admin.' });
            }
            await recordPatrolIssueEvent({
                issueId,
                eventType: 'CLOSE_APPROVED',
                actor: req.user,
                fromStatus: issue.CurrentStatus || null,
                toStatus: 'Closed',
                comment: issue.ActionDescription || null,
                images: { afterImage: issue.AfterImage },
                metadata: patrolIssueAuditMeta({ ...issue, CurrentStatus: 'Closed', CloseApprovalStatus: 'Approved' }),
            });
            await logAudit(req, {
                module: 'patrol',
                action: 'APPROVE_CLOSE_PATROL_ISSUE',
                targetType: 'Patrol_Issues',
                targetId: issueId,
                detail: `Approve close request for patrol issue #${issueId}`,
                metadata: patrolIssueAuditMeta({ ...issue, CurrentStatus: 'Closed', CloseApprovalStatus: 'Approved' }),
            });
            const email = await queuePatrolIssueEmail({ issueId, eventType: 'CloseApproved', actor: req.user })
                .catch(err => ({ queued: false, sent: false, reason: err.message }));
            return res.json({ success: true, message: 'Close request approved.', status: 'Approved', email });
        }

        const [update] = await db.query(
            `UPDATE Patrol_Issues
             SET CloseApprovalStatus = 'Rejected',
                 CloseRejectedBy = ?, CloseRejectedAt = NOW(), CloseRejectReason = ?,
                 CloseApprovedBy = NULL, CloseApprovedAt = NULL
             WHERE IssueID = ? AND CloseApprovalStatus = 'Pending'`,
            [req.user.id, reason, issueId]
        );
        if (!update.affectedRows) {
            const [[latest]] = await db.query('SELECT CloseApprovalStatus FROM Patrol_Issues WHERE IssueID = ?', [issueId]);
            if (String(latest?.CloseApprovalStatus || '') === 'Rejected') {
                return res.json({ success: true, message: 'Close request was already rejected.', status: 'Rejected', alreadyProcessed: true, email: { queued: false, sent: false, reason: 'Already processed' } });
            }
            return res.status(409).json({ success: false, message: 'This close request was reviewed by another Admin.' });
        }
        await recordPatrolIssueEvent({
            issueId,
            eventType: 'CLOSE_REJECTED',
            actor: req.user,
            fromStatus: issue.CurrentStatus || null,
            toStatus: issue.CurrentStatus || null,
            comment: reason,
            images: { afterImage: issue.AfterImage },
            metadata: patrolIssueAuditMeta({ ...issue, CloseApprovalStatus: 'Rejected', CloseRejectReason: reason }),
        });
        await logAudit(req, {
            module: 'patrol',
            action: 'REJECT_CLOSE_PATROL_ISSUE',
            targetType: 'Patrol_Issues',
            targetId: issueId,
            detail: `Reject close request for patrol issue #${issueId}`,
            metadata: patrolIssueAuditMeta({ ...issue, CloseApprovalStatus: 'Rejected', CloseRejectReason: reason }),
        });
        const email = await queuePatrolIssueEmail({ issueId, eventType: 'CloseRejected', actor: req.user })
            .catch(err => ({ queued: false, sent: false, reason: err.message }));
        return res.json({ success: true, message: 'Close request rejected.', status: 'Rejected', email });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Cannot review close request.' });
    }
});

router.delete('/issue/:id', async (req, res) => {
    if (!isAdminUser(req)) {
        return res.status(403).json({ success: false, message: 'เฉพาะ Admin เท่านั้น' });
    }
    try {
        const [[row]] = await db.query('SELECT BeforeImage, TempImage, AfterImage FROM Patrol_Issues WHERE IssueID = ?', [req.params.id]);
        const [result] = await db.query('DELETE FROM Patrol_Issues WHERE IssueID = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการนี้' });
        }
        await db.query('DELETE FROM Patrol_RankA_Hotspot_Issue_Positions WHERE IssueID = ?', [req.params.id]).catch(() => {});
        deleteLocalUpload(row?.BeforeImage);
        deleteLocalUpload(row?.TempImage);
        deleteLocalUpload(row?.AfterImage);
        await logAudit(req, {
            module: 'patrol',
            action: 'DELETE_PATROL_ISSUE',
            targetType: 'Patrol_Issues',
            targetId: req.params.id,
            detail: `Delete patrol issue #${req.params.id}`,
            metadata: { issueId: req.params.id },
        });
        res.json({ success: true, message: 'ลบข้อมูลสำเร็จ' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'ไม่สามารถลบข้อมูลได้' });
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
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/teams — create team
router.post('/teams', isAdmin, async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    if (!Name || !PatrolGroup) return res.status(400).json({ success: false, message: 'Name และ PatrolGroup จำเป็น' });
    if (!['A', 'B'].includes(PatrolGroup)) return res.status(400).json({ success: false, message: 'PatrolGroup ต้องเป็น A หรือ B' });
    try {
        const [r] = await db.query(
            'INSERT INTO Patrol_Teams (Name, PatrolGroup, Color) VALUES (?,?,?)',
            [Name, PatrolGroup, Color || '#6366f1']
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/teams/:id — update team
router.put('/teams/:id', isAdmin, async (req, res) => {
    const { Name, PatrolGroup, Color } = req.body;
    if (!Name || !PatrolGroup) return res.status(400).json({ success: false, message: 'Name และ PatrolGroup จำเป็น' });
    if (!['A', 'B'].includes(PatrolGroup)) return res.status(400).json({ success: false, message: 'PatrolGroup ต้องเป็น A หรือ B' });
    try {
        await db.query(
            'UPDATE Patrol_Teams SET Name=?, PatrolGroup=?, Color=? WHERE id=?',
            [Name, PatrolGroup, Color, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/teams/:id — delete team + members
router.delete('/teams/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE TeamID=?', [req.params.id]);
        await db.query('DELETE FROM Patrol_Teams WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
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
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/teams/:id/members — add member
router.post('/teams/:id/members', isAdmin, async (req, res) => {
    const { EmployeeID, PatrolType } = req.body;
    if (!EmployeeID || !PatrolType) return res.status(400).json({ success: false, message: 'EmployeeID และ PatrolType จำเป็น' });
    if (!['top', 'committee', 'management'].includes(PatrolType)) {
        return res.status(400).json({ success: false, message: 'PatrolType ไม่ถูกต้อง' });
    }
    try {
        const [[existingMembership]] = await db.query(
            `SELECT tm.TeamID,t.Name AS TeamName
               FROM Patrol_Team_Members tm
               LEFT JOIN Patrol_Teams t ON t.id=tm.TeamID
              WHERE tm.EmployeeID=? LIMIT 1`,
            [EmployeeID]
        );
        if (existingMembership) {
            return res.status(409).json({
                success: false,
                code: 'PATROL_TEAM_CONFLICT',
                message: 'Employee already belongs to a base Patrol team. Use Member Rotation for a monthly reassignment.',
                data: { teamId: Number(existingMembership.TeamID), teamName: existingMembership.TeamName || '' },
            });
        }
        const [r] = await db.query(
            'INSERT INTO Patrol_Team_Members (TeamID, EmployeeID, PatrolType) VALUES (?,?,?)',
            [req.params.id, EmployeeID, PatrolType]
        );
        res.json({ success: true, id: r.insertId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'พนักงานนี้อยู่ในทีมนี้แล้ว' });
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/teams/:teamId/members/:memberId — remove member
router.delete('/teams/:teamId/members/:memberId', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Team_Members WHERE id=? AND TeamID=?',
            [req.params.memberId, req.params.teamId]);
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
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
        sendPatrolError(res, err);
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
    const parsedYear = parseYear(year);
    if (!parsedYear) return res.status(400).json({ success: false, message: 'year ไม่ถูกต้อง' });
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
        `, [parsedYear]);
        res.json({ success: true, base, monthly });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/member-rotation — bulk upsert monthly member→team assignments
router.post('/member-rotation', isAdmin, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        for (const { EmployeeID, TeamID, Year, Month } of items) {
            const ym = validateYearMonthInput({ year: Year, month: Month });
            if (ym.error) {
                const err = new Error(ym.error);
                err.statusCode = 400;
                throw err;
            }
            await conn.query(`
                INSERT INTO Patrol_Member_Rotation (EmployeeID, TeamID, Year, Month)
                VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE TeamID=VALUES(TeamID)
            `, [EmployeeID, TeamID, ym.year, ym.month]);
        }
        await conn.commit();
        res.json({ success: true, saved: items.length });
    } catch (err) {
        await conn.rollback();
        sendPatrolError(res, err);
    } finally { conn.release(); }
});

// GET /api/patrol/monthly-report?year=Y&month=M — monthly grid report (all teams + members)
router.get('/monthly-report', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        // Sessions for the month
        const [sessions] = await db.query(`
            SELECT s.SessionID AS id, s.TeamID, s.PatrolDate, s.PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            JOIN   Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.TeamID, s.PatrolDate
        `, [ym.year, ym.month]);

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
        `, [ym.year, ym.month]);

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
        res.json({ success: true, data: teams, year: ym.year, month: ym.month });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/member-schedule?year=Y — full annual schedule per member
router.get('/member-schedule', async (req, res) => {
    const { year } = req.query;
    if (!year) return res.status(400).json({ success: false, message: 'year จำเป็น' });
    const parsedYear = parseYear(year);
    if (!parsedYear) return res.status(400).json({ success: false, message: 'year ไม่ถูกต้อง' });
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
            'SELECT EmployeeID, TeamID, Month FROM Patrol_Member_Rotation WHERE Year = ?', [parsedYear]
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
        `, [parsedYear]);

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

        res.json({ success: true, data, year: parsedYear });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 8: Area Rotation
// ==========================================

// GET /api/patrol/rotation?year=&month= — rotation ของเดือน (all teams)
router.get('/rotation', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        const [rows] = await db.query(`
            SELECT r.TeamID, r.AreaID, r.Year, r.Month,
                   COALESCE(r.PatrolRound, 0) AS PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
            ORDER BY t.id, r.PatrolRound
        `, [ym.year, ym.month]);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/rotation — upsert rotation per round
// items: array of { TeamID, r1: areaId|null, r2: areaId|null, Year, Month }
router.post('/rotation', isAdmin, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ success: false, message: 'ส่ง array ของ rotation' });
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        let saved = 0;
        for (const { TeamID, r1, r2, Year, Month } of items) {
            const ym = validateYearMonthInput({ year: Year, month: Month });
            if (ym.error) {
                const err = new Error(ym.error);
                err.statusCode = 400;
                throw err;
            }
            // Delete all existing round records for this team/month
            await conn.query(
                'DELETE FROM Patrol_Team_Rotation WHERE TeamID=? AND Year=? AND Month=?',
                [TeamID, ym.year, ym.month]
            );
            if (!r1 && !r2) {
                // Explicit "ไม่มีเดิน" sentinel — AreaID=NULL, PatrolRound=0
                // This lets frontend distinguish "explicitly no patrol" from "never configured"
                await conn.query(
                    'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,NULL,?,?,0)',
                    [TeamID, ym.year, ym.month]
                );
                saved++;
            } else {
                if (r1) {
                    await conn.query(
                        'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,?,?,?,1)',
                        [TeamID, r1, ym.year, ym.month]
                    );
                    saved++;
                }
                if (r2) {
                    await conn.query(
                        'INSERT INTO Patrol_Team_Rotation (TeamID, AreaID, Year, Month, PatrolRound) VALUES (?,?,?,?,2)',
                        [TeamID, r2, ym.year, ym.month]
                    );
                    saved++;
                }
            }
        }
        await conn.commit();
        res.json({ success: true, saved });
    } catch (err) {
        await conn.rollback();
        sendPatrolError(res, err);
    } finally { conn.release(); }
});

// ==========================================
// PART 8: Generate Sessions
// ==========================================

// POST /api/patrol/generate-sessions { year, month }
// — สร้าง Patrol_Sessions จาก rotation ของเดือนนั้นอัตโนมัติ
router.post('/generate-sessions', isAdmin, async (req, res) => {
    const { year, month } = req.body;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });

    try {
        // 1. ดึง rotation + teams ของเดือนนี้
        // LEFT JOIN Patrol_Areas เพราะ AreaID อาจเป็น NULL (sentinel "ไม่มีเดิน")
        // กรอง sentinel (AreaID IS NULL) ออก — ไม่สร้าง session สำหรับทีมที่ไม่มีเดิน
        const [rotations] = await db.query(`
            SELECT r.TeamID, r.AreaID, r.PatrolRound,
                   t.Name AS TeamName, t.PatrolGroup, t.Color,
                   a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Team_Rotation r
            JOIN   Patrol_Teams t ON t.id = r.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = r.AreaID
            WHERE  r.Year = ? AND r.Month = ?
              AND  r.AreaID IS NOT NULL
        `, [ym.year, ym.month]);

        if (rotations.length === 0)
            return res.status(400).json({ success: false, message: 'ยังไม่มีตารางหมุนเวียนของเดือนนี้ หรือทุกทีมถูกตั้งเป็น "ไม่มีเดิน" กรุณาตั้งค่า Rotation ก่อน' });

        // 2. หาวันพุธทั้งหมดในเดือน (เรียงลำดับ)
        const wednesdays = getWednesdaysInMonth(ym.year, ym.month);
        // wednesdays[0]=พุธ1, [1]=พุธ2, [2]=พุธ3, [3]=พุธ4
        // Group A → [0],[2] (พุธที่ 1 & 3)
        // Group B → [1],[3] (พุธที่ 2 & 4)

        const groupDates = {
            A: [wednesdays[0], wednesdays[2]].filter(Boolean),
            B: [wednesdays[1], wednesdays[3]].filter(Boolean),
        };

        // 3. Group rotation records by TeamID
        //    สำหรับแต่ละทีม อาจมีหลาย records (round 1 ต่างพื้นที่จาก round 2)
        //    PatrolRound=0 = legacy (ทั้งสองรอบใช้พื้นที่เดียวกัน)
        //    PatrolRound=1 = สร้าง session เฉพาะรอบ 1
        //    PatrolRound=2 = สร้าง session เฉพาะรอบ 2
        const teamMap = {};
        for (const rot of rotations) {
            if (!teamMap[rot.TeamID]) {
                teamMap[rot.TeamID] = {
                    TeamID: rot.TeamID, TeamName: rot.TeamName,
                    PatrolGroup: rot.PatrolGroup, Color: rot.Color,
                    rounds: {} // round -> AreaID
                };
            }
            const rnd = Number(rot.PatrolRound);
            if (rnd === 0) {
                // legacy: same area both rounds
                teamMap[rot.TeamID].rounds[1] = rot.AreaID;
                teamMap[rot.TeamID].rounds[2] = rot.AreaID;
            } else {
                teamMap[rot.TeamID].rounds[rnd] = rot.AreaID;
            }
        }

        const conn = await db.getConnection();
        let created = 0;
        try {
            await conn.beginTransaction();

            // SessionID is VARCHAR — generate UUID per row (matches existing table schema)
            for (const team of Object.values(teamMap)) {
                const dates = groupDates[team.PatrolGroup] || [];
                for (const [roundStr, areaId] of Object.entries(team.rounds)) {
                    const round   = parseInt(roundStr, 10);
                    const dateStr = dates[round - 1];
                    if (!dateStr || !areaId) continue;

                    // Duplicate check — all values escaped inline, no ? params
                    const chkSql = `SELECT COUNT(*) AS cnt FROM Patrol_Sessions WHERE PatrolDate=${mysql.escape(dateStr)} AND TeamID=${mysql.escape(team.TeamID)} AND PatrolRound=${mysql.escape(round)}`;
                    const [chkRows] = await conn.query(chkSql);
                    if (Number(chkRows[0]?.cnt ?? 0) > 0) continue;

                    // INSERT with UUID as SessionID — all values escaped inline
                    const newId = randomUUID();
                    const insSql = `INSERT INTO Patrol_Sessions (SessionID,PatrolDate,TeamName,TeamID,AreaID,PatrolRound,Status) VALUES (${mysql.escape(newId)},${mysql.escape(dateStr)},${mysql.escape(team.TeamName)},${mysql.escape(team.TeamID)},${mysql.escape(areaId)},${mysql.escape(round)},'Pending')`;
                    await conn.query(insSql);
                    created++;
                }
            }
            await conn.commit();
            res.json({ success: true, created, message: `สร้าง ${created} sessions สำเร็จ` });
        } catch (err) {
            await conn.rollback();
            console.error('[generate-sessions] ERROR:', err.message);
            throw err;
        } finally { conn.release(); }

    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/monthly-summary?year=&month= — สรุปรายเดือนสำหรับแสดงใน patrol page
router.get('/monthly-summary', async (req, res) => {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ success: false, message: 'year และ month จำเป็น' });
    const ym = validateYearMonthInput({ year, month });
    if (ym.error) return res.status(400).json({ success: false, message: ym.error });
    try {
        const [sessions] = await db.query(`
            SELECT s.*, s.SessionID AS id, s.PatrolDate AS ScheduledDate,
                   t.Color AS TeamColor, a.Name AS AreaName, a.Code AS AreaCode
            FROM   Patrol_Sessions s
            LEFT JOIN Patrol_Teams t ON t.id = s.TeamID
            LEFT JOIN Patrol_Areas a ON a.id = s.AreaID
            WHERE  YEAR(s.PatrolDate) = ? AND MONTH(s.PatrolDate) = ?
            ORDER BY s.PatrolDate, s.TeamID
        `, [ym.year, ym.month]);
        res.json({ success: true, data: sessions });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/sessions/:id — แก้ไขวันที่ / area / status
router.put('/sessions/:id', isAdmin, async (req, res) => {
    const { PatrolDate, AreaID, Status } = req.body;
    if (!PatrolDate && !AreaID && !Status)
        return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });
    if (Status && !SESSION_STATUSES.includes(Status)) {
        return res.status(400).json({ success: false, message: 'Status ไม่ถูกต้อง' });
    }
    try {
        const [[session]] = await db.query(
            'SELECT SessionID, PatrolDate, TeamID, AreaID, PatrolRound, Status FROM Patrol_Sessions WHERE SessionID = ?',
            [req.params.id]
        );
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบ session' });

        const sets  = [];
        const vals  = [];
        let targetDate = dateOnly(session.PatrolDate);
        const targetTeam = session.TeamID;
        const targetRound = session.PatrolRound;

        if (PatrolDate) {
            const parsedDate = parseDateInput(PatrolDate);
            if (!parsedDate) return res.status(400).json({ success: false, message: 'PatrolDate ไม่ถูกต้อง' });
            sets.push('PatrolDate = ?');
            vals.push(parsedDate);
            targetDate = parsedDate;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'AreaID')) {
            sets.push('AreaID = ?');
            vals.push(AreaID || null);
        }
        if (Status)     { sets.push('Status = ?');     vals.push(Status); }
        if (!sets.length) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่ต้องการแก้ไข' });

        const [[dupe]] = await db.query(
            'SELECT COUNT(*) AS cnt FROM Patrol_Sessions WHERE PatrolDate = ? AND TeamID = ? AND PatrolRound = ? AND SessionID <> ?',
            [targetDate, targetTeam, targetRound, req.params.id]
        );
        if (Number(dupe?.cnt || 0) > 0) {
            return res.status(409).json({ success: false, message: 'มี session ของทีม/รอบ/วันนี้อยู่แล้ว' });
        }

        vals.push(req.params.id);
        const [result] = await db.query(
            `UPDATE Patrol_Sessions SET ${sets.join(', ')} WHERE SessionID = ?`, vals
        );
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'แก้ไข session เรียบร้อย' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// PATCH /api/patrol/sessions/:id/toggle-cancel — สลับ Pending ↔ Cancelled
router.patch('/sessions/:id/toggle-cancel', isAdmin, async (req, res) => {
    try {
        const [[sess]] = await db.query('SELECT Status FROM Patrol_Sessions WHERE SessionID = ?', [req.params.id]);
        if (!sess) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        const newStatus = sess.Status === 'Cancelled' ? 'Pending' : 'Cancelled';
        await db.query('UPDATE Patrol_Sessions SET Status = ? WHERE SessionID = ?', [newStatus, req.params.id]);
        res.json({ success: true, status: newStatus });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/sessions/:id — ลบ session (Admin)
router.delete('/sessions/:id', isAdmin, async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM Patrol_Sessions WHERE SessionID = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'ไม่พบ session' });
        res.json({ success: true, message: 'ลบ session เรียบร้อย' });
    } catch (err) {
        sendPatrolError(res, err);
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

// GET /api/patrol/attendance-overview?year=Y — ภาพรวมการเข้าร่วมรายบุคคลทั้งปี (Patrol_Roster based)
function dateOnly(value) {
    if (!value) return '';
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10);
}

function patrolCutoffDate(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year < currentYear) return `${year}-12-31`;
    if (year > currentYear) return `${year}-01-01`;
    return dateOnly(now);
}

function patrolDueMonth(year) {
    const now = new Date();
    const currentYear = now.getFullYear();
    if (year < currentYear) return 12;
    if (year > currentYear) return 0;
    return now.getMonth() + 1;
}

function patrolPct(done, target) {
    return target > 0 ? Math.min(100, Math.round(done * 100 / target)) : 0;
}

function patrolPassThreshold(required, passPct = 80) {
    const target = Math.max(0, Number(required || 0));
    const pct = Math.max(0, Math.min(100, Number(passPct || 80)));
    return Math.ceil(target * pct / 100);
}

function patrolPhase3Metrics({ requiredToDate = 0, yearlyTarget = 0, checkedToDate = 0, checkedYear = 0, leaveStats = {}, passPct = 80 } = {}) {
    const thresholdToDate = patrolPassThreshold(requiredToDate, passPct);
    const thresholdYear = patrolPassThreshold(yearlyTarget, passPct);
    const acceptedCoverageToDate = Number(leaveStats.acceptedCoverageToDate || 0);
    const acceptedCoverageYear = Number(leaveStats.acceptedCoverageYear || 0);
    const actualPassToDate = Number(checkedToDate || 0) >= thresholdToDate;
    const actualPassYear = Number(checkedYear || 0) >= thresholdYear;
    const acceptedPassToDate = acceptedCoverageToDate >= thresholdToDate;
    const acceptedPassYear = acceptedCoverageYear >= thresholdYear;
    const finalStatus = actualPassToDate ? 'Pass' : acceptedPassToDate ? 'Accepted by leave' : 'Below target';
    return {
        passThresholdToDate: thresholdToDate,
        passThresholdYear: thresholdYear,
        actualPassToDate,
        actualPassYear,
        acceptedPassToDate,
        acceptedPassYear,
        checkedToDate: Number(checkedToDate || 0),
        checkedYear: Number(checkedYear || 0),
        leaveYear: Number(leaveStats.leaveYear || 0),
        allowedLeaveYear: Number(leaveStats.allowedLeaveYear || 0),
        acceptedLeaveYear: Number(leaveStats.acceptedLeaveYear || 0),
        overLeaveYear: Number(leaveStats.overLeaveYear || 0),
        leaveRemainingYear: Number(leaveStats.leaveRemainingYear || 0),
        acceptedCoverageToDate,
        acceptedCoverageYear,
        finalStatus,
    };
}

function patrolLeaveStatus(value) {
    const status = String(value || 'Approved').trim();
    return ['Pending', 'Approved', 'Rejected', 'Cancelled'].includes(status) ? status : 'Approved';
}

function isPatrolLeaveAccepted(row) {
    return String(row?.Status || '') === 'Approved';
}

function isPatrolLeaveBlocking(row) {
    return ['Pending', 'Approved'].includes(String(row?.Status || ''));
}

async function patrolLeaveRows(employeeId, group, year, filters = {}) {
    const where = ['RosterGroup=?', 'YEAR(ScheduledDate)=?'];
    const params = [group, year];
    if (employeeId) {
        where.unshift('EmployeeID=?');
        params.unshift(employeeId);
    }
    if (filters.status) {
        where.push('Status=?');
        params.push(patrolLeaveStatus(filters.status));
    }
    const [rows] = await db.query(
        `SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,DATE_FORMAT(ScheduledDate,'%Y-%m-%d') AS ScheduledDate,
                LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,CreatedAt,ReviewedBy,ReviewNote,ReviewedAt
         FROM Patrol_Leave_Requests
         WHERE ${where.join(' AND ')}
         ORDER BY ScheduledDate,id`,
        params
    );
    return rows.map(row => ({ ...row, ScheduledDate: dateOnly(row.ScheduledDate) }));
}

function attachLeaveToScheduledItems(items, leaveRows = []) {
    const bySession = new Map();
    const byDate = new Map();
    for (const row of leaveRows) {
        const sid = String(row.ScheduledSessionID || '');
        if (sid) bySession.set(sid, row);
        const date = dateOnly(row.ScheduledDate);
        if (date && !byDate.has(date)) byDate.set(date, row);
    }
    return items.map(item => {
        const sid = String(item.ScheduledSessionID || item.sessionId || item.id || '');
        const date = dateOnly(item.ScheduledDate || item.PatrolDate || item.date);
        const leave = bySession.get(sid) || byDate.get(date) || null;
        if (!leave || item.isCompleted) return { ...item, leave };
        const accepted = isPatrolLeaveAccepted(leave);
        const pending = String(leave.Status || '') === 'Pending';
        return {
            ...item,
            leave,
            isLeave: accepted,
            isLeavePending: pending,
            status: accepted ? 'leave' : pending ? 'leave_pending' : item.status,
            checkinStatus: accepted ? 'leave' : pending ? 'leave_pending' : item.checkinStatus,
            completionStatus: accepted ? 'leave' : pending ? 'leave_pending' : item.completionStatus,
        };
    });
}

function patrolScheduledSessionId(item = {}) {
    return String(item.ScheduledSessionID || item.sessionId || item.id || item.SessionID || '').trim();
}

function patrolSessionRecords(item = {}) {
    return Array.isArray(item.records) ? item.records : [];
}

function patrolLeaveStats({ requiredToDate = 0, yearlyTarget = 0, checkedToDate = 0, checkedYear = 0, leaveRows = [], passPct = 80 } = {}) {
    const pct = Math.max(0, Math.min(100, Number(passPct || 80)));
    const allowancePct = Math.max(0, 100 - pct);
    const acceptedRows = leaveRows.filter(isPatrolLeaveAccepted);
    const pendingRows = leaveRows.filter(row => String(row.Status || '') === 'Pending');
    const leaveToDate = acceptedRows.filter(row => dateOnly(row.ScheduledDate) <= dateOnly(new Date())).length;
    const leaveYear = acceptedRows.length;
    const allowedToDate = Math.floor(Number(requiredToDate || 0) * allowancePct / 100);
    const allowedYear = Math.floor(Number(yearlyTarget || 0) * allowancePct / 100);
    const acceptedToDate = Math.min(leaveToDate, allowedToDate);
    const acceptedYear = Math.min(leaveYear, allowedYear);
    const acceptedCoverageToDate = Number(checkedToDate || 0) + acceptedToDate;
    const acceptedCoverageYear = Number(checkedYear || 0) + acceptedYear;
    return {
        passPct: pct,
        leaveAllowancePct: allowancePct,
        leaveToDate,
        leaveYear,
        pendingLeave: pendingRows.length,
        allowedLeaveToDate: allowedToDate,
        allowedLeaveYear: allowedYear,
        acceptedLeaveToDate: acceptedToDate,
        acceptedLeaveYear: acceptedYear,
        overLeaveToDate: Math.max(0, leaveToDate - allowedToDate),
        overLeaveYear: Math.max(0, leaveYear - allowedYear),
        leaveRemainingToDate: Math.max(0, allowedToDate - leaveToDate),
        leaveRemainingYear: Math.max(0, allowedYear - leaveYear),
        acceptedCoverageToDate,
        acceptedCoverageYear,
        acceptedCoverageToDatePct: patrolPct(acceptedCoverageToDate, requiredToDate),
        acceptedCoverageYearPct: patrolPct(acceptedCoverageYear, yearlyTarget),
    };
}

function patrolLeaveInput(body = {}) {
    return {
        group: String(body.RosterGroup || body.group || '').trim(),
        employeeId: String(body.EmployeeID || body.employeeId || '').trim(),
        scheduledSessionId: String(body.ScheduledSessionID || body.scheduledSessionId || '').trim(),
        scheduledDate: parseDateInput(body.ScheduledDate || body.scheduledDate || body.date || ''),
        leaveType: String(body.LeaveType || body.leaveType || '').trim() || null,
        destination: String(body.Destination || body.destination || '').trim() || null,
        reason: String(body.Reason || body.reason || '').trim(),
    };
}

async function patrolLeaveScheduleForEmployee(employeeId, group, scheduledSessionId, scheduledDate) {
    const year = Number((scheduledDate || dateOnly(new Date())).slice(0, 4)) || new Date().getFullYear();
    const detail = group === 'supervisor'
        ? await buildSupervisorAttendanceDetail(employeeId, year, { allowPositionSupervisor: true })
        : await buildTopManagementAttendanceDetail(employeeId, year);
    const schedule = Array.isArray(detail.schedule) ? detail.schedule : [];
    const target = schedule.find(item => {
        const itemId = patrolScheduledSessionId(item);
        const itemDate = dateOnly(item.date || item.PatrolDate || item.ScheduledDate);
        return (scheduledSessionId && (itemId === scheduledSessionId || String(item.ScheduledSessionID || '') === scheduledSessionId))
            || (scheduledDate && itemDate === scheduledDate);
    });
    if (!target) {
        const err = new Error('Selected schedule is not valid for this employee.');
        err.statusCode = 400;
        throw err;
    }
    if (target.isCompleted || patrolSessionRecords(target).length) {
        const err = new Error('Selected schedule is already completed.');
        err.statusCode = 409;
        throw err;
    }
    if (target.isLeave || target.isLeavePending || isPatrolLeaveBlocking(target.leave || {})) {
        const err = new Error('Selected schedule already has approved leave.');
        err.statusCode = 409;
        throw err;
    }
    return {
        detail,
        session: target,
        scheduledSessionId: scheduledSessionId || patrolScheduledSessionId(target) || String(target.ScheduledSessionID || ''),
        scheduledDate: dateOnly(target.date || target.PatrolDate || target.ScheduledDate || scheduledDate),
    };
}

function patrolSupervisorMonthlyRequirement() {
    return 2;
}

async function patrolActivityTargetForEmployee(employeeId, employee, activityKey = 'patrol', year = new Date().getFullYear()) {
    try {
        const merged = await getMergedTargets(employeeId, year);
        const row = merged.overrideMap[activityKey] || merged.scopeMap[activityKey] || merged.templateMap[activityKey] || null;
        const source = merged.overrideMap[activityKey] ? 'override' : merged.scopeMap[activityKey] ? 'scope' : 'template';
        if (!row || row.IsNA) return null;
        const yearlyTarget = Number(row.YearlyTarget || 0);
        if (yearlyTarget < 1) return null;
        return { yearlyTarget, passPct: Number(row.PassPct || 80), source };
    } catch {
        return null;
    }
}

function patrolMonthlyRequiredFromYearlyTarget(yearlyTarget, month) {
    const target = Number(yearlyTarget || 0);
    const m = Number(month || 0);
    if (target < 1 || m < 1 || m > 12) return 0;
    return Math.max(0, Math.ceil(target * m / 12) - Math.ceil(target * (m - 1) / 12));
}

function patrolCurrentMonthlyRequirement(year, yearlyTarget) {
    const month = Math.min(12, Math.max(1, patrolDueMonth(year) || 1));
    return patrolMonthlyRequiredFromYearlyTarget(yearlyTarget, month);
}

function patrolSupervisorRequirementFromScheduleCount(count) {
    const total = Number(count || 0);
    return total > 0 ? Math.ceil(total / 2) : 0;
}

function daysInMonth(year, month) {
    const days = [];
    const last = new Date(year, month, 0).getDate();
    for (let day = 1; day <= last; day++) {
        days.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return days;
}

function patrolSelfCheckinType(value) {
    const type = String(value || 'normal');
    return ['normal', 'compensation'].includes(type) ? type : null;
}

async function topManagementSessionsForEmployee(employeeId, year) {
    const base = await patrolBaseMembership(employeeId);
    if (!base) return [];
    const [rotations] = await db.query(
        'SELECT Month,TeamID FROM Patrol_Member_Rotation WHERE EmployeeID=? AND Year=?',
        [employeeId, year]
    );
    const rotMap = {};
    rotations.forEach(r => { rotMap[Number(r.Month)] = Number(r.TeamID); });
    const teamIds = [...new Set([Number(base.TeamID), ...Object.values(rotMap)])].filter(Boolean);
    if (!teamIds.length) return [];
    const [rows] = await db.query(
        `SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,
                t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode
         FROM Patrol_Sessions s
         LEFT JOIN Patrol_Teams t ON t.id=s.TeamID
         LEFT JOIN Patrol_Areas a ON a.id=s.AreaID
         WHERE YEAR(s.PatrolDate)=? AND s.TeamID IN (${teamIds.map(() => '?').join(',')})
         ORDER BY s.PatrolDate,s.PatrolRound`,
        [year, ...teamIds]
    );
    return rows.filter(s => {
        const d = dateOnly(s.PatrolDate);
        const month = Number(d.slice(5, 7));
        const effectiveTeam = rotMap[month] || Number(base.TeamID);
        if (Number(s.TeamID) !== effectiveTeam) return false;
        if (String(s.Status || '').toLowerCase() === 'cancelled') return false;
        return base.PatrolType === 'management' || Number(s.PatrolRound || 0) === 2;
    }).map(s => ({ ...s, PatrolDate: dateOnly(s.PatrolDate) }));
}

async function patrolBaseMembership(employeeId) {
    const [rows] = await db.query(
        `SELECT tm.TeamID,tm.PatrolType,t.Name AS TeamName,t.PatrolGroup,t.Color
           FROM Patrol_Team_Members tm
           JOIN Patrol_Teams t ON t.id=tm.TeamID
          WHERE tm.EmployeeID=?
          ORDER BY tm.id`,
        [employeeId]
    );
    if (rows.length > 1) {
        const err = new Error('Employee belongs to more than one base Patrol team. Resolve the conflict in System Control.');
        err.statusCode = 409;
        err.code = 'PATROL_TEAM_CONFLICT';
        err.data = { teamIds: rows.map(row => Number(row.TeamID)) };
        throw err;
    }
    return rows[0] || null;
}

async function patrolEffectiveTeam(employeeId, year, month) {
    const base = await patrolBaseMembership(employeeId);
    if (!base) return null;
    const [[rotation]] = await db.query(
        `SELECT mr.TeamID,t.Name AS TeamName,t.PatrolGroup,t.Color
           FROM Patrol_Member_Rotation mr
           JOIN Patrol_Teams t ON t.id=mr.TeamID
          WHERE mr.EmployeeID=? AND mr.Year=? AND mr.Month=?
          LIMIT 1`,
        [employeeId, year, month]
    );
    return rotation || base;
}

async function buildPersonalMonthlySchedule(employeeId, year, month) {
    const yearSessions = await topManagementSessionsForEmployee(employeeId, year);
    const sessions = yearSessions
        .filter(s => Number(dateOnly(s.PatrolDate).slice(5, 7)) === Number(month));
    const leaveRows = (await patrolLeaveRows(employeeId, 'top_management', year))
        .filter(row => Number(dateOnly(row.ScheduledDate).slice(5, 7)) === Number(month));
    const [attendance] = await db.query(
        `SELECT id,PatrolDate,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID,(IdempotencyKey IS NOT NULL) AS IsV2Request
           FROM Patrol_Attendance
         WHERE UserID=? AND YEAR(PatrolDate)=? AND MONTH(PatrolDate)=?
         ORDER BY PatrolDate,id`,
        [employeeId, year, month]
    );
    let linkedAttendance = [];
    const sessionIds = sessions.map(session => String(session.id));
    if (sessionIds.length) {
        [linkedAttendance] = await db.query(
            `SELECT id,PatrolDate,PatrolType,Area,Notes,RecordedBy,ScheduledSessionID,(IdempotencyKey IS NOT NULL) AS IsV2Request
               FROM Patrol_Attendance
              WHERE UserID=? AND ScheduledSessionID IN (${sessionIds.map(() => '?').join(',')})
              ORDER BY PatrolDate,id`,
            [employeeId, ...sessionIds]
        );
    }
    const scheduleAttendance = [...new Map(
        [...attendance, ...linkedAttendance].map(record => [Number(record.id), record])
    ).values()];
    const attByDate = {};
    const attBySession = {};
    scheduleAttendance.forEach(row => {
        const actual = dateOnly(row.PatrolDate);
        const record = { ...row, PatrolDate: actual };
        if (!attByDate[actual]) attByDate[actual] = [];
        attByDate[actual].push(record);
        if (record.ScheduledSessionID) {
            const sid = String(record.ScheduledSessionID);
            if (!attBySession[sid]) attBySession[sid] = [];
            attBySession[sid].push(record);
        }
    });
    let completed = 0;
    const legacyAttendanceByDate = Object.fromEntries(
        Object.entries(attByDate).map(([date, dateRecords]) => [date, dateRecords.filter(r => !r.ScheduledSessionID && !r.IsV2Request)])
    );
    const items = sessions.map(s => {
        const scheduledDate = dateOnly(s.PatrolDate);
        const sessionRecords = attBySession[String(s.id)] || [];
        const dateRecords = sessionRecords.length ? [] : (legacyAttendanceByDate[scheduledDate] || []).splice(0, 1);
        const records = [...sessionRecords, ...dateRecords].map(r => ({
            ...r,
            scheduledDate,
            actualDate: dateOnly(r.PatrolDate),
            isMakeup: Boolean(r.ScheduledSessionID) && dateOnly(r.PatrolDate) !== scheduledDate,
        }));
        const isCompleted = records.length > 0;
        if (isCompleted) completed++;
        return {
            ...s,
            id: s.id,
            SessionID: s.id,
            ScheduledSessionID: s.id,
            PatrolDate: scheduledDate,
            ScheduledDate: scheduledDate,
            date: scheduledDate,
            completionStatus: isCompleted ? 'completed' : scheduledDate <= dateOnly(new Date()) ? 'missing' : 'upcoming',
            isCompleted,
            actualDate: records[0]?.actualDate || null,
            isMakeup: Boolean(records[0]?.isMakeup),
            records,
        };
    });
    const itemsWithLeave = attachLeaveToScheduledItems(items, leaveRows);
    const sessionMap = new Map(yearSessions.map(session => [String(session.id), session]));
    return {
        items: itemsWithLeave,
        required: items.length,
        completed,
        attendance,
        actualActivity: patrolActualActivity(attendance, sessionMap),
        activityRecords: attendance.map(record => ({
            PatrolDate: dateOnly(record.PatrolDate),
            activityKind: patrolActualActivityKind(record, sessionMap),
        })),
        leaveRequests: leaveRows,
    };
}

async function supervisorScheduleSlotsForYear(year) {
    const [rows] = await db.query(
        `SELECT s.SessionID AS id,s.TeamID,s.PatrolDate,s.PatrolRound,s.Status,
                t.Name AS TeamName,t.Color AS TeamColor,a.Name AS AreaName,a.Code AS AreaCode
         FROM Patrol_Sessions s
         LEFT JOIN Patrol_Teams t ON t.id=s.TeamID
         LEFT JOIN Patrol_Areas a ON a.id=s.AreaID
         WHERE YEAR(s.PatrolDate)=?
           AND (s.Status IS NULL OR s.Status <> 'Cancelled')
         ORDER BY s.PatrolDate,s.PatrolRound,s.TeamID`,
        [year]
    );
    const slots = [];
    const seen = new Set();
    rows.forEach(row => {
        const scheduledDate = dateOnly(row.PatrolDate);
        const round = Number(row.PatrolRound || 0);
        const key = `${scheduledDate}:${round}`;
        if (seen.has(key)) return;
        seen.add(key);
        slots.push({
            ...row,
            id: row.id,
            SessionID: row.id,
            ScheduledSessionID: row.id,
            PatrolDate: scheduledDate,
            ScheduledDate: scheduledDate,
            date: scheduledDate,
            PatrolRound: round,
        });
    });
    return slots;
}

function attachSupervisorRecordsToSchedule(records, slots) {
    const bySession = {};
    const byDate = {};
    records.forEach(record => {
        if (record.ScheduledSessionID) {
            const sid = String(record.ScheduledSessionID);
            if (!bySession[sid]) bySession[sid] = [];
            bySession[sid].push(record);
        } else {
            const date = dateOnly(record.CheckinDate);
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(record);
        }
    });
    const usedUnlinked = new Set();
    return slots.map(slot => {
        const scheduledDate = dateOnly(slot.PatrolDate || slot.date);
        const linked = bySession[String(slot.id)] || [];
        const unlinked = (byDate[scheduledDate] || []).filter(r => !usedUnlinked.has(r.id));
        const fallback = linked.length ? [] : unlinked.slice(0, 1);
        fallback.forEach(r => usedUnlinked.add(r.id));
        const itemRecords = [...linked, ...fallback].map(r => ({
            ...r,
            PatrolType: r.PatrolType || 'normal',
            scheduledDate,
            actualDate: dateOnly(r.CheckinDate),
            isMakeup: r.PatrolType === 'compensation' || (Boolean(r.ScheduledSessionID) && dateOnly(r.CheckinDate) !== scheduledDate),
        }));
        const hasMakeup = itemRecords.some(r => r.isMakeup || r.PatrolType === 'compensation');
        const status = itemRecords.length ? (hasMakeup ? 'makeup' : 'checked') : scheduledDate <= dateOnly(new Date()) ? 'missed' : 'upcoming';
        return {
            ...slot,
            status,
            checkinStatus: status,
            isOpen: itemRecords.length === 0,
            sessionId: slot.id,
            patrolRound: Number(slot.PatrolRound || 0),
            teamId: Number(slot.TeamID || 0),
            teamName: slot.TeamName || '',
            areaName: slot.AreaName || '',
            areaCode: slot.AreaCode || '',
            records: itemRecords,
            isCompleted: itemRecords.length > 0,
        };
    });
}

async function resolveSupervisorScheduledSession(employeeId, date, requestedSessionId, options = {}) {
    const year = Number(String(date).slice(0, 4));
    const detail = await buildSupervisorAttendanceDetail(employeeId, year, {
        allowPositionSupervisor: true,
    });
    const slots = Array.isArray(detail.schedule) ? detail.schedule : [];
    const map = new Map(slots.map(s => [String(s.id), s]));
    let session = null;
    const sid = String(requestedSessionId || '').trim();
    if (sid) {
        session = map.get(sid);
        if (!session) {
            const err = new Error('Selected schedule is not valid for this employee.');
            err.statusCode = 400;
            throw err;
        }
        if (!options.preserveActualDate) {
            date = dateOnly(session.date || session.PatrolDate);
        }
    } else {
        if (options.requireSession) {
            const err = new Error('ScheduledSessionID is required for self-patrol check-in.');
            err.statusCode = 400;
            throw err;
        }
        session = slots.find(s => dateOnly(s.date || s.PatrolDate) === date && !s.isCompleted) || null;
    }
    if (session) {
        const [[existingLinked]] = await db.query(
            'SELECT id FROM Patrol_Self_Checkin WHERE EmployeeID=? AND ScheduledSessionID=? LIMIT 1',
            [employeeId, session.id]
        );
        const [[existingDate]] = await db.query(
            `SELECT id FROM Patrol_Self_Checkin
             WHERE EmployeeID=? AND DATE(CheckinDate)=?
               AND (ScheduledSessionID IS NULL OR ScheduledSessionID='')
             LIMIT 1`,
            [employeeId, dateOnly(session.date || session.PatrolDate)]
        );
        if (existingLinked || existingDate) {
            const err = new Error('Selected schedule is already completed.');
            err.statusCode = 409;
            throw err;
        }
        const [[leave]] = await db.query(
            "SELECT id FROM Patrol_Leave_Requests WHERE EmployeeID=? AND RosterGroup='supervisor' AND ScheduledSessionID=? AND Status IN ('Pending','Approved') LIMIT 1",
            [employeeId, session.id]
        );
        if (leave) {
            const err = new Error('Selected schedule already has approved leave.');
            err.statusCode = 409;
            throw err;
        }
    }
    return { session, date };
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildPatrolCheckinEmail({ employee, attendance, session }) {
    const employeeName = employee?.EmployeeName || attendance.UserName || attendance.UserID || '';
    const actualDate = dateOnly(attendance.PatrolDate);
    const scheduledDate = session ? dateOnly(session.PatrolDate) : actualDate;
    const typeLabel = attendance.PatrolType === 'compensation' ? 'เดินซ่อม / Makeup' : 'เดินปกติ / Routine';
    const subject = `[Safety Patrol] Check-in recorded - ${employeeName || attendance.UserID}`;
    const rendered = buildHiyariEmail({
        subject,
        title: 'บันทึก Safety Patrol สำเร็จ',
        kicker: 'SAFETY PATROL',
        moduleLabel: 'Safety Patrol Module',
        tone: 'completed',
        greeting: `เรียน คุณ${employeeName || 'ผู้ใช้งาน'} / Dear Safety Patrol user`,
        intro: [
            'ระบบบันทึกการเดินตรวจของคุณเรียบร้อยแล้ว',
            'กรุณาเปิดระบบเพื่อตรวจสอบประวัติและสถานะรอบการเดินของคุณได้ทุกเวลา',
        ],
        details: [
            { label: 'ผู้เดินตรวจ / Inspector', value: employeeName || '-', highlight: true },
            { label: 'รหัสพนักงาน / Employee ID', value: attendance.UserID || '-' },
            { label: 'ตำแหน่ง / Position', value: employee?.Position || '-' },
            { label: 'แผนก / Department', value: employee?.Department || '-' },
            { label: 'ประเภท / Type', value: typeLabel, highlight: true },
            { label: 'วันที่เดินจริง / Actual Date', value: actualDate || '-' },
            { label: 'วันที่ตามรอบ / Scheduled Date', value: scheduledDate || '-' },
            { label: 'รอบ / Round', value: session?.PatrolRound ? `Round ${Number(session.PatrolRound)}` : '-' },
            { label: 'ทีม / Team', value: session?.TeamName || attendance.TeamName || '-' },
            { label: 'พื้นที่ / Area', value: attendance.Area || session?.AreaName || '-' },
            { label: 'หมายเหตุ / Notes', value: attendance.Notes || '-' },
        ],
        actions: ['เปิด Safety Patrol เพื่อตรวจสอบ My Schedule และประวัติการเดินตรวจ'],
        note: 'อีเมลนี้ส่งอัตโนมัติหลังจากผู้ใช้บันทึกการเดินตรวจด้วยตนเอง',
    });
    return { subject, text: rendered.text, html: rendered.html };
}

async function queuePatrolCheckinEmail({ attendanceId, employee, attendance, session }) {
    await ensureEmployeeCompanyEmailColumn(db).catch(() => {});
    const recipient = String(employee?.CompanyEmail || '').trim();
    if (!isValidEmail(recipient)) {
        return { queued: false, sent: false, reason: 'No valid CompanyEmail' };
    }
    const { subject, text, html } = buildPatrolCheckinEmail({ employee, attendance, session });
    const [insert] = await db.query(
        `INSERT INTO Patrol_EmailOutbox (AttendanceID, EmployeeID, EventType, Recipients, Subject, Body, HtmlBody, Status)
         VALUES (?, ?, 'SelfCheckInRecorded', ?, ?, ?, ?, 'Queued')`,
        [attendanceId, attendance.UserID, recipient, subject, text, html || null]
    ).catch(err => {
        console.error('[patrol/email] queue failed:', err.message);
        return [{}];
    });
    const outboxId = insert?.insertId || null;
    if (!smtpConfigured()) return { queued: Boolean(outboxId), outboxId, status: outboxId ? 'Queued' : 'Failed', sent: false };
    try {
        await sendMail({ to: recipient, subject, text, html });
        if (outboxId) await db.query(`UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?`, [outboxId]);
        return { queued: Boolean(outboxId), outboxId, status: 'Sent', sent: true };
    } catch (err) {
        if (outboxId) await db.query(`UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?`, [err.message, outboxId]).catch(() => {});
        return { queued: Boolean(outboxId), outboxId, status: 'Failed', sent: false, reason: err.message };
    }
}

function getPatrolAdminEmail() {
    return String(
        process.env.PATROL_ADMIN_EMAIL
        || process.env.HIYARI_ADMIN_EMAIL
        || process.env.ADMIN_EMAIL
        || process.env.SMOKE_ADMIN_EMAIL
        || process.env.SMTP_FROM
        || process.env.SMTP_USER
        || ''
    ).trim();
}

async function getPatrolLeaveReviewerEmails() {
    await ensureEmployeeCompanyEmailColumn(db).catch(() => {});
    const envRecipients = uniqueEmailRecipients([getPatrolAdminEmail()]);
    let roleRecipients = [];
    try {
        const [rows] = await db.query(
            `SELECT CompanyEmail
             FROM Employees
             WHERE CompanyEmail IS NOT NULL
               AND TRIM(CompanyEmail) <> ''
               AND (LOWER(Role) = 'admin' OR LOWER(Role) LIKE '%safety%')
             LIMIT 80`
        );
        roleRecipients = rows.map(row => row.CompanyEmail);
    } catch (err) {
        console.error('[patrol/leave-email] reviewer lookup failed:', err.message);
    }
    return uniqueEmailRecipients([...envRecipients, ...roleRecipients]);
}

function uniqueEmailRecipients(values) {
    const seen = new Set();
    return values
        .flatMap(value => String(value || '').split(/[;,]/))
        .map(value => value.trim())
        .filter(value => {
            const key = value.toLowerCase();
            if (!isValidEmail(value) || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

async function fetchPatrolIssueForEmail(issueId) {
    const [rows] = await db.query(
        `SELECT i.*,
                e.EmployeeName AS ReporterName,
                e.CompanyEmail AS ReporterEmail,
                e.Department AS ReporterDepartment,
                e.Unit AS ReporterUnit,
                e.Team AS ReporterTeam,
                requester.EmployeeName AS CloseRequesterName,
                requester.CompanyEmail AS CloseRequesterEmail
         FROM Patrol_Issues i
         LEFT JOIN Employees e ON e.EmployeeID = i.ReporterID
         LEFT JOIN Employees requester ON requester.EmployeeID = i.CloseRequestedBy
         WHERE i.IssueID = ?
         LIMIT 1`,
        [issueId]
    );
    return rows[0] || null;
}

async function fetchPatrolLeaveForEmail(leaveId) {
    await ensureEmployeeCompanyEmailColumn(db).catch(() => {});
    const [rows] = await db.query(
        `SELECT l.*,
                DATE_FORMAT(l.ScheduledDate,'%Y-%m-%d') AS ScheduledDate,
                e.EmployeeName,
                e.CompanyEmail,
                e.Department,
                e.Position,
                e.Unit,
                reviewer.EmployeeName AS ReviewerName
         FROM Patrol_Leave_Requests l
         LEFT JOIN Employees e ON e.EmployeeID = l.EmployeeID
         LEFT JOIN Employees reviewer ON reviewer.EmployeeID = l.ReviewedBy
         WHERE l.id = ?
         LIMIT 1`,
        [leaveId]
    );
    return rows[0] || null;
}

function formatIssueEmailDate(value) {
    if (!value) return '-';
    return String(value).slice(0, 10);
}

function buildPatrolIssueEmail({ issue, eventType, actor, recipientKind }) {
    const issueId = issue?.IssueID || '';
    const machine = issue?.MachineName || issueMultiDisplay(issue?.HazardType, '') || issue?.Area || 'Patrol issue';
    const isAdmin = recipientKind === 'admin';
    const eventConfig = {
        IssueCreated: {
            subject: `[Safety Patrol] New issue #${issueId} - ${machine}`,
            title: 'New Safety Patrol issue recorded',
            tone: issue?.Rank === 'A' ? 'warning' : 'neutral',
            intro: isAdmin
                ? ['A new Safety Patrol issue has been recorded and is ready for follow-up.']
                : ['Your Safety Patrol issue has been recorded successfully.', 'The Safety/Admin team has also been notified.'],
            actions: ['Open Safety Core to review the issue details and follow-up status.'],
        },
        TemporaryUpdated: {
            subject: `[Safety Patrol] Temporary action updated #${issueId}`,
            title: 'Temporary action updated',
            tone: 'warning',
            intro: isAdmin
                ? ['A temporary action was recorded for this Safety Patrol issue.']
                : ['A temporary action was recorded for the Safety Patrol issue you opened.'],
            actions: ['Open Safety Core to review the temporary action and continue tracking until final close.'],
        },
        IssueClosed: {
            subject: `[Safety Patrol] Issue closed #${issueId}`,
            title: 'Safety Patrol issue closed',
            tone: 'completed',
            intro: isAdmin
                ? ['This Safety Patrol issue has been closed.']
                : ['The Safety Patrol issue you opened has been closed.'],
            actions: ['Open Safety Core if you need to review the final corrective action.'],
        },
        CloseRequested: {
            subject: `[Safety Patrol] Close approval requested #${issueId}`,
            title: 'Safety Patrol close approval requested',
            tone: 'pending',
            intro: ['A Safety Patrol issue close request is waiting for Admin approval.'],
            actions: ['Open Safety Patrol to review the final action and approve or reject the close request.'],
        },
        CloseApproved: {
            subject: `[Safety Patrol] Close request approved #${issueId}`,
            title: 'Safety Patrol close request approved',
            tone: 'completed',
            intro: recipientKind === 'requester'
                ? ['Your Safety Patrol close request has been approved.']
                : ['The Safety Patrol issue you opened has been approved for close.'],
            actions: ['Open Safety Core if you need to review the final corrective action.'],
        },
        CloseRejected: {
            subject: `[Safety Patrol] Close request rejected #${issueId}`,
            title: 'Safety Patrol close request rejected',
            tone: 'rejected',
            intro: recipientKind === 'requester'
                ? ['Your Safety Patrol close request has been rejected. Please review the reason and update the corrective action.']
                : ['The Safety Patrol close request for the issue you opened has been rejected.'],
            actions: ['Open Safety Patrol to review the rejection reason and follow-up action.'],
        },
    };
    const cfg = eventConfig[eventType] || eventConfig.IssueCreated;
    const reporter = issue?.ReporterName || issue?.ReporterID || issue?.FoundByTeam || '-';
    const actorName = actor?.name || actor?.EmployeeName || actor?.id || '-';
    const details = [
        { label: 'Issue ID', value: issueId ? `#${issueId}` : '-', highlight: true },
        { label: 'Status', value: issue?.CurrentStatus || '-' },
        { label: 'Rank', value: issue?.Rank || '-' },
        { label: 'STOP Type', value: issueMultiDisplay(issue?.HazardType) },
        { label: 'Area', value: issue?.Area || '-' },
        { label: 'Machine / Location', value: issue?.MachineName || '-' },
        { label: 'Hazard Detail', value: issue?.HazardDescription || '-' },
        { label: 'Responsible', value: [issueMultiDisplay(issue?.ResponsibleDept, ''), issueMultiDisplay(issue?.ResponsibleUnit, '')].filter(Boolean).join(' / ') || '-' },
        { label: 'Found Date', value: formatIssueEmailDate(issue?.DateFound) },
        { label: 'Due Date', value: formatIssueEmailDate(issue?.DueDate), highlight: Boolean(issue?.DueDate) },
        { label: 'Finished Date', value: formatIssueEmailDate(issue?.FinishDate) },
        { label: 'Opened By', value: reporter },
        { label: 'Actor', value: actorName },
    ];
    if (eventType === 'TemporaryUpdated') details.push({ label: 'Temporary Action', value: issue?.TempDescription || '-', highlight: true });
    if (['IssueClosed', 'CloseRequested', 'CloseApproved', 'CloseRejected'].includes(eventType)) {
        details.push({ label: 'Final Action', value: issue?.ActionDescription || '-', highlight: true });
        details.push({ label: 'Close Approval', value: issue?.CloseApprovalStatus || '-', highlight: true });
        details.push({ label: 'Close Requested By', value: issue?.CloseRequesterName || issue?.CloseRequestedBy || '-' });
    }
    if (eventType === 'CloseRejected') details.push({ label: 'Reject Reason', value: issue?.CloseRejectReason || '-', highlight: true });

    const rendered = buildHiyariEmail({
        title: cfg.title,
        kicker: 'SAFETY PATROL ISSUE',
        moduleLabel: 'Safety Patrol Module',
        tone: cfg.tone,
        greeting: isAdmin ? 'Dear Safety Admin,' : `Dear ${recipientKind === 'requester' ? (issue?.CloseRequesterName || 'Safety Patrol user') : (issue?.ReporterName || 'Safety Patrol user')},`,
        intro: cfg.intro,
        details,
        actions: cfg.actions,
        footerNote: 'This is an automated Safety Patrol issue notification from TSH Safety Core Activity System.',
    });
    return { subject: cfg.subject, text: rendered.text, html: rendered.html };
}

async function sendPatrolIssueOutboxItem(outboxId) {
    const [[item]] = await db.query('SELECT * FROM Patrol_EmailOutbox WHERE id=? LIMIT 1', [outboxId]);
    if (!item) return { status: 'Missing' };
    if (!smtpConfigured()) {
        await db.query("UPDATE Patrol_EmailOutbox SET Status='Queued', Error=? WHERE id=?", ['SMTP not configured', outboxId]).catch(() => {});
        return { status: 'Queued', sent: false, reason: 'SMTP not configured' };
    }
    try {
        await sendMail({ to: item.Recipients, subject: item.Subject, text: item.Body, html: item.HtmlBody });
        await db.query("UPDATE Patrol_EmailOutbox SET Status='Sent', SentAt=NOW(), Error=NULL WHERE id=?", [outboxId]);
        return { status: 'Sent', sent: true };
    } catch (err) {
        await db.query("UPDATE Patrol_EmailOutbox SET Status='Failed', Error=? WHERE id=?", [err.message || String(err), outboxId]).catch(() => {});
        return { status: 'Failed', sent: false, reason: err.message || String(err) };
    }
}

function buildPatrolLeaveEmail({ leave, eventType, actor, recipientKind }) {
    const isReviewer = recipientKind === 'reviewer';
    const employeeName = leave?.EmployeeName || leave?.EmployeeID || 'Safety Patrol user';
    const actorName = actor?.name || actor?.EmployeeName || actor?.id || leave?.ReviewerName || '-';
    const leaveId = leave?.id || leave?.ID || '';
    const status = String(leave?.Status || '').trim() || '-';
    const groupLabel = String(leave?.RosterGroup || '').replace(/_/g, ' ') || '-';
    const cfgMap = {
        PatrolLeaveSubmitted: {
            subject: `[Safety Patrol] Leave request submitted - ${employeeName}`,
            title: 'Safety Patrol leave request submitted',
            tone: status === 'Approved' ? 'completed' : 'pending',
            introUser: status === 'Approved'
                ? ['Your Safety Patrol leave request has been saved and approved automatically.']
                : ['Your Safety Patrol leave request has been submitted for Admin/Safety review.'],
            introReviewer: ['A Safety Patrol leave request is waiting for review.'],
            actions: ['Open Safety Patrol to review the leave request and schedule impact.'],
        },
        PatrolLeaveApproved: {
            subject: `[Safety Patrol] Leave request approved - ${employeeName}`,
            title: 'Safety Patrol leave request approved',
            tone: 'completed',
            introUser: ['Your Safety Patrol leave request has been approved.'],
            introReviewer: ['A Safety Patrol leave request has been approved.'],
            actions: ['Open Safety Patrol to review leave allowance and final coverage.'],
        },
        PatrolLeaveRejected: {
            subject: `[Safety Patrol] Leave request rejected - ${employeeName}`,
            title: 'Safety Patrol leave request rejected',
            tone: 'rejected',
            introUser: ['Your Safety Patrol leave request has been rejected. The scheduled round is no longer blocked as leave.'],
            introReviewer: ['A Safety Patrol leave request has been rejected.'],
            actions: ['Open Safety Patrol to review the request and schedule status.'],
        },
        PatrolLeaveCancelled: {
            subject: `[Safety Patrol] Leave request cancelled - ${employeeName}`,
            title: 'Safety Patrol leave request cancelled',
            tone: 'neutral',
            introUser: ['Your Safety Patrol leave request has been cancelled.'],
            introReviewer: ['A Safety Patrol leave request has been cancelled.'],
            actions: ['Open Safety Patrol to review the request and schedule status.'],
        },
    };
    const cfg = cfgMap[eventType] || cfgMap.PatrolLeaveSubmitted;
    const details = [
        { label: 'Leave ID', value: leaveId ? `#${leaveId}` : '-', highlight: true },
        { label: 'Employee', value: employeeName, highlight: true },
        { label: 'Employee ID', value: leave?.EmployeeID || '-' },
        { label: 'Department', value: leave?.Department || '-' },
        { label: 'Position', value: leave?.Position || '-' },
        { label: 'Roster Group', value: groupLabel },
        { label: 'Scheduled Date', value: dateOnly(leave?.ScheduledDate) || '-' },
        { label: 'Scheduled Session', value: leave?.ScheduledSessionID || '-' },
        { label: 'Leave Type', value: leave?.LeaveType || '-' },
        { label: 'Destination', value: leave?.Destination || '-' },
        { label: 'Reason', value: leave?.Reason || '-' },
        { label: 'Status', value: status, highlight: true },
        { label: 'Reviewer', value: leave?.ReviewerName || leave?.ReviewedBy || actorName || '-' },
        { label: 'Review Note', value: leave?.ReviewNote || '-' },
    ];
    const rendered = buildHiyariEmail({
        title: cfg.title,
        kicker: 'SAFETY PATROL LEAVE',
        moduleLabel: 'Safety Patrol Module',
        tone: cfg.tone,
        greeting: isReviewer ? 'Dear Safety Admin,' : `Dear ${employeeName},`,
        intro: isReviewer ? cfg.introReviewer : cfg.introUser,
        details,
        actions: cfg.actions,
        footerNote: 'This is an automated Safety Patrol leave notification from TSH Safety Core Activity System.',
    });
    return { subject: cfg.subject, text: rendered.text, html: rendered.html };
}

function patrolLeaveEventFromStatus(status) {
    const normalized = String(status || '').trim();
    if (normalized === 'Approved') return 'PatrolLeaveApproved';
    if (normalized === 'Rejected') return 'PatrolLeaveRejected';
    if (normalized === 'Cancelled') return 'PatrolLeaveCancelled';
    return 'PatrolLeaveSubmitted';
}

async function queuePatrolLeaveEmail({ leaveId, eventType, actor }) {
    const leave = await fetchPatrolLeaveForEmail(leaveId);
    if (!leave) return { queued: false, sent: false, reason: 'Leave request not found' };
    const employeeRecipients = uniqueEmailRecipients([leave.CompanyEmail])
        .map(email => ({ email, kind: 'employee', employeeId: leave.EmployeeID }));
    const reviewerRecipients = (await getPatrolLeaveReviewerEmails())
        .map(email => ({ email, kind: 'reviewer', employeeId: null }));
    const recipients = [...employeeRecipients, ...reviewerRecipients]
        .filter((recipient, index, rows) => rows.findIndex(item => item.email.toLowerCase() === recipient.email.toLowerCase()) === index);
    if (!recipients.length) return { queued: false, sent: false, reason: 'No valid email recipients' };
    const results = [];
    for (const recipient of recipients) {
        const mail = buildPatrolLeaveEmail({ leave, eventType, actor, recipientKind: recipient.kind });
        const [insert] = await db.query(
            `INSERT INTO Patrol_EmailOutbox (AttendanceID, EmployeeID, EventType, Recipients, Subject, Body, HtmlBody, Status)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, 'Queued')`,
            [recipient.employeeId, eventType, recipient.email, mail.subject, mail.text, mail.html || null]
        ).catch(err => {
            console.error('[patrol/leave-email] queue failed:', err.message);
            return [{}];
        });
        const outboxId = insert?.insertId || null;
        const sent = outboxId ? await sendPatrolIssueOutboxItem(outboxId) : { status: 'Failed', sent: false, reason: 'Queue insert failed' };
        results.push({ outboxId, recipient: recipient.kind, email: recipient.email, ...sent });
    }
    return {
        queued: results.some(item => item.outboxId),
        sent: results.some(item => item.sent),
        results,
    };
}

async function queuePatrolIssueEmail({ issueId, eventType, actor }) {
    await ensureEmployeeCompanyEmailColumn(db).catch(() => {});
    const issue = await fetchPatrolIssueForEmail(issueId);
    if (!issue) return { queued: false, sent: false, reason: 'Issue not found' };
    let recipientCandidates;
    if (eventType === 'CloseRequested') {
        recipientCandidates = (await getPatrolLeaveReviewerEmails())
            .map(email => ({ email, kind: 'admin', employeeId: null }));
    } else if (['CloseApproved', 'CloseRejected'].includes(eventType)) {
        recipientCandidates = [
            ...uniqueEmailRecipients([issue.CloseRequesterEmail]).map(email => ({ email, kind: 'requester', employeeId: issue.CloseRequestedBy || null })),
            ...uniqueEmailRecipients([issue.ReporterEmail]).map(email => ({ email, kind: 'reporter', employeeId: issue.ReporterID || null })),
        ];
    } else {
        recipientCandidates = [
            ...uniqueEmailRecipients([issue.ReporterEmail]).map(email => ({ email, kind: 'reporter', employeeId: issue.ReporterID || null })),
            ...(await getPatrolLeaveReviewerEmails()).map(email => ({ email, kind: 'admin', employeeId: null })),
        ];
    }
    const recipients = recipientCandidates
        .filter((recipient, index, rows) => rows.findIndex(item => item.email.toLowerCase() === recipient.email.toLowerCase()) === index);
    if (!recipients.length) return { queued: false, sent: false, reason: 'No valid email recipients' };
    const results = [];
    for (const recipient of recipients) {
        const mail = buildPatrolIssueEmail({ issue, eventType, actor, recipientKind: recipient.kind });
        const [insert] = await db.query(
            `INSERT INTO Patrol_EmailOutbox (AttendanceID, EmployeeID, EventType, Recipients, Subject, Body, HtmlBody, Status)
             VALUES (NULL, ?, ?, ?, ?, ?, ?, 'Queued')`,
            [recipient.employeeId, eventType, recipient.email, mail.subject, mail.text, mail.html || null]
        ).catch(err => {
            console.error('[patrol/issue-email] queue failed:', err.message);
            return [{}];
        });
        const outboxId = insert?.insertId || null;
        const sent = outboxId ? await sendPatrolIssueOutboxItem(outboxId) : { status: 'Failed', sent: false, reason: 'Queue insert failed' };
        results.push({ outboxId, recipient: recipient.kind, email: recipient.email, ...sent });
    }
    return {
        queued: results.some(item => item.outboxId),
        sent: results.some(item => item.sent),
        results,
    };
}

async function resolveTopScheduledSession(employeeId, date, requestedSessionId, options = {}) {
    let year = Number(String(date).slice(0, 4));
    const sid = String(requestedSessionId || '').trim();
    if (sid) {
        const [[candidate]] = await db.query(
            'SELECT YEAR(PatrolDate) AS ScheduledYear FROM Patrol_Sessions WHERE SessionID=? LIMIT 1',
            [sid]
        );
        if (candidate?.ScheduledYear) year = Number(candidate.ScheduledYear);
    }
    const sessions = await topManagementSessionsForEmployee(employeeId, year);
    const map = new Map(sessions.map(s => [String(s.id), s]));
    let session = null;
    if (sid) {
        session = map.get(sid);
        if (!session) {
            const err = new Error('Selected schedule is not valid for this employee.');
            err.statusCode = 400;
            throw err;
        }
        const scheduledDate = dateOnly(session.PatrolDate);
        if (!options.checkinV2Enabled && String(date).slice(0, 7) !== scheduledDate.slice(0, 7)) {
            const err = new Error('Makeup patrol must be linked to a scheduled round in the same month.');
            err.statusCode = 400;
            throw err;
        }
        if (options.checkinV2Enabled && options.mode === 'scheduled' && scheduledDate !== date) {
            const err = new Error('Scheduled patrol must use a round assigned for today. Choose Makeup for an earlier round.');
            err.statusCode = 400;
            err.code = 'PATROL_SCHEDULE_DATE_MISMATCH';
            throw err;
        }
        if (options.checkinV2Enabled && options.mode === 'makeup' && scheduledDate > date) {
            const err = new Error('Makeup patrol cannot complete a future scheduled round.');
            err.statusCode = 400;
            err.code = 'PATROL_FUTURE_MAKEUP_NOT_ALLOWED';
            throw err;
        }
    } else {
        const matches = sessions.filter(s => dateOnly(s.PatrolDate) === date);
        if (matches.length === 1) session = matches[0];
        else if (options.checkinV2Enabled && options.mode === 'scheduled' && matches.length > 1) {
            const err = new Error('More than one Patrol round is scheduled today. Select the round to check in.');
            err.statusCode = 409;
            err.code = 'PATROL_SESSION_SELECTION_REQUIRED';
            throw err;
        }
    }
    if (session) {
        const [[existing]] = await db.query(
            'SELECT id FROM Patrol_Attendance WHERE UserID=? AND ScheduledSessionID=? LIMIT 1',
            [employeeId, session.id]
        );
        const [[legacyDate]] = await db.query(
            `SELECT COUNT(*) AS count FROM Patrol_Attendance
             WHERE UserID=? AND DATE(PatrolDate)=?
               AND (ScheduledSessionID IS NULL OR ScheduledSessionID='') AND IdempotencyKey IS NULL`,
            [employeeId, dateOnly(session.PatrolDate)]
        );
        const sameDateSessions = sessions.filter(item => dateOnly(item.PatrolDate) === dateOnly(session.PatrolDate));
        const legacySlot = sameDateSessions.findIndex(item => String(item.id) === String(session.id));
        const completedByLegacy = legacySlot >= 0 && legacySlot < Number(legacyDate?.count || 0);
        if (existing || completedByLegacy) {
            const err = new Error('Selected schedule is already completed.');
            err.statusCode = 409;
            throw err;
        }
        const [[leave]] = await db.query(
            "SELECT id FROM Patrol_Leave_Requests WHERE EmployeeID=? AND RosterGroup='top_management' AND ScheduledSessionID=? AND Status IN ('Pending','Approved') LIMIT 1",
            [employeeId, session.id]
        );
        if (leave) {
            const err = new Error('Selected schedule already has approved leave.');
            err.statusCode = 409;
            throw err;
        }
    }
    return { session, sessions };
}

async function buildTopManagementAttendanceDetail(employeeId, year) {
    const [[employee]] = await db.query(
        'SELECT EmployeeID,EmployeeName,Department,Unit,Position FROM Employees WHERE EmployeeID=? LIMIT 1',
        [employeeId]
    );
    if (!employee) {
        const err = new Error('Employee not found.');
        err.statusCode = 404;
        throw err;
    }
    const [[roster]] = await db.query(
        "SELECT id AS RosterID,TargetPerYear,SortOrder FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='top_management' LIMIT 1",
        [employeeId]
    );
    if (!roster) {
        const err = new Error('Employee is not in Top & Management roster.');
        err.statusCode = 404;
        throw err;
    }
    const activityTarget = await patrolActivityTargetForEmployee(employeeId, employee, 'patrol', year);
    const passPct = Number(activityTarget?.passPct || 80);
    const sessions = await topManagementSessionsForEmployee(employeeId, year);
    const leaveRows = await patrolLeaveRows(employeeId, 'top_management', year);
    const [attendance] = await db.query(
        `SELECT pa.id,pa.PatrolDate,pa.CheckinAt,pa.PatrolType,pa.Area,pa.Notes,pa.RecordedBy,pa.ScheduledSessionID,(pa.IdempotencyKey IS NOT NULL) AS IsV2Request,e.EmployeeName AS RecordedByName
         FROM Patrol_Attendance pa
         LEFT JOIN Employees e ON e.EmployeeID=pa.RecordedBy
         WHERE pa.UserID=? AND YEAR(pa.PatrolDate)=?
         ORDER BY pa.PatrolDate,pa.id`,
        [employeeId, year]
    );
    const records = attendance.map(a => ({
        ...a,
        PatrolDate: dateOnly(a.PatrolDate),
        mode: !a.RecordedBy || String(a.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
    }));
    let linkedAttendance = [];
    const sessionIds = sessions.map(session => String(session.id));
    if (sessionIds.length) {
        [linkedAttendance] = await db.query(
            `SELECT pa.id,pa.PatrolDate,pa.CheckinAt,pa.PatrolType,pa.Area,pa.Notes,pa.RecordedBy,pa.ScheduledSessionID,(pa.IdempotencyKey IS NOT NULL) AS IsV2Request,e.EmployeeName AS RecordedByName
               FROM Patrol_Attendance pa
               LEFT JOIN Employees e ON e.EmployeeID=pa.RecordedBy
              WHERE pa.UserID=? AND pa.ScheduledSessionID IN (${sessionIds.map(() => '?').join(',')})
              ORDER BY pa.PatrolDate,pa.id`,
            [employeeId, ...sessionIds]
        );
    }
    const scheduleRecords = [...new Map(
        [...records, ...linkedAttendance.map(a => ({
            ...a,
            PatrolDate: dateOnly(a.PatrolDate),
            mode: !a.RecordedBy || String(a.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
        }))].map(record => [Number(record.id), record])
    ).values()];
    const attByDate = {};
    const attBySession = {};
    scheduleRecords.forEach(a => {
        if (!attByDate[a.PatrolDate]) attByDate[a.PatrolDate] = [];
        attByDate[a.PatrolDate].push(a);
        if (a.ScheduledSessionID) {
            const sid = String(a.ScheduledSessionID);
            if (!attBySession[sid]) attBySession[sid] = [];
            attBySession[sid].push(a);
        }
    });
    const cutoff = patrolCutoffDate(year);
    const periods = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, required: 0, completed: 0, missed: 0, upcoming: 0, items: [] }));
    let requiredToDate = 0;
    let completedScheduled = 0;
    const legacyAttendanceByDate = Object.fromEntries(
        Object.entries(attByDate).map(([date, dateRecords]) => [date, dateRecords.filter(r => !r.ScheduledSessionID && !r.IsV2Request)])
    );
    const schedule = sessions.map(s => {
        const date = dateOnly(s.PatrolDate);
        const month = Number(date.slice(5, 7));
        const sessionRecords = attBySession[String(s.id)] || [];
        const dateRecords = sessionRecords.length ? [] : (legacyAttendanceByDate[date] || []).splice(0, 1);
        const itemRecords = [...sessionRecords, ...dateRecords].map(r => ({
            ...r,
            scheduledDate: date,
            actualDate: dateOnly(r.PatrolDate),
            isMakeup: Boolean(r.ScheduledSessionID) && dateOnly(r.PatrolDate) !== date,
        }));
        const done = Boolean(itemRecords.length);
        const due = date <= cutoff;
        const status = done ? 'completed' : due ? 'missed' : 'upcoming';
        if (due) requiredToDate++;
        if (done) completedScheduled++;
        const item = {
            date,
            status,
            sessionId: s.id,
            patrolRound: Number(s.PatrolRound || 0),
            teamId: Number(s.TeamID || 0),
            teamName: s.TeamName || '',
            areaName: s.AreaName || '',
            areaCode: s.AreaCode || '',
            records: itemRecords,
        };
        const p = periods[month - 1];
        p.required++;
        if (status === 'completed') p.completed++;
        else if (status === 'missed') p.missed++;
        else p.upcoming++;
        p.items.push(item);
        return item;
    });
    const scheduleWithLeave = attachLeaveToScheduledItems(schedule, leaveRows);
    const scheduledDates = new Set(schedule.map(s => s.date));
    const extraRecords = records.filter(r => !r.ScheduledSessionID && (r.IsV2Request || !scheduledDates.has(r.PatrolDate)));
    const actualActivity = patrolActualActivity(records, new Map(sessions.map(session => [String(session.id), session])));
    const yearlyTarget = Number(roster.TargetPerYear || 0);
    const leaveStats = patrolLeaveStats({
        requiredToDate,
        yearlyTarget,
        checkedToDate: completedScheduled,
        checkedYear: records.length,
        leaveRows,
        passPct,
    });
    const phase3 = patrolPhase3Metrics({
        requiredToDate,
        yearlyTarget,
        checkedToDate: completedScheduled,
        checkedYear: records.length,
        leaveStats,
        passPct,
    });
    return {
        mode: 'scheduled_calendar',
        group: 'top_management',
        year,
        employee,
        roster: { RosterID: Number(roster.RosterID), TargetPerYear: yearlyTarget },
        summary: {
            completed: records.length,
            completedScheduled,
            requiredToDate,
            yearlyTarget,
            passPct,
            leave: leaveStats,
            scheduledTotal: sessions.length,
            missingToDate: Math.max(0, requiredToDate - completedScheduled),
            upcoming: Math.max(0, sessions.length - requiredToDate),
            progressToDatePct: patrolPct(completedScheduled, requiredToDate),
            fullYearPct: patrolPct(records.length, yearlyTarget),
            acceptedCoverageToDatePct: leaveStats.acceptedCoverageToDatePct,
            acceptedCoverageYearPct: leaveStats.acceptedCoverageYearPct,
            actualWalks: actualActivity.total,
            scheduledNormalWalks: actualActivity.scheduledNormal,
            makeupWalks: actualActivity.makeup,
            extraWalks: actualActivity.extra,
            ...phase3,
        },
        periods,
        schedule: scheduleWithLeave,
        leaveRequests: leaveRows,
        records,
        extraRecords,
        actualActivity,
    };
}

async function buildSupervisorAttendanceDetail(employeeId, year, options = {}) {
    const [[employee]] = await db.query(
        `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,mp.IsSupervisorPatrol
         FROM Employees e
         LEFT JOIN Master_Positions mp ON mp.Name=e.Position
         WHERE e.EmployeeID=? LIMIT 1`,
        [employeeId]
    );
    if (!employee) {
        const err = new Error('Employee not found.');
        err.statusCode = 404;
        throw err;
    }
    const [[roster]] = await db.query(
        "SELECT id AS RosterID,TargetPerYear,SortOrder FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
        [employeeId]
    );
    if (!roster && (!options.allowPositionSupervisor || !employee?.IsSupervisorPatrol)) {
        const err = new Error('Employee is not in Sec. & Supervisor roster.');
        err.statusCode = 404;
        throw err;
    }
    const activityTarget = await patrolActivityTargetForEmployee(employeeId, employee, 'patrol', year);
    const fallbackTarget = Number(roster?.TargetPerYear || patrolSupervisorMonthlyRequirement() * 12);
    const yearlyTarget = Number(activityTarget?.yearlyTarget || fallbackTarget);
    const passPct = Number(activityTarget?.passPct || 80);
    const targetSource = activityTarget?.source || (roster ? 'patrol_roster' : 'position_schedule');
    const dueMonth = patrolDueMonth(year);
    const leaveRows = await patrolLeaveRows(employeeId, 'supervisor', year);
    const [rows] = await db.query(
        `SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.PatrolType,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName
         FROM Patrol_Self_Checkin sc
         LEFT JOIN Employees e ON e.EmployeeID=sc.RecordedBy
         WHERE sc.EmployeeID=? AND sc.Year=?
         ORDER BY sc.CheckinDate,sc.id`,
        [employeeId, year]
    );
    const records = rows.map(r => ({
        ...r,
        CheckinDate: dateOnly(r.CheckinDate),
        PatrolType: r.PatrolType || 'normal',
        mode: !r.RecordedBy || String(r.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
    }));
    const actualRecordsByMonth = {};
    records.forEach(r => {
        const m = Number(r.Month || r.CheckinDate.slice(5, 7));
        if (!actualRecordsByMonth[m]) actualRecordsByMonth[m] = [];
        actualRecordsByMonth[m].push(r);
    });
    const schedule = attachLeaveToScheduledItems(
        attachSupervisorRecordsToSchedule(records, await supervisorScheduleSlotsForYear(year)),
        leaveRows
    );
    const scheduleByMonth = {};
    schedule.forEach(item => {
        const month = Number(dateOnly(item.date || item.PatrolDate).slice(5, 7));
        if (!scheduleByMonth[month]) scheduleByMonth[month] = [];
        scheduleByMonth[month].push(item);
    });
    const scheduledRequirementByMonth = {};
    let scheduledYearlyTarget = 0;
    for (let month = 1; month <= 12; month++) {
        const monthRequirement = patrolSupervisorRequirementFromScheduleCount((scheduleByMonth[month] || []).length);
        scheduledRequirementByMonth[month] = monthRequirement;
        scheduledYearlyTarget += monthRequirement;
    }
    const effectiveYearlyTarget = scheduledYearlyTarget || yearlyTarget;
    let requiredToDate = 0;
    let completedToDate = 0;
    const periods = Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        const monthItems = scheduleByMonth[month] || [];
        const monthRecords = monthItems.flatMap(item => Array.isArray(item.records) ? item.records : []);
        const completed = monthItems.filter(item => item.isCompleted).length;
        const isDue = month <= dueMonth;
        const monthRequirement = scheduledRequirementByMonth[month] || 0;
        const required = isDue ? monthRequirement : 0;
        if (isDue) {
            requiredToDate += monthRequirement;
            completedToDate += Math.min(completed, monthRequirement);
        }
        const status = !isDue ? 'upcoming' : completed >= monthRequirement ? 'completed' : completed > 0 ? 'partial' : 'missed';
        return {
            month,
            required,
            monthlyRequirement: monthRequirement,
            completed,
            missing: isDue ? Math.max(0, monthRequirement - completed) : 0,
            status,
            records: monthRecords,
            actualRecords: actualRecordsByMonth[month] || [],
            items: monthItems,
        };
    });
    const currentMonth = Math.min(12, Math.max(1, patrolDueMonth(year) || 1));
    const openSchedule = schedule.filter(item => !item.isCompleted && !item.isLeave && !item.isLeavePending);
    const leaveStats = patrolLeaveStats({
        requiredToDate,
        yearlyTarget: effectiveYearlyTarget,
        checkedToDate: completedToDate,
        checkedYear: records.length,
        leaveRows,
        passPct,
    });
    const phase3 = patrolPhase3Metrics({
        requiredToDate,
        yearlyTarget: effectiveYearlyTarget,
        checkedToDate: completedToDate,
        checkedYear: records.length,
        leaveStats,
        passPct,
    });
    return {
        mode: 'scheduled_quota',
        scheduleMode: 'scheduled',
        group: 'supervisor',
        year,
        employee,
        roster: {
            RosterID: roster ? Number(roster.RosterID) : null,
            TargetPerYear: effectiveYearlyTarget,
            ConfiguredTargetPerYear: yearlyTarget,
        },
        monthlyRequirement: scheduledRequirementByMonth[currentMonth] || 0,
        passPct,
        targetSource,
        summary: {
            completed: records.length,
            completedToDateCapped: completedToDate,
            requiredToDate,
            yearlyTarget: effectiveYearlyTarget,
            configuredYearlyTarget: yearlyTarget,
            passPct,
            leave: leaveStats,
            targetSource,
            scheduledTotal: schedule.length,
            missingToDate: Math.max(0, requiredToDate - completedToDate),
            upcomingMonths: Math.max(0, 12 - dueMonth),
            progressToDatePct: patrolPct(completedToDate, requiredToDate),
            fullYearPct: patrolPct(records.length, effectiveYearlyTarget),
            acceptedCoverageToDatePct: leaveStats.acceptedCoverageToDatePct,
            acceptedCoverageYearPct: leaveStats.acceptedCoverageYearPct,
            ...phase3,
        },
        periods,
        schedule,
        openSchedule,
        leaveRequests: leaveRows,
        records,
    };
}

async function buildFlexibleSelfPatrolPayload(employeeId, year, month, employee = {}) {
    const { monthlyRequirement, targetSource } = await getPatrolFlexibleMonthlyRequirement();
    const [areas] = await db.query('SELECT id, Name, Code FROM Patrol_Areas ORDER BY SortOrder, id');
    const [rows] = await db.query(
        `SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.PatrolType,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName
         FROM Patrol_Self_Checkin sc
         LEFT JOIN Employees e ON e.EmployeeID=sc.RecordedBy
         WHERE sc.EmployeeID=? AND sc.Year=?
         ORDER BY sc.CheckinDate,sc.id`,
        [employeeId, year]
    );
    const records = rows.map(r => ({
        ...r,
        CheckinDate: dateOnly(r.CheckinDate),
        PatrolType: r.PatrolType || 'normal',
        mode: !r.RecordedBy || String(r.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
    }));
    const monthlyRecords = records.filter(r => Number(r.Month || r.CheckinDate.slice(5, 7)) === Number(month));
    const recordsByDate = {};
    monthlyRecords.forEach(record => {
        const date = dateOnly(record.CheckinDate);
        if (!recordsByDate[date]) recordsByDate[date] = [];
        recordsByDate[date].push({
            ...record,
            actualDate: date,
            scheduledDate: date,
            isMakeup: false,
            source: String(record.ScheduledSessionID || '').startsWith('FLEX:') ? 'flexible' : 'self',
        });
    });
    const completed = monthlyRecords.length;
    const quotaFull = completed >= monthlyRequirement;
    const calendarDays = daysInMonth(year, month).map(date => {
        const dayRecords = recordsByDate[date] || [];
        const isCompleted = dayRecords.length > 0;
        return {
            date,
            ScheduledDate: date,
            ScheduledSessionID: `FLEX:${employeeId}:${date}`,
            status: isCompleted ? 'checked' : quotaFull ? 'locked' : 'open',
            isCompleted,
            isOpen: !isCompleted && !quotaFull,
            records: dayRecords,
        };
    });
    const yearlyCompleted = records.length;
    return {
        isSupervisorPatrol: true,
        scheduleMode: 'flexible',
        position: employee.Position || '',
        checkins: monthlyRecords,
        target: monthlyRequirement,
        monthlyRequirement,
        completed,
        remaining: Math.max(0, monthlyRequirement - completed),
        periodStatus: quotaFull ? 'completed' : completed > 0 ? 'partial' : 'open',
        yearlyTarget: monthlyRequirement * 12,
        yearlyCompleted,
        targetSource,
        allowedAreas: areas.map(a => ({ id: Number(a.id), Name: a.Name || '', Code: a.Code || '' })),
        calendarDays,
        schedule: [],
        openSchedule: [],
    };
}

async function buildFlexibleSupervisorAttendanceDetail(employeeId, year, employee = {}) {
    const { monthlyRequirement, targetSource } = await getPatrolFlexibleMonthlyRequirement();
    const dueMonth = patrolDueMonth(year);
    const [areas] = await db.query('SELECT id, Name, Code FROM Patrol_Areas ORDER BY SortOrder, id');
    const [rows] = await db.query(
        `SELECT sc.id,sc.CheckinDate,sc.Location,sc.Notes,sc.Year,sc.Month,sc.PatrolType,sc.RecordedBy,sc.ScheduledSessionID,e.EmployeeName AS RecordedByName
         FROM Patrol_Self_Checkin sc
         LEFT JOIN Employees e ON e.EmployeeID=sc.RecordedBy
         WHERE sc.EmployeeID=? AND sc.Year=?
         ORDER BY sc.CheckinDate,sc.id`,
        [employeeId, year]
    );
    const records = rows.map(r => ({
        ...r,
        CheckinDate: dateOnly(r.CheckinDate),
        PatrolType: r.PatrolType || 'normal',
        mode: !r.RecordedBy || String(r.RecordedBy) === employeeId ? 'self' : 'admin_recorded',
    }));
    const recordsByMonth = {};
    const recordsByDate = {};
    records.forEach(record => {
        const date = dateOnly(record.CheckinDate);
        const month = Number(record.Month || date.slice(5, 7));
        if (!recordsByMonth[month]) recordsByMonth[month] = [];
        recordsByMonth[month].push(record);
        if (!recordsByDate[date]) recordsByDate[date] = [];
        recordsByDate[date].push({
            ...record,
            actualDate: date,
            scheduledDate: date,
            isMakeup: false,
            source: String(record.ScheduledSessionID || '').startsWith('FLEX:') ? 'flexible' : 'self',
        });
    });
    let requiredToDate = 0;
    let completedToDate = 0;
    const periods = Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1;
        const monthRecords = recordsByMonth[month] || [];
        const completed = monthRecords.length;
        const quotaFull = completed >= monthlyRequirement;
        const isDue = month <= dueMonth;
        if (isDue) {
            requiredToDate += monthlyRequirement;
            completedToDate += Math.min(completed, monthlyRequirement);
        }
        const items = daysInMonth(year, month).map(date => {
            const dayRecords = recordsByDate[date] || [];
            const isCompleted = dayRecords.length > 0;
            return {
                date,
                ScheduledDate: date,
                ScheduledSessionID: `FLEX:${employeeId}:${date}`,
                status: isCompleted ? 'checked' : quotaFull ? 'locked' : 'open',
                isCompleted,
                isOpen: !isCompleted && !quotaFull,
                records: dayRecords,
            };
        });
        return {
            month,
            required: isDue ? monthlyRequirement : 0,
            monthlyRequirement,
            completed,
            missing: isDue ? Math.max(0, monthlyRequirement - completed) : 0,
            status: !isDue ? 'upcoming' : quotaFull ? 'completed' : completed > 0 ? 'partial' : 'missed',
            records: monthRecords,
            actualRecords: monthRecords,
            items,
        };
    });
    const openSchedule = periods.flatMap(p => p.items || []).filter(item => item.status === 'open' && !item.isCompleted);
    return {
        mode: 'flexible_quota',
        group: 'supervisor',
        scheduleMode: 'flexible',
        year,
        employee,
        roster: {
            RosterID: null,
            TargetPerYear: monthlyRequirement * 12,
            ConfiguredTargetPerYear: monthlyRequirement * 12,
        },
        monthlyRequirement,
        targetSource,
        allowedAreas: areas.map(a => ({ id: Number(a.id), Name: a.Name || '', Code: a.Code || '' })),
        summary: {
            completed: records.length,
            completedToDateCapped: completedToDate,
            requiredToDate,
            yearlyTarget: monthlyRequirement * 12,
            configuredYearlyTarget: monthlyRequirement * 12,
            targetSource,
            scheduledTotal: 0,
            missingToDate: Math.max(0, requiredToDate - completedToDate),
            upcomingMonths: Math.max(0, 12 - dueMonth),
            progressToDatePct: patrolPct(completedToDate, requiredToDate),
            fullYearPct: patrolPct(records.length, monthlyRequirement * 12),
        },
        periods,
        schedule: [],
        openSchedule,
        records,
    };
}

function parseFlexibleScheduledSessionId(value) {
    const match = String(value || '').trim().match(/^FLEX:([^:]+):(\d{4}-\d{2}-\d{2})$/);
    if (!match) return null;
    const date = parseDateInput(match[2]);
    return date ? { employeeId: match[1], date } : null;
}

async function resolveFlexibleSelfCheckin(employeeId, inputDate, scheduledSessionId, location) {
    const parsed = parseFlexibleScheduledSessionId(scheduledSessionId);
    if (!parsed) {
        const err = new Error('Flexible ScheduledSessionID is invalid.');
        err.statusCode = 400;
        throw err;
    }
    if (String(parsed.employeeId) !== String(employeeId)) {
        const err = new Error('Flexible ScheduledSessionID does not match current user.');
        err.statusCode = 403;
        throw err;
    }
    if (parsed.date !== inputDate) {
        const err = new Error('Flexible check-in date must match ScheduledSessionID date.');
        err.statusCode = 400;
        throw err;
    }
    const [[emp]] = await db.query(
        `SELECT mp.IsSupervisorPatrol
         FROM Employees e
         LEFT JOIN Master_Positions mp ON mp.Name = e.Position
         WHERE e.EmployeeID=? LIMIT 1`,
        [employeeId]
    );
    if (!emp?.IsSupervisorPatrol) {
        const err = new Error('Position is not allowed for flexible Self-Patrol.');
        err.statusCode = 403;
        throw err;
    }
    const [[roster]] = await db.query(
        "SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
        [employeeId]
    );
    if (roster) {
        const err = new Error('Flexible Self-Patrol is not available for scheduled supervisor roster members.');
        err.statusCode = 400;
        throw err;
    }
    const areaInput = String(location || '').trim();
    if (!areaInput) {
        const err = new Error('Location must be selected from Patrol_Areas.');
        err.statusCode = 400;
        throw err;
    }
    const [[area]] = await db.query(
        'SELECT id,Name,Code FROM Patrol_Areas WHERE CAST(id AS CHAR)=? OR Name=? OR Code=? LIMIT 1',
        [areaInput, areaInput, areaInput]
    );
    if (!area) {
        const err = new Error('Location must be selected from Patrol_Areas.');
        err.statusCode = 400;
        throw err;
    }
    const year = Number(parsed.date.slice(0, 4));
    const month = Number(parsed.date.slice(5, 7));
    const { monthlyRequirement } = await getPatrolFlexibleMonthlyRequirement();
    const [[duplicate]] = await db.query(
        `SELECT id FROM Patrol_Self_Checkin
         WHERE EmployeeID=? AND DATE(CheckinDate)=? AND ScheduledSessionID LIKE 'FLEX:%'
         LIMIT 1`,
        [employeeId, parsed.date]
    );
    if (duplicate) {
        const err = new Error('Flexible Self-Patrol already checked in for this date.');
        err.statusCode = 409;
        throw err;
    }
    const [[quota]] = await db.query(
        'SELECT COUNT(*) AS count FROM Patrol_Self_Checkin WHERE EmployeeID=? AND Year=? AND Month=?',
        [employeeId, year, month]
    );
    if (Number(quota?.count || 0) >= monthlyRequirement) {
        const err = new Error('Flexible Self-Patrol monthly quota is already completed.');
        err.statusCode = 409;
        throw err;
    }
    return {
        date: parsed.date,
        session: {
            id: String(scheduledSessionId).trim(),
            PatrolDate: parsed.date,
            AreaName: area.Name || area.Code || areaInput,
            AreaCode: area.Code || '',
        },
    };
}

router.get('/attendance-detail', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const employeeId = String(req.query.employeeId || req.user.id || '').trim();
    const group = String(req.query.group || 'top_management').trim();
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required.' });
    try {
        if (!['top_management', 'supervisor'].includes(group)) {
            return res.status(400).json({ success: false, message: 'group is invalid.' });
        }
        if (!isAdminUser(req) && employeeId !== req.user.id && !(await canViewRosterAttendanceDetail(employeeId, group))) {
            return res.status(403).json({ success: false, message: 'Permission denied.' });
        }
        if (group === 'supervisor') {
            return res.json({ success: true, data: await buildSupervisorAttendanceDetail(employeeId, year, { allowPositionSupervisor: true }) });
        }
        if (group === 'top_management') {
            return res.json({ success: true, data: await buildTopManagementAttendanceDetail(employeeId, year) });
        }
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
        sendPatrolError(res, err);
    }
});

router.get('/leave-requests', async (req, res) => {
    try {
        const group = String(req.query.group || req.query.RosterGroup || 'supervisor').trim();
        if (!['top_management', 'supervisor'].includes(group)) {
            return res.status(400).json({ success: false, message: 'group is invalid.' });
        }
        const reviewer = canReviewPatrolLeave(req);
        const wantsAll = reviewer && ['1', 'true', 'yes'].includes(String(req.query.all || req.query.allEmployees || '').trim().toLowerCase());
        const requestedEmployeeId = String(req.query.employeeId || req.query.EmployeeID || '').trim();
        const employeeId = wantsAll ? '' : (reviewer && requestedEmployeeId ? requestedEmployeeId : String(req.user.id || '').trim());
        if (!employeeId && !wantsAll) return res.status(400).json({ success: false, message: 'employeeId is required.' });
        const year = parseInt(req.query.year, 10) || new Date().getFullYear();
        const status = String(req.query.status || '').trim();
        const rows = await patrolLeaveRows(employeeId, group, year, { status });
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.post('/leave-request', upload.single('Attachment'), async (req, res) => {
    const uploadedUrl = req.file?.path || req.file?.publicUrl || null;
    try {
        const bad = (message, statusCode = 400) => {
            const err = new Error(message);
            err.statusCode = statusCode;
            throw err;
        };
        const input = patrolLeaveInput(req.body || {});
        if (!['top_management', 'supervisor'].includes(input.group)) {
            bad('RosterGroup is invalid.');
        }
        const employeeId = isAdminUser(req) && input.employeeId ? input.employeeId : String(req.user.id || '').trim();
        if (!employeeId) bad('EmployeeID is required.');
        if (!input.scheduledSessionId && !input.scheduledDate) {
            bad('ScheduledSessionID or ScheduledDate is required.');
        }
        if (!input.reason) {
            bad('Reason is required.');
        }
        if (!uploadedUrl) {
            bad('Attachment is required.');
        }
        const resolved = await patrolLeaveScheduleForEmployee(employeeId, input.group, input.scheduledSessionId, input.scheduledDate);
        const sid = resolved.scheduledSessionId;
        const scheduledDate = resolved.scheduledDate;
        if (!sid || !scheduledDate) {
            bad('Selected schedule is invalid.');
        }
        const [[existing]] = await db.query(
            `SELECT id FROM Patrol_Leave_Requests
             WHERE EmployeeID=? AND RosterGroup=? AND ScheduledSessionID=? AND Status IN ('Pending','Approved')
             LIMIT 1`,
            [employeeId, input.group, sid]
        );
        if (existing) {
            bad('Selected schedule already has a leave request.', 409);
        }
        const status = canReviewPatrolLeave(req) ? 'Approved' : 'Pending';
        const reviewedBy = status === 'Approved' ? req.user.id : null;
        const reviewedAt = status === 'Approved' ? new Date() : null;
        const [insert] = await db.query(
            `INSERT INTO Patrol_Leave_Requests
             (EmployeeID,RosterGroup,ScheduledSessionID,ScheduledDate,LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,ReviewedBy,ReviewedAt)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [employeeId, input.group, sid, scheduledDate, input.leaveType, input.destination, input.reason, uploadedUrl, status, req.user.id, reviewedBy, reviewedAt]
        );
        const [[row]] = await db.query(
            `SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,DATE_FORMAT(ScheduledDate,'%Y-%m-%d') AS ScheduledDate,
                    LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,CreatedAt,ReviewedBy,ReviewNote,ReviewedAt
             FROM Patrol_Leave_Requests WHERE id=?`,
            [insert.insertId]
        );
        await logAudit(req, {
            module: 'patrol',
            action: 'SUBMIT_PATROL_LEAVE',
            targetType: 'Patrol_Leave_Requests',
            targetId: insert.insertId,
            detail: `Submit patrol leave ${employeeId} ${input.group} ${scheduledDate} -> ${status}`,
            metadata: { employeeId, group: input.group, scheduledSessionId: sid, scheduledDate, status },
        });
        const email = await queuePatrolLeaveEmail({ leaveId: insert.insertId, eventType: 'PatrolLeaveSubmitted', actor: req.user }).catch(err => ({ queued: false, sent: false, reason: err.message }));
        res.json({ success: true, message: status === 'Pending' ? 'Leave request submitted for review.' : 'Leave request saved.', data: row, email });
    } catch (err) {
        if (uploadedUrl) deleteLocalUpload(uploadedUrl);
        if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
        if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Selected schedule already has a leave request.' });
        sendPatrolError(res, err);
    }
});

router.patch('/leave-request/:id/review', async (req, res) => {
    try {
        if (!canReviewPatrolLeave(req)) {
            return res.status(403).json({ success: false, message: 'Permission denied. Admin/Safety access required.' });
        }
        const action = String(req.body?.action || req.body?.Status || req.body?.status || '').trim().toLowerCase();
        const statusMap = { approve: 'Approved', approved: 'Approved', reject: 'Rejected', rejected: 'Rejected', cancel: 'Cancelled', cancelled: 'Cancelled' };
        const nextStatus = statusMap[action];
        if (!nextStatus) return res.status(400).json({ success: false, message: 'Review action is invalid.' });
        const note = String(req.body?.ReviewNote || req.body?.reviewNote || req.body?.reason || '').trim();
        if (nextStatus === 'Rejected' && !note) {
            return res.status(400).json({ success: false, message: 'Reject reason is required.' });
        }
        const [[current]] = await db.query(
            `SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,DATE_FORMAT(ScheduledDate,'%Y-%m-%d') AS ScheduledDate,Status
             FROM Patrol_Leave_Requests WHERE id=? LIMIT 1`,
            [req.params.id]
        );
        if (!current) return res.status(404).json({ success: false, message: 'Not found.' });
        if (!['Pending', 'Approved'].includes(String(current.Status || '')) && nextStatus !== 'Cancelled') {
            return res.status(409).json({ success: false, message: 'This leave request is already reviewed.' });
        }
        await db.query(
            'UPDATE Patrol_Leave_Requests SET Status=?, ReviewedBy=?, ReviewNote=?, ReviewedAt=NOW() WHERE id=?',
            [nextStatus, req.user.id, note || null, req.params.id]
        );
        const [[row]] = await db.query(
            `SELECT id,EmployeeID,RosterGroup,ScheduledSessionID,DATE_FORMAT(ScheduledDate,'%Y-%m-%d') AS ScheduledDate,
                    LeaveType,Destination,Reason,AttachmentUrl,Status,CreatedBy,CreatedAt,ReviewedBy,ReviewNote,ReviewedAt
             FROM Patrol_Leave_Requests WHERE id=?`,
            [req.params.id]
        );
        await logAudit(req, {
            module: 'patrol',
            action: `REVIEW_PATROL_LEAVE_${nextStatus.toUpperCase()}`,
            targetType: 'Patrol_Leave_Requests',
            targetId: req.params.id,
            detail: `Review patrol leave ${current.EmployeeID} ${current.RosterGroup} ${current.ScheduledDate}: ${current.Status} -> ${nextStatus}`,
            metadata: { previousStatus: current.Status, nextStatus, note: note ? '[provided]' : null },
        });
        const email = await queuePatrolLeaveEmail({ leaveId: req.params.id, eventType: patrolLeaveEventFromStatus(nextStatus), actor: req.user }).catch(err => ({ queued: false, sent: false, reason: err.message }));
        res.json({ success: true, message: `Leave request ${nextStatus}.`, data: row, email });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.delete('/leave-request/:id', async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id,EmployeeID,AttachmentUrl FROM Patrol_Leave_Requests WHERE id=? LIMIT 1', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
        if (!isAdminUser(req) && String(row.EmployeeID) !== String(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Permission denied.' });
        }
        await db.query('DELETE FROM Patrol_Leave_Requests WHERE id=?', [req.params.id]);
        if (row.AttachmentUrl) deleteLocalUpload(row.AttachmentUrl);
        res.json({ success: true });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.get('/attendance-overview', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        const [members] = await db.query(`
            SELECT pr.id AS RosterID, pr.EmployeeID, pr.TargetPerYear,
                   e.EmployeeName AS Name, e.Position, e.Department
            FROM Patrol_Roster pr
            JOIN Employees e ON e.EmployeeID = pr.EmployeeID
            WHERE pr.RosterGroup = 'top_management'
            ORDER BY pr.SortOrder, e.EmployeeName
        `);
        const result = [];
        let requiredToDateTotal = 0;
        let completedToDateTotal = 0;
        let yearlyTargetTotal = 0;
        let fullYearCompletedTotal = 0;
        let scheduledTotal = 0;
        let missingToDateTotal = 0;
        let upcomingTotal = 0;
        let leaveYearTotal = 0;
        let allowedLeaveYearTotal = 0;
        let acceptedLeaveYearTotal = 0;
        let overLeaveYearTotal = 0;
        let acceptedCoverageToDateTotal = 0;
        let acceptedCoverageYearTotal = 0;
        let acceptedPassToDateTotal = 0;

        for (const m of members) {
            const detail = await buildTopManagementAttendanceDetail(String(m.EmployeeID), year);
            const summary = detail.summary || {};
            const leave = summary.leave || {};
            const requiredToDate = Number(summary.requiredToDate || 0);
            const completedToDate = Number(summary.completedScheduled || 0);
            const yearlyTarget = Number(summary.yearlyTarget || m.TargetPerYear || 0);
            const fullYearCompleted = Number(summary.completed || 0);
            const progressPct = patrolPct(completedToDate, requiredToDate);
            const fullYearPct = patrolPct(fullYearCompleted, yearlyTarget);
            requiredToDateTotal += requiredToDate;
            completedToDateTotal += completedToDate;
            yearlyTargetTotal += yearlyTarget;
            fullYearCompletedTotal += fullYearCompleted;
            scheduledTotal += Number(summary.scheduledTotal || 0);
            missingToDateTotal += Number(summary.missingToDate || 0);
            upcomingTotal += Number(summary.upcoming || 0);
            leaveYearTotal += Number(summary.leaveYear || leave.leaveYear || 0);
            allowedLeaveYearTotal += Number(summary.allowedLeaveYear || leave.allowedLeaveYear || 0);
            acceptedLeaveYearTotal += Number(summary.acceptedLeaveYear || leave.acceptedLeaveYear || 0);
            overLeaveYearTotal += Number(summary.overLeaveYear || leave.overLeaveYear || 0);
            acceptedCoverageToDateTotal += Number(summary.acceptedCoverageToDate || leave.acceptedCoverageToDate || completedToDate);
            acceptedCoverageYearTotal += Number(summary.acceptedCoverageYear || leave.acceptedCoverageYear || fullYearCompleted);
            if (summary.acceptedPassToDate) acceptedPassToDateTotal++;
            result.push({
                RosterID: m.RosterID,
                EmployeeID: m.EmployeeID,
                Name: m.Name,
                Position: m.Position,
                Department: m.Department,
                TargetPerYear: yearlyTarget,
                Year: year,
                Total: requiredToDate,
                Attended: completedToDate,
                Percent: progressPct,
                ProgressToDatePct: progressPct,
                FullYearPct: fullYearPct,
                fullYearPct: fullYearPct,
                RequiredToDate: requiredToDate,
                CompletedToDate: completedToDate,
                CompletedScheduled: completedToDate,
                ScheduledTotal: Number(summary.scheduledTotal || 0),
                MissingToDate: Number(summary.missingToDate || 0),
                Upcoming: Number(summary.upcoming || 0),
                YearlyTarget: yearlyTarget,
                FullYearCompleted: fullYearCompleted,
                PassPct: Number(summary.passPct || 80),
                PassThresholdToDate: Number(summary.passThresholdToDate || patrolPassThreshold(requiredToDate, summary.passPct || 80)),
                PassThresholdYear: Number(summary.passThresholdYear || patrolPassThreshold(yearlyTarget, summary.passPct || 80)),
                LeaveYear: Number(summary.leaveYear || leave.leaveYear || 0),
                AllowedLeaveYear: Number(summary.allowedLeaveYear || leave.allowedLeaveYear || 0),
                AcceptedLeaveYear: Number(summary.acceptedLeaveYear || leave.acceptedLeaveYear || 0),
                LeaveRemainingYear: Number(summary.leaveRemainingYear || leave.leaveRemainingYear || 0),
                OverLeaveYear: Number(summary.overLeaveYear || leave.overLeaveYear || 0),
                AcceptedCoverageToDate: Number(summary.acceptedCoverageToDate || leave.acceptedCoverageToDate || completedToDate),
                AcceptedCoverageYear: Number(summary.acceptedCoverageYear || leave.acceptedCoverageYear || fullYearCompleted),
                AcceptedCoverageToDatePct: Number(summary.acceptedCoverageToDatePct || leave.acceptedCoverageToDatePct || 0),
                AcceptedCoverageYearPct: Number(summary.acceptedCoverageYearPct || leave.acceptedCoverageYearPct || 0),
                ActualPassToDate: Boolean(summary.actualPassToDate),
                AcceptedPassToDate: Boolean(summary.acceptedPassToDate),
                FinalStatus: summary.finalStatus || 'Below target',
            });
        }

        const [latest] = await db.query(
            'SELECT MAX(PatrolDate) AS LatestDate FROM Patrol_Attendance WHERE YEAR(PatrolDate) = ?', [year]
        );

        res.json({
            success: true,
            data: {
                members: result,
                summary: {
                    totalSessions: requiredToDateTotal,
                    totalAttended: completedToDateTotal,
                    percent: patrolPct(completedToDateTotal, requiredToDateTotal),
                    progressToDatePct: patrolPct(completedToDateTotal, requiredToDateTotal),
                    requiredToDate: requiredToDateTotal,
                    completedToDate: completedToDateTotal,
                    scheduledTotal,
                    missingToDate: missingToDateTotal,
                    upcoming: upcomingTotal,
                    yearlyTargetTotal,
                    fullYearCompleted: fullYearCompletedTotal,
                    fullYearPct: patrolPct(fullYearCompletedTotal, yearlyTargetTotal),
                    leaveYearTotal,
                    allowedLeaveYearTotal,
                    acceptedLeaveYearTotal,
                    overLeaveYearTotal,
                    acceptedCoverageToDateTotal,
                    acceptedCoverageYearTotal,
                    acceptedCoverageToDatePct: patrolPct(acceptedCoverageToDateTotal, requiredToDateTotal),
                    acceptedCoverageYearPct: patrolPct(acceptedCoverageYearTotal, yearlyTargetTotal),
                    acceptedPassToDateTotal,
                    latestDate: latest[0]?.LatestDate || null,
                    year,
                },
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/member-attendance?employeeId=X&year=Y — รายการเดินตรวจรายบุคคล (สำหรับ spotlight modal)
router.get('/member-attendance', async (req, res) => {
    const { employeeId, year: yearStr } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ employeeId' });
    const year = parseInt(yearStr) || new Date().getFullYear();
    try {
        const [rows] = await db.query(`
            SELECT id, PatrolDate, PatrolType, Area, Notes
            FROM Patrol_Attendance
            WHERE UserID = ? AND YEAR(PatrolDate) = ?
            ORDER BY PatrolDate DESC, id DESC
        `, [employeeId, year]);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ─── Self-Patrol (หัวหน้าส่วน/แผนก) ───────────────────────────────────────────

router.get('/my-self-patrol', async (req, res) => {
    const { year, month } = req.query;
    const empId = req.user.id;
    try {
        const selectedYear = parseInt(year) || new Date().getFullYear();
        const selectedMonth = parseInt(month) || (new Date().getMonth() + 1);
        const [[emp]] = await db.query(
            `SELECT mp.IsSupervisorPatrol, e.Position
             FROM Employees e
             LEFT JOIN Master_Positions mp ON mp.Name = e.Position
             WHERE e.EmployeeID = ?`, [empId]);
        const [[roster]] = await db.query(
            "SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
            [empId]
        );
        if ((!emp || !emp.IsSupervisorPatrol) && !roster) {
            return res.json({ success: true, data: { isSupervisorPatrol: false, checkins: [] } });
        }
        const detail = await buildSupervisorAttendanceDetail(empId, selectedYear, {
            allowPositionSupervisor: Boolean(emp?.IsSupervisorPatrol),
        });
        const period = (detail.periods || []).find(p => Number(p.month) === Number(selectedMonth)) || {};
        const monthlyRequirement = Number(period.monthlyRequirement || period.required || 0);
        const completed = Number(period.completed || 0);
        const yearSchedule = Array.isArray(detail.schedule) ? detail.schedule : [];
        const openYearSchedule = Array.isArray(detail.openSchedule)
            ? detail.openSchedule
            : yearSchedule.filter(item => !item.isCompleted && !item.isLeave && !item.isLeavePending);
        const monthItems = Array.isArray(period.items) ? period.items : [];
        const openMonthItems = monthItems.filter(item => !item.isCompleted && !item.isLeave && !item.isLeavePending);
        res.json({
            success: true,
            data: {
                isSupervisorPatrol: true,
                scheduleMode: 'scheduled',
                position: emp?.Position || detail.employee?.Position || '',
                checkins: period.records || [],
                target: monthlyRequirement,
                monthlyRequirement,
                completed,
                remaining: Math.max(0, monthlyRequirement - completed),
                periodStatus: period.status || 'upcoming',
                yearlyTarget: Number(detail.summary?.yearlyTarget || 0),
                yearlyCompleted: Number(detail.summary?.completed || 0),
                passPct: Number(detail.summary?.passPct || detail.passPct || 80),
                leave: detail.summary?.leave || null,
                leaveRequests: detail.leaveRequests || [],
                acceptedCoverageToDatePct: Number(detail.summary?.acceptedCoverageToDatePct || 0),
                acceptedCoverageYearPct: Number(detail.summary?.acceptedCoverageYearPct || 0),
                scheduledTotal: Number(detail.summary?.scheduledTotal || yearSchedule.length || 0),
                targetSource: detail.targetSource || detail.summary?.targetSource || 'patrol_roster',
                currentPeriod: period,
                periods: detail.periods || [],
                schedule: monthItems,
                openSchedule: openMonthItems,
                yearSchedule,
                openYearSchedule,
            },
        });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.post('/self-checkin', async (req, res) => {
    const empId = req.user.id;
    const { CheckinDate, Location, Notes, ScheduledSessionID } = req.body;
    const PatrolType = patrolSelfCheckinType(req.body.PatrolType || 'normal');
    if (!PatrolType) return res.status(400).json({ success: false, message: 'PatrolType is invalid.' });
    if (!String(ScheduledSessionID || '').trim()) {
        return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for self-patrol check-in.' });
    }
    if (!CheckinDate) return res.status(400).json({ success: false, message: 'กรุณาระบุวันที่' });
    const inputDate = parseDateInput(CheckinDate);
    if (!inputDate) return res.status(400).json({ success: false, message: 'CheckinDate ไม่ถูกต้อง' });
    try {
        const [[emp]] = await db.query(
            `SELECT e.EmployeeID,e.EmployeeName,e.Department,e.Unit,e.Position,e.CompanyEmail,mp.IsSupervisorPatrol FROM Employees e
             LEFT JOIN Master_Positions mp ON mp.Name = e.Position
             WHERE e.EmployeeID = ?`, [empId]);
        if (!emp?.IsSupervisorPatrol) {
            const [[roster]] = await db.query(
                "SELECT id FROM Patrol_Roster WHERE EmployeeID=? AND RosterGroup='supervisor' LIMIT 1",
                [empId]
            );
            if (!roster) return res.status(403).json({ success: false, message: 'ตำแหน่งของคุณไม่ได้กำหนดให้เดิน Self-Patrol' });
        }
        const sid = String(ScheduledSessionID || '').trim();
        const resolved = sid.startsWith('FLEX:')
            ? await resolveFlexibleSelfCheckin(empId, inputDate, sid, Location)
            : await resolveSupervisorScheduledSession(empId, inputDate, sid, {
                requireSession: true,
                preserveActualDate: PatrolType === 'compensation',
            });
        const effectiveDate = resolved.date;
        const effective = new Date(effectiveDate);
        const effectiveLocation = sid.startsWith('FLEX:')
            ? (resolved.session?.AreaName || resolved.session?.AreaCode || Location || null)
            : (Location || resolved.session?.AreaName || resolved.session?.AreaCode || null);
        const [result] = await db.query(
            `INSERT INTO Patrol_Self_Checkin (EmployeeID, CheckinDate, Location, Notes, Year, Month, PatrolType, RecordedBy, ScheduledSessionID) VALUES (?,?,?,?,?,?,?,?,?)`,
            [empId, effectiveDate, effectiveLocation, Notes || null, effective.getFullYear(), effective.getMonth() + 1, PatrolType, empId, resolved.session?.id || null]);
        const attendance = {
            id: result.insertId,
            UserID: empId,
            UserName: emp?.EmployeeName || req.user.name || empId,
            TeamName: 'Sec. & Supervisor',
            PatrolDate: effectiveDate,
            PatrolType,
            Area: effectiveLocation,
            Notes: Notes || null,
            ScheduledSessionID: resolved.session?.id || null,
        };
        const email = await queuePatrolCheckinEmail({
            attendanceId: result.insertId,
            employee: emp || {},
            attendance,
            session: resolved.session || null,
        }).catch(err => ({ queued: false, sent: false, reason: err.message }));
        res.json({ success: true, message: 'บันทึกการเดินตรวจสำเร็จ', id: result.insertId, email, data: {
            group: 'supervisor',
            checkin: {
                id: result.insertId, employeeId: empId, employeeName: attendance.UserName,
                position: emp?.Position || null, department: emp?.Department || null,
                type: PatrolType, actualDate: effectiveDate,
                scheduledDate: resolved.session?.PatrolDate ? dateOnly(resolved.session.PatrolDate) : effectiveDate,
                isMakeup: Boolean(resolved.session?.PatrolDate && dateOnly(resolved.session.PatrolDate) !== effectiveDate),
                scheduledSessionId: resolved.session?.id || null, round: resolved.session?.PatrolRound || null,
                area: effectiveLocation, teamName: 'Sec. & Supervisor',
            },
            email,
        } });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
        sendPatrolError(res, err);
    }
});

router.delete('/self-checkin/:id', async (req, res) => {
    const empId = req.user.id;
    try {
        const [[row]] = await db.query('SELECT EmployeeID FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูล' });
        if (row.EmployeeID !== empId && req.user.role !== 'Admin') {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ลบรายการนี้' });
        }
        await db.query('DELETE FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.get('/supervisor-overview', async (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        const [members] = await db.query(`
            SELECT pr.id AS RosterID, pr.EmployeeID, pr.TargetPerYear,
                   e.EmployeeName, e.Department, e.Position
            FROM Patrol_Roster pr
            JOIN Employees e ON e.EmployeeID = pr.EmployeeID
            WHERE pr.RosterGroup = 'supervisor'
            ORDER BY pr.SortOrder, e.Department, e.EmployeeName
        `);
        const data = [];
        for (const m of members) {
            const detail = await buildSupervisorAttendanceDetail(String(m.EmployeeID), year);
            const summary = detail.summary || {};
            const leave = summary.leave || {};
            const requiredToDate = Number(summary.requiredToDate || 0);
            const completedToDate = Number(summary.completedToDateCapped || 0);
            const yearlyTarget = Number(summary.yearlyTarget || m.TargetPerYear || 0);
            const fullYearCompleted = Number(summary.completed || 0);
            const progressPct = patrolPct(completedToDate, requiredToDate);
            const fullYearPct = patrolPct(fullYearCompleted, yearlyTarget);
            data.push({
                ...m,
                attended: completedToDate,
                target: requiredToDate,
                percent: progressPct,
                progressToDatePct: progressPct,
                fullYearPct,
                yearlyTarget,
                fullYearCompleted,
                requiredToDate,
                completedToDateCapped: completedToDate,
                missingToDate: Number(summary.missingToDate || 0),
                upcomingMonths: Number(summary.upcomingMonths || 0),
                monthlyRequirement: Number(detail.monthlyRequirement || patrolCurrentMonthlyRequirement(year, yearlyTarget)),
                passPct: Number(summary.passPct || 80),
                passThresholdToDate: Number(summary.passThresholdToDate || patrolPassThreshold(requiredToDate, summary.passPct || 80)),
                passThresholdYear: Number(summary.passThresholdYear || patrolPassThreshold(yearlyTarget, summary.passPct || 80)),
                leaveYear: Number(summary.leaveYear || leave.leaveYear || 0),
                allowedLeaveYear: Number(summary.allowedLeaveYear || leave.allowedLeaveYear || 0),
                acceptedLeaveYear: Number(summary.acceptedLeaveYear || leave.acceptedLeaveYear || 0),
                leaveRemainingYear: Number(summary.leaveRemainingYear || leave.leaveRemainingYear || 0),
                overLeaveYear: Number(summary.overLeaveYear || leave.overLeaveYear || 0),
                acceptedCoverageToDate: Number(summary.acceptedCoverageToDate || leave.acceptedCoverageToDate || completedToDate),
                acceptedCoverageYear: Number(summary.acceptedCoverageYear || leave.acceptedCoverageYear || fullYearCompleted),
                acceptedCoverageToDatePct: Number(summary.acceptedCoverageToDatePct || leave.acceptedCoverageToDatePct || 0),
                acceptedCoverageYearPct: Number(summary.acceptedCoverageYearPct || leave.acceptedCoverageYearPct || 0),
                actualPassToDate: Boolean(summary.actualPassToDate),
                acceptedPassToDate: Boolean(summary.acceptedPassToDate),
                finalStatus: summary.finalStatus || 'Below target',
            });
        }
        res.json({ success: true, data });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 8: Patrol Roster (Admin-managed roster for Top Management & Supervisor overview tables)
// ==========================================
// SQL to create table (run once in DBeaver):
// CREATE TABLE IF NOT EXISTS Patrol_Roster (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   EmployeeID VARCHAR(50) NOT NULL,
//   RosterGroup ENUM('top_management','supervisor') NOT NULL,
//   TargetPerYear INT NOT NULL DEFAULT 12,
//   SortOrder INT DEFAULT 99,
//   CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
//   UNIQUE KEY uq_emp_group (EmployeeID, RosterGroup)
// ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

// GET /api/patrol/roster?group=top_management|supervisor
router.get('/roster', async (req, res) => {
    const { group } = req.query;
    try {
        const whereClause = group ? 'WHERE pr.RosterGroup = ?' : '';
        const params      = group ? [group] : [];
        const [rows] = await db.query(`
            SELECT pr.id, pr.EmployeeID, pr.RosterGroup, pr.TargetPerYear, pr.SortOrder,
                   e.EmployeeName, e.Position, e.Department
            FROM Patrol_Roster pr
            JOIN Employees e ON e.EmployeeID = pr.EmployeeID
            ${whereClause}
            ORDER BY pr.RosterGroup, pr.SortOrder, e.EmployeeName
        `, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/roster — Admin only: add employee to roster
router.post('/roster', isAdmin, async (req, res) => {
    const { EmployeeID, RosterGroup, TargetPerYear, SortOrder } = req.body;
    if (!EmployeeID || !RosterGroup) return res.status(400).json({ success: false, message: 'EmployeeID และ RosterGroup จำเป็น' });
    if (!['top_management', 'supervisor'].includes(RosterGroup))
        return res.status(400).json({ success: false, message: 'RosterGroup ไม่ถูกต้อง' });
    try {
        const [result] = await db.query(
            `INSERT INTO Patrol_Roster (EmployeeID, RosterGroup, TargetPerYear, SortOrder) VALUES (?,?,?,?)`,
            [EmployeeID, RosterGroup, TargetPerYear || 12, SortOrder || 99]
        );
        res.json({ success: true, id: result.insertId, message: 'เพิ่มสมาชิกสำเร็จ' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'พนักงานนี้มีอยู่ในรายการแล้ว' });
        sendPatrolError(res, err);
    }
});

// PUT /api/patrol/roster/:id — Admin only: edit TargetPerYear / SortOrder
router.put('/roster/:id', isAdmin, async (req, res) => {
    const { TargetPerYear, SortOrder } = req.body;
    if (!TargetPerYear || TargetPerYear < 1) return res.status(400).json({ success: false, message: 'TargetPerYear ไม่ถูกต้อง' });
    try {
        await db.query(
            `UPDATE Patrol_Roster SET TargetPerYear = ?, SortOrder = ? WHERE id = ?`,
            [TargetPerYear, SortOrder ?? 99, req.params.id]
        );
        res.json({ success: true, message: 'อัปเดตสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/roster/:id — Admin only: remove from roster
router.delete('/roster/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM Patrol_Roster WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'ลบออกจากรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/my-missed-sessions?year=Y — sessions ที่ user ควรเดินแต่ยังไม่มีบันทึก (สำหรับ เดินซ่อม dropdown)
router.get('/my-missed-sessions', async (req, res) => {
    const employeeId = req.user.id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    try {
        const checkinV2Enabled = await patrolCheckinV2Enabled();
        let years = [year];
        if (checkinV2Enabled && String(req.query.scope || '').toLowerCase() === 'all') {
            const [yearRows] = await db.query(
                'SELECT DISTINCT YEAR(PatrolDate) AS Year FROM Patrol_Sessions WHERE DATE(PatrolDate) <= ? ORDER BY Year DESC',
                [patrolTodayBangkok()]
            );
            years = yearRows.map(row => Number(row.Year)).filter(value => value >= 2000 && value <= 2100);
        }
        const sessions = [];
        for (const scheduledYear of years) {
            sessions.push(...await topManagementSessionsForEmployee(employeeId, scheduledYear));
        }
        const [linkedRows] = await db.query(
            `SELECT DISTINCT ScheduledSessionID
             FROM Patrol_Attendance
             WHERE UserID=?
               AND ScheduledSessionID IS NOT NULL AND ScheduledSessionID<>''`,
            [employeeId]
        );
        const completed = new Set(linkedRows.map(r => String(r.ScheduledSessionID)));
        const [legacyRows] = await db.query(
            `SELECT DATE(PatrolDate) AS PatrolDate,COUNT(*) AS count
               FROM Patrol_Attendance
              WHERE UserID=? AND (ScheduledSessionID IS NULL OR ScheduledSessionID='') AND IdempotencyKey IS NULL
              GROUP BY DATE(PatrolDate)`,
            [employeeId]
        );
        const legacyRemaining = new Map(legacyRows.map(row => [dateOnly(row.PatrolDate), Number(row.count || 0)]));
        const today = patrolTodayBangkok();
        const rows = [];
        for (const s of sessions) {
            const date = dateOnly(s.PatrolDate);
            if (date >= today) continue;
            if (completed.has(String(s.id))) continue;
            if ((legacyRemaining.get(date) || 0) > 0) {
                legacyRemaining.set(date, legacyRemaining.get(date) - 1);
                continue;
            }
            rows.push({
                id: s.id,
                ScheduledSessionID: s.id,
                PatrolDate: date,
                PatrolRound: Number(s.PatrolRound || 0),
                AreaName: s.AreaName || '',
                AreaCode: s.AreaCode || '',
                TeamName: s.TeamName || '',
            });
        }
        rows.sort((a, b) => String(b.PatrolDate).localeCompare(String(a.PatrolDate)) || Number(a.PatrolRound) - Number(b.PatrolRound));
        res.json({ success: true, data: rows.slice(0, 500), meta: { scope: years.length > 1 ? 'all' : 'year', checkinV2Enabled } });
    } catch (err) {
        sendPatrolError(res, err);
    }
});
// GET /api/patrol/supervisor-checkins?employeeId=X&year=Y — รายการ Self-Patrol รายบุคคล (admin/modal view)
router.get('/supervisor-checkins', async (req, res) => {
    const { employeeId, year: yearStr } = req.query;
    if (!employeeId) return res.status(400).json({ success: false, message: 'ต้องระบุ employeeId' });
    const year = parseInt(yearStr) || new Date().getFullYear();
    try {
        const [rows] = await db.query(
            `SELECT id, CheckinDate, Location, Notes, Year, Month, PatrolType, RecordedBy, ScheduledSessionID
             FROM Patrol_Self_Checkin WHERE EmployeeID = ? AND Year = ?
             ORDER BY CheckinDate DESC`,
            [employeeId, year]
        );
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// ==========================================
// PART 9: Admin Record Management
// ==========================================

// POST /api/patrol/admin-record — Admin เพิ่มรายการเดินตรวจให้สมาชิกคนใดก็ได้ (Patrol_Attendance)
router.post('/admin-record', isAdmin, async (req, res) => {
    const { EmployeeID, PatrolDate, PatrolType, Area, Notes, ScheduledSessionID } = req.body;
    if (!EmployeeID || !PatrolDate) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID และ PatrolDate' });
    if (!String(ScheduledSessionID || '').trim()) {
        return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for admin on-behalf patrol records.' });
    }
    try {
        const [[emp]] = await db.query(
            `SELECT e.EmployeeName, t.Name AS TeamName
             FROM Employees e
             LEFT JOIN Patrol_Team_Members tm ON tm.EmployeeID = e.EmployeeID
             LEFT JOIN Patrol_Teams t ON t.id = tm.TeamID
             WHERE e.EmployeeID = ? LIMIT 1`,
            [EmployeeID]
        );
        if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        const d = new Date(PatrolDate);
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, message: 'PatrolDate ไม่ถูกต้อง' });
        const dateStr = d.toISOString().split('T')[0];
        const week = getWeekNumber(d);
        const { session } = await resolveTopScheduledSession(EmployeeID, dateStr, ScheduledSessionID);
        const area = Area || session?.AreaName || session?.AreaCode || null;
        const [result] = await db.query(
            `INSERT INTO Patrol_Attendance (UserID, UserName, TeamName, WeekNumber, PatrolDate, PatrolType, Area, Notes, RecordedBy, ScheduledSessionID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [EmployeeID, emp.EmployeeName, emp.TeamName || '', week,
             dateStr, PatrolType || 'normal', area, Notes || null, req.user.id, session?.id || null]
        );
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_ADD_PATROL_ATTENDANCE',
            targetType: 'Patrol_Attendance',
            targetId: result.insertId,
            detail: `Admin add patrol attendance for ${EmployeeID}`,
            metadata: { employeeId: EmployeeID, patrolDate: dateStr, patrolType: PatrolType || 'normal', area, scheduledSessionId: session?.id || null },
        });
        res.json({ success: true, message: 'เพิ่มรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/admin-record/:id — Admin ลบรายการเดินตรวจ (Patrol_Attendance)
router.delete('/admin-record/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id FROM Patrol_Attendance WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        await db.query('DELETE FROM Patrol_Attendance WHERE id = ?', [req.params.id]);
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_DELETE_PATROL_ATTENDANCE',
            targetType: 'Patrol_Attendance',
            targetId: req.params.id,
            detail: `Admin delete patrol attendance #${req.params.id}`,
            metadata: { id: req.params.id },
        });
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// POST /api/patrol/admin-record/supervisor — Admin เพิ่มรายการ Self-Patrol ให้หัวหน้า (Patrol_Self_Checkin)
router.post('/admin-record/supervisor', isAdmin, async (req, res) => {
    const { EmployeeID, CheckinDate, Location, Notes, ScheduledSessionID } = req.body;
    const PatrolType = patrolSelfCheckinType(req.body.PatrolType || 'normal');
    if (!PatrolType) return res.status(400).json({ success: false, message: 'PatrolType is invalid.' });
    if (!EmployeeID || !CheckinDate) return res.status(400).json({ success: false, message: 'ต้องระบุ EmployeeID และ CheckinDate' });
    if (!String(ScheduledSessionID || '').trim()) {
        return res.status(400).json({ success: false, message: 'ScheduledSessionID is required for admin on-behalf self-patrol records.' });
    }
    try {
        const [[emp]] = await db.query('SELECT EmployeeName FROM Employees WHERE EmployeeID = ?', [EmployeeID]);
        if (!emp) return res.status(404).json({ success: false, message: 'ไม่พบพนักงาน' });
        const inputDate = parseDateInput(CheckinDate);
        if (!inputDate) return res.status(400).json({ success: false, message: 'CheckinDate ไม่ถูกต้อง' });
        const sid = String(ScheduledSessionID || '').trim();
        const resolved = sid.startsWith('FLEX:')
            ? await resolveFlexibleSelfCheckin(EmployeeID, inputDate, sid, Location)
            : await resolveSupervisorScheduledSession(EmployeeID, inputDate, sid, {
                requireSession: true,
                preserveActualDate: PatrolType === 'compensation',
            });
        const effectiveDate = resolved.date;
        const effective = new Date(effectiveDate);
        const location = sid.startsWith('FLEX:')
            ? (resolved.session?.AreaName || resolved.session?.AreaCode || Location || null)
            : (Location || resolved.session?.AreaName || resolved.session?.AreaCode || null);
        const [result] = await db.query(
            `INSERT INTO Patrol_Self_Checkin (EmployeeID, CheckinDate, Location, Notes, Year, Month, PatrolType, RecordedBy, ScheduledSessionID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [EmployeeID, effectiveDate, location, Notes || null, effective.getFullYear(), effective.getMonth() + 1, PatrolType, req.user.id, resolved.session?.id || null]
        );
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_ADD_SELF_PATROL',
            targetType: 'Patrol_Self_Checkin',
            targetId: result.insertId,
            detail: `Admin add self-patrol for ${EmployeeID}`,
            metadata: { employeeId: EmployeeID, checkinDate: effectiveDate, patrolType: PatrolType, location, scheduledSessionId: resolved.session?.id || null },
        });
        res.json({ success: true, message: 'เพิ่มรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// DELETE /api/patrol/admin-record/supervisor/:id — Admin ลบรายการ Self-Patrol (Patrol_Self_Checkin)
router.delete('/admin-record/supervisor/:id', isAdmin, async (req, res) => {
    try {
        const [[row]] = await db.query('SELECT id FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
        await db.query('DELETE FROM Patrol_Self_Checkin WHERE id = ?', [req.params.id]);
        await logAudit(req, {
            module: 'patrol',
            action: 'ADMIN_DELETE_SELF_PATROL',
            targetType: 'Patrol_Self_Checkin',
            targetId: req.params.id,
            detail: `Admin delete self-patrol #${req.params.id}`,
            metadata: { id: req.params.id },
        });
        res.json({ success: true, message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

// GET /api/patrol/employee-search — Admin ค้นหาพนักงานทุกคน (ไม่จำกัดเฉพาะ roster)
router.get('/employee-search', isAdmin, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        let sql = 'SELECT EmployeeID, EmployeeName, Department, Position FROM Employees WHERE 1=1';
        const params = [];
        if (q) {
            sql += ' AND (EmployeeID LIKE ? OR EmployeeName LIKE ? OR Department LIKE ?)';
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        sql += ' ORDER BY EmployeeName ASC LIMIT 30';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (err) {
        sendPatrolError(res, err);
    }
});

router.buildTopManagementAttendanceDetail = buildTopManagementAttendanceDetail;
router.buildSupervisorAttendanceDetail = buildSupervisorAttendanceDetail;

module.exports = router;
