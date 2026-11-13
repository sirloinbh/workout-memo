# Workout PostgreSQL

PostgreSQL 17. The single source of truth for the schema is `migrations/NNN_name.sql`, applied in file name order. An empty Docker data volume applies all the files on its first run. Adding a SQL file alone does not apply it to an existing volume.

## Applying migrations (#58)

Run this from the root of the umbrella repo before you run the new API. It uses `DATABASE_URL` from `.env` (host port 15401), and an environment variable that is already set takes priority.

```powershell
npm run db:migrate              # apply only the pending files, in order
npm run db:migrate -- --status  # only list applied and pending files (no DB change)
```

- The applied history is kept in `schema_migrations` (file name, checksum, applied time). A file and its history row are committed in one transaction. If a file in the middle fails, only that file is rolled back and the run stops, and the files applied before it stay recorded. After you fix the cause and run it again, it continues from the file that failed.
- Even if it runs concurrently, an advisory lock applies one at a time.
- In the following cases it fails without applying anything: you changed the content of an applied file (checksum mismatch; line ending and UTF-8 BOM differences are ignored), you deleted an applied file, a new file appeared with a number lower than one already applied, or numbers are duplicated or a name does not match the format. Do not edit an applied file; add a file with a new number.
- The first run on an existing DB with no history applies all the files again from 001 and records them. 001 to 009 are all safe to re-run, so existing logs, sets, and machine values do not change. 009 updates the official reference rows again by the same key.
- Node reads the files directly as UTF-8, so the Korean text corruption that happens with the PowerShell pipe method below does not occur.
- **Write new migrations so they are safe to re-run too** (`IF NOT EXISTS`, `ON CONFLICT`, and so on). On an empty volume, the Docker initialization runs the files first without a history, and afterwards `db:migrate` applies the same files again and records them.
- Recovery on failure: check the file name and the cause in the error message. If it is a data problem, make a backup first (`scripts/backup.ps1`), fix the cause, and run it again. A checksum mismatch is solved by restoring the file to its original content in git.

The per-file psql commands below are the procedure from before `db:migrate` was introduced and do not leave a history. A DB that was already migrated that way is recorded as the baseline once you run `db:migrate` one time.

## Why we do not use a PowerShell pipe (#55)

Windows PowerShell 5.1 does not pass UTF-8 through as it is when it sends text to and from an external program through a pipe. When sending, it converts with `$OutputEncoding` (ASCII by default), and when receiving, with the console code page (CP949 by default on Korean Windows). So if you apply a migration with `Get-Content … | docker compose exec … psql`, the `'기타'` ("Other") in 001 is added as a `'??'` brand, and the Korean reference data in 009 goes in as corrupted duplicate rows. For backups too, if you receive the `pg_dump` output into a variable, `기타` is saved corrupted as `湲고?`.

- For migrations, use `npm run db:migrate` (Node reads it directly as UTF-8). If you must apply only one file, run the file inside the container that compose mounted with `psql -f` (the commands below).
- For backups, `scripts/backup.ps1` dumps to a file inside the container and then takes it out byte for byte with `docker compose cp`. For restores too, copy the file into the container and then run it with `-f`.
- If the pipe method comes back into a PowerShell example in the docs, `npm run test:docs` fails.

To check whether a DB that was migrated with the pipe method in the past still has corrupted rows, use the queries below. They only query and do not delete automatically. If there is a result, make a backup first, check that no machine refers to the corrupted rows, and then clean them up yourself.

```powershell
docker compose exec -T db psql -U workout -d workout -c "SELECT id, name FROM brands WHERE name LIKE '%?%'"
docker compose exec -T db psql -U workout -d workout -c "SELECT id, brand, lineup, model_name FROM official_machine_weights WHERE concat_ws(' ', brand, lineup, model_name, setting, notes) LIKE '%?%'"
```

For an existing volume, apply `002_set_notes.sql`, which adds set notes, before you run the new API.
Existing logs and sets are kept, and existing set notes start as an empty string. It is safe to re-run.
An empty volume and CI apply all the migrations in file name order.

