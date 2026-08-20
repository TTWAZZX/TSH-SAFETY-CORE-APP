# Card Image Export Improvement - Phase 0 Baseline and Safety Audit

Date: 2026-08-20
Status: Complete (audit only; not deployed)

## Objective

Establish a reproducible baseline for the right-click **Save image** feature
before changing its implementation. The audit covers the rendered output,
responsive behavior, asset readiness, clipping risks, and differences between
module-specific exporters.

Phase 0 made no application behavior, API, permission, database, upload-storage,
or business-data changes. The browser audit used authenticated read-only page
loads and normal client-side PNG downloads only.

## Controlled Production Evidence

| Viewport | Modules | Visible export targets | PNG baselines | Export failures | Runtime errors | Evidence |
|---|---:|---:|---:|---:|---:|---|
| Desktop | 12 | 174 | 12 | 0 | 0 | `backups/local/card-image-baseline-20260820T043416Z/` |
| Mobile | 12 | 199 | 12 | 0 | 0 | `backups/local/card-image-baseline-mobile-20260820T043646Z/` |

Each evidence folder contains `baseline-audit.json`, `baseline-audit.md`, and
the downloaded PNG files. The audit runner is
`backend/scripts/card-image-baseline-audit.js`.

The 12 audited module surfaces were Dashboard, Safety Patrol, Accident Report,
Machine & Device Safety, OJT/SCW, CCCF, Safety Training, Hiyari-Hatto, KY
Activity, Yokoten, Safety Culture, and 4M Change Management.

## Current Implementation Baseline

There is no shared export contract. Each module owns a separate html2canvas
handler and therefore captures fonts, images, dimensions, overflow, animation,
and clone cleanup differently.

| Exporter group | Current safeguards | Main gap |
|---|---|---|
| Dashboard | Waits for fonts, locks capture dimensions, disables animation/transition | Safeguards are local and cannot protect other modules |
| Safety Patrol | Waits for fonts and images and locks dimensions | Safeguards are local; very large cards remain possible |
| CCCF | Clone cleanup and animation handling | No common asset wait or stable export dimensions |
| Machine Safety | Clone cleanup for effects and transforms | Long tables and text metrics remain unstable |
| Accident, OJT, Training, Hiyari, KY, Yokoten, Safety Culture, 4M | Basic html2canvas capture with module-specific cleanup | No consistent font/image wait, sizing, overflow expansion, or output limit |

The runtime uses html2canvas 1.4.1 from CDN and the Kanit web font. The audit
confirmed Kanit was loaded, so the observed defects are not explained by an
unloaded font alone. They also involve html2canvas text metrics, line-height,
responsive live-DOM dimensions, overflow/max-height, and oversized capture
surfaces.

## Findings and Priority

### P1 - visible output defects

- **Machine Safety:** the desktop document-list image is 1056 x 2134 and has
  severe repeated baseline/text clipping in table rows. On mobile the same
  surface reaches approximately 352 x 9824 with 34 clipped-text candidates.
- **Accident:** the performance board contains labels/descriptions clipped at
  their lower edge. Its mobile capture grows to approximately 352 x 2580.
- **Yokoten:** topic-card body text is visibly truncated and footer/actions are
  compressed in the exported images.
- **4M Change Management:** linked-system titles/descriptions are truncated on
  desktop; mobile KPI/scope content also shows cut text.
- **Safety Culture:** the campaign-library export is very large and live form
  controls can appear blank or incomplete in the PNG.

### P2 - usable but inconsistent or difficult to consume

- **KY:** the mobile video-showcase capture is approximately 352 x 3000 and has
  several clipped internal labels and buttons.
- **Safety Patrol:** image assets render, but lower text and card proportions
  can be clipped or awkward.
- **CCCF:** charts export, but the output is oversized and labels become small;
  charts need an explicit export profile.
- **Safety Training:** summary cards are generally usable, but mobile text
  clipping candidates and responsive-size differences remain.

### P3 - generally usable, still requires standardization

- Dashboard, OJT/SCW, and Hiyari hero baselines were the cleanest samples.
- They still need the same deterministic readiness, dimensions, filename,
  loading state, error handling, and output-size contract as every other
  module.

## Root-Cause Assessment

The feature currently captures the live responsive DOM. That makes its PNG
layout depend on the user's current viewport and scrollable-card state. Most
exporters start before all fonts/images have a shared readiness guarantee and
do not normalize width, overflow, max-height, sticky/fixed elements, form
controls, or animation. Extremely tall tables also exceed a practical single
image format even when the capture technically succeeds.

## Phase 1 - Safe Shared Export Foundation

Phase 1 should add a shared utility in an unwired/shadow state first. No module
should switch to it until focused comparison tests pass.

Required contract:

1. Clone only the authorized, currently visible export target. Do not reveal
   hidden tabs, load extra records, or expand data that the current user cannot
   already see.
2. Wait for `document.fonts.ready`, in-scope images, and two animation frames
   before capture; report unavailable cross-origin assets without crashing.
3. Capture at a deterministic export width independent of mobile/desktop
   viewport, while preserving module theme and readable Kanit metrics.
4. Normalize clone-only overflow, max-height, sticky/fixed positioning,
   animations, transitions, text line-height, canvas, and form controls. Never
   mutate the live card.
5. Enforce maximum width, height, pixel area, and memory estimates. Large
   tables must use paged/split images or direct users to the existing PDF/Excel
   export; they must not silently create a 10,000-pixel image.
6. Keep the current module exporter as a feature-flagged fallback during pilot
   rollout. A failed new capture must restore UI state and allow a retry.
7. Use sanitized deterministic filenames and remove temporary clone/object URL
   resources in `finally` blocks.

## Acceptance Matrix Before Any Module Rollout

- Desktop and mobile produce the same readable export layout for the same card.
- Thai and English text has no clipped first/last line, mojibake, or unintended
  ellipsis.
- Web fonts, local images, allowed remote images, canvas charts, and supported
  form values render correctly.
- Scrollable cards either expand within the approved size limit or use the
  documented split/PDF/Excel path.
- Hidden or unauthorized content is absent from the image.
- One capture at a time per card; loading and failure states recover cleanly.
- Browser console has no new runtime errors and the live page is unchanged
  after export.
- Existing module behavior remains available behind the fallback flag until
  its replacement passes comparison UAT.

## Recommended Rollout Sequence

1. Phase 1: shared export foundation and automated fixture tests, not wired to
   production module buttons.
2. Phase 2A: pilot Dashboard plus one complex card (Accident) behind a feature
   flag; compare old/new PNGs on desktop and mobile.
3. Phase 2B: fix the P1 modules in small module batches.
4. Phase 3: migrate P2/P3 modules, add large-table split/PDF/Excel routing, and
   run full permission/browser UAT.
5. Phase 4: remove legacy exporters only after all module fallbacks have an
   approved rollback point and Production evidence.

This order limits blast radius: Phase 1 creates and tests the foundation without
changing any current button, and each later module migration remains reversible.
