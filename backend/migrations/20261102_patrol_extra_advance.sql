-- Safety Patrol Top & Management: linked Extra advance coverage.
-- Additive and disabled by default. Existing rows keep NULL CheckinMode and
-- continue to use the legacy projection.

ALTER TABLE patrol_attendance
    ADD COLUMN IF NOT EXISTS CheckinMode VARCHAR(20) NULL AFTER PatrolType;

INSERT INTO app_settings (key_name, value)
VALUES ('patrol_extra_advance_enabled', '0')
ON DUPLICATE KEY UPDATE value = value;
