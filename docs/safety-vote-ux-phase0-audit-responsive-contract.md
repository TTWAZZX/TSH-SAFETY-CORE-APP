# Safety Vote UX/UI Phase 0 — UX Audit and Responsive Design Contract

Date: 2026-10-08 (Asia/Bangkok)

Contract version: `2026-10-08-safety-vote-ux-phase0-r1`

Scope: local read-only source/UI audit and design specification only

Decision: **PHASE 0 CONTRACT COMPLETE / HOLD FOR RUNTIME IMPLEMENTATION**

## 1. Executive outcome

Phase 0 defines the production-facing information architecture, wording, responsive layout, mobile-first flows, role navigation, campaign-adaptive workspace, shared components, accessibility acceptance criteria and authenticated UAT matrix for Safety Vote.

No Runtime, API, database, schema, configuration, business data or authentication data was changed. No server, database, Production connection, deployment, commit or push was used.

The source audit found an important baseline constraint: the current `main` snapshot at commit `aa270b0` does not contain a registered Safety Vote page, frontend module, backend route, PHP handler, migration or explicit Safety Vote/Juror/Ballot contract. Therefore:

- the existing TSH Safety Core shell and Admin conventions were audited from source;
- the requested Safety Vote experience is fully specified as the Phase 1 implementation contract;
- current Safety Vote Admin/User/Juror screens cannot truthfully receive a visual or authenticated PASS in this repository snapshot; and
- Phase 1 must first locate or import the authoritative Safety Vote baseline. It must not create a second, conflicting voting engine from assumptions.

## 2. Evidence and audit boundary

### 2.1 Repository evidence

- Branch: `main`, aligned with `origin/main` at audit start.
- Commit: `aa270b0` (`Document Johnny Phase 8 production releases`).
- Working tree at audit start: clean.
- Existing module registry: 21 entries in `public/js/module-meta.js`; Safety Vote is not registered.
- Existing route switch: `public/js/main.js:837-900`; no Safety Vote case exists.
- Existing page containers: `index.html:698-728`; no Safety Vote page container exists.
- Existing top-level role handling is binary Admin/non-Admin in `public/js/main.js:381-430` and `public/js/main.js:856-859`; no Juror navigation state exists.
- No matching Safety Vote, ballot, juror, eligibility-freeze or certified-report implementation was found in tracked JavaScript, PHP, HTML, SQL, Markdown or JSON across local and remote refs available to the audit.

### 2.2 Current shell strengths to retain

- The global app shell already uses a 256 px collapsible desktop sidebar and a mobile drawer (`index.html:554-681`).
- Main content already prevents page-level horizontal overflow (`index.html:698`, `public/style.css:1-7`).
- The shell changes navigation behavior at 768 px and closes the drawer after mobile navigation (`public/js/main.js:799-805`).
- The shared form controls have visible focus treatment (`public/style.css:39-43`).
- A shared modal container and mobile bottom navigation already exist (`index.html:740-782`).
- Some recent workspaces already demonstrate a full-screen mobile panel, safe-area handling and reduced-motion support (`public/style.css:786-851`).

### 2.3 Current-state findings

| ID | Priority | Finding | UX impact | Phase 1 response |
|---|---:|---|---|---|
| SV-00 | Blocker | Safety Vote Runtime/UI is absent from the audited source snapshot. | Admin/User/Juror current screens cannot be authenticated or visually verified. | Locate the authoritative baseline before implementation; stop on ambiguity. |
| SV-01 | P0 | There is no Juror role or assignment-aware navigation in the current app shell. | A judge could be shown no workspace or, worse, an Admin/User surface. | Add a scoped capability model; never infer Juror from client state alone. |
| SV-02 | P0 | Current top-level navigation relies mainly on `isAdmin`; unauthorized Admin routing uses native `alert()`. | Role feedback is disruptive and does not provide a recoverable destination. | Use an accessible denied-state panel and server-verified capabilities. |
| SV-03 | P0 | Safety Vote has no campaign-type capability contract. | Irrelevant controls such as Jury or Dual Certification can appear for the wrong campaign. | Render navigation and actions from server-returned campaign capabilities. |
| SV-04 | P1 | Existing Admin uses mixed technical wording including `System Console`, `DB Schema`, `Auth Configuration`, `Phase` identifiers and English-only Audit filters. | Daily operational tasks read like an engineering console. | Keep technical diagnostics in advanced “สถานะระบบ”; use production wording everywhere else. |
| SV-05 | P1 | Existing Admin tabs use a horizontally scrolling rail. | A 12-section Safety Vote Admin rail would be hard to scan and overflow on mobile. | Use grouped left navigation on desktop and a labeled section drawer on mobile. |
| SV-06 | P1 | Existing Admin content is full width, but several operational tables use large fixed minimum widths and horizontal scrolling. | Campaign management becomes spreadsheet-like and unusable on phones. | Provide desktop table/master-detail and a semantic mobile-card alternative. |
| SV-07 | P1 | Native `prompt()` and `confirm()` patterns exist elsewhere in the application. | Destructive and irreversible voting actions lack consistent context, focus management and validation. | Safety Vote must use shared Confirm Dialog/Reason Dialog components only. |
| SV-08 | P1 | No Safety Vote empty, loading, retry, stale or partial-success states exist. | First-use and slow-network behavior are undefined. | Implement explicit state components before live operations. |
| SV-09 | P0 | No authenticated Safety Vote UAT evidence exists for Admin, User or Juror. | Privacy, immutable-ballot and permission regressions remain unproven. | Execute the matrix in section 14 before enabling the feature flag. |

