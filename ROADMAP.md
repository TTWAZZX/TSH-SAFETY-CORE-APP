# TSH Safety Core Activity - Roadmap

## BBS integration deployed; activation remains gated (2026-09-05)

The eight-file Admin-only candidate is now pushed/deployed and verified, with both Designer flags disabled. Next work remains controlled signed-receipt API lifecycle and desktop/mobile/physical print acceptance plus Department asset authorization review. No ordinary-user rollout is authorized. See `docs/bbs-integration-review-20260905.md`.


## BBS next acceptance gate (2026-09-05)

Local reconciliation and 49-suite regression are complete. Next: signed-receipt authenticated API UAT, desktop/mobile/physical duplex acceptance and Department asset authorization review. The Admin-only candidate is prepared, not deployed. Keep ordinary-user rollout closed under Phase 10E; use `docs/bbs-integration-review-20260905.md` as the current continuation scope.

## CCCF Phase C1-C4 Ownership, Delegation and Review Queue (2026-09-03)

Implementation and verified shared-hosting PHP deployment are complete. Business UAT should cover self-submit, Admin-granted delegated submit, disabled-delegation rejection, owner KPI attribution, owner/submitted-by detail/history, Approve with comment and Reject with required reason on Desktop/Mobile.

## BBS Smart Card Phase 10F Visual Card Designer (2026-09-02)

Phase 10F-0 architecture, Phase 10F-1 additive foundation and Phase 10F-2 Visual Designer Editor are complete locally. Admin can compose Draft Personal/Department layouts on a Front/Back canvas, upload Draft-bound private artwork, use layers/properties and undo/redo, and preview immutable versions. Local editing is enabled while live designer rendering remains disabled, so all existing card/QR/print output still uses the established renderer. The next phase is 10F-3 Personal Card Integration and render-contract reconciliation; it must preserve the one-time Personal QR lifecycle and remain behind the rendering flag until separate acceptance. Production and GitHub are unchanged.

## BBS Foundation Admin Readiness (2026-09-02)

System Console readiness and guided setup are deployed to Production behind `staged_admin_only=1`. Admin can now complete Production Mapping, Pilot, Inspector/Team, Checklist and Card/QR configuration from the guided workflow, then rerun the Phase 10E acceptance audit. Controlled Pilot and company-wide rollout remain separate explicit approvals.

## BBS Smart Card Phase 10E Pilot Acceptance (2026-09-01)

The code is now deployed to Production behind the Admin-only gate. Production business configuration remains incomplete: there is no effective Active Pilot scope, inspector enrollment or team assignment, so the safe state is `staged_admin_only=1`, `pilot_scope_only=0`. The next milestone is Admin-led Production configuration and business UAT, followed by a fresh gate audit and separately approved Controlled Pilot activation (`0/1`). Company-wide rollout (`0/0`) remains out of scope.

Controlled Pilot access is deployed as an intermediate UAT boundary but remains disabled. The remaining path is to complete real Production Pilot Checklist/card/QR/handler/team inputs, rerun the gate, then explicitly switch to Controlled Pilot for representative UAT before any separate company-wide approval.

Technical pre-acceptance is complete locally: the repeatable gate, Phase 7-10E contracts, full Backend regression and authenticated mobile/desktop browser UAT pass. The local staged gate remains `1`. The approved Maintenance / Tube Cutting Pilot now has confirmed Inspector `002671`, Operator/team member `012816` and a Monday-Friday target-1 schedule; test account `111111` is excluded from enrollment and assignment. The decision remains `CONFIGURATION_REQUIRED` because Batch acceptance needs a second real Operator/team member and the Pilot still needs an applicable Published Checklist, approved Personal/Department templates, Department QR, Community handler and representative business workflow evidence. After those owner-supplied inputs are accepted, rerun `audit:bbs-phase10e`; only `READY_FOR_ROLLOUT_REVIEW` plus explicit approval may advance to the Production runbook.

## BBS Smart Card Phase 10D-5 Mobile Agenda & Risk Detail (2026-09-01)

Deployed behind the Admin-only Production gate. Inspector schedules now have a mobile-first Agenda backed by the existing authoritative daily schedule response, and Admin Community Risk review combines evidence and Action History in one accessible detail view. Remaining pre-rollout work is the residual searchable-picker audit plus business-owner Pilot data/role acceptance; ordinary-user Production rollout remains a separate approval.

