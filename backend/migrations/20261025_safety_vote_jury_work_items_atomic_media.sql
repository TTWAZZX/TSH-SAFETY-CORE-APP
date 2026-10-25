-- Safety Vote Jury Work Items and Atomic Media backend.
-- Additive/idempotent. Runtime code must never execute DDL.

ALTER TABLE SafetyVote_CampaignVersions
  ADD COLUMN IF NOT EXISTS WorkSource VARCHAR(32) NULL AFTER CampaignType;

ALTER TABLE SafetyVote_Candidates
  MODIFY COLUMN OptionID BIGINT NULL,
  ADD COLUMN IF NOT EXISTS SourceType VARCHAR(32) NOT NULL DEFAULT 'legacy_option' AFTER CandidateNo,
  ADD COLUMN IF NOT EXISTS SourceCampaignID BIGINT NULL AFTER SourceType,
  ADD COLUMN IF NOT EXISTS SourceCandidateID BIGINT NULL AFTER SourceCampaignID;

CREATE INDEX IF NOT EXISTS idx_sv_candidate_source
  ON SafetyVote_Candidates(CampaignVersionID,SourceType,Status,SortOrder);

CREATE TABLE IF NOT EXISTS SafetyVote_MediaMutations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  CampaignID BIGINT NOT NULL,
  CampaignVersionID BIGINT NOT NULL,
  ScopeType VARCHAR(32) NOT NULL,
  ScopeID BIGINT NOT NULL,
  Action VARCHAR(24) NOT NULL,
  FileID BIGINT NULL,
  PriorFileID BIGINT NULL,
  RequestKey VARCHAR(100) NOT NULL,
  PayloadSha256 CHAR(64) NOT NULL,
  ActorEmployeeID VARCHAR(20) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_sv_media_mutation_request(CampaignID,RequestKey),
  KEY idx_sv_media_mutation_scope(CampaignVersionID,ScopeType,ScopeID,CreatedAt),
  KEY idx_sv_media_mutation_file(FileID),
  CONSTRAINT fk_sv_media_mutation_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_media_mutation_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
  CONSTRAINT fk_sv_media_mutation_file FOREIGN KEY(FileID) REFERENCES SafetyVote_Files(id),
  CONSTRAINT fk_sv_media_mutation_prior_file FOREIGN KEY(PriorFileID) REFERENCES SafetyVote_Files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-25-jury-work-items-atomic-media-r1','migration'),
('jury_work_items_contract','2026-10-25-jury-work-items-r1','migration'),
('atomic_media_contract','2026-10-25-atomic-media-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
