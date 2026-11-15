# REST API contract

The request and response rules of the Workout Memo API (`backend`). The source of truth for input validation of logs, sets, machines, goals, body records, and cardio records is the Zod schemas in [shared/contract.ts](../shared/contract.ts). The server (400 responses) and the screen (per-field errors before saving) use the same schemas and the same Korean messages. The remaining schemas, such as routines, are in [domain.ts](../backend/src/domain.ts). This document sums up their meaning and the endpoint list. `backend/test/api-contract.test.ts` compares the endpoint table below with the Express routes that are really registered, so if you add or delete a route, you must fix this table too for `npm test` to pass.

## Common rules

- The base path is `/api`. The nginx of the web app (8101) forwards `/api` to the API container (3101). There is no login, and it is used on a local address that only the user can reach.
- Request and response bodies are JSON (UTF-8), and the default request size limit is 256KB. Only the backup restore request accepts up to 10MB (+64KB).
- Dates are `YYYY-MM-DD` strings, and only dates that really exist are accepted. "Today" is based on the service time zone `Asia/Seoul`.
- Weight (`weight`, `target_weight`, `base_weight`) is the total weight in kg including the machine base weight. It is 0 or more and 99999 or less, and a base weight that could not be confirmed is `null`. Reps is an integer from 1 to 1000.
- The `:id` in a path is a positive integer made only of digits, not starting with 0 (up to 15 digits). If it is not only digits or starts with 0, such as `1e3`, `%207%20` with spaces around it, or `07`, the response is 400 `{ "error": "<target> ID가 올바르지 않습니다" }` (the message says the ID is not valid; `parseId` in the central `standard/http.ts`, #172).
- Exercise names are judged to be the same exercise by `lower(trim(name))`, which ignores leading and trailing spaces and letter case. Goal achievement and exercise analysis use the same rule.
- A set that is not completed (`completed=false`) is only kept as a plan. It is not counted in goal achievement, volume, or PR calculation.

## Error format

Every error response has the form `{ "error": "<Korean message>" }`.

| Status | Meaning                                                                                                                                                                                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Input validation failure (Zod messages joined with `, `, at most 10), a JSON format error, a bad path ID, a reference to a machine, brand, official reference value, or strength log that does not exist, a backup format error        |
| 404    | The target log, machine, routine, body record, goal, or cardio record does not exist. For an `/api` path that does not exist: `{ "error": "요청한 API를 찾을 수 없습니다" }` (the requested API was not found)                         |
| 409    | A duplicate unique value (the same name or date, the same source and external ID for cardio), a log version conflict, a different body or an expired key for the same retry key, a date or state condition mismatch for a routine rest |
| 413    | The request size limit was exceeded. The backup path gives a message that states the 10MB limit, and the others "요청 본문이 너무 큽니다" (the request body is too large)                                                              |
| 500    | A server error such as a DB connection error. The response is `{ "error": "서버 오류가 발생했습니다" }` (a server error occurred), and the details are left only in the server log (`request_error`)                                   |

Error handling is done by the centrally managed file `backend/src/standard/http.ts` (sirloinbh/project-standards#309), which is the same as in the other apps. The messages that only this app has (reference errors for machines, brands, official reference values, and strength logs, the duplicate cardio external ID, and the 10MB backup limit) are handled first by `appErrors` in `routes/shared.ts` (#172).

## Endpoints

| Method | Path                               | Description                                                                                                         |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                      | DB connection check. `{ "status": "ok" }`                                                                           |
| GET    | `/api/brands`                      | Brand list (by id)                                                                                                  |
| GET    | `/api/official-machine-weights`    | Manufacturer official starting resistance reference values. `?brand=` optional                                      |
| GET    | `/api/machines`                    | Machine list with the linked official reference values (newest first)                                               |
| POST   | `/api/machines`                    | Create a machine → 201                                                                                              |
| PUT    | `/api/machines/:id`                | Update a machine                                                                                                    |
| GET    | `/api/workouts`                    | Logs and sets in the `?from&to` period (latest date first)                                                          |
| POST   | `/api/workouts`                    | Save a log → 201 `{ id, version }`. `Idempotency-Key` optional                                                      |
| PUT    | `/api/workouts/:id`                | Replace a whole log → `{ id, version }`. `version` required                                                         |
| DELETE | `/api/workouts/:id`                | Delete a log and its sets → `{ ok: true }`                                                                          |
| GET    | `/api/goals`                       | Goal list with the server-evaluated `achieved`                                                                      |
| POST   | `/api/goals`                       | Create a goal → 201                                                                                                 |
| DELETE | `/api/goals/:id`                   | Delete a goal → `{ ok }`                                                                                            |
| GET    | `/api/routines`                    | Saved routines with the 84-day schedule (`schedule`)                                                                |
| POST   | `/api/routines`                    | Save a routine → 201 `{ id }`                                                                                       |
| GET    | `/api/routines/:id`                | One routine with its schedule                                                                                       |
| GET    | `/api/routine-progress`            | Today's goal, weekly and 12-week progress, and previous records of the routine in progress. `routine: null` if none |
| POST   | `/api/routines/:id/rests`          | Choose to rest today `{ date }` → 201 (applied) or 200 (already applied)                                            |
| DELETE | `/api/routines/:id/rests/:date`    | Cancel the rest on the same day                                                                                     |
| GET    | `/api/body-measurements`           | Body records in the `?from&to` period (by date)                                                                     |
| POST   | `/api/body-measurements`           | Create a body record → 201. The same date is 409                                                                    |
| PUT    | `/api/body-measurements/:id`       | Replace a whole body record. Omitted values become `null`                                                           |
| DELETE | `/api/body-measurements/:id`       | Delete a body record → `{ ok: true }`                                                                               |
| GET    | `/api/analysis`                    | `?from&to` (up to 371 days) PR by exercise, estimated 1RM, and weekly volume by body part                           |
| GET    | `/api/exercise-body-parts`         | Body part mapping per exercise                                                                                      |
| PUT    | `/api/exercise-body-parts`         | Replace the body part mapping of one exercise. An empty array deletes the mapping                                   |
| GET    | `/api/exercise-names`              | Exercise name autocomplete candidates (#124). Recent, then most used, up to 50                                      |
| GET    | `/api/exercise-weight-steps`       | Weight step per exercise (#86). Only the exercises that were set                                                    |
| PUT    | `/api/exercise-weight-steps`       | Save the weight step of one exercise. `null` goes back to the default 5 kg                                          |
| GET    | `/api/goal-suggestion`             | Next goal suggestion for `?exercise=` (not saved)                                                                   |
| GET    | `/api/cardio-sessions`             | Cardio records in the `?from&to` period (newest first). `kind` optional                                             |
| GET    | `/api/cardio-sessions/records`     | Cardio personal records (all time): longest distance per kind, best running 5km and 10km times                      |
| GET    | `/api/cardio-sessions/:id`         | One cardio record                                                                                                   |
| POST   | `/api/cardio-sessions`             | Create a cardio record → 201. The same source and external ID is 409                                                |
| PUT    | `/api/cardio-sessions/:id`         | Replace a whole cardio record (transaction). Omitted optional values become `null`                                  |
| DELETE | `/api/cardio-sessions/:id`         | Delete a cardio record → `{ ok: true }`                                                                             |
| GET    | `/api/export/cardio.csv`           | CSV for cardio analysis (`?from&to` optional). Cannot be used for restore                                           |
| GET    | `/api/cardio-goals`                | Cardio goal list with the server-evaluated `achieved` and `progress`                                                |
| POST   | `/api/cardio-goals`                | Create a cardio goal → 201                                                                                          |
| DELETE | `/api/cardio-goals/:id`            | Delete a cardio goal → `{ ok: true }`                                                                               |
| GET    | `/api/cardio-goals/:id/suggestion` | Next goal suggestion for that goal (not saved). `suggestion: null` if out of range                                  |
| GET    | `/api/export/workouts.csv`         | CSV for analysis (`?from&to` optional). Cannot be used for restore                                                  |
| GET    | `/api/backup`                      | JSON backup file for restore                                                                                        |
| POST   | `/api/backup/preview`              | Restore preview (the same procedure, then ROLLBACK)                                                                 |
| POST   | `/api/backup/restore`              | Run a restore. `mode: "replace"` requires `confirm: "전체 교체"` (Korean for "full replace")                        |

## Main request bodies

### Log `POST /api/workouts`, `PUT /api/workouts/:id`

```json
{
  "version": 3,
  "date": "2026-10-20",
  "title": "하체",
  "notes": "",
  "feedback": "medium",
  "sets": [
    {
      "exercise": "스쿼트",
      "machine_id": null,
      "weight": 100.25,
      "reps": 5,
      "notes": "",
      "completed": true,
      "rpe": 8.5
    }
  ]
}
```

(In the example, `하체` means "lower body" and `스쿼트` means "squat".)

- `title` and `exercise` are 1 to 120 characters after trimming spaces, and `notes` is 4000 characters or less. A log has 1 to 200 sets, saved in array order.
- If `completed` is omitted it is `true` (compatible with existing clients). `rpe` is `null` or 1 to 10 in 0.5 steps. The screen has not asked for RPE since #83, and a stored value is sent back as it is when you edit.
- `feedback` (#83) is the feeling of the whole log: `hard`, `medium`, `easy`, or `null` (not entered). If omitted it is saved as `null`. For an automatic double progression routine, even in a session where the goal was achieved, it keeps the goal of the next session if a log that contains that exercise within that session's period is `hard`.
- `version` is required only in PUT. If it differs from the fetched value it is 409, and on success it increases by 1.
- If you send an `Idempotency-Key` (UUID) header, the same response is resent for the same request for 7 days from the first successful commit. For the storage format, see [database/README.md](../database/README.md).

### Machine `POST /api/machines`, `PUT /api/machines/:id`

`{ "brand_id": 1, "name": "레그 프레스", "base_weight": null, "notes": "", "official_weight_id": 12 }` (`레그 프레스` is "Leg Press")

- `official_weight_id` is the link to an official reference value. It does not change `base_weight`. If omitted in an update request the existing link is kept, and sending `null` removes the link.
- `single_joint` (#84, boolean) says whether the machine is for a single-joint exercise. If omitted at creation it is `false`, and if omitted in an update the existing value is kept. The rest timer on the screen uses it to pick the single-joint default rest when a set is completed.

### Goal `POST /api/goals`

`{ "exercise": "벤치프레스", "target_weight": 80, "target_reps": 5, "start_date": "2026-10-01", "deadline": "2026-12-31" }` (`벤치프레스` is "Bench Press")

- `deadline` cannot be earlier than `start_date`. `achieved` is `true` when one completed set of the same exercise within the period (dates after today excluded) meets both the weight and the reps.

### Exercise name candidates `GET /api/exercise-names` (#124)

`[{ "name": "스쿼트", "uses": 12, "last_used": "2026-11-09" }, { "name": "레그 프레스 머신", "uses": 0, "last_used": null }]`

- It gathers the exercise names of workout log sets, goals, and routine plans, and machine names. It groups them by the same normalized name as goal evaluation (letter case and leading and trailing spaces ignored) and returns the spelling used most recently as `name`.
- `uses` is the number of logs, goals, and routines that used that name. A log with several sets counts as 1. If there is only a machine name it is 0.
- `last_used` is the latest of the log date, the goal start date, and the routine creation date (Asia/Seoul), and it is `null` if there is only a machine name.
- It returns up to 50, ordered by the latest `last_used`, and by the larger `uses` on a tie. The screen computes the hint about similar names (ignoring even inner spaces) from this list.

### Weight step `PUT /api/exercise-weight-steps`, goal suggestion `GET /api/goal-suggestion` (#86)

`{ "exercise": "벤치프레스", "weight_step": 2.5 }`

- An exercise is identified by the same normalized name as goal evaluation (letter case and leading and trailing spaces ignored). `weight_step` is greater than 0 and at most 100 kg, with up to two decimal places, and `null` clears the setting and goes back to the default 5 kg.
- An automatic double progression routine (including routines that were already saved) raises the total weight by this value when the rep upper limit is passed. An exercise at 0 kg (bodyweight) only adds reps.
- `GET /api/goal-suggestion?exercise=벤치프레스` → `{ exercise, weight_step, custom, base, target_weight }`. `base` is the most recent goal of that exercise (`source: "goal"`), or if there is none, the heaviest completed set of the most recent log (`source: "record"`), and if there is neither it is `null` (`target_weight` is also `null`).

### Body record `POST /api/body-measurements`, `PUT /api/body-measurements/:id`

`{ "date": "2026-10-20", "body_weight_kg": 72.4, "body_fat_percent": null, "skeletal_muscle_kg": 33.1 }`

- At least one of the three values is needed, and only up to two decimal places are accepted. A third or later decimal place is not rounded and is rejected with 400.

### Cardio record `POST /api/cardio-sessions`, `PUT /api/cardio-sessions/:id` (#114)

```json
{
  "date": "2026-11-08",
  "start_time": "07:30",
  "kind": "running",
  "duration_sec": 1800,
  "distance_km": 5.25,
  "avg_heart_rate": 152,
  "max_heart_rate": 171,
  "calories_kcal": 380,
  "elevation_gain_m": 35,
  "avg_cadence": 168,
  "effort": "medium",
  "workout_id": null,
  "source": "manual",
  "external_id": null,
  "memo": ""
}
```

- `date`, `kind`, and `duration_sec` are required. The rest become `null` if omitted (`""` for the memo, `manual` for the source) and are not filled with 0. PUT replaces the whole record, so omitted optional values become `null`.
- `date` is a real date, and if it is after today (`Asia/Seoul`) the response is 400 "유산소 기록 날짜는 오늘 이후로 입력할 수 없습니다" (a cardio record date cannot be after today). Strength logs allow future dates because of planned records, so the two behave differently. This rule needs today's date, so it is not in the OpenAPI schema.
- `start_time` is Seoul time `HH:MM` (00:00 to 23:59).
- `kind`: `running`, `walking`, `outdoor_cycling`, `indoor_cycling`, `rowing`, `stairs`, `elliptical`, `swimming`, `other`.
- `duration_sec` is an integer number of seconds from 1 to 86400 (24 hours). `distance_km` is in km for every kind, greater than 0 and at most 1000, up to the third decimal place (1 m). Swimming is shown in m only on the screen.
- Heart rate `avg_heart_rate` and `max_heart_rate` are integers from 30 to 250 bpm, and if both are present the maximum must be at least the average. `calories_kcal` is 0 to 20000, `elevation_gain_m` (cumulative elevation gain) is 0 to 10000 m, and `avg_cadence` is an integer from 1 to 300 (steps per minute or revolutions per minute). `memo` is 2000 characters or less.
- `effort` (perceived effort) is `hard`, `medium`, `easy`, or `null`, the same as the log feedback (#83).
- `workout_id` is an optional link to a strength log of the same day. If the log does not exist it is 400 "연결할 근력 일지가 존재하지 않습니다" (the strength log to link does not exist), and if the log is deleted only the link becomes `null`.
- `source` is `manual`, `garmin`, `nike`, or `file`, and `external_id` is the original ID of an imported record (1 to 200 characters after trimming spaces). `manual` cannot have an `external_id` (400). If the same `source` and `external_id` already exist it is 409 "같은 출처와 외부 ID의 유산소 기록이 이미 있습니다" (a cardio record with the same source and external ID already exists), and records whose `external_id` is `null` are not treated as duplicates of each other.
- The response is the saved fields plus `id`, `created_at`, `updated_at`, and the calculated values `pace_sec_per_km` (seconds per km, 1 decimal place) and `speed_kmh` (km/h, 2 decimal places). The calculated values are not stored and are calculated with SQL on query, and both are `null` if there is no distance.
- The list `GET /api/cardio-sessions?from&to[&kind]` is ordered by date and start time, newest first. A record that does not exist is 404 "유산소 기록을 찾을 수 없습니다" (cardio record not found), and a bad path ID is 400 "유산소 기록 ID가 올바르지 않습니다" (the cardio record ID is not valid).
- Laps (intervals) and GPS routes are not stored (summary values only).

### Cardio personal records `GET /api/cardio-sessions/records` (#115)

```json
{
  "longest": [
    { "kind": "running", "id": 12, "date": "2026-10-26", "distance_km": 21.1, "duration_sec": 7380 }
  ],
  "best5k": { "id": 9, "date": "2026-11-02", "distance_km": 5.02, "duration_sec": 1470 },
  "best10k": null
}
```

- It searches all stored records regardless of the period. There is no input it accepts, so there is no 400.
- `longest`: the longest single record for each kind that has a distance. The order follows the `kind` list (running first), and kinds with no distance are left out. For the same distance, the earlier date wins.
- `best5k` and `best10k`: among running records whose distance is within ±2% of 5 km or 10 km (4.9 to 5.1 km, 9.8 to 10.2 km, boundaries included), the record with the shortest total time. It does not estimate by scaling the time of a longer record by pace (user decision 4 of 2026-11-08). If there is no such record it is `null`, and for the same time the earlier date wins.
- This path is registered before `/api/cardio-sessions/:id` so that `records` is not read as an ID.

### Cardio goals `GET` and `POST /api/cardio-goals`, `DELETE /api/cardio-goals/:id` (#116)

- They are stored separately from strength goals (`/api/goals`). The evaluation criteria are a user decision of 2026-11-08 (comment on #116).
- `goal_type` and the target values it needs:

| `goal_type`        | Meaning                                         | `period`                    | Target values                               | `kind`                  |
| ------------------ | ----------------------------------------------- | --------------------------- | ------------------------------------------- | ----------------------- |
| `distance`         | Total distance per period                       | `week` or `month`, required | `target_distance_km`                        | Optional (`null` = all) |
| `duration`         | Total time per period                           | Required                    | `target_duration_sec`                       | Optional                |
| `count`            | Number of records per period                    | Required                    | `target_count`                              | Optional                |
| `record_time`      | One record of at least a distance within a time | `null`                      | `target_distance_km`, `target_duration_sec` | Required                |
| `longest_distance` | The longest distance of one record              | `null`                      | `target_distance_km`                        | Required                |

- Target values that the kind does not use must be `null` (400). Ranges: distance greater than 0 and at most 10000 km with up to the third decimal place, time 1 to 2678400 seconds (31 days), count 1 to 1000. The end date is the same as or after the start date, and the goal period is 5 years (1826 days) or less.
- Evaluation (the server calculates it on every query and does not store it):
  - It counts only cardio records between the start date to the end date and today (Seoul). If `kind` is set, it counts only that kind. A record with no distance is left out only for distance goals.
  - Cumulative per period: it is evaluated per week (Monday to Sunday) and per calendar month. For a period that straddles the start or end date, it counts only the records within the goal period and the target value stays the same. `progress` is `{ kind: "period", current, periods, periods_achieved }`, and each period in `periods` is `{ start, end, value, achieved }` (`start` and `end` are the calendar period, and `value` is km, seconds, or a count). `current` is the period that contains today, and it is `null` before the start and after the end. `achieved` is whether `current` is achieved.
  - Record goals: `record_time` is achieved when the total time of one record with distance >= the target distance is at most the target time (not estimated by pace). `longest_distance` is achieved when the longest single record is at least the target distance. `progress` is `{ kind: "record", best }` (the fastest time in seconds or the longest distance in km, `null` if none).
- A goal that does not exist is 404 "유산소 목표를 찾을 수 없습니다" (cardio goal not found), and a bad path ID is 400.
- Next goal suggestion (#251) `GET /api/cardio-goals/:id/suggestion` → `{ goal_id, suggestion }`. `suggestion` has the same shape as the `POST /api/cardio-goals` body and is not saved. Following a user decision of 2026-11-08, it raises from the target values of that goal (not based on real records): cumulative distance and longest distance +10% (in 0.1 km units, 0.05 km for swimming), cumulative time +10% (in 1 minute units), count +1, and record time -3% (in 5 second units). Even after rounding, the raised value is at least the next unit boundary (61 seconds → 2 minutes), and the record time decreases by at least 5 seconds (102 seconds → 95 seconds). The kind, the exercise kind, the period unit, and the record distance are the same, the start date is today (Seoul), and the end date has the same length as the original goal. If the result is out of the allowed range it is `null`. It is calculated whether or not the goal is achieved, and the screen shows it only for goals that were achieved.

### Routines and backup

The routine plan format follows `routineSchema` in [domain.ts](../backend/src/domain.ts). For manual progression the 12-week changes are required, and for `progression: "auto"` the rep range is required. The schedule is chosen with `schedule_mode` (#88). With `cycle`, `cycle: { train_days, rest_days }` (workout days 1 to 7, rest days 0 to 7) repeats from the start date and `rest_days` (weekdays) must be an empty array. If omitted or `weekday`, as before, the sum of the rest weekdays and the workouts per week is 7. Each exercise can name a machine with the optional field `machine_id` (#82), and a machine that does not exist is 400. Today's goal (`today_plan.target.exercises`) also returns `machine_id` (`null` if none), and a new log fills the sets with this value. The body parts are chest, back, shoulders, biceps, triceps, legs-front, legs-back, and abs (the stored Korean values are `가슴`, `등`, `어깨`, `이두`, `삼두`, `하체-앞`, `하체-뒤`, `복근`), and the previously saved `팔` (arms) is still allowed. The backup file format and the restore rules follow [App export and backup in database/README.md](../database/README.md#app-export-and-backup-33).

## Change procedure

1. Change the shared input schemas in `shared/contract.ts` and copy them to `backend/src/contract.ts` and `frontend/src/contract.ts` with `npm run contract:sync` (do not edit the copies directly; `npm run check` fails on a mismatch). Change other schemas in `domain.ts` (or the feature module), and fix the unit and DB integration tests of that feature too.
2. Put routes in `backend/src/routes/<feature>.ts`. Because of its separate request size limit, the backup route is registered in `backup.ts` before the JSON parser.
3. Update the endpoint table in this document and the matching request rules. If the table differs from the real routes, `api-contract.test.ts` fails.
4. Fix `operations` (request schemas and status codes) in `backend/src/openapi.ts`, regenerate [openapi.json](openapi.json) with `npm run openapi`, and commit it. `openapi.test.ts` fails on an old file.
5. For a change that breaks existing clients (removing a field, changing a meaning), write the effect and the migration method in the issue before you go ahead.

The shared Zod contract for frontend and backend was introduced in #64 as a copy. Because each area is built separately in Docker and in the subtree repositories, there are copies instead of a workspace package.

## OpenAPI

[openapi.json](openapi.json) (OpenAPI 3.1) is generated from the registered routes, the endpoint descriptions of this document, and the server Zod schemas (#68, `npm run openapi`). It contains the request bodies, the query parameters, the path variables, and the field constraints (required, range, length, integer, date format, null allowed, default). Response body schemas and cross-field rules (end date >= start date, RPE in 0.5 steps, routine week rules, and so on) were not moved into JSON Schema, so follow the descriptions in this document.
