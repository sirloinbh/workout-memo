# Split the app.tsx Workspace into hooks and page components (#374)

`frontend/src/app.tsx` held the whole app: one `Workspace` component of about 1,900 lines with about 35 `useState` calls. It is now 495 lines. The code moved without changing behavior: the screen tests pass unchanged (87 files, 525 tests).

## Change

| File (`frontend/src/workspace/`)                                                        | Content                                                                                                        |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `model.ts`, `api.ts`, `form-text.ts`                                                    | Shared types, pure helpers, page addresses; the app API adapter (`Unreachable`, `api`); small form text styles |
| `use-period-range.ts`                                                                   | The period, reference date, custom range and the journal tab kept in the address                               |
| `use-rest-timer.ts`                                                                     | The rest timer, its settings and the end-of-rest vibration                                                     |
| `use-push.ts`                                                                           | Rest-end Web Push status, toggle and sync                                                                      |
| `use-workout-draft.ts`                                                                  | The workout editor, its local draft, set completion and the save with a retry key                              |
| `use-routine-progress.ts`                                                               | Today's routine card and the rest-day change                                                                   |
| `period-controls.tsx`, `rest-timer-panels.tsx`, `stats-grid.tsx`, `workout-records.tsx` | Shared pieces of the pages                                                                                     |
| `dashboard-page.tsx`, `journal-page.tsx`, `goals-page.tsx`, `machines-page.tsx`         | One file per page                                                                                              |
| `workout-editor.tsx`, `machine-editor.tsx`, `goal-form.tsx`, `volume-chart.tsx`         | The editors, the goal form and the volume chart                                                                |
| `app.tsx`                                                                               | Routing, the data queries, the page frame and the dialogs                                                      |

## Notes

- The hooks take what they need as arguments (`useWorkoutDraft` gets `setSaving`, `onSaved` and `onSetCompleted`), so the order of effects and state is the same as before.
- The effort-feedback `ToggleChips` caller (touched by #379) is now in `workspace/workout-editor.tsx`.
- Not done: moving the data queries and the `action` helper out of `Workspace`, which is left for the TanStack Query mutations work (#376).

## Checks

- `npm run test -w frontend`: 87 files, 525 passed, 7 skipped, before and after the move, with no test file edited.
- `npm run check`: passes (a first run hit the known random "bad port" flake in a backend test; the rerun passed).
