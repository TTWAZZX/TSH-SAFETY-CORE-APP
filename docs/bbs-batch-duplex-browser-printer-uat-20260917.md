# BBS Batch Duplex Browser and Printer UAT — 2026-09-17

## Automated browser result

- Result: PASS.
- Chromium generated one A4 Front page and one A4 Back page from the production print renderer.
- Compact capacity: 9 cards per side at 60 × 85 mm with 1 mm bleed.
- Measured Browser CSS page: 793.6875 × 1122.515625 px, matching A4 at 96 CSS DPI.
- Measured Browser CSS card: 226.765625 × 321.25 px, matching 60 × 85 mm.
- Every Front/Back pair retained the same pair ID. Long-edge Back positions were mirrored exactly, including the expected reverse column order.
- Each rendered card had eight crop-mark segments. No output toolbar was present and the page had no horizontal overflow or console error.
- Chromium `Page.printToPDF` produced exactly two pages with CSS page size honored.

## Artifacts

- `output/bbs-batch-duplex-e2e-20260917T094931/BBS_Batch_Duplex_Calibration_A4_9up.pdf`
- `output/bbs-batch-duplex-e2e-20260917T094931/BBS_Batch_Duplex_Browser.png`
- `output/bbs-batch-duplex-e2e-20260917T094931/report.json`

## Physical printer gate

- Result: PASS. The operator printed the calibration sheet on the target Canon and confirmed that Front/Back alignment was correct.
- Target discovered: `\\192.168.124.4\Canon_Print`, Canon Generic Plus PCL6, A4.
- The shared printer default was `OneSided`; it was intentionally not changed globally.
- Existing jobs were already Spooling/Printing during discovery, so no silent/background job was inserted.
- The calibration PDF was opened visibly for a controlled operator print and the physical output was accepted with Back X/Y remaining at zero.
- Per-job settings must be A4, Actual size / 100%, Two-sided, Flip on long edge, one copy.
- After printing, place Front over Back against light and measure Back displacement. Keep X/Y at zero if both axes are within the accepted shop tolerance; otherwise enter the measured correction in the Admin Batch controls and repeat one calibration sheet.

## Re-run

- `npm --prefix backend run uat:bbs-batch-duplex-browser`

## Boundaries

- This UAT creates only local output artifacts and a temporary browser profile. It does not call BBS APIs, issue cards, write database rows, change rollout flags, change printer defaults or send a silent print job.
- Physical alignment was confirmed by the operator before release authorization.
