# TSH Safety Core Activity - AGENTS.md

## BBS integration local migration evidence (2026-09-05)

Local-only CCCF delegation and BBS designer foundation migrations were applied after backup `backups/bbs-integration-local-2026-09-05T08-17-05-534Z` (SQL SHA-256 `b2b4f087467a3364a714cb7a6db2d784c707bf0162ffc0986601bf4f25b2fd78`). Six additive tables and two actor columns; existing row counts preserved. No Production DB update or `backend/uploads/` path change. Print receipts add no schema. Keep staged=1 and both Designer flags=0 pending acceptance. See `docs/bbs-integration-review-20260905.md`.

## Local MySQL recovery evidence (2026-09-05)

- Local XAMPP data was rebuilt from a verified cold-copy export after an InnoDB checkpoint failure. Preserve `backups/local-mysql-recovery-20260905/` and `C:/xampp/mysql/data-before-recovery-20260905`; do not delete redo files or replace business tables as a generic startup fix.
- Normal runtime must keep `innodb_force_recovery=0`. The recovery changed no application schema or `backend/uploads/` path. Only the damaged MySQL system table `mysql.transaction_registry` was reinitialized. Exact verification, technical-log retention differences and recovery limits are in `docs/project-review-and-mysql-recovery-20260905.md`.

## Safety Patrol Check-in v2 Constraints

- Scheduled check-in must link one authorized Admin-created Patrol session. Makeup may complete an earlier missed session across month/year; Extra remains unlinked, counts only in Actual Walk Activity for the actual walk month, and never closes Scheduled Compliance.
- Team/Member Rotation and Patrol Sessions in System Control are the calendar authority. Preserve multiple same-day rounds, one base team per employee and historical Attendance without automatic repair.
- Retry safety uses nullable `Patrol_Attendance.IdempotencyKey`, unique `(UserID,IdempotencyKey)` and unique `(UserID,ScheduledSessionID)`. A new idempotency key intentionally permits another Extra walk.
- `patrol_checkin_v2_enabled` is the operational rollback flag. Disable it before runtime rollback; do not drop the additive column/indexes or delete Attendance history.

## CCCF Form A Permanent Submit-on-behalf Constraints

- `AssigneeID` is the accountable owner for CCCF KPI, tracking, review recipient and history. `SubmittedByEmployeeID` and `SubmittedByName` identify the authenticated actor and must never replace the owner or create a second KPI count.
- An ordinary user may submit for themselves, or for an owner with both an active `CCCF_Assignments` row and an active `CCCF_Submit_Delegations` grant for that exact delegate. Admin retains the established Employee Master selection authority. The server resolves owner and actor data; the client only presents permission-scoped choices.
- Direct-signed PDF remains self-only for non-Admin users. Delegation grants submit authority only and must not inherit an owner's direct-signed privilege.
- `CCCF_Submit_Delegations` and the actor columns are additive. Preserve legacy rows, use creator/name fallback for old records, retain history/audit rows when a grant is disabled, and reuse the existing `SubmittedByAdmin` email template/outbox event.

## BBS Smart Card Phase 10F-2 Constraints

- The Visual Designer is Admin-only. It may create and edit only `Draft` layout versions; `Active` and `Archived` versions are immutable previews in both the client and server.
- Canvas QR elements are visibly non-functional placeholders. Phase 10F-2 must keep `visual_card_designer_rendering_enabled=0` and must not call or alter issue, replace, revoke, rotate, print-log or QR-resolution workflows.
- New JPG/PNG/WebP designer artwork is limited to 10 MB, content-signature validated and stored under denied private storage `backend/private-uploads/bbs-card-designer`. Reads are object-authorized and APIs must never expose stored filenames or filesystem paths.
- The server canonicalizes every parent/background/asset reference. A client cannot select another Draft's asset, a foreign parent file, an arbitrary path, dynamic value or QR token.
- Desktop/tablet may edit with drag/resize, layers, properties and keyboard equivalents. Phone mode is preview-only. Phase 10F-2 changes no existing template/card/QR record or established renderer, and it does not authorize Production deployment or GitHub push.

## BBS Smart Card Phase 10F-1 Constraints

- Phase 10F-1 installs only the additive BBS designer foundation: layout versions, sides, elements, assets and print snapshots. It must not alter or delete existing Personal/Department templates, cards, QR rows, print logs or private files.
- `visual_card_designer_enabled` and `visual_card_designer_rendering_enabled` default to `0`. Phase 10F-1 may expose the Admin catalog and Draft-version APIs, but it must not activate designer rendering, issue cards through a designer layout or change the established legacy renderer.
- Node and PHP must validate the same allowlisted fields, element types, styles and integer basis-point geometry. Draft writes are transactional, require optimistic `RowVersion`, and fail closed for non-Draft versions or foreign assets.
- The inventory command is SELECT-only. Legacy bootstrap is dry-run by default, requires explicit `--apply`, is idempotent and must prove that existing parent rows and private artwork remain unchanged.
- Phase 10F-1 adds no Unit card, public designer route, new QR destination, upload-path change, Production deployment or GitHub push.

## BBS Smart Card Phase 10F-0 Constraints

- Visual Card Designer supports only the established Personal Card and Department Card domains. It may provide front/back artwork and portrait/landscape layouts, but it must not introduce Unit cards or reuse Forklift tables/authorization as BBS storage.
- Layout data is server-authoritative and versioned. Only Draft layouts are editable; Active/Archived layouts are immutable, and clients may not select a layout version, employee, Department, QR value or dynamic field outside the authorized server context.
- Personal preview QR remains visibly non-functional; the raw Personal QR remains available only during the existing issue/replace response. Department output continues to use the single existing Active shared Department QR. Static uploads must never bypass either QR lifecycle.
- Legacy adoption must be additive and idempotent: do not update/delete existing Personal/Department templates, cards, QR rows, print logs or private files. Designer-disabled or missing-layout templates must continue through the existing renderer. Operational rollback disables designer flags and preserves all designer records.
- Phase 10F-0 is documentation/design only. It adds no migration, API, runtime behavior, business record, upload path, Production deployment or GitHub push.

## BBS Smart Card Phase 10E Constraints

- Pilot acceptance is a gate, not automatic rollout. Use `staged_admin_only=1` during Production setup. After a fresh backup and explicit Pilot-test approval, `staged_admin_only=0` plus `pilot_scope_only=1` may be used for controlled multi-role UAT; keep company-wide mode (`0`/`0`) blocked until acceptance, integrity reconciliation and explicit ordinary-user rollout approval.
- Controlled Pilot access permits Admin, effective Active inspectors in an effective `BBS_Pilot_Scopes` scope, and effective assigned members in that scope. It does not grant Admin privileges, does not infer access from Department text alone, and requires authentication for shared QR resolution while active.
- `backend/scripts/bbs-phase10e-pilot-acceptance-audit.js` is SELECT-only. A blocked result must identify missing platform/configuration/evidence inputs without creating Operators, assignments, Checklists, templates, QR cards, handlers or workflow records.
- `READY_FOR_ROLLOUT_REVIEW` means the release may be reviewed; it does not authorize a flag change, deployment or GitHub push. Production rollout still requires fresh database/private-upload/application backups, reviewed file hashes, staged Admin smoke, multi-role smoke after the approved gate change, rollback verification and zero test residue.

## BBS Smart Card Phase 10D-5 Constraints

- Inspector Agenda is a responsive projection of the existing server-computed schedule `days`; it must not calculate targets, actuals, exemptions or KPI status independently. Agenda and Calendar are alternate presentations of the same response.
- Community Risk detail is Admin-only in Node and PHP. It may expose report identity, private evidence metadata, assigned owner/verifier and Action History only after Admin authorization; stored filenames and private filesystem paths must never appear in JSON.
- Evidence remains readable only through the existing object-authorized `/bbs/community/reports/:id/evidence/:fileId` route. Phase 10D-5 changes no schema, Action transition rule, schedule mutation, Master/Pilot configuration, private upload path, stored workflow data or staged rollout gate.

## BBS Smart Card Phase 10D-4 Constraints

