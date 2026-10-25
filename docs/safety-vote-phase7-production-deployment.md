# Safety Vote Phase 7 Production Deployment

Date: 2026-10-26 (Asia/Bangkok)

Decision: `PASS_SAFETY_VOTE_PHASE7_FINAL_PRODUCTION_DEPLOYMENT`

Production deployed immutable commit `b14af90277588aa31d13d95e0a9eb03fcb867f9b` after the Local Final Acceptance and Controlled Production Preflight gates passed.

## Backup and rollback

- Full Production database backup: `backups/production/full-db-local-sync-20261025172836/`
- Tables/rows: 260 / 49,302
- Compressed database SHA-256: `397ce8d438ea0814b935e7cfd799905d8d959d8f338a97f1049ff5f6535421bf`
- Runtime rollback package: `backups/production/safety-vote-phase7-final-deploy-20261025173157/`
- Runtime rollback manifest SHA-256: `38f28eb0a939581582a0e2c024089ffa90ca00c155dcddd14345d12970637f86`
- Existing files backed up: 37; newly deployed paths removable on rollback: 12

Production backup evidence is intentionally ignored by Git and must remain in controlled local/company storage because it contains Production data.

## Schema and runtime

Eight additive/idempotent migrations advanced schema version from `2026-10-20-eligibility-amendments-r1` to `2026-10-25-jury-work-items-atomic-media-r1`. Protected Safety Vote counts remained unchanged: 7 campaigns, 7 versions, 10 eligibility snapshots, 25,465 eligible voters, 5 ballots and 22 files. There were no result snapshots, result rows, certifications or reports.

The release uploaded and double-download verified 49 PHP/frontend runtime files. HTTPS hashes matched the deployed campaign Wizard, stylesheet, main module and HTML entrypoint.

Company-wide visibility, visibility-remediation and eligibility-removal gates are enabled. Production health reports Question Images, Candidate/Submission Gallery, Jury Work Items, Atomic Media and Company-wide Campaign Visibility ready.

## Post-deployment acceptance

- Authenticated Admin health and campaign inventory: pass.
- Authenticated private image API and browser hydration for five existing images: pass.
- Ordinary-user catalogue contract: `company_authenticated`, pass.
- Visibility remediation dry-run: 0 remediate, 2 unchanged and 5 excluded; no apply was necessary.
- The ordinary-user catalogue currently has zero rows because all current Production campaigns are outside the published lifecycle or excluded. Draft and Voided campaigns remain intentionally undiscoverable.
- Temporary helper and guard residue: zero.
- `.htaccess`: restored byte-exact.
- External delivery configuration: unchanged.
- Rollback: not required.
