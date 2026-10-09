# Safety Vote Phase 10.2 — Question/Option Card Builder

Status: `PASS_LOCAL_UAT_NO_DEPLOY_NO_PUSH`
Date: 2026-10-09

## Outcome

The campaign wizard content step now uses question and option cards instead of a line-based option textarea. Admins can add and remove cards, move questions and options up or down, edit option descriptions, preview the participant-facing result, and import bounded line-based data in either append or replace mode.

Option images use the existing private Safety Vote file lifecycle. The browser accepts JPG, PNG and WebP up to 10 MB, persists the returned `fileId` in the existing Node/PHP builder contract, retrieves the image through the authorized private-file endpoint, and renders it through a temporary blob URL. Replacing, removing, bulk-replacing, or deleting an option attempts to remove the prior private file with an auditable reason. A failed replacement compensates by removing the newly uploaded file.

Question and file mutations remain Draft-only. Phase 10.2 does not add video because the current private-file allowlist and delivery contract do not support a production-safe video lifecycle.

## Verification

- Phase 10.2 static contract passes for card controls, bounded bulk import, private-image constraints, ordering, preview, Draft-only mutation and `fileId` payload preservation.
- Existing Phase 10.1 and UX Phase 2 static contracts pass.
- Node/PHP guarded disposable API regression passes with option descriptions and three private option-image references preserved by both runtimes.
- Guarded Chrome UAT passes Admin/User/Juror across 390×844, 430×932, 768×1024, 1366×768 and 1920×1080.
- Browser mutation ledger: five unique automatically coded/opened campaigns, five questions, 20 ordered options, 15 descriptions, five private option images, five frozen eligibility snapshots and zero ballot/jury/certification/result rows.
- Uploaded fixture images and disposable databases are removed with zero residue.

Accepted browser evidence: `backups/local/safety-vote-ux-phase2-1791533735767/`; result SHA-256 `86b18662463b44f749a2f62275deb851a6e37a7255f6d0dc5bd52627c660c079`.

No Production connection, deployment, commit, migration or push occurred.
