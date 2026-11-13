# #31 feat: Set completion marks, rest timer, and optional RPE logging

- Issue: https://github.com/sirloinbh/workout-memo/issues/31
- Branch: feat/31-set-completion-timer-rpe

## Changes (2026-10-19)

- `database/migrations/006_set_completion_rpe.sql`: adds `sets.completed boolean NOT NULL DEFAULT true`, `sets.rpe numeric(3,1)`, and a CHECK (NULL, or 1 to 10 in steps of 0.5) with `ADD COLUMN IF NOT EXISTS`. Existing sets are performed records, so they stay completed and the goal achievement results do not change. Values are kept when it is re-run. Added the apply command and the meaning to `database/README.md`.
- `backend/src/domain.ts`: added `completed` (boolean, true if omitted) and `rpe` (number|null, null if omitted) to the set. RPE allows only a value from 1 to 10 whose double is an integer, and a string, 0, 10.5, 7.25, and so on give 400. A missing value stays null and is not turned into 0. `volume` excludes incomplete sets.
- `backend/src/app.ts`: when saving sets, stores both values in the same transaction. The goal achievement SQL looks only at sets where `s.completed`. The retry-key fingerprint uses the normalized body as it is, so a different completion state is a different request.
- `frontend/src/rest-timer.ts` (new): the pure logic of the rest timer. The remaining time is calculated as the difference between the stored end time (`endsAt`) and the current time; on pause it keeps the remaining ms, and on resume it creates a new end time. The displayed value is rounded up to whole seconds, so it never reaches 0:00 before the real end. The duration is an integer of 5 to 3600 seconds. A stored value is validated for format and range, and if corrupted it starts from the defaults (90 seconds, auto-start off).
- `frontend/src/main.tsx`:
  - Added, per set, a `완료`/`완료됨` (Complete / Completed) toggle button (`aria-pressed`) and an optional input `RPE (선택)` (RPE (optional)). If left empty it is sent as null.
  - The first set of a new record and a set made with `세트 추가` (Add set) start as incomplete. For an existing set read from the server, a missing `completed` is treated as completed.
  - The completion state is stored together in the existing #34 local draft and restored on refresh or reconnect. Added the two fields to the draft validation (an older draft is allowed even without the fields).
  - If a completion click repeats within the same render, it is ignored based on the latest draft stored synchronously, so the state does not flip back and the timer does not restart. Cancelling a completion does not touch the timer.
  - Rest timer panel: duration setting, start, pause, resume, cancel, and a checkbox `세트 완료 시 자동 시작` (Auto-start when a set is completed) (off by default). It is shown inside the edit window, and also at the top of the page if the timer is running while the edit window is closed. While running it only redraws once a second, and redraws immediately on `visibilitychange` and `focus` so that it shows the end-time-based value after returning from the background.
  - Statistics: cumulative volume, completed sets, and the graph count only completed sets, and workout days count only days with at least one completed set. The list shows the completed set count and `미완료 n` (n incomplete), and the set details show RPE and `미완료(통계 제외)` (incomplete (excluded from statistics)).
- `frontend/src/style.css`: added the complete button, the RPE row, the timer panel, and the layout at 760px and below.

## Judgment calls

- **Timer state is client-only**: only the settings, the auto-start flag, and the end time are kept in localStorage `workout-memo:rest-timer:v1`. It is not synced with the server or other devices. It saves only when the user operates the timer (it does not write on the initial render), and read and write errors are handled with try/catch and only a warning is shown. A notification while the browser is closed is out of scope.
- **The API default is completed**: sets from existing clients and scripts that do not send `completed` are stored as performed records, as before. With this decision, the goal evaluation is the same before and after the migration and for old clients.
- **New sets on screen start as incomplete**: I took as the basis the flow of entering during the workout and pressing complete after doing it (including auto-starting the rest). I judged it more conservative not to count an uncompleted set as actually performed. A user who records everything afterward has to mark each set as completed, so the edit window shows `완료 n / m세트` (Completed n / m sets) and a notice. Whether to change the default needs confirmation in the PR review.
- **Workout days**: a log that has only incomplete sets (only the plan entered) is not counted as a workout day. The log itself stays in the list.
- **Policy with #28**: if sets made by the routine or quick entry are sent as `completed:false`, they are only stored and are excluded from goals and statistics. The #28 implementation must use the same field.
- If the timer duration is changed while running, the end time of the current rest is kept and the change applies from the next rest. Values under 5 seconds, over 3600 seconds, or fractional are ignored.
- There is no server-side statistics API yet (statistics are calculated on screen from server records), and the server's evaluation was applied to the goal achievement SQL and the `volume` domain function.

## Tests

