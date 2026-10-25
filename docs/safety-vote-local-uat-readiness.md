# Safety Vote Full Local UAT Readiness

Date: 2026-10-25
Scope: Loopback Local only

## Outcome

Safety Vote is fully enabled for continuous Local UAT. The `503 SAFETY_VOTE_SCHEMA_NOT_READY` shown in the Admin workspace was traced to missing Question Image, Candidate/Submission Gallery and Campaign Purge Log schema even though older feature settings were already enabled. The missing schema was applied through additive, idempotent migrations and authoritative runtime health now reports ready.

The follow-up runtime repair also found a partially advanced Local schema marker: `SafetyVote_CampaignVersions.MaxParticipationAttempts` was absent although the stored schema version was newer. This caused both `GET /api/safety-vote/admin/campaigns/4` and `GET /api/safety-vote/me/campaigns` to return `500`. The guarded Local activation now applies the complete ordered migration chain and runtime health validates the real version-column contract instead of trusting the schema-version string alone.

Enabled Local gates:

- Safety Vote module
- Engagement, promotion, planning and privacy-thresholded analytics
- Phase 7 integration-governance workspace
- Individual eligibility addition
- Governed eligibility removal
- Company-wide campaign catalogue and read-only detail

Available capabilities:

- Question Images and shared private image viewer
- Candidate/Submission Gallery
- Campaign visibility/governance and retained purge evidence
- Jury criteria, assignment and People Picker workflows

External delivery remains disabled. Notification planning remains queue-only, and no Phase 7 external adapter is configured. This Local activation does not authorize email, notification, file or result delivery outside the Local environment.

## Data preservation

Before and after activation, protected counts remained:

- Campaigns: 4
- Campaign versions: 4
- Eligibility snapshots: 3
- Eligible-voter rows: 7,633
- Ballots: 0
- Audit rows: 138

## Reusable commands

- `npm run inspect:safety-vote-local-uat` — read-only inventory of schema and feature gates.
- `npm run enable:safety-vote-local-uat` — loopback-only additive migration and activation with protected-count assertions.
- `npm run smoke:safety-vote-local-uat` — authoritative runtime health and capability check.

- `npm run uat:safety-vote-local-live-readonly` — authenticated read-only checks against the running Local Node API without business-row mutation.
- `npm run test:safety-vote-local-uat-repair` — static contract for schema-drift detection, cache wiring, missing-upload fallback and Admin detail rendering.

## Verification

- Authoritative Node runtime health: PASS (`ready=true`)
- Required foundation tables: PASS
- Question Images capability: PASS
- Candidate/Submission Gallery capability: PASS
- Company-wide Catalogue capability: PASS
- Campaign Governance migration, idempotency and purge tombstone: PASS
- Question Image migration and idempotency: PASS
- Candidate/Submission Gallery migration, idempotency and foreign keys: PASS
- Company-wide visibility migration, activation preservation and rollback: PASS
- Running Local HTTP endpoint remains authentication protected (`401` without a token): PASS
- Running Local Admin campaign list and campaign `4` detail: PASS (`200`)
- Running Local User campaign catalogue and nominations: PASS (`200`)
- Ordinary-user Jury access remains permission protected: PASS (`403`)
- Phase 3 disposable Node/PHP API and authenticated desktop/390 px Browser UAT: PASS
- Admin campaign detail no longer references an out-of-scope `liveJuryAction`: PASS
- Missing Local branding and Johnny upload references are suppressed server-side and render the existing UI fallback instead of issuing broken public-upload requests: PASS
- Health rejects a latest schema marker when required physical version columns or Question Image/Gallery capabilities are absent: PASS
- Project-wide PHP 7.4 compatibility across 144 PHP files: PASS

No Production connection, external delivery, deployment, commit or push occurred.

Decision: `PASS_LOCAL_SAFETY_VOTE_UAT_RUNTIME_REPAIRED`\n