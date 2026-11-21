# Move the routine-progress engine and routine schema into shared/ (#452)

Decision (user, 2026-11-21, issue comment on #452): option A, everything goes into the single `shared/contract.ts`, copied to `backend/src/contract.ts` by `npm run contract:sync`. No tooling or Docker change.

## Change

- `shared/contract.ts` now also holds: the routine schema (`routineSchema`, `RoutinePlan`, `routineSchedule`, was in `domain.ts`), the routine progress engine (`arrangeTargets`, `routineProgress`, `restPreview`, `restUnavailable`, `weekExercises`, `weekCardio`, `withWeightSteps`, record and target types; was `progress.ts`), the exercise analysis (`analyze`, `AnalysisSet`, `bodyPartMappingSchema`, `estimatedOneRepMax`; was `analysis.ts`), the cardio goal judge (`judgeCardioGoal`, `suggestCardioGoal`, `goalPeriods`; was `cardio-goals.ts`), and the routine inputs used by tests (`routineInput`, `autoRoutineInput`; was `backend/test/routine-fixture.ts`). The helpers `round`, `addDays` and `mondayOf` that were copied in three files exist once.
- `backend/src/progress.ts`, `analysis.ts`, `cardio-goals.ts`, `domain.ts` (routine part) and `backend/test/routine-fixture.ts` only re-export from `./contract.js`, so every backend import and test keeps working unchanged.
- `frontend/src/routine-progress.test.tsx` and `e2e/support/ui-fixtures.ts` import from `shared/contract` instead of `backend/src` (import lines only).

## Not changed

- Code moved verbatim; no behavior change. The only edits besides the move are the import lines and the shared helper definitions.

## Tests

- All existing backend, frontend and e2e specs run unchanged against the moved code.

Merging this deploys to production.
