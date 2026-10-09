# Safety Vote Phase 10.4 — Media links, campaign versioning and post-open edit policy

Date: 2026-10-09
Scope: Local only
Decision: `PASS_LOCAL_MEDIA_VERSIONING_POST_OPEN_POLICY`

## Outcome

Phase 10.4 adds a guarded media-link contract, explicit campaign revision lineage and a fail-closed policy for changes after a campaign opens. No Production connection, migration, deployment, commit or push was performed.

## Media contract

- The Question/Option Card Builder now accepts an optional HTTPS link or video for each option, alongside the existing private image upload.
- Video URLs are limited to YouTube or Vimeo. YouTube is canonicalized to the `youtube-nocookie.com` embed origin.
- The server validates and stores the URL but never fetches external media. The Admin preview and participant page use an explicit user-clicked link with `noopener`, `noreferrer` and `no-referrer`; third-party media is not embedded or loaded automatically.
- URL credentials, HTTP, non-default ports, unsupported video providers, duplicate scope/type entries and unknown question references fail closed.
- `SafetyVote_MediaLinks` uses stable question/option codes so rebuilding questions does not silently attach media to another item.

## Campaign versioning

- `SafetyVote_CampaignVersions` gains `ParentVersionID` and `ChangeReason`.
- Creating a revision clones the current version's metadata, stage shells, eligibility rules, questions/options and media into one offline Draft revision.
- Candidate, jury, election, certifier and assignment configuration is intentionally not copied. Those records can carry person-specific or operational meaning and must be reconfigured and reviewed in the new Draft before readiness can pass.
- Creating or editing the revision does not change `SafetyVote_Campaigns.CurrentVersionID`; current participants remain on the immutable live version.
- Only one non-current Draft revision may exist at a time.
- Revision metadata, builder content and media have version-scoped Admin endpoints with Node/PHP parity.

## Policy after opening

- While `Open`, the live version's questions, options, media, privacy mode, eligibility, schedule and scoring remain immutable. There is no informal “safe metadata” exception.
- An Admin may prepare an offline Draft revision while the current version remains Open.
- Revision activation is denied while Open and for Voided/Archived campaigns.
- Activation requires `SAFETY_VOTE_ADMIN`, the exact phrase `ACTIVATE {CampaignCode} V{VersionNo}`, at least one active question, at least one eligibility rule and zero ballot/participation rows on the target revision.
- Successful activation changes only the current-version pointer and returns the campaign to `Draft`. A fresh readiness review and eligibility freeze are mandatory before it can open again; the previous version and its business records remain unchanged.

## Verification

- `npm run test:safety-vote-phase104`: 26 static/security and Node/PHP service-parity assertions passed.
- `npm run uat:safety-vote-phase104-node-php`: guarded disposable Node and PHP API lifecycles passed, including live-pointer preservation, Open-state denial, exact confirmation and clean activation.
- `npm run test:safety-vote-phase103`: advanced question regression passed.
- `npm run test:safety-vote-phase3-parity` and `npm run uat:safety-vote-phase3-api`: existing 15-type API/parity and browser lifecycle passed.
- `npm run uat:safety-vote-phase101-browser`: authenticated Admin/User/Juror UAT passed at 15 viewport/role combinations, including media preview and version-policy/revision creation. Latest evidence: `backups/local/safety-vote-ux-phase2-1791536189303/`.
- Phase 10.4 Node/PHP evidence: `backups/local/safety-vote-phase104-1791536186765/`.
- Disposable database residue: zero. Production/external delivery/deployment/push: none.

## Production note

The additive migration `backend/migrations/20261009_safety_vote_phase10_4_media_versioning.sql` is required before the new endpoints can be used. Deploying or migrating Production requires a separate guarded release candidate and explicit authorization.
