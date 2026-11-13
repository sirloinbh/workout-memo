# #83 Journal feeling feedback (hard, medium, easy)

- Issue: [#83](https://github.com/sirloinbh/workout-memo/issues/83)
- Branch: `feat/83-workout-feedback` (started from main `cc6f510`, independent of the #82 PR)

## Decisions — 2026-10-21

The "needs confirmation" items in the issue were decided by the user's answers ([issue comment](https://github.com/sirloinbh/workout-memo/issues/83#issuecomment-6306323774)).

- Feedback is left once per journal (one workout), not per set.
- The RPE input is replaced by the feedback. The RPE input is removed from the screen, and the already saved RPE data and the API field are kept.
- It is reflected in the automatic double progression. Even in a session where the target was achieved, if a journal containing that exercise within the session period is marked 'hard', the next session keeps the same target. Medium, easy, and not entered progress one step as before.

## Change

- DB: `010_workout_feedback.sql`
  - Added `workouts.feedback text`. The value is NULL or `hard|medium|easy`, validated by `workouts_feedback_check`.
  - It uses `ADD COLUMN IF NOT EXISTS`, so it is safe to re-run. Existing journals stay NULL.
- Shared contract `shared/contract.ts`
  - Added `feedbackLevels` and `workoutSchema.feedback` (nullable, default null). The error message is `체감 피드백은 힘듦·중간·쉬움 중에서 선택하세요` (choose the feeling feedback from hard, medium, or easy).
  - I updated the copies with `npm run contract:sync`.
- Journal API `POST/PUT /api/workouts`
  - It saves and edits `feedback`. It is also included in reads (`w.*`).
  - A PUT from an existing client that does not send feedback saves NULL. This is the same as the contract default.
  - Retry key fingerprint: if `feedback` is null, it uses the same fingerprint as before #83. So a resend of a retry key saved before the deployment (7 days) does not turn into "요청 내용이 다릅니다" (the request content differs) (409).
- Automatic double progression (`backend/src/progress.ts`, `routes/routines.ts`)
  - `WorkoutRecord` carries the journal's `feedback`.
  - If any record of that exercise within the session period is `hard`, it holds (`hold`) instead of moving to the next step, even if the target was achieved. The judgment result (`result`) stays `achieved`.
- Backup and CSV
  - The journals in a backup include `feedback`. An existing v1 backup without this field is validated and restored as null.
  - I did not put `feedback` in the journal duplicate check, so the same journal that differs only in feedback is not created as a duplicate.
  - I added a `workout_feedback` column at the end of the CSV. The positions of the existing columns are unchanged.
- Screen `frontend/src/app.tsx`
  - The journal edit has a 3-level button group "체감 피드백 (선택)" (feeling feedback (optional)). It reuses the `.tabs` style and uses `aria-pressed`.
  - Pressing the selected level again returns to not entered (null).
  - I removed the per-set RPE input and its notice text. The record list shows it like `체감 힘듦` (felt hard). The existing RPE display is kept.
  - The draft validation rejects a bad feedback value.
- Documents: `docs/api.md`, `database/README.md` (migration, CSV column, and backup format), and regenerating `docs/openapi.json`

## Tests

- `backend/test/workout-feedback.test.ts` (new)
  - Contract: not entered is null. Only the three values are allowed, and bad values are rejected.
  - API: a bad value returns 400 before writing.
  - DB integration: save → change → a PUT without feedback gives null
- `backend/test/routine-progression.test.ts`
  - If achieved but `hard`, it holds, and with `medium`, `easy`, or null it progresses.
  - A `hard` outside the session period has no effect.
- `backend/test/routine-progression.integration.test.ts`: when a journal in the real DB is changed to `hard`, the target of the later session is expected one step lower. It checks that the route query reads `w.feedback`.
- `backend/test/migrations.integration.test.ts`: existing journals are NULL, and a bad value is rejected by the DB CHECK.
- `backend/test/backup.test.ts`, `backup.integration.test.ts`
  - A backup without feedback is validated as null, and a bad value is rejected.
  - `feedback` is preserved in the export → restore round trip.
  - It checks the CSV `workout_feedback` column.
- `frontend/src/set-completion.test.tsx`: I changed the existing RPE input scenario to feedback.
  - When the draft is recovered, the selected feedback is kept.
  - Pressing again returns to null, and there is no RPE input field.
  - Even when editing a journal that has an existing RPE, the RPE is kept. The list shows the feedback.

## Verification — 2026-10-21

- `npm run check` (Node 24.21.0, `TEST_DATABASE_URL`=the local dedicated test DB) passes
  - Backend 284 pass, 0 skip (including the DB integration)
  - Frontend 90 pass
  - Workers 162, skills 4, docs 3, and build pass
  - The first run failed in typecheck because of a type assertion error (TS2352) in the new test file. After the fix, I ran it again and it passed.
- `npm run test:e2e` (`E2E_DATABASE_URL`=the same test DB): 4 passed. I did not add e2e for this change. I confirmed that the existing journal CRUD flow still works with no feedback entered.

## Limits and follow-up

- An existing problem (outside this scope): the sets in a backup do not include `completed` and `rpe`. So after a restore, incomplete (planned) sets are saved as complete and the RPE is lost. It is better to fix this in a separate issue.
- I did not apply the migration to the local personal DB (55432). After the merge, apply it with `npm run db:migrate`. In production, the deploy script migrates automatically.
