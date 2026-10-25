-- Safety Vote eligibility amendments foundation.
-- Additive and idempotent. Runtime must never execute DDL.
-- The feature remains disabled until the guarded Node/PHP workflow is released.
-- Enrollment modes: closed_after_open, admin_approval, automatic_rule_match.

ALTER TABLE SafetyVote_CampaignVersions
  ADD COLUMN IF NOT EXISTS EligibilityEnrollmentMode VARCHAR(32) NOT NULL DEFAULT 'closed_after_open',
  ADD COLUMN IF NOT EXISTS EligibilityEnrollmentUpdatedAt DATETIME NULL,
  ADD COLUMN IF NOT EXISTS EligibilityEnrollmentUpdatedBy VARCHAR(20) NULL;

ALTER TABLE SafetyVote_EligibilitySnapshots
  ADD COLUMN IF NOT EXISTS ParentSnapshotID BIGINT NULL,
  ADD COLUMN IF NOT EXISTS SnapshotKind VARCHAR(32) NOT NULL DEFAULT 'initial_freeze';

CREATE INDEX IF NOT EXISTS idx_sv_snapshot_lineage
  ON SafetyVote_EligibilitySnapshots(CampaignVersionID,ParentSnapshotID,SnapshotNo);

CREATE TABLE IF NOT EXISTS SafetyVote_EligibilityAmendments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  CampaignID BIGINT NOT NULL,
  CampaignVersionID BIGINT NOT NULL,
  SourceSnapshotID BIGINT NOT NULL,
  ResultSnapshotID BIGINT NULL,
  EnrollmentMode VARCHAR(32) NOT NULL,
  RequestType VARCHAR(32) NOT NULL,
  Status VARCHAR(24) NOT NULL DEFAULT 'Pending',
  Reason VARCHAR(500) NOT NULL,
  CandidateCount INT NOT NULL DEFAULT 0,
  ApprovedCount INT NOT NULL DEFAULT 0,
  AddedCount INT NOT NULL DEFAULT 0,
  SkippedCount INT NOT NULL DEFAULT 0,
  BeforeRowsHash CHAR(64) NOT NULL,
  CandidateSetHash CHAR(64) NOT NULL,
  AfterRowsHash CHAR(64) NULL,
  IdempotencyKeyHash CHAR(64) NULL,
  RequestedBy VARCHAR(20) NOT NULL,
  RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ReviewedBy VARCHAR(20) NULL,
  ReviewedAt DATETIME NULL,
  AppliedBy VARCHAR(20) NULL,
  AppliedAt DATETIME NULL,
  RejectedBy VARCHAR(20) NULL,
  RejectedAt DATETIME NULL,
  RejectionReason VARCHAR(500) NULL,
  MetadataJson TEXT NULL,
  RowVersion INT NOT NULL DEFAULT 1,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_elig_amend_result_snapshot (ResultSnapshotID),
  UNIQUE KEY uq_sv_elig_amend_request (CampaignVersionID,IdempotencyKeyHash),
  KEY idx_sv_elig_amend_campaign (CampaignID,Status,RequestedAt),
  KEY idx_sv_elig_amend_version (CampaignVersionID,Status,RequestedAt),
  CONSTRAINT fk_sv_elig_amend_campaign FOREIGN KEY (CampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_elig_amend_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
  CONSTRAINT fk_sv_elig_amend_source_snapshot FOREIGN KEY (SourceSnapshotID) REFERENCES SafetyVote_EligibilitySnapshots(id),
  CONSTRAINT fk_sv_elig_amend_result_snapshot FOREIGN KEY (ResultSnapshotID) REFERENCES SafetyVote_EligibilitySnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_EligibilityAmendmentMembers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  AmendmentID BIGINT NOT NULL,
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
  SourceType VARCHAR(32) NOT NULL,
  SourceReason VARCHAR(255) NULL,
  MasterWarningsJson TEXT NULL,
  MemberStatus VARCHAR(24) NOT NULL DEFAULT 'Proposed',
  DecisionReason VARCHAR(500) NULL,
  DecidedBy VARCHAR(20) NULL,
  DecidedAt DATETIME NULL,
  AppliedAt DATETIME NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_elig_amend_member (AmendmentID,EmployeeID),
  KEY idx_sv_elig_amend_member_status (AmendmentID,MemberStatus,EmployeeID),
  KEY idx_sv_elig_amend_employee (EmployeeID,CreatedAt),
  CONSTRAINT fk_sv_elig_amend_member_parent FOREIGN KEY (AmendmentID) REFERENCES SafetyVote_EligibilityAmendments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_EligibilityAmendmentEvents (
  id BIGINT NOT NULL AUTO_INCREMENT,
  AmendmentID BIGINT NOT NULL,
  CampaignID BIGINT NOT NULL,
  CampaignVersionID BIGINT NOT NULL,
  EventSequence INT NOT NULL,
  EventType VARCHAR(64) NOT NULL,
  ActorEmployeeID VARCHAR(20) NOT NULL,
  ActorRole VARCHAR(50) NULL,
  FromStatus VARCHAR(24) NULL,
  ToStatus VARCHAR(24) NULL,
  ReasonCode VARCHAR(80) NULL,
  BoundedDetail VARCHAR(1000) NULL,
  MetadataJson TEXT NULL,
  PreviousEventHash CHAR(64) NULL,
  EventHash CHAR(64) NOT NULL,
  IPAddress VARCHAR(80) NULL,
  UserAgent VARCHAR(255) NULL,
  OccurredAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_elig_amend_event_sequence (AmendmentID,EventSequence),
  UNIQUE KEY uq_sv_elig_amend_event_hash (AmendmentID,EventHash),
  KEY idx_sv_elig_amend_event_campaign (CampaignID,OccurredAt),
  KEY idx_sv_elig_amend_event_actor (ActorEmployeeID,OccurredAt),
  CONSTRAINT fk_sv_elig_amend_event_parent FOREIGN KEY (AmendmentID) REFERENCES SafetyVote_EligibilityAmendments(id),
  CONSTRAINT fk_sv_elig_amend_event_campaign FOREIGN KEY (CampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_elig_amend_event_version FOREIGN KEY (CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-20-eligibility-amendments-r1','migration'),
('eligibility_amendment_contract','2026-10-20-safety-vote-eligibility-amendments-r1','migration'),
('eligibility_amendment_default_mode','closed_after_open','migration'),
('eligibility_amendment_allowed_modes','closed_after_open,admin_approval,automatic_rule_match','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';

-- First install is fail-closed; rerunning this migration must not silently disable
-- a feature gate that was explicitly activated after deployment.
INSERT IGNORE INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('eligibility_amendment_enabled','0','migration');