### 2.4 Audit status by role

| Role | Source presence | Visual audit | Authenticated audit | Phase 0 disposition |
|---|---|---|---|---|
| Admin | Global Admin shell only; no Safety Vote page | Partial shell audit only | Not testable | Contract defined; implementation/UAT pending |
| User | Global User shell only; no Safety Vote page | Partial shell audit only | Not testable | Contract defined; implementation/UAT pending |
| Juror | No explicit role/navigation | Not testable | Not testable | New scoped experience required |

“Not testable” is not a failure and is not recorded as a PASS. It is a release blocker until the authoritative Runtime exists and authenticated evidence is captured.

## 3. Product principles and invariants

1. **Business task first.** Users see what they need to do, by when, and what happens next. Phase, contract, schema and internal identifiers are not primary copy.
2. **One campaign, one workspace.** Selecting a campaign enters a campaign-scoped workspace; the user does not manage all campaign concerns on one long page.
3. **Capabilities, not cosmetic hiding.** Server authorization is the source of truth. Hidden navigation never substitutes for permission checks.
4. **Type-adaptive experience.** Navigation, fields, results and actions are derived from campaign type and lifecycle.
5. **Mobile is an acceptance target in every phase.** Mobile behavior is designed alongside desktop behavior, not deferred.
6. **Safe irreversible actions.** Opening, closing, publishing results, certifying results and final submission require contextual confirmation and duplicate-submit protection.
7. **Privacy by default.** Secret-election choices and blind-judging identities are never exposed in receipts, logs, accessible names, DOM attributes, exports or client caches.
8. **Status is never color-only.** Every badge has Thai text, icon/shape where useful and an accessible name.
9. **Operational and technical data are separate.** Daily Admin pages contain business health; implementation diagnostics live in advanced “สถานะระบบ”.
10. **No horizontal page scroll.** Dense desktop tables have responsive alternatives rather than forcing the whole page sideways.

## 4. Information architecture

### 4.1 Admin root: “จัดการ Safety Vote”

The Admin landing page is an operational center, not a configuration dump.

1. **ภาพรวม Safety Vote** — KPI, urgent warnings, readiness and shortcuts.
2. **รายการแคมเปญ** — search, filter, sort, Active/Draft/Scheduled/Completed/Archived views.
3. **สร้างแคมเปญ** — templates and eight-step setup wizard.
4. **เนื้อหาแคมเปญ** — questions, options, candidates or submission requirements, depending on type.
5. **ผู้มีสิทธิ์** — audience rules, preview, validation and frozen eligibility list.
6. **กำหนดการ** — opening, closing, result-release and reminder timing.
7. **ผลงานและการเสนอชื่อ** — only when the selected campaign supports submission or nomination.
8. **คณะกรรมการตัดสิน** — only when jury scoring is enabled.
9. **การเข้าร่วม** — turnout/progress without exposing protected choices.
10. **ผลลัพธ์และการรับรอง** — availability depends on type, status and certification requirements.
11. **รายงานและบันทึกตรวจสอบ** — business-readable reports and audit trail.
12. **การเชื่อมต่อระบบ** — approved integrations and export jobs.
13. **สถานะระบบ** — advanced Admin only; contracts, schema readiness, integration diagnostics and technical versions.

The first 12 entries are not required to appear simultaneously. Root navigation shows stable business groups; campaign-local navigation is reduced by capability rules in section 7.

### 4.2 User navigation

1. **แคมเปญของฉัน** — eligible, upcoming and completed campaigns.
2. **งานที่ต้องทำ** — vote, survey, submit, nominate or consent actions.
3. **ผลงาน/การเสนอชื่อของฉัน** — only if applicable.
4. **หลักฐานการส่ง** — receipts without secret choices.
5. **ผลที่ประกาศแล้ว** — only results authorized for the user and lifecycle.

User navigation must never show Admin setup, raw turnout by identity, Juror tools, certification controls or technical status.

### 4.3 Juror navigation

1. **งานให้คะแนนของฉัน** — assigned campaigns and deadlines.
2. **รอตรวจ** — filterable scoring queue.
3. **ฉบับร่าง** — locally recoverable/server-persisted draft scores as authorized.
4. **ส่งแล้ว** — immutable submitted scores and receipt/status.
5. **เกณฑ์การให้คะแนน** — read-only rubric and conflict/privacy guidance.

