# Monthly workout calendar and weekly streak on the dashboard (#482)

The dashboard now has a "Workout calendar" card: a month grid (Monday first) shaded by each day's completed volume, with the current and best streak.

## Decisions

- Streak (user decision, 2026-11-25): consecutive Monday-based weeks with at least one workout. The current streak stays alive through the running week, so it breaks only after a whole week without a workout.
- A workout with no completed set is not a workout day (same rule as the "Workout days" stat).
- Shade level 1-4 is relative to the busiest day of the month shown. Dates are `YYYY-MM-DD` Seoul dates; the month grid uses UTC date arithmetic.

## Change

| File                                           | Content                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/workspace/activity.ts`           | Pure helpers: `monthGrid`, `shiftMonth`, `dailyVolumes`, `shadeLevel`, `weekStreaks`                                                       |
| `frontend/src/workspace/activity-calendar.tsx` | The card. Loads the last 400 days itself (key `['workouts', 'activity', …]`, so a workout save refreshes it); a failed load hides the card |
| `frontend/src/workspace/dashboard-page.tsx`    | Renders the card above the records                                                                                                         |
| `frontend/src/activity-calendar.test.tsx`      | Month edges, empty month, streak count, navigation, shading                                                                                |

No API, schema or migration change.

## Checks

See the PR for the `npm run check` result and the 390×844 / 1440×900 browser check.

## Visual baselines

4 files updated in `e2e/__screenshots__/ui-visual.spec.ts/` (`dashboard-360/390/768/1280.png`), taken from the CI `visual-baselines` artifact, because the dashboard has a new calendar card. No other screen changed.
