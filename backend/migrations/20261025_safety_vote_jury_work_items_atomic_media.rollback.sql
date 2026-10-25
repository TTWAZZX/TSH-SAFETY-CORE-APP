-- Data-preserving rollback: retain work/media evidence and disable new contracts.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('jury_work_items_contract','disabled','rollback'),
('atomic_media_contract','disabled','rollback')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='rollback';

-- WorkSource, candidate provenance, nullable OptionID and SafetyVote_MediaMutations
-- are intentionally retained so rollback cannot destroy work, file or audit evidence.