Jurors see assigned entries only. Blind judging removes submitter identity and identity-derived metadata from visible content, accessible labels, download names and API responses.

### 4.4 Advanced Admin boundary

The “สถานะระบบ” entry is visible only to a separately authorized advanced/system administrator. It may contain contract version, schema readiness, job health and integration diagnostics. It must not be mixed into campaign setup, daily monitoring or User/Juror views.

## 5. Admin landing-page contract

The first Safety Vote Admin screen uses full working width and the following order:

1. Compact title row: “จัดการ Safety Vote”, one-line status summary and primary “สร้างแคมเปญ” action.
2. KPI row: ฉบับร่าง, เปิดอยู่, ใกล้ปิด, ปิดแล้ว. KPI cards act as filters and expose text equivalents.
3. Attention panel: incomplete setup, eligibility errors, schedule conflicts, failed jobs or pending certification.
4. Search/filter/sort toolbar.
5. Segmented views: กำลังเปิด, ฉบับร่าง, ตั้งเวลาแล้ว, เสร็จสิ้น, เก็บเข้าคลัง.
6. Campaign content:
   - desktop: table or master-detail with collapsible campaign rail;
   - tablet: compact list plus detail canvas;
   - mobile: campaign cards, never a squeezed desktop table.
7. Empty state: explanation plus “สร้างแคมเปญแรก”.

Every campaign row/card shows title, type, lifecycle status, schedule, eligibility readiness, participation summary, unresolved warning count and the next recommended action. Secondary actions are ดูรายละเอียด, ทำสำเนา and เก็บเข้าคลัง. Destructive actions are separated visually and require confirmation.

## 6. Responsive layout contract

### 6.1 Breakpoints

| Token | Viewport | Required behavior |
|---|---:|---|
| `compact` | 0–479 px | Single column, edge-safe 16 px gutters, mobile cards, bottom sticky actions |
| `wide-phone` | 480–767 px | Single column; two-column micro-metrics allowed only when labels remain intact |
| `tablet` | 768–1023 px | Global sidebar follows existing shell; campaign rail becomes a drawer/switcher |
| `desktop` | 1024–1439 px | Full-width canvas; optional collapsible campaign rail; no centered max-width wrapper |
| `wide` | 1440 px and above | Expanded master-detail; optional contextual right panel; readable line-length applied to prose only |

The mandatory acceptance viewports are `390×844`, `430×932`, `768×1024`, `1366×768` and `1920×1080`.

### 6.2 Desktop geometry

- Preserve the existing global app sidebar behavior.
- Safety Vote owns the entire remaining `main-content` width using `w-full`, `min-width: 0` and no page-level `max-width`.
- Page padding: 16 px compact, 20 px tablet, 24 px desktop/wide.
- Compact page header: target 56–64 px excluding wrapped warning content.
- Campaign rail: 280–320 px expanded, 56–64 px collapsed; user-controlled state may persist per device.
- Primary content: `minmax(0, 1fr)`; cards and tables must shrink without page overflow.
- Optional detail/inspector panel: 320–360 px only at `wide`, never at the cost of a primary content width below 640 px.
- Prose/form step content may use a readable inner width of 720–880 px, but dashboards, tables and galleries remain full-canvas.

### 6.3 Mobile geometry

- Campaign rail becomes a modal drawer opened by a labeled “เลือกแคมเปญ” control.
- Workspace section navigation becomes a section drawer or native-width menu; it must not be an unlabeled horizontal icon strip.
- Tables become cards with the same data meaning and available actions.
- Sticky action bar respects `env(safe-area-inset-bottom)` and the existing bottom navigation.
- Primary actions are reachable with one hand and remain at least 44×44 px.
- Modals become near-full-screen sheets when content cannot fit comfortably; focus remains trapped and returns to the trigger.
- No fixed pixel content width, clipped label or horizontal page scroll is allowed at 320 px minimum resilience width.

### 6.4 Density and hierarchy

- Operational pages use compact headers and 16–24 px section gaps.
- Business status and recommended next action appear above implementation metadata.
- Long descriptions collapse behind “ดูรายละเอียด”; critical privacy or irreversible-action warnings never collapse by default.
- Filter controls wrap into a vertical mobile sheet rather than shrinking below usable width.

### 6.5 Responsive workspace wireframes

Desktop/wide:

```text
┌ Global nav ┬ Safety Vote header: จัดการ Safety Vote                  ┐
│            ├──────────────────────────────────────────────────────────┤
│            │ KPI row + attention/readiness notices                   │
│            ├───────────────┬──────────────────────────────────────────┤
│            │ Campaign rail │ Search / filters / view / primary action│
│            │ 280–320 px    ├──────────────────────────────────────────┤
│            │ collapsible   │ Full-width table or master-detail       │
│            │               │ minmax(0, 1fr), no centered max-width    │
│            └───────────────┴──────────────────────────────────────────┤
└────────────┴──────────────────────────────────────────────────────────┘
```

