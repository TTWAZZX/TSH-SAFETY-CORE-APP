# BBS Admin Personal Batch Selection — 2026-09-17

## Scope

- Admin can select eligible Personal Card recipients across search results and pagination.
- Selection is capped at 100 employees, matching the existing Node/PHP issue API limit.
- Current-page select/unselect and clear-all controls are provided.
- Employees with an Active Personal Card remain disabled and are removed from a stale selection when encountered again.
- One Active Personal Template must match every selected employee's Department, optional Safety Unit and BBS level.
- Composite Preview shows the batch count before mutation. The server revalidates the complete batch and issues all cards in one transaction; one invalid employee rejects the whole batch.
- Successful cards continue through the existing combined Designer print document and immutable Print Snapshot receipt flow.

## Boundaries

- This selection is for new Personal Card issuance only. It does not mix Department Card output into the batch.
- Existing Active cards are not silently reprinted because raw QR values are not stored. They continue to require the explicit Replace + Reprint lifecycle, which rotates the QR.
- No schema, rollout flag, existing card, QR, print log or private upload was changed by this package.

## Verification

- `node backend/scripts/bbs-admin-batch-selection.test.js`
- `node backend/scripts/bbs-regression.js` — 61/61 passed.
- `node --check public/js/pages/bbs-smart-card.js`
- `git diff --check`
