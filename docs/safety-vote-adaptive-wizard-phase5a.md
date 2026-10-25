# Safety Vote Adaptive Wizard and Readiness — Phase 5A

Date: 2026-10-25
Environment: Local loopback only
Decision: `PASS_LOCAL_SAFETY_VOTE_ADAPTIVE_WIZARD_PHASE5A`

## Delivered contract

The Admin Wizard keeps one governed nine-step structure. Steps 4–6 are now resolved from the shared Workflow Profile instead of static generic labels:

| Campaign type | Step 4 | Step 5 | Step 6 | Eligibility required |
| --- | --- | --- | --- | --- |
| Survey | คำถามแบบสำรวจ | กติกาการตอบ | ผู้มีสิทธิ์ตอบ | Yes |
| Popular Vote | รายการสำหรับลงคะแนน | กติกาการลงคะแนน | ผู้มีสิทธิ์ลงคะแนน | Yes |
| Secret Election | บัตรและรายชื่อผู้สมัคร | กติกาการเลือกตั้ง | ผู้มีสิทธิ์เลือกตั้ง | Yes |
| Submission Challenge | แบบฟอร์มและไฟล์ผลงาน | ขั้นตอนตรวจผลงาน | ผู้มีสิทธิ์ส่งผลงาน | Yes |
| Nomination | หมวดและข้อมูลผู้ถูกเสนอ | ขั้นตอนตรวจและยินยอม | ผู้มีสิทธิ์เสนอชื่อ | Yes |
| Jury Scoring | ผลงานที่เข้าประกวด | เกณฑ์ตัดสินและรายชื่อกรรมการ | ผู้ส่งผลงานและผู้เข้าร่วม | Only for `employee_submission` |

Jury `admin_curated` and `imported` profiles skip participant eligibility. Every authenticated employee may still discover and inspect the company-wide campaign; only an active individual Jury assignment grants access to scoring actions. Jury `employee_submission` continues to require eligibility because employees are participants who submit work.

## Authoritative readiness

Browser, Node and PHP consume the same profile decision. Node/PHP activation readiness now additionally verifies:

- active Jury criteria exist;
- criterion weights total exactly 100%;
- active distinct jurors meet the configured `minJurors`;
- eligibility rules, frozen snapshot and non-empty population only when `eligibilityRequired=true`;
- content, option completeness, schedule and production visibility remain required.

The readiness response returns its resolved `workflowProfile`, making the server decision inspectable during Admin UAT.

## Phase boundary

This phase intentionally changes navigation, validation and authoritative readiness only. Until Phase 5B, the Jury content editor still uses the existing question-backed placeholder and the persisted work-source selector is not exposed. Phase 5B owns Work Items, cover/gallery and source persistence; Phase 5C owns the Work × Criteria scoring workspace.

## Verification

- `node backend/scripts/safety-vote-adaptive-wizard-phase5a.test.js`
- `node backend/scripts/safety-vote-workflow-profile-parity.test.js`
- `node backend/scripts/safety-vote-jury-wizard-static.test.js`
- `node backend/scripts/safety-vote-admin-guided-drafts-static.test.js`
- `node backend/scripts/safety-vote-jury-wizard-api-uat.js`
- `node backend/scripts/safety-vote-admin-guided-drafts-browser-uat.js`
- PHP lint: 156 runtime/test PHP files
- PHP 7.4 static compatibility: 156 files

Responsive Browser evidence is retained at `backups/local/safety-vote-admin-guided-drafts-1792931164486/`.

No Production connection, deployment, commit or push was performed.
