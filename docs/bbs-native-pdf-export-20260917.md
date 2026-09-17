# BBS native PDF export — 2026-09-17

## Outcome

PDF no longer rasterizes a complete A4/A5/A6 browser sheet through `html2canvas`. It creates a physical jsPDF page and places each source-native 600 DPI Designer card face at its exact millimetre position.

## Pipeline

1. Preserve the existing `planDesignerSheets()` Front/Back page order and duplex slot mapping.
2. Create the selected physical paper size in jsPDF with compression disabled.
3. Render each card through the same source-native artwork plus transparent dynamic-overlay pipeline used by PNG/JPG.
4. Apply the immutable Designer Back rotation (`0` or `180`) to the card raster when required.
5. Place the card at its exact slot coordinates and physical width/height in millimetres.
6. Leave unused slots and page area as native PDF white space instead of baking the entire sheet into a page screenshot.

## Preserved behavior

- Golden browser Print remains unchanged.
- Front/Back sheet pairing, LongEdge/ShortEdge mirroring and incomplete final-sheet alignment remain unchanged.
- Personal and Department layouts remain separate.
- Safe/bleed controls and the output toolbar are not included.
- Print receipts, print logs, QR values, card records, templates, private uploads, schema and rollout settings are unchanged.

## Quality contract

- Each embedded card face is rendered at a minimum of 600 DPI.
- Page size and card placement use physical millimetres.
- PNG card faces are embedded without lossy PDF image compression.
- The original Designer artwork is decoded and painted once before the dynamic overlay.
