# Adapt the app to the new shared DateField (#518)

- Why: the central standards sync (PR #518) replaces the native date input inside `DateStepper` with the shared `DateField` (a text field plus a calendar popover button). The field's label now also matches the button "Pick reference date from a calendar", so `getByLabel('Reference date')` found two elements.
- Changes:
  - e2e specs use `getByLabel('Reference date', { exact: true })` (cardio, cardio-import, new-workout-defaults, offline-save, workout-crud).
  - `frontend/src/style.css`: on touch screens the DateField input keeps 16px text. The kit's input is `md:text-body-sm`, the old stepper had `md:pointer-coarse:text-base`, and the kit's `DateField` cannot take a class for its input; the `ui-touch` check failed at 768px ("Reference date" font 14px).
  - e2e screenshot baselines are refreshed from the CI artifact in a separate commit. Merging changes the look of production screens (date fields, buttons, inputs, selects).
- Checks: `npm run check` (see the PR).
