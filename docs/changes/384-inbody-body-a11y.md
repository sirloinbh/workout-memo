# Read InBody values correctly and make body trends accessible (#384)

Issue: https://github.com/sirloinbh/workout-memo/issues/384

## Purpose

A photo sheet in pounds was read as kg, "Target Weight" or "Lean Body Weight" lines could be read as the weight, a CSV that failed to read did nothing, and the body trend charts hid their caption and range from screen readers.

## Changes

- `rowFromText` (`frontend/src/inbody.ts`) reads a label only at the start of a line (after an optional "Body"), so target and lean body weight lines are skipped. A unit in parentheses that says pounds (`lb`, `lbs`, `pound`, `파운드`) makes the line unreadable, so the field stays empty for the user to fill in. `kg` and `%` units still work.
- The CSV branch of `open` (`frontend/src/inbody-import.tsx`) is wrapped in `try/catch` and shows "Could not read the file: ..." instead of failing silently.
- The body trend (`frontend/src/body.tsx`): `role="img"` and the aria-label move from the `<figure>` to the chart `<svg>`, so the caption (name, change) and the date and value range are read as text. The "Enter weight as a number" message is lower-case mid-sentence.

## Verification

- Unit tests: `Weight(lbs) 160`, `Weight (lb)`, `체중(파운드)` stay empty; `Weight(kg) 72.4` is read; a sheet with `Target Weight` and `Lean Body Weight` before `Weight` gives the real weight.
- Screen tests: a CSV whose `text()` rejects shows an alert and no preview table; a trend chart's figure has no role, its svg is the one named image, and the caption stays text.
- The e2e axe check of the body page runs in CI.
- `npm run check`: passed.

## Limits

- A weight line that does not start with its label (for example "InBody Weight 72.4") is no longer read; the user fills the field in on the preview.
