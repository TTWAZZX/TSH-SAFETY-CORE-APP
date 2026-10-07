# Johnny global launcher avatar Production release

Date: 2026-10-07 (Asia/Bangkok)

Decision: **RELEASED — GO**

Commit: `b42d8453ae780748018e4d080cebd00804d3ee6b`

## Result

- The global `ถาม Johnny` launcher now reads the same `johnnyAvatarUrl` returned by authenticated `GET /johnny/status` and used by the main Johnny workspace.
- Status is loaded read-only after authenticated drawer initialization, so the launcher does not require the drawer to be opened first. Leaving the Johnny workspace refreshes the avatar after an Admin change.
- A failed or missing image safely falls back to `J`. Logout/session replacement guards prevent a late status response from updating a different drawer instance.
- Only `index.html`, `public/style.css`, `public/js/main.js` and `public/js/johnny-drawer.js` were deployed. No PHP, Patrol, database, configuration, Knowledge Base or business data changed.

## Verification

| Runtime path | Bytes | SHA-256 | FTPS | HTTPS |
| --- | ---: | --- | --- | --- |
| `index.html` | 97755 | `8c887517db01971c9c195d0ad3a56e0a91f57e4946c15db94935bc95b8f89d10` | PASS | PASS |
| `public/style.css` | 74335 | `b90b16ed9d5033ebcd54aa2c9310800abba8bb4980cc58a40bb56cfbe8be8a72` | PASS | PASS |
| `public/js/main.js` | 66388 | `37db178cb87e18aa3f0623af543a72747dfdb53ea95d2cc0973c83f0a427b861` | PASS | PASS |
| `public/js/johnny-drawer.js` | 31731 | `fe550ff95b2a60bc4b33cc32b850e013cb677e5cf07b583f76f23845720d32b3` | PASS | PASS |

- Cache marker `20261007-johnny-launcher-avatar-r1` is served from both `index.html` and `public/js/main.js`.
- The served drawer contains `johnny-global-launcher-avatar`.
- Anonymous Johnny status remains `401`; both protected shared contracts remain `404`.
- Stored Production UAT credentials had already returned `401` during the immediately preceding Phase 8 release, so no repeated failed login or authenticated visual UAT was performed. The existing `johnny_avatar_url` setting was not changed.
- Regression passed Drawer `35/35`, mobile compact `14/14`, Production safety `33/33`, Observability and Workflow.

Rollback copies and download evidence are under `backups/production/johnny-launcher-avatar-predeploy-20261007-112733/`. Rollback was not triggered.
