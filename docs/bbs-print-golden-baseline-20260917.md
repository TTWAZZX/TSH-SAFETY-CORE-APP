# BBS Golden Print baseline — 2026-09-17

## Scope

This baseline protects the browser Print result that the user confirmed is sharp and faithful to the Designer source. It does not change card geometry, artwork, typography, QR values, print logging, card records, rollout settings, or Production data.

## Confirmed rendering paths

- Browser Print uses `designerPrintDocument()` and emits the canonical Designer card face as physical HTML/CSS in millimetres. Artwork remains the authorized original resource, while dynamic text and QR elements remain separate positioned elements.
- Print waits for document fonts and images before invoking the browser print dialog. Print CSS hides the status, toolbar, safe-area and bleed controls.
- PNG/JPG use `saveDesignerPrintImages()` and rasterize each HTML card with `html2canvas` before encoding and adding DPI metadata.
- PDF uses `saveDesignerPrintPdf()` and rasterizes each complete paper sheet with `html2canvas` before embedding it in jsPDF.

The two export paths therefore cross a rasterization boundary that browser Print does not cross. Exact pixel dimensions and DPI metadata prove output size, but do not prove that fine artwork detail survived that boundary.

## Golden contract

- Contract ID: `bbs-designer-physical-print-v1`
- Card-face contract: `bbs-designer-card-face-v2`
- Physical dimensions are expressed in `mm`.
- The original authorized Designer artwork resource is retained in the print document.
- No preview-sized canvas is inserted into the browser Print document.
- Front and Back are separate paired sheets.
- Long-edge and short-edge duplex mapping remain deterministic.
- Incomplete final batches retain matching front/back card indices.
- Controls and non-production guides remain excluded by print CSS.

The contract marker is non-visual and exists so future export work can be tested without accidentally replacing the confirmed Print path.

## Existing batch capability and remaining UI gap

`planDesignerSheets()` already calculates multi-card paper capacity, groups compatible layouts, emits paired Front/Back sheets and mirrors reverse-side slots for duplex printing. The current user workflow commonly supplies one card, which is why the browser preview shows one card per A4 sheet. A later phase should expose Admin multi-selection and preflight while preserving this print contract.

## Phase 2 boundary

The next phase should correct PNG/JPG only. It must not alter `designerPrintDocument()`, physical card placement, duplex mapping, print receipt validation, QR routing, template/card records, or rollout settings. Acceptance must compare the exported card against this Golden Print source rather than only checking pixel dimensions and DPI metadata.