- Action Email Outbox visibility is Admin-only and projects the existing `BBS_Action_EmailOutbox` records. Status totals, filters and pagination must not modify or infer delivery state.
- Manual Retry is allowed only for an existing `Failed` row while BBS action notifications and SMTP are enabled. Lock the selected row before delivery, reject `Queued`/`Sent` retries, increment attempt metadata and audit both success and failure without creating a replacement outbox row.
- Existing suppression keys, notification events, recipients, SMTP configuration and action workflow remain authoritative. Phase 10D-4 changes no schema, business rule, authorization, private upload path, stored Action/Observation data or staged rollout gate.

## BBS Smart Card Phase 10D-3 Constraints

- History, Corrective Actions, Community Good/Risky reports, Personal Card recipients and issued Cards use opt-in server-side pagination. Requests without `paged=1` retain their legacy array response so existing consumers remain compatible.
- Every paged response uses server-computed `rows` plus `pagination` (`page`, `pageSize`, `total`, `totalPages`, `hasPrevious`, `hasNext`). Page size is bounded to 100 and out-of-range pages are clamped without fabricating records.
- Search and Department/Unit/year/status/priority filters are applied after the existing authorization scope. Risky Community rows/evidence remain Admin-only, Good reports remain reporter-anonymous, and Cards endpoints remain Admin-only.
- Phase 10D-3 changes no schema, stored data, card/QR lifecycle, Observation/Action business rule, authorization, Master/Pilot configuration, private upload path or rollout gate.

## BBS Smart Card Phase 10D-2 Constraints

- KPI status is a server-derived semantic projection over the existing effective inspector enrollment, `KpiRequired`, schedule target and capped submitted-observation formula. `N_A`, `NOT_CONFIGURED`, `NOT_INSPECTED`, `ZERO_PERCENT` and `PERCENT` must remain distinct; clients and exports must not coerce a null percentage to zero.
- `N_A` means KPI is not applicable, `NOT_CONFIGURED` means no effective KPI enrollment/configuration, `NOT_INSPECTED` means a schedule exists but no target is due yet, and `ZERO_PERCENT` means a positive target is due with zero credited observations. Existing `Exempt` dates remain outside the denominator.
- Dashboard, inspector compliance, analytics and exports use the same semantic status and existing per-day capped schedule formula. Phase 10D-2 changes no schema, authorization, target formula, enrollment/schedule mutation, Observation immutability, batch behavior, Master/Pilot configuration, private upload path or rollout gate.

## BBS Smart Card Phase 10D-1 Constraints

- Checklist readiness in employee selectors is a server projection from the existing resolver, Employee Master context and effective date. The client may display and filter the result but must not select, publish, override or substitute a Checklist version.
- `READY` is the only state that enables a new Single or Batch Observation selection. `NO_CHECKLIST`, `SCOPE_MISMATCH`, `VERSION_NOT_PUBLISHED`, `VERSION_NOT_EFFECTIVE`, `CHECKLIST_CONFLICT` and unknown results fail closed with an actionable reason. Existing Drafts remain resumable because their Checklist snapshot is already frozen.
- Draft creation and Batch preview/draft APIs remain authoritative and must resolve again inside their existing transaction/atomic workflow. Phase 10D-1 changes no schema, authorization, Observation immutability, batch per-employee model, Master/Pilot configuration, private upload path or rollout gate.

## BBS Smart Card Phase 10B-4 Constraints

- Phase 10B-4 composes a read-only preview from existing private Personal/Department template reads and existing Master/card context. It must not change BBS routes, payloads, schema, authorization, card eligibility, QR lifecycle, private upload paths or stored workflow data.
- Personal preview QR is visibly non-functional. Actual one-time Personal QR remains available only after the existing issue/replace mutation; popup pre-open and template validation remain before that mutation. Department preview/print uses the current Active Department QR returned by the existing permission-scoped Department-card endpoint.
- Readiness distinguishes Ready, Warning and Blocked. Aspect ratio or low resolution warns without inventing business data; missing/unreadable background, invalid dimensions, unavailable QR generation, scope mismatch or missing Active Department QR blocks only the affected print/mutation action.

## BBS Smart Card Phase 10C-3 Constraints

- Phase 10C-3 is frontend-only runtime resilience. It must not change BBS routes, payloads, schema, authorization, Master/Pilot configuration, business rules, private upload paths or stored workflow data.
- Core, History, Community, Inspector, Action, Analytics and Card reads fail independently. A failed section must show an actionable retry state, preserve previously confirmed data when available and never replace an unknown result with a fabricated zero or silently navigate away.
- Critical mutation forms/buttons must reject repeat activation while their request is pending and expose an accessible busy state. Existing server idempotency, optimistic concurrency, immutable Observation/batch behavior and one-time card QR safeguards remain authoritative.

## KY Chunked Video Upload Constraints

- KY videos up to 200 MB must be uploaded through the authenticated `video-upload/init`, per-index `chunk`, and `complete` flow so shared-hosting PHP never receives the full video in one multipart request. Each chunk is 5 MB or smaller.
- Every chunk operation must re-check the existing KY owner/participant/Admin rule and bind the private upload manifest to the initiating employee and activity. Non-Admin users may not replace an existing video.
- Temporary chunks live only in HTTP-denied `backend/private-uploads/ky-video-chunks`, expire after 24 hours and never become `VideoUrl`. Completion must verify every chunk, exact total size and the supported video signature before atomically updating `KY_Activities.VideoUrl`; only then may an Admin replacement remove the prior upload.
- New submit and Admin edit requests must exclude the video from their main multipart body. If record save succeeds but chunk upload fails, preserve the KY record and tell the user to attach the video later rather than resubmitting a duplicate activity.

## Forklift Renewal Retry Constraints

- Creating a renewal request is retry-safe. An open `DRAFT` or `RETURNED` renewal for the same source license is reused and updated; its documents, request number and history are preserved. A `SUBMITTED`, `PENDING` or `UNDER_REVIEW` renewal remains a `409` conflict and must return the existing request identity for UI recovery.
- Renewal retry checks are serialized by locking the source license inside the transaction. Keep Node/PHP route behavior in parity and never resolve the conflict by deleting request/document/history rows.
- The frontend must query the permission-scoped request API by `sourceLicenseId`, resume editable requests, and open processing requests rather than displaying an opaque 409 or creating a duplicate.

## BBS Smart Card Phase 10C-2 Constraints

- Phase 10C-2 is frontend-only mobile and accessibility hardening. It must not change BBS schema, APIs, authorization, Master/Pilot configuration, private upload paths, stored observations/actions/cards, or the Phase 10A per-employee batch model.
- BBS primary tabs use one semantic tablist/tabpanel contract with keyboard navigation. Phone controls retain at least a 44 px touch target, text-entry controls avoid iOS focus zoom, and horizontal data regions remain keyboard-focusable and labelled.
- BBS dialogs must expose dialog semantics, trap focus, close with Escape/backdrop/close control, restore focus and participate in the shared mobile overlay/viewport state. Validation must move users to the existing invalid field without relaxing Safe/Unsafe/N/A or evidence requirements.

## BBS Smart Card Phase 10C-1 Constraints

- Leaving the Observation tab must save the current single or batch Draft before navigation. Draft recovery is server-backed, and only the original observer may resume a Draft; changing tabs must never silently discard it or create a second Draft for the same observed employee.
- Personal-card issue/replace must synchronously open the print window and validate the private template before the one-time raw QR mutation. A blocked popup must leave the card unchanged; post-issue rendering failure must show an explicit recovery state rather than imply the card was not issued.
- Excel, PDF and Print analytics must fetch `/api/bbs/analytics/export-data` with current filters before producing output. Phase 10C-1 changes no schema, business configuration, authorization, upload path or stored workflow data.

## BBS Smart Card Phase 10B-3 Constraints

