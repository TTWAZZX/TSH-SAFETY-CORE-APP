# Card Image Export Phase 2D - Lower-Risk Pilot Batch 1

Date: 2026-08-20
Status: Local pilot complete; not enabled by default; not deployed

## Scope

Phase 2D batch 1 adds the shared exporter only to the OJT/SCW hero target
`scw-hero`. The target uses a deterministic 1200 px clone-only grid for the
title and KPI strip. Every other OJT card remains on the legacy exporter, and a
shared capture failure immediately returns to the unchanged legacy path.

Hiyari hero was investigated in the same batch but was deliberately removed
from the rollout. Repeated mobile comparisons exposed non-deterministic
html2canvas clone reflow: KPI glyphs, the title column, or tab content could be
clipped even when automated dimensions matched. Hiyari therefore has no code
change and continues to use its original legacy exporter.

## Verification

- Shared foundation: 19/19 passed; approved runtime imports 7/7.
- OJT desktop/mobile comparison: 2 comparisons, 4 PNGs.
- Shared captures: 2/2; legacy fallbacks: 0.
- Viewport-consistent shared layouts: 1/1.
- Runtime errors: 0.
- Visual review: OJT title, Thai description, five KPI values/labels, colors,
  and background pattern are complete on desktop and mobile.
- Evidence:
  `backups/local/card-image-phase2d-comparison-20260820T075710Z/`.

The browser UAT now waits for the OJT KPI skeleton to be replaced before
capture and records the live KPI source text in its comparison evidence.

## Safety and Rollback

The default Production flag list remains the six Phase 2C modules; OJT is not
enabled by default. No API, permission, database, upload storage, or business
data changed. No Production file was uploaded. Rollback before a future rollout
is simply to leave `ojt` out of `cardImageExportV2`; the module's legacy handler
is still intact.

## Next Step

Run a separate rollout decision for OJT, or continue another small local pilot
such as Training. Keep Hiyari deferred until it has a purpose-built static
export surrogate rather than responsive live-DOM cloning.