Tablet:

```text
┌ Global nav/header ────────────────────────────────────────────────────┐
│ [เลือกแคมเปญ]  Campaign title/status                    [Primary]    │
├───────────────────────────────────────────────────────────────────────┤
│ KPI/summary cards                                                     │
│ Wrapped toolbar                                                       │
│ Compact list + detail canvas                                          │
│ Campaign list opens as a focus-trapped drawer                         │
└───────────────────────────────────────────────────────────────────────┘
```

Phone:

```text
┌ compact header ─────────────────────────┐
│ [←] จัดการ Safety Vote        [+ สร้าง]│
├─────────────────────────────────────────┤
│ Single-column KPI/cards                 │
│ Search + filter sheet trigger           │
│ Campaign cards / one wizard step        │
│ No table squeeze or horizontal scroll   │
├ sticky action bar + safe area ──────────┤
└─────────────────────────────────────────┘
```

## 7. Campaign-type adaptive workspace

### 7.1 Campaign types

| Key | Production label | Core interaction |
|---|---|---|
| `survey` | แบบสำรวจความคิดเห็น | Answer one or more questions |
| `popular_vote` | โหวตยอดนิยม | Select an option/candidate; identity and count visibility follow policy |
| `secret_election` | เลือกตั้งแบบลับ | Cast an immutable private ballot; choice never appears in receipt |
| `submission_challenge` | ส่งผลงานเข้าร่วม | Create a submission, pass review and optionally enter jury scoring |
| `nomination` | เสนอชื่อบุคคล/ผลงาน | Nominate, obtain consent when required and review nominees |
| `judged_contest` | การประกวดโดยคณะกรรมการ | Review assigned entries and score against a rubric |

### 7.2 Workspace capability matrix

Legend: `R` required, `O` optional when configured, `—` hidden.

| Workspace section | Survey | Popular Vote | Secret Election | Submission Challenge | Nomination | Judged Contest |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| ภาพรวม | R | R | R | R | R | R |
| เนื้อหา | R | R | R | R | R | R |
| ผู้มีสิทธิ์ | R | R | R | R | R | R |
| กำหนดการ | R | R | R | R | R | R |
| การเข้าร่วม | R | R | R | R | R | R |
| ผลงาน | — | O | — | R | — | R |
| การเสนอชื่อ/Consent | — | — | O | — | R | — |
| ตรวจผลงาน/ผู้สมัคร | — | O | O | R | R | R |
| คณะกรรมการ | — | — | — | O | O | R |
| ผลลัพธ์ | O | R | R, hidden until close | R | R | R |
| การรับรองผลสองคน | — | — | O/R by policy | O | O | O |
| รายงาน | R | R | R | R | R | R |
| Audit | R | R | R | R | R | R |

Hard rules:

- Survey never shows Jury navigation.
- Popular Vote never shows Dual Certification.
- Secret Election never reveals interim choices/results before the configured close and release gates.
- Submission Challenge shows Submission Review.
- Nomination shows Consent and Nominee Review when configured.
- A section with capability `false` is absent from navigation, direct routing returns a safe unavailable state, and the API denies access.
- Campaign type becomes immutable after the first participation record unless an explicitly designed, audited migration exists.

### 7.3 Lifecycle states

Canonical internal states may remain English in data contracts, but production labels are:

| State | Production label | Primary Admin action |
|---|---|---|
| `draft` | ฉบับร่าง | ตั้งค่าต่อ |
| `scheduled` | ตั้งเวลาแล้ว | ตรวจความพร้อม |
| `open` | เปิดรับการเข้าร่วม | ติดตามการเข้าร่วม |
| `paused` | หยุดชั่วคราว | ตรวจสอบและเปิดต่อ |
| `closed` | ปิดรับแล้ว | ตรวจผล/เตรียมรับรอง |
| `pending_certification` | รอรับรองผล | ส่งให้ผู้รับรอง |
| `certified` | รับรองผลแล้ว | เผยแพร่รายงาน |
| `completed` | เสร็จสิ้น | ดูผลและรายงาน |
| `archived` | เก็บเข้าคลัง | ดูข้อมูลย้อนหลัง |

Transitions are server-controlled. The UI shows why an action is unavailable and which readiness item must be resolved.

## 8. Mobile-first wireflows

### 8.1 Admin campaign center

```text
[จัดการ Safety Vote]                [+ สร้าง]
[ฉบับร่าง 3] [เปิดอยู่ 2]
[ใกล้ปิด 1] [ปิดแล้ว 12]
[ค้นหาแคมเปญ................]
[ตัวกรอง] [เรียงตาม ▾]

┌ Campaign card ───────────────────┐
│ โหวตภาพความปลอดภัยประจำเดือน    │
│ โหวตยอดนิยม · เปิดอยู่            │
│ ปิด 10 ต.ค. 16:30                │
│ ผู้มีสิทธิ์พร้อม · เข้าร่วม 68%   │
│ [ดูรายละเอียด]          [⋯]       │
└──────────────────────────────────┘

[Bottom navigation / safe area]
```

