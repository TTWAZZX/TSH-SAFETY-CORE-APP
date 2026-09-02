-- BBS Smart Card Phase 10E: keep Pilot access closed during acceptance.
-- Idempotent configuration-only migration. It creates no business workflow data.

INSERT INTO BBS_Settings (SettingKey, SettingValue, UpdatedBy)
VALUES ('staged_admin_only', '1', 'PHASE10E')
ON DUPLICATE KEY UPDATE
    SettingValue = '1',
    UpdatedBy = 'PHASE10E';