- Department Configuration is a read-only client projection over the Master Department list plus existing Department template, QR and handler records. Searching, filtering or selecting a Department must not mutate records.
- The selected Department ID comes from Master data and is submitted through the unchanged template/QR/handler APIs. Owner and Verifier pickers list only Admin accounts returned by the existing Department-card Admin API; server-side Admin validation remains authoritative.
- Render only one Department detail/form set at a time. Preserve one shared Active QR per Department, multiple named templates and existing lifecycle/audit behavior. Phase 10B-3 adds no API, schema, storage path or role change.

## BBS Smart Card Phase 10B-2 Constraints

- Card Admin has three UI-only workspaces: Overview, Personal Card and Department Card. Keep the established Personal/Department endpoints, payloads, permissions and lifecycle actions unchanged.
- Overview readiness may guide Admin to the next workspace but must never create, activate, issue, rotate, replace, revoke or archive records automatically. Detailed Personal and Department forms must not be rendered together in the same workspace.
- Entering Card Admin from the Community tab may open Department Card context; all other normal entries begin at Overview. Phase 10B-2 adds no schema, storage path or rollback flag.

## BBS Smart Card Phase 10B-1 Constraints

- BBS Admin reference controls must use `/api/bbs/admin/foundation` and the central Master Department, Safety Unit, Position and Employee sources. Do not derive Personal Card Department options from the currently eligible card-recipient rows.
- Personal Card issuance remains limited to effective Group Leader-or-higher mappings. Readiness messages explain missing Master/mapping/template/QR/handler configuration but must not weaken server authorization or create fallback business data.
- Phase 10B-1 is frontend/readiness integration only: no schema, upload-path or workflow behavior change. Foundation failure must degrade to an explanatory state without blocking existing card/template API reads.

## BBS Smart Card Staged Production Constraint

- `BBS_Settings.staged_admin_only=1` is the production Pilot configuration gate. While enabled, every `/api/bbs/*` surface, including public QR resolution, is Admin-only in both PHP and Node; the normal user rollout must not be opened until the Pilot roster, Active inspector/team assignments and an applicable Published Checklist are confirmed.
- Disabling staged mode is a separate business rollout action. It must not alter observations, actions, cards, schedules or audit history.

## BBS Smart Card Phase 10A Constraints

- A batch is only a mobile orchestration layer. Every selected employee must still receive a separate immutable `BBS_Observations` record and separate answers; batch totals must never replace individual KPI, team coverage, history, analytics or action sources.
- Batch selection is 2-50 unique employees from the server-authorized effective team scope. The server resolves and freezes each employee's checklist; the frontend may group matching versions but may not choose or override a version.
- Draft save and final submit are atomic across every batch member. Final validation, status transition and per-answer Corrective Action creation occur in one transaction; any invalid member rolls back the complete batch.
- Batch detail is visible only to the originating observer or Admin. An observed employee may read their individual Observation under existing rules but must never receive the batch container or peer identities.
- `batch_observation_enabled`, `mobile_observation_wizard_enabled` and `draft_autosave_enabled` are safe rollback flags. Disabling them must not delete batches, observations, evidence, actions or history. Evidence remains in `backend/private-uploads/bbs` under existing authorization and validation rules.

## BBS Smart Card Phase 9B Constraints

- Inspector schedules are effective-dated versions. Never rewrite a historical rule or past-day override; a new rule may only start today or later, and replaced rules remain for audit.
- KPI, workspace, compliance dashboard, analytics and exports must use the same per-day capped schedule target. `Exempt` contributes no denominator; `Required` supplies the explicit target for that date.
- Admin may configure schedules and date overrides. A non-Admin inspector may read only their own schedule/compliance. `inspector_schedule_enabled` is the safe API rollback flag and must not delete schedules, observations or history.

## BBS Smart Card Phase 9 Constraints

- Formal Observation access and KPI eligibility require an effective Active `BBS_Inspector_Enrollments` row. A Group Leader mapping by itself is not sufficient.
- Admin may appoint Group Leaders and manage their teams. A Group Leader may mutate only their own team when `AllowSelfManage=1`; server scope always comes from the enrollment, never frontend Department/Unit values.
- One Operator may have only one effective primary `BBS_Hierarchy_Assignments` inspector at a time. Team changes preserve assignment and `BBS_Inspector_Team_Events` history.
- KPI includes only effective Active enrollments with `KpiRequired=1`, Monday-Friday rules and the existing daily target cap. Team coverage is a separate metric.
- `inspector_team_management_enabled` is the rollback flag. When disabled, team writes and detail APIs fail closed and existing Observation/Action/history data must not mutate.

## BBS Smart Card Phase 8 Constraints

- There are only personal cards and Department cards. Never add Unit cards implicitly. Personal issue/reissue requires `Group Leader` or higher. A Department may have many named Active templates, but exactly one Active shared Department QR.
- Community Report is authenticated and Department-scoped from Employee Master for ordinary users. Observed employee/Unit are optional; supplied values must belong to that Department. Community records never count formal BBS KPI or formal Observation analytics.
- Good reports may be shown to all authenticated users but must not expose reporter identity. Risky report/detail/evidence and Community Actions are Admin-only. Risky submission creates its Action immediately; active owner and verifier must both be current Admin accounts.
- Department templates and Community evidence are private uploads. Keep Node/PHP API parity, content-signature/10 MB checks, object authorization and path confinement. `community_reporting_enabled` and `department_cards_enabled` disable UI/workflows without deleting data.

## BBS Smart Card Phase 6 Constraints

- Analytics scopes are server-enforced: Personal=self, Team=effective hierarchy assignment, Department=own Department unless Admin, Company=Admin only. Never trust a frontend Department or Safety Unit filter.
- KPI actuals are capped per eligible workday by the active `BBS_KPI_Rules.TargetCount`; dashboard, drill-down and exports must share that formula and filter scope.
- Excel/PDF/Print must fetch `/api/bbs/analytics/export-data` with the current filters before generating output. `analytics_enabled` and `analytics_export_enabled` are the safe operational rollback flags; disabling them must not mutate Observation or Action workflows.

## BBS Smart Card Phase 2B Constraints

- Checklist Excel exchange uses sheets `Checklist`, `Items`, and `Scopes`;
  `README` and `Master Reference` are informational export sheets. Keep these
  names and English column headers stable for round-trip compatibility.
- Import Preview is read-only. Confirmed Import may replace only a Draft and
  must validate the complete payload plus Master IDs before one transaction
  replaces categories, items, scopes, and effective dates. Invalid input must
  leave the existing Draft unchanged.
- Import endpoints are Admin-only in both Node and PHP. Published/Archived
  versions return `409 IMMUTABLE_VERSION`; stale `RowVersion` returns
  `409 VERSION_CONFLICT`. Phase 2B adds no schema or upload-storage change.

## BBS Smart Card Phase 2 Constraints

- Phase 2 checklist tables come from
  `backend/migrations/20260825_bbs_phase2_checklist_builder.sql`. Use exact
  `BBS_*` casing in Node and PHP and keep the API behavior/status codes in
  parity.
- Only Draft versions are editable. Published/Archived content and scope are
  immutable; clone to a new Draft. Never hard-delete a version during normal
  operation. Template deactivate and Version archive preserve history.
- Resolver order is specificity, priority, then effective date. No match or an
  equal top match fails closed. Do not let the frontend choose a version to
  bypass the server resolver.
- Phase 2 uses only `safe_unsafe_na`; Unsafe remark/photo/action requirements
  are item configuration. Import/Export is Phase 2B, observations are Phase 3,
  and the main BBS menu remains hidden. No upload storage changed in Phase 2.

## BBS Smart Card Phase 1 Constraints

- The six `BBS_*` tables come from
  `backend/migrations/20260825_bbs_phase1_foundation.sql`. Node and PHP must use
  the exact migration table-name casing and preserve `/api/bbs/*` parity.
- BBS level maps from Master Position and is not a global role. Missing mapping
  or hierarchy denies by default. Resolve pilot Department/Safety Unit from
  Master IDs and do not hardcode the business names.
- Keep the main BBS navigation hidden until Phase 3. Phase 1 changes no upload
  storage path.

## How Codex Should Work In This Repo

