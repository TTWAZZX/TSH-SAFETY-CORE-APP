# BBS Smart Card Phase 10F-0 - Visual Card Designer Architecture And Field Mapping

Status: Architecture and migration design complete locally on 2026-09-02. This phase changes documentation only. It does not add a database migration, modify application runtime, deploy Production, or push GitHub.

## 1. Objective

Phase 10F introduces an Admin visual designer for the two established BBS card types:

- Personal Card for an eligible Group Leader-or-higher employee.
- Department Card using the Department's single Active shared Community QR.

Both card types must support:

- front and back artwork;
- portrait and landscape dimensions;
- movable, resizable, reorderable, visible/hidden and removable elements;
- uploaded artwork plus server-authoritative dynamic fields;
- one preview/print rendering contract;
- immutable activated layout versions; and
- additive adoption of existing templates without deleting, rewriting or moving an existing record or file.

The designer composes fields over company-provided artwork. It is not an artwork-generation tool.

## 2. Non-negotiable boundaries

The following behavior remains authoritative:

- There are Personal Cards and Department Cards only. Phase 10F does not introduce a Unit card.
- Personal Card issue/replace remains limited to eligible Group Leader-or-higher mappings.
- Personal QR remains opaque and revocable. Its raw value is available only during the existing issue/replace response. A designer preview must use a clearly non-functional placeholder.
- A Department has exactly one Active shared Department QR. Multiple visual templates may render that same QR.
- Existing issue, replace, revoke, rotate, resolve, authorization and staged-rollout rules do not change.
- Existing template artwork and Community files remain private and are read only through authorized routes.
- Node and PHP production routes must remain behaviorally equivalent.
- No client payload may choose an unauthorized card, QR token, employee, Department, layout version or data-source value.
- Existing `BBS_Card_Templates`, `BBS_Department_Card_Templates`, cards, QR records, print logs and uploaded files must remain intact.

## 3. Existing-state findings

### Personal Card

`BBS_Card_Templates` stores one background image, millimetre width/height, an Employee ID display flag and Draft/Active/Archived lifecycle. `BBS_Cards` references the template and stores only the QR hash/fingerprint. Current preview and print place identity and QR content at fixed coordinates.

### Department Card

`BBS_Department_Card_Templates` stores one background image and physical dimensions. `BBS_Department_QR_Cards` supplies one Active shared QR per Department. Current print places that QR at a fixed bottom-right location.

### Forklift reference pattern

The Forklift module already demonstrates versioned front/back artwork and field configuration. BBS should reuse its interaction lessons, not its tables or authorization domain. The BBS editor additionally requires on-canvas resize handles, layers, keyboard movement, undo/redo and stricter dynamic-field allowlists.

## 4. Target component architecture

```text
Card Admin workspace
    |
    +-- Personal Template ----+
    |                         |
    +-- Department Template --+--> BBS Designer API (Admin only)
                                      |
                                      +-- layout version resolver
                                      +-- field/data-source allowlist
                                      +-- readiness validator
                                      +-- private artwork service
                                      +-- shared render contract
                                                |
                         +----------------------+---------------------+
                         |                                            |
                  Composite Preview                           Print / issue flow
                         |                                            |
                  placeholder QR                    existing authoritative QR flow
```

The server resolves the template parent, current immutable layout version and permitted field values. The browser edits only a Draft layout and renders a validated server contract. Existing issue/print endpoints remain the business mutation boundary.

## 5. Proposed additive data model

No SQL migration is created in Phase 10F-0. A later migration should add new tables only and should not update the existing template rows.

### `BBS_Card_Layout_Versions`

One version belongs to exactly one existing parent template.

| Field | Purpose |
| --- | --- |
| `id` | Layout version identity |
| `TemplateKind` | `Personal` or `Department` |
| `PersonalTemplateID` | Nullable FK to `BBS_Card_Templates` |
| `DepartmentTemplateID` | Nullable FK to `BBS_Department_Card_Templates` |
| `VersionNo` | Monotonic version within the parent template |
| `WidthMM`, `HeightMM` | Physical output size shared by front/back |
| `DPI` | Design/output resolution target |
| `DuplexFlip` | `LongEdge` or `ShortEdge` |
| `BackRotation` | `0` or `180` degrees |
| `Status` | `Draft`, `Active`, or `Archived` |
| `RowVersion` | Optimistic concurrency |
| audit fields | creator, updater, activation and archive metadata |

