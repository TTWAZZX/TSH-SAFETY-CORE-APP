-- Data-preserving rollback: runtime contracts are disabled without deleting lineage or result evidence.
DELETE FROM SafetyVote_Settings
WHERE SettingKey IN ('official_result_integrity_contract','non_destructive_next_cycle_contract');

-- OfficialResultTopN and SafetyVote_CampaignVersionLineage are intentionally retained.
