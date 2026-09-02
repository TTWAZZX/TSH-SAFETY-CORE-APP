-- Safety Patrol live Personal-tab statistics (additive)
-- PatrolDate remains the walk date; CheckinAt is the real save time.
-- Existing history intentionally remains NULL rather than being stamped during migration.
ALTER TABLE patrol_attendance
    ADD COLUMN IF NOT EXISTS CheckinAt DATETIME NULL DEFAULT NULL AFTER PatrolDate;
