-- Rollback is intentionally schema-only. Export any populated BodySide values
-- before using this rollback because dropping the column removes that detail.
ALTER TABLE Accident_Reports
    DROP COLUMN BodySide;
