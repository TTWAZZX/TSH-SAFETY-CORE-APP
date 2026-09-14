# 4M Training Matrix Audit Log — Local read-only audit (2026-09-14)

## Scope

- Local database `FourM_CurriculumLogs` only.
- SELECT-only inspection; no audit row, business row or schema was changed.
- Runtime contract covers all 21 current Actions in both Node and PHP.

## Result

- Total legacy rows inspected: 1,855.
- Observed Actions: 18 (17 current Actions and legacy `COURSE_LINK`).
- Invalid `OldValue` JSON: 0.
- Invalid `NewValue` JSON: 0.
- Rows missing both actor ID and actor name: 0.
- Canonical v1 rows: 0; all existing rows predate the canonical snapshot release and remain unchanged.
- Current Actions not yet represented in historical Local data: `COURSE_UPDATE`, `ASSIGNMENT_REASSIGN`, `ASSIGNMENT_UPDATE`, `ASSIGNMENT_TRANSFER`. Their normalization, Node/PHP writer parity and UI filters are covered by automated contract tests.

## Historical references

- 10 rows reference a Curriculum record that no longer exists.
- 2 rows reference a Course record that no longer exists.
- 2 rows reference an Employee record that no longer exists.
- The two orphan Course rows retain their Course code in the snapshot.
- The two orphan Employee rows retain the Employee name in the snapshot.
- Three orphan Curriculum references do not retain a Curriculum code: two legacy `COURSE_LINK` rows and one legacy `CURRICULUM_ASSIGNMENT_CREATE` row. The UI must display the unavailable value as `—`; it must not infer or fabricate it.

## Controls

- `COURSE_LINK` is recognized as a legacy filter value but is not emitted by current writers.
- Audit deletion is disabled in UI and permission metadata.
- Node and PHP DELETE routes return `405` with `AUDIT_LOG_IMMUTABLE` and perform no database read or mutation.
