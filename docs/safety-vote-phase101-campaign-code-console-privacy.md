# Safety Vote Phase 10.1 — Automatic Campaign Code, Grouped Console and Privacy Guidance

Date: 2026-10-09
Decision: `PASS_LOCAL_REVIEW_READY_NO_PRODUCTION_CHANGE`

## Delivered

- Node and PHP create APIs now allocate immutable annual campaign codes in the form `SHE-001-YYYY`. Client-supplied codes are ignored during creation, existing codes remain unique, allocation retries boundedly on a concurrent collision, and the range fails closed after `999`.
- Updates preserve the generated code and reject a changed value with `CAMPAIGN_CODE_IMMUTABLE`. Voided campaigns retain their code, so a used sequence is not recycled.
- The campaign wizard displays a read-only `SHE-001-YYYY` preview, replaces it with the server-returned code after first save, and no longer asks an Admin to invent a code.
- System Console navigation is split into four categories: Overview, Operations, People & Access, and Governance. Only the selected category's bounded sub-tabs render, while direct tab navigation and saved tab state remain supported. The obsolete Safety Vote `UX` badge was removed.
- The privacy step now explains identity storage, authorized visibility, participation separation, attachment restrictions, live-result restrictions, privacy thresholds and the lifecycle warning for identified, confidential, anonymous and secret-ballot modes.

## Verification

- Phase 10.1 static contract passed, including JavaScript syntax checks.
- Node/PHP pure contract parity passed for code formatting and existing Phase 1 behavior.
- Guarded disposable Node/PHP authenticated API lifecycle passed. Each stack produced `SHE-001-YYYY` then `SHE-002-YYYY`, rejected code mutation, and produced two distinct bounded codes under concurrent creation. All temporary campaigns and databases were cleaned up.
- Authenticated Browser UAT passed at 390×844, 430×932, 768×1024, 1366×768 and 1920×1080. It verified grouped System Console navigation, removal of the `UX` badge, read-only/server-replaced campaign code, all four privacy explanations, responsive layout, no undersized visible targets, no console/API errors, permission denial and module-disabled behavior.
- Browser evidence: `backups/local/safety-vote-ux-phase2-1791532378308/`; result SHA-256 `86b18662463b44f749a2f62275deb851a6e37a7255f6d0dc5bd52627c660c079`.
- Mutation ledger: five intended wizard campaigns opened, five questions and five frozen snapshots; ballot, participation, jury, certification and result rows remained zero. Disposable database residue was zero.
- Safety Vote UX Phase 2 and Phase 8 static contracts, Phase 8.3.1 disabled-mode Node/PHP parity, PHP syntax and `git diff --check` passed.

## Constraints

- Local loopback databases and local browsers only.
- No Production connection, deployment, migration, login, external integration, email/notification or push occurred.
- The unrelated pre-existing change in `backend/scripts/patrol-checkin-v2.test.js` was not modified.