- `backend/test/rest-timer.test.ts` (new, 4 unit tests): remaining time based on the end time, the 59.999 s / 60 s boundary, no negative value after a long time in the background, pause, resume, cancel, and idempotent resume, the 5 to 3600 time range, changing the duration while running, and the default handling of corrupted or out-of-range stored values (including the clock going backward).
- `backend/test/set-completion.test.ts` (new): completed and RPE null when omitted, valid RPE (1, 1.5, 6.5, 9.5, 10, null), invalid RPE (0, 0.5, 10.5, 11, -1, 7.25, 8.1, '8', true, NaN) and rejecting a non-boolean completed, `volume` excluding incomplete sets, and 400 for an invalid RPE in POST/PUT before it reaches the repository. DB (dedicated test DB): the migration leaves existing rows as completed/NULL and keeps values when re-run, the DB CHECK rejects 0, 0.5, 10.5, 7.25; completion state and RPE are restored on save and re-read (missing is null), a duplicate submission with the same Idempotency-Key gives 1 record, an incomplete set on the deadline day is not achieved → achieved when edited to completed → not achieved again when the completion is cancelled, editing with an invalid RPE leaves the record unchanged, and a completed set on the day after the deadline is not achieved.
- `backend/test/set-completion-ui.test.ts` (new, 7 VM adapter tests): uses a controllable clock, timer, and window events. New set incomplete, completed, completion cancelled and the sent body; auto-start off by default, and after choosing it, only 1 start on duplicate clicks in the same render; the timer is kept when a completion is cancelled; setting the duration (3 seconds ignored), start, tick, pause (frozen even after 2 minutes in the background), resume, cancel; return from the background where only the clock moves without a timer callback (1:00 → 0:01 → rest over, no negative); after refresh, restoring the remaining time 0:45, completion state, RPE 8.5, and the auto-start setting; clearing RPE gives null; a corrupted timer stored value; and excluding incomplete sets from volume, set count, and workout days.
- Existing test changes: added the new defaults `completed: true, rpe: null` to the expected parse result in `workout-validation.test.ts` (the memo validation is the same). Added the `./rest-timer` module to the `workout-draft-ui.test.ts` VM loader. Fixed `useState` in the `period-ui.test.ts` adapter to run a lazy initializer function like React. No existing assertion was deleted or weakened.
- Regression check after implementation: I confirmed that temporarily removing the same-render duplicate-click guard and the completed filter on volume makes 2 UI tests fail, and then reverted.

## Actual run results

- `node ../node_modules/tsx/dist/cli.mjs --test test/rest-timer.test.ts test/set-completion.test.ts test/set-completion-ui.test.ts test/workout-draft-ui.test.ts test/period-ui.test.ts` (Node 24.21.0, DB not configured): **53 pass / 0 fail / 2 skip**. The 2 skips are DB integration tests and are not counted as success.
- `issue-check.ps1 -Issue 31 -Migrate` (apply 001 to 006 to the dedicated DB `workout_test_31`, then `npm run check`):
  - Run 1: backend typecheck failed (TS7022, the fetch response type in a test). Fixed.
  - Run 2: `npm test` **232 pass / 1 fail / 0 skip** — the deepEqual in `workout-validation.test.ts` failed on the new default fields. Added the defaults to the expected value.
  - Run 3: **EXIT=0**. Format, lint, and typecheck passed, app and DB `npm test` **233 pass / 0 fail / 0 skip / 0 cancelled** (including DB integration tests), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, frontend and backend builds passed.
