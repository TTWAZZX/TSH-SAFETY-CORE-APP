# BBS Batch Sheet Layout and Duplex Alignment — 2026-09-17

## Scope

- Admin Personal Card issuance can prepare A4, A5 or A6 batch sheets without mixing Department Cards into the job.
- `Compact` centers the maximum practical grid; a 60 × 85 mm card with 1 mm bleed fits 3 × 3, or 9 cards per A4 side. `Safe` keeps wider margins and gaps.
- Every Front slot has a stable pair ID. The matching Back slot is mirrored from the same physical cell using the Designer `LongEdge` or `ShortEdge` setting; an incomplete final sheet retains blank reverse placeholders so card order cannot shift.
- Front and Back sheets include crop marks at the exact card cut boundary. Saved batch PDF draws the same cut marks as vector lines while retaining source-native card raster quality.
- Optional Back X/Y calibration is limited to ±5 mm, affects only Back sheets and is frozen at Preview confirmation. Zero is the mathematically aligned default.
- Preview reports paper, grid capacity, duplex sheet-set count and calibration before the transactional issuance mutation.

## Operator contract

- Print at `100%` / `Actual size`; disable browser `Fit to page`.
- Select the edge flip shown by the Designer job. Do not combine different card dimensions or duplex flip settings in one print job.
- Start with Back X/Y at zero. Use a one-sheet test, measure printer feed displacement, then enter only the measured correction.
- Crop marks define the 60 × 85 mm cut boundary. Bleed remains outside that boundary.

## Boundaries

- Golden direct Print remains physical HTML with original Designer resources; it is not replaced by a screenshot.
- Personal and Department workflows remain separate. This package adds Admin Personal batch-sheet controls and does not change Department QR or Department Template ownership.
- No schema, rollout flag, card/QR business record, print snapshot or private upload is changed by the layout package itself.

## Verification

- `node --check public/js/utils/bbs-card-print.js`
- `node --check public/js/pages/bbs-smart-card.js`
- `node backend/scripts/bbs-integration-print.test.js`
- `node backend/scripts/bbs-admin-batch-selection.test.js`
- `node backend/scripts/bbs-regression.js`
- `git diff --check`
