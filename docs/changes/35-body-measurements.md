# #35 feat: record body weight, body fat percentage, and skeletal muscle mass, with trends by period

- Issue: https://github.com/sirloinbh/workout-memo/issues/35
- Branch: feat/35-body-measurements
- Work date: 2026-10-19 (Asia/Seoul)

## Changes

- `database/migrations/008_body_measurements.sql`: the `body_measurements` table. `date` is UNIQUE (one record per day), and `body_weight_kg`, `body_fat_percent`, and `skeletal_muscle_kg` are all nullable `NUMERIC(5,2)`. CHECK constraints enforce body weight and skeletal muscle mass above 0, body fat percentage from 0 to 100, and at least one of the three values. It uses `CREATE TABLE IF NOT EXISTS`, so running it again is safe. It is not linked to the workout journal with a foreign key.
- `backend/src/domain.ts`: `bodyMeasurementSchema` (Zod) and a shared `dateRange` (query period validation). The journal query API uses the same `dateRange`, and the validation rules and messages are the same as before.
- `backend/src/app.ts`: `GET /api/body-measurements?from&to` (both ends inclusive, ascending by date), `POST /api/body-measurements` (201), `PUT /api/body-measurements/:id` (full replacement, the date can move), and `DELETE /api/body-measurements/:id`. The metrics in responses are JSON numbers or null.
- `frontend/src/body.tsx`: the body records screen. A create and edit form, the list within the period (edit/delete), 3 SVG trend charts, one per metric, and the workout volume of the same day. No new chart library was added.
- `frontend/src/main.tsx`: added `신체 기록` (body records) to the menu. The #17 period selection (1 day / 1 week / 1 month / 4 weeks / 12 weeks, previous and next, anchor date) and the range display are grouped into `periodControls`, so the dashboard, workout journal, and body records share the same state (`period`, `anchor`, `from`, `to`). The markup and behavior of the existing screens are unchanged. The body records screen draws its own title and a `신체 기록 추가` (add body record) button.
- `frontend/src/style.css`: styles for the body record form, trend cards, and list, and a one-column layout at 760px and below.
- `README.md`, `database/README.md`: the feature description, the migration command, and the precision and conflict policy.

## Policy

- **Precision and units**: body weight and skeletal muscle mass in kg, body fat percentage in %. Storage is `NUMERIC(5,2)` (up to 999.99). The API **rejects input with a third decimal place or more with 400, instead of rounding**, so the stored value equals the input value. The UI input uses `step=0.01`, and the display units are the same as the API.
- **Range**: body weight and skeletal muscle mass are above 0 and at most 999.99, and body fat percentage is from 0 to 100. Only finite JSON numbers are allowed, and numeric strings, booleans, and overflow (`1e400`) are 400.
- **Missing values**: omitting the key and null are both stored as NULL. No estimated value is made. If all three values are empty, it is 400 (server Zod + DB CHECK), and the UI also blocks it before the request.
- **Same-date conflict**: POST uses `ON CONFLICT (date) DO NOTHING`. For an existing date it returns 409 `이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요.` (a body record already exists for this date; edit the existing record) and does not change the existing values. Moving to another record's date with PUT is 409, and an unknown ID is 404. An edit replaces all three metrics, and a metric left out becomes NULL.
- **Trend chart**: only values recorded within the period are shown as points. The x axis is the position of the date in the period. At a date that has a record but a NULL for that metric, the line breaks. A missing value is not drawn as 0. Across dates with no record (days not measured), the previous and next records are joined by a line. There is no normal/abnormal judgment, recommended range, or health status text. With 2 or more records, only the change from the first record is shown, neutrally.
- **Workout volume alongside**: next to each date in the list, the workout volume of the same day (total weight × reps) is shown. A note that it "does not imply causation" is shown.

## Decisions

- I chose rejection over rounding. It is a conservative choice so that a value is never changed silently.
- I did not add cross-metric validation, such as an input where skeletal muscle mass is larger than body weight. Definitions can differ by measuring device, and I did not add a rule that comes close to a judgment.
- The upper limit 999.99 is a limit of the storage format. It is not a medical standard.
- An edit is a PUT by ID. An upsert based on the date path risks an accidental overwrite, so I did not use it. A version check for concurrent edits is outside the issue scope, so I did not add it (the last save wins).
- Joining the dates that were not measured with a line is a mark that shows the order of records, not an interpolated value. When only that metric is empty in a record, the line breaks to tell it apart from "not entered".

## Tests

- `backend/test/body-measurements.test.ts` (unit, fake pool): keeping NULL for partial input, allowing boundary values (0%, 100%, 999.99), 15 kinds of bad values × POST/PUT and `1e400`, a bad or reversed query period, and a bad ID getting 400 without touching storage. POST conflict 409, PUT unique key violation 409, PUT/DELETE of an unknown ID 404, and passing both ends of the query period inclusively.
- `backend/test/body-measurements.integration.test.ts` (needs `TEST_DATABASE_URL`, skipped without it): entering only body weight keeps null, POST on the same date is 409 with the original unchanged, bad values are not stored, adding a metric and clearing body weight with PUT, a PUT that clears everything is 400, period boundaries including the leap day 2072-02-29 (the day before and the day after are excluded), moving to another record's date is 409 and moving to an empty date is 200, 404 after delete and re-creating the same date, persistence of the 72.35, 33.05, and 0 precision and of NULL on a new server and new pool, and no duplicate or estimated rows. Only the dates owned by the test (2072-02-01 to 03-31) are cleaned up before and after.
- `backend/test/body-ui.test.ts` (the existing vm rendering adapter): the body records screen reuses the anchor date, 1 week / 1 month, and next period selection and queries the matching range; the line breaks at a NULL metric and does not draw 0; records outside the range are excluded; an empty period shows an empty chart and a notice; the same-day volume and the no-causation notice appear; there is no medical judgment text; empty input is blocked; a partial input POST body has null; the input stays after a duplicate date 409; an edit PUT replaces everything; and a re-query after delete.
- `backend/test/workout-draft-ui.test.ts`: this adapter stubs sibling modules explicitly, so I added one `./body` stub line the same way as `./routines`. I did not change existing assertions.

