-- Safety Vote Phase 6 Certified Secret Election
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive/idempotent. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_ElectionPositions (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignVersionID BIGINT NOT NULL, QuestionID BIGINT NOT NULL,
 PositionCode VARCHAR(50) NOT NULL, Title VARCHAR(300) NOT NULL, SeatCount INT NOT NULL DEFAULT 1,
 MaxSelections INT NOT NULL DEFAULT 1, AllowAbstain TINYINT(1) NOT NULL DEFAULT 1,
 TieRule VARCHAR(30) NOT NULL DEFAULT 'unresolved', SortOrder INT NOT NULL DEFAULT 1,
 ConfigHash CHAR(64) NOT NULL, CreatedBy VARCHAR(20) NOT NULL, CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_election_position(CampaignVersionID,PositionCode),
 KEY idx_sv_election_position_order(CampaignVersionID,SortOrder),
 CONSTRAINT fk_sv_election_position_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_election_position_question FOREIGN KEY(QuestionID) REFERENCES SafetyVote_Questions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_ElectionPositionCandidates (
 PositionID BIGINT NOT NULL, CandidateID BIGINT NOT NULL, SortOrder INT NOT NULL DEFAULT 1,
 CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(PositionID,CandidateID), KEY idx_sv_election_candidate(CandidateID,PositionID),
 CONSTRAINT fk_sv_epc_position FOREIGN KEY(PositionID) REFERENCES SafetyVote_ElectionPositions(id),
 CONSTRAINT fk_sv_epc_candidate FOREIGN KEY(CandidateID) REFERENCES SafetyVote_Candidates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_CertifierAssignments (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignVersionID BIGINT NOT NULL, EmployeeID VARCHAR(20) NOT NULL,
 ControlRole VARCHAR(30) NOT NULL, IsActive TINYINT(1) NOT NULL DEFAULT 1,
 AssignedBy VARCHAR(20) NOT NULL, AssignedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 RevokedAt DATETIME NULL, RevokedBy VARCHAR(20) NULL, RevokeReason VARCHAR(1000) NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_sv_certifier_assignment(CampaignVersionID,EmployeeID,ControlRole),
 KEY idx_sv_certifier_active(CampaignVersionID,IsActive,ControlRole),
 CONSTRAINT fk_sv_certifier_assignment_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_ResultActions (
 id BIGINT NOT NULL AUTO_INCREMENT, CampaignID BIGINT NOT NULL, CampaignVersionID BIGINT NOT NULL,
 ResultSnapshotID BIGINT NULL, PriorResultSnapshotID BIGINT NULL,
 ActionType VARCHAR(24) NOT NULL, Status VARCHAR(24) NOT NULL DEFAULT 'Completed',
 Reason VARCHAR(1000) NOT NULL, InputHash CHAR(64) NULL, ResultHash CHAR(64) NULL,
 RequestedBy VARCHAR(20) NOT NULL, RequestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CompletedAt DATETIME NULL, MetadataJson TEXT NULL,
 PRIMARY KEY(id), KEY idx_sv_result_action(CampaignID,ActionType,RequestedAt),
 CONSTRAINT fk_sv_result_action_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
 CONSTRAINT fk_sv_result_action_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
 CONSTRAINT fk_sv_result_action_snapshot FOREIGN KEY(ResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id),
 CONSTRAINT fk_sv_result_action_prior FOREIGN KEY(PriorResultSnapshotID) REFERENCES SafetyVote_ResultSnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE SafetyVote_ResultSnapshots
 ADD COLUMN IF NOT EXISTS ParentSnapshotID BIGINT NULL AFTER StageID,
 ADD COLUMN IF NOT EXISTS CalculationRunType VARCHAR(20) NOT NULL DEFAULT 'initial' AFTER CalculationContract;
CREATE INDEX IF NOT EXISTS idx_sv_result_parent ON SafetyVote_ResultSnapshots(ParentSnapshotID,SnapshotNo);

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-08-phase6-r1','migration'),('module_enabled','1','migration'),
('phase6_contract','2026-10-08-safety-vote-phase6-r1','migration'),
('secret_election_min_certifiers','2','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
