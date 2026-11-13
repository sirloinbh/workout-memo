# #28 feat: Routine-based daily, weekly, and 12-week goals, with rest-day schedule shifting and quick log entry

- Issue: https://github.com/sirloinbh/workout-memo/issues/28
- Branch: feat/28-routine-daily-goals
- Confirmed rules: issue comment "구현 착수 및 확정 규칙 — 2026-10-19" (Implementation start and confirmed rules — 2026-10-19)

## Changes — 2026-10-19 (Asia/Seoul)

### Server

- `backend/src/progress.ts` (new): split the routine progress calculation into pure functions.
  - `planTargets`: builds targets 1 to N in the order of the 84-day schedule from #27 (`routineSchedule`). Each target has its original week, whether it is a deload, the split, and the sets, total weight in kg, and reps per exercise (including the baseline).
  - `arrangeTargets`: takes a list of rest dates and rearranges the targets into workout-day slots in plan order. A slot where the user rested is left empty and the later targets move back by one workout day. The workout-day dates, the rest weekdays, and the 12-week end date (start date + 83 days) do not change, and the last target that overflows is not deleted but returned as `excluded`.
  - `restUnavailable` / `restPreview` / `routineProgress`: build whether resting is possible (already resting, outside the routine period, not a planned workout day), the preview before running (moved schedule `from → to`, targets that would newly be excluded), and the data for today, this week, and the 12-week table. The preview and the actual application are calculated with the same `arrangeTargets`.
- `backend/src/app.ts`
  - `GET /api/routine-progress`: among the routines whose start date is on or before today (Asia/Seoul), picks the one with the latest start date (latest ID on a tie) as the active routine. If there is none, `{ today, routine: null }`. For each of today's target exercises, it also returns the most recent real log set before today as `previous` (reference value). Exercise names are compared with `lower(trim())`, as in the existing goal evaluation.
  - `POST /api/routines/:id/rests` `{ date }`: 409 if `date` is not today in Asia/Seoul on the server. In a transaction it locks the routine row with `FOR UPDATE`, checks that the routine is the active one and that the day can be rested, and inserts one row into `routine_rests`. If the same day is already a rest day, it writes nothing and returns 200 `applied:false` (a duplicate click or resend is ignored). The response is sent only after COMMIT succeeds.
  - `DELETE /api/routines/:id/rests/:date`: allowed only for the current day (server today), 409 for other days. A repeated cancel returns 200 `applied:false`.
  - `createApp(pool, { today })`: tests can inject today's date. The default is today in Asia/Seoul.
- `database/migrations/005_routine_progress.sql` (new): `routine_rests(routine_id → routines ON DELETE CASCADE, rest_date, created_at, PK(routine_id, rest_date))`, safe to re-run thanks to `IF NOT EXISTS`. Added how to apply it to `database/README.md`.
- A rest stores only the date and the schedule is derived by calculation, so it does not modify saved logs, sets, or the routine plan.

### Screen

