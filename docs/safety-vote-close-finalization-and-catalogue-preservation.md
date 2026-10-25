# Safety Vote close finalization and catalogue preservation

Local implementation date: 2026-10-25.

## Contract

- A due Open campaign is closed idempotently during authenticated Safety Vote traffic and the operations due processor.
- An Admin may close an Open campaign early only with a reason and exact `CLOSE <campaign-code>` confirmation.
- Closing does not require every eligible employee to participate. Quorum remains recorded as governance evidence and is not a blocker for standard result certification.
- Popular Vote close creates an immutable Frozen result snapshot automatically. Zero accepted ballots create explicit `no_result` rows with no rank or winner.
- Closed, Certified and Published campaigns remain in the company-wide catalogue. A completed campaign with result evidence cannot activate an offline Draft revision when that activation would return the campaign to Draft and hide the completed catalogue item.
- The authenticated User detail retrieves and renders aggregate official results for ended campaigns. Zero participation is presented as `สิ้นสุดกิจกรรม · ไม่มีคะแนน`, with no rank or winner, at responsive mobile and desktop widths.
- Hash routing accepts both `#safety-vote` and `#/safety-vote`, so existing bookmarks and the current Local UAT URL reach the same workspace.
- Secret-election and staged Jury result governance remains on its dedicated counting/scoring path; campaign closure itself is never blocked by participation completeness.

## Compatibility and rollout

- Node and PHP share the close, zero-result, quorum-advisory and catalogue-preservation behavior.
- PHP changes use PHP 7.4-compatible syntax and APIs.
- No Production connection, deployment, commit or push is part of this Local implementation.

## Local acceptance evidence

- Authenticated runtime/API UAT: campaign 4 is Closed on V1, V2 remains a pending Draft, the public result endpoint returns `200`, and a V2 activation attempt returns `409 REVISION_ACTIVATION_WOULD_HIDE_COMPLETED_CAMPAIGN` without mutation.
- Result integrity: Frozen snapshot 2 has 0 accepted ballots, `TieState=none`, five `no_result` rows and zero ranked rows.
- Browser UAT: 390×844 and 1366×768 show the Closed catalogue card and `no-result` official-result panel with no horizontal overflow or Safety Vote 5xx response. Evidence: `backups/local/safety-vote-close-finalization-browser-1792895906612/`.
- PHP 7.4 static compatibility passes across 144 PHP files; changed PHP files pass syntax lint.
