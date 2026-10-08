-- Data-preserving rollback: retain election configuration, actions, certifications and immutable evidence.
UPDATE SafetyVote_Settings SET SettingValue='0',UpdatedBy='rollback' WHERE SettingKey='module_enabled';
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy)
VALUES('phase6_rollback_state','disabled_data_preserved','rollback')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='rollback';
