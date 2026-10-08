-- Safety Vote Phase 1 foundation
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive only. Runtime must never execute this file or create/alter these tables.

CREATE TABLE IF NOT EXISTS SafetyVote_Settings (
    SettingKey VARCHAR(80) NOT NULL,
    SettingValue TEXT NOT NULL,
    UpdatedBy VARCHAR(20) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (SettingKey)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Campaigns (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignCode VARCHAR(40) NOT NULL,
    CurrentVersionID BIGINT NULL,
    Status VARCHAR(32) NOT NULL DEFAULT 'Draft',
    OwnerEmployeeID VARCHAR(20) NOT NULL,
    DiscoveryMode VARCHAR(24) NOT NULL DEFAULT 'eligible_only',
    ScheduledOpenAt DATETIME NULL,
    ScheduledCloseAt DATETIME NULL,
    OpenedAt DATETIME NULL,
    ClosedAt DATETIME NULL,
    CertifiedAt DATETIME NULL,
    PublishedAt DATETIME NULL,
    ArchivedAt DATETIME NULL,
    VoidedAt DATETIME NULL,
    VoidReason VARCHAR(500) NULL,
    VoidedBy VARCHAR(20) NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_campaign_code (CampaignCode),
    KEY idx_sv_campaign_status_schedule (Status,ScheduledOpenAt,ScheduledCloseAt),
    KEY idx_sv_campaign_owner (OwnerEmployeeID,Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_CampaignVersions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignID BIGINT NOT NULL,
    VersionNo INT NOT NULL DEFAULT 1,
    ContractVersion VARCHAR(80) NOT NULL,
    TemplateKey VARCHAR(50) NOT NULL DEFAULT 'blank',
    CampaignType VARCHAR(40) NOT NULL DEFAULT 'popular_vote',
    PrivacyMode VARCHAR(24) NOT NULL DEFAULT 'identified',
    TitleTh VARCHAR(200) NOT NULL,
    TitleEn VARCHAR(200) NULL,
    Summary VARCHAR(500) NULL,
    Description TEXT NULL,
    RulesText TEXT NULL,
    TimeZone VARCHAR(50) NOT NULL DEFAULT 'Asia/Bangkok',
    OpenAt DATETIME NULL,
    CloseAt DATETIME NULL,
    ResultVisibility VARCHAR(24) NOT NULL DEFAULT 'hidden_until_close',
    EditPolicy VARCHAR(24) NOT NULL DEFAULT 'none',
    ScoringMethod VARCHAR(40) NOT NULL DEFAULT 'raw_count',
    ScoringConfigJson TEXT NULL,
    TieBreakRule VARCHAR(80) NULL,
    QuorumRuleJson TEXT NULL,
    PrivacyThreshold INT NOT NULL DEFAULT 5,
    AllowAbstain TINYINT(1) NOT NULL DEFAULT 0,
    RandomizeOptions TINYINT(1) NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    ConfigHash CHAR(64) NULL,
    FrozenAt DATETIME NULL,
    FrozenBy VARCHAR(20) NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_campaign_version (CampaignID,VersionNo),
    KEY idx_sv_version_status (CampaignID,Status),
    CONSTRAINT fk_sv_version_campaign FOREIGN KEY (CampaignID) REFERENCES SafetyVote_Campaigns(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Stages (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    StageKey VARCHAR(50) NOT NULL,
    StageName VARCHAR(160) NOT NULL,
    StageType VARCHAR(40) NOT NULL DEFAULT 'vote',
    SequenceNo INT NOT NULL DEFAULT 1,
    OpenAt DATETIME NULL,
    CloseAt DATETIME NULL,
    AdvanceRuleJson TEXT NULL,
    ResultVisibility VARCHAR(24) NOT NULL DEFAULT 'hidden_until_close',
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_stage_key (CampaignVersionID,StageKey),
    UNIQUE KEY uq_sv_stage_sequence (CampaignVersionID,SequenceNo),
    CONSTRAINT fk_sv_stage_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_EligibilityRules (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    RuleGroup INT NOT NULL DEFAULT 1,
    RuleOrder INT NOT NULL DEFAULT 1,
    Effect VARCHAR(12) NOT NULL,
    AttributeKey VARCHAR(40) NOT NULL,
    Operator VARCHAR(20) NOT NULL,
    ValuesJson TEXT NOT NULL,
    Reason VARCHAR(255) NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_rule_order (CampaignVersionID,RuleGroup,RuleOrder),
    KEY idx_sv_rule_active (CampaignVersionID,IsActive),
    CONSTRAINT fk_sv_rule_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_EligibilitySnapshots (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    SnapshotNo INT NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'building',
    RuleHash CHAR(64) NOT NULL,
    RowsHash CHAR(64) NULL,
    EligibleCount INT NOT NULL DEFAULT 0,
    AccountReadyCount INT NOT NULL DEFAULT 0,
    WarningCount INT NOT NULL DEFAULT 0,
    FrozenAt DATETIME NULL,
    FrozenBy VARCHAR(20) NULL,
    Reason VARCHAR(500) NULL,
    CreatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_snapshot_no (CampaignVersionID,SnapshotNo),
    KEY idx_sv_snapshot_status (CampaignVersionID,Status),
    CONSTRAINT fk_sv_snapshot_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_EligibleVoters (
    id BIGINT NOT NULL AUTO_INCREMENT,
    SnapshotID BIGINT NOT NULL,
    EmployeeID VARCHAR(20) NOT NULL,
    EmployeeNameSnapshot VARCHAR(255) NULL,
    DepartmentIDSnapshot INT NULL,
    DepartmentNameSnapshot VARCHAR(100) NULL,
    SafetyUnitIDSnapshot INT NULL,
    SafetyUnitNameSnapshot VARCHAR(100) NULL,
    PositionIDSnapshot INT NULL,
    PositionNameSnapshot VARCHAR(100) NULL,
    RoleSnapshot VARCHAR(50) NULL,
    TeamSnapshot VARCHAR(100) NULL,
    MasterPresent TINYINT(1) NOT NULL DEFAULT 1,
    AccountReady TINYINT(1) NOT NULL DEFAULT 0,
    EligibilityState VARCHAR(20) NOT NULL DEFAULT 'eligible',
    InclusionSource VARCHAR(40) NOT NULL,
    InclusionReason VARCHAR(255) NULL,
    OverrideBy VARCHAR(20) NULL,
    OverrideAt DATETIME NULL,
    OverrideReason VARCHAR(255) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_snapshot_employee (SnapshotID,EmployeeID),
    KEY idx_sv_voter_scope (SnapshotID,DepartmentIDSnapshot,SafetyUnitIDSnapshot),
    CONSTRAINT fk_sv_voter_snapshot FOREIGN KEY (SnapshotID) REFERENCES SafetyVote_EligibilitySnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_CampaignRoles (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    EmployeeID VARCHAR(20) NOT NULL,
    CampaignRole VARCHAR(40) NOT NULL,
    StageID BIGINT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    Reason VARCHAR(255) NULL,
    AssignedBy VARCHAR(20) NOT NULL,
    AssignedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    RevokedBy VARCHAR(20) NULL,
    RevokedAt DATETIME NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_campaign_role (CampaignVersionID,EmployeeID,CampaignRole,StageID),
    KEY idx_sv_role_employee (EmployeeID,IsActive),
    CONSTRAINT fk_sv_role_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
    CONSTRAINT fk_sv_role_stage FOREIGN KEY (StageID) REFERENCES SafetyVote_Stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Files (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignID BIGINT NOT NULL,
    CampaignVersionID BIGINT NOT NULL,
    FilePurpose VARCHAR(40) NOT NULL,
    StorageClass VARCHAR(40) NOT NULL DEFAULT 'private_campaign',
    StoredName VARCHAR(255) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(100) NOT NULL,
    FileSize BIGINT NOT NULL,
    ContentSha256 CHAR(64) NOT NULL,
    WidthPx INT NULL,
    HeightPx INT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    UploadedBy VARCHAR(20) NOT NULL,
    UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    RemovedBy VARCHAR(20) NULL,
    RemovedAt DATETIME NULL,
    RemovalReason VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sv_file_stored (StoredName),
    KEY idx_sv_file_campaign (CampaignID,CampaignVersionID,Status),
    CONSTRAINT fk_sv_file_campaign FOREIGN KEY (CampaignID) REFERENCES SafetyVote_Campaigns(id),
    CONSTRAINT fk_sv_file_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_AuditLogs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignID BIGINT NULL,
    CampaignVersionID BIGINT NULL,
    ActorEmployeeID VARCHAR(20) NOT NULL,
    ActorRole VARCHAR(50) NULL,
    Action VARCHAR(80) NOT NULL,
    TargetType VARCHAR(80) NULL,
    TargetID VARCHAR(100) NULL,
    StatusCode INT NOT NULL DEFAULT 200,
    ReasonCode VARCHAR(80) NULL,
    BoundedDetail VARCHAR(1000) NULL,
    MetadataJson TEXT NULL,
    IPAddress VARCHAR(80) NULL,
    UserAgent VARCHAR(255) NULL,
    OccurredAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sv_audit_campaign (CampaignID,OccurredAt),
    KEY idx_sv_audit_actor (ActorEmployeeID,OccurredAt),
    KEY idx_sv_audit_action (Action,OccurredAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('contract_version','2026-10-08-safety-vote-phase0-r1','migration'),
('schema_version','2026-10-08-phase1-r1','migration'),
('module_enabled','0','migration'),
('default_timezone','Asia/Bangkok','migration'),
('default_privacy_threshold','5','migration'),
('max_upload_bytes','10485760','migration'),
('allowed_file_types','image/jpeg,image/png,image/webp,application/pdf','migration')
ON DUPLICATE KEY UPDATE SettingKey=VALUES(SettingKey);

INSERT IGNORE INTO Admin_RolePermissions(role,permission,granted)
SELECT r.role,p.permission,IF(r.role='ADMIN',1,IF(p.permission='SAFETY_VOTE_VIEW',1,0))
FROM (
    SELECT 'ADMIN' role UNION ALL SELECT 'USER' UNION ALL SELECT 'VIEWER' UNION ALL
    SELECT 'EXECUTIVE' UNION ALL SELECT 'MANAGER' UNION ALL SELECT 'STAFF' UNION ALL SELECT 'SAFETY_OFFICER'
) r
CROSS JOIN (
    SELECT 'SAFETY_VOTE_VIEW' permission UNION ALL SELECT 'SAFETY_VOTE_CREATE' UNION ALL
    SELECT 'SAFETY_VOTE_MANAGE' UNION ALL SELECT 'SAFETY_VOTE_ELIGIBILITY_MANAGE' UNION ALL
    SELECT 'SAFETY_VOTE_SUBMISSION_REVIEW' UNION ALL SELECT 'SAFETY_VOTE_JURY' UNION ALL
    SELECT 'SAFETY_VOTE_RESULT_VIEW' UNION ALL SELECT 'SAFETY_VOTE_CERTIFY' UNION ALL
    SELECT 'SAFETY_VOTE_EXPORT' UNION ALL SELECT 'SAFETY_VOTE_AUDIT_VIEW' UNION ALL
    SELECT 'SAFETY_VOTE_ADMIN'
) p;

UPDATE SafetyVote_Settings
SET SettingValue='0',UpdatedBy='migration'
WHERE SettingKey='module_enabled';
