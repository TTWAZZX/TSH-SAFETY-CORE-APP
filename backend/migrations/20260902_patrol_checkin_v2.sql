-- Safety Patrol check-in v2 (additive, disabled by default)
-- Existing attendance rows remain unchanged and compatible.

ALTER TABLE patrol_attendance
    ADD COLUMN IF NOT EXISTS IdempotencyKey VARCHAR(80) NULL AFTER ScheduledSessionID;

SET @patrol_idempotency_index_exists := (
    SELECT COUNT(*)
      FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = LOWER('patrol_attendance')
       AND INDEX_NAME = 'uq_patrol_attendance_user_request'
);
SET @patrol_idempotency_index_sql := IF(
    @patrol_idempotency_index_exists = 0,
    'ALTER TABLE patrol_attendance ADD UNIQUE KEY uq_patrol_attendance_user_request (UserID, IdempotencyKey)',
    'SELECT 1'
);
PREPARE patrol_idempotency_stmt FROM @patrol_idempotency_index_sql;
EXECUTE patrol_idempotency_stmt;
DEALLOCATE PREPARE patrol_idempotency_stmt;

SET @patrol_session_index_exists := (
    SELECT COUNT(*)
      FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = LOWER('patrol_attendance')
       AND INDEX_NAME = 'uq_patrol_attendance_user_session'
);
SET @patrol_session_index_sql := IF(
    @patrol_session_index_exists = 0,
    'ALTER TABLE patrol_attendance ADD UNIQUE KEY uq_patrol_attendance_user_session (UserID, ScheduledSessionID)',
    'SELECT 1'
);
PREPARE patrol_session_stmt FROM @patrol_session_index_sql;
EXECUTE patrol_session_stmt;
DEALLOCATE PREPARE patrol_session_stmt;

SET @patrol_member_index_exists := (
    SELECT COUNT(*)
      FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND LOWER(TABLE_NAME) = LOWER('patrol_team_members')
       AND INDEX_NAME = 'uq_patrol_team_members_employee'
);
SET @patrol_member_index_sql := IF(
    @patrol_member_index_exists = 0,
    'ALTER TABLE patrol_team_members ADD UNIQUE KEY uq_patrol_team_members_employee (EmployeeID)',
    'SELECT 1'
);
PREPARE patrol_member_stmt FROM @patrol_member_index_sql;
EXECUTE patrol_member_stmt;
DEALLOCATE PREPARE patrol_member_stmt;

INSERT INTO app_settings (key_name, value)
VALUES ('patrol_checkin_v2_enabled', '0')
ON DUPLICATE KEY UPDATE value = value;