Rules:

- exactly one parent FK is non-null;
- `Orientation` is derived from `WidthMM` and `HeightMM` so stored values cannot disagree;
- only Draft is editable;
- an Active or Archived layout is immutable;
- only one Active layout is allowed per parent template;
- activating a new version archives the prior Active layout without changing the legacy parent record.

### `BBS_Card_Layout_Sides`

One row per `Front` or `Back` side.

| Field | Purpose |
| --- | --- |
| `LayoutVersionID`, `Side` | Unique version/side identity |
| background file metadata | private stored name, original name, MIME, size and pixel dimensions |
| `StorageClass` | Personal-template or Department-template private storage root |
| `BackgroundFit` | `Contain`, `Cover`, or `Stretch` |
| `BackgroundPositionXBP`, `BackgroundPositionYBP` | background focal point in basis points |
| `BleedMM`, `SafeMarginMM` | print boundary settings |

The Back row is optional. A missing Back means single-sided output and produces a readiness warning, not fabricated artwork.

### `BBS_Card_Layout_Elements`

| Field | Purpose |
| --- | --- |
| `LayoutVersionID`, `ElementKey` | Stable element identity |
| `Side` | `Front` or `Back` |
| `ElementType` | dynamic text/image, static text/image, QR, or shape |
| `DataSourceKey` | allowlisted dynamic value; null for static elements |
| `StaticText` / `AssetID` | content for static elements |
| `XBP`, `YBP`, `WidthBP`, `HeightBP` | integer coordinates from 0-10000 |
| `RotationDeg`, `ZIndex` | visual transform and layer order |
| `Visible`, `Locked`, `Required` | editor and readiness behavior |
| `StyleJSON` | server-validated allowlist of typography/image/shape options |
| `RowVersion` | optimistic concurrency |

Integer basis points avoid floating-point drift while remaining responsive: `2500` equals 25% of the physical side. The server must reject out-of-bounds geometry, unknown style keys, arbitrary HTML/CSS and external URLs.

### `BBS_Card_Layout_Assets`

Stores metadata for private static images added by Admin, such as a company logo or approved symbol. File bytes remain on private disk. Dynamic employee photos and QR values are never copied into this table.

### `BBS_Card_Designer_Print_Snapshots`

An additive audit table links to exactly one existing Personal or Department print-log row and records the resolved layout version, render-contract hash and safe render metadata. It avoids altering historical print-log rows. Snapshot data must not store a raw QR token or an unrestricted private path.

## 6. Field mapping catalog

Every `DataSourceKey` is resolved by the server from the authorized template/card context. Unknown or unavailable keys fail closed according to readiness severity.

### Personal Card fields

| Data source key | Source | Fallback | Readiness |
| --- | --- | --- | --- |
| `employee.full_name` | Employee Master display name | none | Block if Required |
| `employee.id` | `Employees.EmployeeID` | none | Block if Required |
| `employee.department` | Master Department mapping | none | Block if Required |
| `employee.safety_unit` | Master Safety Unit mapping | blank | Warn unless Required |
| `employee.position` | Master Position mapping | blank | Warn unless Required |
| `employee.bbs_level` | effective BBS Position mapping | none | Block for an issued Personal Card |
| `employee.photo` | approved Employee Master photo source | initials avatar | Warn when fallback is used |
| `card.personal_qr` | existing issued Personal Card token | preview placeholder only | Block live output if unavailable |
| `card.issue_date` | existing card issue timestamp | blank | Warn only if Required |
| `template.name` | parent template | none | Block if unavailable |
| `organization.name` | approved Branding/system value | configured static text | Warn unless Required |
| `organization.logo` | approved Branding or private asset | static asset | Warn unless Required |

Personal preview always renders a labelled non-functional QR. Live print receives the raw QR only from the existing successful issue/replace operation; it cannot reconstruct or silently reissue an old token.

