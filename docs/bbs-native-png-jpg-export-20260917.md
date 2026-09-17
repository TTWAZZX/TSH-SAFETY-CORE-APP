# BBS native PNG/JPG export — 2026-09-17

## Outcome

PNG and JPG now preserve the authorized Designer artwork through a source-native composition path. Browser Print remains on the unchanged `bbs-designer-physical-print-v1` contract.

## Rendering contract

For every Front and Back card face:

1. Allocate the final physical raster grid directly (`60 x 85 mm` at 600 DPI is `1417 x 2008 px`).
2. Decode the original authorized Designer background data URL.
3. Draw that source once onto the final raster grid using its configured `Cover`, `Contain` or `Stretch` geometry, background position and bleed box.
4. Render only the dynamic Designer overlay (text, images, shapes and QR) with a transparent background.
5. Composite the overlay over the native artwork once.
6. Encode PNG losslessly or JPG at quality `0.98`, then embed verified 600 DPI metadata.

This removes the previous full-card DOM rasterization of the background. The fallback full-card path remains only for a non-Designer test/compatibility surface that has no `.designer-background`; a present but undecodable Designer background fails closed instead of silently producing a lower-quality export.

## Preserved behavior

- Print HTML/CSS, physical placement and automatic print invocation are unchanged.
- PDF remains unchanged for Phase 3.
- Personal and Department layouts remain separate.
- QR values, print receipts, print logs, cards, templates, private uploads and rollout settings are unchanged.
- Front and Back remain separate files with physical dimensions and DPI in the filename.

## Verification

- Exact 600 DPI pixel dimensions and embedded PNG/JPEG density metadata.
- Original artwork is painted before the transparent dynamic overlay.
- Safe and bleed guides remain excluded from saved images.
- Back transform is restored after export.
- Golden Print contract remains physical HTML backed by the original Designer resource.
