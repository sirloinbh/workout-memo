# Replace the Log workout text buttons with icon buttons (#533)

Part of epic #524.

## Change

- `frontend/src/app.tsx`: the page header action is an icon button (`Button size="icon"`, `Plus` icon) with `aria-label` and `title` set to the action name ("Log workout", "Add goal", "Add machine"). The three pages are changed together so the headers stay consistent. The icon size is 40px, 48px on touch (`pointer-coarse`), so the tap target is at least 44px on touch screens.
- `frontend/src/workspace/workout-records.tsx`: the empty-state "Log workout" button is an icon button with the same accessible name and title.
- The project has no tooltip component, so the tooltip is the native `title` attribute.
- `frontend/src/new-workout-defaults.test.tsx`: new test that the log page buttons are icon-only and keep the accessible name and title. Existing tests that find the buttons by role and name pass unchanged.

## Checks

See the PR for `npm run check` results. Header screenshot baselines are updated from the CI `visual-baselines` artifact; the count is in the PR.
