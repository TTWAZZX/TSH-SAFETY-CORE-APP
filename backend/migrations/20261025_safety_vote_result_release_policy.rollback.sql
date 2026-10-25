-- Data-preserving rollback. Retain the policy selected on every immutable version.
DELETE FROM SafetyVote_Settings WHERE SettingKey='result_release_policy_contract';
-- ResultReleasePolicy is intentionally retained for forward recovery and audit.
