# #14 Separate company gh from personal ghp and Codex

- Issue: https://github.com/sirloinbh/workout-memo/issues/14
- Detailed work, commands, and results: [14-agent-task.md](14-agent-task.md)

## Change

`project-terminal.ps1` keeps the company `gh` and defines only the personal `ghp`. The wrapper names `sirloinbh` explicitly from `%USERPROFILE%/.config/gh-personal`, and keeps blocking of inherited tokens, restoring the parent environment, and passing through arguments, exit codes, and stdin. The script install path `%LOCALAPPDATA%/gh-workout-memo` is unchanged.

The VS Code terminal settings and initialization, and the project launcher, select the company `GH_CONFIG_DIR=%APPDATA%/GitHub CLI` and the personal `CODEX_HOME=%LOCALAPPDATA%/Codex-Account-B`, and remove inherited tokens. The launcher no longer looks up the personal GitHub token or injects it into the whole process, and no longer creates the Codex settings file automatically. The existing GitHub environment of other projects is preserved.

This change replaces the gh redefinition and the process-wide personal GitHub environment injection from #12 and PR #13. The coordinator must state this relationship in the PR description. The existing PR is not merged or closed.

## Verification and follow-up

`node --test scripts/test/project-github-auth.test.mjs` gave 14 pass / 0 fail / 0 skip, and `npm run check` passed with exit code 0. The first implementation run also passed the provided dedicated-DB integration check. The latest re-run after the CI fix had no dedicated DB environment, so backend was 3 pass / 1 skip, and the 34 worker tests and the build passed. Do not report the latest run as DB verification complete. The detailed commands are in the work log. The assertions prepared in the test step were kept.

Updating the real installed copy and the desktop launcher, and checking the accounts, are done in the main conversation; the worker does not change logins, token stores, global commands, or the company Codex home. The ChatGPT app needs a separate account selection, and a running company-account conversation does not switch automatically.

## CI startup allowance

The first Windows CI test appears to have exceeded the previous 20-second subprocess timeout. The timeout is now 60 seconds, with existing behavior assertions preserved and direct spawn-error diagnostics added. All 14 local authentication tests and the full check passed again. The hosted delay was not reproduced locally; remote CI must still be rerun. See the linked work notes for evidence and commands.

## PR #15 conflict resolution (2026-10-15)

The #12 changes in the latest `origin/main` were merged into the existing `feat/14-agent-task` branch. The conflicts in `.vscode/settings.json`, `scripts/open-vscode-account-b.cmd`, `docs/project-github-auth.md`, and `scripts/test/project-github-auth.test.mjs` were resolved to keep #14's separation of company `gh` and personal `ghp` and the personal Codex profile selection. The authentication guidance and the #12 work record from main were also preserved.

The authentication tests keep main's temporary HOME/USERPROFILE isolation, the restore check when the parent authentication environment variables are absent, and the checks that another project's GH_CONFIG_DIR is unset or keeps the personal setting. The existing PR's failure-path, argument pass-through, and company/personal account separation checks were kept, and 17 tests ran in total.

- `node --test scripts/test/project-github-auth.test.mjs`: 17 pass, 0 fail, 0 skip.
- `npm run check`: passed. Format, lint, type check, and build passed; backend 3 pass / 1 skip, worker 34 pass / 0 fail.
- One DB integration check was skipped because `TEST_DATABASE_URL` was not set, and it is not counted as local DB verification.
- Leftover conflict marker check and `git diff --check`: passed.
- There is no app feature or UI change, and the user merges the PR.
