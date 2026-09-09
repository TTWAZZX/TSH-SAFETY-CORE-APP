# BBS Performance Baseline — 2026-09-09

## Scope

This baseline was captured before the planned lazy-loading, targeted refresh, image-preview, and query-optimization work. It accompanies the Busy-state correctness fix only. No Production request, deployment, schema change, or business-data migration was performed.

The browser run used Chrome headless against the local Node API and local database. Temporary Personal Master Artwork, template, layout, assets, and audit evidence were removed after the run; cleanup reported zero temporary templates and layout versions. The fixture artwork was a 1 x 1 PNG, so Designer image timings are a control baseline and do not represent multi-megabyte Production artwork.

## Baseline result

| Measurement | Duration |
| --- | ---: |
| Initial BBS page load | 402 ms |
| Community section | 117 ms |
| Inspector/team section | 145 ms |
| Core/Observation section | 182 ms |
| Card Admin section | 140 ms |
| Open Designer chooser | 69 ms |
| Create Draft, load detail, and preload resources | 261 ms |
| Save Draft and reload resources | 116 ms |

This single run is not a p75/p95 Production claim. Its main value is a reproducible reference for request count and relative work. The current initial Admin load issues approximately 20 BBS data requests after context resolution. Opening the chooser issues five parallel reads. Creating a Draft then performs the create request, two Preset-list reads, a detail read, and Front/Back resource reads. Saving performs the update and reloads both sides plus their matching asset resources.

The slowest individual local API call in the captured initial load was `GET /eligible-employees` at 123 ms. The complete initial page still waits for Community, Inspector, Core, and Card Admin data even when those workspaces are not the user's active destination. These observations define the comparison points for the lazy-loading work in Set 2.

## Browser instrumentation

The BBS async UI now keeps up to 200 in-memory, metadata-only timing entries. It does not persist tokens, payloads, employee data, URLs, or uploaded files. An Admin can inspect the current browser-session measurements from DevTools:

```js
BBSPerformance.summary()
BBSPerformance.entries()
BBSPerformance.clear()
```

Measurements currently cover the initial BBS load, each independent section load, and BBS busy operations including Designer create/save. Refreshing the page starts a new in-memory baseline.

## Busy-state defect and acceptance

The Designer previously passed the browser `Event` object to `designerBusy()` in several click handlers. Calling `setAttribute()` on that object raised `TypeError: control.setAttribute is not a function`, so the request could stop before it started and the visible busy state could appear stuck.

The helper now resolves `Event.currentTarget` synchronously and applies disabled/ARIA state only to an element-like control. The shared BBS busy helper uses the same defensive rule. Browser UAT clicked Create Draft and Save Draft, verified the update returned HTTP 200, verified the busy indicator and `aria-busy` were cleared, and reported zero console errors.

## Next comparison

Set 2 should retain the same measurement names and compare:

- initial page load and active-tab readiness;
- initial BBS request count;
- Community, Inspector, Core, and Card Admin loads triggered before first paint;
- Designer timings only as a regression guard, because resource optimization belongs to a later set.

## Set 2 comparison: active tab and workspace loading

Set 2 resolves the restored tab and entry intent before requesting workspace data. The initial page now loads only the active BBS tab. Card Admin is split into shared reference/artwork data, Personal data, and Department data; switching between Card workspaces requests only data that has not already been confirmed in the current page session. History, Actions, Analytics, and Community retain their Admin Department/Unit reference data without forcing Card Admin or Master Artwork reads.

The same local Chrome/Node UAT path produced this comparison:

| Measurement | Before Set 2 | After Set 2 | Change |
| --- | ---: | ---: | ---: |
| Initial BBS page load | 402 ms | 218 ms | 46% faster |
| Active Core section | 182 ms | 170 ms | 7% faster |
| Initial BBS requests | approximately 20 | 8 | approximately 60% fewer |
| Inactive sections loaded initially | Community, Inspector, Cards | none | deferred until opened |

Opening Card Admin Overview then loaded the shared foundation/artwork plus both domain summaries in 100 ms. Moving from that already-loaded Overview to Personal reused the confirmed data and completed the Card section pass in 1 ms without another Personal catalog request. A direct restored Personal or Department workspace skips the other card domain.

Designer control timings remained within the intended regression role: create Draft plus resource preload was 305 ms and save plus reload was 112 ms. The create timing is 44 ms slower than the single baseline run, while save is 4 ms faster; image/resource optimization remains outside Set 2. Browser UAT verified the initial Core-only load, deferred sections, actual Draft create/save, zero console errors, and zero temporary template/layout/master-artwork residue.

These values are single local runs and should be treated as directional comparisons, not Production p75/p95 measurements. The earlier request count was an approximate log-derived count, while the Set 2 count is captured automatically from browser Resource Timing.

## Set 3 comparison: targeted mutation refresh

Set 3 stops successful Card Admin and Designer mutations from refreshing unrelated catalogs, employee/card pages, Master data, or unchanged private image resources. Server responses and optimistic `RowVersion` remain authoritative; the optimization changes only which confirmed client projection is refreshed.

