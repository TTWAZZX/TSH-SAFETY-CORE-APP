-- Safety Vote UX/UI Phase 9C data-preserving rollback.
-- Keep aggregate counters and all earlier engagement records for auditability.

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('engagement_enabled','0','rollback_phase9c')
ON DUPLICATE KEY UPDATE SettingValue='0',UpdatedBy='rollback_phase9c';
