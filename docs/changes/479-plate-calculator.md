# Plate calculator for barbell targets (#479)

Each set card in the workout editor has a "Plates" toggle in the header row (so a closed card keeps its height). It shows which plates to load on each side of the bar for the total weight entered, since weight is stored as the total including the bar.

## Rules (user decision, 2026-11-25)

- Default bar 20 kg; plates 25, 20, 15, 10, 5, 2.5, 1.25 kg.
- Both are editable in the same section and stored only in this browser (`workout-memo:plates:v1`), like the rest timer settings. Nothing is sent to the server.
- Each side carries (target − bar) / 2, filled greedily from the heaviest plate. A target that cannot be made shows the closest loadable total. A target below the bar says so.

## Files

- `frontend/src/plates.ts`: pure split and settings parsing.
- `frontend/src/workspace/plate-calculator.tsx`: UI and `usePlateSettings`.
- `frontend/src/workspace/workout-editor.tsx`: one settings state shared by every set row.
- Tests: `plates.test.ts`, `plate-calculator.test.tsx`.

## Checks

See the PR for `npm run check` results and the 390×844 / 1440×900 browser check.

## Visual baseline

One file updated, `e2e/__screenshots__/ui-visual.spec.ts/workout-editor-768.png`: the set card header now has a "Plates" button beside the delete button. The 390, 360 and 1280 editor shots did not change.
