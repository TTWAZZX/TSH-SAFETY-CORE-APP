-- Destructive rollback. Use only before Phase 3 contains retained business records.
DELETE FROM BBS_Settings WHERE SettingKey='workspace_enabled';
DROP TABLE IF EXISTS BBS_Observation_Files;
DROP TABLE IF EXISTS BBS_Observation_Answers;
DROP TABLE IF EXISTS BBS_Observations;
