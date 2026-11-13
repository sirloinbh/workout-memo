# #12 chore: connect the project GitHub authentication to the personal gh settings

- Issue: https://github.com/sirloinbh/workout-memo/issues/12
- Branch: feat/12-agent-task

## Changes and verification

### Test step (before implementation)

- In `scripts/test/project-github-auth.test.mjs`, HOME/USERPROFILE are separated into a temporary directory, and the authentication settings path of the wrapper, the account B launcher, and the project terminal is verified to be `%USERPROFILE%/.config/gh-personal`. Separately it checks that the install script location stays `%LOCALAPPDATA%/gh-workout-memo`.
- Added tests for explicit project path selection, preserving another project's unset or personal setting, and restoring the caller's environment on command failure, a missing account, or an unset parent environment variable.
- Kept the existing tests for explicit sirloinbh selection, blocking inherited tokens, and passing through arguments, exit codes, and stdin. Only a fake gh and a temporary environment are used, and the real user authentication and installed copy are not accessed or changed.
- `node --test scripts/test/project-github-auth.test.mjs`: exit code 1, 10 of 15 passed / 5 failed / 0 skipped. The failures expected before implementation are the wrapper path, the default project launcher path, the terminal path through the installed wrapper, the VS Code terminal settings, and the explicit project selection path. All failed on the difference between the old gh-workout-memo path and the new gh-personal path.
- `npx --no-install prettier --write scripts/test/project-github-auth.test.mjs`: exit code 0.
- `npm run check`: exit code 0. Format, lint, type check, and frontend/backend builds passed, backend tests 4 passed (including the integration test on the dedicated test DB, 0 skipped), worker tests 34 passed (0 skipped). The current check does not include the authentication test command, so this result is separate from the 5 expected failures of the authentication test above.
- Implementation files were not changed. After the implementer changes the paths, the authentication test and the required full check must be re-run. Updating the real installed copy and the final Git authentication check belong to the main conversation.

### Implementation step

- Changed the project authentication path in `scripts/gh-project.ps1`, `.vscode/settings.json`, and `scripts/open-vscode-account-b.cmd` to `%USERPROFILE%/.config/gh-personal`. The wrapper checks that USERPROFILE is present as a required input. The install script and terminal profile location `%LOCALAPPDATA%/gh-workout-memo` was kept.
- Deleted the code that removed the existing GH_CONFIG_DIR in the launcher's other-project branch, so the inherited environment is preserved. The code for the explicit sirloinbh token lookup, blocking inherited tokens, restoring the caller's environment, and passing through arguments, exit codes, and stdin was kept.
- Stated the principle of using ghp or the project wrapper in `AGENTS.md`, and recorded in `docs/project-github-auth.md` the reuse of the existing personal authentication, the distinction between the install location and the authentication location, and who updates the real installed copy. The final issue record is also left in [12-personal-github-config.md](12-personal-github-config.md).
- `node --test scripts/test/project-github-auth.test.mjs`: on Windows, exit code 0, 15 passed / 0 failed / 0 skipped. The assertions and tests from the earlier test step were not changed.
- `npm run check`: exit code 0. Format, lint, type check, and frontend/backend builds passed, backend 4 passed (including the integration test on the dedicated test DB, 0 skipped), worker 34 passed (0 skipped). The authentication test was verified with a separate command.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/12 diff --check`: exit code 0.
- After adding the final record, `npx --no-install prettier --check AGENTS.md .vscode/settings.json docs/project-github-auth.md docs/changes/12-agent-task.md docs/changes/12-personal-github-config.md`: exit code 0. Confirmed with Node fs that the targets of the relative Markdown links in the two issue docs exist (exit code 0). The SHA-256 of the test file is the same as the test step's `e4beb419e4129acec3ad4b9ba81b5a85c48e720276a7045af6c804e727e50fe9`.
- The real authentication files, tokens, and the user's installed copy were not accessed or changed. No remote work, commit, push, or PR was done, and the independent review and the coordinator's follow-up remain.
