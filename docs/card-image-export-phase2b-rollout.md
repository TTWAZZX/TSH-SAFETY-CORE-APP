# Card Image Export Improvement - Phase 2B Rollout

Date: 2026-08-20

## Scope

Phase 2B migrates only these P1 targets to the shared exporter:

- Machine Safety: `machine-safety-document-list`
- Yokoten: `yokoten-topic-*`
- 4M Change Management: `4m-change-overview`
- Safety Culture: `safety-culture-campaign-library`

Each path requires its matching `cardImageExportV2` module flag. Flags are off
by default. Non-allowlisted targets and shared failures continue through the
existing legacy exporter.

## Export-specific normalization

- Machine Safety mobile card view builds a temporary off-screen list surrogate.
  The visible page is unchanged while the export uses the bounded page-one table.
- 4M and Safety Culture convert inputs/selects in the export clone to static text
  using current values. The live form is never replaced or mutated.
- Yokoten and all four targets expand truncated clone text and use deterministic
  export widths.

## Verification

Commands:

```text
npm --prefix backend run test:card-image-export-phase1
npm --prefix backend run uat:card-image-export-phase2b
```

Results:

- Foundation: 19/19 checks; approved imports 6/6
- Controlled comparison: 8 legacy/shared comparisons, 16 PNG files
- Shared captures: 8/8
- Legacy fallbacks: 0
- Desktop/mobile consistent shared layouts: 4/4
- Runtime errors: 0
- Business data changes: 0
- Visual review: no clipped target text, blank form values, or incomplete images

Evidence:
`backups/local/card-image-phase2b-comparison-20260820T061809Z/`

## Deployment state

Local implementation only. No API, database, permission, upload-storage, or
Production change was required. No feature flag is enabled by default, and this
phase was not deployed or pushed.
