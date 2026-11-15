# #116 Cardio goals (weekly and monthly totals, record goals) and achievement checks

- Issue: [#116](https://github.com/sirloinbh/workout-memo/issues/116)
- Branch: `feat/116-cardio-goals`
- Depends on: #114 (cardio record model and API, 9ecca13)
- Design: user decisions D1 to D6 on 2026-11-08 ([#116 comment](https://github.com/sirloinbh/workout-memo/issues/116#issuecomment-6720061395))

## Purpose

Let the user set cardio goals and have the server judge whether they are achieved. The My goals screen shows them next to the strength goals.

## Change — feat: storage and server-side judging

- `database/migrations/016_cardio_goals.sql` (new file, safe to re-run): `cardio_goals` (goal type, exercise kind, period unit, target distance/time/count, start date, end date). A CHECK (`cardio_goals_shape`) makes sure each type has only the target values it needs. The strength `goals` table is unchanged.
- `shared/contract.ts` → `npm run contract:sync`: `cardioGoalTypes`, `cardioGoalPeriods`, `cardioGoalSchema`. Ranges: distance above 0 and up to 10000 km with at most three decimals, time 1 to 2678400 seconds (31 days), count 1 to 1000, goal period at most 5 years (1826 days; the DB CHECK is the same). Target values a type does not use must be `null`.
- `backend/src/cardio-goals.ts` (new file): the judging function `judgeCardioGoal`, which can be tested without a DB.
  - Period totals (D2, D3): for each week (Monday to Sunday) and calendar month, only records inside that period, inside the goal period, and on or before today (Seoul time) are counted. A period that is cut by the goal period keeps the same target value. `achieved` tells whether the period that contains today is achieved; before the start and after the end there is no such period, so it is `false`.
  - Record goals (D5): `record_time` is achieved when one record is at least the target distance and its total time is at most the target time. `longest_distance` is achieved when the longest single record is at least the target distance. Nothing is estimated from pace.
  - Exercise kind (D4): if the goal has a `kind`, only that kind is counted; if it is `null`, all kinds are counted. A record without a distance is left out only for distance goals.
- `backend/src/routes/cardio-goals.ts` (new file): `GET /api/cardio-goals` (with judging, ordered by end date), `POST` (201), `DELETE /:id` (404 "유산소 목표를 찾을 수 없습니다" (cardio goal not found) when missing). The list reads the records from the earliest start date up to today only once and judges every goal from them.
- `docs/api.md` (3 endpoint lines, the goal type table, and the judging rules), `backend/src/openapi.ts` → `npm run openapi`.

## Change — feat: My goals screen

- `frontend/src/cardio-goals.tsx` (new file): a "유산소 목표" (cardio goals) section below the strength goals.
  - Card: status (달성 완료 achieved, 도전 중 in progress, 시작 전 not started, 기간 종료 period ended), a title (for example "주간 러닝 15 km" (weekly running 15 km), "러닝 5 km 30:00 이내" (running 5 km within 30:00)), for period totals the value and target of this week (month) with a progress bar, and "달성한 주 n / 전체 m주" (achieved weeks n of m weeks). A record goal shows the fastest record and the longest distance.
  - "유산소 목표 추가" (add a cardio goal) dialog: shows only the goal type, exercise kind, period unit, and the target values of that type. Time is two fields, minutes and seconds. Before saving, the form is checked with the shared schema and errors are shown per field.
  - While loading for the first time, it uses the same placeholder as #173 (an `aria-busy` region); a load failure shows the "다시 연결" (reconnect) banner.
- `frontend/src/app.tsx`: `CardioGoals` is attached to the My goals screen, and the header description now mentions cardio (two places).
- The exercise kind names and the time format (`28:30`) are kept in this file with the same values as `frontend/src/cardio/format.ts` of #115 (agent2, not merged yet). They will be merged into that file once #115 is merged. `frontend/src/cardio/*` and the workout log screen were not touched.
- The exercise kind and goal type pickers are native browser `select` elements, for the same reason as the routine form.

## First review

- No required comments. I checked the judging (week and month borders, cut periods, today and end date), that the schema matches the DB CHECK, and the response shape.
- Applied (optional):
  - Minutes and seconds were combined into seconds and saved even when they were negative, fractional, or 60 seconds or more. The form now checks first that minutes are an integer of 0 or more and seconds are an integer from 0 to 59. The error mark (`aria-invalid`) is also set on the seconds field.
  - After changing the goal type, an old error stayed on a hidden field. Errors are cleared when the type changes.
  - Without an end date limit, a weekly goal ending in the year 9999 would create about 410,000 periods on every request. The goal period is now limited to 5 years or less (schema and DB).
  - In `docs/api.md`, "the end date is after the start date" was changed to "the same as or after".
- Tests: added the 5-year border (schema) and rejecting 90 seconds with `aria-invalid` on the seconds field (screen).

## Out of scope

- Suggesting the next goal (D6): split into #251.
- Adding cardio goals to backup and restore: split into [#253](https://github.com/sirloinbh/workout-memo/issues/253). Backup files do not have cardio goals now.
- Accumulated time in heart rate zone 2 (D1): cannot be calculated because only the session average heart rate exists.

## Tests

- Added: `backend/test/cardio-goals.test.ts`, 9 tests (no DB): week and month periods, short of the goal, exactly achieved, exceeded (decimal sums in 1 m units), Sunday/Monday border, no records, cut weeks and after the end, leaving out future records, other kinds, and records without distance, record time (D5) and longest distance, per-type target value rules of the schema, and Korean particles.
- Added: `backend/test/cardio-goals.integration.test.ts`, 2 tests (PostgreSQL): create, stored values, judging from stored records, end date order, delete, 404, 400 for an invalid ID, 400 for a wrong shape, and the DB CHECK.
- Added: `frontend/src/cardio-goals.test.tsx`, 3 tests: card status, progress, achieved periods, and records; sending only the target values of each type (a record goal without a kind is blocked on screen, minutes and seconds → seconds); delete.
- `e2e/support/ui-fixtures.ts` (shared e2e helper): added fixed data for `/api/cardio-goals`, built with the real judging function. Without it the My goals screen shows a 404 error.
- Passed: 9 judging unit tests, the api-contract, openapi, contract, and migrations tests, 6 related frontend files, `typecheck` (backend, frontend, e2e), eslint and prettier (changed files). The integration tests need PostgreSQL, which this PC does not have, so they are checked in CI. The full local `npm run check` and e2e were not run because of low memory.
- Visual baselines: 4 My goals (goals) images change. They will be updated after checking the CI images.

## Change — test: update visual baselines

- In the CI `e2e-visual` of `b5146de`, only 4 goals images and 4 goal-editor images failed; the other 82 (including touch, responsive, and axe) passed.
- I checked the 390px and 1280px images. The "유산소 목표" section below the strength goals shows a weekly distance in progress (this week 5.2 km / 15 km, progress bar, achieved weeks 1 / total 3), an achieved 5 km record (fastest record 29:10), and a weekly count goal whose period ended; nothing overflows. In goal-editor only the header description in the background changed. I updated 8 images from the `visual-baselines` artifact.

## Change — refactor: merge into the #115 display functions (follow-up after merge)

- #115 (#252) was merged, so `frontend/src/cardio/format.ts` is now on main. The exercise kind names and the time format (`28:30`) that were kept separately in `cardio-goals.tsx` are removed, and `cardioKindLabels` and `formatDuration` are used.
- Distance also uses `formatDistance`, so a goal with a set exercise kind is shown the same way as on the cardio record screen (swimming in m). A goal whose kind is "전체" (all) stays in km.
- The `cardio/*` files were not changed.
- Review fix: swimming is shown in m but entered in km, so when swimming is chosen the distance field is named "목표 거리 (km, 1,500 m는 1.5)" (target distance (km, 1,500 m is 1.5)).
- Tests: added 1 screen test that checks that a swimming goal shows as "수영 한 번에 1,500 m" (1,500 m in one swim) and "가장 긴 거리 1,200 m" (longest distance 1,200 m) (4 pass in `cardio-goals.test.tsx`). The fixed data are running and all-kind goals, so I expect the visual baselines not to change.

## Change — feat: enter the swimming goal distance in m (follow-up)

- User decision on 2026-11-08: swimming distance is entered in m and converted to km when saved (same as the #252 record form). In the goal form too, when the exercise kind is swimming the distance field becomes "목표 거리 (m)" (target distance (m)), and on save it is divided by 1000 and sent in km. Other kinds and "전체 유산소" (all cardio) use km.
- When the exercise kind changes, the entered distance is converted to the same distance (running "1.5" ↔ swimming "1500"). Text that cannot be read is left as it is. This is the same rule as #252, and the conversion uses `kmToMetres`, `metresToKm`, and `optionalNumber` from `cardio/format.ts`. The `cardio/*` files were not changed.
- A swimming goal distance accepts only integers from 1 to 10,000,000 m (storage unit 1 m, goal limit 10000 km).
- Number reading now uses `optionalNumber` from `cardio/format.ts`, so the distance, count, and time fields of the goal form also reject comma decimals (`1,5`) with "숫자로 입력하세요" (enter a number), like the #252 record form. Before, the comma was turned into a dot and accepted.
- The distance field hint "목표 거리 (km, 1,500 m는 1.5)" added earlier was removed.
- Tests: value conversion when switching kinds (km → m → km), blocking decimal m, saving 1500 m as `target_distance_km: 1.5` (5 pass in `cardio-goals.test.tsx`).
