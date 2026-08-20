# Card Image Export Improvement - Phase 2C Production Rollout

Date: 2026-08-20

Status: Deployed and authenticated UAT passed

## Runtime behavior

The shared exporter is enabled by default for:

- Dashboard
- Accident
- Machine Safety
- Yokoten
- 4M Change Management
- Safety Culture

Only the targets approved in Phases 2A/2B use the shared path. Other card
targets remain legacy. An explicitly supplied
`window.__TSH_FEATURE_FLAGS__.cardImageExportV2` value overrides the default,
providing an emergency flags-off rollback. Shared failures also retain automatic
legacy fallback.

## Production backup

- Backup ID: `card-image-phase2c-predeploy-20260820-133849`
- Database tables: 147
- Database SHA-256:
  `a82a3fbac8770c5ad12629b8ece2759229be0f487c8b2f131c14482c391d6e98`
- Upload files: 774
- Upload bytes: 1,143,117,547
- Temporary helper removed: Yes
- Remote database archive removed: Yes

## Deployment verification

- FTP download-back SHA-256: 10/10
- HTTPS runtime SHA-256: 9/9
- Final manifest SHA-256:
  `d450063a838dc7704f45efffd894dd8435893c7591bd27320060502080f23ca8`
- Cache marker: `20260820-card-image-phase2c`
- Shared-default Production captures: 12/12
- Legacy fallbacks: 0
- Desktop/mobile consistent layouts: 6/6
- Runtime errors: 0
- Visual review: passed all six representative outputs
- Business/API/schema/upload-storage mutation: none

Evidence:

- `backups/production/card-image-phase2c-upload-verify-20260820-135434/`
- `backups/production/card-image-phase2c-http-smoke-20260820-135609/`
- `backups/production/card-image-phase2c-production-uat-20260820T065800Z/`
- `backups/production/card-image-phase2c-final-manifest-verify-20260820-140100/`

## Uploaded runtime boundary

- `index.html`
- `public/js/main.js`
- `public/js/utils/card-image-export.js`
- `public/js/pages/dashboard.js`
- `public/js/pages/accident.js`
- `public/js/pages/machine-safety.js`
- `public/js/pages/yokoten.js`
- `public/js/pages/fourm.js`
- `public/js/pages/safety-culture.js`
- `deploy-manifest.json`
