# Card Image Export Improvement - Phase 1 Shared Foundation

Date: 2026-08-20
Status: Complete locally; shadow-only and not deployed

## Scope

Phase 1 adds a reusable browser-side card image export foundation without
connecting it to any application page or right-click button. All 12 module
exporters remain unchanged and continue to be the only runtime implementations.

There are no API, PHP, Node route, permission, database, upload-storage,
business-data, SPA cache-key, or deployment changes in this phase.

## Files

- `public/js/utils/card-image-export.js` - shared shadow utility
- `backend/scripts/fixtures/card-image-export-phase1.html` - deterministic
  browser fixture
- `backend/scripts/card-image-export-phase1.test.js` - Edge/CDP fixture runner
- `backend/package.json` - `test:card-image-export-phase1` command

## Foundation Contract

The utility provides:

- deterministic export width and scale planning;
- explicit maximum height and rendered-pixel limits;
- structured errors that recommend split-image, PDF, or Excel export for
  oversized cards;
- visible and connected target validation;
- font readiness, image readiness, timeout, and non-fatal asset warnings;
- two animation-frame settling before capture;
- clone-only width, overflow, sticky/fixed, animation, transition, caret, and
  text line-height normalization;
- live input, checkbox, textarea, select, and progress value transfer to the
  export clone;
- `data-card-image-ignore` support;
- sanitized deterministic PNG filenames;
- per-card concurrent capture coalescing;
- temporary marker and object URL cleanup;
- an opt-in exporter factory whose disabled state delegates to the existing
  legacy exporter.

The default limits are 1,200 px export width, 1,600 px maximum width, 5,000 px
maximum content height, 16 million rendered pixels, and scale 1.5 with safe
downscaling no lower than 1. These are pilot defaults, not a Production rollout
decision; Phase 2A comparison evidence may tighten them.

## Shadow Boundary

At Phase 1 completion no runtime file imported `card-image-export.js`. Phase 2A
subsequently added the two approved imports in Dashboard and Accident. The
automated source-boundary test now fails unless those are the only two runtime
references, preventing accidental expansion beyond the pilot.

`createCardImageExporter()` also defaults to `enabled: false`. In that state it
calls the supplied legacy fallback. If a later pilot enables the shared path,
`fallbackOnError` can return to the module exporter while evidence is collected.

## Automated Verification

Run:

```powershell
npm --prefix backend run test:card-image-export-phase1
```

The headless Edge fixture covers 15 assertions:

- filename sanitization;
- deterministic sizing;
- pre-render rejection of an excessively tall card;
- one render for concurrent requests;
- deterministic return metadata;
- broken-image warning without capture failure;
- clone-only dimensions and overflow;
- sticky-position normalization;
- safe text line-height;
- current form values;
- table structure;
- canvas dimensions;
- ignored control removal;
- no mutation of the live target;
- disabled/shadow delegation to the legacy exporter.

The runner now requires runtime imports to remain exactly the two approved
Phase 2A pilot modules.

## Phase 2A Entry Gate

Phase 2A may begin only by explicitly wiring a feature-flagged pilot. The
recommended pair is Dashboard (clean baseline) and Accident performance board
(known clipping baseline), so the new path is tested against both a stable and
a difficult surface.

Before any Production rollout, Phase 2A must provide old/new desktop and mobile
PNG comparisons, Thai/English text inspection, asset and chart checks,
oversized-card behavior, console-error results, exact affected-file manifest,
rollback files, and authenticated browser UAT. Other modules remain on their
legacy exporters during that pilot.