Before you use the routine plan API, also apply `004_routines.sql`. A routine is saved atomically as a JSON document that preserves the order and repeats of body parts and the manual weekly goals. It does not create real logs or achieved goals.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/004_routines.sql
```

Before the routine goals and "Rest today" API (#28), apply `005_routine_progress.sql` after `004_routines.sql`. `routine_rests` stores only the rest dates of each routine, one row each (no duplicate on the same day), and the moved schedule and the "Excluded" goals are calculated from these dates. Existing logs, sets, and routines do not change, and it is safe to re-run. When you delete a routine, its rest records are deleted too.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/005_routine_progress.sql
```

Before you use the exercise analysis API (PR by exercise, estimated 1RM, weekly volume by body part), also apply `007_exercise_body_parts.sql`. It keeps only the exercise-to-body-part mapping that the user assigned. The exercise name is stored as a value normalized by the same rule as goal evaluation (`lower(trim(exercise name))`), and the body part is not guessed from the exercise name. An exercise with no mapping is counted as `미분류` (Unclassified). Existing logs and sets do not change, and it is safe to re-run. PRs and weekly stats are not stored and are calculated on every query. Planned sets that are not completed (`completed=false`) are not counted in PRs, the estimated 1RM, or weekly volume.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/007_exercise_body_parts.sql
```

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/002_set_notes.sql
```

Before you use the body records API, also apply `008_body_measurements.sql`. It is safe to re-run (`CREATE TABLE IF NOT EXISTS`).
`body_measurements` has one row per date (`date`, UNIQUE) and stores `body_weight_kg` and `skeletal_muscle_kg` (kg, greater than 0) and `body_fat_percent` (%, 0 to 100) as `NUMERIC(5,2)`. A value that was not measured is NULL, and a row where all three values are NULL is rejected by a CHECK constraint. The API does not round input with a third or later decimal place and rejects it with 400. A create request for the same date returns 409, and you change it with an update (PUT). It is not linked to workout logs by a foreign key, so deleting a log does not affect body records.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/008_body_measurements.sql
```

The commands above assume the default DB user and name; if you set them separately, replace them with those names.

Before you run the new API that uses official machine reference values, also apply `009_official_machine_weights.sql`. It creates the manufacturer official starting resistance (empty weight) reference table `official_machine_weights` and fills it with the research results, and adds the optional link column `machines.official_weight_id` and the `Newtech` brand (skipped if it already exists). It does not change the base weight of existing machines or the total weight of past sets, and the link of existing machines starts as NULL. Re-running updates the reference rows by the same key and is safe. If you run the new API without this migration, the machine list query fails. For the research criteria and the sources, see [docs/machine-official-weights.md](../docs/machine-official-weights.md). This file contains Korean values, so run the file inside the container that compose mounted directly, not through a pipe. Windows PowerShell 5.1 sends text as ASCII when piping to a native program, which corrupts the Korean (온힘, 뉴텍, and the notes), and corrupted values also break the UNIQUE key match when you re-run.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/009_official_machine_weights.sql
```

