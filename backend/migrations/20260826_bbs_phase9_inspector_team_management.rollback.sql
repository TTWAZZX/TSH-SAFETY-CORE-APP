-- Safe operational rollback: preserve enrollment/team history and disable the workflow.
INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('inspector_team_management_enabled', '0')
ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue);
