-- Data-preserving rollback: disable the policy without rewriting campaign rows.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('company_wide_campaign_visibility_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';
