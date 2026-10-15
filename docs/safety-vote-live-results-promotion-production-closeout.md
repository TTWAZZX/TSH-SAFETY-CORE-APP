# Safety Vote Live Results and Promotion Production Closeout

Date: 2026-10-15  
Decision: `PASS_SAFETY_VOTE_LIVE_PROMOTION_PRODUCTION_DEPLOYMENT`

## Delivered behavior

- Published promotion banners use their own `StartAt` and `EndAt` window and do not depend on the campaign voting window.
- Eligible users can discover a scheduled campaign and open its details before `OpenAt`, but both the interface and Node/PHP APIs block ballot submission until the voting window opens.
- Admin preview is read-only and can inspect campaign/promotion presentation without being in the frozen voter snapshot.
- Expired promotions and completed campaigns are retained for history; no automatic deletion was introduced.
- Promotion priority is allocated automatically, and saved private desktop/mobile images remain available when reopening a draft.
- Live Results / Live Leaderboard is deployed but remains opt-in and disabled for every existing campaign version.

## Candidate and scope

- Candidate commit: `1e13e68f37e0364dc20872ea827187e75dbdbefb`
- Candidate tree: `a76b18ea42858bf422576a6633a0997761ac985b`
- Baseline runtime: `8dab54553f3f72b5beca2a2a19e837370baa01e4`
- Runtime paths: 20
- Existing runtime paths backed up: 17
- Proven-new runtime paths covered by rollback removal: 3

## Guarded recovery

The first deployment attempt stopped before runtime upload because the migration postcheck included `SafetyVote_Settings` in the business-row total. MySQL had already committed the additive schema and settings update, so the recovery path was deliberately limited to this exact state:

- all six expected Live Results columns present;
- `schema_version=2026-10-15-live-results-r1`;
- `live_results_contract=2026-10-15-safety-vote-live-results-r1`;
- zero campaign versions with Live Results enabled.

The previous settings used by the data-preserving rollback were anchored to the fresh pre-deployment full-database snapshot SHA-256 `ecae75b2f6444650792b5d6b5aeabff90125f41695536e98653f14d35592f87b`. The corrected postcheck excludes control/settings metadata and compares only Safety Vote business rows.

## Verification

- Schema columns before/after recovery: 6 / 6
- Business rows preserved: yes
- Live-enabled campaign versions: 0
- Runtime double-download verification: 20 / 20
- Public HTTPS byte verification: 11 / 11
- Authenticated health: 200, ready
- Authenticated campaign discovery: 200, private/no-store
- Authenticated promotion discovery: 200, private/no-store
- Anonymous health: 401
- Production user-visible campaign rows at postcheck: 0
- Production active/history promotion rows at postcheck: 0 / 0
- External delivery: none
- Permission changes: none
- Business-data mutation by deploy: none

The zero user-visible rows mean the deployed behavior is ready, but Production will not display a banner until an Admin creates/publishes a Production promotion whose own display window is active and whose linked campaign is in a published lifecycle state.

## Rollback and cleanup

- Runtime rollback manifest SHA-256: `6a033addbd3c177896cca3e877a5c47ee5dbf11192b6bfe238beb97ca72745c6`
- Private schema rollback SHA-256: `1e2e8983ac0baeeaf52b5aca7c9a0a3f6f21f438855ff2b722fea721fab2b7a5`
- Direct public access to the private rollback returned 403.
- Root `.htaccess` restored byte-exact SHA-256: `7c648d9a72e469b427cb65e40aff98d329bd2631d5a9fea0dc3787d9b9bb730d`
- Temporary helper, guard and private server-side backup residue: zero

Primary evidence: `backups/production/safety-vote-live-promotion-deploy-20261015134645/`  
Result SHA-256: `108a50fa69d23d9c30ae8f8ec51d12dcc3709021800bdb269c6cec89c33b4286`
