-- Safe operational rollback: hide and reject batch workflows without deleting history.
INSERT INTO BBS_Settings (SettingKey, SettingValue) VALUES
    ('batch_observation_enabled', '0'),
    ('mobile_observation_wizard_enabled', '0'),
    ('draft_autosave_enabled', '0'),
    ('staged_admin_only', '1')
ON DUPLICATE KEY UPDATE SettingValue = VALUES(SettingValue);
