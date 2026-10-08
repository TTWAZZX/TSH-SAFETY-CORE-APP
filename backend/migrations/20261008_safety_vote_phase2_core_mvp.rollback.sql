-- Safety Vote Phase 2 data-preserving rollback.
-- Ballots, participation, questions, options, candidates and request evidence are retained.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy)
VALUES('module_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';
