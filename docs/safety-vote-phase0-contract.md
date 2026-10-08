# Safety Vote Phase 0 — Product and Architecture Contract

Contract date: 2026-10-08 (Asia/Bangkok)

Contract ID: `2026-10-08-safety-vote-phase0-r1`

Status: **PHASE_0_COMPLETE — DESIGN ONLY — HOLD_FOR_PHASE_1_AUTHORIZATION**

## 1. Scope and non-scope

Safety Vote is the authenticated Vote, Survey and Engagement platform for TSH Safety Core. It must support reusable campaigns rather than a separate hard-coded page for every activity.

The supported product families are:

- Popular Vote and media contests.
- Secret Election, including multi-position elections.
- Survey, Poll, Feedback and Knowledge Check.
- Nomination, Safety Award and Recognition.
- Submission and Safety Idea Challenge.
- Jury scoring and hybrid Jury/Popular scoring.
- Ranking, Prioritization, Allocation and Token voting.
- Approval, Resolution, Petition and Endorsement.
- Event/date/topic selection.
- Risk perception and multi-stage campaigns.

Phase 0 is documentation only. It does not authorize or include:

- runtime source changes;
- database DDL or migration execution;
- a local or Production database connection;
- creation, modification or deletion of business data;
- server start, browser session or external network use;
- Production preflight, deployment, commit or push.

Safety Vote is not a substitute for a legally binding signature, Work Permit approval, attendance record, disciplinary decision or formal training-completion record. A future integration may hand off an explicitly certified outcome, but may not silently convert a vote into one of those records.

## 2. Locked architecture decisions

### 2.1 Authoritative master data

System Console remains the only master-data owner. Safety Vote reads, but never creates or edits, the following domains:

- `Employees.EmployeeID`, `EmployeeName`, `Department`, `Unit`, `Team`, `Position` and `Role` where available;
- `Master_Departments`;
- `Master_SafetyUnits`;
- `Master_Positions`;
- authentication/onboarding readiness through the existing authentication contract.

The current Employee model does not expose a proven universal employment-active flag. Phase 1 must therefore keep these concepts separate:

- `masterPresent`: an Employee row exists;
- `accountReady`: the user can complete the existing authenticated session/onboarding flow;
- `eligible`: the frozen campaign rule includes the employee;
- `explicitlyExcluded`: an Admin override excludes the employee with a reason.

Password presence must not be treated as employment status. If System Console later provides an authoritative active-employment field, the resolver can add it as a versioned eligibility attribute without rewriting past snapshots.

Department, Unit and Position values on `Employees` are currently name-based. Resolution to Master IDs must be case-insensitive and whitespace-normalized, and must fail closed on ambiguity. Unresolved Master matches appear in Admin preflight and may not be silently assigned to another scope.

### 2.2 Live data and immutable snapshots

- Draft and Preview read live System Console data.
- Publish creates a versioned eligibility snapshot.
- The snapshot is frozen no later than the transition to `Open`.
- Historical results always use snapshot names/IDs, even if System Console changes later.
- A post-open eligibility exception requires a reason, permission and audit event. It must not mutate the original rule definition or hide the exception.
- Once the first ballot is accepted, material changes require a new Campaign Version or a void/restart workflow.

### 2.3 Runtime boundary

- Frontend: existing Vanilla JavaScript SPA and existing UI utilities.
- Local/parity backend: Node route family under `/api/safety-vote`.
- PHP Production backend: a dedicated PHP handler with the same contract.
- Database: MySQL/InnoDB, explicit additive migrations only.
- Runtime must never create or alter Safety Vote tables. Missing schema fails closed with `503 SAFETY_VOTE_SCHEMA_NOT_READY`.
- All displayed campaign times use `Asia/Bangkok`; persisted instants must be unambiguous and Node/PHP calculations must agree.

### 2.4 Administrative authority and integrity boundary

An Admin, or an explicitly permissioned Campaign Manager, controls configuration and operations. Administrative authority includes creation, eligibility, scheduling, pause/close/void, result review, notification, export and archive.

Administrative authority does not include:

