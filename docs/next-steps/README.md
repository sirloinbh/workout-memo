# Next steps

Last updated: **2026-11-18 (Asia/Seoul)**. Update the same file on every working day. Before acting, check the real state of GitHub and the worker again.

## Update rules

- Along with the daily summary, the main agent updates the current priorities, the prerequisites, the blocking causes, and the next actions. If progress changes, edit it on the same day too.
- Do not create a new next-steps file for each date. Past states are kept in the [daily log](../daily/README.md) and the Git history.
- Clear finished items from the current to-dos and leave the result, the PR, and the verification in that day's summary. Write PR creation, CI passing, merge, and deploy as separate states.
- Link the detailed procedures to documents in this directory. Editing this document does not by itself put an issue in the queue or run the worker.

## Priority work

| Order | Target                                                                                                                                                         | Current confirmed state                                                                                                                                                           | Next action and prerequisite                                                                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [#260](https://github.com/sirloinbh/workout-memo/issues/260) Rest timer Web Push, production setup                                                             | Merged (#335); the VAPID keys are set on the server and push is enabled                                                                                                           | Check a push on a real phone (with the #110 phone check); turn it on in Settings (#508)                                                                                                                                |
| 2     | [#110](https://github.com/sirloinbh/workout-memo/issues/110), [#111](https://github.com/sirloinbh/workout-memo/issues/111) Android package and Play Store (P4) | Groundwork merged (#342): `assetlinks.json` is served (`[]`) and the TWA build guide is in `docs/mobile-app.md`. Package `kr.sirloinbh.workoutmemo`, Play App Signing, PWABuilder | The user builds with PWABuilder and keeps the keystore; then a PR adds the fingerprint to `assetlinks.json`. Open risk: if production is IP-limited, Google cannot fetch the file (fix in `shared-aws-infrastructure`) |
| 3     | [#120](https://github.com/sirloinbh/workout-memo/issues/120) Nike Run Club import (P4, needs-user)                                                             | Not started                                                                                                                                                                       | Needs the user's Nike data export and its file format                                                                                                                                                                  |

## User steps

- #260 Web Push: the VAPID keys are set. On each device, turn on rest notifications in Settings and check a push on a real phone (together with the #110 phone check).
- [#110](https://github.com/sirloinbh/workout-memo/issues/110), [#111](https://github.com/sirloinbh/workout-memo/issues/111): build with PWABuilder following `docs/mobile-app.md`, keep the keystore offline, send the SHA-256 fingerprint, and create the Play developer account.
- [#120](https://github.com/sirloinbh/workout-memo/issues/120) Nike Run Club: request your own data in the Nike account settings and say what file format arrived.
- Server report (#343): `deploy/report.sh` now fails a day when the API logged any error in the last 24 hours. If that is too strict, set `REPORT_ERROR_LIMIT` in the server `.env`.
- Check the production deploys of 2026-11-16 to 2026-11-18 (#305, #306, #310, #311, #313, #314, #319, #321, #322, #324, #325, #332, #335, #336, #327, #342, #343, #347, #349) once on the server or in the browser at `https://workout-memo.daysofme.com`: the agents had no server access, so only main CI was confirmed.
- Check once on a real phone at the HTTPS address: PWA install and the new-version notice (#109), the touch device change (#104), the log edit screen (#105 set cards, bottom sheet, rest timer), exercise analysis (#125), and exercise name autocomplete (#124). So far they were checked only with touch emulation or a localhost build.
- Sub-repo sync: until [project-standards#653](https://github.com/sirloinbh/project-standards/issues/653) is fixed, `scripts/push-repositories.ps1` is always rejected (non-fast-forward). Sync with snapshot commits as on 2026-11-18 (see that daily log): the agent prepares them and the user pushes, because the hook blocks agents from pushing to `main`.
- The local branch `backup/local-main-2026-11-01` is a backup of the old `main`. Delete it if you judge it is not needed. The history differs, so `git branch --delete` is refused and `-D` approval is needed.
- On this PC, the full `npm run check` and even the separate test suites stop from running out of memory (2026-10-31, 2026-11-01, 2026-11-16, 2026-11-17, 2026-11-18). Free up memory before a local check, or run its parts and leave the suites to CI.
- The items written down on 2026-10-20 were not checked again: the local DB `npm run db:migrate` baseline, and the creation of the production 03:00 snapshot and 03:30 backup.

## Follow-up features and cleanup

- [project-standards#657](https://github.com/sirloinbh/project-standards/issues/657): make the central `knip.json` read the backend tests and e2e dependencies. After the sync, knip should report 0, and `features.knipStrict` can make the step fail.
- Running the whole frontend test suite at once made one long test in `routines.test.tsx` hit the 15-second limit (2026-11-10; it passes when run alone). The full run on 2026-11-16 (65 files, 366 tests) passed without it. There is no issue yet.
- If the live region of the shared `Notice` is drawn from the start, a screen reader may not read it (#223 review). It is a central component, so an issue is needed in `project-standards`. There is no issue yet.
- Add a `NODE_AUTH_TOKEN` note to `docs/deployment.md`. There is no issue yet. A draft that never got into main is on the local branch `chore/145-standards-sync-prep` (closed PR #146), and after adding it, delete this branch. This branch is also not merged by history, so deleting it needs `-D` approval.
- The shared `Button` and others still use a weak focus border (`ring/50`). The app-specific components were changed to `ring-ring` in #101. It is a central component, so an issue is needed in `project-standards`. There is no issue yet.
- Turning one-off decorative colors into tokens has no issue yet (a follow-up of #66).
- A full switch of the log and machine forms to React Hook Form: the draft saving and retry key structure must be separated first (a follow-up of #64).
- Apply the shared contract screen validation to the body record and routine forms (a follow-up of #64).
- OpenAPI response schemas: the response Zod schemas must be defined first (a follow-up of #68).

## Execution boundary

The background of the past #17, #19, and #26 blocks is kept in the [recovery procedure](blocked-issues-recovery.md). The local worker job state is unchanged since the manual handling on 2026-10-19, so compare it with the PR states before resuming the worker. Syncing the sub-repositories and AWS deploys are in a separate request scope, and a PR is merged by the agent after the required CI passes (#128). Sync PRs have a "check before merging" item in the body, so ask the user.
