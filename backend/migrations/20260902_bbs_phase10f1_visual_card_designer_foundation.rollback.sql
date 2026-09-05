-- Safe operational rollback: retain every layout, asset and audit row.
INSERT INTO BBS_Settings (SettingKey,SettingValue) VALUES
('visual_card_designer_enabled','0'),
('visual_card_designer_rendering_enabled','0')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue);