Flow: land → select KPI/filter → open campaign card → enter campaign workspace → take recommended action → return with filters preserved.

### 8.2 Campaign setup wizard

```text
[←] สร้างแคมเปญ             ขั้น 2 จาก 8
[progress bar + step title]

ข้อมูลทั่วไป
[ชื่อแคมเปญ________________]
[คำอธิบาย__________________]
[ภาพปก / preview]

บันทึกอัตโนมัติแล้ว 14:32

┌ sticky safe action bar ──────────┐
│ [ย้อนกลับ]              [ถัดไป] │
└──────────────────────────────────┘
```

The eight steps are:

1. ประเภทแคมเปญ
2. ข้อมูลทั่วไป
3. ความเป็นส่วนตัว
4. คำถาม ตัวเลือก ผู้สมัคร หรือข้อกำหนดผลงาน
5. ผู้มีสิทธิ์
6. กำหนดเวลา
7. การแสดงผลและประกาศผล
8. ตรวจสอบและเปิดใช้งาน

Rules:

- Auto-save communicates “กำลังบันทึก”, “บันทึกแล้ว”, “ยังไม่ได้บันทึก” and recoverable “บันทึกไม่สำเร็จ — ลองอีกครั้ง”.
- Moving between steps validates only blocking requirements for that step; the readiness checklist validates the complete campaign.
- Preview uses the real User/Juror presentation contract, not an Admin-only approximation.
- Advanced settings are collapsed, labeled and never contain required setup without an explicit warning.
- Open/close/publish/certify use accessible confirm dialogs, never native `prompt()`.

### 8.3 User participation

```text
[← แคมเปญของฉัน]
[cover image]
ชื่อแคมเปญ                     [เปิดอยู่]
คุณมีสิทธิ์ · ปิด 10 ต.ค. 16:30
[privacy / editability notice]

[question / candidate / gallery]
[44 px minimum selection controls]

[ตรวจคำตอบ]
      ↓
[review summary + privacy warning]
[ยืนยันส่ง]
      ↓
[receipt ID + timestamp]
[ไม่แสดงตัวเลือกสำหรับ Secret Election]
```

Gallery images support portrait and landscape, open into a keyboard-accessible full-screen viewer and never make image orientation alter selection semantics.

### 8.4 Juror scoring

```text
[งานให้คะแนนของฉัน]
ประกวดภาพความปลอดภัย        7/20 ส่งแล้ว
[ค้นหา] [สถานะ ▾] [เรียง ▾]

[Entry 008 · ไม่แสดงผู้ส่ง]
[preview]
ความปลอดภัย      [1 2 3 4 5]
ความคิดสร้างสรรค์ [1 2 3 4 5]
[หมายเหตุ___________________]

บันทึกร่างแล้ว
[รายการก่อนหน้า] [บันทึกร่าง] [ถัดไป]

[ส่งคะแนนทั้งหมด]
→ warning: ส่งแล้วแก้ไขไม่ได้
→ confirm dialog
→ receipt/progress state
```

Scoring controls are operable by touch, keyboard and screen reader. The currently selected score is announced; no identity is leaked in blind mode.

## 9. Production wording contract

The left column may remain in engineering documents and system diagnostics. The right column is required for daily UI.

| Avoid in daily UI | Production wording |
|---|---|
| Safety Vote Administration | จัดการ Safety Vote |
| Campaign Dashboard | ภาพรวมแคมเปญ |
| Campaign List | รายการแคมเปญ |
| Phase 2 / Phase 4 | ขั้นตอนปัจจุบัน or the actual task name |
| Contract | ข้อกำหนดระบบ; show only in สถานะระบบ |
| Schema / DB Schema | โครงสร้างข้อมูล; show only in สถานะระบบ |
| Eligibility Freeze | ยืนยันรายชื่อผู้มีสิทธิ์ |
| Question Builder | คำถามและตัวเลือก |
| Lifecycle | สถานะแคมเปญ |
| Result Snapshot | ชุดผลการลงคะแนน |
| Certified Report | รายงานผลที่รับรองแล้ว |
| Submission | ผลงานที่ส่ง |
| Nomination | การเสนอชื่อ |
| Consent | การยินยอมรับการเสนอชื่อ |
| Jury / Juror | คณะกรรมการตัดสิน / ผู้ให้คะแนน |
| Blind judging | การตัดสินแบบไม่แสดงข้อมูลผู้ส่ง |
| Dual Certification | การรับรองผลโดยผู้ตรวจสอบ 2 คน |
| Publish results | ประกาศผล |
| Open campaign | เปิดรับการเข้าร่วม |
| Close campaign | ปิดรับการเข้าร่วม |
| Duplicate | ทำสำเนา |
| Archive | เก็บเข้าคลัง |
| Audit Log | บันทึกตรวจสอบ |
| Failed Only | เฉพาะรายการไม่สำเร็จ |
| Retry | ลองอีกครั้ง |
| Empty | ยังไม่มีข้อมูล |
| Immutable ballot | ส่งแล้วแก้ไขตัวเลือกไม่ได้ |
| System Console | สถานะระบบ, when it truly contains technical diagnostics |

