-- BBS Smart Card Phase 10A: mobile batch observation.
-- Additive only. Individual observations remain the immutable KPI source of truth.

CREATE TABLE IF NOT EXISTS BBS_Observation_Batches (
    id BIGINT NOT NULL AUTO_INCREMENT,
    BatchNo VARCHAR(40) NOT NULL,
    ObserverEmployeeID VARCHAR(20) NOT NULL,
    ObservationDate DATE NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    IdempotencyKey VARCHAR(80) NOT NULL,
    EmployeeCount INT NOT NULL DEFAULT 0,
    ChecklistGroupCount INT NOT NULL DEFAULT 0,
    GeneralRemark TEXT NULL,
    DraftPayload MEDIUMTEXT NULL,
    RowVersion INT NOT NULL DEFAULT 1,
    SubmittedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_batch_no (BatchNo),
    UNIQUE KEY uq_bbs_batch_idempotency (ObserverEmployeeID, IdempotencyKey),
    KEY idx_bbs_batch_observer (ObserverEmployeeID, ObservationDate, Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BBS_Observation_Batch_Members (
    id BIGINT NOT NULL AUTO_INCREMENT,
    BatchID BIGINT NOT NULL,
    ObservationID BIGINT NOT NULL,
    ObservedEmployeeID VARCHAR(20) NOT NULL,
    ChecklistVersionID BIGINT NOT NULL,
    ResolutionReason VARCHAR(500) NULL,
    SortOrder INT NOT NULL DEFAULT 1,
    Status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_bbs_batch_member_employee (BatchID, ObservedEmployeeID),
    UNIQUE KEY uq_bbs_batch_member_observation (ObservationID),
    KEY idx_bbs_batch_member_version (BatchID, ChecklistVersionID, SortOrder),
    CONSTRAINT fk_bbs_batch_member_batch FOREIGN KEY (BatchID)
        REFERENCES BBS_Observation_Batches(id) ON DELETE CASCADE,
    CONSTRAINT fk_bbs_batch_member_observation FOREIGN KEY (ObservationID)
        REFERENCES BBS_Observations(id) ON DELETE CASCADE,
    CONSTRAINT fk_bbs_batch_member_checklist FOREIGN KEY (ChecklistVersionID)
        REFERENCES BBS_Checklist_Versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO BBS_Settings (SettingKey, SettingValue) VALUES
    ('batch_observation_enabled', '1'),
    ('mobile_observation_wizard_enabled', '1'),
    ('draft_autosave_enabled', '1'),
    ('staged_admin_only', '0')
ON DUPLICATE KEY UPDATE SettingKey = VALUES(SettingKey);
