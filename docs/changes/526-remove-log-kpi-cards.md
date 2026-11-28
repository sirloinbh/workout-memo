# Remove the KPI cards from the log page (#526)

Part of epic #524.

## Change

- `frontend/src/workspace/journal-page.tsx`: the Strength tab no longer renders `StatsGrid` (Workout days, Total volume, Completed sets, Goal achieved). The `goals` prop that only fed the "Goal achieved" card is removed from `JournalPage`, and `app.tsx` no longer passes it (`app.tsx` still loads goals for the exercise suggestions and the Goals page).
- `StatsGrid` is kept: the Dashboard (`dashboard-page.tsx`) still uses it, and the Dashboard stats are out of scope for this request.
- `frontend/src/workout-draft.test.tsx`: removed the `Completed sets` assertions that read the log page KPI card. "Recovery never auto-syncs" stays covered by the mutation count checks in the same tests.
- `frontend/src/new-workout-defaults.test.tsx`: new test that the log page shows no KPI cards.

## Checks

See the PR for `npm run check` results. Log-page screenshot baselines are updated from the CI `visual-baselines` artifact; the count is in the PR.