Before you run the log draft and safe retry API, also apply `003_workout_retries.sql`.
Existing logs are kept at `version=1`, and the version increases when you edit. The migration is safe to re-run.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/003_workout_retries.sql
```

The UUID `Idempotency-Key` of a log POST/PUT resends the result of the same method, target, and normalized content for 7 days from the first successful commit.
A different request with the same key, or an expired key, returns 409. A failed transaction does not consume the key.
Expired keys are not deleted either, which keeps an old request from being run as a new log. `workout_requests` keeps a SHA-256 fingerprint and the response ID and version instead of the body.
A POST without a key stays compatible with existing clients, but duplicate prevention does not apply to it. The new screen sends a key with every log save.
A PUT requires the positive integer `version` that you fetched, a missing or malformed one is 400, and a stale version is 409. Check the latest version, compare the content, and then edit again.

The draft on the screen is kept as one draft in one localStorage per device and browser, and is cleaned up at the next start 7 days after the last input.
Recovering a draft or only retrying a save does not extend the retention period. The draft is kept until the server returns a success response.
Drafts in several tabs share the same storage location, so enter in one tab. Drafts are not synced between devices, and only server records are used for stats and goals.

Before you run the API that uses the set completion state and the optional RPE, apply `006_set_completion_rpe.sql`.
Existing sets are already-performed records, so they stay `completed=true` and the goal achievement results do not change. RPE is NULL (not entered) or 1 to 10 in 0.5 steps, validated by the server and the DB CHECK, and a missing value is not turned into 0.
A set with `completed=false` is only kept as a plan and is not counted in goal achievement, volume, set counts, or workout days. A set from an existing client that does not send `completed` is saved as completed. It is safe to re-run.

```powershell
docker compose exec -T db psql -U workout -d workout -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/006_set_completion_rpe.sql
```

Before you run the API that uses the log feeling feedback (#83), apply `010_workout_feedback.sql` (`npm run db:migrate`). `workouts.feedback` is NULL (not entered) or `hard`, `medium`, or `easy`, and is also validated by a DB CHECK. Existing logs stay NULL, and it is safe to re-run.

Before you run the API that uses a machine's single-joint flag (#84), apply `011_machine_single_joint.sql`. `machines.single_joint` is `NOT NULL DEFAULT false`, so existing machines start as not single-joint. It is safe to re-run.

Before you run the API that uses the weight step per exercise (#86), apply `012_exercise_weight_steps.sql`. `exercise_weight_steps` is the weight step (greater than 0 and at most 100 kg) for each normalized exercise name (`lower(trim(name))`), and if there is no row the default is 5 kg. It is safe to re-run. Like the body part assignment (`exercise_body_parts`), it is not yet included in the app backup file.

Before you run the API that uses the biceps and triceps body parts (#88), apply `014_biceps_triceps.sql`. It replaces the body part CHECK of `exercise_body_parts` so that it includes biceps and triceps, and still allows the previously saved `팔` (arms). It does not change data and is safe to re-run.

The rest timer is not stored on the server. Only the time setting, whether it starts automatically, and the end time are kept in this browser's localStorage (`workout-memo:rest-timer:v1`), and the remaining time is calculated again from the end time. The default rest by exercise type (lower body, upper body, single-joint, #84) is kept separately in `workout-memo:rest-durations:v1`.

Weight is the total weight in kg (including the machine base weight), and reps is a positive integer. An unconfirmed base weight is kept as NULL. When a log is deleted, its sets are deleted with CASCADE. A goal is met when one completed set of the same exercise name meets both the weight and the reps within the configured period.

Before you run the API that uses cardio records (#114), apply `015_cardio_sessions.sql`. `cardio_sessions` has the date, the start time (`TIME`, Seoul time), 9 kinds, the duration (integer seconds), the distance (`NUMERIC(8,3)` km, in 1 m units), and optional values (heart rate, calories, elevation gain, cadence, perceived effort, memo). Pace and speed are not stored and the API calculates them on query. The same ranges as the API validation are also enforced by CHECK (only the ban on dates after today is checked in the API), `workout_id` refers to `workouts` and becomes `NULL` when the log is deleted (`ON DELETE SET NULL`). `(source, external_id)` is a partial unique index that is unique only when `external_id` exists, and `manual` cannot have an external ID. Laps and GPS routes are not stored. It is safe to re-run.

A backup is done with `scripts/backup.ps1` in the umbrella repo, and a restore with the commands below. Prepare a separate empty database as the restore target.

```powershell
docker compose exec -T db createdb -U workout workout_restore
docker compose cp backups/FILE.sql db:/tmp/restore.sql
docker compose exec -T db psql -U workout -d workout_restore -v ON_ERROR_STOP=1 -f /tmp/restore.sql
docker compose exec -T db rm -f /tmp/restore.sql
```

## App export and backup (#33)

There is no DB schema change (no additional migration). The SQL dump of `scripts/backup.ps1` is for restoring the whole DB, and its role differs from the two files below. Actual backup files are personal records, so do not commit them to the repo or attach them to logs or PRs (`backups/` is git-ignored).

**CSV for analysis** `GET /api/export/workouts.csv[?from=YYYY-MM-DD&to=YYYY-MM-DD]`

- UTF-8 (with BOM, so spreadsheets recognize Korean), RFC 4180, CRLF line endings. One row per set, and a log with no sets is one row with empty set columns. Sorted by date, log id, and set order.
- Columns: `workout_id, date, title, workout_notes, set_number, exercise, weight_kg, reps, volume_kg, set_notes, machine_id, brand, machine_name, machine_base_weight_kg, workout_feedback`. `workout_feedback` (#83) is added last so that the existing column positions do not change, and it repeats the log's feeling feedback (`hard`, `medium`, `easy`) on every set row. Not entered is an empty cell.
- `date` is `YYYY-MM-DD`. `weight_kg` is the total weight in kg including the machine base weight, and `volume_kg = weight_kg × reps`. Numbers use `.` as the decimal point and have no thousands separator.
- NULL is an empty cell: `machine_id`, `brand`, and `machine_name` of a set with no machine, and `machine_base_weight_kg` that could not be confirmed. Text columns are not NULL, so an empty cell is an empty string. A machine is linked by `machine_id` and by the brand and name.
- A value that contains a comma, a double quote, or a line break is wrapped in double quotes, and an inner `"` is written as `""`.
- Formula execution prevention: if a text value starts with `=`, `+`, `-`, `@`, a tab, or CR, a `'` is put in front of it. So the CSV can differ from the original and **cannot be used for restore.**

