# TSH Safety Core Activity - Roadmap

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
