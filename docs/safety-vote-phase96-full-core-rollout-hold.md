# Safety Vote Phase 9.5C / 9.6 Full Core Rollout

Date: 2026-10-09  
Decision: `PHASE_9_6_ROLLED_BACK_HOLD_PRODUCTION_MJS_MIME`

## Outcome

The company-wide Safety Vote UX flag was deployed from an immutable candidate, but the authenticated Production browser gate failed before application bootstrap. The guarded rollback restored the prior `index.html` byte-exact. Phase 9.6 is not closed as PASS.

The server-side Safety Vote module remains enabled. Phase 7 integrations and all external providers remain disabled. Production contains 39 Safety Vote tables and zero business rows.

## Immutable candidate and local gates

- Commit: `47411cbdd3773e9f2e87472732596178313372f2`
- Tree: `78a0531eece0c04e6a21b8e0a42a483779f23888`
- Runtime allowlist: `index.html` only
- Candidate SHA-256: `cd9afb279fed061816127f21c1fb1a0b8dd916e61f60e02c9c19c7c7c4694871`
- Prior Production SHA-256: `318b240930209d5562e9f401b92b9991ad584b4b0cbb174986c0cf9dd468a110`
- The feature flag is assigned before `main.js`; the strict `=== true` UX gate remains unchanged.
- Phase 9.6 static regression, UX Phase 1–8 contracts, disabled-mode Node/PHP parity and `git diff --check` passed.

## Guarded deployment

Fresh protected preflight verified:

- PHP 7.4.33, configuration and capabilities ready
- 39 Safety Vote tables and 11 permissions
- zero Safety Vote business rows
- `module_enabled=1`
- `phase7_integrations_enabled=0`
- zero configured external providers
- privacy-safe backup/restore and zero helper residue

Remote-before `index.html` matched the expected prior SHA-256 by double download. A checksum-locked one-file rollback package was created and its local non-destructive restore drill passed. The candidate was then uploaded and double-download verified byte-exact.

Deployment evidence: `backups/production/safety-vote-phase96-feature-deploy-20261009062303/`  
Deployment result SHA-256: `dc67d312f40a920a2b15082be15e0b95df456b0ab3927c9ad97045a592a03009`

## Failed browser gate and diagnosis

The GET-only browser harness used the existing bearer without login. It blocked every non-GET application request and did not record the credential, its hash, response bodies or personal data.

Chrome rejected the following imported ES modules because Production returned an empty MIME type for `.mjs` resources:

- `public/js/pages/safety-vote-participation-model.mjs`
- `public/js/pages/safety-vote-journey-model.mjs`
- `public/js/pages/safety-vote-jury-model.mjs`

The failure occurs before `main.js` completes bootstrap (`window.__tshLoginReady` remains false). Consequently the requested Admin/User, viewport, navigation and empty-state assertions cannot run. The same server condition also prevents the rolled-back legacy fallback from being proven through the browser, because the wrapper modules import these `.mjs` dependencies before evaluating the feature flag.

Direct authenticated GET-only checks independently returned `200` with zero rows and `private, no-store, max-age=0` for health, campaigns, user campaigns, nominations, jury assignments and notifications. This proves the server module and read paths remain available, but it does not replace the failed browser gate.

## Automatic rollback and postcheck

The failed gate triggered immediate rollback of `index.html`. Before restoration, the remote file still matched the candidate SHA-256. After restoration, two downloads both matched the prior SHA-256 `318b240930209d5562e9f401b92b9991ad584b4b0cbb174986c0cf9dd468a110`.

Post-rollback evidence:

- Authenticated module-enabled GET smoke: `backups/production/safety-vote-phase95b-enabled-smoke-20261009063226/`, result SHA-256 `5dfc1bdfd47f2011fdb53d5c44b859a140149696cc20e387f3e75c3928b73e35`
- Protected postcheck: `backups/production/safety-vote-phase82-preflight-20261009063228/`
- 39 tables, zero business rows, `module_enabled=1`, integrations/providers disabled, backup restore verified and zero residue

## Constraints honored

No permission change, campaign creation, migration, login, business-data write, email/notification, external delivery or Git push occurred. Phase 9.6 remains HOLD. A separately reviewed remediation must configure the Production web server to serve `.mjs` as JavaScript, then repeat the immutable candidate/deploy/browser/rollback gates under new authorization.
