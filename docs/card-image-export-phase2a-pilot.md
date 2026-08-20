# Card Image Export Improvement - Phase 2A Pilot

Date: 2026-08-20

Status: Complete locally; feature-flagged and not deployed

## Pilot Boundary

The shared exporter is imported only by Dashboard and Accident Report. Even in
those modules it is used only for these two targets when the corresponding
module flag is explicitly enabled:

- Dashboard: `dashboard-hero`
- Accident: `accident-performance-board`

Every other card remains on its existing module exporter. With no feature flag,
both pilot targets also use their legacy exporters. A shared capture error logs
a warning and immediately delegates to the legacy implementation.

Flag shape used by controlled UAT:

```js
window.__TSH_FEATURE_FLAGS__ = {
    cardImageExportV2: ['dashboard', 'accident'],
};
```

No flag is enabled by default.

## Quality Changes

- Both shared targets render at deterministic 1,200 CSS px and scale 1.5,
  producing the same PNG dimensions from desktop and mobile.
- Dashboard mobile no longer wraps the year onto a separate line; its shared
  output matches the desktop layout.
- Accident changes from a narrow live-viewport capture to a readable report
  board. Clone-only truncated-text expansion preserves the complete Man-hour
  and Incident Rate descriptions instead of cutting their lower lines.
- Live page dimensions, classes, styles, and form state are not changed.

## Controlled Comparison UAT

Evidence:

`backups/local/card-image-phase2a-comparison-20260820T051525Z/`

The runner loaded the current local pilot assets on the Production origin,
authenticated normally, and downloaded legacy/shared PNG pairs without making
write API calls.

| Result | Value |
|---|---:|
| Desktop/mobile comparisons | 4 |
| PNG files | 8 |
| Confirmed shared captures | 4 |
| Legacy fallback during shared tests | 0 |
| Browser runtime errors | 0 |
| Business-data changes | 0 |

Shared output dimensions were viewport-consistent:

- Dashboard: 1800 x 192 on desktop and mobile
- Accident: 1800 x 1746 on desktop and mobile

Visual review confirmed Dashboard remained clean and Accident's previously cut
rate descriptions were fully visible after the clone-only truncation fix.

Run the gates with:

```powershell
npm --prefix backend run test:card-image-export-phase1
npm --prefix backend run uat:card-image-export-phase2a
```

## Next Gate

Phase 2B should migrate the remaining P1 targets in small batches, beginning
with Machine Safety and Yokoten, followed by 4M and Safety Culture. Each batch
must retain module fallback, limit shared imports to the approved files, and
pass desktop/mobile old/new comparison plus visual inspection before the next
batch begins.
