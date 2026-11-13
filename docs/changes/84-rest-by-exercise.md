# #84 Default rest time by exercise type (lower body 2:30, upper body 2:00, single-joint 1:30)

- Issue: [#84](https://github.com/sirloinbh/workout-memo/issues/84)
- Branch: `feat/84-rest-by-exercise`
  - It started on top of `feat/83-workout-feedback`. Both issues add a migration, so this keeps the number (010 and 011) order.
  - The #83 PR must be merged first, and until then the diff of this PR also shows the #83 commits.

## Decisions — 2026-10-21

- Whether an exercise is single-joint is a machine property. The user sets it in the machine library.
- The priority is single-joint > lower body > upper body. For example, a leg extension is 1 minute 30 seconds.
- The default time per category is stored in the browser (localStorage). It is set separately for each device.

## Change

- DB `011_machine_single_joint.sql`: `machines.single_joint boolean NOT NULL DEFAULT false`. It is safe to re-run.
- Contract and API
  - Added `machineSchema.single_joint` (an optional boolean).
  - On create, leaving it out gives `false`, and on edit, leaving it out keeps the existing value (`COALESCE`). So an older client does not clear the value.
  - `GET /api/machines` returns it too, through `m.*`.
- Backup: the machine's `single_joint` is exported and restored. An older backup without the field is restored as `false`.
- Timer (`frontend/src/rest-timer.ts`)
  - `restKind(singleJoint, parts)`: decides in the order single-joint machine → lower body (lower body front and back) → upper body (chest, back, shoulders, arms). With only abs or no body part set, it is `null`.
  - The category is decided only by values the user set (the machine flag and the body part setting of #32), and it does not guess from the exercise name.
  - `parseRestDurations`: the default is `{ lower: 150, upper: 120, single: 90 }`. Stored values are validated per item, and only a bad item goes back to the default.
  - `startTimer(t, now, seconds?)`: uses a different length only for this rest. It does not change the configured default rest time.
- Screen (`frontend/src/app.tsx`)
  - When a set is completed with auto-start, the rest time is decided from the body part setting of that set's machine and exercise name (normalized key). With no category, it uses the existing "휴식 시간(초)" (rest time (seconds)). The manual "휴식 시작" (start rest) also uses the existing value.
  - I added "운동별 기본 휴식(초)" (default rest by exercise (seconds)) inputs (lower body, upper body, single-joint) to the rest timer. Only 5 to 3600 seconds are saved, and a bad value is ignored.
  - The body part setting (`/api/exercise-body-parts`) is an optional query. If it fails, the default rest is used, and it is loaded again when you move to another page.
  - I added a "단관절 운동 머신" (single-joint exercise machine) checkbox to machine create and edit, and the list shows `단관절` (single-joint).
- Documents: `docs/api.md`, `database/README.md`, `docs/openapi.json`

## Tests

- `backend/test/rest-by-exercise.test.ts` (new)
  - The default table, and the category priority (single-joint > lower body > upper body, abs and unset are null)
  - Per-item validation of stored values, one-time override of the rest time, and the contract boolean validation
  - DB integration: the create default is false, saving true, an edit that leaves it out keeps it, and clearing to false
- `backend/test/backup.test.ts`, `backup.integration.test.ts`: an older backup is false, a bad value is rejected, and export and round trip preservation
- `backend/test/migrations.integration.test.ts`: the machine default is false
- `backend/test/official-weights.test.ts`: I reflected the omitted `single_joint` (null, keep) in the edit SQL parameters.
- `frontend/src/rest-by-exercise.test.tsx` (new)
  - Squat 2:30, bench press 2:00, and leg extension on a single-joint machine 1:30
  - A machine that is not single-joint is decided by body part, and spaces around the exercise name are normalized.
  - Abs uses the configured default (0:45).
  - Changing the per-category value persists after a reload and is applied. A bad value is ignored.
  - It checks saving single-joint in the machine form (the PUT body).

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 291 pass, 0 skip (including the DB integration)
  - Frontend 97 pass
  - Workers 162, skills 4, docs 3, and build pass
  - In the first run, `official-weights.test.ts` failed because of the trailing `null` (the new `single_joint`) in the PUT parameter array. I fixed the expected value, ran it again, and it passed.
- `npm run test:e2e` (the same test DB): 4 passed. I did not add e2e for this change.

## Limits and follow-up

- The setting is per browser, so it is not shared between devices.
- A free exercise with no machine cannot be set as single-joint. Only the body part setting (lower body, upper body) applies.
