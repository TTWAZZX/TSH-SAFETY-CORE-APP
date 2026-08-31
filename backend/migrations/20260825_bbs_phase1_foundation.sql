-- BBS Smart Card Phase 1 foundation
-- Additive migration only. Run on a backed-up database before deploying routes.

CREATE TABLE IF NOT EXISTS BBS_Settings (
    SettingKey   VARCHAR(80)  NOT NULL,
    SettingValue TEXT         NOT NULL,
    UpdatedBy    VARCHAR(20)  NULL,
    CreatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (SettingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Position_Level_Mappings (
    id          INT          NOT NULL AUTO_INCREMENT,
    PositionID  INT          NOT NULL,
    BBSLevel    VARCHAR(32)  NOT NULL,
    IsActive    TINYINT(1)   NOT NULL DEFAULT 1,
    ReviewedBy  VARCHAR(20)  NULL,
    ReviewedAt  DATETIME     NULL,
    CreatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_position_level_position (PositionID),
    KEY idx_bbs_position_level_active (IsActive, BBSLevel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Hierarchy_Assignments (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    SupervisorEmployeeID  VARCHAR(20)  NOT NULL,
    MemberEmployeeID      VARCHAR(20)  NOT NULL,
    DepartmentID          INT          NOT NULL,
    SafetyUnitID          INT          NULL,
    AssignmentType        VARCHAR(20)  NOT NULL DEFAULT 'permanent',
    EffectiveFrom         DATE         NOT NULL,
    EffectiveTo           DATE         NULL,
    IsActive              TINYINT(1)   NOT NULL DEFAULT 1,
    Reason                VARCHAR(255) NULL,
    CreatedBy             VARCHAR(20)  NULL,
    UpdatedBy             VARCHAR(20)  NULL,
    CreatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_hierarchy_supervisor_effective (SupervisorEmployeeID, IsActive, EffectiveFrom, EffectiveTo),
    KEY idx_bbs_hierarchy_member_effective (MemberEmployeeID, IsActive, EffectiveFrom, EffectiveTo),
    KEY idx_bbs_hierarchy_scope (DepartmentID, SafetyUnitID, IsActive)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Employee_Eligibility (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    EmployeeID     VARCHAR(20)   NOT NULL,
    Eligibility    VARCHAR(20)   NOT NULL DEFAULT 'active',
    EffectiveFrom  DATE          NOT NULL,
    EffectiveTo    DATE          NULL,
    IsActive       TINYINT(1)    NOT NULL DEFAULT 1,
    Reason         VARCHAR(255)  NULL,
    CreatedBy      VARCHAR(20)   NULL,
    UpdatedBy      VARCHAR(20)   NULL,
    CreatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_eligibility_employee_effective (EmployeeID, IsActive, EffectiveFrom, EffectiveTo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_KPI_Rules (
    id            INT          NOT NULL AUTO_INCREMENT,
    BBSLevel      VARCHAR(32)  NOT NULL,
    MetricKey     VARCHAR(50)  NOT NULL DEFAULT 'submitted_observation',
    PeriodType    VARCHAR(20)  NOT NULL DEFAULT 'business_day',
    TargetCount   INT          NOT NULL DEFAULT 1,
    Weekdays      VARCHAR(20)  NOT NULL DEFAULT '1,2,3,4,5',
    TimeZone      VARCHAR(50)  NOT NULL DEFAULT 'Asia/Bangkok',
    CountStatus   VARCHAR(20)  NOT NULL DEFAULT 'submitted',
    IsActive      TINYINT(1)   NOT NULL DEFAULT 1,
    UpdatedBy     VARCHAR(20)  NULL,
    CreatedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_kpi_level_metric (BBSLevel, MetricKey),
    KEY idx_bbs_kpi_active (IsActive, BBSLevel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Pilot_Scopes (
    id            INT         NOT NULL AUTO_INCREMENT,
    DepartmentID  INT         NOT NULL,
    SafetyUnitID  INT         NOT NULL,
    IsActive      TINYINT(1)  NOT NULL DEFAULT 1,
    EffectiveFrom DATE        NOT NULL,
    EffectiveTo   DATE        NULL,
    UpdatedBy     VARCHAR(20) NULL,
    CreatedAt     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_pilot_scope (DepartmentID, SafetyUnitID),
    KEY idx_bbs_pilot_active (IsActive, EffectiveFrom, EffectiveTo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES
    ('phase_status', 'configuration_only'),
    ('main_menu_enabled', '0'),
    ('default_timezone', 'Asia/Bangkok')
ON DUPLICATE KEY UPDATE SettingKey = VALUES(SettingKey);

INSERT INTO BBS_Position_Level_Mappings (PositionID, BBSLevel, IsActive, ReviewedAt)
SELECT id,
       CASE Name
           WHEN 'พนักงาน' THEN 'Operator'
           WHEN 'หัวหน้ากลุ่ม' THEN 'Group Leader'
           WHEN 'หัวหน้าแผนก' THEN 'Department Head'
           WHEN 'หัวหน้าส่วน' THEN 'Section Head'
           WHEN 'ผู้จัดการ' THEN 'Manager'
       END,
       1,
       NOW()
  FROM Master_Positions
 WHERE Name IN ('พนักงาน', 'หัวหน้ากลุ่ม', 'หัวหน้าแผนก', 'หัวหน้าส่วน', 'ผู้จัดการ')
ON DUPLICATE KEY UPDATE PositionID = VALUES(PositionID);

INSERT INTO BBS_KPI_Rules
    (BBSLevel, MetricKey, PeriodType, TargetCount, Weekdays, TimeZone, CountStatus, IsActive)
VALUES
    ('Group Leader', 'submitted_observation', 'business_day', 1, '1,2,3,4,5', 'Asia/Bangkok', 'submitted', 1)
ON DUPLICATE KEY UPDATE BBSLevel = VALUES(BBSLevel);

INSERT INTO BBS_Pilot_Scopes (DepartmentID, SafetyUnitID, IsActive, EffectiveFrom)
SELECT d.id, u.id, 1, CURRENT_DATE
  FROM Master_Departments d
  JOIN Master_SafetyUnits u ON u.department_id = d.id
 WHERE d.Name = 'MAINTENANCE SEC.'
   AND u.name = 'Tube Cutting'
ON DUPLICATE KEY UPDATE DepartmentID = VALUES(DepartmentID);