Copy rules:

- Button labels start with a clear verb: สร้าง, บันทึก, ตรวจสอบ, เปิด, ปิด, ประกาศ, รับรอง.
- Error messages state what happened, whether data was saved and the next safe action.
- Privacy copy is explicit, short and adjacent to the decision point.
- Internal IDs appear only in details/receipts when useful for support, never as the primary title.
- English may appear in parentheses only where the organization relies on the term; Thai remains primary.

## 10. Shared component inventory

| Component | Required states/behavior |
|---|---|
| App/module header | Compact, role label, page title, primary action, no engineering subtitle |
| Campaign rail/drawer | Search, status grouping, collapse/expand, current campaign, focus restoration |
| Section navigation | Capability-filtered, active state, warning count, keyboard operable |
| KPI card | Value, label, trend/context, clickable filter state, text alternative |
| Status badge | Thai label, semantic tone, icon/text, not color-only |
| Campaign table/card | Same content semantics, desktop/mobile presentation variants |
| Wizard stepper | Current/completed/error states; compact mobile progress |
| Auto-save indicator | Saving/saved/unsaved/error/offline; polite live announcement |
| Readiness checklist | Blocking vs warning items, deep link to correction step |
| Eligibility summary | Rule summary, matched count, excluded count, freeze status |
| Question/option editor | Reorder, validation, preview and accessible labels |
| Candidate/submission card | Responsive media, metadata, selected/focus/disabled states |
| Scoring control | Touch/keyboard/screen-reader input, draft state, rubric help |
| Progress indicator | Completed/total and text, not a progress bar alone |
| Timeline | Current event, next event, timezone and past/future semantics |
| Filter/search toolbar | Applied-filter count, clear all, mobile filter sheet |
| Confirm dialog | Consequence, campaign name, primary/secondary action, focus trap/restore |
| Reason dialog | Validated textarea, required/optional state, no native `prompt()` |
| Receipt | Reference, timestamp, status, safe next step; no secret choice |
| Empty state | Cause-specific explanation and one useful action |
| Loading skeleton | Matches final layout; announced once; no focus theft |
| Retry/error state | Plain-language cause, retry, alternate route/support reference |
| Toast/live region | Non-blocking status, deduplicated, never sole evidence of completion |
| Media viewer | Full-screen, zoom/fit, caption, Escape/close, focus restoration |
| Sticky action bar | Primary/secondary actions, safe area, duplicate-submit lock |
| Activity log | Business-readable actor/action/time; technical detail expandable |

Components must use a shared state and token vocabulary. Phase 1 must not create campaign-specific one-off buttons, badges or dialogs when a listed component applies.

## 11. Role and action visibility

Client visibility is only presentation; every action also requires server authorization.

| Action | Admin | User | Juror |
|---|:---:|:---:|:---:|
| View campaign list | All within Admin scope | Eligible/visible only | Assigned only |
| Create/edit draft | Yes | No | No |
| Configure eligibility/schedule | Yes | No | No |
| Freeze eligibility | Authorized Admin only | No | No |
| Open/close campaign | Authorized Admin only | No | No |
| Vote/answer survey | Only through a separate eligible User context if policy allows | Eligible only | Only if separately eligible; never because Juror |
| Submit work/nomination | No Admin impersonation | Eligible only | No, unless separately eligible in User context |
| Review submissions/nominees | Authorized reviewer | Own status only | Assigned blind/read-only context as configured |
| Score entries | No, unless explicitly assigned Juror capability | No | Assigned entries only |
| View turnout | Aggregated authorized scope | Own participation state | Own progress only |
| View protected interim results | Only when policy explicitly allows | No | No |
| Certify results | Named certifier capability only | No | No |
| View audit | Authorized Admin/auditor | Own receipts only | Own submission receipts only |
| View system status | Advanced Admin only | No | No |

Conflicting roles are additive only after server evaluation. The UI must clearly indicate the current workspace context and never assume Admin can bypass ballot privacy.

## 12. Accessibility and inclusive design acceptance

The target is WCAG 2.2 AA for Safety Vote screens.

### 12.1 Required criteria