## Commands actually run and results

- Before the implementation: `node ../node_modules/tsx/dist/cli.mjs --test test/body-measurements.test.ts test/body-ui.test.ts` (backend, Node 24.21.0) → 8 tests / 1 pass / 7 fail. Only the schema unit test passed (I added the schema first), and the rest failed because of API 404 and the missing `신체 기록` menu.
- After the API implementation, the same unit tests 4/4 pass. After the UI implementation, in the run of `body-ui`, `period-ui`, `routines-ui`, and `workout-draft-ui`, `workout-draft-ui` first failed with `Unexpected import: ./body`, and after adding the stub, 47/47 pass.
- After applying migrations 001 to 004 and 008 to the dedicated DB `workout_test_35`, `npm run check` (`issue-check.ps1 -Issue 35 -Migrate` provided by the coordinator, Node 24.21.0): the first run was EXIT=1 because of Prettier warnings in `README.md` and `database/README.md`. After formatting, the re-run (the migration re-applied successfully = re-run safety confirmed) was **EXIT=0**: format:check, lint, and typecheck pass, `npm test` **218 tests / 218 pass / 0 fail / 0 skip** (including the DB integration), `test:agents` 162/162 pass, `test:skills` 4/4 pass, and the frontend and backend builds pass.

## Limits and remaining checks

- I did not check the chart rendering, the layout at mobile widths, the native validation of number inputs, or focus in a real browser (the coordinator's browser check covers them).
- There is no concurrent edit conflict handling (version check). Progress photos, OCR, smart scale integration, and nutrition are out of scope.

## Coordinator review and real browser check — 2026-10-19

- Independent review (read-only): no blocking findings. I confirmed the double validation by Zod and the DB CHECK, the 409 based on `ON CONFLICT (date) DO NOTHING` (no race), 23505→409 on PUT, parameterized queries, the date string parser, the line break on missing values, and no effect on the existing period controls. Note (P3): after a POST 409, it does not switch to edit mode automatically (handled with the notice text).
- Real browser (Playwright, the dev server on the dedicated DB `workout_test_35`):
  - Mobile 390×844: saved 10/17 (all three items), 10/18 (body weight only), and 10/19 (all three items) → "신체 기록을 저장했습니다" (body record saved). Registering the same 10/19 again → "이 날짜의 신체 기록이 이미 있습니다. 기존 기록을 수정하세요." In the server query, body fat and skeletal muscle mass for 10/18 are null. No horizontal scroll.
  - 4-week view: the body weight line joins the three points, and body fat percentage and skeletal muscle mass show only points with no line because 10/18 is missing (not joined as 0). The no-causation and no-medical-judgment notice is shown.
  - PC 1440×900: the layout of the three metric charts, the record list, and the edit/delete buttons is normal.
  - Observation (existing behavior): the local journal draft recovery notice from #34 is also shown at the bottom of the body records screen. This is not a change of this work, and it is left as a follow-up decision.

## Integration with main: resolving conflicts with #28, #31, and #32 — 2026-10-19

- After #28 (PR #50), #31 (PR #51), and #32 (PR #52) were merged, `README.md`, `backend/test/workout-draft-ui.test.ts`, `frontend/src/main.tsx`, and `frontend/src/style.css` conflicted. I kept the README entries, icons, imports, and styles of every feature.
  - `main.tsx`: it keeps both this work's common period selection (`periodControls`) and the #31 rest timer (`timerPanel`), and the menu has both exercise analysis (#32) and body records. The journal and dashboard screens show only when the screen is not routine planning, body records, or exercise analysis.
- I fixed a problem that git did not mark as a conflict.
  - `backend/src/app.ts`: this work removed the `date` import, and main (#28, #32) still uses it, so the automatic merge result failed typecheck. I restored the import.
  - `frontend/src/body.tsx`: the same-day workout volume also summed incomplete (`completed=false`) planned sets. I changed it to sum only completed sets, following the #31 rule (a missing value counts as completed).
- Test: I added an incomplete 200 kg × 10 set to the same-day journal in `body-ui.test.ts`. The volume display must stay 1,002.5. Removing the filter temporarily **fails** it, and with the filter applied it passes. `set-completion-ui.test.ts` replaces the `./body` page with an empty component.
- I applied `008_body_measurements.sql` to the dedicated test DB with `psql -f`.
- `npm run check` (Node 24, `TEST_DATABASE_URL` set): **EXIT=0**. Format, lint, typecheck, and build pass, `npm test` **296 pass / 0 fail / 0 skip** (including the DB integration), `test:agents` **162 pass**, `test:skills` **4 pass**.
- I did not check in a real browser after the integration.
