# Replace the Log workout text buttons with icon buttons (#533)

Part of epic #524.

## Change

- `frontend/src/app.tsx`: the page header action is an icon button (`Button size="icon"`, `Plus` icon) with `aria-label` and `title` set to the action name ("Log workout", "Add goal", "Add machine"). The three pages are changed together so the headers stay consistent. The icon size is 40px, 48px on touch (`pointer-coarse`), so the tap target is at least 44px on touch screens.
- `frontend/src/workspace/workout-records.tsx`: the empty-state "Log workout" button is an icon button with the same accessible name and title.
- The project has no tooltip component, so the tooltip is the native `title` attribute.
- `frontend/src/new-workout-defaults.test.tsx`: new test that the log page buttons are icon-only and keep the accessible name and title. Existing tests that find the buttons by role and name pass unchanged.

## Checks

See the PR for `npm run check` results. Header screenshot baselines are updated from the CI `visual-baselines` artifact; the count is in the PR.

## Visual baselines

22 files in `e2e/__screenshots__/ui-visual.spec.ts/` were updated from the `visual-baselines` artifact of the CI run: `journal`, `dashboard`, `goals` and `machines` at 360/390/768/1280 (the header action is now an icon), plus `goal-editor` at 360/390/768/1280 and `machine-editor` at 768/1280 (the page header shows behind the modal). The failing e2e tests were all screenshot diffs in `ui-visual.spec.ts`; no other spec failed.
