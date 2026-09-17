# BBS output fidelity baseline — 2026-09-17

## Scope and safety

- Production inspection was read-only: authenticated login plus GET requests only.
- No card issue/replace/revoke, print-log write, template/layout mutation, artwork upload, database change, rollout change, push or deploy was performed.
- Production remains `staged-admin-only` (`401` response with `X-BBS-Rollout-Mode: staged-admin-only` for an unauthenticated BBS Admin request).
- Existing user-owned working-tree changes were not touched.

## Trace for employee 002671

- Employee: `002671` / ลักษิกา กะการดี
- Canonical scope: Department `18` / Safety Unit `2` / BBS level `Group Leader`
- Active card: Card `3`, Personal Template `3` (`Tube cutting`)
- Issued: `2026-09-17 08:17:33`
- QR resolve count at inspection: `0`
- Existing print receipt: Print Log `3`, Snapshot `3`, Layout Version `2`
- Frozen render-contract hash: `d19656dd99ca8618238e1536699eeb4e38075fdf55fc25b9598faf97eeefaeb6`

## Active layout provenance

Personal Layout Version `2` / Version `1` is Active (RowVersion `6`). Both sides are legacy `CardArtwork` bindings:

- Front: no `backgroundAssetId`, no `masterArtworkId`, no Master kind/side provenance
- Back: no `backgroundAssetId`, no `masterArtworkId`, no Master kind/side provenance

The Production inventory reports zero compliant Designer versions:

- Personal Template `3`, Layout `2`, Active: immutable legacy Front and Back
- Department Template `2`, Layout `3`, Draft: repairable legacy Front and Back

This does not mean the files are missing. It means the current Active layout cannot prove the modern Scoped Front / Global Back lineage from its own side records; issuance resolves and freezes the effective artwork in the print snapshot.

## Server artwork versus exported files

| Side | Server-resolved artwork | Server pixels / metadata | Export pixels / metadata | Result |
|---|---|---:|---:|---|
| Personal Front | Scoped Front V3, `1. Tube.png` | 1063×1517, 450 DPI, 2,672,863 bytes | 708×1003, 96 DPI, 977,478 bytes | Raster was downsampled and physical-resolution metadata was lost |
| Global Back | Global Back V1, `1. ด้านหลังบัตร 2026.png` | 1417×2022, 600 DPI, 3,094,025 bytes | 708×1003, 96 DPI, 865,714 bytes | Raster was downsampled and physical-resolution metadata was lost |

The exported filenames say `300dpi`, and their pixel dimensions are close to the 60×85 mm target at 300 DPI (approximately 709×1004). However, the PNG files themselves declare 96 DPI. Applications that honor image metadata can therefore size/resample them incorrectly. The browser export also discards the additional source resolution before the file is saved.

Export evidence:

- Front SHA-256: `DE5441DC84A466478DE7BE473B0EB42D61347343DA59906A7EADFFFEB7337DDA`
- Back SHA-256: `EB64FEBC30104DADB2AABB1793BC9D2BDACE5CD560CE5E58F1B75626183EE7F7`

Server source evidence:

- Scoped Front V3 SHA-256: `9b1ab2b9b70d1aa99d42eb7f8e12854c3627c821c214ca051a6f116f2a359972`
- Global Back V1 SHA-256: `0baf7b2ed2d5f9b2a9f6b9e6163f4281358064c72a0379ae868e51406ce539ef`

## Confirmed implementation causes

1. PNG/JPG export rasterizes the CSS card with `html2canvas`, targets `outputDpi / 96`, then uses browser `canvas.toBlob()`. The browser encoder does not preserve/write the requested DPI metadata, so the file remains 96 DPI even though its filename says 300 DPI.
2. The process rasterizes the already-composited browser DOM instead of composing from original artwork at the final output resolution. This makes background detail depend on the browser/html2canvas sampling path, while the generated QR remains visibly sharper.
3. PDF export captures the whole A4 sheet and sends it to jsPDF using `addImage(..., 'FAST')`, adding another raster/resampling stage.
4. The print stylesheet hides `.bbs-output-toolbar`, but the runtime toolbar has inline `display:flex`. The print rule lacks `!important`, so the toolbar can remain visible in browser print preview.
5. QR intent is resolved before login. When Production is `staged-admin-only`, unauthenticated `/bbs/qr/resolve` is gated; the current error path deletes `bbs_qr_intent`. Consequently, successful scanning may not survive authentication and cannot reach claim/routing. This is separate from QR image sharpness.

## Acceptance baseline for the next sets

- Front and Back output must use one canonical render contract and match the Active Designer layout/snapshot.
- PNG/JPG must have exact expected pixels and embedded DPI metadata; the background and text must remain sharp at 100% inspection.
- PDF and direct print must use the same card faces, exact physical size, and contain no toolbar/status controls.
- QR scan must preserve intent through login and route only after server-authorized claim.
- Personal and Department flows must be verified independently; no cross-kind artwork fallback is permitted.
- Existing cards, QR records, print snapshots, artwork and legacy layouts remain preserved.

## Next implementation set

Set 2 should introduce the canonical high-fidelity renderer contract used by Preview, PNG, JPG, PDF and Print. It should not change Production rollout yet.
