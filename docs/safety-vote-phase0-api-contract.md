# Safety Vote Phase 0 — API Contract

Contract: `2026-10-08-safety-vote-phase0-r1`

Status: design only; no route in this document is implemented or authorized by Phase 0.

## 1. Common contract

Base path: `/api/safety-vote`

All endpoints require the existing Bearer authentication unless explicitly documented otherwise. Phase 0 defines no public unauthenticated endpoint.

Success envelope:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "contractVersion": "2026-10-08-safety-vote-phase0-r1",
    "serverTime": "2026-10-08T09:00:00+07:00"
  }
}
```

Error envelope:

```json
{
  "success": false,
  "code": "SAFETY_VOTE_ERROR_CODE",
  "message": "Safe user-facing message.",
  "details": []
}
```

Rules:

- IDs are server-issued and parsed as positive integers unless a documented code is used.
- Pagination uses `page`, `pageSize` with bounded maximum, and returns `total`.
- Sorting uses allowlisted keys; raw column names are rejected.
- Mutations use JSON except authenticated file upload endpoints.
- Mutable Admin resources require `rowVersion`; stale writes return `409 VERSION_CONFLICT`.
- Ballot submit requires `Idempotency-Key`; replay returns the original generic acceptance response.
- The server derives actor identity, role, eligibility, score, status and scope.
- Node and PHP status, code and material response fields must match.

## 2. Standard error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Invalid bounded input |
| 401 | `AUTH_REQUIRED` | Missing/invalid authentication |
| 403 | `PERMISSION_DENIED` | Missing module or campaign permission |
| 403 | `CAMPAIGN_NOT_ELIGIBLE` | Actor not in frozen eligibility |
| 404 | `CAMPAIGN_NOT_FOUND` | Missing or intentionally undisclosed campaign |
| 404 | `FILE_NOT_FOUND` | Missing or unauthorized private file |
| 409 | `VERSION_CONFLICT` | Stale row version |
| 409 | `CAMPAIGN_STATE_CONFLICT` | Operation is invalid in current state |
| 409 | `BALLOT_ALREADY_SUBMITTED` | Edit/revote not allowed |
| 409 | `ELIGIBILITY_NOT_FROZEN` | Open/submit requires snapshot |
| 409 | `IDEMPOTENCY_CONFLICT` | Key reused for different request |
| 422 | `PREFLIGHT_FAILED` | Publish blockers exist |
| 423 | `CAMPAIGN_PAUSED` | Temporarily not accepting responses |
| 503 | `SAFETY_VOTE_SCHEMA_NOT_READY` | Explicit migration not applied |

Internal SQL, paths, stack traces, tokens and secrets are never returned.

## 3. User endpoints

### `GET /me/campaigns`

Returns only campaigns the actor may discover, separated by actionable state.

Query: `bucket`, `type`, `page`, `pageSize`, `search`.

Response fields include campaign ID/code, title, type, privacy badge, cover-file endpoint, open/close times, state, eligibility state, participation state, result availability and permitted actions. It never returns another employee's participation.

### `GET /campaigns/:campaignId`

Returns the frozen/current user-safe Campaign Version, rules, questions, options/candidates, file references, user state and permissions.

Candidate Employee information is limited to the frozen display profile approved for the campaign. Master account/contact fields are not exposed.

### `GET /campaigns/:campaignId/eligibility`

Returns only the current actor's eligibility decision:

```json
{
  "eligible": true,
  "state": "eligible",
  "snapshotNo": 1,
  "canSubmit": true,
  "reasonCode": "RULE_MATCH"
}
```

It does not expose the full voter list.

### `POST /campaigns/:campaignId/ballot/draft`

Optional and enabled only by the frozen edit policy. Draft persistence is identity-linked and is not available for the Phase 6 Secret Election unless its separately reviewed design can preserve the promised privacy level.

Body: `campaignVersion`, `answers`, `rowVersion`. Answers contain only question IDs and type-appropriate values.

### `POST /campaigns/:campaignId/ballot/submit`

Headers: required `Idempotency-Key`.

Body:

```json
{
  "campaignVersion": 1,
  "acknowledgedRules": true,
  "answers": [
    { "questionId": 10, "optionIds": [101] }
  ]
}
```

The server performs the complete eligibility/state/shape/concurrency validation inside one transaction. The response is generic:

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "participationState": "submitted",
    "receiptCode": "SV-...",
    "submittedAt": "2026-10-08T09:05:00+07:00",
    "canEdit": false
  }
}
```

