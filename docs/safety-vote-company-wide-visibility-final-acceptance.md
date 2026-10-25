# Safety Vote Company-wide Campaign Visibility Final Acceptance

Date: 2026-10-25
Environment: loopback Local UAT and disposable databases only
Decision: `PASS_LOCAL_COMPANY_WIDE_VISIBILITY_FINAL_ACCEPTANCE_READY_FOR_CONTROLLED_PRODUCTION_PREFLIGHT`

## Accepted contract

- Every authenticated employee can discover every non-hidden, non-test campaign in `Scheduled`, `Open`, `Closed`, `Certified` or `Published` lifecycle state.
- Catalogue and detail visibility never grants participation. Ballot, answer-file, submission, gallery, nomination and jury mutations remain governed by campaign state, authoritative time window, frozen eligibility, ownership and individual assignment.
- An employee without participation permission receives a read-only detail; the server does not disclose questions or personal responses that would cross the participation boundary.
- Closed and published campaigns remain in the company catalogue. Official results are served only from an immutable result snapshot and exclude voter identity and raw ballots.
- Zero participation produces explicit `no_result` output with no manufactured winner. The User detail displays `สิ้นสุดกิจกรรม · ไม่มีคะแนน`.
- Legacy campaign remediation is dry-run first, permission-gated, hash-confirmed, idempotent, RowVersion-protected, audited and conflict-safe to roll back without deleting evidence.

## Final verification matrix

| Area | Acceptance evidence | Result |
| --- | --- | --- |
| Visibility contract | Company-wide default, lifecycle inclusion, hidden/test/Draft/Voided exclusion and read-only detail contract | PASS |
| Participation authorization | Shared Node/PHP contract across 15 governed actions and 15 parity fixtures | PASS |
| Campaign-type APIs | Survey, encrypted answers, submission, gallery, nomination, jury, Popular Vote and Secret Election Node/PHP disposable UAT | PASS |
| Permission matrix | Anonymous catalogue/result `401`, authenticated catalogue/detail/result `200`, ordinary-user Admin boundary `403`, closed mutation `409` | PASS |
| Immutable results | Published snapshot returned with SHA-256, identity fields excluded and zero-vote `noResult=true` | PASS |
| Remediation | Zero remaining candidates; one applied batch/item/audit retained; Voided campaigns excluded | PASS |
| Evidence integrity | Eligibility, participation, ballot, jury, result, certification and report counts preserved; all result hashes/states valid | PASS |
| Migrations/rollback | Company visibility and remediation migrations additive, idempotent, activation-preserving and data-preserving on rollback | PASS |
| Responsive UX | 390x844, 768x1024 and 1366x768; immutable no-result view, 44 px controls, no horizontal overflow and no Safety Vote 5xx | PASS |
| PHP Production compatibility | Changed PHP files lint clean; project-wide PHP 7.4 static compatibility across 149 files | PASS |
| External isolation | Loopback database/API only; external adapter and notification delivery unconfigured | PASS |

## Local final state

- Campaigns: 4 total; 1 company-visible Published campaign; 3 excluded Voided campaigns; 0 remediation candidates.
- `SHE-003-2026`: stored as `public_listing`, campaign status `Published`, current result snapshot 2 status `Published`.
- Protected evidence: 3 eligibility snapshots, 7,633 eligible-voter rows, 0 participation/ballot/answer rows, 0 jury assignment/score rows, 2 result snapshots, 10 result rows, 1 certification and 1 report.
- Remediation evidence: 1 applied batch, 1 applied item and 1 matching audit.

## Repeatable command

```text
npm run verify:safety-vote-company-visibility-final
```

Additional acceptance runs covered the full participation authorization suite, disposable Node/PHP Company Catalogue API UAT and final responsive Browser UAT.

Evidence:

- `backups/local/safety-vote-company-catalogue-1792912909805/` — disposable positive official-result/catalogue Browser UAT.
- `backups/local/safety-vote-close-finalization-browser-1792913057793/` — final Local Published immutable zero-result Browser UAT.

## Production-readiness boundary

The implementation is a Production-ready candidate and may proceed to a separately authorized, read-only Production preflight. This decision does not authorize connecting to Production, applying migrations, uploading runtime files, changing settings, deploying, committing or pushing. Production deployment still requires an immutable candidate, remote drift comparison, protected backup/restore evidence, exact allowlist, rollback package and explicit user approval.\n