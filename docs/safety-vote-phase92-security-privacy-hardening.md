# Safety Vote Phase 9.2 — Security and Privacy Hardening

Date: 2026-10-09
Scope: Local only
Baseline: `077c5977283a55756bdfcfe5dfb804e32f716aa8` (`HEAD` = `origin/main`)
Contract: `2026-10-09-safety-vote-phase9.2-r1`
Decision: `PASS_LOCAL_ADVERSARIAL_RELEASE_REMAINS_HOLD`

## Outcome

Phase 9.2 closes a private-file authorization gap and establishes a consistent privacy response policy for the Node and PHP runtimes. It adds an independent black-box adversarial suite that verifies observable API behavior and database invariants rather than merely matching implementation source.

No schema, migration, ballot, eligibility, scoring, result, certification or integration contract changed.

## Findings and remediation

### 1. Cross-user private-file exposure

The shared file endpoint previously treated frozen campaign eligibility as sufficient to read every active file in that campaign. That policy is valid for campaign presentation media but was too broad for Phase 3 answer and submission attachments: another eligible user could enumerate a file ID and receive the bytes.

The endpoint now classifies files using their server-owned associations:

| File class | Allowed readers |
| --- | --- |
| Campaign media without answer/submission association | Frozen eligible user; Admin/Manage |
| Submission attachment | Original uploader; `SAFETY_VOTE_SUBMISSION_REVIEW`; Admin/Manage |
| Answer attachment | Original uploader; `SAFETY_VOTE_EXPORT`; Admin/Manage |

Denial uses `404 FILE_NOT_FOUND`, identical to a nonexistent file, so the response does not confirm whether a protected file ID exists. Invalid or injected identifiers use the same response contract in Node and PHP.

### 2. File integrity and storage confinement

Delivery already reduced `StoredName` to its basename and verified the content signature/MIME type. Phase 9.2 additionally recalculates SHA-256 and compares it with `SafetyVote_Files.ContentSha256` before sending bytes. An authorized request for modified content fails with `409 FILE_INTEGRITY_FAILED`.

### 3. Response privacy policy

Every Safety Vote response now receives:

- `Cache-Control: private, no-store, max-age=0`
- `Pragma: no-cache`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Resource-Policy: same-origin`

Node installs this policy before authentication and again in the Safety Vote router. PHP installs it before `require_user()` and reasserts it during response shutdown, preventing PHP session cache handling from replacing the intended contract on early `401` responses.

## Independent adversarial suite

`backend/scripts/safety-vote-phase92-adversarial-security.test.js` creates separate guarded loopback-only Node and PHP databases, applies the existing Phase 1–7 migrations and runs the following attacks against both HTTP runtimes:

1. unauthenticated access to a protected health endpoint;
2. ordinary-user access to an Admin endpoint;
3. cross-user read of submission and answer attachments;
4. comparison of denied and nonexistent file responses for an existence oracle;
5. malformed/numeric identifier injection;
6. stored-name traversal outside private storage;
7. submission-review privilege used against an answer attachment;
8. export privilege used for a restricted answer attachment;
9. post-storage byte tampering against SHA-256 verification;
10. missing security/privacy headers on success and error responses;
11. forbidden Employee/Participation/session/IP/User-Agent columns in ballot and answer tables;
12. unintended ballot, participation or identity-mapping mutation.

All synthetic private files and both databases are removed after each run. Test output contains no password, token, raw idempotency key, ballot choice or identity-to-choice mapping.

## Verification

| Gate | Result |
| --- | --- |
| JavaScript syntax: route, server, fixture and adversarial suite | PASS |
| PHP lint: Safety Vote handler and API entry | PASS |
| `test:safety-vote-phase92-adversarial` | PASS — Node/PHP black-box attacks, zero residue |
| Phase 1/2 guarded Node/PHP API and Browser lifecycle | PASS |
| Phase 3 guarded Node/PHP API and Browser lifecycle | PASS |
| Phase 4 guarded Node/PHP API and Browser lifecycle | PASS |
| Phase 5 guarded Node/PHP API and Browser lifecycle | PASS |
| Phase 6 20-voter concurrency/separation/recount/certification lifecycle | PASS |
| Phase 7 integration/governance lifecycle | PASS |
| Phase 8.3.1 disabled-mode Node/PHP parity | PASS |
| Phase 9.1 populated Jury Progress Node/PHP regression | PASS |
| `git diff --check` | PASS (line-ending notices only) |

Accepted evidence: `backups/local/safety-vote-phase92-1791512062212/`
Result SHA-256: `2950794fc625b95424c1682eed1746b6bb22a957269f0827f95174dd333deeaf`

Additional authenticated regression evidence created during this run:

- `backups/local/safety-vote-phase2-browser-1791511802418/`
- `backups/local/safety-vote-phase3-browser-1791511805081/`
- `backups/local/safety-vote-phase4-browser-1791511850970/`
- `backups/local/safety-vote-phase5-browser-1791511990968/`

## Residual risk and release state

The application continues to enforce separation against ordinary application users and application Admin workflows. It does not claim cryptographic anonymity against a database/server operator capable of observing transaction timing, runtime memory or infrastructure logs. A legally sensitive election still requires an explicit decision on organizational controls versus an independent ballot service, batching/mixing or separated encryption keys.

No Production system, external adapter or real voter data was accessed. No deploy, commit or push occurred. The release remains `HOLD` because the current Phase 8/9 working tree is not an immutable committed release source and no Production authorization was requested.
