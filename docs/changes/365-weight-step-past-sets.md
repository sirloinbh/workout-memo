# Base weight-step suggestions on past completed sets only (#365)

## Change

- `backend/src/routes/weight-steps.ts`: the record fallback of `GET /api/goal-suggestion` now ignores sets with weight 0 and workouts dated after today (Asia/Seoul), like the analysis page, so it never suggests "0 kg + 5 kg" from a bodyweight set or builds on a future-dated workout.

## Tests

- `backend/test/weight-steps.test.ts`: a 0 kg set (the latest in its workout) and a heavier future-dated workout exist, and the suggestion still comes from the latest past set with weight above 0. The test dates moved to 2000 so they are in the past.

Merging this deploys to production.
