-- Additive, nullable field. Existing accident history remains unchanged and is
-- presented as "Unspecified side" until an operator edits that report.
ALTER TABLE Accident_Reports
    ADD COLUMN BodySide VARCHAR(20) NULL AFTER BodyPart;
