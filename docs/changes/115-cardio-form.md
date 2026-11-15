# #115 Cardio records screen, part 1: input form, list, edit, and delete components

- Issue: [#115](https://github.com/sirloinbh/workout-memo/issues/115)
- Branch: `feat/115-cardio-form`
- Prerequisite: #114 (cardio data model and API, merged)

## Purpose

#115 is split into three PRs (the order of progress from the user's decision of 2026-11-08). This PR is the first, and it builds the input form, list, edit, and delete of cardio records as independent components and tests in `frontend/src/cardio/`. The workout journal screen is being changed by #105, so this time it is not connected to the app.

| PR  | Content                                                                      |
| --- | ---------------------------------------------------------------------------- |
| 1   | Form, list, edit, and delete components (this PR)                            |
| 2   | Statistics and dashboard summary components                                  |
| 3   | Connecting the strength/cardio tabs of the workout journal and the 390px e2e |

## Change — feat: cardio record components

- `frontend/src/cardio/format.ts` (new file)
  - The 9 kind names (러닝 running, 걷기 walking, 실외 사이클 outdoor cycling, 실내 자전거 indoor bike, 로잉 rowing, 계단 stairs, 일립티컬 elliptical, 수영 swimming, 기타 other) and the perceived intensity names (힘듦 hard, 중간 medium, 쉬움 easy, the same as #83).
  - `parseDuration`: three cells for hours, minutes, and seconds to integer seconds. Hours may be left empty. Each cell must be empty or an integer of 0 or more, and minutes and seconds are 0 to 59 (it does not quietly turn "90 minutes" into 1:30:00). It rejects when all are empty or the total is 0. The 24-hour upper limit is checked by the shared schema.
  - `splitDuration` (fills the three cells when editing) and `formatDuration` (`1:02:03`, and `32:05` for under an hour).
  - `paceOf` and `speedOf`: compute sec/km and km/h on the screen from the saved `duration_sec` and `distance_km`. This is so the server-rounded `pace_sec_per_km` and `speed_kmh` are not rounded again (first review), and the server values are used only as a fallback when there is no distance.
  - `formatPace`: sec/km to `m:ss/km`. It rounds to integer seconds, and 359.6 seconds is `6:00/km`, not `5:60`.
  - `formatSpeed`: km/h, one decimal place. `formatDistance(kind, km)`: km (to the third decimal place, `42.195 km`), and only swimming in m (`1,500 m`).
  - `optionalNumber`: text of an optional number cell to a number. An empty cell is `null`, only a plain decimal (only a dot as the decimal point, a comma is not accepted) is read as a number, and everything else becomes `NaN` so the schema attaches "숫자로 입력하세요" ("enter a number").
  - `kmToMetres` and `metresToKm` (km to m and back without floating point error), and `sessionLabel` (the button name and the delete confirmation text).
  - If there is no distance, the pace, speed, and distance functions all give `null`, and the screen does not estimate and does not show them.
- `frontend/src/cardio/api.ts` (new file): thin functions over `requestJson` of `lib/api.ts`, `listCardioSessions(from, to)`, `saveCardioSession(body, id?)` (POST without an id, PUT with one), and `deleteCardioSession(id)`. Server errors are received as the Korean message of `RequestError`.
- `frontend/src/cardio/cardio-form.tsx` (new file): the create and edit `Modal`
  - At first only the kind (select box), date, workout time (three `NumberInput` cells for hours, minutes, and seconds), distance (`NumberInput`, m for swimming and km for the others), perceived intensity (`ToggleChips`, one or none), and memo are shown (decision 6).
  - Pressing the "더 입력하기" ("enter more") button (`aria-expanded`, `aria-controls`) expands average and max heart rate, calories, elevation gain, cadence, start time (`type="time"`, HH:MM), and the strength journal to link. Even when collapsed, the input values are still saved.
  - Strength journal link: of the journals passed by the parent, it offers only those on the same day as the record date. The default is "연결 안 함" ("do not link"). If the record being edited is already linked to a journal on another day, that journal is also kept in the choices, so changing the date does not silently drop the link.
  - Before saving it validates with the shared schema `cardioSessionSchemaFor(today).safeParse` and shows the per-field messages under the inputs with `FieldError` and `invalidProps`. If there is a wrong value, nothing is sent to the server. If an error is in a collapsed cell, "더 입력하기" is expanded automatically.
  - zod skips the cross checks at the end of the schema (date after today, max >= average heart rate) when there is even one field error. So that a wrong time cell does not block the cross checks, a temporary 1 second is put in the schema and the time error is attached separately with the `parseDuration` message. So that the cross checks show even when other cells (distance, calories, and so on) are wrong, the two cross checks (date after today, max >= average heart rate) are also checked directly in the form with the same wording as the schema. The date input also gets `max={today}`.
  - An edit is a full replace (PUT), so the record's `source` and `external_id` are sent again as they are. The duplicate-detection key of an imported record remains. A new record is `manual` and `null`.
  - Server rejections (409 duplicate, 400, and so on) show in an `AlertBanner` above the save button inside the form, and the form and input values are left as they are.
  - When swimming is chosen, the distance cell changes to "거리 m (선택)" ("distance m (optional)") and the hint "수영 거리는 m로 입력합니다. 저장할 때 km로 바꿉니다." ("Enter swimming distance in m. It is converted to km when saved.") appears (see "Swimming distance input" below).
  - On narrow screens (below 640px) hours, minutes, and seconds stack one per line. This is because with the - and + buttons of `NumberInput` (two 44px touch targets) side by side in three cells, almost no input area remains at 390px.
- `frontend/src/cardio/cardio-list.tsx` (new file): a `List` inside a `Card`. Each row shows the date and kind, the perceived intensity `Badge`, "duration · distance · pace · speed", and the memo (up to two lines). If there is no distance, only "거리 미입력" ("distance not entered") shows and there is no pace or speed. The edit and delete button names are "2026-11-07 07:30 러닝 유산소 기록 수정" ("edit cardio record, running, 2026-11-07 07:30") if there is a start time, and otherwise "2026-11-07 러닝 30:30 유산소 기록 수정" ("... delete") with the workout time added. Even when there are two records of the same kind on the same day, the names do not overlap.
- `frontend/src/cardio/cardio-panel.tsx` (new file): an independent panel that takes `from`, `to`, `today` (optional, default `seoulDate()`), and `workouts`. It loads the records of the period and shows the list, the "유산소 기록 추가" ("add cardio record") button, and the form, and reloads after saving or deleting.
  - Only the latest request changes the list (the same way as body records). "불러오는 중" ("loading") shows only on the first load and when the period changes, and at that time the rows of the previous period are cleared. When reloading after saving or deleting, the list is left as it is. Even if loading fails, the list is cleared.
  - A load failure is an `AlertBanner` with a "다시 연결" ("reconnect") button, an empty period is an `EmptyState`, and the save and delete result is a `Notice` (`role="status"`).
  - Delete asks with the browser `confirm("2026-11-06 수영 40:00 유산소 기록을 삭제할까요?")` ("Delete the 2026-11-06 swimming 40:00 cardio record?"), the same as body records and goals. A record that is already deleted (404) is announced as "이미 삭제된 기록입니다" ("this record is already deleted") and the list is reloaded. Other delete failures show in a delete-specific `AlertBanner` (without "다시 연결"), different from the load failure, and the list is not reloaded. This error is cleared when the next delete, add, or edit starts.
  - The date of a new record is today if today is within the period, and otherwise the last day of the period that does not go past today.
- Colors use only shared tokens, text is 16px on touch devices (`touchText`), and buttons use the 44px touch size of the shared `Button`.

## Swimming distance display of decision 3

Decision 3 said: "show every kind the same way, with the pace in min:sec/km and the speed in km/h, and review in the implementation PR whether to keep the swimming m display (#114 decision A) only for the distance display". This PR implemented **keeping only the distance in m as the recommendation**.

- Swimming records are thought of in pool length (25 and 50 m) and number of laps, so "1,500 m" reads at once better than "1.5 km".
- The pace and speed are `m:ss/km` and `km/h`, the same as other kinds (for example 1,500 m in 40 minutes gives `26:40/km`, `2.3 km/h`). The statistics that compare kinds with each other (PR 2) are computed with one unit.
- The input unit follows "Swimming distance input" below (the user's decision of 2026-11-08).

## Swimming distance input (user's decision of 2026-11-08)

- When the kind is swimming, the distance cell is in m (label "거리 m (선택)" ("distance m (optional)"), hint "수영 거리는 m로 입력합니다. 저장할 때 km로 바꿉니다." ("Enter swimming distance in m. It is converted to km when saved."), - and + unit 25 m). When saving it is converted with `distance_km = m / 1000`. To fit the schema's third decimal place (1 m) rule, m accepts only integers from 1 to 1,000,000, and otherwise "수영 거리는 1~1,000,000 m의 정수로 입력하세요" ("Enter swimming distance as an integer from 1 to 1,000,000 m") is shown.
- When the kind is changed, the value already entered is converted to the same distance. Running "5" (km) to swimming "5000" (m), and swimming "1500" to running "1.5". When changing between km kinds and for text that cannot be read, it is left as it is.
- When a swimming record is edited, the saved km is shown converted to m (1.5 to "1500").
- The old hint "1,500 m is 1.5" was removed.

## First review follow-up

1. Delete failure display (required): a delete failure other than 404 shows in a delete-specific `AlertBanner`, not the load failure banner ("다시 연결"), and the list is not reloaded. Reloading would not remove it, and it is cleared when the next delete, add, or edit starts. A 404 announces "이미 삭제된 기록입니다" ("this record is already deleted") and reloads.
2. Loading indicator: it shows only on the first load and when `from` or `to` changes. When reloading after saving or deleting, the list and the focus target do not disappear. When the period changes or loading fails, the list is cleared so that rows of the previous period do not remain under the new period.
3. Button names: so they do not overlap even when there are two records of the same kind on the same day, the start time (or the workout time if there is none) was added. The delete confirmation text uses the same name.
4. Hours, minutes, and seconds labels: the 17px bottom margin and vertical layout that `.legacy .modal label` (style.css) adds were removed with `mb-0`, like the distance label, so they line up with the input.
5. Heart rate cross check: max >= average heart rate is checked directly in the form, like the date after today, so it shows even when other cells are wrong. Corrected the record wording that said "all other checks run".
6. `optionalNumber`: checks with the plain decimal pattern first. Text that only `Number()` lets through, such as `0x10`, `1e3`, and `Infinity`, is not quietly converted, and the cell gets a "숫자로 입력하세요" ("enter a number") error.
7. Link to a journal on another day: if the record being edited is linked to a journal on another date, the hint "다른 날짜(YYYY-MM-DD)의 근력 일지에 연결돼 있습니다." ("Linked to a strength journal of another date (YYYY-MM-DD).") is shown (instead of the same-day hint). That the link stays in the PUT body when saving an edit is fixed by a test.
8. Pace and distance display: the pace and speed are computed on the screen from `duration_sec` and `distance_km` and rounded only once (the server values are a fallback). A km distance is shown to the third decimal place (`42.195 km`).
9. User's decision (2026-11-08): swimming distance is entered in m and converted to km when saved. When the kind is changed, the value is changed so the same distance is kept (see "Swimming distance input" above).
10. Fixed this record document to match the content above and the tests. Tests that grew: ignoring a late previous-period response, delete 404 and 500, keeping a link to a journal on another day, swimming m input, kind switching, and edit, telling button names apart, the plain decimal check, and the pace rounded only once.

## Tests

- Added: 9 tests in `frontend/src/cardio/format.test.ts`. Hours, minutes, and seconds to seconds (including an empty hours cell), rejecting empty, total 0, negative, decimal, text, and minutes or seconds of 60 or more, seconds to three cells and `h:mm:ss` / `m:ss`, pace rounding (359.6 seconds to `6:00/km`), speed with one decimal place, and `null`, the pace rounded only once from time divided by distance (6589 seconds / 20 km to `5:29/km`, and rounding the server's 329.5 again gives `5:30`), `optionalNumber` reading only plain decimals (`0x10`, `1e3`, `Infinity`, `1,500.5` to `NaN`, `1,5` and `1,000` to `NaN`), km and m conversion, `sessionLabel`, km distance (`42.195 km`), and swimming m distance.
- Added: 18 tests in `frontend/src/cardio/cardio-panel.test.tsx` (`mockApi`, `deferred`, `fixClock`, checked by role and accessible name).
  - List: the request period (`?from=2026-11-02&to=2026-11-08`), running "30:30 · 5.02 km · 6:05/km · 9.9 km/h" with the intensity Badge and memo, swimming "40:00 · 1,500 m · 26:40/km · 2.3 km/h", and indoor bike without distance "1:02:05 · 거리 미입력" ("distance not entered") (no pace or speed).
  - Empty period `EmptyState`, load failure `AlertBanner` and "다시 연결" ("reconnect").
  - Create: at first only the core cells (`aria-expanded="false"`), for swimming the "거리 m" ("distance m") cell and the m hint (no old km hint), distance "1500" m to `distance_km: 1.5`, intensity "힘듦" ("hard"), the whole POST body (`duration_sec: 2405`, optional values `null`, `source: 'manual'`), then the modal closes, "유산소 기록을 저장했습니다" ("cardio record saved"), and reload.
  - Enter more: `aria-expanded="true"`, heart rate, calories, elevation, cadence, start time, only the same-day journal ("하체", "legs") is in the choices, then `workout_id: 7`.
  - Validation: a date after today and a workout time of 0 are shown together (`aria-invalid`, `aria-describedby` message), a heart rate of 20 automatically expands the collapsed cell and shows the range message, the max < average heart rate message, and while distance "1e3" and calories "0x10" are blocked with "숫자로 입력하세요" ("enter a number"), the max < average heart rate message is also shown. No POST during this.
  - Swimming unit: running "5" to swimming "5000", swimming "1500" to running "1.5", unchanged between km kinds. Swimming "1500.5" m is blocked with the integer m message.
  - Editing a swimming record: "1500" in the distance cell, the hint for a link to a journal on another day (2026-11-07), and `distance_km: 1.5` and `workout_id: 8` kept in the PUT `/api/cardio-sessions/2` body.
  - The button names of three records of the same kind on the same day are told apart by start time and workout time.
  - Edit: the values of an imported (garmin) record are filled in (hours cell empty, enter more expanded, intensity "중간" ("medium") pressed), and pressing the intensity again clears it, then `source: 'garmin'` and `external_id: 'garmin-1'` are kept in the whole PUT `/api/cardio-sessions/1` body.
  - Server 409: in the `alert` inside the form "같은 출처와 외부 ID의 유산소 기록이 이미 있습니다" ("a cardio record with the same source and external ID already exists"), input values kept, the save button usable again, no reload request for the list.
  - Delete: cancelling the confirmation sends no request, and confirming gives DELETE `/api/cardio-sessions/2`, "유산소 기록을 삭제했습니다" ("cardio record deleted"), and reload.
  - Delete 500: a delete-specific `alert` (without "다시 연결"), the row stays, no reload. Delete 404: "이미 삭제된 기록입니다" ("this record is already deleted"), reload so the row disappears, no `alert`.
  - While reloading after saving, the list stays and "불러오는 중" ("loading") is not shown.
  - Period change: a late response of the previous period does not change the new period's list (`from` and `to` changed with `rerender`), and when the period is changed again, "불러오는 중" ("loading") shows instead of the previous rows.
  - When `today` is not passed, the default and the `max` are the Seoul date 2026-10-15, not the device date (UTC 2026-10-14).
- `npm run test -w frontend -- src/cardio`: 2 files, 27 pass (after the first review follow-up)
- `npm run typecheck -w frontend`: pass
- `node_modules/.bin/eslint frontend/src/cardio`, `node_modules/.bin/prettier --check frontend/src/cardio docs/changes/115-cardio-form.md`: pass
- The full local `npm test`, `npm run check`, and e2e were not run because there is a history of running out of memory. They are checked in CI.

## Limits and remaining work

- It is not connected anywhere in the app yet. The strength/cardio tabs of the workout journal and the update of the 390px e2e and the common screen checks (`e2e/ui-*`) are PR 3, and the statistics and dashboard summary are PR 2. Before it is connected, knip may warn that `CardioPanel` is an unused export (only a warning in CI).
- The look in a real browser (modal height, 390px layout, the phone keypad of the date and time inputs) could not be checked with jsdom. It is checked in the e2e of PR 3.
- A cardio record has no optimistic locking (#114), so if the same record is edited on two devices, the later save wins.
- If a record is edited to a date outside the period and saved, the record is saved but disappears from the current list (the same as body records).

- This PR left the implementation to a sub-agent. The main agent read the code and re-ran `npm run test -w frontend -- src/cardio` (15 pass), `npm run typecheck -w frontend`, eslint, and prettier to check it. The first review follow-up was also done by the sub-agent, and the result of the same commands after the follow-up is the same as "Tests" above (27 pass).

## Change — fix: second review follow-up

- (Required) `optionalNumber` read a comma as a decimal point, so swimming "1,000" could be saved as 1 m (`distance_km: 0.001`) and calories "1,000" as 1 kcal with no error. In Korean a comma is a thousands separator and Korean number keypads use a dot, so a value that contains a comma is not accepted and gives a "숫자로 입력하세요" ("enter a number") error. When the kind is changed, such values are also left as they are.
- (Optional) If reloading after saving or deleting fails, the list is not cleared and only the error is shown. It is cleared only when the first load or a period change fails.
- (Optional) Added decimal km (`5.5` to `5500`), an empty value, and unreadable text to the kind switching test.
- (Optional, not applied) If the kind is the same on the same day and even the start time or workout time is the same, the button names can overlap. It is rare, so it is left as a limit.
- Added tests: "a thousands comma is never read as a decimal point" in `cardio-panel.test.tsx` (swimming m "1,000" and calories "1,000" are errors and there is no POST), and `1,5` and `1,000` to `NaN` in `format.test.ts`
- `npm run test -w frontend -- src/cardio`: 28 pass. Two reviews are done, so there is no third review.

## Merge main

- Just before the merge, #248 (LHCI 0.16, `package*.json`) and #250 (loading placeholders) entered main, so it did not meet the condition to merge right away (no `package*.json` change), and `origin/main` was merged. There were no conflicts. After the merge, `npm run test -w frontend -- src/cardio` gave 28 pass and `npm run typecheck -w frontend` passed
- The failure of CodeQL `Analyze (actions)` in the previous CI was a temporary error, a 504 while downloading the CodeQL bundle (unrelated to the code).
