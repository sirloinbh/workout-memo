# Show hidden cardio form errors and fix empty cardio charts (#386)

Issue: https://github.com/sirloinbh/workout-memo/issues/386

## Purpose

"Apply to preview" looked dead when the schema failed on a field the form has no input for, an empty chart drew `-Infinity` heights with an aria-label of "title: ", and a goal with a 0 target gave `NaN` for `aria-valuenow`.

## Changes

- `frontend/src/cardio/cardio-form.tsx`: issues on keys without an input (an imported record's `source` or `external_id`) are shown in the form's alert as "This record cannot be used: external_id - ...". The alert clears on the next valid submit.
- `frontend/src/cardio/cardio-stats.tsx`: a chart with no buckets shows "No records in this period" instead of a chart. `Trend` is exported for its test.
- `frontend/src/cardio-goals.tsx`: progress is computed by `percentOf`, which gives 0 for a target of 0 or less, for both `aria-valuenow` and the bar width.

## Verification

- Screen test (`cardio-form.test.tsx`): a form for an imported record with a 201-character `external_id` shows the error and does not call `apply`.
- Unit tests: a trend with no buckets has no image role and no `Infinity` or `NaN`; a goal with a 0 target renders a bar reading 0.
- `npm run check`: passed.

## Limits

- The error names the field key (for example `external_id`), since the user cannot edit that field in the form.
