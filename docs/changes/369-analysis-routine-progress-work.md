# Cut repeated work in analysis and routine-progress requests (#369)

## Change

- `backend/src/analysis.ts`: sets and body-part mappings are grouped by pushing into the existing `Map` array, not by copying the array for every row (it was O(n²)).
- `backend/src/progress.ts`: `routineProgress` arranges the plan once and passes the result to `restUnavailable` and `restPreview`. The preview still needs one more arrangement (with today rested), so a request is 2 calls instead of 5 (1 when no preview is built). `arrangeStats.calls` counts them for the test.
- `backend/src/routes/cardio-goals.ts`: the session query is limited to sessions inside some goal's own dates (and up to today), instead of everything since the earliest goal start.
- `backend/src/routes/routines.ts`: `planRecords` reads `s.completed` directly (the column exists since migration 006).

## Not changed

- `GET /api/analysis` still reads every completed set: each exercise in the response carries all-time values (`set_count`, `last_date`, bodyweight and unknown-base counts, PRs), so a window-only query would change the response. Moving those to SQL aggregates is a larger change; the grouping fix removes the quadratic cost.
- `GET /api/exercise-names` was not listed in the tasks and is unchanged.

## Tests

- `backend/test/routine-progress.test.ts`: counts `arrangeTargets` calls per `routineProgress` call.
- Existing analysis, cardio goal and routine progress tests pass unchanged.

Merging this deploys to production.
