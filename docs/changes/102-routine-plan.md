# #102 Replace the 12-week preview and plan view on the Routine planner with shared components (step 4)

- Issue: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- Branch: `feat/102-routine-plan`
- Earlier steps: step 1 [#227](https://github.com/sirloinbh/workout-memo/pull/227), step 2 [#228](https://github.com/sirloinbh/workout-memo/pull/228), step 3 routine form [#233](https://github.com/sirloinbh/workout-memo/pull/233)

## Purpose

Move the last remaining parts of the Routine planner screen, the 12-week expected goals (`Preview`) and the plan view of a saved routine, to shared components and utilities, and delete all the `style.css` rules the Routine planner screen used. Work started on top of step 3 (#233), and after #233 is merged the PR is raised with `origin/main`.

## Change — feat: replace the 12-week preview and plan view

- `frontend/src/routines.tsx`
  - 12-week expected goals: inside a bordered box (`data-slot="routine-preview"`), each exercise gets a default `details` and `summary`. `components/ui` has no expand part, so the default elements are kept with utilities added. On touch screens the existing rule keeps the `summary` height at 44px or more, and the vertical padding of the text is set with `pointer-coarse:py-3`.
  - Deload weeks: instead of the old `.deload` class (which had no style rule), they are marked with a `data-deload` attribute and a darker text color. The same mark is applied to the manual weekly goals and the exercise schedule in the plan view.
  - Preview heading: h3 inside the routine form (directly under the screen h2) and h4 inside the plan view (under the routine name h3). Before, both were h4, so the heading level was skipped inside the form.
  - The preview hint text (before the start date and schedule are entered) is a `bg-muted` hint box.
  - Plan view: an `article` inside a shared `Card` (`role="region"`, its name linked to the routine name heading with `aria-labelledby`). The routine name is a `CardTitle` (h3), and the split, weekly goals, and exercise schedule are groups with dividers and an h4. A "주차별 목표" ("weekly goals") heading was newly added to the weekly goals of a manual routine. The exercise schedule has two columns at 768px and wider.
  - The screen root is `data-slot="routine-page"` instead of `className="routine-page"`.
- `frontend/src/style.css`: removed `.routine-page li`. No rule used only by the Routine planner screen remains.

## Tests

- Added: 1 test in `frontend/src/routines.test.tsx`. It checks that the plan view is a named region and the routine name is an h3, that in the weekly goals of a manual routine only weeks 4, 8, and 12 are marked as deload, and that the exercise schedule heading exists.
- The existing tests (12 weeks and the deload mark, automatic preview, reopen) pass without edits.
- `npm run test -w frontend -- src/routines.test.tsx`: 9 pass
- `npm run typecheck -w frontend`, eslint and prettier (changed files): pass
- Visual baselines and e2e are checked by the PR CI. The PC ran low on memory, so the full local `npm run check` and e2e were not run.

## Change — fix: first review follow-up

- Long names without spaces (routine and split names, up to 120 characters) could overflow at 360px or in the 2-column exercise schedule. Added `[overflow-wrap:anywhere]` to the routine name, the split name, and the exercise schedule rows.
- On touch screens the `py-2` utility of `summary` beat the legacy rule's `padding-block: 12px`, so the text stuck to the top. Added `pointer-coarse:py-3` and fixed the explanation in the record above too.
- The name of the plan view region is now the routine name heading (`aria-labelledby`) instead of the fixed text "계획 보기" ("view plan"). It is read together with which routine the plan is for.
- The deload mark in the manual weekly goals now uses the same darker text color as the preview and the exercise schedule. Removed the trailing space left at the end of non-deload days in the exercise schedule.
- Because `.routine-page li` was removed, `my-0` was dropped from list items.
- Tests: the plan view test compares the deload weeks including order as `['4주차', '8주차', '12주차']` (weeks 4, 8, and 12), and checks that the region name is the routine name. Added a test that, with an automatic routine, checks that the preview heading is h4 inside the plan view and h3 inside the routine form.
- After the first follow-up: `npm run test -w frontend -- src/routines.test.tsx` 10 pass, eslint (changed files) and `npm run typecheck -w frontend` pass.

## Second review

- No must-fix items. Confirmed that all the first follow-ups went in correctly. Fixed the "plan view" description above, which still said the fixed name.
- Not applied: the nit that the new h3/h4 test finds the form with `document.querySelector('form')`. This is the only form on the Routine planner screen and the form has no accessible name, so finding it by name would need a new name that does not appear on the screen.
- The list spacing (removing `.routine-page li`) is checked with the CI visual baselines. Two reviews are done, so there is no third review.

## Merge main

- After the review, #236 (InBody preview, #103) was merged to main. This PR also changes `style.css`, so `origin/main` was merged by the merge rule. There was no conflict, and the merged `style.css` differs from main only by the `.routine-page li` removal.
- After the merge: `npm run typecheck -w frontend` passes and `npm run test -w frontend -- src/routines.test.tsx` gives 10 pass. CI `e2e-visual` for `1057822` before the merge passed, so the Routine planner baselines did not change (the fixed data does not open the plan view).
