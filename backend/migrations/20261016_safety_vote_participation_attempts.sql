-- Safety Vote participation attempts and privacy-safe own response history.
-- Additive and idempotent. Existing campaigns remain limited to one accepted ballot.

ALTER TABLE SafetyVote_CampaignVersions
  ADD COLUMN IF NOT EXISTS MaxParticipationAttempts INT NOT NULL DEFAULT 1 AFTER PrivacyThreshold;

UPDATE SafetyVote_CampaignVersions
SET MaxParticipationAttempts = 1
WHERE MaxParticipationAttempts IS NULL OR MaxParticipationAttempts < 1 OR MaxParticipationAttempts > 10;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-16-participation-attempts-r1','migration'),
('participation_attempts_contract','2026-10-16-safety-vote-participation-attempts-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
