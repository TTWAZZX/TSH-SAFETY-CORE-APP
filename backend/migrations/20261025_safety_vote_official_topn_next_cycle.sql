-- Safety Vote official Top N and non-destructive next-cycle lineage.
-- Additive/idempotent. Existing result snapshots and hashes are never updated.

SET @sv_has_official_top_n := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME='OfficialResultTopN'
);
SET @sv_add_official_top_n := IF(
  @sv_has_official_top_n=0,
  'ALTER TABLE SafetyVote_CampaignVersions ADD COLUMN OfficialResultTopN INT NULL AFTER ResultVisibility',
  'SELECT 1'
);
PREPARE sv_stmt FROM @sv_add_official_top_n;
EXECUTE sv_stmt;
DEALLOCATE PREPARE sv_stmt;

CREATE TABLE IF NOT EXISTS SafetyVote_CampaignVersionLineage (
  id BIGINT NOT NULL AUTO_INCREMENT,
  SourceCampaignID BIGINT NOT NULL,
  SourceVersionID BIGINT NOT NULL,
  TargetCampaignID BIGINT NOT NULL,
  TargetVersionID BIGINT NOT NULL,
  TransitionType VARCHAR(40) NOT NULL DEFAULT 'non_destructive_next_cycle',
  SourceResultHash CHAR(64) NULL,
  ConfirmationHash CHAR(64) NOT NULL,
  CreatedBy VARCHAR(20) NOT NULL,
  CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sv_next_cycle_target (TargetCampaignID,TargetVersionID),
  UNIQUE KEY uq_sv_next_cycle_source_draft (SourceCampaignID,SourceVersionID),
  KEY idx_sv_next_cycle_source (SourceCampaignID,SourceVersionID),
  CONSTRAINT fk_sv_next_cycle_source_campaign FOREIGN KEY (SourceCampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_next_cycle_source_version FOREIGN KEY (SourceVersionID) REFERENCES SafetyVote_CampaignVersions(id),
  CONSTRAINT fk_sv_next_cycle_target_campaign FOREIGN KEY (TargetCampaignID) REFERENCES SafetyVote_Campaigns(id),
  CONSTRAINT fk_sv_next_cycle_target_version FOREIGN KEY (TargetVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('official_result_integrity_contract','2026-10-25-official-topn-integrity-r1','migration'),
('non_destructive_next_cycle_contract','2026-10-25-non-destructive-next-cycle-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';

UPDATE SafetyVote_Settings
SET SettingValue='2026-10-25-official-topn-next-cycle-r1',UpdatedBy='migration'
WHERE SettingKey='schema_version';
