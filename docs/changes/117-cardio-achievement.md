# #117 part 3: cardio achievement rate for the routine in progress

- Issue: https://github.com/sirloinbh/workout-memo/issues/117 (part 3 of 3; part 1 was #319 and part 2 was #321)
- Change: feat
- Decisions: the user's answers on 2026-11-16, recorded in https://github.com/sirloinbh/workout-memo/issues/117#issuecomment-6906362576

## Purpose

Routine cardio items were planned (part 1) and shown on today's card with a pre-filled log (part 2), but nothing said whether they were done. The routine goals card now sums up the cardio done so far and marks each judged item.

## Rules (user decision)

- A planned item is **done** when all of these hold for a saved cardio record:
  - it has the same type
  - it is dated in the session's window: the session date until the next session of the same split (exclusive), and the last one until the plan end, the same window auto strength goals use
  - it meets that week's target: time ≥ the target minutes, or distance ≥ the target km
- An interval item counts with any record of its type.
- One record counts for one item only. Sessions are matched in date order. Within a session, the most demanding item picks first (distance, then time, larger targets first, intervals last), each taking the earliest record that fits.
- A closed window without a matching record is **missed**. An open window has no mark yet.
- The summary counts the items of sessions dated on or before today: "Cardio: X of Y planned items done (Z%)".

## Changes

- `backend/src/progress.ts`:
  - `judgeCardio` adds `result` to every cardio item of the scheduled targets.
  - `routineProgress` takes the cardio records as an optional 5th argument and returns `cardio_summary`, which is `null` when no split has cardio.
  - `today_plan`, `this_week`, `days` and the 12-week `weeks` all use the judged targets.
  - Rest previews and excluded targets are unchanged.
- `backend/src/routes/routines.ts`: `planCardio` reads `cardio_sessions` from the plan start to today (capped at the plan end), only for a routine with cardio.
- `frontend/src/routine-cardio.ts`: `cardioResultText` ("… · Done" or "… · Missed") and `cardioSummaryText`.
- `frontend/src/progress.tsx`:
  - the summary line under the routine name
  - the marks on today's cardio items
  - "/ Cardio: … · Done" after each entry's exercises in the 12-week table
- `docs/api.md`: `result` and `cardio_summary`.

## Verification

Tests added or changed:

- `backend/test/routine-cardio.test.ts`:
  - matching a time, a distance and an interval
  - 29:59 against 30 min and 4.9 km against 5 km
  - the wrong type
  - one record counting once
  - open, closed and missed windows
  - a record on the next session's date going to that session
  - a deload week target
  - the summary, and no summary for a routine without cardio
  - The part 2 test now expects `result: null` on today's open item.
- `backend/test/routine-cardio.integration.test.ts` (new): through the API and the DB, the records inserted directly (2099 dates) give `achieved`/`missed`/`null` and `{ done: 2, planned: 4 }`. A 4.999 km row falls short of 5 km. The test cleans up its records and routine.
- `frontend/src/routine-progress.test.tsx`: the summary line "Cardio: 1 of 2 planned items done (50%)", no mark on today's open item, and "· Done" in the 12-week table.
- `e2e/cardio-routine.spec.ts`: after saving the run at 390px, the card reads "1 of 2 … (50%)" and today's run shows "· Done". The axe scan of the card at 390 and 1440 still runs.

The backend and integration tests ran against a throwaway `postgres:17-alpine` test DB (127.0.0.1:15468, tmpfs, migrated). The checks ran one by one, not as one `npm run check`.

| Command                                                                                                                    | Result                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `npm run test -w backend`                                                                                                  | 386 passed, 0 skipped                                |
| `npm run test -w frontend`                                                                                                 | 66 files, 373 passed, 4 skipped (see the note below) |
| `npm run test:e2e --` cardio-routine, cardio, custom-range, layout, new-workout-defaults, ui-touch, ui-a11y, ui-responsive | 49 passed                                            |
| `format:check`, `lint`, `typecheck`, `contract:check`, `test:skills`, `test:docs`, `build`                                 | passed                                               |

Note: the first full frontend run reported 1 failed test, and its name was cut from the captured output. The next two full runs passed every test, so it was not reproduced or identified.

## Limits and follow-up

- Matching is greedy in session order. When two splits' windows overlap, one record goes to the earlier session's item.
- Within a session, the demanding-first order fixes the common cases, but it is not a full assignment search. For example, a distance item and a time item of the same type can still compete for a record that has both.
- A record outside every window (on a rest day after the plan end, or before the start) is not counted.

## Review round 1

No blocking findings. The reviewer confirmed:

- the window edges match `autoExercises`
- `planCardio`'s date range covers every window
- the exact `distance_km` comparison
- no record counts twice
- older routines keep their shape
- the rest endpoints return judged progress

Applied:

- An item could be marked missed while a valid match existed: in item order, an interval took the 45-minute run that a 40-minute item needed. The most demanding item now picks first. Test: an interval, a 20-minute and a 40-minute run, with the longest run first.
- Excluded targets (pushed past the plan end) now carry `result: null` like every other item.
- The 12-week table lists a session's cardio once ("/ Cardio: a · Done, b · Missed") instead of repeating "Cardio:".
- New tests:
  - a record on the plan's last day counts for the last session, which stays open on that day
  - a rest moves the first session and its window
  - excluded items are unjudged

Not applied:

- A live region on the summary line. It is static text on the card, and the card reloads on page change.

| Command                                               | Result                |
| ----------------------------------------------------- | --------------------- |
| `npm run test -w backend` (throwaway DB)              | 388 passed, 0 skipped |
| `vitest run src/routine-progress.test.tsx src/cardio` | 90 passed             |
| `lint`, `typecheck`                                   | passed                |
