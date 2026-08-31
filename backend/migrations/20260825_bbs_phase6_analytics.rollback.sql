-- Safe operational rollback: preserve indexes and all Phase 1-5 business data.
-- Disabling these flags lets the UI/API hide analytics without affecting workflows.

INSERT INTO BBS_Settings(SettingKey,SettingValue)
VALUES ('analytics_enabled','0'),('analytics_export_enabled','0')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue);
