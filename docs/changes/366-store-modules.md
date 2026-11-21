# Share workout and cardio data access, and split backup.ts (#366)

## Change

- `backend/src/store/workouts.ts` holds the workout queries (`listWorkouts`, `insertWorkout`, `insertSets`, `findRetry`, `summary`); `store/db.ts` holds the `Db` type. The routes, `ai-tools.ts` and the backup restore import them from there. `routes/workouts.ts` keeps only the HTTP handlers.
- `backend/src/store/cardio.ts` defines the cardio columns once (`[name, array type]` list). The column list, values, `$1..$15` placeholders, the UPDATE and the multi-row import INSERT are all built from it, so the three SQL strings cannot drift. The pace and speed SQL moved there too.
- `backup.ts` (1112 lines) is split into `backup-csv.ts` (CSV cells and columns), `backup-schema.ts` (backup schema, `parseBackup`, types), `backup-restore.ts` (restore algorithm) and `backup.ts` (routes and export). `backup.ts` still exports what other modules and tests import.
- No module outside `routes/` imports from `routes/`, except `app.ts` (registers the routes) and `openapi.ts` (reads route request schemas; lane-2 owns it).

## Checks

- No behavior change: the existing backend tests pass unchanged (backup round trip, cardio import, workouts, AI tools). `npm run check` passes.
