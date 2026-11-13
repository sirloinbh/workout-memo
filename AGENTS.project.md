# Workout Memo Project Instructions

These rules apply only to workout-memo. The shared instructions are in [AGENTS.md](AGENTS.md), which becomes a centrally managed file after syncing with the central standards (`sirloinbh/project-standards`). If the two files differ, this file wins.

## Service rules

- Service name: FORM · 나의 운동 기록 (FORM · My Workout Log).
- A workout date is `YYYY-MM-DD` and the service time zone is `Asia/Seoul`. Weight is the total weight in kg, including the machine's base weight. A machine base weight that has not been confirmed is stored as NULL.
- A week starts on Monday. This is an exception to the central shared rule (weeks start on Sunday, project-standards `docs/conventions/domain.md`). Every place that uses a calendar week (weekly totals, per-body-part statistics, the 1-week period tab) is Monday-based, and changing it would change the weekly values of past records (#140). The default goal end date is the end of the queried period, so for a 1-week period it is that week's Sunday. Week N of a routine is not a calendar week; it is a block of 7 days counted from the start date.
- Input validation and goal evaluation are also done on the server. Editing a log and its sets is done in a transaction.

## Work procedure (in addition to the shared procedure)

- After opening a PR, go through **automatic code review at most 2 times**. If the review finds improvements, apply them in an additional commit. After the first round of fixes, get one more review; after the second round of fix commits, do not review again. If there are no improvements, go straight to the next step. Split a fix that is too large for this PR into a new issue card.
- **When every required CI check on the final head passes, the agent merges the PR without asking the user** (`--merge --match-head-commit <the SHA you verified>`). Merging to main is a production deploy, so check the deploy result after merging. Merge consecutive PRs in order: after the earlier PR is merged, merge `origin/main` into the next branch, resolve conflicts, get the tests and CI passing again, and then merge. Do not merge while a check is failing or running, bypass protection rules (for example `--admin`), approve your own PR, push directly to main, or force-push.

## Accounts and tools

- Use `ghp` first for personal GitHub work. For a non-interactive worker or Git helper where the function does not exist, call `scripts/gh-project.ps1` explicitly. The personal config is `%USERPROFILE%/.config/gh-personal` and the expected account is `sirloinbh`. The default `gh` stays for the company account and is not used for remote changes to this project.
- Codex selects the existing personal account B profile with `CODEX_HOME=%LOCALAPPDATA%/Codex-Account-B`. Do not assume that a running company-account conversation switches automatically. For authentication and for applying it to the runner, follow the [authentication doc](docs/project-github-auth.md).
- The personal authentication settings reuse `%USERPROFILE%/.config/gh-personal`, which is separate from the tool install location `%LOCALAPPDATA%/sirloinbh-tools` (central `docs/tools.md`).

## Current implementation

- React + Vite + TypeScript (React Router page URLs, TanStack Query server queries, React Hook Form, Tailwind CSS 4, shared design tokens, shadcn/ui shared components, `AppShell`), Express + pg + Zod, PostgreSQL 17, npm workspaces, Docker Compose, GitHub Actions.

## Project-specific skills and docs

- Language for explanations to the user: follow the central shared skill [std-communication](skills/std-communication/SKILL.md) (sirloinbh/project-standards#313).
- Tests for implementation and fixes: [workout-testing](skills/workout-testing/SKILL.md). Write related tests with a new feature and a regression test with a bug fix.
- Work procedure: [workout-implementation](skills/workout-implementation/SKILL.md).
- Building and tidying the development foundation: [workout-foundation](skills/workout-foundation/SKILL.md). When you apply it, also follow the implementation procedure above.
- Technology recommendations and the order to adopt them: [stack.md](skills/workout-foundation/references/stack.md). The recommendation list is not a list of what is installed.
- Screen design: [design system](docs/design-system.md). For a new element, use `frontend/src/components/ui` (centrally managed) first and use only the shared token names for colors. When you move an existing `style.css` screen to the shared components, compare the screen before and after.

## Project-specific verification commands

- Unit tests: `npm test`. The backend runs on node:test (`backend/test`), and the screens run on Vitest, jsdom and React Testing Library (`frontend/src/*.test.tsx`, `npm run test -w frontend`).
- Browser verification: `npm run test:e2e` (Playwright, using the installed Chrome). Point `E2E_DATABASE_URL` (or `TEST_DATABASE_URL` if it is not set) at a test DB prepared with `db:migrate`. It starts the API on port 3201 and the screen on port 5301, and you must not point it at a personal DB. The `e2e` job in CI runs it on every PR. It includes responsive and axe accessibility checks for every screen, and visual regression (`toHaveScreenshot`) is compared only in the CI-pinned Playwright container (`E2E_VISUAL=1`). Update the baselines as [workout-testing](skills/workout-testing/SKILL.md) says.
- Input schema changes: the source of the log, set, machine, goal and body record schemas is `shared/contract.ts`. After editing it, run `npm run contract:sync` to update `backend/src/contract.ts` and `frontend/src/contract.ts`, and do not edit the copies directly. `contract:check` in `npm run check` fails on a mismatch. Screen forms use the same schema through React Hook Form + `zodResolver` or `safeParse` before saving.
- API route changes: change the feature modules in `backend/src/routes/` and the [REST API contract](docs/api.md) together. `api-contract.test.ts` fails on a mismatch between the two. Match `operations` in `backend/src/openapi.ts` and regenerate `docs/openapi.json` with `npm run openapi` (`openapi.test.ts` fails on a stale file).
- Infrastructure changes: the Terraform source is `sirloinbh/shared-aws-infrastructure`; follow that repo's AGENTS.md and operations doc (`docs/operations.md`). This repo manages only the server deploy scripts (`deploy/*.sh`) and checks them with `bash -n`. For app deploys and rollbacks, follow [deployment and operations](docs/deployment.md). The server timer deploys commits merged to main automatically after CI passes (#75), so merging to main is a production deploy.
- Introducing an npm package: after the user confirms they understand the risk, follow the [proven repeatable procedure](skills/workout-foundation/references/procedures.md): pinned version, 14 days old, `--ignore-scripts`, regenerating the subtree lockfile, and confirming the Docker build.

## Local agent work

- For multi-agent work the user requested, register the confirmed issue with the central runner as the [operations doc](docs/local-agent-workflow.md) says (`agents.ps1 -Root . enqueue -Issue <number>`; the runner location is in the operations doc). This conversation is the channel for requirements and progress checks. The main agent can keep going with the requirements conversation after enqueueing.
- When a new development request arrives while a local worker is running, the main agent prepares the requirements, completion criteria and issue, and enqueues it. The main agent does not implement the same issue directly at the same time. The main agent handles communication with the user and clearing the cause of a blocked job.
- The worker handles test → implementation → independent review for each issue in its own worktree, as separate Codex runs. It reuses the issue that is already registered and the branch that is already prepared, and sub-agents do not create duplicate issues or branches.
- The test and implementation roles the worker assigns only change files and record verification. The review role is read-only. The worker handles commit, push, PR, and merge after CI passes. A main conflict the worker cannot resolve automatically stays as blocked (`merge-conflict`); the main agent resolves it in the worktree with a merge commit and then runs `retry`.
- The source of the worker code is `tools/agents/` in the central repo `sirloinbh/project-standards`. Change the worker in the central repo and verify it with that repo's `npm run test:agents`. This repo keeps only its own setting, `.agents.json` (the DB precheck table).
- The worker model is pinned per role in the central `tools/agents/models.mjs`, and every `codex exec` states the model and reasoning level explicitly. Do not change the model or fall back arbitrarily before the user explicitly asks. Record an access failure as blocked. Do not change the current chat or the user or global Codex settings.

| Role                                | Model       | reasoning effort |
| ----------------------------------- | ----------- | ---------------- |
| planning, debugging, highRiskReview | gpt-6-astra | high             |
| tests, implementation, review       | gpt-6.1-sol | medium           |
| research, documentation             | gpt-6-luna  | medium           |

- State test complexity with `-TestComplexity simple|complex` when you enqueue or configure. Only mark simple valid and invalid input tests as `simple`; then the tests role uses gpt-6-luna medium. Existing jobs with no setting, and transaction, concurrency and complex boundary tests (`complex`), stay on Sol. Running jobs are not reclassified automatically.
- State required DB and browser verification with `-RequireDatabase true -RequireBrowser true`. Before any model call, the worker checks the tools, locks, worktree, dependencies and required environment, and if that fails it records an environment block without calling the model. A job that requires a browser needs `browserExecutable` and `browserCheckArgs` in the local config. The worker does not auto-install, change ACLs or disable the sandbox.
- The context for a role carries only the completion criteria, base SHA, changed paths, a summary of recent checks and unresolved findings. Full logs, hashes and audit records are kept locally. A critical finding that exceeds the limit is not silently cut; the worker stops before handoff. When an environment recovery leaves the review evidence identical, the code stages that already passed are reused, and a change triggers a new review. To change a protected test, formally hand off to the tests role again with `handoff-tests -Issue <number>` after the worker has exited.

- Ordinary work uses Sol. State documentation work with `enqueue -Issue <number> -TaskKind documentation` and high-risk review with `-ReviewRole highRiskReview`. Work is not classified automatically from the title or body. For the existing #21 change, use `configure -Issue 21 -TaskKind documentation` after the worker has exited.
- For hard debugging, use `agents.ps1 -Root . diagnose -Issue <number>`. An Astra diagnosis is read-only and records its own lock, schema and result in the ignored `.local/agent-workflow/diagnostics/`. During concurrent implementation it is a point-in-time snapshot, so check whether it is stale. There is no automatic escalation. Astra high and repeated smoke runs or diagnoses use up quota, so call them only when there is an explicit need. For the detailed procedure, follow the [operations doc](docs/local-agent-workflow.md).
- The queue, logs and local run settings are stored in the ignored `.local/agent-workflow/`. Check progress with `agents.ps1 -Root . status` and stop with `agents.ps1 -Root . stop`. There is no feature that sends the worker status to this conversation automatically when there is no chat message.