For Anonymous/Secret modes, the receipt cannot retrieve or prove the selected choices.

### `GET /campaigns/:campaignId/receipt`

Returns acceptance metadata for the actor only. No choices are returned for Anonymous/Secret campaigns.

### `GET /campaigns/:campaignId/results`

Returns the latest result snapshot permitted by privacy/result-visibility policy. Response includes snapshot/report identifiers, calculated/certified/published times, aggregate metrics, rows safe for the actor and privacy-suppression metadata.

No endpoint accepts a Department filter that would produce candidate-choice breakdown for Secret Ballot.

### `GET /files/:fileId`

Authenticated private file delivery. The server verifies actor access, ownership/purpose, stored basename, file presence and stored MIME/signature. Response uses a safe filename, correct Content-Type and private cache headers.

## 4. Submission and Jury endpoints

Introduced in their roadmap phases.

```text
GET    /campaigns/:id/my-submissions
POST   /campaigns/:id/submissions
PUT    /campaigns/:id/submissions/:submissionId
POST   /campaigns/:id/submissions/:submissionId/submit
POST   /campaigns/:id/submissions/:submissionId/withdraw
POST   /submissions/:submissionId/files

GET    /campaigns/:id/jury/assignments
GET    /jury/assignments/:assignmentId
PUT    /jury/assignments/:assignmentId/scores
POST   /jury/assignments/:assignmentId/submit
POST   /jury/assignments/:assignmentId/recuse
```

Jury score reads are scoped to the assigned juror until the configured reveal point. Jurors cannot request another juror's draft scores.

## 5. Admin endpoints

All paths below require applicable Safety Vote permission. `SAFETY_VOTE_ADMIN` grants operational access but does not bypass lifecycle/integrity rules.

### Campaign collection

```text
GET    /admin/campaigns
POST   /admin/campaigns
GET    /admin/campaigns/:id
PUT    /admin/campaigns/:id
POST   /admin/campaigns/:id/clone
POST   /admin/campaigns/:id/versions
```

Create returns a stable Campaign and Draft Version. Update accepts only Draft fields and requires `rowVersion`.

### Builder resources

```text
GET/POST/PUT /admin/campaigns/:id/stages
GET/POST/PUT /admin/campaigns/:id/questions
GET/POST/PUT /admin/campaigns/:id/options
GET/POST/PUT /admin/campaigns/:id/candidates
GET/POST/PUT /admin/campaigns/:id/roles
POST         /admin/campaigns/:id/files
DELETE       /admin/campaigns/:id/files/:fileId
```

Delete is Draft-only logical removal unless the resource has never been referenced and policy explicitly permits physical cleanup.

### Master picker

```text
GET /admin/master/employees
GET /admin/master/departments
GET /admin/master/safety-units
GET /admin/master/positions
```

These are Safety Vote-scoped projections of existing authoritative data. They do not mutate Master Data. Employee search is paginated and returns only fields needed for selection and preflight.

### Eligibility

```text
GET    /admin/campaigns/:id/eligibility/rules
PUT    /admin/campaigns/:id/eligibility/rules
POST   /admin/campaigns/:id/eligibility/import-preview
POST   /admin/campaigns/:id/eligibility/preview
POST   /admin/campaigns/:id/eligibility/freeze
GET    /admin/campaigns/:id/eligibility/snapshots/:snapshotId
POST   /admin/campaigns/:id/eligibility/exceptions
GET    /admin/campaigns/:id/eligibility/export
```

Preview is read-only and returns counts, bounded rows, warnings and a preview fingerprint. Freeze re-evaluates inside its own transaction and does not trust preview rows supplied by the client.

An exception after open requires reason, permission and campaign policy. It cannot remove a voter with accepted participation; such a conflict returns `409 ELIGIBILITY_PARTICIPATION_CONFLICT`.

### Preflight and lifecycle

