# #113 Automatic checks for screen visual regression, responsiveness, and accessibility

- Issue: https://github.com/sirloinbh/workout-memo/issues/113
- Branch: `test/113-ui-regression-checks`

## Purpose

Automatically check whether screens break during the UI component replacement (#99 to #103), the introduction of Preflight (#100), and the mobile layout (#104). This baseline becomes the comparison standard for later screen replacements.

## Change

### Screen checks with fixed data (`e2e/support/ui-fixtures.ts`)

- The screen checks do not use the shared test DB. Other e2e scenarios leave routines and machines (which have no delete API) with unique names, so the screenshots would vary with the DB content.
- `page.route('**/api/**')` answers every API with fixed data. The clock is fixed to `2026-10-15 10:00 KST` (`page.clock.setFixedTime`). Write requests and undefined paths are answered with 404 so they never reach a real server.
- It holds 6 journals, 2 goals, 2 machines, and 5 body records. The routine schedule (`routineSchedule`), today's progress (`routineProgress`), and exercise analysis (`analyze`) are computed with the real server functions, as in the screen tests (#60), so the response format does not drift from the server.
- Targets: 8 pages (`/`, `/journal`, `/goals`, `/analysis`, `/routines`, `/body`, `/machines`, `/backup`) and the 3 main modals (new workout record, add goal, register machine).

### Responsive (`e2e/ui-responsive.spec.ts`)

- At 360, 390, 768, and 1280px, check `scrollWidth - innerWidth <= 0` for all pages and modals (an extension of the #71 check). It also checks that modals are inside the screen.
- Check that fixed and sticky elements (currently the desktop sidebar, later the bottom tab bar #104) do not cover the links, buttons, and inputs of `main`. It fails if `elementFromPoint` at the center of each interactive element is a fixed element. At the top it looks at all fixed elements, and when scrolled to the bottom it looks only at fixed bars at the bottom of the screen. Passing under a sticky header during a middle scroll is normal behavior, so it is not checked.
- The existing `e2e/layout.spec.ts` (#71, real server, 320/390px, menu links) is kept.

### Accessibility (`e2e/ui-a11y.spec.ts`)

- With `@axe-core/playwright`, apply the WCAG 2.1 A/AA rules (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) to all pages and modals at 390 and 1280px.
- At introduction the only violation was **color contrast (color-contrast)**. All the other rules, such as labels, roles, and names, passed.
  - Contrast violations: 551 elements, about 40 foreground and background combinations. Most are faded gray-green secondary text from one-off decorative colors.
  - Fixing colors would change the design tone. That is in the scope of #98 (design baseline, needs user confirmation) and #100 (global CSS cleanup). If colors were changed before the baseline, the comparison standard would be gone too.
  - So only the current combinations are recorded per screen in `e2e/a11y-known-contrast.json` and allowed (11 screens, 121 combinations). New combinations and violations of other rules fail. When a color is fixed, it is removed from the list.

### Visual regression (`e2e/ui-visual.spec.ts`)

- Compare 8 pages (full page) and 3 modals (viewport) at 4 widths with `toHaveScreenshot`. That is 44 images in total. The baselines are in `e2e/__screenshots__/ui-visual.spec.ts/`.
- Font rendering differs with each OS and browser version. So the comparison is made only in the built-in Chromium of the fixed container `mcr.microsoft.com/playwright:v1.63.0-noble` with `E2E_VISUAL=1`. In a local Windows run this file is skipped, and the rest run with the installed Chrome as before.
- Animation and the caret are turned off, and the screenshot is taken after waiting for `networkidle`, `document.fonts.ready`, and the loading text to disappear.
- `playwright.config.ts` changes
  - No platform suffix is added to the baseline path (`snapshotPathTemplate`).
  - Baselines are not written in CI (`updateSnapshots: 'none'`). It fails if a baseline is missing or different.
  - When `E2E_VISUAL` is set, the built-in Chromium is used instead of `channel: 'chrome'`.

### CI (`e2e` in `.github/workflows/ci.yml`)

- The job runs in the fixed Playwright container (`--ipc=host`). This is because the Google Chrome of the existing ubuntu-latest changes version every time the runner image is updated, which makes screenshots wobble. The PostgreSQL service connects through `postgres:5432` on the container network.
- Artifacts uploaded on failure
  - `playwright-report`: `playwright-report` and `test-results`, including diff images
  - `visual-baselines`: proposed baselines made by re-running only the visual checks with `--update-snapshots=changed`
- The baseline update procedure is written in [workout-testing](../../skills/workout-testing/SKILL.md). CI failure, check the diff, apply the `visual-baselines` artifact to `e2e/__screenshots__/`, check the changed files, and commit.

### npm packages

- User approval of the introduction (2026-10-21): `@axe-core/playwright@4.13.0` (root devDependency, `--save-exact --ignore-scripts`)
- Selection: the newest stable release published before 2026-10-07 (14 days ago) (4.13.0, 2026-08-11). 4.14.0 was excluded because it was published on 2026-10-15. The peer is `playwright-core >= 1.0.0`.
- Added packages: `@axe-core/playwright@4.13.0`, `axe-core@4.13.0`. There is no install script (`hasInstallScript`).
- It is a root devDependency, so it does not affect the `frontend` and `backend` subtree lockfiles or the Docker build.

### Docs

- Wrote the check scope and the baseline update procedure in `skills/workout-testing/SKILL.md` (+ `npm run skills:sync`), `AGENTS.md`, and `README.md`.

## Verification

- Local (Windows, installed Chrome): there was no test DB, so the full `npm run test:e2e` could not be run.
  - Instead, only the screen checks (API mock) were run with a temporary config that starts the front end dev server. This config was not committed.
  - `ui-responsive` 8 + `ui-a11y` 22, 30 passed.
- Checked that the checks really fail by breaking things on purpose (temporary change, reverted).
  - A 3000px wide element: `/ horizontal overflow` failed
  - A 200px fixed bar at the bottom of the screen: failed with `button "수정"` ("edit") and `button "하체 삭제"` ("delete legs") covered
  - An input without a label: the axe `label` rule failed
- `npx tsc -p e2e/tsconfig.json`: pass
- `npm run check` (local, no `TEST_DATABASE_URL`)
  - format, lint, contract, typecheck pass
  - Backend: 206 pass and 35 skip out of 241. The DB integration tests were not run.
  - Front end: 121 pass
  - `test:skills` 4 and `test:docs` 3 pass, build passes
  - `test:agents`: 2 of 162 failed. The PowerShell execution policy (Restricted) on this PC blocked the temporary `.ps1` used by the tests. This is an environment problem unrelated to this change. Re-ran with `PSExecutionPolicyPreference=Bypass` (process only) and confirmed 162 pass.
- `quick_validate.py skills/workout-testing`: `Skill is valid!`
- The DB integration tests, the full `npm run test:e2e`, and the visual baselines are checked in CI (see the CI result below).

## Limits and follow-up

- The 121 color contrast violation combinations were left in the allow list. After the #98 design baseline is settled, the list will shrink as token colors are fixed in #100 and the screen replacements (#101 to #103).
- Visual regression only looks at screens with fixed data. There are no baselines yet for the empty state, the error state, and the saving state.
- Real device browsers (mobile Safari, Samsung Internet) are not checked.

## CI result and baseline commit — 2026-10-21

- First push run (run 39601581578)
  - `verify` (`npm run check` including DB integration), `docker-build`, and `terraform`: success
  - `e2e`: 44 failed, 36 passed. All 44 failures are `ui-visual`, which had no baselines. The functional e2e, responsive, and accessibility checks passed in the fixed container too.
- Committed the `visual-baselines` artifact (44 images) of the same run to `e2e/__screenshots__/ui-visual.spec.ts/`.
  - Opened and checked the dashboard at 390px, the routines at 1280px, and the new workout record modal at 390px directly.
  - The fixed data (2 this week, cumulative 6,660 kg, goals 1/2, routine list), the Korean font, and the modal layout were normal.
- Going through `gh-project.ps1`, the short options (`-n`, `-D`) of `run download` gave an argument error, so the example in the skill was changed to `--name` and `--dir`.
- Re-run after the baseline commit (run 39602894808, `0aadfea`): `verify`, `e2e`, `docker-build`, and `terraform` all succeeded. The 44 visual comparisons passed without retries, so it is stable between runs.

## PR automatic review, round 1 — 2026-10-21

After merging `origin/main` (#129 merged) into the branch (no conflicts), the whole PR diff was reviewed by a separate read-only review agent. There were no critical or major defects, and 5 minor items came up.

| #   | Remark                                                                                                                                                                                                                                                                                             | Handling                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The `/routine-progress` mock did not apply the user's increment unit (bench press 2.5 kg) and computed with the default 5 kg. The real server computes with `withWeightSteps(plan, steps)`, so the mock response contained target weights the server cannot produce (for example 105 to 102.5 kg). | Applied. One `weightSteps` constant now aligns the `/exercise-weight-steps` response and the `routineProgress(withWeightSteps(...))` calculation. The changed values are only in the upcoming routine schedule (`days`) and do not appear on the fixed-date screen (Thursday, no `today_plan`), so the 44 baselines passed as they were (see the CI result below). |
| 2   | The `/goal-suggestion` mock returned `weight_step: 5, base: null` regardless of exercise.                                                                                                                                                                                                          | Applied. It computes the server rule (latest goal, otherwise the heaviest completed set of the latest workout, the increment unit per exercise) with the same fixed data. The current baseline has an empty exercise name, so there is no screen change.                                                                                                           |
| 3   | It does not detect color combinations (stale entries) in the allow list that no longer appear.                                                                                                                                                                                                     | Split out: [#131](https://github.com/sirloinbh/workout-memo/issues/131). It needs a test logic change and separate verification, and it is better handled together with the color fixes (#98, #100).                                                                                                                                                               |
| 4   | The visual comparison container image is pinned only by tag, so the font could change if the tag is re-published.                                                                                                                                                                                  | Applied. Pinned by the digest (`sha256:eff16c30…a4a27`, the same value confirmed in the run 39602894808 log and the MCR registry) received by the run that made the baselines.                                                                                                                                                                                     |
| 5   | The CI result after the baseline commit is not in the docs.                                                                                                                                                                                                                                        | Applied (the re-run record above).                                                                                                                                                                                                                                                                                                                                 |

### First follow-up verification

- `npx tsc -p e2e/tsconfig.json`: pass
- Mock response comparison (temporary script, not committed): in `/routine-progress` before and after the fix, only the bench press target weight changed (for example 105 to 102.5, 120 to 110 kg). Other values are the same.
- `npm run check` (local Windows, no DB, `PSExecutionPolicyPreference=Bypass`)
  - format, lint, contract, typecheck pass
  - On the first run, 1 backend test `body measurement range query ...` failed with `fetch failed: bad port`. This is the case where the random port picked by `listen(0)` hit a port that Node fetch blocks, and it is unrelated to this change (e2e, CI, docs). It passed when run again.
  - Re-run: backend 206 pass and 35 skip out of 241 (DB integration not run), front end 121 pass, `test:agents` 167, `test:skills` 4, `test:docs` 3 pass, build passes
- Locally there is no test DB or Docker, so `npm run test:e2e` could not be run. The full e2e was checked in the CI fixed container.

### First follow-up CI — `dd2beab`

- Run 39607992359 (CI): `verify`, `e2e`, `docker-build`, and `terraform` all succeeded. The 44 `ui-visual` images matched the existing baselines. So the baselines were not updated.
- The Local agent workflow and Project GitHub authentication checks on the same head also succeeded.

## PR automatic review, round 2 — 2026-10-21

A separate read-only review agent reviewed the first follow-up (`dd2beab`) and the final full diff. It confirmed that the applications of 1, 2, 4, and 5 match the server rules (`backend/src/routes/routines.ts`, `weight-steps.ts`) and that there are no new defects.

- Remark (docs): the round 1 table had wording that did not match reality, "the baselines were updated". Corrected to the actual result (44 images passed as they were).
- Remark (low): the skill did not explain pinning the container image by digest or regenerating the digest and baselines when Playwright is updated. Added one sentence to `skills/workout-testing/SKILL.md` and ran `npm run skills:sync`.
- There is no third review (at most 2 by policy).
- Second follow-up verification: `prettier --check .` passes, `npm run test:skills` 4 pass, `npm run test:docs` 3 pass, `quick_validate.py skills/workout-testing` (`PYTHONUTF8=1`) `Skill is valid!`. Only docs and the skill changed, so the app tests were not run again (the result of the previous `npm run check` is still valid).
