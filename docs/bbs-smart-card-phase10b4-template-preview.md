# BBS Smart Card Phase 10B-4 — Template Preview & Print Readiness

Status: Local implementation complete on 2026-09-01. Not deployed. Production remains behind `staged_admin_only=1`.

## Scope

- Composite Preview for Personal Card and Department Card.
- Cut boundary and 4% safe-area visualization.
- Readiness checks for physical dimensions, image type/decoding, aspect ratio, estimated DPI, QR placement/availability, Personal employee scope and text space.
- Preview confirmation before Personal Activate/Issue/Replace and Department Activate/Print.

## Preserved behavior

- No route, payload, schema, authorization, Master/Pilot configuration, private upload path or stored workflow data changed.
- Personal preview QR is non-functional and visibly marked `PREVIEW`. A real one-time Personal QR is returned only by the existing issue/replace mutation.
- Department preview uses the current Active QR from the existing permission-scoped `/api/bbs/department-cards/me?departmentId=` read.
- Existing server authorization, card eligibility, template lifecycle, QR rotation/revocation, print log and optimistic concurrency remain authoritative.

## Readiness behavior

- `Ready`: the inspected property is suitable for output.
- `Warning`: Admin may continue, but should review artwork ratio, resolution or layout space.
- `Blocked`: the action cannot be confirmed because the affected output cannot be produced safely, such as an unreadable background, invalid dimensions, unavailable QR generator, employee/template scope mismatch or missing Active Department QR for printing.

## Verification

- `npm --prefix backend run test:bbs-phase10b1`
- `npm --prefix backend run test:bbs-phase10b2`
- `npm --prefix backend run test:bbs-phase10b3`
- `npm --prefix backend run test:bbs-phase10b4`
- `npm --prefix backend run test:bbs-phase10c1`
- `npm --prefix backend run test:bbs-phase10c2`
- `npm --prefix backend run test:bbs-phase10c3`
- `node --check public/js/pages/bbs-smart-card.js`
- Authenticated `bbs-phase10b1-browser-uat.js` at 390 px: pass with 41 Master Departments.

Local BBS card tables contain no real Personal templates, Department templates or Department QR records, so real-artwork print acceptance remains a business Pilot task. No temporary records were created for this phase.
