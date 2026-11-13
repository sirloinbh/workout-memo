# FORM · My Workout Log

A service for logging my own workouts and checking training volume and progressive overload goals by period. There is one user and no login. It runs locally.

## Development standards

It uses Node.js **24.21.0** and npm **11.19.0**. Install with `npm ci`, format with `npm run format`, and verify everything with `npm run check`. For the detailed commands and the lockfile policy, see the [development baseline doc](docs/development-baseline.md).

## Development procedure and Codex skills

Changes follow this order: **register a GitHub issue → a branch based on the issue number → implementation with a docs record per commit → tests, then a PR → the user merges it directly**. The detailed rules are in [AGENTS.md](AGENTS.md) and the [implementation procedure skill](skills/workout-implementation/SKILL.md).

The earlier recommendations for the tech setup, code rules, API, design, verification, and operations are kept in the [development foundation skill](skills/workout-foundation/SKILL.md). The source of the skills is `skills/` in this repo; if you install them in the Codex skills path you can use them as `$workout-implementation` and `$workout-foundation`. Rather than editing a local installed copy, update the source in the repo and install it again. The copy for Claude Code is in `.claude/skills/`; after editing the source, refresh it with `npm run skills:sync` (`npm run check` detects a mismatch). The skill list is refreshed in a new session. When you implement or fix something, also write test code and run it before committing and before creating or updating a PR. The [testing skill](skills/workout-testing/SKILL.md) can be used as `$workout-testing`. A PR goes through automatic code review at most 2 times and gets the fix commits applied (large fixes are split into new issues), and when the required CI passes the agent merges it.

To start a new web app project in the same development environment, give the [development environment setup doc for AI agents](docs/ai-agent-project-setup.md) to an agent. It covers the language, the tech stack, the AI instructions, the design, the Git strategy, the repository split, the DB, the AWS infrastructure, and the bootstrap order.

## Local AI work automation

The summary of each working day accumulates by date in the [daily work log](docs/daily/README.md), and the latest priorities, to-dos, and the unblocking procedure are updated in [next steps](docs/next-steps/README.md).

The requirements conversation is held with the main agent, and each confirmed issue is processed on the PC in this order: test → implementation → independent review → checks → PR. For how to start, stop, register issues, and recover, see the [local agent operations doc](docs/local-agent-workflow.md).

The worker uses the runner from the central repo (`sirloinbh/project-standards`), installed on the PC.

```powershell
$agents = "$env:LOCALAPPDATA\sirloinbh-tools\agents.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . start
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . enqueue -Issue 12
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . status
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . stop
```

## Running

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

Open http://localhost:8101 . Change the password in `.env` before you run it. Data is stored in the `workout-data` volume. It stays after `docker compose down`, and `down -v` deletes the data.

