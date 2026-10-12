-- Data-preserving rollback: access-control columns and their values are retained.
-- Runtime rollback restores prior application files; destructive schema removal requires separate authorization.
SELECT COUNT(*) AS retained_file_library_rows FROM FileLibrary_Items;
