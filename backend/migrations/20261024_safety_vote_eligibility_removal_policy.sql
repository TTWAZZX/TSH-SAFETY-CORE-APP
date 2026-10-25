-- Safety Vote eligibility removal policy gate.
-- Additive, idempotent and fail-closed. Runtime must never execute DDL.

INSERT IGNORE INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('eligibility_removal_enabled','0','migration'),
('eligibility_removal_policy','unstarted_only','migration'),
('eligibility_removal_contract','2026-10-24-safety-vote-eligibility-removal-r1','migration');\n