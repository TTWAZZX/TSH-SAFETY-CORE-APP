-- Data-preserving rollback: keep question image references and private-file evidence.
UPDATE SafetyVote_Settings
SET SettingValue='disabled',UpdatedBy='rollback'
WHERE SettingKey='question_image_contract';
