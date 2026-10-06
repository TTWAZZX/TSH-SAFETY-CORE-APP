# Johnny AI Phase 6 — Integrated Local UAT & Release Gate

Date: 2026-10-06
Scope: Local development only, synthetic identities and disposable databases only.

## Gate result

**HOLD — API/lifecycle gate passed; authenticated visual Browser UAT is not yet evidenced.**

No Production deployment was performed. No existing business database, employee, report, upload, setting or other business row was changed. The Node and PHP lifecycle suites create databases under the guarded prefixes `tsh_johnny_phase6_node_*` and `tsh_johnny_phase6_php_*`, reject non-loopback database hosts, and drop the complete fixture database after each run.

## Passed evidence

- Node lifecycle: authenticated status/chat/history, feedback, ownership, Admin observability, 21 navigation handoffs, three supported draft handoffs, conversation cascade cleanup and database drop.
- PHP lifecycle: the same contract and cleanup checks as Node.
- Privacy: `johnny_answer_feedback` contains metadata columns only; free-text fixture fields are not returned or persisted; feedback cascades with message deletion.
- Permission: unauthenticated Johnny access is rejected, cross-user feedback/workflow access returns not found, and observability is Admin-only.
- Workflow safety: all 21 navigation targets return canonical routes with `autoSubmit=false` and `businessMutation=false`.
- Residue: chat conversations, messages and feedback are zero before database drop; both disposable databases are absent after cleanup.
- Regression: Phase 1 `33/33`, Phase 2 `33/33`, compact mobile `14/14`, Phase 3 Node `105/105`, Phase 3 PHP `135/135`, Phase 4 Node `42/42`, Phase 4 PHP `22/22`, Phase 4 observability `7/7`, Phase 5 Node `49/49`, Phase 5 PHP `37/37`, Phase 5 workflow smoke `9/9`.
- PHP parity defect found and fixed: chat and image-analysis now capture the assistant insert ID before updating the conversation, so PHP returns a usable persisted `messageId` for feedback and workflow actions.

## Open release blockers

1. The in-app Browser controller failed before opening a tab with `failed to write kernel assets: path not found`, including after one controlled reset. Desktop and 390 px authenticated visual UAT must be rerun when the browser controller is available.
2. Repository permission audit still reports two pre-existing, unrelated 4M routes as `UNREVIEWED`:
   - `POST /api/fourm/training-curriculums/:id/reactivate`
   - `DELETE /api/fourm/training-logs/:id`

These blockers keep the Phase 6 release decision at HOLD. They do not indicate Johnny lifecycle or data residue failures.

## Command

```powershell
cd backend
npm run uat:johnny-phase6-integrated-local
npm run audit:johnny-phase6-residue
```

The fixture harness has no Production URL fallback and refuses non-loopback database hosts.