- editing an accepted ballot;
- impersonating a voter or silently voting on their behalf;
- deleting selected ballots to change an outcome;
- viewing the voter-to-choice relationship for Secret Ballot;
- changing frozen rules, questions, options, weights or eligibility without a versioned workflow;
- publishing a result that is not tied to a frozen result snapshot.

### 2.5 Files and exports

- Campaign, candidate and submission files are private storage assets.
- Files are served only by authenticated, authorization-checked endpoints with `private, no-store` behavior for sensitive content.
- Upload acceptance must check size, allowlisted MIME type and file signature/content, not extension alone.
- Normal Excel/PDF exports may use the existing SheetJS/jsPDF stack from a server-authorized data payload.
- A certified result report must be generated from an immutable result snapshot and include a report ID and SHA-256; it must not treat a live dashboard screenshot as the source of truth.

## 3. Campaign model

### 3.1 Campaign types

The initial enum is:

`popular_vote`, `secret_election`, `survey`, `poll`, `feedback`, `nomination`, `award`, `submission_challenge`, `jury_scoring`, `hybrid_scoring`, `ranking`, `prioritization`, `allocation`, `resolution`, `petition`, `event_choice`, `risk_perception`, `knowledge_check`, `multi_stage`.

Templates supply defaults only. Every persisted campaign stores its resolved versioned configuration so a later template change cannot change an existing campaign.

### 3.2 Privacy modes

- `identified`: ballot identity may be retained and exposed only to authorized roles.
- `confidential`: identity may be retained for controlled follow-up, but normal result views and exports suppress it.
- `anonymous`: participation is known; submitted answers contain no voter identity link.
- `secret_ballot`: participation and ballot are separated, result visibility is closed until the configured point, and no application-level voter-to-choice mapping exists.

Privacy mode freezes before `Open` and cannot be downgraded.

### 3.3 Lifecycle

Primary transitions:

```text
Draft -> PendingApproval -> Scheduled -> Open -> Closed -> Counting
Counting -> Certified -> Published -> Archived
```

Controlled side transitions:

```text
PendingApproval -> Draft | Rejected
Scheduled -> Draft                     (only before freeze and before open)
Open -> Paused -> Open | Closed
Draft | Scheduled | Open | Paused | Closed | Counting -> Voided
Published -> Archived
```

Rules:

- `Draft`: editable; no ballot accepted.
- `PendingApproval`: content locked pending review.
- `Scheduled`: preflight passed; opening may be automatic.
- `Open`: frozen version and snapshot; ballots accepted by server time.
- `Paused`: no new ballot; existing data retained.
- `Closed`: no new ballot or ballot edit.
- `Counting`: deterministic calculation/reconciliation.
- `Certified`: approved result snapshot exists.
- `Published`: configured audience can see the certified/public result.
- `Voided`: reason, actor and approval trail required; records retained.
- A campaign with participation or ballot rows cannot be hard-deleted.

### 3.4 Question types

`single_choice`, `multiple_choice`, `yes_no_abstain`, `rating`, `likert`, `ranking`, `matrix`, `allocation`, `token`, `short_text`, `long_text`, `date_time`, `employee_picker`, `organization_picker`, `file_upload`.

Each question may define required/optional, min/max selection, randomization, scoring, weight, validation, display conditions and result visibility. Free text and file upload default to disabled for Secret Election because they can disclose identity.

### 3.5 Scoring methods

- raw count and percentage;
- average and median;
- weighted criteria;
- Jury/Popular weighted combination;
- rank points;
- Top N;
- pass/fail and approval threshold;
- quorum;
- allocation/token totals;
- multiple seats and per-position limits;
- predeclared tie-break rule;
- optional high/low judge-score exclusion.

All formulas are deterministic, bounded and frozen in the Campaign Version. Node and PHP must use the same versioned fixture contract.

## 4. Eligibility contract

### 4.1 Rule inputs

The rule builder may include or exclude by:

- all master-present employees;
- Employee ID;
- Department;
- Safety Unit;
- Position;
- Role, Team, Shift, Plant, Location or Employment Type only when the authoritative source field exists;
- candidate/jury/organizer membership;
- imported Employee IDs validated against the master;
- explicit per-person override with mandatory reason.

