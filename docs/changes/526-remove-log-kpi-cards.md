# Remove the KPI cards from the log page (#526)

Part of epic #524.

## Change

- `frontend/src/workspace/journal-page.tsx`: the Strength tab no longer renders `StatsGrid` (Workout days, Total volume, Completed sets, Goal achieved). The `goals` prop that only fed the "Goal achieved" card is removed from `JournalPage`, and `app.tsx` no longer passes it (`app.tsx` still loads goals for the exercise suggestions and the Goals page).
- `StatsGrid` is kept: the Dashboard (`dashboard-page.tsx`) still uses it, and the Dashboard stats are out of scope for this request.
- `frontend/src/workout-draft.test.tsx`: removed the `Completed sets` assertions that read the log page KPI card. "Recovery never auto-syncs" stays covered by the mutation count checks in the same tests.
- `frontend/src/new-workout-defaults.test.tsx`: new test that the log page shows no KPI cards.

## Checks

See the PR for `npm run check` results. Log-page screenshot baselines are updated from the CI `visual-baselines` artifact; the count is in the PR.

## Visual baselines

6 files in `e2e/__screenshots__/ui-visual.spec.ts/` were updated from the `visual-baselines` artifact of the CI run: `journal` at 360/390/768/1280 and `workout-editor` at 768/1280 (the log page shows behind the editor dialog). The Cardio tab screens did not change. No other screen differs.

## e2e

`e2e/workout-crud.spec.ts` read Total volume and Completed sets from the log page KPI cards. It now checks the same values on the workout row (`501.25 kg`, `1 set`, `600 kg`); the final "0 kg" card check after deleting is dropped because the row count of 0 is already asserted.
