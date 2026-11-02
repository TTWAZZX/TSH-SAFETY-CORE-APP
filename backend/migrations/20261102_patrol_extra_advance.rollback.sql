-- Operational rollback is flag-only. Keep CheckinMode because attendance may
-- already reference linked advance coverage and must remain auditable.
INSERT INTO app_settings (key_name, value)
VALUES ('patrol_extra_advance_enabled', '0')
ON DUPLICATE KEY UPDATE value = '0';
