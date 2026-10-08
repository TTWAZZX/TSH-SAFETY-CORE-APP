# Safety Vote Phase 0 — Permission, Privacy and Test Plan

Contract: `2026-10-08-safety-vote-phase0-r1`

Status: design only. No test in this plan was executed in Phase 0 because runtime and schema do not yet exist.

## 1. Security objectives

1. Only authenticated, eligible users can participate.
2. One concurrent/replayed request cannot create unintended additional participation or ballots.
3. Admin can operate campaigns but cannot rewrite accepted ballots.
4. Secret Ballot has no application-level Employee-to-choice mapping.
5. Results cannot be disclosed before their configured visibility point.
6. Private files and exports cannot bypass campaign authorization.
7. Node and PHP enforce the same rules.
8. Missing schema/configuration fails closed.
9. Audit proves administrative actions without recording protected ballot content.
10. Safety Vote does not mutate System Console Master Data or unrelated business modules.

## 2. Trust and threat model

### Protected assets

- campaign rules and frozen versions;
- eligibility lists and organization snapshots;
- participation status;
- ballot answers;
- private candidate/submission media;
- Jury draft and submitted scores;
- result snapshots and certifications;
- audit and certified reports.

### Actors

- unauthenticated visitor;
- authenticated ineligible user;
- eligible voter;
- candidate/submitter;
- juror;
- Campaign Manager;
- application Admin;
- result certifier/auditor;
- database/server operator outside the application-role model.

### Explicit privacy boundary

Phase 6 Secret Ballot protects against ordinary application users and application Admins by never creating an application mapping from Employee to ballot choices. It does not automatically guarantee cryptographic anonymity against a database/server operator who can observe transactions, timestamps, logs or runtime memory. Before a legally sensitive election, Phase 6 must document whether organizational controls are sufficient or whether independent ballot service, batching/mixing, encryption key separation or external review is required.

### Principal threats and controls

| Threat | Required control |
| --- | --- |
| Vote without eligibility | Frozen snapshot lookup inside write transaction |
| Duplicate/double click | Idempotency hash plus database uniqueness |
| Concurrent submit | Transaction/locking and unique current participation |
| Client changes score/status | Server-derived state and scoring |
| Admin edits ballot | No update/delete ballot API; immutable storage policy |
| Early result inference | Visibility checks on API, export and dashboard; Secret has no live result |
| Voter-choice correlation | Separate participation/ballot; no shared ID/log metadata |
| Small-group inference | Privacy threshold and prohibited Secret choice-by-scope analytics |
| File disclosure | Private storage, signature validation, authorized file endpoint |
| Formula/config change | Frozen Campaign Version and config hash |
| Result tampering | input/result hashes, reconciliation and certification hash |
| Reminder reveals choices | notification uses participation only |
| Arbitrary eligibility SQL | allowlisted rule DSL |
| Master-data ambiguity | normalized resolution and fail-closed preflight |
| Runtime schema mutation | explicit migration only; `503` when absent |

## 3. Permission expectations

| Actor | Discover | Vote | Configure | Eligibility | Jury | Unpublished result | Certify | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unauthenticated | No | No | No | No | No | No | No | No |
| Ineligible authenticated | Public listing only | No | No | No | Assignment only | No | No | No |
| Eligible User | Eligible campaigns | Yes, by policy | No | Self status only | Assignment only | Campaign policy | No | No |
| Campaign Manager | Scoped campaigns | Only if independently eligible | Scoped | With permission | No implicit score | With permission | No implicit certify | Bounded timeline |
| Jury | Assigned campaign | Only if independently eligible | No | No | Own assignment | Reveal policy only | No | Own actions |
| Certifier | Assigned campaign | Only if independently eligible | No | No | No | Frozen result | Assigned decision | Certification evidence |
| Admin | All operational views | Only if independently eligible | Yes | Yes | Only if assigned | Yes | Only if assigned/configured | Yes |

An Admin role never implies eligibility to vote, Jury assignment or an ability to see Secret choices.

## 4. Test layers

### Static contract tests

- all enums match Node/PHP/shared fixture;
- all mutation routes are classified by permission audit;
- no Runtime `CREATE TABLE`, `ALTER TABLE` or migration call exists in Safety Vote handlers;
- no public web path points to private uploads;
- no Secret audit metadata includes ballot/correlation fields;
- frontend does not calculate authoritative totals or eligibility;
- contract/cache markers are present when a phase changes frontend/runtime.

### Pure rule tests

- lifecycle transition table;
- rule DSL normalization and resolution;
- question/answer validation per type;
- selection limits and conditional questions;
- scoring, weights, ranking, ties, quorum and seats;
- privacy threshold suppression;
- canonical hash generation;
- Node/PHP fixture parity.

### API permission tests

- unauthenticated `401` on all endpoints;
- User `403` on Admin routes;
- ineligible user cannot see a private campaign or submit;
- eligible user cannot access another user's receipt/draft/submission;
- Campaign Manager scope cannot cross Campaign ID;
- Juror cannot read another juror's Draft;
- result/export/audit/certify permissions are independent;
- Admin cannot use a hidden/internal parameter to bypass lifecycle;
- private file IDs do not bypass parent-resource permission.

### Database lifecycle tests

Each runtime uses a separately guarded disposable database:

1. apply additive migration twice;
2. seed synthetic Master employees/organization;
3. create Draft and frozen version;
4. preview/freeze eligibility;
5. open and submit valid/invalid/concurrent ballots;
6. close, calculate, reconcile and publish where in phase scope;
7. archive/void scenarios;
8. verify expected audit;
9. verify zero mutation in seeded non-SafetyVote sentinel tables;
10. remove all fixtures and drop the disposable database;
11. prove zero disposable-database residue.

