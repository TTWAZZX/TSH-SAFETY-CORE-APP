-- Safety Vote Phase 2 Core Activity Vote MVP
-- Contract 2026-10-08-safety-vote-phase0-r1
-- Additive only. Runtime must not execute DDL.

CREATE TABLE IF NOT EXISTS SafetyVote_Questions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    QuestionCode VARCHAR(50) NOT NULL,
    QuestionType VARCHAR(32) NOT NULL,
    Title VARCHAR(300) NOT NULL,
    HelpText VARCHAR(1000) NULL,
    IsRequired TINYINT(1) NOT NULL DEFAULT 1,
    MinSelections INT NOT NULL DEFAULT 1,
    MaxSelections INT NOT NULL DEFAULT 1,
    SortOrder INT NOT NULL DEFAULT 1,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_question_code(CampaignVersionID,QuestionCode),
    KEY idx_sv_question_order(CampaignVersionID,Status,SortOrder),
    CONSTRAINT fk_sv_question_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Options (
    id BIGINT NOT NULL AUTO_INCREMENT,
    QuestionID BIGINT NOT NULL,
    OptionCode VARCHAR(50) NOT NULL,
    Label VARCHAR(300) NOT NULL,
    Description VARCHAR(2000) NULL,
    FileID BIGINT NULL,
    SortOrder INT NOT NULL DEFAULT 1,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    RowVersion INT NOT NULL DEFAULT 1,
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_option_code(QuestionID,OptionCode),
    KEY idx_sv_option_order(QuestionID,Status,SortOrder),
    CONSTRAINT fk_sv_option_question FOREIGN KEY(QuestionID) REFERENCES SafetyVote_Questions(id),
    CONSTRAINT fk_sv_option_file FOREIGN KEY(FileID) REFERENCES SafetyVote_Files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Candidates (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    OptionID BIGINT NOT NULL,
    EmployeeID VARCHAR(20) NULL,
    DisplayName VARCHAR(255) NOT NULL,
    ProfileText VARCHAR(2000) NULL,
    DepartmentSnapshot VARCHAR(100) NULL,
    PositionSnapshot VARCHAR(100) NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Active',
    CreatedBy VARCHAR(20) NOT NULL,
    UpdatedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_candidate_option(OptionID),
    KEY idx_sv_candidate_version(CampaignVersionID,Status),
    CONSTRAINT fk_sv_candidate_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
    CONSTRAINT fk_sv_candidate_option FOREIGN KEY(OptionID) REFERENCES SafetyVote_Options(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Participation (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignID BIGINT NOT NULL,
    CampaignVersionID BIGINT NOT NULL,
    SnapshotID BIGINT NOT NULL,
    EmployeeID VARCHAR(20) NOT NULL,
    State VARCHAR(20) NOT NULL DEFAULT 'not_started',
    AttemptCount INT NOT NULL DEFAULT 0,
    FirstStartedAt DATETIME NULL,
    SubmittedAt DATETIME NULL,
    LastActivityAt DATETIME NULL,
    ReceiptCodeHash CHAR(64) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_participation(CampaignVersionID,EmployeeID),
    KEY idx_sv_participation_campaign(CampaignID,State),
    CONSTRAINT fk_sv_participation_campaign FOREIGN KEY(CampaignID) REFERENCES SafetyVote_Campaigns(id),
    CONSTRAINT fk_sv_participation_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
    CONSTRAINT fk_sv_participation_snapshot FOREIGN KEY(SnapshotID) REFERENCES SafetyVote_EligibilitySnapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_Ballots (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    StageID BIGINT NULL,
    BallotSequence BIGINT NULL,
    PrivacyModeSnapshot VARCHAR(24) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Accepted',
    SupersedesBallotID BIGINT NULL,
    SubmittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CanonicalBallotHash CHAR(64) NOT NULL,
    IdempotencyHash CHAR(64) NOT NULL,
    SchemaVersion VARCHAR(50) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_ballot_sequence(CampaignVersionID,BallotSequence),
    UNIQUE KEY uq_sv_ballot_idempotency(CampaignVersionID,IdempotencyHash),
    KEY idx_sv_ballot_status(CampaignVersionID,Status,SubmittedAt),
    CONSTRAINT fk_sv_ballot_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id),
    CONSTRAINT fk_sv_ballot_stage FOREIGN KEY(StageID) REFERENCES SafetyVote_Stages(id),
    CONSTRAINT fk_sv_ballot_supersedes FOREIGN KEY(SupersedesBallotID) REFERENCES SafetyVote_Ballots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_BallotIdentities (
    BallotID BIGINT NOT NULL,
    EmployeeID VARCHAR(20) NOT NULL,
    IdentityMode VARCHAR(24) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(BallotID), KEY idx_sv_identity_employee(EmployeeID),
    CONSTRAINT fk_sv_identity_ballot FOREIGN KEY(BallotID) REFERENCES SafetyVote_Ballots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_BallotAnswers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    BallotID BIGINT NOT NULL,
    QuestionID BIGINT NOT NULL,
    OptionID BIGINT NULL,
    CandidateID BIGINT NULL,
    AnswerOrder INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_answer_option(BallotID,QuestionID,OptionID),
    KEY idx_sv_answer_result(QuestionID,OptionID),
    CONSTRAINT fk_sv_answer_ballot FOREIGN KEY(BallotID) REFERENCES SafetyVote_Ballots(id),
    CONSTRAINT fk_sv_answer_question FOREIGN KEY(QuestionID) REFERENCES SafetyVote_Questions(id),
    CONSTRAINT fk_sv_answer_option FOREIGN KEY(OptionID) REFERENCES SafetyVote_Options(id),
    CONSTRAINT fk_sv_answer_candidate FOREIGN KEY(CandidateID) REFERENCES SafetyVote_Candidates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS SafetyVote_RequestKeys (
    id BIGINT NOT NULL AUTO_INCREMENT,
    CampaignVersionID BIGINT NOT NULL,
    ActorEmployeeID VARCHAR(20) NOT NULL,
    RequestKeyHash CHAR(64) NOT NULL,
    Operation VARCHAR(50) NOT NULL,
    RequestFingerprint CHAR(64) NOT NULL,
    ResponseCode INT NULL,
    ResponseReference VARCHAR(100) NULL,
    ExpiresAt DATETIME NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id), UNIQUE KEY uq_sv_request_key(CampaignVersionID,ActorEmployeeID,Operation,RequestKeyHash),
    KEY idx_sv_request_expiry(ExpiresAt),
    CONSTRAINT fk_sv_request_version FOREIGN KEY(CampaignVersionID) REFERENCES SafetyVote_CampaignVersions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO SafetyVote_Settings(SettingKey,SettingValue,UpdatedBy) VALUES
('schema_version','2026-10-08-phase2-r1','migration'),
('module_enabled','1','migration'),
('phase2_contract','2026-10-08-safety-vote-phase2-r1','migration')
ON DUPLICATE KEY UPDATE SettingValue=VALUES(SettingValue),UpdatedBy='migration';