### Department Card fields

| Data source key | Source | Fallback | Readiness |
| --- | --- | --- | --- |
| `department.name` | Master Department referenced by template | none | Block if unavailable |
| `department.community_qr` | current Active `BBS_Department_QR_Cards` record | preview placeholder | Block live print if unavailable |
| `template.name` | parent Department template | none | Block if unavailable |
| `organization.name` | approved Branding/system value | configured static text | Warn unless Required |
| `organization.logo` | approved Branding or private asset | static asset | Warn unless Required |

There is no `safety_unit` mapping for Department cards because the business model has no Unit card. The same Active Department Community QR may appear on either or both sides, but every occurrence must resolve to the same server-authoritative QR. A second QR purpose such as PPE Control or Daily Check is outside the current BBS contract and requires a separately approved integration; the designer must not invent that destination.

### Static elements

Both card types may use:

- `static.text` with allowlisted font, weight, alignment, color and line spacing;
- `static.image` from an authorized private asset;
- `shape.rectangle`, `shape.line` and `shape.circle`; and
- background artwork on each side.

Static QR image uploads are not treated as BBS QR elements and must not bypass the existing QR lifecycle.

## 7. Draft editor interaction model

Desktop/tablet Admin editing uses:

- a left element/catalog panel;
- a centre Front/Back canvas with portrait/landscape preview;
- a right properties and layers panel;
- drag to move and visible handles to resize;
- bring forward/send backward, lock, hide, duplicate and delete;
- keyboard selection, arrow-key nudge and accessible numeric position/size inputs;
- snap-to-grid, safe area, bleed and centre guides;
- zoom, fit-to-screen, undo/redo and unsaved-change warning; and
- sample Personal/Department data with an obvious preview-only QR.

The exact layout remains editable through labelled form controls for keyboard and assistive-technology users. Phone presentation should provide read-only preview/readiness and basic lifecycle actions; precision canvas editing is not a mobile requirement.

## 8. Shared render contract

Preview, print and future PDF/PNG export must consume the same normalized object:

```json
{
  "templateKind": "Personal",
  "templateId": 1,
  "layoutVersionId": 2,
  "versionNo": 1,
  "size": { "widthMM": 53.98, "heightMM": 85.60, "dpi": 300 },
  "duplex": { "flip": "LongEdge", "backRotation": 0 },
  "sides": [
    { "side": "Front", "background": {}, "elements": [] },
    { "side": "Back", "background": {}, "elements": [] }
  ],
  "readiness": { "status": "Warning", "items": [] }
}
```

The API must return safe resource identifiers or authorized resource URLs, never stored filesystem paths. The renderer escapes text and implements an allowlist rather than accepting arbitrary markup.

## 9. Readiness contract

Readiness retains `Ready`, `Warning` and `Blocked` and adds side/element-specific findings.

Blocked examples:

- invalid physical dimensions or geometry outside the card;
- missing/unreadable Front background when required;
- missing required field value;
- no visible BBS QR element or unavailable live QR;
- QR below the approved physical minimum or without quiet zone;
- unsupported asset signature or unsafe resource reference;
- template/employee/Department scope mismatch; or
- conflicting Active layout versions.

Warning examples:

- no Back design;
- low effective DPI or background aspect mismatch;
- text overflow or content close to trim/safe boundary;
- fallback initials used instead of employee photo;
- element overlap likely to hide a QR or required label; or
- duplex flip/back rotation needs visual confirmation.

Activation and live output must run server readiness again. Client readiness is guidance only.

## 10. Legacy migration and compatibility plan

Migration must be additive, idempotent and reversible by feature flag.

### Step A - Inventory only

- Count Personal and Department templates by status.
- Verify private file existence, signature, dimensions and SHA-256 without modifying files.
- Report unreadable/missing artwork, duplicate scopes and invalid dimensions.
- Record before-counts for every existing card, QR and print table.

### Step B - Install empty designer tables

- Create only the proposed Phase 10F tables and indexes.
- Add `visual_card_designer_enabled=0` and `visual_card_designer_rendering_enabled=0` settings.
- Do not alter an existing template, card, QR, print-log or upload row.