| Operation | Set 2 follow-up work | Set 3 follow-up work |
| --- | --- | --- |
| Save Designer Draft | Update plus Front/Back and asset downloads | Draft update only; existing object URLs are reused |
| Save Layout Preset | Create plus both Preset-list reads | Create response updates the active Preset catalog |
| Apply Layout Preset | Apply plus unchanged artwork downloads | Apply response only; preserved Master Artwork URLs are reused |
| Trash/Restore Preset | Mutation plus both Preset-list reads | Mutation updates the two confirmed in-memory lists and increments the local RowVersion projection |
| Trash/Restore Designer Draft | Mutation plus catalog, two version lists, and two Preset lists | Mutation plus only active/Trash version lists |
| Upload Designer background | Upload, complete Draft detail, and all image resources | Upload plus only the newly uploaded private asset |
| Upload Personal/Department Template | Reload the complete Card/Community workspace | Reload only the matching Template catalog |
| Upload Master Artwork | Reload the complete active Card workspace | Reload only Master Artwork |

The final local Browser UAT measured Designer Save at 51 ms versus 112 ms in Set 2, approximately 54% faster. Its follow-up network work fell from five requests (one update plus four unchanged image reads in this fixture) to one update request, an 80% reduction. The same UAT proved that Apply Preset issued only its apply request and Preset Trash issued only its delete request; neither downloaded artwork or other catalogs. Temporary templates, versions, Master Artwork, Presets, assets, and related test evidence were removed after the run, with all reported residue counts at zero.

The measured timing remains a single local control run using 1 x 1 PNG fixtures. Production artwork sizes and network latency will affect absolute durations, but the eliminated requests are deterministic.

## Set 4 comparison: active-side image preview

The Designer now downloads private image resources only for the side currently open. Front is loaded first; Back is deferred until the Admin opens it. Image assets are fetched only when an element on that side references them, so an available but unused Master Artwork asset is not downloaded as an element resource.

| Designer image work | Before Set 4 | After Set 4 |
| --- | ---: | ---: |
| Initial private image requests in the control fixture | 4 | 1 |
| Initial sides downloaded | Front and Back | Front only |
| Unreferenced image assets downloaded | 2 | 0 |
| Work when Back is first opened | already downloaded eagerly | 1 Back background request |

For this fixture, initial image requests fell from four to one, a 75% reduction. Reopening an already loaded side reuses its object URL and does not request the image again.

For large browser-compatible artwork, the editing canvas creates an in-memory WebP preview with a maximum dimension of 1,600 pixels and uses it only when it is smaller than the fetched source. The authorized source file remains unchanged in private storage. Existing preview/readiness and print code continues to fetch the original object-authorized background and asset URLs, so card output does not use the reduced editing preview.

The Browser UAT used 1 x 1 PNG control images: it verified one Front request on initial open, exactly one Back request after switching sides, no Front reload, no unreferenced asset request, and zero console errors. Because the fixture is intentionally tiny, it proves request behavior but does not represent Production byte savings. No API, schema, private-upload path, card/QR lifecycle, or authorization rule changed in Set 4.

## Set 5 comparison: evidence-based API and query optimization

The Set 1 baseline consistently identified `GET /api/bbs/eligible-employees` as the slowest initial BBS endpoint at approximately 106-123 ms. A repeatable seven-run local audit before Set 5 measured 2,240 Admin-visible employees at a 96.1 ms median and 102.5 ms p95. Query tracing showed that the normalized Employee/Master join consumed 65-78 ms by itself; the individual Context queries were approximately 0.7-1.8 ms each.

The Admin-only projection now reads Employees, mapped Positions, Departments, Safety Units, active effective eligibility, and Checklist candidates as small independent queries, then performs the established case-insensitive trimmed Master matching in memory. It also avoids building the complete Inspector/KPI/Pilot Context that the Admin result does not consume. Ordinary-user hierarchy and Inspector authorization retain the existing path. Node and PHP implement the same projection and continue to use the established Checklist readiness resolver.

| Eligible-employees measurement | Before Set 5 | After Set 5 | Change |
| --- | ---: | ---: | ---: |
| Rows returned | 2,240 | 2,240 | unchanged |
| Median, seven local runs | 96.1 ms | 40.2 ms | 58% faster |
| p95, seven local runs | 102.5 ms | 49.9 ms | 51% faster |
| Slowest Employee projection query | 65-78 ms | 11-14 ms | normalized full join removed |

The read-only audit compares every returned employee identity, name, Department, Unit, Position, BBS level, and resolved Master ID against the legacy SQL result and fails if any projection differs. The comparison passed for all 2,240 rows. Browser UAT also completed the real BBS workflow with zero console errors and zero test residue; under its concurrent initial workload, `eligible-employees` completed in 81 ms versus 106 ms in the earlier baseline run.

No index or schema was added because the evidence isolated the expensive expression-based full join and the result can be preserved without a migration. No other API was changed: timings observed while many Card Admin requests ran concurrently were not treated as isolated query evidence. This avoids speculative changes based on a single contention-heavy browser run.
