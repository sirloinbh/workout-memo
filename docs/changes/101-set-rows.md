# #101 Replace the set rows with shared components (step 6)

- Issue: [#101](https://github.com/sirloinbh/workout-memo/issues/101)
- Branch: `feat/101-set-rows`

## Purpose

This is the sixth PR in #101, which moves one element at a time. The set rows in the journal editor now use the shared `Input`, `Button`, and utilities, and the `.set-editor` rules are removed.

This PR does not close #101. The dashboard chart area and the routine goal card in the workout journal, both in the issue scope, are still left.

## Change — feat: replace the set rows

- `frontend/src/app.tsx`: the exercise name, total weight, and reps use the shared `Input`, and complete and delete use the shared `Button`.
- The machine picker stays as the browser's default `select`. The shared `Select` (Radix) cannot use the empty value of "자유 운동" (free exercise) as an item, and it picks values differently, so changing it needs separate work that also changes the screen tests and e2e.
- The input fields were not changed to `NumberInput`. The input flow with − + buttons is in the scope of #105.
- `frontend/src/style.css`: removed `.set-editor`, `.set-number`, `.set-actions`, `.set-done`, `.set-reference`, `.set-notes`, and the responsive and touch rules.
- Visual differences: input labels grow from 9px to 12px, and input text from 12px to 14px (16px on touch devices). A completed set's button has the primary color as its background. The width where it changes to two columns moves from 761px to `md` (768px).

## Change — fix: first review follow-up

- Delete button position: `md:row-span-1` cleared the start row, so for a set with a reference line or an error, at 768px and above, the delete button left the first line. I added `md:row-start-1`.
- Machine picker height: the top and bottom padding of `.modal select` remained, so only 12px was left for text inside `h-9`. I added `py-0`.
- Removed an `@media` block that was left empty after the rules were deleted.

## Tests

- Changed: the set row selectors in `routine-progress.test.tsx`, `e2e/new-workout-defaults.spec.ts`, and `e2e/workout-crud.spec.ts` now use `data-slot`. The verified content is the same.
- `npm run test -w frontend -- src/routine-progress.test.tsx src/set-completion.test.tsx src/forms.test.tsx src/workout-draft.test.tsx src/new-workout-defaults.test.tsx`: 40 pass
- In the PR CI `e2e-visual`, only one image changed, `workout-editor-768`. I confirmed from the image that the labels and input text are larger and the delete button is on the first line, and updated the baseline. The 360px and 1280px images are unchanged.
- I did not run the full local `npm run check` because it has a history of running out of memory. e2e and visual baselines are checked by PR CI.
