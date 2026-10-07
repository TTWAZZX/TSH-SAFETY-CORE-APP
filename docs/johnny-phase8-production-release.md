# Johnny AI Phase 8 Controlled Production Release

Date: 2026-10-07 (Asia/Bangkok)

Decision: **RELEASED — GO**

Immutable commit: `fa1046c011f9c8359df2fb0b572bc0363a2a3603`

## Release result

- The committed candidate manifest was verified byte-for-byte before upload.
- Only the four authorized PHP runtime paths were uploaded. The two dependency libraries were uploaded first and the handler last.
- `origin/main` was advanced directly to the exact immutable commit and resolves to the same full SHA after release.
- No Patrol file, `AGENTS.md`, preflight document, backup, `.tmp` content or other working-tree path was pushed or uploaded.
- Phase 8 has no migration. No database, configuration, Knowledge Base or business-data change was made.

## Production runtime verification

| Runtime path | Bytes | SHA-256 | FTPS download-back |
| --- | ---: | --- | --- |
| `api/handlers/johnny_ai.php` | 184866 | `3ea4d8dab5d23e05c0195dddffbaa10e886ccb17ee3cda0bbf6a68ad56387609` | PASS |
| `api/lib/johnny_system_usage.php` | 15010 | `1bfbc8c111d91d7b9f76b33efb617148cd4e71c538ac95769521ad5277fe8d2c` | PASS |
| `api/lib/johnny_evidence_ranking.php` | 7513 | `b082958e0d019d031098721a83f5b50f00f424b4c8085217dc87e08083361253` | PASS |
| `api/lib/johnny_answer_verification.php` | 5320 | `0329e95ed7bfb4068acae6775b755b7db1fb66e93c27de7e42125b9d4810a3ff` | PASS |

FTPS download-back passed `4/4`. Evidence is under `backups/production/johnny-phase8-release-20261007-105252/`.

## HTTPS and security gate

- Production application root: `200`.
- Anonymous `GET /api/johnny/status`: `401`.
- `GET /shared/johnny-system-usage.json`: `404`.
- `GET /shared/johnny-workflow-actions.json`: `404`.
- The Production `api` FTPS inventory contained no filename matching helper, preflight, backup, Phase 8 temporary artifact or SQL export.

Stored Production UAT Admin and User credentials each returned `401`. Authenticated read-only Johnny GET/UI UAT was therefore not possible. No authentication bypass, synthetic account or chat request was used. The previously accepted authenticated local desktop/390 px evidence remains the visual evidence; the two failed login attempts may create only the normal security-audit side effects.

## Rollback and residue

Rollback was not triggered because every mandatory manifest, FTPS and anonymous HTTPS/security gate passed. The verified rollback package remains at `backups/production/johnny-phase8-preflight-20261007-101608/`; normal rollback restores the two prior files and removes only the two libraries proven absent before release. The local release staging directory was removed. No remote helper, migration, backup or temporary release artifact was created by this release.
