# #268 Shrink the 390px set cards to 3 scrolls or fewer

- Issue: [#268](https://github.com/sirloinbh/workout-memo/issues/268)
- Branch: `fix/268-compact-set-cards`
- Follows: [#105 step 4 measurement](105-mobile-flow.md)

## Goal

The #105 set cards made the 390px "new journal → enter and complete 3 sets → save" flow take 5 scrolls instead of 3. This brings it back to 3 or fewer without more taps or keys, and keeps the 44px tap targets and the other #105 improvements.

## Cause

At 390×844, the journal editor shows the set cards between the rest timer pinned at the top (130px) and the save bar pinned at the bottom (69px), so about 645px is visible. A set card was 556px tall:

| Part                    | Height |
| ----------------------- | -----: |
| Header (Set N, delete)  |     44 |
| Exercise name           |     68 |
| Machine                 |     68 |
| Weight and reps stacked |    148 |
| Set memo (80px min)     |    104 |
| Done button             |     48 |
| Gaps, padding, border   |     76 |

From the exercise name to the done button was 410px, so after the swipe to a set's exercise name its done button was still under the save bar.

## Change: fix

Only below 480px (phones), in `frontend/src/app.tsx`:

- Each set field's name sits beside the field instead of above it, in an 80px column so the fields line up (`setField`, `setFieldName`). This applies to exercise name, machine, total weight kg, reps and set memo. Each field row is now its control's height (44px with touch), not label + gap + control.
- Weight and reps stay stacked: #105 found that side by side at 360 to 390px leaves only 25 to 40px for the digits ([105-set-cards](105-set-cards.md)). With the name beside them, the number field is 118px wide at 360px and 148px at 390px (a 99999.25 weight shows in full).
- The set memo is one line (`rows={1}`, at least 44px) below 768px and grows with its text (`field-sizing-content`), so a multi-line memo is still shown in full where the browser supports it; elsewhere it scrolls and can be resized by dragging. The placeholder is shortened to "Form, machine settings, etc." so it fits on one line.
- From 480px up the layout is unchanged, apart from the shorter placeholder (480 to 767px: one column with names above; 768px and up: two columns).

A set card is now 400px at 390px (−156px). The header row, the full-width 48px done button and the 44px − / + buttons are kept.

## Change: test

- `e2e/workout-mobile-flow.spec.ts` now asserts the counts: taps 11, keys 24, scrolls 3 or fewer. Run against the old cards (main at bbfb0fb with this spec), it failed with `Expected: <= 3, Received: 5`; with the fix it passes.

## Comparison result (local, real Chrome, 390×844 touch)

| Item                  | Before #105 (7b900c1) | main (bbfb0fb) | This change |
| --------------------- | --------------------: | -------------: | ----------: |
| Taps                  |                    11 |             11 |          11 |
| Keys                  |                    24 |             24 |          24 |
| Scrolls (lower bound) |                     3 |              5 |           3 |
| Set card height       |                     — |          556px |       400px |

- Scrolls on main: set 1 exercise, set 1 done, set 2 weight, set 3 exercise, set 3 done. With this change: one per set, to its exercise name (set 1, 2, 3). Each set's weight, done button and the next set's start then stay in view.
- The before-#105 column is from the #105 record (CI). The other two columns were measured locally on the same test DB with the same spec.

## Tests

- Local test DB: a throwaway `postgres:17-alpine` container on 127.0.0.1:15468 (tmpfs, `workout_test`, migrated with `db:migrate`), not a personal DB. Removed after the runs.
- `npm run test:e2e -- e2e/workout-mobile-flow.spec.ts e2e/ui-touch.spec.ts e2e/ui-responsive.spec.ts e2e/ui-a11y.spec.ts e2e/workout-crud.spec.ts e2e/new-workout-defaults.spec.ts`: 45 passed. ui-touch covers the 44px tap targets, ui-responsive covers no overflow and nothing hidden under fixed bars at 360/390/768/1280, ui-a11y covers axe.
- Browser check: set card screenshots at 360, 390, 600 and 1440px with a 99999.25 weight and a 3-line memo; the numbers and memo show in full, and 1440px looks the same as before apart from the placeholder.
- `npm run test -w frontend`: 63 files, 350 passed, 4 skipped.
- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- Not finished: a full `npm run check` was stopped after 10 minutes when the session ended (no result); CI runs it on the PR.
- Visual baselines (`ui-visual`, CI container only): the workout editor shots at 360 and 390px are expected to change; see the PR for the update.
