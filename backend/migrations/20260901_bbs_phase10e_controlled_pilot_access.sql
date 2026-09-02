-- BBS Smart Card Phase 10E controlled Pilot access.
-- Additive setting only. This migration does not open the module or change business data.

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('pilot_scope_only', '0')
ON DUPLICATE KEY UPDATE SettingKey = VALUES(SettingKey);

-- Mode precedence:
-- staged_admin_only=1                         => Admin only
-- staged_admin_only=0 and pilot_scope_only=1 => approved Pilot participants + Admin
-- staged_admin_only=0 and pilot_scope_only=0 => company-wide existing authorization

-- Safe rollback / emergency close:
-- UPDATE BBS_Settings SET SettingValue='1' WHERE SettingKey='staged_admin_only';
-- UPDATE BBS_Settings SET SettingValue='0' WHERE SettingKey='pilot_scope_only';
