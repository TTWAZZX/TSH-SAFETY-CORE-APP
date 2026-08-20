# Card Image Export Phase 2D - Lower-Risk Pilot Batches 1-2

Date: 2026-08-20
Status: Deployed; enabled by default; authenticated Production UAT passed

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

Batch 2 adds the same feature-flagged boundary only to the Safety Training
`training-hero` target. Its 1200 px clone forces one fixed title/KPI grid, hides
the year/add-record controls from the exported clone, and preserves all current
values and tabs. Training Matrix, records, audit, courses, and every other
Training export target remain on the legacy handler.

## Verification

- Shared foundation: 19/19 passed; approved runtime imports 8/8.
- OJT desktop/mobile comparison: 2 comparisons, 4 PNGs.
- Shared captures: 2/2; legacy fallbacks: 0.
- Viewport-consistent shared layouts: 1/1.
- Runtime errors: 0.
- Visual review: OJT title, Thai description, five KPI values/labels, colors,
  and background pattern are complete on desktop and mobile.
- Evidence:
  `backups/local/card-image-phase2d-comparison-20260820T075710Z/`.
- Training desktop/mobile comparison: 2 comparisons, 4 PNGs.
- Training shared captures: 2/2; legacy fallbacks: 0.
- Training viewport-consistent shared layouts: 1/1 at 1800 x 300 after the
  deterministic-height Production hotfix.
- Training runtime errors: 0.
- Training visual review: Thai title and labels, 10 / 2599 / 2488 / 96% KPI
  values, background, and all four tabs are complete on both viewports.
- Training evidence:
  `backups/local/card-image-phase2e-comparison-20260820T085807Z/`.

## Production Rollout

- Fresh backup: `card-image-phase2d-predeploy-20260820-164000`.
- Database: 147 tables; SHA-256
  `01b3206d75d35b8fb04ee5e04b34740f7d687b1f255a1d241172c83b2f7a7969`.
- Uploads: 776 files / 1,152,308,206 bytes.
- Temporary helper and remote SQL archive remaining: 0.
- FTP and HTTPS SHA-256 verification: passed for every deployed file.
- Initial Production UAT captured 16/16 with no fallback or runtime error, but
  correctly stopped because Training differed by 2 px between viewports.
- The Training clone was fixed to a deterministic 200 px source height and
  redeployed after local visual/UAT verification.
- Final Production UAT: 16/16 shared captures, 0 fallbacks, 8/8
  viewport-consistent layouts, and 0 runtime errors.
- Final manifest SHA-256:
  `f47d124f290fd58be8b42ea1f05ae39d52205be996286051bbb8f7fd4c40cd51`.
- Final visual evidence:
  `backups/production/card-image-phase2f-comparison-20260820T095823Z/`.

The browser UAT now waits for the OJT KPI skeleton to be replaced before
capture and records the live KPI source text in its comparison evidence.

## Safety and Rollback

The default Production flag list now contains the six Phase 2C modules plus OJT
and Training. No API, permission, database, upload storage, or business data
changed. Emergency rollback is to explicitly omit `ojt` and `training` from
`cardImageExportV2`; both legacy handlers remain intact.

## Next Step

Monitor normal use of OJT `scw-hero` and Training `training-hero`. Keep Hiyari
deferred until it has a purpose-built static export surrogate rather than
responsive live-DOM cloning.
