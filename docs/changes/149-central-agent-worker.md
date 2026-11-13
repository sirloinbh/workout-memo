# #149 Switch the agent worker to the central runner and delete the copy in the repo

- Issue: [#149](https://github.com/sirloinbh/workout-memo/issues/149) (central tracking: sirloinbh/project-standards#167)
- Branch: `chore/149-central-agent-worker`

## Change

- Deleted
  - `scripts/agents.ps1` and 9 `scripts/agents/*.mjs` files
  - 10 `scripts/test/agent-*.test.mjs` files
  - `.github/workflows/local-agent-workflow.yml`
  - `test:agents` in `package.json` and the call to it inside `check`
- Added: `.agents.json`
  - The 5 tables and columns of the DB pre-check. They are the same values as `requiredColumns` in the deleted `scripts/agents/optimization.mjs`.
  - `autoMerge` is not written. The default is `true` (#128, central #184 table).
- Documents
  - `docs/local-agent-workflow.md`: kept only the link to the central `docs/tools.md` and the settings specific to this repo (`.agents.json`, the test DB, `.local/agent-workflow/`).
  - `AGENTS.project.md`, `README.md`, `docs/development-baseline.md`, `docs/ai-agent-project-setup.md`: changed the run path to the central runner (`agents.ps1 -Root .`) and moved the worker tests to the central repo.
  - `docs/next-steps/blocked-issues-recovery.md` and the past records in `docs/changes/` show the state at that time, so they are left as they are.

## Checks

- Queue state before registration (central `cli.mjs --root <workout-memo> status`): queued and running 0. done 9, blocked 4 (#26, #27, #34, #43, old jobs), cancelled 1. The records stay in `.local/agent-workflow/` as they are.
- `node tools/agents/cli.mjs --root <this worktree> doctor` (central repo main): passed
  - `Repository sirloinbh/workout-memo: npm run check; database probe configured; autoMerge true`
- `node --test scripts/test/docs-commands.test.mjs scripts/test/claude-skills.test.mjs`: 7 passed
- Prettier check on the changed files (shared config `@sirloinbh/prettier-config`): passed
- The full `npm run check` was not run locally because dependencies are not installed in this worktree. It is confirmed with the CI `verify`.
- The installed runner (`%LOCALAPPDATA%\sirloinbh-tools\agents.ps1`) is not on this PC yet (central #183), so I checked with `tools/agents/cli.mjs` in the central repo.
