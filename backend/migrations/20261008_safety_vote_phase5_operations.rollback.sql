-- Data-preserving rollback. Keep reports, export jobs, notifications and deliveries.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy)
VALUES('module_enabled','0','phase5-rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='phase5-rollback';
