const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
    });
    try {
        const [teamConflicts] = await db.query("SELECT EmployeeID,COUNT(*) TeamCount,GROUP_CONCAT(TeamID ORDER BY TeamID) TeamIDs FROM Patrol_Team_Members GROUP BY EmployeeID HAVING COUNT(*)>1");
        const [[orphan]] = await db.query("SELECT COUNT(*) count FROM Patrol_Attendance pa LEFT JOIN Patrol_Sessions ps ON ps.SessionID=pa.ScheduledSessionID WHERE pa.ScheduledSessionID IS NOT NULL AND pa.ScheduledSessionID<>'' AND ps.SessionID IS NULL");
        const [duplicateScheduledLinks] = await db.query("SELECT UserID,ScheduledSessionID,COUNT(*) Count FROM Patrol_Attendance WHERE ScheduledSessionID IS NOT NULL AND ScheduledSessionID<>'' GROUP BY UserID,ScheduledSessionID HAVING COUNT(*)>1");
        const [linkage] = await db.query("SELECT CASE WHEN ScheduledSessionID IS NULL OR ScheduledSessionID='' THEN 'extra_or_legacy' ELSE 'scheduled' END Linkage,LOWER(TRIM(COALESCE(PatrolType,'normal'))) NormalizedPatrolType,COUNT(*) Count FROM Patrol_Attendance GROUP BY CASE WHEN ScheduledSessionID IS NULL OR ScheduledSessionID='' THEN 'extra_or_legacy' ELSE 'scheduled' END,LOWER(TRIM(COALESCE(PatrolType,'normal'))) ORDER BY Linkage,NormalizedPatrolType");
        const [multipleRounds] = await db.query("SELECT TeamID,DATE(PatrolDate) PatrolDate,COUNT(*) SessionCount FROM Patrol_Sessions WHERE COALESCE(Status,'')<>'Cancelled' GROUP BY TeamID,DATE(PatrolDate) HAVING COUNT(*)>1");
        const [[flag]] = await db.query("SELECT value FROM App_Settings WHERE key_name='patrol_checkin_v2_enabled' LIMIT 1");
        const [[schema]] = await db.query("SELECT (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Attendance' AND COLUMN_NAME='IdempotencyKey') IdempotencyColumn,(SELECT COUNT(DISTINCT INDEX_NAME) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Attendance' AND INDEX_NAME='uq_patrol_attendance_user_request') AttendanceUniqueIndex,(SELECT COUNT(DISTINCT INDEX_NAME) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Attendance' AND INDEX_NAME='uq_patrol_attendance_user_session') SessionUniqueIndex,(SELECT COUNT(DISTINCT INDEX_NAME) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Team_Members' AND INDEX_NAME='uq_patrol_team_members_employee') MemberUniqueIndex");
        console.log(JSON.stringify({
            selectOnly: true,
            checkinV2Enabled: String(flag?.value || '0') === '1',
            schema: {
                idempotencyColumn: Number(schema.IdempotencyColumn),
                attendanceUniqueIndex: Number(schema.AttendanceUniqueIndex),
                sessionUniqueIndex: Number(schema.SessionUniqueIndex),
                memberUniqueIndex: Number(schema.MemberUniqueIndex),
            },
            teamConflicts,
            duplicateScheduledLinks: duplicateScheduledLinks.map(row => ({ ...row, Count:Number(row.Count) })),
            orphanScheduledLinks: Number(orphan.count),
            linkage: linkage.map(row => ({ ...row, Count: Number(row.Count) })),
            multipleRoundDates: multipleRounds.length,
        }, null, 2));
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});
