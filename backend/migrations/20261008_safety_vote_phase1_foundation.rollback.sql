-- Safety Vote Phase 1 data-preserving runtime rollback.
-- Intentionally retains every SafetyVote table and row.
-- A destructive database rollback is not authorized by the Phase 1 contract.

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy)
VALUES('module_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';

-- Safety Vote permission rows are retained so an application rollback does not
-- discard reviewed role/user configuration. Runtime files can be restored or
-- removed independently after a verified pre-deploy inventory.
