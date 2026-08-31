-- BBS Smart Card Phase 9: Admin-appointed inspectors with controlled self-service teams.
-- Additive migration only. Existing hierarchy assignments and observations remain unchanged.

CREATE TABLE IF NOT EXISTS BBS_Inspector_Enrollments (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    InspectorEmployeeID   VARCHAR(20)  NOT NULL,
    DepartmentID          INT          NOT NULL,
    SafetyUnitID          INT          NOT NULL,
    Status                VARCHAR(20)  NOT NULL DEFAULT 'Active',
    KpiRequired           TINYINT(1)   NOT NULL DEFAULT 1,
    AllowSelfManage       TINYINT(1)   NOT NULL DEFAULT 1,
    EffectiveFrom         DATE         NOT NULL,
    EffectiveTo           DATE         NULL,
    IsActive              TINYINT(1)   NOT NULL DEFAULT 1,
    Reason                VARCHAR(255) NULL,
    RowVersion            INT          NOT NULL DEFAULT 1,
    CreatedBy             VARCHAR(20)  NULL,
    UpdatedBy             VARCHAR(20)  NULL,
    CreatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_inspector_employee_effective (InspectorEmployeeID, IsActive, EffectiveFrom, EffectiveTo),
    KEY idx_bbs_inspector_scope_effective (DepartmentID, SafetyUnitID, Status, IsActive, EffectiveFrom, EffectiveTo),
    KEY idx_bbs_inspector_kpi_effective (KpiRequired, Status, IsActive, EffectiveFrom, EffectiveTo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Inspector_Team_Events (
    id                    BIGINT       NOT NULL AUTO_INCREMENT,
    EnrollmentID          BIGINT       NOT NULL,
    AssignmentID          BIGINT       NULL,
    InspectorEmployeeID   VARCHAR(20)  NOT NULL,
    MemberEmployeeID      VARCHAR(20)  NOT NULL,
    EventType             VARCHAR(20)  NOT NULL,
    ActorEmployeeID       VARCHAR(20)  NOT NULL,
    ActorMode             VARCHAR(20)  NOT NULL,
    Reason                VARCHAR(255) NULL,
    CreatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_inspector_event_enrollment (EnrollmentID, CreatedAt),
    KEY idx_bbs_inspector_event_member (MemberEmployeeID, CreatedAt),
    KEY idx_bbs_inspector_event_actor (ActorEmployeeID, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('inspector_team_management_enabled', '1')
ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue);