## BBS Smart Card Phase 10D-4 Operational Follow-up (2026-09-01)

Deployed behind the Admin-only Production gate. Admin can monitor the existing Corrective Action Email Outbox by Queued/Sent/Failed state, search/filter/page large histories and safely retry Failed messages only when delivery is operational. Ordinary-user rollout remains a separate Pilot acceptance action.

## BBS Smart Card Phase 10D-3 Scalable Lists & Filtering (2026-09-01)

Deployed behind the Admin-only Production gate. History, Actions, Community Good/Risky, Personal Card recipients and Card history use bounded server-side pagination and server-side search/filtering while preserving legacy API consumers and every existing authorization/privacy rule. Ordinary-user rollout remains a separate Pilot acceptance action.

## BBS Smart Card Phase 10D-2 KPI Status Clarity (2026-09-01)

Deployed behind the Admin-only Production gate. KPI semantics are server-authoritative and consistently distinguish not applicable, not configured, scheduled but not yet due, due with true zero performance, and calculated completion. Dashboard, compliance, analytics and exports remain aligned with the existing capped schedule formula; ordinary-user rollout remains separately gated by Pilot acceptance.

## BBS Smart Card Phase 10D-1 Checklist Readiness & Observation Eligibility (2026-09-01)

Deployed behind the Admin-only Production gate. Employee selectors expose server-authoritative Checklist Readiness, explain non-ready states and fail closed for new Single/Batch selection while preserving existing Draft recovery and immutable Checklist snapshots. Ordinary-user rollout remains separate and gated by Pilot acceptance.

## BBS Smart Card Phase 10B-4 Template Preview & Print Readiness (2026-09-01)

Phase 10B-4 is deployed behind the Admin-only Production gate. Personal/Department card workflows share a responsive composite preview with cut/safe boundaries and readiness checks for dimensions, background aspect ratio/DPI/type, QR placement/availability and text/Master scope. Blocked output cannot be confirmed; warnings remain visible for Admin review. Existing private reads, authorization, issue/replace popup safety and QR lifecycle are unchanged.

## BBS Smart Card Phase 10C-3 runtime resilience (2026-08-31)

Runtime resilience is complete and deployed to Production behind the existing Admin-only staged gate. Seven BBS data areas fail and retry independently, retain only confirmed stale data with an explicit warning and avoid misleading zero states. Critical write controls prevent repeat activation while pending and provide accessible progress feedback without replacing server-side idempotency or concurrency controls. Local regression and simulated disconnect/retry checks pass; Production normal-login Chrome UAT passes all 8 tabs at three phone orientations with zero console errors. No API, schema, business configuration or upload path changed. Phase 10C-0B Pilot data remains user-owned; next work is real Pilot configuration and multi-role acceptance before ordinary-user rollout.

## BBS Smart Card Phase 10C-2 mobile/accessibility hardening (2026-08-31)

Frontend hardening is complete locally. The eight BBS workspaces now provide semantic/keyboard tab navigation, focus-preserving renders, labelled keyboard-scrollable tables, phone-safe 44 px controls, 16 px text fields, safe-area actions, focused validation recovery and accessible focus-trapped dialogs. Authenticated read-only Chrome UAT passes 320×568, 360×800, 390×844, 430×932 and 844×390 without page overflow, small touch targets, iOS zoom-risk fields or console errors; the complete Backend test suite also passes (`exit 0`). No API, schema, business configuration, upload path, Production or GitHub state changed. Phase 10C-0B Pilot business data remains user-owned; continue with the next approved 10C audit phase after review.

## BBS Smart Card Phase 10C-1 workflow reliability (2026-08-31)

Frontend reliability work is complete locally: Observation Drafts survive tab navigation and can be resumed, duplicate per-employee Draft creation is avoided, Personal Card issue/replace protects the one-time QR response from popup blocking, and every analytics output refreshes the same scoped export payload. The user elected to configure and test the missing Pilot business data separately, so Phase 10C-0B remains user-owned and no fallback data was created. Phase 10C-2 mobile/accessibility hardening is now complete locally.

