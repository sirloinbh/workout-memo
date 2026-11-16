# #117 part 2: today's routine cardio on the journal card

- Issue: https://github.com/sirloinbh/workout-memo/issues/117 (part 2 of 3; part 1 was PR #319)
- Change: feat

## Purpose

Part 1 let a routine split list cardio items with weekly targets, but nothing used them on the day. Today's routine card now shows the split's cardio for this routine week after the strength targets. "Log cardio" opens the journal's Cardio tab with a new record filled in from the item (#115's cardio form).

## Changes

- `backend/src/progress.ts`: `weekCardio(plan, split, week)` gives a split's cardio items with the week's target from `cardioWeeklyTargets`. A steady item's `minutes` or `distance_km` becomes that week's value, and an interval item is unchanged. Every session target of a split with cardio carries `cardio`, for manual and auto routines alike. A target moved by a rest keeps its planned week's cardio. Splits without cardio get no key, so older plans answer as before.
- `frontend/src/routine-cardio.ts` (new):
  - The cardio label helpers, moved out of `routines.tsx` so the card and Routine Builder share them.
  - `cardioPreset(item, week)`: a steady item fills in its time (as the workout time) or distance (metres for swimming). An interval item fills in only its type, since the session's total time includes the warm-up and cool-down. The memo reads "Routine week N · Running · Zone 2 · 30 min" and names the structure for an interval.
- `frontend/src/progress.tsx`: "Cardio after strength" (h4) under today's targets, one line per item with a "Log cardio" button. The button's accessible name is "Log cardio: <item>", so the repeated buttons are told apart.
- `frontend/src/app.tsx`, `cardio/cardio-tab.tsx`, `cardio/cardio-panel.tsx`, `cardio/cardio-form.tsx`:
  - The button keeps the preset in App state and switches to `?tab=cardio`.
  - The panel opens a new record with the preset dated today and tells App it was used, so it opens once.
  - "Add cardio record" still starts empty.
- `docs/api.md`: the `cardio` field of routine-progress session targets.

## Verification

Tests added or changed:

- `backend/test/routine-cardio.test.ts`:
  - week 3 targets (36 min, 6.1 km, interval unchanged) and a week 4 deload
  - no key on a split without cardio, and the plan itself is not changed
  - a rest moves a target together with its planned week's cardio
  - an auto routine carries cardio
- `frontend/src/cardio/cardio-panel.test.tsx`: a preset opens a new record for today even in a past period, fills in swimming metres and the memo, saves through POST, and "Add cardio record" starts empty again.
- `frontend/src/routine-progress.test.tsx`: the card lists both items, and "Log cardio" opens `?tab=cardio` with time and memo filled in. An interval fills in no time, and opening the form saves nothing.
- `e2e/cardio-routine.spec.ts` (new):
  - At 390×844 and 1440×900 against the real API, the card shows the cardio with no horizontal scroll, and "Log cardio" opens the filled-in form.
  - At 390 it saves the record and sees it in the list, and `afterAll` deletes it.
  - The file sorts before `new-workout-defaults.spec.ts`, so that spec's later routine stays the active one for the visual specs.

The backend tests ran against a throwaway `postgres:17-alpine` test DB (127.0.0.1:15468, tmpfs, migrated). The checks ran one by one, not as one `npm run check`.

| Command                                                                                                                                                                 | Result                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `npm run test -w backend`                                                                                                                                               | 382 passed, 0 skipped           |
| `npm run test -w frontend`                                                                                                                                              | 66 files, 372 passed, 4 skipped |
| `npm run test:e2e -- e2e/cardio-routine.spec.ts e2e/new-workout-defaults.spec.ts e2e/ui-touch.spec.ts e2e/ui-a11y.spec.ts e2e/ui-responsive.spec.ts e2e/cardio.spec.ts` | 45 passed                       |
| `format:check`, `lint`, `typecheck`, `contract:check`, `test:skills`, `test:docs`, `build`                                                                              | passed                          |

The "Log cardio" button uses the shared `sm` button, which is at least 44px on touch screens (`pointer-coarse:min-h-11`).

## Limits and follow-up

- The card shows the planned cardio but does not mark it done. Part 3 adds the cardio achievement rate for the routine in progress.
- An interval record does not fill in a time. The memo names the structure, and the user types the session's total time.

## Review round 1

No blocking findings. The reviewer confirmed:

- older plans keep the same response shape
- the week index stays within 1 to 12
- rest-moved targets keep their week
- the date rules and import `apply` are untouched
- the preset effect is safe under StrictMode
- the heading levels and the label-in-name of the buttons are correct

Applied:

- The cardio form remounts for each preset (`key`), so a preset that arrives while a form is open is never ignored.
- `e2e/cardio-routine.spec.ts` scans the routine card with axe (WCAG 2.1 A/AA) at both sizes. `ui-a11y.spec.ts` runs on mocked fixtures and never saw the cardio list.
- The specs that run while this spec's routine is the active one were run too: `cardio`, `custom-range` and `layout`.

Not applied:

- clearing the App preset if the Cardio tab never mounts (no current path leaves it set)
- showing a preset record saved outside the open past period (the save notice still shows)
- extra form tests for a km or minutes preset (the e2e and panel tests cover them)

| Command                                                                                                         | Result              |
| --------------------------------------------------------------------------------------------------------------- | ------------------- |
| `npm run test:e2e -- e2e/cardio-routine.spec.ts e2e/cardio.spec.ts e2e/custom-range.spec.ts e2e/layout.spec.ts` | 7 passed            |
| `vitest run src/cardio src/routine-progress.test.tsx`                                                           | 10 files, 89 passed |
| `lint`, `typecheck`, `format:check`                                                                             | passed              |

## Review round 2

No blocking findings. The reviewer confirmed:

- The form `key` changes only when a preset arrives. Typing, list reloads and parent re-renders don't remount the form, and Save and Close unmount it cleanly.
- "Add cardio record" and editing behave as before.
- The axe `include` selector matches the routine card itself, not its loading placeholder.

Applied the nit: "Edit" also clears the preset, like "Add cardio record". It no longer depends on the modal blocking the list behind it.

Checks: `vitest run src/cardio src/routine-progress.test.tsx` passed, and `lint`, `typecheck` and `format:check` passed.