- Final check (re-running the same command after adding and formatting this document): **EXIT=0**. Format, lint, and typecheck passed, `npm test` **233 pass / 0 fail / 0 skip / 0 cancelled**, `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**, build passed. The only change after that is adding this result line, confirmed with `prettier --check`.

## Limits

- I did not check in a real browser (mobile 390px / PC) in this phase. The VM adapter does not verify DOM layout, focus, real React scheduling, or the browser's background timer throttling. The coordinator's browser check is needed.
- There is no sound, vibration, or notification when a rest ends. Multiple tabs share the same timer storage location, but a change in another tab is not reflected in real time (it is reflected on the next refresh).
- I did not apply `006_set_completion_rpe.sql` to the production DB. It must be applied before deployment. Migration number 005 is left empty for other work.

## Fix: ignore rapid consecutive taps (2026-10-19)

- In the coordinator's real-browser (Chromium 390px) check, a problem was found where the second click of a `완료` (Complete) double-click arrives in the next render and cancels the completion. The auto-started rest timer kept running, so the draft (`completed:false`) and the timer state diverged.
- `frontend/src/main.tsx`: after a set is marked completed, a completion cancel that arrives for the same set within 700 ms is ignored. An ignored click does not restart or cancel the timer. An intentional cancel after 700 ms works as before. I changed the pressed-state text to `완료됨 · 취소하려면 다시 누르기` (Completed · press again to cancel) and kept `aria-pressed`.
- `backend/test/set-completion-ui.test.ts`: added a regression test in a separate render: two clicks 100 ms apart → completion kept and 1 rest start (1:30 left); a click 1 second later → incomplete, timer kept (1:29 left), and sent body `completed:false`. Run before the fix: this test **failed** (`double click keeps completion`), the other 7 passed. In the two existing UI tests, the intentional completion cancel now advances the clock by 1 second before the cancel to fit the new rule (the checks are the same).
- After the fix, `tsx --test test/set-completion-ui.test.ts test/workout-draft-ui.test.ts test/period-ui.test.ts`: **46 pass / 0 fail / 0 skip**.
- `database/README.md`: changed the 006 apply command to `psql -f /docker-entrypoint-initdb.d/006_set_completion_rpe.sql`, which reads the file mounted in the container (`compose.yaml` mounts `database/migrations` at that path). This is because the native pipe in Windows PowerShell 5.1 passes ASCII and can corrupt Korean. I did not change the 002/004 instructions.
- `issue-check.ps1 -Issue 31 -Migrate` after the fix and doc update: **EXIT=0**. Format, lint, typecheck, and build passed, `npm test` **234 pass / 0 fail / 0 skip / 0 cancelled** (including the dedicated DB), `test:agents` **162 pass / 0 fail / 0 skip**, `test:skills` **4 pass / 0 fail / 0 skip**.

## Coordinator review and real-browser check — 2026-10-19

- Independent review (read-only): no blocking findings. Confirmed the idempotency of the 006 migration and that existing sets keep `completed=true`, the completed-set filter in the server goal evaluation and `volume`, the RPE 0.5-step validation, compatibility with the #34 request fingerprint, and the end-time-based timer. Note (P3): the RPE `onChange` uses the editor at render time (a double change in the same tick is rare in real use).
- In the first real-browser check (Playwright, dev server on the dedicated DB `workout_test_31`), I found a **problem where a double-click on the complete button flips completed → incomplete**. The two clicks were handled in different renders, so the same-render guard did not work. I re-checked after the `fix: ignore rapid repeat taps` fix above:
  - Mobile 390px: auto-start on, rest 20 seconds, RPE 8.5 entered → on a complete double-click `completed: true` is kept, the timer starts once ("0:20 남음" (0:20 left)), the button shows "완료됨 · 취소하려면 다시 누르기" (Completed · press again to cancel), and `aria-pressed=true`.
  - Refresh → draft restore: the timer shows "0:11 남음" (0:11 left) based on the end time, and the completion state and RPE 8.5 were restored.
  - Added an incomplete set and saved → the server record is `[completed:true, rpe:8.5]`, `[completed:false, rpe:null]`. In the statistics "완료한 세트 1세트" (1 completed set), only the completed set is counted. No horizontal scrolling.
  - API: RPE 7.3, 0, 10.5, 0.5 → all 400.
  - PC 1440px: the timer and input modal layout is normal.

## Merge into main: resolving the conflict with #28 routine progress — 2026-10-19

- After #28 (PR #50) was merged, `frontend/src/main.tsx` and `frontend/src/style.css` conflicted. I kept all the imports, state, and styles that the two features added at the same place. The default for a new log combines #28's 3 sets with #31's `completed: false, rpe: null`. In the set row grid, #28's goal reference text is placed automatically below the complete and RPE row (3 rows on PC, 4 rows on mobile), so they do not overlap.
- I also fixed the semantic conflicts that git did not detect. #31 treats a set without `completed` as an existing performed record (completed).
  - `frontend/src/progress.tsx` `routineDraft`: the draft sets filled with today's goal were created without `completed`, so saving them as they were could count the goal as a performed record. They now start as `completed: false, rpe: null`.
  - `frontend/src/main.tsx` `다른 운동 추가` (Add another exercise): the new row also starts as `completed: false, rpe: null`.
  - `backend/src/app.ts` previous record in the routine progress: excludes incomplete (planned) sets (`s.completed`). A more recent log with only incomplete sets does not become the previous record.
- Tests: added to `routine-progress-ui.test.ts` the check of `completed:false` and `rpe:null` in the draft save body and updated the expected value of the extra row. Added to `routine-progress.integration.test.ts` a regression check that an incomplete set and the latest log with only incomplete sets are excluded from the previous record. `set-completion-ui.test.ts` loads the `./progress` module and updates its expected values to fit the new log's 3-set default (the intent of the checks is the same).
- Applied `005_routine_progress.sql` and `006_set_completion_rpe.sql` to the dedicated test DB with `psql -f`.
- `npm run check` (Node 24, `TEST_DATABASE_URL` set): **EXIT=0**. Format, lint, typecheck, and build passed, `npm test` **274 pass / 0 fail / 0 skip / 0 cancelled** (including DB integration), `test:agents` **162 pass**, `test:skills` **4 pass**.
- I did not do a real-browser check after the merge.
