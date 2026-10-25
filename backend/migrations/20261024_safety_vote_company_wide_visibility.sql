-- Safety Vote company-wide campaign visibility contract.
-- Additive and idempotent. The feature is fail-closed until explicitly enabled.

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('company_wide_campaign_visibility_contract','2026-10-24-company-wide-campaign-visibility-r1','migration'),
('company_wide_campaign_visibility_enabled','0','migration')
ON DUPLICATE KEY UPDATE
  SettingValue=IF(SettingKey='company_wide_campaign_visibility_contract',VALUES(SettingValue),SettingValue),
  UpdatedBy='migration';\n