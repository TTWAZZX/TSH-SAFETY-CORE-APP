-- Data-preserving rollback: keep accepted ballots and participation rows.
UPDATE SafetyVote_CampaignVersions SET MaxParticipationAttempts=1 WHERE MaxParticipationAttempts<>1;
UPDATE SafetyVote_Settings SET SettingValue='2026-10-15-live-results-r1',UpdatedBy='rollback' WHERE SettingKey='schema_version';
DELETE FROM SafetyVote_Settings WHERE SettingKey='participation_attempts_contract';
