-- Safety Vote Phase 4 Jury, Scoring and Multi-stage
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive and idempotent. Runtime must not execute DDL.

ALTER TABLE SafetyVote_Questions
  ADD COLUMN IF NOT EXISTS StageID BIGINT NULL AFTER CampaignVersionID,
  ADD COLUMN IF NOT EXISTS Weight DECIMAL(9,4) NOT NULL DEFAULT 1 AFTER MaxSelections;
CREATE INDEX IF NOT EXISTS idx_sv_question_stage ON SafetyVote_Questions(StageID,Status,SortOrder);

ALTER TABLE SafetyVote_Candidates
  ADD COLUMN IF NOT EXISTS StageID BIGINT NULL AFTER CampaignVersionID,
  ADD COLUMN IF NOT EXISTS SubmissionID BIGINT NULL AFTER OptionID,
  ADD COLUMN IF NOT EXISTS CandidateNo VARCHAR(50) NULL AFTER SubmissionID,
  ADD COLUMN IF NOT EXISTS SortOrder INT NOT NULL DEFAULT 1 AFTER Status;
CREATE INDEX IF NOT EXISTS idx_sv_candidate_stage ON SafetyVote_Candidates(StageID,Status,SortOrder);

ALTER TABLE SafetyVote_Submissions ADD COLUMN IF NOT EXISTS StageID BIGINT NULL AFTER CampaignVersionID;
CREATE INDEX IF NOT EXISTS idx_sv_submission_stage ON SafetyVote_Submissions(StageID,Status);

