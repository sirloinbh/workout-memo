# Local AI work automation

While the PC is on and the worker process is running, GitHub issues put in the queue are processed in this order: test → implementation → independent review → real checks → commit, push, and PR → CI check. The worker handles one issue at a time, and the user can keep discussing the next requirements in the main conversation.

The source of the worker code and how to run it is the central repo `sirloinbh/project-standards`. For the install, the commands, the model per role, and the `.agents.json` format, follow the [local agent worker in the central docs/tools.md](https://github.com/sirloinbh/project-standards/blob/main/docs/tools.md#로컬-에이전트-워커-toolsagents). When you fix the worker, open an issue in the central repo. This document describes only the settings that apply to this repo.

## Running

`tools\install.ps1` in the central repo installs the runner in `%LOCALAPPDATA%\sirloinbh-tools\`. Run it from the repo folder like this.

```powershell
$agents = "$env:LOCALAPPDATA\sirloinbh-tools\agents.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . doctor
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . start
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . enqueue -Issue 12 -Slug csv-export
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . status
powershell -NoProfile -ExecutionPolicy Bypass -File $agents -Root . stop
```

Replace the example number 12 and `csv-export` with the real issue number and an English summary. Register only open issues whose body has done criteria (`완료 기준` or `Acceptance criteria`).

## Settings of this repo

### `.agents.json`

`.agents.json` at the repo root lists the 5 tables (`brands`, `machines`, `workouts`, `sets`, `goals`) and the required columns that the DB pre-check looks at. If a migration changes these columns, fix this file together with it.

- `checkScript` uses the default `check` (`npm run check`).
- `autoMerge` is not written. The default is `true`, so the worker merges the PR after CI passes (allowed by the user in #128, central #184 table). A merge to main is a production deploy.

### Tasks that need a DB

A task registered with `-RequireDatabase true` needs `TEST_DATABASE_URL` of a dedicated test DB. It does not use the production DB or user data, and the connection value is not written in docs, PRs, or logs. The pre-check only queries the tables and columns above and does not create a DB or run migrations.

### Per-PC settings and work records

- The queue, locks, worktrees, and logs go in `.local/agent-workflow/`, which is ignored. The job records left by the in-repo worker copy (deleted in #149) are on the same path, so the central worker reads them as they are.
- The Codex executable, npm, and the browser path go in `.local/agent-workflow/config.json` (`codexExecutable`, `npmCli`, `browserExecutable`, `browserCheckArgs`). Do not commit it.
- If the project's `.local/node-v24.21.0-win-x64/node.exe` exists, the runner uses that Node.

## Verification

The test of the worker's behavior is `npm run test:agents` in the central repo. It is not part of `npm run check` in this repo. In this repo, use `doctor` to check the account, the repo registration, `.agents.json`, Codex, and npm.