Rule operators are bounded `AND`, `OR`, `IN`, `NOT_IN`, `EQUALS`, `NOT_EQUALS`, `IS_EMPTY` and `IS_NOT_EMPTY`. Arbitrary SQL is prohibited.

### 4.2 Snapshot output

Every eligible-voter snapshot row contains:

- Employee ID;
- name snapshot;
- Department ID/name snapshot;
- Safety Unit ID/name snapshot;
- Position ID/name snapshot;
- Role/Team snapshot when used;
- inclusion source and reason;
- account-readiness state at freeze time;
- eligibility state;
- immutable snapshot/version identifiers.

The snapshot header stores totals, scope breakdown, configuration hash, row-set hash, actor and frozen time.

### 4.3 Voting check

Every submit request rechecks, inside the write transaction:

1. authenticated employee identity;
2. campaign/version status and server time;
3. frozen snapshot membership;
4. question/option membership in the frozen version;
5. selection limits and conditional requirements;
6. prior participation and edit policy;
7. idempotency key;
8. database uniqueness/concurrency guard.

The client cannot supply Department, eligibility, score, result, Employee name or campaign state as trusted input.

## 5. User experience contract

### 5.1 User workspace

The `#safety-vote` module has these user views:

- `ต้องดำเนินการ`: eligible and open, not completed;
- `กำลังจะเปิด`;
- `โหวตแล้ว`;
- `รอประกาศผล`;
- `ประกาศผลแล้ว`;
- `ประวัติของฉัน`.

Campaign cards show cover, type/privacy badge, open/close time, countdown, allowed selection count and the user's server-derived state. A campaign outside the user's eligibility is hidden unless its discovery mode is explicitly public; public discovery never grants vote access.

### 5.2 Vote flow

```text
Campaign detail -> rules/privacy acknowledgement -> ballot entry
-> client validation -> review -> server submit -> non-sensitive receipt
```

- Primary mobile controls are at least 44 px.
- Desktop and 390 px layouts must avoid page-level horizontal overflow.
- Keyboard operation, focus restoration, visible labels, error summary and non-color status indicators are required.
- The final review states whether editing is allowed after submit.
- Secret receipts prove acceptance only; they do not contain selections or a value that Admin can use to derive selections.

### 5.3 Result view

The result view obeys `hidden_until_close`, `admin_only`, `certified_only`, `published`, or an explicitly allowed `live` policy. Secret Election defaults to `certified_only` and may not use live results.

## 6. Admin experience contract

### 6.1 Workspaces

- Overview and operational alerts.
- Campaign list and filters.
- Campaign Builder wizard.
- Candidate/Option and submission review.
- Eligibility rule builder, preview and freeze.
- Stage and question builder.
- Jury assignment and progress.
- Dashboard and reconciliation.
- Certification and publication.
- Notifications.
- Export and audit timeline.

### 6.2 Builder sequence

```text
Template -> General -> Stages -> Questions -> Candidates/Options
-> Eligibility -> Privacy -> Scoring -> Schedule -> Notifications
-> Result visibility -> Preview -> Preflight -> Approval/Publish
```

### 6.3 Preflight blockers

Publish fails closed when any applicable condition exists:

- no question/option/candidate;
- no eligible voters;
- unresolved or ambiguous Master Data used by a rule;
- open time is not before close time;
- invalid selection limit;
- weight total violates the configured formula;
- no required Jury/Certifier;
- result visibility conflicts with privacy mode;
- Secret Election permits identifying free text/file upload without a separately approved design;
- duplicate candidate or invalid Employee reference;
- a Stage has no valid transition;
- files fail security validation;
- schema/contract version is unsupported.

Warnings that do not block include eligible employees whose account is not ready, missing optional candidate media and a low projected turnout scope. Admin must acknowledge retained warnings.

## 7. Permission contract

Module permissions:

- `SAFETY_VOTE_VIEW`
- `SAFETY_VOTE_CREATE`
- `SAFETY_VOTE_MANAGE`
- `SAFETY_VOTE_ELIGIBILITY_MANAGE`
- `SAFETY_VOTE_SUBMISSION_REVIEW`
- `SAFETY_VOTE_JURY`
- `SAFETY_VOTE_RESULT_VIEW`
- `SAFETY_VOTE_CERTIFY`
- `SAFETY_VOTE_EXPORT`
- `SAFETY_VOTE_AUDIT_VIEW`
- `SAFETY_VOTE_ADMIN`

