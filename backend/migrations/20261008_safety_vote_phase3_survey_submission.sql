-- Safety Vote Phase 3 Survey, Feedback, Nomination and Submission
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive and idempotent. Runtime must not execute DDL.

ALTER TABLE SafetyVote_Questions
    ADD COLUMN IF NOT EXISTS ParentQuestionID BIGINT NULL AFTER CampaignVersionID,
    ADD COLUMN IF NOT EXISTS RandomizeOptions TINYINT(1) NOT NULL DEFAULT 0 AFTER MaxSelections,
    ADD COLUMN IF NOT EXISTS AllowComment TINYINT(1) NOT NULL DEFAULT 0 AFTER RandomizeOptions,
    ADD COLUMN IF NOT EXISTS ValidationJson TEXT NULL AFTER AllowComment,
    ADD COLUMN IF NOT EXISTS DisplayConditionJson TEXT NULL AFTER ValidationJson,
    ADD COLUMN IF NOT EXISTS ResultVisibility VARCHAR(30) NOT NULL DEFAULT 'aggregate' AFTER DisplayConditionJson;

ALTER TABLE SafetyVote_Options
    ADD COLUMN IF NOT EXISTS ScoreValue DECIMAL(12,4) NULL AFTER Description,
    ADD COLUMN IF NOT EXISTS IsAbstain TINYINT(1) NOT NULL DEFAULT 0 AFTER ScoreValue;

ALTER TABLE SafetyVote_BallotAnswers
    ADD COLUMN IF NOT EXISTS RankValue INT NULL AFTER CandidateID,
    ADD COLUMN IF NOT EXISTS NumericValue DECIMAL(18,4) NULL AFTER RankValue,
    ADD COLUMN IF NOT EXISTS BooleanValue TINYINT(1) NULL AFTER NumericValue,
    ADD COLUMN IF NOT EXISTS TextValueEncrypted TEXT NULL AFTER BooleanValue,
    ADD COLUMN IF NOT EXISTS DateTimeValue DATETIME NULL AFTER TextValueEncrypted,
    ADD COLUMN IF NOT EXISTS FileID BIGINT NULL AFTER DateTimeValue;

CREATE INDEX IF NOT EXISTS idx_sv_answer_question_ballot ON SafetyVote_BallotAnswers(QuestionID,BallotID);
CREATE INDEX IF NOT EXISTS idx_sv_answer_file ON SafetyVote_BallotAnswers(FileID);

CREATE TABLE IF NOT EXISTS SafetyVote_Submissions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignID BIGINT NOT NULL,
    CampaignVersionID BIGINT NOT NULL,
    SubmitterEmployeeID VARCHAR(20) NOT NULL,
    SubmissionCode VARCHAR(60) NOT NULL,
    Title VARCHAR(300) NOT NULL,
    Description TEXT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'Draft',
    ReviewReason VARCHAR(1000) NULL,
    SubmittedAt DATETIME NULL,
    ReviewedAt DATETIME NULL,
    ReviewedBy VARCHAR(20) NULL,
    WithdrawnAt DATETIME NULL,
    WithdrawnBy VARCHAR(20) NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    UNIQUE KEY uq_sv_submission_code(CampaignVersionID,SubmissionCode),
    KEY idx_sv_submission_owner(CampaignVersionID,SubmitterEmployeeID,Status),
    KEY idx_sv_submission_review(CampaignID,Status,UpdatedAt),
    CONSTRAINT fk_sv_submission_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
    CONSTRAINT fk_sv_submission_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Nominations (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignID BIGINT NOT NULL,
    CampaignVersionID BIGINT NOT NULL,
    NominatorEmployeeID VARCHAR(20) NOT NULL,
    NomineeEmployeeID VARCHAR(20) NOT NULL,
    NomineeNameSnapshot VARCHAR(255) NOT NULL,
    StatementText TEXT NULL,
    ConsentRequired TINYINT(1) NOT NULL DEFAULT 1,
    ConsentState VARCHAR(20) NOT NULL DEFAULT 'pending',
    ConsentedAt DATETIME NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'PendingConsent',
    ReviewReason VARCHAR(1000) NULL,
    ReviewedAt DATETIME NULL,
    ReviewedBy VARCHAR(20) NULL,
    WithdrawnAt DATETIME NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id),
    UNIQUE KEY uq_sv_nomination_pair(CampaignVersionID,NominatorEmployeeID,NomineeEmployeeID),
    KEY idx_sv_nomination_nominee(CampaignVersionID,NomineeEmployeeID,ConsentState),
    KEY idx_sv_nomination_review(CampaignID,Status,UpdatedAt),
    CONSTRAINT fk_sv_nomination_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
    CONSTRAINT fk_sv_nomination_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE SafetyVote_Files
    ADD COLUMN IF NOT EXISTS SubmissionID BIGINT NULL AFTER CampaignVersionID,
    ADD COLUMN IF NOT EXISTS QuestionID BIGINT NULL AFTER SubmissionID;

CREATE INDEX IF NOT EXISTS idx_sv_file_submission ON SafetyVote_Files(SubmissionID,Status);
CREATE INDEX IF NOT EXISTS idx_sv_file_question ON SafetyVote_Files(QuestionID,UploadedBy,Status);

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-08-phase3-r1','migration'),
('module_enabled','0','migration'),
('phase3_contract','2026-10-08-safety-vote-phase3-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
