-- Data-preserving rollback.
-- Runtime rollback removes routes/UI only. Keep FileLibrary_Items and private files
-- so published-link history can be restored without losing administrator data.
SELECT COUNT(*) AS retained_file_library_rows FROM FileLibrary_Items;
