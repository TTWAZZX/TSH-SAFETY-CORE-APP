-- Data-preserving Phase 3 rollback.
-- Retains submissions, nominations, question configuration, answers and files.
-- Runtime is disabled until a compatible schema is selected explicitly.

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('module_enabled','0','rollback-phase3')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback-phase3';
