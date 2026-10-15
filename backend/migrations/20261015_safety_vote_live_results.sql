-- Safety Vote Live Results / Live Leaderboard.
-- Additive and idempotent. Runtime must never execute DDL.

ALTER TABLE SafetyVote_CampaignVersions
  ADD COLUMN IF NOT EXISTS LiveLeaderboardEnabled TINYINT(1) NOT NULL DEFAULT 0 AFTER ResultVisibility,
  ADD COLUMN IF NOT EXISTS LiveLeaderboardTopN INT NOT NULL DEFAULT 5 AFTER LiveLeaderboardEnabled,
  ADD COLUMN IF NOT EXISTS LiveLeaderboardScoreMode VARCHAR(24) NOT NULL DEFAULT 'count_percentage' AFTER LiveLeaderboardTopN,
  ADD COLUMN IF NOT EXISTS LiveLeaderboardVisibility VARCHAR(24) NOT NULL DEFAULT 'after_submit' AFTER LiveLeaderboardScoreMode,
  ADD COLUMN IF NOT EXISTS LiveLeaderboardRefreshSeconds INT NOT NULL DEFAULT 15 AFTER LiveLeaderboardVisibility,
  ADD COLUMN IF NOT EXISTS LiveLeaderboardPrivacyThreshold INT NULL AFTER LiveLeaderboardRefreshSeconds;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-15-live-results-r1','migration'),
('live_results_contract','2026-10-15-safety-vote-live-results-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