### Browser UAT

Authenticated Admin and User sessions at minimum:

- desktop 1366×768;
- phone 390×844;
- no page-level horizontal overflow;
- primary touch targets at least 44 px;
- keyboard-only ballot flow;
- focus restoration and modal/dialog semantics;
- screen-readable labels and error summary;
- Admin builder/preview/preflight;
- User eligible/ineligible/submitted states;
- no failed API/console error;
- cleanup leaves zero synthetic campaign/ballot/file residue.

## 5. Phase acceptance matrix

### Phase 1 — Foundation

Required evidence:

- migration and data-preserving rollback review;
- migration runs twice on disposable Node/PHP databases;
- missing schema returns `503 SAFETY_VOTE_SCHEMA_NOT_READY` without attempting DDL;
- Admin Draft CRUD parity;
- User forbidden from Admin mutation;
- System Console Master Data remains unchanged;
- ambiguous Department/Unit resolution blocks preflight;
- private upload validation and unauthorized file denial;
- audit excludes secrets/content;
- menu remains hidden or feature-disabled.

### Phase 2 — Activity Vote MVP

- one and multiple choice parity;
- frozen eligibility and snapshot hash;
- eligible vs ineligible paths;
- simultaneous submit and idempotent replay;
- selection min/max and closed/paused rejection;
- no accepted-ballot update/delete route;
- dashboard/result/export source reconciliation;
- image signature, size, private delivery and cleanup;
- desktop/mobile authenticated browser UAT;
- first pilot can complete Draft -> Open -> Closed -> Published locally.

### Phase 3 — Survey/Nomination/Submission

- every question type and conditional branch;
- anonymous answer rows have no identity mapping;
- nomination consent/review/status transitions;
- submission ownership and reviewer permission;
- free-text/export privacy classification;
- file ownership and rejection cleanup;
- finalist selection audit.

### Phase 4 — Jury/Multi-stage

- weights and deterministic Node/PHP scoring;
- no pre-submit cross-juror visibility;
- recusal and conflict paths;
- submitted score immutable until audited reopen;
- hybrid formula, ranking, allocation, Top N, tie and quorum fixtures;
- stage advancement cannot bypass requirements;
- historical formula/version remains stable.

### Phase 5 — Operations/Reports

- server-side privacy suppression in dashboard and export;
- no Secret choice-by-organization endpoint;
- scheduled open/close respects Asia/Bangkok and server time;
- notification recipient preview, suppression and retry;
- notification contains no protected answers;
- frozen result/report hash verification;
- SheetJS/PDF output matches result snapshot;
- system health is read-only and fail-closed.

### Phase 6 — Secret Election

Mandatory release blockers:

- no Employee/Participation/session/IP/User-Agent field in ballot/answer records;
- zero `SafetyVote_BallotIdentities` rows for Secret/Anonymous;
- audit and application logs contain no ballot correlation value;
- receipt cannot retrieve selections;
- no result before close/certification;
- voter list exposes participation only;
- accepted ballots reconcile with participation without creating a mapping;
- concurrent submissions, replay and connection failure are atomic;
- multiple positions, seat limits and abstain pass;
- tie/void/recount/certification processes pass;
- at least two configured certifiers when policy requires dual control;
- load test does not lose or duplicate ballots;
- timestamp/side-channel review completed;
- independent privacy/security review completed;
- HR/Legal/business-owner acceptance recorded before real election use.

### Phase 7 — Integrations

- every adapter is read-only unless an explicit confirmed handoff is invoked;
- source record access respects its original permission;
- deleted/changed source does not rewrite frozen candidate snapshot;
- no automatic mutation in Committee/Hiyari/KY/BBS/Patrol/Training/Policy;
- Johnny guidance cannot vote, certify or disclose hidden results.

### Phase 8 — Release gate

- all earlier regressions green;
- PHP target-version lint and capabilities;
- clean immutable scoped commit/manifest;
- no unrelated dirty file included;
- Production value-suppressed configuration check;
- exact remote drift inventory;
- verified narrow Safety Vote table/file backup;
- download-back hashes;
- rollback rehearsal/plan;
- anonymous endpoints remain denied and authenticated smoke is non-mutating unless a separately approved synthetic pilot is used;
- separate explicit Production deployment authorization.

## 6. Reconciliation assertions

For each result snapshot the server records and tests:

- `eligibleCount >= participationCount` unless documented post-freeze exceptions explain otherwise;
- submitted participation count equals accepted-voter count;
- accepted ballot count follows the edit/revote policy;
- every answer references a question/option/candidate in the same frozen Campaign Version;
- question selection constraints hold for every accepted ballot;
- option raw counts equal aggregation from accepted answers;
- score/rank rows equal deterministic recalculation;
- result input hash changes if any accepted ballot/config input changes;
- certifications bind the exact result hash;
- certified/public report SHA-256 matches its stored artifact.

Reconciliation failure blocks certification and publication.

## 7. Test data and cleanup rules

- Use synthetic Employee IDs and content only.
- Never copy Production voter lists, ballots, files or credentials.
- Every test run uses a unique marker.
- Guard the database name before create/drop.
- Record before/after fingerprints for unrelated sentinel tables.
- Remove temporary private files and verify zero residue.
- Test outputs must not contain passwords, JWTs, raw idempotency keys or ballot answers tied to identities.
- Browser screenshots for Secret Election must use synthetic candidates and may not expose a real voter list.

## 8. Phase 0 verification

Phase 0 verification is limited to documentation consistency:

- all required artifacts exist;
- contract identifiers match;
- permissions, statuses, privacy modes and phases are consistent across documents;
- no runtime/migration/source file is changed by Phase 0;
- existing unrelated worktree changes remain untouched;
- no Production/network/database activity occurs.
