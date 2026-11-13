# #115 Cardio records screen, part 2: statistics components and personal records API

- Issue: [#115](https://github.com/sirloinbh/workout-memo/issues/115)
- Branch: `feat/115-cardio-stats`
- Prerequisites: PR 1 (form, list, edit, and delete components, [115-cardio-form.md](115-cardio-form.md), merged), #116 (cardio goals, merged)

## Purpose

#115 is split into three PRs (the order of progress from the user's decision of 2026-11-08). This PR is the second. It builds the statistics for the cardio tab as independent components and tests in `frontend/src/cardio/`, and adds one API that returns the all-time personal records. The workout journal screen is being changed by #105, so this time too it is not connected to the app.

| PR  | Content                                                                            |
| --- | ---------------------------------------------------------------------------------- |
| 1   | Form, list, edit, and delete components (merged)                                   |
| 2   | Statistics components and personal records API (this PR)                           |
| 3   | Connecting the strength/cardio tabs of the workout journal, dashboard summary, e2e |

The dashboard summary card (decision 5) is out of the scope of this PR. The dashboard is in `app.tsx`, so it is built in PR 3 together with the tab connection.

## Change — feat: period statistics components

- `frontend/src/cardio/stats.ts` (new file): pure functions that only do screen calculations. They compute from the records of the period (`from` to `to`) that the panel has already loaded, so no more requests are made.
  - `weekStart(date)`: the Monday of that week. A week starts on Monday (AGENTS.project.md, #140). A Sunday belongs to the week of the Monday 6 days before.
  - `bucketsOf(sessions, from, to, 'week' | 'month')`: for each calendar week (Monday to Sunday) and calendar month that the period spans, the sum of distance km, time in seconds, and count. Weeks and months with no records are also put in as 0 so the time axis does not break. A week or month that extends outside the period counts only the records inside the period (the same as cardio goals #116). The labels are the week's Monday `11/2` and month `11월` ("November"; `25.12` if the period crosses a year).
  - `totalsOf`: totals. It tidies the floating point error of the km sum at the third decimal place (5.02 + 3.1 gives 8.12).
  - `kindsOf`: the kinds that have records, in the order of the kind list.
  - `runningPaces`: the pace (sec/km, `paceOf` of `format.ts`) of each running record. It is ordered by date, start time, and ID, and a record without distance is left out instead of being drawn as 0.
  - A record without distance is added only to time and count, and the distance is not estimated.
- `frontend/src/cardio/cardio-stats.tsx` (new file): `CardioStats({ from, to, sessions, refreshKey? })`. PR 3 only has to pass the same period and records next to `CardioPanel`.
  - Period totals: distance, time, and count (`dl`, `aria-label="기간 합계"` ("period totals")). A distance summed over several kinds is in km.
  - Two `SegmentedControl`s: "집계 단위" ("aggregation unit", weekly or monthly) and "지표" ("metric", distance, time, or count). The initial aggregation unit is monthly if the period is over 92 days and otherwise weekly (the same as the `rangeBuckets` standard of the workout volume chart).
  - An overall trend bar chart and, if there are two or more kinds, a small bar chart per kind. The shared tokens are black and white, so instead of a stacked bar split by color, a separate chart is drawn for each kind. The bars are `bg-primary` with rounded tops, like the workout volume chart, and each chart has `role="img"` and an `aria-label` that reads all the values (for example "전체 주별 거리: 11/2 주 6.52 km, 11/9 주 5 km", "overall weekly distance: week of 11/2 6.52 km, week of 11/9 5 km"). If the metric is distance but no record has a distance entered, it shows "거리를 입력한 기록이 없습니다" ("no record has a distance entered") instead of the chart.
  - Totals by kind table (`caption` "종류별 합계", "totals by kind"): kind, count, time, and distance. A kind with no distance at all shows "거리 미입력" ("distance not entered").
  - Running pace trend: the same SVG line graph as the body record trend, drawn with the faster pace on top. The `aria-label` is "러닝 페이스 추이(위가 빠름): 2026-11-03 6:05/km, ..." ("running pace trend (up is faster): ..."), and the title is placed outside `role="img"` so a screen reader reads it. If there is no running record with a distance entered, only the hint text shows.
  - If the period has no records, it is the shared `EmptyState` ("선택한 기간에 통계를 낼 유산소 기록이 없습니다", "there are no cardio records to make statistics from in the selected period"). Personal records do not depend on the period and are shown as they are.
- The units are the same as PR 1. Pace `m:ss/km`, time `h:mm:ss`/`m:ss`, distance km (to the third decimal place), and only swimming in m (`1,500 m`). It uses the functions of `format.ts` as they are.

## Change — feat: personal records API and component

- `GET /api/cardio-sessions/records` (`cardioRecords` in `backend/src/routes/cardio.ts`): it searches all records regardless of the period. It takes no input, so there is no Zod validation and no 400.
  - `longest`: for each kind that has a distance, the one longest record `{ kind, id, date, distance_km, duration_sec }`. The order is the order of the kind list (running first), and for the same distance the earlier date wins.
  - `best5k` and `best10k`: among running records whose distance is within +/-2% of 5 km or 10 km (4.9 to 5.1 km, 9.8 to 10.2 km, boundaries included), the record with the shortest total time `{ id, date, distance_km, duration_sec }`, or `null`. The time of a longer record is not estimated by scaling it with the pace (decision 4). The range is computed in SQL as `$1::numeric * 0.98` to `* 1.02`, so 4.9 and 5.1 are exact boundaries with no floating point error. For the same time, the earlier date wins.
  - It is registered before `/api/cardio-sessions/:id` so `records` is not read as an ID.
  - Added the endpoint table and the "유산소 개인 기록" ("cardio personal records") section of `docs/api.md` and the operation (200) of `backend/src/openapi.ts`, and regenerated `docs/openapi.json` with `npm run openapi`.
- `frontend/src/cardio/api.ts`: `getCardioRecords()` and the `CardioRecord` and `CardioRecords` types.
- `frontend/src/cardio/cardio-records.tsx` (new file): `CardioRecords({ refreshKey? })`. It sits under `CardioStats` and can also be used alone. It loads on the first render and when `refreshKey` changes, and only the latest request changes the screen.
  - "5km 최고 기록 24:30 5.02 km · 4:53/km · 12.3 km/h · 2026-11-02" ("5km best record ..."), and if there is none, "4.9~5.1 km 러닝 기록이 없습니다" ("there is no 4.9 to 5.1 km running record"). The same for 10km.
  - "러닝 최장 거리 21.1 km 2:03:00 · 2026-10-26" ("longest running distance ..."), and "1,500 m" for swimming.
  - If there are no records at all, an `EmptyState` ("아직 개인 기록이 없습니다", "no personal records yet"), and a load failure is an `AlertBanner` and a "다시 연결" ("reconnect") button.

## Tests

- Added: 5 tests in `frontend/src/cardio/stats.test.ts`
  - Monday boundary: 11/8 (Sunday) to the week of 11/2, 11/9 (Monday) to a new week, and 1/1 across a year to the week of 12/29. The first week of a period that starts on Wednesday is the week of 10/26, and empty weeks are put in as 0. A record without distance counts only time and count.
  - Dates outside the period (even in the same week) are not counted.
  - Monthly totals (October, November, and an empty December), and the labels across a year `25.12` and `26.1`.
  - Floating point tidying of the total (9.62 km), and the order of kinds.
  - Running pace: ordered by date and start time, excluding walking and running without distance.
- Added: 7 tests in `frontend/src/cardio/cardio-stats.test.tsx` (`mockApi`, checked by role and accessible name)
  - Weekly: the period totals (11.52 km, 1:45:30, 4 sessions), the `aria-label` of the overall, running, and swimming charts (the weeks of 11/2 and 11/9 split from Sunday to Monday, and swimming is `1,500 m`), and the chart with the metric changed to count and time.
  - Monthly chart and the totals by kind table.
  - Running pace trend: running without distance is left out, "가장 빠름 5:00/km" ("fastest 5:00/km").
  - With only one kind there is no per-kind chart, and with only records without distance, the distance hint, the pace hint, and "거리 미입력" ("distance not entered").
  - The empty period `EmptyState` (no unit choice) and the empty state of personal records.
  - Personal records: the `/api/cardio-sessions/records` request, showing the 5km record, the hint for no 10km, and the longest distance in km for running and in m for swimming.
  - Personal records load failure, then `alert` and "다시 연결" ("reconnect"), then reload to the empty state.
- Added: 1 test in `backend/test/cardio.test.ts` (fake pool, no DB): `records` is not read as an ID, 3 queries, the 5 and 10 parameters and `BETWEEN $1::numeric * 0.98 AND $1::numeric * 1.02`, running only, sorted by time, and the longest distance sorted in the order of the kind list.
- Added: 1 test in `backend/test/cardio.integration.test.ts` (PostgreSQL): with no records it is `{ longest: [], best5k: null, best10k: null }`. 4.89, 5.11, 9.79, and 10.21 km are not 5 or 10km records even if faster (10.21 km is the longest running distance). Walking 5 km is not a 5km record. An indoor bike without distance is not in the longest distance. 4.9 and 9.8 km become records, and the faster 5.1 and 10.2 km replace them. A later record with the same time does not replace it.
- Run results
  - `npm run test -w frontend -- src/cardio`: 5 files, 43 pass
  - `cd backend && ../node_modules/.bin/tsx --test test/cardio.test.ts test/api-contract.test.ts test/openapi.test.ts`: 19 pass
  - `npm run typecheck -w frontend`, `npm run typecheck -w backend`: pass
  - `node_modules/.bin/eslint` and `node_modules/.bin/prettier --check` (changed files): pass
  - `backend/test/cardio.integration.test.ts`: could not be run because the local PostgreSQL is off (`ECONNREFUSED`, including the existing 4). It is checked in CI.
- The full local `npm test`, `npm run check`, and e2e were not run because there is a history of running out of memory. They are checked in CI.

## Limits and remaining work

- It is not connected anywhere in the app yet. The cardio tab layout, the dashboard summary card, and the 390px e2e and common screen checks are PR 3. Before it is connected, knip may warn that `CardioStats` is an unused export (only a warning in CI).
- `CardioPanel` does not send the loaded records outside. In PR 3, either lift the record state up to the tab, or add a notification after loading to the panel, and pass the same list and `refreshKey` to `CardioStats`.
- The chart look in a real browser (the labels when there are many weeks at 390px, the bar width) could not be checked with jsdom. Labels are drawn only up to 12 for the overall chart and 6 for per-kind charts, and the rest are skipped.
- The horizontal axis of the pace graph is the order of records, not the date interval. This is a choice so records on the same day do not overlap, and only the first and last dates are written on the axis.
- Personal records are loaded separately from the period statistics, so after saving or deleting a record, `refreshKey` must be changed in PR 3 for the new record to show.

- Main agent check: the 5km and 10km best records compare the workout time as it is among records within +/-2%. So a 4.9 km record can come before a 5.1 km record even if its pace is a little slower. This is the result of following the decision (4) not to estimate, and changing it would need a separate decision to compare by pace.
- This PR left the implementation to a sub-agent. The main agent read the records SQL and code and re-ran `npm run test -w frontend -- src/cardio` (43 pass), `tsx --test test/cardio.test.ts test/api-contract.test.ts test/openapi.test.ts` (19 pass), typecheck, eslint, prettier, and `test:docs` to check it.

## Change — fix: first review follow-up

- The first review had no required follow-ups, and 3 optional items were applied.
  - The aggregation unit (weekly or monthly) was decided only once at the first render, so if PR 3 only changed the period it passes, 53 weekly bars could still appear for a 1-year period. When the period changes, it restarts from the default unit of that period, and the unit the user chose is kept only within the same period. The last chosen unit is remembered together with that period, so if the user returns to the same period without choosing a unit again in another period, the previously chosen unit shows again (a remark left over from the PR 2 review, added to the document in PR 3).
  - The totals, the by-kind table, and the pace graph used the received records as they were. Now, at the start of the component, records outside `from..to` are filtered out once, so all numbers use the same records.
  - The 5km and 10km best records now show the speed (km/h) together with the pace (decision 3).
- Added tests (`cardio-stats.test.tsx`): a record outside the period is not included in the totals and kinds, and when the period changes the unit returns to the default while the chosen unit stays within the same period. Added `12.3 km/h` to the personal records expectation.
- `npm run test -w frontend -- src/cardio`: 45 pass. typecheck, eslint, and prettier pass