## BBS Smart Card Phase 10C-0A readiness audit (2026-08-31)

The repeatable, read-only Pilot readiness audit is complete locally. `MAINTENANCE SEC.` / `Tube Cutting` resolves correctly and the Group Leader KPI rule is already 1 submitted Observation per Monday-Friday day, but readiness remains `CONFIGURATION_REQUIRED`: 0 Operators, 0 Active inspector enrollments, 0 Active assignments, 0 Active schedule rules and 0 applicable Published business Checklists. Card/Community setup also has 0 Active Personal templates, Department templates, Department QR and handlers. Phase 10C-0B must begin with business confirmation of the real Operator roster and Checklist content; no database record or UAT/Draft data was changed or deleted.

## BBS Smart Card Phase 10B-3 implementation update (2026-08-31)

Searchable Master pickers and the Department Configuration Workspace are complete locally. Admin can search/filter 41 Master Departments, inspect readiness, configure one Department at a time and search current Admin accounts for Owner/Verifier without changing the existing API. Recommended next work is Phase 10B-4 Template Preview & Print Readiness, adding a clearer pre-activation visual preview and print-safe validation while preserving private storage.

## BBS Smart Card Phase 10B-2 implementation update (2026-08-31)

Card Management information architecture and Guided Workflow are complete locally. Admin now starts from a card-type overview and opens only the Personal or Department workflow needed, with readiness-driven steps and status summaries. Existing APIs and business behavior are unchanged. Phase 10B-3 now completes the earlier searchable picker recommendation; Template Preview & Print Readiness is next.

## BBS Smart Card Phase 10B-1 implementation update (2026-08-27)

Master Data integration and read-only card readiness are complete locally. Personal Card Department and BBS Level controls now use the central Foundation contract, and Admin receives actionable reasons when mappings, eligible employees, templates, Department QR or handlers are incomplete. No schema/workflow change was introduced and Production remains on the previously deployed Phase 1-10A Admin-only build. Phase 10B-2 now supersedes the earlier next-step recommendation; Phase 10B-3 searchable Master pickers is next.

## BBS Smart Card Phase 10A implementation update (2026-08-27)

Mobile Batch Observation is complete locally for 2-50 assigned employees. Production rollout remains pending explicit approval and must include a fresh backup, the Phase 10A migration, PHP/JS hash verification, an authenticated mobile smoke, rollback-flag verification and test residue cleanup. Recommended next gate is Pilot acceptance on representative iOS/Android devices, including camera permission, low-bandwidth draft recovery and a real Unsafe item requiring evidence.

## BBS Smart Card Phase 9B implementation update (2026-08-26)

Inspector schedule configuration and compliance reporting are complete locally and not deployed. Admin can version recurring inspection days and add future Required/Exempt date overrides. Inspectors can read only their own schedule. Workspace, compliance dashboard and management analytics now share the same capped daily target. Next work is business acceptance of schedule rules and Pilot dates, followed by a separately approved controlled Production rollout.

## BBS Smart Card Phase 9 implementation update (2026-08-26)

Inspector enrollment and team management are complete locally and not deployed. Admin can appoint Group Leaders and manage teams; appointed leaders can manage only their own team when enabled. Formal Observation/KPI now require effective enrollment, and one Operator has one primary inspector. Next work is business acceptance with the Pilot roster and a separately approved controlled Production rollout after backup and migration rehearsal.


## BBS Smart Card Phase 8 implementation update (2026-08-26)

Department-card templates, one shared Department QR, Community Good/Risky reporting and the Admin-only Risk action dashboard are complete locally with Node/PHP parity. Community reports are available to all authenticated employees, allow an unknown observed person and remain outside formal KPI. Production remains unchanged. Next work is business acceptance of the card artwork/QR placement and privacy labels, configuration of one Admin owner/verifier per participating Department, and the separately approved Phase 1-8 controlled rollout.

## BBS Smart Card Phase 7 implementation update (2026-08-25)

Local security hardening and controlled-rollout preparation are complete and not deployed. Node/PHP security headers, QR claim object parity, security/runtime contracts, responsive/accessibility Chrome UAT and read-only Pilot reconciliation pass. The approved `MAINTENANCE SEC.` / `Tube Cutting` scope is valid, but Pilot activation is gated by its current 0 Active Assignments, 0 Published Checklists and 0 Operators. Next actions require business-owner roster confirmation, hierarchy assignment, Checklist publication and Pilot acceptance; Production rollout remains blocked until explicit deployment approval, fresh verified backups and the runbook gates in `DEPLOYMENT.md`.