- Read `CLAUDE.md` first, then this file, then the architecture/deployment/history document relevant to the task.
- Keep changes scoped to the user's request and the current module boundary.
- Prefer existing repo patterns over new abstractions.
- Treat Thai UI/API strings as production data; preserve UTF-8 exactly.
- Leave unrelated dirty worktree changes alone.
- Do not push to GitHub unless explicitly asked in the current task.

## Session Startup

For every new task:

Always read:

1. `AGENTS.md`
2. `CLAUDE.md`

Read additional documents only when relevant:

### Architecture / System Design

If the task affects:

- APIs
- Database
- Backend
- Frontend structure
- Authentication
- Uploads

Read:

- `ARCHITECTURE.md`

### Deployment / Production

If the task affects:

- Production deployment
- FTP upload
- Shared hosting
- Backups
- Smoke tests
- Rollback procedures

Read:

- `DEPLOYMENT.md`

### Historical Behavior

If the task may affect:

- Existing behavior
- Compatibility
- Previous deployments
- Completed phases

Read:

- `CHANGELOG.md`

### Planning / Future Work

If the task involves:

- New features
- Technical debt
- Refactoring
- Project planning

Read:

- `ROADMAP.md`

Do not assume project behavior without reading the relevant documentation first.

## Context Efficiency

Read only the documentation required for the current task.

Always read:

- `AGENTS.md`
- `CLAUDE.md`

Read additional documents only when necessary:

- `ARCHITECTURE.md` -> when the task affects APIs, database, backend, frontend structure, authentication, uploads, or system design.
- `DEPLOYMENT.md` -> when the task affects deployment, production, backups, smoke tests, FTP uploads, rollback procedures, or hosting configuration.
- `CHANGELOG.md` -> when the task affects existing behavior, backward compatibility, historical implementations, previous deployments, or legacy functionality.
- `ROADMAP.md` -> when the task involves planning, technical debt, future development, refactoring strategy, or project direction.

Guidelines:

- Do not load large documentation files unless they are relevant to the task.
- Minimize context usage whenever possible.
- Prefer targeted document loading instead of reading all project documents.
- Preserve context budget for code analysis and implementation work.
- If uncertain, explain which documents need to be read and why.

## Analysis Reuse

When a plan has already been approved, do not repeat project discovery, architecture discovery, changelog review, or requirement analysis. Reuse previous approved findings whenever possible and proceed directly to implementation.

If the current session already contains:

- approved requirements
- approved implementation plan
- approved risk assessment
- approved affected files list

then:

- avoid re-reading large documentation files unnecessarily
- avoid repeating the same analysis
- avoid generating duplicate gap analysis reports
- focus on implementation and verification

Only perform additional discovery if:

- requirements have changed
- new risks are discovered
- implementation reveals missing information
- the user explicitly requests a new analysis

The goal is to minimize context usage, reduce token consumption, reduce repeated project discovery, and preserve implementation capacity for large tasks. Prefer continuing from approved findings rather than restarting analysis.

### Session Continuity Integration

When generating a Handoff Report, include:

- approved findings
- approved implementation plan
- approved risks
- approved scope

so that future sessions can continue implementation without repeating discovery work.

## Session Continuity

If context usage exceeds 80% or quota appears close to exhaustion, stop implementation and generate continuity notes before the session ends.

Generate:

- Handoff Report
- Remaining Tasks
- Risks
- Testing Status
- Ready-to-use continuation prompt

Prefer generating a handoff before context becomes critically low. Do not wait until the session is completely exhausted. Preserve implementation details needed for continuity and minimize repeated project discovery work in future sessions.

### Handoff Report Requirements

The handoff report must include:

1. Project / Feature being worked on
2. Current objective
3. Completed work
4. Remaining work
5. Files modified
6. Files still requiring changes
7. Related APIs
8. Related database logic
9. Risks and known issues
10. Verification and testing status
11. Recommended next steps

### Continuation Prompt Requirements

Generate a copy-paste ready prompt for a new Codex session.

The continuation prompt must include:

- Current project context
- Current feature context
- Completed implementation
- Remaining implementation
- Relevant files
- Risks
- Testing status
- Exact next task

The goal is that a new Codex session can continue work immediately without re-discovering project context.

## Before Coding Checklist

- Confirm whether the task is documentation-only or application behavior work.
- Check `git status --short` and avoid touching unrelated files.
- Read the relevant module file(s), handler(s), and route(s) before editing.
- Check whether production uses PHP compatibility routes, Node dev routes, or both.
- Identify whether a schema/data change, upload/storage change, cache bust, or smoke test is required.

## Safety Rules

## Collaboration Guardrails

- Do not push to GitHub unless the user explicitly asks for it in the current task.
- Local testing is expected before handoff: run `npm --prefix backend test` after backend/API changes.
- When changing upload or DB behavior, update this file and mention whether `backend/uploads/` or MySQL schema changed.
- Encoding/mojibake is the #1 safety check for every change. Before and after edits, scan changed UI/API/docs strings for replacement characters and common UTF-8/Latin-1 decode artifacts. Prefer ASCII-safe HTML entities such as `&mdash;` for fallback symbols when editing files that already have mixed encoding history. Do not bulk-replace production data; isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or actual DB content first.
- If any task requires a MySQL schema/data change, include the SQL/migration in the local handoff, apply the matching production DB update during deploy, and smoke the updated data path. If production DB changes are needed, take a fresh production backup first and document the backup ID plus verification result here.

## Production Rules

- Production target is company shared hosting/PHP plus Company MySQL/MariaDB unless the user says otherwise.
- For production-impacting changes, take a fresh production backup first and document the backup ID/path.
- Upload only the files required for the phase.
- Verify uploads with SHA-256 downloads before smoke testing.
- Remove temporary smoke helpers and verify they are gone by HTTP/FTP checks.
- Clean up every temporary test row created during smoke tests and record remaining count `0`.

## Testing Rules

- For backend/API changes, run the relevant PHP lint and Node syntax checks.
- Run `git diff --check` on changed files before handoff.
- Run the relevant authenticated smoke test for any API behavior change.
- Run `npm --prefix backend test` when backend/API permission behavior changes or when the change touches shared routes. If it fails due to known permission-audit debt, report that explicitly.
- Documentation-only changes require `git diff --check` and a mojibake scan of changed Markdown files.

## Documentation Maintenance

- After completing any task, determine whether documentation is affected.
- If architecture changed, update `ARCHITECTURE.md`.
- If deployment procedure changed, update `DEPLOYMENT.md`.
- If project history changed, update `CHANGELOG.md`.
- If roadmap changed, update `ROADMAP.md`.
- If current handoff information changed, update `CLAUDE.md`.
- Report all documentation updates in the final summary.
- Documentation must stay synchronized with code changes.

## Thai Encoding / Mojibake Rules

- Keep files as UTF-8.
- Check changed files for replacement characters and common UTF-8/Latin-1 decode artifacts.
- Do not bulk-replace Thai production text or DB content.
- If mojibake appears, isolate whether the issue is source text, frontend render, API response, PHP charset/connection, or DB content.
- Prefer ASCII-safe HTML entities such as `&mdash;` when editing files that already have mixed encoding history.

## Database Migration Rules

- Never make hidden schema/data changes.
- Include SQL/migration details in handoff notes when a DB change is required.
- Apply matching production DB updates during deploy only after backup.
- Smoke the updated data path after migration.
- Preserve PHP production and Node dev parity when both stacks expose the same route.

## Upload / Storage Rules

- Uploaded files live in local server storage and must be backed up with MySQL.
- Do not delete stored attachments during soft deletes unless the module has an explicit attachment delete endpoint.
- Validate file type/size through the established upload middleware/handler patterns.
- When changing upload URLs or storage paths, update deployment notes and smoke both upload and retrieval.

## Forbidden Actions

- Do not modify application code for documentation-only tasks.
- Do not push to GitHub unless explicitly requested in the current chat.
- Do not run destructive Git commands such as reset/checkout against user changes.
- Do not delete historical handoff, deployment, smoke, backup, or phase notes.
- Do not hardcode department lists where `/master/departments` is the source of truth.
- Do not bypass auth/session helpers or use stale `localStorage` user data.
- Do not interpolate raw user input into SQL.
- Do not change password minimums, role normalization, soft-delete behavior, or Patrol schema assumptions without an explicit task.

