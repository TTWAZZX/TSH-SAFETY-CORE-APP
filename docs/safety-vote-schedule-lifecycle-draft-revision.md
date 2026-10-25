# Safety Vote Schedule Lifecycle and Draft Revision Visibility

Date: 2026-10-25
Scope: Local only

## Outcome

Past-due Open campaigns are now reconciled to Closed by the authenticated Safety Vote request guard in both Node and PHP. Reconciliation uses the current version CloseAt with the campaign ScheduledCloseAt fallback, locks due rows, updates only rows still in Open state and records one `SAFETY_VOTE_SCHEDULE_CLOSE` audit by `SYSTEM_SCHEDULE`. Repeated requests are idempotent.

Participant ballot, answer-file, submission and nomination mutations require the authoritative voting window to remain open. A stale stored Open value can no longer permit late participation.

Admin campaign discovery now projects the newest offline Draft revision without making it the current version. The Admin UI displays `มี Draft Vn รอแก้ไข`; User discovery continues to expose only the current published lifecycle version. Activation remains governed by the existing exact-confirmation, readiness and fresh-freeze workflow.

## Local reconciliation evidence

Campaign `SHE-003-2026` had passed its configured close time while its stored state remained Open. The first authenticated request after the repair changed only the due lifecycle state:

- Campaign state: `Open` to `Closed`
- Current V1 state: `Frozen` to `Closed`
- `ClosedAt`: recorded once
- Offline V2 Draft: retained
- Ballots: unchanged at 0
- Audit: one `SAFETY_VOTE_SCHEDULE_CLOSE` event by `SYSTEM_SCHEDULE`

## Verification

- Live Local Admin/User API and pending Draft V2 projection: PASS
- Repeated reconciliation and single-audit assertion: PASS
- Node/PHP full lifecycle through certified Excel/PDF: PASS
- Node/PHP Phase 3 ballot, submission and nomination API UAT: PASS
- Node/PHP Phase 5 schedule, operations, privacy, audit and report UAT: PASS
- Authenticated desktop/390 px Browser UAT for Phase 3 and Phase 5: PASS
- Admin Draft/static, public discovery, bootstrap and Local runtime contracts: PASS
- PHP 7.4 static compatibility across 144 PHP files: PASS

The Local PHP fixture explicitly loads its available Zip extension for report parity; no machine or Production PHP configuration was changed.

No Production connection, deployment, commit or push occurred.

Decision: `PASS_LOCAL_SAFETY_VOTE_SCHEDULE_AND_REVISION_VISIBILITY`\n