# BBS Smart Card Phase 10F-1 — Additive Foundation & Compatibility

Status: Local implementation complete on 2 September 2026. Not deployed to Production and not pushed to GitHub.

## Delivered scope

- Additive layout-version, side, element, asset and print-snapshot tables for Personal and Department cards.
- Disabled-by-default `visual_card_designer_enabled` and `visual_card_designer_rendering_enabled` settings.
- Admin-only Node/PHP parity APIs for field catalog, version list/detail, Draft creation/update and readiness.
- Shared allowlist validation for physical dimensions, Front/Back sides, integer basis-point geometry, dynamic fields, QR fields and style properties.
- SELECT-only compatibility inventory and an idempotent legacy bootstrap that is dry-run unless `--apply` is supplied.
- Flag-only operational rollback. Existing layout records are preserved.

## Compatibility guarantees

- Existing Personal/Department template, card, QR and print rows are neither updated nor deleted.
- Existing private background files are neither moved nor deleted.
- Designer layout activation and runtime rendering are not part of Phase 10F-1.
- The legacy renderer remains authoritative while the designer flags are disabled or a template has no valid designer layout.
- Personal raw QR and Department shared QR lifecycle remain unchanged.
- No Unit-card domain is introduced.

## Local database result

- Five designer tables installed successfully.
- Both designer settings remain `0`.
- Personal legacy templates: `0`.
- Department legacy templates: `0`.
- Bootstrap candidates: `0`.
- Designer layout rows created by bootstrap: `0`.
- Existing parent rows changed: `0`.

## Commands

```powershell
npm --prefix backend run migrate:bbs-phase10f1-local
npm --prefix backend run audit:bbs-phase10f1-inventory
npm --prefix backend run bootstrap:bbs-phase10f1-legacy
npm --prefix backend run test:bbs-phase10f1
```

The bootstrap command above is a dry run. An explicit `--apply` is intentionally required and was not used because Local has no eligible legacy templates.

## Next phase

Phase 10F-2 builds the Admin visual editor over these Draft APIs: Front/Back canvas, orientation and physical size controls, drag/resize, layers, properties, undo/redo, accessible keyboard controls and preview-only rendering. It must not enable Production rendering or modify card/QR issuance.
