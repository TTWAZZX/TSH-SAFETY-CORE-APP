-- Safety Vote campaign visibility and retention governance.
-- Additive and idempotent. Purge evidence is retained outside the campaign FK graph.

ALTER TABLE SafetyVote_Campaigns
  ADD COLUMN IF NOT EXISTS IsHidden TINYINT(1) NOT NULL DEFAULT 0 AFTER DiscoveryMode,
  ADD COLUMN IF NOT EXISTS HiddenAt DATETIME NULL AFTER IsHidden,
  ADD COLUMN IF NOT EXISTS HiddenBy VARCHAR(20) NULL AFTER HiddenAt,
  ADD COLUMN IF NOT EXISTS HideReason VARCHAR(500) NULL AFTER HiddenBy,
  ADD COLUMN IF NOT EXISTS IsTest TINYINT(1) NOT NULL DEFAULT 0 AFTER HideReason,
  ADD COLUMN IF NOT EXISTS TestMarkedAt DATETIME NULL AFTER IsTest,
  ADD COLUMN IF NOT EXISTS TestMarkedBy VARCHAR(20) NULL AFTER TestMarkedAt,
  ADD COLUMN IF NOT EXISTS TestReason VARCHAR(500) NULL AFTER TestMarkedBy,
  ADD COLUMN IF NOT EXISTS ArchivedFromStatus VARCHAR(32) NULL AFTER ArchivedAt,
  ADD COLUMN IF NOT EXISTS ArchivedBy VARCHAR(20) NULL AFTER ArchivedFromStatus,
  ADD COLUMN IF NOT EXISTS ArchiveReason VARCHAR(500) NULL AFTER ArchivedBy;

CREATE INDEX IF NOT EXISTS idx_sv_campaign_visibility
  ON SafetyVote_Campaigns(IsHidden,IsTest,Status,UpdatedAt);

CREATE TABLE IF NOT EXISTS SafetyVote_CampaignPurgeLog (
  id BIGINT NOT NULL AUTO_INCREMENT,
  CampaignIDOriginal BIGINT NOT NULL,
  CampaignCode VARCHAR(40) NOT NULL,
  TitleSnapshot VARCHAR(300) NOT NULL,
  PurgeReason VARCHAR(500) NOT NULL,
  ConfirmationSha256 CHAR(64) NOT NULL,
  PurgedBy VARCHAR(20) NOT NULL,
  PurgedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MetadataJson TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_campaign_purge_original (CampaignIDOriginal),
  KEY idx_sv_campaign_purge_code (CampaignCode,PurgedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-16-campaign-governance-r1','migration'),
('campaign_governance_contract','2026-10-16-hide-test-archive-void-purge-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
