# Safety Vote Phase 9.5B — Bounded-pilot Enablement Preflight

Date: 2026-10-09

Decision: `HOLD_PILOT_COHORT_NOT_PROVEN`

## Outcome

The read-only, value-suppressed Phase 9.5B preflight completed and correctly stopped before module enablement. Production runtime, rollback readiness, schema posture, disabled settings, external-provider posture and the existing bearer session pass. The access gate does not pass because the current role matrix grants `SAFETY_VOTE_VIEW` to every populated role, producing a role-derived access surface of all 2,543 employee accounts rather than an explicitly approved bounded pilot cohort.

No login, setting/permission/business-data change, email/notification, deployment, helper upload, module/integration opening or push occurred. No personal identifier or raw API response body was recorded.

## Verified gates

- Immutable commit: `021b2397f8ab668f6b6fab6aa1d7a5f40bf0533b`.
- Candidate tree: `0cf097bc429ad0f4ae348b820fd9504c5ff538a4`.
- Manifest SHA-256: `3905304ffef25e3bcbd3d0febdeb51261a68cc8930b6f976bafa97547301ee6c`.
- Runtime scope SHA-256: `d4ae391636f019f572acd558365fe647ea9beca1d1afc46100769589a4984fdc`.
- Production runtime double-download: `41/41` byte-exact matches.
- Rollback ZIP: 306,679 bytes, SHA-256 `df5132fb7079427d17a3ff1a2b851e284a865b4aa1fae7d2b49f03d50396a394`.
- Rollback manifest SHA-256: `31ba29f6a718f5f778921e0dc2175c5ab5d8c783717eeb24feec4ad911acebbd`.
- Fresh authenticated health: schema `2026-10-08-phase7-r1`, ready and module disabled.
- Accepted protected evidence: 39 tables, 11 permissions, zero business rows, `module_enabled=0`, `phase7_integrations_enabled=0`, zero configured external providers, verified backup/restore and zero residue.

Evidence: `backups/production/safety-vote-phase95b-preflight-20261009055655/`

Result SHA-256: `bee40471db0058c9a222b79b85dd97fffc215baeaa9d844e21daeca5ec4344f2`

## Value-suppressed access findings

| Role | Accounts | Safety Vote permission posture |
| --- | ---: | --- |
| `ADMIN` | 4 | All 11 permissions and Admin bypass |
| `USER` | 2,536 | `SAFETY_VOTE_VIEW` |
| `VIEWER` | 3 | `SAFETY_VOTE_VIEW` |
| Other configured roles | 0 | `SAFETY_VOTE_VIEW` |

Role-derived health/module access is therefore 2,543 of 2,543 accounts. User permission overrides and orphan overrides are both zero, so the effective count is provable; the blocker is the breadth of the role policy itself, not undisclosed overrides.

## Activation and rollback review candidate

Review-only template: `backend/scripts/safety-vote-phase95b-enable-helper.php.template`

SHA-256: `bf1ad0adf834a7efc9f4bd54075b157d32728b85580782913619b743977b9707`

The candidate is not authorized for Production execution. It is checksum-guarded and one-time, requires the Phase 7 39-table schema, exact disabled module/integration preconditions, zero business rows and unconfigured providers, creates a private byte-exact rollback SQL record before mutation, changes exactly `SafetyVote_Settings.module_enabled: 0 -> 1`, keeps integrations at `0`, and fails closed with a bounded failure stage. It has no package command.

## Blocking decision

Opening the module under the current matrix would not be a bounded pilot. A separate permission-governance decision is required to remove broad role-level access and grant an explicitly named pilot cohort through audited user overrides, or to approve another technically enforceable cohort boundary. Phase 9.5B activation and Phase 9.6 remain blocked.
