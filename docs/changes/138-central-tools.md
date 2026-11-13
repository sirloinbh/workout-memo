# #138 Clean up the personal account tool copies

## Change

- Deleted `scripts/project-terminal.ps1` and `scripts/open-vscode-account-b.cmd`. The originals are in `tools/` of the central `sirloinbh/project-standards` and are installed in `%LOCALAPPDATA%\sirloinbh-tools` (central #19, #21).
- `scripts/test/project-github-auth.test.mjs`: deleted 9 tests that checked the two deleted files, the `gh-workout-memo` install location, and the old `.vscode/settings.json` profile (`Workout Memo PowerShell`). The remaining 9 are wrapper tests for `scripts/gh-project.ps1` (a file managed by the central sync).
- `docs/project-github-auth.md`: kept only the guide to the central `docs/tools.md` and how this project uses it.
- `AGENTS.project.md`: changed the install location to `%LOCALAPPDATA%/sirloinbh-tools`.

## Reason

The first central sync PR (#143) changes `.vscode/settings.json` to the central template (the `sirloinbh PowerShell` profile and the `sirloinbh-tools` path), so the test `VS Code terminal settings select company gh and personal Codex`, which checked the old path, failed in `windows-auth`. If this PR is merged first, `windows-auth` of #143 passes.

`.vscode/settings.json` is changed by #143, so this PR did not touch it. So the `gh-workout-memo` path stays in that file until #143 is merged.

## Verification

- `node --test scripts/test/project-github-auth.test.mjs` (Windows): 9 pass, 0 fail.
- `prettier --check` (4 changed files): passed.
