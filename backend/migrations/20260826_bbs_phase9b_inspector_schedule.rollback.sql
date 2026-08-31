-- Safe operational rollback: preserve schedule and history, disable Phase 9B UI/API writes.
INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('inspector_schedule_enabled', '0')
ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue);
