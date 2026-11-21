# Index sets by workout and batch set inserts (#368)

## Change

- Migration `020_sets_workout_idx.sql`: `CREATE INDEX IF NOT EXISTS sets_workout_idx ON sets(workout_id, position)`.
- `insertSets` (`backend/src/routes/workouts.ts`) saves all sets of a workout with one multi-row `INSERT ... SELECT ... FROM unnest(...) WITH ORDINALITY`; backup restore reuses it.
- The cardio import inserts all rows with one multi-row INSERT; ids follow the file order.

## Checks

- `backend/test/migrations.integration.test.ts` finds the new index.
- Existing workout, cardio import and backup tests pass (the cardio import fakes now expect one INSERT).
