-- Data-preserving Phase 4 rollback: retain criteria, assignments, score sheets,
-- result snapshots, certifications and advancement history.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('module_enabled','0','rollback-phase4')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback-phase4';
