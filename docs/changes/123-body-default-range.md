# #123 Empty charts shown because the body records default range is 1 week

- Issue: [#123](https://github.com/sirloinbh/workout-memo/issues/123)
- Branch: `fix/123-body-default-range` (started from main `b533fc1`, no DB or API change)

## Purpose

Weight and InBody are usually measured once a week or less. Because the default range was `1주` (1 week), if the last measurement was last week, the first screen of body records showed 3 empty chart cards and only "기록이 없습니다" (no records) ([UX audit](../ux-audit/2026-10-21.md) U-09).

## Change — fix: 12-week default range for body records and a one-line notice for empty metrics

- Default range (`frontend/src/app.tsx`)
  - Until the user picks a range preset, only the body records page starts with `12주` (12 weeks). The dashboard and the workout log still start with `1주`.
  - Once a preset is picked, the three pages share the same range as now (#17).
  - A range picked directly (`?from&to`, #85) still takes priority over every default. The "default range" shown when the range in the URL is invalid is 12 weeks on body records.
  - I did not choose the approach of "default to the range that contains the last record". The records would have to be queried first to decide the range, which needs two requests. With 12 weeks (84 days) and one measurement a week, there are about 12 points, which is enough to see a trend.
- Empty metrics (`frontend/src/body.tsx`, `frontend/src/style.css`)
  - A metric that has no value at all in the selected range does not get a chart card. Instead, one line below the charts tells about it. Example: `이 기간에 입력한 값이 없는 지표: 체지방률 · 골격근량` (Metrics with no entered value in this period: body fat percentage · skeletal muscle mass)
  - The chart (`Trend`) draws only metrics that have at least one value, so the empty-state text inside the card (`chart-empty`) and the "기록 없음" (no records) branch were removed.

## Tests

- `frontend/src/body.test.tsx`
  - Added: opening it for the first time on a Monday (2024-03-11) requests 12 weeks (`2023-12-19` to `2024-03-11`) and the `12주` tab is selected. Even with only last week's record, the 3 charts show points. This test fails on the code before the fix, because it requests 1 week (`2024-03-11` to `2024-03-17`).
  - Added: the 12-week default applies only to body records. The dashboard starts with 1 week, and if `4주` (4 weeks) is picked and the user comes to body records, 4 weeks is kept.
  - Changed: an empty range has no chart cards, and the three metrics are noted in one line (before, it checked for 3 empty charts).
  - Changed: the existing 1-week scenario (`openWeek`) now clicks `1주` first because the default became 12 weeks. What it verifies is the same.
- Visual regression baselines: updated 4 images `e2e/__screenshots__/ui-visual.spec.ts/body-{360,390,768,1280}.png` (see "Visual baseline update" below).

## Verification — 2026-10-30

Run on local Node 24.21.0 (Volta). `npm ci --ignore-scripts` was run by the user directly, and `.standards/ioc-scan.mjs` found no suspicious item.

- Regression check: with the code before the fix (only `app.tsx`, `body.tsx`, and `style.css` reverted), I ran `npm run test -w frontend -- src/body.test.tsx`. Of 6, the 2 new tests (12-week default, one-line notice for empty metrics) failed. After the fix all 6 passed.
- Related screen tests: I ran `body`, `custom-range`, `period`, `routing`, and `inbody-import`, and got 39 pass.
- `npm run check` (`TEST_DATABASE_URL` not set)
  - format, lint, contract, typecheck passed
  - backend 206 pass, 35 skip (DB integration tests did not run, so they are not counted as passed)
  - frontend 175 pass, 1 fail. The failed check "계약에 없는 요청은 거부" (requests not in the contract are rejected) in `src/test/contract-api.test.ts` has nothing to do with this change. On this PC, another project's server (qesg-channel) answered on `localhost:3000`, so the request was not rejected (response header `x-powered-by: Nuxt`). It is a centrally managed file, so it is not fixed here.
  - After the failure stopped the run, I ran the remaining steps separately: `test:skills` 4 pass, `test:docs` 3 pass, `build` passed.
- `npm run standards:check` passed (central `7a47662`).
- e2e, visual regression, and DB integration tests were not run locally. They are checked with the CI `e2e` and DB jobs.

## First review — 2026-10-30

A separate agent reviewed read-only. There was no regression in the default range, the directly picked range, the fallback for an invalid URL, the query keys, or page navigation. There was 1 comment.

- Comment: when the query failed, `rows` was empty, so "값이 없는 지표: 체중 · 체지방률 · 골격근량" (metrics with no value: weight · body fat percentage · skeletal muscle mass) was shown under the error notice. It wrongly tells that there is no data.
- Applied (fix: hide the empty-metric notice when the query fails): the notice is shown only when the query succeeded (`!error`).
- Test: added "조회 실패 시 오류만 알리고 빈 지표 안내는 없다" (when the query fails, only the error is shown and there is no empty-metric notice) to `body.test.tsx`. It failed with the `body.tsx` from before the fix and `body.test.tsx` had 7 pass after.
- Note (not applied): there is no test that checks `?from&to` and an invalid URL separately on the body records page. I did not change that branch this time, and the existing `custom-range.test.tsx` passes.

## Second review — 2026-10-30

A separate agent reviewed the first fix and the whole final diff read-only. There were no further fixes.

- The first comment is resolved by the `!error` condition, and the new test is correct.
- `Trend` is drawn only for metrics with at least one value. So there is no path where `Math.min`/`Math.max` of an empty array creates Infinity or NaN.
- The docs record matches the code.

## Visual baseline update — 2026-10-30

- The `e2e-visual` of CI run `41005592990` (head `bd90707`) failed only on the 4 body records images. Example: at 390px, height 1350px → 1748px.
- I downloaded the `visual-baselines` artifact of the same run and compared it file by file with the existing baselines. Only the 4 `body-*.png` files differed.
- I checked the 390px image before and after directly. Only the intended changes were there.
  - The `12주` tab is selected.
  - The range changed to `2026-07-24 — 2026-10-15`.
  - Trend lines are drawn in the 3 charts.
  - Records grew from 1 to 5.
- I replaced the 4 images with the artifact images.

## Limits and follow-up

- A user whose measurement interval is longer than 12 weeks can still see an empty screen. They then have to widen the range with the range tabs or "직접 선택" (custom range).
