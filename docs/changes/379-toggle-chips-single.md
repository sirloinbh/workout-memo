# Add a single-select mode to ToggleChips and drop duplicate form helpers (#379)

Issue: https://github.com/sirloinbh/workout-memo/issues/379

## Purpose

The workout effort feedback and the cardio perceived effort each re-implemented "one choice at most" on a multi-select group and mapped display labels back to values, and screen readers heard a set of toggle buttons instead of one choice. `renderOption` had no test. `components/field.tsx` exported an unstyled `Input` with the same name as the common `ui/input`, and `style.css` had a global `[aria-invalid='true']` rule that ignored the `.legacy` boundary.

## Changes

- `components/toggle-chips.tsx`: `type="single"` takes `value: string | null` and reports the option value (or `null` when the chosen chip is pressed again). It renders a `radiogroup` of `radio` chips. The default (`multiple`) is unchanged.
- `app.tsx` (the workout effort feedback) and `cardio/cardio-form.tsx` (perceived effort) use it with the value keys and `renderOption` for the labels. `app.tsx` is lane-3's file: this is the one caller block only, about 10 lines.
- `components/field.tsx`: the unstyled `Input` is deleted (only `modal.test.tsx` used it; it now uses a plain `<input>`).
- `style.css`: the invalid border rule is `:where(.legacy) [aria-invalid='true']`, same specificity as before.
- Tests: effort chips are now `radio` with `aria-checked` in `set-completion.test.tsx` and `cardio-panel.test.tsx`.

## Verification

- `toggle-chips.test.tsx`: `renderOption` shows its text while the option stays the value; single-select is one `radiogroup`, reports the value, replaces the choice and clears on a second press.
- All 528 frontend tests pass.
- `npm run check`: passed.

## Limits

- The effort chips are now `radio` role, so a screen reader announces "1 of 3"; an end-to-end test that looked for them as buttons would need the same change (none exists).
