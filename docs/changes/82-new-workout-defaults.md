# #82 Auto-fill defaults for a new journal (today's date, title, and the sets of the active routine)

- Issue: [#82](https://github.com/sirloinbh/workout-memo/issues/82)
- Branch: `feat/82-new-workout-defaults` (started from main `cc6f510`)

## Decisions — 2026-10-21

The "needs confirmation" items in the issue were decided by the user's answers ([issue comment](https://github.com/sirloinbh/workout-memo/issues/82#issuecomment-6306001768)).

- The title format is `10월 20일(화)` (October 20 (Tue)). It uses only the date and does not add the routine split name.
- Even when the anchor date has been moved to another day, the date of a new journal is today in Asia/Seoul.
- Saving a machine per exercise in the routine plan is included in this scope.

## Change

- New journal ("운동 기록하기" (record a workout))
  - Date: today in Asia/Seoul. It does not use the screen's anchor date (`anchor`).
  - Title: the `10월 15일(목)` (October 15 (Thu)) format made by `dateTitle` (`frontend/src/date.ts`).
  - Sets: if the active routine has a target for today, it fills in the exercise name, machine, total weight in kg, and reps. If there is no routine or it is a rest day, it starts with 3 empty sets as before.
  - The date, title, and sets can all be edited in the input fields.
  - If there is a draft to recover, it does not open a new journal (the existing #34 behavior). So the draft takes priority.
- Machine per exercise in the routine plan
  - I added the optional field `machine_id` (a positive integer or null) to `routineSchema` (`backend/src/domain.ts`). The plan is stored as jsonb, so no DB migration is needed. Existing plans keep working with the field missing.
  - jsonb has no foreign key. So `POST /api/routines` checks that the specified machine exists, and if not, it returns 400 `루틴에 지정한 머신을 찾을 수 없습니다` (the machine specified in the routine cannot be found).
  - Today's target (`today_plan.target.exercises`) returns `machine_id` for both manual and automatic routines. If the plan has no machine, it is `null`.
  - On the routine planning screen, each exercise has a "머신" (machine) picker (default "자유 운동" (free exercise)). For a free exercise, the save request leaves out `machine_id`, so a plan that uses no machine keeps its existing form. The plan view shows `운동명 (브랜드 · 머신)` (exercise name (brand · machine)).
  - A new journal and "오늘 루틴으로 기록하기" (record with today's routine) fill in only machines that are in the machine list the screen loaded. A machine not in the list is left as "자유 운동" (null). The total weight uses the plan value as it is. The existing rule of not adding the machine's default weight automatically (total weight in kg including the default weight) is kept.
- Backup
  - Validation: if a routine points to a machine that is not in the backup, it is rejected with `routines[i]: 백업에 없는 머신 N를 참조합니다` (references machine N, which is not in the backup).
  - Restore: it replaces the `machine_id` of the routine plan with the restored or matched machine id and saves. The duplicate check also uses the replaced plan, so restoring the same backup again skips it.
  - The backup version stays v1. The field is optional, so existing backups still pass validation.
- Documents: the routine plan format description in `docs/api.md`, and regenerating `docs/openapi.json` (`npm run openapi`)

## Tests

- Screen (Vitest, RTL)
  - `frontend/src/new-workout-defaults.test.tsx`
    - Even when the anchor date is moved to 2026-09-01, a new journal is today (2026-10-15) and `10월 15일(목)`. The title can be edited.
    - It fills the sets of today's routine with the exercise name, machine, total weight, and reps. A machine not in the list is left as a free exercise. It checks the `machine_id` and the incomplete state in the save request.
    - On a rest day, it starts with 3 empty sets.
  - `frontend/src/routines.test.tsx`: when a machine is set on an exercise, the POST carries `machine_id`. A free exercise omits the field. The plan view shows the machine name.
  - `frontend/src/workout-draft.test.tsx`: the title is now pre-filled with the date, so I changed the scenario to clear the title before typing.
- Backend unit (node:test)
  - `backend/test/routine-progress.test.ts`: checks that `machine_id` is passed through for manual and automatic targets, and that an id of 0 or less is rejected. I added `machine_id: null` to the existing expected values.
  - `backend/test/backup.test.ts`: validation of the routine's machine reference (reject and allow)
- DB integration (node:test, dedicated test DB)
  - `backend/test/routines.integration.test.ts`: it saves and reads back with an existing machine. A machine that does not exist is 400 and is not saved.
  - `backend/test/backup.integration.test.ts`: even when the machine ids in the target DB differ, the restored routine points to the new machine id. Restoring again skips the routine.
  - `backend/test/routine-progress.integration.test.ts`: I added `machine_id: null` to the expected values of today's target.
- Browser (Playwright): `e2e/new-workout-defaults.spec.ts`
  - It creates a machine and a routine that starts today through the API.
  - After moving the anchor date to 2001-03-15, it opens a new journal. It checks today's date and title, and the exercise name, machine, 150 kg, and 10 reps of 2 sets.
  - There is no API to delete routines or machines, so it creates them with unique names and they remain in the test DB.

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB `workout-memo-agent-test-db`) passes
  - format, lint, contract, and typecheck pass
  - Backend 283 pass, 0 skip (including the DB integration)
  - Frontend 93 pass
  - Workers 162, skills 4, docs 3, and build pass
- `npm run test:e2e` (`E2E_DATABASE_URL`=the same test DB): 5 passed
- The check I first ran with the system Node 22.17.0 passed the backend and frontend tests, but ended with exit 255 in a later step. I did not look into which step failed. I re-ran it with Node 24, the project standard, and confirmed that everything passes.

## Limits and follow-up

- There is no machine delete API, so the only case where a machine a routine points to disappears is a backup replace restore. Even then, the ids are remapped on restore.
- There is no routine edit API, so to add a machine to an existing routine you have to create a new routine.
