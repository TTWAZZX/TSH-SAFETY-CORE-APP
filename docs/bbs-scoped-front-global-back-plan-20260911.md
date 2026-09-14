# BBS Scoped Front and Global Back Artwork

## Decision

- Card layouts remain strictly separated as Personal or Department.
- One versioned `GlobalBack` artwork slot is shared by both card kinds.
- `ScopedFront` artwork remains kind-specific and resolves by exact Unit first, then its Department default.
- There is no Company-wide Front fallback and no cross-kind fallback. Missing context or artwork fails closed with an actionable reason.
- A Unit-scoped Department template remains a Department Card and continues using its Department shared QR; this design does not introduce Unit cards.

## Runtime model

Artwork identity and versioned private files are stored independently from layout geometry. A layout side records the logical role (`ScopedFront` or `GlobalBack`). Designer preview uses an authorized Department/Unit context. Issue and print resolve the actual owner/template context again on the server and freeze the resolved artwork version identifiers in the existing print snapshot JSON.

Layout Presets continue to contain geometry and non-file elements only. They never contain scoped artwork files, stored names, QR values or cross-kind data.

## Resolution

1. Resolve `ScopedFront` for the exact card kind + Department + Unit.
2. If absent, resolve the same card kind + Department default.
3. Resolve the single `GlobalBack` slot.
4. Fail closed and name the missing slot when either side is unavailable.

## Legacy transition

The existing `BBS_Card_Master_Artwork`, layout assets and private files remain immutable history. Migration creates new additive slot/version tables and nullable provenance/binding columns without adopting, archiving or deleting any existing record. Any promotion of a legacy Draft image or legacy Back master requires an explicit Admin action, creates a new versioned record and retains the original file and row.

