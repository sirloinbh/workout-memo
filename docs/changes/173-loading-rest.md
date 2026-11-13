# #173 Use the shared Skeleton and Spinner for the loading display in the remaining places

#250 changed the exercise analysis, body records, the routine list, and some save buttons. This time I change the remaining places.

## Change

- Workout record list of the dashboard and the workout log (`app.tsx`)
  - While loading, it shows a `SkeletonList` instead of the text "기록을 불러오는 중…" (loading records…).
  - It is placed inside a region that has `aria-busy` and the name "운동 기록 목록" (workout record list). The status line for screen readers is kept as `sr-only`.
- Routine goal card (`progress.tsx`): while loading, it shows a `SkeletonText`. The region name is "루틴 목표 내용" (routine goal content), and the status line is the same as above.
- Rest confirm button (`progress.tsx`): while waiting for the processing, it shows `Spinner size="sm"`. The button is disabled as before.
- Workout record edit dialog (`app.tsx`)
  - The save button shows a `Spinner`.
  - The same `Spinner` is also placed before the "저장 중…" (saving…) status line. The status line is still a `Notice` (role="status") as before.
- All spinners are `aria-hidden`. Screen readers announce through the button name and the status line.

## Review

- First review applied (required): if the status line were moved to another wrapper only while saving, a new `role="status"` line would be created. Then a screen reader could miss the changed text. So I changed it to always keep the wrapper and only add or remove the spinner.
- First review applied (optional): if the first load of the routine goals failed, a placeholder that never ends stayed next to the error banner (the same problem as the "불러오는 중…" (loading…) text on main). When it fails, only the error banner is shown, and I added a check to the failure test.
- Check only: when the range is changed and the data is loaded again, the list also changes to a placeholder. On main the text was shown at the same time, so the behavior is the same.

## Out of scope

- The form of the routine builder screen (the `routines.tsx` save button) overlaps with agent3's work, so I did not touch it.
- The cardio screens (`cardio/*`, `cardio-goals.tsx`) are in the scope of other work, so I did not touch them.

## Checks

- `npm run test -w frontend -- src/loading-placeholders src/routine-progress src/set-completion src/forms src/new-workout-defaults src/period`: passed (6 files, 59 tests)
  - I added the workout log list and the routine goal card to the loading checks.
  - I added a check of the spinner on the log save button and the status line.
  - I added a check of the spinner on the rest confirm button.
- The whole `npm run test -w frontend`: 57 of 58 files passed. One long test in `routines.test.tsx` hit the 15-second limit during the full run. It passes when run alone (10/10). It is a file that has nothing to do with this change.
- Type check, ESLint, Prettier: passed
