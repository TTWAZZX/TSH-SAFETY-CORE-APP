-- Guarded Phase 2 rollback. Do not run after observations reference versions.
DELETE FROM BBS_Settings WHERE SettingKey='checklist_builder_enabled';
DROP TABLE IF EXISTS BBS_Checklist_Scope_Mappings;
DROP TABLE IF EXISTS BBS_Checklist_Items;
DROP TABLE IF EXISTS BBS_Checklist_Categories;
DROP TABLE IF EXISTS BBS_Checklist_Versions;
DROP TABLE IF EXISTS BBS_Checklist_Templates;
