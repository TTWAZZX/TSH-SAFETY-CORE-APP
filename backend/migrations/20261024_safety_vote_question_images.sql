-- Safety Vote question image foundation.
-- Additive and idempotent. Runtime must never execute DDL.

ALTER TABLE SafetyVote_Questions
  ADD COLUMN IF NOT EXISTS ImageFileID BIGINT NULL AFTER HelpText,
  ADD COLUMN IF NOT EXISTS ImageAltText VARCHAR(300) NULL AFTER ImageFileID;

CREATE INDEX IF NOT EXISTS idx_sv_question_image ON SafetyVote_Questions(ImageFileID);

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-24-question-images-r1','migration'),
('question_image_contract','2026-10-24-safety-vote-question-images-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
