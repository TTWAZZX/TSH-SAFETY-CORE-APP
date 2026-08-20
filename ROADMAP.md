# TSH Safety Core Activity - Roadmap

## Card Image Export Improvement (Phases 0-2C deployed, 2026-08-20)

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
approved six-module runtime import allowlist. Every migrated module retains its
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

The next correct step is Phase 2D: continue lower-risk targets in small batches
under the same exact allowlist, fallback, comparison, and visual-review gates.

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