CREATE TABLE IF NOT EXISTS SafetyVote_JuryCriteria (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignVersionID BIGINT NOT NULL, StageID BIGINT NULL,
 CriterionCode VARCHAR(50) NOT NULL, Title VARCHAR(300) NOT NULL, Description VARCHAR(2000) NULL,
 MinScore DECIMAL(12,4) NOT NULL DEFAULT 0, MaxScore DECIMAL(12,4) NOT NULL DEFAULT 10,
 Weight DECIMAL(9,4) NOT NULL DEFAULT 1, SortOrder INT NOT NULL DEFAULT 1, IsActive TINYINT(1) NOT NULL DEFAULT 1,
 RowVersion INT NOT NULL DEFAULT 1, CreatedBy VARCHAR(20) NOT NULL, UpdatedBy VARCHAR(20) NOT NULL,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_jury_criterion(CampaignVersionID,StageID,CriterionCode),
 KEY idx_sv_jury_criterion_stage(CampaignVersionID,StageID,IsActive,SortOrder),
 CONSTRAINT fk_sv_jury_criterion_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_jury_criterion_stage FOREIGN KEY(StageID) REFERENCES SafetyVote_Stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_JuryAssignments (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignVersionID BIGINT NOT NULL, StageID BIGINT NOT NULL,
 JurorEmployeeID VARCHAR(20) NOT NULL, CandidateID BIGINT NULL, AssignmentScope VARCHAR(30) NOT NULL DEFAULT 'stage',
 Status VARCHAR(24) NOT NULL DEFAULT 'Draft', ConflictState VARCHAR(24) NOT NULL DEFAULT 'clear', ConflictReason VARCHAR(1000) NULL,
 SheetVersion INT NOT NULL DEFAULT 1, SubmittedAt DATETIME NULL, ReopenedAt DATETIME NULL, ReopenedBy VARCHAR(20) NULL,
 ReopenReason VARCHAR(1000) NULL, RowVersion INT NOT NULL DEFAULT 1, AssignedBy VARCHAR(20) NOT NULL,
 AssignedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_jury_assignment(CampaignVersionID,StageID,JurorEmployeeID,CandidateID,SheetVersion),
 KEY idx_sv_jury_assignee(JurorEmployeeID,Status), KEY idx_sv_jury_progress(CampaignVersionID,StageID,Status),
 CONSTRAINT fk_sv_jury_assignment_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_jury_assignment_stage FOREIGN KEY(StageID) REFERENCES SafetyVote_Stages(id),
 CONSTRAINT fk_sv_jury_assignment_candidate FOREIGN KEY(CandidateID) REFERENCES SafetyVote_Candidates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_JuryScores (
 id BIGINT NOT NULL AUTO_INCREMENT, AssignmentID BIGINT NOT NULL, CandidateID BIGINT NOT NULL, CriterionID BIGINT NOT NULL,
 Score DECIMAL(12,4) NOT NULL, BoundedComment VARCHAR(1000) NULL, Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
 SubmittedAt DATETIME NULL, RowVersion INT NOT NULL DEFAULT 1, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_jury_score(AssignmentID,CandidateID,CriterionID),
 KEY idx_sv_jury_score_candidate(CandidateID,Status),
 CONSTRAINT fk_sv_jury_score_assignment FOREIGN KEY(AssignmentID) REFERENCES SafetyVote_JuryAssignments(id),
 CONSTRAINT fk_sv_jury_score_candidate FOREIGN KEY(CandidateID) REFERENCES SafetyVote_Candidates(id),
 CONSTRAINT fk_sv_jury_score_criterion FOREIGN KEY(CriterionID) REFERENCES SafetyVote_JuryCriteria(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_ResultSnapshots (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NOT NULL, CampaignVersionID BIGINT NOT NULL, StageID BIGINT NULL,
 SnapshotNo INT NOT NULL, CalculationContract VARCHAR(80) NOT NULL, EligibilitySnapshotID BIGINT NULL,
 Status VARCHAR(24) NOT NULL DEFAULT 'Calculated', EligibleCount INT NOT NULL DEFAULT 0, ParticipationCount INT NOT NULL DEFAULT 0,
 AcceptedBallotCount INT NOT NULL DEFAULT 0, RejectedBallotCount INT NOT NULL DEFAULT 0, AbstainCount INT NOT NULL DEFAULT 0,
 QuorumState VARCHAR(24) NOT NULL, TieState VARCHAR(24) NOT NULL, ReconciliationState VARCHAR(24) NOT NULL,
 InputHash CHAR(64) NOT NULL, ResultHash CHAR(64) NOT NULL, CalculatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CalculatedBy VARCHAR(20) NOT NULL, FrozenAt DATETIME NULL, FrozenBy VARCHAR(20) NULL,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_result_snapshot(CampaignVersionID,StageID,SnapshotNo),
 KEY idx_sv_result_status(CampaignID,Status,CalculatedAt),
 CONSTRAINT fk_sv_result_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_result_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_result_stage FOREIGN KEY(StageID) REFERENCES SafetyVote_Stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_ResultRows (
 id BIGINT NOT NULL AUTO_INCREMENT, ResultSnapshotID BIGINT NOT NULL, StageID BIGINT NULL, QuestionID BIGINT NULL,
 OptionID BIGINT NULL, CandidateID BIGINT NULL, MetricKey VARCHAR(50) NOT NULL, RawCount INT NULL,
 Numerator DECIMAL(18,4) NULL, Denominator DECIMAL(18,4) NULL, NumericValue DECIMAL(18,6) NULL,
 RankNo INT NULL, ResultState VARCHAR(30) NOT NULL DEFAULT 'normal', MetadataJson TEXT NULL,
 PRIMARY KEY(id), KEY idx_sv_result_row_rank(ResultSnapshotID,MetricKey,RankNo),
 CONSTRAINT fk_sv_result_row_snapshot FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id),
 CONSTRAINT fk_sv_result_row_stage FOREIGN KEY(StageID) REFERENCES SafetyVote_Stages(id),
 CONSTRAINT fk_sv_result_row_question FOREIGN KEY(QuestionID) REFERENCES SafetyVote_Questions(id),
 CONSTRAINT fk_sv_result_row_option FOREIGN KEY(OptionID) REFERENCES SafetyVote_Options(id),
 CONSTRAINT fk_sv_result_row_candidate FOREIGN KEY(CandidateID) REFERENCES SafetyVote_Candidates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Certifications (
 id BIGINT NOT NULL AUTO_INCREMENT, ResultSnapshotID BIGINT NOT NULL, CertifierEmployeeID VARCHAR(20) NOT NULL,
 CertificationRole VARCHAR(30) NOT NULL DEFAULT 'certifier', Decision VARCHAR(20) NOT NULL, Reason VARCHAR(1000) NOT NULL,
 ResultHashSnapshot CHAR(64) NOT NULL, CertifiedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 RevokedAt DATETIME NULL, RevokedBy VARCHAR(20) NULL, RevokeReason VARCHAR(1000) NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_certifier(ResultSnapshotID,CertifierEmployeeID,CertificationRole),
 KEY idx_sv_certification_active(ResultSnapshotID,Decision,RevokedAt),
 CONSTRAINT fk_sv_certification_result FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_StageAdvancements (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignVersionID BIGINT NOT NULL, FromStageID BIGINT NOT NULL, ToStageID BIGINT NOT NULL,
 CandidateID BIGINT NOT NULL, ResultSnapshotID BIGINT NOT NULL, Decision VARCHAR(24) NOT NULL DEFAULT 'advanced',
 RuleHash CHAR(64) NOT NULL, Reason VARCHAR(1000) NULL, AdvancedBy VARCHAR(20) NOT NULL,
 AdvancedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_stage_advancement(FromStageID,ToStageID,CandidateID),
 KEY idx_sv_stage_advancement_to(ToStageID,Decision),
 CONSTRAINT fk_sv_adv_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_adv_from FOREIGN KEY(FromStageID) REFERENCES SafetyVote_Stages(id),
 CONSTRAINT fk_sv_adv_to FOREIGN KEY(ToStageID) REFERENCES SafetyVote_Stages(id),
 CONSTRAINT fk_sv_adv_candidate FOREIGN KEY(CandidateID) REFERENCES SafetyVote_Candidates(id),
 CONSTRAINT fk_sv_adv_result FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-08-phase4-r1','migration'),('module_enabled','0','migration'),
('phase4_contract','2026-10-08-safety-vote-phase4-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
