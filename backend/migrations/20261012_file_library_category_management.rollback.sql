-- Data-preserving rollback: category master and item category details are retained.
SELECT COUNT(*) AS retained_categories FROM FileLibrary_Categories;
SELECT COUNT(*) AS retained_file_library_rows FROM FileLibrary_Items;
