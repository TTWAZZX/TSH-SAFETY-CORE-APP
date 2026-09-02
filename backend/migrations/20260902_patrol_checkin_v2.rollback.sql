-- Operational rollback is flag-only so new and historical attendance remain intact.
INSERT INTO app_settings (key_name, value)
VALUES ('patrol_checkin_v2_enabled', '0')
ON DUPLICATE KEY UPDATE value = '0';
