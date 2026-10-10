-- Data-preserving rollback: disable the Phase 9A presentation/API surface.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy)
VALUES('engagement_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';
