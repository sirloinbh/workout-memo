# #114 Cardio data model, API, and shared contract

- Issue: [#114](https://github.com/sirloinbh/workout-memo/issues/114)
- Branch: `feat/114-cardio-model`

## Purpose

Build the data foundation that the cardio goals, routines, and records screens (#115) and the import of external records (#118) will share. This PR covers the DB, API, shared contract, backup, and CSV, and builds no screens. The design follows the issue's decisions A to H of 2026-11-08.

## Change — feat: cardio record model and API

- `database/migrations/015_cardio_sessions.sql` (new file, safe to re-run)
  - `cardio_sessions`: date, start time (`TIME`, Seoul time), 9 kinds, duration (integer seconds), distance (`NUMERIC(8,3)` km), average and max heart rate, calories, cumulative elevation gain, cadence, perceived intensity, link to a strength journal, source, external ID, and memo.
  - The same ranges as the API are also enforced with CHECK. Only "no date after today" is checked only in the API, because a CHECK must not depend on the current date.
  - `workout_id` references `workouts`, and deleting the journal only removes the link (`ON DELETE SET NULL`).
  - `(source, external_id)` is a partial unique index that is unique only when `external_id` exists. `manual` cannot have an external ID (CHECK).
  - There are indexes on the date and the linked journal. Laps and GPS routes were not built (decisions C and D).
- `shared/contract.ts`, copied with `npm run contract:sync` to `backend/src/contract.ts` and `frontend/src/contract.ts`
  - `cardioKinds` (9 kinds), `cardioSources` (`manual`, `garmin`, `nike`, `file`), `cardioSessionObject` (field rules), `checkCardioSession` (cross-field rules), `cardioSessionSchema`, `cardioSessionSchemaFor(today)` (no date after today), and `CardioSessionInput`.
  - Perceived intensity uses the `feedbackLevels` of #83 (`hard`, `medium`, `easy`) as they are.
- `backend/src/routes/cardio.ts` (new file), registered in `backend/src/app.ts`
  - `GET /api/cardio-sessions?from&to[&kind]`, `GET/PUT/DELETE /api/cardio-sessions/:id`, and `POST /api/cardio-sessions`.
  - An update is a transaction. `BEGIN`, lock the row with `SELECT ... FOR UPDATE`, a full-replace `UPDATE`, then `COMMIT`. If the target is missing or an error occurs, it does `ROLLBACK`.
  - "Today" uses the value injected with `createApp(pool, { today })` (the same as routines). Tests can fix the date.
  - The path ID uses `parseId(req.params.id, '유산소 기록')` ("cardio record"), and a missing record is `sendError(res, 404, '유산소 기록을 찾을 수 없습니다')` ("cardio record not found") (the #172 way).
  - The pace `pace_sec_per_km` (sec/km, 1 decimal) and the speed `speed_kmh` (km/h, 2 decimals) are not stored and are computed in SQL when read. If there is no distance, both are `null` (decision B).
- Added 2 messages to `appErrors` in `backend/src/routes/shared.ts`.
  - Duplicate external ID (`23505`, `cardio_sessions_source_external_id_key`): 409 "같은 출처와 외부 ID의 유산소 기록이 이미 있습니다" ("a cardio record with the same source and external ID already exists")
  - Link to a missing journal (`23503`, `cardio_sessions_workout_id_fkey`): 400 "연결할 근력 일지가 존재하지 않습니다" ("the strength journal to link does not exist")

## Change — feat: backup v2 and cardio CSV

- `backend/src/backup.ts`
  - Raised the backup format version to 2 and added `data.cardio_sessions`. A v2 file must have this list (it may be empty). A v1 file is restored as it is, as a backup without cardio. The unsupported version message is "지원 버전: v1, v2" ("supported versions: v1, v2").
  - Widened the validation before restore: cardio value ranges (the same rules as the API, excluding the after-today check), duplicate ids, links to journals that are not in the backup, and duplicate same source and external ID.
  - Add only (`merge`): if there is an external ID, compare with an existing row by source + external ID. If the content is the same, skip it. If it differs, keep the existing value and report a conflict. If there is no external ID, skip one existing row of the same content at a time, like journals. The journal link is not used for comparison, and a restored record is linked to the restored journal (or to the existing journal that was skipped because the content was the same). For this, `Seen` was changed to return the id of the existing row it absorbed.
  - Replace all (`replace`): cardio records are deleted too and the deleted count is counted. It was also added to the lock list and the summary table (`tables.cardio_sessions`). Restoring after validation and the all-or-nothing behavior of one transaction are unchanged.
  - `GET /api/export/cardio.csv` (new endpoint): the strength CSV is left as it is and cardio is exported separately. It uses the same `toCsv`, so the BOM, quoting, and formula injection protection (a `'` before `=`, `+`, `-`, `@`, tab, and CR) are the same.
- `frontend/src/backup.tsx`: added a "유산소" ("cardio") line to the restore summary. If the summary has no such table (an older server), the line is skipped.
- `docs/api.md` (6 endpoint lines, field rules, error table), `database/README.md` (migration, cardio CSV, backup v2 format and restore rules), `backend/src/openapi.ts` (6 operations, `cardioQuery`), then `docs/openapi.json` was regenerated with `npm run openapi` (27 paths).

## Values set beyond the decisions

| Item                             | Value                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Duration `duration_sec`          | Integer seconds from 1 to 86400 (24 hours)                                                         |
| Distance `distance_km`           | Above 0 and up to 1000, to the third decimal place (more than that is 400, not rounded)            |
| Heart rate `avg_/max_heart_rate` | Integer 30 to 250 bpm, and if both exist, max >= average                                           |
| `calories_kcal`                  | Integer 0 to 20000                                                                                 |
| `elevation_gain_m`               | Integer 0 to 10000 m                                                                               |
| `avg_cadence`                    | Integer 1 to 300 (steps per minute or rotations per minute)                                        |
| `external_id`                    | 1 to 200 characters after trimming whitespace. A `file` source can be saved without an external ID |
| `memo`                           | 2000 characters or fewer (the same as the machine memo)                                            |
| List order                       | Date, then start time (last if missing), then id, all most recent first                            |
| Optional values omitted in PUT   | `null` (memo `""`, source `manual`), a full replace like body records                              |

## Tests

- Added: 12 tests in `backend/test/cardio.test.ts` (no DB). Schema validation (0, negative, decimal, and over-24-hour duration, a future date based on the injected today, 9 kinds and 4 sources, heart rate range and max >= average, distance decimal places, start time format, no external ID for `manual`) and fake pool route checks (validation failures and wrong IDs get 400 before any query, create, kind filter, read, delete, 404, 409 and 400 messages, `BEGIN`, `SELECT FOR UPDATE`, `UPDATE`, `COMMIT` of the update transaction and `ROLLBACK` on 404 or error, releasing the connection).
- Added: 4 tests in `backend/test/cardio.integration.test.ts` (PostgreSQL, a separate schema per test). Create, computed values, period and kind filters, read, delete, duplicate external ID 409 and allowing duplicates across different sources and `manual`, direct checks of the DB CHECK and unique index, rollback on full replace and 409, 400 for a journal link, and `workout_id` becoming NULL when a journal is deleted.
- Changed: `backend/test/backup.test.ts` (v2 format, v1 compatibility, missing v2 list, 2 added for cardio references, duplicates, and value validation), `backend/test/backup.integration.test.ts` (2 cardio records in the seed, checks of round trip, skipping on re-restore, and journal links, table list, 3 added: v1 restore, keeping on same external ID conflict and replace all, cardio CSV), `frontend/src/backup.test.tsx` (the "유산소" ("cardio") line of the summary, the version message example).
- `cd backend && ../node_modules/.bin/tsx --test test/cardio.test.ts test/api-contract.test.ts test/openapi.test.ts test/backup.test.ts test/http-errors.test.ts test/contract.test.ts test/period-api.test.ts test/migrations.test.ts test/zod4-syntax.test.ts`: 54 pass, 0 fail
- `cd frontend && ../node_modules/.bin/vitest run src/backup.test.tsx`: 6 pass
- `npm run contract:sync`, `npm run contract:check`, `npm run openapi`, `npm run typecheck -w backend`, `npm run typecheck -w frontend`, eslint and prettier of changed files: pass
- `cd backend && ../node_modules/.bin/tsx --test test/cardio.integration.test.ts test/backup.integration.test.ts`: 17 fail. All are `ECONNREFUSED 127.0.0.1:5432`. This PC has `TEST_DATABASE_URL` but no PostgreSQL running, so the DB integration tests could not be run locally. They are checked by CI `verify`, which has a PostgreSQL service.
- The full local `npm test`, `npm run check`, and e2e were not run because there is a history of running out of memory.

## Limits and remaining work

- The screens (list, input, analysis) are #115, and importing external records is #118. Laps are decided after the #118 research.
- A cardio record has no `version` (optimistic locking) or retry key like a journal. If the same record is edited on two devices, the later save wins.
- It is not checked whether the journal to link is on the same date (only that it exists).
- If a cardio record linked to a strength journal is saved during a restore (which locks everything), the lock order can cross, and PostgreSQL can detect a deadlock and fail one side. Either the restore is cancelled entirely or the save ends with 500, and the data is not corrupted.
- An update (`PUT`) is a full replace, so omitted optional items become defaults. If `source` is missing it becomes `manual`, and if `external_id` is missing it becomes `null`. When editing an imported record on the screen (#115), `source` and `external_id` must be sent again as they are so the duplicate-detection key remains.
- Migration number 015 is the next number at the time this branch was made. If another PR uses 015 first before merging, the number must be changed (`readMigrations` prevents duplicate numbers).
- This PR left the implementation to a sub-agent, and the main agent read the diff and re-ran the target tests (`cardio`, `api-contract`, `openapi`, `backup`, `http-errors`, `contract`, `migrations`: 44 pass), `contract:check`, prettier, eslint, and `test:docs` to check it.

## Change — fix: first review follow-up

- (Required) `isolated()` in `backend/test/cardio.integration.test.ts` started the server first, waited for 15 migrations, and only then waited for the `listening` event. That event had already passed, so the Promise never finished, and CI `verify` would have hung until the time limit (this did not show on this PC because the DB is off and it fails at the first query). Changed it to start the server after the migrations and wait for `listening` and `error` right away. This is the same way as the other integration tests.
- (Optional) If a v1 backup file had a `cardio_sessions` key, it was validated even though the value is discarded, so a wrong value made the v1 restore fail with 400. For v1 this key is removed before validation. Added a check to `backup.test.ts` that a v1 file holding a wrong cardio list is also restored.
- (Optional) Wrote in the replace-all explanation of `database/README.md` that "replacing all with a v1 backup, which has no cardio, also deletes the cardio records that exist now".
- `tsx --test test/backup.test.ts test/cardio.test.ts`: 23 pass. `npm run typecheck -w backend`, eslint, and prettier pass. The DB integration tests are still run for the first time in CI.

## Merge main

- After #242 (#222 page header) was merged, `origin/main` was merged (`ba79e40`). There were no conflicts and the changed files are still this PR's 20. CI for this merge commit all passed.
- Then #245 (#198 touch check, changes only `e2e/` and `docs/`) came in. There are no overlapping files, but it changes `e2e/**`, so it did not meet the condition to merge right away and was merged again. There were no conflicts. After the merge, `tsc -p e2e/tsconfig.json` passes and `tsx --test test/cardio.test.ts test/backup.test.ts test/api-contract.test.ts test/openapi.test.ts` passes
- Accident during the work: `git worktree remove` was run on the temporary worktree used for the #242 merge while this worktree's `node_modules` was linked into it with a junction. Because of this, the `backend/` and `frontend/` working files and the `node_modules` of this worktree were deleted. The index and commits were intact, so the tracked files were restored with `git restore -- backend frontend` and the dependencies were reinstalled with `npm ci`. It does not affect the commit content of this PR.
