-- BBS Smart Card Phase 1 rollback for a configuration-only installation.
-- Do not run after later phases create records that depend on these tables.

DROP TABLE IF EXISTS BBS_Pilot_Scopes;
DROP TABLE IF EXISTS BBS_KPI_Rules;
DROP TABLE IF EXISTS BBS_Employee_Eligibility;
DROP TABLE IF EXISTS BBS_Hierarchy_Assignments;
DROP TABLE IF EXISTS BBS_Position_Level_Mappings;
DROP TABLE IF EXISTS BBS_Settings;
