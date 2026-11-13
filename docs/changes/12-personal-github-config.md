# #12 Connect personal GitHub authentication settings

- Issue: https://github.com/sirloinbh/workout-memo/issues/12
- Purpose: reuse the existing personal sirloinbh authentication, separate from the company default gh, in this project.

## Change

- The project gh wrapper, the VS Code terminal, and this project's branch of the account B launcher use `%USERPROFILE%/.config/gh-personal`.
- The install script location `%LOCALAPPDATA%/gh-workout-memo` is kept separate from the authentication settings location.
- When another project runs, its existing GitHub environment is preserved. Explicit account selection, blocking of inherited tokens, restoring the parent environment, and passing through arguments, exit codes, and stdin are kept.
- AGENTS.md and the authentication operations doc now say to use ghp or the project wrapper and to reuse the existing personal authentication.

## Actual verification

- Windows `node --test scripts/test/project-github-auth.test.mjs`: exit code 0, 15 passed, 0 failed or skipped. Only a temporary HOME/USERPROFILE/LOCALAPPDATA and fake gh and code were used.
- `npm run check`: exit code 0. Format, lint, type check, and build passed; backend 4 passed (including the integration test on the dedicated test DB), worker 34 passed, 0 skipped.
- `git -c safe.directory=C:/Users/byunghk/Documents/GitHub/workout-memo/.local/agent-workflow/worktrees/12 diff --check`: exit code 0.
- The failures expected before implementation and the step-by-step work log are recorded in [12-agent-task.md](12-agent-task.md).

## Remaining work

After an independent review, the coordinator handles the commit, push, and PR. Updating the user's installed copy and the final Git authentication check are done in the main conversation. The worker did not change the real authentication settings, the company settings, the global gh/ghp, or the user's installed copy. Only the user merges the PR.
