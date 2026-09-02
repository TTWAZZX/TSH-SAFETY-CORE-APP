# BBS Smart Card Phase 10F-2 - Visual Designer Editor

Status: complete locally on 2026-09-02. Not deployed to Production and not pushed to GitHub.

## Delivered scope

- Admin-only layout version chooser for existing Personal and Department templates.
- Editable Draft canvas for Front and optional Back sides in portrait or landscape dimensions.
- Drag, resize, layer selection/order, show/hide, lock/unlock, duplicate, delete and numeric geometry properties.
- Keyboard arrow movement, Shift+Arrow movement, Delete, focus trapping, Escape close and focus restoration.
- Zoom, orientation swap, 50-step undo/redo and an unsaved-change warning.
- Server-catalog dynamic fields, static text, shapes and labelled preview-only QR placeholders.
- Private Draft background upload and authorized preview for JPG, PNG and WebP images up to 10 MB.
- Read-only Active/Archived layouts and preview-only phone presentation.

## API additions

- `POST /api/bbs/admin/card-designer/versions/:id/assets`
- `GET /api/bbs/admin/card-designer/assets/:assetId/file`
- `GET /api/bbs/admin/card-designer/versions/:id/sides/:side/background`

Node and PHP implement the same Admin authorization, Draft immutability, file-signature checks and safe response contract. The server binds uploaded assets to one layout version and canonicalizes background/element resource references during save. Stored names and filesystem paths are never included in JSON.

## Storage and compatibility

New designer artwork is stored in `backend/private-uploads/bbs-card-designer`, below the existing denied private-upload root. No legacy artwork is moved, copied or removed. Existing Personal and Department template rows remain authoritative parents.

Local settings are:

- `visual_card_designer_enabled=1`
- `visual_card_designer_rendering_enabled=0`

The second flag is the hard compatibility boundary: existing Personal issue/replace and Department print flows do not consume Designer layouts in this phase. Preview QR values are non-functional and no card/QR lifecycle endpoint is called by the editor.

## Verification

- Node syntax checks: pass.
- PHP handler/library lint: pass.
- Phase 10F-1 regression contract: pass.
- Phase 10F-2 static security/editor contract: pass.
- Admin API lifecycle UAT: pass for Draft creation, legacy background read, private asset upload/read, Front/Back save and immutable-version rejection.
- Authorization UAT: ordinary user denied catalog and private asset reads.
- Authenticated Chrome UAT: desktop create/edit/undo/redo and 390 px phone preview-only behavior pass with no console error or page overflow.
- Cleanup: temporary templates `0`, versions `0`, assets `0`; temporary private files removed.

## Deferred to later phases

- Activation/archive UI and immutable cloning workflow.
- Personal Card live render binding and one-time QR reconciliation (Phase 10F-3).
- Department Card live shared-QR rendering (Phase 10F-4).
- Production-quality print/PDF/export, print snapshots and physical duplex acceptance (Phase 10F-5).
- Production deployment, feature-flag rollout and GitHub push.
