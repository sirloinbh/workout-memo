# #345 Remove exports that knip reports as unused

- Issue: [#345](https://github.com/sirloinbh/workout-memo/issues/345)
- Branch: `chore/345-knip-unused-exports`

## Changes

No behavior change. Only `export` keywords and one dead function were removed.

- Dropped `export` from names used only inside their own file:
  - `backend/src/analysis.ts`: `unclassified`, `estimateMaxReps`, `mondayOf`
  - `backend/src/backup.ts`: `supportedBackupVersions`, `backupMaxBytes`, `replaceConfirmation`, `csvColumns`, `cardioCsvColumns`
  - `backend/src/openapi.ts`: `operations`. `openapi.test.ts` and `frontend/src/test/contract-api.ts` have their own local variables with that name.
  - `backend/src/progress.ts`: `WeekChange`, `TargetCardio`, `judgeCardio`
  - `backend/src/routes/cardio.ts`: `cardioRecords`, `cardioImportLimit`, `cardioImportRequest`, `cardioImportMaxBytes`
  - `backend/src/routes/push.ts`: `pushUserId`
  - `backend/src/web-push.ts`: `staleAfterMs`, `webPushSender`
  - `backend/src/cardio-goals.ts`: `GoalPeriodResult`
  - `e2e/support/ui-fixtures.ts`: `today`, `now`, `useFixtures`, `settle`. The specs import only `modals`, `openModal`, `openPage`, `pages` and `widths`.
  - `frontend/src/date.ts`: `weekdayNames`
  - `frontend/src/push.ts`: `pushWorkerUrl`, `pushWorkerScope`, `pushSupported`
  - `frontend/src/rest-timer.ts`: `endAlertWindow`
  - `frontend/src/progress-data.ts`: `TargetExercise`. The backend has its own type with that name.
- Deleted `planTargets` from `backend/src/progress.ts`. Nothing called it; `arrangeTargets` replaced it.
- `backend/src/domain.ts`: dropped the re-exports of `BodyMeasurementInput`, `cardioGoalPeriods`, `cardioGoalTypes`, `cardioSources` and `routineCardioSchema`. Every user imports them from `contract.ts` directly. `routineCardioSchema` is still imported for local use.

## Kept on purpose

- `bodyParts`, `deloadWeight` and `progressionStep` are used by backend tests (`backend/test/routine-fixture.ts`, `backend/test/routine-progression.test.ts`) and the frontend test `rest-by-exercise.test.tsx`. knip reports them because the central `knip.json` does not read the backend `test/*.test.ts` files as entry files.
- The 2 unlisted dependencies (`@garmin/fitsdk`, `fflate` in `e2e/cardio-import.spec.ts`; both are frontend dependencies) and the 3 configuration hints need a `knip.json` change. `knip.json` is centrally managed, so this goes to a project-standards issue.

## Verification

- `npm run knip`, before: 34 unused exports, 5 unused types. After: 3 unused exports (the test-only ones above), 0 types; the 2 unlisted dependencies and 3 hints are unchanged.
- The local `node_modules` was stale (`msw`, `@garmin/fitsdk`, `fflate`, `@hookform/resolvers` missing), so the frontend typecheck failed before any change. `npm ci --ignore-scripts` fixed it.
- `npm run check` was run in parts, because the full run runs out of memory on this PC: `format:check`, `lint`, `contract:check`, `typecheck`, `test:skills` and `test:docs` passed. The backend tests, frontend tests and `build` results are in the PR.