`SAFETY_VOTE_ADMIN` implies the operational module permissions for an authenticated Admin, but never bypasses immutable ballot, Secret Ballot separation, frozen-version or certification rules.

Campaign assignments further restrict `submitter`, `candidate`, `reviewer`, `jury`, `campaign_manager`, `result_viewer` and `certifier`. A global permission is necessary but not sufficient where a campaign assignment is required.

Default Phase 1 seed policy:

- `ADMIN`: all Safety Vote permissions.
- all other roles: `SAFETY_VOTE_VIEW` only, subject to campaign eligibility.
- no non-Admin management default; System Console can explicitly grant it later.

## 8. Audit and retention

Audit events include create/update/version/submit-for-approval/approve/publish/open/pause/resume/close/void, eligibility preview/freeze/override, candidate review/withdrawal, Jury assignment/submit/reopen, result calculation/snapshot/certification/publication, export and notification dispatch.

Audit must not store:

- ballot selections in Secret/Anonymous mode;
- free-text response bodies;
- uploaded file content;
- passwords, JWTs, secrets or raw idempotency keys;
- a Secret Ballot correlation identifier beside an Employee ID.

Retention is configuration, not request-time deletion. No automatic retention mutation is permitted in request/startup behavior. A future maintenance command must default to dry-run and require explicit apply confirmation.

## 9. Phase roadmap

### Phase 1 — Platform Foundation

Additive schema, permissions, authenticated Node/PHP route skeletons, Admin Draft Campaign CRUD, Master Data picker, private campaign files, audit and fail-closed schema health. Main user voting remains disabled.

### Phase 2 — Core Activity Vote MVP

Single/multiple choice, options/candidates, eligibility preview/freeze, user workspace, transactional ballot submit, gallery, basic results/dashboard and ordinary Excel/PDF. First pilot: image contest.

### Phase 3 — Survey, Feedback, Nomination and Submission

Question engine, conditional forms, anonymous surveys, nomination/submission intake, Admin review and finalist workflow.

### Phase 4 — Jury, Scoring and Multi-stage

Criteria, Jury assignments, conflict/recusal, weighted/hybrid scoring, ranking/allocation, threshold/quorum/tie rules and multi-stage advancement.

### Phase 5 — Operations, Analytics, Export and Notification

Advanced dashboards, privacy suppression, scheduling, reminders, outbox, QR/deep link, result snapshots, report hashes and health checks.

### Phase 6 — Certified Secret Election

Secret Ballot separation, positions/seats, abstain, strict freeze, reconciliation, dual certification, certified report, concurrency/load/privacy review and HR/Legal process acceptance.

### Phase 7 — Cross-module Integration

Read-only candidate/source adapters and explicit handoffs for Committee, Hiyari, KY, BBS, Patrol, Training, Policy, Dashboard and Johnny usage guidance.

### Phase 8 — Release Gate

Full regression, parity, isolated lifecycle, browser/accessibility/performance/security UAT, backup/rollback, Production drift/configuration preflight and separately authorized controlled release.

## 10. Phase 0 decision and Phase 1 entry conditions

Decision: **GO_FOR_PHASE_1_IMPLEMENTATION_HOLD_FOR_RUNTIME_CHANGE**.

Phase 1 may start only on explicit instruction. It must:

1. treat this contract, the logical schema, API contract and test plan as one package;
2. inspect actual local Master schema without changing it;
3. create explicit additive migration/rollback artifacts rather than runtime DDL;
4. preserve the unrelated dirty `backend/scripts/patrol-checkin-v2.test.js` change;
5. avoid Production connection, deployment, commit and push unless separately instructed;
6. leave the user-facing menu hidden until the Foundation is verified and the Phase 2 vote flow is ready.

Related Phase 0 artifacts:

- `docs/safety-vote-phase0-schema.md`
- `docs/safety-vote-phase0-api-contract.md`
- `docs/safety-vote-phase0-security-test-plan.md`