**CSV for cardio analysis** (#114) `GET /api/export/cardio.csv[?from=YYYY-MM-DD&to=YYYY-MM-DD]` → `workout-memo-cardio-YYYY-MM-DD.csv`

- It is exported separately and leaves the strength CSV above as it is. The rules for encoding, quoting, and formula execution prevention are the same. One row per record, ordered by date, start time (earlier first if missing), and id.
- Columns: `cardio_id, date, start_time, kind, duration_sec, distance_km, pace_sec_per_km, speed_kmh, avg_heart_rate, max_heart_rate, calories_kcal, elevation_gain_m, avg_cadence, effort, workout_id, source, external_id, memo`. `pace_sec_per_km` and `speed_kmh` are calculated values and are empty if there is no distance. All NULLs are empty cells.

**Backup for restore** `GET /api/backup` → `workout-memo-backup-YYYY-MM-DD.json`

```json
{
  "format": "workout-memo-backup",
  "version": 2,
  "exported_at": "ISO 8601",
  "data": {
    "brands": [{ "id": 1, "name": "..." }],
    "machines": [
      {
        "id": 1,
        "brand_id": 1,
        "name": "...",
        "base_weight": null,
        "notes": "",
        "single_joint": false
      }
    ],
    "workouts": [
      {
        "id": 1,
        "date": "YYYY-MM-DD",
        "title": "...",
        "notes": "",
        "feedback": null,
        "created_at": "ISO 8601",
        "sets": [{ "exercise": "...", "machine_id": 1, "weight": 100.25, "reps": 10, "notes": "" }]
      }
    ],
    "goals": [
      {
        "id": 1,
        "exercise": "...",
        "target_weight": 100,
        "target_reps": 5,
        "start_date": "YYYY-MM-DD",
        "deadline": "YYYY-MM-DD"
      }
    ],
    "routines": [
      { "id": 1, "created_at": "ISO 8601", "plan": { "...": "same as the routine API contract" } }
    ],
    "cardio_sessions": [
      {
        "id": 1,
        "date": "YYYY-MM-DD",
        "start_time": "07:30",
        "kind": "running",
        "duration_sec": 1800,
        "distance_km": 5.25,
        "avg_heart_rate": null,
        "max_heart_rate": null,
        "calories_kcal": null,
        "elevation_gain_m": null,
        "avg_cadence": null,
        "effort": null,
        "source": "garmin",
        "external_id": "...",
        "memo": "",
        "workout_id": 1,
        "created_at": "ISO 8601"
      }
    ],
    "cardio_goals": [
      {
        "id": 1,
        "goal_type": "distance",
        "kind": "running",
        "period": "week",
        "target_distance_km": 15,
        "target_duration_sec": null,
        "target_count": null,
        "start_date": "YYYY-MM-DD",
        "deadline": "YYYY-MM-DD"
      }
    ]
  }
}
```

- It is read in one REPEATABLE READ snapshot. An `id` is only a reference key inside the file, and new ids are issued when you restore. Sets are inside the log in order and are linked by `machine_id` → `machines.id` → `brand_id` → `brands.id`. Weight is a total weight in kg as a number, and an unconfirmed base weight is `null`. A log's `feedback` (#83) is `hard`, `medium`, `easy`, or `null`. An older backup without this field is also restored as v1 as it is and becomes `null`. `feedback` is not used to decide whether a log is a duplicate, so the same log that differs only in feedback is skipped (the existing value is kept). An older backup without a machine's `single_joint` (#84) is restored as `false`. When linking to a machine that already exists, the existing machine's value is kept.
- v2 (#114) added `cardio_sessions`. The field rules are the same as the cardio API (except the check for dates after today), and `workout_id` points at `workouts.id` in the same file. A v2 or v3 file must have this list (it may be empty), and a v1 file made before that is restored as it is as a backup with no cardio records.
- v3 (#253) added `cardio_goals` (cardio goals). The field rules are the same as `POST /api/cardio-goals` (a target value per kind, goal period of 5 years or less). Like strength goals, it does not include `created_at`, so the registered time of a restored goal is the time of the restore (not used on screen or for sorting). A v3 file must have this list (it may be empty), and v1 and v2 files are restored as they are as backups with no cardio goals. **A v3 file cannot be restored if you roll back and deploy an earlier version of the app that does not know v3** (400 for an unsupported version). If you need to restore after rolling back, export the backup again from that version before rolling back (user decision of 2026-11-08).
- `workout_requests` (save retry keys) is not included. It is a temporary per-device duplicate prevention record and the response ids are valid only in the original DB. An add-only restore does not touch this table. A full replace also empties this table in the same transaction (to keep an old key from resending the id of a deleted log so that it looks saved). A later retry with the same key is saved as a new log. Credentials, environment variables, and Terraform state are not put in any file.

**Restore** `POST /api/backup/preview`, `POST /api/backup/restore` — body `{ "mode": "merge" | "replace", "backup": {...}, "confirm"?: "전체 교체" }` (the `confirm` value is the Korean string `전체 교체`, "full replace", and the API matches it exactly)

- The request body is at most 10MB (+64KB). It checks the format `format` → `version` (v1, v2, and v3 supported) → schema (dates, total weight, reps, text length, goal period, routine rules, cardio value ranges, cardio goal rules) → references (the log that a brand, machine, or cardio record links to exists, duplicate ids, duplicate brand names and machine names per brand, duplicate source and external ID of cardio), and if it fails it returns 400 and changes nothing.
- `merge` (default, add only): it does not edit or delete existing rows. A brand is linked to an existing row by name, and a machine by brand + name. If a machine's base weight or notes differ, it **keeps the existing value**, reports a conflict, and links the restored sets to the existing machine. For logs (including set content and order), goals, and routines, it skips an item if an existing row with identical content exists. One identical row absorbs only one incoming row, so restoring the same backup again does not increase the count, and identical logs that were originally 2 are restored as 2.
- Cardio records (#114): if there is an external ID, it compares with the existing row by source + external ID, skips it if the content is the same, and if it differs it **keeps the existing value** and reports a conflict. If there is no external ID, it skips one existing row with the same content at a time, like logs. The log link (`workout_id`) is not used in the comparison, and a restored record is linked to the restored log (or the existing log that was skipped for having the same content).
- `replace` (full replace): it deletes all brands, machines, logs, sets, goals, routines, cardio records, cardio goals, and the save retry keys (`workout_requests`), and then fills them from the backup content. If `confirm` is not exactly `전체 교체` it returns 400 and deletes nothing. If you do a full replace with a v1 backup that has no cardio, the cardio records that exist now are also all erased (the preview shows it in the delete count).
- Cardio goals (#253): in add-only mode it skips a goal if one with all the same values already exists and otherwise adds it. A full replace deletes and replaces them with the file content like strength goals, so a full replace with a v1 or v2 file that has no goal list leaves 0 cardio goals (the delete count appears in the preview summary).
- preview runs the same procedure in one transaction and does ROLLBACK, and returns the numbers added, skipped, in conflict, and deleted. restore COMMITs the same procedure. While it runs, a write lock (`LOCK ... IN EXCLUSIVE MODE`) makes concurrent saves wait, and an error in the middle returns 500 after a ROLLBACK of everything.
- A restored log is a new record with `version=1` and `created_at` is preserved. The preview ROLLBACK can leave gaps in the id sequence (harmless).