### Step C - Idempotent legacy bootstrap

For each parent template that has no bootstrap version:

- insert one layout version with the parent's current width/height and lifecycle-equivalent status;
- create a Front side that references the same existing private stored file metadata without moving or duplicating file bytes;
- leave Back absent;
- create the field elements required to reproduce the current fixed composition;
- tag the version as `LegacyBootstrap` for audit; and
- never change the parent template status, row version or timestamps.

Rerunning the bootstrap inserts zero duplicates. A failure for one template is recorded and does not rewrite that template.

### Step D - Dual-read compatibility

- With designer rendering disabled, all templates use the existing renderer.
- With designer rendering enabled, the server uses a valid Active layout version when present; otherwise it falls back to the existing renderer.
- Existing APIs and payloads remain compatible. New Admin designer APIs are additive.
- No issue/print call may accept a client-selected layout that differs from the server-resolved Active version.

### Step E - Visual reconciliation before activation

- Compare legacy and bootstrapped Front output at the same physical size.
- Verify QR scan, text clipping, front/back registration and portrait/landscape output.
- Confirm Personal one-time QR safety and Department shared-QR parity.
- Keep flags off if any blocking mismatch remains.

### Rollback

Set both designer settings to `0`. The existing renderer and existing records remain usable. Do not delete layout versions, assets or snapshots during operational rollback.

## 11. Proposed API surface for later phases

All routes are Admin-only and require Node/PHP parity:

- `GET /api/bbs/admin/card-designer/catalog`
- `GET /api/bbs/admin/card-designer/:kind/:templateId/versions`
- `POST /api/bbs/admin/card-designer/:kind/:templateId/versions`
- `POST /api/bbs/admin/card-designer/versions/:id/clone`
- `GET /api/bbs/admin/card-designer/versions/:id`
- `PUT /api/bbs/admin/card-designer/versions/:id`
- `POST /api/bbs/admin/card-designer/versions/:id/readiness`
- `POST /api/bbs/admin/card-designer/versions/:id/activate`
- `POST /api/bbs/admin/card-designer/versions/:id/archive`
- object-authorized private side/asset upload and read routes.

Draft saves should submit the complete normalized layout with `RowVersion` in one transaction so a partial field save cannot corrupt a design. Activation resolves and validates the complete Draft inside the same transaction.

## 12. Delivery phases after 10F-0

### Phase 10F-1 - Additive Foundation And Compatibility

- implement reviewed migration, feature flags and empty-table rollback rehearsal;
- add server validators, catalog and Draft version APIs with Node/PHP parity;
- implement SELECT-only inventory and idempotent bootstrap tooling; and
- retain legacy rendering by default.

### Phase 10F-2 - Visual Designer Editor

- implement Front/Back canvas, orientation/size, layers, drag/resize, property controls, undo/redo and accessibility;
- implement private side artwork/static assets; and
- keep all output preview-only.

### Phase 10F-3 - Personal Card Integration

- bind server-authoritative Personal fields;
- preserve placeholder preview and one-time issue/replace QR handling;
- reconcile legacy and designer output before enabling Personal rendering.

### Phase 10F-4 - Department Card Integration

- bind Master Department and existing Active shared QR;
- support named Department designs and front/back output;
- preserve Community authorization and QR rotation semantics.

### Phase 10F-5 - Print Readiness, Audit And UAT

- unify preview/print/export rendering and snapshot audit;
- test portrait/landscape, duplex registration, printers and QR scanning;
- run security, accessibility, Node/PHP parity and regression suites; and
- require explicit business acceptance before any Production flag change.

## 13. Phase 10F-0 acceptance result

Phase 10F-0 is complete when this architecture is approved and traceable to later implementation. This document provides:

- separate Personal/Department field catalogs;
- front/back and portrait/landscape geometry rules;
- immutable version and Draft editing rules;
- private storage and server-authoritative QR boundaries;
- an additive, non-destructive legacy migration/fallback plan;
- readiness, render and API contracts; and
- sequenced implementation phases.

No runtime behavior, schema, business data, uploaded file, Production environment or Git repository remote is changed by Phase 10F-0.
