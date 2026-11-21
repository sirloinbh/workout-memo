# Keep set completion, RPE, and every user table in backups (#359)

Before this change a "Replace all" restore brought planned sets back as performed, dropped every RPE, and silently lost body records, body-part mappings, weight steps, routine rest days, and official-weight links, while the screen text claimed a full restore.

## Change

- Backup version 4 (`backend/src/backup.ts`): sets carry `completed` and `rpe`; machines carry `official_weight_id`; new lists `body_measurements`, `exercise_body_parts`, `exercise_weight_steps`, `routine_rests`. v1-v3 files still restore (defaults: completed, no RPE; the new tables are untouched even by "Replace all").
- The workout match key includes completion and RPE, so a repeat merge still skips identical journals.
- Merge keeps existing body records, weight steps, and mappings (different values are reported as conflicts); rest days follow the restored or matched routine.
- Restore preview (`frontend/src/backup.tsx`): the four new tables have labels, and any table the server reports without a label is shown instead of dropped.
- Comments and the replace prompt now say what is really replaced.

## Checks

- `backend/test/backup.test.ts`: v4 parsing, defaults for older files, bad values.
- `backend/test/backup.integration.test.ts`: export → replace into an empty database → export again gives identical rows; a v3 replace leaves v4-only tables alone.
- `frontend/src/backup.test.tsx`: new labels and an unknown table row.

## Verification notes

`npm run check` passed (backend 408 tests on a dedicated `workout_test` database). An earlier run hung because `TEST_DATABASE_URL` in the shell pointed at another project's database (`study_test`, port 15402). Always point it at a workout test DB.
