# #115 Cardio records screen, part 3: connecting the workout journal tab and the dashboard summary

- Issue: [#115](https://github.com/sirloinbh/workout-memo/issues/115)
- Branch: `feat/115-cardio-tab`
- Prerequisites: PR 1 ([115-cardio-form.md](115-cardio-form.md), merged), PR 2 ([115-cardio-stats.md](115-cardio-stats.md), merged), #116 (cardio goals, merged), the journal side change of #105 (merged)

## Purpose

This is the last PR of #115. It attaches the cardio list, form, statistics, and personal records, built as independent components in PR 1 and 2, to the strength/cardio tab of the workout journal (decision 1), and shows one summary card (decision 5) on the dashboard only when there are cardio records. It also adds the 390px real browser flow (e2e) and the common screen checks.

| PR  | Content                                                                            |
| --- | ---------------------------------------------------------------------------------- |
| 1   | Form, list, edit, and delete components (merged)                                   |
| 2   | Statistics components and personal records API (merged)                            |
| 3   | Connecting the strength/cardio tabs of the workout journal, dashboard summary, e2e |

## Change — feat: strength/cardio tab of the workout journal

- `frontend/src/app.tsx`
  - Under the workout journal header, put the shared `SegmentedControl` ("기록 종류", "record kind": strength and cardio). Strength is the existing journal screen (summary cards, today's routine, workout record list) as it is.
  - When cardio is chosen, `CardioTab` shows under the same period selection (period tabs, reference date, custom pick). The period is shared by both tabs.
  - The chosen tab is kept in `?tab=cardio` of the address. Strength is the default, so it has no parameter. Changing the tab adds one history entry, so the tab is kept on back, forward, and refresh.
  - `setSearchParams({})` and `setSearchParams({ from, to })`, which used to change the period address (`?from&to`, #85), overwrote the whole address and wiped the tab. Now `setRangeAddress` changes only `from` and `to`, and `setJournalTab` changes only `tab`.
  - Main menu links: the workout journal carries over the current address as it is, and the dashboard and body records carry over only the period (without `tab`).
  - The strength journals of the period loaded in the workout journal are passed as `{ id, date, title }`, so "연결할 근력 일지" ("strength journal to link") in the cardio form can pick a same-day journal. No more requests are made.
- `frontend/src/cardio/cardio-tab.tsx` (new file): `CardioTab({ from, to, today?, workouts, onChanged? })`. A small container that puts `CardioPanel` and `CardioStats` one above the other.
- `frontend/src/cardio/cardio-panel.tsx`: added two optional properties. Without them it behaves exactly like PR 1.
  - `onSessionsChange(sessions)`: notifies every time the list on screen changes (`[]` while a new period is being loaded). The latest callback is kept in a ref, so calls do not increase even if the parent passes a new function every time.
  - `onChanged()`: called after a save, a delete, or an already deleted record (404).

### Lifting state up

Loading the record list is left in `CardioPanel`, and the tab (`CardioTab`) only holds the list the panel notifies it of and `refreshKey`.

- The statistics (`CardioStats`) compute from the list the panel has already loaded, so there is only one `/api/cardio-sessions` request.
- After a save or delete, the panel reloads the list so the statistics change, and `onChanged` raises `refreshKey` so the personal records (`CardioRecords`) are reloaded too. The cache of the dashboard summary (`['cardio-sessions', ...]`) is also marked invalid, so going back to the dashboard loads it fresh.
- There was also a way to move the loading to the tab, but then the handling of racing responses, errors, reconnect, and focus keeping from PR 1 would have to move and the tests be rewritten. Two callbacks let the PR 1 tests (19) pass as they are.

### Header button

On the cardio tab the "운동 기록하기" ("record workout") button of the header is hidden, and the "유산소 기록 추가" ("add cardio record") of the cardio list card is used as the main button of that screen.

- To change the header button into "유산소 기록 추가", a way to open the form from outside the panel (an imperative ref or lifting the open state up) would be needed, and two buttons with the same name would appear on one screen, which confuses screen readers and tests.
- The panel's button is at the head of the cardio list card right under the period selection, so it can be found in almost the same place as the header button.
- "운동 기록하기" on the strength tab and the dashboard is unchanged.

## Change — feat: dashboard cardio summary card

- Add a `StatCard` "유산소" ("cardio") to the summary card row of the dashboard. The value is the distance total of the period (km, a distance summed over kinds), and the description is "count · time" (for example "2회 · 1:32:05", "2 sessions · 1:32:05"). It uses `totalsOf` of `cardio/stats.ts` and `formatDistance` and `formatDuration` of `format.ts`.
- If the period has no cardio records, the card is not drawn and it stays the existing 4 cards. If there are, it is 5 columns from `lg`, and below that the fifth card takes one line.
- The request is only one `listCardioSessions(from, to)` on the dashboard (TanStack Query, `enabled: page === 'overview'`). If it fails, only the card is hidden and no error is shown. The workout journal does not make this request.

## Change — test: fixed data for the common screen checks

- `e2e/support/ui-fixtures.ts`
  - `/api/cardio-sessions`: returns the 4 fixed cardio records used in the #116 goals (running on 10/6, 10/9, and 10/13, and an indoor bike on 10/14) in the server response shape (latest first, pace and speed rounded the same way as the server). It filters by period.
  - `/api/cardio-sessions/records`: personal records computed with the same rules as the server (longest running 9 km, no 5 or 10km records).
  - Added `{ path: '/journal?tab=cardio', name: 'journal-cardio' }` to the screen list so the accessibility, responsive, touch, and visual checks include the cardio tab.
- The default dashboard period (10/12 to 10/18) of the fixed clock (2026-10-15) has the 10/13 and 10/14 records, so the cardio card shows on the dashboard too.

## Tests

- Added: 4 tests in `frontend/src/cardio/journal-tab.test.tsx` (the whole app is drawn with `mockApi` and `fixClock`)
  - The workout journal opens as strength and the address has no `tab`. Pressing cardio gives `?tab=cardio`, the cardio list and statistics show, and the strength summary cards and "운동 기록하기" disappear. The request period is the default week (10/12 to 10/18). Back goes to strength and forward goes to cardio again.
  - Opening `/journal?tab=cardio&from=2026-10-01&to=2026-10-10` shows the records, the pace (6:00/km), and the statistics period of that period. Pressing the period tab "1주" ("1 week") removes only the period from the address while `tab=cardio` stays, and it is recomputed for the new period. Going to the dashboard does not carry `tab`.
  - Saving a cardio record changes the period totals (5 km, 30:00) and reloads the personal records so "러닝 최장 거리" ("longest running distance") shows (2 `/records` requests).
  - The dashboard shows the "유산소" ("cardio") card (8.2km, "2회 · 1:32:05") if the period has records, with 1 request. Changing to a period with no records (1 day) removes the card. Going to the workout journal does not increase the dashboard requests.
- Added: 1 test in `e2e/cardio.spec.ts` (390x844, the real API and test DB, 2001-04-20 which does not overlap other specs)
  - Choosing the cardio tab in the workout journal gives the address `/journal?tab=cardio` and there is no "운동 기록하기" ("record workout").
  - Saving running of 1 hour 2 minutes 30 seconds and 12.5 km shows "1:02:30 · 12.5 km · 5:00/km · 12 km/h" in the list and 12.5 km in the period totals. The tab and the record remain after a refresh.
  - Changing the distance to 10 km gives "6:15/km · 9.6 km/h", also after a refresh. Deleting removes it from the list and after a refresh. A record left by a failure is found by memo and removed by `afterAll`.
- Run results
  - `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx`: 8 files, 80 pass (including PR 1 `cardio-panel.test.tsx`)
  - `npm run test -w frontend -- src/custom-range.test.tsx`: 6 pass (run together because the period address handling changed)
  - `npm run typecheck -w frontend`: pass
  - `node_modules/.bin/tsc -p e2e/tsconfig.json --noEmit`: pass
  - `node_modules/.bin/eslint` and `node_modules/.bin/prettier --check` (changed files): pass
- The full local `npm test`, `npm run check`, and e2e were not run because there is a history of running out of memory and the local PostgreSQL is off. `e2e/cardio.spec.ts` and the common screen checks are checked in the CI `e2e` job.

## Visual baselines

- The new screen `journal-cardio` (4 widths) has no baselines, the dashboard (`dashboard`, 4 widths) changes with the added cardio card, and the strength journal (`journal`, 4 widths) changes with the "기록 종류" ("record kind") tab added under the header. That is 12 images in all (corrected in the first review, where `journal` was missing). The baselines were not made locally.
- If CI `e2e` fails on screen differences, follow the procedure of [workout-testing](../../skills/workout-testing/SKILL.md): check the diff in `playwright-report`, update `e2e/__screenshots__/` with the `visual-baselines` artifact of the same run, and write the changed count in this document and the PR.

## Limits and remaining work

- The cardio tab does not show the strength summary cards and today's routine card. The local draft notice and the rest timer of the strength journal still show on both tabs.
- While the panel loads a new period, the statistics briefly look empty. They disappear at the same time as "기록을 불러오는 중…" ("loading records...") of the panel.
- The distance of the dashboard card adds swimming in km too (the same as the period totals of the cardio tab).

- This PR left the implementation to a sub-agent. The main agent read the address handling change in `app.tsx` and re-ran `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx src/custom-range.test.tsx src/workout-draft.test.tsx` (10 files, 108 pass), typecheck (frontend and e2e), eslint, prettier, and `test:docs` to check it.

## Change — fix: first review follow-up

- (Required) Visual baselines: added the 4 `journal` images to the "Visual baselines" section above and corrected it to 12. The actual update is done with the CI artifact of this commit.
- (Optional) When the list could not be loaded the first time, the statistics looked like "no records". `CardioPanel` now notifies `loading`, `error`, and `ready` together with `onSessionsChange(sessions, status)`, and `CardioTab` shows the statistics only when `ready`. The case where reloading after a save fails and the list remains is `ready`.
- (Optional) If all the records of the period have no distance, the dashboard card shows the count (for example "1회", "1 session") as the value instead of "0 km" and "45:00 · 거리 미입력" ("45:00 · distance not entered") as the description.
- (Optional) Tests: added that going to the dashboard from an address with a hand-picked period and `tab=cardio` leaves only `?from&to`, that the statistics are hidden when the first load fails, and the card when there are only records without distance. The comment of the test for going to the dashboard after a period preset was also fitted to what is actually checked.
- Limit (not applied): the candidates for linking a strength journal are only the journals within the period that the journal tab has loaded. If the date is changed outside the period in the form, the journal of that day is not a candidate even if it exists. The speed in the fixed data for the screen checks is computed with real numbers unlike the server's NUMERIC rounding and could differ at a boundary of the second decimal place, but with the current data it is the same.
- `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx src/custom-range.test.tsx`: 89 pass. typecheck, eslint, and prettier pass

## Change — fix: second review follow-up

- (Optional, a regression made by the first follow-up) When the statistics were drawn only when `ready`, `CardioStats` disappeared and was attached again every time the period changed. As a result the chosen metric went back to 'distance', the personal records, which do not depend on the period, were requested again each time, and the screen jumped. Now it is hidden only on `error`, and while loading it stays attached and passes `pending` to show "통계를 불러오는 중…" ("loading statistics...").
- Added test: even if the period preset is changed, the chosen metric ('time') stays and `/api/cardio-sessions/records` is not requested again
- (Optional, not applied) Right after the period changes, in one render the new period and the old list can be mixed. It goes through the period filter, so usually only an empty state shows briefly, and now "loading" shows while loading, so it is left as a limit.
- `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx src/custom-range.test.tsx`: 90 pass. Two reviews are done, so there is no third review.

## Change — test: update visual baselines

- In CI `e2e-visual` for `bfcce96`, only 14 visual comparisons failed. 83, including the new `e2e/cardio.spec.ts` and the accessibility, responsive, and touch checks, passed.
- Updated: `journal-cardio` 4 images (new screen), `dashboard` 4 images (cardio card), `journal` 4 images ("기록 종류" ("record kind") tab), and `workout-editor` 768 and 1280, 2 images (the card is added to the dashboard behind the modal). 14 in all.
- How it was checked: viewed `journal-cardio` 1280 and 390 and `dashboard-1280` directly and confirmed only the intended changes, then updated with the `visual-baselines` artifact. The other images were byte-for-byte the same as the existing baselines.
- Defect found: the dots of the running pace trend are drawn as flat ellipses at 1280px. This is because the SVG is stretched with `preserveAspectRatio="none"`, and the problem came from PR 2. It was after the two reviews, so it was not fixed in this PR and was split out to #263.

## Merge main

- Just before the merge, #257 (cardio goals included in backup), #259 (mobile app docs), and #262 (swimming goal in m) entered main. `shared/**` and `e2e/**` changed, so it did not meet the condition to merge right away, and `origin/main` was merged. There were no conflicts.
- After the merge, `npm run test -w frontend -- src/cardio src/period.test.tsx src/routing.test.tsx src/backup.test.tsx` gave 91 pass, and `npm run typecheck -w frontend` and `tsc -p e2e/tsconfig.json` passed
