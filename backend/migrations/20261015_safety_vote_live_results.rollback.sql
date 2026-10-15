-- Data-preserving rollback: disable the feature without dropping versioned configuration.
UPDATE SafetyVote_CampaignVersions SET LiveLeaderboardEnabled=0 WHERE LiveLeaderboardEnabled<>0;
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('live_results_contract','disabled-data-preserved','rollback')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='rollback';
