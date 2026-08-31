-- BBS Smart Card Phase 9B: effective-dated inspector schedules and compliance.
-- Additive only. Existing enrollments, teams, observations and actions are unchanged.

CREATE TABLE IF NOT EXISTS BBS_Inspector_Schedule_Rules (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    EnrollmentID        BIGINT       NOT NULL,
    ScheduleName        VARCHAR(120) NOT NULL DEFAULT 'Inspection schedule',
    Weekdays            VARCHAR(20)  NOT NULL DEFAULT '1,2,3,4,5',
    TargetCount         INT          NOT NULL DEFAULT 1,
    EffectiveFrom       DATE         NOT NULL,
    EffectiveTo         DATE         NULL,
    Status              VARCHAR(20)  NOT NULL DEFAULT 'Active',
    Reason              VARCHAR(255) NULL,
    RowVersion          INT          NOT NULL DEFAULT 1,
    CreatedBy           VARCHAR(20)  NULL,
    CreatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_schedule_enrollment_effective (EnrollmentID, Status, EffectiveFrom, EffectiveTo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Inspector_Schedule_Overrides (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    EnrollmentID        BIGINT       NOT NULL,
    ScheduleDate        DATE         NOT NULL,
    OverrideType        VARCHAR(20)  NOT NULL,
    TargetCount         INT          NULL,
    Reason              VARCHAR(255) NOT NULL,
    IsActive            TINYINT(1)   NOT NULL DEFAULT 1,
    RowVersion          INT          NOT NULL DEFAULT 1,
    CreatedBy           VARCHAR(20)  NULL,
    UpdatedBy           VARCHAR(20)  NULL,
    CreatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_schedule_override_date (EnrollmentID, ScheduleDate),
    KEY idx_bbs_schedule_override_period (ScheduleDate, IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Inspector_Schedule_Events (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    EnrollmentID        BIGINT       NOT NULL,
    RuleID              BIGINT       NULL,
    OverrideID          BIGINT       NULL,
    EventType           VARCHAR(30)  NOT NULL,
    ScheduleDate        DATE         NULL,
    ActorEmployeeID     VARCHAR(20)  NOT NULL,
    DetailText          VARCHAR(1000) NULL,
    CreatedAt           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_schedule_event_enrollment (EnrollmentID, CreatedAt),
    KEY idx_bbs_schedule_event_date (ScheduleDate, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('inspector_schedule_enabled', '1')
ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue);
