# #253 Put cardio goals in backup and restore (backup v3)

- Issue: [#253](https://github.com/sirloinbh/workout-memo/issues/253)
- Branch: `feat/253-backup-cardio-goals`
- Depends on: #116 (cardio goals, `cardio_goals`), #114 (backup v2)
- Design: user decisions B1 and B2 on 2026-11-08 ([#253 comment](https://github.com/sirloinbh/workout-memo/issues/253#issuecomment-6720765474))

## Purpose

The cardio goals made in #116 were not in the backup file, so restoring from a backup file made the cardio goals disappear.

## Change — feat: backup v3

- `backend/src/backup.ts`
  - I raised the format version to 3 and added `data.cardio_goals` (B1). A v3 file must have this list (it may be empty). v1 and v2 files are restored as backups without cardio goals, and a `cardio_goals` mixed into such a file is ignored without being checked (same as the v1 handling in #114).
  - Check before restore: the same rules as `POST /api/cardio-goals` (target values per type, the exercise kind of a record goal, goal period of 5 years or less) and duplicate ids.
  - Add only (merge): if there is a goal with all the same values, it is skipped; otherwise it is added (same as strength goals).
  - Full replace (replace, B2): cardio goals are also deleted and replaced with the contents of the file. If a full replace is done with a v1 or v2 file that has no goal list, there will be 0 cardio goals. The number deleted appears in the preview summary. I also put it in the lock list.
  - I put `cardio_goals` (distance as a JSON number) in the export `GET /api/backup`.
- `shared/contract.ts` → `contract:sync`: so that a backup can add `id`, I split `cardioGoalSchema` into the field rules `cardioGoalObject` and the cross rule `checkCardioGoal` (the same way as the cardio records). The API behavior is the same.
- `frontend/src/backup.tsx`: I added a "유산소 목표" (cardio goals) line to the restore summary and put cardio records and cardio goals in the backup description. If the summary does not have that table (an older server), the line is skipped.
- `database/README.md`: the file example, the v3 description, the supported versions, and the restore rules. I wrote that **a v3 file cannot be restored if the app is rolled back to an older version for deployment**, and what to do about it (the user's request).

## Tests

- `backend/test/backup.test.ts` (no DB)
  - Changed: I put cardio goals in the example backup. The v2 test states `version: 2` explicitly, and the unsupported version test was changed to v4. It checks that both v2 and v3 must have the `cardio_sessions` list.
  - Added 2: the v3 list is required and an empty list is allowed, goals in v1 and v2 are ignored (including a broken list). Cardio goal validation (the kind of a record goal, the period unit, target values of another type, the 5-year limit, duplicate ids).
  - 13 pass
- `backend/test/backup.integration.test.ts` (PostgreSQL)
  - I changed the version check of the exported file to 3 (it stayed at 2 and failed in the first CI). I put 2 cardio goals in the seed, and added them to the normalization, the row counts, the add-only rerun (skipped 2), and the exported key list. The v1 restore test also checks that there are 0 cardio goals.
  - Added 1: the v3 round trip (added 2, values match, the judging API response), and a full replace with a v2 file gives 2 deleted and 0 goals left.
- `frontend/src/backup.test.tsx`: the line "유산소 목표 · 추가 1 · 건너뜀 1" (cardio goals · added 1 · skipped 1) in the restore summary. 6 pass
- `typecheck -w backend`, eslint and prettier (changed files): passed. The integration tests are confirmed in CI because this PC has no PostgreSQL. I did not run the local full `npm run check` and e2e because of low memory.
- Visual baselines: the description text of the backup screen became longer, so 4 backup images may change. I update them after checking the CI images.

## First review

- No required comments. I confirmed the handling per version, the order of lock and delete, the judgment of the same values in add only (the formats of the DB value and the backup value), and that the API and OpenAPI are the same after the contract split.
- Applied (optional): when a v3 file lacked both lists, only the first error was shown. I now collect the missing lists into one message and added a test. I wrote in `database/README.md` that `created_at` of a cardio goal is not put in the backup, like strength goals, so it becomes the restore time.

## Change — test: update visual baselines

- In the CI `e2e-visual` of `05e3e4a`, only 4 backup images failed, and the other 86 passed.
- I checked the 390px and 1280px images. Other than the description of "복원용 백업 (JSON)" (backup for restore (JSON)) becoming one line longer because cardio records and cardio goals were added, they are the same, and nothing overflows. I updated 4 images with the `visual-baselines` artifact.
