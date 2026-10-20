-- Data-preserving rollback for Safety Vote eligibility amendments.
-- Amendment, member and event evidence is retained for audit/recovery.

UPDATE SafetyVote_CampaignVersions
SET EligibilityEnrollmentMode='closed_after_open',
    EligibilityEnrollmentUpdatedAt=NULL,
    EligibilityEnrollmentUpdatedBy='rollback'
WHERE EligibilityEnrollmentMode<>'closed_after_open';

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('eligibility_amendment_enabled','0','rollback')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback';

UPDATE SafetyVote_Settings
SET SettingValue='2026-10-16-campaign-governance-r1',UpdatedBy='rollback'
WHERE SettingKey='schema_version';

DELETE FROM SafetyVote_Settings
WHERE SettingKey IN ('eligibility_amendment_contract','eligibility_amendment_default_mode','eligibility_amendment_allowed_modes');
