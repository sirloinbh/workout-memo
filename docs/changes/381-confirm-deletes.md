# Confirm deletes with ConfirmDialog (#381)

## What changed

- Every delete asks in the shared `ConfirmDialog` instead of the browser's `confirm()`: workout journals, strength goals, cardio goals, cardio records and body records.
- New hook `components/use-confirm-delete.tsx` holds the item to delete and renders one dialog per page. Focus returns to the button that opened it.
- While a delete runs, the dialog's buttons are disabled, so a double click sends one DELETE. The workout delete button is also disabled while a save is running.
- `workspace/workout-records.tsx` and `workspace/goals-page.tsx` (lane-3's files) changed only at the delete button and one hook call.

## Behavior note

The dialog is modal, so the period cannot be changed while a delete is running. The old test that changed the period mid-delete now checks that the dialog stays open and the selected period refreshes afterwards.

## Tests

- New `test/confirm.ts` helpers (`confirmDelete`, `cancelDelete`) replace the `confirm` stubs in the body, goals, cardio and period screen tests.
- New screen test: double-clicking Delete sends one DELETE.
- `rg "confirm\(" frontend/src --glob "!**/*.test.*"` finds no browser call (only comments).
