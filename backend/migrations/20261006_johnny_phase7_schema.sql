-- Johnny AI Phase 7.1 additive schema migration.
-- Safety contract: schema-only. This file contains no DELETE, UPDATE, DROP or data rewrite.
-- Apply only after a read-only INFORMATION_SCHEMA preflight and an approved backup/change window.

CREATE TABLE IF NOT EXISTS app_settings (
    key_name VARCHAR(100) PRIMARY KEY,
    value TEXT DEFAULT NULL,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS johnny_chat_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    UserID VARCHAR(50) NOT NULL,
    Title VARCHAR(180) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user_updated (UserID, UpdatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS johnny_chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ConversationID INT NOT NULL,
    UserID VARCHAR(50) NOT NULL,
    Role VARCHAR(20) NOT NULL,
    MessageText MEDIUMTEXT NOT NULL,
    SourceType VARCHAR(40) DEFAULT NULL,
    CitationsJson JSON DEFAULT NULL,
    SourcesJson JSON DEFAULT NULL,
    AnswerQualityJson JSON DEFAULT NULL,
    Model VARCHAR(80) DEFAULT NULL,
    LatencyMs INT DEFAULT NULL,
    PromptTokens INT DEFAULT NULL,
    OutputTokens INT DEFAULT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_conversation_created (ConversationID, CreatedAt),
    KEY idx_user_created (UserID, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS johnny_kb_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    Title VARCHAR(220) NOT NULL,
    Category VARCHAR(80) DEFAULT 'general',
    OriginalName VARCHAR(220) NOT NULL,
    StoredName VARCHAR(220) NOT NULL,
    FileUrl TEXT NOT NULL,
    MimeType VARCHAR(120) DEFAULT NULL,
    FileSize INT DEFAULT 0,
    SourceType VARCHAR(30) NOT NULL DEFAULT 'document',
    TextContent MEDIUMTEXT DEFAULT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    IndexedStatus VARCHAR(30) NOT NULL DEFAULT 'pending',
    ChunkCount INT NOT NULL DEFAULT 0,
    ErrorMessage TEXT DEFAULT NULL,
    AuditStatus VARCHAR(30) DEFAULT NULL,
    AuditJson MEDIUMTEXT DEFAULT NULL,
    LastAuditAt DATETIME DEFAULT NULL,
    ExtractionLogJson MEDIUMTEXT DEFAULT NULL,
    LastExtractionAt DATETIME DEFAULT NULL,
    UploadedBy VARCHAR(50) DEFAULT NULL,
    UploadedByName VARCHAR(120) DEFAULT NULL,
    UploadedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    LastIndexedAt DATETIME DEFAULT NULL,
    KEY idx_active_status (IsActive, IndexedStatus),
    KEY idx_category (Category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS johnny_kb_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    DocumentID INT NOT NULL,
    ChunkIndex INT NOT NULL,
    ChunkText MEDIUMTEXT NOT NULL,
    PageLabel VARCHAR(80) DEFAULT NULL,
    EmbeddingJson MEDIUMTEXT DEFAULT NULL,
    EmbeddingModel VARCHAR(80) DEFAULT NULL,
    TokenEstimate INT DEFAULT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_doc_chunk (DocumentID, ChunkIndex),
    KEY idx_doc (DocumentID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS johnny_operational_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    Level VARCHAR(20) NOT NULL,
    Operation VARCHAR(50) NOT NULL,
    Stage VARCHAR(80) DEFAULT NULL,
    UserID VARCHAR(50) DEFAULT NULL,
    ConversationID INT DEFAULT NULL,
    DocumentID INT DEFAULT NULL,
    Model VARCHAR(80) DEFAULT NULL,
    HttpStatus INT DEFAULT NULL,
    LatencyMs INT DEFAULT NULL,
    Message VARCHAR(900) DEFAULT NULL,
    MetaJson MEDIUMTEXT DEFAULT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_created (CreatedAt),
    KEY idx_level_created (Level, CreatedAt),
    KEY idx_operation_created (Operation, CreatedAt),
    KEY idx_document_created (DocumentID, CreatedAt),
    KEY idx_conversation_created (ConversationID, CreatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @johnny_schema = DATABASE();

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_chat_messages' AND LOWER(COLUMN_NAME)='sourcesjson'),
    'SELECT 1',
    'ALTER TABLE johnny_chat_messages ADD COLUMN SourcesJson JSON DEFAULT NULL AFTER CitationsJson'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_chat_messages' AND LOWER(COLUMN_NAME)='answerqualityjson'),
    'SELECT 1',
    'ALTER TABLE johnny_chat_messages ADD COLUMN AnswerQualityJson JSON DEFAULT NULL AFTER SourcesJson'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='sourcetype'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN SourceType VARCHAR(30) NOT NULL DEFAULT ''document'' AFTER FileSize'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='textcontent'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN TextContent MEDIUMTEXT DEFAULT NULL AFTER SourceType'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='auditstatus'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN AuditStatus VARCHAR(30) DEFAULT NULL AFTER ErrorMessage'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='auditjson'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN AuditJson MEDIUMTEXT DEFAULT NULL AFTER AuditStatus'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='lastauditat'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN LastAuditAt DATETIME DEFAULT NULL AFTER AuditJson'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='extractionlogjson'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN ExtractionLogJson MEDIUMTEXT DEFAULT NULL AFTER LastAuditAt'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_kb_documents' AND LOWER(COLUMN_NAME)='lastextractionat'),
    'SELECT 1',
    'ALTER TABLE johnny_kb_documents ADD COLUMN LastExtractionAt DATETIME DEFAULT NULL AFTER ExtractionLogJson'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_operational_logs' AND LOWER(INDEX_NAME)='idx_created'),
    'SELECT 1',
    'ALTER TABLE johnny_operational_logs ADD KEY idx_created (CreatedAt)'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

CREATE TABLE IF NOT EXISTS johnny_answer_feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    MessageID INT NOT NULL,
    ConversationID INT NOT NULL,
    UserID VARCHAR(50) NOT NULL,
    Rating VARCHAR(20) NOT NULL,
    ReasonCode VARCHAR(40) DEFAULT NULL,
    SourceType VARCHAR(40) DEFAULT NULL,
    ContractVersion VARCHAR(40) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_message_feedback (MessageID),
    KEY idx_feedback_updated (UpdatedAt),
    KEY idx_feedback_rating_updated (Rating, UpdatedAt),
    KEY idx_feedback_source_updated (SourceType, UpdatedAt),
    CONSTRAINT fk_johnny_feedback_message FOREIGN KEY (MessageID) REFERENCES johnny_chat_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_answer_feedback' AND LOWER(INDEX_NAME)='uq_message_feedback'),
    'SELECT 1',
    'ALTER TABLE johnny_answer_feedback ADD UNIQUE KEY uq_message_feedback (MessageID)'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

SET @johnny_ddl = IF(
    EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=@johnny_schema AND LOWER(TABLE_NAME)='johnny_answer_feedback' AND LOWER(CONSTRAINT_NAME)='fk_johnny_feedback_message'),
    'SELECT 1',
    'ALTER TABLE johnny_answer_feedback ADD CONSTRAINT fk_johnny_feedback_message FOREIGN KEY (MessageID) REFERENCES johnny_chat_messages(id) ON DELETE CASCADE'
);
PREPARE johnny_stmt FROM @johnny_ddl; EXECUTE johnny_stmt; DEALLOCATE PREPARE johnny_stmt;

-- End of schema-only migration. Retention is deliberately handled by a separate operator command.
