INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('company_visibility_remediation_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';

-- Data-preserving rollback: batch/item evidence and campaign modes are retained.
