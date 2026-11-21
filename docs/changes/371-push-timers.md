# Push send deadlines and an earliest-rest timer (#371)

## Change

- Each push send has a 10 second deadline (`timeout` for the web-push request, plus a `withDeadline` race so any sender is cut off). A stalled push endpoint no longer holds back other pushes; the failure is logged.
- The `running` flag that made every later check wait for the earlier one is gone. Overlapping checks are safe because a rest is claimed with `DELETE ... RETURNING` (atomic), and users of one check are sent in parallel.
- The fixed 2 second polling interval (two DELETEs each tick, about 86,000 statements a day) is replaced by one timer for the earliest `ends_at`: `scheduleRest` arms it, a firing check re-arms it from `min(ends_at)`, and `start()` arms it once for rests left over from a restart. With no rest pending nothing runs.
- `start()` no longer takes an interval; the stop function still waits for checks in progress (#361).

## Checks

- `backend/test/web-push.test.ts`: a never-answering sender still lets the next due push go out; with no pending rest exactly one query is issued and none afterwards; a scheduled rest fires one check at its time, then no more queries.
- The PostgreSQL rest push tests and `backend/test/resilience.test.ts` pass.
