-- File Library access controls. Additive and idempotent for existing Local/Production candidates.

ALTER TABLE FileLibrary_Items
  ADD COLUMN IF NOT EXISTS AccessMode VARCHAR(20) NOT NULL DEFAULT 'Public' AFTER Status,
  ADD COLUMN IF NOT EXISTS DeliveryMode VARCHAR(16) NOT NULL DEFAULT 'Auto' AFTER AccessMode,
  ADD COLUMN IF NOT EXISTS LastAccessedAt DATETIME NULL AFTER ViewCount;

SET @file_library_access_index := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'FileLibrary_Items'
    AND INDEX_NAME = 'idx_file_library_access_status'
);
SET @file_library_access_sql := IF(
  @file_library_access_index = 0,
  'ALTER TABLE FileLibrary_Items ADD KEY idx_file_library_access_status (AccessMode, Status)',
  'SELECT 1'
);
PREPARE file_library_access_stmt FROM @file_library_access_sql;
EXECUTE file_library_access_stmt;
DEALLOCATE PREPARE file_library_access_stmt;