Before running an existing volume with a new version, run `npm ci` and then `npm run db:migrate` to apply the pending migrations. The procedure and how to recover from a failure are in [database/README.md](database/README.md#applying-migrations-58), and the API request and response rules are in the [REST API contract](docs/api.md).

Development run:

```powershell
docker compose up -d db
npm ci
npm run dev
```

Open http://localhost:5201 . Also match the DATABASE_URL password in `.env`. If the password has URL reserved characters, DATABASE_URL needs URL encoding.

## Features and rules

- **Routine planning**: choose a no-split to 5-split plan, enter the body parts (order and repeats are preserved), the base sets, total weight in kg, and reps for each exercise, and save. For the schedule, pick between the default cycle mode (N workout days, then M rest days, repeated) and the weekday mode (workouts per week, rest weekdays); the split rotates on each workout day. When you pick the number of splits, the cycle (no-split and 2-split 2+1, 3-split 3+1, 4-split 4+1, 5-split 5+2) and the default body parts are pre-filled and can be changed (#88). The body parts are chest, back, shoulders, biceps, triceps, legs-front, legs-back, and abs, and an earlier saved "arms" is preserved as it is. You enter by hand the weight and rep increase for each of the 12 weeks and the deload target and reduction for weeks 4, 8, and 12. A saved plan can be viewed again and does not create real logs or goal achievement. For an existing DB, apply the [routine migration](database/README.md) first.
- **Automatic weekly goals (double progressive overload)**: the default mode for a new routine. When you enter the current total weight and reps for each exercise and a rep range (8 to 12 by default), each session (workout day) of the split that contains the exercise adds 1 rep, and when the upper limit is passed it raises the total weight by the exercise's weight step (5 kg by default, changeable per exercise from Add goal in My goals, #86) and goes back to the lower limit. The weight step also applies to routines that were already saved. An exercise at 0 kg only adds reps. The sessions in weeks 4, 8, and 12 deload to 90% of the previous target weight (in 2.5 kg steps) and do not progress. If, in the logs saved from the session date up to before the next session of the same split, you do all the planned sets at or above the target, it progresses in the next session; if you do not, it keeps the same target, and future targets with no log are shown as "expected". Existing manual routines are still shown as they were. A new workout log and a routine exercise start with 3 sets by default.
- **Routine goals, rest, and quick entry**: on the workout log screen, you see the today, this week, and 12-week goals of the routine in progress (the most recently started routine among those whose start date is today (Asia/Seoul) or earlier) as sets, total weight in kg, and reps for each exercise. Weights are not summed across exercises. "Rest today" shows the schedule that will move and the last goal that will be dropped before it runs, and pushes the remaining goals back by one workout day each. The 12-week end date is fixed, goals that overflow stay as "Excluded", and it can be canceled only on the same day. "Log with today's routine" fills a log draft with today's goals and shows the previous record of the same exercise as a reference value; it is not a real record until you save it. For an existing DB, apply `005_routine_progress.sql`.
- **Body records**: enter body weight in kg, body fat in %, and skeletal muscle in kg for each date, all optional (at least one is required, up to two decimal places). Only one record is saved per day, and you edit a date that is already recorded. A value that was not measured is kept as not entered (NULL) and is not estimated. You view the trend with the same period selection as the dashboard, and missing values are not drawn as 0 or joined with a line. It shows the same day's workout volume side by side but does not present causation or a medical judgment. For an existing DB, apply the [body record migration](database/README.md) first.
- **InBody import (#89)**: on the body records screen, choose a CSV exported by InBody (the date, weight, body fat, and skeletal muscle columns are found by header name, and you specify them yourself if they are not found) or a photo of the result sheet, and the values fill an editable preview. Only the rows you confirm are saved through the existing body record API. A photo is read in the browser with Tesseract (tesseract.js 7.0.0) and the image is not sent to the server. The OCR engine and the Korean and English language data are downloaded from the jsdelivr CDN the first time you use it. The original file is not kept, and values that could not be read are left empty.

For a comparison of the features, prices, and web support of 13 fitness services and the additional implementation issues, see the [service research and implementation backlog](docs/fitness-app-research-2026.md).

- Entering, viewing, editing, and deleting logs, with the exercise name, total weight, reps, machine, and a note for each set.
- Queries for 1 day, 1 week starting Monday, 1 calendar month, and 4 weeks or 12 weeks up to a base date. Days, volume, and set counts by period, and a graph. The period log gathers the records of each date and you edit each one.
- Goal start date and end date, target total weight and reps. A goal is met when one set of the same exercise name (leading and trailing spaces and English letter case ignored) meets both conditions. Future records are excluded from goal evaluation.
- **Exercise analysis**: per-exercise PRs for best weight, most reps, and best set volume (weight × reps), and the date-by-date trend for the selected period. The same-exercise decision uses the same rule as goal evaluation. PRs use all the server records up to today in Seoul time, and the trend and the weekly body-part stats use the selected period (up to today). They are recalculated on every query, so edits and deletes show up right away. If the same value appears several times, the date it was first reached is shown as the PR date together with the number of ties.
- The estimated 1RM uses the Epley formula `total weight kg × (1 + reps ÷ 30)` and applies only to sets of 1 to 10 reps (a 1-rep set is that weight). Sets at 0 kg (bodyweight, assisted, or no weight entered) and sets on machines with an unconfirmed base weight are excluded. The measured 1RM is shown separately as the best total weight of a set actually done for 1 rep.
- Weekly volume by body part: aggregates the sets and volume of each week starting Monday by the body part you assign to each exercise yourself (chest, back, shoulders, arms, legs-front, legs-back, abs). It does not guess the body part from the exercise name, and an exercise you have not assigned is `미분류` (Unclassified). The sets of an exercise assigned to several body parts are added to each of them, so the sum of body parts can be larger than the overall total. For an existing DB, apply the [body part mapping migration](database/README.md) first.
- Brand selection, and entering and editing the base weight of machines such as Arsenal Strength. An unconfirmed value is NULL, and sample weights are not given as if they were facts.
- Weight is the total weight including the base weight. Enter left-right and single-side equipment on the same basis.

## Repository layout

This repo is an umbrella monorepo that contains all the source. `frontend`, `backend`, and `database` are published to their own private repositories with `git subtree split`. The AWS infrastructure (Terraform) is managed in the shared repo `sirloinbh/shared-aws-infrastructure`. The root holds Docker Compose, the integrated CI, and the operations scripts. A plain `git clone URL` gets you the whole setup. Commit changes in this monorepo and apply them to each repository with `scripts/push-repositories.ps1`. If you changed something directly in a sub-repository, first sync it with something like `git subtree pull --prefix=frontend URL main --squash`.

## Verification and operations

`npm run check` is the TypeScript build and the tests. For the real DB tests, point `DATABASE_URL` at the test DB, prepare the schema with `npm run db:migrate`, and then set `TEST_DATABASE_URL`. The integrated GitHub CI prepares the schema on a dedicated PostgreSQL service with `db:migrate`, then runs the whole build and the DB integration tests. Screen tests run with Vitest and React Testing Library (`npm run test -w frontend`) and are part of `npm test`. Creating, viewing, editing, and deleting a workout log in a real browser is verified with `npm run test:e2e` (Playwright, installed Chrome), and you must point the test DB at `E2E_DATABASE_URL`. The same command also checks every page and the main modals for horizontal overflow, fixed-element overlap, and axe accessibility (WCAG 2.1 A/AA). The CI `e2e` job runs the same checks and the screenshot comparison (baselines in `e2e/__screenshots__/`) in a fixed Playwright container. The frontend and backend repositories also check the separate builds and the Docker image builds.

Check errors with `docker compose logs --tail 100 api`, and make a SQL backup with `./scripts/backup.ps1`. The app's `Backup and export` screen provides an analysis CSV and an app-restore JSON backup (validation, preview, and restore that is canceled as a whole on failure). For the format and policy, see `database/README.md`. A SQL backup is for restoring the whole DB and a JSON backup is for moving and restoring app records, so their roles differ. Also keep backups in a separate safe place outside the PC and check restores regularly. For the AWS infrastructure and cost alerts, see `docs/operations.md` in `sirloinbh/shared-aws-infrastructure`.

Production deployment runs on one Lightsail server in a personal AWS account (about $7 to $8 per month, with a $10 budget alert) and is set up so that only allowed IPs can connect. Follow the [deployment and operations doc](docs/deployment.md) for the procedures to prepare, apply, deploy, roll back, back up, and restore. When running locally, the ports are still bound to localhost only.

For the shared server and DB operating options for the 8 personal apps and the monthly budget for each assumption, see the [shared hosting cost doc](https://github.com/sirloinbh/project-standards/blob/main/docs/costs.md) in the central repo.

## Project-only GitHub account

The gh and Git authentication of this project use the sirloinbh-only settings. For how to run VS Code as account B, the environment variables, the wrapper commands, and how to verify, see the [authentication setup doc](docs/project-github-auth.md).
