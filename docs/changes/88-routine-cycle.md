# #88 Automatic workout day and rest day selection for routines, and default body parts per split

- Issue: [#88](https://github.com/sirloinbh/workout-memo/issues/88)
- Branch: `feat/88-routine-cycle`
  - It started on top of `research/87-official-weights-followup`. This keeps the migration number order (010 to 014).
  - The merge order must be #91 → #92 → #94 → #95 → this PR.

## Decisions — 2026-10-21

- Default body parts
  - No split is the full body (all 8 selectable body parts).
  - The 5-split is chest / back / lower body (front and back) / shoulders / biceps, triceps, and abs.
- Biceps and triceps are separated from 'arms'.
  - Body part settings and routines already saved as '팔' (arms) stay as they are.
  - When choosing anew, only biceps and triceps are offered. The user can clear '팔' directly in exercise analysis. We do not guess and change the data.
- '하체' (lower body) in the table is filled with both 하체-앞 (lower body front) and 하체-뒤 (lower body back).
- The default schedule of a new routine is the cycle method. The weekday method can still be chosen.

## Change

- Schedule (`backend/src/domain.ts`, `frontend/src/progression.ts`)
  - I added `schedule_mode` (`weekday`|`cycle`, left out = weekday) and `cycle { train_days 1 to 7, rest_days 0 to 7 }` to `routineSchema`.
  - The cycle method counts a day as a workout day when `offset % (N+M) < N` from the start date. The rest weekdays must be an empty array. Sending `cycle` with the weekday method is rejected.
  - The plan is jsonb, so no migration is needed. Existing routines (no mode) are still calculated by the weekday method.
  - The schedule comes from a single place, `routineSchedule`, so the schedule shift of resting today (#28) and the automatic double progression work by the same rule under the cycle method too.
  - The screen preview also uses the same cycle rule.
- Body parts
  - The 8 selectable parts: 가슴 (chest), 등 (back), 어깨 (shoulders), 이두 (biceps), 삼두 (triceps), 하체-앞 (lower body front), 하체-뒤 (lower body back), and 복근 (abs)
  - Validation and sorting use `allBodyParts` (9 including the existing '팔' (arms)).
  - `014_biceps_triceps.sql`: it replaces the CHECK constraint of `exercise_body_parts` with one that includes biceps and triceps. Like 007, it uses Unicode escapes and is safe to re-run.
  - The weekly body part table in exercise analysis shows the '팔' row only when there is an exercise mapped to '팔'.
  - The rest timer (#84) classifies biceps and triceps as upper body.
- Screen
  - Routine planning: I added "운동 일정 방식" (workout schedule method) (cycle or weekday), and for the cycle method "연속 운동일" (consecutive workout days) and "이어지는 휴식일" (following rest days).
  - When you change the split method, it fills in the cycle for that number of splits and the default body parts per split.
    - No split and 2-split 2+1, 3-split 3+1, 4-split 4+1, and 5-split 5+2
    - The body parts are filled as in the table of the issue. '하체' becomes 하체-앞 and 하체-뒤, and '이두' and '삼두' are the new parts.
  - The saved plan view shows `N일 운동 · M일 휴식 반복` (N workout days, M rest days, repeating).
  - For the cycle method, it sends the server `rest_days: []` and `weekly_workouts = min(7, workout days)` (a nominal value).
  - The body part setting in exercise analysis offers biceps and triceps. A saved '팔' shows as a button until you clear it, and it is kept when saved.
- Documents: `docs/api.md`, `database/README.md`, `README.md`

## Tests

- `backend/test/routine-cycle.test.ts` (new)
  - The 84-day schedules of the 5 default cycles per split match the cycle rule. It also checks the split rotation and the deload weeks.
  - Schema: a saved weekday routine is unchanged, and mixing cycle and weekday fields is rejected.
  - When you choose rest today in a cycle routine, the remaining targets shift to the next workout day.
  - The screen preview and the server schedule are the same.
  - DB integration
    - Saving and reading the schedule of a cycle routine
    - Allowing the existing '팔'
    - Saving biceps and triceps in the body part setting after 014
- `backend/test/analysis.test.ts`
  - The body part list of an empty analysis (8 + unclassified)
  - Finding a row by body part name
  - The totals and sorting of the '팔' mapping, and the mapping schema
- `backend/test/rest-by-exercise.test.ts`: checks that biceps and triceps are classified as an upper body rest.
- `frontend/src/routines.test.tsx`
  - The default cycle method, the cycle and body part fill per number of splits, and no 'add 팔' button
  - The request body saved with an edited cycle
  - The existing weekday method tests change the mode to weekday, clear the filled body parts, and then verify the same things. A '팔' that is not in the UI is entered as '이두' instead.
- `frontend/src/analysis.test.tsx`: offering biceps and triceps, '팔' is not in the new choices, and keeping and showing a saved '팔'

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 303 pass, 0 skip (including the DB integration)
  - Frontend 101 pass
  - Workers 162, skills 4, docs 3, and build pass
- `npm run test:e2e` (the same test DB): 4 passed
- The first check failed in typecheck (TS2835). The new test imported `frontend/src/progression.ts` directly, so it fell into the backend (node16 ESM) check scope. I changed it to load it through a vm like the existing equivalence tests, and it passed.

## Limits and follow-up

- Existing '팔' data is not changed automatically. You must set each exercise to biceps or triceps again in exercise analysis to get the separated totals.
- The `weekly_workouts` of the cycle method is a nominal value not used in the calculation.