## BBS Smart Card Phase 6 implementation update (2026-08-25)

Phase 6 is complete locally and not deployed. Permission-scoped Personal/Team/Department/Company analytics, consistent KPI calculation, trends, Pareto, comparison heatmap, action aging, drill-down and same-scope Excel/PDF/Print are implemented with Node/PHP parity. Local reconciliation, privacy, performance and browser UAT passed. Phase 7 security hardening, Maintenance / Tube Cutting pilot validation and controlled Production rollout are next after explicit approval.

## BBS Smart Card Phase 5 implementation update (2026-08-25)

Phase 5 is complete locally and not deployed. Corrective Action creation, Owner/Verifier workflow, SLA, secure Before/After evidence, reminder and overdue escalation outbox, verification, closure and reopen are implemented with Node/PHP parity. Email delivery remains disabled by default. Phase 6 analytics and management reporting is next after user review.

## BBS Smart Card Phase 4 implementation update (2026-08-25)

Phase 4 is complete locally and not deployed. Secure private templates,
one-time opaque QR issue, scoped claim without impersonation, replacement,
revocation, CR80/A4 printing, print audit, and public resolve rate limiting are
implemented with Node/PHP parity. Local migration and rollback, Phase 3
regression, lifecycle cleanup `0`, and responsive/pre-login QR browser UAT
pass. Phase 5 Corrective Action ownership, SLA, escalation, and closure is next.

## BBS Smart Card Phase 3 implementation update (2026-08-25)

Phase 3 is complete locally and not deployed. My Workspace, eligible scope,
immutable Checklist-backed Observation Draft/Submit, Safe/Unsafe/N/A, private
evidence, scoped history, and basic KPI are implemented with Node/PHP parity.
Phase 4 secure Smart Card/QR and print lifecycle is next; QR remains an opaque
navigation token and must never authenticate as another employee.

## BBS Smart Card Phase 2B implementation update (2026-08-25)

Phase 2B is complete locally and not deployed. Checklist Builder supports
five-sheet Excel export, client parsing, server-side validation Preview, and
confirmed atomic Draft replacement with Node/PHP parity, Master validation,
optimistic concurrency, immutable-version guards, and audit. No schema or
upload-storage change was required. Phase 3 My Workspace and the core
Observation MVP remains next; the main BBS navigation remains hidden.

## BBS Smart Card Phase 2 implementation update (2026-08-25)

Phase 2 is complete locally and not deployed. Checklist templates, immutable
versions, categories, items, scoped mappings, lifecycle/audit, conflict-safe
resolver, Admin Builder, and Resolver Preview are implemented with Node/PHP
parity. Local migration and rollback, lifecycle UAT, cleanup `0`, browser UAT,
preflight `104/104`, and full regression pass. Import/Export remains the
optional Phase 2B follow-up. Phase 3 My Workspace and core Observation MVP is
next; the main BBS menu remains hidden until that phase is usable.

## BBS Smart Card Phase 1 implementation update (2026-08-25)

Phase 1 is complete locally and not deployed. Six additive configuration
tables, Node/PHP API parity, deny-by-default scope resolution, Admin System
Console configuration, audit logging, the weekday KPI, and the
Maintenance/Tube Cutting pilot are implemented. Migration/rollback,
authenticated runtime parity, browser UAT, full backend tests, and preflight
`102/102` pass. The main menu remains hidden. Phase 2 immutable Checklist
Builder is next after review. This status supersedes the older Phase 0 wording
below that says implementation had not started.

## BBS Smart Card (Phase 0 approved; Phase 1 ready — 2026-08-25)

- Phase 0 read-only discovery/design is complete locally. The audit found
  2,492 employees, 41 Departments, 26 Safety Units, and 23 Positions. Position
  coverage is strong, but Unit is blank for 2,125 employees, Team is blank for
  2,491 employees, and the current schema has no general reporting-line,
  employee-status/leave, or profile-photo source. Phase 1 therefore requires
  an Admin-reviewed BBS level mapping and effective-dated hierarchy rather
  than deriving access from Role, Team, or position text.
