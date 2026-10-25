-- Data-preserving rollback: disable the capability without dropping gallery metadata or files.
INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('candidate_submission_gallery_contract','disabled','rollback')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='rollback';
