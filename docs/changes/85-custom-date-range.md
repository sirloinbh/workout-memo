# #85 Choose a specific date or a custom date range in the stats

- Issue: [#85](https://github.com/sirloinbh/workout-memo/issues/85)
- Branch: `feat/85-custom-date-range` (started from main `cc6f510`, no DB or API change)

## Decisions — 2026-10-21

- The chart grouping unit is decided by the length of the range. 31 days or fewer is daily, 92 days or fewer is in 7-day units (weekly), and longer is by calendar month.
- The maximum range is 371 days including both ends (the same as the analysis API limit).

## Change

- `frontend/src/date-range.ts` (new)
  - `checkRange`: returns an error per item. It checks an empty value, a bad date (the shared contract `date`), an end date before the start date, and more than 371 days.
  - `parseRange`: returns the range only when both `from` and `to` in the address are valid.
  - `rangeBuckets`: builds the chart groups. For monthly, it shows like `25.11` when the year changes.
- Screen (`frontend/src/app.tsx`)
  - I added "직접 선택" (custom range) to the period tabs of the dashboard, the workout journal, and body records. You enter the start and end dates and press "적용" (apply).
  - A bad range shows an error on the matching input (`aria-invalid` and `aria-describedby`) and sends no request.
  - The applied range stays in the address query `?from=YYYY-MM-DD&to=YYYY-MM-DD`. It persists across a reload or a shared link.
  - When moving by the menu between the dashboard, workout journal, and body records, which use the same period, the query is kept. When going to another page, it is dropped.
  - Pressing a preset (1 day to 12 weeks) clears the query and returns to the existing anchor date method.
  - If the range in the address is bad, it shows the default period (1 week) and shows a notice.
  - The server query keeps using the existing `?from&to`. The stats (days worked out, completed sets, and cumulative volume) are computed from the range, inclusive of both ends, that the server returned.
  - Chart: I applied the new grouping rule only to a custom range. The existing preset charts are unchanged. When there are more than 12 bars, the labels are shown only at a fixed interval so they do not overlap.
- Style: I added the `.custom-range` input row. With 6 tabs, `.tabs` wraps on narrow screens.

## Tests

- `frontend/src/date-range.test.ts` (new)
  - The number of days including both ends and the per-item errors (including the 371-day boundary)
  - Address parsing
  - The daily, weekly, and monthly groups and the year notation
- `frontend/src/custom-range.test.tsx` (new)
  - When a range is applied, records on both end dates are included and those outside are excluded. It checks the daily bars and the address query.
  - The range stays when moving to the journal, and pressing a preset clears it.
  - Opening again by the address applies the same range.
  - A bad range shows only per-item errors and the requests do not increase.
  - A bad address is shown as the default period with a notice.
- `e2e/custom-range.spec.ts` (new)
  - In a real browser, applying requests that range and the address changes. It persists after a reload.
  - A bad end date only shows a notice and does not change the address.
  - There is no horizontal overflow at 320px width.

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 279 pass, 0 skip
  - Frontend 97 pass
  - Workers 162, skills 4, docs 3, and build pass
- `npm run test:e2e` (the same test DB): 5 passed. The existing 320px and 390px layout checks also passed (6 tabs).
- After adding the 320px check, I ran only `e2e/custom-range.spec.ts` again and it was 1 passed.

## Limits and follow-up

- In a custom range, the previous and next period buttons are hidden (you pick the range again).
- The exercise analysis page keeps using its own period (anchor date and number of weeks).
