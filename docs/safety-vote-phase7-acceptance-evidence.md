# Safety Vote SHE Internal Acceptance Evidence

Governance amendment: `2026-10-08-safety-vote-phase8.1-she-governance-r1`

Safety Vote is owned and operated internally by the SHE department. Campaign release therefore requires one explicit, audited SHE owner acceptance rather than six cross-department approvals.

| Required area | Required evidence | Decision | Approver | Evidence reference | SHA-256 | Date |
|---|---|---|---|---|---|---|
| SHE owner | Campaign scope, eligibility, schedule, privacy mode, publication rule and incident owner | Per campaign | SHE Admin | Recorded by the authenticated Safety Vote Admin workflow | Server calculated | Per campaign |

The exact confirmation is `I ACCEPT SHE_OWNER <CAMPAIGN_CODE>`. The runtime stores the authenticated approver, timestamp, statement hash, evidence reference and evidence SHA-256.

Certified Secret Election additionally requires two distinct assigned certifiers bound to the immutable result hash. Dual certification is a technical separation-of-duties control within SHE, not an additional departmental approval.

This governance change does not waive Production engineering gates: immutable source, schema health, permission verification, backup/restore, private storage, clock/time zone, provider configuration and authenticated smoke remain required before deployment.