```text
POST /admin/campaigns/:id/preflight
POST /admin/campaigns/:id/submit-approval
POST /admin/campaigns/:id/approve
POST /admin/campaigns/:id/schedule
POST /admin/campaigns/:id/open
POST /admin/campaigns/:id/pause
POST /admin/campaigns/:id/resume
POST /admin/campaigns/:id/close
POST /admin/campaigns/:id/void
POST /admin/campaigns/:id/archive
```

Every command includes expected `rowVersion`; reason is mandatory for pause, void, exceptional reopen and rejection. State commands are idempotent only when the existing state represents the same completed command.

### Submission review

```text
GET  /admin/campaigns/:id/submissions
POST /admin/campaigns/:id/submissions/:submissionId/review
POST /admin/campaigns/:id/submissions/:submissionId/finalist
POST /admin/campaigns/:id/candidates/:candidateId/withdraw
```

### Jury administration

```text
GET/POST/PUT /admin/campaigns/:id/jury/criteria
GET/POST/PUT /admin/campaigns/:id/jury/assignments
POST         /admin/jury/assignments/:assignmentId/reopen
GET          /admin/campaigns/:id/jury/progress
```

Reopen never overwrites submitted score history; it increments version and records actor/reason.

### Dashboard, calculation and result

```text
GET  /admin/campaigns/:id/dashboard
POST /admin/campaigns/:id/results/calculate
GET  /admin/campaigns/:id/results/snapshots
POST /admin/campaigns/:id/results/:snapshotId/freeze
POST /admin/campaigns/:id/results/:snapshotId/certify
POST /admin/campaigns/:id/results/:snapshotId/publish
POST /admin/campaigns/:id/results/:snapshotId/revoke-certification
```

Calculation re-derives all score values from frozen questions and accepted ballots. The client cannot submit totals, ranks or winner IDs.

Certification requires an exact `resultHash`; a changed/recalculated result invalidates pending certifications.

### Export, notification and audit

```text
GET  /admin/campaigns/:id/exports/data
POST /admin/campaigns/:id/exports/certified-report
GET  /admin/campaigns/:id/reports/:reportId/file
GET  /admin/campaigns/:id/notifications/preview
POST /admin/campaigns/:id/notifications/queue
GET  /admin/campaigns/:id/audit
GET  /admin/health
```

Export endpoints apply permission, privacy mode and threshold at the server. Client-side column hiding is not a privacy control.

Notification queue accepts an event/template and intended audience selector, never arbitrary recipient SQL. The server resolves recipients and uses suppression keys.

## 6. Permission-to-endpoint matrix

| Permission | Endpoint families |
| --- | --- |
| `SAFETY_VOTE_VIEW` | User discovery/detail/self eligibility/result allowed by campaign |
| campaign eligibility | Ballot submit; not a global permission replacement |
| `SAFETY_VOTE_CREATE` | Create and own Draft Campaign |
| `SAFETY_VOTE_MANAGE` | Builder and lifecycle within assigned scope |
| `SAFETY_VOTE_ELIGIBILITY_MANAGE` | Rule, preview, freeze, exception and voter-list export |
| `SAFETY_VOTE_SUBMISSION_REVIEW` | Review/finalist/withdraw administration |
| `SAFETY_VOTE_JURY` + assignment | Assigned Jury endpoints |
| `SAFETY_VOTE_RESULT_VIEW` | Non-public Admin result/dashboard |
| `SAFETY_VOTE_CERTIFY` + assignment | Freeze/certify/publish as configured |
| `SAFETY_VOTE_EXPORT` | Authorized exports/reports |
| `SAFETY_VOTE_AUDIT_VIEW` | Module audit and integrity views |
| `SAFETY_VOTE_ADMIN` | Operational union, subject to immutable controls |

## 7. Contract invariants

The following must be identical in Node and PHP:

- enums and transition matrix;
- canonical validation and error codes;
- eligibility rule resolution;
- question/answer validation;
- scoring, quorum, tie and ranking calculations;
- privacy suppression;
- result/reconciliation counts and hashes;
- safe field projection for every privacy mode.

API contract fixtures must contain no real employee, ballot, Production or secret data.