- The proposed ERD, permission model, API/UI flows, checklist resolver, QR
  threat model, KPI formulas, migration strategy, risks, and approval gates are
  documented in `docs/bbs-smart-card-phase0-discovery-design.md`. Phase 0 and
  the Phase 1 foundation direction are approved; implementation has not started
  and still requires an explicit start request.
- Approved Phase 1 baseline: Group Leader observes Operators inside the assigned
  Unit and must submit at least one observation each Monday–Friday in
  `Asia/Bangkok`; Operator history is limited to observations involving self,
  Department-level personal/Unsafe detail is limited to the user's Department,
  and Admin access is global/auditable. Pilot is `MAINTENANCE SEC.` /
  `Tube Cutting`, resolved from Master Data IDs.
- Proposed as a new SPA module at route `#bbs-smart-card`, positioned directly
  below Safety Culture and above Contractor / Supplier in the main navigation.
- Recommended sequence: Phase 0 discovery/design; Phase 1 hierarchy and
  permission foundation; Phase 2 immutable Checklist Builder; Phase 3 My
  Workspace and core observation MVP; Phase 4 secure QR/card lifecycle; Phase
  5 Actions/notifications; Phase 6 analytics/reports; Phase 7 security, pilot,
  and Production rollout.
- The navigation remains hidden until the Phase 3 workspace is usable. The
  design reuses `Employees`, Department/Safety Unit masters, JWT, audit,
  uploads, and Node/PHP compatibility patterns; it does not introduce new
  global roles or use QR as authentication.
- Detailed prompt and phased plan:
  `docs/bbs-smart-card-development-prompt.md` and
  `docs/bbs-smart-card-development-plan.md`.
- No BBS application, API, database, permission, upload-storage, or Production
  change has been implemented yet. Unsafe/action/card/QR decisions remain gates
  for Phases 2, 4, and 5 respectively.

## Card Image Export Improvement (Phases 0-2D deployed, 2026-08-20)

Phase 0 established a read-only desktop/mobile Production baseline for the
right-click card image feature across 12 modules. It captured 24 representative
PNGs, inventoried 174 visible desktop and 199 visible mobile export targets,
and confirmed the largest quality risks in Machine Safety, Accident, Yokoten,
4M, and Safety Culture. No application behavior, API, database, upload storage,
or business data changed, and nothing from this phase was deployed.

Evidence:

- `docs/card-image-export-phase0-audit.md`
- `backups/local/card-image-baseline-20260820T043416Z/`
- `backups/local/card-image-baseline-mobile-20260820T043646Z/`

Phase 1 is complete locally. The shared utility and browser fixture form the
safety foundation; after Phase 2B the fixture passes 19/19 and confirms the
approved eight-module runtime import allowlist. Every migrated module retains its
legacy fallback; Phase 1 was not deployed. See
`docs/card-image-export-phase1-foundation.md`.

Phase 2A is complete locally. Dashboard hero and Accident performance board are
wired behind per-module feature flags with legacy fallback. Controlled
desktop/mobile comparison passed 4/4 shared captures, 0 fallbacks, 0 runtime
errors, and consistent output dimensions. Visual review confirmed the Accident
rate descriptions no longer clip. No flag is enabled by default and Phase 2A
was not deployed. See `docs/card-image-export-phase2a-pilot.md`.

Phase 2B is complete locally for Machine Safety document list, Yokoten topic
cards, 4M change overview, and Safety Culture campaign library. Controlled UAT
passed 8 comparisons / 16 PNGs, 8 shared captures, 0 fallbacks, 4/4
viewport-consistent layouts, and 0 runtime errors. Machine Safety uses an
off-screen list export on mobile; 4M and Safety Culture render current form
values as clone-only static text. See
`docs/card-image-export-phase2b-rollout.md`.

Phase 2C is deployed. The six approved module flags are enabled by default with
an explicit override for emergency rollback. Production verification passed
FTP SHA-256 10/10, HTTPS hashes 9/9, shared captures 12/12, fallbacks 0,
viewport-consistent layouts 6/6, and runtime errors 0. See
`docs/card-image-export-phase2c-production.md`.

