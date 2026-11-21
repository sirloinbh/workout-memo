# Split the routine builder into editor components (#378)

Issue: https://github.com/sirloinbh/workout-memo/issues/378

## Purpose

`frontend/src/routines.tsx` was 1,324 lines with one component holding the whole form, so the plan form, split editor and cardio editor could not be read or tested alone.

## Changes

- `routines.tsx` (now 335 lines) keeps the page: the state, the API calls, the step shell and the discard dialog.
- New `frontend/src/routines/` folder, moved without changing behaviour:
  - `model.ts`: plan types, split defaults (`withSplitDefaults`), `payload`, step names and small helpers.
  - `steps.tsx`: `BasicsStep`, `ScheduleStep` and `WeeklyGoals`.
  - `split-editor.tsx` and `cardio-editor.tsx`: one split with its exercises, and its cardio items.
  - `previews.tsx`: the 12-week and cardio previews. `plan-view.tsx` and `plan-list.tsx`: the saved plan and the plan list.
  - `styles.ts`: the routine form's looks, which now come from `components/form-styles.ts` (touch text, select and hint). `components/form-styles.ts` gains `stackedFieldLabel`, the routine form's tighter label.
- The select class strings were the one visible change: the routine selects now use the shared `selectField`, which adds `min-w-0`, no vertical padding and an invalid border, and is otherwise the same.

## Verification

- `routines.test.tsx` and the routine tests pass unchanged.
- `npm run check`: passed. The e2e and visual jobs in CI cover the screen at the mobile and PC sizes.

## Limits

- No behaviour change: the markup was moved, not rewritten. Page state and the `/api/routines` calls stay in `routines.tsx` so the #373 and #376 changes in lane-3 land in one place.
