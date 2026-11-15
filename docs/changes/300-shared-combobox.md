# #300 Use the shared Combobox, and give routine exercises the same suggestions (#124)

- Issues: [#300](https://github.com/sirloinbh/workout-memo/issues/300) and the last part of [#124](https://github.com/sirloinbh/workout-memo/issues/124)
- Branch: `refactor/300-shared-combobox`

## Why

- #300: the shared UI now has `components/ui/combobox.tsx` (project-standards#437), lifted from the app's own Combobox (#124). The app copy can go.
- #124: the user decision (2026-11-10) split the work. The journal sets and goals were done in #273. The routine exercise input waited for the routine step-by-step input (#311, merged). The analysis body-part screen has no name input, so it needs nothing.

## Changes

- `frontend/src/app.tsx`: the journal set and goal fields import the shared `Combobox`. `Routines` receives the same `exerciseNames` list (GET `/api/exercise-names` plus today's routine, goal and machine names).
- `frontend/src/routines.tsx`: in step 3, the exercise name field is the shared `Combobox` with "Previously used names" and the `SimilarNameHint` ("Replace with the existing name 'X'?" with a Replace button; nothing is replaced automatically). On wide screens the name and Machine cells align at the top, so a shown hint does not lift the name field above Machine (the rest of the row still aligns at the bottom).
- `frontend/src/exercise-name-match.ts`: uses `looseText` from the shared `combobox-filter.ts`.
- Deleted `frontend/src/components/combobox.tsx` and `combobox-filter.ts`.
- `docs/next-steps/README.md`: removed the done "replace the app Combobox" item.
- Groups ("Recently used") and `emptyMessage` are not used: the server already orders names recent-then-frequent, and an empty list is fine because any new name is allowed.

## Tests

- `frontend/src/exercise-names.test.tsx`: imports the shared `Combobox`; the filter test uses `filterComboboxGroups` with one plain group. New: in the routine form's step 3, typing shows earlier names, picking sets the value, and a similar spelling offers Replace, which sets the existing name.
- `frontend/src/routines.test.tsx`, `e2e/ui-touch.spec.ts`: the routine exercise field is now a `combobox` role, not a `textbox`.
- `npm run test -w frontend -- src/exercise-names.test.tsx src/routines.test.tsx src/components/ui/combobox.test.tsx`: 3 files, 30 tests passed.
- `npm run lint`, `npm run typecheck -w frontend`: passed.

## Browser check (2026-11-16)

Production build on localhost with a stub API (names: Benchpress, Squat, Front Squat), Chrome at 390x844 and 1440x900, routine form step 3: "sq" lists Squat and Front Squat; "bench press" offers Benchpress and the Replace hint; no horizontal overflow. At 1440 the name and Machine fields line up after the alignment fix.
