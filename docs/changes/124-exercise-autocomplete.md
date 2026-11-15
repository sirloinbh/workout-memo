# #124 Exercise name autocomplete (log and goals) and similar-name hint

## Problem

Exercise names had to be typed in by hand every time. Even a small difference in the name (for example `벤치 프레스` / `벤치프레스`, both "bench press") makes goal judging, analysis, and increment units count them as different exercises. The `<datalist>` suggestions for the workout log set input were only the goals of today's routine, goals, and machine names; the exercise names actually logged were not there.

## User decisions (2026-11-10)

1. An app-only Combobox (WAI-ARIA, no new package, 44px touch targets). When a shared central Combobox exists, switch to it (project-standards#437).
2. A new API `GET /api/exercise-names` (sets, goals, routines, machines; most recent first, then most frequent; up to 50).
3. For similar names, only show a hint and a [바꾸기] (Replace) button; do not replace automatically.

Scope: this PR covers the workout log sets and the goal input. The routine input comes after agent3's step-by-step routine input PR, and setting body parts in the exercise analysis is a separate PR.

## Change

- Server: `backend/src/routes/exercise-names.ts`
  - Groups the workout log sets, goals, routine plans, and machine names by the same normalized name used in goal judging (`lower(trim())`). The most recent spelling is returned as `name`.
  - `uses` is the number of logs, goals, and routines that used the name. Many sets of one log count as 1.
  - `last_used` is the latest of the log date, goal start date, and routine creation date (Seoul). A name that only exists as a machine name has `uses` 0 and `last_used` `null`.
  - Sorting is by latest `last_used`, then larger `uses`, up to 50.
  - Updated `docs/api.md` and `docs/openapi.json`.
- Screen
  - `components/combobox.tsx`: the APG "list autocomplete with manual selection" pattern.
    - Keyboard: ↓ and ↑ to move, Enter to select (does not submit the form), Esc closes only the list.
    - The edit dialog (Radix Dialog) receives Esc in the document capture phase, so only while the list is open it is intercepted first in the window capture phase.
    - On touch screens the suggestion rows are at least 44px, and tapping a suggestion keeps focus in the input.
  - Filter (`components/combobox-filter.ts`): partial match that ignores spaces and case, showing up to 8.
  - The workout log set exercise name and the goal exercise name use the Combobox instead of `<datalist>` or a plain input.
    - Suggestions are the API list followed by the names the screen already knows (today's routine goals, goals, machines), without duplicates.
    - If the API fails, only the names the screen knows are used.
  - `SimilarNameHint`: if the input differs from an existing name only in spaces or case, it shows "기존 이름 'X'로 바꿀까요?" (Replace it with the existing name 'X'?) and [바꾸기].
    - It is placed below the input, outside the label (so it does not mix into the input name).
    - It uses `aria-live="polite"` instead of `role="status"`, so it does not collide with the save status line of the edit dialog.
- Adding the next set still inherits the exercise name and machine from the previous set as before (checked only, no change).

## Review

All problems from the first review were fixed.

- **A problem that would break e2e:** the name of the suggestion list, "운동명 후보" (exercise name suggestions), contained the input name "운동명" (exercise name). Playwright `getByLabel('운동명')` matches partially, so it finds two elements and fails in strict mode (the `workout-crud` and `new-workout-defaults` scenarios). I renamed the list to "이전에 쓴 이름" (names used before).
- **The list reopened after tapping a suggestion:** the list was inside the input's `<label>`, so the click passed to the input and opened the list again. I prevented the default action on suggestion clicks and added a regression test.
- **Desktop layout:** the similar-name hint took one cell of the set card grid and pushed "머신" (machine) to the next row. I put it in the same cell as the exercise name.
- **Screen readers:** when the hint area is empty, `display:none` may stop a later text from being read. When empty, it is kept as `sr-only` so it is always rendered, and I added a test.
- **Integration test:** the usage counts are now different so that the "자주 사용" (frequently used) sort is really checked (opposite to name order).
- **Optional suggestions also applied:**
  - Keys pressed during Korean composition are not used as list keys (`isComposing`).
  - Clicking the list padding or scrollbar keeps focus in the input.
  - The [바꾸기] button is 44px on touch screens.

## Checks

- `frontend/src/exercise-names.test.tsx` (8 tests): filter, merging suggestions, similar-name detection, Combobox keyboard, Esc, free input, touch selection, choosing a log suggestion and [바꾸기], and the saved body after choosing a goal suggestion
- `backend/test/exercise-names.integration.test.ts`
  - Inside a transaction that rolls back, it checks spelling grouping, counting a log once, Seoul date, recent-then-frequent sort, and machine names. It also checks that the route returns 200.
  - This PC has no test DB for this app, so it runs in CI.
- `npm run test -w frontend`: 58 of 59 files passed
  - One long test in `routines.test.tsx` hit the 15-second limit during the full run. It passes when run alone (10/10). The same thing happened with #270.
  - The log input selector was changed from `input[list="exercise-names"]` to `input[role="combobox"][id$="-exercise"]` (3 test files).
- openapi and api-contract tests, type check, ESLint, Prettier: passed
