# Safety Vote Phase 9.1 — Jury Progress Remediation

Date: 2026-10-09
Scope: Local only
Baseline: `077c5977283a55756bdfcfe5dfb804e32f716aa8` (`HEAD` = `origin/main`)
Decision: `PASS_LOCAL_REGRESSION_RELEASE_REMAINS_HOLD`

## Outcome

The populated Jury Progress endpoint now returns its aggregate rows in both Node and PHP. The existing query joined `SafetyVote_JuryAssignments` and `SafetyVote_CampaignVersions`, which both expose `Status`, but selected and grouped the column without a table qualifier. MySQL therefore returned an ambiguous-column error as soon as the Operations workspace requested populated progress data.

The remediation qualifies the assignment-side fields as `a.Status` and `a.ConflictState` in both implementations. The route, `SAFETY_VOTE_MANAGE` permission, response envelope, aggregate-only disclosure and campaign filter are unchanged. There is no schema, migration, ballot, eligibility, privacy, jury scoring, result calculation or certification change.

## Changed scope

- `backend/routes/safety-vote-phase4.js` — qualified Node Jury Progress select/group fields.
- `api/handlers/safety_vote_phase4.php` — applied the identical PHP query correction.
- `backend/scripts/safety-vote-phase91-jury-progress-regression.test.js` — added a guarded populated-data Node/PHP regression.
- `backend/scripts/safety-vote-ux-phase5-browser-probe.js` — replaced the historical expected-500 assertion with functional aggregate UI assertions.
- `backend/package.json` and root `package.json` — exposed `test:safety-vote-phase91-jury-progress`.
- `AGENTS.md` and this report — recorded closeout and supersession of the historical limitation.

## Regression contract

The new regression:

1. Refuses any non-loopback database host.
2. Creates separate, guard-named disposable Node and PHP databases.
3. Applies the existing Phase 1–7 migrations and explicitly enables the module.
4. Seeds four assignments: two Draft/clear, one Submitted/clear and one Recused/recused.
5. Starts the existing authenticated Node and PHP fixture routers.
6. Requires HTTP `200`, exact aggregate totals and Node/PHP response parity.
7. Statically rejects the former unqualified query in both implementations.
8. Drops both databases and verifies zero schema residue.

## Verification

| Gate | Result |
| --- | --- |
| Node route and regression syntax | PASS |
| PHP handler lint | PASS |
| `test:safety-vote-phase91-jury-progress` | PASS — Node/PHP HTTP 200, exact Draft 2 / Submitted 1 / Recused 1, residue 0 |
| `test:safety-vote-phase4-parity` | PASS |
| `uat:safety-vote-phase4-api` | PASS — Node/PHP lifecycle and authenticated desktop/390 px Browser UAT |
| `test:safety-vote-ux-phase5` | PASS — 54 assertions |
| `uat:safety-vote-ux-phase5-browser` | PASS — 390×844, 430×932, 768×1024, 1366×768, 1920×1080 |
| `test:safety-vote-phase831-disabled` | PASS — Node/PHP fail-closed parity |
| `git diff --check` | PASS (line-ending notices only) |

Phase 5 Browser evidence: `backups/local/safety-vote-ux-phase5-1791510333090/`, result SHA-256 `85c878e931cdf513ee71e891b8bd642da795319a947a74d13a2eba1297bb3512`. The fixture rendered `3/6` submitted and `ถอนตัว 1` at every required viewport, produced no Jury Progress HTTP 500 or unexpected API/browser error, and left database/generated-report residue at zero.

Phase 4 Browser evidence: `backups/local/safety-vote-phase4-browser-1791510293018/`.

## Release state

This work is local only. No Production connection, external dispatch, deploy, commit or push occurred. Earlier Phase 5 and Phase 8 reports correctly preserve the defect as it existed during those historical test runs; this Phase 9.1 report supersedes that limitation for the current working tree.

Production release remains `HOLD`: the working tree, including the Phase 8 candidate and this remediation, has not been committed into an immutable release source and no new Production authorization was requested.