- All functionality is keyboard operable with a logical focus order.
- Visible focus has at least a 2 px high-contrast indicator and is never clipped by overflow containers.
- Touch targets are at least 44×44 CSS px; adjacent destructive and primary targets have safe separation.
- Text and meaningful UI components meet WCAG AA contrast; status is not conveyed by color alone.
- Headings form a logical hierarchy with one page-level heading.
- Icon-only controls have accessible names; decorative SVGs/images are hidden from assistive technology.
- Form fields have persistent labels, instructions and programmatically associated errors.
- Error summary focuses after failed final validation and links to each invalid field.
- Dialogs expose name/description, trap focus, close with Escape when safe and restore focus.
- Dynamic save/progress/error updates use appropriate polite/assertive live regions without repeated chatter.
- Tables use headers and captions on desktop; mobile cards retain field labels and reading order.
- Reordering never depends only on drag; keyboard move controls are available.
- Media has useful alt text or is marked decorative. Gallery orientation never clips essential content.
- Motion respects `prefers-reduced-motion`; no essential meaning relies on animation.
- At 200% text zoom and 320 CSS px width, content reflows without loss or two-dimensional page scroll.
- Thai and English mixed content retains correct language metadata where screen-reader pronunciation materially changes.

### 12.2 Privacy accessibility

- Screen-reader text must not reveal hidden candidate choices, submitter identity or secret result values.
- Accessible names, `title`, `alt`, hidden DOM nodes and download filenames follow the same redaction policy as visible UI.
- Receipts confirm successful participation without restating a Secret Election choice.

## 13. Reliability and state behavior

- Every mutating action has an idempotency/duplicate-submit guard and a disabled busy state.
- Slow-network testing covers skeleton, delayed save, retry, timeouts and returning online.
- Draft recovery distinguishes local unsaved input from server-saved draft.
- Partial success names what succeeded and what remains; it never invites a duplicate final submission.
- Stale row/version conflicts show a refresh-and-review path rather than silently overwriting.
- Image loading uses size limits, responsive containment, skeleton/error fallback and no layout-breaking intrinsic width.
- Leaving a dirty step prompts with an accessible dialog only when recovery is not guaranteed.
- Back/refresh/deep-link behavior preserves authorization and never exposes a disabled campaign section.

## 14. Authenticated UAT matrix

The matrix is a release gate for each implementation phase. Tests use scoped disposable/local data unless a separate Production authorization explicitly says otherwise.

### 14.1 Viewport matrix

| Viewport | Admin | User | Juror | Mandatory assertions |
|---:|:---:|:---:|:---:|---|
| 390×844 | Required | Required | Required | One-column flow, drawer/sheet, sticky actions, safe area, 44 px targets, no horizontal page scroll |
| 430×932 | Required | Required | Required | Long Thai labels, card gallery, keyboard-open sheet, no clipping |
| 768×1024 | Required | Required | Required | Tablet campaign drawer, stable main canvas, touch/keyboard parity |
| 1366×768 | Required | Required | Required | Compact header, full-width workspace, campaign rail, no vertical action loss |
| 1920×1080 | Required | Required | Required | Master-detail density, no excessive centered whitespace, readable prose width |

### 14.2 Role journeys

| ID | Role | Journey | Expected result |
|---|---|---|---|
| A01 | Admin | No campaigns | Helpful empty state and “สร้างแคมเปญแรก” |
| A02 | Admin | Search/filter/sort and restore list state | Deterministic results; state retained after returning from campaign |
| A03 | Admin | Complete all eight wizard steps | Auto-save, preview and readiness checklist are coherent |
| A04 | Admin | Attempt opening incomplete campaign | Blocked with linked readiness issues; no mutation |
| A05 | Admin | Open, close and publish through dialogs | Exact consequence shown; duplicate click cannot duplicate transition |
| A06 | Admin | Switch across all campaign types | Only applicable workspace sections/actions appear |
| A07 | Admin | Freeze eligibility | Count/rule summary confirmed; later restrictions are explicit |
| A08 | Admin | View turnout and reports | No protected choices or blind identities leak |
| A09 | Admin | Access advanced system status without capability | Denied safely; no menu or data leakage |
| U01 | User | Eligible open campaign | Clear eligibility, deadline, privacy and next action |
| U02 | User | Ineligible/upcoming/closed campaign | Cause-specific non-actionable state; no disabled mystery button |
| U03 | User | Review and submit vote/survey | Review screen, final confirmation and receipt |
| U04 | User | Secret Election receipt/history | Receipt contains no choice; refresh/back does not reveal choice |
| U05 | User | Submission/nomination draft and recovery | Draft restored without duplicate final submission |
| U06 | User | Large portrait/landscape gallery | Fit/full-screen/keyboard behavior passes without overflow |
| J01 | Juror | Assigned queue search/filter | Only assigned entries; accurate completed/total progress |
| J02 | Juror | Save draft scores and resume | Draft state retained; validation is understandable |
| J03 | Juror | Submit final score | Irreversible warning, confirmation, receipt and edit lock |
| J04 | Juror | Blind judging | Submitter identity absent from visible and accessibility surfaces |
| J05 | Juror | Direct-link unassigned entry | Server denial and safe route; zero content flash |
| R01 | Cross-role | Admin/User/Juror session switch/logout | In-memory campaign/choice/score data is cleared |
| R02 | Cross-role | Keyboard-only complete journey | No keyboard trap; logical focus; dialogs restore focus |
| R03 | Cross-role | Screen-reader landmark/form/dialog pass | Names, roles, states and updates are announced correctly |
| R04 | Cross-role | Slow/offline/timeout and retry | No data loss, duplicate submission or false success |
| R05 | Cross-role | 200% zoom and long Thai/English content | Reflow passes without clipped action/content |

