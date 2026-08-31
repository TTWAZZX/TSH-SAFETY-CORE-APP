-- Safe operational rollback for Phase 8. Preserve Community reports/actions and print history.
INSERT INTO BBS_Settings(SettingKey,SettingValue)
VALUES ('community_reporting_enabled','0'),('department_cards_enabled','0')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue);
