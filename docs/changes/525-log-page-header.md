# Show only today's date, weekday and routine on the log page header (#525)

Part of epic #524.

## Change

- `frontend/src/app.tsx`: on the log page the header no longer shows the eyebrow "YOUR PROGRESS, IN FOCUS", the title "One more step today" or the description "Every set holds a better you than yesterday." The title is now the date and weekday (for example "Thu, Oct 15", from `progress.today`, Asia/Seoul) and the description is today's routine name, or "No routine" when none is set.
- The overview, goals and machines headers are unchanged.
- `frontend/src/new-workout-defaults.test.tsx`: new test for the header text.

## Checks

See the PR for the results of `npm run check`. Browser sizes (390x844, 1440x900) are covered by the CI e2e jobs; screenshot baselines are updated in this PR if `e2e-visual` reports a diff.

## Visual baselines

10 files in `e2e/__screenshots__/ui-visual.spec.ts/` were updated from the `visual-baselines` artifact of the CI run: `journal` at 360/390/768/1280, `journal-cardio` at 360/390/768/1280 and `workout-editor` at 768/1280. All are log-page screens whose header text changed; no other screen differs.