Phase 2D batch 1 covers the OJT/SCW hero only. Foundation
tests pass 19/19; desktop/mobile comparison
passed 2/2 shared captures, 0 fallbacks, 1/1 consistent layout, and 0 runtime
errors. Hiyari was removed from the batch after visual review exposed
non-deterministic mobile clone clipping, so it remains fully legacy. See
`docs/card-image-export-phase2d-pilot.md`.

Phase 2D batch 2 covers the Safety Training hero only.
Foundation tests pass 19/19 with 8/8 approved runtime imports;
desktop/mobile comparison passed 2/2 shared captures, 0 fallbacks, 1/1
consistent layout, and 0 runtime errors. Training Matrix and all other Training
targets remain legacy.

Phase 2D is deployed after a fresh 147-table database + 776-file uploads backup.
Final Production UAT passed 16/16 shared captures, 0 fallbacks, 8/8 consistent
layouts, and 0 runtime errors. The next step is normal-use monitoring. Hiyari
still needs a purpose-built static export surrogate before reconsideration.

## Current Known Remaining Work

## Remaining PHP API Migration Inventory (after Phase 6)

## Recommended Next Phases

## Post-Migration Improvement Plan (after Phase 9)

Current focus after the completed PHP migration:

- Phase A: documentation/status cleanup. `CLAUDE.md` must state that Phases 0-9 are complete and must not retain stale "after Phase 6" unported-module roadmaps.
- Phase B: restore and polish Dashboard `Department x Module Compliance`. PHP `/api/dashboard/overview` now needs to return `complianceMatrix` data instead of an empty array so the existing dashboard section is visible again.
- Phase C: improve Person Search / Employee Safety 360 UX with Thai + English labels for search, profile, safety signals, empty states, and timeline surfaces.
- Phase D: shared-hosting security hardening review for config access, upload execution blocking, JSON fallback, and Admin/User/Viewer permissions.
- Phase E: backup/restore runbook for production MySQL plus root `uploads/`. Completed in `docs/backup-restore-runbook.md`.
- Phase F: monitoring and error-review checklist. Completed in `docs/monitoring-error-review-checklist.md`.
- Phase G: email notification delivery. Direct PHP SMTP is approved and implemented for shared hosting; outbox retry endpoints must send real email and update `Sent`/`Failed` status.
- Phase H: business-user UAT checklist, deferred until the above cleanup and UX work are complete.

- Patrol next recommended sequence from current handoff history: Phase Patrol-4 Admin On-Behalf Schedule/Quota View, Phase Patrol-5 Summary Detail Modal, then Phase Patrol-6 UI Integration where still applicable.
- Clear the permission-audit debt for `PUT /api/profile/safety-unit` so `npm --prefix backend test` can be fully green again.
- Continue module restyle work only when explicitly requested and keep existing frontend patterns.

## Technical Debt

- Permission audit still has known classification debt around `PUT /api/profile/safety-unit`.
- Some modules retain legacy tables/routes for compatibility; avoid removing them without a migration plan.
- PHP production and Node dev parity must remain explicit for shared endpoints.
- Mixed historical encoding risk requires mojibake scans after every text-heavy edit.

## Production Safety Improvements

- Keep backup IDs, SHA-256 verification folders, smoke markers, and cleanup counts in `CHANGELOG.md`.
- Expand smoke helper cleanup checks to include both HTTP and FTP/listing verification where feasible.
- Prefer read-only production smoke tests unless write-path validation is essential.
- Document every schema/data migration with matching production verification.

## Refactor Opportunities

- Split module-specific architecture notes into `docs/modules/` once the top-level split is stable.
- Consolidate duplicated PHP/Node compatibility notes into route-level checklists.
- Add a concise API inventory by module after the current production documentation split settles.
- Keep UI/filter abstractions conservative; follow existing module patterns unless duplication becomes a real maintenance risk.

## Safety Patrol Check-in v2

- Local phases 1–8: complete on 2026-09-02.
- Phase 9 dev-only deployment: complete with fresh backup, additive migration, SHA-256 verification, flag enablement, authenticated smoke, zero-residue cleanup, and rollback evidence.
- The Patrol-only source is included in its dedicated GitHub release commit. Production rollout remains out of scope.
