const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
    const host = String(process.env.DB_HOST || '').trim().toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
        throw new Error(`Refusing non-local DB_HOST: ${host || '(blank)'}`);
    }
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });
    try {
        const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20260902_patrol_checkin_v2.sql'), 'utf8');
        await db.query(sql);
        await db.query("UPDATE App_Settings SET value='1' WHERE key_name='patrol_checkin_v2_enabled'");
        const [[column]] = await db.query("SELECT COUNT(*) count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Attendance' AND COLUMN_NAME='IdempotencyKey'");
        const [[index]] = await db.query("SELECT COUNT(DISTINCT INDEX_NAME) count FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Attendance' AND INDEX_NAME='uq_patrol_attendance_user_request'");
        const [[sessionIndex]] = await db.query("SELECT COUNT(DISTINCT INDEX_NAME) count FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Attendance' AND INDEX_NAME='uq_patrol_attendance_user_session'");
        const [[memberIndex]] = await db.query("SELECT COUNT(DISTINCT INDEX_NAME) count FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Patrol_Team_Members' AND INDEX_NAME='uq_patrol_team_members_employee'");
        const [[flag]] = await db.query("SELECT value FROM App_Settings WHERE key_name='patrol_checkin_v2_enabled'");
        if (Number(column.count) !== 1 || Number(index.count) < 1 || Number(sessionIndex.count) < 1 || Number(memberIndex.count) < 1 || String(flag?.value) !== '1') throw new Error('Local Patrol check-in v2 verification failed.');
        console.log('Patrol check-in v2 Local migration: PASS (attendance request/session indexes=1, member unique index=1, flag=1)');
    } finally {
        await db.end();
    }
})().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
});
