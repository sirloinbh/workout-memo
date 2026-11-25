# Weekly summary push on Sunday night (#485)

A Web Push with the week's summary is sent on Sunday 21:00 Asia/Seoul to users who turned it on.

## Decisions (user, 2026-11-25)

- Sent on Sunday 21:00 Asia/Seoul, **off by default** until turned on, skipped in a week with no workouts.
- A week is Monday to Sunday. The new-record count uses the #477 rule (`newRecordsFor`).
- My choices: the text is "N workout days · V kg · N new records · goals A/T achieved" (goals are those whose period overlaps the week, judged as of the end of the week; the goals part is left out when there are none). Turning the switch on also asks for notification permission and subscribes the browser, because the summary arrives as a push.

## Change

| File                                                         | Content                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `database/migrations/022_weekly_summary.sql`                 | `weekly_summary_settings(user_id, enabled, last_sent_week)`                                                                                      |
| `backend/src/weekly-summary.ts`                              | Schedule (`nextSendAt`, `dueWeek`), the summary query, the payload text, the once-per-week claim and the timer                                   |
| `backend/src/web-push.ts`                                    | The per-user send is now `pushToUser`, shared by the rest push and the new `sendToUser`                                                          |
| `backend/src/routes/push.ts`, `app.ts`, `server.ts`          | `GET/PUT /api/push/weekly-summary`; the timer starts with the server and stops on SIGTERM                                                        |
| `shared/contract.ts` (+ generated copy)                      | `weeklySummarySettingSchema`                                                                                                                     |
| `backend/src/openapi.ts`, `docs/openapi.json`, `docs/api.md` | The two operations and the behavior                                                                                                              |
| `frontend/src/workspace/weekly-summary-toggle.tsx`           | The switch on the dashboard; hidden where push is unsupported or not set up                                                                      |
| `frontend/public/push/sw.js`                                 | Only the rest push is silent while the app is visible; the summary is always shown                                                               |
| Tests                                                        | `backend/test/weekly-summary.test.ts`, `weekly-summary.integration.test.ts`, `frontend/src/weekly-summary.test.tsx`, a filter in `push.test.tsx` |

## How the guards work

- Once a week: one `UPDATE weekly_summary_settings SET last_sent_week=<Monday> WHERE enabled AND last_sent_week < <Monday> RETURNING user_id` claims the week before sending, so a restart or two overlapping checks never send twice (tested with two concurrent checks).
- A week with no workouts is claimed too, so it is not retried, and nothing is sent.
- Only Sunday 21:00-24:00 (Seoul) has a summary due, so a server restart on Monday never sends it late.

## Checks

See the PR for the `npm run check` result. After deploy, turn the switch on and confirm one push on the next Sunday 21:00 (user check).
