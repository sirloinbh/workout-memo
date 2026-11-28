# #527 Remove the rest timer from the workout editor

- Issue: https://github.com/sirloinbh/workout-memo/issues/527 (epic #524)
- Branch: feat/527-remove-rest-timer

## What changed

- The editor no longer has a timer bar, "Rest over" state, announcement, vibration or start-on-set-completion. Marking a set done only marks it done.
- Deleted `frontend/src/rest-timer.ts`, `workspace/rest-timer-panels.tsx`, `workspace/use-rest-timer.ts`, `RestKind`/`restKindLabels` in `workspace/model.ts`, the per-exercise default rest times (`restDurations`, #84) and the `/exercise-body-parts` query that only picked the rest default. `onSetCompleted` is gone from `useWorkoutDraft`.
- Deleted tests: `rest-by-exercise.test.tsx`, `superset-rest.test.tsx`, `backend/test/rest-timer.test.ts`, `backend/test/rest-by-exercise.test.ts`, the timer cases in `set-completion.test.tsx` and `ui-responsive.spec.ts`. The set-completion checkbox tests stay.
- Settings: the "Rest timer" card is removed so Settings compiles. `usePush()` no longer syncs a timer, and `syncRest` is removed from `push.ts`. The rest-end push switch is kept as `workspace/rest-push-toggle.tsx` only until #528 removes it together with the server push.

## Choices for implementation

- `machines.single_joint` is kept. It is also shown in the Machine Library and its editor, so it is not only a rest-default input. No migration was added. Dropping it later needs its own issue.
- The localStorage keys `workout-memo:rest-timer:v1` and the rest durations key are left unread; stored data cleanup is #528.

## Verification

- `npm run check` without `TEST_DATABASE_URL` (DB integration tests skip locally); CI runs them. Results are in the PR.
