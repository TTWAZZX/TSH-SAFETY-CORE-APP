-- 4M Training Curriculum soft-disable uniqueness.
-- Active rows remain unique by normalized Year + Department + CurriculumCode.
-- Disabled rows release the key, so their code may be reused without deleting history.

DROP PROCEDURE IF EXISTS migrate_fourm_curriculum_soft_disable;
DELIMITER $$
CREATE PROCEDURE migrate_fourm_curriculum_soft_disable()
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND LOWER(TABLE_NAME) = LOWER('FourM_Curriculums')
           AND COLUMN_NAME = 'ActiveScopeKey'
    ) THEN
        ALTER TABLE FourM_Curriculums
            ADD COLUMN ActiveScopeKey CHAR(64) NULL AFTER IsActive;
    END IF;

    UPDATE FourM_Curriculums
       SET ActiveScopeKey = CASE
           WHEN IsActive = 1 THEN SHA2(CONCAT(CAST(`Year` AS CHAR), '|', LOWER(TRIM(Department)), '|', LOWER(TRIM(CurriculumCode))), 256)
           ELSE NULL
       END
     WHERE (IsActive = 1 AND (
               ActiveScopeKey IS NULL OR
               ActiveScopeKey <> SHA2(CONCAT(CAST(`Year` AS CHAR), '|', LOWER(TRIM(Department)), '|', LOWER(TRIM(CurriculumCode))), 256)
           ))
        OR (IsActive <> 1 AND ActiveScopeKey IS NOT NULL);

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND LOWER(TABLE_NAME) = LOWER('FourM_Curriculums')
           AND INDEX_NAME = 'uq_fourm_curriculum_active'
    ) THEN
        ALTER TABLE FourM_Curriculums
            ADD UNIQUE KEY uq_fourm_curriculum_active (ActiveScopeKey);
    END IF;

    IF EXISTS (
        SELECT 1
          FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND LOWER(TABLE_NAME) = LOWER('FourM_Curriculums')
           AND INDEX_NAME = 'uq_fourm_curriculum'
    ) THEN
        ALTER TABLE FourM_Curriculums DROP INDEX uq_fourm_curriculum;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND LOWER(TABLE_NAME) = LOWER('FourM_Curriculums')
           AND INDEX_NAME = 'uq_cur'
    ) THEN
        ALTER TABLE FourM_Curriculums DROP INDEX uq_cur;
    END IF;
END$$
DELIMITER ;

CALL migrate_fourm_curriculum_soft_disable();
DROP PROCEDURE migrate_fourm_curriculum_soft_disable;
