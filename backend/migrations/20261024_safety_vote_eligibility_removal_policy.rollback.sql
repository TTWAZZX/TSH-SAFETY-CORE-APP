-- Data-preserving rollback: disable new removals and retain all snapshots/audit evidence.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('eligibility_removal_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';\n