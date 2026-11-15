# #105 Routine Builder step-by-step input

- Issue: [#105](https://github.com/sirloinbh/workout-memo/issues/105) (design decided by the user on 2026-11-10, in the issue comment), with [#271](https://github.com/sirloinbh/workout-memo/issues/271) and [#173](https://github.com/sirloinbh/workout-memo/issues/173)
- Branch: `feat/105-routine-steps`
- Earlier #105 steps: [set cards](105-set-cards.md), [mobile modal](105-mobile-modal.md), [rest timer](105-rest-timer.md), [mobile flow](105-mobile-flow.md)

## Goal

The routine form was one long page. The decision on #105:

1. Four steps: ① basics (name, goal mode, start date) → ② schedule (split type, schedule type, workouts per week or cycle, rest weekdays) → ③ splits and exercises → ④ weekly goals (manual) or the 12-week preview (auto), then save.
2. "Next" checks only the current step's required fields in the browser. "Previous" and the step list go back to earlier steps only; later steps cannot be skipped to.
3. All widths.
4. One draft as before; only the screen is split. The save API and contract do not change.

## Change: feat

`frontend/src/routines.tsx`:

- The form renders only the current step's fields. A submit before the last step (the Next button, or Enter in a field) moves on, so the browser's constraint validation checks just the fields on screen first. On the last step the submit saves as before.
- A step list (`nav` "Routine steps", an `ol`) shows the four steps. Earlier steps are buttons; the current one is marked `aria-current="step"`; later ones are plain text. Step 4 is named "Weekly goals" or "12-week preview" by the goal mode.
- Each step has an `h3` "Step N of 4 · name". Focus moves to it on a step change (not when the form opens) so screen readers announce the new step. The 12-week preview heading is now an `h4` under it (it was an `h3`), the same level as in the plan view, so `Preview` lost its `heading` prop.
- Start date moved from the schedule grid to step 1, beside the name, as decided.
- In auto mode, step 4 repeats the double-progression rule above the preview, which was only next to the goal mode select in step 1.
- Save takes Next's place on the last step, so a save submitted within 400ms of reaching it is ignored: a double tap on Next does not save at once. Routines cannot be deleted in the app, so an accidental save would stay.
- "Create new routine" starts again at step 1.

## Change: fix (#271)

- The rest weekday Checkbox drops its temporary `pointer-coarse:after:-inset-[15px]` override. The common Checkbox has given the 44px tap area since #258. `min-h-4`/`min-w-4` stay (they cancel the legacy 44px button rule, #272). This was the last of the #271 overrides; the machine form and the InBody preview had already been cleaned up.

## Change: feat (#173)

- "View plan" shows a small spinner and `aria-busy` while the plan loads, and all "View plan" buttons are disabled until it arrives. The routine list skeleton and the save spinner were already in place.

## Tests

- `frontend/src/routines.test.tsx`: existing tests now walk the steps (`next`, `toStep`, `save` helpers). New tests:
  - The form goes forward one checked step at a time. A Next click with an empty required name stays on step 1 and marks the field invalid (jsdom runs the native validation). Focus moves to the new step heading, later steps are not buttons, and earlier steps and Previous go back with the values kept. A new routine starts at step 1.
  - A save submitted right after reaching step 4 is ignored, and a later one posts.
  - "View plan" is disabled and `aria-busy` while the plan loads.
  - The failed-save test now goes back to step 1 and checks that the name is kept.
- `e2e/ui-touch.spec.ts`: the Routine Builder check walks the four steps and runs the touch-size checks and axe on each, the auto preview and the manual weeks.
- Local test DB: a throwaway `postgres:17-alpine` container on 127.0.0.1:15468 (tmpfs, migrated), removed after the runs.

| Command                                                                                                     | Result                                                     |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `npm run test -w frontend -- routines routine loading`                                                      | 3 files, 29 passed                                         |
| `npm run test:e2e -- e2e/ui-touch.spec.ts e2e/ui-responsive.spec.ts e2e/ui-a11y.spec.ts e2e/layout.spec.ts` | 44 passed                                                  |
| Browser check: step 1 at 390px, step 3 at 1440px                                                            | Step list wraps onto two lines at 390px; nothing overflows |

-

pm run test -w frontend: 63 files, 353 passed, 4 skipped. ormat:check, lint, ypecheck: passed. A full local
pm run check was not run (it ran out of time earlier in this session); CI erify runs it.
