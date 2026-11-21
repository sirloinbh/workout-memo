# Share progression code and progress types through the contract (#377)

## Change

- `shared/contract.ts` (synced to `backend/src/contract.ts`) now holds the pure progression rule (`progressionStep`, `deloadWeight`, `ProgressionLevel`, `ProgressionKind`), the body-part lists (`bodyParts`, `legacyBodyParts`, `allBodyParts`), and the routine week change types (`changeKinds`, `ChangeKind`, `deloadMetrics`, `DeloadMetric`).
- `backend/src/progress.ts` and `backend/src/domain.ts` import them (`progress.ts` re-exports `deloadWeight` and `progressionStep` for its tests; `domain.ts` re-exports the body-part lists); the routine schema uses `changeKinds` and `deloadMetrics`.
- `frontend/src/progression.ts` calls the shared `progressionStep` instead of a copy of the rule; it only walks the sessions.
- `frontend/src/progress-data.ts`: `Change.kind` is a `ChangeKind` (and `deload_metric` a `DeloadMetric`), `TargetExercise` carries the progression `kind`, and `changeLabel` is an exhaustive `switch`, so an unknown kind no longer shows "Reps +n".
- Body-part lists in `frontend/src/analysis.tsx` and `frontend/src/routines/model.ts` (the old `routines.tsx` list, approved by the coordinator) now come from the shared list.

## Not done

- `routine-progress.test.tsx` (and `analysis.test.tsx`) still import backend source to simulate the server (`routineProgress`, `analyze`, `routineSchema`, fixtures). Removing that needs the whole routine-progress engine and routine schema to move into `shared/`, which is a much larger change; `rg "backend/src" frontend/src` still matches those tests and a few comments.

## Tests

- `backend/test/routine-progression.test.ts`: the preview parity test loads the frontend file with the real contract module, so the preview and the server run the same shared rule.
- Existing routine, progression and frontend tests pass unchanged.

Merging this deploys to production.