- `frontend/src/progress.tsx` (new, hook-free display components and helpers): the "루틴 목표" (Routine goal) card on the workout log screen.
  - Today's goal: `Week N (deload) · split · that week's planned change` (shown in Korean as `N주차(디로딩) · 분할 · 해당 주 계획 변화`), per exercise `sets · total weight kg · reps`, the baseline, and the most recent previous record of the same exercise ("직전 기록 없음" (No previous record) if none). Weights of different exercises are not summed.
  - The list of this week's workout days, and the whole 12-week target table (one row per week, based on each target's original week, with an excluded marker "제외됨").
  - If there is no active routine, guidance to build a routine (루틴짜기).
  - "오늘 하루 휴식하기" (Rest today) → a confirmation area that shows the schedule that will move and the last target that will be excluded → "휴식 확정" (Confirm rest). After resting, "휴식 취소" (Cancel rest, same day only).
  - "오늘 루틴으로 기록하기" (Log with today's routine): opens a log editor filled with as many set rows (exercise, total weight, reps, no machine selected) as today's target has sets.
- `frontend/src/main.tsx`
  - Quick entry uses the existing flow of `setEditor` → localStorage draft → `saveWorkout` (Idempotency-Key retry) as it is. No server request is made before saving, and the button is disabled while an existing draft is being restored.
  - In the editor's set rows, if the exercise is in today's routine, a reference text "오늘 목표 · 직전 기록" (Today's goal · previous record) is shown (not put into the draft body).
  - The "다른 운동 추가" (Add another exercise) button can add an empty set row for an exercise outside the routine. The existing date, machine, memo, and total weight inputs, editing, and "세트 추가" (Add set) are kept. Today's routine exercises were added to the exercise-name autocomplete.
  - While a rest request is in flight, a ref lock prevents duplicate clicks. After a log is saved successfully, the routine goal (previous record) is fetched again.
- `frontend/src/style.css`: styles for the card, the confirmation area, the 12-week table, and the set reference text, and horizontal scrolling of the table at 760px and below.
- `README.md`: added a feature description.

## Judgment calls (conservative choices outside the confirmed rules)

1. **Weekly target calculation**: #27 stores only per-exercise baselines and manual weekly changes. Today's target is calculated as "baseline + that week's change applied once" (a decrease for deloads), and is not accumulated across weeks. The screen shows the baseline and the weekly change together so the basis of the calculation can be checked. If accumulation is intended, only `weekExercises` needs to change. **User confirmation needed.**
2. A decreased result is limited to the log input range: total weight 0 to 99999 kg (rounded to two decimals), sets and reps at least 1.
3. A rest is allowed only when today is a planned workout day within the routine period and targets remain. The button is not shown on rest weekdays or outside the period, and the server also rejects it with 409. Adding a rest for a past date is not supported.
4. A rest is rejected for a routine that is not the active one (when a routine that started later exists). A cancel deletes only that routine's rest row for the day.
5. A rest is allowed even if today's log is already saved (the log does not change).
6. The previous record shows all sets of the same exercise from the most recent log on a date before today (`date < today`). A record already saved today is excluded from the reference.
7. The title of a quick-entry log is `routine name · split name`, and the machine is left unselected (null). The routine has no machine information, so no official weight is added arbitrarily. Set rows are cut at the log limit of 200.
8. The goal card is shown only on the workout log screen (not added to the dashboard).
9. There is still no routine edit or delete API (outside #27's scope). If a routine is deleted from the DB, its rest records are also deleted by CASCADE.

## Tests

Added or changed tests:

- `backend/test/routine-progress.test.ts` (new, 13 tests): a weekly change applied once, non-accumulation, and the deload lower bound; no rest; with one rest, the shift and exclusion of the last target (end date and dates fixed); consecutive rests on different days; a duplicate on the same day; week and deload attribution (a week 3 target pushed to a week 4 date is still week 3, and a deload target stays a deload); resting on the last workout day; rejecting a non-workout day or outside the period; preview = applied result for every workout day and prior-rest combination; and the data for today, this week, and the 12-week table. API (fake pool): a date different from server today, an invalid date, or an invalid ID gives 400 or 409 with no repository access; cancel on a day other than today gives 409; after one application a duplicate does no INSERT; a non-workout day does ROLLBACK; a COMMIT failure gives 500, ROLLBACK, and no success response; and the no-routine guidance.
- `backend/test/routine-progress.integration.test.ts` (new, dedicated DB required, 6 subtests): choosing the most recently started routine, the planned values, and the previous-record reference values; rejecting a rest for a routine that is not active; on a real DB, no rest row stored when COMMIT fails; two concurrent duplicate POSTs → 201/200 and one row; applied result = preview; end date fixed; saved sets unchanged; cancel on another day 409, same-day cancel restores, repeated cancel is a no-op; and consecutive rests on different days accumulate. It shares the DB with other test files, so it uses a start date in 2097 and cleans up only the routines and logs it created.
- `backend/test/routine-progress-ui.test.ts` (new, 5 tests): runs the real `main.tsx`/`progress.tsx` with the existing rendering-adapter method. The server response is calculated with the real `routineProgress`. It checks per-exercise goals, baselines, previous records, no summing, and the 12-week table on the log screen; the no-routine guidance; fill the draft → no request before saving → save as is (Idempotency-Key, body check, draft cleanup, goal re-fetch); edit reps and add an exercise outside the routine, then save; and rest preview (shift and excluded) → one POST even with consecutive clicks in the same render → rest marker and excluded row → same-day cancel restores, with no log created.
- `backend/test/workout-draft-ui.test.ts` (changed): added only a loader branch that loads the new `./progress` import as the real module. Existing assertions were not changed.

Order record: I wrote the implementation (`progress.ts`, the API) first, then wrote the tests in the same task. I did not reproduce a failure before implementation. Instead, I confirmed that the UI consecutive-click test fails (4 pass / 1 fail) when the `restPending` lock is temporarily removed and passes when it is restored.

### Commands actually run and results

- `node node_modules/tsx/dist/cli.mjs --test test/routine-progress.test.ts` (backend, Node 24.21.0): first run 11 pass / 2 fail (test expectation errors: how the preview-excluded target is compared, and where the failure is injected). After fixing the tests, **13 pass / 0 fail / 0 skip**.
- `node node_modules/tsx/dist/cli.mjs --test test/workout-draft-ui.test.ts test/period-ui.test.ts test/routines-ui.test.ts`: **43 pass / 0 fail / 0 skip**.
- `node node_modules/tsx/dist/cli.mjs --test test/routine-progress-ui.test.ts`: **5 pass / 0 fail / 0 skip**. With the lock-removal mutation, 4 pass / 1 fail.
- `issue-check.ps1 -Issue 28 -Script test -Migrate` (apply 001 to 005 to the dedicated DB `workout_test_28`, then `npm test`): **229 pass / 0 fail / 0 skip** (before adding the UI tests). Confirmed that all 6 integration subtests ran and passed.
- First `issue-check.ps1 -Issue 28 -Migrate` (`npm run check`): EXIT=1 at the format:check step because of Prettier warnings on `README.md` and `database/README.md`. Formatted with Prettier and re-ran.
- Second `issue-check.ps1 -Issue 28 -Migrate`: **EXIT=0**. format:check, lint, and typecheck passed. App tests **234 pass / 0 fail / 0 skip** (including dedicated-DB integration), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, frontend (vite) and backend builds passed.

## Limits and follow-up

- No real browser check was done. Layout (especially the 12-week table and the set reference text at 760px and below), focus, native validation, and React scheduling are outside the rendering adapter's scope.
- Number of operations compared with direct entry: if the log matches today's goal, it is saved with 2 clicks, "오늘 루틴으로 기록하기" (Log with today's routine) → "기록 저장하기" (Save record), with no need to enter the title, exercises, or per-set weight and reps. The saving rate was not measured.
- Judgment call 1 (how the weekly goal is calculated) needs user confirmation.
- If a rest is applied from another device between the rest preview and the confirmation, the confirmation is handled as a duplicate (200) and shows the latest schedule. If midnight passes, a date mismatch 409 asks for confirmation again.
- Final `issue-check.ps1 -Issue 28 -Migrate` after writing this change record: **EXIT=0**. App tests 234 pass / 0 fail / 0 skip, `test:agents` 162 pass / 0 fail / 0 skip, `test:skills` 4 pass / 0 fail / 0 skip, builds passed.

## Coordinator review and real-browser check — 2026-10-19

- Independent review (read-only): no blocking findings. Confirmed split rotation (advances only on workout days), keeping the original order on rest, fixed end date, and overflow targets kept as "제외됨" (excluded), combinations of several rests and cancel restore, idempotency by `FOR UPDATE` + PK + `ON CONFLICT`, parameterized queries, the previous-record lookup (excludes today, `lower(trim())`), and that quick log does not create a record before saving.
- Review notes (P3): (1) The weekly target is calculated as "baseline + that week's change" (not accumulated). The #27 screen wording ("total weight kg N increase") alone does not make it clear whether it accumulates, so **user confirmation is needed**. (2) A rest can be applied even after today's log is already saved (the saved log does not change). (3) A rest cancel does not re-check whether the routine is the active one (it deletes only the row for the day).
- Real browser (Playwright, dev server on the dedicated DB `workout_test_28`, routine with start date 2026-10-12, Mon/Wed/Fri, 2 splits):
  - Mobile 390px log screen: today (10/19, week 2) lower-body goal "스쿼트 4세트 · 80 kg · 7회(기준 6회 +1)" (Squat 4 sets · 80 kg · 7 reps (baseline 6 reps +1)), 3 workout days this week, and the split rotation (10/12 upper → 10/14 lower → 10/16 upper → 10/19 lower) are correct.
  - "오늘 하루 휴식하기" (Rest today) → preview: the remaining targets keep their original week and deload marker while moving back by one workout day each (for example week 2 lower 10/19 → 10/21, week 4 deload lower 11/02 → 11/04). Double-clicking "휴식 확정" (Confirm rest) produced only 1 rest day and 1 excluded target (the week 12 deload lower). "휴식 취소" (Cancel rest) → 0 rest days, 0 excluded, and today's goal was restored.
  - "오늘 루틴으로 기록하기" (Log with today's routine) → the draft has Squat 4 sets (80 kg × 7 reps) and shows "목표 80 kg × 7회 · 직전 기록 없음" (Goal 80 kg × 7 reps · no previous record). 0 server records before saving, 1 after (4 sets), and the status "서버 저장 완료" (Saved to server). No horizontal scrolling.
  - PC 1440px: the routine goal card, statistics, and record list layout is normal.

## Rule change: automatic progressive overload and a default of 3 sets — 2026-10-19 (Asia/Seoul)

Reflects the issue comment "규칙 변경 — 자동 점진 과부하와 기본 3세트" (Rule change — automatic progressive overload and default 3 sets) (the user's request). #27's rule "weekly targets entered manually, not calculated automatically" changes to automatic calculation for new routines only.

### Changes

- `backend/src/domain.ts`: added `progression: 'manual' | 'auto'` (optional) and per-exercise `rep_min`/`rep_max` (optional) to the routine JSON. `auto` requires a rep range (lower ≤ upper) and rejects `weeks` if given. If the field is absent, it is treated as an existing #27 manual routine and still requires the 12-week `weeks`. No DB migration was added (the fields are inside the JSONB document).
- `backend/src/progress.ts`: added the automatic target calculation.
  - Increment `incrementFor`: current weight × 5% rounded to 2.5 kg units, at least 2.5 kg. Deload `deloadWeight`: the previous week's target weight × 0.9 rounded to 2.5 kg units, same reps.
  - Step `progressionStep`: reps +1; when it exceeds the upper bound, weight + increment and reps reset to the lower bound. For 0 kg, only reps go up to the upper bound and are then held.
  - Reflecting real records: for each exercise, it goes through the weeks where the split is placed in order, and takes from that week's first workout day to the day before the next week's first workout day as the evaluation window. If a set at or above the target weight and reps, in a single log within the window, is at least the planned number of sets, it progresses as `achieved`. If the window ends with none, it is `missed`, keeps the same target, and recalculates the remaining weeks. A window that is still open is assumed achieved and the later targets are projected. Dates after today and excluded targets are `projected: true` (projected).
  - A deload week is not evaluated and progression pauses. The next week continues from the evaluation result of the target before the deload.
  - `arrangeTargets(plan, rests, records, today)`: first decides the rest shift (plan order, fixed end date, keeping excluded targets), then calculates the evaluation windows with the moved dates. The preview and the application are calculated from the same records.
- `backend/src/app.ts`: for an automatic routine, reads the saved sets of the planned exercises between the routine period's start date and today (up to the end date) and uses them for evaluation. It reads the set row with `to_jsonb(s)->'completed'` so it works even without the `completed` column (PR #51, not merged), and when the column appears it excludes only sets that are `false`.
- `frontend/src/progression.ts` (new): does the same calculation without records, for the routine form preview. Backend tests compare the results of the two implementations.
- `frontend/src/routines.tsx`: a "주차 목표 방식" (Weekly goal method) selector (default automatic, manual kept). For automatic, it takes sets per exercise (default 3), current total weight, current reps, rep lower bound (8), and upper bound (12), and shows the rule description and the 12-week projected targets (reps +1, increase +X kg, hold, deload). The weekly manual input is shown only in the manual method. The detail screen also shows the rule and projected targets for an automatic routine. The save body sends only the fields of the chosen method (manual sends `progression: 'manual'` and the existing fields).
- `frontend/src/progress.tsx`: for an automatic routine, shows the weekly change ("자동 · 이중 점진 과부하" (Automatic · double progressive overload), deload "자동 (직전 주 중량 90%)" (Automatic (90% of the previous week's weight))), per-exercise "달성" (achieved) / "미달성(유지)" (missed (held)) / "예상" (projected) markers, and guidance text.
- `frontend/src/main.tsx`: the "운동 기록하기" (Log workout) editor starts with 3 empty sets. The default number of sets when adding an exercise in the routine form is also 3. The draft and retry-key flow is unchanged.
- `README.md`: added a description of automatic targets and the default 3 sets.

### Judgment calls

1. The week 1 target is the entered current performance as it is, and progression starts in week 2 (the first week confirms current ability).
2. The progression unit is "a week in which the exercise is placed". If the split is not placed in that week, the week is skipped and the step is not raised. If the same split appears several times in the same week, it is the same target, and achieving it just once among them is enough.
3. Achievement is judged within a single log that fills at least the planned number of sets, and sets from several logs are not combined. More sets than planned are allowed. Exercise names are compared with `lower(trim())`, so if the same exercise name is in several splits, they share the same records.
4. A past week with no records at all is treated as missed and held (the case where the user skipped a workout without using rest).
5. Existing saved routines and API requests without `progression` are handled as manual (compatibility). "New routines default to automatic" is applied as the screen default.
6. If the starting weight is not a multiple of 2.5 kg, the increment is added as it is, and only the deload is rounded to 2.5 kg units. The result is limited to the log range (0 to 99999 kg).
7. If the current reps are outside the range, it starts as is (below the lower bound it goes +1 every week; above the upper bound it increases weight and resets to the lower bound the next week).
8. The evaluation is recalculated from the saved logs each time. If a past log is edited, later targets are recalculated too. No history is stored separately, so no new migration is needed.

### Tests

- `backend/test/routine-progression.test.ts` (new, 9 tests): schema (automatic requires a rep range and rejects weeks, existing manual compatibility), increment rounding, minimum, and deload rounding; the 12-week projection (reps +1, reset to the lower bound, deload, resume; dumbbell 2.5 kg increment; bodyweight holding at the upper bound; default 3 sets and the projected marker); progress on achievement, hold on a miss and the recalculation afterward, hold with no records, today's target confirmed; the `completed` flag (false excluded, extra sets, column absent or null); projection of an open week; hold after a deload with no records; rest shift keeping weeks and values, and the evaluation of a record on the moved day; and the frontend preview matching the server calculation.
- `backend/test/routine-progression.integration.test.ts` (new, dedicated DB): saving an automatic routine (no `weeks`), bench achieved → progress with real logs, curl one set short → hold and the recalculation of later weeks, no records → hold, result display, future projection, weeks and values kept after applying a rest, and saved sets unchanged.
- `backend/test/routines-ui.test.ts`: new automatic form test (default automatic, rule description, manual changes not shown, default 3 sets and 8 to 12 reps, projected target display, no request, save body, detail screen). The two existing manual form tests make the same checks after switching "주차 목표 방식" (Weekly goal method) to manual, and I only added `progression: 'manual'` to the expected save body.
- `backend/test/routine-progress-ui.test.ts`: added the automatic routine card (today's confirmed value, future "예상" (projected), automatic deload display, week 5 105 kg × 8 reps, quick entry with 9 sets). The mock server uses the new arguments of `routineProgress`.
- `backend/test/workout-draft-ui.test.ts`: added tests for the new editor's 3 empty sets and the local draft. The existing `fill()` deletes 2 sets and so still checks the one-set save scenario as before.

### Commands actually run and results

- `issue-check.ps1 -Issue 28 -Script test -Migrate` before implementation (only tests added): **247 tests / 231 pass / 16 fail / 0 skip**, EXIT=1. The failures are from the unimplemented automatic progression (schema, increment, projection, evaluation, parity, integration, UI) and the default of 1 set.
- Problems found and fixed while running related files during implementation: the weekday checkbox label '목' (Thu) overlapped at the start with the "목표 방식" (goal method) label, so I changed the label to "주차 목표 방식". In the test adapter's default ES5 transform, a Set spread became an empty array, so I changed it to `Array.from`. 0 kg appeared as an empty string in the adapter, so I displayed it with `String()`. I changed vm array comparison to a JSON round trip.
- First `issue-check.ps1 -Issue 28 -Migrate`: EXIT=1 from a Prettier warning on `workout-draft-ui.test.ts` in format:check. Formatted and re-ran.
- Final `issue-check.ps1 -Issue 28 -Migrate`: **EXIT=0**. App tests **247 pass / 0 fail / 0 skip** (including dedicated-DB integration; confirmed the new automatic integration test ran), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, lint, typecheck, and frontend/backend builds passed.

### Limits

- No real browser check was done for this change (rendering adapter scope).
- The `completed` column of PR #51 could not be verified on a real DB (not merged). The behavior when the column exists was confirmed only by unit tests.
- Re-ran the final `issue-check.ps1 -Issue 28 -Migrate` after writing the change record: **EXIT=0** (app 247/0/0, agents 162/0/0, skills 4/0/0, builds passed).

## Coordinator review and real-browser check — automatic progression and default 3 sets (2026-10-19)

- Independent review (read-only): no blocking findings. Confirmed the increment (20 kg → 2.5, 80 kg → 5, minimum 2.5), reps-only increase for 0 kg exercises, a deload based on the previous non-deload target and progression continuing the next week, the week window (reflecting rest shifts, Seoul date string comparison), working both with and without the `completed` column (`to_jsonb(s)->'completed'`), backward compatibility with manual routines, Zod's `rep_min <= rep_max` and rejecting `weeks` in automatic mode, and that the preview matches the server calculation. The draft test change to fit the default 3 sets reflects the confirmed rule and is not a weakening of the check.
- Review notes (P3, handled by documenting): (1) A current rep count outside the rep range is not rejected. If it is above the upper bound (for example 15 reps, range 8 to 12), it increases weight in week 2 and drops to the lower bound; if it is below the lower bound, it rises by 1 each time. If the user can currently do the upper bound or more at that weight, increasing fits the intent of the rule, so I keep it. (2) If a rest pushes the week's first workout day later, a log saved before that date is not counted as achieving that week.
- Real browser (Playwright, dev server on the dedicated DB `workout_test_28`):
  - Mobile 390px Build routine (루틴짜기): the defaults are "자동 · 이중 점진 과부하" (Automatic · double progressive overload), 3 sets, rep lower bound 8, upper bound 12. The rule description is shown. With Bench press 60 kg × 10 reps and Mon/Wed/Fri entered, the 12-week preview is 60×10 → 60×11 → 60×12 → week 4 deload 55×12 → 62.5×8 (increase +2.5) → 62.5×9 → 62.5×10 → week 8 deload 57.5×10 → 62.5×11 → 62.5×12 → 65×8 (increase +2.5) → week 12 deload 57.5×8, matching the rule.
  - Host `npm run check` (including fixes): exit 0 — app and DB 248, worker 162, skills 4 pass, 0 fail and skip.
  - Log after saving: today's goal "벤치프레스 3세트 · 60 kg · 10회" (Bench press 3 sets · 60 kg · 10 reps) and the automatic goal description. An existing manual routine still opens in the list and card (backward compatibility).
  - "운동 기록하기" (Log workout) starts with 3 sets.
  - **Found and fixed:** after saving a new routine in Build routine and going back to the log, the goal card kept showing the previous routine (it only updated after a refresh). I fixed it to re-fetch the active routine every time the screen changes. The regression UI test failed before the fix (0 pass / 1 fail) and after the fix `routine-progress-ui.test.ts` gives 7 pass.

## Rule change: progression per split (workout day) — 2026-10-19 (Asia/Seoul)

Reflects the issue comment "규칙 변경 — 주 단위가 아니라 분할(운동일) 단위로 진행" (Rule change — progress per split (workout day), not per week). It replaces the "weekly progression" of the previous section.

### New rules

- The progression unit is a session (workout day) of the split that contains the exercise. At each session reps go +1, and when above the upper bound the weight increases by about 5% (2.5 kg units, at least 2.5 kg) and reps reset to the lower bound; for 0 kg only reps increase. With 3 workouts a week and no split, there are 3 steps a week; with 3 workouts a week and 2 splits, it is A/B/A and B/A/B, and each split progresses 1 to 2 steps a week. The first session's target is the entered current performance.
- Evaluation window: from that session's date to the day before the next session of the same split (for the last session, up to the plan end date). If, in a single log within the window, the sets at or above the target weight and reps (only completed sets if a completed column exists) are at least the planned number of sets, the next session progresses; if the window ends with none, the next session has the same target too. An open window and future sessions are projections.
- Deload: all sessions in weeks 4, 8, and 12 (the target's original planned week) use the previous non-deload target weight × 0.9 (2.5 kg units) and the same reps, and are not evaluated or progressed. The next session continues from the evaluation result of the target before the deload.
- **Why the deload basis stays the calendar week:** the original requirement was "a deload every 4 weeks". If it were based on the number of sessions (for example every N workouts), the deload interval would vary a lot with workouts per week and the number of splits (the same N workouts differ by several weeks between 3 workouts a week with no split and 2 workouts a week with 3 splits). So I kept weeks 4, 8, and 12 (coordinator decision, delegated by the user).
- Display: the session order (the n-th workout day) is attached to the target. The routine form and detail preview group by week and show "1주차: 1번째 100 kg × 10회(시작), 2번째 …" (Week 1: 1st 100 kg × 10 reps (start), 2nd …); on the routine goal card, today and this week show "3주차 2번째 · 분할 A" (Week 3, 2nd · split A), and the 12-week table shows "n번째" (n-th) after the date. The on-screen rule description (in Korean) was also changed to the session basis. The display of manual routines was not changed.
- The rest rules (keeping plan order, fixed end date, keeping excluded targets, same-day cancel), deload attribution (the original planned week), the default 3 sets, and manual routine compatibility are unchanged.

### Changed files

- `backend/src/progress.ts`: changed `autoExercises` to per-session. Added `session` (the n-th workout day within the planned week) to the target.
- `frontend/src/progression.ts`: `splitSessions`, per-session `projectExercise`, and the per-week grouping `byWeek`. The same calculation as the server (confirmed by the parity test).
- `frontend/src/routines.tsx`, `frontend/src/progress.tsx`, `README.md`: session display and rule text.

### Judgment calls

1. "n-th" is the n-th workout day of that week (an order independent of the split), and even if a rest moves the date, it keeps the number of the original plan order.
2. If a rest pushes the next session back, the previous session's evaluation window also grows. So a window that had already closed can reopen and change to the assumed-achieved (projected) state. I stated this behavior in the integration test (when resting today, the moved session has a projected target one step higher).
3. A record saved on the next session's date is used only for the next session's evaluation (the window end is up to the day before the next session).

### Tests

- `backend/test/routine-progression.test.ts` (rewritten to 9 tests): schema compatibility, increment and deload rounding, per-session progression for 3 workouts a week with no split (36 sessions, deload values in weeks 4, 8, and 12, and resuming in week 5), dumbbell and bodyweight, per-split progression and deload for 3 workouts a week with 2 splits A/B/A and B/A/B, session window evaluation (record inside the window, one set short holds, no record holds, a record on the next session's day belongs to it, today confirmed and future projected), the completed flag, no evaluation of deload sessions and resuming afterward with a missed hold, rest shifts (plan order and session values kept, evaluating a record on the moved day, the 4-week calendar shift of a week 3 target and the 5-week calendar shift of a deload target), and the frontend preview matching the server value and the week/session numbers (no split and 2 splits).
- `backend/test/routine-progression.integration.test.ts`: changed to use the third session's date: session 1 achieved → session 2 progresses, session 2 no record → today holds, curl miss holds, week 5 curl 45 kg × 9, and the moved session after a rest (week 1, 3rd) has a projected 100 kg × 12.
- `backend/test/routines-ui.test.ts`: changed the automatic form preview text to the per-week session notation and checks the session rule description. The detail screen shows "5주차: 1번째 110 kg × 9회(반복 +1)" (Week 5: 1st 110 kg × 9 reps (reps +1)).
- `backend/test/routine-progress-ui.test.ts`: today "1주차 1번째 · 전신" (Week 1, 1st · full body), the 12-week table's week 1 3rd 100 kg × 12 reps, and week 5 1st 110 kg × 9 reps.

### Commands actually run and results

- `issue-check.ps1 -Issue 28 -Script test -Migrate` before implementation (only tests updated): **248 tests / 238 pass / 10 fail / 0 skip**, EXIT=1. The failures are because the weekly calculation and the session display are not implemented.
- After implementation, on the related files `node node_modules/tsx/dist/cli.mjs --test test/routine-progression.test.ts test/routine-progress.test.ts test/routines-ui.test.ts test/routine-progress-ui.test.ts`: **35 pass / 0 fail / 0 skip**.
- Final `issue-check.ps1 -Issue 28 -Migrate`: **EXIT=0**. App tests **248 pass / 0 fail / 0 skip** (including dedicated-DB integration; confirmed the automatic integration test ran), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, lint, typecheck, and builds passed.
- This change was not checked in a real browser.

## Coordinator review and real-browser check — per-split (session) progression (2026-10-19)

- Independent review (read-only): no blocking findings. Confirmed that each split progresses only in its own sessions (A/B/A–B/A/B), that the preview and the server schedule and step calculation match, that after a rest shift the deload still follows the original planned week, that if the session right before a deload was missed it resumes from the held target, the window boundary (`start <= date < stop`, a record on the next session's date belongs to the next session), and the `completed` handling.
- Review note (P3, recorded as policy): if the same exercise name is in several splits, progression is calculated separately per split, but records are matched only by exercise name. So a record on a day of split A can fall in the evaluation window of split B that is open during the same period. If the splits must be fully separated, a separate rule is needed.
- Real browser (mobile 390px, dedicated DB):
  - Preview with 2 splits, 3 workouts a week (Mon/Wed/Fri), A Bench press 60 kg × 10 reps and B Squat 80 kg × 8 reps. A progresses with week 1 1st and 3rd (60×10→11), week 2 2nd (60×12), and week 3 1st 62.5×8 (+2.5 kg). B has week 1 2nd 80×8 and week 2 1st and 3rd 9 and 10 reps, each progressing only in its own sessions. All the sessions of the week 4 deload week are at 90% (A 57.5 kg, B 72.5 kg × 2 reps), and week 5 continues from the target before the deload. The squat increment is +5 kg, 5% of 80 kg rounded to 2.5 kg units. No horizontal scrolling.
  - Log card after saving: today (Mon) "1주차 1번째 · 분할 1 · 벤치프레스 3세트 · 60 kg · 10회" (Week 1, 1st · split 1 · Bench press 3 sets · 60 kg · 10 reps), Wed "1주차 2번째 · 분할 2 · 스쿼트 80 kg · 8회 · 예상" (Week 1, 2nd · split 2 · Squat 80 kg · 8 reps · projected), Fri "1주차 3번째 · 분할 1 · 벤치프레스 60 kg · 11회 · 예상" (Week 1, 3rd · split 1 · Bench press 60 kg · 11 reps · projected).
  - Host `npm run check` (including fixes): exit 0 — app and DB 249, worker 162, skills 4 pass, 0 fail and skip.
  - **Found and fixed:** on the first save attempt, when one split was missing body parts, the server showed Zod's default English message "Array must contain at least 1 element(s)" as it was (behavior since #27). I set the Korean message "분할마다 운동 부위를 1개 이상 선택하세요" (Select at least one body part for each split) on the body-part array validation. The regression test (`routines.test.ts`) failed before the fix and gives 50 pass after it.