### 14.3 Campaign-type regression

- Survey: Jury absent; multi-question completion and results policy pass.
- Popular Vote: Dual Certification absent; candidate/gallery choice and results timing pass.
- Secret Election: interim result and receipt privacy pass; ballot immutability passes.
- Submission Challenge: draft, upload/media, Submission Review and jury handoff pass.
- Nomination: nominee search, consent and Nominee Review pass.
- Judged Contest: blind queue, rubric, draft score and immutable final score pass.

### 14.4 Evidence required per run

- authenticated role and capability fixture, with secrets suppressed;
- viewport and browser name/version;
- screenshots of landing, primary task, dialog, success/receipt and denied state;
- console/API failure summary;
- overflow/touch-target/accessibility assertions;
- mutation ledger and cleanup counts;
- explicit privacy assertions for secret ballot and blind judging;
- zero residual disposable campaign, ballot, nomination, submission, score and certification records after cleanup.

## 15. Feature flag and rollout contract

Phase 1 should introduce the UI behind a dedicated flag such as `safetyVoteUxV1`, default OFF outside authorized local/test environments.

- OFF: the existing application and voting behavior remain unchanged.
- ON for authorized testers: new navigation and presentation are available only when matching APIs/capabilities exist.
- The flag must not weaken API authorization or ballot/certification invariants.
- Rollback disables the new UI without deleting campaign, ballot, submission, score or audit data.
- No Production enablement, deployment, commit or push is implied by this contract.

## 16. Phase 1 implementation boundary

### 16.1 In scope

- locate and verify the authoritative Safety Vote Runtime/source baseline;
- register a feature-flagged Safety Vote module only after the baseline is confirmed;
- implement the responsive module shell and role-aware navigation scaffold;
- implement Admin operational landing, campaign list, KPI/filter/search/sort, desktop table/master-detail and mobile campaign cards;
- implement loading, empty, retry, denied and first-campaign states;
- apply the production wording and shared component primitives defined here;
- add static/unit/browser contract checks at all five required viewports.

### 16.2 Out of scope

- changing ballot, privacy, eligibility, certification or result-calculation behavior;
- inventing new API/schema contracts when the authoritative baseline is unavailable;
- Production deployment or feature enablement;
- database migration or business-data mutation;
- commit or push without a separate instruction;
- full campaign wizard, User ballot and Juror scoring implementation beyond the agreed Phase 1 scaffold.

### 16.3 Phase 1 entry gate

Before editing Runtime, Phase 1 must record:

1. authoritative Safety Vote source location and immutable baseline commit;
2. current Admin/User/Juror routes/screens;
3. existing API/capability and role contracts;
4. feature-flag/rollback strategy; and
5. files allowed to change.

If the baseline is still absent or ambiguous, Phase 1 stops at `HOLD_BASELINE_NOT_FOUND`; it must not create a parallel voting implementation.

## 17. Copy-ready command for the next phase

> เริ่ม Safety Vote UX/UI Phase 1 — Baseline Integration and Admin Campaign Center ตาม `docs/safety-vote-ux-phase0-audit-responsive-contract.md` โดยก่อนแก้ Runtime ให้ยืนยัน authoritative Safety Vote source, immutable baseline, Admin/User/Juror routes, API/capability contract และ feature-flag rollback ก่อน หาก baseline ยังไม่พบให้หยุดที่ `HOLD_BASELINE_NOT_FOUND` และห้ามสร้าง voting engine หรือ schema ใหม่จากการคาดเดา เมื่อ baseline ยืนยันแล้ว ให้ทำเฉพาะ feature-flagged responsive Safety Vote shell, role-aware navigation scaffold, หน้า Admin “จัดการ Safety Vote”, KPI/search/filter/sort, campaign list แบบ desktop table/master-detail และ mobile cards รวม loading/empty/retry/denied states และ production wording ตาม Phase 0 พร้อม static/unit/authenticated browser UAT ที่ 390×844, 430×932, 768×1024, 1366×768 และ 1920×1080 โดยต้องไม่เปลี่ยน ballot/privacy/eligibility/certification/result logic, ไม่ deploy, ไม่ commit และไม่ push เมื่อเสร็จให้รายงานไฟล์ที่แก้ ผลทดสอบ ข้อจำกัด และคำสั่งสำหรับ UX Phase 2

## 18. Closeout

Phase 0 is complete as a design and acceptance contract. Runtime readiness is intentionally held until the authoritative Safety Vote implementation can be identified and audited. The next authorized work is Phase 1 under the entry gate above.
