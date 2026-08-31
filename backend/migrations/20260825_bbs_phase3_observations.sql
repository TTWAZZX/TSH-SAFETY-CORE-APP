-- BBS Smart Card Phase 3: core observation workflow and private evidence.
-- Additive only. Phase 1 and Phase 2 migrations must be applied first.

CREATE TABLE IF NOT EXISTS BBS_Observations (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ObservationNo VARCHAR(40) NOT NULL,
    ObserverEmployeeID VARCHAR(20) NOT NULL,
    ObservedEmployeeID VARCHAR(20) NOT NULL,
    ChecklistVersionID BIGINT NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    ObservationDate DATE NOT NULL,
    ObservedAt DATETIME NOT NULL,
    ResolutionReason VARCHAR(500) NULL,
    ObserverNameSnapshot VARCHAR(255) NOT NULL,
    ObserverDepartmentSnapshot VARCHAR(255) NULL,
    ObserverUnitSnapshot VARCHAR(255) NULL,
    ObserverPositionSnapshot VARCHAR(255) NULL,
    ObservedNameSnapshot VARCHAR(255) NOT NULL,
    ObservedDepartmentSnapshot VARCHAR(255) NULL,
    ObservedUnitSnapshot VARCHAR(255) NULL,
    ObservedPositionSnapshot VARCHAR(255) NULL,
    ObservedDepartmentID INT NULL,
    ObservedSafetyUnitID INT NULL,
    ObservedPositionID INT NULL,
    ObservedBBSLevel VARCHAR(32) NULL,
    IdempotencyKey VARCHAR(80) NOT NULL,
    GeneralRemark TEXT NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    SubmittedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_observation_no (ObservationNo),
    UNIQUE KEY uq_bbs_observation_idempotency (ObserverEmployeeID, IdempotencyKey),
    KEY idx_bbs_observation_observer (ObserverEmployeeID, ObservationDate, Status),
    KEY idx_bbs_observation_observed (ObservedEmployeeID, ObservationDate, Status),
    KEY idx_bbs_observation_department (ObservedDepartmentID, ObservationDate, Status),
    CONSTRAINT fk_bbs_observation_checklist_version FOREIGN KEY (ChecklistVersionID)
        REFERENCES BBS_Checklist_Versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Observation_Answers (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ObservationID BIGINT NOT NULL,
    ChecklistItemID BIGINT NOT NULL,
    CategoryNameSnapshot VARCHAR(160) NOT NULL,
    ItemCodeSnapshot VARCHAR(50) NOT NULL,
    ItemPromptSnapshot VARCHAR(500) NOT NULL,
    IsRequiredSnapshot TINYINT(1) NOT NULL DEFAULT 1,
    UnsafeRequiresRemarkSnapshot TINYINT(1) NOT NULL DEFAULT 1,
    UnsafeRequiresPhotoSnapshot TINYINT(1) NOT NULL DEFAULT 0,
    UnsafeRequiresActionSnapshot TINYINT(1) NOT NULL DEFAULT 0,
    Response VARCHAR(10) NULL,
    Remark TEXT NULL,
    ImmediateAction TEXT NULL,
    SortOrder INT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_observation_answer_item (ObservationID, ChecklistItemID),
    KEY idx_bbs_observation_answer_observation (ObservationID, SortOrder),
    CONSTRAINT fk_bbs_observation_answer_observation FOREIGN KEY (ObservationID)
        REFERENCES BBS_Observations(id) ON DELETE CASCADE,
    CONSTRAINT fk_bbs_observation_answer_item FOREIGN KEY (ChecklistItemID)
        REFERENCES BBS_Checklist_Items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Observation_Files (
    id BIGINT NOT NULL AUTO_INCREMENT,
    ObservationID BIGINT NOT NULL,
    AnswerID BIGINT NOT NULL,
    StoredName VARCHAR(160) NOT NULL,
    OriginalName VARCHAR(255) NOT NULL,
    MimeType VARCHAR(100) NOT NULL,
    FileSize BIGINT NOT NULL,
    UploadedBy VARCHAR(20) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bbs_observation_file_observation (ObservationID, AnswerID),
    CONSTRAINT fk_bbs_observation_file_observation FOREIGN KEY (ObservationID)
        REFERENCES BBS_Observations(id) ON DELETE CASCADE,
    CONSTRAINT fk_bbs_observation_file_answer FOREIGN KEY (AnswerID)
        REFERENCES BBS_Observation_Answers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings (SettingKey, SettingValue)
VALUES ('workspace_enabled', '1')
ON DUPLICATE KEY UPDATE SettingKey = VALUES(SettingKey);
