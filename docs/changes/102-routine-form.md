# #102 Replace the routine form on the Routine planner with shared components (step 3)

- Issue: [#102](https://github.com/sirloinbh/workout-memo/issues/102)
- Branch: `feat/102-routine-form`
- Earlier steps: step 1 My goals [#227](https://github.com/sirloinbh/workout-memo/pull/227), step 2 exercise analysis [#228](https://github.com/sirloinbh/workout-memo/pull/228)

## Purpose

Replace the header hint, the error and save notices, the routine list, and the routine form (schedule mode, split, body parts, exercises, weekly goals) of the Routine planner screen with shared components. Delete the `style.css` rules that only the form used. The 12-week preview (`Preview`) and the plan view (`selected` detail) move in step 4. A step-by-step input flow is out of scope and is done separately after #102 (coordination window decision).

## Change — feat: replace the routine form

- `frontend/src/routines.tsx`
  - Errors: #223's `AlertBanner` instead of `.error`. Save complete and loading are `Notice` (`role="status"`).
  - "새 루틴 만들기" ("create new routine") is the shared `Button` (with an icon), and "계획 보기" ("view plan") in the list is `outline`, `sm`. The list is split into rows inside a bordered box.
  - The form sits inside a `Card`. Labels are the shared `Label`, and text, number, and date inputs are the shared `Input` (16px on touch at 768px and wider too).
  - Select fields (weekly goal mode, split mode, exercise schedule mode, machine, weekly goal target) keep the browser's default `select`, with utilities added to look like the shared input. This is the same exception as the machine select in #101. The shared `Select` (Radix) cannot use the empty value of "자유 운동" ("free workout") as an item, and the screen tests drive the default `select` directly.
  - Rest days: the shared `Checkbox` instead of the default checkbox. It uses the same className as the #231 machine form (`pointer-coarse:min-h-4 pointer-coarse:min-w-4 pointer-coarse:after:-inset-[15px]`), so on touch screens the box stays at 16px and the press area (`::after`) is 44px. The root fix in the shared file is project-standards#415.
  - Split groups, rest days, weekly goals: `fieldset` is a utility bordered box and `legend` is bold text.
  - The add body-part button is `outline`, `sm`, and an added body part is a "삭제" ("delete", `ghost`) inside a rounded chip. The button names ("가슴 추가" ("add chest"), "분할 1 부위 1 삭제" ("delete split 1 body part 1")) are unchanged.
  - The exercise row is a 2-column grid (3 columns at 768px and wider), "운동 삭제" ("delete exercise") is `outline`, `sm`, and "운동 추가" ("add exercise") is `secondary`.
  - "루틴 저장하기" ("save routine") and "취소" ("cancel") sit on one line.
- `frontend/src/style.css`: removed `.routine-page fieldset`, `.routine-page button`, `.routine-page input[type='checkbox']`, and `.routine-exercise`. `.routine-page li` stays because the preview and plan view lists that move in step 4 still use it.

## Tests

- Changed: the input helper `change()` in `frontend/src/routines.test.tsx` now presses the shared `Checkbox` (`role="checkbox"`) to pick rest days. What the existing tests verify is the same.
- Added: in the same file, a check that a save failure error shows as `role="alert"` and save complete shows as `role="status"`.
- `npm run test -w frontend -- src/routines.test.tsx src/routine-progress.test.tsx`: 17 pass
- `npm run typecheck -w frontend`, eslint and prettier (changed files): pass
- Visual baselines and e2e (responsive, axe, touch) are checked by the PR CI. Three worktrees ran at the same time and memory ran out, so the full local `npm run check` and e2e were not run.

## Change — merge main and touch check

- After #231 (machine form, `7db58af`) was merged, `origin/main` was merged. There were no conflicts. The touch check from #231 excludes `[role="checkbox"]` from the plain button check, and checks that the `::after` press area is at least 44px and that the box does not grow beyond 24px. The rest-day `Checkbox` got the same className as #231.
- Added a check to `e2e/ui-touch.spec.ts` that, at touch 360, 390, and 768px, opens "새 루틴 만들기" ("create new routine"), switches to the weekday mode and manual goals (so the rest-day checkboxes and the 12-week goal group show), and checks the input, button, and checkbox criteria and horizontal overflow. The Routine planner screen with fixed data does not open the form, so the earlier checks never showed the form.
- After the merge: `npm run test -w frontend -- src/routines.test.tsx` 8 pass, eslint (changed files) and `npm run typecheck` pass. The added e2e is checked by CI.

## Change — fix: first review follow-up

- Below 768px (2 columns), only the total weight cell took two columns, so the spot next to the sets and reps cells, the middle of the row, was empty. The total weight is now one cell too, and the grid is `items-end` so inputs in cells whose label is two lines and cells whose label is one line sit at the same height. The `grid-flow-dense` that the review suggested was not used because it makes the screen order and the tab order differ.
- Added an `id` (`rest-day-0` to `6`) to the rest-day `Checkbox` so the touch check failure message says which weekday it is.
- Not applied: the remark that "17 pass was not confirmed". It is the actual result of running the two files together at the first commit.
- After the first follow-up: `npm run test -w frontend -- src/routines.test.tsx` 8 pass. Of three runs of the same command, one failed 1 test and the two re-runs both passed. The PC was low on memory, so this is treated as a timeout. eslint (changed files) passes.

## Second review

- No follow-ups. Confirmed that the first follow-up (exercise row gap, checkbox `id`) went in correctly. The number of cells is odd (3 manual, 5 automatic), so one spot next to the last cell stays empty by the grid structure, and there is no empty spot in the middle of a row. Only this wording was applied to the record above. Two reviews are done, so there is no third review.

## Change — test: update visual baselines

- In CI `e2e-visual` for `4576903`, only the 4 images `routines-360·390·768·1280` failed, and the other 80, including the newly added routine form touch check, passed.
- The 1280px and 360px images were compared side by side with the old baselines. Apart from the routine list becoming rows inside a bordered box with a "계획 보기" ("view plan") button, "새 루틴 만들기" ("create new routine") becoming the shared button with an icon, and larger hint text, there is no layout difference or horizontal overflow, so the 4 images were updated with the `visual-baselines` artifact.
- Limitation: the fixed-data screen does not open the form, so the form does not appear in the baseline images. The form was checked with the screen tests and the touch check (weekday mode, manual goals).

## Merge main (conflict resolution)

- After the baseline update, #235 (body records, #103) and #232 (set cards, #105) were merged to main, so `origin/main` was merged. There was a conflict in `style.css`. In the same area, main removed the body record rules (`.body-form`, `.body-trend*`, `.body-list`) and this branch removed the routine form rules. Both deletions were kept, and the merged `style.css` differs from main only by the 4 routine form rules.
- After the merge: `npm run typecheck` passes and `npm run test -w frontend -- src/routines.test.tsx` gives 8 pass.
