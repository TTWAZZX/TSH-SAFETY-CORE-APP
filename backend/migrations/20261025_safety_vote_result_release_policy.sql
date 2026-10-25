-- Safety Vote per-campaign result release policy.
-- Additive/idempotent. Existing campaigns remain manual until an Admin explicitly changes a Draft.

SET @sv_has_release_policy := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='SafetyVote_CampaignVersions' AND COLUMN_NAME='ResultReleasePolicy'
);
SET @sv_add_release_policy := IF(
  @sv_has_release_policy=0,
  "ALTER TABLE SafetyVote_CampaignVersions ADD COLUMN ResultReleasePolicy VARCHAR(24) NOT NULL DEFAULT 'manual' AFTER OfficialResultTopN",
  'SELECT 1'
);
PREPARE sv_stmt FROM @sv_add_release_policy;
EXECUTE sv_stmt;
DEALLOCATE PREPARE sv_stmt;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('result_release_policy_contract','2026-10-25-result-release-policy-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';

UPDATE SafetyVote_Settings
SET SettingValue='2026-10-25-result-release-policy-r1',UpdatedBy='migration'
WHERE SettingKey='schema_version';
