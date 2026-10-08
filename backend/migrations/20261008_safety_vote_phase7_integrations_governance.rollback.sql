-- Data-preserving rollback: retain snapshots, handoffs, acceptance evidence and alerts.
UPDATE SafetyVote_Settings SET SettingValue='0',UpdatedBy='rollback' WHERE SettingKey='phase7_integrations_enabled';
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy)
VALUES('phase7_rollback_state','disabled_data_preserved','rollback')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='rollback';
