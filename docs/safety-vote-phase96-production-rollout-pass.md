# Safety Vote Phase 9.6 Full Core Production Rollout

Date: 2026-10-09  
Decision: `PHASE_9_6_PRODUCTION_ROLLOUT_PASS_INTEGRATIONS_DISABLED`

## Production outcome

Safety Vote full core UX is enabled company-wide in Production. The server-side module remains enabled while Phase 7 integrations and all external providers remain disabled. No campaign or Safety Vote business row exists.

## MIME remediation

The root `.htaccess` was deployed from immutable commit `5a6e6c4daa706647df1036cc65c57c92186d97fb` with a one-path allowlist.

- Deployed `.htaccess` SHA-256: `7c648d9a72e469b427cb65e40aff98d329bd2631d5a9fea0dc3787d9b9bb730d`
- Rollback SHA-256: `21386ca981c822701394382bc71252c2d8e523bd76cc4c4c9820b26c5259e13d`
- All eight `.mjs` probes: `200 application/javascript`
- All eight response bytes matched the locked runtime Git blobs
- Legacy authenticated browser smoke passed before enabling the feature flag

Evidence:

- `backups/production/safety-vote-phase96-mime-deploy-20261009064116/`
- Result SHA-256: `6055b2905b1434ba353e86496055517029b16e37e90383506a5bf9ada6f45135`
- `backups/production/safety-vote-phase96-browser-smoke-20261009064131/`
- Legacy smoke SHA-256: `4f584b20b3c4f47556f3c97ddcf1a2fcf3e942e18359c52cd2a4d5f230b04d48`

## Admin render-target remediation

The first post-flag browser run exposed `TypeError: container.querySelector is not a function` in the Admin Safety Vote UX. The feature `index.html` was immediately rolled back and double-download verified at its prior SHA-256. The MIME correction remained because it had passed independently and was required by the legacy UI.

The correction adds current-request-only `querySelector`, `querySelectorAll` and `addEventListener` proxies to the guarded render target. Superseded render targets still cannot query or overwrite the live DOM.

- Immutable commit: `ec5b8eb9bea0824a90d6bf413805eedb676a87ee`
- Tree: `055f31a29ddaad634d4b2d87187658b1057784ef`
- `public/js/utils/async-ui.js`: `0b5bc2fd28b5709030dafbac3a5af060abfca15d996398f6d85c1e544db87df3`
- `public/js/pages/admin.js`: `6ca5a89aa090d90a55952630f50307b1593c03d262b2310ac20a8c3b7a2ef654`
- Runtime paths uploaded and double-download verified: `2/2`
- Local DOM-proxy/stale-write regression: PASS
- Safety Vote UX Phase 1–8 and disabled-mode parity: PASS

Evidence: `backups/production/safety-vote-phase96-admin-target-deploy-20261009064509/`  
Result SHA-256: `acaa139d0c80a653fd1e37efd64479a8855ae612dd28ca9ed9aa7e8b70cc6e11`

## Feature activation

The company-wide presentation flag was redeployed after the Admin fix passed its gates.

- Immutable feature candidate: `47411cbdd3773e9f2e87472732596178313372f2`
- Runtime allowlist: `index.html` only
- Deployed SHA-256: `cd9afb279fed061816127f21c1fb1a0b8dd916e61f60e02c9c19c7c7c4694871`
- Prior-file rollback SHA-256: `318b240930209d5562e9f401b92b9991ad584b4b0cbb174986c0cf9dd468a110`
- Remote-before, deployed double download and non-destructive rollback drill: PASS

Evidence: `backups/production/safety-vote-phase96-feature-deploy-20261009064530/`  
Result SHA-256: `cff186c2f1897e3699dec021debd98be157d4cd3b903b8a8402d45f5813db1ee`

## Final browser and protected gates

Authenticated GET-only Production browser smoke passed:

- Viewports: 390×844, 430×932, 768×1024, 1366×768 and 1920×1080
- Admin UX, User UX, navigation and empty states: PASS
- Safety Vote API responses observed: `39`, all `200`
- API cache policy: all `private, no-store`
- Anonymous health request: denied `401`
- Console errors: `0`
- Runtime exceptions: `0`
- Horizontal overflow: `0`
- Non-GET Production requests: `0`
- Credential value/hash and response bodies recorded: no

Evidence: `backups/production/safety-vote-phase96-browser-smoke-20261009064544/`  
Result SHA-256: `b36d7606fcb35f99f8e940af07c5a8b6375e942200181b17a7fdce64b0067db9`

Final protected postcheck and enabled-state API smoke confirmed:

- 39 tables and 11 permissions
- zero business rows and zero campaigns
- `module_enabled=1`
- `phase7_integrations_enabled=0`
- zero configured external providers
- privacy-safe backup/restore verified
- `.htaccess` restored byte-exact to the MIME candidate
- zero helper/guard/backup residue
- authenticated health and campaigns: `200`

Evidence:

- `backups/production/safety-vote-phase82-preflight-20261009064602/`
- `backups/production/safety-vote-phase95b-enabled-smoke-20261009064619/`
- Enabled-state API result SHA-256: `0984c9aee89f136d6688e57e028ce45d6fba58a72528f3b7f708e59743f4cb88`

## Constraints honored

No login, migration, permission change, campaign creation, Safety Vote business-data write, email/notification, external integration enablement, external delivery or Git push occurred. The unrelated Patrol test modification remained untouched.