## Common Pitfalls

0a. **BBS Phase 3 private evidence** — Observation images live under `backend/private-uploads/bbs`, never under public `/uploads`. Keep the deny-all `.htaccess`, validate JPEG/PNG/WebP content and the 10 MB limit in Node/PHP, retrieve only through the object-authorized evidence API, and back up this directory with MySQL.
0b. **BBS Observation immutability/retries** — Draft creation is unique by `(ObserverEmployeeID, IdempotencyKey)` and returns the same record on retry. Submitted Observations and Checklist/item snapshots are immutable; submit retry returns the existing record. Unsafe remark/photo/immediate-action rules require frontend and server validation.

1. **Uploaded files live on disk now** — use `backend/storage.js`; files are saved under `backend/uploads/` and served from `/uploads`
2. **`backend/.env` path** — โค้ด dotenv ใช้ `__dirname + '/.env'` ไม่ใช่ root `.env`
3. **`Employees` primary key** คือ `EmployeeID` (string) ไม่ใช่ `id`
4. **Company MySQL/MariaDB port** is normally 3306 unless IT provides a different port
5. **Legacy password mode** — ถ้า `Password` column เป็น NULL จะใช้ EmployeeID เป็น password (ต้องย้ายมาใช้ bcrypt)
6. **Frontend เป็น SPA** — ทุก page อยู่ใน `index.html`, JS แยกตาม page ใน `public/js/pages/`
7. **localStorage key mismatch (fixed)** — `tsh_user` คือ key จริง แต่ใช้ `TSHSession.getUser()` เสมอ ไม่อ่าน localStorage โดยตรง
8. **Form fields ที่มาจาก JWT** — ต้อง `readonly`/`disabled` + `<input type="hidden">` เพื่อส่งค่าให้ form ได้รวม
9. **Express v5** — ใช้จริงใน production (`package.json` ระบุ `"express": "^5.1.0"`) ต่างจาก v4 ตรงที่ error handling และ async route errors
10. **bcrypt + bcryptjs** — มีทั้งสองตัวใน dependencies (ซ้ำซ้อน) — code ใช้ `bcryptjs` เท่านั้น, `bcrypt` เป็น native binding ที่ไม่จำเป็น
11. **`backend/uploads/`** — must exist on the company server and must be backed up together with MySQL
12. **`window.closeModal` pattern** — `closeModal` จาก `ui.js` ไม่ถูก expose บน window โดยอัตโนมัติ ต้อง set `window.closeModal = closeModal` ใน page module ก่อนเปิด modal ที่มี inline onclick
13. **Upload field name** — `POST /api/upload/document` ใช้ field ชื่อ `document` (ไม่ใช่ `file`) — multer config กำหนดไว้ใน `backend/storage.js`
13a. **Upload original filenames** — stored filenames are random/safe; original display/download name is carried in `?filename=...`. Use `showDocumentModal()` or parse `filename` metadata; do not display `path.basename(url)` as the real document name.
14. **`Admin_AuditLogs` table** — auto-created/auto-migrated by `backend/utils/audit.js`; no manual DBeaver SQL step is required for normal startup
14a. **Policy acknowledge-all is irreversible in normal UI** — `POST /api/policies/:id/acknowledge-all` marks every employee as acknowledged. It is idempotent and audit-logged, but there is no bulk undo button; use only after Admin confirmation.
15. **`safeCount()` in system health** — ตาราง module ใหม่อาจยังไม่มีใน DB ทำให้ health check return `null` แทน error
16. **Express route ordering** — `PUT /api/kpidata/bulk` ต้องประกาศ **ก่อน** `PUT /api/kpidata/:id` ไม่งั้น `/bulk` จะถูก match เป็น `:id`
17. **Machine Safety file upload field** — `POST /api/machine-safety/:id/files` ใช้ multer field ชื่อ `file` (ไม่ใช่ `document`) ต่างจาก generic upload endpoint
18. **Add machine → upload files** — ต้อง POST machine ก่อน → รับ `id` จาก response → แล้วค่อย upload files/links ทีละขั้น (multi-step creation)
19. **KPI_DATA_FIELDS whitelist** — column จริงใน DB คือ `Metric`, `Department` (ไม่ใช่ `MetricName`, `Category`) — ตรวจ whitelist ใน `server.js` ก่อนแก้ field names
20. **`machine-safety.js` enterprise fields** — `Status`, `RiskLevel`, `NextInspectionDate` ถูก auto-migrate ใน `ensureTables()` แล้ว รวมถึงตาราง `Machine_Safety_Compliance` และ `Machine_Safety_Issues` — ไม่ต้องรัน SQL แยก; `ensureTables()` ทำงานครั้งแรกที่ request มาถึง route
21. **EmployeeID format** — รองรับทั้งตัวเลข 6 หลัก (012609) และแบบ letter-prefix (AP0001, SP0001) — placeholder ทุกที่ต้องอ้างอิงทั้งสองรูปแบบ
22. **EmployeeID cascade update** — `PUT /api/profile/employee-id` ใช้ `pool.getConnection()` + transaction เพื่อ update Employees PK + 9 related tables แล้ว re-issue JWT ใหม่ — frontend ต้อง reload หลังสำเร็จ
23. **`isAdmin` ใน patrol routes** — `/api/patrol` mount ใช้ `authenticateToken` เท่านั้น ถ้าต้องการ admin-only endpoint ภายใน patrol.js ต้อง import `isAdmin` จาก `../middleware/auth` แล้วใส่เป็น per-route middleware (`router.post('/...', isAdmin, handler)`)
24. **`Patrol_Roster` auto-create** — สร้างด้วย `CREATE TABLE IF NOT EXISTS` ใน startup IIFE ของ `patrol.js` — ไม่ต้องรัน SQL แยก; ใช้ `VARCHAR(20)` ไม่ใช่ `ENUM` สำหรับ `RosterGroup` เพื่อให้ import/export ข้าม MySQL-compatible engines ง่ายขึ้น
25. **Patrol overview sub-tabs** — `ov-sub-mgmt` (Top&Management) และ `ov-sub-sv` (Sec.&Supervisor) แยก canvas ID: `ov-mgmt-pie` / `ov-sv-pie` — supervisor tab ใช้ yearly filter เท่านั้น (ไม่มี month filter แล้ว)
26. **Safety Units cascading** — `Master_SafetyUnits` มี `department_id` — ทั้ง registration form (`index.html`) และ profile drawer (`profile.js`) filter units ตาม department ที่เลือก ซ่อน unit select ถ้าไม่มี units ใน dept นั้น
27. **`/api/register/options` เป็น public** — ไม่ต้อง auth แต่ `apiFetch` จะส่ง auth header ไปด้วยถ้า token มีอยู่ — ไม่เป็นปัญหา backend ไม่ enforce auth บน route นี้
28. **`admin.js` ใช้ `API` object เท่านั้น** — import เป็น `import { API } from '../api.js'` ไม่ใช่ `apiFetch` โดยตรง — path ต้องไม่มี `/api/` นำหน้า (e.g. `API.get('/activity-targets/me')` ไม่ใช่ `API.get('/api/activity-targets/me')`)
29. **Activity Targets — hybrid architecture** — override (`Employee_Activity_Targets`) มีลำดับสูงกว่า template (`Activity_Position_Templates`) เสมอ — `getMergedTargets()` ใน `activity-targets.js` handle การ merge; ทั้งสอง table auto-migrate `IsNA` column ผ่าน `ALTER TABLE ... ADD COLUMN` (try/catch)
30. **Activity Targets — `IsNA` flag** — ถ้า `IsNA=1` → `YearlyTarget=0` และ activity ถูก filter ออกจาก `/me` response — ไม่แสดงใน compliance widget ของ user
31. **Activity Targets — `patrol_issue` actual count** — `Patrol_Issues` ไม่มี `ReporterID` column → `actualCount` คืน `null` เสมอ — ยังไม่รองรับ per-person tracking
32. **Activity Targets — compliance widget (pending)** — แต่ละ module page (patrol, cccf, training, yokoten, hiyari, ky, ojt) ยังไม่มี widget แสดง progress — ให้เพิ่มตอน restyle โดย call `GET /api/activity-targets/me` แล้วกรอง `activityKey` ที่ต้องการ
33. **Patrol PDF fixed-page approach** — ห้ามใช้ section-by-section render แล้ว addPage ตาม content height (จะเกิด whitespace gap) — ต้องสร้าง HTML `794×1122px` ต่อหน้าเสมอ แล้ว render ทีละหน้า
34. **Patrol roster add modal — filter both groups** — ตอน fetch รายชื่อพนักงานสำหรับ add modal ต้อง fetch ทั้ง `top_management` + `supervisor` roster พร้อมกัน แล้ว union เป็น `existingIds` เพื่อซ่อนคนที่อยู่ในกลุ่มใดกลุ่มหนึ่งแล้ว
35. **`Patrol_Sessions` PK คือ `SessionID` ไม่ใช่ `id`** — ทุก query ที่ SELECT จาก `Patrol_Sessions` ต้องใช้ `s.SessionID AS id` ไม่ใช่ `s.id` และ UPDATE/DELETE ต้องใช้ `WHERE SessionID = ?` — ถ้าใช้ `s.id` จะเกิด SQL error → 500 ทุกครั้ง; Columns จริง: `SessionID, PatrolDate, Year, Description, Area, CheckType, InspectorName, TeamName, Status, CreatedBy, TeamID, AreaID, PatrolRound`
36. **Unexpected token '<' มักคือ backend ส่ง HTML แทน JSON** — สาเหตุที่พบบ่อย: (1) `ALLOWED_ORIGINS` ไม่รวม frontend origin จริง (2) DB credentials หรือ JWT_SECRET ไม่ครบ (3) backend process crash; วิธีแก้: ตรวจ `.env`, CORS, server logs แล้ว restart backend
37. **`Patrol_Attendance` columns เพิ่มเติม** — มี `PatrolType VARCHAR(20)` (ค่า: `'normal'`, `'compensation'`, `'Re-inspection'`) และ `RecordedBy VARCHAR(50)` — ถูก auto-migrate ด้วย `ALTER TABLE ... ADD COLUMN` ใน patrol.js startup; `compensation` = เดินซ่อม ใช้ `PatrolDate` จาก missed sessions dropdown (ดึงจาก `Patrol_Sessions` ที่ผ่านมา)
38. **patrol.js ส่วนตัว layout** — `grid grid-cols-1 xl:grid-cols-3`: left column (xl:col-span-2) = check-in card, mini calendar, next patrol, year dots, monthly sessions, **Team Roster (ทีมของฉัน)**, Self-Patrol; right sidebar (xl:col-span-1) = performance ring, recent checkins, issues — Team Roster อยู่ใน left column เพื่อใช้พื้นที่กว้าง
39. **CCCF Target = จำนวนคน ไม่ใช่ครั้ง** — `yearly_target` ใน `CCCF_Unit_Targets` หมายถึงจำนวน unique คน (EmployeeID) ที่ต้องส่ง ไม่ใช่จำนวนครั้ง — `achieved = Set(EmployeeIDs).size`
40. **CCCF `achieved_override` — NULL vs 0** — `null` = ใช้ค่าจากระบบ (computed), `0` = admin ตั้ง override เป็น 0 จริงๆ — ต้องส่ง `null` ไม่ใช่ `''` เพื่อ clear override; backend แปลง empty string → `null` แล้ว
41. **CCCF Unit Summary DOM IDs** — outer wrapper: `id="cccf-unit-summary"`, inner re-renderable: `id="cccf-unit-summary-inner"` — ทุก function ที่ update summary ต้อง target `cccf-unit-summary-inner` และ call `setTimeout(() => initUnitChart(), 0)` หลัง `innerHTML =`
42. **CCCF "รายการของฉัน" wrapper** — `id="cccf-my-card-wrap"` ใน `renderPage()` — `window._myCardSetYear()` re-renders แค่ card นี้โดยไม่ reload ทั้งหน้า
43. **CCCF Chart horizontal bar** — ใช้ `indexAxis: 'y'` ใน Chart.js options — Y-axis labels truncate ที่ 22 chars ด้วย `callback: function(val) { const name = this.getLabelForValue(val); return name.length > 22 ? name.slice(0,21)+'…' : name }` — ห้ามใช้ vertical bar เพราะ X-axis labels ถูกตัดเมื่อมี unit มาก
44. **Machine Safety issues route ordering** — `PUT /issues/:issueId` และ `DELETE /issues/:issueId` ต้องประกาศ **ก่อน** `PUT /:id` และ `DELETE /:id` ในไฟล์ `machine-safety.js` — ถ้าประกาศหลัง Express จะ match `'issues'` เป็น `:id` ทำให้ไม่ทำงาน (Express v5 ใช้ path-to-regexp เหมือนกัน)
45. **Machine Safety row highlighting — inline style** — ใช้ inline `style="background:rgba(...)"` บน `<tr>` ไม่ใช่ Tailwind arbitrary value เช่น `bg-red-50/55` เพราะ CDN Tailwind ไม่ compile arbitrary opacity values ที่ไม่ได้ใช้ใน source
46. **`_msdSetAuditFilter()` toggles** — ถ้า user คลิก badge เดิมซ้ำ จะ clear filter (toggle off) และ sync dropdown `#msd-audit` ด้วย — ต้องทำทั้งสองทาง (badge คลิก ↔ dropdown เปลี่ยน) ให้ state `_filterAudit` เป็น source of truth
47. **Training module — department-based (ไม่ใช่ individual)** — `Training_Dept_Records` คือตารางหลักใน UI ปัจจุบัน; `Training_Records` (individual) ยังมีใน DB แต่ UI ไม่ใช้แล้ว — อย่าสับสนกัน; unique constraint คือ `(Department, Year, CourseID)` ไม่ใช่ `(Department, Year)` เพราะ 1 แผนก/ปี มีได้หลายหลักสูตร
48. **Training `CourseID` NULL-safe duplicate check** — MySQL UNIQUE index ถือ NULL เป็น distinct ทุกค่า (ไม่ conflict) → ต้องใช้ `CourseID <=> ?` ใน app-level guard ด้วย ไม่ใช่ `CourseID = ?` (ซึ่งจะไม่ match NULL)
49. **Training dashboard — Dept×Course Matrix** — คำนวณ client-side จาก `_deptRecords` (ดึงจาก `/training/dept-records?year=`); แสดงเฉพาะเมื่อมี 2+ courses; lookup key = `` `${dept}::${courseID ?? '__null__'}` ``
50. **`API.patch()` ใน `api.js`** — method PATCH ถูกเพิ่มแล้วใน `api.js`; `admin.js` ใช้ `API.patch(...)` สำหรับ toggle-cancel sessions — ห้าม import `apiFetch` โดยตรงใน `admin.js`
51. **contractor.js accent color = amber** — gradient `#d97706 → #b45309`, shadow `rgba(217,119,6,...)` — ห้ามใช้สี sky/blue ใน contractor module
52. **Yokoten Phase 3 — one response per dept** — `YokotenResponses` มี UNIQUE KEY `uq_dept_topic (YokotenID, Department)` — ใช้ `deptResponse` (singular) ไม่ใช่ array; ห้ามใช้ `myResponse` หรือ `UserID` lookup อีกต่อไป
53. **Yokoten `only_full_group_by` — ห้าม `SELECT r.* ... GROUP BY r.ResponseID`** — MySQL/MariaDB บางเครื่องเปิด `only_full_group_by`; ถ้าต้องการ files ให้ดึงแยกด้วย `SELECT * FROM Yokoten_Response_Files WHERE ResponseID IN (...)` แทนการ JOIN + GROUP_CONCAT
54. **Yokoten response FormData** — `POST /yokoten/respond` และ `PUT /yokoten/respond/:id` รับ FormData (field: `responseFiles`) — ถ้าส่ง JSON จะไม่ได้รับไฟล์; `apiFetch` detect `body instanceof FormData` และข้าม `Content-Type` header อัตโนมัติ
55. **Yokoten approval status** — `null` = No/ไม่เกี่ยวข้อง (auto-approved/no action), `'pending'` = Yes/เกี่ยวข้อง รอ admin หลังแนบ action/evidence, `'approved'` = admin อนุมัติ, `'rejected'` = admin ปฏิเสธ; `CorrectiveAction` + evidence file required เมื่อ `IsRelated='Yes'` (validation ทั้ง client+server)
56. **Yokoten dept filtering — TargetDepts=[] = ทุกแผนก** — `_filterToTargetedDepts()` ต้องคืน deptSummary ทั้งหมดเมื่อ topic ใดมี `TargetDepts=[]`; ห้าม filter ออกทุกแผนกในกรณีนี้; ใช้ฟังก์ชันนี้ทุกที่ที่แสดงผลรายแผนก (dashboard, chart, admin dept tab, PDF)
57. **Yokoten RTE link/image — ต้องบันทึก selection ก่อนเปิด input bar** — `contenteditable` เสีย focus เมื่อ user คลิก input; ต้องเรียก `_saveSelection()` ใน mousedown handler (ก่อน `preventDefault`) แล้วค่อย `_restoreSelection()` ก่อน `execCommand`; ถ้าไม่ทำ link/image จะถูก insert ที่ตำแหน่งผิด
58. **Yokoten RTE `execCommand`/`queryCommandState` deprecated hint** — IDE แสดง hint code 6387 สำหรับทั้งสองคำสั่ง; นี่คือ spec deprecation ไม่ใช่ browser removal — ยังทำงานได้ในทุก modern browser; ไม่มีทางเลือกอื่นใน vanilla JS; ไม่ต้องแก้ไข
59. **`escHtml()` สำหรับ err.message ใน innerHTML** — ทุกที่ที่ inject `err.message` เข้า innerHTML ต้องผ่าน `escHtml(err.message)` เสมอ; import จาก `../ui.js`; ห้ามใช้ `err.message` โดยตรงใน template literals ที่ assign ให้ innerHTML เพราะเสี่ยง XSS
60. **patrol.js — routes ที่ต้องการ `isAdmin`** — POST/PUT/DELETE `/teams`, POST `/teams/:id/members`, DELETE `/teams/:teamId/members/:memberId`, POST `/member-rotation`, POST `/generate-sessions`, PUT `/sessions/:id`, DELETE `/sessions/:id` ทุกตัวต้องมี `isAdmin` middleware; CLOSE/UPDATE ใน POST `/issue/save` ก็ต้องมี admin check
61. **patrol.js — `/checkin` duplicate guard** — POST `/checkin` ตรวจ `Patrol_Attendance` ก่อน INSERT ว่า user เช็คอิน `(UserID, DATE(PatrolDate), PatrolType)` ซ้ำหรือไม่; return 409 ถ้าซ้ำ
62. **`PatrolType` whitelist** — รับได้เฉพาะ `['normal', 'compensation', 'Re-inspection']`; ค่าอื่น fallback เป็น `'normal'` อัตโนมัติ; กำหนดไว้ใน `ALLOWED_PATROL_TYPES` constant ใน patrol.js
63. **cascade EmployeeID warning log** — `.catch()` ใน cascade loop ไม่ใช่ silent swallow อีกต่อไป — log `console.warn` แสดงชื่อตารางและ error message เพื่อให้ debug ได้
64. **Activity Targets compliance widget** — `public/js/utils/activity-widget.js` export `buildActivityCard(activityKeys)` → returns async HTML card (glass style) สำหรับแปะต่อท้าย hero stats strip — import แล้วเรียกท้าย `_loadHeroStats()` / `_renderHeroStats()` โมดูลที่ใช้: hiyari (`'hiyari'`), ky (`'ky'`), yokoten (`'yokoten'`), training (`'training'`), ojt (`'scw'`); patrol+cccf ไม่ใช้เพราะแสดงข้อมูลเดียวกันอยู่แล้วในสตริป
65. **Legacy password auto-migration** — เมื่อ `user.Password` เป็น NULL (legacy mode) และ login สำเร็จ, server.js จะ fire-and-forget `bcrypt.hash` → `UPDATE Employees SET Password=?` โดยอัตโนมัติ — ครั้งถัดไปที่ user login จะใช้ bcrypt เต็มรูปแบบ; migration ล้มเหลว = `console.warn` แต่ login ยังผ่าน
66. **Password minimum 4 ตัว** — validation enforce ทั้ง PHP production (`api/handlers/foundation.php` register + change-password + admin reset), Node dev (`server.js` register + change-password), Admin reset route, และ frontend (index.html, main.js, profile.js, admin.js); strength indicator แสดง 5 ระดับตาม score: length>=4 + lowercase + uppercase + digit + symbol; อย่าตั้ง validation กลับไป 6 หรือ 8 ตัว
67. **`normalizeRole()` ใน server.js** — ต้องเรียกใน login handler ก่อน sign JWT ทุกครั้ง; ใช้ `ALLOWED_ROLES.find(ar => ar.toLowerCase() === r.toLowerCase())` — ถ้าไม่พบ fallback `'User'`; ป้องกันกรณี DB มี role เป็น `'admin'` lowercase แล้ว isAdmin check (`=== 'Admin'`) fail
68. **Soft delete pattern — `IsDeleted TINYINT(1) DEFAULT 0`** — ทั้ง `Accident_Reports` และ `YokotenResponses` ใช้ soft delete; DELETE endpoint → `UPDATE ... SET IsDeleted=1`; ทุก GET/summary/analytics query ต้อง filter `WHERE (IsDeleted IS NULL OR IsDeleted = 0)`; ใช้ NULL-safe เพราะแถวเดิมก่อน migrate จะมีค่า NULL ไม่ใช่ 0
69. **Accident soft delete — Attachments ยังคงอยู่** — การ soft delete `Accident_Reports` ไม่ลบ `Accident_Attachments` และไม่ลบไฟล์จาก server file storage; ถ้าต้องการลบไฟล์ให้ใช้ `DELETE /accident/attachments/:id` แยกต่างหาก
70. **Yokoten bulk approve — safe integer validation** — `POST /yokoten/bulk-approve` รับ `{ ids: [...] }` แล้ว map `parseInt(id, 10)` filter `!isNaN && > 0` ก่อน build `IN (...)` placeholder ทุกครั้ง — ห้าม interpolate ids โดยตรงใน SQL string
71. **Dashboard alerts — silent fail** — `GET /dashboard/alerts` ทุก sub-query ใช้ `.catch(() => [])` เพราะตารางบางอันอาจยังไม่มีใน DB; frontend `_loadAlerts()` ก็ `try/catch` silent — widget ไม่แสดงถ้าไม่มีรายการ (ไม่แสดง "0 alerts" section)
72. **Hiyari → Yokoten cross-module flow** — `hiyari.js` เขียน `sessionStorage.setItem('hiyari_to_yokoten', JSON.stringify({ title, description, riskLevel, sourceHiyariId }))` แล้ว navigate `location.hash = '#yokoten'`; `yokoten.js` อ่านใน `loadYokotenPage()` หลัง `refreshData()`, `removeItem` ทันที, switch tab admin→topics, เรียก `openTopicForm(null, prefill)` ด้วย `setTimeout(..., 150)` เพื่อให้ DOM settle; ถ้าไม่ใช่ admin → ไม่ดำเนินการ (try/catch คลุม)
73. **Accident PDF export — `window._accExportPDF(id)`** — สร้าง `div 794×1122px` position:fixed left:-9999px, render ด้วย html2canvas scale:1.5, จากนั้น jsPDF addImage A4; ใช้ helpers `_pdfField()` / `_pdfFieldFull()` ที่นิยาม local ในไฟล์; filename pattern: `ACC-XXXX-YYYYMMDD.pdf`; ต้องการ `html2canvas` + `jspdf` CDN (มีแล้วใน index.html)
74. **String normalization — filter comparison ต้อง `.trim()` ทั้งสองฝั่ง** — ค่า Department ที่มาจาก DB อาจมี leading/trailing whitespace จากการกรอก free-text ในอดีต; ทุก client-side filter ที่เปรียบเทียบ string กับ master data ต้องใช้ `(r.Field || '').trim() === masterValue`; master values ต้อง trim ตั้งแต่ตอน fetch: `.map(d => (d.Name || d.name || '').trim()).filter(Boolean)`; ห้าม mutate ข้อมูลใน `_ppeInspections` / `_assessments` โดยตรง — normalize เฉพาะตอน compare
75. **Department master data — `/master/departments` เป็น single source of truth** — ทุก module ที่มี department dropdown ต้องดึงจาก `GET /master/departments` (ไม่ใช่ hardcode หรือ derive จาก records); lazy-cache ใน module-level `_departments = []`; fetch ใน `_loadHeroStats()` พร้อมกับ fetches อื่นโดยใช้ `if (_departments.length === 0) fetches.push(_fetchDepts())`; `.catch()` ใน `_fetchDepts()` ต้อง return ค่าที่ทำให้ `_departments` เป็น `[]` — UI guard ด้วย `_departments.length > 0` ก่อนแสดง select และ filter bar; fallback เป็น `<input type="text">` เมื่อ departments ไม่พร้อม (graceful degradation ไม่ crash)
76. **Progress bar inline colors — ใช้ hex ตรงจาก `training.js` เสมอ** — color constants สำหรับ compliance/pass-rate progress bars: null → `#e2e8f0` (slate-200, ไม่ใช่ slate-400), pass → `#059669`, warn → `#d97706`, fail → `#ef4444`; ห้ามใช้ Tailwind class arbitrary value (CDN ไม่ compile); ห้ามใช้ hex ใกล้เคียงเช่น `#94a3b8` (slate-400) สำหรับ null state — จะทำให้ bar มองเห็นทั้งที่ไม่มีข้อมูล; thresholds ขึ้นอยู่กับ domain: training ใช้ 80%/60%, PPE compliance ใช้ 90%/70%
77. **Dropdown + filter pattern — ห้ามสร้าง abstraction ใหม่** — เมื่อต้องการ department filter บน tab: (1) ใช้ `<select onchange="window._xxxSetDeptFilter(this.value)">` inline ใน HTML template, (2) register `window._xxxSetDeptFilter = (val) => { _filterXxx = val; renderPanel(id); }` ใน `setupEventListeners()`, (3) filter ใน render function ก่อน compute stats — ไม่ต้องสร้าง helper class, factory, หรือ shared filter component; pattern นี้เหมือนกับ `_msdSetAuditFilter` ใน machine-safety.js
78. **Backend numeric range validation — `parseScore()` pattern** — ทุก route ที่รับคะแนน/score จาก user input ต้องมี helper validate: `if (val === '' || val == null) return null; const n = parseFloat(val); if (isNaN(n) || n < MIN || n > MAX) throw new Error('...')` แล้ว return rounded value; throw ใน try/catch → `res.status(400).json(...)` ก่อน INSERT/UPDATE; ห้าม insert raw `req.body` score โดยไม่ validate range
79. **SQL NULL-aware average — ห้ามใช้ `COALESCE(col, 0) / totalCount`** — เมื่อบางคอลัมน์ nullable ใน average calculation: `COALESCE(col,0)` จะนับ NULL เป็น 0 ทำให้ค่าเฉลี่ยต่ำกว่าความเป็นจริง; ต้องหารด้วย `NULLIF((col1 IS NOT NULL)+(col2 IS NOT NULL)+..., 0)` เพื่อหารเฉพาะจำนวนคอลัมน์ที่มีค่า; pattern นี้ใช้ใน `safety-culture.js` route `yearTrend` query สำหรับ T1–T5,T7 scores
80. **4M Notice responsible identity** — `fourm_changenotices.ResponsibleEmployeeID` is the stable Employee Master key; `ResponsiblePerson` is only the display-name snapshot and legacy fallback. Notice Department and responsible employee Department are intentionally independent. Admin assignment must resolve EmployeeID/CompanyEmail server-side; ordinary users remain self-assigned. Notice emails de-duplicate responsible, creator, and Admin recipients, while missing responsible CompanyEmail must not block the Notice write.
80. **Yokoten bulk response — transaction + deferred SMTP** — `POST /api/yokoten/respond` ต้อง lock selected `(YokotenID, Department)` rows ด้วย `FOR UPDATE` และ commit response/file rows แบบ atomic; active response คืน 409, soft-deleted unique slot ต้อง restore ด้วย `ResponseID` ใหม่และ `IsDeleted=0` โดยไม่ลบไฟล์ประวัติ; เมื่อส่งมากกว่า 1 Department ให้ queue outbox โดยไม่รอ SMTP (`notificationMode='queued'`) เพื่อไม่ให้ PHP request timeout
81. **4M PUT optional attachment** — an unchanged `<input type="file">` can arrive as a multipart part with `filename=""`; the PHP PUT parser must ignore that part and retain the existing `AttachmentUrl`. Do not pass an empty file part to `store_upload()` or it will return `Unsupported upload`.
82. **4M Paste Employee IDs is a verified write** — `Assign IDs` must POST eligible IDs to `/fourm/training-curriculums/:id/assignments` and then GET the curriculum assignments to confirm every non-missing/non-blocked ID is visible before showing success. Do not use an `Added` toast for selection-only state. Keep only one active `showAssignEmployeesModal()` declaration; legacy duplicates must not override it.
83. **4M transfer confirmation detaches/disables the form** — `guardSubmitHandler()` disables form controls immediately after the handler reaches its first `await`, and `showConfirmationModal()` can replace the transfer modal. Capture `FormData` and element references before awaiting confirmation; after completion, only restore a referenced control when `element?.isConnected`. Otherwise the destination ID is omitted and `document.getElementById(...)` returns null.
84. **4M Training Matrix KPI source** — the five matrix KPI cards must use `GET /fourm/training-matrix-summary`, not `_tmCurriculums`, `_tmCourses`, or the currently selected `_tmAssignments`. The summary is scoped by year/department server-side and includes active curricula/courses, distinct assigned employees, both curriculum/course transfer rows, and inactive curricula/courses. Every successful Training Matrix mutation must finish with `fetchTrainingMatrix()` so the authoritative summary is read again.
85. **BBS Phase 4 QR is a locator, never authentication** — store only SHA-256 token hashes plus short fingerprints. Raw tokens are returned only on issue/replace and travel in `#bbs-qr=`. Public resolve must not return identity. Authenticated claim must preserve the current session and authorize only self, Admin, or a current direct hierarchy assignment.
86. **BBS card templates are private CR80 assets** — store verified JPG/PNG/WebP files in `backend/private-uploads/bbs-card-templates`, serve them through the Admin-authorized API only, and back them up with MySQL/private evidence. Replace/reprint rotates the QR token; normal rollback uses archive/revoke rather than deleting issued history.
87. **BBS Phase 5 action lifecycle** — qualifying submitted Unsafe answers create exactly one action per `AnswerID`; lifecycle is `Open -> In Progress -> Pending Verification -> Closed`, with `Pending Verification/Closed -> Reopened`. After evidence is mandatory before verification. Reminder tests queue only; keep `BBS_Settings.action_notifications_enabled=0` unless real delivery is explicitly approved. Operational rollback preserves action/history/evidence data.
88. **BBS Phase 6 analytics scope/formula** — enforce Personal/Team/Department/Company permission in Node and PHP before applying filters. KPI actual is capped per eligible workday by the configured daily target. Drill-down and `/analytics/export-data` must reuse the same scoped query; rollback disables `analytics_enabled` and `analytics_export_enabled` only.
89. **BBS Phase 7 rollout gate** — `/api/bbs/qr/claim` must return `data.employee` as one object in both Node and PHP, never a MySQL row array. BBS API responses use `private, no-store` and module security headers. A valid Master scope alone is not Pilot-ready: require business-approved roster, Active Assignments, an applicable Published Checklist, and a clean read-only Pilot reconciliation before deployment approval.
