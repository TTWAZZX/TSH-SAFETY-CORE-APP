-- Safety Vote Phase 10.4 media links, version lineage and post-open edit policy.
-- Additive and idempotent. Runtime must never execute DDL.

ALTER TABLE SafetyVote_CampaignVersions
  ADD COLUMN IF NOT EXISTS ParentVersionID BIGINT NULL AFTER CampaignID,
  ADD COLUMN IF NOT EXISTS ChangeReason VARCHAR(500) NULL AFTER ParentVersionID;

CREATE INDEX IF NOT EXISTS idx_sv_version_parent ON SafetyVote_CampaignVersions(ParentVersionID);

CREATE TABLE IF NOT EXISTS SafetyVote_MediaLinks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  CampaignID BIGINT NOT NULL,
  CampaignVersionID BIGINT NOT NULL,
  ScopeType VARCHAR(16) NOT NULL,
  QuestionCode VARCHAR(60) NULL,
  OptionCode VARCHAR(60) NULL,
  MediaType VARCHAR(16) NOT NULL,
  Provider VARCHAR(24) NOT NULL DEFAULT 'external',
  Url VARCHAR(1000) NOT NULL,
  EmbedUrl VARCHAR(1000) NULL,
  Title VARCHAR(200) NULL,
  SortOrder INT NOT NULL DEFAULT 1,
  Status VARCHAR(16) NOT NULL DEFAULT 'Active',
  CreatedBy VARCHAR(20) NOT NULL,
  UpdatedBy VARCHAR(20) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  KEY idx_sv_media_version(CampaignVersionID,Status,SortOrder),
  CONSTRAINT fk_sv_media_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_media_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-09-phase10.4-r1','migration'),
('phase10_4_contract','2026-10-09-safety-vote-phase10.4-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
