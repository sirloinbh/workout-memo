# #140 Record the week start day exception and update the next tasks for #200

- Issue: [#140](https://github.com/sirloinbh/workout-memo/issues/140), [#200](https://github.com/sirloinbh/workout-memo/issues/200)
- Branch: `docs/140-week-start-exception`

## Purpose

The central shared rule is a week that starts on Sunday, and this app uses a week that starts on Monday. I decide which one it is and align the code and the instructions. The user left the choices to me and asked me to go with the recommendation.

## Change — docs: record the exception

- `AGENTS.project.md`: wrote the exception that a week starts on Monday, and the reason.
- The code was not changed. `mondayOf` in `backend/src/analysis.ts`, which uses calendar weeks, and the `week` ranges in `frontend/src/analysis.tsx` and `frontend/src/app.tsx` are already Monday-based. No code uses a week that starts on Sunday.
- Unlike the issue body, the default goal end date is not always a Sunday. It is the end of the query range (`deadline={to}`), so it is a Sunday only for a 1-week range. Week N of a routine is not a calendar week but 7 days counted from the start date.
- project-standards#363 was removed from next-steps because it was closed (checked 2026-11-01).
- `docs/daily/2026-11-01.md`, `docs/next-steps/README.md`: updated today's result and the next tasks.

## Verification

There is no change to app behavior, so no tests were added.

- I checked where the week start day is used with a code search.
- The full check is confirmed with the PR CI.
